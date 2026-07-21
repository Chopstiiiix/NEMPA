import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import { BellIcon, PersonIcon } from './icons';

interface Tab { to: string; label: string; render: (active: boolean) => ReactNode }

const glyph = (g: string) => () => <span className="nav__item-icon">{g}</span>;

/**
 * Sparrowtell is the citizen-side app — there is no moderation surface here at
 * all. Investigating a report and deciding to broadcast it happens in Gecko Intel.
 */
const tabs: Tab[] = [
  { to: '/', label: 'Alerts', render: (a) => <BellIcon active={a} /> },
  { to: '/report', label: 'Report', render: glyph('＋') },
  { to: '/account', label: 'Account', render: (a) => <PersonIcon active={a} /> },
];

export default function Nav() {
  return (
    <nav className="nav">
      {tabs.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.to === '/'}
          className={({ isActive }) => `nav__item${isActive ? ' nav__item--on' : ''}`}
        >
          {({ isActive }) => (
            <>
              {isActive && (
                <motion.span
                  layoutId="navPill"
                  className="nav__pill"
                  transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                />
              )}
              <span className="nav__item-content">
                <span className="nav__icon">{t.render(isActive)}</span>
                {t.label}
              </span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
