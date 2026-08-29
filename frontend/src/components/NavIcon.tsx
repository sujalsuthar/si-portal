import { NavIconId } from '@/lib/navConfig';

const props = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true as const,
};

export function NavIcon({ id }: { id: NavIconId }) {
  switch (id) {
    case 'home':
      return (
        <svg {...props}>
          <path d="M3 10.5 12 3l9 7.5" />
          <path d="M5 10v10h14V10" />
        </svg>
      );
    case 'feed':
      return (
        <svg {...props}>
          <path d="M4 6h16M4 12h16M4 18h10" />
        </svg>
      );
    case 'calendar':
      return (
        <svg {...props}>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 10h18M8 3v4M16 3v4" />
        </svg>
      );
    case 'sessions':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      );
    case 'tasks':
      return (
        <svg {...props}>
          <path d="M9 6h11M9 12h11M9 18h11M5 6h.01M5 12h.01M5 18h.01" />
        </svg>
      );
    case 'exams':
      return (
        <svg {...props}>
          <path d="M8 3h8v4H8zM6 7h12v14H6z" />
          <path d="M9 12h6M9 16h4" />
        </svg>
      );
    case 'library':
      return (
        <svg {...props}>
          <path d="M4 4h6v16H4zM14 4h6v16h-6z" />
        </svg>
      );
    case 'people':
    case 'students':
    case 'team':
      return (
        <svg {...props}>
          <circle cx="9" cy="8" r="3" />
          <circle cx="17" cy="9" r="2.5" />
          <path d="M3 19c0-3 2.5-5 6-5s6 2 6 5M14 19c.5-2 2-3.5 4.5-3.5" />
        </svg>
      );
    case 'parents':
      return (
        <svg {...props}>
          <circle cx="8" cy="9" r="3" />
          <circle cx="16" cy="9" r="3" />
          <path d="M2 20c0-3 2.5-5 6-5M22 20c0-3-2.5-5-6-5M10 20c0-2 1-3.5 2-3.5s2 1.5 2 3.5" />
        </svg>
      );
    case 'batches':
      return (
        <svg {...props}>
          <path d="M4 7h16v12H4zM8 7V5h8v2" />
        </svg>
      );
    case 'courses':
      return (
        <svg {...props}>
          <path d="M4 5h16v14H4zM8 9h8M8 13h6" />
        </svg>
      );
    case 'interns':
      return (
        <svg {...props}>
          <path d="M12 3v6M8 7h8" />
          <circle cx="12" cy="15" r="5" />
        </svg>
      );
    case 'projects':
      return (
        <svg {...props}>
          <path d="M4 7h6l2 3h8v9H4z" />
        </svg>
      );
    case 'fees':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v10M9 10h4.5a2 2 0 010 4H9" />
        </svg>
      );
    case 'certificates':
      return (
        <svg {...props}>
          <path d="M7 3h10v12H7zM10 15l2 5 2-5" />
        </svg>
      );
    case 'reports':
      return (
        <svg {...props}>
          <path d="M4 19V5M4 19h16M8 15v-4M12 15V8M16 15v-6" />
        </svg>
      );
    case 'action':
      return (
        <svg {...props}>
          <path d="M12 3l2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z" />
        </svg>
      );
    case 'settings':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 3v2M12 19v2M4.9 6.5l1.4 1.4M17.7 16.1l1.4 1.4M3 12h2M19 12h2M4.9 17.5l1.4-1.4M17.7 7.9l1.4-1.4" />
        </svg>
      );
    case 'backup':
      return (
        <svg {...props}>
          <path d="M12 4v10M8 10l4 4 4-4M5 18h14" />
        </svg>
      );
    case 'account':
      return (
        <svg {...props}>
          <circle cx="12" cy="8" r="3.5" />
          <path d="M5 20c1.5-4 4-6 7-6s5.5 2 7 6" />
        </svg>
      );
    case 'performance':
      return (
        <svg {...props}>
          <path d="M4 18V6M4 18h16M8 14l3-4 3 2 4-6" />
        </svg>
      );
    case 'profile':
      return (
        <svg {...props}>
          <circle cx="12" cy="8" r="3.5" />
          <path d="M5 20c1.5-4 4-6 7-6s5.5 2 7 6" />
        </svg>
      );
    default:
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="8" />
        </svg>
      );
  }
}
