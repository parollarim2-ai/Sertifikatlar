import React, { useState, useEffect } from 'react';
import { 
  X, 
  Sparkles, 
  Zap, 
  Check, 
  AlertTriangle, 
  ExternalLink, 
  Copy, 
  Clock, 
  Play, 
  ShieldAlert, 
  RefreshCw, 
  FileText, 
  Mail, 
  Key, 
  Phone, 
  Calendar,
  AlertCircle,
  HelpCircle,
  Code
} from 'lucide-react';
import { Student, ClassGroup } from '../types';
import { extractPassportDigits } from '../utils/studentValidator';
import { 
  googleSignIn, 
  getAccessToken, 
  logoutGoogle, 
  initAuth, 
  scanGmailForActivation 
} from '../services/googleAuth';

interface AiLeadersAutomationModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: Student;
  classGroup?: ClassGroup;
  onSaveStudent: (updatedStudent: Student) => void;
}

export const AiLeadersAutomationModal: React.FC<AiLeadersAutomationModalProps> = ({
  isOpen,
  onClose,
  student,
  classGroup,
  onSaveStudent,
}) => {
  // Determine if student has Metrika or Passport
  const initialDocType = student.passportOrId?.toUpperCase().includes('I-') || 
                         student.passportOrId?.toUpperCase().startsWith('I') ||
                         !student.passportOrId?.match(/^[A-Z]{2}\d{7}$/)
                           ? 'metrika'
                           : 'passport';

  const [docType, setDocType] = useState<'metrika' | 'passport'>(initialDocType);
  const [isRunning, setIsRunning] = useState(false);
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [logs, setLogs] = useState<string[]>([]);
  const [activationLinkInput, setActivationLinkInput] = useState('');
  const [quickCopied, setQuickCopied] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [successNotice, setSuccessNotice] = useState('');

  // Google Workspace / Gmail Auth State
  const [googleUser, setGoogleUser] = useState<any>(null);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isScanningGmail, setIsScanningGmail] = useState(false);
  const [gmailNotice, setGmailNotice] = useState<string>('');

  // Extract series and number
  const rawId = (student.passportOrId || '').trim();
  const digits = extractPassportDigits(rawId) || rawId.replace(/\D/g, '').slice(-7);
  let series = '';
  if (docType === 'metrika') {
    const sMatch = rawId.match(/^[A-Za-z0-9\-]+/);
    series = sMatch ? sMatch[0].replace(/\d+$/, '').trim() : 'I-FR';
    if (!series || series.length < 2) series = 'I-FR';
  } else {
    const sMatch = rawId.match(/^[A-Za-z]{2}/);
    series = sMatch ? sMatch[0].toUpperCase() : 'AA';
  }

  const [targetEmail, setTargetEmail] = useState<string>(student.assignedEmail || 'akramxonsai.d.o.v0.2@gmail.com');

  // Compute the physical primary Gmail inbox (Google routes all dot-aliases to the dotless address)
  const baseInbox = React.useMemo(() => {
    const raw = (targetEmail || '').trim().toLowerCase();
    const at = raw.indexOf('@');
    if (at <= 0) return raw;
    const user = raw.slice(0, at).replace(/\./g, '');
    const dom = raw.slice(at + 1);
    return `${user}@${dom}`;
  }, [targetEmail]);

  const defaultPhone = '+998 (88) 005 56 88';
  const defaultPassword = 'MaktabPass2026!';

  useEffect(() => {
    if (isOpen) {
      setTargetEmail(student.assignedEmail || 'akramxonsaidov02@gmail.com');
      setLogs([]);
      setCurrentStep(0);
      setErrorMessage('');
      setSuccessNotice('');
      setGmailNotice('');
      setIsRunning(false);
    }
  }, [isOpen, student.assignedEmail]);

  useEffect(() => {
    const unsubscribe = initAuth(
      (user) => {
        setGoogleUser(user);
      },
      () => {
        setGoogleUser(null);
      }
    );
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  if (!isOpen) return null;

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setQuickCopied(label);
    setTimeout(() => setQuickCopied(''), 1500);
  };

  const addLog = (msg: string) => {
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString('uz-UZ')}] ${msg}`]);
  };

  // Launch Automated Server Runner
  const handleStartAutomation = async () => {
    setIsRunning(true);
    setErrorMessage('');
    setSuccessNotice('');
    setLogs([]);
    setCurrentStep(1);

    addLog(`🚀 O'quvchi: ${student.fullName} (${docType.toUpperCase()}) uchun avtomatlashtirish boshlandi...`);

    try {
      addLog(`🌐 https://aileaders.uz/auth/register saytiga ulanmoqda...`);
      setCurrentStep(1);

      const emailToSend = targetEmail.trim() || student.assignedEmail || 'akramxonsaidov02@gmail.com';

      const res = await fetch('/api/aileaders/automate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: student.id,
          fullName: student.fullName,
          docType,
          series,
          number: digits,
          birthDate: student.birthDate || '2010-04-15',
          email: emailToSend,
          phone: defaultPhone,
          password: defaultPassword,
          activationLink: activationLinkInput.trim() || undefined,
        }),
      });

      const data = await res.json();

      // If email was entered or edited, persist it to student
      if (emailToSend !== student.assignedEmail) {
        onSaveStudent({
          ...student,
          assignedEmail: emailToSend,
        });
      }

      if (!res.ok || data.error) {
        if (data.reason === 'NOT_FOUND' || data.error?.includes("Ma'lumot topilmadi")) {
          setErrorMessage("Qizil xatolik: 'Ma'lumot topilmadi'. O'quvchiga avtomatik xato belgilanmoqda.");
          addLog("❌ Aileaders: 'Ma'lumot topilmadi'. Tizimda o'quvchi xato deb belgilandi.");
          // Update student status to error
          onSaveStudent({
            ...student,
            hasError: true,
            errorReason: "Ma'lumot topilmadi",
            status: 'error',
          });
        } else {
          setErrorMessage(data.error || "Xatolik yuz berdi");
          addLog(`❌ Xatolik: ${data.error}`);
        }
        setIsRunning(false);
        return;
      }

      if (data.logs && Array.isArray(data.logs)) {
        data.logs.forEach((l: string) => addLog(l));
      }

      if (data.status === 'WAITING_GMAIL') {
        setCurrentStep(4);
        addLog(`⏳ Tasdiqlash xabari "${baseInbox}" pochtasiga yuborildi. Havolani quyiga qo'ying.`);
        setIsRunning(false);
        return;
      }

      if (data.success) {
        setCurrentStep(5);
        setSuccessNotice("✅ O'quvchi muvaffaqiyatli ro'yxatdan o'tkazildi!");
        addLog("🎉 O'quvchi Aileaders va Coursera dasturiga muvaffaqiyatli ulandi!");
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Server bilan aloqada xatolik");
      addLog(`❌ Xatolik: ${err.message}`);
    } finally {
      setIsRunning(false);
    }
  };

  // Connect to Google Account (allows choosing akramxonsaidov02@gmail.com)
  const handleConnectGoogle = async () => {
    setIsGoogleLoading(true);
    setErrorMessage('');
    try {
      const res = await googleSignIn();
      setGoogleUser(res.user);
      addLog(`✅ Google pochtasi ulandi: ${res.user.email}`);
    } catch (err: any) {
      if (err?.code === 'auth/popup-closed-by-user' || err?.code === 'auth/cancelled-popup-request') {
        setGmailNotice("ℹ️ Google kirish oynasi yopildi. Ulanish uchun 'Google orqali Gmail-ni ulash' tugmasini qayta bosing.");
      } else {
        setErrorMessage(`Google ulanishda xato: ${err.message}`);
        addLog(`❌ Google ulanishda xato: ${err.message}`);
      }
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleDisconnectGoogle = async () => {
    await logoutGoogle();
    setGoogleUser(null);
    addLog(`ℹ️ Google pochtasidan chiqildi`);
  };

  // Reusable activation submitter
  const triggerActivationWithLink = async (linkToUse: string) => {
    if (!linkToUse || !linkToUse.trim()) return;
    setIsRunning(true);
    setErrorMessage('');
    setSuccessNotice('');
    addLog(`🔗 Tasdiqlash havolasi ochilmoqda: ${linkToUse.trim()}...`);

    try {
      const emailToSend = targetEmail.trim() || student.assignedEmail || 'akramxonsaidov02@gmail.com';
      const res = await fetch('/api/aileaders/confirm-activation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activationLink: linkToUse.trim(),
          studentId: student.id,
          fullName: student.fullName,
          email: emailToSend,
          password: defaultPassword,
        }),
      });

      const data = await res.json();
      if (data.logs && Array.isArray(data.logs)) {
        data.logs.forEach((l: string) => addLog(l));
      }

      if (data.success) {
        setCurrentStep(5);
        setSuccessNotice("✅ O'quvchi Coursera dasturiga yuborildi! Gmail pochtangizni tekshiring.");
        addLog("🎉 Coursera so'rovi to'liq bajarildi! Gmail pochtangizni oching.");
      } else {
        setErrorMessage(data.error || "Tasdiqlashda xatolik");
        addLog(`❌ ${data.error}`);
      }
    } catch (e: any) {
      setErrorMessage(e.message);
      addLog(`❌ Server xatosi: ${e.message}`);
    } finally {
      setIsRunning(false);
    }
  };

  // Manual one-click activation link submit
  const handleActivateWithLink = async () => {
    await triggerActivationWithLink(activationLinkInput);
  };

  // Automated Gmail Scanner: Reads activation email directly from Google API
  const handleAutoScanGmail = async (autoSubmit: boolean = true) => {
    let token = await getAccessToken();
    if (!token) {
      try {
        const res = await googleSignIn();
        setGoogleUser(res.user);
        token = res.accessToken;
      } catch (err: any) {
        if (err.code !== 'auth/popup-closed-by-user') {
          setErrorMessage(`Google ulanishda xato: ${err.message}`);
        }
        return;
      }
    }

    setIsScanningGmail(true);
    setGmailNotice('');
    addLog(`📬 ${googleUser?.email || 'Gmail'} pochtasi Aileaders va Coursera xatlari uchun tekshirilmoqda...`);

    try {
      const result = await scanGmailForActivation(token);
      if (result.found && result.activationLink) {
        addLog(`🎯 Aileaders faollashtirish havolasi topildi: ${result.activationLink}`);
        setActivationLinkInput(result.activationLink);
        setGmailNotice(`✅ Xat topildi: "${result.subject || 'Faollashtirish xabari'}"`);
        
        if (autoSubmit) {
          addLog(`⚡️ Havola avtomatik tasdiqlash uchun yuborilmoqda...`);
          await triggerActivationWithLink(result.activationLink);
        }
      } else if (result.found && result.courseraLink) {
        addLog(`🎓 Coursera tasdiqlash havolasi topildi: ${result.courseraLink}`);
        setGmailNotice(`✅ Coursera xati topildi: "${result.subject || ''}"`);
      } else {
        addLog(`ℹ️ ${result.message || 'Xat hali pochtaga yetib kelmagan ko\'rinadi.'}`);
        setGmailNotice(result.message || "Xat topilmadi. Birozdan so'ng qayta urinib ko'ring.");
      }
    } catch (err: any) {
      addLog(`❌ Gmail tekshirishda xatolik: ${err.message}`);
      setErrorMessage(err.message);
    } finally {
      setIsScanningGmail(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden my-6 border border-slate-300">
        
        {/* Floating Quick Copied Toast */}
        {quickCopied && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 px-3.5 py-1.5 bg-slate-900/90 backdrop-blur-md text-white rounded-xl text-xs font-semibold shadow-xl flex items-center gap-1.5 animate-scale-up">
            <Check className="w-3.5 h-3.5 text-emerald-400" />
            <span>{quickCopied} nusxalandi!</span>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 border border-blue-400/40 text-blue-300 flex items-center justify-center flex-shrink-0">
              <Zap className="w-5 h-5 fill-amber-300 text-amber-300" />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base text-white flex items-center gap-2">
                <span>AI Leaders & Coursera Avtomatizatsiyasi</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                  aileaders.uz
                </span>
              </h3>
              <p className="text-xs text-blue-200 mt-0.5">
                {student.fullName} ({classGroup ? `${classGroup.name} sinfi` : "O'quvchi"})
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 max-h-[82vh] overflow-y-auto">
          
          {/* Step 1: Document Type Choice */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-700 block">
              1. Bu o'quvchi Pasport egasimi yoki Guvohnoma (Metrika)?
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setDocType('metrika')}
                className={`p-3 rounded-xl border-2 text-left font-semibold transition-all flex items-center justify-between cursor-pointer ${
                  docType === 'metrika'
                    ? 'border-blue-600 bg-blue-50 text-blue-900 shadow-xs'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                }`}
              >
                <div>
                  <div className="text-xs font-bold">👶 Guvohnoma (Metrika)</div>
                  <div className="text-[11px] text-slate-500 font-normal mt-0.5">I-FR seriya va 7 ta raqam</div>
                </div>
                {docType === 'metrika' && <Check className="w-4 h-4 text-blue-600" />}
              </button>

              <button
                type="button"
                onClick={() => setDocType('passport')}
                className={`p-3 rounded-xl border-2 text-left font-semibold transition-all flex items-center justify-between cursor-pointer ${
                  docType === 'passport'
                    ? 'border-blue-600 bg-blue-50 text-blue-900 shadow-xs'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                }`}
              >
                <div>
                  <div className="text-xs font-bold">🪪 Pasport / ID-karta</div>
                  <div className="text-[11px] text-slate-500 font-normal mt-0.5">AA/AB seriya va 7 ta raqam</div>
                </div>
                {docType === 'passport' && <Check className="w-4 h-4 text-blue-600" />}
              </button>
            </div>
          </div>

          {/* Auto-extracted Values Review */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
            <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
              <span className="text-[10px] text-slate-500 uppercase font-bold block">Seriya:</span>
              <span className="font-mono font-bold text-slate-900 text-sm">{series}</span>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
              <span className="text-[10px] text-slate-500 uppercase font-bold block">7-talik Raqam:</span>
              <span className="font-mono font-bold text-slate-900 text-sm">{digits || '—'}</span>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
              <span className="text-[10px] text-slate-500 uppercase font-bold block">Tug'ilgan sana:</span>
              <span className="font-bold text-slate-900">{student.birthDate || 'Kiritilmagan'}</span>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
              <span className="text-[10px] text-slate-500 uppercase font-bold block">Faoliyat turi:</span>
              <span className="font-bold text-blue-700">1. Maktab</span>
            </div>
          </div>

          {/* Contact and credentials */}
          <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-200 space-y-3 text-xs">
            <div className="font-bold text-blue-950 flex items-center justify-between">
              <span>Biriktirilgan Ma'lumotlar (Saytga kiritiladi):</span>
              <span className="text-[10px] font-normal text-blue-700">Tahrirlash mumkin</span>
            </div>

            {/* Editable Gmail Input with Base Inbox Indicator */}
            <div className="bg-white p-3 rounded-xl border border-blue-200 space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <label className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-blue-600" />
                  <span>Saytga kiritiladigan Gmail manzili:</span>
                </label>
                <div className="text-[11px] text-slate-500 font-mono flex items-center gap-1">
                  <span>Asosiy quti:</span>
                  <span className="font-bold text-blue-900 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">{baseInbox}</span>
                </div>
              </div>
              
              <div className="flex gap-2">
                <input
                  type="email"
                  value={targetEmail}
                  onChange={(e) => setTargetEmail(e.target.value)}
                  placeholder="masalan: akramxonsaidov02@gmail.com"
                  className="flex-1 px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white"
                />
                <button
                  type="button"
                  onClick={() => handleCopy(targetEmail, "Gmail")}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg flex items-center gap-1 cursor-pointer transition-colors"
                  title="Nusxalash"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Nusxalash</span>
                </button>
              </div>

              {/* Crucial Account Clarification Notice */}
              <div className="p-2.5 rounded-lg bg-amber-50/80 border border-amber-200 text-[11px] text-amber-950 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="leading-snug">
                  <span className="font-bold">Eslatma:</span> Siz ushbu tizimni boshqa Google profili orqali ishlatayotgan bo'lsangiz ham, tasdiqlash xabari aynan yuqoridagi <b>{targetEmail}</b> manziliga (asosiy <b>{baseInbox}</b> pochta qutisiga) jo'natiladi! Iltimos, xabarni aynan shu pochtadan qidiring.
                </div>
              </div>
            </div>

            {/* Phone and Password */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="bg-white p-2.5 rounded-xl border border-blue-200 flex items-center justify-between">
                <div>
                  <div className="text-[10px] text-slate-500 font-bold uppercase">Telefon raqam:</div>
                  <div className="font-mono font-bold text-slate-800 text-xs">{defaultPhone}</div>
                </div>
                <button type="button" onClick={() => handleCopy(defaultPhone, "Telefon")} className="p-1.5 hover:bg-slate-100 rounded-lg text-blue-600 cursor-pointer">
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="bg-white p-2.5 rounded-xl border border-blue-200 flex items-center justify-between">
                <div>
                  <div className="text-[10px] text-slate-500 font-bold uppercase">Parol:</div>
                  <div className="font-mono font-bold text-slate-800 text-xs">{defaultPassword}</div>
                </div>
                <button type="button" onClick={() => handleCopy(defaultPassword, "Parol")} className="p-1.5 hover:bg-slate-100 rounded-lg text-blue-600 cursor-pointer">
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Action Trigger Buttons */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <button
              type="button"
              disabled={isRunning}
              onClick={handleStartAutomation}
              className={`flex-1 py-3 px-4 rounded-xl text-xs sm:text-sm font-bold text-white shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer ${
                isRunning
                  ? 'bg-slate-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-blue-700 to-indigo-700 hover:from-blue-800 hover:to-indigo-800 active:scale-[0.98]'
              }`}
            >
              {isRunning ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Avtomat ishlamoqda...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-white" />
                  <span>Robotni Ishga Tushirish (Avtomatik)</span>
                </>
              )}
            </button>

            <a
              href="https://aileaders.uz/auth/register"
              target="_blank"
              rel="noopener noreferrer"
              className="py-3 px-4 rounded-xl text-xs font-bold border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <ExternalLink className="w-4 h-4 text-blue-600" />
              <span>Saytni Ochish</span>
            </a>
          </div>

          {/* Error Message */}
          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-300 text-rose-900 text-xs flex items-start gap-2.5 animate-scale-up">
              <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <span className="font-bold block">Xatolik:</span>
                <span className="text-rose-800">{errorMessage}</span>
              </div>
            </div>
          )}

          {/* Success Notice */}
          {successNotice && (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-950 text-xs flex items-center gap-2.5 animate-scale-up">
              <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <span className="font-bold">{successNotice}</span>
            </div>
          )}

          {/* Google Workspace / Gmail Auto-Reader Card */}
          <div className="p-4 rounded-xl bg-gradient-to-br from-indigo-50 via-sky-50 to-blue-50 border-2 border-indigo-200 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 animate-pulse"></span>
                <span className="text-xs font-black uppercase tracking-wider text-indigo-950">
                  ✨ 1-Usul: Gmail-ni Avtomatik Tekshirish (Parolsiz)
                </span>
              </div>
              {googleUser && (
                <span className="text-[10px] font-bold bg-emerald-600 text-white px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Check className="w-3 h-3" />
                  <span>Ulangan</span>
                </span>
              )}
            </div>

            {!googleUser ? (
              <div className="bg-white/80 p-3.5 rounded-xl border border-indigo-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="text-[11px] text-slate-700 space-y-1">
                  <p className="font-semibold text-slate-900">
                    Google parolini kiritishingiz shart emas!
                  </p>
                  <p className="text-slate-600 leading-relaxed">
                    Quyidagi tugma orqali <b>akramxonsaidov02@gmail.com</b> hisobingizni ulasangiz, robot pochtangizga kelgan Aileaders yoki Coursera tasdiq xatini o'zi qidirib topadi va 1 soniyada tasdiqlab beradi.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleConnectGoogle}
                  disabled={isGoogleLoading}
                  className="px-4 py-2.5 bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 rounded-xl font-bold text-xs shadow-sm hover:shadow transition-all flex items-center justify-center gap-2.5 flex-shrink-0 cursor-pointer"
                >
                  <svg className="w-4 h-4" viewBox="0 0 48 48">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                  </svg>
                  <span>{isGoogleLoading ? 'Ulanmoqda...' : 'Google orqali Gmail-ni ulash'}</span>
                </button>
              </div>
            ) : (
              <div className="bg-white/90 p-3.5 rounded-xl border border-emerald-300 space-y-2.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="text-xs">
                    <span className="text-slate-500 font-medium">Ulangan hisob: </span>
                    <span className="font-bold text-emerald-950 font-mono">{googleUser.email}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleAutoScanGmail(true)}
                      disabled={isScanningGmail || isRunning}
                      className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      {isScanningGmail ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Pochta tekshirilmoqda...</span>
                        </>
                      ) : (
                        <>
                          <Zap className="w-3.5 h-3.5" />
                          <span>Pochtadan Xatni O'zi Topib Tasdiqlasin</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={handleDisconnectGoogle}
                      className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer"
                      title="Boshqa hisobga o'tish"
                    >
                      Almashtirish
                    </button>
                  </div>
                </div>

                {gmailNotice && (
                  <div className="text-[11px] p-2 rounded-lg bg-emerald-50 text-emerald-900 border border-emerald-200 font-medium">
                    {gmailNotice}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Manual Gmail Activation Link Input */}
          <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-300 space-y-2.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <label className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-amber-700" />
                <span>📝 2-Usul: Havolani Qo'lda Kiritish (Aktivatsiya):</span>
              </label>
              <a
                href={`https://mail.google.com/mail/u/0/#search/noreply`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] font-bold text-blue-700 hover:text-blue-900 flex items-center gap-1 underline"
              >
                <span>Gmail'da qidirish (noreply)</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <div className="text-[11px] text-amber-900 bg-amber-100/60 p-2 rounded-lg">
              Xabar <b>noreply</b> dan <b>"Привет {student.fullName.split(' ')[0]}"</b> sarlavhasi bilan keladi. Xat ichidagi <code>https://aileaders.uz/auth/activate/...</code> havolasini quyidagi katakka qo'ying:
            </div>

            <div className="flex gap-2">
              <input
                type="url"
                value={activationLinkInput}
                onChange={e => setActivationLinkInput(e.target.value)}
                placeholder="https://aileaders.uz/auth/activate/..."
                className="flex-1 px-3 py-2 text-xs bg-white border border-amber-300 rounded-lg text-slate-900 font-mono focus:outline-none focus:border-amber-600"
              />
              <button
                type="button"
                onClick={handleActivateWithLink}
                disabled={!activationLinkInput.trim() || isRunning}
                className="px-4 py-2 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 disabled:opacity-50 text-white font-bold text-xs rounded-lg transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>Tasdiqlash & Coursera</span>
              </button>
            </div>
          </div>

          {/* Coursera Direct Fast-Track & 1-Click Join Card */}
          <div className="p-4 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-300 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-ping"></span>
                <span className="text-xs font-black uppercase tracking-wider text-blue-950">
                  ⚡️ 2-Usul: Coursera Dasturiga To'g'ridan-To'g'ri Ulanish
                </span>
              </div>
              <span className="text-[10px] font-bold bg-blue-600 text-white px-2 py-0.5 rounded-full">
                100% Kafolatlangan
              </span>
            </div>

            <p className="text-[11px] text-blue-900 leading-relaxed">
              Coursera serverlari ba'zan robotlarni tekshiruvdan o'tkazishi sababli, quyidagi tugma orqali to'g'ridan-to'g'ri o'zingizning brauzeringizda <b>learning-program-h13rq</b> dasturini ochishingiz mumkin. Brauzeringizda ushbu Gmail ochiq bo'lsa, <b>"Continue with Google"</b> tugmasi orqali 1 soniyada ro'yxatdan o'tadi va Coursera tasdiq xati Gmail'ingizga darhol tushadi:
            </p>

            <div className="flex flex-wrap items-center gap-2">
              <a
                href="https://www.coursera.org/programs/learning-program-h13rq?authMode=signup"
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 py-2.5 px-4 bg-blue-700 hover:bg-blue-800 text-white rounded-xl text-xs font-bold shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <ExternalLink className="w-4 h-4" />
                <span>Coursera Rasmiy Dasturini Ochish →</span>
              </a>

              <button
                type="button"
                onClick={() => handleCopy(student.fullName, "F.I.SH")}
                className="py-2.5 px-3 bg-white hover:bg-slate-100 text-slate-800 border border-blue-300 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                title="F.I.SH nusxalash"
              >
                <Copy className="w-3.5 h-3.5 text-blue-600" />
                <span>F.I.SH</span>
              </button>

              <button
                type="button"
                onClick={() => handleCopy(targetEmail, "Gmail")}
                className="py-2.5 px-3 bg-white hover:bg-slate-100 text-slate-800 border border-blue-300 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Gmail nusxalash"
              >
                <Copy className="w-3.5 h-3.5 text-blue-600" />
                <span>Gmail</span>
              </button>

              <button
                type="button"
                onClick={() => handleCopy(defaultPassword, "Parol")}
                className="py-2.5 px-3 bg-white hover:bg-slate-100 text-slate-800 border border-blue-300 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Parol nusxalash"
              >
                <Copy className="w-3.5 h-3.5 text-blue-600" />
                <span>Parol</span>
              </button>
            </div>
          </div>

          {/* Live Progress Logs Console */}
          {logs.length > 0 && (
            <div className="p-3.5 rounded-xl bg-slate-950 text-emerald-400 font-mono text-[11px] space-y-1 max-h-44 overflow-y-auto border border-slate-800 shadow-inner">
              <div className="text-slate-500 font-bold border-b border-slate-800 pb-1 mb-1.5 flex items-center justify-between">
                <span>🤖 Bot Jarayon Jurnali (Console Logs):</span>
                <span>{logs.length} ta yozuv</span>
              </div>
              {logs.map((log, idx) => (
                <div key={idx} className="leading-relaxed">{log}</div>
              ))}
            </div>
          )}

        </div>
      </div>
    </div>
  );
};
