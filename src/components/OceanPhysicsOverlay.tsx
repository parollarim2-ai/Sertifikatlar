import React, { useEffect, useRef } from 'react';

type EntityKind = 'orb' | 'crystal' | 'spark';

interface PhysicsEntity {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  hue: number;
  lightness: number;
  alpha: number;
  phase: number;
  angle: number;
  spin: number;
  kind: EntityKind;
  trail: { x: number; y: number }[];
}

interface RippleWave {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  alpha: number;
}

export const OceanPhysicsOverlay: React.FC<{ active: boolean }> = ({ active }) => {
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
    const dpr = Math.min(window.devicePixelRatio || 1.5, 2);

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
      y: height * 0.42,
      vx: 0,
      vy: 0,
      speed: 0,
      active: false,
    };

    const ripples: RippleWave[] = [];

    const spawnRipple = (x: number, y: number, maxRadius = 280) => {
      ripples.push({ x, y, radius: 10, maxRadius, alpha: 0.72 });
      if (ripples.length > 8) ripples.shift();
    };

    const handlePointerMove = (e: PointerEvent) => {
      pointer.vx = e.clientX - pointer.x;
      pointer.vy = e.clientY - pointer.y;
      pointer.speed = Math.min(Math.hypot(pointer.vx, pointer.vy), 45);
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      pointer.active = true;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches[0]) {
        const tx = e.touches[0].clientX;
        const ty = e.touches[0].clientY;
        pointer.vx = tx - pointer.x;
        pointer.vy = ty - pointer.y;
        pointer.speed = Math.min(Math.hypot(pointer.vx, pointer.vy), 45);
        pointer.x = tx;
        pointer.y = ty;
        pointer.active = true;
      }
    };

    const handlePointerDown = (e: PointerEvent) => {
      spawnRipple(e.clientX, e.clientY, 340);
      // Radial hydrodynamic burst pushing nearby particles outward
      for (let i = 0; i < entities.length; i++) {
        const p = entities[i];
        const dx = p.x - e.clientX;
        const dy = p.y - e.clientY;
        const dist = Math.hypot(dx, dy);
        if (dist < 260 && dist > 1) {
          const push = (1 - dist / 260) * 6.5;
          p.vx += (dx / dist) * push;
          p.vy += (dy / dist) * push;
        }
      }
    };

    window.addEventListener('resize', resize, { passive: true });
    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('pointerdown', handlePointerDown, { passive: true });

    // 260 upgraded physics entities: glowing ocean orbs + rotating crystal shards + swift sparks
    const ENTITY_COUNT = 260;
    const entities: PhysicsEntity[] = Array.from({ length: ENTITY_COUNT }, (_, i) => {
      const kind: EntityKind = i % 5 === 0 ? 'crystal' : i % 7 === 0 ? 'spark' : 'orb';
      return {
        x: Math.random() * width,
        y: Math.random() * height,
        vx: 0.4 + Math.random() * 1.1,
        vy: (Math.random() - 0.5) * 0.9,
        radius:
          kind === 'crystal'
            ? 3.2 + (i % 4) * 1.1
            : kind === 'spark'
            ? 1.2 + (i % 3) * 0.55
            : 1.9 + (i % 5) * 0.85,
        hue: kind === 'spark' ? 186 + (i % 24) : 196 + ((i * 17) % 76), // turquoise -> cyan -> azure -> indigo
        lightness: kind === 'spark' ? 56 : 50 + (i % 4) * 4,
        alpha: kind === 'spark' ? 0.72 : 0.44 + (i % 4) * 0.12,
        phase: Math.random() * Math.PI * 2,
        angle: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.055,
        kind,
        trail: [],
      };
    });

    let time = 0;

    const renderFrame = () => {
      time += 0.017;
      pointer.speed *= 0.9;

      if (turbRef.current) {
        const fx = 0.011 + Math.sin(time * 0.75) * 0.0035;
        const fy = 0.015 + Math.cos(time * 0.65) * 0.0035;
        turbRef.current.setAttribute('baseFrequency', `${fx.toFixed(4)} ${fy.toFixed(4)}`);
      }

      ctx.clearRect(0, 0, width, height);

      // ------------------------------------------------------------------
      // 1. Diagonal Oceanic Sunlight Caustic Beams
      // ------------------------------------------------------------------
      for (let b = 0; b < 5; b++) {
        const bx = width * (0.12 + b * 0.21) + Math.sin(time * 0.4 + b * 1.3) * 65;
        const beamW = 90 + (b % 3) * 45;
        const beamGrad = ctx.createLinearGradient(bx - 60, 0, bx + 160, height * 0.88);
        beamGrad.addColorStop(0, 'rgba(56, 189, 248, 0.13)');
        beamGrad.addColorStop(0.55, 'rgba(99, 102, 241, 0.05)');
        beamGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');

        ctx.fillStyle = beamGrad;
        ctx.beginPath();
        ctx.moveTo(bx - beamW * 0.4, 0);
        ctx.lineTo(bx + beamW * 0.4, 0);
        ctx.lineTo(bx + beamW * 1.35 + 140, height);
        ctx.lineTo(bx - beamW * 0.25 + 80, height);
        ctx.closePath();
        ctx.fill();
      }

      // ------------------------------------------------------------------
      // 2. Strengthened 9-Layer Ocean Wave Currents + Luminous Foam Crests
      // ------------------------------------------------------------------
      const xStep = width > 1200 ? 16 : 14;
      for (let layer = 0; layer < 9; layer++) {
        const baseY = height * (0.14 + layer * 0.095);
        const amp = 24 + layer * 6.5;
        const freq = 0.0034 + layer * 0.00055;
        const flowSpeed = time * (0.85 + layer * 0.14);

        ctx.beginPath();
        const wavePts: { x: number; y: number }[] = [];

        for (let x = 0; x <= width + xStep; x += xStep) {
          const px = Math.min(x, width);
          const dxPtr = px - pointer.x;
          const dyPtr = baseY - pointer.y;
          const ptrDist = Math.hypot(dxPtr, dyPtr);
          const wakeBoost = Math.max(0, 1 - ptrDist / 300) * (24 + pointer.speed * 0.7);

          // Sum ripple offsets along wave crest
          let rippleOffset = 0;
          for (let r = 0; r < ripples.length; r++) {
            const rp = ripples[r];
            const rd = Math.hypot(px - rp.x, baseY - rp.y);
            const band = Math.exp(-Math.pow((rd - rp.radius) / 36, 2));
            rippleOffset += band * Math.sin((rd - rp.radius) * 0.12) * 18 * rp.alpha;
          }

          const y =
            baseY +
            Math.sin(px * freq + flowSpeed) * amp +
            Math.cos(px * freq * 1.85 - flowSpeed * 0.82) * (amp * 0.44) +
            Math.sin(px * freq * 3.1 + flowSpeed * 1.3) * (amp * 0.16) +
            Math.sin(ptrDist * 0.032 - time * 4.8) * wakeBoost +
            rippleOffset;

          wavePts.push({ x: px, y });
          if (x === 0) {
            ctx.moveTo(px, y);
          } else {
            ctx.lineTo(px, y);
          }
        }

        // Complete fill path down to bottom
        ctx.lineTo(width, height);
        ctx.lineTo(0, height);
        ctx.closePath();

        const h1 = 192 + layer * 8;
        const h2 = 224 + layer * 7;
        const grad = ctx.createLinearGradient(0, baseY - amp, width, baseY + amp + 190);
        grad.addColorStop(0, `hsla(${h1}, 92%, 52%, ${0.075 + layer * 0.008})`);
        grad.addColorStop(0.5, `hsla(${h2}, 86%, 56%, ${0.062 + layer * 0.006})`);
        grad.addColorStop(1, `hsla(${h2 + 18}, 88%, 62%, 0.025)`);
        ctx.fillStyle = grad;
        ctx.fill();

        // Crisp glowing ocean wave crest highlight along the wave ridge
        ctx.beginPath();
        for (let k = 0; k < wavePts.length; k++) {
          if (k === 0) ctx.moveTo(wavePts[k].x, wavePts[k].y);
          else ctx.lineTo(wavePts[k].x, wavePts[k].y);
        }
        ctx.strokeStyle = `hsla(${h1 - 4}, 96%, 62%, ${0.18 + (layer % 3) * 0.05})`;
        ctx.lineWidth = layer % 2 === 0 ? 1.65 : 1.15;
        ctx.stroke();
      }

      // ------------------------------------------------------------------
      // 3. Expanding Ocean Click Splash Ripples
      // ------------------------------------------------------------------
      for (let r = ripples.length - 1; r >= 0; r--) {
        const rp = ripples[r];
        rp.radius += 5.4;
        rp.alpha *= 0.962;
        if (rp.alpha < 0.02 || rp.radius > rp.maxRadius) {
          ripples.splice(r, 1);
          continue;
        }
        ctx.save();
        ctx.strokeStyle = `rgba(14, 165, 233, ${rp.alpha.toFixed(3)})`;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(rp.x, rp.y, rp.radius, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = `rgba(255, 255, 255, ${(rp.alpha * 0.65).toFixed(3)})`;
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.arc(rp.x, rp.y, rp.radius * 0.78, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // ------------------------------------------------------------------
      // 4. Hydrodynamic Pointer Caustic Glow
      // ------------------------------------------------------------------
      const glowRadius = 260 + pointer.speed * 2.5;
      const glowGrad = ctx.createRadialGradient(pointer.x, pointer.y, 6, pointer.x, pointer.y, glowRadius);
      glowGrad.addColorStop(0, 'rgba(14, 165, 233, 0.24)');
      glowGrad.addColorStop(0.4, 'rgba(59, 130, 246, 0.12)');
      glowGrad.addColorStop(0.75, 'rgba(99, 102, 241, 0.05)');
      glowGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.arc(pointer.x, pointer.y, glowRadius, 0, Math.PI * 2);
      ctx.fill();

      // ------------------------------------------------------------------
      // 5. Flying Physics Entities (Curl Ocean Stream + Crystals + Trails)
      // ------------------------------------------------------------------
      for (let i = 0; i < entities.length; i++) {
        const p = entities[i];

        // Flowing ocean current + localized vortex curl
        const streamAngle =
          Math.sin(p.x * 0.0038 + time * 0.95) * 0.85 +
          Math.cos(p.y * 0.0052 - time * 0.75) * 0.75;
        p.vx += Math.cos(streamAngle) * 0.048 + 0.022; // gentle rightward ocean current drift
        p.vy += Math.sin(streamAngle) * 0.042;

        // Pointer gravitational hydrodynamic vortex
        const dx = pointer.x - p.x;
        const dy = pointer.y - p.y;
        const distSq = dx * dx + dy * dy;
        if (distSq < 105000 && distSq > 16) {
          const dist = Math.sqrt(distSq);
          const force = (1 - dist / 324) * (0.34 + pointer.speed * 0.008);
          p.vx += (dx / dist) * force * 0.55 - (dy / dist) * force * 0.62;
          p.vy += (dy / dist) * force * 0.55 + (dx / dist) * force * 0.62;
        }

        // Viscous fluid damping
        p.vx *= 0.962;
        p.vy *= 0.962;
        p.x += p.vx;
        p.y += p.vy;
        p.angle += p.spin + Math.hypot(p.vx, p.vy) * 0.015;

        if (p.x < -25) {
          p.x = width + 25;
          p.trail.length = 0;
        } else if (p.x > width + 25) {
          p.x = -25;
          p.trail.length = 0;
        }
        if (p.y < -25) {
          p.y = height + 25;
          p.trail.length = 0;
        } else if (p.y > height + 25) {
          p.y = -25;
          p.trail.length = 0;
        }

        p.trail.push({ x: p.x, y: p.y });
        if (p.trail.length > 9) p.trail.shift();

        // Draw fluid motion ribbon trail
        if (p.trail.length > 1) {
          ctx.beginPath();
          ctx.moveTo(p.trail[0].x, p.trail[0].y);
          for (let t = 1; t < p.trail.length; t++) {
            ctx.lineTo(p.trail[t].x, p.trail[t].y);
          }
          ctx.strokeStyle = `hsla(${p.hue}, 92%, ${p.lightness}%, ${(p.alpha * 0.42).toFixed(3)})`;
          ctx.lineWidth = p.kind === 'crystal' ? 1.5 : p.radius * 0.72;
          ctx.stroke();
        }

        // Draw entity body
        const pulse = Math.sin(time * 3.2 + p.phase) * 0.4;
        if (p.kind === 'crystal') {
          // Rotating prism diamond shard
          const r = p.radius + pulse * 0.6;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.angle);
          ctx.fillStyle = `hsla(${p.hue}, 94%, ${p.lightness + 6}%, ${p.alpha})`;
          ctx.strokeStyle = `rgba(255, 255, 255, ${(p.alpha * 0.85).toFixed(2)})`;
          ctx.lineWidth = 0.85;
          ctx.beginPath();
          ctx.moveTo(0, -r * 1.45);
          ctx.lineTo(r * 0.82, 0);
          ctx.lineTo(0, r * 1.45);
          ctx.lineTo(-r * 0.82, 0);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        } else {
          // Luminous floating orb / spark
          const r = Math.max(0.8, p.radius + pulse * 0.45);
          ctx.fillStyle = `hsla(${p.hue}, 95%, ${p.lightness}%, ${p.alpha})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.fill();

          if (p.kind === 'orb' && p.radius > 2.6) {
            ctx.fillStyle = `hsla(${p.hue - 10}, 100%, 72%, ${(p.alpha * 0.35).toFixed(2)})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, r * 2.1, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      // ------------------------------------------------------------------
      // 6. Luminous Spatial Mesh Links (between nearby particles & pointer)
      // ------------------------------------------------------------------
      const maxLinkSq = 98 * 98;
      ctx.lineWidth = 0.85;
      for (let i = 0; i < entities.length; i++) {
        const a = entities[i];

        // Link to pointer when close
        const pdx = a.x - pointer.x;
        const pdy = a.y - pointer.y;
        const pdSq = pdx * pdx + pdy * pdy;
        if (pdSq < 21000) {
          const ps = 1 - Math.sqrt(pdSq) / 145;
          ctx.strokeStyle = `rgba(14, 165, 233, ${(ps * 0.36).toFixed(3)})`;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(pointer.x, pointer.y);
          ctx.stroke();
        }

        // Inter-particle constellation threads (skip sparks for ultra-smooth 60fps)
        if (a.kind === 'spark') continue;
        let linksForA = 0;
        for (let j = i + 1; j < entities.length; j++) {
          const b = entities[j];
          if (b.kind === 'spark') continue;
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dSq = dx * dx + dy * dy;
          if (dSq < maxLinkSq) {
            const strength = 1 - Math.sqrt(dSq) / 98;
            ctx.strokeStyle = `rgba(37, 99, 235, ${(strength * 0.22).toFixed(3)})`;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
            linksForA++;
            if (linksForA >= 4) break;
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
      window.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [active]);

  if (!active) return null;

  return (
    <>
      {/* Optical SVG liquid refraction filter for glass lenses */}
      <svg
        aria-hidden="true"
        style={{ position: 'fixed', width: 0, height: 0, pointerEvents: 'none' }}
      >
        <defs>
          <filter id="ultra-liquid-refract" x="-15%" y="-15%" width="130%" height="130%">
            <feTurbulence
              ref={turbRef}
              type="fractalNoise"
              baseFrequency="0.011 0.015"
              numOctaves="3"
              seed="7"
              result="noise"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="noise"
              scale="16"
              xChannelSelector="R"
              yChannelSelector="G"
              result="displaced"
            />
            <feGaussianBlur in="displaced" stdDeviation="0.35" />
          </filter>
        </defs>
      </svg>

      {/* Full-viewport physics ocean currents & flying crystal particles */}
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="fixed inset-0 pointer-events-none z-0"
      />
    </>
  );
};
