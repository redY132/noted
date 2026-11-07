# Renderer memory investigation, November 7

Redley authorized continuing beyond the earlier cutoff. The first goal is to
explain the repeated-navigation resource growth before changing application
behavior. Preserve the accepted dock and the private Logseq boundary. Use fresh
generated notes, separate WebView profiles and aggregate diagnostics only.

## Synthetic-runner isolation

`NOTED_DISABLE_SUBSCRIPTION_RUNNER` is a process-local safety fuse. Its presence,
even with an empty value, disables subscription account probes and generation.
The native start command checks it before loading a note or creating a request;
client preparation, service start and transmission also check it. It does not
change saved preferences, permissions, credentials or another process.

The reference runner sets that fuse, uses an empty `CODEX_HOME` and isolated
`LOCALAPPDATA`, removes API credentials from the child environment and copies no
agent companion. Those independent barriers also protect runs of an older GUI
that predates the fuse. The original environment is restored afterward.

An isolated child-process regression exercises the real environment switch
without changing the parent test environment. It checks account status, client
preparation, service creation and generation with a nonexistent executable;
all refuse before a process is launched. Browser-only AI simulations continue to
use local API stubs. A real model test requires separate explicit authorization.

## Investigation in progress

Baseline: the verified `ad21771` GUI and checksummed synthetic reference corpus.
Each comparison uses a fresh corpus and profile. A DOM-only loop opens notes
through the existing Open note dialog; the same loop runs with Playwright
connected and disconnected. It performs no typing, generation, schema changes
or component approval. This is a resource diagnostic, not an input-latency or
inexpensive-hardware acceptance test.

The text-only pair each completed 174 switches in approximately 75 seconds,
followed by idle time and a final diagnostic GC. Final renderer private memory
was 192.0 MiB attached and 119.2 MiB detached. Final main JavaScript heaps were
approximately 10.6 and 11.3 MiB. This makes instrumentation retention a useful
lead; it does not establish a stable memory ceiling.

The static image/panel pair retained hundreds of thousands of DOM nodes both
attached and detached. The detached case completed 186 switches and retained
approximately 156.4 MiB of main JavaScript heap after GC. A separate 54-switch
synthetic capture retained a path from the document's `MediaQueryMatcher`
through `HTMLImageElement::ViewportChangeListener`, a detached image and its
surrounding note tree. The native guard also passed in that actual Windows
webview: account status was disabled and a start command was refused before
looking up its nonexistent note.

The next controlled change removes the redundant native image lazy-loading
flag, retaining Noted's existing explicit intersection-based asset loading.
Repeat the detached workload before attributing the growth to that mechanism.

No private source database, assets or imported notes are read or changed. No
credentials or hosted connection are created.
