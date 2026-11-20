import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ClassGroup, Student } from '../types';
import { getStudentTrackData } from '../utils/studentLoginHelper';
import {
  buildGoogleSheetsRows,
  copyRowsToClipboardForGoogleSheets,
  DEFAULT_GOOGLE_SHEETS_FIELDS,
  GOOGLE_SHEETS_COLUMN_HEADERS,
  GoogleSheetsFixedDefaults,
  loadGoogleSheetsDefaults,
  saveGoogleSheetsDefaults,
} from '../utils/googleSheetsExport';
import confetti from 'canvas-confetti';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  Edit3,
  ExternalLink,
  FileSpreadsheet,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';

interface GoogleSheetsExportModalProps {
  isOpen: boolean;
  classGroup: ClassGroup;
  students: Student[]; // Raw class students
  activeTrack: 'ai' | 'developer';
  onClose: () => void;
  onSaveUpdatedStudents?: (updatedStudents: Student[]) => Promise<void> | void;
  onToast?: (msg: string) => void;
}

export const GoogleSheetsExportModal: React.FC<GoogleSheetsExportModalProps> = ({
  isOpen,
  classGroup,
  students,
  activeTrack,
  onClose,
  onSaveUpdatedStudents,
  onToast,
}) => {
  const [defaults, setDefaults] = useState<GoogleSheetsFixedDefaults>(() => loadGoogleSheetsDefaults());
  const [isEditingDefaults, setIsEditingDefaults] = useState(false);
  const [includeHeaders, setIncludeHeaders] = useState(false);

  // Date scanning states
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState<{ done: number; total: number; currentName?: string }>({
    done: 0,
    total: 0,
  });
  const [failedMap, setFailedMap] = useState<Record<string, string>>({});
  const [manualDateOverrides, setManualDateOverrides] = useState<Record<string, string>>({});
  const [autoCopyStatus, setAutoCopyStatus] = useState<'idle' | 'copied' | 'needs-click'>('idle');
  const [scanSummary, setScanSummary] = useState('');

  const isMountedRef = useRef(true);
  const scanStartedForOpenRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!isOpen) {
      scanStartedForOpenRef.current = false;
      setAutoCopyStatus('idle');
      setScanSummary('');
      return;
    }

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  const certifiedStudents = useMemo(() => {
    return students
      .filter((s) => s.classId === classGroup.id && getStudentTrackData(s, activeTrack).status === 'certified')
      .sort((a, b) => a.fullName.trim().localeCompare(b.fullName.trim(), 'uz', { sensitivity: 'base' }));
  }, [students, classGroup.id, activeTrack]);

  const unverifiedStudents = useMemo(() => {
    return certifiedStudents.filter((st) => {
      if (manualDateOverrides[st.id]) return false;
      const td = getStudentTrackData(st, activeTrack);
      return !(td.certificateDateVerified && td.certificateDate) && Boolean(td.certificateLink);
    });
  }, [certifiedStudents, activeTrack, manualDateOverrides]);

  const rows = useMemo(() => {
    return buildGoogleSheetsRows(certifiedStudents, activeTrack, defaults, manualDateOverrides);
  }, [certifiedStudents, activeTrack, defaults, manualDateOverrides]);

  const warningRowsCount = useMemo(
    () => rows.filter((r) => r.missingFields.length > 0).length,
    [rows]
  );

  const verifiedCount = useMemo(
    () => rows.filter((r) => r.dateVerified && Boolean(r.certifiedDate)).length,
    [rows]
  );

  const runVerifyDatesScan = async (targets: Student[], attemptAutoCopyAfter: boolean) => {
    if (targets.length === 0 || isScanning) return;
    setIsScanning(true);
    setScanSummary('');
    setAutoCopyStatus('idle');
    setScanProgress({ done: 0, total: targets.length });

    let successCount = 0;
    let failCount = 0;
    const nextFailed: Record<string, string> = { ...failedMap };
    const localResolvedDates: Record<string, string> = { ...manualDateOverrides };

    const BATCH_SIZE = 3;
    for (let i = 0; i < targets.length; i += BATCH_SIZE) {
      if (!isMountedRef.current) break;

      const batch = targets.slice(i, i + BATCH_SIZE);
      setScanProgress({
        done: i,
        total: targets.length,
        currentName: batch.map((b) => b.fullName.split(' ')[0]).join(', '),
      });

      try {
        const res = await fetch('/api/certificates/verify-dates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: batch.map((b) => ({
              studentId: b.id,
              url: getStudentTrackData(b, activeTrack).certificateLink,
              fullName: b.fullName,
            })),
          }),
        });

        const data = await res.json();
        const results: Array<{
          studentId: string;
          success: boolean;
          certificateDate?: string;
          source?: string;
          error?: string;
        }> = Array.isArray(data?.results) ? data.results : [];

        const nowIso = new Date().toISOString();
        const updatedBatch: Student[] = [];

        for (const r of results) {
          const orig = batch.find((b) => b.id === r.studentId);
          if (!orig) continue;

          if (r.success && r.certificateDate) {
            successCount++;
            delete nextFailed[orig.id];
            localResolvedDates[orig.id] = r.certificateDate;

            const patched: Student = {
              ...orig,
              certificateDate: r.certificateDate,
              ...(activeTrack === 'developer'
                ? {
                    devCertificateDate: r.certificateDate,
                    devCertificateDateVerified: true,
                    devCertificateDateSource: r.source || 'official-page',
                    devCertificateDateCheckedAt: nowIso,
                  }
                : {
                    aiCertificateDate: r.certificateDate,
                    aiCertificateDateVerified: true,
                    aiCertificateDateSource: r.source || 'official-page',
                    aiCertificateDateCheckedAt: nowIso,
                  }),
            };
            updatedBatch.push(patched);
          } else {
            failCount++;
            nextFailed[orig.id] = r.error || "Sana topilmadi";
          }
        }

        if (updatedBatch.length > 0 && onSaveUpdatedStudents) {
          await onSaveUpdatedStudents(updatedBatch);
        }
      } catch (err: any) {
        failCount += batch.length;
        for (const b of batch) {
          nextFailed[b.id] = err?.message || 'Tarmoq xatoligi';
        }
      }

      if (isMountedRef.current) {
        setFailedMap({ ...nextFailed });
        setManualDateOverrides({ ...localResolvedDates });
        setScanProgress({ done: Math.min(i + batch.length, targets.length), total: targets.length });
      }
    }

    if (!isMountedRef.current) return;

    setIsScanning(false);
    setScanSummary(
      `Tekshiruv yakunlandi: ${successCount} ta sertifikat sanasi aniqlandi va bazaga saqlandi${
        failCount > 0 ? `, ${failCount} tasini aniqlab bo'lmadi` : '!'
      }`
    );

    if (attemptAutoCopyAfter) {
      const updatedRows = buildGoogleSheetsRows(certifiedStudents, activeTrack, defaults, localResolvedDates);
      try {
        await copyRowsToClipboardForGoogleSheets(updatedRows, includeHeaders);
        setAutoCopyStatus('copied');
        confetti({ particleCount: 55, spread: 70, origin: { y: 0.6 } });
        onToast?.(`✅ ${updatedRows.length} nafar o'quvchi Google Sheets uchun nusxalandi!`);
      } catch {
        // Browser expired clipboard user-gesture after async scan -> show prominent 1-click button
        setAutoCopyStatus('needs-click');
      }
    }
  };

  // Auto-start date verification whenever modal opens with unverified students
  useEffect(() => {
    if (isOpen && !scanStartedForOpenRef.current) {
      scanStartedForOpenRef.current = true;
      if (unverifiedStudents.length > 0) {
        runVerifyDatesScan(unverifiedStudents, true);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCopyNow = async () => {
    if (rows.length === 0) return;
    try {
      await copyRowsToClipboardForGoogleSheets(rows, includeHeaders);
      setAutoCopyStatus('copied');
      confetti({ particleCount: 55, spread: 75, origin: { y: 0.6 } });
      onToast?.(
        `✅ ${rows.length} nafar o'quvchining 11 ta ustunli Google Sheets ma'lumotlari nusxalandi! Jadvalda "Lavozimi" katagiga Ctrl+V qiling.`
      );
    } catch {
      onToast?.("⚠️ Nusxalashda xatolik yuz berdi. Iltimos brauzer ruxsatini tekshiring.");
    }
  };

  const handleUpdateDefault = (field: keyof GoogleSheetsFixedDefaults, value: string) => {
    const next = { ...defaults, [field]: value };
    setDefaults(next);
    saveGoogleSheetsDefaults(next);
  };

  const handleResetDefaults = () => {
    const next = { ...DEFAULT_GOOGLE_SHEETS_FIELDS };
    setDefaults(next);
    saveGoogleSheetsDefaults(next);
  };

  const handleManualDateChange = async (student: Student, isoDate: string) => {
    setManualDateOverrides((prev) => ({ ...prev, [student.id]: isoDate }));
    if (isoDate && onSaveUpdatedStudents) {
      const nowIso = new Date().toISOString();
      const patched: Student = {
        ...student,
        certificateDate: isoDate,
        ...(activeTrack === 'developer'
          ? {
              devCertificateDate: isoDate,
              devCertificateDateVerified: true,
              devCertificateDateSource: 'manual',
              devCertificateDateCheckedAt: nowIso,
            }
          : {
              aiCertificateDate: isoDate,
              aiCertificateDateVerified: true,
              aiCertificateDateSource: 'manual',
              aiCertificateDateCheckedAt: nowIso,
            }),
      };
      await onSaveUpdatedStudents([patched]);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/70 backdrop-blur-xs overflow-y-auto animate-fade-in">
      <div className="relative w-full max-w-6xl bg-white border border-slate-300 rounded-2xl shadow-2xl overflow-hidden my-4 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-emerald-900 via-teal-900 to-slate-900 text-white flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center flex-shrink-0">
              <FileSpreadsheet className="w-6 h-6 text-emerald-300" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-extrabold tracking-tight truncate">
                  Google Sheets uchun nusxalash — {classGroup.name} sinfi
                </h2>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-white/15 border border-white/25">
                  {activeTrack === 'developer' ? '5M AI Yetakchilari' : '1M Promter'}
                </span>
              </div>
              <p className="text-xs text-emerald-100/90 mt-0.5">
                11 ta ustun tayyor holatda — jadvalda <b>Lavozimi</b> katagiga bosib <code>Ctrl + V</code> qiling (Tartib raqami bo'sh qoldiriladi)
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer flex-shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1">
          {/* Scanning Progress */}
          {isScanning && (
            <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 space-y-2">
              <div className="flex items-center justify-between text-xs sm:text-sm font-bold text-blue-950">
                <span className="flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 text-blue-600 animate-spin" />
                  <span>
                    Sertifikat havolalaridan aniq sana olinmoqda ({scanProgress.done} / {scanProgress.total})
                    {scanProgress.currentName ? ` — ${scanProgress.currentName}...` : '...'}
                  </span>
                </span>
                <span className="font-mono text-blue-700">
                  {scanProgress.total > 0 ? Math.round((scanProgress.done / scanProgress.total) * 100) : 0}%
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-blue-200 overflow-hidden">
                <div
                  className="h-full bg-blue-600 rounded-full transition-all duration-300"
                  style={{
                    width: `${scanProgress.total > 0 ? Math.round((scanProgress.done / scanProgress.total) * 100) : 0}%`,
                  }}
                />
              </div>
              <p className="text-[11px] text-blue-700">
                Aniqlangan sanalar darhol bazaga saqlanadi — keyingi safar kutmasdan 0 soniyada nusxalanadi!
              </p>
            </div>
          )}

          {/* Post-scan status banner */}
          {!isScanning && (autoCopyStatus === 'copied' || autoCopyStatus === 'needs-click' || scanSummary) && (
            <div
              className={`p-3.5 rounded-xl border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                autoCopyStatus === 'copied'
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                  : autoCopyStatus === 'needs-click'
                    ? 'bg-amber-50 border-amber-300 text-amber-950'
                    : 'bg-slate-50 border-slate-200 text-slate-800'
              }`}
            >
              <div className="flex items-center gap-2 font-semibold">
                {autoCopyStatus === 'copied' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                ) : (
                  <Sparkles className="w-4 h-4 text-amber-600 flex-shrink-0" />
                )}
                <span>
                  {autoCopyStatus === 'copied'
                    ? `Tayyor! ${rows.length} nafar o'quvchi buferga nusxalandi — Google Sheets'da Ctrl+V bosing!`
                    : autoCopyStatus === 'needs-click'
                      ? `${scanSummary} Endi pastdagi "Google Sheets uchun nusxalash" tugmasini bosing.`
                      : scanSummary}
                </span>
              </div>
              {autoCopyStatus === 'needs-click' && (
                <button
                  type="button"
                  onClick={handleCopyNow}
                  className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer flex-shrink-0"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Hozir nusxalash</span>
                </button>
              )}
            </div>
          )}

          {/* 4 Constant Fields Strip + Edit Toggle */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>Barcha o'quvchilar uchun doimiy 4 ta ustun qiymatlari:</span>
              </div>
              <div className="flex items-center gap-2">
                {isEditingDefaults && (
                  <button
                    type="button"
                    onClick={handleResetDefaults}
                    className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-[11px] font-semibold text-slate-600 flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Standartga qaytarish</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsEditingDefaults((v) => !v)}
                  className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 hover:border-blue-400 text-[11px] font-bold text-blue-700 flex items-center gap-1 cursor-pointer"
                >
                  <Edit3 className="w-3 h-3" />
                  <span>{isEditingDefaults ? 'Yopish' : 'Tahrirlash'}</span>
                </button>
              </div>
            </div>

            {isEditingDefaults ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-1">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">1. Lavozimi</label>
                  <input
                    type="text"
                    value={defaults.position}
                    onChange={(e) => handleUpdateDefault('position', e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">2. Elektron pochta</label>
                  <input
                    type="text"
                    value={defaults.email}
                    onChange={(e) => handleUpdateDefault('email', e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-mono text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">3. Telefon raqami</label>
                  <input
                    type="text"
                    value={defaults.phone}
                    onChange={(e) => handleUpdateDefault('phone', e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-mono text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">4. Maktab</label>
                  <input
                    type="text"
                    value={defaults.school}
                    onChange={(e) => handleUpdateDefault('school', e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-900"
                  />
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <span className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 font-semibold text-slate-800">
                  Lavozim: <b className="text-emerald-700">{defaults.position}</b>
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 font-mono text-slate-800">
                  Pochta: <b className="text-blue-700">{defaults.email}</b>
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 font-mono text-slate-800">
                  Tel: <b className="text-slate-900">{defaults.phone}</b>
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 font-semibold text-slate-800">
                  Maktab: <b className="text-indigo-700">{defaults.school}</b>
                </span>
              </div>
            )}
          </div>

          {/* Stats Summary Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 font-bold text-emerald-800">
                🟢 Jami eksport: {rows.length} nafar
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-blue-50 border border-blue-200 font-bold text-blue-800">
                📅 Sanasi tasdiqlangan: {verifiedCount} / {rows.length}
              </span>
              {warningRowsCount > 0 && (
                <span className="px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 font-bold text-amber-800 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>{warningRowsCount} ta o'quvchida ba'zi maydonlar bo'sh</span>
                </span>
              )}
            </div>

            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeHeaders}
                  onChange={(e) => setIncludeHeaders(e.target.checked)}
                  className="rounded border-slate-300 text-emerald-600"
                />
                <span>Ustun sarlavhalari bilan nusxalash</span>
              </label>

              {!isScanning && certifiedStudents.length > 0 && (
                <button
                  type="button"
                  onClick={() => runVerifyDatesScan(certifiedStudents, false)}
                  className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-[11px] font-bold text-slate-700 flex items-center gap-1 cursor-pointer"
                  title="Barcha sertifikat sanalarini havolalardan qayta tekshirish"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Sanalarni qayta tekshirish</span>
                </button>
              )}
            </div>
          </div>

          {/* Full 11-Column Live Preview Table */}
          {rows.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500 border border-dashed border-slate-300 rounded-xl">
              Ushbu sinfda hali sertifikat olgan o'quvchilar mavjud emas.
            </div>
          ) : (
            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
              <div className="overflow-x-auto max-h-[42vh]">
                <table className="w-full text-left text-[11px] border-collapse">
                  <thead className="bg-slate-900 text-white sticky top-0 z-10">
                    <tr>
                      <th className="py-2.5 px-2.5 font-bold border-r border-slate-700 text-center w-8" title="Google Sheets'da qo'lda yoziladi">
                        #
                      </th>
                      {GOOGLE_SHEETS_COLUMN_HEADERS.map((colName, cIdx) => (
                        <th key={cIdx} className="py-2.5 px-2.5 font-bold border-r border-slate-700 whitespace-nowrap">
                          {colName}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {rows.map((row, idx) => {
                      const origStudent = certifiedStudents.find((s) => s.id === row.studentId);
                      const hasDateIssue = !row.certifiedDate;
                      const scanErr = failedMap[row.studentId];

                      return (
                        <tr
                          key={row.studentId}
                          className={`hover:bg-emerald-50/40 transition-colors ${
                            row.missingFields.length > 0 ? 'bg-amber-50/30' : ''
                          }`}
                        >
                          <td className="py-2 px-2.5 font-mono text-slate-400 border-r border-slate-100 text-center">
                            {idx + 1}
                          </td>
                          <td className="py-2 px-2.5 border-r border-slate-100 whitespace-nowrap text-slate-700 font-medium">
                            {row.position}
                          </td>
                          <td className="py-2 px-2.5 border-r border-slate-100 whitespace-nowrap font-bold text-slate-900">
                            {row.fullName}
                          </td>
                          <td className="py-2 px-2.5 border-r border-slate-100 whitespace-nowrap font-mono">
                            {row.birthDate || <span className="text-rose-500 font-semibold">Bo'sh</span>}
                          </td>
                          <td className="py-2 px-2.5 border-r border-slate-100 whitespace-nowrap font-mono font-bold text-indigo-700">
                            {row.docSeries || <span className="text-rose-500 font-semibold">—</span>}
                          </td>
                          <td className="py-2 px-2.5 border-r border-slate-100 whitespace-nowrap font-mono font-bold text-slate-900">
                            {row.docNumber || <span className="text-rose-500 font-semibold">—</span>}
                          </td>
                          <td className="py-2 px-2.5 border-r border-slate-100 whitespace-nowrap font-mono text-slate-600">
                            {row.email}
                          </td>
                          <td className="py-2 px-2.5 border-r border-slate-100 whitespace-nowrap font-mono text-slate-700">
                            {row.phone}
                          </td>
                          <td className="py-2 px-2.5 border-r border-slate-100 whitespace-nowrap text-slate-700">
                            {row.school}
                          </td>
                          <td className="py-2 px-2.5 border-r border-slate-100 whitespace-nowrap font-mono">
                            {row.registeredDate ? (
                              <span className="text-emerald-700 font-bold">{row.registeredDate}</span>
                            ) : (
                              <span className="text-amber-600 font-semibold">Kutilmoqda</span>
                            )}
                          </td>
                          <td className="py-2 px-2.5 border-r border-slate-100 whitespace-nowrap font-mono">
                            {hasDateIssue && origStudent ? (
                              <div className="flex items-center gap-1">
                                <input
                                  type="date"
                                  value={manualDateOverrides[origStudent.id] || ''}
                                  onChange={(e) => handleManualDateChange(origStudent, e.target.value)}
                                  className="px-1.5 py-0.5 rounded border border-amber-300 bg-white text-[10px] font-mono text-slate-900"
                                  title={scanErr || "Qo'lda sana kiriting"}
                                />
                              </div>
                            ) : (
                              <span className="text-emerald-700 font-bold">{row.certifiedDate}</span>
                            )}
                          </td>
                          <td className="py-2 px-2.5 max-w-[220px] truncate">
                            {row.certificateLink ? (
                              <a
                                href={row.certificateLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:underline inline-flex items-center gap-1 font-mono text-[10px]"
                              >
                                <span className="truncate max-w-[180px]">{row.certificateLink}</span>
                                <ExternalLink className="w-3 h-3 flex-shrink-0" />
                              </a>
                            ) : (
                              <span className="text-rose-500">Yo'q</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-[11px] text-slate-600 leading-snug">
            💡 <b>Qo'llanma:</b> Google Sheets jadvalida <b>Lavozimi</b> ustunidagi bo'sh katakka bosing va <code>Ctrl + V</code> qiling — <b>0</b> bilan boshlanuvchi raqamlar va <b>+998</b> saqlanib qoladi.
          </div>

          <div className="flex items-center gap-2.5 flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold cursor-pointer"
            >
              Yopish
            </button>

            <button
              type="button"
              disabled={rows.length === 0 || isScanning}
              onClick={handleCopyNow}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50 text-white text-xs sm:text-sm font-extrabold flex items-center gap-2 shadow-lg shadow-emerald-500/25 active:scale-95 transition-all cursor-pointer"
            >
              {autoCopyStatus === 'copied' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span>
                {isScanning
                  ? 'Sanalar tekshirilmoqda...'
                  : autoCopyStatus === 'copied'
                    ? `Qayta nusxalash (${rows.length} ta)`
                    : `📊 Google Sheets uchun nusxalash (${rows.length} ta)`}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
