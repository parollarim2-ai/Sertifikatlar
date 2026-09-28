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
      const prompt = `Siz maktab hujjatlarini tahlil qiluvchi aqlli yordamchisiz.
Quyida O'zbekiston maktabidan olingan hujjat matni yoki ro'yxat keltirilgan (${fileName || 'maktab_hujjati'}).
Iltimos, ushbu matndan quyidagi ma'lumotlarni aniq ajratib oling va FAQAT sof JSON formatida qaytaring:

1. "detectedClassName": Sinf nomi (masalan: "9-A", "10-B", "11-A"). Agar matnda aniq ko'rsatilmagan bo'lsa, bo'sh qoldiring "".
2. "detectedTeacherName": Sinf rahbari yoki o'qituvchi F.I.SH (masalan: "Azizova Nigora", "Xoliqova Feruza"). Agar topilmasa, "".
3. "students": O'quvchilar ro'yxati massiv shaklida. Har bir obyektda:
   - "fullName": O'quvchining to'liq ismi-familiyasi (masalan: "Aliyev Vali Sanjar o'g'li"). Harflar to'g'rilangan, bosh harflar katta bo'lsin.
   - "birthDate": Tug'ilgan sana (masalan: "14.05.2010" yoki "2010-05-14"). Agar bo'lmasa, "".
   - "passportOrId": Pasport yoki tug'ilganlik guvohnoma seriyasi va raqami (masalan: "AA1234567", "AB9876543"). Agar bo'lmasa, "".

Hujjat matni:
"""
${textContent.slice(0, 15000)}
"""

Qaytaring faqat toza JSON formatida (hech qanday markdown \`\`\`json belgisiz, faqat JSON):
{
  "detectedClassName": "...",
  "detectedTeacherName": "...",
  "students": [
    { "fullName": "...", "birthDate": "...", "passportOrId": "..." }
  ]
}`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
      });

      const rawOutput = response.text || '';
      const cleanJson = rawOutput.replace(/```json/gi, '').replace(/```/g, '').trim();
      const parsedData = JSON.parse(cleanJson);

      return res.json({
        success: true,
        detectedClassName: parsedData.detectedClassName || '',
        detectedTeacherName: parsedData.detectedTeacherName || '',
        students: Array.isArray(parsedData.students) ? parsedData.students : [],
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
  app.post('/api/telegram/check-auto-notify', async (_req, res) => {
    try {
      await checkAndNotifyCompletedClasses();
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
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
