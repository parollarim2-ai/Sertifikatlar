import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { ClassGroup, GraphicsTier, Student } from '../types';
import {
  Zap,
  Bell,
  UserPlus,
  Edit2,
  Trash2,
  X,
  ChevronDown,
  Settings,
  KeyRound
} from 'lucide-react';
import { useUnifiedGlass } from '../context/UnifiedGlassContext';
import { getStudentTrackData } from '../utils/studentLoginHelper';

interface ClassLiquidGlassStripProps {
  classes: ClassGroup[];
  students: Student[];
  selectedClassId: string;
  graphicsTier?: GraphicsTier;
  onSelectClass: (classId: string) => void;
  onOpenBulkUploadModal: (classId?: string) => void;
  onOpenPaymentModal: (classGroup: ClassGroup) => void;
  onOpenTeacherMessageModal: (classGroup: ClassGroup) => void;
  onOpenClassBatch: (classGroup: ClassGroup) => void;
  onGenerateClassLogins?: (classGroup: ClassGroup) => void;
  onEditClass: (classGroup: ClassGroup) => void;
  onDeleteClass: (classGroup: ClassGroup) => void;
}

export const ClassLiquidGlassStrip: React.FC<ClassLiquidGlassStripProps> = ({
  classes,
  students,
  selectedClassId,
  graphicsTier = 'medium',
  onSelectClass,
  onOpenBulkUploadModal,
  onOpenPaymentModal,
  onOpenTeacherMessageModal,
  onOpenClassBatch,
  onGenerateClassLogins,
  onEditClass,
  onDeleteClass,
}) => {
  const isUltra = graphicsTier === 'ultra';
  const { registerTargetElement, triggerJumpTo } = useUnifiedGlass();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'debt' | 'low'>('all');
  const [activeTileIndex, setActiveTileIndex] = useState<number>(-1);
  const [showClassDetails, setShowClassDetails] = useState<boolean>(true);

  const stripRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const spotRef = useRef<HTMLDivElement>(null);
  const segRef = useRef<HTMLDivElement>(null);
  const segPillRef = useRef<HTMLElement>(null);
  const tileRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Pre-group students by classId once: O(N + C) instead of O(C * N)
  const studentsByClassId = useMemo(() => {
    const map = new Map<string, Student[]>();
    for (const s of students) {
      let arr = map.get(s.classId);
      if (!arr) {
        arr = [];
        map.set(s.classId, arr);
      }
      arr.push(s);
    }
    return map;
  }, [students]);

  const classData = useMemo(() => {
    return classes.map((c, i) => {
      const track: 'ai' | 'developer' = c.projectType === 'developer' ? 'developer' : 'ai';
      const cStudents = studentsByClassId.get(c.id) || [];
      const total = cStudents.length;
      let certified = 0;
      for (const s of cStudents) {
        if (getStudentTrackData(s, track).status === 'certified') certified++;
      }
      const percent = total > 0 ? Math.round((certified / total) * 100) : 0;
      const price = track === 'developer' ? 7000 : (c.pricePerStudent || 5000);
      const totalCost = certified * price;
      const paid = track === 'developer'
        ? (c.devPaidAmount ?? (c.id.startsWith('class-dev-') ? (c.paidAmount || 0) : 0))
        : (c.aiPaidAmount ?? (c.paidAmount || 0));
      const debt = Math.max(0, totalCost - paid);
      return {
        raw: c,
        index: i,
        id: c.id,
        name: c.name,
        teacher: c.teacherName,
        total,
        certified,
        percent,
        debt,
      };
    });
  }, [classes, studentsByClassId]);

  const totalStudentsCount = useMemo(() => classData.reduce((sum, c) => sum + c.total, 0), [classData]);
  const totalCertifiedCount = useMemo(() => classData.reduce((sum, c) => sum + c.certified, 0), [classData]);
  const debtClassesCount = useMemo(() => classData.filter(c => c.debt > 0).length, [classData]);
  const lowCompletionCount = useMemo(() => classData.filter(c => c.total > 0 && c.percent < 50).length, [classData]);

  const filteredClassIds = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const ids = new Set<string>();
    classData.forEach(c => {
      const matchesSearch = !q || c.name.toLowerCase().includes(q) || c.teacher.toLowerCase().includes(q);
      const matchesFilter =
        filterMode === 'all'
          ? true
          : filterMode === 'debt'
          ? c.debt > 0
          : c.total > 0 && c.percent < 50;
      if (matchesSearch && matchesFilter) {
        ids.add(c.id);
      }
    });
    return ids;
  }, [classData, searchQuery, filterMode]);

  // Register class tile DOM elements ONLY when Ultra glass physics is active
  useEffect(() => {
    if (!isUltra) return;
    classData.forEach((c, i) => {
      registerTargetElement(`class-${c.id}`, tileRefs.current[i] || null, 16);
    });
  }, [classData, isUltra, registerTargetElement]);

  const fmt = (n: number) => n.toLocaleString('ru-RU');
  const nb = (s: string) => s.replace('-', '\u2011');

  const triggerSonarPing = useCallback((x: number, y: number) => {
    if (!isUltra || !gridRef.current) return;
    const ping = document.createElement('i');
    ping.className = 'liquid-ping';
    ping.style.left = `${x}px`;
    ping.style.top = `${y}px`;
    gridRef.current.appendChild(ping);
    setTimeout(() => ping.remove(), 850);
  }, [isUltra]);

  const handleButtonRipple = useCallback((e: React.MouseEvent<HTMLElement>) => {
    if (!isUltra) return;
    const target = e.currentTarget;
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 2.2;
    const ripple = document.createElement('i');
    ripple.className = `liquid-rpl ${target.classList.contains('pr') ? 'w' : ''}`;
    ripple.style.width = `${size}px`;
    ripple.style.height = `${size}px`;
    ripple.style.left = `${e.clientX - rect.left - size / 2}px`;
    ripple.style.top = `${e.clientY - rect.top - size / 2}px`;
    target.appendChild(ripple);
    setTimeout(() => ripple.remove(), 680);
  }, [isUltra]);

  const handleSelectTile = useCallback((index: number, e?: React.MouseEvent<HTMLElement>) => {
    if (e) handleButtonRipple(e);
    const target = classData[index];
    if (!target) return;

    if (activeTileIndex === index && selectedClassId === target.id) {
      setShowClassDetails(prev => !prev);
    } else {
      setActiveTileIndex(index);
      setShowClassDetails(true);

      if (isUltra) {
        const tileEl = tileRefs.current[index];
        if (tileEl) {
          const cx = tileEl.offsetLeft + tileEl.offsetWidth / 2;
          const cy = tileEl.offsetTop + tileEl.offsetHeight / 2;
          triggerSonarPing(cx, cy);
        }
        triggerJumpTo(`class-${target.id}`);
      }
      onSelectClass(target.id);
    }
  }, [classData, activeTileIndex, selectedClassId, onSelectClass, triggerJumpTo, isUltra, handleButtonRipple, triggerSonarPing]);

  useEffect(() => {
    if (selectedClassId === 'all' || selectedClassId === 'all_with_teachers' || selectedClassId === 'only_teachers') {
      setActiveTileIndex(-1);
    } else {
      const idx = classData.findIndex(c => c.id === selectedClassId);
      if (idx >= 0) {
        setActiveTileIndex(idx);
        if (isUltra) {
          triggerJumpTo(`class-${classData[idx].id}`);
        }
      }
    }
  }, [selectedClassId, classData, isUltra, triggerJumpTo]);

  const handleResetToAll = () => {
    setActiveTileIndex(-1);
    setShowClassDetails(false);
    onSelectClass('all');
  };

  const updateSegmentPill = useCallback((btnEl: HTMLButtonElement | null) => {
    if (!btnEl || !segPillRef.current) return;
    segPillRef.current.style.left = `${btnEl.offsetLeft}px`;
    segPillRef.current.style.width = `${btnEl.offsetWidth}px`;
  }, []);

  useEffect(() => {
    if (!segRef.current || !segPillRef.current) return;
    const activeBtn = segRef.current.querySelector('button.on') as HTMLButtonElement | null;
    const firstBtn = segRef.current.querySelector('button') as HTMLButtonElement | null;
    const targetBtn = activeBtn || firstBtn;
    if (targetBtn) {
      segPillRef.current.style.left = `${targetBtn.offsetLeft}px`;
      segPillRef.current.style.width = `${targetBtn.offsetWidth}px`;
    }
  }, [filterMode, selectedClassId, debtClassesCount, lowCompletionCount]);

  const selectedClass = activeTileIndex >= 0 ? classData[activeTileIndex] : null;

  return (
    <section ref={stripRef} className="liquid-strip">
      {/* Top Slim Control Bar */}
      <div className="liquid-bar">
        <div className="liquid-l">
          <h2>Sinflar</h2>
          <span className="liquid-sm">
            <i className="liquid-lv" />
            <b>{totalStudentsCount}</b> o'quvchi · <b>{totalCertifiedCount}</b> tayyor · <b className="w">{debtClassesCount}</b> sinfda qarz
          </span>
        </div>

        <div className="liquid-r">
          <label className="liquid-g liquid-sr">
            <svg viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              type="text"
              className="liquid-q"
              placeholder="Qidirish"
              autoComplete="off"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </label>

          <div ref={segRef} className="liquid-g liquid-seg">
            <i
              ref={segPillRef as unknown as React.RefObject<HTMLElement>}
              className="liquid-sp"
            />
            <button
              type="button"
              onClick={e => {
                setFilterMode('all');
                updateSegmentPill(e.currentTarget);
                handleButtonRipple(e);
                handleResetToAll();
              }}
              className={filterMode === 'all' && selectedClassId === 'all' ? 'on' : ''}
            >
              Barchasi
            </button>
            <button
              type="button"
              onClick={e => {
                setFilterMode('debt');
                updateSegmentPill(e.currentTarget);
                handleButtonRipple(e);
              }}
              className={filterMode === 'debt' ? 'on' : ''}
            >
              Qarzdorlar {debtClassesCount}
            </button>
            <button
              type="button"
              onClick={e => {
                setFilterMode('low');
                updateSegmentPill(e.currentTarget);
                handleButtonRipple(e);
              }}
              className={filterMode === 'low' ? 'on' : ''}
            >
              Tayyori kam {lowCompletionCount}
            </button>
          </div>

          <button
            type="button"
            onClick={e => {
              handleButtonRipple(e);
              onOpenBulkUploadModal();
            }}
            className="liquid-g liquid-bt pr"
            title="Fayldan yangi sinf yuklash"
          >
            <i className="pl">+</i>Sinf
          </button>
        </div>
      </div>

      {/* Class Tiles Grid */}
      <div
        ref={gridRef}
        onPointerMove={isUltra ? (e => {
          if (spotRef.current && gridRef.current) {
            const gr = gridRef.current.getBoundingClientRect();
            spotRef.current.style.opacity = '1';
            spotRef.current.style.transform = `translate(${e.clientX - gr.left}px, ${e.clientY - gr.top}px)`;
          }
        }) : undefined}
        onPointerLeave={isUltra ? (() => {
          if (spotRef.current) {
            spotRef.current.style.opacity = '0';
          }
        }) : undefined}
        className="liquid-grid"
        style={{
          gridTemplateColumns: `repeat(${Math.max(3, Math.min(classes.length, 9))}, minmax(0, 1fr))`,
        }}
      >
        {isUltra && <i ref={spotRef} className="liquid-spot" />}

        {classData.map((c, i) => {
          const isDimmed = !filteredClassIds.has(c.id);
          const isSelected = selectedClassId === c.id;

          return (
            <button
              key={c.id}
              ref={el => {
                tileRefs.current[i] = el;
              }}
              type="button"
              onClick={(e) => handleSelectTile(i, e)}
              title={`${c.name} · ${c.teacher} · ${c.debt > 0 ? `qarz ${fmt(c.debt)} so'm` : "to'lov to'langan"}`}
              className={`liquid-g liquid-tile ${isDimmed ? 'dim' : ''} ${isSelected ? 'on' : ''}`}
            >
              <span className="liquid-r1">
                <span className="liquid-n">
                  {c.raw.isExternalSchool && (
                    <span className="text-[9px] font-black text-rose-600 mr-1 bg-rose-50 px-1 py-0.2 rounded border border-rose-300">bm</span>
                  )}
                  {nb(c.name)}
                </span>
                <i className={`liquid-dot ${c.debt > 0 ? 'db' : ''}`} />
              </span>

              <span className="liquid-t">{c.teacher.split(' ')[0]}</span>

              <span className="liquid-nm">
                <b style={{ fontWeight: 600 }}>{c.certified}/{c.total}</b>
                <em>{c.percent}%</em>
              </span>

              <span className="liquid-tb">
                <i style={{ width: `${c.percent}%` }} />
              </span>
            </button>
          );
        })}
      </div>

      {/* Selected Class Action Bar */}
      {selectedClass && (
        <>
          {showClassDetails ? (
            <div className="liquid-g liquid-details-ribbon">
              <div className="flex items-center gap-2.5 flex-wrap min-w-0">
                <div className="px-2.5 py-1 rounded-lg bg-blue-600 text-white font-extrabold text-xs tracking-tight shadow-xs flex-shrink-0">
                  {nb(selectedClass.name)}
                </div>
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-xs font-bold text-slate-900 truncate">
                    {selectedClass.teacher}
                  </span>
                  <span className="text-[10px] text-blue-700 font-semibold px-1 py-0.2 rounded bg-blue-50 border border-blue-200">
                    Rahbar
                  </span>
                </div>
                <span className="text-slate-300 hidden sm:inline">•</span>
                <div className="text-xs text-slate-600 font-medium hidden sm:flex items-center gap-1">
                  <span className="font-bold text-slate-900">{selectedClass.total}</span> o'quvchi
                  <span className="text-slate-400">/</span>
                  <span className="font-bold text-emerald-700">{selectedClass.certified} tayyor</span>
                  <span className="text-[11px] font-mono text-slate-500">({selectedClass.percent}%)</span>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenPaymentModal(selectedClass.raw)}
                  className={`px-2 py-0.5 rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer border ${
                    selectedClass.debt > 0
                      ? 'bg-amber-50 text-amber-900 border-amber-300'
                      : 'bg-emerald-50 text-emerald-900 border-emerald-300'
                  }`}
                  title="To'lov holatini ko'rish yoki kiritish"
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${selectedClass.debt > 0 ? 'bg-amber-600' : 'bg-emerald-600'}`} />
                  <span>{selectedClass.debt > 0 ? `${fmt(selectedClass.debt)} so'm qarz` : "To'langan ✅"}</span>
                </button>

                <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                  selectedClass.raw.projectType === 'developer'
                    ? 'bg-purple-100 text-purple-800 border-purple-300'
                    : 'bg-blue-100 text-blue-800 border-blue-300'
                }`}>
                  {selectedClass.raw.projectType === 'developer' ? '💡 5M AI Yetakchi (7k)' : "🚀 1M Promter (5k)"}
                </span>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap flex-shrink-0">
                {selectedClass.raw.projectType !== 'developer' && (
                  <button
                    type="button"
                    onClick={e => {
                      handleButtonRipple(e);
                      onOpenClassBatch(selectedClass.raw);
                    }}
                    className="px-2.5 py-1 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                    title="Butun sinfni Aileaders'dan ro'yxatdan o'tkazish"
                  >
                    <Zap className="w-3 h-3 text-yellow-300" />
                    <span>Aileaders</span>
                  </button>
                )}

                {onGenerateClassLogins && (
                  <button
                    type="button"
                    onClick={e => {
                      handleButtonRipple(e);
                      onGenerateClassLogins(selectedClass.raw);
                    }}
                    className="px-2.5 py-1 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                    title="Sinfdagi barcha o'quvchilarga familya_ism formatida bexato login berish"
                  >
                    <KeyRound className="w-3 h-3 text-emerald-200" />
                    <span>Login</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={e => {
                    handleButtonRipple(e);
                    onEditClass(selectedClass.raw);
                  }}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                  title="Sinf parametrlari, yo'nalishi va sertifikat sanalarini tekshirish"
                >
                  <Settings className="w-3 h-3 text-cyan-300" />
                  <span>Sozlamalar</span>
                </button>

                <button
                  type="button"
                  onClick={e => {
                    handleButtonRipple(e);
                    onOpenTeacherMessageModal(selectedClass.raw);
                  }}
                  className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                  title="Ustozga bildirishnoma yuborish"
                >
                  <Bell className="w-3 h-3" />
                  <span>Xabar</span>
                </button>

                <button
                  type="button"
                  onClick={e => {
                    handleButtonRipple(e);
                    onOpenBulkUploadModal(selectedClass.id);
                  }}
                  className="px-2.5 py-1 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                  title="Shu sinfga yangi o'quvchi qo'shish"
                >
                  <UserPlus className="w-3 h-3 text-blue-600" />
                  <span className="hidden sm:inline">+ O'quvchi</span>
                </button>

                <button
                  type="button"
                  onClick={() => onEditClass(selectedClass.raw)}
                  className="p-1 text-slate-400 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                  title="Sinfni tahrirlash"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={() => onDeleteClass(selectedClass.raw)}
                  className="p-1 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                  title="Sinfni o'chirish"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>

                <div className="w-[1px] h-4 bg-slate-200 mx-0.5" />

                <button
                  type="button"
                  onClick={() => setShowClassDetails(false)}
                  className="px-2 py-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer transition-colors"
                  title="Boshqaruv panelini yashirish (Sinf tanlangan holda qoladi)"
                >
                  <X className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-[11px]">Yopish</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between mt-2 mb-1 px-3 py-1 rounded-xl bg-blue-50/70 border border-blue-200 text-xs text-blue-900">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-600" />
                <span>Faol sinf: <strong>{nb(selectedClass.name)}</strong> ({selectedClass.teacher})</span>
                <span className="text-slate-400 hidden sm:inline">•</span>
                <span className="text-slate-500 hidden sm:inline">{selectedClass.total} o'quvchi ({selectedClass.certified} tayyor)</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowClassDetails(true)}
                  className="px-2 py-0.5 rounded-lg bg-white hover:bg-blue-100 text-blue-700 font-bold border border-blue-200 text-[11px] flex items-center gap-1 cursor-pointer transition-colors"
                  title="Sinf boshqaruv amallarini ko'rsatish"
                >
                  <span>Amallar paneli</span>
                  <ChevronDown className="w-3 h-3" />
                </button>
                <span className="text-slate-300">|</span>
                <button
                  type="button"
                  onClick={handleResetToAll}
                  className="text-[11px] text-slate-500 hover:text-slate-800 hover:underline cursor-pointer"
                  title="Barcha sinflar ro'yxatiga qaytish"
                >
                  Barcha sinflar
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
};
