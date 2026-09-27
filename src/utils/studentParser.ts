import { Student } from '../types';

export interface ParsedStudentPreview {
  fullName: string;
  birthDate: string;
  passportOrId: string;
}

export function parseStudentsFromText(rawText: string): ParsedStudentPreview[] {
  const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  const results: ParsedStudentPreview[] = [];

  for (const line of lines) {
    // Skip common header lines in Uzbek school documents
    if (/^(f\.i\.sh|ism|familiya|№|t\/r|tartib|o'quvchi|sinf|passport|hujjat)/i.test(line)) {
      continue;
    }

    // Try tab, comma, semicolon, or double-space split
    let parts: string[] = [];
    if (line.includes('\t')) {
      parts = line.split('\t').map(p => p.trim());
    } else if (line.includes(';') && line.split(';').length >= 2) {
      parts = line.split(';').map(p => p.trim());
    } else if (line.includes(',') && line.split(',').length >= 2) {
      parts = line.split(',').map(p => p.trim());
    } else {
      // Split by multiple spaces or detect patterns
      parts = [line];
    }

    // If split into columns
    if (parts.length >= 2) {
      let fullName = '';
      let birthDate = '';
      let passportOrId = '';

      for (let p of parts) {
        p = p.replace(/^\d+[\.\)\-]\s*/, '').trim(); // Remove leading index like "1.", "1)"

        // Check if date (DD.MM.YYYY or YYYY-MM-DD)
        if (/\b\d{1,2}[\.\/\-]\d{1,2}[\.\/\-]\d{2,4}\b/.test(p) || /\b\d{4}[\-\.\/]\d{1,2}[\-\.\/]\d{1,2}\b/.test(p)) {
          birthDate = p;
        }
        // Check if passport series (e.g. AA 1234567, AB1234567, I-TN 123456)
        else if (/[A-Za-z]{1,2}\s*[\-]?\s*\d{6,8}/i.test(p) || /^[A-Z]{1,2}\s*\d{7}$/i.test(p)) {
          passportOrId = p.replace(/\s+/g, '').toUpperCase();
        }
        // Otherwise likely name if contains letters
        else if (/[a-zA-Z\u0400-\u04FF]/.test(p) && !fullName) {
          fullName = p;
        }
      }

      if (fullName) {
        results.push({
          fullName: cleanFullName(fullName),
          birthDate: birthDate || '',
          passportOrId: passportOrId || '',
        });
        continue;
      }
    }

    // Regex extraction from a single line
    // Remove leading numbering like "1. ", "23) "
    const cleanedLine = line.replace(/^\d+[\.\)\-]\s*/, '').trim();

    // Find date
    const dateMatch = cleanedLine.match(/\b(\d{1,2}[\.\/\-]\d{1,2}[\.\/\-]\d{2,4}|\d{4}[\-\.\/]\d{1,2}[\-\.\/]\d{1,2})\b/);
    const birthDate = dateMatch ? dateMatch[0] : '';

    // Find passport
    const passMatch = cleanedLine.match(/\b([A-Z]{1,2}\s*[\-]?\s*\d{6,8})\b/i);
    const passportOrId = passMatch ? passMatch[0].replace(/\s+/g, '').toUpperCase() : '';

    // The name is whatever remains after removing passport and date and extra punctuation
    let nameCandidate = cleanedLine;
    if (birthDate) {
      nameCandidate = nameCandidate.replace(birthDate, '');
    }
    if (passportOrId) {
      nameCandidate = nameCandidate.replace(new RegExp(passportOrId, 'i'), '');
    }
    nameCandidate = nameCandidate.replace(/[\|\;\,]/g, ' ').replace(/\s{2,}/g, ' ').trim();

    if (nameCandidate.length >= 3 && /[a-zA-Z\u0400-\u04FF]/.test(nameCandidate)) {
      results.push({
        fullName: cleanFullName(nameCandidate),
        birthDate,
        passportOrId,
      });
    }
  }

  return results;
}

function cleanFullName(name: string): string {
  return name
    .replace(/^[-_\s\.,]+|[-_\s\.,]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
