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

function getUaDataSync(): { platform: string; mobile: boolean } {
  try {
    const uaData = (navigator as any)?.userAgentData;
    if (!uaData) return { platform: '', mobile: false };
    return {
      platform: typeof uaData.platform === 'string' ? uaData.platform : '',
      mobile: Boolean(uaData.mobile),
    };
  } catch {
    return { platform: '', mobile: false };
  }
}

function detectOsFamilyNormalized(ua: string, gpuRenderer: string): 'ios' | 'android' | 'windows' | 'macos' | 'chromeos' | 'linux' | 'other' {
  const { platform: chPlatform, mobile: chMobile } = getUaDataSync();
  const touchPoints = typeof navigator !== 'undefined' && typeof navigator.maxTouchPoints === 'number' ? navigator.maxTouchPoints : 0;
  const w = typeof window !== 'undefined' ? window.screen?.width || 0 : 0;
  const h = typeof window !== 'undefined' ? window.screen?.height || 0 : 0;
  const minDim = Math.min(w, h);
  const isMobileGpu = /Adreno|Mali|PowerVR|Immortalis|Tegra/i.test(gpuRenderer);

  if (/iPhone|iPad|iPod/i.test(ua) || /iOS/i.test(chPlatform)) return 'ios';
  if (/Macintosh|Mac OS X/i.test(ua) && touchPoints > 1) return 'ios';

  if (
    /Android/i.test(ua) ||
    /Android/i.test(chPlatform) ||
    chMobile ||
    (/Linux/i.test(ua) && !/CrOS/i.test(ua) && (isMobileGpu || (touchPoints >= 2 && minDim > 0 && minDim <= 950)))
  ) {
    return 'android';
  }

  if (/CrOS/i.test(ua) || /Chrome OS/i.test(chPlatform)) return 'chromeos';
  if (/Windows/i.test(ua) || /Windows/i.test(chPlatform)) return 'windows';
  if (/Macintosh|Mac OS X/i.test(ua) || /macOS/i.test(chPlatform)) return 'macos';
  if (/Linux/i.test(ua) || /Linux/i.test(chPlatform)) return 'linux';
  return 'other';
}

function formatAndroidBrandAndModel(source: string, isTablet: boolean): string {
  const clean = (source || '').trim();
  if (!clean || clean === 'K') {
    return isTablet ? 'Android Planshet' : 'Android Telefon';
  }
  if (/Samsung|SM-|GT-/i.test(clean)) {
    return clean.startsWith('Samsung') ? clean : `Samsung Galaxy (${clean})`;
  }
  if (/Redmi|POCO|Xiaomi|Mi\s/i.test(clean)) {
    return /Xiaomi/i.test(clean) ? clean : `Xiaomi / Redmi (${clean})`;
  }
  if (/^(21|22|23|24|25)[0-9A-Z]{5,}/i.test(clean) || /^M2\d/i.test(clean)) {
    return `Xiaomi / Redmi (${clean})`;
  }
  if (/Huawei|HONOR|JNY-|STK-|CTR-|FOA-|REA-/i.test(clean)) {
    return `Huawei / Honor (${clean})`;
  }
  if (/Pixel/i.test(clean)) {
    return clean.startsWith('Google') ? clean : `Google ${clean}`;
  }
  if (/OnePlus|CPH24|LE21|NE22|KB20/i.test(clean)) {
    return /OnePlus/i.test(clean) ? clean : `OnePlus (${clean})`;
  }
  if (/CPH|OPPO|PGJM|PHB/i.test(clean)) {
    return /OPPO/i.test(clean) ? clean : `OPPO (${clean})`;
  }
  if (/RMX|Realme/i.test(clean)) {
    return /Realme/i.test(clean) ? clean : `Realme (${clean})`;
  }
  if (/Vivo|V2\d{3}/i.test(clean)) {
    return /Vivo/i.test(clean) ? clean : `Vivo (${clean})`;
  }
  if (/Infinix|X6\d{2}/i.test(clean)) {
    return /Infinix/i.test(clean) ? clean : `Infinix (${clean})`;
  }
  if (/Tecno|TECNO|KL\d|CK\d|LH\d/i.test(clean)) {
    return /TECNO/i.test(clean) ? clean : `TECNO (${clean})`;
  }
  return clean.length >= 2 ? `Android (${clean})` : (isTablet ? 'Android Planshet' : 'Android Telefon');
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
  const gpu = getWebGLGpuInfo();
  const cleanGpu = gpu.renderer.replace(/\s+/g, ' ').trim();
  const osFamily = detectOsFamilyNormalized(ua, cleanGpu);

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
  const minDim = Math.min(width, height);
  const screen = `${width}x${height}`;

  const deviceId = getOrCreateDeviceId();
  const hw = computeHardwareFingerprint();
  const gpuStr = hw.gpuRenderer || '';
  const touchPoints = typeof navigator !== 'undefined' && typeof navigator.maxTouchPoints === 'number' ? navigator.maxTouchPoints : 0;
  const { platform: chPlatform, mobile: chMobile } = getUaDataSync();
  const isMobileGpu = /Adreno|Mali|PowerVR|Immortalis|Tegra/i.test(gpuStr);
  const hasTouch = touchPoints > 0 || (typeof window !== 'undefined' && 'ontouchstart' in window);

  let os = "Noma'lum OS";
  let deviceType: 'mobile' | 'tablet' | 'desktop' = 'desktop';
  let deviceName = 'Kompyuter';

  // 1. Apple iPhone / iPad (including Safari "Request Desktop Website" on iPadOS & iOS!)
  if (/iPhone/i.test(ua)) {
    deviceType = 'mobile';
    const match = ua.match(/OS (\d+[_\d]*)/);
    const osVer = match ? match[1].replace(/_/g, '.') : '';
    os = `iOS ${osVer}`.trim();
    deviceName = 'Apple iPhone';
  } else if (/iPad/i.test(ua) || (/Macintosh|Mac OS X/i.test(ua) && touchPoints > 1) || /iOS/i.test(chPlatform)) {
    if (minDim > 0 && minDim <= 520) {
      deviceType = 'mobile';
      os = 'iOS';
      deviceName = 'Apple iPhone';
    } else {
      deviceType = 'tablet';
      os = 'iPadOS';
      deviceName = 'Apple iPad';
    }
  }
  // 2. Android Phones & Tablets (including UA-Reduced "Android 10; K" AND Android Desktop Mode "X11; Linux")
  else if (
    /Android/i.test(ua) ||
    /Android/i.test(chPlatform) ||
    chMobile ||
    (/Linux/i.test(ua) && !/CrOS/i.test(ua) && (isMobileGpu || (touchPoints >= 2 && hasTouch && minDim > 0 && minDim <= 950)))
  ) {
    const isTablet =
      /Tablet|SM-T|Pad/i.test(ua) ||
      (!chMobile && !/Mobile/i.test(ua) && minDim >= 600);
    deviceType = isTablet ? 'tablet' : 'mobile';

    const osMatch = ua.match(/Android\s([0-9\.]+)/);
    const isReducedPlaceholder = /Android\s10;\sK\)/i.test(ua);
    if (osMatch && !isReducedPlaceholder) {
      os = `Android ${osMatch[1]}`;
    } else if (/Android/i.test(ua) || /Android/i.test(chPlatform)) {
      os = 'Android';
    } else {
      os = 'Android (Mobil)';
    }

    // Try extracting model from UA first (until async Client Hints fills exact model)
    const modelMatch = ua.match(/Android[^;]*;\s*([^;\)]+)/i);
    const uaModelToken = modelMatch ? modelMatch[1].replace(/\s*Build\/.*/i, '').trim() : '';

    if (/Samsung|SM-|GT-/i.test(ua)) {
      deviceName = formatAndroidBrandAndModel(uaModelToken || 'Samsung Galaxy', isTablet);
    } else if (/Redmi|POCO|Xiaomi|Mi\s/i.test(ua)) {
      deviceName = formatAndroidBrandAndModel(uaModelToken || 'Xiaomi / Redmi', isTablet);
    } else if (/Huawei|HONOR/i.test(ua)) {
      deviceName = formatAndroidBrandAndModel(uaModelToken || 'Huawei / Honor', isTablet);
    } else if (/Pixel/i.test(ua)) {
      deviceName = formatAndroidBrandAndModel(uaModelToken || 'Google Pixel', isTablet);
    } else if (/OnePlus/i.test(ua)) {
      deviceName = formatAndroidBrandAndModel(uaModelToken || 'OnePlus', isTablet);
    } else if (/OPPO|CPH/i.test(ua)) {
      deviceName = formatAndroidBrandAndModel(uaModelToken || 'OPPO', isTablet);
    } else if (/RMX|Realme/i.test(ua)) {
      deviceName = formatAndroidBrandAndModel(uaModelToken || 'Realme', isTablet);
    } else if (/Vivo/i.test(ua)) {
      deviceName = formatAndroidBrandAndModel(uaModelToken || 'Vivo', isTablet);
    } else if (uaModelToken && uaModelToken !== 'K' && !/x86_64|aarch64|armv8/i.test(uaModelToken)) {
      deviceName = formatAndroidBrandAndModel(uaModelToken, isTablet);
    } else {
      deviceName = isTablet ? 'Android Planshet' : 'Android Telefon';
    }
  }
  // 3. Desktop macOS (touchPoints <= 1)
  else if (/Macintosh|Mac OS X/i.test(ua) || /macOS/i.test(chPlatform)) {
    deviceType = 'desktop';
    os = 'macOS';
    deviceName = 'Apple Mac';
  }
  // 4. Desktop Windows
  else if (/Windows NT 10.0/i.test(ua) || /Windows/i.test(chPlatform)) {
    deviceType = 'desktop';
    os = 'Windows 10/11';
    deviceName = 'Windows PC';
  } else if (/Windows/i.test(ua)) {
    deviceType = 'desktop';
    os = 'Windows PC';
    deviceName = 'Windows Kompyuter';
  }
  // 5. ChromeOS
  else if (/CrOS/i.test(ua) || /Chrome OS/i.test(chPlatform)) {
    deviceType = 'desktop';
    os = 'ChromeOS';
    deviceName = 'Chromebook';
  }
  // 6. Genuine Desktop Linux
  else if (/Linux/i.test(ua) || /Linux/i.test(chPlatform)) {
    deviceType = 'desktop';
    os = 'Linux';
    deviceName = 'Linux Kompyuter';
  }

  // Detect Browser
  let browser = "Noma'lum brauzer";
  if (/Telegram/i.test(ua)) {
    browser = 'Telegram Brauzer';
  } else if (/Instagram/i.test(ua)) {
    browser = 'Instagram Brauzer';
  } else if (/YaBrowser/i.test(ua)) {
    browser = 'Yandex Brauzer';
  } else if (/Edg\/|EdgA\//i.test(ua)) {
    const match = ua.match(/(Edg|EdgA)\/([0-9\.]+)/);
    browser = `Microsoft Edge ${match ? match[2].split('.')[0] : ''}`.trim();
  } else if (/SamsungBrowser/i.test(ua)) {
    const match = ua.match(/SamsungBrowser\/([0-9\.]+)/);
    browser = `Samsung Internet ${match ? match[1].split('.')[0] : ''}`.trim();
  } else if (/MiuiBrowser/i.test(ua)) {
    browser = 'Mi Browser';
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

/**
 * Asynchronously resolves real hardware model & exact OS version using Chromium Client Hints
 * (essential on Android Chrome 110+ where UA freezes to "Android 10; K" or "X11; Linux").
 */
export async function enrichDeviceWithClientHints(
  onUpdated?: (info: DetectedDeviceInfo) => void
): Promise<DetectedDeviceInfo> {
  const base = detectCurrentDevice();
  try {
    const uaData = (navigator as any)?.userAgentData;
    if (!uaData || typeof uaData.getHighEntropyValues !== 'function') {
      return base;
    }

    const hints = await uaData.getHighEntropyValues(['model', 'platform', 'platformVersion']);
    const chPlatform = typeof hints?.platform === 'string' ? hints.platform : '';
    const chVersion = typeof hints?.platformVersion === 'string' ? hints.platformVersion : '';
    const chModel = typeof hints?.model === 'string' ? hints.model.trim() : '';

    let nextName = base.deviceName;
    let nextOs = base.os;
    let nextType = base.deviceType;

    if (/Android/i.test(chPlatform)) {
      const w = typeof window !== 'undefined' ? window.screen.width : 0;
      const h = typeof window !== 'undefined' ? window.screen.height : 0;
      const minDim = Math.min(w, h);
      const isTablet = !uaData.mobile && minDim >= 600;
      nextType = isTablet ? 'tablet' : 'mobile';

      const major = chVersion ? chVersion.split('.')[0] : '';
      if (major && Number(major) > 0) {
        nextOs = `Android ${major}`;
      } else {
        nextOs = 'Android';
      }

      if (chModel) {
        nextName = formatAndroidBrandAndModel(chModel, isTablet);
      } else if (nextName === 'Linux Kompyuter' || nextName === 'Kompyuter') {
        nextName = isTablet ? 'Android Planshet' : 'Android Telefon';
      }
    } else if (/Windows/i.test(chPlatform)) {
      const major = chVersion ? parseInt(chVersion.split('.')[0], 10) : 0;
      if (major >= 13) {
        nextOs = 'Windows 11';
      } else if (major >= 1 && major < 13) {
        nextOs = 'Windows 10';
      }
    } else if (/iOS/i.test(chPlatform)) {
      nextType = 'mobile';
      nextOs = chVersion ? `iOS ${chVersion.split('.')[0]}` : 'iOS';
      nextName = 'Apple iPhone';
    }

    if (
      nextName !== base.deviceName ||
      nextOs !== base.os ||
      nextType !== base.deviceType
    ) {
      cachedDeviceInfo = {
        ...base,
        deviceName: nextName,
        os: nextOs,
        deviceType: nextType,
      };
      onUpdated?.(cachedDeviceInfo);
      return cachedDeviceInfo;
    }
  } catch {
    // ignore permission/unsupported errors gracefully
  }
  return base;
}
