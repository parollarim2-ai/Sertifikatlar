export interface ParsedStudentPreview {
  fullName: string;
  birthDate: string;
  passportOrId: string;
  sourceSnippet?: string;
}

// Complete Cyrillic to Latin character map for passport and document series
const CYRILLIC_TO_LATIN_SERIES: Record<string, string> = {
  // Uppercase visually / intended
  'А': 'A', 'В': 'B', 'С': 'C', 'Е': 'E', 'К': 'K', 'М': 'M', 'Н': 'N',
  'О': 'O', 'Р': 'P', 'Т': 'T', 'Х': 'X', 'Ф': 'F', 'У': 'U', 'Д': 'D',
  'И': 'I', 'З': 'Z', 'Б': 'B', 'Г': 'G', 'Ж': 'J', 'Л': 'L', 'П': 'P',
  'Ш': 'SH', 'Щ': 'SH', 'Ч': 'CH', 'Ц': 'TS', 'Э': 'E', 'Ю': 'YU', 'Я': 'YA',
  'Ў': 'O', 'Қ': 'Q', 'Ғ': 'G', 'Ҳ': 'H',
  // Lowercase
  'а': 'A', 'в': 'B', 'с': 'C', 'е': 'E', 'к': 'K', 'м': 'M', 'н': 'N',
  'о': 'O', 'р': 'P', 'т': 'T', 'х': 'X', 'ф': 'F', 'у': 'U', 'д': 'D',
  'и': 'I', 'з': 'Z', 'б': 'B', 'г': 'G', 'ж': 'J', 'л': 'L', 'п': 'P',
  'ш': 'SH', 'щ': 'SH', 'ч': 'CH', 'ц': 'TS', 'э': 'E', 'ю': 'YU', 'я': 'YA',
  'ў': 'O', 'қ': 'Q', 'ғ': 'G', 'ҳ': 'H',
};

/**
 * Normalizes all Uzbek apostrophe variations (U+02BB, U+02BC, U+2019, U+2018, U+00B4, `, ') into standard ASCII '
 */
export function normalizeUzbekApostrophes(str: string): string {
  if (!str) return '';
  return str.replace(/[\u02BB\u02BC\u2019\u2018\u00B4\`]/g, "'");
}

export function normalizePassportLetters(str: string): string {
  return str.replace(/[А-Яа-яЁёЎўҚқҒғҲҳ]/g, c => CYRILLIC_TO_LATIN_SERIES[c] || c);
}

/**
 * Normalizes Uzbek and Cyrillic names into Title Case
 * e.g. "ABDURASULOV FAYZULLOH ABDURAHIM O'G'LI" -> "Abdurasulov Fayzulloh Abdurahim o'g'li"
 * e.g. "GʻAYRATOV SARDOR FARHOD OʻGʻLI" -> "G'ayratov Sardor Farhod o'g'li"
 */
export function formatUzbekName(name: string): string {
  if (!name) return '';
  const clean = normalizeUzbekApostrophes(name);
  const words = clean.trim().split(/\s+/);
  return words
    .map((word, idx) => {
      const lower = word.toLowerCase();
      // Handle Uzbek patronymics: o'g'li, qizi, o‘g‘li, ogli, ugli, ўғли, қизи, угли, кизи
      if ((lower === "o'g'li" || lower === "ogli" || lower === "ugli" || lower === "ўғли" || lower === "угли") && idx > 1) {
        return "o'g'li";
      }
      if ((lower === "qizi" || lower === "kizi" || lower === "қизи" || lower === "кизи") && idx > 1) {
        return "qizi";
      }
      // Preserve apostrophes inside names e.g. G'ayrat, Ulug'bek, Ma'ruf, Qo'chqor
      // When capitalizing words with G' or O': e.g. "g'ayrat" -> "G'ayrat", "o'rol" -> "O'rol"
      if (/^[go]'/i.test(word)) {
        return word.charAt(0).toUpperCase() + "'" + word.slice(2).toLowerCase();
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

/**
 * Converts an Excel serial date number (e.g. 40250 or "39553") into DD.MM.YYYY string
 */
export function parseExcelSerialDate(val: any): string {
  let num: number | null = null;
  if (typeof val === 'number') {
    num = val;
  } else if (typeof val === 'string' && /^\s*\d{5}\s*$/.test(val)) {
    num = parseInt(val.trim(), 10);
  }

  if (num && num > 20000 && num < 60000) {
    try {
      const utcDays = Math.floor(num - 25569);
      const utcValue = utcDays * 86400;
      const dateInfo = new Date(utcValue * 1000);
      const day = String(dateInfo.getUTCDate()).padStart(2, '0');
      const month = String(dateInfo.getUTCMonth() + 1).padStart(2, '0');
      const year = dateInfo.getUTCFullYear();
      return `${day}.${month}.${year}`;
    } catch {
      return '';
    }
  }
  return '';
}

/**
 * Extracts and standardizes birth dates (DD.MM.YYYY)
 */
export function extractBirthDate(text: string): { birthDate: string; remainder: string } {
  if (!text) return { birthDate: '', remainder: '' };

  let remainder = text;
  let birthDate = '';

  // 1. Spaced or standard numeric formats: DD.MM.YYYY, DD/MM/YYYY, DD-MM-YYYY (e.g. "15 . 04 . 2008", "15.04.2008.", "15.04.2008 y.")
  const dmyMatch = text.match(/\b([0-3]?\d)\s*[\.\/\-]\s*([0-1]?\d)\s*[\.\/\-]\s*(\d{2,4})\b/);
  if (dmyMatch) {
    const dVal = parseInt(dmyMatch[1], 10);
    const mVal = parseInt(dmyMatch[2], 10);
    let year = dmyMatch[3];
    if (year.length === 2) {
      year = parseInt(year, 10) > 30 ? `19${year}` : `20${year}`;
    }
    const yVal = parseInt(year, 10);

    if (mVal >= 1 && mVal <= 12 && dVal >= 1 && dVal <= 31 && yVal >= 1960 && yVal <= 2026) {
      const day = String(dVal).padStart(2, '0');
      const month = String(mVal).padStart(2, '0');
      birthDate = `${day}.${month}.${year}`;
      remainder = remainder.replace(dmyMatch[0], ' ');
      return { birthDate, remainder: cleanWhitespace(remainder) };
    }
  }

  // 2. ISO format: YYYY-MM-DD or YYYY.MM.DD
  const ymdMatch = text.match(/\b(\d{4})\s*[\.\/\-]\s*([0-1]?\d)\s*[\.\/\-]\s*([0-3]?\d)\b/);
  if (ymdMatch) {
    const year = ymdMatch[1];
    const mVal = parseInt(ymdMatch[2], 10);
    const dVal = parseInt(ymdMatch[3], 10);
    const yVal = parseInt(year, 10);

    if (mVal >= 1 && mVal <= 12 && dVal >= 1 && dVal <= 31 && yVal >= 1960 && yVal <= 2026) {
      const day = String(dVal).padStart(2, '0');
      const month = String(mVal).padStart(2, '0');
      birthDate = `${day}.${month}.${year}`;
      remainder = remainder.replace(ymdMatch[0], ' ');
      return { birthDate, remainder: cleanWhitespace(remainder) };
    }
  }

  // 3. Uzbek text month format: "15-may 2009", "15 may 2009-yil", "15-май 2008"
  const textMonthRegex = /\b([0-3]?\d)\s*[-_ ]?\s*(yanvar|fevral|mart|aprel|may|iyun|iyul|avgust|sentabr|oktabr|noyabr|dekabr|январ|феврал|март|апрел|май|июн|июл|август|сентабр|октябр|ноябр|декабр)\s*[-_ ,]?\s*(\d{4})(?:\s*[-_]?\s*yil|\s*[-_]?\s*й\.?)?\b/i;
  const tmMatch = text.match(textMonthRegex);
  if (tmMatch) {
    const dVal = parseInt(tmMatch[1], 10);
    const monthMap: Record<string, string> = {
      yanvar: '01', fevral: '02', mart: '03', aprel: '04', may: '05', iyun: '06',
      iyul: '07', avgust: '08', sentabr: '09', oktabr: '10', noyabr: '11', dekabr: '12',
      январ: '01', феврал: '02', март: '03', апрел: '04', май: '05', июн: '06',
      июл: '07', август: '08', сентабр: '09', октябр: '10', ноябр: '11', декабр: '12',
    };
    const month = monthMap[tmMatch[2].toLowerCase()] || '01';
    const year = tmMatch[3];
    if (dVal >= 1 && dVal <= 31) {
      const day = String(dVal).padStart(2, '0');
      birthDate = `${day}.${month}.${year}`;
      remainder = remainder.replace(tmMatch[0], ' ');
      return { birthDate, remainder: cleanWhitespace(remainder) };
    }
  }

  // 4. Excel serial date if standalone
  const serialDate = parseExcelSerialDate(text);
  if (serialDate) {
    return { birthDate: serialDate, remainder: '' };
  }

  return { birthDate: '', remainder: cleanWhitespace(remainder) };
}

/**
 * Extracts and standardizes Passport, ID card, PINFL, or Birth Certificate (Metrika)
 * Supports both Latin and Cyrillic series letters, Roman and Arabic numbers (1-TN, I-TN, 1-ТН, 1-ТШ, 1-БХ, etc.).
 * Examples:
 * - Metrika: "I-TN 1234567", "1-TN 1234567", "II-FR 765432", "1-ФР 0585496", "TN 1234567", "1-ТШ 1234567"
 * - Passport: "AA 1234567", "АА 1234567", "AB 7654321", "ФА 1234567", "AA1234567"
 * - PINFL: "52301055550012" (14 digits)
 */
export function extractPassportOrId(text: string): { passportOrId: string; remainder: string } {
  if (!text) return { passportOrId: '', remainder: '' };

  let remainder = text;
  const normalized = normalizePassportLetters(text);

  // 1. Birth certificate with Roman or Arabic prefix (1-TN, I-TN, 1-FR, 1-ТН, 1-ТШ, II-TO)
  const metrikaPrefixRegex = /\b((?:I{1,3}|IV|V|VI|[1-3])\s*[-_/\s]?\s*[A-Z]{2,4}\s*(?:№|no\.?|#)?\s*\d{5,8})\b/i;
  const mMatch = normalized.match(metrikaPrefixRegex);
  if (mMatch) {
    const rawMatch = mMatch[1];
    const parts = rawMatch.match(/^([IVX1-3]+)[-_/\s]*([A-Z]{2,4})[-_/\s]*(?:№|no\.?|#)?[-_/\s]*(\d{5,8})$/i);
    let cleanId = rawMatch.toUpperCase().replace(/\s+/g, ' ');
    if (parts) {
      let rom = parts[1].toUpperCase()
        .replace(/^1$/, 'I')
        .replace(/^2$/, 'II')
        .replace(/^3$/, 'III');
      cleanId = `${rom}-${parts[2].toUpperCase()} ${parts[3]}`;
    }
    const origSlice = text.slice(mMatch.index || 0, (mMatch.index || 0) + mMatch[0].length);
    remainder = remainder.replace(origSlice, ' ');
    return { passportOrId: cleanId, remainder: cleanWhitespace(remainder) };
  }

  // 2. Metrika series without prefix: TN, TSH, FR, AN, NM, SM, BX, BH, QSH, KSH, SR, JZ, NV, XR, QR, DZ, BG, TO, QD, TM, SV
  const metrikaRegionalRegex = /\b(TN|TSH|FR|AN|NM|SM|BX|BH|QSH|KSH|SR|JZ|NV|XR|QR|DZ|BG|TO|QD|TM|SV)\s*(?:№|no\.?|#)?\s*(\d{6,8})\b/i;
  const regMatch = normalized.match(metrikaRegionalRegex);
  if (regMatch) {
    const cleanId = `I-${regMatch[1].toUpperCase()} ${regMatch[2]}`;
    const origSlice = text.slice(regMatch.index || 0, (regMatch.index || 0) + regMatch[0].length);
    remainder = remainder.replace(origSlice, ' ');
    return { passportOrId: cleanId, remainder: cleanWhitespace(remainder) };
  }

  // 3. Biometric Passport / ID card: 2 letters + 7 digits (AA 1234567 or AA1234567)
  const passRegex = /\b([A-Z]{2})\s*[-_/\s]?\s*(\d{7})\b/i;
  const pMatch = normalized.match(passRegex);
  if (pMatch) {
    const cleanId = `${pMatch[1].toUpperCase()} ${pMatch[2]}`;
    const origSlice = text.slice(pMatch.index || 0, (pMatch.index || 0) + pMatch[0].length);
    remainder = remainder.replace(origSlice, ' ');
    return { passportOrId: cleanId, remainder: cleanWhitespace(remainder) };
  }

  // 4. JSHSHIR / PINFL: exactly 14 digits (with optional spaces between groups)
  const pinflRegex = /\b([1-6]\s*\d{3}\s*\d{4}\s*\d{4}\s*\d{2}|\b[1-6]\d{13})\b/;
  const pinflMatch = text.match(pinflRegex);
  if (pinflMatch) {
    const cleanId = pinflMatch[1].replace(/\s+/g, '');
    remainder = remainder.replace(pinflMatch[0], ' ');
    return { passportOrId: cleanId, remainder: cleanWhitespace(remainder) };
  }

  // 5. Standalone document number after "№" or "No"
  const docNumMatch = text.match(/\b(?:№|no\.?|#)\s*(\d{6,8})\b/i);
  if (docNumMatch) {
    remainder = remainder.replace(docNumMatch[0], ' ');
    return { passportOrId: docNumMatch[1], remainder: cleanWhitespace(remainder) };
  }

  return { passportOrId: '', remainder: cleanWhitespace(remainder) };
}

/**
 * Cleans name string by safely removing:
 * - Leading table row numbers ("1.", "2)", "03 - ")
 * - Phone numbers (+998...)
 * - Explicit address clauses
 * - Document/school indicator keywords
 * Preserves authentic Uzbek names (including Qo'chqor, Shamsiyev, To'xtasinov, etc.)
 * Trims cleanly at patronymic ("o'g'li", "qizi", "-ovich", "-ovna")
 */
export function cleanFullName(rawName: string): string {
  if (!rawName) return '';

  let str = normalizeUzbekApostrophes(rawName.trim());

  // 1. Remove leading row indices: "1.", "2)", "3 - ", "1:"
  str = str.replace(/^\s*\d+[\.\)\-\:\s]+/, '');

  // 2. Remove phone numbers (+998 or 9 digits)
  str = str.replace(/(?:\+?998[\s\-]?)?(?:\(?\d{2}\)?[\s\-]?)?\d{3}[\s\-]?\d{2}[\s\-]?\d{2}/g, ' ');
  str = str.replace(/\+?998\d{9}/g, ' ');
  str = str.replace(/\b\d{9}\b/g, ' ');

  // 3. Remove passports or IDs if leaked in name string
  str = str.replace(/\b(?:I{1,3}|IV|V|[1-3])\s*[-_/\s]?\s*[A-Za-z\u0400-\u04FF]{2,4}\s*(?:№|no\.?|#)?\s*\d{5,8}\b/gi, ' ');
  str = str.replace(/\b[A-Za-z\u0400-\u04FF]{2}\s*[-_/\s]?\s*\d{7}\b/g, ' ');
  str = str.replace(/\b\d{14}\b/g, ' ');

  // 4. Remove dates if leaked
  str = str.replace(/\b\d{1,2}[\.\/\-]\d{1,2}[\.\/\-]\d{2,4}\b/g, ' ');

  // 5. Remove known address clauses safely (do NOT use broad .*$ that deletes names!)
  str = str.replace(/\b(?:toshkent|samarqand|farg['`’]ona|andijon|namangan|buxoro|xorazm|qashqadaryo|surxondaryo|jizzax|sirdaryo|navoiy|qoraqalpog['`’]iston)\s+(?:viloyat[ia]?|shahar|shahri)?\b/gi, ' ');
  str = str.replace(/\b(?:viloyat[ia]|tuman[ia]|shahri|qishlog['`’]i|mahallas[ia]|mfy|qfy|ko['`’]chasi|xonadon|kvartira)\b/gi, ' ');

  // 6. Remove gender tokens
  str = str.replace(/\b(erkak|ayol|o'g'il bola|qiz bola|o'g'il|qiz|jinsi|еркак|аёл)\b/gi, ' ');

  // 7. Remove school / class indicators
  str = str.replace(/\b\d{1,2}\s*[-_]?\s*[A-Za-z\u0400-\u04FF]\s*(?:sinf|sinfi)?\b/gi, ' ');
  str = str.replace(/\b(?:maktab|maktabi|umumta'lim|litsey|kollej)\b/gi, ' ');

  // 8. Remove document labels
  str = str.replace(/\b(?:pasport|metrika|guvohnoma|hujjat|seriya|raqami|jshshir|pinfl)\b/gi, ' ');

  // 9. Remove noise symbols
  str = str.replace(/[\|\;\,]/g, ' ');

  // Split into words and only keep valid name words
  const rawWords = str
    .split(/\s+/)
    .map(w => w.replace(/^[^a-zA-Z\u0400-\u04FF'-]+|[^a-zA-Z\u0400-\u04FF'-]+$/g, ''))
    .filter(w => w.length > 0 && /^[a-zA-Z\u0400-\u04FF'-]+$/.test(w));

  if (rawWords.length < 2) return '';

  // In Uzbek names, stop at the patronymic ("o'g'li", "qizi", "-ovich", "-ovna")
  let nameWords = rawWords.slice(0, 5);
  for (let i = 1; i < nameWords.length; i++) {
    const w = nameWords[i].toLowerCase();
    if (w === "o'g'li" || w === "qizi" || w === "ogli" || w === "ugli" || w === "kizi" || w === "ўғли" || w === "қизи" || w === "угли" || w === "кизи") {
      nameWords = nameWords.slice(0, i + 1);
      break;
    }
    if (/(?:ovich|ovna|yevich|yevna|ович|овна|евич|евна)$/i.test(w)) {
      nameWords = nameWords.slice(0, i + 1);
      break;
    }
  }

  if (nameWords.length < 2) return '';

  return formatUzbekName(nameWords.join(' '));
}

function cleanWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Parses a single text line into student info
 */
export function parseSingleStudentLine(line: string): ParsedStudentPreview | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length < 3) return null;

  // Skip table header lines
  if (/^(№|t\/r|tartib|f\.i\.sh|fio|familiya|ism|sharif|o'quvchi|sinf|pasport|metrika|hujjat|tug'ilgan|sana|jinsi|manzil|telefon)/i.test(trimmed)) {
    return null;
  }

  // If line contains multiple cells separated by tab, semicolon, comma, or pipe
  let parts: string[] = [];
  if (trimmed.includes('\t')) {
    parts = trimmed.split('\t').map(p => p.trim());
  } else if (trimmed.includes('|') && trimmed.split('|').length >= 3) {
    parts = trimmed.split('|').map(p => p.trim()).filter(Boolean);
  } else if (trimmed.includes(';') && trimmed.split(';').length >= 3) {
    parts = trimmed.split(';').map(p => p.trim());
  } else if (trimmed.includes(',') && trimmed.split(',').length >= 3) {
    parts = trimmed.split(',').map(p => p.trim());
  }

  if (parts.length >= 2) {
    let nameCandidate = '';
    let birthCandidate = '';
    let passCandidate = '';

    // Check adjacent cells for series + document number (e.g. "AA" in one cell, "1234567" in next)
    for (let i = 0; i < parts.length - 1; i++) {
      if (!passCandidate) {
        const combined = `${parts[i]} ${parts[i + 1]}`.trim();
        const { passportOrId } = extractPassportOrId(combined);
        if (passportOrId) {
          passCandidate = passportOrId;
        }
      }
    }

    for (const part of parts) {
      if (!part) continue;
      // Skip pure line number cells (e.g. "1", "24", "10.")
      if (/^\s*\d{1,3}[\.\)\-]?\s*$/.test(part)) {
        continue;
      }

      // Check date
      if (!birthCandidate) {
        const { birthDate } = extractBirthDate(part);
        if (birthDate) {
          birthCandidate = birthDate;
          continue;
        }
      }

      // Check passport / metrika
      if (!passCandidate) {
        const { passportOrId } = extractPassportOrId(part);
        if (passportOrId) {
          passCandidate = passportOrId;
          continue;
        }
      }

      // Check name (ignore address/phone parts)
      if (!nameCandidate) {
        // Skip obvious address or phone parts
        if (/\b(?:viloyat|tuman|shahar|qishloq|mahalla|ko'cha|uy|xonadon|\+?998)\b/i.test(part)) {
          continue;
        }
        const cleaned = cleanFullName(part);
        if (cleaned && cleaned.split(/\s+/).length >= 2) {
          nameCandidate = cleaned;
        }
      }
    }

    if (nameCandidate) {
      return {
        fullName: nameCandidate,
        birthDate: birthCandidate,
        passportOrId: passCandidate,
      };
    }
  }

  // Fallback: Line-wide extraction
  // Only strip leading row index if followed by a letter (start of name)
  let workingText = trimmed.replace(/^\s*\d{1,3}[\.\)\-\:\s]+\s*(?=[A-Za-z\u0400-\u04FF])/, '');

  // 1. Extract birth date
  const dateRes = extractBirthDate(workingText);
  const birthDate = dateRes.birthDate;
  workingText = dateRes.remainder;

  // 2. Extract passport / metrika
  const passRes = extractPassportOrId(workingText);
  const passportOrId = passRes.passportOrId;
  workingText = passRes.remainder;

  // 3. Extract and clean full name
  const fullName = cleanFullName(workingText);

  if (fullName && fullName.split(/\s+/).length >= 2) {
    return {
      fullName,
      birthDate,
      passportOrId,
    };
  }

  return null;
}

/**
 * Main parser for multi-line text (from Word, text files, clipboard, CSV)
 */
export function parseStudentsFromText(rawText: string): ParsedStudentPreview[] {
  if (!rawText) return [];
  const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const results: ParsedStudentPreview[] = [];

  for (const line of lines) {
    const student = parseSingleStudentLine(line);
    if (student) {
      results.push(student);
    }
  }

  return results;
}
