import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';

export interface GlassTargetRect {
  id: string;
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
  const animIdRef = useRef<number | null>(null);
  const activeTargetIdRef = useRef<string>('nav-classes');
  activeTargetIdRef.current = activeTargetId;

  const springsRef = useRef({
    cx: new LensSpring(200, 260, 26),
    cy: new LensSpring(60, 260, 26),
    cw: new LensSpring(120, 280, 28),
    ch: new LensSpring(42, 280, 28),
    cr: new LensSpring(14, 280, 28),
    scale: new LensSpring(1, 240, 24),
    isInitialized: false,
    inFlight: false,
  });

  const applyLensDOM = useCallback(() => {
    const lens = lensRef.current;
    if (!lens) return;
    const s = springsRef.current;
    const curW = Math.max(28, s.cw.x);
    const curH = Math.max(24, s.ch.x);
    const curR = Math.max(6, s.cr.x);
    const curScale = Math.max(0, s.scale.x);
    const speed = Math.hypot(s.cx.v, s.cy.v);
    const stretch = 1 + Math.min(speed / 1300, 0.28);
    const squash = 1 / Math.sqrt(stretch);

    lens.style.width = `${curW}px`;
    lens.style.height = `${curH}px`;
    lens.style.borderRadius = `${curR}px`;
    lens.style.transform = speed > 40
      ? `translate3d(${s.cx.x - curW / 2}px, ${s.cy.x - curH / 2}px, 0) scale(${stretch * curScale}, ${squash * curScale})`
      : `translate3d(${s.cx.x - curW / 2}px, ${s.cy.x - curH / 2}px, 0) scale(${curScale}, ${curScale})`;
    lens.style.opacity = curScale > 0.01 && s.isInitialized ? '1' : '0';
  }, []);

  // On-demand animation loop: ONLY runs while springs are moving, stops immediately when settled!
  const startLoop = useCallback(() => {
    if (animIdRef.current !== null) return;
    let lastTime = performance.now();

    const tick = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.033);
      lastTime = now;

      const s = springsRef.current;
      s.cx.step(dt);
      s.cy.step(dt);
      s.cw.step(dt);
      s.ch.step(dt);
      s.cr.step(dt);
      s.scale.step(dt);

      applyLensDOM();

      const settled =
        Math.hypot(s.cx.t - s.cx.x, s.cy.t - s.cy.x) < 0.6 &&
        Math.hypot(s.cx.v, s.cy.v) < 4 &&
        Math.abs(s.cw.t - s.cw.x) < 0.6 &&
        Math.abs(s.ch.t - s.ch.x) < 0.6 &&
        Math.abs(s.scale.t - s.scale.x) < 0.01;

      if (settled) {
        s.cx.x = s.cx.t;
        s.cy.x = s.cy.t;
        s.cw.x = s.cw.t;
        s.ch.x = s.ch.t;
        s.cr.x = s.cr.t;
        s.scale.x = s.scale.t;
        s.cx.v = 0;
        s.cy.v = 0;
        s.inFlight = false;
        applyLensDOM();
        animIdRef.current = null;
        return;
      }

      animIdRef.current = requestAnimationFrame(tick);
    };

    animIdRef.current = requestAnimationFrame(tick);
  }, [applyLensDOM]);

  useEffect(() => {
    return () => {
      if (animIdRef.current !== null) {
        cancelAnimationFrame(animIdRef.current);
        animIdRef.current = null;
      }
    };
  }, []);

  const wakeLens = useCallback(() => {
    springsRef.current.scale.t = 1;
  }, []);

  const registerTargetElement = useCallback((id: string, el: HTMLElement | null, radius = 14) => {
    if (el) {
      targetElementsRef.current.set(id, { el, radius });
      const s = springsRef.current;
      const root = rootContainerRef.current;
      if (!s.isInitialized && root && id === activeTargetIdRef.current) {
        const rootRect = root.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        if (elRect.width > 0 && elRect.height > 0) {
          const targetX = elRect.left - rootRect.left + elRect.width / 2;
          const targetY = elRect.top - rootRect.top + elRect.height / 2;
          s.cx.x = s.cx.t = targetX;
          s.cy.x = s.cy.t = targetY;
          s.cw.x = s.cw.t = elRect.width;
          s.ch.x = s.ch.t = elRect.height;
          s.cr.x = s.cr.t = radius;
          s.cx.v = s.cy.v = 0;
          s.isInitialized = true;
          applyLensDOM();
        }
      }
    } else {
      targetElementsRef.current.delete(id);
    }
  }, [applyLensDOM]);

  const unregisterTargetElement = useCallback((id: string) => {
    targetElementsRef.current.delete(id);
  }, []);

  const triggerJumpTo = useCallback((id: string) => {
    setActiveTargetId(id);
    activeTargetIdRef.current = id;
    wakeLens();

    const root = rootContainerRef.current;
    const entry = targetElementsRef.current.get(id);
    if (!root || !entry || !entry.el) return;

    const rootRect = root.getBoundingClientRect();
    const rect = entry.el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const targetCenterX = rect.left - rootRect.left + rect.width / 2;
    const targetCenterY = rect.top - rootRect.top + rect.height / 2;
    const targetW = rect.width;
    const targetH = rect.height;
    const targetR = entry.radius || 14;

    const s = springsRef.current;
    if (!s.isInitialized) {
      s.cx.x = s.cx.t = targetCenterX;
      s.cy.x = s.cy.t = targetCenterY;
      s.cw.x = s.cw.t = targetW;
      s.ch.x = s.ch.t = targetH;
      s.cr.x = s.cr.t = targetR;
      s.cx.v = s.cy.v = 0;
      s.isInitialized = true;
      applyLensDOM();
      return;
    }

    s.inFlight = true;
    s.cx.t = targetCenterX;
    s.cy.t = targetCenterY;
    s.cw.t = targetW;
    s.ch.t = targetH;
    s.cr.t = targetR;
    s.scale.t = 1;
    startLoop();
  }, [wakeLens, applyLensDOM, startLoop]);

  const setActiveTarget = useCallback((target: GlassTargetRect | null) => {
    if (!target) return;
    setActiveTargetId(target.id);
    activeTargetIdRef.current = target.id;
    wakeLens();
    const s = springsRef.current;
    s.inFlight = true;
    s.cx.t = target.x;
    s.cy.t = target.y;
    s.cw.t = target.width;
    s.ch.t = target.height;
    s.cr.t = target.borderRadius || 14;
    s.scale.t = 1;
    startLoop();
  }, [wakeLens, startLoop]);

  useEffect(() => {
    const syncImmediate = () => {
      const root = rootContainerRef.current;
      const activeEntry = targetElementsRef.current.get(activeTargetIdRef.current);
      if (!root || !activeEntry || !activeEntry.el || !document.body.contains(activeEntry.el)) return;

      const rootRect = root.getBoundingClientRect();
      const elRect = activeEntry.el.getBoundingClientRect();
      if (elRect.width <= 0 || elRect.height <= 0) return;

      const newTargetX = elRect.left - rootRect.left + elRect.width / 2;
      const newTargetY = elRect.top - rootRect.top + elRect.height / 2;

      const s = springsRef.current;
      s.cx.x = s.cx.t = newTargetX;
      s.cy.x = s.cy.t = newTargetY;
      s.cw.x = s.cw.t = elRect.width;
      s.ch.x = s.ch.t = elRect.height;
      s.cx.v = 0;
      s.cy.v = 0;
      s.inFlight = false;
      applyLensDOM();
    };

    window.addEventListener('resize', syncImmediate, { passive: true });
    return () => window.removeEventListener('resize', syncImmediate);
  }, [applyLensDOM]);

  useEffect(() => {
    const t = setTimeout(() => {
      triggerJumpTo(activeTargetId);
    }, 100);
    return () => clearTimeout(t);
  }, [activeTargetId, triggerJumpTo]);

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
      <div ref={rootContainerRef} className="relative w-full">
        <div
          ref={lensRef}
          className="unified-liquid-lens"
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            pointerEvents: 'none',
            zIndex: 35,
            opacity: 0,
            background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.14), rgba(37, 99, 235, 0.04))',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.9), 0 0 0 1.5px rgba(37, 99, 235, 0.42), 0 8px 22px -6px rgba(37, 99, 235, 0.22)',
            willChange: 'transform, width, height, opacity',
            transition: 'opacity 0.25s ease-out',
          }}
        />
        {children}
      </div>
    </UnifiedGlassContext.Provider>
  );
};
