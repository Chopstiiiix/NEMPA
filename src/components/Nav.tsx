import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import { BellIcon, PersonIcon } from './icons';
import { useRole } from '../lib/useRole';

interface Tab { to: string; label: string; render: (active: boolean) => ReactNode }

const glyph = (g: string) => () => <span className="nav__item-icon">{g}</span>;

/**
 * Three tabs for everyone; staff get a fourth.
 *
 * Investigation proper still lives in Gecko Intel — reporter contact details,
 * SOS trails and the map are all there. Review here exists because a missing
 * person filed at 2am shouldn't wait for an operator to reach a laptop. Both
 * surfaces call the same `review-action` function, so they cannot diverge.
 */
const tabs: Tab[] = [
  { to: '/', label: 'Alerts', render: (a) => <BellIcon active={a} /> },
  { to: '/report', label: 'Report', render: glyph('＋') },
  { to: '/account', label: 'Account', render: (a) => <PersonIcon active={a} /> },
];

const reviewTab: Tab = { to: '/review', label: 'Review', render: glyph('◈') };

export default function Nav() {
  const { isStaff } = useRole();
  // Insert before Account so Account stays the rightmost, habitual tab.
  const visible = isStaff
    ? [...tabs.slice(0, 2), reviewTab, tabs[2]]
    : tabs;

  return (
    <nav className="nav">
      {visible.map((t) => (
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
