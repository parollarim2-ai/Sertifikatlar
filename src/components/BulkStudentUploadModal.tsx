import React, { useState, useEffect } from 'react';
import { ClassGroup, Student, EmailAccount } from '../types';
import { extractStudentsFromFile } from '../utils/fileExtractor';
import { parseStudentsFromText, ParsedStudentPreview } from '../utils/studentParser';
import { distributeEmailsToStudents } from '../utils/emailManager';
import confetti from 'canvas-confetti';
import { 
  X, 
  Upload, 
  FileSpreadsheet, 
  CheckCircle2, 
  Users, 
  Sparkles, 
  Loader2, 
  Trash2,
  Plus,
  School,
  AlertTriangle,
  AlertCircle,
  Layers,
  UserPlus
} from 'lucide-react';

interface BulkStudentUploadModalProps {
  classes: ClassGroup[];
  students: Student[];
  emailPool: EmailAccount[];
  initialClassId?: string;
  isOpen: boolean;
  onClose: () => void;
  onSaveClassAndStudents: (
    updatedClass: ClassGroup,
    newStudents: Student[],
    updatedEmailPool: EmailAccount[]
  ) => void;
}

export const BulkStudentUploadModal: React.FC<BulkStudentUploadModalProps> = ({
  classes,
  students,
  emailPool,
  initialClassId,
  isOpen,
  onClose,
  onSaveClassAndStudents,
}) => {
  // Mode: 'existing' or 'new'
  const [uploadMode, setUploadMode] = useState<'existing' | 'new'>(
    initialClassId && classes.some(c => c.id === initialClassId) ? 'existing' : (classes.length > 0 ? 'existing' : 'new')
  );

  const [selectedClassId, setSelectedClassId] = useState<string>(
    initialClassId && classes.some(c => c.id === initialClassId) 
      ? initialClassId 
      : (classes[0]?.id || '')
  );

  const [newClassName, setNewClassName] = useState('');
  const [teacherName, setTeacherName] = useState('');
  const [teacherPhone, setTeacherPhone] = useState('');
  
  const [parsedStudents, setParsedStudents] = useState<ParsedStudentPreview[]>([]);
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [availableSheets, setAvailableSheets] = useState<string[]>([]);
  const [activeSheetName, setActiveSheetName] = useState<string>('');
  const [rawExtractedText, setRawExtractedText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAiScanning, setIsAiScanning] = useState(false);
  const [showMissingAssistant, setShowMissingAssistant] = useState(false);
  const [previewFilter, setPreviewFilter] = useState<'all' | 'incomplete' | 'ready'>('all');
  const [isDragging, setIsDragging] = useState(false);
  const [manualText, setManualText] = useState('');
  const [showManualInput, setShowManualInput] = useState(false);
  const [validationError, setValidationError] = useState('');

  useEffect(() => {
    if (initialClassId && classes.some(c => c.id === initialClassId)) {
      setUploadMode('existing');
      setSelectedClassId(initialClassId);
    }
  }, [initialClassId, classes]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!isOpen) return null;

  const currentSelectedClass = classes.find(c => c.id === selectedClassId);
  const existingClassStudents = currentSelectedClass 
    ? students.filter(s => s.classId === currentSelectedClass.id) 
    : [];

  // Check duplicates in real-time
  const isDuplicateName = (name: string): boolean => {
    if (uploadMode !== 'existing' || !currentSelectedClass) return false;
    const cleanName = name.trim().toLowerCase();
    return existingClassStudents.some(s => s.fullName.trim().toLowerCase() === cleanName);
  };

  // Detect duplicate passports/metrikas in the parsed list
  const duplicatePassports = React.useMemo(() => {
    const counts: Record<string, number> = {};
    parsedStudents.forEach(st => {
      const val = st.passportOrId?.trim().toUpperCase();
      if (val && val.length >= 4) {
        counts[val] = (counts[val] || 0) + 1;
      }
    });
    const dups = new Set<string>();
    Object.entries(counts).forEach(([val, count]) => {
      if (count > 1) dups.add(val);
    });
    return dups;
  }, [parsedStudents]);

  const missingBirthDateCount = React.useMemo(() => {
    return parsedStudents.filter(s => s.fullName.trim() && !s.birthDate?.trim()).length;
  }, [parsedStudents]);

  const missingPassportCount = React.useMemo(() => {
    return parsedStudents.filter(s => s.fullName.trim() && !s.passportOrId?.trim()).length;
  }, [parsedStudents]);

  const incompleteStudents = React.useMemo(() => {
    return parsedStudents
      .map((st, origIdx) => ({ ...st, origIdx }))
      .filter(s => s.fullName.trim() && (!s.birthDate?.trim() || !s.passportOrId?.trim()));
  }, [parsedStudents]);

  const readyStudentsCount = React.useMemo(() => {
    return parsedStudents.filter(s => s.fullName.trim() && s.birthDate?.trim() && s.passportOrId?.trim()).length;
  }, [parsedStudents]);

  const displayedStudents = React.useMemo(() => {
    if (previewFilter === 'incomplete') {
      return parsedStudents
        .map((st, origIdx) => ({ ...st, origIdx }))
        .filter(s => !s.birthDate?.trim() || !s.passportOrId?.trim());
    }
    if (previewFilter === 'ready') {
      return parsedStudents
        .map((st, origIdx) => ({ ...st, origIdx }))
        .filter(s => s.fullName.trim() && s.birthDate?.trim() && s.passportOrId?.trim());
    }
    return parsedStudents.map((st, origIdx) => ({ ...st, origIdx }));
  }, [parsedStudents, previewFilter]);

  // Deep AI Document Scan specifically to discover missing passports / birthdates
  const handleDeepAiScan = async () => {
    if (!rawExtractedText || isAiScanning) return;
    setIsAiScanning(true);
    try {
      const aiRes = await fetch('/api/parse-document-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ textContent: rawExtractedText, fileName: uploadedFileName || 'maktab_hujjati' }),
      });
      if (aiRes.ok) {
        const aiData = await aiRes.json();
        if (aiData.success && Array.isArray(aiData.students) && aiData.students.length > 0) {
          setParsedStudents(prev => {
            return prev.map(existing => {
              const normExist = existing.fullName.toLowerCase().replace(/[^a-z\u0400-\u04FF]/g, '');
              const existWords = existing.fullName.toLowerCase().split(/\s+/).filter(Boolean);

              const aiMatch = aiData.students.find((aiSt: any) => {
                const normAi = (aiSt.fullName || '').toLowerCase().replace(/[^a-z\u0400-\u04FF]/g, '');
                if (normExist === normAi) return true;

                // Match with high confidence on both first and last name
                const aiWords = (aiSt.fullName || '').toLowerCase().split(/\s+/).filter(Boolean);
                if (existWords.length >= 2 && aiWords.length >= 2) {
                  const lastMatch = existWords[0] === aiWords[0] || 
                    (existWords[0].length >= 5 && aiWords[0].length >= 5 && existWords[0].slice(0, 5) === aiWords[0].slice(0, 5));
                  const firstMatch = existWords[1] === aiWords[1] || 
                    (existWords[1].length >= 4 && aiWords[1].length >= 4 && existWords[1].slice(0, 4) === aiWords[1].slice(0, 4));
                  return lastMatch && firstMatch;
                }
                return false;
              });

              if (aiMatch) {
                return {
                  fullName: existing.fullName,
                  birthDate: existing.birthDate?.trim() ? existing.birthDate : (aiMatch.birthDate || ''),
                  passportOrId: existing.passportOrId?.trim() ? existing.passportOrId : (aiMatch.passportOrId || ''),
                };
              }
              return existing;
            });
          });
          confetti({ particleCount: 50, spread: 60 });
        }
      }
    } catch (err) {
      console.error("AI skanerlashda xatolik:", err);
    } finally {
      setIsAiScanning(false);
    }
  };

  // Process uploaded file (with optional target sheet)
  const handleProcessFile = async (file: File, targetSheet?: string) => {
    setIsProcessing(true);
    setCurrentFile(file);
    setUploadedFileName(file.name);

    try {
      const extracted = await extractStudentsFromFile(file, targetSheet);
      setRawExtractedText(extracted.rawText || '');
      setAvailableSheets(extracted.availableSheets || []);
      setActiveSheetName(extracted.activeSheetName || '');

      if (uploadMode === 'new') {
        if (extracted.detectedClassName && !newClassName) {
          setNewClassName(extracted.detectedClassName);
        }
        if (extracted.detectedTeacherName && !teacherName) {
          setTeacherName(extracted.detectedTeacherName);
        }
      }

      let finalStudents = extracted.students;

      // If local extraction found no students at all, invoke AI parser
      if (finalStudents.length === 0 && extracted.rawText && extracted.rawText.length > 20) {
        try {
          const aiRes = await fetch('/api/parse-document-ai', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ textContent: extracted.rawText, fileName: file.name }),
          });

          if (aiRes.ok) {
            const aiData = await aiRes.json();
            if (aiData.success && Array.isArray(aiData.students) && aiData.students.length > 0) {
              finalStudents = aiData.students;
              if (uploadMode === 'new') {
                if (aiData.detectedClassName) setNewClassName(aiData.detectedClassName);
                if (aiData.detectedTeacherName) setTeacherName(aiData.detectedTeacherName);
              }
            }
          }
        } catch {
          // fallback to local extracted
        }
      }

      setParsedStudents(finalStudents);

      if (finalStudents.length > 0) {
        confetti({
          particleCount: 50,
          spread: 60,
          origin: { y: 0.6 }
        });
      }
    } catch (err) {
      console.error("Hujjatni o'qishda xatolik:", err);
      alert("Faylni o'qishda xatolik yuz berdi. Iltimos, Excel (.xlsx), Word (.docx) yoki matn formatida yuklang.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSwitchSheet = async (sheet: string) => {
    if (!currentFile || sheet === activeSheetName) return;
    await handleProcessFile(currentFile, sheet);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      await handleProcessFile(file);
    }
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await handleProcessFile(file);
    }
  };

  const handleManualParse = () => {
    if (!manualText.trim()) return;
    const parsed = parseStudentsFromText(manualText);
    if (parsed.length === 0) {
      alert("Matnda o'quvchilar aniqlanmadi. Har bir o'quvchini yangi qatordan yozing.");
      return;
    }
    setParsedStudents(parsed);
    setShowManualInput(false);
  };

  const handleUpdateStudent = (index: number, field: keyof ParsedStudentPreview, val: string) => {
    setParsedStudents(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: val };
      return copy;
    });
  };

  const handleDeleteStudentRow = (index: number) => {
    setParsedStudents(prev => prev.filter((_, idx) => idx !== index));
  };

  const handleAddEmptyRow = () => {
    setParsedStudents(prev => [
      ...prev,
      { fullName: '', birthDate: '', passportOrId: '' }
    ]);
  };

  const handleSave = () => {
    setValidationError('');
    const validStudents = parsedStudents.filter(s => s.fullName.trim().length > 0);

    if (validStudents.length === 0) {
      setValidationError("Kamida bitta o'quvchi F.I.SH.i kiritilishi shart!");
      return;
    }

    let targetClass: ClassGroup;

    if (uploadMode === 'new') {
      if (!newClassName.trim() || !teacherName.trim()) {
        setValidationError("Iltimos, sinf nomi (masalan: 10-A) va sinf rahbarining ism-familiyasini kiriting!");
        return;
      }
      const newId = `class-${newClassName.toLowerCase().replace(/[^a-z0-9]/g, '')}-${Date.now().toString().slice(-4)}`;
      targetClass = {
        id: newId,
        name: newClassName.trim().toUpperCase(),
        teacherName: teacherName.trim(),
        teacherPhone: teacherPhone.trim() || '+998 90 000 00 00',
        paidAmount: 0,
        pricePerStudent: 5000,
      };
    } else {
      const existing = classes.find(c => c.id === selectedClassId);
      if (!existing) {
        setValidationError("Iltimos, mavjud sinflardan birini tanlang!");
        return;
      }
      targetClass = existing;
    }

    // Filter out duplicates if user agrees, or alert
    const duplicateCount = validStudents.filter(s => isDuplicateName(s.fullName)).length;
    let studentsToInsert = validStudents;

    if (uploadMode === 'existing' && duplicateCount > 0) {
      // Automatically skip duplicates when adding to an existing class
      studentsToInsert = validStudents.filter(s => !isDuplicateName(s.fullName));
    }

    if (studentsToInsert.length === 0) {
      setValidationError("Qo'shish uchun yangi o'quvchi qolmadi (barcha kiritilgan o'quvchilar ushbu sinfda avvaldan mavjud).");
      return;
    }

    const now = new Date().toISOString();
    const createdStudents: Student[] = studentsToInsert.map((item, idx) => ({
      id: `st-${Date.now()}-${idx}`,
      fullName: item.fullName.trim(),
      birthDate: item.birthDate?.trim() || '',
      passportOrId: item.passportOrId?.trim() || '',
      classId: targetClass.id,
      status: 'pending',
      createdAt: now,
    }));

    const {
      updatedStudents,
      updatedEmailPool,
    } = distributeEmailsToStudents(
      [...students, ...createdStudents],
      emailPool,
      []
    );

    const finalNewStudents = updatedStudents.filter(s => 
      createdStudents.some(cs => cs.id === s.id)
    );

    onSaveClassAndStudents(targetClass, finalNewStudents, updatedEmailPool);

    confetti({ particleCount: 70, spread: 80 });
    onClose();
  };

  const validStudentsCount = parsedStudents.filter(s => s.fullName.trim().length > 0).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-white border border-slate-300 rounded-2xl shadow-2xl overflow-hidden my-6">
        
        {/* Modal Header */}
        <div className="px-6 py-4.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 flex items-center justify-center flex-shrink-0">
              <School className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <span>{uploadMode === 'existing' ? "Mavjud Sinfga O'quvchilar Qo'shish" : "Hujjat Orqali Yangi Sinf Ochish"}</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-800 border border-blue-200 uppercase">
                  Excel & Word
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                {uploadMode === 'existing' 
                  ? "Avval kiritilgan sinfga qo'shimcha o'quvchilarni fayldan (Excel, Word) yuklash" 
                  : "Excel (.xlsx), Word (.docx) faylini yuklang — yangi sinf va o'quvchilar ochiladi"}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Selector Tabs */}
        <div className="px-6 pt-4 pb-2 bg-slate-100/70 border-b border-slate-200 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setUploadMode('existing')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
              uploadMode === 'existing'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-white text-slate-700 hover:bg-slate-200/80 border border-slate-200'
            }`}
          >
            <UserPlus className="w-4 h-4" />
            <span>Mavjud sinfga o'quvchilar qo'shish</span>
            {classes.length > 0 && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${uploadMode === 'existing' ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-600'}`}>
                {classes.length} ta sinf
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setUploadMode('new')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
              uploadMode === 'new'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-white text-slate-700 hover:bg-slate-200/80 border border-slate-200'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>0 dan Yangi sinf ochish va yuklash</span>
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">

          {/* Validation Error Banner */}
          {validationError && (
            <div className="p-3.5 bg-rose-50 border-2 border-rose-300 rounded-xl text-xs text-rose-900 flex items-center justify-between gap-2 animate-scale-up">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                <span className="font-semibold">{validationError}</span>
              </div>
              <button
                type="button"
                onClick={() => setValidationError('')}
                className="text-rose-500 hover:text-rose-800 p-1 rounded-md hover:bg-rose-100 transition-colors cursor-pointer"
                title="Yopish"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* TARGET CLASS SELECTION / CREATION SECTION */}
          {uploadMode === 'existing' ? (
            <div className="p-4 bg-blue-50/70 border border-blue-200 rounded-xl space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-bold text-slate-800 mb-1">
                    Qaysi sinfga o'quvchi qo'shmoqchisiz? <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={selectedClassId}
                    onChange={e => setSelectedClassId(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs sm:text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs cursor-pointer"
                  >
                    {classes.map(c => {
                      const count = students.filter(s => s.classId === c.id).length;
                      return (
                        <option key={c.id} value={c.id}>
                          {c.name} sinfi — Rahbar: {c.teacherName} ({count} ta o'quvchi mavjud)
                        </option>
                      );
                    })}
                  </select>
                </div>

                {currentSelectedClass && (
                  <div className="bg-white px-4 py-2.5 rounded-xl border border-blue-200/80 flex items-center gap-4 text-xs">
                    <div>
                      <span className="text-slate-500 block text-[11px]">Sinf rahbari:</span>
                      <span className="font-bold text-slate-900">{currentSelectedClass.teacherName}</span>
                    </div>
                    <div className="border-l border-slate-200 pl-4">
                      <span className="text-slate-500 block text-[11px]">Hozirgi o'quvchilar:</span>
                      <span className="font-bold text-blue-700">{existingClassStudents.length} nafar</span>
                    </div>
                  </div>
                )}
              </div>

              {currentSelectedClass && validStudentsCount > 0 && (
                <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center justify-between">
                  <span className="font-medium">
                    Amaldagi <strong>{existingClassStudents.length} ta</strong> o'quvchiga yana <strong>{validStudentsCount} ta</strong> yangi o'quvchi qo'shiladi.
                  </span>
                  <span className="font-extrabold px-2 py-0.5 bg-emerald-600 text-white rounded-md text-[11px]">
                    Jami: {existingClassStudents.length + validStudentsCount} ta o'quvchi bo'ladi
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <School className="w-4 h-4 text-blue-600" />
                <span>Yangi Sinf Ma'lumotlari</span>
              </h3>
              
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Sinf Nomi <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Masalan: 10-A yoki 9-B"
                    value={newClassName}
                    onChange={e => setNewClassName(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Sinf Rahbari (F.I.SH) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Masalan: Abdullayev Anvar"
                    value={teacherName}
                    onChange={e => setTeacherName(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Ustoz Telefon Raqami
                  </label>
                  <input
                    type="text"
                    placeholder="+998 90 123 45 67"
                    value={teacherPhone}
                    onChange={e => setTeacherPhone(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* DRAG & DROP FILE UPLOAD AREA */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-2xl p-6 sm:p-8 text-center transition-all cursor-pointer relative ${
              isDragging
                ? 'border-blue-500 bg-blue-50/70 scale-[1.01]'
                : 'border-slate-300 hover:border-blue-400 bg-slate-50/50'
            }`}
          >
            <input
              type="file"
              accept=".xlsx,.xls,.docx,.doc,.txt,.csv"
              onChange={handleFileInputChange}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />

            {isProcessing ? (
              <div className="flex flex-col items-center justify-center space-y-3 py-4">
                <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
                <div className="space-y-1">
                  <p className="text-sm font-bold text-slate-800">
                    Hujjat tahlil qilinmoqda...
                  </p>
                  <p className="text-xs text-slate-500">
                    O'quvchilar ro'yxati, ism-familiyalar va sinf ma'lumotlari ajratib olinmoqda
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center space-y-3">
                <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center shadow-xs">
                  <Upload className="w-7 h-7" />
                </div>

                <div className="space-y-1">
                  <p className="text-sm font-bold text-slate-800">
                    {uploadedFileName ? (
                      <span className="text-blue-600">Fayl: {uploadedFileName}</span>
                    ) : (
                      "Hujjat faylini bu yerga tashlang yoki bosing"
                    )}
                  </p>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    Microsoft Excel (<strong>.xlsx</strong>), Word (<strong>.docx</strong>), CSV yoki matn fayllari qo'llab-quvvatlanadi
                  </p>
                </div>

                <div className="flex items-center gap-2 pt-1 text-[11px] text-slate-400">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                  <span>Avtomatik ism-sharif, tug'ilgan sana va metrikalarni taniydi</span>
                </div>
              </div>
            )}
          </div>

          {/* Quick Manual text parse toggle */}
          <div className="flex items-center justify-between text-xs pt-1">
            <button
              type="button"
              onClick={() => setShowManualInput(!showManualInput)}
              className="text-blue-600 hover:text-blue-800 font-semibold cursor-pointer underline flex items-center gap-1"
            >
              <span>{showManualInput ? "Fayl yuklashga qaytish" : "Yoki o'quvchilar ro'yxatini matn sifatida qo'lda kiritish (Paste)"}</span>
            </button>

            {parsedStudents.length > 0 && (
              <span className="font-bold text-slate-700 bg-slate-100 px-3 py-1 rounded-lg">
                Jami aniqlangan: {parsedStudents.length} ta o'quvchi
              </span>
            )}
          </div>

          {showManualInput && (
            <div className="p-4 bg-slate-50 border border-slate-300 rounded-xl space-y-3">
              <label className="block text-xs font-semibold text-slate-700">
                O'quvchilar ro'yxatini bu yerga nusxalab qo'ying (Har biri yangi qatorda):
              </label>
              <textarea
                rows={5}
                value={manualText}
                onChange={e => setManualText(e.target.value)}
                placeholder="1. Aliyev Vali 2008-04-12 AB1234567&#10;2. Karimova Gulnora 2008-11-20 AC7654321&#10;3. Toshmatov Jasur"
                className="w-full p-3 bg-white border border-slate-300 rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={handleManualParse}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg cursor-pointer transition-colors"
              >
                Matndan o'quvchilarni ajratish
              </button>
            </div>
          )}

          {/* PREVIEW OF PARSED STUDENTS TABLE */}
          {parsedStudents.length > 0 && (
            <div className="space-y-3">

              {/* Multi-sheet Excel Selector Banner */}
              {availableSheets.length > 1 && (
                <div className="p-3.5 bg-blue-50/90 border border-blue-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-xs animate-fade-in">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold flex-shrink-0">
                      <FileSpreadsheet className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="font-bold text-slate-900 block">Excel Fayli Varoqlari (Sheets):</span>
                      <span className="text-[11px] text-slate-600">
                        Ushbu Excel faylda {availableSheets.length} ta varoq topildi. Kerakli sinf varog'ini tanlang:
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {availableSheets.map(sheet => (
                      <button
                        key={sheet}
                        type="button"
                        onClick={() => handleSwitchSheet(sheet)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          activeSheetName === sheet
                            ? 'bg-blue-600 text-white shadow-xs ring-2 ring-blue-300'
                            : 'bg-white text-slate-700 hover:bg-blue-100/70 border border-slate-200'
                        }`}
                      >
                        {sheet}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Duplicate Passport/Metrika Warning Banner */}
              {duplicatePassports.size > 0 && (
                <div className="p-3.5 bg-rose-50 border border-rose-300 rounded-xl flex items-start gap-3 text-xs text-rose-800 shadow-xs animate-fade-in">
                  <AlertTriangle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-sm block text-rose-900">
                      ⚠️ DIQQAT: {duplicatePassports.size} ta takroriy (dublikat) metrika yoki pasport aniqlandi!
                    </span>
                    <p className="mt-1 text-rose-700">
                      Quyidagi hujjat raqamlari birdan ortiq o'quvchida takrorlanmoqda: <strong>{Array.from(duplicatePassports).join(', ')}</strong>. Iltimos, pastdagi qizil rang bilan belgilangan qatorlarni tekshiring va to'g'rilang.
                    </p>
                  </div>
                </div>
              )}

              {/* Missing Data Warning & Action Banner */}
              {(missingBirthDateCount > 0 || missingPassportCount > 0) && (
                <div className="p-4 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-300 rounded-2xl shadow-xs animate-fade-in space-y-3">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-sm block text-amber-900">
                        ⚠️ Diqqat: {incompleteStudents.length} ta o'quvchida ma'lumot to'liq emas!
                      </span>
                      <p className="mt-0.5 text-xs text-amber-800">
                        {missingBirthDateCount > 0 && (
                          <span>• <strong>{missingBirthDateCount} ta</strong> o'quvchida tug'ilgan sana topilmadi. </span>
                        )}
                        {missingPassportCount > 0 && (
                          <span>• <strong>{missingPassportCount} ta</strong> o'quvchida metrika yoki pasport topilmadi. </span>
                        )}
                        Quyidagi qulay yordamchi tugmalar orqali ularni to'ldirishingiz yoki AI bilan hujjatdan chuqurroq qidirishingiz mumkin:
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {rawExtractedText && (
                      <button
                        type="button"
                        onClick={handleDeepAiScan}
                        disabled={isAiScanning}
                        className="px-3.5 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
                      >
                        {isAiScanning ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>AI hujjatdan sinchiklab qidirmoqda...</span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>✨ AI bilan chuqur qidirish</span>
                          </>
                        )}
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setShowMissingAssistant(true)}
                      className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>✍️ Yetishmayotganlarni to'ldirish yordamchisi ({incompleteStudents.length})</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPreviewFilter(previewFilter === 'incomplete' ? 'all' : 'incomplete')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                        previewFilter === 'incomplete'
                          ? 'bg-amber-200 border-amber-400 text-amber-900 font-bold'
                          : 'bg-white border-amber-300 text-amber-800 hover:bg-amber-100/50'
                      }`}
                    >
                      <span>{previewFilter === 'incomplete' ? "Barchasini ko'rsatish" : "Faqat to'ldirilishi kerak bo'lganlar"}</span>
                    </button>
                  </div>
                </div>
              )}

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Users className="w-4 h-4 text-blue-600" />
                    <span>Yuklangan O'quvchilar Ko'rigi</span>
                  </h3>
                  <p className="text-xs text-slate-500">
                    Ism-familiya, tug'ilgan sana va metrika ma'lumotlari avtomatik ajratildi (ortiqcha manzillar tashlab yuborildi)
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {/* Segmented Filter Pills */}
                  <div className="inline-flex items-center p-0.5 bg-slate-100 border border-slate-200 rounded-lg text-[11px] font-semibold">
                    <button
                      type="button"
                      onClick={() => setPreviewFilter('all')}
                      className={`px-2 py-1 rounded-md transition-colors cursor-pointer ${
                        previewFilter === 'all'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Barchasi ({parsedStudents.length})
                    </button>
                    {incompleteStudents.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setPreviewFilter('incomplete')}
                        className={`px-2 py-1 rounded-md transition-colors cursor-pointer flex items-center gap-1 ${
                          previewFilter === 'incomplete'
                            ? 'bg-amber-500 text-white shadow-xs'
                            : 'text-amber-700 hover:bg-amber-50'
                        }`}
                      >
                        <span>⚠️ Chala</span>
                        <span className="text-[10px] bg-amber-600/30 px-1 rounded-full">{incompleteStudents.length}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setPreviewFilter('ready')}
                      className={`px-2 py-1 rounded-md transition-colors cursor-pointer flex items-center gap-1 ${
                        previewFilter === 'ready'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'text-emerald-700 hover:bg-emerald-50'
                      }`}
                    >
                      <span>✅ To'liq</span>
                      <span className="text-[10px] bg-emerald-600/20 px-1 rounded-full">{readyStudentsCount}</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={handleAddEmptyRow}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Qator qo'shish</span>
                  </button>
                </div>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden max-h-72 overflow-y-auto shadow-inner">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0 border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 pl-4 pr-2 w-10">№</th>
                      <th className="py-2.5 px-3">O'quvchi F.I.SH <span className="text-rose-500">*</span></th>
                      <th className="py-2.5 px-3">Tug'ilgan Sana</th>
                      <th className="py-2.5 px-3">Metrika / Pasport</th>
                      <th className="py-2.5 px-3 text-center w-24">Holat</th>
                      <th className="py-2.5 pr-4 text-right w-12">O'chirish</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {displayedStudents.map((st) => {
                      const idx = st.origIdx;
                      const isDupName = isDuplicateName(st.fullName);
                      const normPass = st.passportOrId?.trim().toUpperCase();
                      const isDupPass = Boolean(normPass && normPass.length >= 4 && duplicatePassports.has(normPass));
                      const isMissingBirth = !st.birthDate?.trim();
                      const isMissingPass = !st.passportOrId?.trim();

                      return (
                        <tr 
                          key={idx} 
                          className={`hover:bg-slate-50 transition-colors ${
                            isDupPass 
                              ? 'bg-rose-50/70' 
                              : isDupName 
                              ? 'bg-amber-50/70' 
                              : ''
                          }`}
                        >
                          <td className="py-2 pl-4 pr-2 font-mono text-slate-400">
                            {idx + 1}
                          </td>
                          <td className="py-2 px-3">
                            <input
                              type="text"
                              value={st.fullName}
                              onChange={e => handleUpdateStudent(idx, 'fullName', e.target.value)}
                              placeholder="Familiya Ism Sharif"
                              className={`w-full px-2 py-1 bg-transparent border rounded text-xs font-semibold text-slate-900 focus:bg-white focus:outline-none ${
                                isDupName 
                                  ? 'border-amber-400 bg-amber-50 text-amber-900' 
                                  : 'border-transparent focus:border-blue-400'
                              }`}
                            />
                            {isDupName && (
                              <span className="text-[10px] text-amber-700 font-semibold flex items-center gap-1 mt-0.5">
                                <AlertTriangle className="w-3 h-3 text-amber-600 flex-shrink-0" />
                                <span>Bu sinfda allaqachon mavjud!</span>
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-3">
                            <input
                              type="text"
                              placeholder="⚠️ Sana kiritilmagan"
                              value={st.birthDate || ''}
                              onChange={e => handleUpdateStudent(idx, 'birthDate', e.target.value)}
                              className={`w-full px-2 py-1 bg-transparent border rounded text-xs text-slate-700 focus:bg-white focus:outline-none ${
                                isMissingBirth
                                  ? 'border-amber-400 border-dashed bg-amber-50/50 text-amber-900 placeholder:text-amber-500 font-medium'
                                  : 'border-transparent focus:border-blue-400'
                              }`}
                            />
                          </td>
                          <td className="py-2 px-3">
                            <input
                              type="text"
                              placeholder="⚠️ Pasport / metrika kiritilmagan"
                              value={st.passportOrId || ''}
                              onChange={e => handleUpdateStudent(idx, 'passportOrId', e.target.value)}
                              className={`w-full px-2 py-1 bg-transparent border rounded text-xs font-mono uppercase text-slate-800 focus:bg-white focus:outline-none ${
                                isDupPass
                                  ? 'border-rose-400 bg-rose-50 text-rose-900 font-bold ring-1 ring-rose-400'
                                  : isMissingPass
                                  ? 'border-rose-300 border-dashed bg-rose-50/50 text-rose-900 placeholder:text-rose-400 font-medium'
                                  : 'border-transparent focus:border-blue-400'
                              }`}
                            />
                            {isDupPass && (
                              <span className="text-[10px] text-rose-700 font-bold flex items-center gap-1 mt-0.5">
                                <AlertTriangle className="w-3 h-3 text-rose-600 flex-shrink-0" />
                                <span>Takroriy metrika!</span>
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-center">
                            {isDupPass ? (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
                                Dublikat metrika
                              </span>
                            ) : isDupName ? (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                                Dublikat ism
                              </span>
                            ) : isMissingBirth || isMissingPass ? (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                Chala
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                To'liq
                              </span>
                            )}
                          </td>
                          <td className="py-2 pr-4 text-right">
                            <button
                              type="button"
                              onClick={() => handleDeleteStudentRow(idx)}
                              className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors cursor-pointer"
                              title="Qatorni o'chirish"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* INTERACTIVE MISSING INFORMATION ASSISTANT MODAL */}
          {showMissingAssistant && (
            <div className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-4 bg-slate-900/70 backdrop-blur-xs animate-fade-in">
              <div className="relative w-full max-w-2xl bg-white border border-amber-300 rounded-2xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col">
                {/* Header */}
                <div className="px-6 py-4 bg-gradient-to-r from-amber-50 to-orange-50 border-b border-amber-200 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-100 border border-amber-300 text-amber-700 flex items-center justify-center flex-shrink-0">
                      <AlertCircle className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-900">
                        Yetishmayotgan Ma'lumotlarni To'ldirish
                      </h3>
                      <p className="text-xs text-slate-600">
                        Quyidagi {incompleteStudents.length} ta o'quvchining pasport yoki tug'ilgan sanasi hujjatda topilmadi. Iltimos, ularni kiriting:
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowMissingAssistant(false)}
                    className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg transition-colors cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Body: List of incomplete students */}
                <div className="p-4 sm:p-6 overflow-y-auto space-y-3.5 flex-1">
                  {incompleteStudents.map((st, i) => (
                    <div key={st.origIdx} className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5 hover:border-blue-300 transition-colors">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800">
                          {i + 1}. {st.fullName}
                        </span>
                        <div className="flex items-center gap-1.5">
                          {!st.birthDate?.trim() && (
                            <span className="px-2 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-800 rounded">
                              Sana kerak
                            </span>
                          )}
                          {!st.passportOrId?.trim() && (
                            <span className="px-2 py-0.5 text-[10px] font-bold bg-rose-100 text-rose-800 rounded">
                              Pasport kerak
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                            Tug'ilgan sana (DD.MM.YYYY)
                          </label>
                          <input
                            type="text"
                            placeholder="Masalan: 15.04.2008"
                            value={st.birthDate || ''}
                            onChange={e => handleUpdateStudent(st.origIdx, 'birthDate', e.target.value)}
                            className={`w-full px-3 py-1.5 text-xs rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                              !st.birthDate?.trim()
                                ? 'border-amber-400 bg-amber-50/50 text-slate-900 font-medium placeholder:text-amber-500'
                                : 'border-slate-300 bg-white'
                            }`}
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                            Metrika yoki Pasport raqami
                          </label>
                          <input
                            type="text"
                            placeholder="Masalan: AA 1234567 yoki I-TN 1234567"
                            value={st.passportOrId || ''}
                            onChange={e => handleUpdateStudent(st.origIdx, 'passportOrId', e.target.value)}
                            className={`w-full px-3 py-1.5 text-xs font-mono uppercase rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                              !st.passportOrId?.trim()
                                ? 'border-rose-400 bg-rose-50/50 text-slate-900 font-bold placeholder:text-rose-400'
                                : 'border-slate-300 bg-white'
                            }`}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Footer */}
                <div className="px-6 py-3.5 bg-slate-100 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
                  {rawExtractedText ? (
                    <button
                      type="button"
                      onClick={handleDeepAiScan}
                      disabled={isAiScanning}
                      className="px-3.5 py-2 bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-700 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      {isAiScanning ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>AI hujjatni qayta qidirmoqda...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                          <span>AI orqali hujjatdan qidirish</span>
                        </>
                      )}
                    </button>
                  ) : <div />}

                  <button
                    type="button"
                    onClick={() => setShowMissingAssistant(false)}
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Saqlash va jadvalga qaytish</span>
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="text-xs text-slate-500">
            {validStudentsCount > 0 ? (
              <span className="font-semibold text-blue-700">
                ✅ {validStudentsCount} ta o'quvchi tayyorlandi (Coursera emaillari avtomatik biriktiriladi)
              </span>
            ) : (
              <span>O'quvchilar ro'yxatini yuklang</span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
            >
              Bekor qilish
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={validStudentsCount === 0 || isProcessing}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl shadow-xs inline-flex items-center gap-2 transition-all cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {uploadMode === 'existing' 
                  ? `Sinfga ${validStudentsCount} ta o'quvchini qo'shish` 
                  : `Yangi sinfni saqlash (${validStudentsCount} ta)`}
              </span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
