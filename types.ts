
export enum AppView {
  DASHBOARD = 'DASHBOARD',
  LIVE_COACH = 'LIVE_COACH',
  SETUP_WIZARD = 'SETUP_WIZARD',
  TELEMETRY = 'TELEMETRY'
}

export interface SetupFile {
  filename: string;
  content: string; // JSON string
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  image?: string; // base64
  setupFile?: SetupFile;
  timestamp: Date;
}

export interface CarSetupRequest {
  carModel: string;
  track: string;
  weather: string;
  problemDescription: string;
  currentSetupImage?: string; // base64
}

export interface TelemetryData {
  speed: number[];
  brake: number[];
  throttle: number[];
  steer: number[];
  time: number[];
}
