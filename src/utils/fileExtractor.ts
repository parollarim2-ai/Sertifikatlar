import * as XLSX from 'xlsx';
import mammoth from 'mammoth';
import {
  parseStudentsFromText,
  parseSingleStudentLine,
  cleanFullName,
  extractBirthDate,
  extractPassportOrId,
  parseExcelSerialDate,
  ParsedStudentPreview,
} from './studentParser';

export interface ExtractedDocumentResult {
  rawText: string;
  detectedClassName?: string;
  detectedTeacherName?: string;
  students: ParsedStudentPreview[];
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
    for (let r = 0; r < Math.min(rawRows.length, 25); r++) {
      const row = rawRows[r];
      if (!Array.isArray(row) || row.length === 0) continue;

      const rowStr = row.map(cell => (cell !== undefined && cell !== null ? String(cell).trim() : '')).filter(Boolean).join(' ');

      // Check class name (e.g. "9-A", "10-B", "11-A", "11 A")
      if (!detectedClassName) {
        const classMatch = rowStr.match(/\b([1-9]|1[0-1])\s*[-_ ]?\s*([A-Za-z\u0400-\u04FF])(?:\s*sinf|\b)/i);
        if (classMatch) {
          detectedClassName = `${classMatch[1]}-${classMatch[2].toUpperCase()}`;
        }
      }

      // Check teacher name (e.g. "Sinf rahbari: Niyozmatova Ziyoda")
      if (!detectedTeacherName) {
        const teacherMatch = rowStr.match(/(?:sinf\s+rahbari|rahbar|o['`’ʻ]qituvchi|ustoz)[\s:]+([A-Za-z\u0400-\u04FF\s'\`’ʻ]{5,35})/i);
        if (teacherMatch) {
          detectedTeacherName = teacherMatch[1].trim();
        }
      }

      // Check if this row is the table header
      let hasNameHeader = false;
      row.forEach((cell, colIdx) => {
        if (!cell) return;
        const s = String(cell).toLowerCase().trim();
        if (/(f\.?i\.?sh|fio|familiya|ism|sharif|o['`’ʻ]quvchi|familiyasi|o‘quvchilar|o'quvchilar|talaba|ism-sharifi)/i.test(s)) {
          fullNameCol = colIdx;
          hasNameHeader = true;
        } else if (/(tug['`’ʻ]ilgan|tugilgan|sana|t\.sana|t\.yil|t\.kuni|yil|birth|date|kuni)/i.test(s) && !/(berilgan|qabul|ro'yxat)/i.test(s)) {
          birthDateCol = colIdx;
        } else if (/(pasport|metrika|guvohnoma|hujjat\s*(?:seriya|raqam)|seriya\s*(?:va\s*)?raqam|jshshir|pinfl|id\s*(?:karta|raqam)?)/i.test(s) && !/(turi|telefon)/i.test(s)) {
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

      const rowStr = row.map(cell => (cell !== undefined && cell !== null ? String(cell).trim() : '')).filter(Boolean).join(' ');
      if (rowStr) textLines.push(rowStr);

      // Skip rows at or before header
      if (headerRowIndex !== -1 && r <= headerRowIndex) {
        continue;
      }

      // A. Column-indexed extraction
      if (fullNameCol !== -1) {
        const rawName = row[fullNameCol] !== undefined && row[fullNameCol] !== null ? String(row[fullNameCol]).trim() : '';
        const name = cleanFullName(rawName);

        // Skip non-name entries and headers
        if (name && name.split(/\s+/).length >= 2 && !/^(f\.?i\.?sh|familiya|ism|o['`’ʻ]quvchi|№|t\/r|tartib)/i.test(name)) {
          // Extract birth date
          let bDate = '';
          if (birthDateCol !== -1 && row[birthDateCol] !== undefined && row[birthDateCol] !== null) {
            const rawVal = row[birthDateCol];
            const serialDate = parseExcelSerialDate(rawVal);
            bDate = serialDate || extractBirthDate(String(rawVal)).birthDate;
          }

          // Extract passport / metrika
          let pId = '';
          if (passportCol !== -1 && row[passportCol] !== undefined && row[passportCol] !== null) {
            pId = extractPassportOrId(String(row[passportCol])).passportOrId;
          }

          // 1. Check adjacent cell pairs in this row (very common: series in Col C and number in Col D)
          if (!pId) {
            for (let c = 0; c < row.length - 1; c++) {
              if (c === fullNameCol || (c + 1) === fullNameCol) continue;
              const cell1 = String(row[c] || '').trim();
              const cell2 = String(row[c + 1] || '').trim();
              if (cell1 && cell2) {
                const combined = `${cell1} ${cell2}`;
                const { passportOrId } = extractPassportOrId(combined);
                if (passportOrId) {
                  pId = passportOrId;
                  break;
                }
              }
            }
          }

          // 2. Exhaustive cell-by-cell inspection fallback
          if (!bDate || !pId) {
            row.forEach((cell, cIdx) => {
              if (cIdx === fullNameCol || cell === undefined || cell === null) return;
              const cellStr = String(cell).trim();
              if (!bDate) {
                const sDate = parseExcelSerialDate(cell);
                const { birthDate } = extractBirthDate(cellStr);
                if (sDate || birthDate) bDate = sDate || birthDate;
              }
              if (!pId) {
                const { passportOrId } = extractPassportOrId(cellStr);
                if (passportOrId) pId = passportOrId;
              }
            });
          }

          // 3. Whole row text check fallback
          if (!bDate) {
            const { birthDate } = extractBirthDate(rowStr);
            if (birthDate) bDate = birthDate;
          }
          if (!pId) {
            const { passportOrId } = extractPassportOrId(rowStr);
            if (passportOrId) pId = passportOrId;
          }

          students.push({
            fullName: name,
            birthDate: bDate,
            passportOrId: pId,
            sourceSnippet: rowStr,
          });
          continue;
        }
      }

      // B. Intelligent cell-by-cell inspection fallback (if no table header detected)
      let nameCandidate = '';
      let birthCandidate = '';
      let passCandidate = '';

      // Check adjacent cells for series + number
      for (let c = 0; c < row.length - 1; c++) {
        const cell1 = String(row[c] || '').trim();
        const cell2 = String(row[c + 1] || '').trim();
        if (cell1 && cell2) {
          const combined = `${cell1} ${cell2}`;
          const { passportOrId } = extractPassportOrId(combined);
          if (passportOrId) {
            passCandidate = passportOrId;
            break;
          }
        }
      }

      for (const cell of row) {
        if (cell === undefined || cell === null) continue;
        const str = String(cell).trim();

        // Skip header words
        if (/^(№|t\/r|tartib|f\.i\.sh|familiya|ism|tug['`’ʻ]ilgan|pasport|seriya|hujjat)/i.test(str)) {
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

        // Check name
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
          sourceSnippet: rowStr,
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

    const classMatch = text.match(/\b([1-9]|1[0-1])\s*[-_ ]?\s*([A-Za-z\u0400-\u04FF])(?:\s*sinf|\b)/i);
    if (classMatch) {
      detectedClassName = `${classMatch[1]}-${classMatch[2].toUpperCase()}`;
    }

    const teacherMatch = text.match(/(?:sinf\s+rahbari|rahbar|o['`’ʻ]qituvchi|ustoz)[\s:]+([A-Za-z\u0400-\u04FF\s'\`’ʻ]{5,35})/i);
    if (teacherMatch) {
      detectedTeacherName = teacherMatch[1].trim();
    }

    // Extract HTML tables with column detection:
    const students: ParsedStudentPreview[] = [];
    if (html.includes('<table')) {
      const rowMatches = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi);
      if (rowMatches && rowMatches.length > 0) {
        let wordNameCol = -1;
        let wordBirthCol = -1;
        let wordPassCol = -1;
        let headerRowFound = false;

        for (const tr of rowMatches) {
          const cellMatches = tr.match(/<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/gi);
          if (!cellMatches || cellMatches.length === 0) continue;

          const cells = cellMatches.map(td => td.replace(/<[^>]+>/g, '').trim());
          const rowStr = cells.filter(Boolean).join(' | ');

          // Check if this is the header row
          if (!headerRowFound) {
            cells.forEach((c, idx) => {
              const lower = c.toLowerCase();
              if (/(f\.?i\.?sh|fio|familiya|ism|sharif|o['`’ʻ]quvchi|familiyasi|o‘quvchilar|talaba)/i.test(lower)) {
                wordNameCol = idx;
                headerRowFound = true;
              } else if (/(tug['`’ʻ]ilgan|tugilgan|sana|t\.sana|t\.yil|t\.kuni|yil|birth|date)/i.test(lower) && !/(berilgan|qabul)/i.test(lower)) {
                wordBirthCol = idx;
              } else if (/(pasport|metrika|guvohnoma|hujjat\s*(?:seriya|raqam)|seriya\s*(?:va\s*)?raqam|jshshir|pinfl|id)/i.test(lower) && !/(turi|telefon)/i.test(lower)) {
                wordPassCol = idx;
              }
            });
            if (headerRowFound) continue;
          }

          // If column-indexed extraction is possible:
          if (wordNameCol !== -1 && cells[wordNameCol]) {
            const rawName = cells[wordNameCol];
            const name = cleanFullName(rawName);

            if (name && name.split(/\s+/).length >= 2 && !/^(f\.?i\.?sh|familiya|ism|o['`’ʻ]quvchi|№|t\/r|tartib)/i.test(name)) {
              let bDate = wordBirthCol !== -1 && cells[wordBirthCol] ? extractBirthDate(cells[wordBirthCol]).birthDate : '';
              let pId = wordPassCol !== -1 && cells[wordPassCol] ? extractPassportOrId(cells[wordPassCol]).passportOrId : '';

              // Check adjacent cells for series + number
              if (!pId) {
                for (let c = 0; c < cells.length - 1; c++) {
                  if (c === wordNameCol || (c + 1) === wordNameCol) continue;
                  const c1 = cells[c];
                  const c2 = cells[c + 1];
                  if (c1 && c2) {
                    const combined = `${c1} ${c2}`;
                    const { passportOrId } = extractPassportOrId(combined);
                    if (passportOrId) {
                      pId = passportOrId;
                      break;
                    }
                  }
                }
              }

              // Fallback across other cells
              if (!bDate || !pId) {
                cells.forEach((cellStr, cIdx) => {
                  if (cIdx === wordNameCol || !cellStr) return;
                  if (!bDate) {
                    const { birthDate } = extractBirthDate(cellStr);
                    if (birthDate) bDate = birthDate;
                  }
                  if (!pId) {
                    const { passportOrId } = extractPassportOrId(cellStr);
                    if (passportOrId) pId = passportOrId;
                  }
                });
              }

              // Whole row fallback
              if (!bDate) {
                const { birthDate } = extractBirthDate(rowStr);
                if (birthDate) bDate = birthDate;
              }
              if (!pId) {
                const { passportOrId } = extractPassportOrId(rowStr);
                if (passportOrId) pId = passportOrId;
              }

              students.push({
                fullName: name,
                birthDate: bDate,
                passportOrId: pId,
                sourceSnippet: rowStr,
              });
              continue;
            }
          }

          // Line-wide fallback
          const lineStr = cells.join('\t');
          const parsed = parseSingleStudentLine(lineStr);
          if (parsed) {
            students.push({
              ...parsed,
              sourceSnippet: rowStr,
            });
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

  const classMatch = text.match(/\b([1-9]|1[0-1])\s*[-_ ]?\s*([A-Za-z\u0400-\u04FF])(?:\s*sinf|\b)/i);
  if (classMatch) {
    detectedClassName = `${classMatch[1]}-${classMatch[2].toUpperCase()}`;
  }

  const teacherMatch = text.match(/(?:sinf\s+rahbari|rahbar|o['`’ʻ]qituvchi|ustoz)[\s:]+([A-Za-z\u0400-\u04FF\s'\`’ʻ]{5,35})/i);
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
