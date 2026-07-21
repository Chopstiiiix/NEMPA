import { useEffect, useRef } from 'react';
import { HashRouter, Routes, Route, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useSwipeBack } from './lib/useSwipeBack';
import { useOverscrollBounce } from './lib/useOverscrollBounce';
import { armSos } from './lib/sos';
import { initSosLaunch } from './lib/sosLaunch';
import { initGlobalHaptics } from './lib/haptics';
import Nav from './components/Nav';
import SosOverlay from './components/SosOverlay';
import Feed from './pages/Feed';
import ReportForm from './pages/ReportForm';
import AlertDetail from './pages/AlertDetail';
import Auth from './pages/Auth';
import Review from './pages/Review';
import logo from './assets/sparrow-logo.png';

function AnimatedRoutes() {
  const location = useLocation();
  useSwipeBack();
  // The bounce wrapper sits OUTSIDE the keyed motion.div on purpose: that one
  // remounts on every route change, and the hook needs a node that survives so
  // its listeners don't end up bound to a detached element.
  const bounceRef = useRef<HTMLDivElement>(null);
  useOverscrollBounce(bounceRef);
  // Enter-only animation: no AnimatePresence exit-wait, so switching tabs
  // mounts the next page immediately instead of stalling on the old one.
  return (
    <div ref={bounceRef}>
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
      >
        <Routes location={location}>
          <Route path="/" element={<Feed />} />
          <Route path="/report" element={<ReportForm />} />
          <Route path="/alert/:id" element={<AlertDetail />} />
          <Route path="/account" element={<Auth />} />
          {/* Not route-guarded: the queue is empty for a non-staff caller (RLS
              won't return other people's pending reports) and every action is
              re-authorised server-side. A guard here would be theatre. */}
          <Route path="/review" element={<Review />} />
        </Routes>
      </motion.div>
    </div>
  );
}

export default function App() {
  useEffect(() => {
    initGlobalHaptics();
    // Quick action / Siri / Back Tap / Action Button. Routed through armSos so
    // an out-of-app trigger gets the same 5-second cancellable countdown as a
    // volume-button one — Back Tap in particular can fire from a knock against
    // a table, and an un-cancellable trigger would send false alarms.
    initSosLaunch((kind) => void armSos(kind));
  }, []);
  return (
    <HashRouter>
      <div className="app">
        <header className="app-bar">
          <img src={logo} className="app-bar__logo" alt="Sparrowtell" />
          <span className="app-bar__tag">Community Alert Network</span>
          <button className="sos-chip" onClick={() => void armSos('sos')} aria-label="Trigger SOS">
            SOS
          </button>
        </header>
        <AnimatedRoutes />
        <Nav />
        <SosOverlay />
      </div>
    </HashRouter>
  );
}
