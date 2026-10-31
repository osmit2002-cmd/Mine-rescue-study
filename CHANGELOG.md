# Changelog

## 0.5.0 (unreleased)

- Version 0.5.0, so a running build of the layout editing and pillar numbering changes shows v0.5.0 in the footer and on About.

- **Edit the mine layout on the map** (Builder → **Edit layout**): a layout bar adds or removes entries on the left or right, makes the problem longer or shorter at the face, and changes pillar, entry and face stub sizes; clicking an entry, crosscut or stub opens a ring to set it mined, projected or not mined. Placed symbols and opening settings stay in their openings when the grid changes, and the builder asks before removing an entry or crosscut that has symbols in it. Typing a new entry or crosscut count in the panel applies when you leave the field.
- **Side rooms:** in Edit layout every crosscut has a grab handle at each end; drag it outward to pull a side room out (all rooms on one side share a depth, shown while dragging) or back to the entry to close it, and tap it to open or close a room. **Side rooms Left / Right** in the layout bar take a whole side off (the map ends at the outer entry) or put it back, with its depth. Layout gains `sideLeft` / `sideRight`; older problems keep using the stub depth.
- **Pillar numbering** from an editable file, `src/builder/pillar-numbering.json`. Default: the two pillars outby the FAB are 0 and 00 (left to right), then 1, 2, …, N left to right across each row moving inby to the face. Other schemes (columns, right to left, back and forth, prefixes, other outby labels) can be set in the file or per device in **Blank map → Pillar numbers**, with import and export. Maps now draw the row of pillars outby the FAB, cut in half by the map edge, with the FAB crosscut just inby them and labelled beside it (Layout `outbyPillars`, on by default).
- Number fields (gas readings, sizes, counts) select their whole value when clicked or tabbed into, so typing replaces it.
- **Reference cases for the solver** (`src/builder/cases/`): past contest problems from `problems/` transcribed into builder problems, each with its judge book's key as a typed `JudgeKey` (accepted team-stop numbers per intersection, patients to rescue and by which stop, objects to find, withdrawal, and the key points not yet checkable, verbatim).
  - `compareToKey()` (`src/builder/judge.ts`) checks a solution against the key and reports each check with what the judges expect and what the solver did. The tests pin the checks that still fail, so progress shows up as a smaller list.
  - First case: 2016 Post 5 & WV State, Day 1 (MSHA archive). The solver now matches 14 of its 18 checks; the remaining four are the order of the last three team stops and the rescue that depends on it. The case is also in the builder's samples.
- **Ventilation planner** (`src/builder/ventplan.ts`): works out, step by step, how to move a gas or smoke placard out of the team's way. It picks an air course from the intake to the placard and on to a return, where the contaminated leg may not pass an ignition source, an unexplored area, a live or not-yet-examined person, or the FAB while the briefing officer is there (Rules 30, 31). Every opening that would short-circuit the course gets a team-built temporary stopping, a placard in a dead end gets a line curtain winged to it, and the fan is started if needed. The result is checked with the airflow estimate before it is accepted.
  - The solver uses it before breaching a barricade with irrespirable air on the team's side (Rule 35): explosive mixtures first, then the irrespirable air. On 2016 Post 5 Day 1 it vents the methane and then the 19.0% O2 before the second barricade, as the judges do.
  - Judge keys can list required ventilation (`vents`), and the comparison checks the order and that every plan was safe. 2016 Post 5 Day 1 now passes 17 of 21 checks.
  - New "Opening outby" object (an entry that continues outby the FAB, used as a return or intake) and a "BO outside" problem setting (the FAB need not stay respirable). A running fan in the FAB now drives the FAB instead of the FAB being open to the atmosphere.
- Solver fixes found with the first case:
  - Stoppings, doors and barricades found **not intact** no longer stop travel; the team ties across through them instead of airlocking. On contest maps a stopping drawn as a broken arrow is a temporary stopping that is down.
  - A patient already reached is taken to the FAB before the team airlocks into another barricade that answers (Rule 41B).
  - Timbers whose placard gives a count of 0 (e.g. "broken, cannot use") are not counted as roof supports.

## 0.4.0

- **Problem builder** (`#/builder`, new **Builder** tab): design coal mine rescue field problems on a blank map and have the app work them out from the 2026 rules.
  - Blank map with entries, crosscuts, equal pillars (General Information rule 7), side and inby stubs; each opening is mined (solid lines), projected (dotted) or not mined (Miscellaneous rule 3). The FAB is the bottom row.
  - Every MSHA Mine Map Legend symbol (rule book pp. 51–55) plus the common "X" objects, drawn as on a contest map. Symbols snap into openings and turn to fit a crosscut. Drag to move; the inspector holds the verbatim placard wording, the legend note and links to the rules. Undo and redo, plus keyboard shortcuts.
  - **Solve:** a step-by-step walk-through of one rule-consistent solution. It covers FAB checks, systematic team stops (Rules 29, 44B–E), gas tests in every opening, roof tests and dates and initials, and patients taken out promptly (Rules 33, 34, 41). The team timbers to a patient under unsafe roof, pumps water to reach one, and airlocks and breaches a barricade that answers (Rules 35, 41, 42). An explosive mixture next to evidence of fire, or energized equipment in one, means withdrawal (31B). Separations are airlocked through to reach accessible areas behind them (42), and inaccessible areas are opened up while persons are unaccounted for (44F). The rule book's Figure 7 comes out in exactly its printed team-stop order.
  - **Mapping key** for the team map (A Card 5) and the BO/CCA map (A Card 6), with the conditions to note at the end and the objects never reached, which must not be mapped (A Card 4).
  - **Hazards:** gas placards are classed as explosive, irrespirable or contaminant using the rule book's thresholds. Extents of gases and smoke follow Rule 24E and are hatched on the map.
  - **Ventilation:** an airflow estimate with *what if* changes (take structures down, open doors, put fires out, build temporary stoppings, change the fan). It flags explosive or irrespirable air carried over ignition sources, unexplored areas, an inextinguishable fire or the FAB (Rules 30F/G/H, 31A/C/D).
  - **Design checks:** placard wording rules (permanent/temporary stopping, “unsafe roof”, no “air clear”), gas readings, one live person per refuge alternative, and objects placed outside the openings.
  - Problems are saved on the device, with export/import as `.mrs-problem.json`. Print gives a blank map (fitted to a page or at 1 in = 10 ft, with only FAB objects and air shafts) or a key map with the mapping key and team stops.
  - Samples: rule book Figure 7 and Figure 5 drawn as problems, and a practice problem written for the app.
- Works offline like the rest of the app; the end-to-end offline check opens the builder offline and solves Figure 7.
- Version 0.4.0.

## 0.3.0

- **Figure gallery on rule pages.** A rule whose content lists cropped figures (`figures` on the rule item, in display order, merged with `content/figures.json`) shows "Figures (N)" under the rule wording:
  - Swipe (scroll-snap), prev/next buttons, Left/Right keys when the gallery is focused, dots for up to 12 figures.
  - Caption (verbatim, also the alt text), printed page and an "N of M" counter. Images load lazily.
  - Tap a figure for fullscreen: pinch or double-tap zoom, mouse wheel and −/+/Fit buttons, drag to pan when zoomed, swipe or arrow keys between figures, Esc or × to close. No new libraries.
  - "View full page" opens the crop's whole printed page (`full_page`), loaded on demand.
- **Section galleries** for sections that list figures (e.g. the coal figures section, the bench record and the Preshift form).
- Rule and section pages show cropped figures first; the old full-page images remain the fallback when there are none (skill sheets and parts now use crops).
- **Figure icon with count** on rules in the rule tree, the Rules search results and the Search page.
- **Figures page** groups the crops by kind, and each figure links to its rules. A "Download all for offline" button saves the full pages.
- **Offline:** crops are converted to WebP at build time (max 1000 px wide, quality 70) and precached with the app. Full pages are WebP too (max 1400 px, q75) but cached on first view (CacheFirst) or by "Download all", which stores them directly in the offline cache. Their file names carry a content hash, so an updated page is never served stale.
- **Build-time and load-time checks** of the figure data: a missing file, an unknown rule or section, a duplicate id or file, or a missing full page is reported in the build log and in the content check on the About page, and that figure is skipped, but the app keeps working.
- Without figure data the app is unchanged: there's no gallery or badge, and all images are precached as before.
- Version 0.3.0.

## 0.2.1

- **Search bar on the Rules page**, at the top, the same component as on the Statements page (`src/components/SearchBar.tsx` + `src/lib/textSearch.ts`). It searches the rule number, title and verbatim wording of every rule, skill sheets and parts lists (`format: "pre"`) included, scoped to the event in the header.
  - Live results as you type: every word must match, words match as prefixes, and longer words (5+ letters) tolerate a small typo. A clear button (or Esc) empties the box; the result count ("N of M rules match") is announced to screen readers. The search is kept in the URL (`#/rules?q=…`).
  - Results show as the rule tree narrowed to the matching rules (parents kept as context), sections expanded, matched words highlighted, and a verbatim excerpt of the rule wording around the match. Opening a rule highlights the words there too. An empty search brings back the full tree.
- **The rule filter is now an option directly below the search bar:** section chips (All sections + each top-level section) narrow the tree, with or without a search, next to Expand all / Collapse all.
- **The Statements page uses the same search bar:** it now matches word prefixes and small typos, highlights matched words, and has the clear button. The "N of M statements" count moved under the box.
- Text is still shown exactly as printed (plain text, no HTML), and everything works offline.

## 0.2.0

- **The header event menu is the only event control.** The per-page event chips are gone from Home, Statements, Search, Parts and Quiz; every page follows the header (Rules, Figures and Parts included). "All events" exists only in the header menu. With "All events" selected, the Quiz asks you to choose an event in the header.
- **"Facts" is now "Statements"** in the UI: nav, page titles, quiz labels, search filter, Home and About. The routes are `#/statements` and `#/statements/<id>`, and old `#/facts…` links redirect.
- **New Rules quiz**, next to the Statements quiz on the Quiz page (`#/quiz?kind=rules`):
  - A key token is blanked in one verbatim sentence of the selected event's rules: a number with its unit, a defined or quoted term, an acronym, or a technical or capitalized term. Plain words are never blanked, and there are at most 2 blanks per sentence; a token that appears more often is not used.
  - Skill sheets and forms (`format: "pre"`) are skipped, as are list fragments, sentences that are too short or too long, and score-column rows.
  - The three choices are the same kind of token from other rules of the same event: numbers with the same unit, then terms from the same section, then the whole event. Options that contain the answer are never offered, and options follow the answer's case style.
  - After each answer the app shows the rule reference (event › section › rule, page) with a link to the rule.
  - Options: 10/20/all questions, three-choice or fill-in (a bare number is accepted for a number-with-unit blank), and the timer (separate on/off switch, off by default).
  - Generator: `src/quiz/rulesQuiz.ts`. Tests check that every generated question is verbatim from its rule and has three distinct options.
- Bench mock exams are unchanged (statements only, 20).
- Option dedupe now also ignores spacing and punctuation ("BG-4" vs "BG4").
- Version 0.2.0.

## Deferred

- Weak or oddly capitalized distractors in the Statements quiz (e.g. Mine Rescue #186, #70).
- The Statements quiz blanks a repeated word everywhere (e.g. Preshift #19, Mine Rescue #54/#70); the real exam caps it at 2. The Rules quiz already caps at 2.
- The "Ready to work offline" toast covers content on small screens.
- Opening `index.html` from `file://` shows a blank page; it needs http(s) hosting.
- In the Rules quiz, "All" counts sentences that have a blankable token. A few cannot produce three good options and are skipped, so a session can be slightly shorter than shown.
- Rules quiz distractors are sometimes loosely related (e.g. a person's role versus a place); there is no semantic typing beyond token kind, section and unit.
- One-question "Practice this one" is untimed; the practice timer runs while feedback is shown; there is no roving tabindex on chips; Mine Rescue #128 hyphen (non-apparatus vs nonapparatus).
