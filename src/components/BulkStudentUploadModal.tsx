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
  const [isProcessing, setIsProcessing] = useState(false);
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

  // Process uploaded file
  const handleProcessFile = async (file: File) => {
    setIsProcessing(true);
    setUploadedFileName(file.name);

    try {
      const extracted = await extractStudentsFromFile(file);

      if (uploadMode === 'new') {
        if (extracted.detectedClassName && !newClassName) {
          setNewClassName(extracted.detectedClassName);
        }
        if (extracted.detectedTeacherName && !teacherName) {
          setTeacherName(extracted.detectedTeacherName);
        }
      }

      let finalStudents = extracted.students;

      if (extracted.rawText && extracted.rawText.length > 20) {
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
      const proceed = confirm(
        `Diqqat: Yuklanayotgan ro'yxatda ${duplicateCount} ta o'quvchi ushbu sinfda allaqachon mavjud!\n\n` +
        `Takroriy o'quvchilarni tashlab ketib, faqat yangilarini qo'shishni xohlaysizmi?\n` +
        `- "OK" ni bossangiz faqat yangi o'quvchilar qo'shiladi.\n` +
        `- "Bekor qilish" ni bossangiz barcha qatorlar qo'shiladi.`
      );
      if (proceed) {
        studentsToInsert = validStudents.filter(s => !isDuplicateName(s.fullName));
      }
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
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Users className="w-4 h-4 text-blue-600" />
                    <span>Yuklangan O'quvchilar Ko'rigi</span>
                  </h3>
                  <p className="text-xs text-slate-500">
                    Ma'lumotlarni to'g'ridan-to'g'ri jadvalda tekshirishingiz yoki tahrirlashingiz mumkin
                  </p>
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

              <div className="border border-slate-200 rounded-xl overflow-hidden max-h-72 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-600 font-bold sticky top-0 border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 pl-4 pr-2 w-10">№</th>
                      <th className="py-2.5 px-3">O'quvchi F.I.SH <span className="text-rose-500">*</span></th>
                      <th className="py-2.5 px-3">Tug'ilgan Sana</th>
                      <th className="py-2.5 px-3">Metrika / Pasport</th>
                      <th className="py-2.5 px-3 text-center w-16">Holat</th>
                      <th className="py-2.5 pr-4 text-right w-12">O'chirish</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {parsedStudents.map((st, idx) => {
                      const isDup = isDuplicateName(st.fullName);
                      return (
                        <tr 
                          key={idx} 
                          className={`hover:bg-slate-50 transition-colors ${isDup ? 'bg-amber-50/60' : ''}`}
                        >
                          <td className="py-2 pl-4 pr-2 font-mono text-slate-400">
                            {idx + 1}
                          </td>
                          <td className="py-2 px-3">
                            <input
                              type="text"
                              value={st.fullName}
                              onChange={e => handleUpdateStudent(idx, 'fullName', e.target.value)}
                              className={`w-full px-2 py-1 bg-transparent border rounded text-xs font-medium text-slate-900 focus:bg-white focus:outline-none ${
                                isDup ? 'border-amber-400 bg-amber-50 text-amber-900' : 'border-transparent focus:border-blue-400'
                              }`}
                            />
                            {isDup && (
                              <span className="text-[10px] text-amber-700 font-semibold flex items-center gap-1 mt-0.5">
                                <AlertTriangle className="w-3 h-3 text-amber-600 flex-shrink-0" />
                                <span>Bu sinfda allaqachon mavjud!</span>
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-3">
                            <input
                              type="text"
                              placeholder="YYYY-MM-DD"
                              value={st.birthDate || ''}
                              onChange={e => handleUpdateStudent(idx, 'birthDate', e.target.value)}
                              className="w-full px-2 py-1 bg-transparent border border-transparent focus:border-blue-400 rounded text-xs text-slate-700 focus:bg-white focus:outline-none"
                            />
                          </td>
                          <td className="py-2 px-3">
                            <input
                              type="text"
                              placeholder="Pasport / ID"
                              value={st.passportOrId || ''}
                              onChange={e => handleUpdateStudent(idx, 'passportOrId', e.target.value)}
                              className="w-full px-2 py-1 bg-transparent border border-transparent focus:border-blue-400 rounded text-xs text-slate-700 focus:bg-white focus:outline-none"
                            />
                          </td>
                          <td className="py-2 px-3 text-center">
                            {isDup ? (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                                Dublikat
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                Yangi
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
