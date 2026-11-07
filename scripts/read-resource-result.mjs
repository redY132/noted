const [endpointText, expected] = process.argv.slice(2), endpoint = new URL(endpointText);
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
  const beforeGC = { heap: await send('Runtime.getHeapUsage'), dom: await send('Memory.getDOMCounters') };
  await send('HeapProfiler.collectGarbage'); await send('HeapProfiler.collectGarbage');
  const afterGC = { heap: await send('Runtime.getHeapUsage'), dom: await send('Memory.getDOMCounters') };
  console.log(JSON.stringify({ resource: raw.result.value ?? null, beforeGC, afterGC, resultCollection: { debuggerDomainEnabled: false, forcedGCAfterSampling: true } }));
} finally { clearTimeout(timeout); socket.close(); }
