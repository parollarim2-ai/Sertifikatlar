import React, { useMemo, useState } from 'react';
import { ClassGroup, Student } from '../types';
import { getStudentTrackData } from '../utils/studentLoginHelper';
import { jsPDF } from 'jspdf';
import {
  Calendar,
  Check,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  FileSearch,
  AlertTriangle,
  RefreshCw,
  CreditCard,
  ShieldCheck,
  Clock
} from 'lucide-react';

interface ClassCertificateAuditSectionProps {
  classGroup: ClassGroup;
  classStudents: Student[];
  activeTrack: 'ai' | 'developer';
  onSaveUpdatedStudents: (updatedStudents: Student[]) => Promise<void> | void;
  onOpenPaymentModal?: (cg: ClassGroup) => void;
}

const formatDisplayDate = (isoDate?: string): string => {
  if (!isoDate) return '—';
  const m = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}.${m[2]}.${m[1]}`;
  return isoDate;
};

const toSafePdfText = (str: string): string =>
  (str || '')
    .replace(/[ʻ’‘`´]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[—–]/g, '-')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const ClassCertificateAuditSection: React.FC<ClassCertificateAuditSectionProps> = ({
  classGroup,
  classStudents,
  activeTrack,
  onSaveUpdatedStudents,
  onOpenPaymentModal,
}) => {
  const todayIso = useMemo(() => new Date().toISOString().split('T')[0], []);
  const currentYear = useMemo(() => new Date().getFullYear(), []);
  const monthStartIso = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  }, []);

  const [fromDate, setFromDate] = useState<string>(`${currentYear}-01-01`);
  const [toDate, setToDate] = useState<string>(todayIso);

  const unitPrice = activeTrack === 'developer' ? 7000 : (classGroup.pricePerStudent || 5000);
  const recordedPaid =
    activeTrack === 'developer'
      ? (classGroup.devPaidAmount ?? (classGroup.id.startsWith('class-dev-') ? (classGroup.paidAmount || 0) : 0))
      : (classGroup.aiPaidAmount ?? (classGroup.paidAmount || 0));

  const [advanceInput, setAdvanceInput] = useState<number>(recordedPaid);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState<{ done: number; total: number; currentName?: string }>({
    done: 0,
    total: 0,
  });
  const [scanNotice, setScanNotice] = useState<string>('');
  const [failedMap, setFailedMap] = useState<Record<string, string>>({});
  const [copiedProof, setCopiedProof] = useState(false);

  const certifiedStudents = useMemo(() => {
    return classStudents
      .map((s) => ({
        student: s,
        track: getStudentTrackData(s, activeTrack),
      }))
      .filter((item) => item.track.status === 'certified' && Boolean(item.track.certificateLink));
  }, [classStudents, activeTrack]);

  const verifiedCount = useMemo(
    () => certifiedStudents.filter((i) => i.track.certificateDateVerified && i.track.certificateDate).length,
    [certifiedStudents]
  );
  const unverifiedList = useMemo(
    () => certifiedStudents.filter((i) => !i.track.certificateDateVerified || !i.track.certificateDate),
    [certifiedStudents]
  );

  // Categorize verified students strictly against their official verified certificate completion date
  const categorized = useMemo(() => {
    const inRange: { student: Student; date: string; source?: string; link: string }[] = [];
    const earlier: { student: Student; date: string; source?: string; link: string }[] = [];
    const later: { student: Student; date: string; source?: string; link: string }[] = [];
    const unverified: { student: Student; link: string; savedAt?: string; error?: string }[] = [];

    for (const item of certifiedStudents) {
      const link = item.track.certificateLink || '';
      if (item.track.certificateDateVerified && item.track.certificateDate) {
        const dt = item.track.certificateDate;
        if (fromDate && dt < fromDate) {
          earlier.push({ student: item.student, date: dt, source: item.track.certificateDateSource, link });
        } else if (toDate && dt > toDate) {
          later.push({ student: item.student, date: dt, source: item.track.certificateDateSource, link });
        } else {
          inRange.push({ student: item.student, date: dt, source: item.track.certificateDateSource, link });
        }
      } else {
        unverified.push({
          student: item.student,
          link,
          savedAt: item.track.certifiedAt,
          error: failedMap[item.student.id],
        });
      }
    }

    inRange.sort((a, b) => a.date.localeCompare(b.date) || a.student.fullName.localeCompare(b.student.fullName));
    earlier.sort((a, b) => b.date.localeCompare(a.date));
    later.sort((a, b) => a.date.localeCompare(b.date));

    return { inRange, earlier, later, unverified };
  }, [certifiedStudents, fromDate, toDate, failedMap]);

  const runOfficialScan = async (targets: typeof certifiedStudents, forceRefresh: boolean) => {
    if (targets.length === 0 || isScanning) return;
    setIsScanning(true);
    setScanNotice('');
    setScanProgress({ done: 0, total: targets.length });

    let successCount = 0;
    let failCount = 0;
    const nextFailed: Record<string, string> = forceRefresh ? {} : { ...failedMap };

    // Process in batches of 3 to avoid excessive memory usage on server Puppeteer
    const BATCH_SIZE = 3;
    for (let i = 0; i < targets.length; i += BATCH_SIZE) {
      const batch = targets.slice(i, i + BATCH_SIZE);
      setScanProgress({
        done: i,
        total: targets.length,
        currentName: batch.map((b) => b.student.fullName.split(' ')[0]).join(', '),
      });

      try {
        const res = await fetch('/api/certificates/verify-dates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: batch.map((b) => ({
              studentId: b.student.id,
              url: b.track.certificateLink,
              fullName: b.student.fullName,
            })),
          }),
        });

        const data = await res.json();
        const results: {
          studentId: string;
          success: boolean;
          certificateDate?: string;
          source?: string;
          error?: string;
        }[] = Array.isArray(data?.results) ? data.results : [];

        const nowIso = new Date().toISOString();
        const updatedBatchStudents: Student[] = [];

        for (const r of results) {
          const orig = batch.find((b) => b.student.id === r.studentId)?.student;
          if (!orig) continue;

          if (r.success && r.certificateDate) {
            successCount++;
            delete nextFailed[orig.id];
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
            updatedBatchStudents.push(patched);
          } else {
            failCount++;
            nextFailed[orig.id] = r.error || "Sertifikat sahifasidan sana topilmadi";
          }
        }

        if (updatedBatchStudents.length > 0) {
          await onSaveUpdatedStudents(updatedBatchStudents);
        }
      } catch (err: any) {
        failCount += batch.length;
        for (const b of batch) {
          nextFailed[b.student.id] = err?.message || 'Server bilan ulanishda xatolik';
        }
      }

      setFailedMap({ ...nextFailed });
      setScanProgress({ done: Math.min(i + batch.length, targets.length), total: targets.length });
    }

    setIsScanning(false);
    setScanNotice(
      `Tekshiruv yakunlandi: ${successCount} ta sertifikatning aniq sanasi bazaga saqlandi${
        failCount > 0 ? `, ${failCount} tasini aniqlab bo'lmadi` : '!'
      }`
    );
  };

  // Financial calculation strictly for selected date range
  const inRangeCost = categorized.inRange.length * unitPrice;
  const balanceDelta = inRangeCost - advanceInput; // >0 means teacher still owes; <0 means overpaid

  const buildProofText = () => {
    const lines: string[] = [];
    lines.push(`📋 ${classGroup.name} sinfi — Rasmiy Sertifikatlar Hisoboti (${activeTrack === 'developer' ? '5M AI Yetakchilari' : '1M Promter'})`);
    lines.push(`👩‍🏫 Sinf rahbari: ${classGroup.teacherName}`);
    lines.push(`📅 Tekshirilgan muddat: ${formatDisplayDate(fromDate)} — ${formatDisplayDate(toDate)}`);
    lines.push(`━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`✅ Tanlangan davrda sertifikat olganlar: ${categorized.inRange.length} nafar`);
    lines.push('');

    categorized.inRange.forEach((item, idx) => {
      lines.push(`${idx + 1}. ${item.student.fullName}`);
      lines.push(`   📅 Sertifikat sanasi (QR ostidan): ${formatDisplayDate(item.date)}`);
      lines.push(`   🔗 Tekshirish: ${item.link}`);
    });

    lines.push('');
    lines.push(`━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`💰 Jami hisob: ${categorized.inRange.length} ta × ${unitPrice.toLocaleString('uz-UZ')} so'm = ${inRangeCost.toLocaleString('uz-UZ')} so'm`);
    lines.push(`💵 Oldindan berilgan avans: ${advanceInput.toLocaleString('uz-UZ')} so'm`);
    if (balanceDelta > 0) {
      const extraCount = Math.round((balanceDelta / unitPrice) * 10) / 10;
      lines.push(`📌 Qolgan qo'shimcha to'lov: +${balanceDelta.toLocaleString('uz-UZ')} so'm (~${extraCount} ta o'quvchi uchun)`);
    } else if (balanceDelta < 0) {
      lines.push(`ℹ️ Ortiqcha to'lov (avansa qoldiq): ${Math.abs(balanceDelta).toLocaleString('uz-UZ')} so'm`);
    } else {
      lines.push(`✅ Hisob-kitob to'liq yopilgan (0 so'm qarz)`);
    }

    if (categorized.earlier.length > 0) {
      lines.push('');
      lines.push(`ℹ️ Oldingi davr (${formatDisplayDate(fromDate)} dan oldin olingan): ${categorized.earlier.length} nafar — ushbu hisobga kiritilmadi.`);
    }

    return lines.join('\n');
  };

  const handleCopyProof = () => {
    const text = buildProofText();
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedProof(true);
    setTimeout(() => setCopiedProof(false), 3000);
  };

  const handleDownloadProofPdf = () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    let y = 16;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(toSafePdfText(`${classGroup.name} sinfi - Rasmiy Sertifikatlar Isbot Hisoboti`), 14, y);
    y += 7;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(toSafePdfText(`Sinf rahbari: ${classGroup.teacherName}`), 14, y);
    y += 5;
    doc.text(
      toSafePdfText(
        `Yo'nalish: ${activeTrack === 'developer' ? '5M AI Yetakchilari (7 000 so\'m)' : '1M Promter (5 000 so\'m)'} | Muddat: ${formatDisplayDate(fromDate)} - ${formatDisplayDate(toDate)}`
      ),
      14,
      y
    );
    y += 6;

    doc.setDrawColor(200, 210, 225);
    doc.line(14, y, 196, y);
    y += 6;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(
      toSafePdfText(
        `Tanlangan davrda: ${categorized.inRange.length} ta | Jami: ${inRangeCost.toLocaleString('en-US')} so'm | Avans: ${advanceInput.toLocaleString('en-US')} so'm | Qarz: ${Math.max(0, balanceDelta).toLocaleString('en-US')} so'm`
      ),
      14,
      y
    );
    y += 8;

    doc.setFontSize(9);
    doc.setFillColor(241, 245, 249);
    doc.rect(14, y - 4, 182, 7, 'F');
    doc.text('No', 16, y);
    doc.text('O\'quvchi F.I.SH', 26, y);
    doc.text('Sertifikat sanasi', 110, y);
    doc.text('Tekshirish havolasi', 143, y);
    y += 6;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    categorized.inRange.forEach((item, idx) => {
      if (y > 276) {
        doc.addPage();
        y = 16;
      }
      doc.text(String(idx + 1), 16, y);
      doc.text(toSafePdfText(item.student.fullName).slice(0, 44), 26, y);
      doc.text(formatDisplayDate(item.date), 110, y);
      const shortLink = item.link.replace(/^https?:\/\//i, '').slice(0, 34);
      doc.setTextColor(37, 99, 235);
      doc.textWithLink(shortLink, 143, y, { url: item.link });
      doc.setTextColor(15, 23, 42);
      y += 6;
    });

    const fileName = `${toSafePdfText(classGroup.name)}_sertifikat_isbot_${fromDate}_${toDate}.pdf`.replace(/\s+/g, '_');
    doc.save(fileName);
  };

  return (
    <div className="space-y-4">
      {/* Top Info + Scanner Control Card */}
      <div className="p-4 rounded-2xl bg-gradient-to-br from-indigo-50/90 via-blue-50/70 to-white border border-indigo-200 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h4 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
              <FileSearch className="w-4 h-4 text-indigo-600 flex-shrink-0" />
              <span>Rasmiy Sertifikat Sanalari (QR ostidagi aniq sana) va Isbot</span>
            </h4>
            <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">
              Har bir sertifikat havolasiga avtomatik kirib, QR kod ostida yozilgan <strong>rasmiy olingan sanani</strong> aniqlaydi va xotiraga saqlaydi (keyingi safar 0 soniyada ochiladi).
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${
              unverifiedList.length === 0
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-amber-50 text-amber-900 border-amber-300'
            }`}>
              {verifiedCount} / {certifiedStudents.length} tekshirilgan
            </span>
          </div>
        </div>

        {/* Scan Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={isScanning || unverifiedList.length === 0}
            onClick={() => runOfficialScan(unverifiedList, false)}
            className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            {isScanning ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <ShieldCheck className="w-3.5 h-3.5" />
            )}
            <span>
              {unverifiedList.length > 0
                ? `Tekshirilmaganlarni aniqlash (${unverifiedList.length} ta)`
                : "Barcha sertifikat sanalari bazada bor ✅"}
            </span>
          </button>

          {certifiedStudents.length > 0 && (
            <button
              type="button"
              disabled={isScanning}
              onClick={() => runOfficialScan(certifiedStudents, true)}
              className="px-3 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
              title="Barcha sertifikatlarni qaytadan skanerlash"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
              <span>Barchasini qayta tekshirish ({certifiedStudents.length})</span>
            </button>
          )}
        </div>

        {isScanning && (
          <div className="p-3 rounded-xl bg-white border border-indigo-200 space-y-1.5">
            <div className="flex items-center justify-between text-xs font-bold text-indigo-950">
              <span>
                Sertifikat havolalari tekshirilmoqda{scanProgress.currentName ? `: ${scanProgress.currentName}` : '...'}
              </span>
              <span className="font-mono">{scanProgress.done} / {scanProgress.total}</span>
            </div>
            <div className="w-full h-1.5 bg-indigo-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-600 transition-all duration-300"
                style={{ width: `${scanProgress.total > 0 ? Math.round((scanProgress.done / scanProgress.total) * 100) : 0}%` }}
              />
            </div>
          </div>
        )}

        {scanNotice && (
          <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-900">
            {scanNotice}
          </div>
        )}
      </div>

      {/* Date Range Picker & Quick Presets */}
      <div className="p-4 rounded-2xl bg-white border border-slate-200 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-blue-600" />
            <span>Tekshiriladigan sana oralig'i:</span>
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => { setFromDate(todayIso); setToDate(todayIso); }}
              className="px-2 py-1 rounded-lg text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
            >
              Bugun
            </button>
            <button
              type="button"
              onClick={() => {
                const d = new Date();
                d.setDate(d.getDate() - 7);
                setFromDate(d.toISOString().split('T')[0]);
                setToDate(todayIso);
              }}
              className="px-2 py-1 rounded-lg text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
            >
              Oxirgi 7 kun
            </button>
            <button
              type="button"
              onClick={() => { setFromDate(monthStartIso); setToDate(todayIso); }}
              className="px-2 py-1 rounded-lg text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
            >
              Shu oy
            </button>
            <button
              type="button"
              onClick={() => { setFromDate(`${currentYear}-01-01`); setToDate(`${currentYear}-12-31`); }}
              className="px-2 py-1 rounded-lg text-[11px] font-semibold bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 cursor-pointer"
            >
              {currentYear}-yil
            </button>
            <button
              type="button"
              onClick={() => { setFromDate(`${currentYear - 1}-01-01`); setToDate(`${currentYear - 1}-12-31`); }}
              className="px-2 py-1 rounded-lg text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
            >
              {currentYear - 1}-yil
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-[11px] font-semibold text-slate-600 block mb-1">Boshlanish sanasi (Dan):</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-bold text-slate-900 focus:outline-none focus:bg-white focus:border-blue-600"
            />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-slate-600 block mb-1">Tugash sanasi (Gacha):</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-bold text-slate-900 focus:outline-none focus:bg-white focus:border-blue-600"
            />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-slate-600 block mb-1">
              Ustoz oldindan bergan avans (so'm):
            </label>
            <input
              type="number"
              min="0"
              step={unitPrice}
              value={advanceInput}
              onChange={(e) => setAdvanceInput(Math.max(0, Number(e.target.value)))}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-bold text-slate-900 focus:outline-none focus:bg-white focus:border-blue-600"
            />
          </div>
        </div>
      </div>

      {/* Audit Summary Matrix & Financial Reconciliation */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
          <span className="text-[11px] text-emerald-800 font-semibold block">Shu davrda olganlar</span>
          <span className="text-xl font-black text-emerald-950">{categorized.inRange.length} ta</span>
          <span className="text-[10px] text-emerald-700 block font-mono">
            {inRangeCost.toLocaleString('uz-UZ')} so'm ({unitPrice.toLocaleString()}x)
          </span>
        </div>

        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
          <span className="text-[11px] text-slate-600 font-semibold block">Oldin olgan (mas. {currentYear - 1})</span>
          <span className="text-xl font-black text-slate-800">{categorized.earlier.length} ta</span>
          <span className="text-[10px] text-slate-500 block">{formatDisplayDate(fromDate)} dan oldin</span>
        </div>

        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
          <span className="text-[11px] text-amber-800 font-semibold block">Tekshirilmagan</span>
          <span className="text-xl font-black text-amber-950">{categorized.unverified.length} ta</span>
          <span className="text-[10px] text-amber-700 block">Yuqoridagi tugma bilan tekshiring</span>
        </div>

        <div className={`p-3 rounded-xl border ${
          balanceDelta > 0
            ? 'bg-rose-50 border-rose-300 text-rose-950'
            : balanceDelta < 0
            ? 'bg-blue-50 border-blue-200 text-blue-950'
            : 'bg-emerald-50 border-emerald-300 text-emerald-950'
        }`}>
          <span className="text-[11px] font-bold block opacity-80">
            {balanceDelta > 0 ? "Ustoz qo'shimcha berishi kerak:" : balanceDelta < 0 ? "Ortiqcha avans:" : "Farq / Qoldiq:"}
          </span>
          <span className="text-lg font-black block font-mono">
            {balanceDelta > 0
              ? `+${balanceDelta.toLocaleString('uz-UZ')} so'm`
              : balanceDelta < 0
              ? `-${Math.abs(balanceDelta).toLocaleString('uz-UZ')} so'm`
              : "0 so'm ✅"}
          </span>
          <span className="text-[10px] opacity-80 block">
            {balanceDelta > 0
              ? `≈ ${Math.round((balanceDelta / unitPrice) * 10) / 10} ta qo'shimcha o'quvchi`
              : `Avans: ${advanceInput.toLocaleString('uz-UZ')} so'm`}
          </span>
        </div>
      </div>

      {/* Export Proof Actions */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={categorized.inRange.length === 0}
            onClick={handleCopyProof}
            className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            {copiedProof ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedProof ? "Telegram isbot matni nusxalandi!" : "Telegram uchun isbot matnini nusxalash"}</span>
          </button>

          <button
            type="button"
            disabled={categorized.inRange.length === 0}
            onClick={handleDownloadProofPdf}
            className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Rasmiy PDF Isbot Yuklab Olish</span>
          </button>
        </div>

        {onOpenPaymentModal && (
          <button
            type="button"
            onClick={() => onOpenPaymentModal(classGroup)}
            className="px-3 py-2 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <CreditCard className="w-3.5 h-3.5 text-emerald-700" />
            <span>To'lov oynasini ochish</span>
          </button>
        )}
      </div>

      {/* In-Range Students Table */}
      <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white">
        <div className="px-4 py-2.5 bg-emerald-50/70 border-b border-emerald-200 flex items-center justify-between">
          <span className="text-xs font-extrabold text-emerald-950 flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>
              Tanlangan muddatda ({formatDisplayDate(fromDate)} — {formatDisplayDate(toDate)}) sertifikat olganlar ({categorized.inRange.length} ta)
            </span>
          </span>
        </div>
        {categorized.inRange.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500">
            {verifiedCount === 0
              ? "Hali sertifikat sanalari tekshirilmagan. Yuqoridagi «Tekshirilmaganlarni aniqlash» tugmasini bosing."
              : "Tanlangan sana oralig'iga mos sertifikat topilmadi."}
          </div>
        ) : (
          <div className="max-h-56 overflow-y-auto divide-y divide-slate-100">
            {categorized.inRange.map((item, idx) => (
              <div key={item.student.id} className="px-4 py-2 flex items-center justify-between gap-2 text-xs hover:bg-slate-50">
                <div className="min-w-0">
                  <span className="font-bold text-slate-900 block truncate">
                    {idx + 1}. {item.student.fullName}
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    Manba: {item.source || 'official-page'}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-900 font-mono font-bold text-[11px] border border-emerald-200">
                    📅 {formatDisplayDate(item.date)}
                  </span>
                  <a
                    href={item.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded-lg border border-slate-200 text-blue-600 hover:bg-blue-50"
                    title="Sertifikat sahifasini ochib tekshirish"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Earlier Period List (e.g., 2025) */}
      {categorized.earlier.length > 0 && (
        <details className="border border-slate-200 rounded-2xl overflow-hidden bg-white">
          <summary className="px-4 py-2.5 bg-slate-50 text-xs font-bold text-slate-700 cursor-pointer select-none flex items-center justify-between">
            <span>📁 Oldingi davrda ({formatDisplayDate(fromDate)} dan oldin) olganlar — {categorized.earlier.length} nafar (hisobga kirmaydi)</span>
          </summary>
          <div className="max-h-40 overflow-y-auto divide-y divide-slate-100">
            {categorized.earlier.map((item, idx) => (
              <div key={item.student.id} className="px-4 py-2 flex items-center justify-between gap-2 text-xs">
                <span className="text-slate-700 truncate">
                  {idx + 1}. {item.student.fullName}
                </span>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[11px]">
                    {formatDisplayDate(item.date)}
                  </span>
                  <a href={item.link} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-[11px]">
                    Havola
                  </a>
                </div>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Unverified / Failed List */}
      {categorized.unverified.length > 0 && (
        <details open className="border border-amber-200 rounded-2xl overflow-hidden bg-white">
          <summary className="px-4 py-2.5 bg-amber-50 text-xs font-bold text-amber-900 cursor-pointer select-none flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <span>Hali rasmiy sanasi aniqlanmagan sertifikatlar ({categorized.unverified.length} ta)</span>
          </summary>
          <div className="max-h-44 overflow-y-auto divide-y divide-amber-100">
            {categorized.unverified.map((item, idx) => (
              <div key={item.student.id} className="px-4 py-2 flex items-center justify-between gap-2 text-xs">
                <div className="min-w-0">
                  <span className="font-semibold text-slate-800 block truncate">
                    {idx + 1}. {item.student.fullName}
                  </span>
                  {item.error ? (
                    <span className="text-[10px] text-rose-600 block truncate">{item.error}</span>
                  ) : item.savedAt ? (
                    <span className="text-[10px] text-slate-400 flex items-center gap-1">
                      <Clock className="w-2.5 h-2.5" /> Bazaga kiritilgan: {formatDisplayDate(item.savedAt)} (rasmiy QR sanasi emas)
                    </span>
                  ) : null}
                </div>
                <a
                  href={item.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-blue-700 text-[11px] font-semibold flex items-center gap-1 flex-shrink-0"
                >
                  <span>Ochish</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
};
