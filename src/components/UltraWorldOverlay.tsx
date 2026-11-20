import React, { useEffect, useRef } from 'react';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  hue: number;
  alpha: number;
  phase: number;
  trail: { x: number; y: number }[];
}

export const UltraWorldOverlay: React.FC<{ active: boolean }> = ({ active }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const turbRef = useRef<SVGFETurbulenceElement>(null);

  useEffect(() => {
    if (!active) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let animId = 0;
    let width = window.innerWidth;
    let height = window.innerHeight;
    // Use native high DPI (capped at 3x) to deliver crystal-sharp ultra graphics
    const dpr = Math.min(window.devicePixelRatio || 2, 3);

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const pointer = {
      x: width * 0.5,
      y: height * 0.38,
      active: false,
      vx: 0,
      vy: 0,
    };

    const handlePointerMove = (e: PointerEvent) => {
      pointer.vx = e.clientX - pointer.x;
      pointer.vy = e.clientY - pointer.y;
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      pointer.active = true;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches[0]) {
        pointer.vx = e.touches[0].clientX - pointer.x;
        pointer.vy = e.touches[0].clientY - pointer.y;
        pointer.x = e.touches[0].clientX;
        pointer.y = e.touches[0].clientY;
        pointer.active = true;
      }
    };

    window.addEventListener('resize', resize, { passive: true });
    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: true });

    // 180 physics particles with trails + constellation links
    const PARTICLE_COUNT = 180;
    const particles: Particle[] = Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 1.4,
      vy: (Math.random() - 0.5) * 1.4,
      radius: 1.4 + (i % 5) * 0.85,
      hue: 198 + ((i * 19) % 88), // azure -> indigo -> violet -> cyan spectrum
      alpha: 0.35 + (i % 4) * 0.14,
      phase: Math.random() * Math.PI * 2,
      trail: [],
    }));

    let time = 0;

    const renderFrame = () => {
      time += 0.016;

      // Animate SVG turbulence frequency smoothly for real-time optical refraction
      if (turbRef.current) {
        const fx = 0.012 + Math.sin(time * 0.7) * 0.004;
        const fy = 0.016 + Math.cos(time * 0.6) * 0.004;
        turbRef.current.setAttribute('baseFrequency', `${fx.toFixed(4)} ${fy.toFixed(4)}`);
      }

      ctx.clearRect(0, 0, width, height);

      // 1. Multi-pass volumetric aurora silk waves (6 layered harmonic fields)
      for (let layer = 0; layer < 6; layer++) {
        ctx.save();
        ctx.beginPath();
        const baseY = height * (0.16 + layer * 0.14);
        const amp = 32 + layer * 10;
        const freq = 0.0032 + layer * 0.0007;
        const speed = time * (0.65 + layer * 0.15);

        ctx.moveTo(0, height);
        for (let x = 0; x <= width; x += 18) {
          const ptrDist = Math.hypot(x - pointer.x, baseY - pointer.y);
          const ptrInfluence = Math.max(0, 1 - ptrDist / 320) * 34;
          const y =
            baseY +
            Math.sin(x * freq + speed) * amp +
            Math.cos(x * freq * 1.7 - speed * 0.8) * (amp * 0.45) +
            Math.sin(ptrDist * 0.025 - time * 4) * ptrInfluence;
          ctx.lineTo(x, y);
        }
        ctx.lineTo(width, height);
        ctx.closePath();

        const grad = ctx.createLinearGradient(0, baseY - amp, width, baseY + amp + 140);
        const h1 = 204 + layer * 14;
        const h2 = 248 + layer * 10;
        grad.addColorStop(0, `hsla(${h1}, 92%, 68%, 0.075)`);
        grad.addColorStop(0.5, `hsla(${h2}, 86%, 72%, 0.055)`);
        grad.addColorStop(1, `hsla(${h1 + 30}, 90%, 75%, 0.02)`);
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.restore();
      }

      // 2. Volumetric caustic pointer lens glow
      const glowGrad = ctx.createRadialGradient(
        pointer.x,
        pointer.y,
        8,
        pointer.x,
        pointer.y,
        290
      );
      glowGrad.addColorStop(0, 'rgba(56, 189, 248, 0.20)');
      glowGrad.addColorStop(0.35, 'rgba(99, 102, 241, 0.12)');
      glowGrad.addColorStop(0.7, 'rgba(168, 85, 247, 0.05)');
      glowGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.arc(pointer.x, pointer.y, 290, 0, Math.PI * 2);
      ctx.fill();

      // 3. Physics particles with gravitational swirl, damping, and motion trails
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        // Harmonic fluid force field
        const angle =
          Math.sin(p.x * 0.004 + time * 0.9) * Math.PI +
          Math.cos(p.y * 0.004 - time * 0.7) * Math.PI;
        p.vx += Math.cos(angle) * 0.035;
        p.vy += Math.sin(angle) * 0.035;

        // Pointer gravitational vortex + gentle core repulsion
        const dx = pointer.x - p.x;
        const dy = pointer.y - p.y;
        const distSq = dx * dx + dy * dy;
        if (distSq < 90000 && distSq > 16) {
          const dist = Math.sqrt(distSq);
          const force = (1 - dist / 300) * 0.32;
          // Tangential swirl + radial pull
          p.vx += (dx / dist) * force * 0.65 - (dy / dist) * force * 0.45;
          p.vy += (dy / dist) * force * 0.65 + (dx / dist) * force * 0.45;
        }

        // Damping & max speed clamp
        p.vx *= 0.965;
        p.vy *= 0.965;
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < -20) p.x = width + 20;
        if (p.x > width + 20) p.x = -20;
        if (p.y < -20) p.y = height + 20;
        if (p.y > height + 20) p.y = -20;

        p.trail.push({ x: p.x, y: p.y });
        if (p.trail.length > 7) p.trail.shift();

        // Draw ribbon trail
        if (p.trail.length > 1) {
          ctx.beginPath();
          ctx.moveTo(p.trail[0].x, p.trail[0].y);
          for (let t = 1; t < p.trail.length; t++) {
            ctx.lineTo(p.trail[t].x, p.trail[t].y);
          }
          ctx.strokeStyle = `hsla(${p.hue}, 88%, 58%, ${p.alpha * 0.45})`;
          ctx.lineWidth = p.radius * 0.7;
          ctx.stroke();
        }

        // Draw refractive orb
        ctx.save();
        ctx.shadowBlur = 14;
        ctx.shadowColor = `hsla(${p.hue}, 95%, 60%, 0.75)`;
        ctx.fillStyle = `hsla(${p.hue}, 92%, 62%, ${p.alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius + Math.sin(time * 3 + p.phase) * 0.45, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // 4. Spatial proximity neural-crystal mesh links (O(N^2) heavy GPU/CPU showcase)
      const maxLinkDist = 118;
      const maxLinkSq = maxLinkDist * maxLinkDist;
      ctx.lineWidth = 0.85;
      for (let i = 0; i < particles.length; i++) {
        const a = particles[i];
        for (let j = i + 1; j < particles.length; j++) {
          const b = particles[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dSq = dx * dx + dy * dy;
          if (dSq < maxLinkSq) {
            const strength = 1 - Math.sqrt(dSq) / maxLinkDist;
            ctx.strokeStyle = `rgba(59, 130, 246, ${(strength * 0.24).toFixed(3)})`;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }

      animId = requestAnimationFrame(renderFrame);
    };

    animId = requestAnimationFrame(renderFrame);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('touchmove', handleTouchMove);
    };
  }, [active]);

  if (!active) return null;

  return (
    <>
      {/* Real-time optical SVG refraction filter for glass lenses */}
      <svg
        aria-hidden="true"
        style={{ position: 'fixed', width: 0, height: 0, pointerEvents: 'none' }}
      >
        <defs>
          <filter id="ultra-liquid-refract" x="-15%" y="-15%" width="130%" height="130%">
            <feTurbulence
              ref={turbRef}
              type="fractalNoise"
              baseFrequency="0.012 0.016"
              numOctaves="3"
              seed="7"
              result="noise"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="noise"
              scale="18"
              xChannelSelector="R"
              yChannelSelector="G"
              result="displaced"
            />
            <feGaussianBlur in="displaced" stdDeviation="0.4" />
          </filter>
        </defs>
      </svg>

      {/* Full-viewport volumetric physics cosmos */}
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="fixed inset-0 pointer-events-none z-0"
      />
    </>
  );
};
