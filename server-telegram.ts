import fs from 'fs';
import path from 'path';
import { jsPDF } from 'jspdf';
import type { ClassGroup, Student, TelegramUser } from './src/types/index.ts';

const BOT_TOKEN = '8846557313:AAE5J1aRrvJJ2LLZCbD7WlI_JFzhSrmR_tA';
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;
const DATA_FILE = path.resolve(process.cwd(), 'telegram-data.json');

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
    fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving telegram-data.json:', err);
  }
}

loadStore();

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

// Generate the unified multi-page PDF on server for Telegram delivery
async function buildUnifiedClassPdf(classGroup: ClassGroup, students: Student[]): Promise<Buffer> {
  const certifiedStudents = students
    .filter((s) => s.status === 'certified' && s.classId === classGroup.id)
    .sort((a, b) => a.fullName.localeCompare(b.fullName, 'uz'));

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const total = certifiedStudents.length;

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

    // Fetch certificate image
    let imgBuffer: Buffer | null = null;
    if (student.certificateLink) {
      try {
        const idMatch = student.certificateLink.match(/verify\/([A-Za-z0-9]+)/);
        if (idMatch && idMatch[1]) {
          const s3Url = `https://s3.amazonaws.com/coursera_assets/meta_images/generated/CERTIFICATE_LANDING_PAGE/CERTIFICATE_LANDING_PAGE~${idMatch[1]}/CERTIFICATE_LANDING_PAGE~${idMatch[1]}.jpeg`;
          const s3Res = await fetch(s3Url, { signal: AbortSignal.timeout(6000) });
          if (s3Res.ok) {
            const arr = await s3Res.arrayBuffer();
            imgBuffer = Buffer.from(arr);
          }
        }
      } catch (e) {
        console.warn('Direct s3 fetch in bot pdf error:', e);
      }
    }

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
export async function checkAndNotifyCompletedClasses() {
  for (const classGroup of store.classes) {
    const classStudents = store.students.filter((s) => s.classId === classGroup.id);
    if (classStudents.length === 0) continue;

    // Check if any student is still 'pending'
    const pendingCount = classStudents.filter((s) => s.status === 'pending').length;
    if (pendingCount > 0) continue; // Not completely done yet

    // All students are evaluated (certified or error)
    const certified = classStudents.filter((s) => s.status === 'certified').length;
    const errors = classStudents.filter((s) => s.status === 'error' || s.hasError).length;
    const stateHash = `${classGroup.id}:${classStudents.length}:${certified}:${errors}`;

    if (store.notifiedClasses[classGroup.id] === stateHash) {
      // Already notified for this exact state
      continue;
    }

    // Find any telegram user for this class
    const tgUser = Object.values(store.telegramUsers).find((u) => u.classId === classGroup.id);
    if (!tgUser) continue;

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
    }
  }
}

// Telegram Bot Polling Loop
let isPolling = false;
let updateOffset = 0;

export function startTelegramBot() {
  if (isPolling) return;
  isPolling = true;
  console.log('🤖 Telegram Bot polling service started for @Courseradan_bot');

  const poll = async () => {
    while (isPolling) {
      try {
        const res = await fetch(`${TELEGRAM_API}/getUpdates?offset=${updateOffset}&timeout=20`, {
          signal: AbortSignal.timeout(25000),
        });
        if (res.ok) {
          const data: any = await res.json();
          if (data.ok && Array.isArray(data.result)) {
            for (const update of data.result) {
              updateOffset = update.update_id + 1;
              handleTelegramUpdate(update).catch((e) => console.error('Error handling Telegram update:', e));
            }
          }
        } else if (res.status === 409) {
          // Webhook is active in Telegram; pause polling
          await new Promise((r) => setTimeout(r, 30000));
        }
      } catch (err: any) {
        // Network timeout is normal in long polling
        if (err.name !== 'TimeoutError') {
          console.warn('Telegram polling retry in 3s:', err.message);
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  };

  poll().catch((e) => console.error('Telegram polling loop exited:', e));
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
      store.telegramUsers[chatId.toString()] = {
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
      saveStore();

      await answerCallbackQuery(cb.id, `✅ ${cls.name} sinfi tanlandi!`);

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
        // Update user activity
        if (store.telegramUsers[chatId.toString()]) {
          store.telegramUsers[chatId.toString()].lastActiveAt = new Date().toISOString();
          saveStore();
        }
        await answerCallbackQuery(cb.id, 'Yangilandi 🔄');
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
    return await res.json();
  } catch (err: any) {
    return { ok: false, description: err.message };
  }
}
