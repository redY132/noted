# Bounded navigation resource diagnostic

The validated application remains `eafab90`; this change is test-harness-only.
Its GUI SHA-256 is
`429e420bc50d89ea0b78ca1984eb9d9413205ec02824ac36415d488158169fe5`.
The original checksummed reference kit was generated and verified before harness
changes. Diagnostic overlays have separate per-script SHA-256 values in their
manifest. The original kit and application were not rewritten. Local provenance
and aggregate results are in `output/navigation-soak-verification.json`.

## Protocol

On a matching checksummed kit containing these diagnostic scripts:

```powershell
.\Measure-Noted.ps1 -ResourceOnly -ResourceCase full -ResourceSeconds 900 -NavigationSoak -CheckMediaLifetime
```

The generated corpus and fresh WebView/client directories are mandatory. The
runner disables model execution, removes API credentials from its child process
environment, verifies exact workspace identity and requires disabled sharing.
It restores the original process environment afterward. No personal workspace,
model client, network link, source import or original asset is opened.

Six warmup cycles precede three blocks of twelve cycles. Each cycle opens the
ordinary, component, long, component, image, component, mixed and component
notes, saving and undoing its generated edit. It returns to ordinary text for
Browse/formatting toggles, repeated Find and web/local-link picker cancellation.
The opening counter counts workload open attempts, including an already-current
ordinary note after the preceding cycle's UI return; it is not an exact count
of destroyed editor instances.

Brief raw CDP sessions exercise actual Tab/Shift+Tab, Find at 800x360 in
alternating Light/Dark themes, and restore 1280x900. Playwright is detached during
the workload. Raw CDP control polls and settled checkpoints never enable the
Debugger domain; this is not an entirely uninstrumented run or physical input
latency measurement. Each settled checkpoint returns to ordinary text with
closed panes and waits twenty seconds. It rejects active component workers or
outstanding tracked image blob URLs. Only counters and URL strings are retained
by the instrumentation, not collections of DOM references. Same-note opening
is an application no-op, so the current ordinary editor remains current during
the checkpoint. Two diagnostic GCs and heap/DOM counters are collected only
then. Ordinary pre-GC process-memory samples are reported separately.

The workload has a fifteen-minute deadline and must complete 336 counted
openings, 336 restored edits, 42 native keyboard/viewport checks and four
checkpoints. Incomplete runs fail. Samples survive interruption; existing media
lifetime assertions remain unchanged and run afterward. The sampler queries
children of owned PIDs, retrieves role metadata only for verified descendants,
and records fixed roles, memory, CPU seconds and process counts. CPU seconds are
summed for currently alive processes, not lifetime tree CPU across exited PIDs.
Working-set sums may double-count shared pages; sampled peaks are not guaranteed
absolute peaks.

Run `scripts/Test-ResourceSampler.ps1` for the isolated sampler contract test.
Its inert process records verify scoped queries, cycle safety, aggregation and
exclusion of command lines without inspecting actual system processes.

## Completed result

The final fresh-profile run completed in 613.829 seconds. All workload checks,
42 native keyboard/short-window checks and ten unchanged media checks passed;
the owned app closed. Runner and sharing remained disabled. Page Visibility
reported no hidden interval; that does not establish unobscured rendering or
foreground focus.

| Settled checkpoint | Renderer private MiB, ordinary median | App private MiB, ordinary median | Main heap MiB, after GC | Nodes | Listeners |
| --- | ---: | ---: | ---: | ---: | ---: |
| Warm | 102.4 | 45.3 | 8.06 | 3,621 | 537 |
| Block 1 | 105.0 | 75.5 | 8.47 | 3,621 | 537 |
| Block 2 | 105.3 | 80.9 | 8.68 | 3,621 | 537 |
| Block 3 | 110.7 | 80.3 | 8.77 | 3,621 | 537 |

Each ordinary median has six or seven samples from the twenty seconds before
its checkpoint. All four settled worker/image-URL counts were zero. Peak sampled
process-tree private memory was 920.3 MiB. Overall settled totals fluctuated
between 464.5 and 671.9 MiB; the renderer is not the entire process tree.

Heap growth diminished after warmup and node/listener counts stayed constant;
app memory warmed and then levelled. This run did not reproduce unbounded
retention. It does not establish a permanent ceiling or product memory budget.
No heap-snapshot ownership investigation or concerning-trend repeat was needed.

A preliminary, separately hashed run completed 336 counted openings and ten
media checks but lacked real keyboard traversal/short-window exercise. It was
retained as preliminary evidence and superseded by this final coverage. The
preliminary result is not a controlled performance comparison with the final
protocol or with earlier dock-open runs.

No application build or full native-suite rerun was needed for these harness-only
changes: the measured executable is exactly the previously validated eafab90
GUI. No inexpensive-device certification, realistic photographic decode test,
longer endurance claim or deployment is implied. Actual reference hardware and
whole-app budgets remain separate gates.
