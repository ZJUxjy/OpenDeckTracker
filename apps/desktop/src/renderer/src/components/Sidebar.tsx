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
    <aside className="w-64 bg-bg border-r border-border flex flex-col h-full text-text">
      <div className="p-6 flex items-center space-x-3 text-accent">
        <div className="w-8 h-8 rounded-lg bg-accent-dim flex items-center justify-center border border-accent/20">
          <Crown size={20} className="text-accent" />
        </div>
        <span className="text-xl font-bold tracking-wide">OpenDeckTracker</span>
      </div>

      <nav className="flex-1 px-4 space-y-2 mt-4 overflow-y-auto">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => {
              void navigate(`/${item.id}`);
            }}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-md transition-all duration-200 ${
              isActive(item.id)
                ? 'bg-bg-3 text-text shadow-[inset_4px_0_0_0_var(--accent)]'
                : 'hover:bg-bg-2 hover:text-text'
            }`}
          >
            <item.icon
              size={18}
              className={isActive(item.id) ? 'text-accent' : 'text-text-mute'}
            />
            <span className="font-medium text-sm">{t(item.labelKey)}</span>
          </button>
        ))}
      </nav>

      <div className="p-4 border-t border-border">
        <button
          onClick={() => {
            void navigate('/settings');
          }}
          className={`w-full flex items-center space-x-3 px-4 py-3 rounded-md transition-colors ${
            isActive('settings')
              ? 'bg-bg-3 text-text shadow-[inset_4px_0_0_0_var(--accent)]'
              : 'text-text-dim hover:text-text hover:bg-bg-2'
          }`}
        >
          <Settings size={18} className={isActive('settings') ? 'text-accent' : ''} />
          <span className="font-medium text-sm">{t('sidebar.settings')}</span>
        </button>
      </div>
    </aside>
  );
}
