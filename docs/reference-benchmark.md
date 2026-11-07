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

On the actual test laptop, install Node.js 24+, WebView2 and `@playwright/cli` 0.1.22. Once those prerequisites are installed, the kit does not need network access. Run:

```powershell
.\Measure-Noted.ps1 -Minutes 5
```

Pass `-PlaywrightCLI C:\path\to\playwright-cli.js` if needed. The runner verifies the kit hashes, creates a fresh workspace and WebView profile per run, refuses occupied test ports and closes only its own test window. It never downloads prerequisites automatically. Results and logs go under `runs/`.

For a development sensitivity run only:

```powershell
.\Measure-Noted.ps1 -Minutes 5 -CpuSlowdown 4
```

## Measurements and limits

The runner records CPU, RAM, OS and battery status; process-launch-to-debug-endpoint and automated-editor-ready proxies; sampled process-tree private memory/working sets; writing/frame scheduling samples; browser Event Timing entries when available; four document workloads; eight visible animated components; optional longer-session cycling; and Worker teardown after leaving the component note.

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
