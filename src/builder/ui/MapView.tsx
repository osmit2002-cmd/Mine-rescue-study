import { useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { KIND_DEFS } from '../catalog';
import type { Hazard } from '../extents';
import { acrossRot, buildTopo, cellRect, cellState, cellType, makeGeo, ribLines, snap, type Geo, type Topo } from '../geometry';
import { entryName, type El, type Layout, type Problem } from '../model';
import { outbyBand, pillarLabels, type PillarNumbering } from '../pillars';
import { MIN_ROOM } from '../layoutEdit';
import { mapLabel, SymbolShape } from './symbols';

export const MARGIN = { l: 34, r: 14, t: 14, b: 30 };

/** Margins around the map in feet: the bottom one also holds the drawn row of pillars outby the FAB. */
export const mapMargins = (layout: Layout) => ({ ...MARGIN, b: MARGIN.b + outbyBand(makeGeo(layout)) });

export type Tool = { type: 'select' } | { type: 'place'; kind: El['kind']; sub?: El['sub']; name: string } | { type: 'layout' } | { type: 'vent-build' } | { type: 'vent-toggle' };

export interface Overlays {
  hazards?: Hazard[];
  /** Base node ids and edge spans already explored (walk-through). */
  explored?: Set<string>;
  seen?: Map<string, [number, number][]>;
  /** Only these elements are drawn (walk-through: found so far). */
  visible?: Set<string> | null;
  /** Element ids drawn faded (changed/removed in a what-if). */
  faded?: Set<string>;
  route?: { x: number; y: number }[];
  stops?: { n: number; x: number; y: number; current: boolean }[];
  flow?: Map<string, number>;
  /** Extra elements drawn dashed (what-if temporary stoppings). */
  extras?: El[];
}

interface Props {
  problem: Problem;
  zoom: number;
  selectedId: string | null;
  tool: Tool;
  showLabels: boolean;
  overlays?: Overlays;
  printMode?: 'blank' | 'key' | null;
  /** Elements can be dragged (Build tab only). */
  editable?: boolean;
  onSelect?: (id: string | null) => void;
  onMove?: (id: string, x: number, y: number) => void;
  /** An element was tapped or clicked without being dragged. */
  onElementTap?: (id: string) => void;
  onPlace?: (x: number, y: number) => void;
  onCell?: (cx: number, cy: number) => void;
  onElementClick?: (id: string) => void;
  onOpeningClick?: (x: number, y: number) => void;
  /** Feet per inch when printing (10 = contest scale 1 in = 10 ft); null fits the page. */
  printScale?: number | null;
  /** Pillar numbering scheme; numbers are drawn when it is given and its `show` is on. */
  numbering?: PillarNumbering;
  /** Opening highlighted in the layout tool (its options ring is open), as "cx,cy". */
  activeCell?: string | null;
  /** Layout tool: a side room handle was dragged out to `depth` feet (under MIN_ROOM closes it), or tapped (depth null: toggle). */
  onRoom?: (side: 'left' | 'right', row: number, depth: number | null) => void;
}

const HZ_COLOR = (h: Hazard) => (h.cls.explosive ? '#dc2626' : h.el.kind === 'smoke' ? '#4b5563' : h.cls.irrespirable ? '#ea580c' : '#ca8a04');

function spanRect(t: Topo, eid: string, s0: number, s1: number, W: number) {
  const e = t.edges.get(eid)!;
  const f0 = e.len ? s0 / e.len : 0;
  const f1 = e.len ? s1 / e.len : 0;
  const x0 = e.ax + (e.bx - e.ax) * f0;
  const x1 = e.ax + (e.bx - e.ax) * f1;
  const y0 = e.ay + (e.by - e.ay) * f0;
  const y1 = e.ay + (e.by - e.ay) * f1;
  if (e.vertical) return { x: e.ax - W / 2, y: Math.min(y0, y1), w: W, h: Math.abs(y1 - y0) };
  return { x: Math.min(x0, x1), y: e.ay - W / 2, w: Math.abs(x1 - x0), h: W };
}

export interface HazardRect {
  /** Unique per rectangle, so React never reuses or keeps a stale one. */
  key: string;
  color: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The hatched rectangles that draw every contaminant and explosive extent (feet, y up). */
export function hazardRects(hazards: Hazard[], t: Topo, W: number): HazardRect[] {
  const out: HazardRect[] = [];
  hazards.forEach((h, hi) => {
    if (!h.cls.contaminant && !h.cls.explosive) return;
    const color = HZ_COLOR(h);
    for (const [eid, spans] of h.extent.edges)
      spans.forEach(([s0, s1], i) => {
        const r = spanRect(t, eid, s0, s1, W);
        out.push({ key: `h${hi}:${h.el.id}:${eid}:${i}`, color, x: r.x, y: r.y, w: Math.max(r.w, 0.5), h: Math.max(r.h, 0.5) });
      });
    for (const s of h.extent.nodes) {
      const n = t.nodes.get(s.split('#')[0]);
      if (n) out.push({ key: `hn${hi}:${h.el.id}:${s}`, color, x: n.x - W / 2, y: n.y - W / 2, w: W, h: W });
    }
  });
  return out;
}

export function MapView(props: Props) {
  const { problem, zoom, selectedId, tool, showLabels, overlays = {}, printMode = null } = props;
  const geo: Geo = useMemo(() => makeGeo(problem.layout), [problem.layout]);
  const topo = useMemo(() => buildTopo(geo), [geo]);
  const lines = useMemo(() => ribLines(geo), [geo]);
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number; x: number; y: number; moved: boolean } | null>(null);
  const [hoverCell, setHoverCell] = useState<string | null>(null);
  /** Side room handle being dragged: depth in feet so far. */
  const [roomDrag, setRoomDrag] = useState<{ side: 'left' | 'right'; row: number; depth: number; moved: boolean } | null>(null);
  const H = geo.height;
  const W = problem.layout.entryWidth;
  const k = Math.max(0.6, Math.min(1.6, W / 20));
  const Y = (y: number) => H - y;
  const M = mapMargins(problem.layout);
  const band = outbyBand(geo);
  const vbW = geo.width + M.l + M.r;
  const vbH = H + M.t + M.b;
  const print = printMode !== null;
  const numbering = props.numbering;
  /** Pillar number size: smaller in the half pillars outby the FAB. */
  const numSize = (cy: number) => Math.min(9, problem.layout.pillarWidth / 5, (cy < 0 ? band : problem.layout.pillarLength) / 3);
  const pillarNums = useMemo(
    () => (numbering && numbering.show && (printMode !== 'blank' || numbering.showOnBlankMap) ? pillarLabels(geo, numbering) : []),
    [geo, numbering, printMode]
  );

  const toFeet = (e: { clientX: number; clientY: number }) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const m = svg.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const p = pt.matrixTransform(m.inverse());
    return { x: p.x, y: H - p.y };
  };

  const onElDown = (e: RPointerEvent, el: El) => {
    if (print) return;
    e.stopPropagation();
    if (tool.type === 'vent-toggle') {
      props.onElementClick?.(el.id);
      return;
    }
    if (tool.type !== 'select') return;
    props.onSelect?.(el.id);
    if (!props.editable) return;
    const f = toFeet(e);
    svgRef.current?.setPointerCapture(e.pointerId);
    setDrag({ id: el.id, dx: el.x - f.x, dy: el.y - f.y, x: el.x, y: el.y, moved: false });
  };
  const roomDepthAt = (side: 'left' | 'right', x: number) => Math.max(0, Math.round((side === 'left' ? geo.colX[1] - x : x - geo.colX[2 * geo.E]) / 5) * 5);
  const onRoomDown = (e: RPointerEvent, side: 'left' | 'right', row: number) => {
    e.stopPropagation();
    svgRef.current?.setPointerCapture(e.pointerId);
    setRoomDrag({ side, row, depth: roomDepthAt(side, toFeet(e).x), moved: false });
  };
  const onMoveP = (e: RPointerEvent) => {
    if (roomDrag) {
      const d = roomDepthAt(roomDrag.side, toFeet(e).x);
      if (d !== roomDrag.depth) setRoomDrag({ ...roomDrag, depth: d, moved: true });
      return;
    }
    if (!drag) return;
    const f = toFeet(e);
    const el = problem.elements.find((x) => x.id === drag.id);
    if (!el) return;
    const s = snap(topo, f.x + drag.dx, f.y + drag.dy, KIND_DEFS[el.kind].place);
    if (s && (Math.abs(s.x - drag.x) > 0.3 || Math.abs(s.y - drag.y) > 0.3)) setDrag({ ...drag, x: s.x, y: s.y, moved: true });
  };
  const onUp = () => {
    if (roomDrag) {
      props.onRoom?.(roomDrag.side, roomDrag.row, roomDrag.moved ? roomDrag.depth : null);
      setRoomDrag(null);
      return;
    }
    if (drag?.moved) props.onMove?.(drag.id, drag.x, drag.y);
    else if (drag) props.onElementTap?.(drag.id);
    setDrag(null);
  };
  const onBgClick = (e: React.MouseEvent) => {
    if (print) return;
    const f = toFeet(e);
    if (tool.type === 'place') props.onPlace?.(f.x, f.y);
    else if (tool.type === 'vent-build') props.onOpeningClick?.(f.x, f.y);
    else if (tool.type === 'select') props.onSelect?.(null);
  };

  const cells: { cx: number; cy: number }[] = [];
  for (let cx = 0; cx <= 2 * geo.E; cx++) for (let cy = 0; cy <= 2 * geo.R - 1; cy++) cells.push({ cx, cy });

  const visible = (el: El) => !overlays.visible || overlays.visible.has(el.id);
  const els = [...problem.elements.filter(visible), ...(overlays.extras ?? [])];

  const symbolFor = (el: El, extra = false) => {
    const pos = drag?.id === el.id ? { x: drag.x, y: drag.y } : { x: el.x, y: el.y };
    const place = KIND_DEFS[el.kind].place;
    const rot = place === 'across' ? acrossRot(geo, pos.x, pos.y) : 0;
    const sel = el.id === selectedId && !print;
    const label = showLabels ? mapLabel(el) : [];
    const lx = place === 'across' ? (rot === 0 ? W / 2 + 1 : 2) : 4.2 * k;
    const ly = place === 'across' && rot !== 0 ? -W / 2 - 1.5 - (label.length - 1) * 3.4 * k : -(label.length - 1) * 1.7 * k + 1.1 * k;
    const faded = overlays.faded?.has(el.id);
    return (
      <g
        key={el.id + (extra ? '-x' : '')}
        className={`map-el${sel ? ' sel' : ''}`}
        transform={`translate(${pos.x} ${Y(pos.y)})`}
        onPointerDown={extra ? undefined : (e) => onElDown(e, el)}
        pointerEvents={extra ? 'none' : undefined}
        style={{ touchAction: tool.type === 'select' && props.editable ? 'none' : undefined, opacity: faded ? 0.3 : 1 }}
        data-el={el.id}
        role={print ? undefined : 'button'}
        aria-label={print ? undefined : `${KIND_DEFS[el.kind].name}${el.text ? `: ${el.text}` : ''}`}
      >
        {sel && <circle r={Math.max(6, W * 0.45)} className="map-sel-ring" />}
        {!print && <circle r={Math.max(4, W * 0.32)} fill="transparent" />}
        <g transform={rot ? `rotate(${rot})` : undefined} strokeDasharray={extra ? '2 1.4' : undefined}>
          <SymbolShape el={el} W={W} k={k} />
        </g>
        {label.length > 0 && (
          <text x={lx} y={ly} fontSize={3.4 * k} fill="#111" className="map-label" fontFamily="Arial, sans-serif">
            {label.map((t, i) => (
              <tspan key={i} x={lx} dy={i ? 3.7 * k : 0}>
                {t}
              </tspan>
            ))}
          </text>
        )}
      </g>
    );
  };

  // Print: at contest scale 1 in = 10 ft (viewBox units are feet), or fitted to the page.
  const widthStyle = print
    ? props.printScale
      ? { width: `${(vbW / props.printScale).toFixed(2)}in`, height: `${(vbH / props.printScale).toFixed(2)}in` }
      : { width: '100%', height: 'auto', maxHeight: '9.4in' }
    : { width: Math.round(vbW * zoom), height: Math.round(vbH * zoom) };

  return (
    <svg
      ref={svgRef}
      className={`mine-map tool-${tool.type}`}
      viewBox={`${-M.l} ${-M.t} ${vbW} ${vbH}`}
      style={widthStyle}
      onPointerMove={onMoveP}
      onPointerUp={onUp}
      onPointerCancel={() => {
        setDrag(null);
        setRoomDrag(null);
      }}
      role="img"
      aria-label={`Mine map: ${problem.layout.entries} entries, ${problem.layout.rows - 1} crosscuts`}
    >
      <defs>
        {['#dc2626', '#4b5563', '#ea580c', '#ca8a04', '#16a34a'].map((c) => (
          <pattern key={c} id={`hatch-${c.slice(1)}`} width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="3" stroke={c} strokeWidth="1.1" />
          </pattern>
        ))}
        <marker id="route-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0 0L10 5L0 10z" fill="#a8780f" />
        </marker>
        <marker id="air-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto">
          <path d="M0 0L10 5L0 10z" fill="#2563eb" />
        </marker>
      </defs>
      <rect x={-M.l} y={-M.t} width={vbW} height={vbH} fill="#fff" onClick={onBgClick} />
      {/* Solid ground (screen only) */}
      {!print &&
        cells.map(({ cx, cy }) => {
          if (cellState(geo, cx, cy) !== 'solid') return null;
          const r = cellRect(geo, cx, cy);
          return <rect key={`s${cx},${cy}`} x={r.x} y={Y(r.y + r.h)} width={r.w} height={r.h} className="map-solid" onClick={onBgClick} />;
        })}
      {/* Pillars outby the FAB, cut in half by the map edge (drawing only: outby the FAB is not part of the problem) */}
      {band > 0 && (
        <g pointerEvents="none">
          {!print &&
            Array.from({ length: geo.E - 1 }, (_, i) => {
              const cx = 2 * i + 2;
              return <rect key={`ob${cx}`} x={geo.colX[cx]} y={Y(0)} width={geo.colW[cx]} height={band} className="map-solid" />;
            })}
          <g stroke="#111" strokeWidth={0.7} strokeLinecap="square">
            {Array.from({ length: geo.E - 1 }, (_, i) => {
              const cx = 2 * i + 2;
              const x0 = geo.colX[cx];
              const x1 = x0 + geo.colW[cx];
              const yb = Y(-band);
              return <path key={`obl${cx}`} d={`M${x0} ${yb}V${Y(0)}H${x1}V${yb}`} fill="none" />;
            })}
            {/* Outer ribs of the outside entries run on outby. */}
            <line x1={geo.colX[1]} y1={Y(0)} x2={geo.colX[1]} y2={Y(-band)} />
            <line x1={geo.colX[2 * geo.E]} y1={Y(0)} x2={geo.colX[2 * geo.E]} y2={Y(-band)} />
            {(['l', 'r'] as const).map((side) => {
              const cx = side === 'l' ? 0 : 2 * geo.E;
              return cellState(geo, cx, 0) === 'solid' ? null : <line key={side} x1={geo.colX[cx]} y1={Y(0)} x2={geo.colX[cx] + geo.colW[cx]} y2={Y(0)} />;
            })}
          </g>
        </g>
      )}
      {/* Openings: click target */}
      {cells.map(({ cx, cy }) => {
        const st = cellState(geo, cx, cy);
        const ty = cellType(geo, cx, cy);
        if (ty === 'pillar') return null;
        if (st === 'solid' && tool.type !== 'layout') return null;
        const r = cellRect(geo, cx, cy);
        const key = `${cx},${cy}`;
        const layoutTool = tool.type === 'layout';
        return (
          <rect
            key={`o${key}`}
            x={r.x}
            y={Y(r.y + r.h)}
            width={r.w}
            height={r.h}
            className={`map-open${st === 'projected' ? ' projected' : ''}${layoutTool ? ' editable' : ''}${layoutTool && (hoverCell === key || props.activeCell === key) ? ' hover' : ''}${layoutTool && st === 'solid' ? ' solid' : ''}`}
            onClick={(e) => {
              if (layoutTool) {
                if (ty !== 'int') props.onCell?.(cx, cy);
              } else onBgClick(e);
            }}
            onPointerEnter={layoutTool ? () => setHoverCell(key) : undefined}
            onPointerLeave={layoutTool ? () => setHoverCell(null) : undefined}
          >
            {layoutTool && <title>{ty === 'int' ? 'Intersection (follows its openings)' : `${st === 'open' ? 'Mined' : st === 'projected' ? 'Projected' : 'Not mined'}: click to change`}</title>}
          </rect>
        );
      })}
      {/* Walk-through: explored openings */}
      {!print && overlays.seen &&
        [...overlays.seen].flatMap(([eid, spans]) =>
          spans.map(([s0, s1], i) => {
            const r = spanRect(topo, eid, s0, s1, W);
            return <rect key={`x${eid}${i}`} x={r.x} y={Y(r.y + r.h)} width={r.w} height={r.h} fill="#16a34a" opacity={0.13} pointerEvents="none" />;
          })
        )}
      {!print && overlays.explored &&
        [...overlays.explored].map((id) => {
          const n = topo.nodes.get(id);
          if (!n || n.end) return null;
          return <rect key={`xn${id}`} x={n.x - W / 2} y={Y(n.y + W / 2)} width={W} height={W} fill="#16a34a" opacity={0.13} pointerEvents="none" />;
        })}
      {/* Smoke and gas extents: redrawn from the full list on every change, so no stale area is left behind. */}
      {!print &&
        hazardRects(overlays.hazards ?? [], topo, W).map((r) => (
          <rect key={r.key} x={r.x} y={Y(r.y + r.h)} width={r.w} height={r.h} fill={`url(#hatch-${r.color.slice(1)})`} opacity={0.55} pointerEvents="none" />
        ))}
      {/* Rib lines */}
      <g stroke="#111" strokeWidth={0.7} strokeLinecap="square" pointerEvents="none">
        {lines.map((l, i) => (
          <line key={i} x1={l.x1} y1={Y(l.y1)} x2={l.x2} y2={Y(l.y2)} strokeDasharray={l.dotted ? '2.2 1.6' : undefined} />
        ))}
      </g>
      {/* Layout tool: a grab handle at each end of every crosscut pulls a side room out (or pushes it back in). */}
      {!print && tool.type === 'layout' && props.onRoom &&
        Array.from({ length: geo.R - 1 }, (_, j) => j + 1).flatMap((r) =>
          (['left', 'right'] as const).map((side) => {
            const cx = side === 'left' ? 0 : 2 * geo.E;
            const rib = side === 'left' ? geo.colX[1] : geo.colX[2 * geo.E];
            const s = side === 'left' ? -1 : 1;
            const open = cellState(geo, cx, 2 * r) !== 'solid';
            const dragging = roomDrag && roomDrag.side === side && roomDrag.row === r ? roomDrag : null;
            const depth = dragging ? dragging.depth : open ? geo.colW[cx] : 0;
            const yc = geo.rowY[2 * r] + W / 2;
            const hx = rib + s * depth;
            return (
              <g key={`rh${side}${r}`} className={`room-handle${dragging ? ' dragging' : ''}`} data-room={`${side}${r}`}>
                {dragging && dragging.moved && (
                  <rect
                    x={Math.min(rib, hx)}
                    y={Y(geo.rowY[2 * r] + W)}
                    width={Math.abs(hx - rib)}
                    height={W}
                    className={`room-preview${depth < MIN_ROOM ? ' closing' : ''}`}
                    pointerEvents="none"
                  />
                )}
                <rect
                  x={hx - (s < 0 ? 4.5 : 0)}
                  y={Y(yc) - W / 2}
                  width={4.5}
                  height={W}
                  rx={1.2}
                  className="room-grip"
                  style={{ touchAction: 'none' }}
                  onPointerDown={(e) => onRoomDown(e, side, r)}
                >
                  <title>{open ? 'Drag to make this side room deeper or shallower; drag back to the entry to close it; tap to close' : 'Drag out to pull a side room out of this crosscut; tap for a room'}</title>
                </rect>
                {dragging && dragging.moved && (
                  <text x={hx + s * 6} y={Y(yc) + 1.5} fontSize={4} textAnchor={s < 0 ? 'end' : 'start'} className="room-depth" pointerEvents="none">
                    {depth < MIN_ROOM ? 'close' : `${depth} ft`}
                  </text>
                )}
              </g>
            );
          })
        )}
      {/* Pillar numbers */}
      {pillarNums.length > 0 && (
        <g className="map-pillar-nums" fontFamily="Arial, sans-serif" textAnchor="middle" pointerEvents="none">
          {pillarNums.map((p) => (
            <text key={`pn${p.cx},${p.cy}`} x={p.x} y={Y(p.y) + numSize(p.cy) * 0.35} fontSize={numSize(p.cy)} fill={print ? '#333' : '#8a7a5c'} fontWeight={700} data-pillar={p.label}>
              {p.label}
            </text>
          ))}
        </g>
      )}
      {/* Labels (not on a blank contest map: maps are not labeled, General Information rule 7) */}
      {printMode !== 'blank' && (
        <g className="map-axis" fontFamily="Arial, sans-serif" fill="#333" pointerEvents="none">
          {Array.from({ length: geo.E }, (_, i) => (
            <text key={`en${i}`} x={geo.colX[2 * i + 1] + W / 2} y={H + band + 8} fontSize={4} textAnchor="middle">
              {entryName(problem.layout, i).replace(/\s*Entry$/i, '')}
            </text>
          ))}
          <text x={-M.l + 3} y={Y(W / 2) + 1.8} fontSize={5} fontWeight={700}>
            FAB
          </text>
          {Array.from({ length: geo.R - 1 }, (_, j) => {
            const r = j + 1;
            return (
              <text key={`xc${r}`} x={-M.l + 3} y={Y(geo.rowY[2 * r] + W / 2) + 1.5} fontSize={4}>
                XC {problem.layout.xcStart + r}
              </text>
            );
          })}
          <text x={-M.l + 3} y={-M.t + 6} fontSize={3.4} fill="#666">
            1 in = 10 ft · pillars {problem.layout.pillarWidth}×{problem.layout.pillarLength} ft
          </text>
        </g>
      )}
      {/* Airflow */}
      {!print && overlays.flow &&
        [...overlays.flow].map(([eid, q]) => {
          const e = topo.edges.get(eid);
          if (!e) return null;
          const mx = (e.ax + e.bx) / 2;
          const my = (e.ay + e.by) / 2;
          const dx = (e.bx - e.ax) / (e.len || 1);
          const dy = (e.by - e.ay) / (e.len || 1);
          const s = q > 0 ? 1 : -1;
          const L = Math.min(12, e.len * 0.4);
          const w = 0.6 + Math.abs(q) * 1.4;
          return (
            <line
              key={`af${eid}`}
              x1={mx - dx * s * L / 2}
              y1={Y(my - dy * s * L / 2)}
              x2={mx + dx * s * L / 2}
              y2={Y(my + dy * s * L / 2)}
              stroke="#2563eb"
              strokeWidth={w}
              markerEnd="url(#air-arrow)"
              pointerEvents="none"
            />
          );
        })}
      {/* Route and stops */}
      {!print && overlays.route && overlays.route.length > 1 && (
        <polyline points={overlays.route.map((p) => `${p.x},${Y(p.y)}`).join(' ')} fill="none" stroke="#a8780f" strokeWidth={1.4} strokeDasharray="3 2" markerEnd="url(#route-arrow)" pointerEvents="none" />
      )}
      {/* Elements */}
      <g>{els.map((el) => symbolFor(el, !!overlays.extras?.includes(el)))}</g>
      {!print &&
        overlays.stops?.map((s) => (
          <g key={`st${s.n}`} transform={`translate(${s.x - W * 0.28} ${Y(s.y) + W * 0.28})`} pointerEvents="none">
            <circle r={3.8} fill={s.current ? '#a8780f' : '#fff'} stroke="#a8780f" strokeWidth={0.7} />
            <text y={1.4} fontSize={4} textAnchor="middle" fill={s.current ? '#fff' : '#a8780f'} fontWeight={700} fontFamily="Arial, sans-serif">
              {s.n}
            </text>
          </g>
        ))}
    </svg>
  );
}
