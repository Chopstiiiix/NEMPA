import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useRole } from '../lib/useRole';
import { BellIcon, PersonIcon } from './icons';

interface Tab { to: string; label: string; render: (active: boolean) => ReactNode; key?: string }

const glyph = (g: string) => () => <span className="nav__item-icon">{g}</span>;

const baseTabs: Tab[] = [
  { to: '/', label: 'Alerts', render: (a) => <BellIcon active={a} /> },
  { to: '/report', label: 'Report', render: glyph('＋') },
  { to: '/account', label: 'Account', render: (a) => <PersonIcon active={a} /> },
];

const reviewTab: Tab = { to: '/moderate', label: 'Review', render: glyph('✓'), key: 'review' };

export default function Nav() {
  const { isStaff } = useRole();
  const items: Tab[] = isStaff
    ? [baseTabs[0], baseTabs[1], reviewTab, baseTabs[2]]
    : baseTabs;

  return (
    <nav className="nav">
      {items.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.to === '/'}
          className={({ isActive }) =>
            `nav__item${t.key === 'review' ? ' nav__item--review' : ''}${isActive ? ' nav__item--on' : ''}`
          }
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
