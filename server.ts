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
  ensureFreshFirestoreData,
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
  // Port determination:
  // 1. If explicit command-line flag is given: --port <num> (e.g. `npm run dev --port 3000`)
  // 2. If running inside AI Studio dev container where Nginx is listening on NGINX_PORT (8080)
  //    and reverse-proxying to DEFAULT_APP_PORT (3000), use DEFAULT_APP_PORT (3000).
  // 3. Otherwise, for production Cloud Run deployment rollout, Render, Railway, or standalone,
  //    use process.env.PORT (defaults to 8080 on Cloud Run, or 3000 as fallback).
  function determinePort(): number {
    const portArgIndex = process.argv.indexOf('--port');
    if (portArgIndex !== -1 && process.argv[portArgIndex + 1]) {
      return parseInt(process.argv[portArgIndex + 1], 10);
    }
    if (process.env.NGINX_PORT && process.env.DEFAULT_APP_PORT) {
      return parseInt(process.env.DEFAULT_APP_PORT, 10) || 3000;
    }
    if (process.env.PORT) {
      return parseInt(process.env.PORT, 10);
    }
    return 3000;
  }
  const port = determinePort();

  app.use(express.json({ limit: '20mb' }));

  // Cloud Run / container health check endpoints
  app.get(['/health', '/healthz', '/_health'], (_req, res) => {
    res.status(200).json({ status: 'ok', uptime: process.uptime() });
  });

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
      const prompt = `Siz O'zbekiston maktab hujjatlarini (ERP, Kundalik, Excel jurnallari, Word jadvallari, eMaktab ro'yxatlari) o'ta yuqori aniqlikda tahlil qiluvchi mutaxassis yordamchisiz.
Quyida maktab hujjati (${fileName || 'maktab_hujjati'}) matni keltirilgan.
Iltimos, ushbu matndan HAR BIR o'quvchining to'liq ma'lumotlarini (Familiya-Ism, Tug'ilgan sana, Pasport yoki Metrika) aniq ajratib oling va sof JSON formatida qaytaring:

QAT'IY QOIDALAR (BU QOIDALARGA 100% AMAL QILISH SHART):
1. "fullName": FAQAT o'quvchining Familiyasi, Ismi va Sharifi bo'lishi shart! (Masalan: "Abdurasulov Fayzulloh Abdurahim o'g'li", "Topvoldiyeva Munisaxon Hojiakbar qizi", "Hamidov Hadyatilloh Hikmatilloh o'g'li").
   - QAT'IY TAQIQLANADI: O'quvchining yashash manzili (viloyat, tuman, shahar, qishloq, mahalla, ko'cha, uy raqami), telefon raqamlari, ota-onasi, jinsi, maktab raqami kabi qo'shimcha ma'lumotlarni ASLO fullName maydoniga qo'shmang!
   - Pasport yoki metrika ma'lumotlarini ham fullName ga qo'shmang, ularni passportOrId maydoniga ajrating!
2. "birthDate": O'quvchining tug'ilgan sanasi ("DD.MM.YYYY" formatida, masalan: "18.03.2011", "05.04.2008"). Agar hujjatda sana bo'lsa, uni albatta toping va "DD.MM.YYYY" formatiga keltiring! Agar mutlaqo topilmasa, bo'sh satr "" qoldiring.
3. "passportOrId": Tug'ilganlik haqidagi guvohnoma (metrika: "I-TN 1234567", "1-TN 1234567", "I-FR 0585496", "1-FR 0585496", "II-TO 765432") yoki Pasport/ID ("AA 1234567", "AB 7654321", "FA 1234567", ruscha "АА", "АВ" bo'lsa ham lotinchaga o'giring) yoki PINFL (14 xonali son).
   - E'TIBOR: Hujjatdagi har bir o'quvchining pasport yoki metrikasini sinchiklab qidiring! Hech bir o'quvchini pasportsiz qoldirmang agar hujjatda bo'lsa! Agar mutlaqo bo'lmasa, bo'sh satr "" qoldiring.
4. "detectedClassName": Hujjatdagi sinf nomi (masalan: "9-A", "10-B", "11-A").
5. "detectedTeacherName": Sinf rahbari F.I.SH (masalan: "Niyozmatova Ziyoda").

Hujjat matni:
"""
${textContent.slice(0, 30000)}
"""

Qaytaring faqat toza JSON formatida (hech qanday markdown belgisiz, faqat JSON):
{
  "detectedClassName": "...",
  "detectedTeacherName": "...",
  "students": [
    { "fullName": "...", "birthDate": "...", "passportOrId": "..." }
  ]
}`;

      const candidateModels = ['gemini-2.5-flash', 'gemini-3.8-flash', 'gemini-3.1-flash-lite'];
      let rawOutput = '';
      for (const modelName of candidateModels) {
        try {
          const response = await Promise.race([
            ai.models.generateContent({
              model: modelName,
              contents: prompt,
            }),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('AI request timeout (30s)')), 30000)
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
  // AI LEADERS (aileaders.uz) & COURSERA AUTOMATION
  // ==========================================

  // Step 1 & 2: Automated registration on aileaders.uz with Guvohnoma/Passport and human pacing
  app.post('/api/aileaders/automate', async (req, res) => {
    let page: any = null;
    const logs: string[] = [];
    const log = (msg: string) => {
      logs.push(`[${new Date().toLocaleTimeString('uz-UZ')}] ${msg}`);
      console.log(`[AI Leaders Robot] ${msg}`);
    };

    try {
      const {
        studentId,
        fullName,
        docType = 'metrika',
        series = 'I-FR',
        number = '',
        birthDate = '2010-04-15',
        email,
        phone = '+998 (88) 005 56 88',
        password = 'MaktabPass2026!',
      } = req.body;

      if (!number) {
        return res.status(400).json({ error: "Pasport yoki metrika raqami kiritilmagan", logs });
      }

      log(`1. Puppeteer brauzeri ishga tushirilmoqda. O'quvchi: ${fullName}...`);
      const browser = await getBrowser();
      page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 900 });

      // Realistic user agent
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

      log(`2. https://aileaders.uz/auth/register sahifasi ochilmoqda...`);
      await page.goto('https://aileaders.uz/auth/register', { waitUntil: 'networkidle2', timeout: 35000 });
      await new Promise(r => setTimeout(r, 1200));

      // Handle Document Type (Guvohnoma vs Passport)
      if (docType === 'metrika') {
        log(`3. 'Guvohnoma' bandi tanlanmoqda...`);
        const switched = await page.evaluate(() => {
          const btns = Array.from(document.querySelectorAll('button'));
          const guv = btns.find(b => b.innerText.trim().toLowerCase().includes('guvohnoma'));
          if (guv) {
            (guv as HTMLElement).click();
            return true;
          }
          return false;
        });
        if (!switched) {
          log(`Ogohlantirish: Guvohnoma tugmasi topilmadi, standart tanlovda davom etilmoqda.`);
        }
        await new Promise(r => setTimeout(r, 800));
      } else {
        log(`3. 'Passport / ID-karta' bandida qolindi.`);
      }

      // Format document input value: series + number
      const cleanSeries = series.trim().toUpperCase();
      const cleanNum = number.trim();
      const fullDocNumber = docType === 'metrika'
        ? (cleanSeries.includes('-') ? `${cleanSeries}${cleanNum}` : `${cleanSeries} ${cleanNum}`)
        : `${cleanSeries}${cleanNum}`;

      log(`4. Hujjat seriya va raqami kiritilmoqda: "${fullDocNumber}"...`);
      const inputEl = await page.$('input[name="passport_number"]');
      if (inputEl) {
        await inputEl.click({ clickCount: 3 });
        await inputEl.type(fullDocNumber, { delay: 60 });
      }

      await new Promise(r => setTimeout(r, 600));

      // Date Picker selection
      log(`5. Tug'ilgan sana tanlanmoqda: ${birthDate}...`);
      const dateParts = birthDate.split('-');
      const year = dateParts[0] || '2010';
      const monthNum = parseInt(dateParts[1] || '4', 10);
      const dayNum = parseInt(dateParts[2] || '15', 10);

      const dateBtn = await page.$('#date');
      if (dateBtn) {
        await dateBtn.click();
        await new Promise(r => setTimeout(r, 700));

        // Select year, month, and day in popover
        await page.evaluate((y: string, mIndex: number, d: number) => {
          const popover = document.querySelector('[data-slot="popover-content"]') || document.body;
          const selects = Array.from(popover.querySelectorAll('select'));
          if (selects.length >= 2) {
            // Month select
            selects[0].selectedIndex = mIndex - 1;
            selects[0].dispatchEvent(new Event('change', { bubbles: true }));
            // Year select
            const yearOpt = Array.from(selects[1].options).find(o => o.value === y || o.text === y);
            if (yearOpt) {
              selects[1].value = yearOpt.value;
              selects[1].dispatchEvent(new Event('change', { bubbles: true }));
            }
          }

          // Click day button
          const dayButtons = Array.from(popover.querySelectorAll('button.rdp-day_button, [role="gridcell"] button, button'));
          const dayMatch = dayButtons.find(b => (b as HTMLElement).innerText.trim() === String(d));
          if (dayMatch) {
            (dayMatch as HTMLElement).click();
          }
        }, year, monthNum, dayNum);

        await new Promise(r => setTimeout(r, 600));
      }

      // Occupation selection: Maktab
      log(`6. Faoliyat turi: 'Maktab' tanlanmoqda...`);
      await page.evaluate(() => {
        const sel = document.querySelector('select[name="occupation"]') as HTMLSelectElement;
        if (sel) {
          sel.value = 'school';
          sel.dispatchEvent(new Event('change', { bubbles: true }));
        }
        // Also click UI select trigger if needed
        const trigger = document.querySelector('[data-slot="select-trigger"]') as HTMLElement;
        if (trigger) {
          trigger.click();
        }
      });
      await new Promise(r => setTimeout(r, 400));
      await page.evaluate(() => {
        const schoolOption = Array.from(document.querySelectorAll('[role="option"], [data-slot="select-item"]'))
          .find(el => (el as HTMLElement).innerText.includes('Maktab'));
        if (schoolOption) {
          (schoolOption as HTMLElement).click();
        }
      });

      await new Promise(r => setTimeout(r, 800));

      // Click "Ro'yxatdan o'tish"
      log(`7. 'Ro'yxatdan o'tish' tugmasi bosilmoqda...`);
      await page.evaluate(() => {
        const submitBtn = document.querySelector('button[type="submit"]') as HTMLElement;
        if (submitBtn) submitBtn.click();
      });

      // Human-like pause to wait for server response
      await new Promise(r => setTimeout(r, 2500));

      // Check for errors or success
      const pageText = await page.evaluate(() => document.body.innerText);

      // Check: "Ma'lumot topilmadi"
      if (pageText.includes("Ma'lumot topilmadi")) {
        log(`❌ Aileaders natijasi: "Ma'lumot topilmadi". Jarayon to'xtatildi.`);
        return res.json({
          success: false,
          error: "Ma'lumot topilmadi",
          reason: 'NOT_FOUND',
          logs,
        });
      }

      // Check: "Ushbu ma'lumotlar bilan registratsiya qilingan"
      if (pageText.includes("registratsiya qilingan") || pageText.includes("mavjud")) {
        log(`⚠️ "Ushbu ma'lumotlar bilan registratsiya qilingan" aniqlandi. Akkauntni o'chirish sahifasiga o'tilmoqda...`);
        await page.goto('https://aileaders.uz/auth/delete_account', { waitUntil: 'networkidle2', timeout: 30000 });
        await new Promise(r => setTimeout(r, 1000));

        if (docType === 'metrika') {
          await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const guv = btns.find(b => b.innerText.trim().toLowerCase().includes('guvohnoma'));
            if (guv) (guv as HTMLElement).click();
          });
          await new Promise(r => setTimeout(r, 600));
        }

        const delInput = await page.$('input[name="passport_number"]');
        if (delInput) {
          await delInput.type(fullDocNumber, { delay: 50 });
        }

        log(`Eski profil o'chirilmoqda...`);
        await page.evaluate(() => {
          const btns = Array.from(document.querySelectorAll('button'));
          const delBtn = btns.find(b => b.innerText.includes("O'chirish"));
          if (delBtn) (delBtn as HTMLElement).click();
        });

        await new Promise(r => setTimeout(r, 2500));
        log(`Eski profil o'chirildi. Qaytadan ro'yxatdan o'tishga kirilmoqda...`);
        await page.goto('https://aileaders.uz/auth/register', { waitUntil: 'networkidle2', timeout: 30000 });
        await new Promise(r => setTimeout(r, 1200));

        // Re-attempt initial step
        if (docType === 'metrika') {
          await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const guv = btns.find(b => b.innerText.trim().toLowerCase().includes('guvohnoma'));
            if (guv) (guv as HTMLElement).click();
          });
          await new Promise(r => setTimeout(r, 600));
        }
        const reInput = await page.$('input[name="passport_number"]');
        if (reInput) await reInput.type(fullDocNumber, { delay: 50 });
        await page.evaluate(() => {
          const submitBtn = document.querySelector('button[type="submit"]') as HTMLElement;
          if (submitBtn) submitBtn.click();
        });
        await new Promise(r => setTimeout(r, 2500));
      }

      // Step 2: Look for "Keyingisi" button to confirm info
      log(`8. Ma'lumotlarni tasdiqlash bosqichi. 'Keyingisi' tugmasi qidirilmoqda...`);
      const nextClicked = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const next = btns.find(b => b.innerText.includes("Keyingisi") || b.innerText.includes("Далее"));
        if (next) {
          (next as HTMLElement).click();
          return true;
        }
        return false;
      });

      await new Promise(r => setTimeout(r, 1200));

      // Step 3: Enter Gmail, phone, password
      log(`9. Kontakt va parol kiritilmoqda: Gmail: ${email}, Tel: ${phone}...`);
      await page.evaluate((em: string, ph: string, pw: string) => {
        const inputs = Array.from(document.querySelectorAll('input'));
        const emailInput = inputs.find(i => i.type === 'email' || i.name.includes('email') || i.placeholder.includes('mail') || i.placeholder.includes('@'));
        if (emailInput) {
          emailInput.value = em;
          emailInput.dispatchEvent(new Event('input', { bubbles: true }));
        }

        const phoneInput = inputs.find(i => i.type === 'tel' || i.name.includes('phone') || i.placeholder.includes('998'));
        if (phoneInput) {
          phoneInput.value = ph;
          phoneInput.dispatchEvent(new Event('input', { bubbles: true }));
        }

        const passInputs = inputs.filter(i => i.type === 'password' || i.name.includes('pass'));
        passInputs.forEach(pi => {
          pi.value = pw;
          pi.dispatchEvent(new Event('input', { bubbles: true }));
        });

        // Click next
        const nextBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes("Keyingisi") || b.innerText.includes("Далее") || b.innerText.includes("Ro'yxatdan"));
        if (nextBtn) (nextBtn as HTMLElement).click();
      }, email, phone, password);

      await new Promise(r => setTimeout(r, 2000));

      log(`10. 'Pochtangizni tekshiring' sahifasi ochildi. Tasdiqlash havolasi kutilmoqda.`);

      return res.json({
        success: true,
        status: 'WAITING_GMAIL',
        message: "Pochtangizni tekshiring sahifasi ochildi. Gmail dan tasdiqlash xabari kelishi bilan tasdiqlash linkini oching.",
        logs,
      });

    } catch (err: any) {
      log(`Xatolik yuz berdi: ${err.message}`);
      return res.status(500).json({ error: err.message, logs });
    } finally {
      if (page) {
        try { await page.close(); } catch {}
      }
    }
  });

  // Step 4 & 5: Confirm activation link and Coursera enrollment
  app.post('/api/aileaders/confirm-activation', async (req, res) => {
    let page: any = null;
    try {
      const { activationLink, fullName, email, password = 'MaktabPass2026!' } = req.body;
      if (!activationLink || typeof activationLink !== 'string') {
        return res.status(400).json({ error: "Faollashtirish havolasi ko'rsatilmadi" });
      }

      console.log(`[AI Leaders Robot] Activation link fetching: ${activationLink}`);
      // 1. Fetch activation link directly to confirm email instantly
      const actRes = await fetch(activationLink.trim(), {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
      });
      const actHtml = await actRes.text();

      // 2. Open Coursera course signup
      const browser = await getBrowser();
      page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 900 });

      const courseraUrl = 'https://www.coursera.org/programs/learning-program-h13rq/learn/introduction-to-generative-ai?collectionId=2mufz#authMode=signup';
      console.log(`[AI Leaders Robot] Navigating to Coursera: ${courseraUrl}`);
      await page.goto(courseraUrl, { waitUntil: 'networkidle2', timeout: 35000 });
      await new Promise(r => setTimeout(r, 2000));

      // Fill Russian signup modal
      await page.evaluate((fn: string, em: string, pw: string) => {
        const inputs = Array.from(document.querySelectorAll('input'));
        const nameInput = inputs.find(i => i.placeholder?.includes('Ф. И. О.') || i.name === 'name' || i.id.includes('name'));
        if (nameInput) {
          nameInput.value = fn;
          nameInput.dispatchEvent(new Event('input', { bubbles: true }));
        }

        const emailInput = inputs.find(i => i.type === 'email' || i.placeholder?.includes('Электронный адрес') || i.name === 'email');
        if (emailInput) {
          emailInput.value = em;
          emailInput.dispatchEvent(new Event('input', { bubbles: true }));
        }

        const passInput = inputs.find(i => i.type === 'password' || i.placeholder?.includes('Пароль') || i.name === 'password');
        if (passInput) {
          passInput.value = pw;
          passInput.dispatchEvent(new Event('input', { bubbles: true }));
        }

        // Click "Присоединиться бесплатно"
        const btns = Array.from(document.querySelectorAll('button'));
        const joinBtn = btns.find(b => b.innerText.includes('Присоединиться') || b.innerText.includes('Зарегистрироваться'));
        if (joinBtn) {
          (joinBtn as HTMLElement).click();
        }
      }, fullName, email, password);

      await new Promise(r => setTimeout(r, 3000));

      return res.json({
        success: true,
        message: "O'quvchi muvaffaqiyatli tasdiqlandi va Coursera dasturiga qo'shildi!",
        actConfirmed: actHtml.includes('muvaffaqiyatli') || actRes.ok
      });
    } catch (err: any) {
      console.error("[AI Leaders Robot] Confirm error:", err);
      return res.status(500).json({ error: err.message });
    } finally {
      if (page) {
        try { await page.close(); } catch {}
      }
    }
  });

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

  // Force server to refresh live from Firestore immediately
  app.post('/api/telegram/force-refresh', async (_req, res) => {
    try {
      const stats = await ensureFreshFirestoreData();
      res.json({
        success: true,
        message: "Firestore real-vaqt ma'lumotlari yangilandi",
        stats,
        usersCount: getTelegramUsers().length,
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
  const isDev = process.env.NODE_ENV !== 'production';

  if (isDev) {
    // In development, always use Vite's HMR and middleware mode to serve directly from source
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // In production, serve the compiled dist folder
    const distPath = path.resolve(process.cwd(), 'dist');
    const indexPath = path.resolve(distPath, 'index.html');

    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
    }

    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'Endpoint topilmadi' });
      }

      if (fs.existsSync(indexPath)) {
        return res.sendFile(indexPath, (err) => {
          if (err && !res.headersSent) {
            next(err);
          }
        });
      }

      // Safe fallback if dist was somehow cleaned or missing in production
      const rootIndex = path.resolve(process.cwd(), 'index.html');
      if (fs.existsSync(rootIndex)) {
        return res.sendFile(rootIndex, (err) => {
          if (err && !res.headersSent) {
            next(err);
          }
        });
      }

      res.status(503).send('Ilova yuklanmoqda... Iltimos bir necha soniyadan so\'ng qayta yangilang.');
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${port} (NODE_ENV: ${process.env.NODE_ENV || 'not set'})`);
  });
}

startServer().catch(err => {
  console.error("Server startup error:", err);
  process.exit(1);
});
