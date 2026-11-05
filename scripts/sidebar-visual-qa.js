async page => {
  const native = await page.evaluate(() => Boolean(window.__TAURI_INTERNALS__));
  if (native) {
    const s = await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('workspace_status'));
    if (!s.path.includes('noted-sidebar-ui-')) throw new Error('Synthetic sidebar workspace required');
  } else if (new URL(page.url()).origin !== 'http://127.0.0.1:1436') throw new Error('Synthetic preview required');
  const fixture = await page.evaluate(() => JSON.parse(localStorage.getItem('noted-sidebar-fixture') || 'null'));
  if (!fixture) throw new Error('Synthetic fixture required');
  await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
  const browse = page.getByRole('button', { name: 'Browse notes', exact: true }), profiles = [];
  if (await browse.getAttribute('aria-expanded') !== 'true') await browse.click();
  await page.locator(`[data-folder="${fixture.project}"]`).click(); await page.locator(`[data-folder="${fixture.research}"]`).click(); await page.locator(`[data-folder="${fixture.observations}"]`).click();
  await page.waitForFunction(() => document.querySelector('#list-count')?.textContent === '95');
  for (const mode of ['light', 'dark']) {
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.locator('#appearance-toggle').click(); await page.locator('#appearance-mode').selectOption(mode); await page.keyboard.press('Escape');
    await page.locator('#note-list [data-note]').first().focus(); await page.waitForTimeout(250);
    const report = await page.evaluate(() => {
      const root = document.querySelector('#navigation-panel'), canvas = document.createElement('canvas'), context = canvas.getContext('2d', { willReadFrequently: true }); canvas.width = canvas.height = 1;
      const cache = new Map();
      const color = value => {
        if (cache.has(value)) return cache.get(value);
        context.clearRect(0, 0, 1, 1); context.fillStyle = value; context.fillRect(0, 0, 1, 1);
        const rgba = [...context.getImageData(0, 0, 1, 1).data]; cache.set(value, rgba); return rgba;
      };
      const luminance = rgb => rgb.slice(0, 3).map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
      const contrast = (a, b) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
      const background = element => { for (let el = element; el; el = el.parentElement) { const value = color(getComputedStyle(el).backgroundColor); if (value[3] === 255) return value; } return color(getComputedStyle(document.body).backgroundColor); };
      const visible = element => {
        const r = element.getBoundingClientRect(), style = getComputedStyle(element);
        if (!r.width || !r.height || style.visibility === 'hidden' || r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth) return false;
        for (let p = element.parentElement; p; p = p.parentElement) { const s = getComputedStyle(p); if (/auto|scroll|hidden/.test(s.overflowY)) { const clip = p.getBoundingClientRect(); if (r.bottom <= clip.top || r.top >= clip.bottom) return false; } }
        return true;
      };
      const failures = [], ratios = [], controls = [];
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode, element = node.parentElement;
        if (!node.textContent.trim() || !visible(element)) continue;
        const style = getComputedStyle(element), ratio = contrast(color(style.color), background(element)); ratios.push(ratio);
        if (ratio < 4.5) failures.push({ kind: 'text', tag: element.tagName, className: element.className, ratio });
      }
      for (const element of root.querySelectorAll('button,input,select')) {
        if (!visible(element) || element.disabled) continue;
        const r = element.getBoundingClientRect(), style = getComputedStyle(element); controls.push({ width: r.width, height: r.height });
        if (r.width < 43.9 || r.height < 43.9) failures.push({ kind: 'target', id: element.id, className: element.className, width: r.width, height: r.height });
        if (element.matches('input') && parseFloat(style.borderTopWidth)) { const ratio = contrast(color(style.borderTopColor), background(element)); if (ratio < 3) failures.push({ kind: 'boundary', ratio }); }
        if (style.outlineStyle !== 'none' && parseFloat(style.outlineWidth)) { const ratio = contrast(color(style.outlineColor), background(element)); if (ratio < 3) failures.push({ kind: 'focus', ratio }); }
      }
      return { textPairs: ratios.length, minimumTextContrast: Math.min(...ratios), controls: controls.length, failures };
    });
    if (report.failures.length) throw new Error(JSON.stringify({ mode, ...report }));
    profiles.push({ mode, ...report });
    await page.screenshot({ path: `output/playwright/sidebar-focus-${mode}.png` });
  }
  await page.setViewportSize({ width: 800, height: 600 });
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; }); await page.waitForTimeout(250);
  const zoom = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth, popupWidth: document.querySelector('#notes-panel').getBoundingClientRect().width }));
  if (zoom.overflow) throw new Error('Text zoom introduced horizontal overflow');
  await page.locator('#search').focus();
  await page.locator('#note-list [data-note]').first().focus();
  const zoomAccess = await page.locator('#note-list [data-note]').first().evaluate(el => {
    const r=el.getBoundingClientRect(), parent=document.querySelector('#notes-panel').getBoundingClientRect();
    return r.top>=parent.top-1 && r.bottom<=parent.bottom+1 && r.right<=parent.right+1;
  });
  if (!zoomAccess) throw new Error('Text zoom made the note directory unreachable');
  zoom.noteDirectoryReachable = zoomAccess;
  await page.screenshot({ path: 'output/playwright/sidebar-200-percent-text.png' });
  await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
  const customHover = [];
  for (const mode of ['light','dark']) {
    await page.locator('#appearance-toggle').click(); await page.locator('#appearance-mode').selectOption(mode);
    const previousAccent = await page.locator('#appearance-accent').inputValue();
    for (const accent of ['#000000','#ffffff','#777777']) {
      await page.locator('#appearance-accent').fill(accent); await page.keyboard.press('Escape'); await page.locator('#new-note').hover();
      const ratio = await page.locator('#new-note').evaluate(element => {
        const style = getComputedStyle(element), channels = value => value.match(/[\d.]+/g).slice(0,3).map(Number);
        const luminance = value => channels(value).map(c => { c /= 255; return c <= .04045 ? c / 12.92 : ((c+.055)/1.055)**2.4; }).reduce((sum,c,i) => sum+c*[.2126,.7152,.0722][i],0);
        if (style.filter !== 'none') throw new Error('Hover color filter must not change the checked foreground');
        const a=luminance(style.color),b=luminance(style.backgroundColor); return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
      });
      if (ratio < 4.5) throw new Error('Custom-accent hover contrast failed');
      await page.locator('#new-note').focus(); await page.keyboard.press('ArrowRight');
      const focusRatio = await page.locator('#new-note').evaluate(element => {
        const style=getComputedStyle(element), luminance=value=>value.match(/[\d.]+/g).slice(0,3).map(Number).map(c=>{c/=255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4}).reduce((s,c,i)=>s+c*[.2126,.7152,.0722][i],0);
        if (!element.matches(':focus-visible') || style.outlineStyle==='none') throw new Error('Keyboard focus indicator missing');
        const a=luminance(style.outlineColor),b=luminance(style.backgroundColor);return(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
      });
      if (focusRatio < 3) throw new Error('Custom-accent focus contrast failed');
      customHover.push({mode,accent,ratio,focusRatio}); await page.locator('#appearance-toggle').click();
    }
    await page.locator('#appearance-accent').fill(previousAccent); await page.keyboard.press('Escape');
  }
  return { passed: true, syntheticOnly: true, native, profiles, textZoom200Percent: zoom, customHover };
}
