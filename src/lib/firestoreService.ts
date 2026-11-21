import { 
  collection, 
  doc, 
  setDoc,
  updateDoc,
  deleteDoc, 
  getDocs,
  onSnapshot,
  writeBatch,
  query,
  where
} from 'firebase/firestore';
import { db, auth } from './firebase';
import firebaseConfig from '../../firebase-applet-config.json';
import { ClassGroup, Student, EmailAccount, TeacherSession, TeacherMessage, TeacherCertificate } from '../types';

export const CLASSES_COLLECTION = 'classes';
export const STUDENTS_COLLECTION = 'students';
export const EMAIL_POOL_COLLECTION = 'emailPool';
export const SESSIONS_COLLECTION = 'sessions';
export const TEACHER_MESSAGES_COLLECTION = 'teacherMessages';
export const TEACHER_CERTS_COLLECTION = 'teacherCertificates';

// Track session IDs known to already exist on Firestore so updates avoid failing first
const knownExistingSessionIds = new Set<string>();

function toFirestoreRestValue(val: unknown): Record<string, any> | null {
  if (val === undefined) return null;
  if (val === null) return { nullValue: null };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') {
    if (!Number.isFinite(val)) return { integerValue: '0' };
    return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
  }
  if (typeof val === 'string') return { stringValue: val };
  if (Array.isArray(val)) {
    const values = val
      .map(item => toFirestoreRestValue(item))
      .filter((v): v is Record<string, any> => v !== null);
    return { arrayValue: { values } };
  }
  if (typeof val === 'object') {
    const fields: Record<string, any> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      const converted = toFirestoreRestValue(v);
      if (converted !== null) fields[k] = converted;
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

function fromFirestoreRestValue(v: Record<string, any> | undefined): any {
  if (!v) return undefined;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return Boolean(v.booleanValue);
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) {
    const arr = Array.isArray(v.arrayValue?.values) ? v.arrayValue.values : [];
    return arr.map((item: any) => fromFirestoreRestValue(item));
  }
  if ('mapValue' in v) {
    const obj: Record<string, any> = {};
    const fields = v.mapValue?.fields || {};
    for (const [k, fv] of Object.entries(fields)) {
      obj[k] = fromFirestoreRestValue(fv as Record<string, any>);
    }
    return obj;
  }
  return undefined;
}

function getFirestoreRestBaseUrl() {
  const cfg = firebaseConfig as Record<string, any>;
  const projectId = cfg.projectId;
  const dbId = cfg.firestoreDatabaseId || '(default)';
  const apiKey = cfg.apiKey;
  if (!projectId || !apiKey) return null;
  return {
    baseUrl: `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(dbId)}/documents`,
    apiKey,
  };
}

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

// Ultra-light real-time listener for ONLY blocked sessions (cross-browser hardware block with ZERO heartbeat re-renders)
export function subscribeToBlockedSessions(onUpdate: (blockedSessions: TeacherSession[]) => void) {
  try {
    const q = query(collection(db, SESSIONS_COLLECTION), where('isBlocked', '==', true));
    return onSnapshot(q, (snapshot) => {
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

// Fetch hidden Firestore server createTime / updateTime via Firestore REST API
export async function fetchDocumentServerTimestamps(
  collectionName: string,
  docId: string
): Promise<{ createTime?: string; updateTime?: string } | null> {
  try {
    const cfg = firebaseConfig as Record<string, any>;
    const projectId = cfg.projectId;
    const dbId = cfg.firestoreDatabaseId || '(default)';
    const apiKey = cfg.apiKey;
    if (!projectId || !apiKey || !docId) return null;

    const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(dbId)}/documents/${encodeURIComponent(collectionName)}/${encodeURIComponent(docId)}?mask.fieldPaths=paidAmount&key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    return {
      createTime: typeof data.createTime === 'string' ? data.createTime : undefined,
      updateTime: typeof data.updateTime === 'string' ? data.updateTime : undefined,
    };
  } catch {
    return null;
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

// Instant Firestore REST API presence check/create/update (bypasses SDK WebChannel snapshot download queue)
export async function sendSessionPresenceFast(
  data: Partial<TeacherSession> & { deviceId: string },
  options?: { onBlockedDetected?: (session: TeacherSession) => void }
): Promise<boolean> {
  const rest = getFirestoreRestBaseUrl();
  if (!rest || typeof fetch === 'undefined' || !data.deviceId) return false;

  const { baseUrl, apiKey } = rest;
  const encodedDoc = encodeURIComponent(data.deviceId);
  const nowIso = new Date().toISOString();

  const cleanUpdate: Record<string, any> = removeUndefinedFields({
    ...data,
    id: data.deviceId,
    deviceId: data.deviceId,
    lastActiveAt: data.lastActiveAt || nowIso,
  });
  delete cleanUpdate.isBlocked;
  delete cleanUpdate.blockedReason;
  delete cleanUpdate.blockedAt;
  delete cleanUpdate.blockHardware;

  const buildFieldsPayload = (obj: Record<string, any>) => {
    const fields: Record<string, any> = {};
    for (const [k, v] of Object.entries(obj)) {
      const converted = toFirestoreRestValue(v);
      if (converted !== null) fields[k] = converted;
    }
    return fields;
  };

  try {
    let existsOnServer = knownExistingSessionIds.has(data.deviceId);

    if (!existsOnServer) {
      const checkUrl =
        `${baseUrl}/${SESSIONS_COLLECTION}/${encodedDoc}` +
        `?mask.fieldPaths=deviceId&mask.fieldPaths=isBlocked&mask.fieldPaths=blockedReason&mask.fieldPaths=blockHardware` +
        `&key=${encodeURIComponent(apiKey)}`;
      const checkRes = await fetch(checkUrl, { method: 'GET', cache: 'no-store' });

      if (checkRes.status === 404) {
        existsOnServer = false;
      } else if (checkRes.ok) {
        existsOnServer = true;
        knownExistingSessionIds.add(data.deviceId);
        const docJson = await checkRes.json().catch(() => null);
        const f = docJson?.fields;
        if (f?.isBlocked?.booleanValue === true) {
          options?.onBlockedDetected?.({
            id: data.deviceId,
            deviceId: data.deviceId,
            hardwareId: data.hardwareId,
            deviceName: data.deviceName || 'Qurilma',
            browser: data.browser || 'Brauzer',
            os: data.os || 'OS',
            teacherName: data.teacherName || '',
            className: data.className || '',
            classId: data.classId || '',
            lastActiveAt: nowIso,
            createdAt: nowIso,
            isBlocked: true,
            blockHardware: f.blockHardware?.booleanValue ?? true,
            blockedReason: f.blockedReason?.stringValue || 'Administrator tomonidan bloklandi',
          });
        }
      }
    }

    if (!existsOnServer) {
      // Brand new device: create document directly with isBlocked: false
      const createPayload = {
        ...cleanUpdate,
        deviceName: cleanUpdate.deviceName || 'Qurilma',
        browser: cleanUpdate.browser || 'Brauzer',
        os: cleanUpdate.os || 'OS',
        teacherName: cleanUpdate.teacherName ?? '',
        className: cleanUpdate.className ?? '',
        classId: cleanUpdate.classId ?? '',
        createdAt: cleanUpdate.createdAt || nowIso,
        enteredAt: cleanUpdate.enteredAt || nowIso,
        isOnline: cleanUpdate.isOnline ?? true,
        isBlocked: false,
      };
      const createUrl = `${baseUrl}/${SESSIONS_COLLECTION}/${encodedDoc}?key=${encodeURIComponent(apiKey)}`;
      const createRes = await fetch(createUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: buildFieldsPayload(createPayload) }),
      });
      if (createRes.ok) {
        knownExistingSessionIds.add(data.deviceId);
        return true;
      }
      return false;
    }

    // Existing doc: masked PATCH updating only presence/activity/device fields (preserves isBlocked)
    const fieldsObj = buildFieldsPayload(cleanUpdate);
    const maskParams = Object.keys(fieldsObj)
      .map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`)
      .join('&');
    const patchUrl = `${baseUrl}/${SESSIONS_COLLECTION}/${encodedDoc}?${maskParams}&key=${encodeURIComponent(apiKey)}`;
    const patchRes = await fetch(patchUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: fieldsObj }),
    });

    if (patchRes.ok) {
      return true;
    }
    if (patchRes.status === 404 || patchRes.status === 403) {
      // Session might have been deleted by Admin while device stayed open -> recreate cleanly
      knownExistingSessionIds.delete(data.deviceId);
      const createPayload = {
        ...cleanUpdate,
        deviceName: cleanUpdate.deviceName || 'Qurilma',
        browser: cleanUpdate.browser || 'Brauzer',
        os: cleanUpdate.os || 'OS',
        teacherName: cleanUpdate.teacherName ?? '',
        className: cleanUpdate.className ?? '',
        classId: cleanUpdate.classId ?? '',
        createdAt: cleanUpdate.createdAt || nowIso,
        enteredAt: cleanUpdate.enteredAt || nowIso,
        isOnline: cleanUpdate.isOnline ?? true,
        isBlocked: false,
      };
      const recreateRes = await fetch(`${baseUrl}/${SESSIONS_COLLECTION}/${encodedDoc}?key=${encodeURIComponent(apiKey)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: buildFieldsPayload(createPayload) }),
      });
      if (recreateRes.ok) {
        knownExistingSessionIds.add(data.deviceId);
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

// Fast one-shot REST fetch of all sessions for immediate Admin tab mount (avoids WebChannel cold-start wait)
export async function fetchSessionsListOnce(): Promise<TeacherSession[]> {
  const rest = getFirestoreRestBaseUrl();
  if (rest && typeof fetch !== 'undefined') {
    try {
      const url = `${rest.baseUrl}/${SESSIONS_COLLECTION}?pageSize=300&key=${encodeURIComponent(rest.apiKey)}`;
      const res = await fetch(url, { method: 'GET', cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        const docs = Array.isArray(data?.documents) ? data.documents : [];
        return docs.map((d: any) => {
          const docId = typeof d.name === 'string' ? d.name.split('/').pop() || '' : '';
          const parsed: Record<string, any> = {};
          if (d.fields) {
            for (const [k, fv] of Object.entries(d.fields)) {
              parsed[k] = fromFirestoreRestValue(fv as Record<string, any>);
            }
          }
          if (docId) knownExistingSessionIds.add(docId);
          return { id: docId, ...parsed } as TeacherSession;
        });
      }
    } catch {
      // fall through to SDK getDocs
    }
  }

  try {
    const snap = await getDocs(collection(db, SESSIONS_COLLECTION));
    const items: TeacherSession[] = [];
    snap.forEach(docSnap => {
      knownExistingSessionIds.add(docSnap.id);
      items.push({ id: docSnap.id, ...docSnap.data() } as TeacherSession);
    });
    return items;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, SESSIONS_COLLECTION);
    return [];
  }
}

// Update device activity safely without touching isBlocked status on existing docs
export async function syncUpdateDeviceActivity(
  data: Partial<TeacherSession> & { deviceId: string },
  options?: { onBlockedDetected?: (session: TeacherSession) => void }
) {
  // Prioritize direct REST fast-path so startup writes arrive in <250ms regardless of WebChannel snapshot queue
  const restSucceeded = await sendSessionPresenceFast(data, options);
  if (restSucceeded) return;

  const docRef = doc(db, SESSIONS_COLLECTION, data.deviceId);
  const nowIso = new Date().toISOString();
  const payload = removeUndefinedFields({
    ...data,
    id: data.deviceId,
    deviceId: data.deviceId,
    lastActiveAt: data.lastActiveAt || nowIso,
  });
  delete (payload as any).isBlocked;
  delete (payload as any).blockedReason;
  delete (payload as any).blockedAt;

  try {
    await updateDoc(docRef, payload as Record<string, any>);
    knownExistingSessionIds.add(data.deviceId);
  } catch (e: any) {
    const code = e?.code || '';
    const msg = e instanceof Error ? e.message : String(e);
    if (code === 'not-found' || msg.includes('No document to update')) {
      try {
        await setDoc(docRef, {
          ...payload,
          deviceName: payload.deviceName || 'Qurilma',
          browser: payload.browser || 'Brauzer',
          os: payload.os || 'OS',
          teacherName: payload.teacherName || '',
          className: payload.className || '',
          classId: payload.classId || '',
          createdAt: payload.createdAt || nowIso,
          enteredAt: payload.enteredAt || nowIso,
          isOnline: payload.isOnline ?? true,
          isBlocked: false,
        }, { merge: true });
        knownExistingSessionIds.add(data.deviceId);
        return;
      } catch (createErr) {
        handleFirestoreError(createErr, OperationType.CREATE, `${SESSIONS_COLLECTION}/${data.deviceId}`);
      }
    } else {
      handleFirestoreError(e, OperationType.WRITE, `${SESSIONS_COLLECTION}/${data.deviceId}`);
    }
  }
}

// Keepalive REST PATCH when user closes tab / hides page so leftAt & isOnline=false persist instantly
export function sendSessionLeaveKeepalive(deviceId: string, actionText = 'Sahifadan chiqdi') {
  try {
    const cfg = firebaseConfig as Record<string, any>;
    const projectId = cfg.projectId;
    const dbId = cfg.firestoreDatabaseId || '(default)';
    const apiKey = cfg.apiKey;
    if (!projectId || !apiKey || !deviceId || typeof fetch === 'undefined') return;

    const nowIso = new Date().toISOString();
    const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(dbId)}/documents/${SESSIONS_COLLECTION}/${encodeURIComponent(deviceId)}?updateMask.fieldPaths=isOnline&updateMask.fieldPaths=leftAt&updateMask.fieldPaths=lastActiveAt&updateMask.fieldPaths=currentAction&key=${encodeURIComponent(apiKey)}`;

    fetch(url, {
      method: 'PATCH',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          isOnline: { booleanValue: false },
          leftAt: { stringValue: nowIso },
          lastActiveAt: { stringValue: nowIso },
          currentAction: { stringValue: actionText },
        },
      }),
    }).catch(() => {});
  } catch {
    // ignore keepalive failure on unload
  }
}

// Save or update session
export async function syncSaveSession(
  session: TeacherSession,
  options?: { onBlockedDetected?: (session: TeacherSession) => void }
) {
  const docId = session.id || session.deviceId;
  if (!session.isBlocked) {
    const restSucceeded = await sendSessionPresenceFast({ ...session, deviceId: docId }, options);
    if (restSucceeded) return;
  }
  try {
    const docRef = doc(db, SESSIONS_COLLECTION, docId);
    await setDoc(docRef, removeUndefinedFields(session), { merge: true });
    knownExistingSessionIds.add(docId);
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
      blockHardware: isBlocked,
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
