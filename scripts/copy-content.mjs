// Copies the real content from ./content (or CONTENT_DIR) into public/content so Vite serves it and
// the service worker precaches it. Content JSON is copied byte-for-byte; nothing is rewritten.
//
//  - facts.json, rules.json: used if present, non-empty, valid JSON with records; otherwise the bundled
//    SAMPLE files are used and the UI shows a SAMPLE DATA banner.
//  - rules-*.json (other events) and parts.json: copied when present and valid (real content only).
//  - figures/**: downscaled to max 1400 px wide and re-encoded as WebP q75 with sharp (falls back to a
//    plain copy if sharp is unavailable). build-info.json maps original paths to the built files.
//    Converted files are cached per user (~/.cache/mine-rescue-study/figures, or FIGURE_CACHE_DIR); with --dev
//    (npm run dev) nothing is converted and uncached figures are copied unchanged.
//  - figures.json (cropped-figure index): copied when present and valid. Every cropped figure (figures.json and
//    the `figures` lists on rule items and sections) is checked: file exists, rule/section ids resolve, no
//    duplicate ids. Problems are warned about here and reported (and skipped) in the app.
//  - Cropped figures: max CROP_MAX_WIDTH (1000) px wide, WebP q CROP_QUALITY (70), precached.
//  - When cropped figures exist, only they are precached; the other images (full rule-book pages) are written to
//    content/pages/ and cached by the service worker when first viewed ("Download all for offline" on the
//    Figures page fetches them all). Without cropped figures every image is precached, as before.
//  - sources.md: copied for the About page.
import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, statSync, rmSync, readdirSync, renameSync } from 'node:fs';
import { dirname, join, resolve, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { availableParallelism, homedir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(here, '..');
const contentDir = resolve(process.env.CONTENT_DIR ?? join(appDir, 'content'));
const sampleDir = join(appDir, 'src', 'data', 'sample');
const outDir = join(appDir, 'public', 'content');
const FIG_MAX_WIDTH = 1400;
const FIG_QUALITY = 75;
// Cropped figures are precached, so they are kept smaller (still sharp enough to read a skill sheet; the
// full page is one tap away at FIG_MAX_WIDTH). Override with CROP_MAX_WIDTH / CROP_QUALITY.
const CROP_MAX_WIDTH = Number(process.env.CROP_MAX_WIDTH ?? 1000);
const CROP_QUALITY = Number(process.env.CROP_QUALITY ?? 70);
// --dev: never convert figures (see the figures step below).
const DEV = process.argv.includes('--dev');

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

/** Count records in an array or in the first array-valued property of a wrapper object. */
function countRecords(json) {
  if (Array.isArray(json)) return json.length;
  if (json && typeof json === 'object') {
    for (const v of Object.values(json)) if (Array.isArray(v)) return v.length;
  }
  return 0;
}

/** Returns { json, reason } for a usable file, or { json: null, reason } otherwise. */
function readUsable(path) {
  if (!existsSync(path)) return { json: null, reason: 'not found' };
  if (statSync(path).size === 0) return { json: null, reason: 'empty file' };
  try {
    const json = JSON.parse(readFileSync(path, 'utf8'));
    const n = countRecords(json);
    return n > 0 ? { json, reason: `${n} top-level records` } : { json: null, reason: 'no records' };
  } catch (e) {
    return { json: null, reason: `invalid JSON (${e.message})` };
  }
}

const info = { generatedAt: new Date().toISOString() };
let factsJson = null;
for (const kind of ['rules', 'facts']) {
  const real = join(contentDir, `${kind}.json`);
  const r = readUsable(real);
  const used = r.json ? 'real' : 'sample';
  copyFileSync(used === 'real' ? real : join(sampleDir, `sample-${kind}.json`), join(outDir, `${kind}.json`));
  info[kind] = { used, reason: r.reason };
  if (kind === 'facts' && r.json) factsJson = r.json;
  const loud = used === 'sample' && !['not found', 'empty file'].includes(r.reason);
  (loud ? console.warn : console.log)(`[copy-content] ${kind}: ${used === 'real' ? `using ${real} (${r.reason})` : `using SAMPLE data (${r.reason})`}`);
}

// Rule books per event. facts.json `events[id].rules_file` says which file belongs to which event.
const eventsMeta = factsJson && typeof factsJson.events === 'object' && factsJson.events ? factsJson.events : {};
const fileToEvent = {};
for (const [id, e] of Object.entries(eventsMeta)) if (e && typeof e.rules_file === 'string') fileToEvent[e.rules_file] = id;
info.ruleFiles = [];
if (info.rules.used === 'real') {
  info.ruleFiles.push({ file: 'rules.json', event: fileToEvent['rules.json'] ?? null });
  const extra = new Set([...Object.keys(fileToEvent), ...readdirSync(contentDir).filter((f) => /^rules-.+\.json$/.test(f))]);
  for (const f of [...extra].filter((f) => f !== 'rules.json').sort()) {
    const r = readUsable(join(contentDir, f));
    if (!r.json) {
      console.warn(`[copy-content] ${f}: skipped (${r.reason})`);
      continue;
    }
    copyFileSync(join(contentDir, f), join(outDir, f));
    info.ruleFiles.push({ file: f, event: fileToEvent[f] ?? (typeof r.json.event === 'string' ? r.json.event : null) });
  }
  console.log(`[copy-content] rule books: ${info.ruleFiles.map((r) => `${r.file}${r.event ? ` (${r.event})` : ''}`).join(', ')}`);
}

// Identification of Parts tables.
info.parts = { used: false };
if (info.rules.used === 'real') {
  const r = readUsable(join(contentDir, 'parts.json'));
  if (r.json) {
    copyFileSync(join(contentDir, 'parts.json'), join(outDir, 'parts.json'));
    info.parts = { used: true, reason: r.reason };
  } else if (r.reason !== 'not found') console.warn(`[copy-content] parts.json: skipped (${r.reason})`);
}

// Cropped figures: figures.json plus the `figures` lists on rule items and sections.
const figurePath = (f) => {
  let p = String(f).trim().replace(/\\/g, '/').replace(/^(\.?\/)+/, '');
  if (p.startsWith('content/')) p = p.slice(8);
  return p.startsWith('figures/') ? p : `figures/${p}`;
};
const isCrop = (e) => !!e && typeof e === 'object' && !Array.isArray(e) && (e.caption !== undefined || e.id !== undefined);
info.figuresIndex = { used: false };
let figIndex = null;
if (info.rules.used === 'real') {
  const r = readUsable(join(contentDir, 'figures.json'));
  if (r.json) {
    copyFileSync(join(contentDir, 'figures.json'), join(outDir, 'figures.json'));
    info.figuresIndex = { used: 'real', reason: r.reason };
    figIndex = r.json;
  } else if (r.reason !== 'not found') console.warn(`[copy-content] figures.json: skipped (${r.reason})`);
}
const indexList = figIndex ? (Array.isArray(figIndex) ? figIndex : figIndex.figures ?? figIndex.items ?? figIndex.images ?? []) : [];
const cropEntries = []; // { e, where, owner?: { kind, id } }
const ruleIds = new Set();
const sectionIds = new Set();
for (const e of indexList) if (isCrop(e) && e.kind !== 'page') cropEntries.push({ e, where: 'figures.json' });
for (const { file } of info.ruleFiles ?? []) {
  const book = JSON.parse(readFileSync(join(outDir, file), 'utf8'));
  for (const sec of Array.isArray(book.sections) ? book.sections : []) {
    if (sec && typeof sec.id === 'string') sectionIds.add(sec.id);
    for (const e of Array.isArray(sec?.figures) ? sec.figures.filter(isCrop) : []) cropEntries.push({ e, where: `${file} section ${sec.id}`, owner: { kind: 'section', id: sec.id } });
    for (const it of Array.isArray(sec?.items) ? sec.items : []) {
      if (it && typeof it.id === 'string') ruleIds.add(it.id);
      for (const e of Array.isArray(it?.figures) ? it.figures.filter(isCrop) : []) cropEntries.push({ e, where: `${file} rule ${it.id ?? '?'}`, owner: { kind: 'rule', id: it.id } });
    }
  }
}
const cropFiles = new Set(cropEntries.filter(({ e }) => typeof e.file === 'string' && e.file.trim()).map(({ e }) => figurePath(e.file)));

// Figures: downscale + WebP. Full pages go to content/pages/ (not precached) when cropped figures exist.
info.figures = { count: 0, originalBytes: 0, builtBytes: 0, cropBytes: 0, crops: 0, format: 'none', map: {}, checked: info.rules.used === 'real', runtime: [] };
const figDir = join(contentDir, 'figures');
if (info.rules.used === 'real' && existsSync(figDir)) {
  let sharp = null;
  try {
    sharp = (await import('sharp')).default;
  } catch {
    console.warn('[copy-content] sharp not available: figures copied unchanged');
  }
  const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
  const images = walk(figDir).filter((p) => /\.(png|jpe?g|webp)$/i.test(p));
  // Converting every figure to WebP takes a minute or more, so converted files are kept in a per-user cache
  // (shared by every checkout and branch) keyed by the source bytes and settings; only new or changed figures
  // are converted, in parallel. With --dev (npm run dev) nothing is converted: figures already in the cache
  // are used and the rest are copied unchanged, so the dev server starts at once.
  const cacheDir = resolve(process.env.FIGURE_CACHE_DIR ?? join(homedir(), '.cache', 'mine-rescue-study', 'figures'));
  const convert = !!sharp && !DEV;
  if (convert) mkdirSync(cacheDir, { recursive: true });
  const jobs = images.map((src) => {
    const rel = relative(contentDir, src).split('\\').join('/');
    const crop = cropFiles.has(rel);
    const bytes = readFileSync(src);
    const settings = crop ? `crop/${CROP_MAX_WIDTH}/${CROP_QUALITY}/6` : `page/${FIG_MAX_WIDTH}/${FIG_QUALITY}`;
    const cached = join(cacheDir, createHash('sha256').update(bytes).update(settings).digest('hex') + '.webp');
    return { src, rel, crop, bytes, cached, hit: existsSync(cached) };
  });
  const todo = convert ? jobs.filter((j) => !j.hit) : [];
  if (todo.length) {
    const workers = Math.max(1, Math.min(availableParallelism(), 8));
    console.log(`[copy-content] figures: converting ${todo.length} of ${images.length} image(s) to WebP on ${workers} thread(s); this happens once per machine...`);
    let done = 0;
    const queue = [...todo];
    await Promise.all(
      Array.from({ length: workers }, async () => {
        for (let j = queue.shift(); j; j = queue.shift()) {
          const tmp = `${j.cached}.${process.pid}.${randomUUID()}.tmp`;
          await sharp(j.bytes)
            .resize({ width: j.crop ? CROP_MAX_WIDTH : FIG_MAX_WIDTH, withoutEnlargement: true })
            .webp(j.crop ? { quality: CROP_QUALITY, effort: 6 } : { quality: FIG_QUALITY })
            .toFile(tmp);
          renameSync(tmp, j.cached);
          j.hit = true;
          if (++done % 25 === 0 || done === todo.length) console.log(`[copy-content]   converted ${done}/${todo.length}`);
        }
      })
    );
  }
  let webpCount = 0;
  for (const { src, rel, crop, bytes, cached, hit } of jobs) {
    const page = cropFiles.size > 0 && !crop;
    const before = bytes.length;
    let outRel = page ? `pages/${rel.slice('figures/'.length)}` : rel;
    if (hit) outRel = outRel.slice(0, -extname(outRel).length) + '.webp';
    // Full pages are cached at runtime (CacheFirst, not revisioned by the precache manifest), so their names
    // carry a content hash: a changed page gets a new URL instead of being served stale from the cache.
    if (page) {
      const h = createHash('sha256').update(bytes).update(hit ? `${FIG_MAX_WIDTH}/${FIG_QUALITY}` : 'orig').digest('hex').slice(0, 8);
      outRel = outRel.slice(0, -extname(outRel).length) + `.${h}` + extname(outRel);
    }
    mkdirSync(dirname(join(outDir, outRel)), { recursive: true });
    copyFileSync(hit ? cached : src, join(outDir, outRel));
    if (hit) webpCount++;
    const after = statSync(join(outDir, outRel)).size;
    info.figures.count++;
    info.figures.originalBytes += before;
    info.figures.builtBytes += after;
    if (crop) {
      info.figures.crops++;
      info.figures.cropBytes += after;
    }
    if (page) info.figures.runtime.push(outRel);
    info.figures.map[rel] = outRel;
  }
  info.figures.format = webpCount === jobs.length && jobs.length ? 'webp' : webpCount ? 'mixed' : 'original';
  const mb = (n) => (n / 1048576).toFixed(1);
  console.log(`[copy-content] figures: ${info.figures.count} image(s), ${mb(info.figures.originalBytes)} MB -> ${mb(info.figures.builtBytes)} MB (${info.figures.format}${DEV && webpCount < jobs.length ? `; dev: ${jobs.length - webpCount} copied unconverted, npm run build converts them` : ''})`);
  if (cropFiles.size)
    console.log(`[copy-content]   ${info.figures.crops} cropped figures, ${mb(info.figures.cropBytes)} MB precached; ${info.figures.runtime.length} full pages, ${mb(info.figures.builtBytes - info.figures.cropBytes)} MB cached on first view`);
}

// Check the cropped figures: files exist, ids resolve, no duplicates.
if (cropEntries.length) {
  const problems = [];
  const built = new Set(Object.keys(info.figures.map));
  const seenIndex = new Map();
  for (const e of indexList) {
    if (!e || typeof e !== 'object') continue;
    if (seenIndex.has(e.id)) problems.push(`figures.json: id ${e.id} appears twice`);
    seenIndex.set(e.id, e);
    for (const r of e.rule_ids ?? e.rules ?? []) if (!ruleIds.has(r)) problems.push(`figures.json ${e.id}: unknown rule ${r}`);
    for (const sId of e.section_ids ?? []) if (!sectionIds.has(sId)) problems.push(`figures.json ${e.id}: unknown section ${sId}`);
    if (typeof e.full_page === 'string' && !built.has(figurePath(e.full_page))) problems.push(`figures.json ${e.id}: full page ${figurePath(e.full_page)} not found`);
  }
  const perOwner = new Map();
  for (const { e, where, owner } of cropEntries) {
    if (typeof e.file !== 'string' || !e.file.trim()) problems.push(`${where}: figure ${e.id ?? '?'} has no file`);
    else if (!built.has(figurePath(e.file))) problems.push(`${where}: figure ${e.id ?? '?'} file ${figurePath(e.file)} not found`);
    if (!owner) continue;
    const key = `${owner.kind}:${owner.id}`;
    const l = perOwner.get(key) ?? new Set();
    if (l.has(e.id)) problems.push(`${where}: figure ${e.id} listed twice`);
    l.add(e.id);
    perOwner.set(key, l);
    const ix = seenIndex.get(e.id);
    if (figIndex && !ix) problems.push(`${where}: figure ${e.id} is not in figures.json`);
    else if (ix && ix.file && figurePath(ix.file) !== figurePath(e.file)) problems.push(`${where}: figure ${e.id} file differs from figures.json`);
    else if (ix && !(owner.kind === 'rule' ? ix.rule_ids ?? ix.rules ?? [] : ix.section_ids ?? []).includes(owner.id)) problems.push(`${where}: figures.json ${owner.kind}_ids for ${e.id} lacks ${owner.id}`);
  }
  info.figuresIndex.crops = cropEntries.length;
  info.figuresIndex.problems = problems.length;
  console.log(`[copy-content] cropped figures: ${cropFiles.size} files, ${cropEntries.length} entries (figures.json and rule/section lists), ${problems.length} problem(s)`);
  for (const p of problems) console.warn(`[copy-content]   ${p}`);
}

const sources = join(contentDir, 'sources.md');
info.sources = info.rules.used === 'real' && existsSync(sources);
if (info.sources) copyFileSync(sources, join(outDir, 'sources.md'));

writeFileSync(join(outDir, 'build-info.json'), JSON.stringify(info, null, 2));
console.log('[copy-content] done');
