import * as XLSX from 'xlsx';
import mammoth from 'mammoth';
import { parseStudentsFromText, ParsedStudentPreview } from './studentParser';

export interface ExtractedDocumentResult {
  rawText: string;
  detectedClassName?: string;
  detectedTeacherName?: string;
  students: ParsedStudentPreview[];
}

/**
 * Extracts student records and class info from any file (Excel, Word, CSV, Text)
 */
export async function extractStudentsFromFile(file: File): Promise<ExtractedDocumentResult> {
  const fileName = file.name.toLowerCase();

  // 1. EXCEL FILES (.xlsx, .xls)
  if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    // Convert worksheet to 2D array of rows
    const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    
    let detectedClassName = '';
    let detectedTeacherName = '';
    const students: ParsedStudentPreview[] = [];
    const textLines: string[] = [];

    for (const row of rawRows) {
      if (!Array.isArray(row) || row.length === 0) continue;

      const rowStr = row.map(cell => (cell !== null && cell !== undefined ? String(cell).trim() : '')).filter(Boolean).join(' ');
      textLines.push(rowStr);

      // Check header for class name (e.g., "10-A", "9-B")
      if (!detectedClassName) {
        const classMatch = rowStr.match(/\b([1-9]|1[0-1])\s*[-_]?\s*([A-Za-z\u0400-\u04FF])\b/i);
        if (classMatch) {
          detectedClassName = `${classMatch[1]}-${classMatch[2].toUpperCase()}`;
        }
      }

      // Check header for teacher name
      if (!detectedTeacherName) {
        const teacherMatch = rowStr.match(/(?:sinf\s+rahbari|rahbar|o'qituvchi|ustoz)[\s:]+([A-Za-z\u0400-\u04FF\s'\`’]{5,35})/i);
        if (teacherMatch) {
          detectedTeacherName = teacherMatch[1].trim();
        }
      }

      // Identify student columns
      let nameCandidate = '';
      let birthCandidate = '';
      let passCandidate = '';

      for (const cell of row) {
        if (!cell) continue;
        const str = String(cell).trim();

        // Skip table headers
        if (/^(№|t\/r|tartib|f\.i\.sh|familiya|ism|tug'ilgan|pasport|seriya|hujjat)/i.test(str)) {
          continue;
        }

        // Check if date (DD.MM.YYYY or YYYY-MM-DD)
        if (/\b\d{1,2}[\.\/\-]\d{1,2}[\.\/\-]\d{2,4}\b/.test(str) || /\b\d{4}[\-\.\/]\d{1,2}[\-\.\/]\d{1,2}\b/.test(str)) {
          birthCandidate = str;
        }
        // Check if passport series (AA1234567, AB7654321, etc.)
        else if (/^[A-Za-z]{1,2}\s*[\-]?\s*\d{6,8}$/i.test(str) || /[A-Za-z]{1,2}\s*\d{7}/i.test(str)) {
          passCandidate = str.replace(/\s+/g, '').toUpperCase();
        }
        // Check if full name (at least 2 words with letters)
        else if (/[A-Za-z\u0400-\u04FF]/.test(str) && str.split(/\s+/).length >= 2 && !nameCandidate) {
          // Remove leading numbers like "1. " or "2) "
          nameCandidate = str.replace(/^\d+[\.\)\-]\s*/, '').trim();
        }
      }

      if (nameCandidate && nameCandidate.length >= 3) {
        students.push({
          fullName: nameCandidate,
          birthDate: birthCandidate,
          passportOrId: passCandidate,
        });
      }
    }

    // If structured extraction found students, return directly
    if (students.length > 0) {
      return {
        rawText: textLines.join('\n'),
        detectedClassName,
        detectedTeacherName,
        students,
      };
    }

    // Fallback: parse entire text representation
    const textAll = textLines.join('\n');
    return {
      rawText: textAll,
      detectedClassName,
      detectedTeacherName,
      students: parseStudentsFromText(textAll),
    };
  }

  // 2. WORD DOCUMENTS (.docx)
  if (fileName.endsWith('.docx')) {
    const buffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer: buffer });
    const text = result.value || '';

    // Detect class & teacher from text
    let detectedClassName = '';
    let detectedTeacherName = '';

    const classMatch = text.match(/\b([1-9]|1[0-1])\s*[-_]?\s*([A-Za-z\u0400-\u04FF])\s*sinf/i);
    if (classMatch) {
      detectedClassName = `${classMatch[1]}-${classMatch[2].toUpperCase()}`;
    }

    const teacherMatch = text.match(/(?:sinf\s+rahbari|rahbar|ustoz)[\s:]+([A-Za-z\u0400-\u04FF\s'\`’]{5,35})/i);
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

  // 3. TEXT / CSV FILES (.txt, .csv, .tsv)
  const text = await file.text();

  let detectedClassName = '';
  let detectedTeacherName = '';

  const classMatch = text.match(/\b([1-9]|1[0-1])\s*[-_]?\s*([A-Za-z\u0400-\u04FF])(?:\s*sinf|\b)/i);
  if (classMatch) {
    detectedClassName = `${classMatch[1]}-${classMatch[2].toUpperCase()}`;
  }

  const teacherMatch = text.match(/(?:sinf\s+rahbari|rahbar|ustoz)[\s:]+([A-Za-z\u0400-\u04FF\s'\`’]{5,35})/i);
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
