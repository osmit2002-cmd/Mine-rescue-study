import { describe, expect, it } from 'vitest';
import { makeElement } from './catalog';
import { buildTopo, cellKey, locate, locName, makeGeo } from './geometry';
import { editLayout, openingState } from './layoutEdit';
import { normalizeProblem, sideDepth } from './model';
import { blankProblem, defaultLayout, type El, type Problem } from './model';
import { SAMPLES } from './samples';

/** A 3-entry, 4-row problem with a gas placard in No. 2 Entry between XC 1 and XC 2 and a barricade at the face of No. 3. */
function fixture(): Problem {
  const p = blankProblem('t');
  p.layout = defaultLayout(3, 4);
  const g = makeGeo(p.layout);
  const gas: El = { ...makeElement({ kind: 'gas' }, g.colX[3] + 10, g.rowY[3] + 30, 'gas'), ch4: 1 };
  const bar = makeElement({ kind: 'barricade' }, g.colX[5] + 10, g.rowY[7] + 20, 'bar');
  p.elements = [gas, bar];
  p.layout.cells = { [cellKey(4, 2)]: 'solid', [cellKey(3, 7)]: 'projected' };
  return p;
}
const where = (p: Problem, id: string) => {
  const t = buildTopo(makeGeo(p.layout));
  const e = p.elements.find((x) => x.id === id)!;
  return locName(t, locate(t, e.x, e.y));
};

describe('editing the mine layout', () => {
  it('adds a crosscut at the face: items and overrides at the face move inby with it', () => {
    const p = fixture();
    expect(where(p, 'bar')).toBe('No. 3 Entry inby Crosscut 3');
    const r = editLayout(p, { type: 'add-row' });
    expect(r.lost).toEqual([]);
    expect(r.problem.layout.rows).toBe(5);
    expect(where(r.problem, 'bar')).toBe('No. 3 Entry inby Crosscut 4');
    expect(where(r.problem, 'gas')).toBe('No. 2 Entry between Crosscut 1 and Crosscut 2');
    expect(r.problem.layout.cells).toEqual({ [cellKey(4, 2)]: 'solid', [cellKey(3, 9)]: 'projected' });
  });

  it('removes the last crosscut, dropping only what was in it', () => {
    const p = fixture();
    const r = editLayout(p, { type: 'remove-row' });
    expect(r.problem.layout.rows).toBe(3);
    expect(r.lost).toEqual([]);
    expect(where(r.problem, 'bar')).toBe('No. 3 Entry inby Crosscut 2');
    const r2 = editLayout(r.problem, { type: 'remove-row' });
    expect(r2.lost.map((e) => e.id)).toEqual(['gas']);
    expect(editLayout(r2.problem, { type: 'remove-row' }).refused).toMatch(/at least one crosscut/);
  });

  it('adds an entry on the left: everything shifts right and keeps its entry', () => {
    const p = fixture();
    p.layout.entryNames = ['Track', 'Belt', 'Return'];
    const r = editLayout(p, { type: 'add-entry', side: 'left' });
    expect(r.problem.layout.entries).toBe(4);
    expect(r.problem.layout.entryNames).toEqual(['', 'Track', 'Belt', 'Return']);
    expect(where(r.problem, 'gas')).toBe('Belt between Crosscut 1 and Crosscut 2');
    expect(r.problem.layout.cells[cellKey(6, 2)]).toBe('solid');
  });

  it('adds and removes an entry on the right without moving anything else', () => {
    const p = fixture();
    const r = editLayout(p, { type: 'add-entry', side: 'right' });
    expect(r.problem.elements).toEqual(p.elements);
    expect(r.problem.layout.entries).toBe(4);
    const back = editLayout(r.problem, { type: 'remove-entry', side: 'right' });
    expect(back.problem.elements).toEqual(p.elements);
    expect(back.lost).toEqual([]);
    const gone = editLayout(p, { type: 'remove-entry', side: 'right' });
    expect(gone.lost.map((e) => e.id)).toEqual(['bar']);
  });

  it('removes the left entry and renumbers the rest', () => {
    const r = editLayout(fixture(), { type: 'remove-entry', side: 'left' });
    expect(r.problem.layout.entries).toBe(2);
    expect(where(r.problem, 'gas')).toBe('No. 1 Entry between Crosscut 1 and Crosscut 2');
    expect(where(r.problem, 'bar')).toBe('No. 2 Entry inby Crosscut 3');
  });

  it('keeps items in their opening when pillar and entry sizes change', () => {
    const p = fixture();
    const r = editLayout(p, { type: 'set', patch: { pillarWidth: 80, pillarLength: 100, entryWidth: 16, stubLength: 60 } });
    expect(r.problem.layout.pillarLength).toBe(100);
    expect(where(r.problem, 'gas')).toBe('No. 2 Entry between Crosscut 1 and Crosscut 2');
    expect(where(r.problem, 'bar')).toBe('No. 3 Entry inby Crosscut 3');
    const gas = r.problem.elements[0];
    const g = makeGeo(r.problem.layout);
    expect(gas.x).toBeCloseTo(g.colX[3] + 8, 5); // centre of the entry
    expect(gas.y).toBeCloseTo(g.rowY[3] + 50, 5); // half way along the pillar
  });

  it('changes entry and crosscut counts typed in the panel at the right side and the face', () => {
    const r = editLayout(fixture(), { type: 'set', patch: { entries: 5, rows: 7 } });
    expect(r.problem.layout.entries).toBe(5);
    expect(r.problem.layout.rows).toBe(7);
    expect(where(r.problem, 'bar')).toBe('No. 3 Entry inby Crosscut 6');
    expect(editLayout(fixture(), { type: 'set', patch: { entries: 99 } }).problem.layout.entries).toBe(12);
  });

  it('sets an opening mined, projected or not mined, but not a pillar or intersection', () => {
    const p = fixture();
    const r = editLayout(p, { type: 'cell', cx: 0, cy: 4, state: 'open' });
    expect(openingState(r.problem.layout, 0, 4)).toBe('open');
    expect(openingState(p.layout, 0, 4)).toBe('solid');
    expect(editLayout(p, { type: 'cell', cx: 2, cy: 1, state: 'open' }).refused).toMatch(/solid/);
    expect(editLayout(p, { type: 'cell', cx: 1, cy: 2, state: 'solid' }).refused).toMatch(/intersection/);
  });

  it('adding then removing a crosscut gives back every sample problem unchanged', () => {
    for (const s of SAMPLES) {
      const p = s.make();
      const back = editLayout(editLayout(p, { type: 'add-row' }).problem, { type: 'remove-row' });
      expect(back.lost).toEqual([]);
      expect(back.problem.layout).toEqual(p.layout);
      back.problem.elements.forEach((e, i) => {
        expect(e.x).toBeCloseTo(p.elements[i].x, 0);
        expect(e.y).toBeCloseTo(p.elements[i].y, 0);
      });
    }
  });

  describe('side rooms', () => {
    const t = (p: Problem) => buildTopo(makeGeo(p.layout));
    it('pulls a room out of a crosscut, sets the side depth, and closes it again', () => {
      const p = fixture();
      expect(t(p).nodes.has('sL2')).toBe(false);
      const r = editLayout(p, { type: 'room', side: 'left', row: 2, depth: 63 });
      expect(r.problem.layout.sideLeft).toBe(63);
      expect(r.problem.layout.sideRight).toBeUndefined();
      expect(t(r.problem).nodes.get('sL2')).toMatchObject({ end: true, x: 0 });
      // Placed items move right with the wider side.
      expect(where(r.problem, 'gas')).toBe('No. 2 Entry between Crosscut 1 and Crosscut 2');
      const closed = editLayout(r.problem, { type: 'room', side: 'left', row: 2, depth: 4 });
      expect(t(closed.problem).nodes.has('sL2')).toBe(false);
      expect(closed.problem.layout.sideLeft).toBe(63);
      expect(editLayout(p, { type: 'room', side: 'right', row: 0, depth: 40 }).refused).toBeTruthy();
    });

    it('takes a whole side of rooms off and puts it back', () => {
      const p = fixture();
      const g0 = makeGeo(p.layout);
      const room = makeElement({ kind: 'x', sub: 'face' }, g0.width - 10, g0.rowY[4] + 10, 'room');
      p.elements.push(room);
      p.layout.cells[cellKey(6, 4)] = 'open';
      const off = editLayout(p, { type: 'set', patch: { sideRight: 0 } });
      expect(off.lost.map((e) => e.id)).toEqual(['room']);
      expect(off.problem.layout.cells[cellKey(6, 4)]).toBeUndefined();
      const g = makeGeo(off.problem.layout);
      expect(g.width).toBe(g0.width - 40);
      expect([...t(off.problem).nodes.keys()].some((k) => k.startsWith('sR'))).toBe(false);
      expect(where(off.problem, 'bar')).toBe('No. 3 Entry inby Crosscut 3');
      const back = editLayout(off.problem, { type: 'set', patch: { sideRight: 40 } });
      expect(makeGeo(back.problem.layout).width).toBe(g0.width);
      expect(openingState(back.problem.layout, 6, 4)).toBe('solid');
    });

    it('keeps side rooms where they are when only the face stubs change, and old files follow the stub depth', () => {
      const p = fixture();
      const r = editLayout(p, { type: 'set', patch: { stubLength: 80 } });
      expect(sideDepth(r.problem.layout, 'left')).toBe(40);
      expect(sideDepth(r.problem.layout, 'right')).toBe(40);
      const old = normalizeProblem({ ...JSON.parse(JSON.stringify(p)), layout: { ...p.layout, stubLength: 30 } });
      expect(old.layout.sideLeft).toBeUndefined();
      expect(makeGeo(old.layout).colW[0]).toBe(30);
      expect(normalizeProblem({ ...p, layout: { ...p.layout, sideLeft: 0, sideRight: 999 } }).layout).toMatchObject({ sideLeft: 0, sideRight: 200 });
    });
  });
});
