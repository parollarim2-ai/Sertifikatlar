import React, { useState, useEffect, useMemo } from 'react';
import { ClassGroup, Student, PaymentMethod } from '../types';
import { 
  X, 
  Check, 
  AlertTriangle, 
  CreditCard, 
  Users, 
  Search, 
  CheckSquare, 
  Square,
  Sparkles,
  History,
  Clock,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Banknote,
  Building2,
  ShieldAlert,
  Copy,
  FileSearch
} from 'lucide-react';
import { getStudentTrackData } from '../utils/studentLoginHelper';
import { fetchDocumentServerTimestamps, CLASSES_COLLECTION } from '../lib/firestoreService';

interface PaymentModalProps {
  classGroup: ClassGroup | null;
  students: Student[];
  isOpen: boolean;
  onClose: () => void;
  onUpdatePayment: (
    classId: string, 
    newPaidAmount: number, 
    updatedStudentPayments?: { studentId: string; isPaid: boolean }[],
    paymentMeta?: {
      method?: PaymentMethod;
      note?: string;
      unverified?: boolean;
    }
  ) => void;
  onOpenClassDateAudit?: (classGroup: ClassGroup) => void;
}

const formatShortDateTime = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${dd}.${mm}.${yyyy} ${hh}:${min}`;
};

const formatCompactDateTime = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${dd}.${mm} ${hh}:${min}`;
};

const METHOD_LABELS: Record<PaymentMethod, { label: string; badgeClass: string }> = {
  naqd: { label: '💵 Naqd', badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  karta: { label: '💳 Karta', badgeClass: 'bg-blue-50 text-blue-800 border-blue-200' },
  otkazma: { label: "🏦 O'tkazma", badgeClass: 'bg-indigo-50 text-indigo-800 border-indigo-200' },
  tekshirish: { label: '⚠️ Tekshirish kerak', badgeClass: 'bg-amber-50 text-amber-800 border-amber-300' },
};

export const PaymentModal: React.FC<PaymentModalProps> = ({
  classGroup,
  students,
  isOpen,
  onClose,
  onUpdatePayment,
  onOpenClassDateAudit,
}) => {
  const [paidInput, setPaidInput] = useState<number>(classGroup?.paidAmount || 0);
  const [selectedPaidIds, setSelectedPaidIds] = useState<Set<string>>(new Set());
  const [studentSearch, setStudentSearch] = useState('');
  const [autoSyncAmount, setAutoSyncAmount] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'unpaid' | 'certified'>('all');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('naqd');
  const [paymentNote, setPaymentNote] = useState('');
  const [isUnverified, setIsUnverified] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [serverTimestamps, setServerTimestamps] = useState<{ createTime?: string; updateTime?: string } | null>(null);
  const [copiedTeacherPrompt, setCopiedTeacherPrompt] = useState(false);

  const track: 'ai' | 'developer' = classGroup?.projectType === 'developer' ? 'developer' : 'ai';
  const trackPaidAmount = classGroup
    ? (track === 'developer'
        ? (classGroup.devPaidAmount ?? (classGroup.id.startsWith('class-dev-') ? classGroup.paidAmount : 0))
        : (classGroup.aiPaidAmount ?? classGroup.paidAmount))
    : 0;

  // Initialize state when classGroup changes or modal opens
  useEffect(() => {
    if (classGroup) {
      setPaidInput(trackPaidAmount);
      setPaymentMethod(classGroup.paymentMethod || (classGroup.paymentUnverified ? 'tekshirish' : 'naqd'));
      setPaymentNote(classGroup.paymentNote || '');
      setIsUnverified(Boolean(classGroup.paymentUnverified));
      setShowHistory(false);
      setServerTimestamps(null);
      setCopiedTeacherPrompt(false);

      let cancelled = false;
      fetchDocumentServerTimestamps(CLASSES_COLLECTION, classGroup.id).then(meta => {
        if (!cancelled && meta) {
          setServerTimestamps(meta);
        }
      });

      const classStudents = students.filter(s => s.classId === classGroup.id);
      
      // If students already have isPaid flag, use it
      const alreadyPaidIds = new Set<string>();
      classStudents.forEach(s => {
        if (s.isPaid) {
          alreadyPaidIds.add(s.id);
        }
      });

      // If no student has isPaid flag yet but trackPaidAmount > 0:
      // Auto-mark up to (trackPaidAmount / pricePerStudent) students starting from certified ones
      if (alreadyPaidIds.size === 0 && trackPaidAmount > 0) {
        const price = track === 'developer' ? 7000 : (classGroup.pricePerStudent || 5000);
        const countToMark = Math.min(classStudents.length, Math.floor(trackPaidAmount / price));
        const sorted = [...classStudents].sort((a, b) => {
          const aCert = getStudentTrackData(a, track).status === 'certified';
          const bCert = getStudentTrackData(b, track).status === 'certified';
          if (aCert && !bCert) return -1;
          if (!aCert && bCert) return 1;
          return a.fullName.localeCompare(b.fullName);
        });
        for (let i = 0; i < countToMark; i++) {
          alreadyPaidIds.add(sorted[i].id);
        }
      }

      setSelectedPaidIds(alreadyPaidIds);
      return () => {
        cancelled = true;
      };
    }
  }, [classGroup, students, isOpen, track, trackPaidAmount]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const classStudents = useMemo(
    () => (classGroup ? students.filter(s => s.classId === classGroup.id) : []),
    [classGroup, students]
  );

  // Detect existing timestamp clues (e.g. student.paidAt or classGroup.lastPaymentAt)
  const paymentTimeClues = useMemo(() => {
    const timestamps = classStudents
      .map(s => s.paidAt)
      .filter((t): t is string => Boolean(t && !isNaN(new Date(t).getTime())))
      .sort();
    const earliestStudentPaidAt = timestamps[0];
    const latestStudentPaidAt = timestamps[timestamps.length - 1];
    const certDates = classStudents
      .map(s => getStudentTrackData(s, track).certifiedAt)
      .filter((t): t is string => Boolean(t && !isNaN(new Date(t).getTime())))
      .sort();
    return {
      studentPaidTimestampCount: timestamps.length,
      earliestStudentPaidAt,
      latestStudentPaidAt,
      latestCertifiedAt: certDates[certDates.length - 1],
    };
  }, [classStudents, track]);

  const trackHistory = useMemo(() => {
    if (!classGroup?.paymentHistory) return [];
    return classGroup.paymentHistory.filter(h => !h.track || h.track === track);
  }, [classGroup?.paymentHistory, track]);

  if (!isOpen || !classGroup) return null;

  const certifiedCount = classStudents.filter(s => getStudentTrackData(s, track).status === 'certified').length;
  const pricePerStudent = track === 'developer' ? 7000 : (classGroup.pricePerStudent || 5000);
  
  // Debt/due is strictly calculated from uploaded certificates ONLY
  const certifiedCost = certifiedCount * pricePerStudent;
  const potentialTotalCost = classStudents.length * pricePerStudent;

  const remaining = Math.max(0, certifiedCost - paidInput);
  const isFullyPaid = certifiedCost > 0 && paidInput >= certifiedCost;

  // Toggle single student paid state
  const handleToggleStudent = (studentId: string) => {
    setSelectedPaidIds(prev => {
      const next = new Set(prev);
      if (next.has(studentId)) {
        next.delete(studentId);
      } else {
        next.add(studentId);
      }
      
      if (autoSyncAmount) {
        setPaidInput(next.size * pricePerStudent);
      }
      return next;
    });
  };

  // Select first N students based on the entered payment amount
  const handleAutoSelectByAmount = () => {
    const countToMark = Math.min(classStudents.length, Math.floor(paidInput / pricePerStudent));
    const sorted = [...classStudents].sort((a, b) => {
      const aCert = getStudentTrackData(a, track).status === 'certified';
      const bCert = getStudentTrackData(b, track).status === 'certified';
      if (aCert && !bCert) return -1;
      if (!aCert && bCert) return 1;
      return a.fullName.localeCompare(b.fullName);
    });
    const newSet = new Set<string>();
    for (let i = 0; i < countToMark; i++) {
      newSet.add(sorted[i].id);
    }
    setSelectedPaidIds(newSet);
  };

  // Select all students
  const handleSelectAll = () => {
    const allIds = new Set(classStudents.map(s => s.id));
    setSelectedPaidIds(allIds);
    if (autoSyncAmount) {
      setPaidInput(allIds.size * pricePerStudent);
    }
  };

  // Select certified only
  const handleSelectCertifiedOnly = () => {
    const certIds = new Set(classStudents.filter(s => getStudentTrackData(s, track).status === 'certified').map(s => s.id));
    setSelectedPaidIds(certIds);
    if (autoSyncAmount) {
      setPaidInput(certIds.size * pricePerStudent);
    }
  };

  // Clear all selections
  const handleClearAll = () => {
    setSelectedPaidIds(new Set());
    if (autoSyncAmount) {
      setPaidInput(0);
    }
  };

  // Reset entire class payment to 0 for re-verification
  const handleResetToZero = () => {
    setPaidInput(0);
    setSelectedPaidIds(new Set());
    setIsUnverified(false);
    setPaymentMethod('naqd');
    if (!paymentNote.trim()) {
      setPaymentNote("Tekshiruv uchun 0 ga qaytarildi");
    }
  };

  // Filtered students for display in the selection list
  const filteredStudents = classStudents.filter(s => {
    if (studentSearch && !s.fullName.toLowerCase().includes(studentSearch.toLowerCase())) {
      return false;
    }
    if (statusFilter === 'paid') return selectedPaidIds.has(s.id);
    if (statusFilter === 'unpaid') return !selectedPaidIds.has(s.id);
    if (statusFilter === 'certified') return getStudentTrackData(s, track).status === 'certified';
    return true;
  });

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    
    const updatedStudentPayments = classStudents.map(s => ({
      studentId: s.id,
      isPaid: selectedPaidIds.has(s.id),
    }));

    onUpdatePayment(classGroup.id, Number(paidInput), updatedStudentPayments, {
      method: isUnverified ? 'tekshirish' : paymentMethod,
      note: paymentNote.trim(),
      unverified: isUnverified,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden border border-slate-300 my-6 flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl border flex items-center justify-center flex-shrink-0 ${
              isUnverified
                ? 'bg-amber-50 border-amber-300 text-amber-700'
                : 'bg-blue-50 border-blue-200 text-blue-700'
            }`}>
              {isUnverified ? <AlertTriangle className="w-5 h-5" /> : <CreditCard className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-bold text-slate-900">
                  To'lov va O'quvchilar Boshqaruvi
                </h3>
                {classGroup.paymentUnverified && (
                  <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                    ⚠️ Tekshirish kerak
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500">
                <strong>{classGroup.name}</strong> sinfi — Sinf rahbari: <strong>{classGroup.teacherName}</strong>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-800 rounded-lg hover:bg-slate-200 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <form onSubmit={handleSave} className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
          {/* Forensic Time Clue Banner (helps trace forgotten payments!) */}
          {(trackPaidAmount > 0 || classGroup.lastPaymentAt) && (
            <div className={`p-3.5 rounded-xl border text-xs flex items-start gap-2.5 ${
              paymentTimeClues.latestStudentPaidAt || classGroup.lastPaymentAt || serverTimestamps?.updateTime
                ? 'bg-blue-50/70 border-blue-200 text-blue-950'
                : 'bg-amber-50/80 border-amber-200 text-amber-950'
            }`}>
              <Clock className="w-4 h-4 mt-0.5 flex-shrink-0 opacity-80" />
              <div className="space-y-1.5 flex-1">
                {classGroup.lastPaymentAt || paymentTimeClues.latestStudentPaidAt ? (
                  <>
                    <div className="font-bold">
                      Mavjud to'lov vaqti izi:
                    </div>
                    <p className="text-[11px] leading-relaxed">
                      {paymentTimeClues.latestStudentPaidAt && (
                        <>
                          O'quvchilar to'langan deb belgilangan vaqt:{' '}
                          <strong className="font-mono bg-white px-1.5 py-0.5 rounded border border-blue-200">
                            {formatShortDateTime(paymentTimeClues.earliestStudentPaidAt)}
                            {paymentTimeClues.earliestStudentPaidAt !== paymentTimeClues.latestStudentPaidAt
                              ? ` — ${formatShortDateTime(paymentTimeClues.latestStudentPaidAt)}`
                              : ''}
                          </strong>
                          {' '}({paymentTimeClues.studentPaidTimestampCount} ta o'quvchida).{' '}
                        </>
                      )}
                      {classGroup.lastPaymentAt && (
                        <>
                          Oxirgi to'lov yangilanishi:{' '}
                          <strong className="font-mono bg-white px-1.5 py-0.5 rounded border border-blue-200">
                            {formatShortDateTime(classGroup.lastPaymentAt)}
                          </strong>.{' '}
                        </>
                      )}
                      {serverTimestamps?.updateTime && (
                        <>
                          Firebase serverida oxirgi saqlangan vaqt:{' '}
                          <strong className="font-mono bg-white px-1.5 py-0.5 rounded border border-blue-200">
                            {formatShortDateTime(serverTimestamps.updateTime)}
                          </strong>.{' '}
                        </>
                      )}
                      Bank / Click / Payme SMS yoki Telegram yozishmalaringizni aynan shu sana bo'yicha solishtirib ko'rishingiz mumkin.
                    </p>
                  </>
                ) : (
                  <>
                    <div className="font-bold">
                      {serverTimestamps?.updateTime
                        ? "Firebase serveridagi oxirgi o'zgarish vaqti topildi!"
                        : "Eski to'lov uchun aniq sana izi saqlanmagan"}
                    </div>
                    <p className="text-[11px] leading-relaxed">
                      {serverTimestamps?.updateTime ? (
                        <>
                          Ushbu sinf ma'lumotlari (to'lov summasi ham shu hujjatda saqlanadi) Firebase bazasida oxirgi marta{' '}
                          <strong className="font-mono bg-white px-1.5 py-0.5 rounded border border-blue-300 text-blue-950">
                            {formatShortDateTime(serverTimestamps.updateTime)}
                          </strong>{' '}
                          da yangilangan
                          {serverTimestamps.createTime ? ` (sinf yaratilgan: ${formatShortDateTime(serverTimestamps.createTime)})` : ''}.
                          {' '}Shu kun va soat atrofidagi <strong>Click / Payme / bank SMS</strong> yoki Telegram chatlaringizni tekshiring.
                        </>
                      ) : (
                        <>
                          Ushbu to'lov avvalgi versiyada faqat summa sifatida kiritilgan.
                        </>
                      )}
                      {paymentTimeClues.latestCertifiedAt && (
                        <> Sertifikat yuklangan oxirgi sana: <strong className="font-mono">{formatShortDateTime(paymentTimeClues.latestCertifiedAt)}</strong>.</>
                      )}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 pt-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          const msg = `Assalomu alaykum ${classGroup.teacherName || 'ustoz'}, hisob-kitobni tartibga solayotgan edim. ${classGroup.name} sinfining ${trackPaidAmount.toLocaleString('uz-UZ')} so'm to'lovini naqd berganmidingiz yoki karta orqali tashlaganmidingiz? Sanasini/chekini aniqlab olayotgandim, rahmat!`;
                          navigator.clipboard.writeText(msg).catch(() => {});
                          setCopiedTeacherPrompt(true);
                          setTimeout(() => setCopiedTeacherPrompt(false), 3000);
                        }}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white hover:bg-blue-50 text-blue-800 border border-blue-200 text-[11px] font-semibold transition-colors cursor-pointer"
                      >
                        {copiedTeacherPrompt ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedTeacherPrompt ? "Xabar nusxalandi!" : "Ustozdan muloyim so'rash matnini nusxalash"}</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {onOpenClassDateAudit && (
            <div className="p-3 rounded-xl bg-indigo-50/80 border border-indigo-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="text-xs text-indigo-950">
                <strong className="block">📅 Qaysi o'quvchi qachon sertifikat olganini aniq tekshirish kerakmi?</strong>
                <span className="text-[11px] text-indigo-800">
                  Har bir sertifikatning QR kodi tagidagi rasmiy sanani avtomatik o'qib, ustozga Telegram/PDF isbot tayyorlaydi.
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenClassDateAudit(classGroup);
                }}
                className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer flex-shrink-0"
              >
                <FileSearch className="w-3.5 h-3.5" />
                <span>Sertifikat sanalari bo'yicha hisob-kitob</span>
              </button>
            </div>
          )}

          {/* Summary Matrix Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-[11px] text-slate-500 block mb-0.5">Jami o'quvchilar:</span>
              <span className="text-lg font-bold text-slate-900">{classStudents.length} nafar</span>
              <span className="text-[10px] text-slate-400 block">{pricePerStudent.toLocaleString()} so'm/dona</span>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-[11px] text-slate-500 block mb-0.5">Sertifikat olganlar:</span>
              <span className="text-lg font-bold text-emerald-700">{certifiedCount} nafar</span>
              <span className="text-[10px] text-slate-400 block">{certifiedCost.toLocaleString()} so'm</span>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-[11px] text-slate-500 block mb-0.5">Sertifikatlar bo'yicha:</span>
              <span className="text-lg font-bold text-slate-900">
                {certifiedCost.toLocaleString('uz-UZ')} so'm
              </span>
              <span className="text-[10px] text-slate-400 block">
                {certifiedCount > 0 ? "Faqat yuklangan sertifikatlar" : "Hali sertifikat yuklanmagan"}
              </span>
            </div>

            <div className={`p-3 rounded-xl border ${
              isUnverified
                ? 'bg-amber-50 border-amber-300 text-amber-900'
                : certifiedCost === 0
                ? 'bg-slate-50 border-slate-200 text-slate-700'
                : isFullyPaid 
                ? 'bg-emerald-50 border-emerald-300 text-emerald-900' 
                : 'bg-amber-50 border-amber-300 text-amber-900'
            }`}>
              <span className="text-[11px] font-semibold block mb-0.5 opacity-80">
                {isUnverified ? "Holat (Shubhali):" : certifiedCost === 0 ? "To'lov holati:" : isFullyPaid ? "Holat:" : "Qoldiq (Qarz):"}
              </span>
              <span className="text-lg font-bold block truncate">
                {isUnverified
                  ? "⚠️ Tekshirish kerak"
                  : certifiedCost === 0
                  ? "0 so'm"
                  : isFullyPaid
                  ? "To'liq to'landi ✅"
                  : `${remaining.toLocaleString('uz-UZ')} so'm`}
              </span>
              <span className="text-[10px] opacity-75 block">
                Amalda: {paidInput.toLocaleString('uz-UZ')} so'm
              </span>
            </div>
          </div>

          {/* Payment Amount Input + Method & Verification Section */}
          <div className="p-4 bg-slate-50/70 border border-slate-200 rounded-xl space-y-3.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <label className="text-xs font-bold text-slate-800">
                Sinfdan qabul qilingan to'lov summasi (so'mda):
              </label>
              <label className="inline-flex items-center gap-1.5 text-xs text-blue-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={autoSyncAmount}
                  onChange={e => setAutoSyncAmount(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
                <span>Tanlangan o'quvchilarga qarab summani avtomatik hisoblash</span>
              </label>
            </div>

            <div className="relative">
              <input
                type="number"
                step="1000"
                min="0"
                value={paidInput}
                onChange={e => {
                  const val = Math.max(0, Number(e.target.value));
                  setPaidInput(val);
                }}
                className="w-full pl-4 pr-16 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 font-mono text-base font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
              <span className="absolute right-4 top-3 text-xs text-slate-400 font-bold font-sans">
                SO'M
              </span>
            </div>

            {/* Presets and auto calculation helper */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setPaidInput(certifiedCost);
                    handleSelectCertifiedOnly();
                  }}
                  className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-300 hover:bg-emerald-100 transition-colors cursor-pointer"
                >
                  Sertifikat olganlar ({certifiedCost.toLocaleString()} so'm)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPaidInput(potentialTotalCost);
                    handleSelectAll();
                  }}
                  className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-blue-50 text-blue-800 border border-blue-200 hover:bg-blue-100 transition-colors cursor-pointer"
                >
                  Oldindan hammasi ({potentialTotalCost.toLocaleString()} so'm)
                </button>
                <button
                  type="button"
                  onClick={() => setPaidInput(prev => prev + 50000)}
                  className="px-2.5 py-1 text-xs font-medium rounded-lg bg-white text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer border border-slate-200"
                >
                  +50 000 so'm
                </button>
                {paidInput > 0 && (
                  <button
                    type="button"
                    onClick={handleResetToZero}
                    className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 transition-colors cursor-pointer inline-flex items-center gap-1"
                    title="To'lovni 0 ga qaytarib, to'lanmagan holatga o'tkazish"
                  >
                    <RotateCcw className="w-3 h-3" />
                    0 ga qaytarish
                  </button>
                )}
              </div>

              {paidInput > 0 && pricePerStudent > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-500 font-medium">
                    ≈ <strong>{Math.floor(paidInput / pricePerStudent)} ta</strong> o'quvchi to'lovi
                  </span>
                  <button
                    type="button"
                    onClick={handleAutoSelectByAmount}
                    className="px-2.5 py-1 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs flex items-center gap-1 transition-colors cursor-pointer"
                    title="Kiritilgan summa miqdoridagi o'quvchilarga avtomatik galochka qo'yish"
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>{Math.min(classStudents.length, Math.floor(paidInput / pricePerStudent))} tasini belgilash</span>
                  </button>
                </div>
              )}
            </div>

            {/* Payment Method, Note & Doubtful/Unverified Flag */}
            <div className="pt-2.5 border-t border-slate-200/80 space-y-2.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-700">To'lov usuli va izoh:</span>
                <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg cursor-pointer select-none hover:bg-amber-100/70 transition-colors">
                  <input
                    type="checkbox"
                    checked={isUnverified}
                    onChange={e => {
                      const checked = e.target.checked;
                      setIsUnverified(checked);
                      if (checked) {
                        setPaymentMethod('tekshirish');
                      } else if (paymentMethod === 'tekshirish') {
                        setPaymentMethod('naqd');
                      }
                    }}
                    className="rounded text-amber-600 focus:ring-amber-500 cursor-pointer"
                  />
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-700" />
                  <span>Shubhali / Tekshirish kerak (esda yo'q)</span>
                </label>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                <button
                  type="button"
                  onClick={() => { setPaymentMethod('naqd'); setIsUnverified(false); }}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                    paymentMethod === 'naqd' && !isUnverified
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <Banknote className="w-3.5 h-3.5" />
                  Naqd pul
                </button>
                <button
                  type="button"
                  onClick={() => { setPaymentMethod('karta'); setIsUnverified(false); }}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                    paymentMethod === 'karta' && !isUnverified
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  Karta (Click)
                </button>
                <button
                  type="button"
                  onClick={() => { setPaymentMethod('otkazma'); setIsUnverified(false); }}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                    paymentMethod === 'otkazma' && !isUnverified
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <Building2 className="w-3.5 h-3.5" />
                  O'tkazma
                </button>
                <button
                  type="button"
                  onClick={() => { setPaymentMethod('tekshirish'); setIsUnverified(true); }}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                    isUnverified || paymentMethod === 'tekshirish'
                      ? 'bg-amber-600 text-white border-amber-600'
                      : 'bg-white text-amber-800 border-amber-200 hover:bg-amber-50'
                  }`}
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Tekshirish
                </button>
              </div>

              <input
                type="text"
                value={paymentNote}
                onChange={e => setPaymentNote(e.target.value)}
                placeholder="Izoh (masalan: Ustozdan chek so'raldi, yoki Click orqali soat 14:30 da tashladi)"
                maxLength={180}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Payment History (Audit Log) Collapsible Panel */}
          <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
            <button
              type="button"
              onClick={() => setShowHistory(prev => !prev)}
              className="w-full px-4 py-2.5 bg-slate-50 hover:bg-slate-100 flex items-center justify-between text-xs font-bold text-slate-800 transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <History className="w-4 h-4 text-slate-600" />
                <span>To'lovlar tarixi / Audit jurnali ({trackHistory.length} ta yozuv)</span>
              </span>
              {showHistory ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
            </button>

            {showHistory && (
              <div className="divide-y divide-slate-100 max-h-48 overflow-y-auto bg-white">
                {trackHistory.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-500">
                    Hozircha saqlangan to'lov o'zgarishlari tarixi yo'q. Bundan keyingi har bir to'lov saqlanishi sana, vaqt, usul va izoh bilan shu yerda yozilib boradi.
                  </div>
                ) : (
                  trackHistory.map(entry => {
                    const meta = METHOD_LABELS[entry.method] || METHOD_LABELS.naqd;
                    return (
                      <div key={entry.id} className="px-4 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 text-xs">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-[11px] font-semibold text-slate-600">
                              {formatShortDateTime(entry.date)}
                            </span>
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${meta.badgeClass}`}>
                              {meta.label}
                            </span>
                            {entry.unverified && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                                Shubhali
                              </span>
                            )}
                          </div>
                          {entry.note && (
                            <p className="text-[11px] text-slate-600">{entry.note}</p>
                          )}
                        </div>
                        <div className="text-right font-mono flex-shrink-0">
                          <div className="font-bold text-slate-900">
                            {entry.previousAmount.toLocaleString('uz-UZ')} → {entry.newAmount.toLocaleString('uz-UZ')} so'm
                          </div>
                          <div className={`text-[10px] font-semibold ${
                            entry.delta > 0 ? 'text-emerald-700' : entry.delta < 0 ? 'text-rose-700' : 'text-slate-500'
                          }`}>
                            {entry.delta > 0 ? `+${entry.delta.toLocaleString('uz-UZ')}` : entry.delta.toLocaleString('uz-UZ')} so'm ({entry.paidStudentCount} nafar)
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>

          {/* STUDENT-BY-STUDENT PAYMENT CHECKBOXES */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Users className="w-4 h-4 text-blue-600" />
                  <span>O'quvchilar ro'yxati va individual to'lovlar</span>
                </h4>
                <p className="text-xs text-slate-500">
                  Pulini bergan o'quvchilarga galochka (✅) qo'ying — to'langan vaqti ham alohida saqlanadi.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200">
                  To'langan: {selectedPaidIds.size} / {classStudents.length} ta
                </span>
                {paidInput > 0 && Math.floor(paidInput / pricePerStudent) !== selectedPaidIds.size && (
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-lg bg-amber-50 text-amber-800 border border-amber-200">
                    Summa bo'yicha: {Math.floor(paidInput / pricePerStudent)} ta
                  </span>
                )}
              </div>
            </div>

            {/* Filter buttons: All, Paid, Unpaid, Certified */}
            <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 pb-2">
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  statusFilter === 'all'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Barchasi ({classStudents.length})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('paid')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  statusFilter === 'paid'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200'
                }`}
              >
                To'langanlar ({selectedPaidIds.size})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('unpaid')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  statusFilter === 'unpaid'
                    ? 'bg-amber-600 text-white'
                    : 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200'
                }`}
              >
                To'lamaganlar ({classStudents.length - selectedPaidIds.size})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('certified')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  statusFilter === 'certified'
                    ? 'bg-blue-600 text-white'
                    : 'bg-blue-50 text-blue-800 hover:bg-blue-100 border border-blue-200'
                }`}
              >
                Sertifikatlilar ({certifiedCount})
              </button>
            </div>

            {/* Controls: Search and Quick Selection */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
              <div className="relative flex-1 max-w-xs">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="O'quvchi ismini qidirish..."
                  value={studentSearch}
                  onChange={e => setStudentSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-none focus:bg-white focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="px-2.5 py-1 text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md font-medium transition-colors cursor-pointer"
                >
                  Barchasini belgilash
                </button>
                <button
                  type="button"
                  onClick={handleSelectCertifiedOnly}
                  className="px-2.5 py-1 text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded-md font-medium transition-colors cursor-pointer border border-emerald-200"
                >
                  Sertifikatlilarni ({certifiedCount})
                </button>
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="px-2.5 py-1 text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-md font-medium transition-colors cursor-pointer"
                >
                  Tozalash
                </button>
              </div>
            </div>

            {/* Student Checkbox List */}
            <div className="border border-slate-200 rounded-xl overflow-hidden max-h-60 overflow-y-auto divide-y divide-slate-100 shadow-inner bg-slate-50/30">
              {filteredStudents.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">
                  O'quvchilar topilmadi
                </div>
              ) : (
                filteredStudents.map((st, idx) => {
                  const isChecked = selectedPaidIds.has(st.id);
                  const td = getStudentTrackData(st, track);
                  const isCert = td.status === 'certified';
                  const paidTime = formatCompactDateTime(st.paidAt);

                  return (
                    <div
                      key={st.id}
                      onClick={() => handleToggleStudent(st.id)}
                      className={`px-3.5 py-2.5 flex items-center justify-between transition-colors cursor-pointer select-none ${
                        isChecked 
                          ? 'bg-emerald-50/70 hover:bg-emerald-50' 
                          : 'hover:bg-slate-100/70 bg-white'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="text-emerald-600 flex-shrink-0">
                          {isChecked ? (
                            <CheckSquare className="w-4 h-4 text-emerald-600" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-300" />
                          )}
                        </div>

                        <div className="min-w-0">
                          <span className={`text-xs font-semibold block truncate ${isChecked ? 'text-emerald-950 font-bold' : 'text-slate-800'}`}>
                            {idx + 1}. {st.fullName}
                          </span>
                          <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono">
                            <span>{st.passportOrId || "Hujjat raqamisiz"}</span>
                            {paidTime && (
                              <span className="text-blue-600 font-semibold">• {paidTime}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        {isCert ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            ✅ Sertifikat bor
                          </span>
                        ) : td.hasError || td.status === 'error' ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                            ⚠️ Xatolik
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                            ⏳ Jarayonda
                          </span>
                        )}

                        <span className={`px-2 py-0.5 rounded text-[11px] font-bold font-mono ${
                          isChecked 
                            ? 'bg-emerald-600 text-white' 
                            : 'bg-slate-100 text-slate-500'
                        }`}>
                          {isChecked ? "To'landi" : "To'lanmagan"}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-between pt-3 border-t border-slate-200">
            <div className="text-xs text-slate-500">
              Belgilandi: <strong className="text-slate-800">{selectedPaidIds.size} ta</strong> o'quvchi
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Bekor qilish
              </button>
              <button
                type="submit"
                className={`px-5 py-2.5 text-xs font-bold rounded-xl text-white shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer ${
                  isUnverified
                    ? 'bg-amber-600 hover:bg-amber-700'
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                <Check className="w-4 h-4" />
                <span>
                  {isUnverified
                    ? `Shubhali deb saqlash (${paidInput.toLocaleString('uz-UZ')} so'm)`
                    : `To'lovni Saqlash (${paidInput.toLocaleString('uz-UZ')} so'm)`}
                </span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
