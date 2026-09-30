import React, { useState, useMemo } from 'react';
import { X, Sparkles, Zap, Check, AlertCircle, Mail, Database, Info, Layers } from 'lucide-react';
import { EmailAccount, Student } from '../types';
import { generateGmailVariants } from '../utils/gmailDotGenerator';

interface GmailGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingPool: EmailAccount[];
  students: Student[];
  onAddGeneratedEmails: (newEmails: EmailAccount[]) => Promise<void> | void;
}

export const GmailGeneratorModal: React.FC<GmailGeneratorModalProps> = ({
  isOpen,
  onClose,
  existingPool,
  students,
  onAddGeneratedEmails,
}) => {
  const [baseEmail, setBaseEmail] = useState('');
  const [count, setCount] = useState<number>(500);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successInfo, setSuccessInfo] = useState<{
    addedCount: number;
    skippedCount: number;
    sampleEmails: string[];
  } | null>(null);

  // Quick presets
  const presets = [50, 100, 300, 500, 1000, 2000, 3000];

  // Dynamic preview calculation
  const previewInfo = useMemo(() => {
    const trimmed = baseEmail.trim().toLowerCase();
    const atIdx = trimmed.indexOf('@');
    if (atIdx <= 0) return null;

    const rawUser = trimmed.slice(0, atIdx).replace(/\./g, '').split('+')[0];
    const domain = trimmed.slice(atIdx + 1) || 'gmail.com';
    const slots = Math.max(0, rawUser.length - 1);
    const maxDotCombos = slots > 0 ? Math.pow(2, Math.min(slots, 30)) : 1;

    // Generate 3 fast samples
    const samples: string[] = [];
    if (rawUser.length > 2) {
      samples.push(`${rawUser[0]}.${rawUser.slice(1)}@${domain}`);
      if (rawUser.length > 3) {
        samples.push(`${rawUser.slice(0, 2)}.${rawUser.slice(2)}@${domain}`);
        samples.push(`${rawUser[0]}.${rawUser[1]}.${rawUser.slice(2)}@${domain}`);
      } else {
        samples.push(`${rawUser.slice(0, 2)}.${rawUser.slice(2)}@${domain}`);
      }
    } else {
      samples.push(`${rawUser}@${domain}`);
    }

    return {
      rawUser,
      domain,
      slots,
      maxDotCombos,
      samples,
    };
  }, [baseEmail]);

  if (!isOpen) return null;

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessInfo(null);

    const emailTrimmed = baseEmail.trim().toLowerCase();
    if (!emailTrimmed || !emailTrimmed.includes('@')) {
      setErrorMsg("Iltimos, to'liq Gmail manzilingizni kiriting (masalan: misol@gmail.com)");
      return;
    }

    if (!count || count < 1 || count > 3000) {
      setErrorMsg("Generatsiya miqdori 1 tadan 3000 tagacha bo'lishi kerak.");
      return;
    }

    setIsGenerating(true);
    try {
      // Allow UI to tick before heavy work
      await new Promise((r) => setTimeout(r, 50));

      const result = generateGmailVariants({
        baseEmail: emailTrimmed,
        count,
        existingPool,
        students,
      });

      if (result.newEmails.length === 0) {
        setErrorMsg(
          "Ushbu emaildan yangi noyob variantlar hosil qilib bo'lmadi (barcha kombinatsiyalar bazada mavjud). Boshqa email kiritib ko'ring."
        );
        setIsGenerating(false);
        return;
      }

      await onAddGeneratedEmails(result.newEmails);

      setSuccessInfo({
        addedCount: result.totalGenerated,
        skippedCount: result.skippedDuplicatesCount,
        sampleEmails: result.newEmails.slice(0, 3).map((e) => e.email),
      });

      // Clear after success
      setTimeout(() => {
        onClose();
        setSuccessInfo(null);
        setBaseEmail('');
      }, 2500);
    } catch (err: any) {
      setErrorMsg(err.message || "Generatsiya jarayonida xatolik yuz berdi.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div 
        className="bg-white rounded-2xl shadow-2xl max-w-xl w-full border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-800 text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center border border-white/20">
              <Zap className="w-5 h-5 text-amber-300 fill-amber-300" />
            </div>
            <div>
              <h2 className="text-base font-bold flex items-center gap-2">
                Gmail Dot Generator
                <span className="px-2 py-0.5 rounded-full bg-amber-400 text-slate-900 text-[10px] font-black uppercase tracking-wider">
                  Avto-Generatsiya
                </span>
              </h2>
              <p className="text-xs text-blue-100">
                1 ta pochtadan 3000 tagacha noyob bo'sh emaillarni bir zumda bazaga qo'shish
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-white/80 hover:text-white rounded-xl hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleGenerate} className="p-5 overflow-y-auto space-y-4">
          {/* Explanation Banner */}
          <div className="p-3.5 rounded-xl bg-blue-50/80 border border-blue-200/80 text-xs text-blue-900 flex items-start gap-2.5">
            <Info className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-blue-950">Gmail "Dot Trick" (Nuqta usuli) qanday ishlaydi?</p>
              <p className="text-blue-800/90 leading-relaxed">
                Gmail serverlari foydalanuvchi nomidagi nuqtalarni (<code>.</code>) inobatga olmaydi. Masalan, 
                <span className="font-mono font-bold text-blue-950"> a.li@gmail.com</span> va 
                <span className="font-mono font-bold text-blue-950"> al.i@gmail.com</span> ikkalasi ham to'g'ridan-to'g'ri sizning asosiy 
                <span className="font-mono font-bold text-blue-950"> ali@gmail.com</span> pochtangizga yetib keladi. Coursera esa ularni alohida o'quvchi sifatida qabul qiladi!
              </p>
            </div>
          </div>

          {/* Success Message */}
          {successInfo && (
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-start gap-3 animate-in fade-in">
              <Check className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-sm text-emerald-950">
                  🎉 {successInfo.addedCount} ta yangi Gmail zaxiraga muvaffaqiyatli qo'shildi!
                </p>
                {successInfo.skippedCount > 0 && (
                  <p className="text-emerald-700 mt-0.5">
                    ({successInfo.skippedCount} ta bazada avvaldan mavjud bo'lgan takroriy email o'tkazib yuborildi)
                  </p>
                )}
                <div className="mt-2 pt-2 border-t border-emerald-200/60 font-mono text-[11px] text-emerald-800 space-y-0.5">
                  {successInfo.sampleEmails.map((sample, i) => (
                    <div key={i}>• {sample}</div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Error Message */}
          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Step 1: Base Gmail Input */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-800">
              1. Asosiy Gmail pochtangizni kiriting: <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Mail className="w-4 h-4" />
              </div>
              <input
                type="email"
                value={baseEmail}
                onChange={(e) => setBaseEmail(e.target.value)}
                placeholder="masalan: akramxon.coursera@gmail.com"
                required
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-medium text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all"
              />
            </div>
            <p className="text-[11px] text-slate-500">
              Barcha tasdiqlash kodlari va xabarlar aynan shu kirityotgan asosiy Gmail qutingizga tushadi.
            </p>
          </div>

          {/* Live Preview Box */}
          {previewInfo && (
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-2">
              <div className="flex items-center justify-between text-slate-700">
                <span className="font-semibold flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  Mavjud nuqtali kombinatsiyalar:
                </span>
                <span className="font-mono font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-md text-[11px]">
                  {previewInfo.maxDotCombos.toLocaleString()} ta mumkin
                </span>
              </div>
              <div className="text-[11px] text-slate-600 space-y-1">
                <div className="text-slate-500 font-medium">Namuna variantlar:</div>
                <div className="flex flex-wrap gap-1.5">
                  {previewInfo.samples.map((s, idx) => (
                    <span key={idx} className="font-mono px-2 py-0.5 bg-white border border-slate-200 rounded text-slate-800 text-[10px]">
                      {s}
                    </span>
                  ))}
                  <span className="text-[10px] text-slate-400 self-center">va boshqalar...</span>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Desired Count */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-slate-800">
                2. Nechta email generatsiya qilinsin? <span className="text-rose-500">*</span>
              </label>
              <span className="text-xs font-mono font-black text-blue-700 bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-200">
                {count.toLocaleString()} ta
              </span>
            </div>

            <input
              type="number"
              min={1}
              max={3000}
              value={count}
              onChange={(e) => setCount(Math.min(3000, Math.max(1, parseInt(e.target.value) || 1)))}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all"
            />

            {/* Presets */}
            <div className="flex items-center gap-1.5 flex-wrap pt-1">
              <span className="text-[11px] font-medium text-slate-500 mr-1 flex items-center gap-1">
                <Layers className="w-3 h-3 text-slate-400" />
                Tezkor tanlov:
              </span>
              {presets.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setCount(preset)}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                    count === preset
                      ? 'bg-blue-700 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  +{preset}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-500">
              Maksimal 1 urunishda: <strong>3 000 ta</strong> email. Tizim bazadagi band va bo'sh emaillarni avtomatik tekshirib, faqat yangilarini qo'shadi.
            </p>
          </div>

          {/* Database Check Notice */}
          <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200/70 text-xs text-amber-900 flex items-start gap-2.5">
            <Database className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-[11px] text-amber-800 leading-relaxed">
              <strong>Avtomatik filtr:</strong> Generatsiya qilingan har bir email hozirgi bazadagi 
              (jami {existingPool.length} ta zaxira va {students.length} ta o'quvchi) bilan solishtiriladi. 
              Band bo'lmagan, faqat yangi {count} ta email zaxiraga <strong>"Bo'sh (available)"</strong> holatida kiritiladi.
            </div>
          </div>

          {/* Actions */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isGenerating}
              className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              Bekor qilish
            </button>
            <button
              type="submit"
              disabled={isGenerating || !baseEmail.trim()}
              className="px-5 py-2.5 bg-gradient-to-r from-blue-700 to-indigo-700 hover:from-blue-800 hover:to-indigo-800 disabled:opacity-50 text-white text-xs font-bold rounded-xl flex items-center gap-2 shadow-md shadow-blue-500/20 transition-all cursor-pointer"
            >
              {isGenerating ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Tekshirilmoqda va generatsiya qilinmoqda...</span>
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4 text-amber-300 fill-amber-300" />
                  <span>Generatsiya qilish va Zaxiraga qo'shish ({count} ta)</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
