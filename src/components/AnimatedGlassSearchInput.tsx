import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X } from 'lucide-react';

interface AnimatedGlassSearchInputProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
}

interface KeyPopState {
  id: number;
  char: string;
  isSpace: boolean;
  clientX: number; // approximate character X offset
}

export const AnimatedGlassSearchInput: React.FC<AnimatedGlassSearchInputProps> = ({
  value,
  onChange,
  placeholder = "O'quvchini ismi, pasporti yoki emaili orqali qidirish...",
  className = '',
}) => {
  const [activeKeyPop, setActiveKeyPop] = useState<KeyPopState | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const popTimerRef = useRef<NodeJS.Timeout | null>(null);
  const keyCounterRef = useRef(0);

  // Trigger Samsung keyboard style glass magnifying balloon
  const triggerKeyPopup = useCallback((char: string) => {
    if (!char) return;

    if (popTimerRef.current) {
      clearTimeout(popTimerRef.current);
    }

    const input = inputRef.current;
    let charOffsetLeft = 40; // fallback

    if (input) {
      // Calculate cursor pixel position inside input
      const selectionPos = input.selectionStart || input.value.length;
      // Estimate based on char count
      const approxCharWidth = 8.5;
      charOffsetLeft = Math.min(
        Math.max(38, 42 + selectionPos * approxCharWidth),
        input.offsetWidth - 36
      );
    }

    const nextId = ++keyCounterRef.current;
    setActiveKeyPop({
      id: nextId,
      char: char.toUpperCase(),
      isSpace: char === ' ',
      clientX: charOffsetLeft,
    });

    // Automatically remove balloon after key is released or brief display
    popTimerRef.current = setTimeout(() => {
      setActiveKeyPop(null);
    }, 450);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Only display printable keys or Space / Backspace
    if (e.key === 'Backspace') {
      triggerKeyPopup('⌫');
    } else if (e.key === ' ') {
      triggerKeyPopup('␣');
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      triggerKeyPopup(e.key);
    }
  };

  const handleKeyUp = () => {
    // When key is released, accelerate dismissing the popup for swift typing
    if (popTimerRef.current) {
      clearTimeout(popTimerRef.current);
    }
    popTimerRef.current = setTimeout(() => {
      setActiveKeyPop(null);
    }, 180);
  };

  useEffect(() => {
    return () => {
      if (popTimerRef.current) clearTimeout(popTimerRef.current);
    };
  }, []);

  return (
    <div ref={containerRef} className={`relative flex-1 ${className}`}>
      {/* Samsung Keyboard Glass Key Magnifier Balloon */}
      {activeKeyPop && (
        <div
          key={activeKeyPop.id}
          style={{
            left: `${activeKeyPop.clientX}px`,
          }}
          className="absolute -top-14 -translate-x-1/2 pointer-events-none z-30 transition-transform duration-75 ease-out select-none"
        >
          {/* Glass Bubble Container */}
          <div className="relative px-3.5 py-2 min-w-[38px] h-[46px] rounded-2xl flex flex-col items-center justify-center bg-white/85 backdrop-blur-md border border-white/90 shadow-[0_8px_24px_-4px_rgba(37,99,235,0.35),0_2px_6px_rgba(0,0,0,0.08),inset_0_1px_1px_#ffffff] text-blue-900 font-black animate-samsung-pop">
            <span className="text-xl sm:text-2xl font-mono leading-none tracking-tight">
              {activeKeyPop.char}
            </span>

            {/* Little pointer tail pointing to the input bar */}
            <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white/85 border-r border-b border-white/90 rotate-45 rounded-xs" />
          </div>
        </div>
      )}

      {/* Search Icon */}
      <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3 pointer-events-none" />

      {/* Real Input */}
      <input
        ref={inputRef}
        type="text"
        placeholder={placeholder}
        value={value}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        onChange={e => onChange(e.target.value)}
        className="w-full pl-10 pr-9 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-xs sm:text-sm font-medium focus:outline-none focus:bg-white focus:border-blue-700 transition-colors shadow-2xs"
      />

      {/* Clear Button */}
      {value && (
        <button
          type="button"
          onClick={() => {
            onChange('');
            inputRef.current?.focus();
          }}
          className="absolute right-2.5 top-2.5 p-0.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors"
          title="Tozalash"
        >
          <X className="w-4 h-4" />
        </button>
      )}

      <style>{`
        @keyframes samsung-pop {
          0% {
            opacity: 0;
            transform: translateY(12px) scale(0.65);
          }
          65% {
            opacity: 1;
            transform: translateY(-3px) scale(1.12);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        .animate-samsung-pop {
          animation: samsung-pop 0.18s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }
      `}</style>
    </div>
  );
};
