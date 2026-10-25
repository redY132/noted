//! Prototype local store. JSON files are authoritative; SQLite is disposable.
//! Writes are serialized by the desktop wrapper and a lifetime workspace lock.
//! External tools must close the app or use its API: arbitrary concurrent file
//! writes cannot be made transactional by this process's advisory lock.
use chrono::Utc;
use fs2::FileExt;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    collections::HashSet,
    fs::{self, File, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
};
use uuid::Uuid;

type Result<T> = std::result::Result<T, String>;
const MAX_NOTE_BYTES: u64 = 8 * 1024 * 1024;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Presentation {
    pub schema_id: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Note {
    pub format_version: u32,
    pub id: String,
    pub title: String,
    pub folder_id: Option<String>,
    pub tags: Vec<String>,
    pub revision: u64,
    pub created_at: String,
    pub updated_at: String,
    pub content: Value,
    pub presentation: Presentation,
    /// Transport-only: empty in canonical JSON; filled from raw bytes on reads.
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub revision_token: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteSummary {
    pub id: String,
    pub title: String,
    pub folder_id: Option<String>,
    pub tags: Vec<String>,
    pub revision: u64,
    pub created_at: String,
    pub updated_at: String,
}
impl From<&Note> for NoteSummary {
    fn from(n: &Note) -> Self {
        Self {
            id: n.id.clone(),
            title: n.title.clone(),
            folder_id: n.folder_id.clone(),
            tags: n.tags.clone(),
            revision: n.revision,
            created_at: n.created_at.clone(),
            updated_at: n.updated_at.clone(),
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Folder {
    pub id: String,
    pub name: String,
    pub parent_id: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceStatus {
    pub path: String,
    pub warnings: Vec<String>,
}

pub struct Store {
    root: PathBuf,
    db: Connection,
    warnings: Vec<String>,
    _lock: File,
}

fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}
fn token(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
fn valid_id(id: &str) -> Result<()> {
    let parsed = Uuid::parse_str(id).map_err(|_| "Invalid identifier".to_string())?;
    if parsed.to_string() != id {
        return Err("Identifier must be a canonical UUID".into());
    }
    Ok(())
}
fn now() -> String {
    Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}
fn check_file(path: &Path) -> Result<()> {
    if let Ok(metadata) = fs::symlink_metadata(path) {
        if metadata.file_type().is_symlink() || !metadata.is_file() {
            return Err("Workspace files must be ordinary files".into());
        }
        if path.extension().and_then(|s| s.to_str()) == Some("json")
            && metadata.len() > MAX_NOTE_BYTES
        {
            return Err("File exceeds the prototype's 8 MiB limit".into());
        }
    }
    Ok(())
}

/// tempfile::persist replaces an existing target atomically on Windows too.
/// Sync bytes before replacement. The old complete file or new complete file
/// survives process interruption; power-loss durability depends on the OS/FS.
pub(crate) fn atomic_write(path: &Path, bytes: &[u8]) -> Result<()> {
    check_file(path)?;
    let parent = path.parent().ok_or("Missing parent directory")?;
    let mut temp = tempfile::NamedTempFile::new_in(parent).map_err(err)?;
    temp.write_all(bytes).map_err(err)?;
    temp.as_file().sync_all().map_err(err)?;
    temp.persist(path).map_err(err)?;
    #[cfg(unix)]
    File::open(parent).and_then(|f| f.sync_all()).map_err(err)?;
    Ok(())
}

impl Store {
    pub fn open(root: impl AsRef<Path>) -> Result<Self> {
        fs::create_dir_all(root.as_ref()).map_err(err)?;
        let root = root.as_ref().canonicalize().map_err(err)?;
        for name in ["notes", "folders"] {
            let path = root.join(name);
            fs::create_dir_all(&path).map_err(err)?;
            if path.canonicalize().map_err(err)? != path {
                return Err("Workspace directories cannot be symlinks or junctions".into());
            }
        }
        let lock_path = root.join("workspace.lock");
        check_file(&lock_path)?;
        let lock = OpenOptions::new()
            .create(true)
            .truncate(false)
            .read(true)
            .write(true)
            .open(lock_path)
            .map_err(err)?;
        lock.try_lock_exclusive()
            .map_err(|_| "This workspace is already open in another Noted process".to_string())?;
        let db_path = root.join("index.sqlite3");
        check_file(&db_path)?;
        let db = Connection::open(db_path).map_err(err)?;
        db.execute_batch("PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS notes(id TEXT PRIMARY KEY, summary TEXT NOT NULL); CREATE VIRTUAL TABLE IF NOT EXISTS note_search USING fts5(id UNINDEXED, title, body, tags, tokenize='unicode61');").map_err(err)?;
        let mut store = Self {
            root,
            db,
            warnings: Vec::new(),
            _lock: lock,
        };
        store.rebuild_index()?;
        Ok(store)
    }

    pub fn status(&self) -> WorkspaceStatus {
        WorkspaceStatus {
            path: self.root.display().to_string(),
            warnings: self.warnings.clone(),
        }
    }

    fn path(&self, collection: &str, id: &str) -> Result<PathBuf> {
        valid_id(id)?;
        let parent = self.root.join(collection);
        if parent.canonicalize().map_err(err)? != parent {
            return Err("Workspace directory changed or is redirected".into());
        }
        let path = parent.join(format!("{id}.json"));
        check_file(&path)?;
        Ok(path)
    }

    fn require_folder(&self, id: &Option<String>) -> Result<()> {
        if let Some(id) = id {
            let path = self.path("folders", id)?;
            let folder: Folder =
                serde_json::from_slice(&fs::read(path).map_err(err)?).map_err(err)?;
            if folder.id != *id {
                return Err("Folder identity does not match its filename".into());
            }
        }
        Ok(())
    }

    pub fn list_folders(&self) -> Result<Vec<Folder>> {
        let mut folders = Vec::new();
        for entry in fs::read_dir(self.root.join("folders")).map_err(err)? {
            let path = entry.map_err(err)?.path();
            if path.extension().and_then(|s| s.to_str()) != Some("json") {
                continue;
            }
            check_file(&path)?;
            let folder: Folder = serde_json::from_slice(&fs::read(&path).map_err(err)?)
                .map_err(|e| format!("Invalid folder {}: {e}; file preserved", path.display()))?;
            valid_id(&folder.id)?;
            if path.file_stem().and_then(|s| s.to_str()) != Some(folder.id.as_str()) {
                return Err("Folder filename mismatch; file preserved".into());
            }
            folders.push(folder);
        }
        let by_id: std::collections::HashMap<&str, &Folder> = folders
            .iter()
            .map(|folder| (folder.id.as_str(), folder))
            .collect();
        for folder in &folders {
            if folder.name.trim().is_empty() || folder.name.len() > 256 {
                return Err("Invalid folder name; file preserved".into());
            }
            let mut visited = HashSet::new();
            visited.insert(folder.id.as_str());
            let mut parent = folder.parent_id.as_deref();
            while let Some(id) = parent {
                if !visited.insert(id) {
                    return Err("Folder hierarchy contains a cycle; files preserved".into());
                }
                parent = by_id
                    .get(id)
                    .ok_or("Folder parent is missing; files preserved")?
                    .parent_id
                    .as_deref();
            }
        }
        folders.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
        Ok(folders)
    }

    pub fn create_folder(&mut self, name: String, parent_id: Option<String>) -> Result<Folder> {
        self.require_folder(&parent_id)?;
        let name = name.trim().to_string();
        if name.is_empty() || name.len() > 256 {
            return Err("Folder name must contain 1–256 bytes".into());
        }
        let folder = Folder {
            id: Uuid::new_v4().to_string(),
            name,
            parent_id,
        };
        atomic_write(
            &self.path("folders", &folder.id)?,
            &serde_json::to_vec_pretty(&folder).map_err(err)?,
        )?;
        Ok(folder)
    }

    pub fn create_note(&mut self, title: String, folder_id: Option<String>) -> Result<Note> {
        let timestamp = now();
        let note = Note {
            format_version: 1,
            id: Uuid::new_v4().to_string(),
            title,
            folder_id,
            tags: vec![],
            revision: 1,
            created_at: timestamp.clone(),
            updated_at: timestamp,
            content: json!({"type":"doc","content":[{"type":"paragraph","attrs":{"id":Uuid::new_v4().to_string()}}]}),
            presentation: Presentation {
                schema_id: "default".into(),
            },
            revision_token: String::new(),
        };
        self.validate(&note)?;
        self.commit(note)
    }

    pub fn load_note(&self, id: &str) -> Result<Note> {
        let bytes =
            fs::read(self.path("notes", id)?).map_err(|e| format!("Cannot open note: {e}"))?;
        let mut note: Note = serde_json::from_slice(&bytes)
            .map_err(|e| format!("Malformed note; original preserved: {e}"))?;
        if note.id != id {
            return Err("Note identity does not match its filename; original preserved".into());
        }
        self.validate(&note)?;
        note.revision_token = token(&bytes);
        Ok(note)
    }

    pub fn save_note(&mut self, mut note: Note, expected_revision: u64) -> Result<Note> {
        self.validate(&note)?;
        let current = self.load_note(&note.id)?;
        if current.revision != expected_revision
            || note.revision != expected_revision
            || note.revision_token != current.revision_token
        {
            return Err("Conflict: this note changed on disk. Your unsaved changes remain in the editor; reload or copy them before retrying.".into());
        }
        note.created_at = current.created_at;
        note.updated_at = now();
        note.revision = current.revision.checked_add(1).ok_or("Revision overflow")?;
        let path = self.path("notes", &note.id)?;
        // Retain the previous complete revision for manual recovery.
        atomic_write(
            &path.with_extension("json.bak"),
            &fs::read(&path).map_err(err)?,
        )?;
        self.commit(note)
    }

    pub fn import_image(
        &self,
        note_id: &str,
        bytes: &[u8],
        mime: &str,
    ) -> Result<crate::assets::ImageInfo> {
        self.load_note(note_id)?;
        crate::assets::import(&self.root, note_id, bytes, mime)
    }

    pub fn read_image(&self, note_id: &str, asset_id: &str) -> Result<crate::assets::ImageData> {
        // Validate the note identity without parsing its whole document per image.
        if !self.path("notes", note_id)?.is_file() {
            return Err("Image owner note is missing".into());
        }
        crate::assets::read(&self.root, note_id, asset_id)
    }

    fn commit(&mut self, mut note: Note) -> Result<Note> {
        note.revision_token.clear();
        let bytes = serde_json::to_vec_pretty(&note).map_err(err)?;
        if bytes.len() as u64 > MAX_NOTE_BYTES {
            return Err("Note exceeds the prototype's 8 MiB limit".into());
        }
        atomic_write(&self.path("notes", &note.id)?, &bytes)?;
        note.revision_token = token(&bytes);
        // A derived-index failure must not report a failed save after commit.
        if let Err(e) = self.index_note(&note) {
            self.warnings.push(format!(
                "Note saved, but search indexing failed: {e}. Rebuild the index."
            ));
        }
        Ok(note)
    }

    fn validate(&self, note: &Note) -> Result<()> {
        valid_id(&note.id)?;
        if note.format_version != 1 {
            return Err("Unsupported note format version".into());
        }
        if note.title.len() > 1024 {
            return Err("Title is too long".into());
        }
        if note.tags.len() > 100 || note.tags.iter().any(|t| t.len() > 256) {
            return Err("Too many tags or tag too long".into());
        }
        if !["default", "compact", "outline"].contains(&note.presentation.schema_id.as_str()) {
            return Err("Unknown schema preset".into());
        }
        if note.content.get("type").and_then(Value::as_str) != Some("doc") {
            return Err("Content must be a document".into());
        }
        self.require_folder(&note.folder_id)?;
        let mut ids = HashSet::new();
        validate_node(&note.content, 0, &mut ids)?;
        Ok(())
    }

    fn index_note(&mut self, note: &Note) -> Result<()> {
        let tx = self.db.transaction().map_err(err)?;
        insert_index(&tx, note)?;
        tx.commit().map_err(err)
    }

    pub fn rebuild_index(&mut self) -> Result<()> {
        // Stream one note at a time: collection size must not determine content
        // memory usage. A failed rebuild rolls the previous index back.
        self.warnings.clear();
        let tx = self.db.unchecked_transaction().map_err(err)?;
        tx.execute_batch("DELETE FROM notes; DELETE FROM note_search;")
            .map_err(err)?;
        for entry in fs::read_dir(self.root.join("notes")).map_err(err)? {
            let path = entry.map_err(err)?.path();
            if path.extension().and_then(|s| s.to_str()) != Some("json") {
                continue;
            }
            let id = path.file_stem().and_then(|s| s.to_str()).unwrap_or("");
            match self.load_note(id) {
                Ok(note) => insert_index(&tx, &note)?,
                Err(e) => self
                    .warnings
                    .push(format!("Skipped {}: {e}", path.display())),
            }
        }
        tx.commit().map_err(err)
    }

    pub fn list_notes(&self) -> Result<Vec<NoteSummary>> {
        let mut statement = self.db.prepare("SELECT summary FROM notes ORDER BY json_extract(summary, '$.updatedAt') DESC LIMIT 10000").map_err(err)?;
        let rows = statement
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(err)?;
        rows.map(|row| serde_json::from_str(&row.map_err(err)?).map_err(err))
            .collect()
    }

    pub fn search_notes(&self, query: &str) -> Result<Vec<NoteSummary>> {
        // Quote user tokens: no FTS operators or syntax errors from ordinary input.
        let terms: Vec<String> = query
            .split_whitespace()
            .take(20)
            .map(|s| format!("\"{}\"*", s.replace('"', "\"\"")))
            .collect();
        if terms.is_empty() {
            return self.list_notes();
        }
        if query.len() > 2048 {
            return Err("Search query is too long".into());
        }
        let mut statement = self.db.prepare("SELECT n.summary FROM note_search s JOIN notes n ON n.id=s.id WHERE note_search MATCH ?1 ORDER BY bm25(note_search) LIMIT 100").map_err(err)?;
        let rows = statement
            .query_map([terms.join(" AND ")], |row| row.get::<_, String>(0))
            .map_err(err)?;
        rows.map(|row| serde_json::from_str(&row.map_err(err)?).map_err(err))
            .collect()
    }
}

fn insert_index(db: &Connection, note: &Note) -> Result<()> {
    db.execute(
        "INSERT INTO notes(id,summary) VALUES (?1,?2) ON CONFLICT(id) DO UPDATE SET summary=excluded.summary",
        params![
            note.id,
            serde_json::to_string(&NoteSummary::from(note)).map_err(err)?
        ],
    )
    .map_err(err)?;
    let rowid: i64 = db
        .query_row("SELECT rowid FROM notes WHERE id=?1", [&note.id], |row| {
            row.get(0)
        })
        .map_err(err)?;
    // FTS rowid is indexed; deleting by an UNINDEXED UUID would scan the
    // entire library on every save and make rebuilds quadratic.
    db.execute("DELETE FROM note_search WHERE rowid=?1", [rowid])
        .map_err(err)?;
    let mut body = String::new();
    extract_text(&note.content, &mut body);
    db.execute(
        "INSERT INTO note_search(rowid,id,title,body,tags) VALUES (?1,?2,?3,?4,?5)",
        params![rowid, note.id, note.title, body, note.tags.join(" ")],
    )
    .map_err(err)?;
    Ok(())
}
fn extract_text(node: &Value, output: &mut String) {
    if let Some(text) = node.get("text").and_then(Value::as_str) {
        output.push_str(text);
    }
    if let Some(children) = node.get("content").and_then(Value::as_array) {
        for child in children {
            extract_text(child, output);
        }
    }
    if node.get("type").and_then(Value::as_str) != Some("text") {
        output.push(' ');
    }
}

/// Keep persisted colors independent of arbitrary CSS declarations and URLs.
fn valid_text_color(value: &Value) -> bool {
    if value.is_null() {
        return true;
    }
    let Some(color) = value.as_str() else {
        return false;
    };
    if let Some(hex) = color.strip_prefix('#') {
        return [3, 6].contains(&hex.len()) && hex.bytes().all(|b| b.is_ascii_hexdigit());
    }
    let Some(rgb) = color.strip_prefix("rgb(").and_then(|v| v.strip_suffix(')')) else {
        return false;
    };
    let channels: Vec<_> = rgb.split(',').collect();
    channels.len() == 3
        && channels.iter().all(|channel| {
            let channel = channel.trim();
            !channel.is_empty()
                && channel.len() <= 3
                && channel.bytes().all(|b| b.is_ascii_digit())
                && channel.parse::<u8>().is_ok()
        })
}

fn validate_node(node: &Value, depth: usize, ids: &mut HashSet<String>) -> Result<()> {
    if depth > 64 {
        return Err("Document nesting exceeds 64 levels".into());
    }
    let kind = node
        .get("type")
        .and_then(Value::as_str)
        .ok_or("Node is missing its type")?;
    if ![
        "doc",
        "paragraph",
        "heading",
        "bulletList",
        "orderedList",
        "listItem",
        "taskList",
        "taskItem",
        "table",
        "tableRow",
        "tableCell",
        "tableHeader",
        "blockquote",
        "codeBlock",
        "horizontalRule",
        "hardBreak",
        "text",
        "notePanel",
        "localImage",
    ]
    .contains(&kind)
    {
        return Err(format!("Unsupported node type: {kind}"));
    }
    let object = node.as_object().ok_or("Node must be an object")?;
    if object
        .keys()
        .any(|key| !["type", "attrs", "content", "text", "marks"].contains(&key.as_str()))
    {
        return Err("Unknown document node field".into());
    }
    if kind == "text" {
        if node
            .get("text")
            .and_then(Value::as_str)
            .is_none_or(str::is_empty)
        {
            return Err("Text nodes must contain nonempty text".into());
        }
    } else if node.get("text").is_some() {
        return Err("Only text nodes can contain text fields".into());
    }
    if let Some(attrs) = node.get("attrs") {
        for (key, value) in attrs.as_object().ok_or("Attributes must be an object")? {
            let allowed = match key.as_str() {
                "id" => {
                    !["doc", "text", "hardBreak"].contains(&kind)
                        && (value.is_string() || value.is_null())
                }
                "level" => {
                    kind == "heading" && value.as_u64().is_some_and(|n| (1..=6).contains(&n))
                }
                "indent" => {
                    ["paragraph", "heading"].contains(&kind)
                        && value.as_u64().is_some_and(|n| n <= 8)
                }
                "textAlign" => {
                    ["paragraph", "heading"].contains(&kind)
                        && (value.is_null()
                            || value.as_str().is_some_and(|s| {
                                ["left", "center", "right", "justify"].contains(&s)
                            }))
                }
                "checked" => kind == "taskItem" && value.is_boolean(),
                "width" => {
                    ["notePanel", "localImage"].contains(&kind)
                        && value.as_u64().is_some_and(|n| (160..=1200).contains(&n))
                }
                "tone" => {
                    kind == "notePanel"
                        && value
                            .as_str()
                            .is_some_and(|s| ["plain", "soft", "accent"].contains(&s))
                }
                "assetId" => {
                    kind == "localImage" && value.as_str().is_some_and(|s| valid_id(s).is_ok())
                }
                "alt" => {
                    kind == "localImage"
                        && value.as_str().is_some_and(|s| s.chars().count() <= 2000)
                }
                "align" => {
                    ["tableCell", "tableHeader", "notePanel", "localImage"].contains(&kind)
                        && ((value.is_null() && ["tableCell", "tableHeader"].contains(&kind))
                            || value
                                .as_str()
                                .is_some_and(|s| ["left", "center", "right"].contains(&s)))
                }
                "colspan" | "rowspan" => {
                    ["tableCell", "tableHeader"].contains(&kind)
                        && value.as_u64().is_some_and(|n| (1..=100).contains(&n))
                }
                "colwidth" => {
                    ["tableCell", "tableHeader"].contains(&kind)
                        && (value.is_null()
                            || value.as_array().is_some_and(|widths| {
                                !widths.is_empty()
                                    && widths.len() <= 100
                                    && widths
                                        .iter()
                                        .all(|width| width.as_u64().is_some_and(|n| n <= 10_000))
                            }))
                }
                "start" => kind == "orderedList" && value.as_i64().is_some(),
                "type" => {
                    kind == "orderedList"
                        && (value.is_null()
                            || value
                                .as_str()
                                .is_some_and(|s| ["1", "a", "A", "i", "I"].contains(&s)))
                }
                "language" => {
                    kind == "codeBlock"
                        && (value.is_null() || value.as_str().is_some_and(|s| s.len() <= 128))
                }
                _ => false,
            };
            if !allowed {
                return Err(format!("Invalid {kind} attribute: {key}"));
            }
        }
    }
    if ["tableCell", "tableHeader"].contains(&kind) {
        if let Some(widths) = node.pointer("/attrs/colwidth").and_then(Value::as_array) {
            let colspan = node
                .pointer("/attrs/colspan")
                .and_then(Value::as_u64)
                .unwrap_or(1);
            if widths.len() as u64 != colspan {
                return Err("Column widths must match the cell's colspan".into());
            }
        }
    }
    if kind == "localImage"
        && !node
            .pointer("/attrs/assetId")
            .and_then(Value::as_str)
            .is_some_and(|s| valid_id(s).is_ok())
    {
        return Err("Local images require a valid asset identifier".into());
    }
    if let Some(id) = node.pointer("/attrs/id").and_then(Value::as_str) {
        if id.len() > 128 || id.is_empty() || !ids.insert(id.to_owned()) {
            return Err("Content element IDs must be unique and nonempty".into());
        }
    }
    if let Some(marks) = node.get("marks") {
        if !["text", "hardBreak"].contains(&kind) && !marks.as_array().is_some_and(Vec::is_empty) {
            return Err("Marks can only style inline content".into());
        }
        let marks = marks.as_array().ok_or("Marks must be an array")?;
        let mut mark_types = HashSet::new();
        for mark in marks {
            let kind = mark
                .get("type")
                .and_then(Value::as_str)
                .ok_or("Missing mark type")?;
            if ![
                "bold",
                "italic",
                "strike",
                "code",
                "link",
                "underline",
                "highlight",
                "subscript",
                "superscript",
                "textStyle",
            ]
            .contains(&kind)
            {
                return Err(format!("Unsupported mark: {kind}"));
            }
            if !mark_types.insert(kind) || (kind == "code" && marks.len() > 1) {
                return Err("Duplicate or incompatible inline marks".into());
            }
            if mark
                .as_object()
                .ok_or("Mark must be an object")?
                .keys()
                .any(|key| !["type", "attrs"].contains(&key.as_str()))
            {
                return Err("Unknown mark field".into());
            }
            if let Some(attrs) = mark.get("attrs") {
                for (key, value) in attrs
                    .as_object()
                    .ok_or("Mark attributes must be an object")?
                {
                    let allowed = match kind {
                        "link" => {
                            ["href", "target", "rel", "class", "title"].contains(&key.as_str())
                                && (value.is_null()
                                    || value.as_str().is_some_and(|s| s.len() <= 4096))
                        }
                        "textStyle" => key == "color" && valid_text_color(value),
                        _ => false,
                    };
                    if !allowed {
                        return Err("Invalid mark attribute".into());
                    }
                }
            }
            if kind == "link" {
                let href = mark
                    .pointer("/attrs/href")
                    .and_then(Value::as_str)
                    .ok_or("Link needs href")?;
                if let Some(id) = href.strip_prefix("noted://note/") {
                    valid_id(id)?;
                } else if !(href.starts_with("https://") || href.starts_with("http://"))
                    || href.chars().any(char::is_control)
                {
                    return Err("Links must be internal note links or HTTP(S) URLs".into());
                }
            }
        }
    }
    let children = match node.get("content") {
        Some(value) => value
            .as_array()
            .ok_or("Content must be an array")?
            .as_slice(),
        None => &[],
    };
    if [
        "doc",
        "blockquote",
        "bulletList",
        "orderedList",
        "listItem",
        "taskList",
        "taskItem",
        "table",
        "tableCell",
        "tableHeader",
        "notePanel",
    ]
    .contains(&kind)
        && children.is_empty()
    {
        return Err(format!("{kind} must contain content"));
    }
    if ["listItem", "taskItem"].contains(&kind)
        && children
            .first()
            .and_then(|n| n.get("type"))
            .and_then(Value::as_str)
            != Some("paragraph")
    {
        return Err("A list item must begin with a paragraph".into());
    }
    for child in children {
        let child_kind = child
            .get("type")
            .and_then(Value::as_str)
            .ok_or("Missing child type")?;
        let allowed = match kind {
            "doc" | "blockquote" | "listItem" | "taskItem" | "tableCell" | "tableHeader"
            | "notePanel" => [
                "paragraph",
                "heading",
                "bulletList",
                "orderedList",
                "blockquote",
                "codeBlock",
                "horizontalRule",
                "taskList",
                "table",
                "notePanel",
                "localImage",
            ]
            .contains(&child_kind),
            "paragraph" | "heading" => ["text", "hardBreak"].contains(&child_kind),
            "bulletList" | "orderedList" => child_kind == "listItem",
            "taskList" => child_kind == "taskItem",
            "table" => child_kind == "tableRow",
            "tableRow" => ["tableCell", "tableHeader"].contains(&child_kind),
            "codeBlock" => {
                child_kind == "text"
                    && child
                        .get("marks")
                        .is_none_or(|m| m.as_array().is_some_and(Vec::is_empty))
            }
            _ => false,
        };
        if !allowed {
            return Err(format!("Invalid {child_kind} child in {kind}"));
        }
        validate_node(child, depth + 1, ids)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn local_assets_are_copied_note_owned_and_survive_reopen() {
        let temp = tempfile::tempdir().unwrap();
        let bytes = include_bytes!("../icons/icon.png");
        let (note_id, other_id, asset_id);
        {
            let mut store = Store::open(temp.path()).unwrap();
            let mut note = store
                .create_note("Illustrated memory".into(), None)
                .unwrap();
            let other = store.create_note("Other note".into(), None).unwrap();
            note_id = note.id.clone();
            other_id = other.id;
            let imported = store.import_image(&note_id, bytes, "image/png").unwrap();
            asset_id = imported.id;
            assert_eq!(
                store.load_note(&note_id).unwrap().revision,
                1,
                "Import does not silently edit note content"
            );
            assert_eq!(store.read_image(&note_id, &asset_id).unwrap().bytes, bytes);
            assert!(
                store.read_image(&other_id, &asset_id).is_err(),
                "No cross-note asset alias"
            );
            note.content = json!({"type":"doc","content":[
                {"type":"notePanel","attrs":{"id":"panel","width":640,"align":"center","tone":"accent"},"content":[
                    {"type":"paragraph","content":[{"type":"text","text":"A memorable aurora"}]},
                    {"type":"localImage","attrs":{"id":"image","assetId":asset_id,"alt":"Green sky","width":480,"align":"right"}}
                ]}
            ]});
            let original_content = note.content.clone();
            let saved = store.save_note(note, 1).unwrap();
            assert_eq!(saved.content, original_content);
            assert_eq!(store.search_notes("aurora").unwrap()[0].id, note_id);
            assert_eq!(store.load_note(&other_id).unwrap().revision, 1);
        }
        let store = Store::open(temp.path()).unwrap();
        assert_eq!(store.read_image(&note_id, &asset_id).unwrap().bytes, bytes);
        assert_eq!(store.search_notes("aurora").unwrap()[0].id, note_id);
        assert_eq!(
            store
                .load_note(&note_id)
                .unwrap()
                .content
                .pointer("/content/0/attrs/tone"),
            Some(&json!("accent"))
        );
    }

    #[test]
    fn unsafe_component_properties_cannot_replace_saved_text() {
        let temp = tempfile::tempdir().unwrap();
        let mut store = Store::open(temp.path()).unwrap();
        let original = store.create_note("Protected".into(), None).unwrap();
        let valid =
            json!({"type":"doc","content":[{"type":"notePanel","content":[{"type":"paragraph"}]}]});
        let mut note = original.clone();
        note.content = valid.clone();
        let saved = store.save_note(note, 1).unwrap(); // omitted optional attributes use editor defaults
        for attrs in [
            json!({"width":0}),
            json!({"width":1201}),
            json!({"width":640.5}),
            json!({"align":"justify"}),
            json!({"tone":"url(https://host)"}),
            json!({"style":"display:none"}),
        ] {
            let mut invalid = saved.clone();
            invalid.content["content"][0]["attrs"] = attrs;
            assert!(store.save_note(invalid, 2).is_err());
        }
        for attrs in [
            json!({}),
            json!({"assetId":"../secret"}),
            json!({"assetId":Uuid::new_v4().to_string(),"src":"https://host/image"}),
            json!({"assetId":Uuid::new_v4().to_string(),"alt":"x".repeat(2001)}),
        ] {
            let mut invalid = saved.clone();
            invalid.content = json!({"type":"doc","content":[{"type":"localImage","attrs":attrs}]});
            assert!(store.save_note(invalid, 2).is_err());
        }
        assert_eq!(store.load_note(&saved.id).unwrap().content, valid);
    }

    #[test]
    fn unsafe_or_missing_assets_are_rejected_without_note_mutation() {
        let temp = tempfile::tempdir().unwrap();
        let mut store = Store::open(temp.path()).unwrap();
        let note = store.create_note("Asset owner".into(), None).unwrap();
        let bytes = include_bytes!("../icons/icon.png");
        assert!(store
            .import_image("../outside", bytes, "image/png")
            .is_err());
        assert!(store
            .import_image(&Uuid::new_v4().to_string(), bytes, "image/png")
            .is_err());
        assert!(store.import_image(&note.id, bytes, "image/jpeg").is_err());
        assert!(store
            .import_image(&note.id, b"<svg onload='alert(1)'/>", "image/svg+xml")
            .is_err());
        assert!(store.read_image(&note.id, "../../outside").is_err());
        let asset = store.import_image(&note.id, bytes, "image/png").unwrap();
        let asset_path = store
            .root
            .join("assets")
            .join(&note.id)
            .join(format!("{}.image", asset.id));
        fs::write(asset_path, b"<script>bad()</script>").unwrap();
        assert!(store.read_image(&note.id, &asset.id).is_err());
        assert_eq!(store.load_note(&note.id).unwrap().revision, 1);
    }

    #[cfg(windows)]
    #[test]
    fn redirected_asset_directories_are_rejected_on_windows() {
        let temp = tempfile::tempdir().unwrap();
        let mut store = Store::open(temp.path().join("workspace")).unwrap();
        let note = store.create_note("Owner".into(), None).unwrap();
        let outside = temp.path().join("outside");
        fs::create_dir(&outside).unwrap();
        let make_junction = |link: &Path| {
            let result = std::process::Command::new("powershell.exe")
                .args(["-NoProfile", "-NonInteractive", "-Command", "$ErrorActionPreference = 'Stop'; New-Item -ItemType Junction -Path $env:NOTED_TEST_LINK -Target $env:NOTED_TEST_TARGET | Out-Null"])
                .env("NOTED_TEST_LINK", link).env("NOTED_TEST_TARGET", &outside).output().unwrap();
            assert!(
                result.status.success(),
                "{}",
                String::from_utf8_lossy(&result.stderr)
            );
        };
        let base = store.root.join("assets");
        make_junction(&base);
        assert!(store
            .import_image(&note.id, include_bytes!("../icons/icon.png"), "image/png")
            .unwrap_err()
            .contains("redirected"));
        fs::remove_dir(&base).unwrap(); // remove the junction itself, never its target
        fs::create_dir(&base).unwrap();
        let owner = base.join(&note.id);
        make_junction(&owner);
        assert!(store
            .import_image(&note.id, include_bytes!("../icons/icon.png"), "image/png")
            .unwrap_err()
            .contains("redirected"));
        assert!(store
            .read_image(&note.id, &Uuid::new_v4().to_string())
            .unwrap_err()
            .contains("redirected"));
        assert_eq!(fs::read_dir(&outside).unwrap().count(), 0);
        fs::remove_dir(owner).unwrap();
    }

    fn expanded_editor_document() -> Value {
        json!({"type":"doc","content":[
            {"type":"heading","attrs":{"id":"heading","level":2,"indent":3,"textAlign":"center"},"content":[
                {"type":"text","text":"Laboratory notes","marks":[{"type":"underline"},{"type":"highlight"},{"type":"textStyle","attrs":{"color":"#8a3d51"}}]}
            ]},
            {"type":"paragraph","attrs":{"id":"formula","indent":0,"textAlign":null},"content":[
                {"type":"text","text":"H"},
                {"type":"text","text":"2","marks":[{"type":"subscript"}]},
                {"type":"text","text":"O, x"},
                {"type":"text","text":"2","marks":[{"type":"superscript"},{"type":"textStyle","attrs":{"color":"rgb(25, 100, 255)"}}]}
            ]},
            {"type":"taskList","attrs":{"id":"tasks"},"content":[
                {"type":"taskItem","attrs":{"id":"task1","checked":true},"content":[
                    {"type":"paragraph","attrs":{"id":"task1text","indent":0,"textAlign":"left"},"content":[{"type":"text","text":"Prepare microscope"}]},
                    {"type":"taskList","attrs":{"id":"subtasks"},"content":[
                        {"type":"taskItem","attrs":{"id":"task2","checked":false},"content":[{"type":"paragraph","attrs":{"id":"task2text"},"content":[{"type":"text","text":"Calibrate lenses"}]}]}
                    ]}
                ]}
            ]},
            {"type":"table","attrs":{"id":"measurements"},"content":[
                {"type":"tableRow","attrs":{"id":"headerrow"},"content":[
                    {"type":"tableHeader","attrs":{"id":"header","colspan":2,"rowspan":1,"colwidth":[120,0],"align":"center"},"content":[{"type":"paragraph","attrs":{"id":"headertext"},"content":[{"type":"text","text":"Observations"}]}]}
                ]},
                {"type":"tableRow","attrs":{"id":"datarow"},"content":[
                    {"type":"tableCell","attrs":{"id":"cell1","colspan":1,"rowspan":1,"colwidth":[120],"align":null},"content":[{"type":"paragraph","attrs":{"id":"cell1text"},"content":[{"type":"text","text":"Chlorophyll"}]}]},
                    {"type":"tableCell","attrs":{"id":"cell2","colspan":1,"rowspan":1,"colwidth":null,"align":"right"},"content":[{"type":"paragraph","attrs":{"id":"cell2text"},"content":[{"type":"text","text":"Present"}]}]}
                ]}
            ]}
        ]})
    }

    #[test]
    fn expanded_editor_content_round_trips_and_remains_searchable() {
        let temp = tempfile::tempdir().unwrap();
        let content = expanded_editor_document();
        let id;
        {
            let mut store = Store::open(temp.path()).unwrap();
            let mut note = store.create_note("Formatting study".into(), None).unwrap();
            id = note.id.clone();
            note.content = content.clone();
            // Outline keeps saved free indent values so Paper can restore them.
            note.presentation.schema_id = "outline".into();
            assert_eq!(store.save_note(note, 1).unwrap().content, content);
            for query in ["microscope", "lenses", "chlorophyll", "observations"] {
                assert_eq!(store.search_notes(query).unwrap()[0].id, id);
            }
        }
        let store = Store::open(temp.path()).unwrap();
        let loaded = store.load_note(&id).unwrap();
        assert_eq!(loaded.content, content);
        assert_eq!(loaded.presentation.schema_id, "outline");
        assert_eq!(loaded.revision, 2);
    }

    #[test]
    fn invalid_extended_attributes_and_shapes_cannot_replace_saved_content() {
        let temp = tempfile::tempdir().unwrap();
        let mut store = Store::open(temp.path()).unwrap();
        let mut note = store.create_note("Keep content".into(), None).unwrap();
        note.content = expanded_editor_document();
        let saved = store.save_note(note, 1).unwrap();
        for (pointer, bad_value) in [
            ("/content/0/attrs/indent", json!(-1)),
            ("/content/0/attrs/indent", json!(9)),
            ("/content/0/attrs/indent", json!(1.5)),
            ("/content/0/attrs/textAlign", json!("left;display:none")),
            (
                "/content/0/content/0/marks/2/attrs/color",
                json!("url(https://example.com)"),
            ),
            (
                "/content/0/content/0/marks/2/attrs/color",
                json!("red;position:fixed"),
            ),
            (
                "/content/0/content/0/marks/2/attrs/color",
                json!("rgb(256, 0, 0)"),
            ),
            (
                "/content/0/content/0/marks/2/attrs/color",
                json!("rgb(-1, 0, 0)"),
            ),
            ("/content/2/content/0/attrs/checked", json!("true")),
            ("/content/2/content/0/content/0/type", json!("heading")),
            ("/content/3/content/0/type", json!("paragraph")),
            ("/content/3/content/0/content/0/attrs/colspan", json!(0)),
            ("/content/3/content/0/content/0/attrs/rowspan", json!(101)),
            (
                "/content/3/content/0/content/0/attrs/colwidth",
                json!([120]),
            ),
            (
                "/content/3/content/0/content/0/attrs/colwidth",
                json!([120, 10001]),
            ),
            (
                "/content/3/content/0/content/0/attrs/align",
                json!("justify"),
            ),
            ("/content/3/content/0/content/0/content", json!([])),
        ] {
            let mut invalid = saved.clone();
            *invalid.content.pointer_mut(pointer).unwrap() = bad_value;
            assert!(
                store.save_note(invalid, 2).is_err(),
                "Accepted invalid field {pointer}"
            );
            assert_eq!(store.load_note(&saved.id).unwrap().content, saved.content);
        }
        let mut invalid = saved.clone();
        invalid.content["content"][0]["content"][0]["marks"][0]["attrs"] =
            json!({"style":"display:none"});
        assert!(store.save_note(invalid, 2).is_err());
        assert_eq!(store.load_note(&saved.id).unwrap().revision, 2);
    }

    #[test]
    fn colors_are_limited_to_portable_literals() {
        for color in [
            Value::Null,
            json!("#123"),
            json!("#12abEF"),
            json!("rgb(0, 25, 255)"),
        ] {
            assert!(valid_text_color(&color), "Rejected {color}");
        }
        for color in [
            json!("#1234"),
            json!("red"),
            json!("rgb(1.5,2,3)"),
            json!("rgb(1,2,3,4)"),
            json!("rgba(0,0,0,1)"),
            json!("var(--color)"),
            json!(2),
        ] {
            assert!(!valid_text_color(&color), "Accepted {color}");
        }
    }

    #[test]
    fn save_reopen_search_and_index_rebuild() {
        let temp = tempfile::tempdir().unwrap();
        let id;
        {
            let mut store = Store::open(temp.path()).unwrap();
            let mut note = store.create_note("Biology".into(), None).unwrap();
            id = note.id.clone();
            note.content = json!({"type":"doc","content":[{"type":"paragraph","attrs":{"id":"p1"},"content":[{"type":"text","text":"Photosynthesis converts sunlight"}]}]});
            note.tags = vec!["science".into()];
            let saved = store.save_note(note, 1).unwrap();
            assert_eq!(saved.revision, 2);
            assert_eq!(store.search_notes("photosynth").unwrap()[0].id, id);
            assert_eq!(store.search_notes("science").unwrap()[0].id, id);
        }
        // Removal of the derived database does not remove authoritative content.
        fs::remove_file(temp.path().join("index.sqlite3")).unwrap();
        let mut store = Store::open(temp.path()).unwrap();
        let note = store.load_note(&id).unwrap();
        assert_eq!(note.revision, 2);
        assert_eq!(
            note.content["content"][0]["content"][0]["text"],
            "Photosynthesis converts sunlight"
        );
        store.rebuild_index().unwrap();
        assert_eq!(store.search_notes("sunlight").unwrap()[0].id, id);
    }

    #[test]
    fn stale_save_and_unversioned_external_edit_are_rejected() {
        let temp = tempfile::tempdir().unwrap();
        let mut store = Store::open(temp.path()).unwrap();
        let note = store.create_note("Original".into(), None).unwrap();
        let stale = note.clone();
        let updated = store.save_note(note, 1).unwrap();
        assert!(store.save_note(stale, 1).unwrap_err().contains("Conflict"));
        let path = store.path("notes", &updated.id).unwrap();
        let mut external: Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
        external["title"] = json!("Externally changed");
        fs::write(&path, serde_json::to_vec(&external).unwrap()).unwrap();
        assert!(store
            .save_note(updated, 2)
            .unwrap_err()
            .contains("Conflict"));
        assert_eq!(
            store
                .load_note(external["id"].as_str().unwrap())
                .unwrap()
                .title,
            "Externally changed"
        );
    }

    #[test]
    fn rename_move_and_reopen_preserve_link_target() {
        let temp = tempfile::tempdir().unwrap();
        let source_id;
        let target_id;
        {
            let mut store = Store::open(temp.path()).unwrap();
            let target = store.create_note("Old title".into(), None).unwrap();
            target_id = target.id.clone();
            let folder = store.create_folder("University".into(), None).unwrap();
            let child = store
                .create_folder("Biology".into(), Some(folder.id))
                .unwrap();
            let mut source = store.create_note("Source".into(), None).unwrap();
            source_id = source.id.clone();
            source.content = json!({"type":"doc","content":[{"type":"paragraph","attrs":{"id":"p1"},"content":[{"type":"text","text":"Old title","marks":[{"type":"link","attrs":{"href":format!("noted://note/{target_id}")}}]}]}]});
            store.save_note(source, 1).unwrap();
            let mut moved = target;
            moved.title = "Renamed".into();
            moved.folder_id = Some(child.id);
            store.save_note(moved, 1).unwrap();
        }
        let store = Store::open(temp.path()).unwrap();
        let source = store.load_note(&source_id).unwrap();
        assert_eq!(
            source.content["content"][0]["content"][0]["marks"][0]["attrs"]["href"],
            format!("noted://note/{target_id}")
        );
        assert_eq!(store.load_note(&target_id).unwrap().title, "Renamed");
    }

    #[test]
    fn malformed_files_are_preserved_and_reported() {
        let temp = tempfile::tempdir().unwrap();
        let mut store = Store::open(temp.path()).unwrap();
        let note = store.create_note("Keep me".into(), None).unwrap();
        let path = store.path("notes", &note.id).unwrap();
        fs::write(&path, b"{broken json").unwrap();
        assert!(store.save_note(note, 1).is_err());
        store.rebuild_index().unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"{broken json");
        assert_eq!(store.status().warnings.len(), 1);
        assert!(store.list_notes().unwrap().is_empty());
    }

    #[test]
    fn path_traversal_and_invalid_links_are_rejected() {
        let temp = tempfile::tempdir().unwrap();
        let mut store = Store::open(temp.path()).unwrap();
        assert!(store.load_note("../../secret").is_err());
        let mut note = store.create_note("Safe".into(), None).unwrap();
        note.content = json!({"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"unsafe","marks":[{"type":"link","attrs":{"href":"javascript:alert(1)"}}]}]}]});
        assert!(store.save_note(note.clone(), 1).is_err());
        assert_eq!(store.load_note(&note.id).unwrap().revision, 1);
    }

    #[test]
    fn previous_revision_is_backed_up_and_workspace_is_single_writer() {
        let temp = tempfile::tempdir().unwrap();
        let mut store = Store::open(temp.path()).unwrap();
        assert!(Store::open(temp.path()).is_err());
        let mut note = store.create_note("Before".into(), None).unwrap();
        note.title = "After".into();
        let updated = store.save_note(note, 1).unwrap();
        let backup = store
            .path("notes", &updated.id)
            .unwrap()
            .with_extension("json.bak");
        let old: Note = serde_json::from_slice(&fs::read(backup).unwrap()).unwrap();
        assert_eq!(old.title, "Before");
        assert_eq!(store.load_note(&updated.id).unwrap().title, "After");
    }

    #[test]
    fn rejects_document_shapes_that_the_editor_would_drop() {
        let temp = tempfile::tempdir().unwrap();
        let mut store = Store::open(temp.path()).unwrap();
        let note = store.create_note("Original".into(), None).unwrap();
        for content in [
            json!({"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":""}]}]}),
            json!({"type":"doc","content":[{"type":"text","text":"orphan"}]}),
            json!({"type":"doc","content":[{"type":"paragraph","content":[{"type":"heading"}]}]}),
            json!({"type":"doc","content":[{"type":"paragraph","attrs":{"style":"display:none"}}]}),
            json!({"type":"doc","content":[{"type":"heading","attrs":{"level":9}}]}),
        ] {
            let mut invalid = note.clone();
            invalid.content = content;
            assert!(store.save_note(invalid, 1).is_err());
        }
        assert_eq!(store.load_note(&note.id).unwrap().revision, 1);
        let mut valid = note;
        valid.content = json!({"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Reference","marks":[{"type":"link","attrs":{"href":"https://example.com","target":null,"rel":null,"class":null,"title":null}}]}]}]});
        assert!(store.save_note(valid, 1).is_ok());
    }
}
