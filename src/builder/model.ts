/**
 * Mine rescue problem model: a blank map (entries, crosscuts, equal pillars) plus the placards and objects
 * placed on it. All distances are in feet; x runs left to right, y runs from the fresh air base (outby) inby.
 *
 * The map is a grid of cells. Columns alternate side stub, entry, pillar, entry, …, entry, side stub.
 * Rows alternate crosscut row, pillar band, crosscut row, …, last crosscut row, inby stub band.
 * Row 0 is the fresh air base (FAB).
 */
import { KIND_DEFS, type Kind } from './catalog';

export type SegState = 'open' | 'solid' | 'projected';

export interface Layout {
  /** Number of entries (columns of openings). */
  entries: number;
  /** Number of crosscut rows, counting the FAB row (row 0). */
  rows: number;
  /** Width of entries and crosscuts, in feet. */
  entryWidth: number;
  /** Pillar size across the entries (x) and along them (y), in feet. All pillar blocks are equal size (General Information rule 7). */
  pillarWidth: number;
  pillarLength: number;
  /** Depth of the inby stubs (entries past the last crosscut), in feet; also of the side rooms unless sideLeft / sideRight say otherwise. */
  stubLength: number;
  /**
   * Depth of the side rooms (side stubs off the outer entries) on the left and right, in feet. 0 = no side rooms on
   * that side. Unset = stubLength (problems saved before these existed).
   */
  sideLeft?: number;
  sideRight?: number;
  /** Cell state overrides, keyed "cx,cy". Unlisted cells use defaultCellState. */
  cells: Record<string, SegState>;
  /** Entry names, left to right. Blank entries are named "No. N Entry". */
  entryNames: string[];
  /** Number printed for crosscut row 0 (the FAB row). Row r is crosscut xcStart + r. */
  xcStart: number;
  /**
   * Draw the row of pillars just outby the FAB (between the entries, below row 0). Drawing only: the team does
   * not explore outby the FAB, so these pillars are not part of the openings graph. They carry the first pillar
   * numbers (0, 00 in the default scheme, see pillars.ts).
   */
  outbyPillars: boolean;
}

/** One placard, object or condition on the map. Optional fields apply only to some kinds (see catalog.ts). */
export interface El {
  id: string;
  kind: Kind;
  x: number;
  y: number;
  /** Placard wording, verbatim. Mapped beside the symbol. */
  text?: string;
  /** Gas placard readings: % CH4, PPM CO, % O2. */
  ch4?: number;
  co?: number;
  o2?: number;
  /** Stoppings, seals, barricades, overcasts: found intact / airtight. */
  intact?: boolean;
  airtight?: boolean;
  /** Door: open (true) or closed. */
  open?: boolean;
  /** Condition extends from rib to rib (across the opening). */
  across?: boolean;
  /** Length of the condition along the opening, in feet. */
  len?: number;
  /** Water: over knee deep; roofed (water to the roof, airtight). */
  overKnee?: boolean;
  roofed?: boolean;
  /** Smoke density as printed. */
  density?: '' | 'light' | 'dense';
  /** Live person: conscious. */
  conscious?: boolean;
  /** Direction in degrees, 0 = inby (up the map), 90 = right. Body head, air movement, refuge alternative door. */
  dir?: number;
  /** Diagonal: '/' joins the outby-left and inby-right corners; '\' the inby-left and outby-right corners. */
  diag?: '/' | '\\';
  /** Fire: can be put out with the team's extinguisher. */
  extinguishable?: boolean;
  /** Equipment, cable or battery is energized (an ignition source, Rule 31). */
  energized?: boolean;
  /** Other object ("X") type. */
  sub?: XSub;
  /** Timbers or other material: quantity found. */
  count?: number;
  /** Fan. */
  fanMode?: 'exhausting' | 'blowing';
  on?: boolean;
  /** Barricade: a person behind it answers (verbal contact). */
  response?: boolean;
  /** Shown on the blank team map before the problem starts (FAB objects and air shafts, A Card rule 5B). */
  preMapped?: boolean;
  /** Free notes for the problem designer (not on the placard). */
  note?: string;
}

export type XSub =
  | 'lunch-pail'
  | 'note'
  | 'timbers'
  | 'pump'
  | 'equipment'
  | 'cable'
  | 'battery'
  | 'borehole'
  | 'shaft'
  | 'outby'
  | 'face'
  | 'old-works'
  | 'materials'
  | 'other';

export interface Problem {
  schema: 'mrs-problem/1';
  id: string;
  title: string;
  /** Where the problem came from (e.g. "Rule book Figure 7", a contest name). */
  source?: string;
  /** The statement read or given to the team before the clock starts. */
  statement: string;
  /** Written instructions given after the clock starts (Rule 50). */
  instructions: string;
  /** Number of missing persons the team must account for. */
  missing: number;
  /** Time limit in minutes; 0 = no limit (calculated average time, A Card rule 3). */
  timeLimit: number;
  /** The FAB is open to fresh outby air (the default). */
  fabFresh: boolean;
  /** The briefing officer / CCA is outside (on the surface), not at the FAB: the FAB need not stay respirable (Rule 30). */
  boOutside?: boolean;
  /** Materials the team may take from the FAB, as stated in the problem. */
  fabMaterials: { timbers: number; pump: boolean; brattice: boolean; lineCurtain: boolean };
  /** Designer's answer notes (key points, expected discounts). */
  keyNotes: string;
  layout: Layout;
  elements: El[];
  updated: string;
}

export const SCHEMA = 'mrs-problem/1';

export const LIMITS = { entries: [1, 12], rows: [2, 24], entryWidth: [10, 40], pillar: [20, 200], stub: [10, 200], side: [0, 200] } as const;

/** Depth of the side rooms on one side, in feet (0 = none). */
export const sideDepth = (l: Layout, side: 'left' | 'right') => (side === 'left' ? l.sideLeft : l.sideRight) ?? l.stubLength;

export function newId(prefix = 'e'): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export function defaultLayout(entries = 3, rows = 6): Layout {
  return { entries, rows, entryWidth: 20, pillarWidth: 60, pillarLength: 60, stubLength: 40, cells: {}, entryNames: [], xcStart: 0, outbyPillars: true };
}

export function blankProblem(title = 'New problem'): Problem {
  return {
    schema: SCHEMA,
    id: newId('p'),
    title,
    statement: '',
    instructions: '',
    missing: 0,
    timeLimit: 0,
    fabFresh: true,
    fabMaterials: { timbers: 0, pump: false, brattice: true, lineCurtain: false },
    keyNotes: '',
    layout: defaultLayout(),
    elements: [],
    updated: new Date().toISOString()
  };
}

export function entryName(l: Layout, i: number): string {
  const n = l.entryNames[i]?.trim();
  return n || `No. ${i + 1} Entry`;
}

export function xcName(l: Layout, r: number): string {
  return r === 0 ? (l.xcStart ? `FAB (Crosscut ${l.xcStart})` : 'FAB') : `Crosscut ${l.xcStart + r}`;
}

const clamp = (v: unknown, [lo, hi]: readonly [number, number], dflt: number) => {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : dflt;
  return Math.min(hi, Math.max(lo, Math.round(n)));
};
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
const bool = (v: unknown) => (typeof v === 'boolean' ? v : undefined);

const X_SUBS: XSub[] = ['lunch-pail', 'note', 'timbers', 'pump', 'equipment', 'cable', 'battery', 'borehole', 'shaft', 'outby', 'face', 'old-works', 'materials', 'other'];

/** Clean one element from untrusted JSON. Returns null when it is not usable. */
export function normalizeElement(raw: unknown): El | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const kind = str(r.kind) as Kind | undefined;
  if (!kind || !KIND_DEFS[kind]) return null;
  const x = num(r.x);
  const y = num(r.y);
  if (x === undefined || y === undefined) return null;
  const el: El = { id: str(r.id) || newId(), kind, x, y };
  const s = (k: 'text' | 'note') => {
    const v = str(r[k]);
    if (v !== undefined) el[k] = v.slice(0, 2000);
  };
  s('text');
  s('note');
  for (const k of ['ch4', 'co', 'o2', 'len', 'dir', 'count'] as const) {
    const v = num(r[k]);
    if (v !== undefined) el[k] = v;
  }
  for (const k of ['intact', 'airtight', 'open', 'across', 'overKnee', 'roofed', 'conscious', 'extinguishable', 'energized', 'on', 'response', 'preMapped'] as const) {
    const v = bool(r[k]);
    if (v !== undefined) el[k] = v;
  }
  if (r.density === 'light' || r.density === 'dense' || r.density === '') el.density = r.density;
  if (r.diag === '/' || r.diag === '\\') el.diag = r.diag;
  if (r.fanMode === 'exhausting' || r.fanMode === 'blowing') el.fanMode = r.fanMode;
  if (X_SUBS.includes(r.sub as XSub)) el.sub = r.sub as XSub;
  return el;
}

/** Clean a whole problem from untrusted JSON (an import or localStorage). Throws with a readable message if it is not a problem. */
export function normalizeProblem(raw: unknown): Problem {
  if (!raw || typeof raw !== 'object') throw new Error('Not a problem file (expected a JSON object).');
  const r = raw as Record<string, unknown>;
  if (r.schema !== SCHEMA) throw new Error(`Not a problem file (schema should be "${SCHEMA}").`);
  const lr = (r.layout && typeof r.layout === 'object' ? r.layout : {}) as Record<string, unknown>;
  const d = defaultLayout();
  const cells: Record<string, SegState> = {};
  if (lr.cells && typeof lr.cells === 'object') {
    for (const [k, v] of Object.entries(lr.cells as Record<string, unknown>)) {
      if (/^\d+,\d+$/.test(k) && (v === 'open' || v === 'solid' || v === 'projected')) cells[k] = v;
    }
  }
  const layout: Layout = {
    entries: clamp(lr.entries, LIMITS.entries, d.entries),
    rows: clamp(lr.rows, LIMITS.rows, d.rows),
    entryWidth: clamp(lr.entryWidth, LIMITS.entryWidth, d.entryWidth),
    pillarWidth: clamp(lr.pillarWidth, LIMITS.pillar, d.pillarWidth),
    pillarLength: clamp(lr.pillarLength, LIMITS.pillar, d.pillarLength),
    stubLength: clamp(lr.stubLength, LIMITS.stub, d.stubLength),
    ...(num(lr.sideLeft) !== undefined ? { sideLeft: clamp(lr.sideLeft, LIMITS.side, 0) } : {}),
    ...(num(lr.sideRight) !== undefined ? { sideRight: clamp(lr.sideRight, LIMITS.side, 0) } : {}),
    cells,
    entryNames: Array.isArray(lr.entryNames) ? lr.entryNames.map((n) => (typeof n === 'string' ? n.slice(0, 40) : '')) : [],
    xcStart: clamp(lr.xcStart, [0, 999], 0),
    outbyPillars: bool(lr.outbyPillars) ?? true
  };
  const fm = (r.fabMaterials && typeof r.fabMaterials === 'object' ? r.fabMaterials : {}) as Record<string, unknown>;
  const els = Array.isArray(r.elements) ? r.elements.map(normalizeElement).filter((e): e is El => !!e) : [];
  const seen = new Set<string>();
  for (const e of els) {
    if (seen.has(e.id)) e.id = newId();
    seen.add(e.id);
  }
  return {
    schema: SCHEMA,
    id: str(r.id) || newId('p'),
    title: (str(r.title) ?? 'Untitled problem').slice(0, 120) || 'Untitled problem',
    source: str(r.source)?.slice(0, 300),
    statement: str(r.statement) ?? '',
    instructions: str(r.instructions) ?? '',
    missing: clamp(r.missing, [0, 50], 0),
    timeLimit: clamp(r.timeLimit, [0, 600], 0),
    fabFresh: bool(r.fabFresh) ?? true,
    ...(bool(r.boOutside) !== undefined ? { boOutside: bool(r.boOutside) } : {}),
    fabMaterials: {
      timbers: clamp(fm.timbers, [0, 200], 0),
      pump: bool(fm.pump) ?? false,
      brattice: bool(fm.brattice) ?? true,
      lineCurtain: bool(fm.lineCurtain) ?? false
    },
    keyNotes: str(r.keyNotes) ?? '',
    layout,
    elements: els,
    updated: str(r.updated) ?? new Date().toISOString()
  };
}
