import { lazy, Suspense, useEffect } from 'react';
import { Link, Navigate, NavLink, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { ErrorBoundary, SampleBanner } from './components/common';
import { PwaStatus } from './components/PwaStatus';
import { ALL_EVENTS, DataProvider, EventProvider, useData, useEvent, useLoadState } from './data/DataContext';
import Home from './pages/Home';
import { FactDetail, FactList } from './pages/Facts';
import Rules from './pages/Rules';
import RuleDetail from './pages/RuleDetail';
import SectionPage from './pages/SectionPage';
import Search from './pages/Search';
import Quiz from './pages/Quiz';
import Figures from './pages/Figures';
import { PartsList, PartsTable } from './pages/Parts';

const About = lazy(() => import('./pages/About'));
const Builder = lazy(() => import('./pages/Builder'));

function ScrollTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function LegacyFactRedirect() {
  const { id = '' } = useParams();
  return <Navigate to={`/statements/${encodeURIComponent(id)}`} replace />;
}

function DataGate() {
  const { state, reload } = useLoadState();
  if (state.status === 'loading') return <p className="muted center">Loading…</p>;
  if (state.status === 'error')
    return (
      <div className="card error">
        <h2>Could not load content</h2>
        <p>{state.message}</p>
        <button onClick={reload}>Try again</button>
      </div>
    );
  return <Shell />;
}

/** An unknown page is often a page from a newer version than the one the service worker still serves: if a
 *  newer version is waiting (or turns up on a check), switch to it at once, since there is nothing here to lose. */
function NotFound() {
  useEffect(() => {
    const sw = typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined;
    if (!sw) return;
    let reloading = false;
    const onChange = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };
    sw.addEventListener('controllerchange', onChange);
    sw.getRegistration()
      .then(async (reg) => {
        if (!reg) return;
        if (!reg.waiting) await reg.update().catch(() => undefined);
        const next = reg.waiting ?? reg.installing;
        if (!next) return;
        const skip = () => next.postMessage({ type: 'SKIP_WAITING' });
        if (next.state === 'installed') skip();
        else next.addEventListener('statechange', () => next.state === 'installed' && skip());
      })
      .catch(() => undefined);
    return () => sw.removeEventListener('controllerchange', onChange);
  }, []);
  return (
    <div className="card">
      <h2>Page not found</h2>
      <p className="muted">If this page is new, the app is fetching the latest version and will reload by itself.</p>
      <Link to="/">Home</Link>
    </div>
  );
}

function Shell() {
  const { editionFor, sample, parts } = useData();
  const { event } = useEvent();
  const loc = useLocation();
  const edition = editionFor(event === ALL_EVENTS ? undefined : event);
  return (
    <>
      <SampleBanner />
      <ErrorBoundary key={loc.pathname}>
        <Suspense fallback={<p className="muted center">Loading…</p>}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/rules" element={<Rules />} />
            <Route path="/rules/:id" element={<RuleDetail />} />
            <Route path="/section/:id" element={<SectionPage />} />
            <Route path="/statements" element={<FactList />} />
            <Route path="/statements/:id" element={<FactDetail />} />
            {/* Old links (v0.1.0) keep working. */}
            <Route path="/facts" element={<Navigate to="/statements" replace />} />
            <Route path="/facts/:id" element={<LegacyFactRedirect />} />
            <Route path="/search" element={<Search />} />
            <Route path="/quiz" element={<Quiz />} />
            <Route path="/figures" element={<Figures />} />
            <Route path="/parts" element={<PartsList />} />
            <Route path="/parts/:id" element={<PartsTable />} />
            <Route path="/about" element={<About />} />
            <Route path="/builder" element={<Builder />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
      <footer className="footer">
        <span>{edition ?? (sample.rules || sample.facts ? 'SAMPLE data — not the real rule book' : '')}</span>
        <span>
          <Link to="/figures">Figures</Link>{parts.length > 0 && <> · <Link to="/parts">Parts</Link></>} · <Link to="/about">About &amp; sources</Link> · <span data-testid="footer-version">v{__APP_VERSION__}</span>{__APP_COMMIT__ && <span className="muted"> · {__APP_COMMIT__.split(' ')[0]}</span>}
        </span>
      </footer>
    </>
  );
}

function Header() {
  const { state } = useLoadState();
  const { event, setEvent } = useEvent();
  const data = state.status === 'ready' ? state.data : undefined;
  const edition = data?.editionFor(event === ALL_EVENTS ? undefined : event);
  const events = data?.factEvents ?? [];
  const hasParts = !!data?.parts.some((t) => event === ALL_EVENTS || t.event === event);
  return (
    <header className="header">
      <Link to="/" className="brand">
        <img src={`${import.meta.env.BASE_URL}icons/icon-192.png`} alt="" width={28} height={28} />
        <span>
          Mine Rescue Study
          {edition && <small className="edition">{edition}</small>}
        </span>
      </Link>
      <nav className="nav" aria-label="Main">
        <NavLink to="/" end>Home</NavLink>
        <NavLink to="/rules">Rules</NavLink>
        <NavLink to="/statements">Statements</NavLink>
        <NavLink to="/quiz">Quiz</NavLink>
        <NavLink to="/search">Search</NavLink>
        <NavLink to="/builder">Builder</NavLink>
        {hasParts && <NavLink to="/parts">Parts</NavLink>}
      </nav>
      {events.length > 1 && (
        <label className="event-select">
          <span className="sr-only">Contest event</span>
          <select value={event} onChange={(e) => setEvent(e.target.value)} aria-label="Contest event" data-testid="event-select">
            {events.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
            <option value={ALL_EVENTS}>All events</option>
          </select>
        </label>
      )}
    </header>
  );
}

/** The problem builder uses the full window width; other pages keep the reading width. */
function Main() {
  const { pathname } = useLocation();
  return (
    <main className={`main${pathname.startsWith('/builder') ? ' wide' : ''}`}>
      <DataGate />
    </main>
  );
}

export default function App() {
  return (
    <DataProvider>
      <EventProvider>
        <ScrollTop />
        <Header />
        <Main />
        <PwaStatus />
      </EventProvider>
    </DataProvider>
  );
}
