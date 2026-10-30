import { useEffect, useState } from 'react';
import { Markdown } from '../components/Markdown';
import { useData } from '../data/DataContext';
import { resetStats } from '../quiz/stats';

export default function About() {
  const { rules, facts, figures, sections, parts, edition, document, issues, sample, contentUrl, factEvents, ruleBooks, editionFor, runtimeFigures } = useData();
  const [sources, setSources] = useState<string | null>(null);
  const [figInfo, setFigInfo] = useState<{ count: number; originalBytes: number; builtBytes: number; format: string } | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(contentUrl('build-info.json'))
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => alive && j?.figures?.count && setFigInfo(j.figures))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [contentUrl]);
  const mb = (n: number) => `${(n / 1048576).toFixed(1)} MB`;
  const [cleared, setCleared] = useState(false);
  useEffect(() => {
    if (sample.rules) return;
    let alive = true;
    fetch(contentUrl('sources.md'))
      .then((r) => (r.ok ? r.text() : null))
      .then((t) => alive && setSources(t && !/^\s*<!doctype html/i.test(t) ? t : null))
      .catch(() => alive && setSources(null));
    return () => {
      alive = false;
    };
  }, [contentUrl, sample.rules]);

  const errors = issues.filter((i) => i.level === 'error');
  const warnings = issues.filter((i) => i.level === 'warning');

  return (
    <article className="card">
      <h1>About</h1>
      <dl className="meta">
        <dt>App version</dt>
        <dd>v{__APP_VERSION__}</dd>
        {__APP_COMMIT__ && (
          <>
            <dt>Commit</dt>
            <dd>{__APP_COMMIT__}</dd>
          </>
        )}
        <dt>Edition</dt>
        <dd>{edition ?? (sample.rules ? 'SAMPLE placeholder data' : document.edition ?? 'unknown')}</dd>
        {document.title && (<><dt>Rule book</dt><dd>{document.url && /^https?:/i.test(document.url) ? <a href={document.url} target="_blank" rel="noreferrer noopener">{document.title}</a> : document.title}</dd></>)}
        {document.publisher && (<><dt>Publisher</dt><dd>{document.publisher}</dd></>)}
        <dt>Loaded</dt>
        <dd>
          {rules.length} rules in {sections.length || 'their'} sections, {facts.length} statements, {parts.length} parts tables ({parts.reduce((n, t) => n + t.rows.length, 0)} parts), {figures.filter((f) => f.kind !== 'crop').length} figure pages{figures.some((f) => f.kind === 'crop') ? `, ${figures.filter((f) => f.kind === 'crop').length} cropped figures` : ''}
        </dd>
        {figInfo && (
          <>
            <dt>Figures</dt>
            <dd>
              {figInfo.count} images, {mb(figInfo.originalBytes)} originals → {mb(figInfo.builtBytes)} {figInfo.format.toUpperCase()}{' '}
              {runtimeFigures.length ? `(cropped figures stored for offline use; ${runtimeFigures.length} full-page images saved when viewed, or all at once from the Figures page)` : '(stored for offline use)'}
            </dd>
          </>
        )}
      </dl>
      {document.note && <p className="note">{document.note}</p>}
      {factEvents.length > 1 && (
        <>
          <h2>Events and rule books</h2>
          {factEvents.map((e) => {
            const book = ruleBooks.find((b) => b.event === e.id);
            const title = book?.title ?? e.documentTitle;
            const url = book?.url ?? e.documentUrl;
            return (
              <section key={e.id} className="event-doc">
                <h3>{e.name}</h3>
                <dl className="meta small">
                  {title && (<><dt>Document</dt><dd>{url && /^https?:/i.test(url) ? <a href={url} target="_blank" rel="noreferrer noopener">{title}</a> : title}</dd></>)}
                  {(book?.edition || e.edition) && (<><dt>Edition</dt><dd>{editionFor(e.id) ?? book?.edition ?? e.edition}</dd></>)}
                  {(book?.publisher || e.documentPublisher) && (<><dt>Publisher</dt><dd>{book?.publisher ?? e.documentPublisher}</dd></>)}
                  {(e.examDetail || e.examFormat) && (<><dt>Written exam</dt><dd>{e.examDetail ?? e.examFormat}{e.examSourceRule ? ` (${e.examSourceRule})` : ''}</dd></>)}
                  {book?.file && (<><dt>Rules file</dt><dd><code>{book.file}</code></dd></>)}
                  <dt>Loaded</dt>
                  <dd>
                    {rules.filter((r) => r.event === e.id).length} rules, {facts.filter((f) => f.event === e.id).length} statements
                    {parts.some((t) => t.event === e.id) && `, ${parts.filter((t) => t.event === e.id).length} parts tables`}
                  </dd>
                </dl>
                {book?.note && <p className="note small">{book.note}</p>}
              </section>
            );
          })}
        </>
      )}
      <p className="small">
        A study aid only. The rule book wording and the statements (MSHA “statements of fact”) are shown verbatim, including typos as printed. Always
        check the official MSHA rule book for the contest you are entering. Mine Rescue Rules are designed as a training tool for
        contests; use discretion in actual mine emergencies.
      </p>

      <h2>Content check</h2>
      {errors.length === 0 && warnings.length === 0 ? (
        <p className="ok small">All records loaded without problems.</p>
      ) : (
        <details open={errors.length > 0}>
          <summary>
            {errors.length} error(s), {warnings.length} warning(s)
          </summary>
          <ul className="issues small">
            {issues.map((i, k) => (
              <li key={k} className={i.level}>
                {i.file.endsWith('.json') ? i.file : `${i.file}.json`} {i.index >= 0 ? `#${i.index + 1}` : ''} {i.id ? `(${i.id})` : ''}: {i.message}
              </li>
            ))}
          </ul>
        </details>
      )}

      <h2>Progress</h2>
      <button
        onClick={() => {
          if (confirm('Reset all quiz statistics on this device?')) {
            resetStats();
            setCleared(true);
          }
        }}
      >
        Reset quiz statistics
      </button>
      {cleared && <span className="small"> Cleared.</span>}

      {sources && (
        <>
          <h2>Sources and provenance</h2>
          <Markdown source={sources} />
        </>
      )}
      <p className="muted small" data-testid="app-version">Version {__APP_VERSION__} (build {__APP_BUILD__}). Works offline once loaded; install it from your browser menu (“Add to Home screen” / “Install app”).</p>
    </article>
  );
}
