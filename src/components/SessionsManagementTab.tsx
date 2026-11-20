import React, { useState, useEffect, useMemo } from 'react';
import { TeacherSession } from '../types';
import { subscribeToSessions } from '../lib/firestoreService';
import { 
  Smartphone, 
  Laptop, 
  Tablet, 
  ShieldCheck, 
  ShieldX, 
  Trash2, 
  Search, 
  Clock, 
  AlertTriangle,
  Monitor,
  RefreshCw,
  Activity,
  ChevronDown,
  ChevronUp,
  Fingerprint
} from 'lucide-react';

interface SessionsManagementTabProps {
  sessions?: TeacherSession[];
  currentDeviceId?: string;
  onToggleBlockDevice: (deviceId: string, block: boolean, reason?: string, matchingDeviceIds?: string[]) => void;
  onDeleteSession: (sessionId: string) => void;
  onUnlockExternalTeacher?: (deviceId: string) => void;
}

const formatExactTime = (iso?: string) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  const sec = String(d.getSeconds()).padStart(2, '0');
  return `${dd}.${mm} ${hh}:${min}:${sec}`;
};

const formatOnlyHms = (iso?: string) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
};

const formatAgoUz = (diffMs: number): string => {
  const sec = Math.max(0, Math.floor(diffMs / 1000));
  if (sec < 5) return 'Hozirgina';
  if (sec < 60) return `${sec} soniya oldin`;
  const min = Math.floor(sec / 60);
  const remSec = sec % 60;
  if (min < 60) return `${min} daq ${remSec} s oldin`;
  const hr = Math.floor(min / 60);
  const remMin = min % 60;
  if (hr < 24) return `${hr} soat ${remMin} daq oldin`;
  const days = Math.floor(hr / 24);
  return `${days} kun oldin`;
};

type PresenceState = 'live' | 'idle' | 'offline';

function getPresenceState(sess: TeacherSession, nowMs: number): {
  state: PresenceState;
  diffMs: number;
} {
  const lastMs = sess.lastActiveAt ? new Date(sess.lastActiveAt).getTime() : 0;
  const diffMs = lastMs > 0 ? Math.max(0, nowMs - lastMs) : Number.MAX_SAFE_INTEGER;
  if (sess.isOnline === false) {
    return { state: 'offline', diffMs };
  }
  if (diffMs <= 45_000) {
    return { state: 'live', diffMs };
  }
  if (diffMs <= 120_000) {
    return { state: 'idle', diffMs };
  }
  return { state: 'offline', diffMs };
}

export const SessionsManagementTab: React.FC<SessionsManagementTabProps> = ({
  sessions: initialSessions,
  currentDeviceId,
  onToggleBlockDevice,
  onDeleteSession,
  onUnlockExternalTeacher,
}) => {
  const [liveSessions, setLiveSessions] = useState<TeacherSession[]>(initialSessions || []);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'live' | 'active' | 'blocked'>('all');
  const [blockingTarget, setBlockingTarget] = useState<TeacherSession | null>(null);
  const [blockingReason, setBlockingReason] = useState('Administrator tomonidan bloklandi');
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);

  // Isolated subscription to sessions ONLY while Seanslar tab is mounted
  useEffect(() => {
    const unsub = subscribeToSessions((remote) => {
      setLiveSessions(remote);
    });
    return () => unsub();
  }, []);

  const sessions = liveSessions;

  // Live 1-second ticker isolated inside Sessions tab
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const sortedSessions = useMemo(() => {
    return [...sessions].sort((a, b) => {
      const aPres = getPresenceState(a, nowMs);
      const bPres = getPresenceState(b, nowMs);
      const rank = { live: 0, idle: 1, offline: 2 };
      if (rank[aPres.state] !== rank[bPres.state]) {
        return rank[aPres.state] - rank[bPres.state];
      }
      const aTime = a.lastActiveAt ? new Date(a.lastActiveAt).getTime() : 0;
      const bTime = b.lastActiveAt ? new Date(b.lastActiveAt).getTime() : 0;
      return bTime - aTime;
    });
  }, [sessions, nowMs]);

  const totalDevices = sessions.length;
  const blockedDevices = sessions.filter(s => s.isBlocked).length;
  const activeDevices = sessions.filter(s => !s.isBlocked).length;
  const liveNowCount = sortedSessions.filter(s => !s.isBlocked && getPresenceState(s, nowMs).state === 'live').length;

  const filteredSessions = sortedSessions.filter(s => {
    const pres = getPresenceState(s, nowMs);
    if (filterStatus === 'live' && (pres.state !== 'live' || s.isBlocked)) return false;
    if (filterStatus === 'active' && s.isBlocked) return false;
    if (filterStatus === 'blocked' && !s.isBlocked) return false;
    
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        (s.deviceName || '').toLowerCase().includes(q) ||
        (s.teacherName || '').toLowerCase().includes(q) ||
        (s.className || '').toLowerCase().includes(q) ||
        (s.browser || '').toLowerCase().includes(q) ||
        (s.os || '').toLowerCase().includes(q) ||
        (s.currentAction || '').toLowerCase().includes(q) ||
        (s.hardwareId || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const getDeviceIcon = (os: string, deviceName: string) => {
    const text = (os + ' ' + deviceName).toLowerCase();
    if (text.includes('iphone') || text.includes('android') || text.includes('telefon') || text.includes('galaxy') || text.includes('redmi') || text.includes('xiaomi') || text.includes('pixel')) {
      return <Smartphone className="w-5 h-5 text-blue-600" />;
    }
    if (text.includes('ipad') || text.includes('tablet') || text.includes('planshet')) {
      return <Tablet className="w-5 h-5 text-purple-600" />;
    }
    return <Laptop className="w-5 h-5 text-slate-700" />;
  };

  const getMatchingHardwareDeviceIds = (session: TeacherSession) => {
    if (!session.hardwareId) return [session.deviceId];
    return Array.from(
      new Set(
        sessions
          .filter(s => s.deviceId === session.deviceId || s.hardwareId === session.hardwareId)
          .map(s => s.deviceId)
      )
    );
  };

  const handleBlockClick = (session: TeacherSession) => {
    if (session.isBlocked) {
      const matchingIds = getMatchingHardwareDeviceIds(session);
      onToggleBlockDevice(session.deviceId, false, undefined, matchingIds);
    } else {
      setBlockingTarget(session);
      setBlockingReason('Administrator tomonidan bloklandi');
    }
  };

  const handleConfirmBlock = () => {
    if (blockingTarget) {
      const matchingIds = getMatchingHardwareDeviceIds(blockingTarget);
      onToggleBlockDevice(
        blockingTarget.deviceId,
        true,
        blockingReason.trim() || 'Administrator tomonidan bloklandi',
        matchingIds
      );
      setBlockingTarget(null);
    }
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3.5">
        <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-emerald-800 mb-1">
            <span className="text-xs font-bold">Ayni Daqiqada Saytda</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-emerald-900 tabular-nums">
            {liveNowCount} <span className="text-xs text-emerald-700 font-semibold">ta jonli</span>
          </div>
          <div className="text-[11px] text-emerald-700 mt-1">
            Har soniyada jonli kuzatuv faol
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-semibold">Jami Qurilmalar</span>
            <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center">
              <Monitor className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 tabular-nums">
            {totalDevices} <span className="text-xs text-slate-500 font-normal">ta qurilma</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Barcha kirgan brauzer va telefonlar</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-semibold">Ruxsat Etilgan</span>
            <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 tabular-nums">
            {activeDevices} <span className="text-xs text-slate-500 font-normal">ta ochiq</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Cheklovsiz kirish huquqi bor</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-semibold">Bloklangan Qurilmalar</span>
            <div className="w-7 h-7 rounded-lg bg-rose-50 text-rose-700 flex items-center justify-center">
              <ShieldX className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-rose-700 tabular-nums">
            {blockedDevices} <span className="text-xs text-rose-600 font-normal">ta taqiqlangan</span>
          </div>
          <div className="text-[11px] text-rose-600 mt-1">Boshqa brauzerda ham bloklanadi</div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            placeholder="Qurilma, ustoz, sinf, brauzer, harakat yoki HW-kod bo'yicha qidirish..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-900 focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
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
            onClick={() => setFilterStatus('live')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              filterStatus === 'live'
                ? 'bg-emerald-600 text-white'
                : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200'
            }`}
          >
            🟢 Jonli ({liveNowCount})
          </button>

          <button
            type="button"
            onClick={() => setFilterStatus('active')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              filterStatus === 'active'
                ? 'bg-blue-700 text-white'
                : 'bg-blue-50 text-blue-800 hover:bg-blue-100 border border-blue-200'
            }`}
          >
            Ruxsat ({activeDevices})
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
            Bloklangan ({blockedDevices})
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
        <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="font-bold text-slate-900 text-sm">Jonli Seanslar va Qurilmalar Monitoringi</h3>
            <p className="text-xs text-slate-500">
              Bloklash tugmasi bosilgan zahoti sahifani yangilamasdan ham barcha brauzerlarda darhol to‘xtatiladi
            </p>
          </div>
          <span className="text-xs text-slate-600 font-mono font-semibold tabular-nums">
            Jonli soat: {formatOnlyHms(new Date(nowMs).toISOString())} • {filteredSessions.length} ta
          </span>
        </div>

        {filteredSessions.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <Monitor className="w-10 h-10 text-slate-300 mx-auto" />
            <p className="text-sm font-bold text-slate-700">Seanslar topilmadi</p>
            <p className="text-xs text-slate-400">
              Saytga kimdir kirishi bilanoq uning qurilmasi, vaqti va harakati soniyalar ichida shu yerda ko‘rinadi.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-100/75 text-slate-600 uppercase text-[11px] font-bold tracking-wider border-b border-slate-200">
                <tr>
                  <th className="py-3 pl-5 pr-2">Qurilma / Hardware ID</th>
                  <th className="py-3 px-3">Kim / Qayerda / Nima qilyapti</th>
                  <th className="py-3 px-3">Tizim & Brauzer</th>
                  <th className="py-3 px-3">Aniq Vaqt (Soniya bilan)</th>
                  <th className="py-3 px-3 text-center">Jonli Holat</th>
                  <th className="py-3 pr-5 text-right">Boshqaruv</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredSessions.map(sess => {
                  const pres = getPresenceState(sess, nowMs);
                  const rowKey = sess.id || sess.deviceId;
                  const isExpanded = expandedSessionId === rowKey;
                  const actions = Array.isArray(sess.recentActions) ? sess.recentActions : [];

                  return (
                    <React.Fragment key={rowKey}>
                      <tr
                        className={`transition-colors ${
                          sess.isBlocked
                            ? 'bg-rose-50/45 hover:bg-rose-50/70'
                            : pres.state === 'live'
                            ? 'bg-emerald-50/25 hover:bg-emerald-50/45'
                            : 'hover:bg-slate-50/80'
                        }`}
                      >
                        <td className="py-3 pl-5 pr-2">
                          <div className="flex items-center gap-3">
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 border ${
                              sess.isBlocked 
                                ? 'bg-rose-50 border-rose-200' 
                                : pres.state === 'live'
                                ? 'bg-emerald-50 border-emerald-200'
                                : 'bg-blue-50 border-blue-200'
                            }`}>
                              {getDeviceIcon(sess.os, sess.deviceName)}
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-bold text-slate-900 text-xs">
                                  {sess.deviceName || 'Qurilma'}
                                </span>
                                {currentDeviceId && sess.deviceId === currentDeviceId && (
                                  <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                                    Sizning qurilmangiz
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-mono">
                                <span>ID: {sess.deviceId?.substring(0, 12)}</span>
                                {sess.hardwareId && (
                                  <span
                                    className="inline-flex items-center gap-0.5 text-indigo-700 bg-indigo-50 px-1 rounded border border-indigo-200"
                                    title={`Kross-brauzer qurilma kodi: ${sess.hardwareId}`}
                                  >
                                    <Fingerprint className="w-2.5 h-2.5" />
                                    {sess.hardwareId}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="py-3 px-3">
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-semibold text-slate-900">
                                {sess.teacherName || (sess.currentRole === 'admin' ? 'Administrator' : 'Mehmon / Kiruvchi')}
                              </span>
                              {sess.className && (
                                <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-bold bg-blue-50 text-blue-800 border border-blue-200">
                                  {sess.className}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-600 font-medium">
                              {sess.currentAction || (sess.className ? `${sess.className} sinfini ko'rmoqda` : "Saytga kirdi")}
                            </div>
                            {actions.length > 0 && (
                              <button
                                type="button"
                                onClick={() => setExpandedSessionId(isExpanded ? null : rowKey)}
                                className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-700 hover:text-blue-900 cursor-pointer"
                              >
                                {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                <span>Harakatlar tarixi ({actions.length})</span>
                              </button>
                            )}
                          </div>
                        </td>

                        <td className="py-3 px-3">
                          <span className="text-slate-800 font-medium block">
                            {sess.os}
                          </span>
                          <span className="text-[11px] text-slate-500 block">
                            {sess.browser} {sess.screen ? `(${sess.screen})` : ''}
                          </span>
                          {(sess.cpuCores || sess.gpuRenderer) && (
                            <span className="text-[10px] text-slate-400 block truncate max-w-[170px]" title={sess.gpuRenderer || ''}>
                              {sess.cpuCores ? `${sess.cpuCores} yadro` : ''} {sess.gpuRenderer ? `• ${sess.gpuRenderer}` : ''}
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-3 font-mono tabular-nums text-[11px] space-y-0.5">
                          <div className="flex items-center gap-1 text-slate-800 font-semibold">
                            <Clock className="w-3 h-3 text-slate-400 flex-shrink-0" />
                            <span>{formatExactTime(sess.lastActiveAt)}</span>
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {formatAgoUz(pres.diffMs)}
                          </div>
                          {sess.enteredAt && (
                            <div className="text-[10px] text-emerald-700">
                              Kirdi: {formatOnlyHms(sess.enteredAt)}
                            </div>
                          )}
                          {pres.state === 'offline' && sess.leftAt && (
                            <div className="text-[10px] text-rose-600">
                              Chiqdi: {formatOnlyHms(sess.leftAt)}
                            </div>
                          )}
                        </td>

                        <td className="py-3 px-3 text-center">
                          {sess.isBlocked ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
                              <ShieldX className="w-3 h-3 text-rose-600" />
                              <span>Bloklangan</span>
                            </span>
                          ) : pres.state === 'live' ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-300">
                              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                              <span>JONLI SAYTDA</span>
                            </span>
                          ) : pres.state === 'idle' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                              <span>Tanaffusda</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                              <span>Chiqib ketgan</span>
                            </span>
                          )}
                        </td>

                        <td className="py-3 pr-5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
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
                                  <span>Blokdan ochish</span>
                                </>
                              ) : (
                                <>
                                  <ShieldX className="w-3.5 h-3.5" />
                                  <span>Bloklash</span>
                                </>
                              )}
                            </button>

                            {onUnlockExternalTeacher && (sess.isExternalTeacher || sess.boundClassId) && (
                              <button
                                type="button"
                                onClick={() => onUnlockExternalTeacher(sess.deviceId)}
                                className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                                  sess.allowClassChangeOnce
                                    ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                    : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200'
                                }`}
                                title="Boshqa maktab ustoziga boshqa sinfni tanlashiga ruxsat"
                              >
                                <RefreshCw className="w-3.5 h-3.5" />
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => onDeleteSession(sess.id || sess.deviceId)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                              title="Seans tarixini o'chirish"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {isExpanded && actions.length > 0 && (
                        <tr className="bg-slate-50/90">
                          <td colSpan={6} className="px-6 py-3">
                            <div className="text-[11px] font-bold text-slate-700 mb-1.5">
                              Oxirgi harakatlar lentasi ({sess.deviceName} • {sess.browser}):
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {actions.map((act, idx) => (
                                <div
                                  key={idx}
                                  className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-[11px] flex items-center gap-1.5"
                                >
                                  <span className="font-mono font-bold text-blue-700">
                                    {formatOnlyHms(act.time)}
                                  </span>
                                  <span className="text-slate-700">{act.action}</span>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {blockingTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="relative w-full max-w-md bg-white border border-rose-200 rounded-3xl shadow-2xl p-6 overflow-hidden">
            <div className="flex items-center gap-3 mb-4 text-rose-600">
              <div className="w-10 h-10 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center flex-shrink-0">
                <ShieldX className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Qurilmani Darhol Bloklash</h3>
                <p className="text-xs text-slate-500">
                  Sahifa yangilanmasdan soniya ichida barcha brauzerlarda bloklanadi
                </p>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 mb-4 text-xs space-y-1.5 font-mono">
              <div className="flex justify-between">
                <span className="text-slate-400">Qurilma:</span>
                <span className="font-bold text-slate-800">{blockingTarget.deviceName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Foydalanuvchi:</span>
                <span className="font-semibold text-blue-700">
                  {blockingTarget.teacherName || 'Mehmon'} {blockingTarget.className ? `(${blockingTarget.className})` : ''}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Brauzer & HW:</span>
                <span className="text-slate-700">
                  {blockingTarget.browser} {blockingTarget.hardwareId ? `• ${blockingTarget.hardwareId}` : ''}
                </span>
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
