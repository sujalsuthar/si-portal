import { NavLink } from 'react-router-dom';

const TABS = [
  { to: '/people/students', label: 'Students' },
  { to: '/people/parents', label: 'Parents' },
  { to: '/people/faculty', label: 'Team' },
];

export default function PeopleTabs() {
  return (
    <div className="tab-bar">
      {TABS.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          className={({ isActive }) => `tab-bar-item ${isActive ? 'tab-bar-item-active' : ''}`}
        >
          {t.label}
        </NavLink>
      ))}
    </div>
  );
}
