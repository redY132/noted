//! Opt-in local inference. No model hub client is linked into the inference path.
use fastembed::{
    InitOptionsUserDefined, Pooling, QuantizationMode, TextEmbedding, TokenizerFiles,
    UserDefinedEmbeddingModel,
};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    collections::{HashMap, HashSet},
    fs,
    io::Read,
    path::{Path, PathBuf},
    sync::{mpsc, Arc, Mutex},
    thread,
    time::{Duration, Instant, SystemTime},
};
use usearch::{new_index, Index, IndexOptions, MetricKind, ScalarKind};

type Result<T> = std::result::Result<T, String>;
/// A neighbor index supplies candidates, not evidence that they are related.
/// Accept only whole-note similarity; one matching template window is insufficient.
pub const MIN_SEMANTIC_SIMILARITY: f32 = 0.60;
const MODEL: &str = "minilm-l6-v2-q8-751bff3-extract1";
const REVISION: &str = "751bff37182d3f1213fa05d7196b954e230abad9";
const FILES: &[(&str, u64, &str)] = &[
    (
        "onnx/model_quantized.onnx",
        22972370,
        "afdb6f1a0e45b715d0bb9b11772f032c399babd23bfc31fed1c170afc848bdb1",
    ),
    (
        "tokenizer.json",
        711661,
        "da0e79933b9ed51798a3ae27893d3c5fa4a201126cef75586296df9b4d2c62a0",
    ),
    (
        "config.json",
        650,
        "7135149f7cffa1a573466c6e4d8423ed73b62fd2332c575bf738a0d033f70df7",
    ),
    (
        "special_tokens_map.json",
        125,
        "b6d346be366a7d1d48332dbc9fdf3bf8960b5d879522b7799ddba59e76237ee3",
    ),
    (
        "tokenizer_config.json",
        366,
        "9261e7d79b44c8195c1cada2b453e55b00aeb81e907a6664974b4d7776172ab3",
    ),
];
fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}
fn hash(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
fn hash_file(path: &Path) -> Result<String> {
    let mut file = fs::File::open(path).map_err(err)?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 65536];
    loop {
        let n = file.read(&mut buffer).map_err(err)?;
        if n == 0 {
            break;
        }
        hasher.update(&buffer[..n]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SemanticSettings {
    pub enabled: bool,
    pub paused: bool,
    pub allow_battery: bool,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SemanticStatus {
    pub experimental: bool,
    pub settings: SemanticSettings,
    pub model_ready: bool,
    pub download_bytes: u64,
    pub model_bytes: u64,
    pub downloading: bool,
    pub indexed: usize,
    pub total: usize,
    pub generation: u64,
    pub on_battery: bool,
    pub busy: bool,
    pub error: Option<String>,
}
#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SemanticMatch {
    pub note_id: String,
    pub score: f32,
}
struct Shared {
    status: SemanticStatus,
    active_note: Option<String>,
    last_typing: Instant,
    remove: bool,
    stop: bool,
    cache: HashMap<String, (u64, Vec<SemanticMatch>)>,
    pending: HashSet<String>,
}
enum Command {
    Related(String),
}
pub struct SemanticService {
    root: PathBuf,
    shared: Arc<Mutex<Shared>>,
    tx: mpsc::Sender<Command>,
}
impl SemanticService {
    pub fn start(root: PathBuf) -> Result<Self> {
        let directory = root.join("semantic");
        safe_directory(&directory)?;
        let settings = fs::read(directory.join("settings.json"))
            .ok()
            .and_then(|b| serde_json::from_slice(&b).ok())
            .unwrap_or_default();
        let shared = Arc::new(Mutex::new(Shared {
            status: SemanticStatus {
                experimental: true,
                settings,
                model_ready: false,
                download_bytes: 0,
                model_bytes: FILES.iter().map(|f| f.1).sum(),
                downloading: false,
                indexed: 0,
                total: 0,
                generation: 0,
                on_battery: battery(),
                busy: false,
                error: None,
            },
            active_note: None,
            last_typing: Instant::now() - Duration::from_secs(10),
            remove: false,
            stop: false,
            cache: HashMap::new(),
            pending: HashSet::new(),
        }));
        let (tx, rx) = mpsc::channel();
        let worker = shared.clone();
        let path = root.clone();
        thread::Builder::new()
            .name("noted-local-semantics".into())
            .spawn(move || worker_loop(path, worker, rx))
            .map_err(err)?;
        Ok(Self { root, shared, tx })
    }
    pub fn status(&self) -> SemanticStatus {
        self.shared.lock().unwrap().status.clone()
    }
    pub fn settings(&self, settings: SemanticSettings) -> Result<SemanticStatus> {
        crate::store::atomic_write(
            &self.root.join("semantic/settings.json"),
            &serde_json::to_vec(&settings).map_err(err)?,
        )?;
        let mut s = self.shared.lock().map_err(err)?;
        if !settings.enabled {
            s.cache.clear();
            s.pending.clear();
        }
        s.status.settings = settings;
        drop(s);
        Ok(self.status())
    }
    pub fn activity(&self, note_id: Option<String>, typing: bool) -> Result<()> {
        if let Some(id) = &note_id {
            valid_id(id)?;
        }
        let mut state = self.shared.lock().map_err(err)?;
        state.active_note = note_id;
        if typing {
            state.last_typing = Instant::now();
        }
        Ok(())
    }
    pub fn related(&self, note_id: String) -> Result<Vec<SemanticMatch>> {
        valid_id(&note_id)?;
        if !self.status().settings.enabled || !self.status().model_ready {
            return Ok(vec![]);
        }
        let mut s = self.shared.lock().map_err(err)?;
        let cached = s.cache.get(&note_id).cloned();
        let generation = s.status.generation;
        if cached.as_ref().is_none_or(|(g, _)| *g != generation)
            && s.pending.insert(note_id.clone())
        {
            self.tx.send(Command::Related(note_id)).map_err(err)?;
        }
        Ok(cached.map(|(_, results)| results).unwrap_or_default())
    }
    pub fn remove_data(&self) -> Result<SemanticStatus> {
        self.settings(SemanticSettings::default())?;
        let mut s = self.shared.lock().map_err(err)?;
        s.remove = true;
        s.cache.clear();
        s.pending.clear();
        drop(s);
        Ok(self.status())
    }
    /// A native file picker is not necessary: offline packs are plain folders.
    pub fn install_pack(&self, path: String) -> Result<SemanticStatus> {
        self.install(Some(PathBuf::from(path)))
    }
    pub fn download(&self) -> Result<SemanticStatus> {
        self.install(None)
    }
    fn install(&self, source: Option<PathBuf>) -> Result<SemanticStatus> {
        {
            let mut s = self.shared.lock().map_err(err)?;
            if s.status.downloading {
                return Err("Model installation is already running".into());
            }
            s.status.downloading = true;
            s.status.download_bytes = 0;
            s.status.error = None;
        }
        let root = self.root.clone();
        let shared = self.shared.clone();
        thread::spawn(move || {
            let result = install_model(&root, source.as_deref(), &shared);
            let mut s = shared.lock().unwrap();
            s.status.downloading = false;
            match result {
                Ok(()) => s.status.model_ready = true,
                Err(e) => s.status.error = Some(e),
            }
        });
        Ok(self.status())
    }
}
impl Drop for SemanticService {
    fn drop(&mut self) {
        if let Ok(mut s) = self.shared.lock() {
            s.stop = true
        }
    }
}
fn valid_id(id: &str) -> Result<()> {
    if uuid::Uuid::parse_str(id).map_err(err)?.to_string() != id {
        Err("Invalid note identifier".into())
    } else {
        Ok(())
    }
}
fn safe_directory(path: &Path) -> Result<()> {
    if path.exists() {
        let m = fs::symlink_metadata(path).map_err(err)?;
        if m.file_type().is_symlink() || !m.is_dir() || m.file_attributes_windows_reparse() {
            return Err("Semantic directories must be ordinary local directories".into());
        }
    }
    fs::create_dir_all(path).map_err(err)
}
trait Reparse {
    fn file_attributes_windows_reparse(&self) -> bool;
}
impl Reparse for fs::Metadata {
    fn file_attributes_windows_reparse(&self) -> bool {
        #[cfg(windows)]
        {
            use std::os::windows::fs::MetadataExt;
            self.file_attributes() & 0x400 != 0
        }
        #[cfg(not(windows))]
        {
            false
        }
    }
}
fn verify_file(directory: &Path, file: (&str, u64, &str)) -> Result<Vec<u8>> {
    let path = directory.join(file.0);
    let metadata = fs::symlink_metadata(&path).map_err(err)?;
    if !metadata.is_file()
        || metadata.file_type().is_symlink()
        || metadata.file_attributes_windows_reparse()
        || metadata.len() != file.1
    {
        return Err(format!("Invalid model file: {}", file.0));
    }
    let bytes = fs::read(&path).map_err(err)?;
    if hash(&bytes) != file.2 {
        return Err(format!("Model checksum mismatch: {}", file.0));
    }
    Ok(bytes)
}
fn verify_model(root: &Path) -> Result<()> {
    let directory = root.join("semantic/model");
    for file in FILES {
        verify_file(&directory, *file)?;
    }
    Ok(())
}
fn install_model(root: &Path, source: Option<&Path>, shared: &Arc<Mutex<Shared>>) -> Result<()> {
    let directory = root.join("semantic/model");
    safe_directory(&directory)?;
    safe_directory(&directory.join("onnx"))?;
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(180))
        .https_only(true)
        .build()
        .map_err(err)?;
    for &(name, size, digest) in FILES {
        if shared.lock().map_err(err)?.remove {
            return Err("Model installation cancelled".into());
        }
        let bytes = if let Some(source) = source {
            verify_file(source, (name, size, digest))?
        } else {
            let url =
                format!("https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/{REVISION}/{name}");
            let mut response = client
                .get(url)
                .send()
                .map_err(err)?
                .error_for_status()
                .map_err(err)?;
            let mut bytes = Vec::with_capacity(size as usize);
            response
                .by_ref()
                .take(size + 1)
                .read_to_end(&mut bytes)
                .map_err(err)?;
            if bytes.len() as u64 != size || hash(&bytes) != digest {
                return Err(format!("Model download integrity failure: {name}"));
            }
            bytes
        };
        crate::store::atomic_write(&directory.join(name), &bytes)?;
        shared.lock().map_err(err)?.status.download_bytes += size;
    }
    verify_model(root)
}
fn load_model(root: &Path) -> Result<TextEmbedding> {
    tokenizers::utils::parallelism::set_parallelism(false);
    verify_model(root)?;
    let folder = root.join("semantic/model");
    let read = |name| fs::read(folder.join(name)).map_err(err);
    let files = TokenizerFiles {
        tokenizer_file: read("tokenizer.json")?,
        config_file: read("config.json")?,
        special_tokens_map_file: read("special_tokens_map.json")?,
        tokenizer_config_file: read("tokenizer_config.json")?,
    };
    let model = UserDefinedEmbeddingModel::new(read("onnx/model_quantized.onnx")?, files)
        .with_pooling(Pooling::Mean)
        .with_quantization(QuantizationMode::Dynamic);
    TextEmbedding::try_new_from_user_defined(
        model,
        InitOptionsUserDefined::new()
            .with_intra_threads(1)
            .with_max_length(256),
    )
    .map_err(err)
}
fn new_ann() -> Result<Index> {
    new_index(&IndexOptions {
        dimensions: 384,
        metric: MetricKind::Cos,
        quantization: ScalarKind::F16,
        connectivity: 16,
        expansion_add: 128,
        expansion_search: 128,
        multi: false,
    })
    .map_err(err)
}
fn text_of(node: &Value, out: &mut String) {
    if let Some(text) = node.get("text").and_then(Value::as_str) {
        out.push_str(text)
    }
    if let Some(content) = node.get("content").and_then(Value::as_array) {
        for child in content {
            text_of(child, out)
        }
    }
    if matches!(
        node.get("type").and_then(Value::as_str),
        Some("paragraph" | "heading" | "codeBlock" | "listItem" | "tableCell")
    ) {
        out.push('\n')
    }
}
pub fn authored_text(note: &Value) -> String {
    let mut text = note
        .get("title")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    text.push('\n');
    text_of(&note["content"], &mut text);
    text
}
fn note_text(root: &Path, id: &str) -> Result<String> {
    valid_id(id)?;
    let parent = fs::symlink_metadata(root.join("notes")).map_err(err)?;
    if !parent.is_dir()
        || parent.file_type().is_symlink()
        || parent.file_attributes_windows_reparse()
    {
        return Err("Note directory was redirected".into());
    }
    let path = root.join("notes").join(format!("{id}.json"));
    let m = fs::symlink_metadata(&path).map_err(err)?;
    if !m.is_file()
        || m.file_type().is_symlink()
        || m.file_attributes_windows_reparse()
        || m.len() > 8 * 1024 * 1024
    {
        return Err("Invalid semantic source".into());
    }
    let n: Value = serde_json::from_slice(&fs::read(path).map_err(err)?).map_err(err)?;
    if n.get("id").and_then(Value::as_str) != Some(id) {
        return Err("Note identity does not match its file".into());
    }
    Ok(authored_text(&n))
}
fn chunks(model: &TextEmbedding, text: &str) -> Result<Vec<String>> {
    let mut tokenizer = model.tokenizer.clone();
    tokenizer.with_truncation(None).map_err(err)?;
    let encoding = tokenizer.encode(text, false).map_err(err)?;
    let offsets = encoding.get_offsets();
    let mut result = vec![];
    let mut start = 0;
    while start < offsets.len() {
        let end = (start + 240).min(offsets.len());
        let a = offsets[start].0;
        let b = offsets[end - 1].1;
        if let Some(s) = text.get(a..b) {
            if !s.trim().is_empty() {
                result.push(s.to_string())
            }
        }
        if end == offsets.len() {
            break;
        }
        start = end - 32;
    }
    Ok(result)
}
fn bytes_vector(vector: &[f32]) -> Vec<u8> {
    vector.iter().flat_map(|v| v.to_le_bytes()).collect()
}
fn read_vector(bytes: &[u8]) -> Result<Vec<f32>> {
    if bytes.len() != 384 * 4 {
        return Err("Invalid cached vector".into());
    }
    Ok(bytes
        .chunks_exact(4)
        .map(|x| f32::from_le_bytes(x.try_into().unwrap()))
        .collect())
}
struct Engine {
    db: Connection,
    model: TextEmbedding,
    base: Index,
    delta: Index,
    directory: PathBuf,
    delta_count: usize,
    key_refs: HashMap<u64, usize>,
}
impl Engine {
    fn missing(&self, available: &HashSet<String>) -> Result<Vec<String>> {
        let mut st = self.db.prepare("SELECT id FROM notes").map_err(err)?;
        let ids = st
            .query_map([], |r| r.get::<_, String>(0))
            .map_err(err)?
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(err)?;
        Ok(ids
            .into_iter()
            .filter(|id| !available.contains(id))
            .collect())
    }
    fn prune(&mut self, ids: &[String]) -> Result<()> {
        for id in ids {
            let keys: Vec<u64> = {
                let mut st = self
                    .db
                    .prepare("SELECT chunk FROM bindings WHERE note=?1")
                    .map_err(err)?;
                let rows = st
                    .query_map([id], |r| r.get::<_, i64>(0).map(|v| v as u64))
                    .map_err(err)?
                    .collect::<std::result::Result<_, _>>()
                    .map_err(err)?;
                rows
            };
            let tx = self.db.transaction().map_err(err)?;
            tx.execute("DELETE FROM bindings WHERE note=?1", [id])
                .map_err(err)?;
            tx.execute("DELETE FROM notes WHERE id=?1", [id])
                .map_err(err)?;
            tx.commit().map_err(err)?;
            for key in keys {
                if let Some(n) = self.key_refs.get_mut(&key) {
                    *n = n.saturating_sub(1);
                    if *n == 0 {
                        self.key_refs.remove(&key);
                    }
                }
            }
        }
        Ok(())
    }
    fn open(root: &Path) -> Result<Self> {
        let directory = root.join("semantic");
        let db = Connection::open(directory.join("vectors.sqlite3")).map_err(err)?;
        db.execute_batch("PRAGMA journal_mode=WAL;CREATE TABLE IF NOT EXISTS chunks(id INTEGER PRIMARY KEY AUTOINCREMENT, hash TEXT UNIQUE NOT NULL, vector BLOB NOT NULL);CREATE TABLE IF NOT EXISTS notes(id TEXT PRIMARY KEY,fingerprint TEXT NOT NULL);CREATE TABLE IF NOT EXISTS bindings(note TEXT NOT NULL,ordinal INTEGER NOT NULL,chunk INTEGER NOT NULL,PRIMARY KEY(note,ordinal));CREATE INDEX IF NOT EXISTS bindings_chunk ON bindings(chunk);CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);").map_err(err)?;
        let version: Option<String> = db
            .query_row("SELECT value FROM meta WHERE key='model'", [], |r| r.get(0))
            .ok();
        if version.as_deref() != Some(MODEL) {
            db.execute_batch("DELETE FROM bindings;DELETE FROM chunks;DELETE FROM notes;")
                .map_err(err)?;
            db.execute("INSERT OR REPLACE INTO meta VALUES('model',?1)", [MODEL])
                .map_err(err)?;
        }
        let mut engine = Self {
            db,
            model: load_model(root)?,
            base: new_ann()?,
            delta: new_ann()?,
            directory,
            delta_count: 0,
            key_refs: HashMap::new(),
        };
        if engine.restore_checkpoint().is_err() {
            engine.checkpoint()?;
        }
        engine.refresh_key_refs()?;
        Ok(engine)
    }
    fn refresh_key_refs(&mut self) -> Result<()> {
        let mut st = self
            .db
            .prepare("SELECT chunk,count(*) FROM bindings GROUP BY chunk")
            .map_err(err)?;
        self.key_refs = st
            .query_map([], |r| {
                Ok((r.get::<_, i64>(0)? as u64, r.get::<_, i64>(1)? as usize))
            })
            .map_err(err)?
            .collect::<std::result::Result<_, _>>()
            .map_err(err)?;
        Ok(())
    }
    fn restore_checkpoint(&mut self) -> Result<()> {
        let manifest: String = self
            .db
            .query_row("SELECT value FROM meta WHERE key='checkpoint'", [], |r| {
                r.get(0)
            })
            .map_err(err)?;
        let (name, digest, max_key): (String, String, i64) =
            serde_json::from_str(&manifest).map_err(err)?;
        if !name.starts_with("base-") || !name.ends_with(".usearch") || name.contains(['/', '\\']) {
            return Err("Invalid checkpoint".into());
        }
        let path = self.directory.join(name);
        if hash_file(&path)? != digest {
            return Err("Corrupt ANN checkpoint".into());
        }
        self.base
            .view(path.to_str().ok_or("Invalid index path")?)
            .map_err(err)?;
        let mut statement = self
            .db
            .prepare("SELECT id,vector FROM chunks WHERE id>?1")
            .map_err(err)?;
        let rows = statement
            .query_map([max_key], |r| {
                Ok((r.get::<_, i64>(0)?, r.get::<_, Vec<u8>>(1)?))
            })
            .map_err(err)?;
        for row in rows {
            let (key, bytes) = row.map_err(err)?;
            self.delta.reserve(self.delta.size() + 1).map_err(err)?;
            self.delta
                .add(key as u64, &read_vector(&bytes)?)
                .map_err(err)?;
            self.delta_count += 1;
        }
        Ok(())
    }
    fn checkpoint(&mut self) -> Result<()> {
        self.db.execute("DELETE FROM chunks WHERE NOT EXISTS(SELECT 1 FROM bindings WHERE bindings.chunk=chunks.id)",[]).map_err(err)?;
        let index = new_ann()?;
        let count: usize = self
            .db
            .query_row("SELECT count(*) FROM chunks", [], |r| {
                r.get::<_, i64>(0).map(|v| v as usize)
            })
            .map_err(err)?;
        index.reserve(count.max(16)).map_err(err)?;
        {
            let mut statement = self
                .db
                .prepare("SELECT id,vector FROM chunks")
                .map_err(err)?;
            let rows = statement
                .query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, Vec<u8>>(1)?)))
                .map_err(err)?;
            for row in rows {
                let (id, bytes) = row.map_err(err)?;
                index.add(id as u64, &read_vector(&bytes)?).map_err(err)?;
            }
        }
        let path = self
            .directory
            .join(format!("base-{}.usearch", uuid::Uuid::new_v4()));
        index
            .save(path.to_str().ok_or("Invalid index path")?)
            .map_err(err)?;
        let mapped = new_ann()?;
        mapped.view(path.to_str().unwrap()).map_err(err)?;
        self.base = mapped;
        self.delta = new_ann()?;
        self.delta_count = 0;
        let max_key: i64 = self
            .db
            .query_row("SELECT coalesce(max(id),0) FROM chunks", [], |r| r.get(0))
            .map_err(err)?;
        let checkpoint = serde_json::to_string(&(
            path.file_name().unwrap().to_string_lossy(),
            hash_file(&path)?,
            max_key,
        ))
        .map_err(err)?;
        self.db
            .execute(
                "INSERT OR REPLACE INTO meta VALUES('checkpoint',?1)",
                [checkpoint],
            )
            .map_err(err)?;
        // Old mappings were dropped above; generation filenames avoid replacing mapped Windows files.
        for entry in fs::read_dir(&self.directory).map_err(err)? {
            let p = entry.map_err(err)?.path();
            if p != path
                && p.file_name()
                    .and_then(|x| x.to_str())
                    .is_some_and(|s| s.starts_with("base-") && s.ends_with(".usearch"))
            {
                let _ = fs::remove_file(p);
            }
        }
        Ok(())
    }
    fn needs(&self, id: &str, fingerprint: &str) -> bool {
        self.db
            .query_row("SELECT fingerprint FROM notes WHERE id=?1", [id], |r| {
                r.get::<_, String>(0)
            })
            .ok()
            .as_deref()
            != Some(fingerprint)
    }
    fn embed_note(&mut self, id: &str, text: &str, shared: &Arc<Mutex<Shared>>) -> Result<bool> {
        let fingerprint = hash(text.as_bytes());
        if !self.needs(id, &fingerprint) {
            return Ok(false);
        }
        let chunks = chunks(&self.model, text)?;
        let mut keys = vec![];
        for batch in chunks.chunks(4) {
            {
                let s = shared.lock().map_err(err)?;
                if !runnable(&s) {
                    return Ok(false);
                }
            }
            let mut missing = vec![];
            let mut batch_keys = vec![];
            for chunk in batch {
                let h = hash(chunk.as_bytes());
                let existing = self
                    .db
                    .query_row("SELECT id FROM chunks WHERE hash=?1", [&h], |r| {
                        r.get::<_, i64>(0)
                    })
                    .ok();
                batch_keys.push((h, existing));
                if existing.is_none() {
                    missing.push(chunk.clone())
                }
            }
            let mut vectors = if missing.is_empty() {
                vec![]
            } else {
                self.model.embed(&missing, Some(4)).map_err(err)?
            }
            .into_iter();
            for (h, key) in batch_keys {
                let key = if let Some(key) = key {
                    key
                } else {
                    let v = vectors.next().ok_or("Missing embedding output")?;
                    if v.len() != 384 || v.iter().any(|x| !x.is_finite()) {
                        return Err("Invalid model output".into());
                    }
                    let inserted = self
                        .db
                        .execute(
                            "INSERT OR IGNORE INTO chunks(hash,vector) VALUES(?1,?2)",
                            params![h, bytes_vector(&v)],
                        )
                        .map_err(err)?;
                    let key = self
                        .db
                        .query_row("SELECT id FROM chunks WHERE hash=?1", [&h], |r| {
                            r.get::<_, i64>(0)
                        })
                        .map_err(err)?;
                    if inserted > 0 {
                        self.delta.reserve(self.delta.size() + 1).map_err(err)?;
                        self.delta.add(key as u64, &v).map_err(err)?;
                        self.delta_count += 1;
                    }
                    key
                };
                keys.push(key)
            }
        }
        let old_keys: Vec<u64> = {
            let mut st = self
                .db
                .prepare("SELECT chunk FROM bindings WHERE note=?1")
                .map_err(err)?;
            let keys = st
                .query_map([id], |r| r.get::<_, i64>(0).map(|v| v as u64))
                .map_err(err)?
                .collect::<std::result::Result<_, _>>()
                .map_err(err)?;
            keys
        };
        let tx = self.db.transaction().map_err(err)?;
        tx.execute("DELETE FROM bindings WHERE note=?1", [id])
            .map_err(err)?;
        for (ordinal, key) in keys.iter().enumerate() {
            tx.execute(
                "INSERT INTO bindings VALUES(?1,?2,?3)",
                params![id, ordinal as i64, key],
            )
            .map_err(err)?;
        }
        tx.execute(
            "INSERT OR REPLACE INTO notes VALUES(?1,?2)",
            params![id, fingerprint],
        )
        .map_err(err)?;
        tx.commit().map_err(err)?;
        for key in old_keys {
            if let Some(count) = self.key_refs.get_mut(&key) {
                *count = count.saturating_sub(1);
            }
        }
        for key in keys {
            *self.key_refs.entry(key as u64).or_default() += 1;
        }
        if self.delta_count >= 4096 {
            self.checkpoint()?
        }
        Ok(true)
    }
    fn related(&self, id: &str, root: &Path) -> Result<Vec<SemanticMatch>> {
        if self.needs(id, &hash(note_text(root, id)?.as_bytes())) {
            return Ok(vec![]);
        }
        let mut statement=self.db.prepare("SELECT c.id,c.vector FROM bindings b JOIN chunks c ON c.id=b.chunk WHERE b.note=?1 ORDER BY b.ordinal").map_err(err)?;
        let vectors = statement
            .query_map([id], |r| {
                Ok((r.get::<_, i64>(0)? as u64, r.get::<_, Vec<u8>>(1)?))
            })
            .map_err(err)?
            .map(|r| {
                let (key, bytes) = r.map_err(err)?;
                Ok((key, read_vector(&bytes)?))
            })
            .collect::<Result<Vec<_>>>()?;
        if vectors.is_empty() {
            return Ok(vec![]);
        }
        let note_count: usize = self
            .db
            .query_row("SELECT count(*) FROM notes", [], |r| {
                r.get::<_, i64>(0).map(|n| n as usize)
            })
            .map_err(err)?;
        let aggregate = note_centroid(&vectors, &self.key_refs, note_count);
        let informative = informative_vectors(&vectors, &self.key_refs, note_count);
        let mut queries = vec![aggregate.clone()];
        for i in 0..informative.len().min(8) {
            queries.push(
                informative[i * (informative.len() - 1) / (informative.len().min(8) - 1).max(1)]
                    .1
                    .clone(),
            )
        }
        let mut scores: HashMap<String, f32> = HashMap::new();
        let mut key_scores: HashMap<u64, f32> = HashMap::new();
        for query in queries {
            for index in [&self.base, &self.delta] {
                let found = index
                    .filtered_search(&query, 80, |key| {
                        self.key_refs.get(&key).is_some_and(|n| *n > 0)
                    })
                    .map_err(err)?;
                for (key, distance) in found.keys.into_iter().zip(found.distances) {
                    key_scores
                        .entry(key)
                        .and_modify(|s| *s = s.max(1. - distance))
                        .or_insert(1. - distance);
                }
            }
        }
        if !key_scores.is_empty() {
            let mut params = vec![rusqlite::types::Value::Text(id.to_string())];
            params.extend(
                key_scores
                    .keys()
                    .map(|key| rusqlite::types::Value::Integer(*key as i64)),
            );
            let placeholders = std::iter::repeat_n("?", key_scores.len())
                .collect::<Vec<_>>()
                .join(",");
            let sql=format!("SELECT DISTINCT note,chunk FROM bindings WHERE note<>? AND chunk IN ({placeholders})");
            let mut st = self.db.prepare(&sql).map_err(err)?;
            let rows = st
                .query_map(rusqlite::params_from_iter(params.iter()), |r| {
                    Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)? as u64))
                })
                .map_err(err)?;
            for row in rows {
                let (candidate, key) = row.map_err(err)?;
                let score = key_scores[&key];
                scores
                    .entry(candidate)
                    .and_modify(|s| *s = s.max(score))
                    .or_insert(score);
            }
        }
        // Bound work to ANN candidates, then evaluate the document in both notes.
        // The previous maximum-window score promoted unrelated notes sharing boilerplate.
        let mut candidates: Vec<_> = scores.into_iter().collect();
        candidates.sort_by(|a, b| b.1.total_cmp(&a.1));
        candidates.truncate(120);
        let mut matches = Vec::new();
        let mut st=self.db.prepare("SELECT c.id,c.vector FROM bindings b JOIN chunks c ON c.id=b.chunk WHERE b.note=?1 ORDER BY b.ordinal").map_err(err)?;
        for (note_id, _) in candidates {
            if !note_text(root, &note_id)
                .is_ok_and(|text| !self.needs(&note_id, &hash(text.as_bytes())))
            {
                continue;
            }
            let rows = st
                .query_map([&note_id], |r| {
                    Ok((r.get::<_, i64>(0)? as u64, r.get::<_, Vec<u8>>(1)?))
                })
                .map_err(err)?;
            let candidate = rows
                .map(|r| {
                    let (key, bytes) = r.map_err(err)?;
                    Ok((key, read_vector(&bytes)?))
                })
                .collect::<Result<Vec<_>>>()?;
            let centroid = note_centroid(&candidate, &self.key_refs, note_count);
            let score = aggregate
                .iter()
                .zip(&centroid)
                .map(|(a, b)| a * b)
                .sum::<f32>()
                .clamp(-1., 1.);
            if score >= MIN_SEMANTIC_SIMILARITY {
                matches.push(SemanticMatch { note_id, score });
            }
        }
        matches.sort_by(|a, b| b.score.total_cmp(&a.score).then(a.note_id.cmp(&b.note_id)));
        matches.truncate(120);
        Ok(matches)
    }
}
fn informative_vectors<'a>(
    vectors: &'a [(u64, Vec<f32>)],
    frequency: &HashMap<u64, usize>,
    notes: usize,
) -> Vec<&'a (u64, Vec<f32>)> {
    let common_limit = (notes / 10).max(3);
    let mut seen = HashSet::new();
    let unique: Vec<_> = vectors
        .iter()
        .filter(|(key, _)| seen.insert(*key))
        .collect();
    let informative: Vec<_> = unique
        .iter()
        .copied()
        .filter(|(key, _)| frequency.get(key).copied().unwrap_or(1) <= common_limit)
        .collect();
    // An entirely duplicated note can genuinely be related; only remove ubiquitous
    // windows when there is other document content to represent its actual topic.
    if informative.is_empty() {
        unique
    } else {
        informative
    }
}
fn note_centroid(
    vectors: &[(u64, Vec<f32>)],
    frequency: &HashMap<u64, usize>,
    notes: usize,
) -> Vec<f32> {
    let mut aggregate = vec![0.; 384];
    for (key, vector) in informative_vectors(vectors, frequency, notes) {
        let weight = 1. / (1. + frequency.get(key).copied().unwrap_or(1) as f32).ln();
        for (a, b) in aggregate.iter_mut().zip(vector) {
            *a += weight * b;
        }
    }
    let norm = aggregate.iter().map(|v| v * v).sum::<f32>().sqrt();
    if norm > 0. {
        for v in &mut aggregate {
            *v /= norm;
        }
    }
    aggregate
}
fn runnable(s: &Shared) -> bool {
    s.status.settings.enabled
        && !s.status.settings.paused
        && (!s.status.on_battery || s.status.settings.allow_battery)
        && s.last_typing.elapsed() >= Duration::from_secs(2)
        && !s.remove
        && !s.stop
}
fn merge_pending(queue: &mut Vec<String>, new: impl IntoIterator<Item = String>) {
    let mut existing: HashSet<_> = queue.iter().cloned().collect();
    for id in new {
        if existing.insert(id.clone()) {
            queue.push(id)
        }
    }
}
fn worker_loop(root: PathBuf, shared: Arc<Mutex<Shared>>, rx: mpsc::Receiver<Command>) {
    let mut engine: Option<Engine> = None;
    let mut seen: HashMap<String, (SystemTime, u64)> = HashMap::new();
    let mut queued = vec![];
    let mut removals: Vec<String> = vec![];
    let mut scan = Instant::now() - Duration::from_secs(60);
    let mut model_scan = Instant::now() - Duration::from_secs(60);
    let mut model_stamp: Option<Vec<(u64, SystemTime)>> = None;
    loop {
        {
            let mut s = shared.lock().unwrap();
            if s.stop {
                return;
            }
            s.status.on_battery = battery();
            if s.remove && !s.status.downloading {
                engine = None;
                seen.clear();
                queued.clear();
                let dir = root.join("semantic");
                let mut failures = vec![];
                for name in [
                    "vectors.sqlite3",
                    "vectors.sqlite3-wal",
                    "vectors.sqlite3-shm",
                ] {
                    if let Err(error) = fs::remove_file(dir.join(name)) {
                        if error.kind() != std::io::ErrorKind::NotFound {
                            failures.push(format!("{name}: {error}"));
                        }
                    }
                }
                if let Ok(files) = fs::read_dir(&dir) {
                    for f in files.flatten() {
                        if f.file_name().to_string_lossy().starts_with("base-") {
                            if let Err(error) = fs::remove_file(f.path()) {
                                if error.kind() != std::io::ErrorKind::NotFound {
                                    failures.push(error.to_string());
                                }
                            }
                        }
                    }
                }
                s.status.indexed = 0;
                s.status.total = 0;
                s.status.generation += 1;
                s.remove = false;
                if !failures.is_empty() {
                    s.status.error = Some(format!(
                        "Some local semantic data could not be removed. Retry removal: {}",
                        failures.join("; ")
                    ));
                }
            }
            if !s.status.model_ready
                && !s.status.downloading
                && model_scan.elapsed() > Duration::from_secs(30)
            {
                let stamp: Vec<_> = FILES
                    .iter()
                    .map(|f| {
                        fs::metadata(root.join("semantic/model").join(f.0))
                            .ok()
                            .map(|m| (m.len(), m.modified().unwrap_or(SystemTime::UNIX_EPOCH)))
                            .unwrap_or((0, SystemTime::UNIX_EPOCH))
                    })
                    .collect();
                if model_stamp.as_ref() != Some(&stamp) {
                    s.status.model_ready = verify_model(&root).is_ok();
                    model_stamp = Some(stamp);
                }
                model_scan = Instant::now();
            }
        }
        while let Ok(Command::Related(id)) = rx.try_recv() {
            if !shared.lock().unwrap().status.settings.enabled {
                shared.lock().unwrap().pending.remove(&id);
                continue;
            }
            let result = engine
                .as_ref()
                .map_or(Ok(vec![]), |e| e.related(&id, &root));
            let mut s = shared.lock().unwrap();
            s.pending.remove(&id);
            match result {
                Ok(results) => {
                    let changed = s.cache.get(&id).is_none_or(|(_, old)| *old != results);
                    if changed {
                        s.status.generation += 1;
                    }
                    let generation = s.status.generation;
                    if s.cache.len() > 128 {
                        s.cache.clear();
                    }
                    s.cache.insert(id, (generation, results));
                }
                Err(error) => s.status.error = Some(error),
            }
        }
        let ready = {
            let s = shared.lock().unwrap();
            if !s.status.settings.enabled {
                engine = None;
            }
            s.status.settings.enabled && s.status.model_ready
        };
        if !ready {
            thread::sleep(Duration::from_millis(150));
            continue;
        }
        if engine.is_none() {
            match Engine::open(&root) {
                Ok(e) => {
                    let indexed =
                        e.db.query_row("SELECT count(*) FROM notes", [], |r| {
                            r.get::<_, i64>(0).map(|v| v as usize)
                        })
                        .unwrap_or(0);
                    engine = Some(e);
                    let mut s = shared.lock().unwrap();
                    s.status.indexed = indexed;
                    s.status.generation += 1;
                }
                Err(e) => {
                    shared.lock().unwrap().status.error = Some(e);
                    thread::sleep(Duration::from_secs(2));
                    continue;
                }
            }
        }
        if !runnable(&shared.lock().unwrap()) {
            thread::sleep(Duration::from_millis(150));
            continue;
        }
        if scan.elapsed() > Duration::from_secs(30) {
            let discovered: Vec<String> = fs::read_dir(root.join("notes"))
                .map(|r| {
                    r.flatten()
                        .filter_map(|e| {
                            let id = e.path().file_stem()?.to_str()?.to_string();
                            if valid_id(&id).is_ok() {
                                Some(id)
                            } else {
                                None
                            }
                        })
                        .collect()
                })
                .unwrap_or_default();
            shared.lock().unwrap().status.total = discovered.len();
            let available: HashSet<_> = discovered.iter().cloned().collect();
            removals = engine
                .as_ref()
                .unwrap()
                .missing(&available)
                .unwrap_or_default();
            let changed = discovered.into_iter().filter(|id| {
                let path = root.join("notes").join(format!("{id}.json"));
                fs::metadata(path)
                    .ok()
                    .and_then(|m| Some((m.modified().ok()?, m.len())))
                    .is_some_and(|stamp| seen.get(id) != Some(&stamp))
            });
            merge_pending(&mut queued, changed);
            scan = Instant::now();
        }
        if !removals.is_empty() {
            let count = removals.len().min(128);
            let batch: Vec<_> = removals.drain(..count).collect();
            if let Err(error) = engine.as_mut().unwrap().prune(&batch) {
                shared.lock().unwrap().status.error = Some(error);
            } else {
                for id in batch {
                    seen.remove(&id);
                }
                let mut s = shared.lock().unwrap();
                s.cache.clear();
                s.status.generation += 1;
                s.status.indexed = engine
                    .as_ref()
                    .unwrap()
                    .db
                    .query_row("SELECT count(*) FROM notes", [], |r| {
                        r.get::<_, i64>(0).map(|v| v as usize)
                    })
                    .unwrap_or(0);
            }
        }
        let active = shared.lock().unwrap().active_note.clone();
        if let Some(id) = active {
            let path = root.join("notes").join(format!("{id}.json"));
            let changed = fs::metadata(path)
                .ok()
                .and_then(|m| Some((m.modified().ok()?, m.len())))
                .is_some_and(|stamp| seen.get(&id) != Some(&stamp));
            if changed {
                queued.retain(|n| n != &id);
                queued.push(id)
            }
        }
        if let Some(id) = queued.pop() {
            let path = root.join("notes").join(format!("{id}.json"));
            let result = (|| -> Result<bool> {
                let metadata = fs::symlink_metadata(&path).map_err(err)?;
                if !metadata.is_file()
                    || metadata.file_type().is_symlink()
                    || metadata.file_attributes_windows_reparse()
                    || metadata.len() > 8 * 1024 * 1024
                {
                    return Err("Invalid semantic source note".into());
                }
                let stamp = (metadata.modified().map_err(err)?, metadata.len());
                if seen.get(&id) == Some(&stamp) {
                    return Ok(false);
                }
                let text = note_text(&root, &id)?;
                shared.lock().unwrap().status.busy = true;
                let changed = engine.as_mut().unwrap().embed_note(&id, &text, &shared)?;
                if !engine.as_ref().unwrap().needs(&id, &hash(text.as_bytes())) {
                    seen.insert(id, stamp);
                }
                Ok(changed)
            })();
            let mut s = shared.lock().unwrap();
            s.status.busy = false;
            match result {
                Ok(changed) => {
                    if changed {
                        s.status.generation += 1;
                    }
                    s.status.indexed = engine
                        .as_ref()
                        .unwrap()
                        .db
                        .query_row("SELECT count(*) FROM notes", [], |r| {
                            r.get::<_, i64>(0).map(|v| v as usize)
                        })
                        .unwrap_or(0)
                }
                Err(e) => s.status.error = Some(e),
            }
        }
        thread::sleep(Duration::from_millis(100));
    }
}
#[cfg(windows)]
fn battery() -> bool {
    #[repr(C)]
    struct Power {
        ac: u8,
        flag: u8,
        percent: u8,
        reserved: u8,
        life: u32,
        full: u32,
    }
    #[link(name = "kernel32")]
    unsafe extern "system" {
        fn GetSystemPowerStatus(status: *mut Power) -> i32;
    }
    let mut p = Power {
        ac: 255,
        flag: 255,
        percent: 255,
        reserved: 0,
        life: 0,
        full: 0,
    };
    unsafe { GetSystemPowerStatus(&mut p) != 0 && p.ac == 0 }
}
#[cfg(not(windows))]
fn battery() -> bool {
    false
}

/// Reproducible developer benchmark. Writes only a newly created disposable folder.
pub fn benchmark(pack: &Path, root: &Path, maximum: usize) -> Result<Value> {
    if root.exists() {
        return Err("Benchmark workspace must not already exist".into());
    }
    fs::create_dir_all(root.join("notes")).map_err(err)?;
    fs::create_dir_all(root.join("semantic/model/onnx")).map_err(err)?;
    for (name, _, _) in FILES {
        verify_file(pack, *FILES.iter().find(|f| f.0 == *name).unwrap())?;
        fs::copy(pack.join(name), root.join("semantic/model").join(name)).map_err(err)?;
    }
    let shared = Arc::new(Mutex::new(Shared {
        status: SemanticStatus {
            experimental: true,
            settings: SemanticSettings {
                enabled: true,
                paused: false,
                allow_battery: true,
            },
            model_ready: true,
            download_bytes: 0,
            model_bytes: 0,
            downloading: false,
            indexed: 0,
            total: 0,
            generation: 0,
            on_battery: false,
            busy: false,
            error: None,
        },
        active_note: None,
        last_typing: Instant::now() - Duration::from_secs(10),
        remove: false,
        stop: false,
        cache: HashMap::new(),
        pending: HashSet::new(),
    }));
    let load = Instant::now();
    let mut engine = Engine::open(root)?;
    let model_load_ms = load.elapsed().as_secs_f64() * 1000.;
    let start = Instant::now();
    let mut reports = vec![];
    let mut words = 0;
    for i in 0..maximum {
        let id = format!("00000000-0000-4000-8000-{i:012x}");
        let topics = [
            "heart disease physician treatment medical hospital patient",
            "astronomy telescope planet distant galaxy stars",
            "forest trees ecology wildlife conservation habitat",
            "bread baking flour yeast oven kitchen",
            "algebra equations mathematics geometry calculus numbers",
            "music piano rhythm melody concert composition",
            "software compiler database algorithm memory performance",
            "painting brush watercolor canvas pigment perspective",
        ];
        let text=format!("Observation {i}. {}. {}. {}. Personal detail identifier {i} captures a distinct event and a question to revisit later.",topics[i%8],topics[(i/8)%8],topics[(i/64)%8]);
        let target_words = std::env::var("NOTED_BENCH_LONG_WORDS")
            .ok()
            .and_then(|v| v.parse::<usize>().ok())
            .unwrap_or(0);
        let text = if target_words > 0 {
            text.repeat(target_words.div_ceil(text.split_whitespace().count()))
        } else {
            text
        };
        words += text.split_whitespace().count();
        let note = serde_json::json!({"id":id,"title":format!("Observation {i}"),"content":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":text}]}]}});
        fs::write(
            root.join("notes").join(format!("{id}.json")),
            serde_json::to_vec(&note).map_err(err)?,
        )
        .map_err(err)?;
        engine.embed_note(&id, &authored_text(&note), &shared)?;
        if (i + 1) % 100 == 0 {
            println!("indexed {} / {}", i + 1, maximum);
        }
        if [500, 5000, 50000].contains(&(i + 1)) || i + 1 == maximum {
            engine.checkpoint()?;
            let mut times = vec![];
            for query in 0..20 {
                let id = format!("00000000-0000-4000-8000-{:012x}", query * 23 % (i + 1));
                let t = Instant::now();
                let _ = engine.related(&id, root)?;
                times.push(t.elapsed().as_secs_f64() * 1000.)
            }
            times.sort_by(f64::total_cmp);
            let mut vectors = vec![];
            {
                let mut st = engine
                    .db
                    .prepare("SELECT id,vector FROM chunks ORDER BY id")
                    .map_err(err)?;
                for row in st
                    .query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, Vec<u8>>(1)?)))
                    .map_err(err)?
                {
                    let (id, bytes) = row.map_err(err)?;
                    vectors.push((id as u64, read_vector(&bytes)?));
                }
            }
            let mut recall = 0.;
            let samples = vectors.len().min(20);
            for q in 0..samples {
                let query = &vectors[q * vectors.len() / samples].1;
                let mut exact: Vec<_> = vectors
                    .iter()
                    .map(|(key, v)| (*key, v.iter().zip(query).map(|(a, b)| a * b).sum::<f32>()))
                    .collect();
                exact.sort_by(|a, b| b.1.total_cmp(&a.1).then(a.0.cmp(&b.0)));
                let truth: HashSet<_> = exact.iter().take(20).map(|v| v.0).collect();
                let found = engine.base.search(query, 20).map_err(err)?;
                recall += found.keys.iter().filter(|k| truth.contains(k)).count() as f64
                    / truth.len() as f64;
            }
            let disk = fs::read_dir(root.join("semantic"))
                .map_err(err)?
                .flatten()
                .filter_map(|e| e.metadata().ok())
                .filter(|m| m.is_file())
                .map(|m| m.len())
                .sum::<u64>();
            let report = serde_json::json!({"notes":i+1,"words":words,"uniqueChunks":vectors.len(),"modelLoadMs":model_load_ms,"indexingElapsedSeconds":start.elapsed().as_secs_f64(),"relatedP95Ms":times[18],"annRecallAt20":recall/samples.max(1) as f64,"cacheAndIndexDiskBytes":disk,"privateMemoryBytes":private_memory(),"synthetic":true,"humanQualityGate":"not evaluated"});
            println!("{}", report);
            reports.push(report);
            fs::write(
                root.join("report.json"),
                serde_json::to_vec_pretty(&reports).map_err(err)?,
            )
            .map_err(err)?;
        }
    }
    Ok(serde_json::json!(reports))
}
#[cfg(windows)]
fn private_memory() -> usize {
    #[repr(C)]
    struct Counters {
        cb: u32,
        faults: u32,
        values: [usize; 9],
    }
    #[link(name = "kernel32")]
    unsafe extern "system" {
        fn GetCurrentProcess() -> *mut std::ffi::c_void;
    }
    #[link(name = "psapi")]
    unsafe extern "system" {
        fn GetProcessMemoryInfo(
            process: *mut std::ffi::c_void,
            counters: *mut Counters,
            size: u32,
        ) -> i32;
    }
    let mut c = Counters {
        cb: std::mem::size_of::<Counters>() as u32,
        faults: 0,
        values: [0; 9],
    };
    unsafe {
        GetProcessMemoryInfo(
            GetCurrentProcess(),
            &mut c,
            std::mem::size_of::<Counters>() as u32,
        );
    }
    c.values[8]
}
#[cfg(not(windows))]
fn private_memory() -> usize {
    0
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn background_rescan_preserves_pending_progress() {
        let mut queue: Vec<String> = (0..500).map(|n| n.to_string()).collect();
        let mut processed = HashSet::new();
        for _ in 0..5 {
            for _ in 0..100 {
                processed.insert(queue.pop().unwrap());
            }
            let changed = (0..500)
                .map(|n| n.to_string())
                .filter(|id| !processed.contains(id));
            merge_pending(&mut queue, changed);
        }
        assert_eq!(processed.len(), 500);
        assert!(queue.is_empty());
    }
    #[test]
    fn cached_queries_never_wait_for_worker_and_disable_clears_them() {
        let temp = tempfile::tempdir().unwrap();
        safe_directory(&temp.path().join("semantic")).unwrap();
        let (tx, _rx) = mpsc::channel();
        let mut shared = Shared {
            status: SemanticStatus {
                experimental: true,
                settings: SemanticSettings {
                    enabled: true,
                    paused: false,
                    allow_battery: false,
                },
                model_ready: true,
                download_bytes: 0,
                model_bytes: 0,
                downloading: false,
                indexed: 0,
                total: 0,
                generation: 1,
                on_battery: false,
                busy: true,
                error: None,
            },
            active_note: None,
            last_typing: Instant::now(),
            remove: false,
            stop: false,
            cache: HashMap::new(),
            pending: HashSet::new(),
        };
        let id = uuid::Uuid::new_v4().to_string();
        shared.cache.insert(
            id.clone(),
            (
                0,
                vec![SemanticMatch {
                    note_id: uuid::Uuid::new_v4().to_string(),
                    score: 0.5,
                }],
            ),
        );
        let service = SemanticService {
            root: temp.path().to_path_buf(),
            shared: Arc::new(Mutex::new(shared)),
            tx,
        };
        let start = Instant::now();
        assert_eq!(service.related(id.clone()).unwrap().len(), 1);
        assert!(start.elapsed() < Duration::from_millis(100));
        assert_eq!(service.related(id.clone()).unwrap().len(), 1);
        assert_eq!(service.shared.lock().unwrap().pending.len(), 1);
        service.settings(SemanticSettings::default()).unwrap();
        assert!(service.shared.lock().unwrap().cache.is_empty());
        assert!(service.related(id).unwrap().is_empty());
    }
    #[test]
    #[ignore = "requires the pinned offline model pack in NOTED_MODEL_PACK"]
    fn real_local_inference_and_changed_content_cache() {
        let source =
            PathBuf::from(std::env::var("NOTED_MODEL_PACK").expect("Set NOTED_MODEL_PACK"));
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path();
        fs::create_dir(root.join("notes")).unwrap();
        fs::create_dir_all(root.join("semantic/model/onnx")).unwrap();
        for (name, _, _) in FILES {
            fs::copy(source.join(name), root.join("semantic/model").join(name)).unwrap();
        }
        let shared = Arc::new(Mutex::new(Shared {
            status: SemanticStatus {
                experimental: true,
                settings: SemanticSettings {
                    enabled: true,
                    paused: false,
                    allow_battery: true,
                },
                model_ready: true,
                download_bytes: 0,
                model_bytes: 0,
                downloading: false,
                indexed: 0,
                total: 0,
                generation: 0,
                on_battery: false,
                busy: false,
                error: None,
            },
            active_note: None,
            last_typing: Instant::now() - Duration::from_secs(10),
            remove: false,
            stop: false,
            cache: HashMap::new(),
            pending: HashSet::new(),
        }));
        let started = Instant::now();
        let mut engine = Engine::open(root).unwrap();
        let inputs = [
            "A physician treated the patient for a cardiac condition.",
            "The doctor provided medical care for a person with heart disease.",
            "The telescope reveals distant galaxies and stars.",
        ];
        let mut ids = vec![];
        for input in inputs {
            let id = uuid::Uuid::new_v4().to_string();
            let n = serde_json::json!({"id":id,"title":"","content":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":input}]}]}});
            fs::write(
                root.join("notes").join(format!("{id}.json")),
                serde_json::to_vec(&n).unwrap(),
            )
            .unwrap();
            assert!(engine.embed_note(&id, &authored_text(&n), &shared).unwrap());
            assert!(!engine.embed_note(&id, &authored_text(&n), &shared).unwrap());
            ids.push(id);
        }
        let results = engine.related(&ids[0], root).unwrap();
        assert_eq!(results[0].note_id, ids[1]);
        assert!(
            !results.iter().any(|m| m.note_id == ids[2]),
            "Unrelated astronomy must not pass the semantic relevance gate: {results:?}"
        );
        engine.checkpoint().unwrap();
        assert_eq!(engine.related(&ids[0], root).unwrap()[0].note_id, ids[1]);
        fs::remove_file(root.join("notes").join(format!("{}.json", ids[1]))).unwrap();
        let available: HashSet<_> = [ids[0].clone(), ids[2].clone()].into_iter().collect();
        let missing = engine.missing(&available).unwrap();
        assert_eq!(missing, vec![ids[1].clone()]);
        engine.prune(&missing).unwrap();
        assert!(engine
            .related(&ids[0], root)
            .unwrap()
            .iter()
            .all(|m| m.note_id != ids[1]));
        let text = "word ".repeat(2000);
        let windows = chunks(&engine.model, &text).unwrap();
        assert!(windows.len() > 8);
        for window in windows {
            let mut tokenizer = engine.model.tokenizer.clone();
            tokenizer.with_truncation(None).unwrap();
            assert!(tokenizer.encode(window, false).unwrap().len() <= 240);
        }
        println!(
            "real offline model + chunking + ANN + cache + checkpoint completed in {:?}",
            started.elapsed()
        );
    }
    #[test]
    fn whole_note_centroid_ignores_ubiquitous_template_windows_when_topic_content_exists() {
        let mut topic = vec![0.; 384];
        topic[0] = 1.;
        let mut template = vec![0.; 384];
        template[1] = 1.;
        let windows = vec![(1, topic.clone()), (2, template.clone()), (2, template)];
        let frequencies = HashMap::from([(1, 2), (2, 40)]);
        assert_eq!(note_centroid(&windows, &frequencies, 100), topic);
    }
    #[test]
    #[ignore = "requires the pinned offline model pack in NOTED_MODEL_PACK"]
    fn real_local_whole_note_relevance_rejects_shared_boilerplate() {
        let source = PathBuf::from(std::env::var("NOTED_MODEL_PACK").unwrap());
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path();
        fs::create_dir(root.join("notes")).unwrap();
        fs::create_dir_all(root.join("semantic/model/onnx")).unwrap();
        for (name, _, _) in FILES {
            fs::copy(source.join(name), root.join("semantic/model").join(name)).unwrap();
        }
        let shared = Arc::new(Mutex::new(Shared {
            status: SemanticStatus {
                experimental: true,
                settings: SemanticSettings {
                    enabled: true,
                    paused: false,
                    allow_battery: true,
                },
                model_ready: true,
                download_bytes: 0,
                model_bytes: 0,
                downloading: false,
                indexed: 0,
                total: 0,
                generation: 0,
                on_battery: false,
                busy: false,
                error: None,
            },
            active_note: None,
            last_typing: Instant::now() - Duration::from_secs(10),
            remove: false,
            stop: false,
            cache: HashMap::new(),
            pending: HashSet::new(),
        }));
        let common="Compare the immediate result with what happened a week later. Record one observation that supports the explanation and one detail that could suggest an alternative. Next time, change only one variable so the comparison remains useful.";
        let bodies=[
            "Young tomato plants wilt when the soil dries around shallow roots. Mulch reduces evaporation and a drip line delivers water without soaking the leaves. Check soil moisture below the surface before watering. Yellow leaves can reflect excess water as well as nutrient problems. Compare a shaded bed with sunny containers.",
            "Vegetable seedlings need moisture near their roots. A layer of mulch stops water evaporating too quickly, while drip irrigation helps the plants without wetting their foliage. Check deeper soil before watering tomatoes again. Both drought and overwatering can cause leaves to droop, especially in containers exposed to the sun.",
            "A telescope collects faint light from distant galaxies. Dark skies and patient observation reveal more detail than increasing magnification under bright city lights. Plan a viewing session around moon phase, cloud cover, and target altitude. Allow the eyes to adapt to darkness and compare the same star cluster through different eyepieces.",
            "A sourdough starter rises after feeding because yeast and bacteria consume flour. A cool kitchen slows fermentation. Compare the dough volume and aroma before changing the recipe. The loaf has a dense crumb and a pale crust. Try a longer proof, weigh the water carefully, and preheat the baking vessel. Record how hydration changes the texture."
        ];
        let mut engine = Engine::open(root).unwrap();
        let mut ids = vec![];
        for body in bodies {
            let id = uuid::Uuid::new_v4().to_string();
            let n = serde_json::json!({"id":id,"title":"Observation: a question to revisit","content":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":body}]},{"type":"paragraph","content":[{"type":"text","text":common}]}]}});
            fs::write(
                root.join("notes").join(format!("{id}.json")),
                serde_json::to_vec(&n).unwrap(),
            )
            .unwrap();
            engine.embed_note(&id, &authored_text(&n), &shared).unwrap();
            ids.push(id);
        }
        let matches = engine.related(&ids[0], root).unwrap();
        eprintln!("boilerplate regression: {matches:?}; IDs {ids:?}");
        assert!(
            matches.iter().any(|m| m.note_id == ids[1]),
            "Paraphrased gardening note should remain discoverable"
        );
        assert!(
            matches
                .iter()
                .all(|m| m.note_id != ids[2] && m.note_id != ids[3]),
            "Shared boilerplate alone must not connect gardening to astronomy or baking"
        );
    }
    #[test]
    fn extraction_ignores_presentation_urls_and_assets() {
        let note = serde_json::json!({"title":"Title","content":{"type":"doc","content":[{"type":"paragraph","attrs":{"x":500},"content":[{"type":"text","text":"Original words","marks":[{"type":"link","attrs":{"href":"https://secret"}}]}]},{"type":"localImage","attrs":{"assetId":"hidden"}}]}});
        assert_eq!(authored_text(&note), "Title\nOriginal words\n");
    }
    #[test]
    fn malformed_pack_fails_before_inference() {
        let temp = tempfile::tempdir().unwrap();
        fs::write(temp.path().join("tokenizer.json"), "wrong").unwrap();
        assert!(verify_file(temp.path(), FILES[1])
            .unwrap_err()
            .contains("Invalid model file"));
    }
    #[test]
    fn vector_cache_and_ann_roundtrip() {
        let mut v = vec![0f32; 384];
        v[3] = 1.;
        assert_eq!(read_vector(&bytes_vector(&v)).unwrap(), v);
        let index = new_ann().unwrap();
        index.reserve(8).unwrap();
        index.add(12, &v).unwrap();
        assert_eq!(index.search(&v, 1).unwrap().keys, vec![12]);
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("test.usearch");
        index.save(path.to_str().unwrap()).unwrap();
        let mapped = new_ann().unwrap();
        mapped.view(path.to_str().unwrap()).unwrap();
        assert_eq!(mapped.search(&v, 1).unwrap().keys, vec![12]);
    }
    #[test]
    fn disabled_and_typing_do_not_run() {
        let mut s = Shared {
            status: SemanticStatus {
                experimental: true,
                settings: SemanticSettings::default(),
                model_ready: true,
                download_bytes: 0,
                model_bytes: 0,
                downloading: false,
                indexed: 0,
                total: 0,
                generation: 0,
                on_battery: false,
                busy: false,
                error: None,
            },
            active_note: None,
            last_typing: Instant::now() - Duration::from_secs(5),
            remove: false,
            stop: false,
            cache: HashMap::new(),
            pending: HashSet::new(),
        };
        assert!(!runnable(&s));
        s.status.settings.enabled = true;
        assert!(runnable(&s));
        s.last_typing = Instant::now();
        assert!(!runnable(&s));
        s.last_typing -= Duration::from_secs(5);
        s.status.on_battery = true;
        assert!(!runnable(&s));
        s.status.settings.allow_battery = true;
        assert!(runnable(&s));
    }
}
