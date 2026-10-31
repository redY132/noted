use crate::store::{Note, NoteSummary, Store};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap, HashSet};
type Result<T> = std::result::Result<T, String>;
fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}
fn relevance_terms(text: &str) -> std::collections::BTreeSet<String> {
    text.to_lowercase()
        .split(|c: char| !c.is_alphanumeric())
        .filter(|s| s.chars().count() >= 3 && s.chars().any(char::is_alphabetic))
        .filter(|s| {
            !matches!(
                *s,
                "the"
                    | "and"
                    | "for"
                    | "with"
                    | "this"
                    | "that"
                    | "from"
                    | "have"
                    | "has"
                    | "was"
                    | "were"
                    | "are"
                    | "not"
                    | "but"
                    | "you"
                    | "your"
                    | "our"
                    | "their"
                    | "can"
                    | "will"
                    | "would"
                    | "should"
                    | "into"
                    | "about"
                    | "when"
                    | "what"
                    | "which"
                    | "than"
                    | "then"
                    | "also"
                    | "one"
                    | "two"
                    | "its"
            )
        })
        .map(str::to_owned)
        .collect()
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PairState {
    pub a: String,
    pub b: String,
    pub connected: bool,
    pub dismissed: bool,
    pub revision: u64,
    #[serde(default = "default_strength")]
    pub strength: u8,
}
fn default_strength() -> u8 {
    3
}
#[derive(Serialize)]
pub struct PairMutation {
    pub state: PairState,
    pub previous: PairState,
    pub changed: bool,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Page<T> {
    pub items: Vec<T>,
    pub next_cursor: Option<usize>,
    pub total: usize,
}
impl<T> Page<T> {
    fn from(mut items: Vec<T>, offset: usize, limit: usize, total: usize) -> Self {
        items.truncate(limit);
        Self {
            next_cursor: if offset + items.len() < total {
                Some(offset + items.len())
            } else {
                None
            },
            items,
            total,
        }
    }
}
#[derive(Serialize)]
pub struct PickerEntry {
    pub note: NoteSummary,
    pub connected: bool,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionSearchPage {
    pub items: Vec<PickerEntry>,
    pub next_cursor: Option<usize>,
    pub total: usize,
    pub semantic_pending: bool,
    pub semantic_available: bool,
    pub generation: u64,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionEntry {
    pub note_id: String,
    pub note: Option<NoteSummary>,
    pub state: PairState,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReferenceEntry {
    pub note_id: String,
    pub note: Option<NoteSummary>,
    pub outgoing: usize,
    pub incoming: usize,
}
#[derive(Serialize)]
pub struct RelatedEntry {
    pub note: NoteSummary,
    pub reasons: Vec<String>,
    pub score: f64,
}
pub fn init(db: &Connection) -> Result<()> {
    db.execute_batch("CREATE VIRTUAL TABLE IF NOT EXISTS note_vocab USING fts5vocab(note_search, 'row'); CREATE TABLE IF NOT EXISTS note_refs(source TEXT NOT NULL,target TEXT NOT NULL,occurrences INTEGER NOT NULL,PRIMARY KEY(source,target)); CREATE INDEX IF NOT EXISTS refs_target ON note_refs(target); CREATE TABLE IF NOT EXISTS note_tags(note_id TEXT NOT NULL,tag TEXT NOT NULL,PRIMARY KEY(note_id,tag)); CREATE INDEX IF NOT EXISTS tags_tag ON note_tags(tag); CREATE VIRTUAL TABLE IF NOT EXISTS picker_search USING fts5(id UNINDEXED,title,tags,folder,tokenize='unicode61'); CREATE INDEX IF NOT EXISTS notes_folder ON notes(json_extract(summary,'$.folderId')); CREATE INDEX IF NOT EXISTS notes_updated ON notes(json_extract(summary,'$.updatedAt') DESC,id); CREATE TABLE IF NOT EXISTS note_files(id TEXT PRIMARY KEY,signature TEXT NOT NULL);").map_err(err)
}
pub fn open(root: &std::path::Path) -> Result<Connection> {
    let path = root.join("relations.sqlite3");
    if let Ok(m) = std::fs::symlink_metadata(&path) {
        if !m.is_file() || m.file_type().is_symlink() {
            return Err("Relations database must be an ordinary file".into());
        }
    }
    let mut db = Connection::open(path).map_err(err)?;
    db.busy_timeout(std::time::Duration::from_secs(5))
        .map_err(err)?;
    db.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS pairs(a TEXT NOT NULL,b TEXT NOT NULL,connected INTEGER NOT NULL DEFAULT 0,dismissed INTEGER NOT NULL DEFAULT 0,revision INTEGER NOT NULL,strength INTEGER NOT NULL DEFAULT 3 CHECK(strength BETWEEN 1 AND 5),PRIMARY KEY(a,b),CHECK(a<b)); CREATE INDEX IF NOT EXISTS pairs_b ON pairs(b);").map_err(err)?;
    let has_strength = {
        let mut stmt = db.prepare("PRAGMA table_info(pairs)").map_err(err)?;
        let columns = stmt.query_map([], |r| r.get::<_, String>(1)).map_err(err)?;
        columns
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(err)?
            .iter()
            .any(|c| c == "strength")
    };
    if !has_strength {
        // SQLite produces a consistent snapshot including committed WAL pages.
        // Never mutate the authoritative database unless that snapshot succeeds.
        let backup = root.join(format!(
            "relations.pre-strength-v1-{}.sqlite3",
            uuid::Uuid::new_v4()
        ));
        db.execute("VACUUM INTO ?1", [backup.to_string_lossy().as_ref()])
            .map_err(err)?;
        let tx = db.transaction().map_err(err)?;
        tx.execute_batch("ALTER TABLE pairs ADD COLUMN strength INTEGER NOT NULL DEFAULT 3 CHECK(strength BETWEEN 1 AND 5); PRAGMA user_version=2;").map_err(err)?;
        tx.commit().map_err(err)?;
    }
    Ok(db)
}
pub fn index(db: &Connection, note: &Note) -> Result<()> {
    let mut refs = BTreeMap::<String, usize>::new();
    fn add(href: Option<&str>, refs: &mut BTreeMap<String, usize>) {
        if let Some(id) = href.and_then(|h| h.strip_prefix("noted://note/")) {
            if crate::store::valid_id(id).is_ok() {
                *refs.entry(id.into()).or_default() += 1;
            }
        }
    }
    fn visit(n: &serde_json::Value, refs: &mut BTreeMap<String, usize>) {
        add(
            n.get("attrs")
                .and_then(|a| a.get("href"))
                .and_then(|v| v.as_str()),
            refs,
        );
        if let Some(marks) = n.get("marks").and_then(|v| v.as_array()) {
            for m in marks {
                if m.get("type").and_then(|v| v.as_str()) == Some("link") {
                    add(
                        m.get("attrs")
                            .and_then(|a| a.get("href"))
                            .and_then(|v| v.as_str()),
                        refs,
                    )
                }
            }
        }
        if let Some(c) = n.get("content").and_then(|v| v.as_array()) {
            for n in c {
                visit(n, refs)
            }
        }
    }
    let rowid: i64 = db
        .query_row("SELECT rowid FROM notes WHERE id=?1", [&note.id], |r| {
            r.get(0)
        })
        .map_err(err)?;
    let folder: String = note
        .folder_id
        .as_ref()
        .and_then(|id| {
            db.query_row("SELECT name FROM folder_search WHERE id=?1", [id], |r| {
                r.get(0)
            })
            .ok()
        })
        .unwrap_or_default();
    db.execute("DELETE FROM picker_search WHERE rowid=?1", [rowid])
        .map_err(err)?;
    db.execute(
        "INSERT INTO picker_search(rowid,id,title,tags,folder) VALUES(?1,?2,?3,?4,?5)",
        params![rowid, note.id, note.title, note.tags.join(" "), folder],
    )
    .map_err(err)?;
    visit(&note.content, &mut refs);
    db.execute("DELETE FROM note_refs WHERE source=?1", [&note.id])
        .map_err(err)?;
    for (target, count) in refs {
        db.execute(
            "INSERT INTO note_refs(source,target,occurrences) VALUES(?1,?2,?3)",
            params![note.id, target, count as i64],
        )
        .map_err(err)?;
    }
    db.execute("DELETE FROM note_tags WHERE note_id=?1", [&note.id])
        .map_err(err)?;
    for tag in &note.tags {
        db.execute(
            "INSERT OR IGNORE INTO note_tags(note_id,tag) VALUES(?1,?2)",
            params![note.id, tag.trim().to_lowercase()],
        )
        .map_err(err)?;
    }
    Ok(())
}
impl Store {
    pub fn export_relations(&self) -> Result<serde_json::Value> {
        let mut stmt = self
            .relations
            .prepare("SELECT a,b,connected,dismissed,revision,strength FROM pairs ORDER BY a,b")
            .map_err(err)?;
        let pairs = stmt
            .query_map([], |r| {
                Ok(PairState {
                    a: r.get(0)?,
                    b: r.get(1)?,
                    connected: r.get(2)?,
                    dismissed: r.get(3)?,
                    revision: r.get::<_, i64>(4)? as u64,
                    strength: r.get(5)?,
                })
            })
            .map_err(err)?
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(err)?;
        Ok(serde_json::json!({"formatVersion":2,"pairs":pairs}))
    }

    fn require_note(&self, id: &str) -> Result<()> {
        crate::store::valid_id(id)?;
        if !self.note_exists(id) {
            return Err("This note is missing".into());
        }
        Ok(())
    }
    pub fn note_exists(&self, id: &str) -> bool {
        crate::store::valid_id(id).is_ok()
            && std::fs::symlink_metadata(self.root.join("notes").join(format!("{id}.json")))
                .is_ok_and(|m| m.is_file() && !m.file_type().is_symlink())
    }
    pub fn pair(&self, a: &str, b: &str) -> Result<PairState> {
        crate::store::valid_id(a)?;
        crate::store::valid_id(b)?;
        if a == b {
            return Err("A note cannot connect to itself".into());
        }
        let (a, b) = if a < b { (a, b) } else { (b, a) };
        Ok(self
            .relations
            .query_row(
                "SELECT connected,dismissed,revision,strength FROM pairs WHERE a=?1 AND b=?2",
                params![a, b],
                |r| {
                    Ok(PairState {
                        a: a.into(),
                        b: b.into(),
                        connected: r.get(0)?,
                        dismissed: r.get(1)?,
                        revision: r.get::<_, i64>(2)? as u64,
                        strength: r.get(3)?,
                    })
                },
            )
            .optional()
            .map_err(err)?
            .unwrap_or(PairState {
                a: a.into(),
                b: b.into(),
                connected: false,
                dismissed: false,
                revision: 0,
                strength: 3,
            }))
    }
    pub fn set_relation(
        &mut self,
        a: &str,
        b: &str,
        connected: Option<bool>,
        dismissed: Option<bool>,
        expected_revision: Option<u64>,
    ) -> Result<PairMutation> {
        self.set_relation_strength(a, b, connected, dismissed, expected_revision, None)
    }
    pub fn set_relation_strength(
        &mut self,
        a: &str,
        b: &str,
        connected: Option<bool>,
        dismissed: Option<bool>,
        expected_revision: Option<u64>,
        strength: Option<u8>,
    ) -> Result<PairMutation> {
        if strength.is_some_and(|v| !(1..=5).contains(&v)) {
            return Err("Connection strength must be between 1 and 5".into());
        }
        let previous = self.pair(a, b)?;
        if expected_revision.is_some_and(|r| r != previous.revision) {
            return Err("Connection changed since this action; Undo was not applied".into());
        }
        if connected == Some(true) || dismissed == Some(true) || strength.is_some() {
            self.require_note(a)?;
            self.require_note(b)?;
        }
        let mut state = previous.clone();
        if let Some(v) = connected {
            state.connected = v;
        }
        if let Some(v) = dismissed {
            state.dismissed = v;
        }
        if state.connected {
            state.dismissed = false;
        }
        if let Some(v) = strength {
            // A complete revision-guarded restore may also undo a connection.
            if v != previous.strength
                && !state.connected
                && !(previous.connected && expected_revision.is_some() && connected.is_some())
            {
                return Err("Only confirmed connections have editable strength".into());
            }
            state.strength = v;
        }
        let changed = state.connected != previous.connected
            || state.dismissed != previous.dismissed
            || state.strength != previous.strength;
        if changed {
            state.revision += 1;
            self.relations.execute("INSERT INTO pairs(a,b,connected,dismissed,revision,strength) VALUES(?1,?2,?3,?4,?5,?6) ON CONFLICT(a,b) DO UPDATE SET connected=excluded.connected,dismissed=excluded.dismissed,revision=excluded.revision,strength=excluded.strength",params![state.a,state.b,state.connected,state.dismissed,state.revision as i64,state.strength]).map_err(err)?;
        }
        Ok(PairMutation {
            state,
            previous,
            changed,
        })
    }
    fn summary_for(&self, id: &str) -> Result<Option<NoteSummary>> {
        if !self.note_exists(id) {
            return Ok(None);
        }
        let raw: Option<String> = self
            .db
            .query_row("SELECT summary FROM notes WHERE id=?1", [id], |r| r.get(0))
            .optional()
            .map_err(err)?;
        raw.map(|s| serde_json::from_str(&s).map_err(err))
            .transpose()
    }
    pub fn list_connections(
        &self,
        note_id: &str,
        cursor: usize,
        limit: usize,
    ) -> Result<Page<ConnectionEntry>> {
        crate::store::valid_id(note_id)?;
        let limit = limit.clamp(1, 100);
        let total: usize = self
            .relations
            .query_row(
                "SELECT count(*) FROM pairs WHERE connected=1 AND (a=?1 OR b=?1)",
                [note_id],
                |r| r.get::<_, i64>(0).map(|n| n as usize),
            )
            .map_err(err)?;
        let mut stmt=self.relations.prepare("SELECT a,b,connected,dismissed,revision,strength FROM pairs WHERE connected=1 AND (a=?1 OR b=?1) ORDER BY strength DESC,a,b LIMIT ?2 OFFSET ?3").map_err(err)?;
        let states = stmt
            .query_map(params![note_id, limit as i64, cursor as i64], |r| {
                Ok(PairState {
                    a: r.get(0)?,
                    b: r.get(1)?,
                    connected: r.get(2)?,
                    dismissed: r.get(3)?,
                    revision: r.get::<_, i64>(4)? as u64,
                    strength: r.get(5)?,
                })
            })
            .map_err(err)?
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(err)?;
        let mut items = Vec::new();
        for state in states {
            let id = if state.a == note_id {
                &state.b
            } else {
                &state.a
            };
            items.push(ConnectionEntry {
                note_id: id.clone(),
                note: self.summary_for(id)?,
                state,
            });
        }
        Ok(Page::from(items, cursor, limit, total))
    }
    pub fn restore_dismissed(&mut self, note_id: &str) -> Result<usize> {
        crate::store::valid_id(note_id)?;
        self.relations.execute("UPDATE pairs SET dismissed=0,revision=revision+1 WHERE dismissed=1 AND (a=?1 OR b=?1)",[note_id]).map_err(err)
    }
    /// The graph is deliberately bounded independently of a note's degree.
    pub fn connection_edges(&self, note_ids: Vec<String>) -> Result<Vec<PairState>> {
        self.connection_edges_for(note_ids, None)
    }
    pub fn connection_edges_for(
        &self,
        note_ids: Vec<String>,
        source_id: Option<&str>,
    ) -> Result<Vec<PairState>> {
        if note_ids.len() > 60 {
            return Err("The graph supports at most 60 notes".into());
        }
        let mut ids = HashSet::new();
        for id in note_ids {
            crate::store::valid_id(&id)?;
            if self.note_exists(&id) {
                ids.insert(id);
            }
        }
        if let Some(source) = source_id {
            crate::store::valid_id(source)?;
            if !ids.contains(source) {
                return Err("Graph source must be a visible existing note".into());
            }
        }
        let ids = serde_json::to_string(&ids).map_err(err)?;
        let mut stmt = self.relations.prepare("SELECT a,b,connected,dismissed,revision,strength FROM pairs WHERE connected=1 AND a IN (SELECT value FROM json_each(?1)) AND b IN (SELECT value FROM json_each(?1)) ORDER BY CASE WHEN a=?2 OR b=?2 THEN 0 ELSE 1 END,strength DESC,a,b LIMIT 180").map_err(err)?;
        let rows = stmt
            .query_map(params![ids, source_id.unwrap_or("")], |r| {
                Ok(PairState {
                    a: r.get(0)?,
                    b: r.get(1)?,
                    connected: r.get(2)?,
                    dismissed: r.get(3)?,
                    revision: r.get::<_, i64>(4)? as u64,
                    strength: r.get(5)?,
                })
            })
            .map_err(err)?;
        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(err)
    }

    /// Both result streams are constrained before fusion. SQL handles ranking and
    /// pagination; only page summaries and bounded semantic IDs cross into Rust.
    pub fn search_connections(
        &self,
        source_id: &str,
        query: &str,
        connected_only: bool,
        cursor: usize,
        limit: usize,
        semantic: Vec<(String, f64)>,
    ) -> Result<Page<PickerEntry>> {
        self.require_note(source_id)?;
        if query.len() > 2048 {
            return Err("Search query is too long".into());
        }
        let q = query.trim().to_lowercase();
        let terms = q
            .split_whitespace()
            .take(20)
            .map(|s| format!("\"{}\"*", s.replace('"', "\"\"")))
            .collect::<Vec<_>>()
            .join(" AND ");
        // A high-degree root stays in indexed SQL, never an unbounded ID vector.
        let semantic: Vec<_> = semantic
            .into_iter()
            .filter(|(id, score)| {
                id != source_id
                    && crate::store::valid_id(id).is_ok()
                    && score.is_finite()
                    && *score >= 0.60
            })
            .take(120)
            .map(|(id, _)| id)
            .collect();
        let semantic = serde_json::to_string(&semantic).map_err(err)?;
        let condition = "n.id<>?1 AND (?2=0 OR n.id IN (SELECT b FROM authored_relations.pairs WHERE a=?1 AND connected=1 UNION ALL SELECT a FROM authored_relations.pairs WHERE b=?1 AND connected=1))";
        let text_condition = if q.is_empty() {
            "1=1"
        } else {
            "n.rowid IN (SELECT rowid FROM picker_search WHERE picker_search MATCH ?3 UNION SELECT rowid FROM note_search WHERE note_search MATCH ?3)"
        };
        let title_terms = if terms.is_empty() {
            "title : __empty__".into()
        } else {
            format!("title : ({terms})")
        };
        let ctes = format!("WITH text_matches AS (SELECT n.id,row_number() OVER (ORDER BY CASE WHEN lower(json_extract(n.summary,'$.title'))=?4 THEN 0 WHEN n.rowid IN (SELECT rowid FROM picker_search WHERE picker_search MATCH ?5) THEN 1 ELSE 2 END,json_extract(n.summary,'$.updatedAt') DESC,n.id) AS rank FROM notes n WHERE {condition} AND {text_condition}), semantic_matches AS (SELECT value AS id,min(CAST(key AS INTEGER)+1) AS rank FROM json_each(?6) GROUP BY value), candidates AS (SELECT id FROM text_matches UNION SELECT s.id FROM semantic_matches s JOIN notes n ON n.id=s.id WHERE {condition})");
        let count_ctes = format!("WITH candidates AS (SELECT n.id FROM notes n WHERE {condition} AND {text_condition} UNION SELECT n.id FROM json_each(?4) s JOIN notes n ON n.id=s.value WHERE {condition})");
        let total = self
            .db
            .query_row(
                &format!("{count_ctes} SELECT count(*) FROM candidates"),
                params![source_id, connected_only, terms, semantic],
                |r| r.get::<_, i64>(0),
            )
            .map_err(err)? as usize;
        let limit = limit.clamp(1, 100);
        let mut stmt = self.db.prepare(&format!("{ctes} SELECT n.summary FROM candidates c JOIN notes n ON n.id=c.id LEFT JOIN text_matches t ON t.id=c.id LEFT JOIN semantic_matches s ON s.id=c.id ORDER BY CASE WHEN lower(json_extract(n.summary,'$.title'))=?4 THEN 0 ELSE 1 END,(COALESCE(1.0/(60+t.rank),0)+COALESCE(1.0/(60+s.rank),0)) DESC,json_extract(n.summary,'$.updatedAt') DESC,n.id LIMIT ?7 OFFSET ?8")).map_err(err)?;
        let notes = stmt
            .query_map(
                params![
                    source_id,
                    connected_only,
                    terms,
                    q,
                    title_terms,
                    semantic,
                    limit as i64,
                    cursor as i64
                ],
                |r| r.get::<_, String>(0),
            )
            .map_err(err)?
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(err)?;
        let mut items = Vec::new();
        for raw in notes {
            let note: NoteSummary = serde_json::from_str(&raw).map_err(err)?;
            if self.note_exists(&note.id) {
                items.push(PickerEntry {
                    connected: self.pair(source_id, &note.id)?.connected,
                    note,
                });
            }
        }
        Ok(Page::from(items, cursor, limit, total))
    }
    pub fn list_references(
        &self,
        note_id: &str,
        cursor: usize,
        limit: usize,
    ) -> Result<Page<ReferenceEntry>> {
        crate::store::valid_id(note_id)?;
        let limit = limit.clamp(1, 100);
        let grouped="SELECT other,sum(outgoing) AS outgoing,sum(incoming) AS incoming FROM (SELECT target AS other,occurrences AS outgoing,0 AS incoming FROM note_refs WHERE source=?1 UNION ALL SELECT source,0,occurrences FROM note_refs WHERE target=?1) WHERE other<>?1 GROUP BY other";
        let total: usize = self
            .db
            .query_row(
                &format!("SELECT count(*) FROM ({grouped})"),
                [note_id],
                |r| r.get::<_, i64>(0).map(|n| n as usize),
            )
            .map_err(err)?;
        let mut stmt = self
            .db
            .prepare(&format!("{grouped} ORDER BY other LIMIT ?2 OFFSET ?3"))
            .map_err(err)?;
        let rows = stmt
            .query_map(params![note_id, limit as i64, cursor as i64], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, i64>(1)? as usize,
                    r.get::<_, i64>(2)? as usize,
                ))
            })
            .map_err(err)?
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(err)?;
        let mut items = Vec::new();
        for (id, outgoing, incoming) in rows {
            items.push(ReferenceEntry {
                note: self.summary_for(&id)?,
                note_id: id,
                outgoing,
                incoming,
            });
        }
        Ok(Page::from(items, cursor, limit, total))
    }
    pub fn list_notes_page(
        &self,
        query: &str,
        folder_id: Option<&str>,
        cursor: usize,
        limit: usize,
    ) -> Result<Page<NoteSummary>> {
        self.query_notes(query, folder_id, None, cursor, limit)
    }
    fn query_notes(
        &self,
        query: &str,
        folder_id: Option<&str>,
        exclude: Option<&str>,
        cursor: usize,
        limit: usize,
    ) -> Result<Page<NoteSummary>> {
        if query.len() > 2048 {
            return Err("Search query is too long".into());
        }
        let limit = limit.clamp(1, 100);
        let q = query.trim().to_lowercase();
        let terms = q
            .split_whitespace()
            .take(20)
            .map(|s| format!("\"{}\"*", s.replace('"', "\"\"")))
            .collect::<Vec<_>>()
            .join(" AND ");
        let search = if q.is_empty() {
            "1=1"
        } else if exclude.is_some() {
            "rowid IN (SELECT rowid FROM picker_search WHERE picker_search MATCH ?1)"
        } else {
            "rowid IN (SELECT rowid FROM picker_search WHERE picker_search MATCH ?1 UNION SELECT rowid FROM note_search WHERE note_search MATCH ?1)"
        };
        let condition=format!("{search} AND (?2 IS NULL OR COALESCE(json_extract(summary,'$.folderId'),'')=?2) AND (?3 IS NULL OR id<>?3)");
        let total: usize = self
            .db
            .query_row(
                &format!("SELECT count(*) FROM notes WHERE {condition}"),
                params![terms, folder_id, exclude],
                |r| r.get::<_, i64>(0).map(|n| n as usize),
            )
            .map_err(err)?;
        let mut stmt=self.db.prepare(&format!("SELECT summary FROM notes WHERE {condition} ORDER BY CASE WHEN ?4='' THEN 0 WHEN lower(json_extract(summary,'$.title'))=?4 THEN 0 WHEN rowid IN (SELECT rowid FROM picker_search WHERE picker_search MATCH ?7) THEN 1 ELSE 2 END,json_extract(summary,'$.updatedAt') DESC,id LIMIT ?5 OFFSET ?6")).map_err(err)?;
        let items = stmt
            .query_map(
                params![
                    terms,
                    folder_id,
                    exclude,
                    q,
                    limit as i64,
                    cursor as i64,
                    if terms.is_empty() {
                        "title : __empty__".into()
                    } else {
                        format!("title : ({terms})")
                    }
                ],
                |r| r.get::<_, String>(0),
            )
            .map_err(err)?
            .map(|r| serde_json::from_str(&r.map_err(err)?).map_err(err))
            .collect::<Result<Vec<_>>>()?;
        Ok(Page::from(items, cursor, limit, total))
    }
    pub fn picker_notes(
        &self,
        source_id: &str,
        query: &str,
        cursor: usize,
        limit: usize,
    ) -> Result<Page<PickerEntry>> {
        self.require_note(source_id)?;
        let page = self.query_notes(query, None, Some(source_id), cursor, limit)?;
        let mut items = Vec::new();
        for note in page.items {
            items.push(PickerEntry {
                connected: self.pair(source_id, &note.id)?.connected,
                note,
            });
        }
        Ok(Page {
            items,
            next_cursor: page.next_cursor,
            total: page.total,
        })
    }
    pub fn filter_related(
        &self,
        source_id: &str,
        items: Vec<RelatedEntry>,
    ) -> Result<Vec<RelatedEntry>> {
        self.require_note(source_id)?;
        let mut seen = HashSet::new();
        let mut output = Vec::new();
        for item in items {
            if item.note.id == source_id
                || !seen.insert(item.note.id.clone())
                || !self.note_exists(&item.note.id)
            {
                continue;
            }
            let pair = self.pair(source_id, &item.note.id)?;
            if !pair.connected && !pair.dismissed {
                output.push(item)
            }
        }
        Ok(output)
    }
    pub fn related_with_semantic(
        &self,
        note_id: &str,
        semantic: Vec<(String, f64)>,
        cursor: usize,
        limit: usize,
    ) -> Result<Page<RelatedEntry>> {
        let mut items = self.related_notes_base(note_id, 0, 100, false)?.items;
        #[cfg(feature = "semantic")]
        let semantic_floor = crate::semantic::MIN_SEMANTIC_SIMILARITY as f64;
        #[cfg(not(feature = "semantic"))]
        let semantic_floor = 0.60;
        // Rank fusion orders qualifying evidence; it must not turn an arbitrary
        // nearest neighbor into an accepted relationship.
        for (rank, (id, _similarity)) in semantic
            .into_iter()
            .filter(|(_, similarity)| similarity.is_finite() && *similarity >= semantic_floor)
            .take(120)
            .enumerate()
        {
            let score = 1.0 / (60.0 + rank as f64);
            if let Some(item) = items.iter_mut().find(|i| i.note.id == id) {
                item.score += score;
                item.reasons.push("Similar meaning".into());
            } else if let Some(note) = self.summary_for(&id)? {
                items.push(RelatedEntry {
                    note,
                    reasons: vec!["Similar meaning".into()],
                    score,
                })
            }
        }
        let mut items = self.filter_related(note_id, items)?;
        self.rerank_connections(note_id, &mut items)?;
        items.sort_by(|a, b| b.score.total_cmp(&a.score).then(a.note.id.cmp(&b.note.id)));
        let total = items.len();
        let limit = limit.clamp(1, 100);
        Ok(Page::from(
            items.into_iter().skip(cursor).take(limit).collect(),
            cursor,
            limit,
            total,
        ))
    }
    pub fn related_notes(
        &self,
        note_id: &str,
        cursor: usize,
        limit: usize,
    ) -> Result<Page<RelatedEntry>> {
        self.related_notes_base(note_id, cursor, limit, true)
    }
    fn rerank_connections(&self, note_id: &str, entries: &mut [RelatedEntry]) -> Result<()> {
        if entries.is_empty() {
            return Ok(());
        }
        let candidates =
            serde_json::to_string(&entries.iter().map(|e| &e.note.id).collect::<Vec<_>>())
                .map_err(err)?;
        let mut source = self.relations.prepare("SELECT CASE WHEN a=?1 THEN b ELSE a END,strength FROM pairs WHERE connected=1 AND (a=?1 OR b=?1) ORDER BY strength DESC,a,b LIMIT 32").map_err(err)?;
        let neighbors = source
            .query_map([note_id], |r| {
                Ok((r.get::<_, String>(0)?, r.get::<_, u8>(1)?))
            })
            .map_err(err)?
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(err)?;
        let mut evidence = HashMap::<String, f64>::new();
        let mut links = self.relations.prepare("SELECT CASE WHEN a=?1 THEN b ELSE a END,strength FROM pairs WHERE connected=1 AND (a=?1 OR b=?1) AND (CASE WHEN a=?1 THEN b ELSE a END) IN (SELECT value FROM json_each(?2))").map_err(err)?;
        for (neighbor, strength) in neighbors {
            if strength <= 1 || !self.note_exists(&neighbor) {
                continue;
            }
            for row in links
                .query_map(params![neighbor, candidates], |r| {
                    Ok((r.get::<_, String>(0)?, r.get::<_, u8>(1)?))
                })
                .map_err(err)?
            {
                let (candidate, other_strength) = row.map_err(err)?;
                *evidence.entry(candidate).or_default() +=
                    (strength - 1) as f64 / 4.0 * (other_strength - 1) as f64 / 4.0;
            }
        }
        for entry in entries {
            let weight = evidence
                .get(&entry.note.id)
                .copied()
                .unwrap_or(0.0)
                .min(1.0);
            entry.score *= 1.0 + 0.2 * weight;
        }
        Ok(())
    }
    fn related_notes_base(
        &self,
        note_id: &str,
        cursor: usize,
        limit: usize,
        rerank: bool,
    ) -> Result<Page<RelatedEntry>> {
        self.require_note(note_id)?;
        let mut candidates = HashMap::<String, (f64, Vec<String>)>::new();
        let total: usize = self
            .db
            .query_row("SELECT count(*) FROM notes", [], |r| {
                r.get::<_, i64>(0).map(|n| n as usize)
            })
            .map_err(err)?;
        let common_limit = ((total as f64 * 0.10).ceil() as usize).max(2);
        let rare_limit = ((total as f64 * 0.01).ceil() as usize).max(2);
        let mut stmt=self.db.prepare("WITH freq AS MATERIALIZED (SELECT tag,count(*) AS n FROM note_tags WHERE tag IN (SELECT tag FROM note_tags WHERE note_id=?1) GROUP BY tag) SELECT t.note_id,sum(1.0/f.n) AS weight FROM note_tags t JOIN freq f ON t.tag=f.tag WHERE t.note_id<>?1 AND f.n<=?2 GROUP BY t.note_id ORDER BY weight DESC,t.note_id LIMIT 120").map_err(err)?;
        let tags = stmt
            .query_map(params![note_id, common_limit as i64], |r| {
                Ok((r.get::<_, String>(0)?, r.get::<_, f64>(1)?))
            })
            .map_err(err)?;
        for (rank, row) in tags.enumerate() {
            let (id, _) = row.map_err(err)?;
            candidates.insert(id, (2.0 / (60.0 + rank as f64), vec!["Shared tags".into()]));
        }
        let text: String=self.db.query_row("SELECT title || ' ' || substr(body,1,8192) FROM note_search WHERE rowid=(SELECT rowid FROM notes WHERE id=?1)",[note_id],|r|r.get(0)).optional().map_err(err)?.unwrap_or_default();
        let mut distinctive = Vec::<(String, usize)>::new();
        let mut vocab = self
            .db
            .prepare("SELECT doc FROM note_vocab WHERE term=?1")
            .map_err(err)?;
        for term in relevance_terms(&text).into_iter().take(256) {
            let frequency: usize = vocab
                .query_row([&term], |r| r.get::<_, i64>(0).map(|n| n as usize))
                .optional()
                .map_err(err)?
                .unwrap_or(0);
            if frequency > 1 && frequency <= common_limit {
                distinctive.push((term, frequency));
            }
        }
        distinctive.sort_by(|a, b| a.1.cmp(&b.1).then(a.0.cmp(&b.0)));
        distinctive.truncate(24);
        let words: Vec<_> = distinctive
            .iter()
            .map(|(term, _)| format!("\"{term}\""))
            .collect();
        if !words.is_empty() {
            let mut stmt=self.db.prepare("SELECT id,title || ' ' || substr(body,1,8192) FROM note_search WHERE note_search MATCH ?1 ORDER BY bm25(note_search) LIMIT 120").map_err(err)?;
            let rows = stmt
                .query_map([words.join(" OR ")], |r| {
                    Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
                })
                .map_err(err)?;
            for (rank, row) in rows.enumerate() {
                let (id, body) = row.map_err(err)?;
                let terms = relevance_terms(&body);
                let shared: Vec<_> = distinctive
                    .iter()
                    .filter(|(term, _)| terms.contains(term))
                    .collect();
                if shared.len() < 2 && !shared.iter().any(|(_, frequency)| *frequency <= rare_limit)
                {
                    continue;
                }
                let entry = candidates.entry(id).or_default();
                entry.0 += 1.0 / (60.0 + rank as f64);
                entry.1.push("Shared wording".into());
            }
        }
        let mut entries = Vec::new();
        for (id, (score, reasons)) in candidates {
            if let Some(note) = self.summary_for(&id)? {
                entries.push(RelatedEntry {
                    note,
                    reasons,
                    score,
                })
            }
        }
        let mut entries = self.filter_related(note_id, entries)?;
        if rerank {
            self.rerank_connections(note_id, &mut entries)?;
        }
        entries.sort_by(|a, b| b.score.total_cmp(&a.score).then(a.note.id.cmp(&b.note.id)));
        let total = entries.len();
        Ok(Page::from(
            entries
                .into_iter()
                .skip(cursor)
                .take(limit.clamp(1, 100))
                .collect(),
            cursor,
            limit.clamp(1, 100),
            total,
        ))
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn graph_reader_is_readonly_and_sees_committed_wal_changes_without_writer_lock() {
        let temp = tempfile::tempdir().unwrap();
        let mut s = Store::open(temp.path()).unwrap();
        let root = s.create_note("Root".into(), None).unwrap();
        let mut target = s.create_note("Before".into(), None).unwrap();
        let reader = s.read_view().unwrap();
        assert_eq!(reader.list_connections(&root.id, 0, 40).unwrap().total, 0);
        s.set_relation_strength(&root.id, &target.id, Some(true), None, None, Some(5))
            .unwrap();
        assert_eq!(
            reader.list_connections(&root.id, 0, 40).unwrap().items[0]
                .state
                .strength,
            5
        );
        target.title = "After".into();
        s.save_note(target, 1).unwrap();
        assert_eq!(
            reader
                .search_connections(&root.id, "After", true, 0, 40, vec![])
                .unwrap()
                .total,
            1
        );
        assert!(reader.db.execute("DELETE FROM notes", []).is_err());
        assert!(reader
            .db
            .execute("DELETE FROM authored_relations.pairs", [])
            .is_err());
        assert!(reader.relations.execute("DELETE FROM pairs", []).is_err());
        assert!(Store::open(temp.path()).is_err());
    }
    #[test]
    fn old_relations_are_backed_up_consistently_before_strength_migration() {
        let temp = tempfile::tempdir().unwrap();
        let legacy = Connection::open(temp.path().join("relations.sqlite3")).unwrap();
        legacy.execute_batch("PRAGMA journal_mode=WAL; CREATE TABLE pairs(a TEXT,b TEXT,connected INTEGER,dismissed INTEGER,revision INTEGER,PRIMARY KEY(a,b)); INSERT INTO pairs(a,b,connected,dismissed,revision) VALUES('a','b',1,0,9),('a','c',0,1,4);").unwrap();
        let upgraded = open(temp.path()).unwrap();
        assert_eq!(
            upgraded
                .query_row(
                    "SELECT strength FROM pairs WHERE a='a' AND b='b'",
                    [],
                    |r| r.get::<_, u8>(0)
                )
                .unwrap(),
            3
        );
        assert_eq!(
            upgraded
                .query_row("SELECT revision FROM pairs WHERE b='b'", [], |r| r
                    .get::<_, i64>(0))
                .unwrap(),
            9
        );
        assert_eq!(
            upgraded
                .query_row("SELECT dismissed FROM pairs WHERE b='c'", [], |r| r
                    .get::<_, bool>(0))
                .unwrap(),
            true
        );
        let backups: Vec<_> = std::fs::read_dir(temp.path())
            .unwrap()
            .filter_map(|e| e.ok())
            .filter(|e| {
                e.file_name()
                    .to_string_lossy()
                    .starts_with("relations.pre-strength-v1-")
            })
            .collect();
        assert_eq!(backups.len(), 1);
        let backup = Connection::open(backups[0].path()).unwrap();
        assert_eq!(
            backup
                .query_row("SELECT sum(revision) FROM pairs", [], |r| r
                    .get::<_, i64>(0))
                .unwrap(),
            13
        );
        assert!(backup.prepare("SELECT strength FROM pairs").is_err());
        drop(upgraded);
        drop(open(temp.path()).unwrap());
        assert_eq!(
            std::fs::read_dir(temp.path())
                .unwrap()
                .filter_map(|e| e.ok())
                .filter(|e| e
                    .file_name()
                    .to_string_lossy()
                    .starts_with("relations.pre-strength-v1-"))
                .count(),
            1
        );
    }
    #[test]
    fn strength_validation_full_undo_and_disposable_index_loss() {
        let temp = tempfile::tempdir().unwrap();
        let mut s = Store::open(temp.path()).unwrap();
        let a = s.create_note("Alpha".into(), None).unwrap();
        let b = s.create_note("Beta".into(), None).unwrap();
        assert_eq!(s.pair(&a.id, &b.id).unwrap().strength, 3);
        let dismissed = s
            .set_relation(&a.id, &b.id, None, Some(true), None)
            .unwrap();
        let restored = s
            .set_relation_strength(
                &a.id,
                &b.id,
                Some(false),
                Some(false),
                Some(dismissed.state.revision),
                Some(3),
            )
            .unwrap();
        assert!(!restored.state.dismissed);
        // Start a fresh pair so the subsequent revision assertions are exact.
        s.relations.execute("DELETE FROM pairs", []).unwrap();
        assert!(s
            .set_relation_strength(&a.id, &b.id, None, None, None, Some(5))
            .is_err());
        for strength in [0, 6, 255] {
            assert!(s
                .set_relation_strength(&a.id, &b.id, Some(true), None, None, Some(strength))
                .is_err());
        }
        assert!(s
            .set_relation_strength("invalid", &b.id, Some(true), None, None, Some(3))
            .is_err());
        assert!(s
            .set_relation_strength(
                &a.id,
                &uuid::Uuid::new_v4().to_string(),
                Some(true),
                None,
                None,
                Some(3)
            )
            .is_err());
        let connected = s
            .set_relation_strength(&a.id, &b.id, Some(true), None, None, Some(5))
            .unwrap();
        assert_eq!(connected.state.revision, 1);
        let changed = s
            .set_relation_strength(&a.id, &b.id, None, None, Some(1), Some(2))
            .unwrap();
        assert_eq!(changed.state.revision, 2);
        assert!(s
            .set_relation_strength(&a.id, &b.id, None, None, Some(1), Some(4))
            .is_err());
        let undone = s
            .set_relation_strength(
                &a.id,
                &b.id,
                Some(changed.previous.connected),
                Some(changed.previous.dismissed),
                Some(changed.state.revision),
                Some(changed.previous.strength),
            )
            .unwrap();
        assert_eq!(undone.state.strength, 5);
        assert_eq!(undone.state.revision, 3);
        assert_eq!(s.export_relations().unwrap()["formatVersion"], 2);
        assert_eq!(s.export_relations().unwrap()["pairs"][0]["strength"], 5);
        let initial_undo = s
            .set_relation_strength(&a.id, &b.id, Some(false), Some(false), Some(3), Some(3))
            .unwrap();
        assert_eq!(initial_undo.state.strength, 3);
        s.set_relation_strength(&a.id, &b.id, Some(true), None, None, Some(4))
            .unwrap();
        drop(s);
        for suffix in ["", "-wal", "-shm"] {
            let p = temp.path().join(format!("index.sqlite3{suffix}"));
            if p.exists() {
                std::fs::remove_file(p).unwrap();
            }
        }
        let s = Store::open(temp.path()).unwrap();
        assert_eq!(s.pair(&a.id, &b.id).unwrap().strength, 4);
        assert!(s.pair(&a.id, &b.id).unwrap().connected);
    }
    #[test]
    fn scoped_search_fuses_text_and_semantic_but_enforces_direct_membership() {
        let temp = tempfile::tempdir().unwrap();
        let mut s = Store::open(temp.path()).unwrap();
        let f = s.create_folder("Ecology".into(), None).unwrap();
        let root = s.create_note("Root".into(), None).unwrap();
        let title = s.create_note("Forest".into(), None).unwrap();
        let mut body = s.create_note("Journal".into(), Some(f.id)).unwrap();
        body.tags = vec!["habitat".into()];
        body.content = json!({"type":"doc","content":[{"type":"paragraph","attrs":{"id":"p"},"content":[{"type":"text","text":"Forest canopy shelters birds"}]}]});
        s.save_note(body.clone(), 1).unwrap();
        let semantic = s.create_note("Wilderness".into(), None).unwrap();
        let outside = s.create_note("Outside".into(), None).unwrap();
        for id in [&title.id, &body.id, &semantic.id] {
            s.set_relation(&root.id, id, Some(true), None, None)
                .unwrap();
        }
        let hits = s
            .search_connections(
                &root.id,
                "Forest",
                true,
                0,
                1,
                vec![(semantic.id.clone(), 0.9), (outside.id.clone(), 0.99)],
            )
            .unwrap();
        assert_eq!(hits.total, 3);
        assert_eq!(hits.next_cursor, Some(1));
        assert_eq!(hits.items[0].note.id, title.id);
        assert!(hits.items[0].connected);
        let all = s
            .search_connections(
                &root.id,
                "Forest",
                true,
                0,
                40,
                vec![(semantic.id.clone(), 0.9), (outside.id.clone(), 0.99)],
            )
            .unwrap();
        assert!(all.items.iter().any(|i| i.note.id == body.id));
        assert!(!all.items.iter().any(|i| i.note.id == outside.id));
        for query in ["Ecology", "habitat", "canopy"] {
            assert_eq!(
                s.search_connections(&root.id, query, true, 0, 40, vec![])
                    .unwrap()
                    .items[0]
                    .note
                    .id,
                body.id
            );
        }
        assert_eq!(
            s.search_connections(
                &root.id,
                "unmatched",
                false,
                0,
                40,
                vec![(outside.id.clone(), 0.9)]
            )
            .unwrap()
            .items[0]
                .note
                .id,
            outside.id
        );
    }
    #[test]
    fn graph_edges_are_confirmed_existing_bounded_and_strongest_first() {
        let temp = tempfile::tempdir().unwrap();
        let mut s = Store::open(temp.path()).unwrap();
        let mut ids = Vec::new();
        for i in 0..22 {
            ids.push(s.create_note(format!("Graph {i}"), None).unwrap().id);
        }
        for a in 0..22 {
            for b in (a + 1)..22 {
                s.set_relation_strength(
                    &ids[a],
                    &ids[b],
                    Some(true),
                    None,
                    None,
                    Some(if a == 0 { 5 } else { 2 }),
                )
                .unwrap();
            }
        }
        let edges = s.connection_edges(ids.clone()).unwrap();
        assert_eq!(edges.len(), 180);
        assert_eq!(edges[0].strength, 5);
        assert_eq!(edges.iter().filter(|e| e.strength == 5).count(), 21);
        assert!(s.connection_edges(vec![ids[0].clone(); 61]).is_err());
        std::fs::remove_file(temp.path().join("notes").join(format!("{}.json", ids[0]))).unwrap();
        assert!(s
            .connection_edges(ids.clone())
            .unwrap()
            .iter()
            .all(|e| e.a != ids[0] && e.b != ids[0]));
        s.set_relation(&ids[1], &ids[2], Some(false), Some(true), None)
            .unwrap();
        assert!(s
            .connection_edges(vec![ids[1].clone(), ids[2].clone()])
            .unwrap()
            .is_empty());
    }
    #[test]
    fn weighted_graph_only_reranks_eligible_candidates_once_after_fusion() {
        let temp = tempfile::tempdir().unwrap();
        let mut s = Store::open(temp.path()).unwrap();
        let root = s.create_note("Root".into(), None).unwrap();
        let neighbor = s.create_note("Bridge".into(), None).unwrap();
        let eligible = s.create_note("Eligible".into(), None).unwrap();
        let unrelated = s.create_note("Unrelated".into(), None).unwrap();
        for (a, b) in [
            (&root.id, &neighbor.id),
            (&neighbor.id, &eligible.id),
            (&neighbor.id, &unrelated.id),
        ] {
            s.set_relation_strength(a, b, Some(true), None, None, Some(5))
                .unwrap();
        }
        assert!(s.related_notes(&root.id, 0, 100).unwrap().items.is_empty());
        let result = s
            .related_with_semantic(&root.id, vec![(eligible.id.clone(), 0.9)], 0, 100)
            .unwrap();
        assert_eq!(result.total, 1);
        assert_eq!(result.items[0].note.id, eligible.id);
        assert!((result.items[0].score - 1.2 / 60.0).abs() < 1e-10);
        s.set_relation_strength(&root.id, &neighbor.id, None, None, None, Some(1))
            .unwrap();
        let result = s
            .related_with_semantic(&root.id, vec![(eligible.id.clone(), 0.9)], 0, 100)
            .unwrap();
        assert!((result.items[0].score - 1.0 / 60.0).abs() < 1e-10);
    }
    #[test]
    fn generic_words_and_collection_tags_do_not_connect_unrelated_notes() {
        let temp = tempfile::tempdir().unwrap();
        let mut s = Store::open(temp.path()).unwrap();
        let mut ids = vec![];
        for i in 0..50 {
            let mut note = s
                .create_note(format!("Observation {} first attempt", i), None)
                .unwrap();
            note.tags = vec!["semantic-sample".into()];
            let subject = if i < 2 {
                "Sourdough starter fermentation flour bread dough yeast."
            } else {
                "Astronomy telescope galaxy planet nebula orbit."
            };
            note.content = json!({"type":"doc","content":[{"type":"paragraph","attrs":{"id":"p"},"content":[{"type":"text","text":format!("{subject} Compare the immediate result with what happened a week later. Record one observation and change one variable next time.")}]}]});
            ids.push(s.save_note(note, 1).unwrap().id);
        }
        let suggestions = s.related_notes(&ids[0], 0, 100).unwrap();
        assert_eq!(suggestions.total, 1);
        assert_eq!(suggestions.items[0].note.id, ids[1]);
        let fused = s
            .related_with_semantic(
                &ids[0],
                vec![(ids[2].clone(), 0.4), (ids[3].clone(), f64::NAN)],
                0,
                100,
            )
            .unwrap();
        assert_eq!(fused.total, 1);
        assert_eq!(fused.items[0].note.id, ids[1]);
    }
    #[test]
    fn mutual_connections_undo_dismissals_and_rebuild_are_independent_of_notes() {
        let temp = tempfile::tempdir().unwrap();
        let mut s = Store::open(temp.path()).unwrap();
        let a = s.create_note("Alpha".into(), None).unwrap();
        let b = s.create_note("Beta".into(), None).unwrap();
        let changed = s
            .set_relation(&a.id, &b.id, Some(true), None, None)
            .unwrap();
        assert!(changed.changed);
        assert_eq!(s.pair(&b.id, &a.id).unwrap().revision, 1);
        assert!(
            !s.set_relation(&b.id, &a.id, Some(true), None, None)
                .unwrap()
                .changed
        );
        assert_eq!(s.load_note(&a.id).unwrap().revision, a.revision);
        assert_eq!(s.load_note(&b.id).unwrap().revision, b.revision);
        assert!(s
            .set_relation(&a.id, &a.id, Some(true), None, None)
            .is_err());
        assert!(s
            .set_relation(&a.id, &b.id, Some(false), None, Some(0))
            .is_err());
        s.set_relation(&a.id, &b.id, Some(false), Some(true), Some(1))
            .unwrap();
        assert!(s.pair(&a.id, &b.id).unwrap().dismissed);
        s.rebuild_index().unwrap();
        assert!(s.pair(&a.id, &b.id).unwrap().dismissed);
        s.set_relation(&a.id, &b.id, Some(true), None, None)
            .unwrap();
        assert!(!s.pair(&a.id, &b.id).unwrap().dismissed);
        let path = temp.path().join("notes").join(format!("{}.json", b.id));
        let bytes = std::fs::read(&path).unwrap();
        std::fs::remove_file(&path).unwrap();
        assert!(s.list_connections(&a.id, 0, 40).unwrap().items[0]
            .note
            .is_none());
        std::fs::write(path, bytes).unwrap();
        assert!(s.list_connections(&a.id, 0, 40).unwrap().items[0]
            .note
            .is_some());
        drop(s);
        let s = Store::open(temp.path()).unwrap();
        assert!(s.pair(&a.id, &b.id).unwrap().connected);
    }
    #[test]
    fn references_keep_occurrences_and_picker_searches_metadata_with_pagination() {
        let temp = tempfile::tempdir().unwrap();
        let mut s = Store::open(temp.path()).unwrap();
        let f = s.create_folder("Biology".into(), None).unwrap();
        let mut a = s.create_note("Alpha".into(), None).unwrap();
        let b = s.create_note("Beta".into(), Some(f.id)).unwrap();
        let c = s.create_note("Beta extra".into(), None).unwrap();
        a.tags = vec!["science".into()];
        a.content = json!({"type":"doc","content":[{"type":"paragraph","attrs":{"id":"p"},"content":[{"type":"text","text":"one","marks":[{"type":"link","attrs":{"href":format!("noted://note/{}",b.id)}}]},{"type":"text","text":"two","marks":[{"type":"link","attrs":{"href":format!("noted://note/{}",b.id)}}]}]}]});
        a = s.save_note(a, 1).unwrap();
        assert_eq!(
            s.list_references(&b.id, 0, 40).unwrap().items[0].incoming,
            2
        );
        let p = s.picker_notes(&a.id, "Beta", 0, 1).unwrap();
        assert_eq!(p.total, 2);
        assert_eq!(p.next_cursor, Some(1));
        assert_eq!(s.picker_notes(&a.id, "Beta", 1, 1).unwrap().items.len(), 1);
        assert_eq!(
            s.picker_notes(&a.id, "Biology", 0, 40).unwrap().items[0]
                .note
                .id,
            b.id
        );
        let _ = c;
        a.content = json!({"type":"doc","content":[{"type":"paragraph","attrs":{"id":"p"}}]});
        s.save_note(a, 2).unwrap();
        assert_eq!(s.list_references(&b.id, 0, 40).unwrap().total, 0);
    }
    #[test]
    fn picker_prioritizes_title_matches_over_newer_tag_matches() {
        let temp = tempfile::tempdir().unwrap();
        let mut s = Store::open(temp.path()).unwrap();
        let source = s.create_note("Source".into(), None).unwrap();
        let titled = s.create_note("Biology lesson".into(), None).unwrap();
        let mut tagged = s.create_note("Other".into(), None).unwrap();
        tagged.tags = vec!["biology".into()];
        s.save_note(tagged, 1).unwrap();
        let result = s.picker_notes(&source.id, "bio", 0, 40).unwrap();
        assert_eq!(result.total, 2);
        assert_eq!(result.items[0].note.id, titled.id);
    }
    #[test]
    fn dismissed_pairs_filter_both_directions_and_export_keeps_intent() {
        let temp = tempfile::tempdir().unwrap();
        let mut s = Store::open(temp.path()).unwrap();
        let a = s.create_note("Shared topic alpha".into(), None).unwrap();
        let b = s.create_note("Shared topic beta".into(), None).unwrap();
        assert!(s
            .related_notes(&a.id, 0, 8)
            .unwrap()
            .items
            .iter()
            .any(|i| i.note.id == b.id));
        s.set_relation(&a.id, &b.id, None, Some(true), None)
            .unwrap();
        assert!(!s
            .related_notes(&a.id, 0, 8)
            .unwrap()
            .items
            .iter()
            .any(|i| i.note.id == b.id));
        assert!(!s
            .related_notes(&b.id, 0, 8)
            .unwrap()
            .items
            .iter()
            .any(|i| i.note.id == a.id));
        assert_eq!(s.export_relations().unwrap()["pairs"][0]["dismissed"], true);
        assert_eq!(s.restore_dismissed(&a.id).unwrap(), 1);
        assert!(s
            .related_notes(&a.id, 0, 8)
            .unwrap()
            .items
            .iter()
            .any(|i| i.note.id == b.id));
        s.set_relation(&a.id, &b.id, Some(true), None, None)
            .unwrap();
        assert!(s.related_notes(&a.id, 0, 8).unwrap().items.is_empty());
    }
    #[test]
    fn image_and_text_references_deduplicate_but_preserve_remaining_provenance() {
        let temp = tempfile::tempdir().unwrap();
        let mut s = Store::open(temp.path()).unwrap();
        let mut a = s.create_note("Source".into(), None).unwrap();
        let b = s.create_note("Target".into(), None).unwrap();
        let asset = s
            .import_image(&a.id, include_bytes!("../icons/icon.png"), "image/png")
            .unwrap();
        let image = json!({"type":"localImage","attrs":{"id":"image1","assetId":asset.id,"href":format!("noted://note/{}",b.id)}});
        a.content = json!({"type":"doc","content":[{"type":"paragraph","attrs":{"id":"p"},"content":[{"type":"text","text":"written link","marks":[{"type":"link","attrs":{"href":format!("noted://note/{}",b.id)}}]}]},image.clone()]});
        a = s.save_note(a, 1).unwrap();
        let refs = s.list_references(&b.id, 0, 40).unwrap();
        assert_eq!(refs.total, 1);
        assert_eq!(refs.items[0].incoming, 2);
        a.content = json!({"type":"doc","content":[image]});
        s.save_note(a, 2).unwrap();
        assert_eq!(
            s.list_references(&b.id, 0, 40).unwrap().items[0].incoming,
            1
        );
    }
    #[test]
    fn dense_graph_prioritizes_source_pairs_before_the_edge_cap() {
        let temp = tempfile::tempdir().unwrap();
        let mut store = Store::open(temp.path()).unwrap();
        let notes = (0..25)
            .map(|i| store.create_note(format!("Node {i}"), None).unwrap())
            .collect::<Vec<_>>();
        for i in 1..notes.len() {
            store
                .set_relation_strength(&notes[0].id, &notes[i].id, Some(true), None, None, Some(1))
                .unwrap();
            for j in i + 1..notes.len() {
                store
                    .set_relation_strength(
                        &notes[i].id,
                        &notes[j].id,
                        Some(true),
                        None,
                        None,
                        Some(5),
                    )
                    .unwrap();
            }
        }
        let ids = notes.iter().map(|n| n.id.clone()).collect::<Vec<_>>();
        let unscoped = store.connection_edges(ids.clone()).unwrap();
        assert_eq!(unscoped.len(), 180);
        assert!(!unscoped
            .iter()
            .any(|p| p.a == notes[0].id || p.b == notes[0].id));
        let scoped = store.connection_edges_for(ids, Some(&notes[0].id)).unwrap();
        assert_eq!(scoped.len(), 180);
        assert_eq!(
            scoped
                .iter()
                .filter(|p| p.a == notes[0].id || p.b == notes[0].id)
                .count(),
            24
        );
    }
    #[test]
    fn cached_startup_reconciles_external_changes_and_preserves_relations() {
        let temp = tempfile::tempdir().unwrap();
        let mut s = Store::open(temp.path()).unwrap();
        let a = s.create_note("Before".into(), None).unwrap();
        drop(s);
        let mut s = Store::open_cached(temp.path()).unwrap();
        let mut edited = a.clone();
        edited.title = "After".into();
        std::fs::write(
            temp.path().join("notes").join(format!("{}.json", a.id)),
            serde_json::to_vec(&edited).unwrap(),
        )
        .unwrap();
        s.start_reconcile().unwrap();
        while s.reconcile_batch(4).unwrap() {}
        assert_eq!(s.picker_notes(&a.id, "After", 0, 40).unwrap().total, 0);
        assert_eq!(
            s.list_notes_page("After", None, 0, 40).unwrap().items[0].title,
            "After"
        );
        assert!(!s.reconcile_batch(4).unwrap());
    }
}
