import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
  signOut,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize Firebase App singleton
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);

const provider = new GoogleAuthProvider();
// Workspace Gmail scope
provider.addScope('https://www.googleapis.com/auth/gmail.readonly');
// Hint prompt to allow user to select or switch to their desired Google account (e.g. akramxonsaidov02@gmail.com)
provider.setCustomParameters({
  prompt: 'select_account',
});

let cachedAccessToken: string | null = null;
let isSigningIn = false;

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        // Token must be refreshed via user sign-in popup to get access token for 1P scopes
        cachedAccessToken = null;
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string }> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error("Google'dan kirish kaliti (Access Token) olinmadi");
    }

    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    if (error?.code === 'auth/popup-closed-by-user' || error?.code === 'auth/cancelled-popup-request') {
      console.info('Google sign-in popup was dismissed by the user.');
      const err = new Error('Google oynasi yopildi. Iltimos, qaytadan urinib ko‘ring.');
      (err as any).code = error.code;
      throw err;
    }
    console.error('Google Sign In error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const logoutGoogle = async () => {
  await signOut(auth);
  cachedAccessToken = null;
};

// Helper to decode Gmail base64 / base64url content safely
function decodeBase64(str: string): string {
  try {
    const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    const bytes = Uint8Array.from(raw, c => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return '';
  }
}

// Recursively extract all text/html parts from Gmail message payload
function extractBodyText(payload: any): string {
  if (!payload) return '';
  let text = '';

  if (payload.body?.data) {
    text += ' ' + decodeBase64(payload.body.data);
  }

  if (payload.parts && Array.isArray(payload.parts)) {
    for (const part of payload.parts) {
      if (part.body?.data) {
        text += ' ' + decodeBase64(part.body.data);
      }
      if (part.parts) {
        text += ' ' + extractBodyText(part);
      }
    }
  }

  return text;
}

export interface ActivationEmailResult {
  found: boolean;
  type?: 'aileaders' | 'coursera';
  activationLink?: string;
  courseraLink?: string;
  subject?: string;
  sender?: string;
  snippet?: string;
  date?: string;
  id?: string;
  message?: string;
}

/**
 * Searches Gmail for the latest Aileaders / Coursera activation or confirmation emails
 * and extracts the verification URL automatically.
 */
export async function scanGmailForActivation(accessToken: string): Promise<ActivationEmailResult> {
  try {
    // 1. Search messages with query for noreply / aileaders / coursera
    const query = encodeURIComponent('from:(noreply OR aileaders OR coursera) OR subject:(aileaders OR coursera OR "Привет")');
    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${query}&maxResults=10`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      }
    );

    if (!listRes.ok) {
      if (listRes.status === 401) {
        cachedAccessToken = null;
        throw new Error("Gmail kirish muddati tugagan. Qaytadan 'Google orqali ulanish' tugmasini bosing.");
      }
      const err = await listRes.json();
      throw new Error(err.error?.message || 'Gmail xabarlarini olishda xatolik');
    }

    const listData = await listRes.json();
    const messages = listData.messages;

    if (!messages || messages.length === 0) {
      return {
        found: false,
        message: "Pochtada hali Aileaders yoki Coursera xatlari topilmadi. Birozdan so'ng qayta tekshiring.",
      };
    }

    // 2. Fetch the top 5 messages in detail
    for (const msg of messages.slice(0, 5)) {
      const detailRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json',
          },
        }
      );

      if (!detailRes.ok) continue;
      const detail = await detailRes.json();
      const headers = detail.payload?.headers || [];
      const getHeader = (name: string) => headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || '';

      const subject = getHeader('subject');
      const sender = getHeader('from');
      const date = getHeader('date');
      const bodyContent = extractBodyText(detail.payload) + ' ' + (detail.snippet || '');

      // Check for Aileaders activation link: https://aileaders.uz/auth/activate/...
      const aileadersMatch = bodyContent.match(/https?:\/\/(?:www\.)?aileaders\.uz\/auth\/activate\/[a-zA-Z0-9_\-\.\/]+/i);
      if (aileadersMatch) {
        return {
          found: true,
          type: 'aileaders',
          activationLink: aileadersMatch[0].replace(/&amp;/g, '&'),
          subject,
          sender,
          snippet: detail.snippet,
          date,
          id: msg.id,
        };
      }

      // Check for Coursera verification or program invitation link
      const courseraMatch = bodyContent.match(/https?:\/\/(?:www\.)?coursera\.org\/(?:account-verification|programs\/[a-zA-Z0-9_\-]+|api\/verifyEmail)[a-zA-Z0-9_\-\.\/?=&%#]+/i);
      if (courseraMatch) {
        return {
          found: true,
          type: 'coursera',
          courseraLink: courseraMatch[0].replace(/&amp;/g, '&'),
          subject,
          sender,
          snippet: detail.snippet,
          date,
          id: msg.id,
        };
      }
    }

    return {
      found: false,
      message: "Yangi faollashtirish havolasi topilmadi. Xat kelganiga ishonch hosil qiling yoki pochtangizni yangilang.",
    };
  } catch (err: any) {
    console.error('Scan Gmail error:', err);
    throw err;
  }
}
