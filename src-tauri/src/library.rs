//! Reversible library operations. Authored links/assets survive Trash.
use crate::store::{atomic_write, valid_id, Folder, Note, NoteSummary, Store};
use chrono::{Duration, Utc};
use serde::{Deserialize, Serialize};
use std::{fs, io::Write, path::Path};
type Result<T> = std::result::Result<T, String>;
fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}
pub(crate) fn ordinary(path: &Path, dir: bool) -> Result<()> {
    let m = fs::symlink_metadata(path).map_err(err)?;
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if m.file_attributes() & 0x400 != 0 {
            return Err("Redirected workspace paths are not supported".into());
        }
    }
    if m.file_type().is_symlink() || m.is_dir() != dir || !dir && !m.is_file() {
        return Err("Expected an ordinary workspace path".into());
    }
    Ok(())
}
pub(crate) fn directory(root: &Path, name: &str) -> Result<std::path::PathBuf> {
    let p = root.join(name);
    if !p.exists() {
        fs::create_dir(&p).map_err(err)?;
    }
    ordinary(&p, true)?;
    Ok(p)
}
fn copy_new(source: &Path, target: &Path) -> Result<()> {
    ordinary(source, false)?;
    let mut src = fs::File::open(source).map_err(err)?;
    let mut temp =
        tempfile::NamedTempFile::new_in(target.parent().ok_or("Missing parent")?).map_err(err)?;
    std::io::copy(&mut src, &mut temp).map_err(err)?;
    temp.flush().map_err(err)?;
    temp.as_file().sync_all().map_err(err)?;
    temp.persist_noclobber(target).map_err(err)?;
    Ok(())
}
// Retry a crash-interrupted move only when both copies are byte-identical.
fn publish_or_identical(source: &Path, target: &Path) -> Result<()> {
    if target.exists() {
        ordinary(target, false)?;
        ordinary(source, false)?;
        let len = fs::metadata(source).map_err(err)?.len();
        if len > 8 * 1024 * 1024
            || fs::metadata(target).map_err(err)?.len() != len
            || fs::read(source).map_err(err)? != fs::read(target).map_err(err)?
        {
            return Err("A different copy already exists; both versions were preserved".into());
        }
        Ok(())
    } else {
        copy_new(source, target)
    }
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReviewState {
    #[serde(default)]
    pub dismissed: bool,
    pub snooze_until: Option<String>,
    pub reviewed_at: Option<String>,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewItem {
    pub note: NoteSummary,
    pub reasons: Vec<String>,
}
impl Store {
    pub fn update_folder(&mut self, folder: Folder, expected: Folder) -> Result<Folder> {
        valid_id(&folder.id)?;
        let mut all = self.list_folders()?;
        let current = all
            .iter_mut()
            .find(|f| f.id == folder.id)
            .ok_or("Folder is missing")?;
        if serde_json::to_value(&*current).map_err(err)?
            != serde_json::to_value(expected).map_err(err)?
        {
            return Err("Folder changed elsewhere; reopen its settings".into());
        }
        if folder.name.trim().is_empty() || folder.name.len() > 256 {
            return Err("Folder name must contain 1-256 bytes".into());
        }
        *current = folder.clone();
        let mut seen = std::collections::HashSet::new();
        seen.insert(folder.id.clone());
        let mut parent = folder.parent_id.clone();
        while let Some(id) = parent {
            if !seen.insert(id.clone()) {
                return Err("A folder cannot be moved inside itself or a descendant".into());
            }
            parent = all
                .iter()
                .find(|f| f.id == id)
                .ok_or("Parent is missing")?
                .parent_id
                .clone();
        }
        atomic_write(
            &self.path("folders", &folder.id)?,
            &serde_json::to_vec_pretty(&folder).map_err(err)?,
        )?;
        let indexed: Result<()> = (|| {
            self.db
                .execute(
                    "INSERT OR REPLACE INTO folder_search VALUES(?1,?2)",
                    rusqlite::params![folder.id, folder.name],
                )
                .map_err(err)?;
            self.db.execute("DELETE FROM note_files", []).map_err(err)?;
            self.start_reconcile()
        })();
        if let Err(e) = indexed {
            self.warnings.push(format!(
                "Folder saved, but search refresh failed: {e}. Rebuild the index."
            ));
        }
        Ok(folder)
    }
    pub fn trash_note(&mut self, id: &str, revision: u64, token: &str) -> Result<()> {
        let note = self.load_note(id)?;
        if note.revision != revision || note.revision_token != token {
            return Err("The note changed. Reload before moving it to Trash".into());
        }
        let dir = directory(&self.root, "trash")?;
        let target = dir.join(format!("{id}.json"));
        let source = self.path("notes", id)?;
        publish_or_identical(&source, &target)?;
        fs::remove_file(source).map_err(err)?;
        if let Err(e) = self.remove_indexed_note(id) {
            self.warnings.push(format!(
                "Note moved to Trash, but index cleanup failed: {e}. Rebuild the index."
            ));
        }
        Ok(())
    }
    pub fn list_trash(&self) -> Result<Vec<NoteSummary>> {
        let dir = self.root.join("trash");
        if !dir.exists() {
            return Ok(vec![]);
        }
        ordinary(&dir, true)?;
        let mut result = vec![];
        for entry in fs::read_dir(dir).map_err(err)? {
            let p = entry.map_err(err)?.path();
            if p.extension().and_then(|s| s.to_str()) != Some("json") {
                continue;
            }
            ordinary(&p, false)?;
            if fs::metadata(&p).map_err(err)?.len() > 8 * 1024 * 1024 {
                return Err("Trashed note exceeds size limit; file preserved".into());
            }
            let n: Note = serde_json::from_slice(&fs::read(&p).map_err(err)?).map_err(err)?;
            valid_id(&n.id)?;
            if p.file_stem().and_then(|s| s.to_str()) != Some(&n.id) {
                return Err("Invalid Trash identity; files preserved".into());
            }
            result.push(NoteSummary::from(&n));
        }
        result.sort_by(|a, b| a.title.cmp(&b.title));
        Ok(result)
    }
    pub fn restore_note(&mut self, id: &str) -> Result<Note> {
        valid_id(id)?;
        let dir = directory(&self.root, "trash")?;
        let source = dir.join(format!("{id}.json"));
        let target = self.path("notes", id)?;
        publish_or_identical(&source, &target)?;
        // Keep both copies if a crash occurs between publication and cleanup.
        let note = self.load_note(id)?;
        if let Err(e) = self.index_note(&note) {
            self.warnings.push(format!(
                "Note restored, but indexing failed: {e}. Rebuild the index."
            ));
        }
        fs::remove_file(source).map_err(err)?;
        Ok(note)
    }
    pub fn recover_draft(&mut self, mut draft: Note) -> Result<Note> {
        valid_id(&draft.id)?;
        let source = self.root.join("assets").join(&draft.id);
        draft.id = uuid::Uuid::new_v4().to_string();
        if draft.folder_id.as_ref().is_some_and(|id| {
            !self
                .list_folders()
                .unwrap_or_default()
                .iter()
                .any(|f| &f.id == id)
        }) {
            draft.folder_id = None;
        }
        draft.title = format!(
            "{} (recovered draft)",
            draft.title.chars().take(240).collect::<String>()
        );
        draft.revision = 1;
        draft.revision_token.clear();
        draft.created_at = Utc::now().to_rfc3339();
        draft.updated_at = draft.created_at.clone();
        if let Some(d) = &draft.document {
            draft.content = crate::document::project(d)?;
        }
        self.validate(&draft)?;
        if source.exists() {
            ordinary(&self.root.join("assets"), true)?;
            ordinary(&source, true)?;
            let target = self.root.join("assets").join(&draft.id);
            fs::create_dir(&target).map_err(err)?;
            for entry in fs::read_dir(source).map_err(err)? {
                let p = entry.map_err(err)?.path();
                if p.extension().and_then(|s| s.to_str()) != Some("image") {
                    return Err("Unexpected asset; draft remains open".into());
                }
                copy_new(&p, &target.join(p.file_name().ok_or("Invalid asset name")?))?;
            }
        }
        self.commit(draft)
    }
    pub fn review_state(&self, id: &str) -> Result<ReviewState> {
        valid_id(id)?;
        let p = self.root.join("review").join(format!("{id}.json"));
        if !p.exists() {
            return Ok(ReviewState::default());
        }
        ordinary(&p, false)?;
        if fs::metadata(&p).map_err(err)?.len() > 4096 {
            return Err("Review state exceeds its size limit".into());
        }
        serde_json::from_slice(&fs::read(p).map_err(err)?).map_err(err)
    }
    pub fn review_action(&self, id: &str, action: &str) -> Result<()> {
        self.load_note(id)?;
        let mut state = self.review_state(id)?;
        match action {
            "reviewed" => {
                state.reviewed_at = Some(Utc::now().to_rfc3339());
                state.snooze_until = None;
            }
            "snooze" => state.snooze_until = Some((Utc::now() + Duration::days(1)).to_rfc3339()),
            "dismiss" => state.dismissed = true,
            "reset" => state = ReviewState::default(),
            _ => return Err("Unknown review action".into()),
        };
        let dir = directory(&self.root, "review")?;
        atomic_write(
            &dir.join(format!("{id}.json")),
            &serde_json::to_vec(&state).map_err(err)?,
        )
    }
    pub fn review_feed(
        &self,
        folder_id: Option<String>,
        tag: String,
        include_hidden: bool,
    ) -> Result<Vec<ReviewItem>> {
        let now = Utc::now();
        let mut ranked = vec![];
        for note in self.list_notes()? {
            if folder_id
                .as_ref()
                .is_some_and(|f| note.folder_id.as_deref() != Some(f.as_str()))
                || !tag.is_empty() && !note.tags.iter().any(|t| t.eq_ignore_ascii_case(&tag))
            {
                continue;
            }
            let state = self.review_state(&note.id)?;
            let today = now.date_naive();
            let reviewed = state
                .reviewed_at
                .as_deref()
                .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok());
            let sleeping = state
                .snooze_until
                .as_deref()
                .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
                .is_some_and(|d| d > now);
            if !include_hidden
                && (state.dismissed
                    || sleeping
                    || reviewed.is_some_and(|d| d.date_naive() == today))
            {
                continue;
            }
            let days = chrono::DateTime::parse_from_rfc3339(&note.updated_at)
                .ok()
                .map(|d| (now - d.with_timezone(&Utc)).num_days().max(0))
                .unwrap_or(0);
            let connections: i64 = self
                .relations
                .query_row(
                    "SELECT count(*) FROM pairs WHERE connected=1 AND (a=?1 OR b=?1)",
                    [&note.id],
                    |r| r.get(0),
                )
                .map_err(err)?;
            let mut reasons = vec![format!("Last edited {days} days ago")];
            if connections > 0 {
                reasons.push(format!("{connections} saved connections"));
            }
            if !note.tags.is_empty() {
                reasons.push(format!("Tags: {}", note.tags.join(", ")));
            }
            if state.dismissed {
                reasons.push("Excluded from review".into());
            }
            if sleeping {
                reasons.push("Snoozed until tomorrow".into());
            }
            let age = reviewed
                .map(|d| (now - d.with_timezone(&Utc)).num_days().max(0))
                .unwrap_or(days + 30);
            let tie = format!("{today}{}", note.id)
                .bytes()
                .fold(0u64, |a, b| a.wrapping_mul(31).wrapping_add(b as u64));
            ranked.push((age, tie, ReviewItem { note, reasons }));
        }
        ranked.sort_by(|a, b| b.0.cmp(&a.0).then(a.1.cmp(&b.1)));
        Ok(ranked.into_iter().take(30).map(|x| x.2).collect())
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn trash_restores_identity_search_assets_and_relations() {
        let t = tempfile::tempdir().unwrap();
        let mut s = Store::open(t.path()).unwrap();
        let a = s.create_note("Alpha".into(), None).unwrap();
        let b = s.create_note("Beta".into(), None).unwrap();
        s.set_relation_strength(&a.id, &b.id, Some(true), None, None, None)
            .unwrap();
        let pairs = s.export_relations().unwrap();
        assert!(s.trash_note(&a.id, a.revision, "stale").is_err());
        s.trash_note(&a.id, a.revision, &a.revision_token).unwrap();
        assert!(s.load_note(&a.id).is_err());
        assert!(s.search_notes("Alpha").unwrap().is_empty());
        assert_eq!(s.list_trash().unwrap().len(), 1);
        assert!(s.load_note(&b.id).is_ok());
        let restored = s.restore_note(&a.id).unwrap();
        assert_eq!(restored.id, a.id);
        assert_eq!(s.export_relations().unwrap(), pairs);
        assert_eq!(s.search_notes("Alpha").unwrap().len(), 1);
    }
    #[test]
    fn folder_cycles_and_stale_updates_are_rejected() {
        let t = tempfile::tempdir().unwrap();
        let mut s = Store::open(t.path()).unwrap();
        let a = s.create_folder("A".into(), None).unwrap();
        let b = s.create_folder("B".into(), Some(a.id.clone())).unwrap();
        let mut next = a.clone();
        next.parent_id = Some(b.id);
        assert!(s.update_folder(next, a.clone()).is_err());
        let mut next = a.clone();
        next.name = "Renamed".into();
        s.update_folder(next.clone(), a.clone()).unwrap();
        assert!(s.update_folder(a.clone(), a).is_err());
        assert_eq!(
            s.list_folders()
                .unwrap()
                .iter()
                .find(|f| f.id == next.id)
                .unwrap()
                .name,
            "Renamed"
        );
    }
    #[test]
    fn conflict_copy_keeps_original_and_review_controls_persist() {
        let t = tempfile::tempdir().unwrap();
        let mut s = Store::open(t.path()).unwrap();
        let a = s.create_note("Original".into(), None).unwrap();
        let mut draft = a.clone();
        draft.title = "Draft".into();
        let copy = s.recover_draft(draft).unwrap();
        assert_ne!(copy.id, a.id);
        assert_eq!(s.load_note(&a.id).unwrap().title, "Original");
        assert_eq!(s.review_feed(None, "".into(), false).unwrap().len(), 2);
        s.review_action(&a.id, "dismiss").unwrap();
        s.review_action(&copy.id, "snooze").unwrap();
        assert!(s.review_feed(None, "".into(), false).unwrap().is_empty());
        assert_eq!(s.review_feed(None, "".into(), true).unwrap().len(), 2);
        s.review_action(&a.id, "reset").unwrap();
        assert_eq!(s.review_feed(None, "".into(), false).unwrap().len(), 1);
        s.review_action(&a.id, "reviewed").unwrap();
        assert!(s.review_feed(None, "".into(), false).unwrap().is_empty());
    }
}

#[cfg(test)]
mod recovery_backup_tests {
    use super::*;
    #[test]
    fn backup_preserves_trash_review_assets_and_resets_agent_access() {
        let t = tempfile::tempdir().unwrap();
        let mut s = Store::open(t.path().join("source")).unwrap();
        let n = s.create_note("Recover me".into(), None).unwrap();
        let assets = s.root.join("assets").join(&n.id);
        fs::create_dir_all(&assets).unwrap();
        let asset = assets.join(format!("{}.image", uuid::Uuid::new_v4()));
        fs::write(&asset, b"opaque fixture asset").unwrap();
        s.review_action(&n.id, "dismiss").unwrap();
        s.set_agent_access(crate::agent::Access {
            enabled: true,
            folder_ids: vec![],
        })
        .unwrap();
        let recovered = s.recover_draft(n.clone()).unwrap();
        assert_eq!(
            fs::read(
                s.root
                    .join("assets")
                    .join(&recovered.id)
                    .join(asset.file_name().unwrap())
            )
            .unwrap(),
            b"opaque fixture asset"
        );
        s.trash_note(&n.id, n.revision, &n.revision_token).unwrap();
        let archive = t.path().join("library.noted-backup");
        s.create_backup(&archive).unwrap();
        let inspected = crate::backup::inspect_backup(&archive).unwrap();
        let restored = t.path().join("restored");
        crate::backup::restore_backup(&archive, &restored, &inspected.digest).unwrap();
        let mut copy = Store::open(&restored).unwrap();
        assert_eq!(copy.list_trash().unwrap()[0].id, n.id);
        assert!(copy.review_state(&n.id).unwrap().dismissed);
        assert!(!copy.agent_access().unwrap().enabled);
        let restored_note = copy.restore_note(&n.id).unwrap();
        assert_eq!(restored_note.id, n.id);
        assert_eq!(
            fs::read(
                restored
                    .join("assets")
                    .join(&n.id)
                    .join(asset.file_name().unwrap())
            )
            .unwrap(),
            b"opaque fixture asset"
        );
        assert!(copy.restore_note(&n.id).is_err());
    }
}

#[cfg(test)]
mod interrupted_move_tests {
    use super::*;
    #[test]
    fn retry_finishes_identical_move_and_never_overwrites_different_copy() {
        let t = tempfile::tempdir().unwrap();
        let mut s = Store::open(t.path()).unwrap();
        let n = s.create_note("Original".into(), None).unwrap();
        let trash = directory(&s.root, "trash")
            .unwrap()
            .join(format!("{}.json", n.id));
        let live = s.path("notes", &n.id).unwrap();
        copy_new(&live, &trash).unwrap();
        s.trash_note(&n.id, n.revision, &n.revision_token).unwrap();
        copy_new(&trash, &live).unwrap();
        s.restore_note(&n.id).unwrap();
        copy_new(&live, &trash).unwrap();
        fs::write(&trash, b"different copy").unwrap();
        assert!(s.trash_note(&n.id, n.revision, &n.revision_token).is_err());
        assert_eq!(s.load_note(&n.id).unwrap().title, "Original");
        assert_eq!(fs::read(trash).unwrap(), b"different copy");
    }
}
