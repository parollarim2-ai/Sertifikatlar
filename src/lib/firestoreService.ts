import { 
  collection, 
  doc, 
  setDoc, 
  deleteDoc, 
  onSnapshot,
  writeBatch
} from 'firebase/firestore';
import { db, auth } from './firebase';
import { ClassGroup, Student, EmailAccount, TeacherSession, TeacherMessage, TeacherCertificate } from '../types';

export const CLASSES_COLLECTION = 'classes';
export const STUDENTS_COLLECTION = 'students';
export const EMAIL_POOL_COLLECTION = 'emailPool';
export const SESSIONS_COLLECTION = 'sessions';
export const TEACHER_MESSAGES_COLLECTION = 'teacherMessages';
export const TEACHER_CERTS_COLLECTION = 'teacherCertificates';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errMessage = error instanceof Error ? error.message : String(error);
  const errInfo: FirestoreErrorInfo = {
    error: errMessage,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  if (operationType === OperationType.WRITE || operationType === OperationType.DELETE || operationType === OperationType.CREATE || operationType === OperationType.UPDATE) {
    if (errMessage.includes('Missing or insufficient permissions') || errMessage.includes('permission-denied')) {
      throw new Error(JSON.stringify(errInfo));
    }
  }
}

/**
 * Recursively strips out all `undefined` values from an object or array.
 * Ensures Firestore setDoc / updateDoc / batch.set never throws:
 * "Function setDoc() called with invalid data. Unsupported field value: undefined".
 */
export function removeUndefinedFields<T>(obj: T): T {
  if (obj === null || obj === undefined || typeof obj !== 'object') {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(item => removeUndefinedFields(item)) as unknown as T;
  }
  if (obj instanceof Date) {
    return obj;
  }
  const clean: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      let val = removeUndefinedFields(value);
      if (key === 'errorReason' && typeof val === 'string' && (val.includes('<!doctype') || val.includes('<html') || val.includes('Starting Server'))) {
        val = '';
      }
      clean[key] = val;
    }
  }
  return clean as T;
}

// Real-time listener for classes
export function subscribeToClasses(onUpdate: (classes: ClassGroup[]) => void) {
  try {
    const colRef = collection(db, CLASSES_COLLECTION);
    return onSnapshot(colRef, (snapshot) => {
      const items: ClassGroup[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...docSnap.data() } as ClassGroup);
      });
      onUpdate(items);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, CLASSES_COLLECTION);
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, CLASSES_COLLECTION);
    return () => {};
  }
}

// Real-time listener for students
export function subscribeToStudents(onUpdate: (students: Student[]) => void) {
  try {
    const colRef = collection(db, STUDENTS_COLLECTION);
    return onSnapshot(colRef, (snapshot) => {
      const items: Student[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...docSnap.data() } as Student);
      });
      onUpdate(items);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, STUDENTS_COLLECTION);
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, STUDENTS_COLLECTION);
    return () => {};
  }
}

// Real-time listener for email pool
export function subscribeToEmailPool(onUpdate: (emails: EmailAccount[]) => void) {
  try {
    const colRef = collection(db, EMAIL_POOL_COLLECTION);
    return onSnapshot(colRef, (snapshot) => {
      const items: EmailAccount[] = [];
      snapshot.forEach((docSnap) => {
        items.push(docSnap.data() as EmailAccount);
      });
      onUpdate(items);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, EMAIL_POOL_COLLECTION);
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, EMAIL_POOL_COLLECTION);
    return () => {};
  }
}

// Real-time listener for sessions
export function subscribeToSessions(onUpdate: (sessions: TeacherSession[]) => void) {
  try {
    const colRef = collection(db, SESSIONS_COLLECTION);
    return onSnapshot(colRef, (snapshot) => {
      const items: TeacherSession[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...docSnap.data() } as TeacherSession);
      });
      onUpdate(items);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, SESSIONS_COLLECTION);
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, SESSIONS_COLLECTION);
    return () => {};
  }
}

// Dedicated real-time single-device listener for instant blocking feedback (< 50ms)
export function subscribeToDeviceSession(deviceId: string, onUpdate: (session: TeacherSession | null) => void) {
  try {
    const docRef = doc(db, SESSIONS_COLLECTION, deviceId);
    return onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        onUpdate({ id: docSnap.id, ...docSnap.data() } as TeacherSession);
      } else {
        onUpdate(null);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `${SESSIONS_COLLECTION}/${deviceId}`);
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `${SESSIONS_COLLECTION}/${deviceId}`);
    return () => {};
  }
}

// Real-time listener for teacher messages
export function subscribeToTeacherMessages(onUpdate: (messages: TeacherMessage[]) => void) {
  try {
    const colRef = collection(db, TEACHER_MESSAGES_COLLECTION);
    return onSnapshot(colRef, (snapshot) => {
      const items: TeacherMessage[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...docSnap.data() } as TeacherMessage);
      });
      onUpdate(items);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, TEACHER_MESSAGES_COLLECTION);
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, TEACHER_MESSAGES_COLLECTION);
    return () => {};
  }
}

// Save or update class
export async function syncSaveClass(classGroup: ClassGroup) {
  try {
    const docRef = doc(db, CLASSES_COLLECTION, classGroup.id);
    await setDoc(docRef, removeUndefinedFields(classGroup), { merge: true });
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, `${CLASSES_COLLECTION}/${classGroup.id}`);
  }
}

// Delete class
export async function syncDeleteClass(classId: string) {
  try {
    await deleteDoc(doc(db, CLASSES_COLLECTION, classId));
  } catch (e) {
    handleFirestoreError(e, OperationType.DELETE, `${CLASSES_COLLECTION}/${classId}`);
  }
}

// Save or update student
export async function syncSaveStudent(student: Student) {
  try {
    const docRef = doc(db, STUDENTS_COLLECTION, student.id);
    await setDoc(docRef, removeUndefinedFields(student), { merge: true });
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, `${STUDENTS_COLLECTION}/${student.id}`);
  }
}

// Save batch of students (e.g. from document upload) with chunking
export async function syncSaveBatchStudents(students: Student[]) {
  try {
    const chunkSize = 400;
    for (let i = 0; i < students.length; i += chunkSize) {
      const chunk = students.slice(i, i + chunkSize);
      const batch = writeBatch(db);
      chunk.forEach((st) => {
        const docRef = doc(db, STUDENTS_COLLECTION, st.id);
        batch.set(docRef, removeUndefinedFields(st), { merge: true });
      });
      await batch.commit();
    }
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, STUDENTS_COLLECTION);
    for (const st of students) {
      await syncSaveStudent(st);
    }
  }
}

// Delete student
export async function syncDeleteStudent(studentId: string) {
  try {
    await deleteDoc(doc(db, STUDENTS_COLLECTION, studentId));
  } catch (e) {
    handleFirestoreError(e, OperationType.DELETE, `${STUDENTS_COLLECTION}/${studentId}`);
  }
}

// Save single email account immediately to avoid batch overhead
export async function syncSaveSingleEmail(emailItem: EmailAccount) {
  const safeId = emailItem.email.replace(/[@.]/g, '_');
  try {
    const docRef = doc(db, EMAIL_POOL_COLLECTION, safeId);
    await setDoc(docRef, removeUndefinedFields(emailItem), { merge: true });
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, `${EMAIL_POOL_COLLECTION}/${safeId}`);
  }
}

// Save email pool with chunking (max 400 per batch)
export async function syncSaveEmailPool(emails: EmailAccount[]) {
  try {
    const chunkSize = 400;
    for (let i = 0; i < emails.length; i += chunkSize) {
      const chunk = emails.slice(i, i + chunkSize);
      const batch = writeBatch(db);
      chunk.forEach((emailItem) => {
        const safeId = emailItem.email.replace(/[@.]/g, '_');
        const docRef = doc(db, EMAIL_POOL_COLLECTION, safeId);
        batch.set(docRef, removeUndefinedFields(emailItem), { merge: true });
      });
      await batch.commit();
    }
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, EMAIL_POOL_COLLECTION);
  }
}

// Update device activity safely without touching isBlocked status
export async function syncUpdateDeviceActivity(data: {
  id?: string;
  deviceId: string;
  deviceName?: string;
  browser?: string;
  os?: string;
  screen?: string;
  teacherName?: string;
  className?: string;
  classId?: string;
  lastActiveAt?: string;
  createdAt?: string;
}) {
  try {
    const docRef = doc(db, SESSIONS_COLLECTION, data.deviceId);
    await setDoc(docRef, removeUndefinedFields({
      ...data,
      id: data.deviceId,
      deviceId: data.deviceId,
      lastActiveAt: data.lastActiveAt || new Date().toISOString(),
    }), { merge: true });
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, `${SESSIONS_COLLECTION}/${data.deviceId}`);
  }
}

// Save or update session
export async function syncSaveSession(session: TeacherSession) {
  const docId = session.id || session.deviceId;
  try {
    const docRef = doc(db, SESSIONS_COLLECTION, docId);
    await setDoc(docRef, removeUndefinedFields(session), { merge: true });
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, `${SESSIONS_COLLECTION}/${docId}`);
  }
}

// Block or unblock a device in real time
export async function syncSetDeviceBlockStatus(deviceId: string, isBlocked: boolean, reason?: string) {
  try {
    const docRef = doc(db, SESSIONS_COLLECTION, deviceId);
    await setDoc(docRef, removeUndefinedFields({
      id: deviceId,
      deviceId,
      isBlocked,
      blockedReason: isBlocked ? (reason || 'Administrator tomonidan bloklandi') : '',
      blockedAt: isBlocked ? new Date().toISOString() : '',
      updatedAt: new Date().toISOString(),
    }), { merge: true });
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, `${SESSIONS_COLLECTION}/${deviceId}`);
  }
}

// Delete a session
export async function syncDeleteSession(sessionId: string) {
  try {
    await deleteDoc(doc(db, SESSIONS_COLLECTION, sessionId));
  } catch (e) {
    handleFirestoreError(e, OperationType.DELETE, `${SESSIONS_COLLECTION}/${sessionId}`);
  }
}

// Send direct message to teacher
export async function syncSendTeacherMessage(message: TeacherMessage) {
  try {
    const docRef = doc(db, TEACHER_MESSAGES_COLLECTION, message.id);
    await setDoc(docRef, removeUndefinedFields(message), { merge: true });
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, `${TEACHER_MESSAGES_COLLECTION}/${message.id}`);
  }
}

// Mark teacher message as read
export async function syncMarkMessageAsRead(messageId: string, readDeviceName?: string) {
  try {
    const docRef = doc(db, TEACHER_MESSAGES_COLLECTION, messageId);
    await setDoc(docRef, removeUndefinedFields({
      isRead: true,
      readAt: new Date().toISOString(),
      readDeviceName: readDeviceName || 'Ustoz qurilmasi'
    }), { merge: true });
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, `${TEACHER_MESSAGES_COLLECTION}/${messageId}`);
  }
}

// Delete teacher message
export async function syncDeleteTeacherMessage(messageId: string) {
  try {
    await deleteDoc(doc(db, TEACHER_MESSAGES_COLLECTION, messageId));
  } catch (e) {
    handleFirestoreError(e, OperationType.DELETE, `${TEACHER_MESSAGES_COLLECTION}/${messageId}`);
  }
}

// ==========================================
// TEACHER CERTIFICATES REAL-TIME SYNC
// ==========================================

export function subscribeToTeacherCertificates(callback: (teachers: TeacherCertificate[]) => void) {
  const colRef = collection(db, TEACHER_CERTS_COLLECTION);
  return onSnapshot(
    colRef,
    (snapshot) => {
      const items: TeacherCertificate[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...(docSnap.data() as Omit<TeacherCertificate, 'id'>) });
      });
      callback(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, TEACHER_CERTS_COLLECTION);
    }
  );
}

export async function syncSaveTeacherCertificate(teacher: TeacherCertificate) {
  try {
    const cleanTeacher: TeacherCertificate = {
      ...teacher,
      fullName: (teacher.fullName || '').trim() || 'Ustoz',
      status: ['pending', 'certified', 'error'].includes(teacher.status) ? teacher.status : 'pending',
    };
    const docRef = doc(db, TEACHER_CERTS_COLLECTION, cleanTeacher.id);
    await setDoc(docRef, removeUndefinedFields(cleanTeacher), { merge: true });
  } catch (e) {
    console.error('syncSaveTeacherCertificate failed for id:', teacher.id, e);
    handleFirestoreError(e, OperationType.WRITE, `${TEACHER_CERTS_COLLECTION}/${teacher.id}`);
  }
}

export async function syncSaveBatchTeacherCertificates(teachers: TeacherCertificate[]) {
  if (!teachers.length) return;
  const chunkSize = 300;
  for (let i = 0; i < teachers.length; i += chunkSize) {
    const chunk = teachers.slice(i, i + chunkSize);
    try {
      const batch = writeBatch(db);
      for (const t of chunk) {
        const cleanT: TeacherCertificate = {
          ...t,
          fullName: (t.fullName || '').trim() || 'Ustoz',
          status: ['pending', 'certified', 'error'].includes(t.status) ? t.status : 'pending',
        };
        const docRef = doc(db, TEACHER_CERTS_COLLECTION, cleanT.id);
        batch.set(docRef, removeUndefinedFields(cleanT), { merge: true });
      }
      await batch.commit();
    } catch (e) {
      console.warn('syncSaveBatchTeacherCertificates chunk failed, falling back to individual saves:', e);
      for (const t of chunk) {
        await syncSaveTeacherCertificate(t);
      }
    }
  }
}

export async function syncDeleteTeacherCertificate(teacherId: string) {
  try {
    await deleteDoc(doc(db, TEACHER_CERTS_COLLECTION, teacherId));
  } catch (e) {
    handleFirestoreError(e, OperationType.DELETE, `${TEACHER_CERTS_COLLECTION}/${teacherId}`);
  }
}

export async function syncDeleteBatchTeacherCertificates(teacherIds: string[]) {
  if (!teacherIds.length) return;
  const chunkSize = 300;
  for (let i = 0; i < teacherIds.length; i += chunkSize) {
    const chunk = teacherIds.slice(i, i + chunkSize);
    try {
      const batch = writeBatch(db);
      for (const id of chunk) {
        batch.delete(doc(db, TEACHER_CERTS_COLLECTION, id));
      }
      await batch.commit();
    } catch (e) {
      console.warn('syncDeleteBatchTeacherCertificates chunk failed, fallback to individual delete:', e);
      for (const id of chunk) {
        await syncDeleteTeacherCertificate(id);
      }
    }
  }
}
