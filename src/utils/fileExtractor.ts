import * as XLSX from 'xlsx';
import mammoth from 'mammoth';
import {
  parseStudentsFromText,
  parseSingleStudentLine,
  cleanFullName,
  extractBirthDate,
  extractPassportOrId,
  ParsedStudentPreview,
} from './studentParser';

export interface ExtractedDocumentResult {
  rawText: string;
  detectedClassName?: string;
  detectedTeacherName?: string;
  students: ParsedStudentPreview[];
}

/**
 * Converts an Excel serial date number (e.g. 40250) into DD.MM.YYYY string
 */
function parseExcelSerialDate(val: any): string {
  if (typeof val === 'number' && val > 20000 && val < 60000) {
    try {
      const utcDays = Math.floor(val - 25569);
      const utcValue = utcDays * 86400;
      const dateInfo = new Date(utcValue * 1000);
      const day = String(dateInfo.getDate()).padStart(2, '0');
      const month = String(dateInfo.getMonth() + 1).padStart(2, '0');
      const year = dateInfo.getFullYear();
      return `${day}.${month}.${year}`;
    } catch {
      return '';
    }
  }
  return '';
}

/**
 * Extracts student records and class info from any school file (Excel, Word, CSV, Text)
 */
export async function extractStudentsFromFile(file: File): Promise<ExtractedDocumentResult> {
  const fileName = file.name.toLowerCase();

  // ==========================================
  // 1. EXCEL FILES (.xlsx, .xls)
  // ==========================================
  if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    // Convert worksheet to 2D array of rows
    const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false });
    
    let detectedClassName = '';
    let detectedTeacherName = '';
    const students: ParsedStudentPreview[] = [];
    const textLines: string[] = [];

    // Header column indices
    let headerRowIndex = -1;
    let fullNameCol = -1;
    let birthDateCol = -1;
    let passportCol = -1;

    // Scan top rows to detect class/teacher info and table headers
    for (let r = 0; r < Math.min(rawRows.length, 15); r++) {
      const row = rawRows[r];
      if (!Array.isArray(row) || row.length === 0) continue;

      const rowStr = row.map(cell => (cell ? String(cell).trim() : '')).filter(Boolean).join(' ');

      // Check class name (e.g. "9-A", "10-B", "11-A")
      if (!detectedClassName) {
        const classMatch = rowStr.match(/\b([1-9]|1[0-1])\s*[-_]?\s*([A-Za-z\u0400-\u04FF])(?:\s*sinf|\b)/i);
        if (classMatch) {
          detectedClassName = `${classMatch[1]}-${classMatch[2].toUpperCase()}`;
        }
      }

      // Check teacher name (e.g. "Sinf rahbari: Niyozmatova Ziyoda")
      if (!detectedTeacherName) {
        const teacherMatch = rowStr.match(/(?:sinf\s+rahbari|rahbar|o'qituvchi|ustoz)[\s:]+([A-Za-z\u0400-\u04FF\s'\`’]{5,35})/i);
        if (teacherMatch) {
          detectedTeacherName = teacherMatch[1].trim();
        }
      }

      // Check if this row is the table header
      let hasNameHeader = false;
      row.forEach((cell, colIdx) => {
        if (!cell) return;
        const s = String(cell).toLowerCase().trim();
        if (/(f\.?i\.?sh|fio|familiya|ism|sharif|o'quvchi|familiyasi)/i.test(s)) {
          fullNameCol = colIdx;
          hasNameHeader = true;
        } else if (/(tug'ilgan|sana|yil|t\.yil|tugilgan|birth)/i.test(s)) {
          birthDateCol = colIdx;
        } else if (/(pasport|metrika|guvohnoma|hujjat|seriya|jshshir|pinfl|id)/i.test(s)) {
          passportCol = colIdx;
        }
      });

      if (hasNameHeader) {
        headerRowIndex = r;
        break;
      }
    }

    // Process rows
    for (let r = 0; r < rawRows.length; r++) {
      const row = rawRows[r];
      if (!Array.isArray(row) || row.length === 0) continue;

      const rowStr = row.map(cell => (cell ? String(cell).trim() : '')).filter(Boolean).join(' ');
      if (rowStr) textLines.push(rowStr);

      // Skip rows at or before header
      if (headerRowIndex !== -1 && r <= headerRowIndex) {
        continue;
      }

      // A. Column-indexed extraction (highest precision)
      if (fullNameCol !== -1) {
        const rawName = row[fullNameCol] ? String(row[fullNameCol]).trim() : '';
        const name = cleanFullName(rawName);

        // Skip non-name entries
        if (name && name.split(/\s+/).length >= 2 && !/^(f\.?i\.?sh|familiya|ism|o'quvchi)/i.test(name)) {
          // Extract birth date
          let bDate = '';
          if (birthDateCol !== -1 && row[birthDateCol]) {
            const rawVal = row[birthDateCol];
            const serialDate = parseExcelSerialDate(rawVal);
            bDate = serialDate || extractBirthDate(String(rawVal)).birthDate;
          }

          // Extract passport / metrika
          let pId = '';
          if (passportCol !== -1 && row[passportCol]) {
            pId = extractPassportOrId(String(row[passportCol])).passportOrId;
          }

          // If birth date or passport were not in designated columns, inspect other cells
          if (!bDate || !pId) {
            row.forEach((cell, cIdx) => {
              if (cIdx === fullNameCol || !cell) return;
              const cellStr = String(cell).trim();
              if (!bDate) {
                const sDate = parseExcelSerialDate(cell);
                bDate = sDate || extractBirthDate(cellStr).birthDate;
              }
              if (!pId) {
                pId = extractPassportOrId(cellStr).passportOrId;
              }
            });
          }

          students.push({
            fullName: name,
            birthDate: bDate,
            passportOrId: pId,
          });
          continue;
        }
      }

      // B. Intelligent cell-by-cell inspection fallback
      let nameCandidate = '';
      let birthCandidate = '';
      let passCandidate = '';

      for (const cell of row) {
        if (!cell) continue;
        const str = String(cell).trim();

        // Skip header words
        if (/^(№|t\/r|tartib|f\.i\.sh|familiya|ism|tug'ilgan|pasport|seriya|hujjat)/i.test(str)) {
          continue;
        }

        // Check date
        if (!birthCandidate) {
          const sDate = parseExcelSerialDate(cell);
          const { birthDate } = extractBirthDate(str);
          if (sDate || birthDate) {
            birthCandidate = sDate || birthDate;
            continue;
          }
        }

        // Check passport / metrika
        if (!passCandidate) {
          const { passportOrId } = extractPassportOrId(str);
          if (passportOrId) {
            passCandidate = passportOrId;
            continue;
          }
        }

        // Check name (ignore address/phone parts)
        if (!nameCandidate) {
          if (/\b(?:viloyat|tuman|shahar|qishloq|mahalla|ko'cha|uy|xonadon|\+?998)\b/i.test(str)) {
            continue;
          }
          const cleaned = cleanFullName(str);
          if (cleaned && cleaned.split(/\s+/).length >= 2) {
            nameCandidate = cleaned;
          }
        }
      }

      if (nameCandidate) {
        students.push({
          fullName: nameCandidate,
          birthDate: birthCandidate,
          passportOrId: passCandidate,
        });
      }
    }

    if (students.length > 0) {
      return {
        rawText: textLines.join('\n'),
        detectedClassName,
        detectedTeacherName,
        students,
      };
    }

    // Fallback: parse entire combined text
    const textAll = textLines.join('\n');
    return {
      rawText: textAll,
      detectedClassName,
      detectedTeacherName,
      students: parseStudentsFromText(textAll),
    };
  }

  // ==========================================
  // 2. WORD DOCUMENTS (.docx)
  // ==========================================
  if (fileName.endsWith('.docx')) {
    const buffer = await file.arrayBuffer();

    // Convert Word doc to HTML to preserve table rows and cells accurately
    const htmlResult = await mammoth.convertToHtml({ arrayBuffer: buffer });
    const rawResult = await mammoth.extractRawText({ arrayBuffer: buffer });
    const text = rawResult.value || '';
    const html = htmlResult.value || '';

    let detectedClassName = '';
    let detectedTeacherName = '';

    const classMatch = text.match(/\b([1-9]|1[0-1])\s*[-_]?\s*([A-Za-z\u0400-\u04FF])(?:\s*sinf|\b)/i);
    if (classMatch) {
      detectedClassName = `${classMatch[1]}-${classMatch[2].toUpperCase()}`;
    }

    const teacherMatch = text.match(/(?:sinf\s+rahbari|rahbar|o'qituvchi|ustoz)[\s:]+([A-Za-z\u0400-\u04FF\s'\`’]{5,35})/i);
    if (teacherMatch) {
      detectedTeacherName = teacherMatch[1].trim();
    }

    // If document contains HTML tables:
    const students: ParsedStudentPreview[] = [];
    if (html.includes('<table')) {
      const rowMatches = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi);
      if (rowMatches && rowMatches.length > 0) {
        for (const tr of rowMatches) {
          const cellMatches = tr.match(/<td[^>]*>([\s\S]*?)<\/td>/gi);
          if (!cellMatches || cellMatches.length === 0) continue;

          const cells = cellMatches.map(td => td.replace(/<[^>]+>/g, '').trim());
          const lineStr = cells.join('\t');
          const parsed = parseSingleStudentLine(lineStr);
          if (parsed) {
            students.push(parsed);
          }
        }
      }
    }

    if (students.length > 0) {
      return {
        rawText: text,
        detectedClassName,
        detectedTeacherName,
        students,
      };
    }

    // Fallback: parse plain text
    return {
      rawText: text,
      detectedClassName,
      detectedTeacherName,
      students: parseStudentsFromText(text),
    };
  }

  // ==========================================
  // 3. TEXT / CSV / TSV FILES (.txt, .csv, .tsv)
  // ==========================================
  const text = await file.text();

  let detectedClassName = '';
  let detectedTeacherName = '';

  const classMatch = text.match(/\b([1-9]|1[0-1])\s*[-_]?\s*([A-Za-z\u0400-\u04FF])(?:\s*sinf|\b)/i);
  if (classMatch) {
    detectedClassName = `${classMatch[1]}-${classMatch[2].toUpperCase()}`;
  }

  const teacherMatch = text.match(/(?:sinf\s+rahbari|rahbar|o'qituvchi|ustoz)[\s:]+([A-Za-z\u0400-\u04FF\s'\`’]{5,35})/i);
  if (teacherMatch) {
    detectedTeacherName = teacherMatch[1].trim();
  }

  const students = parseStudentsFromText(text);

  return {
    rawText: text,
    detectedClassName,
    detectedTeacherName,
    students,
  };
}
