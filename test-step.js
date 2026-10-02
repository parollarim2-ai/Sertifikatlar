import puppeteer from 'puppeteer';

async function test() {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1366,768',
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 768 });
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8' });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');

  // Stealth evasions
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    window.chrome = {
      runtime: {},
      loadTimes: function() {},
      csi: function() {},
      app: {}
    };
    Object.defineProperty(navigator, 'plugins', {
      get: () => [1, 2, 3, 4, 5],
    });
    Object.defineProperty(navigator, 'languages', {
      get: () => ['ru-RU', 'ru', 'en-US', 'en'],
    });
  });

  page.on('request', r => {
    const u = r.url();
    if (u.includes('signup') || u.includes('register') || u.includes('auth') || u.includes('user') || u.includes('arkose') || u.includes('recaptcha')) {
      if (!u.includes('pixel') && !u.includes('analytics') && !u.includes('eventing')) {
        console.log('INTERESTING REQ:', r.method(), u.slice(0, 120));
        if (r.postData()) console.log(' -> DATA:', r.postData().slice(0, 250));
      }
    }
  });

  page.on('response', async res => {
    const u = res.url();
    if (u.includes('signup') || u.includes('users') || u.includes('email') || u.includes('verification') || u.includes('arkose')) {
      if (!u.includes('pixel') && !u.includes('analytics') && !u.includes('eventing')) {
        try {
          console.log(`INTERESTING RES [${res.status()}]: ${u.slice(0, 120)}`);
          console.log(' -> BODY:', (await res.text()).slice(0, 300));
        } catch (e) {}
      }
    }
  });

  const url = 'https://www.coursera.org/programs/learning-program-h13rq/learn/introduction-to-generative-ai?collectionId=2mufz#authMode=signup';
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 35000 });
  await new Promise(r => setTimeout(r, 2000));

  const nInput = await page.$('input[name="name"]');
  const eInput = await page.$('input[name="email"]');
  const pInput = await page.$('input[name="password"]');

  if (nInput && eInput && pInput) {
    await nInput.click({ clickCount: 3 });
    await nInput.type('Saidov Akramxon', { delay: 35 });

    const testEmail = 'saidov.akramxon.' + Math.floor(Math.random() * 100000) + '@gmail.com';
    await eInput.click({ clickCount: 3 });
    await eInput.type(testEmail, { delay: 35 });

    await pInput.click({ clickCount: 3 });
    await pInput.type('MaktabParol2026!', { delay: 35 });

    console.log('Typed credentials with email:', testEmail);
    await new Promise(r => setTimeout(r, 800));

    const submitBtn = await page.$('form.rc-SignupForm button[type="submit"], form[name="signup"] button[type="submit"]');
    if (submitBtn) {
      console.log('Clicking submit button with stealth...');
      await submitBtn.click();
    }

    // Wait 12 seconds
    await new Promise(r => setTimeout(r, 12000));

    const text = await page.evaluate(() => document.body.innerText);
    console.log('Page text snapshot:', text.slice(0, 800));

    const modals = await page.evaluate(() => {
      const dialogs = Array.from(document.querySelectorAll('[role="dialog"]'));
      return dialogs.map(d => d.innerText.slice(0, 300));
    });
    console.log('Modals found:', modals);
  }

  await browser.close();
}

test().catch(console.error);
