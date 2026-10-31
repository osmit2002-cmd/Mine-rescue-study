/**
 * Pillar numbering. The scheme lives in pillar-numbering.json (the app-wide default, editable by any team) and can
 * be overridden per device in the builder. The default numbers the row of pillars just outby the FAB 0, 00 from
 * left to right, then every pillar inby the FAB 1, 2, …, N, left to right across each row, moving inby to the face.
 * Adding crosscuts or entries in the builder makes N larger.
 */
import DEFAULT_FILE from './pillar-numbering.json';
import { cellRect, cellState, cellType, type Geo } from './geometry';

export const NUMBERING_SCHEMA = 'mrs-pillar-numbering/1';

export type NumberOrder = 'rows' | 'columns';
export type NumberDirection = 'left-to-right' | 'right-to-left' | 'serpentine';

export interface PillarNumbering {
  schema: typeof NUMBERING_SCHEMA;
  name: string;
  about?: string;
  /** Draw pillar numbers on the map. */
  show: boolean;
  outby: {
    /** Labels for the pillars outby the FAB, left to right. */
    labels: string[];
    /** More outby pillars than labels: 'add-zero' continues 0, 00, 000…; 'none' leaves them unnumbered. */
    more: 'add-zero' | 'none';
  };
  inby: {
    start: number;
    step: number;
    /** 'rows': across each row of pillars, then the next row inby. 'columns': up each column from the FAB to the face, then the next column. */
    order: NumberOrder;
    /** Across a row (or which column comes first). 'serpentine' turns back at the end of each row or column. */
    direction: NumberDirection;
    prefix: string;
    suffix: string;
  };
  /** Number the coal blocks between the entries at the face (inby the last crosscut). */
  faceBlocks: boolean;
  /** Print the numbers on the blank team map too (maps are normally not labelled, General Information rule 7). */
  showOnBlankMap: boolean;
}

export interface PillarLabel {
  /** Cell column; cy is the cell row, -1 for the row outby the FAB. */
  cx: number;
  cy: number;
  label: string;
  /** Centre of the pillar, in feet (y may be negative outby the FAB). */
  x: number;
  y: number;
}

const str = (v: unknown, d: string, max = 20) => (typeof v === 'string' ? v.slice(0, max) : d);
const int = (v: unknown, d: number, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d);
const oneOf = <T extends string>(v: unknown, opts: readonly T[], d: T): T => (opts.includes(v as T) ? (v as T) : d);
const obj = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** Clean a numbering scheme from untrusted JSON. Missing fields take the built-in default's values. Throws if it is not a numbering file. */
export function normalizeNumbering(raw: unknown, base: PillarNumbering = BUILT_IN): PillarNumbering {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Not a pillar numbering file (expected a JSON object).');
  const r = raw as Record<string, unknown>;
  if (r.schema !== undefined && r.schema !== NUMBERING_SCHEMA) throw new Error(`Not a pillar numbering file (schema should be "${NUMBERING_SCHEMA}").`);
  const o = obj(r.outby);
  const i = obj(r.inby);
  return {
    schema: NUMBERING_SCHEMA,
    name: str(r.name, base.name, 120),
    ...(typeof r.about === 'string' ? { about: r.about.slice(0, 1000) } : {}),
    show: typeof r.show === 'boolean' ? r.show : base.show,
    outby: {
      labels: Array.isArray(o.labels) ? o.labels.filter((x): x is string => typeof x === 'string').map((x) => x.slice(0, 12)).slice(0, 24) : base.outby.labels,
      more: oneOf(o.more, ['add-zero', 'none'] as const, base.outby.more)
    },
    inby: {
      start: int(i.start, base.inby.start, -999, 9999),
      step: int(i.step, base.inby.step, 1, 100),
      order: oneOf(i.order, ['rows', 'columns'] as const, base.inby.order),
      direction: oneOf(i.direction, ['left-to-right', 'right-to-left', 'serpentine'] as const, base.inby.direction),
      prefix: str(i.prefix, base.inby.prefix),
      suffix: str(i.suffix, base.inby.suffix)
    },
    faceBlocks: typeof r.faceBlocks === 'boolean' ? r.faceBlocks : base.faceBlocks,
    showOnBlankMap: typeof r.showOnBlankMap === 'boolean' ? r.showOnBlankMap : base.showOnBlankMap
  };
}

const FALLBACK: PillarNumbering = {
  schema: NUMBERING_SCHEMA,
  name: '0, 00 outby the FAB, then 1 to N left to right, moving inby',
  show: true,
  outby: { labels: ['0', '00'], more: 'add-zero' },
  inby: { start: 1, step: 1, order: 'rows', direction: 'left-to-right', prefix: '', suffix: '' },
  faceBlocks: true,
  showOnBlankMap: false
};

/** The scheme in pillar-numbering.json (falls back to the same default if the file is damaged). */
export const BUILT_IN: PillarNumbering = (() => {
  try {
    return normalizeNumbering(DEFAULT_FILE, FALLBACK);
  } catch {
    return FALLBACK;
  }
})();

/** Label of the k-th outby pillar (0-based, left to right). */
function outbyLabel(n: PillarNumbering, k: number): string | null {
  const ls = n.outby.labels;
  if (k < ls.length) return ls[k] || null;
  if (n.outby.more === 'none' || !ls.length) return null;
  return ls[ls.length - 1] + '0'.repeat(k - ls.length + 1);
}

/**
 * Height of the drawn band of pillars outby the FAB (0 when the layout has none). The FAB is the crosscut just inby
 * them; they are outby the problem, so they are drawn cut in half by the edge of the map, as on contest maps.
 */
export const outbyBand = (g: Geo) => (g.layout.outbyPillars && g.E > 1 ? Math.round(g.layout.pillarLength / 2) : 0);

/** A pillar takes a number when at least one opening beside it is mined (solid coal all round is not a pillar). */
function isPillar(g: Geo, cx: number, cy: number): boolean {
  if (cellType(g, cx, cy) !== 'pillar' || cx === 0 || cx === 2 * g.E) return false;
  return [
    [cx - 1, cy],
    [cx + 1, cy],
    [cx, cy - 1],
    [cx, cy + 1]
  ].some(([x, y]) => y <= 2 * g.R - 1 && cellState(g, x, y) !== 'solid');
}

/** Every numbered pillar of a map, with its label and centre. */
export function pillarLabels(g: Geo, n: PillarNumbering): PillarLabel[] {
  const out: PillarLabel[] = [];
  const cols = Array.from({ length: g.E - 1 }, (_, i) => 2 * i + 2);
  if (g.layout.outbyPillars && cols.length) {
    cols.forEach((cx, k) => {
      const label = outbyLabel(n, k);
      if (label !== null) out.push({ cx, cy: -1, label, x: g.colX[cx] + g.colW[cx] / 2, y: -outbyBand(g) / 2 });
    });
  }
  const lastBand = n.faceBlocks ? 2 * g.R - 1 : 2 * g.R - 3;
  const bands: number[] = [];
  for (let cy = 1; cy <= lastBand; cy += 2) bands.push(cy);
  // Grid of cells in numbering order: outer loop is rows (or columns), inner loop goes across.
  const outer = n.inby.order === 'rows' ? bands : n.inby.direction === 'right-to-left' ? [...cols].reverse() : cols;
  let num = n.inby.start;
  outer.forEach((o, oi) => {
    let inner = n.inby.order === 'rows' ? [...cols] : [...bands];
    const reverse = n.inby.order === 'rows' ? n.inby.direction === 'right-to-left' || (n.inby.direction === 'serpentine' && oi % 2 === 1) : n.inby.direction === 'serpentine' && oi % 2 === 1;
    if (reverse) inner = inner.reverse();
    for (const v of inner) {
      const [cx, cy] = n.inby.order === 'rows' ? [v, o] : [o, v];
      if (!isPillar(g, cx, cy)) continue;
      const r = cellRect(g, cx, cy);
      out.push({ cx, cy, label: `${n.inby.prefix}${num}${n.inby.suffix}`, x: r.x + r.w / 2, y: r.y + r.h / 2 });
      num += n.inby.step;
    }
  });
  return out;
}

// ------------------------------------------------------------ device setting

export const NUMBERING_KEY = 'mrs.builder.pillarNumbering.v1';
type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function storage(): StorageLike | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

/** This device's scheme, or the built-in one from pillar-numbering.json. */
export function loadNumbering(store: StorageLike | null = storage()): PillarNumbering {
  try {
    const raw = store?.getItem(NUMBERING_KEY);
    return raw ? normalizeNumbering(JSON.parse(raw)) : BUILT_IN;
  } catch {
    return BUILT_IN;
  }
}

/** Save this device's scheme; null goes back to the built-in one. */
export function saveNumbering(n: PillarNumbering | null, store: StorageLike | null = storage()) {
  try {
    if (n) store?.setItem(NUMBERING_KEY, JSON.stringify(n));
    else store?.removeItem(NUMBERING_KEY);
  } catch {
    /* storage blocked: the scheme still applies until the page is reloaded */
  }
}
