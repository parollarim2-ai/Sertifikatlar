export interface DetectedDeviceInfo {
  deviceId: string;
  hardwareId: string;
  deviceName: string;
  deviceType: 'mobile' | 'tablet' | 'desktop';
  browser: string;
  os: string;
  screen: string;
  cpuCores?: number;
  gpuRenderer?: string;
}

const DEVICE_ID_KEY = 'b1m_device_fingerprint_v2';
const DEVICE_COOKIE_NAME = 'b1m_dev_uid';

function readCookie(name: string): string | null {
  try {
    if (typeof document === 'undefined') return null;
    const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

function writeCookie(name: string, value: string) {
  try {
    if (typeof document === 'undefined') return;
    document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=31536000; SameSite=Lax`;
  } catch {
    // ignore cookie errors in restricted iframes
  }
}

export function getOrCreateDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY) || readCookie(DEVICE_COOKIE_NAME);
    if (!id) {
      id = 'dev-' + Math.random().toString(36).substring(2, 10) + '-' + Date.now().toString(36);
    }
    localStorage.setItem(DEVICE_ID_KEY, id);
    writeCookie(DEVICE_COOKIE_NAME, id);
    return id;
  } catch {
    const cookieId = readCookie(DEVICE_COOKIE_NAME);
    if (cookieId) return cookieId;
    return 'dev-temp-' + Math.random().toString(36).substring(2, 10);
  }
}

function getWebGLGpuInfo(): { vendor: string; renderer: string } {
  try {
    if (typeof document === 'undefined') return { vendor: '', renderer: '' };
    const canvas = document.createElement('canvas');
    const gl =
      (canvas.getContext('webgl') as WebGLRenderingContext | null) ||
      (canvas.getContext('experimental-webgl') as WebGLRenderingContext | null);
    if (!gl) return { vendor: '', renderer: '' };
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (debugInfo) {
      const vendor = String(gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || '');
      const renderer = String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || '');
      return { vendor, renderer };
    }
    return {
      vendor: String(gl.getParameter(gl.VENDOR) || ''),
      renderer: String(gl.getParameter(gl.RENDERER) || ''),
    };
  } catch {
    return { vendor: '', renderer: '' };
  }
}

// Fast, synchronous, deterministic 64-bit FNV-1a dual hash for cross-browser hardware ID
function hashSignals(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= (c + i);
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  const part1 = (h1 >>> 0).toString(36).padStart(7, '0');
  const part2 = (h2 >>> 0).toString(36).padStart(7, '0');
  return `hw-${part1}${part2}`;
}

export function computeHardwareFingerprint(): {
  hardwareId: string;
  cpuCores?: number;
  gpuRenderer?: string;
} {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return { hardwareId: 'hw-ssr' };
  }
  const ua = navigator.userAgent || '';
  let osFamily = 'other';
  if (/iPhone|iPad|iPod/i.test(ua)) osFamily = 'ios';
  else if (/Android/i.test(ua)) osFamily = 'android';
  else if (/Windows/i.test(ua)) osFamily = 'windows';
  else if (/Macintosh|Mac OS X/i.test(ua)) osFamily = 'macos';
  else if (/Linux/i.test(ua)) osFamily = 'linux';

  const w = window.screen?.width || 0;
  const h = window.screen?.height || 0;
  const minDim = Math.min(w, h);
  const maxDim = Math.max(w, h);
  const colorDepth = window.screen?.colorDepth || 24;
  const dpr = Math.round((window.devicePixelRatio || 1) * 100);
  const cpuCores = typeof navigator.hardwareConcurrency === 'number' ? navigator.hardwareConcurrency : undefined;
  const touchPoints = typeof navigator.maxTouchPoints === 'number' ? navigator.maxTouchPoints : 0;
  const tz = (() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    } catch {
      return '';
    }
  })();

  const gpu = getWebGLGpuInfo();
  // Normalize GPU renderer slightly so Safari vs Chrome minor suffixes don't break match if both expose Apple GPU
  const cleanGpu = gpu.renderer.replace(/\s+/g, ' ').trim();

  const rawSignals = [
    osFamily,
    `${minDim}x${maxDim}`,
    `cd${colorDepth}`,
    `dpr${dpr}`,
    `cpu${cpuCores || 0}`,
    `tp${touchPoints > 0 ? 1 : 0}`,
    tz,
    cleanGpu || gpu.vendor || 'no-gpu',
  ].join('|');

  return {
    hardwareId: hashSignals(rawSignals),
    cpuCores,
    gpuRenderer: cleanGpu || undefined,
  };
}

let cachedDeviceInfo: DetectedDeviceInfo | null = null;

export function detectCurrentDevice(): DetectedDeviceInfo {
  if (cachedDeviceInfo && typeof window !== 'undefined') {
    return cachedDeviceInfo;
  }

  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const width = typeof window !== 'undefined' ? window.screen.width : 0;
  const height = typeof window !== 'undefined' ? window.screen.height : 0;
  const screen = `${width}x${height}`;

  let os = 'Noma\'lum OS';
  let deviceType: 'mobile' | 'tablet' | 'desktop' = 'desktop';
  let deviceName = 'Kompyuter';

  // Detect OS
  if (/iPad|Tablet/i.test(ua)) {
    deviceType = 'tablet';
    os = 'iPadOS';
    deviceName = 'Apple iPad';
  } else if (/iPhone/i.test(ua)) {
    deviceType = 'mobile';
    const match = ua.match(/OS (\d+[_\d]*)/);
    const osVer = match ? match[1].replace(/_/g, '.') : '';
    os = `iOS ${osVer}`.trim();
    deviceName = 'Apple iPhone';
  } else if (/Android/i.test(ua)) {
    const isTablet = /Tablet|SM-T/i.test(ua) || (width > 600 && height > 600 && !/Mobile/i.test(ua));
    deviceType = isTablet ? 'tablet' : 'mobile';

    const osMatch = ua.match(/Android\s([0-9\.]+)/);
    const osVer = osMatch ? osMatch[1] : '';
    os = `Android ${osVer}`.trim();

    if (/Samsung|SM-|GT-/i.test(ua)) {
      deviceName = 'Samsung Galaxy';
    } else if (/Redmi|POCO|Xiaomi|Mi\s/i.test(ua)) {
      deviceName = 'Xiaomi / Redmi';
    } else if (/Huawei|HONOR/i.test(ua)) {
      deviceName = 'Huawei / Honor';
    } else if (/Pixel/i.test(ua)) {
      deviceName = 'Google Pixel';
    } else if (/OnePlus/i.test(ua)) {
      deviceName = 'OnePlus';
    } else if (/OPPO|CPH/i.test(ua)) {
      deviceName = 'OPPO';
    } else if (/Vivo/i.test(ua)) {
      deviceName = 'Vivo';
    } else {
      deviceName = isTablet ? 'Android Planshet' : 'Android Telefon';
    }
  } else if (/Macintosh|Mac OS X/i.test(ua)) {
    deviceType = 'desktop';
    os = 'macOS';
    deviceName = 'Apple Mac';
  } else if (/Windows NT 10.0/i.test(ua)) {
    deviceType = 'desktop';
    os = 'Windows 10/11';
    deviceName = 'Windows PC';
  } else if (/Windows/i.test(ua)) {
    deviceType = 'desktop';
    os = 'Windows PC';
    deviceName = 'Windows Kompyuter';
  } else if (/CrOS/i.test(ua)) {
    deviceType = 'desktop';
    os = 'ChromeOS';
    deviceName = 'Chromebook';
  } else if (/Linux/i.test(ua)) {
    deviceType = 'desktop';
    os = 'Linux';
    deviceName = 'Linux Kompyuter';
  }

  // Detect Browser
  let browser = "Noma'lum brauzer";
  if (/Edg\//i.test(ua)) {
    const match = ua.match(/Edg\/([0-9\.]+)/);
    browser = `Microsoft Edge ${match ? match[1].split('.')[0] : ''}`.trim();
  } else if (/SamsungBrowser/i.test(ua)) {
    const match = ua.match(/SamsungBrowser\/([0-9\.]+)/);
    browser = `Samsung Internet ${match ? match[1].split('.')[0] : ''}`.trim();
  } else if (/OPR\/|Opera/i.test(ua)) {
    browser = 'Opera';
  } else if (/Chrome\/|CriOS\//i.test(ua)) {
    const match = ua.match(/(Chrome|CriOS)\/([0-9\.]+)/);
    browser = `Chrome ${match ? match[2].split('.')[0] : ''}`.trim();
  } else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) {
    browser = 'Safari';
  } else if (/Firefox\/|FxiOS\//i.test(ua)) {
    const match = ua.match(/(Firefox|FxiOS)\/([0-9\.]+)/);
    browser = `Firefox ${match ? match[2].split('.')[0] : ''}`.trim();
  }

  const deviceId = getOrCreateDeviceId();
  const hw = computeHardwareFingerprint();

  cachedDeviceInfo = {
    deviceId,
    hardwareId: hw.hardwareId,
    deviceName,
    deviceType,
    browser,
    os,
    screen,
    cpuCores: hw.cpuCores,
    gpuRenderer: hw.gpuRenderer,
  };

  return cachedDeviceInfo;
}
