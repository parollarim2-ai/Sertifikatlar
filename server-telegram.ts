import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { jsPDF } from 'jspdf';
import type { ClassGroup, Student, TelegramUser } from './src/types/index.ts';

const BOT_TOKEN = '8846557313:AAE5J1aRrvJJ2LLZCbD7WlI_JFzhSrmR_tA';
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;
const DATA_FILE = path.resolve(process.cwd(), 'telegram-data.json');
const CERT_CACHE_DIR = path.resolve(process.cwd(), '.cert_cache');
try {
  if (!fs.existsSync(CERT_CACHE_DIR)) {
    fs.mkdirSync(CERT_CACHE_DIR, { recursive: true });
  }
} catch {}

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
    ensureFreshFirestoreData().then((stats) => {
      console.log(`📡 [Telegram Bot] Synchronized with Firestore: ${stats.classesCount} classes, ${stats.studentsCount} students (${stats.certifiedCount} certified)`);
    }).catch((err) => {
      console.log('Initial Firestore sync notice:', err.message);
    });

    // Periodic synchronization every 30 seconds ensures fresh data without fragile idle gRPC streams
    setInterval(async () => {
      try {
        await ensureFreshFirestoreData();
        await checkAndNotifyCompletedClasses().catch(() => {});
      } catch (err: any) {
        // Silently tolerate transient network glitches
      }
    }, 30000);
  }
} catch (e: any) {
  console.error('Failed to initialize server-side Firestore connection:', e.message);
}

// Function to guarantee freshest data on-demand from Firestore without persistent stream leaks
export async function ensureFreshFirestoreData(): Promise<{ classesCount: number; studentsCount: number; certifiedCount: number }> {
  if (!firestoreDb) {
    return {
      classesCount: store.classes.length,
      studentsCount: store.students.length,
      certifiedCount: store.students.filter(s => s.status === 'certified').length,
    };
  }

  try {
    const [classesSnap, studentsSnap, usersSnap] = await Promise.all([
      getDocs(collection(firestoreDb, 'classes')),
      getDocs(collection(firestoreDb, 'students')),
      getDocs(collection(firestoreDb, 'telegramUsers')).catch(() => null),
    ]);

    const freshClasses: ClassGroup[] = [];
    classesSnap.forEach(d => freshClasses.push(d.data() as ClassGroup));
    if (freshClasses.length > 0) {
      store.classes = freshClasses;
    }

    const freshStudents: Student[] = [];
    studentsSnap.forEach(d => freshStudents.push(d.data() as Student));
    if (freshStudents.length > 0) {
      store.students = freshStudents;
    }

    if (usersSnap) {
      usersSnap.forEach(d => {
        const u = d.data() as TelegramUser;
        if (u && u.id) {
          store.telegramUsers[u.id] = u;
        }
      });
    }

    saveStore();

    const cert = store.students.filter(s => s.status === 'certified').length;
    return {
      classesCount: store.classes.length,
      studentsCount: store.students.length,
      certifiedCount: cert,
    };
  } catch (err: any) {
    console.log('ensureFreshFirestoreData notice:', err.message);
    return {
      classesCount: store.classes.length,
      studentsCount: store.students.length,
      certifiedCount: store.students.filter(s => s.status === 'certified').length,
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

// Low-level Telegram API helper
async function callTelegram(method: string, payload: any) {
  try {
    const res = await fetch(`${TELEGRAM_API}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return await res.json();
  } catch (err) {
    console.error(`Telegram API error on ${method}:`, err);
    return null;
  }
}

// Send text message with inline keyboard
async function sendMessage(chatId: number | string, text: string, replyMarkup?: any) {
  return await callTelegram('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    reply_markup: replyMarkup,
  });
}

// Edit text message
async function editMessageText(chatId: number | string, messageId: number, text: string, replyMarkup?: any) {
  return await callTelegram('editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: 'HTML',
    reply_markup: replyMarkup,
  });
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
      if (caption) form.append('caption', caption);
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
  adminName?: string
) {
  const priorityBadge = priority === 'urgent' ? '🚨 SHOSHILINCH' : priority === 'important' ? '⚠️ MUHIM' : '📌';
  const text = `<b>${priorityBadge} MA'MURIYATDAN XABAR:</b>\n\n` +
    `<b>Sarlavha:</b> ${escapeHtml(title)}\n\n` +
    `${escapeHtml(content)}\n\n` +
    `<i>Yuborilgan vaqti: ${new Date().toLocaleDateString('uz-UZ')} ${new Date().toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })}</i>`;

  return await sendMessage(chatId, text, {
    inline_keyboard: [
      [{ text: '🏫 Mening sinfim ma\'lumotlari', callback_data: 'my_class' }],
    ],
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

// Render Teacher's Class Dashboard Text & Keyboard
function getDashboardPayload(classGroup: ClassGroup, students: Student[]) {
  const classStudents = students.filter((s) => s.classId === classGroup.id);
  const total = classStudents.length;
  const certified = classStudents.filter((s) => s.status === 'certified').length;
  const errors = classStudents.filter((s) => s.status === 'error' || s.hasError).length;
  const pending = total - certified - errors;
  const percent = total > 0 ? ((certified / total) * 100).toFixed(1) : '0';

  const text = `🏫 <b>Sinf:</b> ${escapeHtml(classGroup.name)}\n` +
    `👩‍🏫 <b>Sinf rahbari:</b> ${escapeHtml(classGroup.teacherName)}\n\n` +
    `📊 <b>Umumiy ko'rsatkich:</b>\n` +
    `• Jami o'quvchilar: <b>${total} nafar</b>\n` +
    `• 🟢 Sertifikat olganlar: <b>${certified} ta (${percent}%)</b>\n` +
    `• 🔴 Muammoli/xatoliklar: <b>${errors} ta</b>\n` +
    `• ⚪️ Kutilayotganlar: <b>${pending} ta</b>\n\n` +
    `<i>Barcha ma'lumotlar real vaqt rejimida yangilanadi.</i>`;

  const inline_keyboard = [
    [{ text: `📋 O'quvchilar ro'yxati (${total})`, callback_data: `list_students_${classGroup.id}` }],
    ...(errors > 0
      ? [[{ text: `⚠️ Xatolik chiqqanlar (${errors} ta)`, callback_data: `list_errors_${classGroup.id}` }]]
      : []),
    [{ text: `📥 Yagona PDF sertifikatlar to'plami`, callback_data: `download_pdf_${classGroup.id}` }],
    [
      { text: `🔄 Yangilash`, callback_data: `refresh_class_${classGroup.id}` },
      { text: `🔄 Boshqa sinfni tanlash`, callback_data: `switch_class` },
    ],
  ];

  return { text, reply_markup: { inline_keyboard } };
}

// Low-level helper to fetch the real, official Coursera certificate image with disk caching
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
    try { fs.writeFileSync(cachePath, buf); } catch {}
    return buf;
  }

  // 3. Fetch from Coursera with retry
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(trimmed, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        },
        signal: AbortSignal.timeout(12000),
      });

      if (res.ok) {
        const contentType = res.headers.get('content-type') || '';
        if (contentType.startsWith('image/')) {
          const arr = await res.arrayBuffer();
          const buf = Buffer.from(arr);
          if (buf.length > 5000) {
            try { fs.writeFileSync(cachePath, buf); } catch {}
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
          const ogMatch = html.match(/<meta[^>]*(?:property|name)=["'](?:og:image|twitter:image(?::src)?)["'][^>]*content=["']([^"']+)["']/i) ||
                          html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["'](?:og:image|twitter:image(?::src)?)["']/i);
          if (ogMatch && ogMatch[1] && !ogMatch[1].includes('Grid_Coursera_Partners')) {
            targetImgUrl = ogMatch[1].replace(/&amp;/g, '&');
          }
        }

        // C. Direct <img> tag for CERTIFICATE_LANDING_PAGE
        if (!targetImgUrl) {
          const imgMatch = html.match(/<img[^>]+src=["'](https:\/\/[^"']+coursera_assets[^"']+CERTIFICATE_LANDING_PAGE[^"']+)["']/i);
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
              try { fs.writeFileSync(cachePath, buf); } catch {}
              return buf;
            }
          }
        }
      }
    } catch (err: any) {
      console.warn(`[Telegram PDF] Attempt ${attempt} fetching certificate from ${trimmed}:`, err.message);
    }
  }

  // Final fallback: check direct ID in URL for verify links
  const idMatch = trimmed.match(/verify\/([A-Za-z0-9]+)/);
  if (idMatch && idMatch[1]) {
    try {
      const s3Url = `https://s3.amazonaws.com/coursera_assets/meta_images/generated/CERTIFICATE_LANDING_PAGE/CERTIFICATE_LANDING_PAGE~${idMatch[1]}/CERTIFICATE_LANDING_PAGE~${idMatch[1]}.jpeg`;
      const s3Res = await fetch(s3Url, { signal: AbortSignal.timeout(8000) });
      if (s3Res.ok) {
        const arr = await s3Res.arrayBuffer();
        const buf = Buffer.from(arr);
        if (buf.length > 5000) {
          try { fs.writeFileSync(cachePath, buf); } catch {}
          return buf;
        }
      }
    } catch {}
  }

  return null;
}

// Generate the unified multi-page PDF on server for Telegram delivery
async function buildUnifiedClassPdf(classGroup: ClassGroup, students: Student[]): Promise<Buffer> {
  const certifiedStudents = students
    .filter((s) => s.status === 'certified' && s.classId === classGroup.id)
    .sort((a, b) => a.fullName.localeCompare(b.fullName, 'uz'));

  const total = certifiedStudents.length;

  // Pre-fetch all real certificate images in parallel batches (5 at a time)
  const imageBuffers: (Buffer | null)[] = new Array(total).fill(null);
  const BATCH_SIZE = 5;
  for (let b = 0; b < total; b += BATCH_SIZE) {
    const chunk = certifiedStudents.slice(b, b + BATCH_SIZE);
    const chunkBuffers = await Promise.all(
      chunk.map((st) => fetchRealCertificateImage(st.certificateLink || ''))
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

  for (let i = 0; i < total; i++) {
    const student = certifiedStudents[i];
    if (i > 0) doc.addPage('a4', 'landscape');

    // Header banner
    doc.setFillColor(15, 23, 42); // slate-900
    doc.rect(0, 0, 297, 16, 'F');
    doc.setFillColor(245, 158, 11); // amber-500
    doc.rect(0, 16, 297, 1.2, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(`${i + 1}. ${student.fullName}`, 12, 11);

    doc.setTextColor(251, 191, 36); // amber-400
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`${classGroup.name} sinfi | Sinf rahbari: ${classGroup.teacherName}`, 285, 11, { align: 'right' });

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
      doc.setFontSize(22);
      doc.text("BIR MILLION DASTURCHI", 148, 80, { align: 'center' });

      doc.setFontSize(15);
      doc.setTextColor(51, 65, 85);
      doc.text("XALQARO COURSERA SERTIFIKATI", 148, 95, { align: 'center' });

      doc.setFontSize(20);
      doc.setTextColor(16, 185, 129);
      doc.text(student.fullName, 148, 120, { align: 'center' });

      doc.setFontSize(11);
      doc.setTextColor(100, 116, 139);
      doc.text(`Elektron tekshiruv: ${student.certificateLink || 'https://coursera.org/verify'}`, 148, 145, { align: 'center' });
    }

    // Footer
    doc.setFillColor(248, 250, 252);
    doc.rect(0, 199, 297, 11, 'F');
    doc.setTextColor(71, 85, 105);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    const linkStr = student.certificateLink || 'https://coursera.org/verify';
    doc.text(`Elektron tasdiq: ${linkStr.length > 90 ? linkStr.slice(0, 87) + '...' : linkStr}`, 12, 206);

    doc.setTextColor(30, 41, 59);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(`Sahifa ${i + 1} / ${total}`, 285, 206, { align: 'right' });
  }

  return Buffer.from(doc.output('arraybuffer'));
}

// Automatically check all classes and notify teacher if 100% completed/evaluated
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
    const classStudents = store.students.filter((s) => s.classId === classGroup.id);
    if (classStudents.length === 0) continue;

    // Check if any student is still 'pending'
    const pendingCount = classStudents.filter((s) => s.status === 'pending').length;
    if (pendingCount > 0) {
      result.pendingClassesCount++;
      continue; // Not completely done yet
    }

    result.completedClasses++;

    // All students are evaluated (certified or error)
    const certified = classStudents.filter((s) => s.status === 'certified').length;
    const errors = classStudents.filter((s) => s.status === 'error' || s.hasError).length;
    const stateHash = `${classGroup.id}:${classStudents.length}:${certified}:${errors}`;

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

    // Send the requested automatic notification!
    const notifyText = `🔔 <b>Hurmatli ustoz sizning sinfingizga to'liq sertifikatlar olib bo'lindi, iltimos tekshirishingizni so'rayman.</b>\n\n` +
      `🏫 <b>Sinf:</b> ${escapeHtml(classGroup.name)}\n` +
      `📊 <b>Jami o'quvchilar:</b> ${classStudents.length} nafar\n` +
      `🟢 <b>Sertifikat olganlar:</b> ${certified} ta\n` +
      `🔴 <b>Xatolik/muammo chiqqanlar:</b> ${errors} ta\n\n` +
      `Natijalarni to'liq tekshirish uchun quyidagi tugmani bosing:`;

    const replyMarkup = {
      inline_keyboard: [
        [
          { text: '📋 Tekshirish', callback_data: `verify_class_${classGroup.id}` },
          { text: '✖️ E\'tiborsiz qoldirish', callback_data: `dismiss_notify_${classGroup.id}` },
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
      console.log(`ℹ️ [Telegram Bot] Remote Webhook active at: ${info.result.url}. Long-polling paused to avoid conflict.`);
      return;
    } else {
      // Clear any potential residual webhook so getUpdates never conflicts
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
          // Telegram 409 Conflict: another instance (e.g. during Cloud Run deployment rollout or scale shift)
          // is currently running getUpdates. Back off calmly without spamming deleteWebhook and restarting every 2s.
          const backoffSec = Math.min(30, 5 * Math.min(consecutive409Count, 6));
          if (consecutive409Count <= 2 || consecutive409Count % 6 === 0) {
            console.log(`[Telegram Bot] 409 Conflict: another instance is active. Standing by (backoff ${backoffSec}s)...`);
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
        // Network timeout, socket reset, or transient disconnect is completely normal in HTTP long polling
        consecutiveNetworkErrors++;
        const isTransient =
          err?.name === 'TimeoutError' ||
          err?.name === 'AbortError' ||
          err?.cause?.name === 'TimeoutError' ||
          err?.cause?.name === 'AbortError' ||
          (err?.message && (err.message.includes('fetch failed') || err.message.includes('aborted') || err.message.includes('network'))) ||
          err?.code === 'ECONNRESET' ||
          err?.code === 'ETIMEDOUT' ||
          err?.code === 'UND_ERR_SOCKET' ||
          err?.code === 'EAI_AGAIN';

        if (!isTransient) {
          console.log('[Telegram Bot] Polling notice:', err?.message || err);
        }

        // Smooth progressive backoff on network issues: 2s -> 4s -> max 10s
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
    const from = msg.from;

    if (!chatId) return;

    if (text.startsWith('/start') || text.startsWith('/boshlash')) {
      await ensureFreshFirestoreData();
      // Prompt teacher selection
      const classes = store.classes;
      if (classes.length === 0) {
        await sendMessage(
          chatId,
          `Assalomu alaykum, hurmatli ustoz! 👋\n\n` +
          `Hozircha tizimga sinflar kiritilmagan. Maktab ma'muriyati hujjatni yuklagandan so'ng sinflar ro'yxati shu yerda paydo bo'ladi.`
        );
        return;
      }

      const buttons = classes.map((c) => [
        {
          text: `🏫 ${c.name} sinfi: ${c.teacherName}`,
          callback_data: `select_teacher_${c.id}`,
        },
      ]);

      await sendMessage(
        chatId,
        `Assalomu alaykum, hurmatli ustoz! 👋\n\n` +
        `Maktabimizning <b>"Bir Million Dasturchi"</b> Coursera sertifikatlarini boshqarish botiga xush kelibsiz.\n\n` +
        `Iltimos, o'zingizning sinfingiz va ism-familiyangizni tanlang:`,
        { inline_keyboard: buttons }
      );
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
      await sendMessage(chatId, `Iltimos, avval /start buyrug'ini yuboring va o'z sinfingizni tanlang.`);
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

    // A. Select teacher / class
    if (data.startsWith('select_teacher_')) {
      const classId = data.replace('select_teacher_', '');
      const cls = store.classes.find((c) => c.id === classId);
      if (!cls) {
        await answerCallbackQuery(cb.id, 'Sinf topilmadi');
        return;
      }

      // Record Telegram user
      const tgUserObj: TelegramUser = {
        id: chatId.toString(),
        chatId,
        teacherName: cls.teacherName,
        classId: cls.id,
        className: cls.name,
        username: from.username ? `@${from.username}` : undefined,
        firstName: from.first_name,
        lastName: from.last_name,
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

      await answerCallbackQuery(cb.id, `✅ ${cls.name} sinfi tanlandi!`);
      await ensureFreshFirestoreData();

      const payload = getDashboardPayload(cls, store.students);
      if (messageId) {
        await editMessageText(chatId, messageId, payload.text, payload.reply_markup);
      } else {
        await sendMessage(chatId, payload.text, payload.reply_markup);
      }
      return;
    }

    // B. Switch class
    if (data === 'switch_class') {
      await ensureFreshFirestoreData();
      const buttons = store.classes.map((c) => [
        {
          text: `🏫 ${c.name} sinfi: ${c.teacherName}`,
          callback_data: `select_teacher_${c.id}`,
        },
      ]);
      await answerCallbackQuery(cb.id);
      if (messageId) {
        await editMessageText(chatId, messageId, `Quyidagi ro'yxatdan o'z sinfingizni tanlang:`, {
          inline_keyboard: buttons,
        });
      }
      return;
    }

    // C. My class / Refresh dashboard
    if (data === 'my_class' || data.startsWith('refresh_class_')) {
      const classId = data.startsWith('refresh_class_')
        ? data.replace('refresh_class_', '')
        : store.telegramUsers[chatId.toString()]?.classId;

      const cls = store.classes.find((c) => c.id === classId);
      if (cls) {
        // Guarantee 100% fresh data directly from Firestore
        await ensureFreshFirestoreData();

        // Update user activity
        if (store.telegramUsers[chatId.toString()]) {
          store.telegramUsers[chatId.toString()].lastActiveAt = new Date().toISOString();
          saveStore();
          if (firestoreDb) {
            setDoc(doc(firestoreDb, 'telegramUsers', chatId.toString()), store.telegramUsers[chatId.toString()], { merge: true }).catch(() => {});
          }
        }
        await answerCallbackQuery(cb.id, 'Real-vaqt ma\'lumotlari yangilandi 🔄');
        const payload = getDashboardPayload(cls, store.students);
        if (messageId) {
          await editMessageText(chatId, messageId, payload.text, payload.reply_markup);
        }
      } else {
        await answerCallbackQuery(cb.id, 'Sinf topilmadi');
      }
      return;
    }

    // D. List students in class
    if (data.startsWith('list_students_')) {
      const classId = data.replace('list_students_', '');
      const cls = store.classes.find((c) => c.id === classId);
      if (!cls) {
        await answerCallbackQuery(cb.id, 'Sinf topilmadi');
        return;
      }

      await ensureFreshFirestoreData();
      await answerCallbackQuery(cb.id);
      const classStudents = store.students.filter((s) => s.classId === cls.id);
      const certified = classStudents.filter((s) => s.status === 'certified');
      const errors = classStudents.filter((s) => s.status === 'error' || s.hasError);
      const pending = classStudents.filter((s) => s.status === 'pending');

      let text = `📋 <b>${escapeHtml(cls.name)} sinfi o'quvchilari holati:</b>\n\n`;

      if (certified.length > 0) {
        text += `<b>🟢 Sertifikat olganlar (${certified.length} ta):</b>\n`;
        certified.forEach((st, idx) => {
          text += `${idx + 1}. ${escapeHtml(st.fullName)} — ✅ Tasdiqlangan\n`;
        });
        text += `\n`;
      }

      if (errors.length > 0) {
        text += `<b>🔴 Xatolik chiqqanlar (${errors.length} ta):</b>\n`;
        errors.forEach((st, idx) => {
          text += `${idx + 1}. ${escapeHtml(st.fullName)} — ⚠️ Xatolik\n`;
        });
        text += `\n`;
      }

      if (pending.length > 0) {
        text += `<b>⚪️ Kutilayotganlar (${pending.length} ta):</b>\n`;
        pending.forEach((st, idx) => {
          text += `${idx + 1}. ${escapeHtml(st.fullName)} — ⏳ Kutilmoqda\n`;
        });
      }

      const buttons: any[] = [];
      if (errors.length > 0) {
        buttons.push([{ text: `⚠️ Xatoliklar sababini ko'rish`, callback_data: `list_errors_${cls.id}` }]);
      }
      buttons.push([{ text: `🔙 Asosiy sahifaga qaytish`, callback_data: `refresh_class_${cls.id}` }]);

      if (messageId) {
        await editMessageText(chatId, messageId, text, { inline_keyboard: buttons });
      }
      return;
    }

    // E. List errors
    if (data.startsWith('list_errors_')) {
      const classId = data.replace('list_errors_', '');
      const cls = store.classes.find((c) => c.id === classId);
      if (!cls) {
        await answerCallbackQuery(cb.id, 'Sinf topilmadi');
        return;
      }

      const errors = store.students.filter((s) => s.classId === cls.id && (s.status === 'error' || s.hasError));
      await answerCallbackQuery(cb.id);

      if (errors.length === 0) {
        const text = `🎉 <b>${escapeHtml(cls.name)} sinfida hech qanday xatolik yo'q!</b>\nBarcha ma'lumotlar to'g'ri.`;
        if (messageId) {
          await editMessageText(chatId, messageId, text, {
            inline_keyboard: [[{ text: '🔙 Asosiy sahifaga qaytish', callback_data: `refresh_class_${cls.id}` }]],
          });
        }
        return;
      }

      let text = `⚠️ <b>${escapeHtml(cls.name)} sinfidagi muammoli o'quvchilar (${errors.length} ta):</b>\n\n` +
        `Quyidagi o'quvchilardan birini tanlab, uning muammo sababi va asos skrinshotini ko'rishingiz mumkin:\n`;

      const buttons = errors.map((st) => [
        {
          text: `🔴 ${st.fullName.length > 28 ? st.fullName.slice(0, 25) + '...' : st.fullName}`,
          callback_data: `error_detail_${st.id}`,
        },
      ]);

      buttons.push([{ text: `🔙 Asosiy sahifaga qaytish`, callback_data: `refresh_class_${cls.id}` }]);

      if (messageId) {
        await editMessageText(chatId, messageId, text, { inline_keyboard: buttons });
      }
      return;
    }

    // F. Error details for a single student
    if (data.startsWith('error_detail_')) {
      const studentId = data.replace('error_detail_', '');
      const student = store.students.find((s) => s.id === studentId);
      if (!student) {
        await answerCallbackQuery(cb.id, 'O\'quvchi topilmadi');
        return;
      }

      await answerCallbackQuery(cb.id);
      const text = `❌ <b>O'quvchi ma'lumotlaridagi muammo:</b>\n\n` +
        `👤 <b>F.I.SH:</b> ${escapeHtml(student.fullName)}\n` +
        `📝 <b>Mas'ul admin izohi:</b>\n` +
        `<i>${escapeHtml(student.errorReason || "O'quvchi ma'lumotlari Coursera bazasidagi profil bilan mos kelmadi.")}</i>`;

      const buttons = [
        [{ text: `🔙 Xatoliklar ro'yxatiga qaytish`, callback_data: `list_errors_${student.classId}` }],
        [{ text: `🔙 Asosiy menyu`, callback_data: `refresh_class_${student.classId}` }],
      ];

      if (student.errorImage) {
        await sendPhoto(chatId, student.errorImage, text);
        await sendMessage(chatId, `Yuqoridagi holat bo'yicha ma'lumot. Boshqa menyularga o'tish uchun:`, {
          inline_keyboard: buttons,
        });
      } else {
        if (messageId) {
          await editMessageText(chatId, messageId, text, { inline_keyboard: buttons });
        } else {
          await sendMessage(chatId, text, { inline_keyboard: buttons });
        }
      }
      return;
    }

    // G. Download Unified Multi-Page PDF (Method 2)
    if (data.startsWith('download_pdf_')) {
      const classId = data.replace('download_pdf_', '');
      await ensureFreshFirestoreData();
      const cls = store.classes.find((c) => c.id === classId);
      if (!cls) {
        await answerCallbackQuery(cb.id, 'Sinf topilmadi');
        return;
      }

      const certified = store.students.filter((s) => s.classId === cls.id && s.status === 'certified');
      if (certified.length === 0) {
        await answerCallbackQuery(cb.id, 'Ushbu sinfda hali sertifikat olganlar yo\'q!', true);
        return;
      }

      await answerCallbackQuery(cb.id, 'PDF tayyorlanmoqda, iltimos kuting...');

      await sendMessage(
        chatId,
        `⏳ <b>Hurmatli ustoz, ${escapeHtml(cls.name)} sinfining barcha sertifikatlari alifbo tartibida yagona PDF qilib tayyorlanmoqda...</b>\n\n` +
        `Bu biroz vaqt olishi mumkin, tayyor bo'lishi bilan shu yerga yuboriladi.`
      );

      try {
        const pdfBuf = await buildUnifiedClassPdf(cls, store.students);
        const safeClassName = cls.name.replace(/[^a-zA-Z0-9_\u0400-\u04FF]/g, '_');
        const filename = `${safeClassName}_sinfi_barcha_sertifikatlar_yagona_royxati.pdf`;

        const caption = `🎓 <b>${escapeHtml(cls.name)} sinfi Coursera sertifikatlari to'plami (Yagona PDF)</b>\n` +
          `👩‍🏫 Sinf rahbari: ${escapeHtml(cls.teacherName)}\n` +
          `📊 Jami sertifikatlar: ${certified.length} ta\n` +
          `✅ Barcha sertifikatlar asl Coursera bazasidan to'liq tekshirib kiritilgan.`;

        await sendDocument(chatId, pdfBuf, filename, caption);
      } catch (err: any) {
        console.error('Error generating PDF for telegram:', err);
        await sendMessage(chatId, `❌ Kechirasiz, PDF faylni tayyorlashda xatolik yuz berdi. Iltimos qaytadan urinib ko'ring.`);
      }
      return;
    }

    // H. Verify class (From 100% completed automated notification)
    if (data.startsWith('verify_class_')) {
      const classId = data.replace('verify_class_', '');
      const cls = store.classes.find((c) => c.id === classId);
      if (!cls) {
        await answerCallbackQuery(cb.id, 'Sinf topilmadi');
        return;
      }

      await answerCallbackQuery(cb.id);

      const classStudents = store.students.filter((s) => s.classId === cls.id);
      const certified = classStudents.filter((s) => s.status === 'certified');
      const errors = classStudents.filter((s) => s.status === 'error' || s.hasError);

      let text = `📋 <b>${escapeHtml(cls.name)} sinfining to'liq tekshiruv natijalari:</b>\n\n`;

      if (certified.length > 0) {
        text += `<b>🟢 Sertifikat olgan o'quvchilar (${certified.length} ta):</b>\n`;
        certified.forEach((st, idx) => {
          text += `${idx + 1}. ${escapeHtml(st.fullName)} — ✅ Tasdiqlangan\n`;
        });
        text += `\n`;
      }

      if (errors.length > 0) {
        text += `<b>🔴 Xatolik chiqqan o'quvchilar (${errors.length} ta):</b>\n`;
        errors.forEach((st, idx) => {
          text += `${idx + 1}. ${escapeHtml(st.fullName)} — ⚠️ Xatolik\n`;
        });
        text += `\n<i>Xatolik sababini ko'rish uchun pastdagi tugmalarni bosing.</i>`;
      }

      const buttons: any[] = [];
      if (errors.length > 0) {
        errors.forEach((st) => {
          buttons.push([
            {
              text: `🔴 ${st.fullName.length > 25 ? st.fullName.slice(0, 22) + '...' : st.fullName} - Sababi`,
              callback_data: `error_detail_${st.id}`,
            },
          ]);
        });
      }
      buttons.push([
        { text: `📥 Yagona PDF yuklab olish`, callback_data: `download_pdf_${cls.id}` },
        { text: `🔙 Asosiy sahifaga qaytish`, callback_data: `refresh_class_${cls.id}` },
      ]);

      if (messageId) {
        await editMessageText(chatId, messageId, text, { inline_keyboard: buttons });
      } else {
        await sendMessage(chatId, text, { inline_keyboard: buttons });
      }
      return;
    }

    // I. Dismiss auto notification
    if (data.startsWith('dismiss_notify_')) {
      await answerCallbackQuery(cb.id, 'Xabarnoma yopildi');
      if (messageId) {
        await editMessageText(chatId, messageId, `<i>Xabarnoma e'tiborsiz qoldirildi. Istalgan payt /start orqali tekshirishingiz mumkin.</i>`);
      }
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
