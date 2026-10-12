import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { ClassGroup, Student, EmailAccount } from '../types';
import { 
  speakUzbekVoice, 
  stopSpeaking,
  prefetchUzbekAudio,
  copyToClipboard, 
  readFromClipboard,
  unlockAudioPlayback,
  loadVoiceAssistantSettings, 
  saveVoiceAssistantSettings,
  VoiceAssistantSettings,
  UzbekVoiceId 
} from '../services/voiceAssistantService';
import { recordCertifyEvent } from '../utils/operatorSpeedTracker';
import { extractStudentsFromFile, ExtractedDocumentResult } from '../utils/fileExtractor';
import { ParsedStudentPreview } from '../utils/studentParser';
import { 
  Mic, 
  MicOff, 
  Volume2, 
  CheckCircle, 
  ChevronRight, 
  ChevronLeft, 
  Settings, 
  Sparkles, 
  Minimize2, 
  Maximize2, 
  Mail, 
  Check, 
  GripHorizontal,
  ClipboardPaste,
  Zap,
  Bot,
  DollarSign,
  AlertTriangle,
  FolderPlus,
  FileSpreadsheet,
  Search,
  Moon,
  Sun,
  X,
  Upload,
  UserCheck
} from 'lucide-react';

export interface PendingClassDraft {
  id: string;
  name: string;
  teacherName: string;
  students: ParsedStudentPreview[];
  matchedFileName?: string;
  matchedFile?: File;
  incompleteCount: number;
}

interface VoiceAssistantWidgetProps {
  classes: ClassGroup[];
  students: Student[];
  emailPool?: EmailAccount[];
  activeClassId?: string;
  selectedStatusFilters?: string[];
  onSelectClass?: (classId: string) => void;
  onSaveStudent?: (student: Student) => Promise<void> | void;
  onSaveClass?: (classGroup: ClassGroup) => Promise<void> | void;
  onAddBatchStudents?: (students: Student[]) => Promise<void> | void;
  onOpenBulkUploadModal?: (classId?: string) => void;
  onOpenStudentModal?: (student: Student) => void;
  onOpenMetrikaScanner?: () => void;
  onSaveClassAndStudents?: (targetClass: ClassGroup, newStudents: Student[], updatedEmailPool: EmailAccount[]) => void;
}

const STORAGE_POS_KEY = 'b1m_voice_widget_position_v4';

export const VoiceAssistantWidget: React.FC<VoiceAssistantWidgetProps> = ({
  classes,
  students,
  emailPool = [],
  activeClassId,
  selectedStatusFilters = [],
  onSelectClass,
  onSaveStudent,
  onSaveClass,
  onAddBatchStudents,
  onOpenBulkUploadModal,
  onOpenStudentModal,
  onOpenMetrikaScanner,
  onSaveClassAndStudents,
}) => {
  // Assistant Settings
  const [settings, setSettings] = useState<VoiceAssistantSettings>(() => loadVoiceAssistantSettings());
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

  // Widget Position (Draggable & persistent across sessions)
  const [position, setPosition] = useState<{ x: number; y: number }>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_POS_KEY);
      if (saved) return JSON.parse(saved);
    } catch {}
    const winW = typeof window !== 'undefined' ? window.innerWidth : 1200;
    return { x: Math.max(20, winW - 350), y: 95 };
  });

  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<{ startX: number; startY: number; posX: number; posY: number }>({
    startX: 0,
    startY: 0,
    posX: 0,
    posY: 0,
  });

  // Assistant Live State
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [micSupported, setMicSupported] = useState(true);
  const [actionToast, setActionToast] = useState<{ text: string; type: 'success' | 'info' | 'warn' } | null>(null);

  // AI Dialogue & Conversation State
  const [isSleepMode, setIsSleepMode] = useState(false);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [lastUserQuery, setLastUserQuery] = useState<string | null>(null);
  const [lastAiResponse, setLastAiResponse] = useState<string | null>(null);
  const [conversationState, setConversationState] = useState<'idle' | 'waiting_file_confirmation' | 'waiting_file_upload' | 'waiting_fill_incomplete'>('idle');
  const [classDraft, setClassDraft] = useState<PendingClassDraft | null>(null);
  const [foundStudentHighlight, setFoundStudentHighlight] = useState<Student | null>(null);

  // File Upload Reference for Class Creation
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const sessionUploadedFilesRef = useRef<Map<string, File>>(new Map());

  // Sequential Copying State (1. Ism -> 2. Pochta)
  const [copyStep, setCopyStep] = useState<'idle' | 'name_copied' | 'email_copied'>('idle');
  const [autoEmailCountdown, setAutoEmailCountdown] = useState<number | null>(null);
  const autoEmailTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Student Navigation Index in Candidate List
  const [studentPointerIndex, setStudentPointerIndex] = useState(0);

  // Live Statistics Calculations
  const statsSummary = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const todayCertified = students.filter(s => s.status === 'certified' && s.certifiedAt && s.certifiedAt.startsWith(todayStr));
    const totalCertified = students.filter(s => s.status === 'certified');
    const totalError = students.filter(s => s.hasError || s.status === 'error');
    const totalPending = students.filter(s => s.status !== 'certified' && !s.hasError && s.status !== 'error');

    const classStats = classes.map(c => {
      const cStudents = students.filter(s => s.classId === c.id);
      const cCertified = cStudents.filter(s => s.status === 'certified').length;
      const cPending = cStudents.filter(s => s.status !== 'certified' && !s.hasError && s.status !== 'error').length;
      const cErr = cStudents.filter(s => s.hasError || s.status === 'error').length;
      const price = c.pricePerStudent || 5000;
      const debt = Math.max(0, cStudents.length * price - (c.paidAmount || 0));
      return {
        id: c.id,
        name: c.name,
        teacherName: c.teacherName,
        totalStudents: cStudents.length,
        certifiedStudents: cCertified,
        pendingStudents: cPending,
        errorStudents: cErr,
        debt,
      };
    });

    const totalDebt = classStats.reduce((acc, c) => acc + c.debt, 0);
    const todayEarnings = todayCertified.length * 5000;

    return {
      todayCertifiedCount: todayCertified.length,
      todayEarnings,
      totalCertifiedCount: totalCertified.length,
      totalErrorCount: totalError.length,
      totalPendingCount: totalPending.length,
      totalStudentsCount: students.length,
      totalDebt,
      classes: classStats,
    };
  }, [students, classes]);

  // Target Class Determination (matches liquid glass lens)
  const currentClass = useMemo(() => {
    if (activeClassId && activeClassId !== 'all' && activeClassId !== 'all_with_teachers' && activeClassId !== 'only_teachers') {
      const found = classes.find(c => c.id === activeClassId);
      if (found) return found;
    }
    const withPending = classes.find(c => {
      const cSt = students.filter(s => s.classId === c.id);
      return cSt.some(s => s.status !== 'certified' && !s.hasError && s.status !== 'error');
    });
    return withPending || classes[0] || null;
  }, [classes, activeClassId, students]);

  // CATEGORY-RESPECTING CANDIDATE FILTER:
  const candidateStudents = useMemo(() => {
    if (!currentClass) return [];
    let list = students.filter(s => s.classId === currentClass.id);

    if (selectedStatusFilters && selectedStatusFilters.length > 0) {
      list = list.filter(s => {
        const isCertified = s.status === 'certified';
        const isError = Boolean(s.hasError || s.status === 'error');
        const isPending = !isCertified && !isError;

        if (selectedStatusFilters.includes('certified') && isCertified) return true;
        if (selectedStatusFilters.includes('error') && isError) return true;
        if (selectedStatusFilters.includes('pending') && isPending) return true;
        return false;
      });
    } else {
      // Default: strictly pending (uncertified, without errors)
      list = list.filter(s => s.status !== 'certified' && !s.hasError && s.status !== 'error');
    }

    return list;
  }, [students, currentClass, selectedStatusFilters]);

  // Active Student in Candidate List
  const activeStudent = useMemo(() => {
    if (candidateStudents.length === 0) return null;
    const safeIndex = Math.min(Math.max(0, studentPointerIndex), candidateStudents.length - 1);
    return candidateStudents[safeIndex] || null;
  }, [candidateStudents, studentPointerIndex]);

  // Reset pointer when candidates change
  useEffect(() => {
    if (studentPointerIndex >= candidateStudents.length && candidateStudents.length > 0) {
      setStudentPointerIndex(0);
    }
  }, [candidateStudents.length, studentPointerIndex]);

  // Helper Toast
  const showToast = useCallback((text: string, type: 'success' | 'info' | 'warn' = 'success') => {
    setActionToast({ text, type });
    setTimeout(() => {
      setActionToast(prev => (prev?.text === text ? null : prev));
    }, 4000);
  }, []);

  // Speech Recognition & Echo Prevention Refs
  const recognitionRef = useRef<any>(null);
  const recognitionStateRef = useRef<'inactive' | 'starting' | 'running' | 'stopping'>('inactive');
  const isListeningRef = useRef(isListening);
  isListeningRef.current = isListening;
  const isSpeakingRef = useRef(isSpeaking);
  isSpeakingRef.current = isSpeaking;
  const isProcessingCommandRef = useRef(false);
  const lastCommandTimeRef = useRef(0);

  const safeStartRecognition = useCallback(() => {
    if (!micSupported || !recognitionRef.current || !isListeningRef.current) return;
    if (isSpeakingRef.current || isProcessingCommandRef.current) return;
    if (recognitionStateRef.current === 'running' || recognitionStateRef.current === 'starting') {
      return;
    }

    try {
      recognitionStateRef.current = 'starting';
      recognitionRef.current.start();
    } catch (err: any) {
      if (err.name === 'InvalidStateError' || err?.message?.includes('already started')) {
        recognitionStateRef.current = 'running';
      } else {
        recognitionStateRef.current = 'inactive';
      }
    }
  }, [micSupported]);

  const safeStopRecognition = useCallback(() => {
    if (!recognitionRef.current) return;
    if (recognitionStateRef.current === 'inactive' || recognitionStateRef.current === 'stopping') {
      return;
    }
    try {
      recognitionStateRef.current = 'stopping';
      recognitionRef.current.stop();
    } catch {
      recognitionStateRef.current = 'inactive';
    }
  }, []);

  // Clear auto-email timers
  const clearAutoEmailTimers = useCallback(() => {
    if (autoEmailTimerRef.current) {
      clearTimeout(autoEmailTimerRef.current);
      autoEmailTimerRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setAutoEmailCountdown(null);
  }, []);

  useEffect(() => {
    return () => clearAutoEmailTimers();
  }, [clearAutoEmailTimers]);

  // Safely play speech with recognition pause
  const speakPolitely = useCallback(async (phrase: string) => {
    unlockAudioPlayback();
    isSpeakingRef.current = true;
    setIsSpeaking(true);

    // Physically pause recognition so mic NEVER hears its own output
    safeStopRecognition();

    await speakUzbekVoice(
      phrase,
      settings.voice || 'uz-UZ-SardorNeural',
      () => {
        setIsSpeaking(true);
        isSpeakingRef.current = true;
      },
      () => {
        setIsSpeaking(false);
        isSpeakingRef.current = false;
        // Resume microphone after 0.8s of silence
        setTimeout(() => {
          isProcessingCommandRef.current = false;
          if (isListeningRef.current) {
            safeStartRecognition();
          }
        }, 800);
      }
    );
  }, [settings.voice, safeStopRecognition, safeStartRecognition]);

  // CORE SEQUENTIAL ACTION:
  const executeSequentialCopy = useCallback(async (targetSt?: Student | null, isPrevious: boolean = false) => {
    const student = targetSt || activeStudent;

    if (!student || candidateStudents.length === 0) {
      const allDoneMsg = "Oliy hazrat, barcha o'quvchilarga sertifikat olib bo'ldik!";
      showToast(allDoneMsg, 'info');
      await speakPolitely(allDoneMsg);
      return;
    }

    clearAutoEmailTimers();

    // STEP 1: Copy Name INSTANTLY (< 50ms)
    await copyToClipboard(student.fullName);
    setCopyStep('name_copied');
    showToast(`1. Ism nusxalandi: "${student.fullName}"`, 'success');

    const prefixPhrase = isPrevious 
      ? `Oliy hazrat, avvalgi o'quvchi ${student.fullName}ning ismini nusxalab oldim!`
      : `Oliy hazrat, ${student.fullName}ning ismini nusxalab oldim!`;
    
    speakPolitely(prefixPhrase);

    // STEP 2: Automatic Email Copy after 3.5 seconds
    const emailToCopy = student.assignedEmail || `${student.fullName.toLowerCase().replace(/[^a-z0-9]/g, '')}@gmail.com`;
    let timeLeft = Math.round(settings.autoCopyEmailSeconds || 3.5);
    setAutoEmailCountdown(timeLeft);

    countdownIntervalRef.current = setInterval(() => {
      timeLeft -= 1;
      if (timeLeft <= 0) {
        if (countdownIntervalRef.current) {
          clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
        }
        setAutoEmailCountdown(null);
      } else {
        setAutoEmailCountdown(timeLeft);
      }
    }, 1000);

    autoEmailTimerRef.current = setTimeout(async () => {
      await copyToClipboard(emailToCopy);
      setCopyStep('email_copied');
      showToast(`2. Pochta nusxalandi: "${emailToCopy}"`, 'success');
      clearAutoEmailTimers();
    }, (settings.autoCopyEmailSeconds || 3.5) * 1000);

  }, [activeStudent, candidateStudents.length, settings.autoCopyEmailSeconds, clearAutoEmailTimers, showToast, speakPolitely]);

  // ACTION 1: Next Student ("Hey keyingisi")
  const handleNextStudent = useCallback(() => {
    if (candidateStudents.length === 0) {
      executeSequentialCopy(null);
      return;
    }
    if (candidateStudents.length === 1) {
      executeSequentialCopy(activeStudent);
      return;
    }
    const nextIdx = (studentPointerIndex + 1) % candidateStudents.length;
    setStudentPointerIndex(nextIdx);
    const nextSt = candidateStudents[nextIdx];
    executeSequentialCopy(nextSt, false);
  }, [candidateStudents, studentPointerIndex, activeStudent, executeSequentialCopy]);

  // ACTION 2: Previous Student ("Hey avvalgisi")
  const handlePrevStudent = useCallback(() => {
    if (candidateStudents.length === 0) {
      speakPolitely("Oliy hazrat, ro'yxatda o'quvchilar mavjud emas!");
      return;
    }

    if (studentPointerIndex <= 0) {
      const topMsg = "Oliy hazrat, bu o'quvchidan oldin boshqa o'quvchi mavjud emas, ro'yxatning boshidasiz!";
      showToast(topMsg, 'info');
      speakPolitely(topMsg);
      return;
    }

    const prevIdx = studentPointerIndex - 1;
    setStudentPointerIndex(prevIdx);
    const prevSt = candidateStudents[prevIdx];
    executeSequentialCopy(prevSt, true);
  }, [candidateStudents, studentPointerIndex, executeSequentialCopy, showToast, speakPolitely]);

  // ACTION 3: Paste Certificate Link & Mark Certified ("Hey qo'yish")
  const handlePasteCertificate = useCallback(async () => {
    if (!activeStudent) {
      speakPolitely("Oliy hazrat, sertifikat qo'yish uchun o'quvchi tanlanmadi!");
      return;
    }

    const clipText = await readFromClipboard();
    const certUrl = clipText || activeStudent.certificateLink || 'https://coursera.org/verify';

    const updatedStudent: Student = {
      ...activeStudent,
      status: 'certified',
      certificateLink: certUrl,
      certifiedAt: new Date().toISOString(),
    };

    if (onSaveStudent) {
      await onSaveStudent(updatedStudent);
    }
    recordCertifyEvent(activeStudent.id, activeStudent.fullName);

    showToast(`✅ Sertifikat saqlandi: ${activeStudent.fullName}`, 'success');
    await speakPolitely(`Oliy hazrat, ${activeStudent.fullName}ning sertifikati muvaffaqiyatli joylashtirildi va saqlandi!`);

    setTimeout(() => {
      handleNextStudent();
    }, 1200);
  }, [activeStudent, onSaveStudent, showToast, speakPolitely, handleNextStudent]);

  // ACTION 4: Process file for drafted class
  const handleProcessClassFile = useCallback(async (file: File, draftInfo: PendingClassDraft) => {
    try {
      showToast(`📁 "${file.name}" tahlil qilinmoqda...`, 'info');
      const extracted: ExtractedDocumentResult = await extractStudentsFromFile(file);

      const parsed = extracted.students || [];
      const incompleteCount = parsed.filter(s => !s.birthDate || !s.passportOrId).length;

      const updatedDraft: PendingClassDraft = {
        ...draftInfo,
        matchedFile: file,
        matchedFileName: file.name,
        students: parsed,
        incompleteCount,
      };
      setClassDraft(updatedDraft);

      // Cache file in session
      sessionUploadedFilesRef.current.set(file.name.toLowerCase(), file);

      if (incompleteCount > 0) {
        setConversationState('waiting_fill_incomplete');
        const warnPhrase = `Oliy hazrat, ${draftInfo.name} sinfida ${parsed.length} ta o'quvchi aniqlandi. Ammo bu sinfda to'ldirilmagan ma'lumotlar bor. Iltimos ularni to'ldiring, so'ng davom et deb ayting.`;
        showToast(`⚠️ ${incompleteCount} ta o'quvchida ma'lumot yetarli emas`, 'warn');
        speakPolitely(warnPhrase);
      } else {
        setConversationState('idle');
        // All students are complete, can be saved or confirmed
        const readyPhrase = `Oliy hazrat, ${draftInfo.name} sinfida barcha ${parsed.length} ta o'quvchi ma'lumotlari to'liq aniqlandi. Saqlashga tayyorman!`;
        showToast(`✅ ${parsed.length} ta o'quvchi tayyor`, 'success');
        speakPolitely(readyPhrase);
      }
    } catch (err: any) {
      showToast("Faylni o'qishda xatolik bo'ldi", 'warn');
      speakPolitely("Oliy hazrat, ushbu faylni o'qishda xatolik yuz berdi. Iltimos boshqa fayl tanlang.");
    }
  }, [showToast, speakPolitely]);

  // ACTION 5: Finalize and Save Class + Students
  const handleFinalizeSaveClass = useCallback(async () => {
    if (!classDraft) return;

    const classId = classDraft.id || `class_${Date.now()}`;
    const newClassGroup: ClassGroup = {
      id: classId,
      name: classDraft.name,
      teacherName: classDraft.teacherName || "Belgilanmagan",
      paidAmount: 0,
      pricePerStudent: 5000,
    };

    const newStudentObjects: Student[] = classDraft.students.map((st, idx) => ({
      id: `st_${Date.now()}_${idx}`,
      fullName: st.fullName,
      birthDate: st.birthDate,
      passportOrId: st.passportOrId,
      classId,
      status: 'pending',
      createdAt: new Date().toISOString(),
    }));

    if (onSaveClassAndStudents) {
      onSaveClassAndStudents(newClassGroup, newStudentObjects, emailPool);
    } else {
      if (onSaveClass) await onSaveClass(newClassGroup);
      if (onAddBatchStudents) await onAddBatchStudents(newStudentObjects);
    }

    if (onSelectClass) {
      onSelectClass(classId);
    }

    const successMsg = `Oliy hazrat, ${newClassGroup.name} sinfi va barcha o'quvchilar muvaffaqiyatli saqlandi!`;
    showToast(successMsg, 'success');
    speakPolitely(successMsg);

    setClassDraft(null);
    setConversationState('idle');
    setIsSleepMode(true); // Return to sleep mode as requested!
  }, [classDraft, emailPool, onSaveClassAndStudents, onSaveClass, onAddBatchStudents, onSelectClass, showToast, speakPolitely]);

  // GEMINI FLASH AI BRAIN CALLER
  const askGeminiVoiceAssistant = useCallback(async (query: string) => {
    if (!query || !query.trim()) return;

    setIsAiThinking(true);
    setLastUserQuery(query);

    const knownFileNames = Array.from(sessionUploadedFilesRef.current.keys());

    try {
      const resp = await fetch('/api/voice-assistant/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userQuery: query,
          context: {
            ...statsSummary,
            activeClassName: currentClass?.name || '',
            conversationState,
            pendingClassDraft: classDraft ? {
              name: classDraft.name,
              teacherName: classDraft.teacherName,
              incompleteCount: classDraft.incompleteCount,
            } : null,
            knownFileNames,
          },
        }),
      });

      const data = await resp.json();
      setIsAiThinking(false);

      if (!data || !data.spokenResponse) {
        throw new Error("Bo'sh javob");
      }

      setLastAiResponse(data.spokenResponse);
      speakPolitely(data.spokenResponse);

      // EXECUTE STRUCTURED ACTIONS FROM GEMINI FLASH:
      const act = data.action;
      const actData = data.actionData || {};

      if (act === 'SEARCH_STUDENT') {
        const qName = (actData.studentName || '').toLowerCase().trim();
        const qClass = (actData.className || '').toLowerCase().trim();

        let searchPool = students;
        if (qClass) {
          const matchCls = classes.find(c => c.name.toLowerCase().includes(qClass));
          if (matchCls) {
            searchPool = students.filter(s => s.classId === matchCls.id);
          }
        }

        const found = searchPool.find(s => s.fullName.toLowerCase().includes(qName)) ||
                      students.find(s => s.fullName.toLowerCase().includes(qName));

        if (found) {
          setFoundStudentHighlight(found);
          if (onSelectClass) onSelectClass(found.classId);
          showToast(`🎯 Topildi: ${found.fullName}`, 'success');
        } else {
          setFoundStudentHighlight(null);
          showToast(`Qidiruv: "${qName}" topilmadi`, 'warn');
        }
      } else if (act === 'CREATE_CLASS_INIT') {
        const clsName = actData.className || 'Yangi sinf';
        const tName = actData.teacherName || 'Belgilanmagan';

        const newDraft: PendingClassDraft = {
          id: `class_${Date.now()}`,
          name: clsName,
          teacherName: tName,
          students: [],
          incompleteCount: 0,
        };
        setClassDraft(newDraft);

        // Check if any tracked file matches the class name
        const cleanName = clsName.toLowerCase().replace(/[^a-z0-9]/g, '');
        let matchedFile: File | undefined;
        let matchedName = '';

        for (const [fName, fileObj] of sessionUploadedFilesRef.current.entries()) {
          const normF = fName.toLowerCase().replace(/[^a-z0-9]/g, '');
          if (normF.includes(cleanName) || cleanName.includes(normF)) {
            matchedFile = fileObj;
            matchedName = fName;
            break;
          }
        }

        if (matchedFile) {
          newDraft.matchedFile = matchedFile;
          newDraft.matchedFileName = matchedName;
          setClassDraft({ ...newDraft });
          setConversationState('waiting_file_confirmation');
          speakPolitely(`Oliy hazrat, siz aytgan ${clsName} sinfi uchun '${matchedName}' fayli topildi. Bu o'sha siz aytgan sinfmi?`);
        } else {
          setConversationState('waiting_file_upload');
          // Trigger file picker dialog
          setTimeout(() => {
            fileInputRef.current?.click();
          }, 1000);
        }
      } else if (act === 'CONFIRM_FILE') {
        if (actData.confirmed && classDraft?.matchedFile) {
          handleProcessClassFile(classDraft.matchedFile, classDraft);
        } else {
          setConversationState('waiting_file_upload');
          setTimeout(() => {
            fileInputRef.current?.click();
          }, 800);
        }
      } else if (act === 'RESUME_AFTER_UPLOAD') {
        if (classDraft?.matchedFile) {
          handleProcessClassFile(classDraft.matchedFile, classDraft);
        } else {
          fileInputRef.current?.click();
        }
      } else if (act === 'RESUME_AFTER_FILL') {
        handleFinalizeSaveClass();
      } else if (act === 'NEXT_STUDENT') {
        handleNextStudent();
      } else if (act === 'PREV_STUDENT') {
        handlePrevStudent();
      } else if (act === 'PASTE_CERTIFICATE') {
        handlePasteCertificate();
      } else if (act === 'COPY_EMAIL') {
        if (activeStudent) {
          const email = activeStudent.assignedEmail || `${activeStudent.fullName.toLowerCase().replace(/[^a-z0-9]/g, '')}@gmail.com`;
          copyToClipboard(email).then(() => {
            showToast(`Pochta nusxalandi: "${email}"`, 'success');
          });
        }
      }

      if (data.nextConversationState) {
        setConversationState(data.nextConversationState);
      }
    } catch (err: any) {
      setIsAiThinking(false);
      showToast("AI javob berishda kechikish", 'warn');
    }
  }, [statsSummary, currentClass, conversationState, classDraft, students, classes, onSelectClass, handleProcessClassFile, handleFinalizeSaveClass, handleNextStudent, handlePrevStudent, handlePasteCertificate, activeStudent, showToast, speakPolitely]);

  // Keep latest callbacks and variables fresh without re-instantiating SpeechRecognition
  const latestRef = useRef({
    settings,
    isSleepMode,
    conversationState,
    classDraft,
    activeStudent,
    handleNextStudent,
    handlePrevStudent,
    handlePasteCertificate,
    showToast,
    speakPolitely,
    askGeminiVoiceAssistant,
    handleFinalizeSaveClass,
    handleProcessClassFile,
    onOpenMetrikaScanner,
  });
  latestRef.current = {
    settings,
    isSleepMode,
    conversationState,
    classDraft,
    activeStudent,
    handleNextStudent,
    handlePrevStudent,
    handlePasteCertificate,
    showToast,
    speakPolitely,
    askGeminiVoiceAssistant,
    handleFinalizeSaveClass,
    handleProcessClassFile,
    onOpenMetrikaScanner,
  };

  // FAST SPEECH RECOGNITION LISTENER (interimResults = true for instant response)
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setMicSupported(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'uz-UZ';
    recognitionRef.current = recognition;

    recognition.onstart = () => {
      recognitionStateRef.current = 'running';
    };

    recognition.onaudiostart = () => {
      recognitionStateRef.current = 'running';
    };

    recognition.onresult = (event: any) => {
      if (isSpeakingRef.current || isProcessingCommandRef.current) return;

      const now = Date.now();
      if (now - lastCommandTimeRef.current < 1200) return;

      let fullTranscript = '';
      let isFinalResult = false;
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        fullTranscript += ' ' + event.results[i][0].transcript;
        if (event.results[i].isFinal) isFinalResult = true;
      }
      const lower = fullTranscript.toLowerCase().trim();
      const current = latestRef.current;

      // Check "Hey" Prefix requirement or Wake Word
      const hasHeyPrefix = /(hey|hay|ey|oy|хей|эй)\b/i.test(lower);

      // If in sleep mode, require "Hey" to wake up
      if (current.isSleepMode && !hasHeyPrefix) {
        return;
      }

      // If user said "Hey", wake up immediately
      if (current.isSleepMode && hasHeyPrefix) {
        setIsSleepMode(false);
      }

      // FAST PATH FOR STANDARD 4 COMMANDS (<0.1s trigger):
      if (
        /keying/i.test(lower) || 
        /kengis/i.test(lower) || 
        /keyn/i.test(lower) ||
        /sertifikat\s*ol/i.test(lower)
      ) {
        lastCommandTimeRef.current = now;
        isProcessingCommandRef.current = true;
        current.handleNextStudent();
        return;
      }

      if (
        /avvalg/i.test(lower) || 
        /avalg/i.test(lower) || 
        /olding/i.test(lower) || 
        /orqag/i.test(lower) || 
        /orqa/i.test(lower)
      ) {
        lastCommandTimeRef.current = now;
        isProcessingCommandRef.current = true;
        current.handlePrevStudent();
        return;
      }

      if (
        /qo'?y/i.test(lower) || 
        /qoy/i.test(lower) || 
        /joylashtir/i.test(lower) || 
        /saqla/i.test(lower) ||
        /tasdiq/i.test(lower)
      ) {
        // If in waiting_fill_incomplete state, "davom et" or "saqla" completes class creation
        if (current.conversationState === 'waiting_fill_incomplete') {
          lastCommandTimeRef.current = now;
          isProcessingCommandRef.current = true;
          current.handleFinalizeSaveClass();
          return;
        }

        lastCommandTimeRef.current = now;
        isProcessingCommandRef.current = true;
        current.handlePasteCertificate();
        return;
      }

      if (/pochta/i.test(lower) || /email/i.test(lower) || /mail/i.test(lower)) {
        if (current.activeStudent) {
          lastCommandTimeRef.current = now;
          isProcessingCommandRef.current = true;
          const targetSt = current.activeStudent;
          const email = targetSt.assignedEmail || `${targetSt.fullName.toLowerCase().replace(/[^a-z0-9]/g, '')}@gmail.com`;
          copyToClipboard(email).then(() => {
            current.showToast(`Pochta nusxalandi: "${email}"`, 'success');
            current.speakPolitely(`Oliy hazrat, ${targetSt.fullName}ning elektron pochtasini ham nusxaladim!`);
          });
        }
        return;
      }

      // METRIKA AI SCANNER VOICE COMMAND:
      if (/metrika/i.test(lower) || /skaner/i.test(lower) || /guvohnoma/i.test(lower)) {
        lastCommandTimeRef.current = now;
        isProcessingCommandRef.current = true;
        current.speakPolitely("Oliy hazrat, metrika va guvohnomalarni AI orqali skanerlash oynasini ochdim!");
        current.onOpenMetrikaScanner?.();
        return;
      }

      // MULTI-TURN CONFIRMATIONS ("Ha" / "Yo'q" / "Davom et"):
      if (current.conversationState === 'waiting_file_confirmation') {
        if (/\b(ha|xa|to'?g'?ri|shu|xuddi)\b/i.test(lower)) {
          lastCommandTimeRef.current = now;
          isProcessingCommandRef.current = true;
          if (current.classDraft?.matchedFile) {
            current.handleProcessClassFile(current.classDraft.matchedFile, current.classDraft);
          }
          return;
        }
        if (/\b(yo'?q|yoq|emas|boshqa)\b/i.test(lower)) {
          lastCommandTimeRef.current = now;
          isProcessingCommandRef.current = true;
          setConversationState('waiting_file_upload');
          fileInputRef.current?.click();
          current.speakPolitely("Tushundim, Oliy hazrat. Unda iltimos o'zingiz o'sha sinf fayllarini yuklang.");
          return;
        }
      }

      if (current.conversationState === 'waiting_fill_incomplete' || current.conversationState === 'waiting_file_upload') {
        if (/davom\s*(et|ettir)/i.test(lower) || /saqla/i.test(lower)) {
          lastCommandTimeRef.current = now;
          isProcessingCommandRef.current = true;
          current.handleFinalizeSaveClass();
          return;
        }
      }

      // GEMINI FLASH AI BRAIN PATH (Complex questions, reports, student search, class creation):
      // Trigger when phrase has a few words or isFinal
      if (lower.split(/\s+/).length >= 2 || isFinalResult) {
        lastCommandTimeRef.current = now;
        isProcessingCommandRef.current = true;
        // Strip wake word for cleaner prompt
        const cleanPrompt = lower.replace(/^(hey|hay|ey|oy|хей|эй)\s*/i, '').trim();
        current.askGeminiVoiceAssistant(cleanPrompt || lower);
      }
    };

    recognition.onerror = (e: any) => {
      recognitionStateRef.current = 'inactive';
      if (e.error === 'not-allowed') {
        setIsListening(false);
        latestRef.current.showToast("Mikrofonga ruxsat berilmadi", 'warn');
      }
    };

    recognition.onend = () => {
      recognitionStateRef.current = 'inactive';
      if (isListeningRef.current && !isSpeakingRef.current && !isProcessingCommandRef.current) {
        setTimeout(() => {
          safeStartRecognition();
        }, 150);
      }
    };

    return () => {
      try {
        recognitionStateRef.current = 'inactive';
        recognition.stop();
      } catch {}
    };
  }, [safeStartRecognition]);

  // Toggle Microphone
  const toggleListening = useCallback(() => {
    if (!micSupported) {
      showToast("Brauzeringizda SpeechRecognition qo'llab-quvvatlanmaydi", 'warn');
      return;
    }

    unlockAudioPlayback();

    if (isListening) {
      setIsListening(false);
      isListeningRef.current = false;
      safeStopRecognition();
      showToast("🎙️ Mikrofon to'xtatildi", 'info');
    } else {
      setIsListening(true);
      isListeningRef.current = true;
      setIsSleepMode(false);
      safeStartRecognition();
      showToast("🎙️ Ovozli AI yordamchi ishga tushdi!", 'success');
      speakPolitely("Xizmatingizdaman, Oliy hazrat!");
    }
  }, [isListening, micSupported, showToast, speakPolitely, safeStartRecognition, safeStopRecognition]);

  // File Input Handler
  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    sessionUploadedFilesRef.current.set(file.name.toLowerCase(), file);

    const draft = classDraft || {
      id: `class_${Date.now()}`,
      name: file.name.replace(/\.[^/.]+$/, '').replace(/_|-/g, ' '),
      teacherName: 'Belgilanmagan',
      students: [],
      incompleteCount: 0,
    };

    handleProcessClassFile(file, draft);
    e.target.value = '';
  };

  // Draggable Mouse Handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    isDraggingRef.current = true;
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      posX: position.x,
      posY: position.y,
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDraggingRef.current) return;
    const dx = e.clientX - dragStartRef.current.startX;
    const dy = e.clientY - dragStartRef.current.startY;
    const nextX = Math.max(10, Math.min(window.innerWidth - 340, dragStartRef.current.posX + dx));
    const nextY = Math.max(10, Math.min(window.innerHeight - 150, dragStartRef.current.posY + dy));
    setPosition({ x: nextX, y: nextY });
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup', handleMouseUp);
    try {
      localStorage.setItem(STORAGE_POS_KEY, JSON.stringify(position));
    } catch {}
  };

  return (
    <>
      {/* Hidden file input for AI-driven class upload */}
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileSelected} 
        accept=".xlsx,.xls,.docx,.pdf,.csv,.txt" 
        className="hidden" 
      />

      {/* FLOATING ACTION TOAST */}
      {actionToast && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[9999] pointer-events-none animate-fade-in">
          <div className={`px-4 py-2 rounded-2xl shadow-2xl border text-xs sm:text-sm font-semibold flex items-center gap-2.5 backdrop-blur-xl ${
            actionToast.type === 'success'
              ? 'bg-slate-950/95 text-emerald-300 border-emerald-500/50'
              : actionToast.type === 'warn'
              ? 'bg-slate-950/95 text-rose-300 border-rose-500/50'
              : 'bg-slate-950/95 text-amber-300 border-amber-500/50'
          }`}>
            {actionToast.type === 'success' && <CheckCircle className="w-4 h-4 text-emerald-400" />}
            {actionToast.type === 'warn' && <AlertTriangle className="w-4 h-4 text-rose-400" />}
            {actionToast.type === 'info' && <Sparkles className="w-4 h-4 text-amber-400" />}
            <span>{actionToast.text}</span>
          </div>
        </div>
      )}

      {/* DRAGGABLE FLOATING VOICE ASSISTANT */}
      <aside 
        aria-label="Gemini Flash Ovozli Yordamchi"
        style={{ left: `${position.x}px`, top: `${position.y}px` }}
        className="fixed z-[9000] select-none font-sans"
      >
        {isMinimized ? (
          /* MINIMIZED PILL: Compact & Movable anywhere */
          <div className="flex items-center gap-2 bg-slate-900/95 text-white p-2 rounded-full shadow-2xl border border-white/20 backdrop-blur-xl ring-1 ring-black/40">
            <div 
              onMouseDown={handleMouseDown}
              className="p-1 cursor-grab active:cursor-grabbing text-slate-400 hover:text-white"
              title="Surish uchun bosing"
            >
              <GripHorizontal className="w-4 h-4" />
            </div>

            <button
              type="button"
              onClick={toggleListening}
              className={`w-9 h-9 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                isListening
                  ? isSleepMode
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'bg-rose-600 text-white shadow-lg shadow-rose-500/50 animate-pulse'
                  : 'bg-slate-700 text-white hover:bg-slate-600'
              }`}
              title={isListening ? "Mikrofonni to'xtatish" : "Mikrofonni yoqish"}
            >
              {isListening ? (isSleepMode ? <Moon className="w-4 h-4 text-amber-300" /> : <Mic className="w-4 h-4" />) : <MicOff className="w-4 h-4 text-white/80" />}
            </button>

            <button
              type="button"
              onClick={() => setIsMinimized(false)}
              className="flex items-center gap-2 pr-2 text-left cursor-pointer group"
            >
              <div className="max-w-[130px] truncate">
                <div className="text-[10px] text-amber-300 font-bold uppercase truncate flex items-center gap-1">
                  <span>{currentClass ? `${currentClass.name} sinfi` : 'AI Yordamchi'}</span>
                  <Bot className="w-2.5 h-2.5 text-cyan-400" />
                </div>
                <div className="text-xs font-semibold text-slate-100 truncate">
                  {statsSummary.todayEarnings > 0 ? `${statsSummary.todayEarnings.toLocaleString()} so'm` : "Oliy hazrat"}
                </div>
              </div>
              <Maximize2 className="w-3.5 h-3.5 text-slate-400 group-hover:text-white transition-colors" />
            </button>
          </div>
        ) : (
          /* EXPANDED DRAGGABLE HUD */
          <div className="w-[320px] sm:w-[350px] bg-slate-900/95 text-white rounded-2xl shadow-2xl border border-white/20 backdrop-blur-2xl overflow-hidden ring-1 ring-black/50">
            {/* Header: Draggable Grip Handle */}
            <div 
              onMouseDown={handleMouseDown}
              className="p-2.5 bg-gradient-to-r from-slate-950 via-indigo-950 to-slate-950 border-b border-white/10 flex items-center justify-between cursor-grab active:cursor-grabbing"
              title="Panelni ekranning xohlagan joyiga surishingiz mumkin"
            >
              <div className="flex items-center gap-2 min-w-0">
                <GripHorizontal className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-extrabold text-xs text-white truncate flex items-center gap-1">
                      <Bot className="w-3.5 h-3.5 text-cyan-400" />
                      Gemini Flash AI
                    </span>
                    <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      Oliy hazrat
                    </span>
                    {isSleepMode ? (
                      <span className="px-1 py-0.2 rounded text-[8px] bg-indigo-500/20 text-indigo-300 font-bold flex items-center gap-0.5">
                        <Moon className="w-2.5 h-2.5" /> Uyquda
                      </span>
                    ) : (
                      <span className="px-1 py-0.2 rounded text-[8px] bg-emerald-500/20 text-emerald-300 font-bold flex items-center gap-0.5">
                        <Sun className="w-2.5 h-2.5 text-amber-300" /> Faol
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-blue-300 truncate">
                    🌊 {currentClass ? `${currentClass.name} sinfi (${currentClass.teacherName || "Ustoz"})` : 'Barcha sinflar'}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setIsSleepMode(prev => !prev)}
                  className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                    isSleepMode ? 'bg-indigo-600/50 text-indigo-200' : 'hover:bg-white/10 text-slate-400 hover:text-white'
                  }`}
                  title={isSleepMode ? "Uyg'otish" : "Uyqu rejimiga o'tkazish"}
                >
                  {isSleepMode ? <Moon className="w-3.5 h-3.5 text-amber-300" /> : <Sun className="w-3.5 h-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={() => setIsSettingsOpen(prev => !prev)}
                  className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer"
                  title="Sozlamalar"
                >
                  <Settings className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsMinimized(true)}
                  className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer"
                  title="Kichraytirish"
                >
                  <Minimize2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Quick Live Stats Pill Bar */}
            <div className="px-3 py-1.5 bg-white/5 border-b border-white/5 grid grid-cols-3 gap-1 text-center text-[10px]">
              <div className="bg-emerald-500/10 rounded-lg p-1 border border-emerald-500/20">
                <div className="text-[9px] text-emerald-400/90 font-medium">💰 Bugun daromad</div>
                <div className="font-extrabold text-emerald-300">{statsSummary.todayEarnings.toLocaleString()} so'm</div>
              </div>
              <div className="bg-blue-500/10 rounded-lg p-1 border border-blue-500/20">
                <div className="text-[9px] text-blue-400/90 font-medium">🏆 Bugun sertifikat</div>
                <div className="font-extrabold text-blue-300">{statsSummary.todayCertifiedCount} ta</div>
              </div>
              <div className="bg-rose-500/10 rounded-lg p-1 border border-rose-500/20">
                <div className="text-[9px] text-rose-400/90 font-medium">💳 Jami qarz</div>
                <div className="font-extrabold text-rose-300">{statsSummary.totalDebt.toLocaleString()} so'm</div>
              </div>
            </div>

            {/* Content Body */}
            <div className="p-3 space-y-2.5 max-h-[480px] overflow-y-auto">
              {/* AI Real-Time Status / Dialogue Bubble */}
              {(isAiThinking || lastAiResponse || lastUserQuery) && (
                <div className="p-2.5 rounded-xl bg-gradient-to-br from-indigo-950/60 to-purple-950/60 border border-indigo-500/30 text-xs space-y-1.5 shadow-inner">
                  {lastUserQuery && (
                    <div className="text-[11px] text-indigo-300 flex items-center gap-1.5 font-medium truncate">
                      <span className="text-amber-400">🗣️</span>
                      <span className="italic truncate">"{lastUserQuery}"</span>
                    </div>
                  )}

                  {isAiThinking ? (
                    <div className="flex items-center gap-2 text-cyan-300 font-semibold py-1 animate-pulse">
                      <Bot className="w-4 h-4 animate-spin text-cyan-400" />
                      <span>Gemini Flash tahlil qilmoqda...</span>
                    </div>
                  ) : lastAiResponse ? (
                    <div className="text-[11px] text-slate-100 font-medium leading-relaxed flex items-start gap-1.5">
                      <Bot className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0 mt-0.5" />
                      <span>{lastAiResponse}</span>
                    </div>
                  ) : null}
                </div>
              )}

              {/* Class Creation Draft HUD (When AI initiates new class) */}
              {classDraft && (
                <div className="p-2.5 rounded-xl bg-amber-950/40 border border-amber-500/40 text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-amber-300 flex items-center gap-1">
                      <FolderPlus className="w-3.5 h-3.5 text-amber-400" />
                      Yangi sinf: {classDraft.name}
                    </span>
                    <button
                      onClick={() => setClassDraft(null)}
                      className="text-slate-400 hover:text-white"
                      title="Bekor qilish"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="text-[11px] text-slate-300">
                    Sinf rahbari: <strong className="text-white">{classDraft.teacherName || "Belgilanmagan"}</strong>
                  </div>

                  {classDraft.matchedFileName ? (
                    <div className="text-[11px] text-emerald-300 font-mono flex items-center gap-1 bg-emerald-950/50 p-1.5 rounded-lg border border-emerald-500/30">
                      <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="truncate">{classDraft.matchedFileName} ({classDraft.students.length} o'quvchi)</span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full py-1.5 px-2 rounded-lg bg-blue-600/40 hover:bg-blue-600/60 border border-blue-400/30 text-blue-200 font-semibold text-[11px] flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>📁 Kompyuterdan faylni tanlash</span>
                    </button>
                  )}

                  {classDraft.incompleteCount > 0 && (
                    <div className="p-1.5 bg-rose-500/20 border border-rose-500/30 rounded-lg text-rose-300 text-[10px] flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-400 flex-shrink-0" />
                      <span>⚠️ {classDraft.incompleteCount} ta o'quvchida ma'lumot to'liq emas. To'ldiring va "Davom et" deng.</span>
                    </div>
                  )}

                  {classDraft.students.length > 0 && (
                    <button
                      type="button"
                      onClick={handleFinalizeSaveClass}
                      className="w-full py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-[11px] flex items-center justify-center gap-1 shadow-md cursor-pointer transition-all"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Sinfni to'liq saqlash (Davom et)</span>
                    </button>
                  )}
                </div>
              )}

              {/* Found Student Highlight Card (from Voice Search) */}
              {foundStudentHighlight && (
                <div className="p-2.5 rounded-xl bg-cyan-950/40 border border-cyan-500/40 text-xs space-y-1 animate-pulse">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-cyan-300 font-bold uppercase flex items-center gap-1">
                      <Search className="w-3 h-3 text-cyan-400" />
                      Qidiruv natijasi
                    </span>
                    <button onClick={() => setFoundStudentHighlight(null)} className="text-slate-400 hover:text-white">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="font-extrabold text-white text-xs">{foundStudentHighlight.fullName}</div>
                  <div className="text-[10px] text-slate-300">
                    Holati: <strong className="text-emerald-400">{foundStudentHighlight.status === 'certified' ? 'Sertifikatlangan' : 'Kutilmoqda'}</strong>
                  </div>
                </div>
              )}

              {/* ACTIVE TARGET STUDENT CARD */}
              {activeStudent ? (
                <div className="p-3 rounded-xl bg-white/5 border border-white/10 space-y-1.5 relative overflow-hidden group">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-400">
                      O'quvchi {studentPointerIndex + 1} / {candidateStudents.length}
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300">
                      Kutilmoqda
                    </span>
                  </div>

                  {/* Student Full Name */}
                  <div className="text-sm sm:text-base font-extrabold text-white tracking-tight leading-snug">
                    {activeStudent.fullName}
                  </div>

                  {/* Student Email */}
                  <div className="text-[11px] text-blue-200/90 font-mono flex items-center gap-1 truncate">
                    <Mail className="w-3 h-3 text-blue-400 flex-shrink-0" />
                    <span className="truncate">{activeStudent.assignedEmail || "Pochta biriktirilmagan"}</span>
                  </div>

                  {/* Sequential Copy Progress Bar (1. Ism -> 2. Pochta) */}
                  <div className="pt-1 border-t border-white/10 flex items-center justify-between text-[10px]">
                    <div className="flex items-center gap-1.5">
                      <span className={`px-1.5 py-0.5 rounded font-bold ${
                        copyStep === 'name_copied' || copyStep === 'email_copied'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : 'bg-white/10 text-slate-400'
                      }`}>
                        1. Ism
                      </span>
                      <span className="text-slate-500">➔</span>
                      <span className={`px-1.5 py-0.5 rounded font-bold ${
                        copyStep === 'email_copied'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : autoEmailCountdown !== null
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse'
                          : 'bg-white/10 text-slate-400'
                      }`}>
                        2. Pochta {autoEmailCountdown !== null ? `(${autoEmailCountdown}s)` : ''}
                      </span>
                    </div>

                    {copyStep === 'email_copied' && (
                      <span className="text-emerald-400 font-semibold flex items-center gap-0.5">
                        <Check className="w-3 h-3" />
                        <span>Ikkalasi tayyor</span>
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                /* No students in this category */
                <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-center space-y-1">
                  <CheckCircle className="w-6 h-6 text-emerald-400 mx-auto" />
                  <div className="font-bold text-xs text-slate-100">
                    Oliy hazrat, barcha o'quvchilarga sertifikat olib bo'ldik!
                  </div>
                </div>
              )}

              {/* Prev, Paste/Certify, and Next Action Controls */}
              <div className="flex items-center justify-between gap-1.5">
                <button
                  type="button"
                  onClick={handlePrevStudent}
                  className="p-2 rounded-xl bg-white/5 hover:bg-white/15 text-slate-300 hover:text-white transition-all cursor-pointer"
                  title="Avvalgi o'quvchi (Hey avvalgisi)"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={handlePasteCertificate}
                  className="py-2 px-2.5 rounded-xl bg-emerald-600/90 hover:bg-emerald-600 text-white font-bold text-[11px] flex items-center gap-1 shadow-sm transition-all cursor-pointer"
                  title="Buferdagi Coursera havolasini qo'yish va sertifikatlash ('Hey qo'yish')"
                >
                  <ClipboardPaste className="w-3.5 h-3.5" />
                  <span>Qo'yish</span>
                </button>

                <button
                  type="button"
                  onClick={handleNextStudent}
                  className="flex-1 py-2 px-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 active:scale-[0.98] text-white font-extrabold text-[11px] flex items-center justify-center gap-1 shadow-md transition-all cursor-pointer group"
                  title="Keyingi o'quvchi ('Hey keyingisi')"
                >
                  <Sparkles className="w-3 h-3 text-amber-300" />
                  <span>Keyingisi</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Microphone & Voice Status Bar */}
              <div className="pt-2 border-t border-white/10 flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={toggleListening}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full font-bold text-[11px] transition-all cursor-pointer ${
                    isListening
                      ? isSleepMode
                        ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
                        : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                      : 'bg-white/5 text-slate-300 border border-white/10 hover:bg-white/10'
                  }`}
                >
                  <div className={`w-2 h-2 rounded-full ${isListening ? (isSleepMode ? 'bg-indigo-400' : 'bg-rose-500 animate-ping') : 'bg-slate-500'}`} />
                  <span>{isListening ? (isSleepMode ? 'Uyquda ("Hey" deng)' : 'Tinglamoqda...') : 'Mikrofon o\'chiq'}</span>
                </button>

                {isSpeaking ? (
                  <span className="text-emerald-400 font-bold text-[11px] flex items-center gap-1 animate-pulse">
                    <Volume2 className="w-3.5 h-3.5" />
                    <span>Gapirmoqda...</span>
                  </span>
                ) : (
                  <span className="text-[10px] text-slate-400 font-mono">
                    "Hey hisobot" / "Hey yangi sinf"
                  </span>
                )}
              </div>
            </div>

            {/* SETTINGS DRAWER */}
            {isSettingsOpen && (
              <div className="p-3 bg-slate-950/90 border-t border-white/10 text-xs space-y-2.5 animate-fade-in">
                <div className="font-bold text-slate-200 flex items-center justify-between">
                  <span>Yordamchi sozlamalari</span>
                  <button onClick={() => setIsSettingsOpen(false)} className="text-slate-400 hover:text-white">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] text-slate-400">Ovoz turi (Microsoft Neural Edge TTS)</label>
                  <select
                    value={settings.voice}
                    onChange={(e) => {
                      const updated = { ...settings, voice: e.target.value as UzbekVoiceId };
                      setSettings(updated);
                      saveVoiceAssistantSettings(updated);
                    }}
                    className="w-full bg-slate-800 border border-white/20 rounded-lg p-1.5 text-xs text-white"
                  >
                    <option value="uz-UZ-SardorNeural">Sardor (Erkak kishi, 100% tabiiy o'zbekcha)</option>
                    <option value="uz-UZ-MadinaNeural">Madina (Ayol kishi, 100% tabiiy o'zbekcha)</option>
                  </select>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-300">Pochta avtomatik nusxalash kechikishi:</span>
                  <span className="font-bold text-amber-300">{settings.autoCopyEmailSeconds || 3.5}s</span>
                </div>
              </div>
            )}
          </div>
        )}
      </aside>
    </>
  );
};
