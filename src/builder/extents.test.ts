import { describe, expect, it } from 'vitest';
import { makeElement } from './catalog';
import { hazards, type Hazard } from './extents';
import { nodeId } from './geometry';
import { makeBoard } from './graph';
import { blankProblem, defaultLayout, type El, type Problem } from './model';
import { at } from './samples';
import { hazardRects } from './ui/MapView';

let n = 0;
const mk = (kind: El['kind'], p: { x: number; y: number }, extra: Partial<El> = {}): El => ({ ...makeElement({ kind }, p.x, p.y, `r${++n}`), ...extra });

function prob(els: (l: Problem['layout']) => El[]): Problem {
  const p = blankProblem('recalc');
  p.layout = defaultLayout(3, 5);
  p.elements = els(p.layout);
  return p;
}
const withEls = (p: Problem, elements: El[]): Problem => ({ ...p, elements });

/** Everything an extent covers, as sorted strings, for comparing two computations. */
function cover(hz: Hazard[]): string[] {
  const out: string[] = [];
  for (const h of hz) {
    for (const [eid, spans] of h.extent.edges) for (const [a, b] of spans) out.push(`${h.el.id} ${eid} ${a.toFixed(2)}-${b.toFixed(2)}`);
    for (const s of h.extent.nodes) out.push(`${h.el.id} ${s}`);
  }
  return out.sort();
}
const rectKeys = (p: Problem) => {
  const b = makeBoard(p);
  return hazardRects(hazards(b), b.topo, p.layout.entryWidth);
};

describe('gas and smoke extents recalculate for the whole map after every change', () => {
  const base = prob((l) => [
    mk('smoke', at.entry(l, 0, 1, 0.3)),
    mk('gas', at.entry(l, 2, 3, 0.3), { ch4: 2, co: 0, o2: 20 })
  ]);
  const smokeId = base.elements[0].id;
  const smokeOf = (hz: Hazard[]) => hz.find((h) => h.el.id === smokeId)!;

  it('covers each stretch of an opening once, so no area is drawn twice', () => {
    for (const h of hazards(makeBoard(base)))
      for (const spans of h.extent.edges.values())
        for (let i = 1; i < spans.length; i++) expect(spans[i][0]).toBeGreaterThan(spans[i - 1][1]);
  });

  it('gives every drawn extent rectangle a unique key, so none is left behind on the map', () => {
    const rects = rectKeys(base);
    expect(rects.length).toBeGreaterThan(10);
    expect(new Set(rects.map((r) => r.key)).size).toBe(rects.length);
  });

  it('shrinks smoke everywhere, not just near the change, when an end-of-smoke placard is added', () => {
    const before = smokeOf(hazards(makeBoard(base)));
    expect(before.extent.nodes.has(nodeId(0, 4))).toBe(true); // far inby, well away from the next change
    expect(before.extent.nodes.has(nodeId(2, 4))).toBe(true);
    const cut = withEls(base, [...base.elements, mk('smoke-end', at.entry(base.layout, 0, 1, 0.8))]);
    const after = smokeOf(hazards(makeBoard(cut)));
    expect(after.extent.nodes.size).toBe(0);
    expect([...after.extent.edges.keys()]).toHaveLength(1);
    // Drawn rectangles shrink to match: nothing from the old flood survives.
    expect(rectKeys(cut).filter((r) => r.key.includes(smokeId)).length).toBe(1);
  });

  it('expands again when the placard is removed, and matches a fresh computation after each step', () => {
    const cutEl = mk('smoke-end', at.entry(base.layout, 0, 1, 0.8));
    const stopEl = mk('perm-stopping', at.entry(base.layout, 1, 2, 0.5));
    const steps = [
      base.elements,
      [...base.elements, cutEl],
      [...base.elements, cutEl, stopEl],
      [...base.elements, stopEl],
      base.elements
    ];
    const results = steps.map((els) => cover(hazards(makeBoard(withEls(base, els)))));
    // Undoing back to the start restores exactly the original extents.
    expect(results[4]).toEqual(results[0]);
    expect(results[1].length).toBeLessThan(results[0].length);
    // Each result is the same as building that map from nothing (no state carried over from the previous edit).
    steps.forEach((els, i) => expect(cover(hazards(makeBoard(prob(() => els))))).toEqual(results[i]));
  });

  it('moves a gas extent with its placard and leaves nothing at the old spot', () => {
    const gasId = base.elements[1].id;
    const moved = withEls(
      base,
      base.elements.map((e) => (e.id === gasId ? { ...e, ...at.entry(base.layout, 2, 0, 0.3) } : e))
    );
    const old = hazards(makeBoard(base)).find((h) => h.el.id === gasId)!;
    const now = hazards(makeBoard(moved)).find((h) => h.el.id === gasId)!;
    const oldEdges = [...old.extent.edges.keys()];
    const newEdges = [...now.extent.edges.keys()];
    expect(newEdges).toHaveLength(1);
    expect(newEdges.some((e) => oldEdges.includes(e))).toBe(false);
  });
});
