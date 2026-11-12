import { Student } from '../types';

/**
 * Utility functions for parsing Uzbek names, generating clean usernames (logins)
 * for the "Besh Million Dasturchi" (omp.aistudy.uz) track, and formatting Metrika / ID copies.
 */

/**
 * Cleans an Uzbek name token by stripping apostrophes, okina, quotes, and non-alphanumeric chars.
 * E.g. "O'ktam" -> "oktam", "G'ayratov" -> "gayratov", "Ne'matov" -> "nematov", "Bo'riyev" -> "boriyev"
 */
export function cleanUzbekToken(token: string): string {
  if (!token) return '';
  return token
    .toLowerCase()
    .replace(/['ʻ’‘`"„“]/g, '') // remove apostrophes & special single quotes
    .replace(/[^a-z0-9]/g, '')  // keep only latin letters and numbers
    .trim();
}

/**
 * Determines which token is the Familya (last name) and which is the Ism (first name).
 * Filters out patronymic tokens like "qizi", "o'g'li", "Salimovich", "Karimovna".
 */
export function parseUzbekName(fullName: string): { familya: string; ism: string } {
  if (!fullName || !fullName.trim()) {
    return { familya: 'foydalanuvchi', ism: 'oquvchi' };
  }

  // Normalize spaces
  const clean = fullName.trim().replace(/\s+/g, ' ');
  const words = clean.split(' ');

  // Filter out patronymic tokens:
  // "qizi", "qiz", "o'g'li", "o‘g‘li", "o'g", "ogli", "ogil",
  // and tokens ending with -vich, -vna, -ovich, -ovna, -yevich, -yevna
  const filteredWords = words.filter(w => {
    const lower = w.toLowerCase().replace(/['ʻ’‘`"„“]/g, '');
    if (
      lower === 'qizi' ||
      lower === 'qiz' ||
      lower === 'ogli' ||
      lower === 'og' ||
      lower === 'ogil' ||
      lower === 'ugli'
    ) {
      return false;
    }
    if (lower.endsWith('vich') || lower.endsWith('vna')) {
      return false;
    }
    return true;
  });

  if (filteredWords.length === 0) {
    return { familya: 'foydalanuvchi', ism: 'oquvchi' };
  }
  if (filteredWords.length === 1) {
    return { familya: cleanUzbekToken(filteredWords[0]), ism: 'user' };
  }

  // Identify if any token ends with standard Uzbek last name endings:
  // -ov, -ova, -ev, -eva, -yev, -yeva, -iy, -iya, -zoda
  let familyaIdx = -1;
  for (let i = 0; i < filteredWords.length; i++) {
    const lower = filteredWords[i].toLowerCase().replace(/['ʻ’‘`"„“]/g, '');
    if (
      lower.endsWith('ov') || lower.endsWith('ova') ||
      lower.endsWith('ev') || lower.endsWith('eva') ||
      lower.endsWith('yev') || lower.endsWith('yeva') ||
      lower.endsWith('zoda')
    ) {
      familyaIdx = i;
      break;
    }
  }

  let rawFamilya = '';
  let rawIsm = '';

  if (familyaIdx === 0) {
    // Standard order: Familya is first: "Hakimova Oishaxon"
    rawFamilya = filteredWords[0];
    rawIsm = filteredWords[1];
  } else if (familyaIdx > 0) {
    // Inverted order: Ism is first: "Oishaxon Hakimova"
    rawFamilya = filteredWords[familyaIdx];
    rawIsm = filteredWords[0];
  } else {
    // Neither has a recognizable suffix: standard Uzbek list order (Familya first, Ism second)
    rawFamilya = filteredWords[0];
    rawIsm = filteredWords[1];
  }

  return {
    familya: cleanUzbekToken(rawFamilya),
    ism: cleanUzbekToken(rawIsm),
  };
}

/**
 * Generates student login using the user's specific rules:
 * - variantIndex === 0 (default): familya_ism (e.g. hakimova_oishaxon)
 * - variantIndex === 1: ism_familya (e.g. oishaxon_hakimova)
 * - variantIndex === 2: familya_ism1 (e.g. hakimova_oishaxon1)
 * - variantIndex === 3: familya_ism2 (e.g. hakimova_oishaxon2)
 * - variantIndex === N: familya_ism(N-1)
 */
export function generateStudentLogin(fullName: string, variantIndex: number = 0): string {
  const { familya, ism } = parseUzbekName(fullName);
  const fam = familya || 'familya';
  const name = ism || 'ism';

  if (variantIndex <= 0) {
    return `${fam}_${name}`;
  } else if (variantIndex === 1) {
    return `${name}_${fam}`;
  } else {
    const num = variantIndex - 1;
    return `${fam}_${name}${num}`;
  }
}

/**
 * Formats any birth date string into 2-digit day and month: DD.MM.YYYY
 * E.g. "2.06.2011" -> "02.06.2011"
 *      "2.6.2011"  -> "02.06.2011"
 *      "2011-06-02"-> "02.06.2011"
 */
export function formatBirthDateToDDMMYYYY(dateStr?: string): string {
  if (!dateStr) return '';
  const clean = dateStr.trim();
  if (!clean) return '';

  // ISO format: YYYY-MM-DD or YYYY/MM/DD or YYYY.MM.DD
  if (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(clean)) {
    const parts = clean.split(/[-/.]/);
    const y = parts[0];
    const m = parts[1].padStart(2, '0');
    const d = parts[2].padStart(2, '0');
    return `${d}.${m}.${y}`;
  }

  // European format: DD.MM.YYYY or D.M.YYYY
  if (/^\d{1,2}[-/.]\d{1,2}[-/.]\d{4}$/.test(clean)) {
    const parts = clean.split(/[-/.]/);
    const d = parts[0].padStart(2, '0');
    const m = parts[1].padStart(2, '0');
    const y = parts[2];
    return `${d}.${m}.${y}`;
  }

  return clean;
}

export interface MetrikaParsedComponents {
  formattedDate: string; // e.g. "02.06.2011"
  number: string;        // e.g. "0539632"
  series: string;        // e.g. "I-FR"
  combined: string;      // e.g. "02.06.2011 0539632 I-FR"
}

/**
 * Parses birthDate and passportOrId into clean separate components:
 * 1. formattedDate (DD.MM.YYYY, 2 digits each for day & month)
 * 2. number (only the 5-9 digit metrika/passport number)
 * 3. series (e.g. I-FR, AA, etc.)
 * 4. combined sequence: [Tug'ilgan sana] [Raqami] [Seriyasi]
 */
export function parseMetrikaComponents(birthDate?: string, passportOrId?: string): MetrikaParsedComponents {
  const formattedDate = formatBirthDateToDDMMYYYY(birthDate);
  const rawDoc = (passportOrId || '').trim();

  let series = '';
  let number = '';

  // Case 1: Number then series, e.g. "0539632 I-FR"
  const numThenSeriesMatch = rawDoc.match(/^(\d{5,9})\s+([A-Za-z\-_]+|[IVXLCDM]+[-_][A-Za-z]+)$/i);
  // Case 2: Series then number, e.g. "I-FR 0539632" or "AA 1234567"
  const seriesThenNumMatch = rawDoc.match(/^([A-Za-z\-_]+|[IVXLCDM]+[-_][A-Za-z]+)\s*(\d{5,9})$/i);

  if (numThenSeriesMatch) {
    number = numThenSeriesMatch[1].trim();
    series = numThenSeriesMatch[2].trim().toUpperCase();
  } else if (seriesThenNumMatch) {
    series = seriesThenNumMatch[1].trim().toUpperCase();
    number = seriesThenNumMatch[2].trim();
  } else {
    // Digits anywhere
    const digitsMatch = rawDoc.match(/\d{5,9}/);
    if (digitsMatch) {
      number = digitsMatch[0];
      const nonDigits = rawDoc.replace(/\d+/g, '').replace(/[\s]/g, '').trim().toUpperCase();
      series = nonDigits || 'I-FR';
    } else {
      number = rawDoc;
      series = rawDoc ? 'I-FR' : '';
    }
  }

  const parts: string[] = [];
  if (formattedDate) parts.push(formattedDate);
  if (number) parts.push(number);
  if (series) parts.push(series);

  return {
    formattedDate,
    number,
    series,
    combined: parts.join(' ').trim() || rawDoc || formattedDate || '',
  };
}

/**
 * Formats metrika / passport string for legacy callers
 */
export function formatMetrikaForCopy(birthDate?: string, passportOrId?: string): string {
  return parseMetrikaComponents(birthDate, passportOrId).combined;
}

/**
 * Checks whether a URL is a valid Besh Million Dasturchi (omp.aistudy.uz / aistudy.uz) certificate.
 * E.g. "https://omp.aistudy.uz/certificate?id=8f9e453f-50a8-4785-9f94-5f3580149ed4"
 */
export function isDeveloperCertificate(link?: string): boolean {
  if (!link) return false;
  const clean = link.trim().toLowerCase();
  return clean.includes('omp.aistudy.uz') || clean.includes('aistudy.uz') || clean.includes('certificate?id=');
}

/**
 * Checks whether a URL is a Coursera certificate.
 * E.g. "https://coursera.org/verify/..."
 */
export function isCourseraCertificate(link?: string): boolean {
  if (!link) return false;
  const clean = link.trim().toLowerCase();
  return clean.includes('coursera.org') || clean.includes('coursera_assets') || clean.includes('coursera');
}

/**
 * Returns track-specific state and certificate info with strict isolation.
 * A Coursera link will NEVER be accepted or shown as a Developer certificate,
 * and an omp.aistudy.uz link will NEVER be shown as an AI/Coursera certificate.
 */
export function getStudentTrackData(student: Student, targetTrack: 'ai' | 'developer') {
  if (targetTrack === 'developer') {
    // Only accept genuine developer certificates
    let devLink = student.devCertificateLink;
    if (devLink && isCourseraCertificate(devLink)) {
      devLink = undefined;
    }
    if (!devLink && student.certificateLink && isDeveloperCertificate(student.certificateLink)) {
      devLink = student.certificateLink;
    }

    const isCert = !!(devLink && devLink.trim().length > 5);
    const isErr = student.devStatus === 'error' || student.devHasError || (!isCert && student.hasError && student.projectType === 'developer');

    const status: 'pending' | 'certified' | 'error' = isCert ? 'certified' : isErr ? 'error' : 'pending';

    return {
      status,
      certificateLink: devLink || '',
      certifiedAt: isCert ? (student.devCertifiedAt || (isDeveloperCertificate(student.certificateLink) ? student.certifiedAt : undefined)) : undefined,
      hasError: isErr,
      errorReason: student.devErrorReason || (student.projectType === 'developer' ? (student.errorReason || '') : ''),
      errorImage: student.devErrorImage || (student.projectType === 'developer' ? (student.errorImage || '') : ''),
      certificateDate: student.devCertificateDate,
      certificateNumber: student.devCertificateNumber,
    };
  } else {
    // AI track (Coursera / AI Leaders)
    let aiLink = student.aiCertificateLink;
    if (aiLink && isDeveloperCertificate(aiLink)) {
      aiLink = undefined;
    }
    if (!aiLink && student.certificateLink && !isDeveloperCertificate(student.certificateLink)) {
      aiLink = student.certificateLink;
    }

    const isCert = !!(aiLink && aiLink.trim().length > 5);
    const isErr = student.aiStatus === 'error' || student.aiHasError || (!isCert && student.hasError && student.projectType !== 'developer');

    const status: 'pending' | 'certified' | 'error' = isCert ? 'certified' : isErr ? 'error' : 'pending';

    return {
      status,
      certificateLink: aiLink || '',
      certifiedAt: isCert ? (student.aiCertifiedAt || student.certifiedAt) : undefined,
      hasError: isErr,
      errorReason: student.aiErrorReason || (student.projectType !== 'developer' ? (student.errorReason || '') : ''),
      errorImage: student.aiErrorImage || (student.projectType !== 'developer' ? (student.errorImage || '') : ''),
      certificateDate: student.aiCertificateDate || student.certificateDate,
      certificateNumber: student.aiCertificateNumber || student.certificateNumber,
    };
  }
}

/**
 * Synchronizes student object when switching tracks or saving,
 * ensuring AI and Developer certificates/status NEVER overwrite or pollute each other.
 */
export function syncStudentForTrack(student: Student, newTrack: 'ai' | 'developer'): Student {
  let updated = { ...student };

  // 1. Snapshot any existing Coursera link into ai fields
  if (student.certificateLink && isCourseraCertificate(student.certificateLink)) {
    updated.aiCertificateLink = student.certificateLink;
    updated.aiStatus = 'certified';
    updated.aiCertifiedAt = student.certifiedAt;
  }
  // Snapshot any existing Developer link into dev fields
  if (student.certificateLink && isDeveloperCertificate(student.certificateLink)) {
    updated.devCertificateLink = student.certificateLink;
    updated.devStatus = 'certified';
    updated.devCertifiedAt = student.certifiedAt;
  }

  // 2. Switch active values to target track
  updated.projectType = newTrack;
  const targetData = getStudentTrackData(updated, newTrack);

  updated.status = targetData.status;
  updated.certificateLink = targetData.certificateLink || undefined;
  updated.certifiedAt = targetData.certifiedAt;
  updated.hasError = targetData.hasError;
  updated.errorReason = targetData.errorReason || undefined;
  updated.errorImage = targetData.errorImage || undefined;

  // 3. Ensure developer track students have an assigned login
  if (newTrack === 'developer' && !updated.assignedLogin) {
    updated.assignedLogin = generateStudentLogin(updated.fullName, 0);
    updated.loginVariantIndex = 0;
    updated.assignedPassword = updated.assignedPassword || 'MaktabPass2026!';
  }

  return updated;
}
