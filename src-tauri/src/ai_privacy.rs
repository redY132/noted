//! Append-only private-note exclusion, independent of optional MCP grants.
//! Imported IDs are denied before canonical files exist. No API removes denial.
use crate::{
    library::ordinary,
    store::{atomic_write, valid_id, Note, Store},
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{collections::BTreeSet, fs, path::Path};

type Result<T> = std::result::Result<T, String>;
const INVALID: &str = "AI_PRIVACY_POLICY_INVALID";
pub const DENIED: &str = "AI_PRIVATE_NOTE";
pub const INCOMPLETE: &str = ".noted-private-import-incomplete";
pub const LEGACY_FENCE: &str = ".noted-restore-incomplete";
const FENCE_MAGIC: &[u8] = b"NOTED_PRIVATE_AI_EXCLUSION_V1\n";
const FILE: &str = "ai-private.json";
const REQUIRED: &str = "ai-private.required";

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Policy {
    pub format_version: u32,
    pub note_ids: BTreeSet<String>,
    pub folder_ids: BTreeSet<String>,
}
impl Default for Policy {
    fn default() -> Self {
        Self {
            format_version: 1,
            note_ids: BTreeSet::new(),
            folder_ids: BTreeSet::new(),
        }
    }
}
fn bounded(path: &Path, maximum: u64) -> Result<Vec<u8>> {
    ordinary(path, false).map_err(|_| INVALID)?;
    if fs::metadata(path).map_err(|_| INVALID)?.len() > maximum {
        return Err(INVALID.into());
    }
    fs::read(path).map_err(|_| INVALID.into())
}
fn read(root: &Path) -> Result<Policy> {
    let path = root.join(FILE);
    if !path.exists() {
        return if root.join(REQUIRED).exists() {
            Err(INVALID.into())
        } else {
            Ok(Policy::default())
        };
    }
    let p: Policy =
        serde_json::from_slice(&bounded(&path, 8 * 1024 * 1024)?).map_err(|_| INVALID)?;
    if p.format_version != 1
        || p.note_ids.len() > 100000
        || p.folder_ids.len() > 20000
        || p.note_ids
            .iter()
            .chain(p.folder_ids.iter())
            .any(|id| valid_id(id).is_err())
    {
        return Err(INVALID.into());
    }
    Ok(p)
}
// Existing older desktop/MCP builds already refuse this guard filename. Only
// the new build recognizes this exact private-policy fence, never an unfinished
// real restore. It prevents old companions from ignoring the new deny file.
pub fn compatible_fence(root: &Path) -> bool {
    bounded(&root.join(LEGACY_FENCE), 4096).ok().as_deref() == Some(FENCE_MAGIC)
        && read(root).is_ok_and(|p| !p.note_ids.is_empty() || !p.folder_ids.is_empty())
}
pub(crate) fn ensure_legacy_fence(root: &Path) -> Result<()> {
    let p = read(root)?;
    if p.note_ids.is_empty() && p.folder_ids.is_empty() {
        return Ok(());
    }
    let file = root.join(LEGACY_FENCE);
    if file.exists() && bounded(&file, 4096)?.as_slice() != FENCE_MAGIC {
        return Err("AI_WORKSPACE_RESTORE_INCOMPLETE".into());
    }
    if !file.exists() {
        atomic_write(&file, FENCE_MAGIC)?;
    }
    Ok(())
}
pub(crate) fn complete_restore(root: &Path) -> Result<()> {
    let p = read(root)?;
    if !p.note_ids.is_empty() || !p.folder_ids.is_empty() {
        atomic_write(&root.join(LEGACY_FENCE), FENCE_MAGIC)?;
    } else {
        fs::remove_file(root.join(LEGACY_FENCE)).map_err(|_| INVALID)?;
    }
    Gate::load(root)?;
    Ok(())
}
fn write(root: &Path, p: &Policy) -> Result<()> {
    // Fence older clients before publishing any private payload.
    let fence = root.join(LEGACY_FENCE);
    if fence.exists() && bounded(&fence, 4096)?.as_slice() != FENCE_MAGIC {
        return Err("AI_WORKSPACE_RESTORE_INCOMPLETE".into());
    }
    atomic_write(&fence, FENCE_MAGIC)?;
    // If interrupted before the policy is durable, all AI access fails closed.
    atomic_write(&root.join(REQUIRED), b"1\n")?;
    atomic_write(
        &root.join(FILE),
        &serde_json::to_vec(p).map_err(|_| INVALID)?,
    )
}
pub struct Gate<'a> {
    root: &'a Path,
    policy: Policy,
}
impl<'a> Gate<'a> {
    pub fn load(root: &'a Path) -> Result<Self> {
        if root.join(INCOMPLETE).exists() {
            return Err("AI_PRIVATE_IMPORT_INCOMPLETE".into());
        }
        let policy = read(root)?;
        if root.join(LEGACY_FENCE).exists() && !compatible_fence(root) {
            return Err("AI_WORKSPACE_RESTORE_INCOMPLETE".into());
        }
        Ok(Self { root, policy })
    }
    pub fn signature(&self) -> String {
        format!(
            "{:x}",
            Sha256::digest(serde_json::to_vec(&self.policy).unwrap_or_default())
        )
    }
    pub fn has_private(&self) -> bool {
        !self.policy.note_ids.is_empty() || !self.policy.folder_ids.is_empty()
    }
    pub fn allows_folder(&self, folder: Option<&str>) -> Result<bool> {
        if self.policy.folder_ids.is_empty() {
            return Ok(true);
        }
        let mut current = folder.map(str::to_owned);
        let mut seen = BTreeSet::new();
        while let Some(id) = current {
            valid_id(&id).map_err(|_| INVALID)?;
            if self.policy.folder_ids.contains(&id) {
                return Ok(false);
            }
            if !seen.insert(id.clone()) || seen.len() > 128 {
                return Err(INVALID.into());
            }
            let f: crate::store::Folder = serde_json::from_slice(&bounded(
                &self.root.join("folders").join(format!("{id}.json")),
                65536,
            )?)
            .map_err(|_| INVALID)?;
            if f.id != id {
                return Err(INVALID.into());
            }
            current = f.parent_id;
        }
        Ok(true)
    }
    pub fn allows_note(&self, id: &str) -> Result<bool> {
        valid_id(id).map_err(|_| INVALID)?;
        if self.policy.note_ids.contains(id) {
            return Ok(false);
        }
        if self.policy.folder_ids.is_empty() {
            return Ok(true);
        }
        let v: Value = serde_json::from_slice(&bounded(
            &self.root.join("notes").join(format!("{id}.json")),
            8 * 1024 * 1024,
        )?)
        .map_err(|_| INVALID)?;
        if v["id"].as_str() != Some(id) {
            return Err(INVALID.into());
        }
        self.allows_folder(v["folderId"].as_str())
    }
}
pub fn ensure_note(root: &Path, id: &str) -> Result<()> {
    if Gate::load(root)?.allows_note(id)? {
        Ok(())
    } else {
        Err(DENIED.into())
    }
}
pub fn guidance(root: &Path, schema: Option<&Value>) -> Result<()> {
    let gate = Gate::load(root)?;
    if let Some(s) = schema {
        if let Some(source) = s.get("sourceNoteId") {
            ensure_note(root, source.as_str().ok_or(INVALID)?)?;
        } else if gate.has_private() && s.get("guide").is_some() {
            return Err(
                "AI_GUIDE_SOURCE_REQUIRED: recapture this legacy guide from an AI-eligible note"
                    .into(),
            );
        }
    }
    Ok(())
}
pub(crate) fn deny_batch(
    root: &Path,
    notes: impl IntoIterator<Item = String>,
    folders: impl IntoIterator<Item = String>,
) -> Result<()> {
    let mut p = read(root)?;
    for id in notes {
        valid_id(&id)?;
        p.note_ids.insert(id);
    }
    for id in folders {
        valid_id(&id)?;
        p.folder_ids.insert(id);
    }
    if p.note_ids.len() > 100000 || p.folder_ids.len() > 20000 {
        return Err(INVALID.into());
    }
    write(root, &p)
}
pub(crate) fn verify_batch(root: &Path, notes: &[String], folder: &str) -> Result<()> {
    let p = read(root)?;
    if !p.folder_ids.contains(folder) || notes.iter().any(|id| !p.note_ids.contains(id)) {
        return Err("PRIVATE_IMPORT_PRIVACY_CHECK_FAILED".into());
    }
    Ok(())
}
pub(crate) fn stamp(root: &Path, note: &Note) -> Result<()> {
    let gate = Gate {
        root,
        policy: read(root)?,
    };
    if gate.policy.note_ids.contains(&note.id) {
        return Ok(());
    }
    if !gate.allows_folder(note.folder_id.as_deref())? {
        deny_batch(root, [note.id.clone()], [])?;
    }
    Ok(())
}
pub(crate) fn inherit(root: &Path, source: &str, target: &str) -> Result<()> {
    if !Gate::load(root)?.allows_note(source)? {
        deny_batch(root, [target.into()], [])?;
    }
    Ok(())
}
pub(crate) fn protect_move(store: &Store, folder: &crate::store::Folder) -> Result<()> {
    let gate = Gate::load(&store.root)?;
    if !gate.policy.folder_ids.contains(&folder.id)
        && gate.allows_folder(folder.parent_id.as_deref())?
    {
        return Ok(());
    }
    let mut folders = BTreeSet::from([folder.id.clone()]);
    let all = store.list_folders()?;
    loop {
        let size = folders.len();
        for f in &all {
            if f.parent_id.as_ref().is_some_and(|p| folders.contains(p)) {
                folders.insert(f.id.clone());
            }
        }
        if folders.len() == size {
            break;
        }
    }
    let mut notes = vec![];
    for entry in fs::read_dir(store.root.join("notes")).map_err(|_| INVALID)? {
        let path = entry.map_err(|_| INVALID)?.path();
        if path.extension().and_then(|x| x.to_str()) != Some("json") {
            continue;
        }
        let v: Value =
            serde_json::from_slice(&bounded(&path, 8 * 1024 * 1024)?).map_err(|_| INVALID)?;
        if v["folderId"]
            .as_str()
            .is_some_and(|id| folders.contains(id))
        {
            notes.push(v["id"].as_str().ok_or(INVALID)?.to_owned());
        }
    }
    deny_batch(&store.root, notes, folders)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn private_note_blocks_mcp_requests_component_jobs_guidance_and_survives_moves_recovery_restore(
    ) {
        let t = tempfile::tempdir().unwrap();
        let root = t.path().join("source");
        let mut s = Store::open(&root).unwrap();
        let f = s.create_folder("Private".into(), None).unwrap();
        let public = s.create_folder("Public".into(), None).unwrap();
        let n = s
            .create_note("SYNTHETIC_PRIVATE_CANARY".into(), Some(f.id.clone()))
            .unwrap();
        let request = s
            .create_request_with_schema(&n.id, "Before privacy".into(), None)
            .unwrap();
        deny_batch(&s.root, [n.id.clone()], [f.id.clone()]).unwrap();
        s.set_agent_access(crate::agent::Access {
            enabled: true,
            allow_hosted: true,
            folder_ids: vec![public.id.clone()],
        })
        .unwrap();
        assert!(s
            .set_agent_access(crate::agent::Access {
                enabled: true,
                allow_hosted: true,
                folder_ids: vec![f.id.clone()]
            })
            .is_err());
        for name in ["get_note", "search_notes", "get_formatting_requests"] {
            let args = match name {
                "get_note" => json!({"id":n.id}),
                "search_notes" => json!({"query":""}),
                _ => json!({}),
            };
            let result = crate::agent::call(&s.root, name, &args);
            assert!(!format!("{result:?}").contains("SYNTHETIC_PRIVATE_CANARY"));
        }
        assert!(crate::agent::request(&s.root, &request.id).is_err());
        let service = crate::subscription::Service::default();
        assert!(service
            .start(
                n.clone(),
                request.clone(),
                s.root.clone(),
                "never-run.exe".into(),
                "never-run-agent.exe".into()
            )
            .is_err());
        assert!(s
            .create_request_with_schema(&n.id, "No private data".into(), None)
            .is_err());
        assert!(s
            .create_ai_request(&n.id, "No component".into(), None, Some("component".into()))
            .is_err());
        assert!(guidance(&s.root, Some(&json!({"sourceNoteId":n.id}))).is_err());
        let mut moved = s.load_note(&n.id).unwrap();
        moved.folder_id = Some(public.id.clone());
        s.save_note(moved, n.revision).unwrap();
        assert!(ensure_note(&s.root, &n.id).is_err());
        let recovered = s.recover_draft(s.load_note(&n.id).unwrap()).unwrap();
        assert!(ensure_note(&s.root, &recovered.id).is_err());
        let child = s.create_folder("Child".into(), Some(f.id.clone())).unwrap();
        let descendant = s
            .create_note("Child sentinel".into(), Some(child.id))
            .unwrap();
        assert!(ensure_note(&s.root, &descendant.id).is_err());
        let archive = t.path().join("private.noted-backup");
        let inspected = s.create_backup(&archive).unwrap();
        let restored = t.path().join("restore");
        crate::backup::restore_backup(&archive, &restored, &inspected.digest).unwrap();
        assert!(ensure_note(&restored, &n.id).is_err());
        assert!(ensure_note(&restored, &recovered.id).is_err());
    }
    #[test]
    fn missing_malformed_policy_and_legacy_guidance_fail_closed() {
        let t = tempfile::tempdir().unwrap();
        let mut s = Store::open(t.path()).unwrap();
        let n = s.create_note("Synthetic".into(), None).unwrap();
        deny_batch(&s.root, [n.id.clone()], []).unwrap();
        assert!(guidance(&s.root, Some(&json!({"guide":{}}))).is_err());
        fs::write(s.root.join(FILE), b"PRIVATE_MALFORMED_CANARY").unwrap();
        assert_eq!(ensure_note(&s.root, &n.id).unwrap_err(), INVALID);
        fs::remove_file(s.root.join(FILE)).unwrap();
        assert_eq!(ensure_note(&s.root, &n.id).unwrap_err(), INVALID);
    }
}
