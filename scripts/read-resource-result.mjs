const [endpointText, expected, mode] = process.argv.slice(2), endpoint = new URL(endpointText);
if (endpoint.protocol !== 'http:' || endpoint.hostname !== '127.0.0.1' || !expected) throw new Error('LOOPBACK_FIXTURE_REQUIRED');
const response = await fetch(new URL('/json/list', endpoint), { signal: AbortSignal.timeout(10000), redirect: 'error' });
if (!response.ok) throw new Error('FIXTURE_ENDPOINT_FAILED');
const pages = await response.json(), target = pages.find(page => page.type === 'page');
if (!target) throw new Error('FIXTURE_PAGE_MISSING');
if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(target.webSocketDebuggerUrl).hostname)) throw new Error('LOOPBACK_DEBUGGER_REQUIRED');
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => { reject(new Error('RESOURCE_CONNECTION_TIMEOUT')); socket.close(); }, 10000);
  socket.onopen = () => { clearTimeout(timer); resolve(); };
  socket.onerror = () => { clearTimeout(timer); reject(new Error('RESOURCE_CONNECTION_FAILED')); };
});
let id = 0; const pending = new Map();
socket.onmessage = event => { const message = JSON.parse(event.data); if (!message.id) return; const item = pending.get(message.id); if (!item) return; pending.delete(message.id); if (message.error) item.reject(new Error('RESOURCE_PROTOCOL_FAILED')); else item.resolve(message.result); };
socket.onclose = () => { for (const item of pending.values()) item.reject(new Error('RESOURCE_CONNECTION_CLOSED')); pending.clear(); };
const send = (method, params = {}) => new Promise((resolve, reject) => { pending.set(++id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
const timeout = setTimeout(() => { for (const item of pending.values()) item.reject(new Error('RESOURCE_COLLECTION_TIMEOUT')); socket.close(); }, 30000);
const normalize = value => { let text = value.replaceAll('\\', '/'); if (text.startsWith('//?/')) text = text.slice(4); return text.replace(/\/+$/, '').toLowerCase(); };
try {
  const checked = await send('Runtime.evaluate', { expression: `(async()=>{const normalize=${normalize.toString()};const s=await window.__TAURI_INTERNALS__.invoke('workspace_status');const p=await window.__TAURI_INTERNALS__.invoke('agent_access');const r=await window.__TAURI_INTERNALS__.invoke('subscription_status');return normalize(s.path)===${JSON.stringify(normalize(expected))}&&!p.enabled&&!p.allowHosted&&!p.folderIds.length&&!r.available&&r.authentication==='disabled';})()`, awaitPromise: true, returnByValue: true });
  if (checked.result.value !== true) throw new Error('EXACT_DISABLED_FIXTURE_REQUIRED');
  const raw = await send('Runtime.evaluate', { expression: 'window.notedResourceResult', returnByValue: true });
  if(mode==='--checkpoint' && raw.result.value?.phase==='ui'){
    await send('Runtime.evaluate',{expression:`(()=>{document.querySelector('#appearance-toggle').click();const select=document.querySelector('#appearance-mode');select.value=(window.notedResourceResult.uiChecks??0)%2?'light':'dark';select.dispatchEvent(new Event('change',{bubbles:true}));document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));})()`});
    await send('Emulation.setDeviceMetricsOverride',{width:800,height:360,deviceScaleFactor:1,mobile:false});
    await send('Runtime.evaluate',{expression:`(async()=>{document.dispatchEvent(new KeyboardEvent('keydown',{key:'f',ctrlKey:true,bubbles:true}));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));})()`,awaitPromise:true});
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9,modifiers:8});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9,modifiers:8});
    const checked=await send('Runtime.evaluate',{expression:`(()=>{const q=document.querySelector('#find-query'),p=document.querySelector('#find-panel'),r=q.getBoundingClientRect(),b=p.getBoundingClientRect();return document.activeElement===q&&r.top>=b.top-.5&&r.bottom<=b.bottom+.5;})()`,returnByValue:true});
    if(checked.result.value!==true)throw new Error('SHORT_WINDOW_KEYBOARD_FAILED');
    await send('Runtime.evaluate',{expression:`document.querySelector('#find-close').click()`});
    await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
    await send('Runtime.evaluate',{expression:`window.notedResourceResult.uiChecks=(window.notedResourceResult.uiChecks??0)+1;window.notedResourceResult.phase='running'`});
    raw.result.value.phase='running';
  }
  if(mode==='--checkpoint' && raw.result.value?.phase!=='checkpoint'){console.log(JSON.stringify({phase:raw.result.value?.phase??'missing'}));process.exitCode=0;}
  else {
  const beforeGC = { heap: await send('Runtime.getHeapUsage'), dom: await send('Memory.getDOMCounters') };
  await send('HeapProfiler.collectGarbage'); await send('HeapProfiler.collectGarbage');
  const afterGC = { heap: await send('Runtime.getHeapUsage'), dom: await send('Memory.getDOMCounters') };
  if(mode==='--checkpoint')await send('Runtime.evaluate',{expression:"window.notedResourceResult.checkpoints.push(window.notedResourceResult.checkpoint.label);window.notedResourceResult.phase='running'",returnByValue:true});
  console.log(JSON.stringify({ resource: raw.result.value ?? null, beforeGC, afterGC, resultCollection: { debuggerDomainEnabled: false, forcedGCAfterSampling: true } }));
  }
} finally { clearTimeout(timeout); socket.close(); }
