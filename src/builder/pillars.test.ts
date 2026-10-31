import { describe, expect, it } from 'vitest';
import { cellKey, makeGeo } from './geometry';
import { editLayout } from './layoutEdit';
import { blankProblem, defaultLayout } from './model';
import FILE from './pillar-numbering.json';
import { BUILT_IN, loadNumbering, normalizeNumbering, NUMBERING_KEY, outbyBand, pillarLabels, saveNumbering, type PillarNumbering } from './pillars';

const labels = (entries: number, rows: number, n: PillarNumbering = BUILT_IN, cells: Record<string, 'open' | 'solid' | 'projected'> = {}) =>
  pillarLabels(makeGeo({ ...defaultLayout(entries, rows), cells }), n).map((p) => p.label);
const scheme = (patch: object) => normalizeNumbering({ ...FILE, ...patch });

describe('pillar numbering', () => {
  it('reads the default scheme from pillar-numbering.json', () => {
    expect(BUILT_IN.outby.labels).toEqual(['0', '00']);
    expect(BUILT_IN.inby).toMatchObject({ start: 1, order: 'rows', direction: 'left-to-right' });
  });

  it('numbers 0, 00 outby the FAB, then 1…N left to right moving inby to the face', () => {
    // 3 entries, FAB + 3 crosscuts: 3 rows of pillars between crosscuts plus the blocks at the face.
    expect(labels(3, 4)).toEqual(['0', '00', '1', '2', '3', '4', '5', '6', '7', '8']);
    const g = makeGeo(defaultLayout(3, 4));
    const ps = pillarLabels(g, BUILT_IN);
    expect(ps[0]).toMatchObject({ cx: 2, cy: -1 });
    expect(ps[1]).toMatchObject({ cx: 4, cy: -1 });
    expect(ps[2]).toMatchObject({ cx: 2, cy: 1, label: '1' });
    expect(ps[3]).toMatchObject({ cx: 4, cy: 1, label: '2' });
    expect(ps[4]).toMatchObject({ cx: 2, cy: 3, label: '3' });
    expect(ps[2].x).toBeLessThan(ps[3].x);
    expect(ps[4].y).toBeGreaterThan(ps[2].y);
  });

  it('N grows when the problem is made longer or wider in the builder', () => {
    const p = blankProblem();
    p.layout = defaultLayout(3, 4);
    const longer = editLayout(p, { type: 'add-row' }).problem;
    expect(pillarLabels(makeGeo(longer.layout), BUILT_IN).at(-1)!.label).toBe('10');
    const wider = editLayout(longer, { type: 'add-entry', side: 'right' }).problem;
    expect(pillarLabels(makeGeo(wider.layout), BUILT_IN).map((x) => x.label).slice(0, 6)).toEqual(['0', '00', '000', '1', '2', '3']);
  });

  it('can leave out the face blocks and the outby row', () => {
    expect(labels(3, 4, scheme({ faceBlocks: false }))).toEqual(['0', '00', '1', '2', '3', '4', '5', '6']);
    const g = makeGeo({ ...defaultLayout(3, 4), outbyPillars: false });
    expect(pillarLabels(g, BUILT_IN)[0].label).toBe('1');
    expect(outbyBand(g)).toBe(0);
    expect(outbyBand(makeGeo(defaultLayout(3, 4)))).toBe(30);
  });

  it('skips blocks with no mined opening beside them', () => {
    // Left side of a 2-entry map: block between entries in the first band, all four sides not mined.
    const cells = { [cellKey(1, 1)]: 'solid', [cellKey(3, 1)]: 'solid', [cellKey(2, 0)]: 'solid', [cellKey(2, 2)]: 'solid' } as const;
    expect(labels(2, 3, BUILT_IN, { ...cells })).toEqual(['0', '1', '2']);
  });

  it('supports other teams’ schemes: columns, right to left, serpentine, prefixes', () => {
    // Read each map as rows of labels from the FAB inby, left to right: "1 2 | 3 4 | 5 6".
    const grid = (n: PillarNumbering, rows = 3) => {
      const ps = pillarLabels(makeGeo(defaultLayout(3, rows)), n).filter((p) => p.cy >= 0);
      const bands = [...new Set(ps.map((p) => p.cy))].sort((a, b) => a - b);
      return bands.map((cy) => ps.filter((p) => p.cy === cy).sort((a, b) => a.cx - b.cx).map((p) => p.label).join(' ')).join(' | ');
    };
    expect(grid(BUILT_IN)).toBe('1 2 | 3 4 | 5 6');
    expect(grid(scheme({ inby: { direction: 'right-to-left' } }))).toBe('2 1 | 4 3 | 6 5');
    expect(grid(scheme({ inby: { direction: 'serpentine' } }))).toBe('1 2 | 4 3 | 5 6');
    expect(grid(scheme({ inby: { order: 'columns' } }))).toBe('1 4 | 2 5 | 3 6');
    expect(grid(scheme({ inby: { order: 'columns', direction: 'right-to-left' } }))).toBe('4 1 | 5 2 | 6 3');
    expect(grid(scheme({ inby: { order: 'columns', direction: 'serpentine' } }))).toBe('1 6 | 2 5 | 3 4');
    expect(labels(3, 2, scheme({ outby: { labels: ['A', 'B'] }, inby: { start: 10, step: 10, prefix: 'P', suffix: '' } }))).toEqual(['A', 'B', 'P10', 'P20', 'P30', 'P40']);
    expect(labels(4, 2, scheme({ outby: { labels: ['0'], more: 'none' } }))).toEqual(['0', '1', '2', '3', '4', '5', '6']);
  });

  it('rejects files that are not numbering schemes and fills in missing fields', () => {
    expect(() => normalizeNumbering([])).toThrow(/Not a pillar numbering file/);
    expect(() => normalizeNumbering({ schema: 'mrs-problem/1' })).toThrow(/schema/);
    const n = normalizeNumbering({ inby: { start: 0, order: 'sideways' } });
    expect(n.inby.start).toBe(0);
    expect(n.inby.order).toBe('rows');
    expect(n.outby.labels).toEqual(['0', '00']);
  });

  it('saves a device scheme and goes back to the file default', () => {
    const m = new Map<string, string>();
    const store = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
    expect(loadNumbering(store)).toEqual(BUILT_IN);
    saveNumbering(scheme({ inby: { start: 100 } }), store);
    expect(m.has(NUMBERING_KEY)).toBe(true);
    expect(loadNumbering(store).inby.start).toBe(100);
    saveNumbering(null, store);
    expect(loadNumbering(store)).toEqual(BUILT_IN);
    m.set(NUMBERING_KEY, '{bad json');
    expect(loadNumbering(store)).toEqual(BUILT_IN);
  });
});
