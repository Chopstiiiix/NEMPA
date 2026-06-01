import { HashRouter, Routes, Route } from 'react-router-dom';
import Nav from './components/Nav';
import Feed from './pages/Feed';
import ReportForm from './pages/ReportForm';
import AlertDetail from './pages/AlertDetail';
import Auth from './pages/Auth';
import Moderation from './pages/Moderation';

export default function App() {
  return (
    <HashRouter>
      <div className="app">
        <header className="app-bar">
          <span className="app-bar__brand">NEM<b>PA</b></span>
          <span className="app-bar__tag">Community Alert Network</span>
        </header>
        <Routes>
          <Route path="/" element={<Feed />} />
          <Route path="/report" element={<ReportForm />} />
          <Route path="/alert/:id" element={<AlertDetail />} />
          <Route path="/moderate" element={<Moderation />} />
          <Route path="/account" element={<Auth />} />
        </Routes>
        <Nav />
      </div>
    </HashRouter>
  );
}
