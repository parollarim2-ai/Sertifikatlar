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
  GraduationCap
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
  const [activeTab, setActiveTab] = useState<'register' | 'activate'>('register');
  const [toastMessage, setToastMessage] = useState<string>('');
  const [isSyncingGmail, setIsSyncingGmail] = useState<boolean>(false);

  const isPausedRef = useRef<boolean>(false);
  const isRunningRef = useRef<boolean>(false);

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

      return {
        student: st,
        status: isCertified ? 'certified' : (st.hasError || st.status === 'error' ? 'error' : 'pending'),
        assignedEmail: targetEmail,
        docType,
        series,
        number,
        errorMessage: isCertified ? undefined : st.errorReason,
        logs: isCertified ? ['🎓 O\'quvchi Coursera kursini tugatgan va sertifikatga ega. Qayta urinish shart emas.'] : [],
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
        data = { success: false, error: text || `Server xatosi (Status ${res.status})` };
      }

      const finalEmail = data.targetEmail || item.assignedEmail;

      if (data.success) {
        // Success or already registered
        const isAlready = data.status === 'ALREADY_REGISTERED' || data.isAlreadyRegistered;
        const note = isAlready
          ? "ℹ️ O'quvchi avval Aileaders'da ro'yxatdan o'tgan. Tasdiqlash xati Gmail pochtasida mavjud."
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
        showToast(isAlready ? `ℹ️ ${item.student.fullName} Aileaders'da mavjud, Gmail tekshiriladi!` : `✅ ${item.student.fullName} Aileaders'dan ro'yxatdan o'tdi!`);
        return true;
      } else {
        // Error from Aileaders
        const errorMsg = data.error || data.message || "Ro'yxatdan o'tishda noma'lum xatolik";
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
      setItems(prev => {
        const next = [...prev];
        next[index] = {
          ...next[index],
          status: 'error',
          errorMessage: err.message,
          logs: [...(next[index].logs || []), `❌ Server xatosi: ${err.message}`],
        };
        return next;
      });

      await onUpdateStudent({
        ...item.student,
        status: 'error',
        hasError: true,
        errorReason: err.message,
      });

      return false;
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

      // Skip already succeeded students or students with certificates
      const currentStudent = items[i].student;
      const isCertified = currentStudent.status === 'certified' || !!currentStudent.certificateLink || !!currentStudent.certificateNumber;
      if (items[i].status === 'success' || isCertified) {
        continue;
      }

      setCurrentIndex(i);
      await processStudent(i);

      // Brief delay between students to respect Aileaders rate-limit
      await new Promise(r => setTimeout(r, 2000));
    }

    setIsRunning(false);
    isRunningRef.current = false;
    setCurrentIndex(-1);
    showToast(`🎉 Sinf ro'yxatdan o'tkazildi! Gmail xatlari avtomatik tekshirilmoqda...`);
    
    // Automatically check Gmail and activate everyone right away
    await handleSyncGmailActivations();
  };

  // Gmail IMAP auto-activation
  const handleSyncGmailActivations = async () => {
    setIsSyncingGmail(true);
    try {
      const res = await fetch('/api/gmail/sync-and-activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.activatedResults)) {
        const activatedEmails = new Set<string>(
          data.activatedResults
            .filter((r: any) => r.success)
            .map((r: any) => (r.email || '').trim().toLowerCase())
        );

        let activatedCount = 0;
        const toUpdateStudents: Student[] = [];

        setItems(prev => {
          const next = [...prev];
          next.forEach((item, idx) => {
            const itemEmailClean = item.assignedEmail.trim().toLowerCase();
            const isMatch = activatedEmails.has(itemEmailClean) || 
              Array.from(activatedEmails).some((ae: string) => ae.replace(/\./g, '') === itemEmailClean.replace(/\./g, ''));
            
            if (isMatch && item.status !== 'success') {
              activatedCount++;
              next[idx] = {
                ...next[idx],
                status: 'success',
                logs: [...(next[idx].logs || []), `✅ Gmail orqali muvaffaqiyatli faollashtirildi!`],
              };
              toUpdateStudents.push({
                ...item.student,
                assignedEmail: item.assignedEmail,
                status: 'pending',
                hasError: false,
                errorReason: '',
              });
            }
          });
          return next;
        });

        // Asynchronously update student states outside of component render
        for (const st of toUpdateStudents) {
          try {
            await onUpdateStudent(st);
          } catch {}
        }

        playChime();
        showToast(`⚡️ Gmail'dan ${activatedCount || data.activatedCount} ta o'quvchi avtomatik faollashtirildi!`);
      } else {
        showToast(data.error || "Gmail tekshirildi, yangi tasdiqlash xati topilmadi");
      }
    } catch (e: any) {
      showToast(`Gmail xatosi: ${e.message}`);
    } finally {
      setIsSyncingGmail(false);
    }
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
      alert("Iltimos, pochtangizdan nusxalangan faollashtirish havolalarini joylang!");
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
      alert(`Xatolik: ${e.message}`);
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
        alert(data.error || "Tasdiqlashda xatolik");
      }
    } catch (e: any) {
      alert(`Xato: ${e.message}`);
    }
  };

  const certifiedCount = items.filter(i => i.status === 'certified').length;
  const successCount = items.filter(i => i.status === 'success').length;
  const errorCount = items.filter(i => i.status === 'error').length;
  const pendingCount = items.filter(i => i.status === 'pending').length;

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
                Aileaders shakliga kiritiladigan raqam
              </span>
            </div>
          </div>
        </div>

        {/* Action Controls & Stats */}
        <div className="px-6 py-3 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 flex-shrink-0">
          <div className="flex items-center gap-2">
            {!isRunning ? (
              <button
                type="button"
                onClick={handleStartBatch}
                className="px-5 py-2.5 bg-gradient-to-r from-blue-700 to-indigo-700 hover:from-blue-800 hover:to-indigo-800 text-white font-bold text-xs rounded-xl shadow-md flex items-center gap-2 transition-all cursor-pointer transform hover:scale-[1.02] active:scale-[0.98]"
              >
                <Play className="w-4 h-4 fill-white" />
                <span>Butun Sinfni Ro'yxatdan O'tkazish (Avtomatik)</span>
              </button>
            ) : (
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
            )}

            {/* Direct Gmail IMAP Auto-Activation Button */}
            <button
              type="button"
              onClick={handleSyncGmailActivations}
              disabled={isSyncingGmail}
              className="px-4 py-2.5 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:to-teal-800 text-white font-extrabold text-xs rounded-xl shadow-md flex items-center gap-2 cursor-pointer transition-all active:scale-[0.98] disabled:opacity-50"
              title="akramxonsaidov02@gmail.com pochtasidagi barcha tasdiqlash xatlarini o'zi topib, o'quvchilarni bittada faollashtiradi"
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
          <div className="flex items-center gap-3 text-xs">
            {certifiedCount > 0 && (
              <span className="px-2.5 py-1 rounded-lg bg-purple-50 text-purple-900 font-bold border border-purple-200 flex items-center gap-1.5">
                <GraduationCap className="w-3.5 h-3.5 text-purple-600" />
                <span>Sertifikat olgan: {certifiedCount}</span>
              </span>
            )}

            <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 font-bold border border-emerald-200 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Ro'yxatdan o'tgan: {successCount}</span>
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
                          {item.status === 'certified' && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-purple-100 text-purple-900 border border-purple-200 shadow-xs">
                              <GraduationCap className="w-3.5 h-3.5 text-purple-600" />
                              <span>🎓 Sertifikat mavjud (Tugatilgan)</span>
                            </span>
                          )}

                          {item.status === 'success' && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              <span>✅ Ro'yxatdan o'tdi / Tasdiqlandi</span>
                            </span>
                          )}

                          {item.status === 'processing' && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-100 text-blue-800 animate-pulse">
                              <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600" />
                              <span>Tekshirilmoqda...</span>
                            </span>
                          )}

                          {item.status === 'error' && (
                            <div className="text-rose-700 font-semibold text-[11px] flex items-start gap-1">
                              <XCircle className="w-3.5 h-3.5 text-rose-600 flex-shrink-0 mt-0.5" />
                              <span>{item.errorMessage || "Xatolik yuz berdi"}</span>
                            </div>
                          )}

                          {item.status === 'pending' && (
                            <span className="text-slate-400 font-medium text-[11px]">
                              Navbatda
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-3 text-right">
                          {item.status === 'certified' ? (
                            <span className="text-[10px] text-purple-700 font-bold px-2 py-1 bg-purple-50 rounded-lg border border-purple-200 inline-block">
                              🎓 Tayyor
                            </span>
                          ) : (
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => processStudent(idx)}
                                disabled={isRunning}
                                className="p-1.5 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors cursor-pointer"
                                title="Qaytadan ro'yxatdan o'tkazish"
                              >
                                <RefreshCw className="w-3.5 h-3.5" />
                              </button>

                              <button
                                type="button"
                                onClick={() => handleSingleActivate(idx)}
                                className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-lg text-[10px] font-bold transition-colors cursor-pointer flex items-center gap-1"
                                title="Gmail'dan kelgan havolani kiritish"
                              >
                                <Mail className="w-3 h-3 text-amber-700" />
                                <span>Havola kiritish</span>
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
    </div>
  );
};
