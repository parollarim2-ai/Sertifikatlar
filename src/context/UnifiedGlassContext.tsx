import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';

export interface GlassTargetRect {
  id: string; // e.g. 'nav-classes', 'nav-finance', 'class-c1', etc.
  x: number;
  y: number;
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

// Physics Spring with second-order dynamics for elastic liquid behavior
class LensSpring {
  x: number;
  v: number;
  t: number;
  k: number;
  c: number;

  constructor(x: number, k = 230, c = 25) {
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
  const rootContainerRef = useRef<HTMLDivElement>(null);
  const lensRef = useRef<HTMLDivElement>(null);
  const defsRef = useRef<SVGDefsElement>(null);

  const springsRef = useRef({
    // Root container-relative center coordinates
    cx: new LensSpring(200, 240, 24),
    cy: new LensSpring(60, 240, 24),
    cw: new LensSpring(120, 260, 26),
    ch: new LensSpring(42, 260, 26),
    cr: new LensSpring(14, 260, 26),
    scale: new LensSpring(1, 240, 24),
    mouse: [window.innerWidth / 2, window.innerHeight / 2] as [number, number],
    isInitialized: false,
    inFlight: false,
  });

  const wakeLens = useCallback(() => {
    springsRef.current.scale.t = 1;
  }, []);

  const registerTargetElement = useCallback((id: string, el: HTMLElement | null, radius = 14) => {
    if (el) {
      targetElementsRef.current.set(id, { el, radius });
      // If this is the active target and we haven't initialized yet, initialize immediately
      const s = springsRef.current;
      const root = rootContainerRef.current;
      if (!s.isInitialized && root) {
        const rootRect = root.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        const targetX = elRect.left - rootRect.left + elRect.width / 2;
        const targetY = elRect.top - rootRect.top + elRect.height / 2;
        s.cx.x = targetX;
        s.cx.t = targetX;
        s.cy.x = targetY;
        s.cy.t = targetY;
        s.cw.x = elRect.width;
        s.cw.t = elRect.width;
        s.ch.x = elRect.height;
        s.ch.t = elRect.height;
        s.cr.x = radius;
        s.cr.t = radius;
        s.cx.v = 0;
        s.cy.v = 0;
        s.isInitialized = true;
      }
    } else {
      targetElementsRef.current.delete(id);
    }
  }, []);

  const unregisterTargetElement = useCallback((id: string) => {
    targetElementsRef.current.delete(id);
  }, []);

  // Jump from current location to target element across tabs & cards
  const triggerJumpTo = useCallback((id: string) => {
    setActiveTargetId(id);
    wakeLens();

    const root = rootContainerRef.current;
    const entry = targetElementsRef.current.get(id);
    if (!root || !entry || !entry.el) return;

    const rootRect = root.getBoundingClientRect();
    const rect = entry.el.getBoundingClientRect();
    const targetCenterX = rect.left - rootRect.left + rect.width / 2;
    const targetCenterY = rect.top - rootRect.top + rect.height / 2;
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
      s.cx.v = 0;
      s.cy.v = 0;
      s.isInitialized = true;
    }

    s.inFlight = true;
    s.cx.t = targetCenterX;
    s.cy.t = targetCenterY;
    s.cw.t = targetW;
    s.ch.t = targetH;
    s.cr.t = targetR;
    s.scale.t = 1;
  }, [wakeLens]);

  const setActiveTarget = useCallback((target: GlassTargetRect | null) => {
    if (!target) return;
    setActiveTargetId(target.id);
    wakeLens();
    const s = springsRef.current;
    s.inFlight = true;
    s.cx.t = target.x;
    s.cy.t = target.y;
    s.cw.t = target.width;
    s.ch.t = target.height;
    s.cr.t = target.borderRadius || 14;
    s.scale.t = 1;
  }, [wakeLens]);

  // Track global pointer for spotlight and specular rim highlights
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      springsRef.current.mouse = [e.clientX, e.clientY];
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, []);

  // Lock position firmly during page scroll without spring lag or viewport drift
  useEffect(() => {
    const handleScroll = () => {
      const root = rootContainerRef.current;
      const activeEntry = targetElementsRef.current.get(activeTargetId);
      if (!root || !activeEntry || !activeEntry.el) return;

      const rootRect = root.getBoundingClientRect();
      const elRect = activeEntry.el.getBoundingClientRect();
      const newTargetX = elRect.left - rootRect.left + elRect.width / 2;
      const newTargetY = elRect.top - rootRect.top + elRect.height / 2;

      const s = springsRef.current;
      // If already settled near the target, lock immediately to avoid any lag
      if (!s.inFlight || (Math.abs(s.cx.t - s.cx.x) < 8 && Math.abs(s.cy.t - s.cy.x) < 8)) {
        s.cx.x = newTargetX;
        s.cy.x = newTargetY;
        s.cx.v = 0;
        s.cy.v = 0;
      }
      s.cx.t = newTargetX;
      s.cy.t = newTargetY;
    };

    window.addEventListener('scroll', handleScroll, { passive: true, capture: true });
    return () => window.removeEventListener('scroll', handleScroll, { capture: true });
  }, [activeTargetId]);

  // Physical refraction SVG filter
  const applyRefraction = useCallback((w: number, h: number, r: number) => {
    const lens = lensRef.current;
    const defs = defsRef.current;
    if (!lens || !defs || w <= 0 || h <= 0) return;

    const bz = 18, sc = 38, ab = 6;
    const cornerR = Math.min(Math.min(w, h) / 2, r);

    const c = document.createElement('canvas');
    c.width = Math.min(Math.max(w, 40), 400);
    c.height = Math.min(Math.max(h, 24), 240);
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
        <feGaussianBlur stdDeviation="0.8"/>
      </filter>`
    );

    lens.style.backdropFilter = `url(#${filterId}) saturate(1.55) brightness(1.05)`;
    (lens.style as any).webkitBackdropFilter = `url(#${filterId}) saturate(1.55) brightness(1.05)`;
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
      const root = rootContainerRef.current;

      // Continuously match target container coordinates
      if (root) {
        const activeEntry = targetElementsRef.current.get(activeTargetId);
        if (activeEntry && activeEntry.el && document.body.contains(activeEntry.el)) {
          const rootRect = root.getBoundingClientRect();
          const elRect = activeEntry.el.getBoundingClientRect();

          // Container-relative coordinates are 100% immune to window scroll!
          const targetX = elRect.left - rootRect.left + elRect.width / 2;
          const targetY = elRect.top - rootRect.top + elRect.height / 2;
          const targetW = elRect.width;
          const targetH = elRect.height;
          const targetR = activeEntry.radius || 14;

          if (!s.isInitialized) {
            s.cx.x = targetX;
            s.cy.x = targetY;
            s.cw.x = targetW;
            s.ch.x = targetH;
            s.cr.x = targetR;
            s.cx.v = 0;
            s.cy.v = 0;
            s.isInitialized = true;
          }

          s.cx.t = targetX;
          s.cy.t = targetY;
          s.cw.t = targetW;
          s.ch.t = targetH;
          s.cr.t = targetR;
        }
      }

      s.cx.step(dt);
      s.cy.step(dt);
      s.cw.step(dt);
      s.ch.step(dt);
      s.cr.step(dt);
      s.scale.step(dt);

      // Check if arrival reached
      const distToTarget = Math.hypot(s.cx.t - s.cx.x, s.cy.t - s.cy.x);
      if (distToTarget < 3 && Math.hypot(s.cx.v, s.cy.v) < 15) {
        s.inFlight = false;
      }

      if (lensRef.current) {
        const curW = Math.max(28, s.cw.x);
        const curH = Math.max(24, s.ch.x);
        const curR = Math.max(6, s.cr.x);
        const curScale = Math.max(0, s.scale.x);

        // Fluid liquid droplet elongation in flight direction
        const speed = Math.hypot(s.cx.v, s.cy.v);
        const stretch = 1 + Math.min(speed / 1300, 0.35);
        const squash = 1 / Math.sqrt(stretch);

        let flightAngle = 0;
        if (speed > 40) {
          flightAngle = Math.atan2(s.cy.v, s.cx.v) * (180 / Math.PI);
        }

        lensRef.current.style.width = `${curW}px`;
        lensRef.current.style.height = `${curH}px`;
        lensRef.current.style.borderRadius = `${curR}px`;

        // Position absolute inside container with fluid jelly deformation
        if (speed > 40) {
          lensRef.current.style.transform = `translate3d(${s.cx.x - curW / 2}px, ${s.cy.x - curH / 2}px, 0) rotate(${flightAngle}deg) scale(${stretch * curScale}, ${squash * curScale}) rotate(${-flightAngle}deg)`;
        } else {
          lensRef.current.style.transform = `translate3d(${s.cx.x - curW / 2}px, ${s.cy.x - curH / 2}px, 0) scale(${curScale}, ${curScale})`;
        }
        lensRef.current.style.opacity = curScale > 0.01 ? '1' : '0';

        // Dynamic specular rim angle oriented toward cursor
        if (root) {
          const rootRect = root.getBoundingClientRect();
          const cursorLocalX = s.mouse[0] - rootRect.left;
          const cursorLocalY = s.mouse[1] - rootRect.top;
          const rimAngle = Math.atan2(cursorLocalY - s.cy.x, cursorLocalX - s.cx.x) * (180 / Math.PI) + 90;
          lensRef.current.style.setProperty('--unified-rim-a', `${rimAngle}deg`);
        }

        // Reapply refraction filter when dimensions morph noticeably
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

  // Initial target alignment on mount
  useEffect(() => {
    wakeLens();
    const t = setTimeout(() => {
      triggerJumpTo(activeTargetId);
    }, 120);
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
      <svg width="0" height="0" style={{ position: 'fixed', pointerEvents: 'none', zIndex: -1 }}>
        <defs ref={defsRef}></defs>
      </svg>

      {/* Root Container: Absolute Positioning Scope for Liquid Glass */}
      <div ref={rootContainerRef} className="relative w-full">
        {/* Unified Liquid Glass Floating Lens */}
        <div
          ref={lensRef}
          className="unified-liquid-lens"
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            pointerEvents: 'none',
            zIndex: 35,
            background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(239, 246, 255, 0.72))',
            boxShadow: 'inset 0 1px 0 #fff, inset 0 -6px 14px -8px rgba(37, 99, 235, 0.35), 0 8px 24px -6px rgba(37, 99, 235, 0.28)',
            willChange: 'transform, width, height, opacity',
            transition: 'opacity 0.3s ease-out',
          }}
        >
          {/* Luminous Conic Highlight Rim */}
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
      </div>
    </UnifiedGlassContext.Provider>
  );
};
