import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { ClassGroup, Student, EmailAccount, TeacherSession, TeacherMessage, TelegramUser, TeacherCertificate, GraphicsTier } from '../types';
import { SessionsManagementTab } from './SessionsManagementTab';
import { TelegramBotTab } from './TelegramBotTab';
import { TeacherCertificatesTab } from './TeacherCertificatesTab';
import { GmailGeneratorModal } from './GmailGeneratorModal';
import { ClassBatchAutomationModal } from './ClassBatchAutomationModal';
import { ClassLiquidGlassStrip } from './ClassLiquidGlassStrip';
import { NavigationLiquidGlassTabs } from './NavigationLiquidGlassTabs';
import { AnimatedGlassSearchInput } from './AnimatedGlassSearchInput';
import { UnifiedGlassProvider } from '../context/UnifiedGlassContext';
import { VoiceAssistantWidget } from './VoiceAssistantWidget';
import { MetrikaAiScannerModal } from './MetrikaAiScannerModal';
import { ClassCertificateAuditSection } from './ClassCertificateAuditSection';
import { checkStudentConflicts, extractPassportDigits } from '../utils/studentValidator';
import { getStoredCertifyLogs, recordCertifyEvent } from '../utils/operatorSpeedTracker';
import { 
  generateStudentLogin, 
  formatMetrikaForCopy, 
  parseMetrikaComponents, 
  syncStudentForTrack, 
  getStudentTrackData,
  isDeveloperCertificate,
  isCourseraCertificate
} from '../utils/studentLoginHelper';
import { 
  Users, 
  Award, 
  Camera,
  AlertTriangle, 
  FileText,
  KeyRound,
  Settings, 
  Plus, 
  Mail, 
  Mic,
  RotateCcw,
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
  ChevronUp,
  X,
  AlertCircle,
  Calendar,
  FileSearch
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
  projectType?: 'ai' | 'developer';
  assignedLogin?: string;
  loginVariantIndex?: number;
  devRegistered?: boolean;
  devRegisteredAt?: string;
  classId?: string;
  rawStudent?: Student;
  rawTeacher?: TeacherCertificate;
}

interface AdminPanelProps {
  classes: ClassGroup[];
  students: Student[];
  emailPool: EmailAccount[];
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
  onToggleBlockDevice: (deviceId: string, block: boolean, reason?: string, matchingDeviceIds?: string[]) => void;
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
  onDeleteBatchTeachers?: (teacherIds: string[]) => void;
  onAssignTeacherEmail?: (teacherId: string) => void;
  onAssignBatchTeacherEmails?: (teacherIds: string[]) => void;
  onAddGeneratedEmails?: (newEmails: EmailAccount[]) => Promise<void> | void;
  onToggleStudentPayment?: (studentId: string, currentPaidState: boolean) => void;
  onSaveStudent?: (student: Student) => Promise<void> | void;
  onSaveBatchStudents?: (updatedStudents: Student[]) => Promise<void> | void;
  onSaveClassAndStudents?: (targetClass: ClassGroup, newStudents: Student[], updatedEmailPool: EmailAccount[]) => void;
  onUnlockExternalTeacher?: (deviceId: string) => void;
  auditTargetClass?: ClassGroup | null;
  onClearAuditTarget?: () => void;
  graphicsTier?: GraphicsTier;
  onOpenGraphicsSettings?: () => void;
  onSessionActivity?: (info: { action: string }) => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({
  classes,
  students,
  emailPool,
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
  onDeleteBatchTeachers,
  onAssignTeacherEmail,
  onAssignBatchTeacherEmails,
  onAddGeneratedEmails,
  onToggleStudentPayment,
  onSaveStudent,
  onSaveBatchStudents,
  onSaveClassAndStudents,
  onUnlockExternalTeacher,
  auditTargetClass,
  onClearAuditTarget,
  graphicsTier = 'medium',
  onOpenGraphicsSettings,
  onSessionActivity,
}) => {
  // Global Project Switcher: 'ai' (Bir million promter / Coursera — 5,000 UZS) vs 'developer' (Besh million sun'iy intellekt yetakchilari — 7,000 UZS)
  const [activeProject, setActiveProject] = useState<'ai' | 'developer'>(() => {
    try {
      return (localStorage.getItem('maktab_active_project') as 'ai' | 'developer') || 'ai';
    } catch {
      return 'ai';
    }
  });

  const defaultTierRowLimit = graphicsTier === 'lite' ? 40 : graphicsTier === 'medium' ? 60 : 80;

  const handleSelectProject = (proj: 'ai' | 'developer') => {
    setActiveProject(proj);
    setSelectedClassId('all');
    setRowLimit(defaultTierRowLimit);
    if (proj === 'ai') {
      setSelectedStatusFilters(prev => prev.filter(s => s !== 'registered'));
    }
    try {
      localStorage.setItem('maktab_active_project', proj);
    } catch {}
    showQuickToast(
      proj === 'developer'
        ? "💡 'Besh Million Sun'iy Intellekt Yetakchilari' (7 000 so'm) bo'limiga o'tildi"
        : "🚀 'Bir Million Promter (Coursera)' (5 000 so'm) bo'limiga o'tildi"
    );
  };

  // Import existing AI class into Developer track modal state
  const [isImportToDevModalOpen, setIsImportToDevModalOpen] = useState(false);
  const [selectedClassToImport, setSelectedClassToImport] = useState<ClassGroup | null>(null);
  const [importStep, setImportStep] = useState<'select' | 'confirm_login'>('select');

  // Liquid glass animation modal notification (requested by user for import and login notifications)
  const [liquidGlassNotification, setLiquidGlassNotification] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    subDetails?: string;
  } | null>(null);

  // Sequential clipboard copy status for Windows History (Win + V)
  const [winVNotice, setWinVNotice] = useState<{
    studentId: string;
    step: number;
    label: string;
    text: string;
  } | null>(null);

  const [activeTab, setActiveTab] = useState<'classes' | 'teachers' | 'finance' | 'emails' | 'sessions' | 'telegram'>('classes');
  const [selectedClassId, setSelectedClassId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isGmailGeneratorOpen, setIsGmailGeneratorOpen] = useState(false);
  const [isMetrikaScannerOpen, setIsMetrikaScannerOpen] = useState(false);
  const [isClassBatchModalOpen, setIsClassBatchModalOpen] = useState(false);
  const [batchTargetClass, setBatchTargetClass] = useState<ClassGroup | null>(null);
  const [isVoiceAssistantOpen, setIsVoiceAssistantOpen] = useState(false);

  // Multi-select status filter: 'certified' (Tayyor), 'registered' (Ro'yxatdan o'tganlar), 'error' (Xatolik), 'pending' (Kutilmoqda)
  type StatusFilterType = 'certified' | 'registered' | 'error' | 'pending';
  const [selectedStatusFilters, setSelectedStatusFilters] = useState<StatusFilterType[]>([]);
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
  const statusDropdownRef = useRef<HTMLDivElement>(null);

  // Table & Email pagination for crisp instant rendering & low RAM on large datasets
  const [rowLimit, setRowLimit] = useState<number>(defaultTierRowLimit);
  const [emailSearch, setEmailSearch] = useState('');
  const [emailLimit, setEmailLimit] = useState<number>(48);
  const [financeFilter, setFinanceFilter] = useState<'all' | 'unverified' | 'debt' | 'paid'>('all');

  // Track which students had their Metrika copied before copying Login (5M Ro'yxatdan o'tganlar workflow)
  const metrikaCopiedIdsRef = useRef<Set<string>>(new Set());
  const [metrikaPrimedId, setMetrikaPrimedId] = useState<string | null>(null);
  const markMetrikaCopied = useCallback((studentId?: string) => {
    if (!studentId) return;
    metrikaCopiedIdsRef.current.add(studentId);
    setMetrikaPrimedId(studentId);
  }, []);

  useEffect(() => {
    setRowLimit(defaultTierRowLimit);
  }, [selectedClassId, activeProject, searchQuery, selectedStatusFilters, defaultTierRowLimit]);

  const onSessionActivityRef = useRef(onSessionActivity);
  onSessionActivityRef.current = onSessionActivity;
  useEffect(() => {
    const tabNames: Record<string, string> = {
      classes: "Sinflar & O'quvchilar",
      teachers: "Ustozlar sertifikati",
      finance: "Moliya & To'lovlar",
      emails: "Email zaxirasi",
      sessions: "Faol seanslar monitoringi",
      telegram: "Telegram bot",
    };
    const projName = activeProject === 'developer' ? '5M AI' : '1M Promter';
    onSessionActivityRef.current?.({
      action: `Admin panelda: ${tabNames[activeTab] || activeTab} (${projName})`,
    });
  }, [activeTab, activeProject]);

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
  
  // Non-blocking quick toast without OK button
  const [quickToast, setQuickToast] = useState('');
  const quickToastTimerRef = useRef<NodeJS.Timeout | null>(null);
  const showQuickToast = (msg: string, duration: number = 2800) => {
    setQuickToast(msg);
    if (quickToastTimerRef.current) {
      clearTimeout(quickToastTimerRef.current);
    }
    quickToastTimerRef.current = setTimeout(() => {
      setQuickToast('');
      quickToastTimerRef.current = null;
    }, duration);
  };

  // Play pleasant acoustic chime sound on success
  const playChime = () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } catch {}
  };

  // Timer for single click vs double click on passport & delayed password copy
  const passportClickTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const delayedPasswordCopyTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pendingFocusPasswordRef = useRef<string | null>(null);

  useEffect(() => {
    const flushPendingPassword = async () => {
      const pending = pendingFocusPasswordRef.current;
      if (!pending) return;
      if (typeof document !== 'undefined' && !document.hasFocus()) return;
      try {
        await navigator.clipboard.writeText(pending);
        pendingFocusPasswordRef.current = null;
        showQuickToast(`🔑 Parol buferga nusxalandi: "${pending}"`, 3000);
      } catch {
        // Ignore if focus was lost immediately
      }
    };

    window.addEventListener('focus', flushPendingPassword);
    document.addEventListener('visibilitychange', flushPendingPassword);

    return () => {
      window.removeEventListener('focus', flushPendingPassword);
      document.removeEventListener('visibilitychange', flushPendingPassword);
      if (passportClickTimeoutRef.current) {
        clearTimeout(passportClickTimeoutRef.current);
      }
      if (quickToastTimerRef.current) {
        clearTimeout(quickToastTimerRef.current);
      }
      if (delayedPasswordCopyTimerRef.current) {
        clearTimeout(delayedPasswordCopyTimerRef.current);
      }
    };
  }, []);

  const handlePassportSingleClick = (st: { id?: string; passportOrId?: string }) => {
    if (passportClickTimeoutRef.current) {
      clearTimeout(passportClickTimeoutRef.current);
      passportClickTimeoutRef.current = null;
    }
    passportClickTimeoutRef.current = setTimeout(() => {
      const raw = st.passportOrId || '';
      const digits = extractPassportDigits(raw);
      if (digits) {
        navigator.clipboard.writeText(digits);
        if (st.id) markMetrikaCopied(st.id);
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

  // Sequential copy for Windows History (Win + V)
  const handleSequentialCopyForWinV = async (birthDate?: string, passportOrId?: string, studentId?: string) => {
    const m = parseMetrikaComponents(birthDate, passportOrId);
    if (!m.formattedDate && !m.number && !m.series) {
      showQuickToast("⚠️ Metrika yoki tug'ilgan sana kiritilmagan!");
      return;
    }
    if (studentId) {
      markMetrikaCopied(studentId);
    }

    try {
      // Step 1: Write Sana (earliest in history)
      if (m.formattedDate) {
        await navigator.clipboard.writeText(m.formattedDate);
        setWinVNotice({
          studentId: studentId || 'current',
          step: 1,
          label: "1/3: 📅 Tug'ilgan sana buferga yozildi",
          text: m.formattedDate,
        });
        await new Promise(r => setTimeout(r, 260));
      }

      // Step 2: Write Raqam (middle in history)
      if (m.number) {
        await navigator.clipboard.writeText(m.number);
        setWinVNotice({
          studentId: studentId || 'current',
          step: 2,
          label: "2/3: 🔢 Metrika raqami buferga yozildi",
          text: m.number,
        });
        await new Promise(r => setTimeout(r, 260));
      }

      // Step 3: Write Seriya (top of clipboard, immediately active for Ctrl+V)
      if (m.series) {
        await navigator.clipboard.writeText(m.series);
        setWinVNotice({
          studentId: studentId || 'current',
          step: 3,
          label: "3/3: 🔤 Metrika seriyasi (Ctrl+V) yozildi",
          text: m.series,
        });
        await new Promise(r => setTimeout(r, 200));
      }

      playChime();
      showQuickToast(`⚡ Win + V tayyor! 1-o'rinda: ${m.series || 'I-FR'} (Ctrl+V) ➔ 2: ${m.number} ➔ 3: ${m.formattedDate}`, 4500);

      setTimeout(() => {
        setWinVNotice(null);
      }, 3500);
    } catch {
      navigator.clipboard.writeText(m.combined);
      showQuickToast(`📋 Nusxalandi: "${m.combined}"`);
    }
  };

  // Execute import of AI class into Developer track
  const handleExecuteImportToDeveloper = async (withLogins: boolean) => {
    if (!selectedClassToImport) return;
    const targetClass = selectedClassToImport;
    const classStudents = students.filter(s => s.classId === targetClass.id);

    if (classStudents.length === 0) {
      showQuickToast("Ushbu sinfda o'quvchilar mavjud emas!");
      setIsImportToDevModalOpen(false);
      return;
    }

    const newClassId = `class-dev-${Date.now()}`;
    const newClass: ClassGroup = {
      id: newClassId,
      name: targetClass.name,
      teacherName: targetClass.teacherName,
      teacherPhone: targetClass.teacherPhone,
      projectType: 'developer',
      pricePerStudent: 7000,
      paidAmount: 0,
      isExternalSchool: targetClass.isExternalSchool,
      schoolName: targetClass.schoolName,
    };

    const clonedStudents: Student[] = classStudents.map((st, idx) => {
      const login = withLogins ? generateStudentLogin(st.fullName, 0) : undefined;
      return {
        id: `st-dev-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
        fullName: st.fullName.trim(),
        birthDate: st.birthDate?.trim() || undefined,
        passportOrId: st.passportOrId?.trim() || undefined,
        classId: newClassId,
        projectType: 'developer',
        status: 'pending',
        certificateLink: undefined,
        certifiedAt: undefined,
        hasError: false,
        errorReason: undefined,
        assignedLogin: login,
        loginVariantIndex: withLogins ? 0 : undefined,
        assignedPassword: withLogins ? 'MaktabPass2026!' : undefined,
        createdAt: new Date().toISOString(),
      };
    });

    if (onSaveClassAndStudents) {
      onSaveClassAndStudents(newClass, clonedStudents, emailPool);
    } else {
      onSaveClass(newClass);
      clonedStudents.forEach(cs => onAddSingleStudent(cs));
    }

    setSelectedClassId(newClassId);
    setIsImportToDevModalOpen(false);
    setSelectedClassToImport(null);
    setImportStep('select');
    playChime();

    // Trigger user's requested liquid glass animation notification banner
    setLiquidGlassNotification({
      isOpen: true,
      title: `✨ ${newClass.name} sinfi "Besh million sun'iy intellekt yetakchilari"ga import qilindi!`,
      message: `Jami ${clonedStudents.length} ta o'quvchi ma'lumotlari nusxalandi.`,
      subDetails: withLogins 
        ? `Barcha o'quvchilarga tizim qoidasi bo'yicha 'familya_ism' logini va 'MaktabPass2026!' paroli biriktirildi.`
        : `O'quvchilar loginlarsiz ko'chirildi. Istalgan payt barcha o'quvchilarga bitta tugma bilan login berishingiz mumkin.`
    });
  };

  // Direct, ultra-fast certificate paste with strict verification and resilient modal fallback
  const [isValidatingCert, setIsValidatingCert] = useState(false);
  const [fastPasteTarget, setFastPasteTarget] = useState<{
    student: Student;
    urlInput: string;
  } | null>(null);
  const fastPasteInputRef = useRef<HTMLInputElement>(null);

  // Validate and persist verified certificate
  const handleValidateAndSaveCertificate = async (targetStudent: Student, rawUrl: string): Promise<boolean> => {
    const clipText = (rawUrl || '').trim();
    if (!clipText) {
      showQuickToast("⚠️ Sertifikat havolasini kiriting", 3000);
      return false;
    }

    // 1. Strict URL check
    if (!clipText.startsWith('http://') && !clipText.startsWith('https://')) {
      showQuickToast("❌ Buferdagi matn havola (URL) emas! (https://...)", 3500);
      return false;
    }

    const studentClass = classMap.get(targetStudent.classId);
    const isDeveloperTrack = targetStudent.projectType === 'developer' || studentClass?.projectType === 'developer' || activeProject === 'developer';

    // 2. Strict track-based domain check
    if (isDeveloperTrack) {
      const isDev = isDeveloperCertificate(clipText);
      if (!isDev) {
        showQuickToast("❌ Bu 'Besh million sun'iy intellekt yetakchilari' sertifikati emas! Sertifikat https://omp.aistudy.uz/certificate?id=... yoki aistudy.uz shaklida bo'ladi.", 4500);
        return false;
      }
    } else {
      const isCoursera = isCourseraCertificate(clipText);
      if (!isCoursera) {
        showQuickToast("❌ Bu 'Bir million promter' (Coursera) rasmiy sertifikat havolasi emas! (https://coursera.org/verify/...)", 4000);
        return false;
      }
    }

    // 3. Duplicate check across all other students
    const existingDuplicate = students.find(s => 
      s.id !== targetStudent.id && 
      ((isDeveloperTrack && s.devCertificateLink && s.devCertificateLink.trim().toLowerCase() === clipText.toLowerCase()) ||
       (!isDeveloperTrack && s.aiCertificateLink && s.aiCertificateLink.trim().toLowerCase() === clipText.toLowerCase()) ||
       (s.certificateLink && s.certificateLink.trim().toLowerCase() === clipText.toLowerCase()))
    );
    if (existingDuplicate) {
      showQuickToast(`❌ Bu sertifikat havolasi allaqachon boshqa o'quvchiga (${existingDuplicate.fullName}) biriktirilgan!`, 4500);
      return false;
    }

    // 4. Server-side deep validation of certificate recipient name (only for Coursera)
    if (!isDeveloperTrack) {
      setIsValidatingCert(true);
      showQuickToast(`🔍 ${targetStudent.fullName} uchun Coursera sertifikati tekshirilmoqda...`, 2000);

      try {
        const res = await fetch('/api/coursera/validate-certificate-recipient', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: clipText,
            expectedFullName: targetStudent.fullName,
          }),
        });
        const data = await res.json();
        if (!data.valid) {
          showQuickToast(data.reason || "❌ Sertifikat tekshiruvdan o'tmadi!", 4500);
          setIsValidatingCert(false);
          return false;
        }
      } catch (e) {
        console.warn("Validation endpoint network error, falling back:", e);
      } finally {
        setIsValidatingCert(false);
      }
    }

    // 5. Save verified student with strict isolation
    const nowIso = new Date().toISOString();
    const todayDate = nowIso.split('T')[0];
    const updatedStudent: Student = {
      ...targetStudent,
      projectType: isDeveloperTrack ? 'developer' : 'ai',
      certificateLink: clipText,
      status: 'certified',
      hasError: false,
      errorReason: '',
      certifiedAt: nowIso,
      certificateDate: todayDate,
      ...(isDeveloperTrack ? {
        devCertificateLink: clipText,
        devStatus: 'certified',
        devCertifiedAt: nowIso,
        devCertificateDate: todayDate,
        devHasError: false,
        devErrorReason: '',
      } : {
        aiCertificateLink: clipText,
        aiStatus: 'certified',
        aiCertifiedAt: nowIso,
        aiCertificateDate: todayDate,
        aiHasError: false,
        aiErrorReason: '',
      })
    };

    if (onSaveStudent) {
      await onSaveStudent(updatedStudent);
    }
    recordCertifyEvent(targetStudent.id, targetStudent.fullName, updatedStudent.certifiedAt);
    playChime();
    showQuickToast(
      isDeveloperTrack
        ? `✅ ${targetStudent.fullName}ga Besh million sun'iy intellekt yetakchilari sertifikati biriktirildi va saqlandi!`
        : `✅ ${targetStudent.fullName}ga Bir million promter (Coursera) sertifikati biriktirildi va saqlandi!`,
      3500
    );
    setFastPasteTarget(null);
    return true;
  };

  const handleFastPasteCertificateForStudent = async (targetStudent: Student, explicitUrl?: string) => {
    const directUrl = (explicitUrl || '').trim();
    if (directUrl) {
      return await handleValidateAndSaveCertificate(targetStudent, directUrl);
    }

    // Attempt direct clipboard reading
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = (await navigator.clipboard.readText() || '').trim();
        const studentClass = classMap.get(targetStudent.classId);
        const isDevTrack = targetStudent.projectType === 'developer' || studentClass?.projectType === 'developer' || activeProject === 'developer';
        if (
          text &&
          (text.startsWith('http://') || text.startsWith('https://')) &&
          (isDevTrack ? isDeveloperCertificate(text) : isCourseraCertificate(text))
        ) {
          return await handleValidateAndSaveCertificate(targetStudent, text);
        }
      }
    } catch {
      // Normal when browser permissions policy blocks clipboard in iframe
    }

    // Always fallback smoothly to instant fast-paste modal with auto-focused input
    setFastPasteTarget({
      student: targetStudent,
      urlInput: '',
    });
  };

  // ESC key listener to close internal modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsAddingStudent(false);
        setEditingClass(null);
        setFastPasteTarget(null);
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
  const [dismissedNewConflicts, setDismissedNewConflicts] = useState<{ passport: boolean; certificate: boolean }>({
    passport: false,
    certificate: false,
  });

  // Class editing modal & Certificate Date Audit tab state
  const [editingClass, setEditingClass] = useState<ClassGroup | null>(null);
  const [classSettingsTab, setClassSettingsTab] = useState<'general' | 'audit'>('general');

  useEffect(() => {
    if (auditTargetClass) {
      setEditingClass(auditTargetClass);
      setClassSettingsTab('audit');
      onClearAuditTarget?.();
    }
  }, [auditTargetClass, onClearAuditTarget]);

  // Class & Student-by-class lookup maps for O(N+C) rendering
  const classMap = useMemo(() => new Map(classes.map(c => [c.id, c])), [classes]);
  const studentsByClassMap = useMemo(() => {
    const map = new Map<string, Student[]>();
    students.forEach(s => {
      const list = map.get(s.classId);
      if (list) list.push(s);
      else map.set(s.classId, [s]);
    });
    return map;
  }, [students]);

  const newStudentTargetTrack: 'ai' | 'developer' =
    classMap.get(newStudentClassId)?.projectType === 'developer' ? 'developer' : activeProject;

  // Real-time project-scoped conflict checks for single student being added
  const newStudentConflicts = useMemo(() => checkStudentConflicts(
    {
      fullName: newStudentName,
      passportOrId: newStudentPassport,
      certificateLink: newStudentCertLink,
    },
    students,
    classes,
    newStudentTargetTrack
  ), [newStudentName, newStudentPassport, newStudentCertLink, students, classes, newStudentTargetTrack]);

  // Copy helper for student table (no alert, smooth toast)
  const handleCopyField = (text: string, _label: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    showQuickToast(`📋 Nusxalandi: "${text}"`);
  };

  // Developer mode: Copy student login & automatically transition Metrika-copied student to "Ro'yxatdan o'tganlar"
  const handleDeveloperLoginCopy = useCallback((st: UnifiedItem) => {
    if (delayedPasswordCopyTimerRef.current) {
      clearTimeout(delayedPasswordCopyTimerRef.current);
      delayedPasswordCopyTimerRef.current = null;
    }
    pendingFocusPasswordRef.current = null;

    let login = st.assignedLogin;
    const passwordToCopy = st.assignedPassword || 'MaktabPass2026!';
    const wasMetrikaCopied = metrikaCopiedIdsRef.current.has(st.id);
    const shouldMarkRegistered = Boolean(wasMetrikaCopied && st.rawStudent && !st.rawStudent.devRegistered && st.status !== 'certified');

    if (!login || shouldMarkRegistered) {
      if (!login) {
        login = generateStudentLogin(st.fullName, 0);
      }
      if (st.rawStudent && onSaveStudent) {
        const updated: Student = {
          ...st.rawStudent,
          projectType: 'developer',
          assignedLogin: login,
          loginVariantIndex: st.rawStudent.loginVariantIndex ?? 0,
          assignedPassword: passwordToCopy,
          ...(shouldMarkRegistered
            ? {
                devRegistered: true,
                devRegisteredAt: new Date().toISOString(),
              }
            : {}),
        };
        onSaveStudent(updated);
      }
    }

    if (!login) login = generateStudentLogin(st.fullName, 0);
    navigator.clipboard.writeText(login).catch(() => {});

    if (shouldMarkRegistered) {
      metrikaCopiedIdsRef.current.delete(st.id);
      if (metrikaPrimedId === st.id) setMetrikaPrimedId(null);
      playChime();
      showQuickToast(
        `✅ Login nusxalandi: "${login}" — "Ro'yxatdan o'tganlar"ga o'tdi (3 soniyada parol nusxalanadi)`,
        3200
      );

      delayedPasswordCopyTimerRef.current = setTimeout(async () => {
        delayedPasswordCopyTimerRef.current = null;
        try {
          await navigator.clipboard.writeText(passwordToCopy);
          pendingFocusPasswordRef.current = null;
          showQuickToast(`🔑 Parol buferga nusxalandi: "${passwordToCopy}"`, 3000);
        } catch {
          // Chrome blocks clipboard writes when another browser tab is active (!document.hasFocus()).
          // Queue it so the instant focus returns (or fallback execCommand works), it copies automatically!
          pendingFocusPasswordRef.current = passwordToCopy;
          try {
            if (document.hasFocus()) {
              const ta = document.createElement('textarea');
              ta.value = passwordToCopy;
              ta.style.position = 'fixed';
              ta.style.opacity = '0';
              document.body.appendChild(ta);
              ta.select();
              const ok = document.execCommand('copy');
              document.body.removeChild(ta);
              if (ok) {
                pendingFocusPasswordRef.current = null;
                showQuickToast(`🔑 Parol buferga nusxalandi: "${passwordToCopy}"`, 3000);
              }
            }
          } catch {
            // Keep pendingFocusPasswordRef queued until focus returns
          }
        }
      }, 3000);
    } else {
      showQuickToast(`📋 Login nusxalandi: "${login}"`);
    }
  }, [onSaveStudent, metrikaPrimedId]);

  // Track-isolated paid amount helper
  const getClassTrackPaid = useCallback((c: ClassGroup, track: 'ai' | 'developer'): number => {
    if (track === 'developer') {
      return c.devPaidAmount ?? (c.id.startsWith('class-dev-') ? (c.paidAmount || 0) : 0);
    }
    return c.aiPaidAmount ?? (c.paidAmount || 0);
  }, []);

  // Visible classes filtered strictly by activeProject ('ai' vs 'developer')
  const visibleClasses = useMemo(() => {
    return classes.filter(c => activeProject === 'developer' ? c.projectType === 'developer' : c.projectType !== 'developer');
  }, [classes, activeProject]);

  const visibleClassIds = useMemo(() => new Set(visibleClasses.map(c => c.id)), [visibleClasses]);

  // Students belonging to current active project
  const activeProjectStudents = useMemo(() => {
    return students.filter(s => {
      const cg = classMap.get(s.classId);
      const isDev = cg?.projectType === 'developer' || s.projectType === 'developer';
      return activeProject === 'developer' ? isDev : !isDev;
    });
  }, [students, classMap, activeProject]);

  const totalActiveStudents = activeProjectStudents.length;

  // Student categorization by project with domain verification
  const aiCertifiedStudents = useMemo(() => {
    return students.filter(s => {
      const cg = classMap.get(s.classId);
      const isDev = cg?.projectType === 'developer' || s.projectType === 'developer';
      if (isDev) return false;
      const td = getStudentTrackData(s, 'ai');
      return td.status === 'certified';
    });
  }, [students, classMap]);

  const devCertifiedStudents = useMemo(() => {
    return students.filter(s => {
      const cg = classMap.get(s.classId);
      const isDev = cg?.projectType === 'developer' || s.projectType === 'developer';
      if (!isDev) return false;
      const td = getStudentTrackData(s, 'developer');
      return td.status === 'certified';
    });
  }, [students, classMap]);

  const aiCertifiedCount = aiCertifiedStudents.length;
  const devCertifiedCount = devCertifiedStudents.length;

  const currentProjectCertifiedCount = activeProject === 'developer' ? devCertifiedCount : aiCertifiedCount;
  const currentProjectCertifiedPercent = totalActiveStudents > 0 ? Math.round((currentProjectCertifiedCount / totalActiveStudents) * 100) : 0;

  // Potential revenue: AI = 5,000 UZS, Developer = 7,000 UZS
  const aiPotentialRevenue = aiCertifiedCount * 5000;
  const devPotentialRevenue = devCertifiedCount * 7000;
  const totalPotentialRevenue = aiPotentialRevenue + devPotentialRevenue;

  // Paid revenue breakdown strictly isolated by track
  const aiPaidRevenue = useMemo(() => {
    return classes
      .filter(c => (c.projectType || 'ai') === 'ai')
      .reduce((sum, c) => sum + getClassTrackPaid(c, 'ai'), 0);
  }, [classes, getClassTrackPaid]);

  const devPaidRevenue = useMemo(() => {
    return classes
      .filter(c => c.projectType === 'developer')
      .reduce((sum, c) => sum + getClassTrackPaid(c, 'developer'), 0);
  }, [classes, getClassTrackPaid]);

  const currentProjectPaidRevenue = activeProject === 'developer' ? devPaidRevenue : aiPaidRevenue;
  const currentProjectPotentialRevenue = activeProject === 'developer' ? devPotentialRevenue : aiPotentialRevenue;
  const currentProjectRemainingDebt = Math.max(0, currentProjectPotentialRevenue - currentProjectPaidRevenue);

  const totalPaidRevenue = aiPaidRevenue + devPaidRevenue;
  const totalRemainingDebt = Math.max(0, totalPotentialRevenue - totalPaidRevenue);
  const unusedEmails = emailPool.filter(e => !e.isUsed).length;
  const errorCount = activeProjectStudents.filter(s => {
    const td = getStudentTrackData(s, activeProject);
    return td.hasError || td.status === 'error';
  }).length;
  const studentsWithoutEmail = activeProjectStudents.filter(s => !s.assignedEmail || s.assignedEmail.trim() === '');
  const studentsWithoutLogin = activeProjectStudents.filter(s => !s.assignedLogin || s.assignedLogin.trim() === '');

  // Teacher statistics (for AI mode)
  const totalTeachers = teacherCertificates.length;
  const certifiedTeachers = teacherCertificates.filter(t => t.status === 'certified');
  const teachersRevenue = teacherCertificates.reduce((sum, t) => sum + (t.price || 5000), 0);
  const teachersPaid = teacherCertificates.reduce((sum, t) => sum + (t.paidAmount || 0), 0);
  const teachersDebt = Math.max(0, teachersRevenue - teachersPaid);

  // Grand totals across all certificates (Students + Teachers)
  const grandTotalCertified = (activeProject === 'developer' ? devCertifiedCount : aiCertifiedCount) + (activeProject === 'ai' ? certifiedTeachers.length : 0);
  const grandTotalPotentialRevenue = currentProjectPotentialRevenue + (activeProject === 'ai' ? teachersRevenue : 0);
  const grandTotalPaidRevenue = currentProjectPaidRevenue + (activeProject === 'ai' ? teachersPaid : 0);
  const grandTotalRemainingDebt = currentProjectRemainingDebt + (activeProject === 'ai' ? teachersDebt : 0);

  // Handle generating logins for all students in a class (Besh Million Dasturchi)
  const handleGenerateClassLogins = (cg: ClassGroup) => {
    const classStudents = students.filter(s => s.classId === cg.id);
    if (classStudents.length === 0) {
      showQuickToast("Ushbu sinfda o'quvchilar mavjud emas!");
      return;
    }

    let updatedCount = 0;
    classStudents.forEach(st => {
      const login = generateStudentLogin(st.fullName, 0);
      const updated: Student = {
        ...st,
        projectType: 'developer',
        assignedLogin: login,
        loginVariantIndex: 0,
        assignedPassword: st.assignedPassword || 'MaktabPass2026!',
      };
      if (onSaveStudent) {
        onSaveStudent(updated);
      }
      updatedCount++;
    });

    if (cg.projectType !== 'developer') {
      onSaveClass({
        ...cg,
        projectType: 'developer',
        pricePerStudent: 7000,
      });
    }

    playChime();
    setLiquidGlassNotification({
      isOpen: true,
      title: `✨ ${cg.name} sinfiga loginlar biriktirildi!`,
      message: `Barcha ${updatedCount} ta o'quvchiga 'familya_ism' logini va 'MaktabPass2026!' paroli muvaffaqiyatli berildi.`,
    });
  };

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

  // Bugun olingan sertifikatlar aniq miqdori (Strict Track Isolation)
  const todayCertificatesCount = useMemo(() => {
    if (activeProject === 'developer') {
      // ONLY developer certificates
      return students.filter(s => {
        const cg = classMap.get(s.classId);
        const isDev = cg?.projectType === 'developer' || s.projectType === 'developer';
        if (!isDev) return false;
        const td = getStudentTrackData(s, 'developer');
        if (td.status !== 'certified') return false;
        return isCertifiedTodayLocal(td.certifiedAt);
      }).length;
    } else {
      // AI Leaders & Coursera
      const studentCount = students.filter(s => {
        const cg = classMap.get(s.classId);
        const isDev = cg?.projectType === 'developer' || s.projectType === 'developer';
        if (isDev) return false;
        const td = getStudentTrackData(s, 'ai');
        if (td.status !== 'certified') return false;
        return isCertifiedTodayLocal(td.certifiedAt);
      }).length;

      const teacherCount = teacherCertificates.filter(t => {
        if (t.status !== 'certified') return false;
        return isCertifiedTodayLocal(t.certifiedAt);
      }).length;

      return studentCount + teacherCount;
    }
  }, [students, teacherCertificates, activeProject, classMap, isCertifiedTodayLocal]);

  // Unified list of people for the table (Students + Teachers when selected or searching)
  const unifiedList = useMemo(() => {
    const list: UnifiedItem[] = [];

    // Add students if not explicitly filtering only teachers
    if (selectedClassId !== 'only_teachers') {
      students.forEach(st => {
        const stClass = classMap.get(st.classId);
        const isDev = stClass?.projectType === 'developer' || st.projectType === 'developer';

        // Filter strictly by active project!
        if (activeProject === 'developer' && !isDev) return;
        if (activeProject === 'ai' && isDev) return;

        if (selectedClassId !== 'all' && selectedClassId !== 'all_with_teachers' && st.classId !== selectedClassId) return;

        const effectiveTrack: 'ai' | 'developer' = activeProject;
        const td = getStudentTrackData(st, effectiveTrack);
        list.push({
          id: st.id,
          fullName: st.fullName,
          passportOrId: st.passportOrId,
          birthDate: st.birthDate,
          assignedEmail: st.assignedEmail,
          assignedPassword: st.assignedPassword,
          status: td.status,
          certificateLink: td.certificateLink,
          hasError: td.hasError,
          isTeacher: false,
          badgeLabel: stClass?.name || 'Sinf',
          projectType: effectiveTrack,
          assignedLogin: st.assignedLogin,
          loginVariantIndex: st.loginVariantIndex,
          devRegistered: Boolean(st.devRegistered),
          devRegisteredAt: st.devRegisteredAt,
          classId: st.classId,
          rawStudent: st,
        });
      });
    }

    // Add teachers ONLY in AI mode if selectedClassId === 'all_with_teachers' or if user is searching or only_teachers
    if (activeProject === 'ai' && (selectedClassId === 'all_with_teachers' || selectedClassId === 'only_teachers' || searchQuery.trim().length > 0)) {
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
          projectType: 'ai',
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
        (item.assignedLogin && item.assignedLogin.toLowerCase().includes(q)) ||
        item.badgeLabel.toLowerCase().includes(q)
      );
    }

    return list;
  }, [students, teacherCertificates, classMap, selectedClassId, searchQuery, activeProject]);

  // Current selected class group and whether it is in developer mode
  const selectedClassGroup = useMemo(() => classMap.get(selectedClassId), [classMap, selectedClassId]);
  const isCurrentViewDeveloper = activeProject === 'developer';
  const isRegisteredFilterView =
    isCurrentViewDeveloper &&
    selectedStatusFilters.includes('registered') &&
    !selectedStatusFilters.includes('pending');

  // Status toifasini aniqlash: 'certified' | 'registered' | 'error' | 'pending'
  const getItemStatusCategory = useCallback((item: UnifiedItem): StatusFilterType => {
    if (item.hasError || item.status === 'error') return 'error';
    if (item.status === 'certified') return 'certified';
    if (activeProject === 'developer' && item.devRegistered) return 'registered';
    return 'pending';
  }, [activeProject]);

  // Statuslar bo'yicha aniq hisoblagich
  const statusCounts = useMemo(() => {
    let cert = 0;
    let reg = 0;
    let err = 0;
    let pend = 0;
    unifiedList.forEach(item => {
      const cat = getItemStatusCategory(item);
      if (cat === 'certified') cert++;
      else if (cat === 'registered') reg++;
      else if (cat === 'error') err++;
      else pend++;
    });
    return { certified: cert, registered: reg, error: err, pending: pend, total: unifiedList.length };
  }, [unifiedList, getItemStatusCategory]);

  // Ko'p tanlovli (multi-select) holat filtrlash va saralash mantiqi
  const allStatusKeys: StatusFilterType[] = useMemo(
    () => (activeProject === 'developer' ? ['certified', 'registered', 'error', 'pending'] : ['certified', 'error', 'pending']),
    [activeProject]
  );

  const filteredStudents = useMemo(() => {
    const list = unifiedList;

    if (selectedStatusFilters.length === 0) {
      return list;
    }

    if (selectedStatusFilters.length === allStatusKeys.length) {
      const certList = list.filter(item => getItemStatusCategory(item) === 'certified');
      const regList = list.filter(item => getItemStatusCategory(item) === 'registered');
      const errList = list.filter(item => getItemStatusCategory(item) === 'error');
      const pendList = list.filter(item => getItemStatusCategory(item) === 'pending');
      return [...certList, ...regList, ...errList, ...pendList];
    }

    return list.filter(item => selectedStatusFilters.includes(getItemStatusCategory(item)));
  }, [unifiedList, selectedStatusFilters, allStatusKeys.length, getItemStatusCategory]);

  const displayedStudents = useMemo(() => {
    return filteredStudents.slice(0, rowLimit);
  }, [filteredStudents, rowLimit]);

  // Alt + V: Fast Paste Certificate to the next pending student in active list
  const handleAltVPasteCertificate = useCallback(async () => {
    // Find first student who doesn't have a certificate yet in current filtered view, or overall
    const pendingStudent = filteredStudents.find(s => !s.isTeacher && s.status !== 'certified' && (!s.certificateLink || s.certificateLink.trim() === '')) ||
                           filteredStudents.find(s => !s.isTeacher && s.status !== 'certified') ||
                           students.find(s => s.status !== 'certified' && (!s.certificateLink || s.certificateLink.trim() === ''));

    if (!pendingStudent) {
      showQuickToast("🎉 Ro'yxatdagi barcha o'quvchilarga sertifikat olib bo'lingan!", 3000);
      return;
    }

    const target = 'rawStudent' in pendingStudent && pendingStudent.rawStudent
      ? pendingStudent.rawStudent
      : (pendingStudent as unknown as Student);

    await handleFastPasteCertificateForStudent(target);
  }, [filteredStudents, students]);

  // Alt + V global hotkey listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Alt + V (or Alt + v) hotkey for instant certificate paste to next student
      if (e.altKey && (e.key === 'v' || e.key === 'V' || e.code === 'KeyV')) {
        const activeTag = document.activeElement?.tagName?.toLowerCase();
        // If typing inside an input/textarea (other than our fast paste modal), ignore
        if (activeTag === 'textarea' || (activeTag === 'input' && document.activeElement !== fastPasteInputRef.current)) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        handleAltVPasteCertificate();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [handleAltVPasteCertificate]);

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

    if (newStudentConflicts.hasPassportConflict && !dismissedNewConflicts.passport) {
      showQuickToast("⚠️ Pasport takrorlanishi ogohlantirildi. Davom etish uchun ruxsat bering!");
      return;
    }

    if (newStudentConflicts.hasCertificateConflict && !dismissedNewConflicts.certificate) {
      showQuickToast("⚠️ Sertifikat havolasi takrorlanishi ogohlantirildi. Davom etish uchun ruxsat bering!");
      return;
    }

    if (newStudentConflicts.hasNameConflict && !allowDuplicateName) {
      showQuickToast("⚠️ Bu ismdagi o'quvchi mavjud! Iltimos, tasdiqlang.");
      return;
    }

    const isDevTarget = newStudentTargetTrack === 'developer';
    const newStudentId = `st-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    if (isDevTarget) {
      const login = generateStudentLogin(newStudentName.trim(), 0);
      const certUrl = newStudentCertLink.trim() || undefined;
      const newStudent: Student = {
        id: newStudentId,
        fullName: newStudentName.trim(),
        birthDate: newStudentBirthDate.trim() || undefined,
        passportOrId: newStudentPassport.trim().toUpperCase() || undefined,
        certificateLink: certUrl,
        devCertificateLink: certUrl,
        classId: newStudentClassId,
        projectType: 'developer',
        assignedLogin: login,
        loginVariantIndex: 0,
        assignedPassword: 'MaktabPass2026!',
        status: certUrl ? 'certified' : 'pending',
        devStatus: certUrl ? 'certified' : 'pending',
        ...(certUrl ? { certifiedAt: new Date().toISOString(), devCertifiedAt: new Date().toISOString() } : {}),
        createdAt: new Date().toISOString(),
      };
      onAddSingleStudent(newStudent);
      setIsAddingStudent(false);
      setNewStudentName('');
      setNewStudentBirthDate('');
      setNewStudentPassport('');
      setNewStudentCertLink('');
      setAllowDuplicateName(false);
      setDismissedNewConflicts({ passport: false, certificate: false });
      showQuickToast(`✅ O'quvchi qo'shildi! Login: ${login}`);
      return;
    }

    // AI Track: Allocate truly unused, unassigned email
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

    const certUrl = newStudentCertLink.trim() || undefined;
    const newStudent: Student = {
      id: newStudentId,
      fullName: newStudentName.trim(),
      birthDate: newStudentBirthDate.trim() || undefined,
      passportOrId: newStudentPassport.trim().toUpperCase() || undefined,
      certificateLink: certUrl,
      aiCertificateLink: certUrl,
      classId: newStudentClassId,
      projectType: 'ai',
      assignedEmail: freeEmail ? freeEmail.email : undefined,
      assignedPassword: freeEmail ? (freeEmail.password || 'MaktabPass2026!') : undefined,
      status: certUrl ? 'certified' : 'pending',
      aiStatus: certUrl ? 'certified' : 'pending',
      ...(certUrl ? { certifiedAt: new Date().toISOString(), aiCertifiedAt: new Date().toISOString() } : {}),
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
    setDismissedNewConflicts({ passport: false, certificate: false });
    showQuickToast(
      freeEmail 
        ? `✅ O'quvchi qo'shildi! Noyob email: ${freeEmail.email}` 
        : `✅ O'quvchi qo'shildi (zaxirada bo'sh email yo'qligi sababli email kiritilmadi)`
    );
  };

  const handleSaveClassEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClass) return;

    const prevClass = classMap.get(editingClass.id);
    const prevTrack: 'ai' | 'developer' = prevClass?.projectType === 'developer' ? 'developer' : 'ai';
    const targetTrack: 'ai' | 'developer' = editingClass.projectType === 'developer' ? 'developer' : 'ai';
    const preservedAiPaid = prevTrack === 'ai'
      ? (prevClass?.aiPaidAmount ?? prevClass?.paidAmount ?? 0)
      : (editingClass.aiPaidAmount ?? 0);
    const preservedDevPaid = prevTrack === 'developer'
      ? (prevClass?.devPaidAmount ?? prevClass?.paidAmount ?? 0)
      : (editingClass.devPaidAmount ?? 0);

    const updatedClassToSave: ClassGroup = {
      ...editingClass,
      pricePerStudent: targetTrack === 'developer' ? 7000 : 5000,
      aiPaidAmount: preservedAiPaid,
      devPaidAmount: preservedDevPaid,
      paidAmount: targetTrack === 'developer' ? preservedDevPaid : preservedAiPaid,
    };

    onSaveClass(updatedClassToSave);

    const classStudents = students.filter(s => s.classId === editingClass.id);

    // Synchronize all students in this class cleanly to the target track without data loss
    classStudents.forEach(st => {
      const synced = syncStudentForTrack(st, targetTrack);
      if (onSaveStudent) {
        onSaveStudent(synced);
      }
    });

    setEditingClass(null);
    showQuickToast(
      targetTrack === 'developer'
        ? `✅ ${editingClass.name} sinfi "Besh million sun'iy intellekt yetakchilari (7 000 so'm)" yo'nalishiga o'tkazildi va loginlar biriktirildi!`
        : `✅ ${editingClass.name} sinfi "Bir million promter (5 000 so'm)" yo'nalishiga o'tkazildi!`
    );
  };

  return (
    <UnifiedGlassProvider enabled={graphicsTier === 'ultra' || graphicsTier === 'high'}>
      <div className="space-y-6 animate-fade-in pb-12">
      
      {/* Floating Quick Toast Alert without OK button */}
      {quickToast && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-slate-900/95 backdrop-blur-md text-white rounded-2xl text-xs font-semibold shadow-2xl flex items-center gap-2 border border-slate-700 animate-scale-up">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{quickToast}</span>
        </div>
      )}

      {/* 🌟 GLOBAL PROJECT SWITCHER (Liquid Glass Segmented Bar) */}
      <div className="bg-white/90 backdrop-blur-md border border-slate-200/90 rounded-2xl p-2 sm:p-2.5 shadow-sm relative overflow-hidden">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 pl-2">
            <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-blue-600" />
              <span>Faol Loyiha / Yo'nalish:</span>
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 flex-1 sm:max-w-2xl">
            {/* Button 1: Sun'iy Intellekt */}
            <button
              type="button"
              onClick={() => handleSelectProject('ai')}
              className={`relative px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-between gap-2 cursor-pointer ${
                activeProject === 'ai'
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/25 ring-2 ring-blue-400/40'
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-base">🚀</span>
                <div className="text-left leading-tight">
                  <div className="font-extrabold">Bir Million Promter</div>
                  <div className={`text-[10px] font-normal ${activeProject === 'ai' ? 'text-blue-100' : 'text-slate-500'}`}>
                    AI Leaders & Coursera • 5 000 so'm
                  </div>
                </div>
              </div>
              <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                activeProject === 'ai' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
              }`}>
                {classes.filter(c => c.projectType !== 'developer').length} sinf • {aiCertifiedCount} ta
              </span>
            </button>

            {/* Button 2: Besh Million Sun'iy Intellekt Yetakchilari */}
            <button
              type="button"
              onClick={() => handleSelectProject('developer')}
              className={`relative px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-between gap-2 cursor-pointer ${
                activeProject === 'developer'
                  ? 'bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 text-white shadow-md shadow-purple-500/25 ring-2 ring-purple-400/40'
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-base">💡</span>
                <div className="text-left leading-tight">
                  <div className="font-extrabold">Besh Million AI Yetakchilari</div>
                  <div className={`text-[10px] font-normal ${activeProject === 'developer' ? 'text-purple-100' : 'text-slate-500'}`}>
                    omp.aistudy.uz • 7 000 so'm
                  </div>
                </div>
              </div>
              <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                activeProject === 'developer' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
              }`}>
                {classes.filter(c => c.projectType === 'developer').length} sinf • {devCertifiedCount} ta
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Executive Header Banner */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-6 shadow-xs relative overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className={`px-2.5 py-0.5 rounded text-[11px] font-bold tracking-wide uppercase border ${
                activeProject === 'developer'
                  ? 'bg-purple-50 text-purple-800 border-purple-200'
                  : 'bg-blue-50 text-blue-800 border-blue-200'
              }`}>
                {activeProject === 'developer' ? '💡 5M SUN\'IY INTELLEKT YETAKCHILARI' : '🚀 BIR MILLION PROMTER'}
              </span>
              <span className="text-xs text-slate-500 font-medium">
                {activeProject === 'developer' ? 'omp.aistudy.uz tizimi' : 'Boshqaruv va Monitoring'}
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              {activeProject === 'developer' 
                ? "Besh Million Sun'iy Intellekt Yetakchilari — Sertifikat & O'quvchilar Boshqaruvi"
                : "Bir Million Promter — Maktab Sertifikat & O'quvchilar Bazasini Boshqarish"}
            </h1>
            <p className="text-xs text-slate-500 max-w-2xl leading-relaxed">
              {activeProject === 'developer'
                ? "Metrika ma'lumotlari (Sana, Raqam, Seriya) Win+V nusxalash, 'familya_ism' loginlari va 5M AI Yetakchilari sertifikatlari (7 000 so'm)."
                : "O'quvchilar reestri, email zaxirasini taqsimlash, Coursera sertifikatlari (5 000 so'm) va sinflar to'lov monitoringi."}
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

            {/* Dasturchi bo'limida maxsus "Mavjud sinfni Dasturchiga import qilish" tugmasi */}
            {activeProject === 'developer' && (
              <button
                type="button"
                onClick={() => {
                  setSelectedClassToImport(null);
                  setImportStep('select');
                  setIsImportToDevModalOpen(true);
                }}
                className="px-3.5 py-2.5 bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-700 hover:to-indigo-800 text-white text-xs font-bold rounded-xl shadow-xs flex items-center gap-2 transition-all cursor-pointer ring-1 ring-purple-400/40"
                title="Bir million promter bo'limidagi mavjud sinf o'quvchilarini pasport/metrika ma'lumotlari bilan ushbu bo'limga import qilish"
              >
                <Upload className="w-4 h-4 flex-shrink-0" />
                <span>📥 Mavjud sinfni 5M AI Yetakchiga import qilish</span>
              </button>
            )}

            <button
              onClick={() => setIsMetrikaScannerOpen(true)}
              className="px-3.5 py-2.5 bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-700 hover:to-indigo-800 text-white text-xs font-bold rounded-xl shadow-xs flex items-center gap-2 transition-all cursor-pointer ring-1 ring-purple-400/30"
              title="Metrika va tug'ilganlik guvohnomalari suratlaridan avtomatik sinf tuzish (Gemini Flash Vision)"
            >
              <Camera className="w-4 h-4 flex-shrink-0" />
              <span>📸 Metrikalarni skanerlash (AI)</span>
            </button>

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
                setDismissedNewConflicts({ passport: false, certificate: false });
                const defaultCls =
                  (selectedClassId !== 'all' && selectedClassId !== 'all_with_teachers' && selectedClassId !== 'only_teachers'
                    ? visibleClasses.find(c => c.id === selectedClassId)?.id
                    : undefined) ||
                  visibleClasses[0]?.id ||
                  classes[0]?.id ||
                  '';
                setNewStudentClassId(defaultCls);
                setIsAddingStudent(true);
              }}
              className="px-3.5 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold rounded-xl border border-emerald-300 flex items-center gap-2 transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4 text-emerald-700 flex-shrink-0" />
              <span>+ O'quvchi</span>
            </button>

            {activeProject === 'ai' && (
              <button
                onClick={onOpenBulkEmailModal}
                className="px-3.5 py-2.5 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold rounded-xl border border-slate-300 shadow-xs flex items-center gap-2 transition-colors cursor-pointer"
              >
                <Mail className="w-4 h-4 text-blue-700 flex-shrink-0" />
                <span>Pochta zaxirasi</span>
              </button>
            )}

            {onOpenGraphicsSettings && (
              <button
                type="button"
                onClick={onOpenGraphicsSettings}
                className={`px-3.5 py-2.5 text-xs font-semibold rounded-xl border shadow-xs flex items-center gap-2 transition-colors cursor-pointer ${
                  graphicsTier === 'ultra'
                    ? 'bg-purple-600 hover:bg-purple-700 text-white border-purple-600'
                    : graphicsTier === 'high'
                    ? 'bg-sky-600 hover:bg-sky-700 text-white border-sky-600'
                    : graphicsTier === 'lite'
                    ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300'
                    : 'bg-white hover:bg-slate-50 text-slate-800 border-slate-300'
                }`}
                title="Grafika va animatsiya kuchini sozlash (Yengil / O'rtacha / Yuqori / Ultra)"
              >
                <Settings className="w-4 h-4 flex-shrink-0" />
                <span>
                  Grafika:{' '}
                  {graphicsTier === 'ultra'
                    ? 'Ultra'
                    : graphicsTier === 'high'
                    ? 'Yuqori'
                    : graphicsTier === 'lite'
                    ? 'Yengil'
                    : "O'rtacha"}
                </span>
              </button>
            )}

            <button
              onClick={() => setIsVoiceAssistantOpen(prev => !prev)}
              className={`px-3.5 py-2.5 text-xs font-semibold rounded-xl border shadow-xs flex items-center gap-2 transition-colors cursor-pointer ${
                isVoiceAssistantOpen
                  ? 'bg-amber-500/15 border-amber-400 text-amber-900 ring-1 ring-amber-300'
                  : 'bg-white hover:bg-slate-50 text-slate-800 border-slate-300'
              }`}
              title="Ovozli boshqaruv yordamchisini ochish / yopish"
            >
              <Mic className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <span>Ovozli yordamchi</span>
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

      {/* 4 Key Executive Performance Metrics (strictly isolated by activeProject) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Total students */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4.5 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1.5">
            <span className="text-xs font-medium">Jami O'quvchilar</span>
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
              activeProject === 'developer' ? 'bg-purple-50 text-purple-700' : 'bg-blue-50 text-blue-700'
            }`}>
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900">{totalActiveStudents} <span className="text-xs text-slate-500 font-normal">nafar</span></div>
          <div className="text-xs text-slate-500 mt-1">{visibleClasses.length} ta sinf bo'yicha</div>
        </div>

        {/* Total Certified */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4.5 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1.5">
            <span className="text-xs font-medium">Sertifikat Olganlar</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <Award className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-emerald-800">{currentProjectCertifiedCount} <span className="text-xs text-emerald-700 font-normal">nafar</span></div>

          <div className="text-xs text-slate-500 mt-1">
            {activeProject === 'developer' ? 'omp.aistudy.uz orqali (7 000 so\'m)' : 'Coursera orqali (5 000 so\'m)'}
          </div>

          <div className="flex items-center gap-2 mt-2">
            <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div 
                className="h-full bg-emerald-600 rounded-full transition-all duration-500" 
                style={{ width: `${currentProjectCertifiedPercent}%` }}
              />
            </div>
            <span className="text-[11px] font-semibold text-emerald-700">{currentProjectCertifiedPercent}%</span>
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
            {currentProjectPaidRevenue.toLocaleString('uz-UZ')} <span className="text-xs text-slate-500 font-normal">so'm</span>
          </div>
          <div className="text-xs text-amber-800 font-medium mt-1">
            Qarz: {currentProjectRemainingDebt.toLocaleString('uz-UZ')} so'm
          </div>
          <div className="text-[10px] text-slate-400 mt-1">
            Kutilayotgan tushum: {currentProjectPotentialRevenue.toLocaleString('uz-UZ')} so'm
          </div>
        </div>

        {/* Login or Email status */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4.5 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1.5">
            <span className="text-xs font-medium">
              {activeProject === 'developer' ? "Loginlar Holati" : "Zaxira Emaillar"}
            </span>
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
              activeProject === 'developer' ? 'bg-purple-50 text-purple-700' : 'bg-blue-50 text-blue-700'
            }`}>
              {activeProject === 'developer' ? <KeyRound className="w-4 h-4" /> : <Database className="w-4 h-4" />}
            </div>
          </div>
          {activeProject === 'developer' ? (
            <>
              <div className="text-2xl font-bold text-purple-800">
                {totalActiveStudents - studentsWithoutLogin.length} <span className="text-xs text-purple-700 font-normal">logini bor</span>
              </div>
              <div className="text-xs text-slate-500 mt-1">
                {studentsWithoutLogin.length > 0 ? (
                  <span className="text-amber-700 font-semibold">{studentsWithoutLogin.length} ta o'quvchida login yo'q</span>
                ) : (
                  <span className="text-emerald-700 font-semibold">Barcha o'quvchilarda login bor</span>
                )}
              </div>
            </>
          ) : (
            <>
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
            </>
          )}
        </div>
      </div>

      {/* Liquid Glass Navigation Tabs with jumping lens, jelly fluid stretch and 5s idle sleep */}
      <NavigationLiquidGlassTabs
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        teacherCertificatesCount={activeProject === 'ai' ? (teacherCertificates?.length || 0) : 0}
        telegramUsersCount={telegramUsers?.length || 0}
        graphicsTier={graphicsTier}
      />

      {/* TAB 1: Classes & Students */}
      {activeTab === 'classes' && (
        <div className="space-y-5">
          {/* If Developer view has 0 classes: render clean welcoming liquid glass import prompt */}
          {activeProject === 'developer' && visibleClasses.length === 0 ? (
            <div className="bg-gradient-to-br from-purple-500/10 via-white to-indigo-500/10 border-2 border-dashed border-purple-300 rounded-3xl p-8 text-center space-y-4 shadow-xs backdrop-blur-md">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-white flex items-center justify-center mx-auto shadow-lg shadow-purple-500/25">
                <School className="w-8 h-8" />
              </div>
              <div className="max-w-md mx-auto space-y-1.5">
                <h3 className="text-lg font-bold text-slate-900 tracking-tight">
                  "Besh Million Sun'iy Intellekt Yetakchilari" bo'limida hali sinflar yo'q
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  "Bir million promter" (Coursera) bo'limidagi mavjud sinfni o'quvchilarining pasport va tug'ilgan sana ma'lumotlari bilan ushbu bo'limga to'g'ridan-to'g'ri import qilishingiz mumkin.
                </p>
              </div>
              <div className="pt-2 flex justify-center">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedClassToImport(null);
                    setImportStep('select');
                    setIsImportToDevModalOpen(true);
                  }}
                  className="px-5 py-3 rounded-2xl bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-700 hover:to-indigo-800 text-white text-xs font-bold shadow-lg shadow-purple-600/30 flex items-center gap-2.5 transition-all cursor-pointer transform hover:scale-[1.02] active:scale-[0.98]"
                >
                  <Upload className="w-4 h-4" />
                  <span>📥 Mavjud sinfni 5M AI Yetakchiga import qilish</span>
                </button>
              </div>
            </div>
          ) : (
            <ClassLiquidGlassStrip
              classes={visibleClasses}
              students={activeProjectStudents}
              selectedClassId={selectedClassId}
              graphicsTier={graphicsTier}
              onSelectClass={(cid) => setSelectedClassId(cid)}
              onOpenBulkUploadModal={(cid) => onOpenBulkUploadModal(cid)}
              onOpenPaymentModal={(cg) => onOpenPaymentModal(cg)}
              onOpenTeacherMessageModal={(cg) => onOpenTeacherMessageModal(cg)}
              onOpenClassBatch={(cg) => handleOpenClassBatch(cg)}
              onGenerateClassLogins={(cg) => handleGenerateClassLogins(cg)}
              onEditClass={(cg) => {
                setEditingClass(cg);
                setClassSettingsTab('general');
              }}
              onDeleteClass={(cg) => {
                const cStudents = studentsByClassMap.get(cg.id) || [];
                setDeleteConfirmation({
                  isOpen: true,
                  type: 'class',
                  id: cg.id,
                  name: `${cg.name} sinfi`,
                  subtitle: `${cg.teacherName} rahbarligidagi barcha ${cStudents.length} ta o'quvchi ham butunlay o'chiriladi.`
                });
              }}
            />
          )}

          {/* Search & Filter Bar with Samsung Keyboard Glass Letter Popups */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            <AnimatedGlassSearchInput
              value={searchQuery}
              onChange={setSearchQuery}
              enableKeyPop={graphicsTier === 'ultra' || graphicsTier === 'high'}
              placeholder="O'quvchini ismi, pasporti yoki emaili orqali qidirish..."
            />

            <div className="flex flex-wrap items-center gap-2.5">
              {/* Sinf filtri */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-500 font-medium whitespace-nowrap">Sinf filtri:</span>
                <select
                  value={selectedClassId}
                  onChange={e => setSelectedClassId(e.target.value)}
                  className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-xs font-semibold focus:outline-none focus:bg-white focus:border-blue-700 cursor-pointer"
                >
                  <option value="all">Barcha sinflar ({totalActiveStudents})</option>
                  {activeProject === 'ai' && (
                    <>
                      <option value="all_with_teachers">🎓 Barcha sertifikatlar (O'quvchilar + Ustozlar: {totalActiveStudents + totalTeachers})</option>
                      <option value="only_teachers">👨‍🏫 Faqat Ustozlar ({totalTeachers})</option>
                    </>
                  )}
                  {visibleClasses.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.isExternalSchool ? `[bm] ` : ''}{c.name} sinfi ({c.teacherName}){c.isExternalSchool && c.schoolName ? ` — ${c.schoolName}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Holat filtri: Tayyor / Ro'yxatdan o'tganlar (5M) / Xatolik / Kutilmoqda */}
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
                      : selectedStatusFilters.length === allStatusKeys.length
                      ? `Kategoriyalangan (${allStatusKeys.length} ta)`
                      : selectedStatusFilters
                          .map(s =>
                            s === 'certified'
                              ? 'Tayyor'
                              : s === 'registered'
                              ? "Ro'yxatdan o'tganlar"
                              : s === 'error'
                              ? 'Xatolik'
                              : 'Kutilmoqda'
                          )
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
                  <div className="absolute right-0 top-full mt-2 w-76 z-50 bg-white border border-slate-200 rounded-2xl shadow-2xl p-3 space-y-2.5 animate-scale-up">
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

                      {/* Variant 2: Ro'yxatdan o'tganlar (Only in Developer 5M track) */}
                      {activeProject === 'developer' && (
                        <div
                          onClick={() => toggleStatusFilter('registered')}
                          className={`flex items-center justify-between p-2 rounded-xl text-xs cursor-pointer select-none transition-colors border ${
                            selectedStatusFilters.includes('registered')
                              ? 'bg-indigo-50 text-indigo-950 font-bold border-indigo-300 ring-1 ring-indigo-200'
                              : 'hover:bg-slate-50 text-slate-700 border-transparent'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={selectedStatusFilters.includes('registered')}
                              onChange={() => {}}
                              className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                            />
                            <span className="flex items-center gap-1.5">
                              <span className="w-2.5 h-2.5 rounded-full bg-indigo-500"></span>
                              <span>Ro'yxatdan o'tganlar</span>
                            </span>
                          </div>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                            {statusCounts.registered} ta
                          </span>
                        </div>
                      )}

                      {/* Variant 3: Xatolik */}
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

                      {/* Variant 4: Kutilmoqda */}
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
                          setSelectedStatusFilters(allStatusKeys);
                        }}
                        className="text-[11px] font-bold text-blue-700 hover:text-blue-900 hover:underline cursor-pointer"
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
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Quick Status Filter Tabs above table (1-click switching including Ro'yxatdan o'tganlar) */}
          <div className="flex flex-wrap items-center gap-1.5 px-1">
            <button
              type="button"
              onClick={() => setSelectedStatusFilters([])}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                selectedStatusFilters.length === 0
                  ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              Barchasi ({statusCounts.total})
            </button>
            <button
              type="button"
              onClick={() => setSelectedStatusFilters(['pending'])}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                selectedStatusFilters.length === 1 && selectedStatusFilters[0] === 'pending'
                  ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                  : 'bg-white text-amber-800 border-amber-200 hover:bg-amber-50'
              }`}
            >
              Kutilmoqda ({statusCounts.pending})
            </button>
            {activeProject === 'developer' && (
              <button
                type="button"
                onClick={() => setSelectedStatusFilters(['registered'])}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                  selectedStatusFilters.length === 1 && selectedStatusFilters[0] === 'registered'
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                    : 'bg-white text-indigo-800 border-indigo-200 hover:bg-indigo-50'
                }`}
              >
                Ro'yxatdan o'tganlar ({statusCounts.registered})
              </button>
            )}
            <button
              type="button"
              onClick={() => setSelectedStatusFilters(['certified'])}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                selectedStatusFilters.length === 1 && selectedStatusFilters[0] === 'certified'
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                  : 'bg-white text-emerald-800 border-emerald-200 hover:bg-emerald-50'
              }`}
            >
              Tayyor ({statusCounts.certified})
            </button>
            {statusCounts.error > 0 && (
              <button
                type="button"
                onClick={() => setSelectedStatusFilters(['error'])}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                  selectedStatusFilters.length === 1 && selectedStatusFilters[0] === 'error'
                    ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                    : 'bg-white text-rose-800 border-rose-200 hover:bg-rose-50'
                }`}
              >
                Xatolik ({statusCounts.error})
              </button>
            )}
          </div>

          {/* Students Table in High Contrast Clean White Style */}
          <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-xs">
            <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-slate-900 text-sm">O'quvchilar Ro'yxati</h3>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-900 border border-emerald-300 text-[11px] font-bold shadow-2xs" title="Alt+V bosing: Buferdagi sertifikatni ro'yxatdagi navbatdagi o'quvchiga avtomatik biriktiradi">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Tezkor sertifikat qo'yish:</span>
                    <kbd className="px-1.5 py-0.2 bg-white rounded border border-emerald-400 font-mono text-xs font-black text-emerald-900 shadow-2xs">Alt + V</kbd>
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  <span className="text-blue-700 font-semibold">1 marta bosing</span> — nusxalash, <span className="text-blue-700 font-semibold">2 marta tez bosing</span> — tahrirlash
                </p>
              </div>
              <div className="flex items-center gap-2">
                {selectedStatusFilters.length === allStatusKeys.length && (
                  <span className="text-[10px] sm:text-[11px] px-2.5 py-1 rounded-lg bg-blue-100 text-blue-900 font-bold border border-blue-200 flex items-center gap-1.5 shadow-2xs">
                    <CheckCircle2 className="w-3.5 h-3.5 text-blue-700" />
                    <span>
                      {activeProject === 'developer'
                        ? "Tartib: Tayyor ➔ Ro'yxatdan o'tgan ➔ Xatolik ➔ Kutilmoqda"
                        : "Tartib: 1. Tayyor ➔ 2. Xatolik ➔ 3. Kutilmoqda"}
                    </span>
                  </span>
                )}
                {selectedStatusFilters.length > 0 && selectedStatusFilters.length < allStatusKeys.length && (
                  <span className="text-[10px] sm:text-[11px] px-2 py-0.5 rounded-lg bg-slate-200 text-slate-800 font-semibold border border-slate-300">
                    Holat: {selectedStatusFilters.map(s => (s === 'certified' ? 'Tayyor' : s === 'registered' ? "Ro'yxatdan o'tgan" : s === 'error' ? 'Xatolik' : 'Kutilmoqda')).join(', ')}
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
                    <th className="py-3 px-3">
                      {isRegisteredFilterView
                        ? "O'quvchi Logini (omp.aistudy.uz)"
                        : isCurrentViewDeveloper
                        ? "Metrika / Pasport (Sana • Raqam • Seriya)"
                        : "Biriktirilgan Pochta"}
                    </th>
                    <th className="py-3 px-3">Holat</th>
                    <th className="py-3 px-3">Sertifikat</th>
                    <th className="py-3 pr-5 pl-3 text-right">Amal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {displayedStudents.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400 font-sans">
                        O'quvchilar topilmadi.
                      </td>
                    </tr>
                  ) : (
                    displayedStudents.map((st, idx) => {
                      const isCertified = st.status === 'certified';
                      const isError = st.hasError || st.status === 'error';
                      const isDeveloperStudent = st.projectType === 'developer';
                      const isRegistered = isDeveloperStudent && Boolean(st.devRegistered) && !isCertified && !isError;
                      const devLoginText = st.assignedLogin || (isDeveloperStudent ? generateStudentLogin(st.fullName, 0) : '');

                      return (
                        <tr
                          key={st.id}
                          className={`hover:bg-slate-50/80 transition-colors select-none ${
                            isError ? 'bg-rose-50/40' : st.isTeacher ? 'bg-purple-50/25' : isRegistered ? 'bg-indigo-50/25' : isDeveloperStudent ? 'hover:bg-purple-50/30' : ''
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
                                  if (isDeveloperStudent) {
                                    handleDeveloperLoginCopy(st);
                                  } else {
                                    handleCopyField(st.fullName, st.isTeacher ? "Ustoz F.I.SH" : "O'quvchi F.I.SH");
                                  }
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
                                title={isDeveloperStudent ? "1 marta bosing - loginni nusxalash (metrikadan keyin Ro'yxatdan o'tganlarga o'tadi), 2 marta - tahrirlash" : "1 marta bosing - F.I.SH nusxalash"}
                              >
                                {st.fullName}
                              </span>
                              {st.isTeacher && (
                                <span className="px-1.5 py-0.2 text-[9px] font-bold rounded bg-purple-100 text-purple-800 border border-purple-200 uppercase tracking-wider font-sans">
                                  USTOZ
                                </span>
                              )}
                              {isDeveloperStudent && !st.isTeacher && (
                                <span className="px-1.5 py-0.2 text-[9px] font-bold rounded bg-purple-100 text-purple-800 border border-purple-200 uppercase tracking-wider font-sans">
                                  DASTURCHI
                                </span>
                              )}
                              {isError && (
                                <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-rose-100 text-rose-800 border border-rose-200 font-sans">
                                  XATO
                                </span>
                              )}
                            </div>

                            {/* Under name: if Developer student, show clickable login badge (hidden when column 4 already shows Login); if AI student, show small metrika */}
                            {isDeveloperStudent ? (
                              !isRegisteredFilterView ? (
                                <div className="text-[11px] text-purple-700 font-mono mt-0.5 font-bold flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeveloperLoginCopy(st);
                                    }}
                                    className={`px-1.5 py-0.5 rounded border flex items-center gap-1 cursor-pointer transition-all hover:scale-[1.02] active:scale-95 ${
                                      metrikaPrimedId === st.id
                                        ? 'bg-indigo-600 text-white border-indigo-700 shadow-xs animate-pulse'
                                        : 'bg-purple-100 hover:bg-purple-200 text-purple-900 border-purple-200'
                                    }`}
                                    title="Loginni nusxalash (metrikadan keyin bossangiz Ro'yxatdan o'tganlarga o'tadi)"
                                  >
                                    <span>login: {devLoginText}</span>
                                    <Copy className="w-2.5 h-2.5" />
                                  </button>
                                </div>
                              ) : (
                                st.passportOrId && (
                                  <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                                    {st.passportOrId}{st.birthDate ? ` • ${st.birthDate}` : ''}
                                  </div>
                                )
                              )
                            ) : (
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
                            )}
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

                          {/* Column 4: Login in Ro'yxatdan o'tganlar view OR Prominent Metrika in Developer Mode OR Email in AI mode */}
                          <td className="py-3 px-3">
                            {isDeveloperStudent && isRegisteredFilterView ? (
                              <div className="flex flex-wrap items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeveloperLoginCopy(st);
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-950 border border-indigo-200 text-xs font-mono font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs active:scale-95"
                                  title="Loginni nusxalash"
                                >
                                  <KeyRound className="w-3 h-3 text-indigo-600" />
                                  <span>{devLoginText}</span>
                                  <Copy className="w-2.5 h-2.5 text-indigo-500" />
                                </button>
                                <span
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const pwd = st.assignedPassword || 'MaktabPass2026!';
                                    navigator.clipboard.writeText(pwd);
                                    showQuickToast(`🔑 Parol nusxalandi: "${pwd}"`);
                                  }}
                                  className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-[11px] font-mono cursor-pointer transition-colors"
                                  title="Parolni nusxalash"
                                >
                                  {st.assignedPassword || 'MaktabPass2026!'}
                                </span>
                              </div>
                            ) : isDeveloperStudent ? (
                              st.passportOrId || st.birthDate ? (
                                (() => {
                                  const m = parseMetrikaComponents(st.birthDate, st.passportOrId);
                                  return (
                                    <div className="flex flex-wrap items-center gap-1.5 py-0.5 max-w-sm">
                                      {/* 1. Tug'ilgan sana chipi (02.06.2011) */}
                                      {m.formattedDate && (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            navigator.clipboard.writeText(m.formattedDate);
                                            markMetrikaCopied(st.id);
                                            showQuickToast(`📅 Tug'ilgan sana nusxalandi: "${m.formattedDate}"`);
                                          }}
                                          className="px-2 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-950 border border-indigo-200 text-xs font-mono font-bold flex items-center gap-1 transition-all cursor-pointer shadow-2xs hover:scale-105 active:scale-95"
                                          title="Tug'ilgan sanani nusxalash (02.06.2011)"
                                        >
                                          <span className="text-[10px] text-indigo-500 font-sans font-medium">Sana:</span>
                                          <span>{m.formattedDate}</span>
                                          <Copy className="w-2.5 h-2.5 text-indigo-500" />
                                        </button>
                                      )}

                                      {/* 2. Metrika raqami chipi (0539632) */}
                                      {m.number && (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            navigator.clipboard.writeText(m.number);
                                            markMetrikaCopied(st.id);
                                            showQuickToast(`🔢 Raqam nusxalandi: "${m.number}"`);
                                          }}
                                          className="px-2 py-1 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-950 border border-purple-200 text-xs font-mono font-bold flex items-center gap-1 transition-all cursor-pointer shadow-2xs hover:scale-105 active:scale-95"
                                          title="Metrika raqamini nusxalash (masalan: 0539632)"
                                        >
                                          <span className="text-[10px] text-purple-500 font-sans font-medium">Raqam:</span>
                                          <span>{m.number}</span>
                                          <Copy className="w-2.5 h-2.5 text-purple-500" />
                                        </button>
                                      )}

                                      {/* 3. Metrika seriyasi chipi (I-FR) */}
                                      {m.series && (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            navigator.clipboard.writeText(m.series);
                                            markMetrikaCopied(st.id);
                                            showQuickToast(`🔤 Seriya nusxalandi: "${m.series}"`);
                                          }}
                                          className="px-2 py-1 rounded-lg bg-pink-50 hover:bg-pink-100 text-pink-950 border border-pink-200 text-xs font-mono font-bold flex items-center gap-1 transition-all cursor-pointer shadow-2xs hover:scale-105 active:scale-95"
                                          title="Metrika seriyasini nusxalash (masalan: I-FR)"
                                        >
                                          <span className="text-[10px] text-pink-500 font-sans font-medium">Seriya:</span>
                                          <span>{m.series}</span>
                                          <Copy className="w-2.5 h-2.5 text-pink-500" />
                                        </button>
                                      )}

                                      {/* 4. Ketma-ket Win+V uchun maxsus tugma */}
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleSequentialCopyForWinV(st.birthDate, st.passportOrId, st.id);
                                        }}
                                        className={`px-2 py-1 rounded-lg text-xs font-sans font-bold flex items-center gap-1 shadow-2xs transition-all cursor-pointer hover:scale-105 active:scale-95 ${
                                          winVNotice && winVNotice.studentId === st.id
                                            ? 'bg-amber-600 text-white animate-pulse'
                                            : 'bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 hover:from-amber-600 hover:to-orange-600 text-white'
                                        }`}
                                        title="Windows Bufer Tarixi (Win+V) uchun ketma-ket yozish: 1. Sana ➔ 2. Raqam ➔ 3. Seriya (Ctrl+V)"
                                      >
                                        <Zap className="w-3 h-3 text-amber-200 fill-amber-200" />
                                        <span>Win+V</span>
                                      </button>

                                      {/* 5. Hammasi birga chipi */}
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          navigator.clipboard.writeText(m.combined);
                                          markMetrikaCopied(st.id);
                                          showQuickToast(`📋 Barchasi nusxalandi: "${m.combined}"`);
                                        }}
                                        className="px-1.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-semibold flex items-center gap-0.5 transition-all cursor-pointer"
                                        title="Barchasini ketma-ket nusxalash (02.06.2011 0539632 I-FR)"
                                      >
                                        <Copy className="w-2.5 h-2.5 text-slate-500" />
                                        <span>Barchasi</span>
                                      </button>
                                    </div>
                                  );
                                })()
                              ) : (
                                <span className="text-slate-400 font-sans text-[11px] italic">
                                  Metrika kiritilmagan
                                </span>
                              )
                            ) : (
                              st.assignedEmail ? (
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
                              )
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
                            ) : isRegistered ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-50 text-indigo-800 border border-indigo-200">
                                <CheckCircle2 className="w-3 h-3 text-indigo-600" /> Ro'yxatdan o'tgan
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                                <Clock className="w-3 h-3 text-slate-400" /> Kutilmoqda
                              </span>
                            )}
                          </td>

                          <td className="py-3 px-3">
                            {st.certificateLink ? (
                              <div className="flex items-center gap-1.5">
                                <a
                                  href={st.certificateLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={e => e.stopPropagation()}
                                  className="text-blue-700 hover:text-blue-800 font-semibold flex items-center gap-1 max-w-[120px] truncate"
                                  title={st.certificateLink}
                                >
                                  <ExternalLink className="w-3 h-3 flex-shrink-0" />
                                  <span className="truncate">Sertifikat</span>
                                </a>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (st.rawStudent) {
                                      handleFastPasteCertificateForStudent(st.rawStudent);
                                    }
                                  }}
                                  className="p-1 text-slate-400 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors cursor-pointer"
                                  title="Sertifikat havolasini yangilash / qayta qo'yish"
                                >
                                  <RotateCcw className="w-3 h-3" />
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={e => {
                                  e.stopPropagation();
                                  if (st.isTeacher) {
                                    setActiveTab('teachers');
                                  } else if (st.rawStudent) {
                                    handleFastPasteCertificateForStudent(st.rawStudent);
                                  }
                                }}
                                className="px-2.5 py-1 text-[11px] font-sans font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
                                title="Buferdagi sertifikatni ushbu o'quvchiga darhol biriktirish (Alt+V)"
                              >
                                <Clipboard className="w-3.5 h-3.5" />
                                <span>Qo'yish</span>
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

            {filteredStudents.length > rowLimit && (
              <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="text-slate-600 font-medium">
                  Ko'rsatilmoqda: <strong>{displayedStudents.length}</strong> / <strong>{filteredStudents.length}</strong> nafar o'quvchi
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setRowLimit(prev => prev + 80)}
                    className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 rounded-xl font-bold cursor-pointer transition-colors"
                  >
                    +80 ko'proq ko'rsatish
                  </button>
                  <button
                    type="button"
                    onClick={() => setRowLimit(filteredStudents.length)}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold cursor-pointer transition-colors"
                  >
                    Hammasini ko'rsatish ({filteredStudents.length})
                  </button>
                </div>
              </div>
            )}
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
          onDeleteBatchTeachers={onDeleteBatchTeachers}
          onAssignEmailFromPool={onAssignTeacherEmail}
          onAssignBatchEmailsFromPool={onAssignBatchTeacherEmails}
        />
      )}

      {/* TAB 2: Finance & Payments Matrix (Strictly Track-Isolated) */}
      {activeTab === 'finance' && (
        <div className="space-y-5">
          {/* Track-Scoped Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
              <span className="text-xs font-medium text-slate-500 block mb-1">
                {activeProject === 'developer' ? "5M AI Yetakchilari Sinflar Tushumi" : "1M Promter Sinflar Tushumi"}
              </span>
              <div className="text-xl font-bold text-slate-900">
                {currentProjectPaidRevenue.toLocaleString()} <span className="text-xs font-normal text-slate-500">so'm</span>
              </div>
              <div className={`text-xs font-semibold mt-1 ${currentProjectRemainingDebt > 0 ? 'text-amber-800' : 'text-emerald-700'}`}>
                {currentProjectRemainingDebt > 0
                  ? `Qarz: ${currentProjectRemainingDebt.toLocaleString()} so'm`
                  : "Qarz yo'q"}
              </div>
            </div>

            {activeProject === 'ai' ? (
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
            ) : (
              <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
                <span className="text-xs font-medium text-purple-700 block mb-1">
                  5M AI Yetakchilari Sertifikatlar
                </span>
                <div className="text-xl font-bold text-purple-900">
                  {devCertifiedCount} <span className="text-xs font-normal text-purple-600">ta tayyor</span>
                </div>
                <div className="text-xs text-slate-600 font-semibold mt-1">
                  Hisoblangan jami: {devPotentialRevenue.toLocaleString()} so'm (7 000x)
                </div>
              </div>
            )}

            <div className="bg-emerald-50/80 border border-emerald-200 rounded-2xl p-4 shadow-xs">
              <span className="text-xs font-medium text-emerald-800 block mb-1">
                {activeProject === 'developer' ? "5M Loyiha Jami Tushum" : "Umumiy Jami Tushum (1M Loyiha)"}
              </span>
              <div className="text-xl font-bold text-emerald-900">
                {grandTotalPaidRevenue.toLocaleString()} <span className="text-xs font-normal text-emerald-700">so'm</span>
              </div>
              <div className="text-xs text-slate-700 font-semibold mt-1">
                Jami Qolgan Qarz: <span className="text-rose-700 font-bold">{grandTotalRemainingDebt.toLocaleString()} so'm</span>
              </div>
            </div>
          </div>

          {/* Classes Table (Strictly filtered to visibleClasses of activeProject) */}
          {(() => {
            const unverifiedClassesCount = visibleClasses.filter(c => c.paymentUnverified).length;
            const filteredFinanceClasses = visibleClasses.filter(c => {
              const cStudents = studentsByClassMap.get(c.id) || [];
              const cCertified = cStudents.filter(s => getStudentTrackData(s, activeProject).status === 'certified').length;
              const cUnitPrice = activeProject === 'developer' ? 7000 : (c.pricePerStudent || 5000);
              const cTotalCost = cCertified * cUnitPrice;
              const cPaid = getClassTrackPaid(c, activeProject);
              const cDebt = Math.max(0, cTotalCost - cPaid);
              const isPaid = cTotalCost > 0 && cPaid >= cTotalCost;
              if (financeFilter === 'unverified') return Boolean(c.paymentUnverified);
              if (financeFilter === 'debt') return cDebt > 0;
              if (financeFilter === 'paid') return isPaid;
              return true;
            });

            const formatFinDate = (iso?: string) => {
              if (!iso) return '';
              const d = new Date(iso);
              if (isNaN(d.getTime())) return '';
              return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
            };

            const methodLabel = (m?: string) => {
              if (m === 'karta') return '💳 Karta';
              if (m === 'otkazma') return "🏦 O'tkazma";
              if (m === 'tekshirish') return '⚠️ Shubhali';
              if (m === 'naqd') return '💵 Naqd';
              return '';
            };

            return (
          <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-xs">
            <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-slate-900 text-sm sm:text-base">
                  {activeProject === 'developer'
                    ? "5M AI Yetakchilari — Sinflar Bo'yicha To'lovlar"
                    : "Bir Million Promter — Sinflar Bo'yicha To'lovlar"}
                </h3>
                <p className="text-xs text-slate-500">
                  Har bir tayyor sertifikat uchun xizmat narxi: <b>{activeProject === 'developer' ? "7 000 so'm" : "5 000 so'm"}</b>. Qator ustiga bosib to'lov tarixi, vaqt izi va izohlarni ko'ring.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setFinanceFilter('all')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                    financeFilter === 'all'
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  Barchasi ({visibleClasses.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFinanceFilter('unverified')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                    financeFilter === 'unverified'
                      ? 'bg-amber-600 text-white border-amber-600'
                      : unverifiedClassesCount > 0
                      ? 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100'
                      : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  ⚠️ Tekshirish kerak ({unverifiedClassesCount})
                </button>
                <button
                  type="button"
                  onClick={() => setFinanceFilter('debt')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                    financeFilter === 'debt'
                      ? 'bg-rose-600 text-white border-rose-600'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  Qarzdorlar
                </button>
                <button
                  type="button"
                  onClick={() => setFinanceFilter('paid')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                    financeFilter === 'paid'
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  To'langanlar
                </button>
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
                    <th className="py-3.5 px-3">Hisoblangan ({activeProject === 'developer' ? '7 000x' : '5 000x'})</th>
                    <th className="py-3.5 px-3">To'langan Summa</th>
                    <th className="py-3.5 px-3">Qolgan Qarz</th>
                    <th className="py-3.5 pr-5 pl-3 text-right">Amal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {filteredFinanceClasses.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-10 text-center text-slate-400 font-sans">
                        {visibleClasses.length === 0
                          ? "Ushbu loyihada hozircha sinflar mavjud emas."
                          : "Tanlangan filtr bo'yicha sinflar topilmadi."}
                      </td>
                    </tr>
                  ) : (
                    filteredFinanceClasses.map(c => {
                      const cStudents = studentsByClassMap.get(c.id) || [];
                      const cCertified = cStudents.filter(s => getStudentTrackData(s, activeProject).status === 'certified').length;
                      const cUnitPrice = activeProject === 'developer' ? 7000 : (c.pricePerStudent || 5000);
                      const cTotalCost = cCertified * cUnitPrice;
                      const cPaid = getClassTrackPaid(c, activeProject);
                      const cDebt = Math.max(0, cTotalCost - cPaid);
                      const isPaid = cTotalCost > 0 && cPaid >= cTotalCost;
                      const lastDateStr = formatFinDate(c.lastPaymentAt);
                      const methodStr = methodLabel(c.paymentMethod);

                      return (
                        <tr
                          key={c.id}
                          className={`transition-colors cursor-pointer ${
                            c.paymentUnverified
                              ? 'bg-amber-50/50 hover:bg-amber-50'
                              : 'hover:bg-slate-50'
                          }`}
                          onClick={() => onOpenPaymentModal(c)}
                        >
                          <td className="py-3.5 pl-5 pr-3 font-bold text-slate-900">
                            <div className="flex flex-col items-start gap-1">
                              {c.isExternalSchool && (
                                <span
                                  className="px-1.5 py-0.5 rounded text-[10px] font-extrabold uppercase bg-rose-100 text-rose-800 border border-rose-300 tracking-wider shadow-2xs"
                                  title={`Boshqa maktab: ${c.schoolName || 'Boshqa maktab'}`}
                                >
                                  bm {c.schoolName ? `• ${c.schoolName}` : ''}
                                </span>
                              )}
                              <span className="px-2.5 py-1 rounded bg-slate-100 border border-slate-200 text-xs">
                                {c.name}
                              </span>
                            </div>
                          </td>
                          <td className="py-3.5 px-3 font-sans font-medium text-slate-900">{c.teacherName}</td>
                          <td className="py-3.5 px-3">{cStudents.length} nafar</td>
                          <td className="py-3.5 px-3 text-emerald-800 font-bold">{cCertified} nafar</td>
                          <td className="py-3.5 px-3 font-semibold">{cTotalCost.toLocaleString('uz-UZ')} so'm</td>
                          <td className="py-3.5 px-3">
                            <div className="text-emerald-800 font-semibold">
                              {cPaid.toLocaleString('uz-UZ')} so'm
                            </div>
                            {(methodStr || lastDateStr || c.paymentNote) && (
                              <div className="font-sans text-[10px] text-slate-500 mt-0.5 max-w-[200px] truncate" title={c.paymentNote || ''}>
                                {[methodStr, lastDateStr, c.paymentNote].filter(Boolean).join(' • ')}
                              </div>
                            )}
                          </td>
                          <td className="py-3.5 px-3">
                            {c.paymentUnverified ? (
                              <span className="inline-flex items-center gap-1 text-amber-900 font-sans font-bold text-[11px] bg-amber-100 px-2 py-0.5 rounded border border-amber-300">
                                ⚠️ Tekshirish kerak
                              </span>
                            ) : isPaid ? (
                              <span className="inline-flex items-center gap-1 text-emerald-800 font-sans font-bold text-[11px] bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                <CheckCircle2 className="w-3.5 h-3.5" /> To'liq to'langan
                              </span>
                            ) : cCertified === 0 && cPaid === 0 ? (
                              <span className="text-slate-400 font-sans text-[11px]">
                                0 so'm (sertifikat yo'q)
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
                              className={`px-3 py-1 text-xs font-sans font-semibold rounded-lg border transition-colors cursor-pointer ${
                                c.paymentUnverified
                                  ? 'bg-amber-600 hover:bg-amber-700 text-white border-amber-600'
                                  : 'bg-white hover:bg-slate-100 text-slate-800 border-slate-200'
                              }`}
                            >
                              {c.paymentUnverified ? "Tekshirish" : "To'lov kiritish"}
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
            );
          })()}

          {/* Teachers Financial Table (Only in AI mode) */}
          {activeProject === 'ai' && (
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
          )}
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

            {/* Paginated Email list preview (prevents 3,000-node DOM overload) */}
            {(() => {
              const q = emailSearch.trim().toLowerCase();
              const filteredPool = q
                ? emailPool.filter(item => item.email.toLowerCase().includes(q))
                : emailPool;
              const displayedPool = filteredPool.slice(0, emailLimit);
              return (
                <div className="space-y-2.5 pt-1">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-800">
                      Pochtalar ro'yxati ({displayedPool.length} / {filteredPool.length} ta ko'rsatilmoqda):
                    </span>
                    <input
                      type="text"
                      value={emailSearch}
                      onChange={e => {
                        setEmailSearch(e.target.value);
                        setEmailLimit(48);
                      }}
                      placeholder="Email qidirish..."
                      className="px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-none focus:bg-white focus:border-blue-600 sm:w-64"
                    />
                  </div>
                  <div className="max-h-80 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/50 p-2.5">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                      {displayedPool.map((item) => (
                        <div
                          key={item.email}
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
                  {filteredPool.length > emailLimit && (
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[11px] text-slate-500">
                        Yana {filteredPool.length - emailLimit} ta email bor
                      </span>
                      <button
                        type="button"
                        onClick={() => setEmailLimit(prev => prev + 60)}
                        className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-xs font-bold text-slate-800 cursor-pointer"
                      >
                        +60 ta ko'proq ko'rsatish
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* TAB 4: Active Sessions & Devices Management (Isolated Live Subscription) */}
      {activeTab === 'sessions' && (
        <SessionsManagementTab
          currentDeviceId={currentDeviceId}
          onToggleBlockDevice={onToggleBlockDevice}
          onDeleteSession={onDeleteSession}
          onUnlockExternalTeacher={onUnlockExternalTeacher}
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

            {/* CONFLICT NOTICES WITH COMPLETE STUDENT DETAILS (Dismissible & Project-Scoped) */}
            {newStudentConflicts.hasPassportConflict && !dismissedNewConflicts.passport && newStudentConflicts.conflictingStudentByPassport && (
              <div className="mb-4 p-4 bg-rose-50 border-2 border-rose-300 rounded-xl text-xs text-rose-950 space-y-2 animate-scale-up">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 font-bold text-rose-800">
                    <AlertOctagon className="w-4 h-4 text-rose-600 flex-shrink-0" />
                    <span className="text-sm">Pasport / ID seriyasi takrorlandi!</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDismissedNewConflicts(p => ({ ...p, passport: true }))}
                    className="px-2 py-1 text-[11px] font-bold bg-white hover:bg-rose-100 text-rose-700 border border-rose-300 rounded-lg cursor-pointer"
                  >
                    Yopish / Ruxsat
                  </button>
                </div>
                <p className="leading-relaxed text-[11px] text-rose-900">
                  Ushbu pasport seriyasi (<strong>{newStudentPassport}</strong>) joriy yo'nalishda avvaldan kiritilgan:
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
                </div>
              </div>
            )}

            {newStudentConflicts.hasCertificateConflict && !dismissedNewConflicts.certificate && newStudentConflicts.conflictingStudentByCertificate && (
              <div className="mb-4 p-4 bg-rose-50 border-2 border-rose-300 rounded-xl text-xs text-rose-950 space-y-2 animate-scale-up">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 font-bold text-rose-800">
                    <AlertOctagon className="w-4 h-4 text-rose-600 flex-shrink-0" />
                    <span className="text-sm">Sertifikat havolasi takrorlandi!</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDismissedNewConflicts(p => ({ ...p, certificate: true }))}
                    className="px-2 py-1 text-[11px] font-bold bg-white hover:bg-rose-100 text-rose-700 border border-rose-300 rounded-lg cursor-pointer"
                  >
                    Yopish / Ruxsat
                  </button>
                </div>
                <p className="leading-relaxed text-[11px] text-rose-900">
                  Ushbu sertifikat havolasi avvaldan joriy yo'nalishdagi o'quvchiga biriktirilgan:
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
                  {(visibleClasses.length > 0 ? visibleClasses : classes).map(c => (
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
                  placeholder={newStudentTargetTrack === 'developer' ? "https://omp.aistudy.uz/certificate?id=..." : "https://coursera.org/verify/..."}
                  value={newStudentCertLink}
                  onChange={e => setNewStudentCertLink(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 text-xs focus:outline-none focus:bg-white focus:border-blue-700"
                />
              </div>

              {newStudentTargetTrack === 'developer' ? (
                <div className="p-2.5 bg-purple-50 border border-purple-200 rounded-xl text-xs text-purple-900 flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-purple-600 flex-shrink-0" />
                  <span>
                    O'quvchiga <strong>familya_ism</strong> formatida avtomatik login yaratiladi (Gmail sarflanmaydi).
                  </span>
                </div>
              ) : (
                <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 flex items-center gap-2">
                  <Mail className="w-4 h-4 text-blue-600 flex-shrink-0" />
                  <span>
                    O'quvchiga zaxiradagi bo'sh Coursera emaillaridan <strong>noyob yangi email</strong> avtomatik biriktiriladi.
                  </span>
                </div>
              )}

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
                  disabled={
                    (newStudentConflicts.hasPassportConflict && !dismissedNewConflicts.passport) ||
                    (newStudentConflicts.hasCertificateConflict && !dismissedNewConflicts.certificate) ||
                    (newStudentConflicts.hasNameConflict && !allowDuplicateName)
                  }
                  className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-blue-700 hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors cursor-pointer"
                >
                  Qo'shish
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Class Settings & Official Certificate Dates Proof */}
      {editingClass && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in overflow-y-auto"
          onClick={() => setEditingClass(null)}
        >
          <div
            className={`relative w-full bg-white border border-slate-300 rounded-2xl shadow-2xl my-6 flex flex-col max-h-[92vh] transition-all ${
              classSettingsTab === 'audit' ? 'max-w-2xl' : 'max-w-md'
            }`}
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header + Tabs */}
            <div className="px-5 pt-4 pb-3 border-b border-slate-200 bg-slate-50 rounded-t-2xl space-y-3 flex-shrink-0">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {editingClass.name} sinfi parametrlari
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Sinf rahbari: <strong>{editingClass.teacherName}</strong>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingClass(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200 transition-colors cursor-pointer"
                  title="Yopish (ESC)"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-1.5 bg-slate-200/70 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setClassSettingsTab('general')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                    classSettingsTab === 'general'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Settings className="w-3.5 h-3.5" />
                  <span>Asosiy parametrlar</span>
                </button>
                <button
                  type="button"
                  onClick={() => setClassSettingsTab('audit')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                    classSettingsTab === 'audit'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <FileSearch className="w-3.5 h-3.5" />
                  <span>Sertifikat sanalari va Isbot</span>
                </button>
              </div>
            </div>

            {classSettingsTab === 'audit' ? (
              <div className="p-5 overflow-y-auto flex-1">
                <ClassCertificateAuditSection
                  classGroup={editingClass}
                  classStudents={studentsByClassMap.get(editingClass.id) || []}
                  activeTrack={editingClass.projectType === 'developer' ? 'developer' : 'ai'}
                  onSaveUpdatedStudents={async (updatedStudents) => {
                    if (onSaveBatchStudents) {
                      await onSaveBatchStudents(updatedStudents);
                    } else if (onSaveStudent) {
                      for (const st of updatedStudents) {
                        await onSaveStudent(st);
                      }
                    }
                  }}
                  onOpenPaymentModal={(cg) => {
                    setEditingClass(null);
                    onOpenPaymentModal(cg);
                  }}
                />
              </div>
            ) : (
            <form onSubmit={handleSaveClassEdit} className="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1">
              {/* Loyiha Yo'nalishi / Sertifikat Turi */}
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                  Loyiha yo'nalishi (Sertifikat turi):
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingClass({
                      ...editingClass,
                      projectType: 'ai',
                      pricePerStudent: 5000,
                    })}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      editingClass.projectType !== 'developer'
                        ? 'border-blue-600 bg-blue-50/70 shadow-xs ring-1 ring-blue-500'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-slate-900">🚀 Bir million promter</span>
                      {editingClass.projectType !== 'developer' && (
                        <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-500 leading-tight">AI Leaders & Coursera (email orqali)</p>
                    <p className="text-[11px] font-bold text-blue-700 mt-1">5 000 so'm / o'quvchi</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setEditingClass({
                      ...editingClass,
                      projectType: 'developer',
                      pricePerStudent: 7000,
                    })}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      editingClass.projectType === 'developer'
                        ? 'border-indigo-600 bg-indigo-50/70 shadow-xs ring-1 ring-indigo-500'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-indigo-950">💡 5M AI Yetakchilari</span>
                      {editingClass.projectType === 'developer' && (
                        <span className="w-2 h-2 rounded-full bg-indigo-600"></span>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-500 leading-tight">omp.aistudy.uz (login & Telegram bot)</p>
                    <p className="text-[11px] font-bold text-indigo-700 mt-1">7 000 so'm / o'quvchi</p>
                  </button>
                </div>
              </div>

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

              {/* Boshqa maktab tahrirlash */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-800 block">Boshqa maktab sinfimi?</span>
                    <span className="text-[11px] text-slate-500">Admin panelda 'bm' belgisi bilan ko'rsatiladi</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const next = !editingClass.isExternalSchool;
                      setEditingClass({
                        ...editingClass,
                        isExternalSchool: next,
                        schoolName: next ? (editingClass.schoolName || '27-maktab') : undefined,
                      });
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      editingClass.isExternalSchool
                        ? 'bg-rose-600 text-white shadow-xs'
                        : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    {editingClass.isExternalSchool ? '✓ Boshqa maktab' : 'Bizning maktab'}
                  </button>
                </div>

                {editingClass.isExternalSchool && (
                  <div className="pt-2 border-t border-slate-200 animate-fade-in">
                    <label className="text-[11px] font-bold text-rose-800 block mb-1">Qaysi maktab nomi (ustoz panelida qizil chiqadi):</label>
                    <input
                      type="text"
                      value={editingClass.schoolName || ''}
                      placeholder="Masalan: 27-maktab"
                      onChange={e => setEditingClass({ ...editingClass, schoolName: e.target.value })}
                      className="w-full px-3 py-1.5 bg-white border border-rose-300 rounded-lg text-xs font-bold text-rose-900 focus:outline-none focus:ring-2 focus:ring-rose-500"
                    />
                  </div>
                )}
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
            )}
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

      {/* Metrika & Birth Certificate AI Vision Scanner Modal */}
      <MetrikaAiScannerModal
        isOpen={isMetrikaScannerOpen}
        onClose={() => setIsMetrikaScannerOpen(false)}
        classes={classes}
        students={students}
        emailPool={emailPool}
        initialClassId={selectedClassId !== 'all' ? selectedClassId : undefined}
        onSaveClassAndStudents={(targetClass, newStudents, updatedPool) => {
          onSaveClassAndStudents?.(targetClass, newStudents, updatedPool);
          showQuickToast(`✅ ${targetClass.name} sinfiga ${newStudents.length} ta o'quvchi metrikadan qo'shildi!`);
        }}
      />

      {/* Lazy-mounted Voice Assistant Widget (zero microphone/timer overhead until opened) */}
      {isVoiceAssistantOpen ? (
        <VoiceAssistantWidget
          classes={classes}
          students={students}
          emailPool={emailPool}
          activeClassId={selectedClassId}
          selectedStatusFilters={selectedStatusFilters}
          isOpen={isVoiceAssistantOpen}
          onToggleOpen={setIsVoiceAssistantOpen}
          onSelectClass={(cid) => setSelectedClassId(cid)}
          onSaveStudent={onSaveStudent}
          onSaveClass={onSaveClass}
          onOpenBulkUploadModal={onOpenBulkUploadModal}
          onOpenStudentModal={onOpenStudentModal}
          onOpenMetrikaScanner={() => setIsMetrikaScannerOpen(true)}
          onAddBatchStudents={async (batchStudents) => {
            for (const s of batchStudents) {
              onAddSingleStudent(s);
            }
          }}
          onSaveClassAndStudents={onSaveClassAndStudents}
        />
      ) : (
        <button
          type="button"
          onClick={() => setIsVoiceAssistantOpen(true)}
          className="fixed bottom-5 right-5 z-40 w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-lg flex items-center justify-center transition-colors cursor-pointer"
          title="Ovozli boshqaruv yordamchisini ochish"
        >
          <Mic className="w-5 h-5" />
        </button>
      )}

      {/* Fast Certificate Paste Modal (100% resilient across all browsers & iframes) */}
      {fastPasteTarget && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in"
          onClick={() => setFastPasteTarget(null)}
        >
          <div 
            className="bg-white border border-slate-300 rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl space-y-4 animate-scale-up"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-700 flex items-center justify-center flex-shrink-0">
                  <Award className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Sertifikat Havolasini Qo'yish
                  </h3>
                  <p className="text-xs text-slate-600 font-medium">
                    O'quvchi: <strong className="text-emerald-900 font-bold">{fastPasteTarget.student.fullName}</strong>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setFastPasteTarget(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer text-sm font-bold"
                title="Yopish (ESC)"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 flex items-center justify-between">
                  <span>Coursera sertifikat havolasi:</span>
                  <span className="text-[11px] text-blue-700 font-semibold font-mono">
                    https://coursera.org/verify/...
                  </span>
                </label>

                <div className="relative flex items-center">
                  <input
                    ref={fastPasteInputRef}
                    autoFocus
                    type="url"
                    value={fastPasteTarget.urlInput}
                    onChange={e => setFastPasteTarget({
                      ...fastPasteTarget,
                      urlInput: e.target.value
                    })}
                    onPaste={async (e) => {
                      const pasted = e.clipboardData.getData('text').trim();
                      if (pasted && (pasted.startsWith('http://') || pasted.startsWith('https://'))) {
                        setFastPasteTarget({
                          ...fastPasteTarget,
                          urlInput: pasted
                        });
                        setTimeout(() => {
                          handleValidateAndSaveCertificate(fastPasteTarget.student, pasted);
                        }, 50);
                      }
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleValidateAndSaveCertificate(fastPasteTarget.student, fastPasteTarget.urlInput);
                      } else if (e.key === 'Escape') {
                        setFastPasteTarget(null);
                      }
                    }}
                    placeholder="Havolani bu yerga qo'ying (Ctrl + V)..."
                    className="w-full pl-3 pr-28 py-2.5 text-xs sm:text-sm bg-white border border-slate-300 rounded-xl text-slate-900 font-mono focus:outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20 shadow-xs"
                  />

                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        if (navigator.clipboard && navigator.clipboard.readText) {
                          const text = (await navigator.clipboard.readText() || '').trim();
                          if (text) {
                            setFastPasteTarget({
                              ...fastPasteTarget,
                              urlInput: text
                            });
                            handleValidateAndSaveCertificate(fastPasteTarget.student, text);
                            return;
                          }
                        }
                      } catch {}
                      fastPasteInputRef.current?.focus();
                      showQuickToast("⌨️ Iltimos klaviaturada Ctrl+V bosing", 2000);
                    }}
                    className="absolute right-1.5 px-2.5 py-1.5 text-xs font-bold rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1 transition-colors cursor-pointer"
                    title="Buferdagi havolani olish"
                  >
                    <Clipboard className="w-3.5 h-3.5" />
                    <span>Qo'yish</span>
                  </button>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-blue-50/70 border border-blue-200 text-xs text-blue-950 space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-blue-700" />
                  <span>Tezkor biriktirish va tekshirish:</span>
                </div>
                <p className="text-[11px] text-blue-900 leading-relaxed">
                  Havolani nusxalagan bo'lsangiz, shunchaki <strong>Ctrl + V</strong> bosing — tizim Coursera manzilini tekshirib, darhol o'quvchiga <strong>"Tayyor"</strong> maqomi bilan biriktiradi.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setFastPasteTarget(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
              >
                Bekor qilish (ESC)
              </button>

              <button
                type="button"
                disabled={isValidatingCert || !fastPasteTarget.urlInput.trim()}
                onClick={() => handleValidateAndSaveCertificate(fastPasteTarget.student, fastPasteTarget.urlInput)}
                className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
              >
                {isValidatingCert ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Tekshirilmoqda...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Sertifikatni Saqlash (Enter)</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* 📥 MODAL: Import Existing Class into Developer Track */}
      {isImportToDevModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-200 animate-scale-up">
            {/* Modal Header */}
            <div className="px-6 py-4.5 bg-gradient-to-r from-purple-50 via-indigo-50 to-purple-50 border-b border-purple-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-white flex items-center justify-center shadow-md shadow-purple-500/20">
                  <Upload className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Sinfni "5M Sun'iy Intellekt Yetakchilari"ga Import Qilish
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Besh Million Sun'iy Intellekt Yetakchilari (omp.aistudy.uz) yo'nalishi
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsImportToDevModalOpen(false);
                  setSelectedClassToImport(null);
                  setImportStep('select');
                }}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4 text-xs">
              {/* Important Isolation Warning */}
              <div className="p-3.5 rounded-2xl bg-amber-50/80 border border-amber-200 text-amber-950 space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 text-amber-700" />
                  <span>Qat'iy Ma'lumot Izolyatsiyasi:</span>
                </div>
                <p className="text-[11px] text-amber-900 leading-relaxed">
                  "Bir million promter"da olingan Coursera sertifikatlari bu yerga <strong>ko'chirilmaydi</strong>. Faqat shaxsiy ma'lumotlar: <strong>F.I.SH, Pasport/Metrika seriyasi va Tug'ilgan sana</strong> o'tadi. Barcha o'quvchilar holati yangidan <strong>"Kutilmoqda"</strong> bo'ladi.
                </p>
              </div>

              {importStep === 'select' ? (
                <div className="space-y-3">
                  <label className="block text-xs font-bold text-slate-800">
                    Qaysi sinfni "Besh million sun'iy intellekt yetakchilari" yo'nalishiga nusxalamoqchisiz?
                  </label>
                  
                  {classes.filter(c => c.projectType !== 'developer').length === 0 ? (
                    <div className="p-6 text-center text-slate-400 bg-slate-50 rounded-2xl border border-slate-200">
                      "Bir million promter" bo'limida hali sinflar yo'q.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                      {classes.filter(c => c.projectType !== 'developer').map(cls => {
                        const count = students.filter(s => s.classId === cls.id).length;
                        return (
                          <div
                            key={cls.id}
                            onClick={() => {
                              setSelectedClassToImport(cls);
                              setImportStep('confirm_login');
                            }}
                            className="p-3.5 rounded-2xl border border-slate-200 bg-white hover:bg-purple-50/50 hover:border-purple-300 transition-all flex items-center justify-between cursor-pointer group shadow-2xs hover:shadow-xs"
                          >
                            <div className="space-y-0.5">
                              <div className="font-bold text-slate-900 group-hover:text-purple-900 flex items-center gap-2">
                                <span>{cls.isExternalSchool ? `[bm] ` : ''}{cls.name} sinfi</span>
                                {cls.isExternalSchool && cls.schoolName && (
                                  <span className="text-[10px] text-slate-500 font-normal">({cls.schoolName})</span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-500">
                                Rahbar: {cls.teacherName}
                              </div>
                            </div>
                            <div className="flex items-center gap-2.5">
                              <span className="px-2.5 py-1 rounded-xl bg-purple-100 text-purple-900 font-mono font-bold text-[11px]">
                                {count} o'quvchi
                              </span>
                              <span className="text-purple-600 font-bold group-hover:translate-x-1 transition-transform">
                                ➔
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                selectedClassToImport && (
                  <div className="space-y-4 animate-fade-in">
                    <div className="p-4 rounded-2xl bg-purple-50 border border-purple-200 space-y-2 text-center">
                      <div className="w-12 h-12 rounded-2xl bg-purple-600 text-white flex items-center justify-center mx-auto shadow-md shadow-purple-500/20 font-bold text-lg">
                        💻
                      </div>
                      <h4 className="text-sm font-black text-purple-950">
                        {selectedClassToImport.name} sinfida {students.filter(s => s.classId === selectedClassToImport.id).length} ta o'quvchi bor.
                      </h4>
                      <p className="text-xs text-purple-800 leading-relaxed font-medium">
                        Ularning barchasiga bir vaqtning o'zida <strong>'familya_ism'</strong> logini va <strong>'MaktabPass2026!'</strong> paroli berilsinmi?
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                      <button
                        type="button"
                        onClick={() => handleExecuteImportToDeveloper(true)}
                        className="w-full px-4 py-3 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white text-xs font-bold shadow-md shadow-purple-500/20 flex items-center justify-center gap-2 transition-all cursor-pointer transform hover:scale-[1.02] active:scale-[0.98]"
                      >
                        <Check className="w-4 h-4" />
                        <span>Ha, login berilsin</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleExecuteImportToDeveloper(false)}
                        className="w-full px-4 py-3 rounded-2xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 text-xs font-bold transition-all cursor-pointer shadow-2xs hover:scale-[1.02] active:scale-[0.98]"
                      >
                        <span>Yo'q, keyinroq beraman</span>
                      </button>
                    </div>

                    <div className="text-center pt-1">
                      <button
                        type="button"
                        onClick={() => setImportStep('select')}
                        className="text-xs text-slate-500 hover:text-slate-800 font-semibold hover:underline cursor-pointer"
                      >
                        ⬅️ Boshqa sinf tanlash
                      </button>
                    </div>
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      )}

      {/* ✨ LIQUID GLASS NOTIFICATION MODAL (Animated Shimmer Pill) */}
      {liquidGlassNotification && liquidGlassNotification.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md animate-fade-in">
          <div className="relative w-full max-w-md bg-white/95 backdrop-blur-2xl border-2 border-purple-300/80 rounded-3xl shadow-[0_25px_60px_-15px_rgba(120,60,220,0.3)] p-6 space-y-4 animate-scale-up text-center overflow-hidden">
            {/* Shimmer Highlight */}
            <div className="absolute -inset-full bg-gradient-to-r from-transparent via-white/40 to-transparent rotate-45 pointer-events-none animate-pulse" />

            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-pink-600 text-white flex items-center justify-center mx-auto shadow-xl shadow-purple-500/30 font-bold text-2xl">
              ✨
            </div>

            <div className="space-y-1.5 relative z-10">
              <h3 className="text-base font-black text-slate-900 tracking-tight">
                {liquidGlassNotification.title}
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed font-medium">
                {liquidGlassNotification.message}
              </p>
              {liquidGlassNotification.subDetails && (
                <div className="mt-2 p-2.5 bg-purple-50/80 rounded-xl border border-purple-200 text-[11px] text-purple-900 font-medium">
                  {liquidGlassNotification.subDetails}
                </div>
              )}
            </div>

            <div className="pt-2 relative z-10">
              <button
                type="button"
                onClick={() => setLiquidGlassNotification(null)}
                className="w-full px-5 py-2.5 rounded-2xl bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-700 hover:to-indigo-800 text-white text-xs font-bold shadow-md shadow-purple-500/25 transition-all cursor-pointer"
              >
                Tushundim, davom etish
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Win+V Sequential Copy Progress Toast */}
      {winVNotice && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-3 bg-slate-900/95 backdrop-blur-xl border border-amber-400 text-white rounded-2xl shadow-2xl flex items-center gap-3 animate-scale-up max-w-sm">
          <div className="w-8 h-8 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center font-black text-sm flex-shrink-0 animate-bounce">
            ⚡
          </div>
          <div className="text-xs leading-tight">
            <span className="text-[10px] text-amber-300 font-bold uppercase tracking-wider block">
              {winVNotice.label}
            </span>
            <span className="font-mono font-bold text-white">
              "{winVNotice.text}"
            </span>
          </div>
        </div>
      )}
      </div>
    </UnifiedGlassProvider>
  );
};
