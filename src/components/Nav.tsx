import { NavLink } from 'react-router-dom';
import { useRole } from '../lib/useRole';

interface Tab { to: string; label: string; icon: string; key?: string }

const baseTabs: Tab[] = [
  { to: '/', label: 'Alerts', icon: '◎' },
  { to: '/report', label: 'Report', icon: '＋' },
  { to: '/account', label: 'Account', icon: '☷' },
];

const reviewTab: Tab = { to: '/moderate', label: 'Review', icon: '✓', key: 'review' };

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
          <span className="nav__item-icon">{t.icon}</span>
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}
