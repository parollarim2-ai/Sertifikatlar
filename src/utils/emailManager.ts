import { EmailAccount, Student } from '../types';

export interface ParseEmailResult {
  parsedAccounts: { email: string; password?: string }[];
  duplicateCount: number;
}

export function parseRawEmails(rawInput: string, existingEmails: Set<string>): ParseEmailResult {
  const lines = rawInput.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  const parsedAccounts: { email: string; password?: string }[] = [];
  let duplicateCount = 0;
  const seenInBatch = new Set<string>();

  for (const line of lines) {
    // Check line for email pattern
    const emailMatch = line.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (!emailMatch) continue;

    const email = emailMatch[0].toLowerCase();

    if (existingEmails.has(email) || seenInBatch.has(email)) {
      duplicateCount++;
      continue;
    }

    seenInBatch.add(email);

    // Try to extract password if provided e.g. email:pass, email,pass, email pass
    let password = '';
    const afterEmail = line.replace(emailMatch[0], '').trim();
    if (afterEmail) {
      password = afterEmail.replace(/^[:,\s|;]+/, '').trim();
    }

    parsedAccounts.push({
      email,
      password: password || 'MaktabPass2026!',
    });
  }

  return { parsedAccounts, duplicateCount };
}

/**
 * Distributes free emails to students who don't have an email yet.
 * Returns updated students and updated emailPool.
 */
export function distributeEmailsToStudents(
  students: Student[],
  emailPool: EmailAccount[],
  newEmails: { email: string; password?: string }[] = []
): {
  updatedStudents: Student[];
  updatedEmailPool: EmailAccount[];
  distributedCount: number;
  remainingPoolCount: number;
} {
  // Combine existing pool with new emails
  const pool: EmailAccount[] = [...emailPool];
  const now = new Date().toISOString();

  newEmails.forEach(item => {
    pool.push({
      email: item.email,
      password: item.password || 'MaktabPass2026!',
      isUsed: false,
      addedAt: now,
    });
  });

  const updatedStudents = [...students];
  let distributedCount = 0;

  // Track already assigned emails to prevent any duplicate allocation
  const alreadyAssignedSet = new Set<string>();
  students.forEach(s => {
    if (s.assignedEmail && s.assignedEmail.trim()) {
      alreadyAssignedSet.add(s.assignedEmail.trim().toLowerCase());
    }
  });

  // Find students needing an email
  for (let i = 0; i < updatedStudents.length; i++) {
    const student = updatedStudents[i];
    if (!student.assignedEmail || student.assignedEmail.trim() === '') {
      // Find first unused email in pool that is NOT assigned to anyone
      const freeEmailIndex = pool.findIndex(e => 
        !e.isUsed && !alreadyAssignedSet.has(e.email.trim().toLowerCase())
      );

      if (freeEmailIndex !== -1) {
        const freeEmail = pool[freeEmailIndex];
        freeEmail.isUsed = true;
        freeEmail.assignedToStudentId = student.id;
        alreadyAssignedSet.add(freeEmail.email.trim().toLowerCase());

        updatedStudents[i] = {
          ...student,
          assignedEmail: freeEmail.email,
          assignedPassword: freeEmail.password || 'MaktabPass2026!',
        };
        distributedCount++;
      }
    }
  }

  const remainingPoolCount = pool.filter(e => !e.isUsed).length;

  return {
    updatedStudents,
    updatedEmailPool: pool,
    distributedCount,
    remainingPoolCount,
  };
}
