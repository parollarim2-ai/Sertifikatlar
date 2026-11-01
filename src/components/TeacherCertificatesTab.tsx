import React, { useState, useMemo, useEffect, useRef } from 'react';
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
  CreditCard,
  Check,
  Download,
  Clipboard,
  RotateCcw,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Sparkles,
  CheckSquare,
  Square,
  HelpCircle,
  ShieldCheck
} from 'lucide-react';

export type TeacherSortField = 'name' | 'subject' | 'status' | 'debt' | 'date';
export type TeacherSortOrder = 'asc' | 'desc';
export type TeacherFilterStatus = 'all' | 'certified' | 'pending' | 'error' | 'debt' | 'no-email';

interface TeacherCertificatesTabProps {
  teachers: TeacherCertificate[];
  emailPool: EmailAccount[];
  onAddTeacher: (teacher: TeacherCertificate) => void;
  onAddBatchTeachers: (teachers: TeacherCertificate[]) => void;
  onUpdateTeacher: (teacher: TeacherCertificate) => void;
  onDeleteTeacher: (teacherId: string) => void;
  onDeleteBatchTeachers?: (teacherIds: string[]) => void;
  onAssignEmailFromPool?: (teacherId: string) => void;
  onAssignBatchEmailsFromPool?: (teacherIds: string[]) => void;
}

const COMMON_SUBJECTS = [
  'Informatika',
  'Matematika',
  'Ingliz tili',
  'Ona tili va adabiyot',
  'Fizika',
  'Kimyo',
  'Biologiya',
  'Tarix',
  'Geografiya',
  'Boshlang\'ich ta\'lim',
  'Jismoniy tarbiya',
  'Texnologiya',
  'Musiqa'
];

export const TeacherCertificatesTab: React.FC<TeacherCertificatesTabProps> = ({
  teachers,
  emailPool,
  onAddTeacher,
  onAddBatchTeachers,
  onUpdateTeacher,
  onDeleteTeacher,
  onDeleteBatchTeachers,
  onAssignEmailFromPool,
  onAssignBatchEmailsFromPool,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<TeacherFilterStatus>('all');
  const [sortField, setSortField] = useState<TeacherSortField>('name');
  const [sortOrder, setSortOrder] = useState<TeacherSortOrder>('asc');
  
  // Multi-select for batch actions
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Modals
  const [isSingleModalOpen, setIsSingleModalOpen] = useState(false);
  const [isTextImportModalOpen, setIsTextImportModalOpen] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState<TeacherCertificate | null>(null);
  const [paymentEditTeacher, setPaymentEditTeacher] = useState<TeacherCertificate | null>(null);
  const [fastPasteModalTeacher, setFastPasteModalTeacher] = useState<TeacherCertificate | null>(null);
  const [batchDeleteConfirmOpen, setBatchDeleteConfirmOpen] = useState(false);

  // Quick toast
  const [quickToast, setQuickToast] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null);
  const showToast = (msg: string, type: 'success' | 'error' | 'info' = 'success') => {
    setQuickToast({ msg, type });
    setTimeout(() => setQuickToast(null), 2500);
  };

  // Stats calculation
  const totalTeachers = teachers.length;
  const certifiedTeachers = teachers.filter((t) => t.status === 'certified');
  const certifiedCount = certifiedTeachers.length;
  const pendingCount = teachers.filter((t) => t.status === 'pending').length;
  const errorCount = teachers.filter((t) => t.status === 'error' || t.hasError).length;
  const noEmailCount = teachers.filter((t) => !t.assignedEmail).length;

  const totalRevenue = teachers.reduce((sum, t) => sum + (t.price || 5000), 0);
  const totalPaid = teachers.reduce((sum, t) => sum + (t.paidAmount || 0), 0);
  const totalDebt = Math.max(0, totalRevenue - totalPaid);
  const indebtedTeachers = teachers.filter((t) => (t.price || 5000) > (t.paidAmount || 0));

  // Available emails in pool
  const availableEmailCount = emailPool.filter((e) => !e.isUsed).length;

  // Toggle sort helper
  const handleSortToggle = (field: TeacherSortField) => {
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  // Filtered & Sorted teachers list
  const filteredAndSortedTeachers = useMemo(() => {
    const list = teachers.filter((t) => {
      // Status filter
      if (statusFilter === 'certified' && t.status !== 'certified') return false;
      if (statusFilter === 'pending' && t.status !== 'pending') return false;
      if (statusFilter === 'error' && t.status !== 'error' && !t.hasError) return false;
      if (statusFilter === 'debt' && (t.price || 5000) <= (t.paidAmount || 0)) return false;
      if (statusFilter === 'no-email' && t.assignedEmail) return false;

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

    // Sorting
    list.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'name':
          cmp = a.fullName.localeCompare(b.fullName, 'uz');
          break;
        case 'subject':
          cmp = (a.subject || '').localeCompare(b.subject || '', 'uz');
          break;
        case 'status': {
          const rank = { certified: 1, pending: 2, error: 3 };
          cmp = (rank[a.status] || 2) - (rank[b.status] || 2);
          break;
        }
        case 'debt': {
          const debtA = (a.price || 5000) - (a.paidAmount || 0);
          const debtB = (b.price || 5000) - (b.paidAmount || 0);
          cmp = debtB - debtA;
          break;
        }
        case 'date': {
          const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          cmp = timeB - timeA;
          break;
        }
      }
      return sortOrder === 'asc' ? cmp : -cmp;
    });

    return list;
  }, [teachers, statusFilter, searchQuery, sortField, sortOrder]);

  // Master selection handler
  const handleToggleSelectAll = () => {
    if (selectedIds.size === filteredAndSortedTeachers.length && filteredAndSortedTeachers.length > 0) {
      setSelectedIds(new Set());
    } else {
      const next = new Set<string>();
      filteredAndSortedTeachers.forEach(t => next.add(t.id));
      setSelectedIds(next);
    }
  };

  const handleToggleSelectRow = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Copy helper
  const handleCopy = (text: string, label: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    showToast(`📋 ${label} nusxalandi!`);
  };

  // Fast paste certificate for teacher
  const handleFastPasteCertForTeacher = async (teacher: TeacherCertificate) => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        const trimmed = text.trim();
        if (trimmed && (trimmed.startsWith('http://') || trimmed.startsWith('https://'))) {
          const updated: TeacherCertificate = {
            ...teacher,
            certificateLink: trimmed,
            status: 'certified',
            hasError: false,
            certifiedAt: new Date().toISOString()
          };
          onUpdateTeacher(updated);
          showToast(`✅ "${teacher.fullName}" uchun Coursera sertifikat havolasi biriktirildi!`, 'success');
          return;
        }
      }
    } catch {
      // Clipboard access blocked or denied - fallback to modal
    }

    // Open fast paste prompt modal
    setFastPasteModalTeacher(teacher);
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

  // Batch actions
  const handleBatchAssignEmails = () => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    const needEmail = ids.filter(id => {
      const t = teachers.find(x => x.id === id);
      return t && !t.assignedEmail;
    });

    if (needEmail.length === 0) {
      showToast("Tanlangan barcha ustozlarda allaqachon email mavjud!", 'info');
      return;
    }

    if (availableEmailCount === 0) {
      showToast("Zaxirada bo'sh email yo'q! Avval pochta zaxirasini to'ldiring.", 'error');
      return;
    }

    if (onAssignBatchEmailsFromPool) {
      onAssignBatchEmailsFromPool(needEmail);
      setSelectedIds(new Set());
    } else if (onAssignEmailFromPool) {
      needEmail.forEach(id => onAssignEmailFromPool(id));
      showToast(`✅ ${needEmail.length} nafar ustozga email biriktirildi!`);
      setSelectedIds(new Set());
    }
  };

  const handleBatchMarkPaid = () => {
    if (selectedIds.size === 0) return;
    let count = 0;
    selectedIds.forEach(id => {
      const t = teachers.find(x => x.id === id);
      if (t && (t.price || 5000) > (t.paidAmount || 0)) {
        onUpdateTeacher({
          ...t,
          paidAmount: t.price || 5000,
          paymentStatus: 'paid'
        });
        count++;
      }
    });
    showToast(`✅ ${count} nafar ustoz uchun to'lov to'liq belgilandi!`);
    setSelectedIds(new Set());
  };

  const handleBatchMarkCertified = () => {
    if (selectedIds.size === 0) return;
    let count = 0;
    selectedIds.forEach(id => {
      const t = teachers.find(x => x.id === id);
      if (t && t.status !== 'certified') {
        onUpdateTeacher({
          ...t,
          status: 'certified',
          hasError: false,
          certifiedAt: t.certifiedAt || new Date().toISOString()
        });
        count++;
      }
    });
    showToast(`✅ ${count} nafar ustoz holati "Sertifikat tayyor" deb yangilandi!`);
    setSelectedIds(new Set());
  };

  const handleExecuteBatchDelete = () => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    if (onDeleteBatchTeachers) {
      onDeleteBatchTeachers(ids);
    } else {
      ids.forEach(id => onDeleteTeacher(id));
    }
    showToast(`🗑️ ${ids.length} nafar ustoz ro'yxatdan o'chirildi!`, 'info');
    setSelectedIds(new Set());
    setBatchDeleteConfirmOpen(false);
  };

  // Export to Excel / CSV with UTF-8 BOM
  const handleExportCSV = () => {
    if (teachers.length === 0) {
      showToast("Eksport qilish uchun ustozlar mavjud emas!", 'error');
      return;
    }

    const headers = [
      '#',
      'Ustoz F.I.SH',
      'Fani / Mutaxassisligi',
      'Pasport / JShShIR',
      'Telefon raqami',
      'Coursera Login (Email)',
      'Coursera Parol',
      'Sertifikat Holati',
      'Sertifikat Havolasi',
      'Narxi (so\'m)',
      'To\'langan (so\'m)',
      'Qarzdorlik (so\'m)'
    ];

    const rows = teachers.map((t, idx) => {
      const debt = (t.price || 5000) - (t.paidAmount || 0);
      const statusStr = t.status === 'certified' ? 'Sertifikat tayyor' : t.status === 'error' ? 'Xatolik' : 'Kutilmoqda';
      return [
        idx + 1,
        `"${(t.fullName || '').replace(/"/g, '""')}"`,
        `"${(t.subject || '').replace(/"/g, '""')}"`,
        `"${(t.passportOrId || '').replace(/"/g, '""')}"`,
        `"${(t.phone || '').replace(/"/g, '""')}"`,
        `"${(t.assignedEmail || '').replace(/"/g, '""')}"`,
        `"${(t.assignedPassword || '').replace(/"/g, '""')}"`,
        `"${statusStr}"`,
        `"${(t.certificateLink || '').replace(/"/g, '""')}"`,
        t.price || 5000,
        t.paidAmount || 0,
        Math.max(0, debt)
      ].join(',');
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Maktab_Ustozlari_Sertifikatlar_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast("✅ Ustozlar ro'yxati Excel (CSV) fayliga yuklab olindi!");
  };

  // Generate Telegram share report text for teachers
  const handleCopyTeachersTelegramReport = () => {
    if (teachers.length === 0) {
      showToast("Ustozlar ro'yxati bo'sh!", 'error');
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
    <div className="space-y-4 font-sans">
      {/* Toast */}
      {quickToast && (
        <div className={`fixed bottom-6 right-6 z-50 text-white px-4 py-2.5 rounded-xl shadow-2xl text-xs font-semibold animate-fade-in flex items-center gap-2 border ${
          quickToast.type === 'error' 
            ? 'bg-rose-900 border-rose-700' 
            : quickToast.type === 'info' 
              ? 'bg-blue-900 border-blue-700' 
              : 'bg-slate-900 border-slate-700'
        }`}>
          <span>{quickToast.msg}</span>
        </div>
      )}

      {/* Header & Quick Action Buttons */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3.5">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-purple-50 text-purple-700 border border-purple-200/80 flex items-center justify-center flex-shrink-0 shadow-2xs">
              <GraduationCap className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-extrabold text-slate-900 tracking-tight">
                  Ustozlar Sertifikatlari Boshqaruvi
                </h2>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200">
                  Pedagoglar
                </span>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                  {totalTeachers} nafar
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Coursera sertifikatlari, pochtalar, tezkor havolalar va to'lov monitoringi.
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setIsTextImportModalOpen(true)}
              className="px-3.5 py-2 rounded-xl bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-95"
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
              className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-95"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Yakka ustoz qo'shish</span>
            </button>

            <button
              onClick={handleExportCSV}
              className="px-3 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold border border-slate-300/80 flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Excel (CSV) formatida yuklab olish"
            >
              <Download className="w-3.5 h-3.5 text-emerald-600" />
              <span>Excel yuklab olish</span>
            </button>

            <button
              onClick={handleCopyTeachersTelegramReport}
              className="px-3 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold border border-slate-300/80 flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Telegram uchun hisobot matnini nusxalash"
            >
              <Send className="w-3.5 h-3.5 text-blue-600" />
              <span>Telegram hisobot</span>
            </button>
          </div>
        </div>
      </div>

      {/* 5 Interactive Summary Stat Cards (Clicking any filters the table) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* Total teachers */}
        <div 
          onClick={() => setStatusFilter('all')}
          className={`rounded-2xl p-3.5 shadow-xs transition-all cursor-pointer border ${
            statusFilter === 'all' 
              ? 'bg-purple-50/70 border-purple-300 ring-2 ring-purple-400/40' 
              : 'bg-white border-slate-200/90 hover:border-purple-200'
          }`}
        >
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-medium">Jami Ustozlar</span>
            <div className="w-6 h-6 rounded-lg bg-purple-50 text-purple-700 flex items-center justify-center">
              <GraduationCap className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-black text-slate-900">
            {totalTeachers} <span className="text-xs text-slate-500 font-normal">nafar</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Filtrni bekor qilish
          </div>
        </div>

        {/* Certified count */}
        <div 
          onClick={() => setStatusFilter('certified')}
          className={`rounded-2xl p-3.5 shadow-xs transition-all cursor-pointer border ${
            statusFilter === 'certified' 
              ? 'bg-emerald-50 border-emerald-300 ring-2 ring-emerald-400/40' 
              : 'bg-white border-slate-200/90 hover:border-emerald-200'
          }`}
        >
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-medium">Sertifikat Olganlar</span>
            <div className="w-6 h-6 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <Award className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-black text-emerald-700">
            {certifiedCount} <span className="text-xs text-emerald-600 font-normal">nafar</span>
          </div>
          <div className="text-[11px] text-emerald-600 font-medium mt-0.5">
            {totalTeachers > 0 ? Math.round((certifiedCount / totalTeachers) * 100) : 0}% tayyor
          </div>
        </div>

        {/* Pending count */}
        <div 
          onClick={() => setStatusFilter('pending')}
          className={`rounded-2xl p-3.5 shadow-xs transition-all cursor-pointer border ${
            statusFilter === 'pending' 
              ? 'bg-amber-50 border-amber-300 ring-2 ring-amber-400/40' 
              : 'bg-white border-slate-200/90 hover:border-amber-200'
          }`}
        >
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-medium">Kutilayotganlar</span>
            <div className="w-6 h-6 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center">
              <Clock className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-black text-amber-700">
            {pendingCount} <span className="text-xs text-amber-600 font-normal">nafar</span>
          </div>
          <div className="text-[11px] text-amber-600 font-medium mt-0.5">
            Jarayonda
          </div>
        </div>

        {/* Debt summary */}
        <div 
          onClick={() => setStatusFilter('debt')}
          className={`rounded-2xl p-3.5 shadow-xs transition-all cursor-pointer border ${
            statusFilter === 'debt' 
              ? 'bg-rose-50 border-rose-300 ring-2 ring-rose-400/40' 
              : totalDebt > 0 
                ? 'bg-rose-50/40 border-rose-200/80 hover:border-rose-300' 
                : 'bg-white border-slate-200/90'
          }`}
        >
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
          <div className={`text-xl sm:text-2xl font-black ${totalDebt > 0 ? 'text-rose-700' : 'text-slate-800'}`}>
            {totalDebt.toLocaleString()} <span className="text-xs font-normal">so'm</span>
          </div>
          <div className={`text-[11px] font-semibold mt-0.5 ${totalDebt > 0 ? 'text-rose-600' : 'text-slate-500'}`}>
            {indebtedTeachers.length > 0 ? `${indebtedTeachers.length} nafar qarzdor` : "100% to'langan"}
          </div>
        </div>

        {/* Missing email filter */}
        <div 
          onClick={() => setStatusFilter('no-email')}
          className={`rounded-2xl p-3.5 shadow-xs transition-all cursor-pointer border ${
            statusFilter === 'no-email' 
              ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-400/40' 
              : noEmailCount > 0 
                ? 'bg-blue-50/30 border-blue-200/80 hover:border-blue-300' 
                : 'bg-white border-slate-200/90'
          }`}
        >
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-medium">Email Yo'qlar</span>
            <div className="w-6 h-6 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center">
              <Mail className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className={`text-xl sm:text-2xl font-black ${noEmailCount > 0 ? 'text-blue-700' : 'text-slate-700'}`}>
            {noEmailCount} <span className="text-xs text-slate-500 font-normal">nafar</span>
          </div>
          <div className="text-[11px] text-blue-600 font-medium mt-0.5">
            Zaxirada bo'sh: {availableEmailCount} ta
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-3.5 sm:p-4 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5">
          {/* Search box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Ustoz ismi, fani, pasport yoki email bo'yicha qidirish..."
              className="w-full pl-9 pr-8 py-2 bg-slate-50 hover:bg-slate-100/70 focus:bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-purple-600 transition-colors"
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

          {/* Status Filter Buttons */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                statusFilter === 'all'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Barchasi ({teachers.length})
            </button>
            <button
              onClick={() => setStatusFilter('certified')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                statusFilter === 'certified'
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
              }`}
            >
              Sertifikat olganlar ({certifiedCount})
            </button>
            <button
              onClick={() => setStatusFilter('pending')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                statusFilter === 'pending'
                  ? 'bg-amber-600 text-white shadow-2xs'
                  : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
              }`}
            >
              Kutilmoqda ({pendingCount})
            </button>
            <button
              onClick={() => setStatusFilter('debt')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                statusFilter === 'debt'
                  ? 'bg-rose-600 text-white shadow-2xs'
                  : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
              }`}
            >
              Qarzdorlar ({indebtedTeachers.length})
            </button>
            <button
              onClick={() => setStatusFilter('no-email')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                statusFilter === 'no-email'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
              }`}
            >
              Email yo'qlar ({noEmailCount})
            </button>
          </div>
        </div>

        {/* Quick Sorting Toolbar ("Sartirofka") */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
              <ArrowUpDown className="w-3 h-3 text-purple-600" />
              Sartirofka:
            </span>

            <button
              onClick={() => handleSortToggle('name')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer ${
                sortField === 'name' ? 'bg-purple-100 text-purple-900 border border-purple-300' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <span>Ism (A-Z)</span>
              {sortField === 'name' && (sortOrder === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
            </button>

            <button
              onClick={() => handleSortToggle('subject')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer ${
                sortField === 'subject' ? 'bg-purple-100 text-purple-900 border border-purple-300' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <span>Fani bo'yicha</span>
              {sortField === 'subject' && (sortOrder === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
            </button>

            <button
              onClick={() => handleSortToggle('status')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer ${
                sortField === 'status' ? 'bg-purple-100 text-purple-900 border border-purple-300' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <span>Holat (Tayyor birinchi)</span>
              {sortField === 'status' && (sortOrder === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
            </button>

            <button
              onClick={() => handleSortToggle('debt')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer ${
                sortField === 'debt' ? 'bg-purple-100 text-purple-900 border border-purple-300' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <span>Qarzdorlik bo'yicha</span>
              {sortField === 'debt' && (sortOrder === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
            </button>

            <button
              onClick={() => handleSortToggle('date')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer ${
                sortField === 'date' ? 'bg-purple-100 text-purple-900 border border-purple-300' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <span>Eng yangilar</span>
              {sortField === 'date' && (sortOrder === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
            </button>
          </div>

          <div className="text-[11px] text-slate-500">
            Ko'rsatilmoqda: <span className="font-bold text-slate-800">{filteredAndSortedTeachers.length}</span> / {totalTeachers} nafar ustoz
          </div>
        </div>

        {/* Multi-select Floating Action Bar */}
        {selectedIds.size > 0 && (
          <div className="p-2.5 rounded-xl bg-purple-900 text-white flex flex-wrap items-center justify-between gap-2 shadow-lg animate-fade-in text-xs">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-bold">
                {selectedIds.size} nafar ustoz tanlandi
              </span>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                onClick={handleBatchAssignEmails}
                className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold flex items-center gap-1 transition-colors cursor-pointer shadow-xs"
                title="Tanlanganlarga zaxiradan email biriktirish"
              >
                <Mail className="w-3 h-3" />
                <span>Email biriktirish ({availableEmailCount} ta bo'sh)</span>
              </button>

              <button
                onClick={handleBatchMarkPaid}
                className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center gap-1 transition-colors cursor-pointer shadow-xs"
              >
                <Check className="w-3 h-3" />
                <span>To'liq to'landi qilish</span>
              </button>

              <button
                onClick={handleBatchMarkCertified}
                className="px-2.5 py-1 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold flex items-center gap-1 transition-colors cursor-pointer shadow-xs"
              >
                <Award className="w-3 h-3" />
                <span>Sertifikat tayyor</span>
              </button>

              <button
                onClick={() => setBatchDeleteConfirmOpen(true)}
                className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold flex items-center gap-1 transition-colors cursor-pointer shadow-xs"
              >
                <Trash2 className="w-3 h-3" />
                <span>O'chirish</span>
              </button>

              <button
                onClick={() => setSelectedIds(new Set())}
                className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white text-[11px] transition-colors cursor-pointer"
              >
                Bekor qilish
              </button>
            </div>
          </div>
        )}

        {/* Table of teachers */}
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/90 text-slate-600 font-bold border-b border-slate-200 select-none">
              <tr>
                <th className="py-2.5 px-3 w-8 text-center">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === filteredAndSortedTeachers.length && filteredAndSortedTeachers.length > 0}
                    onChange={handleToggleSelectAll}
                    className="rounded text-purple-600 focus:ring-purple-500 cursor-pointer"
                    title="Barchasini tanlash"
                  />
                </th>
                <th className="py-2.5 px-2 w-8 text-slate-400">#</th>
                <th 
                  onClick={() => handleSortToggle('name')}
                  className="py-2.5 px-3 cursor-pointer hover:text-purple-700"
                >
                  <div className="flex items-center gap-1">
                    <span>Ustoz F.I.SH & Mutaxassisligi</span>
                    {sortField === 'name' && (sortOrder === 'asc' ? <ArrowUp className="w-3 h-3 text-purple-600" /> : <ArrowDown className="w-3 h-3 text-purple-600" />)}
                  </div>
                </th>
                <th className="py-2.5 px-3">Pasport / JShShIR</th>
                <th className="py-2.5 px-3">Coursera Login & Parol</th>
                <th 
                  onClick={() => handleSortToggle('status')}
                  className="py-2.5 px-3 cursor-pointer hover:text-purple-700"
                >
                  <div className="flex items-center gap-1">
                    <span>Sertifikat Havolasi</span>
                    {sortField === 'status' && (sortOrder === 'asc' ? <ArrowUp className="w-3 h-3 text-purple-600" /> : <ArrowDown className="w-3 h-3 text-purple-600" />)}
                  </div>
                </th>
                <th 
                  onClick={() => handleSortToggle('debt')}
                  className="py-2.5 px-3 cursor-pointer hover:text-purple-700"
                >
                  <div className="flex items-center gap-1">
                    <span>To'lov & Qarz</span>
                    {sortField === 'debt' && (sortOrder === 'asc' ? <ArrowUp className="w-3 h-3 text-purple-600" /> : <ArrowDown className="w-3 h-3 text-purple-600" />)}
                  </div>
                </th>
                <th className="py-2.5 px-3 text-right">Amallar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {filteredAndSortedTeachers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <GraduationCap className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                    <p className="font-bold text-slate-700 text-sm">Ustozlar topilmadi</p>
                    <p className="text-xs text-slate-400 mt-1">
                      {searchQuery ? "Qidiruv bo'yicha hech narsa chiqmadi." : "Yuqoridagi \"Matn orqali kiritish\" tugmasini bosib ustozlar ro'yxatini kiriting."}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredAndSortedTeachers.map((teacher, index) => {
                  const debt = (teacher.price || 5000) - (teacher.paidAmount || 0);
                  const isPaid = debt <= 0;
                  const passportDigits = extractPassportDigits(teacher.passportOrId || '');
                  const isSelected = selectedIds.has(teacher.id);

                  return (
                    <tr 
                      key={teacher.id} 
                      className={`transition-colors ${isSelected ? 'bg-purple-50/50 hover:bg-purple-50' : 'hover:bg-slate-50/70'}`}
                    >
                      {/* Checkbox */}
                      <td className="py-3 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelectRow(teacher.id)}
                          className="rounded text-purple-600 focus:ring-purple-500 cursor-pointer"
                        />
                      </td>

                      {/* Number */}
                      <td className="py-3 px-2 text-slate-400 font-mono text-[11px]">
                        {index + 1}
                      </td>

                      {/* Full Name & Subject */}
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                            teacher.status === 'certified' ? 'bg-emerald-500 ring-2 ring-emerald-200' : teacher.status === 'error' ? 'bg-rose-500 ring-2 ring-rose-200' : 'bg-purple-500 ring-2 ring-purple-200'
                          }`} />
                          <div>
                            <div className="font-bold text-slate-900 flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs sm:text-sm">{teacher.fullName}</span>
                              <span className="text-[9px] font-extrabold px-1.5 py-0.2 rounded bg-purple-100 text-purple-800 border border-purple-200 uppercase tracking-wider">
                                Ustoz
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5 flex-wrap">
                              {teacher.subject && (
                                <span className="font-semibold text-purple-700 bg-purple-50 px-1.5 py-0.2 rounded border border-purple-100">
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
                          <div className="space-y-0.5">
                            <div 
                              onClick={() => handleCopy(teacher.passportOrId || '', 'Pasport seriya')}
                              className="font-mono font-bold text-slate-800 hover:text-blue-700 cursor-pointer flex items-center gap-1 group"
                              title="Nusxalash uchun bosing"
                            >
                              <span>{teacher.passportOrId}</span>
                              <Copy className="w-3 h-3 text-slate-400 group-hover:text-blue-600 opacity-60 group-hover:opacity-100 transition-opacity" />
                            </div>
                            {passportDigits && (
                              <button
                                onClick={() => handleCopy(passportDigits, 'Raqam')}
                                className="text-[10px] text-slate-500 hover:text-blue-600 font-mono underline block"
                                title="Faqat raqamlarni nusxalash"
                              >
                                Raqam: {passportDigits}
                              </button>
                            )}
                            {teacher.birthDate && (
                              <div className="text-[10px] text-slate-500 font-mono flex items-center gap-1 mt-0.5">
                                <span>Tug'ilgan: {teacher.birthDate}</span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div>
                            <span className="text-amber-600 text-[11px] font-medium bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                              Kiritilmagan
                            </span>
                            {teacher.birthDate && (
                              <div className="text-[10px] text-slate-500 font-mono flex items-center gap-1 mt-0.5">
                                <span>Tug'ilgan: {teacher.birthDate}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Email & Password */}
                      <td className="py-3 px-3">
                        {teacher.assignedEmail ? (
                          <div className="space-y-0.5">
                            <div 
                              onClick={() => handleCopy(teacher.assignedEmail || '', 'Email')}
                              className="font-mono text-[11px] text-blue-700 hover:underline cursor-pointer flex items-center gap-1 group font-semibold"
                              title="Emailni nusxalash"
                            >
                              <Mail className="w-3 h-3 text-blue-500 flex-shrink-0" />
                              <span className="truncate max-w-[150px]">{teacher.assignedEmail}</span>
                              <Copy className="w-2.5 h-2.5 text-slate-400 group-hover:text-blue-600" />
                            </div>
                            {teacher.assignedPassword && (
                              <div 
                                onClick={() => handleCopy(teacher.assignedPassword || '', 'Parol')}
                                className="font-mono text-[10px] text-slate-600 hover:text-slate-900 cursor-pointer flex items-center gap-1 group"
                                title="Parolni nusxalash"
                              >
                                <span>Parol: {teacher.assignedPassword}</span>
                                <Copy className="w-2.5 h-2.5 text-slate-400 group-hover:text-slate-700" />
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <span className="text-slate-400 text-[11px]">Email yo'q</span>
                            {onAssignEmailFromPool && (
                              <button
                                onClick={() => onAssignEmailFromPool(teacher.id)}
                                className="px-2 py-0.8 text-[11px] font-bold bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-md border border-blue-200 cursor-pointer transition-colors active:scale-95 flex items-center gap-1 shadow-2xs"
                                title="Zaxiradan avtomatik email biriktirish va saqlash"
                              >
                                <Plus className="w-3 h-3" />
                                <span>Biriktirish</span>
                              </button>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Certificate status & Fast Paste Button (Matching student experience!) */}
                      <td className="py-3 px-3">
                        <div className="space-y-1">
                          {teacher.status === 'certified' && teacher.certificateLink ? (
                            <div>
                              <div className="flex items-center gap-1.5">
                                <a
                                  href={teacher.certificateLink}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 transition-colors"
                                  title="Coursera sertifikatini ochish"
                                >
                                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                  <span>Sertifikat</span>
                                  <ExternalLink className="w-3 h-3 text-emerald-700" />
                                </a>
                                <button
                                  type="button"
                                  onClick={() => handleFastPasteCertForTeacher(teacher)}
                                  className="p-1 text-slate-400 hover:text-purple-700 hover:bg-purple-50 rounded transition-colors cursor-pointer"
                                  title="Sertifikat havolasini yangilash / qayta qo'yish"
                                >
                                  <RotateCcw className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              {/* Fast paste button */}
                              <button
                                type="button"
                                onClick={() => handleFastPasteCertForTeacher(teacher)}
                                className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs flex items-center gap-1 transition-all cursor-pointer active:scale-95"
                                title="Buferdagi Coursera sertifikat havolasini ushbu ustozga darhol biriktirish"
                              >
                                <Clipboard className="w-3.5 h-3.5" />
                                <span>Qo'yish</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => setFastPasteModalTeacher(teacher)}
                                className="text-[10px] text-slate-500 hover:text-purple-700 hover:underline cursor-pointer"
                                title="Havolani qo'lda yozib kiritish"
                              >
                                Havola
                              </button>
                            </div>
                          )}

                          {/* Quick status switch tags */}
                          <div className="flex items-center gap-1.5 pt-0.5 text-[10px]">
                            {teacher.status !== 'certified' && (
                              <button
                                onClick={() => handleQuickStatusChange(teacher, 'certified')}
                                className="text-emerald-700 hover:underline font-bold"
                              >
                                [✓ Tayyor]
                              </button>
                            )}
                            {teacher.status !== 'pending' && (
                              <button
                                onClick={() => handleQuickStatusChange(teacher, 'pending')}
                                className="text-amber-700 hover:underline font-bold"
                              >
                                [⏳ Kutilmoqda]
                              </button>
                            )}
                            {teacher.status !== 'error' && (
                              <button
                                onClick={() => handleQuickStatusChange(teacher, 'error')}
                                className="text-rose-700 hover:underline font-bold"
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
                                Narx: {teacher.price?.toLocaleString()} | To'langan: {teacher.paidAmount?.toLocaleString() || 0}
                              </div>
                            </div>
                          )}

                          <div className="pt-0.5 flex items-center gap-2">
                            <button
                              onClick={() => setPaymentEditTeacher(teacher)}
                              className="text-[10px] text-blue-600 hover:underline font-semibold cursor-pointer"
                            >
                              Tahrirlash
                            </button>
                            {!isPaid && (
                              <button
                                onClick={() => handleQuickMarkPaid(teacher)}
                                className="text-[10px] text-emerald-700 hover:underline font-bold cursor-pointer"
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
                            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                            title="Tahrirlash"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              onDeleteTeacher(teacher.id);
                              showToast(`"${teacher.fullName}" ro'yxatdan o'chirildi`, 'info');
                            }}
                            className="p-1.5 rounded-lg text-rose-500 hover:text-rose-700 hover:bg-rose-50 transition-colors cursor-pointer"
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

      {/* MODAL 1: FAST PASTE CERTIFICATE LINK MODAL */}
      {fastPasteModalTeacher && (
        <FastPasteCertModal
          teacher={fastPasteModalTeacher}
          onClose={() => setFastPasteModalTeacher(null)}
          onSave={(link) => {
            const updated: TeacherCertificate = {
              ...fastPasteModalTeacher,
              certificateLink: link,
              status: 'certified',
              hasError: false,
              certifiedAt: new Date().toISOString()
            };
            onUpdateTeacher(updated);
            setFastPasteModalTeacher(null);
            showToast(`✅ "${fastPasteModalTeacher.fullName}" uchun Coursera sertifikat havolasi saqlandi!`, 'success');
          }}
        />
      )}

      {/* MODAL 2: TEXT-BASED BULK IMPORT (NO FILES, TEXT ONLY) */}
      {isTextImportModalOpen && (
        <TextImportTeachersModal
          onClose={() => setIsTextImportModalOpen(false)}
          onImport={(imported) => {
            onAddBatchTeachers(imported);
            setIsTextImportModalOpen(false);
            showToast(`✅ ${imported.length} nafar ustoz muvaffaqiyatli kiritildi va saqlandi!`, 'success');
          }}
        />
      )}

      {/* MODAL 3: SINGLE TEACHER ADD / EDIT */}
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
              showToast("Ustoz ma'lumotlari yangilandi va saqlandi", 'success');
            } else {
              onAddTeacher(saved);
              showToast("Yangi ustoz qo'shildi va saqlandi", 'success');
            }
            setIsSingleModalOpen(false);
            setEditingTeacher(null);
          }}
        />
      )}

      {/* MODAL 4: PAYMENT EDIT */}
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
            showToast("To'lov ma'lumotlari yangilandi va saqlandi", 'success');
          }}
        />
      )}

      {/* MODAL 5: BATCH DELETE CONFIRMATION */}
      {batchDeleteConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-sm w-full border border-slate-200 shadow-2xl p-5 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Ustozlarni o'chirish</h3>
                <p className="text-xs text-slate-500">Bu amalni ortga qaytarib bo'lmaydi</p>
              </div>
            </div>
            <p className="text-xs text-slate-700">
              Rostdan ham tanlangan <b>{selectedIds.size}</b> nafar ustozni o'chirib yubormoqchimisiz?
            </p>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setBatchDeleteConfirmOpen(false)}
                className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                Bekor qilish
              </button>
              <button
                type="button"
                onClick={handleExecuteBatchDelete}
                className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white cursor-pointer transition-colors shadow-xs"
              >
                Ha, o'chirilsin
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Fast Paste Certificate Modal
interface FastPasteCertModalProps {
  teacher: TeacherCertificate;
  onClose: () => void;
  onSave: (link: string) => void;
}

const FastPasteCertModal: React.FC<FastPasteCertModalProps> = ({ teacher, onClose, onSave }) => {
  const [link, setLink] = useState(teacher.certificateLink || '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    // Try to auto-paste from clipboard
    if (navigator.clipboard && navigator.clipboard.readText) {
      navigator.clipboard.readText().then(text => {
        const trimmed = text.trim();
        if (trimmed && (trimmed.startsWith('http://') || trimmed.startsWith('https://'))) {
          setLink(trimmed);
        }
      }).catch(() => {});
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!link.trim()) return;
    onSave(link.trim());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl p-5 space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <Award className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Sertifikat havolasini kiritish</h3>
              <p className="text-[11px] text-slate-500">{teacher.fullName}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div>
            <label className="block text-slate-700 font-bold mb-1">
              Coursera sertifikat havolasi:
            </label>
            <input
              ref={inputRef}
              type="url"
              required
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://www.coursera.org/verify/..."
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:border-emerald-600 font-mono text-xs"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold cursor-pointer"
            >
              Bekor qilish
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold cursor-pointer transition-colors shadow-xs"
            >
              Saqlash
            </button>
          </div>
        </form>
      </div>
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

  // Parse text lines with robust cleaning
  const parsedPreview = useMemo(() => {
    if (!rawText.trim()) return [];

    const lines = rawText.split('\n').map((l) => l.trim()).filter(Boolean);
    const result: TeacherCertificate[] = [];

    lines.forEach((line, idx) => {
      // Split by |, tab, or comma
      let parts = line.split(/[|\t]/).map((p) => p.trim()).filter(Boolean);
      
      // If single part, try comma or hyphen
      if (parts.length === 1 && line.includes(' - ')) {
        parts = line.split(' - ').map((p) => p.trim()).filter(Boolean);
      } else if (parts.length === 1 && line.includes(',')) {
        parts = line.split(',').map((p) => p.trim()).filter(Boolean);
      }

      const fullName = (parts[0] || '').trim();
      if (!fullName) return;

      const subject = (parts[1] || defaultSubject || 'Fan o\'qituvchisi').trim();
      const passportOrId = (parts[2] || '').trim();
      const phone = (parts[3] || '').trim();

      result.push({
        id: `teacher-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 7)}`,
        fullName,
        subject,
        passportOrId: passportOrId || undefined,
        phone: phone || undefined,
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
                Telegram, Word yoki jadvaldan ustozlar ro'yxatini to'g'ridan-to'g'ri nusxalab qo'ying.
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
              className="rounded text-purple-600 focus:ring-purple-500 cursor-pointer"
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
            💡 <strong>Format:</strong> Har bir qatorda ustoz ismini yozing. Fan yoki pasportni <code>|</code>, <code>tab</code> yoki <code>-</code> bilan ajratishingiz mumkin.
          </p>
        </div>

        {/* Preview */}
        {parsedPreview.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-bold text-slate-700">
              <span>Aniqlangan ustozlar ro'yxati:</span>
              <span className="text-purple-700 font-bold">{parsedPreview.length} nafar ustoz</span>
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
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:border-purple-600 text-xs font-semibold"
            />
          </div>

          <div>
            <label className="block text-slate-700 font-bold mb-1">Fani / Mutaxassisligi:</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Masalan: Informatika"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:border-purple-600 text-xs"
            />
            {/* Quick subject chips */}
            <div className="flex flex-wrap gap-1 mt-1.5">
              {COMMON_SUBJECTS.slice(0, 6).map((s) => (
                <button
                  type="button"
                  key={s}
                  onClick={() => setSubject(s)}
                  className="px-2 py-0.5 rounded-md bg-slate-100 hover:bg-purple-50 text-slate-600 hover:text-purple-700 text-[10px] transition-colors cursor-pointer"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="block text-slate-700 font-bold mb-1">Pasport / JShShIR:</label>
              <input
                type="text"
                value={passportOrId}
                onChange={(e) => setPassportOrId(e.target.value)}
                placeholder="AA 1234567 yoki 14 raqam"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:border-purple-600 font-mono text-xs"
              />
            </div>
            <div>
              <label className="block text-slate-700 font-bold mb-1">Tug'ilgan sana:</label>
              <input
                type="text"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                placeholder="DD.MM.YYYY (masalan: 15.04.1988)"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:border-purple-600 font-mono text-xs"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-700 font-bold mb-1">Telefon raqami:</label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+998 90 123 45 67"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:border-purple-600 font-mono text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-slate-700 font-bold mb-1">Coursera Email:</label>
              <input
                type="email"
                value={assignedEmail}
                onChange={(e) => setAssignedEmail(e.target.value)}
                placeholder="pochta@gmail.com"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:border-purple-600 font-mono text-xs"
              />
            </div>
            <div>
              <label className="block text-slate-700 font-bold mb-1">Coursera Parol:</label>
              <input
                type="text"
                value={assignedPassword}
                onChange={(e) => setAssignedPassword(e.target.value)}
                placeholder="Parol"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:border-purple-600 font-mono text-xs"
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
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold text-xs"
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
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold text-xs"
              />
            </div>
            <div>
              <label className="block text-slate-700 font-bold mb-1">To'langan (so'm):</label>
              <input
                type="number"
                value={paidAmount}
                onChange={(e) => setPaidAmount(Number(e.target.value))}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold text-xs"
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
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold cursor-pointer">
            Bekor qilish
          </button>
          <button
            onClick={() => onSave(price, paidAmount)}
            className="px-4 py-2 rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-bold transition-colors shadow-xs cursor-pointer"
          >
            Saqlash
          </button>
        </div>
      </div>
    </div>
  );
};
