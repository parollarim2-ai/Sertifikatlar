import React, { useState, useMemo } from 'react';
import { TeacherCertificate, EmailAccount } from '../types';
import { extractPassportDigits } from '../utils/studentValidator';
import { 
  GraduationCap, 
  Plus, 
  Search, 
  Award, 
  Clock, 
  AlertCircle, 
  DollarSign, 
  Copy, 
  ExternalLink, 
  Edit3, 
  Trash2, 
  CheckCircle2, 
  X, 
  FileText, 
  Mail, 
  Send,
  AlertTriangle,
  UserCheck,
  CreditCard,
  Check,
  Download
} from 'lucide-react';

interface TeacherCertificatesTabProps {
  teachers: TeacherCertificate[];
  emailPool: EmailAccount[];
  onAddTeacher: (teacher: TeacherCertificate) => void;
  onAddBatchTeachers: (teachers: TeacherCertificate[]) => void;
  onUpdateTeacher: (teacher: TeacherCertificate) => void;
  onDeleteTeacher: (teacherId: string) => void;
  onAssignEmailFromPool?: (teacherId: string) => void;
}

export const TeacherCertificatesTab: React.FC<TeacherCertificatesTabProps> = ({
  teachers,
  emailPool,
  onAddTeacher,
  onAddBatchTeachers,
  onUpdateTeacher,
  onDeleteTeacher,
  onAssignEmailFromPool,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'certified' | 'pending' | 'error' | 'debt'>('all');
  
  // Modals
  const [isSingleModalOpen, setIsSingleModalOpen] = useState(false);
  const [isTextImportModalOpen, setIsTextImportModalOpen] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState<TeacherCertificate | null>(null);
  const [paymentEditTeacher, setPaymentEditTeacher] = useState<TeacherCertificate | null>(null);

  // Quick toast
  const [quickToast, setQuickToast] = useState('');
  const showToast = (msg: string) => {
    setQuickToast(msg);
    setTimeout(() => setQuickToast(''), 2200);
  };

  // Stats calculation
  const totalTeachers = teachers.length;
  const certifiedTeachers = teachers.filter((t) => t.status === 'certified');
  const certifiedCount = certifiedTeachers.length;
  const pendingCount = teachers.filter((t) => t.status === 'pending').length;
  const errorCount = teachers.filter((t) => t.status === 'error' || t.hasError).length;

  const totalRevenue = teachers.reduce((sum, t) => sum + (t.price || 5000), 0);
  const totalPaid = teachers.reduce((sum, t) => sum + (t.paidAmount || 0), 0);
  const totalDebt = Math.max(0, totalRevenue - totalPaid);
  const indebtedTeachers = teachers.filter((t) => (t.price || 5000) > (t.paidAmount || 0));

  // Filtered teachers list
  const filteredTeachers = useMemo(() => {
    return teachers.filter((t) => {
      // Status filter
      if (statusFilter === 'certified' && t.status !== 'certified') return false;
      if (statusFilter === 'pending' && t.status !== 'pending') return false;
      if (statusFilter === 'error' && t.status !== 'error' && !t.hasError) return false;
      if (statusFilter === 'debt' && (t.price || 5000) <= (t.paidAmount || 0)) return false;

      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          t.fullName.toLowerCase().includes(q) ||
          (t.subject && t.subject.toLowerCase().includes(q)) ||
          (t.passportOrId && t.passportOrId.toLowerCase().includes(q)) ||
          (t.assignedEmail && t.assignedEmail.toLowerCase().includes(q)) ||
          (t.phone && t.phone.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [teachers, statusFilter, searchQuery]);

  // Copy helper
  const handleCopy = (text: string, label: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    showToast(`📋 ${label} nusxalandi!`);
  };

  // Quick mark fully paid
  const handleQuickMarkPaid = (teacher: TeacherCertificate) => {
    const updated: TeacherCertificate = {
      ...teacher,
      paidAmount: teacher.price || 5000,
      paymentStatus: 'paid',
    };
    onUpdateTeacher(updated);
    showToast(`✅ "${teacher.fullName}" uchun to'lov to'liq belgilandi!`);
  };

  // Quick mark status
  const handleQuickStatusChange = (teacher: TeacherCertificate, newStatus: 'certified' | 'pending' | 'error') => {
    const updated: TeacherCertificate = {
      ...teacher,
      status: newStatus,
      hasError: newStatus === 'error',
    };
    onUpdateTeacher(updated);
    showToast(`Holat yangilandi: ${newStatus === 'certified' ? 'Sertifikat tayyor' : newStatus === 'error' ? 'Xatolik' : 'Kutilmoqda'}`);
  };

  // Generate Telegram share report text for teachers
  const handleCopyTeachersTelegramReport = () => {
    if (teachers.length === 0) {
      showToast("Ustozlar ro'yxati bo'sh!");
      return;
    }

    const lines: string[] = [];
    lines.push(`🎓 <b>MAKTAB USTOZLARI SERTIFIKAT NATIJALARI</b>\n`);
    lines.push(`📊 <b>Jami ustozlar:</b> ${totalTeachers} nafar`);
    lines.push(`🟢 <b>Sertifikat olganlar:</b> ${certifiedCount} nafar`);
    lines.push(`⏳ <b>Kutilayotganlar:</b> ${pendingCount} nafar`);
    if (errorCount > 0) lines.push(`🔴 <b>Muammolilar:</b> ${errorCount} nafar`);
    lines.push(`💰 <b>To'lov holati:</b> ${totalPaid.toLocaleString()} / ${totalRevenue.toLocaleString()} so'm (Qarzdorlik: ${totalDebt.toLocaleString()} so'm)\n`);
    lines.push(`📋 <b>USTOZLAR RO'YXATI:</b>`);

    teachers.forEach((t, i) => {
      const icon = t.status === 'certified' ? '🟢' : t.status === 'error' ? '🔴' : '⏳';
      const debt = (t.price || 5000) - (t.paidAmount || 0);
      const payStr = debt <= 0 ? "To'langan" : `Qarzdor: ${debt.toLocaleString()} so'm`;
      const subj = t.subject ? ` (${t.subject})` : '';
      lines.push(`${i + 1}. ${icon} <b>${t.fullName}</b>${subj} — ${t.status === 'certified' ? 'Sertifikat tayyor' : 'Jarayonda'} [${payStr}]`);
      if (t.certificateLink) {
        lines.push(`   🔗 Havola: ${t.certificateLink}`);
      }
    });

    navigator.clipboard.writeText(lines.join('\n'));
    showToast("✅ Ustozlar to'liq hisoboti Telegram matni sifatida nusxalandi!");
  };

  return (
    <div className="space-y-4">
      {/* Toast */}
      {quickToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-xl shadow-xl text-xs font-semibold animate-fade-in flex items-center gap-2 border border-slate-700">
          <span>{quickToast}</span>
        </div>
      )}

      {/* Header & Quick Action Buttons */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-700 border border-purple-200 flex items-center justify-center flex-shrink-0">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                  Ustozlar Sertifikatlari Boshqaruvi
                </h2>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200">
                  Pedagoglar
                </span>
              </div>
              <p className="text-xs text-slate-500">
                O'qituvchilarning Coursera sertifikatlari, to'lovlari va qarzdorlik hisoboti.
              </p>
            </div>
          </div>

          {/* Action buttons (Text only input as requested - NO file drops) */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setIsTextImportModalOpen(true)}
              className="px-3.5 py-2 rounded-xl bg-purple-700 hover:bg-purple-800 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
              title="Ustozlar ro'yxatini matndan nusxalab qo'yish"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Matn orqali kiritish (Tezkor)</span>
            </button>

            <button
              onClick={() => {
                setEditingTeacher(null);
                setIsSingleModalOpen(true);
              }}
              className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Yakka ustoz qo'shish</span>
            </button>

            <button
              onClick={handleCopyTeachersTelegramReport}
              className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-medium border border-slate-300 flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Telegram uchun hisobot matnini nusxalash"
            >
              <Send className="w-3.5 h-3.5 text-blue-600" />
              <span>Telegramga hisobot</span>
            </button>
          </div>
        </div>
      </div>

      {/* 4 Summary Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Total teachers */}
        <div className="bg-white border border-slate-200 rounded-2xl p-3.5 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-medium">Jami Ustozlar</span>
            <div className="w-6 h-6 rounded-lg bg-purple-50 text-purple-700 flex items-center justify-center">
              <GraduationCap className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-bold text-slate-900">
            {totalTeachers} <span className="text-xs text-slate-500 font-normal">nafar</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            {certifiedCount} ta sertifikat olgan
          </div>
        </div>

        {/* Certified count */}
        <div className="bg-white border border-slate-200 rounded-2xl p-3.5 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-medium">Sertifikat Olganlar</span>
            <div className="w-6 h-6 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <Award className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-bold text-emerald-700">
            {certifiedCount} <span className="text-xs text-emerald-600 font-normal">nafar</span>
          </div>
          <div className="text-[11px] text-emerald-600 font-medium mt-0.5">
            {totalTeachers > 0 ? Math.round((certifiedCount / totalTeachers) * 100) : 0}% muvaffaqiyat
          </div>
        </div>

        {/* Debt summary (User requested specifically!) */}
        <div className={`rounded-2xl p-3.5 shadow-xs border ${
          totalDebt > 0 ? 'bg-rose-50/70 border-rose-200' : 'bg-white border-slate-200'
        }`}>
          <div className="flex items-center justify-between mb-1">
            <span className={`text-xs font-medium ${totalDebt > 0 ? 'text-rose-700' : 'text-slate-500'}`}>
              Qarzdorlik
            </span>
            <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${
              totalDebt > 0 ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'
            }`}>
              <AlertTriangle className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className={`text-xl sm:text-2xl font-bold ${totalDebt > 0 ? 'text-rose-700' : 'text-slate-800'}`}>
            {totalDebt.toLocaleString()} <span className="text-xs font-normal">so'm</span>
          </div>
          <div className={`text-[11px] font-semibold mt-0.5 ${totalDebt > 0 ? 'text-rose-600' : 'text-slate-500'}`}>
            {indebtedTeachers.length > 0 ? `${indebtedTeachers.length} nafar ustoz qarzdor` : "Qarzdorlik yo'q (100% to'langan)"}
          </div>
        </div>

        {/* Revenue collected */}
        <div className="bg-white border border-slate-200 rounded-2xl p-3.5 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-medium">To'langan Summa</span>
            <div className="w-6 h-6 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <DollarSign className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-bold text-emerald-800">
            {totalPaid.toLocaleString()} <span className="text-xs font-normal text-emerald-600">so'm</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Jami: {totalRevenue.toLocaleString()} so'm
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-3 sm:p-4 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
          {/* Search box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Ustoz ismi, fani, pasport yoki email bo'yicha qidirish..."
              className="w-full pl-9 pr-4 py-2 bg-slate-50 hover:bg-slate-100/70 focus:bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-purple-600 transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Status Filters */}
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                statusFilter === 'all'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Barchasi ({teachers.length})
            </button>
            <button
              onClick={() => setStatusFilter('certified')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                statusFilter === 'certified'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
              }`}
            >
              Sertifikat olganlar ({certifiedCount})
            </button>
            <button
              onClick={() => setStatusFilter('debt')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                statusFilter === 'debt'
                  ? 'bg-rose-600 text-white'
                  : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
              }`}
            >
              Qarzdorlar ({indebtedTeachers.length})
            </button>
            <button
              onClick={() => setStatusFilter('pending')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                statusFilter === 'pending'
                  ? 'bg-amber-600 text-white'
                  : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
              }`}
            >
              Kutilmoqda ({pendingCount})
            </button>
          </div>
        </div>

        {/* Table of teachers */}
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/90 text-slate-600 font-semibold border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-3 w-8">#</th>
                <th className="py-2.5 px-3">Ustoz F.I.SH & Mutaxassisligi</th>
                <th className="py-2.5 px-3">Pasport / JShShIR</th>
                <th className="py-2.5 px-3">Coursera Login & Parol</th>
                <th className="py-2.5 px-3">Sertifikat Holati</th>
                <th className="py-2.5 px-3">To'lov & Qarzdorlik</th>
                <th className="py-2.5 px-3 text-right">Amallar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {filteredTeachers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-400">
                    <GraduationCap className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    <p className="font-semibold text-slate-600">Ustozlar topilmadi</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Yuqoridagi "Matn orqali kiritish" tugmasini bosib ustozlar ro'yxatini kiriting.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredTeachers.map((teacher, index) => {
                  const debt = (teacher.price || 5000) - (teacher.paidAmount || 0);
                  const isPaid = debt <= 0;
                  const passportDigits = extractPassportDigits(teacher.passportOrId || '');

                  return (
                    <tr key={teacher.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-3 text-slate-400 font-mono text-[11px]">
                        {index + 1}
                      </td>

                      {/* Full Name & Subject */}
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full flex-shrink-0 bg-purple-500" />
                          <div>
                            <div className="font-bold text-slate-900 flex items-center gap-1.5">
                              <span>{teacher.fullName}</span>
                              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-md bg-purple-100 text-purple-800 border border-purple-200 uppercase tracking-wider">
                                Ustoz
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                              {teacher.subject && (
                                <span className="font-semibold text-purple-700 bg-purple-50 px-1.5 py-0.2 rounded">
                                  {teacher.subject}
                                </span>
                              )}
                              {teacher.phone && (
                                <span className="font-mono text-slate-600">{teacher.phone}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Passport */}
                      <td className="py-3 px-3">
                        {teacher.passportOrId ? (
                          <div>
                            <div 
                              onClick={() => handleCopy(teacher.passportOrId || '', 'Pasport seriya')}
                              className="font-mono font-semibold text-slate-800 hover:text-blue-700 cursor-pointer flex items-center gap-1"
                              title="To'liq nusxalash"
                            >
                              <span>{teacher.passportOrId}</span>
                              <Copy className="w-3 h-3 text-slate-400" />
                            </div>
                            {passportDigits && (
                              <button
                                onClick={() => handleCopy(passportDigits, 'Raqam')}
                                className="text-[10px] text-slate-500 hover:text-blue-600 font-mono underline"
                              >
                                Faqat raqam: {passportDigits}
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="text-amber-600 text-[11px] font-medium">Kiritilmagan</span>
                        )}
                      </td>

                      {/* Email & Password */}
                      <td className="py-3 px-3">
                        {teacher.assignedEmail ? (
                          <div className="space-y-0.5">
                            <div 
                              onClick={() => handleCopy(teacher.assignedEmail || '', 'Email')}
                              className="font-mono text-[11px] text-blue-700 hover:underline cursor-pointer flex items-center gap-1"
                            >
                              <span>{teacher.assignedEmail}</span>
                              <Copy className="w-3 h-3 text-slate-400" />
                            </div>
                            {teacher.assignedPassword && (
                              <div 
                                onClick={() => handleCopy(teacher.assignedPassword || '', 'Parol')}
                                className="font-mono text-[10px] text-slate-500 hover:text-slate-800 cursor-pointer flex items-center gap-1"
                              >
                                <span>Parol: {teacher.assignedPassword}</span>
                                <Copy className="w-2.5 h-2.5 text-slate-400" />
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <span className="text-slate-400 text-[11px]">Email yo'q</span>
                            {onAssignEmailFromPool && (
                              <button
                                onClick={() => onAssignEmailFromPool(teacher.id)}
                                className="px-2 py-0.5 text-[10px] font-bold bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-md border border-blue-200 cursor-pointer"
                                title="Zaxiradan avtomatik email biriktirish"
                              >
                                + Biriktirish
                              </button>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Certificate status */}
                      <td className="py-3 px-3">
                        <div className="space-y-1">
                          {teacher.status === 'certified' ? (
                            <div>
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                <span>Sertifikat tayyor</span>
                              </span>
                              {teacher.certificateLink && (
                                <a
                                  href={teacher.certificateLink}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-[11px] text-blue-600 hover:underline flex items-center gap-1 mt-0.5 font-medium"
                                >
                                  <span>Sertifikatni ochish</span>
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              )}
                            </div>
                          ) : teacher.status === 'error' || teacher.hasError ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
                              <AlertCircle className="w-3 h-3 text-rose-600" />
                              <span>Xatolik</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                              <Clock className="w-3 h-3 text-amber-600" />
                              <span>Kutilmoqda</span>
                            </span>
                          )}

                          {/* Quick status switch buttons */}
                          <div className="flex items-center gap-1 pt-0.5">
                            {teacher.status !== 'certified' && (
                              <button
                                onClick={() => handleQuickStatusChange(teacher, 'certified')}
                                className="text-[10px] text-emerald-700 hover:underline font-semibold"
                              >
                                [✓ Tayyor]
                              </button>
                            )}
                            {teacher.status !== 'pending' && (
                              <button
                                onClick={() => handleQuickStatusChange(teacher, 'pending')}
                                className="text-[10px] text-amber-700 hover:underline font-semibold"
                              >
                                [⏳ Kutilmoqda]
                              </button>
                            )}
                            {teacher.status !== 'error' && (
                              <button
                                onClick={() => handleQuickStatusChange(teacher, 'error')}
                                className="text-[10px] text-rose-700 hover:underline font-semibold"
                              >
                                [✕ Xato]
                              </button>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Payment & Debt */}
                      <td className="py-3 px-3">
                        <div className="space-y-0.5">
                          {isPaid ? (
                            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                              <Check className="w-3 h-3 text-emerald-600" />
                              <span>To'langan ({teacher.paidAmount?.toLocaleString()} so'm)</span>
                            </div>
                          ) : (
                            <div>
                              <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-rose-50 text-rose-800 border border-rose-200">
                                <AlertTriangle className="w-3 h-3 text-rose-600" />
                                <span>Qarzdor: {debt.toLocaleString()} so'm</span>
                              </div>
                              <div className="text-[10px] text-slate-500 mt-0.5">
                                Narxi: {teacher.price?.toLocaleString()} | To'lagan: {teacher.paidAmount?.toLocaleString() || 0}
                              </div>
                            </div>
                          )}

                          <div>
                            <button
                              onClick={() => setPaymentEditTeacher(teacher)}
                              className="text-[10px] text-blue-600 hover:underline font-medium"
                            >
                              Tahrirlash
                            </button>
                            {!isPaid && (
                              <button
                                onClick={() => handleQuickMarkPaid(teacher)}
                                className="text-[10px] text-emerald-700 hover:underline font-bold ml-2"
                              >
                                To'liq to'landi
                              </button>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => {
                              setEditingTeacher(teacher);
                              setIsSingleModalOpen(true);
                            }}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                            title="Tahrirlash"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              onDeleteTeacher(teacher.id);
                              showToast("Ustoz ro'yxatdan o'chirildi");
                            }}
                            className="p-1.5 rounded-lg text-rose-500 hover:text-rose-700 hover:bg-rose-50 transition-colors"
                            title="O'chirish"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL 1: TEXT-BASED BULK IMPORT (NO FILES, TEXT ONLY) */}
      {isTextImportModalOpen && (
        <TextImportTeachersModal
          onClose={() => setIsTextImportModalOpen(false)}
          onImport={(imported) => {
            onAddBatchTeachers(imported);
            setIsTextImportModalOpen(false);
            showToast(`✅ ${imported.length} nafar ustoz muvaffaqiyatli kiritildi!`);
          }}
        />
      )}

      {/* MODAL 2: SINGLE TEACHER ADD / EDIT */}
      {isSingleModalOpen && (
        <SingleTeacherModal
          teacher={editingTeacher}
          onClose={() => {
            setIsSingleModalOpen(false);
            setEditingTeacher(null);
          }}
          onSave={(saved) => {
            if (editingTeacher) {
              onUpdateTeacher(saved);
              showToast("Ustoz ma'lumotlari yangilandi");
            } else {
              onAddTeacher(saved);
              showToast("Yangi ustoz qo'shildi");
            }
            setIsSingleModalOpen(false);
            setEditingTeacher(null);
          }}
        />
      )}

      {/* MODAL 3: PAYMENT EDIT */}
      {paymentEditTeacher && (
        <PaymentEditModal
          teacher={paymentEditTeacher}
          onClose={() => setPaymentEditTeacher(null)}
          onSave={(price, paidAmount) => {
            const updated: TeacherCertificate = {
              ...paymentEditTeacher,
              price,
              paidAmount,
              paymentStatus: paidAmount >= price ? 'paid' : paidAmount > 0 ? 'partial' : 'pending',
            };
            onUpdateTeacher(updated);
            setPaymentEditTeacher(null);
            showToast("To'lov ma'lumotlari yangilandi");
          }}
        />
      )}
    </div>
  );
};

// Sub-component: Text-based Bulk Import Modal
interface TextImportTeachersModalProps {
  onClose: () => void;
  onImport: (teachers: TeacherCertificate[]) => void;
}

const TextImportTeachersModal: React.FC<TextImportTeachersModalProps> = ({ onClose, onImport }) => {
  const [rawText, setRawText] = useState('');
  const [defaultSubject, setDefaultSubject] = useState('');
  const [defaultPrice, setDefaultPrice] = useState(5000);
  const [defaultPaid, setDefaultPaid] = useState(false);

  // Parse text lines
  const parsedPreview = useMemo(() => {
    if (!rawText.trim()) return [];

    const lines = rawText.split('\n').map((l) => l.trim()).filter(Boolean);
    const result: TeacherCertificate[] = [];

    lines.forEach((line, idx) => {
      // Split by |, tab, or comma
      let parts = line.split(/[|\t,]/).map((p) => p.trim()).filter(Boolean);
      
      // If no delimiter, try hyphen
      if (parts.length === 1 && line.includes(' - ')) {
        parts = line.split(' - ').map((p) => p.trim()).filter(Boolean);
      }

      const fullName = parts[0] || `Ustoz ${idx + 1}`;
      const subject = parts[1] || defaultSubject || 'Fan o\'qituvchisi';
      const passportOrId = parts[2] || '';
      const phone = parts[3] || '';

      result.push({
        id: `teacher-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 7)}`,
        fullName,
        subject,
        passportOrId,
        phone,
        status: 'pending',
        price: defaultPrice,
        paidAmount: defaultPaid ? defaultPrice : 0,
        paymentStatus: defaultPaid ? 'paid' : 'pending',
        createdAt: new Date().toISOString(),
      });
    });

    return result;
  }, [rawText, defaultSubject, defaultPrice, defaultPaid]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-2xl w-full border border-slate-200 shadow-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-700 flex items-center justify-center">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Ustozlarni Matn Shaklida Kiritish (Nusxalash)
              </h3>
              <p className="text-[11px] text-slate-500">
                Telegram, Word yoki xabardan ustozlar ro'yxatini to'g'ridan-to'g'ri nusxalab qo'ying.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Global defaults */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs">
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              Sukut bo'yicha Fan / Mutaxassislik:
            </label>
            <input
              type="text"
              value={defaultSubject}
              onChange={(e) => setDefaultSubject(e.target.value)}
              placeholder="Masalan: Informatika"
              className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              Sertifikat narxi (so'm):
            </label>
            <input
              type="number"
              value={defaultPrice}
              onChange={(e) => setDefaultPrice(Number(e.target.value) || 0)}
              className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono"
            />
          </div>
          <div className="flex items-center gap-2 pt-4">
            <input
              type="checkbox"
              id="defaultPaid"
              checked={defaultPaid}
              onChange={(e) => setDefaultPaid(e.target.checked)}
              className="rounded text-purple-600 focus:ring-purple-500"
            />
            <label htmlFor="defaultPaid" className="text-xs font-semibold text-slate-700 cursor-pointer">
              To'lov to'langan deb belgilansin
            </label>
          </div>
        </div>

        {/* Textarea */}
        <div className="space-y-1.5">
          <label className="block text-xs font-bold text-slate-800">
            Ustozlar matni (Har bir qatorga bitta ustoz):
          </label>
          <textarea
            rows={6}
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder={`Masalan:\nKarimov Dilshod | Informatika | AA 1234567 | +998901234567\nSobirova Ra'no | Fizika | AB 9876543\nNazarov Elyor | Matematika`}
            className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono focus:bg-white focus:outline-none focus:border-purple-600 leading-relaxed"
          />
          <p className="text-[11px] text-slate-500">
            💡 <strong>Format:</strong> Har bir qatorda ustoz ismini yozing. Fanini yoki pasportini <code>|</code> yoki <code>-</code> belgisi bilan ajratib yozishingiz mumkin.
          </p>
        </div>

        {/* Preview */}
        {parsedPreview.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-bold text-slate-700">
              <span>Aniqlangan ustozlar ro'yxati:</span>
              <span className="text-purple-700">{parsedPreview.length} nafar ustoz</span>
            </div>
            <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-xl p-2 bg-slate-50 text-xs divide-y divide-slate-200">
              {parsedPreview.map((item, idx) => (
                <div key={idx} className="py-1.5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-slate-400 text-[11px]">{idx + 1}.</span>
                    <span className="font-semibold text-slate-800">{item.fullName}</span>
                    <span className="text-[11px] text-purple-700 bg-purple-100 px-1.5 py-0.2 rounded font-medium">
                      {item.subject}
                    </span>
                    {item.passportOrId && (
                      <span className="text-[11px] font-mono text-slate-500">
                        ({item.passportOrId})
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] font-bold text-emerald-700 font-mono">
                    {item.price.toLocaleString()} so'm {item.paidAmount > 0 ? '(To\'langan)' : '(Qarzdor)'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Buttons */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 text-xs font-semibold cursor-pointer"
          >
            Bekor qilish
          </button>
          <button
            disabled={parsedPreview.length === 0}
            onClick={() => onImport(parsedPreview)}
            className="px-4 py-2 rounded-xl bg-purple-700 hover:bg-purple-800 disabled:opacity-50 text-white text-xs font-bold cursor-pointer transition-colors shadow-xs"
          >
            Barchasini qo'shish ({parsedPreview.length} ta)
          </button>
        </div>
      </div>
    </div>
  );
};

// Sub-component: Single Teacher Modal
interface SingleTeacherModalProps {
  teacher: TeacherCertificate | null;
  onClose: () => void;
  onSave: (teacher: TeacherCertificate) => void;
}

const SingleTeacherModal: React.FC<SingleTeacherModalProps> = ({ teacher, onClose, onSave }) => {
  const [fullName, setFullName] = useState(teacher?.fullName || '');
  const [subject, setSubject] = useState(teacher?.subject || '');
  const [passportOrId, setPassportOrId] = useState(teacher?.passportOrId || '');
  const [birthDate, setBirthDate] = useState(teacher?.birthDate || '');
  const [phone, setPhone] = useState(teacher?.phone || '');
  const [assignedEmail, setAssignedEmail] = useState(teacher?.assignedEmail || '');
  const [assignedPassword, setAssignedPassword] = useState(teacher?.assignedPassword || '');
  const [certificateLink, setCertificateLink] = useState(teacher?.certificateLink || '');
  const [status, setStatus] = useState<'pending' | 'certified' | 'error'>(teacher?.status || 'pending');
  const [price, setPrice] = useState(teacher?.price || 5000);
  const [paidAmount, setPaidAmount] = useState(teacher?.paidAmount || 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) return;

    const data: TeacherCertificate = {
      id: teacher?.id || `teacher-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      fullName: fullName.trim(),
      subject: subject.trim() || undefined,
      passportOrId: passportOrId.trim() || undefined,
      birthDate: birthDate.trim() || undefined,
      phone: phone.trim() || undefined,
      assignedEmail: assignedEmail.trim() || undefined,
      assignedPassword: assignedPassword.trim() || undefined,
      certificateLink: certificateLink.trim() || undefined,
      status,
      hasError: status === 'error',
      price: Number(price) || 5000,
      paidAmount: Number(paidAmount) || 0,
      paymentStatus: Number(paidAmount) >= Number(price) ? 'paid' : Number(paidAmount) > 0 ? 'partial' : 'pending',
      createdAt: teacher?.createdAt || new Date().toISOString(),
    };

    onSave(data);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-lg w-full border border-slate-200 shadow-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-700 flex items-center justify-center">
              <GraduationCap className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-bold text-slate-900">
              {teacher ? "Ustoz ma'lumotlarini tahrirlash" : "Yakka ustoz qo'shish"}
            </h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div>
            <label className="block text-slate-700 font-bold mb-1">
              Ustoz F.I.SH <span className="text-rose-500">*</span>:
            </label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Masalan: Karimov Dilshod Nematovich"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:border-purple-600"
            />
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-slate-700 font-bold mb-1">Fani / Mutaxassisligi:</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Informatika"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:border-purple-600"
              />
            </div>
            <div>
              <label className="block text-slate-700 font-bold mb-1">Pasport / JShShIR:</label>
              <input
                type="text"
                value={passportOrId}
                onChange={(e) => setPassportOrId(e.target.value)}
                placeholder="AA 1234567 yoki 14 raqam"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:border-purple-600 font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-slate-700 font-bold mb-1">Tug'ilgan sana:</label>
              <input
                type="text"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                placeholder="DD.MM.YYYY"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:border-purple-600"
              />
            </div>
            <div>
              <label className="block text-slate-700 font-bold mb-1">Telefon raqami:</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+998..."
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:border-purple-600 font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-slate-700 font-bold mb-1">Coursera Email:</label>
              <input
                type="email"
                value={assignedEmail}
                onChange={(e) => setAssignedEmail(e.target.value)}
                placeholder="pochta@gmail.com"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:border-purple-600 font-mono"
              />
            </div>
            <div>
              <label className="block text-slate-700 font-bold mb-1">Coursera Parol:</label>
              <input
                type="text"
                value={assignedPassword}
                onChange={(e) => setAssignedPassword(e.target.value)}
                placeholder="Parol"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:border-purple-600 font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-700 font-bold mb-1">Sertifikat Havolasi (Link):</label>
            <input
              type="url"
              value={certificateLink}
              onChange={(e) => {
                setCertificateLink(e.target.value);
                if (e.target.value.trim() && status === 'pending') {
                  setStatus('certified');
                }
              }}
              placeholder="https://coursera.org/verify/..."
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:border-purple-600 font-mono text-[11px]"
            />
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            <div>
              <label className="block text-slate-700 font-bold mb-1">Holati:</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold"
              >
                <option value="pending">Kutilmoqda</option>
                <option value="certified">Sertifikat tayyor</option>
                <option value="error">Xatolik</option>
              </select>
            </div>
            <div>
              <label className="block text-slate-700 font-bold mb-1">Narxi (so'm):</label>
              <input
                type="number"
                value={price}
                onChange={(e) => setPrice(Number(e.target.value))}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold"
              />
            </div>
            <div>
              <label className="block text-slate-700 font-bold mb-1">To'langan (so'm):</label>
              <input
                type="number"
                value={paidAmount}
                onChange={(e) => setPaidAmount(Number(e.target.value))}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold cursor-pointer"
            >
              Bekor qilish
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-bold cursor-pointer transition-colors shadow-xs"
            >
              Saqlash
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Sub-component: Payment Edit Modal
interface PaymentEditModalProps {
  teacher: TeacherCertificate;
  onClose: () => void;
  onSave: (price: number, paidAmount: number) => void;
}

const PaymentEditModal: React.FC<PaymentEditModalProps> = ({ teacher, onClose, onSave }) => {
  const [price, setPrice] = useState(teacher.price || 5000);
  const [paidAmount, setPaidAmount] = useState(teacher.paidAmount || 0);

  const debt = Math.max(0, price - paidAmount);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl p-5 space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-emerald-600" />
            <h3 className="text-sm font-bold text-slate-900">
              To'lovni tahrirlash: {teacher.fullName}
            </h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3 text-xs">
          <div>
            <label className="block text-slate-700 font-bold mb-1">Sertifikat narxi (so'm):</label>
            <input
              type="number"
              value={price}
              onChange={(e) => setPrice(Number(e.target.value) || 0)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold"
            />
          </div>

          <div>
            <label className="block text-slate-700 font-bold mb-1">To'langan summa (so'm):</label>
            <input
              type="number"
              value={paidAmount}
              onChange={(e) => setPaidAmount(Number(e.target.value) || 0)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold text-emerald-700"
            />
          </div>

          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between font-bold">
            <span className="text-slate-600">Qarzdorlik miqdori:</span>
            <span className={debt > 0 ? 'text-rose-600 font-mono text-sm' : 'text-emerald-600'}>
              {debt > 0 ? `${debt.toLocaleString()} so'm` : "To'liq to'langan (0 so'm)"}
            </span>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => setPaidAmount(price)}
              className="flex-1 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold hover:bg-emerald-100 transition-colors"
            >
              To'liq to'landi ({price.toLocaleString()})
            </button>
            <button
              type="button"
              onClick={() => setPaidAmount(0)}
              className="py-1.5 px-3 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 font-medium"
            >
              0 so'm
            </button>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 text-xs">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold">
            Bekor qilish
          </button>
          <button
            onClick={() => onSave(price, paidAmount)}
            className="px-4 py-2 rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-bold transition-colors shadow-xs"
          >
            Saqlash
          </button>
        </div>
      </div>
    </div>
  );
};
