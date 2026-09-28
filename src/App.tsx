import React, { useState, useEffect } from 'react';
import { ClassGroup, Student, EmailAccount, TeacherSession, TeacherMessage, TelegramUser } from './types';
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
  syncSaveSingleEmail
} from './lib/firestoreService';
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

  // Sessions and Messages
  const [sessions, setSessions] = useState<TeacherSession[]>([]);
  const [messages, setMessages] = useState<TeacherMessage[]>([]);
  const [telegramUsers, setTelegramUsers] = useState<TelegramUser[]>([]);

  // Periodically fetch connected Telegram users from bot server
  const fetchTelegramStatus = () => {
    fetch('/api/telegram/status')
      .then((res) => res.json())
      .then((data) => {
        if (data.users && Array.isArray(data.users)) {
          setTelegramUsers(data.users);
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    fetchTelegramStatus();
    const interval = setInterval(fetchTelegramStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  // Sync classes and students to server telegram store whenever they update
  useEffect(() => {
    if (classes.length > 0 || students.length > 0) {
      fetch('/api/telegram/sync-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classes, students }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.users && Array.isArray(data.users)) {
            setTelegramUsers(data.users);
          }
        })
        .catch(() => {});
    }
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

  // Firestore real-time subscriptions
  useEffect(() => {
    const unsubClasses = subscribeToClasses((remoteClasses) => {
      if (remoteClasses && remoteClasses.length > 0) {
        setClasses(remoteClasses);
      }
    });

    const unsubStudents = subscribeToStudents((remoteStudents) => {
      if (remoteStudents && remoteStudents.length > 0) {
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

    return () => {
      unsubClasses();
      unsubStudents();
      unsubEmails();
      unsubSessions();
      unsubMessages();
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
    setStudents(prev => {
      const exists = prev.some(s => s.id === student.id);
      if (exists) {
        return prev.map(s => s.id === student.id ? student : s);
      }
      return [...prev, student];
    });
    setActiveStudentModal(null);
    await syncSaveStudent(student);
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
    if (confirm("Haqiqatan ham ushbu o'quvchini ro'yxatdan o'chirmoqchimisiz?")) {
      setStudents(prev => prev.filter(s => s.id !== studentId));
      setActiveStudentModal(null);
      await syncDeleteStudent(studentId);
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
    if (confirm("Ushbu sinf va barcha tegishli ma'lumotlarni o'chirishni tasdiqlaysizmi?")) {
      const studentsToDelete = students.filter(s => s.classId === classId);
      setClasses(prev => prev.filter(c => c.id !== classId));
      setStudents(prev => prev.filter(s => s.classId !== classId));
      
      await syncDeleteClass(classId);
      for (const s of studentsToDelete) {
        await syncDeleteStudent(s.id);
      }
    }
  };

  const handleUpdatePayment = async (classId: string, newPaidAmount: number) => {
    const targetClass = classes.find(c => c.id === classId);
    if (!targetClass) return;

    const updated = {
      ...targetClass,
      paidAmount: newPaidAmount,
    };

    setClasses(prev => prev.map(c => c.id === classId ? updated : c));
    setActivePaymentClass(null);
    await syncSaveClass(updated);
  };

  const handleApplyEmailDistribution = async (distributedStudents: Student[], updatedPool: EmailAccount[]) => {
    setStudents(distributedStudents);
    setEmailPool(updatedPool);
    setIsBulkEmailOpen(false);
    await syncSaveBatchStudents(distributedStudents);
    await syncSaveEmailPool(updatedPool);
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
    const fullSession: TeacherSession = {
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
      blockedReason: session.blockedReason,
    };

    setSessions(prev => {
      const existing = prev.find(s => s.deviceId === session.deviceId);
      const merged: TeacherSession = {
        ...fullSession,
        isBlocked: existing ? existing.isBlocked : false,
        blockedReason: existing ? existing.blockedReason : undefined,
        createdAt: existing ? existing.createdAt : fullSession.createdAt,
      };
      const filtered = prev.filter(s => s.deviceId !== session.deviceId);
      return [merged, ...filtered];
    });
    await syncSaveSession(fullSession);
  };

  const handleToggleBlockDevice = async (deviceId: string, isBlocked: boolean, reason?: string) => {
    setSessions(prev => prev.map(s => s.deviceId === deviceId ? { ...s, isBlocked, blockedReason: reason } : s));
    await syncSetDeviceBlockStatus(deviceId, isBlocked, reason);
  };

  const handleDeleteSession = async (sessionId: string) => {
    setSessions(prev => prev.filter(s => s.id !== sessionId && s.deviceId !== sessionId));
    await syncDeleteSession(sessionId);
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

  const handleClearAllData = () => {
    if (confirm("Diqqat! Barcha sinflar va o'quvchilar ro'yxati to'liq o'chiriladi. Davom ettirasizmi?")) {
      setClasses([]);
      setStudents([]);
      localStorage.removeItem(STORAGE_CLASSES_KEY);
      localStorage.removeItem(STORAGE_STUDENTS_KEY);
      alert("Ma'lumotlar bazasi tozalandi.");
    }
  };

  return (
    <div className="min-h-screen apple-canvas text-slate-900 flex flex-col font-sans selection:bg-blue-600 selection:text-white">
      
      {/* Admin Mode Alert Banner */}
      {currentView === 'admin' && (
        <div className="bg-amber-600/95 backdrop-blur-md text-white px-4 py-2.5 text-xs font-semibold flex items-center justify-between shadow-sm border-b border-amber-500/50">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 flex-shrink-0" />
            <span>Administrator rejimi: Tizim boshqaruvi, faol seanslar va xabarnomalar</span>
          </div>
          <button
            onClick={() => {
              setCurrentView('teacher');
              window.location.hash = '';
            }}
            className="px-3 py-1 bg-slate-900/90 text-white hover:bg-slate-950 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
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
              onRefreshTelegramUsers={fetchTelegramStatus}
              onOpenStudentModal={(student) => setActiveStudentModal(student)}
              onOpenPaymentModal={(classGroup) => setActivePaymentClass(classGroup)}
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
                onClick={handleClearAllData}
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
          onUpdatePayment={(classId, newAmount) => handleUpdatePayment(classId, newAmount)}
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
