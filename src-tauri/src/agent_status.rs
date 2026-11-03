//! Local transient liveness, separate from sharing policy and cloud verification.
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::mpsc,
    thread,
    time::Duration,
};
fn directory(root: &Path) -> PathBuf {
    std::env::temp_dir()
        .join("noted-agent-status")
        .join(format!(
            "{:x}",
            Sha256::digest(
                root.canonicalize()
                    .unwrap_or_else(|_| root.to_path_buf())
                    .to_string_lossy()
                    .to_lowercase()
                    .as_bytes()
            )
        ))
}
#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub local_transport_active: bool,
    pub hosted_transport_active: bool,
    pub hosted_chat_verified: bool,
}
pub fn status(root: &Path) -> Status {
    let mut s = Status::default();
    let dir = directory(root);
    let Ok(entries) = fs::read_dir(dir) else {
        return s;
    };
    for entry in entries.take(100) {
        let Ok(entry) = entry else { continue };
        let path = entry.path();
        if crate::library::ordinary(&path, false).is_err()
            || fs::metadata(&path).map(|m| m.len() > 4096).unwrap_or(true)
        {
            continue;
        }
        let Ok(bytes) = fs::read(path) else { continue };
        let Ok(v) = serde_json::from_slice::<serde_json::Value>(&bytes) else {
            continue;
        };
        let Some(stamp) = v["seenAt"]
            .as_str()
            .and_then(|x| chrono::DateTime::parse_from_rfc3339(x).ok())
        else {
            continue;
        };
        let age = (chrono::Utc::now() - stamp.with_timezone(&chrono::Utc)).num_seconds();
        if !(0..=10).contains(&age) {
            continue;
        }
        if v["audience"] == "hosted" {
            s.hosted_transport_active = true;
        } else if v["audience"] == "local" {
            s.local_transport_active = true;
        }
    }
    s
}
pub struct Heartbeat {
    stop: mpsc::Sender<()>,
    thread: Option<thread::JoinHandle<()>>,
}
impl Heartbeat {
    pub fn start(root: &Path, hosted: bool) -> Option<Self> {
        let dir = directory(root);
        fs::create_dir_all(&dir).ok()?;
        crate::library::ordinary(&dir, true).ok()?;
        let path = dir.join(format!(
            "{}-{}.json",
            std::process::id(),
            uuid::Uuid::new_v4()
        ));
        let cleanup = path.clone();
        let (tx, rx) = mpsc::channel();
        let tick = move || {
            let v = serde_json::json!({"audience":if hosted{"hosted"}else{"local"},"seenAt":chrono::Utc::now().to_rfc3339()});
            let _ = crate::store::atomic_write(&path, &serde_json::to_vec(&v).unwrap());
        };
        tick();
        let handle = thread::spawn(move || {
            loop {
                match rx.recv_timeout(Duration::from_secs(3)) {
                    Err(mpsc::RecvTimeoutError::Timeout) => tick(),
                    _ => break,
                }
            }
            let _ = fs::remove_file(cleanup);
        });
        Some(Self {
            stop: tx,
            thread: Some(handle),
        })
    }
}
impl Drop for Heartbeat {
    fn drop(&mut self) {
        let _ = self.stop.send(());
        if let Some(t) = self.thread.take() {
            let _ = t.join();
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn liveness_never_claims_cloud_verification_and_disappears_on_close() {
        let t = tempfile::tempdir().unwrap();
        assert!(!status(t.path()).local_transport_active);
        let h = Heartbeat::start(t.path(), false).unwrap();
        assert!(status(t.path()).local_transport_active);
        assert!(!status(t.path()).hosted_chat_verified);
        drop(h);
        assert!(!status(t.path()).local_transport_active);
    }
}
