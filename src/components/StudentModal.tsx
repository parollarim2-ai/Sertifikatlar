import React, { useState, useEffect, useRef } from 'react';
import { Student, ClassGroup } from '../types';
import { printCertificate } from '../utils/certificateGenerator';
import { checkStudentConflicts, extractPassportDigits } from '../utils/studentValidator';
import { recordCertifyEvent } from '../utils/operatorSpeedTracker';
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
  Clock
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
  const [quickCopiedField, setQuickCopiedField] = useState('');
  const [isAiLeadersOpen, setIsAiLeadersOpen] = useState(false);

  const passportInputRef = useRef<HTMLInputElement>(null);

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
      setFormData({ ...student });
      setIsProblemMode(!!student.hasError);
      setPasteNotice('');
      setAllowDuplicateName(false);
    }
  }, [student]);

  if (!isOpen || !student) return null;

  // Real-time conflict checks
  const conflicts = checkStudentConflicts(
    {
      id: formData.id,
      fullName: formData.fullName,
      passportOrId: formData.passportOrId,
      certificateLink: formData.certificateLink,
      assignedEmail: formData.assignedEmail,
    },
    allStudents,
    classes
  );

  const hasStrictBlockingConflict = 
    conflicts.hasPassportConflict || 
    conflicts.hasCertificateConflict || 
    conflicts.hasEmailConflict || 
    (conflicts.hasNameConflict && !allowDuplicateName);

  // Fast paste from clipboard
  const handlePasteClipboardLink = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text && text.trim().startsWith('http')) {
          setFormData(prev => ({
            ...prev,
            certificateLink: text.trim(),
            status: 'certified',
            hasError: false,
            errorReason: '',
            certifiedAt: prev.certifiedAt || new Date().toISOString(),
            certificateDate: prev.certificateDate || new Date().toISOString().split('T')[0],
            certificateNumber: prev.certificateNumber || `B1MD-${(classGroup?.name || 'MKT').replace(/[^a-zA-Z0-9]/g, '')}-${student.id.slice(-4)}`,
          }));
          setPasteNotice("Havola buferdan qo'yildi!");
          setTimeout(() => setPasteNotice(''), 2500);
          return;
        }
      }
    } catch {
      // ignore
    }

    const fallbackLink = window.prompt("Sertifikat havolasini kiriting (https://...):", formData.certificateLink || 'https://coursera.org/verify/');
    if (fallbackLink) {
      setFormData(prev => ({
        ...prev,
        certificateLink: fallbackLink.trim(),
        status: 'certified',
        hasError: false,
        errorReason: '',
        certifiedAt: prev.certifiedAt || new Date().toISOString(),
        certificateDate: prev.certificateDate || new Date().toISOString().split('T')[0],
      }));
      setPasteNotice("Havola kiritildi!");
      setTimeout(() => setPasteNotice(''), 2500);
    }
  };

  const handleCopyText = (text: string, label: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setQuickCopiedField(label);
    setTimeout(() => setQuickCopiedField(''), 1500);
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

    let updated = { ...formData };

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
          
          {/* CONFLICT ALERTS WITH COMPLETE STUDENT INFORMATION */}
          {conflicts.hasPassportConflict && conflicts.conflictingStudentByPassport && (
            <div className="p-4 bg-rose-50 border-2 border-rose-300 rounded-xl text-xs text-rose-950 space-y-2 animate-scale-up">
              <div className="flex items-center gap-2 font-bold text-rose-800">
                <AlertOctagon className="w-4 h-4 text-rose-600 flex-shrink-0" />
                <span className="text-sm">Pasport / ID seriyasi takrorlandi!</span>
              </div>
              <p className="leading-relaxed text-[11px] text-rose-900">
                Ushbu pasport seriyasi (<strong>{formData.passportOrId}</strong>) avvaldan tizimdagi o'quvchiga tegishli. Pasport raqami takrorlanishi qat'iy taqiqlanadi:
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

          {conflicts.hasCertificateConflict && conflicts.conflictingStudentByCertificate && (
            <div className="p-4 bg-rose-50 border-2 border-rose-300 rounded-xl text-xs text-rose-950 space-y-2 animate-scale-up">
              <div className="flex items-center gap-2 font-bold text-rose-800">
                <AlertOctagon className="w-4 h-4 text-rose-600 flex-shrink-0" />
                <span className="text-sm">Sertifikat havolasi takrorlandi!</span>
              </div>
              <p className="leading-relaxed text-[11px] text-rose-900">
                Ushbu sertifikat havolasi avvaldan boshqa o'quvchiga biriktirilgan. Bitta sertifikat faqat bir o'quvchiga tegishli bo'lishi shart va takrorlash qat'iy taqiqlanadi:
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

          {conflicts.hasEmailConflict && conflicts.conflictingStudentByEmail && (
            <div className="p-4 bg-rose-50 border-2 border-rose-300 rounded-xl text-xs text-rose-950 space-y-2 animate-scale-up">
              <div className="flex items-center gap-2 font-bold text-rose-800">
                <AlertOctagon className="w-4 h-4 text-rose-600 flex-shrink-0" />
                <span className="text-sm">Email manzili takrorlandi!</span>
              </div>
              <p className="leading-relaxed text-[11px] text-rose-900">
                Ushbu email manzili (<strong>{formData.assignedEmail}</strong>) allaqachon boshqa o'quvchiga berilgan. Har bir o'quvchiga alohida email bo'lishi shart:
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

          {conflicts.hasNameConflict && conflicts.conflictingStudentByName && (
            <div className="p-4 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-950 space-y-2.5 animate-scale-up">
              <div className="flex items-center gap-2 font-bold text-amber-800">
                <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                <span className="text-sm">Bu ismdagi o'quvchi tizimda mavjud!</span>
              </div>
              <p className="leading-relaxed text-[11px] text-amber-900">
                Tizimda allaqachon ushbu ism-familiyali o'quvchi ro'yxatga olingan:
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

            {isAdmin && (
              <button
                type="button"
                onClick={() => setIsProblemMode(!isProblemMode)}
                className={`text-xs px-3 py-1.5 rounded-lg border font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                  isProblemMode
                    ? 'bg-rose-700 text-white border-rose-800 shadow-xs'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                {isProblemMode ? "Muammoni bekor qilish" : "Muammo / Xato deb belgilash"}
              </button>
            )}
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

            {/* Email allocation */}
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
                disabled={!isAdmin}
                value={formData.assignedEmail || ''}
                placeholder="Zaxiradan biriktiriladi"
                onChange={e => setFormData({ ...formData, assignedEmail: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg text-slate-900 font-mono focus:outline-none focus:bg-white focus:border-blue-700 disabled:opacity-75"
              />
            </div>
          </div>

          {/* Assigned Password if available */}
          {formData.assignedPassword && (
            <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs">
              <div className="flex items-center gap-2 text-slate-600">
                <Key className="w-4 h-4 text-blue-700" />
                <span>Pochta / Coursera paroli:</span>
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
                <span>Coursera / Bir Million Dasturchi Sertifikat Havolasi</span>
              </div>
              {pasteNotice && (
                <span className="text-xs text-emerald-700 font-semibold animate-pulse">
                  {pasteNotice}
                </span>
              )}
            </div>

            {isAdmin && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handlePasteClipboardLink}
                  className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-blue-700 hover:bg-blue-800 text-white shadow-xs flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <Clipboard className="w-4 h-4" />
                  <span>Havolani avtomatik buferdan qo'yish (Paste)</span>
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
              </div>
            )}

            <div className="flex items-center gap-2">
              <input
                type="url"
                disabled={!isAdmin}
                value={formData.certificateLink || ''}
                placeholder="https://coursera.org/verify/..."
                onChange={e => setFormData({ 
                  ...formData, 
                  certificateLink: e.target.value,
                  status: e.target.value.trim() ? 'certified' : 'pending'
                })}
                className="flex-1 px-3 py-2 text-xs sm:text-sm bg-white border border-slate-300 rounded-lg text-slate-900 font-mono focus:outline-none focus:border-blue-700 disabled:opacity-80"
              />
              {formData.certificateLink && (
                <a
                  href={formData.certificateLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 text-blue-700 hover:text-blue-800 bg-white border border-slate-300 rounded-lg transition-colors cursor-pointer"
                  title="Havolani ochish"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              )}
            </div>

            {/* Exact Timestamp with Seconds - ONLY FOR CERTIFIED STUDENTS */}
            {formData.status === 'certified' && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200/90 text-emerald-950 flex items-center justify-between text-xs shadow-2xs mt-2.5">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-700 flex-shrink-0">
                    <Clock className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="font-bold text-emerald-900 block text-xs">
                      Sertifikat kiritilgan aniq vaqti (sekundigacha):
                    </span>
                    <span className="font-mono text-emerald-800 text-[11px] font-semibold">
                      {formatExactCertificateTime(formData.certifiedAt || formData.certificateDate || formData.createdAt)}
                    </span>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded-full bg-emerald-200/80 text-emerald-900 text-[10px] font-black uppercase tracking-wider">
                  ✅ Tasdiqlangan
                </span>
              </div>
            )}
          </div>

          {/* Problem Details Form if problem mode is active */}
          {isProblemMode && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 space-y-3 animate-fade-in">
              <div className="flex items-center gap-2 text-rose-800 font-bold text-xs sm:text-sm">
                <AlertTriangle className="w-4 h-4" />
                <span>O'quvchida yuzaga kelgan xatolik / muammo tafsilotlari</span>
              </div>
              <p className="text-xs text-rose-700">
                Ushbu izoh sinf rahbariga uning portalida ko'rinadi, shunda ustoz hujjatni o'quvchi orqali tuzattirishi mumkin.
              </p>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Batafsil sabab:
                </label>
                <textarea
                  disabled={!isAdmin}
                  rows={3}
                  value={formData.errorReason || ''}
                  placeholder="Masalan: Metrikadagi ism va pasport mos kelmadi, yoki platformada akkount bloklandi..."
                  onChange={e => setFormData({ ...formData, errorReason: e.target.value })}
                  className="w-full px-3 py-2 text-xs sm:text-sm bg-white border border-rose-300 rounded-lg text-slate-900 focus:outline-none focus:border-rose-600 disabled:opacity-80"
                  required={isProblemMode}
                />
              </div>

              {/* Problem screenshot upload */}
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Muammo skrinshoti / rasmi (ixtiyoriy):
                </label>
                {formData.errorImage ? (
                  <div className="relative rounded-lg overflow-hidden border border-rose-300 max-h-48 group">
                    <img src={formData.errorImage} alt="Muammo rasmi" className="w-full object-cover max-h-48" />
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, errorImage: undefined })}
                        className="absolute top-2 right-2 p-1.5 rounded-md bg-rose-800 text-white hover:bg-rose-900"
                        title="Rasmni o'chirish"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ) : (
                  isAdmin && (
                    <label className="flex items-center justify-center gap-2 p-3.5 border-2 border-dashed border-rose-300 rounded-xl cursor-pointer hover:bg-rose-100/40 transition-colors">
                      <Upload className="w-4 h-4 text-rose-600" />
                      <span className="text-xs text-rose-800 font-medium">Skrinshotni yuklash (PNG, JPG)</span>
                      <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                    </label>
                  )
                )}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-200">
            {isAdmin && onDelete ? (
              <button
                type="button"
                onClick={() => {
                  if (confirm(`Rostdan ham "${student.fullName}"ni o'chirmoqchimisiz?`)) {
                    onDelete(student.id);
                    onClose();
                  }
                }}
                className="text-xs font-medium text-rose-700 hover:text-rose-800 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>O'quvchini o'chirish</span>
              </button>
            ) : <div></div>}

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Bekor qilish (ESC)
              </button>
              {isAdmin && (
                <button
                  type="submit"
                  disabled={hasStrictBlockingConflict}
                  className="px-5 py-2.5 text-xs font-bold rounded-xl bg-blue-700 hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed text-white shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>Saqlash</span>
                </button>
              )}
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
