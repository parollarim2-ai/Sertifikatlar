import type { Browser } from 'puppeteer';

export interface CourseraQuizResult {
  quiz: number;
  title: string;
  url: string;
  status: 'passed' | 'completed' | 'already_passed' | 'failed';
  error?: string;
}

export interface SolveQuizzesResponse {
  success: boolean;
  studentName: string;
  studentEmail: string;
  completedQuizzes: CourseraQuizResult[];
  logs: string[];
  error?: string;
}

interface QuizConfig {
  quiz: number;
  title: string;
  url: string;
  targetTexts: string[];
  fallbackKeywords: string[];
  isQuiz4?: boolean;
  q1ExcludeKeywords?: string[];
  q2TargetTexts?: string[];
  q2FallbackKeywords?: string[];
}

const COURSERA_PROGRAM_LOGIN_URL =
  'https://www.coursera.org/programs/learning-program-h13rq/learn/introduction-to-generative-ai?collectionId=2mufz#authMode=login';

const QUIZZES: QuizConfig[] = [
  {
    quiz: 1,
    title: '1-Quiz: Generative AI Definition',
    url: 'https://www.coursera.org/learn/introduction-to-generative-ai/assignment-submission/UOf9n/quiz-1/attempt',
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
    url: 'https://www.coursera.org/learn/introduction-to-generative-ai/assignment-submission/PbAYx/quiz-2/attempt',
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
    url: 'https://www.coursera.org/learn/introduction-to-generative-ai/assignment-submission/68izF/quiz-3/attempt',
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
    url: 'https://www.coursera.org/learn/introduction-to-generative-ai/assignment-submission/QR1K5/quiz-4/attempt',
    isQuiz4: true,
    targetTexts: [],
    fallbackKeywords: [],
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

async function dismissBannersAndPopups(page: any) {
  try {
    await page.evaluate(() => {
      document
        .querySelectorAll(
          '#onetrust-consent-sdk, #onetrust-banner-sdk, .onetrust-pc-dark-filter, #onetrust-pc-sdk, .ot-fade-in'
        )
        .forEach((el) => el.remove());
      const acceptBtn = document.getElementById('onetrust-accept-btn-handler') as HTMLElement | null;
      if (acceptBtn) acceptBtn.click();
    });
  } catch {}
}

export async function solveStudentCourseraQuizzes(
  browser: Browser,
  student: { fullName: string; email: string; password?: string; id?: string },
  onProgress?: (msg: string) => void
): Promise<SolveQuizzesResponse> {
  const logs: string[] = [];
  const log = (msg: string) => {
    const entry = `[${new Date().toLocaleTimeString('uz-UZ')}] ${msg}`;
    logs.push(entry);
    console.log(`[Coursera Quiz Solver] ${msg}`);
    if (onProgress) {
      try {
        onProgress(entry);
      } catch {}
    }
  };

  const cleanEmail = (student.email || '').trim().toLowerCase();
  const cleanName = (student.fullName || '').trim();
  const password = student.password || 'MaktabPass2026!';

  if (!cleanEmail || !cleanName) {
    return {
      success: false,
      studentName: cleanName,
      studentEmail: cleanEmail,
      completedQuizzes: [],
      logs,
      error: "O'quvchi F.I.SH yoki email manzili ko'rsatilmadi.",
    };
  }

  log(`🚀 O'quvchi uchun Coursera testlarini yechish boshlandi: ${cleanName} (${cleanEmail})`);

  let context: any = null;
  let page: any = null;
  const completedQuizzes: CourseraQuizResult[] = [];

  try {
    // Isolated incognito context to avoid cookie bleeding between students
    context = await browser.createBrowserContext();
    page = await context.newPage();
    await page.setViewport({ width: 1280, height: 950 });
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    );
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'uz-UZ,uz;q=0.9,ru;q=0.8,en-US;q=0.7,en;q=0.6',
    });

    // Track API login responses to detect invalid credentials
    let loginApiError: string | null = null;
    page.on('response', async (res: any) => {
      const u = res.url();
      if (u.includes('api/login') || u.includes('thirdpartyauth') || u.includes('graphql')) {
        try {
          if (res.status() === 401 || res.status() === 400) {
            const body = await res.text();
            if (
              body.includes('invalidCredential') ||
              body.includes("didn't match") ||
              body.includes('Invalid') ||
              body.includes('password')
            ) {
              loginApiError = "Email yoki parol mos kelmadi (Username/password didn't match).";
            }
          }
        } catch {}
      }
    });

    // STEP 1: LOGIN VIA THE EXACT PROGRAM PORTAL
    log(`1. Coursera dasturiy sahifasi ochilmoqda...`);
    log(`Manzil: ${COURSERA_PROGRAM_LOGIN_URL}`);

    await page.goto(COURSERA_PROGRAM_LOGIN_URL, { waitUntil: 'networkidle2', timeout: 45000 });
    await new Promise((r) => setTimeout(r, 2000));
    await dismissBannersAndPopups(page);

    // Look for login inputs; if not present, click "Log In" / "Login" / "Войти" button
    let hasEmailInput = (await page.$('input[name="email"], input[type="email"]')) !== null;
    if (!hasEmailInput) {
      log(`ℹ️ Kirish tugmasi qidirilmoqda...`);
      const clickedLoginButton = await page.evaluate(() => {
        const clickable = Array.from(document.querySelectorAll('a, button'));
        const loginEl = clickable.find((el) => {
          const t = (el as HTMLElement).innerText.trim().toLowerCase();
          return t === 'log in' || t === 'login' || t === 'войти' || t === 'kirish';
        });
        if (loginEl) {
          (loginEl as HTMLElement).click();
          return (loginEl as HTMLElement).innerText.trim();
        }
        return null;
      });

      if (clickedLoginButton) {
        log(`ℹ️ "${clickedLoginButton}" tugmasi bosildi. Kirish formasi kutilmoqda...`);
      }

      try {
        await page.waitForSelector('input[name="email"], input[type="email"]', { timeout: 12000 });
        hasEmailInput = true;
      } catch {
        // Fallback: check if already authenticated on this program URL
        const cookies = await context.cookies();
        const hasCauth = cookies.some((c: any) => c.name === 'CAUTH');
        if (!hasCauth) {
          throw new Error("Coursera kirish formasi (Login modal) ochilmadi. Iltimos qayta urunib ko'ring.");
        }
      }
    }

    if (hasEmailInput) {
      log(`2. O'quvchi ma'lumotlari kiritilmoqda: Email: "${cleanEmail}"...`);

      // Fill Email
      const emailInput = await page.$('input[name="email"], input[type="email"]');
      if (emailInput) {
        await emailInput.click({ clickCount: 3 });
        await emailInput.press('Backspace');
        await emailInput.type(cleanEmail, { delay: 25 });
      }

      // Fill Password
      log(`3. Parol kiritilmoqda...`);
      await page.waitForSelector('input[name="password"], input[type="password"]', { timeout: 10000 });
      const passInput = await page.$('input[name="password"], input[type="password"]');
      if (passInput) {
        await passInput.click({ clickCount: 3 });
        await passInput.press('Backspace');
        await passInput.type(password, { delay: 25 });
      }

      await new Promise((r) => setTimeout(r, 600));

      // Click Login button
      log(`4. "Login" (Kirish) tugmasi bosilmoqda...`);
      const clickedSubmit = await page.evaluate(() => {
        // Try submitting the specific form first
        const forms = Array.from(document.querySelectorAll('form'));
        for (const f of forms) {
          if (f.querySelector('input[type="password"], input[name="password"]')) {
            const sub = f.querySelector('button[type="submit"]') as HTMLButtonElement | null;
            if (sub && !sub.disabled) {
              sub.click();
              return true;
            }
          }
        }
        // Fallback: button with text Login
        const btns = Array.from(document.querySelectorAll('button'));
        const loginBtn = btns.find((b) => {
          const t = b.innerText.trim().toLowerCase();
          return (t === 'login' || t === 'войти' || t === 'log in') && !t.includes('google') && !t.includes('apple');
        });
        if (loginBtn && !loginBtn.disabled) {
          loginBtn.click();
          return true;
        }
        return false;
      });

      if (!clickedSubmit && passInput) {
        await passInput.focus();
        await page.keyboard.press('Enter');
      }

      // Wait up to 14 seconds for login to succeed or error out
      log(`5. Coursera tizimiga kirish tasdiqlanishi kutilmoqda...`);
      let loginSuccess = false;
      for (let sec = 0; sec < 14; sec++) {
        await new Promise((r) => setTimeout(r, 1000));

        if (loginApiError) {
          throw new Error(`Coursera login xatoligi: ${loginApiError} (Email: ${cleanEmail})`);
        }

        const pageState = await page.evaluate(() => {
          const alertEl = document.querySelector('[role="alert"], .cds-feedback, .error, .rc-FormError');
          const errorMsg = alertEl ? (alertEl as HTMLElement).innerText.trim() : null;
          const hasProfile = !!document.querySelector(
            '[data-e2e="header-profile"], button[aria-label*="Profile" i], .rc-UserMenuButton, [aria-label*="Account" i]'
          );
          const hasPassInput = !!document.querySelector('input[name="password"], input[type="password"]');
          return { errorMsg, hasProfile, hasPassInput };
        });

        if (
          pageState.errorMsg &&
          (pageState.errorMsg.includes('match') ||
            pageState.errorMsg.includes('парол') ||
            pageState.errorMsg.includes('invalid') ||
            pageState.errorMsg.includes('incorrect') ||
            pageState.errorMsg.includes('error'))
        ) {
          throw new Error(`Coursera login xatoligi: ${pageState.errorMsg} (Email: ${cleanEmail})`);
        }

        const cookies = await context.cookies();
        const hasCauth = cookies.some((c: any) => c.name === 'CAUTH');

        if (hasCauth || pageState.hasProfile || (!pageState.hasPassInput && !pageState.errorMsg)) {
          loginSuccess = true;
          break;
        }
      }

      if (!loginSuccess && loginApiError) {
        throw new Error(`Coursera login xatoligi: ${loginApiError} (Email: ${cleanEmail})`);
      }

      if (!loginSuccess) {
        throw new Error(`Coursera tizimiga kirish tasdiqlanmadi (Email yoki parol xato bo'lishi mumkin).`);
      }

      log(`✅ Coursera tizimiga muvaffaqiyatli kirildi!`);
    } else {
      log(`✅ Coursera hisobiga kirish tasdiqlangan.`);
    }

    // Check if Course needs to be Enrolled
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button, a'));
      const enroll = btns.find((b) => {
        const t = (b as HTMLElement).innerText.trim().toLowerCase();
        return (
          (t.startsWith('enroll') || t.startsWith('зарегистрироваться') || t.includes('enroll for free')) &&
          !t.includes('cancel')
        );
      });
      if (enroll) {
        (enroll as HTMLElement).click();
      }
    });
    await new Promise((r) => setTimeout(r, 2000));

    // STEP 2: SOLVE EACH QUIZ SEQUENTIALLY
    for (const qConfig of QUIZZES) {
      log(`\n========================================`);
      log(`📝 [Quiz ${qConfig.quiz}/4] ${qConfig.title}`);
      log(`Havola: ${qConfig.url}`);

      await page.goto(qConfig.url, { waitUntil: 'networkidle2', timeout: 45000 });
      await new Promise((r) => setTimeout(r, 2500));
      await dismissBannersAndPopups(page);

      // Verify we are not blocked or sent back to unauthenticated screen
      const currentQuizPageText = await page.evaluate(() => document.body.innerText.slice(0, 500));
      if (
        currentQuizPageText.includes('Log in or create account') ||
        currentQuizPageText.includes('Войдите или зарегистрируйтесь') ||
        page.url().includes('authMode=login') ||
        page.url().includes('/account-login')
      ) {
        throw new Error(`Coursera tizimi qayta kirishni talab qildi (Sessiya uzildi).`);
      }

      // Check if attempt needs to be started or resumed
      const clickedStartAttempt = await page.evaluate(() => {
        const startBtns = Array.from(document.querySelectorAll('button, a')).filter((b) => {
          const t = (b as HTMLElement).innerText.trim().toLowerCase();
          return (
            t.includes('start attempt') ||
            t.includes('resume') ||
            t.includes('начать попытку') ||
            t.includes('продолжить') ||
            t.includes('take quiz') ||
            t.includes('start quiz') ||
            t.includes('try again') ||
            t.includes('retake') ||
            t.includes('пройти тест')
          );
        });
        if (startBtns.length > 0) {
          (startBtns[0] as HTMLElement).click();
          return (startBtns[0] as HTMLElement).innerText.trim();
        }
        return null;
      });

      if (clickedStartAttempt) {
        log(`ℹ️ "${clickedStartAttempt}" tugmasi bosildi.`);
        await new Promise((r) => setTimeout(r, 3500));
        await dismissBannersAndPopups(page);
      }

      // Check if already passed with 100%
      const gradeStatus = await page.evaluate(() => {
        const scoreEl = document.querySelector('[data-testid*="score"], [data-testid*="grade"], .c-score');
        const scoreText = (scoreEl ? (scoreEl as HTMLElement).innerText : '').toLowerCase();
        const bodyText = document.body.innerText.toLowerCase();
        const has100Grade =
          scoreText.includes('100%') ||
          bodyText.includes('highest grade: 100%') ||
          bodyText.includes('your grade: 100%') ||
          (bodyText.includes('you passed') && scoreText.includes('100%'));

        // If active test inputs exist on the page, the user is taking an attempt!
        const hasInputs = document.querySelectorAll('input[type="radio"], input[type="checkbox"]').length > 0;
        return { isPassed: has100Grade && !hasInputs, scoreText };
      });

      if (gradeStatus.isPassed) {
        log(`🎉 Quiz ${qConfig.quiz} allaqachon muvaffaqiyatli topshirilgan (100%)!`);
        completedQuizzes.push({
          quiz: qConfig.quiz,
          title: qConfig.title,
          url: qConfig.url,
          status: 'already_passed',
        });
        continue;
      }

      // Wait for quiz form inputs to appear
      try {
        await page.waitForSelector(
          'input[type="radio"], input[type="checkbox"], [role="radio"], [role="checkbox"]',
          { timeout: 20000 }
        );
      } catch {
        const bodySnippet = await page.evaluate(() => document.body.innerText.slice(0, 300));
        throw new Error(
          `Quiz ${qConfig.quiz}: Test savollari ochilmadi yoki sahifa yuklanmadi. Sahifa: "${bodySnippet.replace(/\n+/g, ' ')}"`
        );
      }

      // SELECT ANSWERS:
      if (!qConfig.isQuiz4) {
        // Quizzes 1, 2, 3: Single-choice question
        log(`Javob varianti izlanmoqda va belgilanmoqda...`);
        const selectResult = await page.evaluate(
          (targetTexts: string[], fallbackKws: string[]) => {
            const radioInputs = Array.from(document.querySelectorAll('input[type="radio"]')) as HTMLInputElement[];

            for (const radio of radioInputs) {
              const parentContainer = (radio.closest(
                'label, div[role="radio"], [data-testid*="option"], li, div.rc-Option'
              ) || radio.parentElement) as HTMLElement | null;
              const text = (parentContainer?.innerText || '').toLowerCase();

              for (const target of targetTexts) {
                if (text.includes(target.toLowerCase())) {
                  radio.click();
                  radio.checked = true;
                  radio.dispatchEvent(new Event('change', { bubbles: true }));
                  if (parentContainer) parentContainer.click();
                  return { success: true, text: (parentContainer?.innerText || '').slice(0, 100) };
                }
              }

              for (const kw of fallbackKws) {
                if (text.includes(kw.toLowerCase())) {
                  radio.click();
                  radio.checked = true;
                  radio.dispatchEvent(new Event('change', { bubbles: true }));
                  if (parentContainer) parentContainer.click();
                  return { success: true, text: (parentContainer?.innerText || '').slice(0, 100) };
                }
              }
            }

            // Fallback: check labels / options if radio input is not directly nested
            const allOptions = Array.from(
              document.querySelectorAll('label, [role="radio"], .c-quiz-option, .rc-Option')
            );
            for (const opt of allOptions) {
              const text = (opt as HTMLElement).innerText || '';
              for (const target of targetTexts) {
                if (text.toLowerCase().includes(target.toLowerCase())) {
                  const r = opt.querySelector('input[type="radio"]') as HTMLInputElement | null;
                  if (r) {
                    r.click();
                    r.checked = true;
                    r.dispatchEvent(new Event('change', { bubbles: true }));
                  }
                  (opt as HTMLElement).click();
                  return { success: true, text: text.trim().slice(0, 100) };
                }
              }
            }

            return { success: false, text: '' };
          },
          qConfig.targetTexts,
          qConfig.fallbackKeywords
        );

        if (!selectResult.success) {
          throw new Error(`Quiz ${qConfig.quiz}: To'g'ri javob varianti topilmadi.`);
        }
        log(`✅ To'g'ri variant belgilandi: "${selectResult.text.trim()}..."`);
      } else {
        // Quiz 4: Two questions (Q1: Multi-select checkboxes, Q2: Single-select radio)
        log(`4-Quiz: 1-savol (ko'p tanlovli) variantlari belgilanmoqda...`);
        const q1Result = await page.evaluate((excludeList: string[]) => {
          const checkboxes = Array.from(document.querySelectorAll('input[type="checkbox"]')) as HTMLInputElement[];
          let checkedCount = 0;

          for (const cb of checkboxes) {
            const container = (cb.closest('label, li, div') || cb.parentElement) as HTMLElement | null;
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

            const isExcluded = excludeList.some((kw) => label.includes(kw.toLowerCase()));

            // Rule: Select all EXCEPT "The model is trained on too much data."
            if (!isExcluded) {
              if (!cb.checked) {
                cb.click();
                cb.checked = true;
                cb.dispatchEvent(new Event('change', { bubbles: true }));
              }
              checkedCount++;
            } else {
              if (cb.checked) {
                cb.click();
                cb.checked = false;
                cb.dispatchEvent(new Event('change', { bubbles: true }));
              }
            }
          }
          return { checkedCount };
        }, qConfig.q1ExcludeKeywords || []);

        if (q1Result.checkedCount < 2) {
          throw new Error(`Quiz 4: 1-savolda yetarlicha variantlar belgilanmadi (${q1Result.checkedCount} ta).`);
        }

        log(
          `✅ 1-savolda ${q1Result.checkedCount} ta to'g'ri variant tanlandi ("too much data" dan boshqa barchasi).`
        );

        // Q2: Single-choice Prompt definition
        log(`4-Quiz: 2-savol (Prompt ta'rifi) tanlanmoqda...`);
        const q2Result = await page.evaluate(
          (targetTexts: string[], fallbackKws: string[]) => {
            const radioInputs = Array.from(document.querySelectorAll('input[type="radio"]')) as HTMLInputElement[];

            for (const radio of radioInputs) {
              const parentContainer = (radio.closest(
                'label, div[role="radio"], [data-testid*="option"], li, div.rc-Option'
              ) || radio.parentElement) as HTMLElement | null;
              const text = (parentContainer?.innerText || '').toLowerCase();

              for (const target of targetTexts) {
                if (text.includes(target.toLowerCase())) {
                  radio.click();
                  radio.checked = true;
                  radio.dispatchEvent(new Event('change', { bubbles: true }));
                  if (parentContainer) parentContainer.click();
                  return { success: true, text: (parentContainer?.innerText || '').slice(0, 100) };
                }
              }

              for (const kw of fallbackKws) {
                if (text.includes(kw.toLowerCase())) {
                  radio.click();
                  radio.checked = true;
                  radio.dispatchEvent(new Event('change', { bubbles: true }));
                  if (parentContainer) parentContainer.click();
                  return { success: true, text: (parentContainer?.innerText || '').slice(0, 100) };
                }
              }
            }
            return { success: false, text: '' };
          },
          qConfig.q2TargetTexts || [],
          qConfig.q2FallbackKeywords || []
        );

        if (!q2Result.success) {
          throw new Error(`Quiz 4: 2-savol (Prompt ta'rifi) to'g'ri javob varianti topilmadi.`);
        }
        log(`✅ 2-savol to'g'ri varianti belgilandi: "${q2Result.text.trim()}..."`);
      }

      await new Promise((r) => setTimeout(r, 600));

      // HONOR CODE: Check agreement checkbox
      await page.evaluate(() => {
        const honorCbs = Array.from(document.querySelectorAll('input[type="checkbox"]')).filter((cb) => {
          const container = (cb.closest('label, div') || cb.parentElement) as HTMLElement | null;
          const label = (container?.innerText || cb.getAttribute('aria-label') || '').toLowerCase();
          return (
            label.includes('honor code') ||
            label.includes('understand that submitting') ||
            label.includes('understand') ||
            label.includes('кодекс чести') ||
            label.includes('понимаю')
          );
        }) as HTMLInputElement[];

        for (const cb of honorCbs) {
          if (!cb.checked) {
            cb.click();
            cb.checked = true;
            cb.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }
      });

      // LEGAL NAME FIELD: Enter legal name
      log(`"Enter your legal name" maydoniga o'quvchi ismi kiritilmoqda: "${cleanName}"...`);
      const nameSuccess = await page.evaluate((studentFullName: string) => {
        const allInputs = Array.from(
          document.querySelectorAll('input[type="text"], input:not([type])')
        ) as HTMLInputElement[];
        const legalInput =
          allInputs.find((i) => {
            const ph = (i.placeholder || '').toLowerCase();
            const aria = (i.getAttribute('aria-label') || '').toLowerCase();
            const pText = ((i.closest('div, label, section') as HTMLElement | null)?.innerText || '').toLowerCase();
            return (
              ph.includes('legal name') ||
              aria.includes('legal name') ||
              pText.includes('legal name') ||
              ph.includes('официальное имя') ||
              pText.includes('официальное имя') ||
              ph.includes('фио') ||
              pText.includes('фио')
            );
          }) || allInputs[allInputs.length - 1];

        if (legalInput) {
          legalInput.focus();
          legalInput.value = '';
          legalInput.value = studentFullName;
          legalInput.dispatchEvent(new Event('input', { bubbles: true }));
          legalInput.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
        return false;
      }, cleanName);

      if (!nameSuccess) {
        throw new Error(`Quiz ${qConfig.quiz}: Ism kiritish maydoni (Enter your legal name) topilmadi.`);
      }
      log(`✅ O'quvchi to'liq ismi muvaffaqiyatli kiritildi: "${cleanName}"`);

      await new Promise((r) => setTimeout(r, 800));

      // SUBMIT BUTTON:
      log(`"Submit" (Topshirish) tugmasi bosilmoqda...`);
      const submitDone = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const subBtn = btns.find((b) => {
          const t = b.innerText.trim().toLowerCase();
          const isSub = t === 'submit' || t === 'отправить' || t.startsWith('submit') || t.startsWith('отправить');
          const isNotDraft =
            !t.includes('draft') && !t.includes('черновик') && !t.includes('cancel') && !t.includes('отмена');
          return (isSub || b.type === 'submit') && isNotDraft && !b.disabled;
        });
        if (subBtn) {
          (subBtn as HTMLElement).click();
          return true;
        }
        return false;
      });

      if (!submitDone) {
        throw new Error(`Quiz ${qConfig.quiz}: "Submit" tugmasi topilmadi yoki faollashmadi.`);
      }
      log(`ℹ️ Asosiy Submit tugmasi bosildi.`);

      // CONFIRMATION MODAL: Second "Submit" button
      log(`Tasdiqlash oynasidagi 2-marta "Submit" tugmasi kutilmoqda va bosilmoqda...`);
      await new Promise((r) => setTimeout(r, 2000));

      const modalConfirmDone = await page.evaluate(() => {
        const dialog =
          document.querySelector('[role="dialog"], [role="alertdialog"], .cds-dialog, .c-modal') || document.body;
        const btns = Array.from(dialog.querySelectorAll('button'));
        const confirmBtn = btns.find((b) => {
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
          (confirmBtn as HTMLElement).click();
          return true;
        }
        return false;
      });

      if (modalConfirmDone) {
        log(`✅ Tasdiqlash oynasidagi "Submit" tugmasi bosildi!`);
      } else {
        log(`ℹ️ 2-tasdiqlash oynasi talab qilinmadi.`);
      }

      // Wait 5 seconds for submission to finalize
      await new Promise((r) => setTimeout(r, 5000));
      log(`🎉 Quiz ${qConfig.quiz} muvaffaqiyatli topshirildi!`);

      completedQuizzes.push({
        quiz: qConfig.quiz,
        title: qConfig.title,
        url: qConfig.url,
        status: 'completed',
      });
    }

    log(`\n🏆 Barcha 4 ta Coursera testlari muvaffaqiyatli yakunlandi! O'quvchi: ${cleanName}`);
    return {
      success: true,
      studentName: cleanName,
      studentEmail: cleanEmail,
      completedQuizzes,
      logs,
    };
  } catch (err: any) {
    log(`❌ Test yechish jarayonida xatolik: ${err.message}`);
    return {
      success: false,
      studentName: cleanName,
      studentEmail: cleanEmail,
      completedQuizzes,
      logs,
      error: err.message,
    };
  } finally {
    if (page) {
      try {
        await page.close();
      } catch {}
    }
    if (context) {
      try {
        await context.close();
      } catch {}
    }
  }
}
