//! cargo run --release --no-default-features --example connections_benchmark -- 500 1000
//! Fixtures and results live under output/, never a user's workspace.
use noted_core::store::Store;
use serde_json::json;
use std::{fs, time::Instant};
fn main() {
    let args = std::env::args().collect::<Vec<_>>();
    let count: usize = args.get(1).and_then(|s| s.parse().ok()).unwrap_or(500);
    let words: usize = args.get(2).and_then(|s| s.parse().ok()).unwrap_or(1000);
    assert!((1..=50000).contains(&count));
    assert!((1..=10000).contains(&words));
    let root = std::env::current_dir()
        .unwrap()
        .join("output")
        .join(format!(
            "connection-bench-{}-{}-{}",
            count,
            words,
            std::process::id()
        ));
    fs::create_dir_all(root.join("notes")).unwrap();
    let text = (0..words)
        .map(|i| format!("topic{}", i % 50))
        .collect::<Vec<_>>()
        .join(" ");
    for i in 0..count {
        let id = format!("00000000-0000-4000-8000-{i:012x}");
        let note = json!({"formatVersion":1,"id":id,"title":format!("Study topic{} note {i}",i%50),"folderId":null,"tags":[format!("topic{}",i%50)],"revision":1,"createdAt":"2026-10-29T00:00:00Z","updatedAt":"2026-10-29T00:00:00Z","presentation":{"schemaId":"default"},"content":{"type":"doc","content":[{"type":"paragraph","attrs":{"id":format!("p{i}")},"content":[{"type":"text","text":text}]}]}});
        fs::write(
            root.join("notes").join(format!("{id}.json")),
            serde_json::to_vec(&note).unwrap(),
        )
        .unwrap();
    }
    let start = Instant::now();
    let mut store = Store::open(&root).unwrap();
    let initial_index_ms = start.elapsed().as_secs_f64() * 1000.;
    drop(store);
    let start = Instant::now();
    store = Store::open_cached(&root).unwrap();
    let startup_ms = start.elapsed().as_secs_f64() * 1000.;
    let id = "00000000-0000-4000-8000-000000000000";
    let mut picker = Vec::new();
    let mut related = Vec::new();
    for _ in 0..30 {
        let t = Instant::now();
        store.picker_notes(id, "topic1", 0, 40).unwrap();
        picker.push(t.elapsed().as_secs_f64() * 1000.);
        let t = Instant::now();
        store.related_notes(id, 0, 8).unwrap();
        related.push(t.elapsed().as_secs_f64() * 1000.);
    }
    picker.sort_by(f64::total_cmp);
    related.sort_by(f64::total_cmp);
    let mut note = store.load_note(id).unwrap();
    note.title = "Updated study".into();
    let t = Instant::now();
    store.save_note(note, 1).unwrap();
    let incremental_ms = t.elapsed().as_secs_f64() * 1000.;
    let disk_bytes = fs::read_dir(&root)
        .unwrap()
        .filter_map(|e| e.ok())
        .filter_map(|e| e.metadata().ok())
        .filter(|m| m.is_file())
        .map(|m| m.len())
        .sum::<u64>();
    let result = json!({"notes":count,"wordsPerNote":words,"totalWords":count*words,"initialIndexMs":initial_index_ms,"cachedStartupMs":startup_ms,"pickerP95Ms":picker[28],"relatedP95Ms":related[28],"incrementalSaveMs":incremental_ms,"databaseDiskBytes":disk_bytes,"workspace":root,"limitations":["Synthetic repeated vocabulary; not semantic usefulness evaluation","Development machine; not 8GB reference hardware","No semantic inference or ANN included","Cache warm; 30 retrieval samples"]});
    println!("{}", serde_json::to_string_pretty(&result).unwrap());
    fs::write(
        root.join("results.json"),
        serde_json::to_vec_pretty(&result).unwrap(),
    )
    .unwrap();
}
