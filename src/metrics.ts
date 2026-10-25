/** Explicit developer measurement only. These are frame proxies, not hardware certification. */
export function installMetrics() {
  if (new URLSearchParams(location.search).get('measure') !== '1') return;
  const metrics = { inputToNextFrameMs: [] as number[], frameIntervalsMs: [] as number[], startedAt: performance.now(), durationMs: 20_000 };
  Object.assign(window, { __notedMetrics: metrics });
  document.addEventListener('beforeinput', event => {
    if (!(event.target as HTMLElement).closest('#editor')) return;
    const start = performance.now();
    requestAnimationFrame(() => { metrics.inputToNextFrameMs.push(performance.now() - start); if (metrics.inputToNextFrameMs.length > 2000) metrics.inputToNextFrameMs.shift(); });
  }, true);
  let previous = performance.now();
  const frame = (time: number) => {
    metrics.frameIntervalsMs.push(time - previous); previous = time;
    if (time - metrics.startedAt < metrics.durationMs) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
