import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { ClassGroup, Student } from '../types';
import { 
  speakUzbekMale, 
  stopSpeaking,
  copyToClipboard, 
  unlockAudioPlayback,
  loadVoiceAssistantSettings, 
  saveVoiceAssistantSettings,
  VoiceAssistantSettings 
} from '../services/voiceAssistantService';
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
  User, 
  Mail, 
  Check, 
  GripHorizontal,
  Clock,
  VolumeX
} from 'lucide-react';

interface VoiceAssistantWidgetProps {
  classes: ClassGroup[];
  students: Student[];
  activeClassId: string; // The class where the liquid glass currently is!
  selectedStatusFilters?: string[]; // Current category filter in AdminPanel (e.g. ['pending'])
  onSelectClass?: (classId: string) => void;
  onSaveStudent?: (student: Student) => Promise<void> | void;
}

const STORAGE_POS_KEY = 'b1m_voice_widget_position_v2';

export const VoiceAssistantWidget: React.FC<VoiceAssistantWidgetProps> = ({
  classes,
  students,
  activeClassId,
  selectedStatusFilters = [],
  onSelectClass,
  onSaveStudent,
}) => {
  // Assistant Settings
  const [settings, setSettings] = useState<VoiceAssistantSettings>(() => loadVoiceAssistantSettings());
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [customWakeWord, setCustomWakeWord] = useState(settings.wakeWord);

  // Widget Position (Draggable & persistent)
  const [position, setPosition] = useState<{ x: number; y: number }>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_POS_KEY);
      if (saved) return JSON.parse(saved);
    } catch {}
    // Default top-right position
    const winW = typeof window !== 'undefined' ? window.innerWidth : 1200;
    return { x: Math.max(20, winW - 360), y: 100 };
  });

  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<{ startX: number; startY: number; posX: number; posY: number }>({
    startX: 0,
    startY: 0,
    posX: 0,
    posY: 0,
  });

  // Assistant State
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [micSupported, setMicSupported] = useState(true);
  const [actionToast, setActionToast] = useState<{ text: string; type: 'success' | 'info' | 'warn' } | null>(null);

  // Sequential Copying State (1. Ism -> 2. Pochta)
  const [copyStep, setCopyStep] = useState<'idle' | 'name_copied' | 'email_copied'>('idle');
  const [autoEmailCountdown, setAutoEmailCountdown] = useState<number | null>(null);
  const autoEmailTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Student Navigation State
  const [studentPointerIndex, setStudentPointerIndex] = useState(0);

  // Target Class determination (matches liquid glass lens)
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

  // CATEGORY FILTERING:
  // Strictly filter according to the user's selected category in AdminPanel (e.g. faqat kutilayotganlar)
  const candidateStudents = useMemo(() => {
    if (!currentClass) return [];
    let list = students.filter(s => s.classId === currentClass.id);

    // Apply active category filters from AdminPanel if present
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

  // Currently focused student in the candidate pool
  const activeStudent = useMemo(() => {
    if (candidateStudents.length === 0) return null;
    const safeIndex = Math.min(Math.max(0, studentPointerIndex), candidateStudents.length - 1);
    return candidateStudents[safeIndex] || null;
  }, [candidateStudents, studentPointerIndex]);

  // Reset pointer if candidates change
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
    }, 3500);
  }, []);

  // Speech Recognition & Echo Prevention Refs
  const recognitionRef = useRef<any>(null);
  const isListeningRef = useRef(isListening);
  isListeningRef.current = isListening;
  const isSpeakingRef = useRef(isSpeaking);
  isSpeakingRef.current = isSpeaking;
  const isProcessingCommandRef = useRef(false);

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

  // Safely play speech with recognition pause (PREVENTS 0.5s ECHO & REPEATS)
  const speakPolitely = useCallback(async (phrase: string) => {
    unlockAudioPlayback();
    isSpeakingRef.current = true;
    setIsSpeaking(true);

    // 1. Physically STOP recognition so mic NEVER hears its own output
    try {
      recognitionRef.current?.stop();
    } catch {}

    // 2. Play 100% natural Microsoft Sardor voice
    await speakUzbekMale(
      phrase,
      () => {
        setIsSpeaking(true);
        isSpeakingRef.current = true;
      },
      () => {
        setIsSpeaking(false);
        isSpeakingRef.current = false;
        // 3. ONLY restart mic after 1.2s of absolute silence
        setTimeout(() => {
          isProcessingCommandRef.current = false;
          if (isListeningRef.current) {
            try {
              recognitionRef.current?.start();
            } catch {}
          }
        }, 1200);
      }
    );
  }, []);

  // CORE SEQUENTIAL ACTION:
  // 1. Copies Name immediately and speaks polite Uzbek male phrase
  // 2. Automatically copies Email 3.5s later without needing any extra action!
  const executeSequentialCopy = useCallback(async (targetSt?: Student | null) => {
    const student = targetSt || activeStudent;

    // Check if category is completed or empty:
    // "agarda hamma o'quvchilarga serifikat olib bo'linsa yoki o'sha kotegoriya bo'yicha o'quvchi qolmasa...
    // Oliy hazrat, barcha o'quvchilarga sertifikat olib bo'ldik desin"
    if (!student || candidateStudents.length === 0) {
      const allDoneMsg = "Oliy hazrat, barcha o'quvchilarga sertifikat olib bo'ldik!";
      showToast(allDoneMsg, 'info');
      await speakPolitely(allDoneMsg);
      return;
    }

    clearAutoEmailTimers();

    // STEP 1: Copy Name
    const nameCopied = await copyToClipboard(student.fullName);
    setCopyStep('name_copied');
    showToast(`1. Ism nusxalandi: "${student.fullName}"`, 'success');

    // Polite Uzbek gentleman phrase
    const politeNamePhrase = `Oliy hazrat, ${student.fullName}ning ismini nusxalab oldim!`;
    speakPolitely(politeNamePhrase);

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

  // Action: Next Student
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
    executeSequentialCopy(nextSt);
  }, [candidateStudents, studentPointerIndex, activeStudent, executeSequentialCopy]);

  // Action: Previous Student (stays strictly within current category!)
  const handlePrevStudent = useCallback(() => {
    if (candidateStudents.length <= 1) return;
    const prevIdx = (studentPointerIndex - 1 + candidateStudents.length) % candidateStudents.length;
    setStudentPointerIndex(prevIdx);
    const prevSt = candidateStudents[prevIdx];
    executeSequentialCopy(prevSt);
  }, [candidateStudents, studentPointerIndex, executeSequentialCopy]);

  // Test Voice sample
  const handleTestVoice = useCallback(() => {
    const sample = "Assalomu alaykum, Oliy hazrat! Men sizning sodiq yordamchingizman. Buyruqlaringizga muntazirman!";
    showToast("🔊 Tabiiy o'zbekcha ovoz sinovdan o'tmoqda...", 'info');
    speakPolitely(sample);
  }, [showToast, speakPolitely]);

  // Speech Recognition Continuous Listener
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setMicSupported(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false; // Only final speech to prevent 0.5s jitter
    recognition.lang = 'uz-UZ';
    recognitionRef.current = recognition;

    recognition.onresult = (event: any) => {
      if (isSpeakingRef.current || isProcessingCommandRef.current) return;

      const lastIdx = event.results.length - 1;
      const transcript = event.results[lastIdx][0]?.transcript || '';
      const lower = transcript.toLowerCase().trim();

      const wake = (settings.wakeWord || 'keyingisi').toLowerCase().trim();
      const wakeMatches = [
        wake,
        'keyingisi',
        'keyingi',
        'keyingisini',
        'sertifikat',
        'nusxa',
        'nusxala',
        'nusxalash',
        'siri',
        'bixby',
        'yordamchi',
      ];

      const isWakeWordDetected = wakeMatches.some(w => lower.includes(w)) || (wake && lower.includes(wake));

      if (isWakeWordDetected) {
        isProcessingCommandRef.current = true;
        handleNextStudent();
        return;
      }

      // Explicit Email copy command
      if (lower.includes('email') || lower.includes('pochta') || lower.includes('pochta')) {
        if (activeStudent) {
          isProcessingCommandRef.current = true;
          const email = activeStudent.assignedEmail || `${activeStudent.fullName.toLowerCase().replace(/[^a-z0-9]/g, '')}@gmail.com`;
          copyToClipboard(email).then(() => {
            showToast(`Pochta nusxalandi: "${email}"`, 'success');
            speakPolitely(`Oliy hazrat, ${activeStudent.fullName}ning elektron pochtasini ham nusxaladim!`);
          });
        }
        return;
      }
    };

    recognition.onerror = (e: any) => {
      if (e.error === 'not-allowed') {
        setIsListening(false);
        showToast("Mikrofonga ruxsat berilmadi", 'warn');
      }
    };

    recognition.onend = () => {
      if (isListeningRef.current && !isSpeakingRef.current && !isProcessingCommandRef.current) {
        try {
          recognition.start();
        } catch {}
      }
    };

    return () => {
      try {
        recognition.stop();
      } catch {}
    };
  }, [settings.wakeWord, handleNextStudent, activeStudent, showToast, speakPolitely]);

  // Toggle Microphone
  const toggleListening = useCallback(() => {
    if (!micSupported) {
      showToast("Brauzeringizda SpeechRecognition qo'llab-quvvatlanmaydi", 'warn');
      return;
    }

    unlockAudioPlayback();

    if (isListening) {
      setIsListening(false);
      try {
        recognitionRef.current?.stop();
      } catch {}
      showToast("🎙️ Mikrofon to'xtatildi", 'info');
    } else {
      setIsListening(true);
      try {
        recognitionRef.current?.start();
        showToast("🎙️ Ovozli yordamchi ishga tushdi!", 'success');
        speakPolitely("Xizmatingizdaman, Oliy hazrat!");
      } catch (err) {
        console.error('Mic start error:', err);
      }
    }
  }, [isListening, micSupported, showToast, speakPolitely]);

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
    const nextX = Math.max(10, Math.min(window.innerWidth - 320, dragStartRef.current.posX + dx));
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
            {actionToast.type === 'warn' && <MicOff className="w-4 h-4 text-rose-400" />}
            {actionToast.type === 'info' && <Sparkles className="w-4 h-4 text-amber-400" />}
            <span>{actionToast.text}</span>
          </div>
        </div>
      )}

      {/* DRAGGABLE FLOATING VOICE ASSISTANT (Xohlagan joyga siljitiladi!) */}
      <aside 
        aria-label="Ovozli Yordamchi"
        style={{ left: `${position.x}px`, top: `${position.y}px` }}
        className="fixed z-[9000] select-none font-sans transition-shadow"
      >
        {isMinimized ? (
          /* MINIMIZED PILL: Super Compact, Movable anywhere */
          <div className="flex items-center gap-2 bg-slate-900/95 text-white p-2 rounded-full shadow-2xl border border-white/20 backdrop-blur-xl">
            {/* Drag Grip */}
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
                  ? 'bg-rose-600 text-white shadow-lg shadow-rose-500/50 animate-pulse'
                  : 'bg-blue-600 text-white shadow-md hover:bg-blue-500'
              }`}
              title={isListening ? "Mikrofonni o'chirish" : "Mikrofonni yoqish"}
            >
              {isListening ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4 text-white/80" />}
            </button>

            <button
              type="button"
              onClick={() => setIsMinimized(false)}
              className="flex items-center gap-2 pr-2 text-left cursor-pointer group"
            >
              <div className="max-w-[130px] truncate">
                <div className="text-[10px] text-amber-300 font-bold uppercase truncate">
                  {currentClass ? `${currentClass.name} sinfi` : 'Sinf'}
                </div>
                <div className="text-xs font-semibold text-slate-100 truncate">
                  {activeStudent ? activeStudent.fullName : "Tayyor"}
                </div>
              </div>
              <Maximize2 className="w-3.5 h-3.5 text-slate-400 group-hover:text-white transition-colors" />
            </button>
          </div>
        ) : (
          /* EXPANDED COMPACT DRAGGABLE HUD */
          <div className="w-[310px] sm:w-[330px] bg-slate-900/95 text-white rounded-2xl shadow-2xl border border-white/20 backdrop-blur-2xl overflow-hidden ring-1 ring-black/50">
            {/* Header: Draggable Grip Handle */}
            <div 
              onMouseDown={handleMouseDown}
              className="p-2.5 bg-gradient-to-r from-slate-950 via-indigo-950 to-slate-950 border-b border-white/10 flex items-center justify-between cursor-grab active:cursor-grabbing"
              title="Panelni ekranning xohlagan joyiga surishingiz mumkin"
            >
              <div className="flex items-center gap-2 min-w-0">
                <GripHorizontal className="w-4 h-4 text-slate-400" />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-extrabold text-xs text-white truncate">
                      Ovozli Yordamchi
                    </span>
                    <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      Oliy hazrat
                    </span>
                  </div>
                  <div className="text-[10px] text-blue-300 truncate">
                    🌊 {currentClass ? `${currentClass.name} sinfi` : 'Sinf tanlanmadi'}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1" onMouseDown={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                  className={`p-1 rounded-lg text-slate-400 hover:text-white transition-colors cursor-pointer ${
                    isSettingsOpen ? 'bg-white/20 text-white' : ''
                  }`}
                  title="Sozlamalar"
                >
                  <Settings className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsMinimized(true)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white transition-colors cursor-pointer"
                  title="Kichraytirish"
                >
                  <Minimize2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* SETTINGS SUB-DRAWER */}
            {isSettingsOpen && (
              <div className="p-3 bg-slate-950/95 border-b border-white/10 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-200">Kalit so'z:</span>
                  <span className="text-[10px] text-blue-400 font-mono">"{settings.wakeWord}"</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {['keyingisi', 'sertifikat', 'nusxa', 'siri', 'yordamchi'].map(w => (
                    <button
                      key={w}
                      type="button"
                      onClick={() => {
                        const newS = { ...settings, wakeWord: w };
                        setSettings(newS);
                        saveVoiceAssistantSettings(newS);
                        showToast(`Kalit so'z: "${w}"`, 'success');
                      }}
                      className={`px-2 py-0.5 rounded text-[10px] font-medium transition-all cursor-pointer ${
                        settings.wakeWord === w
                          ? 'bg-blue-600 text-white font-bold'
                          : 'bg-white/5 hover:bg-white/15 text-slate-300'
                      }`}
                    >
                      {w}
                    </button>
                  ))}
                </div>

                <div className="pt-1.5 border-t border-white/10 flex items-center justify-between text-[10px] text-slate-400">
                  <span className="text-emerald-400 font-medium">Microsoft Sardor (Tabiiy erkak ovozi)</span>
                  <button
                    type="button"
                    onClick={handleTestVoice}
                    className="text-blue-400 hover:text-blue-300 font-bold underline cursor-pointer"
                  >
                    Ovozni sinash
                  </button>
                </div>
              </div>
            )}

            {/* Student Info Card (NO blue buttons as requested!) */}
            <div className="p-3.5 space-y-3">
              {activeStudent ? (
                <div className="p-3 rounded-xl bg-white/5 border border-white/10 space-y-2">
                  <div className="flex items-center justify-between text-[10px] text-slate-400">
                    <span className="text-blue-300 font-bold uppercase">
                      {candidateStudents.length} tadan {studentPointerIndex + 1}-o'quvchi
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 font-semibold text-[10px]">
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

              {/* Prev & Next Controls (Stays strictly within selected category!) */}
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={handlePrevStudent}
                  disabled={candidateStudents.length <= 1}
                  className="p-2 rounded-xl bg-white/5 hover:bg-white/15 disabled:opacity-30 disabled:pointer-events-none text-slate-300 hover:text-white transition-all cursor-pointer"
                  title="Oldingi o'quvchi (faqat tanlangan toifadan)"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                {/* Primary Voice Action Button */}
                <button
                  type="button"
                  onClick={handleNextStudent}
                  className="flex-1 py-2 px-3 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-500 hover:to-indigo-500 active:scale-[0.98] text-white font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-blue-600/30 transition-all cursor-pointer group"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-300 group-hover:rotate-12 transition-transform" />
                  <span>Keyingi o'quvchi ({settings.wakeWord})</span>
                </button>

                <button
                  type="button"
                  onClick={handleNextStudent}
                  disabled={candidateStudents.length <= 1}
                  className="p-2 rounded-xl bg-white/5 hover:bg-white/15 disabled:opacity-30 disabled:pointer-events-none text-slate-300 hover:text-white transition-all cursor-pointer"
                  title="Keyingi o'quvchi (faqat tanlangan toifadan)"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {/* Microphone & Status Bar */}
              <div className="pt-2 border-t border-white/10 flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={toggleListening}
                  className={`flex items-center gap-2 px-2.5 py-1 rounded-full font-bold text-[11px] transition-all cursor-pointer ${
                    isListening
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                      : 'bg-white/5 text-slate-300 border border-white/10 hover:bg-white/10'
                  }`}
                >
                  <div className={`w-2 h-2 rounded-full ${isListening ? 'bg-rose-500 animate-ping' : 'bg-slate-500'}`} />
                  <span>{isListening ? 'Eshitmoqda...' : 'Mikrofon o\'chiq'}</span>
                </button>

                {isSpeaking ? (
                  <span className="text-emerald-400 font-bold text-[11px] flex items-center gap-1 animate-pulse">
                    <Volume2 className="w-3.5 h-3.5" />
                    <span>Gapirmoqda...</span>
                  </span>
                ) : (
                  <span className="text-[10px] text-slate-400">
                    Kalit so'z: <strong className="text-white">"{settings.wakeWord}"</strong>
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </aside>
    </>
  );
};
