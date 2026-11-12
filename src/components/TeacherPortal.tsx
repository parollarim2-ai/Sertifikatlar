import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ClassGroup, Student, TeacherSession, TeacherMessage } from '../types';
import { detectCurrentDevice } from '../utils/deviceDetector';
import { extractPassportDigits } from '../utils/studentValidator';
import { TeacherIncomingNoticeModal } from './TeacherIncomingNoticeModal';
import { BlockedAccessOverlay } from './BlockedAccessOverlay';
import { TelegramShareModal } from './TelegramShareModal';
import { 
  formatClassCertificatesForClipboard, 
  downloadAllCertificatesAsZip,
  generateUnifiedCertificatesPdf,
} from '../utils/certificateGenerator';
import {
  parseMetrikaComponents,
  getStudentTrackData,
} from '../utils/studentLoginHelper';
import confetti from 'canvas-confetti';
import { 
  Users, 
  Award, 
  AlertCircle, 
  Copy, 
  Search, 
  ExternalLink, 
  CheckCircle2, 
  Check, 
  X, 
  School, 
  UserCheck, 
  ChevronRight, 
  RefreshCw, 
  Clock, 
  Sparkles, 
  FolderArchive, 
  FileStack, 
  Bell, 
  ArrowLeft, 
  Key, 
  Mail, 
  Zap, 
  Layers,
  Laptop,
  CheckCheck
} from 'lucide-react';

interface TeacherPortalProps {
  classes: ClassGroup[];
  students: Student[];
  sessions: TeacherSession[];
  messages: TeacherMessage[];
  onRegisterSession: (session: Partial<TeacherSession> & { deviceId: string }) => void;
  onMarkMessageAsRead: (messageId: string, deviceName?: string) => void;
  onOpenStudentModal?: (student: Student, focusField?: 'passport' | 'name' | 'email') => void;
  onToggleStudentPayment?: (studentId: string, currentPaidState: boolean) => void;
  onSaveStudent?: (student: Student) => Promise<void> | void;
}

export const TeacherPortal: React.FC<TeacherPortalProps> = ({
  classes,
  students,
  sessions,
  messages,
  onRegisterSession,
  onMarkMessageAsRead,
  onOpenStudentModal,
}) => {
  // Device detection
  const currentDevice = useMemo(() => detectCurrentDevice(), []);

  // Check if current device is blocked in sessions
  const blockedSession = sessions.find(s => s.deviceId === currentDevice.deviceId && s.isBlocked);

  // Active Project Track: 'ai' (Bir million promter) vs 'developer' (Besh million sun'iy intellekt yetakchilari)
  const [activeProject, setActiveProject] = useState<'ai' | 'developer'>(() => {
    try {
      const saved = localStorage.getItem('teacher_portal_active_project');
      if (saved === 'ai' || saved === 'developer') return saved;
    } catch {}
    return 'ai';
  });

  // Track whether teacher explicitly completed project selection screen on entry
  const [hasChosenProject, setHasChosenProject] = useState<boolean>(() => {
    try {
      return localStorage.getItem('teacher_portal_has_chosen') === 'true';
    } catch {
      return false;
    }
  });

  // Currently selected class inside the active project
  const [selectedClassId, setSelectedClassId] = useState<string>('');

  // Class list search query (NO autoFocus so phone keyboard stays closed!)
  const [classSearchQuery, setClassSearchQuery] = useState('');

  // Inside selected class: search & filter
  const [studentSearchQuery, setStudentSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'certified' | 'pending' | 'error'>('all');

  // Toasts and notifications
  const [copySuccessToast, setCopySuccessToast] = useState('');
  const [winVNotice, setWinVNotice] = useState('');

  // Download states
  const [isZipping, setIsZipping] = useState(false);
  const [zipProgress, setZipProgress] = useState(0);
  const downloadMenuRef = useRef<HTMLDivElement>(null);
  const [isDownloadMenuOpen, setIsDownloadMenuOpen] = useState(false);
  const [isGeneratingUnifiedPdf, setIsGeneratingUnifiedPdf] = useState(false);
  const [unifiedProgressText, setUnifiedProgressText] = useState('');
  const [unifiedProgressPercent, setUnifiedProgressPercent] = useState(0);

  // Modals
  const [isMessagesListOpen, setIsMessagesListOpen] = useState(false);
  const [viewingProblemStudent, setViewingProblemStudent] = useState<Student | null>(null);

  // Telegram Share Modal state after PDF download completes
  const [telegramShareModalData, setTelegramShareModalData] = useState<{
    isOpen: boolean;
    fileName: string;
    className: string;
    teacherName: string;
    studentCount: number;
    pdfBlob?: Blob | null;
  }>({
    isOpen: false,
    fileName: '',
    className: '',
    teacherName: '',
    studentCount: 0,
    pdfBlob: null,
  });

  // Click outside listener to close download menu
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (downloadMenuRef.current && !downloadMenuRef.current.contains(e.target as Node)) {
        setIsDownloadMenuOpen(false);
      }
    };
    if (isDownloadMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDownloadMenuOpen]);

  // Handle selecting a project track
  const handleSelectProjectTrack = (proj: 'ai' | 'developer') => {
    setActiveProject(proj);
    setHasChosenProject(true);
    setSelectedClassId('');
    setClassSearchQuery('');
    try {
      localStorage.setItem('teacher_portal_active_project', proj);
      localStorage.setItem('teacher_portal_has_chosen', 'true');
    } catch {}
  };

  // Switch project track while keeping choice active
  const handleToggleProject = (proj: 'ai' | 'developer') => {
    setActiveProject(proj);
    setSelectedClassId('');
    setClassSearchQuery('');
    try {
      localStorage.setItem('teacher_portal_active_project', proj);
    } catch {}
  };

  // Re-open project selection screen
  const handleReopenProjectSelection = () => {
    setHasChosenProject(false);
    setSelectedClassId('');
    try {
      localStorage.removeItem('teacher_portal_has_chosen');
    } catch {}
  };

  // Filter classes according to active project:
  // 'ai': classes without projectType or projectType !== 'developer'
  // 'developer': classes with projectType === 'developer'
  const visibleClasses = useMemo(() => {
    return classes.filter(c => {
      if (activeProject === 'developer') {
        return c.projectType === 'developer';
      }
      return c.projectType !== 'developer';
    });
  }, [classes, activeProject]);

  // Filter classes by teacher name or class name in search
  const filteredClasses = useMemo(() => {
    const query = classSearchQuery.trim().toLowerCase();
    if (!query) return visibleClasses;
    return visibleClasses.filter(c => 
      c.teacherName.toLowerCase().includes(query) ||
      c.name.toLowerCase().includes(query) ||
      (c.schoolName ? c.schoolName.toLowerCase().includes(query) : false)
    );
  }, [visibleClasses, classSearchQuery]);

  // Currently selected class
  const currentClass = useMemo(() => {
    return classes.find(c => c.id === selectedClassId) || null;
  }, [classes, selectedClassId]);

  // Students for the currently selected class
  const rawClassStudents = useMemo(() => {
    if (!currentClass) return [];
    return students.filter(s => s.classId === currentClass.id);
  }, [students, currentClass]);

  // Harmonized students with track isolation
  const classStudents = useMemo(() => {
    return rawClassStudents.map(st => {
      const trackData = getStudentTrackData(st, activeProject);
      return {
        ...st,
        status: trackData.status,
        certificateLink: trackData.certificateLink,
        certifiedAt: trackData.certifiedAt,
        hasError: trackData.hasError,
        errorReason: trackData.errorReason,
      };
    });
  }, [rawClassStudents, activeProject]);

  // Session registration when class is selected
  const onRegisterSessionRef = useRef(onRegisterSession);
  onRegisterSessionRef.current = onRegisterSession;

  useEffect(() => {
    if (currentClass) {
      onRegisterSessionRef.current({
        id: currentDevice.deviceId,
        deviceId: currentDevice.deviceId,
        teacherName: currentClass.teacherName,
        className: currentClass.name,
        classId: currentClass.id,
        deviceName: currentDevice.deviceName,
        browser: currentDevice.browser,
        os: currentDevice.os,
        screen: currentDevice.screen,
        lastActiveAt: new Date().toISOString(),
      });
    }
  }, [currentClass?.id, currentDevice.deviceId, currentDevice.deviceName, currentDevice.browser, currentDevice.os, currentDevice.screen]);

  // Sequential Multi-Item Clipboard Copy for Windows History (Win + V)
  const handleSequentialCopyForWinV = async (student: Student) => {
    const { formattedDate, number, series } = parseMetrikaComponents(student.birthDate, student.passportOrId);
    
    if (!formattedDate && !number && !series) {
      setCopySuccessToast("⚠️ Nusxalash uchun sana yoki pasport ma'lumotlari topilmadi");
      setTimeout(() => setCopySuccessToast(''), 3000);
      return;
    }

    try {
      setWinVNotice(`⏳ 1/3: Tug'ilgan sana nusxalanmoqda ("${formattedDate}")...`);
      await navigator.clipboard.writeText(formattedDate || '');
      await new Promise(r => setTimeout(r, 260));

      setWinVNotice(`⏳ 2/3: Metrika raqami nusxalanmoqda ("${number}")...`);
      await navigator.clipboard.writeText(number || '');
      await new Promise(r => setTimeout(r, 260));

      setWinVNotice(`⏳ 3/3: Metrika seriyasi nusxalanmoqda ("${series}")...`);
      await navigator.clipboard.writeText(series || '');

      setWinVNotice(`⚡ Tayyor! Win + V tarixiga yozildi: Seriya (${series}) → Raqam (${number}) → Sana (${formattedDate})`);
      setCopySuccessToast(`⚡ Win + V: Seriya, Raqam va Sana alohida nusxalandi!`);
      setTimeout(() => setWinVNotice(''), 4500);
      setTimeout(() => setCopySuccessToast(''), 3500);
    } catch {
      const fallback = [series, number, formattedDate].filter(Boolean).join(' ');
      navigator.clipboard.writeText(fallback);
      setCopySuccessToast(`📋 Nusxalandi: ${fallback}`);
      setTimeout(() => setCopySuccessToast(''), 3000);
    }
  };

  // If device is blocked by administrator, show blocked overlay
  if (blockedSession) {
    return (
      <BlockedAccessOverlay
        session={blockedSession}
        onRefresh={() => window.location.reload()}
      />
    );
  }

  // Statistics for selected class
  const totalStudents = classStudents.length;
  const certifiedStudents = classStudents.filter(s => s.status === 'certified');
  const certifiedCount = certifiedStudents.length;
  const errorStudents = classStudents.filter(s => s.hasError || s.status === 'error');
  const errorCount = errorStudents.length;
  const pendingCount = totalStudents - certifiedCount - errorCount;
  const completionRate = totalStudents > 0 ? Math.round((certifiedCount / totalStudents) * 100) : 0;

  // Financials: 5 000 UZS for 'ai' (Promter) vs 7 000 UZS for 'developer' (5M AI Yetakchilari)
  const pricePerStudent = activeProject === 'developer' ? 7000 : (currentClass?.pricePerStudent || 5000);
  const totalDue = certifiedCount * pricePerStudent;
  const paidAmount = currentClass?.paidAmount || 0;
  const remainingDebt = Math.max(0, totalDue - paidAmount);
  const isFullyPaid = totalDue > 0 && paidAmount >= totalDue;

  // Filter students within current class
  const filteredStudents = classStudents.filter(st => {
    const q = studentSearchQuery.trim().toLowerCase();
    const matchesSearch = !q || 
      st.fullName.toLowerCase().includes(q) ||
      (st.passportOrId ? st.passportOrId.toLowerCase().includes(q) : false) ||
      (st.assignedLogin ? st.assignedLogin.toLowerCase().includes(q) : false) ||
      (st.assignedEmail ? st.assignedEmail.toLowerCase().includes(q) : false);

    if (!matchesSearch) return false;

    if (statusFilter === 'certified') return st.status === 'certified';
    if (statusFilter === 'pending') return st.status !== 'certified' && !st.hasError && st.status !== 'error';
    if (statusFilter === 'error') return st.hasError || st.status === 'error';
    return true;
  });

  // Copy all certificates to clipboard (Formatted for Telegram)
  const handleCopyAllCertificates = async () => {
    if (!currentClass) return;

    if (certifiedCount === 0) {
      setCopySuccessToast("Hozircha sertifikat olgan o'quvchilar mavjud emas");
      setTimeout(() => setCopySuccessToast(''), 3000);
      return;
    }

    const text = formatClassCertificatesForClipboard(classStudents, currentClass);
    try {
      await navigator.clipboard.writeText(text);
      confetti({ particleCount: 50, spread: 70, origin: { y: 0.6 } });
      setCopySuccessToast(`✅ ${currentClass.name} sinfi sertifikatlari nusxalandi! Telegramga joylashingiz mumkin.`);
      setTimeout(() => setCopySuccessToast(''), 4000);
    } catch {
      setCopySuccessToast("⚠️ Nusxalashda xatolik yuz berdi. Iltimos qaytadan urining.");
      setTimeout(() => setCopySuccessToast(''), 4000);
    }
  };

  // Bulk ZIP Download
  const handleDownloadZip = async () => {
    if (!currentClass || certifiedCount === 0) return;

    setIsZipping(true);
    setZipProgress(0);

    try {
      await downloadAllCertificatesAsZip(classStudents, currentClass, (pct) => {
        setZipProgress(Math.round(pct));
      });
      confetti({ particleCount: 40 });
    } catch (err) {
      console.error(err);
      setCopySuccessToast("⚠️ Fayllarni arxivlashda xatolik yuz berdi");
      setTimeout(() => setCopySuccessToast(''), 4000);
    } finally {
      setIsZipping(false);
      setZipProgress(0);
    }
  };

  // Generate Unified Combined PDF
  const handleGenerateUnifiedPdf = async () => {
    if (!currentClass || certifiedCount === 0) return;
    setIsDownloadMenuOpen(false);
    setIsGeneratingUnifiedPdf(true);
    setUnifiedProgressPercent(0);
    setUnifiedProgressText("Jarayon boshlanmoqda...");

    try {
      const result = await generateUnifiedCertificatesPdf(classStudents, currentClass, (statusText, current, total) => {
        setUnifiedProgressText(statusText);
        setUnifiedProgressPercent(Math.round((current / total) * 100));
      });
      confetti({ particleCount: 60, spread: 80, origin: { y: 0.6 } });
      setCopySuccessToast(`✅ ${currentClass.name} sinfi uchun yagona birlashtirilgan PDF tayyorlandi!`);
      setTimeout(() => setCopySuccessToast(''), 4000);

      if (result?.filename) {
        setTelegramShareModalData({
          isOpen: true,
          fileName: result.filename,
          className: currentClass.name,
          teacherName: currentClass.teacherName,
          studentCount: certifiedCount,
          pdfBlob: result.blob || null,
        });
      }
    } catch (err) {
      console.error("Unified PDF generation error:", err);
      setCopySuccessToast("⚠️ PDF yaratishda xatolik yuz berdi");
      setTimeout(() => setCopySuccessToast(''), 4000);
    } finally {
      setIsGeneratingUnifiedPdf(false);
      setUnifiedProgressPercent(0);
      setUnifiedProgressText('');
    }
  };

  // Messages for this class
  const classMessages = currentClass ? messages.filter(m => m.classId === currentClass.id) : [];
  const unreadMessage = classMessages.find(m => !m.isRead);

  // Counts for tracks
  const aiClassesCount = classes.filter(c => c.projectType !== 'developer').length;
  const devClassesCount = classes.filter(c => c.projectType === 'developer').length;

  // =========================================================================
  // VIEW 1: PROJECT TRACK SELECTION ON ENTRY (Asked immediately on entry!)
  // =========================================================================
  if (!hasChosenProject) {
    return (
      <div className="max-w-3xl mx-auto py-6 sm:py-10 px-3 sm:px-4 space-y-6 animate-fade-in">
        
        {/* Welcome Greeting Card */}
        <div className="apple-glass-elevated rounded-3xl p-6 sm:p-9 shadow-xl border border-white/80 text-center space-y-4 relative overflow-hidden bg-white/90">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-sky-500 text-white flex items-center justify-center mx-auto shadow-lg shadow-blue-500/25">
            <School className="w-8 h-8 text-white" />
          </div>

          <div className="space-y-2 max-w-xl mx-auto">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200/80 text-xs font-semibold">
              <Sparkles className="w-3.5 h-3.5 text-blue-600" />
              <span>Sinf Rahbarlari & O'qituvchilar Portali</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Assalomu alaykum, hurmatli ustoz!
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              Qaysi loyiha bo'yicha sertifikatlar va o'quvchilar ro'yxatini ko'rmoqchisiz? Davom etish uchun quyidagi yo'nalishlardan birini tanlang:
            </p>
          </div>

          {/* Two Big Interactive Project Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 text-left">
            
            {/* Project 1: Bir Million Promter */}
            <button
              type="button"
              onClick={() => handleSelectProjectTrack('ai')}
              className="p-5 sm:p-6 rounded-2xl border-2 border-blue-200 bg-gradient-to-br from-blue-50/90 via-white to-sky-50/50 hover:border-blue-600 hover:shadow-xl hover:shadow-blue-500/15 transition-all cursor-pointer group relative text-left active:scale-[0.98] flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="w-12 h-12 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20 group-hover:scale-105 transition-transform">
                    <span className="text-xl">🚀</span>
                  </div>
                  <span className="text-xs font-extrabold px-2.5 py-1 rounded-full bg-blue-100 text-blue-800 border border-blue-200">
                    5 000 so'm
                  </span>
                </div>

                <div>
                  <h3 className="text-base sm:text-lg font-bold text-slate-900 group-hover:text-blue-700 transition-colors">
                    Bir Million Promter
                  </h3>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                    Xalqaro Coursera ta'lim platformasi hamda AI Leaders dasturi bo'yicha beriladigan sertifikatlar.
                  </p>
                </div>
              </div>

              <div className="pt-4 mt-4 border-t border-blue-200/60 flex items-center justify-between text-xs font-bold text-blue-700">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                  <span>{aiClassesCount} ta sinf mavjud</span>
                </span>
                <div className="flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                  <span>Kirish</span>
                  <ChevronRight className="w-4 h-4" />
                </div>
              </div>
            </button>

            {/* Project 2: Besh Million Sun'iy Intellekt Yetakchilari */}
            <button
              type="button"
              onClick={() => handleSelectProjectTrack('developer')}
              className="p-5 sm:p-6 rounded-2xl border-2 border-indigo-200 bg-gradient-to-br from-purple-50/90 via-white to-indigo-50/50 hover:border-indigo-600 hover:shadow-xl hover:shadow-indigo-500/15 transition-all cursor-pointer group relative text-left active:scale-[0.98] flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-white flex items-center justify-center shadow-md shadow-purple-500/20 group-hover:scale-105 transition-transform">
                    <span className="text-xl">💡</span>
                  </div>
                  <span className="text-xs font-extrabold px-2.5 py-1 rounded-full bg-purple-100 text-purple-900 border border-purple-200">
                    7 000 so'm
                  </span>
                </div>

                <div>
                  <h3 className="text-base sm:text-lg font-bold text-slate-900 group-hover:text-indigo-700 transition-colors">
                    Besh Million AI Yetakchilari
                  </h3>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                    omp.aistudy.uz tizimi orqali Telegram botda tasdiqlanadigan va login bilan beriladigan sertifikatlar.
                  </p>
                </div>
              </div>

              <div className="pt-4 mt-4 border-t border-indigo-200/60 flex items-center justify-between text-xs font-bold text-indigo-700">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-indigo-600"></span>
                  <span>{devClassesCount} ta sinf mavjud</span>
                </span>
                <div className="flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                  <span>Kirish</span>
                  <ChevronRight className="w-4 h-4" />
                </div>
              </div>
            </button>

          </div>

          {/* Reassuring note */}
          <div className="pt-2 text-center text-xs text-slate-500">
            Istalgan vaqt yuqori paneldan loyihani bir teginishda almashtirishingiz mumkin.
          </div>

        </div>

      </div>
    );
  }

  // =========================================================================
  // VIEW 2: CLASS SELECTION SCREEN (Clean list on the main page, NO phone-freezing modal!)
  // =========================================================================
  if (!selectedClassId || !currentClass) {
    const isDev = activeProject === 'developer';

    return (
      <div className="max-w-4xl mx-auto py-5 sm:py-8 px-3 sm:px-4 space-y-5 animate-fade-in">
        
        {/* Floating Success Toast */}
        {copySuccessToast && (
          <div className="fixed top-4 left-3 right-3 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 z-50 p-4 rounded-2xl bg-slate-900/95 backdrop-blur-xl text-white font-medium text-xs sm:text-sm shadow-2xl flex items-center justify-center gap-2.5 border border-slate-700 animate-fade-in">
            <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span>{copySuccessToast}</span>
          </div>
        )}

        {/* Top Navigation & Project Switcher */}
        <div className="apple-glass rounded-2xl p-4 sm:p-5 shadow-xs border border-slate-200/90 space-y-4 bg-white">
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Faol Yo'nalish
                </span>
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-900">
                {isDev ? "Besh Million Sun'iy Intellekt Yetakchilari" : "Bir Million Promter (Coursera)"}
              </h2>
            </div>

            {/* Change project button */}
            <button
              type="button"
              onClick={handleReopenProjectSelection}
              className="px-3.5 py-2 apple-btn-secondary text-slate-700 text-xs font-bold rounded-xl flex items-center gap-1.5 self-start sm:self-auto cursor-pointer hover:border-blue-400"
            >
              <RefreshCw className="w-3.5 h-3.5 text-blue-600" />
              <span>Loyihani almashtirish</span>
            </button>
          </div>

          {/* Segmented Quick Switcher */}
          <div className="grid grid-cols-2 gap-2 p-1.5 bg-slate-100/90 rounded-2xl border border-slate-200/80">
            <button
              type="button"
              onClick={() => handleToggleProject('ai')}
              className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                activeProject === 'ai'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25 ring-1 ring-blue-500'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              <span>🚀 Bir Million Promter</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                activeProject === 'ai' ? 'bg-white/25 text-white' : 'bg-slate-200 text-slate-700'
              }`}>
                {aiClassesCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleToggleProject('developer')}
              className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                activeProject === 'developer'
                  ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-500/25 ring-1 ring-purple-500'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              <span>💡 5M AI Yetakchilari</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                activeProject === 'developer' ? 'bg-white/25 text-white' : 'bg-slate-200 text-slate-700'
              }`}>
                {devClassesCount}
              </span>
            </button>
          </div>

          {/* Clean Search Input (NO autoFocus to prevent accidental keyboard opens!) */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              placeholder="O'z sinfingizni topish: ustoz ismi yoki sinf (masalan: 9-B)..."
              value={classSearchQuery}
              onChange={e => setClassSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

        </div>

        {/* Classes Responsive Grid */}
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-500 px-1 font-medium">
            <span>
              Topilgan sinflar: <strong className="text-slate-900 font-bold">{filteredClasses.length}</strong> ta
            </span>
            <span>Sinfingiz ustiga bosib kiring</span>
          </div>

          {filteredClasses.length === 0 ? (
            <div className="apple-glass rounded-2xl p-8 text-center space-y-3 border border-slate-200 bg-white">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-500 flex items-center justify-center mx-auto">
                <School className="w-7 h-7" />
              </div>
              <h3 className="text-base font-bold text-slate-900">
                {classSearchQuery
                  ? `"${classSearchQuery}" bo'yicha sinf topilmadi`
                  : `"${isDev ? "Besh Million Sun'iy Intellekt Yetakchilari" : "Bir Million Promter"}" yo'nalishida hali sinflar yo'q`}
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                {classSearchQuery
                  ? "Iltimos, ustoz ismi yoki sinf nomini tekshirib qaytadan urinib ko'ring."
                  : "Ma'muriyat sinf yuklaganda yoki ushbu yo'nalishga import qilganda sinflar shu yerda aks etadi."}
              </p>
              {!classSearchQuery && (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => handleToggleProject(isDev ? 'ai' : 'developer')}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-xs"
                  >
                    <span>{isDev ? "Bir Million Promter sinflarini ko'rish" : "5M AI Yetakchilari sinflarini ko'rish"}</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {filteredClasses.map(c => {
                const cStudents = students.filter(s => s.classId === c.id);
                const cCertified = cStudents.filter(s => {
                  const td = getStudentTrackData(s, activeProject);
                  return td.status === 'certified';
                }).length;
                const total = cStudents.length;
                const pct = total > 0 ? Math.round((cCertified / total) * 100) : 0;
                const price = activeProject === 'developer' ? 7000 : (c.pricePerStudent || 5000);
                const debt = Math.max(0, (cCertified * price) - (c.paidAmount || 0));

                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setSelectedClassId(c.id);
                      setStudentSearchQuery('');
                      setStatusFilter('all');
                    }}
                    className="p-4 rounded-2xl border border-slate-200/90 bg-white hover:border-blue-500 hover:shadow-lg hover:shadow-blue-500/10 transition-all cursor-pointer text-left group flex flex-col justify-between space-y-3 active:scale-[0.98] min-h-[110px]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white font-black text-sm flex items-center justify-center flex-shrink-0 shadow-sm group-hover:scale-105 transition-transform">
                          {c.name}
                        </div>
                        <div className="min-w-0">
                          {c.isExternalSchool && (
                            <span className="text-[10px] font-bold text-rose-600 bg-rose-50 border border-rose-200 px-1.5 py-0.2 rounded inline-block mb-0.5">
                              {c.schoolName || 'Boshqa maktab'}
                            </span>
                          )}
                          <h3 className="font-bold text-slate-900 text-sm group-hover:text-blue-700 truncate">
                            {c.teacherName}
                          </h3>
                          <span className="text-[11px] text-slate-500 block truncate">
                            {c.name} sinf rahbari
                          </span>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-blue-600 group-hover:translate-x-0.5 transition-all flex-shrink-0 mt-1" />
                    </div>

                    {/* Progress & Counts */}
                    <div className="space-y-1.5 pt-2 border-t border-slate-100">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-500 font-medium">
                          {total} o'quvchi
                        </span>
                        <span className="font-bold text-slate-900">
                          {cCertified} ta tayyor <span className="text-blue-600 font-normal">({pct}%)</span>
                        </span>
                      </div>

                      <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                        <div 
                          className="bg-gradient-to-r from-blue-600 to-emerald-500 h-full rounded-full transition-all duration-300"
                          style={{ width: `${pct}%` }}
                        ></div>
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                          debt > 0 
                            ? 'bg-amber-50 text-amber-800 border border-amber-200' 
                            : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        }`}>
                          {debt > 0 ? `${debt.toLocaleString('uz-UZ')} so'm qarz` : "To'langan ✅"}
                        </span>
                        <span className="text-[11px] font-bold text-blue-600 group-hover:underline">
                          Ochish →
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

      </div>
    );
  }

  // =========================================================================
  // VIEW 3: CLASS DASHBOARD (Inside Selected Class)
  // =========================================================================
  return (
    <div className="max-w-4xl mx-auto space-y-4 pb-16 animate-fade-in px-3 sm:px-4">
      
      {/* Toast Alert */}
      {copySuccessToast && (
        <div className="fixed top-4 left-3 right-3 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 z-50 p-4 rounded-2xl bg-slate-900/95 backdrop-blur-xl text-white font-medium text-xs sm:text-sm shadow-2xl flex items-center justify-center gap-2.5 border border-slate-700 animate-fade-in">
          <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <span>{copySuccessToast}</span>
        </div>
      )}

      {/* Floating Win+V Feedback Alert */}
      {winVNotice && (
        <div className="fixed top-16 left-3 right-3 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 z-50 p-3.5 rounded-2xl bg-gradient-to-r from-blue-900 via-indigo-900 to-purple-950 text-white font-semibold text-xs shadow-2xl flex items-center justify-center gap-2 border border-blue-400/40 animate-fade-in">
          <Zap className="w-4 h-4 text-amber-300 animate-bounce flex-shrink-0" />
          <span>{winVNotice}</span>
        </div>
      )}

      {/* Top Class Banner in Frosted Glass */}
      <div className="apple-glass-elevated rounded-2xl p-5 sm:p-6 shadow-md space-y-5 bg-white">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/60 pb-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-13 h-13 rounded-2xl apple-btn-blue font-black text-xl flex items-center justify-center flex-shrink-0 shadow-md shadow-blue-500/25">
              {currentClass.name}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-0.5">
                <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md border ${
                  activeProject === 'developer'
                    ? 'bg-purple-100 text-purple-900 border-purple-300'
                    : 'bg-blue-100 text-blue-900 border-blue-300'
                }`}>
                  {activeProject === 'developer' ? '💡 5M AI Yetakchilari' : '🚀 Bir Million Promter'}
                </span>
                {currentClass.isExternalSchool && (
                  <span className="text-[10px] font-black text-rose-600 uppercase bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                    {currentClass.schoolName || 'Boshqa maktab'}
                  </span>
                )}
              </div>
              <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 truncate">
                {currentClass.teacherName}
              </h1>
              <span className="text-xs text-slate-500">
                {currentClass.name} sinfi • {pricePerStudent.toLocaleString('uz-UZ')} so'm / o'quvchi
              </span>
            </div>
          </div>

          {/* Action buttons in header */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Back to all classes */}
            <button
              type="button"
              onClick={() => {
                setSelectedClassId('');
                setClassSearchQuery('');
              }}
              className="px-3.5 py-2 apple-btn-secondary rounded-xl text-slate-700 hover:text-slate-900 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 shadow-2xs"
              title="Barcha sinflar ro'yxatiga qaytish"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Sinflar</span>
            </button>

            {/* Change project track */}
            <button
              type="button"
              onClick={handleReopenProjectSelection}
              className="px-3 py-2 apple-btn-secondary hover:border-blue-400 rounded-xl text-xs font-bold text-slate-700 flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 shadow-2xs"
              title="Loyihani almashtirish"
            >
              <RefreshCw className="w-3.5 h-3.5 text-blue-600" />
              <span>Loyiha</span>
            </button>

            {/* Messages */}
            <button
              type="button"
              onClick={() => setIsMessagesListOpen(true)}
              className="px-3 py-2 apple-btn-secondary rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 relative"
              title="Ma'muriyatdan xabarlar"
            >
              <Bell className="w-3.5 h-3.5 text-amber-600" />
              <span>Xabarlar</span>
              {classMessages.length > 0 && (
                <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${
                  unreadMessage ? 'bg-amber-500 text-white animate-pulse' : 'bg-slate-200 text-slate-700'
                }`}>
                  {classMessages.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* 3 Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="apple-glass-card rounded-xl p-4 bg-slate-50/60 border border-slate-200">
            <div className="flex items-center justify-between text-slate-500 mb-1.5">
              <span className="text-xs font-semibold">Jami O'quvchilar</span>
              <Users className="w-4 h-4 text-slate-600" />
            </div>
            <div className="text-2xl font-black text-slate-900">
              {totalStudents} <span className="text-xs text-slate-500 font-normal">nafar</span>
            </div>
            <div className="w-full bg-slate-200 h-1.5 rounded-full mt-2.5 overflow-hidden">
              <div className="bg-slate-700 h-full rounded-full" style={{ width: '100%' }}></div>
            </div>
          </div>

          <div className="apple-glass-card rounded-xl p-4 bg-emerald-50/40 border border-emerald-200">
            <div className="flex items-center justify-between text-emerald-800 mb-1.5">
              <span className="text-xs font-semibold">Tayyor Sertifikatlar</span>
              <Award className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-2xl font-black text-emerald-950">
              {certifiedCount} <span className="text-xs text-emerald-700 font-normal">({completionRate}%)</span>
            </div>
            <div className="w-full bg-emerald-200 h-1.5 rounded-full mt-2.5 overflow-hidden">
              <div 
                className="bg-emerald-600 h-full rounded-full transition-all duration-300"
                style={{ width: `${completionRate}%` }}
              ></div>
            </div>
          </div>

          <div className="apple-glass-card rounded-xl p-4 bg-blue-50/40 border border-blue-200">
            <div className="flex items-center justify-between text-blue-900 mb-1.5">
              <span className="text-xs font-semibold">To'lov Holati</span>
              <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                isFullyPaid ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'
              }`}>
                {isFullyPaid ? 'To\'langan' : remainingDebt > 0 ? 'Qarz bor' : 'Kutilmoqda'}
              </span>
            </div>
            <div className="text-xl sm:text-2xl font-black text-slate-900">
              {totalDue.toLocaleString('uz-UZ')} <span className="text-xs text-slate-500 font-normal">so'm</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-2 flex justify-between">
              <span>To'langan: {paidAmount.toLocaleString('uz-UZ')} so'm</span>
              {remainingDebt > 0 && <span className="text-amber-700 font-bold">Qarz: {remainingDebt.toLocaleString('uz-UZ')} so'm</span>}
            </div>
          </div>
        </div>

        {/* Action Buttons: Copy for Telegram & Download PDF/ZIP */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2 border-t border-slate-200/60">
          <button
            type="button"
            onClick={handleCopyAllCertificates}
            className="py-3 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md shadow-blue-500/20 active:scale-95 transition-all cursor-pointer"
          >
            <Copy className="w-4 h-4" />
            <span>📲 Telegram guruhga nusxalash ({certifiedCount} ta)</span>
          </button>

          {/* Download Menu */}
          <div className="relative" ref={downloadMenuRef}>
            <button
              type="button"
              onClick={() => setIsDownloadMenuOpen(prev => !prev)}
              disabled={certifiedCount === 0}
              className={`w-full sm:w-auto py-3 px-5 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md ${
                certifiedCount === 0
                  ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                  : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-emerald-500/20 active:scale-95'
              }`}
            >
              <FileStack className="w-4 h-4" />
              <span>Sertifikatlarni yuklab olish ({certifiedCount} ta)</span>
            </button>

            {isDownloadMenuOpen && (
              <div className="absolute right-0 bottom-full sm:bottom-auto sm:top-full mt-2 w-72 sm:w-80 bg-white border border-slate-200 rounded-2xl shadow-2xl p-3 space-y-2 z-50 animate-fade-in">
                <button
                  type="button"
                  onClick={handleGenerateUnifiedPdf}
                  className="w-full p-3 rounded-xl border border-indigo-200 bg-indigo-50/70 hover:bg-indigo-100/70 text-left flex items-start gap-3 transition-all cursor-pointer group"
                >
                  <FileStack className="w-5 h-5 text-indigo-700 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="text-xs sm:text-sm font-bold text-indigo-950 block">
                      Yagona Birlashtirilgan PDF
                    </span>
                    <p className="text-[11px] text-slate-600 mt-0.5">
                      Familiya bo'yicha tartiblangan (A-Z) bitta yagona PDF fayl
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsDownloadMenuOpen(false);
                    handleDownloadZip();
                  }}
                  className="w-full p-3 rounded-xl border border-slate-200 hover:border-blue-400 hover:bg-blue-50/60 text-left flex items-start gap-3 transition-all cursor-pointer group"
                >
                  <FolderArchive className="w-5 h-5 text-blue-700 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="text-xs sm:text-sm font-bold text-slate-900 block">
                      ZIP arxiv (Alohida fayllar)
                    </span>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Barcha o'quvchilar sertifikati alohida PDF sifatida bitta ZIP arxivda
                    </p>
                  </div>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Live Progress Card for PDF */}
        {isGeneratingUnifiedPdf && (
          <div className="p-3.5 rounded-xl bg-indigo-50 border border-indigo-200 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-indigo-950 flex items-center gap-1.5">
                <RefreshCw className="w-3.5 h-3.5 text-indigo-600 animate-spin" />
                <span>{unifiedProgressText}</span>
              </span>
              <span className="font-mono font-bold text-indigo-700">{unifiedProgressPercent}%</span>
            </div>
            <div className="w-full bg-indigo-200 h-1.5 rounded-full overflow-hidden">
              <div className="bg-indigo-600 h-full rounded-full transition-all" style={{ width: `${unifiedProgressPercent}%` }}></div>
            </div>
          </div>
        )}

        {/* Live Progress Card for ZIP */}
        {isZipping && (
          <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-blue-950 flex items-center gap-1.5">
                <RefreshCw className="w-3.5 h-3.5 text-blue-600 animate-spin" />
                <span>ZIP arxiv tayyorlanmoqda...</span>
              </span>
              <span className="font-mono font-bold text-blue-700">{zipProgress}%</span>
            </div>
            <div className="w-full bg-blue-200 h-1.5 rounded-full overflow-hidden">
              <div className="bg-blue-600 h-full rounded-full transition-all" style={{ width: `${zipProgress}%` }}></div>
            </div>
          </div>
        )}

      </div>

      {/* Filter and Search Bar for Students */}
      <div className="apple-glass rounded-xl p-3 shadow-xs space-y-3 bg-white border border-slate-200">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-blue-600 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="O'quvchi F.I.SH yoki ID raqami bo'yicha qidirish..."
              value={studentSearchQuery}
              onChange={e => setStudentSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 text-xs sm:text-sm focus:outline-none focus:bg-white focus:border-blue-500"
            />
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex-shrink-0 transition-all cursor-pointer ${
                statusFilter === 'all' ? 'bg-blue-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Barchasi ({totalStudents})
            </button>

            <button
              onClick={() => setStatusFilter('certified')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex-shrink-0 transition-all cursor-pointer ${
                statusFilter === 'certified' ? 'bg-emerald-600 text-white shadow-xs' : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
              }`}
            >
              Tayyor ({certifiedCount})
            </button>

            <button
              onClick={() => setStatusFilter('pending')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex-shrink-0 transition-all cursor-pointer ${
                statusFilter === 'pending' ? 'bg-amber-600 text-white shadow-xs' : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
              }`}
            >
              Kutilmoqda ({pendingCount})
            </button>

            {errorCount > 0 && (
              <button
                onClick={() => setStatusFilter('error')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex-shrink-0 transition-all cursor-pointer ${
                  statusFilter === 'error' ? 'bg-rose-600 text-white shadow-xs' : 'bg-rose-50 text-rose-800 hover:bg-rose-100'
                }`}
              >
                Xatolik ({errorCount})
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Students List Cards */}
      <div className="space-y-2.5">
        {filteredStudents.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-xs apple-glass rounded-xl border border-slate-200 bg-white">
            Qidiruv bo'yicha o'quvchilar topilmadi.
          </div>
        ) : (
          filteredStudents.map((st, idx) => {
            const isCertified = st.status === 'certified';
            const isError = st.hasError || st.status === 'error';
            const metrika = parseMetrikaComponents(st.birthDate, st.passportOrId);

            return (
              <div
                key={st.id}
                className="apple-glass-card hover:border-blue-400/60 rounded-xl p-3.5 sm:p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all bg-white border border-slate-200"
              >
                {/* Student Info */}
                <div 
                  className="flex items-start gap-3 min-w-0 flex-1 select-none"
                  onDoubleClick={() => onOpenStudentModal?.(st)}
                  title="2 marta tez bosing — to'liq ma'lumotlarni ko'rish yoki tahrirlash"
                >
                  <span className="w-6 h-6 rounded-md bg-blue-50 border border-blue-200/80 text-blue-700 font-mono text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                    {idx + 1}
                  </span>
                  
                  <div className="min-w-0 space-y-1">
                    <h2 
                      onClick={(e) => {
                        e.stopPropagation();
                        navigator.clipboard.writeText(st.fullName);
                        setCopySuccessToast(`📋 Nusxalandi: "${st.fullName}"`);
                        setTimeout(() => setCopySuccessToast(''), 1500);
                      }}
                      className="font-bold text-slate-900 text-sm sm:text-base leading-snug truncate hover:text-blue-600 transition-colors cursor-pointer"
                      title="1 marta bosing — ism nusxalanadi"
                    >
                      {st.fullName}
                    </h2>

                    {/* Metrika Chips & Sequential Win+V Button */}
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      {metrika.formattedDate && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(metrika.formattedDate);
                            setCopySuccessToast(`📋 Tug'ilgan sana nusxalandi: "${metrika.formattedDate}"`);
                            setTimeout(() => setCopySuccessToast(''), 1500);
                          }}
                          className="px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-mono text-[11px] cursor-pointer"
                          title="Faqat tug'ilgan sanani nusxalash"
                        >
                          📅 {metrika.formattedDate}
                        </button>
                      )}

                      {metrika.number && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(metrika.number);
                            setCopySuccessToast(`📋 Raqam nusxalandi: "${metrika.number}"`);
                            setTimeout(() => setCopySuccessToast(''), 1500);
                          }}
                          className="px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-mono text-[11px] cursor-pointer"
                          title="Faqat 7 talik raqamni nusxalash"
                        >
                          🔢 {metrika.number}
                        </button>
                      )}

                      {metrika.series && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(metrika.series);
                            setCopySuccessToast(`📋 Seriya nusxalandi: "${metrika.series}"`);
                            setTimeout(() => setCopySuccessToast(''), 1500);
                          }}
                          className="px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-mono text-[11px] font-bold cursor-pointer"
                          title="Faqat seriyani nusxalash"
                        >
                          🔤 {metrika.series}
                        </button>
                      )}

                      {/* Dedicated [⚡ Win+V] Button */}
                      {(metrika.formattedDate || metrika.number || metrika.series) && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSequentialCopyForWinV(st);
                          }}
                          className="px-2 py-0.5 rounded-md bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-mono text-[10px] font-bold cursor-pointer shadow-2xs flex items-center gap-1 active:scale-95"
                          title="Sana, Raqam va Seriyani alohida-alohida Windows xotirasiga yozadi (Win+V orqali qulay joylash)"
                        >
                          <Zap className="w-2.5 h-2.5 text-amber-300" />
                          <span>Win+V</span>
                        </button>
                      )}

                      {/* Track specific Login / Email */}
                      {activeProject === 'developer' ? (
                        st.assignedLogin && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(st.assignedLogin!);
                              setCopySuccessToast(`📋 Login nusxalandi: "${st.assignedLogin}"`);
                              setTimeout(() => setCopySuccessToast(''), 1500);
                            }}
                            className="px-2 py-0.5 rounded-md bg-purple-50 hover:bg-purple-100 text-purple-900 border border-purple-200 font-mono text-[11px] font-bold cursor-pointer flex items-center gap-1"
                            title="Logini nusxalash"
                          >
                            <Key className="w-3 h-3 text-purple-700" />
                            <span>{st.assignedLogin}</span>
                          </button>
                        )
                      ) : (
                        st.assignedEmail && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(st.assignedEmail!);
                              setCopySuccessToast(`📋 Email nusxalandi: "${st.assignedEmail}"`);
                              setTimeout(() => setCopySuccessToast(''), 1500);
                            }}
                            className="px-2 py-0.5 rounded-md bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-200 font-mono text-[11px] cursor-pointer flex items-center gap-1"
                            title="Emailni nusxalash"
                          >
                            <Mail className="w-3 h-3 text-blue-700" />
                            <span>{st.assignedEmail}</span>
                          </button>
                        )
                      )}
                    </div>
                  </div>
                </div>

                {/* Status Badges & Action Buttons */}
                <div className="flex items-center gap-2 self-end sm:self-center flex-shrink-0">
                  {isCertified ? (
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1.5 shadow-xs">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Sertifikat tayyor</span>
                      </span>

                      {st.certificateLink && (
                        <a
                          href={st.certificateLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors border border-blue-200/80 cursor-pointer"
                          title="Sertifikatni ochish"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
                    </div>
                  ) : isError ? (
                    <button
                      type="button"
                      onClick={() => setViewingProblemStudent(st)}
                      className="px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-800 border border-rose-200 flex items-center gap-1.5 cursor-pointer hover:bg-rose-100 transition-colors"
                    >
                      <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                      <span>Muammo (Ko'rish)</span>
                    </button>
                  ) : (
                    <span className="px-2.5 py-1 rounded-full text-xs font-medium text-slate-500 bg-slate-100 border border-slate-200 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span>Kutilmoqda</span>
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Teacher Incoming Notice Modal: pops up automatically if unread message exists */}
      {unreadMessage && (
        <TeacherIncomingNoticeModal
          message={unreadMessage}
          isOpen={true}
          onMarkAsRead={(msgId) => onMarkMessageAsRead(msgId, currentDevice.deviceName)}
        />
      )}

      {/* Teacher Messages History List Modal */}
      {isMessagesListOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="relative w-full max-w-lg bg-white border border-slate-200 rounded-2xl shadow-2xl p-5 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200/70 flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center">
                  <Bell className="w-4 h-4 text-amber-700" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Ma'muriyatdan Xabarlar</h3>
                  <p className="text-[11px] text-slate-500">{currentClass.name} sinfi uchun yuborilgan barcha xabarlar</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsMessagesListOpen(false)}
                className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 overflow-y-auto flex-1 pr-1">
              {classMessages.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  Hozircha ma'muriyatdan xabar yo'q.
                </div>
              ) : (
                classMessages.map(msg => (
                  <div key={msg.id} className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 text-xs">{msg.title}</span>
                      <span className="text-[10px] text-slate-400">
                        {new Date(msg.createdAt).toLocaleDateString('uz-UZ')}
                      </span>
                    </div>
                    <p className="text-xs text-slate-700 whitespace-pre-wrap">{msg.content}</p>
                    {msg.imageUrl && (
                      <img 
                        src={msg.imageUrl} 
                        alt="Rasm" 
                        className="max-h-40 rounded-lg border border-slate-200 object-contain"
                      />
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="pt-2 border-t border-slate-200/70 flex justify-end">
              <button
                type="button"
                onClick={() => setIsMessagesListOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
              >
                Yopish
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Problem View Modal for Teacher */}
      {viewingProblemStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="relative w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200/70">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-rose-600" />
                <h3 className="font-bold text-slate-900 text-sm">O'quvchi ma'lumotlaridagi muammo</h3>
              </div>
              <button
                type="button"
                onClick={() => setViewingProblemStudent(null)}
                className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <span className="text-xs text-slate-500 block">O'quvchi F.I.SH:</span>
                <span className="text-sm font-bold text-slate-900">{viewingProblemStudent.fullName}</span>
              </div>

              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-950 text-xs leading-relaxed">
                <b>Mas'ul admin izohi:</b> {viewingProblemStudent.errorReason || "O'quvchi kiritgan ma'lumotlarda nomuvofiqlik aniqlandi."}
              </div>

              {viewingProblemStudent.errorImage && (
                <div className="space-y-1">
                  <span className="text-xs text-slate-500 block font-medium">Asos skrinshoti:</span>
                  <img
                    src={viewingProblemStudent.errorImage}
                    alt="Xatolik skrinshoti"
                    className="w-full max-h-60 object-contain rounded-xl border border-slate-300 bg-slate-50"
                  />
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setViewingProblemStudent(null)}
              className="w-full py-2.5 apple-btn-secondary text-slate-800 text-xs font-bold rounded-xl transition-all cursor-pointer"
            >
              Tushunarli, oynani yopish
            </button>
          </div>
        </div>
      )}

      {/* Telegram Share Confirmation Modal after PDF download */}
      <TelegramShareModal
        isOpen={telegramShareModalData.isOpen}
        onClose={() => setTelegramShareModalData(prev => ({ ...prev, isOpen: false }))}
        fileName={telegramShareModalData.fileName}
        className={telegramShareModalData.className}
        teacherName={telegramShareModalData.teacherName}
        studentCount={telegramShareModalData.studentCount}
        pdfBlob={telegramShareModalData.pdfBlob}
      />

    </div>
  );
};
