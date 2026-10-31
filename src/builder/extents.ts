/**
 * How far smoke and gases extend (Rule 24E):
 * - Smoke extends to a placard stating the "end of smoke" or a separation intended or indicated to be airtight.
 * - A gas placard in an intersection is confined to the intersection.
 * - Elsewhere a gas extends, in the direction of team travel, to a gas placard indicating a change, an airtight
 *   separation, or the next normal/required area to be tested (the imaginary line of the next intersection, an
 *   object or condition that prohibits further travel, or a face). A gas placard side by side with an
 *   inaccessible condition extends to the other side of the condition.
 */
import { buildGraph, endOf, otherEnd, subOfPlaced, type Board, type Graph, type Placed } from './graph';
import type { El } from './model';
import { airEffect, classifyGas, SMOKE_CLASS, travelBlock, type GasClass } from './rules';

export interface Extent {
  /** Covered intervals [s0, s1] along each edge (feet from end a). */
  edges: Map<string, [number, number][]>;
  /** Covered sub-nodes (air graph). */
  nodes: Set<string>;
}

export interface Hazard {
  el: El;
  cls: GasClass;
  extent: Extent;
}

const emptyExtent = (): Extent => ({ edges: new Map(), nodes: new Set() });

/** Merge overlapping or touching spans on each edge, so every stretch of an opening is covered once. */
function normalize(x: Extent): Extent {
  for (const [eid, spans] of x.edges) {
    const out: [number, number][] = [];
    for (const [a, b] of [...spans].sort((p, q) => p[0] - q[0] || p[1] - q[1])) {
      const last = out[out.length - 1];
      if (last && a <= last[1] + 0.01) last[1] = Math.max(last[1], b);
      else out.push([a, b]);
    }
    x.edges.set(eid, out);
  }
  return x;
}

function addSpan(x: Extent, edge: string, s0: number, s1: number) {
  const lo = Math.min(s0, s1);
  const hi = Math.max(s0, s1);
  x.edges.set(edge, [...(x.edges.get(edge) ?? []), [lo, hi]]);
}

/** Which end of each edge the team reaches first: shortest travel from the FAB, respecting every travel block. */
export function approachSides(board: Board): Map<string, 'a' | 'b' | 'both'> {
  const g = buildGraph(board, 'travel');
  const dist = new Map<string, number>();
  const queue: [string, number][] = [];
  for (const [id, s] of g.subs) if (s.node.fab) queue.push([id, 0]);
  // Dijkstra (small graphs: a sorted array is fine).
  while (queue.length) {
    queue.sort((a, b) => a[1] - b[1]);
    const [u, d] = queue.shift()!;
    if (dist.has(u)) continue;
    dist.set(u, d);
    for (const eid of g.adj.get(u) ?? []) {
      const e = board.topo.edges.get(eid)!;
      if ((board.onEdge.get(eid) ?? []).some((p) => travelBlock(p.el))) continue;
      const v = otherEnd(g, eid, u);
      if (!dist.has(v)) queue.push([v, d + e.len]);
    }
  }
  const out = new Map<string, 'a' | 'b' | 'both'>();
  for (const [eid, [a, b]] of g.ends) {
    const da = dist.get(a) ?? Infinity;
    const db = dist.get(b) ?? Infinity;
    out.set(eid, da === db ? 'both' : da < db ? 'a' : 'b');
  }
  return out;
}

/** The far limit when walking from s toward one end of the edge for a gas placard. */
function gasWalk(board: Board, g: Graph, edgeId: string, from: Placed, toward: 'a' | 'b'): [number, number] {
  const e = board.topo.edges.get(edgeId)!;
  const W = board.problem.layout.entryWidth;
  const dir = toward === 'b' ? 1 : -1;
  const s = from.s;
  const endSub = g.ends.get(edgeId)![toward === 'a' ? 0 : 1];
  const endIsDeadEnd = g.subs.get(endSub)!.node.end;
  let limit = toward === 'b' ? (endIsDeadEnd ? e.len : e.len - W / 2) : endIsDeadEnd ? 0 : W / 2;
  if (dir * (limit - s) < 0) limit = s;
  for (const p of board.onEdge.get(edgeId) ?? []) {
    if (p === from) continue;
    const near = toward === 'b' ? p.s0 : p.s1;
    const far = toward === 'b' ? p.s1 : p.s0;
    if (dir * (near - s) < -0.01 && dir * (far - s) < -0.01) continue; // behind the placard
    let stop: number | null = null;
    if (p.el.kind === 'gas' && Math.abs(p.s - s) > 0.5) stop = p.s;
    else if (airEffect(p.el) === 'block') stop = near;
    else if (travelBlock(p.el)?.type === 'inaccessible') stop = Math.abs(near - s) <= 6 ? far : near;
    if (stop !== null && dir * (stop - limit) < 0) limit = stop;
  }
  return [s, limit];
}

export function gasExtent(board: Board, g: Graph, p: Placed, approach: Map<string, 'a' | 'b' | 'both'>): Extent {
  const x = emptyExtent();
  if (p.loc.type === 'node') {
    x.nodes.add(subOfPlaced(g, p) ?? p.loc.node);
    return x;
  }
  if (p.loc.type !== 'edge') return x;
  const side = approach.get(p.loc.edge) ?? 'both';
  // Travel runs from the approach end toward the other end.
  const towards: ('a' | 'b')[] = side === 'a' ? ['b'] : side === 'b' ? ['a'] : ['a', 'b'];
  for (const t of towards) {
    const [s0, s1] = gasWalk(board, g, p.loc.edge, p, t);
    addSpan(x, p.loc.edge, s0, s1);
  }
  return normalize(x);
}

/** Smoke: flood from the placard until "end of smoke" or another smoke placard, an airtight separation, or an inaccessible condition. */
export function smokeExtent(board: Board, g: Graph, p: Placed, approach: Map<string, 'a' | 'b' | 'both'>): Extent {
  const x = emptyExtent();
  const seen = new Set<string>();
  // Smoke placards (this one included) mark the edge of the smoke, so a flood coming back around stops at them.
  const stopsAt = (q: Placed) => q.el.kind === 'smoke-end' || q.el.kind === 'smoke' || airEffect(q.el) === 'block' || travelBlock(q.el)?.type === 'inaccessible';
  /** Walk an edge from position s toward an end; returns true if it reaches that end. `start` is skipped. */
  const walk = (edgeId: string, s: number, toward: 'a' | 'b', start: Placed | null = null): boolean => {
    const e = board.topo.edges.get(edgeId)!;
    const dir = toward === 'b' ? 1 : -1;
    let limit = toward === 'b' ? e.len : 0;
    let reached = true;
    for (const q of board.onEdge.get(edgeId) ?? []) {
      if (q === start || !stopsAt(q)) continue;
      const near = toward === 'b' ? q.s0 : q.s1;
      if (dir * (near - s) < -0.01) continue;
      if (dir * (near - limit) < 0) {
        limit = near;
        reached = false;
      }
    }
    addSpan(x, edgeId, s, limit);
    return reached;
  };
  const enterNode = (sub: string) => {
    if (seen.has(`n:${sub}`)) return;
    seen.add(`n:${sub}`);
    if (g.subs.get(sub)?.node.end) return;
    x.nodes.add(sub);
    for (const eid of g.adj.get(sub) ?? []) {
      const end = endOf(g, eid, sub);
      if (seen.has(`e:${eid}:${end}`)) continue;
      seen.add(`e:${eid}:${end}`);
      const e = board.topo.edges.get(eid)!;
      // A stopper sitting right at the intersection (gas placards do not stop smoke).
      if (walk(eid, end === 'a' ? 0 : e.len, end === 'a' ? 'b' : 'a')) enterNode(otherEnd(g, eid, sub));
    }
  };
  if (p.loc.type === 'node') {
    enterNode(subOfPlaced(g, p) ?? p.loc.node);
    return normalize(x);
  }
  if (p.loc.type !== 'edge') return x;
  const side = approach.get(p.loc.edge) ?? 'both';
  const towards: ('a' | 'b')[] = side === 'a' ? ['b'] : side === 'b' ? ['a'] : ['a', 'b'];
  const [ea, eb] = g.ends.get(p.loc.edge)!;
  for (const t of towards) {
    // Do not walk back along this edge from the end the smoke flows into.
    seen.add(`e:${p.loc.edge}:${t}`);
    if (walk(p.loc.edge, p.s, t, p)) enterNode(t === 'a' ? ea : eb);
  }
  return normalize(x);
}

/**
 * Every smoke and gas placard with its class and extent. Always computed from scratch for the whole map, so any
 * change (a placard or stopping added, moved or removed) redraws every extent, not just those near the change.
 */
export function hazards(board: Board, approach = approachSides(board)): Hazard[] {
  const g = buildGraph(board, 'air');
  const out: Hazard[] = [];
  for (const p of board.placed.values()) {
    if (p.el.kind === 'gas') out.push({ el: p.el, cls: classifyGas(p.el), extent: gasExtent(board, g, p, approach) });
    else if (p.el.kind === 'smoke') out.push({ el: p.el, cls: SMOKE_CLASS, extent: smokeExtent(board, g, p, approach) });
  }
  return out;
}

/** Is a placed element inside the extent (a point within an interval, or in a covered intersection)? */
export function contains(x: Extent, g: Graph, p: Placed): boolean {
  if (p.loc.type === 'node') return x.nodes.has(subOfPlaced(g, p) ?? p.loc.node);
  if (p.loc.type !== 'edge') return false;
  return (x.edges.get(p.loc.edge) ?? []).some(([a, b]) => p.s1 >= a - 0.5 && p.s0 <= b + 0.5);
}

/**
 * Do two extents overlap or touch: a shared intersection, overlapping intervals on an edge, or an interval that
 * reaches the imaginary line of an intersection covered by the other?
 */
export function touches(x: Extent, y: Extent, g: Graph): boolean {
  for (const n of x.nodes) if (y.nodes.has(n)) return true;
  for (const [eid, spans] of x.edges) {
    const other = y.edges.get(eid);
    if (other) for (const [a0, a1] of spans) for (const [b0, b1] of other) if (a0 <= b1 + 0.5 && b0 <= a1 + 0.5) return true;
  }
  const W = g.board.problem.layout.entryWidth;
  const reaches = (a: Extent, nodes: Set<string>) => {
    for (const [eid, spans] of a.edges) {
      const ends = g.ends.get(eid);
      const e = g.board.topo.edges.get(eid);
      if (!ends || !e) continue;
      for (const [s0, s1] of spans) {
        if (s0 <= W / 2 + 0.5 && nodes.has(ends[0])) return true;
        if (s1 >= e.len - W / 2 - 0.5 && nodes.has(ends[1])) return true;
      }
    }
    return false;
  };
  return reaches(x, y.nodes) || reaches(y, x.nodes);
}
