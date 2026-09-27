import React, { useState } from 'react';
import { TeacherSession } from '../types';
import { 
  Smartphone, 
  Laptop, 
  Tablet, 
  ShieldAlert, 
  ShieldCheck, 
  ShieldX, 
  Trash2, 
  Search, 
  Clock, 
  CheckCircle2, 
  AlertTriangle,
  Monitor,
  RefreshCw,
  Sparkles
} from 'lucide-react';

interface SessionsManagementTabProps {
  sessions: TeacherSession[];
  currentDeviceId?: string;
  onToggleBlockDevice: (deviceId: string, block: boolean, reason?: string) => void;
  onDeleteSession: (sessionId: string) => void;
}

export const SessionsManagementTab: React.FC<SessionsManagementTabProps> = ({
  sessions,
  currentDeviceId,
  onToggleBlockDevice,
  onDeleteSession,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'blocked'>('all');
  const [blockingTarget, setBlockingTarget] = useState<TeacherSession | null>(null);
  const [blockingReason, setBlockingReason] = useState('Administrator tomonidan bloklandi');

  const totalDevices = sessions.length;
  const blockedDevices = sessions.filter(s => s.isBlocked).length;
  const activeDevices = sessions.filter(s => !s.isBlocked).length;

  const filteredSessions = sessions.filter(s => {
    if (filterStatus === 'active' && s.isBlocked) return false;
    if (filterStatus === 'blocked' && !s.isBlocked) return false;
    
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        s.deviceName.toLowerCase().includes(q) ||
        s.teacherName.toLowerCase().includes(q) ||
        s.className.toLowerCase().includes(q) ||
        s.browser.toLowerCase().includes(q) ||
        s.os.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const getDeviceIcon = (os: string, deviceName: string) => {
    const text = (os + ' ' + deviceName).toLowerCase();
    if (text.includes('iphone') || text.includes('android') || text.includes('telefon') || text.includes('galaxy') || text.includes('redmi')) {
      return <Smartphone className="w-5 h-5 text-blue-600" />;
    }
    if (text.includes('ipad') || text.includes('tablet') || text.includes('planshet')) {
      return <Tablet className="w-5 h-5 text-purple-600" />;
    }
    return <Laptop className="w-5 h-5 text-slate-700" />;
  };

  const handleBlockClick = (session: TeacherSession) => {
    if (session.isBlocked) {
      onToggleBlockDevice(session.deviceId, false);
    } else {
      setBlockingTarget(session);
      setBlockingReason('Administrator tomonidan bloklandi');
    }
  };

  const handleConfirmBlock = () => {
    if (blockingTarget) {
      onToggleBlockDevice(blockingTarget.deviceId, true, blockingReason.trim() || 'Administrator tomonidan bloklandi');
      setBlockingTarget(null);
    }
  };

  return (
    <div className="space-y-5 animate-fade-in">
      
      {/* Sessions Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <div className="bg-white border border-slate-200 rounded-2xl p-4.5 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1.5">
            <span className="text-xs font-semibold">Tizimga Kirgan Qurilmalar</span>
            <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center">
              <Monitor className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900">{totalDevices} <span className="text-xs text-slate-500 font-normal">ta qurilma</span></div>
          <div className="text-xs text-slate-500 mt-1">Ustozlar foydalangan telefon va kompyuterlar</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4.5 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1.5">
            <span className="text-xs font-semibold">Faol / Ruxsat Etilgan</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-emerald-700">{activeDevices} <span className="text-xs text-emerald-600 font-normal">ta ochiq</span></div>
          <div className="text-xs text-emerald-600 mt-1">Saytga cheklovlarsiz kirish imkoniyati bor</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4.5 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1.5">
            <span className="text-xs font-semibold">Bloklangan Qurilmalar</span>
            <div className="w-7 h-7 rounded-lg bg-rose-50 text-rose-700 flex items-center justify-center">
              <ShieldX className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-rose-700">{blockedDevices} <span className="text-xs text-rose-600 font-normal">ta taqiqlangan</span></div>
          <div className="text-xs text-rose-600 mt-1">Bu qurilmalarda sayt ochilmaydi</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            placeholder="Qurilma nomi, ustoz F.I.SH yoki sinf nomi bo'yicha qidirish..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-900 focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setFilterStatus('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              filterStatus === 'all'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Barchasi ({totalDevices})
          </button>

          <button
            type="button"
            onClick={() => setFilterStatus('active')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              filterStatus === 'active'
                ? 'bg-emerald-700 text-white'
                : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200'
            }`}
          >
            Faollar ({activeDevices})
          </button>

          <button
            type="button"
            onClick={() => setFilterStatus('blocked')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              filterStatus === 'blocked'
                ? 'bg-rose-700 text-white'
                : 'bg-rose-50 text-rose-800 hover:bg-rose-100 border border-rose-200'
            }`}
          >
            Bloklanganlar ({blockedDevices})
          </button>
        </div>
      </div>

      {/* Devices List Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
        <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-900 text-sm">Seanslar va Aniqlangan Qurilmalar</h3>
            <p className="text-xs text-slate-500">
              Qurilmani bloklasangiz, ustoz o'sha telefon yoki kompyuterdan saytga qayta kirolmaydi
            </p>
          </div>
          <span className="text-xs text-slate-500 font-mono font-medium">
            {filteredSessions.length} ta qayd
          </span>
        </div>

        {filteredSessions.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <Monitor className="w-10 h-10 text-slate-300 mx-auto" />
            <p className="text-sm font-bold text-slate-700">Seanslar mavjud emas</p>
            <p className="text-xs text-slate-400">
              Ustozlar o'z sinflariga kirishganda ularning telefon va kompyuterlari avtomatik bu yerda ko'rinadi.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-100/75 text-slate-600 uppercase text-[11px] font-bold tracking-wider border-b border-slate-200">
                <tr>
                  <th className="py-3 pl-5 pr-2">Qurilma / Model</th>
                  <th className="py-3 px-3">Ustoz va Sinf</th>
                  <th className="py-3 px-3">Operatsion Tizim & Brauzer</th>
                  <th className="py-3 px-3">Oxirgi Kirish</th>
                  <th className="py-3 px-3 text-center">Holati</th>
                  <th className="py-3 pr-5 text-right">Boshqaruv</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredSessions.map(sess => {
                  const lastActiveFormatted = sess.lastActiveAt
                    ? new Date(sess.lastActiveAt).toLocaleString('uz-UZ', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })
                    : "Yaqinda";

                  return (
                    <tr
                      key={sess.id || sess.deviceId}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        sess.isBlocked ? 'bg-rose-50/40' : ''
                      }`}
                    >
                      <td className="py-3 pl-5 pr-2">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 border ${
                            sess.isBlocked 
                              ? 'bg-rose-50 border-rose-200' 
                              : 'bg-blue-50 border-blue-200'
                          }`}>
                            {getDeviceIcon(sess.os, sess.deviceName)}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-bold text-slate-900 text-xs block">
                                {sess.deviceName}
                              </span>
                              {currentDeviceId && sess.deviceId === currentDeviceId && (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                                  Sizning joriy qurilmangiz
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-slate-400 font-mono">
                              ID: {sess.deviceId?.substring(0, 14)}...
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-3">
                        <span className="font-semibold text-slate-900 block">
                          {sess.teacherName || "Noma'lum ustoz"}
                        </span>
                        <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-bold bg-blue-50 text-blue-800 border border-blue-200">
                          {sess.className || "Sinf tanlanmagan"}
                        </span>
                      </td>

                      <td className="py-3 px-3">
                        <span className="text-slate-800 font-medium block">
                          {sess.os}
                        </span>
                        <span className="text-[11px] text-slate-500">
                          {sess.browser} {sess.screen ? `(${sess.screen})` : ''}
                        </span>
                      </td>

                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1.5 text-slate-600 font-mono text-[11px]">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          <span>{lastActiveFormatted}</span>
                        </div>
                      </td>

                      <td className="py-3 px-3 text-center">
                        {sess.isBlocked ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
                            <ShieldX className="w-3 h-3 text-rose-600" />
                            <span>Bloklangan</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                            <span>Ruxsat etilgan</span>
                          </span>
                        )}
                      </td>

                      <td className="py-3 pr-5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleBlockClick(sess)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                              sess.isBlocked
                                ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
                                : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300'
                            }`}
                          >
                            {sess.isBlocked ? (
                              <>
                                <ShieldCheck className="w-3.5 h-3.5" />
                                <span>Blokdan chiqarish</span>
                              </>
                            ) : (
                              <>
                                <ShieldX className="w-3.5 h-3.5" />
                                <span>Qurilmani bloklash</span>
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              if (confirm("Ushbu seans qaydini o'chirishni xohlaysizmi?")) {
                                onDeleteSession(sess.id || sess.deviceId);
                              }
                            }}
                            className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                            title="Seans tarixini o'chirish"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Real-time Block Confirmation Modal */}
      {blockingTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="relative w-full max-w-md bg-white border border-rose-200 rounded-3xl shadow-2xl p-6 overflow-hidden">
            <div className="flex items-center gap-3 mb-4 text-rose-600">
              <div className="w-10 h-10 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center flex-shrink-0">
                <ShieldX className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Qurilmani Darhol Bloklash</h3>
                <p className="text-xs text-slate-500">Sayt yangilanmasdan turib shu zahoti kirish to'xtatiladi</p>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 mb-4 text-xs space-y-1.5 font-mono">
              <div className="flex justify-between">
                <span className="text-slate-400">Qurilma:</span>
                <span className="font-bold text-slate-800">{blockingTarget.deviceName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Ustoz / Sinf:</span>
                <span className="font-semibold text-blue-700">{blockingTarget.teacherName} ({blockingTarget.className})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Brauzer & OS:</span>
                <span className="text-slate-700">{blockingTarget.os} • {blockingTarget.browser}</span>
              </div>
            </div>

            {currentDeviceId && blockingTarget.deviceId === currentDeviceId && (
              <div className="mb-4 p-3 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-800 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <span><strong>Diqqat:</strong> Siz ayni paytda o'zingiz foydalanayotgan qurilmani bloklamoqchisiz!</span>
              </div>
            )}

            <div className="space-y-1.5 mb-5">
              <label className="text-xs font-semibold text-slate-700 block">
                Bloklash sababi (Qurilma ekranida ko'rsatiladi):
              </label>
              <input
                type="text"
                value={blockingReason}
                onChange={e => setBlockingReason(e.target.value)}
                placeholder="Masalan: Ruxsatsiz kirish yoki xavfsizlik cheklovi"
                className="w-full px-3.5 py-2.5 text-xs bg-white border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:border-rose-600 focus:ring-2 focus:ring-rose-500/20"
                autoFocus
              />
            </div>

            <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setBlockingTarget(null)}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Bekor qilish
              </button>
              <button
                type="button"
                onClick={handleConfirmBlock}
                className="px-4 py-2.5 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white transition-all shadow-md shadow-rose-600/20 cursor-pointer flex items-center gap-1.5"
              >
                <ShieldX className="w-3.5 h-3.5" />
                <span>Ha, darhol bloklash</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
