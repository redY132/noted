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
generated fixtures.

Run the reusable check with `Measure-Noted.ps1 -CheckMediaLifetime` from a newly
built matching reference kit. It is a separate forced-GC diagnostic, with an
explicit bounded warm-up allowance, and does not certify a physical device.

## Full workload follow-up

The matching `d568c81` package/kit completed the eight-minute writing, media and
component workload: 88 long-session cycles and 194 timed runs. The subscription
runner was disabled, eight visible components used one worker, and no component
worker remained after returning to ordinary text. Sampled total private memory
peaked around 1,201.0 MiB. Renderer minute medians still rose from about 302.9 MiB
to 569.9 MiB. The large image-tree retention is fixed; overall process-memory
stability remains **unresolved**.

The optional media diagnostic then failed on another unloaded-image scroll
target, this time in its initial warm-up loop after timed typing had pushed the
first image below the viewport. That loop now scrolls the figure placeholder as
well. Completed workload evidence was preserved before the diagnostic; this is
not an overall passing run. A later native full-corpus control completed all ten
corrected media checks; a newly packaged matching-kit run remains separate.

The controls below separate component churn, stable edits and instrumentation.
These observations are from the connected development PC only, with
ordinary background development work; no inexpensive-device or controlled
before/after latency acceptance is claimed.

The three-minute component-only pair completed 524 switches / 263 created
workers detached and 512 switches / 257 workers attached. Both ended with zero
active workers. After idle time and diagnostic GC, renderer private memory was
about 90.0 / 122.2 MiB and main heap about 8.7 / 8.0 MiB respectively. Worker
churn alone did not reproduce the large retained-memory rise.

The three-minute full-corpus control alternated text, long text, images, mixed
media and eight components. Each generated edit was saved, undone and saved
again, keeping the document size and component visibility stable. With the
debugger disconnected it completed 129 switches and 129 edit/restore pairs;
65 workers were created and none remained. Renderer minute medians were about
226.8 / 278.3 / 276.5 MiB, and renderer private memory after idle/diagnostic GC
was 111.7 MiB. Main JS heap was about 8.8 MiB; sampled total private memory
peaked around 934.2 MiB. This is a resource-ownership control, not a physical
input or controlled hardware acceptance measurement.

The attached counterpart completed 132 switches and edit/restore pairs,
created 67 workers and ended with zero. After two GCs renderer private memory
was 310.5 MiB; a repeated attached idle/GC control was 310.1 MiB. In that same
process, disconnecting and then collecting garbage through a raw CDP client
that never enabled the Debugger domain reduced it to 105.9 MiB (about 8.1 MiB
main JS heap). Disconnect alone, before GC, was 310.5 MiB. This demonstrates
roughly 205 MiB of automation-associated retention in this control. It does
not identify a particular inspector cache or establish whole-app budgets.

The timing workload now also undoes and saves its generated input after each
timed sample, and verifies that all eight components are visible. Earlier
timings that repeatedly grew the first paragraph use a different protocol and
are not a controlled comparison. A failed accumulating-input control is
excluded. Completed native media checks confirm the corrected figure targets.

`Measure-Noted.ps1 -ResourceOnly` separates sampled resource ownership from
input timing: a generated in-page loop runs with the automation session
disconnected. Result collection and forced GC happen after sampling. The
optional `-ResourceDebuggerAttached` switch is a diagnostic comparison only;
neither mode certifies hardware or physical input latency.

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
