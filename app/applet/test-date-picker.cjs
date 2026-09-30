const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.goto('https://aileaders.uz/auth/register', { waitUntil: 'networkidle2', timeout: 35000 });
  
  // Find date button
  const dateBtnInfo = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const dBtn = btns.find(b => b.innerText.includes('Kun tanlang') || b.id === 'date');
    if (dBtn) {
      dBtn.click();
      return { found: true, text: dBtn.innerText, id: dBtn.id };
    }
    return { found: false };
  });
  console.log('Date button info:', dateBtnInfo);
  await new Promise(r => setTimeout(r, 1500));

  const popoverInfo = await page.evaluate(() => {
    const popovers = Array.from(document.querySelectorAll('[data-slot="popover-content"], [role="dialog"], [data-radix-popper-content-wrapper]'));
    if (popovers.length === 0) return { found: false };
    const p = popovers[0];
    const selects = Array.from(p.querySelectorAll('select')).map(s => ({
      name: s.name,
      id: s.id,
      options: Array.from(s.options).map(o => ({ value: o.value, text: o.text }))
    }));
    const dayButtons = Array.from(p.querySelectorAll('button')).map(b => ({
      text: b.innerText.trim(),
      className: b.className
    }));
    return {
      found: true,
      selects,
      dayButtons: dayButtons.slice(0, 15)
    };
  });
  console.log('Popover info:', JSON.stringify(popoverInfo, null, 2));

  await browser.close();
})();
