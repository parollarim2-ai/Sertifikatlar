import React from 'react';
import { 
  X, 
  Zap, 
  Flame, 
  Trophy, 
  TrendingUp, 
  TrendingDown, 
  Clock, 
  Calendar, 
  Sparkles, 
  BarChart2, 
  Activity, 
  CheckCircle2, 
  Target,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';
import { OperatorSpeedAnalysis } from '../utils/operatorSpeedTracker';

interface OperatorSpeedAnalyticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  analysis: OperatorSpeedAnalysis;
}

export const OperatorSpeedAnalyticsModal: React.FC<OperatorSpeedAnalyticsModalProps> = ({
  isOpen,
  onClose,
  analysis,
}) => {
  if (!isOpen) return null;

  // Find max seconds for normalizing diagram bar height
  const maxBarSec = Math.max(1, ...analysis.dailyHistory.map((d) => d.averageSeconds));

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden my-6 border border-slate-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-400/40 text-amber-300 flex items-center justify-center flex-shrink-0">
              <Zap className="w-5 h-5 fill-amber-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base text-white">Operator Ish Tezligi va Analitikasi</h3>
                {analysis.isActive ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                    Faol Ish Seansi
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-700 text-slate-300">
                    Tanaffus / To'xtatilgan
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Har bir sertifikat kiritish oralig'i, o'rtacha sur'at va ertangi kun prognozi
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 max-h-[82vh] overflow-y-auto">
          
          {/* Status Card */}
          <div className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
            analysis.isActive 
              ? 'bg-amber-500/10 border-amber-300 text-amber-950' 
              : 'bg-slate-50 border-slate-200 text-slate-800'
          }`}>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                analysis.isActive ? 'bg-amber-500 text-white' : 'bg-slate-200 text-slate-600'
              }`}>
                {analysis.isActive ? <Flame className="w-5 h-5 fill-white" /> : <Clock className="w-5 h-5" />}
              </div>
              <div>
                <span className="text-xs font-bold uppercase tracking-wider block">
                  {analysis.isActive ? "🔥 Faol Ish Jarayoni Aniqlangan" : "Tizim Holati: Ish To'xtatilgan / Tanaffus"}
                </span>
                <span className="text-xs text-slate-600">
                  {analysis.isActive 
                    ? `Ketma-ket ${analysis.streakCount} ta sertifikat 15 daqiqa oralig'ida kiritildi. Oxirgisi: ${analysis.currentIntervalFormatted}`
                    : analysis.minutesSinceLastCert < 900 
                      ? `Oxirgi sertifikat kiritilganidan beri 15 daqiqadan ko'p vaqt o'tdi (${analysis.currentIntervalFormatted}).`
                      : "Hali faol ish seriyasi boshlanmagan."}
                </span>
              </div>
            </div>

            <div className="text-right sm:border-l sm:border-slate-200/80 sm:pl-4">
              <span className="text-[11px] text-slate-500 block">Joriy O'rtacha Tezlik:</span>
              <span className="text-lg font-black text-slate-900 font-mono">
                {analysis.todayAverageFormatted !== "—" ? analysis.todayAverageFormatted : analysis.overallAverageFormatted}
              </span>
              <span className="text-[10px] text-slate-500 block">bitta o'quvchiga</span>
            </div>
          </div>

          {/* Metric Comparison Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            
            {/* 1. Kecha vs Bugun */}
            <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500 font-bold uppercase">
                <span>Kecha vs Bugun</span>
                <Activity className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-slate-500">Bugun:</span>
                  <span className="text-sm font-bold font-mono text-slate-900">{analysis.todayAverageFormatted}</span>
                </div>
                <div className="flex items-baseline justify-between mt-1">
                  <span className="text-xs text-slate-400">Kecha:</span>
                  <span className="text-xs font-medium font-mono text-slate-600">{analysis.yesterdayAverageFormatted}</span>
                </div>
              </div>

              {analysis.yesterdayAverageSeconds > 0 && analysis.todayAverageSeconds > 0 && (
                <div className={`pt-2 border-t border-slate-100 flex items-center gap-1 text-xs font-bold ${
                  analysis.isFasterThanYesterday ? 'text-emerald-700' : 'text-rose-700'
                }`}>
                  {analysis.isFasterThanYesterday ? (
                    <>
                      <ArrowUpRight className="w-4 h-4" />
                      <span>{analysis.speedChangePercent}% tezlashdi!</span>
                    </>
                  ) : (
                    <>
                      <ArrowDownRight className="w-4 h-4" />
                      <span>{Math.abs(analysis.speedChangePercent)}% sekinroq</span>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* 2. Rekord */}
            <div className="p-4 rounded-xl bg-amber-50/60 border border-amber-200 shadow-2xs space-y-2">
              <div className="flex items-center justify-between text-xs text-amber-800 font-bold uppercase">
                <span>Barcha Davr Rekordi</span>
                <Trophy className="w-4 h-4 text-amber-600" />
              </div>
              <div>
                <span className="text-2xl font-black text-amber-950 font-mono block">
                  {analysis.recordFormatted}
                </span>
                <span className="text-[11px] text-amber-800/90 block mt-0.5 truncate">
                  {analysis.recordStudentName ? `O'quvchi: ${analysis.recordStudentName}` : "Eng tezkor natija"}
                </span>
              </div>
              <div className="pt-1 text-[10px] text-amber-700">
                1 ta sertifikat uchun o'rnatilgan mutlaq rekord
              </div>
            </div>

            {/* 3. Ertangi Kun Prognozi */}
            <div className="p-4 rounded-xl bg-indigo-50/60 border border-indigo-200 shadow-2xs space-y-2">
              <div className="flex items-center justify-between text-xs text-indigo-800 font-bold uppercase">
                <span>Ertangi Kun Prognozi</span>
                <Sparkles className="w-4 h-4 text-indigo-600" />
              </div>
              <div>
                <span className="text-2xl font-black text-indigo-950 font-mono block">
                  ~{analysis.predictedTomorrowFormatted}
                </span>
                <span className="text-[11px] text-indigo-800 font-medium block mt-0.5">
                  Taxminiy quvvat: <strong>~{analysis.projectedCountTomorrow} ta / 2 soatda</strong>
                </span>
              </div>
              <div className="pt-1 text-[10px] text-indigo-600">
                AI / Statistik trend tahlili asosida
              </div>
            </div>
          </div>

          {/* O'sish tartibi diagrammasi (Visual Bar Chart) */}
          <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-blue-600" />
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Kunlik Ish Tezligi va O'sish Diagrammasi (Daqiqalarda)
                </h4>
              </div>
              <span className="text-[11px] text-slate-500 font-medium">Ustun qisqaroq bo'lsa = tezroq!</span>
            </div>

            {analysis.dailyHistory.length === 0 || analysis.dailyHistory.every(d => d.averageSeconds === 0) ? (
              <div className="py-8 text-center text-xs text-slate-400">
                Diagramma uchun hali yetarli ma'lumot to'planmagan. Sertifikatlar kiritilgach bu yerda kunlik o'sish ko'rinadi.
              </div>
            ) : (
              <div className="space-y-2 pt-2">
                <div className="grid grid-cols-5 gap-2 items-end h-32 pt-4 border-b border-slate-200 pb-1">
                  {analysis.dailyHistory.map((day, idx) => {
                    const heightPercent = day.averageSeconds > 0 
                      ? Math.max(15, Math.min(100, Math.round((day.averageSeconds / maxBarSec) * 100))) 
                      : 4;
                    const isToday = day.label === "Bugun";
                    const isBest = day.averageSeconds > 0 && day.averageSeconds === Math.min(...analysis.dailyHistory.filter(d => d.averageSeconds > 0).map(d => d.averageSeconds));

                    return (
                      <div key={idx} className="flex flex-col items-center justify-end h-full gap-1.5 group">
                        <span className="text-[10px] font-mono font-bold text-slate-600 opacity-80 group-hover:opacity-100 transition-opacity">
                          {day.speedFormatted !== "—" ? day.speedFormatted : ""}
                        </span>
                        <div 
                          style={{ height: `${heightPercent}%` }}
                          className={`w-full max-w-[42px] rounded-t-lg transition-all duration-300 relative ${
                            isBest 
                              ? 'bg-gradient-to-t from-emerald-600 to-emerald-400 shadow-xs' 
                              : isToday 
                              ? 'bg-gradient-to-t from-blue-700 to-indigo-500' 
                              : 'bg-gradient-to-t from-slate-400 to-slate-300'
                          }`}
                        >
                          {isBest && (
                            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                              <span className="text-[10px]">🏆</span>
                            </div>
                          )}
                        </div>
                        <span className={`text-[11px] font-semibold ${isToday ? 'text-blue-700 font-bold' : 'text-slate-500'}`}>
                          {day.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                  <span>💡 <b>Qoida:</b> Vaqt kamaygani sari unumdorligingiz oshadi va tezlik darajangiz ko'tariladi.</span>
                  <span className="text-emerald-700 font-bold">Yashil = Eng tez kun</span>
                </div>
              </div>
            )}
          </div>

          {/* Recent Entries Timeline */}
          {analysis.recentIntervals.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5 text-blue-600" />
                Oxirgi Kiritilgan Sertifikatlar Oralig'i
              </h4>
              <div className="rounded-xl border border-slate-200 overflow-hidden text-xs">
                <table className="w-full text-left">
                  <thead className="bg-slate-100 text-slate-600 font-bold text-[11px]">
                    <tr>
                      <th className="py-2 px-3">O'quvchi F.I.SH</th>
                      <th className="py-2 px-3">Ketgan Vaqt</th>
                      <th className="py-2 px-3 text-right">Kiritilgan Vaqti</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {analysis.recentIntervals.map((row, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="py-2 px-3 font-medium text-slate-900">{row.studentName}</td>
                        <td className="py-2 px-3 font-mono font-bold text-blue-700">
                          {row.formatted}
                        </td>
                        <td className="py-2 px-3 text-right text-slate-500 font-mono text-[11px]">{row.time}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* AI Productivity Recommendation */}
          <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200 text-emerald-950 text-xs flex items-start gap-3">
            <Sparkles className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-bold block text-emerald-950">Tizim Tahlili va Xulosa:</span>
              <p className="text-emerald-900 leading-relaxed text-[11px]">
                Siz har bir o'quvchi uchun sertifikat kiritishda yuqori mahorat ko'rsatmoqdasiz. 
                {analysis.todayAverageSeconds > 0 && ` Bugungi o'rtacha sur'at: 1 ta sertifikatga ${analysis.todayAverageFormatted}.`}
                {analysis.isFasterThanYesterday && ` Kechagiga nisbatan ${analysis.speedChangePercent}% tezroq harakatlanmoqdasiz!`}
                {analysis.recordSeconds > 0 && ` Mutlaq rekordingiz: ${analysis.recordFormatted}.`} 
                Shu ketishda davom etsangiz, ertaga 2 soatlik vaqt ichida bemalol <strong>~{analysis.projectedCountTomorrow} tagacha</strong> o'quvchini sertifikat bilan ta'minlay olasiz.
              </p>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
          <span className="text-xs text-slate-500">
            Algoritm: 15 daqiqalik uzluksiz ish seriyalari asosida
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
          >
            Yopish (ESC)
          </button>
        </div>

      </div>
    </div>
  );
};
