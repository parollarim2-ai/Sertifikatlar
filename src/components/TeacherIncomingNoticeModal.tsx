import React from 'react';
import { TeacherMessage } from '../types';
import { 
  BellRing, 
  CheckCircle2, 
  ShieldAlert, 
  AlertTriangle, 
  Clock, 
  ExternalLink,
  Sparkles
} from 'lucide-react';

interface TeacherIncomingNoticeModalProps {
  message: TeacherMessage;
  isOpen: boolean;
  onMarkAsRead: (messageId: string) => void;
}

export const TeacherIncomingNoticeModal: React.FC<TeacherIncomingNoticeModalProps> = ({
  message,
  isOpen,
  onMarkAsRead,
}) => {
  if (!isOpen || !message) return null;

  const dateStr = new Date(message.createdAt).toLocaleString('uz-UZ', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit'
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-lg bg-white border-2 border-amber-400 rounded-3xl shadow-2xl overflow-hidden animate-scale-up">
        
        {/* Urgent Glow Top Banner */}
        <div className={`px-6 py-4 flex items-center justify-between text-white ${
          message.priority === 'urgent'
            ? 'bg-rose-600'
            : message.priority === 'important'
            ? 'bg-amber-600'
            : 'bg-blue-600'
        }`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center animate-bounce-subtle">
              <BellRing className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="text-[11px] uppercase tracking-wider font-extrabold text-white/90 block">
                Maktab Ma'muriyatidan Rasmiy Bildirishnoma
              </span>
              <h3 className="text-sm font-bold text-white">
                {message.className} sinf rahbari: {message.teacherName} uchun
              </h3>
            </div>
          </div>

          <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-white/25 text-white backdrop-blur-xs">
            {message.priority === 'urgent' ? '🚨 Shoshilinch' : message.priority === 'important' ? '⚠️ Muhim' : 'Eslatma'}
          </span>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="space-y-1">
            <h2 className="text-lg font-extrabold text-slate-900 leading-snug">
              {message.title}
            </h2>
            <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span>{dateStr}</span>
            </div>
          </div>

          {/* Message Text with high readability */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm text-slate-800 leading-relaxed whitespace-pre-wrap font-sans">
            {message.content}
          </div>

          {/* Attached Image if available */}
          {message.imageUrl && (
            <div className="space-y-1.5">
              <span className="text-xs font-bold text-slate-600">Biriktirilgan rasm / skrinshot:</span>
              <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
                <img 
                  src={message.imageUrl} 
                  alt="Biriktirilgan fayl" 
                  className="w-full max-h-72 object-contain"
                />
              </div>
            </div>
          )}

          <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-800 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <span>
              Siz ushbu xabarni tasdiqlaganingizdan so'ng, admin panelda <strong>"Ko'rgan"</strong> holatiga o'tadi.
            </span>
          </div>
        </div>

        {/* Action Button */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end">
          <button
            type="button"
            onClick={() => onMarkAsRead(message.id)}
            className="w-full py-3 px-6 bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm rounded-2xl shadow-lg shadow-slate-900/20 flex items-center justify-center gap-2 transition-all cursor-pointer transform active:scale-98"
          >
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            <span>O'qidim va tushundim</span>
          </button>
        </div>

      </div>
    </div>
  );
};
