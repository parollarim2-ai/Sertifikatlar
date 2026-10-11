// 100% Free, Tokenless, Natural Uzbek Voice Service (Microsoft Edge Neural)

export type UzbekVoiceId = 'uz-UZ-SardorNeural' | 'uz-UZ-MadinaNeural';

export interface VoiceAssistantSettings {
  wakeWord: string;
  voice: UzbekVoiceId;
  requireHeyPrefix: boolean;
  autoCopyEmailSeconds: number; // e.g. 3.5 seconds
  soundFeedback: boolean;
}

const SETTINGS_KEY = 'b1m_voice_assistant_settings_v3';
const DEFAULT_SETTINGS: VoiceAssistantSettings = {
  wakeWord: 'keyingisi',
  voice: 'uz-UZ-SardorNeural',
  requireHeyPrefix: true,
  autoCopyEmailSeconds: 3.5,
  soundFeedback: true,
};

// Reliable Clipboard write helper
export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (err) {}

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '0';
    textarea.setAttribute('readonly', '');
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const success = document.execCommand('copy');
    document.body.removeChild(textarea);
    return success;
  } catch {
    return false;
  }
}

// Reliable Clipboard read helper (for pasting Coursera certificate)
export async function readFromClipboard(): Promise<string> {
  try {
    if (navigator.clipboard && navigator.clipboard.readText) {
      const text = await navigator.clipboard.readText();
      if (text && typeof text === 'string') {
        return text.trim();
      }
    }
  } catch (err) {
    console.warn('Clipboard read permission warning:', err);
  }
  return '';
}

// Persistent HTML5 Audio for bypassing browser async autoplay restrictions
let persistentAudio: HTMLAudioElement | null = null;
let isAudioUnlocked = false;

/**
 * Call on any user gesture (e.g. click microphone button) to unlock audio playback
 */
export function unlockAudioPlayback(): void {
  if (isAudioUnlocked && persistentAudio) return;
  try {
    if (!persistentAudio) {
      persistentAudio = new Audio();
    }
    // Silent tiny WAV
    persistentAudio.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
    persistentAudio.play().then(() => {
      persistentAudio?.pause();
      isAudioUnlocked = true;
    }).catch(() => {});
  } catch {}
}

/**
 * Speaks Uzbek text using Microsoft Edge Neural Uzbek voice
 * Zero tokens, zero robotic voices!
 */
export async function speakUzbekVoice(
  text: string,
  voice: UzbekVoiceId = 'uz-UZ-SardorNeural',
  onStart?: () => void,
  onEnd?: () => void
): Promise<void> {
  if (!text || !text.trim()) {
    onEnd?.();
    return;
  }

  if (!persistentAudio) {
    persistentAudio = new Audio();
  }

  try {
    persistentAudio.pause();
    persistentAudio.currentTime = 0;
  } catch {}

  const cleanText = text.trim();

  try {
    onStart?.();

    // Direct streaming URL from server endpoint
    const url = `/api/tts/speak?text=${encodeURIComponent(cleanText)}&voice=${encodeURIComponent(voice)}`;
    persistentAudio.src = url;

    await new Promise<void>((resolve) => {
      if (!persistentAudio) {
        onEnd?.();
        resolve();
        return;
      }

      persistentAudio.onended = () => {
        onEnd?.();
        resolve();
      };

      persistentAudio.onerror = (e) => {
        console.error('TTS playback error:', e);
        onEnd?.();
        resolve();
      };

      persistentAudio.play().catch((playErr) => {
        console.warn('TTS play promise warning:', playErr);
        onEnd?.();
        resolve();
      });
    });
  } catch (err) {
    console.error('Edge TTS request failed:', err);
    onEnd?.();
  }
}

export function stopSpeaking(): void {
  if (persistentAudio) {
    try {
      persistentAudio.pause();
      persistentAudio.currentTime = 0;
    } catch {}
  }
}

export function loadVoiceAssistantSettings(): VoiceAssistantSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    }
  } catch {}
  return DEFAULT_SETTINGS;
}

export function saveVoiceAssistantSettings(settings: VoiceAssistantSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {}
}
