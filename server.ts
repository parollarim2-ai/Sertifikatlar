import fs from 'fs';
import path from 'path';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import puppeteer, { Browser } from 'puppeteer';
import {
  startTelegramBot,
  getTelegramUsers,
  syncDataFromClient,
  sendTelegramMessageToTeacher,
  checkAndNotifyCompletedClasses,
  handleTelegramWebhookUpdate,
  setTelegramWebhook,
  getTelegramWebhookInfo,
  deleteTelegramWebhook,
} from './server-telegram.ts';

let sharedBrowser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!sharedBrowser || !sharedBrowser.connected) {
    sharedBrowser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
      ],
    });
  }
  return sharedBrowser;
}

async function startServer() {
  const app = express();
  // In AI Studio Cloud Run container, Nginx listens on PORT 8080 and proxies traffic to 3000.
  const port = 3000;

  app.use(express.json({ limit: '20mb' }));

  // AI Document parsing endpoint using Gemini
  app.post('/api/parse-document-ai', async (req, res) => {
    try {
      const { textContent, fileName } = req.body;
      if (!textContent || typeof textContent !== 'string') {
        return res.status(400).json({ error: "Hujjat matni kiritilmagan" });
      }

      const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
      if (!apiKey) {
        return res.status(200).json({ 
          fallback: true, 
          message: "Gemini API kaliti topilmadi, lokal algoritm ishlatiladi" 
        });
      }

      const ai = new GoogleGenAI({ apiKey });
      const prompt = `Siz O'zbekiston maktab hujjatlarini (ERP, Kundalik, Excel ro'yxatlari, jurnallar) o'ta yuqori aniqlikda tahlil qiluvchi mutaxassis yordamchisiz.
Quyida maktab hujjati (${fileName || 'maktab_hujjati'}) matni keltirilgan.
Iltimos, ushbu matndan FAQAT o'quvchilar ma'lumotlarini aniq ajratib oling va sof JSON formatida qaytaring:

QAT'IY QOIDALAR (BU QOIDALARGA 100% AMAL QILISH SHART):
1. "fullName": FAQAT o'quvchining Familiyasi, Ismi va Sharifi bo'lishi shart! (Masalan: "Abdurasulov Fayzulloh Abdurahim o'g'li" yoki "Karimova Zilola Botir qizi").
   - QAT'IY TAQIQLANADI: O'quvchining yashash manzili (viloyat, tuman, shahar, qishloq, mahalla, ko'cha, uy raqami), telefon raqamlari, ota-onasi, jinsi, millati, maktab raqami kabi qo'shimcha ma'lumotlarni ASLO fullName maydoniga qo'shmang! Bu ortiqcha ma'lumotlarni BUTUNLAY TASHAB YUBORING!
   - Pasport yoki metrika ma'lumotlarini ham fullName ga qo'shmang, ularni passportOrId maydoniga ajrating!
2. "birthDate": O'quvchining tug'ilgan sanasi ("DD.MM.YYYY" formatida, masalan: "18.03.2011"). Agar hujjatda sana bo'lmasa, bo'sh satr "" qoldiring.
3. "passportOrId": Tug'ilganlik haqidagi guvohnoma (metrika: "I-TN 123456", "II-FR 765432", "I-АН 123456", "I-TO 0521092") yoki Pasport/ID ("AA 1234567", "AB 7654321") yoki PINFL (14 xonali son). Agar hujjatda bo'lmasa, bo'sh satr "" qoldiring.
4. "detectedClassName": Hujjatdagi sinf nomi (masalan: "9-A", "10-B", "11-A"). Agar topilmasa, "".
5. "detectedTeacherName": Sinf rahbari F.I.SH (masalan: "Niyozmatova Ziyoda"). Agar topilmasa, "".

Hujjat matni:
"""
${textContent.slice(0, 20000)}
"""

Qaytaring faqat toza JSON formatida (hech qanday markdown belgisiz, faqat JSON):
{
  "detectedClassName": "...",
  "detectedTeacherName": "...",
  "students": [
    { "fullName": "...", "birthDate": "...", "passportOrId": "..." }
  ]
}`;

      const candidateModels = ['gemini-3.1-flash-lite', 'gemini-3.8-flash', 'gemini-flash-latest'];
      let rawOutput = '';
      for (const modelName of candidateModels) {
        try {
          const response = await Promise.race([
            ai.models.generateContent({
              model: modelName,
              contents: prompt,
            }),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('AI request timeout (7s)')), 7000)
            ),
          ]);
          if (response && response.text) {
            rawOutput = response.text;
            break;
          }
        } catch (modelErr: any) {
          console.warn(`Model ${modelName} error:`, modelErr.message || modelErr);
        }
      }

      if (!rawOutput) {
        throw new Error("Barcha AI modellari band yoki javob bermadi");
      }
      const cleanJson = rawOutput.replace(/```json/gi, '').replace(/```/g, '').trim();
      const parsedData = JSON.parse(cleanJson);

      // Extra server-side sanitization to guarantee clean names without address/phone residues
      const sanitizedStudents = Array.isArray(parsedData.students)
        ? parsedData.students.map((st: any) => {
            let name = String(st.fullName || '').trim();
            // Remove addresses, phones, and passport if leaked
            name = name.replace(/\b(?:viloyat[ia]?|tuman[ia]?|shahar|shahri|sh\.?|qishloq|mahalla|ko'cha|ko'chasi|uy|xonadon|\+?998\d{9})\b.*$/i, ' ').trim();
            return {
              fullName: name,
              birthDate: String(st.birthDate || '').trim(),
              passportOrId: String(st.passportOrId || '').trim(),
            };
          }).filter((s: any) => s.fullName && s.fullName.split(/\s+/).length >= 2)
        : [];

      return res.json({
        success: true,
        detectedClassName: parsedData.detectedClassName || '',
        detectedTeacherName: parsedData.detectedTeacherName || '',
        students: sanitizedStudents,
      });
    } catch (error) {
      console.error("AI Document parse error:", error);
      return res.status(200).json({ 
        fallback: true, 
        message: "AI orqali tahlil qilishda nosozlik bo'ldi, lokal algoritm ishlatiladi" 
      });
    }
  });

  // Capture certificate endpoint - fetches certificate webpage, captures as image, returns base64
  app.post('/api/capture-certificate', async (req, res) => {
    try {
      const { url, studentName, className } = req.body;
      if (!url || typeof url !== 'string') {
        return res.status(400).json({ error: "Havola (URL) ko'rsatilmadi" });
      }

      const trimmedUrl = url.trim();

      // 1. If it's already a base64 data URL
      if (trimmedUrl.startsWith('data:image/')) {
        return res.json({ success: true, imageBase64: trimmedUrl });
      }

      // 2. Direct image check (png, jpg, webp, svg, gif)
      const isDirectImage = /\.(png|jpe?g|webp|svg|gif)(\?.*)?$/i.test(trimmedUrl);
      if (isDirectImage) {
        try {
          const directRes = await fetch(trimmedUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
          });
          if (directRes.ok) {
            const contentType = directRes.headers.get('content-type') || 'image/jpeg';
            const arrayBuffer = await directRes.arrayBuffer();
            const base64 = Buffer.from(arrayBuffer).toString('base64');
            return res.json({
              success: true,
              imageBase64: `data:${contentType};base64,${base64}`
            });
          }
        } catch (e) {
          console.warn("Direct image fetch attempt failed:", e);
        }
      }

      // 3. Ultra-fast direct extraction of the standalone certificate image (Copy Image equivalent)
      try {
        const pageRes = await fetch(trimmedUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
          },
          redirect: 'follow',
          signal: AbortSignal.timeout(8000),
        });

        if (pageRes.ok) {
          const finalUrl = pageRes.url;
          const html = await pageRes.text();

          // A. Find direct <img> tag for the certificate
          const imgMatches = html.matchAll(/<img[^>]+src=["'](https:\/\/[^"']+coursera_assets[^"']+CERTIFICATE_LANDING_PAGE[^"']+)["']/gi);
          let targetImgUrl: string | null = null;
          for (const m of imgMatches) {
            targetImgUrl = m[1];
            break;
          }

          // B. Find og:image or twitter:image
          if (!targetImgUrl) {
            const ogMatch = html.match(/<meta[^>]*property=["'](?:og:image|twitter:image(?::src)?)["'][^>]*content=["']([^"']+)["']/i) ||
                            html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["'](?:og:image|twitter:image(?::src)?)["']/i);
            if (ogMatch && ogMatch[1] && !ogMatch[1].includes('Grid_Coursera_Partners')) {
              targetImgUrl = ogMatch[1];
            }
          }

          // C. Match Coursera Accomplishment ID from URL
          if (!targetImgUrl) {
            const idMatch = finalUrl.match(/verify\/([A-Za-z0-9]+)/) || trimmedUrl.match(/verify\/([A-Za-z0-9]+)/);
            if (idMatch && idMatch[1]) {
              const candidateUrl = `https://s3.amazonaws.com/coursera_assets/meta_images/generated/CERTIFICATE_LANDING_PAGE/CERTIFICATE_LANDING_PAGE~${idMatch[1]}/CERTIFICATE_LANDING_PAGE~${idMatch[1]}.jpeg`;
              const s3Check = await fetch(candidateUrl, { method: 'HEAD', signal: AbortSignal.timeout(4000) });
              if (s3Check.ok) {
                targetImgUrl = candidateUrl;
              }
            }
          }

          // If standalone certificate image found, fetch and return it directly!
          if (targetImgUrl) {
            const imgRes = await fetch(targetImgUrl, { signal: AbortSignal.timeout(8000) });
            if (imgRes.ok) {
              const buf = await imgRes.arrayBuffer();
              const base64 = Buffer.from(buf).toString('base64');
              const mime = imgRes.headers.get('content-type') || 'image/jpeg';
              return res.json({
                success: true,
                imageBase64: `data:${mime};base64,${base64}`
              });
            }
          }
        }
      } catch (e) {
        console.warn("Direct certificate image extraction attempt:", e);
      }

      // 4. Headless Puppeteer Chromium: Target ONLY the certificate element (Surgical Precision)
      try {
        const browser = await getBrowser();
        const page = await browser.newPage();
        try {
          await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 2 });
          await page.goto(trimmedUrl, { waitUntil: 'networkidle2', timeout: 20000 });

          // First, check if the exact certificate <img> is present in the DOM
          const certImageSrc = await page.evaluate(() => {
            const imgs = Array.from(document.querySelectorAll('img'));
            const cert = imgs.find(img => 
              (img.src.includes('CERTIFICATE_LANDING_PAGE') || img.src.includes('coursera_assets')) &&
              (img.naturalWidth > 400 || img.width > 400)
            ) || imgs.find(img => 
              (img.alt?.toLowerCase().includes('certificate') || img.className?.toLowerCase().includes('certificate')) &&
              (img.naturalWidth > 400 || img.width > 400)
            );
            return cert ? cert.src : null;
          });

          if (certImageSrc) {
            const imgRes = await fetch(certImageSrc, { signal: AbortSignal.timeout(8000) });
            if (imgRes.ok) {
              const buf = await imgRes.arrayBuffer();
              const base64 = Buffer.from(buf).toString('base64');
              const mime = imgRes.headers.get('content-type') || 'image/jpeg';
              return res.json({
                success: true,
                imageBase64: `data:${mime};base64,${base64}`
              });
            }
          }

          // Second, screenshot ONLY the certificate element / card (excluding header, footer, buttons)
          const certSelector = [
            'img[src*="CERTIFICATE_LANDING_PAGE"]',
            'img[alt*="certificate" i]',
            '[data-testid="certificate-image"]',
            '.rc-Certificate',
            '[class*="CertificateImage"]',
            '[class*="certificate-container"]',
            '[class*="CertificatePreview"]',
            '[class*="certificate"]'
          ].find(s => document.querySelector(s));

          const elementToCapture = certSelector ? await page.$(certSelector) : null;
          const targetHandle = elementToCapture || page;

          const buf = await targetHandle.screenshot({ type: 'jpeg', quality: 95 });
          if (buf && buf.length > 5000) {
            const base64 = Buffer.from(buf).toString('base64');
            return res.json({
              success: true,
              imageBase64: `data:image/jpeg;base64,${base64}`
            });
          }
        } finally {
          await page.close().catch(() => {});
        }
      } catch (e) {
        console.warn("Headless Puppeteer element capture failed:", e);
      }

      // 5. Microlink API screenshot as external backup
      try {
        const microUrl = `https://api.microlink.io?url=${encodeURIComponent(trimmedUrl)}&screenshot=true&viewport.width=1280&viewport.height=900&viewport.deviceScaleFactor=2`;
        const microRes = await fetch(microUrl, { signal: AbortSignal.timeout(10000) });
        if (microRes.ok) {
          const microJson: any = await microRes.json();
          if (microJson.status === 'success' && microJson.data?.screenshot?.url) {
            const imgRes = await fetch(microJson.data.screenshot.url, { signal: AbortSignal.timeout(8000) });
            if (imgRes.ok) {
              const buf = await imgRes.arrayBuffer();
              const base64 = Buffer.from(buf).toString('base64');
              return res.json({
                success: true,
                imageBase64: `data:image/png;base64,${base64}`
              });
            }
          }
        }
      } catch (e) {
        console.warn("Microlink capture failed:", e);
      }

      // 6. Graceful fallback flag so client generates crisp SVG certificate
      return res.json({
        success: true,
        isFallback: true,
        message: "Havola rasmi zaxira renderiga o'tkazildi"
      });
    } catch (err: any) {
      console.error("Capture certificate error:", err);
      return res.status(200).json({
        success: true,
        isFallback: true,
        error: err.message || "Xatolik"
      });
    }
  });

  // ==========================================
  // TELEGRAM BOT ENDPOINTS
  // ==========================================

  // Get bot status and list of registered teachers
  app.get('/api/telegram/status', (_req, res) => {
    try {
      const users = getTelegramUsers();
      res.json({
        success: true,
        botUsername: '@Courseradan_bot',
        botName: 'Courseradan Sertifikatlar',
        connectedUsersCount: users.length,
        users,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Sync latest classes and students from web client to server bot store
  app.post('/api/telegram/sync-data', (req, res) => {
    try {
      const { classes, students } = req.body;
      syncDataFromClient({ classes, students });
      res.json({
        success: true,
        users: getTelegramUsers(),
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Admin sending a direct message to a teacher on Telegram
  app.post('/api/telegram/send-message', async (req, res) => {
    try {
      const { chatId, title, content, priority } = req.body;
      if (!chatId || !title || !content) {
        return res.status(400).json({ success: false, error: "chatId, title va content majburiy" });
      }

      const result = await sendTelegramMessageToTeacher(chatId, title, content, priority);
      if (result && result.ok) {
        return res.json({ success: true, messageId: result.result?.message_id });
      } else {
        return res.status(400).json({ success: false, error: result?.description || "Xabarni yetkazib bo'lmadi" });
      }
    } catch (err: any) {
      console.error("Telegram send-message error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Trigger check for classes where all students are evaluated
  app.post('/api/telegram/check-auto-notify', async (req, res) => {
    try {
      if (req.body && (req.body.classes || req.body.students)) {
        syncDataFromClient(req.body);
      }
      const force = Boolean(req.body?.force);
      const result = await checkAndNotifyCompletedClasses({ force });
      res.json({ success: true, ...result });
    } catch (err: any) {
      console.error("check-auto-notify error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Telegram Webhook health check endpoint (responds to GET from browsers and monitors)
  app.get('/api/telegram/webhook', (req, res) => {
    const isHtmlRequested = req.headers.accept?.includes('text/html');
    if (isHtmlRequested) {
      res.send(`<!DOCTYPE html>
<html lang="uz">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Telegram Bot Webhook Holati | Courseradan</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 20px; max-width: 520px; width: 100%; padding: 32px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); text-align: center; }
    .badge { display: inline-flex; align-items: center; gap: 8px; background: rgba(34, 197, 94, 0.15); color: #4ade80; border: 1px solid rgba(74, 222, 128, 0.3); padding: 6px 14px; border-radius: 999px; font-weight: 700; font-size: 13px; margin-bottom: 20px; }
    .dot { width: 10px; height: 10px; border-radius: 50%; background: #4ade80; box-shadow: 0 0 10px #4ade80; }
    h1 { font-size: 24px; margin: 0 0 10px 0; color: #ffffff; }
    p { color: #94a3b8; font-size: 14px; line-height: 1.6; margin: 0 0 20px 0; }
    .info-box { background: #0f172a; border-radius: 12px; padding: 16px; text-align: left; font-size: 13px; color: #cbd5e1; margin-bottom: 24px; border: 1px solid #1e293b; }
    .info-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #1e293b; }
    .info-row:last-child { border-bottom: none; }
    .info-label { color: #64748b; font-weight: 500; }
    .info-val { font-weight: 600; color: #38bdf8; font-family: monospace; }
    .btn { display: inline-block; background: #0284c7; color: white; text-decoration: none; padding: 12px 24px; border-radius: 12px; font-weight: 700; font-size: 14px; transition: background 0.2s; }
    .btn:hover { background: #0369a1; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge"><span class="dot"></span> Webhook Endpoint Faol & Ishlamoqda</div>
    <h1>Courseradan Telegram Bot</h1>
    <p>Ushbu URL Telegram serverlaridan xabarlarni qabul qiluvchi rasmiy Webhook manzilidir. Bot serveri 24/7 rejimida yangilanishlarni qabul qilishga to'liq tayyor.</p>
    <div class="info-box">
      <div class="info-row"><span class="info-label">Bot:</span><span class="info-val">@Courseradan_bot</span></div>
      <div class="info-row"><span class="info-label">Holat:</span><span class="info-val" style="color: #4ade80;">200 OK / Tayyor</span></div>
      <div class="info-row"><span class="info-label">Metod:</span><span class="info-val">POST (Telegram Webhook)</span></div>
      <div class="info-row"><span class="info-label">Vaqt:</span><span class="info-val">${new Date().toLocaleTimeString()}</span></div>
    </div>
    <a href="https://t.me/Courseradan_bot" target="_blank" class="btn">Telegram Botga O'tish →</a>
  </div>
</body>
</html>`);
      return;
    }

    res.json({
      ok: true,
      status: "webhook_active",
      message: "Courseradan Telegram Bot Webhook endpointi faol va so'rovlarni qabul qilishga tayyor.",
      bot: "@Courseradan_bot",
      timestamp: new Date().toISOString(),
    });
  });

  // Telegram Webhook endpoint (incoming updates from Telegram servers)
  app.post('/api/telegram/webhook', async (req, res) => {
    try {
      if (req.body) {
        await handleTelegramWebhookUpdate(req.body);
      }
      res.status(200).send('OK');
    } catch (err: any) {
      console.error("Telegram webhook error:", err);
      res.status(200).send('OK');
    }
  });

  // Get current webhook info
  app.get('/api/telegram/webhook-info', async (_req, res) => {
    try {
      const info = await getTelegramWebhookInfo();
      res.json(info);
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // Set or update Telegram Webhook URL
  app.post('/api/telegram/set-webhook', async (req, res) => {
    try {
      const { url } = req.body;
      if (!url) {
        return res.status(400).json({ ok: false, error: "url talab qilinadi" });
      }
      const result = await setTelegramWebhook(url);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // Delete Telegram Webhook (falls back to long-polling)
  app.post('/api/telegram/delete-webhook', async (_req, res) => {
    try {
      const result = await deleteTelegramWebhook();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // Start the background Telegram Bot runner
  try {
    startTelegramBot();
  } catch (botErr) {
    console.warn("Could not start Telegram Bot:", botErr);
  }

  // Mount Vite development middlewares in dev mode, or serve static dist in production
  const isProd = process.env.NODE_ENV === 'production' || (process.env.NODE_ENV !== 'development' && fs.existsSync(path.resolve(process.cwd(), 'dist', 'index.html')));
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${port}`);
  });
}

startServer().catch(err => {
  console.error("Server startup error:", err);
  process.exit(1);
});
