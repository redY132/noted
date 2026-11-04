//! Explicit local export-folder imports. Preview is a frozen staged copy;
//! publication never mutates the source or the active workspace.
pub(crate) mod markdown;
use crate::{
    library::ordinary,
    store::{atomic_write, valid_id, Note, Presentation, Store},
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, HashMap},
    fs,
    io::{Read, Write},
    path::{Component, Path, PathBuf},
    sync::Mutex,
    time::{Duration, Instant},
};
type Result<T> = std::result::Result<T, String>;
fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}
const MAX_FILES: usize = 10000;
const MAX_TOTAL: u64 = 512 * 1024 * 1024;
const MAX_FILE: u64 = 32 * 1024 * 1024;
const MAX_TEXT: u64 = 2 * 1024 * 1024;
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Issue {
    pub path: String,
    pub line: usize,
    pub severity: String,
    pub feature: String,
    pub message: String,
}
impl Issue {
    fn warning(path: &str, line: usize, feature: &str, message: &str) -> Self {
        Self {
            path: path.into(),
            line,
            severity: "warning".into(),
            feature: feature.into(),
            message: message.into(),
        }
    }
    fn blocked(path: &str, line: usize, feature: &str, message: &str) -> Self {
        Self {
            severity: "blocked".into(),
            ..Self::warning(path, line, feature, message)
        }
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceFile {
    pub id: String,
    pub path: String,
    pub bytes: u64,
    pub sha256: String,
    #[serde(default)]
    pub source_created_at: Option<String>,
    #[serde(default)]
    pub source_modified_at: Option<String>,
    pub disposition: String,
    pub note_id: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotePreview {
    pub id: String,
    pub source: String,
    pub title: String,
    pub folder: String,
    pub tags: Vec<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Report {
    pub format_version: u32,
    pub batch_id: String,
    pub profile: String,
    pub source_root: String,
    pub source_digest: String,
    pub files: Vec<SourceFile>,
    pub notes: Vec<NotePreview>,
    pub excluded: Vec<String>,
    pub issues: Vec<Issue>,
    pub assets: usize,
    pub folders: usize,
    pub warnings: usize,
    pub blockers: usize,
    pub created_at: String,
    #[serde(default)]
    pub review_digest: String,
    #[serde(default)]
    pub target: String,
}
struct Plan {
    stage: tempfile::TempDir,
    source: PathBuf,
    report: Report,
    created: Instant,
}
#[derive(Default)]
pub struct Service {
    plans: Mutex<HashMap<String, Plan>>,
}
#[derive(Clone)]
struct NoteMeta {
    id: String,
    path: String,
    title: String,
    aliases: Vec<String>,
    tags: Vec<String>,
    anchors: BTreeMap<String, Vec<String>>,
    locations: BTreeMap<String, usize>,
    parsed_path: PathBuf,
}
fn local(path: &Path) -> Result<()> {
    if !path.is_absolute() {
        return Err("Choose an absolute local folder path".into());
    }
    #[cfg(windows)]
    {
        use std::path::Prefix;
        if matches!(path.components().next(),Some(Component::Prefix(p))if matches!(p.kind(),Prefix::UNC(..)|Prefix::VerbatimUNC(..)))
        {
            return Err(
                "Choose a local exported copy; network shares are not supported for import".into(),
            );
        }
    }
    Ok(())
}
fn safe_relative(value: &str) -> bool {
    !value.is_empty()
        && !value.contains('\\')
        && !value.contains(':')
        && Path::new(value)
            .components()
            .all(|c| matches!(c, Component::Normal(_)))
}
fn read_bounded(path: &Path, max: u64) -> Result<Vec<u8>> {
    ordinary(path, false)?;
    let f = fs::File::open(path).map_err(err)?;
    if f.metadata().map_err(err)?.len() > max {
        return Err("Source file exceeds the import size limit".into());
    }
    let mut b = vec![];
    f.take(max + 1).read_to_end(&mut b).map_err(err)?;
    if b.len() as u64 > max {
        return Err("Source file grew beyond the import size limit".into());
    }
    Ok(b)
}
fn hash(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
fn inventory(root: &Path) -> Result<(Vec<(String, PathBuf)>, Vec<String>)> {
    fn visit(
        root: &Path,
        dir: &Path,
        depth: usize,
        files: &mut Vec<(String, PathBuf)>,
        excluded: &mut Vec<String>,
    ) -> Result<()> {
        ordinary(dir, true)?;
        if depth > 32 {
            return Err("Source folder nesting exceeds 32 levels".into());
        }
        let mut entries = fs::read_dir(dir)
            .map_err(err)?
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(err)?;
        entries.sort_by_key(|e| e.file_name());
        for entry in entries {
            let p = entry.path();
            let name = entry
                .file_name()
                .to_str()
                .ok_or("A source filename cannot be represented as Unicode")?
                .to_string();
            let relative = p
                .strip_prefix(root)
                .map_err(err)?
                .to_str()
                .ok_or("Invalid source filename")?
                .replace('\\', "/");
            if name.starts_with('.') || ["node_modules", "logseq"].contains(&name.as_str()) {
                excluded.push(relative);
                if excluded.len() > MAX_FILES {
                    return Err("Too many excluded entries".into());
                }
                continue;
            }
            let m = fs::symlink_metadata(&p).map_err(err)?;
            ordinary(&p, m.is_dir())?;
            if m.is_dir() {
                visit(root, &p, depth + 1, files, excluded)?;
            } else {
                if files.len() >= MAX_FILES {
                    return Err("Import supports at most 10000 source files".into());
                }
                if !safe_relative(&relative) {
                    return Err("Unsafe source path".into());
                }
                files.push((relative, p));
            }
        }
        Ok(())
    }
    let mut files = vec![];
    let mut excluded = vec![];
    visit(root, root, 0, &mut files, &mut excluded)?;
    Ok((files, excluded))
}
fn snapshot_digest(files: &[SourceFile]) -> String {
    let mut h = Sha256::new();
    for f in files {
        h.update(f.path.as_bytes());
        h.update([0]);
        h.update(f.sha256.as_bytes());
        h.update([0]);
    }
    format!("{:x}", h.finalize())
}
fn body(v: &Value, id: &str) -> Option<Value> {
    if v.pointer("/attrs/id").and_then(Value::as_str) == Some(id) {
        return Some(v.clone());
    }
    for c in v["content"].as_array().into_iter().flatten() {
        if let Some(n) = body(c, id) {
            return Some(n);
        }
    }
    None
}
fn no_ext(path: &str) -> String {
    let lower = path.to_lowercase();
    if lower.ends_with(".markdown") {
        path[..path.len() - 9].into()
    } else if lower.ends_with(".md") {
        path[..path.len() - 3].into()
    } else {
        path.into()
    }
}
fn slug(s: &str) -> String {
    s.to_lowercase()
        .chars()
        .filter_map(|c| {
            if c.is_alphanumeric() || c == '_' || c == '-' {
                Some(c)
            } else if c.is_whitespace() {
                Some('-')
            } else {
                None
            }
        })
        .collect()
}
fn decode(s: &str) -> Option<String> {
    let b = s.as_bytes();
    let mut out = vec![];
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' {
            if i + 2 >= b.len() {
                return None;
            }
            let x = (b[i + 1] as char).to_digit(16)? * 16 + (b[i + 2] as char).to_digit(16)?;
            out.push(x as u8);
            i += 3;
        } else {
            out.push(b[i]);
            i += 1;
        }
    }
    let s = String::from_utf8(out).ok()?;
    (!s.chars().any(|c| c.is_control() || c == '\\')).then_some(s)
}
fn path_from(source: &str, target: &str, root_relative: bool) -> Option<String> {
    if target.starts_with('/') || target.contains([':', '\\']) {
        return None;
    }
    let mut parts = if root_relative {
        vec![]
    } else {
        let mut p = source.split('/').map(str::to_string).collect::<Vec<_>>();
        p.pop();
        p
    };
    for p in target.split('/') {
        match p {
            "" | "." => {}
            ".." => {
                parts.pop()?;
            }
            _ => parts.push(p.into()),
        }
    }
    Some(parts.join("/"))
}
fn web(s: &str) -> bool {
    let rest = s
        .strip_prefix("https://")
        .or_else(|| s.strip_prefix("http://"));
    rest.is_some_and(|r| {
        !r.split(['/', '?', '#']).next().unwrap_or("").is_empty()
            && !r.split(['/', '?', '#']).next().unwrap_or("").contains('@')
    }) && !s
        .chars()
        .any(|c| c.is_control() || c.is_whitespace() || c == '\\')
}
enum Target {
    Note(String, Option<String>),
    Asset(usize),
    Web(String),
    Missing(String),
    Ambiguous(String),
}
struct Resolver<'a> {
    metas: &'a [NoteMeta],
    files: &'a [SourceFile],
    paths: HashMap<String, usize>,
    names: HashMap<String, Vec<usize>>,
    file_paths: HashMap<String, usize>,
    file_names: HashMap<String, Vec<usize>>,
    uuids: HashMap<String, Vec<(usize, String)>>,
}
impl<'a> Resolver<'a> {
    fn new(metas: &'a [NoteMeta], files: &'a [SourceFile]) -> Self {
        let mut r = Self {
            metas,
            files,
            paths: HashMap::new(),
            names: HashMap::new(),
            file_paths: HashMap::new(),
            file_names: HashMap::new(),
            uuids: HashMap::new(),
        };
        for (i, m) in metas.iter().enumerate() {
            r.paths.insert(no_ext(&m.path).to_lowercase(), i);
            let stem = Path::new(&m.path)
                .file_stem()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();
            for name in std::iter::once(&m.title)
                .chain(std::iter::once(&stem))
                .chain(m.aliases.iter())
            {
                let key = name
                    .trim()
                    .trim_start_matches("uuid:")
                    .trim_matches('"')
                    .to_lowercase();
                if name.starts_with("uuid:") {
                    r.uuids.entry(key).or_default().push((i, String::new()));
                } else {
                    let a = r.names.entry(key).or_default();
                    if !a.contains(&i) {
                        a.push(i);
                    }
                }
            }
            for (key, ids) in &m.anchors {
                if let Some(id) = key.strip_prefix("block:") {
                    if valid_id(id).is_ok() {
                        for b in ids {
                            r.uuids.entry(id.into()).or_default().push((i, b.clone()));
                        }
                    }
                }
            }
        }
        for (i, f) in files.iter().enumerate() {
            r.file_paths.insert(f.path.to_lowercase(), i);
            if let Some(name) = Path::new(&f.path).file_name().and_then(|s| s.to_str()) {
                r.file_names.entry(name.to_lowercase()).or_default().push(i);
            }
        }
        r
    }
    fn target(&self, source: &NoteMeta, input: &str, wiki: bool, block_ref: bool) -> Target {
        if block_ref {
            let entries = self.uuids.get(input);
            return match entries.map(Vec::as_slice) {
                Some([(i, b)]) => Target::Note(
                    self.metas[*i].id.clone(),
                    (!b.is_empty()).then_some(b.clone()),
                ),
                Some(a) if a.len() > 1 => {
                    Target::Ambiguous(format!("Duplicate source block UUID: {input}"))
                }
                _ => Target::Missing(format!("Missing source block UUID: {input}")),
            };
        }
        if web(input) {
            return Target::Web(input.into());
        }
        let (path, fragment) = input
            .split_once('#')
            .map(|(p, f)| (p, Some(f)))
            .unwrap_or((input, None));
        let Some(path) = decode(path) else {
            return Target::Missing("Invalid escaped link target".into());
        };
        if path.contains(':') || path.starts_with('/') || path.contains('\\') {
            return Target::Missing(
                "External file paths and unsupported schemes are not read".into(),
            );
        }
        if wiki
            && !path.contains('/')
            && self
                .names
                .get(&no_ext(&path).to_lowercase())
                .is_some_and(|a| a.len() > 1)
        {
            return Target::Ambiguous(format!("Ambiguous unqualified note title: {input}"));
        }
        let candidates = if path.is_empty() {
            self.metas
                .iter()
                .position(|m| m.id == source.id)
                .map(|i| vec![i])
                .unwrap_or_default()
        } else {
            let mut candidates = vec![];
            if let Some(p) = path_from(&source.path, &path, wiki) {
                if let Some(&i) = self.paths.get(&no_ext(&p).to_lowercase()) {
                    candidates.push(i);
                }
            }
            if candidates.is_empty() && wiki {
                if let Some(&i) = self.paths.get(&no_ext(&path).to_lowercase()) {
                    candidates.push(i);
                }
            }
            if candidates.is_empty() {
                if let Some(found) = self.names.get(&no_ext(&path).to_lowercase()) {
                    candidates = found.clone();
                }
            }
            candidates
        };
        if candidates.len() > 1 {
            return Target::Ambiguous(format!("Ambiguous note target: {input}"));
        }
        if let Some(i) = candidates.first() {
            let m = &self.metas[*i];
            let block = if let Some(f) = fragment {
                let Some(f) = decode(f) else {
                    return Target::Missing("Invalid escaped block target".into());
                };
                let key = if let Some(b) = f.strip_prefix('^') {
                    format!("block:{b}")
                } else {
                    format!("heading:{}", f.trim().to_lowercase())
                };
                let mut ids = m.anchors.get(&key).cloned().unwrap_or_default();
                if ids.is_empty() && !f.starts_with('^') {
                    for (k, v) in &m.anchors {
                        if let Some(h) = k.strip_prefix("heading:") {
                            if slug(h) == f.to_lowercase() {
                                ids.extend(v.clone());
                            }
                        }
                    }
                }
                ids.sort();
                ids.dedup();
                match ids.as_slice() {
                    [id] => Some(id.clone()),
                    [] => return Target::Missing(format!("Missing heading/block in {input}")),
                    _ => return Target::Ambiguous(format!("Ambiguous heading/block in {input}")),
                }
            } else {
                None
            };
            return Target::Note(m.id.clone(), block);
        }
        let relative = path_from(&source.path, &path, wiki);
        if let Some(i) = relative
            .as_ref()
            .and_then(|p| self.file_paths.get(&p.to_lowercase()))
            .or_else(|| self.file_paths.get(&path.to_lowercase()))
        {
            return Target::Asset(*i);
        }
        if wiki {
            if let Some(found) = self.file_names.get(&path.to_lowercase()) {
                return match found.as_slice() {
                    [i] => Target::Asset(*i),
                    _ => Target::Ambiguous(format!("Ambiguous attachment: {input}")),
                };
            }
        }
        Target::Missing(format!(
            "Unresolved target retained in source archive: {input}"
        ))
    }
}
fn href(id: &str, block: Option<&str>) -> String {
    format!(
        "noted://note/{id}{}",
        block.map(|b| format!("#block={b}")).unwrap_or_default()
    )
}
struct Conversion<'a> {
    profile: &'a str,
    resolver: Resolver<'a>,
    archive: &'a Path,
    store_root: &'a Path,
    issues: Vec<Issue>,
    assets: usize,
    asset_bytes: u64,
    asset_cache: HashMap<(String, usize), String>,
    references: usize,
}
impl Conversion<'_> {
    fn diagnostic(&mut self, m: &NoteMeta, line: usize, feature: &str, target: &Target) {
        let message=match target{Target::Missing(s)|Target::Ambiguous(s)=>s.clone(),Target::Asset(i)=>format!("Attachment {} is retained in the recovery archive; this format has no inline/opening support",self.resolver.files[*i].path),_=>return};
        self.issues.push(if matches!(target, Target::Ambiguous(_)) {
            Issue::blocked(&m.path, line, feature, &message)
        } else {
            Issue::warning(&m.path, line, feature, &message)
        });
    }
    fn link(
        &mut self,
        m: &NoteMeta,
        target: &str,
        wiki: bool,
        block: bool,
        line: usize,
    ) -> Option<String> {
        self.references += 1;
        if self.references > 200000 {
            if self.references == 200001 {
                self.issues.push(Issue::blocked(
                    &m.path,
                    line,
                    "reference-limit",
                    "Import exceeds 200000 references.",
                ));
            }
            return None;
        }
        let result = self.resolver.target(m, target, wiki, block);
        match &result {
            Target::Note(id, b) => Some(href(id, b.as_deref())),
            Target::Web(url) => Some(url.clone()),
            _ => {
                self.diagnostic(m, line, "link", &result);
                None
            }
        }
    }
    fn image(
        &mut self,
        m: &NoteMeta,
        target: &str,
        alt: &str,
        id: &str,
        line: usize,
        wiki: bool,
    ) -> Value {
        let r = self.resolver.target(m, target, wiki, false);
        let remote = matches!(r, Target::Web(_));
        if remote {
            self.issues.push(Issue::warning(&m.path,line,"remote-image","Remote image bytes were not fetched or archived; only its URL and description are preserved."));
        }
        if let Target::Asset(i) = r {
            let f = &self.resolver.files[i];
            let key = (m.id.clone(), i);
            let asset = if let Some(id) = self.asset_cache.get(&key) {
                Some(id.clone())
            } else if self.asset_bytes + f.bytes > MAX_TOTAL {
                self.issues.push(Issue::blocked(
                    &m.path,
                    line,
                    "asset-limit",
                    "Expanded note-owned image copies exceed the 512 MiB staging limit.",
                ));
                None
            } else {
                let bytes = read_bounded(&self.archive.join(format!("{}.source", f.id)), MAX_FILE);
                match bytes.and_then(|b| {
                    crate::assets::import(self.store_root, &m.id, &b, "").map(|a| a.id)
                }) {
                    Ok(id) => {
                        self.asset_bytes += f.bytes;
                        self.assets += 1;
                        self.asset_cache.insert(key, id.clone());
                        Some(id)
                    }
                    Err(_) => {
                        self.issues.push(Issue::warning(&m.path,line,"attachment","The attachment was retained in the recovery archive but is unsupported, oversized or not a valid raster image."));
                        None
                    }
                }
            };
            if let Some(asset) = asset {
                return json!({"type":"localImage","attrs":{"id":id,"assetId":asset,"alt":alt.chars().take(2000).collect::<String>(),"width":640,"placement":"flow","animation":"none"}});
            }
        } else {
            self.diagnostic(m, line, "image", &r);
        }
        json!({"type":"text","text":format!("[{} image: {alt} - {target}]",if remote{"Unfetched remote"}else{"Archived/unavailable"})})
    }
    fn embed(&mut self, m: &NoteMeta, target: &str, block: bool, line: usize) -> Value {
        let r = self.resolver.target(m, target, true, block);
        if let Target::Note(ref id, ref anchor) = r {
            if let Some(meta) = self.resolver.metas.iter().find(|n| &n.id == id) {
                if let Ok(bytes) = read_bounded(&meta.parsed_path, 16 * 1024 * 1024) {
                    if let Ok(parsed) = serde_json::from_slice::<markdown::Parsed>(&bytes) {
                        let original = anchor
                            .as_deref()
                            .and_then(|id| body(&parsed.content, id))
                            .unwrap_or(parsed.content);
                        let t = markdown::plain(&original);
                        self.issues.push(Issue::warning(&m.path,line,"embed","A labelled plain-text snapshot and source link replace live transclusion; source bytes remain archived."));
                        return json!({"type":"blockquote","attrs":{"id":format!("embed-{}",uuid::Uuid::new_v4())},"content":[{"type":"paragraph","attrs":{"id":format!("embed-text-{}",uuid::Uuid::new_v4())},"content":[{"type":"text","text":format!("Imported embed snapshot:\n{}",t.chars().take(10000).collect::<String>())}]},{"type":"paragraph","attrs":{"id":format!("embed-link-{}",uuid::Uuid::new_v4())},"content":[{"type":"text","text":"Source note","marks":[{"type":"link","attrs":{"href":href(&id,anchor.as_deref())}}]}]}]});
                    }
                }
            }
        }
        self.diagnostic(m, line, "embed", &r);
        json!({"type":"text","text":format!("[Unresolved embed: {target}]")})
    }
    fn transform(&mut self, m: &NoteMeta, mut v: Value, code: bool, line: usize) -> Vec<Value> {
        let line = v
            .pointer("/attrs/id")
            .and_then(Value::as_str)
            .and_then(|id| m.locations.get(id))
            .copied()
            .unwrap_or(line);
        let kind = v["type"].as_str().unwrap_or("").to_string();
        if kind == "importImage" {
            let target = v["attrs"]["target"].as_str().unwrap_or("").to_string();
            let id = v["attrs"]["id"].as_str().unwrap_or("").to_string();
            let l = v["attrs"]["line"].as_u64().unwrap_or(line as u64) as usize;
            let alt = markdown::plain(&v);
            let mut img = self.image(m, &target, &alt, &id, l, false);
            if let Some(t) = v["attrs"]["hrefTarget"].as_str() {
                if let Some(link) = self.link(m, t, false, false, l) {
                    if img["type"] == "localImage" {
                        img["attrs"]["href"] = json!(link);
                    }
                }
            }
            return vec![img];
        }
        if kind == "text" {
            let mut marks = vec![];
            for mark in v["marks"].as_array().into_iter().flatten() {
                if mark["type"] == "importLink" {
                    if let Some(link) = self.link(
                        m,
                        mark["attrs"]["target"].as_str().unwrap_or(""),
                        false,
                        false,
                        mark["attrs"]["line"].as_u64().unwrap_or(line as u64) as usize,
                    ) {
                        marks.push(json!({"type":"link","attrs":{"href":link}}));
                    }
                } else {
                    marks.push(mark.clone());
                }
            }
            if marks.is_empty() {
                v.as_object_mut().unwrap().remove("marks");
            } else {
                v["marks"] = json!(marks);
            }
            if code
                || v["marks"]
                    .as_array()
                    .is_some_and(|a| a.iter().any(|m| m["type"] == "code"))
            {
                return vec![v];
            }
            return self.tokens(m, v, line);
        }
        if let Some(a) = v.get_mut("content").and_then(Value::as_array_mut) {
            let old = std::mem::take(a);
            *a = old
                .into_iter()
                .flat_map(|n| self.transform(m, n, code || kind == "codeBlock", line))
                .collect();
        }
        vec![v]
    }
    fn tokens(&mut self, m: &NoteMeta, v: Value, line: usize) -> Vec<Value> {
        let source = v["text"].as_str().unwrap_or("");
        if !["obsidian", "logseq"].contains(&self.resolver_profile()) {
            return vec![v];
        }
        let mut template = v.clone();
        template.as_object_mut().unwrap().remove("text");
        let mut current_line = line;
        let mut out = vec![];
        let mut cursor = 0;
        while cursor < source.len() {
            let tail = &source[cursor..];
            let next = tail.char_indices().find_map(|(i, c)| {
                let t = &tail[i..];
                match c {
                    '{' if t.starts_with("{{embed ") => Some((i, "embed")),
                    '!' if t.starts_with("![[") => Some((i, "image")),
                    '[' if t.starts_with("[[") => Some((i, "wiki")),
                    '(' if t.starts_with("((") => Some((i, "block")),
                    _ => None,
                }
            });
            let Some((at, mode)) = next else {
                let mut n = template.clone();
                n["text"] = json!(tail);
                out.push(n);
                break;
            };
            if at > 0 {
                let mut n = template.clone();
                n["text"] = json!(&tail[..at]);
                out.push(n);
            }
            let token_line = current_line + tail[..at].bytes().filter(|b| *b == b'\n').count();
            let token = &tail[at..];
            let (prefix, suffix) = match mode {
                "embed" => (8, "}}"),
                "image" => (3, "]]"),
                "wiki" => (2, "]]"),
                _ => (2, "))"),
            };
            let Some(end) = token[prefix..].find(suffix).map(|i| i + prefix) else {
                let mut n = template.clone();
                n["text"] = json!(token);
                out.push(n);
                break;
            };
            let inner = &token[prefix..end];
            let (target, label) = inner.split_once('|').unwrap_or((inner, inner));
            let n = match mode {
                "image" => {
                    let r = self.resolver.target(m, target, true, false);
                    if matches!(r, Target::Asset(_)) {
                        self.image(
                            m,
                            target,
                            label,
                            &format!("image-{}", uuid::Uuid::new_v4()),
                            token_line,
                            true,
                        )
                    } else {
                        self.embed(m, target, false, token_line)
                    }
                }
                "embed" => {
                    let t = target.trim();
                    let block = t.starts_with("((") && t.ends_with("))");
                    let t = if block {
                        &t[2..t.len() - 2]
                    } else {
                        t.strip_prefix("[[")
                            .and_then(|s| s.strip_suffix("]]"))
                            .unwrap_or(t)
                    };
                    self.embed(m, t, block, token_line)
                }
                _ => {
                    let mut n = template.clone();
                    n["text"] = json!(label);
                    if let Some(href) = self.link(m, target, true, mode == "block", token_line) {
                        let mut a = n["marks"].as_array().cloned().unwrap_or_default();
                        a.retain(|x| x["type"] != "link");
                        a.push(json!({"type":"link","attrs":{"href":href}}));
                        n["marks"] = json!(a);
                    } else {
                        n["text"] = json!(token[..end + suffix.len()].to_owned());
                    }
                    n
                }
            };
            out.push(n);
            current_line = token_line
                + token[..end + suffix.len()]
                    .bytes()
                    .filter(|b| *b == b'\n')
                    .count();
            cursor += at + end + suffix.len();
        }
        out
    }
    fn resolver_profile(&self) -> &str {
        self.profile
    }
}
impl Service {
    pub fn preview(&self, source: &Path, profile: &str) -> Result<Report> {
        if !["markdown", "obsidian", "logseq"].contains(&profile) {
            return Err("Choose Markdown, Obsidian, or a Logseq file graph. DB/EDN/Mirror imports require a separate versioned adapter.".into());
        }
        local(source)?;
        for p in source.ancestors() {
            ordinary(p, true)?;
        }
        let source = source.canonicalize().map_err(err)?;
        let (entries, excluded) = inventory(&source)?;
        let mut identities = std::collections::HashSet::new();
        for (path, _) in &entries {
            if !identities.insert(path.to_lowercase()) {
                return Err("Source paths collide after case folding; correct an exported copy before importing".into());
            }
        }
        let stage = tempfile::tempdir().map_err(err)?;
        let root = stage.path().join("workspace");
        let mut store = Store::open(&root)?;
        let root = store.root.clone();
        let batch = uuid::Uuid::new_v4().to_string();
        let archive = root.join("imports").join(&batch);
        fs::create_dir_all(&archive).map_err(err)?;
        let parsed_dir = stage.path().join("parsed");
        fs::create_dir(&parsed_dir).map_err(err)?;
        let mut files = vec![];
        let mut issues = vec![];
        let mut total = 0u64;
        for (path, file) in entries {
            let bytes = read_bounded(&file, MAX_FILE).map_err(|e| format!("{path}: {e}"))?;
            total += bytes.len() as u64;
            if total > MAX_TOTAL {
                return Err("Source snapshot exceeds 512 MiB; choose a smaller export".into());
            }
            let id = uuid::Uuid::new_v4().to_string();
            atomic_write(&archive.join(format!("{id}.source")), &bytes)?;
            let metadata = fs::metadata(&file).map_err(err)?;
            files.push(SourceFile {
                id,
                path,
                bytes: bytes.len() as u64,
                sha256: hash(&bytes),
                source_created_at: metadata
                    .created()
                    .ok()
                    .map(|t| chrono::DateTime::<chrono::Utc>::from(t).to_rfc3339()),
                source_modified_at: metadata
                    .modified()
                    .ok()
                    .map(|t| chrono::DateTime::<chrono::Utc>::from(t).to_rfc3339()),
                disposition: "archived-only".into(),
                note_id: None,
            });
        }
        let mut metas = vec![];
        let mut anchors_count = 0;
        for f in &mut files {
            let ext = Path::new(&f.path)
                .extension()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_lowercase();
            if ext != "md" && ext != "markdown" {
                issues.push(Issue::warning(&f.path,1,"archived-source","Non-Markdown source is archived byte-for-byte. Referenced supported raster images can also be copied inline; other types remain archive-only."));
                continue;
            }
            if metas.len() >= 5000 {
                return Err("Import supports at most 5000 Markdown notes per batch".into());
            }
            if f.bytes > MAX_TEXT {
                issues.push(Issue::blocked(
                    &f.path,
                    1,
                    "size",
                    "Markdown file exceeds 2 MiB; it remains archived.",
                ));
                continue;
            }
            let bytes = read_bounded(&archive.join(format!("{}.source", f.id)), MAX_TEXT)?;
            let source_text = match String::from_utf8(bytes) {
                Ok(s) => s.trim_start_matches('\u{feff}').to_owned(),
                Err(_) => {
                    issues.push(Issue::blocked(&f.path,1,"encoding","This file is not valid UTF-8. Convert an exported copy explicitly; no replacement characters were inserted."));
                    continue;
                }
            };
            match markdown::parse(&f.path, &source_text, profile) {
                Ok(parsed) => {
                    anchors_count += parsed.locations.len();
                    if anchors_count > 100000 {
                        return Err("Import exceeds the 100000-anchor limit".into());
                    }
                    let id = uuid::Uuid::new_v4().to_string();
                    let title = parsed.title.clone().unwrap_or_else(|| {
                        Path::new(&f.path)
                            .file_stem()
                            .unwrap_or_default()
                            .to_string_lossy()
                            .into_owned()
                    });
                    if title.len() > 1024
                        || parsed.tags.len() > 100
                        || parsed.tags.iter().any(|t| t.len() > 256)
                    {
                        issues.push(Issue::blocked(&f.path,1,"metadata","Title or tags exceed Noted's limits; original metadata remains archived."));
                        continue;
                    }
                    let p = parsed_dir.join(format!("{id}.json"));
                    let b = serde_json::to_vec(&parsed).map_err(err)?;
                    if b.len() > 16 * 1024 * 1024 {
                        issues.push(Issue::blocked(
                            &f.path,
                            1,
                            "document-size",
                            "Converted document exceeds its staging limit.",
                        ));
                        continue;
                    }
                    atomic_write(&p, &b)?;
                    issues.extend(parsed.issues);
                    metas.push(NoteMeta {
                        id: id.clone(),
                        path: f.path.clone(),
                        title,
                        aliases: parsed.aliases,
                        tags: parsed.tags,
                        anchors: parsed.anchors,
                        locations: parsed.locations,
                        parsed_path: p,
                    });
                    f.disposition = "imported-note".into();
                    f.note_id = Some(id);
                }
                Err(e) => issues.push(Issue::blocked(&f.path, 1, "parse", &e)),
            }
        }
        if metas.is_empty() {
            issues.push(Issue::blocked(
                "",
                1,
                "empty",
                "No supported UTF-8 Markdown notes were found.",
            ));
        }
        let resolver = Resolver::new(&metas, &files);
        for entries in resolver.uuids.values() {
            if entries.len() > 1 {
                issues.push(Issue::blocked("",1,"identity","Duplicate source block/page UUIDs require correction in an exported copy before import."));
            }
        }
        let mut conversion = Conversion {
            profile,
            resolver,
            archive: &archive,
            store_root: &root,
            issues: vec![],
            assets: 0,
            asset_bytes: 0,
            asset_cache: HashMap::new(),
            references: 0,
        };
        let mut folder_ids = HashMap::<String, String>::new();
        let mut notes = vec![];
        for m in &metas {
            let parent = Path::new(&m.path)
                .parent()
                .and_then(|p| p.to_str())
                .unwrap_or("")
                .replace('\\', "/");
            let mut folder = None;
            let mut built = String::new();
            for name in parent.split('/').filter(|s| !s.is_empty()) {
                if !built.is_empty() {
                    built.push('/');
                }
                built.push_str(name);
                if let Some(id) = folder_ids.get(&built) {
                    folder = Some(id.clone());
                } else {
                    let f = store.create_folder(name.into(), folder.clone())?;
                    folder_ids.insert(built.clone(), f.id.clone());
                    folder = Some(f.id);
                }
            }
            let parsed: markdown::Parsed =
                serde_json::from_slice(&read_bounded(&m.parsed_path, 16 * 1024 * 1024)?)
                    .map_err(err)?;
            let mut content = conversion
                .transform(m, parsed.content, false, 1)
                .pop()
                .ok_or("Empty converted document")?;
            content = markdown::normalize(content)
                .pop()
                .ok_or("Empty normalized document")?;
            let document = crate::document::migrate(&m.id, &content);
            let now = chrono::Utc::now().to_rfc3339();
            let n = Note {
                format_version: 2,
                id: m.id.clone(),
                title: m.title.clone(),
                folder_id: folder,
                tags: m.tags.clone(),
                revision: 1,
                created_at: files
                    .iter()
                    .find(|f| f.path == m.path)
                    .and_then(|f| f.source_created_at.clone().or(f.source_modified_at.clone()))
                    .unwrap_or(now.clone()),
                updated_at: files
                    .iter()
                    .find(|f| f.path == m.path)
                    .and_then(|f| f.source_modified_at.clone())
                    .unwrap_or(now),
                content,
                document: Some(document),
                presentation: Presentation {
                    schema_id: "default".into(),
                },
                revision_token: String::new(),
            };
            match store.validate(&n).and_then(|_| store.commit(n)) {
                Ok(_) => notes.push(NotePreview {
                    id: m.id.clone(),
                    source: m.path.clone(),
                    title: m.title.clone(),
                    folder: parent,
                    tags: m.tags.clone(),
                }),
                Err(e) => issues.push(Issue::blocked(
                    &m.path,
                    1,
                    "validation",
                    &format!(
                        "Converted note could not be validated: {e}. Original source is archived."
                    ),
                )),
            }
        }
        let assets = conversion.assets;
        issues.extend(std::mem::take(&mut conversion.issues));
        drop(conversion);
        if issues.len() > 20000 {
            return Err(
                "Import produced more than 20000 diagnostics; choose a smaller export".into(),
            );
        }
        let warnings = issues.iter().filter(|i| i.severity == "warning").count();
        let blockers = issues.iter().filter(|i| i.severity == "blocked").count();
        let mut report = Report {
            format_version: 1,
            batch_id: batch.clone(),
            profile: profile.into(),
            source_root: crate::backup::display_path(&source),
            source_digest: snapshot_digest(&files),
            files,
            notes,
            excluded,
            issues,
            assets,
            folders: folder_ids.len(),
            warnings,
            blockers,
            created_at: chrono::Utc::now().to_rfc3339(),
            review_digest: String::new(),
            target: String::new(),
        };
        report.review_digest = hash(&serde_json::to_vec(&report).map_err(err)?);
        atomic_write(
            &archive.join("report.json"),
            &serde_json::to_vec_pretty(&report).map_err(err)?,
        )?;
        drop(store);
        let mut plans = self
            .plans
            .lock()
            .map_err(|_| "Import preview lock failed")?;
        plans.retain(|_, p| p.created.elapsed() < Duration::from_secs(7200));
        if plans.len() >= 3 {
            return Err("Close/cancel another import preview before starting a fourth".into());
        }
        plans.insert(
            batch,
            Plan {
                stage,
                source,
                report: report.clone(),
                created: Instant::now(),
            },
        );
        Ok(report)
    }
    pub fn cancel(&self, id: &str) -> Result<()> {
        valid_id(id)?;
        self.plans
            .lock()
            .map_err(|_| "Import preview lock failed")?
            .remove(id);
        Ok(())
    }
    pub fn publish(
        &self,
        id: &str,
        target: &Path,
        digest: &str,
        accept_warnings: bool,
        active_root: &Path,
    ) -> Result<Report> {
        local(target)?;
        let mut plans = self
            .plans
            .lock()
            .map_err(|_| "Import preview lock failed")?;
        let plan = plans
            .get(id)
            .ok_or("Import preview expired; run a new dry run")?;
        if plan.report.review_digest != digest || plan.created.elapsed() > Duration::from_secs(7200)
        {
            return Err("Import preview changed or expired; run a new dry run".into());
        }
        if plan.report.blockers > 0 {
            return Err("Resolve the blocked items in an exported copy before importing".into());
        }
        if plan.report.warnings > 0 && !accept_warnings {
            return Err(
                "Review and explicitly accept the reported fallbacks before importing".into(),
            );
        }
        let dest = crate::backup::destination(target)?;
        if dest.starts_with(&plan.source)
            || dest.starts_with(active_root)
            || plan.source.starts_with(&dest)
        {
            return Err("Import into a new folder outside the source and active workspace".into());
        }
        let (current, _) = inventory(&plan.source)?;
        if current.len() != plan.report.files.len() {
            return Err("The source export changed after preview. Run a new dry run.".into());
        }
        for ((path, file), saved) in current.iter().zip(&plan.report.files) {
            if path != &saved.path || hash(&read_bounded(file, MAX_FILE)?) != saved.sha256 {
                return Err("Source bytes changed after preview. Run a new dry run; no destination was created.".into());
            }
        }
        fs::create_dir(&dest).map_err(err)?;
        let marker = dest.join(".noted-import-incomplete");
        atomic_write(
            &marker,
            b"Incomplete import; keep source and use a new destination if interrupted",
        )?;
        fn copy_tree(from: &Path, to: &Path, depth: usize) -> Result<()> {
            if depth > 5 {
                return Err("Unexpected staged import depth".into());
            }
            ordinary(from, true)?;
            for entry in fs::read_dir(from).map_err(err)? {
                let p = entry.map_err(err)?.path();
                let target = to.join(p.file_name().ok_or("Invalid staged name")?);
                let m = fs::symlink_metadata(&p).map_err(err)?;
                ordinary(&p, m.is_dir())?;
                if m.is_dir() {
                    fs::create_dir(&target).map_err(err)?;
                    copy_tree(&p, &target, depth + 1)?;
                } else {
                    let mut source = fs::File::open(&p).map_err(err)?;
                    let mut f = fs::OpenOptions::new()
                        .write(true)
                        .create_new(true)
                        .open(&target)
                        .map_err(err)?;
                    std::io::copy(&mut source, &mut f).map_err(err)?;
                    f.sync_all().map_err(err)?;
                }
            }
            Ok(())
        }
        let stage_root = plan.stage.path().join("workspace");
        for collection in ["notes", "folders", "assets", "imports"] {
            let p = stage_root.join(collection);
            if p.exists() {
                let to = dest.join(collection);
                fs::create_dir(&to).map_err(err)?;
                copy_tree(&p, &to, 0)?;
            }
        }
        let mut validated = Store::open_import_staging(&dest)?;
        validated.rebuild_index()?;
        if validated.list_notes()?.len() != plan.report.notes.len() {
            return Err("Published note count did not match the reviewed import. The incomplete destination is preserved; keep the source.".into());
        }
        for f in &plan.report.files {
            let p = dest
                .join("imports")
                .join(id)
                .join(format!("{}.source", f.id));
            if hash(&read_bounded(&p, MAX_FILE)?) != f.sha256 {
                return Err(
                    "Source archive checksum mismatch; incomplete destination preserved".into(),
                );
            }
        }
        drop(validated);
        fs::remove_file(&marker).map_err(err)?;
        let mut report = plan.report.clone();
        report.target = crate::backup::display_path(&dest);
        plans.remove(id);
        Ok(report)
    }
}
impl Store {
    pub fn migration_reports(&self) -> Result<Vec<Report>> {
        let root = self.root.join("imports");
        if !root.exists() {
            return Ok(vec![]);
        }
        ordinary(&root, true)?;
        let mut reports = vec![];
        for entry in fs::read_dir(root).map_err(err)?.take(100) {
            let dir = entry.map_err(err)?.path();
            ordinary(&dir, true)?;
            let p = dir.join("report.json");
            if p.exists() {
                let r: Report =
                    serde_json::from_slice(&read_bounded(&p, 16 * 1024 * 1024)?).map_err(err)?;
                valid_id(&r.batch_id)?;
                if dir.file_name().and_then(|n| n.to_str()) != Some(&r.batch_id) {
                    return Err("Migration report identity mismatch".into());
                }
                reports.push(r);
            }
        }
        Ok(reports)
    }
    pub fn export_migration_sources(&self, batch: &str, target: &Path) -> Result<usize> {
        valid_id(batch)?;
        local(target)?;
        let report = self
            .migration_reports()?
            .into_iter()
            .find(|r| r.batch_id == batch)
            .ok_or("Migration report is missing")?;
        let dest = crate::backup::destination(target)?;
        if dest.starts_with(&self.root) {
            return Err("Export originals outside the active workspace".into());
        }
        for f in &report.files {
            valid_id(&f.id)?;
            if !safe_relative(&f.path) || f.bytes > MAX_FILE {
                return Err("Unsafe archived-source metadata".into());
            }
        }
        fs::create_dir(&dest).map_err(err)?;
        let marker = dest.join(".noted-source-export-incomplete");
        atomic_write(&marker, b"Incomplete source recovery export")?;
        let mut total = 0;
        for f in &report.files {
            total += f.bytes;
            if total > MAX_TOTAL {
                return Err("Archived sources exceed their export limit".into());
            }
            let bytes = read_bounded(
                &self
                    .root
                    .join("imports")
                    .join(batch)
                    .join(format!("{}.source", f.id)),
                MAX_FILE,
            )?;
            if bytes.len() as u64 != f.bytes || hash(&bytes) != f.sha256 {
                return Err(
                    "Archived source checksum mismatch; incomplete export preserved".into(),
                );
            }
            let p = dest.join(&f.path);
            if let Some(parent) = p.parent() {
                fs::create_dir_all(parent).map_err(err)?;
                for part in parent.ancestors() {
                    if part == dest {
                        break;
                    }
                    ordinary(part, true)?;
                }
            }
            let mut out = fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(p)
                .map_err(err)?;
            out.write_all(&bytes).map_err(err)?;
            out.sync_all().map_err(err)?;
        }
        fs::remove_file(marker).map_err(err)?;
        Ok(report.files.len())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    const PNG: &[u8] = &[
        137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6,
        0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 11, 73, 68, 65, 84, 120, 156, 99, 248, 15, 4, 0, 9,
        251, 3, 253, 251, 94, 107, 43, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
    ];
    fn source(t: &Path) -> PathBuf {
        let s = t.join("source");
        fs::create_dir(&s).unwrap();
        s
    }
    fn write(p: &Path, data: impl AsRef<[u8]>) {
        fs::create_dir_all(p.parent().unwrap()).unwrap();
        fs::write(p, data).unwrap();
    }
    fn active(t: &Path) -> PathBuf {
        let s = Store::open(t.join("active")).unwrap();
        s.root.clone()
    }
    #[test]
    fn obsidian_dry_run_is_frozen_and_publish_preserves_links_assets_sources_and_backups() {
        let t = tempfile::tempdir().unwrap();
        let src = source(t.path());
        write(&src.join("A.md"),b"---\ntitle: Project\naliases: [Plan, Blueprint]\ntags: [work, study]\n---\n# Welcome\nKeep **strong** *words* and `code`.\n\n[Details](docs/B.md#Details) and [[docs/B#^anchor|Anchored]].\n\n![Tiny](media/tiny.png)\n\n[Manual](manual.pdf)\n\n| Key | Value |\n| --- | --- |\n| one | two |\n\n<script>alert('never execute')</script>\n");
        write(
            &src.join("docs/B.md"),
            b"# Details\nPreserve this block. ^anchor\n",
        );
        write(&src.join("media/tiny.png"), PNG);
        write(&src.join("manual.pdf"), b"PDF fixture bytes");
        write(
            &src.join(".obsidian/plugins/not-imported.js"),
            b"EXCLUDED_PLUGIN_CANARY",
        );
        let before = fs::read(src.join("A.md")).unwrap();
        let service = Service::default();
        let report = service.preview(&src, "obsidian").unwrap();
        assert_eq!(report.blockers, 0, "{:?}", report.issues);
        assert_eq!(report.notes.len(), 2);
        assert_eq!(report.assets, 1);
        assert!(report.warnings > 0);
        assert!(report.excluded.contains(&".obsidian".into()));
        assert!(!serde_json::to_string(&report)
            .unwrap()
            .contains("EXCLUDED_PLUGIN_CANARY"));
        assert_eq!(fs::read(src.join("A.md")).unwrap(), before);
        let dest = t.path().join("migrated");
        assert!(service
            .publish(
                &report.batch_id,
                &dest,
                &report.review_digest,
                false,
                &active(t.path())
            )
            .is_err());
        assert!(!dest.exists());
        let done = service
            .publish(
                &report.batch_id,
                &dest,
                &report.review_digest,
                true,
                &active(t.path()),
            )
            .unwrap();
        assert!(!done.target.is_empty());
        let store = Store::open(&dest).unwrap();
        let a = store
            .list_notes()
            .unwrap()
            .into_iter()
            .find(|n| n.title == "Project")
            .unwrap();
        let n = store.load_note(&a.id).unwrap();
        let encoded = serde_json::to_string(&n.content).unwrap();
        assert!(encoded.contains("#block="));
        assert!(encoded.contains("localImage"));
        assert!(encoded.contains("tableHeader"));
        assert!(encoded.contains("alert('never execute')"));
        assert_eq!(store.list_references(&a.id, 0, 40).unwrap().total, 1);
        assert_eq!(store.migration_reports().unwrap().len(), 1);
        assert!(!store.agent_access().unwrap().enabled);
        let export = t.path().join("recovered-originals");
        assert_eq!(
            store
                .export_migration_sources(&report.batch_id, &export)
                .unwrap(),
            4
        );
        assert_eq!(fs::read(export.join("A.md")).unwrap(), before);
        assert_eq!(
            fs::read(export.join("manual.pdf")).unwrap(),
            b"PDF fixture bytes"
        );
        let backup = t.path().join("imported.noted-backup");
        store.create_backup(&backup).unwrap();
        let reviewed = crate::backup::inspect_backup(&backup).unwrap();
        let restored = t.path().join("restored");
        crate::backup::restore_backup(&backup, &restored, &reviewed.digest).unwrap();
        let restored = Store::open(restored).unwrap();
        assert_eq!(restored.migration_reports().unwrap()[0].files.len(), 4);
        assert!(!restored.agent_access().unwrap().enabled);
    }
    #[test]
    fn logseq_block_uuids_tasks_and_inert_embed_snapshots_survive() {
        let t = tempfile::tempdir().unwrap();
        let src = source(t.path());
        write(&src.join("pages/Alpha.md"),b"title:: Alpha\ntags:: [[learning]]\n- TODO Keep original task label\n  id:: 11111111-1111-4111-8111-111111111111\n  - Child block\n    id:: 22222222-2222-4222-8222-222222222222\n- Reference ((22222222-2222-4222-8222-222222222222))\n- {{embed ((11111111-1111-4111-8111-111111111111))}}\n");
        let service = Service::default();
        let r = service.preview(&src, "logseq").unwrap();
        assert_eq!(r.blockers, 0, "{:?}", r.issues);
        let dest = t.path().join("migrated");
        service
            .publish(
                &r.batch_id,
                &dest,
                &r.review_digest,
                true,
                &active(t.path()),
            )
            .unwrap();
        let s = Store::open(dest).unwrap();
        let n = s.load_note(&r.notes[0].id).unwrap();
        let encoded = serde_json::to_string(&n.content).unwrap();
        assert!(encoded.contains("taskItem"));
        assert!(encoded.contains("TODO Keep original task label"));
        assert!(encoded.contains("#block=22222222-2222-4222-8222-222222222222"));
        assert!(encoded.contains("Imported embed snapshot"));
        assert_eq!(n.tags, vec!["learning"]);
    }
    #[test]
    fn ambiguity_and_changed_sources_block_publication_without_creating_a_target() {
        let t = tempfile::tempdir().unwrap();
        let src = source(t.path());
        write(&src.join("A.md"), b"[[Same]]\n");
        write(&src.join("Same.md"), b"First same\n");
        write(&src.join("nested/Same.md"), b"Second same\n");
        let service = Service::default();
        let r = service.preview(&src, "obsidian").unwrap();
        assert!(r.blockers > 0);
        let dest = t.path().join("blocked");
        assert!(service
            .publish(
                &r.batch_id,
                &dest,
                &r.review_digest,
                true,
                &active(t.path())
            )
            .is_err());
        assert!(!dest.exists());
        write(&src.join("A.md"), b"[Explicit](nested/Same.md)\n");
        let r = service.preview(&src, "obsidian").unwrap();
        assert_eq!(r.blockers, 0);
        write(&src.join("Same.md"), b"Changed after review\n");
        assert!(service
            .publish(
                &r.batch_id,
                &dest,
                &r.review_digest,
                true,
                &active(t.path())
            )
            .is_err());
        assert!(!dest.exists());
    }
    #[test]
    fn external_paths_and_remote_images_are_not_read_or_fetched() {
        let t = tempfile::tempdir().unwrap();
        let src = source(t.path());
        write(&t.path().join("secret.md"), b"OUTSIDE_SOURCE_CANARY");
        write(&src.join("A.md"),b"[Outside](../secret.md) [Bad](javascript:alert(1)) ![Remote](https://example.invalid/a.png)\n");
        let service = Service::default();
        let r = service.preview(&src, "markdown").unwrap();
        assert_eq!(r.blockers, 0);
        assert!(r.issues.iter().any(|i| i.feature == "remote-image"));
        assert_eq!(r.files.len(), 1);
        let dest = t.path().join("migrated");
        service
            .publish(
                &r.batch_id,
                &dest,
                &r.review_digest,
                true,
                &active(t.path()),
            )
            .unwrap();
        let s = Store::open(dest).unwrap();
        let n = s.load_note(&r.notes[0].id).unwrap();
        let encoded = serde_json::to_string(&n.content).unwrap();
        assert!(!encoded.contains("OUTSIDE_SOURCE_CANARY"));
        assert!(!encoded.contains("\"href\":\"javascript:"));
        assert!(!encoded.contains("localImage"));
    }
    #[test]
    fn existing_and_incomplete_destinations_are_never_overwritten_or_opened() {
        let t = tempfile::tempdir().unwrap();
        let src = source(t.path());
        write(&src.join("A.md"), b"My original words\n");
        let service = Service::default();
        let r = service.preview(&src, "markdown").unwrap();
        let dest = t.path().join("existing");
        write(&dest.join("important.txt"), b"preserve me");
        assert!(service
            .publish(
                &r.batch_id,
                &dest,
                &r.review_digest,
                true,
                &active(t.path())
            )
            .is_err());
        assert_eq!(
            fs::read(dest.join("important.txt")).unwrap(),
            b"preserve me"
        );
        write(&dest.join(".noted-import-incomplete"), b"interrupted");
        assert!(Store::open(&dest).is_err());
        let inside = src.join("cannot-write-here");
        assert!(service
            .publish(
                &r.batch_id,
                &inside,
                &r.review_digest,
                true,
                &active(t.path())
            )
            .is_err());
        assert!(!inside.exists());
    }
    #[test]
    fn invalid_utf8_and_unsupported_db_graphs_are_reported_without_substitution() {
        let t = tempfile::tempdir().unwrap();
        let src = source(t.path());
        write(&src.join("A.md"), [0xff, 0xfe]);
        let service = Service::default();
        let r = service.preview(&src, "markdown").unwrap();
        assert!(r.blockers > 0);
        assert!(r.issues.iter().any(|i| i.feature == "encoding"));
        assert!(service.preview(&src, "logseq-db").is_err());
    }
}
