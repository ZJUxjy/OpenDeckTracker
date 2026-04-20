import { Bell, ChevronDown, Ghost, LayoutTemplate, Monitor, User } from 'lucide-react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { Sidebar } from './components/Sidebar';
import { useHearthMirrorStatus } from './hooks/use-hearthmirror-status';

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const isOverlay = location.pathname === '/overlay';
  const { isAlive, battleTag } = useHearthMirrorStatus();

  return (
    <div className="flex h-screen bg-[#0E0E14] text-slate-300 font-sans overflow-hidden">
      {!isOverlay && <Sidebar />}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 bg-[#14141A] border-b border-[#2A2A35] flex items-center justify-between px-6 shrink-0 z-50 shadow-md relative">
          <div className="flex items-center space-x-4">
            <span className="text-slate-400 text-sm font-medium uppercase tracking-wider flex items-center">
              <Monitor size={16} className={`mr-2 ${isAlive ? (battleTag ? 'text-emerald-500' : 'text-amber-500') : 'text-zinc-500'}`} />
              {isAlive
                ? (battleTag ? 'Game Running' : 'Not Logged In')
                : 'Game Not Running'}
            </span>
            <div className="h-6 w-px bg-[#2A2A35] mx-2" />

            <div className="flex bg-[#0E0E14] rounded-md p-1 border border-[#2A2A35]">
              <button
                onClick={() => {
                  void navigate('/tracker');
                }}
                className={`flex items-center space-x-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  !isOverlay
                    ? 'bg-[#2A2A35] text-white shadow'
                    : 'text-slate-500 hover:text-white'
                }`}
              >
                <LayoutTemplate size={14} />
                <span>Desktop App</span>
              </button>
              <button
                onClick={() => {
                  void navigate('/overlay');
                }}
                className={`flex items-center space-x-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  isOverlay
                    ? 'bg-[#2A2A35] text-orange-400 shadow'
                    : 'text-slate-500 hover:text-white'
                }`}
              >
                <Ghost size={14} />
                <span>In-Game Overlay</span>
              </button>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <button className="relative text-slate-400 hover:text-white transition-colors">
              <Bell size={20} />
              <span className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full border border-[#14141A]" />
            </button>
            <div className="h-6 w-px bg-[#2A2A35] mx-2" />
            <button className="flex items-center space-x-2 hover:bg-[#1C1C24] px-3 py-1.5 rounded-md transition-colors">
              <div className="w-7 h-7 bg-indigo-500 rounded flex items-center justify-center text-white font-bold text-sm">
                <User size={16} />
              </div>
              <span className="text-sm font-medium text-white">{battleTag?.fullBattleTag ?? 'PlayerOne'}</span>
              <ChevronDown size={14} className="text-slate-500" />
            </button>
          </div>
        </header>

        <main className="flex-1 flex overflow-hidden relative">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
