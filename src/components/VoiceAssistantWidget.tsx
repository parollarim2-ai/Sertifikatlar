import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { ClassGroup, Student, EmailAccount } from '../types';
import { 
  speakUzbekVoice, 
  stopSpeaking,
  copyToClipboard, 
  readFromClipboard,
  unlockAudioPlayback,
  loadVoiceAssistantSettings, 
  saveVoiceAssistantSettings,
  VoiceAssistantSettings,
  UzbekVoiceId 
} from '../services/voiceAssistantService';
import { recordCertifyEvent } from '../utils/operatorSpeedTracker';
import { 
  Mic, 
  MicOff, 
  Volume2, 
  CheckCircle, 
  ChevronRight, 
  ChevronLeft, 
  RotateCcw,
  Settings, 
  Sparkles, 
  Minimize2, 
  Maximize2, 
  Mail, 
  Check, 
  GripHorizontal,
  ClipboardPaste,
  AlertTriangle,
  X,
  VolumeX,
  Minus
} from 'lucide-react';

interface VoiceAssistantWidgetProps {
  classes: ClassGroup[];
  students: Student[];
  emailPool?: EmailAccount[];
  activeClassId?: string;
  selectedStatusFilters?: string[];
  isOpen?: boolean;
  onToggleOpen?: (open: boolean) => void;
  onSelectClass?: (classId: string) => void;
  onSaveStudent?: (student: Student) => Promise<void> | void;
  onSaveClass?: (classGroup: ClassGroup) => Promise<void> | void;
  onAddBatchStudents?: (students: Student[]) => Promise<void> | void;
  onOpenBulkUploadModal?: (classId?: string) => void;
  onOpenStudentModal?: (student: Student) => void;
  onOpenMetrikaScanner?: () => void;
  onSaveClassAndStudents?: (targetClass: ClassGroup, newStudents: Student[], updatedEmailPool: EmailAccount[]) => void;
}

const STORAGE_POS_KEY = 'b1m_voice_widget_position_v5';

export const VoiceAssistantWidget: React.FC<VoiceAssistantWidgetProps> = ({
  classes,
  students,
  activeClassId,
  selectedStatusFilters = [],
  isOpen,
  onToggleOpen,
  onSelectClass,
  onSaveStudent,
}) => {
  // Assistant Settings
  const [settings, setSettings] = useState<VoiceAssistantSettings>(() => loadVoiceAssistantSettings());
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Widget Visibility & Minimized state
  // CRITICAL USER REQUIREMENT: Always default to false on refresh so it NEVER jumps open or gets in the way!
  const [isVisible, setIsVisible] = useState<boolean>(() => {
    if (typeof isOpen === 'boolean') return isOpen;
    return false; // Always default to closed on page refresh!
  });

  // Keep in sync with parent isOpen if controlled
  useEffect(() => {
    if (typeof isOpen === 'boolean') {
      setIsVisible(isOpen);
    }
  }, [isOpen]);

  // Default to minimized pill so if opened, it's non-intrusive
  const [isMinimized, setIsMinimized] = useState<boolean>(true);

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
  const rafIdRef = useRef<number | null>(null);

  // Assistant Live State
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [micSupported, setMicSupported] = useState(true);
  const [actionToast, setActionToast] = useState<{ text: string; type: 'success' | 'info' | 'warn' } | null>(null);

  // Sequential Copying State (1. Ism -> 2. Pochta)
  const [copyStep, setCopyStep] = useState<'idle' | 'name_copied' | 'email_copied'>('idle');
  const [autoEmailCountdown, setAutoEmailCountdown] = useState<number | null>(null);
  const autoEmailTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Student Navigation Index in Candidate List
  const [studentPointerIndex, setStudentPointerIndex] = useState(0);

  // Speech Recognition and Command Refs (Lazy initialized only when listening!)
  const recognitionRef = useRef<any>(null);
  const isListeningRef = useRef(false);
  const isSpeakingRef = useRef(false);
  const isProcessingCommandRef = useRef(false);
  const recognitionStateRef = useRef<'inactive' | 'starting' | 'running' | 'stopping'>('inactive');
  const lastCommandTimeRef = useRef(0);

  // Stop & Clean up Speech Recognition immediately
  const stopAndCleanupRecognition = useCallback(() => {
    isListeningRef.current = false;
    setIsListening(false);
    recognitionStateRef.current = 'inactive';
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onstart = null;
        recognitionRef.current.onaudiostart = null;
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }
  }, []);

  const handleToggleVisible = (visible: boolean) => {
    setIsVisible(visible);
    onToggleOpen?.(visible);
    if (!visible) {
      stopAndCleanupRecognition();
    }
  };

  const handleToggleMinimized = (minimized: boolean) => {
    setIsMinimized(minimized);
  };

  // Current selected class
  const currentClass = useMemo(() => {
    if (!activeClassId || activeClassId === 'all') return null;
    return classes.find(c => c.id === activeClassId) || null;
  }, [classes, activeClassId]);

  // Candidates for copying: filtered by active class & status
  const candidateStudents = useMemo(() => {
    let pool = students;
    if (activeClassId && activeClassId !== 'all') {
      pool = pool.filter(s => s.classId === activeClassId);
    }

    if (selectedStatusFilters.length > 0) {
      pool = pool.filter(s => {
        if (selectedStatusFilters.includes('certified') && s.status === 'certified') return true;
        if (selectedStatusFilters.includes('error') && (s.status === 'error' || s.hasError)) return true;
        if (selectedStatusFilters.includes('pending') && s.status !== 'certified' && !s.hasError && s.status !== 'error') return true;
        return false;
      });
    } else {
      // By default, prioritize pending students who need certificates!
      const pending = pool.filter(s => s.status !== 'certified');
      if (pending.length > 0) return pending;
    }

    return pool;
  }, [students, activeClassId, selectedStatusFilters]);

  // Active student at pointer
  const activeStudent: Student | null = useMemo(() => {
    if (candidateStudents.length === 0) return null;
    const clampedIndex = Math.min(studentPointerIndex, candidateStudents.length - 1);
    return candidateStudents[clampedIndex] || null;
  }, [candidateStudents, studentPointerIndex]);

  // Toast Notification helper
  const showToast = useCallback((text: string, type: 'success' | 'info' | 'warn' = 'info') => {
    setActionToast({ text, type });
    setTimeout(() => {
      setActionToast(prev => prev?.text === text ? null : prev);
    }, 3200);
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
    if (recognitionRef.current && recognitionStateRef.current === 'running') {
      try {
        recognitionRef.current.stop();
      } catch {}
    }

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
        // Resume microphone after 0.5s of silence
        setTimeout(() => {
          isProcessingCommandRef.current = false;
          if (isListeningRef.current && recognitionRef.current) {
            try {
              recognitionRef.current.start();
            } catch {}
          }
        }, 500);
      }
    );
  }, [settings.voice]);

  // CORE SEQUENTIAL ACTION: Copies name, starts timer to copy email
  const executeSequentialCopy = useCallback(async (
    targetSt?: Student | null, 
    mode: 'next' | 'prev' | 'repeat' = 'next'
  ) => {
    const student = targetSt || activeStudent;

    if (!student || candidateStudents.length === 0) {
      const allDoneMsg = "Oliy hazrat, ro'yxatda o'quvchilar mavjud emas yoki barchasiga sertifikat olib bo'lingan!";
      showToast(allDoneMsg, 'info');
      await speakPolitely(allDoneMsg);
      return;
    }

    clearAutoEmailTimers();

    // STEP 1: Copy Name INSTANTLY (< 50ms)
    await copyToClipboard(student.fullName);
    setCopyStep('name_copied');

    let toastText = `1. Ism nusxalandi: "${student.fullName}"`;
    let spokenPhrase = `Oliy hazrat, ${student.fullName}ning ismini nusxalab oldim!`;

    if (mode === 'repeat') {
      toastText = `🔄 Qaytadan nusxalandi: "${student.fullName}"`;
      spokenPhrase = `Oliy hazrat, ${student.fullName}ning ma'lumotlarini qaytadan nusxalab berdim!`;
    } else if (mode === 'prev') {
      toastText = `⬅️ Avvalgi: "${student.fullName}" nusxalandi`;
      spokenPhrase = `Oliy hazrat, avvalgi o'quvchi ${student.fullName}ga qaytdim!`;
    }

    showToast(toastText, 'info');
    await speakPolitely(spokenPhrase);

    // STEP 2: Automatic Email Copy after delay
    const delaySeconds = settings.autoCopyEmailSeconds || 3.5;
    let remaining = Math.ceil(delaySeconds);
    setAutoEmailCountdown(remaining);

    countdownIntervalRef.current = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        if (countdownIntervalRef.current) {
          clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
        }
        setAutoEmailCountdown(null);
      } else {
        setAutoEmailCountdown(remaining);
      }
    }, 1000);

    autoEmailTimerRef.current = setTimeout(async () => {
      const email = student.assignedEmail || `${student.fullName.toLowerCase().replace(/[^a-z0-9]/g, '')}@gmail.com`;
      await copyToClipboard(email);
      setCopyStep('email_copied');
      setAutoEmailCountdown(null);

      showToast(`2. Pochta nusxalandi: "${email}"`, 'success');
      await speakPolitely(`Elektron pochta nusxalandi!`);
    }, delaySeconds * 1000);

  }, [activeStudent, candidateStudents.length, clearAutoEmailTimers, settings.autoCopyEmailSeconds, showToast, speakPolitely]);

  // ACTION 1: Next Student ("Keyingisi")
  const handleNextStudent = useCallback(() => {
    if (candidateStudents.length === 0) {
      speakPolitely("Oliy hazrat, ro'yxatda o'quvchilar mavjud emas!");
      return;
    }

    const nextIdx = studentPointerIndex + 1;
    if (nextIdx >= candidateStudents.length) {
      const doneMsg = "Oliy hazrat, ro'yxatdagi barcha o'quvchilar ko'rib chiqildi!";
      showToast(doneMsg, 'success');
      speakPolitely(doneMsg);
      return;
    }

    setStudentPointerIndex(nextIdx);
    const nextSt = candidateStudents[nextIdx];
    executeSequentialCopy(nextSt, 'next');
  }, [candidateStudents, studentPointerIndex, executeSequentialCopy, showToast, speakPolitely]);

  // ACTION 2: Previous Student ("Avvalgisi")
  const handlePrevStudent = useCallback(() => {
    if (candidateStudents.length === 0) {
      speakPolitely("Oliy hazrat, ro'yxatda o'quvchilar mavjud emas!");
      return;
    }

    if (studentPointerIndex <= 0) {
      const topMsg = "Oliy hazrat, ro'yxatning boshidasiz!";
      showToast(topMsg, 'info');
      speakPolitely(topMsg);
      return;
    }

    const prevIdx = studentPointerIndex - 1;
    setStudentPointerIndex(prevIdx);
    const prevSt = candidateStudents[prevIdx];
    executeSequentialCopy(prevSt, 'prev');
  }, [candidateStudents, studentPointerIndex, executeSequentialCopy, showToast, speakPolitely]);

  // ACTION 3: Repeat / Re-copy current student ("Qayta" / "Qaytadan")
  const handleRepeatCurrentStudent = useCallback(() => {
    if (!activeStudent) {
      speakPolitely("Oliy hazrat, qayta nusxalash uchun o'quvchi tanlanmagan!");
      return;
    }
    executeSequentialCopy(activeStudent, 'repeat');
  }, [activeStudent, executeSequentialCopy, speakPolitely]);

  // ACTION 4: Copy Email manually ("Pochta" / "Email")
  const handleCopyEmail = useCallback(() => {
    if (!activeStudent) {
      speakPolitely("Oliy hazrat, elektron pochta nusxalash uchun o'quvchi tanlanmagan!");
      return;
    }
    const email = activeStudent.assignedEmail || `${activeStudent.fullName.toLowerCase().replace(/[^a-z0-9]/g, '')}@gmail.com`;
    copyToClipboard(email).then(() => {
      setCopyStep('email_copied');
      clearAutoEmailTimers();
      showToast(`Pochta nusxalandi: "${email}"`, 'success');
      speakPolitely(`Oliy hazrat, ${activeStudent.fullName}ning elektron pochtasini nusxaladim!`);
    });
  }, [activeStudent, clearAutoEmailTimers, showToast, speakPolitely]);

  // ACTION 5: Paste Certificate Link & Mark Certified ("Qo'y" / "Joylashtir" / "Saqla")
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
    }, 1000);
  }, [activeStudent, onSaveStudent, showToast, speakPolitely, handleNextStudent]);

  // Keep latest callbacks and variables fresh
  const latestRef = useRef({
    settings,
    activeStudent,
    handleNextStudent,
    handlePrevStudent,
    handleRepeatCurrentStudent,
    handleCopyEmail,
    handlePasteCertificate,
    showToast,
    speakPolitely,
  });
  latestRef.current = {
    settings,
    activeStudent,
    handleNextStudent,
    handlePrevStudent,
    handleRepeatCurrentStudent,
    handleCopyEmail,
    handlePasteCertificate,
    showToast,
    speakPolitely,
  };

  // Start Speech Recognition ONLY when user toggles microphone ON
  const startListeningSession = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setMicSupported(false);
      showToast("Brauzeringizda SpeechRecognition qo'llab-quvvatlanmaydi", 'warn');
      return;
    }

    stopAndCleanupRecognition();

    try {
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
        // Debounce minimum 600ms between commands
        if (now - lastCommandTimeRef.current < 600) return;

        let fullTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          fullTranscript += ' ' + event.results[i][0].transcript;
        }
        const lower = fullTranscript.toLowerCase().trim();
        const current = latestRef.current;

        // 1. COMMAND: "QAYTA" / "QAYTADAN" / "YANA" (Re-copy current student data)
        if (
          /\b(qayta|qaytadan|qayta\s*ol|qaytadan\s*ol|qayta\s*nusxa|yana\s*nusxa|qaytadan\s*nusxa|yana)\b/i.test(lower)
        ) {
          lastCommandTimeRef.current = now;
          isProcessingCommandRef.current = true;
          current.handleRepeatCurrentStudent();
          return;
        }

        // 2. COMMAND: "KEYINGISI" (Next student)
        if (
          /\b(keyingisi|keyingi|kengisi|keyngisi|keyin|sertifikat\s*ol|next)\b/i.test(lower)
        ) {
          lastCommandTimeRef.current = now;
          isProcessingCommandRef.current = true;
          current.handleNextStudent();
          return;
        }

        // 3. COMMAND: "AVVALGISI" (Previous student)
        if (
          /\b(avvalgisi|avvalgi|avalgisi|oldingi|oldingisi|orqaga|orqa|oldinga|prev)\b/i.test(lower)
        ) {
          lastCommandTimeRef.current = now;
          isProcessingCommandRef.current = true;
          current.handlePrevStudent();
          return;
        }

        // 4. COMMAND: "QO'Y" / "JOYLASHTIR" / "SAQLA" (Paste certificate & advance)
        if (
          /\b(qo'?y|qoy|qo'?yish|qoyish|joylashtir|joyla|saqla|tasdiqla|paste)\b/i.test(lower)
        ) {
          lastCommandTimeRef.current = now;
          isProcessingCommandRef.current = true;
          current.handlePasteCertificate();
          return;
        }

        // 5. COMMAND: "POCHTA" / "EMAIL" (Copy email immediately)
        if (
          /\b(pochta|email|e-mail|imeyl|mail|meyl)\b/i.test(lower)
        ) {
          lastCommandTimeRef.current = now;
          isProcessingCommandRef.current = true;
          current.handleCopyEmail();
          return;
        }
      };

      recognition.onerror = (e: any) => {
        recognitionStateRef.current = 'inactive';
        if (e.error === 'not-allowed') {
          setIsListening(false);
          isListeningRef.current = false;
          latestRef.current.showToast("Mikrofonga ruxsat berilmadi", 'warn');
        }
      };

      recognition.onend = () => {
        recognitionStateRef.current = 'inactive';
        if (isListeningRef.current && !isSpeakingRef.current && !isProcessingCommandRef.current) {
          setTimeout(() => {
            if (isListeningRef.current && recognitionRef.current) {
              try {
                recognitionRef.current.start();
              } catch {}
            }
          }, 300);
        }
      };

      recognitionStateRef.current = 'starting';
      recognition.start();
      setIsListening(true);
      isListeningRef.current = true;
    } catch {
      recognitionStateRef.current = 'inactive';
      setIsListening(false);
      isListeningRef.current = false;
    }
  }, [showToast, stopAndCleanupRecognition]);

  // Clean up on component unmount
  useEffect(() => {
    return () => {
      stopAndCleanupRecognition();
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, [stopAndCleanupRecognition]);

  // Toggle Microphone
  const toggleListening = useCallback(() => {
    unlockAudioPlayback();

    if (isListening) {
      stopAndCleanupRecognition();
      showToast("🎙️ Mikrofon to'xtatildi", 'info');
    } else {
      startListeningSession();
      showToast("🎙️ Ovozli boshqaruv faol! ('Keyingisi', 'Qayta', 'Qo'y', 'Pochta')", 'success');
      speakPolitely("Xizmatingizdaman, Oliy hazrat!");
    }
  }, [isListening, startListeningSession, stopAndCleanupRecognition, showToast, speakPolitely]);

  // Draggable Mouse Handlers with requestAnimationFrame throttling for buttery smooth 60+ FPS on PC
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDraggingRef.current) return;
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
    }
    rafIdRef.current = requestAnimationFrame(() => {
      const dx = e.clientX - dragStartRef.current.startX;
      const dy = e.clientY - dragStartRef.current.startY;
      const nextX = Math.max(10, Math.min(window.innerWidth - 340, dragStartRef.current.posX + dx));
      const nextY = Math.max(10, Math.min(window.innerHeight - 150, dragStartRef.current.posY + dy));
      setPosition({ x: nextX, y: nextY });
    });
  }, []);

  const handleMouseUp = useCallback(() => {
    isDraggingRef.current = false;
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup', handleMouseUp);
    try {
      localStorage.setItem(STORAGE_POS_KEY, JSON.stringify(position));
    } catch {}
  }, [handleMouseMove, position]);

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

  return (
    <>
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

      {/* DISCRETE BOTTOM-RIGHT TRIGGER WHEN HIDDEN (Non-intrusive, subtle) */}
      {!isVisible && (
        <aside
          aria-label="Ovozli Yordamchi Tugmasi"
          className="fixed bottom-3 right-3 z-40 select-none"
        >
          <button
            type="button"
            onClick={() => handleToggleVisible(true)}
            className="w-8 h-8 rounded-full bg-slate-900/60 hover:bg-slate-900 text-slate-400 hover:text-amber-400 border border-white/10 hover:border-amber-400/40 shadow-sm backdrop-blur-sm transition-all duration-200 cursor-pointer opacity-40 hover:opacity-100 hover:scale-105 active:scale-95 flex items-center justify-center"
            title="🎙️ Ovozli boshqaruvni ochish"
          >
            <Mic className="w-4 h-4" />
          </button>
        </aside>
      )}

      {/* DRAGGABLE FLOATING VOICE ASSISTANT */}
      {isVisible && (
        <aside 
          aria-label="Ovozli Yordamchi"
          style={{ left: `${position.x}px`, top: `${position.y}px` }}
          className="fixed z-[9000] select-none font-sans"
        >
          {isMinimized ? (
            /* MINIMIZED PILL: Compact, non-intrusive with '-' to temporarily hide */
            <div className="flex items-center gap-1.5 bg-slate-900/95 text-white p-2 rounded-full shadow-2xl border border-white/20 backdrop-blur-xl ring-1 ring-black/40">
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
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                  isListening
                    ? 'bg-rose-600 text-white shadow-lg shadow-rose-500/50 animate-pulse'
                    : 'bg-slate-800 text-white hover:bg-slate-700'
                }`}
                title={isListening ? "Mikrofonni to'xtatish" : "Mikrofonni yoqish"}
              >
                {isListening ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4 text-white/80" />}
              </button>

              <button
                type="button"
                onClick={() => handleToggleMinimized(false)}
                className="flex items-center gap-2 pr-1 text-left cursor-pointer group"
                title="Kattalashtirish (To'liq panel)"
              >
                <div className="max-w-[120px] truncate">
                  <div className="text-[10px] text-amber-300 font-bold uppercase truncate">
                    {currentClass ? `${currentClass.name}` : 'Ovozli Boshqaruv'}
                  </div>
                  <div className="text-xs font-semibold text-slate-100 truncate">
                    {activeStudent ? activeStudent.fullName : "Oliy hazrat"}
                  </div>
                </div>
                <Maximize2 className="w-3.5 h-3.5 text-slate-400 group-hover:text-white transition-colors" />
              </button>

              {/* Explicit '-' button requested by user to temporarily hide it */}
              <button
                type="button"
                onClick={() => handleToggleVisible(false)}
                className="p-1.5 rounded-full hover:bg-amber-500/20 text-slate-400 hover:text-amber-300 transition-colors cursor-pointer"
                title="Vaqtinchalik yopish (-)"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>

              {/* Close 'X' button */}
              <button
                type="button"
                onClick={() => handleToggleVisible(false)}
                className="p-1.5 rounded-full hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
                title="Yopish (X)"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            /* EXPANDED DRAGGABLE HUD */
            <div className="w-[320px] sm:w-[350px] bg-slate-900/95 text-white rounded-2xl shadow-2xl border border-white/20 backdrop-blur-2xl overflow-hidden ring-1 ring-black/50">
              {/* Header: Draggable Grip Handle */}
              <div 
                onMouseDown={handleMouseDown}
                className="p-2.5 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border-b border-white/10 flex items-center justify-between cursor-grab active:cursor-grabbing"
                title="Panelni ekranning xohlagan joyiga surishingiz mumkin"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <GripHorizontal className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-extrabold text-xs text-white truncate flex items-center gap-1">
                        <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                        Ovozli Boshqaruv
                      </span>
                      <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        Oliy hazrat
                      </span>
                      {isListening && (
                        <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                          Tinglamoqda
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-blue-300 truncate">
                      {currentClass ? `${currentClass.name} sinfi (${currentClass.teacherName || "Ustoz"})` : 'Barcha sinflar'}
                    </div>
                  </div>
                </div>

                {/* Action Buttons: Settings, Kichiklashtirish, -, X */}
                <div className="flex items-center gap-1">
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
                    onClick={() => handleToggleMinimized(true)}
                    className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer"
                    title="Kichiklashtirish (Pill holatiga)"
                  >
                    <Minimize2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleVisible(false)}
                    className="p-1.5 rounded-lg hover:bg-amber-500/20 text-slate-400 hover:text-amber-300 transition-colors cursor-pointer"
                    title="Vaqtinchalik yopish (-)"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleVisible(false)}
                    className="p-1.5 rounded-lg hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
                    title="Yopish (X)"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

            {/* Content Body */}
            <div className="p-3 space-y-2.5 max-h-[480px] overflow-y-auto">
              
              {/* ACTIVE TARGET STUDENT CARD */}
              {activeStudent ? (
                <div className="p-3 rounded-xl bg-white/5 border border-white/10 space-y-1.5 relative overflow-hidden group">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-400">
                      O'quvchi {studentPointerIndex + 1} / {candidateStudents.length}
                    </span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      activeStudent.status === 'certified'
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : 'bg-amber-500/20 text-amber-300'
                    }`}>
                      {activeStudent.status === 'certified' ? 'Tayyor' : 'Kutilmoqda'}
                    </span>
                  </div>

                  {/* Student Full Name */}
                  <div className="text-sm sm:text-base font-extrabold text-white tracking-tight leading-snug">
                    {activeStudent.fullName}
                  </div>

                  {/* Student Email */}
                  <div className="text-[11px] text-blue-200/90 font-mono flex items-center justify-between gap-1">
                    <div className="flex items-center gap-1 truncate">
                      <Mail className="w-3 h-3 text-blue-400 flex-shrink-0" />
                      <span className="truncate">{activeStudent.assignedEmail || "Pochta biriktirilmagan"}</span>
                    </div>
                    <button
                      type="button"
                      onClick={handleCopyEmail}
                      className="px-1.5 py-0.5 rounded bg-blue-600/30 hover:bg-blue-600/50 text-[10px] text-blue-200 cursor-pointer flex-shrink-0"
                      title="Pochtani nusxalash"
                    >
                      Nusxa
                    </button>
                  </div>

                  {/* Sequential Copy Progress Bar (1. Ism -> 2. Pochta) */}
                  <div className="pt-1.5 border-t border-white/10 flex items-center justify-between text-[10px]">
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

              {/* Action Controls: Avvalgisi, Qayta, Qo'yish, Keyingisi */}
              <div className="grid grid-cols-4 gap-1.5">
                <button
                  type="button"
                  onClick={handlePrevStudent}
                  className="py-2 px-1.5 rounded-xl bg-white/5 hover:bg-white/15 text-slate-300 hover:text-white transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 text-center"
                  title="Avvalgi o'quvchi (Ovozda: 'Avvalgisi')"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span className="text-[10px] font-bold">Avvalgi</span>
                </button>

                <button
                  type="button"
                  onClick={handleRepeatCurrentStudent}
                  className="py-2 px-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 text-amber-200 transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 text-center"
                  title="Shu o'quvchini qayta nusxalash (Ovozda: 'Qayta')"
                >
                  <RotateCcw className="w-4 h-4 text-amber-300" />
                  <span className="text-[10px] font-black text-amber-300">Qayta</span>
                </button>

                <button
                  type="button"
                  onClick={handlePasteCertificate}
                  className="py-2 px-1.5 rounded-xl bg-emerald-600/90 hover:bg-emerald-600 text-white font-bold transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 text-center shadow-xs"
                  title="Havolani qo'yish va saqlash (Ovozda: 'Qo'y')"
                >
                  <ClipboardPaste className="w-4 h-4" />
                  <span className="text-[10px]">Qo'yish</span>
                </button>

                <button
                  type="button"
                  onClick={handleNextStudent}
                  className="py-2 px-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-black transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 text-center shadow-md shadow-blue-600/30"
                  title="Keyingi o'quvchi (Ovozda: 'Keyingisi')"
                >
                  <ChevronRight className="w-4 h-4" />
                  <span className="text-[10px]">Keyingi</span>
                </button>
              </div>

              {/* Supported Fast Voice Commands Reference Card */}
              <div className="p-2.5 rounded-xl bg-slate-950/60 border border-white/5 space-y-1 text-[11px]">
                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                  🎙️ Ovozli buyruqlar (100% tezkor):
                </div>
                <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] font-mono">
                  <div className="flex items-center gap-1.5 text-blue-300">
                    <span className="text-white font-bold">1.</span>
                    <span>"Keyingisi"</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-300">
                    <span className="text-white font-bold">2.</span>
                    <span>"Avvalgisi"</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-amber-300">
                    <span className="text-white font-bold">3.</span>
                    <span className="font-bold">"Qayta"</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-emerald-300">
                    <span className="text-white font-bold">4.</span>
                    <span>"Qo'y" / "Saqla"</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-purple-300 col-span-2">
                    <span className="text-white font-bold">5.</span>
                    <span>"Pochta" / "Email"</span>
                  </div>
                </div>
              </div>

              {/* Microphone & Voice Status Bar */}
              <div className="pt-2 border-t border-white/10 flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={toggleListening}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full font-bold text-[11px] transition-all cursor-pointer ${
                    isListening
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                      : 'bg-white/5 text-slate-300 border border-white/10 hover:bg-white/10'
                  }`}
                >
                  <div className={`w-2 h-2 rounded-full ${isListening ? 'bg-rose-500 animate-ping' : 'bg-slate-500'}`} />
                  <span>{isListening ? "Tinglamoqda..." : "Mikrofon o'chiq"}</span>
                </button>

                {isSpeaking ? (
                  <span className="text-emerald-400 font-bold text-[11px] flex items-center gap-1 animate-pulse">
                    <Volume2 className="w-3.5 h-3.5" />
                    <span>Gapirmoqda...</span>
                  </span>
                ) : (
                  <span className="text-[10px] text-slate-400">
                    O'zbekcha ovoz
                  </span>
                )}
              </div>
            </div>

            {/* SETTINGS DRAWER */}
            {isSettingsOpen && (
              <div className="p-3 bg-slate-950/90 border-t border-white/10 text-xs space-y-2.5 animate-fade-in">
                <div className="font-bold text-slate-200 flex items-center justify-between">
                  <span>Yordamchi sozlamalari</span>
                  <button onClick={() => setIsSettingsOpen(false)} className="text-slate-400 hover:text-white cursor-pointer">
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
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const val = Math.max(1.5, Math.round(((settings.autoCopyEmailSeconds || 3.5) - 0.5) * 10) / 10);
                        const updated = { ...settings, autoCopyEmailSeconds: val };
                        setSettings(updated);
                        saveVoiceAssistantSettings(updated);
                      }}
                      className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-white font-bold"
                    >
                      -
                    </button>
                    <span className="font-bold text-amber-300">{settings.autoCopyEmailSeconds || 3.5}s</span>
                    <button
                      type="button"
                      onClick={() => {
                        const val = Math.min(8.0, Math.round(((settings.autoCopyEmailSeconds || 3.5) + 0.5) * 10) / 10);
                        const updated = { ...settings, autoCopyEmailSeconds: val };
                        setSettings(updated);
                        saveVoiceAssistantSettings(updated);
                      }}
                      className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-white font-bold"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </aside>
    )}
  </>
  );
};
