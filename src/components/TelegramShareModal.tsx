import React, { useState } from 'react';
import { Send, FileText, Check, X, Share2, Info } from 'lucide-react';

interface TelegramShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileName: string;
  className: string;
  teacherName: string;
  studentCount: number;
  pdfBlob?: Blob | null;
}

export const TelegramShareModal: React.FC<TelegramShareModalProps> = ({
  isOpen,
  onClose,
  fileName,
  className,
  teacherName,
  studentCount,
  pdfBlob,
}) => {
  const [copied, setCopied] = useState(false);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const shareText = `🎓 ${className} sinfining Coursera sertifikatlari ro'yxati (PDF)\n` +
    `👩‍🏫 Sinf rahbari: ${teacherName}\n` +
    `📊 Jami sertifikat olgan o'quvchilar: ${studentCount} nafar\n` +
    `📁 Fayl: ${fileName}\n\n` +
    `✅ Barcha sertifikatlar xalqaro Coursera bazasidan to'liq tekshirib tasdiqlangan.`;

  const handleSendToTelegram = async () => {
    // 1. If Web Share API with files is supported (mobile or desktop browser)
    if (pdfBlob && navigator.canShare) {
      try {
        const file = new File([pdfBlob], fileName, { type: 'application/pdf' });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: fileName,
            text: shareText,
            files: [file],
          });
          onClose();
          return;
        }
      } catch (err: any) {
        // If user cancelled share dialog or error, fall through to Telegram URL
        if (err.name === 'AbortError') return;
      }
    }

    // 2. Open Telegram Share URL which opens Telegram chat selector (Forward/Share to chat...)
    const encodedText = encodeURIComponent(shareText);
    const tgUrl = `https://t.me/share/url?url=${encodeURIComponent(window.location.origin)}&text=${encodedText}`;
    
    // Copy text to clipboard so it's conveniently ready
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      // ignore
    }

    // Open Telegram
    window.open(tgUrl, '_blank', 'noopener,noreferrer');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 border border-slate-200 overflow-hidden">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
          title="Yopish"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Telegram Header Icon */}
        <div className="flex items-center gap-3.5 mb-4">
          <div className="w-12 h-12 rounded-2xl bg-[#24A1DE] text-white flex items-center justify-center shadow-lg shadow-[#24A1DE]/25 flex-shrink-0">
            <Send className="w-6 h-6 ml-0.5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 tracking-tight">
              Fayl yuklab olindi! 🎉
            </h3>
            <p className="text-xs text-slate-500">
              Ushbu faylni Telegram orqali yubormoqchimisiz?
            </p>
          </div>
        </div>

        {/* File Details Card */}
        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 mb-4 space-y-2">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center flex-shrink-0 mt-0.5">
              <FileText className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold text-slate-900 truncate" title={fileName}>
                {fileName}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {className} sinfi • <span className="font-semibold text-emerald-600">{studentCount} ta sertifikat</span>
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-200/60 flex items-center gap-1.5 text-[11px] text-slate-500">
            <Info className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
            <span>Fayl kompyuteringiz <b>"Yuklanmalar" (Downloads)</b> jildida saqlandi.</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 px-3 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors text-center cursor-pointer"
          >
            Yo'q, kerak emas
          </button>

          <button
            type="button"
            onClick={handleSendToTelegram}
            className="flex-1 py-2.5 px-3 rounded-xl bg-[#24A1DE] hover:bg-[#1E90C7] text-white text-xs font-semibold shadow-md shadow-[#24A1DE]/25 flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4" />
                <span>Ochilyapti...</span>
              </>
            ) : (
              <>
                <Send className="w-4 h-4 ml-0.5" />
                <span>Ha, Telegramga yuborish</span>
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
};
