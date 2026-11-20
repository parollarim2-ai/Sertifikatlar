import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { jsPDF } from 'jspdf';
import type { ClassGroup, Student, TelegramUser } from './src/types/index.ts';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8846557313:AAE5J1aRrvJJ2LLZCbD7WlI_JFzhSrmR_tA';
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;
const DATA_FILE = path.resolve(process.cwd(), 'telegram-data.json');
const CERT_CACHE_DIR = path.resolve(process.cwd(), '.cert_cache');
try {
  if (!fs.existsSync(CERT_CACHE_DIR)) {
    fs.mkdirSync(CERT_CACHE_DIR, { recursive: true });
  }
} catch {}

type ProjectTrack = 'ai' | 'developer';

interface StoredData {
  classes: ClassGroup[];
  students: Student[];
  telegramUsers: Record<string, TelegramUser>; // key is chatId
  notifiedClasses: Record<string, string>; // classId -> hash/timestamp of last all-done notification
}

let store: StoredData = {
  classes: [],
  students: [],
  telegramUsers: {},
  notifiedClasses: {},
};

// Load saved data from disk on startup
function loadStore() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      store = {
        classes: parsed.classes || [],
        students: parsed.students || [],
        telegramUsers: parsed.telegramUsers || {},
        notifiedClasses: parsed.notifiedClasses || {},
      };
    }
  } catch (err) {
    console.error('Error loading telegram-data.json:', err);
  }
}

function saveStore() {
  try {
    const tmpFile = `${DATA_FILE}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(store, null, 2), 'utf8');
    fs.renameSync(tmpFile, DATA_FILE);
  } catch (err) {
    console.error('Error saving telegram-data.json:', err);
  }
}

loadStore();

import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, setDoc, setLogLevel } from 'firebase/firestore';

// Suppress internal gRPC connection debugging logs on Node.js
try {
  setLogLevel('error');
} catch {}

// ===================== TRACK ISOLATION HELPERS =====================
function isDeveloperCertificate(link?: string): boolean {
  if (!link) return false;
  const clean = link.trim().toLowerCase();
  return clean.includes('omp.aistudy.uz') || clean.includes('aistudy.uz') || clean.includes('certificate?id=');
}

function isCourseraCertificate(link?: string): boolean {
  if (!link) return false;
  const clean = link.trim().toLowerCase();
  return clean.includes('coursera.org') || clean.includes('coursera_assets') || clean.includes('coursera');
}

function getClassTrack(classGroup?: ClassGroup | null): ProjectTrack {
  if (!classGroup) return 'ai';
  return classGroup.projectType === 'developer' ? 'developer' : 'ai';
}

function getTrackData(student: Student, targetTrack: ProjectTrack) {
  if (targetTrack === 'developer') {
    let devLink = student.devCertificateLink;
    if (devLink && isCourseraCertificate(devLink)) {
      devLink = undefined;
    }
    if (!devLink && student.certificateLink && isDeveloperCertificate(student.certificateLink)) {
      devLink = student.certificateLink;
    }

    const isCert = !!(devLink && devLink.trim().length > 5);
    const isErr = Boolean(
      student.devStatus === 'error' ||
      student.devHasError ||
      (!isCert && student.hasError && student.projectType === 'developer')
    );
    const status: 'pending' | 'certified' | 'error' = isCert ? 'certified' : isErr ? 'error' : 'pending';

    return {
      status,
      certificateLink: devLink || '',
      certifiedAt: isCert
        ? student.devCertifiedAt || (isDeveloperCertificate(student.certificateLink) ? student.certifiedAt : undefined)
        : undefined,
      hasError: isErr,
      errorReason: student.devErrorReason || (student.projectType === 'developer' ? student.errorReason || '' : ''),
      errorImage: student.devErrorImage || (student.projectType === 'developer' ? student.errorImage || '' : ''),
      certificateDate: student.devCertificateDate,
      certificateDateVerified: Boolean(student.devCertificateDateVerified && student.devCertificateDate),
    };
  } else {
    let aiLink = student.aiCertificateLink;
    if (aiLink && isDeveloperCertificate(aiLink)) {
      aiLink = undefined;
    }
    if (!aiLink && student.certificateLink && !isDeveloperCertificate(student.certificateLink)) {
      aiLink = student.certificateLink;
    }

    const isCert = !!(aiLink && aiLink.trim().length > 5);
    const isErr = Boolean(
      student.aiStatus === 'error' ||
      student.aiHasError ||
      (!isCert && student.hasError && student.projectType !== 'developer')
    );
    const status: 'pending' | 'certified' | 'error' = isCert ? 'certified' : isErr ? 'error' : 'pending';

    return {
      status,
      certificateLink: aiLink || '',
      certifiedAt: isCert ? student.aiCertifiedAt || student.certifiedAt : undefined,
      hasError: isErr,
      errorReason: student.aiErrorReason || (student.projectType !== 'developer' ? student.errorReason || '' : ''),
      errorImage: student.aiErrorImage || (student.projectType !== 'developer' ? student.errorImage || '' : ''),
      certificateDate: student.aiCertificateDate || student.certificateDate,
      certificateDateVerified: Boolean(
        student.aiCertificateDateVerified && (student.aiCertificateDate || student.certificateDate)
      ),
    };
  }
}

function getClassTrackPaid(c: ClassGroup, track: ProjectTrack): number {
  if (track === 'developer') {
    return c.devPaidAmount ?? (c.id.startsWith('class-dev-') ? c.paidAmount || 0 : 0);
  }
  return c.aiPaidAmount ?? (c.paidAmount || 0);
}

function getTrackPrice(c: ClassGroup, track: ProjectTrack): number {
  return track === 'developer' ? 7000 : c.pricePerStudent || 5000;
}

function getTrackMeta(track: ProjectTrack) {
  if (track === 'developer') {
    return {
      emoji: '💡',
      shortName: '5M AI Yetakchilari',
      fullName: "Besh Million Sun'iy Intellekt Yetakchilari (omp.aistudy.uz)",
      copyTitle: "Besh million sun'iy intellekt yetakchilari (omp.aistudy.uz)",
      priceText: "7 000 so'm",
    };
  }
  return {
    emoji: '🚀',
    shortName: '1M Promter',
    fullName: 'Bir Million Promter (Coursera)',
    copyTitle: 'Bir million promter (Coursera)',
    priceText: "5 000 so'm",
  };
}

function fmtSum(num: number): string {
  return Math.round(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function countAllCertifiedTrackAware(): number {
  const classMap = new Map<string, ClassGroup>();
  for (const c of store.classes) classMap.set(c.id, c);

  let count = 0;
  for (const s of store.students) {
    const cls = classMap.get(s.classId);
    const track: ProjectTrack = cls
      ? getClassTrack(cls)
      : s.projectType === 'developer'
        ? 'developer'
        : 'ai';
    if (getTrackData(s, track).status === 'certified') {
      count++;
    }
  }
  return count;
}

// Initialize Firebase Firestore connection for resilient server-side synchronization
let firestoreDb: any = null;
try {
  const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const app = !getApps().length ? initializeApp(config) : getApp();
    firestoreDb = getFirestore(app, config.firestoreDatabaseId);
    console.log('🔥 Server-side Firestore connected for Telegram Bot sync:', config.firestoreDatabaseId);

    // Initial data fetch from Firestore on boot
    ensureFreshFirestoreData()
      .then((stats) => {
        console.log(
          `📡 [Telegram Bot] Synchronized with Firestore: ${stats.classesCount} classes, ${stats.studentsCount} students (${stats.certifiedCount} certified)`
        );
      })
      .catch((err) => {
        console.log('Initial Firestore sync notice:', err.message);
      });

    // Periodic synchronization every 30 seconds ensures fresh data without fragile idle gRPC streams
    setInterval(async () => {
      try {
        await ensureFreshFirestoreData();
        await checkAndNotifyCompletedClasses().catch(() => {});
      } catch {
        // Silently tolerate transient network glitches
      }
    }, 30000);
  }
} catch (e: any) {
  console.error('Failed to initialize server-side Firestore connection:', e.message);
}

// Function to guarantee freshest data on-demand from Firestore without persistent stream leaks
export async function ensureFreshFirestoreData(): Promise<{
  classesCount: number;
  studentsCount: number;
  certifiedCount: number;
}> {
  if (!firestoreDb) {
    return {
      classesCount: store.classes.length,
      studentsCount: store.students.length,
      certifiedCount: countAllCertifiedTrackAware(),
    };
  }

  try {
    const [classesSnap, studentsSnap, usersSnap] = await Promise.all([
      getDocs(collection(firestoreDb, 'classes')),
      getDocs(collection(firestoreDb, 'students')),
      getDocs(collection(firestoreDb, 'telegramUsers')).catch(() => null),
    ]);

    const freshClasses: ClassGroup[] = [];
    classesSnap.forEach((d) => freshClasses.push({ ...(d.data() as any), id: d.id } as ClassGroup));
    if (freshClasses.length > 0) {
      store.classes = freshClasses;
    }

    const freshStudents: Student[] = [];
    studentsSnap.forEach((d) => freshStudents.push({ ...(d.data() as any), id: d.id } as Student));
    if (freshStudents.length > 0) {
      store.students = freshStudents;
    }

    if (usersSnap) {
      usersSnap.forEach((d) => {
        const u = { ...(d.data() as any), id: d.id } as TelegramUser;
        if (u && u.id) {
          store.telegramUsers[u.id] = u;
        }
      });
    }

    saveStore();

    return {
      classesCount: store.classes.length,
      studentsCount: store.students.length,
      certifiedCount: countAllCertifiedTrackAware(),
    };
  } catch (err: any) {
    console.log('ensureFreshFirestoreData notice:', err.message);
    return {
      classesCount: store.classes.length,
      studentsCount: store.students.length,
      certifiedCount: countAllCertifiedTrackAware(),
    };
  }
}

export function getTelegramUsers(): TelegramUser[] {
  return Object.values(store.telegramUsers);
}

export function syncDataFromClient(data: { classes?: ClassGroup[]; students?: Student[] }) {
  if (data.classes && Array.isArray(data.classes)) {
    store.classes = data.classes;
  }
  if (data.students && Array.isArray(data.students)) {
    store.students = data.students;
  }
  saveStore();
  // Check if any class has reached 100% completion
  checkAndNotifyCompletedClasses().catch((e) => console.error('Error in auto notify check:', e));
}

// Rate-limited Telegram API request queue (max 18 req/sec to safely stay below Telegram's 30/sec limit)
interface QueuedTelegramTask {
  method: string;
  payload: any;
  resolve: (res: any) => void;
  reject: (err: any) => void;
}

const telegramQueue: QueuedTelegramTask[] = [];
let isProcessingQueue = false;

async function processTelegramQueue() {
  if (isProcessingQueue) return;
  isProcessingQueue = true;

  while (telegramQueue.length > 0) {
    const task = telegramQueue.shift();
    if (!task) break;

    try {
      const res = await fetch(`${TELEGRAM_API}/${task.method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(task.payload),
      });

      const data = await res.json().catch(() => null);

      if (data && data.error_code === 429) {
        const retryAfter = ((data.parameters?.retry_after || 2) + 0.5) * 1000;
        console.warn(`[Telegram Rate Limit 429] Waiting ${retryAfter}ms before retrying...`);
        await new Promise((r) => setTimeout(r, retryAfter));
        telegramQueue.unshift(task);
        continue;
      }

      if (data && data.ok === false) {
        console.warn(`[Telegram API ${task.method}] ${data.error_code}: ${data.description}`);
      }

      task.resolve(data);
    } catch (err) {
      console.error(`Telegram API error on ${task.method}:`, err);
      task.resolve(null);
    }

    // 55ms spacing between calls = ~18 calls/sec, perfectly avoiding 429
    await new Promise((r) => setTimeout(r, 55));
  }

  isProcessingQueue = false;
}

// Low-level queued Telegram API helper
export function callTelegram(method: string, payload: any): Promise<any> {
  return new Promise((resolve, reject) => {
    telegramQueue.push({ method, payload, resolve, reject });
    processTelegramQueue();
  });
}

// Safe broadcast helper across all connected users with rate limiting
export async function broadcastTelegramNotification(htmlText: string): Promise<number> {
  const users = getTelegramUsers();
  let count = 0;
  for (const u of users) {
    if (u.chatId && !u.isBlocked) {
      await sendMessage(u.chatId, htmlText);
      count++;
    }
  }
  return count;
}

// Send text message with inline keyboard
async function sendMessage(
  chatId: number | string,
  text: string,
  replyMarkup?: any,
  options?: { disableWebPagePreview?: boolean }
) {
  return await callTelegram('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    reply_markup: replyMarkup,
    disable_web_page_preview: options?.disableWebPagePreview ?? false,
  });
}

// Edit text message
async function editMessageText(
  chatId: number | string,
  messageId: number,
  text: string,
  replyMarkup?: any,
  options?: { disableWebPagePreview?: boolean }
) {
  return await callTelegram('editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: 'HTML',
    reply_markup: replyMarkup,
    disable_web_page_preview: options?.disableWebPagePreview ?? false,
  });
}

/**
 * Guarantees delivery: tries editMessageText when messageId is present,
 * and automatically falls back to sendMessage if edit fails (e.g. >48h old,
 * uneditable message type, or anything other than "message is not modified").
 */
async function deliverOrEditMessage(
  chatId: number | string,
  messageId: number | undefined,
  text: string,
  replyMarkup?: any,
  options?: { disableWebPagePreview?: boolean }
) {
  if (messageId) {
    const res = await editMessageText(chatId, messageId, text, replyMarkup, options);
    if (res && res.ok) return res;
    if (res && typeof res.description === 'string' && res.description.includes('message is not modified')) {
      return res;
    }
  }
  return await sendMessage(chatId, text, replyMarkup, options);
}

/**
 * Sends long HTML list messages cleanly across multiple Telegram messages
 * when total length exceeds Telegram's 4096-character limit.
 */
async function sendLongHtmlMessage(
  chatId: number | string,
  messageId: number | undefined,
  headerHtml: string,
  lines: string[],
  footerHtml: string,
  replyMarkup?: any,
  options?: { disableWebPagePreview?: boolean }
) {
  const full = `${headerHtml}${lines.join('')}${footerHtml}`;
  if (full.length <= 3850) {
    return await deliverOrEditMessage(chatId, messageId, full, replyMarkup, options);
  }

  // Split safely by lines
  const chunks: string[] = [];
  let current = headerHtml;
  for (const line of lines) {
    if (current.length + line.length > 3500) {
      chunks.push(current);
      current = '';
    }
    current += line;
  }
  if (current || chunks.length === 0) {
    chunks.push(current);
  }

  for (let i = 0; i < chunks.length; i++) {
    const isFirst = i === 0;
    const isLast = i === chunks.length - 1;
    const chunkText = isLast ? `${chunks[i]}${footerHtml}` : chunks[i];
    const markup = isLast ? replyMarkup : undefined;

    if (isFirst && messageId) {
      await deliverOrEditMessage(chatId, messageId, chunkText, markup, options);
    } else {
      await sendMessage(chatId, chunkText, markup, options);
    }
  }
}

// Answer callback query
async function answerCallbackQuery(callbackQueryId: string, text?: string, showAlert: boolean = false) {
  return await callTelegram('answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    text,
    show_alert: showAlert,
  });
}

// Send photo (url or base64 data)
async function sendPhoto(chatId: number | string, photoUrlOrBase64: string, caption?: string) {
  try {
    if (photoUrlOrBase64.startsWith('data:image/')) {
      const parts = photoUrlOrBase64.split(',');
      const mime = parts[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
      const buffer = Buffer.from(parts[1], 'base64');
      const form = new FormData();
      form.append('chat_id', chatId.toString());
      form.append('photo', new Blob([new Uint8Array(buffer)], { type: mime }), 'screenshot.jpg');
      if (caption) {
        form.append('caption', caption);
        form.append('parse_mode', 'HTML');
      }
      await fetch(`${TELEGRAM_API}/sendPhoto`, { method: 'POST', body: form });
    } else {
      await callTelegram('sendPhoto', {
        chat_id: chatId,
        photo: photoUrlOrBase64,
        caption,
        parse_mode: 'HTML',
      });
    }
  } catch (e) {
    console.error('Error sending photo to Telegram:', e);
  }
}

// Send document (PDF file)
async function sendDocument(chatId: number | string, buffer: Buffer, filename: string, caption?: string) {
  try {
    const form = new FormData();
    form.append('chat_id', chatId.toString());
    form.append('document', new Blob([new Uint8Array(buffer)], { type: 'application/pdf' }), filename);
    if (caption) {
      form.append('caption', caption);
      form.append('parse_mode', 'HTML');
    }
    const res = await fetch(`${TELEGRAM_API}/sendDocument`, {
      method: 'POST',
      body: form,
    });
    return await res.json();
  } catch (err) {
    console.error('Error sending document to Telegram:', err);
    return null;
  }
}

// Admin sending direct message to teacher on Telegram
export async function sendTelegramMessageToTeacher(
  chatId: number,
  title: string,
  content: string,
  priority?: string,
  _adminName?: string
) {
  const priorityBadge = priority === 'urgent' ? '🚨 SHOSHILINCH' : priority === 'important' ? '⚠️ MUHIM' : '📌';
  const text =
    `<b>${priorityBadge} MA'MURIYATDAN XABAR:</b>\n\n` +
    `<b>Sarlavha:</b> ${escapeHtml(title)}\n\n` +
    `${escapeHtml(content)}\n\n` +
    `<i>Yuborilgan vaqti: ${new Date().toLocaleDateString('uz-UZ')} ${new Date().toLocaleTimeString('uz-UZ', {
      hour: '2-digit',
      minute: '2-digit',
    })}</i>`;

  return await sendMessage(chatId, text, {
    inline_keyboard: [[{ text: "🏫 Mening sinfim ma'lumotlari", callback_data: 'my_class' }]],
  });
}

function escapeHtml(text: string): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function toSafePdfText(text: string): string {
  if (!text) return '';
  return text
    .replace(/[ʻ’‘`]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[—–]/g, '-')
    .replace(/[^\x20-\x7E]/g, (ch) => {
      const map: Record<string, string> = {
        а: 'a', А: 'A', б: 'b', Б: 'B', в: 'v', В: 'V', г: 'g', Г: 'G',
        д: 'd', Д: 'D', е: 'e', Е: 'E', ё: 'yo', Ё: 'Yo', ж: 'j', Ж: 'J',
        з: 'z', З: 'Z', и: 'i', И: 'I', й: 'y', Й: 'Y', к: 'k', К: 'K',
        л: 'l', Л: 'L', м: 'm', М: 'M', н: 'n', Н: 'N', о: 'o', О: 'O',
        п: 'p', П: 'P', р: 'r', Р: 'R', с: 's', С: 'S', т: 't', Т: 'T',
        у: 'u', У: 'U', ф: 'f', Ф: 'F', х: 'x', Х: 'X', ц: 'ts', Ц: 'Ts',
        ч: 'ch', Ч: 'Ch', ш: 'sh', Ш: 'Sh', щ: 'sh', Щ: 'Sh', ъ: "'", Ъ: "'",
        ы: 'i', Ы: 'I', ь: '', Ь: '', э: 'e', Э: 'E', ю: 'yu', Ю: 'Yu',
        я: 'ya', Я: 'Ya', ў: "o'", Ў: "O'", қ: 'q', Қ: 'Q', ғ: "g'", Ғ: "G'",
        ҳ: 'h', Ҳ: 'H',
      };
      return map[ch] ?? '';
    });
}

// ===================== PROJECT & CLASS SELECTION PAYLOADS =====================
function buildProjectSelectionPayload(chatId: number | string) {
  const aiCount = store.classes.filter((c) => getClassTrack(c) === 'ai').length;
  const devCount = store.classes.filter((c) => getClassTrack(c) === 'developer').length;

  const existingUser = store.telegramUsers[chatId.toString()];
  const existingCls = existingUser?.classId
    ? store.classes.find((c) => c.id === existingUser.classId)
    : undefined;

  const text =
    `Assalomu alaykum, hurmatli ustoz! 👋\n\n` +
    `Sertifikatlarni kuzatish va yuklab olish botiga (<b>@Courseradan_bot</b>) xush kelibsiz.\n\n` +
    `Avval qaysi loyiha bo'yicha ishlashni tanlang:\n\n` +
    `🚀 <b>Bir Million Promter</b> (Coursera) — <i>5 000 so'm</i> • <b>${aiCount} ta sinf</b>\n` +
    `💡 <b>Besh Million AI Yetakchilari</b> (omp.aistudy.uz) — <i>7 000 so'm</i> • <b>${devCount} ta sinf</b>`;

  const inline_keyboard: any[] = [
    [{ text: `🚀 Bir Million Promter (${aiCount} sinf • 5 000 so'm)`, callback_data: 'select_project_ai' }],
    [
      {
        text: `💡 Besh Million AI Yetakchilari (${devCount} sinf • 7 000 so'm)`,
        callback_data: 'select_project_developer',
      },
    ],
  ];

  if (existingCls) {
    const meta = getTrackMeta(getClassTrack(existingCls));
    inline_keyboard.push([
      {
        text: `📌 Mening sinfim: ${existingCls.name} (${meta.shortName})`,
        callback_data: 'my_class',
      },
    ]);
  }

  return { text, reply_markup: { inline_keyboard } };
}

function buildClassListForProjectPayload(track: ProjectTrack, page: number = 0) {
  const meta = getTrackMeta(track);
  const filtered = store.classes
    .filter((c) => getClassTrack(c) === track)
    .sort((a, b) => a.name.localeCompare(b.name, 'uz', { numeric: true, sensitivity: 'base' }));

  if (filtered.length === 0) {
    return {
      text:
        `${meta.emoji} <b>${escapeHtml(meta.fullName)}</b>\n\n` +
        `Hozircha ushbu loyiha bo'yicha tizimga sinflar kiritilmagan.`,
      reply_markup: {
        inline_keyboard: [[{ text: '⬅️ Loyihani almashtirish', callback_data: 'switch_project' }]],
      },
    };
  }

  const PAGE_SIZE = 20;
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.max(0, Math.min(page, totalPages - 1));
  const slice = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const inline_keyboard: any[] = slice.map((c) => {
    const extBadge = c.isExternalSchool ? ` [${c.schoolName || 'Boshqa maktab'}]` : '';
    const label = `🏫 ${c.name}${extBadge} — ${c.teacherName}`;
    return [
      {
        text: label.length > 58 ? label.slice(0, 55) + '...' : label,
        callback_data: `select_teacher_${c.id}`,
      },
    ];
  });

  if (totalPages > 1) {
    const navRow: any[] = [];
    if (safePage > 0) {
      navRow.push({ text: '⬅️ Oldingi', callback_data: `select_project_${track}_p_${safePage - 1}` });
    }
    navRow.push({ text: `${safePage + 1} / ${totalPages}`, callback_data: 'noop' });
    if (safePage < totalPages - 1) {
      navRow.push({ text: 'Keyingi ➡️', callback_data: `select_project_${track}_p_${safePage + 1}` });
    }
    inline_keyboard.push(navRow);
  }

  inline_keyboard.push([{ text: '⬅️ Loyihani almashtirish', callback_data: 'switch_project' }]);

  const text =
    `${meta.emoji} <b>${escapeHtml(meta.fullName)}</b>\n` +
    `Narx: <b>${meta.priceText} / o'quvchi</b> • Jami: <b>${filtered.length} ta sinf</b>\n\n` +
    `Quyidagi ro'yxatdan o'z sinfingiz va ism-familiyangizni tanlang:`;

  return { text, reply_markup: { inline_keyboard } };
}

// Render Teacher's Class Dashboard Text & Keyboard (Strictly Track-Isolated)
function getDashboardPayload(classGroup: ClassGroup, students: Student[]) {
  const track = getClassTrack(classGroup);
  const meta = getTrackMeta(track);
  const classStudents = students.filter((s) => s.classId === classGroup.id);
  const total = classStudents.length;

  let certified = 0;
  let errors = 0;
  let registered = 0;

  for (const st of classStudents) {
    const td = getTrackData(st, track);
    if (td.status === 'certified') {
      certified++;
    } else if (td.status === 'error' || td.hasError) {
      errors++;
    } else if (track === 'developer' && st.devRegistered) {
      registered++;
    }
  }

  const pending = Math.max(0, total - certified - errors - registered);
  const percent = total > 0 ? ((certified / total) * 100).toFixed(1) : '0';

  const unitPrice = getTrackPrice(classGroup, track);
  const totalEarned = certified * unitPrice;
  const paidAmount = getClassTrackPaid(classGroup, track);
  const remainingDebt = Math.max(0, totalEarned - paidAmount);
  const overpaid = Math.max(0, paidAmount - totalEarned);

  let paymentLine = "⏳ Hali sertifikat olinmagan";
  if (totalEarned > 0 || paidAmount > 0) {
    if (remainingDebt === 0) {
      paymentLine =
        overpaid > 0
          ? `✅ To'liq to'langan (+${fmtSum(overpaid)} so'm zaxira)`
          : "✅ To'liq to'langan";
    } else {
      paymentLine = `🔸 Qolgan qarz: <b>${fmtSum(remainingDebt)} so'm</b>`;
    }
  }

  const extTag = classGroup.isExternalSchool
    ? ` <i>(${escapeHtml(classGroup.schoolName || 'Boshqa maktab')})</i>`
    : '';

  const text =
    `${meta.emoji} <b>Loyiha:</b> ${escapeHtml(meta.fullName)}\n` +
    `🏫 <b>Sinf:</b> ${escapeHtml(classGroup.name)}${extTag}\n` +
    `👩‍🏫 <b>Sinf rahbari:</b> ${escapeHtml(classGroup.teacherName)}\n\n` +
    `📊 <b>Umumiy ko'rsatkich:</b>\n` +
    `• Jami o'quvchilar: <b>${total} nafar</b>\n` +
    `• 🟢 Sertifikat olganlar: <b>${certified} ta (${percent}%)</b>\n` +
    (track === 'developer' ? `• 📝 Ro'yxatdan o'tganlar: <b>${registered} ta</b>\n` : '') +
    `• 🔴 Muammoli/xatoliklar: <b>${errors} ta</b>\n` +
    `• ⚪️ Kutilayotganlar: <b>${pending} ta</b>\n\n` +
    `💰 <b>To'lov hisoboti (${fmtSum(unitPrice)} so'm):</b>\n` +
    `• Jami hisob: <b>${fmtSum(totalEarned)} so'm</b>\n` +
    `• To'langan: <b>${fmtSum(paidAmount)} so'm</b>\n` +
    `• Holat: ${paymentLine}\n\n` +
    `<i>Barcha ma'lumotlar real vaqt rejimida yangilanadi.</i>`;

  const inline_keyboard: any[] = [
    [{ text: `📋 O'quvchilar ro'yxati (${total})`, callback_data: `list_students_${classGroup.id}` }],
    ...(track === 'developer' && registered > 0
      ? [[{ text: `📝 Ro'yxatdan o'tganlar (${registered} ta)`, callback_data: `list_registered_${classGroup.id}` }]]
      : []),
    ...(errors > 0
      ? [[{ text: `⚠️ Xatolik chiqqanlar (${errors} ta)`, callback_data: `list_errors_${classGroup.id}` }]]
      : []),
    [{ text: `📲 Telegram uchun nusxalash (${certified} ta)`, callback_data: `copy_certs_${classGroup.id}` }],
    [{ text: `📥 Yagona PDF sertifikatlar to'plami`, callback_data: `download_pdf_${classGroup.id}` }],
    [
      { text: `🔄 Yangilash`, callback_data: `refresh_class_${classGroup.id}` },
      { text: `🔄 Sinf / Loyiha`, callback_data: `switch_project` },
    ],
  ];

  return { text, reply_markup: { inline_keyboard } };
}

// Low-level helper to fetch the real certificate image with disk caching
async function fetchRealCertificateImage(certificateLink: string): Promise<Buffer | null> {
  if (!certificateLink || typeof certificateLink !== 'string') return null;
  const trimmed = certificateLink.trim();
  if (trimmed.length < 5) return null;

  // 1. Check disk cache first for 0ms instant retrieval
  const cacheKey = crypto.createHash('md5').update(trimmed).digest('hex');
  const cachePath = path.join(CERT_CACHE_DIR, `${cacheKey}.jpg`);
  if (fs.existsSync(cachePath)) {
    try {
      const cachedBuf = fs.readFileSync(cachePath);
      if (cachedBuf.length > 5000) {
        return cachedBuf;
      }
    } catch {}
  }

  // 2. If already base64 image
  if (trimmed.startsWith('data:image/')) {
    const parts = trimmed.split(',');
    const buf = Buffer.from(parts[1], 'base64');
    try {
      fs.writeFileSync(cachePath, buf);
    } catch {}
    return buf;
  }

  // 3. Fetch from Coursera or omp.aistudy.uz with retry
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(trimmed, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        },
        signal: AbortSignal.timeout(12000),
      });

      if (res.ok) {
        const contentType = res.headers.get('content-type') || '';
        if (contentType.startsWith('image/')) {
          const arr = await res.arrayBuffer();
          const buf = Buffer.from(arr);
          if (buf.length > 5000) {
            try {
              fs.writeFileSync(cachePath, buf);
            } catch {}
            return buf;
          }
        }

        const html = await res.text();
        let targetImgUrl: string | null = null;

        // A. Extract official Coursera accomplishment ID directly from page HTML
        const landingPageMatch = html.match(/CERTIFICATE_LANDING_PAGE~([A-Za-z0-9]+)/);
        if (landingPageMatch && landingPageMatch[1]) {
          targetImgUrl = `https://s3.amazonaws.com/coursera_assets/meta_images/generated/CERTIFICATE_LANDING_PAGE/CERTIFICATE_LANDING_PAGE~${landingPageMatch[1]}/CERTIFICATE_LANDING_PAGE~${landingPageMatch[1]}.jpeg`;
        }

        // B. og:image or twitter:image
        if (!targetImgUrl) {
          const ogMatch =
            html.match(
              /<meta[^>]*(?:property|name)=["'](?:og:image|twitter:image(?::src)?)["'][^>]*content=["']([^"']+)["']/i
            ) ||
            html.match(
              /<meta[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["'](?:og:image|twitter:image(?::src)?)["']/i
            );
          if (ogMatch && ogMatch[1] && !ogMatch[1].includes('Grid_Coursera_Partners')) {
            targetImgUrl = ogMatch[1].replace(/&amp;/g, '&');
          }
        }

        // C. Direct <img> tag for CERTIFICATE_LANDING_PAGE
        if (!targetImgUrl) {
          const imgMatch = html.match(
            /<img[^>]+src=["'](https:\/\/[^"']+coursera_assets[^"']+CERTIFICATE_LANDING_PAGE[^"']+)["']/i
          );
          if (imgMatch) targetImgUrl = imgMatch[1].replace(/&amp;/g, '&');
        }

        // D. Fallback id pattern in URL (e.g. verify/ABC123XYZ)
        if (!targetImgUrl) {
          const idMatch = trimmed.match(/verify\/([A-Za-z0-9]+)/);
          if (idMatch && idMatch[1]) {
            targetImgUrl = `https://s3.amazonaws.com/coursera_assets/meta_images/generated/CERTIFICATE_LANDING_PAGE/CERTIFICATE_LANDING_PAGE~${idMatch[1]}/CERTIFICATE_LANDING_PAGE~${idMatch[1]}.jpeg`;
          }
        }

        if (targetImgUrl) {
          const imgRes = await fetch(targetImgUrl, { signal: AbortSignal.timeout(10000) });
          if (imgRes.ok) {
            const arr = await imgRes.arrayBuffer();
            const buf = Buffer.from(arr);
            if (buf.length > 5000) {
              try {
                fs.writeFileSync(cachePath, buf);
              } catch {}
              return buf;
            }
          }
        }
      }
    } catch (err: any) {
      console.warn(`[Telegram PDF] Attempt ${attempt} fetching certificate from ${trimmed}:`, err.message);
    }
  }

  // Final fallback: check direct ID in URL for Coursera verify links
  const idMatch = trimmed.match(/verify\/([A-Za-z0-9]+)/);
  if (idMatch && idMatch[1]) {
    try {
      const s3Url = `https://s3.amazonaws.com/coursera_assets/meta_images/generated/CERTIFICATE_LANDING_PAGE/CERTIFICATE_LANDING_PAGE~${idMatch[1]}/CERTIFICATE_LANDING_PAGE~${idMatch[1]}.jpeg`;
      const s3Res = await fetch(s3Url, { signal: AbortSignal.timeout(8000) });
      if (s3Res.ok) {
        const arr = await s3Res.arrayBuffer();
        const buf = Buffer.from(arr);
        if (buf.length > 5000) {
          try {
            fs.writeFileSync(cachePath, buf);
          } catch {}
          return buf;
        }
      }
    } catch {}
  }

  return null;
}

// Generate the unified multi-page PDF on server for Telegram delivery (Track-Isolated)
async function buildUnifiedClassPdf(classGroup: ClassGroup, students: Student[]): Promise<Buffer> {
  const track = getClassTrack(classGroup);
  const certifiedItems = students
    .filter((s) => s.classId === classGroup.id)
    .map((s) => ({ student: s, td: getTrackData(s, track) }))
    .filter((item) => item.td.status === 'certified')
    .sort((a, b) => a.student.fullName.localeCompare(b.student.fullName, 'uz'));

  const total = certifiedItems.length;

  // Pre-fetch all real certificate images in parallel batches (5 at a time)
  const imageBuffers: (Buffer | null)[] = new Array(total).fill(null);
  const BATCH_SIZE = 5;
  for (let b = 0; b < total; b += BATCH_SIZE) {
    const chunk = certifiedItems.slice(b, b + BATCH_SIZE);
    const chunkBuffers = await Promise.all(
      chunk.map((item) => fetchRealCertificateImage(item.td.certificateLink || ''))
    );
    for (let j = 0; j < chunkBuffers.length; j++) {
      imageBuffers[b + j] = chunkBuffers[j];
    }
  }

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const defaultVerifyUrl = track === 'developer' ? 'https://omp.aistudy.uz' : 'https://coursera.org/verify';
  const mainTitle =
    track === 'developer' ? "BESH MILLION SUN'IY INTELLEKT YETAKCHILARI" : 'BIR MILLION PROMTER';
  const subTitle =
    track === 'developer' ? 'OMP.AISTUDY.UZ RASMIY SERTIFIKATI' : 'XALQARO COURSERA SERTIFIKATI';

  for (let i = 0; i < total; i++) {
    const { student, td } = certifiedItems[i];
    if (i > 0) doc.addPage('a4', 'landscape');

    // Header banner
    doc.setFillColor(15, 23, 42); // slate-900
    doc.rect(0, 0, 297, 16, 'F');
    doc.setFillColor(track === 'developer' ? 16 : 245, track === 'developer' ? 185 : 158, track === 'developer' ? 129 : 11);
    doc.rect(0, 16, 297, 1.2, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(toSafePdfText(`${i + 1}. ${student.fullName}`), 12, 11);

    doc.setTextColor(251, 191, 36); // amber-400
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(toSafePdfText(`${classGroup.name} sinfi | Sinf rahbari: ${classGroup.teacherName}`), 285, 11, {
      align: 'right',
    });

    const imgBuffer = imageBuffers[i];
    const imageX = 15;
    const imageY = 22;
    const imageW = 267;
    const imageH = 172;

    if (imgBuffer && imgBuffer.length > 5000) {
      const base64 = `data:image/jpeg;base64,${imgBuffer.toString('base64')}`;
      try {
        doc.addImage(base64, 'JPEG', imageX, imageY, imageW, imageH, undefined, 'FAST');
      } catch (err) {
        console.warn('Error adding image to doc:', err);
      }
    } else {
      // Fallback clean canvas-like certificate placeholder
      doc.setFillColor(248, 250, 252);
      doc.rect(imageX, imageY, imageW, imageH, 'F');
      doc.setDrawColor(203, 213, 225);
      doc.rect(imageX, imageY, imageW, imageH, 'D');

      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(20);
      doc.text(mainTitle, 148, 78, { align: 'center' });

      doc.setFontSize(14);
      doc.setTextColor(51, 65, 85);
      doc.text(subTitle, 148, 94, { align: 'center' });

      doc.setFontSize(20);
      doc.setTextColor(16, 185, 129);
      doc.text(toSafePdfText(student.fullName), 148, 120, { align: 'center' });

      doc.setFontSize(11);
      doc.setTextColor(100, 116, 139);
      doc.text(
        toSafePdfText(`Elektron tekshiruv: ${td.certificateLink || defaultVerifyUrl}`),
        148,
        145,
        { align: 'center' }
      );
    }

    // Footer
    doc.setFillColor(248, 250, 252);
    doc.rect(0, 199, 297, 11, 'F');
    doc.setTextColor(71, 85, 105);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    const linkStr = td.certificateLink || defaultVerifyUrl;
    doc.text(
      toSafePdfText(`Elektron tasdiq: ${linkStr.length > 90 ? linkStr.slice(0, 87) + '...' : linkStr}`),
      12,
      206
    );

    doc.setTextColor(30, 41, 59);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(`Sahifa ${i + 1} / ${total}`, 285, 206, { align: 'right' });
  }

  return Buffer.from(doc.output('arraybuffer'));
}

// Automatically check all classes and notify teacher if 100% completed/evaluated (Track-Isolated)
export async function checkAndNotifyCompletedClasses(options?: { force?: boolean }) {
  const force = options?.force ?? false;
  const result = {
    totalClasses: store.classes.length,
    completedClasses: 0,
    notifiedCount: 0,
    alreadyNotifiedCount: 0,
    pendingClassesCount: 0,
    noTeacherClassesCount: 0,
    details: [] as string[],
  };

  for (const classGroup of store.classes) {
    const track = getClassTrack(classGroup);
    const meta = getTrackMeta(track);
    const classStudents = store.students.filter((s) => s.classId === classGroup.id);
    if (classStudents.length === 0) continue;

    let certified = 0;
    let errors = 0;
    let pending = 0;

    for (const st of classStudents) {
      const td = getTrackData(st, track);
      if (td.status === 'certified') certified++;
      else if (td.status === 'error' || td.hasError) errors++;
      else pending++;
    }

    if (pending > 0) {
      result.pendingClassesCount++;
      continue;
    }

    result.completedClasses++;

    const stateHash = `${classGroup.id}:${track}:${classStudents.length}:${certified}:${errors}`;
    if (!force && store.notifiedClasses[classGroup.id] === stateHash) {
      result.alreadyNotifiedCount++;
      result.details.push(`${classGroup.name} (avval xabar yuborilgan)`);
      continue;
    }

    // Find any telegram user for this class
    const tgUser = Object.values(store.telegramUsers).find((u) => u.classId === classGroup.id);
    if (!tgUser) {
      result.noTeacherClassesCount++;
      result.details.push(`${classGroup.name} (Telegram botga sinf rahbari ulanmagan)`);
      continue;
    }

    const notifyText =
      `🔔 <b>Hurmatli ustoz sizning sinfingizga to'liq sertifikatlar olib bo'lindi, iltimos tekshirishingizni so'rayman.</b>\n\n` +
      `${meta.emoji} <b>Loyiha:</b> ${escapeHtml(meta.fullName)}\n` +
      `🏫 <b>Sinf:</b> ${escapeHtml(classGroup.name)}\n` +
      `📊 <b>Jami o'quvchilar:</b> ${classStudents.length} nafar\n` +
      `🟢 <b>Sertifikat olganlar:</b> ${certified} ta\n` +
      `🔴 <b>Xatolik/muammo chiqqanlar:</b> ${errors} ta\n\n` +
      `Natijalarni to'liq tekshirish uchun quyidagi tugmani bosing:`;

    const replyMarkup = {
      inline_keyboard: [
        [
          { text: '📋 Tekshirish', callback_data: `verify_class_${classGroup.id}` },
          { text: "✖️ E'tiborsiz qoldirish", callback_data: `dismiss_notify_${classGroup.id}` },
        ],
      ],
    };

    const sent = await sendMessage(tgUser.chatId, notifyText, replyMarkup);
    if (sent && sent.ok) {
      store.notifiedClasses[classGroup.id] = stateHash;
      saveStore();
      result.notifiedCount++;
      result.details.push(`${classGroup.name} (${tgUser.teacherName || tgUser.firstName} ga jo'natildi)`);
    } else {
      result.details.push(`${classGroup.name} (Telegram xabar yuborishda xatolik)`);
    }
  }

  return result;
}

// Telegram Bot Polling Loop
let isPolling = false;
let updateOffset = 0;

export function stopTelegramBot() {
  isPolling = false;
  console.log('🛑 [Telegram Bot] Bot polling stopped gracefully.');
}

export async function startTelegramBot() {
  if (isPolling) return;

  // Before starting Long-Polling, check if a remote Webhook is already set
  try {
    const info = await getTelegramWebhookInfo();
    if (info?.result?.url) {
      console.log(
        `ℹ️ [Telegram Bot] Remote Webhook active at: ${info.result.url}. Long-polling paused to avoid conflict.`
      );
      return;
    } else {
      await deleteTelegramWebhookDirect();
    }
  } catch (err: any) {
    console.log('[Telegram Bot] Webhook initial check notice:', err.message);
  }

  isPolling = true;
  console.log('🤖 Telegram Bot polling service started for @Courseradan_bot');

  let consecutive409Count = 0;
  let consecutiveNetworkErrors = 0;

  const poll = async () => {
    while (isPolling) {
      try {
        const res = await fetch(`${TELEGRAM_API}/getUpdates?offset=${updateOffset}&timeout=15`, {
          signal: AbortSignal.timeout(20000),
        });
        if (res.ok) {
          consecutive409Count = 0;
          consecutiveNetworkErrors = 0;
          const data: any = await res.json();
          if (data.ok && Array.isArray(data.result)) {
            for (const update of data.result) {
              updateOffset = update.update_id + 1;
              handleTelegramUpdate(update).catch((e) => console.error('Error handling Telegram update:', e));
            }
          }
        } else if (res.status === 409) {
          consecutive409Count++;
          const backoffSec = Math.min(30, 5 * Math.min(consecutive409Count, 6));
          if (consecutive409Count <= 2 || consecutive409Count % 6 === 0) {
            console.log(
              `[Telegram Bot] 409 Conflict: another instance is active. Standing by (backoff ${backoffSec}s)...`
            );
          }
          if (consecutive409Count === 3) {
            try {
              await deleteTelegramWebhookDirect();
            } catch {}
          }
          await new Promise((r) => setTimeout(r, backoffSec * 1000));
        } else {
          consecutive409Count = 0;
          consecutiveNetworkErrors = 0;
          await new Promise((r) => setTimeout(r, 2000));
        }
      } catch (err: any) {
        consecutiveNetworkErrors++;
        const isTransient =
          err?.name === 'TimeoutError' ||
          err?.name === 'AbortError' ||
          err?.cause?.name === 'TimeoutError' ||
          err?.cause?.name === 'AbortError' ||
          (err?.message &&
            (err.message.includes('fetch failed') ||
              err.message.includes('aborted') ||
              err.message.includes('network'))) ||
          err?.code === 'ECONNRESET' ||
          err?.code === 'ETIMEDOUT' ||
          err?.code === 'UND_ERR_SOCKET' ||
          err?.code === 'EAI_AGAIN';

        if (!isTransient) {
          console.log('[Telegram Bot] Polling notice:', err?.message || err);
        }

        const backoffMs = Math.min(10000, 2000 * Math.min(consecutiveNetworkErrors, 5));
        await new Promise((r) => setTimeout(r, backoffMs));
      }
    }
  };

  poll().catch((e) => console.error('Telegram polling loop exited:', e));
}

// Low-level delete webhook without triggering recursive polling start
async function deleteTelegramWebhookDirect() {
  try {
    const res = await fetch(`${TELEGRAM_API}/deleteWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ drop_pending_updates: false }),
    });
    return await res.json();
  } catch (err: any) {
    return { ok: false, description: err.message };
  }
}

// Dispatch incoming message or callback query
async function handleTelegramUpdate(update: any) {
  // 1. Text message handler
  if (update.message) {
    const msg = update.message;
    const chatId = msg.chat?.id;
    const text = (msg.text || '').trim();

    if (!chatId) return;

    if (text.startsWith('/start') || text.startsWith('/boshlash')) {
      await ensureFreshFirestoreData();
      if (store.classes.length === 0) {
        await sendMessage(
          chatId,
          `Assalomu alaykum, hurmatli ustoz! 👋\n\n` +
            `Hozircha tizimga sinflar kiritilmagan. Maktab ma'muriyati hujjatni yuklagandan so'ng sinflar ro'yxati shu yerda paydo bo'ladi.`
        );
        return;
      }

      const projectPrompt = buildProjectSelectionPayload(chatId);
      await sendMessage(chatId, projectPrompt.text, projectPrompt.reply_markup);
      return;
    }

    if (text === '/meningsinfim' || text === '/info') {
      await ensureFreshFirestoreData();
      const user = store.telegramUsers[chatId.toString()];
      if (user && user.classId) {
        const cls = store.classes.find((c) => c.id === user.classId);
        if (cls) {
          const payload = getDashboardPayload(cls, store.students);
          await sendMessage(chatId, payload.text, payload.reply_markup);
          return;
        }
      }
      const projectPrompt = buildProjectSelectionPayload(chatId);
      await sendMessage(chatId, projectPrompt.text, projectPrompt.reply_markup);
      return;
    }

    // Default reply
    await ensureFreshFirestoreData();
    const user = store.telegramUsers[chatId.toString()];
    if (user && user.classId) {
      const cls = store.classes.find((c) => c.id === user.classId);
      if (cls) {
        const payload = getDashboardPayload(cls, store.students);
        await sendMessage(chatId, payload.text, payload.reply_markup);
        return;
      }
    }

    await sendMessage(chatId, `Assalomu alaykum! Tizimdan foydalanish uchun /start buyrug'ini bosing.`);
    return;
  }

  // 2. Callback query handler (button clicks)
  if (update.callback_query) {
    const cb = update.callback_query;
    const chatId = cb.message?.chat?.id;
    const messageId = cb.message?.message_id;
    const data = cb.data || '';
    const from = cb.from;

    if (!chatId) return;

    if (data === 'noop') {
      await answerCallbackQuery(cb.id);
      return;
    }

    // 0. Project-first menu (also handles legacy 'switch_class' buttons)
    if (data === 'switch_project' || data === 'switch_class') {
      await ensureFreshFirestoreData();
      await answerCallbackQuery(cb.id);
      const projectPrompt = buildProjectSelectionPayload(chatId);
      await deliverOrEditMessage(chatId, messageId, projectPrompt.text, projectPrompt.reply_markup);
      return;
    }

    // 0b. Project selected -> list ONLY classes for that project (with optional pagination)
    if (data.startsWith('select_project_')) {
      await ensureFreshFirestoreData();
      let track: ProjectTrack = 'ai';
      let page = 0;

      const pageMatch = data.match(/^select_project_(ai|developer)_p_(\d+)$/);
      if (pageMatch) {
        track = pageMatch[1] as ProjectTrack;
        page = parseInt(pageMatch[2], 10) || 0;
      } else if (data === 'select_project_developer') {
        track = 'developer';
      } else {
        track = 'ai';
      }

      await answerCallbackQuery(cb.id);
      const listPayload = buildClassListForProjectPayload(track, page);
      await deliverOrEditMessage(chatId, messageId, listPayload.text, listPayload.reply_markup);
      return;
    }

    // A. Select teacher / class -> IMMEDIATELY deliver full class dashboard
    if (data.startsWith('select_teacher_')) {
      const classId = data.replace('select_teacher_', '');
      await ensureFreshFirestoreData();

      const cls = store.classes.find((c) => c.id === classId);
      if (!cls) {
        await answerCallbackQuery(cb.id, 'Sinf topilmadi. Iltimos loyihani qayta tanlang.', true);
        const projectPrompt = buildProjectSelectionPayload(chatId);
        await deliverOrEditMessage(chatId, messageId, projectPrompt.text, projectPrompt.reply_markup);
        return;
      }

      const track = getClassTrack(cls);
      const meta = getTrackMeta(track);

      // Record Telegram user with projectType
      const tgUserObj: TelegramUser = {
        id: chatId.toString(),
        chatId,
        teacherName: cls.teacherName,
        classId: cls.id,
        className: cls.name,
        projectType: track,
        username: from?.username ? `@${from.username}` : undefined,
        firstName: from?.first_name,
        lastName: from?.last_name,
        lastActiveAt: new Date().toISOString(),
        createdAt: store.telegramUsers[chatId.toString()]?.createdAt || new Date().toISOString(),
      };
      store.telegramUsers[chatId.toString()] = tgUserObj;
      saveStore();

      if (firestoreDb) {
        setDoc(doc(firestoreDb, 'telegramUsers', chatId.toString()), tgUserObj, { merge: true }).catch((e) => {
          console.log('Firestore telegramUsers save notice:', e.message);
        });
      }

      await answerCallbackQuery(cb.id, `✅ ${cls.name} (${meta.shortName}) tanlandi!`);

      const payload = getDashboardPayload(cls, store.students);
      await deliverOrEditMessage(chatId, messageId, payload.text, payload.reply_markup);
      return;
    }

    // C. My class / Refresh dashboard
    if (data === 'my_class' || data.startsWith('refresh_class_')) {
      await ensureFreshFirestoreData();
      const classId = data.startsWith('refresh_class_')
        ? data.replace('refresh_class_', '')
        : store.telegramUsers[chatId.toString()]?.classId;

      const cls = store.classes.find((c) => c.id === classId);
      if (cls) {
        if (store.telegramUsers[chatId.toString()]) {
          store.telegramUsers[chatId.toString()].lastActiveAt = new Date().toISOString();
          store.telegramUsers[chatId.toString()].projectType = getClassTrack(cls);
          saveStore();
          if (firestoreDb) {
            setDoc(
              doc(firestoreDb, 'telegramUsers', chatId.toString()),
              store.telegramUsers[chatId.toString()],
              { merge: true }
            ).catch(() => {});
          }
        }
        await answerCallbackQuery(cb.id, "Real-vaqt ma'lumotlari yangilandi 🔄");
        const payload = getDashboardPayload(cls, store.students);
        await deliverOrEditMessage(chatId, messageId, payload.text, payload.reply_markup);
      } else {
        await answerCallbackQuery(cb.id, 'Sinf topilmadi');
        const projectPrompt = buildProjectSelectionPayload(chatId);
        await deliverOrEditMessage(chatId, messageId, projectPrompt.text, projectPrompt.reply_markup);
      }
      return;
    }

    // C2. Copy all certificates formatted for Telegram ("Telegram uchun nusxalash")
    if (data.startsWith('copy_certs_')) {
      const classId = data.replace('copy_certs_', '');
      await ensureFreshFirestoreData();

      const cls = store.classes.find((c) => c.id === classId);
      if (!cls) {
        await answerCallbackQuery(cb.id, 'Sinf topilmadi', true);
        return;
      }

      const track = getClassTrack(cls);
      const meta = getTrackMeta(track);
      const certifiedItems = store.students
        .filter((s) => s.classId === cls.id)
        .map((s) => ({ student: s, td: getTrackData(s, track) }))
        .filter((item) => item.td.status === 'certified')
        .sort((a, b) => a.student.fullName.trim().localeCompare(b.student.fullName.trim(), 'uz', { sensitivity: 'base' }));

      if (certifiedItems.length === 0) {
        await answerCallbackQuery(cb.id, "Ushbu sinfda hali sertifikat olgan o'quvchilar yo'q!", true);
        return;
      }

      await answerCallbackQuery(cb.id, "📋 Nusxalash uchun tayyor ro'yxat yuborildi!");

      const headerPlain =
        `🎓 ${cls.name} sinf o'quvchilarining "${meta.copyTitle}" sertifikatlari ro'yxati:\n` +
        `👩‍🏫 Sinf rahbari: ${cls.teacherName}\n` +
        `📊 Jami sertifikat olganlar: ${certifiedItems.length} nafar\n\n`;

      const itemBlocks = certifiedItems.map(({ student, td }, idx) => {
        return `${idx + 1}. ${student.fullName}\n   🔗 Havola: ${td.certificateLink || 'Mavjud emas'}\n`;
      });

      // Split into copy-ready <pre> chunks so each block stays safely under Telegram's 4096 char limit
      const rawChunks: string[] = [];
      let currentPlain = headerPlain;
      for (const block of itemBlocks) {
        if (escapeHtml(currentPlain + block).length > 3350) {
          rawChunks.push(currentPlain.trimEnd());
          currentPlain = '';
        }
        currentPlain += block;
      }
      if (currentPlain.trim().length > 0) {
        rawChunks.push(currentPlain.trimEnd());
      }

      for (let i = 0; i < rawChunks.length; i++) {
        const isLast = i === rawChunks.length - 1;
        const preBlock = `<pre>${escapeHtml(rawChunks[i])}</pre>`;
        const footerTip = isLast
          ? `\n\n👆 <i>Yuqoridagi matn ustiga bir marta bosing — avtomatik nusxalanadi va Telegram guruhingizga tashlashingiz mumkin!</i>`
          : `\n\n<i>(${i + 1}/${rawChunks.length}-qism — davomi pastda)</i>`;

        await sendMessage(
          chatId,
          `${preBlock}${footerTip}`,
          isLast
            ? { inline_keyboard: [[{ text: '🔙 Sinf menyusiga qaytish', callback_data: `refresh_class_${cls.id}` }]] }
            : undefined,
          { disableWebPagePreview: true }
        );
      }
      return;
    }

    // D. List students in class (Track-Isolated + Chunked)
    if (data.startsWith('list_students_')) {
      const classId = data.replace('list_students_', '');
      await ensureFreshFirestoreData();
      const cls = store.classes.find((c) => c.id === classId);
      if (!cls) {
        await answerCallbackQuery(cb.id, 'Sinf topilmadi');
        return;
      }

      await answerCallbackQuery(cb.id);
      const track = getClassTrack(cls);
      const meta = getTrackMeta(track);
      const classStudents = store.students
        .filter((s) => s.classId === cls.id)
        .sort((a, b) => a.fullName.localeCompare(b.fullName, 'uz'));

      const certified: Student[] = [];
      const errors: Student[] = [];
      const registered: Student[] = [];
      const pending: Student[] = [];

      for (const st of classStudents) {
        const td = getTrackData(st, track);
        if (td.status === 'certified') certified.push(st);
        else if (td.status === 'error' || td.hasError) errors.push(st);
        else if (track === 'developer' && st.devRegistered) registered.push(st);
        else pending.push(st);
      }

      const headerHtml =
        `📋 <b>${escapeHtml(cls.name)} sinfi o'quvchilari holati</b> (${meta.emoji} ${escapeHtml(meta.shortName)}):\n\n`;

      const lines: string[] = [];
      if (certified.length > 0) {
        lines.push(`<b>🟢 Sertifikat olganlar (${certified.length} ta):</b>\n`);
        certified.forEach((st, idx) => {
          lines.push(`${idx + 1}. ${escapeHtml(st.fullName)} — ✅ Tasdiqlangan\n`);
        });
        lines.push(`\n`);
      }

      if (registered.length > 0) {
        lines.push(`<b>📝 Ro'yxatdan o'tganlar (${registered.length} ta):</b>\n`);
        registered.forEach((st, idx) => {
          const loginTag = st.assignedLogin ? ` (<code>${escapeHtml(st.assignedLogin)}</code>)` : '';
          lines.push(`${idx + 1}. ${escapeHtml(st.fullName)}${loginTag} — 📝 Tayyorlanmoqda\n`);
        });
        lines.push(`\n`);
      }

      if (errors.length > 0) {
        lines.push(`<b>🔴 Xatolik chiqqanlar (${errors.length} ta):</b>\n`);
        errors.forEach((st, idx) => {
          lines.push(`${idx + 1}. ${escapeHtml(st.fullName)} — ⚠️ Xatolik\n`);
        });
        lines.push(`\n`);
      }

      if (pending.length > 0) {
        lines.push(`<b>⚪️ Kutilayotganlar (${pending.length} ta):</b>\n`);
        pending.forEach((st, idx) => {
          lines.push(`${idx + 1}. ${escapeHtml(st.fullName)} — ⏳ Kutilmoqda\n`);
        });
      }

      if (lines.length === 0) {
        lines.push(`<i>Hozircha bu sinfda o'quvchilar ro'yxati bo'sh.</i>`);
      }

      const buttons: any[] = [];
      if (certified.length > 0) {
        buttons.push([{ text: `📲 Telegram uchun nusxalash (${certified.length} ta)`, callback_data: `copy_certs_${cls.id}` }]);
      }
      if (errors.length > 0) {
        buttons.push([{ text: `⚠️ Xatoliklar sababini ko'rish`, callback_data: `list_errors_${cls.id}` }]);
      }
      buttons.push([{ text: `🔙 Asosiy sahifaga qaytish`, callback_data: `refresh_class_${cls.id}` }]);

      await sendLongHtmlMessage(chatId, messageId, headerHtml, lines, '', { inline_keyboard: buttons });
      return;
    }

    // D2. List registered students (5M Developer Track)
    if (data.startsWith('list_registered_')) {
      const classId = data.replace('list_registered_', '');
      await ensureFreshFirestoreData();
      const cls = store.classes.find((c) => c.id === classId);
      if (!cls) {
        await answerCallbackQuery(cb.id, 'Sinf topilmadi');
        return;
      }

      await answerCallbackQuery(cb.id);
      const track = getClassTrack(cls);
      const registered = store.students
        .filter((s) => {
          if (s.classId !== cls.id) return false;
          const td = getTrackData(s, track);
          return td.status === 'pending' && !td.hasError && Boolean(s.devRegistered);
        })
        .sort((a, b) => a.fullName.localeCompare(b.fullName, 'uz'));

      const headerHtml = `📝 <b>${escapeHtml(cls.name)} sinfi — Ro'yxatdan o'tgan o'quvchilar (${registered.length} ta):</b>\n\n`;
      const lines =
        registered.length > 0
          ? registered.map((st, idx) => {
              const loginPart = st.assignedLogin ? ` • Login: <code>${escapeHtml(st.assignedLogin)}</code>` : '';
              return `${idx + 1}. ${escapeHtml(st.fullName)}${loginPart}\n`;
            })
          : ["<i>Hozircha ro'yxatdan o'tib sertifikat kutayotgan o'quvchilar yo'q.</i>"];

      const footerHtml = `\n<i>Ushbu o'quvchilar platformada ro'yxatdan o'tgan, tez orada sertifikatlari tayyorlanadi.</i>`;
      await sendLongHtmlMessage(chatId, messageId, headerHtml, lines, footerHtml, {
        inline_keyboard: [[{ text: '🔙 Asosiy sahifaga qaytish', callback_data: `refresh_class_${cls.id}` }]],
      });
      return;
    }

    // E. List errors (Track-Isolated)
    if (data.startsWith('list_errors_')) {
      const classId = data.replace('list_errors_', '');
      await ensureFreshFirestoreData();
      const cls = store.classes.find((c) => c.id === classId);
      if (!cls) {
        await answerCallbackQuery(cb.id, 'Sinf topilmadi');
        return;
      }

      const track = getClassTrack(cls);
      const errors = store.students.filter((s) => {
        if (s.classId !== cls.id) return false;
        const td = getTrackData(s, track);
        return td.status === 'error' || td.hasError;
      });
      await answerCallbackQuery(cb.id);

      if (errors.length === 0) {
        const text = `🎉 <b>${escapeHtml(cls.name)} sinfida hech qanday xatolik yo'q!</b>\nBarcha ma'lumotlar to'g'ri.`;
        await deliverOrEditMessage(chatId, messageId, text, {
          inline_keyboard: [[{ text: '🔙 Asosiy sahifaga qaytish', callback_data: `refresh_class_${cls.id}` }]],
        });
        return;
      }

      const text =
        `⚠️ <b>${escapeHtml(cls.name)} sinfidagi muammoli o'quvchilar (${errors.length} ta):</b>\n\n` +
        `Quyidagi o'quvchilardan birini tanlab, uning muammo sababi va asos skrinshotini ko'rishingiz mumkin:\n`;

      const buttons = errors.slice(0, 45).map((st) => [
        {
          text: `🔴 ${st.fullName.length > 28 ? st.fullName.slice(0, 25) + '...' : st.fullName}`,
          callback_data: `error_detail_${st.id}`,
        },
      ]);

      buttons.push([{ text: `🔙 Asosiy sahifaga qaytish`, callback_data: `refresh_class_${cls.id}` }]);
      await deliverOrEditMessage(chatId, messageId, text, { inline_keyboard: buttons });
      return;
    }

    // F. Error details for a single student (Track-Isolated)
    if (data.startsWith('error_detail_')) {
      const studentId = data.replace('error_detail_', '');
      await ensureFreshFirestoreData();
      const student = store.students.find((s) => s.id === studentId);
      if (!student) {
        await answerCallbackQuery(cb.id, "O'quvchi topilmadi");
        return;
      }

      const cls = store.classes.find((c) => c.id === student.classId);
      const track: ProjectTrack = cls
        ? getClassTrack(cls)
        : student.projectType === 'developer'
          ? 'developer'
          : 'ai';
      const td = getTrackData(student, track);

      await answerCallbackQuery(cb.id);
      const defaultReason =
        track === 'developer'
          ? "O'quvchi ma'lumotlari omp.aistudy.uz tizimidagi profil bilan mos kelmadi."
          : "O'quvchi ma'lumotlari Coursera bazasidagi profil bilan mos kelmadi.";

      const text =
        `❌ <b>O'quvchi ma'lumotlaridagi muammo:</b>\n\n` +
        `👤 <b>F.I.SH:</b> ${escapeHtml(student.fullName)}\n` +
        `📝 <b>Mas'ul admin izohi:</b>\n` +
        `<i>${escapeHtml(td.errorReason || defaultReason)}</i>`;

      const buttons = [
        [{ text: `🔙 Xatoliklar ro'yxatiga qaytish`, callback_data: `list_errors_${student.classId}` }],
        [{ text: `🔙 Asosiy menyu`, callback_data: `refresh_class_${student.classId}` }],
      ];

      if (td.errorImage) {
        await sendPhoto(chatId, td.errorImage, text);
        await sendMessage(chatId, `Yuqoridagi holat bo'yicha ma'lumot. Boshqa menyularga o'tish uchun:`, {
          inline_keyboard: buttons,
        });
      } else {
        await deliverOrEditMessage(chatId, messageId, text, { inline_keyboard: buttons });
      }
      return;
    }

    // G. Download Unified Multi-Page PDF (Track-Isolated)
    if (data.startsWith('download_pdf_')) {
      const classId = data.replace('download_pdf_', '');
      await ensureFreshFirestoreData();
      const cls = store.classes.find((c) => c.id === classId);
      if (!cls) {
        await answerCallbackQuery(cb.id, 'Sinf topilmadi');
        return;
      }

      const track = getClassTrack(cls);
      const meta = getTrackMeta(track);
      const certified = store.students.filter(
        (s) => s.classId === cls.id && getTrackData(s, track).status === 'certified'
      );
      if (certified.length === 0) {
        await answerCallbackQuery(cb.id, "Ushbu sinfda hali sertifikat olganlar yo'q!", true);
        return;
      }

      await answerCallbackQuery(cb.id, 'PDF tayyorlanmoqda, iltimos kuting...');

      await sendMessage(
        chatId,
        `⏳ <b>Hurmatli ustoz, ${escapeHtml(cls.name)} sinfining barcha sertifikatlari (${escapeHtml(
          meta.shortName
        )}) alifbo tartibida yagona PDF qilib tayyorlanmoqda...</b>\n\n` +
          `Bu biroz vaqt olishi mumkin, tayyor bo'lishi bilan shu yerga yuboriladi.`
      );

      try {
        const pdfBuf = await buildUnifiedClassPdf(cls, store.students);
        const safeClassName = cls.name.replace(/[^a-zA-Z0-9_\u0400-\u04FF]/g, '_');
        const filename = `${safeClassName}_sinfi_barcha_sertifikatlar_yagona_royxati.pdf`;

        const caption =
          `🎓 <b>${escapeHtml(cls.name)} sinfi ${escapeHtml(meta.shortName)} sertifikatlari to'plami (Yagona PDF)</b>\n` +
          `👩‍🏫 Sinf rahbari: ${escapeHtml(cls.teacherName)}\n` +
          `📊 Jami sertifikatlar: ${certified.length} ta\n` +
          `✅ Barcha sertifikatlar rasmiy bazadan tekshirib kiritilgan.`;

        await sendDocument(chatId, pdfBuf, filename, caption);
      } catch (err: any) {
        console.error('Error generating PDF for telegram:', err);
        await sendMessage(
          chatId,
          `❌ Kechirasiz, PDF faylni tayyorlashda xatolik yuz berdi. Iltimos qaytadan urinib ko'ring.`
        );
      }
      return;
    }

    // H. Verify class (From 100% completed automated notification, Track-Isolated + Chunked)
    if (data.startsWith('verify_class_')) {
      const classId = data.replace('verify_class_', '');
      await ensureFreshFirestoreData();
      const cls = store.classes.find((c) => c.id === classId);
      if (!cls) {
        await answerCallbackQuery(cb.id, 'Sinf topilmadi');
        return;
      }

      await answerCallbackQuery(cb.id);
      const track = getClassTrack(cls);
      const meta = getTrackMeta(track);
      const classStudents = store.students
        .filter((s) => s.classId === cls.id)
        .sort((a, b) => a.fullName.localeCompare(b.fullName, 'uz'));

      const certified = classStudents.filter((s) => getTrackData(s, track).status === 'certified');
      const errors = classStudents.filter((s) => {
        const td = getTrackData(s, track);
        return td.status === 'error' || td.hasError;
      });

      const headerHtml =
        `📋 <b>${escapeHtml(cls.name)} sinfining to'liq tekshiruv natijalari</b> (${meta.emoji} ${escapeHtml(
          meta.shortName
        )}):\n\n`;

      const lines: string[] = [];
      if (certified.length > 0) {
        lines.push(`<b>🟢 Sertifikat olgan o'quvchilar (${certified.length} ta):</b>\n`);
        certified.forEach((st, idx) => {
          lines.push(`${idx + 1}. ${escapeHtml(st.fullName)} — ✅ Tasdiqlangan\n`);
        });
        lines.push(`\n`);
      }

      if (errors.length > 0) {
        lines.push(`<b>🔴 Xatolik chiqqan o'quvchilar (${errors.length} ta):</b>\n`);
        errors.forEach((st, idx) => {
          lines.push(`${idx + 1}. ${escapeHtml(st.fullName)} — ⚠️ Xatolik\n`);
        });
        lines.push(`\n<i>Xatolik sababini ko'rish uchun pastdagi tugmalarni bosing.</i>`);
      }

      const buttons: any[] = [];
      if (errors.length > 0) {
        errors.slice(0, 30).forEach((st) => {
          buttons.push([
            {
              text: `🔴 ${st.fullName.length > 25 ? st.fullName.slice(0, 22) + '...' : st.fullName} - Sababi`,
              callback_data: `error_detail_${st.id}`,
            },
          ]);
        });
      }
      if (certified.length > 0) {
        buttons.push([{ text: `📲 Telegram uchun nusxalash (${certified.length} ta)`, callback_data: `copy_certs_${cls.id}` }]);
      }
      buttons.push([
        { text: `📥 Yagona PDF yuklab olish`, callback_data: `download_pdf_${cls.id}` },
        { text: `🔙 Asosiy sahifaga qaytish`, callback_data: `refresh_class_${cls.id}` },
      ]);

      await sendLongHtmlMessage(chatId, messageId, headerHtml, lines, '', { inline_keyboard: buttons });
      return;
    }

    // I. Dismiss auto notification
    if (data.startsWith('dismiss_notify_')) {
      await answerCallbackQuery(cb.id, 'Xabarnoma yopildi');
      await deliverOrEditMessage(
        chatId,
        messageId,
        `<i>Xabarnoma e'tiborsiz qoldirildi. Istalgan payt /start orqali tekshirishingiz mumkin.</i>`
      );
      return;
    }
  }
}

// Export webhook handler for Express route
export async function handleTelegramWebhookUpdate(update: any) {
  await handleTelegramUpdate(update);
}

// Telegram Webhook Management
export async function setTelegramWebhook(webhookUrl: string) {
  try {
    isPolling = false; // Stop long polling immediately
    const res = await fetch(`${TELEGRAM_API}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: webhookUrl, drop_pending_updates: false }),
    });
    return await res.json();
  } catch (err: any) {
    return { ok: false, description: err.message };
  }
}

export async function getTelegramWebhookInfo() {
  try {
    const res = await fetch(`${TELEGRAM_API}/getWebhookInfo`);
    return await res.json();
  } catch (err: any) {
    return { ok: false, description: err.message };
  }
}

export async function deleteTelegramWebhook() {
  try {
    const res = await fetch(`${TELEGRAM_API}/deleteWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ drop_pending_updates: false }),
    });
    const data = await res.json();
    setTimeout(() => {
      startTelegramBot();
    }, 1000);
    return data;
  } catch (err: any) {
    return { ok: false, description: err.message };
  }
}
