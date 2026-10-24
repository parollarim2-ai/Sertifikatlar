# Avtonom "Zero-Touch" Sertifikatlash Dvigateli (Autopilot Certificate Engine) — Amalga Oshirish Rejasi

Ushbu reja foydalanuvchining sertifikat olish jarayonini tubdan tezlashtirish, har qanday qo'l mehnati va oyna almashtirishlarni butunlay yo'q qilish, shu bilan birga akkauntlar bloklanishi va xatoliklarning oldini oluvchi 100% xavfsiz avtomatlashtirish tizimini taqdim etadi.

---

> [!IMPORTANT]
> ### Tasdiqlanishi Kerak Bo'lgan Asosiy Qarorlar:
> 1. **To'liq Avtopilot Ish Rejimi (Tavsiya etiladi):** Puppeteer bot 4-testni topshirishi bilanoq, to'g'ridan-to'g'ri Coursera yutuqlar sahifasiga (`/account/accomplishments`) o'tadi, o'quvchining rasmiy sertifikat havolasini (`coursera.org/verify/...`) avtomatik ko'chirib oladi, bazaga saqlaydi va o'quvchini darhol **"Sertifikatlangan"** holatiga o'tkazadi. Foydalanuvchi biror tugmani bosishi yoki havolani qidirishi shart bo'lmaydi.
> 2. **Xavfsiz Oqim (Anti-Ban & Safe Throttling):** Coursera va platformalar tomonidan IP-blok yoki cheklovlarga tushmaslik uchun har bir o'quvchi o'rtasida aqlli adaptiv tanaffus (randomized delay 3–7s), toza izolyatsiyalangan brauzer profillari (incognito context) va ism mosligini ikki marta tekshirish (Double Verification) kafolatlanadi.
> 3. **Fon Xizmati (Background Job Queue):** Siz brauzerni yopib qo'ysangiz yoki boshqa sinf bilan ishlayotgan bo'lsangiz ham, server orqa fonda butun sinfni navbat bo'yicha mustaqil sertifikatlab, Telegramga har bir yangi olingan sertifikatni real vaqtda yetkazib turadi.

---

## 1. Umumiy Tushuncha va Asosiy Yangiliklar (Core Concept)

### 🎯 Muammoning Tub Ildizi:
Hozirgi tizimda testlar avtomatik yechilsa-da, **sertifikat havolasini olish, tekshirish va uni bazaga biriktirish hali ham inson qo'li bilan amalga oshirilmoqda**. Bir sinfda 30–40 ta o'quvchi bo'lsa, har birining akkountiga kirish, sertifikat havolasini topish va nusxalash 1-2 soat qimmatli vaqtni oladi.

### 🚀 Taqdim Etilayotgan 4 Ta Inqilobiy Funksiya:

#### 1. 🤖 "End-to-End Autopilot" (Avtomatik Sertifikat Sug'uruvchi)
- Robot 4-testni yechgach to'xtab qolmaydi:
  - Darhol Coursera kurs yakunlash (`/learn/.../home/welcome`) yoki Yutuqlar (`/account/accomplishments`) sahifasiga o'tadi.
  - "View Certificate" tugmasini bosadi va rasmiy `https://coursera.org/verify/XXXXXX` havolasini hamda Sertifikat ID raqamini o'qiydi.
  - Sertifikatdagi ism o'quvchining ismiga 100% to'g'ri kelganini tekshiradi (xavfsizlik kafolati).
  - Havolani avtomatik tarzda o'quvchi kartasiga joylaydi, holatini "certified" qiladi va Firestore bazasiga yozadi.

#### 2. 🛡️ "Smart Session Guardian" (Xavfsizlik va Ishonchlilik Qalqoni)
- **Hech qanday blokirovkasiz ishlash:** Har bir so'rov yangi toza sessiyada bajariladi, kuki va keshlarning aralashib ketishi (cookie bleeding) oldi olinadi.
- **Fail-Safe qayta urinish (Retry with Fallback):** Agar internet sekinlashsa yoki Coursera serveri vaqtinchalik javob bermasa, robot to'xtab qolmaydi — 3 martagacha xavfsiz qayta urinadi, skrinshot olib xato sababini aniq ko'rsatadi va navbatdagi o'quvchiga xalaqit bermasdan davom etadi.
- **Mavjud ma'lumotlarga ziyon yetkazmaslik:** Allaqachon sertifikat olgan o'quvchilar avtomatik o'tkazib yuboriladi, ularning havolalari aslo o'chib ketmaydi.

#### 3. ⚡ "Bitta Bosishda Butun Sinf" (One-Click Class Super-Runner)
- Sinf tanlanadi va **"To'liq Avtopilotda Boshlash"** tugmasi bosiladi:
  - 1-bosqich: Aileaders ro'yxatdan o'tish (kerak bo'lsa)
  - 2-bosqich: Gmail IMAP orqali faollashtirish (avtomatik)
  - 3-bosqich: Coursera kursiga ulanish (avtomatik)
  - 4-bosqich: 4 ta testni 100% to'g'ri yechish (avtomatik)
  - 5-bosqich: Sertifikat havolasini sug'urib olib bazaga biriktirish (avtomatik)
  - 6-bosqich: Telegram bot orqali ustozga va adminga tayyor sertifikat kartasini yuborish!

#### 4. 🧩 "Turbo Bookmarklet" (Muqobil / Zaxira Tezlatkich)
- Agar foydalanuvchi yoki ustoz ba'zi testlarni o'zining oddiy brauzerida tezkor bajarishni istasa:
  - Brauzer xatcho'plariga 1 marta qo'shiladigan **"Coursera Turbo Solver"** tugmasi.
  - Sahifada 1 marta bosilsa, testlar 0.5 soniyada belgilanadi, "Submit" bosiladi va sertifikat havolasi to'g'ridan-to'g'ri bizning saytimiz API'siga yuboriladi.

---

## 2. Foydalanuvchi Tajribasi va Interfeys (UX & Visual Design)

- **Avtopilot Boshqaruv Paneli (Autopilot HUD):**
  - Zamonaviy shaffof shisha (Liquid Glass) uslubidagi vizual progress paneli.
  - Har bir o'quvchi uchun 5 ta bosqichli real-vaqt nishonchalari: `Pochta` ➔ `Faollashtirish` ➔ `Dastur` ➔ `Testlar (1-4)` ➔ `Sertifikat Havolasi 🎓`.
  - Qaysi o'quvchi qaysi soniyada sertifikat olgani, umumiy tejalgan vaqt hisoblagichi.
- **Tezkor Ogohlantirishlar (Live Feedback & Audio):**
  - Har bir sertifikat olinganda yoqimli muvaffaqiyat ovozi (chime).
  - Ekranni band qilmaydigan, orqa fonda bemalol boshqa ishlarni bajarishga imkon beruvchi mini-vidjet.
- **Xatoliklarni O'z-O'zini Davolash (Self-Healing Log):**
  - Agar biror o'quvchida muammo bo'lsa, qizil signal bilan to'xtab qolmaydi, muammoli o'quvchi "Qayta urinish ro'yxati"ga o'tadi va jarayon davom etaveradi.

---

## 3. Asosiy Mahsulot Qarorlari va Xavfsizlik

| Xususiyat | Avvalgi Holat | Yangi "Zero-Touch" Holat |
| :--- | :--- | :--- |
| **Sertifikat Havolasi** | Qo'lda kirib, qidirib, nusxalash kerak | Robot o'zi yutuqlar sahifasidan 1 soniyada oladi |
| **Inson Aralashuvi** | Har bir o'quvchi uchun 3-5 ta qo'l harakati | **0 ta harakat** (faqat boshlash tugmasi) |
| **Akkaunt Xavfsizligi** | Sinxron ketma-ketlikda xato bo'lsa to'xtash | Izolyatsiyalangan kontekst + Anti-ban tanaffus |
| **Ish Tezligi (30 o'quvchi)** | ~45-60 daqiqa qo'l mehnati | ~8-12 daqiqa to'liq avtonom fonda |
| **Boshqa Funksiyalarga Ta'siri**| Alohida o'zgarishlar kodni buzishi mumkin | Mavjud tuzilma, ustoz paneli va himoyalar daxlsiz qoladi |

---

## 4. Texnik Arxitektura va Ma'lumotlar Oqimi

```
┌────────────────────────────────────────────────────────────────────────┐
│                        ADMIN / USTOZ INTERFEYSI                        │
│               [ Bitta Bosishda Butun Sinfni Sertifikatlash ]           │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │ POST /api/coursera/full-autopilot
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                 BACKEND AUTOPILOT ENGINE (server.ts)                  │
│                                                                        │
│   1. Pochta & Akkaunt Tekshiruvi (Gmail IMAP / Aileaders)              │
│   2. Puppeteer Izolyatsiyalangan Kontekst yaratish                     │
│   3. Coursera tizimiga xavfsiz kirish va ro'yxatdan o'tish             │
│   4. Quiz 1, 2, 3, 4 ni 100% aniqlik bilan yechish                     │
│   5. 🌟 YANGI: /account/accomplishments sahifasiga avto-o'tish          │
│   6. 🌟 YANGI: Rasmiy Sertifikat URL (`verify/...`) ni sug'urib olish  │
│   7. Ism mosligini tekshirish (Anti-Mismatch Guardian)                │
└──────────────────┬──────────────────────────────────┬──────────────────┘
                   │                                  │
                   ▼                                  ▼
┌──────────────────────────────────────┐  ┌──────────────────────────────┐
│       FIRESTORE / LOKAL BAZA         │  │     TELEGRAM BILDIRISHNOMA   │
│  - status: "certified"               │  │  - Ustozga: "Sertifikat tayyor"│
│  - certificateLink: "https://..."    │  │  - Tayyor havola & karta      │
│  - certifiedAt: ISO String           │  └──────────────────────────────┘
└──────────────────────────────────────┘
```

---

## 5. Bosqichma-bosqich Bajarish Bosqichlari (Implementation Steps)

1. **1-bosqich (`server-coursera-quiz.ts`):**
   - Quiz 4 topshirilgandan so'ng, darhol Coursera sertifikatini tekshiruvchi va havolani ajratib oluvchi `extractCourseraCertificate(page, studentName)` funksiyasini yozish.
   - Natijada qaytadigan obyektga `certificateUrl` va `certificateId` maydonlarini qo'shish.

2. **2-bosqich (`server.ts`):**
   - To'liq zanjirli `/api/coursera/autopilot-student` va `/api/coursera/autopilot-class` endpointlarini yaratish.
   - Sertifikat havolasi olinishi bilanoq, uni to'g'ridan-to'g'ri o'quvchiga biriktirib Firestore va xotirada yangilash.

3. **3-bosqich (`ClassBatchAutomationModal.tsx` & `TeacherCertificatesTab.tsx`):**
   - Interfeysda yangi **"Avtopilot Sertifikatlash"** rejimi tugmasini joylashtirish.
   - Real-vaqtda sertifikat havolalari qanday olinayotganini ko'rsatuvchi interaktiv vizual progress indikatori.

4. **4-bosqich (Zaxira Bookmarklet Generator):**
   - Admin panelida 1-klik bilan brauzer paneliga sudrab qo'yiladigan "Coursera Fast Solver Bookmarklet" kodini taqdim etish.

5. **5-bosqich (Sinov va Xavfsizlik Tekshiruvi):**
   - Mavjud barcha sinflar, begonalar maktabi himoyasi, ustoz paneli va ovozli boshqaruv funksiyalari to'liq daxlsiz ekanligini TypeScript/Lint/Build orqali sinchiklab tekshirish.
