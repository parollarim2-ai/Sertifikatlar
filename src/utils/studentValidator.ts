import { Student, ClassGroup } from '../types';

export interface ConflictCheckResult {
  hasNameConflict: boolean;
  conflictingStudentByName?: Student;
  conflictingClassByName?: ClassGroup;

  hasPassportConflict: boolean;
  conflictingStudentByPassport?: Student;
  conflictingClassByPassport?: ClassGroup;

  hasCertificateConflict: boolean;
  conflictingStudentByCertificate?: Student;
  conflictingClassByCertificate?: ClassGroup;

  hasEmailConflict: boolean;
  conflictingStudentByEmail?: Student;
  conflictingClassByEmail?: ClassGroup;
}

export function checkStudentConflicts(
  data: {
    id?: string;
    fullName: string;
    passportOrId?: string;
    certificateLink?: string;
    assignedEmail?: string;
  },
  existingStudents: Student[],
  classes: ClassGroup[]
): ConflictCheckResult {
  const cleanId = data.id || '';
  const cleanName = data.fullName.trim().toLowerCase();
  const cleanPassport = (data.passportOrId || '').trim().toUpperCase();
  const cleanCertLink = (data.certificateLink || '').trim();
  const cleanEmail = (data.assignedEmail || '').trim().toLowerCase();

  const getClass = (classId?: string) => classes.find(c => c.id === classId);

  // 1. Name conflict check
  let hasNameConflict = false;
  let conflictingStudentByName: Student | undefined;
  if (cleanName.length > 2) {
    conflictingStudentByName = existingStudents.find(
      s => s.id !== cleanId && s.fullName.trim().toLowerCase() === cleanName
    );
    if (conflictingStudentByName) {
      hasNameConflict = true;
    }
  }

  // 2. Passport conflict check (STRICT)
  let hasPassportConflict = false;
  let conflictingStudentByPassport: Student | undefined;
  if (cleanPassport.length > 3) {
    conflictingStudentByPassport = existingStudents.find(
      s => s.id !== cleanId && s.passportOrId && s.passportOrId.trim().toUpperCase() === cleanPassport
    );
    if (conflictingStudentByPassport) {
      hasPassportConflict = true;
    }
  }

  // 3. Certificate link conflict check (STRICT)
  let hasCertificateConflict = false;
  let conflictingStudentByCertificate: Student | undefined;
  if (cleanCertLink.length > 10) {
    conflictingStudentByCertificate = existingStudents.find(
      s => s.id !== cleanId && s.certificateLink && s.certificateLink.trim() === cleanCertLink
    );
    if (conflictingStudentByCertificate) {
      hasCertificateConflict = true;
    }
  }

  // 4. Email conflict check (STRICT)
  let hasEmailConflict = false;
  let conflictingStudentByEmail: Student | undefined;
  if (cleanEmail.length > 4) {
    conflictingStudentByEmail = existingStudents.find(
      s => s.id !== cleanId && s.assignedEmail && s.assignedEmail.trim().toLowerCase() === cleanEmail
    );
    if (conflictingStudentByEmail) {
      hasEmailConflict = true;
    }
  }

  return {
    hasNameConflict,
    conflictingStudentByName,
    conflictingClassByName: conflictingStudentByName ? getClass(conflictingStudentByName.classId) : undefined,

    hasPassportConflict,
    conflictingStudentByPassport,
    conflictingClassByPassport: conflictingStudentByPassport ? getClass(conflictingStudentByPassport.classId) : undefined,

    hasCertificateConflict,
    conflictingStudentByCertificate,
    conflictingClassByCertificate: conflictingStudentByCertificate ? getClass(conflictingStudentByCertificate.classId) : undefined,

    hasEmailConflict,
    conflictingStudentByEmail,
    conflictingClassByEmail: conflictingStudentByEmail ? getClass(conflictingStudentByEmail.classId) : undefined,
  };
}

/**
 * Extracts only the numbers / 7-digit ID from passport series or metrika (e.g. "I-FR 1234567" -> "1234567").
 * Excludes letter prefix (like "I-FR", "AA") so only the serial number is copied.
 */
export function extractPassportDigits(raw?: string): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  // 1. Look for 7 consecutive digits (standard Uzbek metric/passport serial number)
  const sevenMatch = trimmed.match(/\b\d{7}\b/);
  if (sevenMatch) return sevenMatch[0];

  // 2. Look for any sequence of 5-9 digits
  const seqMatch = trimmed.match(/\d{5,9}/);
  if (seqMatch) return seqMatch[0];

  // 3. Fallback: extract all digits
  const allDigits = trimmed.replace(/\D/g, '');
  if (allDigits) return allDigits;

  return trimmed;
}
