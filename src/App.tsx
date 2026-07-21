import { useEffect } from 'react';
import { HashRouter, Routes, Route, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useSwipeBack } from './lib/useSwipeBack';
import { armSos } from './lib/sos';
import { initGlobalHaptics } from './lib/haptics';
import Nav from './components/Nav';
import SosOverlay from './components/SosOverlay';
import Feed from './pages/Feed';
import ReportForm from './pages/ReportForm';
import AlertDetail from './pages/AlertDetail';
import Auth from './pages/Auth';
import logo from './assets/sparrow-logo.png';

function AnimatedRoutes() {
  const location = useLocation();
  useSwipeBack();
  // Enter-only animation: no AnimatePresence exit-wait, so switching tabs
  // mounts the next page immediately instead of stalling on the old one.
  return (
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
      </Routes>
    </motion.div>
  );
}

export default function App() {
  useEffect(() => { initGlobalHaptics(); }, []);
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
