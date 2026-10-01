const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  page.on('response', async res => {
    const url = res.url();
    if (url.includes('/api/') || url.includes('/auth/')) {
      try {
        console.log('HTTP Response:', res.status(), url);
        const text = await res.text().catch(() => '');
        console.log('Body:', text.slice(0, 300));
      } catch {}
    }
  });

  console.log('1. Loading page...');
  await page.goto('https://aileaders.uz/auth/register', { waitUntil: 'networkidle2', timeout: 35000 });

  // 1. Click Guvohnoma
  console.log('2. Clicking Guvohnoma...');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const guv = btns.find(b => b.innerText.includes('Guvohnoma'));
    if (guv) guv.click();
  });
  await new Promise(r => setTimeout(r, 800));

  // 2. Type document
  console.log('3. Typing passport/metrika...');
  const inputEl = await page.$('input[name="passport_number"]');
  if (inputEl) {
    await inputEl.type('I-FR 0521092', { delay: 30 });
  }

  // 3. Open date picker
  console.log('4. Opening date picker...');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const dBtn = btns.find(b => b.innerText.includes('Kun tanlang') || b.id === 'date');
    if (dBtn) dBtn.click();
  });
  await new Promise(r => setTimeout(r, 800));

  // 4. Select month: Mar (2), year: 2011, day: 18
  console.log('5. Selecting date...');
  await page.evaluate(() => {
    const popover = document.querySelector('[data-slot="popover-content"], [role="dialog"], [data-radix-popper-content-wrapper]') || document.body;
    const selects = Array.from(popover.querySelectorAll('select'));
    if (selects.length >= 2) {
      selects[0].value = '2'; // Mar
      selects[0].dispatchEvent(new Event('change', { bubbles: true }));
      selects[1].value = '2011';
      selects[1].dispatchEvent(new Event('change', { bubbles: true }));
    }
    const dayBtns = Array.from(popover.querySelectorAll('button'));
    const d = dayBtns.find(b => {
      return !b.classList.contains('rdp-day_outside') && b.innerText.trim() === '18';
    });
    if (d) d.click();
  });
  await new Promise(r => setTimeout(r, 800));

  // 5. Select Maktab
  console.log('6. Selecting Maktab...');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const trigger = btns.find(b => b.innerText.includes('Tanlang'));
    if (trigger) trigger.click();
  });
  await new Promise(r => setTimeout(r, 600));

  await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('[role="option"]'));
    const school = items.find(el => el.innerText.includes('Maktab'));
    if (school) school.click();
  });
  await new Promise(r => setTimeout(r, 800));

  // 6. Submit
  console.log('7. Clicking Ro\'yxatdan o\'tish...');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const submit = btns.find(b => b.innerText.includes("Ro'yxatdan o'tish") && (b.type === 'submit' || !b.type || b.type === 'button'));
    if (submit) submit.click();
  });

  await new Promise(r => setTimeout(r, 4000));

  const pageInfo = await page.evaluate(() => {
    return {
      url: window.location.href,
      text: document.body.innerText.slice(0, 1000),
      buttons: Array.from(document.querySelectorAll('button')).map(b => b.innerText.trim()),
      inputs: Array.from(document.querySelectorAll('input')).map(i => ({ name: i.name, type: i.type, placeholder: i.placeholder }))
    };
  });
  console.log('Page info after submit:', JSON.stringify(pageInfo, null, 2));

  await browser.close();
})();
