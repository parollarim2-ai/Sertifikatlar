import React, { useState } from 'react';
import { EmailAccount, Student } from '../types';
import { parseRawEmails, distributeEmailsToStudents } from '../utils/emailManager';
import { X, Mail, Check, AlertCircle, Database, RefreshCw } from 'lucide-react';

interface BulkEmailModalProps {
  students: Student[];
  emailPool: EmailAccount[];
  isOpen: boolean;
  onClose: () => void;
  onApplyDistribution: (updatedStudents: Student[], updatedEmailPool: EmailAccount[]) => void;
}

export const BulkEmailModal: React.FC<BulkEmailModalProps> = ({
  students,
  emailPool,
  isOpen,
  onClose,
  onApplyDistribution,
}) => {
  const [rawText, setRawText] = useState('');
  const [defaultPassword, setDefaultPassword] = useState('MaktabPass2026!');
  const [resultMessage, setResultMessage] = useState('');
  const [errorNotice, setErrorNotice] = useState('');

  if (!isOpen) return null;

  const unusedEmailsInPool = emailPool.filter(e => !e.isUsed).length;
  const studentsWithoutEmail = students.filter(s => !s.assignedEmail).length;

  const existingEmailSet = new Set<string>([
    ...emailPool.map(e => e.email.toLowerCase()),
    ...students.filter(s => s.assignedEmail).map(s => s.assignedEmail!.toLowerCase()),
  ]);

  const handleProcessEmails = () => {
    setErrorNotice('');
    if (!rawText.trim()) {
      setErrorNotice("Iltimos, avval email manzillarini kiriting yoki nusxalab qo'ying!");
      return;
    }

    const { parsedAccounts } = parseRawEmails(rawText, existingEmailSet);

    if (parsedAccounts.length === 0) {
      setErrorNotice("Kiritilgan matnda yangi yoki takrorlanmagan email topilmadi.");
      return;
    }

    // Set default password if account doesn't have one
    const accountsWithPassword = parsedAccounts.map(a => ({
      ...a,
      password: a.password || defaultPassword,
    }));

    const {
      updatedStudents,
      updatedEmailPool,
      distributedCount,
      remainingPoolCount,
    } = distributeEmailsToStudents(students, emailPool, accountsWithPassword);

    onApplyDistribution(updatedStudents, updatedEmailPool);

    setResultMessage(
      `Muvaffaqiyatli! ${distributedCount} nafar o'quvchiga darhol email biriktirildi. Zaxirada ${remainingPoolCount} ta bo'sh email saqlandi.`
    );

    setTimeout(() => {
      onClose();
    }, 2000);
  };

  const handleRedistributeExistingPool = () => {
    if (unusedEmailsInPool === 0) {
      setErrorNotice("Zaxirada bo'sh email mavjud emas.");
      return;
    }
    const {
      updatedStudents,
      updatedEmailPool,
      distributedCount,
      remainingPoolCount,
    } = distributeEmailsToStudents(students, emailPool, []);

    onApplyDistribution(updatedStudents, updatedEmailPool);
    setResultMessage(
      `Zaxiradagi pochtalardan ${distributedCount} nafar o'quvchiga avtomatik biriktirildi. Qolgan zaxira: ${remainingPoolCount} ta.`
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-white border border-slate-300 rounded-2xl shadow-2xl overflow-hidden my-8">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 flex items-center justify-center flex-shrink-0">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Ommaviy Email Qo'shish & Taqsimlash</h3>
              <p className="text-xs text-slate-500">500+ yoki istalgan miqdordagi pochtalarni avtomatik o'quvchilarga biriktirish</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-800 rounded-lg hover:bg-slate-200 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {/* Status banner */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-xs text-slate-500 block mb-1">Emaili bo'lmagan o'quvchilar:</span>
              <span className={`text-xl font-bold ${studentsWithoutEmail > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                {studentsWithoutEmail} nafar
              </span>
              <span className="text-[11px] text-slate-400 block mt-0.5">
                {studentsWithoutEmail > 0 ? "Email kutmoqda" : "Barcha o'quvchilarga email ulangan"}
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-xs text-slate-500 block mb-1">Zaxiradagi bo'sh emaillar:</span>
              <span className="text-xl font-bold text-blue-700">
                {unusedEmailsInPool} ta
              </span>
              <span className="text-[11px] text-slate-400 block mt-0.5">
                Yangi o'quvchilar qo'shilganda tayyor turadi
              </span>
            </div>
          </div>

          {errorNotice && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{errorNotice}</span>
            </div>
          )}

          {resultMessage && (
            <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs sm:text-sm flex items-center gap-2.5 animate-fade-in">
              <Check className="w-4 h-4 text-emerald-700 flex-shrink-0" />
              <span>{resultMessage}</span>
            </div>
          )}

          {/* Quick redistribute existing button if needed */}
          {unusedEmailsInPool > 0 && studentsWithoutEmail > 0 && (
            <div className="p-3 rounded-xl bg-blue-50/50 border border-blue-200 flex items-center justify-between">
              <div className="text-xs text-blue-900">
                Zaxirada bo'sh emaillar bor! Ularni avtomatik navbatdagi o'quvchilarga ulash mumkin.
              </div>
              <button
                type="button"
                onClick={handleRedistributeExistingPool}
                className="px-3 py-1.5 text-xs font-semibold bg-blue-700 hover:bg-blue-800 text-white rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Zaxiradan ulash</span>
              </button>
            </div>
          )}

          {/* Input text area */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-700">
                Email manzillarini kiriting (har bir satrga bittadan yoki format: email:parol):
              </label>
              <button
                type="button"
                onClick={() => {
                  setRawText(`maktab.student303@gmail.com:B1M_Password2026!
maktab.student304@gmail.com:B1M_Password2026!
maktab.student305@gmail.com:B1M_Password2026!
maktab.student306@gmail.com:B1M_Password2026!
maktab.student307@gmail.com:B1M_Password2026!`);
                }}
                className="text-xs text-blue-700 hover:text-blue-800 font-medium underline cursor-pointer"
              >
                Namuna matn
              </button>
            </div>

            <textarea
              rows={7}
              value={rawText}
              onChange={e => setRawText(e.target.value)}
              placeholder="maktab.oquvchi1@gmail.com:Parol123!
maktab.oquvchi2@gmail.com:Parol123!
maktab.oquvchi3@gmail.com
... (istalgancha email nusxalashingiz mumkin)"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-mono text-xs focus:outline-none focus:bg-white focus:border-blue-700 leading-relaxed"
            />
          </div>

          {/* Default password fallback */}
          <div className="flex items-center justify-between gap-4 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs">
            <span className="text-slate-600">Parol ko'rsatilmagan bo'lsa, standart parol:</span>
            <input
              type="text"
              value={defaultPassword}
              onChange={e => setDefaultPassword(e.target.value)}
              className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-slate-900 font-mono text-xs focus:outline-none focus:border-blue-700"
            />
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-between pt-3 border-t border-slate-200">
            <div className="text-[11px] text-slate-400">
              * Takrorlanuvchi pochtalar avtomatik chiqarib tashlanadi.
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors"
              >
                Yopish
              </button>
              <button
                type="button"
                onClick={handleProcessEmails}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-blue-700 hover:bg-blue-800 text-white shadow-xs flex items-center gap-2 transition-colors cursor-pointer"
              >
                <Database className="w-4 h-4" />
                <span>Taqsimlash va Saqlash</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
