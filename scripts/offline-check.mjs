// Headless end-to-end check: load, wait for the service worker, exercise pages, go offline, reload.
// Usage: node scripts/offline-check.mjs [url]   (needs `npm run preview` running and Chrome installed)
// GALLERY=0: content without cropped figures (checks that no gallery or figure badge appears instead).
import { chromium } from 'playwright-core';

const url = process.argv[2] ?? 'http://localhost:4173/';
const executablePath = process.env.CHROME_PATH ?? '/usr/bin/google-chrome';
const browser = await chromium.launch({ executablePath, headless: true });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} ${msg}`); if (!cond) process.exitCode = 1; };

await page.goto(url);
await page.waitForSelector('.tiles');
ok(await page.evaluate(async () => !!(await navigator.serviceWorker.ready)), 'service worker registered and active');
await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15000 }).catch(() => {});
if (!(await page.evaluate(() => !!navigator.serviceWorker.controller))) await page.reload();
ok(await page.evaluate(() => !!navigator.serviceWorker.controller), 'page is controlled by the service worker');
const home = await page.textContent('main');
ok(/100 rules/.test(home) && /\d{3} statements/.test(home), `home shows rule and statement counts (${(home.match(/\d+ statements[^A-Z]*/) ?? [""])[0].trim()})`);
ok((await page.textContent('header')).includes('2026 MSHA rules, approved 1/15/2026'), 'edition shown in header');
ok(!(await page.$('.sample-banner')), 'no SAMPLE banner with real content');

await page.goto(url + '#/rules');
await page.click('text=Expand all');
ok((await page.$$('.rule-link')).length >= 100, 'rules tree lists all rules');
await page.goto(url + '#/rules/scba-1');
ok((await page.$$('.rule-text p.lvl-1')).length > 0, 'rule detail renders sub-item paragraphs');
await page.goto(url + '#/section/' + encodeURIComponent('mine-rescue:figures'));
await page.waitForSelector('.figure-card img, [data-testid=gallery] img');
await page.goto(url + '#/search?q=methane');
await page.waitForSelector('.results li');
ok((await page.$$('.results mark')).length > 0, 'search highlights matches');

// Mock exam: answer 10 three-choice questions.
await page.goto(url + '#/quiz?mode=mock');
await page.click('button.primary:has-text("Start")');
for (let i = 0; i < 10; i++) {
  await page.waitForSelector('[data-testid=choice]');
  const n = (await page.$$('[data-testid=choice]')).length;
  if (i === 0) ok(n === 3, 'mock exam questions have three choices');
  if (i === 0) ok((await page.textContent('[role=timer]').catch(() => '')).includes('15:00') || /14:5\d/.test(await page.textContent('[role=timer]').catch(() => '')), 'mine rescue mock is timed at 15 min by default');
  await page.click('[data-testid=choice] >> nth=0');
}
const score = await page.textContent('[data-testid=final-score]');
ok(/\/ 10/.test(score), `mine rescue mock exam scored out of 10 (${score.trim()})`);

// Event picker: switch to a bench event (persisted), check parts, preformatted rules and the timed mock.
await page.goto(url + '#/');
await page.selectOption('[data-testid=event-select]', 'bench-biopak');
await page.reload();
await page.waitForSelector('.tiles');
ok((await page.inputValue('[data-testid=event-select]')) === 'bench-biopak', 'selected event persists across reloads');
ok((await page.textContent('header')).includes('1/5/2026'), 'header edition follows the event');
await page.goto(url + '#/parts');
await page.waitForSelector('.rule-link');
const tables = (await page.$$('.rule-link')).length;
ok(tables === 13, `BioPak parts browser lists ${tables} tables`);
await page.click('.rule-link >> nth=0');
await page.waitForSelector('.parts-table tbody tr');
ok((await page.$$('.parts-table tbody tr')).length > 0, 'parts table rows render');
const partsHash = await page.evaluate(() => location.hash);
await page.goto(url + '#/rules');
await page.click('text=Expand all');
const benchRules = (await page.$$('.rule-link')).length;
ok(benchRules === 63, `rules page shows only the BioPak rule book (${benchRules} rules)`);
await page.goto(url + '#/quiz?mode=mock');
await page.click('button.primary:has-text("Start")');
await page.waitForSelector('[data-testid=choice]');
ok(!!(await page.$('[role=timer]')), `bench mock exam shows a countdown (${(await page.textContent('[role=timer]')).trim()})`);
const status = await page.textContent('.quiz-status');
ok(/of 20/.test(status), `bench mock exam has 20 questions (${status.match(/Question \d+ of \d+/)?.[0]})`);
let sawPart = false;
for (let i = 0; i < 20; i++) {
  await page.waitForSelector('[data-testid=choice]');
  if ((await page.textContent('.prompt')).includes('Identification of Parts')) sawPart = true;
  await page.click('[data-testid=choice] >> nth=0');
}
ok(!sawPart, 'bench mock exam is statements of fact only (no parts questions)');
ok(/\/ 20/.test(await page.textContent('[data-testid=final-score]')), 'bench mock scored out of 20');
await page.goto(url + '#/quiz');
await page.reload();
await page.waitForSelector('[role=radiogroup][aria-label="Question source"]');
ok((await page.getAttribute('[role=radiogroup][aria-label="Question source"] [role=radio] >> nth=0', 'aria-checked')) === 'true', 'bench practice defaults to Statements (parts practice still offered)');

// Version in the footer and on About.
ok((await page.textContent('[data-testid=footer-version]')).trim() === 'v0.5.0', 'footer shows v0.5.0');
await page.goto(url + '#/about');
await page.waitForSelector('[data-testid=app-version]');
ok((await page.textContent('main')).includes('v0.5.0'), 'About shows v0.5.0');

// Mine rescue: mock timed at 15 min by default (rule 3, p. 7); the toggle and a custom length are remembered.
await page.goto(url + '#/');
await page.selectOption('[data-testid=event-select]', 'mine-rescue');
await page.goto(url + '#/quiz?mode=mock');
await page.waitForSelector('[data-testid=timer-toggle]');
ok(await page.isChecked('[data-testid=timer-toggle]'), 'mine rescue mock timer is on by default');
ok((await page.inputValue('[data-testid=timer-minutes]')) === '15', 'mine rescue mock timer defaults to 15 minutes');
await page.uncheck('[data-testid=timer-toggle]');
await page.reload();
await page.waitForSelector('[data-testid=timer-toggle]');
ok(!(await page.isChecked('[data-testid=timer-toggle]')), 'turning the mine rescue timer off is remembered');
await page.check('[data-testid=timer-toggle]');
await page.fill('[data-testid=timer-minutes]', '12');
await page.press('[data-testid=timer-minutes]', 'Enter');
await page.reload();
await page.waitForSelector('[data-testid=timer-toggle]');
ok((await page.isChecked('[data-testid=timer-toggle]')) && (await page.inputValue('[data-testid=timer-minutes]')) === '12', 'timer setting is saved on the device');
await page.click('button.primary:has-text("Start")');
await page.waitForSelector('[role=timer]');
ok(/12:00|11:5\d/.test(await page.textContent('[role=timer]')), 'mine rescue mock runs with the chosen 12 min timer');
await page.goto(url + '#/quiz');
await page.reload();
await page.waitForSelector('[data-testid=timer-toggle]');
ok(!(await page.isChecked('[data-testid=timer-toggle]')), 'practice timer is off by default');
await page.check('[data-testid=timer-toggle]');
ok((await page.inputValue('[data-testid=timer-minutes]')) === '12', 'practice uses the saved per-event length');
await page.click('button.primary:has-text("Start")');
await page.waitForSelector('[role=timer]');
ok(true, 'practice session shows a countdown when the timer is on');
await page.evaluate(() => localStorage.removeItem('mrs.timer.v1'));

// First aid: timed 15-question exam; find a preformatted rule and check it renders in <pre>.
await page.goto(url + '#/');
await page.selectOption('[data-testid=event-select]', 'first-aid');
await page.goto(url + '#/rules/first-aid-materials-1');
await page.waitForSelector('pre.rule-pre');
const preText = await page.textContent('pre.rule-pre');
ok(preText.includes('6    Adhesive compresses'), 'format "pre" rule renders in <pre> with whitespace kept exactly');
await page.goto(url + '#/rules');
await page.click('text=Expand all');
const firstAidRules = (await page.$$('.rule-link')).length;
ok(firstAidRules >= 100, `first aid rule book lists ${firstAidRules} rules`);
await page.goto(url + '#/quiz?mode=mock');
await page.click('button.primary:has-text("Start")');
await page.waitForSelector('[data-testid=choice]');
ok(/of 15/.test(await page.textContent('.quiz-status')), 'first aid mock has 15 questions');
ok(/^⏱ (20:00|19:5\d)/.test((await page.textContent('[role=timer]')).trim()), 'first aid timer starts at 20 minutes');
// v0.2.0: the header menu is the only event control, and "Facts" is now "Statements".
await page.selectOption('[data-testid=event-select]', 'all');
await page.goto(url + '#/statements');
await page.waitForSelector('.fact-list li');
const allCount = await page.textContent('main');
ok(/654 of 654 statements/.test(allCount), 'Statements list with "All events" (header) shows 654 statements');
let pickers = 0;
for (const h of ['#/', '#/statements', '#/search?q=oxygen', '#/parts', '#/quiz', '#/rules', '#/figures']) {
  await page.goto(url + h);
  await page.waitForSelector('main h1');
  pickers += (await page.$$('[aria-label="Contest event"][role=radiogroup], main select')).length;
}
ok(pickers === 0, 'no event selector inside any page (header menu only)');
await page.goto(url + '#/quiz');
await page.waitForSelector('[data-testid=pick-event]');
ok((await page.textContent('[data-testid=pick-event]')).includes('header'), 'Quiz with "All events" asks to choose an event in the header');
const nav = await page.textContent('nav.nav');
ok(nav.includes('Statements') && !nav.includes('Facts'), 'nav says Statements, not Facts');
await page.goto(url + '#/facts/coal-mr-sof-001');
await page.waitForSelector('.statement');
ok((await page.evaluate(() => location.hash)).startsWith('#/statements/coal-mr-sof-001'), 'old #/facts links redirect to #/statements');
await page.goto(url + '#/search?q=oxygen');
await page.waitForSelector('.results li');
ok(/Statements \(\d+\)/.test(await page.textContent('main')), 'search filter chip says Statements');
await page.selectOption('[data-testid=event-select]', 'mine-rescue');

// Rules quiz (Coal Mine Rescue): verbatim sentence, 3 choices, rule reference with a link.
await page.goto(url + '#/quiz?kind=rules');
await page.reload();
await page.waitForSelector('[data-testid=rules-pool]');
ok(/\d+ sentences from \d+ of 100 rules/.test(await page.textContent('[data-testid=rules-pool]')), `Rules quiz pool: ${(await page.textContent('[data-testid=rules-pool]')).trim()}`);
await page.click('button.primary:has-text("Start")');
await page.waitForSelector('[data-testid=choice]');
ok((await page.$$('[data-testid=choice]')).length === 3, 'Rules quiz question has three choices');
{ await page.waitForFunction(() => /of \d+/.test(document.querySelector('.quiz-status')?.textContent ?? ''), null, { timeout: 5000 }).catch(() => {}); const qs = await page.textContent('.quiz-status'); ok(/of 10/.test(qs), `Rules quiz defaults to 10 questions (${qs.trim()})`); }
await page.click('[data-testid=choice] >> nth=0');
await page.waitForSelector('[data-testid=rule-ref] a');
const ref = await page.textContent('[data-testid=rule-ref]');
const sentence = await page.textContent('.feedback .statement');
const ruleHref = await page.getAttribute('[data-testid=rule-ref] a', 'href');
ok(/rule book p/.test(ref), `after answering, the rule reference is shown (${ref.trim().slice(0, 80)})`);
await page.click('[data-testid=rule-ref] a');
await page.waitForSelector('.rule-text');
const ruleText = (await page.textContent('.rule-text')).replace(/\s+/g, ' ');
ok(ruleText.includes(sentence.replace(/\s+/g, ' ').trim()), 'the quizzed sentence appears verbatim on the linked rule page');
ok(ruleHref.includes('#/rules/'), 'rule reference links to the rule detail page');

// "Practice this one" deep link to another event's statement switches the event and stays within it.
await page.goto(url + '#/quiz?fact=first-aid-sof-001');
await page.waitForSelector('[data-testid=choice]');
ok((await page.inputValue('[data-testid=event-select]')) === 'first-aid', 'deep link to a First Aid statement switches the event');
await page.selectOption('[data-testid=event-select]', 'mine-rescue');
await page.waitForTimeout(300);
ok((await page.$$('[data-testid=choice]')).length === 3, 'changing the event mid-quiz keeps the running question intact');
await page.goto(url + '#/');

// v0.2.1: Rules page search bar (shared with Statements), with the section filter as an option below it.
await page.goto(url + '#/rules');
await page.reload();
await page.waitForSelector('input[aria-label="Search rules"]');
const rq = 'input[aria-label="Search rules"]';
const count = async () => (await page.textContent('[data-testid=search-count]')).trim();
ok(/^100 rules/.test(await count()), `Rules page result count without a search: "${await count()}"`);
const firstInMain = await page.evaluate(() => { const els = [...document.querySelectorAll('main input, main button, main select, main details')]; return els[0]?.getAttribute('aria-label'); });
ok(firstInMain === 'Search rules', 'search bar is the first control on the Rules page');
const boxIn = await page.locator(rq).boundingBox();
const boxFilter = await page.locator('[data-testid=rule-section-filter]').boundingBox();
ok(boxFilter && boxFilter.y >= boxIn.y + boxIn.height && boxFilter.y - (boxIn.y + boxIn.height) < 40, 'section filter sits directly below the search bar');
await page.fill(rq, 'lifeline');
await page.waitForSelector('[data-testid=rule-hit]');
const fullCount = await count();
const nFull = Number(fullCount.split(' ')[0]);
ok(/^\d+ of 100 rules match/.test(fullCount) && nFull > 0, `live search "lifeline": ${fullCount}`);
ok((await page.$$('[data-testid=rule-hit]')).length === nFull, 'every matching rule is listed (filtered tree)');
ok((await page.$$('[data-testid=rule-hit]:not(:has(mark))')).length === 0, 'every matching rule has highlighted words');
ok((await page.$$('main details:not([open])')).length === 0, 'sections holding matches are expanded');
const snip = (await page.textContent('[data-testid=rule-snippet] >> nth=0')).replace(/^…|…$/g, '');
const hitHref = await page.getAttribute('[data-testid=rule-snippet] >> nth=0 >> xpath=ancestor::a', 'href');
await page.fill(rq, 'lifel');
await page.waitForTimeout(200);
ok(Number((await count()).split(' ')[0]) >= nFull, `prefix "lifel" matches too (${await count()})`);
await page.fill(rq, 'lifelinr');
await page.waitForTimeout(200);
ok(Number((await count()).split(' ')[0]) > 0, `typo "lifelinr" still matches (${await count()})`);
await page.fill(rq, 'lifeline');
await page.waitForTimeout(200);
const chips = page.locator('[data-testid=rule-section-filter] button');
let narrowed = null;
for (let i = 1; i < (await chips.count()); i++) {
  await chips.nth(i).click();
  const c = await count();
  if (/in this section/.test(c) && Number(c.split(' ')[0]) > 0) { narrowed = c; break; }
}
ok(narrowed && Number(narrowed.split(' ')[0]) <= nFull, `section filter narrows the search results (${narrowed})`);
await chips.nth(0).click();
await page.waitForTimeout(300);
await page.reload();
await page.waitForSelector('[data-testid=rule-hit]');
ok((await page.inputValue(rq)) === 'lifeline', 'the search survives a reload (#/rules?q=…)');
await page.click('.search-clear');
ok((await page.inputValue(rq)) === '' && /^100 rules/.test(await count()), 'clear button empties the search');
await page.click('text=Expand all');
ok((await page.$$('.rule-link')).length >= 100 && (await page.$$('main mark')).length === 0, 'empty search brings back the full tree');
await page.goto(url + hitHref);
await page.waitForSelector('.rule-text');
const hitRuleText = (await page.textContent('.rule-text')).replace(/\s+/g, ' ');
ok(hitRuleText.includes(snip.replace(/\s+/g, ' ').trim()), 'matched snippet is verbatim rule text');
ok((await page.$$('.rule-text mark')).length > 0, 'the rule opened from a search highlights the words');
await page.selectOption('[data-testid=event-select]', 'bench-biopak');
await page.goto(url + '#/rules?q=diaphragm');
await page.reload();
await page.waitForSelector('[data-testid=rule-hit]');
ok((await page.$$('.rule-snippet.pre mark')).length > 0, "search covers 'pre' parts lists and skill sheets (BioPak: diaphragm)");
ok(/of 63 rules match/.test(await count()), `search is scoped to the header event (${await count()})`);
await page.selectOption('[data-testid=event-select]', 'mine-rescue');
await page.goto(url + '#/statements?q=lifelin');
await page.reload();
await page.waitForSelector('.fact-list li');
ok((await page.$$('.fact-list mark')).length > 0 && (await page.$$('.search-clear')).length === 1 && /^\d+ of \d+ statements/.test(await count()), `Statements uses the same search bar: highlights, clear button, count (${await count()})`);
await page.goto(url + '#/');

// v0.3.0: per-rule figure gallery (rule b-card-23 has Figures 1(a) and 1(b) in the real data and in the sample overlay).
const galleryOn = process.env.GALLERY !== '0';
if (!galleryOn) {
  await page.goto(url + '#/rules/b-card-23');
  await page.waitForSelector('.rule-text');
  ok(!(await page.$('[data-testid=gallery]')), 'no cropped figures in the content: no gallery on the rule page');
  await page.goto(url + '#/rules');
  await page.click('text=Expand all');
  ok((await page.$$('[data-testid=fig-badge]')).length === 0, 'no cropped figures: no figure badges in the tree');
} else {
  await page.goto(url + '#/rules');
  await page.click('text=Expand all');
  const badges = (await page.$$('[data-testid=fig-badge]')).length;
  ok(badges > 0, `rules with figures are marked in the tree (${badges} badges)`);
  await page.fill('input[aria-label="Search rules"]', 'roof testing');
  await page.waitForSelector('[data-testid=rule-hit]');
  ok((await page.$$('[data-testid=rule-hit] [data-testid=fig-badge]')).length > 0, 'and in the Rules search results');
  await page.goto(url + '#/search?q=roof%20testing');
  await page.waitForSelector('.results li');
  ok((await page.$$('.results [data-testid=fig-badge]')).length > 0, 'and in the Search page results');
  await page.goto(url + '#/rules/b-card-23');
  await page.waitForSelector('[data-testid=gallery]');
  const gc = async (sel = '[data-testid=gallery-counter]') => (await page.textContent(sel)).trim();
  const total = Number((await gc()).split(' of ')[1]);
  ok((await gc()) === `1 of ${total}` && total >= 2, `gallery shows the counter (${await gc()})`);
  const cap1 = (await page.textContent('[data-testid=gallery-caption]')).trim();
  const img1 = page.locator('.gallery-slide img').first();
  ok(cap1.length > 0 && (await img1.getAttribute('alt')) && cap1.startsWith(await img1.getAttribute('alt')), `caption and page shown, alt text = caption ("${cap1}")`);
  ok((await img1.getAttribute('loading')) === 'lazy', 'gallery images load lazily');
  await page.click('[data-testid=gallery-next]');
  await page.waitForFunction(() => document.querySelector('[data-testid=gallery-counter]').textContent.startsWith('2 of'));
  ok((await page.textContent('[data-testid=gallery-caption]')).trim() !== cap1, `next arrow: ${await gc()}, caption changes`);
  await page.click('[data-testid=gallery-prev]');
  await page.waitForFunction(() => document.querySelector('[data-testid=gallery-counter]').textContent.startsWith('1 of'));
  ok(true, 'previous arrow goes back to 1');
  await page.focus('[data-testid=gallery]');
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => document.querySelector('[data-testid=gallery-counter]').textContent.startsWith('2 of'));
  await page.keyboard.press('ArrowLeft');
  await page.waitForFunction(() => document.querySelector('[data-testid=gallery-counter]').textContent.startsWith('1 of'));
  ok(true, 'Right/Left arrow keys move the gallery when it is focused');
  // Fullscreen viewer.
  await page.click('.gallery-slide >> nth=0 >> button');
  await page.waitForSelector('[data-testid=lightbox][open]');
  ok((await gc('[data-testid=lightbox-counter]')) === `1 of ${total}`, 'tap opens the fullscreen viewer at that figure');
  const scale = async () => Number(await page.getAttribute('[data-testid=lightbox-img]', 'data-scale'));
  await page.click('[data-testid=zoom-in]');
  ok((await scale()) > 1, `+ button zooms in (${await scale()}x)`);
  await page.keyboard.press('0');
  ok((await scale()) === 1, '0 key fits the figure again');
  const st = await page.locator('[data-testid=lightbox-stage]').boundingBox();
  await page.mouse.move(st.x + st.width / 2, st.y + st.height / 2);
  await page.mouse.wheel(0, -400);
  await page.waitForTimeout(100);
  ok((await scale()) > 1, `mouse wheel zooms (${await scale()}x)`);
  const before = await page.locator('[data-testid=lightbox-img]').boundingBox();
  await page.mouse.down();
  await page.mouse.move(st.x + st.width / 2 + 60, st.y + st.height / 2 + 40, { steps: 5 });
  await page.mouse.up();
  const after = await page.locator('[data-testid=lightbox-img]').boundingBox();
  ok(Math.abs(after.x - before.x) > 5 || Math.abs(after.y - before.y) > 5, 'drag pans the zoomed figure');
  await page.keyboard.press('0');
  await page.mouse.dblclick(st.x + st.width / 2, st.y + st.height / 2);
  await page.waitForTimeout(250);
  ok(Math.abs((await scale()) - 2.5) < 0.01, `double-click/double-tap zooms to 2.5x (${await scale()}x)`);
  await page.keyboard.press('0');
  await page.keyboard.press('ArrowRight');
  ok((await gc('[data-testid=lightbox-counter]')) === `2 of ${total}`, 'Right arrow moves to the next figure in fullscreen');
  await page.mouse.move(st.x + 80, st.y + st.height / 2);
  await page.mouse.down();
  await page.mouse.move(st.x + st.width - 40, st.y + st.height / 2, { steps: 8 });
  await page.mouse.up();
  ok((await gc('[data-testid=lightbox-counter]')) === `1 of ${total}`, 'swipe (drag right) goes back in fullscreen');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('[data-testid=lightbox]'));
  ok(true, 'Esc closes the fullscreen viewer');
  await page.click('.gallery-slide >> nth=0 >> button');
  await page.waitForSelector('[data-testid=lightbox][open]');
  await page.click('[data-testid=lightbox-close]');
  await page.waitForFunction(() => !document.querySelector('[data-testid=lightbox]'));
  ok(true, 'the X button closes it too');
  // Phone (touch). Headless Chrome does not emulate native touch scrolling, so the strip's swipe is driven
  // by a horizontal trackpad scroll (same scroll-snap path); the viewer's touch gestures use real touch events.
  {
    const c3 = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    const p3 = await c3.newPage();
    await p3.goto(url + '#/rules/b-card-23');
    await p3.waitForSelector('[data-testid=gallery]');
    await p3.locator('[data-testid=gallery]').scrollIntoViewIfNeeded();
    await p3.waitForFunction(() => document.querySelector('[data-testid=gallery-track] img')?.naturalWidth > 0);
    const tb = await p3.locator('[data-testid=gallery-track]').boundingBox();
    await p3.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 3);
    await p3.mouse.wheel(Math.round(tb.width * 0.7), 0);
    await p3.waitForTimeout(900);
    const sc = await p3.evaluate(() => { const t = document.querySelector('[data-testid=gallery-track]'); return [t.scrollLeft, t.clientWidth]; });
    ok((await p3.textContent('[data-testid=gallery-counter]')).trim() === `2 of ${total}` && sc[0] === sc[1], `horizontal swipe snaps exactly to the next figure on a phone (${(await p3.textContent('[data-testid=gallery-counter]')).trim()})`);
    await p3.tap('.gallery-slide >> nth=1 >> button');
    await p3.waitForSelector('[data-testid=lightbox][open]');
    const sb = await p3.locator('[data-testid=lightbox-stage]').boundingBox();
    const cdp = await c3.newCDPSession(p3);
    const cx = Math.round(sb.x + sb.width / 2);
    const cy = Math.round(sb.y + sb.height / 2);
    const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
    const two = (d) => [{ x: cx - d, y: cy, id: 1 }, { x: cx + d, y: cy, id: 2 }];
    await touch('touchStart', two(30));
    for (let d = 40; d <= 100; d += 10) { await touch('touchMove', two(d)); await p3.waitForTimeout(16); }
    await touch('touchEnd', []);
    await p3.waitForTimeout(250);
    const ps = Number(await p3.getAttribute('[data-testid=lightbox-img]', 'data-scale'));
    ok(ps > 1.5, `pinch zooms on a phone (${ps}x)`);
    await p3.keyboard.press('0');
    await touch('touchStart', [{ x: cx - 120, y: cy }]);
    for (let i = 1; i <= 8; i++) { await touch('touchMove', [{ x: cx - 120 + i * 30, y: cy }]); await p3.waitForTimeout(16); }
    await touch('touchEnd', []);
    await p3.waitForTimeout(250);
    ok((await p3.textContent('[data-testid=lightbox-counter]')).trim() === `1 of ${total}`, 'touch swipe moves between figures in fullscreen');
    await p3.tap('[data-testid=lightbox-stage]');
    await p3.waitForTimeout(80);
    await p3.tap('[data-testid=lightbox-stage]');
    await p3.waitForTimeout(250);
    ok(Math.abs(Number(await p3.getAttribute('[data-testid=lightbox-img]', 'data-scale')) - 2.5) < 0.01, 'double-tap zooms on a phone');
    await c3.close();
  }
  await page.goto(url + '#/figures');
  await page.waitForSelector('.figure-card img');
  const linked = await page.$$('[data-testid=fig-rules] a');
  ok(linked.length > 0, `Figures page links figures to their rules (${linked.length} links)`);
  // Crops replace the old page images on skill-sheet / parts items; full pages open on request.
  await page.goto(url + '#/rules/first-aid-skill-1');
  await page.waitForSelector('[data-testid=gallery]');
  ok(!(await page.$('.figure-grid')), 'skill-sheet rule shows its cropped figures instead of the old page image');
  await page.goto(url + '#/rules/b-card-23');
  await page.waitForSelector('[data-testid=view-full-page]');
  await page.click('[data-testid=view-full-page]');
  await page.waitForSelector('[data-testid=lightbox][open] [data-testid=lightbox-img]');
  const fullSrc = await page.getAttribute('[data-testid=lightbox-img]', 'src');
  await page.waitForFunction(() => document.querySelector('[data-testid=lightbox-img]')?.naturalWidth > 0);
  ok(/content\/pages\//.test(fullSrc), `"View full page" opens the full rule-book page on request (${fullSrc.split('/').slice(-2).join('/')})`);
  await page.keyboard.press('Escape');
  await page.goto(url + '#/section/' + encodeURIComponent('mine-rescue:figures'));
  await page.waitForSelector('[data-testid=gallery]');
  ok(/^1 of \d{2}$/.test((await page.textContent('[data-testid=gallery-counter]')).trim()), `figures-only section has its own gallery (${(await page.textContent('[data-testid=gallery-counter]')).trim()})`);
  await page.click('[data-testid=gallery-next]');
  await page.click('[data-testid=gallery-next]');
  await page.click('[data-testid=gallery-next]');
  await page.waitForTimeout(1200);
  { const c = (await page.textContent('[data-testid=gallery-counter]')).trim(); const at = await page.evaluate(() => { const t = document.querySelector('[data-testid=gallery-track]'); return Math.round(t.scrollLeft / t.clientWidth); });
    ok(/^4 of /.test(c) && at === 3, `three quick Next clicks land on figure 4 (${c})`); }
  const pre = await page.evaluate(async () => {
    const urls = [];
    for (const k of await caches.keys()) if (k.includes('precache')) for (const r of await (await caches.open(k)).keys()) urls.push(r.url);
    return { pages: urls.filter((u) => u.includes('/content/pages/')).length, crops: urls.filter((u) => /\/content\/figures\/.+\.webp/.test(u)).length };
  });
  ok(pre.pages === 0 && pre.crops > 100, `precache holds the ${pre.crops} cropped figures and no full pages`);
  // Full pages are cached on first view; "Download all for offline" fetches the rest.
  await page.goto(url + '#/figures');
  await page.waitForSelector('[data-testid=download-all]');
  await page.click('[data-testid=download-all]');
  await page.waitForFunction(() => /All full pages work offline/.test(document.querySelector('[data-testid=download-status]')?.textContent ?? ''), null, { timeout: 60000 });
  const stored = await page.evaluate(async () => (await (await caches.open('figure-pages')).keys()).length);
  ok(stored >= 103, `Download all for offline: ${(await page.textContent('[data-testid=download-status]')).trim()} (${stored} in the page cache)`);
}
await page.goto(url + '#/');

// Offline: reload and navigate.
await ctx.setOffline(true);
await page.goto(url + '#/statements/coal-mr-sof-102');
await page.reload();
await page.waitForSelector('.statement', { timeout: 10000 });
ok((await page.textContent('.statement')).includes('IDHL'), 'offline reload works and fact text is verbatim (IDHL typo kept)');
if (galleryOn) {
  await page.goto(url + '#/rules/first-aid-skill-1');
  await page.waitForSelector('[data-testid=view-full-page]');
  await page.click('[data-testid=view-full-page]');
  await page.waitForSelector('[data-testid=lightbox][open] [data-testid=lightbox-img]');
  ok(await page.waitForFunction(() => document.querySelector('[data-testid=lightbox][open] [data-testid=lightbox-img]')?.naturalWidth > 0, null, { timeout: 8000 }).then(() => true, () => false), 'a downloaded full page opens offline');
  await page.keyboard.press('Escape');
}
await page.goto(url + '#/figures');
await page.waitForSelector('.figure-card img');
const imgOk = await page.evaluate(async () => {
  const imgs = [...document.querySelectorAll('.figure-card img')];
  imgs.forEach((i) => (i.loading = 'eager'));
  await Promise.all(imgs.map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; }))));
  return imgs.length > 0 && imgs.every((i) => i.naturalWidth > 0);
});
ok(imgOk, 'figures load offline');
const webp = await page.evaluate(() => [...document.querySelectorAll('.figure-card img')].every((i) => i.src.endsWith('.webp')));
ok(webp, 'figures are served as WebP');
await page.goto(url + partsHash);
await page.reload();
await page.waitForSelector('.parts-table tbody tr', { timeout: 10000 });
const partImg = await page.evaluate(async () => {
  const i = document.querySelector('.figure-card img');
  if (!i) return 'no-figure';
  i.loading = 'eager';
  if (!i.complete) await new Promise((r) => { i.onload = i.onerror = r; });
  return i.naturalWidth > 0 ? 'ok' : 'broken';
});
ok(partImg !== 'broken', `parts table and its figure load offline after reload (${partImg})`);
await page.goto(url + '#/quiz');
await page.click('button.primary:has-text("Start")');
await page.waitForSelector('[data-testid=choice]');
ok(true, 'quiz runs offline');
await page.goto(url + '#/quiz?kind=rules');
await page.reload();
await page.waitForSelector('[data-testid=rules-pool]');
await page.click('button.primary:has-text("Start")');
await page.waitForSelector('[data-testid=choice]');
ok(true, 'Rules quiz runs offline');
await page.goto(url + '#/rules?q=oxygen');
await page.reload();
await page.waitForSelector('[data-testid=rule-hit]', { timeout: 10000 });
ok(/of 100 rules match/.test(await count()), `Rules search works offline (${await count()})`);
if (galleryOn) {
  await page.goto(url + '#/rules/b-card-23');
  await page.reload();
  await page.waitForSelector('[data-testid=gallery] img', { timeout: 10000 });
  const loaded = await page.evaluate(async () => {
    const imgs = [...document.querySelectorAll('.gallery-slide img')];
    imgs.forEach((i) => (i.loading = 'eager'));
    await Promise.all(imgs.map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; }))));
    return imgs.map((i) => i.naturalWidth > 0);
  });
  ok(loaded.length >= 2 && loaded.every(Boolean), `offline reload shows the rule's figures (${loaded.filter(Boolean).length}/${loaded.length})`);
  await page.click('.gallery-slide >> nth=0 >> button');
  await page.waitForSelector('[data-testid=lightbox][open]');
  ok(await page.evaluate(() => document.querySelector('[data-testid=lightbox-img]').naturalWidth > 0), 'fullscreen viewer works offline');
  await page.keyboard.press('Escape');
}
// v0.4.0: the problem builder works offline; the Figure 7 sample solves to the rule book's nine team stops.
await page.goto(url + '#/builder');
await page.reload();
await page.waitForSelector('.b-center .mine-map', { timeout: 10000 });
ok((await page.$$('.b-center .mine-map [data-el]')).length > 0, 'problem builder opens offline with a sample problem on the map');
await page.selectOption('[data-testid=problem-select]', 'sample-fig7');
await page.click('button[role=tab]:has-text("Solve")');
await page.waitForSelector('.steps .step-head');
const fig7 = await page.$$eval('.steps .step-head', (n) => n.map((x) => x.textContent).filter((t) => t.startsWith('#')));
ok(fig7.length === 9 && fig7[3].includes('No. 2 Entry at Crosscut 3') && fig7[8].includes('No. 3 Entry at Crosscut 3'), `Figure 7 solves to the rule book's team stops offline (${fig7.length} stops)`);
await page.click('button[role=tab]:has-text("Ventilation")');
await page.waitForSelector('.vent-panel');
ok((await page.textContent('.vent-panel')).includes('No fan is running'), 'ventilation tab: no fan, no airflow (Miscellaneous rule 4)');
await page.click('button[role=tab]:has-text("Build")');
await ctx.setOffline(false);

// Timer auto-submit (fake clock): preshift mock is 10 questions / 15 minutes.
{
  const c2 = await browser.newContext();
  const p2 = await c2.newPage();
  await p2.clock.install();
  await p2.goto(url);
  await p2.waitForSelector('[data-testid=event-select]');
  await p2.selectOption('[data-testid=event-select]', 'preshift');
  await p2.goto(url + '#/quiz?mode=mock');
  await p2.click('button.primary:has-text("Start")');
  await p2.waitForSelector('[data-testid=choice]');
  ok((await p2.textContent('[role=timer]')).includes('15:00'), 'preshift mock timer starts at 15:00');
  await p2.click('[data-testid=choice] >> nth=0');
  await p2.clock.runFor(15 * 60 * 1000 + 2000);
  await p2.waitForSelector('[data-testid=final-score]', { timeout: 5000 });
  const sc = (await p2.textContent('[data-testid=final-score]')).trim();
  ok(/\/ 10$/.test(sc) && (await p2.textContent('main')).includes('Time is up'), `timer auto-submits; unanswered count as wrong (${sc})`);
  // Practice with the timer on also auto-submits.
  await p2.goto(url + '#/quiz');
  await p2.reload();
  await p2.waitForSelector('[data-testid=timer-toggle]');
  await p2.check('[data-testid=timer-toggle]');
  await p2.fill('[data-testid=timer-minutes]', '2');
  await p2.press('[data-testid=timer-minutes]', 'Enter');
  await p2.click('button.primary:has-text("Start")');
  await p2.waitForSelector('[data-testid=choice]');
  await p2.click('[data-testid=choice] >> nth=0');
  await p2.clock.runFor(2 * 60 * 1000 + 2000);
  await p2.waitForSelector('[data-testid=final-score]', { timeout: 5000 });
  ok((await p2.textContent('main')).includes('Time is up'), `timed practice auto-submits (${(await p2.textContent('[data-testid=final-score]')).trim()})`);
  await c2.close();
}
ok(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
await browser.close();
