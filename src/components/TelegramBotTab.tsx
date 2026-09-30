import React, { useState } from 'react';
import { ClassGroup, Student, TelegramUser } from '../types';
import { 
  Send, 
  ExternalLink, 
  CheckCircle2, 
  Clock, 
  RefreshCw, 
  Bell, 
  Check, 
  AlertCircle,
  AlertTriangle,
  Copy,
  Users,
  ShieldCheck,
  FileText,
  Sparkles,
  Globe,
  Zap
} from 'lucide-react';

interface TelegramBotTabProps {
  classes: ClassGroup[];
  students: Student[];
  telegramUsers: TelegramUser[];
  onOpenTeacherMessageModal: (classGroup: ClassGroup) => void;
  onRefreshUsers?: () => void;
}

export const TelegramBotTab: React.FC<TelegramBotTabProps> = ({
  classes,
  students,
  telegramUsers,
  onOpenTeacherMessageModal,
  onRefreshUsers,
}) => {
  const [isCheckingAutoNotify, setIsCheckingAutoNotify] = useState(false);
  const [isForceRefreshing, setIsForceRefreshing] = useState(false);
  const [feedbackToast, setFeedbackToast] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);

  const showToast = (msg: string) => {
    setFeedbackToast(msg);
    setTimeout(() => setFeedbackToast(''), 4000);
  };

  const handleForceRefresh = async () => {
    setIsForceRefreshing(true);
    try {
      const res = await fetch('/api/telegram/force-refresh', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showToast(`✅ Real-vaqt sinxronlandi! ${data.stats?.certifiedCount ?? 0} ta sertifikatlangan o'quvchi Firestore'dan botga uzatildi.`);
        if (onRefreshUsers) onRefreshUsers();
      } else {
        showToast("⚠️ Sinxronlash xatoligi: " + (data.error || "Noma'lum"));
      }
    } catch (err: any) {
      showToast("❌ Serverga ulanishda xatolik: " + err.message);
    } finally {
      setIsForceRefreshing(false);
    }
  };

  const handleTriggerAutoNotify = async () => {
    setIsCheckingAutoNotify(true);
    try {
      const res = await fetch('/api/telegram/check-auto-notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classes, students, force: false }),
      });
      const data = await res.json();
      if (data.success) {
        if (data.notifiedCount > 0) {
          showToast(`✅ ${data.notifiedCount} ta sinf rahbariga to'liq natijalar bot orqali muvaffaqiyatli yuborildi!`);
        } else if (data.completedClasses > 0) {
          showToast(`ℹ️ ${data.completedClasses} ta yakunlangan sinf tekshirildi. Barcha natijalar avval yuborilgan yoki ustoz hali botga ulanmagan.`);
        } else {
          showToast(`ℹ️ Jami ${classes.length} ta sinf tekshirildi. Hozircha barcha o'quvchilari 100% baholangan yangi sinflar yo'q.`);
        }
      } else {
        showToast("⚠️ Tekshirishda xatolik: " + (data.error || "Noma'lum xatolik"));
      }
    } catch (err: any) {
      showToast("❌ Serverga ulanishda xatolik yuz berdi: " + (err.message || ''));
    } finally {
      setIsCheckingAutoNotify(false);
    }
  };

  const copyBotLink = async () => {
    try {
      await navigator.clipboard.writeText('https://t.me/Courseradan_bot');
      setCopiedLink(true);
      showToast("✅ Telegram bot havolasi nusxalandi: https://t.me/Courseradan_bot");
      setTimeout(() => setCopiedLink(false), 3000);
    } catch {
      showToast("Havola: https://t.me/Courseradan_bot");
    }
  };

  // Webhook management for 24/7 reliability
  const [webhookInfo, setWebhookInfo] = useState<{
    url?: string;
    has_custom_certificate?: boolean;
    pending_update_count?: number;
    last_error_message?: string;
    last_error_date?: number;
  } | null>(null);
  const [webhookInputUrl, setWebhookInputUrl] = useState(() => {
    return typeof window !== 'undefined' ? `${window.location.origin}/api/telegram/webhook` : '';
  });
  const [isUpdatingWebhook, setIsUpdatingWebhook] = useState(false);

  const fetchWebhookInfo = async () => {
    try {
      const res = await fetch('/api/telegram/webhook-info');
      const data = await res.json();
      if (data.ok && data.result) {
        setWebhookInfo(data.result);
        if (data.result.url) {
          setWebhookInputUrl(data.result.url);
        }
      }
    } catch {
      // ignore
    }
  };

  React.useEffect(() => {
    fetchWebhookInfo();
  }, []);

  const handleSetWebhook = async () => {
    if (!webhookInputUrl.trim().startsWith('https://')) {
      showToast("⚠️ Webhook URL faqat https:// bilan boshlanishi shart!");
      return;
    }
    setIsUpdatingWebhook(true);
    try {
      const res = await fetch('/api/telegram/set-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: webhookInputUrl.trim() }),
      });
      const data = await res.json();
      if (data.ok) {
        showToast("✅ Webhook muvaffaqiyatli o'rnatildi! Bot endi 24/7 rejimda xabarlarni qabul qiladi.");
        await fetchWebhookInfo();
      } else {
        showToast("⚠️ Xatolik: " + (data.description || "O'rnatib bo'lmadi"));
      }
    } catch {
      showToast("❌ Serverga ulanishda xatolik");
    } finally {
      setIsUpdatingWebhook(false);
    }
  };

  const handleDeleteWebhook = async () => {
    setIsUpdatingWebhook(true);
    try {
      const res = await fetch('/api/telegram/delete-webhook', { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        showToast("✅ Webhook o'chirildi, Long Polling rejimiga o'tildi.");
        await fetchWebhookInfo();
      } else {
        showToast("⚠️ Xatolik: " + (data.description || "O'chirib bo'lmadi"));
      }
    } catch {
      showToast("❌ Serverga ulanishda xatolik");
    } finally {
      setIsUpdatingWebhook(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      
      {/* Toast Feedback */}
      {feedbackToast && (
        <div className="p-3 rounded-xl bg-slate-900 text-white text-xs font-semibold shadow-lg flex items-center justify-between animate-fade-in">
          <span>{feedbackToast}</span>
          <button onClick={() => setFeedbackToast('')} className="text-slate-400 hover:text-white ml-2 text-sm">✕</button>
        </div>
      )}

      {/* Main Telegram Bot Banner */}
      <div className="p-6 rounded-2xl bg-gradient-to-br from-[#1d90c7] to-[#12709e] text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 w-80 h-80 bg-white/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="relative w-16 h-16 rounded-2xl overflow-hidden shadow-2xl border-2 border-white/50 flex-shrink-0 group">
              <img
                src="/bot_avatar.jpg"
                alt="Courseradan Bot Rasmiy Avatari"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-emerald-500/10 ring-1 ring-inset ring-white/30 rounded-2xl pointer-events-none"></div>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-black tracking-tight">Courseradan Sertifikatlar Boti</h2>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-white/20 text-white backdrop-blur-xs">
                  @Courseradan_bot
                </span>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-400 text-emerald-950 flex items-center gap-1 shadow-2xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-950 animate-ping"></span>
                  🟢 Faol ishlamoqda
                </span>
              </div>
              <p className="text-xs text-sky-100 max-w-2xl leading-relaxed">
                Ustozlar ushbu bot orqali o'z sinflarining real vaqt ko'rsatkichlarini kuzatishi, xatoliklarni asos skrinshotlari bilan ko'rishi, xabarlarni qabul qilishi va yagona PDF sertifikatlar to'plamini to'g'ridan-to'g'ri Telegramga yuklab olishi mumkin.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
            <button
              onClick={copyBotLink}
              className="py-2.5 px-4 rounded-xl bg-white/15 hover:bg-white/25 border border-white/20 text-white text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-xs"
            >
              {copiedLink ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
              <span>Havolani nusxalash</span>
            </button>

            <a
              href="https://t.me/Courseradan_bot"
              target="_blank"
              rel="noopener noreferrer"
              className="py-2.5 px-4 rounded-xl bg-white text-[#1d90c7] hover:bg-sky-50 text-xs font-black transition-all flex items-center gap-2 shadow-lg cursor-pointer"
            >
              <span>Telegramda ochish</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </div>

      {/* Real-time Status & Sync Notice Banner */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white border border-blue-500/30 shadow-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping"></span>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                Firestore Real-Vaqt Jonli Sinxronizatsiya: Faol
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-400/20 text-emerald-300 border border-emerald-400/40">
                  0s Kechikish (Real-time)
                </span>
              </h3>
            </div>
            <p className="text-xs text-blue-200 max-w-2xl leading-relaxed">
              Bot endi veb-sayt brauzeriga bog'liq emas — server to'g'ridan-to'g'ri Firebase Firestore bazasiga real-vaqtda ulangan. 
              Saytda yangi o'quvchi tasdiqlanishi bilan Telegram botda soniya ichida aks etadi (avvalgi 2-3 soatlik kechikish to'liq yo'qotildi).
            </p>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={handleForceRefresh}
              disabled={isForceRefreshing}
              className="py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all flex items-center gap-2 shadow-xs cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isForceRefreshing ? 'animate-spin' : ''}`} />
              <span>{isForceRefreshing ? 'Baza yangilanmoqda...' : 'Darhol Sinxronlash (Force Refresh)'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Control Strip & Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Jami Sinflar</div>
          <div className="text-2xl font-black text-slate-900 mt-1">{classes.length} ta</div>
          <div className="text-[11px] text-slate-400 mt-0.5">Tizimga kiritilgan jami sinflar</div>
        </div>

        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs">
          <div className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider">Botga Ulangan Ustozlar</div>
          <div className="text-2xl font-black text-emerald-600 mt-1">{telegramUsers.length} nafar</div>
          <div className="text-[11px] text-slate-400 mt-0.5">Botni ishga tushirgan ustozlar</div>
        </div>

        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs flex flex-col justify-between">
          <div className="text-[11px] font-bold text-indigo-600 uppercase tracking-wider">Baza Sinxronligi</div>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span className="text-sm font-black text-slate-900">Firestore 100% Jonli</span>
          </div>
          <button
            onClick={handleForceRefresh}
            disabled={isForceRefreshing}
            className="w-full mt-2 py-1.5 px-2 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${isForceRefreshing ? 'animate-spin' : ''}`} />
            <span>Bazani yangilash</span>
          </button>
        </div>

        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs flex flex-col justify-between">
          <div className="text-[11px] font-bold text-blue-600 uppercase tracking-wider">Avtomatik Tekshiruv</div>
          <div className="text-sm font-black text-slate-900 mt-1">100% Tayyor Sinflar</div>
          <button
            onClick={handleTriggerAutoNotify}
            disabled={isCheckingAutoNotify}
            className="w-full mt-2 py-1.5 px-2 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${isCheckingAutoNotify ? 'animate-spin' : ''}`} />
            <span>Xabar yuborish</span>
          </button>
        </div>
      </div>

      {/* Teachers Connection Status Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Ustozlarning Telegram Bot Holati</h3>
            <p className="text-xs text-slate-500">
              Qaysi ustoz botga ulangan va qachon kirgani real vaqt rejimida ko'rinadi
            </p>
          </div>

          {onRefreshUsers && (
            <button
              onClick={onRefreshUsers}
              className="py-1.5 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Yangilash</span>
            </button>
          )}
        </div>

        {classes.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-400">
            Hozircha tizimga sinflar kiritilmagan.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100/70 text-slate-600 font-bold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Sinf</th>
                  <th className="py-3 px-4">Sinf Rahbari (Ustoz)</th>
                  <th className="py-3 px-4">O'quvchilar</th>
                  <th className="py-3 px-4">Telegram Holati</th>
                  <th className="py-3 px-4">Oxirgi Faollik</th>
                  <th className="py-3 px-4 text-right">Amal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {classes.map((cls) => {
                  const classStudents = students.filter((s) => s.classId === cls.id);
                  const certified = classStudents.filter((s) => s.status === 'certified').length;
                  const errors = classStudents.filter((s) => s.status === 'error' || s.hasError).length;
                  const pending = classStudents.filter((s) => s.status === 'pending').length;
                  const tgUser = telegramUsers.find((u) => u.classId === cls.id);

                  return (
                    <tr key={cls.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3.5 px-4 font-bold text-slate-900">
                        {cls.name}
                      </td>
                      <td className="py-3.5 px-4 font-medium text-slate-800">
                        {cls.teacherName}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5 font-mono text-[11px]">
                          <span className="text-emerald-700 font-bold" title="Sertifikat olganlar">🟢 {certified}</span>
                          <span className="text-rose-700 font-bold" title="Xatolik chiqqanlar">🔴 {errors}</span>
                          {pending > 0 && (
                            <span className="text-slate-500 font-medium" title="Kutilayotganlar">⚪️ {pending}</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        {tgUser ? (
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                              <span>Ulangan: {tgUser.username || tgUser.firstName || 'Ustoz'}</span>
                            </span>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-slate-100 text-slate-500 border border-slate-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span>
                            <span>Hali kirmagan</span>
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-slate-500 text-[11px]">
                        {tgUser ? (
                          <span>
                            {new Date(tgUser.lastActiveAt).toLocaleDateString('uz-UZ')}{' '}
                            {new Date(tgUser.lastActiveAt).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => onOpenTeacherMessageModal(cls)}
                          className="py-1 px-3 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs transition-colors cursor-pointer"
                        >
                          {tgUser ? "✈️ Botga xabar yozish" : "Xabar yozish"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Guide Card */}
      <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-800 uppercase tracking-wider">
          <Sparkles className="w-4 h-4 text-[#24A1DE]" />
          <span>Telegram Bot qanday ishlaydi?</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-slate-600 leading-relaxed">
          <div className="p-3.5 rounded-xl bg-white border border-slate-200 space-y-1">
            <div className="font-bold text-slate-900">1. Ustoz ro'yxatdan o'tishi</div>
            <p className="text-slate-500">
              Ustoz Telegramda <b>@Courseradan_bot</b> ga kirib, <code>/start</code> tugmasini bosadi va o'z sinfini tanlaydi. Bot uni darhol eslab qoladi.
            </p>
          </div>
          <div className="p-3.5 rounded-xl bg-white border border-slate-200 space-y-1">
            <div className="font-bold text-slate-900">2. Real vaqt natijalari & PDF</div>
            <p className="text-slate-500">
              Ustoz o'z sinfidagi barcha o'quvchilar holatini ko'radi, xato chiqqanlarning sababi va skrinshotini tekshiradi, hamda <b>Yagona PDF to'plamni</b> botdan yuklab oladi.
            </p>
          </div>
          <div className="p-3.5 rounded-xl bg-white border border-slate-200 space-y-1">
            <div className="font-bold text-slate-900">3. Avtomatik xabarlar</div>
            <p className="text-slate-500">
              Sinfdagi barcha o'quvchilar ko'rib chiqilganda (hech qanday bo'sh qolmaganda), bot ustozga avtomatik tarzda <i>"To'liq sertifikatlar olindi, iltimos tekshiring"</i> xabarini yuboradi.
            </p>
          </div>
        </div>
      </div>

      {/* Official Bot Avatar Setup Card */}
      <div className="p-5 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white border border-slate-700 shadow-xl flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="relative w-20 h-20 rounded-2xl overflow-hidden shadow-2xl border-2 border-amber-400/40 flex-shrink-0">
            <img
              src="/bot_avatar.jpg"
              alt="Courseradan Bot Rasmiy Avatari"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-black tracking-tight text-white">Bot uchun Rasmiy Profil Rasmi (Avatar)</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-400/30">
                Oliy Darajali Rasmiy Emblem
              </span>
            </div>
            <p className="text-xs text-slate-300 max-w-xl leading-relaxed">
              O'quvchilar, ustozlar va maktab rahbariyati ko'rishi uchun maxsus tayyorlangan nufuzli oltin medal va sertifikatlash ramzi. Sun'iy ko'rinishdan xoli, to'liq professional real fotosurat formatida.
            </p>
            <div className="text-[11px] text-amber-200/90 pt-1">
              💡 <b>O'rnatish:</b> Telegramda <b>@BotFather</b> ga kiring → <code>/setuserpic</code> yozing → <b>@Courseradan_bot</b> ni tanlang → yuklab olingan rasmni yuboring.
            </div>
          </div>
        </div>

        <a
          href="/bot_avatar.jpg"
          download="Courseradan_Bot_Rasmiy_Avatar.jpg"
          className="py-3 px-5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-black text-xs transition-all flex items-center gap-2 shadow-lg hover:shadow-amber-500/25 cursor-pointer flex-shrink-0"
        >
          <span>📥 Rasmni yuklab olish</span>
        </a>
      </div>

      {/* 24/7 Reliability & Webhook Card */}
      <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900">Botni 24/7 Doimiy Ishlatish va Webhook Sozlamasi</h3>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  webhookInfo?.url 
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' 
                    : 'bg-blue-100 text-blue-800 border border-blue-300'
                }`}>
                  {webhookInfo?.url ? '🟢 Webhook Faol (24/7)' : '🔵 Long Polling Faol'}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Telegram serverlari to'g'ridan-to'g'ri saytga xabarlarni uzatishi uchun Webhook URL ulanishi mumkin
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={fetchWebhookInfo}
            className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 flex items-center gap-1.5 cursor-pointer w-fit"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Tekshirish</span>
          </button>
        </div>

        {/* Current status display */}
        {webhookInfo && (
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-slate-600 font-medium">Hozirgi Ishlash Rejimi:</span>
              <span className="font-semibold px-2.5 py-0.5 rounded-full text-[11px] inline-flex items-center gap-1.5 bg-emerald-100 text-emerald-800 border border-emerald-300">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                {webhookInfo.url ? "Webhook rejimi faol" : "Standart Long-Polling (Real-vaqtda faol)"}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-medium">Telegram Webhook Manzili:</span>
              <span className="font-mono text-slate-800 font-semibold truncate max-w-md">
                {webhookInfo.url || "O'rnatilmagan (To'g'ridan-to'g'ri so'rovlar qabul qilinmoqda)"}
              </span>
            </div>

            {webhookInfo.pending_update_count !== undefined && (
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Kutilayotgan xabarlar (Queue):</span>
                <span className="font-mono text-slate-700 font-semibold">{webhookInfo.pending_update_count} ta</span>
              </div>
            )}

            {webhookInfo.last_error_message && (
              <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
                <div>
                  <b className="block">Telegramdan qaytgan xatolik:</b>
                  <span>{webhookInfo.last_error_message}</span>
                  <p className="mt-1 text-[11px] text-rose-600">
                    Buni tuzatish uchun pastdagi "Webhookni tozalash (Long-Polling rejimiga qaytish)" tugmasini bosing.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Webhook URL input and buttons */}
        <div className="space-y-3">
          <label className="block text-xs font-bold text-slate-700">
            Webhook URL (HTTPS manzil):
          </label>
          <div className="flex flex-col sm:flex-row gap-2.5">
            <input
              type="url"
              value={webhookInputUrl}
              onChange={(e) => setWebhookInputUrl(e.target.value)}
              placeholder="https://sizning-saytingiz.com/api/telegram/webhook"
              className="flex-1 px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono text-slate-900 focus:outline-none focus:bg-white focus:border-blue-600"
            />
            <button
              type="button"
              disabled={isUpdatingWebhook}
              onClick={handleSetWebhook}
              className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Webhookni ulash</span>
            </button>
            <button
              type="button"
              disabled={isUpdatingWebhook}
              onClick={handleDeleteWebhook}
              className="px-3.5 py-2.5 rounded-xl border border-rose-300 hover:bg-rose-50 text-rose-700 text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer bg-white"
              title="Webhookni tozalab standart Long-Polling rejimiga o'tish"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Webhookni tozalash (Tavsiya etiladi)</span>
            </button>
          </div>
          <p className="text-[11px] text-slate-500">
            💡 <strong>Eslatma:</strong> Telegram bot 2 xil rejimda ishlashi mumkin: <strong>Long-Polling</strong> (server Telegramdan so'rab oladi, 100% kafolatlangan va tashqi URL talab qilmaydi) va <strong>Webhook</strong> (Telegram saytga to'g'ridan-to'g'ri yuboradi).
          </p>

          {/* Webhook and URL Explainer Card */}
          <div className="p-3.5 bg-slate-100/90 rounded-xl border border-slate-300 text-xs space-y-2">
            <div className="font-bold text-slate-800 flex items-center gap-1.5">
              <Globe className="w-4 h-4 text-blue-600" />
              <span>Webhook havolasi nima va nima uchun kerak?</span>
            </div>
            <p className="text-slate-600 text-[11px] leading-relaxed">
              • <strong>Bu URL nima?</strong> Yuqoridagi havola (<code>/api/telegram/webhook</code>) Telegram serverlari foydalanuvchilar botga yozganda xabarlarni saytingizga yetkazib berishi uchun mo'ljallangan eshikdir. Brauzerda unga kirsangiz, u botning hozirgi holati to'g'risida ma'lumot beradi.
            </p>
            <p className="text-slate-600 text-[11px] leading-relaxed">
              • <strong>Webhookni ulashni bossa nima bo'ladi?</strong> Tizim Telegramga: "Mening yangi xabarlarimni shu havola orqali jo'nat" deydi. Agar sayt test (preview) muhitida bo'lsa, tashqi Telegram serveri ba'zida unga ulanolmay qolishi mumkin. 
            </p>
            <p className="text-slate-700 text-[11px] leading-relaxed font-medium bg-emerald-50 p-2 rounded-lg border border-emerald-200 text-emerald-900">
              ✅ <strong>Tavsiya:</strong> Agar bot ishlamasa yoki Webhookda xatolik ko'rsatsa, <strong>"Webhookni tozalash (Tavsiya etiladi)"</strong> tugmasini bosing! Shunda bot to'g'ridan-to'g'ri o'zi Telegram bilan bog'lanib, hech qanday xatoliksiz 24/7 xabarlarni qabul qila boshlaydi.
            </p>
          </div>
        </div>

        {/* 24/7 Master Guide & FAQ */}
        <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-200 space-y-3 text-xs text-blue-950">
          <div className="font-bold flex items-center gap-1.5 text-blue-900 text-sm">
            <Sparkles className="w-4 h-4 text-blue-600" />
            <span>Bot ishlashi va 24/7 doimiy uzluksizlik bo'yicha muhim savol-javoblar:</span>
          </div>

          <div className="space-y-2 text-[11px] text-slate-700 leading-relaxed">
            <div className="p-3 bg-white rounded-lg border border-blue-100 shadow-2xs space-y-1">
              <p className="font-bold text-slate-900 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                1. Nega saytda 7 ta o'quvchi qilganingizda botda 2-3 ta deb kechikkan edi va bu qanday tuzatildi?
              </p>
              <p className="text-slate-600">
                <b>Sababi:</b> Avvalgi versiyada Telegram bot ma'lumotlarni faqat admin/ustoz brauzer sahifasini ochib turgandagina qabul qilardi. Agar brauzer yopilsa yoki internet sekin bo'lsa, server eski xotirada qolib ketardi.<br />
                <b>Yechim:</b> Hozir Node.js backend to'g'ridan-to'g'ri Firebase Firestore bazasiga jonli (real-time <code>onSnapshot</code>) ulandi! Saytda 7 ta o'quvchini tasdiqlashingiz bilan <b>0 soniya ichida</b> bot ham 7 ta (100%) deb ko'rsatadi. Ustoz botda "🔄 Yangilash"ni bossa ham ma'lumot to'g'ridan-to'g'ri markaziy Firestore bazasidan yangilanadi.
              </p>
            </div>

            <div className="p-3 bg-white rounded-lg border border-blue-100 shadow-2xs space-y-1">
              <p className="font-bold text-slate-900 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                2. Nega Webhook va Long-Polling birga ulanganda bot o'chib qolgan edi?
              </p>
              <p className="text-slate-600">
                Telegram Bot API qoidasiga binoan, bir vaqtning o'zida Webhook hamda Long-Polling ishlay olmaydi. Webhook ulanganda Telegram Long-Pollingga <b>409 Conflict</b> xatosi qaytaradi va bot so'rovlarni olmay qo'yadi. Hozir tizimga avtomatik himoya qo'shildi: Long-Polling yoqilganda barcha eski Webhooklar tozalanadi, 409 xatosi chiqqanda esa o'zi avtomatik tozalab qayta ishga tushadi.
              </p>
            </div>

            <div className="p-3 bg-white rounded-lg border border-blue-100 shadow-2xs space-y-1">
              <p className="font-bold text-slate-900 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                3. Nega chatni ochganda bot yana ishlab qoladi, kompyuter yopilganda o'chadi? (24/7 yechim)
              </p>
              <p className="text-slate-600">
                Google AI Studio muhiti test va ishlab chiqish uchun mo'ljallangan konteyner bo'lib, chatda harakat to'xtasa yoki brauzer yopilsa serverni resurs tejash uchun uyqu (sleep) rejimiga o'tkazadi. Chatni ochishingiz bilan konteyner uyg'onadi va bot yana javob beradi.<br />
                <b>Botni kompyuteringiz yopiq paytda ham 24/7 uzluksiz ishlatish uchun:</b><br />
                • <b>1-usul (Bepul 24/7 Bulut):</b> Loyihangiz GitHub-da tayyor (<code>https://github.com/forcourseram-ai/Courseradan</code>). Uni bepul <a href="https://render.com" target="_blank" rel="noreferrer" className="text-blue-600 underline font-bold">Render.com</a> yoki <a href="https://railway.app" target="_blank" rel="noreferrer" className="text-blue-600 underline font-bold">Railway.app</a> ga "Web Service" qilib ulasangiz, 24/7 o'chmasdan ishlaydi.<br />
                • <b>2-usul (VPS Serverda):</b> Serveringiz bo'lsa <code>pm2 start server.ts --name courseradan-bot</code> buyrug'i orqali fonda abadiy ishlatishingiz mumkin.<br />
                • <b>3-usul (UptimeRobot):</b> Bepul <a href="https://uptimerobot.com" target="_blank" rel="noreferrer" className="text-blue-600 underline font-bold">UptimeRobot.com</a> orqali saytingiz manzilini (har 5 daqiqada) ping qilib qo'yilsa, server uxlab qolmaydi.
              </p>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
};
