# Storage planning: 50,000 notes

Prepared 2026-10-25. This is a calculated planning scenario, not a measured 50,000-note workspace or an approved model/index choice. No actual user note collection was inspected. Decimal units: 1 KB = 1,000 bytes; 1 MB = 1,000,000 bytes; 1 GB = 1,000,000,000 bytes. Disk estimates do not establish RAM requirements or performance.

## Workload assumptions

- 50,000 notes; 1,000 words per note; 50 million words total.
- Roughly six UTF-8 bytes per word including spacing for the illustrative English text. Language, code, URLs, and emoji change this.
- Ten 100-word paragraphs per note, each split into five text runs; ten bold runs, five internal links, three tags, UUID block/note IDs, timestamps, folder ID, revision, and a presentation preset.
- For semantic sizing only, five non-overlapping passages per note, averaging 200 words: 250,000 embeddings at 384 dimensions. Real splitting must respect the selected model's tokenizer and input limit; 200 words is not guaranteed to fit a particular model. Boundary choices, short sections, and overlap can increase passage counts.
- One previous full revision per edited note, assumed approximately the size of the current revision. This matches the prototype's backup mechanism, not the sizes of freshly created empty-note backups.
- No images, audio, video, PDFs, attached files, or generated summaries.

## Synthetic serialization calculation

A JavaScript object matching the current canonical note shape was serialized with two-space JSON indentation, as used by the Rust store. Each of 50 text runs contained twenty repetitions of the five-letter ASCII word `notes`, with spaces; each paragraph had 100 words. The first five paragraphs had one internal-link run each, and every paragraph had one bold run. This calculation measures an invented formatting pattern, not an observed user average.

| Component | Bytes per sample note | Projection for 50,000 |
| --- | ---: | ---: |
| Text inside nodes | 5,990 | 299.50 MB |
| Top-level metadata and envelope | 408 | 20.40 MB |
| Document structure, formatting, references, and indentation | 7,591 | 379.55 MB |
| Complete pretty-printed JSON | 13,989 | 699.45 MB |
| Complete compact JSON alternative | 9,261 | 463.05 MB |

The metadata/envelope component is the size of the note serialized with `content: null`, less the four bytes for `null`. The structure component is total minus metadata/envelope minus text. Plain text with newline separators is 5,999 bytes. Whitespace from pretty printing accounts for 4,728 bytes per note, or 236.40 MB across the collection, and is already included in the structure row. More fragmented formatting increases structural overhead; simpler paragraphs reduce it. Compact JSON is an illustration, not an approved format change.

## Complete illustrative disk budget

Rounded figures below combine calculated sizes with explicitly unmeasured engineering allowances. The allowances are not confidence intervals or bounds. Actual database layouts, vocabulary distributions, model packaging, and ANN implementation can fall outside them.

| Component | 50,000-note budget | Basis |
| --- | ---: | --- |
| Canonical note files | 700 MB | Synthetic serialization above |
| Previous complete revisions | 700 MB | Assumes every note has a similar-sized backup |
| Searchable text copy in existing FTS table | 300 MB | Current non-contentless FTS stores body text, plus small title/tag/ID fields not separately budgeted here |
| FTS term/posting structures | 150–400 MB | Unmeasured allowance of 3–8 bytes per indexed word; vocabulary and positions strongly affect actual size |
| SQLite summaries, planned tag/link lookup tables, and their indexes | 50–100 MB | Unmeasured allowance of 1–2 KB per note, including five links and three tags per note |
| 384-dimensional float32 passage vectors | 384 MB | 250,000 × 384 × 4 bytes |
| ANN graph/administrative data | 40–80 MB | Unmeasured allowance of 160–320 bytes per passage; roughly a modest HNSW configuration, implementation-dependent |
| Passage-to-note mappings, offsets, fingerprints, and versions | 16–32 MB | Unmeasured allowance of 64–128 bytes per passage; extra indexes may exceed this |
| Example embedding model weights | 91 MB | One all-MiniLM-L6-v2 safetensors artifact is listed as 90.9 MB; model is not selected |
| Small ranking model and bounded feedback data | Up to 1 MB | Proposed allowance, not a measured model; unlimited feedback history would grow |

With the full 1 MB ranking allowance, this rounded scenario totals **2.43–2.79 GB**. Replacing only the vector values with int8 values reduces their payload to **96 MB**, giving **2.14–2.50 GB**, plus quantization-specific data. These figures retain the same model-weight allowance: quantizing embeddings and quantizing model weights are independent choices. Keeping full-precision vectors alongside int8 vectors eliminates that storage saving. Compression requires quality validation.

The additional semantic subsystem is about **532–588 MB** with float32 vectors or **244–300 MB** with int8 vectors under these allowances. Manual links themselves do not require embeddings or an ANN graph; canonical references are in note files and the link lookup allowance is separate. HNSW graph edges are internal search structures, not user-visible note links.

Totals exclude filesystem allocation slack/metadata, SQLite WAL and free pages, temporary writes/rebuilds, duplicate model versions, tokenizer/runtime/app binaries, and attachments. For a filesystem with 4 KiB allocation units, up to just under 4 KiB per nonempty file can be allocation slack; 100,000 note/backup files can therefore add a material amount. Atomic writes and index migrations also need transient headroom.

## Sensitivity to note length

Assume every note has the stated length, 200-word passages without overlap, and round the passage count up separately per note. For a real distribution, sum per-note counts; rounding the average can underestimate storage.

| Words per note | Total words | Raw text at six bytes/word | Passages | Float32 vectors | Int8 vectors |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 250 | 12.5 million | 75 MB | 100,000 | 153.6 MB | 38.4 MB |
| 1,000 | 50 million | 300 MB | 250,000 | 384 MB | 96 MB |
| 5,000 | 250 million | 1,500 MB | 1,250,000 | 1,920 MB | 480 MB |

The earlier million-passage example assumed twenty passages per note. At 200 words per passage without overlap, that corresponds to about 4,000 words per note. It is a heavier workload than the main scenario here, not a contradiction.

## What is inherent and what can change

- A cached embedding approach needs numerical representations, but passage granularity, dimension, precision, and index choice determine their size. Recomputing instead of caching trades storage for repeated compute.
- HNSW requires graph storage; other retrieval methods have different overhead. A semantic model is stored once per installed version, not once per note.
- The prototype's JSON whitespace, duplicate searchable text, and full previous revisions are independent of semantic search. Optimizing them has separate readability, search-feature, and recovery tradeoffs.
- Disk storage need not all be resident in RAM. Index caching and disk-backed designs trade memory against latency; peak memory also includes inference buffers, loaded model weights, the editor, and the WebView.
- Before selecting a design, measure actual bytes by component on representative notes, including vocabulary diversity, rich formatting, edits/deletes, tokenizer-aware passages, and attachments. Do not interpret this budget as low-end hardware validation.

## Sources

- [SQLite FTS5 storage options](https://www.sqlite.org/fts5.html): content storage, external/contentless tables, and detail tradeoffs.
- [Faiss index storage formulas](https://github.com/facebookresearch/faiss/wiki/Faiss-indexes): float32 payloads, quantized representations, and HNSW overhead.
- [Example embedding model files](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2/tree/main): one weight artifact is 90.9 MB; the repository contains alternative formats that need not all be installed.
- [Example model card](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2): 384 dimensions and input-length constraints; this is a sizing reference, not model selection.
