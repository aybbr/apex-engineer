# Apex Engineer: ACC Coach

**Built for the Google Gemini Hackathon**

Apex Engineer is a demo app for an AI racing companion for sim-racing games, designed to lower the barrier to entry for sim racers. It leverages the power of **Google AI Studio** and the **Gemini Multimodal Live API** to create agents that can **See**, **Hear**, **Speak**, and **Act** in real-time.

## 🚀 Key Capabilities

### 1. Multimodal Live Coaching (Vision + Audio)
Powered by **Gemini 2.5 Flash**, the Live Coach acts as a real-time co-pilot.
*   **Vision:** The agent streams the game window (via `getDisplayMedia`) and analyzes telemetry, racing lines, and braking markers at high frame rates.
*   **Voice:** Uses the Gemini Live API for low-latency, interruptible speech-to-speech interaction.
*   **Personas:** Switch between a professional **Race Engineer** or the chaotic **"Samir" Mode** (based on [the viral rally video](https://www.youtube.com/watch?v=D9-voINFkCg)) for a fun, stress-inducing challenge.

### 2. Intelligent Setup Wizard (Vision + Function Calling)
Car setup in sim racing is complex (dampers, aero, toe, camber).
*   **Screen Analysis:** The agent looks at your setup screen and explains what specific values do.
*   **Action:** Once a setup is agreed upon, the agent uses **Function Calling** (`save_setup_json`) to autonomously generate and validate the actual game configuration file (`.json`) for you to download. (TO-DO)

### 3. Telemetry Analysis
A data visualization dashboard that compares your inputs (throttle, brake, speed) against reference laps to find time on the track.

## 🛠️ Tech Stack

*   **Model:** Google Gemini 2.5 Flash (via `@google/genai` SDK)
*   **API:** Gemini Multimodal Live API (WebSockets)
*   **Frontend:** React 19, Tailwind CSS, Lucide Icons, Recharts
*   **Audio Processing:** Web Audio API (Raw PCM encoding/decoding)

## 🎯 Hackathon Goal

The goal of this project is to demonstrate how multimodal AI agents can move beyond simple text chat to become active, context-aware participants in complex real-time environments like competitive racing simulation all while vibe coding.