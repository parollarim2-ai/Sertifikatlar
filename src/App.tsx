import React, { useState, useEffect, useMemo, useRef, useCallback, Suspense } from 'react';
import { ClassGroup, Student, EmailAccount, TeacherSession, TeacherMessage, TelegramUser, TeacherCertificate, PaymentMethod, PaymentHistoryEntry, GraphicsTier, SessionActionLog } from './types';
import { INITIAL_CLASSES, INITIAL_STUDENTS, INITIAL_EMAIL_POOL } from './data/mockData';
import { TeacherPortal } from './components/TeacherPortal';
import { AdminPanel } from './components/AdminPanel';
import { StudentModal } from './components/StudentModal';
import { PaymentModal } from './components/PaymentModal';
import { BulkEmailModal } from './components/BulkEmailModal';
import { BulkStudentUploadModal } from './components/BulkStudentUploadModal';
import { AdminLoginModal } from './components/AdminLoginModal';
import { TeacherMessageModal } from './components/TeacherMessageModal';
import { GraphicsSettingsModal } from './components/GraphicsSettingsModal';
import { BlockedAccessOverlay } from './components/BlockedAccessOverlay';
import { LandingPagePro } from './components/LandingPagePro';
import { detectCurrentDevice, enrichDeviceWithClientHints } from './utils/deviceDetector';

const UltraWorldOverlay = React.lazy(() =>
  import('./components/UltraWorldOverlay').then(m => ({ default: m.UltraWorldOverlay }))
);
const OceanPhysicsOverlay = React.lazy(() =>
  import('./components/OceanPhysicsOverlay').then(m => ({ default: m.OceanPhysicsOverlay }))
);
import { 
  subscribeToClasses,
  subscribeToStudents,
  subscribeToEmailPool,
  subscribeToBlockedSessions,
  subscribeToDeviceSession,
  subscribeToTeacherMessages,
  syncSaveClass,
  syncDeleteClass,
  syncSaveStudent,
  syncSaveBatchStudents,
  syncDeleteStudent,
  syncSaveEmailPool,
  syncSaveSession,
  syncUpdateDeviceActivity,
  sendSessionLeaveKeepalive,
  syncSetDeviceBlockStatus,
  syncDeleteSession,
  syncSendTeacherMessage,
  syncMarkMessageAsRead,
  syncDeleteTeacherMessage,
  syncSaveSingleEmail,
  subscribeToTeacherCertificates,
  syncSaveTeacherCertificate,
  syncSaveBatchTeacherCertificates,
  syncDeleteTeacherCertificate,
  syncDeleteBatchTeacherCertificates,
} from './lib/firestoreService';
import { recordCertifyEvent } from './utils/operatorSpeedTracker';
import { 
  ShieldCheck, 
  Lock, 
  Trash2, 
  ArrowLeft,
  GraduationCap,
  Sliders,
  Home
} from 'lucide-react';

const STORAGE_CLASSES_KEY = 'b1m_school_classes_v5';
const STORAGE_STUDENTS_KEY = 'b1m_school_students_v5';
const STORAGE_EMAILS_KEY = 'b1m_school_emails_v5';
const STORAGE_ADMIN_AUTH_KEY = 'b1m_school_admin_auth_v5';
const STORAGE_TEACHERS_KEY = 'b1m_school_teacher_certs_v5';

export default function App() {
  // Load state from localStorage or initial empty list
  const [classes, setClasses] = useState<ClassGroup[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_CLASSES_KEY);
      return saved ? JSON.parse(saved) : INITIAL_CLASSES;
    } catch {
      return INITIAL_CLASSES;
    }
  });

  const [students, setStudents] = useState<Student[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_STUDENTS_KEY);
      return saved ? JSON.parse(saved) : INITIAL_STUDENTS;
    } catch {
      return INITIAL_STUDENTS;
    }
  });

  const [emailPool, setEmailPool] = useState<EmailAccount[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_EMAILS_KEY);
      return saved ? JSON.parse(saved) : INITIAL_EMAIL_POOL;
    } catch {
      return INITIAL_EMAIL_POOL;
    }
  });

  // Teacher certificates state (Admin-only)
  const [teacherCertificates, setTeacherCertificates] = useState<TeacherCertificate[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_TEACHERS_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_TEACHERS_KEY, JSON.stringify(teacherCertificates));
      } catch {}
    }, 1500);
    return () => clearTimeout(t);
  }, [teacherCertificates]);

  // 4-Tier Graphics & Performance Setting (Defaults to 'medium' on all devices)
  const [graphicsTier, setGraphicsTier] = useState<GraphicsTier>(() => {
    try {
      const saved = localStorage.getItem('b1m_graphics_tier');
      if (saved === 'lite' || saved === 'medium' || saved === 'high' || saved === 'ultra') return saved;
    } catch {}
    return 'medium';
  });
  // Keep graphicsTier persisted, but enforce clean architectural mode on the Landing view (zero cosmic CSS)
  const [isGraphicsSettingsOpen, setIsGraphicsSettingsOpen] = useState(false);

  // Current device hardware + browser fingerprint (synchronously detected + async Client Hints enrichment)
  const [currentDevice, setCurrentDevice] = useState(() => detectCurrentDevice());
  useEffect(() => {
    enrichDeviceWithClientHints((refined) => {
      setCurrentDevice(refined);
    });
  }, []);
  const [directBlockedSession, setDirectBlockedSession] = useState<TeacherSession | null>(null);
  const [blockedSessions, setBlockedSessions] = useState<TeacherSession[]>([]);
  const directBlockedRef = useRef<TeacherSession | null>(null);
  const blockedSessionsRef = useRef<TeacherSession[]>([]);

  const [messages, setMessages] = useState<TeacherMessage[]>([]);
  const [telegramUsers, setTelegramUsers] = useState<TelegramUser[]>([]);

  // Fetch connected Telegram users on demand (and poll only while Admin view is open)
  const fetchTelegramStatus = useCallback(() => {
    fetch('/api/telegram/status')
      .then((res) => res.json())
      .then((data) => {
        if (data.users && Array.isArray(data.users)) {
          setTelegramUsers((prev) => {
            if (prev.length === data.users.length && JSON.stringify(prev) === JSON.stringify(data.users)) {
              return prev;
            }
            return data.users;
          });
        }
      })
      .catch(() => {});
  }, []);

  // Debounce syncing classes and students to server telegram store (prevents main thread stutter)
  useEffect(() => {
    if (classes.length === 0 && students.length === 0) return;

    const timer = setTimeout(() => {
      fetch('/api/telegram/sync-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classes, students }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.users && Array.isArray(data.users)) {
            setTelegramUsers((prev) => {
              if (prev.length === data.users.length && JSON.stringify(prev) === JSON.stringify(data.users)) {
                return prev;
              }
              return data.users;
            });
          }
        })
        .catch(() => {});
    }, 2500);

    return () => clearTimeout(timer);
  }, [classes, students]);

  // Admin authentication state
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_ADMIN_AUTH_KEY) === 'true';
    } catch {
      return false;
    }
  });

  // Active view: Landing Page Pro Max Ultra by default unless #admin or #portal is targeted
  const [currentView, setCurrentView] = useState<'landing' | 'teacher' | 'admin'>(() => {
    if (typeof window !== 'undefined') {
      if (window.location.hash.includes('admin') || window.location.search.includes('admin')) {
        return 'admin';
      }
      if (window.location.hash.includes('portal') || window.location.search.includes('portal')) {
        return 'teacher';
      }
    }
    return 'landing';
  });

  const [portalLaunchTarget, setPortalLaunchTarget] = useState<{
    track?: 'ai' | 'developer';
    classId?: string;
  } | null>(null);

  useEffect(() => {
    try {
      document.documentElement.dataset.graphics = currentView === 'landing' ? 'medium' : graphicsTier;
      localStorage.setItem('b1m_graphics_tier', graphicsTier);
    } catch {}
  }, [graphicsTier, currentView]);

  const handleEnterPortal = useCallback((track?: 'ai' | 'developer', classId?: string) => {
    if (track) {
      try {
        localStorage.setItem('teacher_portal_active_project', track);
        localStorage.setItem('teacher_portal_has_chosen', 'true');
      } catch {}
    }
    if (track || classId) {
      setPortalLaunchTarget({ track, classId });
    } else {
      setPortalLaunchTarget(null);
    }
    setCurrentView('teacher');
    if (typeof window !== 'undefined') {
      window.location.hash = '#portal';
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, []);

  const handleReturnToLanding = useCallback(() => {
    setCurrentView('landing');
    if (typeof window !== 'undefined') {
      window.location.hash = '';
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, []);

  // Poll Telegram status ONLY when Admin view is active (60s interval; never in teacher view)
  useEffect(() => {
    if (currentView !== 'admin') return;
    fetchTelegramStatus();
    const interval = setInterval(fetchTelegramStatus, 60000);
    return () => clearInterval(interval);
  }, [currentView, fetchTelegramStatus]);

  // Modals state
  const [activeStudentModal, setActiveStudentModal] = useState<Student | null>(null);
  const [activePaymentClass, setActivePaymentClass] = useState<ClassGroup | null>(null);
  const [auditTargetClass, setAuditTargetClass] = useState<ClassGroup | null>(null);
  const [isBulkEmailOpen, setIsBulkEmailOpen] = useState(false);
  const [isBulkUploadOpen, setIsBulkUploadOpen] = useState(false);
  const [bulkUploadInitialClassId, setBulkUploadInitialClassId] = useState<string | undefined>(undefined);
  const [isAdminLoginOpen, setIsAdminLoginOpen] = useState(false);
  const [activeMessageClass, setActiveMessageClass] = useState<ClassGroup | null>(null);

  // App-wide toast notification system (No window.alert)
  const [appToast, setAppToast] = useState<{ message: string; type?: 'success' | 'error' | 'info' } | null>(null);
  const showAppToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setAppToast({ message, type });
    setTimeout(() => setAppToast(null), 4000);
  };

  const [isConfirmClearOpen, setIsConfirmClearOpen] = useState(false);

  // Check URL hash for admin / portal / landing
  useEffect(() => {
    const handleHashChange = () => {
      if (window.location.hash.includes('admin')) {
        if (isAdminAuthenticated) {
          setCurrentView('admin');
        } else {
          setIsAdminLoginOpen(true);
        }
      } else if (window.location.hash.includes('portal')) {
        setCurrentView('teacher');
      } else {
        setCurrentView('landing');
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [isAdminAuthenticated]);

  // Anti-tamper & Admin Token Cryptographic Verification
  useEffect(() => {
    console.log(
      "%c🛡️ TIZIM XAVFSIZLIGI FAOL (SECURITY SHIELD ACTIVE)\n%cSayt kodi va ma'lumotlar bazasi to'liq shifrlangan va himoyalangan. Ruxsatsiz kirish va o'zgartirishlar taqiqlanadi.",
      "color: #2563eb; font-size: 14px; font-weight: bold;",
      "color: #64748b; font-size: 12px;"
    );

    const token = localStorage.getItem('b1m_admin_token');
    const authFlag = localStorage.getItem(STORAGE_ADMIN_AUTH_KEY) === 'true';

    if (authFlag) {
      if (!token) {
        setIsAdminAuthenticated(false);
        localStorage.removeItem(STORAGE_ADMIN_AUTH_KEY);
        if (window.location.hash.includes('admin')) {
          setCurrentView('teacher');
        }
      } else {
        fetch('/api/admin/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        })
          .then((res) => res.json())
          .then((data) => {
            if (!data.valid) {
              console.warn("⚠️ Admin sessiyasi yaroqsiz yoki muddati o'tgan.");
              setIsAdminAuthenticated(false);
              localStorage.removeItem(STORAGE_ADMIN_AUTH_KEY);
              localStorage.removeItem('b1m_admin_token');
              if (window.location.hash.includes('admin')) {
                setCurrentView('teacher');
              }
            }
          })
          .catch(() => {});
      }
    }
  }, []);

  // Firestore real-time subscriptions
  useEffect(() => {
    const unsubClasses = subscribeToClasses((remoteClasses) => {
      if (remoteClasses) {
        setClasses(remoteClasses);
      }
    });

    const unsubStudents = subscribeToStudents((remoteStudents) => {
      if (remoteStudents) {
        setStudents(remoteStudents);
      }
    });

    const unsubEmails = subscribeToEmailPool((remoteEmails) => {
      if (remoteEmails && remoteEmails.length > 0) {
        setEmailPool(remoteEmails);
      }
    });

    const unsubBlockedSessions = subscribeToBlockedSessions((remoteBlocked) => {
      blockedSessionsRef.current = remoteBlocked;
      setBlockedSessions(prev => {
        if (prev.length === 0 && remoteBlocked.length === 0) return prev;
        if (
          prev.length === remoteBlocked.length &&
          prev.every((p, idx) =>
            p.deviceId === remoteBlocked[idx]?.deviceId &&
            p.isBlocked === remoteBlocked[idx]?.isBlocked &&
            p.blockHardware === remoteBlocked[idx]?.blockHardware &&
            p.blockedReason === remoteBlocked[idx]?.blockedReason
          )
        ) {
          return prev;
        }
        return remoteBlocked;
      });
    });

    const unsubMessages = subscribeToTeacherMessages((remoteMessages) => {
      if (remoteMessages) {
        setMessages(remoteMessages);
      }
    });

    const unsubTeacherCerts = subscribeToTeacherCertificates((remoteTeachers) => {
      if (remoteTeachers) {
        setTeacherCertificates((prevLocal) => {
          if (remoteTeachers.length > 0) {
            return remoteTeachers;
          }
          return prevLocal.length > 0 ? prevLocal : [];
        });
      }
    });

    // Dedicated instant single-device block listener (< 200ms reaction without heartbeat re-renders)
    const unsubDirectDevice = subscribeToDeviceSession(currentDevice.deviceId, (remoteSess) => {
      const blockedSess = remoteSess?.isBlocked ? remoteSess : null;
      directBlockedRef.current = blockedSess;
      setDirectBlockedSession(prev => {
        if (!prev && !blockedSess) return prev;
        if (
          prev?.deviceId === blockedSess?.deviceId &&
          prev?.isBlocked === blockedSess?.isBlocked &&
          prev?.blockHardware === blockedSess?.blockHardware &&
          prev?.blockedReason === blockedSess?.blockedReason
        ) {
          return prev;
        }
        return blockedSess;
      });
    });

    return () => {
      unsubClasses();
      unsubStudents();
      unsubEmails();
      unsubBlockedSessions();
      unsubMessages();
      unsubTeacherCerts();
      unsubDirectDevice();
    };
  }, [currentDevice.deviceId]);

  // Debounced localStorage backups (prevents main-thread UI freeze & RAM spike on large datasets)
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_CLASSES_KEY, JSON.stringify(classes));
      } catch {}
    }, 1500);
    return () => clearTimeout(t);
  }, [classes]);

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        // Strip heavy base64 error screenshots (> 4KB) before persisting in localStorage
        const lightweightStudents = students.map((st) => {
          const strip = (v?: string) => (v && v.length > 4096 ? undefined : v);
          const e1 = strip(st.errorImage);
          const e2 = strip(st.aiErrorImage);
          const e3 = strip(st.devErrorImage);
          if (e1 === st.errorImage && e2 === st.aiErrorImage && e3 === st.devErrorImage) {
            return st;
          }
          return { ...st, errorImage: e1, aiErrorImage: e2, devErrorImage: e3 };
        });
        localStorage.setItem(STORAGE_STUDENTS_KEY, JSON.stringify(lightweightStudents));
      } catch {}
    }, 1800);
    return () => clearTimeout(t);
  }, [students]);

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_EMAILS_KEY, JSON.stringify(emailPool));
      } catch {}
    }, 1500);
    return () => clearTimeout(t);
  }, [emailPool]);

  // ESC key listener to close open modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveStudentModal(null);
        setActivePaymentClass(null);
        setIsBulkUploadOpen(false);
        setIsBulkEmailOpen(false);
        setIsAdminLoginOpen(false);
        setActiveMessageClass(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Verify cryptographic admin token with backend on load
  useEffect(() => {
    const token = localStorage.getItem('b1m_admin_token');
    if (token) {
      fetch('/api/admin/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (!data.valid) {
            localStorage.removeItem('b1m_admin_token');
            localStorage.removeItem(STORAGE_ADMIN_AUTH_KEY);
            setIsAdminAuthenticated(false);
            if (currentView === 'admin') setCurrentView('teacher');
          } else {
            setIsAdminAuthenticated(true);
          }
        })
        .catch(() => {});
    } else {
      localStorage.removeItem(STORAGE_ADMIN_AUTH_KEY);
      setIsAdminAuthenticated(false);
    }
  }, []);

  // Admin login handler
  const handleAdminLoginSuccess = () => {
    setIsAdminAuthenticated(true);
    localStorage.setItem(STORAGE_ADMIN_AUTH_KEY, 'true');
    setIsAdminLoginOpen(false);
    setCurrentView('admin');
    window.location.hash = '#admin';
  };

  const handleAdminLogout = () => {
    setIsAdminAuthenticated(false);
    localStorage.removeItem('b1m_admin_token');
    localStorage.removeItem(STORAGE_ADMIN_AUTH_KEY);
    setCurrentView('teacher');
    window.location.hash = '#portal';
  };

  const handleOpenAdminLogin = () => {
    if (isAdminAuthenticated) {
      setCurrentView('admin');
      window.location.hash = '#admin';
    } else {
      setIsAdminLoginOpen(true);
    }
  };

  // Student Actions
  const handleSaveStudent = async (student: Student) => {
    let studentToSave = { ...student };
    if (studentToSave.certificateLink && studentToSave.certificateLink.trim().length > 5) {
      studentToSave.status = 'certified';
      if (!studentToSave.certifiedAt) {
        studentToSave.certifiedAt = new Date().toISOString();
      }
      recordCertifyEvent(studentToSave.id, studentToSave.fullName, studentToSave.certifiedAt);
    }

    setStudents(prev => {
      const exists = prev.some(s => s.id === studentToSave.id);
      if (exists) {
        return prev.map(s => s.id === studentToSave.id ? studentToSave : s);
      }
      return [...prev, studentToSave];
    });
    setActiveStudentModal(null);
    await syncSaveStudent(studentToSave);
  };

  const handleSaveBatchStudents = async (updatedStudents: Student[]) => {
    if (!updatedStudents || updatedStudents.length === 0) return;
    const updatedMap = new Map(updatedStudents.map(s => [s.id, s]));
    setStudents(prev => prev.map(s => updatedMap.get(s.id) || s));
    await syncSaveBatchStudents(updatedStudents);
  };

  const handleAddSingleStudent = async (student: Student, updatedPool?: EmailAccount[]) => {
    // 1. Immediately update students in local state
    setStudents(prev => [...prev, student]);

    // 2. Mark assigned email as used in emailPool immediately
    if (student.assignedEmail) {
      const targetEmail = student.assignedEmail.trim().toLowerCase();
      setEmailPool(prev => prev.map(e => 
        e.email.trim().toLowerCase() === targetEmail 
          ? { ...e, isUsed: true, assignedToStudentId: student.id } 
          : e
      ));
    } else if (updatedPool) {
      setEmailPool(updatedPool);
    }

    // 3. Persist student in Firestore
    await syncSaveStudent(student);

    // 4. Persist email atomically without batch limit issues
    if (student.assignedEmail) {
      const targetObj = updatedPool?.find(e => e.email.trim().toLowerCase() === student.assignedEmail!.trim().toLowerCase()) || {
        email: student.assignedEmail,
        password: student.assignedPassword || 'MaktabPass2026!',
        isUsed: true,
        assignedToStudentId: student.id,
        addedAt: new Date().toISOString()
      };
      await syncSaveSingleEmail(targetObj);
    }
  };

  const handleDeleteStudent = async (studentId: string) => {
    setStudents(prev => prev.filter(s => s.id !== studentId));
    setActiveStudentModal(null);
    try {
      await syncDeleteStudent(studentId);
    } catch (e) {
      console.error("O'quvchini o'chirishda xatolik:", e);
    }
  };

  // Class Actions
  const handleSaveClass = async (classGroup: ClassGroup) => {
    setClasses(prev => {
      const exists = prev.some(c => c.id === classGroup.id);
      if (exists) {
        return prev.map(c => c.id === classGroup.id ? classGroup : c);
      }
      return [...prev, classGroup];
    });
    await syncSaveClass(classGroup);
  };

  const handleDeleteClass = async (classId: string) => {
    const studentsToDelete = students.filter(s => s.classId === classId);
    setClasses(prev => prev.filter(c => c.id !== classId));
    setStudents(prev => prev.filter(s => s.classId !== classId));
    
    try {
      await syncDeleteClass(classId);
      for (const s of studentsToDelete) {
        await syncDeleteStudent(s.id);
      }
    } catch (e) {
      console.error("Sinfni o'chirishda xatolik:", e);
    }
  };

  const handleUpdatePayment = async (
    classId: string, 
    newPaidAmount: number,
    updatedStudentPayments?: { studentId: string; isPaid: boolean }[],
    paymentMeta?: {
      method?: PaymentMethod;
      note?: string;
      unverified?: boolean;
    }
  ) => {
    const targetClass = classes.find(c => c.id === classId);
    if (!targetClass) return;

    const isDev = targetClass.projectType === 'developer';
    const track: 'ai' | 'developer' = isDev ? 'developer' : 'ai';
    const previousAmount = isDev
      ? (targetClass.devPaidAmount ?? (targetClass.id.startsWith('class-dev-') ? (targetClass.paidAmount || 0) : 0))
      : (targetClass.aiPaidAmount ?? targetClass.paidAmount ?? 0);

    const nowIso = new Date().toISOString();
    const paidCount = updatedStudentPayments
      ? updatedStudentPayments.filter(p => p.isPaid).length
      : students.filter(s => s.classId === classId && s.isPaid).length;

    const method: PaymentMethod = paymentMeta?.method || (paymentMeta?.unverified ? 'tekshirish' : (targetClass.paymentMethod || 'naqd'));
    const unverified = typeof paymentMeta?.unverified === 'boolean'
      ? paymentMeta.unverified
      : (newPaidAmount === 0 ? false : Boolean(targetClass.paymentUnverified));
    const trimmedNote = (paymentMeta?.note ?? targetClass.paymentNote ?? '').trim();

    const shouldLog =
      previousAmount !== newPaidAmount ||
      unverified !== Boolean(targetClass.paymentUnverified) ||
      Boolean(paymentMeta?.note && paymentMeta.note.trim() !== (targetClass.paymentNote || '').trim()) ||
      (paymentMeta?.method && paymentMeta.method !== targetClass.paymentMethod);

    const existingHistory = Array.isArray(targetClass.paymentHistory) ? targetClass.paymentHistory : [];
    const newEntry: PaymentHistoryEntry | null = shouldLog
      ? {
          id: `pay-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          date: nowIso,
          track,
          previousAmount,
          newAmount: newPaidAmount,
          delta: newPaidAmount - previousAmount,
          method,
          note: trimmedNote || undefined,
          paidStudentCount: paidCount,
          unverified,
        }
      : null;

    const updatedHistory = newEntry
      ? [newEntry, ...existingHistory].slice(0, 50)
      : existingHistory;

    const updatedClass: ClassGroup = {
      ...targetClass,
      paidAmount: newPaidAmount,
      ...(isDev ? { devPaidAmount: newPaidAmount } : { aiPaidAmount: newPaidAmount }),
      paymentUnverified: unverified,
      paymentMethod: method,
      paymentNote: trimmedNote,
      lastPaymentAt: newPaidAmount > 0 ? nowIso : (targetClass.lastPaymentAt || nowIso),
      paymentHistory: updatedHistory,
    };

    setClasses(prev => prev.map(c => c.id === classId ? updatedClass : c));

    let updatedStudentsList: Student[] = [];
    if (updatedStudentPayments && updatedStudentPayments.length > 0) {
      const paymentMap = new Map(updatedStudentPayments.map(p => [p.studentId, p.isPaid]));
      
      setStudents(prev => {
        const next = prev.map(s => {
          if (paymentMap.has(s.id)) {
            const isPaid = Boolean(paymentMap.get(s.id));
            return {
              ...s,
              isPaid,
              paidAt: isPaid ? (s.paidAt || nowIso) : '',
            };
          }
          return s;
        });
        updatedStudentsList = next.filter(s => paymentMap.has(s.id));
        return next;
      });
    }

    setActivePaymentClass(null);
    await syncSaveClass(updatedClass);
    if (updatedStudentsList.length > 0) {
      await syncSaveBatchStudents(updatedStudentsList);
    }
  };

  const handleToggleStudentPayment = async (studentId: string) => {
    const student = students.find(s => s.id === studentId);
    if (!student) return;

    const newIsPaid = !student.isPaid;
    const nowIso = new Date().toISOString();
    const updatedStudent: Student = {
      ...student,
      isPaid: newIsPaid,
      paidAt: newIsPaid ? nowIso : '',
    };

    setStudents(prev => prev.map(s => s.id === studentId ? updatedStudent : s));
    await syncSaveStudent(updatedStudent);

    // Also update class's paidAmount accordingly and log audit entry
    const targetClass = classes.find(c => c.id === student.classId);
    if (targetClass) {
      const isDev = targetClass.projectType === 'developer';
      const track: 'ai' | 'developer' = isDev ? 'developer' : 'ai';
      const price = isDev ? 7000 : (targetClass.pricePerStudent || 5000);
      const classStudents = students.map(s => s.id === studentId ? updatedStudent : s).filter(s => s.classId === targetClass.id);
      const paidCount = classStudents.filter(s => s.isPaid).length;
      const previousAmount = isDev
        ? (targetClass.devPaidAmount ?? (targetClass.id.startsWith('class-dev-') ? (targetClass.paidAmount || 0) : 0))
        : (targetClass.aiPaidAmount ?? targetClass.paidAmount ?? 0);
      const newAmount = paidCount * price;
      const existingHistory = Array.isArray(targetClass.paymentHistory) ? targetClass.paymentHistory : [];
      const logEntry: PaymentHistoryEntry = {
        id: `pay-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        date: nowIso,
        track,
        previousAmount,
        newAmount,
        delta: newAmount - previousAmount,
        method: targetClass.paymentMethod || 'naqd',
        note: `${student.fullName}: ${newIsPaid ? "to'landi deb belgilandi" : "to'lov bekor qilindi"}`,
        paidStudentCount: paidCount,
        unverified: Boolean(targetClass.paymentUnverified),
      };
      const updatedClass: ClassGroup = {
        ...targetClass,
        paidAmount: newAmount,
        ...(isDev ? { devPaidAmount: newAmount } : { aiPaidAmount: newAmount }),
        lastPaymentAt: nowIso,
        paymentHistory: [logEntry, ...existingHistory].slice(0, 50),
      };
      setClasses(prev => prev.map(c => c.id === targetClass.id ? updatedClass : c));
      await syncSaveClass(updatedClass);
    }
  };

  const handleApplyEmailDistribution = async (distributedStudents: Student[], updatedPool: EmailAccount[]) => {
    setStudents(distributedStudents);
    setEmailPool(updatedPool);
    setIsBulkEmailOpen(false);
    await syncSaveBatchStudents(distributedStudents);
    await syncSaveEmailPool(updatedPool);
  };

  const handleAddGeneratedEmails = async (newEmails: EmailAccount[]) => {
    const updated = [...emailPool, ...newEmails];
    setEmailPool(updated);
    await syncSaveEmailPool(updated);
  };

  const handleSaveClassAndStudents = async (
    targetClass: ClassGroup,
    newStudents: Student[],
    updatedEmailPool: EmailAccount[]
  ) => {
    setClasses(prev => {
      const exists = prev.some(c => c.id === targetClass.id);
      if (exists) {
        return prev.map(c => c.id === targetClass.id ? targetClass : c);
      }
      return [...prev, targetClass];
    });

    setStudents(prev => [...prev, ...newStudents]);
    setEmailPool(updatedEmailPool);

    await syncSaveClass(targetClass);
    await syncSaveBatchStudents(newStudents);
    await syncSaveEmailPool(updatedEmailPool);
  };

  // Live Session Presence, Activity Ring Buffer & Cross-Browser Hardware Blocking
  const sessionEnteredAtRef = useRef<string>(new Date().toISOString());
  const sessionRecentActionsRef = useRef<SessionActionLog[]>([]);
  const childActivityReportedRef = useRef<boolean>(false);
  const liveContextRef = useRef<{
    teacherName: string;
    className: string;
    classId: string;
    currentAction: string;
    currentRole: 'teacher' | 'admin';
  }>({
    teacherName: '',
    className: '',
    classId: '',
    currentAction: 'Saytga kirdi',
    currentRole: currentView === 'admin' ? 'admin' : 'teacher',
  });

  const pushActivityLog = useCallback((actionText: string) => {
    const nowIso = new Date().toISOString();
    const list = sessionRecentActionsRef.current;
    const last = list[0];
    if (last && last.action === actionText) {
      const diff = Date.now() - new Date(last.time).getTime();
      if (diff < 8000) return list;
    }
    const next = [{ time: nowIso, action: actionText }, ...list].slice(0, 8);
    sessionRecentActionsRef.current = next;
    return next;
  }, []);

  const reportSessionActivity = useCallback((info: {
    action: string;
    teacherName?: string;
    className?: string;
    classId?: string;
    role?: 'teacher' | 'admin';
  }) => {
    const nowIso = new Date().toISOString();
    if (typeof info.teacherName === 'string') liveContextRef.current.teacherName = info.teacherName;
    if (typeof info.className === 'string') liveContextRef.current.className = info.className;
    if (typeof info.classId === 'string') liveContextRef.current.classId = info.classId;
    if (info.role) liveContextRef.current.currentRole = info.role;
    liveContextRef.current.currentAction = info.action;

    const actions = pushActivityLog(info.action);
    syncUpdateDeviceActivity(
      {
        deviceId: currentDevice.deviceId,
        hardwareId: currentDevice.hardwareId,
        deviceName: currentDevice.deviceName,
        browser: currentDevice.browser,
        os: currentDevice.os,
        screen: currentDevice.screen,
        cpuCores: currentDevice.cpuCores,
        gpuRenderer: currentDevice.gpuRenderer,
        teacherName: liveContextRef.current.teacherName,
        className: liveContextRef.current.className,
        classId: liveContextRef.current.classId,
        currentRole: liveContextRef.current.currentRole,
        currentAction: info.action,
        recentActions: actions,
        enteredAt: sessionEnteredAtRef.current,
        isOnline: true,
        lastActiveAt: nowIso,
      },
      {
        onBlockedDetected: (blockedSess) => {
          directBlockedRef.current = blockedSess;
          setDirectBlockedSession(blockedSess);
        },
      }
    ).catch(() => {});
  }, [currentDevice, pushActivityLog]);

  // Global presence heartbeat (12s while visible) + instant leave tracking on hide/close
  useEffect(() => {
    const sessionRole: 'teacher' | 'admin' = currentView === 'admin' ? 'admin' : 'teacher';
    liveContextRef.current.currentRole = sessionRole;
    if (!childActivityReportedRef.current) {
      reportSessionActivity({
        action:
          currentView === 'admin'
            ? 'Admin panelini ochdi'
            : currentView === 'landing'
            ? "Bosh sahifani ko'rmoqda"
            : 'Portalga kirdi',
        role: sessionRole,
      });
    }
    childActivityReportedRef.current = false;

    const heartbeat = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        syncUpdateDeviceActivity(
          {
            deviceId: currentDevice.deviceId,
            hardwareId: currentDevice.hardwareId,
            deviceName: currentDevice.deviceName,
            browser: currentDevice.browser,
            os: currentDevice.os,
            screen: currentDevice.screen,
            cpuCores: currentDevice.cpuCores,
            gpuRenderer: currentDevice.gpuRenderer,
            teacherName: liveContextRef.current.teacherName,
            className: liveContextRef.current.className,
            classId: liveContextRef.current.classId,
            currentRole: liveContextRef.current.currentRole,
            currentAction: liveContextRef.current.currentAction,
            recentActions: sessionRecentActionsRef.current,
            enteredAt: sessionEnteredAtRef.current,
            isOnline: true,
            lastActiveAt: new Date().toISOString(),
          },
          {
            onBlockedDetected: (blockedSess) => {
              directBlockedRef.current = blockedSess;
              setDirectBlockedSession(blockedSess);
            },
          }
        ).catch(() => {});
      }
    }, 12000);

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        const nowIso = new Date().toISOString();
        const actions = pushActivityLog('Sahifani yopdi / orqaga o‘tdi');
        syncUpdateDeviceActivity({
          deviceId: currentDevice.deviceId,
          isOnline: false,
          leftAt: nowIso,
          lastActiveAt: nowIso,
          currentAction: 'Sahifadan chiqdi',
          recentActions: actions,
        }).catch(() => {});
      } else if (document.visibilityState === 'visible') {
        const nowIso = new Date().toISOString();
        const actions = pushActivityLog('Saytga qaytdi');
        syncUpdateDeviceActivity({
          deviceId: currentDevice.deviceId,
          isOnline: true,
          lastActiveAt: nowIso,
          currentAction: liveContextRef.current.currentAction || 'Saytda faol',
          recentActions: actions,
        }).catch(() => {});
      }
    };

    const handlePageLeave = () => {
      sendSessionLeaveKeepalive(currentDevice.deviceId, 'Sahifani yopdi');
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pagehide', handlePageLeave);
    window.addEventListener('beforeunload', handlePageLeave);

    return () => {
      clearInterval(heartbeat);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pagehide', handlePageLeave);
      window.removeEventListener('beforeunload', handlePageLeave);
    };
  }, [currentDevice, currentView, pushActivityLog, reportSessionActivity]);

  // Sessions and Device Management Handlers
  const handleRegisterSession = async (session: Partial<TeacherSession> & { deviceId: string }) => {
    if (!session.deviceId) return;
    const directBlocked = directBlockedRef.current?.deviceId === session.deviceId ? directBlockedRef.current : null;
    const hwBlocked = blockedSessionsRef.current.find(
      s => s.isBlocked && s.blockHardware !== false && s.hardwareId && s.hardwareId === (session.hardwareId || currentDevice.hardwareId)
    );
    const nowIso = new Date().toISOString();
    liveContextRef.current.teacherName = session.teacherName || liveContextRef.current.teacherName;
    liveContextRef.current.className = session.className || liveContextRef.current.className;
    liveContextRef.current.classId = session.classId || liveContextRef.current.classId;
    if (session.currentAction) {
      liveContextRef.current.currentAction = session.currentAction;
      pushActivityLog(session.currentAction);
    }

    const effectiveBlocked = directBlocked || hwBlocked;
    const sessionToSave: TeacherSession = {
      id: session.id || session.deviceId,
      deviceId: session.deviceId,
      hardwareId: session.hardwareId || currentDevice.hardwareId,
      teacherName: session.teacherName || '',
      className: session.className || '',
      classId: session.classId || '',
      deviceName: session.deviceName || currentDevice.deviceName,
      browser: session.browser || currentDevice.browser,
      os: session.os || currentDevice.os,
      screen: session.screen || currentDevice.screen,
      cpuCores: session.cpuCores ?? currentDevice.cpuCores,
      gpuRenderer: session.gpuRenderer || currentDevice.gpuRenderer,
      isOnline: true,
      enteredAt: sessionEnteredAtRef.current,
      lastActiveAt: session.lastActiveAt || nowIso,
      createdAt: session.createdAt || nowIso,
      currentAction: session.currentAction || 'Saytda faol',
      currentRole: session.currentRole || 'teacher',
      recentActions: sessionRecentActionsRef.current,
      isBlocked: Boolean(effectiveBlocked?.isBlocked || session.isBlocked),
      ...(effectiveBlocked?.blockedReason
        ? { blockedReason: effectiveBlocked.blockedReason, blockHardware: effectiveBlocked.blockHardware ?? true }
        : session.blockedReason
        ? { blockedReason: session.blockedReason }
        : {}),
    };

    try {
      await syncSaveSession(sessionToSave, {
        onBlockedDetected: (blockedSess) => {
          directBlockedRef.current = blockedSess;
          setDirectBlockedSession(blockedSess);
        },
      });
    } catch (e) {
      console.warn('Session sync error:', e);
    }
  };

  // Cross-browser hardware-aware block & unblock
  const handleToggleBlockDevice = async (
    deviceId: string,
    isBlocked: boolean,
    reason?: string,
    matchingDeviceIds?: string[]
  ) => {
    const idsToUpdate =
      matchingDeviceIds && matchingDeviceIds.length > 0
        ? Array.from(new Set(matchingDeviceIds))
        : [deviceId];

    await Promise.all(idsToUpdate.map(id => syncSetDeviceBlockStatus(id, isBlocked, reason)));
  };

  const handleDeleteSession = async (sessionId: string) => {
    await syncDeleteSession(sessionId);
  };

  const handleUnlockExternalTeacher = async (deviceId: string) => {
    try {
      await syncUpdateDeviceActivity({
        deviceId,
        allowClassChangeOnce: true,
      });
    } catch {}
    // Also save device-specific unlock flag in localStorage
    try {
      localStorage.setItem(`unlock_external_device_${deviceId}`, 'true');
    } catch {}
  };

  // Teacher Messages Handlers
  const handleSendMessage = async (msg: TeacherMessage) => {
    setMessages(prev => [...prev, msg]);
    await syncSendTeacherMessage(msg);
  };

  const handleMarkMessageAsRead = async (msgId: string, deviceName?: string) => {
    const now = new Date().toISOString();
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, isRead: true, readAt: now, readDeviceName: deviceName } : m));
    await syncMarkMessageAsRead(msgId, deviceName);
  };

  const handleDeleteTeacherMessage = async (msgId: string) => {
    setMessages(prev => prev.filter(m => m.id !== msgId));
    await syncDeleteTeacherMessage(msgId);
  };

  // Teacher certificates handlers with Firestore synchronization
  const handleAddTeacher = async (teacher: TeacherCertificate) => {
    setTeacherCertificates(prev => [teacher, ...prev]);
    await syncSaveTeacherCertificate(teacher);
  };

  const handleAddBatchTeachers = async (newTeachers: TeacherCertificate[]) => {
    setTeacherCertificates(prev => [...newTeachers, ...prev]);
    await syncSaveBatchTeacherCertificates(newTeachers);
  };

  const handleUpdateTeacher = async (updated: TeacherCertificate) => {
    setTeacherCertificates(prev => prev.map(t => t.id === updated.id ? updated : t));
    await syncSaveTeacherCertificate(updated);
  };

  const handleDeleteTeacher = async (teacherId: string) => {
    setTeacherCertificates(prev => prev.filter(t => t.id !== teacherId));
    await syncDeleteTeacherCertificate(teacherId);
  };

  const handleDeleteBatchTeachers = async (teacherIds: string[]) => {
    setTeacherCertificates(prev => prev.filter(t => !teacherIds.includes(t.id)));
    await syncDeleteBatchTeacherCertificates(teacherIds);
  };

  const handleAssignTeacherEmail = async (teacherId: string) => {
    const availableEmail = emailPool.find(e => !e.isUsed);
    if (!availableEmail) {
      showAppToast("Zaxirada bo'sh email mavjud emas! Avval Email Zaxirasiga yangi pochtalar qo'shing.", 'error');
      return;
    }
    const updatedEmail: EmailAccount = {
      ...availableEmail,
      isUsed: true,
      assignedToStudentId: teacherId,
    };
    setEmailPool(prev => prev.map(e => e.email === updatedEmail.email ? updatedEmail : e));
    await syncSaveSingleEmail(updatedEmail);

    let updatedTeacherObj: TeacherCertificate | null = null;
    setTeacherCertificates(prev =>
      prev.map(t => {
        if (t.id === teacherId) {
          updatedTeacherObj = {
            ...t,
            assignedEmail: updatedEmail.email,
            assignedPassword: updatedEmail.password || 'Coursera2026!',
          };
          return updatedTeacherObj;
        }
        return t;
      })
    );

    if (updatedTeacherObj) {
      await syncSaveTeacherCertificate(updatedTeacherObj);
    }
    showAppToast(`Email biriktirildi va saqlandi: ${updatedEmail.email}`, 'success');
  };

  const handleAssignBatchTeacherEmails = async (teacherIds: string[]) => {
    const availableEmails = emailPool.filter(e => !e.isUsed);
    if (availableEmails.length === 0) {
      showAppToast("Zaxirada bo'sh email mavjud emas! Avval Email Zaxirasiga pochtalar qo'shing.", 'error');
      return;
    }

    const assignedCount = Math.min(teacherIds.length, availableEmails.length);
    const emailsToUpdate: EmailAccount[] = [];
    const teachersToUpdate: TeacherCertificate[] = [];

    const updatedTeacherMap = new Map<string, { email: string; pass: string }>();

    for (let i = 0; i < assignedCount; i++) {
      const tId = teacherIds[i];
      const mail = availableEmails[i];
      const upMail: EmailAccount = {
        ...mail,
        isUsed: true,
        assignedToStudentId: tId,
      };
      emailsToUpdate.push(upMail);
      updatedTeacherMap.set(tId, {
        email: upMail.email,
        pass: upMail.password || 'Coursera2026!'
      });
    }

    // Update email pool in state & Firestore
    const updatedPool = emailPool.map(e => {
      const match = emailsToUpdate.find(u => u.email === e.email);
      return match || e;
    });
    setEmailPool(updatedPool);
    await syncSaveEmailPool(emailsToUpdate);

    // Update teachers in state & Firestore
    setTeacherCertificates(prev => {
      const nextList = prev.map(t => {
        const match = updatedTeacherMap.get(t.id);
        if (match) {
          const upTeacher: TeacherCertificate = {
            ...t,
            assignedEmail: match.email,
            assignedPassword: match.pass,
          };
          teachersToUpdate.push(upTeacher);
          return upTeacher;
        }
        return t;
      });
      return nextList;
    });

    if (teachersToUpdate.length > 0) {
      await syncSaveBatchTeacherCertificates(teachersToUpdate);
    }

    showAppToast(`✅ ${teachersToUpdate.length} nafar ustozga avtomatik email biriktirildi va saqlandi!`, 'success');
  };

  const handleRequestClearAllData = () => {
    setIsConfirmClearOpen(true);
  };

  const executeClearAllData = () => {
    setClasses([]);
    setStudents([]);
    setTeacherCertificates([]);
    localStorage.removeItem(STORAGE_CLASSES_KEY);
    localStorage.removeItem(STORAGE_STUDENTS_KEY);
    localStorage.removeItem(STORAGE_TEACHERS_KEY);
  };

  // Global Real-Time Block Enforcement (across ALL browsers on same hardware & without page refresh)
  const activeBlockedSession = useMemo(() => {
    if (directBlockedSession?.isBlocked) return directBlockedSession;
    return blockedSessions.find(
      s =>
        s.isBlocked &&
        (s.deviceId === currentDevice.deviceId ||
          (s.blockHardware !== false && s.hardwareId && s.hardwareId === currentDevice.hardwareId))
    ) || null;
  }, [directBlockedSession, blockedSessions, currentDevice.deviceId, currentDevice.hardwareId]);

  if (activeBlockedSession && !(currentView === 'admin' && isAdminAuthenticated)) {
    return (
      <BlockedAccessOverlay
        session={activeBlockedSession}
        onRefresh={() => window.location.reload()}
      />
    );
  }

  return (
    <div className="min-h-screen apple-canvas text-slate-900 flex flex-col font-sans selection:bg-blue-600 selection:text-white relative">
      {/* Ultra Kosmik 3D WebGL2 Grafika Engine (NEVER mounted on Landing Page) */}
      {currentView !== 'landing' && graphicsTier === 'ultra' && (
        <Suspense fallback={null}>
          <UltraWorldOverlay active />
        </Suspense>
      )}

      {/* Yuqori Fizik Okean Grafika Engine (NEVER mounted on Landing Page) */}
      {currentView !== 'landing' && graphicsTier === 'high' && (
        <Suspense fallback={null}>
          <OceanPhysicsOverlay active />
        </Suspense>
      )}

      {currentView === 'landing' ? (
        <LandingPagePro
          classes={classes}
          students={students}
          teacherCertificates={teacherCertificates}
          onEnterPortal={handleEnterPortal}
          onOpenAdminLogin={handleOpenAdminLogin}
        />
      ) : (
        <>
          {/* Admin Mode Sleek Top Bar */}
          {currentView === 'admin' && (
            <div className="bg-slate-900/90 backdrop-blur-xl text-slate-200 px-4 py-2 text-xs font-medium flex items-center justify-between shadow-xs border-b border-white/10 relative z-20">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span className="text-slate-200 font-semibold">Administrator Boshqaruv Rejimi</span>
                <span className="hidden sm:inline text-slate-400 text-[11px]">• Tizim boshqaruvi, faol seanslar va sertifikatlar monitoringi</span>
              </div>
              <button
                onClick={() => {
                  setCurrentView('teacher');
                  window.location.hash = '#portal';
                }}
                className="px-3 py-1 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer border border-white/10"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>O'qituvchilar portaliga qaytish</span>
              </button>
            </div>
          )}

          {/* Apple Pro Frosted Glass Header */}
          <header className="sticky top-0 z-40 apple-glass border-b border-white/60 backdrop-blur-2xl">
            <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-2">
              
              {/* Logo & School Platform Name (Click returns to Landing Page) */}
              <button
                type="button"
                onClick={handleReturnToLanding}
                className="flex items-center gap-3.5 min-w-0 text-left cursor-pointer group"
                title="Bosh sahifaga qaytish"
              >
                <div className="w-10 h-10 rounded-xl apple-btn-blue flex items-center justify-center font-black text-white text-base shadow-md shadow-blue-500/25 flex-shrink-0 animate-bounce-subtle">
                  <GraduationCap className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-slate-900 group-hover:text-blue-700 transition-colors text-base sm:text-lg tracking-tight truncate">
                      Bir Million O'zbek Dasturchilari
                    </span>
                    <span className="hidden sm:inline-flex items-center text-[11px] font-semibold text-blue-700 bg-blue-50/80 px-2.5 py-0.5 rounded-md border border-blue-200/60 flex-shrink-0">
                      Coursera Ta'lim Portali
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 truncate">
                    Sinf rahbarlari va sertifikatlashtirish monitoring tizimi
                  </p>
                </div>
              </button>

              {/* Right controls: Home button + Graphics selector + School Year */}
              <div className="flex items-center gap-2.5 flex-shrink-0">
                <button
                  type="button"
                  onClick={handleReturnToLanding}
                  className="px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white/90 hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="Bosh sahifaga qaytish"
                >
                  <Home className="w-3.5 h-3.5 text-blue-600" />
                  <span className="hidden sm:inline">Bosh sahifa</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsGraphicsSettingsOpen(true)}
                  className={`px-2.5 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                    graphicsTier === 'ultra'
                      ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                      : graphicsTier === 'high'
                      ? 'bg-sky-600 text-white border-sky-600 shadow-xs'
                      : graphicsTier === 'lite'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                      : 'bg-white/90 text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                  title="Grafika va animatsiya rejimini tanlash"
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">
                    {graphicsTier === 'ultra'
                      ? 'Ultra'
                      : graphicsTier === 'high'
                      ? 'Yuqori'
                      : graphicsTier === 'lite'
                      ? 'Yengil'
                      : "O'rtacha"}
                  </span>
                </button>

                <div className="text-right hidden md:block">
                  <span className="text-xs font-bold text-slate-800 block">
                    2025–2026 o'quv yili
                  </span>
                  <span className="text-[11px] text-emerald-700 font-semibold flex items-center justify-end gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-xs shadow-emerald-400 animate-pulse"></span>
                    <span>Tizim faol</span>
                  </span>
                </div>
              </div>

            </div>
          </header>

          {/* Main Content Area */}
          <main className="flex-1 max-w-5xl w-full mx-auto px-3 sm:px-6 py-6 relative z-10">
            {currentView === 'teacher' ? (
              <TeacherPortal
                classes={classes}
                students={students}
                messages={messages}
                onRegisterSession={handleRegisterSession}
                onMarkMessageAsRead={handleMarkMessageAsRead}
                onOpenStudentModal={(student) => setActiveStudentModal(student)}
                onToggleStudentPayment={handleToggleStudentPayment}
                onSaveStudent={handleSaveStudent}
                onSaveUpdatedStudents={handleSaveBatchStudents}
                initialProjectTrack={portalLaunchTarget?.track}
                initialClassId={portalLaunchTarget?.classId}
                onConsumeInitialSelection={() => setPortalLaunchTarget(null)}
                onSessionActivity={(info) => {
                  childActivityReportedRef.current = true;
                  reportSessionActivity({ ...info, role: 'teacher' });
                }}
              />
            ) : (
              <div className="animate-fade-in">
                <AdminPanel
                  classes={classes}
                  students={students}
                  emailPool={emailPool}
                  messages={messages}
                  telegramUsers={telegramUsers}
                  teacherCertificates={teacherCertificates}
                  currentDeviceId={currentDevice.deviceId}
                  onRefreshTelegramUsers={fetchTelegramStatus}
                  onOpenStudentModal={(student) => setActiveStudentModal(student)}
                  onOpenPaymentModal={(classGroup) => setActivePaymentClass(classGroup)}
                  onToggleStudentPayment={handleToggleStudentPayment}
                  onOpenBulkEmailModal={() => setIsBulkEmailOpen(true)}
                  onApplyEmailDistribution={handleApplyEmailDistribution}
                  onOpenBulkUploadModal={(classId) => {
                    setBulkUploadInitialClassId(classId);
                    setIsBulkUploadOpen(true);
                  }}
                  onOpenTeacherMessageModal={(classGroup) => setActiveMessageClass(classGroup)}
                  onToggleBlockDevice={handleToggleBlockDevice}
                  onDeleteSession={handleDeleteSession}
                  onAddSingleStudent={handleAddSingleStudent}
                  onDeleteStudent={handleDeleteStudent}
                  onSaveClass={handleSaveClass}
                  onDeleteClass={handleDeleteClass}
                  onLogoutAdmin={handleAdminLogout}
                  onAddTeacher={handleAddTeacher}
                  onAddBatchTeachers={handleAddBatchTeachers}
                  onUpdateTeacher={handleUpdateTeacher}
                  onDeleteTeacher={handleDeleteTeacher}
                  onDeleteBatchTeachers={handleDeleteBatchTeachers}
                  onAssignTeacherEmail={handleAssignTeacherEmail}
                  onAssignBatchTeacherEmails={handleAssignBatchTeacherEmails}
                  onAddGeneratedEmails={handleAddGeneratedEmails}
                  onSaveStudent={handleSaveStudent}
                  onSaveBatchStudents={handleSaveBatchStudents}
                  onSaveClassAndStudents={handleSaveClassAndStudents}
                  onUnlockExternalTeacher={handleUnlockExternalTeacher}
                  auditTargetClass={auditTargetClass}
                  onClearAuditTarget={() => setAuditTargetClass(null)}
                  graphicsTier={graphicsTier}
                  onOpenGraphicsSettings={() => setIsGraphicsSettingsOpen(true)}
                  onSessionActivity={(info) => {
                    childActivityReportedRef.current = true;
                    reportSessionActivity({ ...info, role: 'admin' });
                  }}
                />
              </div>
            )}
          </main>

          {/* Apple Pro Glass Footer */}
          <footer className="apple-glass border-t border-white/60 py-6 text-slate-600 text-xs mt-auto">
            <div className="max-w-5xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
              <div className="space-y-0.5">
                <p className="text-slate-800 font-semibold">
                  © 2026 "Bir Million O'zbek Dasturchilari" maktab ta'lim monitoringi platformasi.
                </p>
                <p className="text-xs text-slate-500">
                  Belgilangan xizmat to'lovi: 5 000 so'm / ta sertifikat
                </p>
              </div>

              <div className="flex items-center gap-4 text-xs">
                {currentView === 'admin' ? (
                  <button
                    onClick={handleRequestClearAllData}
                    className="text-slate-500 hover:text-rose-600 flex items-center gap-1.5 transition-colors cursor-pointer"
                    title="Barcha ma'lumotlarni tozalash"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Baza tozalash</span>
                  </button>
                ) : (
                  <button
                    onClick={handleOpenAdminLogin}
                    className="text-slate-600 hover:text-slate-900 flex items-center gap-1.5 transition-all cursor-pointer px-3 py-1.5 rounded-lg apple-btn-secondary"
                    title="Maktab ma'muriyati uchun"
                  >
                    <Lock className="w-3.5 h-3.5 text-blue-600" />
                    <span className="font-medium">Boshqaruv</span>
                  </button>
                )}
              </div>
            </div>
          </footer>
        </>
      )}

      {/* Modals */}
      {isConfirmClearOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-900 mb-2">Baza xotirasini tozalash</h3>
            <p className="text-xs text-slate-600 mb-5 leading-relaxed">
              Haqiqatan ham brauzerdagi barcha kesh va ma'lumotlarni tozalashni xohlaysizmi? Bu amal faqat lokal brauzer xotirasini tozalaydi.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setIsConfirmClearOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
              >
                Bekor qilish
              </button>
              <button
                onClick={() => {
                  executeClearAllData();
                  setIsConfirmClearOpen(false);
                  showAppToast("Lokal ma'lumotlar tozalandi", 'info');
                }}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 transition-colors cursor-pointer"
              >
                Ha, tozalansin
              </button>
            </div>
          </div>
        </div>
      )}

      {appToast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl shadow-lg border text-sm font-medium flex items-center gap-2 backdrop-blur-md transition-all animate-bounce-subtle ${
          appToast.type === 'error'
            ? 'bg-rose-50/95 border-rose-300 text-rose-800'
            : appToast.type === 'success'
            ? 'bg-emerald-50/95 border-emerald-300 text-emerald-800'
            : 'bg-slate-900/90 border-slate-700 text-white'
        }`}>
          <span>{appToast.message}</span>
        </div>
      )}

      {activeStudentModal && (
        <StudentModal
          student={activeStudentModal}
          classGroup={classes.find(c => c.id === activeStudentModal?.classId)}
          allStudents={students}
          classes={classes}
          isAdmin={isAdminAuthenticated}
          isOpen={true}
          onClose={() => setActiveStudentModal(null)}
          onSave={handleSaveStudent}
          onDelete={handleDeleteStudent}
        />
      )}

      {activePaymentClass && (
        <PaymentModal
          classGroup={activePaymentClass}
          students={students}
          isOpen={true}
          onClose={() => setActivePaymentClass(null)}
          onUpdatePayment={(classId, newAmount, studentPayments, paymentMeta) =>
            handleUpdatePayment(classId, newAmount, studentPayments, paymentMeta)
          }
          onOpenClassDateAudit={(cg) => {
            setActivePaymentClass(null);
            setAuditTargetClass(cg);
            setCurrentView('admin');
          }}
        />
      )}

      {isBulkEmailOpen && (
        <BulkEmailModal
          students={students}
          emailPool={emailPool}
          isOpen={true}
          onClose={() => setIsBulkEmailOpen(false)}
          onApplyDistribution={handleApplyEmailDistribution}
        />
      )}

      {isBulkUploadOpen && (
        <BulkStudentUploadModal
          classes={classes}
          students={students}
          emailPool={emailPool}
          initialClassId={bulkUploadInitialClassId}
          isOpen={true}
          onClose={() => {
            setIsBulkUploadOpen(false);
            setBulkUploadInitialClassId(undefined);
          }}
          onSaveClassAndStudents={handleSaveClassAndStudents}
        />
      )}

      {activeMessageClass && (
        <TeacherMessageModal
          isOpen={true}
          classGroup={activeMessageClass}
          messages={messages}
          telegramUsers={telegramUsers}
          onClose={() => setActiveMessageClass(null)}
          onSendMessage={handleSendMessage}
          onDeleteMessage={handleDeleteTeacherMessage}
        />
      )}

      {isAdminLoginOpen && (
        <AdminLoginModal
          isOpen={true}
          onClose={() => setIsAdminLoginOpen(false)}
          onSuccess={handleAdminLoginSuccess}
        />
      )}

      <GraphicsSettingsModal
        isOpen={isGraphicsSettingsOpen}
        currentTier={graphicsTier}
        onSelectTier={(tier) => setGraphicsTier(tier)}
        onClose={() => setIsGraphicsSettingsOpen(false)}
      />
    </div>
  );
}
