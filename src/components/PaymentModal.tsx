import React, { useState } from 'react';
import { ClassGroup, Student } from '../types';
import { X, Check, DollarSign, Wallet, CheckCircle2, AlertCircle, CreditCard } from 'lucide-react';

interface PaymentModalProps {
  classGroup: ClassGroup | null;
  students: Student[];
  isOpen: boolean;
  onClose: () => void;
  onUpdatePayment: (classId: string, newPaidAmount: number) => void;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
  classGroup,
  students,
  isOpen,
  onClose,
  onUpdatePayment,
}) => {
  const [paidInput, setPaidInput] = useState<number>(classGroup?.paidAmount || 0);

  React.useEffect(() => {
    if (classGroup) {
      setPaidInput(classGroup.paidAmount);
    }
  }, [classGroup]);

  React.useEffect(() => {
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
  const totalCost = certifiedCount * pricePerStudent;

  const remaining = Math.max(0, totalCost - paidInput);
  const isFullyPaid = totalCost > 0 && paidInput >= totalCost;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdatePayment(classGroup.id, Number(paidInput));
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden border border-slate-300">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 flex items-center justify-center flex-shrink-0">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">To'lovni Boshqarish</h3>
              <p className="text-xs text-slate-500">{classGroup.name} sinfi — Ustoz: {classGroup.teacherName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-800 rounded-lg hover:bg-slate-200 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSave} className="p-6 space-y-5">
          {/* Summary matrix */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-xs text-slate-500 block mb-1">Sertifikat olganlar:</span>
              <span className="text-xl font-bold text-slate-900">{certifiedCount} nafar</span>
              <span className="text-[11px] text-slate-400 block mt-0.5">5 000 so'm / o'quvchi</span>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-xs text-slate-500 block mb-1">Jami hisoblangan:</span>
              <span className="text-xl font-bold text-slate-900">
                {totalCost.toLocaleString('uz-UZ')} so'm
              </span>
            </div>
          </div>

          {/* Current balance card */}
          <div className={`p-4 rounded-xl border ${
            isFullyPaid 
              ? 'bg-emerald-50 border-emerald-200' 
              : 'bg-amber-50 border-amber-200'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                {isFullyPaid ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
                )}
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                    {isFullyPaid ? "Holat: To'liq to'landi" : "Qoldiq (Qarz):"}
                  </div>
                  <div className={`text-lg font-bold ${isFullyPaid ? 'text-emerald-800' : 'text-amber-800'}`}>
                    {isFullyPaid ? "To'lov to'liq amalga oshirildi ✅" : `${remaining.toLocaleString('uz-UZ')} so'm`}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <span className="text-xs text-slate-500 block">Amalda to'langan:</span>
                <span className="text-sm font-bold text-slate-900 font-mono">
                  {paidInput.toLocaleString('uz-UZ')} so'm
                </span>
              </div>
            </div>
          </div>

          {/* Payment input */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 block">
              To'langan summani belgilash (so'mda):
            </label>
            <div className="relative">
              <input
                type="number"
                step="5000"
                min="0"
                value={paidInput}
                onChange={e => setPaidInput(Math.max(0, Number(e.target.value)))}
                className="w-full pl-4 pr-16 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-mono text-base focus:outline-none focus:bg-white focus:border-blue-700"
                required
              />
              <span className="absolute right-4 top-3 text-xs text-slate-400 font-medium font-sans">
                SO'M
              </span>
            </div>

            {/* Quick action buttons */}
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={() => setPaidInput(totalCost)}
                className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-300 hover:bg-emerald-100 transition-colors cursor-pointer"
              >
                To'liq to'landi ({totalCost.toLocaleString()} so'm)
              </button>
              <button
                type="button"
                onClick={() => setPaidInput(prev => prev + 50000)}
                className="px-2.5 py-1 text-xs font-medium rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer border border-slate-200"
              >
                +50 000 so'm
              </button>
              <button
                type="button"
                onClick={() => setPaidInput(0)}
                className="px-2.5 py-1 text-xs font-medium rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors cursor-pointer border border-slate-200"
              >
                Nolga tushirish (0)
              </button>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors"
            >
              Bekor qilish
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-blue-700 hover:bg-blue-800 text-white shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>Saqlash va Yangilash</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
