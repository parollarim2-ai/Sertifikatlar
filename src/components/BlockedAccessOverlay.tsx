import React from 'react';
import { ShieldX, Smartphone, AlertOctagon, RefreshCw } from 'lucide-react';
import { TeacherSession } from '../types';

interface BlockedAccessOverlayProps {
  session: TeacherSession;
  onRefresh: () => void;
}

export const BlockedAccessOverlay: React.FC<BlockedAccessOverlayProps> = ({
  session,
  onRefresh,
}) => {
  return (
    <div className="fixed inset-0 z-[100] bg-slate-950 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-slate-900 border border-rose-500/50 rounded-3xl p-6 text-center text-white shadow-2xl relative overflow-hidden">
        
        {/* Glowing badge */}
        <div className="w-20 h-20 rounded-3xl bg-rose-500/10 border border-rose-500/30 text-rose-500 flex items-center justify-center mx-auto mb-5 shadow-lg shadow-rose-500/20">
          <ShieldX className="w-10 h-10 animate-pulse" />
        </div>

        <h1 className="text-xl font-black text-rose-400 mb-2">
          Kirish Taqiqlangan!
        </h1>
        
        <p className="text-sm text-slate-300 mb-6 leading-relaxed">
          Ushbu qurilma orqali platformaga kirish maktab administratori tomonidan cheklangan.
        </p>

        {/* Device details */}
        <div className="bg-slate-800/80 rounded-2xl p-4 text-xs text-left border border-slate-700/60 mb-6 space-y-2 font-mono">
          <div className="flex justify-between items-center text-slate-400">
            <span>Qurilma:</span>
            <span className="text-white font-bold">{session.deviceName}</span>
          </div>
          <div className="flex justify-between items-center text-slate-400">
            <span>Tizim & Brauzer:</span>
            <span className="text-slate-200">{session.os} / {session.browser}</span>
          </div>
          <div className="flex justify-between items-center text-slate-400">
            <span>Ustoz profili:</span>
            <span className="text-amber-400 font-bold">{session.teacherName} ({session.className})</span>
          </div>
          {session.blockedReason && (
            <div className="pt-2 border-t border-slate-700 text-rose-400">
              <span className="text-slate-400 block text-[11px]">Bloklash sababi:</span>
              <span className="font-sans font-semibold text-xs">{session.blockedReason}</span>
            </div>
          )}
        </div>

        <p className="text-xs text-slate-400 mb-6">
          Agar bu xatolik deb hisoblasangiz, maktab administratori bilan bog'laning.
        </p>

        <button
          type="button"
          onClick={onRefresh}
          className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 border border-slate-600 transition-colors cursor-pointer"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Holatni qayta tekshirish</span>
        </button>

      </div>
    </div>
  );
};
