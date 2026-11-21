import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

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
    // 5. Pass C: Procedural 3D Holographic Crystal Gyroscope & Shards
    // ------------------------------------------------------------------
    const gyroGroup = new THREE.Group();
    gyroGroup.position.set(2.9, 0.35, -1.6);
    scene.add(gyroGroup);

    const crystalCoreGeo = new THREE.IcosahedronGeometry(1.42, 1);
    const crystalCoreMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#60a5fa'),
      metalness: 0.25,
      roughness: 0.05,
      iridescence: 1.0,
      iridescenceIOR: 1.75,
      clearcoat: 1.0,
      clearcoatRoughness: 0.04,
      emissive: new THREE.Color('#1d4ed8'),
      emissiveIntensity: 0.42,
      flatShading: true,
    });
    const crystalCore = new THREE.Mesh(crystalCoreGeo, crystalCoreMat);
    gyroGroup.add(crystalCore);

    const wireframeGeo = new THREE.IcosahedronGeometry(1.66, 1);
    const wireframeMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#38bdf8'),
      wireframe: true,
      transparent: true,
      opacity: 0.36,
    });
    const crystalWire = new THREE.Mesh(wireframeGeo, wireframeMat);
    gyroGroup.add(crystalWire);

    const ringSpecs = [
      { radius: 2.35, tube: 0.045, color: '#38bdf8', emissive: '#0284c7', rot: [0.65, 0.3, 0] },
      { radius: 2.85, tube: 0.036, color: '#a855f7', emissive: '#7e22ce', rot: [-0.55, 0.9, 0.4] },
      { radius: 3.35, tube: 0.028, color: '#60a5fa', emissive: '#2563eb', rot: [1.1, -0.45, 0.7] },
    ];

    const gyroRings: THREE.Mesh[] = [];
    const ringGeoList: THREE.BufferGeometry[] = [];
    const ringMatList: THREE.Material[] = [];

    ringSpecs.forEach(spec => {
      const geo = new THREE.TorusGeometry(spec.radius, spec.tube, 20, 110);
      const mat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(spec.color),
        metalness: 0.85,
        roughness: 0.12,
        iridescence: 1.0,
        clearcoat: 1.0,
        emissive: new THREE.Color(spec.emissive),
        emissiveIntensity: 0.75,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.set(spec.rot[0], spec.rot[1], spec.rot[2]);
      gyroGroup.add(mesh);
      gyroRings.push(mesh);
      ringGeoList.push(geo);
      ringMatList.push(mat);
    });

    // 64 Instanced Floating Iridescent Crystal Shards
    const SHARD_COUNT = isSoftwareGl ? 18 : 64;
    const shardGeo = new THREE.OctahedronGeometry(0.22, 0);
    const shardMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#e0f2fe'),
      metalness: 0.35,
      roughness: 0.08,
      iridescence: 1.0,
      iridescenceIOR: 1.9,
      clearcoat: 1.0,
      emissive: new THREE.Color('#3b82f6'),
      emissiveIntensity: 0.28,
    });
    const shardsMesh = new THREE.InstancedMesh(shardGeo, shardMat, SHARD_COUNT);
    scene.add(shardsMesh);

    const shardData = Array.from({ length: SHARD_COUNT }, (_, i) => {
      const orbitR = 3.2 + (i % 7) * 1.15;
      const angle = (i / SHARD_COUNT) * Math.PI * 2;
      const yOffset = ((i % 9) - 4) * 0.92;
      const speed = 0.14 + (i % 5) * 0.045;
      const scale = 0.55 + (i % 4) * 0.36;
      const c = palette[i % palette.length];
      shardsMesh.setColorAt(i, c);
      return { orbitR, angle, yOffset, speed, scale, tiltPhase: i * 0.73 };
    });
    if (shardsMesh.instanceColor) shardsMesh.instanceColor.needsUpdate = true;

    // Lighting for 3D Physical Crystals
    const ambientLight = new THREE.AmbientLight('#93c5fd', 0.65);
    scene.add(ambientLight);

    const lightCyan = new THREE.PointLight('#38bdf8', 22, 26);
    lightCyan.position.set(4, 3, 4);
    scene.add(lightCyan);

    const lightViolet = new THREE.PointLight('#a855f7', 20, 26);
    lightViolet.position.set(-5, -2.5, 3);
    scene.add(lightViolet);

    const lightCursor = new THREE.PointLight('#60a5fa', 16, 18);
    lightCursor.position.set(0, 0, 5);
    scene.add(lightCursor);

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
        0.68, // radiant bloom strength
        0.52, // halo radius
        0.42  // threshold so aurora & crystals bloom without washing out dark void
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
      px: width * 0.5,
      py: height * 0.45,
      speed: 0,
      clickAge: 99,
      clickNormX: 0.5,
      clickNormY: 0.5,
    };

    const updatePointerTarget = (clientX: number, clientY: number) => {
      const nx = clientX / Math.max(width, 1);
      const ny = 1.0 - clientY / Math.max(height, 1);
      const dist = Math.hypot(nx - pointer.targetNormX, ny - pointer.targetNormY);
      pointer.speed = Math.min(pointer.speed + dist * 6.5, 1.4);
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
      pointer.clickNormX = nx;
      pointer.clickNormY = ny;
      pointer.clickAge = 0.001;

      auroraUniforms.uClickPos.value.set(nx, ny);
      particleUniforms.uClickWorld.value.set((nx - 0.5) * 14, (ny - 0.5) * 8.5, 0);

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

      // Smooth pointer interpolation
      pointer.normX += (pointer.targetNormX - pointer.normX) * 0.085;
      pointer.normY += (pointer.targetNormY - pointer.normY) * 0.085;
      pointer.speed *= 0.92;
      if (pointer.clickAge < 3.0) {
        pointer.clickAge += dt;
      }

      // Sync CSS radial spotlight variables for frosted glass surface sheen
      const rootStyle = document.documentElement.style;
      rootStyle.setProperty('--ultra-mx', `${pointer.px.toFixed(0)}px`);
      rootStyle.setProperty('--ultra-my', `${pointer.py.toFixed(0)}px`);
      rootStyle.setProperty('--ultra-mx-pct', `${(pointer.normX * 100).toFixed(1)}%`);
      rootStyle.setProperty('--ultra-my-pct', `${((1 - pointer.normY) * 100).toFixed(1)}%`);

      // Subtle dynamic SVG optical refraction frequency
      if (turbRef.current) {
        const fx = 0.011 + Math.sin(elapsed * 0.8) * 0.004;
        const fy = 0.015 + Math.cos(elapsed * 0.7) * 0.004;
        turbRef.current.setAttribute('baseFrequency', `${fx.toFixed(4)} ${fy.toFixed(4)}`);
      }

      // Update GLSL uniforms
      auroraUniforms.uTime.value = elapsed;
      auroraUniforms.uMouse.value.set(pointer.normX, pointer.normY);
      auroraUniforms.uMouseSpeed.value = pointer.speed;
      auroraUniforms.uClickAge.value = pointer.clickAge;

      const worldPtrX = (pointer.normX - 0.5) * 14.0;
      const worldPtrY = (pointer.normY - 0.5) * 8.5;
      particleUniforms.uTime.value = elapsed;
      particleUniforms.uMouseWorld.value.set(worldPtrX, worldPtrY, 0);
      particleUniforms.uClickAge.value = pointer.clickAge;

      // Smooth 3D camera parallax
      camera.position.x += (worldPtrX * 0.075 - camera.position.x) * 0.05;
      camera.position.y += (worldPtrY * 0.075 + 0.25 - camera.position.y) * 0.05;
      camera.lookAt(0, 0, -1.5);

      // Animate 3D Holographic Crystal Gyroscope
      gyroGroup.position.y = 0.35 + Math.sin(elapsed * 0.9) * 0.28;
      crystalCore.rotation.x = elapsed * 0.42 + worldPtrY * 0.08;
      crystalCore.rotation.y = elapsed * 0.56 + worldPtrX * 0.08;
      crystalWire.rotation.x = -elapsed * 0.28;
      crystalWire.rotation.y = -elapsed * 0.38;

      if (gyroRings[0]) {
        gyroRings[0].rotation.x += dt * 0.75;
        gyroRings[0].rotation.y += dt * 0.35;
      }
      if (gyroRings[1]) {
        gyroRings[1].rotation.y -= dt * 0.82;
        gyroRings[1].rotation.z += dt * 0.45;
      }
      if (gyroRings[2]) {
        gyroRings[2].rotation.x -= dt * 0.55;
        gyroRings[2].rotation.z -= dt * 0.65;
      }

      // Update 64 Instanced Floating Crystal Shards
      for (let i = 0; i < SHARD_COUNT; i++) {
        const s = shardData[i];
        const a = s.angle + elapsed * s.speed;
        const bob = Math.sin(elapsed * 1.4 + s.tiltPhase) * 0.45;
        dummy.position.set(
          Math.cos(a) * s.orbitR,
          s.yOffset + bob,
          Math.sin(a) * s.orbitR - 2.6
        );
        dummy.rotation.set(
          elapsed * 0.9 + s.tiltPhase,
          elapsed * 1.15 + s.tiltPhase * 0.5,
          elapsed * 0.5
        );
        dummy.scale.setScalar(s.scale);
        dummy.updateMatrix();
        shardsMesh.setMatrixAt(i, dummy.matrix);
      }
      shardsMesh.instanceMatrix.needsUpdate = true;

      // Orbit colored lights + cursor light
      lightCyan.position.set(Math.cos(elapsed * 0.6) * 5.5, Math.sin(elapsed * 0.8) * 3.5, 4.0);
      lightViolet.position.set(Math.sin(elapsed * 0.5) * -5.5, Math.cos(elapsed * 0.7) * 3.2, 3.5);
      lightCursor.position.set(worldPtrX * 0.7, worldPtrY * 0.7, 4.5);

      // Update chromatic aberration dynamically on cursor motion & clicks
      if (chromaticPass) {
        const clickSpike = pointer.clickAge < 1.0 ? (1.0 - pointer.clickAge) * 0.0045 : 0;
        chromaticPass.uniforms.uAberration.value =
          0.0018 + Math.min(pointer.speed * 0.0035, 0.004) + clickSpike;
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
      crystalCoreGeo.dispose();
      crystalCoreMat.dispose();
      wireframeGeo.dispose();
      wireframeMat.dispose();
      ringGeoList.forEach(g => g.dispose());
      ringMatList.forEach(m => m.dispose());
      shardGeo.dispose();
      shardMat.dispose();
      shardsMesh.dispose();
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
