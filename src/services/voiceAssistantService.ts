// 100% Free, Tokenless, Natural Uzbek Male Voice & Speech Recognition Service

export interface VoiceAssistantSettings {
  wakeWord: string;
  autoCopyEmailAfterName: boolean;
  copyMode: 'name_first' | 'email_first' | 'both';
  soundFeedback: boolean;
}

const SETTINGS_KEY = 'b1m_voice_assistant_settings_v1';
const DEFAULT_SETTINGS: VoiceAssistantSettings = {
  wakeWord: 'keyingisi',
  autoCopyEmailAfterName: false,
  copyMode: 'name_first',
  soundFeedback: true,
};

// Clipboard fallback to ensure 100% copy reliability in speech callbacks
export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (err) {
    // Fall back to execCommand
  }

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

// Current active Audio element
let currentAudio: HTMLAudioElement | null = null;
const audioCache = new Map<string, string>();

/**
 * Speaks Uzbek text using Microsoft Edge Neural Uzbek Male voice (uz-UZ-SardorNeural)
 * 100% natural, free, unlimited, tokenless.
 * Falls back seamlessly to browser SpeechSynthesis if offline.
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

  // Stop any currently playing audio
  if (currentAudio) {
    try {
      currentAudio.pause();
      currentAudio.currentTime = 0;
    } catch {}
    currentAudio = null;
  }
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }

  const cleanText = text.trim();

  // Try Server Edge TTS endpoint first (100% Natural Male Voice: uz-UZ-SardorNeural)
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
        throw new Error(`TTS server responded with status ${response.status}`);
      }

      const blob = await response.blob();
      audioUrl = URL.createObjectURL(blob);
      audioCache.set(cleanText, audioUrl);
    }

    const audio = new Audio(audioUrl);
    currentAudio = audio;

    await new Promise<void>((resolve, reject) => {
      audio.onended = () => {
        currentAudio = null;
        onEnd?.();
        resolve();
      };
      audio.onerror = (e) => {
        currentAudio = null;
        reject(e);
      };
      audio.play().catch(reject);
    });
    return;
  } catch (edgeErr) {
    console.warn('Edge TTS server fallback to browser speech synthesis:', edgeErr);
  }

  // Browser SpeechSynthesis Fallback
  try {
    if ('speechSynthesis' in window) {
      onStart?.();
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.lang = 'uz-UZ';
      utterance.rate = 1.0;
      utterance.pitch = 0.85; // Lower pitch for masculine tone

      // Try finding an Uzbek or Russian voice with low pitch
      const voices = window.speechSynthesis.getVoices();
      const uzVoice = voices.find(v => v.lang.startsWith('uz')) ||
                      voices.find(v => v.name.toLowerCase().includes('uzbek')) ||
                      voices.find(v => v.name.toLowerCase().includes('male')) ||
                      voices.find(v => v.lang.startsWith('ru'));
      if (uzVoice) {
        utterance.voice = uzVoice;
      }

      utterance.onend = () => {
        onEnd?.();
      };
      utterance.onerror = () => {
        onEnd?.();
      };

      window.speechSynthesis.speak(utterance);
    } else {
      onEnd?.();
    }
  } catch {
    onEnd?.();
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

export function saveVoiceAssistantSettings(settings: VoiceAssistantSettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {}
}
