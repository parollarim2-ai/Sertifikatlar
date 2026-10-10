import React, { useEffect, useRef, useCallback } from 'react';
import { 
  Layers, 
  GraduationCap, 
  DollarSign, 
  Mail, 
  Smartphone, 
  Send 
} from 'lucide-react';

import { useUnifiedGlass } from '../context/UnifiedGlassContext';

export type AdminTabType = 'classes' | 'teachers' | 'finance' | 'emails' | 'sessions' | 'telegram';

interface NavigationLiquidGlassTabsProps {
  activeTab: AdminTabType;
  onSelectTab: (tab: AdminTabType) => void;
  teacherCertificatesCount: number;
  sessionsCount: number;
  hasBlockedSession: boolean;
  telegramUsersCount: number;
}

// Critical/smooth spring physics
class NavSpring {
  x: number;
  v: number;
  t: number;
  k: number;
  c: number;
  constructor(x: number, k = 230, c = 26) {
    this.x = x;
    this.v = 0;
    this.t = x;
    this.k = k;
    this.c = c;
  }
  step(dt: number) {
    this.v += (this.k * (this.t - this.x) - this.c * this.v) * dt;
    this.x += this.v * dt;
  }
}

export const NavigationLiquidGlassTabs: React.FC<NavigationLiquidGlassTabsProps> = ({
  activeTab,
  onSelectTab,
  teacherCertificatesCount,
  sessionsCount,
  hasBlockedSession,
  telegramUsersCount,
}) => {
  const { registerTargetElement, triggerJumpTo } = useUnifiedGlass();
  const containerRef = useRef<HTMLDivElement>(null);
  const lensRef = useRef<HTMLDivElement>(null);
  const spotRef = useRef<HTMLDivElement>(null);
  const svgDefsRef = useRef<SVGDefsElement>(null);
  const tabButtonRefs = useRef<{ [key in AdminTabType]?: HTMLButtonElement | null }>({});

  const sleepTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const springsRef = useRef({
    lx: new NavSpring(0, 240, 27),
    ly: new NavSpring(0, 240, 27),
    lw: new NavSpring(120, 260, 28),
    lh: new NavSpring(42, 260, 28),
    ls: new NavSpring(1, 220, 24), // scale & sleep opacity
    mouse: [window.innerWidth / 2, window.innerHeight / 2] as [number, number],
    ptr: null as [number, number] | null,
    isSleeping: false,
  });

  const wakeUpLens = useCallback(() => {
    springsRef.current.ls.t = 1;
    springsRef.current.isSleeping = false;
    if (sleepTimeoutRef.current) clearTimeout(sleepTimeoutRef.current);
    sleepTimeoutRef.current = setTimeout(() => {
      springsRef.current.ls.t = 0;
      springsRef.current.isSleeping = true;
    }, 5000);
  }, []);

  // True physical refraction filter generator for Nav Bar
  const applyRefractionFilter = useCallback(() => {
    const lens = lensRef.current;
    const defs = svgDefsRef.current;
    if (!lens || !defs) return;

    const w = Math.max(30, lens.offsetWidth);
    const h = Math.max(20, lens.offsetHeight);
    if (w <= 0 || h <= 0) return;

    const bz = 16, sc = 36, ab = 6, r = Math.min(w, h) / 2;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const im = ctx.createImageData(w, h);
    const d = im.data;

    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const px = i + 0.5 - w / 2;
        const py = j + 0.5 - h / 2;
        const qx = Math.abs(px) - (w / 2 - r);
        const qy = Math.abs(py) - (h / 2 - r);
        const mx = Math.max(qx, 0);
        const my = Math.max(qy, 0);
        const l = Math.hypot(mx, my);
        const dist = l + Math.min(Math.max(qx, qy), 0) - r;
        let nx = 0, ny = 0;
        if (l > 0) {
          nx = (mx / l) * Math.sign(px);
          ny = (my / l) * Math.sign(py);
        } else if (qx > qy) {
          nx = Math.sign(px);
        } else {
          ny = Math.sign(py);
        }
        const t = Math.max(0, 1 + dist / bz);
        const s = t * t;
        const k = (j * w + i) * 4;
        d[k] = 128 - nx * s * 127;
        d[k + 1] = 128 - ny * s * 127;
        d[k + 2] = 128;
        d[k + 3] = 255;
      }
    }
    ctx.putImageData(im, 0, 0);

    const filterId = 'lf-lens-nav-actual';
    const existing = document.getElementById(filterId);
    if (existing) existing.remove();

    const M = [
      '1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0',
      '0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 1 0',
      '0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 1 0',
    ];

    defs.insertAdjacentHTML(
      'beforeend',
      `<filter id="${filterId}" color-interpolation-filters="sRGB" filterUnits="userSpaceOnUse" x="0" y="0" width="${w}" height="${h}">
        <feImage href="${c.toDataURL()}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none" result="m"/>
        ${M.map(
          (m, k) => `
          <feDisplacementMap in="SourceGraphic" in2="m" scale="${sc + k * ab}" xChannelSelector="R" yChannelSelector="G"/>
          <feColorMatrix values="${m}" result="c${k}"/>`
        ).join('')}
        <feBlend in="c0" in2="c1" mode="screen" result="rg"/>
        <feBlend in="rg" in2="c2" mode="screen"/>
        <feGaussianBlur stdDeviation="1.0"/>
      </filter>`
    );

    lens.style.backdropFilter = `url(#${filterId}) saturate(1.5) brightness(1.05)`;
    (lens.style as any).webkitBackdropFilter = `url(#${filterId}) saturate(1.5) brightness(1.05)`;
  }, []);

  // Update lens target to active tab button position
  const syncLensToActiveTab = useCallback((tab: AdminTabType, immediate = false) => {
    const btn = tabButtonRefs.current[tab];
    const container = containerRef.current;
    if (!btn || !container) return;

    const cr = container.getBoundingClientRect();
    const br = btn.getBoundingClientRect();
    const cx = br.left - cr.left + br.width / 2;
    const cy = br.top - cr.top + br.height / 2;
    const bw = br.width;
    const bh = br.height;

    springsRef.current.lx.t = cx;
    springsRef.current.ly.t = cy;
    springsRef.current.lw.t = bw;
    springsRef.current.lh.t = bh;

    if (immediate) {
      springsRef.current.lx.x = cx;
      springsRef.current.ly.x = cy;
      springsRef.current.lw.x = bw;
      springsRef.current.lh.x = bh;
      springsRef.current.lx.v = 0;
      springsRef.current.ly.v = 0;
    }

    if (lensRef.current) {
      lensRef.current.style.width = `${bw}px`;
      lensRef.current.style.height = `${bh}px`;
    }

    applyRefractionFilter();
    wakeUpLens();
  }, [applyRefractionFilter, wakeUpLens]);

  // Sync on tab change and resize
  useEffect(() => {
    syncLensToActiveTab(activeTab);
    const timer = setTimeout(() => syncLensToActiveTab(activeTab), 80);
    const handleResize = () => syncLensToActiveTab(activeTab);
    window.addEventListener('resize', handleResize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', handleResize);
    };
  }, [activeTab, syncLensToActiveTab]);

  // Track global pointer for conic rim light & spotlight
  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      springsRef.current.mouse = [e.clientX, e.clientY];
    };
    window.addEventListener('pointermove', handlePointerMove);
    return () => window.removeEventListener('pointermove', handlePointerMove);
  }, []);

  // Physics animation loop with playful jelly deformation & 5s idle sleep
  useEffect(() => {
    let animId: number;
    let lastTime = performance.now();

    const loop = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.033);
      lastTime = now;

      const { lx, ly, lw, lh, ls, mouse, ptr } = springsRef.current;
      lx.step(dt);
      ly.step(dt);
      lw.step(dt);
      lh.step(dt);
      ls.step(dt);

      if (lensRef.current) {
        // Playful jelly squash & stretch based on velocity without 180-degree flipping!
        const stretchX = 1 + Math.min(Math.abs(lx.v) / 1400, 0.35);
        const stretchY = 1 / Math.sqrt(stretchX);

        const currentW = Math.max(30, lw.x);
        const currentH = Math.max(20, lh.x);
        const currentScale = Math.max(0, ls.x);

        lensRef.current.style.width = `${currentW}px`;
        lensRef.current.style.height = `${currentH}px`;
        lensRef.current.style.transform = `translate(${lx.x - currentW / 2}px, ${ly.x - currentH / 2}px) scale(${stretchX * currentScale}, ${stretchY * currentScale})`;
        lensRef.current.style.opacity = currentScale > 0.01 ? `${Math.min(1, currentScale)}` : '0';

        // Conic rim angle turning toward cursor
        const lr = lensRef.current.getBoundingClientRect();
        const rimAngle = Math.atan2(mouse[1] - (lr.top + lr.height / 2), mouse[0] - (lr.left + lr.width / 2)) * (180 / Math.PI) + 90;
        lensRef.current.style.setProperty('--nav-a', `${rimAngle}deg`);
      }

      // Spotlight under glass
      if (spotRef.current && containerRef.current) {
        if (ptr && ls.x > 0.05) {
          const cr = containerRef.current.getBoundingClientRect();
          const sx = ptr[0] - cr.left;
          const sy = ptr[1] - cr.top;
          spotRef.current.style.opacity = '1';
          spotRef.current.style.transform = `translate(${sx}px, ${sy}px)`;
        } else {
          spotRef.current.style.opacity = '0';
        }
      }

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, []);

  const tabs: {
    id: AdminTabType;
    icon: React.ReactNode;
    labelShort: string;
    labelFull: string;
    badge?: React.ReactNode;
  }[] = [
    {
      id: 'classes',
      icon: <Layers className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-700 flex-shrink-0" />,
      labelShort: 'Sinflar',
      labelFull: "Sinflar & O'quvchilar",
    },
    {
      id: 'teachers',
      icon: <GraduationCap className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-purple-700 flex-shrink-0" />,
      labelShort: 'Ustozlar',
      labelFull: 'Ustozlar Sertifikatlari',
      badge: teacherCertificatesCount > 0 ? (
        <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-purple-100 text-purple-800 font-mono font-bold">
          {teacherCertificatesCount}
        </span>
      ) : null,
    },
    {
      id: 'finance',
      icon: <DollarSign className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-700 flex-shrink-0" />,
      labelShort: 'Moliya',
      labelFull: "Moliya & To'lovlar",
    },
    {
      id: 'emails',
      icon: <Mail className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-700 flex-shrink-0" />,
      labelShort: 'Emaillar',
      labelFull: 'Email Zaxirasi',
    },
    {
      id: 'sessions',
      icon: <Smartphone className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-purple-600 flex-shrink-0" />,
      labelShort: 'Seanslar',
      labelFull: 'Faol Seanslar',
      badge: (
        <>
          {sessionsCount > 0 && (
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-200 text-slate-700 font-mono">
              {sessionsCount}
            </span>
          )}
          {hasBlockedSession && (
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" title="Bloklangan qurilma mavjud"></span>
          )}
        </>
      ),
    },
    {
      id: 'telegram',
      icon: <Send className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#24A1DE] flex-shrink-0" />,
      labelShort: 'Telegram',
      labelFull: 'Telegram Bot',
      badge: telegramUsersCount > 0 ? (
        <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-500 text-white font-mono font-bold">
          {telegramUsersCount} ustoz
        </span>
      ) : null,
    },
  ];

  return (
    <>
      {/* SVG Defs for physical refraction filter */}
      <svg width="0" height="0" style={{ position: 'absolute' }}>
        <defs ref={svgDefsRef}></defs>
      </svg>

      <style>{`
        .liquid-nav-container {
          position: relative;
          background: rgba(226, 232, 240, 0.7);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          padding: 4px;
          border-radius: 18px;
          border: 1px solid rgba(203, 213, 225, 0.9);
          box-shadow: inset 0 2px 4px rgba(15, 23, 42, 0.05);
          user-select: none;
        }

        .liquid-nav-lens {
          display: none !important;
        }
        .liquid-nav-lens::after {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: inherit;
          padding: 1px;
          pointer-events: none;
          background: conic-gradient(from var(--nav-a, 0deg), rgba(37, 99, 235, 0.65), rgba(255, 255, 255, 0) 24%, rgba(255, 255, 255, 0) 50%, rgba(37, 99, 235, 0.65) 74%, rgba(255, 255, 255, 0) 90%, rgba(37, 99, 235, 0.65));
          -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
        }

        .liquid-nav-spot {
          position: absolute;
          left: 0;
          top: 0;
          width: 180px;
          height: 180px;
          margin: -90px 0 0 -90px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(37, 99, 235, 0.18), transparent 65%);
          pointer-events: none;
          opacity: 0;
          transition: opacity 0.3s;
          z-index: 1;
        }

        .liquid-nav-btn {
          position: relative;
          z-index: 3;
          transition: color 0.2s, transform 0.15s;
        }
        .liquid-nav-btn:hover {
          color: #0f172a;
        }
        .liquid-nav-btn:active {
          transform: scale(0.96);
        }
      `}</style>

      <div
        ref={containerRef}
        onPointerMove={e => {
          springsRef.current.ptr = [e.clientX, e.clientY];
          wakeUpLens();
        }}
        onPointerLeave={() => {
          springsRef.current.ptr = null;
        }}
        className="liquid-nav-container flex items-center gap-1 overflow-x-auto no-scrollbar"
      >
        {/* Spotlight under glass */}
        <i ref={spotRef} className="liquid-nav-spot"></i>

        {/* Liquid Glass Jumping Refraction Lens */}
        <div ref={lensRef} className="liquid-nav-lens"></div>

        {/* Tab Buttons */}
        {tabs.map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              ref={el => {
                tabButtonRefs.current[tab.id] = el;
                registerTargetElement(`nav-${tab.id}`, el, 14);
              }}
              type="button"
              onClick={() => {
                wakeUpLens();
                triggerJumpTo(`nav-${tab.id}`);
                onSelectTab(tab.id);
              }}
              className={`liquid-nav-btn flex-shrink-0 sm:flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 sm:gap-2 cursor-pointer whitespace-nowrap ${
                isActive
                  ? 'text-slate-950 font-black'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/40'
              }`}
            >
              {tab.icon}
              <span className="sm:hidden">{tab.labelShort}</span>
              <span className="hidden sm:inline">{tab.labelFull}</span>
              {tab.badge}
            </button>
          );
        })}
      </div>
    </>
  );
};
