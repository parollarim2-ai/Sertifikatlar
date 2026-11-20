import type { Student } from '../types';
import { formatBirthDateToDDMMYYYY, getStudentTrackData } from './studentLoginHelper';

export interface GoogleSheetsFixedDefaults {
  position: string;
  email: string;
  phone: string;
  school: string;
}

export const DEFAULT_GOOGLE_SHEETS_FIELDS: GoogleSheetsFixedDefaults = {
  position: "O'quvchi",
  email: 'akramxonsaidov01@gmail.com',
  phone: '+998880055688',
  school: '16-maktab',
};

const STORAGE_KEY_SHEETS_DEFAULTS = 'courseradan_google_sheets_defaults_v1';

export function loadGoogleSheetsDefaults(): GoogleSheetsFixedDefaults {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SHEETS_DEFAULTS);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        position: typeof parsed.position === 'string' && parsed.position.trim() ? parsed.position.trim() : DEFAULT_GOOGLE_SHEETS_FIELDS.position,
        email: typeof parsed.email === 'string' && parsed.email.trim() ? parsed.email.trim() : DEFAULT_GOOGLE_SHEETS_FIELDS.email,
        phone: typeof parsed.phone === 'string' && parsed.phone.trim() ? parsed.phone.trim() : DEFAULT_GOOGLE_SHEETS_FIELDS.phone,
        school: typeof parsed.school === 'string' && parsed.school.trim() ? parsed.school.trim() : DEFAULT_GOOGLE_SHEETS_FIELDS.school,
      };
    }
  } catch {}
  return { ...DEFAULT_GOOGLE_SHEETS_FIELDS };
}

export function saveGoogleSheetsDefaults(defaults: GoogleSheetsFixedDefaults) {
  try {
    localStorage.setItem(STORAGE_KEY_SHEETS_DEFAULTS, JSON.stringify(defaults));
  } catch {}
}

/**
 * Strips tabs, newlines, and excess whitespace so a single cell NEVER spills into adjacent Google Sheets columns/rows.
 */
export function sanitizeSheetsCell(value?: string | null): string {
  if (!value) return '';
  return String(value)
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalizes any Cyrillic lookalikes inside document series to standard Latin uppercase.
 */
function normalizeSeriesChars(raw: string): string {
  const cyrToLat: Record<string, string> = {
    А: 'A', В: 'B', Е: 'E', К: 'K', М: 'M', Н: 'H', О: 'O', Р: 'P',
    С: 'C', Т: 'T', Х: 'X', И: 'I', Ф: 'F', Д: 'D', Ш: 'SH', Ч: 'CH',
  };
  return raw
    .toUpperCase()
    .replace(/[АВЕКМНОРСТХИФДШЧ]/g, (ch) => cyrToLat[ch] || ch)
    .replace(/[^A-Z0-9-]/g, ' ')
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

/**
 * Parses Uzbek Passport ("AD 1234567", "AE1234567") or Metrika ("I-FR 0539632", "0539632 I-FR", "A 1234567")
 * cleanly into separate series and number while strictly preserving leading zeros (e.g. "0539632").
 */
export function parseDocumentForSheets(passportOrId?: string): { series: string; number: string } {
  const raw = sanitizeSheetsCell(passportOrId).replace(/[№#]/g, ' ').trim();
  if (!raw) return { series: '', number: '' };

  // 1. Series followed by 5-9 digit number: "I-FR 0539632", "AD1234567", "I FR 0539632", "AD-1234567", "A 1234567"
  const seriesFirst = raw.match(/^([A-Za-zА-Яа-яЁё]{1,4}(?:[\s\-_]+[A-Za-zА-Яа-яЁё]{1,4})?)[\s\-_]*(\d{5,9})$/);
  if (seriesFirst) {
    return {
      series: normalizeSeriesChars(seriesFirst[1]),
      number: seriesFirst[2],
    };
  }

  // 2. Number followed by series: "0539632 I-FR", "1234567 AD"
  const numFirst = raw.match(/^(\d{5,9})[\s\-_]*([A-Za-zА-Яа-яЁё]{1,4}(?:[\s\-_]+[A-Za-zА-Яа-яЁё]{1,4})?)$/);
  if (numFirst) {
    return {
      series: normalizeSeriesChars(numFirst[2]),
      number: numFirst[1],
    };
  }

  // 3. Fallback: extract digit block (preserving leading zeros) and remaining letters as series
  const digitsMatch = raw.match(/\d{5,14}/);
  if (digitsMatch) {
    const number = digitsMatch[0];
    const withoutNum = (raw.slice(0, digitsMatch.index) + ' ' + raw.slice((digitsMatch.index || 0) + number.length)).trim();
    const series = normalizeSeriesChars(withoutNum);
    return { series, number };
  }

  return { series: '', number: raw };
}

/**
 * Formats an ISO date ("2026-03-14" or "2026-03-14T...") into "DD.MM.YYYY".
 */
export function formatCertDateForSheets(dateVal?: string): string {
  if (!dateVal) return '';
  const clean = sanitizeSheetsCell(dateVal);
  if (!clean) return '';

  const isoPrefix = clean.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoPrefix) {
    return `${isoPrefix[3]}.${isoPrefix[2]}.${isoPrefix[1]}`;
  }

  return formatBirthDateToDDMMYYYY(clean);
}

export interface GoogleSheetsExportRow {
  studentId: string;
  position: string;          // Col 1 (after manual №): Lavozimi ("O'quvchi")
  fullName: string;          // Col 2: FIO
  birthDate: string;         // Col 3: Tug'ilgan kun oy yil (DD.MM.YYYY)
  docSeries: string;         // Col 4: Pasport (yoki metrika) harfi
  docNumber: string;         // Col 5: Metrika (yoki pasporti) raqami
  email: string;             // Col 6: Elektron pochtasi
  phone: string;             // Col 7: Telefon raqami
  school: string;            // Col 8: Maktabi
  registeredDate: string;    // Col 9: Ro'yxatdan o'tgan sanasi
  certifiedDate: string;     // Col 10: Sertifikat olgan sanasi
  certificateLink: string;   // Col 11: Sertifikat havolasi
  dateVerified: boolean;
  missingFields: string[];
}

export const GOOGLE_SHEETS_COLUMN_HEADERS = [
  'Lavozimi',
  'FIO',
  "Tug'ilgan sana",
  'Seriya',
  'Raqam',
  'Elektron pochta',
  'Telefon raqami',
  'Maktabi',
  "Ro'yxatdan o'tgan sana",
  'Sertifikat olgan sana',
  'Sertifikat havolasi',
] as const;

export function buildGoogleSheetsRows(
  students: Student[],
  activeTrack: 'ai' | 'developer',
  defaults: GoogleSheetsFixedDefaults,
  overrideDates?: Record<string, string>
): GoogleSheetsExportRow[] {
  const certifiedStudents = students
    .filter((st) => getStudentTrackData(st, activeTrack).status === 'certified')
    .sort((a, b) => a.fullName.trim().localeCompare(b.fullName.trim(), 'uz', { sensitivity: 'base' }));

  return certifiedStudents.map((st) => {
    const td = getStudentTrackData(st, activeTrack);
    const { series, number } = parseDocumentForSheets(st.passportOrId);
    const birthDate = formatBirthDateToDDMMYYYY(st.birthDate);
    const overrideIso = overrideDates?.[st.id];
    const verifiedIso = overrideIso || (td.certificateDateVerified ? td.certificateDate : '') || td.certificateDate || '';
    const certDate = formatCertDateForSheets(verifiedIso);
    const certLink = sanitizeSheetsCell(td.certificateLink);
    const fullName = sanitizeSheetsCell(st.fullName);

    const missingFields: string[] = [];
    if (!birthDate) missingFields.push("Tug'ilgan sana");
    if (!series) missingFields.push('Seriya');
    if (!number) missingFields.push('Raqam');
    if (!certDate) missingFields.push('Sertifikat sanasi');
    if (!certLink) missingFields.push('Havola');

    return {
      studentId: st.id,
      position: sanitizeSheetsCell(defaults.position),
      fullName,
      birthDate: sanitizeSheetsCell(birthDate),
      docSeries: sanitizeSheetsCell(series),
      docNumber: sanitizeSheetsCell(number),
      email: sanitizeSheetsCell(defaults.email),
      phone: sanitizeSheetsCell(defaults.phone),
      school: sanitizeSheetsCell(defaults.school),
      registeredDate: certDate,
      certifiedDate: certDate,
      certificateLink: certLink,
      dateVerified: Boolean(overrideIso || (td.certificateDateVerified && td.certificateDate)),
      missingFields,
    };
  });
}

function escapeHtmlAttr(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getRowTuple(row: GoogleSheetsExportRow): string[] {
  return [
    row.position,
    row.fullName,
    row.birthDate,
    row.docSeries,
    row.docNumber,
    row.email,
    row.phone,
    row.school,
    row.registeredDate,
    row.certifiedDate,
    row.certificateLink,
  ];
}

/**
 * Copies rows into the system clipboard using BOTH:
 * 1) `text/html` with Google Sheets native `data-sheets-value='{"1":2,"2":"..."}'` string literal markers
 *    so leading zeros (`0539632`), leading `+` (`+998880055688`), and `DD.MM.YYYY` dates are NEVER stripped or corrupted;
 * 2) `text/plain` clean tab-separated (TSV) rows as universal fallback.
 */
export async function copyRowsToClipboardForGoogleSheets(
  rows: GoogleSheetsExportRow[],
  includeHeaders: boolean = false
): Promise<{ method: 'html+tsv' | 'tsv'; rowCount: number }> {
  const allTuples: string[][] = [];
  if (includeHeaders) {
    allTuples.push([...GOOGLE_SHEETS_COLUMN_HEADERS]);
  }
  for (const r of rows) {
    allTuples.push(getRowTuple(r));
  }

  const tsv = allTuples.map((cols) => cols.map((c) => sanitizeSheetsCell(c)).join('\t')).join('\n');

  const htmlRows = allTuples
    .map((cols) => {
      const cells = cols
        .map((cell) => {
          const clean = sanitizeSheetsCell(cell);
          const sheetsPayload = JSON.stringify({ '1': 2, '2': clean });
          return `<td data-sheets-value='${escapeHtmlAttr(sheetsPayload)}' style="mso-number-format:'\\@';">${escapeHtmlAttr(clean)}</td>`;
        })
        .join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');

  const html = `<table><tbody>${htmlRows}</tbody></table>`;

  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    try {
      const item = new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([tsv], { type: 'text/plain' }),
      });
      await navigator.clipboard.write([item]);
      return { method: 'html+tsv', rowCount: rows.length };
    } catch {
      // Fall through to plain TSV writeText
    }
  }

  await navigator.clipboard.writeText(tsv);
  return { method: 'tsv', rowCount: rows.length };
}
