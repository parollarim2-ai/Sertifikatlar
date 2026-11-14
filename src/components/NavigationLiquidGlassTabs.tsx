import React, { useRef, useCallback } from 'react';
import {
  Layers,
  GraduationCap,
  DollarSign,
  Mail,
  Smartphone,
  Send
} from 'lucide-react';

import { useUnifiedGlass } from '../context/UnifiedGlassContext';

export type AdminTabType = 'classes' | 'teachers' | 'finance' | 'emails' | 'sessions' | 'telegram';

interface NavigationLiquidGlassTabsProps {
  activeTab: AdminTabType;
  onSelectTab: (tab: AdminTabType) => void;
  teacherCertificatesCount: number;
  sessionsCount: number;
  hasBlockedSession: boolean;
  telegramUsersCount: number;
}

export const NavigationLiquidGlassTabs: React.FC<NavigationLiquidGlassTabsProps> = ({
  activeTab,
  onSelectTab,
  teacherCertificatesCount,
  sessionsCount,
  hasBlockedSession,
  telegramUsersCount,
}) => {
  const { registerTargetElement, triggerJumpTo } = useUnifiedGlass();
  const containerRef = useRef<HTMLDivElement>(null);
  const spotRef = useRef<HTMLElement>(null);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!spotRef.current || !containerRef.current) return;
    const cr = containerRef.current.getBoundingClientRect();
    spotRef.current.style.opacity = '1';
    spotRef.current.style.transform = `translate(${e.clientX - cr.left}px, ${e.clientY - cr.top}px)`;
  }, []);

  const handlePointerLeave = useCallback(() => {
    if (spotRef.current) {
      spotRef.current.style.opacity = '0';
    }
  }, []);

  const tabs: {
    id: AdminTabType;
    icon: React.ReactNode;
    labelShort: string;
    labelFull: string;
    badge?: React.ReactNode;
  }[] = [
    {
      id: 'classes',
      icon: <Layers className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-700 flex-shrink-0" />,
      labelShort: 'Sinflar',
      labelFull: "Sinflar & O'quvchilar",
    },
    {
      id: 'teachers',
      icon: <GraduationCap className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-purple-700 flex-shrink-0" />,
      labelShort: 'Ustozlar',
      labelFull: 'Ustozlar Sertifikatlari',
      badge: teacherCertificatesCount > 0 ? (
        <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-purple-100 text-purple-800 font-mono font-bold">
          {teacherCertificatesCount}
        </span>
      ) : null,
    },
    {
      id: 'finance',
      icon: <DollarSign className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-700 flex-shrink-0" />,
      labelShort: 'Moliya',
      labelFull: "Moliya & To'lovlar",
    },
    {
      id: 'emails',
      icon: <Mail className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-700 flex-shrink-0" />,
      labelShort: 'Emaillar',
      labelFull: 'Email Zaxirasi',
    },
    {
      id: 'sessions',
      icon: <Smartphone className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-purple-600 flex-shrink-0" />,
      labelShort: 'Seanslar',
      labelFull: 'Faol Seanslar',
      badge: (
        <>
          {sessionsCount > 0 && (
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-200 text-slate-700 font-mono">
              {sessionsCount}
            </span>
          )}
          {hasBlockedSession && (
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" title="Bloklangan qurilma mavjud"></span>
          )}
        </>
      ),
    },
    {
      id: 'telegram',
      icon: <Send className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#24A1DE] flex-shrink-0" />,
      labelShort: 'Telegram',
      labelFull: 'Telegram Bot',
      badge: telegramUsersCount > 0 ? (
        <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-500 text-white font-mono font-bold">
          {telegramUsersCount} ustoz
        </span>
      ) : null,
    },
  ];

  return (
    <>
      <style>{`
        .liquid-nav-container {
          position: relative;
          background: rgba(226, 232, 240, 0.72);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          padding: 4px;
          border-radius: 18px;
          border: 1px solid rgba(203, 213, 225, 0.9);
          box-shadow: inset 0 2px 4px rgba(15, 23, 42, 0.05);
          user-select: none;
        }
        .liquid-nav-spot {
          position: absolute;
          left: 0;
          top: 0;
          width: 180px;
          height: 180px;
          margin: -90px 0 0 -90px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(37, 99, 235, 0.16), transparent 65%);
          pointer-events: none;
          opacity: 0;
          transition: opacity 0.25s;
          z-index: 1;
        }
        .liquid-nav-btn {
          position: relative;
          z-index: 3;
          transition: color 0.2s, background-color 0.2s, transform 0.15s, box-shadow 0.2s;
        }
        .liquid-nav-btn:hover {
          color: #0f172a;
        }
        .liquid-nav-btn:active {
          transform: scale(0.96);
        }
      `}</style>

      <div
        ref={containerRef}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        className="liquid-nav-container flex items-center gap-1 overflow-x-auto no-scrollbar"
      >
        <i ref={spotRef} className="liquid-nav-spot"></i>

        {tabs.map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              ref={el => {
                registerTargetElement(`nav-${tab.id}`, el, 14);
              }}
              type="button"
              onClick={() => {
                triggerJumpTo(`nav-${tab.id}`);
                onSelectTab(tab.id);
              }}
              className={`liquid-nav-btn flex-shrink-0 sm:flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 sm:gap-2 cursor-pointer whitespace-nowrap ${
                isActive
                  ? 'bg-white text-slate-950 font-black shadow-xs border border-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
              }`}
            >
              {tab.icon}
              <span className="sm:hidden">{tab.labelShort}</span>
              <span className="hidden sm:inline">{tab.labelFull}</span>
              {tab.badge}
            </button>
          );
        })}
      </div>
    </>
  );
};
