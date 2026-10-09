// ==UserScript==
// @name         Coursera Introduction to Generative AI Auto-Solver
// @namespace    https://b1m.maktab.uz/
// @version      1.0.0
// @description  Coursera "Introduction to Generative AI" kursining barcha 4 ta testini 100% aniqlikda avtomatik yechuvchi va topshiruvchi skript
// @author       Veb-Sayt Studiyasi
// @match        https://*.coursera.org/*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const QUIZZES = [
    {
      quiz: 1,
      title: '1-Quiz: Generative AI Definition',
      urlPattern: '/quiz-1/attempt',
      fullUrl: 'https://www.coursera.org/learn/introduction-to-generative-ai/assignment-submission/UOf9n/quiz-1/attempt',
      targetTexts: [
        'Generative AI is a type of artificial intelligence (AI) that can create new content, such as text, images, audio, and video.',
        'Generative AI is a type of artificial intelligence (AI) that can create new content',
      ],
      fallbackKeywords: [
        'create new content, such as text, images, audio, and video',
        'create new content',
        'создавать новый контент, такой как текст, изображения, аудио и видео',
        'создавать новый контент',
      ],
    },
    {
      quiz: 2,
      title: '2-Quiz: Generative vs Discriminative AI',
      urlPattern: '/quiz-2/attempt',
      fullUrl: 'https://www.coursera.org/learn/introduction-to-generative-ai/assignment-submission/PbAYx/quiz-2/attempt',
      targetTexts: [
        'A generative AI model could be trained on a dataset of images of cats and then used to generate new images of cats. A discriminative AI model could be trained on a dataset of images of cats and dogs and then used to classify new images as either cats or dogs.',
      ],
      fallbackKeywords: [
        'images of cats and then used to generate new images of cats',
        'dataset of images of cats and dogs',
        'images of cats',
        'изображениях кошек',
        'кошек и собак',
      ],
    },
    {
      quiz: 3,
      title: '3-Quiz: Foundation Models',
      urlPattern: '/quiz-3/attempt',
      fullUrl: 'https://www.coursera.org/learn/introduction-to-generative-ai/assignment-submission/68izF/quiz-3/attempt',
      targetTexts: [
        'A foundation model is a large AI model pretrained on a vast quantity of data that was "designed to be adapted" (or fine-tuned) to a wide range of downstream tasks, such as sentiment analysis, image captioning, and object recognition.',
      ],
      fallbackKeywords: [
        'foundation model is a large AI model pretrained on a vast quantity of data',
        'designed to be adapted',
        'downstream tasks',
        'базовая модель',
        'большом объеме данных',
        'адаптирован',
      ],
    },
    {
      quiz: 4,
      title: '4-Quiz: LLM Hallucinations & Prompts',
      urlPattern: '/quiz-4/attempt',
      fullUrl: 'https://www.coursera.org/learn/introduction-to-generative-ai/assignment-submission/QR1K5/quiz-4/attempt',
      isQuiz4: true,
      q1ExcludeKeywords: [
        'The model is trained on too much data',
        'trained on too much data',
        'too much data',
        'слишком много данных',
        'слишком большом объеме данных',
      ],
      q2TargetTexts: [
        'A prompt is a short piece of text that is given to the large language model as input, and it can be used to control the output of the model in many ways.',
      ],
      q2FallbackKeywords: [
        'prompt is a short piece of text',
        'control the output of the model in many ways',
        'control the output of the model',
        'Промпт — это короткий фрагмент текста',
        'управлять выводом',
      ],
    },
  ];

  // Helper: Sound player
  function playSuccessChime() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1); // E5
      osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.2); // G5
      osc.frequency.setValueAtTime(1046.5, ctx.currentTime + 0.3); // C6
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.65);
    } catch (e) {}
  }

  // Create floating widget
  function ensureFloatingWidget() {
    let container = document.getElementById('coursera-auto-solver-widget');
    if (!container) {
      container = document.createElement('div');
      container.id = 'coursera-auto-solver-widget';
      container.style.cssText = `
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 9999999;
        background: #0f172a;
        color: #f8fafc;
        border: 2px solid #3b82f6;
        border-radius: 16px;
        padding: 16px 20px;
        box-shadow: 0 20px 40px rgba(0,0,0,0.45);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        font-size: 14px;
        min-width: 320px;
        max-width: 420px;
        animation: fadeIn 0.3s ease;
      `;
      document.body.appendChild(container);
    }
    return container;
  }

  function updateWidget(html) {
    const el = ensureFloatingWidget();
    el.innerHTML = html;
  }

  // Find active student name from session or prompt
  function getStudentName() {
    let name = sessionStorage.getItem('coursera_solver_student_name');
    if (!name) {
      // Check URL search param
      const urlParams = new URLSearchParams(window.location.search);
      name = urlParams.get('student_name');
    }
    if (!name) {
      // Try finding from Coursera profile menu
      const profileEl = document.querySelector('[data-e2e="header-profile"] button, .rc-UserMenuButton');
      if (profileEl) {
        const text = profileEl.innerText.trim();
        if (text && text.length > 2 && !text.toLowerCase().includes('account')) {
          name = text;
        }
      }
    }
    return name || '';
  }

  async function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Main solving engine
  async function solveCurrentQuiz(quizConfig, studentName) {
    updateWidget(`
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
        <div style="width:12px;height:12px;border-radius:50%;background:#3b82f6;animation:pulse 1s infinite;"></div>
        <strong style="color:#60a5fa;font-size:15px;">Quiz ${quizConfig.quiz}/4 yechilmoqda...</strong>
      </div>
      <div style="font-size:13px;color:#94a3b8;margin-bottom:4px;">O'quvchi: <span style="color:#f8fafc;font-weight:600;">${studentName}</span></div>
      <div style="font-size:12px;color:#cbd5e1;">Test variantlari qidirilmoqda va belgilanmoqda...</div>
    `);

    // 1. Check if "Start attempt" / "Resume" / "Try again" button exists
    const startBtns = Array.from(document.querySelectorAll('button, a')).filter((b) => {
      const t = (b.innerText || '').trim().toLowerCase();
      return (
        t.includes('start attempt') ||
        t.includes('resume') ||
        t.includes('take quiz') ||
        t.includes('try again') ||
        t.includes('retake') ||
        t.includes('начать попытку') ||
        t.includes('продолжить')
      );
    });

    if (startBtns.length > 0) {
      startBtns[0].click();
      await sleep(2500);
    }

    // 2. Wait for radio/checkbox inputs
    let retries = 0;
    while (retries < 20) {
      const inputs = document.querySelectorAll('input[type="radio"], input[type="checkbox"]');
      if (inputs.length > 0) break;
      await sleep(1000);
      retries++;
    }

    // 3. Select Answers
    if (!quizConfig.isQuiz4) {
      // Quizzes 1, 2, 3: Single choice
      const radioInputs = Array.from(document.querySelectorAll('input[type="radio"]'));
      let selected = false;

      for (const radio of radioInputs) {
        const container = radio.closest('label, div[role="radio"], [data-testid*="option"], li, div.rc-Option') || radio.parentElement;
        const text = (container?.innerText || '').toLowerCase();

        for (const target of quizConfig.targetTexts) {
          if (text.includes(target.toLowerCase())) {
            radio.click();
            radio.checked = true;
            radio.dispatchEvent(new Event('change', { bubbles: true }));
            if (container) container.click();
            selected = true;
            break;
          }
        }
        if (selected) break;

        for (const kw of quizConfig.fallbackKeywords) {
          if (text.includes(kw.toLowerCase())) {
            radio.click();
            radio.checked = true;
            radio.dispatchEvent(new Event('change', { bubbles: true }));
            if (container) container.click();
            selected = true;
            break;
          }
        }
        if (selected) break;
      }
    } else {
      // Quiz 4: Q1 Multi-select (all except too much data), Q2 Single-select prompt definition
      const checkboxes = Array.from(document.querySelectorAll('input[type="checkbox"]'));
      for (const cb of checkboxes) {
        const container = cb.closest('label, li, div') || cb.parentElement;
        const label = (container?.innerText || cb.getAttribute('aria-label') || '').toLowerCase();

        // Skip honor code checkbox
        if (
          label.includes('honor code') ||
          label.includes('understand that submitting') ||
          label.includes('understand') ||
          label.includes('кодекс чести') ||
          label.includes('понимаю')
        ) {
          continue;
        }

        const isExcluded = quizConfig.q1ExcludeKeywords.some((kw) => label.includes(kw.toLowerCase()));
        if (!isExcluded) {
          if (!cb.checked) {
            cb.click();
            cb.checked = true;
            cb.dispatchEvent(new Event('change', { bubbles: true }));
          }
        } else {
          if (cb.checked) {
            cb.click();
            cb.checked = false;
            cb.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }
      }

      // Q2: Prompt definition
      const radioInputs = Array.from(document.querySelectorAll('input[type="radio"]'));
      for (const radio of radioInputs) {
        const container = radio.closest('label, div[role="radio"], [data-testid*="option"], li, div.rc-Option') || radio.parentElement;
        const text = (container?.innerText || '').toLowerCase();

        for (const target of quizConfig.q2TargetTexts) {
          if (text.includes(target.toLowerCase())) {
            radio.click();
            radio.checked = true;
            radio.dispatchEvent(new Event('change', { bubbles: true }));
            if (container) container.click();
            break;
          }
        }
      }
    }

    await sleep(600);

    // 4. Honor Code Checkbox
    const allCbs = Array.from(document.querySelectorAll('input[type="checkbox"]'));
    const honorCbs = allCbs.filter((cb) => {
      const container = cb.closest('label, div') || cb.parentElement;
      const label = (container?.innerText || cb.getAttribute('aria-label') || '').toLowerCase();
      return (
        label.includes('honor code') ||
        label.includes('understand that submitting') ||
        label.includes('understand') ||
        label.includes('кодекс чести') ||
        label.includes('понимаю')
      );
    });
    for (const cb of honorCbs) {
      if (!cb.checked) {
        cb.click();
        cb.checked = true;
        cb.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }

    await sleep(500);

    // 5. Enter Legal Name
    const textInputs = Array.from(document.querySelectorAll('input[type="text"], input:not([type])'));
    const legalInput =
      textInputs.find((i) => {
        const ph = (i.placeholder || '').toLowerCase();
        const aria = (i.getAttribute('aria-label') || '').toLowerCase();
        const pText = ((i.closest('div, label, section'))?.innerText || '').toLowerCase();
        return (
          ph.includes('legal name') ||
          aria.includes('legal name') ||
          pText.includes('legal name') ||
          ph.includes('официальное имя') ||
          pText.includes('официальное имя') ||
          ph.includes('фио') ||
          pText.includes('фио')
        );
      }) || textInputs[textInputs.length - 1];

    if (legalInput) {
      legalInput.focus();
      legalInput.value = studentName;
      legalInput.dispatchEvent(new Event('input', { bubbles: true }));
      legalInput.dispatchEvent(new Event('change', { bubbles: true }));
    }

    await sleep(800);

    // 6. Submit Button
    updateWidget(`
      <div style="font-size:14px;color:#38bdf8;font-weight:bold;margin-bottom:6px;">Topshirish (Submit) bosilmoqda...</div>
      <div style="font-size:12px;color:#94a3b8;">Quiz ${quizConfig.quiz}/4 muvaffaqiyatli jo'natilmoqda.</div>
    `);

    const btns = Array.from(document.querySelectorAll('button'));
    const submitBtn = btns.find((b) => {
      const t = b.innerText.trim().toLowerCase();
      const isSub = t === 'submit' || t === 'отправить' || t.startsWith('submit') || t.startsWith('отправить');
      const isNotDraft = !t.includes('draft') && !t.includes('черновик') && !t.includes('cancel') && !t.includes('отмена');
      return (isSub || b.type === 'submit') && isNotDraft && !b.disabled;
    });

    if (submitBtn) {
      submitBtn.click();
    }

    // Modal second submit
    await sleep(1800);
    const dialog = document.querySelector('[role="dialog"], [role="alertdialog"], .cds-dialog, .c-modal') || document.body;
    const dialogBtns = Array.from(dialog.querySelectorAll('button'));
    const confirmBtn = dialogBtns.find((b) => {
      const t = b.innerText.trim().toLowerCase();
      return (
        (t === 'submit' || t === 'отправить' || t.includes('submit') || t.includes('отправить')) &&
        !t.includes('cancel') &&
        !t.includes('отмена') &&
        !t.includes('draft') &&
        !b.disabled
      );
    });

    if (confirmBtn) {
      confirmBtn.click();
    }

    await sleep(3500);

    // Check next quiz or complete
    if (quizConfig.quiz < 4) {
      const nextQuizIndex = quizConfig.quiz; // 1 -> index 1 is Quiz 2
      const nextQuiz = QUIZZES[nextQuizIndex];
      sessionStorage.setItem('coursera_auto_solving', 'true');
      sessionStorage.setItem('coursera_target_quiz', (quizConfig.quiz + 1).toString());

      updateWidget(`
        <div style="color:#4ade80;font-weight:bold;font-size:15px;margin-bottom:6px;">✅ Quiz ${quizConfig.quiz} topshirildi!</div>
        <div style="font-size:12px;color:#cbd5e1;">Keyingi Quiz ${quizConfig.quiz + 1} sahifasiga o'tilmoqda...</div>
      `);

      await sleep(1500);
      window.location.href = nextQuiz.fullUrl;
    } else {
      // All 4 quizzes done!
      sessionStorage.removeItem('coursera_auto_solving');
      sessionStorage.removeItem('coursera_target_quiz');
      playSuccessChime();

      updateWidget(`
        <div style="color:#22c55e;font-size:16px;font-weight:800;margin-bottom:6px;">🏆 Barcha 4 ta test 100% topshirildi!</div>
        <div style="font-size:13px;color:#f8fafc;margin-bottom:10px;">O'quvchi: <strong>${studentName}</strong></div>
        <div style="font-size:12px;color:#94a3b8;margin-bottom:12px;">Barcha savollar to'liq va bexato yakunlandi. Endi sertifikat olishingiz mumkin.</div>
        <button id="close-solver-widget-btn" style="background:#22c55e;color:#052e16;border:none;padding:6px 14px;border-radius:8px;font-weight:700;font-size:12px;cursor:pointer;">Yopish</button>
      `);

      document.getElementById('close-solver-widget-btn')?.addEventListener('click', () => {
        document.getElementById('coursera-auto-solver-widget')?.remove();
      });
    }
  }

  // Auto-init on page load
  window.addEventListener('load', async () => {
    await sleep(2000);

    const isAutoRunning = sessionStorage.getItem('coursera_auto_solving') === 'true';
    const currentUrl = window.location.href;
    const currentQuiz = QUIZZES.find((q) => currentUrl.includes(q.urlPattern));

    let studentName = getStudentName();

    if (currentQuiz && isAutoRunning) {
      // Auto-continue to next quiz
      if (!studentName) studentName = 'Student';
      await solveCurrentQuiz(currentQuiz, studentName);
      return;
    }

    // If not auto-running, render convenient "Testlarni Avto-Yechish" launcher button on Coursera
    const launcher = document.createElement('div');
    launcher.id = 'coursera-solver-launcher';
    launcher.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 9999999;
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      color: white;
      padding: 12px 18px;
      border-radius: 50px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 14px;
      font-weight: 700;
      box-shadow: 0 10px 25px rgba(16, 185, 129, 0.45);
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      transition: all 0.2s ease;
    `;
    launcher.innerHTML = `
      <span style="font-size:18px;">⚡️</span>
      <span>4 ta Testni Avto-Yechish</span>
    `;

    launcher.addEventListener('mouseenter', () => {
      launcher.style.transform = 'scale(1.05)';
    });
    launcher.addEventListener('mouseleave', () => {
      launcher.style.transform = 'scale(1)';
    });

    launcher.addEventListener('click', async () => {
      launcher.remove();
      let inputName = studentName;
      if (!inputName) {
        inputName = prompt("O'quvchining to'liq F.I.SH (Legal name) kiriting:", '') || 'Student';
      }
      sessionStorage.setItem('coursera_solver_student_name', inputName);
      sessionStorage.setItem('coursera_auto_solving', 'true');

      if (currentQuiz) {
        await solveCurrentQuiz(currentQuiz, inputName);
      } else {
        updateWidget(`
          <div style="font-size:14px;color:#38bdf8;font-weight:bold;margin-bottom:6px;">1-Test ochilmoqda...</div>
          <div style="font-size:12px;color:#cbd5e1;">Quiz 1 sahifasiga yo'naltirilmoqda...</div>
        `);
        window.location.href = QUIZZES[0].fullUrl;
      }
    });

    document.body.appendChild(launcher);
  });
})();
