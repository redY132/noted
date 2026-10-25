//! Storage-only measurements, not UI FPS or low-end-hardware certification.
//! cargo run --release --no-default-features --example bench_store -- 10000
use noted_core::store::Store;
use std::time::Instant;

fn main() {
    let count: usize = std::env::args()
        .nth(1)
        .unwrap_or_else(|| "10000".into())
        .parse()
        .expect("note count");
    let directory = tempfile::tempdir().unwrap();
    let mut store = Store::open(directory.path()).unwrap();
    let start = Instant::now();
    let mut ids = Vec::new();
    for i in 0..count {
        let mut note = store
            .create_note(format!("Lecture {i} biology"), None)
            .unwrap();
        note.content = serde_json::json!({"type":"doc","content":[{"type":"paragraph","attrs":{"id":format!("p{i}")},"content":[{"type":"text","text":format!("Photosynthesis lecture {i}. {}", "Sample scientific notes with keywords. ".repeat(if i % 100 == 0 { 500 } else { 30 }))}]}]});
        ids.push(store.save_note(note, 1).unwrap().id);
    }
    println!("Generated {count} notes in {:?}", start.elapsed());
    let start = Instant::now();
    store.rebuild_index().unwrap();
    println!("Index rebuild: {:?}", start.elapsed());
    let mut opens = Vec::new();
    let mut searches = Vec::new();
    for i in 0..200 {
        let start = Instant::now();
        store.load_note(&ids[(i * 47) % ids.len()]).unwrap();
        opens.push(start.elapsed().as_secs_f64() * 1000.0);
        let start = Instant::now();
        store
            .search_notes(if i % 2 == 0 {
                "photosynth"
            } else {
                "biology scientific"
            })
            .unwrap();
        searches.push(start.elapsed().as_secs_f64() * 1000.0);
    }
    opens.sort_by(f64::total_cmp);
    searches.sort_by(f64::total_cmp);
    println!(
        "Warm file-open p95: {:.2} ms; FTS-search p95: {:.2} ms (200 each)",
        opens[189], searches[189]
    );
    println!("Disposable dataset; no user notes modified. Excludes frontend, IPC, cold-cache behavior, media, and full-process memory.");
}
