import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KIND_DEFS, makeElement, type PaletteItem } from '../builder/catalog';
import { hazards } from '../builder/extents';
import { buildTopo, cellKey, cellType, makeGeo, snap } from '../builder/geometry';
import { makeBoard } from '../builder/graph';
import { blankProblem, newId, type El, type Layout, type Problem, type SegState } from '../builder/model';
import { SAMPLES } from '../builder/samples';
import { designChecks, solve } from '../builder/solve';
import { downloadProblem, loadCurrentId, loadProblems, readProblemFile, saveCurrentId, saveProblems } from '../builder/storage';
import { MARGIN, MapView, type Overlays, type Tool } from '../builder/ui/MapView';
import { RadialMenu, type RadialAction } from '../builder/ui/RadialMenu';
import { Checks, ElementList, Inspector, Palette, ProblemPanel, Section } from '../builder/ui/panels';
import { applyScenario, emptyScenario, SolvePanel, VentPanel, type Scenario } from '../builder/ui/solvePanels';
import { airflow, ventFindings } from '../builder/vent';

type Tab = 'build' | 'solve' | 'vent';

/** Close the <details> drop-down a menu item sits in. */
const closeMenu = (e: { currentTarget: Element }) => {
  const d = e.currentTarget.closest('details');
  if (d) d.open = false;
};
const HISTORY = 80;

function initialProblems(): { list: Problem[]; current: string } {
  let list = loadProblems();
  if (!list.length) list = SAMPLES.map((s) => s.make());
  const cur = loadCurrentId();
  const current = list.find((p) => p.id === cur)?.id ?? list.find((p) => p.id === 'sample-practice-1')?.id ?? list[0].id;
  return { list, current };
}

/** Keep cell overrides attached to the same openings when entries or rows are added or removed. */
function remapCells(old: Layout, next: Layout): Record<string, SegState> {
  const out: Record<string, SegState> = {};
  for (const [k, v] of Object.entries(old.cells)) {
    let [cx, cy] = k.split(',').map(Number);
    if (cx === 2 * old.entries) cx = 2 * next.entries;
    else if (cx > 2 * next.entries - 1) continue;
    if (cy === 2 * old.rows - 1) cy = 2 * next.rows - 1;
    else if (cy > 2 * next.rows - 2) continue;
    out[cellKey(cx, cy)] = v;
  }
  return out;
}

export default function Builder() {
  const init = useMemo(initialProblems, []);
  const [problems, setProblems] = useState<Problem[]>(init.list);
  const [currentId, setCurrentId] = useState(init.current);
  const [past, setPast] = useState<Problem[]>([]);
  const [future, setFuture] = useState<Problem[]>([]);
  const [tab, setTab] = useState<Tab>('build');
  const [tool, setTool] = useState<Tool>({ type: 'select' });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** Element whose placement options ring is open on the map. */
  const [radialId, setRadialId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(3);
  const [showLabels, setShowLabels] = useState(true);
  const [showExtents, setShowExtents] = useState(true);
  const [stepIdx, setStepIdx] = useState<number | null>(null);
  const [scenario, setScenario] = useState<Scenario>(emptyScenario());
  const [printMode, setPrintMode] = useState<'blank' | 'key' | null>(null);
  const [printContest, setPrintContest] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(true);
  const scroller = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const problem = problems.find((p) => p.id === currentId) ?? problems[0];
  const topo = useMemo(() => buildTopo(makeGeo(problem.layout)), [problem.layout]);

  // Autosave (debounced).
  useEffect(() => {
    const t = setTimeout(() => {
      setSaveOk(saveProblems(problems));
      saveCurrentId(currentId);
    }, 400);
    return () => clearTimeout(t);
  }, [problems, currentId]);

  const fit = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const g = makeGeo(problem.layout);
    const vbW = g.width + MARGIN.l + MARGIN.r;
    const vbH = g.height + MARGIN.t + MARGIN.b;
    const z = Math.min((el.clientWidth - 4) / vbW, Math.max(320, el.clientHeight - 4) / vbH);
    setZoom(Math.max(0.8, Math.min(12, z)));
  }, [problem.layout]);

  // Fit the map when a problem is opened (not on every edit).
  const fitRef = useRef(fit);
  fitRef.current = fit;
  useEffect(() => fitRef.current(), [currentId]);

  const flash = (m: string) => {
    setMessage(m);
    setTimeout(() => setMessage((x) => (x === m ? null : x)), 4000);
  };

  const update = useCallback(
    (fn: (p: Problem) => Problem) => {
      const next = { ...fn(problem), updated: new Date().toISOString() };
      setPast((h) => [...h.slice(-HISTORY), problem]);
      setFuture([]);
      setProblems((list) => list.map((p) => (p.id === next.id ? next : p)));
      setScenario(emptyScenario());
    },
    [problem]
  );

  const undo = () => {
    const prev = past[past.length - 1];
    if (!prev) return;
    setPast(past.slice(0, -1));
    setFuture([problem, ...future]);
    setProblems((list) => list.map((p) => (p.id === currentId ? prev : p)));
  };
  const redo = () => {
    const next = future[0];
    if (!next) return;
    setFuture(future.slice(1));
    setPast([...past, problem]);
    setProblems((list) => list.map((p) => (p.id === currentId ? next : p)));
  };

  const switchTo = (id: string) => {
    setCurrentId(id);
    setPast([]);
    setFuture([]);
    setSelectedId(null);
    setStepIdx(null);
    setScenario(emptyScenario());
    setTool({ type: 'select' });
  };

  const addProblem = (p: Problem) => {
    setProblems((list) => [...list.filter((x) => x.id !== p.id), p]);
    switchTo(p.id);
  };

  const selected = problem.elements.find((e) => e.id === selectedId) ?? null;
  const patchEl = (id: string, patch: Partial<El>) => update((p) => ({ ...p, elements: p.elements.map((e) => (e.id === id ? { ...e, ...patch } : e)) }));
  const deleteEl = (id: string) => {
    update((p) => ({ ...p, elements: p.elements.filter((e) => e.id !== id) }));
    setSelectedId(null);
  };
  const duplicateEl = (el: El) => {
    const kind = KIND_DEFS[el.kind];
    const s = snap(topo, el.x + 8, el.y, kind.place) ?? snap(topo, el.x, el.y + 8, kind.place);
    const copy = { ...el, id: newId(), x: s?.x ?? el.x, y: s?.y ?? el.y };
    update((p) => ({ ...p, elements: [...p.elements, copy] }));
    setSelectedId(copy.id);
    return copy;
  };

  const place = (x: number, y: number, keep: boolean) => {
    if (tool.type !== 'place') return;
    const s = snap(topo, x, y, KIND_DEFS[tool.kind].place);
    if (!s) {
      flash('Click inside an entry, crosscut or intersection.');
      return;
    }
    const el = makeElement({ kind: tool.kind, sub: tool.sub }, s.x, s.y, newId());
    if (el.kind === 'gas') el.text = '';
    update((p) => ({ ...p, elements: [...p.elements, el] }));
    setSelectedId(el.id);
    setRadialId(el.id);
    if (!keep) setTool({ type: 'select' });
  };
  const shiftDown = useRef(false);

  const cycleCell = (cx: number, cy: number) => {
    const g = makeGeo(problem.layout);
    const ty = cellType(g, cx, cy);
    if (ty === 'pillar' || ty === 'int') return;
    const cur = problem.layout.cells[cellKey(cx, cy)] ?? (ty === 'side' ? (cy === 0 ? 'open' : 'solid') : 'open');
    const next: SegState = cur === 'open' ? 'projected' : cur === 'projected' ? 'solid' : 'open';
    update((p) => ({ ...p, layout: { ...p.layout, cells: { ...p.layout.cells, [cellKey(cx, cy)]: next } } }));
  };

  const setLayout = (l: Layout) => update((p) => ({ ...p, layout: { ...l, cells: l.entries !== p.layout.entries || l.rows !== p.layout.rows ? remapCells(p.layout, l) : l.cells } }));

  // Keyboard shortcuts on the map.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      shiftDown.current = e.shiftKey;
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
        return;
      }
      if (e.key === 'Escape') {
        if (radialId) {
          setRadialId(null);
          return;
        }
        setTool({ type: 'select' });
        setSelectedId(null);
        return;
      }
      if (tab !== 'build' || !selected) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteEl(selected.id);
      } else if (e.key.startsWith('Arrow')) {
        e.preventDefault();
        const d = e.shiftKey ? 5 : 1;
        const dx = e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0;
        const dy = e.key === 'ArrowUp' ? d : e.key === 'ArrowDown' ? -d : 0;
        const s = snap(topo, selected.x + dx, selected.y + dy, KIND_DEFS[selected.kind].place);
        if (s) patchEl(selected.id, { x: s.x, y: s.y });
      } else if (e.key.toLowerCase() === 'r') {
        if (selected.kind === 'diagonal') patchEl(selected.id, { diag: selected.diag === '\\' ? '/' : '\\' });
        else if (selected.dir !== undefined) patchEl(selected.id, { dir: ((selected.dir ?? 0) + 45) % 360 });
      }
    };
    const onUp = (e: KeyboardEvent) => (shiftDown.current = e.shiftKey);
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onUp);
    };
  });

  // ------------------------------------------------------------ placement options ring

  const radialEl = tab === 'build' && radialId && radialId === selectedId ? selected : null;
  const radialAction = (a: RadialAction) => {
    if (!selected) return;
    if (a === 'delete') deleteEl(selected.id);
    else if (a === 'duplicate') setRadialId(duplicateEl(selected).id);
    else {
      setRadialId(null);
      // Edit: jump to the first field in the inspector (gas readings, placard wording, …).
      if (a === 'edit')
        setTimeout(() => {
          const insp = document.querySelector('.inspector');
          const f = insp?.querySelector<HTMLElement>(selected.kind === 'gas' ? 'input[type=number]' : 'textarea, input, select');
          insp?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          f?.focus();
        }, 0);
    }
  };
  const stage = (() => {
    const g = makeGeo(problem.layout);
    const vbW = g.width + MARGIN.l + MARGIN.r;
    const vbH = g.height + MARGIN.t + MARGIN.b;
    const w = Math.round(vbW * zoom);
    const h = Math.round(vbH * zoom);
    return { w, h, px: (x: number) => ((x + MARGIN.l) * w) / vbW, py: (y: number) => ((g.height - y + MARGIN.t) * h) / vbH };
  })();

  // ------------------------------------------------------------ analysis

  const buildBoard = useMemo(() => (tab === 'build' ? makeBoard(problem) : null), [problem, tab]);
  const buildHazards = useMemo(() => (buildBoard && showExtents ? hazards(buildBoard) : undefined), [buildBoard, showExtents]);
  const buildChecks = useMemo(() => (buildBoard ? designChecks(problem, buildBoard) : []), [buildBoard, problem]);
  const sol = useMemo(() => (tab === 'build' ? null : solve(problem)), [problem, tab]);

  const ventBase = useMemo(() => (tab === 'vent' && sol ? airflow(sol.board) : null), [tab, sol]);
  const ventScenario = useMemo(() => {
    if (tab !== 'vent' || !sol) return null;
    const els = applyScenario(problem, scenario);
    const board = makeBoard(problem, els);
    const af = airflow(board);
    const extinguished = new Set([...sol.plan.changed].filter(([, w]) => w === 'extinguished').map(([id]) => id));
    const removedPersons = new Set([...sol.plan.changed].filter(([, w]) => w === 'taken to the FAB').map(([id]) => id));
    const findings = ventFindings(board, af, sol.plan.hazards, {
      explored: sol.plan.explored,
      seen: sol.plan.seen,
      unaccounted: Math.max(0, problem.missing - sol.plan.personsFound),
      extinguished,
      removedPersons
    });
    return { af, findings };
  }, [tab, sol, problem, scenario]);

  const overlays: Overlays = {};
  if (tab === 'build') overlays.hazards = buildHazards;
  if (tab === 'solve' && sol) {
    const steps = sol.plan.steps;
    const upto = stepIdx ?? steps.length - 1;
    if (showExtents) overlays.hazards = sol.plan.hazards;
    if (stepIdx !== null) {
      const vis = new Set([...sol.plan.found].filter(([, i]) => i <= upto).map(([id]) => id));
      overlays.visible = vis;
      if (showExtents) overlays.hazards = sol.plan.hazards.filter((h) => vis.has(h.el.id));
      // Explored area so far: intersections reached and openings seen up to this step.
      const ex = new Set<string>();
      for (const n of topo.nodes.values()) if (n.fab) ex.add(n.id);
      steps.slice(0, upto + 1).forEach((s) => s.route.forEach((r) => ex.add(r.split('#')[0])));
      overlays.explored = ex;
      overlays.seen = steps[upto].seen;
      const st = steps[upto];
      overlays.route = st.route.map((r) => topo.nodes.get(r.split('#')[0])).filter((n): n is NonNullable<typeof n> => !!n).map((n) => ({ x: n.x, y: n.y }));
    } else overlays.seen = sol.plan.seen;
    overlays.stops = steps
      .slice(0, upto + 1)
      .filter((s) => s.n && s.at)
      .map((s) => {
        const n = topo.nodes.get(s.at!.split('#')[0])!;
        return { n: s.n!, x: n.x, y: n.y, current: stepIdx !== null && s === steps[upto] };
      });
  }
  if (tab === 'vent' && ventScenario) {
    overlays.flow = ventScenario.af.flow;
    if (showExtents && sol) overlays.hazards = sol.plan.hazards;
    overlays.faded = new Set(scenario.removed);
    overlays.extras = scenario.added;
  }

  const ventToggle = (id: string) => {
    const el = problem.elements.find((e) => e.id === id) ?? scenario.added.find((e) => e.id === id);
    if (!el) return;
    if (scenario.added.some((e) => e.id === id)) {
      setScenario({ ...scenario, added: scenario.added.filter((e) => e.id !== id) });
      return;
    }
    if (el.kind === 'door') {
      const cur = { ...el, ...(scenario.overrides[id] ?? {}) };
      setScenario({ ...scenario, overrides: { ...scenario.overrides, [id]: { ...(scenario.overrides[id] ?? {}), open: !cur.open } } });
    } else if (['perm-stopping', 'temp-stopping', 'seal', 'barricade', 'diagonal', 'fire', 'overcast'].includes(el.kind) || (el.kind === 'caved' && el.airtight) || (el.kind === 'water' && el.roofed)) {
      setScenario({ ...scenario, removed: scenario.removed.includes(id) ? scenario.removed.filter((x) => x !== id) : [...scenario.removed, id] });
    } else flash('Pick a stopping, door, seal, barricade, diagonal or fire.');
  };
  const ventBuild = (x: number, y: number) => {
    const s = snap(topo, x, y, 'across');
    if (!s) return flash('Click an entry or crosscut.');
    const near = scenario.added.find((e) => Math.hypot(e.x - s.x, e.y - s.y) < 6);
    if (near) setScenario({ ...scenario, added: scenario.added.filter((e) => e !== near) });
    else setScenario({ ...scenario, added: [...scenario.added, { ...makeElement({ kind: 'temp-stopping' }, s.x, s.y, newId('w')), text: 'TEMPORARY STOPPING (built)' }] });
  };

  // ------------------------------------------------------------ problems menu

  const onImport = async (f: File | undefined) => {
    if (!f) return;
    try {
      const p = await readProblemFile(f);
      if (problems.some((x) => x.id === p.id)) p.id = newId('p');
      addProblem(p);
      flash(`Imported “${p.title}”.`);
    } catch (e) {
      flash((e as Error).message);
    }
  };

  const doPrint = (mode: 'blank' | 'key', contestScale = false) => {
    setPrintMode(mode);
    setPrintContest(contestScale);
    setTimeout(() => {
      window.print();
      setTimeout(() => setPrintMode(null), 500);
    }, 150);
  };

  const sample = SAMPLES.find((s) => s.id === problem.id);
  const mapTool: Tool = tab === 'vent' ? (tool.type === 'vent-build' || tool.type === 'vent-toggle' ? tool : { type: 'select' }) : tab === 'solve' ? { type: 'select' } : tool;
  // The blank map shows only what A Card 5B puts on every map: objects in the FAB and air shafts.
  const blankForPrint = useMemo(() => {
    if (printMode !== 'blank') return null;
    const b = makeBoard(problem);
    const fab = (id: string) => !!b.topo.nodes.get(id)?.fab;
    const keep = (e: El) => {
      const q = b.placed.get(e.id);
      if (e.preMapped || (e.kind === 'x' && e.sub === 'shaft')) return true;
      if (!q) return false;
      if (q.loc.type === 'node') return fab(q.loc.node);
      if (q.loc.type === 'edge') {
        const ed = b.topo.edges.get(q.loc.edge)!;
        return fab(ed.a) && fab(ed.b);
      }
      return false;
    };
    return { ...problem, elements: problem.elements.filter(keep) };
  }, [printMode, problem]);
  const keySol = printMode === 'key' ? sol ?? solve(problem) : null;

  return (
    <div className="builder">
      <div className="builder-top">
        <h1 className="sr-only">Mine rescue problem builder</h1>
        <label className="prob-select">
          <span className="sr-only">Problem</span>
          <select value={currentId} onChange={(e) => switchTo(e.target.value)} data-testid="problem-select">
            {problems.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </label>
        <div className="top-actions">
          <button type="button" onClick={() => addProblem({ ...blankProblem('New problem') })}>
            New
          </button>
          <details className="menu">
            <summary className="button">Samples</summary>
            <div className="menu-pop">
              {SAMPLES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={(e) => {
                    closeMenu(e);
                    const fresh = s.make();
                    if (problems.some((p) => p.id === s.id)) fresh.id = newId('p');
                    addProblem(fresh);
                  }}
                >
                  <strong>{s.make().title}</strong>
                  <span className="small muted">{s.blurb}</span>
                </button>
              ))}
            </div>
          </details>
          <button type="button" onClick={() => addProblem({ ...JSON.parse(JSON.stringify(problem)), id: newId('p'), title: `${problem.title} (copy)` })}>
            Duplicate
          </button>
          <button type="button" onClick={() => fileInput.current?.click()}>
            Import
          </button>
          <input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={(e) => onImport(e.target.files?.[0]).finally(() => (e.target.value = ''))} />
          <button type="button" onClick={() => downloadProblem(problem)}>
            Export
          </button>
          <details className="menu">
            <summary className="button">Print</summary>
            <div className="menu-pop">
              <button type="button" onClick={(e) => (closeMenu(e), doPrint('blank'))}>
                <strong>Blank map — fit to page</strong>
                <span className="small muted">With only FAB objects and air shafts (A Card 5B)</span>
              </button>
              <button type="button" onClick={(e) => (closeMenu(e), doPrint('blank', true))}>
                <strong>Blank map — 1 in = 10 ft</strong>
                <span className="small muted">Contest scale for large-format paper; spans several letter pages</span>
              </button>
              <button type="button" onClick={(e) => (closeMenu(e), doPrint('key'))}>
                <strong>Key map and solution</strong>
                <span className="small muted">Statement, key map, mapping key and team stops</span>
              </button>
            </div>
          </details>
          <button
            type="button"
            className="danger"
            onClick={() => {
              if (!window.confirm(`Delete “${problem.title}” from this device?`)) return;
              const rest = problems.filter((p) => p.id !== problem.id);
              const list = rest.length ? rest : [blankProblem('New problem')];
              setProblems(list);
              switchTo(list[0].id);
            }}
          >
            Delete
          </button>
        </div>
      </div>
      {!saveOk && <p className="warn small">This browser is not saving problems (storage blocked). Use Export to keep your work.</p>}
      {sample && <p className="small muted">{problem.source}. Edits are saved on this device; open it again from Samples for a fresh copy.</p>}

      <div className="builder-tabs" role="tablist">
        {(
          [
            ['build', 'Build'],
            ['solve', 'Solve'],
            ['vent', 'Ventilation']
          ] as [Tab, string][]
        ).map(([t, label]) => (
          <button
            key={t}
            role="tab"
            type="button"
            aria-selected={tab === t}
            className={`tab${tab === t ? ' on' : ''}`}
            onClick={() => {
              setTab(t);
              setTool({ type: 'select' });
              if (t !== 'build') setSelectedId(null);
            }}
          >
            {label}
          </button>
        ))}
        <span className="spacer" />
        <div className="view-ctl">
          <button type="button" onClick={() => setZoom((z) => Math.max(0.6, z / 1.25))} aria-label="Zoom out">
            −
          </button>
          <button type="button" onClick={() => setZoom((z) => Math.min(16, z * 1.25))} aria-label="Zoom in">
            +
          </button>
          <button type="button" onClick={fit}>
            Fit
          </button>
          <label className="field check">
            <input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} /> <span>Text</span>
          </label>
          <label className="field check">
            <input type="checkbox" checked={showExtents} onChange={(e) => setShowExtents(e.target.checked)} /> <span>Gas/smoke extent</span>
          </label>
          {tab === 'build' && (
            <>
              <button type="button" onClick={undo} disabled={!past.length} aria-label="Undo" title="Undo (Ctrl+Z)">
                ↶
              </button>
              <button type="button" onClick={redo} disabled={!future.length} aria-label="Redo" title="Redo (Ctrl+Shift+Z)">
                ↷
              </button>
            </>
          )}
        </div>
      </div>

      <div className={`builder-grid tab-${tab}`}>
        {tab === 'build' && (
          <aside className="b-left">
            <Palette
              active={tool.type === 'place' ? (tool.sub ? `x:${tool.sub}` : tool.kind) : null}
              onPick={(it: PaletteItem) => {
                const off = tool.type === 'place' && tool.kind === it.kind && tool.sub === it.sub;
                setTool(off ? { type: 'select' } : { type: 'place', kind: it.kind, sub: it.sub, name: it.name });
                // On phones the palette is below the map: bring the map back into view.
                if (!off && window.innerWidth < 1000) scroller.current?.closest('.b-center')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
            />
          </aside>
        )}
        <div className="b-center">
          {tool.type === 'place' && tab === 'build' && (
            <p className="tool-hint" role="status">
              Click the map to place: <strong>{tool.name}</strong>. Shift-click to place several · Esc to stop.
            </p>
          )}
          {tool.type === 'layout' && <p className="tool-hint" role="status">Click openings to change them. Esc when done.</p>}
          {message && (
            <p className="tool-hint warn" role="alert">
              {message}
            </p>
          )}
          <div className="map-scroll" ref={scroller}>
            <div className="map-stage" style={{ width: stage.w, height: stage.h }}>
              <MapView
                problem={problem}
                zoom={zoom}
                selectedId={selectedId}
                tool={mapTool}
                showLabels={showLabels}
                overlays={overlays}
                editable={tab === 'build'}
                onSelect={(id) => {
                  setSelectedId(id);
                  if (id !== radialId) setRadialId(null);
                }}
                onElementTap={setRadialId}
                onMove={(id, x, y) => {
                  patchEl(id, { x, y });
                  setRadialId(null);
                }}
                onPlace={(x, y) => place(x, y, shiftDown.current)}
                onCell={cycleCell}
                onElementClick={ventToggle}
                onOpeningClick={ventBuild}
              />
              {radialEl && (
                <RadialMenu el={radialEl} x={stage.px(radialEl.x)} y={stage.py(radialEl.y)} width={stage.w} height={stage.h} onPatch={(patch) => patchEl(radialEl.id, patch)} onAction={radialAction} />
              )}
            </div>
          </div>
        </div>
        <aside className="b-right">
          {tab === 'build' &&
            (selected ? (
              <Inspector el={selected} topo={topo} onChange={(patch) => patchEl(selected.id, patch)} onDelete={() => deleteEl(selected.id)} onDuplicate={() => duplicateEl(selected)} onClose={() => setSelectedId(null)} />
            ) : (
              <>
                <ProblemPanel p={problem} onChange={(patch) => update((p) => ({ ...p, ...patch }))} onLayout={setLayout} layoutTool={tool.type === 'layout'} onLayoutTool={(on) => setTool(on ? { type: 'layout' } : { type: 'select' })} />
                <ElementList p={problem} topo={topo} selectedId={selectedId} onSelect={setSelectedId} />
                <Section title="Design checks" count={buildChecks.length} open={buildChecks.some((c) => c.level !== 'info')}>
                  <Checks checks={buildChecks} onSelect={setSelectedId} />
                </Section>
              </>
            ))}
          {tab === 'solve' && sol && (
            <SolvePanel
              sol={sol}
              stepIdx={stepIdx}
              setStepIdx={setStepIdx}
              onSelectEl={(id) => {
                setSelectedId(id);
                const i = sol.plan.found.get(id);
                if (stepIdx !== null && i !== undefined && i > stepIdx) setStepIdx(i);
              }}
            />
          )}
          {tab === 'vent' && ventScenario && ventBase && (
            <VentPanel p={problem} sc={scenario} setSc={setScenario} af={ventScenario.af} base={ventBase} findings={ventScenario.findings} tool={tool.type} setTool={(t) => setTool({ type: t })} />
          )}
        </aside>
      </div>

      {printMode && (
        <div className="print-sheet" aria-hidden="true">
          {printMode === 'key' && keySol && (
            <>
              <h2>{problem.title} — key map</h2>
              {problem.statement && <p className="print-text">{problem.statement}</p>}
              {problem.instructions && (
                <p className="print-text">
                  <strong>Written instructions:</strong> {problem.instructions}
                </p>
              )}
              <p>
                Missing persons: {problem.missing}. {problem.timeLimit ? `Time limit: ${problem.timeLimit} min.` : 'No time limit.'}
              </p>
            </>
          )}
          <MapView problem={printMode === 'blank' && blankForPrint ? blankForPrint : problem} zoom={1} selectedId={null} tool={{ type: 'select' }} showLabels printMode={printMode} printScale={printContest ? 10 : null} />
          {printMode === 'key' && keySol && (
            <div className="print-key">
              <h3>Mapping key</h3>
              <ol>
                {keySol.items.map((it) => (
                  <li key={it.el.id}>
                    {it.text} — {it.where} {it.bo ? '(Team + BO)' : '(Team)'}
                  </li>
                ))}
              </ol>
              <h3>Team stops</h3>
              <ol>
                {keySol.plan.steps.map((s, i) => (
                  <li key={i}>{s.n ? `#${s.n} ` : ''}{s.title}</li>
                ))}
              </ol>
              {problem.keyNotes && (
                <>
                  <h3>Key notes</h3>
                  <p className="print-text">{problem.keyNotes}</p>
                </>
              )}
            </div>
          )}
        </div>
      )}
      <p className="small muted builder-foot">
        Symbols follow the MSHA Mine Map Legend (2026 Coal Mine Rescue Rules, pp. 51–55). Problems are saved on this device only; use Export to share them.
      </p>
    </div>
  );
}
