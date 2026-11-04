//! Local counts-only administrative CLI. Never print native error payloads.
use std::path::PathBuf;
fn run() -> Result<(String, noted_core::private_import::Summary), String> {
    let args: Vec<_> = std::env::args_os().skip(1).collect();
    if args.len() == 3 && args[0] == "--bundle" && args[2] == "--validate-only" {
        return Ok((
            "validated".into(),
            noted_core::private_import::validate_bundle(&PathBuf::from(&args[1]))?,
        ));
    }
    if args.len() == 5
        && args[0] == "--bundle"
        && args[2] == "--workspace"
        && args[4] == "--publish"
    {
        let mut s =
            noted_core::store::Store::open_cached(PathBuf::from(&args[3])).map_err(|e| {
                if e.contains("already open") {
                    "WORKSPACE_LOCKED".to_string()
                } else {
                    "WORKSPACE_UNAVAILABLE".to_string()
                }
            })?;
        return Ok((
            "imported".into(),
            s.import_private_bundle(&PathBuf::from(&args[1]))?,
        ));
    }
    if args.len() == 3 && args[0] == "--workspace" && args[2] == "--resume" {
        let mut s = noted_core::store::Store::open_private_recovery(PathBuf::from(&args[1]))
            .map_err(|_| "WORKSPACE_UNAVAILABLE")?;
        return Ok(("imported".into(), s.resume_private_import()?));
    }
    Err("INVALID_ARGUMENTS".into())
}
fn main() {
    let value = match run() {
        Ok((status, summary)) => {
            let mut v = serde_json::to_value(summary).unwrap();
            v["status"] = serde_json::json!(status);
            v["code"] = serde_json::json!("OK");
            v
        }
        Err(code) => {
            let safe = if !code.is_empty()
                && code.len() <= 100
                && code.bytes().all(|b| b.is_ascii_uppercase() || b == b'_')
            {
                code
            } else {
                "PRIVATE_IMPORT_FAILED".into()
            };
            serde_json::json!({"status":"blocked","code":safe,"imported":false})
        }
    };
    println!("{value}");
}
