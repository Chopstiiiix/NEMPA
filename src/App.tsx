import { HashRouter, Routes, Route, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import Nav from './components/Nav';
import Feed from './pages/Feed';
import ReportForm from './pages/ReportForm';
import AlertDetail from './pages/AlertDetail';
import Auth from './pages/Auth';
import Moderation from './pages/Moderation';
import logo from './assets/nempa-logo.png';

function AnimatedRoutes() {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.17, ease: [0.22, 1, 0.36, 1] }}
      >
        <Routes location={location}>
          <Route path="/" element={<Feed />} />
          <Route path="/report" element={<ReportForm />} />
          <Route path="/alert/:id" element={<AlertDetail />} />
          <Route path="/moderate" element={<Moderation />} />
          <Route path="/account" element={<Auth />} />
        </Routes>
      </motion.div>
    </AnimatePresence>
  );
}

export default function App() {
  return (
    <HashRouter>
      <div className="app">
        <header className="app-bar">
          <img src={logo} className="app-bar__logo" alt="NEMPA" />
          <span className="app-bar__tag">Community Alert Network</span>
        </header>
        <AnimatedRoutes />
        <Nav />
      </div>
    </HashRouter>
  );
}
