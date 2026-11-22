import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  DisposableResource,
  buildExoplanetSystem,
  buildRelativisticSingularity,
  buildShockwaveRing,
  buildVolumetricNebulaWisps,
  createAsteroidSurfaceMaps,
  createSculptedAsteroidGeometry,
} from '../utils/ultraCosmosBuilders';

// ============================================================================
// GLSL SHADER 1: Fullscreen 7-Octave Domain-Warped Volumetric Aurora + Caustics
// ============================================================================
const AURORA_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.9999, 1.0);
  }
`;

const AURORA_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  varying vec2 vUv;
  uniform float uTime;
  uniform vec2 uResolution;
  uniform vec2 uMouse;
  uniform float uMouseSpeed;
  uniform vec2 uClickPos;
  uniform float uClickAge;

  // Hash & 3D Value/Simplex-like smooth noise for deep GPU volumetric clouds
  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  // 7-octave rotated FBM for intensive per-pixel GPU plasma & liquid aurora math
  float fbm(vec2 p) {
    float v = 0.0;
    float amp = 0.52;
    mat2 rot = mat2(0.80, 0.60, -0.60, 0.80);
    for (int i = 0; i < 7; i++) {
      v += amp * noise(p);
      p = rot * p * 2.04 + vec2(17.1, 31.7);
      amp *= 0.50;
    }
    return v;
  }

  // Voronoi cellular caustic interference
  float caustic(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    float minDist = 1.0;
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 neighbor = vec2(float(x), float(y));
        vec2 pt = vec2(
          hash21(i + neighbor),
          hash21(i + neighbor + vec2(37.2, 91.7))
        );
        pt = 0.5 + 0.5 * sin(uTime * 0.85 + 6.2831 * pt);
        float d = length(neighbor + pt - f);
        minDist = min(minDist, d);
      }
    }
    return pow(clamp(1.0 - minDist, 0.0, 1.0), 3.2);
  }

  void main() {
    vec2 aspect = vec2(uResolution.x / max(uResolution.y, 1.0), 1.0);
    vec2 uv = (vUv - 0.5) * aspect;
    vec2 mouseUv = (uMouse - 0.5) * aspect;
    vec2 clickUv = (uClickPos - 0.5) * aspect;

    // Gravitational magnetic lens bend toward cursor
    vec2 toMouse = uv - mouseUv;
    float mDist = length(toMouse);
    float lensPull = exp(-mDist * 3.1) * (0.14 + min(uMouseSpeed * 0.35, 0.16));
    uv -= normalize(toMouse + 0.0001) * lensPull;

    // Expanding electromagnetic shockwave ripple on click
    float shock = 0.0;
    if (uClickAge > 0.0 && uClickAge < 2.2) {
      float cDist = length(uv - clickUv);
      float ringRadius = uClickAge * 0.85;
      float ringBand = exp(-pow((cDist - ringRadius) * 18.0, 2.0));
      shock = ringBand * (1.0 - uClickAge / 2.2);
      uv += normalize(uv - clickUv + 0.0001) * shock * 0.045;
    }

    // Triple domain-warped FBM liquid fluid field
    float t = uTime * 0.16;
    vec2 q = vec2(
      fbm(uv * 2.1 + vec2(0.0, t)),
      fbm(uv * 2.1 + vec2(5.2, -t * 0.85))
    );
    vec2 r = vec2(
      fbm(uv * 2.6 + 3.8 * q + vec2(1.7, 9.2) + t * 0.55),
      fbm(uv * 2.6 + 3.8 * q + vec2(8.3, 2.8) - t * 0.48)
    );
    float f = fbm(uv * 2.4 + 3.2 * r + vec2(t * 0.2, -t * 0.15));

    // Caustic light filaments
    float c1 = caustic(uv * 4.5 + q * 1.4 - t * 0.9);
    float c2 = caustic(uv * 7.5 - r * 1.1 + t * 0.6);

    // Rich deep cosmic sapphire void -> glowing bioluminescent aurora palette
    vec3 colDeepVoid   = vec3(0.018, 0.036, 0.110);
    vec3 colNebulaBlue = vec3(0.045, 0.140, 0.390);
    vec3 colCyanPlasma = vec3(0.110, 0.680, 0.980);
    vec3 colVioletGlow = vec3(0.490, 0.210, 0.940);
    vec3 colMagentaRim = vec3(0.860, 0.240, 0.720);

    vec3 color = mix(colDeepVoid, colNebulaBlue, clamp(f * f * 2.4, 0.0, 1.0));
    color = mix(color, colVioletGlow, clamp(length(q) * 0.72, 0.0, 1.0) * 0.68);
    color = mix(color, colCyanPlasma, clamp(r.x * r.y * 2.2, 0.0, 1.0) * 0.72);

    // Aurora harmonic ribbon beams
    float ribbon = exp(-abs(uv.y * 2.2 + sin(uv.x * 3.4 + t * 3.0 + q.x * 2.8) * 0.38) * 6.5);
    color += mix(colCyanPlasma, colMagentaRim, 0.5 + 0.5 * sin(uTime * 0.5 + uv.x * 2.0)) * ribbon * 0.55;

    // Caustic brilliance & pointer aurora halo
    color += vec3(0.18, 0.62, 1.0) * c1 * 0.24;
    color += vec3(0.65, 0.35, 1.0) * c2 * 0.14;

    float mouseHalo = exp(-mDist * 4.8) * (0.42 + min(uMouseSpeed * 0.8, 0.45));
    color += mix(colCyanPlasma, colVioletGlow, 0.38) * mouseHalo;

    // Shockwave prismatic burst
    color += vec3(0.45, 0.88, 1.0) * shock * 1.15;

    // Subtle volumetric vignette while keeping edges luminous
    float vig = 1.0 - smoothstep(0.65, 1.45, length(vUv - 0.5));
    color *= mix(0.68, 1.08, vig);

    gl_FragColor = vec4(color, 1.0);
  }
`;

// ============================================================================
// GLSL SHADER 2: 8,000-Particle GPU Curl-Noise Quantum Vortex
// ============================================================================
const PARTICLE_VERTEX_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uPixelRatio;
  uniform vec3 uMouseWorld;
  uniform vec3 uClickWorld;
  uniform float uClickAge;

  attribute float aScale;
  attribute float aPhase;
  attribute vec3 aColor;

  varying vec3 vColor;
  varying float vAlpha;

  vec3 curlOffset(vec3 p, float t) {
    float s1 = sin(p.y * 0.42 + t * 0.9 + aPhase);
    float c1 = cos(p.z * 0.42 - t * 0.75);
    float s2 = sin(p.z * 0.45 + t * 0.85);
    float c2 = cos(p.x * 0.45 - t * 0.7);
    float s3 = sin(p.x * 0.38 + t * 0.95);
    float c3 = cos(p.y * 0.38 - t * 0.8);
    return vec3(s1 - c1, s2 - c2, s3 - c3) * 0.72;
  }

  void main() {
    vec3 pos = position;

    // Orbital galactic precession
    float ang = uTime * (0.08 + aScale * 0.03) + aPhase * 0.15;
    float ca = cos(ang);
    float sa = sin(ang);
    pos.xz = mat2(ca, -sa, sa, ca) * pos.xz;

    // GPU Curl turbulence advection
    pos += curlOffset(pos, uTime);

    // Cursor magnetic vortex swirl in 3D space
    vec3 toPtr = uMouseWorld - pos;
    float pDist = length(toPtr);
    if (pDist < 5.5) {
      float strength = pow(1.0 - pDist / 5.5, 2.0);
      vec3 tangent = normalize(cross(toPtr, vec3(0.0, 0.0, 1.0)) + vec3(0.001));
      pos += normalize(toPtr + vec3(0.001)) * strength * 0.95 + tangent * strength * 1.15;
    }

    // Radial shockwave burst on click
    if (uClickAge > 0.0 && uClickAge < 1.8) {
      vec3 fromClick = pos - uClickWorld;
      float cDist = length(fromClick);
      float wave = exp(-pow((cDist - uClickAge * 6.5) * 0.7, 2.0));
      pos += normalize(fromClick + vec3(0.001)) * wave * (1.0 - uClickAge / 1.8) * 2.1;
    }

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    float pulse = 0.82 + 0.28 * sin(uTime * 2.6 + aPhase * 3.0);
    gl_PointSize = clamp((aScale * 34.0 * uPixelRatio * pulse) / max(-mvPosition.z, 1.5), 1.5, 42.0);

    vColor = aColor;
    vAlpha = smoothstep(26.0, 4.0, -mvPosition.z) * (0.55 + 0.45 * pulse);
  }
`;

const PARTICLE_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vec2 c = gl_PointCoord - vec2(0.5);
    float d = length(c);
    if (d > 0.5) discard;

    // Soft core + glowing chromatic halo bokeh
    float core = exp(-d * d * 24.0);
    float halo = pow(clamp(1.0 - d * 2.0, 0.0, 1.0), 2.4);
    float alpha = (core * 0.9 + halo * 0.45) * vAlpha;

    // Subtle spectral edge shift
    vec3 col = mix(vColor, vec3(0.85, 0.96, 1.0), core * 0.65);
    gl_FragColor = vec4(col, alpha);
  }
`;

// ============================================================================
// GLSL SHADER 3: Custom Post-Processing Chromatic Dispersion + Lens Pulse
// ============================================================================
const CHROMATIC_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    uAberration: { value: 0.0022 },
    uMouse: { value: new THREE.Vector2(0.5, 0.5) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    precision highp float;
    uniform sampler2D tDiffuse;
    uniform float uAberration;
    uniform vec2 uMouse;
    varying vec2 vUv;

    void main() {
      vec2 dir = vUv - uMouse;
      float dist = length(dir);
      vec2 offset = dir * uAberration * (0.4 + dist * 1.4);

      float r = texture2D(tDiffuse, vUv + offset).r;
      float g = texture2D(tDiffuse, vUv).g;
      float b = texture2D(tDiffuse, vUv - offset).b;
      float a = texture2D(tDiffuse, vUv).a;

      gl_FragColor = vec4(r, g, b, a);
    }
  `,
};

export const UltraWorldOverlay: React.FC<{ active: boolean }> = ({ active }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const turbRef = useRef<SVGFETurbulenceElement>(null);
  const pulseRingRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active) {
      document.documentElement.style.removeProperty('--ultra-mx');
      document.documentElement.style.removeProperty('--ultra-my');
      document.documentElement.style.removeProperty('--ultra-mx-pct');
      document.documentElement.style.removeProperty('--ultra-my-pct');
      return;
    }

    const container = mountRef.current;
    if (!container) return;

    // ------------------------------------------------------------------
    // 1. Hardware vs Software WebGL Probe (Three.js Skill Safety Pattern)
    // ------------------------------------------------------------------
    let width = window.innerWidth;
    let height = window.innerHeight;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: 'high-performance',
        alpha: false,
        stencil: false,
      });
    } catch {
      return;
    }

    const gl = renderer.getContext();
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const rendererString = debugInfo
      ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || '')
      : '';
    const isSoftwareGl = /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(rendererString);

    const dpr = isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1.5, 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    container.appendChild(renderer.domElement);

    // ------------------------------------------------------------------
    // 2. Scene, Camera & PMREM Physical Reflections
    // ------------------------------------------------------------------
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(52, width / Math.max(height, 1), 0.1, 100);
    camera.position.set(0, 0.25, 11.5);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envTarget = pmremGenerator.fromScene(roomEnv, 0.04);
    scene.environment = envTarget.texture;
    roomEnv.dispose();
    pmremGenerator.dispose();

    // ------------------------------------------------------------------
    // 3. Pass A: Fullscreen Raymarched Volumetric Liquid Aurora Shader
    // ------------------------------------------------------------------
    const auroraUniforms = {
      uTime: { value: 0 },
      uResolution: { value: new THREE.Vector2(width * dpr, height * dpr) },
      uMouse: { value: new THREE.Vector2(0.5, 0.55) },
      uMouseSpeed: { value: 0 },
      uClickPos: { value: new THREE.Vector2(0.5, 0.5) },
      uClickAge: { value: 99 },
    };

    const auroraGeo = new THREE.PlaneGeometry(2, 2);
    const auroraMat = new THREE.ShaderMaterial({
      uniforms: auroraUniforms,
      vertexShader: AURORA_VERTEX_SHADER,
      fragmentShader: AURORA_FRAGMENT_SHADER,
      depthWrite: false,
      depthTest: false,
    });
    const auroraQuad = new THREE.Mesh(auroraGeo, auroraMat);
    auroraQuad.frustumCulled = false;
    auroraQuad.renderOrder = -100;
    scene.add(auroraQuad);

    // ------------------------------------------------------------------
    // 4. Pass B: 8,000-Particle GPU Curl-Noise Quantum Vortex
    // ------------------------------------------------------------------
    const PARTICLE_COUNT = isSoftwareGl ? 1500 : 8000;
    const pPositions = new Float32Array(PARTICLE_COUNT * 3);
    const pScales = new Float32Array(PARTICLE_COUNT);
    const pPhases = new Float32Array(PARTICLE_COUNT);
    const pColors = new Float32Array(PARTICLE_COUNT * 3);

    const palette = [
      new THREE.Color('#38bdf8'), // electric cyan
      new THREE.Color('#60a5fa'), // luminous azure
      new THREE.Color('#818cf8'), // periwinkle indigo
      new THREE.Color('#c084fc'), // radiant violet
      new THREE.Color('#f472b6'), // prism magenta
    ];

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      // Spiral 3D cosmic torus + galactic cloud distribution
      const arm = i % 3;
      const radius = 1.6 + Math.pow(Math.random(), 0.72) * 11.5;
      const theta = (arm * (Math.PI * 2)) / 3 + radius * 0.58 + (Math.random() - 0.5) * 1.4;
      const ySpread = (Math.random() - 0.5) * (3.2 + radius * 0.35);

      pPositions[i * 3 + 0] = Math.cos(theta) * radius;
      pPositions[i * 3 + 1] = ySpread;
      pPositions[i * 3 + 2] = Math.sin(theta) * radius - 2.2;

      pScales[i] = 0.45 + Math.random() * 1.45;
      pPhases[i] = Math.random() * Math.PI * 2;

      const c = palette[i % palette.length];
      pColors[i * 3 + 0] = c.r;
      pColors[i * 3 + 1] = c.g;
      pColors[i * 3 + 2] = c.b;
    }

    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute('position', new THREE.BufferAttribute(pPositions, 3));
    particleGeo.setAttribute('aScale', new THREE.BufferAttribute(pScales, 1));
    particleGeo.setAttribute('aPhase', new THREE.BufferAttribute(pPhases, 1));
    particleGeo.setAttribute('aColor', new THREE.BufferAttribute(pColors, 3));

    const particleUniforms = {
      uTime: { value: 0 },
      uPixelRatio: { value: dpr },
      uMouseWorld: { value: new THREE.Vector3(0, 0, 0) },
      uClickWorld: { value: new THREE.Vector3(0, 0, 0) },
      uClickAge: { value: 99 },
    };

    const particleMat = new THREE.ShaderMaterial({
      uniforms: particleUniforms,
      vertexShader: PARTICLE_VERTEX_SHADER,
      fragmentShader: PARTICLE_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const particleCloud = new THREE.Points(particleGeo, particleMat);
    scene.add(particleCloud);

    // ------------------------------------------------------------------
    // 5. Pass C: Realistic Cosmic Formations (Zero Toy Primitives)
    // ------------------------------------------------------------------
    const disposables: DisposableResource[] = [];
    const sunDir = new THREE.Vector3(-0.75, 0.48, 0.55).normalize();

    // 5A. Volumetric Interstellar Nebula Filaments in deep background
    const nebulaWisps = buildVolumetricNebulaWisps(scene, isSoftwareGl ? 6 : 12, disposables);

    // 5B. Relativistic Kerr Black Hole & Keplerian Accretion Disk (Right Deep Space)
    const singularity = buildRelativisticSingularity(disposables);
    scene.add(singularity.group);

    // 5C. Banded Gas-Giant Exoplanet + Atmospheric Scattering + Cassini Rings (Left Deep Space)
    const exoplanet = buildExoplanetSystem(sunDir, disposables);
    scene.add(exoplanet.group);

    // 5D. 3D Relativistic Shockwave Ring (expands across 3D space on click/tap)
    const shockwave = buildShockwaveRing(scene, disposables);

    // 5E. 56 Sculpted Cratered Space Asteroids with 3D Precessing Elliptical Physics
    const ASTEROID_COUNT = isSoftwareGl ? 18 : 56;
    const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
    const { albedoMap: asteroidAlbedo, bumpMap: asteroidBump } =
      createAsteroidSurfaceMaps(maxAnisotropy);
    const asteroidGeo = createSculptedAsteroidGeometry(isSoftwareGl ? 2 : 3);
    const asteroidMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#cbd5e1'),
      map: asteroidAlbedo,
      bumpMap: asteroidBump,
      bumpScale: 0.085,
      roughness: 0.72,
      metalness: 0.42,
    });
    const asteroidsMesh = new THREE.InstancedMesh(asteroidGeo, asteroidMat, ASTEROID_COUNT);
    asteroidsMesh.frustumCulled = false;
    scene.add(asteroidsMesh);
    disposables.push(asteroidAlbedo, asteroidBump, asteroidGeo, asteroidMat, asteroidsMesh);

    const asteroidPalette = [
      new THREE.Color('#475569'), // slate basalt
      new THREE.Color('#334155'), // volcanic obsidian
      new THREE.Color('#64748b'), // iron-nickel meteorite
      new THREE.Color('#52525b'), // cosmic graphite
      new THREE.Color('#5b6e8c'), // deep silicate titanium
    ];

    const asteroidData = Array.from({ length: ASTEROID_COUNT }, (_, i) => {
      // Half orbit around the Kerr Singularity on inclined elliptical paths, half roam outer cosmic lanes
      const orbitsBlackHole = i % 2 === 0;
      const semiMajor = orbitsBlackHole
        ? 2.85 + (i % 7) * 0.72 + Math.sin(i * 1.9) * 0.35
        : 4.8 + (i % 9) * 0.92;
      const eccentricity = 0.14 + ((i * 7) % 5) * 0.08;
      const angle = (i / ASTEROID_COUNT) * Math.PI * 2 + (i % 5) * 0.41;
      const inclX = ((i % 7) - 3) * 0.24;
      const inclZ = ((i % 5) - 2) * 0.19;
      const baseSpeed = (orbitsBlackHole ? 0.24 : 0.11) + (i % 6) * 0.032;
      const baseScale = 0.15 + (i % 5) * 0.068;
      const sx = baseScale * (0.85 + ((i * 7) % 5) * 0.16);
      const sy = baseScale * (0.72 + ((i * 3) % 4) * 0.15);
      const sz = baseScale * (0.88 + ((i * 11) % 5) * 0.14);
      asteroidsMesh.setColorAt(i, asteroidPalette[i % asteroidPalette.length]);
      return {
        orbitsBlackHole,
        semiMajor,
        eccentricity,
        angle,
        inclX,
        inclZ,
        baseSpeed,
        sx,
        sy,
        sz,
        tiltPhase: i * 0.73,
        rotX: i * 0.5,
        rotY: i * 0.9,
        spinX: 0.38 + (i % 4) * 0.18,
        spinY: 0.44 + (i % 5) * 0.16,
        spinBoost: 0,
        dispX: 0,
        dispY: 0,
        dispZ: 0,
        velX: 0,
        velY: 0,
        velZ: 0,
        lastX: 0,
        lastY: 0,
        lastZ: -3.0,
      };
    });
    if (asteroidsMesh.instanceColor) asteroidsMesh.instanceColor.needsUpdate = true;

    // 5F. 44 Relativistic Micro-Meteor / Cosmic Ray Streaks
    const STREAK_COUNT = isSoftwareGl ? 12 : 44;
    const streakGeo = new THREE.PlaneGeometry(1.05, 0.015);
    const streakMat = new THREE.MeshBasicMaterial({
      color: 0xbae6fd,
      transparent: true,
      opacity: 0.48,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const streaksMesh = new THREE.InstancedMesh(streakGeo, streakMat, STREAK_COUNT);
    streaksMesh.frustumCulled = false;
    scene.add(streaksMesh);
    disposables.push(streakGeo, streakMat, streaksMesh);

    const streakData = Array.from({ length: STREAK_COUNT }, (_, i) => {
      const c = palette[i % palette.length];
      streaksMesh.setColorAt(i, c);
      return {
        laneY: ((i % 13) - 6) * 0.92 + Math.sin(i) * 0.35,
        z: -2.0 - (i % 6) * 1.45,
        speed: 4.2 + (i % 5) * 1.35,
        phase: (i * 1.93) % 24.0,
        lengthScale: 0.75 + (i % 4) * 0.52,
        tilt: -0.22 - (i % 3) * 0.07,
        progress: (i * 1.93) % 24.0,
      };
    });
    if (streaksMesh.instanceColor) streaksMesh.instanceColor.needsUpdate = true;

    // Cinematic Warm/Cool Cosmic Lighting Rig
    const hemiLight = new THREE.HemisphereLight('#7dd3fc', '#090d24', 0.72);
    scene.add(hemiLight);

    const starKeyLight = new THREE.DirectionalLight('#fef3c7', 2.45);
    starKeyLight.position.copy(sunDir).multiplyScalar(18);
    scene.add(starKeyLight);

    const lightCyan = new THREE.PointLight('#38bdf8', 24, 28);
    lightCyan.position.set(3.55, 0.35, -1.5);
    scene.add(lightCyan);

    const lightViolet = new THREE.PointLight('#a855f7', 18, 28);
    lightViolet.position.set(-5.2, -2.5, 2.5);
    scene.add(lightViolet);

    const lightCursor = new THREE.PointLight('#60a5fa', 14, 18);
    lightCursor.position.set(0, 0, 5);
    scene.add(lightCursor);

    // Pre-compile shaders on real GPUs to prevent first-frame hitch
    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // ------------------------------------------------------------------
    // 6. Pass D: Multi-Pass EffectComposer (UnrealBloom + Chromatic Lens)
    // ------------------------------------------------------------------
    let composer: EffectComposer | null = null;
    let bloomPass: UnrealBloomPass | null = null;
    let chromaticPass: ShaderPass | null = null;

    if (!isSoftwareGl) {
      composer = new EffectComposer(renderer);
      const renderPass = new RenderPass(scene, camera);
      composer.addPass(renderPass);

      bloomPass = new UnrealBloomPass(
        new THREE.Vector2(width, height),
        0.62, // cinematic accretion & photon bloom
        0.50, // smooth halo spread
        0.48  // threshold keeps planets & asteroids crisp while photon arcs glow
      );
      composer.addPass(bloomPass);

      chromaticPass = new ShaderPass(CHROMATIC_SHADER);
      composer.addPass(chromaticPass);

      const outputPass = new OutputPass();
      composer.addPass(outputPass);
    }

    // ------------------------------------------------------------------
    // 7. Pointer Parallax, CSS Optics Sync & Click Shockwaves
    // ------------------------------------------------------------------
    const pointer = {
      normX: 0.5,
      normY: 0.55,
      targetNormX: 0.5,
      targetNormY: 0.55,
      prevNormX: 0.5,
      prevNormY: 0.55,
      velX: 0,
      velY: 0,
      px: width * 0.5,
      py: height * 0.45,
      speed: 0,
      energy: 0,
      clickAge: 99,
      clickNormX: 0.5,
      clickNormY: 0.5,
      clickWorldX: 0,
      clickWorldY: 0,
    };

    const updatePointerTarget = (clientX: number, clientY: number) => {
      const nx = clientX / Math.max(width, 1);
      const ny = 1.0 - clientY / Math.max(height, 1);
      const dx = nx - pointer.targetNormX;
      const dy = ny - pointer.targetNormY;
      const dist = Math.hypot(dx, dy);
      pointer.speed = Math.min(pointer.speed + dist * 8.5, 1.8);
      pointer.velX = THREE.MathUtils.clamp(pointer.velX * 0.6 + dx * 22.0, -2.0, 2.0);
      pointer.velY = THREE.MathUtils.clamp(pointer.velY * 0.6 + dy * 22.0, -2.0, 2.0);
      pointer.targetNormX = nx;
      pointer.targetNormY = ny;
      pointer.px = clientX;
      pointer.py = clientY;
    };

    const handlePointerMove = (e: PointerEvent) => {
      updatePointerTarget(e.clientX, e.clientY);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches[0]) {
        updatePointerTarget(e.touches[0].clientX, e.touches[0].clientY);
      }
    };

    const handlePointerDown = (e: PointerEvent) => {
      const nx = e.clientX / Math.max(width, 1);
      const ny = 1.0 - e.clientY / Math.max(height, 1);
      const cwX = (nx - 0.5) * 14.0;
      const cwY = (ny - 0.5) * 8.5;
      pointer.clickNormX = nx;
      pointer.clickNormY = ny;
      pointer.clickWorldX = cwX;
      pointer.clickWorldY = cwY;
      pointer.clickAge = 0.001;
      pointer.energy = Math.min(pointer.energy + 1.05, 1.85);

      auroraUniforms.uClickPos.value.set(nx, ny);
      particleUniforms.uClickWorld.value.set(cwX, cwY, 0);

      // Launch 3D relativistic gravitational shockwave at click point
      shockwave.mesh.position.set(cwX, cwY, -1.6);
      shockwave.material.uniforms.uProgress.value = 0.01;

      // Physically blast nearby sculpted asteroids outward with angular tumble impulse!
      for (let i = 0; i < ASTEROID_COUNT; i++) {
        const aData = asteroidData[i];
        const dx = aData.lastX - cwX;
        const dy = aData.lastY - cwY;
        const dz = aData.lastZ + 2.2;
        const dist = Math.hypot(dx, dy, dz);
        if (dist < 8.5) {
          const force = Math.pow(1.0 - dist / 8.5, 1.5) * 10.5;
          const inv = 1.0 / Math.max(dist, 0.25);
          aData.velX += dx * inv * force;
          aData.velY += dy * inv * force;
          aData.velZ += (dz * inv * 0.55 - 0.25) * force;
          aData.spinBoost += force * 0.9;
        }
      }

      // Trigger crisp additive CSS optical pulse ring at click spot
      if (pulseRingRef.current) {
        const ring = pulseRingRef.current;
        ring.style.left = `${e.clientX}px`;
        ring.style.top = `${e.clientY}px`;
        ring.classList.remove('ultra-click-ring-active');
        void ring.offsetWidth;
        ring.classList.add('ultra-click-ring-active');
      }
    };

    const handleResize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      const newDpr = isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1.5, 2);

      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();

      renderer.setPixelRatio(newDpr);
      renderer.setSize(width, height);
      auroraUniforms.uResolution.value.set(width * newDpr, height * newDpr);
      particleUniforms.uPixelRatio.value = newDpr;

      if (composer && bloomPass) {
        composer.setPixelRatio(newDpr);
        composer.setSize(width, height);
        bloomPass.setSize(width, height);
      }
    };

    window.addEventListener('resize', handleResize, { passive: true });
    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('pointerdown', handlePointerDown, { passive: true });

    // ------------------------------------------------------------------
    // 8. Animation Loop + GPU Pacing Helper
    // ------------------------------------------------------------------
    let animId = 0;
    let timeoutId = 0;
    let disposed = false;
    const dummy = new THREE.Object3D();
    const clockStart = performance.now();
    let lastFrameTime = clockStart;
    let planetSpinAngle = 0;
    let simTime = 0;

    const afterDraw = (nextTick: () => void) => {
      if (disposed) return;
      if (isSoftwareGl) {
        gl.finish();
        timeoutId = window.setTimeout(() => {
          if (!disposed) animId = requestAnimationFrame(nextTick);
        }, 80);
      } else {
        animId = requestAnimationFrame(nextTick);
      }
    };

    const renderFrame = () => {
      if (disposed) return;
      const now = performance.now();
      const dt = Math.min((now - lastFrameTime) / 1000, 0.05);
      lastFrameTime = now;
      const elapsed = (now - clockStart) / 1000;

      // Frame-rate independent smooth pointer interpolation & velocity decay
      pointer.prevNormX = pointer.normX;
      pointer.prevNormY = pointer.normY;
      pointer.normX = THREE.MathUtils.damp(pointer.normX, pointer.targetNormX, 7.5, dt);
      pointer.normY = THREE.MathUtils.damp(pointer.normY, pointer.targetNormY, 7.5, dt);
      pointer.speed = THREE.MathUtils.damp(pointer.speed, 0, 4.2, dt);
      pointer.velX = THREE.MathUtils.damp(pointer.velX, 0, 5.5, dt);
      pointer.velY = THREE.MathUtils.damp(pointer.velY, 0, 5.5, dt);

      if (pointer.clickAge < 3.0) {
        pointer.clickAge += dt;
      }

      // Unified emotional cosmic energy driven by cursor speed + click shockwave
      const targetEnergy = Math.min(pointer.speed * 0.82, 1.5);
      pointer.energy = THREE.MathUtils.damp(pointer.energy, targetEnergy, 4.8, dt);
      const cosmicEnergy = pointer.energy;

      // Advance dilated shader time faster during plasma surges
      simTime += dt * (1.0 + cosmicEnergy * 1.15);

      // Sync CSS radial spotlight variables for frosted glass surface sheen
      const rootStyle = document.documentElement.style;
      rootStyle.setProperty('--ultra-mx', `${pointer.px.toFixed(0)}px`);
      rootStyle.setProperty('--ultra-my', `${pointer.py.toFixed(0)}px`);
      rootStyle.setProperty('--ultra-mx-pct', `${(pointer.normX * 100).toFixed(1)}%`);
      rootStyle.setProperty('--ultra-my-pct', `${((1 - pointer.normY) * 100).toFixed(1)}%`);

      // Dynamic SVG optical refraction frequency reacts to pointer motion
      if (turbRef.current) {
        const fx = 0.011 + Math.sin(elapsed * 0.8) * 0.004 + cosmicEnergy * 0.005;
        const fy = 0.015 + Math.cos(elapsed * 0.7) * 0.004 + cosmicEnergy * 0.005;
        turbRef.current.setAttribute('baseFrequency', `${fx.toFixed(4)} ${fy.toFixed(4)}`);
      }

      // Update GLSL background & particle uniforms
      auroraUniforms.uTime.value = simTime;
      auroraUniforms.uMouse.value.set(pointer.normX, pointer.normY);
      auroraUniforms.uMouseSpeed.value = pointer.speed;
      auroraUniforms.uClickAge.value = pointer.clickAge;

      const worldPtrX = (pointer.normX - 0.5) * 14.0;
      const worldPtrY = (pointer.normY - 0.5) * 8.5;
      particleUniforms.uTime.value = simTime;
      particleUniforms.uMouseWorld.value.set(worldPtrX, worldPtrY, 0);
      particleUniforms.uClickAge.value = pointer.clickAge;

      // Dynamic 3D Camera Flight, Roll Tilt & Warp FOV on fast motion/clicks
      camera.position.x = THREE.MathUtils.damp(camera.position.x, worldPtrX * 0.16, 4.2, dt);
      camera.position.y = THREE.MathUtils.damp(camera.position.y, worldPtrY * 0.15 + 0.25, 4.2, dt);
      camera.lookAt(worldPtrX * 0.04, worldPtrY * 0.04, -1.8);
      camera.rotation.z = THREE.MathUtils.damp(camera.rotation.z, -pointer.velX * 0.032, 6.0, dt);

      const targetFov = 52 + cosmicEnergy * 3.6;
      if (Math.abs(camera.fov - targetFov) > 0.02) {
        camera.fov = THREE.MathUtils.damp(camera.fov, targetFov, 5.5, dt);
        camera.updateProjectionMatrix();
      }

      // Expressive "Emotional" Kerr Black Hole Singularity tracking cursor + plasma surge
      singularity.diskMaterial.uniforms.uTime.value = simTime;
      singularity.diskMaterial.uniforms.uEnergy.value = cosmicEnergy;
      singularity.lensingArcMaterial.uniforms.uTime.value = simTime;
      singularity.lensingArcMaterial.uniforms.uEnergy.value = cosmicEnergy;
      singularity.haloMaterial.uniforms.uTime.value = simTime;
      singularity.haloMaterial.uniforms.uEnergy.value = cosmicEnergy;
      singularity.jetMaterials.forEach((jm) => {
        jm.uniforms.uTime.value = simTime;
        jm.uniforms.uEnergy.value = cosmicEnergy;
      });
      singularity.group.position.x = THREE.MathUtils.damp(
        singularity.group.position.x,
        3.45 - worldPtrX * 0.065,
        4.5,
        dt
      );
      singularity.group.position.y = THREE.MathUtils.damp(
        singularity.group.position.y,
        0.35 + Math.sin(elapsed * 0.6) * 0.18 - worldPtrY * 0.06,
        4.5,
        dt
      );
      singularity.group.rotation.y = THREE.MathUtils.damp(
        singularity.group.rotation.y,
        -0.34 + worldPtrX * 0.055,
        4.8,
        dt
      );
      singularity.group.rotation.x = THREE.MathUtils.damp(
        singularity.group.rotation.x,
        0.28 - worldPtrY * 0.048,
        4.8,
        dt
      );
      singularity.group.scale.setScalar(1.0 + cosmicEnergy * 0.045);
      singularity.helixGroup.rotation.y += dt * (0.75 + cosmicEnergy * 2.8);
      singularity.helixGroup.scale.setScalar(1.0 + cosmicEnergy * 0.14);
      singularity.helixMaterial.opacity = Math.min(0.36 + cosmicEnergy * 0.42, 0.92);

      // Expressive Banded Gas-Giant Exoplanet & Cassini Rings reacting to cursor & energy
      planetSpinAngle += dt * (0.11 + cosmicEnergy * 0.45);
      exoplanet.planetMesh.rotation.y = planetSpinAngle;
      if (exoplanet.planetMaterial.userData.shader) {
        exoplanet.planetMaterial.userData.shader.uniforms.uTime.value = simTime;
      }
      exoplanet.atmoMaterial.uniforms.uEnergy.value = cosmicEnergy;
      exoplanet.ringMaterial.uniforms.uEnergy.value = cosmicEnergy;
      exoplanet.ringMaterial.uniforms.uTime.value = simTime;
      exoplanet.group.position.y = THREE.MathUtils.damp(
        exoplanet.group.position.y,
        1.85 + Math.cos(elapsed * 0.42) * 0.15 - worldPtrY * 0.045,
        3.8,
        dt
      );
      exoplanet.group.rotation.y = THREE.MathUtils.damp(
        exoplanet.group.rotation.y,
        0.15 + worldPtrX * 0.042,
        3.8,
        dt
      );
      exoplanet.group.rotation.x = THREE.MathUtils.damp(
        exoplanet.group.rotation.x,
        0.22 - worldPtrY * 0.036,
        3.8,
        dt
      );
      exoplanet.ringMaterial.uniforms.uPlanetCenter.value.copy(exoplanet.group.position);

      // Update 3D Expanding Gravitational Shockwave Ring
      if (pointer.clickAge > 0 && pointer.clickAge < 1.35) {
        const p = pointer.clickAge / 1.35;
        shockwave.material.uniforms.uProgress.value = p;
        shockwave.mesh.lookAt(camera.position);
      } else {
        shockwave.material.uniforms.uProgress.value = 1.0;
      }

      // Animate Volumetric Interstellar Nebula Filaments with pointer wake drift
      for (let i = 0; i < nebulaWisps.length; i++) {
        const w = nebulaWisps[i];
        w.material.uniforms.uTime.value = simTime;
        w.material.uniforms.uEnergy.value = cosmicEnergy;
        const targetX = w.baseX + Math.sin(elapsed * 0.22 + w.driftPhase) * 0.62 - worldPtrX * 0.08;
        const targetY = w.baseY + Math.cos(elapsed * 0.18 + w.driftPhase) * 0.42 - worldPtrY * 0.08;
        w.mesh.position.x = THREE.MathUtils.damp(w.mesh.position.x, targetX, 3.2, dt);
        w.mesh.position.y = THREE.MathUtils.damp(w.mesh.position.y, targetY, 3.2, dt);
      }

      // Sculpted Asteroids: 3D Precessing Keplerian Ellipses + Pointer Gravity Vortex + Shockwave Physics
      const bhX = singularity.group.position.x;
      const bhY = singularity.group.position.y;
      const bhZ = singularity.group.position.z;

      for (let i = 0; i < ASTEROID_COUNT; i++) {
        const aData = asteroidData[i];

        // Elliptical Keplerian radius + Kepler's 2nd Law velocity boost near periapsis & Black Hole
        const e = aData.eccentricity;
        const cosA = Math.cos(aData.angle);
        const sinA = Math.sin(aData.angle);
        const r = (aData.semiMajor * (1 - e * e)) / (1 + e * cosA);
        const keplerFactor = Math.pow(aData.semiMajor / Math.max(r, 0.8), 1.35);

        aData.angle += dt * aData.baseSpeed * keplerFactor * (1.0 + cosmicEnergy * 0.45);

        // Precessing 3D inclined orbital plane
        const precess = elapsed * 0.07 + aData.tiltPhase;
        const lx = r * cosA;
        const lz = r * sinA;
        const ly =
          lx * Math.sin(aData.inclX + Math.sin(precess) * 0.18) +
          lz * Math.sin(aData.inclZ);

        const baseX = aData.orbitsBlackHole ? bhX + lx : lx * 1.15 - 0.6;
        const baseY = aData.orbitsBlackHole ? bhY + ly : ly * 1.1 + ((i % 9) - 4) * 0.42;
        const baseZ = aData.orbitsBlackHole ? bhZ + lz * 0.82 : lz * 0.85 - 4.2;

        // Interactive Pointer Gravity Tractor + Tangential Swirl
        const px = baseX + aData.dispX;
        const py = baseY + aData.dispY;
        const pdx = worldPtrX - px;
        const pdy = worldPtrY - py;
        const pDist = Math.hypot(pdx, pdy);

        if (pDist < 4.6) {
          const strength = Math.pow(1.0 - pDist / 4.6, 1.8);
          const inv = 1.0 / Math.max(pDist, 0.3);
          const swirlPower = (1.6 + pointer.speed * 7.5) * strength;
          // Tangential vortex swirl + gentle gravitational wake toward cursor momentum
          aData.velX += (-pdy * inv * swirlPower + pointer.velX * strength * 1.8) * dt;
          aData.velY += (pdx * inv * swirlPower + pointer.velY * strength * 1.8) * dt;
          aData.velZ += strength * (pointer.speed * 2.2) * dt;
          aData.spinBoost = Math.min(aData.spinBoost + strength * (2.5 + pointer.speed * 6.0) * dt, 7.5);
        }

        // Second-order spring damping back toward natural Keplerian trajectory
        const springK = 3.2;
        const damping = 2.6;
        aData.velX += (-springK * aData.dispX - damping * aData.velX) * dt;
        aData.velY += (-springK * aData.dispY - damping * aData.velY) * dt;
        aData.velZ += (-springK * aData.dispZ - damping * aData.velZ) * dt;

        aData.dispX += aData.velX * dt;
        aData.dispY += aData.velY * dt;
        aData.dispZ += aData.velZ * dt;

        aData.spinBoost = THREE.MathUtils.damp(aData.spinBoost, 0, 2.5, dt);

        const finalX = baseX + aData.dispX;
        const finalY = baseY + aData.dispY;
        const finalZ = baseZ + aData.dispZ;
        aData.lastX = finalX;
        aData.lastY = finalY;
        aData.lastZ = finalZ;

        // Tidal spin boost near Black Hole or when energized by cursor/shockwave
        const distToHole = Math.hypot(finalX - bhX, finalY - bhY, finalZ - bhZ);
        const tidalSpin = distToHole < 3.5 ? (3.5 - distToHole) * 0.7 : 0;
        const totalSpin = 1.0 + aData.spinBoost + tidalSpin;

        aData.rotX += dt * aData.spinX * totalSpin;
        aData.rotY += dt * aData.spinY * totalSpin;

        dummy.position.set(finalX, finalY, finalZ);
        dummy.rotation.set(aData.rotX, aData.rotY, aData.tiltPhase + elapsed * 0.22);
        dummy.scale.set(aData.sx, aData.sy, aData.sz);
        dummy.updateMatrix();
        asteroidsMesh.setMatrixAt(i, dummy.matrix);
      }
      asteroidsMesh.instanceMatrix.needsUpdate = true;

      // Relativistic Micro-Meteor Streaks accelerate & flare with cosmicEnergy
      for (let i = 0; i < STREAK_COUNT; i++) {
        const st = streakData[i];
        st.progress = (st.progress + dt * st.speed * (1.0 + cosmicEnergy * 1.45)) % 24.0;
        const x = -12.0 + st.progress;
        const y = st.laneY + st.progress * Math.tan(st.tilt);
        dummy.position.set(x, y, st.z);
        dummy.rotation.set(0, 0, st.tilt);
        const fade = Math.sin(Math.min(Math.max(st.progress / 24.0, 0), 1) * Math.PI);
        dummy.scale.set(
          st.lengthScale * (0.45 + fade * 0.95 + cosmicEnergy * 0.65),
          0.75 + fade * 0.65 + cosmicEnergy * 0.45,
          1
        );
        dummy.updateMatrix();
        streaksMesh.setMatrixAt(i, dummy.matrix);
      }
      streaksMesh.instanceMatrix.needsUpdate = true;

      // Orbit accretion lights + dynamic cursor key light
      lightCyan.position.set(bhX + Math.cos(simTime * 0.65) * 2.4, bhY + Math.sin(simTime * 0.75) * 1.6, -1.2);
      lightCyan.intensity = 24 + cosmicEnergy * 24;
      lightViolet.position.set(Math.sin(elapsed * 0.45) * -5.2, Math.cos(elapsed * 0.55) * 2.8, 2.5);
      lightViolet.intensity = 18 + cosmicEnergy * 18;
      lightCursor.position.set(worldPtrX * 0.85, worldPtrY * 0.85, 4.2);
      lightCursor.intensity = 16 + cosmicEnergy * 32;

      // Dynamic Bloom & Chromatic Aberration Surge
      if (bloomPass) {
        bloomPass.strength = THREE.MathUtils.damp(bloomPass.strength, 0.62 + cosmicEnergy * 0.34, 6.0, dt);
      }
      if (chromaticPass) {
        const clickSpike = pointer.clickAge < 1.0 ? (1.0 - pointer.clickAge) * 0.0055 : 0;
        chromaticPass.uniforms.uAberration.value =
          0.0018 + Math.min(pointer.speed * 0.0042, 0.005) + clickSpike;
        chromaticPass.uniforms.uMouse.value.set(pointer.normX, pointer.normY);
      }

      if (composer) {
        composer.render();
      } else {
        renderer.render(scene, camera);
      }

      afterDraw(renderFrame);
    };

    animId = requestAnimationFrame(renderFrame);

    // ------------------------------------------------------------------
    // 9. Complete WebGL Disposal on Mode Switch / Unmount
    // ------------------------------------------------------------------
    return () => {
      disposed = true;
      cancelAnimationFrame(animId);
      clearTimeout(timeoutId);

      window.removeEventListener('resize', handleResize);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('pointerdown', handlePointerDown);

      document.documentElement.style.removeProperty('--ultra-mx');
      document.documentElement.style.removeProperty('--ultra-my');
      document.documentElement.style.removeProperty('--ultra-mx-pct');
      document.documentElement.style.removeProperty('--ultra-my-pct');

      auroraGeo.dispose();
      auroraMat.dispose();
      particleGeo.dispose();
      particleMat.dispose();
      disposables.forEach((res) => res.dispose());
      envTarget.dispose();

      if (bloomPass) bloomPass.dispose();
      if (composer) composer.dispose();
      renderer.dispose();

      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [active]);

  if (!active) return null;

  return (
    <>
      {/* Optical SVG liquid displacement filter for glass accents */}
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
              scale="20"
              xChannelSelector="R"
              yChannelSelector="G"
              result="displaced"
            />
            <feGaussianBlur in="displaced" stdDeviation="0.45" />
          </filter>
        </defs>
      </svg>

      {/* Full-viewport 3D WebGL2 + GLSL Raymarched Cosmos */}
      <div
        ref={mountRef}
        aria-hidden="true"
        className="fixed inset-0 pointer-events-none z-0 overflow-hidden"
      />

      {/* Pointer Specular Caustic Lens & Click Diffraction Ring */}
      <div aria-hidden="true" className="ultra-pointer-lens fixed inset-0 pointer-events-none z-[1]" />
      <div ref={pulseRingRef} aria-hidden="true" className="ultra-click-ring pointer-events-none z-[2]" />
    </>
  );
};
