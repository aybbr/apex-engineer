import React, { useState } from 'react';
import { Navigation } from './components/Navigation';
import { LiveCoach } from './components/LiveCoach';
import { SetupAssistant } from './components/SetupAssistant';
import { TelemetryDashboard } from './components/TelemetryDashboard';
import { AppView } from './types';
import { Trophy, Clock, Zap } from 'lucide-react';

const DashboardHome: React.FC<{ onViewChange: (v: AppView) => void }> = ({ onViewChange }) => (
  <div className="p-8 max-w-6xl mx-auto">
    <header className="mb-10">
      <h1 className="text-4xl font-display font-black italic text-white mb-2">WELCOME BACK, <span className="text-racing-red">DRIVER</span></h1>
      <p className="text-zinc-400">Your pit crew is ready. What's the plan for today's session?</p>
    </header>

    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <div 
        onClick={() => onViewChange(AppView.LIVE_COACH)}
        className="group cursor-pointer bg-gradient-to-br from-zinc-800 to-zinc-900 border border-zinc-700 hover:border-racing-red rounded-2xl p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-red-900/20"
      >
        <div className="w-12 h-12 bg-racing-red rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <Zap className="text-white" />
        </div>
        <h3 className="text-xl font-bold text-white mb-2">Live Coaching</h3>
        <p className="text-sm text-zinc-400">Real-time voice feedback using vision AI to spot braking points and racing lines.</p>
      </div>

      <div 
        onClick={() => onViewChange(AppView.SETUP_WIZARD)}
        className="group cursor-pointer bg-gradient-to-br from-zinc-800 to-zinc-900 border border-zinc-700 hover:border-blue-500 rounded-2xl p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-blue-900/20"
      >
        <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <Trophy className="text-white" />
        </div>
        <h3 className="text-xl font-bold text-white mb-2">Setup Engineer</h3>
        <p className="text-sm text-zinc-400">Fix understeer/oversteer issues and optimize your car configuration for specific tracks.</p>
      </div>

      <div 
        onClick={() => onViewChange(AppView.TELEMETRY)}
        className="group cursor-pointer bg-gradient-to-br from-zinc-800 to-zinc-900 border border-zinc-700 hover:border-emerald-500 rounded-2xl p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-emerald-900/20"
      >
        <div className="w-12 h-12 bg-emerald-600 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <Clock className="text-white" />
        </div>
        <h3 className="text-xl font-bold text-white mb-2">Telemetry Analysis</h3>
        <p className="text-sm text-zinc-400">Deep dive into your inputs. Review speed traces, brake pressure, and consistency.</p>
      </div>
    </div>

    <div className="mt-12">
        <h3 className="text-lg font-bold text-zinc-500 uppercase tracking-widest mb-4">Recent Sessions</h3>
        <div className="bg-racing-panel rounded-xl border border-zinc-800 overflow-hidden">
            <table className="w-full text-left">
                <thead className="bg-black/30 text-zinc-500 text-xs uppercase">
                    <tr>
                        <th className="p-4 font-medium">Track</th>
                        <th className="p-4 font-medium">Car</th>
                        <th className="p-4 font-medium">Best Lap</th>
                        <th className="p-4 font-medium text-right">Status</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800 text-sm">
                    <tr className="hover:bg-white/5 transition-colors">
                        <td className="p-4 text-white font-medium">Spa-Francorchamps</td>
                        <td className="p-4 text-zinc-400">Porsche 992 GT3 R</td>
                        <td className="p-4 text-white font-mono">2:18.452</td>
                        <td className="p-4 text-right"><span className="text-green-500 bg-green-500/10 px-2 py-1 rounded text-xs">Analyzed</span></td>
                    </tr>
                    <tr className="hover:bg-white/5 transition-colors">
                        <td className="p-4 text-white font-medium">Monza</td>
                        <td className="p-4 text-zinc-400">Ferrari 296 GT3</td>
                        <td className="p-4 text-white font-mono">1:47.102</td>
                        <td className="p-4 text-right"><span className="text-zinc-500 bg-zinc-800 px-2 py-1 rounded text-xs">Pending</span></td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>
  </div>
);

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<AppView>(AppView.DASHBOARD);

  return (
    <div className="flex h-screen bg-racing-dark text-white font-sans selection:bg-racing-red selection:text-white">
      <Navigation currentView={currentView} onChangeView={setCurrentView} />
      
      <main className="flex-1 overflow-hidden relative">
        {/* Background Texture Effect */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-zinc-800/20 via-transparent to-transparent pointer-events-none" />
        
        <div className="h-full relative z-10">
          {currentView === AppView.DASHBOARD && <DashboardHome onViewChange={setCurrentView} />}
          {currentView === AppView.LIVE_COACH && <LiveCoach />}
          {currentView === AppView.SETUP_WIZARD && <SetupAssistant />}
          {currentView === AppView.TELEMETRY && <TelemetryDashboard />}
        </div>
      </main>
    </div>
  );
};

export default App;
