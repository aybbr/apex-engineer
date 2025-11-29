import React, { useEffect, useRef, useState, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { Play, Square, Mic, MicOff, Monitor, AlertCircle, Radio } from 'lucide-react';
import { createPcmBlob, decodeAudioData, base64ToUint8Array, arrayBufferToBase64 } from '../services/audioUtils';

const API_KEY = process.env.API_KEY || '';
const FRAME_RATE = 2; // Frames per second for vision analysis
const JPEG_QUALITY = 0.6;

export const LiveCoach: React.FC = () => {
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('Ready to Connect');
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [coachMode, setCoachMode] = useState<'driving' | 'garage'>('driving');
  
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

    // Unfortunately we can't explicitly "close" the session object easily if it's just a promise, 
    // but stopping the streams effectively kills the interaction.
    // In a real implementation, we'd trigger a close on the session if supported.
    
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
      // Optimization: Using "Spotter" persona for driving to force short, bursty communication.
      const systemInstruction = coachMode === 'driving' 
        ? "ROLE: Professional Racing Spotter.\nSTYLE: Extremely concise, urgent, imperative.\nRULES:\n1. Max 5-10 words per response.\n2. NO pleasantries (hello, goodbye).\n3. Focus strictly on visual telemetry: Brake points, Apexes, Track Limits.\n4. If the car is stable, stay silent or say 'Clear'."
        : "ROLE: Chief Race Engineer.\nSTYLE: Clinical, direct, professional.\nRULES:\n1. Answers must be under 2 sentences.\n2. Use technical terms (Understeer, Rebound, PSI).\n3. Explain the 'Why' briefly.\n4. Analyze the setup screen visuals precisely.";

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
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }
          },
          systemInstruction: systemInstruction,
          // Optimization: Disable thinking budget to reduce latency for real-time coaching
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
                    onClick={() => setCoachMode('driving')}
                    className={`px-4 py-2 rounded font-medium text-sm transition-colors ${coachMode === 'driving' ? 'bg-racing-red text-white' : 'text-zinc-400 hover:text-white'}`}
                >
                    Driving Mode
                </button>
                <button 
                    onClick={() => setCoachMode('garage')}
                    className={`px-4 py-2 rounded font-medium text-sm transition-colors ${coachMode === 'garage' ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:text-white'}`}
                >
                    Garage Mode
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
            {isScreenSharing ? (
                <video 
                    ref={videoRef} 
                    className="w-full h-full object-contain" 
                    muted 
                    playsInline 
                />
            ) : (
                <div className="text-center p-10">
                    <Monitor size={64} className="mx-auto text-zinc-700 mb-4 group-hover:text-racing-red transition-colors" />
                    <p className="text-zinc-500 text-lg">Waiting for screen share...</p>
                    <p className="text-zinc-600 text-sm mt-2">Share your ACC application window for vision analysis.</p>
                </div>
            )}
            
            {/* Hidden canvas for processing */}
            <canvas ref={canvasRef} className="hidden" />
            
            {/* Overlay Status */}
            {isActive && (
                <div className="absolute top-4 right-4 bg-black/70 backdrop-blur text-white text-xs px-2 py-1 rounded border border-white/10 font-mono">
                    LIVE VISION: {isScreenSharing ? 'ACTIVE' : 'IDLE'}
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
                    <li>Select the ACC game window, not the whole screen, for better performance.</li>
                    <li>Switch to <strong>Garage Mode</strong> when adjusting setup.</li>
                    <li>Switch to <strong>Driving Mode</strong> when on track.</li>
                </ul>
            </div>

         </div>
      </div>
    </div>
  );
};