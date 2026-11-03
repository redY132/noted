//! Versioned, inert document data. Neither validation nor indexing runs scripts.
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::collections::{HashMap, HashSet};

type Result<T> = std::result::Result<T, String>;
pub const MAX_OBJECTS: usize = 100_000;

fn object<'a>(v: &'a Value, name: &str) -> Result<&'a Map<String, Value>> {
    v.as_object()
        .ok_or_else(|| format!("{name} must be an object"))
}
fn keys(v: &Value, allowed: &[&str]) -> Result<()> {
    if object(v, "Document value")?
        .keys()
        .any(|k| !allowed.contains(&k.as_str()))
    {
        return Err("Unknown document field".into());
    }
    Ok(())
}
fn id(v: &Value) -> Result<&str> {
    v.as_str()
        .filter(|s| {
            !s.is_empty()
                && s.len() <= 200
                && !["__proto__", "prototype", "constructor"].contains(s)
                && !s.chars().any(char::is_control)
        })
        .ok_or_else(|| "Invalid content identifier".into())
}
fn bounded_json(v: &Value, limit: usize) -> Result<()> {
    fn depth(v: &Value, n: usize) -> bool {
        if n > 32 {
            return false;
        }
        match v {
            Value::Array(a) => a.iter().all(|v| depth(v, n + 1)),
            Value::Object(a) => a.values().all(|v| depth(v, n + 1)),
            _ => true,
        }
    }
    if !depth(v, 0) || serde_json::to_vec(v).map_err(|e| e.to_string())?.len() > limit {
        return Err("Component data exceeds its size or nesting limit".into());
    }
    Ok(())
}
pub fn schema_reference(v: &Value) -> Result<()> {
    if v.is_null() {
        return Ok(());
    }
    keys(v, &["id", "version"])?;
    let s = v["id"].as_str().ok_or("Schema identifier required")?;
    if s.is_empty()
        || s.len() > 80
        || !s.as_bytes()[0].is_ascii_alphanumeric()
        || !s
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"_.-".contains(&b))
        || !v["version"].as_u64().is_some_and(|n| n > 0)
    {
        return Err("Invalid schema reference".into());
    }
    Ok(())
}
const SCHEMA_KEYS: &[&str] = &[
    "fontFamily",
    "fontSize",
    "lineHeight",
    "color",
    "spacing",
    "indent",
];
pub fn schema_policy(v: &Value) -> Result<()> {
    if v.is_null() {
        return Ok(());
    }
    keys(v, &["mode", "enabledRules"])?;
    if !v["mode"]
        .as_str()
        .is_some_and(|m| ["suggest", "automatic"].contains(&m))
    {
        return Err("Invalid schema policy".into());
    }
    let rules = v["enabledRules"]
        .as_array()
        .ok_or("Schema rules required")?;
    let mut seen = HashSet::new();
    if !rules.iter().all(|r| {
        r.as_str()
            .is_some_and(|s| SCHEMA_KEYS.contains(&s) && seen.insert(s))
    }) {
        return Err("Invalid schema rules".into());
    }
    Ok(())
}
pub fn schema_style(v: &Value) -> Result<()> {
    if v.is_null() {
        return Ok(());
    }
    keys(v, SCHEMA_KEYS)?;
    for (k, v) in object(v, "Schema style")? {
        let ok = match k.as_str() {
            "fontFamily" => v
                .as_str()
                .is_some_and(|s| ["system", "serif", "mono"].contains(&s)),
            "fontSize" => v.as_u64().is_some_and(|n| (10..=96).contains(&n)),
            "lineHeight" => v.as_f64().is_some_and(|n| (1.0..=3.0).contains(&n)),
            "color" => {
                v.is_null()
                    || v.as_str().is_some_and(|s| {
                        s.len() == 7
                            && s.starts_with('#')
                            && s[1..].bytes().all(|b| b.is_ascii_hexdigit())
                    })
            }
            "spacing" => v.as_u64().is_some_and(|n| n <= 96),
            "indent" => v.as_u64().is_some_and(|n| n <= 8),
            _ => false,
        };
        if !ok {
            return Err(format!("Invalid schema style: {k}"));
        }
    }
    Ok(())
}
/// Presentation values are data, never arbitrary CSS or executable strings.
pub fn style(v: &Value) -> Result<()> {
    for (k, v) in object(v, "Presentation style")? {
        let ok = match k.as_str() {
            "width" => v.as_u64().is_some_and(|n| (160..=1200).contains(&n)),
            "x" | "y" => v.as_u64().is_some_and(|n| n <= 100_000),
            "z" => v.as_u64().is_some_and(|n| n <= 10_000),
            "padding" | "gap" => v.as_u64().is_some_and(|n| n <= 256),
            "gridColumns" => v.as_u64().is_some_and(|n| (1..=12).contains(&n)),
            "placement" => v.as_str().is_some_and(|s| ["flow", "free"].contains(&s)),
            "align" => v
                .as_str()
                .is_some_and(|s| ["left", "center", "right"].contains(&s)),
            "tone" => v
                .as_str()
                .is_some_and(|s| ["plain", "soft", "accent"].contains(&s)),
            "animation" => v
                .as_str()
                .is_some_and(|s| ["none", "fade", "float", "pulse"].contains(&s)),
            _ => false,
        };
        if !ok {
            return Err(format!(
                "Unregistered or invalid presentation property: {k}"
            ));
        }
    }
    Ok(())
}

pub fn validate(document: &Value) -> Result<()> {
    keys(
        document,
        &[
            "version",
            "objects",
            "readingOrder",
            "layout",
            "styles",
            "schemaRef",
            "schemaPolicy",
            "componentRefs",
        ],
    )?;
    if document["version"] != 2 {
        return Err("Unsupported document version".into());
    }
    let objects = object(&document["objects"], "Content objects")?;
    if objects.is_empty() || objects.len() > MAX_OBJECTS {
        return Err("Invalid content object count".into());
    }
    for (key, item) in objects {
        if id(&item["id"])? != key {
            return Err("Content identity mismatch".into());
        }
        match item["kind"].as_str().ok_or("Content kind required")? {
            "richText" => {
                keys(item, &["id", "kind", "content"])?;
                let mut ids = HashSet::new();
                crate::store::validate_node(&item["content"], 1, &mut ids)?;
                if item["content"]["type"] == "doc" || item["content"]["type"] == "notePanel" {
                    return Err("Rich text objects must contain one ordinary block".into());
                }
            }
            "image" => {
                keys(item, &["id", "kind", "assetId", "alt", "href"])?;
                crate::store::valid_id(
                    item["assetId"]
                        .as_str()
                        .ok_or("Asset identifier required")?,
                )?;
                if !item["alt"]
                    .as_str()
                    .is_some_and(|s| s.chars().count() <= 2000)
                {
                    return Err("Invalid image alternative text".into());
                }
                if let Some(href) = item.get("href") {
                    validate_href(href)?;
                }
            }
            "component" => {
                keys(
                    item,
                    &["id", "kind", "definition", "props", "state", "fallback"],
                )?;
                schema_reference(&item["definition"])?;
                if item["definition"].is_null() {
                    return Err("Component definition reference required".into());
                }
                object(&item["props"], "Component properties")?;
                object(&item["state"], "Component state")?;
                bounded_json(&item["props"], 64 * 1024)?;
                bounded_json(&item["state"], 64 * 1024)?;
                if !item["fallback"]
                    .as_str()
                    .is_some_and(|s| s.len() <= 16 * 1024)
                {
                    return Err("Accessible component fallback required".into());
                }
            }
            _ => return Err("Unsupported content kind".into()),
        }
    }
    let order = document["readingOrder"]
        .as_array()
        .ok_or("Logical reading order required")?;
    let mut ordered = HashSet::new();
    for item in order {
        let i = id(item)?;
        if !objects.contains_key(i) || !ordered.insert(i) {
            return Err("Reading order must reference every object exactly once".into());
        }
    }
    if ordered.len() != objects.len() {
        return Err("Reading order omits content".into());
    }
    let mut used = HashSet::new();
    let mut layout_ids = HashSet::new();
    fn layout<'a>(
        n: &'a Value,
        objects: &Map<String, Value>,
        used: &mut HashSet<&'a str>,
        ids: &mut HashSet<String>,
        depth: usize,
    ) -> Result<()> {
        if depth > 32 {
            return Err("Layout nesting exceeds 32 levels".into());
        }
        keys(n, &["id", "kind", "children", "contentId", "style"])?;
        if !ids.insert(id(&n["id"])?.to_owned()) {
            return Err("Duplicate layout identifier".into());
        }
        if let Some(s) = n.get("style") {
            style(s)?;
        }
        match n["kind"].as_str() {
            Some("item") => {
                let c = id(&n["contentId"])?;
                if n.get("children").is_some() || !objects.contains_key(c) || !used.insert(c) {
                    return Err("Duplicate or missing layout content reference".into());
                }
            }
            Some("free" | "column" | "row" | "grid") => {
                if n.get("contentId").is_some() {
                    return Err("Containers cannot duplicate content references".into());
                }
                for child in n["children"]
                    .as_array()
                    .ok_or("Container children required")?
                {
                    layout(child, objects, used, ids, depth + 1)?;
                }
            }
            _ => return Err("Unsupported layout kind".into()),
        };
        Ok(())
    }
    layout(&document["layout"], objects, &mut used, &mut layout_ids, 0)?;
    if used.len() != objects.len() {
        return Err("Layout omits content".into());
    }
    if document["layout"]["kind"] != "free" || document["layout"]["id"] != "root" {
        return Err("The document needs a free-placement root".into());
    }
    for (target, s) in object(&document["styles"], "Document styles")? {
        if !objects.contains_key(target) {
            return Err("Style target is missing".into());
        }
        style(s)?;
    }
    if let Some(v) = document.get("schemaRef") {
        schema_reference(v)?;
    }
    if let Some(v) = document.get("schemaPolicy") {
        schema_policy(v)?;
    }
    if let Some(refs) = document.get("componentRefs") {
        for r in refs
            .as_array()
            .ok_or("Component references must be an array")?
        {
            schema_reference(r)?;
        }
    }
    // Validate the editor projection too: this detects IDs duplicated between
    // separate rich-text blocks and structural incompatibility before a save.
    let mut all_ids = HashSet::new();
    crate::store::validate_node(&project(document)?, 0, &mut all_ids)?;
    Ok(())
}
pub fn validate_href(value: &Value) -> Result<()> {
    if value.is_null() {
        return Ok(());
    }
    let s = value.as_str().ok_or("Invalid image link")?;
    if s.len() > 2048 || s.chars().any(|c| c.is_whitespace() || c.is_control()) {
        return Err("Invalid image link".into());
    }
    if let Some(id) = s.strip_prefix("noted://note/") {
        return crate::store::valid_id(id);
    }
    if s.strip_prefix("https://")
        .or_else(|| s.strip_prefix("http://"))
        .is_some_and(|tail| !tail.split(['/', '?', '#']).next().unwrap_or("").is_empty())
    {
        Ok(())
    } else {
        Err("Invalid image link".into())
    }
}

fn deterministic(note: &str, path: &str) -> String {
    let mut a = 2_166_136_261u32;
    let mut b = 0x9e3779b9u32;
    for c in format!("{note}:{path}").encode_utf16() {
        a = (a ^ u32::from(c)).wrapping_mul(16_777_619);
        b = (b ^ u32::from(c)).wrapping_mul(2_246_822_519);
    }
    format!("legacy-{a:08x}{b:08x}")
}
/// Migration is in memory. Existing IDs and every authored block are retained.
pub fn migrate(note_id: &str, content: &Value) -> Value {
    let mut objects = Map::new();
    let mut order = Vec::new();
    fn visit(
        note_id: &str,
        node: &Value,
        path: &str,
        objects: &mut Map<String, Value>,
        order: &mut Vec<Value>,
    ) -> Value {
        let kind = node["type"].as_str().unwrap_or("");
        let cid = node
            .pointer("/attrs/id")
            .and_then(Value::as_str)
            .filter(|s| !s.is_empty())
            .map(str::to_owned)
            .unwrap_or_else(|| deterministic(note_id, path));
        let mut s = Map::new();
        if let Some(attrs) = node["attrs"].as_object() {
            for key in [
                "width",
                "align",
                "tone",
                "placement",
                "x",
                "y",
                "z",
                "animation",
                "padding",
                "gap",
                "gridColumns",
            ] {
                if let Some(v) = attrs.get(key) {
                    s.insert(key.into(), v.clone());
                }
            }
        }
        if kind == "notePanel" {
            let children = node["content"]
                .as_array()
                .map(|a| {
                    a.iter()
                        .enumerate()
                        .map(|(i, n)| visit(note_id, n, &format!("{path}.{i}"), objects, order))
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default();
            return json!({"id":cid,"kind":node.pointer("/attrs/layoutKind").and_then(Value::as_str).unwrap_or("column"),"style":s,"children":children});
        }
        let value = match kind {
            "localImage" => {
                let mut v = json!({"id":cid,"kind":"image","assetId":node["attrs"]["assetId"],"alt":node["attrs"]["alt"].as_str().unwrap_or("")});
                if let Some(h) = node["attrs"].get("href") {
                    v["href"] = h.clone();
                }
                v
            }
            "interactiveComponent" => {
                json!({"id":cid,"kind":"component","definition":{"id":node["attrs"]["definitionId"],"version":node["attrs"]["definitionVersion"]},"props":node["attrs"]["properties"],"state":node["attrs"]["state"],"fallback":node["attrs"]["fallback"]})
            }
            _ => {
                let mut block = node.clone();
                add_ids(&mut block, note_id, path);
                json!({"id":cid,"kind":"richText","content":block})
            }
        };
        objects.insert(cid.clone(), value);
        order.push(json!(cid));
        let mut item = json!({"id":format!("layout-{cid}"),"kind":"item","contentId":cid});
        if !s.is_empty() {
            item["style"] = json!(s);
        }
        item
    }
    let children = content["content"]
        .as_array()
        .map(|a| {
            a.iter()
                .enumerate()
                .map(|(i, n)| visit(note_id, n, &format!("0.{i}"), &mut objects, &mut order))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let mut result = json!({"version":2,"objects":objects,"readingOrder":order,"layout":{"id":"root","kind":"free","children":children},"styles":{}});
    if let Some(v) = content.pointer("/attrs/schemaReference") {
        if !v.is_null() {
            result["schemaRef"] = v.clone();
        }
    }
    if let Some(v) = content.pointer("/attrs/schemaPolicy") {
        if !v.is_null() {
            result["schemaPolicy"] = v.clone();
        }
    }
    result
}
fn add_ids(node: &mut Value, note: &str, path: &str) {
    if !["doc", "text", "hardBreak"].contains(&node["type"].as_str().unwrap_or(""))
        && node
            .pointer("/attrs/id")
            .is_none_or(|v| v.is_null() || v.as_str() == Some(""))
    {
        let attrs = node
            .as_object_mut()
            .unwrap()
            .entry("attrs")
            .or_insert_with(|| json!({}));
        attrs["id"] = json!(deterministic(note, path));
    }
    if let Some(children) = node.get_mut("content").and_then(Value::as_array_mut) {
        for (i, c) in children.iter_mut().enumerate() {
            add_ids(c, note, &format!("{path}.{i}"));
        }
    }
}

pub fn project(document: &Value) -> Result<Value> {
    let objects = object(&document["objects"], "Content objects")?;
    fn node(n: &Value, objects: &Map<String, Value>, styles: &Value) -> Result<Value> {
        let mut attrs = n
            .get("style")
            .and_then(Value::as_object)
            .cloned()
            .unwrap_or_default();
        if n["kind"] == "item" {
            let cid = id(&n["contentId"])?;
            let o = objects.get(cid).ok_or("Missing content object")?;
            if let Some(s) = styles.get(cid).and_then(Value::as_object) {
                attrs.extend(s.clone());
            }
            match o["kind"].as_str() {
                Some("richText") => {
                    let mut r = o["content"].clone();
                    attrs.insert("id".into(), json!(cid));
                    r.as_object_mut()
                        .ok_or("Rich text required")?
                        .entry("attrs")
                        .or_insert_with(|| json!({}))
                        .as_object_mut()
                        .ok_or("Invalid attributes")?
                        .extend(attrs);
                    Ok(r)
                }
                Some("image") => {
                    attrs.insert("id".into(), json!(cid));
                    attrs.insert("assetId".into(), o["assetId"].clone());
                    attrs.insert("alt".into(), o["alt"].clone());
                    if let Some(h) = o.get("href") {
                        attrs.insert("href".into(), h.clone());
                    }
                    Ok(json!({"type":"localImage","attrs":attrs}))
                }
                Some("component") => {
                    attrs.insert("id".into(), json!(cid));
                    attrs.insert("definitionId".into(), o["definition"]["id"].clone());
                    attrs.insert(
                        "definitionVersion".into(),
                        o["definition"]["version"].clone(),
                    );
                    attrs.insert("properties".into(), o["props"].clone());
                    attrs.insert("state".into(), o["state"].clone());
                    attrs.insert("fallback".into(), o["fallback"].clone());
                    Ok(json!({"type":"interactiveComponent","attrs":attrs}))
                }
                _ => Err("Unsupported content object".into()),
            }
        } else {
            attrs.insert("id".into(), n["id"].clone());
            attrs.insert("layoutKind".into(), n["kind"].clone());
            let children = n["children"]
                .as_array()
                .ok_or("Layout children required")?
                .iter()
                .map(|n| node(n, objects, styles))
                .collect::<Result<Vec<_>>>()?;
            Ok(json!({"type":"notePanel","attrs":attrs,"content":children}))
        }
    }
    let children = document["layout"]["children"]
        .as_array()
        .ok_or("Canvas children required")?
        .iter()
        .map(|n| node(n, objects, &document["styles"]))
        .collect::<Result<Vec<_>>>()?;
    let mut attrs = json!({"readingOrder":document["readingOrder"]});
    if let Some(v) = document.get("schemaRef") {
        attrs["schemaReference"] = v.clone();
    }
    if let Some(v) = document.get("schemaPolicy") {
        attrs["schemaPolicy"] = v.clone();
    }
    Ok(json!({"type":"doc","attrs":attrs,"content":children}))
}

/// Iterate logical blocks, independent of their visual grouping or placement.
pub fn logical_blocks(document: &Value) -> Vec<Value> {
    logical_blocks_at(document, None)
}
pub fn logical_blocks_at(document: &Value, root: Option<&std::path::Path>) -> Vec<Value> {
    document["readingOrder"].as_array().into_iter().flatten().filter_map(|id|document["objects"].get(id.as_str()?)).map(|o| match o["kind"].as_str(){Some("richText")=>o["content"].clone(),Some("image")=>json!({"type":"localImage","attrs":{"assetId":o["assetId"],"alt":o["alt"],"href":o.get("href").unwrap_or(&Value::Null)}}),_=>{
        let mut text=o["fallback"].as_str().unwrap_or("").to_owned();
        if let Some(root)=root {for value in crate::definitions::search_text(root,&o["definition"],&o["props"]){text.push('\n');text.push_str(&value);}}
        json!({"type":"paragraph","content":[{"type":"text","text":text}]})
    }}).collect()
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "camelCase")]
pub enum Permission {
    Formatting,
    Arrangement,
    Reorganization,
    Content,
    ComponentState,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase", deny_unknown_fields)]
pub enum Operation {
    Format {
        id: String,
        content: Value,
    },
    Style {
        id: String,
        properties: Value,
    },
    Arrange {
        layout: Value,
    },
    Reorder {
        #[serde(rename = "readingOrder")]
        reading_order: Vec<String>,
    },
    Edit {
        id: String,
        object: Value,
    },
    State {
        id: String,
        state: Value,
    },
    Insert {
        object: Value,
        parent: String,
        index: usize,
        #[serde(rename = "readingIndex")]
        reading_index: usize,
    },
    Remove {
        id: String,
    },
}
#[derive(Clone)]
pub struct Grant {
    pub note_id: String,
    pub revision: u64,
    pub token: String,
    pub permissions: HashSet<Permission>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Preview {
    pub document: Value,
    pub content: Value,
    pub base_revision: u64,
}

fn authored_signature(n: &Value) -> Value {
    let text_block = n["type"] == "paragraph" || n["type"] == "heading";
    let mut attrs = n["attrs"].as_object().cloned().unwrap_or_default();
    if text_block {
        for key in ["level", "indent", "textAlign", "schemaStyle", "schemaRef"] {
            attrs.remove(key);
        }
    }
    let links: Vec<Value> = n["marks"]
        .as_array()
        .into_iter()
        .flatten()
        .filter(|mark| mark["type"] == "link")
        .cloned()
        .collect();
    let children: Vec<Value> = n["content"]
        .as_array()
        .into_iter()
        .flatten()
        .map(authored_signature)
        .collect();
    json!([
        if text_block {
            json!("textBlock")
        } else {
            n["type"].clone()
        },
        if n["type"] == "text" {
            n["text"].clone()
        } else {
            Value::Null
        },
        attrs,
        links,
        children
    ])
}
fn component_snapshots(value: &Value) -> HashMap<String, (Value, Value)> {
    fn walk(n: &Value, path: &str, result: &mut HashMap<String, (Value, Value)>) {
        if n["type"] == "interactiveComponent" {
            let key = n
                .pointer("/attrs/id")
                .and_then(Value::as_str)
                .unwrap_or(path)
                .to_owned();
            result.insert(key,(json!({"id":n["attrs"]["definitionId"],"version":n["attrs"]["definitionVersion"]}),n["attrs"]["state"].clone()));
        }
        if let Some(c) = n["content"].as_array() {
            for (i, n) in c.iter().enumerate() {
                walk(n, &format!("{path}.{i}"), result);
            }
        }
    }
    let mut result = HashMap::new();
    if value["kind"] == "component" {
        result.insert(
            value["id"].as_str().unwrap_or("").into(),
            (value["definition"].clone(), value["state"].clone()),
        );
    } else if value["kind"] == "richText" {
        walk(&value["content"], "0", &mut result);
    }
    result
}
pub fn apply(
    document: &Value,
    operations: &[Operation],
    permissions: &HashSet<Permission>,
) -> Result<Value> {
    if operations.is_empty() || operations.len() > 1000 {
        return Err("An operation batch needs 1–1000 operations".into());
    }
    let mut next = document.clone();
    for op in operations {
        let required = match op {
            Operation::Format { .. } => Permission::Formatting,
            Operation::Style { properties, .. } => {
                if properties.as_object().is_some_and(|p| {
                    p.keys().any(|k| {
                        [
                            "width",
                            "placement",
                            "x",
                            "y",
                            "z",
                            "padding",
                            "gap",
                            "gridColumns",
                        ]
                        .contains(&k.as_str())
                    })
                }) {
                    Permission::Arrangement
                } else {
                    Permission::Formatting
                }
            }
            Operation::Arrange { .. } => Permission::Arrangement,
            Operation::Reorder { .. } => Permission::Reorganization,
            Operation::Edit { .. } => Permission::Content,
            Operation::State { .. } => Permission::ComponentState,
            Operation::Insert { .. } | Operation::Remove { .. } => Permission::Content,
        };
        if !permissions.contains(&required) {
            return Err(format!("Permission not granted: {required:?}"));
        }
        if matches!(op, Operation::Insert { .. } | Operation::Remove { .. })
            && (!permissions.contains(&Permission::Arrangement)
                || !permissions.contains(&Permission::Reorganization))
        {
            return Err("Inserting or removing objects requires content, arrangement and reorganization permissions".into());
        }
        match op {
            Operation::Format { id, content } => {
                let o = next["objects"].get_mut(id).ok_or("Missing format target")?;
                if o["kind"] != "richText"
                    || authored_signature(&o["content"]) != authored_signature(content)
                {
                    return Err(
                        "Formatting must preserve exact authored text, links, assets and IDs"
                            .into(),
                    );
                }
                o["content"] = content.clone();
            }
            Operation::Style { id, properties } => {
                style(properties)?;
                if next["objects"].get(id).is_none() {
                    return Err("Missing style target".into());
                }
                let styles = next["styles"].as_object_mut().ok_or("Styles required")?;
                let target = styles.entry(id.clone()).or_insert_with(|| json!({}));
                target
                    .as_object_mut()
                    .ok_or("Invalid existing style")?
                    .extend(properties.as_object().unwrap().clone());
            }
            Operation::Arrange { layout } => {
                next["layout"] = layout.clone();
            }
            Operation::Reorder { reading_order } => {
                next["readingOrder"] = json!(reading_order);
            }
            Operation::Edit { id, object } => {
                if next["objects"].get(id).is_none() || object["id"] != *id {
                    return Err("Missing or mismatched content target".into());
                }
                let existing = component_snapshots(&next["objects"][id]);
                for (key, (definition, state)) in component_snapshots(object) {
                    let Some((old_definition, old_state)) = existing.get(&key) else {
                        return Err("A content proposal cannot activate component code".into());
                    };
                    if definition != *old_definition {
                        return Err("Component code versions require explicit user approval".into());
                    }
                    if state != *old_state && !permissions.contains(&Permission::ComponentState) {
                        return Err("Component state permission required".into());
                    }
                }
                next["objects"][id] = object.clone();
            }
            Operation::State { id, state } => {
                object(state, "Component state")?;
                bounded_json(state, 64 * 1024)?;
                let o = next["objects"].get_mut(id).ok_or("Missing component")?;
                if o["kind"] != "component" {
                    return Err("State target is not a component".into());
                }
                o["state"] = state.clone();
            }
            Operation::Insert {
                object,
                parent,
                index,
                reading_index,
            } => {
                let cid = id(&object["id"])?.to_owned();
                if next["objects"].get(&cid).is_some() {
                    return Err("Content identifier already exists".into());
                }
                if !component_snapshots(object).is_empty() {
                    return Err("Document proposals cannot activate component code".into());
                }
                let order = next["readingOrder"]
                    .as_array_mut()
                    .ok_or("Reading order required")?;
                if *reading_index > order.len() {
                    return Err("Reading order insertion index is outside the document".into());
                }
                order.insert(*reading_index, json!(cid));
                fn insert(n: &mut Value, parent: &str, index: usize, cid: &str) -> Result<bool> {
                    if n["id"] == parent {
                        if n["kind"] == "item" {
                            return Err("Insertion parent must be a layout container".into());
                        }
                        let children = n["children"]
                            .as_array_mut()
                            .ok_or("Container children required")?;
                        if index > children.len() {
                            return Err("Layout insertion index is outside its container".into());
                        }
                        children.insert(
                            index,
                            json!({"id":format!("layout-{cid}"),"kind":"item","contentId":cid}),
                        );
                        return Ok(true);
                    }
                    if let Some(children) = n.get_mut("children").and_then(Value::as_array_mut) {
                        for n in children {
                            if insert(n, parent, index, cid)? {
                                return Ok(true);
                            }
                        }
                    }
                    Ok(false)
                }
                if !insert(&mut next["layout"], parent, *index, &cid)? {
                    return Err("Insertion parent does not exist".into());
                }
                next["objects"]
                    .as_object_mut()
                    .ok_or("Content objects required")?
                    .insert(cid, object.clone());
            }
            Operation::Remove { id } => {
                if next["objects"]
                    .as_object_mut()
                    .ok_or("Content objects required")?
                    .remove(id)
                    .is_none()
                {
                    return Err("Removal target does not exist".into());
                }
                next["styles"]
                    .as_object_mut()
                    .ok_or("Styles required")?
                    .remove(id);
                next["readingOrder"]
                    .as_array_mut()
                    .ok_or("Reading order required")?
                    .retain(|v| v != id);
                fn remove(n: &mut Value, id: &str) {
                    if let Some(children) = n.get_mut("children").and_then(Value::as_array_mut) {
                        children.retain(|v| v["contentId"] != id);
                        for child in children {
                            remove(child, id);
                        }
                    }
                }
                remove(&mut next["layout"], id);
            }
        }
    }
    validate(&next)?;
    // Presentation cannot hide content outside a reachable, scrolling canvas.
    // Width/coordinates are bounded by style validation; clipping/opacity/CSS
    // transforms are deliberately absent from the registered property set.
    if operations
        .iter()
        .any(|op| matches!(op, Operation::Arrange { .. }) || matches!(op,Operation::Style{properties,..} if properties.as_object().is_some_and(|p|p.keys().any(|k|["width","placement","x","y","z","padding","gap","gridColumns"].contains(&k.as_str())))))
    {
        validate_arrangement(&next)?;
    }
    Ok(next)
}

/// Conservative trusted proposal check. Human-authored overlap remains legal
/// through ordinary editing, but an automated arrangement cannot obscure a
/// content box. No clipping, opacity, transforms or arbitrary CSS are exposed.
fn validate_arrangement(document: &Value) -> Result<()> {
    #[derive(Clone)]
    struct Rect {
        x: f64,
        y: f64,
        w: f64,
        h: f64,
        group: String,
    }
    fn walk(
        n: &Value,
        doc: &Value,
        x: f64,
        y: f64,
        group: &str,
        rects: &mut Vec<Rect>,
    ) -> Result<()> {
        let mut s = n.get("style").cloned().unwrap_or_else(|| json!({}));
        if n["kind"] == "item" {
            if let Some(overrides) =
                doc["styles"][n["contentId"].as_str().unwrap_or("")].as_object()
            {
                s.as_object_mut()
                    .ok_or("Invalid style")?
                    .extend(overrides.clone());
            }
        }
        let free = s["placement"] == "free";
        let nx = x + if free {
            s["x"].as_f64().unwrap_or(0.0)
        } else {
            0.0
        };
        let ny = y + if free {
            s["y"].as_f64().unwrap_or(0.0)
        } else {
            0.0
        };
        if nx > 100_000.0 || ny > 100_000.0 {
            return Err("Arrangement is outside the reachable canvas".into());
        }
        if free {
            let width = s["width"].as_f64().unwrap_or(640.0);
            let count = if n["kind"] == "item" || n["kind"] == "row" {
                1
            } else {
                n["children"].as_array().map(Vec::len).unwrap_or(1).max(1)
            };
            let height = 80.0 * count as f64
                + s["padding"].as_f64().unwrap_or(0.0) * 2.0
                + s["gap"].as_f64().unwrap_or(0.0) * (count - 1) as f64;
            if nx + width > 100_000.0 || ny + height > 100_000.0 {
                return Err("Arrangement extends outside the reachable canvas".into());
            }
            rects.push(Rect {
                x: nx,
                y: ny,
                w: width,
                h: height,
                group: group.into(),
            });
        }
        if let Some(c) = n["children"].as_array() {
            for c in c {
                walk(c, doc, nx, ny, n["id"].as_str().unwrap_or(group), rects)?;
            }
        }
        Ok(())
    }
    let mut rects = Vec::new();
    walk(&document["layout"], document, 0.0, 0.0, "root", &mut rects)?;
    rects.sort_by(|a, b| a.group.cmp(&b.group).then(a.x.total_cmp(&b.x)));
    for (i, a) in rects.iter().enumerate() {
        for b in rects.iter().skip(i + 1) {
            if a.group != b.group {
                break;
            }
            if b.x >= a.x + a.w {
                break;
            }
            let w = (a.x + a.w).min(b.x + b.w) - a.x.max(b.x);
            let h = ((a.y + a.h).min(b.y + b.h) - a.y.max(b.y)).max(0.0);
            if w * h >= 0.75 * (a.w * a.h).min(b.w * b.h) {
                return Err(
                    "Arrangement obscures content; separate overlapping items in the preview"
                        .into(),
                );
            }
        }
    }
    Ok(())
}

/// No untrusted payload can construct this in-memory capability map.
pub type Grants = HashMap<String, Grant>;

impl crate::store::Store {
    pub fn authorize_document_operations(
        &mut self,
        id: &str,
        scopes: Vec<Permission>,
    ) -> Result<String> {
        let note = self.load_note(id)?;
        if scopes.is_empty() || scopes.len() > 5 {
            return Err("Choose document permissions before authorizing a proposal".into());
        }
        if self.document_grants.len() >= 64 {
            self.document_grants.clear();
        }
        let grant_id = uuid::Uuid::new_v4().to_string();
        self.document_grants.insert(
            grant_id.clone(),
            Grant {
                note_id: id.into(),
                revision: note.revision,
                token: note.revision_token,
                permissions: scopes.into_iter().collect(),
            },
        );
        Ok(grant_id)
    }
    fn document_operation_preview(
        &self,
        id: &str,
        expected_revision: u64,
        revision_token: &str,
        operations: &[Operation],
        grant_id: &str,
    ) -> Result<(crate::store::Note, Preview)> {
        let grant = self
            .document_grants
            .get(grant_id)
            .ok_or("Document permission grant is missing or expired")?;
        let note = self.load_note(id)?;
        if grant.note_id != id
            || grant.revision != expected_revision
            || grant.token != revision_token
            || note.revision != expected_revision
            || note.revision_token != revision_token
        {
            return Err("Conflict: document or permissions changed; preview again".into());
        }
        let current = note
            .document
            .clone()
            .unwrap_or_else(|| migrate(id, &note.content));
        let document = apply(&current, operations, &grant.permissions)?;
        let content = project(&document)?;
        Ok((
            note,
            Preview {
                document,
                content,
                base_revision: expected_revision,
            },
        ))
    }
    pub fn preview_document_operations(
        &self,
        id: &str,
        expected_revision: u64,
        revision_token: &str,
        operations: &[Operation],
        grant_id: &str,
    ) -> Result<Preview> {
        self.document_operation_preview(id, expected_revision, revision_token, operations, grant_id)
            .map(|(_, p)| p)
    }
    pub fn apply_document_operations(
        &mut self,
        id: &str,
        expected_revision: u64,
        revision_token: &str,
        operations: &[Operation],
        grant_id: &str,
    ) -> Result<crate::store::Note> {
        let (mut note, preview) = self.document_operation_preview(
            id,
            expected_revision,
            revision_token,
            operations,
            grant_id,
        )?;
        note.format_version = 2;
        note.document = Some(preview.document);
        note.content = preview.content;
        let saved = self.save_note(note, expected_revision)?;
        self.document_grants.remove(grant_id);
        Ok(saved)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::Store;
    fn fixture() -> Value {
        json!({"type":"doc","content":[
            {"type":"heading","attrs":{"id":"existing-heading","level":2},"content":[{"type":"text","text":"Remember this","marks":[{"type":"bold"}]}]},
            {"type":"notePanel","attrs":{"id":"existing-box","placement":"free","x":1200,"y":900,"width":640},"content":[{"type":"paragraph","content":[{"type":"text","text":"Words and an internal link","marks":[{"type":"link","attrs":{"href":"noted://note/00000000-0000-0000-0000-000000000001"}}]}]}]},
            {"type":"localImage","attrs":{"id":"existing-image","assetId":"00000000-0000-0000-0000-000000000002","alt":"An old painting","href":"noted://note/00000000-0000-0000-0000-000000000003","placement":"free","x":2000,"y":1000}}
        ]})
    }
    #[test]
    fn migration_is_deterministic_preserves_existing_ids_and_logical_text() {
        let old = fixture();
        let doc = migrate("note", &old);
        validate(&doc).unwrap();
        assert_eq!(doc, migrate("note", &old));
        assert_eq!(
            doc["objects"]["existing-heading"]["content"],
            old["content"][0]
        );
        assert_eq!(doc["layout"]["children"][1]["id"], "existing-box");
        let projected = project(&doc).unwrap();
        assert_eq!(
            projected["content"][2]["attrs"]["assetId"],
            old["content"][2]["attrs"]["assetId"]
        );
        assert_eq!(
            migrate("note", &projected)["readingOrder"],
            doc["readingOrder"]
        );
        let blocks = logical_blocks(&doc);
        assert_eq!(
            blocks[1]["content"][0]["text"],
            "Words and an internal link"
        );
        let mut moved = doc.clone();
        moved["layout"]["children"]
            .as_array_mut()
            .unwrap()
            .reverse();
        validate(&moved).unwrap();
        assert_eq!(
            logical_blocks(&moved),
            blocks,
            "Visual arrangement never changes authored extraction"
        );
    }
    #[test]
    fn duplicate_missing_and_unsafe_layouts_are_rejected() {
        let base = migrate("note", &fixture());
        let mut duplicate = base.clone();
        let item = duplicate["layout"]["children"][0].clone();
        duplicate["layout"]["children"]
            .as_array_mut()
            .unwrap()
            .push(item);
        assert!(validate(&duplicate).is_err());
        let mut missing = base.clone();
        missing["layout"]["children"]
            .as_array_mut()
            .unwrap()
            .remove(0);
        assert!(validate(&missing).is_err());
        let mut order = base.clone();
        order["readingOrder"].as_array_mut().unwrap().reverse();
        validate(&order).unwrap();
        order["readingOrder"][0] = json!("missing");
        assert!(validate(&order).is_err());
        let mut css = base.clone();
        css["layout"]["style"] = json!({"overflow":"hidden","opacity":0});
        assert!(validate(&css).is_err());
        let mut geometry = base.clone();
        geometry["layout"]["children"][2]["style"]["x"] = json!(100_001);
        assert!(validate(&geometry).is_err());
    }
    #[test]
    fn formatting_permissions_preserve_words_links_assets_and_scripts() {
        let source = migrate("note", &fixture());
        let permissions = HashSet::from([Permission::Formatting]);
        let mut heading = source["objects"]["existing-heading"]["content"].clone();
        heading["attrs"]["level"] = json!(3);
        let valid = Operation::Format {
            id: "existing-heading".into(),
            content: heading.clone(),
        };
        assert!(apply(&source, &[valid], &permissions).is_ok());
        heading["content"][0]["text"] = json!("Changed words");
        assert!(apply(
            &source,
            &[Operation::Format {
                id: "existing-heading".into(),
                content: heading
            }],
            &permissions
        )
        .is_err());
        assert!(
            apply(
                &source,
                &[Operation::Style {
                    id: "existing-image".into(),
                    properties: json!({"x":300})
                }],
                &permissions
            )
            .is_err(),
            "Formatting does not grant arrangement"
        );
        assert!(apply(
            &source,
            &[Operation::Reorder {
                reading_order: vec![]
            }],
            &permissions
        )
        .is_err());
        let mut broken = source["objects"]["existing-heading"]["content"].clone();
        broken["content"] = json!([{"type":"interactiveComponent","attrs":{"id":"code","definitionId":"evil","definitionVersion":1,"properties":{},"state":{},"fallback":"Remember this"}}]);
        assert!(apply(
            &source,
            &[Operation::Format {
                id: "existing-heading".into(),
                content: broken
            }],
            &permissions
        )
        .is_err());
    }
    #[test]
    fn capabilities_revision_checks_and_bad_batches_do_not_change_files() {
        let temp = tempfile::tempdir().unwrap();
        let mut store = Store::open(temp.path()).unwrap();
        let note = store.create_note("Protected".into(), None).unwrap();
        let path = store.root.join("notes").join(format!("{}.json", note.id));
        let original = std::fs::read(&path).unwrap();
        let grant = store
            .authorize_document_operations(&note.id, vec![Permission::Formatting])
            .unwrap();
        let doc = migrate(&note.id, &note.content);
        let cid = doc["readingOrder"][0].as_str().unwrap();
        let mut format = doc["objects"][cid]["content"].clone();
        format["type"] = json!("heading");
        format["attrs"]["level"] = json!(2);
        let good = Operation::Format {
            id: cid.into(),
            content: format,
        };
        let bad = Operation::Reorder {
            reading_order: vec![],
        };
        assert!(store
            .apply_document_operations(
                &note.id,
                note.revision,
                &note.revision_token,
                &[good.clone(), bad],
                &grant
            )
            .is_err());
        assert_eq!(std::fs::read(&path).unwrap(), original);
        let preview = store
            .preview_document_operations(
                &note.id,
                note.revision,
                &note.revision_token,
                &[good.clone()],
                &grant,
            )
            .unwrap();
        assert_eq!(preview.base_revision, note.revision);
        assert_eq!(std::fs::read(&path).unwrap(), original);
        let saved = store
            .apply_document_operations(
                &note.id,
                note.revision,
                &note.revision_token,
                &[good.clone()],
                &grant,
            )
            .unwrap();
        assert_eq!(saved.format_version, 2);
        assert_eq!(saved.revision, 2);
        assert_eq!(
            std::fs::read(path.with_extension("pre-v2.json.bak")).unwrap(),
            original
        );
        assert!(store
            .apply_document_operations(
                &note.id,
                note.revision,
                &note.revision_token,
                &[good],
                &grant
            )
            .is_err());
        let mut latest = saved.clone();
        latest.title = "New title".into();
        store.save_note(latest, 2).unwrap();
        assert_eq!(
            std::fs::read(path.with_extension("pre-v2.json.bak")).unwrap(),
            original
        );
    }
    #[test]
    fn opening_and_reconciling_legacy_notes_never_rewrites_them() {
        let temp = tempfile::tempdir().unwrap();
        let (id, bytes);
        {
            let mut store = Store::open(temp.path()).unwrap();
            let note = store.create_note("Legacy".into(), None).unwrap();
            id = note.id;
            bytes = std::fs::read(store.root.join("notes").join(format!("{id}.json"))).unwrap();
        }
        let mut store = Store::open_cached(temp.path()).unwrap();
        store.start_reconcile().unwrap();
        while store.reconcile_batch(4).unwrap() {}
        let loaded = store.load_note(&id).unwrap();
        assert_eq!(loaded.format_version, 1);
        assert_eq!(
            std::fs::read(store.root.join("notes").join(format!("{id}.json"))).unwrap(),
            bytes
        );
    }
    #[test]
    fn unknown_components_and_saved_state_survive_without_execution() {
        let temp = tempfile::tempdir().unwrap();
        let mut store = Store::open(temp.path()).unwrap();
        let mut note = store
            .create_note("Unavailable widget".into(), None)
            .unwrap();
        let mut doc = migrate(&note.id, &note.content);
        let cid = doc["readingOrder"][0].as_str().unwrap().to_owned();
        doc["objects"][&cid] = json!({"id":cid,"kind":"component","definition":{"id":"not-installed","version":9},"props":{"question":"What matters?"},"state":{"count":4},"fallback":"Recoverable fallback"});
        note.format_version = 2;
        note.document = Some(doc);
        let saved = store.save_note(note, 1).unwrap();
        let loaded = store.load_note(&saved.id).unwrap();
        assert_eq!(loaded.document, saved.document);
        assert_eq!(store.search_notes("Recoverable").unwrap()[0].id, saved.id);
    }
    #[test]
    fn migration_backup_restores_the_original_note_without_losing_relationships() {
        let temp = tempfile::tempdir().unwrap();
        let id;
        {
            let mut store = Store::open(temp.path()).unwrap();
            let mut note = store.create_note("Original".into(), None).unwrap();
            let other = store.create_note("Connected".into(), None).unwrap();
            id = note.id.clone();
            store
                .set_relation(&id, &other.id, Some(true), None, None)
                .unwrap();
            note.format_version = 2;
            note.document = Some(migrate(&id, &note.content));
            store.save_note(note, 1).unwrap();
            let path = store.root.join("notes").join(format!("{id}.json"));
            let saved: Value = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
            assert!(
                saved.get("content").is_none(),
                "V2 files do not duplicate the editor projection"
            );
            assert_eq!(saved["document"]["version"], 2);
            assert_eq!(store.load_note(&id).unwrap().content["type"], "doc");
            let backup = std::fs::read(path.with_extension("pre-v2.json.bak")).unwrap();
            crate::store::atomic_write(&path, &backup).unwrap();
        }
        let store = Store::open(temp.path()).unwrap();
        assert_eq!(store.load_note(&id).unwrap().format_version, 1);
        assert_eq!(store.list_connections(&id, 0, 10).unwrap().items.len(), 1);
    }
    #[test]
    fn content_permission_cannot_activate_nested_code_or_change_component_state() {
        let mut source = migrate("note", &fixture());
        let id = "existing-heading";
        let mut edited = source["objects"][id].clone();
        edited["content"] = json!({"type":"blockquote","attrs":{"id":"existing-heading"},"content":[{"type":"interactiveComponent","attrs":{"id":"nested-code","definitionId":"counter","definitionVersion":1,"properties":{},"state":{"count":0},"fallback":"Counter"}}]});
        assert!(apply(
            &source,
            &[Operation::Edit {
                id: id.into(),
                object: edited
            }],
            &HashSet::from([Permission::Content])
        )
        .is_err());
        source["objects"][id] = json!({"id":id,"kind":"component","definition":{"id":"counter","version":1},"props":{},"state":{"count":0},"fallback":"Counter"});
        let mut edited = source["objects"][id].clone();
        edited["state"]["count"] = json!(1);
        assert!(apply(
            &source,
            &[Operation::Edit {
                id: id.into(),
                object: edited.clone()
            }],
            &HashSet::from([Permission::Content])
        )
        .is_err());
        assert!(apply(
            &source,
            &[Operation::Edit {
                id: id.into(),
                object: edited
            }],
            &HashSet::from([Permission::Content, Permission::ComponentState])
        )
        .is_ok());
    }
    #[test]
    fn insert_remove_batches_require_every_scope_and_leave_all_content_reachable() {
        let source = migrate("note", &fixture());
        let all = HashSet::from([
            Permission::Content,
            Permission::Arrangement,
            Permission::Reorganization,
        ]);
        let insert = Operation::Insert {
            object: json!({"id":"new-content","kind":"richText","content":{"type":"paragraph","attrs":{"id":"new-content"},"content":[{"type":"text","text":"New authored words"}]}}),
            parent: "root".into(),
            index: 0,
            reading_index: 1,
        };
        assert!(apply(
            &source,
            &[insert.clone()],
            &HashSet::from([Permission::Content])
        )
        .is_err());
        let added = apply(&source, &[insert.clone()], &all).unwrap();
        assert_eq!(added["readingOrder"][1], "new-content");
        assert_eq!(added["layout"]["children"][0]["contentId"], "new-content");
        assert!(apply(&added, &[insert], &all).is_err());
        let removed = apply(
            &added,
            &[Operation::Remove {
                id: "new-content".into(),
            }],
            &all,
        )
        .unwrap();
        assert_eq!(removed, source);
        let nested = source["layout"]["children"][1]["children"][0]["contentId"]
            .as_str()
            .unwrap()
            .to_owned();
        assert!(
            apply(&source, &[Operation::Remove { id: nested.clone() }], &all).is_err(),
            "An empty container needs explicit arrangement in the same batch"
        );
        let mut pruned = source["layout"].clone();
        pruned["children"].as_array_mut().unwrap().remove(1);
        let batch = [
            Operation::Remove { id: nested },
            Operation::Arrange { layout: pruned },
        ];
        assert!(apply(&source, &batch, &all).is_ok());
        let single = migrate(
            "note",
            &json!({"type":"doc","content":[{"type":"paragraph","attrs":{"id":"only"}}]}),
        );
        assert!(apply(&single, &[Operation::Remove { id: "only".into() }], &all).is_err());
    }
    #[test]
    fn formatting_cannot_move_a_nested_image() {
        let pm = json!({"type":"doc","content":[{"type":"blockquote","attrs":{"id":"quote"},"content":[{"type":"localImage","attrs":{"id":"nested-image","assetId":"00000000-0000-0000-0000-000000000002","alt":"Keep this image","width":320,"placement":"flow","x":0,"y":0}}]}]});
        let source = migrate("note", &pm);
        let mut changed = source["objects"]["quote"]["content"].clone();
        changed["content"][0]["attrs"]["width"] = json!(640);
        assert!(apply(
            &source,
            &[Operation::Format {
                id: "quote".into(),
                content: changed
            }],
            &HashSet::from([Permission::Formatting])
        )
        .is_err());
    }
    #[test]
    fn arrangement_checks_include_style_overrides_and_full_canvas_extent() {
        let source = migrate(
            "note",
            &json!({"type":"doc","content":[{"type":"paragraph","attrs":{"id":"one"},"content":[{"type":"text","text":"One"}]},{"type":"paragraph","attrs":{"id":"two"},"content":[{"type":"text","text":"Two"}]}]}),
        );
        let scopes = HashSet::from([Permission::Arrangement]);
        assert!(apply(
            &source,
            &[Operation::Style {
                id: "one".into(),
                properties: json!({"placement":"free","x":99999,"y":0,"width":160})
            }],
            &scopes
        )
        .is_err());
        assert!(apply(
            &source,
            &[
                Operation::Style {
                    id: "one".into(),
                    properties: json!({"placement":"free","x":100,"y":100,"width":320})
                },
                Operation::Style {
                    id: "two".into(),
                    properties: json!({"placement":"free","x":100,"y":100,"width":320})
                }
            ],
            &scopes
        )
        .is_err());
    }
    #[test]
    fn formatting_cannot_change_task_state_or_restructure_authored_blocks() {
        let source = migrate(
            "note",
            &json!({"type":"doc","content":[{"type":"taskList","attrs":{"id":"tasks"},"content":[{"type":"taskItem","attrs":{"id":"task","checked":false},"content":[{"type":"paragraph","attrs":{"id":"body"},"content":[{"type":"text","text":"Keep the authored task"}]}]}]}]}),
        );
        let mut content = source["objects"]["tasks"]["content"].clone();
        content["content"][0]["attrs"]["checked"] = json!(true);
        assert!(apply(
            &source,
            &[Operation::Format {
                id: "tasks".into(),
                content
            }],
            &HashSet::from([Permission::Formatting])
        )
        .is_err());
    }
}
