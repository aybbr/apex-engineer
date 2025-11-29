import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Activity, AlertTriangle, CheckCircle } from 'lucide-react';

const mockData = Array.from({ length: 50 }, (_, i) => ({
  time: i,
  speed: Math.sin(i * 0.2) * 50 + 150 + (Math.random() * 10),
  throttle: i > 10 && i < 30 ? 100 : 0,
  brake: i > 30 && i < 40 ? 80 : 0,
}));

export const TelemetryDashboard: React.FC = () => {
  return (
    <div className="p-6 h-full overflow-y-auto">
      <div className="mb-6 flex justify-between items-end">
        <div>
             <h2 className="text-3xl font-display font-bold italic text-white">TELEMETRY <span className="text-emerald-500">ANALYSIS</span></h2>
             <p className="text-zinc-400">Post-session data review. (Simulated Data)</p>
        </div>
        <button className="bg-emerald-600/20 text-emerald-400 border border-emerald-600/50 px-4 py-2 rounded text-sm font-bold uppercase tracking-wider hover:bg-emerald-600/30 transition">
            Import MoTeC Log
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="bg-racing-panel border border-zinc-800 p-5 rounded-xl">
            <div className="flex items-center gap-3 mb-2">
                <Activity className="text-racing-red" size={20} />
                <h3 className="font-bold text-zinc-300">Consistency Score</h3>
            </div>
            <p className="text-4xl font-display font-bold text-white">87<span className="text-lg text-zinc-500 font-sans">/100</span></p>
            <p className="text-xs text-zinc-500 mt-2">Based on last 5 laps at Spa-Francorchamps</p>
        </div>
        
        <div className="bg-racing-panel border border-zinc-800 p-5 rounded-xl">
            <div className="flex items-center gap-3 mb-2">
                <AlertTriangle className="text-yellow-500" size={20} />
                <h3 className="font-bold text-zinc-300">Improvement Area</h3>
            </div>
            <p className="text-lg font-bold text-white">Turn 1 (La Source)</p>
            <p className="text-xs text-yellow-500/80 mt-1">Braking 15m too early compared to optimal.</p>
        </div>

        <div className="bg-racing-panel border border-zinc-800 p-5 rounded-xl">
            <div className="flex items-center gap-3 mb-2">
                <CheckCircle className="text-blue-500" size={20} />
                <h3 className="font-bold text-zinc-300">Setup Stability</h3>
            </div>
            <p className="text-lg font-bold text-white">Oversteer detected</p>
            <p className="text-xs text-zinc-500 mt-1">Exit of T12. Consider increasing Rear TC +1.</p>
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-xl">
        <h3 className="text-zinc-400 font-bold mb-4 text-sm uppercase tracking-wider">Speed Trace vs Throttle</h3>
        <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={mockData}>
                    <defs>
                        <linearGradient id="colorSpeed" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorThrottle" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                    <XAxis dataKey="time" stroke="#666" />
                    <YAxis stroke="#666" />
                    <Tooltip 
                        contentStyle={{ backgroundColor: '#18181b', borderColor: '#333', color: '#fff' }}
                    />
                    <Area type="monotone" dataKey="speed" stroke="#ef4444" fillOpacity={1} fill="url(#colorSpeed)" strokeWidth={2} />
                    <Area type="monotone" dataKey="throttle" stroke="#10b981" fillOpacity={1} fill="url(#colorThrottle)" strokeWidth={2} />
                </AreaChart>
            </ResponsiveContainer>
        </div>
      </div>
      
      <div className="mt-6 p-4 bg-blue-900/20 border border-blue-900/50 rounded-lg">
        <p className="text-sm text-blue-200">
            <strong>Pro Tip:</strong> To get real-time analysis of this data while driving, switch to the 
            <span className="font-bold text-white mx-1">Live Coach</span> 
            tab and share your screen. The AI will watch your HUD telemetry.
        </p>
      </div>

    </div>
  );
};
