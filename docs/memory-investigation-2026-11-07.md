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

Removing the native lazy-loading flag did **not** release the trees. That
candidate is reverted. The failed experiment still completed 201 switches and
retained about 167.5 MiB of main heap after GC; a large optional snapshot exceeded
the capture tool's string-size limit. Subsequent captures are streamed and capped,
and memory reports are saved before optional snapshot work.

The corrected candidate fixes teardown order instead: clear playback/source state,
then detach the image itself from the abandoned node view. A targeted lifecycle
test failed before that change and passed afterward. All 279 frontend tests pass.

The completed detached 75-second comparison after that correction made 196
switches and retained approximately 96.9 MiB renderer private memory, 9.5 MiB main
heap and 6,924 DOM nodes after GC. The earlier detached run made 186 switches and
retained approximately 506.9 MiB renderer private memory, 156.4 MiB main heap and
332,696 DOM nodes. This is the same fresh-fixture protocol with actual counts
reported; it is not a physical-input performance comparison.

A separate instrumented UI check has one warm retained media tree: DOM nodes
were 7,654 / 7,662 / 7,673 after 4 / 8 / 12 visits, with 850 listeners at all
three checkpoints. The regression therefore bounds both the absolute warm-tree
allowance and growth after warmup. Zero retained objects is not claimed.

The native media regression passed ten checks, including distant PNG loading,
GIF static-poster pause and local-source resume, zero leftover workers and
unchanged disabled sharing. Its first scroll check incorrectly targeted the
unloaded, hidden image; it now targets the visible figure placeholder. Final
captures also wait for the Open note closing transition. Screenshots show only
generated fixtures. A longer full workload remains pending.

Run the reusable check with `Measure-Noted.ps1 -CheckMediaLifetime` from a newly
built matching reference kit. It is a separate forced-GC diagnostic, with an
explicit bounded warm-up allowance, and does not certify a physical device.

One native attempt was interrupted before writing a report and was excluded;
the app was verified stopped before retry. Completed diagnostic results are
distinguished from interrupted attempts and from optional capture-tool failures.

The inference is consistent with Chromium's image-source selection/removal
logic: source mutation can add a viewport listener, while removal clears it.
The snapshot proves the retained path on this runtime; the implementation link
is supporting context, not a claim that every Chromium version behaves alike.
See [Chromium HTMLImageElement](https://raw.githubusercontent.com/chromium/chromium/main/third_party/blink/renderer/core/html/html_image_element.cc).

No private source database, assets or imported notes are read or changed. No
credentials or hosted connection are created.
