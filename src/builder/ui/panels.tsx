import { useState, type FocusEvent, type MouseEvent, type ReactNode } from 'react';
import { elementName, GROUPS, KIND_DEFS, LEGEND_NOTE, PALETTE, placardText, X_DEFS, xDef, makeElement, type PaletteItem } from '../catalog';
import { locName, locate, type Topo } from '../geometry';
import { entryName, LIMITS, sideDepth, type El, type Layout, type Problem, type XSub } from '../model';
import type { NumberDirection, NumberOrder, PillarNumbering } from '../pillars';
import { classifyGas, gasReasons } from '../rules';
import type { Check } from '../solve';
import { RuleRefs } from './RuleRefs';
import { SymbolIcon } from './symbols';

// ------------------------------------------------------------ small inputs

/**
 * Select the whole value when a field gets focus (click, tap or Tab), so typing replaces it. The mouseup that
 * follows a focusing click would otherwise drop the selection in Chrome and Safari.
 */
export const selectOnFocus = {
  onFocus: (e: FocusEvent<HTMLInputElement>) => {
    const t = e.currentTarget;
    t.select();
    t.dataset.justFocused = '1';
  },
  onMouseUp: (e: MouseEvent<HTMLInputElement>) => {
    const t = e.currentTarget;
    if (t.dataset.justFocused) {
      e.preventDefault();
      delete t.dataset.justFocused;
    }
  },
  onBlur: (e: FocusEvent<HTMLInputElement>) => {
    delete e.currentTarget.dataset.justFocused;
  }
};

function Num({ label, value, onChange, min, max, step = 1, suffix }: { label: string; value: number | undefined; onChange: (v: number | undefined) => void; min?: number; max?: number; step?: number; suffix?: string }) {
  return (
    <label className="field num">
      <span>{label}</span>
      <span className="num-wrap">
        <input
          type="number"
          inputMode="decimal"
          value={value ?? ''}
          min={min}
          max={max}
          step={step}
          onChange={(e) => {
            const v = e.target.value === '' ? undefined : Number(e.target.value);
            onChange(v === undefined || Number.isNaN(v) ? undefined : v);
          }}
          {...selectOnFocus}
        />
        {suffix && <span className="muted small">{suffix}</span>}
      </span>
    </label>
  );
}

/** A count that changes the map (entries, crosscuts): applied when the field is left or Enter is pressed, so typing "12" never passes through "1". */
function CountNum({ label, value, min, max, onCommit }: { label: string; value: number; min: number; max: number; onCommit: (v: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const v = Number(draft);
    setDraft(null);
    if (draft !== '' && Number.isFinite(v)) {
      const c = Math.min(max, Math.max(min, Math.round(v)));
      if (c !== value) onCommit(c);
    }
  };
  return (
    <label className="field num">
      <span>{label}</span>
      <span className="num-wrap">
        <input
          type="number"
          inputMode="numeric"
          value={draft ?? value}
          min={min}
          max={max}
          {...selectOnFocus}
          onChange={(e) => {
            // Spinner arrows and arrow keys (no typed input) apply at once; typing waits for Enter or leaving the field.
            const v = Number(e.target.value);
            const typed = /^(insert|delete)/.test((e.nativeEvent as InputEvent).inputType ?? '');
            if (!typed && e.target.value !== '' && Number.isFinite(v) && v >= min && v <= max) {
              setDraft(null);
              onCommit(v);
            } else setDraft(e.target.value);
          }}
          onBlur={(e) => {
            selectOnFocus.onBlur(e);
            commit();
          }}
          onKeyDown={(e) => e.key === 'Enter' && commit()}
        />
      </span>
    </label>
  );
}

function Check({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="field check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        {label}
        {hint && <span className="muted small"> — {hint}</span>}
      </span>
    </label>
  );
}

function Text({ label, value, onChange, rows, placeholder }: { label: string; value: string; onChange: (v: string) => void; rows?: number; placeholder?: string }) {
  return (
    <label className="field text">
      <span>{label}</span>
      {rows ? <textarea rows={rows} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} /> : <input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />}
    </label>
  );
}

export function Section({ title, children, open = true, count }: { title: string; children: ReactNode; open?: boolean; count?: number }) {
  return (
    <details className="panel-sec" open={open}>
      <summary>
        {title}
        {count !== undefined && <span className="count"> {count}</span>}
      </summary>
      <div className="panel-body">{children}</div>
    </details>
  );
}

// ------------------------------------------------------------ palette

export function Palette({ active, onPick }: { active: string | null; onPick: (item: PaletteItem) => void }) {
  return (
    <div className="palette" role="toolbar" aria-label="Map symbols">
      {GROUPS.map((g) => (
        <div key={g.id} className="pal-group">
          <div className="pal-title">{g.name}</div>
          <div className="pal-items">
            {PALETTE.filter((p) => p.group === g.id).map((p) => (
              <button key={p.key} type="button" className={`pal-item${active === p.key ? ' on' : ''}`} onClick={() => onPick(p)} title={`Place: ${p.name}`} aria-pressed={active === p.key}>
                <SymbolIcon el={makeElement(p, 0, 0, 'icon')} />
                <span>{p.name}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------ inspector

const DIRS = [
  [0, 'Inby ↑'],
  [90, 'Right →'],
  [180, 'Outby ↓'],
  [270, 'Left ←']
] as const;

export function Inspector({ el, topo, onChange, onDelete, onDuplicate, onClose }: { el: El; topo: Topo; onChange: (patch: Partial<El>) => void; onDelete: () => void; onDuplicate: () => void; onClose: () => void }) {
  const d = KIND_DEFS[el.kind];
  const loc = locate(topo, el.x, el.y);
  const gas = el.kind === 'gas' ? classifyGas(el) : null;
  const directional = el.kind === 'body' || el.kind === 'person' || el.kind === 'air' || el.kind === 'refuge';
  return (
    <div className="inspector">
      <div className="insp-head">
        <SymbolIcon el={el} size={40} />
        <div>
          <strong>{elementName(el)}</strong>
          <div className={`small ${loc.type === 'none' ? 'warn' : 'muted'}`}>{locName(topo, loc)}</div>
        </div>
        <button type="button" className="link" onClick={onClose} aria-label="Close inspector">
          Done
        </button>
      </div>
      {el.kind !== 'roof-support' && el.kind !== 'fpa' && (
        <Text label={el.kind === 'gas' ? 'Placard wording (blank = readings)' : 'Placard wording (verbatim)'} value={el.text ?? ''} onChange={(v) => onChange({ text: v })} rows={2} placeholder={el.kind === 'gas' ? placardText(el) : ''} />
      )}
      {el.kind === 'gas' && (
        <>
          <div className="row3">
            <Num label="CH4" suffix="%" value={el.ch4} step={0.1} min={0} max={100} onChange={(v) => onChange({ ch4: v })} />
            <Num label="CO" suffix="PPM" value={el.co} step={1} min={0} onChange={(v) => onChange({ co: v })} />
            <Num label="O2" suffix="%" value={el.o2} step={0.1} min={0} max={21} onChange={(v) => onChange({ o2: v })} />
          </div>
          <div className="chips">
            {gas!.explosive && <span className="chip static danger">Explosive</span>}
            {gas!.irrespirable && <span className="chip static warnc">Irrespirable</span>}
            {gas!.contaminant && <span className="chip static">Contaminant</span>}
            {gas!.fireEvidence && <span className="chip static">Evidence of fire</span>}
            {!gas!.contaminant && <span className="chip static okc">Normal air</span>}
          </div>
          {gasReasons(el).length > 0 && <p className="small muted">{gasReasons(el).join('; ')}.</p>}
        </>
      )}
      {['perm-stopping', 'temp-stopping', 'seal', 'barricade', 'diagonal', 'overcast'].includes(el.kind) && (
        <>
          <Check label="Intact" checked={el.intact !== false} onChange={(v) => onChange({ intact: v, airtight: v ? el.airtight : false })} />
          <Check label="Airtight" checked={el.airtight !== false && el.intact !== false} onChange={(v) => onChange({ airtight: v })} />
        </>
      )}
      {el.kind === 'diagonal' && (
        <div className="seg" role="group" aria-label="Diagonal direction">
          {(['/', '\\'] as const).map((v) => (
            <button key={v} type="button" className={`chip${(el.diag ?? '/') === v ? ' on' : ''}`} onClick={() => onChange({ diag: v })}>
              {v === '/' ? '／ outby-left to inby-right' : '＼ inby-left to outby-right'}
            </button>
          ))}
        </div>
      )}
      {el.kind === 'barricade' && <Check label="A person answers from behind it" hint="verbal contact" checked={!!el.response} onChange={(v) => onChange({ response: v })} />}
      {el.kind === 'door' && <Check label="Open" checked={!!el.open} onChange={(v) => onChange({ open: v })} />}
      {(el.kind === 'caved' || el.kind === 'unsafe-roof' || el.kind === 'water') && <Check label="Rib to rib (across the opening)" checked={el.across !== false} onChange={(v) => onChange({ across: v })} />}
      {el.kind === 'caved' && <Check label="Placard states “airtight”" checked={!!el.airtight} onChange={(v) => onChange({ airtight: v })} />}
      {el.kind === 'water' && (
        <>
          <Check label="Over knee deep" checked={!!el.overKnee} onChange={(v) => onChange({ overKnee: v })} />
          <Check label="Water roofed" hint="airtight" checked={!!el.roofed} onChange={(v) => onChange({ roofed: v })} />
        </>
      )}
      {['caved', 'unsafe-roof', 'water', 'unsafe-rib', 'line-curtain-installed'].includes(el.kind) && <Num label="Length along the opening" suffix="ft" value={el.len} min={2} max={200} onChange={(v) => onChange({ len: v })} />}
      {el.kind === 'smoke' && (
        <label className="field">
          <span>Density</span>
          <select value={el.density ?? ''} onChange={(e) => onChange({ density: e.target.value as El['density'] })}>
            <option value="">Not stated</option>
            <option value="light">Light</option>
            <option value="dense">Dense</option>
          </select>
        </label>
      )}
      {el.kind === 'fire' && <Check label="Can be extinguished" hint="uncheck for an inextinguishable fire" checked={el.extinguishable !== false} onChange={(v) => onChange({ extinguishable: v })} />}
      {el.kind === 'fan' && (
        <>
          <Check label="Running" checked={el.on !== false} onChange={(v) => onChange({ on: v })} />
          <label className="field">
            <span>Mode</span>
            <select value={el.fanMode ?? 'exhausting'} onChange={(e) => onChange({ fanMode: e.target.value as El['fanMode'] })}>
              <option value="exhausting">Exhausting</option>
              <option value="blowing">Blowing</option>
            </select>
          </label>
        </>
      )}
      {el.kind === 'person' && <Check label="Conscious" checked={el.conscious !== false} onChange={(v) => onChange({ conscious: v })} />}
      {directional && (
        <div className="field">
          <span>{el.kind === 'body' || el.kind === 'person' ? 'Head toward' : el.kind === 'refuge' ? 'Door side' : 'Direction'}</span>
          <div className="seg">
            {DIRS.map(([v, l]) => (
              <button key={v} type="button" className={`chip small${((el.dir ?? 0) % 360) === v ? ' on' : ''}`} onClick={() => onChange({ dir: v })}>
                {l}
              </button>
            ))}
            <button type="button" className="chip small" onClick={() => onChange({ dir: ((el.dir ?? 0) + 45) % 360 })} title="Rotate 45°">
              ↻ 45°
            </button>
          </div>
        </div>
      )}
      {el.kind === 'x' && (
        <>
          <label className="field">
            <span>Object type</span>
            <select
              value={el.sub ?? 'other'}
              onChange={(e) => {
                const sub = e.target.value as XSub;
                const xd = xDef(sub);
                onChange({ sub, text: el.text && el.text !== xDef(el.sub).text ? el.text : xd.text, ...(xd.defaults ?? {}) });
              }}
            >
              {X_DEFS.map((x) => (
                <option key={x.sub} value={x.sub}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
          <p className="small muted">{xDef(el.sub).hint}</p>
          {el.sub === 'timbers' && <Num label="How many" value={el.count} min={0} max={200} onChange={(v) => onChange({ count: v })} />}
          {(el.sub === 'equipment' || el.sub === 'cable' || el.sub === 'battery' || el.sub === 'other') && <Check label="Energized (ignition source)" checked={el.sub === 'battery' || el.sub === 'cable' ? el.energized !== false : !!el.energized} onChange={(v) => onChange({ energized: v })} />}
        </>
      )}
      <Check label="Already shown on the blank maps" hint="FAB objects and air shafts (A Card 5B)" checked={!!el.preMapped} onChange={(v) => onChange({ preMapped: v })} />
      <Text label="Designer note (not on the placard)" value={el.note ?? ''} onChange={(v) => onChange({ note: v })} rows={2} />
      <details className="legend-note">
        <summary>Legend and rules</summary>
        <p className="small">{d.legend}</p>
        <p className="small muted">{LEGEND_NOTE}</p>
        <p className="small">
          Rules: <RuleRefs ids={d.rules} />
        </p>
      </details>
      <div className="row-actions">
        <button type="button" onClick={onDuplicate}>
          Duplicate
        </button>
        <button type="button" className="danger" onClick={onDelete}>
          Delete
        </button>
      </div>
      <p className="small muted">Drag on the map to move · arrow keys nudge 1 ft (Shift 5 ft) · R rotates · Delete removes.</p>
    </div>
  );
}

// ------------------------------------------------------------ problem + layout

export function ProblemPanel({
  p,
  onChange,
  onLayout,
  layoutTool,
  onLayoutTool,
  numberingPanel
}: {
  p: Problem;
  onChange: (patch: Partial<Problem>) => void;
  onLayout: (patch: Partial<Layout>) => void;
  layoutTool: boolean;
  onLayoutTool: (on: boolean) => void;
  numberingPanel?: ReactNode;
}) {
  const l = p.layout;
  const setL = onLayout;
  return (
    <div className="problem-panel">
      <Section title="Problem">
        <Text label="Title" value={p.title} onChange={(v) => onChange({ title: v })} />
        <Text label="Statement (given to the team before the clock starts)" value={p.statement} onChange={(v) => onChange({ statement: v })} rows={5} placeholder="What happened, where the FAB is, which entries the team may enter, fan status…" />
        <Text label="Written instructions (after the clock starts, Rule 50)" value={p.instructions} onChange={(v) => onChange({ instructions: v })} rows={3} placeholder="Exploration, rescue, recovery and ventilation instructions" />
        <div className="row2">
          <Num label="Missing persons" value={p.missing} min={0} max={50} onChange={(v) => onChange({ missing: Math.max(0, Math.round(v ?? 0)) })} />
          <Num label="Time limit" suffix="min (0 = none)" value={p.timeLimit} min={0} max={600} onChange={(v) => onChange({ timeLimit: Math.max(0, Math.round(v ?? 0)) })} />
        </div>
        <Check label="Fresh air at the FAB" hint="the FAB connects to fresh outby air" checked={p.fabFresh} onChange={(v) => onChange({ fabFresh: v })} />
        <div className="field">
          <span>Materials at the FAB</span>
          <div className="row2">
            <Num label="Timbers" value={p.fabMaterials.timbers} min={0} max={200} onChange={(v) => onChange({ fabMaterials: { ...p.fabMaterials, timbers: Math.max(0, Math.round(v ?? 0)) } })} />
            <div>
              <Check label="Pump" checked={p.fabMaterials.pump} onChange={(v) => onChange({ fabMaterials: { ...p.fabMaterials, pump: v } })} />
              <Check label="Brattice" checked={p.fabMaterials.brattice} onChange={(v) => onChange({ fabMaterials: { ...p.fabMaterials, brattice: v } })} />
              <Check label="Line curtain" checked={p.fabMaterials.lineCurtain} onChange={(v) => onChange({ fabMaterials: { ...p.fabMaterials, lineCurtain: v } })} />
            </div>
          </div>
        </div>
        <Text label="Source" value={p.source ?? ''} onChange={(v) => onChange({ source: v })} placeholder="e.g. 2019 regional contest, day 1" />
        <Text label="Key notes (answers, expected discounts)" value={p.keyNotes} onChange={(v) => onChange({ keyNotes: v })} rows={4} />
      </Section>
      <Section title="Blank map">
        <p className="small muted">All pillar blocks are equal size (General Information rule 7). Contest maps are 1 in = 10 ft.</p>
        <div className="row2">
          <CountNum label="Entries" value={l.entries} min={LIMITS.entries[0]} max={LIMITS.entries[1]} onCommit={(v) => setL({ entries: v })} />
          <CountNum label="Crosscuts inby the FAB" value={l.rows - 1} min={1} max={LIMITS.rows[1] - 1} onCommit={(v) => setL({ rows: v + 1 })} />
        </div>
        <div className="row2">
          <Num label="Pillar width" suffix="ft" value={l.pillarWidth} min={20} max={200} onChange={(v) => v && setL({ pillarWidth: Math.round(v) })} />
          <Num label="Pillar length" suffix="ft" value={l.pillarLength} min={20} max={200} onChange={(v) => v && setL({ pillarLength: Math.round(v) })} />
        </div>
        <div className="row2">
          <Num label="Entry width" suffix="ft" value={l.entryWidth} min={10} max={40} onChange={(v) => v && setL({ entryWidth: Math.round(v) })} />
          <Num label="Stub depth" suffix="ft" value={l.stubLength} min={10} max={200} onChange={(v) => v && setL({ stubLength: Math.round(v) })} />
        </div>
        <Num label="Crosscut number at the FAB" value={l.xcStart} min={0} max={999} onChange={(v) => setL({ xcStart: Math.max(0, Math.round(v ?? 0)) })} />
        <div className="field">
          <span>Entry names</span>
          <div className="entry-names">
            {Array.from({ length: l.entries }, (_, i) => (
              <input
                key={i}
                aria-label={`Entry ${i + 1} name`}
                value={l.entryNames[i] ?? ''}
                placeholder={entryName({ ...l, entryNames: [] }, i)}
                {...selectOnFocus}
                onChange={(e) => {
                  const names = Array.from({ length: l.entries }, (_, j) => l.entryNames[j] ?? '');
                  names[i] = e.target.value;
                  setL({ entryNames: names });
                }}
              />
            ))}
          </div>
        </div>
        <Check label="Pillars outby the FAB" hint="drawn below the FAB row; numbered 0, 00 by default" checked={l.outbyPillars} onChange={(v) => setL({ outbyPillars: v })} />
        <button type="button" className={layoutTool ? 'primary' : ''} onClick={() => onLayoutTool(!layoutTool)} aria-pressed={layoutTool}>
          {layoutTool ? 'Done editing the layout' : 'Edit layout on the map…'}
        </button>
        {layoutTool && (
          <p className="small note">
            Click an entry, crosscut or stub to set it <strong>mined</strong> (solid lines: actual, accurately measured workings), <strong>projected</strong> (dotted lines: may or may not be accurate) or{' '}
            <strong>not mined</strong>. Side stubs off the outer entries start unmined (Miscellaneous rule 3).
          </p>
        )}
      </Section>
      {numberingPanel}
    </div>
  );
}

// ------------------------------------------------------------ layout bar (above the map in the layout tool)

export type LayoutBarOp = { type: 'add-entry' | 'remove-entry'; side: 'left' | 'right' } | { type: 'add-row' | 'remove-row' } | { type: 'set'; patch: Partial<Layout> } | { type: 'done' };

export function LayoutBar({ l, onOp }: { l: Layout; onOp: (op: LayoutBarOp) => void }) {
  const size = (label: string, key: 'pillarWidth' | 'pillarLength' | 'entryWidth' | 'stubLength', [lo, hi]: readonly [number, number]) => (
    <label className="inline">
      <span>{label}</span>
      <input
        type="number"
        inputMode="numeric"
        min={lo}
        max={hi}
        value={l[key]}
        aria-label={`${label} (ft)`}
        {...selectOnFocus}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (e.target.value !== '' && Number.isFinite(v) && v >= 1) onOp({ type: 'set', patch: { [key]: Math.round(v) } });
        }}
      />
    </label>
  );
  return (
    <div className="layout-bar" role="toolbar" aria-label="Mine layout">
      <span className="grp">
        <span>Entries {l.entries}</span>
        <button type="button" onClick={() => onOp({ type: 'add-entry', side: 'left' })} disabled={l.entries >= LIMITS.entries[1]} title="Add an entry on the left">
          ＋ Left
        </button>
        <button type="button" onClick={() => onOp({ type: 'remove-entry', side: 'left' })} disabled={l.entries <= LIMITS.entries[0]} title="Remove the left entry">
          − Left
        </button>
        <button type="button" onClick={() => onOp({ type: 'remove-entry', side: 'right' })} disabled={l.entries <= LIMITS.entries[0]} title="Remove the right entry">
          − Right
        </button>
        <button type="button" onClick={() => onOp({ type: 'add-entry', side: 'right' })} disabled={l.entries >= LIMITS.entries[1]} title="Add an entry on the right">
          ＋ Right
        </button>
      </span>
      <span className="grp">
        <span>Crosscuts {l.rows - 1}</span>
        <button type="button" onClick={() => onOp({ type: 'remove-row' })} disabled={l.rows <= LIMITS.rows[0]} title="Remove the last crosscut (the face moves outby)">
          − Shorter
        </button>
        <button type="button" onClick={() => onOp({ type: 'add-row' })} disabled={l.rows >= LIMITS.rows[1]} title="Add a crosscut at the face (the face moves inby)">
          ＋ Longer
        </button>
      </span>
      <span className="grp">
        <span>Feet</span>
        {size('Pillar W', 'pillarWidth', LIMITS.pillar)}
        {size('Pillar L', 'pillarLength', LIMITS.pillar)}
        {size('Entry', 'entryWidth', LIMITS.entryWidth)}
        {size('Face stub', 'stubLength', LIMITS.stub)}
      </span>
      <span className="grp">
        <span>Side rooms</span>
        {(['left', 'right'] as const).map((side) => {
          const d = sideDepth(l, side);
          const key = side === 'left' ? 'sideLeft' : 'sideRight';
          return (
            <span key={side} className="inline">
              <label className="inline">
                <input type="checkbox" checked={d > 0} onChange={(e) => onOp({ type: 'set', patch: { [key]: e.target.checked ? l.stubLength : 0 } })} />
                <span>{side === 'left' ? 'Left' : 'Right'}</span>
              </label>
              {d > 0 && (
                <input
                  type="number"
                  inputMode="numeric"
                  min={10}
                  max={LIMITS.side[1]}
                  value={d}
                  aria-label={`${side === 'left' ? 'Left' : 'Right'} side room depth (ft)`}
                  {...selectOnFocus}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (e.target.value !== '' && Number.isFinite(v) && v >= 1) onOp({ type: 'set', patch: { [key]: Math.round(v) } });
                  }}
                />
              )}
            </span>
          );
        })}
      </span>
      <label className="inline">
        <input type="checkbox" checked={l.outbyPillars} onChange={(e) => onOp({ type: 'set', patch: { outbyPillars: e.target.checked } })} />
        <span>Pillars outby the FAB</span>
      </label>
      <button type="button" className="primary" onClick={() => onOp({ type: 'done' })}>
        Done
      </button>
    </div>
  );
}

// ------------------------------------------------------------ pillar numbering

export function NumberingPanel({ n, isDefault, onChange, onReset, onImport, onExport }: { n: PillarNumbering; isDefault: boolean; onChange: (n: PillarNumbering) => void; onReset: () => void; onImport: () => void; onExport: () => void }) {
  const inby = (patch: Partial<PillarNumbering['inby']>) => onChange({ ...n, inby: { ...n.inby, ...patch } });
  // The outby labels are typed as text ("0, 00"): keep what is typed until the field is left.
  const [outbyDraft, setOutbyDraft] = useState<string | null>(null);
  return (
    <Section title="Pillar numbers" open={false}>
      <p className="small muted">
        {isDefault ? 'Using the default scheme from pillar-numbering.json' : 'Using this device’s scheme'}: {n.name}.
      </p>
      <Check label="Show pillar numbers on the map" checked={n.show} onChange={(v) => onChange({ ...n, show: v })} />
      <label className="field text">
        <span>Outby the FAB, left to right (comma separated)</span>
        <input
          value={outbyDraft ?? n.outby.labels.join(', ')}
          placeholder="0, 00"
          onChange={(e) => {
            setOutbyDraft(e.target.value);
            onChange({ ...n, outby: { ...n.outby, labels: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) } });
          }}
          onBlur={() => setOutbyDraft(null)}
        />
      </label>
      <Check label="More outby pillars than labels: add a zero" hint="0, 00, 000…" checked={n.outby.more === 'add-zero'} onChange={(v) => onChange({ ...n, outby: { ...n.outby, more: v ? 'add-zero' : 'none' } })} />
      <div className="numbering-grid">
        <Num label="Inby starts at" value={n.inby.start} onChange={(v) => inby({ start: Math.round(v ?? 1) })} />
        <Num label="Count by" value={n.inby.step} min={1} onChange={(v) => inby({ step: Math.max(1, Math.round(v ?? 1)) })} />
        <label className="field">
          <span>Order</span>
          <select value={n.inby.order} onChange={(e) => inby({ order: e.target.value as NumberOrder })}>
            <option value="rows">Across each row, then inby</option>
            <option value="columns">Up each column to the face</option>
          </select>
        </label>
        <label className="field">
          <span>Direction</span>
          <select value={n.inby.direction} onChange={(e) => inby({ direction: e.target.value as NumberDirection })}>
            <option value="left-to-right">Left to right</option>
            <option value="right-to-left">Right to left</option>
            <option value="serpentine">Back and forth</option>
          </select>
        </label>
        <Text label="Prefix" value={n.inby.prefix} onChange={(v) => inby({ prefix: v })} />
        <Text label="Suffix" value={n.inby.suffix} onChange={(v) => inby({ suffix: v })} />
      </div>
      <Check label="Number the blocks at the face" hint="between the entries inby the last crosscut" checked={n.faceBlocks} onChange={(v) => onChange({ ...n, faceBlocks: v })} />
      <Check label="Print numbers on the blank team map" hint="maps are normally unlabelled" checked={n.showOnBlankMap} onChange={(v) => onChange({ ...n, showOnBlankMap: v })} />
      <div className="row-actions">
        <button type="button" onClick={onImport}>
          Import scheme
        </button>
        <button type="button" onClick={onExport}>
          Export scheme
        </button>
        <button type="button" onClick={onReset} disabled={isDefault}>
          Use default
        </button>
      </div>
    </Section>
  );
}

export function ElementList({ p, topo, selectedId, onSelect }: { p: Problem; topo: Topo; selectedId: string | null; onSelect: (id: string) => void }) {
  const [q, setQ] = useState('');
  const list = p.elements.filter((e) => !q || `${elementName(e)} ${placardText(e)}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <Section title="Placed on the map" count={p.elements.length} open={false}>
      {p.elements.length > 6 && <input type="search" placeholder="Filter…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter placed objects" />}
      <ul className="el-list">
        {list.map((e) => (
          <li key={e.id}>
            <button type="button" className={e.id === selectedId ? 'on' : ''} onClick={() => onSelect(e.id)}>
              <SymbolIcon el={e} size={22} />
              <span>
                {elementName(e)}
                {placardText(e) && placardText(e).toUpperCase() !== elementName(e).toUpperCase() ? ` — ${placardText(e)}` : ''}
                <span className="muted small"> · {locName(topo, locate(topo, e.x, e.y))}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {!p.elements.length && <p className="muted small">Nothing yet. Pick a symbol, then click an entry, crosscut or intersection.</p>}
    </Section>
  );
}

export function Checks({ checks, onSelect }: { checks: Check[]; onSelect?: (id: string) => void }) {
  if (!checks.length) return <p className="small ok">No design problems found.</p>;
  return (
    <ul className="checks">
      {checks.map((c, i) => (
        <li key={i} className={c.level}>
          <span className="lvl">{c.level === 'error' ? 'Fix' : c.level === 'warn' ? 'Check' : 'Note'}</span> {c.text} {c.rules.length > 0 && <span className="muted small">(<RuleRefs ids={c.rules} />)</span>}
          {c.el && onSelect && (
            <button type="button" className="link" onClick={() => onSelect(c.el!)}>
              show
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
