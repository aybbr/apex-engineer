import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI, GenerateContentResponse, LiveServerMessage, Modality, Type, FunctionDeclaration } from '@google/genai';
import { Send, Upload, ImageIcon, Loader2, RefreshCw, Mic, Square, Monitor, Volume2, Video, FileJson, Download, Check } from 'lucide-react';
import { ChatMessage } from '../types';
import { createPcmBlob, decodeAudioData, base64ToUint8Array } from '../services/audioUtils';

const API_KEY = process.env.API_KEY || '';
const FRAME_RATE = 1; 
const JPEG_QUALITY = 0.7;

// Tool Definition for saving JSON
const saveSetupTool: FunctionDeclaration = {
  name: "save_setup_json",
  description: "Generates and saves the final Assetto Corsa Competizione car setup JSON file when the user is satisfied with the configuration.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      filename: {
        type: Type.STRING,
        description: "The filename for the setup, e.g., 'spa_dry_qualifying.json'. Must end in .json"
      },
      content: {
        type: Type.STRING,
        description: "The complete, valid JSON content for the car setup."
      }
    },
    required: ["filename", "content"]
  }
};

export const SetupAssistant: React.FC = () => {
  // Chat State
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'init',
      role: 'model',
      text: "Hello! I'm your ACC Setup Engineer. We can discuss your car's handling via voice or text. When we find a good configuration, just ask me to generate the setup file for you.",
      timestamp: new Date()
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  // Live Session State
  const [isLive, setIsLive] = useState(false);
  const [liveStatus, setLiveStatus] = useState('Ready');
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [currentTranscript, setCurrentTranscript] = useState('');

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Live API Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const inputContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sessionRef = useRef<Promise<any> | null>(null);
  const frameIntervalRef = useRef<number | null>(null);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  
  // Important: Refs for accumulating transcript/tool data to avoid stale closures in callbacks
  const transcriptBufferRef = useRef(''); 

  const ai = new GoogleGenAI({ apiKey: API_KEY });

  // --- Chat Functions ---

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, currentTranscript]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSendMessage = async () => {
    if ((!inputText.trim() && !selectedImage) || isLoading) return;

    const newMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: inputText,
      image: selectedImage || undefined,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, newMessage]);
    setInputText('');
    setSelectedImage(null);
    setIsLoading(true);

    try {
      const model = ai.models;
      const parts: any[] = [];
      
      if (newMessage.image) {
        const base64Data = newMessage.image.split(',')[1];
        parts.push({
            inlineData: {
                data: base64Data,
                mimeType: 'image/jpeg'
            }
        });
      }
      
      if (newMessage.text) {
        parts.push({ text: newMessage.text });
      } else if (newMessage.image) {
          parts.push({ text: "Analyze this Assetto Corsa Competizione setup screen. Explain the values visible and suggest improvements." });
      }

      const response: GenerateContentResponse = await model.generateContent({
        model: 'gemini-2.5-flash',
        contents: {
            role: 'user',
            parts: parts
        },
        config: {
          systemInstruction: "You are an expert Setup Engineer for Assetto Corsa Competizione (ACC). Analyze user inputs or screenshots of setup menus. Explain physics concepts (Dampers, Aero, Geometry, Electronics) simply. Suggest specific click changes for handling issues.",
        }
      });

      const responseText = response.text || "I couldn't generate a response.";

      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: responseText,
        timestamp: new Date()
      }]);

    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: "Error connecting to the API.",
        timestamp: new Date()
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  // --- Live Session Functions ---

  const stopLiveSession = useCallback(() => {
    if (frameIntervalRef.current) {
      window.clearInterval(frameIntervalRef.current);
      frameIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(t => t.stop());
      screenStreamRef.current = null;
    }
    sourcesRef.current.forEach(s => s.stop());
    sourcesRef.current.clear();
    
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
    }
    
    if (inputContextRef.current && inputContextRef.current.state !== 'closed') {
      inputContextRef.current.close();
    }
    
    setIsLive(false);
    setIsScreenSharing(false);
    setLiveStatus('Ready');
    
    // Save any pending transcript
    if (transcriptBufferRef.current) {
        setMessages(prev => [...prev, {
            id: Date.now().toString(),
            role: 'model',
            text: `🔊 ${transcriptBufferRef.current}`,
            timestamp: new Date()
        }]);
        transcriptBufferRef.current = '';
        setCurrentTranscript('');
    }
  }, []);

  const startScreenShare = async () => {
     try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: { width: { max: 1920 }, height: { max: 1080 } },
            audio: false
        });
        screenStreamRef.current = screenStream;
        
        if (videoRef.current) {
            videoRef.current.srcObject = screenStream;
            videoRef.current.play();
        }
        setIsScreenSharing(true);

        // Start processing frames
        if (sessionRef.current && canvasRef.current && videoRef.current) {
            const ctx = canvasRef.current.getContext('2d');
            frameIntervalRef.current = window.setInterval(() => {
                if (!ctx || !videoRef.current || !screenStream.active) return;
                
                canvasRef.current!.width = videoRef.current.videoWidth;
                canvasRef.current!.height = videoRef.current.videoHeight;
                ctx.drawImage(videoRef.current, 0, 0);
                
                const base64 = canvasRef.current.toDataURL('image/jpeg', JPEG_QUALITY).split(',')[1];
                sessionRef.current!.then((session: any) => {
                    session.sendRealtimeInput({
                        media: { mimeType: 'image/jpeg', data: base64 }
                    });
                });
            }, 1000 / FRAME_RATE);
        }

        screenStream.getVideoTracks()[0].onended = () => {
            setIsScreenSharing(false);
            if (frameIntervalRef.current) window.clearInterval(frameIntervalRef.current);
        };

     } catch (e) {
         console.error("Screen share failed", e);
         setMessages(prev => [...prev, {
             id: Date.now().toString(),
             role: 'model',
             text: "System: Screen share failed or was cancelled.",
             timestamp: new Date()
         }]);
     }
  };

  const startLiveSession = async () => {
    setLiveStatus('Initializing...');
    try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        const inputCtx = new AudioContextClass({ sampleRate: 16000 });
        const outputCtx = new AudioContextClass({ sampleRate: 24000 });
        inputContextRef.current = inputCtx;
        audioContextRef.current = outputCtx;
        nextStartTimeRef.current = 0;
        transcriptBufferRef.current = '';

        const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = micStream;

        setLiveStatus('Connecting...');

        const sessionPromise = ai.live.connect({
            model: 'gemini-2.5-flash-native-audio-preview-09-2025',
            callbacks: {
                onopen: () => {
                    setLiveStatus('Connected');
                    setIsLive(true);
                    
                    // Input Audio Stream
                    const source = inputCtx.createMediaStreamSource(micStream);
                    const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
                    scriptProcessor.onaudioprocess = (e) => {
                        const inputData = e.inputBuffer.getChannelData(0);
                        const pcmBlob = createPcmBlob(inputData);
                        sessionPromise.then(session => session.sendRealtimeInput({ media: pcmBlob }));
                    };
                    source.connect(scriptProcessor);
                    scriptProcessor.connect(inputCtx.destination);
                },
                onmessage: async (message: LiveServerMessage) => {
                    // 1. Handle Audio Output
                    const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
                    if (base64Audio && outputCtx) {
                        nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputCtx.currentTime);
                        const audioBuffer = await decodeAudioData(base64ToUint8Array(base64Audio), outputCtx, 24000, 1);
                        const source = outputCtx.createBufferSource();
                        source.buffer = audioBuffer;
                        source.connect(outputCtx.destination);
                        source.addEventListener('ended', () => sourcesRef.current.delete(source));
                        source.start(nextStartTimeRef.current);
                        nextStartTimeRef.current += audioBuffer.duration;
                        sourcesRef.current.add(source);
                    }
                    
                    // 2. Handle Transcript - Aggregate synchronously in ref
                    const transcriptPart = message.serverContent?.outputTranscription?.text;
                    if (transcriptPart) {
                        transcriptBufferRef.current += transcriptPart;
                        setCurrentTranscript(transcriptBufferRef.current);
                    }
                    
                    // 3. Handle Turn Complete - Flush transcript to chat
                    if (message.serverContent?.turnComplete) {
                        const fullText = transcriptBufferRef.current;
                        if (fullText.trim()) {
                            setMessages(prev => [...prev, {
                                id: Date.now().toString(),
                                role: 'model',
                                text: `🔊 ${fullText}`,
                                timestamp: new Date()
                            }]);
                            transcriptBufferRef.current = '';
                            setCurrentTranscript(''); 
                        }
                    }

                    // 4. Handle Tool Calls (Save Setup JSON)
                    if (message.toolCall) {
                        const functionCalls = message.toolCall.functionCalls;
                        functionCalls.forEach(fc => {
                            if (fc.name === 'save_setup_json') {
                                const args = fc.args as any;
                                const setupFile = {
                                    filename: args.filename,
                                    content: args.content
                                };
                                
                                setMessages(prev => [...prev, {
                                    id: Date.now().toString(),
                                    role: 'model',
                                    text: "I've generated the setup file for you based on our session.",
                                    setupFile: setupFile,
                                    timestamp: new Date()
                                }]);

                                // Send success response back to model
                                sessionPromise.then(session => session.sendToolResponse({
                                    functionResponses: {
                                        name: fc.name,
                                        id: fc.id,
                                        response: { result: "File generated successfully and presented to user." }
                                    }
                                }));
                            }
                        });
                    }
                },
                onclose: () => stopLiveSession(),
                onerror: (err) => {
                    console.error(err);
                    setLiveStatus('Error');
                    stopLiveSession();
                }
            },
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
                outputAudioTranscription: { },
                tools: [{ functionDeclarations: [saveSetupTool] }],
                systemInstruction: "You are an elite Assetto Corsa Competizione (ACC) Setup Engineer. \nSTYLE: Concise, Professional, Direct. No filler words.\nSPEECH SPEED: Speak as fast as possible while remaining intelligible.\nTASK: Help user build car setups.\nRULES:\n1. Short responses (max 2 sentences unless explaining complex physics).\n2. When viewing a setup page, immediately identify values.\n3. Call `save_setup_json` only when explicitly asked or agreed upon.\n4. Do not output raw JSON in the voice text stream; always use the tool to save it.",
                thinkingConfig: { thinkingBudget: 0 } // Disable thinking for max speed
            }
        });
        sessionRef.current = sessionPromise;

    } catch (e) {
        console.error(e);
        setLiveStatus('Connection Failed');
        stopLiveSession();
    }
  };

  useEffect(() => {
    return () => stopLiveSession();
  }, [stopLiveSession]);

  const downloadSetup = (filename: string, content: string) => {
      const blob = new Blob([content], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full bg-racing-dark max-w-6xl mx-auto w-full border-x border-zinc-800 shadow-2xl">
      
      {/* Header */}
      <div className="p-4 border-b border-zinc-800 bg-racing-panel flex justify-between items-center shrink-0">
        <div>
            <h2 className="text-xl font-display font-bold italic text-white flex items-center gap-2">
                SETUP <span className="text-blue-500">WIZARD</span>
                {isLive && <span className="text-[10px] bg-red-500/20 text-red-500 border border-red-500/50 px-2 py-0.5 rounded animate-pulse">LIVE</span>}
            </h2>
            <p className="text-xs text-zinc-400">Share your screen for real-time setup tuning and config generation, or chat to diagnose specific handling issues.</p>
        </div>
        
        <div className="flex items-center gap-3">
            {!isLive ? (
                <button 
                    onClick={startLiveSession}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg font-bold text-sm transition-all shadow-lg shadow-blue-900/20"
                >
                    <Mic size={16} />
                    START LIVE SESSION
                </button>
            ) : (
                <div className="flex items-center gap-2">
                    <button 
                        onClick={startScreenShare}
                        disabled={isScreenSharing}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all border ${
                            isScreenSharing 
                            ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50 cursor-default' 
                            : 'bg-zinc-800 text-white hover:bg-zinc-700 border-zinc-700'
                        }`}
                    >
                        {isScreenSharing ? <Monitor size={14} /> : <Monitor size={14} />}
                        {isScreenSharing ? 'SHARING SCREEN' : 'SHARE SCREEN'}
                    </button>
                    <button 
                        onClick={stopLiveSession}
                        className="flex items-center gap-2 bg-red-900/20 hover:bg-red-900/40 text-red-400 border border-red-900/50 px-3 py-2 rounded-lg font-bold text-xs transition-all"
                    >
                        <Square size={14} fill="currentColor" />
                        END SESSION
                    </button>
                </div>
            )}
            <button onClick={() => setMessages([])} className="text-zinc-500 hover:text-white transition-colors" title="Clear Chat">
                <RefreshCw size={18} />
            </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        
        {/* Left Panel: Live Video Feed (Only visible when Live) */}
        {isLive && (
            <div className="lg:w-1/2 bg-black relative flex flex-col border-b lg:border-b-0 lg:border-r border-zinc-800">
                <div className="flex-1 relative flex items-center justify-center overflow-hidden bg-zinc-900/50">
                    <video 
                        ref={videoRef} 
                        className={`max-w-full max-h-full object-contain ${isScreenSharing ? 'opacity-100' : 'opacity-0 absolute'}`} 
                        autoPlay 
                        playsInline 
                        muted 
                    />
                    {!isScreenSharing && (
                        <div className="text-center p-8">
                            <div className="w-16 h-16 bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
                                <Video className="text-zinc-600" size={32} />
                            </div>
                            <h3 className="text-white font-bold mb-2">Waiting for Screen Share</h3>
                            <p className="text-zinc-500 text-sm max-w-xs mx-auto">
                                Click "Share Screen" above so the AI Engineer can see your setup values.
                            </p>
                        </div>
                    )}
                    {/* Audio Visualizer Mockup */}
                    <div className="absolute bottom-4 left-4 right-4 flex justify-between items-end pointer-events-none">
                        <div className="flex gap-1 items-end h-8">
                             {[...Array(5)].map((_, i) => (
                                 <div key={i} className="w-1 bg-blue-500/80 rounded-t animate-pulse" style={{ height: `${Math.random() * 100}%`, animationDuration: '0.5s' }} />
                             ))}
                        </div>
                        <div className="bg-black/60 backdrop-blur px-2 py-1 rounded text-[10px] text-zinc-400 border border-white/10">
                            {liveStatus}
                        </div>
                    </div>
                </div>
                <canvas ref={canvasRef} className="hidden" />
            </div>
        )}

        {/* Right Panel: Chat & Transcript */}
        <div className={`flex-1 flex flex-col bg-racing-dark ${isLive ? 'lg:w-1/2' : 'w-full'}`}>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] rounded-2xl p-4 shadow-lg ${
                    msg.role === 'user' 
                        ? 'bg-blue-600 text-white rounded-br-none' 
                        : 'bg-zinc-800 text-zinc-100 rounded-bl-none border border-zinc-700'
                    }`}>
                    {msg.image && (
                        <img src={msg.image} alt="Upload" className="max-h-60 rounded-lg mb-3 border border-black/20" />
                    )}
                    <div className="prose prose-invert prose-sm whitespace-pre-wrap leading-relaxed">
                        {msg.text}
                    </div>
                    
                    {/* Render Setup File Download Card */}
                    {msg.setupFile && (
                        <div className="mt-4 bg-zinc-900 border border-zinc-700 rounded-lg p-3 flex items-center gap-3 hover:border-emerald-500 transition-colors group cursor-pointer" onClick={() => downloadSetup(msg.setupFile!.filename, msg.setupFile!.content)}>
                            <div className="w-10 h-10 bg-emerald-900/20 rounded flex items-center justify-center group-hover:bg-emerald-600 transition-colors">
                                <FileJson size={20} className="text-emerald-500 group-hover:text-white" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-white truncate">{msg.setupFile.filename}</p>
                                <p className="text-xs text-zinc-400">ACC Setup Config • JSON</p>
                            </div>
                            <div className="p-2 text-zinc-500 group-hover:text-emerald-400">
                                <Download size={18} />
                            </div>
                        </div>
                    )}

                    <div className="text-[10px] opacity-50 mt-2 text-right flex items-center justify-end gap-1">
                        {msg.text.startsWith('🔊') && <Volume2 size={10} />}
                        {msg.timestamp.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    </div>
                    </div>
                </div>
                ))}
                
                {/* Real-time transcript preview */}
                {currentTranscript && (
                    <div className="flex justify-start">
                         <div className="bg-zinc-800/50 text-zinc-400 rounded-2xl rounded-bl-none p-4 border border-zinc-700/50 border-dashed max-w-[85%]">
                            <div className="flex items-center gap-2 mb-1">
                                <span className="flex h-2 w-2 relative">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                                </span>
                                <span className="text-xs font-bold uppercase tracking-wider">Speaking...</span>
                            </div>
                            <p className="italic opacity-80">{currentTranscript}</p>
                         </div>
                    </div>
                )}
                
                {isLoading && (
                <div className="flex justify-start animate-pulse">
                    <div className="bg-zinc-800 rounded-2xl rounded-bl-none p-4 border border-zinc-700 flex items-center gap-2">
                        <Loader2 size={16} className="animate-spin text-blue-500" />
                        <span className="text-sm text-zinc-400">Analyzing setup...</span>
                    </div>
                </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-4 bg-racing-panel border-t border-zinc-800 shrink-0">
                {selectedImage && (
                    <div className="mb-2 flex items-center gap-2 bg-zinc-900 p-2 rounded border border-zinc-700 w-fit">
                        <ImageIcon size={14} className="text-blue-400" />
                        <span className="text-xs text-zinc-300">Image attached</span>
                        <button onClick={() => setSelectedImage(null)} className="text-zinc-500 hover:text-red-400 ml-2">×</button>
                    </div>
                )}
                <div className="flex gap-2">
                    <button 
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isLive} 
                        className={`p-3 rounded-xl transition-colors border ${isLive ? 'bg-zinc-800/50 text-zinc-600 border-zinc-800 cursor-not-allowed' : 'text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 border-zinc-700'}`}
                    >
                        <Upload size={20} />
                    </button>
                    <input 
                        type="file" 
                        ref={fileInputRef} 
                        className="hidden" 
                        accept="image/*" 
                        onChange={handleImageSelect}
                    />
                    
                    <textarea
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSendMessage();
                            }
                        }}
                        placeholder={isLive ? "Listening... (You can also type here)" : "Describe your handling issue..."}
                        className="flex-1 bg-zinc-900 border border-zinc-700 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-blue-500 resize-none h-[50px] overflow-hidden py-3.5"
                    />
                    
                    <button 
                        onClick={handleSendMessage}
                        disabled={isLoading || (!inputText && !selectedImage)}
                        className="p-3 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded-xl transition-colors shadow-lg shadow-blue-900/20"
                    >
                        <Send size={20} />
                    </button>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};