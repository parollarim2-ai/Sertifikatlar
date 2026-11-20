import React from 'react';
import { GraphicsTier } from '../types';
import { X, Zap, Gauge, Sparkles, Check, AlertTriangle } from 'lucide-react';

interface GraphicsSettingsModalProps {
  isOpen: boolean;
  currentTier: GraphicsTier;
  onSelectTier: (tier: GraphicsTier) => void;
  onClose: () => void;
}

const TIERS: {
  id: GraphicsTier;
  title: string;
  badge: string;
  description: string;
  details: string[];
  accentClass: string;
  activeBg: string;
  icon: React.ReactNode;
}[] = [
  {
    id: 'lite',
    title: 'Yengil (Maksimal Tezlik)',
    badge: 'Kam RAM / Kuchsiz noutbuk',
    description: "Barcha xiralashtirish (blur), soya, gradient va animatsiyalar to'liq o'chiriladi — xotirani minimal ushlaydi.",
    details: [
      '0% GPU blur va 0% animatsiya yuki',
      'Qidiruv va jadval darhol kechikishsiz ishlaydi',
      'Kuchsiz telefonlar va band noutbuklar uchun ideal',
    ],
    accentClass: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    activeBg: 'border-emerald-500 bg-emerald-50/40 ring-2 ring-emerald-500/20',
    icon: <Zap className="w-5 h-5 text-emerald-600" />,
  },
  {
    id: 'medium',
    title: "O'rtacha (Tavsiya Etiladi)",
    badge: 'Standart',
    description: "Toza va chiroyli Apple uslubidagi interfeys: GPU blur va doimiy fon effektlarisiz tez ishlaydi.",
    details: [
      'Barcha qurilmalarda qotishsiz va kam RAM sarfi',
      'GPU xiralashtirishsiz tiniq kartochka va tugmalar',
      'Kundalik tezkor ish uchun eng maqbul muvozanat',
    ],
    accentClass: 'text-blue-700 bg-blue-50 border-blue-200',
    activeBg: 'border-blue-600 bg-blue-50/40 ring-2 ring-blue-600/20',
    icon: <Gauge className="w-5 h-5 text-blue-600" />,
  },
  {
    id: 'ultra',
    title: 'Ultra Kosmik Grafika',
    badge: 'Maksimal Vizual Kuch',
    description: "To'liq alohida grafik dvigatel: 180 ta fizik zarracha, suyuq linza (SVG refraction), ko'p qatlamli shisha va 3D effektlar.",
    details: [
      'Real vaqtli fizik zarrachalar va kursor gravitatsiyasi',
      'Chuqur ko‘p qatlamli blur, nur sinishi va 3D egilish',
      'Faqat kuchli kompyuter va flagman telefonlar uchun',
    ],
    accentClass: 'text-purple-700 bg-purple-50 border-purple-200',
    activeBg: 'border-purple-600 bg-purple-50/50 ring-2 ring-purple-600/25',
    icon: <Sparkles className="w-5 h-5 text-purple-600" />,
  },
];

export const GraphicsSettingsModal: React.FC<GraphicsSettingsModalProps> = ({
  isOpen,
  currentTier,
  onSelectTier,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in overflow-y-auto">
      <div className="relative w-full max-w-xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden my-6">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Grafika va Tezlik Rejimi
            </h3>
            <p className="text-xs text-slate-500">
              Har bir rejim alohida dvigatelda ishlaydi — qurilmangizga mosini tanlang
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-800 rounded-lg hover:bg-slate-200 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          {TIERS.map(tier => {
            const isSelected = currentTier === tier.id;
            return (
              <button
                key={tier.id}
                type="button"
                onClick={() => onSelectTier(tier.id)}
                className={`w-full text-left p-4 rounded-2xl border transition-all cursor-pointer ${
                  isSelected
                    ? tier.activeBg
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-xl border flex items-center justify-center flex-shrink-0 ${tier.accentClass}`}>
                      {tier.icon}
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-slate-900">{tier.title}</span>
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${tier.accentClass}`}>
                          {tier.badge}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        {tier.description}
                      </p>
                      <ul className="pt-1 space-y-0.5">
                        {tier.details.map(d => (
                          <li key={d} className="text-[11px] text-slate-500 flex items-center gap-1.5">
                            <span className="w-1 h-1 rounded-full bg-slate-400 flex-shrink-0" />
                            <span>{d}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 border ${
                    isSelected
                      ? 'bg-slate-900 border-slate-900 text-white'
                      : 'border-slate-300 bg-white'
                  }`}>
                    {isSelected && <Check className="w-3.5 h-3.5" />}
                  </div>
                </div>
              </button>
            );
          })}

          {currentTier === 'ultra' && (
            <div className="p-3 rounded-xl bg-purple-50 border border-purple-200 text-xs text-purple-900 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-purple-600 flex-shrink-0 mt-0.5" />
              <span>
                <strong>Ultra rejim faol:</strong> Maksimal fizik algoritmlar va ko‘p qatlamli optik shisha yoqilgan. Noutbuk qizisa yoki sekinlashsa «O‘rtacha» yoki «Yengil» rejimga o‘ting.
              </span>
            </div>
          )}
        </div>

        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <span className="text-[11px] text-slate-500">
            Tanlov faqat shu qurilma uchun saqlanadi
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer transition-colors"
          >
            Tayyor
          </button>
        </div>
      </div>
    </div>
  );
};
