/**
 * A ring of placement options shown around an element right after it is placed (or when it is tapped):
 * the quick choices from the inspector (direction, airtight, open, density, …) plus duplicate, delete and done.
 */
import { elementName } from '../catalog';
import type { El, SegState } from '../model';

export type RadialAction = 'edit' | 'duplicate' | 'delete' | 'done';

export interface RadialOption {
  id: string;
  /** Short text on the button. */
  label: string;
  /** Longer name for the tooltip and screen readers. */
  title: string;
  /** The choice the element currently has (shown highlighted). */
  on?: boolean;
  patch?: Partial<El>;
  action?: RadialAction;
}

const DIRS: [number, string, string][] = [
  [0, '↑', 'Inby'],
  [90, '→', 'Right'],
  [180, '↓', 'Outby'],
  [270, '←', 'Left']
];

const toggle = (id: string, label: string, title: string, on: boolean, patch: Partial<El>): RadialOption => ({ id, label, title, on, patch });

/** The placement choices for one element, in ring order (clockwise from the top). */
export function radialOptions(el: El): RadialOption[] {
  const out: RadialOption[] = [];
  const k = el.kind;
  if (k === 'body' || k === 'person' || k === 'air' || k === 'refuge') {
    const verb = k === 'body' || k === 'person' ? 'Head toward' : k === 'refuge' ? 'Door side' : 'Direction';
    const cur = (el.dir ?? 0) % 360;
    for (const [v, arrow, name] of DIRS) out.push({ id: `dir${v}`, label: arrow, title: `${verb}: ${name.toLowerCase()}`, on: cur === v, patch: { dir: v } });
    out.push({ id: 'rot45', label: '↻ 45°', title: 'Rotate 45°', patch: { dir: (cur + 45) % 360 } });
  }
  if (k === 'diagonal') {
    out.push({ id: 'diag/', label: '／', title: 'Outby-left to inby-right', on: (el.diag ?? '/') === '/', patch: { diag: '/' } });
    out.push({ id: 'diag\\', label: '＼', title: 'Inby-left to outby-right', on: el.diag === '\\', patch: { diag: '\\' } });
  }
  if (['perm-stopping', 'temp-stopping', 'seal', 'barricade', 'diagonal', 'overcast'].includes(k)) {
    const intact = el.intact !== false;
    out.push(toggle('intact', intact ? 'Intact' : 'Not intact', 'Intact', intact, { intact: !intact, airtight: intact ? false : el.airtight }));
    const airtight = el.airtight !== false && intact;
    out.push(toggle('airtight', airtight ? 'Airtight' : 'Not airtight', 'Airtight', airtight, { airtight: !airtight, ...(airtight ? {} : { intact: true }) }));
  }
  if (k === 'barricade') out.push(toggle('response', 'Answers', 'A person answers from behind it', !!el.response, { response: !el.response }));
  if (k === 'door') out.push(toggle('open', el.open ? 'Open' : 'Closed', 'Door open', !!el.open, { open: !el.open }));
  if (k === 'caved' || k === 'unsafe-roof' || k === 'water') out.push(toggle('across', 'Rib to rib', 'Rib to rib (across the opening)', el.across !== false, { across: el.across === false }));
  if (k === 'caved') out.push(toggle('airtight', 'Airtight', 'Placard states “airtight”', !!el.airtight, { airtight: !el.airtight }));
  if (k === 'water') {
    out.push(toggle('overKnee', 'Over knee', 'Over knee deep', !!el.overKnee, { overKnee: !el.overKnee }));
    out.push(toggle('roofed', 'Roofed', 'Water roofed (airtight)', !!el.roofed, { roofed: !el.roofed }));
  }
  if (k === 'smoke') {
    out.push({ id: 'light', label: 'Light', title: 'Light smoke', on: el.density === 'light', patch: { density: el.density === 'light' ? '' : 'light' } });
    out.push({ id: 'dense', label: 'Dense', title: 'Dense smoke', on: el.density === 'dense', patch: { density: el.density === 'dense' ? '' : 'dense' } });
  }
  if (k === 'fire') out.push(toggle('ext', 'Can put out', 'Can be extinguished', el.extinguishable !== false, { extinguishable: el.extinguishable === false }));
  if (k === 'fan') {
    out.push(toggle('on', el.on !== false ? 'Running' : 'Off', 'Running', el.on !== false, { on: el.on === false }));
    const blowing = el.fanMode === 'blowing';
    out.push({ id: 'mode', label: blowing ? 'Blowing' : 'Exhausting', title: 'Switch exhausting / blowing', patch: { fanMode: blowing ? 'exhausting' : 'blowing' } });
  }
  if (k === 'person') out.push(toggle('conscious', el.conscious !== false ? 'Conscious' : 'Unconscious', 'Conscious', el.conscious !== false, { conscious: el.conscious === false }));
  if (k === 'x' && (el.sub === 'equipment' || el.sub === 'cable' || el.sub === 'battery' || el.sub === 'other')) {
    const energized = el.sub === 'battery' || el.sub === 'cable' ? el.energized !== false : !!el.energized;
    out.push(toggle('energized', 'Energized', 'Energized (ignition source)', energized, { energized: !energized }));
  }
  out.push({ id: 'edit', label: k === 'gas' ? 'Readings…' : 'Edit…', title: k === 'gas' ? 'Enter the gas readings' : 'Edit wording and details', action: 'edit' });
  out.push({ id: 'duplicate', label: 'Copy', title: 'Duplicate', action: 'duplicate' });
  out.push({ id: 'delete', label: 'Delete', title: 'Delete', action: 'delete' });
  out.push({ id: 'done', label: '✓', title: 'Done', action: 'done' });
  return out;
}

/** Ring radius in pixels: wide enough that the buttons do not overlap. */
export const ringRadius = (n: number) => Math.max(62, Math.round((n * 74) / (2 * Math.PI)));

interface Props {
  el: El;
  /** Centre of the element, in pixels within the map stage. */
  x: number;
  y: number;
  /** Size of the map stage, to keep the ring inside it. */
  width: number;
  height: number;
  onPatch: (patch: Partial<El>) => void;
  onAction: (a: RadialAction) => void;
}

export function RadialMenu({ el, x, y, width, height, onPatch, onAction }: Props) {
  const opts = radialOptions(el);
  const r = ringRadius(opts.length);
  const pad = r + 34;
  const cx = Math.min(Math.max(x, pad), Math.max(pad, width - pad));
  const cy = Math.min(Math.max(y, pad), Math.max(pad, height - pad));
  return (
    <div className="radial" style={{ left: cx, top: cy }} role="menu" aria-label={`${elementName(el)} options`} onPointerDown={(e) => e.stopPropagation()}>
      <svg className="radial-ring" width={2 * r} height={2 * r} style={{ left: -r, top: -r }} aria-hidden="true">
        <circle cx={r} cy={r} r={r - 1} />
      </svg>
      {opts.map((o, i) => {
        const a = -Math.PI / 2 + (2 * Math.PI * i) / opts.length;
        return (
          <button
            key={o.id}
            type="button"
            role={o.on === undefined ? 'menuitem' : 'menuitemcheckbox'}
            className={`radial-btn${o.on ? ' on' : ''}${o.action === 'delete' ? ' danger' : ''}${o.action === 'done' ? ' done' : ''}`}
            style={{ left: Math.cos(a) * r, top: Math.sin(a) * r }}
            title={o.title}
            aria-label={o.title}
            aria-checked={o.on}
            data-opt={o.id}
            onClick={() => (o.patch ? onPatch(o.patch) : o.action && onAction(o.action))}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------ layout: one opening

export type OpeningPick = SegState | 'done';

/** Choices for an opening in the layout tool: how it is drawn on the map (Miscellaneous rule 3 for side stubs). */
export function openingOptions(state: SegState): { id: OpeningPick; label: string; title: string; on?: boolean }[] {
  return [
    { id: 'open', label: 'Mined', title: 'Mined: solid lines (actual, accurately measured workings)', on: state === 'open' },
    { id: 'projected', label: 'Projected', title: 'Projected: dotted lines (may or may not be accurate)', on: state === 'projected' },
    { id: 'solid', label: 'Not mined', title: 'Not mined: solid coal', on: state === 'solid' },
    { id: 'done', label: '✓', title: 'Done' }
  ];
}

export function OpeningRing({ name, state, x, y, width, height, onPick }: { name: string; state: SegState; x: number; y: number; width: number; height: number; onPick: (p: OpeningPick) => void }) {
  const opts = openingOptions(state);
  const r = 74;
  const pad = r + 40;
  const cx = Math.min(Math.max(x, pad), Math.max(pad, width - pad));
  const cy = Math.min(Math.max(y, pad), Math.max(pad, height - pad));
  return (
    <div className="radial" style={{ left: cx, top: cy }} role="menu" aria-label={`${name}: layout`} onPointerDown={(e) => e.stopPropagation()}>
      <svg className="radial-ring" width={2 * r} height={2 * r} style={{ left: -r, top: -r }} aria-hidden="true">
        <circle cx={r} cy={r} r={r - 1} />
      </svg>
      <span className="radial-name">{name}</span>
      {opts.map((o, i) => {
        const a = -Math.PI / 2 + (2 * Math.PI * i) / opts.length;
        return (
          <button
            key={o.id}
            type="button"
            role={o.on === undefined ? 'menuitem' : 'menuitemradio'}
            className={`radial-btn${o.on ? ' on' : ''}${o.id === 'done' ? ' done' : ''}`}
            style={{ left: Math.cos(a) * r, top: Math.sin(a) * r }}
            title={o.title}
            aria-label={o.title}
            aria-checked={o.on}
            data-opt={o.id}
            onClick={() => onPick(o.id)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
