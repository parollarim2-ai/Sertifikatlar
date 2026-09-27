import { 
  collection, 
  doc, 
  setDoc, 
  deleteDoc, 
  onSnapshot,
  writeBatch
} from 'firebase/firestore';
import { db } from './firebase';
import { ClassGroup, Student, EmailAccount, TeacherSession, TeacherMessage } from '../types';

export const CLASSES_COLLECTION = 'classes';
export const STUDENTS_COLLECTION = 'students';
export const EMAIL_POOL_COLLECTION = 'emailPool';
export const SESSIONS_COLLECTION = 'sessions';
export const TEACHER_MESSAGES_COLLECTION = 'teacherMessages';

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
      console.warn("Firestore classes listener error (using local state fallback):", error);
    });
  } catch (err) {
    console.warn("Firestore subscribe classes initialization failed:", err);
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
      console.warn("Firestore students listener error (using local state fallback):", error);
    });
  } catch (err) {
    console.warn("Firestore subscribe students initialization failed:", err);
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
      console.warn("Firestore emails listener error (using local state fallback):", error);
    });
  } catch (err) {
    console.warn("Firestore subscribe emailPool initialization failed:", err);
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
      console.warn("Firestore sessions listener error (using local state fallback):", error);
    });
  } catch (err) {
    console.warn("Firestore subscribe sessions initialization failed:", err);
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
      console.warn("Firestore device session listener error:", error);
    });
  } catch (err) {
    console.warn("Firestore subscribe device session initialization failed:", err);
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
      console.warn("Firestore teacherMessages listener error (using local state fallback):", error);
    });
  } catch (err) {
    console.warn("Firestore subscribe teacherMessages initialization failed:", err);
    return () => {};
  }
}

// Save or update class
export async function syncSaveClass(classGroup: ClassGroup) {
  try {
    const docRef = doc(db, CLASSES_COLLECTION, classGroup.id);
    await setDoc(docRef, classGroup, { merge: true });
  } catch (e) {
    console.warn("Firestore syncSaveClass error:", e);
  }
}

// Delete class
export async function syncDeleteClass(classId: string) {
  try {
    await deleteDoc(doc(db, CLASSES_COLLECTION, classId));
  } catch (e) {
    console.warn("Firestore syncDeleteClass error:", e);
  }
}

// Save or update student
export async function syncSaveStudent(student: Student) {
  try {
    const docRef = doc(db, STUDENTS_COLLECTION, student.id);
    await setDoc(docRef, student, { merge: true });
  } catch (e) {
    console.warn("Firestore syncSaveStudent error:", e);
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
        batch.set(docRef, st, { merge: true });
      });
      await batch.commit();
    }
  } catch (e) {
    console.warn("Firestore batch write error, writing sequentially fallback:", e);
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
    console.warn("Firestore syncDeleteStudent error:", e);
  }
}

// Save single email account immediately to avoid batch overhead
export async function syncSaveSingleEmail(emailItem: EmailAccount) {
  try {
    const safeId = emailItem.email.replace(/[@.]/g, '_');
    const docRef = doc(db, EMAIL_POOL_COLLECTION, safeId);
    await setDoc(docRef, emailItem, { merge: true });
  } catch (e) {
    console.warn("Firestore syncSaveSingleEmail error:", e);
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
        batch.set(docRef, emailItem, { merge: true });
      });
      await batch.commit();
    }
  } catch (e) {
    console.warn("Firestore syncSaveEmailPool error:", e);
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
    await setDoc(docRef, {
      ...data,
      id: data.deviceId,
      deviceId: data.deviceId,
      lastActiveAt: data.lastActiveAt || new Date().toISOString(),
    }, { merge: true });
  } catch (e) {
    console.warn("Firestore syncUpdateDeviceActivity error:", e);
  }
}

// Save or update session
export async function syncSaveSession(session: TeacherSession) {
  try {
    const docRef = doc(db, SESSIONS_COLLECTION, session.id || session.deviceId);
    await setDoc(docRef, session, { merge: true });
  } catch (e) {
    console.warn("Firestore syncSaveSession error:", e);
  }
}

// Block or unblock a device in real time
export async function syncSetDeviceBlockStatus(deviceId: string, isBlocked: boolean, reason?: string) {
  try {
    const docRef = doc(db, SESSIONS_COLLECTION, deviceId);
    await setDoc(docRef, {
      id: deviceId,
      deviceId,
      isBlocked,
      blockedReason: isBlocked ? (reason || 'Administrator tomonidan bloklandi') : '',
      blockedAt: isBlocked ? new Date().toISOString() : '',
      updatedAt: new Date().toISOString(),
    }, { merge: true });
  } catch (e) {
    console.warn("Firestore syncSetDeviceBlockStatus error:", e);
  }
}

// Delete a session
export async function syncDeleteSession(sessionId: string) {
  try {
    await deleteDoc(doc(db, SESSIONS_COLLECTION, sessionId));
  } catch (e) {
    console.warn("Firestore syncDeleteSession error:", e);
  }
}

// Send direct message to teacher
export async function syncSendTeacherMessage(message: TeacherMessage) {
  try {
    const docRef = doc(db, TEACHER_MESSAGES_COLLECTION, message.id);
    await setDoc(docRef, message, { merge: true });
  } catch (e) {
    console.warn("Firestore syncSendTeacherMessage error:", e);
  }
}

// Mark teacher message as read
export async function syncMarkMessageAsRead(messageId: string, readDeviceName?: string) {
  try {
    const docRef = doc(db, TEACHER_MESSAGES_COLLECTION, messageId);
    await setDoc(docRef, {
      isRead: true,
      readAt: new Date().toISOString(),
      readDeviceName: readDeviceName || 'Ustoz qurilmasi'
    }, { merge: true });
  } catch (e) {
    console.warn("Firestore syncMarkMessageAsRead error:", e);
  }
}

// Delete teacher message
export async function syncDeleteTeacherMessage(messageId: string) {
  try {
    await deleteDoc(doc(db, TEACHER_MESSAGES_COLLECTION, messageId));
  } catch (e) {
    console.warn("Firestore syncDeleteTeacherMessage error:", e);
  }
}
