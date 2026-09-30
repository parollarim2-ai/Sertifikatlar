import { EmailAccount, Student } from '../types';

export interface GmailGeneratorOptions {
  baseEmail: string;
  count: number; // 1 to 3000
  existingPool: EmailAccount[];
  students: Student[];
}

export interface GmailGeneratorResult {
  newEmails: EmailAccount[];
  skippedDuplicatesCount: number;
  totalGenerated: number;
  maxPossibleDotCombos: number;
  rawUsername: string;
  domain: string;
}

/**
 * Generates unique Gmail dot trick variants (and plus extensions if needed)
 * while ensuring none already exist in the database (either in emailPool or assigned to students).
 */
export function generateGmailVariants(options: GmailGeneratorOptions): GmailGeneratorResult {
  const { baseEmail, count, existingPool, students } = options;

  const targetCount = Math.max(1, Math.min(3000, Math.floor(count)));
  const cleanEmail = baseEmail.trim().toLowerCase();

  // Parse email parts
  const atIdx = cleanEmail.indexOf('@');
  if (atIdx <= 0) {
    throw new Error("Noto'g'ri email formati. Masalan: misol@gmail.com ko'rinishida kiriting.");
  }

  const rawUser = cleanEmail.slice(0, atIdx).replace(/\./g, '').split('+')[0];
  const domain = cleanEmail.slice(atIdx + 1) || 'gmail.com';

  if (rawUser.length === 0) {
    throw new Error("Email foydalanuvchi nomi bo'sh bo'lishi mumkin emas.");
  }

  // Build a set of all currently used or known emails in the system
  const existingSet = new Set<string>();
  existingPool.forEach((item) => {
    if (item.email) {
      existingSet.add(item.email.trim().toLowerCase());
    }
  });
  students.forEach((st) => {
    if (st.assignedEmail) {
      existingSet.add(st.assignedEmail.trim().toLowerCase());
    }
  });

  const slots = rawUser.length - 1;
  const maxPossibleDotCombos = slots > 0 ? Math.pow(2, Math.min(slots, 30)) : 1;

  const generatedUniqueEmails = new Set<string>();
  let skippedDuplicatesCount = 0;

  // 1. Generate standard dot variations
  for (let mask = 0; mask < maxPossibleDotCombos && generatedUniqueEmails.size < targetCount; mask++) {
    let emailStr = '';
    for (let i = 0; i < slots; i++) {
      emailStr += rawUser[i];
      if ((mask >> i) & 1) {
        emailStr += '.';
      }
    }
    emailStr += rawUser[slots];
    emailStr += '@' + domain;

    if (existingSet.has(emailStr)) {
      skippedDuplicatesCount++;
    } else {
      generatedUniqueEmails.add(emailStr);
      existingSet.add(emailStr); // avoid duplicates within this generation run
    }
  }

  // 2. If username is short and dot combinations ran out before reaching targetCount,
  // extend seamlessly with plus-aliasing
  let aliasIndex = 1;
  while (generatedUniqueEmails.size < targetCount && aliasIndex <= 5000) {
    const candidate = `${rawUser}+${aliasIndex}@${domain}`;
    aliasIndex++;
    if (existingSet.has(candidate)) {
      skippedDuplicatesCount++;
    } else {
      generatedUniqueEmails.add(candidate);
      existingSet.add(candidate);
    }
  }

  const nowIso = new Date().toISOString();
  const newEmails: EmailAccount[] = Array.from(generatedUniqueEmails).map((email) => ({
    email,
    isUsed: false,
    addedAt: nowIso,
  }));

  return {
    newEmails,
    skippedDuplicatesCount,
    totalGenerated: newEmails.length,
    maxPossibleDotCombos,
    rawUsername: rawUser,
    domain,
  };
}
