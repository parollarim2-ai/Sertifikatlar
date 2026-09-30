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
import confetti from 'canvas-confetti';
import { 
  Users, 
  Award, 
  AlertCircle, 
  Copy, 
  Download, 
  Search, 
  ExternalLink, 
  CheckCircle2, 
  Check, 
  X, 
  School, 
  UserCheck, 
  ChevronRight, 
  ChevronDown,
  RefreshCw, 
  Clock, 
  Sparkles, 
  CreditCard, 
  Layers, 
  FileSpreadsheet,
  FolderArchive,
  FileStack,
  Bell,
  BellRing,
  Info,
  ArrowLeft
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
}

export const TeacherPortal: React.FC<TeacherPortalProps> = ({
  classes,
  students,
  sessions,
  messages,
  onRegisterSession,
  onMarkMessageAsRead,
  onOpenStudentModal,
  onToggleStudentPayment,
}) => {
  // Device detection
  const currentDevice = useMemo(() => detectCurrentDevice(), []);

  // Check if current device is blocked in sessions
  const blockedSession = sessions.find(s => s.deviceId === currentDevice.deviceId && s.isBlocked);

  // Timer for single click vs double click on passport
  const passportClickTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Start with empty selectedClassId so every visit / refresh prompts teacher selection!
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [teacherSearchQuery, setTeacherSearchQuery] = useState('');
  const [isTeacherPickerOpen, setIsTeacherPickerOpen] = useState(false);
  const [isMessagesListOpen, setIsMessagesListOpen] = useState(false);
  
  // Class details state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'certified' | 'error'>('all');
  const [copySuccessToast, setCopySuccessToast] = useState('');
  const [isZipping, setIsZipping] = useState(false);
  const [zipProgress, setZipProgress] = useState(0);

  // Multi-option download popup emerging from the download button
  const downloadMenuRef = useRef<HTMLDivElement>(null);
  const [isDownloadMenuOpen, setIsDownloadMenuOpen] = useState(false);
  const [isGeneratingUnifiedPdf, setIsGeneratingUnifiedPdf] = useState(false);
  const [unifiedProgressText, setUnifiedProgressText] = useState('');
  const [unifiedProgressPercent, setUnifiedProgressPercent] = useState(0);

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

  // Click outside listener to close the download menu
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

  // Problem view modal for teachers
  const [viewingProblemStudent, setViewingProblemStudent] = useState<Student | null>(null);

  const currentClass = classes.find(c => c.id === selectedClassId);
  const classStudents = currentClass ? students.filter(s => s.classId === currentClass.id) : [];

  // Register device session when class is selected (without overriding isBlocked)
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

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (passportClickTimeoutRef.current) {
        clearTimeout(passportClickTimeoutRef.current);
      }
    };
  }, []);

  const handlePassportSingleClick = (st: Student) => {
    if (passportClickTimeoutRef.current) {
      clearTimeout(passportClickTimeoutRef.current);
      passportClickTimeoutRef.current = null;
    }
    passportClickTimeoutRef.current = setTimeout(() => {
      const raw = st.passportOrId || '';
      const digits = extractPassportDigits(raw);
      if (digits) {
        navigator.clipboard.writeText(digits);
        setCopySuccessToast(`📋 Pasport raqami nusxalandi: "${digits}"`);
        setTimeout(() => setCopySuccessToast(''), 1500);
      }
      passportClickTimeoutRef.current = null;
    }, 220);
  };

  const handlePassportDoubleClick = (st: Student) => {
    if (passportClickTimeoutRef.current) {
      clearTimeout(passportClickTimeoutRef.current);
      passportClickTimeoutRef.current = null;
    }
    onOpenStudentModal?.(st, 'passport');
  };

  // Messages for this class
  const classMessages = currentClass ? messages.filter(m => m.classId === currentClass.id) : [];
  const unreadMessage = classMessages.find(m => !m.isRead);

  // If device is blocked by admin, show blocked overlay
  if (blockedSession) {
    return (
      <BlockedAccessOverlay
        session={blockedSession}
        onRefresh={() => window.location.reload()}
      />
    );
  }

  // Statistics
  const totalStudents = classStudents.length;
  const certifiedStudents = classStudents.filter(s => s.status === 'certified');
  const certifiedCount = certifiedStudents.length;
  const errorStudents = classStudents.filter(s => s.hasError || s.status === 'error');
  const errorCount = errorStudents.length;
  const pendingCount = totalStudents - certifiedCount - errorCount;

  // Percentage completion
  const completionRate = totalStudents > 0 ? Math.round((certifiedCount / totalStudents) * 100) : 0;

  // Financials: exactly 5 000 UZS per certified student
  const pricePerStudent = currentClass?.pricePerStudent || 5000;
  const totalDue = certifiedCount * pricePerStudent;
  const paidAmount = currentClass?.paidAmount || 0;
  const remainingDebt = Math.max(0, totalDue - paidAmount);
  const isFullyPaid = totalDue > 0 && paidAmount >= totalDue;

  // Filter students
  const filteredStudents = classStudents.filter(st => {
    const matchesSearch = st.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (st.passportOrId ? st.passportOrId.toLowerCase().includes(searchQuery.toLowerCase()) : false);

    if (!matchesSearch) return false;

    if (statusFilter === 'certified') return st.status === 'certified';
    if (statusFilter === 'error') return st.hasError || st.status === 'error';
    return true;
  });

  // Filter classes for teacher picker modal
  const filteredClasses = classes.filter(c => 
    c.teacherName.toLowerCase().includes(teacherSearchQuery.toLowerCase()) ||
    c.name.toLowerCase().includes(teacherSearchQuery.toLowerCase())
  );

  // Copy all certificates to clipboard (Formatted for Telegram)
  const handleCopyAllCertificates = async () => {
    if (!currentClass) return;

    if (certifiedCount === 0) {
      setCopySuccessToast("Hozircha sertifikat olgan o'quvchilar mavjud emas");
      setTimeout(() => setCopySuccessToast(''), 3000);
      return;
    }

    const text = formatClassCertificatesForClipboard(students, currentClass);
    try {
      await navigator.clipboard.writeText(text);
      confetti({
        particleCount: 50,
        spread: 70,
        origin: { y: 0.6 }
      });
      setCopySuccessToast(`✅ ${currentClass.name} sinfi sertifikatlari nusxalandi! Telegramga joylashingiz mumkin.`);
      setTimeout(() => setCopySuccessToast(''), 4000);
    } catch {
      alert("Nusxalashda xatolik yuz berdi. Iltimos qaytadan urining.");
    }
  };

  // Bulk ZIP Download
  const handleDownloadZip = async () => {
    if (!currentClass || certifiedCount === 0) return;

    setIsZipping(true);
    setZipProgress(0);

    try {
      await downloadAllCertificatesAsZip(students, currentClass, (pct) => {
        setZipProgress(Math.round(pct));
      });
      confetti({ particleCount: 40 });
    } catch (err) {
      console.error(err);
      alert("Fayllarni arxivlashda xatolik yuz berdi");
    } finally {
      setIsZipping(false);
      setZipProgress(0);
    }
  };

  // Feature 2: Generate Unified Combined PDF from actual links sorted alphabetically by surname
  const handleGenerateUnifiedPdf = async () => {
    if (!currentClass || certifiedCount === 0) return;
    setIsDownloadMenuOpen(false);
    setIsGeneratingUnifiedPdf(true);
    setUnifiedProgressPercent(0);
    setUnifiedProgressText("Jarayon boshlanmoqda...");

    try {
      const result = await generateUnifiedCertificatesPdf(students, currentClass, (statusText, current, total) => {
        setUnifiedProgressText(statusText);
        setUnifiedProgressPercent(Math.round((current / total) * 100));
      });
      confetti({
        particleCount: 60,
        spread: 80,
        origin: { y: 0.6 }
      });
      setCopySuccessToast(`✅ ${currentClass.name} sinfi uchun yagona birlashtirilgan PDF muvaffaqiyatli yaratildi va yuklandi!`);
      setTimeout(() => setCopySuccessToast(''), 5000);

      // Prompt Telegram Share dialog immediately upon download completion!
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
    } catch (err: any) {
      console.error("Unified PDF generation error:", err);
      alert("PDF yaratishda xatolik yuz berdi. Iltimos qaytadan urinib ko'ring.");
    } finally {
      setIsGeneratingUnifiedPdf(false);
      setUnifiedProgressPercent(0);
      setUnifiedProgressText('');
    }
  };

  // Teacher Picker Modal (Accessible both on landing and in active class dashboard)
  const renderTeacherPickerModal = () => {
    if (!isTeacherPickerOpen) return null;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
        <div className="relative w-full max-w-lg bg-white border border-slate-200 rounded-2xl shadow-2xl p-5 space-y-4 max-h-[85vh] flex flex-col">
          
          <div className="flex items-center justify-between pb-3 border-b border-slate-200/70 flex-shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg apple-badge-blue flex items-center justify-center">
                <School className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">
                  {selectedClassId ? "Sinfni almashtirish" : "O'z sinfingizni tanlang"}
                </h3>
                <p className="text-[11px] text-slate-500">Ism-familiyangiz yoki sinf nomini qidiring</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsTeacherPickerOpen(false)}
              className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Search input in modal */}
          <div className="relative flex-shrink-0">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Ustoz ismi yoki sinf (masalan: 9-B)..."
              value={teacherSearchQuery}
              onChange={e => setTeacherSearchQuery(e.target.value)}
              autoFocus
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-900 focus:outline-none focus:bg-white focus:border-blue-600"
            />
          </div>

          {/* Class List inside Modal */}
          <div className="space-y-1.5 overflow-y-auto flex-1 pr-1">
            {filteredClasses.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                "{teacherSearchQuery}" bo'yicha sinf yoki o'qituvchi topilmadi
              </div>
            ) : (
              filteredClasses.map(c => {
                const cStudents = students.filter(s => s.classId === c.id);
                const cCert = cStudents.filter(s => s.status === 'certified').length;
                const isCurrent = c.id === selectedClassId;

                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setSelectedClassId(c.id);
                      setIsTeacherPickerOpen(false);
                      setTeacherSearchQuery('');
                    }}
                    className={`w-full p-3 rounded-xl border flex items-center justify-between text-left transition-all cursor-pointer group ${
                      isCurrent 
                        ? 'border-blue-500 bg-blue-50/70 ring-1 ring-blue-500' 
                        : 'border-slate-200/80 hover:border-blue-500 hover:bg-blue-50/50'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-9 h-9 rounded-lg font-bold text-xs flex items-center justify-center flex-shrink-0 transition-colors ${
                        isCurrent 
                          ? 'bg-blue-600 text-white' 
                          : 'apple-badge-blue group-hover:bg-blue-600 group-hover:text-white'
                      }`}>
                        {c.name}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 text-xs sm:text-sm block truncate group-hover:text-blue-700">
                            {c.teacherName}
                          </span>
                          {isCurrent && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-blue-200 text-blue-900 font-bold">
                              Hozirgi sinf
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-slate-500">
                          {c.name} sinfi • {cStudents.length} ta o'quvchi ({cCert} ta tayyor)
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-blue-600 group-hover:translate-x-1 transition-all flex-shrink-0" />
                  </button>
                );
              })
            )}
          </div>

          {/* Modal Footer */}
          <div className="pt-2 border-t border-slate-200/70 flex items-center justify-between text-xs text-slate-500 flex-shrink-0">
            <div className="flex items-center gap-2">
              <span>Topildi: {filteredClasses.length} ta sinf</span>
              {selectedClassId && (
                <>
                  <span>•</span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedClassId('');
                      setIsTeacherPickerOpen(false);
                      setTeacherSearchQuery('');
                    }}
                    className="text-blue-600 hover:text-blue-800 font-bold hover:underline cursor-pointer flex items-center gap-1"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Bosh sahifaga chiqish</span>
                  </button>
                </>
              )}
            </div>
            <button
              type="button"
              onClick={() => setIsTeacherPickerOpen(false)}
              className="px-3.5 py-1.5 apple-btn-secondary text-slate-700 rounded-lg font-medium cursor-pointer"
            >
              Yopish
            </button>
          </div>

        </div>
      </div>
    );
  };

  // 1. If no classes exist at all in database
  if (classes.length === 0) {
    return (
      <div className="max-w-md mx-auto py-12 px-4 text-center space-y-4 animate-fade-in">
        <div className="w-16 h-16 rounded-2xl apple-glass text-blue-600 border border-slate-200 flex items-center justify-center mx-auto shadow-sm">
          <School className="w-8 h-8 text-blue-600" />
        </div>
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-slate-900">Sinflar ro'yxati kiritilmadi</h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            Hozircha tizimga sinflar kiritilmadi. Maktab ma'muriyati hujjatni yuklagandan so'ng sinf ma'lumotlari shu yerda aks etadi.
          </p>
        </div>
      </div>
    );
  }

  // 2. INITIAL SELECTION LANDING (Clean, concise, NO long list on page!)
  if (!selectedClassId || !currentClass) {
    return (
      <div className="max-w-xl mx-auto py-6 px-2 sm:px-0 animate-fade-in space-y-5">
        
        {/* Main Selection Card */}
        <div className="apple-glass-elevated rounded-3xl p-6 sm:p-8 shadow-xl border border-white/80 space-y-6 text-center relative overflow-hidden">
          
          <div className="w-16 h-16 rounded-2xl apple-btn-blue text-white flex items-center justify-center mx-auto shadow-lg shadow-blue-500/25">
            <UserCheck className="w-8 h-8 text-white" />
          </div>

          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full apple-badge-blue text-xs font-semibold">
              <Sparkles className="w-3.5 h-3.5 text-blue-600" />
              <span>Sinf Rahbarlari va O'qituvchilar Portali</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Assalomu alaykum, ustoz!
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 max-w-md mx-auto leading-relaxed">
              O'z sinfingiz o'quvchilari ro'yxati, to'lov holati va Coursera sertifikatlarini ko'rish uchun quyidagi tugmani bosing:
            </p>
          </div>

          {/* Single Action Button that Opens Teacher Picker Modal */}
          <div className="pt-2">
            <button
              type="button"
              onClick={() => {
                setTeacherSearchQuery('');
                setIsTeacherPickerOpen(true);
              }}
              className="w-full py-4 px-6 apple-btn-blue hover:shadow-xl hover:shadow-blue-500/30 text-white font-bold text-base sm:text-lg rounded-2xl flex items-center justify-between gap-4 cursor-pointer transition-all active:scale-[0.98] shadow-lg shadow-blue-500/20 group"
            >
              <div className="flex items-center gap-3">
                <School className="w-6 h-6 text-blue-200" />
                <span>Ustozlar ro'yxatini ochish</span>
              </div>
              <div className="flex items-center gap-2 text-xs font-semibold bg-white/20 px-3 py-1.5 rounded-xl backdrop-blur-md">
                <span>{classes.length} ta sinf</span>
                <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </button>
          </div>

          {/* Quick Informational Cards */}
          <div className="grid grid-cols-2 gap-3 pt-3 text-left border-t border-slate-200/60">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
              <span className="text-[11px] font-bold text-slate-700 block">📲 Telegram hisobot</span>
              <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                Barcha tayyor sertifikatlarni bitta tugma bilan guruhga nusxalash
              </p>
            </div>
            <div className="p-3 rounded-xl bg-indigo-50/70 border border-indigo-200/80">
              <span className="text-[11px] font-bold text-indigo-900 block">📑 Yagona PDF & ZIP</span>
              <p className="text-[11px] text-indigo-700 mt-0.5 leading-snug">
                Haqiqiy sertifikatlarni A-Z tartibda bitta PDF yoki ZIP arxivda yuklash
              </p>
            </div>
          </div>

        </div>

        {/* MODAL: TEACHER PICKER POPUP */}
        {renderTeacherPickerModal()}

      </div>
    );
  }

  // 3. TEACHER'S CLASS DASHBOARD (Apple Pro Executive Glass)
  return (
    <div className="max-w-3xl mx-auto space-y-4 pb-16 animate-fade-in px-2 sm:px-0">
      
      {/* Toast Alert */}
      {copySuccessToast && (
        <div className="fixed top-4 left-3 right-3 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 z-50 p-4 rounded-2xl bg-slate-900/95 backdrop-blur-xl text-white font-medium text-xs sm:text-sm shadow-2xl flex items-center justify-center gap-2.5 border border-slate-700 animate-fade-in">
          <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <span>{copySuccessToast}</span>
        </div>
      )}

      {/* Top Class Banner in Frosted Glass */}
      <div className="apple-glass-elevated rounded-2xl p-5 sm:p-6 shadow-md space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/60 pb-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-13 h-13 rounded-2xl apple-btn-blue font-black text-xl flex items-center justify-center flex-shrink-0 shadow-md shadow-blue-500/25">
              {currentClass.name}
            </div>
            <div className="min-w-0">
              <span className="text-xs text-blue-700 font-bold block uppercase tracking-wider">
                {currentClass.name} sinf rahbari
              </span>
              <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 truncate">
                {currentClass.teacherName}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Quick exit to landing / all teachers */}
            <button
              type="button"
              onClick={() => {
                setSelectedClassId('');
                setTeacherSearchQuery('');
              }}
              className="p-2.5 apple-btn-secondary rounded-xl text-slate-600 hover:text-slate-900 transition-all flex-shrink-0 cursor-pointer active:scale-95"
              title="Bosh sahifaga chiqish"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>

            {/* Messages button */}
            <button
              type="button"
              onClick={() => setIsMessagesListOpen(true)}
              className="px-3.5 py-2 apple-btn-secondary rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all flex-shrink-0 cursor-pointer w-fit active:scale-95 relative"
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

            {/* Sinfni almashtirish button */}
            <button
              type="button"
              onClick={() => {
                setTeacherSearchQuery('');
                setIsTeacherPickerOpen(true);
              }}
              className="px-3.5 py-2 apple-btn-secondary hover:border-blue-500 hover:bg-blue-50/60 rounded-xl text-xs font-bold text-slate-800 flex items-center gap-1.5 transition-all flex-shrink-0 cursor-pointer w-fit active:scale-95 shadow-2xs"
            >
              <RefreshCw className="w-3.5 h-3.5 text-blue-600" />
              <span>Sinfni almashtirish</span>
            </button>
          </div>
        </div>

        {/* 3 Metric Cards with Apple Glass & Micro Progress */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Total students */}
          <div className="apple-glass-card rounded-xl p-4">
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

          {/* Certified with Micro-Progress */}
          <div className="apple-glass-card rounded-xl p-4 border-emerald-300/80 bg-emerald-50/30">
            <div className="flex items-center justify-between text-emerald-800 mb-1.5">
              <span className="text-xs font-bold">Sertifikat Olganlar</span>
              <Award className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-2xl font-black text-emerald-700">
              {certifiedCount} <span className="text-xs text-emerald-600 font-medium">nafar</span>
            </div>
            <div className="w-full bg-emerald-200 h-1.5 rounded-full mt-2.5 overflow-hidden">
              <div 
                className="bg-emerald-600 h-full rounded-full transition-all duration-500" 
                style={{ width: `${completionRate}%` }}
              ></div>
            </div>
            <span className="text-[10px] text-emerald-700 font-semibold block mt-1">
              {completionRate}% natija qayd etildi
            </span>
          </div>

          {/* Payment status */}
          <div className="apple-glass-card rounded-xl p-4">
            <div className="flex items-center justify-between text-slate-500 mb-1.5">
              <span className="text-xs font-semibold">To'lov (5 000 / ta)</span>
              <CreditCard className="w-4 h-4 text-slate-600" />
            </div>
            <div className="mt-0.5">
              {isFullyPaid ? (
                <div className="text-base font-extrabold text-emerald-700 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>To'lov yakunlandi</span>
                </div>
              ) : totalDue === 0 ? (
                <div className="text-xs text-slate-500 font-medium">
                  0 so'm (sertifikat kutilmoqda)
                </div>
              ) : (
                <div className="text-xl font-black text-amber-700">
                  {remainingDebt.toLocaleString()} so'm
                </div>
              )}
            </div>
            <span className="text-[10px] text-slate-500 block mt-1">
              {isFullyPaid ? "Barcha to'lov to'liq amalga oshirildi" : "Kutilayotgan to'lov miqdori"}
            </span>
          </div>
        </div>
      </div>

      {/* Main Action Buttons: Apple Pro High-Gloss Blue */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          type="button"
          onClick={handleCopyAllCertificates}
          className="w-full py-3.5 px-4 apple-btn-blue text-white text-xs sm:text-sm font-bold rounded-xl shadow-md shadow-blue-500/20 flex items-center justify-center gap-2.5 transition-all cursor-pointer active:scale-[0.98]"
        >
          <Copy className="w-4 h-4 flex-shrink-0" />
          <span>Telegram uchun nusxalash</span>
        </button>

        {/* Emergent Multi-Option Download Button */}
        <div className="relative" ref={downloadMenuRef}>
          <button
            type="button"
            disabled={certifiedCount === 0 || isZipping || isGeneratingUnifiedPdf}
            onClick={() => setIsDownloadMenuOpen(prev => !prev)}
            className={`w-full py-3.5 px-4 apple-btn-secondary disabled:opacity-50 text-slate-800 text-xs sm:text-sm font-semibold rounded-xl flex items-center justify-between gap-2.5 transition-all cursor-pointer active:scale-[0.98] ${
              isDownloadMenuOpen ? 'ring-2 ring-blue-500 bg-blue-50/70 border-blue-400' : ''
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <Download className="w-4 h-4 text-blue-600 flex-shrink-0" />
              <span className="truncate">
                {isZipping 
                  ? `Arxivlanmoqda... ${zipProgress}%` 
                  : isGeneratingUnifiedPdf
                  ? `PDF jamlanmoqda... ${unifiedProgressPercent}%`
                  : `Barcha sertifikatlarni yuklash`}
              </span>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-blue-100 text-blue-800">
                2 xil variant
              </span>
              <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform duration-300 ${isDownloadMenuOpen ? 'rotate-180 text-blue-600' : ''}`} />
            </div>
          </button>

          {/* Emergent Menu popping right from the button */}
          {isDownloadMenuOpen && (
            <div className="absolute right-0 top-full mt-2 w-full sm:w-[420px] z-40 bg-white/95 backdrop-blur-xl border border-blue-200/90 rounded-2xl shadow-2xl p-3.5 space-y-2.5 animate-scale-up origin-top-right">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                  <span className="text-xs font-bold text-slate-900">Yuklash turini tanlang</span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsDownloadMenuOpen(false)}
                  className="w-6 h-6 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center transition-colors cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Tugma 1: Existing ZIP option */}
              <button
                type="button"
                onClick={() => {
                  setIsDownloadMenuOpen(false);
                  handleDownloadZip();
                }}
                className="w-full p-3 rounded-xl border border-slate-200/80 hover:border-blue-500 hover:bg-blue-50/60 text-left flex items-start gap-3 transition-all cursor-pointer group"
              >
                <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center flex-shrink-0 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                  <FolderArchive className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs sm:text-sm font-bold text-slate-900 group-hover:text-blue-700">
                      ZIP to'plam (Alohida sertifikatlar)
                    </span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                      .ZIP
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                    Har bir o'quvchi uchun alohida sertifikat fayli (.pdf va .html) bitta ZIP arxivda yuklanadi.
                  </p>
                </div>
              </button>

              {/* Tugma 2: New Unified PDF from actual links */}
              <button
                type="button"
                onClick={handleGenerateUnifiedPdf}
                className="w-full p-3 rounded-xl border-2 border-indigo-300 bg-gradient-to-r from-indigo-50/70 to-blue-50/70 hover:border-indigo-600 hover:from-indigo-100/70 hover:to-blue-100/70 text-left flex items-start gap-3 transition-all cursor-pointer group shadow-xs"
              >
                <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center flex-shrink-0 shadow-md shadow-indigo-500/25 group-hover:scale-105 transition-transform">
                  <FileStack className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs sm:text-sm font-bold text-indigo-950 group-hover:text-indigo-700 flex items-center gap-1.5">
                      <span>Birlashtirilgan Yagona PDF</span>
                      <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.2 rounded-md bg-amber-400 text-amber-950">
                        Yangi
                      </span>
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800">
                      .PDF
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 mt-1 leading-snug">
                    Kiritilgan havolalardan sertifikat rasmlarini olib, <strong>familiya bo'yicha ketma-ketlikda (A-Z)</strong> bitta uzun ro'yxat PDF qilib beradi.
                  </p>
                </div>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Unified PDF Generation Live Progress Card */}
      {isGeneratingUnifiedPdf && (
        <div className="apple-glass rounded-2xl p-4 border border-indigo-200 bg-indigo-50/60 shadow-lg space-y-3 animate-fade-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center animate-spin">
                <RefreshCw className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs sm:text-sm font-bold text-indigo-950">
                  Haqiqiy sertifikatlar jamlanmoqda...
                </h4>
                <p className="text-[11px] text-indigo-700 truncate max-w-xs sm:max-w-md">
                  {unifiedProgressText}
                </p>
              </div>
            </div>
            <span className="text-sm font-black text-indigo-700 font-mono">
              {unifiedProgressPercent}%
            </span>
          </div>

          <div className="w-full bg-indigo-200/80 h-2 rounded-full overflow-hidden">
            <div 
              className="bg-indigo-600 h-full rounded-full transition-all duration-300"
              style={{ width: `${unifiedProgressPercent}%` }}
            ></div>
          </div>
          <div className="flex items-center justify-between text-[10px] text-slate-500">
            <span>Familiya bo'yicha saralanmoqda</span>
            <span>Iltimos, sahifani yopmang</span>
          </div>
        </div>
      )}

      {/* ZIP Generation Live Progress Card */}
      {isZipping && (
        <div className="apple-glass rounded-2xl p-4 border border-blue-200 bg-blue-50/60 shadow-lg space-y-3 animate-fade-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center animate-spin">
                <RefreshCw className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs sm:text-sm font-bold text-blue-950">
                  ZIP arxiv tayyorlanmoqda...
                </h4>
                <p className="text-[11px] text-blue-700">
                  Har bir o'quvchi sertifikati PDF shaklida arxivlanmoqda
                </p>
              </div>
            </div>
            <span className="text-sm font-black text-blue-700 font-mono">
              {zipProgress}%
            </span>
          </div>

          <div className="w-full bg-blue-200/80 h-2 rounded-full overflow-hidden">
            <div 
              className="bg-blue-600 h-full rounded-full transition-all duration-300"
              style={{ width: `${zipProgress}%` }}
            ></div>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="apple-glass rounded-xl p-3 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-blue-600 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="O'quvchi F.I.SH yoki ID raqami bo'yicha qidirish..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 apple-glass-input rounded-lg text-slate-900 text-xs sm:text-sm focus:outline-none"
            />
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex-shrink-0 transition-all cursor-pointer ${
                statusFilter === 'all'
                  ? 'apple-btn-blue text-white shadow-xs'
                  : 'apple-btn-secondary text-slate-600'
              }`}
            >
              Barchasi ({totalStudents})
            </button>

            <button
              onClick={() => setStatusFilter('certified')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex-shrink-0 transition-all cursor-pointer ${
                statusFilter === 'certified'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'apple-badge-green hover:bg-emerald-100'
              }`}
            >
              Tayyor ({certifiedCount})
            </button>

            {errorCount > 0 && (
              <button
                onClick={() => setStatusFilter('error')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex-shrink-0 transition-all cursor-pointer ${
                  statusFilter === 'error'
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'apple-badge-rose hover:bg-rose-100'
                }`}
              >
                Xatolik ({errorCount})
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Students List in Apple Frosted Glass Cards */}
      <div className="space-y-2.5">
        {filteredStudents.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-xs apple-glass rounded-xl border border-slate-200">
            Qidiruv natijasida o'quvchilar topilmadi.
          </div>
        ) : (
          filteredStudents.map((st, idx) => {
            const isCertified = st.status === 'certified';
            const isError = st.hasError || st.status === 'error';

            return (
              <div
                key={st.id}
                className="apple-glass-card hover:border-blue-400/60 rounded-xl p-3.5 sm:p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all"
              >
                {/* Student Info */}
                <div 
                  className="flex items-start gap-3 min-w-0 flex-1 cursor-pointer select-none"
                  onDoubleClick={() => onOpenStudentModal?.(st)}
                  title="1 marta bosing — nusxalash, 2 marta tez bosing — ko'rish/tahrirlash"
                >
                  <span className="w-6 h-6 rounded-md bg-blue-50 border border-blue-200/80 text-blue-700 font-mono text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                    {idx + 1}
                  </span>
                  <div className="min-w-0">
                    <h2 
                      onClick={(e) => {
                        e.stopPropagation();
                        if (st.fullName) {
                          navigator.clipboard.writeText(st.fullName);
                          setCopySuccessToast(`📋 Nusxalandi: "${st.fullName}"`);
                          setTimeout(() => setCopySuccessToast(''), 1500);
                        }
                      }}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        onOpenStudentModal?.(st);
                      }}
                      className="font-bold text-slate-900 text-sm sm:text-base leading-snug truncate hover:text-blue-600 transition-colors"
                      title="1 marta bosing - nusxalash, 2 marta - tahrirlash"
                    >
                      {st.fullName}
                    </h2>
                    <div className="flex flex-wrap items-center gap-2 mt-0.5 text-xs text-slate-500 font-mono">
                      {st.birthDate && (
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(st.birthDate!);
                            setCopySuccessToast(`📋 Nusxalandi: "${st.birthDate}"`);
                            setTimeout(() => setCopySuccessToast(''), 1500);
                          }}
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            onOpenStudentModal?.(st);
                          }}
                          className="hover:text-blue-600 transition-colors"
                          title="1 marta bosing - nusxalash, 2 marta - tahrirlash"
                        >
                          Tug'ilgan: {st.birthDate}
                        </span>
                      )}
                      {st.passportOrId && (
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePassportSingleClick(st);
                          }}
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            handlePassportDoubleClick(st);
                          }}
                          className="hover:text-blue-600 transition-colors cursor-pointer"
                          title="1 marta bosing - faqat 7 talik raqamni nusxalash, 2 marta tez bosing - tahrirlash (Ctrl+A / Ctrl+C da I-FR bilan nusxalash)"
                        >
                          • ID: {st.passportOrId}
                        </span>
                      )}
                      {st.assignedEmail && (
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(st.assignedEmail!);
                            setCopySuccessToast(`📋 Nusxalandi: "${st.assignedEmail}"`);
                            setTimeout(() => setCopySuccessToast(''), 1500);
                          }}
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            onOpenStudentModal?.(st);
                          }}
                          className="text-blue-600 font-semibold bg-blue-50 px-1.5 py-0.5 rounded hover:bg-blue-100 transition-colors"
                          title="1 marta bosing - nusxalash, 2 marta - tahrirlash"
                        >
                          {st.assignedEmail}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Status Badges & Action Buttons */}
                <div className="flex items-center gap-2 self-end sm:self-center flex-shrink-0">
                  {isCertified ? (
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 rounded-full text-xs font-bold apple-badge-green flex items-center gap-1.5 shadow-xs">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Sertifikat tayyor</span>
                      </span>

                      {st.certificateLink && (
                        <a
                          href={st.certificateLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors border border-blue-200/80"
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
                      className="px-2.5 py-1 rounded-full text-xs font-bold apple-badge-rose flex items-center gap-1.5 cursor-pointer hover:bg-rose-100 transition-colors"
                    >
                      <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                      <span>Muammo aniqlandi (Ko'rish)</span>
                    </button>
                  ) : (
                    <span className="px-2.5 py-1 rounded-full text-xs font-medium text-slate-500 bg-slate-100/90 border border-slate-200 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span>Jarayonda</span>
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Teacher Incoming Notice Modal: pops up automatically if unread message exists! */}
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

              <div className="p-3.5 rounded-xl apple-badge-rose text-xs leading-relaxed">
                <b>Mas'ul admin izohi:</b> {viewingProblemStudent.errorReason || "O'quvchi kiritgan ma'lumotlar Coursera tizimidagi profil bilan mos kelmadi."}
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

      {/* Teacher Picker Modal (When switching class from dashboard) */}
      {renderTeacherPickerModal()}

    </div>
  );
};
