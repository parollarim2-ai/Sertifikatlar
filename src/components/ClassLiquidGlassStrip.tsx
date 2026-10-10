import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { ClassGroup, Student } from '../types';
import { 
  Zap, 
  Bell, 
  UserPlus, 
  Edit2, 
  Trash2, 
  X, 
  ChevronDown, 
  ChevronUp, 
  CheckCircle2, 
  CreditCard,
  Layers
} from 'lucide-react';
import { useUnifiedGlass } from '../context/UnifiedGlassContext';

interface ClassLiquidGlassStripProps {
  classes: ClassGroup[];
  students: Student[];
  selectedClassId: string;
  onSelectClass: (classId: string) => void;
  onOpenBulkUploadModal: (classId?: string) => void;
  onOpenPaymentModal: (classGroup: ClassGroup) => void;
  onOpenTeacherMessageModal: (classGroup: ClassGroup) => void;
  onOpenClassBatch: (classGroup: ClassGroup) => void;
  onEditClass: (classGroup: ClassGroup) => void;
  onDeleteClass: (classGroup: ClassGroup) => void;
}

// Spring physics simulation
class Spring {
  x: number;
  v: number;
  t: number;
  k: number;
  c: number;
  constructor(x: number, k = 220, c = 18) {
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

export const ClassLiquidGlassStrip: React.FC<ClassLiquidGlassStripProps> = ({
  classes,
  students,
  selectedClassId,
  onSelectClass,
  onOpenBulkUploadModal,
  onOpenPaymentModal,
  onOpenTeacherMessageModal,
  onOpenClassBatch,
  onEditClass,
  onDeleteClass,
}) => {
  const { registerTargetElement, triggerJumpTo } = useUnifiedGlass();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'debt' | 'low'>('all');
  const [activeTileIndex, setActiveTileIndex] = useState<number>(-1);
  const [showClassDetails, setShowClassDetails] = useState<boolean>(true);

  const stripRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const lensRef = useRef<HTMLDivElement>(null);
  const spotRef = useRef<HTMLDivElement>(null);
  const segRef = useRef<HTMLDivElement>(null);
  const segPillRef = useRef<HTMLElement>(null);
  const svgDefsRef = useRef<SVGDefsElement>(null);
  const tileRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const sleepTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Springs & interactive state with smooth critical damping (no backward jitter)
  const springsRef = useRef({
    lx: new Spring(0, 240, 28),
    ly: new Spring(0, 240, 28),
    ls: new Spring(1, 230, 24),
    pl: new Spring(0, 300, 22),
    pr: new Spring(0, 300, 22),
    tilePhysics: [] as { tx: number; ty: number; rx: number; ry: number; sc: Spring }[],
    spotX: 0,
    spotY: 0,
    ptr: null as [number, number] | null,
    mouse: [window.innerWidth / 2, window.innerHeight / 2] as [number, number],
    pressed: -1,
    drag: 0,
    moved: 0,
    downSel: -1,
    lw: 100,
    lh: 86,
  });

  // 5-second idle auto-sleep mode for lens
  const wakeUpLens = useCallback(() => {
    springsRef.current.ls.t = 1;
    if (sleepTimerRef.current) clearTimeout(sleepTimerRef.current);
    sleepTimerRef.current = setTimeout(() => {
      // 5 seconds without interaction -> smooth sleep mode
      springsRef.current.ls.t = 0;
    }, 5000);
  }, []);

  useEffect(() => {
    wakeUpLens();
    return () => {
      if (sleepTimerRef.current) clearTimeout(sleepTimerRef.current);
    };
  }, [wakeUpLens]);

  // Numbers and data calculation
  const classData = useMemo(() => {
    return classes.map((c, i) => {
      const cStudents = students.filter(s => s.classId === c.id);
      const total = cStudents.length;
      const certified = cStudents.filter(s => s.status === 'certified').length;
      const percent = total > 0 ? Math.round((certified / total) * 100) : 0;
      const totalCost = certified * (c.pricePerStudent || 5000);
      const debt = Math.max(0, totalCost - (c.paidAmount || 0));
      return {
        raw: c,
        index: i,
        id: c.id,
        name: c.name,
        teacher: c.teacherName,
        total,
        certified,
        percent,
        debt,
      };
    });
  }, [classes, students]);

  // Overall statistics
  const totalStudentsCount = useMemo(() => students.length, [students]);
  const totalCertifiedCount = useMemo(() => students.filter(s => s.status === 'certified').length, [students]);
  const debtClassesCount = useMemo(() => classData.filter(c => c.debt > 0).length, [classData]);
  const lowCompletionCount = useMemo(() => classData.filter(c => c.total > 0 && c.percent < 50).length, [classData]);

  // Initialize tile physics when class count changes
  useEffect(() => {
    springsRef.current.tilePhysics = classData.map(() => ({
      tx: 0,
      ty: 0,
      rx: 0,
      ry: 0,
      sc: new Spring(1, 320, 15),
    }));
  }, [classData.length]);

  // Number counting effect for live summary
  const [s1Count, setS1Count] = useState(0);
  const [s2Count, setS2Count] = useState(0);
  const [s3Count, setS3Count] = useState(0);

  useEffect(() => {
    const t0 = performance.now();
    const duration = 900;
    let animId: number;
    const animate = (t: number) => {
      const k = Math.min(1, (t - t0) / duration);
      const ease = 1 - Math.pow(1 - k, 3);
      setS1Count(Math.round(totalStudentsCount * ease));
      setS2Count(Math.round(totalCertifiedCount * ease));
      setS3Count(Math.round(debtClassesCount * ease));
      if (k < 1) animId = requestAnimationFrame(animate);
    };
    animId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animId);
  }, [totalStudentsCount, totalCertifiedCount, debtClassesCount]);

  // Filtered class tiles
  const filteredClassIds = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const ids = new Set<string>();
    classData.forEach(c => {
      const matchesSearch = !q || c.name.toLowerCase().includes(q) || c.teacher.toLowerCase().includes(q);
      const matchesFilter =
        filterMode === 'all'
          ? true
          : filterMode === 'debt'
          ? c.debt > 0
          : c.total > 0 && c.percent < 50;
      if (matchesSearch && matchesFilter) {
        ids.add(c.id);
      }
    });
    return ids;
  }, [classData, searchQuery, filterMode]);

  const fmt = (n: number) => n.toLocaleString('ru-RU');
  const nb = (s: string) => s.replace('-', '\u2011');

  // Sonar ping ripple effect
  const triggerSonarPing = (x: number, y: number) => {
    if (!gridRef.current) return;
    const ping = document.createElement('i');
    ping.className = 'liquid-ping';
    ping.style.left = `${x}px`;
    ping.style.top = `${y}px`;
    gridRef.current.appendChild(ping);
    setTimeout(() => ping.remove(), 900);
  };

  // Button ripple
  const handleButtonRipple = (e: React.MouseEvent<any>) => {
    const target = e.currentTarget as HTMLElement;
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 2.2;
    const ripple = document.createElement('i');
    ripple.className = `liquid-rpl ${target.classList.contains('pr') ? 'w' : ''}`;
    ripple.style.width = `${size}px`;
    ripple.style.height = `${size}px`;
    ripple.style.left = `${e.clientX - rect.left - size / 2}px`;
    ripple.style.top = `${e.clientY - rect.top - size / 2}px`;
    target.appendChild(ripple);
    setTimeout(() => ripple.remove(), 700);
  };

  // True physical refraction filter generator (SVG Displacement + RGB Chromatic Aberration)
  const applyRefractionFilter = useCallback(() => {
    const lens = lensRef.current;
    const defs = svgDefsRef.current;
    if (!lens || !defs) return;

    const w = lens.offsetWidth;
    const h = lens.offsetHeight;
    if (w <= 0 || h <= 0) return;

    const bz = 24, sc = 44, ab = 7, r = Math.min(w, h) / 2;
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

    const filterId = 'lf-lens-actual';
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
        <feGaussianBlur stdDeviation="1.1"/>
      </filter>`
    );

    lens.style.backdropFilter = `url(#${filterId}) saturate(1.6) brightness(1.06)`;
    (lens.style as any).webkitBackdropFilter = `url(#${filterId}) saturate(1.6) brightness(1.06)`;
  }, []);

  // Tile Selection logic: clicking selects class, sets persistent selection, opens compact details
  const handleSelectTile = useCallback((index: number, e?: React.MouseEvent) => {
    wakeUpLens();
    if (e) handleButtonRipple(e);
    const target = classData[index];
    if (!target) return;

    if (activeTileIndex === index && selectedClassId === target.id) {
      // Toggle details visibility, but DO NOT unselect class!
      setShowClassDetails(prev => !prev);
    } else {
      // Select new class and show details
      setActiveTileIndex(index);
      setShowClassDetails(true);
      springsRef.current.ls.t = 1;

      const tileEl = tileRefs.current[index];
      if (tileEl) {
        const cx = tileEl.offsetLeft + tileEl.offsetWidth / 2;
        const cy = tileEl.offsetTop + tileEl.offsetHeight / 2;
        springsRef.current.lx.t = cx;
        springsRef.current.ly.t = cy;
        triggerSonarPing(cx, cy);
      }

      triggerJumpTo(`class-${target.id}`);
      onSelectClass(target.id);
    }
  }, [classData, activeTileIndex, selectedClassId, onSelectClass, triggerJumpTo, wakeUpLens]);

  // Sync with outer selectedClassId (prevents rubber-banding and oscillation during drag)
  useEffect(() => {
    if (springsRef.current.drag) return;

    if (selectedClassId === 'all' || selectedClassId === 'all_with_teachers' || selectedClassId === 'only_teachers') {
      setActiveTileIndex(-1);
      springsRef.current.ls.t = 0;
    } else {
      const idx = classData.findIndex(c => c.id === selectedClassId);
      if (idx >= 0) {
        setActiveTileIndex(idx);
        springsRef.current.ls.t = 1;
        const tileEl = tileRefs.current[idx];
        if (tileEl) {
          const cx = tileEl.offsetLeft + tileEl.offsetWidth / 2;
          const cy = tileEl.offsetTop + tileEl.offsetHeight / 2;
          springsRef.current.lx.t = cx;
          springsRef.current.ly.t = cy;
        }
      }
    }
  }, [selectedClassId, classData]);

  // Reset to all classes explicitly
  const handleResetToAll = () => {
    setActiveTileIndex(-1);
    setShowClassDetails(false);
    springsRef.current.ls.t = 0;
    onSelectClass('all');
  };

  // Update lens size and generate SVG refraction filter
  useEffect(() => {
    const handleLayout = () => {
      const firstTile = tileRefs.current[0];
      if (firstTile && lensRef.current) {
        const lw = firstTile.offsetWidth + 14;
        const lh = firstTile.offsetHeight + 14;
        springsRef.current.lw = lw;
        springsRef.current.lh = lh;
        lensRef.current.style.width = `${lw}px`;
        lensRef.current.style.height = `${lh}px`;
        applyRefractionFilter();
      }
    };

    handleLayout();
    const timer = setTimeout(handleLayout, 150);
    window.addEventListener('resize', handleLayout);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', handleLayout);
    };
  }, [applyRefractionFilter, classData.length]);

  // Fluid Segment Pill update
  const updateSegmentPill = useCallback((btnEl: HTMLButtonElement | null, immediate = false) => {
    if (!btnEl || !segPillRef.current) return;
    const l = btnEl.offsetLeft;
    const r = l + btnEl.offsetWidth;
    const isMovingRight = l > springsRef.current.pl.t;
    springsRef.current.pl.k = isMovingRight ? 150 : 340;
    springsRef.current.pr.k = isMovingRight ? 340 : 150;
    springsRef.current.pl.c = isMovingRight ? 15 : 24;
    springsRef.current.pr.c = isMovingRight ? 24 : 15;
    springsRef.current.pl.t = l;
    springsRef.current.pr.t = r;
    if (immediate) {
      springsRef.current.pl.x = l;
      springsRef.current.pr.x = r;
      springsRef.current.pl.v = 0;
      springsRef.current.pr.v = 0;
    }
  }, []);

  // Track global pointer for conic rim light & spotlight
  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      springsRef.current.mouse = [e.clientX, e.clientY];
    };
    window.addEventListener('pointermove', handlePointerMove);
    return () => window.removeEventListener('pointermove', handlePointerMove);
  }, []);

  // Main animation physics loop
  useEffect(() => {
    let animId: number;
    let lastTime = performance.now();

    const loop = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.033);
      lastTime = now;

      const { lx, ly, ls, pl, pr, lw, lh, mouse, ptr, tilePhysics, pressed } = springsRef.current;
      lx.step(dt);
      ly.step(dt);
      ls.step(dt);
      pl.step(dt);
      pr.step(dt);

      // 1. Refractive Lens playful jelly squash & stretch (no velocity angle rotation flip!)
      if (lensRef.current) {
        const stretchX = 1 + Math.min(Math.abs(lx.v) / 1400, 0.38);
        const stretchY = 1 / Math.sqrt(stretchX);
        const scaleVal = Math.max(ls.x, 0);

        lensRef.current.style.transform = `translate(${lx.x - lw / 2}px, ${ly.x - lh / 2}px) scale(${stretchX * scaleVal}, ${stretchY * scaleVal})`;
        lensRef.current.style.opacity = scaleVal > 0.01 ? `${Math.min(1, scaleVal)}` : '0';

        // Conic rim angle turning toward cursor
        const lr = lensRef.current.getBoundingClientRect();
        const rimAngle = Math.atan2(mouse[1] - (lr.top + lr.height / 2), mouse[0] - (lr.left + lr.width / 2)) * (180 / Math.PI) + 90;
        lensRef.current.style.setProperty('--a', `${rimAngle}deg`);
      }

      // 2. Segmented Pill position
      if (segPillRef.current) {
        segPillRef.current.style.left = `${pl.x}px`;
        segPillRef.current.style.width = `${Math.max(20, pr.x - pl.x)}px`;
      }

      // 3. Spotlight under glass
      if (spotRef.current && gridRef.current) {
        if (ptr) {
          const gr = gridRef.current.getBoundingClientRect();
          springsRef.current.spotX += (ptr[0] - gr.left - springsRef.current.spotX) * 0.15;
          springsRef.current.spotY += (ptr[1] - gr.top - springsRef.current.spotY) * 0.15;
          spotRef.current.style.opacity = '1';
          spotRef.current.style.transform = `translate(${springsRef.current.spotX}px, ${springsRef.current.spotY}px)`;
        } else {
          spotRef.current.style.opacity = '0';
        }
      }

      // 4. Magnetic 3D tilt & press squish on tiles
      if (gridRef.current) {
        const gr = gridRef.current.getBoundingClientRect();
        tileRefs.current.forEach((t, i) => {
          if (!t) return;
          const s = tilePhysics[i];
          if (!s) return;

          let a = 0, b = 0, rx = 0, ry = 0, sc = 1;
          if (ptr) {
            const cx = gr.left + t.offsetLeft + t.offsetWidth / 2;
            const cy = gr.top + t.offsetTop + t.offsetHeight / 2;
            const dx = ptr[0] - cx;
            const dy = ptr[1] - cy;
            const dist = Math.hypot(dx, dy);

            if (dist < 180 && i !== activeTileIndex) {
              const k = (1 - dist / 180) * 0.14;
              a = dx * k;
              b = dy * k;
            }
            if (Math.abs(dx) < t.offsetWidth / 2 && Math.abs(dy) < t.offsetHeight / 2) {
              rx = (-dy / t.offsetHeight) * 18;
              ry = (dx / t.offsetWidth) * 20;
              sc = 1.06;
            }
          }

          if (pressed === i) sc = 0.92;
          s.tx += (a - s.tx) * 0.16;
          s.ty += (b - s.ty) * 0.16;
          s.rx += (rx - s.rx) * 0.2;
          s.ry += (ry - s.ry) * 0.2;
          s.sc.t = sc;
          s.sc.step(dt);

          t.style.transform = `translate(${s.tx.toFixed(2)}px, ${s.ty.toFixed(2)}px) perspective(520px) rotateX(${s.rx.toFixed(2)}deg) rotateY(${s.ry.toFixed(2)}deg) scale(${s.sc.x.toFixed(3)})`;
        });
      }

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [activeTileIndex]);

  const selectedClass = activeTileIndex >= 0 ? classData[activeTileIndex] : null;

  return (
    <>
      {/* SVG Defs for physical refraction filter */}
      <svg width="0" height="0" style={{ position: 'absolute' }}>
        <defs ref={svgDefsRef}></defs>
      </svg>

      {/* Scoped CSS replicating user's exact specification */}
      <style>{`
        :root {
          --liquid-ink: #0f172a;
          --liquid-mut: #64748b;
          --liquid-ac: #2563eb;
          --liquid-ac2: #60a5fa;
          --liquid-ln: rgba(15, 23, 42, 0.09);
          --liquid-sh: rgba(37, 99, 235, 0.22);
          --liquid-trk: rgba(15, 23, 42, 0.08);
          --liquid-wn: #d97706;
          --liquid-rimc: rgba(37, 99, 235, 0.6);
          --liquid-glass: linear-gradient(180deg, rgba(255, 255, 255, 0.95), rgba(236, 243, 255, 0.6));
          --liquid-sp: cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        .liquid-g {
          position: relative;
          background: var(--liquid-glass);
          backdrop-filter: blur(12px) saturate(1.5);
          -webkit-backdrop-filter: blur(12px) saturate(1.5);
          box-shadow: inset 0 1px 0 #fff, inset 0 -10px 16px -12px rgba(37, 99, 235, 0.28), 0 0 0 1px var(--liquid-ln), 0 12px 28px -12px var(--liquid-sh);
        }
        .liquid-g::after {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: inherit;
          padding: 1px;
          pointer-events: none;
          background: conic-gradient(from var(--a, 0deg), var(--liquid-rimc), rgba(255, 255, 255, 0) 24%, rgba(255, 255, 255, 0) 50%, var(--liquid-rimc) 74%, rgba(255, 255, 255, 0) 90%, var(--liquid-rimc));
          -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
        }

        .liquid-strip {
          position: relative;
        }
        .liquid-bar {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 12px;
        }
        .liquid-l {
          display: flex;
          align-items: baseline;
          gap: 12px;
          flex-wrap: wrap;
        }
        .liquid-l h2 {
          margin: 0;
          font-size: 20px;
          font-weight: 800;
          letter-spacing: -0.02em;
          color: var(--liquid-ink);
        }
        .liquid-sm {
          font-size: 13px;
          color: var(--liquid-mut);
          display: flex;
          gap: 6px;
          align-items: center;
        }
        .liquid-sm b {
          color: var(--liquid-ink);
          font-family: ui-monospace, "JetBrains Mono", Menlo, monospace;
          font-weight: 600;
        }
        .liquid-sm .w { color: var(--liquid-wn); }
        .liquid-lv {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: var(--liquid-ac);
          box-shadow: 0 0 0 0 var(--liquid-ac);
          animation: liquid-lv 2s infinite;
        }
        @keyframes liquid-lv {
          70% { box-shadow: 0 0 0 7px rgba(37, 99, 235, 0); }
          100% { box-shadow: 0 0 0 0 rgba(37, 99, 235, 0); }
        }

        .liquid-r {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          align-items: center;
        }
        .liquid-sr {
          display: flex;
          align-items: center;
          gap: 7px;
          padding: 0 13px;
          border-radius: 12px;
          color: var(--liquid-mut);
          transition: box-shadow 0.3s;
        }
        .liquid-sr:focus-within {
          box-shadow: inset 0 1px 0 #fff, 0 0 0 2px var(--liquid-ac2), 0 12px 28px -12px var(--liquid-sh);
        }
        .liquid-sr svg {
          width: 15px;
          height: 15px;
          stroke: currentColor;
          fill: none;
          stroke-width: 2;
          transition: transform 0.5s var(--liquid-sp);
        }
        .liquid-sr:focus-within svg {
          transform: rotate(-12deg) scale(1.2);
          color: var(--liquid-ac);
        }
        .liquid-q {
          border: 0;
          background: none;
          color: var(--liquid-ink);
          padding: 9px 0;
          width: 96px;
          font: inherit;
          font-size: 13.5px;
          outline: none;
          transition: width 0.55s var(--liquid-sp);
        }
        .liquid-q:focus { width: 190px; }
        .liquid-q::placeholder { color: var(--liquid-mut); }

        .liquid-seg {
          display: flex;
          padding: 3px;
          border-radius: 12px;
          position: relative;
        }
        .liquid-sp {
          position: absolute;
          top: 3px;
          bottom: 3px;
          border-radius: 9px;
          background: #fff;
          box-shadow: 0 2px 8px rgba(37, 99, 235, 0.25), inset 0 1px 0 #fff;
          pointer-events: none;
        }
        .liquid-seg button {
          position: relative;
          z-index: 1;
          border: 0;
          background: none;
          color: var(--liquid-ink);
          font-weight: 600;
          font-size: 13px;
          font-family: inherit;
          padding: 8px 12px;
          border-radius: 9px;
          cursor: pointer;
          opacity: 0.55;
          transition: opacity 0.3s, color 0.3s;
        }
        .liquid-seg button.on {
          opacity: 1;
          color: var(--liquid-ac);
          font-weight: 700;
        }

        .liquid-bt {
          position: relative;
          overflow: hidden;
          border: 0;
          border-radius: 12px;
          padding: 9px 15px;
          font-weight: 600;
          font-size: 13px;
          font-family: inherit;
          cursor: pointer;
          color: var(--liquid-ink);
          transition: transform 0.4s var(--liquid-sp);
        }
        .liquid-bt:hover { transform: translateY(-2px); }
        .liquid-bt:active { transform: scale(0.93); }
        .liquid-bt.pr {
          color: #fff;
          background: linear-gradient(180deg, #3b82f6, #2563eb);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.45), 0 8px 18px -6px rgba(37, 99, 235, 0.65);
        }
        .liquid-bt.pr::before {
          content: "";
          position: absolute;
          top: 0;
          bottom: 0;
          width: 40%;
          left: -60%;
          background: linear-gradient(100deg, transparent, rgba(255, 255, 255, 0.5), transparent);
          animation: liquid-sw 3.4s ease-in-out infinite 1.5s;
        }
        @keyframes liquid-sw { to { left: 140%; } }
        .liquid-bt i.pl {
          display: inline-block;
          font-style: normal;
          margin-right: 5px;
          transition: transform 0.5s var(--liquid-sp);
        }
        .liquid-bt:hover i.pl { transform: rotate(90deg) scale(1.2); }
        .liquid-bt.gh {
          background: none;
          box-shadow: none;
          color: var(--liquid-mut);
          padding: 8px 9px;
        }
        .liquid-bt.gh::after { display: none; }
        .liquid-bt.gh:hover { color: var(--liquid-ink); background: rgba(15, 23, 42, 0.05); }

        .liquid-rpl {
          position: absolute;
          border-radius: 50%;
          background: rgba(37, 99, 235, 0.22);
          transform: scale(0);
          animation: liquid-rp 0.7s ease-out forwards;
          pointer-events: none;
        }
        .liquid-rpl.w { background: rgba(255, 255, 255, 0.5); }
        @keyframes liquid-rp { to { transform: scale(1); opacity: 0; } }

        .liquid-grid {
          position: relative;
          display: grid;
          gap: 10px;
          touch-action: pan-y;
          user-select: none;
          -webkit-user-select: none;
        }
        .liquid-spot {
          position: absolute;
          left: 0;
          top: 0;
          width: 280px;
          height: 280px;
          margin: -140px 0 0 -140px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(37, 99, 235, 0.2), transparent 65%);
          pointer-events: none;
          opacity: 0;
          transition: opacity 0.4s;
        }

        .liquid-tile {
          border: 0;
          border-radius: 16px;
          height: 86px;
          padding: 11px 12px 10px;
          color: var(--liquid-ink);
          font-family: inherit;
          text-align: left;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          overflow: hidden;
          transition: opacity 0.3s, filter 0.3s;
          z-index: 1;
          position: relative;
        }
        .liquid-tile.dim { opacity: 0.3; filter: saturate(0.3); }
        .liquid-tile::before {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: inherit;
          background: radial-gradient(120px circle at var(--mx, 50%) var(--my, 0%), rgba(255, 255, 255, 0.95), transparent 65%);
          opacity: 0;
          transition: opacity 0.3s;
          pointer-events: none;
        }
        .liquid-tile:hover::before { opacity: 1; }
        .liquid-tile.on .liquid-n { color: var(--liquid-ac); font-weight: 900; }

        .liquid-gl {
          position: absolute;
          inset: 0;
          background: linear-gradient(110deg, transparent 40%, rgba(255, 255, 255, 0.95) 50%, transparent 60%);
          transform: translateX(-130%);
          animation: liquid-gl-anim 7s ease-in-out infinite;
          pointer-events: none;
        }
        @keyframes liquid-gl-anim {
          0%, 72% { transform: translateX(-130%); }
          100% { transform: translateX(130%); }
        }

        .liquid-r1 {
          display: flex;
          justify-content: space-between;
          align-items: center;
          position: relative;
        }
        .liquid-n {
          font-weight: 800;
          font-size: 18px;
          letter-spacing: -0.02em;
          transition: color 0.3s;
        }
        .liquid-t {
          font-size: 11.5px;
          color: var(--liquid-mut);
          position: relative;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          margin-top: -5px;
        }
        .liquid-nm {
          display: flex;
          justify-content: space-between;
          font-family: ui-monospace, "JetBrains Mono", Menlo, monospace;
          font-size: 11px;
          position: relative;
        }
        .liquid-nm em { font-style: normal; color: var(--liquid-mut); }
        .liquid-tb {
          display: block;
          height: 4px;
          border-radius: 9px;
          background: var(--liquid-trk);
          overflow: hidden;
          position: relative;
          margin-top: -2px;
        }
        .liquid-tb i {
          display: block;
          position: relative;
          height: 100%;
          border-radius: 9px;
          background: linear-gradient(90deg, var(--liquid-ac2), var(--liquid-ac));
          transform-origin: left;
        }
        .liquid-tb i::after {
          content: "";
          position: absolute;
          top: 0;
          bottom: 0;
          width: 45%;
          left: -50%;
          background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.85), transparent);
          animation: liquid-sw 2.6s ease-in-out infinite;
        }

        .liquid-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          display: block;
          background: var(--liquid-ac);
        }
        .liquid-dot.db {
          background: var(--liquid-wn);
          animation: liquid-dp 2s ease-in-out infinite;
        }
        @keyframes liquid-dp {
          50% { box-shadow: 0 0 0 5px rgba(217, 119, 6, 0.18); }
        }

        .liquid-lens {
          display: none !important;
        }

        .liquid-ping {
          position: absolute;
          width: 20px;
          height: 20px;
          margin: -10px;
          border-radius: 50%;
          border: 2px solid var(--liquid-ac);
          pointer-events: none;
          z-index: 4;
          animation: liquid-pg 0.85s ease-out forwards;
        }
        @keyframes liquid-pg {
          from { transform: scale(0.4); opacity: 0.7; }
          to { transform: scale(7); opacity: 0; }
        }

        /* INLINE COMPACT DETAILS RIBBON - SLEEK, NON-OVERLAPPING, ZERO COLLISION */
        .liquid-details-ribbon {
          position: relative;
          margin-top: 10px;
          margin-bottom: 6px;
          border-radius: 14px;
          padding: 8px 14px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          flex-wrap: wrap;
          z-index: 2;
          width: 100%;
          box-sizing: border-box;
          animation: liquid-in 0.28s var(--liquid-sp) both;
          box-shadow: inset 0 1px 0 #fff, 0 0 0 1px var(--liquid-ln), 0 4px 16px -6px rgba(37, 99, 235, 0.18);
        }
        @keyframes liquid-in {
          from { opacity: 0; transform: translateY(-4px) scale(0.99); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        @media (max-width: 859px) {
          .liquid-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
          }
          .liquid-details-ribbon {
            flex-direction: column;
            align-items: stretch;
            gap: 10px;
            padding: 10px 12px;
          }
          .liquid-bar { align-items: flex-start; }
        }
      `}</style>

      <section ref={stripRef} className="liquid-strip">
        {/* Top Slim Control Bar */}
        <div className="liquid-bar">
          <div className="liquid-l">
            <h2>Sinflar</h2>
            <span className="liquid-sm">
              <i className="liquid-lv"></i>
              <b>{s1Count}</b> o'quvchi · <b>{s2Count}</b> tayyor · <b className="w">{s3Count}</b> sinfda qarz
            </span>
          </div>

          <div className="liquid-r">
            {/* Search Input */}
            <label className="liquid-g liquid-sr">
              <svg viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input
                type="text"
                className="liquid-q"
                placeholder="Qidirish"
                autoComplete="off"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </label>

            {/* 3-Way Springy Segmented Pill */}
            <div ref={segRef} className="liquid-g liquid-seg">
              <i
                ref={segPillRef as unknown as React.RefObject<HTMLElement>}
                className="liquid-sp"
              ></i>
              <button
                type="button"
                onClick={e => {
                  setFilterMode('all');
                  updateSegmentPill(e.currentTarget);
                  handleButtonRipple(e);
                  handleResetToAll();
                }}
                className={filterMode === 'all' && selectedClassId === 'all' ? 'on' : ''}
              >
                Barchasi
              </button>
              <button
                type="button"
                onClick={e => {
                  setFilterMode('debt');
                  updateSegmentPill(e.currentTarget);
                  handleButtonRipple(e);
                }}
                className={filterMode === 'debt' ? 'on' : ''}
              >
                Qarzdorlar {debtClassesCount}
              </button>
              <button
                type="button"
                onClick={e => {
                  setFilterMode('low');
                  updateSegmentPill(e.currentTarget);
                  handleButtonRipple(e);
                }}
                className={filterMode === 'low' ? 'on' : ''}
              >
                Tayyori kam {lowCompletionCount}
              </button>
            </div>

            {/* + Sinf Primary Button */}
            <button
              type="button"
              onClick={e => {
                handleButtonRipple(e);
                onOpenBulkUploadModal();
              }}
              className="liquid-g liquid-bt pr"
              title="Fayldan yangi sinf yuklash"
            >
              <i className="pl">+</i>Sinf
            </button>
          </div>
        </div>

        {/* Liquid Glass Tiles Grid */}
        <div
          ref={gridRef}
          onPointerDown={e => {
            wakeUpLens();
            const gr = gridRef.current?.getBoundingClientRect();
            if (!gr) return;
            const hitIdx = tileRefs.current.findIndex(t => {
              if (!t) return false;
              const r = t.getBoundingClientRect();
              return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
            });
            if (hitIdx >= 0) {
              springsRef.current.pressed = hitIdx;
              springsRef.current.drag = 1;
              springsRef.current.moved = 0;
              springsRef.current.downSel = activeTileIndex;
            }
          }}
          onPointerMove={e => {
            wakeUpLens();
            springsRef.current.ptr = [e.clientX, e.clientY];
            const hitIdx = tileRefs.current.findIndex(t => {
              if (!t) return false;
              const r = t.getBoundingClientRect();
              return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
            });
            if (hitIdx >= 0) {
              const t = tileRefs.current[hitIdx];
              if (t) {
                const r = t.getBoundingClientRect();
                t.style.setProperty('--mx', `${e.clientX - r.left}px`);
                t.style.setProperty('--my', `${e.clientY - r.top}px`);
              }
            }
            if (springsRef.current.drag) {
              springsRef.current.moved = 1;
              if (hitIdx >= 0 && hitIdx !== activeTileIndex) {
                springsRef.current.pressed = hitIdx;
                const targetTile = tileRefs.current[hitIdx];
                if (targetTile) {
                  const cx = targetTile.offsetLeft + targetTile.offsetWidth / 2;
                  const cy = targetTile.offsetTop + targetTile.offsetHeight / 2;
                  springsRef.current.lx.t = cx;
                  springsRef.current.ly.t = cy;
                  // Playful liquid jelly stretch bounce
                  springsRef.current.ls.x = 1.14;
                  springsRef.current.ls.t = 1;
                }
                setActiveTileIndex(hitIdx);
                const targetClass = classData[hitIdx];
                if (targetClass) {
                  onSelectClass(targetClass.id);
                }
              }
            }
          }}
          onPointerUp={() => {
            if (springsRef.current.drag) {
              if (activeTileIndex >= 0) {
                const target = classData[activeTileIndex];
                if (target) {
                  onSelectClass(target.id);
                  setShowClassDetails(true);
                  triggerJumpTo(`class-${target.id}`);
                  const tileEl = tileRefs.current[activeTileIndex];
                  if (tileEl) {
                    const cx = tileEl.offsetLeft + tileEl.offsetWidth / 2;
                    const cy = tileEl.offsetTop + tileEl.offsetHeight / 2;
                    springsRef.current.lx.t = cx;
                    springsRef.current.ly.t = cy;
                    triggerSonarPing(cx, cy);
                  }
                }
              }
              springsRef.current.drag = 0;
              springsRef.current.pressed = -1;
            }
          }}
          onPointerLeave={() => {
            if (!springsRef.current.drag) springsRef.current.ptr = null;
          }}
          className="liquid-grid"
          style={{
            gridTemplateColumns: `repeat(${Math.max(3, Math.min(classes.length, 9))}, minmax(0, 1fr))`,
          }}
        >
          {/* Spotlight under glass */}
          <i ref={spotRef} className="liquid-spot"></i>

          {/* Liquid Glass Physical Refraction Lens */}
          <div ref={lensRef} className="liquid-g liquid-lens"></div>

          {/* Class Tiles */}
          {classData.map((c, i) => {
            const isDimmed = !filteredClassIds.has(c.id);
            const isSelected = selectedClassId === c.id;

            return (
              <button
                key={c.id}
                ref={el => {
                  tileRefs.current[i] = el;
                  registerTargetElement(`class-${c.id}`, el, 16);
                }}
                type="button"
                onClick={() => handleSelectTile(i)}
                title={`${c.name} · ${c.teacher} · ${c.debt > 0 ? `qarz ${fmt(c.debt)} so'm` : "to'lov to'langan"}`}
                className={`liquid-g liquid-tile ${isDimmed ? 'dim' : ''} ${isSelected ? 'on' : ''}`}
                style={{
                  ['--i' as string]: i,
                }}
              >
                {/* Glint sweep */}
                <i className="liquid-gl" style={{ animationDelay: `${i * 0.35 + 2}s` }}></i>

                {/* Row 1: Name and Debt dot */}
                <span className="liquid-r1">
                  <span className="liquid-n">{nb(c.name)}</span>
                  <i className={`liquid-dot ${c.debt > 0 ? 'db' : ''}`}></i>
                </span>

                {/* Row 2: Teacher Name */}
                <span className="liquid-t">{c.teacher.split(' ')[0]}</span>

                {/* Row 3: Ready / Total & Percent */}
                <span className="liquid-nm">
                  <b style={{ fontWeight: 600 }}>{c.certified}/{c.total}</b>
                  <em>{c.percent}%</em>
                </span>

                {/* Row 4: Shimmer progress bar */}
                <span className="liquid-tb">
                  <i style={{ width: `${c.percent}%` }}></i>
                </span>
              </button>
            );
          })}
        </div>

        {/* COMPACT & SLEEK CLASS ACTION BAR (Never overlaps, preserves class selection on close) */}
        {selectedClass && (
          <>
            {showClassDetails ? (
              <div className="liquid-g liquid-details-ribbon">
                {/* Left: Class Badge, Teacher & Key Stats */}
                <div className="flex items-center gap-2.5 flex-wrap min-w-0">
                  <div className="px-2.5 py-1 rounded-lg bg-blue-600 text-white font-extrabold text-xs tracking-tight shadow-xs flex-shrink-0">
                    {nb(selectedClass.name)}
                  </div>
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-xs font-bold text-slate-900 truncate">
                      {selectedClass.teacher}
                    </span>
                    <span className="text-[10px] text-blue-700 font-semibold px-1 py-0.2 rounded bg-blue-50 border border-blue-200">
                      Rahbar
                    </span>
                  </div>
                  <span className="text-slate-300 hidden sm:inline">•</span>
                  <div className="text-xs text-slate-600 font-medium hidden sm:flex items-center gap-1">
                    <span className="font-bold text-slate-900">{selectedClass.total}</span> o'quvchi
                    <span className="text-slate-400">/</span>
                    <span className="font-bold text-emerald-700">{selectedClass.certified} tayyor</span>
                    <span className="text-[11px] font-mono text-slate-500">({selectedClass.percent}%)</span>
                  </div>
                  {/* Payment Pill */}
                  <button
                    type="button"
                    onClick={() => onOpenPaymentModal(selectedClass.raw)}
                    className={`px-2 py-0.5 rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-transform hover:scale-105 active:scale-95 border ${
                      selectedClass.debt > 0
                        ? 'bg-amber-50 text-amber-900 border-amber-300'
                        : 'bg-emerald-50 text-emerald-900 border-emerald-300'
                    }`}
                    title="To'lov holatini ko'rish yoki kiritish"
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${selectedClass.debt > 0 ? 'bg-amber-600 animate-pulse' : 'bg-emerald-600'}`}></span>
                    <span>{selectedClass.debt > 0 ? `${fmt(selectedClass.debt)} so'm qarz` : "To'langan ✅"}</span>
                  </button>
                </div>

                {/* Right: Sleek Action Buttons & Dismiss */}
                <div className="flex items-center gap-1.5 flex-wrap flex-shrink-0">
                  <button
                    type="button"
                    onClick={e => {
                      handleButtonRipple(e);
                      onOpenClassBatch(selectedClass.raw);
                    }}
                    className="px-2.5 py-1 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 transition-all cursor-pointer shadow-2xs"
                    title="Butun sinfni Aileaders'dan ro'yxatdan o'tkazish"
                  >
                    <Zap className="w-3 h-3 text-yellow-300" />
                    <span>Aileaders</span>
                  </button>

                  <button
                    type="button"
                    onClick={e => {
                      handleButtonRipple(e);
                      onOpenTeacherMessageModal(selectedClass.raw);
                    }}
                    className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-lg text-xs font-bold flex items-center gap-1 transition-all cursor-pointer shadow-2xs"
                    title="Ustozga bildirishnoma yuborish"
                  >
                    <Bell className="w-3 h-3" />
                    <span>Xabar</span>
                  </button>

                  <button
                    type="button"
                    onClick={e => {
                      handleButtonRipple(e);
                      onOpenBulkUploadModal(selectedClass.id);
                    }}
                    className="px-2.5 py-1 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 rounded-lg text-xs font-bold flex items-center gap-1 transition-all cursor-pointer shadow-2xs"
                    title="Shu sinfga yangi o'quvchi qo'shish"
                  >
                    <UserPlus className="w-3 h-3 text-blue-600" />
                    <span className="hidden sm:inline">+ O'quvchi</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onEditClass(selectedClass.raw)}
                    className="p-1 text-slate-400 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                    title="Sinfni tahrirlash"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => onDeleteClass(selectedClass.raw)}
                    className="p-1 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                    title="Sinfni o'chirish"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>

                  <div className="w-[1px] h-4 bg-slate-200 mx-0.5"></div>

                  {/* Clean Close: ONLY hides panel, NEVER deselects class! */}
                  <button
                    type="button"
                    onClick={() => setShowClassDetails(false)}
                    className="px-2 py-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer transition-colors"
                    title="Boshqaruv panelini yashirish (Sinf tanlangan holda qoladi)"
                  >
                    <X className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-[11px]">Yopish</span>
                  </button>
                </div>
              </div>
            ) : (
              /* When details are hidden: Slim, unobtrusive 26px chip */
              <div className="flex items-center justify-between mt-2 mb-1 px-3 py-1 rounded-xl bg-blue-50/70 border border-blue-200 text-xs text-blue-900 animate-fade-in">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse"></span>
                  <span>Faol sinf: <strong>{nb(selectedClass.name)}</strong> ({selectedClass.teacher})</span>
                  <span className="text-slate-400 hidden sm:inline">•</span>
                  <span className="text-slate-500 hidden sm:inline">{selectedClass.total} o'quvchi ({selectedClass.certified} tayyor)</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowClassDetails(true)}
                    className="px-2 py-0.5 rounded-lg bg-white hover:bg-blue-100 text-blue-700 font-bold border border-blue-200 text-[11px] flex items-center gap-1 cursor-pointer shadow-2xs transition-colors"
                    title="Sinf boshqaruv amallarini ko'rsatish"
                  >
                    <span>Amallar paneli</span>
                    <ChevronDown className="w-3 h-3" />
                  </button>
                  <span className="text-slate-300">|</span>
                  <button
                    type="button"
                    onClick={handleResetToAll}
                    className="text-[11px] text-slate-500 hover:text-slate-800 hover:underline cursor-pointer"
                    title="Barcha sinflar ro'yxatiga qaytish"
                  >
                    Barcha sinflar
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </>
  );
};
