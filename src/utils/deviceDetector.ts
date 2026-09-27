export interface DetectedDeviceInfo {
  deviceId: string;
  deviceName: string;
  deviceType: 'mobile' | 'tablet' | 'desktop';
  browser: string;
  os: string;
  screen: string;
}

const DEVICE_ID_KEY = 'b1m_device_fingerprint_v2';

export function getOrCreateDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = 'dev-' + Math.random().toString(36).substring(2, 10) + '-' + Date.now().toString(36);
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return 'dev-temp-' + Math.random().toString(36).substring(2, 10);
  }
}

export function detectCurrentDevice(): DetectedDeviceInfo {
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

    // Specific brand detection
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

  return {
    deviceId,
    deviceName,
    deviceType,
    browser,
    os,
    screen,
  };
}
