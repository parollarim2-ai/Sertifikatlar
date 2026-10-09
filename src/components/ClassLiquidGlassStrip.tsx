import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { ClassGroup, Student } from '../types';
import { 
  Search, 
  Plus, 
  Edit2, 
  Trash2, 
  CreditCard, 
  Bell, 
  Zap, 
  ArrowRight, 
  UserPlus, 
  X,
  CheckCircle2,
  Clock
} from 'lucide-react';

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

// Spring physics simulation helper
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
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'debt' | 'low'>('all');
  const [activeTileIndex, setActiveTileIndex] = useState<number>(-1);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [popoverStyle, setPopoverStyle] = useState<{ width?: string; left?: string; ax?: string; transformOrigin?: string }>({});

  const stripRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const lensRef = useRef<HTMLDivElement>(null);
  const spotRef = useRef<HTMLDivElement>(null);
  const segRef = useRef<HTMLDivElement>(null);
  const segPillRef = useRef<HTMLElement>(null);
  const tileRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Spring physics references for Lens and Segment Pill
  const springsRef = useRef({
    lx: new Spring(0, 200, 17),
    ly: new Spring(0, 200, 17),
    ls: new Spring(0, 260, 15),
    pl: new Spring(0, 300, 22),
    pr: new Spring(0, 300, 22),
    spotX: 0,
    spotY: 0,
    ptr: null as [number, number] | null,
    pressed: -1,
    drag: 0,
    moved: 0,
    downSel: -1,
  });

  // Dynamic calculations for each class
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

  // Overall metrics for header
  const totalStudentsCount = useMemo(() => students.length, [students]);
  const totalCertifiedCount = useMemo(() => students.filter(s => s.status === 'certified').length, [students]);
  const debtClassesCount = useMemo(() => classData.filter(c => c.debt > 0).length, [classData]);
  const lowCompletionCount = useMemo(() => classData.filter(c => c.total > 0 && c.percent < 50).length, [classData]);

  // Filtered class tiles
  const filteredClasses = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return classData.filter(c => {
      const matchesSearch = !q || c.name.toLowerCase().includes(q) || c.teacher.toLowerCase().includes(q);
      const matchesFilter = 
        filterMode === 'all' 
          ? true 
          : filterMode === 'debt' 
          ? c.debt > 0 
          : c.total > 0 && c.percent < 50;
      return matchesSearch && matchesFilter;
    });
  }, [classData, searchQuery, filterMode]);

  // Sync active tile with selectedClassId
  useEffect(() => {
    if (selectedClassId === 'all' || selectedClassId === 'all_with_teachers' || selectedClassId === 'only_teachers') {
      setActiveTileIndex(-1);
      setIsPopoverOpen(false);
      springsRef.current.ls.t = 0;
    } else {
      const idx = classData.findIndex(c => c.id === selectedClassId);
      if (idx >= 0) {
        setActiveTileIndex(idx);
        setIsPopoverOpen(true);
        springsRef.current.ls.t = 1;
      }
    }
  }, [selectedClassId, classData]);

  // Format currency
  const fmt = (n: number) => n.toLocaleString('ru-RU');

  // Sonar ping ripple effect on click
  const triggerSonarPing = (x: number, y: number) => {
    if (!gridRef.current) return;
    const ping = document.createElement('i');
    ping.className = 'liquid-ping';
    ping.style.left = `${x}px`;
    ping.style.top = `${y}px`;
    gridRef.current.appendChild(ping);
    setTimeout(() => ping.remove(), 900);
  };

  // Button click ripple effect
  const handleButtonRipple = (e: React.MouseEvent<any>) => {
    const target = e.currentTarget as HTMLElement;
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 2.2;
    const ripple = document.createElement('i');
    ripple.className = `liquid-rpl ${target.classList.contains('liquid-btn-primary') ? 'w' : ''}`;
    ripple.style.width = `${size}px`;
    ripple.style.height = `${size}px`;
    ripple.style.left = `${e.clientX - rect.left - size / 2}px`;
    ripple.style.top = `${e.clientY - rect.top - size / 2}px`;
    target.appendChild(ripple);
    setTimeout(() => ripple.remove(), 700);
  };

  // Position popover right under active tile
  const updatePopoverPlacement = useCallback((tileIndex: number) => {
    const strip = stripRef.current;
    const tileEl = tileRefs.current[tileIndex];
    if (!strip || !tileEl) return;

    const stripWidth = strip.offsetWidth;
    const tileRect = tileEl.getBoundingClientRect();
    const stripRect = strip.getBoundingClientRect();
    const cx = tileRect.left - stripRect.left + tileRect.width / 2;

    if (window.innerWidth < 860) {
      setPopoverStyle({
        width: '100%',
        left: '0px',
        transformOrigin: '50% 0',
      });
      return;
    }

    const popoverWidth = Math.min(820, stripWidth);
    const left = Math.max(0, Math.min(cx - popoverWidth / 2, stripWidth - popoverWidth));
    const ax = cx - left;

    setPopoverStyle({
      width: `${popoverWidth}px`,
      left: `${left}px`,
      ax: `${ax}px`,
      transformOrigin: `${ax}px 0`,
    });
  }, []);

  // Select or toggle tile
  const handleTileClick = (index: number, e?: React.MouseEvent) => {
    if (e) handleButtonRipple(e);
    const tileEl = tileRefs.current[index];
    const targetClass = classData[index];
    if (!targetClass) return;

    if (activeTileIndex === index && isPopoverOpen) {
      // Toggle off
      setActiveTileIndex(-1);
      setIsPopoverOpen(false);
      springsRef.current.ls.t = 0;
      onSelectClass('all');
    } else {
      // Select
      setActiveTileIndex(index);
      setIsPopoverOpen(true);
      springsRef.current.ls.t = 1;

      if (tileEl) {
        const cx = tileEl.offsetLeft + tileEl.offsetWidth / 2;
        const cy = tileEl.offsetTop + tileEl.offsetHeight / 2;
        springsRef.current.lx.t = cx;
        springsRef.current.ly.t = cy;
        triggerSonarPing(cx, cy);
      }

      updatePopoverPlacement(index);
      onSelectClass(targetClass.id);
    }
  };

  // Close popover
  const handleClosePopover = () => {
    setIsPopoverOpen(false);
    setActiveTileIndex(-1);
    springsRef.current.ls.t = 0;
    onSelectClass('all');
  };

  // Click outside to dismiss popover
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (isPopoverOpen && stripRef.current && !stripRef.current.contains(e.target as Node)) {
        handleClosePopover();
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isPopoverOpen]);

  // Escape key to dismiss
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isPopoverOpen) {
        handleClosePopover();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPopoverOpen]);

  // Update lens size and segment pill
  useEffect(() => {
    const updateDimensions = () => {
      const firstTile = tileRefs.current[0];
      if (firstTile && lensRef.current) {
        const lw = firstTile.offsetWidth + 14;
        const lh = firstTile.offsetHeight + 14;
        lensRef.current.style.width = `${lw}px`;
        lensRef.current.style.height = `${lh}px`;
      }
      if (activeTileIndex >= 0) {
        updatePopoverPlacement(activeTileIndex);
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, [activeTileIndex, updatePopoverPlacement, classData]);

  // Segment Pill Physics
  const updateSegmentPill = useCallback((btnEl: HTMLButtonElement | null) => {
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
  }, []);

  // Main Animation Loop for Lens, Pill, Pointer Spot, Conic Rim angle
  useEffect(() => {
    let animId: number;
    let lastTime = performance.now();

    const loop = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.033);
      lastTime = now;

      const { lx, ly, ls, pl, pr } = springsRef.current;
      lx.step(dt);
      ly.step(dt);
      ls.step(dt);
      pl.step(dt);
      pr.step(dt);

      // Lens stretch & rotation based on velocity
      if (lensRef.current) {
        const lw = lensRef.current.offsetWidth || 100;
        const lh = lensRef.current.offsetHeight || 100;
        const speed = Math.hypot(lx.v, ly.v);
        const stretch = 1 + Math.min(speed / 2400, 0.35);
        const angle = (Math.atan2(ly.v, lx.v) * 180) / Math.PI;
        const scaleVal = Math.max(ls.x, 0) * (1 + 0.012 * Math.sin(now / 550));

        lensRef.current.style.transform = `translate(${lx.x - lw / 2}px, ${ly.x - lh / 2}px) rotate(${angle}deg) scale(${stretch * scaleVal}, ${scaleVal / Math.sqrt(stretch)}) rotate(${-angle}deg)`;
        lensRef.current.style.opacity = ls.x > 0.01 ? '1' : '0';
      }

      // Segment Pill spring position
      if (segPillRef.current) {
        segPillRef.current.style.left = `${pl.x}px`;
        segPillRef.current.style.width = `${Math.max(20, pr.x - pl.x)}px`;
      }

      // Pointer spotlight under glass
      if (spotRef.current && gridRef.current) {
        const ptr = springsRef.current.ptr;
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

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, []);

  const selectedClass = activeTileIndex >= 0 ? classData[activeTileIndex] : null;

  return (
    <>
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
          --liquid-glass: linear-gradient(180deg, rgba(255, 255, 255, 0.95), rgba(236, 243, 255, 0.65));
          --liquid-sp: cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        .liquid-glass-card {
          position: relative;
          background: var(--liquid-glass);
          backdrop-filter: blur(12px) saturate(1.5);
          -webkit-backdrop-filter: blur(12px) saturate(1.5);
          box-shadow: inset 0 1px 0 #fff, inset 0 -10px 16px -12px rgba(37, 99, 235, 0.28), 0 0 0 1px var(--liquid-ln), 0 12px 28px -12px var(--liquid-sh);
        }

        .liquid-glass-card::after {
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

        .liquid-live-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: var(--liquid-ac);
          box-shadow: 0 0 0 0 var(--liquid-ac);
          animation: liquid-pulse 2s infinite;
        }
        @keyframes liquid-pulse {
          70% { box-shadow: 0 0 0 7px rgba(37, 99, 235, 0); }
          100% { box-shadow: 0 0 0 0 rgba(37, 99, 235, 0); }
        }

        .liquid-btn-primary {
          color: #fff;
          background: linear-gradient(180deg, #3b82f6, #2563eb);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.45), 0 8px 18px -6px rgba(37, 99, 235, 0.65);
          position: relative;
          overflow: hidden;
          transition: transform 0.4s var(--liquid-sp);
        }
        .liquid-btn-primary:hover {
          transform: translateY(-2px);
        }
        .liquid-btn-primary:active {
          transform: scale(0.94);
        }
        .liquid-btn-primary::before {
          content: "";
          position: absolute;
          top: 0;
          bottom: 0;
          width: 40%;
          left: -60%;
          background: linear-gradient(100deg, transparent, rgba(255, 255, 255, 0.5), transparent);
          animation: liquid-sweep 3.4s ease-in-out infinite 1.5s;
        }
        @keyframes liquid-sweep {
          to { left: 140%; }
        }

        .liquid-rpl {
          position: absolute;
          border-radius: 50%;
          background: rgba(37, 99, 235, 0.22);
          transform: scale(0);
          animation: liquid-rp 0.7s ease-out forwards;
          pointer-events: none;
        }
        .liquid-rpl.w { background: rgba(255, 255, 255, 0.5); }
        @keyframes liquid-rp {
          to { transform: scale(1); opacity: 0; }
        }

        .liquid-tile {
          border: 0;
          border-radius: 16px;
          height: 86px;
          padding: 10px 12px 9px;
          color: var(--liquid-ink);
          text-align: left;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          overflow: hidden;
          position: relative;
          transition: transform 0.25s var(--liquid-sp), box-shadow 0.25s, opacity 0.3s;
          user-select: none;
        }
        .liquid-tile:hover {
          transform: translateY(-3px) scale(1.02);
        }
        .liquid-tile:active {
          transform: scale(0.94);
        }
        .liquid-tile.on {
          box-shadow: inset 0 1px 0 #fff, 0 0 0 2px var(--liquid-ac), 0 14px 28px -10px rgba(37, 99, 235, 0.5);
        }
        .liquid-tile.dim {
          opacity: 0.35;
          filter: grayscale(0.5);
        }

        .liquid-glint {
          position: absolute;
          inset: 0;
          background: linear-gradient(110deg, transparent 40%, rgba(255, 255, 255, 0.95) 50%, transparent 60%);
          transform: translateX(-130%);
          animation: liquid-glint-anim 6s ease-in-out infinite;
          pointer-events: none;
        }
        @keyframes liquid-glint-anim {
          0%, 75% { transform: translateX(-130%); }
          100% { transform: translateX(130%); }
        }

        .liquid-shimmer-bar {
          display: block;
          position: relative;
          height: 100%;
          border-radius: 9px;
          background: linear-gradient(90deg, var(--liquid-ac2), var(--liquid-ac));
          transform-origin: left;
        }
        .liquid-shimmer-bar::after {
          content: "";
          position: absolute;
          top: 0;
          bottom: 0;
          width: 45%;
          left: -50%;
          background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.85), transparent);
          animation: liquid-sweep 2.6s ease-in-out infinite;
        }

        .liquid-debt-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          display: block;
          background: var(--liquid-wn);
          animation: liquid-dp 2s ease-in-out infinite;
        }
        @keyframes liquid-dp {
          50% { box-shadow: 0 0 0 5px rgba(217, 119, 6, 0.22); }
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
          from { transform: scale(0.4); opacity: 0.8; }
          to { transform: scale(7); opacity: 0; }
        }

        .liquid-lens {
          position: absolute;
          left: 0;
          top: 0;
          pointer-events: none;
          z-index: 3;
          border-radius: 22px;
          background: rgba(255, 255, 255, 0.14);
          box-shadow: inset 0 1px 0 #fff, 0 14px 30px -8px var(--liquid-sh);
          transition: opacity 0.3s;
          will-change: transform;
        }

        .liquid-spotlight {
          position: absolute;
          left: 0;
          top: 0;
          width: 280px;
          height: 280px;
          margin: -140px 0 0 -140px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(37, 99, 235, 0.18), transparent 65%);
          pointer-events: none;
          opacity: 0;
          transition: opacity 0.4s;
        }

        .liquid-popover {
          position: absolute;
          top: calc(100% + 12px);
          z-index: 40;
          border-radius: 22px;
          padding: 16px 22px;
          display: grid;
          grid-template-columns: auto 1fr auto;
          gap: 24px;
          align-items: center;
          transition: opacity 0.28s, transform 0.5s var(--liquid-sp);
          box-shadow: inset 0 1px 0 #fff, 0 0 0 1px var(--liquid-ln), 0 30px 60px -20px rgba(37, 99, 235, 0.4);
        }
        .liquid-popover::before {
          content: "";
          position: absolute;
          top: -7px;
          left: var(--ax, 50%);
          margin-left: -8px;
          width: 16px;
          height: 16px;
          border-radius: 4px 0 0 0;
          background: #f4f8ff;
          transform: rotate(45deg);
          box-shadow: -1px -1px 0 var(--liquid-ln);
          transition: left 0.5s var(--liquid-sp);
        }

        @media (max-width: 859px) {
          .liquid-grid-container {
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
          }
          .liquid-popover {
            left: 0 !important;
            width: 100% !important;
            grid-template-columns: 1fr;
            gap: 16px;
            padding: 16px;
          }
          .liquid-popover::before {
            display: none;
          }
        }
      `}</style>

      <div ref={stripRef} className="relative mb-5 select-none">
        {/* Top Slim Control Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          {/* Left: Title & Live Summary */}
          <div className="flex items-baseline gap-3 flex-wrap">
            <h2 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
              <span>Sinflar</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                {classes.length} ta
              </span>
            </h2>
            <div className="text-xs text-slate-500 font-medium flex items-center gap-1.5">
              <i className="liquid-live-dot"></i>
              <span className="font-mono font-bold text-slate-800">{totalStudentsCount}</span> o'quvchi ·{' '}
              <span className="font-mono font-bold text-slate-800">{totalCertifiedCount}</span> tayyor ·{' '}
              <span className="font-mono font-bold text-amber-700">{debtClassesCount}</span> sinfda qarz
            </div>
          </div>

          {/* Right: Search, Fluid Segmented Filter, + Sinf Button */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Search Input with Spring Expansion */}
            <label className="liquid-glass-card flex items-center gap-2 px-3 py-1.5 rounded-xl text-slate-500 focus-within:text-blue-600 focus-within:ring-2 focus-within:ring-blue-400 transition-all cursor-text">
              <Search className="w-3.5 h-3.5 flex-shrink-0 transition-transform duration-300" />
              <input
                type="text"
                placeholder="Qidirish..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="bg-transparent text-slate-900 text-xs outline-none w-24 focus:w-44 transition-all duration-300 font-medium"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="w-4 h-4 rounded-full text-slate-400 hover:text-slate-700 flex items-center justify-center cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </label>

            {/* 3-Way Springy Segmented Pill */}
            <div ref={segRef} className="liquid-glass-card relative flex p-1 rounded-xl">
              <i
                ref={segPillRef as unknown as React.RefObject<HTMLElement>}
                className="absolute top-1 bottom-1 rounded-lg bg-white shadow-sm pointer-events-none transition-none"
              ></i>
              <button
                type="button"
                onClick={e => {
                  setFilterMode('all');
                  updateSegmentPill(e.currentTarget);
                  handleButtonRipple(e);
                }}
                className={`relative z-10 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                  filterMode === 'all' ? 'text-blue-700 font-bold' : 'text-slate-600 hover:text-slate-900 opacity-70'
                }`}
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
                className={`relative z-10 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors flex items-center gap-1 ${
                  filterMode === 'debt' ? 'text-amber-800 font-bold' : 'text-slate-600 hover:text-slate-900 opacity-70'
                }`}
              >
                <span>Qarzdorlar</span>
                {debtClassesCount > 0 && (
                  <span className="text-[10px] px-1.5 rounded-full bg-amber-100 text-amber-900 font-mono font-bold">
                    {debtClassesCount}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={e => {
                  setFilterMode('low');
                  updateSegmentPill(e.currentTarget);
                  handleButtonRipple(e);
                }}
                className={`relative z-10 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors flex items-center gap-1 ${
                  filterMode === 'low' ? 'text-blue-700 font-bold' : 'text-slate-600 hover:text-slate-900 opacity-70'
                }`}
              >
                <span>Tayyori kam</span>
                {lowCompletionCount > 0 && (
                  <span className="text-[10px] px-1.5 rounded-full bg-blue-100 text-blue-900 font-mono font-bold">
                    {lowCompletionCount}
                  </span>
                )}
              </button>
            </div>

            {/* + Sinf Action Button */}
            <button
              type="button"
              onClick={e => {
                handleButtonRipple(e);
                onOpenBulkUploadModal();
              }}
              className="liquid-btn-primary px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-md"
              title="Fayldan yangi sinf yuklash"
            >
              <Plus className="w-3.5 h-3.5 transition-transform duration-300 group-hover:rotate-90" />
              <span>Sinf</span>
            </button>
          </div>
        </div>

        {/* Liquid Glass Tiles Grid */}
        <div
          ref={gridRef}
          onPointerMove={e => {
            springsRef.current.ptr = [e.clientX, e.clientY];
          }}
          onPointerLeave={() => {
            springsRef.current.ptr = null;
          }}
          className="liquid-grid-container relative grid gap-2.5 touch-pan-y"
          style={{
            gridTemplateColumns: `repeat(${Math.max(3, Math.min(classes.length, 9))}, minmax(0, 1fr))`,
          }}
        >
          {/* Spotlight under glass */}
          <i ref={spotRef} className="liquid-spotlight"></i>

          {/* Liquid Glass Lens */}
          <div ref={lensRef} className="liquid-glass-card liquid-lens"></div>

          {/* Tiles */}
          {classData.map((c, i) => {
            const isDimmed = !filteredClasses.some(fc => fc.id === c.id);
            const isSelected = activeTileIndex === i && isPopoverOpen;

            return (
              <button
                key={c.id}
                ref={el => {
                  tileRefs.current[i] = el;
                }}
                type="button"
                onClick={e => handleTileClick(i, e)}
                title={`${c.name} · ${c.teacher} · ${c.debt > 0 ? `Qarz: ${fmt(c.debt)} so'm` : "To'lov to'langan"}`}
                className={`liquid-glass-card liquid-tile ${isDimmed ? 'dim' : ''} ${isSelected ? 'on' : ''}`}
              >
                {/* Glint sweep */}
                <i className="liquid-glint" style={{ animationDelay: `${i * 0.35 + 1.5}s` }}></i>

                {/* Row 1: Class Name & Payment dot */}
                <div className="flex items-center justify-between relative w-full">
                  <span className={`text-base font-extrabold tracking-tight ${isSelected ? 'text-blue-700' : 'text-slate-900'}`}>
                    {c.name}
                  </span>
                  <span
                    className={c.debt > 0 ? 'liquid-debt-dot' : 'w-2 h-2 rounded-full bg-blue-600'}
                    title={c.debt > 0 ? `Qarz: ${fmt(c.debt)} so'm` : "To'langan"}
                  ></span>
                </div>

                {/* Row 2: Teacher Name */}
                <div className="text-[11px] text-slate-500 font-medium truncate w-full -mt-1">
                  {c.teacher.split(' ')[0]} {c.teacher.split(' ')[1] ? c.teacher.split(' ')[1][0] + '.' : ''}
                </div>

                {/* Row 3: Certified / Total & Percent */}
                <div className="flex items-center justify-between text-[11px] font-mono w-full">
                  <span className="font-semibold text-slate-800">
                    {c.certified}/{c.total}
                  </span>
                  <span className="text-slate-400 font-medium">{c.percent}%</span>
                </div>

                {/* Row 4: Shimmer Progress Bar */}
                <div className="w-full h-1 rounded-full bg-slate-200/80 overflow-hidden relative">
                  <i
                    className="liquid-shimmer-bar"
                    style={{
                      width: `${c.percent}%`,
                    }}
                  ></i>
                </div>
              </button>
            );
          })}
        </div>

        {/* Emergent Popover underneath the strip */}
        {isPopoverOpen && selectedClass && (
          <div
            ref={popoverRef}
            className="liquid-glass-card liquid-popover animate-scale-up"
            style={{
              width: popoverStyle.width || 'auto',
              left: popoverStyle.left || '0px',
              transformOrigin: popoverStyle.transformOrigin || '50% 0',
              ['--ax' as string]: popoverStyle.ax || '50%',
            }}
          >
            {/* Popover Part 1: Class Name & Teacher */}
            <div className="flex items-center gap-3.5 pr-2">
              <div className="text-3xl font-extrabold tracking-tight bg-gradient-to-br from-slate-900 to-blue-700 bg-clip-text text-transparent">
                {selectedClass.name}
              </div>
              <div>
                <div className="text-sm font-bold text-slate-900 truncate max-w-[180px]">
                  {selectedClass.teacher}
                </div>
                <div className="text-[11px] text-slate-500 font-medium uppercase tracking-wider">
                  Sinf rahbari
                </div>
              </div>
            </div>

            {/* Popover Part 2: Circular Progress, Metrics & Payment Badge */}
            <div className="flex items-center gap-6 flex-wrap">
              {/* Circular SVG Ring */}
              <div className="relative w-14 h-14 flex items-center justify-center flex-shrink-0">
                <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                  <circle
                    cx="50"
                    cy="50"
                    r="42"
                    fill="none"
                    stroke="rgba(15, 23, 42, 0.08)"
                    strokeWidth="10"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="42"
                    fill="none"
                    stroke="#2563eb"
                    strokeWidth="10"
                    strokeLinecap="round"
                    strokeDasharray="263.9"
                    strokeDashoffset={263.9 * (1 - selectedClass.percent / 100)}
                    className="transition-all duration-1000 ease-out"
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-xs font-mono font-bold text-slate-900">
                  {selectedClass.percent}%
                </span>
              </div>

              {/* Students Count Metric */}
              <div>
                <span className="text-[11px] text-slate-500 font-medium uppercase tracking-wider block">
                  O'quvchilar
                </span>
                <span className="text-xl font-extrabold text-slate-900 font-mono">
                  {selectedClass.total} <span className="text-xs font-normal text-slate-500">ta</span>
                </span>
              </div>

              {/* Certified Count Metric */}
              <div>
                <span className="text-[11px] text-slate-500 font-medium uppercase tracking-wider block">
                  Tayyor
                </span>
                <span className="text-xl font-extrabold text-emerald-700 font-mono">
                  {selectedClass.certified} <span className="text-xs font-normal text-emerald-600">ta</span>
                </span>
              </div>

              {/* Payment Badge */}
              <button
                type="button"
                onClick={() => onOpenPaymentModal(selectedClass.raw)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer transition-transform hover:scale-105 active:scale-95 ${
                  selectedClass.debt > 0
                    ? 'bg-amber-100/80 text-amber-900 border border-amber-300'
                    : 'bg-emerald-100/80 text-emerald-900 border border-emerald-300'
                }`}
                title="To'lov holatini ko'rish yoki kiritish"
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    selectedClass.debt > 0 ? 'bg-amber-600 animate-pulse' : 'bg-emerald-600'
                  }`}
                ></span>
                <span>{selectedClass.debt > 0 ? `${fmt(selectedClass.debt)} so'm qarz` : "To'langan ✅"}</span>
              </button>
            </div>

            {/* Popover Part 3: Action Buttons */}
            <div className="flex items-center gap-2 flex-wrap justify-end">
              {/* Batch Aileaders Button */}
              <button
                type="button"
                onClick={e => {
                  handleButtonRipple(e);
                  onOpenClassBatch(selectedClass.raw);
                }}
                className="px-3 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
                title="Butun sinfni Aileaders'dan ro'yxatdan o'tkazish"
              >
                <Zap className="w-3.5 h-3.5 text-yellow-300" />
                <span>Aileaders</span>
              </button>

              {/* Message to Teacher Button */}
              <button
                type="button"
                onClick={e => {
                  handleButtonRipple(e);
                  onOpenTeacherMessageModal(selectedClass.raw);
                }}
                className="px-3 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
                title="Ustozga bildirishnoma yuborish"
              >
                <Bell className="w-3.5 h-3.5" />
                <span>Xabar</span>
              </button>

              {/* + O'quvchi */}
              <button
                type="button"
                onClick={e => {
                  handleButtonRipple(e);
                  onOpenBulkUploadModal(selectedClass.id);
                }}
                className="liquid-glass-card px-3 py-2 rounded-xl text-xs font-bold text-slate-800 hover:bg-white flex items-center gap-1.5 transition-all cursor-pointer"
                title="Ushbu sinfga o'quvchi qo'shish"
              >
                <UserPlus className="w-3.5 h-3.5 text-blue-600" />
                <span>+ O'quvchi</span>
              </button>

              {/* Edit Class */}
              <button
                type="button"
                onClick={() => onEditClass(selectedClass.raw)}
                className="p-2 text-slate-400 hover:text-slate-800 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
                title="Sinf ma'lumotlarini tahrirlash"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>

              {/* Delete Class */}
              <button
                type="button"
                onClick={() => onDeleteClass(selectedClass.raw)}
                className="p-2 text-slate-400 hover:text-rose-600 rounded-xl hover:bg-rose-50 transition-colors cursor-pointer"
                title="Sinfni o'chirish"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>

              {/* Close Button */}
              <button
                type="button"
                onClick={handleClosePopover}
                className="p-2 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
                title="Yopish"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
};
