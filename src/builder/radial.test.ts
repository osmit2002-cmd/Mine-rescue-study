import { describe, expect, it } from 'vitest';
import { makeElement, PALETTE } from './catalog';
import type { El } from './model';
import { radialOptions } from './ui/RadialMenu';

const el = (kind: El['kind'], extra: Partial<El> = {}): El => ({ ...makeElement({ kind }, 0, 0, 'e1'), ...extra });
const apply = (e: El, id: string): El => ({ ...e, ...radialOptions(e).find((o) => o.id === id)!.patch });

describe('placement options ring', () => {
  it('offers duplicate, delete and done for every item in the list, with unique options', () => {
    for (const it of PALETTE) {
      const opts = radialOptions(makeElement(it, 0, 0, 'e'));
      const ids = opts.map((o) => o.id);
      expect(ids).toEqual(expect.arrayContaining(['edit', 'duplicate', 'delete', 'done']));
      expect(new Set(ids).size).toBe(ids.length);
      for (const o of opts) expect(!!o.patch !== !!o.action).toBe(true);
    }
  });

  it('sets a direction and marks the current one', () => {
    const b = apply(el('body'), 'dir90');
    expect(b.dir).toBe(90);
    expect(radialOptions(b).filter((o) => o.on).map((o) => o.id)).toEqual(['dir90']);
    expect(apply(b, 'rot45').dir).toBe(135);
  });

  it('keeps stoppings consistent: not intact is never airtight, airtight implies intact', () => {
    const s = el('perm-stopping');
    const broken = apply(s, 'intact');
    expect(broken.intact).toBe(false);
    expect(broken.airtight).toBe(false);
    const fixed = apply(broken, 'airtight');
    expect(fixed.airtight).toBe(true);
    expect(fixed.intact).toBe(true);
  });

  it('toggles door, smoke density, fan and person options', () => {
    expect(apply(el('door', { open: false }), 'open').open).toBe(true);
    const sm = apply(el('smoke'), 'dense');
    expect(sm.density).toBe('dense');
    expect(apply(sm, 'dense').density).toBe('');
    expect(apply(el('fan'), 'mode').fanMode).toBe('blowing');
    expect(apply(el('person'), 'conscious').conscious).toBe(false);
  });
});
