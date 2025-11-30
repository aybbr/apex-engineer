import React, { useState } from 'react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, ReferenceLine, Legend 
} from 'recharts';
import { Activity, AlertTriangle, CheckCircle, ArrowRight, TrendingDown, Clock, MousePointer2 } from 'lucide-react';

// --- Types & Mock Data Generation ---

interface TelemetryPoint {
  distance: number;
  refSpeed: number;
  userSpeed: number;
  refThrottle: number;
  userThrottle: number;
  refBrake: number;
  userBrake: number;
  delta: number; // Time difference
  segment: string;
}

// Generate realistic looking telemetry for a track section (e.g., Spa: La Source to Raidillon)
const generateLapData = (): TelemetryPoint[] => {
  const points: TelemetryPoint[] = [];
  let currentDelta = 0;
  
  for (let i = 0; i <= 100; i++) {
    const dist = i * 10; // 1000m segment
    let segmentName = '';
    
    // Physics simulation variables
    let refSpeed = 0;
    let userSpeed = 0;
    let refThrot = 0;
    let userThrot = 0;
    let refBrake = 0;
    let userBrake = 0;

    // Track Profile: 0-200m (Straight), 200-300m (Hard Brake T1), 300-400m (T1 Exit), 400-800m (Kemmel Straight), 800-1000m (Eau Rouge entry)
    
    if (i < 20) { 
      // Main Straight
      segmentName = 'Start Finish';
      refSpeed = 200 + (i * 4);
      userSpeed = 200 + (i * 3.8); // User slightly slower drag
      refThrot = 100; userThrot = 100;
    } else if (i < 30) {
      // Braking Zone (La Source)
      segmentName = 'La Source Entry';
      // User brakes earlier (i=20) vs Ref (i=22)
      refBrake = i > 22 ? 100 : 0;
      userBrake = i > 20 ? 90 : 0; // User trails less effectively
      refThrot = 0; userThrot = 0;
      refSpeed = 280 - ((i - 20) * 20);
      userSpeed = 276 - ((i - 20) * 22); // Overslowing
    } else if (i < 40) {
      // Apex & Exit
      segmentName = 'La Source Exit';
      refSpeed = 60 + ((i - 30) * 10);
      userSpeed = 55 + ((i - 30) * 8); // Slower exit
      refThrot = (i - 30) * 10; // Smooth application
      userThrot = (i - 30) * 8; // Hesitation
      refBrake = 0; userBrake = 0;
    } else if (i < 90) {
      // Acceleration down hill
      segmentName = 'Eau Rouge Run';
      refSpeed = 160 + ((i - 40) * 2);
      userSpeed = 135 + ((i - 40) * 2); // Carrying penalty from T1
      refThrot = 100; userThrot = 100;
    } else {
      // Compression
      segmentName = 'Eau Rouge Compression';
      refSpeed = 260 - ((i - 90) * 1); // Scrubbing speed
      userSpeed = 235 - ((i - 90) * 2); // Lifting
      refThrot = 100; userThrot = 80; // User lifts
    }

    // Accumulate Delta (Time lost)
    // Simple approximation: faster speed = lower delta accumulation
    const speedDiff = refSpeed - userSpeed;
    if (speedDiff > 0) currentDelta += 0.015; // Losing time
    if (speedDiff < 0) currentDelta -= 0.015; // Gaining time

    points.push({
      distance: dist,
      refSpeed: Math.max(0, refSpeed),
      userSpeed: Math.max(0, userSpeed),
      refThrottle: Math.max(0, Math.min(100, refThrot)),
      userThrottle: Math.max(0, Math.min(100, userThrot)),
      refBrake: Math.max(0, Math.min(100, refBrake)),
      userBrake: Math.max(0, Math.min(100, userBrake)),
      delta: parseFloat(currentDelta.toFixed(3)),
      segment: segmentName
    });
  }
  return points;
};

const data = generateLapData();

// --- Components ---

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-zinc-900 border border-zinc-700 p-3 rounded-lg shadow-xl text-xs">
        <p className="font-bold text-zinc-400 mb-2">{`${label}m`}</p>
        {payload.map((p: any) => (
          <div key={p.name} className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
            <span className="text-zinc-300 w-24">{p.name}:</span>
            <span className="font-mono font-bold text-white">
              {p.value.toFixed(1)} {p.unit}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

export const TelemetryDashboard: React.FC = () => {
  const [activeLap, setActiveLap] = useState<'current' | 'ref'>('current');

  return (
    <div className="flex flex-col h-full bg-racing-dark overflow-hidden">
      
      {/* Header */}
      <div className="p-6 border-b border-zinc-800 bg-racing-panel shrink-0 flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-display font-bold italic text-white flex items-center gap-2">
            LAP <span className="text-emerald-500">ANALYSIS</span>
          </h2>
          <p className="text-xs text-zinc-400">Comparing: <span className="text-white font-bold">Best Lap (2:18.4)</span> vs <span className="text-red-400 font-bold">Lap 4 (2:19.8)</span></p>
        </div>
        <div className="flex gap-2">
            <div className="px-3 py-1 rounded bg-yellow-500/10 border border-yellow-500/20 text-yellow-500 text-xs font-bold flex items-center gap-2">
                <AlertTriangle size={14} />
                DELTA: +1.402s
            </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {/* Left Column: Stats & Laps */}
        <div className="lg:col-span-1 space-y-6">
            
            {/* Lap Selector */}
            <div className="bg-racing-panel border border-zinc-800 rounded-xl overflow-hidden">
                <div className="p-3 bg-zinc-900/50 border-b border-zinc-800 font-bold text-zinc-400 text-xs uppercase tracking-wider">
                    Session Laps
                </div>
                <div className="divide-y divide-zinc-800">
                    <div className="p-3 flex justify-between items-center bg-emerald-900/10 border-l-2 border-emerald-500">
                        <div>
                            <span className="text-xs text-emerald-500 font-bold block">REFERENCE (BEST)</span>
                            <span className="text-white font-mono text-sm">2:18.452</span>
                        </div>
                        <CheckCircle size={16} className="text-emerald-500" />
                    </div>
                    <div className="p-3 flex justify-between items-center bg-red-900/10 border-l-2 border-red-500">
                         <div>
                            <span className="text-xs text-red-400 font-bold block">LAP 4 (CURRENT)</span>
                            <span className="text-white font-mono text-sm">2:19.854</span>
                        </div>
                        <span className="text-xs font-mono text-red-400">+1.40</span>
                    </div>
                    {[5, 6, 7].map(lap => (
                         <div key={lap} className="p-3 flex justify-between items-center opacity-50 hover:opacity-100 transition-opacity cursor-pointer">
                            <span className="text-zinc-400 text-sm">Lap {lap}</span>
                            <span className="text-zinc-500 font-mono text-sm">2:20.112</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* AI Insight Card */}
            <div className="bg-gradient-to-br from-blue-900/20 to-zinc-900 border border-blue-500/30 rounded-xl p-4 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-3 opacity-10">
                    <MousePointer2 size={64} />
                </div>
                <h3 className="text-blue-400 font-bold text-sm mb-2 flex items-center gap-2">
                    <Activity size={16} /> AI COACH INSIGHT
                </h3>
                <p className="text-sm text-zinc-200 leading-relaxed mb-3">
                    You represent the <span className="text-red-400 font-bold">Red Line</span>. 
                </p>
                <ul className="text-xs space-y-2 text-zinc-300">
                    <li className="flex gap-2">
                        <TrendingDown className="text-red-500 shrink-0" size={14} />
                        <span><strong>Turn 1 Entry:</strong> You braked 15m earlier than the reference lap.</span>
                    </li>
                    <li className="flex gap-2">
                        <TrendingDown className="text-red-500 shrink-0" size={14} />
                        <span><strong>Exit:</strong> Delayed throttle application cost you 4km/h down the Kemmel Straight.</span>
                    </li>
                </ul>
                <button className="mt-4 w-full py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded transition-colors">
                    Ask Live Coach to Explain
                </button>
            </div>
        </div>

        {/* Right Column: Charts */}
        <div className="lg:col-span-3 grid grid-rows-3 gap-1 h-[600px] lg:h-auto">
            
            {/* Chart 1: Speed Trace */}
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-t-xl p-4 relative group">
                <div className="absolute top-2 left-4 text-xs font-bold text-zinc-500 uppercase z-10">Speed Trace (km/h)</div>
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data} syncId="telemetryId" margin={{ top: 20, right: 0, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                        <XAxis dataKey="distance" hide />
                        <YAxis stroke="#555" fontSize={10} domain={[0, 300]} tickCount={5} />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend verticalAlign="top" height={36} iconSize={8} wrapperStyle={{ fontSize: '10px', right: 10, top: 0 }} />
                        <Line type="monotone" dataKey="refSpeed" name="Ref Speed" stroke="#10b981" strokeWidth={2} dot={false} unit="km/h" animationDuration={1000} />
                        <Line type="monotone" dataKey="userSpeed" name="Your Speed" stroke="#ef4444" strokeWidth={2} dot={false} unit="km/h" animationDuration={1000} />
                    </LineChart>
                </ResponsiveContainer>
            </div>

            {/* Chart 2: Delta Time */}
            <div className="bg-zinc-900/50 border-x border-zinc-800 p-4 relative">
                <div className="absolute top-2 left-4 text-xs font-bold text-zinc-500 uppercase z-10">Time Delta (sec)</div>
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data} syncId="telemetryId" margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                        <XAxis dataKey="distance" hide />
                        <YAxis stroke="#555" fontSize={10} domain={['auto', 'auto']} tickCount={3} />
                        <Tooltip content={<CustomTooltip />} />
                        <ReferenceLine y={0} stroke="#666" />
                        <Area type="monotone" dataKey="delta" name="Time Loss" stroke="#eab308" fill="#eab308" fillOpacity={0.1} strokeWidth={2} unit="s" />
                    </AreaChart>
                </ResponsiveContainer>
            </div>

            {/* Chart 3: Inputs (Throttle/Brake) */}
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-b-xl p-4 relative">
                 <div className="absolute top-2 left-4 text-xs font-bold text-zinc-500 uppercase z-10">Driver Inputs (%)</div>
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data} syncId="telemetryId" margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                        <XAxis dataKey="distance" stroke="#555" fontSize={10} tickFormatter={(val) => `${val}m`} label={{ value: 'Distance (m)', position: 'insideBottom', offset: -5, fontSize: 10, fill: '#666' }} />
                        <YAxis stroke="#555" fontSize={10} domain={[0, 100]} tickCount={3} />
                        <Tooltip content={<CustomTooltip />} />
                        {/* Reference Inputs (Faded) */}
                        <Line type="step" dataKey="refThrottle" name="Ref Throttle" stroke="#10b981" strokeWidth={1} strokeOpacity={0.4} dot={false} unit="%" />
                        <Line type="step" dataKey="refBrake" name="Ref Brake" stroke="#f59e0b" strokeWidth={1} strokeOpacity={0.4} dot={false} unit="%" />
                        
                        {/* User Inputs (Bold) */}
                        <Line type="step" dataKey="userThrottle" name="Throttle" stroke="#10b981" strokeWidth={2} dot={false} unit="%" />
                        <Line type="step" dataKey="userBrake" name="Brake" stroke="#ef4444" strokeWidth={2} dot={false} unit="%" />
                    </LineChart>
                </ResponsiveContainer>
            </div>

        </div>

      </div>
    </div>
  );
};