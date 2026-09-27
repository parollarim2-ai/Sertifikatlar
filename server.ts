import express from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';

async function startServer() {
  const app = express();
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

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

  // Mount Vite development middlewares in dev mode
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
    app.get('*', (_req, res) => {
      res.sendFile('dist/index.html', { root: '.' });
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
