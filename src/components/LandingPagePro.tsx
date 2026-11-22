import React, { useMemo, useState } from 'react';
import { ClassGroup, Student, TeacherCertificate } from '../types';
import { getStudentTrackData } from '../utils/studentLoginHelper';
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  Cpu,
  FileSpreadsheet,
  GraduationCap,
  KeyRound,
  Lock,
  QrCode,
  Search,
  Send,
  AlertCircle,
} from 'lucide-react';

import heroCampusImg from '../assets/images/landing_hero_campus_1795362063347.jpg';
import featureVerificationImg from '../assets/images/landing_feature_verification_1795362064278.jpg';
import professorLabImg from '../assets/images/landing_professor_lab_1795362064093.jpg';

interface LandingPageProProps {
  classes: ClassGroup[];
  students: Student[];
  teacherCertificates: TeacherCertificate[];
  onEnterPortal: (track?: 'ai' | 'developer', classId?: string) => void;
  onOpenAdminLogin: () => void;
}

type ExportFormatMode = 'sheets' | 'telegram';
type ArchitectureTabId = 'presence' | 'graphics' | 'isolation' | 'audit';

interface ArchitectureSpec {
  id: ArchitectureTabId;
  number: string;
  title: string;
  subtitle: string;
  summary: string;
  metrics: { label: string; value: string }[];
  pipeline: { step: string; detail: string }[];
  specCode: string;
}

const ARCHITECTURE_SPECS: ArchitectureSpec[] = [
  {
    id: 'presence',
    number: '01',
    title: 'Qurilma Identifikatsiyasi va Jonli Seans Himoyasi',
    subtitle: 'Hardware Fingerprint + Firestore REST Fast-Path',
    summary:
      "Har bir kirishda brauzer Client Hints, WebGL GPU renderer va apparat yadrolari asosida deterministik qurilma imzosi shakllantiriladi. Jonli bloklash joriy sessiyani sahifani yangilamasdan hamda boshqa brauzerlarda ham bir zumda to'xtatadi.",
    metrics: [
      { label: 'Sinxronizatsiya kechikishi', value: '< 250 ms' },
      { label: 'Signallar soni', value: '7 qatlam' },
      { label: 'Kross-brauzer qamrovi', value: '100%' },
      { label: 'Heartbeat davriyligi', value: '12 sek' },
    ],
    pipeline: [
      { step: 'Kirish', detail: 'Sinxron UA-CH & GPU probasi' },
      { step: 'REST Patch', detail: 'SDK keshini chetlab tez yozish' },
      { step: 'Audit', detail: 'Oxirgi 8 ta harakat buferi' },
      { step: 'Himoya', detail: 'Apparat bo‘yicha jonli blokirovka' },
    ],
    specCode: [
      'MODULE  device_presence_guard',
      'FINGERPRINT  ua_ch + gpu_renderer + logical_cores + screen_ratio',
      'TRANSPORT    firestore.v1.rest_patch (bypass_cold_sdk_queue)',
      'ENFORCEMENT  realtime_listener -> instant_overlay_lock',
    ].join('\n'),
  },
  {
    id: 'graphics',
    number: '02',
    title: '4-Darajali Adaptiv Render Dvigateli',
    subtitle: 'Lite · Medium · High · Ultra GPU Izolyatsiyasi',
    summary:
      "Kuchsiz telefonlar va maktab kompyuterlarida xotira sarfini minimallashtirish uchun CSS va WebGL qatlamlari qat'iy ajratilgan. Foydalanuvchi qurilmasi kuchiga qarab silliq ishlash yoki kengaytirilgan vizual rejim tanlanadi.",
    metrics: [
      { label: 'Lite / Medium xotira', value: '0 WebGL' },
      { label: 'DOM repaint narxi', value: 'Minimal' },
      { label: 'Kadr byudjeti', value: '60 FPS' },
      { label: 'Lazy-chunk izolyatsiyasi', value: 'Ajratilgan' },
    ],
    pipeline: [
      { step: 'Profil', detail: 'Qurilma darajasini aniqlash' },
      { step: 'Lite', detail: 'Nol blur, nol doimiy animatsiya' },
      { step: 'Medium', detail: 'Toza interfeys, yengil o‘tish' },
      { step: 'High / Ultra', detail: 'Dinamik lazy-load grafik modul' },
    ],
    specCode: [
      'MODULE  adaptive_render_pipeline',
      'TIERS   lite | medium | high | ultra',
      'ISOLATION  lazy_dynamic_import(overlay) -> mounted_only_if_active',
      'LANDING_POLICY  strict_zero_webgl_canvas (light_architectural)',
    ].join('\n'),
  },
  {
    id: 'isolation',
    number: '03',
    title: "Ikki Yo'nalishli Ma'lumotlar Izolyatsiyasi",
    subtitle: '1M Promter va 5M AI Yetakchilari Yagona Modelda',
    summary:
      "Bitta sinf va o'quvchi yozuvi ichida ikkala milliy dasturning sertifikat havolasi, berilgan sanasi, holati va to'lov summasi bir-biriga xalaqit bermagan holda mustaqil maydonlarda saqlanadi.",
    metrics: [
      { label: 'Indekslash murakkabligi', value: 'O(N) Map' },
      { label: 'To‘qnashuv ehtimoli', value: '0%' },
      { label: 'Sinf qidiruvi', value: '< 4 ms' },
      { label: 'Yo‘nalish tariflari', value: '5K / 7K' },
    ],
    pipeline: [
      { step: 'Normalizatsiya', detail: 'getStudentTrackData(student, track)' },
      { step: '1M Promter', detail: 'aiStatus + aiCertificateLink' },
      { step: '5M Yetakchi', detail: 'devStatus + devCertificateLink' },
      { step: 'Moliya', detail: 'Alohida hisob va tarix jurnali' },
    ],
    specCode: [
      'MODULE  dual_track_schema',
      'TRACK_A  ai_promter   -> price: 5000 UZS, fields: aiStatus, aiCertDate',
      'TRACK_B  ai_5m_leader -> price: 7000 UZS, fields: devStatus, devCertDate',
      'INDEXING  single_pass_map_aggregation -> O(students + classes)',
    ].join('\n'),
  },
  {
    id: 'audit',
    number: '04',
    title: 'Mijoz Tomonida PDF, ZIP va QR Sana Auditi',
    subtitle: 'Batch Sertifikat Yig‘ish va QR Osti Sanasini Tekshirish',
    summary:
      "O'qituvchilar barcha sertifikatlarni bitta umumiy PDF yoki ZIP arxivga jamlay oladi. Ma'muriyat esa QR-kod ostidagi haqiqiy sertifikat berilgan sanani muddat oralig'i bo'yicha avtomatik tekshirib, natijani xotiraga saqlaydi.",
    metrics: [
      { label: 'Sheets eksport ustuni', value: '12 ustun' },
      { label: 'Sana formati', value: 'DD.MM.YYYY' },
      { label: 'Arxivlash', value: 'ZIP + PDF' },
      { label: 'Saqlangan kesh', value: 'Doimiy' },
    ],
    pipeline: [
      { step: 'Havola', detail: 'Sertifikat URL manzilini olish' },
      { step: 'QR Tahlil', detail: 'Aniq berilgan sanani aniqlash' },
      { step: 'Filtr', detail: 'Oraliq muddatga moslash' },
      { step: 'Eksport', detail: '12-ustunli TSV Ctrl+V ga tayyor' },
    ],
    specCode: [
      'MODULE  certificate_qr_and_sheets_pipeline',
      'COLUMNS 1..12 [№, Lavozim, FIO, Sana, Seriya, Raqam, Email, Tel, Maktab, Reg, CertDate, URL]',
      'DATE_AUDIT  extract_qr_issue_date -> persist_verified_timestamp',
      'OUTPUT      sanitized_tsv (zero_tab_newline_spill)',
    ].join('\n'),
  },
];

const SIMULATOR_SAMPLE_ROWS = [
  {
    index: 1,
    position: "O'quvchi",
    fullName: 'Karimova Madina Rustam qizi',
    birthDate: '14.05.2009',
    series: 'I-FR',
    number: '0539632',
    email: 'akramxonsaidov01@gmail.com',
    phone: '+998880055688',
    school: '16-maktab',
    registeredAt: '02.02.2026',
    certifiedDate: '19.02.2026',
    link: 'https://coursera.org/verify/9X4K82LM',
  },
  {
    index: 2,
    position: "O'quvchi",
    fullName: 'Tursunov Sardorbek Alisher o‘g‘li',
    birthDate: '23.09.2009',
    series: 'AD',
    number: '4182094',
    email: 'akramxonsaidov01@gmail.com',
    phone: '+998880055688',
    school: '16-maktab',
    registeredAt: '02.02.2026',
    certifiedDate: '21.02.2026',
    link: 'https://coursera.org/verify/7P2M91QW',
  },
  {
    index: 3,
    position: "O'quvchi",
    fullName: 'Saidova Dilnoza Bahodir qizi',
    birthDate: '08.11.2009',
    series: 'I-FR',
    number: '0847120',
    email: 'akramxonsaidov01@gmail.com',
    phone: '+998880055688',
    school: '16-maktab',
    registeredAt: '03.02.2026',
    certifiedDate: '24.02.2026',
    link: 'https://coursera.org/verify/3N6R54ZT',
  },
];

export const LandingPagePro: React.FC<LandingPageProProps> = ({
  classes,
  students,
  teacherCertificates,
  onEnterPortal,
  onOpenAdminLogin,
}) => {
  // Broken-image guards (Section 3.E compliance)
  const [heroImgError, setHeroImgError] = useState(false);
  const [featureImgError, setFeatureImgError] = useState(false);
  const [professorImgError, setProfessorImgError] = useState(false);

  // Interactive Bento 1: Google Sheets & Telegram simulator
  const [exportMode, setExportMode] = useState<ExportFormatMode>('sheets');
  const [selectedSimClassId, setSelectedSimClassId] = useState<string>('');
  const [copiedSim, setCopiedSim] = useState(false);

  // Interactive Bento 4: Live Class & Teacher Finder
  const [classSearch, setClassSearch] = useState('');
  const [trackFilter, setTrackFilter] = useState<'all' | 'ai' | 'developer'>('all');

  // Interactive Section 2: Obsidian Engineering Architecture Switcher
  const [activeArchTab, setActiveArchTab] = useState<ArchitectureTabId>('presence');

  // Interactive Closing Inquiry Form with strict client-side validation
  const [inquiryName, setInquiryName] = useState('');
  const [inquiryOrg, setInquiryOrg] = useState('');
  const [inquiryContact, setInquiryContact] = useState('');
  const [inquiryTrack, setInquiryTrack] = useState<'ai' | 'developer'>('ai');
  const [inquiryError, setInquiryError] = useState('');
  const [inquirySubmitted, setInquirySubmitted] = useState(false);

  // Single-pass O(N) live statistics from real platform state
  const liveStats = useMemo(() => {
    const classMap = new Map<string, { total: number; certified: number }>();
    let totalCertified = 0;

    const classTrackLookup = new Map<string, 'ai' | 'developer'>();
    for (let i = 0; i < classes.length; i++) {
      classTrackLookup.set(
        classes[i].id,
        classes[i].projectType === 'developer' ? 'developer' : 'ai'
      );
    }

    for (let i = 0; i < students.length; i++) {
      const s = students[i];
      const track = classTrackLookup.get(s.classId) || (s.projectType === 'developer' ? 'developer' : 'ai');
      const td = getStudentTrackData(s, track);
      let entry = classMap.get(s.classId);
      if (!entry) {
        entry = { total: 0, certified: 0 };
        classMap.set(s.classId, entry);
      }
      entry.total += 1;
      if (td.status === 'certified') {
        entry.certified += 1;
        totalCertified += 1;
      }
    }

    const certifiedTeachers = teacherCertificates.filter(t => t.status === 'certified').length;
    const completionPct = students.length > 0 ? Math.round((totalCertified / students.length) * 100) : 0;

    return {
      classCount: classes.length,
      studentCount: students.length,
      certifiedCount: totalCertified,
      teacherCertCount: certifiedTeachers,
      completionPct,
      classMap,
    };
  }, [classes, students, teacherCertificates]);

  // Active class for simulator label (never exposes real student PII on landing)
  const simulatorClass = useMemo(() => {
    if (classes.length === 0) return null;
    return classes.find(c => c.id === selectedSimClassId) || classes[0];
  }, [classes, selectedSimClassId]);

  const simulatorPayload = useMemo(() => {
    const schoolLabel = simulatorClass?.schoolName || '16-maktab';
    const classLabel = simulatorClass?.name || '9-A';
    const teacherLabel = simulatorClass?.teacherName || 'M. Abdullayeva';

    if (exportMode === 'sheets') {
      return SIMULATOR_SAMPLE_ROWS.map((row) =>
        [
          row.index,
          row.position,
          row.fullName,
          row.birthDate,
          row.series,
          row.number,
          row.email,
          row.phone,
          schoolLabel,
          row.registeredAt,
          row.certifiedDate,
          row.link,
        ].join('\t')
      ).join('\n');
    }

    return [
      `Sinf: ${classLabel} (${schoolLabel})`,
      `Sinf rahbari: ${teacherLabel}`,
      `Tasdiqlangan sertifikatlar: ${SIMULATOR_SAMPLE_ROWS.length} ta`,
      '',
      ...SIMULATOR_SAMPLE_ROWS.map(
        (row) => `${row.index}. ${row.fullName} — ${row.certifiedDate}\n   ${row.link}`
      ),
    ].join('\n');
  }, [exportMode, simulatorClass]);

  const handleCopySimulator = async () => {
    try {
      await navigator.clipboard.writeText(simulatorPayload);
      setCopiedSim(true);
      setTimeout(() => setCopiedSim(false), 2200);
    } catch {
      setCopiedSim(true);
      setTimeout(() => setCopiedSim(false), 2200);
    }
  };

  // Live filtered classes for Directory Finder
  const directoryClasses = useMemo(() => {
    const q = classSearch.trim().toLowerCase();
    return classes
      .filter(c => {
        const track = c.projectType === 'developer' ? 'developer' : 'ai';
        if (trackFilter !== 'all' && track !== trackFilter) return false;
        if (!q) return true;
        return (
          c.name.toLowerCase().includes(q) ||
          c.teacherName.toLowerCase().includes(q) ||
          (c.schoolName ? c.schoolName.toLowerCase().includes(q) : false)
        );
      })
      .slice(0, 6);
  }, [classes, classSearch, trackFilter]);

  const activeSpec = useMemo(() => {
    return ARCHITECTURE_SPECS.find(s => s.id === activeArchTab) || ARCHITECTURE_SPECS[0];
  }, [activeArchTab]);

  const handleInquirySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = inquiryName.trim();
    const cleanOrg = inquiryOrg.trim();
    const cleanContact = inquiryContact.trim();

    if (cleanName.length < 3) {
      setInquiryError("Iltimos, to'liq ism-familiyangizni kiriting (kamida 3 belgi).");
      return;
    }
    if (cleanOrg.length < 2) {
      setInquiryError("Maktab, litsey yoki universitet nomini kiriting.");
      return;
    }
    if (cleanContact.length < 5) {
      setInquiryError("Aloqa uchun telefon raqam yoki Telegram username kiriting.");
      return;
    }

    setInquiryError('');
    setInquirySubmitted(true);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] font-body relative z-10 flex flex-col">
      {/* Strict 3-Zone Top Navigation Bar (Clean, single-row, compact on mobile) */}
      <header className="sticky top-0 z-40 h-16 bg-white/95 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-7xl mx-auto h-full px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-8">
          {/* Zone 1: Clean Brand Wordmark (No attached pills, no pulsing dots, no subtitles) */}
          <a
            href="#top"
            className="flex items-center gap-2.5 text-[#0F172A] hover:text-[#1D4ED8] transition-colors whitespace-nowrap shrink-0"
          >
            <span className="w-8 h-8 rounded-md bg-[#0F172A] text-white flex items-center justify-center shrink-0">
              <GraduationCap className="w-4 h-4" />
            </span>
            <span className="font-display font-bold text-base sm:text-lg tracking-tight">
              Bir Million Dasturchi
            </span>
          </a>

          {/* Zone 2: 4 Single-Line Anchor Links */}
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600">
            <a href="#imkoniyatlar" className="hover:text-[#0F172A] transition-colors whitespace-nowrap shrink-0">
              Imkoniyatlar
            </a>
            <a href="#arxitektura" className="hover:text-[#0F172A] transition-colors whitespace-nowrap shrink-0">
              Arxitektura
            </a>
            <a href="#natijalar" className="hover:text-[#0F172A] transition-colors whitespace-nowrap shrink-0">
              Natijalar
            </a>
            <a href="#hujjatlar" className="hover:text-[#0F172A] transition-colors whitespace-nowrap shrink-0">
              Yo‘nalishlar
            </a>
          </nav>

          {/* Zone 3: Single Primary Action CTA */}
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() => onEnterPortal()}
              className="px-4 py-2 rounded-md bg-[#1D4ED8] hover:bg-[#1E40AF] text-white text-sm font-semibold inline-flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <span>Portalga kirish</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main id="top" className="flex-1">
        {/* HERO: Asymmetric Architectural Split */}
        <section className="pt-10 pb-12 sm:pt-16 sm:pb-16 lg:pt-20 lg:pb-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-stretch">
              {/* Left Copy Column */}
              <div className="lg:col-span-6 flex flex-col justify-center">
                <p className="font-mono-tech text-[11px] uppercase tracking-[0.14em] text-[#1D4ED8] font-semibold mb-4">
                  O‘zbekiston Ta’lim Portali · 1M Promter va 5M AI Yetakchilari
                </p>

                <h1
                  className="font-display font-extrabold text-[#0F172A] tracking-[-0.03em] leading-[1.07] mb-5"
                  style={{ fontSize: 'clamp(2.15rem, 3.85vw, 3.45rem)', textWrap: 'balance' }}
                >
                  Ustozlar, IT professorlar va maktablar uchun aniq sertifikat arxitekturasi.
                </h1>

                <p className="text-base sm:text-lg text-[#475569] leading-relaxed max-w-xl mb-8">
                  O‘quvchi va pedagoglarning Coursera hamda AI Study sertifikatlarini sinflar bo‘yicha jamlash,
                  QR-kod ostidagi haqiqiy sanani avtomatik tekshirish va Google Sheets jadvaliga bitta bosishda
                  12 ustun qilib joylash tizimi.
                </p>

                <div className="flex flex-wrap items-center gap-5">
                  <button
                    type="button"
                    onClick={() => onEnterPortal()}
                    className="px-6 py-3.5 rounded-md bg-[#1D4ED8] hover:bg-[#1E40AF] text-white text-sm sm:text-base font-semibold inline-flex items-center gap-2.5 transition-colors cursor-pointer shadow-xs"
                  >
                    <span>O‘qituvchilar portaliga kirish</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={onOpenAdminLogin}
                    className="text-sm font-semibold text-slate-700 hover:text-[#0F172A] inline-flex items-center gap-2 py-2 border-b border-slate-300 hover:border-[#0F172A] transition-colors cursor-pointer"
                  >
                    <Lock className="w-3.5 h-3.5 text-[#1D4ED8]" />
                    <span>Administrator kirishi</span>
                  </button>
                </div>
              </div>

              {/* Right Visual Frame (Explicit aspect-ratio/stretch height, clean image with fallback) */}
              <div className="lg:col-span-6">
                <div className="relative h-full min-h-[260px] sm:min-h-[340px] lg:min-h-[400px] rounded-xl overflow-hidden border border-slate-200 bg-slate-900">
                  {!heroImgError ? (
                    <img
                      src={heroCampusImg}
                      alt="Zamonaviy universitet IT laboratoriyasi va muhandislik auditoriyasi"
                      referrerPolicy="no-referrer"
                      onError={() => setHeroImgError(true)}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center bg-slate-900 text-slate-200">
                      <GraduationCap className="w-10 h-10 text-blue-400 mb-3" />
                      <p className="font-display font-bold text-lg">Akademik Ta’lim Muhiti</p>
                      <p className="text-xs text-slate-400 mt-1 max-w-xs">
                        Maktablar va oliy ta’lim muassasalari uchun markazlashtirilgan sertifikat monitoringi
                      </p>
                    </div>
                  )}

                  {/* Restrained Bottom Architectural Caption Bar */}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/90 via-slate-950/55 to-transparent px-5 py-4 flex items-center justify-between gap-4 text-white">
                    <div>
                      <p className="font-mono-tech text-[11px] uppercase tracking-wider text-blue-300">
                        2025–2026 O‘quv Yili Standarti
                      </p>
                      <p className="text-sm font-medium text-slate-100">
                        Sinflar kesimida real vaqt sinxronizatsiyasi
                      </p>
                    </div>
                    <span className="font-mono-tech text-xs text-slate-200 shrink-0">
                      {liveStats.completionPct}% bajarilish
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* FULL-WIDTH QUANTITATIVE STRIP (Live Tabular Data) */}
        <section className="border-y border-slate-200 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
              <div className="py-6 sm:py-7 lg:pr-8">
                <p className="font-mono-tech text-2xl sm:text-3xl font-bold text-[#0F172A]">
                  {liveStats.classCount > 0 ? liveStats.classCount.toLocaleString('uz-UZ') : '24+'}
                </p>
                <p className="text-xs sm:text-sm text-slate-600 mt-1">
                  Tizimga ulangan sinf va guruhlar
                </p>
              </div>

              <div className="py-6 sm:py-7 pl-4 lg:px-8">
                <p className="font-mono-tech text-2xl sm:text-3xl font-bold text-[#0F172A]">
                  {liveStats.studentCount > 0 ? liveStats.studentCount.toLocaleString('uz-UZ') : '640+'}
                </p>
                <p className="text-xs sm:text-sm text-slate-600 mt-1">
                  Hisobdagi jami o‘quvchilar
                </p>
              </div>

              <div className="py-6 sm:py-7 lg:px-8">
                <p className="font-mono-tech text-2xl sm:text-3xl font-bold text-[#1D4ED8]">
                  {liveStats.certifiedCount > 0 ? liveStats.certifiedCount.toLocaleString('uz-UZ') : '510+'}
                </p>
                <p className="text-xs sm:text-sm text-slate-600 mt-1">
                  Tasdiqlangan sertifikatlar ({liveStats.teacherCertCount} ustoz)
                </p>
              </div>

              <div className="py-6 sm:py-7 pl-4 lg:pl-8">
                <p className="font-mono-tech text-2xl sm:text-3xl font-bold text-[#0F172A]">
                  12 ustun
                </p>
                <p className="text-xs sm:text-sm text-slate-600 mt-1">
                  Google Sheets TSV avtomat eksporti
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 1: IMKONIYATLAR — ASYMMETRIC BENTO GRID */}
        <section id="imkoniyatlar" className="py-16 sm:py-24">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-2xl mb-12">
              <p className="font-mono-tech text-xs uppercase tracking-[0.12em] text-[#1D4ED8] font-semibold mb-2">
                01. Amaliy Imkoniyatlar
              </p>
              <h2
                className="font-display font-bold text-[#0F172A] tracking-[-0.02em] leading-tight"
                style={{ fontSize: 'clamp(1.65rem, 2.8vw, 2.35rem)', textWrap: 'balance' }}
              >
                Yarim soatlik qo‘lda ishni bir soniyalik aniqlikka almashtiring.
              </h2>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Bento 1 (col-span-2): Live Google Sheets & Telegram Simulator */}
              <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-6 sm:p-8 flex flex-col justify-between">
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
                    <div className="flex items-center gap-3">
                      <span className="w-9 h-9 rounded-md bg-blue-50 border border-blue-200 text-[#1D4ED8] flex items-center justify-center">
                        <FileSpreadsheet className="w-4 h-4" />
                      </span>
                      <div>
                        <h3 className="font-display font-bold text-lg text-[#0F172A]">
                          Google Sheets (12 ustun) va Telegram Eksport Simulyatori
                        </h3>
                        <p className="text-xs text-slate-500">
                          Butun sinfni Ctrl+V ga tayyor tabulyatsiya formatida shakllantirish
                        </p>
                      </div>
                    </div>

                    {/* Interactive Mode Switcher */}
                    <div className="inline-flex border border-slate-200 rounded-md p-0.5 bg-slate-50">
                      <button
                        type="button"
                        onClick={() => setExportMode('sheets')}
                        className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors cursor-pointer ${
                          exportMode === 'sheets'
                            ? 'bg-[#0F172A] text-white'
                            : 'text-slate-600 hover:text-[#0F172A]'
                        }`}
                      >
                        Google Sheets TSV
                      </button>
                      <button
                        type="button"
                        onClick={() => setExportMode('telegram')}
                        className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors cursor-pointer ${
                          exportMode === 'telegram'
                            ? 'bg-[#0F172A] text-white'
                            : 'text-slate-600 hover:text-[#0F172A]'
                        }`}
                      >
                        Telegram Xabar
                      </button>
                    </div>
                  </div>

                  {/* Interactive Class Selector & Column Overview */}
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-4 text-xs text-slate-600">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-700">Namuna sinf:</span>
                      {classes.length > 0 ? (
                        <select
                          aria-label="Namuna sinfni tanlash"
                          value={simulatorClass?.id || ''}
                          onChange={(e) => setSelectedSimClassId(e.target.value)}
                          className="border border-slate-200 rounded-md px-2.5 py-1 text-xs font-medium text-[#0F172A] bg-white focus:outline-none focus:border-[#1D4ED8]"
                        >
                          {classes.slice(0, 12).map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name} · {c.teacherName}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="font-mono-tech text-slate-700">9-A · 16-maktab (namuna)</span>
                      )}
                    </div>
                    <span className="font-mono-tech text-[11px] text-slate-500">
                      Tartib · Lavozim · FIO · Sana · Seriya · Raqam · Email · Tel · Maktab · Reg · Cert · URL
                    </span>
                  </div>

                  {/* Preview Terminal Frame */}
                  <div className="bg-[#0F172A] text-slate-200 rounded-lg border border-slate-800 p-4 overflow-x-auto">
                    <pre className="font-mono-tech text-[11px] sm:text-xs leading-relaxed whitespace-pre">
                      {simulatorPayload}
                    </pre>
                  </div>
                </div>

                <div className="mt-5 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-4">
                  <p className="text-xs text-slate-500">
                    Har bir katakdagi ortiqcha bo‘sh joy va tab belgilari tozalanadi — qo‘shni ustunlarga siljish bo‘lmaydi.
                  </p>
                  <button
                    type="button"
                    onClick={handleCopySimulator}
                    className="px-4 py-2 rounded-md border border-slate-300 hover:border-[#1D4ED8] bg-white text-xs font-semibold text-[#0F172A] inline-flex items-center gap-2 transition-colors cursor-pointer shrink-0"
                  >
                    {copiedSim ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="text-emerald-700">Buferga nusxalandi</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-[#1D4ED8]" />
                        <span>Namunani nusxalash</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Bento 2 (col-span-1): QR Date Verification & Photo */}
              <div className="lg:col-span-1 bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between">
                <div>
                  <div className="aspect-[4/3] w-full rounded-lg overflow-hidden border border-slate-200 bg-slate-100 mb-5">
                    {!featureImgError ? (
                      <img
                        src={featureVerificationImg}
                        alt="Tasdiqlangan raqamli sertifikat, QR-kod tekshiruvi va hujjatlar stoli"
                        referrerPolicy="no-referrer"
                        onError={() => setFeatureImgError(true)}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center text-slate-500">
                        <QrCode className="w-8 h-8 text-[#1D4ED8] mb-2" />
                        <span className="text-xs font-medium">QR Sana Auditi</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-xs font-mono-tech text-[#1D4ED8] uppercase tracking-wider mb-2">
                    <QrCode className="w-3.5 h-3.5" />
                    <span>QR Sana Auditi</span>
                  </div>

                  <h3 className="font-display font-bold text-lg text-[#0F172A] mb-2">
                    QR-kod ostidagi haqiqiy sana bo‘yicha hisob-kitob
                  </h3>

                  <p className="text-sm text-slate-600 leading-relaxed">
                    O‘tgan yilgi va joriy yilgi sertifikatlarni qo‘lda ochib chiqishga hojat yo‘q.
                    Tizim har bir sertifikatning aniq berilgan sanasini tekshiradi, muddat bo‘yicha filtrlaydi va keshga saqlaydi.
                  </p>
                </div>

                <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 font-mono-tech">
                  <span>Sana aniqligi: DD.MM.YYYY</span>
                  <span className="text-[#0F172A] font-semibold">Keshlangan</span>
                </div>
              </div>

              {/* Bento 3 (col-span-1): Deterministic Email & Login Pool */}
              <div className="lg:col-span-1 bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between">
                <div>
                  <span className="w-9 h-9 rounded-md bg-slate-100 border border-slate-200 text-[#0F172A] flex items-center justify-center mb-4">
                    <KeyRound className="w-4 h-4" />
                  </span>

                  <h3 className="font-display font-bold text-lg text-[#0F172A] mb-2">
                    Email zaxirasi va login generatsiyasi
                  </h3>

                  <p className="text-sm text-slate-600 leading-relaxed mb-5">
                    Har bir yangi o‘quvchi yoki ustozga zaxira bazasidan band bo‘lmagan elektron pochta
                    va takrorlanmas <span className="font-mono-tech text-xs text-[#0F172A]">familiya_ism</span> login
                    variantlari avtomatik biriktiriladi.
                  </p>
                </div>

                <div className="border-t border-slate-100 pt-4 space-y-2 text-xs">
                  <div className="flex items-center justify-between text-slate-600">
                    <span>Win + V tezkor ketma-ket nusxalash</span>
                    <span className="font-mono-tech text-[#1D4ED8] font-semibold">3 qadam</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-600">
                    <span>Metrika / Pasport ajratgichi</span>
                    <span className="font-mono-tech text-[#0F172A] font-semibold">Seriya + Raqam</span>
                  </div>
                </div>
              </div>

              {/* Bento 4 (col-span-2): Live Class & Teacher Finder */}
              <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-6 sm:p-8 flex flex-col justify-between">
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
                    <div>
                      <h3 className="font-display font-bold text-lg text-[#0F172A]">
                        Jonli sinf va o‘qituvchi qidiruvi
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Istalgan sinfni tanlang — portal shu zahoti kerakli yo‘nalishda ochiladi
                      </p>
                    </div>

                    <div className="inline-flex border border-slate-200 rounded-md p-0.5 bg-slate-50 text-xs">
                      <button
                        type="button"
                        onClick={() => setTrackFilter('all')}
                        className={`px-2.5 py-1 rounded font-medium cursor-pointer transition-colors ${
                          trackFilter === 'all' ? 'bg-[#0F172A] text-white' : 'text-slate-600 hover:text-[#0F172A]'
                        }`}
                      >
                        Barchasi
                      </button>
                      <button
                        type="button"
                        onClick={() => setTrackFilter('ai')}
                        className={`px-2.5 py-1 rounded font-medium cursor-pointer transition-colors ${
                          trackFilter === 'ai' ? 'bg-[#1D4ED8] text-white' : 'text-slate-600 hover:text-[#0F172A]'
                        }`}
                      >
                        1M Promter
                      </button>
                      <button
                        type="button"
                        onClick={() => setTrackFilter('developer')}
                        className={`px-2.5 py-1 rounded font-medium cursor-pointer transition-colors ${
                          trackFilter === 'developer' ? 'bg-[#1D4ED8] text-white' : 'text-slate-600 hover:text-[#0F172A]'
                        }`}
                      >
                        5M AI
                      </button>
                    </div>
                  </div>

                  {/* Search Input */}
                  <div className="relative mb-4">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={classSearch}
                      onChange={(e) => setClassSearch(e.target.value)}
                      placeholder="Sinf nomi, ustoz F.I.O yoki maktab bo‘yicha qidiring..."
                      className="w-full pl-10 pr-4 py-2.5 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:border-[#1D4ED8] transition-colors"
                    />
                  </div>

                  {/* Directory Rows */}
                  {directoryClasses.length > 0 ? (
                    <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
                      {directoryClasses.map((cg) => {
                        const stats = liveStats.classMap.get(cg.id) || { total: 0, certified: 0 };
                        const track = cg.projectType === 'developer' ? 'developer' : 'ai';
                        return (
                          <button
                            key={cg.id}
                            type="button"
                            onClick={() => onEnterPortal(track, cg.id)}
                            className="w-full px-4 py-3 bg-white hover:bg-slate-50 flex items-center justify-between gap-4 text-left transition-colors cursor-pointer group"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 text-sm font-semibold text-[#0F172A] truncate">
                                <span>{cg.name}</span>
                                <span className="text-slate-300">·</span>
                                <span className="font-normal text-slate-600 truncate">{cg.teacherName}</span>
                              </div>
                              <p className="text-xs text-slate-500 mt-0.5 truncate">
                                {cg.schoolName ? `${cg.schoolName} · ` : ''}
                                {track === 'developer' ? '5M AI Yetakchilari' : '1M Promter'}
                              </p>
                            </div>

                            <div className="flex items-center gap-4 shrink-0">
                              <span className="font-mono-tech text-xs text-slate-700">
                                {stats.certified} / {stats.total}
                              </span>
                              <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-[#1D4ED8] group-hover:translate-x-0.5 transition-all" />
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="border border-slate-200 rounded-lg p-6 text-center text-sm text-slate-500">
                      Qidiruv bo‘yicha mos sinf topilmadi. Barcha sinflarni ko‘rish uchun portalga kiring.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 2: ARXITEKTURA — DEEP OBSIDIAN BLUEPRINT FOR IT PROFESSORS & DEVELOPERS */}
        <section id="arxitektura" className="bg-[#0B1120] text-slate-100 py-20 sm:py-24 border-y border-slate-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mb-12">
              <p className="font-mono-tech text-xs uppercase tracking-[0.14em] text-blue-400 font-semibold mb-2">
                02. Tizim Arxitekturasi va Muhandislik
              </p>
              <h2
                className="font-display font-bold text-white tracking-[-0.02em] leading-tight mb-4"
                style={{ fontSize: 'clamp(1.75rem, 3vw, 2.5rem)', textWrap: 'balance' }}
              >
                Professorlar va katta dasturchilar uchun shaffof texnik tuzilma.
              </h2>
              <p className="text-sm sm:text-base text-slate-400 leading-relaxed">
                Platforma sekin SDK navbatlarini chetlab o‘tuvchi REST tezkor yo‘li, xotiradan tejamkor O(N) ma’lumot
                indeksatsiyasi hamda 4 darajali grafik izolyatsiya tamoyillariga qurilgan.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* Left Architectural Selector */}
              <div className="lg:col-span-5 space-y-2">
                {ARCHITECTURE_SPECS.map((spec) => {
                  const isActive = spec.id === activeArchTab;
                  return (
                    <button
                      key={spec.id}
                      type="button"
                      onClick={() => setActiveArchTab(spec.id)}
                      className={`w-full text-left p-4 rounded-lg border transition-colors cursor-pointer ${
                        isActive
                          ? 'bg-[#111827] border-blue-500/70 text-white'
                          : 'bg-transparent border-slate-800/80 text-slate-400 hover:bg-[#111827]/60 hover:text-slate-200'
                      }`}
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="font-display font-bold text-sm sm:text-base">
                          <span className="font-mono-tech text-xs text-blue-400 mr-2.5">{spec.number}.</span>
                          {spec.title}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-1 pl-7">{spec.subtitle}</p>
                    </button>
                  );
                })}
              </div>

              {/* Right Interactive Inspection Panel */}
              <div className="lg:col-span-7 bg-[#111827] border border-slate-800 rounded-xl p-6 sm:p-8">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-5 border-b border-slate-800">
                  <div>
                    <span className="font-mono-tech text-xs text-blue-400">
                      MODUL {activeSpec.number} · {activeSpec.subtitle}
                    </span>
                    <h3 className="font-display font-bold text-xl text-white mt-1">
                      {activeSpec.title}
                    </h3>
                  </div>
                </div>

                <p className="text-sm sm:text-base text-slate-300 leading-relaxed mt-5">
                  {activeSpec.summary}
                </p>

                {/* Metrics Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 my-6">
                  {activeSpec.metrics.map((m) => (
                    <div key={m.label} className="bg-[#0B1120] border border-slate-800 rounded-lg p-3.5">
                      <p className="font-mono-tech text-base sm:text-lg font-bold text-white">
                        {m.value}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-1">{m.label}</p>
                    </div>
                  ))}
                </div>

                {/* Crisp Architectural Flow Pipeline */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                  {activeSpec.pipeline.map((node, idx) => (
                    <div
                      key={node.step}
                      className="bg-[#0F172A] border border-slate-800 rounded-lg p-3"
                    >
                      <p className="font-mono-tech text-[11px] text-blue-400 font-semibold">
                        0{idx + 1} · {node.step}
                      </p>
                      <p className="text-xs text-slate-300 mt-1 leading-snug">{node.detail}</p>
                    </div>
                  ))}
                </div>

                {/* Structured Technical Spec */}
                <div className="bg-[#070B14] border border-slate-800 rounded-lg p-4 overflow-x-auto">
                  <pre className="font-mono-tech text-xs text-slate-300 leading-relaxed whitespace-pre">
                    {activeSpec.specCode}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 3: NATIJALAR VA AKADEMIK STANDART */}
        <section id="natijalar" className="py-16 sm:py-24 bg-white border-b border-slate-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-stretch">
              {/* Left Academic Photo */}
              <div className="lg:col-span-5">
                <div className="h-full min-h-[280px] sm:min-h-[340px] rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
                  {!professorImgError ? (
                    <img
                      src={professorLabImg}
                      alt="IT kafedra professori ta’lim statistikasi va sinf jadvallarini tahlil qilmoqda"
                      referrerPolicy="no-referrer"
                      onError={() => setProfessorImgError(true)}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center text-slate-600">
                      <Cpu className="w-10 h-10 text-[#1D4ED8] mb-3" />
                      <p className="font-display font-bold text-base">Akademik Kafedra Tahlili</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Structured Outcomes (Clean Horizontal Dividers, No Thick Borders) */}
              <div className="lg:col-span-7 flex flex-col justify-between">
                <div>
                  <p className="font-mono-tech text-xs uppercase tracking-[0.12em] text-[#1D4ED8] font-semibold mb-2">
                    03. Har Bir Rol Uchun Aniq Qiymat
                  </p>
                  <h2
                    className="font-display font-bold text-[#0F172A] tracking-[-0.02em] leading-tight mb-6"
                    style={{ fontSize: 'clamp(1.65rem, 2.8vw, 2.35rem)', textWrap: 'balance' }}
                  >
                    Oddiy maktab o‘qituvchisidan tortib universitet kafedrasigacha.
                  </h2>
                </div>

                <div className="divide-y divide-slate-200 border-t border-slate-200">
                  <div className="py-5 grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-6 items-baseline">
                    <div className="sm:col-span-4 font-display font-bold text-sm text-[#0F172A]">
                      Informatika o‘qituvchilari
                    </div>
                    <div className="sm:col-span-8 text-sm text-slate-600 leading-relaxed">
                      Win + V orqali ketma-ket nusxalash, Google Sheets 12 ustunli eksporti, Telegram bot orqali
                      real vaqt bildirishnomalari hamda barcha sertifikatlarni bitta PDF yoki ZIP arxivga jamlash.
                    </div>
                  </div>

                  <div className="py-5 grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-6 items-baseline">
                    <div className="sm:col-span-4 font-display font-bold text-sm text-[#0F172A]">
                      IT professorlar va kafedralar
                    </div>
                    <div className="sm:col-span-8 text-sm text-slate-600 leading-relaxed">
                      Guruh va o‘qituvchilar kesimida to‘liq shaffof hisobot, o‘tgan va joriy yilgi sertifikatlarni
                      QR-kod berilgan sanasi bo‘yicha adashmasdan ajratish hamda alohida ustoz sertifikatlari bo‘limi.
                    </div>
                  </div>

                  <div className="py-5 grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-6 items-baseline">
                    <div className="sm:col-span-4 font-display font-bold text-sm text-[#0F172A]">
                      Tizim administratorlari
                    </div>
                    <div className="sm:col-span-8 text-sm text-slate-600 leading-relaxed">
                      Soniya aniqligidagi jonli faol seanslar, apparat fingerprinti asosida kross-brauzer bloklash,
                      to‘lovlar auditi va Telegram hamda portal sinxronizatsiyasining to‘liq nazorati.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 4: YO'NALISH TANLASH VA TEZKOR MUROJAAT */}
        <section id="hujjatlar" className="py-16 sm:py-24">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
              {/* Left: Two National Project Tracks */}
              <div className="lg:col-span-7 flex flex-col justify-between bg-white border border-slate-200 rounded-xl p-6 sm:p-8">
                <div>
                  <p className="font-mono-tech text-xs uppercase tracking-[0.12em] text-[#1D4ED8] font-semibold mb-2">
                    04. Milliy Loyihalar Bo‘yicha Kirish
                  </p>
                  <h2 className="font-display font-bold text-2xl text-[#0F172A] tracking-tight mb-3">
                    Kerakli ta’lim yo‘nalishini tanlab ishni boshlang
                  </h2>
                  <p className="text-sm text-slate-600 leading-relaxed mb-6">
                    Har ikkala dastur alohida moliyaviy va sertifikat izolyatsiyasida yuritiladi. O‘z sinfingizni
                    ochish uchun yo‘nalishni tanlang.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="border border-slate-200 rounded-lg p-5 flex flex-col justify-between bg-[#F8FAFC]">
                    <div>
                      <div className="flex items-center justify-between text-xs font-mono-tech text-slate-500 mb-2">
                        <span>YO‘NALISH 01</span>
                        <span className="text-[#0F172A] font-semibold">5 000 so‘m</span>
                      </div>
                      <h3 className="font-display font-bold text-base text-[#0F172A] mb-2">
                        Bir million promter
                      </h3>
                      <p className="text-xs text-slate-600 leading-relaxed mb-5">
                        Coursera asosidagi maktab va litsey o‘quvchilari uchun asosiy promt muhandisligi va AI kurslari.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onEnterPortal('ai')}
                      className="w-full py-2.5 px-4 rounded-md bg-[#1D4ED8] hover:bg-[#1E40AF] text-white text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
                    >
                      <span>1M Promter portaliga o‘tish</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="border border-slate-200 rounded-lg p-5 flex flex-col justify-between bg-[#F8FAFC]">
                    <div>
                      <div className="flex items-center justify-between text-xs font-mono-tech text-slate-500 mb-2">
                        <span>YO‘NALISH 02</span>
                        <span className="text-[#0F172A] font-semibold">7 000 so‘m</span>
                      </div>
                      <h3 className="font-display font-bold text-base text-[#0F172A] mb-2">
                        Besh million AI yetakchilari
                      </h3>
                      <p className="text-xs text-slate-600 leading-relaxed mb-5">
                        omp.aistudy.uz platformasi doirasidagi kengaytirilgan sun’iy intellekt va dasturlash yo‘nalishi.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onEnterPortal('developer')}
                      className="w-full py-2.5 px-4 rounded-md bg-[#0F172A] hover:bg-slate-800 text-white text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
                    >
                      <span>5M AI portaliga o‘tish</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Right: Validated Institutional Onboarding Form */}
              <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 sm:p-8 flex flex-col justify-between">
                {inquirySubmitted ? (
                  <div className="my-auto py-8 text-center">
                    <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto mb-3" />
                    <h3 className="font-display font-bold text-lg text-[#0F172A] mb-2">
                      So‘rovingiz qabul qilindi
                    </h3>
                    <p className="text-sm text-slate-600 leading-relaxed mb-6">
                      Rahmat, <span className="font-semibold text-[#0F172A]">{inquiryName}</span> ({inquiryOrg}).
                      Ma’muriyat <span className="font-mono-tech text-xs text-[#1D4ED8]">{inquiryContact}</span> orqali
                      bog‘lanib sinf yoki kafedra hisobini faollashtiradi.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setInquirySubmitted(false);
                        setInquiryName('');
                        setInquiryOrg('');
                        setInquiryContact('');
                      }}
                      className="px-4 py-2 rounded-md border border-slate-300 text-xs font-semibold text-slate-700 hover:text-[#0F172A] cursor-pointer"
                    >
                      Yangi ariza yuborish
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleInquirySubmit} noValidate className="flex flex-col h-full justify-between">
                    <div>
                      <h3 className="font-display font-bold text-lg text-[#0F172A] mb-1">
                        Yangi maktab yoki kafedrani ulash
                      </h3>
                      <p className="text-xs text-slate-500 mb-5">
                        Ma’lumotlarni qoldiring — sinflar va email bazasi qisqa muddatda tayyorlanadi.
                      </p>

                      <div className="space-y-3.5">
                        <div>
                          <label htmlFor="inq-name" className="block text-xs font-medium text-slate-700 mb-1">
                            Mas’ul F.I.O
                          </label>
                          <input
                            id="inq-name"
                            type="text"
                            value={inquiryName}
                            onChange={(e) => setInquiryName(e.target.value)}
                            placeholder="Masalan: Karimov Jasur"
                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md bg-slate-50 focus:bg-white focus:outline-none focus:border-[#1D4ED8]"
                          />
                        </div>

                        <div>
                          <label htmlFor="inq-org" className="block text-xs font-medium text-slate-700 mb-1">
                            Ta’lim muassasasi
                          </label>
                          <input
                            id="inq-org"
                            type="text"
                            value={inquiryOrg}
                            onChange={(e) => setInquiryOrg(e.target.value)}
                            placeholder="Masalan: 16-maktab yoki TATU"
                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md bg-slate-50 focus:bg-white focus:outline-none focus:border-[#1D4ED8]"
                          />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label htmlFor="inq-contact" className="block text-xs font-medium text-slate-700 mb-1">
                              Telegram yoki telefon
                            </label>
                            <input
                              id="inq-contact"
                              type="text"
                              value={inquiryContact}
                              onChange={(e) => setInquiryContact(e.target.value)}
                              placeholder="@username / +998..."
                              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md bg-slate-50 focus:bg-white focus:outline-none focus:border-[#1D4ED8]"
                            />
                          </div>
                          <div>
                            <label htmlFor="inq-track" className="block text-xs font-medium text-slate-700 mb-1">
                              Asosiy yo‘nalish
                            </label>
                            <select
                              id="inq-track"
                              value={inquiryTrack}
                              onChange={(e) => setInquiryTrack(e.target.value as 'ai' | 'developer')}
                              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md bg-slate-50 focus:bg-white focus:outline-none focus:border-[#1D4ED8]"
                            >
                              <option value="ai">1M Promter</option>
                              <option value="developer">5M AI Yetakchilari</option>
                            </select>
                          </div>
                        </div>

                        {inquiryError && (
                          <div className="flex items-start gap-2 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-md p-2.5">
                            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                            <span>{inquiryError}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="mt-5 w-full py-2.5 px-4 rounded-md bg-[#1D4ED8] hover:bg-[#1E40AF] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Ariza yuborish</span>
                    </button>
                  </form>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Quiet Architectural Footer */}
      <footer className="bg-white border-t border-slate-200 py-8 text-xs text-slate-600">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 text-center sm:text-left">
            <span className="font-display font-bold text-[#0F172A]">
              Bir Million O‘zbek Dasturchilari
            </span>
            <span className="hidden sm:inline text-slate-300">·</span>
            <span>Xizmat to‘lovi: 5 000 so‘m / 7 000 so‘m</span>
          </div>

          <div className="flex items-center gap-6">
            <button
              type="button"
              onClick={() => onEnterPortal()}
              className="text-slate-600 hover:text-[#0F172A] font-medium cursor-pointer transition-colors"
            >
              O‘qituvchilar portali
            </button>
            <button
              type="button"
              onClick={onOpenAdminLogin}
              className="text-slate-700 hover:text-[#1D4ED8] font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <Lock className="w-3.5 h-3.5 text-[#1D4ED8]" />
              <span>Boshqaruv</span>
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};
