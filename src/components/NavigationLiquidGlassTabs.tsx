import React, { useRef, useCallback, useEffect, useState } from 'react';
import {
  Layers,
  GraduationCap,
  DollarSign,
  Mail,
  Smartphone,
  Send
} from 'lucide-react';
import { GraphicsTier } from '../types';
import { useUnifiedGlass } from '../context/UnifiedGlassContext';
import { subscribeToSessions } from '../lib/firestoreService';

export type AdminTabType = 'classes' | 'teachers' | 'finance' | 'emails' | 'sessions' | 'telegram';

interface NavigationLiquidGlassTabsProps {
  activeTab: AdminTabType;
  onSelectTab: (tab: AdminTabType) => void;
  teacherCertificatesCount: number;
  telegramUsersCount: number;
  graphicsTier?: GraphicsTier;
}

const SessionsNavBadges: React.FC = React.memo(() => {
  const [summary, setSummary] = useState<{ count: number; hasBlocked: boolean }>({
    count: 0,
    hasBlocked: false,
  });

  useEffect(() => {
    const unsub = subscribeToSessions((list) => {
      const nextCount = list.length;
      const nextBlocked = list.some((s) => s.isBlocked);
      setSummary((prev) =>
        prev.count === nextCount && prev.hasBlocked === nextBlocked
          ? prev
          : { count: nextCount, hasBlocked: nextBlocked }
      );
    });
    return () => unsub();
  }, []);

  return (
    <>
      {summary.count > 0 && (
        <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-200 text-slate-700 font-mono">
          {summary.count}
        </span>
      )}
      {summary.hasBlocked && (
        <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" title="Bloklangan qurilma mavjud" />
      )}
    </>
  );
});

export const NavigationLiquidGlassTabs: React.FC<NavigationLiquidGlassTabsProps> = ({
  activeTab,
  onSelectTab,
  teacherCertificatesCount,
  telegramUsersCount,
  graphicsTier = 'medium',
}) => {
  const isUltra = graphicsTier === 'ultra';
  const { registerTargetElement, triggerJumpTo } = useUnifiedGlass();
  const containerRef = useRef<HTMLDivElement>(null);
  const spotRef = useRef<HTMLElement>(null);
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    if (!isUltra) return;
    Object.entries(buttonRefs.current).forEach(([tabId, el]) => {
      registerTargetElement(`nav-${tabId}`, el, 14);
    });
  }, [isUltra, registerTargetElement]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isUltra || !spotRef.current || !containerRef.current) return;
    const cr = containerRef.current.getBoundingClientRect();
    spotRef.current.style.opacity = '1';
    spotRef.current.style.transform = `translate(${e.clientX - cr.left}px, ${e.clientY - cr.top}px)`;
  }, [isUltra]);

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
      badge: <SessionsNavBadges />,
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
    <div
      ref={containerRef}
      onPointerMove={isUltra ? handlePointerMove : undefined}
      onPointerLeave={isUltra ? handlePointerLeave : undefined}
      className="liquid-nav-container flex items-center gap-1 overflow-x-auto no-scrollbar"
    >
      {isUltra && <i ref={spotRef} className="liquid-nav-spot" />}

      {tabs.map(tab => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              buttonRefs.current[tab.id] = el;
            }}
            type="button"
            onClick={() => {
              if (isUltra) triggerJumpTo(`nav-${tab.id}`);
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
  );
};
