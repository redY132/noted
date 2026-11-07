# Reference hardware benchmark

## Current status

Physical inexpensive-hardware acceptance is **blocked**. The only available connected Windows machine is an AMD Ryzen 9 8945HS with 8 cores/16 logical processors and approximately 31.3 GiB RAM. No separate reference laptop has been identified or made available. The target CPU/RAM/storage/display and cold-start/memory budgets also remain unagreed in the specification.

A CPU-throttled browser or a VM on this PC does not establish behavior on a different CPU, GPU, memory capacity, storage device, display or power configuration. The tool can run an explicitly labeled sensitivity test; it never reports that as reference-hardware certification. No machine configuration, system power plan or personal workspace is changed.

## Portable kit

Build a kit after the release build:

```powershell
./scripts/Build-Portable.ps1
node --experimental-strip-types scripts/build-reference-kit.mjs
```

The generated `output/reference-kit-…` folder contains `Noted.exe`, checksummed disposable fixtures, a benchmark component definition, `Measure-Noted.ps1`, the workload script and instructions. It excludes personal notes, model weights, caches, credentials and device approvals. Its manifest records the source commit, whether source changes were present and SHA-256 hashes of the actual executable/fixture/scripts.

Kit creation requires a clean committed source tree and a verified portable release for that exact commit. The executable must match the release's measured SHA-256. The runner passes its freshly created workspace to the workload script; a native status check requires that exact path and disabled local/hosted sharing before navigation or editing begins. Workloads use Open note rather than depending on sidebar visibility. The kit still does not certify a machine or model physical input latency.

Synthetic runs explicitly disable the subscription runner, isolate Codex home
and local application data, and remove API credentials from the child process.
This prevents a mistaken UI test from reaching the signed-in model client.
See the [November 7 investigation](memory-investigation-2026-11-07.md) for the
process-local safety fuse and controlled attached/detached resource checks.

On the actual test laptop, install Node.js 24+, WebView2 and `@playwright/cli` 0.1.22. Once those prerequisites are installed, the kit does not need network access. Run:

```powershell
.\Measure-Noted.ps1 -Minutes 5
```

Add `-CheckMediaLifetime` for a separate forced-GC media diagnostic after the
timed workload. It checks repeated local-image navigation, retained DOM/listener
counts, distant image loading and GIF pause/resume. Its results are separate
from the input timing and sampled-memory interval. Completed benchmark evidence
is saved before this optional diagnostic, even if the diagnostic fails.

Pass `-PlaywrightCLI C:\path\to\playwright-cli.js` if needed. The runner verifies the kit hashes, creates a fresh workspace and WebView profile per run, refuses occupied test ports and closes only its own test window. It never downloads prerequisites automatically. Results and logs go under `runs/`.

For resource ownership without an attached automation session during the
workload:

```powershell
.\Measure-Noted.ps1 -ResourceOnly -ResourceCase full -ResourceSeconds 180 -CheckMediaLifetime
```

The full case cycles the generated corpus and saves, undoes and saves each edit.
Other cases are `text`, `images`, `mixed` and `components`. The driver disconnects
before the in-page loop, samples process roles through the requested workload
and idle period, then reads fixed counters and performs diagnostic GC. Optional
media checks happen afterward. `-ResourceDebuggerAttached` keeps automation
attached for an explicit comparison; it requires resource mode.
Resource mode does not accept CPU slowdown or report input latency. Its report
preserves completed samples if result collection or an optional check fails.
`allRequestedChecksPassed` means the workload and requested functional checks
completed, not that an agreed memory budget or reference device was certified.

Resource results also record Page Visibility API state changes and hidden time
over the workload and idle interval. These event-driven counters add no polling
timer. They identify browser-reported hidden periods; they do not establish
foreground focus, unobscured pixels, animation throughput or physical rendering.
Earlier reports without these counters cannot be given visibility evidence
retroactively.

Every native run disables the subscription runner, strips API credentials from
the child environment and uses empty client/config directories. The runner
copies only checksummed generated fixture payloads, rejecting unsafe paths and
links; it does not copy extra files from a fixture directory.

For a development sensitivity run only:

```powershell
.\Measure-Noted.ps1 -Minutes 5 -CpuSlowdown 4
```

## Measurements and limits

The runner records CPU, RAM, OS and battery status; process-launch-to-debug-endpoint and automated-editor-ready proxies; sampled process-tree private memory/working sets; writing/frame scheduling samples; browser Event Timing entries when available; four document workloads; eight visible animated components; optional longer-session cycling; and Worker teardown after leaving the component note.

Memory samples also separate the app, browser, renderer, GPU and utility roles to help investigate growth. The report stores only fixed role labels, process counts and byte totals; command lines and paths are not recorded.

Each writing workload runs three times before longer-session cycling. Current kits use the full writing area for those cases, plus a separate three-run ordinary-note case with Browse open; every result records the actual writing width and navigation state. This differs from earlier kits and is not a controlled before/after performance comparison. Components begin disabled and are enabled explicitly only in the disposable profile. The runner verifies one Worker for eight visible instances and zero after leaving the note. The corpus contains 100 paragraphs, 1,000 paragraphs, 100 text panels, mixed free media and eight interactive components. Local and hosted sharing must remain disabled throughout.

`beforeinput`-to-animation-frame is a scheduling proxy, not physical keyboard-to-paint. Browser Event Timing is quantized and excludes physical input delivery. Startup includes remote-debugging/automation overhead. Private-memory sampling is not a guaranteed peak; summed working sets double-count shared pages. The report always says **NOT CERTIFIED** until the actual hardware and physical input/cold-start acceptance have been reviewed.

## Development-machine kit verification

The kit's short validation run on November 3 used the connected Ryzen 9/31.3 GiB PC, release WebView2/Edge 156, 1280×900 CSS pixels and DPR 1. `-Minutes 0` ran the initial three repetitions without a longer-session claim.

| Workload | Median per-run input-to-frame p95 |
| --- | ---: |
| 100 paragraphs | 8.3 ms |
| 1,000 paragraphs | 9.9 ms |
| 100 panels | 8.1 ms |
| Mixed free media | 9.1 ms |
| Eight animated components | 8.0 ms |

The maximum sampled summed private memory was approximately **831.9 MiB**. Instrumented endpoint/editor readiness was approximately 2.2/5.1 seconds, including test instrumentation. These are observations on this PC, not a low-memory or normal cold-start pass. Eight components used one Worker, and leaving the note terminated it.

To finish hardware acceptance, provide the intended lower-cost Windows laptop or run the kit there and return `report.json` plus its actual specification. Agree the reference configuration and resource budgets, then measure physical key-to-paint and normal cold startup using an appropriate input/display capture method. Current-host timing below 50 ms does not resolve those gates.
## Algorithm-specific improvement, November 6

The [reading-order benchmark](reading-order-performance.md) records a verified linear replacement for repeated array insertion, with paired synthetic timings on this PC. It does not complete the real inexpensive-hardware gate or establish whole-app budgets.

## November 6 evening resource checks

Both runs used the connected Ryzen 9 8945HS / 31.29GiB PC, fresh generated notes and WebView profiles, and kits relocated into temporary paths containing spaces. Local and hosted sharing remained disabled. No model generation or private import was involved. Durations and instrumentation differ; these observations support further profiling.

| Source | Long-session duration | Cycles | Median per-run input-to-frame p95 range | Maximum sampled private memory |
| --- | ---: | ---: | ---: | ---: |
| `f6fa609` | 15 minutes | 160 | 7.6–13.1ms | 2,109.6MiB |
| `ad21771` | 8 minutes | 90 | 7.9–9.9ms | 1,421.9MiB |

Maximum per-run p95 was 17.8ms and 11.5ms respectively. Each run verified eight visible components using one worker and zero workers after leaving the note. The first run exposed process-memory growth. A deterministic component test then reproduced and fixed a late-animation callback rearming after unmount; a stale handle also cannot remove its replacement. Nine runtime tests and the full 278 frontend tests passed.

The follow-up still showed process-memory growth. Its role medians use 30–90 seconds for the initial window and the final minute for the last window:

| Role | Initial private MiB | Final private MiB |
| --- | ---: | ---: |
| App | 12.9 | 73.9 |
| Browser | 46.6 | 54.5 |
| Renderer | 382.6 | 850.1 |
| GPU | 260.6 | 309.8 |
| Utility | 19.6 | 22.3 |

The renderer accounts for most of the observed increase. A separate forced-GC diagnostic retained about 6.0/7.3/8.0MB of main JS heap after baseline/40 ordinary switches/40 component switches. This does not establish the cause of whole-process growth. Renderer/native allocations, decoded assets, caches and ordinary GC behavior need a dedicated fixture investigation. Include a fresh-corpus baseline with the debugger detached to separate instrumentation effects. No bounded-memory or inexpensive-device acceptance is claimed.

The completed-run metadata is in ignored `output/reference-initial-trial-state.json` and `output/reference-trial-state.json`; each identifies its local report. The transferable kit contains pristine generated fixtures and scripts, without trial profiles, runs or hardware reports. Its build source is `ad21771`.
