import React, { useState, useEffect } from 'react';
import { ClassGroup, Student } from '../types';
import { 
  X, 
  Check, 
  CheckCircle2, 
  AlertCircle, 
  CreditCard, 
  Users, 
  Search, 
  CheckSquare, 
  Square,
  Sparkles,
  ArrowRight
} from 'lucide-react';

interface PaymentModalProps {
  classGroup: ClassGroup | null;
  students: Student[];
  isOpen: boolean;
  onClose: () => void;
  onUpdatePayment: (
    classId: string, 
    newPaidAmount: number, 
    updatedStudentPayments?: { studentId: string; isPaid: boolean }[]
  ) => void;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
  classGroup,
  students,
  isOpen,
  onClose,
  onUpdatePayment,
}) => {
  const [paidInput, setPaidInput] = useState<number>(classGroup?.paidAmount || 0);
  const [selectedPaidIds, setSelectedPaidIds] = useState<Set<string>>(new Set());
  const [studentSearch, setStudentSearch] = useState('');
  const [autoSyncAmount, setAutoSyncAmount] = useState(true);

  // Initialize state when classGroup changes or modal opens
  useEffect(() => {
    if (classGroup) {
      setPaidInput(classGroup.paidAmount);

      const classStudents = students.filter(s => s.classId === classGroup.id);
      
      // If students already have isPaid flag, use it
      const alreadyPaidIds = new Set<string>();
      classStudents.forEach(s => {
        if (s.isPaid) {
          alreadyPaidIds.add(s.id);
        }
      });

      // If no student has isPaid flag yet but paidAmount > 0:
      // Auto-mark up to (paidAmount / pricePerStudent) students starting from certified ones
      if (alreadyPaidIds.size === 0 && classGroup.paidAmount > 0) {
        const price = classGroup.pricePerStudent || 5000;
        const countToMark = Math.min(classStudents.length, Math.floor(classGroup.paidAmount / price));
        // Sort certified first, then pending
        const sorted = [...classStudents].sort((a, b) => {
          if (a.status === 'certified' && b.status !== 'certified') return -1;
          if (a.status !== 'certified' && b.status === 'certified') return 1;
          return a.fullName.localeCompare(b.fullName);
        });
        for (let i = 0; i < countToMark; i++) {
          alreadyPaidIds.add(sorted[i].id);
        }
      }

      setSelectedPaidIds(alreadyPaidIds);
    }
  }, [classGroup, students, isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!isOpen || !classGroup) return null;

  const classStudents = students.filter(s => s.classId === classGroup.id);
  const certifiedCount = classStudents.filter(s => s.status === 'certified').length;
  const pricePerStudent = classGroup.pricePerStudent || 5000;
  
  // Total cost can be based on all students or certified students
  const totalCost = classStudents.length * pricePerStudent;
  const certifiedCost = certifiedCount * pricePerStudent;

  const remaining = Math.max(0, totalCost - paidInput);
  const isFullyPaid = totalCost > 0 && paidInput >= totalCost;

  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'unpaid' | 'certified'>('all');

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
      if (a.status === 'certified' && b.status !== 'certified') return -1;
      if (a.status !== 'certified' && b.status === 'certified') return 1;
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
    const certIds = new Set(classStudents.filter(s => s.status === 'certified').map(s => s.id));
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

  // Filtered students for display in the selection list
  const filteredStudents = classStudents.filter(s => {
    if (studentSearch && !s.fullName.toLowerCase().includes(studentSearch.toLowerCase())) {
      return false;
    }
    if (statusFilter === 'paid') return selectedPaidIds.has(s.id);
    if (statusFilter === 'unpaid') return !selectedPaidIds.has(s.id);
    if (statusFilter === 'certified') return s.status === 'certified';
    return true;
  });

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Prepare list of student payment updates for this class
    const updatedStudentPayments = classStudents.map(s => ({
      studentId: s.id,
      isPaid: selectedPaidIds.has(s.id),
    }));

    onUpdatePayment(classGroup.id, Number(paidInput), updatedStudentPayments);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden border border-slate-300 my-6 flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 flex items-center justify-center flex-shrink-0">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                To'lov va O'quvchilar Boshqaruvi
              </h3>
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
        <form onSubmit={handleSave} className="p-4 sm:p-6 space-y-5 overflow-y-auto flex-1">
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
              <span className="text-[11px] text-slate-500 block mb-0.5">Jami kutilgan:</span>
              <span className="text-lg font-bold text-slate-900">
                {totalCost.toLocaleString('uz-UZ')} so'm
              </span>
              <span className="text-[10px] text-slate-400 block">Sinf bo'yicha jami</span>
            </div>

            <div className={`p-3 rounded-xl border ${
              isFullyPaid 
                ? 'bg-emerald-50 border-emerald-300 text-emerald-900' 
                : 'bg-amber-50 border-amber-300 text-amber-900'
            }`}>
              <span className="text-[11px] font-semibold block mb-0.5 opacity-80">
                {isFullyPaid ? "Holat:" : "Qoldiq (Qarz):"}
              </span>
              <span className="text-lg font-bold block truncate">
                {isFullyPaid ? "To'liq to'landi ✅" : `${remaining.toLocaleString('uz-UZ')} so'm`}
              </span>
              <span className="text-[10px] opacity-75 block">
                Amalda: {paidInput.toLocaleString('uz-UZ')} so'm
              </span>
            </div>
          </div>

          {/* Payment Amount Input Section */}
          <div className="p-4 bg-slate-50/70 border border-slate-200 rounded-xl space-y-3">
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
                step="5000"
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
                    setPaidInput(totalCost);
                    handleSelectAll();
                  }}
                  className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-300 hover:bg-emerald-100 transition-colors cursor-pointer"
                >
                  Hammasi to'landi ({totalCost.toLocaleString()} so'm)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPaidInput(certifiedCost);
                    handleSelectCertifiedOnly();
                  }}
                  className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-blue-50 text-blue-800 border border-blue-200 hover:bg-blue-100 transition-colors cursor-pointer"
                >
                  Faqat sertifikat olganlar ({certifiedCost.toLocaleString()} so'm)
                </button>
                <button
                  type="button"
                  onClick={() => setPaidInput(prev => prev + 50000)}
                  className="px-2.5 py-1 text-xs font-medium rounded-lg bg-white text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer border border-slate-200"
                >
                  +50 000 so'm
                </button>
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
          </div>

          {/* STUDENT-BY-STUDENT PAYMENT CHECKBOXES (THE CORE FEATURE) */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Users className="w-4 h-4 text-blue-600" />
                  <span>O'quvchilar ro'yxati va individual to'lovlar</span>
                </h4>
                <p className="text-xs text-slate-500">
                  Pulini oldindan bergan o'quvchilarga galochka (✅) qo'ying — ular asosiy sinf jadvalida yashil rangda chiqadi.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200">
                  To'langan: {selectedPaidIds.size} / {classStudents.length} ta
                </span>
                {paidInput > 0 && Math.floor(paidInput / pricePerStudent) !== selectedPaidIds.size && (
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-lg bg-amber-50 text-amber-800 border border-amber-200">
                    Kiritilgan summa bo'yicha: {Math.floor(paidInput / pricePerStudent)} ta
                  </span>
                )}
              </div>
            </div>

            {/* Filter buttons: All, Paid, Unpaid, Certified */}
            <div className="flex items-center gap-1.5 border-b border-slate-200 pb-2">
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
            <div className="border border-slate-200 rounded-xl overflow-hidden max-h-64 overflow-y-auto divide-y divide-slate-100 shadow-inner bg-slate-50/30">
              {filteredStudents.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">
                  O'quvchilar topilmadi
                </div>
              ) : (
                filteredStudents.map((st, idx) => {
                  const isChecked = selectedPaidIds.has(st.id);
                  const isCert = st.status === 'certified';

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
                      <div className="flex items-center gap-3">
                        <div className="text-emerald-600 flex-shrink-0">
                          {isChecked ? (
                            <CheckSquare className="w-4 h-4 text-emerald-600" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-300" />
                          )}
                        </div>

                        <div>
                          <span className={`text-xs font-semibold block ${isChecked ? 'text-emerald-950 font-bold' : 'text-slate-800'}`}>
                            {idx + 1}. {st.fullName}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {st.passportOrId || "Hujjat raqamisiz"}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {isCert ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            ✅ Sertifikat bor
                          </span>
                        ) : st.status === 'error' ? (
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
                className="px-5 py-2.5 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>To'lovni Saqlash ({paidInput.toLocaleString('uz-UZ')} so'm)</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
