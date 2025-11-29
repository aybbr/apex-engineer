import React from 'react';
import { LayoutDashboard, Video, Wrench, BarChart2, Settings } from 'lucide-react';
import { AppView } from '../types';

interface NavigationProps {
  currentView: AppView;
  onChangeView: (view: AppView) => void;
}

export const Navigation: React.FC<NavigationProps> = ({ currentView, onChangeView }) => {
  const navItems = [
    { id: AppView.DASHBOARD, label: 'Dashboard', icon: LayoutDashboard },
    { id: AppView.LIVE_COACH, label: 'Live Coach', icon: Video },
    { id: AppView.SETUP_WIZARD, label: 'Setup Wizard', icon: Wrench },
    { id: AppView.TELEMETRY, label: 'Telemetry', icon: BarChart2 },
  ];

  return (
    <nav className="w-20 lg:w-64 bg-racing-carbon border-r border-zinc-800 flex flex-col h-full shrink-0">
      <div className="p-6 flex items-center gap-3">
        <div className="w-8 h-8 bg-racing-red rounded transform skew-x-[-12deg]"></div>
        <h1 className="hidden lg:block font-display font-bold italic text-xl tracking-tighter">
          APEX<span className="text-racing-red">ENGINEER</span>
        </h1>
      </div>

      <div className="flex-1 px-4 py-6 space-y-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = currentView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onChangeView(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-all duration-200 group ${
                active 
                  ? 'bg-racing-red text-white shadow-lg shadow-red-900/20' 
                  : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
              }`}
            >
              <Icon size={20} className={active ? 'text-white' : 'group-hover:text-white'} />
              <span className="hidden lg:block font-medium text-sm">{item.label}</span>
              {active && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-white hidden lg:block" />}
            </button>
          );
        })}
      </div>

      <div className="p-4 border-t border-zinc-800">
        <button className="w-full flex items-center gap-3 px-3 py-3 rounded-lg text-zinc-500 hover:text-white transition-colors">
            <Settings size={20} />
            <span className="hidden lg:block font-medium text-sm">Settings</span>
        </button>
        <div className="mt-4 text-[10px] text-zinc-700 text-center hidden lg:block">
            v1.0.0 • ACC 1.9 Compatible
        </div>
      </div>
    </nav>
  );
};
