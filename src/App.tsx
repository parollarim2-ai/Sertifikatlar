import React, { useState, useEffect } from 'react';
import { ClassGroup, Student, EmailAccount, TeacherSession, TeacherMessage, TelegramUser, TeacherCertificate } from './types';
import { INITIAL_CLASSES, INITIAL_STUDENTS, INITIAL_EMAIL_POOL } from './data/mockData';
import { TeacherPortal } from './components/TeacherPortal';
import { AdminPanel } from './components/AdminPanel';
import { StudentModal } from './components/StudentModal';
import { PaymentModal } from './components/PaymentModal';
import { BulkEmailModal } from './components/BulkEmailModal';
import { BulkStudentUploadModal } from './components/BulkStudentUploadModal';
import { AdminLoginModal } from './components/AdminLoginModal';
import { TeacherMessageModal } from './components/TeacherMessageModal';
import { 
  subscribeToClasses,
  subscribeToStudents,
  subscribeToEmailPool,
  subscribeToSessions,
  subscribeToTeacherMessages,
  syncSaveClass,
  syncDeleteClass,
  syncSaveStudent,
  syncSaveBatchStudents,
  syncDeleteStudent,
  syncSaveEmailPool,
  syncSaveSession,
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
} from './lib/firestoreService';
import { recordCertifyEvent } from './utils/operatorSpeedTracker';
import { 
  ShieldCheck, 
  Lock, 
  Trash2, 
  ArrowLeft,
  GraduationCap
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
    try {
      localStorage.setItem(STORAGE_TEACHERS_KEY, JSON.stringify(teacherCertificates));
    } catch {}
  }, [teacherCertificates]);

  // Sessions and Messages
  const [sessions, setSessions] = useState<TeacherSession[]>([]);
  const [messages, setMessages] = useState<TeacherMessage[]>([]);
  const [telegramUsers, setTelegramUsers] = useState<TelegramUser[]>([]);

  // Periodically fetch connected Telegram users from bot server without unnecessary re-renders
  const fetchTelegramStatus = () => {
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
  };

  useEffect(() => {
    fetchTelegramStatus();
    const interval = setInterval(fetchTelegramStatus, 15000);
    return () => clearInterval(interval);
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

  // Active view: Teachers always land on 'teacher' portal by default!
  const [currentView, setCurrentView] = useState<'teacher' | 'admin'>(() => {
    if (typeof window !== 'undefined') {
      if (window.location.hash.includes('admin') || window.location.search.includes('admin')) {
        return 'admin';
      }
    }
    return 'teacher';
  });

  // Modals state
  const [activeStudentModal, setActiveStudentModal] = useState<Student | null>(null);
  const [activePaymentClass, setActivePaymentClass] = useState<ClassGroup | null>(null);
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

  // Check URL hash for admin
  useEffect(() => {
    const handleHashChange = () => {
      if (window.location.hash.includes('admin')) {
        if (isAdminAuthenticated) {
          setCurrentView('admin');
        } else {
          setIsAdminLoginOpen(true);
        }
      } else {
        setCurrentView('teacher');
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

    const unsubSessions = subscribeToSessions((remoteSessions) => {
      if (remoteSessions) {
        setSessions(remoteSessions);
      }
    });

    const unsubMessages = subscribeToTeacherMessages((remoteMessages) => {
      if (remoteMessages) {
        setMessages(remoteMessages);
      }
    });

    const unsubTeacherCerts = subscribeToTeacherCertificates((remoteTeachers) => {
      if (remoteTeachers) {
        setTeacherCertificates(remoteTeachers);
      }
    });

    return () => {
      unsubClasses();
      unsubStudents();
      unsubEmails();
      unsubSessions();
      unsubMessages();
      unsubTeacherCerts();
    };
  }, []);

  // Save changes to localStorage as backup
  useEffect(() => {
    localStorage.setItem(STORAGE_CLASSES_KEY, JSON.stringify(classes));
  }, [classes]);

  useEffect(() => {
    localStorage.setItem(STORAGE_STUDENTS_KEY, JSON.stringify(students));
  }, [students]);

  useEffect(() => {
    localStorage.setItem(STORAGE_EMAILS_KEY, JSON.stringify(emailPool));
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
    window.location.hash = '';
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
    updatedStudentPayments?: { studentId: string; isPaid: boolean }[]
  ) => {
    const targetClass = classes.find(c => c.id === classId);
    if (!targetClass) return;

    const updatedClass = {
      ...targetClass,
      paidAmount: newPaidAmount,
    };

    setClasses(prev => prev.map(c => c.id === classId ? updatedClass : c));

    let updatedStudentsList: Student[] = [];
    if (updatedStudentPayments && updatedStudentPayments.length > 0) {
      const paymentMap = new Map(updatedStudentPayments.map(p => [p.studentId, p.isPaid]));
      const nowIso = new Date().toISOString();
      
      setStudents(prev => {
        const next = prev.map(s => {
          if (paymentMap.has(s.id)) {
            const isPaid = Boolean(paymentMap.get(s.id));
            return {
              ...s,
              isPaid,
              paidAt: isPaid ? (s.paidAt || nowIso) : undefined,
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
      paidAt: newIsPaid ? nowIso : undefined,
    };

    setStudents(prev => prev.map(s => s.id === studentId ? updatedStudent : s));
    await syncSaveStudent(updatedStudent);

    // Also update class's paidAmount accordingly
    const targetClass = classes.find(c => c.id === student.classId);
    if (targetClass) {
      const price = targetClass.pricePerStudent || 5000;
      const classStudents = students.map(s => s.id === studentId ? updatedStudent : s).filter(s => s.classId === targetClass.id);
      const paidCount = classStudents.filter(s => s.isPaid).length;
      const updatedClass = {
        ...targetClass,
        paidAmount: paidCount * price,
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

  // Sessions and Device Management Handlers
  const handleRegisterSession = async (session: Partial<TeacherSession> & { deviceId: string }) => {
    let sessionToSave: TeacherSession = {
      id: session.id || session.deviceId,
      deviceId: session.deviceId,
      teacherName: session.teacherName || '',
      className: session.className || '',
      classId: session.classId || '',
      deviceName: session.deviceName || '',
      browser: session.browser || '',
      os: session.os || '',
      screen: session.screen || '',
      lastActiveAt: session.lastActiveAt || new Date().toISOString(),
      createdAt: session.createdAt || new Date().toISOString(),
      isBlocked: session.isBlocked || false,
      ...(session.blockedReason ? { blockedReason: session.blockedReason } : {}),
    };

    setSessions(prev => {
      const existing = prev.find(s => s.deviceId === session.deviceId);
      const merged: TeacherSession = {
        ...sessionToSave,
        isBlocked: existing ? existing.isBlocked : (session.isBlocked || false),
        ...(existing?.blockedReason
          ? { blockedReason: existing.blockedReason }
          : session.blockedReason
          ? { blockedReason: session.blockedReason }
          : {}),
        createdAt: existing ? existing.createdAt : sessionToSave.createdAt,
      };
      sessionToSave = merged;
      const filtered = prev.filter(s => s.deviceId !== session.deviceId);
      return [merged, ...filtered];
    });
    await syncSaveSession(sessionToSave);
  };

  const handleToggleBlockDevice = async (deviceId: string, isBlocked: boolean, reason?: string) => {
    setSessions(prev => prev.map(s => s.deviceId === deviceId ? { ...s, isBlocked, blockedReason: reason } : s));
    await syncSetDeviceBlockStatus(deviceId, isBlocked, reason);
  };

  const handleDeleteSession = async (sessionId: string) => {
    setSessions(prev => prev.filter(s => s.id !== sessionId && s.deviceId !== sessionId));
    await syncDeleteSession(sessionId);
  };

  const handleUnlockExternalTeacher = async (deviceId: string) => {
    setSessions(prev => prev.map(s => {
      if (s.deviceId === deviceId) {
        return {
          ...s,
          allowClassChangeOnce: true,
        };
      }
      return s;
    }));
    const targetSession = sessions.find(s => s.deviceId === deviceId);
    if (targetSession) {
      const updated = { ...targetSession, allowClassChangeOnce: true };
      await syncSaveSession(updated);
    }
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

  const handleAssignTeacherEmail = (teacherId: string) => {
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
    syncSaveSingleEmail(updatedEmail);

    setTeacherCertificates(prev =>
      prev.map(t =>
        t.id === teacherId
          ? {
              ...t,
              assignedEmail: updatedEmail.email,
              assignedPassword: updatedEmail.password || 'Coursera2026!',
            }
          : t
      )
    );
    showAppToast(`Email biriktirildi: ${updatedEmail.email}`, 'success');
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

  return (
    <div className="min-h-screen apple-canvas text-slate-900 flex flex-col font-sans selection:bg-blue-600 selection:text-white">
      
      {/* Admin Mode Sleek Top Bar (Frosted Dark Glass - Yellow replaced with Apple Pro style) */}
      {currentView === 'admin' && (
        <div className="bg-slate-900/90 backdrop-blur-xl text-slate-200 px-4 py-2 text-xs font-medium flex items-center justify-between shadow-xs border-b border-white/10">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span className="text-slate-200 font-semibold">Administrator Boshqaruv Rejimi</span>
            <span className="hidden sm:inline text-slate-400 text-[11px]">• Tizim boshqaruvi, faol seanslar va sertifikatlar monitoringi</span>
          </div>
          <button
            onClick={() => {
              setCurrentView('teacher');
              window.location.hash = '';
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
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          
          {/* Logo & School Platform Name */}
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl apple-btn-blue flex items-center justify-center font-black text-white text-base shadow-md shadow-blue-500/25 flex-shrink-0 animate-bounce-subtle">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-slate-900 text-base sm:text-lg tracking-tight">
                  Bir Million O'zbek Dasturchilari
                </span>
                <span className="hidden sm:inline-flex items-center text-[11px] font-semibold text-blue-700 bg-blue-50/80 px-2.5 py-0.5 rounded-md border border-blue-200/60">
                  Coursera Ta'lim Portali
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Sinf rahbarlari va sertifikatlashtirish monitoring tizimi
              </p>
            </div>
          </div>

          {/* Right badge: School Year */}
          <div className="text-right">
            <span className="text-xs font-bold text-slate-800 block">
              2025–2026 o'quv yili
            </span>
            <span className="text-[11px] text-emerald-700 font-semibold flex items-center justify-end gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-xs shadow-emerald-400 animate-pulse"></span>
              <span>Tizim faol</span>
            </span>
          </div>

        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-3 sm:px-6 py-6">
        {currentView === 'teacher' ? (
          <TeacherPortal
            classes={classes}
            students={students}
            sessions={sessions}
            messages={messages}
            onRegisterSession={handleRegisterSession}
            onMarkMessageAsRead={handleMarkMessageAsRead}
            onOpenStudentModal={(student) => setActiveStudentModal(student)}
            onToggleStudentPayment={handleToggleStudentPayment}
            onSaveStudent={handleSaveStudent}
          />
        ) : (
          <div className="animate-fade-in">
            <AdminPanel
              classes={classes}
              students={students}
              emailPool={emailPool}
              sessions={sessions}
              messages={messages}
              telegramUsers={telegramUsers}
              teacherCertificates={teacherCertificates}
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
              onAssignTeacherEmail={handleAssignTeacherEmail}
              onAddGeneratedEmails={handleAddGeneratedEmails}
              onSaveStudent={handleSaveStudent}
              onSaveClassAndStudents={handleSaveClassAndStudents}
              onUnlockExternalTeacher={handleUnlockExternalTeacher}
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
          onUpdatePayment={(classId, newAmount, studentPayments) => handleUpdatePayment(classId, newAmount, studentPayments)}
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
    </div>
  );
}
