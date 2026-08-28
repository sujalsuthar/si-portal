import { NavLink } from 'react-router-dom';

const TABS = [
  { to: '/people/students', label: 'Students' },
  { to: '/people/parents', label: 'Parents' },
  { to: '/people/faculty', label: 'Team' },
];

export default function PeopleTabs() {
  return (
    <div className="mb-5 flex gap-1 border-b border-edge">
      {TABS.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          className={({ isActive }) =>
            `px-3.5 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              isActive ? 'border-brand-600 text-brand-ink' : 'border-transparent text-ink-muted hover:text-ink'
            }`
          }
        >
          {t.label}
        </NavLink>
      ))}
    </div>
  );
}
