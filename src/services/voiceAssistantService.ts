// 100% Free, Tokenless, Natural Uzbek Male Voice (Microsoft Edge Neural: uz-UZ-SardorNeural)

export interface VoiceAssistantSettings {
  wakeWord: string;
  autoCopyEmailSeconds: number; // e.g. 3.5 seconds
  soundFeedback: boolean;
}

const SETTINGS_KEY = 'b1m_voice_assistant_settings_v2';
const DEFAULT_SETTINGS: VoiceAssistantSettings = {
  wakeWord: 'keyingisi',
  autoCopyEmailSeconds: 3.5,
  soundFeedback: true,
};

// Reliable Clipboard helper
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

// Persistent HTML5 Audio for bypassing browser async autoplay restrictions
let persistentAudio: HTMLAudioElement | null = null;
let isAudioUnlocked = false;
const audioCache = new Map<string, string>();

/**
 * Call on any user gesture (e.g. click microphone button) to unlock audio playback
 */
export function unlockAudioPlayback(): void {
  if (isAudioUnlocked && persistentAudio) return;
  try {
    if (!persistentAudio) {
      persistentAudio = new Audio();
    }
    // Silent WAV base64
    persistentAudio.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
    persistentAudio.play().then(() => {
      persistentAudio?.pause();
      isAudioUnlocked = true;
    }).catch(() => {});
  } catch {}
}

/**
 * Speaks Uzbek text using Microsoft Edge Neural Uzbek Male voice (uz-UZ-SardorNeural)
 * 100% natural human male voice, polite and expressive.
 * Zero tokens, zero robotic voices!
 */
export async function speakUzbekMale(
  text: string,
  onStart?: () => void,
  onEnd?: () => void
): Promise<void> {
  if (!text || !text.trim()) {
    onEnd?.();
    return;
  }

  // Ensure persistent audio instance
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

    let audioUrl = audioCache.get(cleanText);

    if (!audioUrl) {
      const response = await fetch('/api/tts/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: cleanText, voice: 'uz-UZ-SardorNeural' }),
      });

      if (!response.ok) {
        throw new Error(`TTS server error ${response.status}`);
      }

      const blob = await response.blob();
      audioUrl = URL.createObjectURL(blob);
      audioCache.set(cleanText, audioUrl);
    }

    persistentAudio.src = audioUrl;

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
        console.error('TTS play blocked:', playErr);
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
