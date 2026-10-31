//! cargo run --release --no-default-features --example connections_graph_benchmark
//! Optional arguments select sizes, e.g. -- 500 5000 50000.
//! All synthetic workspaces and measurements stay in ignored output/.
use noted_core::{relations, store::Store};
use rusqlite::params;
use serde_json::json;
use std::{fs, path::Path, time::Instant};

fn id(i: usize) -> String {
    format!("00000000-0000-4000-8000-{i:012x}")
}
fn measure(mut operation: impl FnMut()) -> serde_json::Value {
    let mut samples = Vec::new();
    for _ in 0..20 {
        let t = Instant::now();
        operation();
        samples.push(t.elapsed().as_secs_f64() * 1000.0);
    }
    samples.sort_by(f64::total_cmp);
    json!({"p50Ms":samples[9],"p95Ms":samples[18],"maxMs":samples[19],"samples":20})
}
fn run(base: &Path, count: usize, reuse: bool) -> serde_json::Value {
    let root = base.join(format!("notes-{count}"));
    fs::create_dir_all(root.join("notes")).unwrap();
    let long = (0..8192)
        .map(|i| format!("forest{} canopy habitat ecology", i % 50))
        .collect::<Vec<_>>()
        .join(" ");
    let short = (0..40)
        .map(|i| format!("topic{}", i % 50))
        .collect::<Vec<_>>()
        .join(" ");
    let setup = Instant::now();
    if !reuse {
        for i in 0..count {
            let note = json!({"formatVersion":1,"id":id(i),"title":format!("Study topic{} note {i}",i%50),"folderId":null,"tags":[format!("topic{}",i%50)],"revision":1,"createdAt":"2026-10-30T00:00:00Z","updatedAt":"2026-10-30T00:00:00Z","presentation":{"schemaId":"default"},"content":{"type":"doc","content":[{"type":"paragraph","attrs":{"id":format!("p{i}")},"content":[{"type":"text","text":if i%100==0 {&long}else{&short}}]}]}});
            fs::write(
                root.join("notes").join(format!("{}.json", id(i))),
                serde_json::to_vec(&note).unwrap(),
            )
            .unwrap();
        }
        // Seed authored fixture edges transactionally, then use only public APIs for measurements.
        let mut db = relations::open(&root).unwrap();
        let tx = db.transaction().unwrap();
        {
            let mut insert=tx.prepare("INSERT OR IGNORE INTO pairs(a,b,connected,dismissed,revision,strength) VALUES(?1,?2,1,0,1,?3)").unwrap();
            for i in 1..count {
                insert
                    .execute(params![id(0), id(i), (i % 5 + 1) as u8])
                    .unwrap();
            }
            for a in 1..60.min(count) {
                for b in a + 1..60.min(count) {
                    insert
                        .execute(params![id(a), id(b), ((a + b) % 5 + 1) as u8])
                        .unwrap();
                }
            }
        }
        tx.commit().unwrap();
        drop(db);
    }
    let fixture_ms = setup.elapsed().as_secs_f64() * 1000.0;
    let t = Instant::now();
    let initial_index_ms = if !reuse {
        let store = Store::open(&root).unwrap();
        let elapsed = t.elapsed().as_secs_f64() * 1000.0;
        drop(store);
        Some(elapsed)
    } else {
        None
    };
    let t = Instant::now();
    let mut store = Store::open_cached(&root).unwrap();
    let cached_startup_ms = t.elapsed().as_secs_f64() * 1000.0;
    let hub = id(0);
    let leaf = id(100.min(count - 1));
    let nodes = (0..60.min(count)).map(id).collect::<Vec<_>>();
    let list = measure(|| {
        let p = store.list_connections(&hub, 0, 40).unwrap();
        assert_eq!(p.items.len(), 40);
        assert_eq!(p.total, count - 1);
    });
    let edges = measure(|| {
        let e = store.connection_edges(nodes.clone()).unwrap();
        assert!(e.len() <= 180);
        assert!(e.windows(2).all(|w| w[0].strength >= w[1].strength));
    });
    let text = measure(|| {
        let p = store
            .search_connections(&hub, "topic1", true, 0, 40, vec![])
            .unwrap();
        assert!(p.items.len() <= 40);
    });
    let body = measure(|| {
        let p = store
            .search_connections(&hub, "canopy", true, 0, 40, vec![])
            .unwrap();
        assert!(p.items.len() <= 40);
    });
    let hybrid = measure(|| {
        let p = store
            .search_connections(
                &hub,
                "topic1",
                false,
                0,
                40,
                (1..120.min(count)).map(|i| (id(i), 0.8)).collect(),
            )
            .unwrap();
        assert!(p.items.len() <= 40);
    });
    let suggestions = measure(|| {
        store.related_notes(&leaf, 0, 8).unwrap();
    });
    let mutation = measure(|| {
        let old = store.pair(&hub, &leaf).unwrap();
        store
            .set_relation_strength(
                &hub,
                &leaf,
                None,
                None,
                Some(old.revision),
                Some(if old.strength == 5 { 4 } else { 5 }),
            )
            .unwrap();
    });
    let result = json!({"notes":count,"hubDegree":count-1,"longNotes":count.div_ceil(100),"longNoteWords":8192*4,"graphNodeCap":60,"graphEdgeCap":180,"fixtureMs":fixture_ms,"initialIndexMs":initial_index_ms,"cachedStartupMs":cached_startup_ms,"connectionsPage":list,"inducedEdges":edges,"connectedTextSearch":text,"connectedBodySearch":body,"workspaceHybridMerge":hybrid,"weightedSuggestions":suggestions,"strengthMutation":mutation,"workspace":root,"limitations":["Synthetic vocabulary, not semantic usefulness evaluation","Hybrid timing merges precomputed matches; excludes model inference","Warm filesystem and SQL cache; development hardware"]});
    fs::write(
        root.join("results.json"),
        serde_json::to_vec_pretty(&result).unwrap(),
    )
    .unwrap();
    result
}
fn main() {
    let sizes = std::env::args()
        .skip(1)
        .map(|s| s.parse::<usize>().unwrap())
        .collect::<Vec<_>>();
    let sizes = if sizes.is_empty() {
        vec![500, 5000, 50000]
    } else {
        sizes
    };
    let output = std::env::current_dir().unwrap().join("output");
    fs::create_dir_all(&output).unwrap();
    let reuse = std::env::var_os("NOTED_GRAPH_BENCH_REUSE");
    let base = if let Some(path) = &reuse {
        let path = std::path::PathBuf::from(path).canonicalize().unwrap();
        assert_eq!(path.parent().unwrap(), output.canonicalize().unwrap());
        assert!(path
            .file_name()
            .unwrap()
            .to_string_lossy()
            .starts_with("connections-graph-"));
        path
    } else {
        output.join(format!("connections-graph-{}", uuid::Uuid::new_v4()))
    };
    fs::create_dir_all(&base).unwrap();
    let mut results = Vec::new();
    for count in sizes {
        assert!((500..=50000).contains(&count));
        let result = run(&base, count, reuse.is_some());
        println!("{}", serde_json::to_string(&result).unwrap());
        results.push(result);
    }
    fs::write(
        base.join("results.json"),
        serde_json::to_vec_pretty(&results).unwrap(),
    )
    .unwrap();
}
