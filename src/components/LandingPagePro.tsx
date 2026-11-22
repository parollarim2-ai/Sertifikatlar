import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ClassGroup, Student, TeacherCertificate } from '../types';
import { getStudentTrackData } from '../utils/studentLoginHelper';
import {
  ArrowRight,
  Award,
  BookOpen,
  Check,
  CheckCircle2,
  Copy,
  FileSpreadsheet,
  FolderArchive,
  GraduationCap,
  Lock,
  Moon,
  Search,
  Send,
  Sparkles,
  Sun,
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

type FormatPreviewTab = 'telegram' | 'sheets' | 'bundle';
type LandingTheme = 'light' | 'dark';

interface RibbonNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  angle: number;
  spin: number;
  rgb: string;
  alpha: number;
}

interface RippleRing {
  active: boolean;
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  alpha: number;
}

interface TrailPearl {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  radius: number;
}

const THEME_STORAGE_KEY = 'b1m_landing_theme_v1';

const SAMPLE_PREVIEW_STUDENTS = [
  {
    index: 1,
    fullName: 'Karimova Madina Rustam qizi',
    birthDate: '14.05.2009',
    series: 'I-FR',
    number: '0539632',
    date: '19.02.2026',
    url: 'https://coursera.org/verify/9X4K82LM',
  },
  {
    index: 2,
    fullName: 'Tursunov Sardorbek Alisher o‘g‘li',
    birthDate: '23.09.2009',
    series: 'AD',
    number: '4182094',
    date: '21.02.2026',
    url: 'https://coursera.org/verify/7P2M91QW',
  },
  {
    index: 3,
    fullName: 'Saidova Dilnoza Bahodir qizi',
    birthDate: '08.11.2009',
    series: 'I-FR',
    number: '0847120',
    date: '24.02.2026',
    url: 'https://coursera.org/verify/3N6R54ZT',
  },
];

/**
 * Maximal Living Silk & Optical Wave Canvas (Light + Dark modes, ZERO Space/Cosmos).
 * Uses pre-allocated object pools (zero GC pressure), DPR cap <= 1.5, visibility pause,
 * and automatic adaptive quality throttle if frame delta exceeds budget.
 */
const LivingAtmosphereCanvas: React.FC<{ isDark: boolean }> = ({ isDark }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDarkRef = useRef(isDark);
  isDarkRef.current = isDark;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let width = window.innerWidth;
    let height = window.innerHeight;
    let dpr = Math.min(window.devicePixelRatio || 1, 1.5);

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const pointer = {
      x: width * 0.55,
      y: height * 0.35,
      tx: width * 0.55,
      ty: height * 0.35,
      lastX: width * 0.55,
      lastY: height * 0.35,
    };

    const nodeCount = width < 768 ? 16 : 30;
    const palette = [
      '37, 99, 235',   // Royal Cobalt
      '14, 165, 233',  // Sky Cerulean
      '16, 185, 129',  // Emerald Jade
      '245, 158, 11',  // Warm Sunlight Gold
    ];

    const nodes: RibbonNode[] = Array.from({ length: nodeCount }, (_, i) => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.35,
      vy: -0.22 - Math.random() * 0.38,
      size: 6 + Math.random() * 11,
      angle: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.012,
      rgb: palette[i % palette.length],
      alpha: 0.1 + Math.random() * 0.13,
    }));

    // Pre-allocated fixed ripple & trail pearl pools (zero GC allocation per frame)
    const ripples: RippleRing[] = Array.from({ length: 6 }, () => ({
      active: false,
      x: 0,
      y: 0,
      radius: 0,
      maxRadius: 240,
      alpha: 0,
    }));
    let rippleCursor = 0;

    const pearls: TrailPearl[] = Array.from({ length: 24 }, () => ({
      active: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      life: 0,
      radius: 2,
    }));
    let pearlCursor = 0;

    const onPointerMove = (e: PointerEvent) => {
      pointer.tx = e.clientX;
      pointer.ty = e.clientY;
      if (!prefersReduced) {
        const moveDist = Math.hypot(e.clientX - pointer.lastX, e.clientY - pointer.lastY);
        if (moveDist > 22) {
          const p = pearls[pearlCursor];
          pearlCursor = (pearlCursor + 1) % pearls.length;
          p.active = true;
          p.x = e.clientX;
          p.y = e.clientY;
          p.vx = (Math.random() - 0.5) * 0.8;
          p.vy = -0.35 - Math.random() * 0.5;
          p.life = 1;
          p.radius = 2 + Math.random() * 2.5;
          pointer.lastX = e.clientX;
          pointer.lastY = e.clientY;
        }
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      if (prefersReduced) return;
      const r = ripples[rippleCursor];
      rippleCursor = (rippleCursor + 1) % ripples.length;
      r.active = true;
      r.x = e.clientX;
      r.y = e.clientY;
      r.radius = 8;
      r.maxRadius = 240;
      r.alpha = 0.28;
    };

    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerdown', onPointerDown, { passive: true });

    let rafId = 0;
    let time = 0;
    let lastTs = performance.now();
    let slowFrames = 0;
    let ecoMode = false;

    const ribbons = [
      { baseY: 0.2, amp: 42, freq: 0.0032, speed: 1.05, rgb: '37, 99, 235' },
      { baseY: 0.4, amp: 52, freq: 0.0025, speed: -0.82, rgb: '14, 165, 233' },
      { baseY: 0.62, amp: 38, freq: 0.0036, speed: 0.72, rgb: '16, 185, 129' },
      { baseY: 0.82, amp: 32, freq: 0.0029, speed: -0.6, rgb: '245, 158, 11' },
    ];

    const renderFrame = (now: number) => {
      if (document.visibilityState === 'hidden') {
        lastTs = now;
        rafId = requestAnimationFrame(renderFrame);
        return;
      }

      const delta = now - lastTs;
      lastTs = now;

      // Thermal / CPU guard: smoothly enter eco mode if frames exceed 32ms repeatedly
      if (delta > 32) {
        slowFrames += 1;
        if (slowFrames > 14) ecoMode = true;
      } else if (slowFrames > 0) {
        slowFrames -= 1;
      }

      time += 0.01;
      pointer.x += (pointer.tx - pointer.x) * 0.075;
      pointer.y += (pointer.ty - pointer.y) * 0.075;

      const dark = isDarkRef.current;
      ctx.clearRect(0, 0, width, height);

      // 1. Soft atmospheric aura following cursor
      const auraRadius = dark ? 400 : 340;
      const aura = ctx.createRadialGradient(pointer.x, pointer.y, 0, pointer.x, pointer.y, auraRadius);
      if (dark) {
        aura.addColorStop(0, 'rgba(56, 189, 248, 0.14)');
        aura.addColorStop(0.45, 'rgba(37, 99, 235, 0.08)');
        aura.addColorStop(1, 'rgba(7, 11, 20, 0)');
      } else {
        aura.addColorStop(0, 'rgba(37, 99, 235, 0.085)');
        aura.addColorStop(0.5, 'rgba(14, 165, 233, 0.04)');
        aura.addColorStop(1, 'rgba(248, 250, 252, 0)');
      }
      ctx.fillStyle = aura;
      ctx.fillRect(0, 0, width, height);

      // 2. Layered Flowing Optical Silk Ribbons
      const activeRibbons = ecoMode ? 2 : ribbons.length;
      const stepX = ecoMode ? 72 : 44;
      for (let r = 0; r < activeRibbons; r++) {
        const rb = ribbons[r];
        const yCenter = height * rb.baseY;
        ctx.beginPath();
        for (let x = -stepX; x <= width + stepX; x += stepX) {
          const dx = x - pointer.x;
          const distY = yCenter - pointer.y;
          const dist = Math.hypot(dx, distY);
          const pull = dist < 290 ? ((290 - dist) / 290) * (distY > 0 ? 28 : -28) : 0;
          const y =
            yCenter +
            Math.sin(x * rb.freq + time * rb.speed + r * 1.1) * rb.amp +
            Math.cos(x * rb.freq * 0.55 - time * 0.7) * (rb.amp * 0.42) +
            pull;
          if (x === -stepX) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = `rgba(${rb.rgb}, ${dark ? 0.16 : 0.075})`;
        ctx.lineWidth = dark ? 2.4 : 2.1;
        ctx.stroke();
      }

      // 3. Magnetic Glass Prisms + Subtle Nearby Filament Links
      const activeNodes = ecoMode ? Math.min(12, nodes.length) : nodes.length;
      for (let i = 0; i < activeNodes; i++) {
        const n = nodes[i];
        if (!prefersReduced) {
          const dx = n.x - pointer.x;
          const dy = n.y - pointer.y;
          const dist = Math.hypot(dx, dy);
          if (dist < 190 && dist > 1) {
            const push = ((190 - dist) / 190) * 0.52;
            n.x += (dx / dist) * push;
            n.y += (dy / dist) * push;
          }
          n.x += n.vx + Math.sin(time + i) * 0.18;
          n.y += n.vy;
          n.angle += n.spin;

          if (n.y < -30) {
            n.y = height + 30;
            n.x = Math.random() * width;
          }
          if (n.x < -30) n.x = width + 30;
          if (n.x > width + 30) n.x = -30;
        }

        // Draw faint filament to cursor when nearby (skip in ecoMode)
        if (!ecoMode) {
          const dCursor = Math.hypot(n.x - pointer.x, n.y - pointer.y);
          if (dCursor < 185) {
            const lineAlpha = ((185 - dCursor) / 185) * (dark ? 0.24 : 0.12);
            ctx.beginPath();
            ctx.moveTo(n.x, n.y);
            ctx.lineTo(pointer.x, pointer.y);
            ctx.strokeStyle = `rgba(${n.rgb}, ${lineAlpha.toFixed(3)})`;
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        }

        ctx.save();
        ctx.translate(n.x, n.y);
        ctx.rotate(n.angle);
        ctx.beginPath();
        ctx.moveTo(0, -n.size);
        ctx.lineTo(n.size * 0.72, 0);
        ctx.lineTo(0, n.size);
        ctx.lineTo(-n.size * 0.72, 0);
        ctx.closePath();
        const boost = dark ? 1.5 : 1;
        ctx.fillStyle = `rgba(${n.rgb}, ${(n.alpha * 0.52 * boost).toFixed(3)})`;
        ctx.fill();
        ctx.strokeStyle = `rgba(${n.rgb}, ${(n.alpha * 1.45 * boost).toFixed(3)})`;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
      }

      // 4. Cursor Light Pearls
      if (!ecoMode) {
        for (let i = 0; i < pearls.length; i++) {
          const p = pearls[i];
          if (!p.active) continue;
          p.x += p.vx;
          p.y += p.vy;
          p.life -= 0.024;
          if (p.life <= 0) {
            p.active = false;
            continue;
          }
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.radius * p.life, 0, Math.PI * 2);
          ctx.fillStyle = dark
            ? `rgba(56, 189, 248, ${(p.life * 0.42).toFixed(3)})`
            : `rgba(37, 99, 235, ${(p.life * 0.25).toFixed(3)})`;
          ctx.fill();
        }
      }

      // 5. Click Water-Ripple Rings
      for (let i = 0; i < ripples.length; i++) {
        const rp = ripples[i];
        if (!rp.active) continue;
        rp.radius += 4.2;
        rp.alpha *= 0.945;
        ctx.beginPath();
        ctx.arc(rp.x, rp.y, rp.radius, 0, Math.PI * 2);
        ctx.strokeStyle = dark
          ? `rgba(56, 189, 248, ${rp.alpha.toFixed(3)})`
          : `rgba(37, 99, 235, ${rp.alpha.toFixed(3)})`;
        ctx.lineWidth = 1.6;
        ctx.stroke();
        if (rp.alpha < 0.015 || rp.radius >= rp.maxRadius) {
          rp.active = false;
        }
      }

      if (!prefersReduced) {
        rafId = requestAnimationFrame(renderFrame);
      }
    };

    rafId = requestAnimationFrame(renderFrame);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerdown', onPointerDown);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none z-0"
    />
  );
};

/**
 * Lightweight count-up numeral on mount using compositor-friendly rAF (no external loop).
 */
const AnimatedCounter: React.FC<{ value: number; fallback: string }> = ({ value, fallback }) => {
  const [display, setDisplay] = useState<number>(value);

  useEffect(() => {
    if (value <= 0) {
      setDisplay(0);
      return;
    }
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) {
      setDisplay(value);
      return;
    }

    let raf = 0;
    const duration = 850;
    const start = performance.now();

    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(value * eased));
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  if (value <= 0) return <>{fallback}</>;
  return <>{display.toLocaleString('uz-UZ')}</>;
};

/**
 * Scroll-triggered smooth compositor entrance (`transform` + `opacity` only), disconnecting once visible.
 */
const RevealBlock: React.FC<{ children: React.ReactNode; className?: string; delayMs?: number }> = ({
  children,
  className = '',
  delayMs = 0,
}) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setShown(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (let i = 0; i < entries.length; i++) {
          if (entries[i].isIntersecting) {
            setShown(true);
            observer.disconnect();
            break;
          }
        }
      },
      { threshold: 0.08, rootMargin: '0px 0px -30px 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{
        transitionProperty: 'transform, opacity',
        transitionDuration: '580ms',
        transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
        transitionDelay: `${delayMs}ms`,
        transform: shown ? 'translateY(0px) scale(1)' : 'translateY(18px) scale(0.985)',
        opacity: shown ? 1 : 0,
      }}
      className={className}
    >
      {children}
    </div>
  );
};

export const LandingPagePro: React.FC<LandingPageProProps> = ({
  classes,
  students,
  teacherCertificates,
  onEnterPortal,
  onOpenAdminLogin,
}) => {
  // Light / Dark theme synced cleanly onto <html> ONLY while LandingPagePro is mounted
  const [theme, setTheme] = useState<LandingTheme>(() => {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (saved === 'dark' || saved === 'light') return saved;
    } catch {}
    return 'light';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {}
  }, [theme]);

  useEffect(() => {
    return () => {
      document.documentElement.classList.remove('dark');
    };
  }, []);

  // Scroll progress hairline bar using passive rAF
  const [scrollProgress, setScrollProgress] = useState(0);
  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const doc = document.documentElement;
        const max = Math.max(1, doc.scrollHeight - window.innerHeight);
        setScrollProgress(Math.min(1, Math.max(0, window.scrollY / max)));
        ticking = false;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Image fallback states
  const [heroImgError, setHeroImgError] = useState(false);
  const [featureImgError, setFeatureImgError] = useState(false);
  const [professorImgError, setProfessorImgError] = useState(false);

  // Interactive 3D tactile tilt for Specimen Certificate Card
  const [certTilt, setCertTilt] = useState({ rx: 0, ry: 0, gx: 50, gy: 50 });
  const [specimenTrack, setSpecimenTrack] = useState<'ai' | 'developer'>('ai');
  const [specimenAccepted, setSpecimenAccepted] = useState(false);

  // Interactive Reception Simulator state
  const [activeStep, setActiveStep] = useState<1 | 2 | 3>(1);
  const [formatTab, setFormatTab] = useState<FormatPreviewTab>('telegram');
  const [selectedSampleClassId, setSelectedSampleClassId] = useState<string>('');
  const [copiedPreview, setCopiedPreview] = useState(false);

  // Interactive Class Directory Finder
  const [classQuery, setClassQuery] = useState('');
  const [trackFilter, setTrackFilter] = useState<'all' | 'ai' | 'developer'>('all');

  // O(N) live counters directly from app state
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

    const teacherCertCount = teacherCertificates.filter(t => t.status === 'certified').length;
    const completionPct = students.length > 0 ? Math.round((totalCertified / students.length) * 100) : 0;

    return {
      classCount: classes.length,
      studentCount: students.length,
      certifiedCount: totalCertified,
      teacherCertCount,
      completionPct,
      classMap,
    };
  }, [classes, students, teacherCertificates]);

  const sampleClass = useMemo(() => {
    if (classes.length === 0) return null;
    return classes.find(c => c.id === selectedSampleClassId) || classes[0];
  }, [classes, selectedSampleClassId]);

  const previewText = useMemo(() => {
    const school = sampleClass?.schoolName || '16-maktab';
    const className = sampleClass?.name || '9-A';
    const teacherName = sampleClass?.teacherName || 'M. Abdullayeva';

    if (formatTab === 'telegram') {
      return [
        `Sinf: ${className} (${school})`,
        `Sinf rahbari: ${teacherName}`,
        `Tayyor sertifikatlar: ${SAMPLE_PREVIEW_STUDENTS.length} ta`,
        '',
        ...SAMPLE_PREVIEW_STUDENTS.map(
          (st) => `${st.index}. ${st.fullName} — ${st.date}\n   ${st.url}`
        ),
      ].join('\n');
    }

    if (formatTab === 'sheets') {
      return SAMPLE_PREVIEW_STUDENTS.map((st) =>
        [
          st.index,
          "O'quvchi",
          st.fullName,
          st.birthDate,
          st.series,
          st.number,
          'ustoz@maktab.uz',
          '+998901234567',
          school,
          '02.02.2026',
          st.date,
          st.url,
        ].join('\t')
      ).join('\n');
    }

    return [
      `${className}_${school}_Sertifikatlar.pdf  (Barchasi bitta hujjatda)`,
      `${className}_Arxiv.zip                   (${SAMPLE_PREVIEW_STUDENTS.length} ta alohida fayl)`,
      '',
      'Har bir o‘quvchining sertifikati tartib raqami va F.I.O bilan nomlanadi.',
    ].join('\n');
  }, [formatTab, sampleClass]);

  const handleCopyPreview = async () => {
    try {
      await navigator.clipboard.writeText(previewText);
    } catch {}
    setCopiedPreview(true);
    setTimeout(() => setCopiedPreview(false), 2000);
  };

  const filteredClasses = useMemo(() => {
    const q = classQuery.trim().toLowerCase();
    return classes
      .filter((cg) => {
        const tr = cg.projectType === 'developer' ? 'developer' : 'ai';
        if (trackFilter !== 'all' && tr !== trackFilter) return false;
        if (!q) return true;
        return (
          cg.name.toLowerCase().includes(q) ||
          cg.teacherName.toLowerCase().includes(q) ||
          (cg.schoolName ? cg.schoolName.toLowerCase().includes(q) : false)
        );
      })
      .slice(0, 6);
  }, [classes, classQuery, trackFilter]);

  const handleCardPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    setCertTilt({
      rx: (0.5 - py) * 12,
      ry: (px - 0.5) * 14,
      gx: Math.round(px * 100),
      gy: Math.round(py * 100),
    });
  };

  const resetCardTilt = () => {
    setCertTilt({ rx: 0, ry: 0, gx: 50, gy: 50 });
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#070B14] text-[#0F172A] dark:text-slate-100 font-body relative flex flex-col overflow-x-hidden transition-colors duration-300">
      {/* Living Optical Silk & Water-Ripple Canvas (Theme-aware, budgeted, zero cosmos) */}
      <LivingAtmosphereCanvas isDark={theme === 'dark'} />

      {/* Strict 3-Zone Sticky Top Navigation Bar */}
      <header className="sticky top-0 z-40 h-16 bg-white/90 dark:bg-[#0B1120]/90 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800/80 transition-colors duration-300">
        <div className="max-w-7xl mx-auto h-full px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-8">
          {/* Zone 1: Clean single-line brand wordmark */}
          <a
            href="#top"
            className="flex items-center gap-2.5 text-[#0F172A] dark:text-white hover:text-[#1D4ED8] dark:hover:text-sky-400 transition-colors whitespace-nowrap shrink-0"
          >
            <span className="w-8 h-8 rounded-lg bg-[#1D4ED8] text-white flex items-center justify-center shrink-0">
              <GraduationCap className="w-4 h-4" />
            </span>
            <span className="font-display font-bold text-base sm:text-lg tracking-tight">
              Bir Million Dasturchi
            </span>
          </a>

          {/* Zone 2: 4 clean single-line navigation links */}
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600 dark:text-slate-300">
            <a href="#jarayon" className="hover:text-[#0F172A] dark:hover:text-white transition-colors whitespace-nowrap shrink-0">
              Jarayon
            </a>
            <a href="#sinflar" className="hover:text-[#0F172A] dark:hover:text-white transition-colors whitespace-nowrap shrink-0">
              Sinflar
            </a>
            <a href="#afzalliklar" className="hover:text-[#0F172A] dark:hover:text-white transition-colors whitespace-nowrap shrink-0">
              Afzalliklar
            </a>
            <a href="#yonalishlar" className="hover:text-[#0F172A] dark:hover:text-white transition-colors whitespace-nowrap shrink-0">
              Yo‘nalishlar
            </a>
          </nav>

          {/* Zone 3: 1 Primary CTA */}
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() => onEnterPortal()}
              className="px-4 py-2 rounded-lg bg-[#1D4ED8] hover:bg-[#1E40AF] text-white text-sm font-semibold inline-flex items-center gap-2 transition-all duration-200 hover:-translate-y-0.5 active:scale-95 cursor-pointer whitespace-nowrap shrink-0"
            >
              <span>Portalga kirish</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Compositor-only top scroll reading progress line */}
        <div
          aria-hidden="true"
          style={{ transform: `scaleX(${scrollProgress})`, transformOrigin: 'left' }}
          className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#1D4ED8] dark:bg-sky-400 pointer-events-none"
        />
      </header>

      <main id="top" className="flex-1 relative z-10">
        {/* HERO SECTION */}
        <section className="pt-8 pb-12 sm:pt-14 sm:pb-16 lg:pt-18 lg:pb-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            {/* Hero top utility row: Unboxed domain kicker + Theme Mode Switch */}
            <div className="flex flex-wrap items-center justify-between gap-4 mb-8 pb-4 border-b border-slate-200/80 dark:border-slate-800/80">
              <p className="text-xs font-semibold text-[#1D4ED8] dark:text-sky-400 tracking-wide">
                Ta’lim va sertifikatlar makoni · 2025–2026 o‘quv yili
              </p>

              {/* Segmented Light / Dark Mode Switch */}
              <div
                role="group"
                aria-label="Mavzu rejimi"
                className="inline-flex items-center gap-1 p-1 rounded-lg bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800"
              >
                <button
                  type="button"
                  onClick={() => setTheme('light')}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold inline-flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                    theme === 'light'
                      ? 'bg-[#1D4ED8] text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Sun className="w-3.5 h-3.5" />
                  <span>Yorug‘</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTheme('dark')}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold inline-flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                    theme === 'dark'
                      ? 'bg-[#1D4ED8] text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Moon className="w-3.5 h-3.5" />
                  <span>Tungi</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-stretch">
              {/* Left Copy */}
              <RevealBlock className="lg:col-span-6 flex flex-col justify-center">
                <h1
                  className="font-display font-extrabold text-[#0F172A] dark:text-white tracking-[-0.03em] leading-[1.07] mb-5"
                  style={{ fontSize: 'clamp(2.2rem, 3.9vw, 3.5rem)', textWrap: 'balance' }}
                >
                  Sertifikatlar bir joyda joylanadi — ustozlar esa bir zumda qabul qiladi.
                </h1>

                <p className="text-base sm:text-lg text-[#475569] dark:text-slate-300 leading-relaxed max-w-xl mb-8">
                  O‘quvchilar va pedagoglarning tayyor sertifikatlarini sinflar bo‘yicha ko‘rish,
                  nusxalash hamda to‘liq ro‘yxat shaklida yuklab olish uchun yaratilgan yengil,
                  jonli va hammaga tushunarli ta’lim portali.
                </p>

                <div className="flex flex-wrap items-center gap-6">
                  <button
                    type="button"
                    onClick={() => onEnterPortal()}
                    className="px-6 py-3.5 rounded-lg bg-[#1D4ED8] hover:bg-[#1E40AF] text-white text-sm sm:text-base font-semibold inline-flex items-center gap-2.5 transition-all duration-200 cursor-pointer shadow-sm hover:-translate-y-0.5 active:scale-95"
                  >
                    <span>Sertifikatlarni qabul qilish</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={onOpenAdminLogin}
                    className="text-sm font-semibold text-slate-700 dark:text-slate-300 hover:text-[#0F172A] dark:hover:text-white inline-flex items-center gap-2 py-2 border-b border-slate-300 dark:border-slate-700 hover:border-[#0F172A] dark:hover:border-white transition-colors cursor-pointer"
                  >
                    <Lock className="w-3.5 h-3.5 text-[#1D4ED8] dark:text-sky-400" />
                    <span>Boshqaruv kirishi</span>
                  </button>
                </div>
              </RevealBlock>

              {/* Right Sunlit Campus Frame with gentle float & hover zoom */}
              <RevealBlock delayMs={90} className="lg:col-span-6">
                <div className="relative h-full min-h-[260px] sm:min-h-[340px] lg:min-h-[410px] rounded-2xl overflow-hidden border border-slate-200/90 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 shadow-sm group">
                  {!heroImgError ? (
                    <img
                      src={heroCampusImg}
                      alt="Yorug‘ va zamonaviy universitet IT o‘quv xonasi"
                      referrerPolicy="no-referrer"
                      onError={() => setHeroImgError(true)}
                      className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center bg-gradient-to-br from-blue-50 to-sky-100 dark:from-slate-900 dark:to-slate-800 text-slate-800 dark:text-slate-100">
                      <Award className="w-12 h-12 text-[#1D4ED8] dark:text-sky-400 mb-3 animate-gentle-float" />
                      <p className="font-display font-bold text-lg">Ta’lim va Yutuqlar Muhiti</p>
                      <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 max-w-xs">
                        Tayyor sertifikatlar sinflar kesimida tartibli jamlanadi
                      </p>
                    </div>
                  )}

                  {/* Measured Contrast Scrim */}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/90 via-slate-950/50 to-transparent px-6 py-5 flex items-end justify-between gap-4 text-white">
                    <div>
                      <p className="text-xs font-medium text-sky-200">
                        Maktablar va oliy ta’lim muassasalari uchun
                      </p>
                      <p className="font-display font-bold text-base sm:text-lg text-white mt-0.5">
                        Har bir sinf sertifikati o‘z egasini kutmoqda
                      </p>
                    </div>
                    <span className="font-mono-tech text-xs font-semibold text-white/95 shrink-0">
                      {liveStats.completionPct}% tayyor
                    </span>
                  </div>
                </div>
              </RevealBlock>
            </div>
          </div>
        </section>

        {/* FULL-WIDTH LIVE QUANTITATIVE BAR */}
        <section className="border-y border-slate-200/90 dark:border-slate-800/90 bg-white/85 dark:bg-[#0B1120]/85 backdrop-blur-sm transition-colors duration-300">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 dark:divide-slate-800">
              <div className="py-6 sm:py-7 lg:pr-8">
                <p className="font-mono-tech text-2xl sm:text-3xl font-bold text-[#0F172A] dark:text-white">
                  <AnimatedCounter value={liveStats.classCount} fallback="24+" />
                </p>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1">
                  Portalga kiritilgan sinflar
                </p>
              </div>

              <div className="py-6 sm:py-7 pl-4 lg:px-8">
                <p className="font-mono-tech text-2xl sm:text-3xl font-bold text-[#0F172A] dark:text-white">
                  <AnimatedCounter value={liveStats.studentCount} fallback="640+" />
                </p>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1">
                  Ro‘yxatdagi jami o‘quvchilar
                </p>
              </div>

              <div className="py-6 sm:py-7 lg:px-8">
                <p className="font-mono-tech text-2xl sm:text-3xl font-bold text-[#1D4ED8] dark:text-sky-400">
                  <AnimatedCounter value={liveStats.certifiedCount} fallback="510+" />
                </p>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1">
                  Tayyor sertifikatlar ({liveStats.teacherCertCount} ustoz)
                </p>
              </div>

              <div className="py-6 sm:py-7 pl-4 lg:pl-8">
                <p className="font-mono-tech text-2xl sm:text-3xl font-bold text-[#0F172A] dark:text-white">
                  2 yo‘nalish
                </p>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1">
                  1M Promter va 5M AI Yetakchilari
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 1: INTERAKTIV SERTIFIKAT QABUL QILISH SAHNASI */}
        <section id="jarayon" className="py-16 sm:py-24">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <RevealBlock className="max-w-2xl mb-12">
              <p className="text-xs font-semibold text-[#1D4ED8] dark:text-sky-400 mb-2">
                01. Interaktiv Tajriba Dunyosi
              </p>
              <h2
                className="font-display font-bold text-[#0F172A] dark:text-white tracking-[-0.02em] leading-tight"
                style={{ fontSize: 'clamp(1.65rem, 2.8vw, 2.35rem)', textWrap: 'balance' }}
              >
                Ustoz sifatida sertifikat qanday qabul qilinishini hoziroq sinab ko‘ring.
              </h2>
            </RevealBlock>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
              {/* Left Stage: Interactive 3D Tilt Tactile Certificate Card + 3 Guided Steps */}
              <RevealBlock className="lg:col-span-5 flex flex-col justify-between bg-white/95 dark:bg-[#0F172A]/95 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-7 shadow-xs transition-colors duration-300">
                <div>
                  <div className="flex items-center justify-between gap-3 mb-4">
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                      Jonli sertifikat namunasi
                    </span>
                    <div className="inline-flex border border-slate-200 dark:border-slate-700 rounded-lg p-0.5 bg-slate-50 dark:bg-slate-900 text-xs">
                      <button
                        type="button"
                        onClick={() => {
                          setSpecimenTrack('ai');
                          setSpecimenAccepted(false);
                        }}
                        className={`px-2.5 py-1 rounded-md font-medium cursor-pointer transition-colors ${
                          specimenTrack === 'ai'
                            ? 'bg-[#1D4ED8] text-white'
                            : 'text-slate-600 dark:text-slate-400 hover:text-[#0F172A] dark:hover:text-white'
                        }`}
                      >
                        1M Promter
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSpecimenTrack('developer');
                          setSpecimenAccepted(false);
                        }}
                        className={`px-2.5 py-1 rounded-md font-medium cursor-pointer transition-colors ${
                          specimenTrack === 'developer'
                            ? 'bg-[#0F172A] dark:bg-sky-500 text-white dark:text-slate-950'
                            : 'text-slate-600 dark:text-slate-400 hover:text-[#0F172A] dark:hover:text-white'
                        }`}
                      >
                        5M AI
                      </button>
                    </div>
                  </div>

                  {/* Interactive 3D Pointer-Gliding Digital Certificate Card with Automated Foil Sweep */}
                  <div
                    onPointerMove={handleCardPointerMove}
                    onPointerLeave={resetCardTilt}
                    style={{
                      transform: `perspective(900px) rotateX(${certTilt.rx}deg) rotateY(${certTilt.ry}deg)`,
                      transition: 'transform 160ms cubic-bezier(0.16, 1, 0.3, 1)',
                    }}
                    className="relative rounded-xl border border-slate-200 dark:border-slate-700/90 bg-gradient-to-br from-white via-sky-50/55 to-blue-50/80 dark:from-[#131C31] dark:via-[#111827] dark:to-[#0F172A] p-5 overflow-hidden select-none mb-6 shadow-xs"
                  >
                    {/* Animated shimmer foil sweep */}
                    <div
                      aria-hidden="true"
                      className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/70 dark:via-sky-300/15 to-transparent pointer-events-none animate-foil-sweep"
                    />

                    {/* Specular mouse glare */}
                    <div
                      aria-hidden="true"
                      style={{
                        background: `radial-gradient(240px circle at ${certTilt.gx}% ${certTilt.gy}%, rgba(56,189,248,0.18), transparent 65%)`,
                      }}
                      className="absolute inset-0 pointer-events-none"
                    />

                    <div className="relative z-10">
                      <div className="flex items-start justify-between gap-3 mb-4">
                        <div>
                          <p className="text-[11px] font-semibold text-[#1D4ED8] dark:text-sky-400">
                            {specimenTrack === 'ai'
                              ? 'Bir Million Promter · Coursera'
                              : 'Besh Million AI Yetakchilari'}
                          </p>
                          <h3 className="font-display font-bold text-base text-[#0F172A] dark:text-white mt-0.5">
                            Karimova Madina Rustam qizi
                          </h3>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            16-maktab · 9-A sinf
                          </p>
                        </div>

                        <span className="w-9 h-9 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 animate-gentle-float">
                          <Award className="w-5 h-5" />
                        </span>
                      </div>

                      <div className="pt-3 border-t border-slate-200/80 dark:border-slate-700/80 flex items-center justify-between gap-2 text-xs">
                        <span className="font-mono-tech text-slate-600 dark:text-slate-400">
                          Berilgan sana: 19.02.2026
                        </span>
                        <span
                          className={`font-semibold inline-flex items-center gap-1 transition-transform duration-200 ${
                            specimenAccepted
                              ? 'text-emerald-700 dark:text-emerald-400 scale-105'
                              : 'text-[#1D4ED8] dark:text-sky-400'
                          }`}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>{specimenAccepted ? 'Qabul qilindi' : 'Tayyor holda'}</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Interactive 3-Step Selector */}
                  <div className="space-y-2">
                    {[
                      {
                        step: 1 as const,
                        title: '01. Sinfingizni tanlaysiz',
                        desc: 'Kerakli maktab va sinfni bir zumda topib ochasiz.',
                      },
                      {
                        step: 2 as const,
                        title: '02. Tayyor ro‘yxatni ko‘rasiz',
                        desc: 'Har bir o‘quvchining sertifikati tartibli holda ko‘rinadi.',
                      },
                      {
                        step: 3 as const,
                        title: '03. Bir bosishda qabul qilasiz',
                        desc: 'Telegramga ulashasiz, jadvalga qo‘yasiz yoki yuklab olasiz.',
                      },
                    ].map((item) => {
                      const isOn = activeStep === item.step;
                      return (
                        <button
                          key={item.step}
                          type="button"
                          onClick={() => {
                            setActiveStep(item.step);
                            if (item.step === 3) setSpecimenAccepted(true);
                          }}
                          className={`w-full text-left px-4 py-3 rounded-xl border transition-all duration-200 cursor-pointer ${
                            isOn
                              ? 'bg-blue-50/80 dark:bg-blue-950/50 border-blue-300 dark:border-blue-600 text-[#0F172A] dark:text-white translate-x-1'
                              : 'bg-slate-50/70 dark:bg-slate-900/60 border-slate-200/80 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-900'
                          }`}
                        >
                          <p className="font-display font-bold text-sm">{item.title}</p>
                          <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">{item.desc}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setSpecimenAccepted((prev) => !prev)}
                  className="mt-5 w-full py-2.5 px-4 rounded-lg border border-slate-300 dark:border-slate-700 hover:border-[#1D4ED8] dark:hover:border-sky-400 bg-white dark:bg-slate-900 text-xs font-semibold text-[#0F172A] dark:text-slate-100 inline-flex items-center justify-center gap-2 transition-all active:scale-[0.98] cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-[#1D4ED8] dark:text-sky-400" />
                  <span>
                    {specimenAccepted
                      ? 'Namuna holatini yangilash'
                      : 'Namuna sertifikatni qabul qilib ko‘rish'}
                  </span>
                </button>
              </RevealBlock>

              {/* Right Stage: Interactive Format Explorer + Sunlit Desk Photo */}
              <RevealBlock delayMs={110} className="lg:col-span-7 flex flex-col justify-between bg-white/95 dark:bg-[#0F172A]/95 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xs transition-colors duration-300">
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
                    <div>
                      <h3 className="font-display font-bold text-lg text-[#0F172A] dark:text-white">
                        Ustozlarga qulay 3 xil qabul qilish usuli
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Sinfingiz uchun qaysi format qulay bo‘lsa, o‘shani tanlang
                      </p>
                    </div>

                    <div className="inline-flex border border-slate-200 dark:border-slate-700 rounded-lg p-0.5 bg-slate-50 dark:bg-slate-900 text-xs">
                      <button
                        type="button"
                        onClick={() => setFormatTab('telegram')}
                        className={`px-3 py-1.5 rounded-md font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                          formatTab === 'telegram'
                            ? 'bg-[#1D4ED8] text-white'
                            : 'text-slate-600 dark:text-slate-400 hover:text-[#0F172A] dark:hover:text-white'
                        }`}
                      >
                        <Send className="w-3 h-3" />
                        <span>Telegram</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormatTab('sheets')}
                        className={`px-3 py-1.5 rounded-md font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                          formatTab === 'sheets'
                            ? 'bg-[#1D4ED8] text-white'
                            : 'text-slate-600 dark:text-slate-400 hover:text-[#0F172A] dark:hover:text-white'
                        }`}
                      >
                        <FileSpreadsheet className="w-3 h-3" />
                        <span>Google Sheets</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormatTab('bundle')}
                        className={`px-3 py-1.5 rounded-md font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                          formatTab === 'bundle'
                            ? 'bg-[#1D4ED8] text-white'
                            : 'text-slate-600 dark:text-slate-400 hover:text-[#0F172A] dark:hover:text-white'
                        }`}
                      >
                        <FolderArchive className="w-3 h-3" />
                        <span>PDF / ZIP</span>
                      </button>
                    </div>
                  </div>

                  {/* Class sample switcher */}
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-4 text-xs text-slate-600 dark:text-slate-400">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-700 dark:text-slate-300">Sinf namunasi:</span>
                      {classes.length > 0 ? (
                        <select
                          aria-label="Namuna sinf"
                          value={sampleClass?.id || ''}
                          onChange={(e) => setSelectedSampleClassId(e.target.value)}
                          className="border border-slate-200 dark:border-slate-700 rounded-md px-2.5 py-1 text-xs font-medium text-[#0F172A] dark:text-slate-100 bg-white dark:bg-slate-900 focus:outline-none focus:border-[#1D4ED8]"
                        >
                          {classes.slice(0, 12).map((cg) => (
                            <option key={cg.id} value={cg.id}>
                              {cg.name} · {cg.teacherName}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="font-mono-tech text-slate-700 dark:text-slate-300">9-A · 16-maktab</span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={handleCopyPreview}
                      className="px-3 py-1.5 rounded-md border border-slate-300 dark:border-slate-700 hover:border-[#1D4ED8] dark:hover:border-sky-400 bg-white dark:bg-slate-900 text-xs font-semibold text-[#0F172A] dark:text-slate-100 inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      {copiedPreview ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                          <span className="text-emerald-700 dark:text-emerald-400">Nusxalandi</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 text-[#1D4ED8] dark:text-sky-400" />
                          <span>Nusxalash</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Clean Preview Surface */}
                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070B14] p-4 overflow-x-auto mb-6">
                    <pre className="font-mono-tech text-xs text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre">
                      {previewText}
                    </pre>
                  </div>
                </div>

                {/* Tactile Photo Footer Split */}
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-5 items-center pt-5 border-t border-slate-100 dark:border-slate-800">
                  <div className="sm:col-span-5 aspect-[4/3] rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 group">
                    {!featureImgError ? (
                      <img
                        src={featureVerificationImg}
                        alt="Yorug‘ stolda tayyor sertifikat hujjatlari"
                        referrerPolicy="no-referrer"
                        onError={() => setFeatureImgError(true)}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[#1D4ED8] dark:text-sky-400">
                        <BookOpen className="w-8 h-8" />
                      </div>
                    )}
                  </div>
                  <div className="sm:col-span-7">
                    <h4 className="font-display font-bold text-base text-[#0F172A] dark:text-white mb-1.5">
                      O‘quvchi ma’lumotlari adashib ketmaydi
                    </h4>
                    <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                      Har bir o‘quvchining tug‘ilgan sanasi, guvohnoma seriyasi va sertifikat havolasi o‘z joyida tartib bilan saqlanadi. Ustoz faqat tayyor natijani qabul qilib oladi.
                    </p>
                  </div>
                </div>
              </RevealBlock>
            </div>
          </div>
        </section>

        {/* SECTION 2: JONLI SINF VA USTOZLAR QIDIRUVI */}
        <section id="sinflar" className="py-16 sm:py-20 bg-white/90 dark:bg-[#0B1120]/90 border-y border-slate-200 dark:border-slate-800 transition-colors duration-300">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <RevealBlock className="flex flex-wrap items-end justify-between gap-6 mb-8">
              <div>
                <p className="text-xs font-semibold text-[#1D4ED8] dark:text-sky-400 mb-2">
                  02. Sinfni Topish va Olish
                </p>
                <h2
                  className="font-display font-bold text-[#0F172A] dark:text-white tracking-[-0.02em] leading-tight"
                  style={{ fontSize: 'clamp(1.65rem, 2.8vw, 2.35rem)', textWrap: 'balance' }}
                >
                  O‘z sinfingizni topib, sertifikatlarni hoziroq oching.
                </h2>
              </div>

              <div className="inline-flex border border-slate-200 dark:border-slate-700 rounded-lg p-1 bg-slate-50 dark:bg-slate-900 text-xs">
                <button
                  type="button"
                  onClick={() => setTrackFilter('all')}
                  className={`px-3 py-1.5 rounded-md font-semibold cursor-pointer transition-colors ${
                    trackFilter === 'all'
                      ? 'bg-[#0F172A] dark:bg-sky-500 text-white dark:text-slate-950'
                      : 'text-slate-600 dark:text-slate-400 hover:text-[#0F172A] dark:hover:text-white'
                  }`}
                >
                  Barchasi
                </button>
                <button
                  type="button"
                  onClick={() => setTrackFilter('ai')}
                  className={`px-3 py-1.5 rounded-md font-semibold cursor-pointer transition-colors ${
                    trackFilter === 'ai'
                      ? 'bg-[#1D4ED8] text-white'
                      : 'text-slate-600 dark:text-slate-400 hover:text-[#0F172A] dark:hover:text-white'
                  }`}
                >
                  1M Promter
                </button>
                <button
                  type="button"
                  onClick={() => setTrackFilter('developer')}
                  className={`px-3 py-1.5 rounded-md font-semibold cursor-pointer transition-colors ${
                    trackFilter === 'developer'
                      ? 'bg-[#1D4ED8] text-white'
                      : 'text-slate-600 dark:text-slate-400 hover:text-[#0F172A] dark:hover:text-white'
                  }`}
                >
                  5M AI
                </button>
              </div>
            </RevealBlock>

            {/* Search Input */}
            <div className="relative mb-6 max-w-2xl">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={classQuery}
                onChange={(e) => setClassQuery(e.target.value)}
                placeholder="Sinf nomi, ustoz ismi yoki maktab raqamini yozing..."
                className="w-full pl-10 pr-4 py-3 text-sm border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-900 text-[#0F172A] dark:text-white placeholder:text-slate-400 focus:bg-white dark:focus:bg-[#0F172A] focus:outline-none focus:border-[#1D4ED8] dark:focus:border-sky-400 transition-colors"
              />
            </div>

            {filteredClasses.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {filteredClasses.map((cg) => {
                  const stats = liveStats.classMap.get(cg.id) || { total: 0, certified: 0 };
                  const pct = stats.total > 0 ? Math.round((stats.certified / stats.total) * 100) : 0;
                  const tr = cg.projectType === 'developer' ? 'developer' : 'ai';

                  return (
                    <button
                      key={cg.id}
                      type="button"
                      onClick={() => onEnterPortal(tr, cg.id)}
                      className="text-left bg-[#F8FAFC] dark:bg-[#0F172A] hover:bg-white dark:hover:bg-[#131D35] border border-slate-200 dark:border-slate-800 hover:border-[#1D4ED8] dark:hover:border-sky-400 rounded-xl p-5 transition-all duration-200 cursor-pointer group hover:-translate-y-1"
                    >
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <h3 className="font-display font-bold text-lg text-[#0F172A] dark:text-white group-hover:text-[#1D4ED8] dark:group-hover:text-sky-400 transition-colors">
                          {cg.name}
                        </h3>
                        <span className="font-mono-tech text-xs font-semibold text-[#0F172A] dark:text-slate-200 shrink-0">
                          {stats.certified} / {stats.total}
                        </span>
                      </div>

                      <div className="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-2 mb-4 truncate">
                        <span className="truncate">{cg.teacherName}</span>
                        {cg.schoolName && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="truncate">{cg.schoolName}</span>
                          </>
                        )}
                        <span aria-hidden="true">·</span>
                        <span className="shrink-0">{tr === 'developer' ? '5M AI' : '1M Promter'}</span>
                      </div>

                      <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden mb-3">
                        <div
                          className="h-full rounded-full bg-[#1D4ED8] dark:bg-sky-400 transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>

                      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                        <span className="font-mono-tech">{pct}% tayyor</span>
                        <span className="font-semibold text-[#1D4ED8] dark:text-sky-400 inline-flex items-center gap-1">
                          <span>Ochish</span>
                          <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center text-sm text-slate-500 dark:text-slate-400 bg-[#F8FAFC] dark:bg-slate-900">
                Kiritilgan so‘z bo‘yicha sinf topilmadi. Barcha sinflarni ko‘rish uchun portalga kiring.
              </div>
            )}
          </div>
        </section>

        {/* SECTION 3: HAMMA UCHUN YOQIMLI AKADEMIK MUHIT */}
        <section id="afzalliklar" className="py-16 sm:py-24">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-stretch">
              <RevealBlock className="lg:col-span-5">
                <div className="h-full min-h-[280px] sm:min-h-[340px] rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 group">
                  {!professorImgError ? (
                    <img
                      src={professorLabImg}
                      alt="Ustoz va IT professor natijalar jadvalini ko‘zdan kechirmoqda"
                      referrerPolicy="no-referrer"
                      onError={() => setProfessorImgError(true)}
                      className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center text-slate-600 dark:text-slate-300">
                      <GraduationCap className="w-10 h-10 text-[#1D4ED8] dark:text-sky-400 mb-3 animate-gentle-float" />
                      <p className="font-display font-bold text-base">Akademik Tartib va Qulaylik</p>
                    </div>
                  )}
                </div>
              </RevealBlock>

              <RevealBlock delayMs={100} className="lg:col-span-7 flex flex-col justify-between bg-white/95 dark:bg-[#0F172A]/95 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 transition-colors duration-300">
                <div>
                  <p className="text-xs font-semibold text-[#1D4ED8] dark:text-sky-400 mb-2">
                    03. Platformaning Asosiy Vazifasi
                  </p>
                  <h2
                    className="font-display font-bold text-[#0F172A] dark:text-white tracking-[-0.02em] leading-tight mb-6"
                    style={{ fontSize: 'clamp(1.65rem, 2.8vw, 2.35rem)', textWrap: 'balance' }}
                  >
                    Hech qanday murakkabliksiz — sertifikatlar o‘z vaqtida qo‘lingizda.
                  </h2>
                </div>

                <div className="divide-y divide-slate-200 dark:divide-slate-800 border-t border-slate-200 dark:border-slate-800">
                  <div className="py-5 grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-6 items-baseline">
                    <div className="sm:col-span-4 font-display font-bold text-sm text-[#0F172A] dark:text-white">
                      Sinf rahbarlari uchun
                    </div>
                    <div className="sm:col-span-8 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                      O‘quvchilaringizga berilgan barcha sertifikatlarni bir joyda ko‘rasiz, Telegram guruhlarga
                      chiroyli ko‘rinishda yuborasiz yoki jadvalga bir bosishda joylashtirasiz.
                    </div>
                  </div>

                  <div className="py-5 grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-6 items-baseline">
                    <div className="sm:col-span-4 font-display font-bold text-sm text-[#0F172A] dark:text-white">
                      Oliy ta’lim va kafedralar uchun
                    </div>
                    <div className="sm:col-span-8 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                      Guruhlar hamda o‘qituvchilar bo‘yicha tayyor sertifikatlar ro‘yxatini tartibli kuzatish,
                      to‘plam shaklida yuklab olish va umumiy hisobot yuritish juda oson.
                    </div>
                  </div>

                  <div className="py-5 grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-6 items-baseline">
                    <div className="sm:col-span-4 font-display font-bold text-sm text-[#0F172A] dark:text-white">
                      Har bir qurilmada qulay
                    </div>
                    <div className="sm:col-span-8 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                      Telefonda ham, kompyuterda ham tez ochiladi, yorug‘ va tungi rejimlarda ko‘zni
                      charchatmaydigan silliq ko‘rinishda ishlaydi.
                    </div>
                  </div>
                </div>
              </RevealBlock>
            </div>
          </div>
        </section>

        {/* SECTION 4: IKKI YO'NALISHGA KIRISH */}
        <section id="yonalishlar" className="pb-16 sm:pb-24">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <RevealBlock className="bg-white/95 dark:bg-[#0F172A]/95 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-10 transition-colors duration-300">
              <div className="max-w-2xl mb-8">
                <p className="text-xs font-semibold text-[#1D4ED8] dark:text-sky-400 mb-2">
                  04. Loyihani Tanlash
                </p>
                <h2 className="font-display font-bold text-2xl sm:text-3xl text-[#0F172A] dark:text-white tracking-tight mb-2">
                  Qaysi dastur bo‘yicha sertifikat olmoqchisiz?
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  Kerakli yo‘nalishni tanlang — sinflar ro‘yxati darhol ochiladi.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-6 bg-[#F8FAFC] dark:bg-[#0B1120] flex flex-col justify-between hover:border-[#1D4ED8] dark:hover:border-sky-400 transition-colors">
                  <div>
                    <p className="text-xs font-semibold text-[#1D4ED8] dark:text-sky-400 mb-2">
                      1-yo‘nalish · Coursera dasturi
                    </p>
                    <h3 className="font-display font-bold text-xl text-[#0F172A] dark:text-white mb-2">
                      Bir million promter
                    </h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed mb-6">
                      Maktab o‘quvchilari va ustozlar uchun Coursera asosidagi tayyor sertifikatlarni
                      qabul qilish va yuklab olish bo‘limi.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => onEnterPortal('ai')}
                    className="w-full py-3 px-5 rounded-lg bg-[#1D4ED8] hover:bg-[#1E40AF] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-all hover:-translate-y-0.5 active:scale-[0.98] cursor-pointer"
                  >
                    <span>1M Promterga kirish</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>

                <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-6 bg-[#F8FAFC] dark:bg-[#0B1120] flex flex-col justify-between hover:border-[#1D4ED8] dark:hover:border-sky-400 transition-colors">
                  <div>
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                      2-yo‘nalish · Sun’iy intellekt dasturi
                    </p>
                    <h3 className="font-display font-bold text-xl text-[#0F172A] dark:text-white mb-2">
                      Besh million AI yetakchilari
                    </h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed mb-6">
                      Sun’iy intellekt yo‘nalishi bo‘yicha tayyorlangan barcha sinf va guruh sertifikatlarini
                      olish bo‘limi.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => onEnterPortal('developer')}
                    className="w-full py-3 px-5 rounded-lg bg-[#0F172A] dark:bg-white hover:bg-slate-800 dark:hover:bg-slate-200 text-white dark:text-[#0F172A] text-sm font-semibold inline-flex items-center justify-center gap-2 transition-all hover:-translate-y-0.5 active:scale-[0.98] cursor-pointer"
                  >
                    <span>5M AI portaliga kirish</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </RevealBlock>
          </div>
        </section>
      </main>

      {/* Quiet Footer */}
      <footer className="relative z-10 bg-white/95 dark:bg-[#0B1120]/95 border-t border-slate-200 dark:border-slate-800 py-8 text-xs text-slate-600 dark:text-slate-400 transition-colors duration-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 text-center sm:text-left">
            <span className="font-display font-bold text-[#0F172A] dark:text-white">
              Bir Million O‘zbek Dasturchilari
            </span>
            <span className="hidden sm:inline text-slate-300 dark:text-slate-700">·</span>
            <span>Sertifikatlarni tartibli jamlash va ustozlarga yetkazish portali</span>
          </div>

          <div className="flex items-center gap-6">
            <button
              type="button"
              onClick={() => onEnterPortal()}
              className="text-slate-600 dark:text-slate-300 hover:text-[#0F172A] dark:hover:text-white font-medium cursor-pointer transition-colors"
            >
              O‘qituvchilar portali
            </button>
            <button
              type="button"
              onClick={onOpenAdminLogin}
              className="text-slate-700 dark:text-slate-200 hover:text-[#1D4ED8] dark:hover:text-sky-400 font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <Lock className="w-3.5 h-3.5 text-[#1D4ED8] dark:text-sky-400" />
              <span>Boshqaruv</span>
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};
