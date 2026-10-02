import puppeteer from 'puppeteer';

async function main() {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
      '--disable-gpu',
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8' });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  page.on('request', req => {
    const u = req.url();
    if (u.includes('coursera.org/api') || u.includes('signup') || u.includes('auth') || u.includes('user') || u.includes('login')) {
      console.log('API REQ:', req.method(), u);
      if (req.postData()) console.log(' -> POST:', req.postData().slice(0, 300));
    }
  });

  page.on('response', async res => {
    const u = res.url();
    if (u.includes('signup') || u.includes('users') || u.includes('email') || u.includes('verification')) {
      try {
        console.log(`API RES [${res.status()}]: ${u}`);
        const t = await res.text();
        console.log(' -> RES BODY:', t.slice(0, 300));
      } catch (e) {}
    }
  });

  const url = 'https://www.coursera.org/programs/learning-program-h13rq/learn/introduction-to-generative-ai?collectionId=2mufz#authMode=signup';
  console.log('Navigating to:', url);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 35000 });
  await new Promise(r => setTimeout(r, 4000));

  // Find the exact form
  const info = await page.evaluate(() => {
    const f = document.querySelector('form.rc-SignupForm, form[name="signup"]');
    if (!f) return { error: 'no form' };
    const inputs = Array.from(f.querySelectorAll('input'));
    return {
      formName: f.name,
      formClass: f.className,
      action: f.action,
      inputs: inputs.map(i => ({ name: i.name, id: i.id, val: i.value, ph: i.placeholder })),
      buttons: Array.from(f.querySelectorAll('button')).map(b => ({ text: b.innerText, type: b.type, disabled: b.disabled }))
    };
  });
  console.log('FORM INFO:', JSON.stringify(info, null, 2));

  const testEmail = 'student.test.' + Date.now() + '@gmail.com';
  console.log('Typing fields with email:', testEmail);

  const nInput = await page.$('input[name="name"]');
  if (nInput) {
    await nInput.click();
    await page.keyboard.type('Ali Valiyev');
  } else {
    console.log('Name input not found!');
  }

  const eInput = await page.$('input[name="email"]');
  if (eInput) {
    await eInput.click();
    await page.keyboard.type(testEmail);
  } else {
    console.log('Email input not found!');
  }

  const pInput = await page.$('input[name="password"]');
  if (pInput) {
    await pInput.click();
    await page.keyboard.type('Salom123!@#');
  } else {
    console.log('Password input not found!');
  }

  await new Promise(r => setTimeout(r, 1000));

  // Check form values after typing
  const values = await page.evaluate(() => {
    const f = document.querySelector('form.rc-SignupForm, form[name="signup"]');
    if (!f) return null;
    return Array.from(f.querySelectorAll('input')).map(i => ({ name: i.name, val: i.value }));
  });
  console.log('Values typed in DOM:', values);

  const submitBtn = await page.$('form.rc-SignupForm button[type="submit"], form[name="signup"] button[type="submit"]');
  if (submitBtn) {
    console.log('Clicking submit button via Puppeteer click...');
    await submitBtn.click();
  } else {
    console.log('Submit button handle not found!');
  }

  // Wait 12 seconds to observe network and page transitions
  await new Promise(r => setTimeout(r, 12000));

  const afterSubmit = await page.evaluate(() => {
    return {
      url: window.location.href,
      h1: Array.from(document.querySelectorAll('h1, h2, h3, [role="heading"]')).map(h => h.innerText.trim()),
      modals: Array.from(document.querySelectorAll('[role="dialog"]')).map(d => d.innerText.trim().slice(0, 400)),
      bodySnippet: document.body.innerText.slice(0, 600)
    };
  });
  console.log('After submit:', JSON.stringify(afterSubmit, null, 2));

  await browser.close();
}

main().catch(err => console.error('Error:', err));
