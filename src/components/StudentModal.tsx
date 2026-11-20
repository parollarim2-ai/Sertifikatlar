import React, { useState, useEffect, useRef } from 'react';
import { Student, ClassGroup } from '../types';
import { printCertificate } from '../utils/certificateGenerator';
import { checkStudentConflicts, extractPassportDigits } from '../utils/studentValidator';
import { recordCertifyEvent } from '../utils/operatorSpeedTracker';
import { 
  generateStudentLogin, 
  formatMetrikaForCopy, 
  parseMetrikaComponents, 
  getStudentTrackData,
  isDeveloperCertificate,
  isCourseraCertificate
} from '../utils/studentLoginHelper';
import { AiLeadersAutomationModal } from './AiLeadersAutomationModal';
import { 
  X, 
  Clipboard, 
  Check, 
  AlertTriangle, 
  ExternalLink, 
  Printer, 
  Mail, 
  Key, 
  User, 
  Calendar, 
  FileText, 
  Upload, 
  Trash2,
  CheckCircle2,
  Copy,
  AlertOctagon,
  ShieldAlert,
  Clock,
  GraduationCap,
  Zap,
  RefreshCw,
  FileCheck
} from 'lucide-react';

function formatExactCertificateTime(isoString?: string): string {
  if (!isoString) return "—";
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    const timeStr = d.toLocaleTimeString('uz-UZ', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    const dateStr = d.toLocaleDateString('uz-UZ', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
    return `${timeStr} (sekundigacha) • ${dateStr}`;
  } catch {
    return isoString;
  }
}

interface StudentModalProps {
  student: Student | null;
  classGroup?: ClassGroup;
  allStudents?: Student[];
  classes?: ClassGroup[];
  isAdmin: boolean;
  isOpen: boolean;
  initialFocusField?: 'passport' | 'name' | 'email';
  onClose: () => void;
  onSave: (updatedStudent: Student) => void;
  onDelete?: (studentId: string) => void;
}

const emptyStudentFallback: Student = {
  id: '',
  fullName: '',
  classId: '',
  status: 'pending',
  createdAt: '',
};

export const StudentModal: React.FC<StudentModalProps> = ({
  student,
  classGroup,
  allStudents = [],
  classes = [],
  isAdmin,
  isOpen,
  initialFocusField,
  onClose,
  onSave,
  onDelete,
}) => {
  const [formData, setFormData] = useState<Student>(student || emptyStudentFallback);
  const [pasteNotice, setPasteNotice] = useState('');
  const [isProblemMode, setIsProblemMode] = useState(!!student?.hasError);
  const [allowDuplicateName, setAllowDuplicateName] = useState(false);
  const [dismissedConflicts, setDismissedConflicts] = useState<{
    passport?: boolean;
    certificate?: boolean;
    email?: boolean;
    name?: boolean;
  }>({});
  const [quickCopiedField, setQuickCopiedField] = useState('');
  const [isAiLeadersOpen, setIsAiLeadersOpen] = useState(false);
  const [isRegisteringCoursera, setIsRegisteringCoursera] = useState(false);
  const [courseraNotice, setCourseraNotice] = useState('');
  const [isSolvingQuizzes, setIsSolvingQuizzes] = useState(false);
  const [quizNotice, setQuizNotice] = useState('');
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const isDeveloperMode = classGroup?.projectType === 'developer' || formData.projectType === 'developer';

  const playChime = () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } catch {}
  };

  const handleRegisterCourseraDirect = async () => {
    if (!formData.fullName || !formData.assignedEmail) {
      setCourseraNotice("⚠️ O'quvchi F.I.SH va biriktirilgan Gmail pochtasi kiritilmagan!");
      return;
    }

    // Request notification permission if needed
    if ('Notification' in window && Notification.permission === 'default') {
      try {
        await Notification.requestPermission();
      } catch {}
    }

    setIsRegisteringCoursera(true);
    setCourseraNotice("1/3. Coursera ta'lim dasturiga ulanilmoqda...");

    try {
      const res = await fetch('/api/coursera/register-student', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: formData.fullName,
          email: formData.assignedEmail,
          password: formData.assignedPassword || 'MaktabPass2026!',
        }),
      });

      const data = await res.json();
      if (data.success && data.verified) {
        const updated: Student = {
          ...formData,
          courseraVerified: true,
          courseraRegisteredAt: new Date().toISOString(),
        };
        setFormData(updated);
        onSave(updated);
        setCourseraNotice("✅ Coursera'dan ro'yxatdan o'tdi va Gmail orqali hisob faollashtirildi!");
        
        playChime();
        if ('Notification' in window && Notification.permission === 'granted') {
          try {
            new Notification("Coursera Hisobi Faollashtirildi! 🎓", {
              body: `${formData.fullName} uchun Coursera hisobi ochildi va tasdiqlandi!`,
              icon: '/favicon.ico',
            });
          } catch {}
        }
        setTimeout(() => setCourseraNotice(''), 7000);
      } else if (data.success && data.waitingEmail) {
        setCourseraNotice("📬 Coursera so'rovi yuborildi. Gmail pochtasidan tasdiq xati qidirilmoqda...");
        
        // Auto-poll IMAP for this specific student's email
        let pollCount = 0;
        const pollInterval = setInterval(async () => {
          pollCount++;
          try {
            const checkRes = await fetch('/api/gmail/sync-and-activate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ targetEmail: formData.assignedEmail, retries: 2, delaySeconds: 2 })
            });
            const checkData = await checkRes.json();
            const found = checkData.activatedResults?.find((r: any) =>
              r.success && r.type === 'coursera' && r.email?.trim().toLowerCase() === formData.assignedEmail?.trim().toLowerCase()
            );
            if (found) {
              clearInterval(pollInterval);
              const updated: Student = {
                ...formData,
                courseraVerified: true,
                courseraRegisteredAt: new Date().toISOString(),
              };
              setFormData(updated);
              onSave(updated);
              setCourseraNotice("✅ Coursera hisobi Gmail orqali muvaffaqiyatli tasdiqlandi!");
              playChime();
              if ('Notification' in window && Notification.permission === 'granted') {
                try {
                  new Notification("Coursera Hisobi Faollashtirildi! 🎓", {
                    body: `${formData.fullName} uchun Coursera hisobi tasdiqlandi!`,
                    icon: '/favicon.ico',
                  });
                } catch {}
              }
              setTimeout(() => setCourseraNotice(''), 7000);
            }
          } catch {}

          if (pollCount >= 5) {
            clearInterval(pollInterval);
          }
        }, 5000);
      } else {
        setCourseraNotice(`⚠️ Xatolik: ${data.error || "Coursera ro'yxatdan o'tishda xatolik yuz berdi"}`);
      }
    } catch (e: any) {
      setCourseraNotice(`❌ Server xatosi: ${e.message}`);
    } finally {
      setIsRegisteringCoursera(false);
    }
  };

  const handleSolveCourseraQuizzesDirect = async () => {
    if (!formData.assignedEmail || !formData.assignedEmail.includes('@')) {
      setQuizNotice("⚠️ Avval o'quvchiga email biriktirilishi va Coursera hisobi ochilgan bo'lishi lozim!");
      return;
    }

    setIsSolvingQuizzes(true);
    setQuizNotice("1/4. Coursera 4 ta testi (Quiz 1-4) avtomatik yechilmoqda...");

    try {
      const res = await fetch('/api/coursera/solve-quizzes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: student?.id,
          fullName: formData.fullName,
          email: formData.assignedEmail,
          password: formData.assignedPassword || 'MaktabPass2026!',
        }),
      });

      const data = await res.json();
      if (data.success) {
        const hasCert = !!data.certificateUrl;
        const updated: Student = {
          ...formData,
          courseraQuizStatus: 'completed',
          courseraQuizCompletedAt: new Date().toISOString(),
          hasError: false,
          errorReason: '',
          ...(hasCert ? {
            status: 'certified',
            certificateLink: data.certificateUrl,
            certificateNumber: data.certificateId || formData.certificateNumber,
            certifiedAt: data.certifiedAt || new Date().toISOString(),
          } : {}),
        };
        setFormData(updated);
        onSave(updated);
        playChime();
        setQuizNotice(
          hasCert
            ? `🎓 Rasmiy Coursera sertifikati olindi va saqlandi: ${data.certificateUrl}`
            : "🏆 Barcha 4 ta Coursera testlari muvaffaqiyatli topshirildi!"
        );
        setTimeout(() => setQuizNotice(''), 9000);
      } else {
        setQuizNotice(`⚠️ Xatolik: ${data.error || "Testlarni topshirishda xatolik yuz berdi"}`);
      }
    } catch (err: any) {
      setQuizNotice(`❌ Server xatosi: ${err.message}`);
    } finally {
      setIsSolvingQuizzes(false);
    }
  };

  const passportInputRef = useRef<HTMLInputElement>(null);
  const certificateInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus and select passport input if opened via double-click on passport
  useEffect(() => {
    if (isOpen && initialFocusField === 'passport') {
      const timer = setTimeout(() => {
        if (passportInputRef.current) {
          passportInputRef.current.focus();
          passportInputRef.current.select();
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen, initialFocusField]);

  // ESC key listener to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (student) {
      const isDev = classGroup?.projectType === 'developer' || student.projectType === 'developer';
      const trackData = getStudentTrackData(student, isDev ? 'developer' : 'ai');

      let cleanErrorReason = trackData.errorReason || '';
      if (cleanErrorReason.includes('<!doctype') || cleanErrorReason.includes('<html') || cleanErrorReason.includes('Starting Server')) {
        cleanErrorReason = '';
      }

      setFormData({
        ...student,
        projectType: isDev ? 'developer' : 'ai',
        status: trackData.status,
        certificateLink: trackData.certificateLink,
        certifiedAt: trackData.certifiedAt,
        certificateDate: trackData.certificateDate,
        hasError: trackData.hasError,
        errorReason: cleanErrorReason,
        errorImage: trackData.errorImage,
      });
      setIsProblemMode(trackData.hasError || !!cleanErrorReason);
      setPasteNotice('');
      setAllowDuplicateName(false);
      setDismissedConflicts({});
    }
  }, [student, classGroup]);

  if (!isOpen || !student) return null;

  const currentTrack: 'ai' | 'developer' =
    classGroup?.projectType === 'developer' || formData.projectType === 'developer' ? 'developer' : 'ai';

  // Real-time conflict checks strictly scoped to the same project track
  const conflicts = checkStudentConflicts(
    {
      id: formData.id,
      fullName: formData.fullName,
      passportOrId: formData.passportOrId,
      certificateLink: formData.certificateLink,
      assignedEmail: formData.assignedEmail,
    },
    allStudents,
    classes,
    currentTrack
  );

  const hasStrictBlockingConflict = 
    (conflicts.hasPassportConflict && !dismissedConflicts.passport) || 
    (conflicts.hasCertificateConflict && !dismissedConflicts.certificate) || 
    (conflicts.hasEmailConflict && !dismissedConflicts.email) || 
    (conflicts.hasNameConflict && !allowDuplicateName && !dismissedConflicts.name);

  // Fast paste from clipboard with validation
  const handlePasteClipboardLink = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        const trimmed = (text || '').trim();
        if (trimmed) {
          if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
            setPasteNotice("❌ Buferdagi matn havola (URL) emas!");
            setTimeout(() => setPasteNotice(''), 3000);
            return;
          }

          const isDev = classGroup?.projectType === 'developer' || formData.projectType === 'developer';
          if (isDev) {
            const isDevCert = isDeveloperCertificate(trimmed);
            if (!isDevCert) {
              setPasteNotice("❌ Bu Besh million sun'iy intellekt yetakchilari sertifikati emas! (https://omp.aistudy.uz/certificate?id=...)");
              setTimeout(() => setPasteNotice(''), 3500);
              return;
            }
          } else {
            const isCoursera = isCourseraCertificate(trimmed);
            if (!isCoursera) {
              setPasteNotice("❌ Bu Bir million promter (Coursera) sertifikati emas! (https://coursera.org/verify/...)");
              setTimeout(() => setPasteNotice(''), 3500);
              return;
            }
          }

          setFormData(prev => ({
            ...prev,
            certificateLink: trimmed,
            status: 'certified',
            hasError: false,
            errorReason: '',
            certifiedAt: prev.certifiedAt || new Date().toISOString(),
            certificateDate: prev.certificateDate || new Date().toISOString().split('T')[0],
            certificateNumber: prev.certificateNumber || `CERT-${(classGroup?.name || 'MKT').replace(/[^a-zA-Z0-9]/g, '')}-${student.id.slice(-4)}`,
          }));
          playChime();
          setPasteNotice(isDev ? "✅ Besh million sun'iy intellekt yetakchilari sertifikat havolasi buferdan qo'yildi!" : "✅ Bir million promter sertifikat havolasi buferdan muvaffaqiyatli qo'yildi!");
          setTimeout(() => setPasteNotice(''), 3000);
          return;
        }
      }
    } catch {
      // Browser blocked readText - focus input and prompt Ctrl+V
    }

    certificateInputRef.current?.focus();
    setPasteNotice("⌨️ Iltimos ushbu maydonga klaviaturada Ctrl + V bosing");
    setTimeout(() => setPasteNotice(''), 3500);
  };

  const handleCopyText = (text: string, label: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setQuickCopiedField(label);
    setTimeout(() => setQuickCopiedField(''), 1500);
  };

  // Sequential copy for Windows History (Win + V) inside modal
  const handleSequentialCopyForWinV = async (birthDate?: string, passportOrId?: string) => {
    const m = parseMetrikaComponents(birthDate, passportOrId);
    if (!m.formattedDate && !m.number && !m.series) {
      setQuickCopiedField("Ma'lumot topilmadi");
      return;
    }

    try {
      if (m.formattedDate) {
        await navigator.clipboard.writeText(m.formattedDate);
        setQuickCopiedField(`1/3: Sana (${m.formattedDate})`);
        await new Promise(r => setTimeout(r, 260));
      }
      if (m.number) {
        await navigator.clipboard.writeText(m.number);
        setQuickCopiedField(`2/3: Raqam (${m.number})`);
        await new Promise(r => setTimeout(r, 260));
      }
      if (m.series) {
        await navigator.clipboard.writeText(m.series);
        setQuickCopiedField(`3/3: Seriya (${m.series})`);
        await new Promise(r => setTimeout(r, 200));
      }
      playChime();
      setQuickCopiedField(`⚡ Win+V tayyor! 1: ${m.series || 'I-FR'} (Ctrl+V) ➔ 2: ${m.number} ➔ 3: ${m.formattedDate}`);
      setTimeout(() => setQuickCopiedField(''), 3500);
    } catch {
      navigator.clipboard.writeText(m.combined);
      setQuickCopiedField("Barchasi nusxalandi");
      setTimeout(() => setQuickCopiedField(''), 2000);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData(prev => ({
          ...prev,
          errorImage: reader.result as string,
        }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (hasStrictBlockingConflict) {
      return;
    }

    const isDev = classGroup?.projectType === 'developer' || formData.projectType === 'developer';
    let updated: Student = { 
      ...formData, 
      projectType: isDev ? 'developer' : 'ai' 
    };

    if (isProblemMode) {
      updated.hasError = true;
      updated.status = 'error';
    } else {
      updated.hasError = false;
      if (updated.certificateLink && updated.certificateLink.trim().length > 5) {
        updated.status = 'certified';
        if (!updated.certifiedAt) {
          updated.certifiedAt = new Date().toISOString();
        }
        // Record speed analytics event
        recordCertifyEvent(updated.id, updated.fullName, updated.certifiedAt);
      } else {
        updated.status = 'pending';
      }
    }

    if (isDev) {
      updated.devStatus = updated.status;
      updated.devCertificateLink = updated.certificateLink;
      updated.devCertifiedAt = updated.certifiedAt;
      if (updated.certificateDate) {
        updated.devCertificateDate = updated.certificateDate;
      }
      updated.devHasError = updated.hasError;
      updated.devErrorReason = updated.errorReason;
      updated.devErrorImage = updated.errorImage;
      // Retain existing AI fields intact
      updated.aiStatus = student.aiStatus || (student.projectType !== 'developer' ? student.status : undefined);
      updated.aiCertificateLink = student.aiCertificateLink || (student.projectType !== 'developer' ? student.certificateLink : undefined);
      updated.aiCertifiedAt = student.aiCertifiedAt || (student.projectType !== 'developer' ? student.certifiedAt : undefined);
      updated.aiHasError = student.aiHasError ?? (student.projectType !== 'developer' ? student.hasError : undefined);
      updated.aiErrorReason = student.aiErrorReason || (student.projectType !== 'developer' ? student.errorReason : undefined);
      updated.aiErrorImage = student.aiErrorImage || (student.projectType !== 'developer' ? student.errorImage : undefined);
    } else {
      updated.aiStatus = updated.status;
      updated.aiCertificateLink = updated.certificateLink;
      updated.aiCertifiedAt = updated.certifiedAt;
      if (updated.certificateDate) {
        updated.aiCertificateDate = updated.certificateDate;
      }
      updated.aiHasError = updated.hasError;
      updated.aiErrorReason = updated.errorReason;
      updated.aiErrorImage = updated.errorImage;
      // Retain existing Developer fields intact
      updated.devStatus = student.devStatus || (student.projectType === 'developer' ? student.status : undefined);
      updated.devCertificateLink = student.devCertificateLink || (student.projectType === 'developer' ? student.certificateLink : undefined);
      updated.devCertifiedAt = student.devCertifiedAt || (student.projectType === 'developer' ? student.certifiedAt : undefined);
      updated.devHasError = student.devHasError ?? (student.projectType === 'developer' ? student.hasError : undefined);
      updated.devErrorReason = student.devErrorReason || (student.projectType === 'developer' ? student.errorReason : undefined);
      updated.devErrorImage = student.devErrorImage || (student.projectType === 'developer' ? student.errorImage : undefined);
    }

    onSave(updated);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden my-6 border border-slate-300">
        
        {/* Quick Copied Floating Toast without OK button */}
        {quickCopiedField && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 px-3.5 py-1.5 bg-slate-900/90 backdrop-blur-md text-white rounded-xl text-xs font-semibold shadow-xl flex items-center gap-1.5 animate-scale-up">
            <Check className="w-3.5 h-3.5 text-emerald-400" />
            <span>{quickCopiedField} buferga nusxalandi</span>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 text-blue-800 flex items-center justify-center font-bold text-base flex-shrink-0">
              {classGroup?.name || 'SF'}
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 tracking-tight">{student.fullName}</h2>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span>{classGroup?.name} sinfi</span>
                <span>•</span>
                <span>Ustoz: {classGroup?.teacherName}</span>
                <span className="hidden sm:inline text-slate-400 font-mono text-[10px] ml-1">[ESC - yopish]</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {formData.status === 'certified' && (
              <button
                type="button"
                onClick={() => printCertificate(formData, classGroup)}
                className="px-3 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-300 rounded-lg hover:bg-emerald-100 flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Sertifikatni chop etish yoki PDF sifatida saqlash"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>PDF Chop etish</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-800 rounded-lg hover:bg-slate-200 transition-colors cursor-pointer"
              title="Yopish (ESC)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          
          {/* CONFLICT ALERTS WITH COMPLETE STUDENT INFORMATION (DISMISSIBLE) */}
          {conflicts.hasPassportConflict && !dismissedConflicts.passport && conflicts.conflictingStudentByPassport && (
            <div className="p-4 bg-rose-50 border-2 border-rose-300 rounded-xl text-xs text-rose-950 space-y-2 animate-scale-up">
              <div className="flex items-center justify-between gap-2 font-bold text-rose-800">
                <div className="flex items-center gap-2">
                  <AlertOctagon className="w-4 h-4 text-rose-600 flex-shrink-0" />
                  <span className="text-sm">Pasport / ID seriyasi takrorlandi!</span>
                </div>
                <button
                  type="button"
                  onClick={() => setDismissedConflicts(prev => ({ ...prev, passport: true }))}
                  className="px-2.5 py-1 rounded-lg bg-white hover:bg-rose-100 text-rose-800 border border-rose-300 text-[11px] font-bold transition-colors cursor-pointer flex items-center gap-1"
                  title="Ogohlantirishni yopish va saqlashga ruxsat berish"
                >
                  <X className="w-3 h-3" />
                  <span>Yopish / Ruxsat berish</span>
                </button>
              </div>
              <p className="leading-relaxed text-[11px] text-rose-900">
                Ushbu pasport seriyasi (<strong>{formData.passportOrId}</strong>) shu loyiha ichidagi boshqa o'quvchiga biriktirilgan:
              </p>
              <div className="bg-white/90 rounded-lg p-3 border border-rose-200 space-y-1.5 font-mono text-[11px] text-slate-800">
                <div className="flex justify-between items-center border-b border-slate-100 pb-1 font-sans">
                  <span className="text-slate-500 font-medium">O'quvchi F.I.SH:</span>
                  <span className="font-bold text-slate-900">{conflicts.conflictingStudentByPassport.fullName}</span>
                </div>
                <div className="flex justify-between items-center border-b border-slate-100 pb-1">
                  <span className="text-slate-500 font-sans font-medium">Sinfi:</span>
                  <span className="font-semibold text-blue-700 font-sans">
                    {conflicts.conflictingClassByPassport ? `${conflicts.conflictingClassByPassport.name} sinfi (${conflicts.conflictingClassByPassport.teacherName})` : 'Noma\'lum'}
                  </span>
                </div>
                <div className="flex justify-between items-center border-b border-slate-100 pb-1">
                  <span className="text-slate-500 font-sans font-medium">Tug'ilgan sana:</span>
                  <span>{conflicts.conflictingStudentByPassport.birthDate || 'Kiritilmagan'}</span>
                </div>
                <div className="flex justify-between items-center border-b border-slate-100 pb-1">
                  <span className="text-slate-500 font-sans font-medium">Pasport / ID:</span>
                  <span className="font-bold text-slate-900">{conflicts.conflictingStudentByPassport.passportOrId || '—'}</span>
                </div>
                <div className="flex justify-between items-center border-b border-slate-100 pb-1">
                  <span className="text-slate-500 font-sans font-medium">Biriktirilgan email:</span>
                  <span className="text-blue-700 font-semibold">{conflicts.conflictingStudentByPassport.assignedEmail || 'Mavjud emas'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-sans font-medium">Sertifikat holati:</span>
                  <span>{conflicts.conflictingStudentByPassport.certificateLink ? '✅ Sertifikat mavjud' : '⏳ Kutilmoqda'}</span>
                </div>
              </div>
            </div>
          )}

          {conflicts.hasCertificateConflict && !dismissedConflicts.certificate && conflicts.conflictingStudentByCertificate && (
            <div className="p-4 bg-rose-50 border-2 border-rose-300 rounded-xl text-xs text-rose-950 space-y-2 animate-scale-up">
              <div className="flex items-center justify-between gap-2 font-bold text-rose-800">
                <div className="flex items-center gap-2">
                  <AlertOctagon className="w-4 h-4 text-rose-600 flex-shrink-0" />
                  <span className="text-sm">Sertifikat havolasi takrorlandi!</span>
                </div>
                <button
                  type="button"
                  onClick={() => setDismissedConflicts(prev => ({ ...prev, certificate: true }))}
                  className="px-2.5 py-1 rounded-lg bg-white hover:bg-rose-100 text-rose-800 border border-rose-300 text-[11px] font-bold transition-colors cursor-pointer flex items-center gap-1"
                >
                  <X className="w-3 h-3" />
                  <span>Yopish</span>
                </button>
              </div>
              <p className="leading-relaxed text-[11px] text-rose-900">
                Ushbu sertifikat havolasi avvaldan boshqa o'quvchiga biriktirilgan:
              </p>
              <div className="bg-white/90 rounded-lg p-3 border border-rose-200 space-y-1.5 font-mono text-[11px] text-slate-800">
                <div className="flex justify-between items-center border-b border-slate-100 pb-1 font-sans">
                  <span className="text-slate-500 font-medium">O'quvchi F.I.SH:</span>
                  <span className="font-bold text-slate-900">{conflicts.conflictingStudentByCertificate.fullName}</span>
                </div>
                <div className="flex justify-between items-center border-b border-slate-100 pb-1">
                  <span className="text-slate-500 font-sans font-medium">Sinfi:</span>
                  <span className="font-semibold text-blue-700 font-sans">
                    {conflicts.conflictingClassByCertificate ? `${conflicts.conflictingClassByCertificate.name} sinfi (${conflicts.conflictingClassByCertificate.teacherName})` : 'Noma\'lum'}
                  </span>
                </div>
                <div className="flex justify-between items-center border-b border-slate-100 pb-1">
                  <span className="text-slate-500 font-sans font-medium">Tug'ilgan sana:</span>
                  <span>{conflicts.conflictingStudentByCertificate.birthDate || 'Kiritilmagan'}</span>
                </div>
                <div className="flex justify-between items-center border-b border-slate-100 pb-1">
                  <span className="text-slate-500 font-sans font-medium">Pasport / ID:</span>
                  <span className="font-bold text-slate-900">{conflicts.conflictingStudentByCertificate.passportOrId || '—'}</span>
                </div>
                <div className="flex justify-between items-center border-b border-slate-100 pb-1">
                  <span className="text-slate-500 font-sans font-medium">Biriktirilgan email:</span>
                  <span className="text-blue-700 font-semibold">{conflicts.conflictingStudentByCertificate.assignedEmail || 'Mavjud emas'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-sans font-medium">Sertifikat havolasi:</span>
                  <span className="text-blue-700 underline truncate max-w-[200px]">{conflicts.conflictingStudentByCertificate.certificateLink}</span>
                </div>
              </div>
            </div>
          )}

          {conflicts.hasEmailConflict && !dismissedConflicts.email && conflicts.conflictingStudentByEmail && (
            <div className="p-4 bg-rose-50 border-2 border-rose-300 rounded-xl text-xs text-rose-950 space-y-2 animate-scale-up">
              <div className="flex items-center justify-between gap-2 font-bold text-rose-800">
                <div className="flex items-center gap-2">
                  <AlertOctagon className="w-4 h-4 text-rose-600 flex-shrink-0" />
                  <span className="text-sm">Email manzili takrorlandi!</span>
                </div>
                <button
                  type="button"
                  onClick={() => setDismissedConflicts(prev => ({ ...prev, email: true }))}
                  className="px-2.5 py-1 rounded-lg bg-white hover:bg-rose-100 text-rose-800 border border-rose-300 text-[11px] font-bold transition-colors cursor-pointer flex items-center gap-1"
                >
                  <X className="w-3 h-3" />
                  <span>Yopish</span>
                </button>
              </div>
              <p className="leading-relaxed text-[11px] text-rose-900">
                Ushbu email manzili (<strong>{formData.assignedEmail}</strong>) allaqachon boshqa o'quvchiga berilgan:
              </p>
              <div className="bg-white/90 rounded-lg p-3 border border-rose-200 space-y-1.5 font-mono text-[11px] text-slate-800">
                <div className="flex justify-between items-center border-b border-slate-100 pb-1 font-sans">
                  <span className="text-slate-500 font-medium">O'quvchi F.I.SH:</span>
                  <span className="font-bold text-slate-900">{conflicts.conflictingStudentByEmail.fullName}</span>
                </div>
                <div className="flex justify-between items-center border-b border-slate-100 pb-1">
                  <span className="text-slate-500 font-sans font-medium">Sinfi:</span>
                  <span className="font-semibold text-blue-700 font-sans">
                    {conflicts.conflictingClassByEmail ? `${conflicts.conflictingClassByEmail.name} sinfi (${conflicts.conflictingClassByEmail.teacherName})` : 'Noma\'lum'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-sans font-medium">Pasport / ID:</span>
                  <span className="font-bold text-slate-900">{conflicts.conflictingStudentByEmail.passportOrId || '—'}</span>
                </div>
              </div>
            </div>
          )}

          {conflicts.hasNameConflict && !dismissedConflicts.name && conflicts.conflictingStudentByName && (
            <div className="p-4 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-950 space-y-2.5 animate-scale-up">
              <div className="flex items-center justify-between gap-2 font-bold text-amber-800">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                  <span className="text-sm">Bu ismdagi o'quvchi shu loyihada mavjud!</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setAllowDuplicateName(true);
                    setDismissedConflicts(prev => ({ ...prev, name: true }));
                  }}
                  className="px-2.5 py-1 rounded-lg bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 text-[11px] font-bold transition-colors cursor-pointer flex items-center gap-1"
                >
                  <X className="w-3 h-3" />
                  <span>Yopish</span>
                </button>
              </div>
              <p className="leading-relaxed text-[11px] text-amber-900">
                Ushbu loyihada allaqachon shunday ism-familiyali o'quvchi ro'yxatga olingan:
              </p>
              <div className="bg-white/90 rounded-lg p-3 border border-amber-200 space-y-1.5 font-mono text-[11px] text-slate-800">
                <div className="flex justify-between items-center border-b border-slate-100 pb-1 font-sans">
                  <span className="text-slate-500 font-medium">Mavjud o'quvchi:</span>
                  <span className="font-bold text-slate-900">{conflicts.conflictingStudentByName.fullName}</span>
                </div>
                <div className="flex justify-between items-center border-b border-slate-100 pb-1">
                  <span className="text-slate-500 font-sans font-medium">Sinfi:</span>
                  <span className="font-semibold text-blue-700 font-sans">
                    {conflicts.conflictingClassByName ? `${conflicts.conflictingClassByName.name} sinfi (${conflicts.conflictingClassByName.teacherName})` : 'Noma\'lum'}
                  </span>
                </div>
                <div className="flex justify-between items-center border-b border-slate-100 pb-1">
                  <span className="text-slate-500 font-sans font-medium">Tug'ilgan sana:</span>
                  <span>{conflicts.conflictingStudentByName.birthDate || 'Kiritilmagan'}</span>
                </div>
                <div className="flex justify-between items-center border-b border-slate-100 pb-1">
                  <span className="text-slate-500 font-sans font-medium">Pasport / ID:</span>
                  <span className="font-bold text-slate-900">{conflicts.conflictingStudentByName.passportOrId || '—'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-sans font-medium">Email:</span>
                  <span className="text-blue-700 font-semibold">{conflicts.conflictingStudentByName.assignedEmail || 'Mavjud emas'}</span>
                </div>
              </div>
              <div className="pt-1 flex items-center justify-between gap-2">
                <span className="text-[11px] text-slate-600">Agar bu boshqa o'quvchi bo'lsa:</span>
                <button
                  type="button"
                  onClick={() => setAllowDuplicateName(!allowDuplicateName)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    allowDuplicateName 
                      ? 'bg-emerald-600 text-white' 
                      : 'bg-white text-slate-800 border border-amber-300 hover:bg-amber-100'
                  }`}
                >
                  {allowDuplicateName ? "✅ Bu boshqa o'quvchi (Tasdiqlandi)" : "Bu boshqa o'quvchimi? (Ruxsat berish)"}
                </button>
              </div>
            </div>
          )}

          {/* Status Badge banner */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Holat:</span>
              {formData.hasError ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-full bg-rose-50 text-rose-800 border border-rose-200">
                  <AlertTriangle className="w-3.5 h-3.5" /> XATOLIK / MUAMMO BOR
                </span>
              ) : formData.certificateLink ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                  <CheckCircle2 className="w-3.5 h-3.5" /> SERTIFIKAT TAYYOR
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-full bg-slate-200 text-slate-700">
                  KUTILMOQDA
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                const next = !isProblemMode;
                setIsProblemMode(next);
                setFormData(prev => ({ ...prev, hasError: next }));
              }}
              className={`text-xs px-3 py-1.5 rounded-lg border font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                isProblemMode
                  ? 'bg-rose-700 text-white border-rose-800 shadow-xs'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
              {isProblemMode ? "Muammoni bekor qilish" : "Muammo / Xato deb belgilash"}
            </button>
          </div>

          {/* Student basic info grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {/* Student Full Name */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-blue-700" />
                  O'quvchi F.I.SH:
                </span>
                <button
                  type="button"
                  onClick={() => handleCopyText(formData.fullName, "Ism")}
                  className="text-[11px] text-blue-600 hover:text-blue-800 flex items-center gap-0.5 cursor-pointer"
                >
                  <Copy className="w-3 h-3" />
                  <span>Nusxalash</span>
                </button>
              </label>
              <input
                type="text"
                value={formData.fullName}
                onChange={e => setFormData({ ...formData, fullName: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:bg-white focus:border-blue-700 focus:ring-2 focus:ring-blue-500/20"
                required
              />
            </div>

            {/* Birth Date */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-blue-700" />
                  Tug'ilgan sana:
                </span>
                {formData.birthDate && (
                  <button
                    type="button"
                    onClick={() => handleCopyText(formData.birthDate || '', "Tug'ilgan sana")}
                    className="text-[11px] text-blue-600 hover:text-blue-800 flex items-center gap-0.5 cursor-pointer"
                  >
                    <Copy className="w-3 h-3" />
                    <span>Nusxalash</span>
                  </button>
                )}
              </label>
              <input
                type="text"
                value={formData.birthDate || ''}
                placeholder="Masalan: 2010-04-15"
                onChange={e => setFormData({ ...formData, birthDate: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:bg-white focus:border-blue-700 focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            {/* Passport or Certificate ID */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-blue-700" />
                  Pasport seriya / Metrika ID:
                </span>
                {formData.passportOrId && (
                  <span className="text-[11px] text-slate-500 font-normal">
                    Faqat raqami: <strong className="text-slate-800 font-mono">{extractPassportDigits(formData.passportOrId)}</strong>
                  </span>
                )}
              </label>
              <input
                ref={passportInputRef}
                type="text"
                value={formData.passportOrId || ''}
                placeholder="Masalan: I-FR 1234567 yoki AA1234567"
                onChange={e => setFormData({ ...formData, passportOrId: e.target.value.toUpperCase() })}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:bg-white focus:border-blue-700 focus:ring-2 focus:ring-blue-500/20 uppercase font-mono shadow-xs"
              />
              <p className="text-[11px] text-slate-500">
                1 marta bosilganda faqat 7 talik raqam nusxalanadi. O'zgartirish yoki Ctrl+A qilib nusxalashda to'liq seriya (I-FR bilan) olinadi.
              </p>
            </div>

            {/* Quick Metrika Component Copy Toolbar */}
            {(formData.birthDate || formData.passportOrId) && (() => {
              const m = parseMetrikaComponents(formData.birthDate, formData.passportOrId);
              return (
                <div className="md:col-span-2 p-2.5 rounded-xl bg-purple-50/70 border border-purple-200 flex flex-wrap items-center justify-between gap-2 animate-fade-in">
                  <span className="text-[11px] font-bold text-purple-900 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-purple-700 flex-shrink-0" />
                    <span>Metrika bo'yicha alohida nusxalash:</span>
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {m.formattedDate && (
                      <button
                        type="button"
                        onClick={() => handleCopyText(m.formattedDate, "Tug'ilgan sana")}
                        className="px-2 py-1 rounded-lg bg-white hover:bg-indigo-50 border border-indigo-300 text-indigo-950 text-xs font-mono font-bold flex items-center gap-1 cursor-pointer transition-all shadow-2xs hover:scale-105 active:scale-95"
                        title="Faqat tug'ilgan sanani nusxalash (02.06.2011)"
                      >
                        <span className="text-[10px] text-indigo-500 font-sans font-medium">Sana:</span>
                        <span>{m.formattedDate}</span>
                        <Copy className="w-2.5 h-2.5 text-indigo-600" />
                      </button>
                    )}
                    {m.number && (
                      <button
                        type="button"
                        onClick={() => handleCopyText(m.number, "Metrika raqami")}
                        className="px-2 py-1 rounded-lg bg-white hover:bg-purple-50 border border-purple-300 text-purple-950 text-xs font-mono font-bold flex items-center gap-1 cursor-pointer transition-all shadow-2xs hover:scale-105 active:scale-95"
                        title="Faqat metrika raqamini nusxalash (masalan: 0539632)"
                      >
                        <span className="text-[10px] text-purple-500 font-sans font-medium">Raqam:</span>
                        <span>{m.number}</span>
                        <Copy className="w-2.5 h-2.5 text-purple-600" />
                      </button>
                    )}
                    {m.series && (
                      <button
                        type="button"
                        onClick={() => handleCopyText(m.series, "Metrika seriyasi")}
                        className="px-2 py-1 rounded-lg bg-white hover:bg-pink-50 border border-pink-300 text-pink-950 text-xs font-mono font-bold flex items-center gap-1 cursor-pointer transition-all shadow-2xs hover:scale-105 active:scale-95"
                        title="Faqat metrika seriyasini nusxalash (masalan: I-FR)"
                      >
                        <span className="text-[10px] text-pink-500 font-sans font-medium">Seriya:</span>
                        <span>{m.series}</span>
                        <Copy className="w-2.5 h-2.5 text-pink-600" />
                      </button>
                    )}
                    {/* 4. Ketma-ket Win+V uchun maxsus tugma */}
                    <button
                      type="button"
                      onClick={() => handleSequentialCopyForWinV(formData.birthDate, formData.passportOrId)}
                      className="px-2.5 py-1 rounded-lg bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 hover:from-amber-600 hover:to-orange-600 text-white text-xs font-bold flex items-center gap-1 cursor-pointer transition-all shadow-2xs hover:scale-105 active:scale-95"
                      title="Windows Bufer Tarixi (Win+V) uchun ketma-ket yozish: 1. Sana ➔ 2. Raqam ➔ 3. Seriya (Ctrl+V)"
                    >
                      <Zap className="w-3 h-3 text-amber-200 fill-amber-200" />
                      <span>Win+V</span>
                    </button>

                    {m.combined && (
                      <button
                        type="button"
                        onClick={() => handleCopyText(m.combined, "Barchasi ketma-ket")}
                        className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-semibold flex items-center gap-1 cursor-pointer transition-all"
                        title="Barchasini ketma-ket nusxalash (02.06.2011 0539632 I-FR)"
                      >
                        <Copy className="w-2.5 h-2.5 text-slate-600" />
                        <span>Barchasi</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Email or Developer Login allocation */}
            {isDeveloperMode ? (
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 font-bold text-purple-900">
                    <Key className="w-3.5 h-3.5 text-purple-700" />
                    Biriktirilgan Login (omp.aistudy.uz / 5M AI Yetakchilari):
                  </span>
                  {formData.assignedLogin && (
                    <button
                      type="button"
                      onClick={() => handleCopyText(formData.assignedLogin || '', "Login")}
                      className="text-[11px] text-purple-600 hover:text-purple-800 flex items-center gap-0.5 cursor-pointer font-bold"
                    >
                      <Copy className="w-3 h-3" />
                      <span>Nusxalash</span>
                    </button>
                  )}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={formData.assignedLogin || ''}
                    placeholder="familya_ism"
                    onChange={e => {
                      const cleanVal = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '');
                      const updated: Student = { ...formData, assignedLogin: cleanVal, projectType: 'developer' };
                      setFormData(updated);
                      onSave(updated);
                    }}
                    className="flex-1 px-3 py-2 text-sm bg-white border border-purple-300 rounded-lg text-purple-950 font-mono font-bold focus:outline-none focus:bg-white focus:border-purple-700 focus:ring-2 focus:ring-purple-500/20"
                  />
                  {!formData.assignedLogin ? (
                    <button
                      type="button"
                      onClick={() => {
                        const login = generateStudentLogin(formData.fullName, 0);
                        const updated: Student = {
                          ...formData,
                          assignedLogin: login,
                          loginVariantIndex: 0,
                          projectType: 'developer',
                          assignedPassword: formData.assignedPassword || 'MaktabPass2026!'
                        };
                        setFormData(updated);
                        onSave(updated);
                        handleCopyText(login, "Login");
                      }}
                      className="px-3 py-2 bg-purple-700 hover:bg-purple-800 text-white rounded-lg text-xs font-bold transition-all cursor-pointer shadow-xs whitespace-nowrap"
                    >
                      Login berish
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        const nextIndex = ((formData.loginVariantIndex ?? 0) + 1);
                        const newLogin = generateStudentLogin(formData.fullName, nextIndex);
                        const updated: Student = {
                          ...formData,
                          assignedLogin: newLogin,
                          loginVariantIndex: nextIndex,
                          projectType: 'developer'
                        };
                        setFormData(updated);
                        onSave(updated);
                        handleCopyText(newLogin, "Yangi login");
                      }}
                      className="px-3 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-bold transition-all cursor-pointer shadow-xs whitespace-nowrap flex items-center gap-1"
                      title="Qayta boshqa login generatsiya qilish (ism_familya, familya_ism1, familya_ism2...)"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>Boshqa</span>
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-emerald-700" />
                    Biriktirilgan Gmail:
                  </span>
                  {formData.assignedEmail && (
                    <button
                      type="button"
                      onClick={() => handleCopyText(formData.assignedEmail || '', "Email")}
                      className="text-[11px] text-blue-600 hover:text-blue-800 flex items-center gap-0.5 cursor-pointer"
                    >
                      <Copy className="w-3 h-3" />
                      <span>Nusxalash</span>
                    </button>
                  )}
                </label>
                <input
                  type="email"
                  value={formData.assignedEmail || ''}
                  placeholder="pochta@gmail.com yoki zaxiradan biriktiriladi"
                  onChange={e => setFormData({ ...formData, assignedEmail: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 font-mono focus:outline-none focus:bg-white focus:border-blue-700 focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
            )}
          </div>

          {/* Assigned Password if available */}
          {formData.assignedPassword && (
            <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs">
              <div className="flex items-center gap-2 text-slate-600">
                <Key className="w-4 h-4 text-blue-700" />
                <span>{isDeveloperMode ? 'Tizim paroli (omp.aistudy.uz):' : 'Pochta / Coursera paroli:'}</span>
                <span className="font-mono text-slate-900 font-bold bg-white px-2 py-0.5 rounded border border-slate-200">
                  {formData.assignedPassword}
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleCopyText(formData.assignedPassword || '', "Parol")}
                className="text-xs font-semibold text-blue-700 hover:text-blue-800 cursor-pointer flex items-center gap-1"
              >
                <Copy className="w-3 h-3" />
                <span>Nusxalash</span>
              </button>
            </div>
          )}

          {/* Certificate Section */}
          <div className="p-4 rounded-xl bg-blue-50/40 border border-blue-200 space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-bold text-slate-900 text-xs sm:text-sm flex items-center gap-2">
                <span>{isDeveloperMode ? 'Besh Million Sun\'iy Intellekt Yetakchilari Sertifikat Havolasi' : 'Bir Million Promter (Coursera) Sertifikat Havolasi'}</span>
              </div>
              {pasteNotice && (
                <span className="text-xs text-emerald-700 font-semibold animate-pulse">
                  {pasteNotice}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handlePasteClipboardLink}
                className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-blue-700 hover:bg-blue-800 text-white shadow-xs flex items-center gap-2 transition-colors cursor-pointer"
              >
                <Clipboard className="w-4 h-4" />
                <span>Havolani avtomatik buferdan qo'yish (Paste)</span>
              </button>

              {/* In Developer Mode: completely hide Coursera automated buttons */}
              {!isDeveloperMode && (
                <>
                  <button
                    type="button"
                    onClick={handleRegisterCourseraDirect}
                    disabled={isRegisteringCoursera}
                    className="px-3.5 py-2 text-xs font-bold rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow-xs flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                    title="O'quvchini to'g'ridan-to'g'ri Coursera dasturidan ro'yxatdan o'tkazish va Gmail orqali hisobini faollashtirish"
                  >
                    <GraduationCap className={`w-3.5 h-3.5 ${isRegisteringCoursera ? 'animate-spin' : ''}`} />
                    <span>{isRegisteringCoursera ? "Coursera'dan o'tkazilmoqda..." : "🎓 Coursera orqali ro'yxatdan o'tish"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSolveCourseraQuizzesDirect}
                    disabled={isSolvingQuizzes}
                    className="px-3.5 py-2 text-xs font-bold rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-xs flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                    title="Coursera 4 ta testini (Introduction to Generative AI) avtomatik yechish"
                  >
                    <FileCheck className={`w-3.5 h-3.5 ${isSolvingQuizzes ? 'animate-spin' : ''}`} />
                    <span>{isSolvingQuizzes ? "Testlar yechilmoqda (1-4)..." : "🎯 Coursera Testlarini Yechish (Beta)"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsAiLeadersOpen(true)}
                    className="px-3.5 py-2 text-xs font-bold rounded-lg bg-gradient-to-r from-indigo-600 via-blue-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white shadow-xs flex items-center gap-1.5 transition-all cursor-pointer transform hover:scale-[1.02]"
                    title="aileaders.uz va Coursera saytida ro'yxatdan o'tkazish avtomati"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>⚡️ Sertifikat olish (AI Leaders & Coursera Avtomat)</span>
                  </button>
                </>
              )}
            </div>

            {/* Coursera Status / Notice */}
            {formData.courseraVerified && (
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-bold">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                <span>✅ Ushbu o'quvchining rasmiy Coursera hisobi faol va tasdiqlangan!</span>
              </div>
            )}

            {formData.courseraQuizStatus === 'completed' && (
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-teal-50 border border-teal-300 text-teal-900 text-xs font-bold">
                <CheckCircle2 className="w-4 h-4 text-teal-600 flex-shrink-0" />
                <span>🏆 Barcha 4 ta Coursera testlari muvaffaqiyatli topshirilgan!</span>
              </div>
            )}

            {quizNotice && (
              <div className="p-2.5 rounded-lg bg-teal-50 border border-teal-300 text-xs text-teal-950 font-semibold animate-fade-in flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-teal-600 animate-spin flex-shrink-0" />
                <span>{quizNotice}</span>
              </div>
            )}

            {courseraNotice && (
              <div className="p-2.5 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-900 font-semibold animate-fade-in flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-blue-600 animate-spin flex-shrink-0" />
                <span>{courseraNotice}</span>
              </div>
            )}

            <div className="flex items-center gap-2">
              <input
                ref={certificateInputRef}
                type="url"
                value={formData.certificateLink || ''}
                placeholder="https://coursera.org/verify/..."
                onChange={e => setFormData({ 
                  ...formData, 
                  certificateLink: e.target.value,
                  status: e.target.value.trim() ? 'certified' : 'pending'
                })}
                onPaste={e => {
                  const pasted = e.clipboardData.getData('text').trim();
                  if (pasted && (pasted.startsWith('http://') || pasted.startsWith('https://'))) {
                    const isCoursera = /coursera\.org/i.test(pasted) || /coursera_assets/i.test(pasted);
                    if (isCoursera) {
                      setFormData(prev => ({
                        ...prev,
                        certificateLink: pasted,
                        status: 'certified',
                        hasError: false,
                        errorReason: '',
                        certifiedAt: prev.certifiedAt || new Date().toISOString(),
                        certificateDate: prev.certificateDate || new Date().toISOString().split('T')[0],
                        certificateNumber: prev.certificateNumber || `B1MD-${(classGroup?.name || 'MKT').replace(/[^a-zA-Z0-9]/g, '')}-${student.id.slice(-4)}`,
                      }));
                      playChime();
                      setPasteNotice("✅ Coursera sertifikat havolasi qo'yildi va tasdiqlandi!");
                      setTimeout(() => setPasteNotice(''), 3000);
                    }
                  }
                }}
                className="flex-1 px-3 py-2 text-xs sm:text-sm bg-white border border-slate-300 rounded-lg text-slate-900 font-mono focus:outline-none focus:border-blue-700 shadow-xs"
              />
              <button
                type="button"
                onClick={handlePasteClipboardLink}
                className="px-3.5 py-2 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs flex items-center gap-1.5 transition-all cursor-pointer flex-shrink-0 active:scale-95"
                title="Buferdagi Coursera sertifikat havolasini qo'yish"
              >
                <Clipboard className="w-3.5 h-3.5" />
                <span>Qo'yish</span>
              </button>
              {formData.certificateLink && (
                <a
                  href={formData.certificateLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 text-blue-700 hover:text-blue-800 bg-white border border-slate-300 rounded-lg transition-colors cursor-pointer flex-shrink-0"
                  title="Havolani ochish"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              )}
            </div>

            {/* Official Certificate Earned Date & DB Entry Timestamp - ONLY FOR CERTIFIED STUDENTS */}
            {formData.status === 'certified' && (() => {
              const td = getStudentTrackData(formData, currentTrack);
              return (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200/90 text-emerald-950 space-y-2.5 text-xs shadow-2xs mt-2.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-700 flex-shrink-0">
                        <FileCheck className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-emerald-950 text-xs">
                            Sertifikat olingan rasmiy sana (QR tagidagi):
                          </span>
                          {td.certificateDateVerified ? (
                            <span className="px-2 py-0.5 rounded-md bg-emerald-600 text-white text-[10px] font-bold">
                              ✅ Rasmiy QR sanasi
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-bold">
                              Qo'lda / Tekshirilmagan
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-emerald-800 block">
                          {td.certificateDateSource
                            ? `Manba: ${td.certificateDateSource}`
                            : "Sinf sozlamalaridagi 'Sertifikat sanalari va Isbot' orqali avtomatik aniqlash mumkin"}
                        </span>
                      </div>
                    </div>
                    <input
                      type="date"
                      value={(formData.certificateDate || '').slice(0, 10)}
                      onChange={e => {
                        const val = e.target.value;
                        setFormData(prev => ({
                          ...prev,
                          certificateDate: val,
                          ...(currentTrack === 'developer'
                            ? { devCertificateDate: val, devCertificateDateVerified: Boolean(val), devCertificateDateSource: val ? 'manual-edit' : undefined }
                            : { aiCertificateDate: val, aiCertificateDateVerified: Boolean(val), aiCertificateDateSource: val ? 'manual-edit' : undefined }),
                        }));
                      }}
                      className="px-2.5 py-1 bg-white border border-emerald-300 rounded-lg text-xs font-mono font-bold text-emerald-950 focus:outline-none focus:border-emerald-600"
                    />
                  </div>

                  <div className="pt-2 border-t border-emerald-200/70 flex items-center justify-between text-[11px] text-emerald-800">
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Bazaga kiritilgan vaqt:</span>
                    </span>
                    <span className="font-mono font-semibold">
                      {formatExactCertificateTime(formData.certifiedAt || formData.createdAt)}
                    </span>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Problem Details Form & Section */}
          <div className={`p-4 rounded-2xl border transition-all ${
            isProblemMode 
              ? 'bg-rose-50/80 border-rose-300 shadow-xs' 
              : 'bg-slate-50 border-slate-200 hover:border-slate-300'
          }`}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className={`w-4 h-4 flex-shrink-0 ${isProblemMode ? 'text-rose-600' : 'text-slate-500'}`} />
                <div>
                  <span className={`text-xs sm:text-sm font-bold block ${isProblemMode ? 'text-rose-950' : 'text-slate-800'}`}>
                    {isProblemMode ? "O'quvchida xatolik / muammo mavjud" : "Muammo yoki xatolik kiritish (Izoh)"}
                  </span>
                  <span className="text-[11px] text-slate-500">
                    {isProblemMode ? "Ushbu izoh sinf rahbariga uning portalida qizil ogohlantirish sifatida ko'rinadi" : "Agar o'quvchi hujjatida yoki platformada muammo bo'lsa, bu yerni bosing"}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  const next = !isProblemMode;
                  setIsProblemMode(next);
                  setFormData(prev => ({ ...prev, hasError: next }));
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer flex-shrink-0 ${
                  isProblemMode
                    ? 'bg-rose-700 text-white hover:bg-rose-800 shadow-xs'
                    : 'bg-white text-rose-700 border border-rose-300 hover:bg-rose-50'
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>{isProblemMode ? "Xatolikni bekor qilish" : "Xatolik deb belgilash"}</span>
              </button>
            </div>

            {isProblemMode && (
              <div className="mt-3 pt-3 border-t border-rose-200/80 space-y-3 animate-fade-in">
                {/* Quick problem templates */}
                <div>
                  <span className="text-[11px] font-bold text-rose-900 block mb-1">
                    Tezkor sabab shablonlari (1 marta bosing):
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      "Metrikadagi ism va pasport mos kelmadi",
                      "Platformada hisob bloklandi",
                      "Tug'ilgan sana noto'g'ri kiritilgan",
                      "Telegram tasdiqlash kodi olinmadi",
                      "Sertifikat testi topshirilmadi / rad etildi"
                    ].map(tmpl => (
                      <button
                        type="button"
                        key={tmpl}
                        onClick={() => setFormData(prev => ({ ...prev, errorReason: tmpl }))}
                        className="px-2.5 py-1 rounded-lg bg-white border border-rose-200 hover:border-rose-400 text-rose-900 text-[11px] font-medium transition-all cursor-pointer shadow-2xs hover:bg-rose-50"
                      >
                        + {tmpl}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-800 block mb-1">
                    Batafsil muammo sababi:
                  </label>
                  <textarea
                    rows={3}
                    value={formData.errorReason || ''}
                    placeholder="Masalan: Metrikadagi ism va pasport mos kelmadi, yoki platformada hisob bloklandi..."
                    onChange={e => setFormData({ ...formData, errorReason: e.target.value })}
                    className="w-full px-3 py-2 text-xs sm:text-sm bg-white border border-rose-300 rounded-xl text-slate-900 focus:outline-none focus:border-rose-600 focus:ring-1 focus:ring-rose-500"
                    required={isProblemMode}
                  />
                </div>

                {/* Problem screenshot upload */}
                <div>
                  <label className="text-xs font-bold text-slate-800 block mb-1">
                    Muammo skrinshoti / rasmi (ixtiyoriy):
                  </label>
                  {formData.errorImage ? (
                    <div className="relative rounded-xl overflow-hidden border border-rose-300 max-h-52 group bg-slate-900 flex items-center justify-center">
                      <img src={formData.errorImage} alt="Muammo rasmi" className="w-full object-contain max-h-52" />
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, errorImage: undefined })}
                        className="absolute top-2 right-2 p-1.5 rounded-lg bg-rose-800/90 hover:bg-rose-900 text-white shadow-md transition-colors cursor-pointer"
                        title="Rasmni o'chirish"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <label className="flex items-center justify-center gap-2 p-3.5 border-2 border-dashed border-rose-300 rounded-xl cursor-pointer hover:bg-rose-100/40 transition-colors bg-white">
                      <Upload className="w-4 h-4 text-rose-600" />
                      <span className="text-xs text-rose-800 font-semibold">Skrinshotni yuklash (PNG, JPG)</span>
                      <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                    </label>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-200">
            {onDelete ? (
              isConfirmingDelete ? (
                <div className="flex items-center gap-2 p-1.5 bg-rose-50 border border-rose-200 rounded-lg animate-fade-in">
                  <span className="text-xs font-bold text-rose-800">Rostdan ham o'chirilsinmi?</span>
                  <button
                    type="button"
                    onClick={() => {
                      onDelete(student.id);
                      onClose();
                    }}
                    className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded text-xs font-bold transition-colors cursor-pointer shadow-xs"
                  >
                    Ha, o'chirish
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsConfirmingDelete(false)}
                    className="px-2 py-1 bg-white hover:bg-slate-100 text-slate-700 rounded text-xs font-medium border border-slate-200 transition-colors cursor-pointer"
                  >
                    Yo'q
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsConfirmingDelete(true)}
                  className="text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer border border-rose-200"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                  <span>O'quvchini o'chirish</span>
                </button>
              )
            ) : <div />}

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Bekor qilish (ESC)
              </button>
              <button
                type="submit"
                disabled={hasStrictBlockingConflict}
                className="px-5 py-2.5 text-xs font-bold rounded-xl bg-blue-700 hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed text-white shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer active:scale-95"
              >
                <Check className="w-4 h-4" />
                <span>Saqlash</span>
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* AI Leaders & Coursera Automation Modal */}
      {isAiLeadersOpen && (
        <AiLeadersAutomationModal
          isOpen={isAiLeadersOpen}
          onClose={() => setIsAiLeadersOpen(false)}
          student={formData}
          classGroup={classGroup}
          onSaveStudent={(upd) => {
            setFormData(upd);
            onSave(upd);
          }}
        />
      )}
    </div>
  );
};
