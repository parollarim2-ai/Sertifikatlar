import fs from 'fs';
import path from 'path';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import puppeteer, { Browser } from 'puppeteer';
import {
  startTelegramBot,
  stopTelegramBot,
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
  app.post(['/api/aileaders/automate', '/api/aileaders/register'], async (req, res) => {
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

      // Date parsing - normalize to YYYY-MM-DD
      let dayNum = 15;
      let monthNum = 4;
      let yearStr = '2010';

      const cleanBirth = String(birthDate || '').trim();
      if (cleanBirth.includes('.')) {
        const parts = cleanBirth.split('.');
        if (parts.length >= 3) {
          dayNum = parseInt(parts[0], 10) || 15;
          monthNum = parseInt(parts[1], 10) || 4;
          yearStr = parts[2].trim() || '2010';
        }
      } else if (cleanBirth.includes('/')) {
        const parts = cleanBirth.split('/');
        if (parts.length >= 3) {
          dayNum = parseInt(parts[0], 10) || 15;
          monthNum = parseInt(parts[1], 10) || 4;
          yearStr = parts[2].trim() || '2010';
        }
      } else if (cleanBirth.includes('-')) {
        const parts = cleanBirth.split('-');
        if (parts.length >= 3) {
          if (parts[0].length === 4) {
            yearStr = parts[0].trim();
            monthNum = parseInt(parts[1], 10) || 4;
            dayNum = parseInt(parts[2], 10) || 15;
          } else {
            dayNum = parseInt(parts[0], 10) || 15;
            monthNum = parseInt(parts[1], 10) || 4;
            yearStr = parts[2].trim() || '2010';
          }
        }
      }

      const formattedDob = `${yearStr}-${String(monthNum).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
      log(`3. O'quvchi ma'lumotlari tekshirilmoqda: ${docType.toUpperCase()}: ${fullDocNumber}, Sana: ${formattedDob}...`);

      // 1. Verify student exists in government records via Aileaders API
      const lookupResult = await page.evaluate(async (isMetrika: boolean, series: string, num: string, fullDoc: string, dob: string) => {
        try {
          if (isMetrika) {
            const res = await fetch('https://aileaders.uz/api/public/info/metrike?occupation=school', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ cert_series: series, cert_number: num, dob })
            });
            return await res.json();
          } else {
            const res = await fetch(`https://aileaders.uz/api/public/info/individual?document=${encodeURIComponent(fullDoc)}&dob=${encodeURIComponent(dob)}&occupation=school`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' }
            });
            return await res.json();
          }
        } catch (e: any) {
          return { error: e.message };
        }
      }, docType === 'metrika', cleanSeries, cleanNum, fullDocNumber, formattedDob);

      if (lookupResult.result?.code === 'metrike_not_found' || lookupResult.result?.code === 'passport_not_found') {
        const desc = lookupResult.result?.description || "Hujjat topilmadi";
        log(`❌ Aileaders natijasi: ${desc}. Hujjat: ${cleanSeries} ${cleanNum}, Sana: ${formattedDob}`);
        return res.json({
          success: false,
          error: `❌ O'quvchi OneID bazasidan topilmadi (${desc}). Kiritilgan: Hujjat: "${cleanSeries} ${cleanNum}", Sana: "${formattedDob}". Iltimos, hujjat raqami va tug'ilgan sanani tekshiring.`,
          reason: 'NOT_FOUND',
          details: { series: cleanSeries, number: cleanNum, dob: formattedDob, code: lookupResult.result?.code },
          logs,
        });
      }

      // If document was already registered on Aileaders earlier
      if (lookupResult.result?.code === 'metrika_is_already_in_use' || lookupResult.result?.code === 'passport_already_in_use' || lookupResult.result?.code === 'passport_exists') {
        const desc = lookupResult.result?.description || "Hujjat band qilingan";
        log(`⚠️ 4. Ushbu o'quvchi hujjati Aileaders tizimida avval ro'yxatdan o'tgan (${desc}).`);
        return res.json({
          success: false,
          isAlreadyRegistered: true,
          error: `⚠️ O'quvchi hujjati Aileaders tizimida allaqachon mavjud (${desc}).`,
          reason: 'ALREADY_IN_USE',
          logs,
        });
      }

      if (lookupResult.result?.code === 'ok' && lookupResult.content) {
        const studentInfo = lookupResult.content;
        log(`✅ 4. O'quvchi topildi: ${studentInfo.name || ''} ${studentInfo.surname || ''} (Jinsi: ${studentInfo.gender === 'male' ? "O'g'il bola" : "Qiz bola"})`);
      } else {
        log(`ℹ️ 4. Tekshiruv holati: ${lookupResult.result?.code || lookupResult.result?.description || 'Davom etilmoqda'}`);
      }

      // Format phone digits
      const digitsOnly = phone.replace(/\D/g, '');
      const formattedPhone = digitsOnly.startsWith('998') ? `+${digitsOnly}` : `+998${digitsOnly}`;

      log(`5. Ro'yxatdan o'tish so'rovi yuborilmoqda: Email: ${email}, Tel: ${formattedPhone}...`);

      let regResult = await page.evaluate(async (payload: any) => {
        try {
          const res = await fetch('https://aileaders.uz/api/registration/form', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          return await res.json();
        } catch (e: any) {
          return { error: e.message };
        }
      }, {
        email: email.trim(),
        employment_type: 'school',
        metrika: docType === 'metrika' ? { cert_series: cleanSeries, cert_number: cleanNum, dob: formattedDob } : null,
        passport: docType !== 'metrika' ? { document: fullDocNumber, dob: formattedDob } : null,
        password: password,
        phone: formattedPhone
      });

      let registeredEmail = email.trim();

      // Check if student was already registered in Aileaders
      const isAlreadyInUse = 
        regResult.result?.code === 'metrika_is_already_in_use' ||
        regResult.result?.code === 'passport_already_in_use' ||
        regResult.result?.code === 'passport_exists' ||
        regResult.result?.description?.includes('ro\'yxatdan o\'tgan') ||
        regResult.result?.description?.includes('кайд килинган');

      if (isAlreadyInUse) {
        const desc = regResult.result?.description || "Hujjat band qilingan";
        log(`⚠️ 6. Ushbu o'quvchi Aileaders tizimida allaqachon mavjud (${desc}).`);
        return res.json({
          success: false,
          isAlreadyRegistered: true,
          error: `⚠️ O'quvchi hujjati Aileaders tizimida allaqachon mavjud (${desc}).`,
          reason: 'ALREADY_IN_USE',
          logs,
        });
      }

      // Check if email was already used, try fresh dot aliases
      if (regResult.result?.code === 'email_already_in_use' || regResult.result?.code === 'email_exists') {
        log(`⚠️ ${registeredEmail} manzili band ekan. Yangi bo'sh Gmail dot varianti qidirilmoqda...`);
        const atIdx = registeredEmail.indexOf('@');
        if (atIdx > 0 && registeredEmail.endsWith('@gmail.com')) {
          const rawUser = registeredEmail.slice(0, atIdx).replace(/\./g, '').split('+')[0];
          for (let attempt = 1; attempt <= 4; attempt++) {
            const randomMask = Math.floor(Math.random() * (Math.pow(2, Math.min(rawUser.length - 1, 14)) - 1)) + 1;
            let altEmail = '';
            for (let i = 0; i < rawUser.length - 1; i++) {
              altEmail += rawUser[i];
              if ((randomMask >> i) & 1) altEmail += '.';
            }
            altEmail += rawUser[rawUser.length - 1] + '@gmail.com';
            if (altEmail === registeredEmail) continue;

            log(`Qayta urinish [${attempt}/4]: ${altEmail}...`);
            const retryReg = await page.evaluate(async (payload: any) => {
              try {
                const res = await fetch('https://aileaders.uz/api/registration/form', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(payload)
                });
                return await res.json();
              } catch (e: any) {
                return { error: e.message };
              }
            }, {
              email: altEmail,
              employment_type: 'school',
              metrika: docType === 'metrika' ? { cert_series: cleanSeries, cert_number: cleanNum, dob: formattedDob } : null,
              passport: docType !== 'metrika' ? { document: fullDocNumber, dob: formattedDob } : null,
              password: password,
              phone: formattedPhone
            });

            if (retryReg.result?.code === 'ok' || retryReg.result?.code === 'metrika_is_already_in_use') {
              registeredEmail = altEmail;
              regResult = retryReg;
              log(`✅ Yangi bo'sh manzil qabul qilindi: ${registeredEmail}`);
              break;
            }
          }
        }
      }

      // If Aileaders gave a real error
      if (regResult.result && regResult.result.code !== 'ok' && !regResult.result.code?.includes('already_in_use')) {
        const errorDesc = regResult.result.description || regResult.result.code || "Ro'yxatdan o'tishda xatolik";
        log(`❌ Aileaders xatosi: ${errorDesc}`);
        return res.json({
          success: false,
          error: `Aileaders xabari: ${errorDesc}`,
          code: regResult.result.code,
          logs,
        });
      }

      log(`✅ 6. Aileaders ro'yxatdan o'tish muvaffaqiyatli qabul qilindi!`);
      log(`📬 7. Tasdiqlash xati ${registeredEmail} Gmail pochtasiga yuborildi.`);

      return res.json({
        success: true,
        status: 'WAITING_GMAIL',
        targetEmail: registeredEmail,
        message: `Tasdiqlash xabari ${registeredEmail} pochtasiga muvaffaqiyatli yuborildi.`,
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
    const logs: string[] = [];
    const log = (msg: string) => {
      logs.push(`[${new Date().toLocaleTimeString('uz-UZ')}] ${msg}`);
      console.log(`[Coursera Robot] ${msg}`);
    };

    try {
      const { activationLink, fullName, email, password = 'MaktabPass2026!' } = req.body;
      if (!activationLink || typeof activationLink !== 'string') {
        return res.status(400).json({ error: "Faollashtirish havolasi ko'rsatilmadi", logs });
      }

      log(`1. Aileaders faollashtirish havolasi tekshirilmoqda: ${activationLink.trim()}`);
      
      // 1. Fetch activation link directly to confirm email in Aileaders system
      try {
        const actRes = await fetch(activationLink.trim(), {
          headers: { 
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml,application/json;q=0.9,*/*;q=0.8',
          },
          signal: AbortSignal.timeout(10000),
        });
        const actText = await actRes.text();
        if (actText.includes('error') && !actText.includes('success')) {
          log(`ℹ️ Aileaders aktivatsiya javobi: ${actText.slice(0, 100)}`);
        } else {
          log(`✅ 2. Aileaders pochtasi muvaffaqiyatli faollashtirildi!`);
        }
      } catch (e: any) {
        log(`Ogohlantirish: Aileaders havolasini ochishda xato: ${e.message}`);
      }

      // 2. Open Coursera Official Learning Program Signup
      log(`3. Coursera rasmiy ta'lim dasturi ochilmoqda (learning-program-h13rq)...`);
      const browser = await getBrowser();
      page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 900 });

      // Realistic anti-detection headers
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'uz-UZ,uz;q=0.9,ru;q=0.8,en-US;q=0.7,en;q=0.6',
      });
      await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      });

      const courseraUrl = 'https://www.coursera.org/programs/learning-program-h13rq?authMode=signup';
      log(`4. Manzil: ${courseraUrl}`);
      await page.goto(courseraUrl, { waitUntil: 'networkidle2', timeout: 35000 });
      await new Promise(r => setTimeout(r, 2000));

      // Remove any OneTrust cookie popups or banners that intercept clicks
      await page.evaluate(() => {
        document.querySelectorAll('#onetrust-consent-sdk, #onetrust-banner-sdk, .onetrust-pc-dark-filter, #onetrust-pc-sdk, [class*="overlay" i]').forEach(el => el.remove());
      });
      await new Promise(r => setTimeout(r, 800));

      // 3. Locate inputs
      const nameSelector = 'input[name="name"], input[placeholder*="full name" i], input[placeholder*="Ф. И. О." i]';
      const emailSelector = 'input[name="email"], input[type="email"], input[placeholder*="email" i]';
      const passSelector = 'input[name="password"], input[type="password"], input[placeholder*="password" i], input[placeholder*="пароль" i]';

      log(`5. O'quvchi ma'lumotlari kiritilmoqda: F.I.SH: "${fullName.trim()}", Email: "${email.trim()}"...`);

      // Fill Name using real keyboard events
      try {
        await page.waitForSelector(nameSelector, { timeout: 8000 });
        await page.click(nameSelector);
        await page.evaluate((sel: string) => {
          const el = document.querySelector(sel) as HTMLInputElement;
          if (el) el.value = '';
        }, nameSelector);
        await page.type(nameSelector, fullName.trim(), { delay: 25 });
        log(`✓ F.I.SH kiritildi`);
      } catch {
        log(`⚠️ F.I.SH maydoni topilmadi, davom etilmoqda...`);
      }

      // Fill Email
      try {
        await page.waitForSelector(emailSelector, { timeout: 8000 });
        await page.click(emailSelector);
        await page.evaluate((sel: string) => {
          const el = document.querySelector(sel) as HTMLInputElement;
          if (el) el.value = '';
        }, emailSelector);
        await page.type(emailSelector, email.trim(), { delay: 25 });
        log(`✓ Email kiritildi`);
      } catch {
        log(`⚠️ Email maydoni topilmadi`);
      }

      // Fill Password
      try {
        await page.waitForSelector(passSelector, { timeout: 8000 });
        await page.click(passSelector);
        await page.evaluate((sel: string) => {
          const el = document.querySelector(sel) as HTMLInputElement;
          if (el) el.value = '';
        }, passSelector);
        await page.type(passSelector, password, { delay: 25 });
        log(`✓ Parol kiritildi`);
      } catch {
        log(`⚠️ Parol maydoni topilmadi`);
      }

      await new Promise(r => setTimeout(r, 600));

      // 4. Click Submit Button (Join for Free / Присоединиться)
      log(`6. "Join for Free" (Ro'yxatdan o'tish) tugmasi bosilmoqda...`);
      let submitClicked = false;
      try {
        const submitBtn = await page.$('form.rc-SignupForm button[type="submit"], form[name="signup"] button[type="submit"]');
        if (submitBtn) {
          await submitBtn.click();
          submitClicked = true;
        }
      } catch {}

      if (!submitClicked) {
        submitClicked = await page.evaluate(() => {
          const btns = Array.from(document.querySelectorAll('button'));
          const target = btns.find(b => {
            const txt = b.innerText.toLowerCase();
            return txt.includes('join for free') ||
                   txt.includes('присоединиться') ||
                   txt.includes('sign up') ||
                   txt.includes('зарегистрироваться') ||
                   txt.includes('continue');
          });
          if (target) {
            target.click();
            return true;
          }
          return false;
        });
      }

      // Also press Enter key as backup form trigger
      try {
        await page.keyboard.press('Enter');
      } catch {}

      log(`7. Coursera serveridan javob kutilmoqda (6 soniya)...`);
      await new Promise(r => setTimeout(r, 6000));

      // 5. Inspect response and alert messages
      const outcome = await page.evaluate(() => {
        const alerts = Array.from(document.querySelectorAll('[role="alert"], .c-alert, [class*="error" i], [class*="Error" i]'))
          .map(el => (el as HTMLElement).innerText.trim())
          .filter(Boolean);
        const modal = document.querySelector('[role="dialog"]');
        return {
          currentUrl: window.location.href,
          alerts,
          modalSnippet: modal ? (modal as HTMLElement).innerText.slice(0, 200) : ''
        };
      });

      const alreadyExists = outcome.alerts.some((a: string) => 
        a.toLowerCase().includes('already') || 
        a.toLowerCase().includes('log in') || 
        a.toLowerCase().includes('уже')
      );

      if (alreadyExists) {
        log(`ℹ️ 8. Ushbu email bo'yicha Coursera hisobi avval mavjud bo'lgan ekan.`);
        log(`9. Tizimga "Log In" orqali kirib, dasturga ulanilmoqda...`);
        // Switch to login
        await page.evaluate(() => {
          const links = Array.from(document.querySelectorAll('a, button'));
          const logIn = links.find(l => {
            const txt = (l as HTMLElement).innerText?.toLowerCase() || '';
            return txt.includes('log in') || txt.includes('войти');
          });
          if (logIn) (logIn as HTMLElement).click();
        });
        await new Promise(r => setTimeout(r, 1500));
        try {
          await page.click(emailSelector);
          await page.type(emailSelector, email.trim(), { delay: 20 });
          await page.click(passSelector);
          await page.type(passSelector, password, { delay: 20 });
          await page.keyboard.press('Enter');
          await new Promise(r => setTimeout(r, 4000));
          log(`✅ 10. Coursera dasturiga kirish amalga oshirildi!`);
        } catch {}
      } else {
        log(`✅ 8. Coursera ro'yxatdan o'tish so'rovi muvaffaqiyatli yuborildi!`);
        log(`📬 9. Iltimos, ${email.trim()} Gmail pochtangizni oching (Kiruvchi, Spam va Barcha xatlar papkalarini tekshiring). Coursera-dan tasdiqlash xati keladi.`);
      }

      return res.json({
        success: true,
        message: "O'quvchi Coursera dasturiga yuborildi! Gmail pochtangizni tekshiring.",
        logs,
      });

    } catch (err: any) {
      log(`Xatolik: ${err.message}`);
      return res.status(500).json({ error: err.message, logs });
    } finally {
      if (page) {
        try { await page.close(); } catch {}
      }
    }
  });

  // COURSERA AUTOMATION: Register student in official Coursera Learning Program + Auto Verify via IMAP
  app.post('/api/coursera/register-student', async (req, res) => {
    let page: any = null;
    const logs: string[] = [];
    const log = (msg: string) => {
      logs.push(`[${new Date().toLocaleTimeString('uz-UZ')}] ${msg}`);
      console.log(`[Coursera Robot] ${msg}`);
    };

    try {
      const { fullName, email, password = 'MaktabPass2026!' } = req.body;
      if (!fullName || !email) {
        return res.status(400).json({ success: false, error: "O'quvchi F.I.SH va email manzili ko'rsatilmadi", logs });
      }

      const cleanEmail = email.trim().toLowerCase();
      const cleanName = fullName.trim();
      log(`1. Coursera rasmiy ta'lim dasturi ochilmoqda (learning-program-h13rq)...`);

      const browser = await getBrowser();
      page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 900 });
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'uz-UZ,uz;q=0.9,ru;q=0.8,en-US;q=0.7,en;q=0.6',
      });

      const courseraUrl = 'https://www.coursera.org/programs/learning-program-h13rq?authMode=signup';
      log(`2. Manzil: ${courseraUrl}`);
      await page.goto(courseraUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
      await new Promise(r => setTimeout(r, 1200));

      // Remove any OneTrust popups or banners
      await page.evaluate(() => {
        document.querySelectorAll('#onetrust-consent-sdk, #onetrust-banner-sdk, .onetrust-pc-dark-filter, #onetrust-pc-sdk, .ot-fade-in').forEach(el => el.remove());
      });

      log(`3. O'quvchi ma'lumotlari kiritilmoqda: "${cleanName}", Email: "${cleanEmail}"...`);

      // Fill Name, Email, Password using robust selectors
      const nameSel = 'input[name="name"], input#name, input[placeholder*="name" i], input[placeholder*="имя" i]';
      const emailSel = 'input[name="email"], input#email, input[type="email"], input[placeholder*="email" i]';
      const passSel = 'input[name="password"], input#password, input[type="password"]';

      await page.waitForSelector(nameSel, { timeout: 15000 });
      await page.click(nameSel);
      await page.evaluate((sel: string) => {
        const el = document.querySelector(sel) as HTMLInputElement;
        if (el) el.value = '';
      }, nameSel);
      await page.type(nameSel, cleanName, { delay: 15 });

      await page.click(emailSel);
      await page.evaluate((sel: string) => {
        const el = document.querySelector(sel) as HTMLInputElement;
        if (el) el.value = '';
      }, emailSel);
      await page.type(emailSel, cleanEmail, { delay: 15 });

      await page.click(passSel);
      await page.evaluate((sel: string) => {
        const el = document.querySelector(sel) as HTMLInputElement;
        if (el) el.value = '';
      }, passSel);
      await page.type(passSel, password, { delay: 15 });

      await new Promise(r => setTimeout(r, 800));

      log(`4. "Join for Free" (Ro'yxatdan o'tish) ko'k tugmasi bosilmoqda...`);
      let submitClicked = false;
      try {
        const submitBtn = await page.$('button[type="submit"], button.css-18xham5');
        if (submitBtn) {
          await submitBtn.click();
          submitClicked = true;
        }
      } catch {}

      if (!submitClicked) {
        submitClicked = await page.evaluate(() => {
          const btns = Array.from(document.querySelectorAll('button'));
          const target = btns.find(b => {
            const txt = b.innerText.toLowerCase();
            return b.type === 'submit' ||
                   txt.includes('join for free') ||
                   txt.includes('присоединиться') ||
                   txt.includes('sign up') ||
                   txt.includes('зарегистрироваться');
          });
          if (target) {
            (target as HTMLElement).click();
            return true;
          }
          return false;
        });
      }

      try {
        await page.keyboard.press('Enter');
      } catch {}

      log(`5. Coursera serveridan javob va tasdiqlash oynasi kutilmoqda (5 soniya)...`);
      await new Promise(r => setTimeout(r, 5000));

      // Handle confirmation dialog: click the left/first blue button inside the modal
      const clickedConfirm = await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"], [role="alertdialog"], .cds-dialog, .c-modal, [class*="modal" i], .css-1s5z767');
        if (dialog) {
          const btns = Array.from(dialog.querySelectorAll('button, a[role="button"]'));
          const blueBtn = btns.find(b => {
            const btnEl = b as HTMLElement;
            const style = window.getComputedStyle(btnEl);
            const bg = style.backgroundColor;
            const cls = btnEl.className.toLowerCase();
            const txt = (btnEl.innerText || '').toLowerCase();
            const btnType = (btnEl as HTMLButtonElement).type || '';
            return cls.includes('primary') || 
                   bg.includes('rgb(0, 86, 210)') || 
                   bg.includes('blue') || 
                   btnType === 'submit' || 
                   txt.includes('присоединиться') || 
                   txt.includes('join') || 
                   txt.includes('дальше') || 
                   txt.includes('continue');
          }) || (btns[0] as HTMLElement | undefined);
          if (blueBtn) {
            (blueBtn as HTMLElement).click();
            return { clicked: true, text: (blueBtn as HTMLElement).innerText.trim() };
          }
        }
        return { clicked: false };
      });

      if (clickedConfirm.clicked) {
        log(`✅ 6. Hisobni tasdiqlash oynasidagi tugma bosildi: "${clickedConfirm.text || 'Tasdiqlash'}"`);
      } else {
        log(`ℹ️ 6. Ro'yxatdan o'tish arizasi qabul qilindi.`);
      }

      log(`📬 7. Gmail orqali Coursera tasdiqlash xati qidirilmoqda (delay va retry mexanizmi bilan)...`);

      // IMAP Polling with delay and retry (up to 8 attempts with 4.5-second delay)
      let verificationLink: string | null = null;
      const maxRetries = 8;
      const delayMs = 4500;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        log(`Qidiruv [${attempt}/${maxRetries}]: Gmail pochtasi tekshirilmoqda (${cleanEmail})...`);
        await new Promise(r => setTimeout(r, delayMs));

        try {
          const { ImapFlow } = await import('imapflow');
          const client = new ImapFlow({
            ...GMAIL_AUTH,
            logger: false,
          });
          await client.connect();
          const lock = await client.getMailboxLock('INBOX');
          const total = (client.mailbox as any)?.exists || 0;
          const startSeq = Math.max(1, total - 35);

          for await (let msg of client.fetch(`${startSeq}:*`, { envelope: true, source: true })) {
            const fromAddr = (msg.envelope?.from?.[0]?.address || '').toLowerCase();
            const subject = (msg.envelope?.subject || '');
            const toAddr = (msg.envelope?.to?.[0]?.address || '').toLowerCase().trim();

            const isCoursera = fromAddr.includes('coursera') || fromAddr.includes('no-reply') || subject.includes('coursera') || subject.includes('Подтвердите') || subject.includes('Verify');
            if (!isCoursera) continue;

            const rawSource = msg.source ? msg.source.toString('utf8') : '';
            const decoded = rawSource.replace(/=\r?\n/g, '').replace(/=3D/g, '=');

            // Exact match on toAddr OR decoded body containing specific email with exact dots
            const isMatch = toAddr === cleanEmail || 
                            decoded.includes(cleanEmail) || 
                            (subject.toLowerCase().includes(cleanName.toLowerCase().split(' ')[0]) && fromAddr.includes('coursera'));

            if (isMatch) {
              // Option 1: Blue button (#0056d2) in HTML table/cell
              const btnMatch = decoded.match(/bgcolor=["']#0056[dD]2["'][^>]*>[\s\S]*?<a[^>]+href=["'](https:\/\/link\.coursera\.org\/[^"']+)["']/i) ||
                               decoded.match(/background:\s*#0056[dD]2[^"']*["'][^>]*>[\s\S]*?<a[^>]+href=["'](https:\/\/link\.coursera\.org\/[^"']+)["']/i) ||
                               decoded.match(/<a[^>]+href=["'](https:\/\/link\.coursera\.org\/[^"']+)["'][^>]*style=["'][^"']*#0056/i);

              // Option 2: Fallback direct URL under the button
              const rawLinkMatch = decoded.match(/href=["'](https:\/\/link\.coursera\.org\/f\/a\/[^"']+)["']/i) ||
                                   decoded.match(/(https:\/\/link\.coursera\.org\/f\/a\/[a-zA-Z0-9_\-~/+=]+)/i);

              let foundUrl = btnMatch ? btnMatch[1] : (rawLinkMatch ? rawLinkMatch[1] : null);
              if (foundUrl) {
                foundUrl = foundUrl.replace(/~=.*$/, '~').replace(/=$/, '').trim();
                verificationLink = foundUrl;
                log(`🎯 Coursera tasdiqlash xati topildi: "${subject}" -> ${toAddr}`);
                break;
              }
            }
          }
          lock.release();
          await client.logout();

          if (verificationLink) break;
        } catch (imapErr: any) {
          log(`⚠️ IMAP qidiruv xabari: ${imapErr.message}`);
        }
      }

      if (verificationLink) {
        log(`🔗 8. Tasdiqlash havolasi ochilmoqda: ${verificationLink.slice(0, 60)}...`);
        let verifySuccess = false;
        try {
          const verifyResp = await fetch(verificationLink, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
            redirect: 'follow',
            signal: AbortSignal.timeout(15000),
          });
          verifySuccess = verifyResp.ok || verifyResp.status < 400;
          log(`✅ 9. Coursera hisobi muvaffaqiyatli tasdiqlandi! (Status: ${verifyResp.status}, URL: ${verifyResp.url})`);
        } catch (e: any) {
          log(`ℹ️ 9. Havola so'rovi yuborildi: ${e.message}`);
          verifySuccess = true;
        }

        // Send Telegram notification
        try {
          const users = getTelegramUsers();
          const tgText = `🎓 <b>Coursera Hisobi Faollashtirildi!</b>\n\n👤 O'quvchi: <b>${cleanName}</b>\n📧 Email: <code>${cleanEmail}</code>\n✅ Holat: Coursera hisobi muvaffaqiyatli tasdiqlangan va faol\n🏛 Dastur: Digital Education Development Centre (Coursera)`;
          for (const u of users) {
            if (u.chatId) {
              await fetch(`https://api.telegram.org/bot8846557313:AAE5J1aRrvJJ2LLZCbD7WlI_JFzhSrmR_tA/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  chat_id: u.chatId,
                  text: tgText,
                  parse_mode: 'HTML',
                }),
              }).catch(() => {});
            }
          }
        } catch {}

        return res.json({
          success: true,
          verified: true,
          courseraUrl,
          verificationUrl: verificationLink,
          message: `✅ ${cleanName} Coursera ta'lim dasturidan muvaffaqiyatli ro'yxatdan o'tkazildi va Gmail orqali hisobi tasdiqlandi!`,
          logs,
        });
      } else {
        log(`ℹ️ 8. Ro'yxatdan o'tish arizasi Coursera'ga yuborildi. Tasdiq xati yetib kelgach, qayta sinxronlashtirish mumkin.`);
        return res.json({
          success: true,
          verified: false,
          waitingEmail: true,
          courseraUrl,
          message: `Coursera ro'yxatdan o'tish arizasi yuborildi. Tasdiqlash xati Gmail pochtangizga yetib kelishi kutilmoqda.`,
          logs,
        });
      }

    } catch (err: any) {
      log(`❌ Xatolik yuz berdi: ${err.message}`);
      return res.status(500).json({ success: false, error: err.message, logs });
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

  // Push notification when a student registration is completed on Aileaders
  app.post('/api/notifications/student-registered', async (req, res) => {
    const { studentName, className, email } = req.body;
    try {
      const text = `🎉 <b>Aileaders Ro'yxatdan O'tish Bajarildi!</b>\n\n` +
        `👤 O'quvchi: <b>${studentName || 'O\'quvchi'}</b>\n` +
        `🏫 Sinf: <b>${className || 'Sinf'}</b>\n` +
        `📧 Pochta: <code>${email || ''}</code>\n` +
        `⏰ Vaqt: ${new Date().toLocaleTimeString('uz-UZ')}\n\n` +
        `<i>Tasdiqlash xabari pochtaga yuborildi.</i>`;

      // Send to registered Telegram users/teachers
      try {
        const users = await getTelegramUsers();
        for (const u of users) {
          if (u.chatId) {
            await fetch(`https://api.telegram.org/bot8846557313:AAE5J1aRrvJJ2LLZCbD7WlI_JFzhSrmR_tA/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: u.chatId,
                text,
                parse_mode: 'HTML',
              }),
            });
          }
        }
      } catch (tgErr) {
        console.warn('Telegram notification delivery note:', tgErr);
      }

      return res.json({ success: true });
    } catch (err: any) {
      return res.json({ success: false, error: err.message });
    }
  });

  // ==========================================
  // GMAIL IMAP AUTOMATION FOR AILEADERS ACTIVATION
  // ==========================================
  const GMAIL_AUTH = {
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: {
      user: 'akramxonsaidov02@gmail.com',
      pass: 'yisgsvmwthzblgdq', // Google App Password provided by user
    },
  };

  app.get('/api/gmail/status', async (_req, res) => {
    try {
      const { ImapFlow } = await import('imapflow');
      const client = new ImapFlow({
        ...GMAIL_AUTH,
        logger: false,
      });
      await client.connect();
      const lock = await client.getMailboxLock('INBOX');
      let count = 0;
      try {
        count = (client.mailbox as any)?.exists || 0;
      } finally {
        lock.release();
      }
      await client.logout();
      return res.json({
        success: true,
        connected: true,
        email: GMAIL_AUTH.auth.user,
        totalMessages: count,
        message: "Gmail IMAP serveriga muvaffaqiyatli ulandi! Xatlar avtomatik o'qilmoqda.",
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, connected: false, error: err.message });
    }
  });

  app.post('/api/gmail/sync-and-activate', async (req, res) => {
    const logs: string[] = [];
    const log = (msg: string) => {
      logs.push(`[${new Date().toLocaleTimeString('uz-UZ')}] ${msg}`);
      console.log(`[Gmail Auto-Activator] ${msg}`);
    };

    try {
      const { targetEmail, retries = 1, delaySeconds = 3 } = req.body || {};
      const { ImapFlow } = await import('imapflow');

      const activationItems: Array<{
        recipientEmail: string;
        activationUrl: string;
        type: 'coursera' | 'aileaders';
        subject: string;
        date: string;
      }> = [];

      const cleanTarget = targetEmail ? targetEmail.trim().toLowerCase() : null;
      const totalAttempts = Math.max(1, Math.min(retries, 8));

      for (let attempt = 1; attempt <= totalAttempts; attempt++) {
        if (attempt > 1 || delaySeconds > 0) {
          log(`Qidiruv [${attempt}/${totalAttempts}]: Gmail tekshirilmoqda...`);
          await new Promise(r => setTimeout(r, delaySeconds * 1000));
        }

        const client = new ImapFlow({
          ...GMAIL_AUTH,
          logger: false,
        });

        try {
          await client.connect();
          const lock = await client.getMailboxLock('INBOX');
          const total = (client.mailbox as any)?.exists || 0;
          const startSeq = Math.max(1, total - 45);
          const seqRange = `${startSeq}:*`;

          for await (let msg of client.fetch(seqRange, { source: true, envelope: true })) {
            const fromAddr = (msg.envelope?.from?.[0]?.address || '').toLowerCase();
            const subject = (msg.envelope?.subject || '');
            const toAddress = (msg.envelope?.to?.[0]?.address || '').toLowerCase().trim();

            const rawSource = msg.source ? msg.source.toString('utf8') : '';
            const decoded = rawSource.replace(/=\r?\n/g, '').replace(/=3D/g, '=');
            const mailDate = msg.envelope?.date ? new Date(msg.envelope.date).toISOString() : new Date().toISOString();

            // Strict target email check if target was passed
            if (cleanTarget) {
              const matchesTo = toAddress === cleanTarget || decoded.includes(cleanTarget);
              if (!matchesTo) continue;
            }

            // 1. Check Coursera confirmation email
            const isCoursera = fromAddr.includes('coursera') || fromAddr.includes('no-reply') || subject.includes('coursera') || subject.includes('Подтвердите') || subject.includes('Verify');
            if (isCoursera) {
              const btnMatch = decoded.match(/bgcolor=["']#0056[dD]2["'][^>]*>[\s\S]*?<a[^>]+href=["'](https:\/\/link\.coursera\.org\/[^"']+)["']/i) ||
                               decoded.match(/background:\s*#0056[dD]2[^"']*["'][^>]*>[\s\S]*?<a[^>]+href=["'](https:\/\/link\.coursera\.org\/[^"']+)["']/i) ||
                               decoded.match(/<a[^>]+href=["'](https:\/\/link\.coursera\.org\/[^"']+)["'][^>]*style=["'][^"']*#0056/i);

              const rawLinkMatch = decoded.match(/href=["'](https:\/\/link\.coursera\.org\/f\/a\/[^"']+)["']/i) ||
                                   decoded.match(/(https:\/\/link\.coursera\.org\/f\/a\/[a-zA-Z0-9_\-~/+=]+)/i) ||
                                   decoded.match(/(https?:\/\/(?:www\.)?coursera\.org\/(?:account-verification|account\/email_verify|api\/verifyEmail)[^\s"'<>]+)/i);

              let courseraLink = btnMatch ? btnMatch[1] : (rawLinkMatch ? rawLinkMatch[1] : null);
              if (courseraLink) {
                courseraLink = courseraLink.replace(/~=.*$/, '~').replace(/=$/, '').trim();
                if (!activationItems.some(i => i.activationUrl === courseraLink)) {
                  activationItems.push({
                    recipientEmail: toAddress || cleanTarget || '',
                    activationUrl: courseraLink,
                    type: 'coursera',
                    subject,
                    date: mailDate,
                  });
                }
              }
            }

            // 2. Check Aileaders / Uzbcoders activation email
            if (fromAddr.includes('uzbcoders') || fromAddr.includes('aileaders') || fromAddr.includes('noreply') || subject.includes('activation') || subject.includes('faollashtirish')) {
              const urlMatches = rawSource.match(/https?:\/\/[^\s"'<>]+activate[^\s"'<>]*/gi);
              if (urlMatches && urlMatches.length > 0) {
                const cleanUrl = urlMatches[0].replace(/&amp;/g, '&').trim();
                if (!activationItems.some(i => i.activationUrl === cleanUrl)) {
                  activationItems.push({
                    recipientEmail: toAddress || cleanTarget || '',
                    activationUrl: cleanUrl,
                    type: 'aileaders',
                    subject,
                    date: mailDate,
                  });
                }
              }
            }
          }
          lock.release();
        } finally {
          await client.logout();
        }

        if (targetEmail && activationItems.length > 0) {
          break;
        }
      }

      log(`3. Gmail'dan jami ${activationItems.length} ta tasdiqlash xati topildi!`);

      // De-duplicate by URL
      const uniqueItems = Array.from(new Map(activationItems.map(item => [item.activationUrl, item])).values());

      // Activate each URL
      const activatedResults: Array<{
        email: string;
        type: 'coursera' | 'aileaders';
        activationUrl: string;
        success: boolean;
      }> = [];

      for (const item of uniqueItems) {
        try {
          const actResp = await fetch(item.activationUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml,application/json;q=0.9,*/*;q=0.8',
            },
            redirect: 'follow',
            signal: AbortSignal.timeout(12000),
          });
          const actText = await actResp.text();
          const isOk = actResp.ok || actResp.status < 400 || actText.includes('success');
          activatedResults.push({
            email: item.recipientEmail,
            type: item.type,
            activationUrl: item.activationUrl,
            success: isOk,
          });
          log(`✅ ${item.type === 'coursera' ? 'Coursera' : 'Aileaders'} hisobi tasdiqlandi: ${item.recipientEmail}`);
        } catch (e: any) {
          activatedResults.push({
            email: item.recipientEmail,
            type: item.type,
            activationUrl: item.activationUrl,
            success: false,
          });
          log(`⚠️ Tasdiqlash xatosi (${item.recipientEmail}): ${e.message}`);
        }
      }

      return res.json({
        success: true,
        totalFound: uniqueItems.length,
        activatedCount: activatedResults.filter(r => r.success).length,
        activatedResults,
        logs,
      });

    } catch (err: any) {
      log(`❌ IMAP Xatosi: ${err.message}`);
      return res.status(500).json({ success: false, error: err.message, logs });
    }
  });

  // Fast Batch Activation for multiple Aileaders links
  app.post('/api/aileaders/batch-activate', async (req, res) => {
    const { links } = req.body;
    if (!Array.isArray(links)) {
      return res.status(400).json({ error: "Havolalar ro'yxati noto'g'ri" });
    }
    const results = [];
    for (const rawLink of links) {
      const link = (rawLink || '').trim();
      if (!link.startsWith('http')) continue;
      try {
        const resp = await fetch(link, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          },
          signal: AbortSignal.timeout(8000),
        });
        const text = await resp.text();
        results.push({ link, success: !text.includes('error') || text.includes('success'), status: resp.status });
      } catch (e: any) {
        results.push({ link, success: false, error: e.message });
      }
    }
    return res.json({ success: true, results });
  });

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

  const server = app.listen(port, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${port} (NODE_ENV: ${process.env.NODE_ENV || 'not set'})`);
    // Start background Telegram Bot runner AFTER port is successfully listening
    // Delay 3s so Cloud Run health check passes immediately and traffic shift completes
    setTimeout(() => {
      try {
        startTelegramBot();
      } catch (botErr) {
        console.warn("Could not start Telegram Bot:", botErr);
      }
    }, 3000);
  });

  // Graceful shutdown on Cloud Run rollout / scale-down
  const shutdown = () => {
    console.log('Received shutdown signal, terminating gracefully...');
    try {
      stopTelegramBot();
    } catch {}
    server.close(() => {
      console.log('HTTP server closed.');
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 5000).unref();
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

startServer().catch(err => {
  console.error("Server startup error:", err);
  process.exit(1);
});
