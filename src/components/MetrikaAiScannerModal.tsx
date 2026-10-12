import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ClassGroup, Student, EmailAccount } from '../types';
import { 
  compressCertificateImage, 
  CompressedCertificate, 
  chunkArray 
} from '../utils/certificateCompressor';
import { distributeEmailsToStudents } from '../utils/emailManager';
import confetti from 'canvas-confetti';
import {
  X,
  Camera,
  Upload,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Trash2,
  RefreshCw,
  Eye,
  Plus,
  School,
  UserPlus,
  Layers,
  ArrowRight,
  Info,
  Clock,
  Zap,
  Image as ImageIcon
} from 'lucide-react';

export interface ExtractedStudentRow {
  id: string;
  certificateId: string;
  originalFileName: string;
  previewUrl: string;
  fullName: string;
  birthDate: string;
  passportOrId: string;
  confidence: 'high' | 'medium' | 'low';
  notes?: string;
  status: 'pending' | 'processing' | 'done' | 'error';
  errorMessage?: string;
}

interface MetrikaAiScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  classes: ClassGroup[];
  students: Student[];
  emailPool: EmailAccount[];
  initialClassId?: string;
  onSaveClassAndStudents: (
    updatedClass: ClassGroup,
    newStudents: Student[],
    updatedEmailPool: EmailAccount[]
  ) => void;
}

export const MetrikaAiScannerModal: React.FC<MetrikaAiScannerModalProps> = ({
  isOpen,
  onClose,
  classes,
  students,
  emailPool,
  initialClassId,
  onSaveClassAndStudents,
}) => {
  // Mode: 'new' or 'existing'
  const [uploadMode, setUploadMode] = useState<'new' | 'existing'>(
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
  const [isExternalSchool, setIsExternalSchool] = useState(false);
  const [schoolName, setSchoolName] = useState('');

  // Selected & compressed image files
  const [certificates, setCertificates] = useState<CompressedCertificate[]>([]);
  const [isCompressing, setIsCompressing] = useState(false);
  const [compressProgress, setCompressProgress] = useState({ current: 0, total: 0 });

  // Recognition Results
  const [extractedRows, setExtractedRows] = useState<ExtractedStudentRow[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [scanProgress, setScanProgress] = useState({ current: 0, total: 0 });
  const [currentScanningName, setCurrentScanningName] = useState<string>('');
  const [rateLimitCountdown, setRateLimitCountdown] = useState<number | null>(null);

  // Preview zoom image
  const [zoomedImage, setZoomedImage] = useState<{ url: string; name: string } | null>(null);

  // Drag & drop
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Cancellation ref
  const cancelScanRef = useRef(false);

  useEffect(() => {
    if (initialClassId && classes.some(c => c.id === initialClassId)) {
      setUploadMode('existing');
      setSelectedClassId(initialClassId);
    }
  }, [initialClassId, classes]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (zoomedImage) {
          setZoomedImage(null);
        } else if (!isScanning) {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [zoomedImage, isScanning, onClose]);

  // Statistics calculation for compression and token saving
  const totalOriginalBytes = useMemo(() => {
    return certificates.reduce((acc, c) => acc + c.originalSize, 0);
  }, [certificates]);

  const totalCompressedBytes = useMemo(() => {
    return certificates.reduce((acc, c) => acc + c.compressedSize, 0);
  }, [certificates]);

  const overallSavedPercent = useMemo(() => {
    if (totalOriginalBytes === 0) return 0;
    return Math.max(0, Math.round(((totalOriginalBytes - totalCompressedBytes) / totalOriginalBytes) * 100));
  }, [totalOriginalBytes, totalCompressedBytes]);

  const totalEstimatedTokens = useMemo(() => {
    return certificates.reduce((acc, c) => acc + c.estimatedTokens, 0);
  }, [certificates]);

  if (!isOpen) return null;

  // Handle file addition (compression on the fly)
  const handleFilesSelected = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList).filter(f => f.type.startsWith('image/'));
    if (files.length === 0) return;

    setIsCompressing(true);
    setCompressProgress({ current: 0, total: files.length });

    const newCompressed: CompressedCertificate[] = [];
    const newRows: ExtractedStudentRow[] = [];

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      try {
        setCompressProgress({ current: i + 1, total: files.length });
        const compressed = await compressCertificateImage(f, { maxDimension: 1200, quality: 0.82 });
        newCompressed.push(compressed);

        newRows.push({
          id: `row-${compressed.id}`,
          certificateId: compressed.id,
          originalFileName: compressed.originalFileName,
          previewUrl: compressed.previewUrl,
          fullName: '',
          birthDate: '',
          passportOrId: '',
          confidence: 'medium',
          status: 'pending',
        });
      } catch (err) {
        console.error(`Xatolik rasm siqishda (${f.name}):`, err);
      }
    }

    setCertificates(prev => [...prev, ...newCompressed]);
    setExtractedRows(prev => [...prev, ...newRows]);
    setIsCompressing(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesSelected(e.dataTransfer.files);
    }
  };

  // Remove a certificate
  const handleRemoveCertificate = (certId: string) => {
    setCertificates(prev => prev.filter(c => c.id !== certId));
    setExtractedRows(prev => prev.filter(r => r.certificateId !== certId));
  };

  // Clear all
  const handleClearAll = () => {
    if (isScanning) return;
    setCertificates([]);
    setExtractedRows([]);
    setScanProgress({ current: 0, total: 0 });
    setCurrentScanningName('');
  };

  // START GEMINI FLASH AI SCANNING WITH RATE LIMIT AND BATCH SHIELD
  const startAiScanning = async () => {
    if (isScanning) return;
    cancelScanRef.current = false;
    setIsScanning(true);
    setIsPaused(false);

    // Identify rows that need scanning
    const pendingRows = extractedRows.filter(r => r.status === 'pending' || r.status === 'error');
    if (pendingRows.length === 0) {
      setIsScanning(false);
      return;
    }

    setScanProgress({ current: extractedRows.length - pendingRows.length, total: extractedRows.length });

    // We process in small batches of 2-3 images to keep within rate limits and optimize latency
    const BATCH_SIZE = 2;
    const batches = chunkArray(pendingRows, BATCH_SIZE);

    let completedCount = extractedRows.length - pendingRows.length;

    for (let bIdx = 0; bIdx < batches.length; bIdx++) {
      if (cancelScanRef.current) break;

      const batch = batches[bIdx];

      // Mark batch rows as processing
      setExtractedRows(prev => prev.map(r => {
        if (batch.some(b => b.id === r.id)) {
          return { ...r, status: 'processing' };
        }
        return r;
      }));

      setCurrentScanningName(batch.map(b => b.originalFileName).join(', '));

      // Retrieve compressed image base64s
      const payloadItems = batch.map(row => {
        const cert = certificates.find(c => c.id === row.certificateId);
        return {
          id: row.id,
          fileName: row.originalFileName,
          base64: cert?.base64 || '',
          mimeType: cert?.mimeType || 'image/jpeg',
        };
      });

      let attempt = 0;
      let success = false;

      while (attempt < 3 && !success && !cancelScanRef.current) {
        attempt++;
        try {
          const response = await fetch('/api/parse-metrikas-ai', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: payloadItems }),
          });

          if (response.status === 429) {
            // Rate limit exceeded: Wait with countdown and retry
            for (let sec = 4; sec > 0; sec--) {
              setRateLimitCountdown(sec);
              await new Promise(r => setTimeout(r, 1000));
            }
            setRateLimitCountdown(null);
            continue; // retry
          }

          if (!response.ok) {
            throw new Error(`Server status ${response.status}`);
          }

          const data = await response.json();
          if (data.results && Array.isArray(data.results)) {
            success = true;
            // Update extracted rows
            setExtractedRows(prev => prev.map(r => {
              const resItem = data.results.find((res: any) => String(res.id) === String(r.id));
              if (resItem) {
                return {
                  ...r,
                  fullName: resItem.fullName || r.fullName,
                  birthDate: resItem.birthDate || r.birthDate,
                  passportOrId: resItem.passportOrId || r.passportOrId,
                  confidence: resItem.confidence || 'high',
                  notes: resItem.notes || '',
                  status: 'done',
                };
              }
              return r;
            }));
          } else {
            throw new Error(data.error || "Ma'lumot o'qib bo'lmadi");
          }
        } catch (err: any) {
          console.warn(`Partiya ${bIdx + 1} da xatolik (urinish ${attempt}):`, err);
          if (attempt >= 3) {
            // Mark batch as error
            setExtractedRows(prev => prev.map(r => {
              if (batch.some(b => b.id === r.id)) {
                return { 
                  ...r, 
                  status: 'error', 
                  errorMessage: err.message || "O'qishda xatolik yuz berdi" 
                };
              }
              return r;
            }));
          } else {
            await new Promise(r => setTimeout(r, 1500));
          }
        }
      }

      completedCount += batch.length;
      setScanProgress({ current: Math.min(completedCount, extractedRows.length), total: extractedRows.length });

      // Polite safety delay between batches to respect 15 RPM
      if (bIdx < batches.length - 1 && !cancelScanRef.current) {
        await new Promise(r => setTimeout(r, 1200));
      }
    }

    setIsScanning(false);
    setCurrentScanningName('');
    confetti({ particleCount: 60, spread: 70 });
  };

  const handleStopScanning = () => {
    cancelScanRef.current = true;
    setIsScanning(false);
    setCurrentScanningName('');
    setRateLimitCountdown(null);
  };

  // Re-scan a single item
  const handleRetrySingle = async (rowId: string) => {
    const row = extractedRows.find(r => r.id === rowId);
    const cert = certificates.find(c => c.id === row?.certificateId);
    if (!row || !cert) return;

    setExtractedRows(prev => prev.map(r => r.id === rowId ? { ...r, status: 'processing' } : r));

    try {
      const response = await fetch('/api/parse-metrikas-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [{
            id: row.id,
            fileName: row.originalFileName,
            base64: cert.base64,
            mimeType: cert.mimeType,
          }]
        }),
      });

      const data = await response.json();
      if (data.results && data.results[0]) {
        const item = data.results[0];
        setExtractedRows(prev => prev.map(r => {
          if (r.id === rowId) {
            return {
              ...r,
              fullName: item.fullName || r.fullName,
              birthDate: item.birthDate || r.birthDate,
              passportOrId: item.passportOrId || r.passportOrId,
              confidence: item.confidence || 'high',
              notes: item.notes || '',
              status: 'done',
              errorMessage: undefined,
            };
          }
          return r;
        }));
      } else {
        throw new Error(data.error || "O'qib bo'lmadi");
      }
    } catch (err: any) {
      setExtractedRows(prev => prev.map(r => r.id === rowId ? { ...r, status: 'error', errorMessage: err.message } : r));
    }
  };

  // Save to class
  const handleSaveToClass = () => {
    const validRows = extractedRows.filter(r => r.fullName.trim().length > 0);
    if (validRows.length === 0) {
      alert("Saqlash uchun kamida 1 ta o'quvchi ma'lumotlari kiritilgan bo'lishi kerak!");
      return;
    }

    let targetClass: ClassGroup;
    if (uploadMode === 'new') {
      if (!newClassName.trim()) {
        alert("Iltimos, yangi sinf nomini kiriting (masalan: 9-F)!");
        return;
      }
      const newId = `class-${newClassName.toLowerCase().replace(/[^a-z0-9]/g, '')}-${Date.now().toString().slice(-4)}`;
      targetClass = {
        id: newId,
        name: newClassName.trim().toUpperCase(),
        teacherName: teacherName.trim() || 'Ustoz',
        teacherPhone: teacherPhone.trim() || '+998 90 000 00 00',
        paidAmount: 0,
        pricePerStudent: 5000,
        isExternalSchool: isExternalSchool || false,
        schoolName: isExternalSchool ? (schoolName.trim() || 'Boshqa maktab') : undefined,
      };
    } else {
      const existing = classes.find(c => c.id === selectedClassId);
      if (!existing) {
        alert("Iltimos, mavjud sinfni tanlang!");
        return;
      }
      targetClass = existing;
    }

    const now = new Date().toISOString();
    const createdStudents: Student[] = validRows.map((item, idx) => ({
      id: `st-${Date.now()}-${idx}`,
      fullName: item.fullName.trim(),
      birthDate: item.birthDate.trim(),
      passportOrId: item.passportOrId.trim(),
      classId: targetClass.id,
      status: 'pending',
      createdAt: now,
    }));

    // Auto distribute emails
    const { updatedStudents, updatedEmailPool } = distributeEmailsToStudents(
      [...students, ...createdStudents],
      emailPool,
      []
    );

    const finalNewStudents = updatedStudents.filter(s =>
      createdStudents.some(cs => cs.id === s.id)
    );

    onSaveClassAndStudents(targetClass, finalNewStudents, updatedEmailPool);
    confetti({ particleCount: 90, spread: 80 });
    onClose();
  };

  const completedCount = extractedRows.filter(r => r.status === 'done').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/65 backdrop-blur-xs animate-fade-in overflow-y-auto">
      <div className="relative w-full max-w-5xl bg-white border border-slate-300 rounded-3xl shadow-2xl overflow-hidden my-4 flex flex-col max-h-[92vh]">
        
        {/* HEADER */}
        <div className="px-5 sm:px-7 py-4 border-b border-slate-200 bg-gradient-to-r from-purple-50/90 via-indigo-50/70 to-blue-50/80 flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-white flex items-center justify-center shadow-md flex-shrink-0">
              <Camera className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                  Metrika & Guvohnomalarni AI orqali Skanerlash
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-100 text-purple-800 border border-purple-200 uppercase tracking-wider">
                  Gemini Flash Vision
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-0.5">
                Qo'lda yozilgan va ruscha metrikalardan avtomatik o'quvchilar ro'yxatini tuzish. Token & Limit himoyasi yoqilgan.
              </p>
            </div>
          </div>

          <button
            onClick={() => !isScanning && onClose()}
            disabled={isScanning}
            className="w-9 h-9 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 flex items-center justify-center transition-colors cursor-pointer disabled:opacity-40"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* SCROLLABLE BODY */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">

          {/* 1. CLASS SELECTION TABS */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setUploadMode('new')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                  uploadMode === 'new'
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'bg-white text-slate-700 hover:bg-slate-200 border border-slate-200'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>0 dan Yangi sinf ochish</span>
              </button>

              <button
                type="button"
                onClick={() => setUploadMode('existing')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                  uploadMode === 'existing'
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'bg-white text-slate-700 hover:bg-slate-200 border border-slate-200'
                }`}
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Mavjud sinfga qo'shish</span>
                {classes.length > 0 && (
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${uploadMode === 'existing' ? 'bg-purple-500 text-white' : 'bg-slate-100 text-slate-600'}`}>
                    {classes.length}
                  </span>
                )}
              </button>
            </div>

            {uploadMode === 'new' ? (
              <div className="space-y-3 pt-1">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Sinf Nomi <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="Masalan: 9-F yoki 10-A"
                      value={newClassName}
                      onChange={e => setNewClassName(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Sinf Rahbari (F.I.SH)
                    </label>
                    <input
                      type="text"
                      placeholder="Masalan: Karimov Jasur"
                      value={teacherName}
                      onChange={e => setTeacherName(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Ustoz Telefoni
                    </label>
                    <input
                      type="text"
                      placeholder="+998 90 123 45 67"
                      value={teacherPhone}
                      onChange={e => setTeacherPhone(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                </div>

                {/* Boshqa maktab belgilash bloki */}
                <div className="pt-2 border-t border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const next = !isExternalSchool;
                        setIsExternalSchool(next);
                        if (next && !schoolName) {
                          setSchoolName('27-maktab');
                        }
                      }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                        isExternalSchool
                          ? 'bg-rose-600 text-white shadow-xs ring-2 ring-rose-400'
                          : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-300'
                      }`}
                    >
                      <span>{isExternalSchool ? '✓ Boshqa maktab tanlandi' : '🏷️ Boshqa maktab'}</span>
                    </button>
                    <span className="text-[11px] text-slate-500">
                      {isExternalSchool ? "Boshqa maktab (Admin panelda 'bm' chiqadi)" : "Boshqa maktab sinfi bo'lsa yoqing"}
                    </span>
                  </div>

                  {isExternalSchool && (
                    <div className="flex items-center gap-2 flex-1 sm:max-w-xs animate-fade-in">
                      <label className="text-xs font-bold text-rose-700 whitespace-nowrap">Qaysi maktab:</label>
                      <input
                        type="text"
                        placeholder="Masalan: 27-maktab"
                        value={schoolName}
                        onChange={e => setSchoolName(e.target.value)}
                        className="w-full px-3 py-1 bg-white border border-rose-300 rounded-xl text-xs font-bold text-rose-900 focus:outline-none focus:ring-2 focus:ring-rose-500"
                      />
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Qaysi sinfga qo'shilsin? <span className="text-rose-500">*</span>
                </label>
                <select
                  value={selectedClassId}
                  onChange={e => setSelectedClassId(e.target.value)}
                  className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500 shadow-2xs"
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
            )}
          </div>

          {/* 2. TOKEN & RATE LIMIT SAFETY SHIELD CARD */}
          <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-blue-50 border border-emerald-200/90 rounded-2xl p-4 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center flex-shrink-0 shadow-xs">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black text-emerald-950 uppercase tracking-wide">
                    Token & Limit Himoyasi Faol
                  </span>
                  <span className="px-2 py-0.2 rounded-full text-[10px] font-bold bg-emerald-200/80 text-emerald-900">
                    Avtomatik Siqish
                  </span>
                </div>
                <p className="text-[11px] text-emerald-800 leading-relaxed">
                  Barcha rasmlar brauzerda 1200px sifatli formatga siqiladi. 10MB fotosuratlar ~140KB ga aylanadi va Gemini Vision da minimal ~258 token sarflaydi. 15 RPM chegarasidan aslo oshmaydi!
                </p>
              </div>
            </div>

            {certificates.length > 0 && (
              <div className="flex items-center gap-3 flex-shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-emerald-200/60">
                <div className="text-right">
                  <div className="text-[10px] text-emerald-700 font-semibold uppercase">Tejalgan hajm</div>
                  <div className="text-xs font-black text-emerald-950">
                    {overallSavedPercent}% <span className="text-[10px] text-slate-500 font-normal">({(totalCompressedBytes / 1024 / 1024).toFixed(1)} MB)</span>
                  </div>
                </div>
                <div className="h-7 w-[1px] bg-emerald-300" />
                <div className="text-right">
                  <div className="text-[10px] text-emerald-700 font-semibold uppercase">Token sarfi</div>
                  <div className="text-xs font-black text-emerald-950 font-mono">
                    ~{totalEstimatedTokens} <span className="text-[10px] text-slate-500 font-normal">token</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 3. UPLOAD & CAMERA DRAG ZONE */}
          <div
            onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-3xl p-6 sm:p-8 text-center transition-all relative ${
              isDragging
                ? 'border-purple-500 bg-purple-50/80 scale-[1.01]'
                : 'border-slate-300 hover:border-purple-400 bg-slate-50/40'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={e => e.target.files && handleFilesSelected(e.target.files)}
              className="hidden"
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={e => e.target.files && handleFilesSelected(e.target.files)}
              className="hidden"
            />

            {isCompressing ? (
              <div className="flex flex-col items-center justify-center space-y-2 py-4">
                <Loader2 className="w-9 h-9 text-purple-600 animate-spin" />
                <div className="text-xs font-bold text-slate-800">
                  Rasmlar siqilmoqda va token sarfi tejalmoqda ({compressProgress.current}/{compressProgress.total})...
                </div>
                <div className="text-[11px] text-slate-500">
                  Katta fotosuratlarning hajmi 90% ga qisqartirilmoqda
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center space-y-3">
                <div className="w-14 h-14 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center shadow-xs">
                  <ImageIcon className="w-7 h-7" />
                </div>

                <div className="space-y-1">
                  <p className="text-sm font-bold text-slate-900">
                    Metrika yoki guvohnomalar suratlarini bu yerga tashlang
                  </p>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    Bir vaqtning o'zida butun sinfning (30-40 ta) rasmlarini birdaniga tanlashingiz yoki kameradan suratga olishingiz mumkin
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-2 cursor-pointer transition-colors"
                  >
                    <Upload className="w-4 h-4" />
                    <span>📁 Rasmlarni tanlash (Galereya / Papka)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    className="px-4 py-2.5 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 rounded-xl text-xs font-bold shadow-xs flex items-center gap-2 cursor-pointer transition-colors"
                  >
                    <Camera className="w-4 h-4 text-purple-600" />
                    <span>📷 Kameradan suratga olish</span>
                  </button>

                  {certificates.length > 0 && !isScanning && (
                    <button
                      type="button"
                      onClick={handleClearAll}
                      className="px-3 py-2.5 text-rose-600 hover:bg-rose-50 rounded-xl text-xs font-semibold cursor-pointer transition-colors"
                    >
                      Barchasini tozalash
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 4. SCANNING STATUS & CONTROLS */}
          {certificates.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs space-y-3.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-slate-900">
                      Yuklangan metrikalar: {certificates.length} ta rasm
                    </span>
                    {completedCount > 0 && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                        {completedCount} ta o'quvchi tayyor
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Gemini Flash Vision qo'lyozma ruscha va o'zbekcha yozuvlarni avtomatik lotin imlosida ajratib oladi.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {!isScanning ? (
                    <button
                      type="button"
                      onClick={startAiScanning}
                      disabled={certificates.length === 0}
                      className="px-4 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl text-xs font-bold shadow-md flex items-center gap-2 cursor-pointer transition-all"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>
                        {completedCount === 0 ? "AI orqali o'qishni boshlash" : "Qolganlarini o'qish"}
                      </span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleStopScanning}
                      className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-2 cursor-pointer transition-colors"
                    >
                      <X className="w-4 h-4" />
                      <span>To'xtatish</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Progress bar */}
              {isScanning && (
                <div className="space-y-2 pt-1 animate-fade-in">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-3.5 h-3.5 text-purple-600 animate-spin" />
                      <span className="font-semibold text-slate-800">
                        {rateLimitCountdown !== null ? (
                          <span className="text-amber-600">
                            Limit xavfsizligi: {rateLimitCountdown} soniyadan keyin davom etadi...
                          </span>
                        ) : (
                          <span>Tahlil qilinmoqda: <span className="font-mono text-purple-700">{currentScanningName}</span></span>
                        )}
                      </span>
                    </div>
                    <span className="font-mono text-xs font-bold text-purple-700">
                      {scanProgress.current} / {scanProgress.total} ({Math.round((scanProgress.current / scanProgress.total) * 100)}%)
                    </span>
                  </div>

                  <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                    <div
                      className="h-full bg-gradient-to-r from-purple-600 via-indigo-600 to-emerald-500 rounded-full transition-all duration-300"
                      style={{ width: `${(scanProgress.current / scanProgress.total) * 100}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 5. EXTRACTED DATA VERIFICATION TABLE */}
          {extractedRows.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <span>Aniqlangan O'quvchilar Jadvali</span>
                  <span className="text-[11px] text-slate-500 font-normal">
                    (Har bir maydonni tekshirishingiz yoki tahrirlashingiz mumkin)
                  </span>
                </h3>
                <span className="text-[11px] text-slate-500 font-medium">
                  Jami: {extractedRows.length} ta metrika
                </span>
              </div>

              <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-2xs">
                <div className="overflow-x-auto max-h-[360px]">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold sticky top-0 z-10">
                      <tr>
                        <th className="py-2.5 px-3 w-12 text-center">#</th>
                        <th className="py-2.5 px-3 w-16">Metrika</th>
                        <th className="py-2.5 px-3 min-w-[200px]">F.I.SH (Familiya Ism Sharifi)</th>
                        <th className="py-2.5 px-3 min-w-[130px]">Tug'ilgan sana</th>
                        <th className="py-2.5 px-3 min-w-[130px]">Metrika / Pasport raqami</th>
                        <th className="py-2.5 px-3 w-28 text-center">Holat</th>
                        <th className="py-2.5 px-3 w-16 text-center">Amal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {extractedRows.map((row, idx) => (
                        <tr 
                          key={row.id} 
                          className={`hover:bg-purple-50/30 transition-colors ${
                            row.status === 'processing' ? 'bg-purple-50/60' : ''
                          }`}
                        >
                          <td className="py-2 px-3 text-center font-mono text-[11px] text-slate-400">
                            {idx + 1}
                          </td>

                          {/* Image preview thumbnail */}
                          <td className="py-2 px-3">
                            <button
                              type="button"
                              onClick={() => setZoomedImage({ url: row.previewUrl, name: row.originalFileName })}
                              className="w-10 h-10 rounded-lg overflow-hidden border border-slate-200 hover:border-purple-500 relative group cursor-pointer flex-shrink-0 shadow-2xs"
                              title="Kattalashtirib solishtirish"
                            >
                              <img
                                src={row.previewUrl}
                                alt="Metrika"
                                className="w-full h-full object-cover group-hover:scale-110 transition-transform"
                              />
                              <div className="absolute inset-0 bg-slate-900/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                <Eye className="w-3.5 h-3.5 text-white" />
                              </div>
                            </button>
                          </td>

                          {/* Full Name editable */}
                          <td className="py-2 px-3">
                            <input
                              type="text"
                              value={row.fullName}
                              onChange={e => {
                                const val = e.target.value;
                                setExtractedRows(prev => prev.map(r => r.id === row.id ? { ...r, fullName: val } : r));
                              }}
                              placeholder={row.status === 'processing' ? "O'qilmoqda..." : "Masalan: Aliyev Vali Karimovich"}
                              className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-purple-500 ${
                                row.fullName.trim() 
                                  ? 'border-slate-300 bg-white text-slate-900' 
                                  : 'border-dashed border-amber-300 bg-amber-50/50 text-slate-500'
                              }`}
                            />
                            {row.notes && (
                              <div className="text-[10px] text-purple-700 italic mt-0.5">
                                {row.notes}
                              </div>
                            )}
                          </td>

                          {/* Birth Date editable */}
                          <td className="py-2 px-3">
                            <input
                              type="text"
                              value={row.birthDate}
                              onChange={e => {
                                const val = e.target.value;
                                setExtractedRows(prev => prev.map(r => r.id === row.id ? { ...r, birthDate: val } : r));
                              }}
                              placeholder="2011.05.24"
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-mono focus:outline-none focus:ring-1 focus:ring-purple-500 text-slate-900"
                            />
                          </td>

                          {/* Passport/Metrika ID editable */}
                          <td className="py-2 px-3">
                            <input
                              type="text"
                              value={row.passportOrId}
                              onChange={e => {
                                const val = e.target.value;
                                setExtractedRows(prev => prev.map(r => r.id === row.id ? { ...r, passportOrId: val } : r));
                              }}
                              placeholder="I-TN 0539510"
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-mono uppercase focus:outline-none focus:ring-1 focus:ring-purple-500 text-slate-900 font-semibold"
                            />
                          </td>

                          {/* Status Badge */}
                          <td className="py-2 px-3 text-center">
                            {row.status === 'done' && (
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold inline-flex items-center gap-1 ${
                                row.confidence === 'high'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}>
                                <CheckCircle2 className="w-3 h-3" />
                                <span>{row.confidence === 'high' ? "O'qildi" : "Tekshiring"}</span>
                              </span>
                            )}
                            {row.status === 'processing' && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 inline-flex items-center gap-1">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                <span>Tahlil...</span>
                              </span>
                            )}
                            {row.status === 'pending' && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600">
                                Kutilmoqda
                              </span>
                            )}
                            {row.status === 'error' && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 inline-flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" />
                                <span>Xatolik</span>
                              </span>
                            )}
                          </td>

                          {/* Actions */}
                          <td className="py-2 px-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleRetrySingle(row.id)}
                                disabled={isScanning}
                                className="p-1 rounded-md text-slate-400 hover:text-purple-600 hover:bg-purple-50 transition-colors cursor-pointer"
                                title="Qaytadan o'qish"
                              >
                                <RefreshCw className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRemoveCertificate(row.certificateId)}
                                disabled={isScanning}
                                className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                title="O'chirish"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* MODAL FOOTER */}
        <div className="px-5 sm:px-7 py-3.5 border-t border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-xs text-slate-500">
            {extractedRows.length > 0 ? (
              <span>
                Kiritiladigan o'quvchilar: <strong className="text-slate-800">{extractedRows.filter(r => r.fullName.trim()).length}</strong> nafar
              </span>
            ) : (
              <span>Metrikalarni yuklang va AI orqali o'qishni boshlang</span>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isScanning}
              className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl text-xs font-semibold cursor-pointer transition-colors"
            >
              Bekor qilish
            </button>

            <button
              type="button"
              onClick={handleSaveToClass}
              disabled={isScanning || extractedRows.filter(r => r.fullName.trim()).length === 0}
              className="px-5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-xs font-bold shadow-md flex items-center gap-2 cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Sinfni saqlash va o'quvchilarni bazaga kiritish</span>
            </button>
          </div>
        </div>

      </div>

      {/* ZOOM LIGHTBOX MODAL */}
      {zoomedImage && (
        <div 
          className="fixed inset-0 z-60 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setZoomedImage(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden shadow-2xl p-2 flex flex-col items-center">
            <div className="w-full flex items-center justify-between px-3 py-2 text-white border-b border-slate-800 text-xs font-semibold">
              <span>Hujjat surati: {zoomedImage.name}</span>
              <button
                type="button"
                onClick={() => setZoomedImage(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-2 overflow-auto flex items-center justify-center max-h-[80vh]">
              <img
                src={zoomedImage.url}
                alt="Metrika katta ko'rinishi"
                className="max-h-[75vh] w-auto object-contain rounded-lg shadow-lg"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
