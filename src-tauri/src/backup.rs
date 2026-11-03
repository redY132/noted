//! Consistent portable data snapshots. Restore always creates a separate workspace.
use crate::store::Store;
use rusqlite::{params, Connection, OpenFlags};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::HashSet,
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
};
type Result<T> = std::result::Result<T, String>;
const APP_ID: i64 = 0x4e544442;
const MAX_FILE: u64 = 32 * 1024 * 1024;
const MAX_TOTAL: u64 = 8 * 1024 * 1024 * 1024;
const MAX_FILES: usize = 200000;
const MAX_PAIRS: u64 = 2000000;
fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Summary {
    pub format_version: u32,
    pub created_at: String,
    pub files: usize,
    pub bytes: u64,
    pub notes: usize,
    pub assets: usize,
    pub definitions: usize,
    pub pairs: u64,
    pub relationships_digest: String,
    #[serde(default)]
    pub warnings: Vec<String>,
    #[serde(default)]
    pub path: String,
    #[serde(default)]
    pub digest: String,
}
pub fn display_path(path: &Path) -> String {
    let value = path.display().to_string();
    if let Some(tail) = value.strip_prefix(r"\\?\UNC\") {
        format!(r"\\{}", tail)
    } else {
        value.strip_prefix(r"\\?\").unwrap_or(&value).to_string()
    }
}
fn ordinary(path: &Path, directory: bool) -> Result<()> {
    let m = fs::symlink_metadata(path).map_err(err)?;
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if m.file_attributes() & 0x400 != 0 {
            return Err("Backup paths cannot use redirected files or junctions".into());
        }
    }
    if m.file_type().is_symlink() || m.is_dir() != directory || !directory && !m.is_file() {
        return Err("Backup paths must be ordinary files and directories".into());
    }
    Ok(())
}
fn segment(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= 160
        && s != "."
        && s != ".."
        && !s.ends_with('.')
        && s.bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"_.-".contains(&b))
        && !matches!(
            s.split('.')
                .next()
                .unwrap_or("")
                .to_ascii_uppercase()
                .as_str(),
            "CON"
                | "PRN"
                | "AUX"
                | "NUL"
                | "COM1"
                | "COM2"
                | "COM3"
                | "COM4"
                | "COM5"
                | "COM6"
                | "COM7"
                | "COM8"
                | "COM9"
                | "LPT1"
                | "LPT2"
                | "LPT3"
                | "LPT4"
                | "LPT5"
                | "LPT6"
                | "LPT7"
                | "LPT8"
                | "LPT9"
        )
}
fn valid_path(path: &str) -> Result<()> {
    let parts: Vec<_> = path.split('/').collect();
    if !parts.iter().all(|s| segment(s)) {
        return Err("Unsafe path in workspace backup".into());
    }
    let allowed = match parts.as_slice() {
        ["notes", name] => name.ends_with(".json") || name.ends_with(".json.bak"),
        ["folders", name] => name.ends_with(".json"),
        ["assets", _, name] => name.ends_with(".image"),
        ["schemas" | "components", _, name] => name.ends_with(".json"),
        _ => false,
    };
    if !allowed {
        return Err(format!("Unsupported backup path: {path}"));
    }
    Ok(())
}
fn destination(path: &Path) -> Result<PathBuf> {
    if !path.is_absolute() {
        return Err("Choose an absolute destination path".into());
    }
    if fs::symlink_metadata(path).is_ok() {
        return Err(
            "The destination already exists. Choose a new name; existing data will not be replaced"
                .into(),
        );
    }
    let parent = path.parent().ok_or("Destination folder is missing")?;
    ordinary(parent, true)?;
    let canonical = parent.canonicalize().map_err(err)?;
    for ancestor in parent.ancestors() {
        ordinary(ancestor, true)?;
    }
    let name = path.file_name().ok_or("Destination needs a name")?;
    if name.to_string_lossy().ends_with(['.', ' ']) {
        return Err("Invalid destination name".into());
    }
    Ok(canonical.join(name))
}
fn transfer(mut source: impl Read, mut target: impl Write, expected: u64) -> Result<String> {
    let mut buffer = [0u8; 64 * 1024];
    let mut hash = Sha256::new();
    let mut total = 0;
    loop {
        let n = source.read(&mut buffer).map_err(err)?;
        if n == 0 {
            break;
        }
        total += n as u64;
        if total > expected {
            return Err("Backup file changed size or exceeds its limit".into());
        }
        hash.update(&buffer[..n]);
        target.write_all(&buffer[..n]).map_err(err)?;
    }
    if total != expected {
        return Err("Backup file is truncated".into());
    }
    Ok(format!("{:x}", hash.finalize()))
}
fn digest(path: &Path) -> Result<String> {
    let len = fs::metadata(path).map_err(err)?.len();
    if len > MAX_TOTAL + 512 * 1024 * 1024 {
        return Err("Backup exceeds its size limit".into());
    }
    transfer(File::open(path).map_err(err)?, std::io::sink(), len)
}
fn inventory(root: &Path) -> Result<Vec<(String, PathBuf)>> {
    fn visit(
        root: &Path,
        path: &Path,
        files: &mut Vec<(String, PathBuf)>,
        depth: usize,
    ) -> Result<()> {
        ordinary(path, true)?;
        if depth > 3 {
            return Err("Unsupported workspace directory depth".into());
        }
        for entry in fs::read_dir(path).map_err(err)? {
            let p = entry.map_err(err)?.path();
            let m = fs::symlink_metadata(&p).map_err(err)?;
            if m.is_dir() {
                visit(root, &p, files, depth + 1)?;
            } else {
                ordinary(&p, false)?;
                let relative = p
                    .strip_prefix(root)
                    .map_err(err)?
                    .to_str()
                    .ok_or("Unsupported workspace filename")?
                    .replace('\\', "/");
                valid_path(&relative)?;
                files.push((relative, p));
                if files.len() > MAX_FILES {
                    return Err("Workspace exceeds the backup file limit".into());
                }
            }
        }
        Ok(())
    }
    let mut files = Vec::new();
    for directory in ["notes", "folders", "assets", "schemas", "components"] {
        let p = root.join(directory);
        if p.exists() {
            visit(root, &p, &mut files, 1)?;
        }
    }
    files.sort_by(|a, b| a.0.cmp(&b.0));
    Ok(files)
}
impl Store {
    /// Caller holds the store writer mutex. Files and all relationship rows share one snapshot point.
    pub fn create_backup(&self, path: &Path) -> Result<Summary> {
        let target = destination(path)?;
        if target.starts_with(&self.root) {
            return Err("Save the backup outside the active workspace".into());
        }
        if target.extension().and_then(|s| s.to_str()) != Some("noted-backup") {
            return Err("Backup filename must end with .noted-backup".into());
        }
        let files = inventory(&self.root)?;
        let temp = tempfile::NamedTempFile::new_in(target.parent().unwrap()).map_err(err)?;
        let mut db = Connection::open(temp.path()).map_err(err)?;
        db.execute_batch(&format!("PRAGMA application_id={APP_ID};PRAGMA journal_mode=DELETE;PRAGMA synchronous=FULL;CREATE TABLE metadata(json TEXT NOT NULL);CREATE TABLE files(path TEXT PRIMARY KEY COLLATE NOCASE,size INTEGER NOT NULL,sha256 TEXT NOT NULL,bytes BLOB NOT NULL);CREATE TABLE pairs(a TEXT,b TEXT,connected INTEGER,dismissed INTEGER,revision INTEGER,strength INTEGER,PRIMARY KEY(a,b));")).map_err(err)?;
        let tx = db.transaction().map_err(err)?;
        let mut summary = Summary {
            format_version: 1,
            created_at: chrono::Utc::now().to_rfc3339(),
            files: 0,
            bytes: 0,
            notes: 0,
            assets: 0,
            definitions: 0,
            pairs: 0,
            relationships_digest: String::new(),
            warnings: vec![],
            path: String::new(),
            digest: String::new(),
        };
        for (relative, source) in files {
            let before = fs::metadata(&source).map_err(err)?;
            let size = before.len();
            summary.bytes += size;
            if size > MAX_FILE || summary.bytes > MAX_TOTAL {
                return Err("Workspace exceeds the bounded backup size limit (32 MiB per file, 8 GiB total)".into());
            }
            tx.execute(
                "INSERT INTO files VALUES(?1,?2,'',zeroblob(?2))",
                params![relative, size as i64],
            )
            .map_err(err)?;
            let id = tx.last_insert_rowid();
            let mut blob = tx
                .blob_open("main", "files", "bytes", id, false)
                .map_err(err)?;
            let hash = transfer(File::open(&source).map_err(err)?, &mut blob, size)?;
            drop(blob);
            let after = fs::metadata(&source).map_err(err)?;
            if before.len() != after.len() || before.modified().ok() != after.modified().ok() {
                return Err("A workspace file changed outside Noted during backup. Close external editors and retry".into());
            }
            tx.execute(
                "UPDATE files SET sha256=?1 WHERE rowid=?2",
                params![hash, id],
            )
            .map_err(err)?;
            summary.files += 1;
            if relative.starts_with("notes/") && relative.ends_with(".json") {
                summary.notes += 1;
            }
            if relative.starts_with("assets/") {
                summary.assets += 1;
            }
            if relative.starts_with("schemas/") || relative.starts_with("components/") {
                summary.definitions += 1;
            }
        }
        let mut relationship_hash = Sha256::new();
        let mut stmt = self
            .relations
            .prepare("SELECT a,b,connected,dismissed,revision,strength FROM pairs ORDER BY a,b")
            .map_err(err)?;
        let mut rows = stmt.query([]).map_err(err)?;
        while let Some(row) = rows.next().map_err(err)? {
            let a: String = row.get(0).map_err(err)?;
            let b: String = row.get(1).map_err(err)?;
            let c: i64 = row.get(2).map_err(err)?;
            let d: i64 = row.get(3).map_err(err)?;
            let r: i64 = row.get(4).map_err(err)?;
            let s: i64 = row.get(5).map_err(err)?;
            valid_pair(&a, &b, c, d, r, s)?;
            relationship_hash.update(serde_json::to_vec(&(&a, &b, c, d, r, s)).map_err(err)?);
            tx.execute(
                "INSERT INTO pairs VALUES(?1,?2,?3,?4,?5,?6)",
                params![a, b, c, d, r, s],
            )
            .map_err(err)?;
            summary.pairs += 1;
            if summary.pairs > MAX_PAIRS {
                return Err("Workspace exceeds the backup relationship limit".into());
            }
        }
        summary.relationships_digest = format!("{:x}", relationship_hash.finalize());
        tx.execute(
            "INSERT INTO metadata VALUES(?1)",
            [serde_json::to_string(&summary).map_err(err)?],
        )
        .map_err(err)?;
        tx.commit().map_err(err)?;
        db.close().map_err(|(_, e)| err(e))?;
        temp.as_file().sync_all().map_err(err)?;
        let archive_digest = digest(temp.path())?;
        temp.persist_noclobber(&target).map_err(err)?;
        summary.path = display_path(&target);
        summary.digest = archive_digest;
        Ok(summary)
    }
}
fn valid_pair(a: &str, b: &str, c: i64, d: i64, r: i64, s: i64) -> Result<()> {
    crate::store::valid_id(a)?;
    crate::store::valid_id(b)?;
    if a >= b || ![0, 1].contains(&c) || ![0, 1].contains(&d) || r < 1 || !(1..=5).contains(&s) {
        return Err("Invalid saved relationship".into());
    }
    Ok(())
}
fn open_archive(path: &Path) -> Result<Connection> {
    ordinary(path, false)?;
    if fs::metadata(path).map_err(err)?.len() > MAX_TOTAL + 512 * 1024 * 1024 {
        return Err("Backup archive exceeds its size limit".into());
    }
    let db = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY).map_err(err)?;
    db.set_limit(
        rusqlite::limits::Limit::SQLITE_LIMIT_LENGTH,
        (MAX_FILE + 4096) as i32,
    )
    .map_err(err)?;
    db.set_limit(rusqlite::limits::Limit::SQLITE_LIMIT_SQL_LENGTH, 16384)
        .map_err(err)?;
    db.execute_batch("PRAGMA trusted_schema=OFF;PRAGMA query_only=ON;")
        .map_err(err)?;
    if db
        .query_row("PRAGMA application_id", [], |r| r.get::<_, i64>(0))
        .map_err(err)?
        != APP_ID
    {
        return Err("This is not a Noted workspace backup".into());
    }
    let mut stmt = db
        .prepare("SELECT name,type,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%'")
        .map_err(err)?;
    let mut rows = stmt.query([]).map_err(err)?;
    let mut names = HashSet::new();
    while let Some(row) = rows.next().map_err(err)? {
        let name: String = row.get(0).map_err(err)?;
        let kind: String = row.get(1).map_err(err)?;
        let sql: String = row.get(2).map_err(err)?;
        if kind != "table"
            || !matches!(name.as_str(), "metadata" | "files" | "pairs")
            || sql.to_ascii_uppercase().contains("VIRTUAL")
        {
            return Err("Unexpected executable schema in backup".into());
        }
        let expected=match name.as_str(){"metadata"=>"CREATE TABLE metadata(json TEXT NOT NULL)","files"=>"CREATE TABLE files(path TEXT PRIMARY KEY COLLATE NOCASE,size INTEGER NOT NULL,sha256 TEXT NOT NULL,bytes BLOB NOT NULL)","pairs"=>"CREATE TABLE pairs(a TEXT,b TEXT,connected INTEGER,dismissed INTEGER,revision INTEGER,strength INTEGER,PRIMARY KEY(a,b))",_=>return Err("Unexpected backup schema".into())};
        if sql.trim() != expected {
            return Err("The backup schema does not match its format version".into());
        }
        names.insert(name);
    }
    if names.len() != 3 {
        return Err("Incomplete backup schema".into());
    }
    drop(rows);
    drop(stmt);
    if db
        .query_row("PRAGMA quick_check", [], |r| r.get::<_, String>(0))
        .map_err(err)?
        != "ok"
    {
        return Err("Backup database is damaged".into());
    }
    Ok(db)
}
fn extract(path: &Path, stage: &Path) -> Result<Summary> {
    let db = open_archive(path)?;
    let count: i64 = db
        .query_row("SELECT count(*) FROM metadata", [], |r| r.get(0))
        .map_err(err)?;
    if count != 1 {
        return Err("Invalid backup metadata".into());
    }
    let metadata_size: i64 = db
        .query_row("SELECT length(json) FROM metadata", [], |r| r.get(0))
        .map_err(err)?;
    if metadata_size > 65536 {
        return Err("Oversized backup metadata".into());
    }
    let metadata: String = db
        .query_row("SELECT json FROM metadata", [], |r| r.get(0))
        .map_err(err)?;
    if metadata.len() > 65536 {
        return Err("Oversized backup metadata".into());
    }
    let mut summary: Summary = serde_json::from_str(&metadata).map_err(err)?;
    if summary.format_version != 1
        || summary.files > MAX_FILES
        || summary.bytes > MAX_TOTAL
        || summary.pairs > MAX_PAIRS
    {
        return Err("Unsupported or excessive backup contents".into());
    }
    let mut stmt=db.prepare("SELECT rowid,CASE WHEN length(path)<=512 THEN path ELSE NULL END,size,CASE WHEN length(sha256)=64 THEN sha256 ELSE NULL END,length(bytes) FROM files ORDER BY path").map_err(err)?;
    let mut rows = stmt.query([]).map_err(err)?;
    let mut files = 0;
    let mut bytes = 0;
    let mut notes = 0;
    let mut assets = 0;
    let mut definitions = 0;
    let mut names = HashSet::new();
    while let Some(row) = rows.next().map_err(err)? {
        let id: i64 = row.get(0).map_err(err)?;
        let relative: String = row.get(1).map_err(err)?;
        valid_path(&relative)?;
        if !names.insert(relative.to_ascii_lowercase()) {
            return Err("Duplicate backup path".into());
        }
        let size = u64::try_from(row.get::<_, i64>(2).map_err(err)?).map_err(err)?;
        let hash: String = row.get(3).map_err(err)?;
        let actual = u64::try_from(row.get::<_, i64>(4).map_err(err)?).map_err(err)?;
        files += 1;
        bytes += size;
        if size != actual
            || size > MAX_FILE
            || bytes > MAX_TOTAL
            || files > MAX_FILES
            || hash.len() != 64
        {
            return Err("Invalid backup file size or checksum".into());
        }
        if relative.starts_with("notes/") && relative.ends_with(".json") {
            notes += 1;
        }
        if relative.starts_with("assets/") {
            assets += 1;
        }
        if relative.starts_with("schemas/") || relative.starts_with("components/") {
            definitions += 1;
        }
        let target = stage.join(relative);
        fs::create_dir_all(target.parent().unwrap()).map_err(err)?;
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&target)
            .map_err(err)?;
        let blob = db
            .blob_open("main", "files", "bytes", id, true)
            .map_err(err)?;
        if transfer(blob, &mut file, size)? != hash {
            return Err("Backup checksum mismatch; no workspace was restored".into());
        }
        file.sync_all().map_err(err)?;
    }
    if files != summary.files
        || bytes != summary.bytes
        || notes != summary.notes
        || assets != summary.assets
        || definitions != summary.definitions
    {
        return Err("Backup manifest does not match its files".into());
    }
    let mut store = Store::open_cached(stage)?;
    let mut pairs = db
        .prepare("SELECT a,b,connected,dismissed,revision,strength FROM pairs ORDER BY a,b")
        .map_err(err)?;
    let mut rows = pairs.query([]).map_err(err)?;
    let tx = store.relations.transaction().map_err(err)?;
    let mut count = 0;
    let mut relationship_hash = Sha256::new();
    while let Some(row) = rows.next().map_err(err)? {
        let a: String = row.get(0).map_err(err)?;
        let b: String = row.get(1).map_err(err)?;
        let c: i64 = row.get(2).map_err(err)?;
        let d: i64 = row.get(3).map_err(err)?;
        let r: i64 = row.get(4).map_err(err)?;
        let s: i64 = row.get(5).map_err(err)?;
        valid_pair(&a, &b, c, d, r, s)?;
        relationship_hash.update(serde_json::to_vec(&(&a, &b, c, d, r, s)).map_err(err)?);
        count += 1;
        if count > MAX_PAIRS {
            return Err("Too many backup relationships".into());
        }
        tx.execute(
            "INSERT INTO pairs VALUES(?1,?2,?3,?4,?5,?6)",
            params![a, b, c, d, r, s],
        )
        .map_err(err)?;
    }
    if count != summary.pairs
        || format!("{:x}", relationship_hash.finalize()) != summary.relationships_digest
    {
        return Err("Backup relationship count mismatch".into());
    }
    tx.commit().map_err(err)?;
    store.rebuild_index()?;
    summary.warnings = store.status().warnings;
    store
        .relations
        .execute_batch("PRAGMA wal_checkpoint(TRUNCATE)")
        .map_err(err)?;
    store
        .db
        .execute_batch("PRAGMA wal_checkpoint(TRUNCATE)")
        .map_err(err)?;
    drop(store);
    summary.path = display_path(path);
    summary.digest = digest(path)?;
    Ok(summary)
}
pub fn inspect_backup(path: &Path) -> Result<Summary> {
    let stage = tempfile::tempdir().map_err(err)?;
    let before = digest(path)?;
    let summary = extract(path, stage.path())?;
    if summary.digest != before {
        return Err("Backup changed during inspection".into());
    }
    Ok(summary)
}
pub fn restore_backup(path: &Path, target: &Path, expected_digest: &str) -> Result<Summary> {
    let target = destination(target)?;
    if expected_digest.len() != 64 || digest(path)? != expected_digest {
        return Err("Backup changed since inspection. Inspect it again".into());
    }
    let stage = tempfile::tempdir_in(target.parent().unwrap()).map_err(err)?;
    let mut summary = extract(path, stage.path())?;
    if summary.digest != expected_digest {
        return Err("Backup changed while restoring".into());
    }
    // Reserve a brand-new directory; never merge with or replace an existing workspace.
    fs::create_dir(&target).map_err(err)?;
    let marker = target.join(".noted-restore-incomplete");
    let mut marker_file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&marker)
        .map_err(err)?;
    marker_file
        .write_all(expected_digest.as_bytes())
        .map_err(err)?;
    marker_file.sync_all().map_err(err)?;
    drop(marker_file);
    fn publish(source: &Path, target: &Path) -> Result<()> {
        for entry in fs::read_dir(source).map_err(err)? {
            let p = entry.map_err(err)?.path();
            let name = p.file_name().unwrap();
            if name == "workspace.lock"
                || name.to_string_lossy().ends_with("-wal")
                || name.to_string_lossy().ends_with("-shm")
            {
                continue;
            }
            let dest = target.join(name);
            if p.is_dir() {
                fs::create_dir(&dest).map_err(err)?;
                publish(&p, &dest)?;
            } else {
                let size = fs::metadata(&p).map_err(err)?.len();
                let mut file = OpenOptions::new()
                    .create_new(true)
                    .write(true)
                    .open(&dest)
                    .map_err(err)?;
                transfer(File::open(&p).map_err(err)?, &mut file, size)?;
                file.sync_all().map_err(err)?;
            }
        }
        Ok(())
    }
    publish(stage.path(),&target).map_err(|e|format!("Restore copy is incomplete at {}: {e}. The original workspace is unchanged. Choose a new folder to retry.",target.display()))?;
    fs::remove_file(marker).map_err(err)?;
    summary.path = display_path(&target);
    Ok(summary)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    fn fixture(root: &Path) -> Store {
        let mut store = Store::open(root).unwrap();
        let folder = store.create_folder("Saved folder".into(), None).unwrap();
        let mut a = store
            .create_note("Original title".into(), Some(folder.id))
            .unwrap();
        let b = store.create_note("Second note".into(), None).unwrap();
        let image = store
            .import_image(&a.id, include_bytes!("../icons/icon.png"), "image/png")
            .unwrap();
        a.content = json!({"type":"doc","content":[{"type":"paragraph","attrs":{"id":"body"},"content":[{"type":"text","text":"Preserved authored words"}]},{"type":"localImage","attrs":{"id":"image","assetId":image.id,"alt":"Saved image"}}]});
        a.format_version = 2;
        a.document = Some(crate::document::migrate(&a.id, &a.content));
        store.save_note(a, 1).unwrap();
        store
            .set_relation_strength(
                &b.id,
                &store
                    .list_notes()
                    .unwrap()
                    .into_iter()
                    .find(|n| n.id != b.id)
                    .unwrap()
                    .id,
                Some(true),
                None,
                None,
                Some(5),
            )
            .unwrap();
        store.save_document_definition("schema",&json!({"formatVersion":1,"id":"saved","version":1,"name":"Saved schema","rules":{"body":{"fontSize":18}}})).unwrap();
        store.save_document_definition("component",&json!({"manifest":{"formatVersion":1,"id":"saved","version":1,"name":"Saved component","fallback":"Readable fallback","properties":{},"persistentState":{},"transientState":{},"searchText":[]},"source":"({render(input,ui){return ui.text('Never run while restoring')}})"})).unwrap();
        fs::create_dir_all(store.root.join("semantic")).unwrap();
        fs::write(store.root.join("semantic/private-cache"), b"derived").unwrap();
        fs::create_dir_all(store.root.join("device-profile")).unwrap();
        fs::write(
            store.root.join("device-profile/approvals.json"),
            b"never portable",
        )
        .unwrap();
        store
    }
    #[test]
    fn live_snapshot_restores_exact_files_assets_definitions_and_relationship_revisions() {
        let temp = tempfile::tempdir().unwrap();
        let mut source = fixture(&temp.path().join("source"));
        let original: Vec<_> = inventory(&source.root)
            .unwrap()
            .into_iter()
            .map(|(p, f)| (p, fs::read(f).unwrap()))
            .collect();
        let pairs = source.export_relations().unwrap();
        let path = temp.path().join("saved.noted-backup");
        let summary = source.create_backup(&path).unwrap();
        assert_eq!(summary.notes, 2);
        assert_eq!(summary.assets, 1);
        assert_eq!(summary.definitions, 2);
        assert_eq!(summary.pairs, 1);
        let note = source.list_notes().unwrap()[0].clone();
        let mut changed = source.load_note(&note.id).unwrap();
        changed.title = "Changed after backup".into();
        source.save_note(changed, note.revision).unwrap();
        let reviewed = inspect_backup(&path).unwrap();
        let target = temp.path().join("restored");
        restore_backup(&path, &target, &reviewed.digest).unwrap();
        for (relative, bytes) in original {
            assert_eq!(fs::read(target.join(relative)).unwrap(), bytes);
        }
        assert!(!target.join("semantic").exists());
        assert!(!target.join("device-profile").exists());
        assert!(!target.join("approvals.json").exists());
        let restored = Store::open(&target).unwrap();
        assert_eq!(restored.export_relations().unwrap(), pairs);
        assert_eq!(restored.list_notes().unwrap().len(), 2);
        assert_eq!(
            restored
                .list_document_definitions("component")
                .unwrap()
                .len(),
            1
        );
        assert_eq!(restored.search_notes("Preserved").unwrap().len(), 1);
        assert_ne!(
            source.list_notes().unwrap()[0].title,
            restored.list_notes().unwrap()[0].title
        );
    }
    #[test]
    fn corrupt_or_changed_archive_and_traversal_never_create_a_restored_workspace() {
        let temp = tempfile::tempdir().unwrap();
        let source = fixture(&temp.path().join("source"));
        let path = temp.path().join("saved.noted-backup");
        source.create_backup(&path).unwrap();
        let reviewed = inspect_backup(&path).unwrap();
        {
            let db = Connection::open(&path).unwrap();
            db.execute(
                "UPDATE files SET bytes=zeroblob(size) WHERE path=(SELECT min(path) FROM files)",
                [],
            )
            .unwrap();
        }
        let target = temp.path().join("bad");
        assert!(restore_backup(&path, &target, &reviewed.digest).is_err());
        assert!(!target.exists());
        assert!(inspect_backup(&path).is_err());
        let path2 = temp.path().join("traversal.noted-backup");
        source.create_backup(&path2).unwrap();
        {
            let db = Connection::open(&path2).unwrap();
            db.execute(
                "UPDATE files SET path='../escape.json' WHERE path=(SELECT min(path) FROM files)",
                [],
            )
            .unwrap();
        }
        assert!(inspect_backup(&path2).is_err());
        assert!(!temp.path().join("escape.json").exists());
    }
    #[test]
    fn existing_backup_or_restore_destination_is_never_overwritten() {
        let temp = tempfile::tempdir().unwrap();
        let source = fixture(&temp.path().join("source"));
        let path = temp.path().join("saved.noted-backup");
        source.create_backup(&path).unwrap();
        let before = fs::read(&path).unwrap();
        assert!(source.create_backup(&path).is_err());
        assert_eq!(fs::read(&path).unwrap(), before);
        let reviewed = inspect_backup(&path).unwrap();
        let target = temp.path().join("existing");
        fs::create_dir(&target).unwrap();
        fs::write(target.join("important.txt"), b"keep").unwrap();
        assert!(restore_backup(&path, &target, &reviewed.digest).is_err());
        assert_eq!(fs::read(target.join("important.txt")).unwrap(), b"keep");
        assert!(source
            .create_backup(&source.root.join("nested.noted-backup"))
            .is_err());
    }
    #[test]
    fn malformed_note_is_preserved_with_a_restore_warning_and_incomplete_copies_do_not_open() {
        let temp = tempfile::tempdir().unwrap();
        let source = fixture(&temp.path().join("source"));
        let id = uuid::Uuid::new_v4();
        let name = format!("notes/{id}.json");
        fs::write(source.root.join(&name), b"original malformed note").unwrap();
        let path = temp.path().join("saved.noted-backup");
        source.create_backup(&path).unwrap();
        let reviewed = inspect_backup(&path).unwrap();
        assert!(!reviewed.warnings.is_empty());
        let target = temp.path().join("restored");
        restore_backup(&path, &target, &reviewed.digest).unwrap();
        assert_eq!(
            fs::read(target.join(name)).unwrap(),
            b"original malformed note"
        );
        let incomplete = temp.path().join("incomplete");
        fs::create_dir(&incomplete).unwrap();
        fs::write(incomplete.join(".noted-restore-incomplete"), b"guard").unwrap();
        assert!(Store::open(&incomplete).is_err());
    }
    #[test]
    fn hostile_schema_and_missing_payload_fail_before_publication() {
        let temp = tempfile::tempdir().unwrap();
        let source = fixture(&temp.path().join("source"));
        let path = temp.path().join("saved.noted-backup");
        source.create_backup(&path).unwrap();
        {
            let db = Connection::open(&path).unwrap();
            db.execute_batch("CREATE VIEW injected AS SELECT 1")
                .unwrap();
        }
        assert!(inspect_backup(&path).is_err());
        let path2 = temp.path().join("missing.noted-backup");
        source.create_backup(&path2).unwrap();
        {
            let db = Connection::open(&path2).unwrap();
            db.execute(
                "DELETE FROM files WHERE path=(SELECT min(path) FROM files)",
                [],
            )
            .unwrap();
        }
        assert!(inspect_backup(&path2).is_err());
    }
    #[test]
    fn valid_looking_relationship_corruption_is_detected() {
        let temp = tempfile::tempdir().unwrap();
        let source = fixture(&temp.path().join("source"));
        let path = temp.path().join("relations.noted-backup");
        source.create_backup(&path).unwrap();
        {
            let db = Connection::open(&path).unwrap();
            db.execute("UPDATE pairs SET strength=2", []).unwrap();
        }
        assert!(inspect_backup(&path).is_err());
    }

    #[test]
    fn oversized_sqlite_rows_are_rejected_by_the_reader_limit() {
        let temp = tempfile::tempdir().unwrap();
        let source = fixture(&temp.path().join("source"));
        let path = temp.path().join("oversized.noted-backup");
        source.create_backup(&path).unwrap();
        {
            let db = Connection::open(&path).unwrap();
            db.execute("UPDATE pairs SET a=lower(hex(zeroblob(20*1024*1024)))", [])
                .unwrap();
        }
        assert!(inspect_backup(&path).is_err());
    }
}
