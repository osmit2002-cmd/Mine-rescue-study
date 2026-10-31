/**
 * Editing the mine layout of a problem: add or remove entries (on either side) and crosscuts (at the face), change
 * sizes, and set each opening mined / projected / not mined. Placed items and opening overrides stay in the same
 * opening, at the same relative spot, when the grid around them changes; items in a removed entry or crosscut are
 * dropped and reported so the builder can ask first. Side rooms (side stubs off the outer entries) can be pulled
 * out one crosscut at a time, and a whole side can be taken off (depth 0) or put back.
 */
import { cellAt, cellKey, cellRect, cellType, makeGeo, type Geo } from './geometry';
import { entryName, LIMITS, sideDepth, xcName, type El, type Layout, type Problem, type SegState } from './model';

export type LayoutOp =
  | { type: 'add-entry'; side: 'left' | 'right' }
  | { type: 'remove-entry'; side: 'left' | 'right' }
  | { type: 'add-row' }
  | { type: 'remove-row' }
  | { type: 'set'; patch: Partial<Layout> }
  | { type: 'cell'; cx: number; cy: number; state: SegState }
  /** Pull a side room out of crosscut `row` to `depth` feet (the whole side's rooms share one depth), or close it (depth under 10). */
  | { type: 'room'; side: 'left' | 'right'; row: number; depth: number };

/** Shallowest side room; a drag shorter than this closes the room. */
export const MIN_ROOM = 10;

export interface LayoutResult {
  problem: Problem;
  /** Items that were in a removed entry or crosscut (not in the result). */
  lost: El[];
  /** The edit could not be made (at a size limit, or not an opening). */
  refused?: string;
}

/** Map from old cell index to new, or null when that column / row is removed. */
type IndexMap = (i: number) => number | null;
const same: IndexMap = (i) => i;

function remap(p: Problem, next: Layout, col: IndexMap, row: IndexMap): LayoutResult {
  const og = makeGeo(p.layout);
  const ng = makeGeo(next);
  const cells: Record<string, SegState> = {};
  for (const [k, v] of Object.entries(p.layout.cells)) {
    const [cx, cy] = k.split(',').map(Number);
    const nx = col(cx);
    const ny = row(cy);
    if (nx === null || ny === null || nx > 2 * ng.E || ny > 2 * ng.R - 1) continue;
    const t = cellType(ng, nx, ny);
    if (t !== 'pillar') cells[cellKey(nx, ny)] = v;
  }
  const lost: El[] = [];
  const elements: El[] = [];
  for (const e of p.elements) {
    const q = movePoint(og, ng, e.x, e.y, col, row);
    if (q) elements.push(q.x === e.x && q.y === e.y ? e : { ...e, ...q });
    else lost.push(e);
  }
  return { problem: { ...p, layout: { ...next, cells }, elements }, lost };
}

/** The same relative spot in the mapped cell, rounded to 0.1 ft. Points outside the map keep their offset from the nearest edge cell. */
export function movePoint(og: Geo, ng: Geo, x: number, y: number, col: IndexMap = same, row: IndexMap = same): { x: number; y: number } | null {
  const c = cellAt(og, Math.max(0, Math.min(og.width, x)), Math.max(0, Math.min(og.height, y)));
  if (!c) return { x, y };
  const nx = col(c.cx);
  const ny = row(c.cy);
  if (nx === null || ny === null) return null;
  const o = cellRect(og, c.cx, c.cy);
  const n = cellRect(ng, Math.min(nx, 2 * ng.E), Math.min(ny, 2 * ng.R - 1));
  const fx = o.w ? (x - o.x) / o.w : 0.5;
  const fy = o.h ? (y - o.y) / o.h : 0.5;
  const r = (v: number) => Math.round(v * 10) / 10;
  return { x: r(n.x + fx * n.w), y: r(n.y + fy * n.h) };
}

const clampTo = (v: number, [lo, hi]: readonly [number, number]) => Math.min(hi, Math.max(lo, Math.round(v)));

export function editLayout(p: Problem, op: LayoutOp): LayoutResult {
  const l = p.layout;
  const E = l.entries;
  const R = l.rows;
  const names = Array.from({ length: E }, (_, i) => l.entryNames[i] ?? '');
  const trimNames = (n: string[]) => (n.some((x) => x.trim()) ? n : []);
  switch (op.type) {
    case 'add-entry': {
      if (E >= LIMITS.entries[1]) return { problem: p, lost: [], refused: `A map can have at most ${LIMITS.entries[1]} entries.` };
      const next = { ...l, entries: E + 1 };
      if (op.side === 'right') return remap(p, { ...next, entryNames: trimNames([...names, '']) }, (cx) => (cx === 2 * E ? 2 * E + 2 : cx), same);
      return remap(p, { ...next, entryNames: trimNames(['', ...names]) }, (cx) => (cx === 0 ? 0 : cx + 2), same);
    }
    case 'remove-entry': {
      if (E <= LIMITS.entries[0]) return { problem: p, lost: [], refused: 'A map needs at least one entry.' };
      const next = { ...l, entries: E - 1 };
      if (op.side === 'right') return remap(p, { ...next, entryNames: trimNames(names.slice(0, -1)) }, (cx) => (cx === 2 * E ? 2 * E - 2 : cx >= 2 * E - 2 ? null : cx), same);
      return remap(p, { ...next, entryNames: trimNames(names.slice(1)) }, (cx) => (cx === 0 ? 0 : cx <= 2 ? null : cx - 2), same);
    }
    case 'add-row': {
      if (R >= LIMITS.rows[1]) return { problem: p, lost: [], refused: `A map can have at most ${LIMITS.rows[1] - 1} crosscuts inby the FAB.` };
      // The new crosscut goes in just outby the face: the stubs (and anything at the face) move inby with it.
      return remap(p, { ...l, rows: R + 1 }, same, (cy) => (cy === 2 * R - 1 ? 2 * R + 1 : cy));
    }
    case 'remove-row': {
      if (R <= LIMITS.rows[0]) return { problem: p, lost: [], refused: 'A map needs at least one crosscut inby the FAB.' };
      return remap(p, { ...l, rows: R - 1 }, same, (cy) => (cy === 2 * R - 1 ? 2 * R - 3 : cy >= 2 * R - 3 ? null : cy));
    }
    case 'set': {
      const patch = op.patch;
      let res: LayoutResult = { problem: p, lost: [] };
      const step = (o: LayoutOp) => {
        const r = editLayout(res.problem, o);
        res = { problem: r.problem, lost: [...res.lost, ...r.lost], refused: r.refused ?? res.refused };
      };
      // Entry and crosscut counts typed in the panel add or remove on the right and at the face.
      if (patch.entries !== undefined) {
        const want = clampTo(patch.entries, LIMITS.entries);
        while (res.problem.layout.entries < want) step({ type: 'add-entry', side: 'right' });
        while (res.problem.layout.entries > want) step({ type: 'remove-entry', side: 'right' });
      }
      if (patch.rows !== undefined) {
        const want = clampTo(patch.rows, LIMITS.rows);
        while (res.problem.layout.rows < want) step({ type: 'add-row' });
        while (res.problem.layout.rows > want) step({ type: 'remove-row' });
      }
      const cur = res.problem.layout;
      const sized: Layout = { ...cur, ...patch, entries: cur.entries, rows: cur.rows, cells: cur.cells };
      // Sizes are only capped above here: a field being typed in passes through small values ("8" on the way to "80").
      // Loading a problem applies the full limits (normalizeProblem).
      const size = (v: number, lim: readonly [number, number]) => clampTo(v, [1, lim[1]]);
      if (patch.entryWidth !== undefined) sized.entryWidth = size(patch.entryWidth, LIMITS.entryWidth);
      if (patch.pillarWidth !== undefined) sized.pillarWidth = size(patch.pillarWidth, LIMITS.pillar);
      if (patch.pillarLength !== undefined) sized.pillarLength = size(patch.pillarLength, LIMITS.pillar);
      if (patch.stubLength !== undefined) sized.stubLength = size(patch.stubLength, LIMITS.stub);
      // The side rooms used to follow the face stub depth: keep them where they are when only the face stubs change.
      if (patch.stubLength !== undefined) {
        sized.sideLeft = patch.sideLeft ?? sideDepth(cur, 'left');
        sized.sideRight = patch.sideRight ?? sideDepth(cur, 'right');
      }
      if (patch.sideLeft !== undefined) sized.sideLeft = clampTo(patch.sideLeft, LIMITS.side);
      if (patch.sideRight !== undefined) sized.sideRight = clampTo(patch.sideRight, LIMITS.side);
      // Taking a side's rooms off drops what was in them (and their mined / not mined settings).
      const goneL = sideDepth(cur, 'left') > 0 && sideDepth(sized, 'left') === 0;
      const goneR = sideDepth(cur, 'right') > 0 && sideDepth(sized, 'right') === 0;
      const lastCol = 2 * cur.entries;
      const r = remap(res.problem, sized, (cx) => ((cx === 0 && goneL) || (cx === lastCol && goneR) ? null : cx), same);
      return { problem: r.problem, lost: [...res.lost, ...r.lost], refused: res.refused };
    }
    case 'cell': {
      const g = makeGeo(l);
      if (op.cx < 0 || op.cy < 0 || op.cx > 2 * E || op.cy > 2 * R - 1) return { problem: p, lost: [], refused: 'Outside the map.' };
      const t = cellType(g, op.cx, op.cy);
      if (t === 'pillar' || t === 'int') return { problem: p, lost: [], refused: t === 'pillar' ? 'Pillars are solid.' : 'An intersection follows the openings around it.' };
      return { problem: { ...p, layout: { ...l, cells: { ...l.cells, [cellKey(op.cx, op.cy)]: op.state } } }, lost: [] };
    }
    case 'room': {
      if (op.row < 1 || op.row >= R) return { problem: p, lost: [], refused: 'Side rooms come off a crosscut inby the FAB.' };
      const cx = op.side === 'left' ? 0 : 2 * E;
      const key = cellKey(cx, 2 * op.row);
      if (op.depth < MIN_ROOM) return { problem: { ...p, layout: { ...l, cells: { ...l.cells, [key]: 'solid' } } }, lost: [] };
      const depth = clampTo(op.depth, [MIN_ROOM, LIMITS.side[1]]);
      const opened = { ...p, layout: { ...l, cells: { ...l.cells, [key]: 'open' as SegState } } };
      return editLayout(opened, { type: 'set', patch: op.side === 'left' ? { sideLeft: depth } : { sideRight: depth } });
    }
  }
}

/** Mined / projected / not mined of an opening as the builder shows it (the default when not overridden). */
export function openingState(l: Layout, cx: number, cy: number): SegState {
  const g = makeGeo(l);
  const t = cellType(g, cx, cy);
  return l.cells[cellKey(cx, cy)] ?? (t === 'side' ? (cy === 0 ? 'open' : 'solid') : 'open');
}

/** Readable name of an opening cell, mined or not, e.g. "Crosscut 2 between No. 1 Entry and No. 2 Entry". */
export function openingName(l: Layout, cx: number, cy: number): string {
  const g = makeGeo(l);
  const r = Math.floor(cy / 2);
  switch (cellType(g, cx, cy)) {
    case 'entry':
      return r === 0 ? `${entryName(l, (cx - 1) / 2)} between the FAB and ${xcName(l, 1)}` : `${entryName(l, (cx - 1) / 2)} between ${xcName(l, r)} and ${xcName(l, r + 1)}`;
    case 'stub':
      return `${entryName(l, (cx - 1) / 2)} inby ${xcName(l, g.R - 1)}`;
    case 'xc':
      return `${xcName(l, r)} between ${entryName(l, cx / 2 - 1)} and ${entryName(l, cx / 2)}`;
    case 'side':
      return cx === 0 ? `${xcName(l, r)} left of ${entryName(l, 0)}` : `${xcName(l, r)} right of ${entryName(l, g.E - 1)}`;
    case 'int':
      return `${entryName(l, (cx - 1) / 2)} at ${xcName(l, r)}`;
    default:
      return 'Pillar';
  }
}
