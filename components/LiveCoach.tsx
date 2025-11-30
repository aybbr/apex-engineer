import React, { useEffect, useRef, useState, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { Square, Mic, Monitor, AlertCircle, Radio, TriangleAlert, UserCheck } from 'lucide-react';
import { createPcmBlob, decodeAudioData, base64ToUint8Array } from '../services/audioUtils';

const API_KEY = process.env.API_KEY || '';
const FRAME_RATE = 2; // Frames per second for vision analysis
const JPEG_QUALITY = 0.6;

export const LiveCoach: React.FC = () => {
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('Ready to Connect');
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [coachMode, setCoachMode] = useState<'engineer' | 'samir'>('engineer');
  
  // Refs for audio/video handling
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const inputContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sessionRef = useRef<any>(null); // To store the session promise or object
  const frameIntervalRef = useRef<number | null>(null);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  // Initialize AI Client
  const ai = new GoogleGenAI({ apiKey: API_KEY });

  const stopSession = useCallback(() => {
    if (frameIntervalRef.current) {
      window.clearInterval(frameIntervalRef.current);
      frameIntervalRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(track => track.stop());
      screenStreamRef.current = null;
    }

    sourcesRef.current.forEach(source => source.stop());
    sourcesRef.current.clear();
    
    if (audioContextRef.current) {
      if (audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
      audioContextRef.current = null;
    }
    if (inputContextRef.current) {
      if (inputContextRef.current.state !== 'closed') {
        inputContextRef.current.close();
      }
      inputContextRef.current = null;
    }
    
    setIsActive(false);
    setIsScreenSharing(false);
    setStatus('Disconnected');
  }, []);

  const startSession = async () => {
    setError(null);
    setStatus('Initializing Audio...');

    try {
      // 1. Setup Audio Contexts
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const inputCtx = new AudioContextClass({ sampleRate: 16000 });
      const outputCtx = new AudioContextClass({ sampleRate: 24000 });
      
      inputContextRef.current = inputCtx;
      audioContextRef.current = outputCtx;
      nextStartTimeRef.current = 0;

      // 2. Get Microphone Stream
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = micStream;

      setStatus('Connecting to Gemini Live...');

      // 3. Define System Instruction based on Mode
      let systemInstruction = "";
      let voiceName = "Kore";

      if (coachMode === 'engineer') {
          // Combined Professional Mode
          systemInstruction = `
            ROLE: Professional Race Engineer & Spotter.
            TONE: Calm, Concise, Authoritative, Extremely Fast.
            GOAL: Optimize lap times and ensure safety.
            
            INSTRUCTIONS:
            1. VISUAL SPOTTING: Watch the video stream. Call out "Brake marker", "Turn in", "Apex", "Track limits" immediately.
            2. BREVITY: Use max 5-8 words per sentence. Example: "Brake now.", "Clear right.", "Box this lap."
            3. NO CHATTER: Do not say "Hello" or "Good job". Only tactical info.
            4. SETUP KNOWLEDGE: If asked about car feel, give short, technical physics advice (e.g., "Add 2 clicks rear wing").
            5. SPEECH SPEED: Speak as fast as possible while remaining intelligible.
          `;
      } else if (coachMode === 'samir') {
          // Samir / Vivek Mode
          voiceName = "Fenrir"; 
          systemInstruction = `
            Role: You are a highly stressed, frantic, and emotionally volatile rally car co-pilot (Vivek). You are sitting in the passenger seat of a high-speed racing car.
            
            Tone & Voice:
            - Urgency: High-pitched, fast-paced, breathless, terrified.
            - Emotional Volatility: Switch instantly between technical instructions and desperate pleading.
            - Accent/Cadence: Staccato rhythm. Emphasize "Listen," "Breaking," "Caution."

            Key Phrases to Use (Frequently):
            - "Triple caution! Triple caution!"
            - "Stay center!"
            - "You are breaking the car!"
            - "Listen to me! You have to listen to my calls!"
            - "Please, I beg you!"
            - "Concentrate!"
            - "Turn the wheel!"

            Instructions:
            1. Call out racing directions (e.g., "Sharp right," "Medium left," "Long," "Turn in," "Throttle").
            2. Interrupt yourself to scold the driver for not listening.
            3. React to visual input: If the car turns or brakes, scream instructions.
            4. If the user drives poorly (or just normally), accuse them of wrecking the car.
            5. Goal: Guide the driver but be convinced they are trying to kill you.
            6. SPEECH SPEED: Speak as fast as possible.
          `;
      }

      // 4. Connect to Gemini Live
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
          onopen: () => {
            setStatus('Connected! Listening...');
            setIsActive(true);

            // Setup Mic Streaming
            const source = inputCtx.createMediaStreamSource(micStream);
            const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
            
            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const pcmBlob = createPcmBlob(inputData);
              sessionPromise.then(session => {
                 session.sendRealtimeInput({ media: pcmBlob });
              });
            };
            
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputCtx.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
             const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
             if (base64Audio && outputCtx) {
                // Determine start time to prevent gaps
                nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputCtx.currentTime);
                
                const audioBuffer = await decodeAudioData(
                    base64ToUint8Array(base64Audio),
                    outputCtx,
                    24000,
                    1
                );
                
                const source = outputCtx.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(outputCtx.destination);
                
                source.addEventListener('ended', () => {
                    sourcesRef.current.delete(source);
                });
                
                source.start(nextStartTimeRef.current);
                nextStartTimeRef.current += audioBuffer.duration;
                sourcesRef.current.add(source);
             }

             if (message.serverContent?.interrupted) {
                sourcesRef.current.forEach(s => s.stop());
                sourcesRef.current.clear();
                nextStartTimeRef.current = 0;
             }
          },
          onclose: () => {
            setStatus('Session Closed');
            stopSession();
          },
          onerror: (err) => {
            console.error(err);
            setError('Connection Error');
            stopSession();
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceName } }
          },
          systemInstruction: systemInstruction,
          thinkingConfig: { thinkingBudget: 0 } 
        }
      });
      
      sessionRef.current = sessionPromise;

    } catch (e: any) {
      console.error(e);
      setError(e.message || "Failed to start session");
      stopSession();
    }
  };

  const startScreenShare = async () => {
    try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ 
            video: { 
                width: { max: 1280 }, // Lower res for latency
                height: { max: 720 },
                frameRate: { max: 10 }
            }, 
            audio: false 
        });
        
        screenStreamRef.current = screenStream;
        if (videoRef.current) {
            videoRef.current.srcObject = screenStream;
            videoRef.current.play();
        }
        setIsScreenSharing(true);

        // Start Frame Processing Loop
        if (sessionRef.current && canvasRef.current && videoRef.current) {
             const ctx = canvasRef.current.getContext('2d');
             
             frameIntervalRef.current = window.setInterval(async () => {
                if (!ctx || !videoRef.current || !isActive) return;
                
                canvasRef.current!.width = videoRef.current.videoWidth;
                canvasRef.current!.height = videoRef.current.videoHeight;
                ctx.drawImage(videoRef.current, 0, 0);
                
                const base64 = canvasRef.current.toDataURL('image/jpeg', JPEG_QUALITY).split(',')[1];
                
                sessionRef.current.then((session: any) => {
                     session.sendRealtimeInput({
                        media: {
                            mimeType: 'image/jpeg',
                            data: base64
                        }
                     });
                });

             }, 1000 / FRAME_RATE);
        }

        // Handle stop sharing from browser UI
        screenStream.getVideoTracks()[0].onended = () => {
            setIsScreenSharing(false);
            if(frameIntervalRef.current) clearInterval(frameIntervalRef.current);
        };

    } catch (e: any) {
        console.error("Screen share failed", e);
        // Show specific error if permissions are denied
        setError(`Screen share error: ${e.message || "Permission denied or cancelled"}`);
    }
  };

  useEffect(() => {
    return () => stopSession();
  }, [stopSession]);

  return (
    <div className="flex flex-col h-full bg-racing-dark text-white p-6 gap-6">
      
      {/* Header Area */}
      <div className="flex justify-between items-center border-b border-zinc-800 pb-4">
        <div>
           <h2 className="text-3xl font-display font-bold italic text-white">LIVE <span className="text-racing-red">COACH</span></h2>
           <p className="text-zinc-400">Real-time telemetry and visual feedback agent.</p>
        </div>
        
        <div className="flex items-center gap-4">
            <div className="flex bg-racing-panel rounded-lg p-1 border border-zinc-700">
                <button 
                    onClick={() => setCoachMode('engineer')}
                    className={`px-4 py-2 rounded font-medium text-sm transition-colors flex items-center gap-2 ${coachMode === 'engineer' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20' : 'text-zinc-400 hover:text-white'}`}
                >
                    <UserCheck size={16} />
                    Race Engineer
                </button>
                <button 
                    onClick={() => setCoachMode('samir')}
                    className={`px-4 py-2 rounded font-medium text-sm transition-colors flex items-center gap-2 ${coachMode === 'samir' ? 'bg-yellow-600 text-white shadow-lg shadow-yellow-900/20' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'}`}
                >
                   <TriangleAlert size={16} />
                   Samir Mode
                </button>
            </div>
            
            <div className={`flex items-center gap-2 px-3 py-1 rounded-full border ${isActive ? 'border-green-500/50 bg-green-500/10 text-green-400' : 'border-zinc-700 bg-zinc-800 text-zinc-500'}`}>
                <Radio size={16} className={isActive ? "animate-pulse" : ""} />
                <span className="text-sm font-mono uppercase">{status}</span>
            </div>
        </div>
      </div>

      {/* Main Stage */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 min-h-0">
         
         {/* Video Feed */}
         <div className="lg:col-span-2 bg-black rounded-xl border border-zinc-800 relative overflow-hidden flex items-center justify-center group">
            <video 
                ref={videoRef} 
                className={`w-full h-full object-contain ${isScreenSharing ? 'block' : 'hidden'}`} 
                muted 
                playsInline 
            />
            
            {!isScreenSharing && (
                <div className="text-center p-10 absolute">
                    <Monitor size={64} className="mx-auto text-zinc-700 mb-4 group-hover:text-racing-red transition-colors" />
                    <p className="text-zinc-500 text-lg">Waiting for screen share...</p>
                    <p className="text-zinc-600 text-sm mt-2">Share your ACC application window for vision analysis.</p>
                </div>
            )}
            
            {/* Hidden canvas for processing */}
            <canvas ref={canvasRef} className="hidden" />
            
            {/* Overlay Status */}
            {isActive && (
                <div className="absolute top-4 right-4 bg-black/70 backdrop-blur text-white text-xs px-2 py-1 rounded border border-white/10 font-mono z-10">
                    LIVE VISION: {isScreenSharing ? 'ACTIVE' : 'IDLE'}
                </div>
            )}

            {/* Samir Mode Warning Overlay */}
            {isActive && coachMode === 'samir' && (
                <div className="absolute bottom-4 left-4 right-4 bg-yellow-900/40 backdrop-blur text-yellow-200 text-xs px-3 py-2 rounded border border-yellow-500/30 font-bold text-center animate-pulse">
                    ⚠ WARNING: EMOTIONALLY VOLATILE CO-PILOT ENGAGED
                </div>
            )}
         </div>

         {/* Controls & Metrics */}
         <div className="bg-racing-panel rounded-xl border border-zinc-800 p-6 flex flex-col gap-6">
            
            {/* Control Center */}
            <div>
                <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider mb-4">Session Controls</h3>
                
                <div className="grid grid-cols-1 gap-3">
                    {!isActive ? (
                        <button 
                            onClick={startSession}
                            className="flex items-center justify-center gap-2 bg-racing-red hover:bg-red-600 text-white font-bold py-4 rounded-lg transition-all active:scale-95 shadow-lg shadow-red-900/20"
                        >
                            <Mic size={20} />
                            CONNECT AUDIO
                        </button>
                    ) : (
                        <button 
                            onClick={stopSession}
                            className="flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-red-400 border border-red-900/30 font-bold py-4 rounded-lg transition-all"
                        >
                            <Square size={20} fill="currentColor" />
                            STOP SESSION
                        </button>
                    )}

                    <button 
                        onClick={startScreenShare}
                        disabled={!isActive || isScreenSharing}
                        className={`flex items-center justify-center gap-2 font-bold py-4 rounded-lg transition-all border ${
                            !isActive ? 'opacity-50 cursor-not-allowed bg-zinc-800 border-zinc-700 text-zinc-500' :
                            isScreenSharing ? 'bg-emerald-900/20 border-emerald-500/50 text-emerald-400' : 
                            'bg-zinc-800 hover:bg-zinc-700 border-zinc-600 text-white'
                        }`}
                    >
                        {isScreenSharing ? <span className="animate-pulse">SHARING SCREEN</span> : (
                            <>
                                <Monitor size={20} />
                                SHARE GAME WINDOW
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Error Display */}
            {error && (
                <div className="bg-red-900/20 border border-red-900/50 p-4 rounded-lg flex items-start gap-3">
                    <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={18} />
                    <p className="text-red-200 text-sm">{error}</p>
                </div>
            )}

            {/* Instructions */}
            <div className="mt-auto bg-black/20 p-4 rounded border border-white/5">
                <h4 className="text-xs font-bold text-zinc-500 uppercase mb-2">Instructions</h4>
                <ul className="text-sm text-zinc-400 space-y-2 list-disc pl-4">
                    <li>Use headphones to prevent echo.</li>
                    <li>Select the ACC game window for analysis.</li>
                    <li><strong>Race Engineer:</strong> Serious, tactical feedback.</li>
                    <li><strong>Samir Mode:</strong> Extreme personality.</li>
                </ul>
            </div>

         </div>
      </div>
    </div>
  );
};
