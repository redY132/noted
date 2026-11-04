//! Immutable inert workspace libraries. Source is stored, never evaluated here.
use crate::store::{atomic_write, Store};
use serde_json::Value;
use std::{
    fs,
    path::{Path, PathBuf},
};
type Result<T> = std::result::Result<T, String>;
fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}
fn only(v: &Value, keys: &[&str]) -> bool {
    v.as_object()
        .is_some_and(|v| v.keys().all(|k| keys.contains(&k.as_str())))
}
fn version(v: &Value) -> Result<(&str, u64)> {
    let id = v["id"].as_str().ok_or("Definition ID required")?;
    let n = v["version"]
        .as_u64()
        .filter(|n| *n > 0)
        .ok_or("Definition version required")?;
    if id.is_empty()
        || id.len() > 80
        || !id.as_bytes()[0].is_ascii_alphanumeric()
        || !id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"_.-".contains(&b))
        || [
            "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7",
            "COM8", "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
        ]
        .contains(&id.to_ascii_uppercase().as_str())
    {
        return Err("Invalid definition ID".into());
    }
    Ok((id, n))
}
pub(crate) fn schema(v: &Value) -> Result<()> {
    version(v)?;
    if !only(
        v,
        &[
            "formatVersion",
            "id",
            "version",
            "name",
            "rules",
            "layout",
            "guide",
            "sourceNoteId",
        ],
    ) || ![Some(1), Some(2)].contains(&v["formatVersion"].as_u64())
        || !v["name"]
            .as_str()
            .is_some_and(|s| !s.trim().is_empty() && s.len() <= 100)
        || !only(
            &v["rules"],
            &[
                "body", "heading1", "heading2", "heading3", "heading4", "heading5", "heading6",
            ],
        )
        || v["rules"].get("body").is_none()
    {
        return Err("Invalid schema definition".into());
    }
    if let Some(id) = v.get("sourceNoteId") {
        crate::store::valid_id(id.as_str().ok_or("Invalid guide source")?)?;
    }
    if v["formatVersion"] == 1 && (v.get("layout").is_some() || v.get("guide").is_some()) {
        return Err("Layout and guidance require schema formatVersion 2".into());
    }
    if v.get("layout").is_some_and(|v| v != "free") {
        return Err("Unsupported schema layout policy".into());
    }
    if let Some(g) = v.get("guide") {
        if !only(g, &["title", "document"])
            || !g["title"]
                .as_str()
                .is_some_and(|s| !s.trim().is_empty() && s.len() <= 240)
            || serde_json::to_vec(&g["document"]).map_err(err)?.len() > 128 * 1024
        {
            return Err("Invalid or oversized full-document guide (128 KiB maximum)".into());
        }
        crate::document::validate(&g["document"])?;
        if g["document"]["objects"]
            .as_object()
            .is_some_and(|o| o.values().any(|v| v["kind"] == "component"))
        {
            return Err("Use a static guidance document without executable components".into());
        }
    }
    for s in v["rules"].as_object().unwrap().values() {
        crate::document::schema_style(s)?;
        if s.is_null() {
            return Err("Schema rule needs a style object".into());
        }
    }
    Ok(())
}
fn fields(v: &Value) -> Result<()> {
    let fields = v
        .as_object()
        .filter(|f| f.len() <= 64)
        .ok_or("Invalid component fields")?;
    for (id, f) in fields {
        if id.is_empty()
            || id.len() > 80
            || !id.as_bytes()[0].is_ascii_alphabetic()
            || !id
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b"_.-".contains(&b))
            || ["__proto__", "constructor", "prototype"].contains(&id.as_str())
            || !only(f, &["type", "label", "default", "min", "max", "choices"])
        {
            return Err("Invalid component field".into());
        }
        if !match f["type"].as_str() {
            Some("string") => f["default"].as_str().is_some_and(|s| s.len() <= 8192),
            Some("number") => f["default"].is_number(),
            Some("boolean") => f["default"].is_boolean(),
            _ => false,
        } {
            return Err("Component field default has the wrong type".into());
        }
        if f.get("label")
            .is_some_and(|v| !v.as_str().is_some_and(|s| s.len() <= 128))
            || f.get("min").is_some_and(|v| !v.is_number())
            || f.get("max").is_some_and(|v| !v.is_number())
            || f.get("choices").is_some_and(|v| {
                !v.as_array().is_some_and(|a| {
                    a.len() <= 64 && a.iter().all(|v| v.as_str().is_some_and(|s| s.len() <= 256))
                })
            })
        {
            return Err("Invalid component field constraints".into());
        }
    }
    Ok(())
}
pub(crate) fn component(v: &Value) -> Result<()> {
    if !only(v, &["manifest", "source"])
        || !v["source"]
            .as_str()
            .is_some_and(|s| !s.trim().is_empty() && s.len() <= 256 * 1024)
    {
        return Err("Invalid component source".into());
    }
    let m = &v["manifest"];
    version(m)?;
    if !only(
        m,
        &[
            "formatVersion",
            "id",
            "version",
            "name",
            "fallback",
            "properties",
            "persistentState",
            "transientState",
            "searchText",
            "bindings",
            "animationFps",
        ],
    ) || m["formatVersion"] != 1
        || !m["name"]
            .as_str()
            .is_some_and(|s| !s.is_empty() && s.len() <= 128)
        || !m["fallback"].as_str().is_some_and(|s| s.len() <= 8192)
    {
        return Err("Invalid component manifest".into());
    }
    for k in ["properties", "persistentState", "transientState"] {
        fields(&m[k])?;
    }
    if !m["searchText"].as_array().is_some_and(|a| {
        a.len() <= 64
            && a.iter().all(|v| {
                v.as_str()
                    .is_some_and(|k| m["properties"][k]["type"] == "string")
            })
    }) || m
        .get("animationFps")
        .is_some_and(|v| !v.as_f64().is_some_and(|n| (1.0..=30.0).contains(&n)))
        || m.get("bindings").is_some_and(|v| {
            !v.as_array().is_some_and(|a| {
                a.len() <= 64
                    && a.iter()
                        .all(|v| v.as_str().is_some_and(|s| !s.is_empty() && s.len() <= 200))
            })
        })
    {
        return Err("Invalid component text bindings or animation rate".into());
    }
    Ok(())
}
fn directory(path: &Path) -> Result<()> {
    fs::create_dir_all(path).map_err(err)?;
    let metadata = fs::symlink_metadata(path).map_err(err)?;
    if metadata.file_type().is_symlink()
        || !metadata.is_dir()
        || path.canonicalize().map_err(err)? != path
    {
        return Err("Definition directories cannot be redirected".into());
    }
    Ok(())
}
fn collection(root: &Path, kind: &str) -> Result<PathBuf> {
    let name = match kind {
        "schema" => "schemas",
        "component" => "components",
        _ => return Err("Unknown definition kind".into()),
    };
    let path = root.join(name);
    directory(&path)?;
    Ok(path)
}
fn validate<'a>(kind: &str, v: &'a Value) -> Result<(&'a str, u64)> {
    if serde_json::to_vec(v).map_err(err)?.len() > 512 * 1024 {
        return Err("Definition exceeds 512 KiB".into());
    }
    match kind {
        "schema" => {
            schema(v)?;
            version(v)
        }
        "component" => {
            component(v)?;
            version(&v["manifest"])
        }
        _ => Err("Unknown definition kind".into()),
    }
}
impl Store {
    pub fn save_document_definition(&self, kind: &str, definition: &Value) -> Result<Value> {
        let (id, version) = validate(kind, definition)?;
        let parent = collection(&self.root, kind)?.join(id);
        directory(&parent)?;
        let path = parent.join(format!("{version}.json"));
        if path.exists() {
            let previous = read(&path)?;
            if previous != *definition {
                return Err("Definition versions are immutable; publish a new version".into());
            }
            return Ok(previous);
        }
        atomic_write(&path, &serde_json::to_vec_pretty(definition).map_err(err)?)?;
        Ok(definition.clone())
    }
    pub fn list_document_definitions(&self, kind: &str) -> Result<Vec<Value>> {
        let path = collection(&self.root, kind)?;
        let mut values = Vec::new();
        for entry in fs::read_dir(path).map_err(err)? {
            let path = entry.map_err(err)?.path();
            let metadata = fs::symlink_metadata(&path).map_err(err)?;
            if metadata.file_type().is_symlink()
                || !metadata.is_dir()
                || path.canonicalize().map_err(err)? != path
            {
                continue;
            }
            for entry in fs::read_dir(path).map_err(err)? {
                let path = entry.map_err(err)?.path();
                if path.extension().and_then(|s| s.to_str()) != Some("json") {
                    continue;
                }
                // A damaged optional definition must not prevent unrelated
                // notes from opening. Its saved note payload remains an inert
                // recoverable placeholder until the definition is restored.
                let Ok(v) = read(&path) else { continue };
                if validate(kind, &v).is_err() {
                    continue;
                }
                values.push(v);
                if values.len() > 10_000 {
                    return Err("Definition library exceeds its 10,000-version limit".into());
                }
            }
        }
        Ok(values)
    }
}
fn read(path: &Path) -> Result<Value> {
    let m = fs::symlink_metadata(path).map_err(err)?;
    if !m.is_file() || m.file_type().is_symlink() || m.len() > 512 * 1024 {
        return Err("Invalid definition file".into());
    }
    serde_json::from_slice(&fs::read(path).map_err(err)?).map_err(err)
}
/// Inert declarative bindings only. Missing definitions retain fallback text.
pub(crate) fn search_text(root: &Path, reference: &Value, props: &Value) -> Vec<String> {
    let Ok((id, version)) = version(reference) else {
        return Vec::new();
    };
    let path = root.join("components").join(id);
    if path.canonicalize().ok().as_ref() != Some(&path) {
        return Vec::new();
    }
    let Ok(v) = read(&path.join(format!("{version}.json"))) else {
        return Vec::new();
    };
    if component(&v).is_err() {
        return Vec::new();
    }
    v["manifest"]["searchText"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|key| props.get(key.as_str()?)?.as_str().map(str::to_owned))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn immutable_versions_and_sources_survive_restart() {
        let temp = tempfile::tempdir().unwrap();
        let mut schema = json!({"formatVersion":1,"id":"study","version":1,"name":"Study","rules":{"body":{"fontSize":16,"spacing":12}}});
        let component = json!({"manifest":{"formatVersion":1,"id":"card","version":1,"name":"Card","fallback":"Flashcard","properties":{"question":{"type":"string","default":"Question"}},"persistentState":{},"transientState":{"flipped":{"type":"boolean","default":false}},"searchText":["question"]},"source":"({ render() { return {type:'text',text:'hello'}; } })"});
        {
            let store = Store::open(temp.path()).unwrap();
            store.save_document_definition("schema", &schema).unwrap();
            store
                .save_document_definition("component", &component)
                .unwrap();
            schema["rules"]["body"]["fontSize"] = json!(20);
            assert!(store.save_document_definition("schema", &schema).is_err());
            schema["version"] = json!(2);
            store.save_document_definition("schema", &schema).unwrap();
        }
        let store = Store::open(temp.path()).unwrap();
        fs::write(
            store.root.join("schemas").join("study").join("broken.json"),
            b"not json",
        )
        .unwrap();
        assert_eq!(store.list_document_definitions("schema").unwrap().len(), 2);
        assert_eq!(
            store.list_document_definitions("component").unwrap(),
            vec![component]
        );
        assert_eq!(
            search_text(
                &store.root,
                &json!({"id":"card","version":1}),
                &json!({"question":"Differently worded memory"})
            ),
            vec!["Differently worded memory"]
        );
    }
    #[test]
    fn invalid_definition_paths_and_executable_search_bindings_are_rejected() {
        let temp = tempfile::tempdir().unwrap();
        let store = Store::open(temp.path()).unwrap();
        for id in ["../escape", "a/b", "CON", "x ", ".."][..].iter() {
            let schema =
                json!({"formatVersion":1,"id":id,"version":1,"name":"Bad","rules":{"body":{}}});
            assert!(store.save_document_definition("schema", &schema).is_err());
        }
        assert!(store.list_document_definitions("../notes").is_err());
        let component = json!({"manifest":{"formatVersion":1,"id":"card","version":1,"name":"Card","fallback":"Flashcard","properties":{},"persistentState":{},"transientState":{},"searchText":["eval(secret)"]},"source":"while(true){}"});
        assert!(store
            .save_document_definition("component", &component)
            .is_err());
    }
}
