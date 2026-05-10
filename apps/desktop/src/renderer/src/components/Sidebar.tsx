import { AppWindow, BarChart2, BookOpen, Crown, Layers, Settings } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router';
import { useTranslation } from '../i18n';

const navItems = [
  { id: 'tracker', icon: AppWindow, labelKey: 'sidebar.deckTracker' },
  { id: 'decks', icon: Layers, labelKey: 'sidebar.decks' },
  { id: 'stats', icon: BarChart2, labelKey: 'sidebar.stats' },
  { id: 'collection', icon: BookOpen, labelKey: 'sidebar.collection' },
];

export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();

  const isActive = (id: string) => location.pathname === `/${id}`;

  return (
    <aside className="tahoe-sidebar w-64 flex flex-col h-full text-text">
      <div className="p-6 flex items-center space-x-3 text-accent">
        <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center shadow-[0_1px_3px_rgba(0,0,0,0.18)]">
          <Crown size={20} className="text-text-on-accent" />
        </div>
        <span className="text-xl font-bold tracking-wide">OpenDeckTracker</span>
      </div>

      <nav className="flex-1 px-3 space-y-1 mt-2 overflow-y-auto">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => {
              void navigate(`/${item.id}`);
            }}
            className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-md transition-all duration-200 ${
              isActive(item.id)
                ? 'bg-accent text-text-on-accent shadow-[0_1px_3px_rgba(0,0,0,0.18)]'
                : 'text-text-dim hover:bg-white/5 hover:text-text dark:hover:bg-white/5'
            }`}
          >
            <item.icon
              size={18}
              className={isActive(item.id) ? 'text-text-on-accent' : 'text-text-mute'}
            />
            <span className="font-medium text-sm">{t(item.labelKey)}</span>
          </button>
        ))}
      </nav>

      <div className="p-3 border-t border-border-separator">
        <button
          onClick={() => {
            void navigate('/settings');
          }}
          className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-md transition-colors ${
            isActive('settings')
              ? 'bg-accent text-text-on-accent shadow-[0_1px_3px_rgba(0,0,0,0.18)]'
              : 'text-text-dim hover:text-text hover:bg-white/5'
          }`}
        >
          <Settings
            size={18}
            className={isActive('settings') ? 'text-text-on-accent' : ''}
          />
          <span className="font-medium text-sm">{t('sidebar.settings')}</span>
        </button>
      </div>
    </aside>
  );
}
