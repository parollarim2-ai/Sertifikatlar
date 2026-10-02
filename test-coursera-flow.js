import puppeteer from 'puppeteer';

async function testCoursera() {
  console.log("Starting Puppeteer test for Coursera signup...");
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
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7' });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

  // Listen to all network responses
  page.on('response', async res => {
    const url = res.url();
    if (url.includes('signup') || url.includes('register') || url.includes('auth') || url.includes('users') || url.includes('graphql')) {
      try {
        const status = res.status();
        console.log(`[HTTP ${status}] ${url.slice(0, 100)}`);
        if (status >= 400 || url.includes('signup')) {
          const text = await res.text();
          console.log(`Response text (${url.slice(0, 80)}):`, text.slice(0, 300));
        }
      } catch (e) {}
    }
  });

  const courseraUrl = 'https://www.coursera.org/programs/learning-program-h13rq/learn/introduction-to-generative-ai?collectionId=2mufz#authMode=signup';
  console.log("Navigating to:", courseraUrl);
  await page.goto(courseraUrl, { waitUntil: 'networkidle2', timeout: 40000 });
  await new Promise(r => setTimeout(r, 2000));

  // Dismiss cookie modal if any
  await page.evaluate(() => {
    const rejectBtn = document.getElementById('onetrust-reject-all-handler') || 
                      document.querySelector('.ot-pc-refuse-all-handler') || 
                      document.getElementById('onetrust-accept-btn-handler');
    if (rejectBtn) (rejectBtn).click();
  });

  // Check form inputs
  const inputsInfo = await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input'));
    return inputs.map(i => ({
      name: i.name,
      type: i.type,
      placeholder: i.placeholder,
      id: i.id,
      className: i.className
    }));
  });
  console.log("Found inputs:", JSON.stringify(inputsInfo, null, 2));

  // Try typing into fields
  const testEmail = `akramxonsaidov02+test${Date.now()}@gmail.com`;
  console.log("Testing with email:", testEmail);

  const nameInput = await page.$('input[name="name"], input[placeholder*="Ф. И. О."], input[placeholder*="full name"]');
  if (nameInput) {
    await nameInput.click();
    await nameInput.type("Saidov Akramxon", { delay: 50 });
  } else {
    console.log("Name input NOT found!");
  }

  const emailInput = await page.$('input[name="email"], input[placeholder*="name@email.com"], input[placeholder*="Электронный адрес"]');
  if (emailInput) {
    await emailInput.click();
    await emailInput.type(testEmail, { delay: 50 });
  } else {
    console.log("Email input NOT found!");
  }

  const passInput = await page.$('input[name="password"], input[placeholder*="Создать пароль"], input[placeholder*="password"]');
  if (passInput) {
    await passInput.click();
    await passInput.type("MaktabPass2026!", { delay: 50 });
  } else {
    console.log("Password input NOT found!");
  }

  await new Promise(r => setTimeout(r, 1000));

  // Look for submit button
  const buttonInfo = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    return btns.map(b => ({
      text: b.innerText.trim(),
      type: b.type,
      disabled: b.disabled,
      className: b.className
    }));
  });
  console.log("Buttons found:", JSON.stringify(buttonInfo, null, 2));

  // Click join button
  console.log("Clicking Join button...");
  const clicked = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const joinBtn = btns.find(b => {
      const txt = b.innerText.trim();
      return (
        txt.includes('Присоединиться бесплатно') ||
        txt.includes('Присоединиться') ||
        txt.includes('Join for Free') ||
        (b.type === 'submit' && !b.className.includes('onetrust'))
      );
    });
    if (joinBtn) {
      console.log("Found joinBtn:", joinBtn.innerText);
      joinBtn.click();
      return joinBtn.innerText;
    }
    return null;
  });
  console.log("Clicked result:", clicked);

  // Wait 6 seconds and inspect page
  await new Promise(r => setTimeout(r, 6000));

  const afterSubmitText = await page.evaluate(() => document.body.innerText);
  console.log("Page text sample after 6s:", afterSubmitText.slice(0, 1000));

  const modalsOrErrors = await page.evaluate(() => {
    const alerts = Array.from(document.querySelectorAll('[role="alert"], [aria-live], .cds-feedback, .error, .rc-FormError'));
    return alerts.map(a => a.innerText.trim()).filter(Boolean);
  });
  console.log("Alerts/Errors on page:", modalsOrErrors);

  await browser.close();
}

testCoursera().catch(err => console.error("Test failed:", err));
