/**
 * Map geometry: the cell grid behind a Layout, the openings as a graph (intersections = nodes, entry and
 * crosscut segments = edges) and where each element sits in it.
 *
 * Cell columns cx: 0 = left side stub, 2i+1 = entry i, 2i+2 = pillar column between entries i and i+1, 2E = right side stub.
 * Cell rows cy: 2r = crosscut row r (row 0 is the FAB), 2r+1 = pillar band above row r, 2R-1 = inby stub band.
 */
import { entryName, sideDepth, xcName, type El, type Layout, type SegState } from './model';

export type CellType = 'int' | 'entry' | 'stub' | 'xc' | 'side' | 'pillar';

export interface Geo {
  layout: Layout;
  E: number;
  R: number;
  /** Left x and width of each column; bottom y and height of each row. */
  colX: number[];
  colW: number[];
  rowY: number[];
  rowH: number[];
  width: number;
  height: number;
}

export function makeGeo(layout: Layout): Geo {
  const E = layout.entries;
  const R = layout.rows;
  const colW: number[] = [];
  for (let cx = 0; cx <= 2 * E; cx++) colW.push(cx === 0 ? sideDepth(layout, 'left') : cx === 2 * E ? sideDepth(layout, 'right') : cx % 2 === 1 ? layout.entryWidth : layout.pillarWidth);
  const rowH: number[] = [];
  for (let cy = 0; cy <= 2 * R - 1; cy++) rowH.push(cy === 2 * R - 1 ? layout.stubLength : cy % 2 === 0 ? layout.entryWidth : layout.pillarLength);
  const colX: number[] = [];
  let x = 0;
  for (const w of colW) {
    colX.push(x);
    x += w;
  }
  const rowY: number[] = [];
  let y = 0;
  for (const h of rowH) {
    rowY.push(y);
    y += h;
  }
  return { layout, E, R, colX, colW, rowY, rowH, width: x, height: y };
}

export function cellType(g: Geo, cx: number, cy: number): CellType {
  const side = cx === 0 || cx === 2 * g.E;
  const top = cy === 2 * g.R - 1;
  if (cx % 2 === 1) return cy % 2 === 0 ? 'int' : top ? 'stub' : 'entry';
  if (cy % 2 === 0) return side ? 'side' : 'xc';
  return 'pillar';
}

export const cellKey = (cx: number, cy: number) => `${cx},${cy}`;

/** Default state of an unedited cell: openings are mined, side stubs are solid except along the FAB row. */
export function defaultCellState(g: Geo, cx: number, cy: number): SegState {
  const t = cellType(g, cx, cy);
  if (t === 'pillar') return 'solid';
  if (t === 'side') return cy === 0 ? 'open' : 'solid';
  return 'open';
}

export function cellState(g: Geo, cx: number, cy: number): SegState {
  if (cx < 0 || cy < 0 || cx > 2 * g.E || cy > 2 * g.R - 1) return 'solid';
  const t = cellType(g, cx, cy);
  if (t === 'pillar' || (t === 'side' && !g.colW[cx])) return 'solid';
  const o = g.layout.cells[cellKey(cx, cy)];
  if (t === 'int') {
    if (o) return o;
    // An intersection is mined if any opening reaches it: solid-line if any is solid-line, dotted if all are dotted.
    const around = [cellStateRaw(g, cx, cy + 1), cellStateRaw(g, cx, cy - 1), cellStateRaw(g, cx - 1, cy), cellStateRaw(g, cx + 1, cy)];
    if (around.includes('open')) return 'open';
    if (around.includes('projected')) return 'projected';
    return 'solid';
  }
  return o ?? defaultCellState(g, cx, cy);
}

function cellStateRaw(g: Geo, cx: number, cy: number): SegState {
  if (cx < 0 || cy < 0 || cx > 2 * g.E || cy > 2 * g.R - 1) return 'solid';
  const t = cellType(g, cx, cy);
  if (t === 'pillar' || t === 'int' || (t === 'side' && !g.colW[cx])) return 'solid';
  return g.layout.cells[cellKey(cx, cy)] ?? defaultCellState(g, cx, cy);
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const cellRect = (g: Geo, cx: number, cy: number): Rect => ({ x: g.colX[cx], y: g.rowY[cy], w: g.colW[cx], h: g.rowH[cy] });

export function cellAt(g: Geo, x: number, y: number): { cx: number; cy: number } | null {
  if (x < 0 || y < 0 || x > g.width || y > g.height) return null;
  let cx = g.colX.findIndex((c, i) => x >= c && x <= c + g.colW[i]);
  let cy = g.rowY.findIndex((c, i) => y >= c && y <= c + g.rowH[i]);
  if (cx < 0) cx = 2 * g.E;
  if (cy < 0) cy = 2 * g.R - 1;
  return { cx, cy };
}

export const entryX = (g: Geo, i: number) => g.colX[2 * i + 1] + g.layout.entryWidth / 2;
export const rowYc = (g: Geo, r: number) => g.rowY[2 * r] + g.layout.entryWidth / 2;

/** A rib line between an open cell and solid ground (or the map edge). */
export interface RibLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  dotted: boolean;
}

/** All rib lines of the map. Lines along the bottom and outer sides of the FAB row are left open (the FAB continues outby). */
export function ribLines(g: Geo): RibLine[] {
  const out: RibLine[] = [];
  const maxCx = 2 * g.E;
  const maxCy = 2 * g.R - 1;
  for (let cx = 0; cx <= maxCx; cx++) {
    for (let cy = 0; cy <= maxCy; cy++) {
      const s = cellState(g, cx, cy);
      if (s === 'solid') continue;
      const r = cellRect(g, cx, cy);
      const dotted = s === 'projected';
      const sides: [number, number, number, number, number, number][] = [
        [cx, cy + 1, r.x, r.y + r.h, r.x + r.w, r.y + r.h],
        [cx, cy - 1, r.x, r.y, r.x + r.w, r.y],
        [cx - 1, cy, r.x, r.y, r.x, r.y + r.h],
        [cx + 1, cy, r.x + r.w, r.y, r.x + r.w, r.y + r.h]
      ];
      for (const [nx, ny, x1, y1, x2, y2] of sides) {
        if (ny < 0) continue; // outby edge of the FAB row
        if (cy === 0 && (nx < 0 || nx > maxCx)) continue; // FAB row continues outward
        const ns = cellState(g, nx, ny);
        if (ns === 'solid') out.push({ x1, y1, x2, y2, dotted });
        // A projected opening ending at map edge stays open-ended; solid-line ones end at a face (handled above).
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------- topology

export type Port = 'N' | 'S' | 'E' | 'W';

export interface TNode {
  id: string;
  /** Entry index and crosscut row, or -1 for the side stubs' ends. */
  i: number;
  r: number;
  x: number;
  y: number;
  /** In the FAB row. */
  fab: boolean;
  /** A dead end (face or end of a stub), not an intersection. */
  end: boolean;
  state: SegState;
}

export interface TEdge {
  id: string;
  a: string;
  b: string;
  /** Port of a / b used by this edge. */
  pa: Port;
  pb: Port;
  cx: number;
  cy: number;
  type: 'entry' | 'stub' | 'xc' | 'side';
  state: SegState;
  /** Centreline from a to b. */
  ax: number;
  ay: number;
  bx: number;
  by: number;
  len: number;
  vertical: boolean;
}

export interface Topo {
  geo: Geo;
  nodes: Map<string, TNode>;
  edges: Map<string, TEdge>;
  /** Edges at each node, by port. */
  ports: Map<string, Partial<Record<Port, string>>>;
}

export const nodeId = (i: number, r: number) => `n${i}:${r}`;

export function buildTopo(g: Geo): Topo {
  const nodes = new Map<string, TNode>();
  const edges = new Map<string, TEdge>();
  const ports = new Map<string, Partial<Record<Port, string>>>();
  for (let i = 0; i < g.E; i++) {
    for (let r = 0; r < g.R; r++) {
      const st = cellState(g, 2 * i + 1, 2 * r);
      if (st === 'solid') continue;
      const id = nodeId(i, r);
      nodes.set(id, { id, i, r, x: entryX(g, i), y: rowYc(g, r), fab: r === 0, end: false, state: st });
      ports.set(id, {});
    }
  }
  const addEdge = (e: Omit<TEdge, 'len' | 'vertical'>) => {
    const len = Math.hypot(e.bx - e.ax, e.by - e.ay);
    const edge: TEdge = { ...e, len, vertical: e.ax === e.bx };
    edges.set(e.id, edge);
    ports.get(e.a)![e.pa] = e.id;
    if (ports.has(e.b)) ports.get(e.b)![e.pb] = e.id;
  };
  const addEnd = (id: string, i: number, r: number, x: number, y: number, st: SegState) => {
    nodes.set(id, { id, i, r, x, y, fab: false, end: true, state: st });
    ports.set(id, {});
  };
  for (let i = 0; i < g.E; i++) {
    const cx = 2 * i + 1;
    for (let r = 0; r < g.R; r++) {
      const a = nodeId(i, r);
      if (!nodes.has(a)) continue;
      // Entry segment inby (or inby stub at the last row).
      const cy = 2 * r + 1;
      const st = cellState(g, cx, cy);
      if (st !== 'solid') {
        if (r < g.R - 1) {
          const b = nodeId(i, r + 1);
          if (nodes.has(b)) addEdge({ id: `e${cx},${cy}`, a, b, pa: 'N', pb: 'S', cx, cy, type: 'entry', state: st, ax: entryX(g, i), ay: rowYc(g, r), bx: entryX(g, i), by: rowYc(g, r + 1) });
        } else {
          const endId = `t${i}`;
          const y = g.height;
          addEnd(endId, i, g.R, entryX(g, i), y, st);
          addEdge({ id: `e${cx},${cy}`, a, b: endId, pa: 'N', pb: 'S', cx, cy, type: 'stub', state: st, ax: entryX(g, i), ay: rowYc(g, r), bx: entryX(g, i), by: y });
        }
      }
      // Crosscut to the right (or right side stub).
      const xcx = 2 * i + 2;
      const xst = cellState(g, xcx, 2 * r);
      if (xst !== 'solid') {
        if (i < g.E - 1) {
          const b = nodeId(i + 1, r);
          if (nodes.has(b)) addEdge({ id: `e${xcx},${2 * r}`, a, b, pa: 'E', pb: 'W', cx: xcx, cy: 2 * r, type: 'xc', state: xst, ax: entryX(g, i), ay: rowYc(g, r), bx: entryX(g, i + 1), by: rowYc(g, r) });
        } else if (r > 0) {
          const endId = `sR${r}`;
          addEnd(endId, -1, r, g.width, rowYc(g, r), xst);
          addEdge({ id: `e${xcx},${2 * r}`, a, b: endId, pa: 'E', pb: 'W', cx: xcx, cy: 2 * r, type: 'side', state: xst, ax: entryX(g, i), ay: rowYc(g, r), bx: g.width, by: rowYc(g, r) });
        }
      }
      // Left side stub off entry 0.
      if (i === 0 && r > 0) {
        const sst = cellState(g, 0, 2 * r);
        if (sst !== 'solid') {
          const endId = `sL${r}`;
          addEnd(endId, -1, r, 0, rowYc(g, r), sst);
          addEdge({ id: `e0,${2 * r}`, a, b: endId, pa: 'W', pb: 'E', cx: 0, cy: 2 * r, type: 'side', state: sst, ax: entryX(g, i), ay: rowYc(g, r), bx: 0, by: rowYc(g, r) });
        }
      }
    }
  }
  return { geo: g, nodes, edges, ports };
}

// ---------------------------------------------------------------- locations

export type Loc = { type: 'node'; node: string } | { type: 'edge'; edge: string; s: number } | { type: 'none' };

/** Where an element is: in an intersection, along an edge (s = feet from end a), or outside the openings. */
export function locate(t: Topo, x: number, y: number): Loc {
  const c = cellAt(t.geo, x, y);
  if (!c) return { type: 'none' };
  const ty = cellType(t.geo, c.cx, c.cy);
  if (ty === 'pillar' || cellState(t.geo, c.cx, c.cy) === 'solid') return { type: 'none' };
  if (ty === 'int') {
    const id = nodeId((c.cx - 1) / 2, c.cy / 2);
    return t.nodes.has(id) ? { type: 'node', node: id } : { type: 'none' };
  }
  if (c.cy === 0 && ty === 'side') {
    // The FAB row past the outer entries counts as the FAB at that entry.
    const id = nodeId(c.cx === 0 ? 0 : t.geo.E - 1, 0);
    return t.nodes.has(id) ? { type: 'node', node: id } : { type: 'none' };
  }
  const e = t.edges.get(`e${c.cx},${c.cy}`);
  if (!e) return { type: 'none' };
  const s = e.vertical ? (y - e.ay) * Math.sign(e.by - e.ay) : (x - e.ax) * Math.sign(e.bx - e.ax);
  return { type: 'edge', edge: e.id, s: Math.max(0, Math.min(e.len, s)) };
}

/** Readable place name, e.g. "No. 2 Entry between Crosscut 1 and Crosscut 2". */
export function locName(t: Topo, loc: Loc): string {
  const l = t.geo.layout;
  if (loc.type === 'none') return 'outside the mine workings';
  if (loc.type === 'node') return nodeName(t, loc.node);
  const e = t.edges.get(loc.edge)!;
  const a = t.nodes.get(e.a)!;
  const b = t.nodes.get(e.b)!;
  switch (e.type) {
    case 'entry':
      return a.r === 0 ? `${entryName(l, a.i)} between the FAB and ${xcName(l, b.r)}` : `${entryName(l, a.i)} between ${xcName(l, a.r)} and ${xcName(l, b.r)}`;
    case 'stub':
      return `${entryName(l, a.i)} inby ${xcName(l, a.r)}`;
    case 'xc':
      return a.r === 0 ? `FAB between ${entryName(l, a.i)} and ${entryName(l, b.i)}` : `${xcName(l, a.r)} between ${entryName(l, a.i)} and ${entryName(l, b.i)}`;
    case 'side':
      return `${xcName(l, a.r)} ${b.x < a.x ? 'left' : 'right'} of ${entryName(l, a.i)}`;
  }
}

export function nodeName(t: Topo, id: string): string {
  const n = t.nodes.get(id);
  if (!n) return id;
  const l = t.geo.layout;
  if (n.end) return n.r === t.geo.R ? `${entryName(l, n.i)} inby end` : `end of ${xcName(l, n.r)} ${n.x === 0 ? 'left' : 'right'} side`;
  if (n.fab) return `FAB at ${entryName(l, n.i)}`;
  return `${entryName(l, n.i)} at ${xcName(l, n.r)}`;
}

/** Point on an edge s feet from its a end. */
export function edgePoint(e: TEdge, s: number): { x: number; y: number } {
  const f = e.len ? s / e.len : 0;
  return { x: e.ax + (e.bx - e.ax) * f, y: e.ay + (e.by - e.ay) * f };
}

export interface Snap {
  x: number;
  y: number;
  /** Rotation for "across" symbols: 0 when the opening runs up the map (line drawn left–right), 90 when it runs across. */
  rot: number;
}

/**
 * Snap a click to the openings for an element with this placement: across symbols go onto the centreline of
 * the nearest entry or crosscut (never an intersection), diagonals and overcasts onto an intersection centre,
 * other objects anywhere inside an opening. Returns null if there is no opening near the point.
 */
export function snap(t: Topo, x: number, y: number, place: 'across' | 'diagonal' | 'node' | 'point'): Snap | null {
  const g = t.geo;
  const W = g.layout.entryWidth;
  const c = cellAt(g, Math.max(0, Math.min(g.width, x)), Math.max(0, Math.min(g.height, y)));
  const r1 = (v: number) => Math.round(v);
  if (place === 'diagonal' || place === 'node') {
    let best: TNode | null = null;
    let bd = Infinity;
    for (const n of t.nodes.values()) {
      if (n.end) continue;
      const d = Math.hypot(n.x - x, n.y - y);
      if (d < bd) {
        bd = d;
        best = n;
      }
    }
    return best && bd < W * 2.5 ? { x: best.x, y: best.y, rot: 0 } : null;
  }
  // Nearest open (non-pillar) cell to the point.
  let target = c && cellState(g, c.cx, c.cy) !== 'solid' && cellType(g, c.cx, c.cy) !== 'pillar' ? c : null;
  if (!target) {
    let bd = Infinity;
    for (let cx = 0; cx <= 2 * g.E; cx++)
      for (let cy = 0; cy <= 2 * g.R - 1; cy++) {
        if (cellState(g, cx, cy) === 'solid') continue;
        const rc = cellRect(g, cx, cy);
        const dx = Math.max(rc.x - x, 0, x - (rc.x + rc.w));
        const dy = Math.max(rc.y - y, 0, y - (rc.y + rc.h));
        const d = Math.hypot(dx, dy);
        if (d < bd) {
          bd = d;
          target = { cx, cy };
        }
      }
    if (!target || bd > W * 1.5) return null;
  }
  const ty = cellType(g, target.cx, target.cy);
  if (place === 'across' && ty === 'int') {
    // Move into the adjacent opening nearest to the point, just outside the intersection's imaginary rib line.
    const rc = cellRect(g, target.cx, target.cy);
    const dx = x - (rc.x + rc.w / 2);
    const dy = y - (rc.y + rc.h / 2);
    const sx = dx < 0 ? -1 : 1;
    const sy = dy < 0 ? -1 : 1;
    const order: [number, number][] = Math.abs(dx) > Math.abs(dy) ? [[sx, 0], [0, sy], [0, -sy], [-sx, 0]] : [[0, sy], [sx, 0], [-sx, 0], [0, -sy]];
    const ok = order.find(([ox, oy]) => cellState(g, target!.cx + ox, target!.cy + oy) !== 'solid' && !(target!.cy === 0 && oy < 0));
    if (!ok) return null;
    const [ox, oy] = ok;
    const rc2 = cellRect(g, target.cx + ox, target.cy + oy);
    if (oy !== 0) return { x: rc2.x + rc2.w / 2, y: oy > 0 ? rc2.y + 2 : rc2.y + rc2.h - 2, rot: 0 };
    return { x: ox > 0 ? rc2.x + 2 : rc2.x + rc2.w - 2, y: rc2.y + rc2.h / 2, rot: 90 };
  }
  const rc = cellRect(g, target.cx, target.cy);
  const cxp = Math.max(rc.x + 1, Math.min(rc.x + rc.w - 1, x));
  const cyp = Math.max(rc.y + 1, Math.min(rc.y + rc.h - 1, y));
  if (place === 'across') {
    if (ty === 'entry' || ty === 'stub') return { x: rc.x + rc.w / 2, y: r1(cyp), rot: 0 };
    return { x: r1(cxp), y: rc.y + rc.h / 2, rot: 90 };
  }
  return { x: r1(cxp), y: r1(cyp), rot: ty === 'xc' || ty === 'side' ? 90 : 0 };
}

/** Rotation for an across symbol at (x, y): 0 in entries, 90 in crosscuts. */
export function acrossRot(g: Geo, x: number, y: number): number {
  const c = cellAt(g, x, y);
  if (!c) return 0;
  const ty = cellType(g, c.cx, c.cy);
  return ty === 'xc' || ty === 'side' ? 90 : 0;
}

/** Where every element is. Elements outside the openings get { type: 'none' }. */
export function locateAll(t: Topo, els: El[]): Map<string, Loc> {
  const m = new Map<string, Loc>();
  for (const e of els) m.set(e.id, locate(t, e.x, e.y));
  return m;
}
