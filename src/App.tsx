import { HashRouter, Navigate, NavLink, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useActivePhase } from './hooks';
import Onboarding from './screens/Onboarding';
import Review from './screens/Review';
import Today from './screens/Today';
import WeightScreen from './screens/WeightScreen';
import LiftsScreen from './screens/LiftsScreen';
import WorkoutScreen from './screens/WorkoutScreen';
import ExerciseScreen from './screens/ExerciseScreen';
import RunsScreen from './screens/RunsScreen';
import RunForm from './screens/RunForm';
import MoreScreen from './screens/MoreScreen';
import PhotosScreen from './screens/PhotosScreen';
import CheckinScreen from './screens/CheckinScreen';
import PlanScreen from './screens/PlanScreen';
import SettingsScreen from './screens/SettingsScreen';
import HealthSetup from './screens/HealthSetup';
import { ImportLinkScreen } from './components/HealthImport';

const icons = {
  today: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 12h4l3-8 4 16 3-8h4" />
    </svg>
  ),
  weight: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <path d="M8 9a6 6 0 0 1 8 0l-2.5 3" />
    </svg>
  ),
  lifts: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 7v10M3 9v6M18 7v10M21 9v6M6 12h12" />
    </svg>
  ),
  runs: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="14" cy="4" r="2" />
      <path d="M9 21l2-6 3 2v5M7 12l3-4 4 1 2 4 3 1M10 8l-2 6" />
    </svg>
  ),
  more: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <circle cx="5" cy="12" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="19" cy="12" r="1.5" />
    </svg>
  ),
  plan: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="M3 9h18M8 2v4M16 2v4" />
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  ),
};

/** Main tabs; sends first-time users to the questionnaire. */
function MainLayout() {
  const phase = useActivePhase();
  const location = useLocation();
  if (phase === undefined) return null; // loading
  if (phase === null && location.pathname !== '/settings') return <Navigate to="/setup" replace />;
  return (
    <>
      <Outlet />
      <nav className="bottom-nav">
        <NavLink to="/" end>
          {icons.today}
          Today
        </NavLink>
        <NavLink to="/weight">
          {icons.weight}
          Weight
        </NavLink>
        <NavLink to="/lifts">
          {icons.lifts}
          Lifts
        </NavLink>
        <NavLink to="/runs">
          {icons.runs}
          Runs
        </NavLink>
        <NavLink to="/more" className={() => (['/more', '/plan', '/settings'].some((p) => location.pathname.startsWith(p)) ? 'active' : '')}>
          {icons.more}
          More
        </NavLink>
      </nav>
    </>
  );
}

function UpdateToast() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  if (!needRefresh) return null;
  return (
    <div className="toast" role="status">
      <span>A new version is available.</span>
      <div className="row">
        <button className="btn small" onClick={() => setNeedRefresh(false)}>
          Later
        </button>
        <button className="btn primary small" onClick={() => updateServiceWorker(true)}>
          Update
        </button>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/setup" element={<Onboarding />} />
        <Route path="/setup/review" element={<Review />} />
        <Route path="/import" element={<ImportLinkScreen />} />
        <Route path="/lifts/workout/:id" element={<WorkoutScreen />} />
        <Route path="/photos" element={<PhotosScreen />} />
        <Route path="/checkin" element={<CheckinScreen />} />
        <Route path="/runs/log" element={<RunForm />} />
        <Route path="/runs/edit/:id" element={<RunForm />} />
        <Route path="/lifts/exercise/:exerciseId" element={<ExerciseScreen />} />
        <Route path="/settings/health" element={<HealthSetup />} />
        <Route element={<MainLayout />}>
          <Route path="/" element={<Today />} />
          <Route path="/weight" element={<WeightScreen />} />
          <Route path="/lifts" element={<LiftsScreen />} />
          <Route path="/runs" element={<RunsScreen />} />
          <Route path="/more" element={<MoreScreen />} />
          <Route path="/plan" element={<PlanScreen />} />
          <Route path="/settings" element={<SettingsScreen />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <UpdateToast />
    </HashRouter>
  );
}
