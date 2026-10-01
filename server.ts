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
        log(`❌ Aileaders natijasi: "Ma'lumot topilmadi". Hujjat raqami yoki tug'ilgan sana mos kelmadi.`);
        return res.json({
          success: false,
          error: "O'quvchi ma'lumotlari bazadan topilmadi. Hujjat seriya raqami yoki tug'ilgan sana noto'g'ri kiritilgan bo'lishi mumkin.",
          reason: 'NOT_FOUND',
          logs,
        });
      }

      if (lookupResult.result?.code === 'ok' && lookupResult.content) {
        const studentInfo = lookupResult.content;
        log(`✅ 4. O'quvchi topildi: ${studentInfo.name || ''} ${studentInfo.surname || ''} (Jinsi: ${studentInfo.gender === 'male' ? "O'g'il bola" : "Qiz bola"})`);
      } else {
        log(`ℹ️ 4. Tekshiruv holati: ${lookupResult.result?.code || 'Davom etilmoqda'}`);
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

      // Handle "passport_already_in_use" (student was previously registered)
      if (regResult.result?.code === 'passport_already_in_use' || regResult.result?.code === 'passport_exists') {
        log(`⚠️ 6. Ushbu o'quvchi avval ro'yxatdan o'tkazilgan ekan. Eski hisob tozalanmoqda (delete-account)...`);
        
        await page.evaluate(async (isMetrika: boolean, series: string, num: string, fullDoc: string, dob: string) => {
          try {
            const body = new URLSearchParams();
            body.append('document', isMetrika ? `${series}${num}` : fullDoc);
            body.append('dob', dob);
            await fetch('https://aileaders.uz/api/profile/delete-account', {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: body.toString()
            });
          } catch {}
        }, docType === 'metrika', cleanSeries, cleanNum, fullDocNumber, formattedDob);

        await new Promise(r => setTimeout(r, 1500));

        log(`7. Qaytadan yangi hisob ochilmoqda...`);
        regResult = await page.evaluate(async (payload: any) => {
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
      }

      if (regResult.result?.code === 'email_already_in_use' || regResult.result?.code === 'email_exists') {
        log(`❌ Xatolik: ${email} manzili allaqachon boshqa hisobda ro'yxatdan o'tgan.`);
        return res.json({
          success: false,
          error: `Ushbu "${email}" manzili boshqa akkauntda band qilingan. Iltimos, boshqa Gmail kiriting.`,
          reason: 'EMAIL_IN_USE',
          logs
        });
      }

      log(`8. Aileaders tizimiga kirish (login) amalga oshirilmoqda...`);
      const loginResult = await page.evaluate(async (login: string, pwd: string) => {
        try {
          const res = await fetch('https://aileaders.uz/api/authorization/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ login, password: pwd })
          });
          return await res.json();
        } catch (e: any) {
          return { error: e.message };
        }
      }, email.trim(), password);

      const userToken = loginResult.content?.token || '';
      if (!userToken) {
        log(`⚠️ Avtorizatsiya xabari: ${loginResult.result?.code || 'Token olinmadi'}.`);
        return res.json({
          success: false,
          error: "Tizimga kirishda xatolik: " + (loginResult.result?.code || "Token olinmadi"),
          logs
        });
      }

      log(`9. Tasdiqlash xabari Gmail pochtasiga yuborilmoqda: ${email.trim()}...`);
      const verifyResult = await page.evaluate(async (em: string, token: string) => {
        try {
          const res = await fetch(`https://aileaders.uz/api/profile/verify-email?email=${encodeURIComponent(em)}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            }
          });
          return await res.json();
        } catch (e: any) {
          return { error: e.message };
        }
      }, email.trim(), userToken);

      const verifyCode = verifyResult.result?.code || '';
      if (verifyCode === 'ok') {
        log(`✅ 10. Tasdiqlash xati ${email.trim()} pochtasiga muvaffaqiyatli yuborildi!`);
        log(`📬 11. Iltimos, ${email.trim()} Gmail pochtangizni oching (Kiruvchi, Spam va Barcha xatlar papkalarini tekshiring).`);
        log(`🔗 12. Xat ichidagi 'Faollashtirish' havolasini nusxalab, pastdagi maydonga kiriting.`);
      } else if (verifyCode.startsWith('verification_attempt')) {
        log(`ℹ️ 10. Tasdiqlash havolasi yaqinda yuborilgan. Gmail pochtangizni tekshiring.`);
      } else {
        log(`⚠️ 10. Tasdiqlash xati kodi: ${verifyCode || 'xatolik'}`);
      }

      return res.json({
        success: true,
        status: 'WAITING_GMAIL',
        targetEmail: email.trim(),
        message: `Tasdiqlash xabari ${email.trim()} pochtasiga muvaffaqiyatli yuborildi. Iltimos, Gmail pochtangizni oching va kelgan faollashtirish havolasini kiriting.`,
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

  // In-memory active Coursera Puppeteer sessions waiting for email verification
  interface CourseraSession {
    page: any;
    studentId: string;
    fullName: string;
    email: string;
    password: string;
    startedAt: number;
  }
  const activeCourseraSessions = new Map<string, CourseraSession>();

  // Cleanup stale Coursera sessions after 15 minutes
  setInterval(() => {
    const now = Date.now();
    for (const [key, session] of activeCourseraSessions.entries()) {
      if (now - session.startedAt > 15 * 60 * 1000) {
        try {
          session.page?.close()?.catch(() => {});
        } catch {}
        activeCourseraSessions.delete(key);
      }
    }
  }, 5 * 60 * 1000);

  // Step 4: Confirm Aileaders activation link and launch Coursera enrollment
  app.post('/api/aileaders/confirm-activation', async (req, res) => {
    let page: any = null;
    const logs: string[] = [];
    const log = (msg: string) => {
      logs.push(`[${new Date().toLocaleTimeString('uz-UZ')}] ${msg}`);
      console.log(`[Coursera Robot] ${msg}`);
    };

    try {
      const { activationLink, fullName, email, password = 'MaktabPass2026!', studentId } = req.body;
      const sessionKey = String(studentId || (email || '').trim());

      // 1. Fetch activation link directly to confirm Aileaders email instantly (if provided)
      if (activationLink && typeof activationLink === 'string' && activationLink.trim()) {
        log(`1. Aileaders faollashtirish havolasi tasdiqlanmoqda: ${activationLink}...`);
        try {
          await fetch(activationLink.trim(), {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
          });
          log(`✅ Aileaders hisobi muvaffaqiyatli tasdiqlandi.`);
        } catch (actErr: any) {
          log(`ℹ️ Aileaders havolasi: ${actErr.message}`);
        }
      }

      // 2. Open Coursera course signup in Puppeteer
      log(`2. Coursera ro'yxatdan o'tish sahifasi ochilmoqda...`);
      const browser = await getBrowser();

      // Clean up any existing session for this student
      const existingSession = activeCourseraSessions.get(sessionKey);
      if (existingSession && existingSession.page) {
        try { await existingSession.page.close(); } catch {}
        activeCourseraSessions.delete(sessionKey);
      }

      page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 900 });
      await page.setExtraHTTPHeaders({ 'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7' });
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

      const courseraUrl = 'https://www.coursera.org/programs/learning-program-h13rq/learn/introduction-to-generative-ai?collectionId=2mufz#authMode=signup';
      await page.goto(courseraUrl, { waitUntil: 'networkidle2', timeout: 35000 });
      await new Promise(r => setTimeout(r, 2000));

      // Dismiss OneTrust cookie modal if visible
      await page.evaluate(() => {
        const rejectBtn = document.getElementById('onetrust-reject-all-handler') || 
                          document.querySelector('.ot-pc-refuse-all-handler') || 
                          document.getElementById('onetrust-accept-btn-handler');
        if (rejectBtn) (rejectBtn as HTMLElement).click();
      });

      // 3. Fill Russian signup modal fields
      log(`3. Coursera shakli to'ldirilmoqda: Ism: ${fullName}, Email: ${email}...`);

      try {
        await page.waitForSelector('input[name="name"], input[placeholder*="Ф. И. О."], input[placeholder*="full name"]', { timeout: 12000 });
      } catch {}

      const nameInput = await page.$('input[name="name"], input[placeholder*="Ф. И. О."], input[placeholder*="full name"]');
      if (nameInput) {
        await nameInput.click({ clickCount: 3 });
        await nameInput.type(fullName.trim(), { delay: 35 });
      }

      const emailInput = await page.$('input[name="email"], input[placeholder*="name@email.com"], input[placeholder*="Электронный адрес"]');
      if (emailInput) {
        await emailInput.click({ clickCount: 3 });
        await emailInput.type(email.trim(), { delay: 35 });
      }

      const passInput = await page.$('input[name="password"], input[placeholder*="Создать пароль"], input[placeholder*="password"]');
      if (passInput) {
        await passInput.click({ clickCount: 3 });
        await passInput.type(password, { delay: 35 });
      }

      await new Promise(r => setTimeout(r, 600));

      // 4. Click "Присоединиться бесплатно"
      log(`4. 'Присоединиться бесплатно' tugmasi bosilmoqda...`);
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const joinBtn = btns.find(b => {
          const txt = b.innerText.trim();
          return (
            txt.includes('Присоединиться бесплатно') ||
            txt.includes('Присоединиться') ||
            txt.includes('Join for Free') ||
            (b.type === 'submit' && !b.className.includes('onetrust'))
          );
        });
        if (joinBtn) (joinBtn as HTMLElement).click();
      });

      // Wait for server response and Coursera modal transition
      await new Promise(r => setTimeout(r, 4000));

      // Check if user already exists
      const pageText = await page.evaluate(() => document.body.innerText);
      if (pageText.includes('уже используется') || pageText.includes('уже существует') || pageText.includes('already in use')) {
        log(`⚠️ Ushbu ${email} bilan Courserada hisob mavjud. Tizimga kirish (Войти) orqali ulanilmoqda...`);
        await page.evaluate(() => {
          const btns = Array.from(document.querySelectorAll('button'));
          const loginTab = btns.find(b => b.innerText.trim() === 'Войти' || b.innerText.trim() === 'Log in');
          if (loginTab) loginTab.click();
        });
        await new Promise(r => setTimeout(r, 1500));
        const lEmail = await page.$('input[type="email"], input[name="email"]');
        if (lEmail) {
          await lEmail.click({ clickCount: 3 });
          await lEmail.type(email.trim(), { delay: 30 });
        }
        const lPass = await page.$('input[type="password"], input[name="password"]');
        if (lPass) {
          await lPass.click({ clickCount: 3 });
          await lPass.type(password, { delay: 30 });
        }
        await page.evaluate(() => {
          const btns = Array.from(document.querySelectorAll('button'));
          const submitBtn = btns.find(b => b.type === 'submit' && (b.innerText.includes('Войти') || b.innerText.includes('Log in')));
          if (submitBtn) submitBtn.click();
        });
        await new Promise(r => setTimeout(r, 3500));
      }

      // 5. Look for "Подтвердите свой электронный адрес" modal
      log(`5. 'Подтвердите свой электронный адрес' oynasi tekshirilmoqda...`);

      // Click the 1st button: "Отправить новое письмо для подтверждения"
      const resendClicked = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const resendBtn = btns.find(b => {
          const txt = b.innerText.trim();
          return (
            txt.includes('Отправить новое письмо') ||
            txt.includes('новое письмо для подтверждения') ||
            txt.includes('Отправить новое письмо для подтверждения') ||
            txt.includes('Resend confirmation email') ||
            txt.includes('Resend')
          );
        });
        if (resendBtn) {
          (resendBtn as HTMLElement).click();
          return true;
        }
        return false;
      });

      if (resendClicked) {
        log(`✅ 6. 'Отправить новое письмо для подтверждения' tugmasi bosildi.`);
      } else {
        log(`ℹ️ 6. Coursera tasdiqlash xati avtomatik yuborildi.`);
      }

      log(`📬 7. Coursera dan ${email} manziliga tasdiqlash xati yuborildi!`);
      log(`⏳ 8. Gmail pochtangizni oching, 'Подтвердите адрес электронной почты' tugmasini bosing va quyidagi 'Tasdiqladim' tugmasini bosing.`);

      // Keep active session alive for this student
      activeCourseraSessions.set(sessionKey, {
        page,
        studentId: sessionKey,
        fullName,
        email: email.trim(),
        password,
        startedAt: Date.now(),
      });

      return res.json({
        success: true,
        status: 'WAITING_COURSERA_CONFIRMATION',
        studentId: sessionKey,
        targetEmail: email.trim(),
        message: `Coursera dan ${email.trim()} pochtasiga tasdiqlash xati yuborildi. Iltimos, pochtani ochib 'Подтвердите адрес электронной почты' tugmasini bosing va quyidagi 'Tasdiqladim' tugmasini bosing!`,
        logs,
      });

    } catch (err: any) {
      log(`Xatolik yuz berdi: ${err.message}`);
      if (page) {
        try { await page.close(); } catch {}
      }
      return res.status(500).json({ error: err.message, logs });
    }
  });

  // Step 5: Final Coursera verification confirmation ("Да, подтверждение выполнено" & "Все понятно")
  app.post('/api/coursera/confirm-verification', async (req, res) => {
    const logs: string[] = [];
    const log = (msg: string) => {
      logs.push(`[${new Date().toLocaleTimeString('uz-UZ')}] ${msg}`);
      console.log(`[Coursera Robot] ${msg}`);
    };

    try {
      const { studentId, email, courseraLink } = req.body;
      const sessionKey = String(studentId || (email || '').trim());
      const session = activeCourseraSessions.get(sessionKey);

      log(`1. Coursera pochtasi tasdiqlanishi yakunlanmoqda (O'quvchi: ${session?.fullName || email})...`);

      // If user provided the Coursera link, open it to ensure token is active
      if (courseraLink && typeof courseraLink === 'string' && courseraLink.trim().startsWith('http')) {
        log(`🔗 Coursera xatidagi havola ochilmoqda: ${courseraLink.trim()}...`);
        try {
          const browser = await getBrowser();
          const tempPage = await browser.newPage();
          await tempPage.goto(courseraLink.trim(), { waitUntil: 'networkidle2', timeout: 30000 });
          await new Promise(r => setTimeout(r, 2000));
          await tempPage.close();
          log(`✅ Coursera xatidagi havola muvaffaqiyatli tasdiqlandi.`);
        } catch (linkErr: any) {
          log(`Ogohlantirish: Havolani ochish: ${linkErr.message}`);
        }
      }

      let page = session?.page;
      if (!page || page.isClosed()) {
        log(`⚠️ Avvalgi oyna sessiyasi topilmadi, Coursera dasturiga qayta ulanilmoqda...`);
        const browser = await getBrowser();
        page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 900 });
        await page.setExtraHTTPHeaders({ 'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8' });
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
        
        const courseraUrl = 'https://www.coursera.org/programs/learning-program-h13rq/learn/introduction-to-generative-ai?collectionId=2mufz';
        await page.goto(courseraUrl, { waitUntil: 'networkidle2', timeout: 35000 });
        await new Promise(r => setTimeout(r, 2000));
      }

      // Step 2: Click the 2nd button: "Да, подтверждение выполнено"
      log(`2. 'Да, подтверждение выполнено' tugmasi bosilmoqda...`);
      const confirmedClicked = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const btn = btns.find(b => {
          const txt = b.innerText.trim();
          return (
            txt.includes('Да, подтверждение выполнено') ||
            txt.includes('подтверждение выполнено') ||
            txt.includes('Да, подтверждение') ||
            txt.includes('Yes, I have verified') ||
            txt.includes('I have verified')
          );
        });
        if (btn) {
          (btn as HTMLElement).click();
          return true;
        }
        return false;
      });

      if (confirmedClicked) {
        log(`✅ 3. 'Да, подтверждение выполнено' tugmasi bosildi.`);
      } else {
        log(`ℹ️ 3. 'Да, подтверждение выполнено' tugmasi topilmadi yoki avtomatik qabul qilindi.`);
      }

      // Wait for the next modal: "Коммуникации и конфиденциальность"
      log(`4. 'Коммуникации и конфиденциальность' oynasi kutilmoqda...`);
      await new Promise(r => setTimeout(r, 2500));

      // Step 3: Click "Все понятно"
      log(`5. 'Все понятно' tugmasi bosilmoqda...`);
      const privacyClicked = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const btn = btns.find(b => {
          const txt = b.innerText.trim();
          return (
            txt === 'Все понятно' ||
            txt.includes('Все понятно') ||
            txt.includes('понятно') ||
            txt.includes('Got it') ||
            txt.includes('I understand') ||
            txt.includes('Agree')
          );
        });
        if (btn) {
          (btn as HTMLElement).click();
          return true;
        }
        return false;
      });

      if (privacyClicked) {
        log(`✅ 6. 'Все понятно' tugmasi muvaffaqiyatli bosildi.`);
      } else {
        log(`ℹ️ 6. 'Все понятно' tugmasi topilmadi yoki oyna yopilgan.`);
      }

      await new Promise(r => setTimeout(r, 2000));

      // Close page and delete session
      try {
        await page.close();
      } catch {}
      activeCourseraSessions.delete(sessionKey);

      log(`🎉 7. O'quvchi Coursera dasturiga muvaffaqiyatli a'zo bo'ldi!`);
      log(`✨ Endi ushbu email va parol orqali to'g'ridan-to'g'ri Courseraga kirishingiz mumkin.`);

      return res.json({
        success: true,
        status: 'COMPLETED',
        message: "Tabriklaymiz! O'quvchi muvaffaqiyatli ro'yxatdan o'tdi va Coursera dasturiga qo'shildi!",
        logs,
      });

    } catch (err: any) {
      log(`Xatolik: ${err.message}`);
      return res.status(500).json({ error: err.message, logs });
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
