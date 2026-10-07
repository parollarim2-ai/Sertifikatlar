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
  availableSheets?: string[];
  activeSheetName?: string;
}

interface TableColumnMap {
  headerRowIndex: number;
  fullNameCol: number;      // e.g. "F.I.SH", "O'quvchi F.I.SH"
  lastNameCol: number;      // e.g. "Familiyasi", "Familiya"
  firstNameCol: number;     // e.g. "Ismi", "Ism"
  patronymicCol: number;    // e.g. "Sharifi", "Otasining ismi"
  birthDateCol: number;     // e.g. "Tug'ilgan sana", "T.sana"
  passportCol: number;      // e.g. "Pasport/Metrika", "Hujjat seriya va raqam"
  docSeriesCol: number;     // e.g. "Seriya"
  docNumberCol: number;     // e.g. "Raqam"
  pinflCol: number;         // e.g. "PINFL", "JSHSHIR"
  parentCols: Set<number>;  // Columns belonging to Parents (MUST BE EXCLUDED)
  teacherCols: Set<number>; // Columns belonging to Teachers (MUST BE EXCLUDED)
  addressCols: Set<number>; // Columns belonging to Addresses (MUST BE EXCLUDED)
  hasHeader: boolean;
}

/**
 * Intelligent table header column detection.
 * Strictly separates student columns from parent, teacher, and address columns.
 */
function detectTableColumns(rawRows: any[][]): TableColumnMap {
  const colMap: TableColumnMap = {
    headerRowIndex: -1,
    fullNameCol: -1,
    lastNameCol: -1,
    firstNameCol: -1,
    patronymicCol: -1,
    birthDateCol: -1,
    passportCol: -1,
    docSeriesCol: -1,
    docNumberCol: -1,
    pinflCol: -1,
    parentCols: new Set<number>(),
    teacherCols: new Set<number>(),
    addressCols: new Set<number>(),
    hasHeader: false,
  };

  for (let r = 0; r < Math.min(rawRows.length, 25); r++) {
    const row = rawRows[r];
    if (!Array.isArray(row) || row.length === 0) continue;

    let hasNameCandidate = false;
    const tempParentCols = new Set<number>();
    const tempTeacherCols = new Set<number>();
    const tempAddressCols = new Set<number>();

    let tempFullName = -1;
    let tempLastName = -1;
    let tempFirstName = -1;
    let tempPatronymic = -1;
    let tempBirthDate = -1;
    let tempPassport = -1;
    let tempDocSeries = -1;
    let tempDocNumber = -1;
    let tempPinfl = -1;

    row.forEach((cell, colIdx) => {
      if (cell === undefined || cell === null) return;
      const s = String(cell).toLowerCase().trim();
      if (!s) return;

      // 1. Identify Parent columns (MUST NEVER BE USED FOR STUDENT)
      if (/(?:ota-onasi|ota\s*onasi|otasi|onasi|vasiy|ota-ona|ota\s*ona|ota_ona|otasining\s*f\.?i\.?sh|onasining\s*f\.?i\.?sh|родител)/i.test(s)) {
        tempParentCols.add(colIdx);
        return;
      }

      // 2. Identify Teacher columns (MUST NEVER BE USED FOR STUDENT)
      if (/(?:sinf\s*rahbari|rahbar|o['`’ʻ]qituvchi|ustoz|pedagog|мураббий|учитель)/i.test(s)) {
        tempTeacherCols.add(colIdx);
        return;
      }

      // 3. Identify Address columns
      if (/(?:yashash\s*(?:joyi|manzili)|manzili?|viloyat|tuman|shahar|mahalla|mfy|ko['`’ʻ]cha|uy|xonadon|адрес)/i.test(s)) {
        tempAddressCols.add(colIdx);
        return;
      }

      // 4. Combined Full Name column for Student
      if (
        /(?:o['`’ʻ]quvchi(?:lar)?|talaba|bola)?\s*(?:f\.?i\.?sh|fio|ism[- ]?sharif|to['`’ʻ]liq\s*ism|фио|ф\.и\.ш)/i.test(s) ||
        /(?:familiya(?:si)?\s*[,/\- ]\s*ism(?:i)?)/i.test(s)
      ) {
        tempFullName = colIdx;
        hasNameCandidate = true;
        return;
      }

      // 5. Separate Name Columns
      if (/(?:^|\b)(?:familiya(?:si)?|фамилия)(?:$|\b)/i.test(s)) {
        tempLastName = colIdx;
        hasNameCandidate = true;
        return;
      }

      if (/(?:^|\b)(?:ism(?:i)?|имя)(?:$|\b)/i.test(s) && !/(?:otasining\s*ismi|sharif)/i.test(s)) {
        tempFirstName = colIdx;
        hasNameCandidate = true;
        return;
      }

      if (/(?:^|\b)(?:sharif(?:i)?|otasining\s*ismi|отчество)(?:$|\b)/i.test(s)) {
        tempPatronymic = colIdx;
        return;
      }

      // Generic Student indicator
      if (/^(?:o['`’ʻ]quvchi(?:lar)?|talaba|бола|ученик|ученица)$/i.test(s)) {
        tempFullName = colIdx;
        hasNameCandidate = true;
        return;
      }

      // 6. Birth Date Column
      if (
        /(?:tug['`’ʻ]ilgan|tugilgan|sana|t\.sana|t\.yil|t\.kuni|birth|date|дата\s*рожд)/i.test(s) &&
        !/(?:berilgan|qabul|ro'yxat|tugash|amal)/i.test(s)
      ) {
        tempBirthDate = colIdx;
        return;
      }

      // 7. Passport / Metrika Column
      if (
        /(?:pasport|metrika|guvohnoma|hujjat\s*(?:seriya|raqam)|seriya\s*(?:va\s*)?raqam|паспорт|метрика|свидетельств)/i.test(s) &&
        !/(?:turi|telefon|muddati|nomi)/i.test(s)
      ) {
        tempPassport = colIdx;
        return;
      }

      // 8. Separate Document Series & Number
      if (/(?:^|\b)(?:hujjat\s*)?seriya(?:si)?(?:$|\b)/i.test(s)) {
        tempDocSeries = colIdx;
        return;
      }

      if (/(?:^|\b)(?:hujjat\s*)?raqam(?:i)?(?:$|\b)/i.test(s)) {
        tempDocNumber = colIdx;
        return;
      }

      // 9. PINFL / JSHSHIR
      if (/(?:pinfl|jshshir|пинфл|жшшир)/i.test(s)) {
        tempPinfl = colIdx;
        return;
      }
    });

    if (hasNameCandidate) {
      colMap.headerRowIndex = r;
      colMap.hasHeader = true;
      colMap.fullNameCol = tempFullName;
      colMap.lastNameCol = tempLastName;
      colMap.firstNameCol = tempFirstName;
      colMap.patronymicCol = tempPatronymic;
      colMap.birthDateCol = tempBirthDate;
      colMap.passportCol = tempPassport;
      colMap.docSeriesCol = tempDocSeries;
      colMap.docNumberCol = tempDocNumber;
      colMap.pinflCol = tempPinfl;
      colMap.parentCols = tempParentCols;
      colMap.teacherCols = tempTeacherCols;
      colMap.addressCols = tempAddressCols;
      break;
    }
  }

  return colMap;
}

/**
 * Extracts students with 100% preservation of actual names and data
 */
function extractStudentsFromRows(rawRows: any[][], colMap: TableColumnMap): { students: ParsedStudentPreview[]; textLines: string[] } {
  const students: ParsedStudentPreview[] = [];
  const textLines: string[] = [];

  for (let r = 0; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (!Array.isArray(row) || row.length === 0) continue;

    const rowStr = row
      .map(cell => (cell !== undefined && cell !== null ? String(cell).trim() : ''))
      .filter(Boolean)
      .join(' ');
    if (rowStr) textLines.push(rowStr);

    // Skip rows at or before header
    if (colMap.hasHeader && r <= colMap.headerRowIndex) {
      continue;
    }

    // ----------------------------------------------------
    // PATH A: STRUCTURED EXTRACTION VIA COLUMN MAP
    // ----------------------------------------------------
    if (colMap.hasHeader && (colMap.fullNameCol !== -1 || colMap.lastNameCol !== -1 || colMap.firstNameCol !== -1)) {
      let rawName = '';

      if (colMap.fullNameCol !== -1 && row[colMap.fullNameCol] !== undefined && row[colMap.fullNameCol] !== null) {
        rawName = String(row[colMap.fullNameCol]).trim();
      } else if (colMap.lastNameCol !== -1 || colMap.firstNameCol !== -1) {
        const fam = colMap.lastNameCol !== -1 && row[colMap.lastNameCol] !== undefined && row[colMap.lastNameCol] !== null
          ? String(row[colMap.lastNameCol]).trim()
          : '';
        const ism = colMap.firstNameCol !== -1 && row[colMap.firstNameCol] !== undefined && row[colMap.firstNameCol] !== null
          ? String(row[colMap.firstNameCol]).trim()
          : '';
        const sharif = colMap.patronymicCol !== -1 && row[colMap.patronymicCol] !== undefined && row[colMap.patronymicCol] !== null
          ? String(row[colMap.patronymicCol]).trim()
          : '';
        rawName = [fam, ism, sharif].filter(Boolean).join(' ');
      }

      const name = cleanFullName(rawName);

      // Verify name is a genuine person name (not a table title or row count)
      if (name && name.split(/\s+/).length >= 2 && !/^(?:f\.?i\.?sh|familiya|ism|o['`’ʻ]quvchi|№|t\/r|tartib)/i.test(name)) {
        // 1. Birth Date
        let bDate = '';
        if (colMap.birthDateCol !== -1 && row[colMap.birthDateCol] !== undefined && row[colMap.birthDateCol] !== null) {
          const rawVal = row[colMap.birthDateCol];
          const serialDate = parseExcelSerialDate(rawVal);
          bDate = serialDate || extractBirthDate(String(rawVal)).birthDate;
        }

        // 2. Passport / Metrika
        let pId = '';
        if (colMap.passportCol !== -1 && row[colMap.passportCol] !== undefined && row[colMap.passportCol] !== null) {
          pId = extractPassportOrId(String(row[colMap.passportCol])).passportOrId;
        }

        // Check separate series and number columns
        if (!pId && colMap.docSeriesCol !== -1 && colMap.docNumberCol !== -1) {
          const sVal = String(row[colMap.docSeriesCol] || '').trim();
          const nVal = String(row[colMap.docNumberCol] || '').trim();
          if (sVal && nVal) {
            pId = extractPassportOrId(`${sVal} ${nVal}`).passportOrId;
          }
        }

        // Check PINFL
        if (!pId && colMap.pinflCol !== -1 && row[colMap.pinflCol]) {
          const pinflStr = String(row[colMap.pinflCol]).trim();
          pId = extractPassportOrId(pinflStr).passportOrId;
        }

        // Check adjacent cell pairs in this row (ignoring student name and parent/teacher columns)
        if (!pId) {
          for (let c = 0; c < row.length - 1; c++) {
            if (
              c === colMap.fullNameCol ||
              c === colMap.lastNameCol ||
              c === colMap.firstNameCol ||
              colMap.parentCols.has(c) ||
              colMap.teacherCols.has(c) ||
              colMap.parentCols.has(c + 1) ||
              colMap.teacherCols.has(c + 1)
            ) {
              continue;
            }
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

        // Fallback scan across allowed cells
        if (!bDate || !pId) {
          row.forEach((cell, cIdx) => {
            if (
              cIdx === colMap.fullNameCol ||
              cIdx === colMap.lastNameCol ||
              cIdx === colMap.firstNameCol ||
              colMap.parentCols.has(cIdx) ||
              colMap.teacherCols.has(cIdx) ||
              colMap.addressCols.has(cIdx) ||
              cell === undefined ||
              cell === null
            ) {
              return;
            }
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

        students.push({
          fullName: name,
          birthDate: bDate,
          passportOrId: pId,
          sourceSnippet: rowStr,
        });
        continue;
      }
    }

    // ----------------------------------------------------
    // PATH B: FALLBACK WHEN NO STRUCTURED HEADER WAS FOUND
    // ----------------------------------------------------
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

    for (let cIdx = 0; cIdx < row.length; cIdx++) {
      const cell = row[cIdx];
      if (cell === undefined || cell === null) continue;
      const str = String(cell).trim();

      // Skip header and title words
      if (/^(?:№|t\/r|tartib|f\.i\.sh|familiya|ism|tug['`’ʻ]ilgan|pasport|seriya|hujjat)/i.test(str)) {
        continue;
      }

      // Skip parent, teacher, and address indicators
      if (/\b(?:ota-onasi|otasi|onasi|sinf\s*rahbari|rahbar|viloyat|tuman|shahar|qishloq|mahalla|ko'cha|uy|xonadon|\+?998)\b/i.test(str)) {
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

      // Check name (must be student name, at least 2 words)
      if (!nameCandidate) {
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

  return { students, textLines };
}

/**
 * Detects class name and teacher name from text or top rows
 */
function detectClassAndTeacher(rows: any[][], rawText: string, fileName: string): { className: string; teacherName: string } {
  let detectedClassName = '';
  let detectedTeacherName = '';

  // 1. Try file name first (e.g. "6-A sinf.xlsx", "6A.xlsx", "6-A_oquvchilar.csv")
  const fileClassMatch = fileName.match(/\b([1-9]|1[0-1])\s*[-_ ]?\s*([A-Za-z\u0400-\u04FF])(?:\s*sinf|\b)/i);
  if (fileClassMatch) {
    detectedClassName = `${fileClassMatch[1]}-${fileClassMatch[2].toUpperCase()}`;
  }

  // 2. Try top 25 rows
  for (let r = 0; r < Math.min(rows.length, 25); r++) {
    const row = rows[r];
    if (!Array.isArray(row)) continue;
    const rowStr = row.map(cell => (cell !== undefined && cell !== null ? String(cell).trim() : '')).filter(Boolean).join(' ');

    if (!detectedClassName) {
      const classMatch = rowStr.match(/\b([1-9]|1[0-1])\s*[-_ ]?\s*([A-Za-z\u0400-\u04FF])(?:\s*sinf|\b)/i);
      if (classMatch) {
        detectedClassName = `${classMatch[1]}-${classMatch[2].toUpperCase()}`;
      }
    }

    if (!detectedTeacherName) {
      const teacherMatch = rowStr.match(/(?:sinf\s+rahbari|rahbar|o['`’ʻ]qituvchi|ustoz)[\s:]+([A-Za-z\u0400-\u04FF\s'\`’ʻ]{5,35})/i);
      if (teacherMatch) {
        detectedTeacherName = teacherMatch[1].trim();
      }
    }
  }

  // 3. Fallback to raw text
  if (!detectedClassName) {
    const textMatch = rawText.match(/\b([1-9]|1[0-1])\s*[-_ ]?\s*([A-Za-z\u0400-\u04FF])(?:\s*sinf|\b)/i);
    if (textMatch) {
      detectedClassName = `${textMatch[1]}-${textMatch[2].toUpperCase()}`;
    }
  }

  if (!detectedTeacherName) {
    const textTeacher = rawText.match(/(?:sinf\s+rahbari|rahbar|o['`’ʻ]qituvchi|ustoz)[\s:]+([A-Za-z\u0400-\u04FF\s'\`’ʻ]{5,35})/i);
    if (textTeacher) {
      detectedTeacherName = textTeacher[1].trim();
    }
  }

  return { className: detectedClassName, teacherName: detectedTeacherName };
}

/**
 * Extracts student records and class info from any school file (Excel, Word, CSV, Text).
 * Supports multi-sheet selection in Excel files.
 */
export async function extractStudentsFromFile(file: File, requestedSheetName?: string): Promise<ExtractedDocumentResult> {
  const fileName = file.name.toLowerCase();

  // ==========================================
  // 1. EXCEL FILES (.xlsx, .xls)
  // ==========================================
  if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheetNames = workbook.SheetNames || [];

    if (sheetNames.length === 0) {
      return { rawText: '', students: [], availableSheets: [] };
    }

    // Determine target sheet:
    let chosenSheetName = requestedSheetName && sheetNames.includes(requestedSheetName)
      ? requestedSheetName
      : '';

    if (!chosenSheetName) {
      // Check if file name hints at a class (e.g. "6-A") and a sheet is named "6-A", "6A", "6 A"
      const classMatch = file.name.match(/\b([1-9]|1[0-1])\s*[-_ ]?\s*([A-Za-z\u0400-\u04FF])\b/i);
      if (classMatch) {
        const normTarget = `${classMatch[1]}${classMatch[2]}`.toLowerCase();
        const found = sheetNames.find(sn => sn.replace(/[-_ ]/g, '').toLowerCase().includes(normTarget));
        if (found) {
          chosenSheetName = found;
        }
      }
    }

    // If still not chosen, scan sheets to find the one with the most data/students
    if (!chosenSheetName) {
      let maxRows = -1;
      let bestSheet = sheetNames[0];
      for (const sn of sheetNames) {
        const ws = workbook.Sheets[sn];
        if (!ws) continue;
        const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false });
        if (rows.length > maxRows) {
          maxRows = rows.length;
          bestSheet = sn;
        }
      }
      chosenSheetName = bestSheet;
    }

    const worksheet = workbook.Sheets[chosenSheetName];
    const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false });

    const colMap = detectTableColumns(rawRows);
    const { students, textLines } = extractStudentsFromRows(rawRows, colMap);
    const rawText = textLines.join('\n');

    const { className, teacherName } = detectClassAndTeacher(rawRows, rawText, file.name);

    // If sheet name itself indicates class (e.g. "6-A" or "6A"), use it if not detected
    let finalClassName = className;
    if (!finalClassName && chosenSheetName) {
      const sheetClassMatch = chosenSheetName.match(/\b([1-9]|1[0-1])\s*[-_ ]?\s*([A-Za-z\u0400-\u04FF])\b/i);
      if (sheetClassMatch) {
        finalClassName = `${sheetClassMatch[1]}-${sheetClassMatch[2].toUpperCase()}`;
      }
    }

    return {
      rawText,
      detectedClassName: finalClassName,
      detectedTeacherName: teacherName,
      students,
      availableSheets: sheetNames,
      activeSheetName: chosenSheetName,
    };
  }

  // ==========================================
  // 2. WORD DOCUMENTS (.docx)
  // ==========================================
  if (fileName.endsWith('.docx')) {
    const buffer = await file.arrayBuffer();

    const htmlResult = await mammoth.convertToHtml({ arrayBuffer: buffer });
    const rawResult = await mammoth.extractRawText({ arrayBuffer: buffer });
    const text = rawResult.value || '';
    const html = htmlResult.value || '';

    const students: ParsedStudentPreview[] = [];

    // Parse HTML table rows into 2D array
    if (html.includes('<table')) {
      const rowMatches = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi);
      if (rowMatches && rowMatches.length > 0) {
        const tableRows: string[][] = [];
        for (const tr of rowMatches) {
          const cellMatches = tr.match(/<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/gi);
          if (!cellMatches || cellMatches.length === 0) continue;
          const cells = cellMatches.map(td => td.replace(/<[^>]+>/g, '').trim());
          tableRows.push(cells);
        }

        if (tableRows.length > 0) {
          const colMap = detectTableColumns(tableRows);
          const extracted = extractStudentsFromRows(tableRows, colMap);
          students.push(...extracted.students);
        }
      }
    }

    // Fallback: parse plain text if no table rows found
    const finalStudents = students.length > 0 ? students : parseStudentsFromText(text);
    const { className, teacherName } = detectClassAndTeacher([], text, file.name);

    return {
      rawText: text,
      detectedClassName: className,
      detectedTeacherName: teacherName,
      students: finalStudents,
    };
  }

  // ==========================================
  // 3. CSV / TSV / TEXT FILES (.csv, .tsv, .txt)
  // ==========================================
  const text = await file.text();

  // Try structured XLSX parsing for CSV and TSV (handles commas, quotes, tabs, semicolons)
  try {
    const workbook = XLSX.read(text, { type: 'string' });
    const sheetName = workbook.SheetNames[0];
    if (sheetName) {
      const worksheet = workbook.Sheets[sheetName];
      const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false });

      if (rawRows.length >= 2) {
        const colMap = detectTableColumns(rawRows);
        const { students, textLines } = extractStudentsFromRows(rawRows, colMap);
        if (students.length > 0) {
          const { className, teacherName } = detectClassAndTeacher(rawRows, text, file.name);
          return {
            rawText: textLines.join('\n') || text,
            detectedClassName: className,
            detectedTeacherName: teacherName,
            students,
          };
        }
      }
    }
  } catch {
    // fallback to line-by-line parsing
  }

  // Fallback: parse plain text line-by-line
  const students = parseStudentsFromText(text);
  const { className, teacherName } = detectClassAndTeacher([], text, file.name);

  return {
    rawText: text,
    detectedClassName: className,
    detectedTeacherName: teacherName,
    students,
  };
}
