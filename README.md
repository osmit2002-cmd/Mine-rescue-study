# Mine Rescue Study (v0.4.0)

Offline study aid for the **2026 MSHA mine rescue contest rules**. It is a Vite + React + TypeScript app that installs as a progressive web app and works with no connection after the first load. It covers all six coal contest events (654 statements of fact).

**Live app:** https://osmit2002-cmd.github.io/Mine-rescue-study/

## Build

Use the current Node.js LTS (Node 24). From the repository root:

```bash
npm ci
npm test
npm run build
```

`npm run build` runs `scripts/copy-content.mjs` first. That script reads the committed `content/` folder (override with the `CONTENT_DIR` environment variable), copies the JSON into `public/content`, and downscales figures. The production site is `dist/`.

Pushes to `main`, and manual **workflow_dispatch** runs, do the same steps in `.github/workflows/pages.yml` and deploy `dist/` to GitHub Pages. The repository's Pages source has to be **GitHub Actions** (Settings → Pages → Build and deployment → Source).

## MSHA 2026 source

Rule books and statements of fact are the 2026 MSHA Unified Mine Rescue Rules for the six coal contest events, taken from the PDFs published on [msha.gov](https://www.msha.gov/training/mine-rescue-training/mine-rescue-contests/2026-unified-mine-rescue-rules-and) and downloaded on 2026-10-15. Wording is kept verbatim, including printed typos. This is a study aid; check the official rule book for the contest you are entering. Editions, counts, and processing notes are in `content/sources.md`.

## Events

| Event | Rule book | Rules | Statements of fact | Parts tables | Mock exam |
|---|---|---|---|---|---|
| Coal Mine Rescue | `rules.json` (approved 1/15/2026) | 100 | 200 (nos. 1–200, rule book pp. 71–80) | – | 10 statements, 15 min (Written Examination rule 3, p. 7) |
| First Aid | `rules-first-aid.json` | 163 | 100 | – | 15 statements, 20 min |
| Bench – BioPak 240-R | `rules-bench-biopak.json` | 63 | 89 | 13 | 20 statements, 20 min |
| Bench – Dräger BG-4 | `rules-bench-bg4.json` | 80 | 88 | 11 | 20 statements, 20 min |
| Bench – Dräger BG ProAir | `rules-bench-proair.json` | 85 | 77 | 18 | 20 statements, 20 min |
| Preshift | `rules-preshift.json` | 56 | 100 | – | 10 statements, 15 min |

(Counts are from the content loaded at build time.)

Mock exams use **statements of fact only**. Sizes and official times come from `facts.json` → `events`, with fallbacks in `src/quiz/quizConfig.ts` → `mockExams`, all in `src/quiz/mock.ts`. For bench events the metadata's whole exam length (`questions: 20`) is asked as statements; without metadata the size is 20 (`benchMockStatements`). Set `mockIncludesParts: true` to go back to 10 statements + 10 parts.

## What the app does

- **Event picker** in the header. Your choice is saved on the device (`localStorage`) and filters Rules, Facts, Search, Parts, Figures and Quiz. Facts and Search also have an **All events** option.
- **Rules:** a collapsible section → group → rule tree with a filter, deep-linkable rule pages (`#/rules/<id>`), and prev/next within the same event. Sub-items (A., 1., a.) are indented paragraphs. Skill sheets and forms (`format: "pre"`) appear in a monospace block with whitespace exactly as printed. Wording is never changed: typos stay as printed.
- **Statements of fact:** each one is shown verbatim, with its event, its printed reference, any `edit_note`, the source document and the edition.
- **Identification of Parts** (bench events): event → table → numbered rows, with the parts drawing.
- **Figures:** 103 page images, downscaled to WebP and linked to their rules and sections.
- **Search:** offline full text (MiniSearch) across rules, statements, parts tables and section notes. Results show highlights and have type and section chips.
- **Quiz:**
  - Three-choice multiple choice is the default (the 2026 exam format). Fill-in is optional practice.
  - Questions blank a key term or number in the verbatim statement. The wrong options are the same kind of token (same unit, a related term, nearby statements) taken from the **same event**. Printed references such as "Ch.-3 pg. 39" are never blanked.
  - Bench practice can add parts questions (the source defaults to Statements): given a part number, pick the printed name. Wrong options come from the same table first, then from the same event. Mock exams never include parts.
  - **Mock exam:** the event's exam size. It scores out of the full length (unanswered questions count as wrong) and then shows a full review.
  - **Timer** (mock exams and practice): an on/off switch and a length in minutes, saved on the device (`mrs.timer.v1`). Mock exams are timed by default when the event has an official limit; practice is untimed by default. The length defaults to the official time (15 minutes for Coal Mine Rescue, per rule 3 on p. 7), or 15 minutes for an event without one. When time runs out, answers are submitted automatically.
  - Practice sessions show score and streak and let you retry the questions you missed.
- **Problem builder** (`#/builder`): design a coal mine rescue field problem on a blank map and let the app work it. See [Problem builder](#problem-builder) below.
- **About:** each event's document, edition, publisher, exam format and rules file, plus the redline notes, the figure size report, content-check results and `sources.md`.
- **Installable PWA:** after the first load, everything (app, all JSON, all figures) works with no connection.

## Problem builder

`#/builder` (the **Builder** tab) builds coal mine rescue field problems and works them out from the 2026 Coal Mine Rescue Rules. Everything runs on the device and works offline.

**Build**
- **Blank map:** set the entries, crosscuts, entry width and pillar size. All pillar blocks are equal size (General Information rule 7) and the fresh air base is the bottom row. With **Edit openings…**, click any entry, crosscut or stub to cycle it through three states: *mined* (solid lines: actual, accurately measured workings), *projected* (dotted lines) and *not mined* (Miscellaneous rule 3). Side stubs off the outer entries give rooms, faces, shafts and sealed areas.
- **Placards and objects:** every symbol of the MSHA Mine Map Legend (rule book pp. 51–55) is available: permanent and temporary stoppings (intact or not), seal, door, barricade, diagonal, overcast, line curtain (installed or carried), caved, unsafe roof (rib to rib or partial), unsafe rib, water (depth, over knee deep, roofed), smoke and end of smoke, gas placards (% CH4, PPM CO, % O2), air movement, fire (extinguishable or not), fan (running, exhausting or blowing), body, live person (conscious or not, orientation), refuge alternative, brattice cloth, roof support, FPA, and the "X" objects: lunch pail, note, timbers, pump, equipment, cable and battery (energized or not), borehole, air shaft, face, cut into old works, materials and other.
- Click a symbol, then click the map. It snaps into the opening, and across-symbols turn to fit an entry or a crosscut. A ring of placement options opens around it (direction, intact/airtight, open/closed, smoke density and so on, plus copy, delete and done); tap a placed symbol to open the ring again. Drag to move. The inspector holds the verbatim placard wording, the legend note and links to the rules. Keyboard: arrows nudge, Shift+arrows move 5 ft, R rotates, Delete removes, Ctrl+Z / Ctrl+Shift+Z undo and redo. Gas and smoke extents are hatched on the map as you build and are recalculated for the whole map after every change.
- The problem statement, written instructions, missing persons, time limit and materials at the FAB go in the Problem panel. **Design checks** flag rule-book problems: stopping placards that don't say permanent or temporary, unsafe roof placards without "unsafe roof", "air clear" placards, missing gas readings, more than one live person in a refuge alternative, and symbols placed outside the openings.

**Solve.** Walk through one rule-consistent solution step by step: the map shows only what has been found, the explored area, the route and numbered team stops.
- The FAB checklist: clock, equipment and communication checks, check board, and gas tests at every entrance (Rules 14, 17, 26, 24C, 28).
- Team stops in systematic order (Rules 29, 44): outby areas before advancing, tie across into open crosscuts while tying outby (44D), the contaminated entry or the entries next to it first (44B/C), and the 25-ft limit into openings at each stop. The rule book's own example, Figure 7, comes out in exactly its printed order; a test checks this.
- At each stop: gas tests in each opening (24B, or immediately outby a blocking condition), roof/rib/face tests, dates and initials, and what to do with each object found, with links to the rules.
- **Patients:** live persons are taken to the FAB as soon as they can be reached (Rules 33, 34, 41). The team timbers to a patient under unsafe roof once timbers have been found (Rule 41C1), pumps water when it has a pump (41C2), and airlocks and breaches a barricade where someone answers (Rules 35, 41, 42).
- **Withdrawal (Rule 31B):** an explosive mixture (5–15% CH4 with 12.1% O2 or more) with no non-explosive separation from evidence of fire (fire, smoke, CO above 10 PPM), or energized equipment in an explosive mixture, ends exploration.
- Separations that hide accessible areas are airlocked through (Rule 42). While missing persons are still unaccounted for, inaccessible areas are opened up when the materials are there (Rule 44F).
- **Mapping key:** everything to put on the team map (A Card 5) and the briefing officer/CCA map (A Card 6), with the wording to write beside each symbol, plus the conditions to note at the end (5L) and objects that must *not* be mapped because they are never reached (A Card 4).
- **Hazards:** each gas placard is classed as explosive (Rule 31), irrespirable (Rule 34: under 19.5% O2, over 50 PPM CO, smoke) or a contaminant (Rule 44). Extents follow Rule 24E: a placard in an intersection is confined to the intersection; otherwise the gas extends to a placard showing a change, an airtight separation or the next required test location; smoke extends to "end of smoke" or an airtight separation.

**Ventilation.** An airflow estimate over the openings (Kirchhoff's laws: airtight separations block, damaged structures leak, the FAB and air shafts are open to fresh air, and a running fan exhausts or blows). With no fan running, no air moves (Miscellaneous rule 4). In the *what if* view you can take structures down, open doors, put fires out, build temporary stoppings or change the fan. The app then reports where the smoke and gases would be carried: an explosive mixture over an ignition source or an unexplored area (Rule 31A/C/D), irrespirable air over unexplored areas while persons are unaccounted for (30F), air over an inextinguishable fire (30G), and irrespirable air reaching the FAB (30H).

**Save, share, print.** Problems are saved in the browser (`localStorage`). **Export** downloads a `.mrs-problem.json` file and **Import** reads one back, so problems can be shared. **Print** produces the blank map, either fitted to a page or at the contest scale of 1 in = 10 ft for large-format paper. The blank map shows only FAB objects and air shafts (A Card 5B). Print can also produce the key map with the statement, the mapping key and the team stops.

**Samples.** *Rule book Figure 7* (Rule 44 systematic exploration, with the rule book's own team-stop numbering) and *Rule book Figure 5* (Rule 29) are figures from the rule book drawn as problems. *Practice 1* was written for this app and is not an official contest problem; it has smoke, a fire, an explosive face, a barricade, unsafe roof and three missing miners. *2016 Post 5 & WV State — Day 1* is a past contest problem transcribed from `problems/` (see Reference cases).

**Reference cases.** `src/builder/cases/` holds past contest problems transcribed from the PDFs in `problems/`, each with its judge book's key (`JudgeKey` in `src/builder/judge.ts`): the team-stop numbers the judges accept at each intersection, the patients to rescue and by which stop, and the key points the solver cannot be checked against yet. `compareToKey()` reports where the solver agrees with the judges; `src/builder/cases.test.ts` pins the checks that still fail.

**Past contest problems.** Archived problems (MSHA's contest problem archive, state judge packets) can be entered with the builder and exported as files. None ship with the app: those sites could not be reached when this was built, so no past problem has been checked against the solver yet.

**Problem file format** (`schema: "mrs-problem/1"`): `layout` (entries, rows, entryWidth, pillarWidth, pillarLength, stubLength, `cells` overrides keyed `"cx,cy"` → `open` / `projected` / `solid`, entryNames, xcStart) and `elements` (each with `kind`, `x`/`y` in feet from the outby-left corner of the FAB row, placard `text`, and fields for its kind such as `ch4`/`co`/`o2`, `intact`, `airtight`, `open`, `across`, `len`, `overKnee`, `extinguishable`, `fanMode`, `dir`, `sub`). Imports are validated and cleaned: unknown kinds and bad fields are dropped, and sizes are clamped (`src/builder/model.ts`).

**Code:** `src/builder/` holds `model.ts` (problem format and validation), `catalog.ts` (legend symbols and verbatim legend notes), `geometry.ts` (map grid, openings graph, snapping), `rules.ts` (gas classes and what blocks travel or air), `extents.ts` (Rule 24E), `explore.ts` (the solver), `vent.ts` (airflow and checks), `ventplan.ts` (step-by-step ventilation planner), `solve.ts` (mapping key and design checks), `judge.ts` (judge keys and the comparison), `samples.ts`, `cases/` (reference cases), and `ui/` (SVG map, symbols, panels). The page is `src/pages/Builder.tsx`. Tests are in `src/builder/builder.test.ts`, `src/builder/ventplan.test.ts` and `src/builder/cases.test.ts`.

The solver gives one acceptable order, not the only one, and the airflow is an estimate. This is a study aid: check problems against the official rule book and with your contest director.

## Run

```bash
npm ci             # first time, or after dependency changes
npm run dev        # http://localhost:5173
npm test           # vitest
npm run build      # copy content + typecheck + production build into dist/
npm run preview    # serve dist/ on :4173 to check the service worker
node scripts/offline-check.mjs   # headless end-to-end + offline check (needs preview running + Chrome)
```

To try the solver: `npm run dev`, open `http://localhost:5173/#/builder`, pick a problem (or **Samples → 2016 Post 5 & WV State — Day 1**) and open the **Solve** tab. `npx vitest run src/builder` runs just the builder, solver, ventilation planner and judge-key tests; a failing judge-key test prints the full comparison with the judges.

## Deploy

`dist/` is a static site (relative paths, hash routing). Serve it from any static host, at a domain root or in a sub-folder:

- **GitHub Pages / any static host:** upload the contents of `dist/` (or unzip `mine-rescue-app-dist.zip`).
- **Phone or PC:** open it once while online, then install it (browser menu → "Install app" / "Add to Home screen").
- The service worker precaches everything: about 126 files, 4.7 MB. When you deploy new content, the app shows a "new version available" prompt.

## Dropping in content

Content lives in `content/` at the repository root (override with `CONTENT_DIR`). `npm run dev` and `npm run build` run `scripts/copy-content.mjs`, which rebuilds `public/content` from scratch:

| File | Handling |
|---|---|
| `facts.json` | All events. `counts_by_event` and `events` (exam formats, rules files, documents) are validated and used. |
| `rules.json` | The Coal Mine Rescue rule book. |
| `rules-{event}.json` | Found from `events[].rules_file` and from any `rules-*.json`. Same layout as `rules.json`. |
| `parts.json` | Bench Identification of Parts tables (`count_tables`/`count_rows` are checked). |
| `figures/**` | Converted with sharp to **WebP, quality 75, at most 1400 px wide**. 103 images: 12.6 MB → 3.6 MB. If sharp is missing, the files are copied as they are. |
| `sources.md` | Shown on the About page. |

If rules or facts are missing, empty, invalid or have no records, the build uses the bundled **SAMPLE** placeholders (`src/data/sample/`) and the app shows a yellow SAMPLE DATA banner. `build-info.json` records what was used.

All field names are mapped in **one file, `src/data/adapter.ts`**. Bad records are skipped and reported on the About page, so they never crash the app. Per-event counts are compared with `counts_by_event`, `count_tables` and `count_rows`. Quiz tuning (choice count, session sizes, mock exam fallbacks, typo tolerance, term groups, lexicon) is all in `src/quiz/quizConfig.ts`.

### Figures: precache vs download button

All figures are precached. As WebP the whole content folder is 4.7 MB, so the first install stays small, and the app needs neither a runtime cache nor a "download all" button. If the figures grow a lot, switch the image glob in `vite.config.ts` to a runtime CacheFirst route.

## Tests

`npm test` runs vitest. It covers:

- the cloze candidate finder and the multiple-choice/fill-in generators;
- protection of the printed reference and the distractor source order;
- parts questions;
- the answer checker, fact picking and stats;
- the content validator;
- two checks against the real files when `content/` is present: every record of every event loads with zero errors, and every statement and part row yields a valid three-choice question;
- the problem builder: gas thresholds (Rules 31, 34, 44), map geometry and snapping, the exploration solver (rule book Figure 7's team-stop order, Figure 5, withdrawal, patients behind water with and without a pump, the practice problem), Rule 24E extents, the airflow estimate, and problem-file validation.

## Deferred (known issues for after v0.1.0)

From King Grok's testing and the reviews:

- **Weak or oddly capitalized distractors** on some statements (e.g. Mine Rescue #186, #70). Improve term grouping and casing for those token kinds.
- **A repeated word is blanked everywhere** (e.g. Preshift #19, Mine Rescue #54/#70). The real exam allows at most 2 blanks per statement, so the cloze should cap at 2 occurrences and show the rest.
- **The "Ready to work offline" toast covers content** on small screens. Auto-dismiss it or move it clear of the bottom nav.
- **Opening `index.html` from `file://` shows a blank page.** The app and service worker need http(s) hosting (GitHub Pages, any static host, or `npm run preview` locally). Add a no-JS/file:// hint.
- A one-question "Practice this one" from a statement page always runs without a timer.
- The practice timer keeps running while answer feedback is shown.
- Opening a rule from another event keeps the header edition of the selected event.
- Event chips have no roving tabindex.
- Mine Rescue #128: "non-apparatus" vs "nonapparatus". The hyphen falls at a line break in the PDF.
