use crate::store::{Note, NoteSummary, Store};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap, HashSet};
type Result<T> = std::result::Result<T, String>;
fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PairState {
    pub a: String,
    pub b: String,
    pub connected: bool,
    pub dismissed: bool,
    pub revision: u64,
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
    db.execute_batch("CREATE TABLE IF NOT EXISTS note_refs(source TEXT NOT NULL,target TEXT NOT NULL,occurrences INTEGER NOT NULL,PRIMARY KEY(source,target)); CREATE INDEX IF NOT EXISTS refs_target ON note_refs(target); CREATE TABLE IF NOT EXISTS note_tags(note_id TEXT NOT NULL,tag TEXT NOT NULL,PRIMARY KEY(note_id,tag)); CREATE INDEX IF NOT EXISTS tags_tag ON note_tags(tag); CREATE VIRTUAL TABLE IF NOT EXISTS picker_search USING fts5(id UNINDEXED,title,tags,folder,tokenize='unicode61'); CREATE INDEX IF NOT EXISTS notes_folder ON notes(json_extract(summary,'$.folderId')); CREATE INDEX IF NOT EXISTS notes_updated ON notes(json_extract(summary,'$.updatedAt') DESC,id); CREATE TABLE IF NOT EXISTS note_files(id TEXT PRIMARY KEY,signature TEXT NOT NULL);").map_err(err)
}
pub fn open(root: &std::path::Path) -> Result<Connection> {
    let path = root.join("relations.sqlite3");
    if let Ok(m) = std::fs::symlink_metadata(&path) {
        if !m.is_file() || m.file_type().is_symlink() {
            return Err("Relations database must be an ordinary file".into());
        }
    }
    let db = Connection::open(path).map_err(err)?;
    db.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS pairs(a TEXT NOT NULL,b TEXT NOT NULL,connected INTEGER NOT NULL DEFAULT 0,dismissed INTEGER NOT NULL DEFAULT 0,revision INTEGER NOT NULL,PRIMARY KEY(a,b),CHECK(a<b)); CREATE INDEX IF NOT EXISTS pairs_b ON pairs(b);").map_err(err)?;
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
            "INSERT INTO note_refs VALUES(?1,?2,?3)",
            params![note.id, target, count as i64],
        )
        .map_err(err)?;
    }
    db.execute("DELETE FROM note_tags WHERE note_id=?1", [&note.id])
        .map_err(err)?;
    for tag in &note.tags {
        db.execute(
            "INSERT OR IGNORE INTO note_tags VALUES(?1,?2)",
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
            .prepare("SELECT a,b,connected,dismissed,revision FROM pairs ORDER BY a,b")
            .map_err(err)?;
        let pairs = stmt
            .query_map([], |r| {
                Ok(PairState {
                    a: r.get(0)?,
                    b: r.get(1)?,
                    connected: r.get(2)?,
                    dismissed: r.get(3)?,
                    revision: r.get::<_, i64>(4)? as u64,
                })
            })
            .map_err(err)?
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(err)?;
        Ok(serde_json::json!({"formatVersion":1,"pairs":pairs}))
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
                "SELECT connected,dismissed,revision FROM pairs WHERE a=?1 AND b=?2",
                params![a, b],
                |r| {
                    Ok(PairState {
                        a: a.into(),
                        b: b.into(),
                        connected: r.get(0)?,
                        dismissed: r.get(1)?,
                        revision: r.get::<_, i64>(2)? as u64,
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
        let previous = self.pair(a, b)?;
        if expected_revision.is_some_and(|r| r != previous.revision) {
            return Err("Connection changed since this action; Undo was not applied".into());
        }
        if connected == Some(true) || dismissed == Some(true) {
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
        let changed =
            state.connected != previous.connected || state.dismissed != previous.dismissed;
        if changed {
            state.revision += 1;
            self.relations.execute("INSERT INTO pairs VALUES(?1,?2,?3,?4,?5) ON CONFLICT(a,b) DO UPDATE SET connected=excluded.connected,dismissed=excluded.dismissed,revision=excluded.revision",params![state.a,state.b,state.connected,state.dismissed,state.revision as i64]).map_err(err)?;
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
        let mut stmt=self.relations.prepare("SELECT a,b,connected,dismissed,revision FROM pairs WHERE connected=1 AND (a=?1 OR b=?1) ORDER BY a,b LIMIT ?2 OFFSET ?3").map_err(err)?;
        let states = stmt
            .query_map(params![note_id, limit as i64, cursor as i64], |r| {
                Ok(PairState {
                    a: r.get(0)?,
                    b: r.get(1)?,
                    connected: r.get(2)?,
                    dismissed: r.get(3)?,
                    revision: r.get::<_, i64>(4)? as u64,
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
        let mut items = self.related_notes(note_id, 0, 100)?.items;
        for (rank, (id, _similarity)) in semantic.into_iter().take(120).enumerate() {
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
        self.require_note(note_id)?;
        let mut candidates = HashMap::<String, (f64, Vec<String>)>::new();
        let mut stmt=self.db.prepare("WITH freq AS MATERIALIZED (SELECT tag,count(*) AS n FROM note_tags WHERE tag IN (SELECT tag FROM note_tags WHERE note_id=?1) GROUP BY tag) SELECT t.note_id,sum(1.0/f.n) AS weight FROM note_tags t JOIN freq f ON t.tag=f.tag WHERE t.note_id<>?1 GROUP BY t.note_id ORDER BY weight DESC,t.note_id LIMIT 120").map_err(err)?;
        let tags = stmt
            .query_map([note_id], |r| {
                Ok((r.get::<_, String>(0)?, r.get::<_, f64>(1)?))
            })
            .map_err(err)?;
        for (rank, row) in tags.enumerate() {
            let (id, _) = row.map_err(err)?;
            candidates.insert(id, (2.0 / (60.0 + rank as f64), vec!["Shared tags".into()]));
        }
        let source = self
            .summary_for(note_id)?
            .ok_or("This note is not indexed yet")?;
        let mut words = source
            .title
            .split_whitespace()
            .chain(source.tags.iter().map(String::as_str))
            .filter(|w| w.len() > 2)
            .take(12)
            .map(|s| format!("\"{}\"", s.replace('"', "\"\"")))
            .collect::<Vec<_>>();
        if words.is_empty() {
            let text: String=self.db.query_row("SELECT substr(body,1,4096) FROM note_search WHERE rowid=(SELECT rowid FROM notes WHERE id=?1)",[note_id],|r|r.get(0)).optional().map_err(err)?.unwrap_or_default();
            words = text
                .split_whitespace()
                .filter(|w| w.len() > 3)
                .take(12)
                .map(|s| format!("\"{}\"", s.replace('"', "\"\"")))
                .collect();
        }
        if !words.is_empty() {
            let mut stmt=self.db.prepare("SELECT id FROM note_search WHERE note_search MATCH ?1 ORDER BY bm25(note_search) LIMIT 120").map_err(err)?;
            let rows = stmt
                .query_map([words.join(" OR ")], |r| r.get::<_, String>(0))
                .map_err(err)?;
            for (rank, row) in rows.enumerate() {
                let entry = candidates.entry(row.map_err(err)?).or_default();
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
        entries.sort_by(|a, b| b.score.total_cmp(&a.score).then(a.note.id.cmp(&b.note.id)));
        let entries = self.filter_related(note_id, entries)?;
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
