# Local semantic discovery

This milestone implements opt-in local embeddings and ANN retrieval in Rust. It remains **experimental**: the inexpensive-laptop acceptance and human-reviewed relevance gate have not been completed. Agent-authored cases in `experiments/semantic-evaluation.json` are explicitly pending human review and are not evidence of that gate passing.

## Model and network boundary

The bundled inference code is FastEmbed 7.5.0 using ONNX Runtime, CPU inference, mean pooling and a dynamic-int8 all-MiniLM-L6-v2 model. Output vectors have 384 dimensions. The runtime is linked into the native executable during the build; inference does not download a runtime or import Python. Hugging Face's automatic model-download feature is disabled in the inference dependency. Only the explicit model-install command performs networking.

The model pack is pinned to `Xenova/all-MiniLM-L6-v2`, revision `751bff37182d3f1213fa05d7196b954e230abad9`. Downloads use `https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/<revision>/<file>`. Each file must have its exact expected size and SHA-256 before an atomic local replacement. An offline pack is a folder containing these same files and passes the same checks. No note text, vector, query or telemetry is included in these requests. The download host still receives normal connection metadata such as the IP address.

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `onnx/model_quantized.onnx` | 22,972,370 | `afdb6f1a0e45b715d0bb9b11772f032c399babd23bfc31fed1c170afc848bdb1` |
| `tokenizer.json` | 711,661 | `da0e79933b9ed51798a3ae27893d3c5fa4a201126cef75586296df9b4d2c62a0` |
| `config.json` | 650 | `7135149f7cffa1a573466c6e4d8423ed73b62fd2332c575bf738a0d033f70df7` |
| `special_tokens_map.json` | 125 | `b6d346be366a7d1d48332dbc9fdf3bf8960b5d879522b7799ddba59e76237ee3` |
| `tokenizer_config.json` | 366 | `9261e7d79b44c8195c1cada2b453e55b00aeb81e907a6664974b4d7776172ab3` |

Total pack size is 23,685,172 bytes, excluding the native runtime already included in the executable. Corrupt and incomplete packs cannot load. Model files are retained when private semantic caches are removed; they contain public weights, not authored note data. Re-enabling processing can recreate embeddings from note files.

## Scheduling and persistence

The semantic worker owns its own SQLite connection, inference instance and ANN indexes. It does not use the ordinary note-store mutex. One inference thread and batches of at most four chunks run after two seconds without typing. Battery power, explicit pause and disabled settings prevent new batches. The open note is prioritized. A periodic metadata reconciliation preserves pending work rather than replacing its queue, so large initial collections cannot starve. Deleted-note bindings are pruned in bounded batches.

Title and authored text are extracted in logical order, ignoring URLs, style, geometry, animation and asset bytes. Tokenizer windows use at most 240 content tokens with a 32-token overlap. Tokenizer truncation is disabled while splitting; long notes are not truncated to the model's first window. Identical chunks reuse embeddings. Model/extraction version and exact text fingerprints determine cache validity. Presentation changes do not require re-embedding.

The derived `semantic/vectors.sqlite3` stores vectors, content fingerprints and current note-to-chunk bindings. USearch 2.26.6 uses cosine distance and float16 vectors. A read-only memory-mapped base index is combined with a mutable delta, compacted after 4,096 new vectors. Generation-specific files avoid overwriting a mapping on Windows. Checkpoint hashes are streamed through a 64 KiB buffer. On restart, a validated checkpoint is mapped and newer cached vectors replayed into the delta; a damaged checkpoint is rebuilt from the vector database. Missing/corrupt vectors can be regenerated from notes. None of this data is authoritative for manual connections.

Queries use an aggregate vector and up to eight distributed chunk vectors, with deduplicated ANN keys and batched binding lookup. Live-key counts filter stale graph entries. Current fingerprints and existing local files filter changed or removed candidates. Service calls immediately return previous cached results and coalesce a background refresh, so an in-progress long-note embedding never makes the UI wait for inference. Changed results increment a generation for UI refresh.

## Verification and remaining limits

Unit coverage includes text-only extraction, bounded raster-independent input, invalid model packs, mmap ANN serialization, battery/typing scheduling, queue progress across repeated rescans, and immediate cached responses with disable clearing. A separate ignored integration test, run explicitly with `NOTED_MODEL_PACK`, has passed real offline inference, paraphrase retrieval, long-note token windows, cache reuse and mapped checkpoint queries. It must not be replaced with a fake deterministic vector generator.

The release example `semantic_benchmark` generates a new disposable note workspace and runs actual inference. It reports at 500, 5,000 and 50,000 notes, including actual word count, unique chunks, indexing duration, related-query p95, process private memory, cache/index bytes, and recall@20 against exact search. `NOTED_BENCH_LONG_WORDS` adds a separate long-note workload. Synthetic note counts do not imply realistic average note length. Initial indexing throughput in the example does not include the desktop worker's responsiveness pauses.

The 512 MiB memory target and latency targets require measurement on the agreed 8 GB reference hardware. Current benchmark memory describes the isolated Rust example, not the full Tauri/WebView process tree. Full checkpoint construction temporarily allocates another ANN index; its peak and pause duration at very large chunk counts remain important limits. Long-lived image/editor memory is outside this worker's measurements. A process interruption is recoverable through database/checkpoint replay; this is not a universal power-loss guarantee.

## Development-machine observations

The release example is running actual quantized model inference against synthetic short notes. These are isolated Rust measurements with no CPU throttling, not the 8 GB reference laptop or the Tauri process tree. Twenty evenly distributed vector queries are checked against exact float32 dot-product neighbors for recall. Later lifecycle/cache-management fixes do not turn these samples into low-end acceptance evidence. The 50,000-note run and separate long-note results are recorded after they finish.

| Notes | Actual words | Unique chunks | Cumulative indexing seconds | Related query p95 ms | Recall@20 | Private memory MiB | Derived cache/index MiB |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 500 | 17,191 | 500 | 10.64 | 13.21 | 1.00 | 53.9 | 5.4 |
| 5,000 | 171,897 | 5,000 | 98.27 | 15.31 | 1.00 | 63.1 | 19.8 |

The corpus averages about 34 words per note; it does not represent 50,000 notes averaging 1,000 words. Cached model weights and note files are excluded from the derived cache/index column. The private-memory snapshot includes temporary vectors used for the exact-search comparison and is neither a peak nor a full-application measurement. Raw observations are in ignored `output/semantic-benchmark-real-50000/report.json`.

## Upstream sources and licenses

- [Original MiniLM model card](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2): Apache-2.0.
- [Pinned ONNX conversion repository](https://huggingface.co/Xenova/all-MiniLM-L6-v2/tree/751bff37182d3f1213fa05d7196b954e230abad9): Apache-2.0 model conversion.
- [FastEmbed source and license](https://github.com/Anush008/fastembed-rs): Apache-2.0.
- [ONNX Runtime license](https://github.com/microsoft/onnxruntime/blob/main/LICENSE): MIT.
- [USearch source and license](https://github.com/unum-cloud/USearch): Apache-2.0.

Keep upstream license texts and applicable notices with distributed model/runtime artifacts; the application does not replace those licenses.
