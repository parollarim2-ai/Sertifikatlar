export interface ParsedStudentPreview {
  fullName: string;
  birthDate: string;
  passportOrId: string;
}

/**
 * Normalizes Uzbek and Cyrillic names into Title Case
 * e.g. "ABDURASULOV FAYZULLOH ABDURAHIM O'G'LI" -> "Abdurasulov Fayzulloh Abdurahim o'g'li"
 */
export function formatUzbekName(name: string): string {
  if (!name) return '';
  const words = name.trim().split(/\s+/);
  return words
    .map((word, idx) => {
      const lower = word.toLowerCase();
      // Handle Uzbek patronymics: o'g'li, qizi, o‘g‘li, qizi
      if ((lower === "o'g'li" || lower === "o‘g‘li" || lower === "o`g`li" || lower === "qizi") && idx > 1) {
        return "o'g'li";
      }
      if (lower === "qizi" && idx > 1) {
        return "qizi";
      }
      // Preserve apostrophes inside names e.g. G'ayrat, Ulug'bek, Ma'ruf
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

/**
 * Extracts and standardizes birth dates (DD.MM.YYYY)
 */
export function extractBirthDate(text: string): { birthDate: string; remainder: string } {
  if (!text) return { birthDate: '', remainder: '' };

  let remainder = text;
  let birthDate = '';

  // 1. Standard numeric formats: DD.MM.YYYY, DD/MM/YYYY, DD-MM-YYYY
  const dmyMatch = text.match(/\b([0-3]?\d)[\.\/\-]([0-1]?\d)[\.\/\-](\d{2,4})\b/);
  if (dmyMatch) {
    let day = dmyMatch[1].padStart(2, '0');
    let month = dmyMatch[2].padStart(2, '0');
    let year = dmyMatch[3];
    if (year.length === 2) {
      year = parseInt(year, 10) > 30 ? `19${year}` : `20${year}`;
    }
    birthDate = `${day}.${month}.${year}`;
    remainder = remainder.replace(dmyMatch[0], ' ');
    return { birthDate, remainder: cleanWhitespace(remainder) };
  }

  // 2. ISO format: YYYY-MM-DD or YYYY.MM.DD
  const ymdMatch = text.match(/\b(\d{4})[\.\/\-]([0-1]?\d)[\.\/\-]([0-3]?\d)\b/);
  if (ymdMatch) {
    const year = ymdMatch[1];
    const month = ymdMatch[2].padStart(2, '0');
    const day = ymdMatch[3].padStart(2, '0');
    birthDate = `${day}.${month}.${year}`;
    remainder = remainder.replace(ymdMatch[0], ' ');
    return { birthDate, remainder: cleanWhitespace(remainder) };
  }

  // 3. Uzbek text month format: "15-may 2009" or "15 may 2009-yil"
  const textMonthRegex = /\b([0-3]?\d)\s*[-_ ]?\s*(yanvar|fevral|mart|aprel|may|iyun|iyul|avgust|sentabr|oktabr|noyabr|dekabr|январ|феврал|март|апрел|май|июн|июл|август|сентабр|октябр|ноябр|декабр)\s*[-_ ,]?\s*(\d{4})(?:\s*[-_]?\s*yil|\s*[-_]?\s*й\.?)?\b/i;
  const tmMatch = text.match(textMonthRegex);
  if (tmMatch) {
    const day = tmMatch[1].padStart(2, '0');
    const monthMap: Record<string, string> = {
      yanvar: '01', fevral: '02', mart: '03', aprel: '04', may: '05', iyun: '06',
      iyul: '07', avgust: '08', sentabr: '09', oktabr: '10', noyabr: '11', dekabr: '12',
      январ: '01', феврал: '02', март: '03', апрел: '04', май: '05', июн: '06',
      июл: '07', август: '08', сентабр: '09', октябр: '10', ноябр: '11', декабр: '12',
    };
    const month = monthMap[tmMatch[2].toLowerCase()] || '01';
    const year = tmMatch[3];
    birthDate = `${day}.${month}.${year}`;
    remainder = remainder.replace(tmMatch[0], ' ');
    return { birthDate, remainder: cleanWhitespace(remainder) };
  }

  return { birthDate: '', remainder: cleanWhitespace(remainder) };
}

/**
 * Extracts and standardizes Passport, ID card, PINFL, or Birth Certificate (Metrika)
 * Examples:
 * - Metrika: "I-TN 123456", "II-FR 765432", "I-АН 123456", "I-TO 0521092"
 * - Passport: "AA 1234567", "AB 7654321", "FA 1234567"
 * - PINFL: "52301055550012" (14 digits)
 */
export function extractPassportOrId(text: string): { passportOrId: string; remainder: string } {
  if (!text) return { passportOrId: '', remainder: '' };

  let remainder = text;

  // 1. Birth certificate / Metrika:
  // Roman numeral (I, II, III, IV, V) + optional hyphen/space + 2 to 4 letters (Latin or Cyrillic) + optional No/№ + 5 to 7 digits
  const metrikaRegex = /\b((?:I{1,3}|IV|V|VI)\s*[-_/\s]?\s*[A-Za-z\u0400-\u04FF]{2,4}\s*(?:№|no\.?|#)?\s*\d{5,8})\b/i;
  const metrikaMatch = text.match(metrikaRegex);
  if (metrikaMatch) {
    const cleanId = metrikaMatch[1]
      .replace(/\s+/g, ' ')
      .replace(/[-_/\s]+/g, '-')
      .replace(/-(?:№|no\.?|#)?-?/i, ' ')
      .toUpperCase()
      .trim();
    remainder = remainder.replace(metrikaMatch[0], ' ');
    return { passportOrId: cleanId, remainder: cleanWhitespace(remainder) };
  }

  // 2. Passport / ID card: 2 letters + 7 digits (e.g. AA 1234567 or AB1234567)
  const passRegex = /\b([A-Za-z]{2}\s*[-_/\s]?\s*\d{7})\b/;
  const passMatch = text.match(passRegex);
  if (passMatch) {
    const raw = passMatch[1].replace(/[-_/\s]+/g, '').toUpperCase();
    const cleanId = `${raw.slice(0, 2)} ${raw.slice(2)}`;
    remainder = remainder.replace(passMatch[0], ' ');
    return { passportOrId: cleanId, remainder: cleanWhitespace(remainder) };
  }

  // 3. JSHSHIR / PINFL: exactly 14 digits starting with 1-6
  const pinflRegex = /\b([1-6]\d{13})\b/;
  const pinflMatch = text.match(pinflRegex);
  if (pinflMatch) {
    const cleanId = pinflMatch[1];
    remainder = remainder.replace(pinflMatch[0], ' ');
    return { passportOrId: cleanId, remainder: cleanWhitespace(remainder) };
  }

  return { passportOrId: '', remainder: cleanWhitespace(remainder) };
}

/**
 * Cleans name string by strictly removing:
 * - Addresses (viloyat, tuman, shahar, qishloq, mahalla, MFY, ko'cha, uy, xonadon)
 * - Phone numbers (+998...)
 * - Gender (erkak, ayol, o'g'il, qiz)
 * - School, class, nationality tokens
 * - Table line numbers
 * Returns purely: Familiya Ism Sharif (e.g. "Abdurasulov Fayzulloh Abdurahim o'g'li")
 */
export function cleanFullName(rawName: string): string {
  if (!rawName) return '';

  let str = rawName.trim();

  // Remove leading row indices: "1.", "2)", "3 - ", "1:"
  str = str.replace(/^\s*\d+[\.\)\-\:\s]+/, '');

  // Remove phone numbers (+998 or 9 digits)
  str = str.replace(/(?:\+?998[\s\-]?)?(?:\(?\d{2}\)?[\s\-]?)?\d{3}[\s\-]?\d{2}[\s\-]?\d{2}/g, ' ');
  str = str.replace(/\+?998\d{9}/g, ' ');
  str = str.replace(/\b\d{9}\b/g, ' ');

  // Remove address patterns and anything following them:
  // e.g. "Toshkent viloyati, Parkent tumani...", "Yunusobod tumani...", "Mustaqillik ko'chasi 14-uy"
  const addressPrefixRegex = /\b(?:viloyat[ia]?|vil\.?|tuman[ia]?|tum\.?|shahar|shahri|sh\.?|qishloq|qishlog'i|mahalla|mahallas[ia]|mfy|qfy|ko'cha|ko'chasi|ko'ch\.?|uy|xonadon|kvartira|dom|ko'ch)\b.*$/i;
  str = str.replace(addressPrefixRegex, ' ');

  // Remove gender tokens
  str = str.replace(/\b(erkak|ayol|o'g'il bola|qiz bola|o'g'il|qiz|jinsi|еркак|аёл)\b/gi, ' ');

  // Remove school / class indicators
  str = str.replace(/\b\d{1,2}\s*[-_]?\s*[A-Za-z\u0400-\u04FF]\s*(?:sinf|sinfi)?\b/gi, ' ');
  str = str.replace(/\b(?:maktab|maktabi|maktabda|umumta'lim|litsey|kollej)\b.*$/i, ' ');

  // Remove common document labels
  str = str.replace(/\b(?:pasport|metrika|guvohnoma|hujjat|seriya|raqam|raqami|jshshir|pinfl)\b.*$/i, ' ');

  // Remove separators like |, ;, commas
  str = str.replace(/[\|\;\,]/g, ' ');

  // Split into words and only keep valid name words (letters, apostrophes, hyphens)
  const words = str
    .split(/\s+/)
    .map(w => w.replace(/^[^a-zA-Z\u0400-\u04FF]+|[^a-zA-Z\u0400-\u04FF]+$/g, ''))
    .filter(w => w.length > 0 && /^[a-zA-Z\u0400-\u04FF'`’‘-]+$/.test(w));

  // A student's name in Uzbek documents is at most 4 words: Familiya + Ism + Sharif (Otasining ismi o'g'li/qizi)
  const nameWords = words.slice(0, 4);
  if (nameWords.length === 0) return '';

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

    for (let part of parts) {
      if (!part) continue;
      part = part.replace(/^\s*\d+[\.\)\-\:\s]+/, '').trim();

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
  let workingText = trimmed.replace(/^\s*\d+[\.\)\-\:\s]+/, '');

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
