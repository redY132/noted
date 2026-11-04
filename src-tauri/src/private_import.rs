//! Offline graph-bundle validation and lock-owned, recoverable publication.
//! Payloads remain local; callers receive counts/fixed codes only.
use crate::{
    ai_privacy,
    library::ordinary,
    store::{atomic_write, valid_id, Folder, Note, Presentation, Store},
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, BTreeSet, HashSet},
    fs,
    path::{Path, PathBuf},
    time::UNIX_EPOCH,
};
type Result<T> = std::result::Result<T, String>;
const INVALID: &str = "PRIVATE_IMPORT_INVALID_BUNDLE";
const IO: &str = "PRIVATE_IMPORT_IO_FAILED";
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Bundle {
    format_version: u32,
    asset_root: Option<String>,
    batch_id: String,
    folder_id: String,
    pages: Vec<Page>,
    references: BTreeMap<String, Reference>,
    counts: BTreeMap<String, u64>,
    source: Source,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Source {
    path: String,
    sha256: String,
    bytes: u64,
    modified_ns: u64,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Page {
    id: String,
    title: String,
    source_id: u64,
    created_at: Option<String>,
    updated_at: Option<String>,
    #[serde(default)]
    tags: Vec<String>,
    block_id: String,
    properties: Vec<Property>,
    children: Vec<Block>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Block {
    id: String,
    markdown: String,
    asset: Option<Asset>,
    display: String,
    heading: Option<u64>,
    language: String,
    checked: Option<bool>,
    properties: Vec<Property>,
    children: Vec<Block>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Asset {
    path: String,
    sha256: String,
    bytes: u64,
    modified_ns: u64,
    mime: String,
}
struct Images<'a> {
    root: &'a Path,
    note: &'a str,
    source_root: &'a Path,
    archive: &'a Path,
    files: &'a mut Vec<crate::migration::SourceFile>,
    sources: &'a mut Vec<SourceRecord>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Property {
    name: String,
    values: Vec<PropertyValue>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PropertyValue {
    text: String,
    note_id: Option<String>,
    block_id: Option<String>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Reference {
    note_id: Option<String>,
    block_id: Option<String>,
    label: String,
}
#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Summary {
    pub imported: bool,
    pub notes: usize,
    pub blocks: usize,
    pub properties: usize,
    pub assets: usize,
    pub private_denied: usize,
    pub source_unchanged: bool,
    pub sidecars_unchanged: bool,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Pending {
    batch_id: String,
    manifest_sha: String,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Manifest {
    folder_id: String,
    note_ids: Vec<String>,
    source: SourceRecord,
    assets: Vec<SourceRecord>,
    files: Vec<Entry>,
    summary: Summary,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SourceRecord {
    path: String,
    sha256: String,
    bytes: u64,
    modified_ns: u64,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Entry {
    path: String,
    sha256: String,
    bytes: u64,
}
fn read(path: &Path, max: u64) -> Result<Vec<u8>> {
    ordinary(path, false).map_err(|_| IO)?;
    if fs::metadata(path).map_err(|_| IO)?.len() > max {
        return Err(INVALID.into());
    }
    fs::read(path).map_err(|_| IO.into())
}
fn hash(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
fn stamp(path: &Path) -> Result<(u64, u64)> {
    let m = fs::metadata(path).map_err(|_| IO)?;
    Ok((
        m.len(),
        m.modified()
            .map_err(|_| IO)?
            .duration_since(UNIX_EPOCH)
            .map_err(|_| IO)?
            .as_nanos()
            .try_into()
            .map_err(|_| IO)?,
    ))
}
fn source_ok(s: &SourceRecord) -> Result<()> {
    let p = Path::new(&s.path);
    if !p.is_absolute()
        || p.to_string_lossy().starts_with(r"\\") && !p.to_string_lossy().starts_with(r"\\?\C:")
    {
        return Err("PRIVATE_IMPORT_SOURCE_INVALID".into());
    }
    for ancestor in p.ancestors().skip(1) {
        ordinary(ancestor, true).map_err(|_| "PRIVATE_IMPORT_SOURCE_INVALID")?;
    }
    for suffix in ["-wal", "-shm", "-journal"] {
        if PathBuf::from(format!("{}{suffix}", p.display())).exists() {
            return Err("PRIVATE_IMPORT_SOURCE_SIDECARS".into());
        }
    }
    if s.bytes > 32 * 1024 * 1024
        || stamp(p)? != (s.bytes, s.modified_ns)
        || hash(&read(p, 32 * 1024 * 1024)?) != s.sha256
    {
        return Err("PRIVATE_IMPORT_SOURCE_CHANGED".into());
    }
    Ok(())
}
fn text(s: &str) -> Value {
    json!({"type":"text","text":s})
}
fn paragraph(id: &str, content: Vec<Value>) -> Value {
    json!({"type":"paragraph","attrs":{"id":id},"content":content})
}
fn href(note: &str, block: Option<&str>) -> Result<String> {
    valid_id(note).map_err(|_| INVALID)?;
    let s = format!(
        "noted://note/{note}{}",
        block.map(|b| format!("#block={b}")).unwrap_or_default()
    );
    crate::links::validate(&s).map_err(|_| INVALID)?;
    Ok(s)
}
fn linked(s: &str, note: Option<&str>, block: Option<&str>) -> Result<Value> {
    let mut v = text(s);
    if let Some(note) = note {
        v["marks"] = json!([{"type":"link","attrs":{"href":href(note,block)?}}]);
    }
    Ok(v)
}
fn properties(props: &[Property], prefix: &str, counter: &mut usize) -> Result<Vec<Value>> {
    if props.is_empty() {
        return Ok(vec![]);
    }
    if props.len() > 10000 {
        return Err(INVALID.into());
    }
    let mut rows = vec![];
    for (i, p) in props.iter().enumerate() {
        if p.name.len() > 4096 || p.values.len() > 10000 {
            return Err(INVALID.into());
        }
        let mut values = vec![];
        for (j, v) in p.values.iter().enumerate() {
            if v.text.len() > 2 * 1024 * 1024 {
                return Err(INVALID.into());
            }
            if j > 0 {
                values.push(text(", "));
            }
            if !v.text.is_empty() {
                values.push(linked(
                    &v.text,
                    v.note_id.as_deref(),
                    v.block_id.as_deref(),
                )?);
            }
            *counter += 1;
        }
        let id = format!("{prefix}-prop-{i}");
        rows.push(json!({"type":"tableRow","attrs":{"id":format!("{id}-row")},"content":[{"type":"tableCell","attrs":{"id":format!("{id}-key")},"content":[paragraph(&format!("{id}-kp"),if p.name.is_empty(){vec![]}else{vec![text(&p.name)]})]},{"type":"tableCell","attrs":{"id":format!("{id}-value")},"content":[paragraph(&format!("{id}-vp"),values)]}]}));
    }
    Ok(vec![
        json!({"type":"table","attrs":{"id":format!("{prefix}-properties")},"content":rows}),
    ])
}
fn resolve_inline(v: &mut Value, refs: &BTreeMap<String, Reference>, code: bool) -> Result<()> {
    let code = code || v["type"] == "codeBlock";
    if let Some(children) = v.get_mut("content").and_then(Value::as_array_mut) {
        let old = std::mem::take(children);
        let mut next = vec![];
        for mut child in old {
            if child["type"] != "text"
                || code
                || child["marks"]
                    .as_array()
                    .is_some_and(|a| a.iter().any(|m| m["type"] == "code" || m["type"] == "link"))
            {
                resolve_inline(&mut child, refs, code)?;
                next.push(child);
                continue;
            }
            let s = child["text"].as_str().ok_or(INVALID)?;
            let mut start = 0;
            let mut i = 0;
            while i + 2 <= s.len() {
                let tail = &s[i..];
                let pair = if tail.starts_with("[[") {
                    Some(("]]", 2))
                } else if tail.starts_with("((") {
                    Some(("))", 2))
                } else {
                    None
                };
                if let Some((close, offset)) = pair {
                    let Some(end) = s[i + offset..].find(close).map(|n| i + offset + n) else {
                        return Err("GRAPH_REFERENCE_ADAPTER_REQUIRED".into());
                    };
                    let key = &s[i + offset..end];
                    let r = refs.get(key).ok_or("GRAPH_UNRESOLVED_REFERENCE")?;
                    if start < i {
                        let mut n = child.clone();
                        n["text"] = json!(&s[start..i]);
                        next.push(n);
                    }
                    let mut n = linked(&r.label, r.note_id.as_deref(), r.block_id.as_deref())?;
                    if let Some(marks) = child.get("marks").and_then(Value::as_array) {
                        let mut m = marks.clone();
                        if let Some(extra) = n["marks"].as_array() {
                            m.extend(extra.clone());
                        }
                        if !m.is_empty() {
                            n["marks"] = json!(m);
                        }
                    }
                    if !r.label.is_empty() {
                        next.push(n);
                    }
                    i = end + 2;
                    start = i;
                    continue;
                }
                if tail.starts_with("^^") {
                    if let Some(end) = s[i + 2..].find("^^").map(|n| i + 2 + n) {
                        if start < i {
                            let mut n = child.clone();
                            n["text"] = json!(&s[start..i]);
                            next.push(n);
                        }
                        let mut n = child.clone();
                        n["text"] = json!(&s[i + 2..end]);
                        let mut marks = n["marks"].as_array().cloned().unwrap_or_default();
                        if !marks.iter().any(|m| m["type"] == "highlight") {
                            marks.push(json!({"type":"highlight"}));
                        }
                        n["marks"] = json!(marks);
                        if end > i + 2 {
                            next.push(n);
                        }
                        i = end + 2;
                        start = i;
                        continue;
                    }
                }
                i += s[i..].chars().next().unwrap().len_utf8();
            }
            if start < s.len() {
                let mut n = child.clone();
                n["text"] = json!(&s[start..]);
                next.push(n);
            }
        }
        *children = next;
    }
    Ok(())
}
fn block(
    b: &Block,
    refs: &BTreeMap<String, Reference>,
    depth: usize,
    blocks: &mut usize,
    props: &mut usize,
    images: &mut Images,
) -> Result<Value> {
    if depth > 20 || b.id.len() > 100 || b.markdown.len() > 2 * 1024 * 1024 {
        return Err(INVALID.into());
    }
    *blocks += 1;
    let mut content = if let Some(asset) = &b.asset {
        let path = Path::new(&asset.path);
        let source_root = images.source_root.canonicalize().map_err(|_| IO)?;
        let source_path = path.canonicalize().map_err(|_| IO)?;
        if !source_path.starts_with(&source_root) || source_path == source_root {
            return Err("GRAPH_ASSET_PATH_INVALID".into());
        }
        let record = SourceRecord {
            path: asset.path.clone(),
            sha256: asset.sha256.clone(),
            bytes: asset.bytes,
            modified_ns: asset.modified_ns,
        };
        source_ok(&record)?;
        let bytes = read(path, 32 * 1024 * 1024)?;
        let imported = crate::assets::import(images.root, images.note, &bytes, &asset.mime)
            .map_err(|_| "GRAPH_ASSET_VALIDATION_FAILED")?;
        let original_path = format!(
            "assets/{}",
            source_path
                .strip_prefix(&source_root)
                .map_err(|_| INVALID)?
                .to_str()
                .ok_or(INVALID)?
                .replace('\\', "/")
        );
        if let Some(existing) = images.files.iter().find(|f| f.path == original_path) {
            if existing.sha256 != asset.sha256 || existing.bytes != asset.bytes {
                return Err("PRIVATE_IMPORT_SOURCE_CHANGED".into());
            }
        } else {
            let file_id = uuid::Uuid::new_v4().to_string();
            atomic_write(&images.archive.join(format!("{file_id}.source")), &bytes)?;
            images.files.push(crate::migration::SourceFile {
                id: file_id,
                path: original_path.clone(),
                bytes: asset.bytes,
                sha256: asset.sha256.clone(),
                source_created_at: None,
                source_modified_at: None,
                disposition: "imported-image".into(),
                note_id: Some(images.note.into()),
            });
            images.sources.push(record);
        }
        vec![
            json!({"type":"localImage","attrs":{"id":b.id,"assetId":imported.id,"alt":b.markdown}}),
        ]
    } else {
        match b.display.as_str() {
            "code" => vec![
                json!({"type":"codeBlock","attrs":{"id":b.id,"language":b.language},"content":if b.markdown.is_empty(){vec![]}else{vec![text(&b.markdown)]}}),
            ],
            "markdown" | "quote" => {
                let parsed = crate::migration::markdown::parse(&b.id, &b.markdown, "markdown")
                    .map_err(|_| "GRAPH_MARKDOWN_ADAPTER_REQUIRED")?;
                if !parsed.issues.is_empty() {
                    return Err("GRAPH_MARKDOWN_FIDELITY_REQUIRED".into());
                }
                let mut v = parsed.content;
                resolve_inline(&mut v, refs, false)?;
                let mut a = v["content"].as_array().cloned().ok_or(INVALID)?;
                if let Some(first) = a.first_mut() {
                    first["attrs"]["id"] = json!(b.id);
                    if let Some(level) = b.heading {
                        if !["paragraph", "heading"].contains(&first["type"].as_str().unwrap_or(""))
                            || !(1..=6).contains(&level)
                        {
                            return Err("GRAPH_HEADING_ADAPTER_REQUIRED".into());
                        }
                        first["type"] = json!("heading");
                        first["attrs"]["level"] = json!(level);
                    }
                }
                if b.display == "quote" {
                    vec![
                        json!({"type":"blockquote","attrs":{"id":format!("quote-{}",b.id)},"content":a}),
                    ]
                } else {
                    a
                }
            }
            _ => return Err("GRAPH_VISUAL_ADAPTER_REQUIRED".into()),
        }
    };
    content.extend(properties(&b.properties, &b.id, props)?);
    if !b.children.is_empty() {
        let mut items = vec![];
        for c in &b.children {
            items.push(block(c, refs, depth + 1, blocks, props, images)?);
        }
        content.extend(crate::migration::markdown::normalize(
            json!({"type":"bulletList","attrs":{"id":format!("children-{}",b.id)},"content":items}),
        ));
    }
    let mut item = json!({"type":if b.checked.is_some(){"taskItem"}else{"listItem"},"attrs":{"id":format!("item-{}",b.id)},"content":content});
    if let Some(checked) = b.checked {
        item["attrs"]["checked"] = json!(checked);
    }
    Ok(item)
}
fn stage(bundle: &Bundle, path: &Path) -> Result<Manifest> {
    if bundle.format_version != 1
        || bundle.pages.is_empty()
        || bundle.pages.len() > 5000
        || bundle.references.len() > 50000
    {
        return Err(INVALID.into());
    }
    for id in [&bundle.batch_id, &bundle.folder_id] {
        valid_id(id).map_err(|_| INVALID)?;
    }
    let source = SourceRecord {
        path: bundle.source.path.clone(),
        sha256: bundle.source.sha256.clone(),
        bytes: bundle.source.bytes,
        modified_ns: bundle.source.modified_ns,
    };
    source_ok(&source)?;
    let mut store = Store::open(path).map_err(|_| IO)?;
    let folder = Folder {
        id: bundle.folder_id.clone(),
        name: "Logseq import (private)".into(),
        parent_id: None,
    };
    let ids: BTreeSet<_> = bundle.pages.iter().map(|p| p.id.clone()).collect();
    if ids.len() != bundle.pages.len() {
        return Err(INVALID.into());
    }
    for id in &ids {
        valid_id(id).map_err(|_| INVALID)?;
    }
    ai_privacy::deny_batch(&store.root, ids.iter().cloned(), [folder.id.clone()])?;
    atomic_write(
        &store
            .root
            .join("folders")
            .join(format!("{}.json", folder.id)),
        &serde_json::to_vec(&folder).map_err(|_| INVALID)?,
    )?;
    let mut summary = Summary {
        imported: false,
        notes: 0,
        blocks: 0,
        properties: 0,
        assets: 0,
        private_denied: 0,
        source_unchanged: false,
        sidecars_unchanged: false,
    };
    let archive = store.root.join("imports").join(&bundle.batch_id);
    fs::create_dir_all(&archive).map_err(|_| IO)?;
    let mut asset_files = vec![];
    let mut asset_sources = vec![];
    let source_assets = bundle.asset_root.as_ref().map(PathBuf::from).unwrap_or(
        Path::new(&source.path)
            .parent()
            .ok_or(INVALID)?
            .join("assets"),
    );
    if !source_assets.is_absolute() {
        return Err("GRAPH_ASSET_PATH_INVALID".into());
    }
    for p in &bundle.pages {
        let mut images = Images {
            root: &store.root,
            note: &p.id,
            source_root: &source_assets,
            archive: &archive,
            files: &mut asset_files,
            sources: &mut asset_sources,
        };
        let mut content = properties(&p.properties, &p.block_id, &mut summary.properties)?;
        let mut items = vec![];
        for b in &p.children {
            items.push(block(
                b,
                &bundle.references,
                0,
                &mut summary.blocks,
                &mut summary.properties,
                &mut images,
            )?);
        }
        if !items.is_empty() {
            content.extend(crate::migration::markdown::normalize(
                json!({"type":"bulletList","attrs":{"id":format!("page-{}",p.id)},"content":items}),
            ));
        }
        if content.is_empty() {
            content.push(paragraph(&p.block_id, vec![]));
        }
        let content = json!({"type":"doc","content":content});
        let date = chrono::Utc::now().to_rfc3339();
        let n = Note {
            format_version: 2,
            id: p.id.clone(),
            title: p.title.clone(),
            folder_id: Some(folder.id.clone()),
            tags: p.tags.clone(),
            revision: 1,
            created_at: p.created_at.clone().unwrap_or(date.clone()),
            updated_at: p.updated_at.clone().unwrap_or(date),
            document: Some(crate::document::migrate(&p.id, &content)),
            content,
            presentation: Presentation {
                schema_id: "outline".into(),
            },
            revision_token: String::new(),
        };
        for date in [&n.created_at, &n.updated_at] {
            chrono::DateTime::parse_from_rfc3339(date)
                .map_err(|_| "GRAPH_TIMESTAMP_ADAPTER_REQUIRED")?;
        }
        store
            .validate(&n)
            .map_err(|_| "GRAPH_NATIVE_VALIDATION_FAILED")?;
        store
            .commit(n)
            .map_err(|_| "GRAPH_NATIVE_VALIDATION_FAILED")?;
        summary.notes += 1;
    }
    if bundle.counts.get("pages") != Some(&(summary.notes as u64))
        || bundle.counts.get("blocks") != Some(&((summary.blocks + summary.notes) as u64))
        || bundle.counts.get("properties") != Some(&(summary.properties as u64))
    {
        return Err("GRAPH_RECONCILIATION_FAILED".into());
    }
    let archive = store.root.join("imports").join(&bundle.batch_id);
    fs::create_dir_all(&archive).map_err(|_| IO)?;
    let source_name = format!("{}.source", bundle.batch_id);
    atomic_write(
        &archive.join(&source_name),
        &read(Path::new(&source.path), 32 * 1024 * 1024)?,
    )?;
    if hash(&read(&archive.join(&source_name), 32 * 1024 * 1024)?) != source.sha256 {
        return Err("PRIVATE_IMPORT_SOURCE_CHANGED".into());
    }
    let mapping: Vec<_> = bundle
        .pages
        .iter()
        .map(|p| json!({"sourceEntity":p.source_id,"noteId":p.id}))
        .collect();
    let filename = Path::new(&source.path)
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or(INVALID)?
        .to_owned();
    summary.assets = asset_files.len();
    let report = crate::migration::Report {
        format_version: 1,
        batch_id: bundle.batch_id.clone(),
        profile: "logseq-sqlite-private".into(),
        source_root: Path::new(&source.path)
            .parent()
            .ok_or(INVALID)?
            .display()
            .to_string(),
        source_digest: source.sha256.clone(),
        files: std::iter::once(crate::migration::SourceFile {
            id: bundle.batch_id.clone(),
            path: filename.clone(),
            bytes: source.bytes,
            sha256: source.sha256.clone(),
            source_created_at: None,
            source_modified_at: None,
            disposition: "imported-database".into(),
            note_id: None,
        })
        .chain(asset_files)
        .collect(),
        notes: bundle
            .pages
            .iter()
            .map(|p| crate::migration::NotePreview {
                id: p.id.clone(),
                source: filename.clone(),
                title: p.title.clone(),
                folder: "Logseq import (private)".into(),
                tags: p.tags.clone(),
            })
            .collect(),
        excluded: vec![],
        issues: vec![],
        assets: summary.assets,
        folders: 1,
        warnings: 0,
        blockers: 0,
        created_at: chrono::Utc::now().to_rfc3339(),
        review_digest: String::new(),
        target: String::new(),
    };
    let source_files: Vec<_> = report
        .files
        .iter()
        .map(|f| format!("{}/{}.source", bundle.batch_id, f.id))
        .collect();
    let mut report = serde_json::to_value(report).map_err(|_| INVALID)?;
    let references: Vec<_> = bundle
        .references
        .iter()
        .map(|(uuid, r)| json!({"sourceUuid":uuid,"noteId":r.note_id,"blockId":r.block_id}))
        .collect();
    report["sqlite"] =
        json!({"counts":bundle.counts,"mapping":mapping,"references":references,"aiExcluded":true});
    atomic_write(
        &archive.join("report.json"),
        &serde_json::to_vec(&report).map_err(|_| INVALID)?,
    )?;
    source_ok(&source)?;
    let gate = ai_privacy::Gate::load(&store.root)?;
    for id in &ids {
        if gate.allows_note(id)? {
            return Err("PRIVATE_IMPORT_PRIVACY_CHECK_FAILED".into());
        }
        summary.private_denied += 1;
    }
    summary.source_unchanged = true;
    summary.sidecars_unchanged = true;
    let mut files = vec![];
    for (dir, names) in [
        (
            "notes",
            ids.iter()
                .map(|id| format!("{id}.json"))
                .collect::<Vec<_>>(),
        ),
        ("folders", vec![format!("{}.json", folder.id)]),
        (
            "imports",
            std::iter::once(format!("{}/report.json", bundle.batch_id))
                .chain(source_files)
                .collect(),
        ),
    ] {
        for name in names {
            let relative = format!("{dir}/{name}");
            let bytes = read(&store.root.join(&relative), 32 * 1024 * 1024)?;
            files.push(Entry {
                path: relative,
                sha256: hash(&bytes),
                bytes: bytes.len() as u64,
            });
        }
    }
    if store.root.join("assets").exists() {
        for owner in fs::read_dir(store.root.join("assets")).map_err(|_| IO)? {
            let owner = owner.map_err(|_| IO)?.path();
            ordinary(&owner, true).map_err(|_| IO)?;
            for image in fs::read_dir(&owner).map_err(|_| IO)? {
                let image = image.map_err(|_| IO)?.path();
                let relative = image
                    .strip_prefix(&store.root)
                    .map_err(|_| INVALID)?
                    .to_str()
                    .ok_or(INVALID)?
                    .replace('\\', "/");
                let bytes = read(&image, 32 * 1024 * 1024)?;
                files.push(Entry {
                    path: relative,
                    sha256: hash(&bytes),
                    bytes: bytes.len() as u64,
                });
            }
        }
    }
    Ok(Manifest {
        folder_id: folder.id,
        note_ids: ids.into_iter().collect(),
        source,
        assets: asset_sources,
        files,
        summary,
    })
}
fn valid_entry(path: &str, batch: &str) -> bool {
    let parts: Vec<_> = path.split('/').collect();
    match parts.as_slice() {
        ["notes" | "folders", name] => name
            .strip_suffix(".json")
            .is_some_and(|id| valid_id(id).is_ok()),
        ["assets", owner, name] => {
            valid_id(owner).is_ok()
                && name
                    .strip_suffix(".image")
                    .is_some_and(|id| valid_id(id).is_ok())
        }
        ["imports", id, name] => {
            *id == batch
                && (*name == "report.json"
                    || name
                        .strip_suffix(".source")
                        .is_some_and(|id| valid_id(id).is_ok()))
        }
        _ => false,
    }
}
fn finish(store: &mut Store, pending: Pending) -> Result<Summary> {
    valid_id(&pending.batch_id).map_err(|_| INVALID)?;
    let stage = store
        .root
        .join("private-import-staging")
        .join(&pending.batch_id);
    ordinary(&stage, true).map_err(|_| IO)?;
    let bytes = read(&stage.join("manifest.json"), 16 * 1024 * 1024)?;
    if hash(&bytes) != pending.manifest_sha {
        return Err("PRIVATE_IMPORT_STAGE_CHANGED".into());
    }
    let m: Manifest = serde_json::from_slice(&bytes).map_err(|_| INVALID)?;
    valid_id(&m.folder_id).map_err(|_| INVALID)?;
    source_ok(&m.source)?;
    for source in &m.assets {
        source_ok(source)?;
    }
    ai_privacy::deny_batch(&store.root, m.note_ids.clone(), [m.folder_id.clone()])?;
    let mut paths = HashSet::new();
    // Verify every staged byte and collision before copying any canonical file.
    for f in &m.files {
        if !valid_entry(&f.path, &pending.batch_id) || !paths.insert(f.path.clone()) {
            return Err(INVALID.into());
        }
        let data = read(&stage.join(&f.path), 32 * 1024 * 1024)?;
        if data.len() as u64 != f.bytes || hash(&data) != f.sha256 {
            return Err("PRIVATE_IMPORT_STAGE_CHANGED".into());
        }
        let target = store.root.join(&f.path);
        if target.exists() && read(&target, 32 * 1024 * 1024)? != data {
            return Err("PRIVATE_IMPORT_COLLISION".into());
        }
    }
    for f in &m.files {
        let target = store.root.join(&f.path);
        if target.exists() {
            continue;
        }
        let parent = target.parent().ok_or(INVALID)?;
        fs::create_dir_all(parent).map_err(|_| IO)?;
        for p in parent
            .ancestors()
            .take_while(|p| p.starts_with(&store.root))
        {
            ordinary(p, true).map_err(|_| IO)?;
        }
        atomic_write(&target, &read(&stage.join(&f.path), 32 * 1024 * 1024)?)?;
    }
    for f in &m.files {
        if hash(&read(&store.root.join(&f.path), 32 * 1024 * 1024)?) != f.sha256 {
            return Err("PRIVATE_IMPORT_COPY_CHANGED".into());
        }
    }
    source_ok(&m.source)?;
    for source in &m.assets {
        source_ok(source)?;
    }
    // All IDs are already denied. Canonical publication stays hidden behind the
    // incomplete marker until native validation/index reconciliation succeeds.
    for id in &m.note_ids {
        store
            .load_note(id)
            .map_err(|_| "GRAPH_NATIVE_VALIDATION_FAILED")?;
    }
    store
        .rebuild_index()
        .map_err(|_| "PRIVATE_IMPORT_INDEX_FAILED")?;
    ai_privacy::verify_batch(&store.root, &m.note_ids, &m.folder_id)?;
    fs::remove_file(store.root.join(ai_privacy::INCOMPLETE)).map_err(|_| IO)?;
    let gate = ai_privacy::Gate::load(&store.root)?;
    if m.note_ids
        .iter()
        .any(|id| gate.allows_note(id).unwrap_or(true))
    {
        return Err("PRIVATE_IMPORT_PRIVACY_CHECK_FAILED".into());
    }
    // Only this importer's fresh UUID stage is eligible for cleanup.
    let staging_root = store.root.join("private-import-staging");
    if stage.parent() == Some(staging_root.as_path())
        && stage.file_name().and_then(|n| n.to_str()) == Some(&pending.batch_id)
        && ordinary(&stage, true).is_ok()
    {
        let _ = fs::remove_dir_all(&stage);
    }
    let mut result = m.summary;
    result.imported = true;
    Ok(result)
}
impl Store {
    pub fn import_private_bundle(&mut self, bundle_path: &Path) -> Result<Summary> {
        if self.root.join(ai_privacy::INCOMPLETE).exists() {
            return Err("PRIVATE_IMPORT_RECOVERY_REQUIRED".into());
        }
        let bundle: Bundle =
            serde_json::from_slice(&read(bundle_path, 128 * 1024 * 1024)?).map_err(|_| INVALID)?;
        let holder = self.root.join("private-import-staging");
        if !holder.exists() {
            fs::create_dir(&holder).map_err(|_| IO)?;
        }
        ordinary(&holder, true).map_err(|_| IO)?;
        valid_id(&bundle.batch_id).map_err(|_| INVALID)?;
        let stage_path = holder.join(&bundle.batch_id);
        if stage_path.exists() {
            return Err("PRIVATE_IMPORT_STAGE_EXISTS".into());
        }
        fs::create_dir(&stage_path).map_err(|_| IO)?;
        let manifest = stage(&bundle, &stage_path)?;
        for f in &manifest.files {
            if self.root.join(&f.path).exists() {
                return Err("PRIVATE_IMPORT_COLLISION".into());
            }
        }
        let bytes = serde_json::to_vec(&manifest).map_err(|_| INVALID)?;
        atomic_write(&stage_path.join("manifest.json"), &bytes)?;
        // Deny first, then guard multi-file publication. Never grant access.
        ai_privacy::deny_batch(
            &self.root,
            manifest.note_ids.clone(),
            [manifest.folder_id.clone()],
        )?;
        let pending = Pending {
            batch_id: bundle.batch_id,
            manifest_sha: hash(&bytes),
        };
        atomic_write(
            &self.root.join(ai_privacy::INCOMPLETE),
            &serde_json::to_vec(&pending).map_err(|_| INVALID)?,
        )?;
        finish(self, pending)
    }
    pub fn resume_private_import(&mut self) -> Result<Summary> {
        let pending: Pending =
            serde_json::from_slice(&read(&self.root.join(ai_privacy::INCOMPLETE), 4096)?)
                .map_err(|_| INVALID)?;
        finish(self, pending)
    }
}
pub fn validate_bundle(path: &Path) -> Result<Summary> {
    let bundle: Bundle =
        serde_json::from_slice(&read(path, 128 * 1024 * 1024)?).map_err(|_| INVALID)?;
    let t = tempfile::tempdir().map_err(|_| IO)?;
    Ok(stage(&bundle, t.path())?.summary)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture(root: &Path) -> (PathBuf, PathBuf, Bundle) {
        let export = root.join("export");
        fs::create_dir(&export).unwrap();
        let source = export.join("fixture.sqlite");
        fs::write(&source, b"SYNTHETIC_PRIVATE_SOURCE").unwrap();
        let (bytes, modified_ns) = stamp(&source).unwrap();
        let id = uuid::Uuid::new_v4().to_string();
        let value = json!({"formatVersion":1,"batchId":uuid::Uuid::new_v4().to_string(),"folderId":uuid::Uuid::new_v4().to_string(),"source":{"path":source,"sha256":hash(&fs::read(&source).unwrap()),"bytes":bytes,"modifiedNs":modified_ns},"counts":{"pages":1,"blocks":2,"properties":0},"references":{},"pages":[{"id":id,"title":"SYNTHETIC_PRIVATE_CANARY","sourceId":1,"blockId":"page-anchor","properties":[],"children":[{"id":"block-anchor","markdown":"**Bold** and ^^highlight^^.","display":"markdown","heading":null,"language":"","checked":null,"properties":[],"children":[]}]}]});
        let bundle = root.join("bundle.json");
        fs::write(&bundle, serde_json::to_vec(&value).unwrap()).unwrap();
        (source, bundle, serde_json::from_value(value).unwrap())
    }
    #[test]
    fn validated_publication_preserves_existing_notes_source_and_backup_privacy() {
        let t = tempfile::tempdir().unwrap();
        let (source, bundle, _) = fixture(t.path());
        let original = fs::read(&source).unwrap();
        let root = t.path().join("workspace");
        let mut store = Store::open(&root).unwrap();
        let existing = store
            .create_note("Existing synthetic".into(), None)
            .unwrap();
        let old = fs::read(root.join("notes").join(format!("{}.json", existing.id))).unwrap();
        let validated = validate_bundle(&bundle).unwrap();
        assert_eq!(validated.notes, 1);
        assert!(!validated.imported);
        let done = store.import_private_bundle(&bundle).unwrap();
        assert!(done.imported);
        assert_eq!(done.private_denied, 1);
        assert_eq!(fs::read(&source).unwrap(), original);
        assert_eq!(
            fs::read(root.join("notes").join(format!("{}.json", existing.id))).unwrap(),
            old
        );
        let private = store
            .list_notes()
            .unwrap()
            .into_iter()
            .find(|n| n.id != existing.id)
            .unwrap();
        assert!(ai_privacy::ensure_note(&root, &private.id).is_err());
        let backup = t.path().join("snapshot.noted-backup");
        let snapshot = store.create_backup(&backup).unwrap();
        let target = t.path().join("restored");
        crate::backup::restore_backup(&backup, &target, &snapshot.digest).unwrap();
        assert!(ai_privacy::ensure_note(&target, &private.id).is_err());
        let reports = store.migration_reports().unwrap();
        assert_eq!(reports.len(), 1);
        let originals = t.path().join("originals");
        assert_eq!(
            store
                .export_migration_sources(&reports[0].batch_id, &originals)
                .unwrap(),
            1
        );
        assert_eq!(
            fs::read(originals.join("fixture.sqlite")).unwrap(),
            original
        );
        let restored = Store::open(&target).unwrap();
        assert_eq!(
            restored.load_note(&private.id).unwrap().title,
            "SYNTHETIC_PRIVATE_CANARY"
        );
    }
    #[test]
    fn interrupted_copy_blocks_normal_open_and_resumes_identical_files_only() {
        let t = tempfile::tempdir().unwrap();
        let (_, _, bundle) = fixture(t.path());
        let root = t.path().join("workspace");
        let store = Store::open(&root).unwrap();
        let canonical = store.root.clone();
        let stage_path = root.join("private-import-staging").join(&bundle.batch_id);
        fs::create_dir_all(&stage_path).unwrap();
        let manifest = stage(&bundle, &stage_path).unwrap();
        let bytes = serde_json::to_vec(&manifest).unwrap();
        atomic_write(&stage_path.join("manifest.json"), &bytes).unwrap();
        ai_privacy::deny_batch(
            &canonical,
            manifest.note_ids.clone(),
            [manifest.folder_id.clone()],
        )
        .unwrap();
        let pending = Pending {
            batch_id: bundle.batch_id.clone(),
            manifest_sha: hash(&bytes),
        };
        atomic_write(
            &canonical.join(ai_privacy::INCOMPLETE),
            &serde_json::to_vec(&pending).unwrap(),
        )
        .unwrap();
        let f = manifest
            .files
            .iter()
            .find(|f| f.path.starts_with("notes/"))
            .unwrap();
        atomic_write(
            &canonical.join(&f.path),
            &fs::read(stage_path.join(&f.path)).unwrap(),
        )
        .unwrap();
        assert!(ai_privacy::Gate::load(&canonical).is_err());
        drop(store);
        assert!(Store::open(&root).is_err());
        let mut recovered = Store::open_private_recovery(&root).unwrap();
        let result = recovered.resume_private_import().unwrap();
        assert!(result.imported);
        assert_eq!(result.notes, 1);
        assert!(ai_privacy::ensure_note(&canonical, &manifest.note_ids[0]).is_err());
    }
    #[test]
    fn source_changes_and_stage_corruption_never_publish_or_clear_the_guard() {
        let t = tempfile::tempdir().unwrap();
        let (source, bundle, _) = fixture(t.path());
        let root = t.path().join("workspace");
        let mut store = Store::open(&root).unwrap();
        fs::write(source, b"CHANGED_SOURCE").unwrap();
        assert!(store.import_private_bundle(&bundle).is_err());
        assert!(store.list_notes().unwrap().is_empty());
        assert!(!store.root.join(ai_privacy::INCOMPLETE).exists());
    }
}
