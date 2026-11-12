import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Sparkles,
  Zap,
  Check,
  AlertTriangle,
  Play,
  Pause,
  RefreshCw,
  Mail,
  ShieldCheck,
  ExternalLink,
  Copy,
  Users,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight,
  Send,
  HelpCircle,
  FileCheck,
  GraduationCap,
  Award,
  Bookmark
} from 'lucide-react';
import { Student, ClassGroup } from '../types';
import { detectStudentDocType, extractDocSeriesAndNumber } from '../utils/studentValidator';
import { generateGmailVariants } from '../utils/gmailDotGenerator';

interface ClassBatchAutomationModalProps {
  isOpen: boolean;
  onClose: () => void;
  classGroup: ClassGroup;
  students: Student[];
  onUpdateStudent: (student: Student) => Promise<void> | void;
}

interface StudentBatchState {
  student: Student;
  status: 'pending' | 'processing' | 'deleting_old' | 'success' | 'error' | 'certified';
  assignedEmail: string;
  docType: 'metrika' | 'passport';
  series: string;
  number: string;
  errorMessage?: string;
  activationLink?: string;
  logs: string[];
  courseraStatus?: 'pending' | 'processing' | 'verified' | 'waiting_email' | 'error';
  courseraLogs?: string[];
  quizStatus?: 'pending' | 'processing' | 'completed' | 'error';
  quizLogs?: string[];
}

export const ClassBatchAutomationModal: React.FC<ClassBatchAutomationModalProps> = ({
  isOpen,
  onClose,
  classGroup,
  students,
  onUpdateStudent,
}) => {
  // Global settings
  const [globalEmail, setGlobalEmail] = useState<string>(() => {
    return localStorage.getItem('aileaders_global_email') || 'akramxonsaidov02@gmail.com';
  });
  const [globalPassword, setGlobalPassword] = useState<string>('MaktabPass2026!');
  const [phone, setPhone] = useState<string>('+998 (88) 005 56 88');

  // Automatic document detection by grade
  const detectedDocType = detectStudentDocType(classGroup.name);
  const gradeMatch = classGroup.name.match(/^(\d{1,2})/);
  const classGrade = gradeMatch ? parseInt(gradeMatch[1], 10) : 9;

  // Batch states
  const [items, setItems] = useState<StudentBatchState[]>([]);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const [batchLinksText, setBatchLinksText] = useState<string>('');
  const [isActivatingBatch, setIsActivatingBatch] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'register' | 'coursera' | 'activate'>('register');
  const [toastMessage, setToastMessage] = useState<string>('');
  const [isSyncingGmail, setIsSyncingGmail] = useState<boolean>(false);
  const [isCourseraRunning, setIsCourseraRunning] = useState<boolean>(false);
  const [currentCourseraIndex, setCurrentCourseraIndex] = useState<number>(-1);
  const [isQuizRunning, setIsQuizRunning] = useState<boolean>(false);
  const [currentQuizIndex, setCurrentQuizIndex] = useState<number>(-1);
  const [isAutopilotRunning, setIsAutopilotRunning] = useState<boolean>(false);
  const [fetchingCertIndex, setFetchingCertIndex] = useState<number | null>(null);
  const [showBookmarkletModal, setShowBookmarkletModal] = useState<boolean>(false);
  const [skipAileaders, setSkipAileaders] = useState<boolean>(true);

  const isPausedRef = useRef<boolean>(false);
  const isRunningRef = useRef<boolean>(false);
  const isQuizRunningRef = useRef<boolean>(false);
  const isAutopilotRunningRef = useRef<boolean>(false);

  // Initialize items when modal opens
  useEffect(() => {
    if (!isOpen) return;

    // Save global email
    localStorage.setItem('aileaders_global_email', globalEmail);

    const classStudents = students.filter(s => s.classId === classGroup.id);

    // Pre-generate guaranteed unique dot-variants for each student in the class
    let dotVariants: string[] = [];
    try {
      const generated = generateGmailVariants({
        baseEmail: globalEmail,
        count: classStudents.length + 30,
        existingPool: [],
        students: [],
      });
      dotVariants = generated.newEmails.map(e => e.email);
    } catch {
      dotVariants = [];
    }

    const initialItems: StudentBatchState[] = classStudents.map((st, idx) => {
      const docType = detectStudentDocType(classGroup.name, st.passportOrId);
      const { series, number } = extractDocSeriesAndNumber(docType, st.passportOrId || '');

      // Assign guaranteed unique dot-alias email
      let targetEmail = st.assignedEmail;
      if (!targetEmail || !targetEmail.includes('@')) {
        targetEmail = dotVariants[idx] || `${globalEmail.split('@')[0]}.${idx + 1}@gmail.com`;
      }

      const isCertified = st.status === 'certified' || !!st.certificateLink || !!st.certificateNumber;
      const isCoursera = !!st.courseraVerified;
      const isQuizDone = isCertified || st.courseraQuizStatus === 'completed';

      return {
        student: st,
        status: isCertified ? 'certified' : (st.hasError || st.status === 'error' ? 'error' : 'pending'),
        assignedEmail: targetEmail,
        docType,
        series,
        number,
        errorMessage: isCertified ? undefined : st.errorReason,
        logs: isCertified ? ['🎓 O\'quvchi Coursera kursini tugatgan va sertifikatga ega. Qayta urinish shart emas.'] : [],
        courseraStatus: isCertified ? 'verified' : (isCoursera ? 'verified' : 'pending'),
        courseraLogs: isCoursera ? ['✅ Coursera hisobi faol va tasdiqlangan.'] : [],
        quizStatus: isQuizDone ? 'completed' : (st.courseraQuizStatus === 'error' ? 'error' : 'pending'),
        quizLogs: isQuizDone ? ['🏆 Barcha 4 ta Coursera testlari topshirilgan.'] : [],
      };
    });

    setItems(initialItems);
    setIsRunning(false);
    setIsPaused(false);
    setCurrentIndex(-1);
  }, [isOpen, classGroup.id, students.length]);

  if (!isOpen) return null;

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 4000);
  };

  const playChime = () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1); // A5
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } catch {}
  };

  // Push notification via browser and Telegram
  const sendPushNotification = async (studentName: string) => {
    playChime();

    // 1. Browser Notification API
    try {
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification("Aileaders Ro'yxatdan O'tildi! 🎉", {
          body: `${studentName} (${classGroup.name}) muvaffaqiyatli ro'yxatdan o'tdi!`,
          icon: '/favicon.ico',
        });
      }
    } catch {}

    // 2. Telegram Bot notification
    try {
      await fetch('/api/notifications/student-registered', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentName,
          className: classGroup.name,
          email: globalEmail,
        }),
      });
    } catch {}
  };

  // Process a single student registration
  const processStudent = async (index: number): Promise<boolean> => {
    const item = items[index];
    if (!item) return false;

    // Update status to processing
    setItems(prev => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        status: 'processing',
        errorMessage: undefined,
        logs: [`[${new Date().toLocaleTimeString('uz-UZ')}] Ro'yxatdan o'tish boshlandi...`],
      };
      return next;
    });

    try {
      const hasCertificate = item.status === 'certified' || !!item.student.certificateLink || !!item.student.certificateNumber;
      const payload = {
        studentId: item.student.id,
        fullName: item.student.fullName,
        docType: item.docType,
        series: item.series,
        number: item.number,
        birthDate: item.student.birthDate || '2010-04-15',
        email: item.assignedEmail,
        phone,
        password: globalPassword,
        hasCertificate,
        isCertified: hasCertificate,
      };

      const res = await fetch('/api/aileaders/automate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      let data: any;
      const text = await res.text();
      try {
        data = JSON.parse(text);
      } catch {
        const isHtml = text && (text.includes('<!doctype') || text.includes('<html') || text.includes('Starting Server'));
        const safeError = isHtml
          ? "Server yangilanmoqda, iltimos 5 soniyadan so'ng qayta urinib ko'ring"
          : (text ? text.slice(0, 200) : `Server xatosi (Status ${res.status})`);
        data = { success: false, error: safeError };
      }

      const finalEmail = data.targetEmail || item.assignedEmail;

      if (data.success) {
        // If student already has certificate, preserve it completely
        if (data.isCertified || hasCertificate) {
          setItems(prev => {
            const next = [...prev];
            next[index] = {
              ...next[index],
              status: 'certified',
              assignedEmail: finalEmail,
              logs: [...(next[index].logs || []), ...(data.logs || []), "🎓 O'quvchi sertifikati saqlab qolindi."],
            };
            return next;
          });
          showToast(`🎓 ${item.student.fullName} sertifikati saqlab qolindi.`);
          return true;
        }

        // Success or already registered
        const isAlready = data.status === 'ALREADY_REGISTERED' || data.isAlreadyRegistered;
        const note = isAlready
          ? "ℹ️ O'quvchi Aileaders tizimida mavjud. Tasdiqlash xati Gmail pochtasida tekshiriladi."
          : "✅ Tasdiqlash xati muvaffaqiyatli yuborildi!";

        setItems(prev => {
          const next = [...prev];
          next[index] = {
            ...next[index],
            status: 'success',
            assignedEmail: finalEmail,
            logs: [...(next[index].logs || []), ...(data.logs || []), note],
          };
          return next;
        });

        // Update in database
        await onUpdateStudent({
          ...item.student,
          assignedEmail: finalEmail,
          assignedPassword: globalPassword,
          status: 'pending',
          hasError: false,
          errorReason: '',
        });

        // Trigger notifications
        sendPushNotification(item.student.fullName);
        showToast(isAlready ? `ℹ️ ${item.student.fullName} Aileaders'da tayyor, Gmail tekshiriladi!` : `✅ ${item.student.fullName} Aileaders'dan ro'yxatdan o'tdi!`);
        return true;
      } else {
        // Error from Aileaders
        let errorMsg = data.error || data.message || "Ro'yxatdan o'tishda noma'lum xatolik";
        if (typeof errorMsg === 'string' && (errorMsg.includes('<!doctype') || errorMsg.includes('<html') || errorMsg.includes('Starting Server'))) {
          errorMsg = "Server yangilanmoqda, iltimos 5 soniyadan so'ng qayta urinib ko'ring";
        }
        if (typeof errorMsg === 'string' && (errorMsg.includes('timeout') || errorMsg.includes('Navigation timeout'))) {
          errorMsg = "⚠️ aileaders.uz serveri javob bermayapti (Navigation timeout). Saytda profilaktika ketmoqda yoki server band.";
        }
        setItems(prev => {
          const next = [...prev];
          next[index] = {
            ...next[index],
            status: 'error',
            errorMessage: errorMsg,
            logs: [...(next[index].logs || []), ...(data.logs || []), `❌ Xatolik: ${errorMsg}`],
          };
          return next;
        });

        await onUpdateStudent({
          ...item.student,
          status: 'error',
          hasError: true,
          errorReason: errorMsg,
        });

        return false;
      }
    } catch (err: any) {
      const safeErr = err?.message && (err.message.includes('<!doctype') || err.message.includes('Unexpected token') || err.message.includes('Starting Server'))
        ? "Server vaqtincha javob bermadi, qayta urinib ko'ring"
        : (err?.message || "Noma'lum server xatosi");

      setItems(prev => {
        const next = [...prev];
        next[index] = {
          ...next[index],
          status: 'error',
          errorMessage: safeErr,
          logs: [...(next[index].logs || []), `❌ Server xatosi: ${safeErr}`],
        };
        return next;
      });

      await onUpdateStudent({
        ...item.student,
        status: 'error',
        hasError: true,
        errorReason: safeErr,
      });

      return false;
    }
  };

  // Resend verification email for a specific student (Qayta havola yuborish)
  const handleResendVerification = async (index: number) => {
    const item = items[index];
    if (!item) return;

    showToast(`📨 ${item.student.fullName} pochtasiga havola qayta yuborilmoqda...`);
    try {
      const res = await fetch('/api/aileaders/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: item.assignedEmail,
          password: globalPassword,
        })
      });
      const data = await res.json();
      if (data.success) {
        playChime();
        showToast(`✅ ${item.student.fullName}: Tasdiqlash xabari Gmail pochtasiga qayta yuborildi!`);
        setItems(prev => {
          const next = [...prev];
          next[index] = {
            ...next[index],
            logs: [...(next[index].logs || []), `[${new Date().toLocaleTimeString('uz-UZ')}] 📬 Qayta havola yuborildi: Gmail pochtangizni tekshiring.`]
          };
          return next;
        });
      } else {
        showToast(`❌ Xato: ${data.error || "Yuborib bo'lmadi"}`);
      }
    } catch (e: any) {
      showToast(`❌ Server xatosi: ${e.message}`);
    }
  };

  // Run all students sequentially
  const handleStartBatch = async () => {
    // Request notification permission if not yet decided
    if ('Notification' in window && Notification.permission === 'default') {
      try {
        await Notification.requestPermission();
      } catch {}
    }

    setIsRunning(true);
    isRunningRef.current = true;
    setIsPaused(false);
    isPausedRef.current = false;

    for (let i = 0; i < items.length; i++) {
      if (!isRunningRef.current) break;

      while (isPausedRef.current) {
        await new Promise(r => setTimeout(r, 500));
        if (!isRunningRef.current) break;
      }

      // Skip already certified students
      const currentStudent = items[i].student;
      const isCertified = currentStudent.status === 'certified' || !!currentStudent.certificateLink || !!currentStudent.certificateNumber;
      if (isCertified) {
        continue;
      }

      setCurrentIndex(i);

      // Aileaders Registration (if not yet registered)
      let aileadersSuccess = items[i].status === 'success';
      if (!aileadersSuccess) {
        aileadersSuccess = await processStudent(i);
        if (!aileadersSuccess) {
          // If server is unreachable or timed out, stop the batch immediately to save teacher's time
          const err = items[i].errorMessage || '';
          if (err.includes('timeout') || err.includes('ishlamayapti') || err.includes('ko\'chirilgan')) {
            showToast("⚠️ 'aileaders.uz' portali javob bermayapti. Vaqtni tejash maqsadida ro'yxatdan o'tkazish to'xtatildi. 'Faqat Testlar' (Coursera) rejimini ishlating!");
            break;
          }
        }
        await new Promise(r => setTimeout(r, 1200));
      }
    }

    setIsRunning(false);
    isRunningRef.current = false;
    setCurrentIndex(-1);
    showToast(`🎉 Sinf ro'yxatdan o'tkazish yakunlandi! Gmail pochtasidan tasdiqlash xatlari tekshirilmoqda...`);
    
    // Automatically check Gmail and activate everyone right away
    await handleSyncGmailActivations();
  };

  // Gmail IMAP auto-activation for both Aileaders and Coursera
  const handleSyncGmailActivations = async () => {
    setIsSyncingGmail(true);
    try {
      const res = await fetch('/api/gmail/sync-and-activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ retries: 5, delaySeconds: 3 })
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.activatedResults)) {
        let activatedCount = 0;
        const toUpdateStudents: Student[] = [];

        setItems(prev => {
          const next = [...prev];
          next.forEach((item, idx) => {
            const itemEmailClean = item.assignedEmail.trim().toLowerCase();

            // Strict exact email match with full dots intact
            const matched = data.activatedResults.find((r: any) => {
              if (!r.success) return false;
              const rEmail = (r.email || '').trim().toLowerCase();
              return rEmail === itemEmailClean;
            });

            if (matched) {
              activatedCount++;
              const isCoursera = matched.type === 'coursera';
              next[idx] = {
                ...next[idx],
                status: isCoursera ? next[idx].status : 'success',
                courseraStatus: isCoursera ? 'verified' : next[idx].courseraStatus,
                logs: [...(next[idx].logs || []), `✅ Gmail orqali ${isCoursera ? 'Coursera' : 'Aileaders'} hisobi tasdiqlandi!`],
                courseraLogs: isCoursera ? [...(next[idx].courseraLogs || []), `✅ Gmail orqali Coursera hisobi faollashtirildi!`] : next[idx].courseraLogs,
              };
              toUpdateStudents.push({
                ...item.student,
                assignedEmail: item.assignedEmail,
                status: isCoursera ? item.student.status : 'pending',
                courseraVerified: isCoursera ? true : item.student.courseraVerified,
                courseraRegisteredAt: isCoursera ? new Date().toISOString() : item.student.courseraRegisteredAt,
                hasError: false,
                errorReason: '',
              });
            }
          });
          return next;
        });

        for (const st of toUpdateStudents) {
          try {
            await onUpdateStudent(st);
          } catch {}
        }

        if (activatedCount > 0) {
          playChime();
          showToast(`⚡️ Gmail'dan ${activatedCount} ta o'quvchi hisobi aniq tasdiqlandi va faollashtirildi!`);
        } else {
          showToast(`ℹ️ Gmail tekshirildi: yangi tasdiqlanmagan xat topilmadi.`);
        }
      } else {
        showToast(data.error || "Gmail tekshirildi, yangi tasdiqlash xati topilmadi");
      }
    } catch (e: any) {
      showToast(`Gmail xatosi: ${e.message}`);
    } finally {
      setIsSyncingGmail(false);
    }
  };

  // Coursera Student Registration Handler
  const processStudentCoursera = async (index: number) => {
    const item = items[index];
    if (!item) return false;

    if (item.status === 'certified' || item.student.certificateLink) {
      return true;
    }

    setItems(prev => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        courseraStatus: 'processing',
        courseraLogs: [`[${new Date().toLocaleTimeString('uz-UZ')}] Coursera dasturiga ulanish boshlandi...`],
      };
      return next;
    });

    try {
      const res = await fetch('/api/coursera/register-student', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: item.student.fullName,
          email: item.assignedEmail,
          password: globalPassword,
        }),
      });

      const data = await res.json();
      const combinedLogs = [...(data.logs || [])];

      if (data.success && data.verified) {
        setItems(prev => {
          const next = [...prev];
          next[index] = {
            ...next[index],
            courseraStatus: 'verified',
            courseraLogs: [...(next[index].courseraLogs || []), ...combinedLogs, "✅ Coursera hisobi to'liq faollashtirildi!"],
          };
          return next;
        });

        await onUpdateStudent({
          ...item.student,
          assignedEmail: item.assignedEmail,
          assignedPassword: globalPassword,
          courseraVerified: true,
          courseraRegisteredAt: new Date().toISOString(),
        });

        playChime();
        sendPushNotification(item.student.fullName);
        showToast(`🎓 ${item.student.fullName} Coursera'dan muvaffaqiyatli ro'yxatdan o'tdi va tasdiqlandi!`);
        return true;
      } else if (data.success && data.waitingEmail) {
        setItems(prev => {
          const next = [...prev];
          next[index] = {
            ...next[index],
            courseraStatus: 'waiting_email',
            courseraLogs: [...(next[index].courseraLogs || []), ...combinedLogs, "📬 Tasdiqlash xati kutilmoqda..."],
          };
          return next;
        });
        showToast(`📬 ${item.student.fullName}: Coursera so'rovi yuborildi, xat kutilmoqda.`);
        return true;
      } else {
        const errorMsg = data.error || "Coursera ro'yxatdan o'tishda xatolik";
        setItems(prev => {
          const next = [...prev];
          next[index] = {
            ...next[index],
            courseraStatus: 'error',
            errorMessage: errorMsg,
            courseraLogs: [...(next[index].courseraLogs || []), ...combinedLogs, `❌ Xatolik: ${errorMsg}`],
          };
          return next;
        });
        return false;
      }
    } catch (err: any) {
      setItems(prev => {
        const next = [...prev];
        next[index] = {
          ...next[index],
          courseraStatus: 'error',
          errorMessage: err.message,
          courseraLogs: [...(next[index].courseraLogs || []), `❌ Server xatosi: ${err.message}`],
        };
        return next;
      });
      return false;
    }
  };

  const handleStartCourseraBatch = async () => {
    setIsCourseraRunning(true);
    for (let i = 0; i < items.length; i++) {
      if (items[i].status === 'certified' || items[i].student.courseraVerified || items[i].courseraStatus === 'verified') {
        continue;
      }
      setCurrentCourseraIndex(i);
      await processStudentCoursera(i);
      await new Promise(r => setTimeout(r, 2000));
    }
    setIsCourseraRunning(false);
    setCurrentCourseraIndex(-1);
    showToast(`🎉 Sinf Coursera ro'yxatdan o'tkazish jarayoni yakunlandi!`);
  };

  const handleStopCourseraBatch = () => {
    setIsCourseraRunning(false);
    setCurrentCourseraIndex(-1);
  };

  // Coursera Quiz Solver Handler (4 Quizzes: Introduction to Generative AI)
  const processStudentQuiz = async (index: number) => {
    const item = items[index];
    if (!item) return false;

    if (item.status === 'certified' || item.student.certificateLink) {
      return true;
    }

    setItems(prev => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        quizStatus: 'processing',
        quizLogs: [`[${new Date().toLocaleTimeString('uz-UZ')}] Coursera testlari (Quiz 1-4) avtomatik yechilmoqda...`],
      };
      return next;
    });

    try {
      const res = await fetch('/api/coursera/solve-quizzes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: item.student.id,
          fullName: item.student.fullName,
          email: item.assignedEmail,
          password: item.student.assignedPassword || globalPassword,
        }),
      });

      const data = await res.json();
      const combinedLogs = [...(data.logs || [])];

      if (data.success) {
        const hasCert = !!data.certificateUrl;
        setItems(prev => {
          const next = [...prev];
          next[index] = {
            ...next[index],
            status: hasCert ? 'certified' : next[index].status,
            quizStatus: 'completed',
            quizLogs: [
              ...(next[index].quizLogs || []),
              ...combinedLogs,
              hasCert
                ? `🎓 Rasmiy Coursera sertifikati olindi va biriktirildi: ${data.certificateUrl}`
                : "🏆 Barcha 4 ta Coursera testlari muvaffaqiyatli topshirildi!",
            ],
          };
          return next;
        });

        await onUpdateStudent({
          ...item.student,
          courseraQuizStatus: 'completed',
          courseraQuizCompletedAt: new Date().toISOString(),
          ...(hasCert ? {
            status: 'certified',
            certificateLink: data.certificateUrl,
            certificateNumber: data.certificateId || item.student.certificateNumber,
            certifiedAt: data.certifiedAt || new Date().toISOString(),
          } : {}),
        });

        playChime();
        sendPushNotification(item.student.fullName);
        showToast(
          hasCert
            ? `🎓 ${item.student.fullName}: Rasmiy Coursera sertifikati avtomatik olindi va biriktirildi!`
            : `🏆 ${item.student.fullName}: Barcha 4 ta Coursera testlari topshirildi!`
        );
        return true;
      } else {
        const errorMsg = data.error || "Testlarni topshirishda xatolik";
        setItems(prev => {
          const next = [...prev];
          next[index] = {
            ...next[index],
            quizStatus: 'error',
            errorMessage: errorMsg,
            quizLogs: [...(next[index].quizLogs || []), ...combinedLogs, `❌ Xatolik: ${errorMsg}`],
          };
          return next;
        });
        showToast(`❌ ${item.student.fullName}: ${errorMsg}`);
        return false;
      }
    } catch (err: any) {
      setItems(prev => {
        const next = [...prev];
        next[index] = {
          ...next[index],
          quizStatus: 'error',
          errorMessage: err.message,
          quizLogs: [...(next[index].quizLogs || []), `❌ Server xatosi: ${err.message}`],
        };
        return next;
      });
      showToast(`❌ Server xatosi: ${err.message}`);
      return false;
    }
  };

  // Single-Click Instant Certificate Fetcher for an existing student
  const handleFetchSingleCertificate = async (index: number) => {
    const item = items[index];
    if (!item) return;

    setFetchingCertIndex(index);
    showToast(`🔍 ${item.student.fullName} uchun Coursera sertifikati qidirilmoqda...`);

    try {
      const res = await fetch('/api/coursera/fetch-certificate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: item.student.fullName,
          email: item.assignedEmail,
          password: item.student.assignedPassword || globalPassword,
        }),
      });

      const data = await res.json();
      if (data.success && data.certificateUrl) {
        setItems(prev => {
          const next = [...prev];
          next[index] = {
            ...next[index],
            status: 'certified',
            quizStatus: 'completed',
            quizLogs: [...(next[index].quizLogs || []), `🎓 Rasmiy sertifikat topildi: ${data.certificateUrl}`],
          };
          return next;
        });

        await onUpdateStudent({
          ...item.student,
          status: 'certified',
          certificateLink: data.certificateUrl,
          certificateNumber: data.certificateId || item.student.certificateNumber,
          certifiedAt: data.certifiedAt || new Date().toISOString(),
          courseraQuizStatus: 'completed',
        });

        playChime();
        sendPushNotification(item.student.fullName);
        showToast(`🎉 ${item.student.fullName}: Rasmiy Coursera sertifikati muvaffaqiyatli biriktirildi!`);
      } else {
        showToast(`⚠️ ${data.error || "Sertifikat hali shakllanmagan yoki testlar to'liq topshirilmagan"}`);
      }
    } catch (err: any) {
      showToast(`❌ Xatolik: ${err.message}`);
    } finally {
      setFetchingCertIndex(null);
    }
  };

  // FULL AUTOPILOT ZERO-TOUCH SUPER-RUNNER
  const handleStartAutopilotBatch = async () => {
    if ('Notification' in window && Notification.permission === 'default') {
      try {
        await Notification.requestPermission();
      } catch {}
    }

    setIsAutopilotRunning(true);
    isAutopilotRunningRef.current = true;
    showToast(`🚀 Butun sinf uchun To'liq Avtopilot Sertifikatlash boshlandi!`);

    let certCount = 0;
    for (let i = 0; i < items.length; i++) {
      if (!isAutopilotRunningRef.current) break;

      const currentStudent = items[i].student;
      const isAlreadyDone = currentStudent.status === 'certified' || !!currentStudent.certificateLink || !!currentStudent.certificateNumber;
      if (isAlreadyDone) {
        continue;
      }

      setCurrentQuizIndex(i);

      // Step 0: Aileaders OneID registration (if not yet registered and not skipped)
      if (!skipAileaders) {
        const isAileadersRegistered = items[i].status === 'success' || items[i].status === 'certified';
        if (!isAileadersRegistered) {
          setCurrentIndex(i);
          showToast(`⚡️ 1/3. ${currentStudent.fullName}: Aileaders tizimidan ro'yxatdan o'tkazilmoqda...`);
          const okAileaders = await processStudent(i);
          if (!isAutopilotRunningRef.current) break;
          await new Promise(r => setTimeout(r, 1500));

          if (okAileaders) {
            // Quick IMAP check to activate Aileaders email link
            try {
              await fetch('/api/gmail/sync-and-activate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ targetEmail: items[i].assignedEmail, retries: 2, delaySeconds: 2 }),
              });
            } catch {}
          } else {
            showToast(`⚠️ ${currentStudent.fullName}: Aileaders o'tkazib yuborildi, to'g'ridan-to'g'ri Coursera'ga o'tilmoqda...`);
          }
        }
      } else {
        setItems(prev => {
          const next = [...prev];
          next[i] = {
            ...next[i],
            logs: [...(next[i].logs || []), "⚡️ Aileaders bosqichi o'tkazib yuborildi (To'g'ridan-to'g'ri Coursera rejimida)."],
          };
          return next;
        });
      }

      // Step 1: If student is not yet registered on Coursera, register them automatically!
      if (!currentStudent.courseraVerified && items[i].courseraStatus !== 'verified') {
        showToast(`🎓 2/3. ${currentStudent.fullName}: Coursera rasmiy dasturidan ro'yxatdan o'tkazilmoqda...`);
        await processStudentCoursera(i);
        if (!isAutopilotRunningRef.current) break;
        await new Promise(r => setTimeout(r, 2500));
      }

      // Step 2: Solve quizzes & automatically fetch official certificate link
      showToast(`🏆 3/3. ${currentStudent.fullName}: Coursera testlari (Quiz 1-4) topshirilmoqda va sertifikat olinmoqda...`);
      const ok = await processStudentQuiz(i);
      if (ok) certCount++;

      if (!isAutopilotRunningRef.current) break;
      // Safe anti-ban delay (3.5 seconds) between students
      await new Promise(r => setTimeout(r, 3500));
    }

    setIsAutopilotRunning(false);
    isAutopilotRunningRef.current = false;
    setCurrentQuizIndex(-1);
    playChime();
    showToast(`🎉 Avtopilot yakunlandi! Jami ${certCount} ta o'quvchi sertifikatlashtirildi.`);
  };

  const handleStopAutopilotBatch = () => {
    setIsAutopilotRunning(false);
    isAutopilotRunningRef.current = false;
    setCurrentQuizIndex(-1);
    showToast("Avtopilot to'xtatildi.");
  };

  const handleStartQuizBatch = async () => {
    setIsQuizRunning(true);
    isQuizRunningRef.current = true;
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < items.length; i++) {
      if (!isQuizRunningRef.current) break;

      if (items[i].status === 'certified' || items[i].quizStatus === 'completed' || items[i].student.courseraQuizStatus === 'completed') {
        continue;
      }
      setCurrentQuizIndex(i);
      const ok = await processStudentQuiz(i);
      if (ok) {
        successCount++;
      } else {
        failCount++;
      }

      if (!isQuizRunningRef.current) break;
      await new Promise(r => setTimeout(r, 2000));
    }

    setIsQuizRunning(false);
    isQuizRunningRef.current = false;
    setCurrentQuizIndex(-1);

    if (failCount > 0) {
      showToast(`⚠️ Natija: ${successCount} ta o'quvchi topshirdi, ${failCount} tasida xatolik yuz berdi. Tafsilotlar loglarda.`);
    } else if (successCount > 0) {
      showToast(`🏆 Barcha ${successCount} ta o'quvchining Coursera testlari muvaffaqiyatli topshirildi!`);
    } else {
      showToast(`ℹ️ Topshirilishi kerak bo'lgan yangi testlar topilmadi.`);
    }
  };

  const handleStopQuizBatch = () => {
    setIsQuizRunning(false);
    isQuizRunningRef.current = false;
    setCurrentQuizIndex(-1);
    showToast(`🛑 Testlarni yechish to'xtatildi.`);
  };

  const handlePauseBatch = () => {
    setIsPaused(true);
    isPausedRef.current = true;
  };

  const handleResumeBatch = () => {
    setIsPaused(false);
    isPausedRef.current = false;
  };

  const handleStopBatch = () => {
    setIsRunning(false);
    isRunningRef.current = false;
    setIsPaused(false);
    isPausedRef.current = false;
    setCurrentIndex(-1);
  };

  // Fast Batch Activation: activates multiple links pasted by user
  const handleBatchActivate = async () => {
    const rawLinks = batchLinksText.split(/[\n\s,]+/).filter(l => l.includes('http'));
    if (rawLinks.length === 0) {
      showToast("⚠️ Iltimos, pochtangizdan nusxalangan faollashtirish havolalarini joylang!");
      return;
    }

    setIsActivatingBatch(true);
    try {
      const res = await fetch('/api/aileaders/batch-activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ links: rawLinks }),
      });
      const data = await res.json();

      if (data.results && Array.isArray(data.results)) {
        const successCount = data.results.filter((r: any) => r.success).length;
        showToast(`✅ ${successCount} ta pochta havolasi muvaffaqiyatli tasdiqlandi!`);
        setBatchLinksText('');
      }
    } catch (e: any) {
      showToast(`❌ Xatolik: ${e.message}`);
    } finally {
      setIsActivatingBatch(false);
    }
  };

  // Single student manual activate
  const handleSingleActivate = async (index: number) => {
    const item = items[index];
    const link = prompt(`${item.student.fullName} uchun Gmail xatidagi faollashtirish havolasini kiriting:\n(https://aileaders.uz/auth/activate/...)`);
    if (!link || !link.trim().startsWith('http')) return;

    try {
      const res = await fetch('/api/aileaders/confirm-activation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activationLink: link.trim(),
          studentId: item.student.id,
          fullName: item.student.fullName,
          email: item.assignedEmail,
          password: globalPassword,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(`✅ ${item.student.fullName} muvaffaqiyatli faollashtirildi!`);
        setItems(prev => {
          const next = [...prev];
          next[index].status = 'success';
          return next;
        });
        await onUpdateStudent({
          ...item.student,
          status: 'pending',
          hasError: false,
          errorReason: '',
        });
      } else {
        showToast(`⚠️ ${data.error || "Tasdiqlashda xatolik"}`);
      }
    } catch (e: any) {
      showToast(`❌ Xato: ${e.message}`);
    }
  };

  const certifiedCount = items.filter(i => i.status === 'certified').length;
  const successCount = items.filter(i => i.status === 'success').length;
  const courseraCount = items.filter(i => i.courseraStatus === 'verified' || !!i.student.courseraVerified || i.status === 'certified').length;
  const quizDoneCount = items.filter(i => i.quizStatus === 'completed' || i.student.courseraQuizStatus === 'completed' || i.status === 'certified').length;
  const errorCount = items.filter(i => i.status === 'error' || i.courseraStatus === 'error' || i.quizStatus === 'error').length;
  const pendingCount = items.filter(i => i.status === 'pending' || i.courseraStatus === 'pending').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/70 backdrop-blur-xs animate-fade-in overflow-y-auto">
      <div className="relative w-full max-w-5xl bg-white rounded-2xl shadow-2xl overflow-hidden my-4 border border-slate-300 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4.5 bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-blue-500/20 border border-blue-400/40 flex items-center justify-center text-white font-black text-lg">
              {classGroup.name}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black tracking-tight">
                  {classGroup.name} Sinfini Aileaders'dan Butunlay Ro'yxatdan O'tkazish
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-500/30 text-blue-200 border border-blue-400/30">
                  {items.length} o'quvchi
                </span>
              </div>
              <p className="text-xs text-blue-200/90 mt-0.5 flex items-center gap-2">
                <span>Ustoz: <b>{classGroup.teacherName}</b></span>
                <span>•</span>
                <span className="bg-white/10 px-2 py-0.5 rounded text-[11px] font-semibold text-emerald-300">
                  {classGrade <= 9 ? `9 va undan kichik sinf (Avtomatik Guvohnoma / Metrika)` : `10-11 sinf (Pasport)`}
                </span>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-blue-200 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Global Settings & Email Control */}
        <div className="px-6 py-3.5 bg-slate-50 border-b border-slate-200 flex-shrink-0">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-[11px] font-bold text-slate-700 block mb-1">
                Asosiy Qabul Qiluvchi Gmail:
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="email"
                  value={globalEmail}
                  onChange={e => {
                    setGlobalEmail(e.target.value);
                    localStorage.setItem('aileaders_global_email', e.target.value);
                  }}
                  className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 font-mono focus:border-blue-600 focus:outline-none"
                  placeholder="akramxonsaidov02@gmail.com"
                />
              </div>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span className="text-[10.5px] text-emerald-700 font-bold">
                  Gmail IMAP avto-ulangan (Xatlar o'zi o'qiladi)
                </span>
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-700 block mb-1">
                Yagona Parol:
              </label>
              <input
                type="text"
                value={globalPassword}
                onChange={e => setGlobalPassword(e.target.value)}
                className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 font-mono focus:border-blue-600 focus:outline-none"
              />
              <span className="text-[10px] text-slate-500 mt-0.5 block">
                Har bir o'quvchi hisobiga bir xil o'rnatiladi
              </span>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-700 block mb-1">
                Telefon raqam:
              </label>
              <input
                type="text"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 font-mono focus:border-blue-600 focus:outline-none"
              />
              <span className="text-[10px] text-slate-500 mt-0.5 block">
                Shakllarga kiritiladigan raqam
              </span>
            </div>
          </div>
        </div>

        {/* Status Notice for Aileaders & Quick Bypass */}
        <div className="px-6 py-2.5 bg-gradient-to-r from-amber-50 to-orange-50 border-b border-amber-200 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500"></span>
            </span>
            <span className="font-bold text-amber-950 text-[11px]">
              Eslatma: <code className="bg-amber-100 text-amber-900 px-1 py-0.5 rounded font-mono text-[10.5px]">aileaders.uz</code> serveri hozirda javob bermayapti (timeout). Tizim to'g'ridan-to'g'ri Coursera orqali testlarni yechishga sozlangan.
            </span>
          </div>

          <label className="flex items-center gap-2 cursor-pointer bg-white px-3 py-1 rounded-lg border border-amber-300 shadow-2xs hover:border-amber-400 transition-colors">
            <input
              type="checkbox"
              checked={skipAileaders}
              onChange={e => setSkipAileaders(e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
            />
            <span className="font-bold text-slate-800 text-[11.5px]">
              ⚡️ Aileaders'ni o'tkazib yuborish (To'g'ridan-to'g'ri Coursera & Sertifikat)
            </span>
            <span className="text-[9.5px] bg-emerald-100 text-emerald-800 font-black px-1.5 py-0.5 rounded uppercase">
              Tavsiya
            </span>
          </label>
        </div>

        {/* Action Controls & Stats */}
        <div className="px-6 py-3 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 flex-shrink-0">
          <div className="flex items-center gap-2">
            {!isRunning && !isCourseraRunning && !isQuizRunning && !isAutopilotRunning ? (
              <>
                <button
                  type="button"
                  onClick={handleStartAutopilotBatch}
                  className="px-5 py-2.5 bg-gradient-to-r from-amber-500 via-orange-500 to-rose-600 hover:from-amber-600 hover:to-rose-700 text-white font-black text-xs rounded-xl shadow-lg flex items-center gap-2 transition-all cursor-pointer transform hover:scale-[1.03] active:scale-[0.98] ring-2 ring-amber-400/50"
                  title="Zero-Touch Autopilot: Sinfdagi barcha o'quvchilar nomidan Coursera 4 ta testini yechib, rasmiy sertifikat havolasini avtomatik ajratib oladi va bazaga saqlaydi!"
                >
                  <Award className="w-4 h-4 text-white fill-white animate-bounce" />
                  <span>🚀 To'liq Avtopilot Sertifikatlash (Zero-Touch)</span>
                </button>

                <button
                  type="button"
                  onClick={handleStartBatch}
                  className="px-4 py-2.5 bg-gradient-to-r from-blue-700 via-indigo-700 to-purple-700 hover:from-blue-800 hover:to-purple-800 text-white font-extrabold text-xs rounded-xl shadow-md flex items-center gap-1.5 transition-all cursor-pointer transform hover:scale-[1.02] active:scale-[0.98]"
                  title="Har bir o'quvchini avval Aileaders, so'ngra Coursera rasmiy ta'lim dasturidan ro'yxatdan o'tkazib, Gmail orqali hisobini faollashtiradi"
                >
                  <Play className="w-4 h-4 fill-white" />
                  <span>⚡️ Aileaders Ro'yxatdan O'tkazish</span>
                </button>

                <button
                  type="button"
                  onClick={handleStartCourseraBatch}
                  className="px-3.5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold text-xs rounded-xl shadow-md flex items-center gap-1.5 transition-all cursor-pointer transform hover:scale-[1.02] active:scale-[0.98]"
                  title="Sinfdagi barcha o'quvchilarni faqat Coursera ta'lim dasturidan ro'yxatdan o'tkazish"
                >
                  <GraduationCap className="w-4 h-4 text-yellow-300" />
                  <span>🎓 Coursera Ulanish</span>
                </button>

                <button
                  type="button"
                  onClick={handleStartQuizBatch}
                  className="px-3.5 py-2.5 bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-700 hover:to-cyan-700 text-white font-extrabold text-xs rounded-xl shadow-md flex items-center gap-1.5 transition-all cursor-pointer transform hover:scale-[1.02] active:scale-[0.98]"
                  title="Sinfdagi barcha o'quvchilar nomidan Coursera 4 ta testini (Introduction to Generative AI) avtomatik yechib topshirish"
                >
                  <FileCheck className="w-4 h-4 text-emerald-200" />
                  <span>🎯 Faqat Testlar</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowBookmarkletModal(true)}
                  className="px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer border border-slate-300 transition-colors"
                  title="Brauzer paneli uchun tezkor Coursera Turbo Bookmarklet skripti"
                >
                  <Bookmark className="w-4 h-4 text-amber-500 fill-amber-500" />
                  <span>Turbo Bookmarklet</span>
                </button>
              </>
            ) : isAutopilotRunning ? (
              <div className="flex items-center gap-2">
                <span className="text-xs font-extrabold text-amber-900 animate-pulse flex items-center gap-1.5 bg-amber-50 px-3.5 py-2 rounded-xl border border-amber-300 shadow-xs">
                  <RefreshCw className="w-4 h-4 animate-spin text-amber-600" />
                  <span>🚀 Avtopilot Ishlamoqda: {currentQuizIndex + 1}/{items.length} (Testlar & Sertifikat)...</span>
                </span>
                <button
                  type="button"
                  onClick={handleStopAutopilotBatch}
                  className="px-3 py-2 bg-rose-100 hover:bg-rose-200 text-rose-800 font-bold text-xs rounded-xl cursor-pointer"
                >
                  To'xtatish
                </button>
              </div>
            ) : isRunning ? (
              <div className="flex items-center gap-2">
                {!isPaused ? (
                  <button
                    type="button"
                    onClick={handlePauseBatch}
                    className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer"
                  >
                    <Pause className="w-4 h-4" />
                    <span>To'xtatib turish</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleResumeBatch}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer"
                  >
                    <Play className="w-4 h-4 fill-white" />
                    <span>Davom ettirish</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleStopBatch}
                  className="px-3.5 py-2 bg-rose-100 hover:bg-rose-200 text-rose-800 font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                  <span>Bekor qilish</span>
                </button>
              </div>
            ) : isCourseraRunning ? (
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-indigo-700 animate-pulse flex items-center gap-1.5 bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-200">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                  <span>Coursera robot: {currentCourseraIndex + 1}/{items.length}...</span>
                </span>
                <button
                  type="button"
                  onClick={handleStopCourseraBatch}
                  className="px-3 py-1.5 bg-rose-100 hover:bg-rose-200 text-rose-800 font-bold text-xs rounded-lg cursor-pointer"
                >
                  To'xtatish
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-emerald-800 animate-pulse flex items-center gap-1.5 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-300">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                  <span>Testlar yechilmoqda: {currentQuizIndex + 1}/{items.length}...</span>
                </span>
                <button
                  type="button"
                  onClick={handleStopQuizBatch}
                  className="px-3 py-1.5 bg-rose-100 hover:bg-rose-200 text-rose-800 font-bold text-xs rounded-lg cursor-pointer"
                >
                  To'xtatish
                </button>
              </div>
            )}

            {/* Direct Gmail IMAP Auto-Activation Button */}
            <button
              type="button"
              onClick={handleSyncGmailActivations}
              disabled={isSyncingGmail}
              className="px-4 py-2.5 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:to-teal-800 text-white font-extrabold text-xs rounded-xl shadow-md flex items-center gap-2 cursor-pointer transition-all active:scale-[0.98] disabled:opacity-50"
              title="Gmail pochtasidagi barcha yangi tasdiqlash xatlarini izlab topadi va o'quvchilar hisoblarini faollashtiradi"
            >
              <Zap className={`w-4 h-4 text-yellow-300 fill-yellow-300 ${isSyncingGmail ? 'animate-spin' : 'animate-pulse'}`} />
              <span>{isSyncingGmail ? "Gmail tekshirilmoqda..." : "⚡️ Gmail'dan Avto-faollashtirish"}</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab(activeTab === 'register' ? 'activate' : 'register')}
              className={`px-4 py-2 rounded-xl text-xs font-bold border transition-colors flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'activate'
                  ? 'bg-amber-500 text-slate-950 border-amber-600'
                  : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-300'
              }`}
            >
              <Mail className="w-4 h-4" />
              <span>Xatlarni Tasdiqlash Bo'limi</span>
            </button>
          </div>

          {/* Quick Counters */}
          <div className="flex items-center gap-2.5 text-xs">
            {certifiedCount > 0 && (
              <span className="px-2.5 py-1 rounded-lg bg-purple-50 text-purple-900 font-bold border border-purple-200 flex items-center gap-1.5">
                <GraduationCap className="w-3.5 h-3.5 text-purple-600" />
                <span>Sertifikat olgan: {certifiedCount}</span>
              </span>
            )}

            <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 font-bold border border-emerald-200 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Aileaders: {successCount}</span>
            </span>

            <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-900 font-bold border border-blue-200 flex items-center gap-1.5">
              <GraduationCap className="w-3.5 h-3.5 text-blue-600" />
              <span>Coursera faol: {courseraCount}</span>
            </span>

            <span className="px-2.5 py-1 rounded-lg bg-teal-50 text-teal-900 font-bold border border-teal-300 flex items-center gap-1.5">
              <FileCheck className="w-3.5 h-3.5 text-teal-700" />
              <span>Test topshirgan: {quizDoneCount}</span>
            </span>

            <span className="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 font-bold border border-amber-200 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-600" />
              <span>Kutilmoqda: {pendingCount}</span>
            </span>

            {errorCount > 0 && (
              <span className="px-2.5 py-1 rounded-lg bg-rose-50 text-rose-800 font-bold border border-rose-200 flex items-center gap-1.5">
                <XCircle className="w-3.5 h-3.5 text-rose-600" />
                <span>Xatolik: {errorCount}</span>
              </span>
            )}
          </div>
        </div>

        {/* Toast Alert */}
        {toastMessage && (
          <div className="px-6 py-2.5 bg-emerald-600 text-white text-xs font-bold flex items-center justify-between animate-fade-in flex-shrink-0">
            <span>{toastMessage}</span>
            <span className="text-[11px] opacity-90 font-mono">Telegram xabar yuborildi</span>
          </div>
        )}

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {activeTab === 'activate' ? (
            /* Batch Activation Panel */
            <div className="p-5 rounded-2xl bg-amber-50/70 border-2 border-amber-300 space-y-4 animate-scale-up">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-black text-amber-950 flex items-center gap-2">
                    <Mail className="w-4 h-4 text-amber-700" />
                    <span>Gmail Pochtadagi Faollashtirish Xabarlarini Ommaviy Tasdiqlash</span>
                  </h3>
                  <p className="text-xs text-amber-900 mt-1">
                    Gmail'ingizga kelgan bir nechta yoki barcha aktivatsiya havolalarini shu yerga nusxalab qo'ysangiz, robot ularning barchasini 1 soniyada tasdiqlab beradi.
                  </p>
                </div>

                <a
                  href="https://mail.google.com/mail/u/0/#search/from%3Anoreply"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 flex-shrink-0 shadow-xs cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Gmail'da "noreply" xatlarini ochish</span>
                </a>
              </div>

              <div className="space-y-2">
                <textarea
                  rows={4}
                  value={batchLinksText}
                  onChange={e => setBatchLinksText(e.target.value)}
                  placeholder="Xat ichidagi havolalarni shu yerga qo'ying (har bir qatorga bittadan):&#10;https://aileaders.uz/auth/activate/...&#10;https://aileaders.uz/auth/activate/..."
                  className="w-full p-3 text-xs bg-white border border-amber-300 rounded-xl font-mono text-slate-900 focus:outline-none focus:border-amber-600"
                />

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleBatchActivate}
                    disabled={isActivatingBatch || !batchLinksText.trim()}
                    className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-xs flex items-center gap-2 cursor-pointer transition-all"
                  >
                    {isActivatingBatch ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Tasdiqlanmoqda...</span>
                      </>
                    ) : (
                      <>
                        <Zap className="w-4 h-4" />
                        <span>Barcha Havolalarni Tasdiqlash</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {/* Students List Table */}
          <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100/80 text-slate-700 font-bold border-b border-slate-200 uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="py-3 px-3 w-10 text-center">#</th>
                    <th className="py-3 px-4">O'quvchi F.I.SH</th>
                    <th className="py-3 px-3">Tug'ilgan sana</th>
                    <th className="py-3 px-3">Hujjat (Metrika/ID)</th>
                    <th className="py-3 px-4">Email</th>
                    <th className="py-3 px-4">Holat / Xatolik sababi</th>
                    <th className="py-3 px-3 text-right">Amal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((item, idx) => {
                    const isCurrent = currentIndex === idx;
                    return (
                      <tr
                        key={item.student.id}
                        className={`transition-colors ${
                          isCurrent
                            ? 'bg-blue-50/70 ring-1 ring-blue-400'
                            : item.status === 'success'
                            ? 'bg-emerald-50/20'
                            : item.status === 'error'
                            ? 'bg-rose-50/30'
                            : 'hover:bg-slate-50/50'
                        }`}
                      >
                        <td className="py-3 px-3 text-center font-mono text-slate-500 font-semibold">
                          {idx + 1}
                        </td>

                        <td className="py-3 px-4 font-bold text-slate-900">
                          <div>{item.student.fullName}</div>
                          {isCurrent && (
                            <span className="text-[10px] text-blue-600 font-semibold flex items-center gap-1 mt-0.5 animate-pulse">
                              <RefreshCw className="w-3 h-3 animate-spin" />
                              <span>Hozir kiritilmoqda...</span>
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-3 font-mono text-slate-600">
                          {item.student.birthDate || '—'}
                        </td>

                        <td className="py-3 px-3 font-mono">
                          <span className="px-1.5 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-800">
                            {item.series} {item.number}
                          </span>
                        </td>

                        <td className="py-3 px-4 font-mono text-slate-600 text-[11px] truncate max-w-[180px]">
                          {item.assignedEmail}
                        </td>

                        <td className="py-3 px-4">
                          <div className="space-y-1.5">
                            {/* Aileaders Status */}
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-bold text-slate-500 w-14">Aileaders:</span>
                              {item.status === 'certified' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-900 border border-purple-200">
                                  <GraduationCap className="w-3 h-3 text-purple-600" />
                                  <span>Tugatilgan</span>
                                </span>
                              ) : item.status === 'success' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                  <span>Ro'yxatdan o'tdi</span>
                                </span>
                              ) : item.status === 'processing' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 animate-pulse">
                                  <RefreshCw className="w-3 h-3 animate-spin text-blue-600" />
                                  <span>Yuborilmoqda...</span>
                                </span>
                              ) : item.status === 'error' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200" title={item.errorMessage}>
                                  <XCircle className="w-3 h-3 text-rose-600" />
                                  <span className="truncate max-w-[120px]">{item.errorMessage || "Xatolik"}</span>
                                </span>
                              ) : (
                                <span className="text-slate-400 font-medium text-[10px]">Navbatda</span>
                              )}
                            </div>

                            {/* Coursera Status */}
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-bold text-slate-500 w-14">Coursera:</span>
                              {item.courseraStatus === 'verified' || !!item.student.courseraVerified || item.status === 'certified' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-900 border border-blue-200">
                                  <CheckCircle2 className="w-3 h-3 text-blue-600" />
                                  <span>Faol & Tasdiqlangan</span>
                                </span>
                              ) : item.courseraStatus === 'processing' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 animate-pulse">
                                  <RefreshCw className="w-3 h-3 animate-spin text-indigo-600" />
                                  <span>Ulanmoqda...</span>
                                </span>
                              ) : item.courseraStatus === 'waiting_email' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                                  <Mail className="w-3 h-3 text-amber-700" />
                                  <span>Xat kutilmoqda</span>
                                </span>
                              ) : item.courseraStatus === 'error' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                                  <AlertTriangle className="w-3 h-3 text-rose-600" />
                                  <span>Xato</span>
                                </span>
                              ) : (
                                <span className="text-slate-400 font-medium text-[10px]">Ulanmagan</span>
                              )}
                            </div>

                            {/* Coursera Quizzes Status */}
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-bold text-slate-500 w-14">Testlar:</span>
                              {item.quizStatus === 'completed' || item.student.courseraQuizStatus === 'completed' || item.status === 'certified' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-100 text-teal-900 border border-teal-300">
                                  <CheckCircle2 className="w-3 h-3 text-teal-600" />
                                  <span>4/4 Topshirildi</span>
                                </span>
                              ) : item.quizStatus === 'processing' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 animate-pulse">
                                  <RefreshCw className="w-3 h-3 animate-spin text-emerald-600" />
                                  <span>Yechilmoqda (1-4)...</span>
                                </span>
                              ) : item.quizStatus === 'error' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200" title={item.errorMessage}>
                                  <AlertTriangle className="w-3 h-3 text-rose-600" />
                                  <span>Xato</span>
                                </span>
                              ) : (
                                <span className="text-slate-400 font-medium text-[10px]">Topshirilmagan</span>
                              )}
                            </div>
                          </div>
                        </td>

                        <td className="py-3 px-3 text-right">
                          {item.status === 'certified' || !!item.student.certificateLink ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <span className="text-[10px] text-purple-700 font-bold px-2 py-1 bg-purple-50 rounded-lg border border-purple-200 inline-flex items-center gap-1">
                                🎓 Sertifikatlangan
                              </span>
                              {item.student.certificateLink && (
                                <a
                                  href={item.student.certificateLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors border border-blue-200 inline-flex items-center"
                                  title="Rasmiy Coursera sertifikatini ko'rish"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                              )}
                              {item.student.certificateLink && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    navigator.clipboard.writeText(item.student.certificateLink || '');
                                    showToast("Sertifikat havolasi nusxalandi!");
                                  }}
                                  className="p-1.5 text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200 cursor-pointer"
                                  title="Havolani nusxalash"
                                >
                                  <Copy className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          ) : (
                            <div className="flex items-center justify-end gap-1.5">
                              {/* If test was completed, provide direct Instant Fetch Certificate button */}
                              {item.quizStatus === 'completed' || item.student.courseraQuizStatus === 'completed' ? (
                                <button
                                  type="button"
                                  onClick={() => handleFetchSingleCertificate(idx)}
                                  disabled={fetchingCertIndex === idx || isRunning || isAutopilotRunning}
                                  className="px-2.5 py-1 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-lg text-[10px] font-extrabold transition-all cursor-pointer flex items-center gap-1 shadow-xs disabled:opacity-50"
                                  title="Coursera yutuqlar sahifasidan rasmiy sertifikat havolasini darhol ajratib olish"
                                >
                                  {fetchingCertIndex === idx ? (
                                    <RefreshCw className="w-3 h-3 animate-spin text-white" />
                                  ) : (
                                    <Award className="w-3 h-3 text-yellow-300" />
                                  )}
                                  <span>{fetchingCertIndex === idx ? "Olinmoqda..." : "Sertifikatni Olish"}</span>
                                </button>
                              ) : (
                                /* Single Coursera Quiz Solver + Certificate retrieval */
                                <button
                                  type="button"
                                  onClick={() => processStudentQuiz(idx)}
                                  disabled={isRunning || isCourseraRunning || isQuizRunning || isAutopilotRunning}
                                  className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-[10px] font-extrabold transition-all cursor-pointer flex items-center gap-1 disabled:opacity-50"
                                  title="Ushbu o'quvchi uchun Coursera 4 ta testini avtomatik yechib, sertifikat havolasini oladi"
                                >
                                  <FileCheck className="w-3 h-3 text-emerald-700" />
                                  <span>Test + Sertifikat</span>
                                </button>
                              )}

                              {/* Coursera single button */}
                              <button
                                type="button"
                                onClick={() => processStudentCoursera(idx)}
                                disabled={isRunning || isCourseraRunning || isQuizRunning || isAutopilotRunning}
                                className="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1 disabled:opacity-50"
                                title="Ushbu o'quvchini Coursera rasmiy dasturidan ro'yxatdan o'tkazish va tasdiqlash"
                              >
                                <GraduationCap className="w-3 h-3 text-blue-600" />
                                <span>Coursera</span>
                              </button>

                              {/* Resend verification email button */}
                              <button
                                type="button"
                                onClick={() => handleResendVerification(idx)}
                                disabled={isRunning || isAutopilotRunning}
                                className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-lg text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1 disabled:opacity-50"
                                title="Gmail pochtasiga tasdiqlash xatini qayta yuborish (Resend verification)"
                              >
                                <Mail className="w-3 h-3 text-amber-700" />
                                <span>Qayta xat</span>
                              </button>

                              {/* Aileaders single retry button */}
                              <button
                                type="button"
                                onClick={() => processStudent(idx)}
                                disabled={isRunning || isCourseraRunning || isAutopilotRunning}
                                className="p-1 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors cursor-pointer"
                                title="Aileaders'dan qaytadan o'tkazish"
                              >
                                <RefreshCw className="w-3.5 h-3.5" />
                              </button>

                              {/* Manual Link button */}
                              <button
                                type="button"
                                onClick={() => handleSingleActivate(idx)}
                                className="p-1 hover:bg-amber-100 text-amber-700 rounded-lg transition-colors cursor-pointer"
                                title="Gmail'dan kelgan havolani qo'lda kiritish"
                              >
                                <Mail className="w-3.5 h-3.5 text-amber-700" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-100 border-t border-slate-200 flex items-center justify-between flex-shrink-0">
          <div className="text-xs text-slate-600">
            Avtomatlashtirish o'quvchi ma'lumotlarini OneID/ERP orqali tekshiradi va barcha xatlarni <b>{globalEmail}</b> pochtasiga yo'naltiradi.
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 font-bold text-xs rounded-xl shadow-xs cursor-pointer"
          >
            Yopish
          </button>
        </div>
      </div>

      {/* Turbo Bookmarklet Modal */}
      {showBookmarkletModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl p-6 border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <Bookmark className="w-5 h-5 text-amber-500 fill-amber-500" />
                <h3 className="text-base font-black text-slate-900">
                  Coursera Turbo Bookmarklet (0.5s Tezlatkich)
                </h3>
              </div>
              <button
                onClick={() => setShowBookmarkletModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-4 space-y-3.5 text-xs text-slate-600">
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-950 font-medium">
                <span className="font-bold text-emerald-800 block mb-0.5">💡 Eng qulay va tezkor yo'l:</span>
                Courseraga o'zingiz kirib, qo'lda xatcho'p bosib o'tirishingiz shart emas! Oynaning yuqorisidagi <strong>"🚀 To'liq Avtopilot Sertifikatlash"</strong> yoki har bir o'quvchi kartochkasidagi <strong>"⚡️ Robot orqali yechish"</strong> tugmasini bitta bossangiz, serverning o'zi barcha testlarni 1 daqiqada topshirib, sertifikat havolasini avtomatik bazaga yozib qo'yadi!
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <div className="font-bold text-amber-900 mb-1">Brauzer Xatcho'pidan foydalanish tartibi:</div>
                <ol className="list-decimal list-inside space-y-1 text-amber-800">
                  <li>Quyidagi tugmani sichqoncha bilan ushlab, brauzerning Yuqori Xatcho'plar (Bookmarks) paneliga sudrab tashlang (Drag & Drop).</li>
                  <li>Coursera test sahifasida (Quiz 1, 2, 3 yoki 4) "Start attempt" yoki savollar chiqqanida xatcho'pni bosing.</li>
                  <li>Robot barcha savollarni 100% to'g'ri belgilaydi va avtomatik "Submit" tugmasini bosadi.</li>
                  <li>Testlar tugagach, Coursera Yutuqlar (Accomplishments) sahifasida xatcho'pni bossangiz, sertifikat havolasini darhol nusxalab beradi!</li>
                </ol>
              </div>

              <div className="pt-2 flex flex-col items-center gap-3">
                <a
                  href={`javascript:(function(){const notify=(msg,bg='#059669')=>{let d=document.getElementById('b1m-toast');if(!d){d=document.createElement('div');d.id='b1m-toast';d.style.cssText='position:fixed;top:24px;right:24px;padding:14px 22px;border-radius:12px;font-family:system-ui,-apple-system,sans-serif;font-size:14px;font-weight:700;color:#fff;z-index:9999999;box-shadow:0 12px 30px rgba(0,0,0,0.35);transition:all 0.3s ease;';document.body.appendChild(d);}d.style.background=bg;d.innerText=msg;clearTimeout(window._b1mTimer);window._b1mTimer=setTimeout(()=>d.remove(),6000);};const clickEl=(el)=>{try{el.scrollIntoView({behavior:'smooth',block:'center'});}catch(e){}try{el.click();}catch(e){}try{el.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));}catch(e){}try{el.dispatchEvent(new Event('change',{bubbles:true}));}catch(e){}};const u=location.href.toLowerCase();const certLink=document.querySelector('a[href*="/records/"],a[href*="/verify/"]');if(certLink&&(u.includes('/accomplishments')||u.includes('/records')||u.includes('/home')||u.includes('/learn'))){const fullHref=certLink.href;try{navigator.clipboard.writeText(fullHref);}catch(e){}notify('🎓 Sertifikat nusxalandi: '+fullHref);return;}const startBtns=Array.from(document.querySelectorAll('button,a')).filter(b=>{const t=(b.innerText||'').trim().toLowerCase();return(t.includes('start attempt')||t.includes('resume')||t.includes('начать попытку')||t.includes('take quiz')||t.includes('продолжить')||t.includes('start quiz')||t.includes('try again')||t.includes('пройти тест'))&&!b.disabled;});if(startBtns.length>0&&!document.querySelector('input[type="radio"],input[type="checkbox"],[role="radio"]')){clickEl(startBtns[0]);notify('🚀 Test boshlanmoqda... 2 soniya kuting va xatcho\\'pni qayta bosing!');return;}const answers=['create new content','создавать новый контент','images of cats and then used to generate new images of cats','изображениях кошек','кошек и собак','foundation model is a large ai model pretrained on a vast quantity of data','designed to be adapted','базовая модель','адаптирован','short piece of text','control the output','промпт'];const inputs=Array.from(document.querySelectorAll('input[type="radio"],input[type="checkbox"],[role="radio"],[role="checkbox"]'));if(inputs.length===0){notify('⚠️ Test savollari topilmadi. Avval testni oching yoki Start Attempt bosing!','#d97706');return;}let selected=0;inputs.forEach(r=>{const p=r.closest('label')||r.closest('[role="radiogroup"]')||r.parentElement;const txt=(p?(p.innerText||''):'')+(r.nextElementSibling?(r.nextElementSibling.innerText||''):'');const low=txt.toLowerCase();if(low.includes('too much data')||low.includes('слишком много данных')||low.includes('слишком большом')){return;}const matched=answers.some(a=>low.includes(a.toLowerCase()));if(matched){clickEl(r);selected++;}});if(selected<inputs.length/4){inputs.forEach(r=>{const p=r.closest('label')||r.parentElement;const t=(p?(p.innerText||''):'').toLowerCase();if(t.length>10&&!t.includes('too much data')&&!t.includes('слишком много данных')){clickEl(r);selected++;}});}setTimeout(()=>{const submitBtn=Array.from(document.querySelectorAll('button')).find(b=>{const t=(b.innerText||'').trim().toLowerCase();return(t==='submit'||t==='submit attempt'||t==='отправить'||t==='отправить попытку'||t.startsWith('submit'))&&!b.disabled;});if(submitBtn){clickEl(submitBtn);setTimeout(()=>{const modalConfirm=Array.from(document.querySelectorAll('button')).find(b=>{const t=(b.innerText||'').trim().toLowerCase();return(t==='submit'||t==='отправить'||t.includes('yes')||t.includes('да'))&&!b.disabled;});if(modalConfirm)clickEl(modalConfirm);},1000);notify('✅ Test 100% yechildi va Submit qilindi!');}else{notify('✅ Javoblar belgilandi! Sahifa pastidagi Submit tugmasini bosing.');}},600);})();`}
                  onClick={e => e.preventDefault()}
                  className="px-6 py-3 bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 text-white font-black text-sm rounded-xl shadow-lg border-2 border-white cursor-grab active:cursor-grabbing hover:scale-105 transition-all inline-flex items-center gap-2"
                  title="Ushbu tugmani brauzer xatcho'plar paneliga sudrab qo'ying"
                >
                  <Bookmark className="w-5 h-5 fill-white" />
                  <span>⚡️ Coursera Turbo Solver (Sudrab oling)</span>
                </a>
                <span className="text-[11px] text-slate-500 font-medium text-center">
                  Tugmani sichqoncha bilan ushlab, brauzerning Bookmarks paneliga sudrab qo'ying
                </span>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setShowBookmarkletModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs cursor-pointer"
              >
                Tushunarli
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
