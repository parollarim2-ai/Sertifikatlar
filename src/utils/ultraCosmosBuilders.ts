import * as THREE from 'three';

export interface DisposableResource {
  dispose: () => void;
}

// ============================================================================
// 1. PROCEDURAL TEXTURE GENERATORS (ZERO EXTERNAL FILES / 404-SAFE)
// ============================================================================
export function createAsteroidSurfaceMaps(maxAnisotropy: number): {
  albedoMap: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
} {
  const size = 512;
  const albedoCanvas = document.createElement('canvas');
  albedoCanvas.width = size;
  albedoCanvas.height = size;
  const aCtx = albedoCanvas.getContext('2d')!;

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bCtx = bumpCanvas.getContext('2d')!;

  // Base volcanic basalt & iron-nickel grain
  aCtx.fillStyle = '#3c4456';
  aCtx.fillRect(0, 0, size, size);
  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, size, size);

  // Deterministic PRNG so textures remain consistent across mounts
  let seed = 133742;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  // Mineral strata & micro-pitting
  for (let i = 0; i < 4200; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 0.8 + rand() * 3.2;
    const shade = Math.floor(35 + rand() * 95);
    aCtx.fillStyle = `rgba(${shade}, ${shade + 6}, ${shade + 18}, 0.28)`;
    aCtx.beginPath();
    aCtx.arc(x, y, r, 0, Math.PI * 2);
    aCtx.fill();

    const bVal = Math.floor(70 + rand() * 120);
    bCtx.fillStyle = `rgba(${bVal}, ${bVal}, ${bVal}, 0.35)`;
    bCtx.beginPath();
    bCtx.arc(x, y, r, 0, Math.PI * 2);
    bCtx.fill();
  }

  // Impact craters (dark depressed bowl + raised bright rim)
  for (let i = 0; i < 65; i++) {
    const cx = rand() * size;
    const cy = rand() * size;
    const cr = 6 + rand() * 28;

    const gradA = aCtx.createRadialGradient(cx, cy, cr * 0.1, cx, cy, cr);
    gradA.addColorStop(0, 'rgba(18, 22, 32, 0.55)');
    gradA.addColorStop(0.72, 'rgba(34, 40, 56, 0.38)');
    gradA.addColorStop(0.9, 'rgba(110, 128, 158, 0.32)');
    gradA.addColorStop(1, 'rgba(60, 68, 86, 0)');
    aCtx.fillStyle = gradA;
    aCtx.beginPath();
    aCtx.arc(cx, cy, cr, 0, Math.PI * 2);
    aCtx.fill();

    const gradB = bCtx.createRadialGradient(cx, cy, cr * 0.1, cx, cy, cr);
    gradB.addColorStop(0, 'rgba(20, 20, 20, 0.72)');
    gradB.addColorStop(0.76, 'rgba(65, 65, 65, 0.45)');
    gradB.addColorStop(0.92, 'rgba(225, 225, 225, 0.55)');
    gradB.addColorStop(1, 'rgba(128, 128, 128, 0)');
    bCtx.fillStyle = gradB;
    bCtx.beginPath();
    bCtx.arc(cx, cy, cr, 0, Math.PI * 2);
    bCtx.fill();
  }

  // Faint cosmic silicate / iridium fracture veins
  aCtx.lineWidth = 1.1;
  for (let i = 0; i < 28; i++) {
    let x = rand() * size;
    let y = rand() * size;
    aCtx.strokeStyle = rand() > 0.45 ? 'rgba(96, 165, 250, 0.22)' : 'rgba(196, 181, 253, 0.18)';
    aCtx.beginPath();
    aCtx.moveTo(x, y);
    for (let s = 0; s < 6; s++) {
      x += (rand() - 0.5) * 44;
      y += (rand() - 0.5) * 44;
      aCtx.lineTo(x, y);
    }
    aCtx.stroke();
  }

  const albedoMap = new THREE.CanvasTexture(albedoCanvas);
  albedoMap.colorSpace = THREE.SRGBColorSpace;
  albedoMap.wrapS = THREE.RepeatWrapping;
  albedoMap.wrapT = THREE.RepeatWrapping;
  albedoMap.anisotropy = Math.min(maxAnisotropy, 8);

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.colorSpace = THREE.NoColorSpace;
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.anisotropy = Math.min(maxAnisotropy, 8);

  return { albedoMap, bumpMap };
}

// ============================================================================
// 2. SCULPTED PROCEDURAL CRATERED ASTEROID GEOMETRY
// ============================================================================
export function createSculptedAsteroidGeometry(detail: number): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(1.0, detail);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();

  // Precomputed crater centers on unit sphere for deterministic realism
  const craters = [
    new THREE.Vector3(0.75, 0.45, 0.48).normalize(),
    new THREE.Vector3(-0.68, 0.52, -0.51).normalize(),
    new THREE.Vector3(0.18, -0.84, 0.51).normalize(),
    new THREE.Vector3(-0.42, -0.35, -0.84).normalize(),
    new THREE.Vector3(0.54, -0.42, -0.73).normalize(),
    new THREE.Vector3(-0.82, -0.18, 0.54).normalize(),
  ];

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    n.copy(v).normalize();

    // Multi-octave 3D trigonometric ridge/rock deformation (zero UV seams)
    const f1 =
      Math.sin(n.x * 2.7 + 0.4) *
      Math.cos(n.y * 2.3 - 0.7) *
      Math.sin(n.z * 2.9 + 1.1);
    const f2 =
      Math.sin(n.x * 6.1 - n.z * 4.8) * 0.5 +
      Math.cos(n.y * 5.7 + n.x * 3.9) * 0.5;
    const ridge = 1.0 - Math.abs(Math.sin(n.x * 4.5 + n.y * 3.8 + n.z * 5.1));

    let radius = 0.78 + f1 * 0.22 + f2 * 0.08 + Math.pow(ridge, 2.2) * 0.14;

    // Slight triaxial asteroid elongation
    v.set(n.x * 1.18, n.y * 0.84, n.z * 0.96);

    // Carve realistic bowl craters with raised ejecta rims
    for (let c = 0; c < craters.length; c++) {
      const d = n.distanceTo(craters[c]);
      const cRad = 0.34 + (c % 3) * 0.09;
      if (d < cRad) {
        const t = d / cRad;
        // Parabolic depression inside + subtle raised rim near t = 0.85
        const bowl = -0.16 * (1.0 - t * t);
        const rim = 0.055 * Math.exp(-Math.pow((t - 0.86) * 7.0, 2.0));
        radius += bowl + rim;
      }
    }

    v.multiplyScalar(radius);
    pos.setXYZ(i, v.x, v.y, v.z);
  }

  pos.needsUpdate = true;
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

// ============================================================================
// 3. RELATIVISTIC KERR BLACK HOLE & VOLUMETRIC ACCRETION CORONA
// ============================================================================
const ACCRETION_DISK_VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vLocalPos;
  varying vec3 vWorldPos;
  void main() {
    vUv = uv;
    vLocalPos = position;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const ACCRETION_DISK_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  varying vec3 vLocalPos;
  varying vec3 vWorldPos;
  uniform float uTime;
  uniform float uInnerRadius;
  uniform float uOuterRadius;
  uniform float uEnergy;

  float hash21(vec2 p) {
    p = fract(p * vec2(234.34, 435.345));
    p += dot(p, p + 34.23);
    return fract(p.x * p.y);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
      mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p = rot * p * 2.08 + vec2(11.3, 27.9);
      a *= 0.5;
    }
    return v;
  }

  void main() {
    float r = length(vLocalPos.xy);
    float normR = clamp((r - uInnerRadius) / max(uOuterRadius - uInnerRadius, 0.001), 0.0, 1.0);
    if (normR <= 0.0 || normR >= 1.0) discard;

    float angle = atan(vLocalPos.y, vLocalPos.x);

    // Keplerian differential shear accelerates dramatically with pointer/click energy
    float keplerSpeed = (1.85 + uEnergy * 1.45) / pow(max(r * 0.45, 0.35), 1.3);
    float spiralAngle = angle + uTime * keplerSpeed - log(max(r, 0.2)) * (5.2 + uEnergy * 1.2);

    // Seamless polar coordinates for swirling plasma filaments
    vec2 polarUv = vec2(cos(spiralAngle), sin(spiralAngle)) * (1.2 + normR * 3.4);
    float n1 = fbm(polarUv * 2.1 + vec2(uTime * 0.16, -uTime * 0.12));
    float n2 = fbm(polarUv * 4.8 - vec2(uTime * 0.24, uTime * 0.18) + n1 * 1.45);

    // Concentric resonant dust lanes & glowing plasma arcs
    float rings = 0.55 + 0.45 * sin(normR * 26.0 + n1 * 4.5 - uTime * (1.1 + uEnergy * 1.5));
    float filaments = smoothstep(0.20, 0.88, n2 * 0.72 + rings * 0.42);

    // Relativistic Doppler beaming (approaching side glows brighter & bluer)
    float doppler = 0.74 + 0.62 * cos(angle - 0.55);

    // Hot white-cyan ISCO -> electric cyan -> cosmic violet -> deep magenta-ember
    vec3 colInnerHot = vec3(0.92, 0.98, 1.00);
    vec3 colPlasmaCyan = vec3(0.18, 0.78, 1.00);
    vec3 colVioletArc = vec3(0.58, 0.28, 0.98);
    vec3 colOuterDust = vec3(0.92, 0.28, 0.62);

    vec3 col = mix(colInnerHot, colPlasmaCyan, smoothstep(0.0, 0.24, normR));
    col = mix(col, colVioletArc, smoothstep(0.22, 0.65, normR));
    col = mix(col, colOuterDust, smoothstep(0.60, 0.96, normR));
    col = mix(col, colInnerHot, clamp(uEnergy * 0.35, 0.0, 0.45) * (1.0 - normR));

    // ISCO inner photon spike + smooth outer horizon fade
    float innerSpike = exp(-normR * 11.0) * (1.35 + uEnergy * 0.95);
    float radialFade = smoothstep(0.0, 0.06, normR) * pow(1.0 - normR, 1.45);
    float flareBoost = 1.0 + uEnergy * 0.75;
    float alpha = clamp((filaments * 0.88 + innerSpike) * radialFade * doppler * flareBoost, 0.0, 1.0);

    gl_FragColor = vec4(col * (1.08 + innerSpike * 1.15) * doppler * flareBoost, alpha * 0.90);
  }
`;

const PHOTON_HALO_VERT = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vViewPos;
  varying vec3 vLocalPos;
  void main() {
    vLocalPos = position;
    vNormal = normalize(normalMatrix * normal);
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    vViewPos = -mvPos.xyz;
    gl_Position = projectionMatrix * mvPos;
  }
`;

const PHOTON_HALO_FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vNormal;
  varying vec3 vViewPos;
  varying vec3 vLocalPos;
  uniform float uTime;
  uniform float uEnergy;

  void main() {
    vec3 viewDir = normalize(vViewPos);
    float ndotv = abs(dot(normalize(vNormal), viewDir));
    // Razor-sharp photon ring right at the grazing limb + softer gravitational lensing corona
    float photonRing = pow(1.0 - ndotv, 6.0 - min(uEnergy * 1.6, 2.2));
    float softCorona = pow(1.0 - ndotv, 2.4) * (0.35 + uEnergy * 0.35);

    float shimmer = 0.86 + 0.14 * sin(vLocalPos.x * 5.0 + vLocalPos.y * 4.0 + uTime * (2.5 + uEnergy * 3.5));
    float dopplerRim = 0.8 + 0.35 * normalize(vLocalPos).x;

    vec3 ringColor = mix(vec3(0.32, 0.78, 1.0), vec3(0.78, 0.45, 1.0), 0.38 + 0.28 * sin(uTime * 0.9 + vLocalPos.y * 2.0));
    vec3 coreRim = vec3(0.96, 0.99, 1.0);

    vec3 finalCol = mix(ringColor, coreRim, smoothstep(0.42, 0.95, photonRing)) * shimmer * dopplerRim * (1.0 + uEnergy * 0.75);
    float alpha = clamp((photonRing * 1.45 + softCorona) * shimmer, 0.0, 1.0);

    gl_FragColor = vec4(finalCol, alpha);
  }
`;

const JET_VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewPos;
  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    vViewPos = -mvPos.xyz;
    gl_Position = projectionMatrix * mvPos;
  }
`;

const JET_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewPos;
  uniform float uTime;
  uniform float uDir;
  uniform float uEnergy;

  void main() {
    vec3 viewDir = normalize(vViewPos);
    float edgeFade = pow(abs(dot(normalize(vNormal), viewDir)), 1.65);

    // Distance along polar axis (0 near core -> 1 at tip)
    float along = uDir > 0.0 ? vUv.y : (1.0 - vUv.y);
    float pulse = 0.72 + 0.28 * sin(along * 18.0 - uTime * (4.2 + uEnergy * 6.0));
    float spiral = 0.65 + 0.35 * sin(vUv.x * 12.566 + along * 8.0 - uTime * (2.6 + uEnergy * 3.5));

    float fadeEnds = smoothstep(0.0, 0.14, along) * pow(1.0 - along, 1.75);
    vec3 col = mix(vec3(0.58, 0.90, 1.0), vec3(0.56, 0.30, 0.98), along * 0.85) * (1.0 + uEnergy * 0.85);
    float alpha = edgeFade * fadeEnds * pulse * spiral * (0.44 + uEnergy * 0.42);

    gl_FragColor = vec4(col, alpha);
  }
`;

export interface SingularityRig {
  group: THREE.Group;
  diskMaterial: THREE.ShaderMaterial;
  lensingArcMaterial: THREE.ShaderMaterial;
  haloMaterial: THREE.ShaderMaterial;
  jetMaterials: THREE.ShaderMaterial[];
  helixGroup: THREE.Group;
  helixMaterial: THREE.MeshBasicMaterial;
}

export function buildRelativisticSingularity(disposables: DisposableResource[]): SingularityRig {
  const group = new THREE.Group();
  group.position.set(3.45, 0.35, -3.4);
  group.rotation.set(0.28, -0.34, -0.22);

  // 1. Pitch-black Event Horizon Core
  const horizonGeo = new THREE.SphereGeometry(1.02, 64, 64);
  const horizonMat = new THREE.MeshBasicMaterial({
    color: 0x010206,
    toneMapped: false,
  });
  const horizonMesh = new THREE.Mesh(horizonGeo, horizonMat);
  group.add(horizonMesh);
  disposables.push(horizonGeo, horizonMat);

  // 2. Relativistic Photon Sphere & Gravitational Lensing Corona
  const haloGeo = new THREE.SphereGeometry(1.18, 64, 64);
  const haloMaterial = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uEnergy: { value: 0 } },
    vertexShader: PHOTON_HALO_VERT,
    fragmentShader: PHOTON_HALO_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.FrontSide,
  });
  const haloMesh = new THREE.Mesh(haloGeo, haloMaterial);
  group.add(haloMesh);
  disposables.push(haloGeo, haloMaterial);

  // 3. Primary Equatorial Relativistic Accretion Disk
  const diskGeo = new THREE.RingGeometry(1.16, 4.95, 160, 12);
  const diskMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uInnerRadius: { value: 1.16 },
      uOuterRadius: { value: 4.95 },
      uEnergy: { value: 0 },
    },
    vertexShader: ACCRETION_DISK_VERT,
    fragmentShader: ACCRETION_DISK_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const diskMesh = new THREE.Mesh(diskGeo, diskMaterial);
  diskMesh.rotation.x = Math.PI * 0.44;
  group.add(diskMesh);
  disposables.push(diskGeo, diskMaterial);

  // 4. Secondary Gravitational Lensing Einstein Arc (light bent above/below horizon)
  const lensingArcGeo = new THREE.RingGeometry(1.09, 2.22, 128, 8);
  const lensingArcMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uInnerRadius: { value: 1.09 },
      uOuterRadius: { value: 2.22 },
      uEnergy: { value: 0 },
    },
    vertexShader: ACCRETION_DISK_VERT,
    fragmentShader: ACCRETION_DISK_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const lensingArcMesh = new THREE.Mesh(lensingArcGeo, lensingArcMaterial);
  lensingArcMesh.rotation.x = 0.08;
  group.add(lensingArcMesh);
  disposables.push(lensingArcGeo, lensingArcMaterial);

  // 5. Twin Polar Relativistic Jets (volumetric soft-edge plasma beams)
  const jetMaterials: THREE.ShaderMaterial[] = [];
  [-1, 1].forEach((dir) => {
    const jetGeo = new THREE.CylinderGeometry(
      dir > 0 ? 0.56 : 0.09,
      dir > 0 ? 0.09 : 0.56,
      5.2,
      40,
      16,
      true
    );
    const jetMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uDir: { value: dir },
        uEnergy: { value: 0 },
      },
      vertexShader: JET_VERT,
      fragmentShader: JET_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const jetMesh = new THREE.Mesh(jetGeo, jetMat);
    jetMesh.position.y = dir * 2.85;
    group.add(jetMesh);
    jetMaterials.push(jetMat);
    disposables.push(jetGeo, jetMat);
  });

  // 6. Helical Magnetosphere Flux Filaments (gossamer plasma streamlines)
  const helixGroup = new THREE.Group();
  const helixMat = new THREE.MeshBasicMaterial({
    color: 0x67e8f9,
    transparent: true,
    opacity: 0.36,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  disposables.push(helixMat);

  for (let h = 0; h < 4; h++) {
    const pts: THREE.Vector3[] = [];
    const baseAngle = (h / 4) * Math.PI * 2;
    const steps = 64;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const y = (t - 0.5) * 7.6;
      const r = 0.24 + Math.pow(Math.abs(t - 0.5) * 2.0, 1.45) * 1.15;
      const theta = baseAngle + t * Math.PI * 5.0;
      pts.push(new THREE.Vector3(Math.cos(theta) * r, y, Math.sin(theta) * r));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const tubeGeo = new THREE.TubeGeometry(curve, 96, 0.009, 6, false);
    const tubeMesh = new THREE.Mesh(tubeGeo, helixMat);
    helixGroup.add(tubeMesh);
    disposables.push(tubeGeo);
  }
  group.add(helixGroup);

  return {
    group,
    diskMaterial,
    lensingArcMaterial,
    haloMaterial,
    jetMaterials,
    helixGroup,
    helixMaterial: helixMat,
  };
}

// ============================================================================
// 4. BANDED GAS-GIANT EXOPLANET + RAYLEIGH ATMOSPHERE + CASSINI RINGS
// ============================================================================
const ATMO_VERT = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vWorldNormal;
  varying vec3 vViewPos;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    vViewPos = -mvPos.xyz;
    gl_Position = projectionMatrix * mvPos;
  }
`;

const ATMO_FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vNormal;
  varying vec3 vWorldNormal;
  varying vec3 vViewPos;
  uniform vec3 uSunDir;
  uniform float uEnergy;

  void main() {
    vec3 viewDir = normalize(vViewPos);
    float rim = pow(clamp(1.0 - max(dot(normalize(vNormal), viewDir), 0.0), 0.0, 1.0), 3.2 - min(uEnergy * 0.7, 1.0));
    float daySide = smoothstep(-0.35, 0.55, dot(normalize(vWorldNormal), normalize(uSunDir)));

    vec3 atmoDay = vec3(0.24, 0.76, 1.0);
    vec3 atmoTwilight = vec3(0.62, 0.34, 0.98);
    vec3 col = mix(atmoTwilight, atmoDay, daySide) * (1.0 + uEnergy * 0.65);
    float alpha = rim * (0.30 + daySide * 0.72 + uEnergy * 0.25);

    gl_FragColor = vec4(col, alpha);
  }
`;

const PLANET_RING_VERT = /* glsl */ `
  varying vec3 vLocalPos;
  varying vec3 vWorldPos;
  void main() {
    vLocalPos = position;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const PLANET_RING_FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vLocalPos;
  varying vec3 vWorldPos;
  uniform float uInnerRadius;
  uniform float uOuterRadius;
  uniform vec3 uPlanetCenter;
  uniform float uPlanetRadius;
  uniform vec3 uSunDir;
  uniform float uEnergy;
  uniform float uTime;

  void main() {
    float r = length(vLocalPos.xy);
    float t = clamp((r - uInnerRadius) / max(uOuterRadius - uInnerRadius, 0.001), 0.0, 1.0);
    if (t <= 0.0 || t >= 1.0) discard;

    // Fine multi-frequency icy ringlets + Cassini & Encke divisions
    float fineRings =
      0.55 +
      0.28 * sin(t * 95.0 + uTime * 0.3) +
      0.17 * cos(t * 210.0 + 1.2) +
      0.12 * sin(t * 37.0);

    // Cassini Division (~0.62..0.68) and Encke Gap (~0.86..0.88)
    float cassini = 1.0 - 0.92 * exp(-pow((t - 0.64) * 28.0, 2.0));
    float encke = 1.0 - 0.78 * exp(-pow((t - 0.87) * 52.0, 2.0));
    float radialEnvelope = smoothstep(0.0, 0.08, t) * (1.0 - smoothstep(0.88, 1.0, t));

    // Ray-sphere shadow cast by the exoplanet across its back ring arc
    vec3 rel = vWorldPos - uPlanetCenter;
    vec3 sDir = normalize(uSunDir);
    float proj = dot(rel, sDir);
    float perpDist = length(rel - sDir * proj);
    float inShadow = (proj < 0.0) ? smoothstep(uPlanetRadius * 0.92, uPlanetRadius * 1.06, perpDist) : 1.0;

    vec3 iceColor = mix(vec3(0.45, 0.62, 0.86), vec3(0.76, 0.88, 1.0), clamp(fineRings, 0.0, 1.0));
    vec3 warmTint = vec3(0.72, 0.65, 0.88);
    vec3 finalCol = mix(warmTint, iceColor, smoothstep(0.15, 0.7, t)) * (0.14 + 0.86 * inShadow) * (1.0 + uEnergy * 0.38);

    float alpha = clamp(fineRings * cassini * encke * radialEnvelope * (0.68 + uEnergy * 0.14), 0.0, 0.90);
    gl_FragColor = vec4(finalCol, alpha);
  }
`;

export interface ExoplanetRig {
  group: THREE.Group;
  planetMesh: THREE.Mesh;
  planetMaterial: THREE.MeshStandardMaterial;
  atmoMaterial: THREE.ShaderMaterial;
  ringMaterial: THREE.ShaderMaterial;
  sunDir: THREE.Vector3;
}

export function buildExoplanetSystem(
  sunDir: THREE.Vector3,
  disposables: DisposableResource[]
): ExoplanetRig {
  const group = new THREE.Group();
  group.position.set(-5.8, 1.85, -8.4);
  group.rotation.set(0.22, 0.15, -0.34);

  const planetGeo = new THREE.SphereGeometry(1.52, 72, 72);
  const planetMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.74,
    metalness: 0.08,
  });

  // Extend MeshStandardMaterial via onBeforeCompile for realistic banded gas-giant clouds & storm eddies
  planetMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    planetMaterial.userData.shader = shader;

    shader.vertexShader =
      `varying vec3 vLocalPos;\n` +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>\nvLocalPos = position;`
      );

    shader.fragmentShader =
      `
      uniform float uTime;
      varying vec3 vLocalPos;

      float pHash(vec3 p) {
        p = fract(p * 0.3183099 + 0.1);
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
      }

      float pNoise(vec3 x) {
        vec3 i = floor(x);
        vec3 f = fract(x);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(mix(pHash(i + vec3(0,0,0)), pHash(i + vec3(1,0,0)), f.x),
              mix(pHash(i + vec3(0,1,0)), pHash(i + vec3(1,1,0)), f.x), f.y),
          mix(mix(pHash(i + vec3(0,0,1)), pHash(i + vec3(1,0,1)), f.x),
              mix(pHash(i + vec3(0,1,1)), pHash(i + vec3(1,1,1)), f.x), f.y),
          f.z
        );
      }

      float pFbm(vec3 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 4; i++) {
          v += a * pNoise(p);
          p = p * 2.05 + vec3(3.1, 1.7, 5.3);
          a *= 0.5;
        }
        return v;
      }
      \n` +
      shader.fragmentShader.replace(
        '#include <color_fragment>',
        `
        #include <color_fragment>
        vec3 nPos = normalize(vLocalPos);
        float turb = pFbm(nPos * 4.2 + vec3(uTime * 0.03, 0.0, -uTime * 0.02));
        float eddy = pFbm(nPos * 9.5 + turb * 2.2);
        float lat = nPos.y + (turb - 0.5) * 0.24 + (eddy - 0.5) * 0.08;

        float band1 = sin(lat * 16.0);
        float band2 = cos(lat * 29.0 + eddy * 3.0);

        vec3 deepIndigo = vec3(0.055, 0.095, 0.245);
        vec3 slateBlue  = vec3(0.145, 0.305, 0.560);
        vec3 stormCyan  = vec3(0.320, 0.640, 0.860);
        vec3 ochreCloud = vec3(0.620, 0.560, 0.720);

        vec3 gasCol = mix(deepIndigo, slateBlue, smoothstep(-0.8, 0.8, band1));
        gasCol = mix(gasCol, stormCyan, smoothstep(0.25, 0.95, band2) * 0.55);
        gasCol = mix(gasCol, ochreCloud, smoothstep(0.62, 0.92, eddy) * 0.42);
        diffuseColor.rgb = gasCol;
        `
      );
  };

  const planetMesh = new THREE.Mesh(planetGeo, planetMaterial);
  group.add(planetMesh);
  disposables.push(planetGeo, planetMaterial);

  // Atmospheric Rayleigh Scattering Shell
  const atmoGeo = new THREE.SphereGeometry(1.61, 64, 64);
  const atmoMat = new THREE.ShaderMaterial({
    uniforms: {
      uSunDir: { value: sunDir.clone().normalize() },
      uEnergy: { value: 0 },
    },
    vertexShader: ATMO_VERT,
    fragmentShader: ATMO_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const atmoMesh = new THREE.Mesh(atmoGeo, atmoMat);
  group.add(atmoMesh);
  disposables.push(atmoGeo, atmoMat);

  // Cassini Multi-Band Planetary Ring System with real planet shadow
  const ringGeo = new THREE.RingGeometry(2.05, 3.65, 140, 4);
  const ringMat = new THREE.ShaderMaterial({
    uniforms: {
      uInnerRadius: { value: 2.05 },
      uOuterRadius: { value: 3.65 },
      uPlanetCenter: { value: group.position.clone() },
      uPlanetRadius: { value: 1.52 },
      uSunDir: { value: sunDir.clone().normalize() },
      uEnergy: { value: 0 },
      uTime: { value: 0 },
    },
    vertexShader: PLANET_RING_VERT,
    fragmentShader: PLANET_RING_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const ringMesh = new THREE.Mesh(ringGeo, ringMat);
  ringMesh.rotation.x = Math.PI * 0.48;
  group.add(ringMesh);
  disposables.push(ringGeo, ringMat);

  return { group, planetMesh, planetMaterial, atmoMaterial: atmoMat, ringMaterial: ringMat, sunDir };
}

// ============================================================================
// 5. VOLUMETRIC INTERSTELLAR NEBULA FILAMENTS
// ============================================================================
const NEBULA_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const NEBULA_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform float uSeed;
  uniform float uEnergy;
  uniform vec3 uColorA;
  uniform vec3 uColorB;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  float nFbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * vnoise(p);
      p = p * 2.02 + vec2(7.3, 13.1);
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec2 centered = (vUv - 0.5) * 2.0;
    float radial = exp(-dot(centered, centered) * 2.6);
    if (radial < 0.01) discard;

    vec2 q = vec2(
      nFbm(vUv * 3.1 + vec2(uSeed, uTime * 0.05)),
      nFbm(vUv * 3.1 + vec2(uSeed + 4.2, -uTime * 0.04))
    );
    float density = nFbm(vUv * 3.8 + q * 1.6);
    float wisps = smoothstep(0.24, 0.85, density) * radial;

    vec3 col = mix(uColorA, uColorB, q.x) * (1.0 + uEnergy * 0.65);
    gl_FragColor = vec4(col, wisps * (0.22 + uEnergy * 0.14));
  }
`;

export interface NebulaWispItem {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  baseX: number;
  baseY: number;
  baseZ: number;
  driftPhase: number;
}

export function buildVolumetricNebulaWisps(
  scene: THREE.Scene,
  count: number,
  disposables: DisposableResource[]
): NebulaWispItem[] {
  const planeGeo = new THREE.PlaneGeometry(1, 1);
  disposables.push(planeGeo);

  const colorPairs: [number, number][] = [
    [0x0ea5e9, 0x6366f1],
    [0x38bdf8, 0xa855f7],
    [0x1d4ed8, 0xec4899],
  ];

  const items: NebulaWispItem[] = [];
  for (let i = 0; i < count; i++) {
    const pair = colorPairs[i % colorPairs.length];
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSeed: { value: i * 13.37 },
        uEnergy: { value: 0 },
        uColorA: { value: new THREE.Color(pair[0]) },
        uColorB: { value: new THREE.Color(pair[1]) },
      },
      vertexShader: NEBULA_VERT,
      fragmentShader: NEBULA_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const mesh = new THREE.Mesh(planeGeo, mat);
    const baseX = ((i % 5) - 2) * 3.8 + Math.sin(i * 2.1) * 1.2;
    const baseY = (Math.floor(i / 5) - 1) * 2.8 + Math.cos(i * 1.7) * 0.9;
    const baseZ = -4.5 - (i % 4) * 2.2;
    const sx = 5.5 + (i % 3) * 2.1;
    const sy = 3.2 + (i % 4) * 1.1;

    mesh.position.set(baseX, baseY, baseZ);
    mesh.scale.set(sx, sy, 1);
    mesh.rotation.z = (i % 6) * 0.42;
    scene.add(mesh);

    disposables.push(mat);
    items.push({
      mesh,
      material: mat,
      baseX,
      baseY,
      baseZ,
      driftPhase: i * 0.91,
    });
  }
  return items;
}

// ============================================================================
// 6. 3D RELATIVISTIC GRAVITATIONAL SHOCKWAVE RING (ON CLICK / TAP)
// ============================================================================
const SHOCKWAVE_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SHOCKWAVE_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uProgress;
  void main() {
    if (uProgress <= 0.0 || uProgress >= 1.0) discard;
    vec2 p = (vUv - 0.5) * 2.0;
    float d = length(p);
    float ringR = 0.08 + uProgress * 0.88;
    float band = exp(-pow((d - ringR) * 24.0, 2.0));
    float innerEcho = exp(-pow((d - ringR * 0.72) * 32.0, 2.0)) * 0.55;
    float fade = pow(1.0 - uProgress, 1.4);

    vec3 col = mix(vec3(0.35, 0.86, 1.0), vec3(0.75, 0.42, 1.0), uProgress);
    float alpha = (band + innerEcho) * fade * 0.95;
    gl_FragColor = vec4(col * 1.45, alpha);
  }
`;

export interface ShockwaveRig {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
}

export function buildShockwaveRing(
  scene: THREE.Scene,
  disposables: DisposableResource[]
): ShockwaveRig {
  const geo = new THREE.PlaneGeometry(14, 14);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uProgress: { value: 1.0 },
    },
    vertexShader: SHOCKWAVE_VERT,
    fragmentShader: SHOCKWAVE_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  scene.add(mesh);
  disposables.push(geo, mat);
  return { mesh, material: mat };
}

