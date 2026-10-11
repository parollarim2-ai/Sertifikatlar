import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { ClassGroup, Student } from '../types';
import { 
  speakUzbekMale, 
  copyToClipboard, 
  loadVoiceAssistantSettings, 
  saveVoiceAssistantSettings,
  VoiceAssistantSettings 
} from '../services/voiceAssistantService';
import { 
  Mic, 
  MicOff, 
  Volume2, 
  Copy, 
  CheckCircle, 
  ChevronRight, 
  ChevronLeft, 
  Settings, 
  Sparkles, 
  X, 
  Minimize2, 
  Maximize2, 
  User, 
  Mail, 
  Check, 
  VolumeX, 
  Radio, 
  HelpCircle,
  Play,
  RotateCcw
} from 'lucide-react';

interface VoiceAssistantWidgetProps {
  classes: ClassGroup[];
  students: Student[];
  activeClassId: string; // The class where the liquid glass currently is!
  onSelectClass?: (classId: string) => void;
  onSaveStudent?: (student: Student) => Promise<void> | void;
}

export const VoiceAssistantWidget: React.FC<VoiceAssistantWidgetProps> = ({
  classes,
  students,
  activeClassId,
  onSelectClass,
  onSaveStudent,
}) => {
  // Assistant Settings
  const [settings, setSettings] = useState<VoiceAssistantSettings>(() => loadVoiceAssistantSettings());
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [customWakeWord, setCustomWakeWord] = useState(settings.wakeWord);

  // Assistant State
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [micSupported, setMicSupported] = useState(true);
  const [lastTranscript, setLastTranscript] = useState('');
  const [actionToast, setActionToast] = useState<{ text: string; type: 'success' | 'info' | 'warn' } | null>(null);

  // Student Navigation State
  const [studentPointerIndex, setStudentPointerIndex] = useState(0);
  const [lastCopiedField, setLastCopiedField] = useState<'name' | 'email' | 'both' | null>(null);

  // Target Class determination:
  // "o'sha men qaysi sinf ga sertifikat olaoytgan bo'lsam, yani qaysi sinf ni ustida haligi suyuq shisha turgan bo'lsa"
  const currentClass = useMemo(() => {
    if (activeClassId && activeClassId !== 'all' && activeClassId !== 'all_with_teachers' && activeClassId !== 'only_teachers') {
      const found = classes.find(c => c.id === activeClassId);
      if (found) return found;
    }
    // Fallback: first class with uncertified students or first class
    const withUncertified = classes.find(c => {
      const cSt = students.filter(s => s.classId === c.id);
      return cSt.some(s => s.status !== 'certified' && !s.hasError && s.status !== 'error');
    });
    return withUncertified || classes[0] || null;
  }, [classes, activeClassId, students]);

  // All valid uncertified students in the target class in chronological/top-to-bottom order:
  // "shu sinf dan sertifkat olmagan o'quvchilarni qidiradi (ma'lumoti xato bo'lganlarni emas) ... bir boshdan eng birinchida turganini"
  const uncertifiedStudents = useMemo(() => {
    if (!currentClass) return [];
    return students
      .filter(s => s.classId === currentClass.id)
      .filter(s => s.status !== 'certified' && !s.hasError && s.status !== 'error');
  }, [students, currentClass]);

  // Currently focused student in the uncertified queue
  const activeStudent = useMemo(() => {
    if (uncertifiedStudents.length === 0) return null;
    const safeIndex = Math.min(Math.max(0, studentPointerIndex), uncertifiedStudents.length - 1);
    return uncertifiedStudents[safeIndex] || null;
  }, [uncertifiedStudents, studentPointerIndex]);

  // Keep pointer in bounds when uncertified count changes
  useEffect(() => {
    if (studentPointerIndex >= uncertifiedStudents.length && uncertifiedStudents.length > 0) {
      setStudentPointerIndex(0);
    }
  }, [uncertifiedStudents.length, studentPointerIndex]);

  // Audio / Speech Toast helper
  const showToast = useCallback((text: string, type: 'success' | 'info' | 'warn' = 'success') => {
    setActionToast({ text, type });
    setTimeout(() => {
      setActionToast(prev => (prev?.text === text ? null : prev));
    }, 3500);
  }, []);

  // Speech Recognition Reference
  const recognitionRef = useRef<any>(null);
  const isListeningRef = useRef(isListening);
  isListeningRef.current = isListening;
  const isSpeakingRef = useRef(isSpeaking);
  isSpeakingRef.current = isSpeaking;
  const lastActionTimeRef = useRef(0);

  // Core Action: Copy Student Name and/or Email and Speak in 100% Natural Male Voice
  const executeCopyStudent = useCallback(async (
    targetSt?: Student | null, 
    advance: boolean = false,
    fieldToCopy: 'name' | 'email' | 'both' = 'name'
  ) => {
    const student = targetSt || activeStudent;

    if (!student) {
      if (currentClass) {
        const finishedMsg = `${currentClass.name} sinfidagi barcha o'quvchilar sertifikat olib bo'lgan!`;
        showToast(finishedMsg, 'info');
        speakUzbekMale(finishedMsg, () => setIsSpeaking(true), () => setIsSpeaking(false));
      } else {
        showToast("Sinf tanlanmadi", 'warn');
      }
      return;
    }

    let copiedValue = '';
    let speechMessage = '';

    if (fieldToCopy === 'email') {
      const email = student.assignedEmail || `${student.fullName.toLowerCase().replace(/[^a-z0-9]/g, '')}@gmail.com`;
      copiedValue = email;
      speechMessage = `${student.fullName}ning elektron pochtasidan nusxa olindi.`;
      setLastCopiedField('email');
    } else if (fieldToCopy === 'both') {
      const email = student.assignedEmail || '';
      copiedValue = `${student.fullName}\n${email}`;
      speechMessage = `${student.fullName}ning ismi va pochtasidan nusxa olindi.`;
      setLastCopiedField('both');
    } else {
      // Default: copy Full Name
      copiedValue = student.fullName;
      speechMessage = `${student.fullName}ning ma'lumotlaridan nusxa olindi.`;
      setLastCopiedField('name');
    }

    // 1. Write to Clipboard with guaranteed fallback
    const ok = await copyToClipboard(copiedValue);
    if (ok) {
      showToast(`📋 Nusxalandi: "${copiedValue}"`, 'success');
    } else {
      showToast(`⚠️ Nusxalandi: "${copiedValue}"`, 'info');
    }

    // 2. Announce in 100% Natural Uzbek Male Voice (Microsoft Sardor)
    speakUzbekMale(
      speechMessage,
      () => setIsSpeaking(true),
      () => setIsSpeaking(false)
    );

    // 3. Optionally advance pointer if requested
    if (advance) {
      setStudentPointerIndex(prev => (prev + 1) % Math.max(1, uncertifiedStudents.length));
    }
  }, [activeStudent, currentClass, uncertifiedStudents.length, showToast]);

  // Action: Copy Email specifically
  const handleCopyEmail = useCallback(async () => {
    if (!activeStudent) return;
    await executeCopyStudent(activeStudent, false, 'email');
  }, [activeStudent, executeCopyStudent]);

  // Action: Next Student
  const handleNextStudent = useCallback(() => {
    if (uncertifiedStudents.length <= 1) {
      executeCopyStudent(activeStudent, false, 'name');
      return;
    }
    const nextIdx = (studentPointerIndex + 1) % uncertifiedStudents.length;
    setStudentPointerIndex(nextIdx);
    const nextSt = uncertifiedStudents[nextIdx];
    executeCopyStudent(nextSt, false, 'name');
  }, [uncertifiedStudents, studentPointerIndex, activeStudent, executeCopyStudent]);

  // Action: Previous Student
  const handlePrevStudent = useCallback(() => {
    if (uncertifiedStudents.length <= 1) return;
    const prevIdx = (studentPointerIndex - 1 + uncertifiedStudents.length) % uncertifiedStudents.length;
    setStudentPointerIndex(prevIdx);
    const prevSt = uncertifiedStudents[prevIdx];
    executeCopyStudent(prevSt, false, 'name');
  }, [uncertifiedStudents, studentPointerIndex, executeCopyStudent]);

  // Action: Mark current student as Certified
  const handleMarkAsCertified = useCallback(async () => {
    if (!activeStudent || !onSaveStudent) return;
    const updated: Student = {
      ...activeStudent,
      status: 'certified',
      certificateLink: activeStudent.certificateLink || 'https://coursera.org/verify/certificate'
    };
    await onSaveStudent(updated);
    const msg = `${activeStudent.fullName} sertifikatlandi!`;
    showToast(`✅ ${msg}`, 'success');
    speakUzbekMale(msg, () => setIsSpeaking(true), () => setIsSpeaking(false));
  }, [activeStudent, onSaveStudent, showToast]);

  // Test Voice sample
  const handleTestVoice = useCallback(() => {
    const sample = "Assalomu alaykum! Men sizning ovozli yordamchingizman. Kalit so'zni aytsangiz, o'quvchi ma'lumotlaridan bir zumda nusxa olaman.";
    showToast("🔊 Tabiiy erkak ovozi sinovdan o'tmoqda...", 'info');
    speakUzbekMale(sample, () => setIsSpeaking(true), () => setIsSpeaking(false));
  }, [showToast]);

  // Speech Recognition Setup & Continuous Loop
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setMicSupported(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'uz-UZ'; // Uzbek language recognition
    recognitionRef.current = recognition;

    recognition.onresult = (event: any) => {
      // Don't process user's microphone while the TTS assistant itself is talking (prevents echo loop)
      if (isSpeakingRef.current) return;

      const now = Date.now();
      if (now - lastActionTimeRef.current < 2000) return; // 2s cooldown between commands

      let currentTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        currentTranscript += event.results[i][0].transcript;
      }

      const lower = currentTranscript.toLowerCase().trim();
      setLastTranscript(lower);

      // Check Wake Word:
      // Default: "keyingisi", "sertifikat", "nusxa", "siri", "bixby", or custom word!
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
        'kopirovat',
        'siri',
        'bixby',
        'yordamchi',
        'robot'
      ];

      const isWakeWordDetected = wakeMatches.some(w => lower.includes(w)) || (wake && lower.includes(wake));

      if (isWakeWordDetected) {
        lastActionTimeRef.current = now;
        // Trigger next student copy!
        handleNextStudent();
        return;
      }

      // Voice sub-command: "email" / "pochta"
      if (lower.includes('email') || lower.includes('pochta') || lower.includes('elektron')) {
        lastActionTimeRef.current = now;
        handleCopyEmail();
        return;
      }

      // Voice sub-command: "ism" / "ismi"
      if (lower.includes('ism') || lower.includes('ismi') || lower.includes('familiya')) {
        lastActionTimeRef.current = now;
        executeCopyStudent(activeStudent, false, 'name');
        return;
      }

      // Voice sub-command: "tayyor" / "sertifikatlandi"
      if (lower.includes('tayyor') || lower.includes('oldi') || lower.includes('tasdiq')) {
        lastActionTimeRef.current = now;
        handleMarkAsCertified();
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
      // Auto-restart if user still wants listening active
      if (isListeningRef.current) {
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
  }, [settings.wakeWord, handleNextStudent, handleCopyEmail, executeCopyStudent, activeStudent, handleMarkAsCertified, showToast]);

  // Toggle Microphone
  const toggleListening = useCallback(() => {
    if (!micSupported) {
      showToast("Brauzeringizda ovoz tanish (SpeechRecognition) qo'llab-quvvatlanmaydi", 'warn');
      return;
    }

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
        showToast("🎙️ Ovozli yordamchi eshitishni boshladi!", 'success');
        // Welcome voice cue
        speakUzbekMale("Eshitmoqdaman", () => setIsSpeaking(true), () => setIsSpeaking(false));
      } catch (err) {
        console.error('Mic start error:', err);
      }
    }
  }, [isListening, micSupported, showToast]);

  // Global Keyboard Shortcut: Pressing 'Alt + C' or 'Ctrl + Space' triggers voice assistant copy
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is currently typing in an input or textarea
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;

      if ((e.altKey && e.code === 'KeyC') || (e.ctrlKey && e.code === 'Space')) {
        e.preventDefault();
        handleNextStudent();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleNextStudent]);

  // Save settings helper
  const handleUpdateWakeWord = (word: string) => {
    const newSettings = { ...settings, wakeWord: word.toLowerCase().trim() };
    setSettings(newSettings);
    saveVoiceAssistantSettings(newSettings);
    showToast(`Kalit so'z yangilandi: "${word}"`, 'success');
  };

  return (
    <>
      {/* FLOATING ACTION TOAST */}
      {actionToast && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[9999] animate-bounce-subtle pointer-events-none">
          <div className={`px-4 py-2.5 rounded-2xl shadow-2xl border text-xs sm:text-sm font-semibold flex items-center gap-2.5 backdrop-blur-xl ${
            actionToast.type === 'success'
              ? 'bg-emerald-950/90 text-emerald-200 border-emerald-500/40'
              : actionToast.type === 'warn'
              ? 'bg-rose-950/90 text-rose-200 border-rose-500/40'
              : 'bg-slate-950/90 text-blue-200 border-blue-500/40'
          }`}>
            {actionToast.type === 'success' && <CheckCircle className="w-4 h-4 text-emerald-400" />}
            {actionToast.type === 'warn' && <Radio className="w-4 h-4 text-rose-400" />}
            {actionToast.type === 'info' && <Sparkles className="w-4 h-4 text-blue-400" />}
            <span>{actionToast.text}</span>
          </div>
        </div>
      )}

      {/* FLOATING VOICE ASSISTANT DOCK (Draggable / Sleek Apple Glass HUD) */}
      <aside 
        aria-label="Ovozli Yordamchi"
        className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-[9000] select-none font-sans"
      >
        {isMinimized ? (
          /* MINIMIZED PILL: Compact Glowing Button */
          <div className="flex items-center gap-2 bg-slate-900/90 hover:bg-slate-900 text-white p-2 sm:p-2.5 rounded-full shadow-2xl border border-white/20 backdrop-blur-xl transition-all active:scale-95">
            <button
              type="button"
              onClick={toggleListening}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                isListening
                  ? 'bg-rose-600 text-white shadow-lg shadow-rose-500/50 animate-pulse'
                  : 'bg-blue-600 text-white shadow-md hover:bg-blue-500'
              }`}
              title={isListening ? "Mikrofonni o'chirish" : "Mikrofonni yoqish"}
            >
              {isListening ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5 text-white/80" />}
            </button>

            <button
              type="button"
              onClick={() => setIsMinimized(false)}
              className="flex items-center gap-2 pl-1 pr-3 text-left cursor-pointer group"
            >
              <div className="max-w-[140px] sm:max-w-[180px] truncate">
                <div className="text-[10px] text-blue-300 font-bold uppercase tracking-wider flex items-center gap-1">
                  <span>{currentClass ? `${currentClass.name} sinfi` : 'Sinf'}</span>
                  {isSpeaking && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />}
                </div>
                <div className="text-xs font-semibold text-slate-100 truncate">
                  {activeStudent ? activeStudent.fullName : "O'quvchi tayyor"}
                </div>
              </div>
              <Maximize2 className="w-4 h-4 text-slate-400 group-hover:text-white transition-colors" />
            </button>
          </div>
        ) : (
          /* EXPANDED EXECUTIVE HUD */
          <div className="w-[340px] sm:w-[380px] bg-slate-900/95 text-white rounded-3xl shadow-2xl border border-white/15 backdrop-blur-2xl overflow-hidden transition-all animate-fade-in ring-1 ring-black/40">
            {/* Header: Class Badge & Controls */}
            <div className="p-3.5 sm:p-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border-b border-white/10 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all ${
                  isListening 
                    ? 'bg-gradient-to-br from-rose-500 to-red-600 text-white shadow-lg shadow-rose-500/40 animate-pulse' 
                    : 'bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-md'
                }`}>
                  <Mic className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-extrabold text-xs sm:text-sm tracking-tight text-white block truncate">
                      Ovozli Yordamchi
                    </span>
                    <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-blue-500/20 text-blue-300 border border-blue-400/30">
                      AI Studio
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-300 truncate flex items-center gap-1">
                    <span className="text-amber-400">🌊 Suyuq shisha:</span>
                    <span className="font-bold text-white">{currentClass ? `${currentClass.name} sinfi` : 'Tanlanmadi'}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                  className={`p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer ${
                    isSettingsOpen ? 'bg-white/15 text-white' : ''
                  }`}
                  title="Sozlamalar"
                >
                  <Settings className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsMinimized(true)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                  title="Kichraytirish"
                >
                  <Minimize2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* SETTINGS SUB-DRAWER */}
            {isSettingsOpen && (
              <div className="p-3.5 bg-slate-950/90 border-b border-white/10 space-y-3 text-xs animate-fade-in">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-200">Kalit so'z (Wake Word):</span>
                  <span className="text-[10px] text-blue-400 font-mono">"{settings.wakeWord}"</span>
                </div>

                {/* Quick preset buttons */}
                <div className="flex flex-wrap gap-1.5">
                  {['keyingisi', 'sertifikat', 'nusxa', 'siri', 'bixby', 'yordamchi'].map(w => (
                    <button
                      key={w}
                      type="button"
                      onClick={() => {
                        setCustomWakeWord(w);
                        handleUpdateWakeWord(w);
                      }}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all cursor-pointer ${
                        settings.wakeWord === w
                          ? 'bg-blue-600 text-white font-bold ring-1 ring-blue-400 shadow-sm'
                          : 'bg-white/5 hover:bg-white/15 text-slate-300'
                      }`}
                    >
                      {w}
                    </button>
                  ))}
                </div>

                {/* Custom Wake Word input */}
                <div className="flex items-center gap-1.5 pt-1">
                  <input
                    type="text"
                    value={customWakeWord}
                    onChange={(e) => setCustomWakeWord(e.target.value)}
                    placeholder="Boshqa so'z yozing..."
                    className="flex-1 px-2.5 py-1.5 bg-white/5 border border-white/15 rounded-xl text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-blue-500 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => handleUpdateWakeWord(customWakeWord)}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl cursor-pointer text-xs"
                  >
                    Saqlash
                  </button>
                </div>

                {/* Voice info & test */}
                <div className="pt-2 border-t border-white/10 flex items-center justify-between text-[11px] text-slate-400">
                  <div className="flex items-center gap-1.5">
                    <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Microsoft Sardor (O'zbekcha erkak ovozi)</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleTestVoice}
                    className="text-blue-400 hover:text-blue-300 font-bold hover:underline cursor-pointer"
                  >
                    Ovozni sinash
                  </button>
                </div>
              </div>
            )}

            {/* Current Student Card & Live Status */}
            <div className="p-4 space-y-3.5">
              {/* Active Student Detail Box */}
              {activeStudent ? (
                <div className="p-3.5 rounded-2xl bg-gradient-to-br from-white/10 to-white/5 border border-white/10 space-y-2.5 relative overflow-hidden group">
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span className="flex items-center gap-1 text-blue-300 font-bold uppercase tracking-wider">
                      <User className="w-3 h-3" />
                      <span>{uncertifiedStudents.length} tadan {studentPointerIndex + 1}-o'quvchi</span>
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold">
                      Sertifikat olmagan
                    </span>
                  </div>

                  {/* Student Full Name */}
                  <div className="space-y-0.5">
                    <div className="text-base font-extrabold text-white tracking-tight leading-snug">
                      {activeStudent.fullName}
                    </div>
                    {/* Student Email */}
                    <div className="text-xs text-blue-200/90 font-mono flex items-center gap-1 truncate">
                      <Mail className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                      <span className="truncate">{activeStudent.assignedEmail || "Pochta biriktirilmagan"}</span>
                    </div>
                  </div>

                  {/* Action Badges: Quick Copy Name & Quick Copy Email */}
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => executeCopyStudent(activeStudent, false, 'name')}
                      className="py-2 px-2.5 rounded-xl bg-blue-600/80 hover:bg-blue-600 active:scale-95 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-sm shadow-blue-600/30"
                      title="Ism va familiyani nusxalash"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>Ismni nusxalash</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleCopyEmail}
                      className="py-2 px-2.5 rounded-xl bg-indigo-600/80 hover:bg-indigo-600 active:scale-95 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-sm shadow-indigo-600/30"
                      title="Elektron pochtani nusxalash"
                    >
                      <Mail className="w-3.5 h-3.5" />
                      <span>Email nusxalash</span>
                    </button>
                  </div>
                </div>
              ) : (
                /* No uncertified students in target class */
                <div className="p-4 rounded-2xl bg-white/5 border border-white/10 text-center space-y-1.5">
                  <CheckCircle className="w-8 h-8 text-emerald-400 mx-auto" />
                  <div className="font-bold text-sm text-slate-100">
                    {currentClass ? `${currentClass.name} sinfi to'liq tayyor!` : "Sinf tanlanmadi"}
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Ushbu sinfda barcha o'quvchilar sertifikat olgan yoki muammoli holatlar yo'q.
                  </p>
                </div>
              )}

              {/* Navigation Controls: Prev, Next, Mark Done */}
              <div className="flex items-center justify-between gap-2 pt-0.5">
                <button
                  type="button"
                  onClick={handlePrevStudent}
                  disabled={uncertifiedStudents.length <= 1}
                  className="p-2 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-40 disabled:pointer-events-none text-slate-300 hover:text-white transition-all cursor-pointer"
                  title="Oldingi o'quvchi"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                {/* Primary Voice Action Button: Say wake word or click */}
                <button
                  type="button"
                  onClick={() => handleNextStudent()}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-500 hover:to-indigo-500 active:scale-[0.98] text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-lg shadow-blue-600/30 transition-all cursor-pointer group"
                >
                  <Sparkles className="w-4 h-4 text-amber-300 group-hover:rotate-12 transition-transform" />
                  <span>Keyingi o'quvchi ({settings.wakeWord})</span>
                </button>

                <button
                  type="button"
                  onClick={handleNextStudent}
                  disabled={uncertifiedStudents.length <= 1}
                  className="p-2 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-40 disabled:pointer-events-none text-slate-300 hover:text-white transition-all cursor-pointer"
                  title="Keyingi o'quvchi"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {/* Microphone Status Bar & Wave Pulse */}
              <div className="pt-2 border-t border-white/10 flex items-center justify-between gap-2 text-xs">
                {/* Live Mic Toggle Switch */}
                <button
                  type="button"
                  onClick={toggleListening}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full font-bold text-xs transition-all cursor-pointer ${
                    isListening
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 hover:bg-rose-500/30'
                      : 'bg-white/5 text-slate-300 border border-white/10 hover:bg-white/10'
                  }`}
                >
                  <div className={`w-2.5 h-2.5 rounded-full ${isListening ? 'bg-rose-500 animate-ping' : 'bg-slate-500'}`} />
                  <span>{isListening ? 'Tinglamoqda...' : 'Mikrofon o\'chiq'}</span>
                </button>

                {/* Speaking wave / Hotkey hint */}
                <div className="text-[11px] text-slate-400 font-mono flex items-center gap-1.5">
                  {isSpeaking ? (
                    <span className="text-emerald-400 font-bold flex items-center gap-1 animate-pulse">
                      <Volume2 className="w-3.5 h-3.5" />
                      <span>Gapirmoqda...</span>
                    </span>
                  ) : (
                    <span className="text-slate-400 hover:text-slate-200" title="Tezkor tugma">
                      Alt + C
                    </span>
                  )}
                </div>
              </div>

              {/* Sub-text guide */}
              <div className="text-[10px] text-slate-400 text-center leading-relaxed">
                🎙️ Mikrofon yoniqligida <span className="text-blue-300 font-bold">"{settings.wakeWord}"</span> deb aytsangiz, avtomatik o'quvchi ismi nusxalanadi va tabiiy o'zbekcha ovozda xabar beradi.
              </div>
            </div>
          </div>
        )}
      </aside>
    </>
  );
};
