import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { ClassGroup, Student, EmailAccount, TeacherSession, TeacherMessage, TelegramUser, TeacherCertificate } from '../types';
import { SessionsManagementTab } from './SessionsManagementTab';
import { TelegramBotTab } from './TelegramBotTab';
import { TeacherCertificatesTab } from './TeacherCertificatesTab';
import { GmailGeneratorModal } from './GmailGeneratorModal';
import { OperatorSpeedAnalyticsModal } from './OperatorSpeedAnalyticsModal';
import { ClassBatchAutomationModal } from './ClassBatchAutomationModal';
import { ClassLiquidGlassStrip } from './ClassLiquidGlassStrip';
import { NavigationLiquidGlassTabs } from './NavigationLiquidGlassTabs';
import { checkStudentConflicts, extractPassportDigits } from '../utils/studentValidator';
import { analyzeOperatorSpeed, getStoredCertifyLogs } from '../utils/operatorSpeedTracker';
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
  Check,
  GraduationCap,
  Zap,
  Flame,
  Trophy,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

export interface UnifiedItem {
  id: string;
  fullName: string;
  passportOrId?: string;
  birthDate?: string;
  assignedEmail?: string;
  assignedPassword?: string;
  status: 'pending' | 'certified' | 'error';
  certificateLink?: string;
  hasError?: boolean;
  isTeacher: boolean;
  badgeLabel: string;
  rawStudent?: Student;
  rawTeacher?: TeacherCertificate;
}

interface AdminPanelProps {
  classes: ClassGroup[];
  students: Student[];
  emailPool: EmailAccount[];
  sessions: TeacherSession[];
  messages: TeacherMessage[];
  telegramUsers?: TelegramUser[];
  teacherCertificates?: TeacherCertificate[];
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
  onAddTeacher?: (teacher: TeacherCertificate) => void;
  onAddBatchTeachers?: (teachers: TeacherCertificate[]) => void;
  onUpdateTeacher?: (teacher: TeacherCertificate) => void;
  onDeleteTeacher?: (teacherId: string) => void;
  onAssignTeacherEmail?: (teacherId: string) => void;
  onAddGeneratedEmails?: (newEmails: EmailAccount[]) => Promise<void> | void;
  onToggleStudentPayment?: (studentId: string, currentPaidState: boolean) => void;
  onSaveStudent?: (student: Student) => Promise<void> | void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({
  classes,
  students,
  emailPool,
  sessions,
  messages,
  telegramUsers = [],
  teacherCertificates = [],
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
  onAddTeacher = () => {},
  onAddBatchTeachers = () => {},
  onUpdateTeacher = () => {},
  onDeleteTeacher = () => {},
  onAssignTeacherEmail,
  onAddGeneratedEmails,
  onToggleStudentPayment,
  onSaveStudent,
}) => {
  const [activeTab, setActiveTab] = useState<'classes' | 'teachers' | 'finance' | 'emails' | 'sessions' | 'telegram'>('classes');
  const [selectedClassId, setSelectedClassId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isGmailGeneratorOpen, setIsGmailGeneratorOpen] = useState(false);
  const [isSpeedModalOpen, setIsSpeedModalOpen] = useState(false);
  const [isClassBatchModalOpen, setIsClassBatchModalOpen] = useState(false);
  const [batchTargetClass, setBatchTargetClass] = useState<ClassGroup | null>(null);

  // Compact / Expanded state for top class selection panel
  const [isClassCardsExpanded, setIsClassCardsExpanded] = useState(false);

  // Multi-select status filter: 'certified' (Tayyor), 'error' (Xatolik), 'pending' (Kutilmoqda)
  type StatusFilterType = 'certified' | 'error' | 'pending';
  const [selectedStatusFilters, setSelectedStatusFilters] = useState<StatusFilterType[]>([]);
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
  const statusDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(e.target as Node)) {
        setIsStatusDropdownOpen(false);
      }
    };
    if (isStatusDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isStatusDropdownOpen]);

  const toggleStatusFilter = (st: StatusFilterType) => {
    setSelectedStatusFilters(prev => {
      if (prev.includes(st)) {
        return prev.filter(x => x !== st);
      } else {
        return [...prev, st];
      }
    });
  };

  // In-app Delete Confirmation state (avoids blocked window.confirm in iframe)
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    isOpen: boolean;
    type: 'class' | 'student';
    id: string;
    name: string;
    subtitle?: string;
  } | null>(null);

  const handleOpenClassBatch = (cg: ClassGroup) => {
    setBatchTargetClass(cg);
    setIsClassBatchModalOpen(true);
  };

  // Real-time operator speed & activity analysis with 15-minute gap threshold
  const operatorAnalysis = useMemo(() => analyzeOperatorSpeed(getStoredCertifyLogs(students)), [students]);
  
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

  const handlePassportSingleClick = (st: { passportOrId?: string }) => {
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

  const handlePassportDoubleClick = (st: Student | UnifiedItem) => {
    if (passportClickTimeoutRef.current) {
      clearTimeout(passportClickTimeoutRef.current);
      passportClickTimeoutRef.current = null;
    }
    if ('rawStudent' in st && st.rawStudent) {
      onOpenStudentModal(st.rawStudent, 'passport');
    } else if ('classId' in st) {
      onOpenStudentModal(st as Student, 'passport');
    }
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

  // Overall statistics (Students + Teachers)
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

  // Teacher statistics
  const totalTeachers = teacherCertificates.length;
  const certifiedTeachers = teacherCertificates.filter(t => t.status === 'certified');
  const teachersRevenue = teacherCertificates.reduce((sum, t) => sum + (t.price || 5000), 0);
  const teachersPaid = teacherCertificates.reduce((sum, t) => sum + (t.paidAmount || 0), 0);
  const teachersDebt = Math.max(0, teachersRevenue - teachersPaid);

  // Grand totals across all certificates (Students + Teachers)
  const grandTotalCertified = certifiedCount + certifiedTeachers.length;
  const grandTotalPotentialRevenue = totalPotentialRevenue + teachersRevenue;
  const grandTotalPaidRevenue = totalPaidRevenue + teachersPaid;
  const grandTotalRemainingDebt = totalRemainingDebt + teachersDebt;

  // Aniq mahalliy kun (kechasi 12:00 / 00:00:00 dan 23:59:59 gacha) bo'yicha sertifikat kiritilganini tekshirish
  const isCertifiedTodayLocal = useCallback((dateString?: string): boolean => {
    if (!dateString) return false;
    try {
      const certDate = new Date(dateString);
      if (!isNaN(certDate.getTime())) {
        const today = new Date();
        return (
          certDate.getFullYear() === today.getFullYear() &&
          certDate.getMonth() === today.getMonth() &&
          certDate.getDate() === today.getDate()
        );
      }
    } catch {
      // ignore
    }
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    const localIso = `${y}-${m}-${d}`;
    const localDot = `${d}.${m}.${y}`;
    return dateString.includes(localIso) || dateString.includes(localDot);
  }, []);

  // Bugun olingan sertifikatlar aniq miqdori (O'quvchilar + Ustozlar + Loglar)
  const todayCertificatesCount = useMemo(() => {
    const studentCount = students.filter(s => {
      if (s.status !== 'certified') return false;
      return isCertifiedTodayLocal(s.certifiedAt);
    }).length;

    const teacherCount = teacherCertificates.filter(t => {
      if (t.status !== 'certified') return false;
      return isCertifiedTodayLocal(t.certifiedAt);
    }).length;

    const logs = getStoredCertifyLogs(students);
    const logsToday = logs.filter(l => isCertifiedTodayLocal(l.timestamp)).length;

    return Math.max(studentCount + teacherCount, logsToday);
  }, [students, teacherCertificates, isCertifiedTodayLocal]);

  // Unified list of people for the table (Students + Teachers when selected or searching)
  const unifiedList = useMemo(() => {
    const list: UnifiedItem[] = [];

    // Add students if not explicitly filtering only teachers
    if (selectedClassId !== 'only_teachers') {
      students.forEach(st => {
        if (selectedClassId !== 'all' && selectedClassId !== 'all_with_teachers' && st.classId !== selectedClassId) return;
        const stClass = classes.find(c => c.id === st.classId);
        list.push({
          id: st.id,
          fullName: st.fullName,
          passportOrId: st.passportOrId,
          birthDate: st.birthDate,
          assignedEmail: st.assignedEmail,
          assignedPassword: st.assignedPassword,
          status: st.status,
          certificateLink: st.certificateLink,
          hasError: st.hasError || st.status === 'error',
          isTeacher: false,
          badgeLabel: stClass?.name || 'Sinf',
          rawStudent: st,
        });
      });
    }

    // Add teachers if selectedClassId === 'all_with_teachers' or if user is searching or only_teachers
    if (selectedClassId === 'all_with_teachers' || selectedClassId === 'only_teachers' || searchQuery.trim().length > 0) {
      teacherCertificates.forEach(t => {
        list.push({
          id: t.id,
          fullName: t.fullName,
          passportOrId: t.passportOrId,
          birthDate: t.birthDate,
          assignedEmail: t.assignedEmail,
          assignedPassword: t.assignedPassword,
          status: t.status,
          certificateLink: t.certificateLink,
          hasError: t.hasError || t.status === 'error',
          isTeacher: true,
          badgeLabel: t.subject ? `Ustoz: ${t.subject}` : 'Ustoz',
          rawTeacher: t,
        });
      });
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return list.filter(item =>
        item.fullName.toLowerCase().includes(q) ||
        (item.passportOrId && item.passportOrId.toLowerCase().includes(q)) ||
        (item.assignedEmail && item.assignedEmail.toLowerCase().includes(q)) ||
        item.badgeLabel.toLowerCase().includes(q)
      );
    }

    return list;
  }, [students, teacherCertificates, classes, selectedClassId, searchQuery]);

  // Status toifasini aniqlash: 'certified' (Tayyor) | 'error' (Xatolik) | 'pending' (Kutilmoqda)
  const getItemStatusCategory = (item: UnifiedItem): StatusFilterType => {
    if (item.hasError || item.status === 'error') return 'error';
    if (item.status === 'certified') return 'certified';
    return 'pending';
  };

  // Statuslar bo'yicha aniq hisoblagich
  const statusCounts = useMemo(() => {
    let cert = 0;
    let err = 0;
    let pend = 0;
    unifiedList.forEach(item => {
      const cat = getItemStatusCategory(item);
      if (cat === 'certified') cert++;
      else if (cat === 'error') err++;
      else pend++;
    });
    return { certified: cert, error: err, pending: pend, total: unifiedList.length };
  }, [unifiedList]);

  // Ko'p tanlovli (multi-select) holat filtrlash va saralash mantiqi
  const filteredStudents = useMemo(() => {
    const list = unifiedList;

    // 1. Agar birontasi ham tanlanmagan bo'lsa (default):
    // Barcha o'quvchilar chiqadi (standart aralash tartibda)
    if (selectedStatusFilters.length === 0) {
      return list;
    }

    // 2. Agar bir vaqtning o'zida barcha 3 tasi tanlansa ('certified', 'error', 'pending'):
    // Hamma o'quvchilar chiqadi, lekin aniq KATEGORIYALANGAN tartibda:
    // 1-o'rinda: Tayyor bo'lganlar ('certified')
    // 2-o'rinda: Xatolik bo'lganlar ('error')
    // 3-o'rinda: Kutilayotganlar ('pending')
    if (selectedStatusFilters.length === 3) {
      const certList = list.filter(item => getItemStatusCategory(item) === 'certified');
      const errList = list.filter(item => getItemStatusCategory(item) === 'error');
      const pendList = list.filter(item => getItemStatusCategory(item) === 'pending');
      return [...certList, ...errList, ...pendList];
    }

    // 3. Agar 1 yoki 2 tasi tanlansa: faqat tanlangan holatlarga to'g'ri keladiganlar chiqadi
    return list.filter(item => selectedStatusFilters.includes(getItemStatusCategory(item)));
  }, [unifiedList, selectedStatusFilters]);

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

          {/* Quick Action Buttons & Today's Certificate Badge */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Bugun olingan sertifikatlar ixcham va ko'rinarli badge */}
            <div className="px-3.5 py-2 bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-emerald-500/10 border border-emerald-300 rounded-xl flex items-center gap-2.5 shadow-2xs">
              <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold shadow-xs flex-shrink-0">
                <Award className="w-4 h-4" />
              </div>
              <div className="leading-tight">
                <span className="text-[10px] text-emerald-700 font-bold uppercase tracking-wider block">Bugun olingan</span>
                <span className="text-xs font-black text-emerald-950 font-mono">
                  {todayCertificatesCount} <span className="text-[11px] font-semibold text-emerald-700">ta sertifikat</span>
                </span>
              </div>
            </div>

            <button
              onClick={() => onOpenBulkUploadModal()}
              className="px-3.5 py-2.5 bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold rounded-xl shadow-xs flex items-center gap-2 transition-colors cursor-pointer"
            >
              <Upload className="w-4 h-4 flex-shrink-0" />
              <span>Hujjat yuklash</span>
            </button>

            <button
              onClick={() => {
                setAllowDuplicateName(false);
                setIsAddingStudent(true);
              }}
              className="px-3.5 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold rounded-xl border border-emerald-300 flex items-center gap-2 transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4 text-emerald-700 flex-shrink-0" />
              <span>+ O'quvchi</span>
            </button>

            <button
              onClick={onOpenBulkEmailModal}
              className="px-3.5 py-2.5 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold rounded-xl border border-slate-300 shadow-xs flex items-center gap-2 transition-colors cursor-pointer"
            >
              <Mail className="w-4 h-4 text-blue-700 flex-shrink-0" />
              <span>Pochta zaxirasi</span>
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

      {/* Liquid Glass Navigation Tabs with jumping lens, jelly fluid stretch and 5s idle sleep */}
      <NavigationLiquidGlassTabs
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        teacherCertificatesCount={teacherCertificates?.length || 0}
        sessionsCount={sessions?.length || 0}
        hasBlockedSession={sessions.some(s => s.isBlocked)}
        telegramUsersCount={telegramUsers?.length || 0}
      />

      {/* TAB 1: Classes & Students */}
      {activeTab === 'classes' && (
        <div className="space-y-5">
          {/* Claude UI/UX Spec: Liquid Glass Class Selection Strip & Emergent Popover */}
          <ClassLiquidGlassStrip
            classes={classes}
            students={students}
            selectedClassId={selectedClassId}
            onSelectClass={(cid) => setSelectedClassId(cid)}
            onOpenBulkUploadModal={(cid) => onOpenBulkUploadModal(cid)}
            onOpenPaymentModal={(cg) => onOpenPaymentModal(cg)}
            onOpenTeacherMessageModal={(cg) => onOpenTeacherMessageModal(cg)}
            onOpenClassBatch={(cg) => handleOpenClassBatch(cg)}
            onEditClass={(cg) => setEditingClass(cg)}
            onDeleteClass={(cg) => {
              const cStudents = students.filter(s => s.classId === cg.id);
              setDeleteConfirmation({
                isOpen: true,
                type: 'class',
                id: cg.id,
                name: `${cg.name} sinfi`,
                subtitle: `${cg.teacherName} rahbarligidagi barcha ${cStudents.length} ta o'quvchi ham butunlay o'chiriladi.`
              });
            }}
          />

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

            <div className="flex flex-wrap items-center gap-2.5">
              {/* Sinf filtri */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-500 font-medium whitespace-nowrap">Sinf filtri:</span>
                <select
                  value={selectedClassId}
                  onChange={e => setSelectedClassId(e.target.value)}
                  className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-xs font-semibold focus:outline-none focus:bg-white focus:border-blue-700 cursor-pointer"
                >
                  <option value="all">Barcha sinflar ({totalStudents})</option>
                  <option value="all_with_teachers">🎓 Barcha sertifikatlar (O'quvchilar + Ustozlar: {totalStudents + totalTeachers})</option>
                  <option value="only_teachers">👨‍🏫 Faqat Ustozlar ({totalTeachers})</option>
                  {classes.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} sinfi ({c.teacherName})
                    </option>
                  ))}
                </select>
              </div>

              {/* Holat filtri: Yangi ixcham tugma & Dropdown panel (Tayyor / Xatolik / Kutilmoqda) */}
              <div className="relative" ref={statusDropdownRef}>
                <button
                  type="button"
                  onClick={() => setIsStatusDropdownOpen(prev => !prev)}
                  className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 border transition-all cursor-pointer ${
                    selectedStatusFilters.length > 0
                      ? 'bg-blue-50 border-blue-400 text-blue-900 shadow-2xs ring-1 ring-blue-300'
                      : 'bg-slate-50 border-slate-300 text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                  title="O'quvchilar holati bo'yicha saralash va filtrlash"
                >
                  <Filter className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                  <span className="text-slate-500 font-normal">Holat:</span>
                  <span className="font-bold">
                    {selectedStatusFilters.length === 0
                      ? 'Barchasi'
                      : selectedStatusFilters.length === 3
                      ? 'Kategoriyalangan (3 ta)'
                      : selectedStatusFilters
                          .map(s => (s === 'certified' ? 'Tayyor' : s === 'error' ? 'Xatolik' : 'Kutilmoqda'))
                          .join(' + ')}
                  </span>
                  {selectedStatusFilters.length > 0 && (
                    <span className="w-4 h-4 rounded-full bg-blue-600 text-white text-[10px] flex items-center justify-center font-bold">
                      {selectedStatusFilters.length}
                    </span>
                  )}
                  <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${isStatusDropdownOpen ? 'rotate-180 text-blue-600' : ''}`} />
                </button>

                {/* Dropdown panel */}
                {isStatusDropdownOpen && (
                  <div className="absolute right-0 top-full mt-2 w-72 z-50 bg-white border border-slate-200 rounded-2xl shadow-2xl p-3 space-y-2.5 animate-scale-up">
                    <div className="flex items-center justify-between pb-1.5 border-b border-slate-100 px-1">
                      <span className="text-[11px] font-bold text-slate-800 uppercase tracking-wider">
                        Holat Bo'yicha Tanlash
                      </span>
                      {selectedStatusFilters.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setSelectedStatusFilters([])}
                          className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                        >
                          Tozalash
                        </button>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      {/* Variant 1: Tayyor */}
                      <div
                        onClick={() => toggleStatusFilter('certified')}
                        className={`flex items-center justify-between p-2 rounded-xl text-xs cursor-pointer select-none transition-colors border ${
                          selectedStatusFilters.includes('certified')
                            ? 'bg-emerald-50 text-emerald-950 font-bold border-emerald-300 ring-1 ring-emerald-200'
                            : 'hover:bg-slate-50 text-slate-700 border-transparent'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={selectedStatusFilters.includes('certified')}
                            onChange={() => {}}
                            className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                          />
                          <span className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                            <span>Tayyor</span>
                          </span>
                        </div>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                          {statusCounts.certified} ta
                        </span>
                      </div>

                      {/* Variant 2: Xatolik */}
                      <div
                        onClick={() => toggleStatusFilter('error')}
                        className={`flex items-center justify-between p-2 rounded-xl text-xs cursor-pointer select-none transition-colors border ${
                          selectedStatusFilters.includes('error')
                            ? 'bg-rose-50 text-rose-950 font-bold border-rose-300 ring-1 ring-rose-200'
                            : 'hover:bg-slate-50 text-slate-700 border-transparent'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={selectedStatusFilters.includes('error')}
                            onChange={() => {}}
                            className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500 cursor-pointer"
                          />
                          <span className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
                            <span>Xatolik</span>
                          </span>
                        </div>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                          {statusCounts.error} ta
                        </span>
                      </div>

                      {/* Variant 3: Kutilmoqda */}
                      <div
                        onClick={() => toggleStatusFilter('pending')}
                        className={`flex items-center justify-between p-2 rounded-xl text-xs cursor-pointer select-none transition-colors border ${
                          selectedStatusFilters.includes('pending')
                            ? 'bg-amber-50 text-amber-950 font-bold border-amber-300 ring-1 ring-amber-200'
                            : 'hover:bg-slate-50 text-slate-700 border-transparent'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={selectedStatusFilters.includes('pending')}
                            onChange={() => {}}
                            className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 cursor-pointer"
                          />
                          <span className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span>
                            <span>Kutilmoqda</span>
                          </span>
                        </div>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                          {statusCounts.pending} ta
                        </span>
                      </div>
                    </div>

                    {/* Footer Actions */}
                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedStatusFilters(['certified', 'error', 'pending']);
                        }}
                        className="text-[11px] font-bold text-blue-700 hover:text-blue-900 hover:underline cursor-pointer"
                        title="Uchalasini tanlab 1. Tayyor, 2. Xatolik, 3. Kutilmoqda tartibida chiqarish"
                      >
                        Barchasini tanlash (Kategoriyalash)
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsStatusDropdownOpen(false)}
                        className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-semibold cursor-pointer"
                      >
                        Yopish
                      </button>
                    </div>

                    {/* Explanatory notes */}
                    {selectedStatusFilters.length === 3 ? (
                      <div className="p-2 rounded-xl bg-blue-50 border border-blue-200 text-[10px] text-blue-950 leading-relaxed font-medium">
                        ✨ <strong>Kategoriyalangan tartib faol:</strong> O'quvchilar aniq tartib bilan: birinchi <strong>Tayyor</strong>, keyin <strong>Xatolik</strong>, so'ngra <strong>Kutilayotganlar</strong> bo'lib guruhlanadi.
                      </div>
                    ) : selectedStatusFilters.length === 0 ? (
                      <div className="p-2 rounded-xl bg-slate-50 border border-slate-200 text-[10px] text-slate-600 leading-relaxed">
                        ℹ️ Hech biri tanlanmaganda: Barcha o'quvchilar odatiy (aralash) tartibda chiqadi.
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Students Table in High Contrast Clean White Style */}
          <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-xs">
            <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">O'quvchilar Ro'yxati</h3>
                <p className="text-xs text-slate-500">
                  <span className="text-blue-700 font-semibold">1 marta bosing</span> — nusxalash, <span className="text-blue-700 font-semibold">2 marta tez bosing</span> — tahrirlash
                </p>
              </div>
              <div className="flex items-center gap-2">
                {selectedStatusFilters.length === 3 && (
                  <span className="text-[10px] sm:text-[11px] px-2.5 py-1 rounded-lg bg-blue-100 text-blue-900 font-bold border border-blue-200 flex items-center gap-1.5 shadow-2xs">
                    <CheckCircle2 className="w-3.5 h-3.5 text-blue-700" />
                    <span>Tartib: 1. Tayyor ➔ 2. Xatolik ➔ 3. Kutilmoqda</span>
                  </span>
                )}
                {selectedStatusFilters.length > 0 && selectedStatusFilters.length < 3 && (
                  <span className="text-[10px] sm:text-[11px] px-2 py-0.5 rounded-lg bg-slate-200 text-slate-800 font-semibold border border-slate-300">
                    Holat: {selectedStatusFilters.map(s => (s === 'certified' ? 'Tayyor' : s === 'error' ? 'Xatolik' : 'Kutilmoqda')).join(', ')}
                  </span>
                )}
                <span className="text-xs text-slate-700 font-mono font-bold bg-white px-2.5 py-1 rounded-lg border border-slate-200 shadow-2xs">
                  {filteredStudents.length} nafar
                </span>
              </div>
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
                      const isCertified = st.status === 'certified';
                      const isError = st.hasError || st.status === 'error';

                      return (
                        <tr
                          key={st.id}
                          className={`hover:bg-slate-50/80 transition-colors select-none ${
                            isError ? 'bg-rose-50/40' : st.isTeacher ? 'bg-purple-50/25' : ''
                          }`}
                          onDoubleClick={() => {
                            if (st.isTeacher) {
                              setActiveTab('teachers');
                              showQuickToast(`Ustozlar bo'limiga o'tildi: ${st.fullName}`);
                            } else if (st.rawStudent) {
                              onOpenStudentModal(st.rawStudent);
                            }
                          }}
                        >
                          <td className="py-3 pl-5 pr-2 text-slate-400 font-medium">{idx + 1}</td>

                          {/* Full Name & Passport & Birth date */}
                          <td className="py-3 px-3 font-sans font-semibold text-slate-900">
                            <div className="flex items-center gap-2">
                              <span
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCopyField(st.fullName, st.isTeacher ? "Ustoz F.I.SH" : "O'quvchi F.I.SH");
                                }}
                                onDoubleClick={(e) => {
                                  e.stopPropagation();
                                  if (st.isTeacher) {
                                    setActiveTab('teachers');
                                  } else if (st.rawStudent) {
                                    onOpenStudentModal(st.rawStudent);
                                  }
                                }}
                                className="cursor-pointer hover:text-blue-700 hover:underline active:opacity-70 transition-all rounded px-1 -mx-1"
                                title="1 marta bosing - nusxalash"
                              >
                                {st.fullName}
                              </span>
                              {st.isTeacher && (
                                <span className="px-1.5 py-0.2 text-[9px] font-bold rounded bg-purple-100 text-purple-800 border border-purple-200 uppercase tracking-wider font-sans">
                                  USTOZ
                                </span>
                              )}
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
                                    if (st.rawStudent) onOpenStudentModal(st.rawStudent);
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
                            {st.isTeacher ? (
                              <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-800 text-[11px] font-bold border border-purple-200">
                                {st.badgeLabel}
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-800 text-[11px] font-semibold border border-slate-200">
                                {st.badgeLabel}
                              </span>
                            )}
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
                                  if (st.isTeacher) {
                                    setActiveTab('teachers');
                                  } else if (st.rawStudent) {
                                    onOpenStudentModal(st.rawStudent);
                                  }
                                }}
                                className="text-slate-800 font-mono text-[11px] cursor-pointer hover:text-blue-700 hover:underline active:opacity-70 transition-all rounded px-1 -mx-1 block"
                                title="1 marta bosing - nusxalash"
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
                                  if (st.isTeacher) {
                                    setActiveTab('teachers');
                                  } else if (st.rawStudent) {
                                    onOpenStudentModal(st.rawStudent);
                                  }
                                }}
                                className="px-2 py-0.5 text-[11px] font-sans font-semibold rounded bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 flex items-center gap-1 cursor-pointer"
                              >
                                <Clipboard className="w-3 h-3" />
                                <span>+ Havola</span>
                              </button>
                            )}
                          </td>

                          <td className="py-3 pr-5 pl-3 text-right">
                            {st.isTeacher ? (
                              <button
                                type="button"
                                onClick={e => {
                                  e.stopPropagation();
                                  setActiveTab('teachers');
                                }}
                                className="px-2.5 py-1 text-xs font-sans font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 rounded border border-purple-200 transition-colors cursor-pointer"
                              >
                                Ustozlar paneli
                              </button>
                            ) : (
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={e => {
                                    e.stopPropagation();
                                    if (st.rawStudent) onOpenStudentModal(st.rawStudent);
                                  }}
                                  className="px-2.5 py-1 text-xs font-sans font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded border border-slate-200 transition-colors cursor-pointer"
                                >
                                  Tahrirlash
                                </button>
                                <button
                                  type="button"
                                  onClick={e => {
                                    e.stopPropagation();
                                    if (st.rawStudent) {
                                      setDeleteConfirmation({
                                        isOpen: true,
                                        type: 'student',
                                        id: st.rawStudent.id,
                                        name: st.rawStudent.fullName,
                                        subtitle: `${st.badgeLabel} o'quvchisi ro'yxatdan butunlay o'chiriladi.`
                                      });
                                    }
                                  }}
                                  className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                                  title="O'quvchini o'chirish"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
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

      {/* TAB: Teacher Certificates Management */}
      {activeTab === 'teachers' && (
        <TeacherCertificatesTab
          teachers={teacherCertificates}
          emailPool={emailPool}
          onAddTeacher={onAddTeacher}
          onAddBatchTeachers={onAddBatchTeachers}
          onUpdateTeacher={onUpdateTeacher}
          onDeleteTeacher={onDeleteTeacher}
          onAssignEmailFromPool={onAssignTeacherEmail}
        />
      )}

      {/* TAB 2: Finance & Payments Matrix */}
      {activeTab === 'finance' && (
        <div className="space-y-5">
          {/* Executive Grand Total Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
              <span className="text-xs font-medium text-slate-500 block mb-1">
                Sinflar (O'quvchilar) Tushumi
              </span>
              <div className="text-xl font-bold text-slate-900">
                {totalPaidRevenue.toLocaleString()} <span className="text-xs font-normal text-slate-500">so'm</span>
              </div>
              <div className="text-xs text-amber-800 font-semibold mt-1">
                Qarz: {totalRemainingDebt.toLocaleString()} so'm
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
              <span className="text-xs font-medium text-purple-700 block mb-1">
                Ustozlar Tushumi ({teacherCertificates.length} nafar)
              </span>
              <div className="text-xl font-bold text-purple-900">
                {teachersPaid.toLocaleString()} <span className="text-xs font-normal text-purple-600">so'm</span>
              </div>
              <div className={`text-xs font-semibold mt-1 ${teachersDebt > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                {teachersDebt > 0 ? `Qarz: ${teachersDebt.toLocaleString()} so'm` : "Qarz yo'q (100% to'langan)"}
              </div>
            </div>

            <div className="bg-emerald-50/80 border border-emerald-200 rounded-2xl p-4 shadow-xs">
              <span className="text-xs font-medium text-emerald-800 block mb-1">
                Umumiy Jami Tushum (Maktab bo'yicha)
              </span>
              <div className="text-xl font-bold text-emerald-900">
                {grandTotalPaidRevenue.toLocaleString()} <span className="text-xs font-normal text-emerald-700">so'm</span>
              </div>
              <div className="text-xs text-slate-700 font-semibold mt-1">
                Jami Qolgan Qarz: <span className="text-rose-700 font-bold">{grandTotalRemainingDebt.toLocaleString()} so'm</span>
              </div>
            </div>
          </div>

          {/* Classes Table */}
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

          {/* Teachers Financial Table */}
          <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-xs">
            <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-700 flex items-center justify-center">
                  <GraduationCap className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm sm:text-base">
                    Ustozlar Bo'yicha To'lovlar va Qarzdorlik Hisoboti
                  </h3>
                  <p className="text-xs text-slate-500">
                    O'qituvchilarning Coursera sertifikatlari uchun to'lov holati va qarzlari.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setActiveTab('teachers')}
                className="px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Ustozlar bo'limiga o'tish →
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-100/75 text-slate-600 uppercase text-[11px] font-bold tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="py-3.5 pl-5 pr-3">Ustoz F.I.SH</th>
                    <th className="py-3.5 px-3">Fani</th>
                    <th className="py-3.5 px-3">Sertifikat</th>
                    <th className="py-3.5 px-3">Narxi</th>
                    <th className="py-3.5 px-3">To'langan Summa</th>
                    <th className="py-3.5 px-3">Qarzdorlik</th>
                    <th className="py-3.5 pr-5 pl-3 text-right">To'lov Holati</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {teacherCertificates.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400 font-sans">
                        Hozircha ustozlar kiritilmagan. "Ustozlar" bo'limi orqali yangi ustozlarni kiritishingiz mumkin.
                      </td>
                    </tr>
                  ) : (
                    teacherCertificates.map(t => {
                      const debt = (t.price || 5000) - (t.paidAmount || 0);
                      const isPaid = debt <= 0;

                      return (
                        <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                          <td className="py-3.5 pl-5 pr-3 font-bold text-slate-900 font-sans">
                            {t.fullName}
                          </td>
                          <td className="py-3.5 px-3 font-sans text-purple-700 font-semibold">
                            {t.subject || '—'}
                          </td>
                          <td className="py-3.5 px-3 font-sans">
                            {t.status === 'certified' ? (
                              <span className="text-emerald-700 font-bold">✓ Tayyor</span>
                            ) : t.status === 'error' ? (
                              <span className="text-rose-700 font-bold">✕ Xato</span>
                            ) : (
                              <span className="text-amber-700 font-medium">⏳ Kutilmoqda</span>
                            )}
                          </td>
                          <td className="py-3.5 px-3 font-semibold">
                            {(t.price || 5000).toLocaleString()} so'm
                          </td>
                          <td className="py-3.5 px-3 text-emerald-800 font-semibold">
                            {(t.paidAmount || 0).toLocaleString()} so'm
                          </td>
                          <td className="py-3.5 px-3">
                            {isPaid ? (
                              <span className="text-emerald-700 font-sans font-bold text-[11px]">
                                Qarz yo'q
                              </span>
                            ) : (
                              <span className="text-rose-700 font-bold">
                                {debt.toLocaleString()} so'm
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 pr-5 pl-3 text-right">
                            {isPaid ? (
                              <span className="inline-flex items-center gap-1 text-emerald-800 font-sans font-bold text-[11px] bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                <CheckCircle2 className="w-3.5 h-3.5" /> To'liq to'langan
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  onUpdateTeacher({
                                    ...t,
                                    paidAmount: t.price || 5000,
                                    paymentStatus: 'paid'
                                  });
                                  showQuickToast(`✅ ${t.fullName} uchun to'lov to'liq belgilandi`);
                                }}
                                className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-sans font-bold rounded-lg transition-colors cursor-pointer"
                              >
                                To'liq to'landi
                              </button>
                            )}
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
                {/* Button: Automatic Gmail Dot Trick Generator (1-3000 emails) */}
                <button
                  type="button"
                  onClick={() => setIsGmailGeneratorOpen(true)}
                  className="px-4 py-2 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 hover:from-amber-600 hover:to-orange-600 text-white text-xs font-bold rounded-xl flex items-center gap-2 transition-all cursor-pointer shadow-xs"
                  title="1 ta emaildan 3000 tagacha bo'sh nuqtali emaillarni avtomatik generatsiya qilish"
                >
                  <Zap className="w-4 h-4 text-yellow-200 fill-yellow-200" />
                  <span>Gmail Dot Generatsiya (1-3000 ta)</span>
                </button>

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
                    const cls = editingClass;
                    setEditingClass(null);
                    setDeleteConfirmation({
                      isOpen: true,
                      type: 'class',
                      id: cls.id,
                      name: `${cls.name} sinfi`,
                      subtitle: "Ushbu sinf va unga biriktirilgan barcha o'quvchilar ro'yxatdan butunlay o'chiriladi."
                    });
                  }}
                  className="text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 px-2.5 py-1.5 rounded-lg border border-rose-200 transition-colors cursor-pointer"
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

      {/* Gmail Dot Trick Generator Modal */}
      <GmailGeneratorModal
        isOpen={isGmailGeneratorOpen}
        onClose={() => setIsGmailGeneratorOpen(false)}
        existingPool={emailPool}
        students={students}
        onAddGeneratedEmails={async (newEmails) => {
          if (onAddGeneratedEmails) {
            await onAddGeneratedEmails(newEmails);
          } else {
            onApplyEmailDistribution(students, [...emailPool, ...newEmails]);
          }
          setQuickToast(`✅ ${newEmails.length} ta yangi bo'sh Gmail zaxiraga qo'shildi!`);
        }}
      />

      {/* Operator Speed Analytics & Predictions Modal */}
      <OperatorSpeedAnalyticsModal
        isOpen={isSpeedModalOpen}
        onClose={() => setIsSpeedModalOpen(false)}
        analysis={operatorAnalysis}
      />

      {/* Whole Class Batch Aileaders Registration Modal */}
      {isClassBatchModalOpen && batchTargetClass && (
        <ClassBatchAutomationModal
          isOpen={isClassBatchModalOpen}
          onClose={() => {
            setIsClassBatchModalOpen(false);
            setBatchTargetClass(null);
          }}
          classGroup={batchTargetClass}
          students={students}
          onUpdateStudent={async (st) => {
            if (onSaveStudent) {
              await onSaveStudent(st);
            } else {
              onAddSingleStudent(st);
            }
          }}
        />
      )}

      {/* In-App Delete Confirmation Modal (100% works inside iframe) */}
      {deleteConfirmation && deleteConfirmation.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-scale-up">
            <div className="flex items-start gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center flex-shrink-0 shadow-xs">
                <Trash2 className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-bold text-slate-900">
                  {deleteConfirmation.type === 'class' ? "Sinfni o'chirish" : "O'quvchini o'chirish"}
                </h3>
                <p className="text-sm text-slate-600 mt-1">
                  Haqiqatan ham <strong className="text-slate-900 font-semibold">{deleteConfirmation.name}</strong> ni butunlay o'chirib tashlamoqchimisiz?
                </p>
                {deleteConfirmation.subtitle && (
                  <p className="text-xs text-rose-600 font-medium mt-2 bg-rose-50/80 p-2.5 rounded-xl border border-rose-200">
                    ⚠️ {deleteConfirmation.subtitle}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDeleteConfirmation(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
              >
                Bekor qilish (ESC)
              </button>
              <button
                type="button"
                onClick={() => {
                  if (deleteConfirmation.type === 'class') {
                    onDeleteClass(deleteConfirmation.id);
                    showQuickToast(`🗑 ${deleteConfirmation.name} muvaffaqiyatli o'chirildi`);
                  } else {
                    onDeleteStudent(deleteConfirmation.id);
                    showQuickToast(`🗑 ${deleteConfirmation.name} ro'yxatdan o'chirildi`);
                  }
                  setDeleteConfirmation(null);
                }}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Ha, o'chirilsin</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
