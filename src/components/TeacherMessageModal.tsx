import React, { useState } from 'react';
import { ClassGroup, TeacherMessage, TelegramUser } from '../types';
import { 
  X, 
  Send, 
  Image as ImageIcon, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  Trash2, 
  Bell, 
  Sparkles,
  Smartphone,
  Eye,
  Info
} from 'lucide-react';

interface TeacherMessageModalProps {
  isOpen: boolean;
  classGroup: ClassGroup;
  messages: TeacherMessage[];
  telegramUsers?: TelegramUser[];
  onClose: () => void;
  onSendMessage: (message: TeacherMessage) => void;
  onDeleteMessage: (messageId: string) => void;
}

export const TeacherMessageModal: React.FC<TeacherMessageModalProps> = ({
  isOpen,
  classGroup,
  messages,
  telegramUsers = [],
  onClose,
  onSendMessage,
  onDeleteMessage,
}) => {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [priority, setPriority] = useState<'normal' | 'important' | 'urgent'>('important');
  const [imageUrl, setImageUrl] = useState('');
  const [activeTab, setActiveTab] = useState<'write' | 'history'>('write');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sendViaTelegram, setSendViaTelegram] = useState(true);

  const connectedTgUser = telegramUsers.find(u => u.classId === classGroup.id);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!isOpen) return null;

  // Filter messages for this class
  const classMessages = messages.filter(m => m.classId === classGroup.id);
  const unreadCount = classMessages.filter(m => !m.isRead).length;

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      alert("Rasm hajmi 2MB dan oshmasligi kerak!");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setImageUrl(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      alert("Iltimos, xabar mavzusi va matnini kiriting!");
      return;
    }

    setIsSubmitting(true);

    const newMessage: TeacherMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      classId: classGroup.id,
      className: classGroup.name,
      teacherName: classGroup.teacherName,
      title: title.trim(),
      content: content.trim(),
      imageUrl: imageUrl || undefined,
      priority,
      createdAt: new Date().toISOString(),
      isRead: false,
    };

    onSendMessage(newMessage);

    // If connected to Telegram Bot and enabled, send to Telegram immediately
    if (sendViaTelegram && connectedTgUser) {
      fetch('/api/telegram/send-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId: connectedTgUser.chatId,
          title: title.trim(),
          content: content.trim(),
          priority,
        }),
      }).catch((err) => console.error("Telegram send error:", err));
    }

    setIsSubmitting(false);
    setTitle('');
    setContent('');
    setImageUrl('');
    setActiveTab('history');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-white border border-slate-300 rounded-2xl shadow-2xl overflow-hidden my-6">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 border border-blue-200 text-blue-700 flex items-center justify-center flex-shrink-0">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <span>Ustozga Xabar Yuborish</span>
                <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-blue-100 text-blue-800">
                  {classGroup.name} — {classGroup.teacherName}
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                Ustoz saytga kirganda ushbu xabar darhol ekranda birinchi bo'lib paydo bo'ladi
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="px-6 pt-3 pb-2 bg-slate-100/70 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('write')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'write'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-white text-slate-700 hover:bg-slate-200 border border-slate-200'
              }`}
            >
              Yangi xabar yozish
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('history')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'history'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-white text-slate-700 hover:bg-slate-200 border border-slate-200'
              }`}
            >
              <span>Xabarlar tarixi</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                unreadCount > 0 ? 'bg-amber-500 text-white font-black' : 'bg-slate-200 text-slate-700'
              }`}>
                {classMessages.length}
              </span>
            </button>
          </div>

          {unreadCount > 0 && (
            <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              <span>{unreadCount} ta xabarni ustoz hali ko'rmagan</span>
            </span>
          )}
        </div>

        {/* Tab 1: Write Message */}
        {activeTab === 'write' && (
          <form onSubmit={handleSend} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
            {/* Target info reminder */}
            <div className="p-3 bg-blue-50/80 border border-blue-200 rounded-xl text-xs text-blue-900 flex items-center gap-2.5">
              <Info className="w-4 h-4 text-blue-600 flex-shrink-0" />
              <span>
                Qabul qiluvchi: <strong>{classGroup.teacherName}</strong> ({classGroup.name} sinf rahbari). Xabar yuborilgach, ustoz saytga kirishi bilanoq unga xabarnoma ko'rsatiladi.
              </span>
            </div>

            {/* Telegram Bot Delivery Status */}
            {connectedTgUser ? (
              <div className="p-3 rounded-xl bg-sky-50 border border-sky-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse flex-shrink-0"></div>
                  <div>
                    <span className="font-bold text-sky-950">Telegram Bot Ulangan: </span>
                    <span className="text-sky-700 font-semibold">{connectedTgUser.username || connectedTgUser.firstName}</span>
                    <span className="text-slate-500 text-[11px] block">
                      Oxirgi faollik: {new Date(connectedTgUser.lastActiveAt).toLocaleDateString('uz-UZ')} {new Date(connectedTgUser.lastActiveAt).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
                <label className="flex items-center gap-1.5 cursor-pointer font-semibold text-[#24A1DE] select-none bg-white px-2.5 py-1.5 rounded-lg border border-sky-200 shadow-2xs">
                  <input
                    type="checkbox"
                    checked={sendViaTelegram}
                    onChange={(e) => setSendViaTelegram(e.target.checked)}
                    className="rounded text-[#24A1DE] focus:ring-[#24A1DE]"
                  />
                  <span>Bot orqali ham yuborish</span>
                </label>
              </div>
            ) : (
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-2 text-xs text-slate-500">
                <div className="w-2 h-2 rounded-full bg-slate-300 flex-shrink-0"></div>
                <span>Ustoz hali <b>@Courseradan_bot</b> ga kirmagan (Xabar sayt ichida ko'rsatiladi).</span>
              </div>
            )}

            {/* Priority */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Muhimlik darajasi:
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setPriority('normal')}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all cursor-pointer text-center ${
                    priority === 'normal'
                      ? 'border-blue-600 bg-blue-50 text-blue-800 ring-2 ring-blue-500/20'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  🟢 Oddiy eslatma
                </button>

                <button
                  type="button"
                  onClick={() => setPriority('important')}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all cursor-pointer text-center ${
                    priority === 'important'
                      ? 'border-amber-600 bg-amber-50 text-amber-900 ring-2 ring-amber-500/20'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  ⚠️ Muhim bildirishnoma
                </button>

                <button
                  type="button"
                  onClick={() => setPriority('urgent')}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all cursor-pointer text-center ${
                    priority === 'urgent'
                      ? 'border-rose-600 bg-rose-50 text-rose-900 ring-2 ring-rose-500/20 font-bold'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  🚨 Shoshilinch vazifa
                </button>
              </div>
            </div>

            {/* Subject */}
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">
                Xabar Mavzusi <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Masalan: 9-B sinfidagi o'quvchilar pasport nusxalari va to'lov haqida"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-900 focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            {/* Content Textarea */}
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">
                Batafsil Tushuntirish / Xabar Matni <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={5}
                value={content}
                onChange={e => setContent(e.target.value)}
                placeholder="Hurmatli ustoz, sinfingizdagi quyidagi o'quvchilar ma'lumotlarini tekshiring..."
                className="w-full p-3.5 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-900 focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            {/* Image Attachment */}
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">
                Rasm biriktirish (Skrinshot yoki hujjat rasmi, ixtiyoriy)
              </label>
              
              {imageUrl ? (
                <div className="relative border border-slate-300 rounded-xl p-2 bg-slate-50 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <img 
                      src={imageUrl} 
                      alt="Biriktirilgan rasm" 
                      className="w-16 h-16 object-cover rounded-lg border border-slate-200" 
                    />
                    <div>
                      <span className="text-xs font-semibold text-slate-800 block">Rasm biriktirildi</span>
                      <span className="text-[11px] text-emerald-600 font-medium">Ustoz ekranda ko'ra oladi</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setImageUrl('')}
                    className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                    title="Rasmni o'chirish"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="border border-dashed border-slate-300 hover:border-blue-400 rounded-xl p-3 bg-slate-50/50 flex items-center justify-center gap-2 cursor-pointer relative transition-colors">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <ImageIcon className="w-4 h-4 text-slate-400" />
                  <span className="text-xs font-medium text-slate-600">
                    Rasm yoki skrinshot yuklash uchun bosing (JPG, PNG)
                  </span>
                </div>
              )}
            </div>

            {/* Submit Button */}
            <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-200">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
              >
                Bekor qilish
              </button>

              <button
                type="submit"
                disabled={isSubmitting || !title.trim() || !content.trim()}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-xs inline-flex items-center gap-2 transition-all cursor-pointer"
              >
                <Send className="w-4 h-4" />
                <span>Jonli bazaga yuborish</span>
              </button>
            </div>
          </form>
        )}

        {/* Tab 2: Messages History & Read Status */}
        {activeTab === 'history' && (
          <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
            {classMessages.length === 0 ? (
              <div className="text-center py-10 space-y-2">
                <Bell className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-xs font-semibold text-slate-600">
                  Ushbu sinf ustoziga hali xabar yuborilmagan
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab('write')}
                  className="text-xs text-blue-600 font-bold hover:underline cursor-pointer"
                >
                  Birinchi xabarni yozish
                </button>
              </div>
            ) : (
              classMessages.map(msg => {
                const dateStr = new Date(msg.createdAt).toLocaleString('uz-UZ', {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                });

                return (
                  <div
                    key={msg.id}
                    className={`border rounded-xl p-4 transition-all ${
                      msg.isRead 
                        ? 'bg-white border-slate-200' 
                        : 'bg-amber-50/60 border-amber-200 shadow-xs'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-sm font-bold text-slate-900">{msg.title}</h4>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                            msg.priority === 'urgent'
                              ? 'bg-rose-100 text-rose-800'
                              : msg.priority === 'important'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}>
                            {msg.priority === 'urgent' ? '🚨 Shoshilinch' : msg.priority === 'important' ? '⚠️ Muhim' : 'Oddiy'}
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-400 block font-mono">
                          Yuborildi: {dateStr}
                        </span>
                      </div>

                      {/* Read status badge */}
                      <div className="flex items-center gap-2">
                        {msg.isRead ? (
                          <div className="text-right">
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Ko'rgan (O'qildi)</span>
                            </span>
                            {msg.readAt && (
                              <span className="text-[10px] text-slate-400 block mt-0.5">
                                {new Date(msg.readAt).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-100/80 px-2 py-0.5 rounded-full border border-amber-300">
                            <Clock className="w-3.5 h-3.5 text-amber-600 animate-pulse" />
                            <span>Hali ko'rmadi</span>
                          </span>
                        )}

                        <button
                          type="button"
                          onClick={() => onDeleteMessage(msg.id)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors cursor-pointer"
                          title="Xabarni o'chirish"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <p className="text-xs text-slate-700 mt-2.5 whitespace-pre-wrap bg-slate-50/70 p-3 rounded-lg border border-slate-100">
                      {msg.content}
                    </p>

                    {msg.imageUrl && (
                      <div className="mt-2.5">
                        <img 
                          src={msg.imageUrl} 
                          alt="Biriktirilgan rasm" 
                          className="max-h-48 rounded-lg border border-slate-200 object-contain bg-slate-900/5 cursor-pointer"
                          onClick={() => window.open(msg.imageUrl, '_blank')}
                        />
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

      </div>
    </div>
  );
};
