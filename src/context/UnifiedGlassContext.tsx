import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';

export interface GlassTargetRect {
  id: string; // e.g. 'tab-classes', 'tab-finance', 'class-tile-xyz', etc.
  x: number; // center X in page or relative coordinate
  y: number; // center Y
  width: number;
  height: number;
  borderRadius?: number;
}

interface UnifiedGlassContextType {
  activeTargetId: string;
  setActiveTarget: (target: GlassTargetRect | null) => void;
  registerTargetElement: (id: string, el: HTMLElement | null, radius?: number) => void;
  unregisterTargetElement: (id: string) => void;
  triggerJumpTo: (id: string) => void;
  wakeLens: () => void;
}

const UnifiedGlassContext = createContext<UnifiedGlassContextType | null>(null);

export const useUnifiedGlass = () => {
  const ctx = useContext(UnifiedGlassContext);
  if (!ctx) {
    throw new Error('useUnifiedGlass must be used within a UnifiedGlassProvider');
  }
  return ctx;
};

// Physics Spring for unified single glass lens
class LensSpring {
  x: number;
  v: number;
  t: number;
  k: number;
  c: number;
  constructor(x: number, k = 220, c = 24) {
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

interface UnifiedGlassProviderProps {
  children: React.ReactNode;
}

export const UnifiedGlassProvider: React.FC<UnifiedGlassProviderProps> = ({ children }) => {
  const [activeTargetId, setActiveTargetId] = useState<string>('nav-classes');
  const targetElementsRef = useRef<Map<string, { el: HTMLElement; radius?: number }>>(new Map());
  const lensRef = useRef<HTMLDivElement>(null);
  const spotRef = useRef<HTMLDivElement>(null);
  const defsRef = useRef<SVGDefsElement>(null);
  const sleepTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const springsRef = useRef({
    // Positional coordinates (viewport relative or fixed)
    cx: new LensSpring(window.innerWidth / 2, 230, 25),
    cy: new LensSpring(200, 230, 25),
    cw: new LensSpring(120, 250, 26),
    ch: new LensSpring(42, 250, 26),
    cr: new LensSpring(14, 250, 26),
    scale: new LensSpring(1, 220, 23),
    mouse: [window.innerWidth / 2, window.innerHeight / 2] as [number, number],
    ptr: null as [number, number] | null,
    isSleeping: false,
    isInitialized: false,
  });

  const wakeLens = useCallback(() => {
    springsRef.current.scale.t = 1;
    springsRef.current.isSleeping = false;
    if (sleepTimeoutRef.current) clearTimeout(sleepTimeoutRef.current);
    sleepTimeoutRef.current = setTimeout(() => {
      // 5 seconds inactivity -> sleep mode
      springsRef.current.scale.t = 0;
      springsRef.current.isSleeping = true;
    }, 5000);
  }, []);

  const registerTargetElement = useCallback((id: string, el: HTMLElement | null, radius = 14) => {
    if (el) {
      targetElementsRef.current.set(id, { el, radius });
    } else {
      targetElementsRef.current.delete(id);
    }
  }, []);

  const unregisterTargetElement = useCallback((id: string) => {
    targetElementsRef.current.delete(id);
  }, []);

  // Set target and initiate jumping flight
  const triggerJumpTo = useCallback((id: string) => {
    setActiveTargetId(id);
    wakeLens();

    const entry = targetElementsRef.current.get(id);
    if (!entry || !entry.el) return;

    const rect = entry.el.getBoundingClientRect();
    const targetCenterX = rect.left + rect.width / 2;
    const targetCenterY = rect.top + rect.height / 2;
    const targetW = rect.width;
    const targetH = rect.height;
    const targetR = entry.radius || 14;

    const s = springsRef.current;
    if (!s.isInitialized) {
      s.cx.x = targetCenterX;
      s.cy.x = targetCenterY;
      s.cw.x = targetW;
      s.ch.x = targetH;
      s.cr.x = targetR;
      s.isInitialized = true;
    }

    s.cx.t = targetCenterX;
    s.cy.t = targetCenterY;
    s.cw.t = targetW;
    s.ch.t = targetH;
    s.cr.t = targetR;
  }, [wakeLens]);

  const setActiveTarget = useCallback((target: GlassTargetRect | null) => {
    if (!target) return;
    setActiveTargetId(target.id);
    wakeLens();
    const s = springsRef.current;
    s.cx.t = target.x;
    s.cy.t = target.y;
    s.cw.t = target.width;
    s.ch.t = target.height;
    s.cr.t = target.borderRadius || 14;
  }, [wakeLens]);

  // Global mouse tracking for spotlight and rim highlight
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      springsRef.current.mouse = [e.clientX, e.clientY];
    };
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, []);

  // Refraction SVG displacement map generator
  const applyRefraction = useCallback((w: number, h: number, r: number) => {
    const lens = lensRef.current;
    const defs = defsRef.current;
    if (!lens || !defs || w <= 0 || h <= 0) return;

    const bz = 18, sc = 38, ab = 6;
    const cornerR = Math.min(Math.min(w, h) / 2, r);

    const c = document.createElement('canvas');
    c.width = Math.min(w, 400);
    c.height = Math.min(h, 240);
    const ctx = c.getContext('2d');
    if (!ctx) return;

    const cw = c.width;
    const ch = c.height;
    const im = ctx.createImageData(cw, ch);
    const d = im.data;

    for (let j = 0; j < ch; j++) {
      for (let i = 0; i < cw; i++) {
        const px = i + 0.5 - cw / 2;
        const py = j + 0.5 - ch / 2;
        const qx = Math.abs(px) - (cw / 2 - cornerR);
        const qy = Math.abs(py) - (ch / 2 - cornerR);
        const mx = Math.max(qx, 0);
        const my = Math.max(qy, 0);
        const l = Math.hypot(mx, my);
        const dist = l + Math.min(Math.max(qx, qy), 0) - cornerR;
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
        const k = (j * cw + i) * 4;
        d[k] = 128 - nx * s * 127;
        d[k + 1] = 128 - ny * s * 127;
        d[k + 2] = 128;
        d[k + 3] = 255;
      }
    }
    ctx.putImageData(im, 0, 0);

    const filterId = 'unified-liquid-refract-filter';
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

    lens.style.backdropFilter = `url(#${filterId}) saturate(1.6) brightness(1.06)`;
    (lens.style as any).webkitBackdropFilter = `url(#${filterId}) saturate(1.6) brightness(1.06)`;
  }, []);

  // Main animation frame loop
  useEffect(() => {
    let animId: number;
    let lastTime = performance.now();
    let lastW = 0, lastH = 0;

    const loop = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.033);
      lastTime = now;

      const s = springsRef.current;

      // Continuously update target center position if element shifts on scroll/resize
      const activeEntry = targetElementsRef.current.get(activeTargetId);
      if (activeEntry && activeEntry.el) {
        const r = activeEntry.el.getBoundingClientRect();
        s.cx.t = r.left + r.width / 2;
        s.cy.t = r.top + r.height / 2;
        s.cw.t = r.width;
        s.ch.t = r.height;
        s.cr.t = activeEntry.radius || 14;
      }

      s.cx.step(dt);
      s.cy.step(dt);
      s.cw.step(dt);
      s.ch.step(dt);
      s.cr.step(dt);
      s.scale.step(dt);

      if (lensRef.current) {
        const curW = Math.max(28, s.cw.x);
        const curH = Math.max(24, s.ch.x);
        const curR = Math.max(6, s.cr.x);
        const curScale = Math.max(0, s.scale.x);

        // Fluid jelly deformation during travel (stretching horizontally or vertically)
        const travelSpeed = Math.hypot(s.cx.v, s.cy.v);
        const stretchRatio = 1 + Math.min(travelSpeed / 1300, 0.32);
        const squashRatio = 1 / Math.sqrt(stretchRatio);

        const isHorizontalFlight = Math.abs(s.cx.v) >= Math.abs(s.cy.v);
        const scaleX = (isHorizontalFlight ? stretchRatio : squashRatio) * curScale;
        const scaleY = (isHorizontalFlight ? squashRatio : stretchRatio) * curScale;

        lensRef.current.style.width = `${curW}px`;
        lensRef.current.style.height = `${curH}px`;
        lensRef.current.style.borderRadius = `${curR}px`;
        lensRef.current.style.transform = `translate3d(${s.cx.x - curW / 2}px, ${s.cy.x - curH / 2}px, 0) scale(${scaleX}, ${scaleY})`;
        lensRef.current.style.opacity = curScale > 0.01 ? `${Math.min(1, curScale)}` : '0';

        // Conic rim angle turning toward cursor
        const rimAngle = Math.atan2(s.mouse[1] - s.cy.x, s.mouse[0] - s.cx.x) * (180 / Math.PI) + 90;
        lensRef.current.style.setProperty('--unified-rim-a', `${rimAngle}deg`);

        // Reapply refraction filter if dimension changes noticeably
        if (Math.abs(curW - lastW) > 30 || Math.abs(curH - lastH) > 20) {
          lastW = curW;
          lastH = curH;
          applyRefraction(curW, curH, curR);
        }
      }

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [activeTargetId, applyRefraction]);

  // Initial trigger after mount
  useEffect(() => {
    wakeLens();
    const t = setTimeout(() => {
      triggerJumpTo(activeTargetId);
    }, 150);
    return () => clearTimeout(t);
  }, [activeTargetId, triggerJumpTo, wakeLens]);

  return (
    <UnifiedGlassContext.Provider
      value={{
        activeTargetId,
        setActiveTarget,
        registerTargetElement,
        unregisterTargetElement,
        triggerJumpTo,
        wakeLens,
      }}
    >
      {/* SVG Defs for physical refraction filter */}
      <svg width="0" height="0" style={{ position: 'fixed', pointerEvents: 'none' }}>
        <defs ref={defsRef}></defs>
      </svg>

      {/* Global Unified Liquid Glass Floating Lens */}
      <div
        ref={lensRef}
        className="unified-liquid-lens"
        style={{
          position: 'fixed',
          left: 0,
          top: 0,
          pointerEvents: 'none',
          zIndex: 45,
          background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(239, 246, 255, 0.72))',
          boxShadow: 'inset 0 1px 0 #fff, inset 0 -6px 14px -8px rgba(37, 99, 235, 0.35), 0 8px 24px -6px rgba(37, 99, 235, 0.28)',
          willChange: 'transform, width, height, opacity',
          transition: 'opacity 0.4s ease-out',
        }}
      >
        {/* Conic luminous rim */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 'inherit',
            padding: '1.5px',
            pointerEvents: 'none',
            background: 'conic-gradient(from var(--unified-rim-a, 0deg), rgba(37, 99, 235, 0.75), rgba(255, 255, 255, 0) 24%, rgba(255, 255, 255, 0) 50%, rgba(37, 99, 235, 0.75) 74%, rgba(255, 255, 255, 0) 90%, rgba(37, 99, 235, 0.75))',
            WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
            WebkitMaskComposite: 'xor',
            maskComposite: 'exclude',
          }}
        />
      </div>

      {children}
    </UnifiedGlassContext.Provider>
  );
};
