import React, { useState, useEffect, useRef } from 'react';
import { ClassGroup, Student, EmailAccount, TeacherSession, TeacherMessage, TelegramUser } from '../types';
import { SessionsManagementTab } from './SessionsManagementTab';
import { TelegramBotTab } from './TelegramBotTab';
import { checkStudentConflicts, extractPassportDigits } from '../utils/studentValidator';
import { 
  Users, 
  Award, 
  AlertTriangle, 
  Plus, 
  Mail, 
  Upload, 
  DollarSign, 
  Search, 
  Edit2, 
  Trash2, 
  CheckCircle, 
  Clock, 
  Key, 
  ShieldAlert, 
  Database, 
  ArrowRight, 
  Filter, 
  Layers, 
  Sparkles, 
  ExternalLink, 
  Clipboard, 
  LogOut, 
  CreditCard, 
  School, 
  CheckCircle2, 
  FileCheck, 
  Phone, 
  Smartphone, 
  MessageSquare, 
  Send, 
  UserPlus, 
  Bell,
  Copy,
  AlertOctagon,
  Check
} from 'lucide-react';

interface AdminPanelProps {
  classes: ClassGroup[];
  students: Student[];
  emailPool: EmailAccount[];
  sessions: TeacherSession[];
  messages: TeacherMessage[];
  telegramUsers?: TelegramUser[];
  currentDeviceId?: string;
  onRefreshTelegramUsers?: () => void;
  onOpenStudentModal: (student: Student, focusField?: 'passport' | 'name' | 'email') => void;
  onOpenPaymentModal: (classGroup: ClassGroup) => void;
  onOpenBulkEmailModal: () => void;
  onApplyEmailDistribution: (distributedStudents: Student[], updatedPool: EmailAccount[]) => void;
  onOpenBulkUploadModal: (classId?: string) => void;
  onOpenTeacherMessageModal: (classGroup: ClassGroup) => void;
  onToggleBlockDevice: (deviceId: string, block: boolean, reason?: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onAddSingleStudent: (student: Student, updatedPool?: EmailAccount[]) => void;
  onDeleteStudent: (studentId: string) => void;
  onSaveClass: (classGroup: ClassGroup) => void;
  onDeleteClass: (classId: string) => void;
  onLogoutAdmin: () => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({
  classes,
  students,
  emailPool,
  sessions,
  messages,
  telegramUsers = [],
  currentDeviceId,
  onRefreshTelegramUsers,
  onOpenStudentModal,
  onOpenPaymentModal,
  onOpenBulkEmailModal,
  onApplyEmailDistribution,
  onOpenBulkUploadModal,
  onOpenTeacherMessageModal,
  onToggleBlockDevice,
  onDeleteSession,
  onAddSingleStudent,
  onDeleteStudent,
  onSaveClass,
  onDeleteClass,
  onLogoutAdmin,
}) => {
  const [activeTab, setActiveTab] = useState<'classes' | 'finance' | 'emails' | 'sessions' | 'telegram'>('classes');
  const [selectedClassId, setSelectedClassId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Non-blocking quick toast without OK button
  const [quickToast, setQuickToast] = useState('');
  const showQuickToast = (msg: string) => {
    setQuickToast(msg);
    setTimeout(() => setQuickToast(''), 1600);
  };

  // Timer for single click vs double click on passport
  const passportClickTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (passportClickTimeoutRef.current) {
        clearTimeout(passportClickTimeoutRef.current);
      }
    };
  }, []);

  const handlePassportSingleClick = (st: Student) => {
    if (passportClickTimeoutRef.current) {
      clearTimeout(passportClickTimeoutRef.current);
      passportClickTimeoutRef.current = null;
    }
    passportClickTimeoutRef.current = setTimeout(() => {
      const raw = st.passportOrId || '';
      const digits = extractPassportDigits(raw);
      if (digits) {
        navigator.clipboard.writeText(digits);
        showQuickToast(`📋 Pasport raqami nusxalandi: "${digits}"`);
      }
      passportClickTimeoutRef.current = null;
    }, 220);
  };

  const handlePassportDoubleClick = (st: Student) => {
    if (passportClickTimeoutRef.current) {
      clearTimeout(passportClickTimeoutRef.current);
      passportClickTimeoutRef.current = null;
    }
    onOpenStudentModal(st, 'passport');
  };

  // ESC key listener to close internal modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsAddingStudent(false);
        setEditingClass(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Single student addition modal state
  const [isAddingStudent, setIsAddingStudent] = useState(false);
  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentBirthDate, setNewStudentBirthDate] = useState('');
  const [newStudentPassport, setNewStudentPassport] = useState('');
  const [newStudentCertLink, setNewStudentCertLink] = useState('');
  const [newStudentClassId, setNewStudentClassId] = useState(classes[0]?.id || '');
  const [allowDuplicateName, setAllowDuplicateName] = useState(false);

  // Class editing modal state
  const [editingClass, setEditingClass] = useState<ClassGroup | null>(null);

  // Real-time conflict checks for single student being added
  const newStudentConflicts = checkStudentConflicts(
    {
      fullName: newStudentName,
      passportOrId: newStudentPassport,
      certificateLink: newStudentCertLink,
    },
    students,
    classes
  );

  // Copy helper for student table (no alert, smooth toast)
  const handleCopyField = (text: string, label: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    showQuickToast(`📋 Nusxalandi: "${text}"`);
  };

  // Overall statistics
  const totalStudents = students.length;
  const certifiedStudents = students.filter(s => s.status === 'certified');
  const certifiedCount = certifiedStudents.length;
  const totalPotentialRevenue = certifiedCount * 5000;
  const totalPaidRevenue = classes.reduce((sum, c) => sum + (c.paidAmount || 0), 0);
  const totalRemainingDebt = Math.max(0, totalPotentialRevenue - totalPaidRevenue);
  const unusedEmails = emailPool.filter(e => !e.isUsed).length;
  const errorCount = students.filter(s => s.hasError || s.status === 'error').length;
  const certifiedPercent = totalStudents > 0 ? Math.round((certifiedCount / totalStudents) * 100) : 0;
  const studentsWithoutEmail = students.filter(s => !s.assignedEmail || s.assignedEmail.trim() === '');

  // Filtered students
  const filteredStudents = students.filter(st => {
    if (selectedClassId !== 'all' && st.classId !== selectedClassId) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return st.fullName.toLowerCase().includes(q) ||
        (st.passportOrId && st.passportOrId.toLowerCase().includes(q)) ||
        (st.assignedEmail && st.assignedEmail.toLowerCase().includes(q));
    }
    return true;
  });

  // Assign unique emails to missing students in Email tab
  const handleAssignEmailsToMissingStudents = () => {
    const unassignedStudents = students.filter(s => !s.assignedEmail || s.assignedEmail.trim() === '');
    if (unassignedStudents.length === 0) {
      showQuickToast("Barcha o'quvchilarda email mavjud! Emaili yo'q o'quvchilar yo'q.");
      return;
    }

    // Build strict set of all assigned emails
    const assignedEmailsSet = new Set<string>();
    students.forEach(s => {
      if (s.assignedEmail && s.assignedEmail.trim()) {
        assignedEmailsSet.add(s.assignedEmail.trim().toLowerCase());
      }
    });
    emailPool.forEach(e => {
      if (e.isUsed) {
        assignedEmailsSet.add(e.email.trim().toLowerCase());
      }
    });

    const availableEmails = emailPool.filter(e => 
      !e.isUsed && !assignedEmailsSet.has(e.email.trim().toLowerCase())
    );

    if (availableEmails.length === 0) {
      showQuickToast("Zaxirada bo'sh email qolmagan! Avval yangi email qo'shing.");
      return;
    }

    let emailIdx = 0;
    const usedEmailMap = new Map<string, string>(); // normalized email -> studentId
    const updatedStudents = students.map(st => {
      if (!st.assignedEmail || st.assignedEmail.trim() === '') {
        if (emailIdx < availableEmails.length) {
          const free = availableEmails[emailIdx++];
          const norm = free.email.trim().toLowerCase();
          usedEmailMap.set(norm, st.id);
          return {
            ...st,
            assignedEmail: free.email,
            assignedPassword: free.password || 'MaktabPass2026!'
          };
        }
      }
      return st;
    });

    const updatedPool = emailPool.map(e => {
      const norm = e.email.trim().toLowerCase();
      if (usedEmailMap.has(norm)) {
        return {
          ...e,
          isUsed: true,
          assignedToStudentId: usedEmailMap.get(norm)
        };
      }
      return e;
    });

    onApplyEmailDistribution(updatedStudents, updatedPool);
    showQuickToast(`✅ ${usedEmailMap.size} ta o'quvchiga avtomatik noyob yangi email biriktirildi!`);
  };

  const handleCreateStudent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStudentName.trim() || !newStudentClassId) return;

    if (newStudentConflicts.hasPassportConflict) {
      showQuickToast("❌ Bu pasport seriyasi boshqa o'quvchiga biriktirilgan!");
      return;
    }

    if (newStudentConflicts.hasCertificateConflict) {
      showQuickToast("❌ Bu sertifikat havolasi boshqa o'quvchiga biriktirilgan!");
      return;
    }

    if (newStudentConflicts.hasNameConflict && !allowDuplicateName) {
      showQuickToast("⚠️ Bu ismdagi o'quvchi mavjud! Iltimos, tasdiqlang.");
      return;
    }

    // Allocate truly unused, unassigned email
    const assignedEmailsSet = new Set<string>();
    students.forEach(s => {
      if (s.assignedEmail && s.assignedEmail.trim()) {
        assignedEmailsSet.add(s.assignedEmail.trim().toLowerCase());
      }
    });
    emailPool.forEach(e => {
      if (e.isUsed) {
        assignedEmailsSet.add(e.email.trim().toLowerCase());
      }
    });

    const freeEmail = emailPool.find(e => 
      !e.isUsed && !assignedEmailsSet.has(e.email.trim().toLowerCase())
    );

    const newStudentId = `st-${Date.now()}`;
    const newStudent: Student = {
      id: newStudentId,
      fullName: newStudentName.trim(),
      birthDate: newStudentBirthDate.trim() || undefined,
      passportOrId: newStudentPassport.trim().toUpperCase() || undefined,
      certificateLink: newStudentCertLink.trim() || undefined,
      classId: newStudentClassId,
      assignedEmail: freeEmail ? freeEmail.email : undefined,
      assignedPassword: freeEmail ? (freeEmail.password || 'MaktabPass2026!') : undefined,
      status: newStudentCertLink.trim() ? 'certified' : 'pending',
      createdAt: new Date().toISOString(),
    };

    let updatedPool: EmailAccount[] | undefined;
    if (freeEmail) {
      updatedPool = emailPool.map(e => 
        e.email.trim().toLowerCase() === freeEmail.email.trim().toLowerCase() 
          ? { ...e, isUsed: true, assignedToStudentId: newStudentId } 
          : e
      );
    }

    onAddSingleStudent(newStudent, updatedPool);
    setIsAddingStudent(false);
    setNewStudentName('');
    setNewStudentBirthDate('');
    setNewStudentPassport('');
    setNewStudentCertLink('');
    setAllowDuplicateName(false);
    showQuickToast(
      freeEmail 
        ? `✅ O'quvchi qo'shildi! Noyob email: ${freeEmail.email}` 
        : `✅ O'quvchi qo'shildi (zaxirada bo'sh email yo'qligi sababli email kiritilmadi)`
    );
  };

  const handleSaveClassEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClass) return;
    onSaveClass(editingClass);
    setEditingClass(null);
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      
      {/* Floating Quick Toast Alert without OK button */}
      {quickToast && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-slate-900/95 backdrop-blur-md text-white rounded-2xl text-xs font-semibold shadow-2xl flex items-center gap-2 border border-slate-700 animate-scale-up">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{quickToast}</span>
        </div>
      )}

      {/* Executive Header Banner */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-6 shadow-xs relative overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded text-[11px] font-bold bg-blue-50 text-blue-800 border border-blue-200 tracking-wide uppercase">
                ADMINISTRATOR KABINETI
              </span>
              <span className="text-xs text-slate-500 font-medium">Boshqaruv va Monitoring</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              Maktab Sertifikat & O'quvchilar Bazasini Boshqarish
            </h1>
            <p className="text-xs text-slate-500 max-w-2xl leading-relaxed">
              O'quvchilar reestri, email zaxirasini taqsimlash, Coursera sertifikatlarini biriktirish va sinflar to'lov monitoringi.
            </p>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => onOpenBulkUploadModal()}
              className="px-3.5 py-2.5 bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold rounded-xl shadow-xs flex items-center gap-2 transition-colors cursor-pointer"
            >
              <Upload className="w-4 h-4 flex-shrink-0" />
              <span>Hujjat yuklash (Word, Excel)</span>
            </button>

            <button
              onClick={onOpenBulkEmailModal}
              className="px-3.5 py-2.5 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold rounded-xl border border-slate-300 shadow-xs flex items-center gap-2 transition-colors cursor-pointer"
            >
              <Mail className="w-4 h-4 text-blue-700 flex-shrink-0" />
              <span>Pochta zaxirasi (+500)</span>
            </button>

            <button
              onClick={() => {
                setAllowDuplicateName(false);
                setIsAddingStudent(true);
              }}
              className="px-3.5 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold rounded-xl border border-emerald-300 flex items-center gap-2 transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4 text-emerald-700 flex-shrink-0" />
              <span>Yakka o'quvchi qo'shish</span>
            </button>

            <button
              onClick={onLogoutAdmin}
              className="px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-xl border border-slate-200 transition-colors flex items-center gap-1.5 cursor-pointer"
              title="Admin seansidan chiqish"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Chiqish</span>
            </button>
          </div>
        </div>
      </div>

      {/* 4 Key Executive Performance Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Total students */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4.5 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1.5">
            <span className="text-xs font-medium">Jami O'quvchilar</span>
            <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900">{totalStudents} <span className="text-xs text-slate-500 font-normal">nafar</span></div>
          <div className="text-xs text-slate-500 mt-1">{classes.length} ta sinf bo'yicha</div>
        </div>

        {/* Total Certified */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4.5 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1.5">
            <span className="text-xs font-medium">Sertifikat Olganlar</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <Award className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-emerald-800">{certifiedCount} <span className="text-xs text-emerald-700 font-normal">nafar</span></div>
          <div className="flex items-center gap-2 mt-1.5">
            <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div 
                className="h-full bg-emerald-600 rounded-full transition-all duration-500" 
                style={{ width: `${certifiedPercent}%` }}
              />
            </div>
            <span className="text-[11px] font-semibold text-emerald-700">{certifiedPercent}%</span>
          </div>
        </div>

        {/* Financial collection */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4.5 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1.5">
            <span className="text-xs font-medium">To'lovlar (Tushum)</span>
            <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900">
            {totalPaidRevenue.toLocaleString('uz-UZ')} <span className="text-xs text-slate-500 font-normal">so'm</span>
          </div>
          <div className="text-xs text-amber-800 font-medium mt-1">
            Qarz: {totalRemainingDebt.toLocaleString('uz-UZ')} so'm
          </div>
        </div>

        {/* Email Pool status */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4.5 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1.5">
            <span className="text-xs font-medium">Zaxira Emaillar</span>
            <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center">
              <Database className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-blue-800">{unusedEmails} <span className="text-xs text-blue-700 font-normal">ta bo'sh</span></div>
          <div className="text-xs text-slate-500 mt-1">
            {studentsWithoutEmail.length > 0 ? (
              <span className="text-amber-700 font-semibold">{studentsWithoutEmail.length} ta o'quvchida email yo'q</span>
            ) : errorCount > 0 ? (
              <span className="text-rose-700 font-semibold">{errorCount} ta muammoli o'quvchi</span>
            ) : (
              `Jami ${emailPool.length} ta pochta`
            )}
          </div>
        </div>
      </div>

      {/* Modern Segmented Navigation Tabs */}
      <div className="bg-slate-200/70 p-1 rounded-xl flex flex-wrap sm:flex-nowrap gap-1 border border-slate-300">
        <button
          onClick={() => setActiveTab('classes')}
          className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
            activeTab === 'classes'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
          }`}
        >
          <Layers className="w-4 h-4 text-blue-700" />
          <span>Sinflar va O'quvchilar Boshqaruvi</span>
        </button>

        <button
          onClick={() => setActiveTab('finance')}
          className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
            activeTab === 'finance'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
          }`}
        >
          <DollarSign className="w-4 h-4 text-emerald-700" />
          <span>Moliya & To'lovlar Matritsasi</span>
        </button>

        <button
          onClick={() => setActiveTab('emails')}
          className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
            activeTab === 'emails'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
          }`}
        >
          <Mail className="w-4 h-4 text-blue-700" />
          <span>Email Zaxirasi & Pochta Boshqaruvi</span>
        </button>

        <button
          onClick={() => setActiveTab('sessions')}
          className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
            activeTab === 'sessions'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
          }`}
        >
          <Smartphone className="w-4 h-4 text-purple-600" />
          <span>Faol Seanslar & Qurilmalar</span>
          {sessions.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-200 text-slate-700 font-mono">
              {sessions.length}
            </span>
          )}
          {sessions.some(s => s.isBlocked) && (
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" title="Bloklangan qurilma mavjud"></span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('telegram')}
          className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
            activeTab === 'telegram'
              ? 'bg-[#24A1DE] text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
          }`}
        >
          <Send className="w-4 h-4" />
          <span>Telegram Bot (@Courseradan_bot)</span>
          {telegramUsers && telegramUsers.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-500 text-white font-mono font-bold">
              {telegramUsers.length} ustoz
            </span>
          )}
        </button>
      </div>

      {/* TAB 1: Classes & Students */}
      {activeTab === 'classes' && (
        <div className="space-y-5">
          {/* Class Cards Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            {classes.length === 0 ? (
              <div className="col-span-full p-8 bg-white border border-dashed border-slate-300 rounded-2xl text-center space-y-4">
                <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-700 border border-blue-200 flex items-center justify-center mx-auto">
                  <Upload className="w-7 h-7" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-slate-900">Sinflar hali kiritilmagan</h3>
                  <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                    Maktabingiz sinflari va o'quvchilarini kiritish uchun maktab hujjati (Excel, Word yoki matn)ni yuklang. Tizim avtomatik sinf nomi, ustoz va o'quvchilarni ajratib beradi.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenBulkUploadModal()}
                  className="px-4 py-2.5 bg-blue-700 hover:bg-blue-800 text-white font-semibold text-xs rounded-xl shadow-xs inline-flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Hujjat orqali yangi sinf yuklash</span>
                </button>
              </div>
            ) : (
              classes.map(c => {
                const cStudents = students.filter(s => s.classId === c.id);
                const cCertified = cStudents.filter(s => s.status === 'certified').length;
                const cTotalCost = cCertified * 5000;
                const cDebt = Math.max(0, cTotalCost - c.paidAmount);
                const isPaid = cTotalCost > 0 && c.paidAmount >= cTotalCost;
                const isSelected = selectedClassId === c.id;

                return (
                  <div
                    key={c.id}
                    className={`bg-white border rounded-2xl p-4 transition-all relative ${
                      isSelected
                        ? 'border-blue-600 ring-2 ring-blue-600/20 shadow-sm'
                        : 'border-slate-200 hover:border-slate-300 shadow-xs'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-9 h-9 rounded-lg bg-blue-50 border border-blue-200 text-blue-800 font-bold text-sm flex items-center justify-center flex-shrink-0">
                          {c.name}
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-sm font-bold text-slate-900 truncate">{c.teacherName}</h4>
                          <span className="text-[11px] text-slate-500 block">{c.name} sinfi</span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setEditingClass(c)}
                        className="p-1.5 text-slate-400 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition-colors"
                        title="Tahrirlash"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Stats */}
                    <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-slate-400 block text-[11px]">O'quvchilar:</span>
                        <span className="font-semibold text-slate-800">{cStudents.length} ta ({cCertified} tayyor)</span>
                      </div>

                      <div>
                        <span className="text-slate-400 block text-[11px]">To'lov:</span>
                        <button
                          type="button"
                          onClick={() => onOpenPaymentModal(c)}
                          className={`font-semibold hover:underline cursor-pointer ${isPaid ? 'text-emerald-700' : 'text-amber-800'}`}
                        >
                          {isPaid ? "To'landi ✅" : `${cDebt.toLocaleString()} so'm`}
                        </button>
                      </div>
                    </div>

                    {/* Action buttons: Select + Bulk Add to this class */}
                    <div className="mt-3 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedClassId(isSelected ? 'all' : c.id)}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer text-center ${
                          isSelected
                            ? 'bg-blue-700 text-white'
                            : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200'
                        }`}
                      >
                        {isSelected ? "Tanlangan" : "Ko'rish"}
                      </button>

                      <button
                        type="button"
                        onClick={() => onOpenBulkUploadModal(c.id)}
                        className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold rounded-lg border border-blue-200 flex items-center gap-1 transition-colors cursor-pointer"
                        title="Ushbu sinfga fayldan yangi o'quvchilarni qo'shish"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        <span>+ O'quvchi</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Selected Class Control & Teacher Message Banner */}
          {selectedClassId !== 'all' && (() => {
            const currentClass = classes.find(c => c.id === selectedClassId);
            if (!currentClass) return null;
            const classMsgs = messages.filter(m => m.classId === currentClass.id);
            const latestMsg = classMsgs.length > 0 ? classMsgs[classMsgs.length - 1] : null;
            const unreadMsgsCount = classMsgs.filter(m => !m.isRead).length;

            return (
              <div className="bg-gradient-to-r from-blue-900 to-indigo-950 text-white rounded-2xl p-5 shadow-lg border border-blue-800/60 animate-fade-in">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  {/* Left: Class & Teacher Info */}
                  <div className="flex items-center gap-3.5">
                    <div className="w-12 h-12 rounded-2xl bg-white/10 border border-white/20 text-white font-black text-lg flex items-center justify-center flex-shrink-0 backdrop-blur-md shadow-inner">
                      {currentClass.name}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-extrabold text-white tracking-tight">
                          {currentClass.name} sinfi boshqaruvi
                        </h3>
                        <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-blue-500/30 text-blue-200 border border-blue-400/30">
                          Faol sinf
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-blue-200 mt-1">
                        <span className="flex items-center gap-1 font-semibold text-white">
                          <Users className="w-3.5 h-3.5 text-blue-300" />
                          <span>Ustoz: {currentClass.teacherName}</span>
                        </span>
                        {currentClass.teacherPhone && (
                          <span className="flex items-center gap-1 text-blue-300 font-mono">
                            <Phone className="w-3 h-3" />
                            <span>{currentClass.teacherPhone}</span>
                          </span>
                        )}
                        <span className="bg-white/10 px-2 py-0.5 rounded text-[11px] text-blue-100 font-semibold">
                          {students.filter(s => s.classId === currentClass.id).length} ta o'quvchi
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Middle / Right: Live Teacher Message Status & Action Buttons */}
                  <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto justify-end">
                    
                    {/* Message Read Status Tag */}
                    {latestMsg && (
                      <div className="hidden lg:flex flex-col items-end text-right mr-2 bg-white/10 px-3 py-1.5 rounded-xl border border-white/15">
                        <span className="text-[10px] text-blue-300 font-medium">Ustoz xabari holati:</span>
                        {latestMsg.isRead ? (
                          <span className="text-xs font-bold text-emerald-300 flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Ko'rgan (O'qildi)</span>
                          </span>
                        ) : (
                          <span className="text-xs font-bold text-amber-300 flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                            <span>Hali ko'rmadi</span>
                          </span>
                        )}
                      </div>
                    )}

                    {/* Button 1: Send Message to Teacher */}
                    <button
                      type="button"
                      onClick={() => onOpenTeacherMessageModal(currentClass)}
                      className="px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded-xl shadow-md flex items-center gap-2 transition-all cursor-pointer transform hover:scale-[1.02] active:scale-[0.98]"
                    >
                      <Bell className="w-4 h-4 text-slate-950" />
                      <span>Ustozga xabar yuborish</span>
                      {unreadMsgsCount > 0 && (
                        <span className="px-1.5 py-0.2 rounded-full bg-slate-950 text-amber-400 text-[10px] font-black">
                          {unreadMsgsCount}
                        </span>
                      )}
                    </button>

                    {/* Button 2: Bulk Add Students to this specific class */}
                    <button
                      type="button"
                      onClick={() => onOpenBulkUploadModal(currentClass.id)}
                      className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl border border-blue-400/40 shadow-md flex items-center gap-2 transition-all cursor-pointer transform hover:scale-[1.02]"
                      title="Ushbu sinfga fayl (Excel, Word) orqali yangi o'quvchilarni qo'shish"
                    >
                      <Upload className="w-4 h-4" />
                      <span>+ Fayldan qo'shish</span>
                    </button>

                    {/* Button 2b: Single Student to this class */}
                    <button
                      type="button"
                      onClick={() => {
                        setAllowDuplicateName(false);
                        setNewStudentName('');
                        setNewStudentBirthDate('');
                        setNewStudentPassport('');
                        setNewStudentCertLink('');
                        setNewStudentClassId(currentClass.id);
                        setIsAddingStudent(true);
                      }}
                      className="px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl border border-emerald-400/40 shadow-md flex items-center gap-1.5 transition-all cursor-pointer transform hover:scale-[1.02]"
                      title="Ushbu sinfga yakka o'quvchi kiritish"
                    >
                      <Plus className="w-4 h-4" />
                      <span>+ Yakka o'quvchi</span>
                    </button>

                    {/* Button 3: Payment for this class */}
                    <button
                      type="button"
                      onClick={() => onOpenPaymentModal(currentClass)}
                      className="px-3 py-2.5 bg-white/10 hover:bg-white/20 text-white font-semibold text-xs rounded-xl border border-white/20 flex items-center gap-1.5 transition-colors cursor-pointer"
                      title="Sinf to'lovini kiritish"
                    >
                      <CreditCard className="w-4 h-4 text-emerald-400" />
                      <span>To'lov</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Search & Filter Bar */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="text"
                placeholder="O'quvchini ismi, pasporti yoki emaili orqali qidirish..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-xs sm:text-sm focus:outline-none focus:bg-white focus:border-blue-700"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 font-medium">Sinf filtri:</span>
              <select
                value={selectedClassId}
                onChange={e => setSelectedClassId(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-xs font-medium focus:outline-none focus:bg-white focus:border-blue-700 cursor-pointer"
              >
                <option value="all">Barcha sinflar ({totalStudents})</option>
                {classes.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} sinfi ({c.teacherName})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Students Table in High Contrast Clean White Style */}
          <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-xs">
            <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">O'quvchilar Ro'yxati</h3>
                <p className="text-xs text-slate-500">
                  <span className="text-blue-700 font-semibold">1 marta bosing</span> — nusxalash, <span className="text-blue-700 font-semibold">2 marta tez bosing</span> — tahrirlash
                </p>
              </div>
              <span className="text-xs text-slate-600 font-mono font-medium">
                {filteredStudents.length} nafar ko'rsatilmoqda
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-100/75 text-slate-600 uppercase text-[11px] font-bold tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="py-3 pl-5 pr-2">№</th>
                    <th className="py-3 px-3">O'quvchi F.I.SH</th>
                    <th className="py-3 px-3">Sinf</th>
                    <th className="py-3 px-3">Biriktirilgan Pochta</th>
                    <th className="py-3 px-3">Holat</th>
                    <th className="py-3 px-3">Sertifikat</th>
                    <th className="py-3 pr-5 pl-3 text-right">Amal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {filteredStudents.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400 font-sans">
                        O'quvchilar topilmadi.
                      </td>
                    </tr>
                  ) : (
                    filteredStudents.map((st, idx) => {
                      const stClass = classes.find(c => c.id === st.classId);
                      const isCertified = st.status === 'certified';
                      const isError = st.hasError || st.status === 'error';

                      return (
                        <tr
                          key={st.id}
                          className={`hover:bg-slate-50/80 transition-colors select-none ${
                            isError ? 'bg-rose-50/40' : ''
                          }`}
                          onDoubleClick={() => onOpenStudentModal(st)}
                        >
                          <td className="py-3 pl-5 pr-2 text-slate-400 font-medium">{idx + 1}</td>

                          {/* Full Name & Passport & Birth date with Single-Click Copy and Double-Click Edit */}
                          <td className="py-3 px-3 font-sans font-semibold text-slate-900">
                            <div className="flex items-center gap-2">
                              <span
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCopyField(st.fullName, "O'quvchi F.I.SH");
                                }}
                                onDoubleClick={(e) => {
                                  e.stopPropagation();
                                  onOpenStudentModal(st);
                                }}
                                className="cursor-pointer hover:text-blue-700 hover:underline active:opacity-70 transition-all rounded px-1 -mx-1"
                                title="1 marta bosing - nusxalash, 2 marta - tahrirlash"
                              >
                                {st.fullName}
                              </span>
                              {isError && (
                                <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-rose-100 text-rose-800 border border-rose-200 font-sans">
                                  XATO
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 font-mono mt-0.5 font-normal flex items-center gap-2">
                              {st.passportOrId ? (
                                <span
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handlePassportSingleClick(st);
                                  }}
                                  onDoubleClick={(e) => {
                                    e.stopPropagation();
                                    handlePassportDoubleClick(st);
                                  }}
                                  className="cursor-pointer hover:text-blue-700 hover:underline active:opacity-70 transition-all rounded px-1 -mx-1"
                                  title="1 marta bosing - faqat 7 talik raqamni nusxalash, 2 marta tez bosing - tahrirlash (Ctrl+A / Ctrl+C da I-FR bilan nusxalash)"
                                >
                                  {st.passportOrId}
                                </span>
                              ) : (
                                <span className="text-slate-400">ID yo'q</span>
                              )}
                              <span>•</span>
                              {st.birthDate ? (
                                <span
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleCopyField(st.birthDate!, "Tug'ilgan sana");
                                  }}
                                  onDoubleClick={(e) => {
                                    e.stopPropagation();
                                    onOpenStudentModal(st);
                                  }}
                                  className="cursor-pointer hover:text-blue-700 hover:underline active:opacity-70 transition-all rounded px-1 -mx-1"
                                  title="1 marta bosing - nusxalash, 2 marta - tahrirlash"
                                >
                                  {st.birthDate}
                                </span>
                              ) : (
                                <span className="text-slate-400">Sana yo'q</span>
                              )}
                            </div>
                          </td>

                          <td className="py-3 px-3 text-slate-800 font-sans">
                            <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-800 text-[11px] font-semibold border border-slate-200">
                              {stClass?.name || 'Sinf'}
                            </span>
                          </td>

                          {/* Email with Single-Click Copy and Double-Click Edit */}
                          <td className="py-3 px-3">
                            {st.assignedEmail ? (
                              <span
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCopyField(st.assignedEmail!, "Email manzili");
                                }}
                                onDoubleClick={(e) => {
                                  e.stopPropagation();
                                  onOpenStudentModal(st);
                                }}
                                className="text-slate-800 font-mono text-[11px] cursor-pointer hover:text-blue-700 hover:underline active:opacity-70 transition-all rounded px-1 -mx-1 block"
                                title="1 marta bosing - nusxalash, 2 marta - tahrirlash"
                              >
                                {st.assignedEmail}
                              </span>
                            ) : (
                              <span className="text-slate-400 font-sans text-[11px] italic">
                                Email biriktirilmagan
                              </span>
                            )}
                          </td>

                          <td className="py-3 px-3 font-sans">
                            {isError ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-800 border border-rose-200">
                                <AlertTriangle className="w-3 h-3 text-rose-600" /> Muammo
                              </span>
                            ) : isCertified ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                <CheckCircle className="w-3 h-3 text-emerald-600" /> Tayyor
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                                <Clock className="w-3 h-3 text-slate-400" /> Kutilmoqda
                              </span>
                            )}
                          </td>

                          <td className="py-3 px-3">
                            {st.certificateLink ? (
                              <a
                                href={st.certificateLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={e => e.stopPropagation()}
                                className="text-blue-700 hover:text-blue-800 font-medium flex items-center gap-1 max-w-[140px] truncate"
                              >
                                <ExternalLink className="w-3 h-3 flex-shrink-0" />
                                <span className="truncate">Sertifikat</span>
                              </a>
                            ) : (
                              <button
                                type="button"
                                onClick={e => {
                                  e.stopPropagation();
                                  onOpenStudentModal(st);
                                }}
                                className="px-2 py-0.5 text-[11px] font-sans font-semibold rounded bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 flex items-center gap-1 cursor-pointer"
                              >
                                <Clipboard className="w-3 h-3" />
                                <span>+ Havola</span>
                              </button>
                            )}
                          </td>

                          <td className="py-3 pr-5 pl-3 text-right">
                            <button
                              type="button"
                              onClick={e => {
                                e.stopPropagation();
                                onOpenStudentModal(st);
                              }}
                              className="px-2.5 py-1 text-xs font-sans font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded border border-slate-200 transition-colors cursor-pointer"
                            >
                              Tahrirlash
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Finance & Payments Matrix */}
      {activeTab === 'finance' && (
        <div className="space-y-5">
          <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-xs">
            <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900 text-sm sm:text-base">Sinflar Bo'yicha To'lovlar Hisob-Kitobi</h3>
                <p className="text-xs text-slate-500">
                  Har bir tayyor sertifikat uchun xizmat narxi: <b>5 000 so'm</b>. Qator ustiga bosib to'langan summani yangilang.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-100/75 text-slate-600 uppercase text-[11px] font-bold tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="py-3.5 pl-5 pr-3">Sinf Nomi</th>
                    <th className="py-3.5 px-3">Sinf Rahbari</th>
                    <th className="py-3.5 px-3">O'quvchilar</th>
                    <th className="py-3.5 px-3">Sertifikat Olgan</th>
                    <th className="py-3.5 px-3">Hisoblangan (5 000x)</th>
                    <th className="py-3.5 px-3">To'langan Summa</th>
                    <th className="py-3.5 px-3">Qolgan Qarz</th>
                    <th className="py-3.5 pr-5 pl-3 text-right">Amal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {classes.map(c => {
                    const cStudents = students.filter(s => s.classId === c.id);
                    const cCertified = cStudents.filter(s => s.status === 'certified').length;
                    const cTotalCost = cCertified * 5000;
                    const cDebt = Math.max(0, cTotalCost - c.paidAmount);
                    const isPaid = cTotalCost > 0 && c.paidAmount >= cTotalCost;

                    return (
                      <tr 
                        key={c.id} 
                        className="hover:bg-slate-50 transition-colors cursor-pointer"
                        onClick={() => onOpenPaymentModal(c)}
                      >
                        <td className="py-3.5 pl-5 pr-3 font-bold text-slate-900">
                          <span className="px-2.5 py-1 rounded bg-slate-100 border border-slate-200 text-xs">
                            {c.name}
                          </span>
                        </td>
                        <td className="py-3.5 px-3 font-sans font-medium text-slate-900">{c.teacherName}</td>
                        <td className="py-3.5 px-3">{cStudents.length} nafar</td>
                        <td className="py-3.5 px-3 text-emerald-800 font-bold">{cCertified} nafar</td>
                        <td className="py-3.5 px-3 font-semibold">{cTotalCost.toLocaleString('uz-UZ')} so'm</td>
                        <td className="py-3.5 px-3 text-emerald-800 font-semibold">{c.paidAmount.toLocaleString('uz-UZ')} so'm</td>
                        <td className="py-3.5 px-3">
                          {isPaid ? (
                            <span className="inline-flex items-center gap-1 text-emerald-800 font-sans font-bold text-[11px] bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                              <CheckCircle2 className="w-3.5 h-3.5" /> To'liq to'langan
                            </span>
                          ) : (
                            <span className="text-amber-800 font-bold">
                              {cDebt.toLocaleString('uz-UZ')} so'm
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 pr-5 pl-3 text-right">
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation();
                              onOpenPaymentModal(c);
                            }}
                            className="px-3 py-1 bg-white hover:bg-slate-100 text-slate-800 text-xs font-sans font-semibold rounded-lg border border-slate-200 transition-colors cursor-pointer"
                          >
                            To'lov kiritish
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: Email Pool & Accounts Management */}
      {activeTab === 'emails' && (
        <div className="space-y-5">
          <div className="bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-6 shadow-xs space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">Gmail Pochta Zaxira Boshqaruvi</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Tizimga yangi o'quvchilar kiritilganda avtomatik ushbu bo'sh pochtalardan navbat bilan biriktiriladi.
                </p>
              </div>

              <div className="flex items-center gap-2.5 flex-wrap">
                {/* Button: Assign emails to students who lack one */}
                <button
                  type="button"
                  onClick={handleAssignEmailsToMissingStudents}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl flex items-center gap-2 transition-colors cursor-pointer shadow-xs"
                  title="Emaili yo'q barcha o'quvchilarga zaxiradan yangi email biriktirish"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Emaili yo'q o'quvchilarga email berish ({studentsWithoutEmail.length} ta)</span>
                </button>

                <button
                  type="button"
                  onClick={onOpenBulkEmailModal}
                  className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold rounded-xl flex items-center gap-2 transition-colors cursor-pointer shadow-xs"
                >
                  <Plus className="w-4 h-4" />
                  <span>Yangi 500+ Email Qo'shish</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-xs text-slate-500 block mb-1">Jami Tizimdagi Emaillar:</span>
                <span className="text-xl font-bold text-slate-900">{emailPool.length} ta</span>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-xs text-slate-500 block mb-1">O'quvchilarga Taqsimlangan:</span>
                <span className="text-xl font-bold text-emerald-700">
                  {emailPool.filter(e => e.isUsed).length} ta
                </span>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-xs text-slate-500 block mb-1">Zaxiradagi Bo'sh Emaillar:</span>
                <span className="text-xl font-bold text-blue-700">{unusedEmails} ta</span>
              </div>

              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200">
                <span className="text-xs text-amber-700 block mb-1">Emaili Yo'q O'quvchilar:</span>
                <span className="text-xl font-bold text-amber-900">{studentsWithoutEmail.length} nafar</span>
              </div>
            </div>

            {/* Email list preview */}
            <div className="space-y-2 pt-1">
              <span className="text-xs font-semibold text-slate-800 block">Pochtalar ro'yxati:</span>
              <div className="max-h-80 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/50 p-2.5">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                  {emailPool.map((item, idx) => (
                    <div
                      key={idx}
                      className={`p-2.5 rounded-lg border text-xs font-mono flex items-center justify-between ${
                        item.isUsed
                          ? 'bg-white border-slate-200 text-slate-500'
                          : 'bg-blue-50/50 border-blue-200 text-blue-900'
                      }`}
                    >
                      <div className="truncate mr-2">
                        <div className="truncate font-semibold">{item.email}</div>
                        <div className="text-[10px] text-slate-500 font-sans">
                          Parol: {item.password || '—'}
                        </div>
                      </div>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        item.isUsed ? 'bg-slate-100 text-slate-600' : 'bg-blue-100 text-blue-800'
                      }`}>
                        {item.isUsed ? "Ulangan" : "Bo'sh"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: Active Sessions & Devices Management */}
      {activeTab === 'sessions' && (
        <SessionsManagementTab
          sessions={sessions}
          currentDeviceId={currentDeviceId}
          onToggleBlockDevice={onToggleBlockDevice}
          onDeleteSession={onDeleteSession}
        />
      )}

      {/* TAB 5: Telegram Bot */}
      {activeTab === 'telegram' && (
        <TelegramBotTab
          classes={classes}
          students={students}
          telegramUsers={telegramUsers}
          onOpenTeacherMessageModal={onOpenTeacherMessageModal}
          onRefreshUsers={onRefreshTelegramUsers}
        />
      )}

      {/* Modal: Single Student Addition (Clean White Apple Dialog with strict conflict detection & unique email) */}
      {isAddingStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in overflow-y-auto">
          <div className="relative w-full max-w-md bg-white border border-slate-300 rounded-2xl shadow-2xl p-6 my-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-900">Yakka O'quvchi Qo'shish</h3>
              <button
                type="button"
                onClick={() => setIsAddingStudent(false)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 cursor-pointer"
                title="Yopish (ESC)"
              >
                <Trash2 className="hidden" />
                <span className="text-xs font-mono text-slate-400">[ESC]</span>
              </button>
            </div>

            {/* CONFLICT NOTICES WITH COMPLETE STUDENT DETAILS */}
            {newStudentConflicts.hasPassportConflict && newStudentConflicts.conflictingStudentByPassport && (
              <div className="mb-4 p-4 bg-rose-50 border-2 border-rose-300 rounded-xl text-xs text-rose-950 space-y-2 animate-scale-up">
                <div className="flex items-center gap-2 font-bold text-rose-800">
                  <AlertOctagon className="w-4 h-4 text-rose-600 flex-shrink-0" />
                  <span className="text-sm">Pasport / ID seriyasi takrorlandi!</span>
                </div>
                <p className="leading-relaxed text-[11px] text-rose-900">
                  Ushbu pasport seriyasi (<strong>{newStudentPassport}</strong>) avvaldan tizimdagi o'quvchiga biriktirilgan. Pasport seriyasi takrorlanishi qat'iy taqiqlanadi:
                </p>
                <div className="bg-white/90 rounded-lg p-3 border border-rose-200 space-y-1.5 font-mono text-[11px] text-slate-800">
                  <div className="flex justify-between items-center border-b border-slate-100 pb-1 font-sans">
                    <span className="text-slate-500 font-medium">O'quvchi F.I.SH:</span>
                    <span className="font-bold text-slate-900">{newStudentConflicts.conflictingStudentByPassport.fullName}</span>
                  </div>
                  <div className="flex justify-between items-center border-b border-slate-100 pb-1">
                    <span className="text-slate-500 font-sans font-medium">Sinfi:</span>
                    <span className="font-semibold text-blue-700 font-sans">
                      {newStudentConflicts.conflictingClassByPassport ? `${newStudentConflicts.conflictingClassByPassport.name} sinfi (${newStudentConflicts.conflictingClassByPassport.teacherName})` : 'Noma\'lum'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center border-b border-slate-100 pb-1">
                    <span className="text-slate-500 font-sans font-medium">Tug'ilgan sana:</span>
                    <span>{newStudentConflicts.conflictingStudentByPassport.birthDate || 'Kiritilmagan'}</span>
                  </div>
                  <div className="flex justify-between items-center border-b border-slate-100 pb-1">
                    <span className="text-slate-500 font-sans font-medium">Pasport / ID:</span>
                    <span className="font-bold text-slate-900">{newStudentConflicts.conflictingStudentByPassport.passportOrId}</span>
                  </div>
                  <div className="flex justify-between items-center border-b border-slate-100 pb-1">
                    <span className="text-slate-500 font-sans font-medium">Email:</span>
                    <span className="text-blue-700 font-semibold">{newStudentConflicts.conflictingStudentByPassport.assignedEmail || 'Mavjud emas'}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 font-sans font-medium">Sertifikat holati:</span>
                    <span>{newStudentConflicts.conflictingStudentByPassport.certificateLink ? '✅ Tayyor' : '⏳ Kutilmoqda'}</span>
                  </div>
                </div>
              </div>
            )}

            {newStudentConflicts.hasCertificateConflict && newStudentConflicts.conflictingStudentByCertificate && (
              <div className="mb-4 p-4 bg-rose-50 border-2 border-rose-300 rounded-xl text-xs text-rose-950 space-y-2 animate-scale-up">
                <div className="flex items-center gap-2 font-bold text-rose-800">
                  <AlertOctagon className="w-4 h-4 text-rose-600 flex-shrink-0" />
                  <span className="text-sm">Sertifikat havolasi takrorlandi!</span>
                </div>
                <p className="leading-relaxed text-[11px] text-rose-900">
                  Ushbu sertifikat havolasi avvaldan tizimdagi o'quvchiga biriktirilgan. Takrorlash qat'iy taqiqlanadi:
                </p>
                <div className="bg-white/90 rounded-lg p-3 border border-rose-200 space-y-1.5 font-mono text-[11px] text-slate-800">
                  <div className="flex justify-between items-center border-b border-slate-100 pb-1 font-sans">
                    <span className="text-slate-500 font-medium">O'quvchi F.I.SH:</span>
                    <span className="font-bold text-slate-900">{newStudentConflicts.conflictingStudentByCertificate.fullName}</span>
                  </div>
                  <div className="flex justify-between items-center border-b border-slate-100 pb-1">
                    <span className="text-slate-500 font-sans font-medium">Sinfi:</span>
                    <span className="font-semibold text-blue-700 font-sans">
                      {newStudentConflicts.conflictingClassByCertificate ? `${newStudentConflicts.conflictingClassByCertificate.name} sinfi (${newStudentConflicts.conflictingClassByCertificate.teacherName})` : 'Noma\'lum'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 font-sans font-medium">Pasport / ID:</span>
                    <span className="font-bold text-slate-900">{newStudentConflicts.conflictingStudentByCertificate.passportOrId || '—'}</span>
                  </div>
                </div>
              </div>
            )}

            {newStudentConflicts.hasNameConflict && newStudentConflicts.conflictingStudentByName && (
              <div className="mb-4 p-4 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-950 space-y-2.5 animate-scale-up">
                <div className="flex items-center gap-2 font-bold text-amber-800">
                  <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                  <span className="text-sm">Bu ismdagi o'quvchi tizimda mavjud!</span>
                </div>
                <p className="leading-relaxed text-[11px] text-amber-900">
                  Tizimda allaqachon ushbu ism-familiyali o'quvchi mavjud:
                </p>
                <div className="bg-white/90 rounded-lg p-3 border border-amber-200 space-y-1.5 font-mono text-[11px] text-slate-800">
                  <div className="flex justify-between items-center border-b border-slate-100 pb-1 font-sans">
                    <span className="text-slate-500 font-medium">Mavjud o'quvchi:</span>
                    <span className="font-bold text-slate-900">{newStudentConflicts.conflictingStudentByName.fullName}</span>
                  </div>
                  <div className="flex justify-between items-center border-b border-slate-100 pb-1">
                    <span className="text-slate-500 font-sans font-medium">Sinfi:</span>
                    <span className="font-semibold text-blue-700 font-sans">
                      {newStudentConflicts.conflictingClassByName ? `${newStudentConflicts.conflictingClassByName.name} sinfi (${newStudentConflicts.conflictingClassByName.teacherName})` : 'Noma\'lum'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center border-b border-slate-100 pb-1">
                    <span className="text-slate-500 font-sans font-medium">Tug'ilgan sana:</span>
                    <span>{newStudentConflicts.conflictingStudentByName.birthDate || 'Kiritilmagan'}</span>
                  </div>
                  <div className="flex justify-between items-center border-b border-slate-100 pb-1">
                    <span className="text-slate-500 font-sans font-medium">Pasport / ID:</span>
                    <span className="font-bold text-slate-900">{newStudentConflicts.conflictingStudentByName.passportOrId || '—'}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 font-sans font-medium">Email:</span>
                    <span className="text-blue-700 font-semibold">{newStudentConflicts.conflictingStudentByName.assignedEmail || 'Mavjud emas'}</span>
                  </div>
                </div>
                <div className="pt-1 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-600">Agar bu boshqa o'quvchi bo'lsa:</span>
                  <button
                    type="button"
                    onClick={() => setAllowDuplicateName(!allowDuplicateName)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      allowDuplicateName 
                        ? 'bg-emerald-600 text-white' 
                        : 'bg-white text-slate-800 border border-amber-300 hover:bg-amber-100'
                    }`}
                  >
                    {allowDuplicateName ? "✅ Bu boshqa o'quvchi (Tasdiqlandi)" : "Bu boshqa o'quvchimi? (Ruxsat berish)"}
                  </button>
                </div>
              </div>
            )}

            <form onSubmit={handleCreateStudent} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">O'quvchi F.I.SH:</label>
                <input
                  type="text"
                  placeholder="Masalan: Aliyev Vali Sanjar o'g'li"
                  value={newStudentName}
                  onChange={e => setNewStudentName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 text-sm focus:outline-none focus:bg-white focus:border-blue-700"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Sinfni tanlang:</label>
                <select
                  value={newStudentClassId}
                  onChange={e => setNewStudentClassId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 text-sm focus:outline-none focus:bg-white focus:border-blue-700"
                >
                  {classes.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} sinfi ({c.teacherName})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Tug'ilgan sana:</label>
                  <input
                    type="text"
                    placeholder="2010-04-15"
                    value={newStudentBirthDate}
                    onChange={e => setNewStudentBirthDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 text-sm focus:outline-none focus:bg-white focus:border-blue-700"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Pasport / ID:</label>
                  <input
                    type="text"
                    placeholder="AA1234567"
                    value={newStudentPassport}
                    onChange={e => setNewStudentPassport(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 text-sm focus:outline-none focus:bg-white focus:border-blue-700 uppercase"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Sertifikat havolasi (ixtiyoriy):</label>
                <input
                  type="url"
                  placeholder="https://coursera.org/verify/..."
                  value={newStudentCertLink}
                  onChange={e => setNewStudentCertLink(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 text-xs focus:outline-none focus:bg-white focus:border-blue-700"
                />
              </div>

              <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 flex items-center gap-2">
                <Mail className="w-4 h-4 text-blue-600 flex-shrink-0" />
                <span>
                  O'quvchiga zaxiradagi bo'sh Coursera emaillaridan <strong>noyob yangi email</strong> avtomatik biriktiriladi.
                </span>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsAddingStudent(false)}
                  className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Bekor qilish (ESC)
                </button>
                <button
                  type="submit"
                  disabled={newStudentConflicts.hasPassportConflict || newStudentConflicts.hasCertificateConflict || (newStudentConflicts.hasNameConflict && !allowDuplicateName)}
                  className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-blue-700 hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors cursor-pointer"
                >
                  Qo'shish
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Class Edit */}
      {editingClass && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in overflow-y-auto">
          <div className="relative w-full max-w-md bg-white border border-slate-300 rounded-2xl shadow-2xl p-6 my-6">
            <h3 className="text-base font-bold text-slate-900 mb-4">Sinf Ma'lumotlarini Tahrirlash</h3>
            <form onSubmit={handleSaveClassEdit} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Sinf nomi (Masalan: 10-A):</label>
                <input
                  type="text"
                  value={editingClass.name}
                  onChange={e => setEditingClass({ ...editingClass, name: e.target.value.toUpperCase() })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 text-sm focus:outline-none focus:bg-white focus:border-blue-700 uppercase"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Sinf rahbari (Ustoz F.I.SH):</label>
                <input
                  type="text"
                  value={editingClass.teacherName}
                  onChange={e => setEditingClass({ ...editingClass, teacherName: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 text-sm focus:outline-none focus:bg-white focus:border-blue-700"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Telefon raqam:</label>
                <input
                  type="text"
                  value={editingClass.teacherPhone || ''}
                  onChange={e => setEditingClass({ ...editingClass, teacherPhone: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 text-sm focus:outline-none focus:bg-white focus:border-blue-700"
                />
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(`Haqiqatan ham ${editingClass.name} sinfini o'chirmoqchimisiz?`)) {
                      onDeleteClass(editingClass.id);
                      setEditingClass(null);
                    }
                  }}
                  className="text-xs font-medium text-rose-700 hover:text-rose-800"
                >
                  Sinfni o'chirish
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingClass(null)}
                    className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors"
                  >
                    Bekor qilish (ESC)
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-blue-700 hover:bg-blue-800 text-white transition-colors cursor-pointer"
                  >
                    Saqlash
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
