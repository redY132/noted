//! Inert, request-scoped schema context. A guide is included only with per-use consent.
use serde_json::{json, Value};
use std::collections::HashSet;
type Result<T> = std::result::Result<T, String>;
pub fn context(schema: Option<Value>, include_guide: bool) -> Result<Option<Value>> {
    let Some(mut s) = schema else { return Ok(None) };
    if !include_guide {
        if let Some(o) = s.as_object_mut() {
            o.remove("guide");
        }
    }
    crate::definitions::schema(&s)?;
    if serde_json::to_vec(&s).map_err(|e| e.to_string())?.len() > 160 * 1024 {
        return Err("Schema context exceeds 160 KiB; no document was truncated or sent".into());
    }
    Ok(Some(s))
}
pub fn digest(schema: &Option<Value>) -> String {
    use sha2::{Digest, Sha256};
    format!(
        "{:x}",
        Sha256::digest(serde_json::to_vec(schema).unwrap_or_default())
    )
}
pub fn issues(doc: &Value, schema: &Value) -> Vec<String> {
    let mut issues = vec![];
    if schema["layout"] == "free" {
        for n in doc["layout"]["children"].as_array().into_iter().flatten() {
            let placement = n["contentId"]
                .as_str()
                .and_then(|id| doc["styles"][id].get("placement"))
                .unwrap_or(&n["style"]["placement"]);
            if placement != "free" {
                issues.push("Every top-level block needs independent free placement.".into());
                break;
            }
        }
    }
    fn visit(v: &Value, s: &Value, out: &mut Vec<String>, inherited: Option<&Value>) {
        if out.len() >= 16 {
            return;
        }
        let target = match v["type"].as_str() {
            Some("paragraph") => Some("body".to_string()),
            Some("heading") => Some(format!("heading{}", v["attrs"]["level"])),
            _ => None,
        };
        let rules = target.as_ref().and_then(|t| s["rules"].get(t));
        if let Some(rules) = rules.and_then(Value::as_object) {
            for (k, want) in rules {
                let got = if k == "indent" {
                    v["attrs"].get("indent").cloned().unwrap_or(json!(0))
                } else {
                    v["attrs"]["schemaStyle"][k].clone()
                };
                let matches = if k == "color" {
                    got.as_str()
                        .zip(want.as_str())
                        .map(|(a, b)| a.eq_ignore_ascii_case(b))
                        .unwrap_or(got == *want)
                } else {
                    got == *want
                };
                if !matches {
                    out.push(format!(
                        "{} {} should match the selected schema.",
                        target.as_deref().unwrap_or("Block"),
                        k
                    ));
                }
            }
        }
        let color = rules.and_then(|r| r.get("color")).or(inherited);
        if v["type"] == "text" {
            if let Some(want) = color {
                for m in v["marks"].as_array().into_iter().flatten() {
                    if m["type"] == "textStyle" {
                        if let Some(got) = m["attrs"].get("color") {
                            if !got.is_null()
                                && !got
                                    .as_str()
                                    .zip(want.as_str())
                                    .is_some_and(|(a, b)| a.eq_ignore_ascii_case(b))
                            {
                                out.push("Inline color overrides the selected schema.".into());
                            }
                        }
                    }
                }
            }
        }
        for c in v["content"].as_array().into_iter().flatten() {
            visit(c, s, out, color);
        }
    }
    for o in doc["objects"]
        .as_object()
        .into_iter()
        .flat_map(|o| o.values())
    {
        if o["kind"] == "richText" {
            visit(&o["content"], schema, &mut issues, None);
        }
    }
    issues.truncate(16);
    issues
}
pub fn validate_reply(n: &crate::store::Note, reply: &Value, schema: Option<&Value>) -> Result<()> {
    crate::agent::validate_reply(n, reply)?;
    if let Some(schema) = schema {
        let ops: Vec<crate::document::Operation> =
            serde_json::from_value(reply["operations"].clone()).map_err(|e| e.to_string())?;
        let d = n
            .document
            .clone()
            .unwrap_or_else(|| crate::document::migrate(&n.id, &n.content));
        let candidate = crate::document::apply(
            &d,
            &ops,
            &HashSet::from([
                crate::document::Permission::Formatting,
                crate::document::Permission::Arrangement,
            ]),
        )?;
        let failures = issues(&candidate, schema);
        if !failures.is_empty() {
            return Err(format!(
                "Proposal does not adhere to the selected schema: {}",
                failures.join(" ")
            ));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        agent::{call, Access},
        store::Store,
    };
    #[test]
    fn per_request_consent_strips_full_guide_and_dedup_is_context_specific() {
        let t = tempfile::tempdir().unwrap();
        let mut store = Store::open(t.path()).unwrap();
        let n = store.create_note("Synthetic target".into(), None).unwrap();
        let mut guide = crate::document::migrate("guide", &n.content);
        let gid = guide["readingOrder"][0].as_str().unwrap().to_string();
        guide["objects"][&gid]["content"]["content"] =
            json!([{"type":"text","text":"SYNTHETIC_GUIDE_CANARY"}]);
        let schema = json!({"formatVersion":2,"id":"guide","version":1,"name":"Guide","rules":{"body":{}},"guide":{"title":"Fixture","document":guide}});
        let original = schema.clone();
        let without = context(Some(schema.clone()), false).unwrap();
        assert!(without.as_ref().unwrap().get("guide").is_none());
        let a = store
            .create_request_with_schema(&n.id, "Follow schema".into(), without.clone())
            .unwrap();
        let again = store
            .create_request_with_schema(&n.id, "Follow schema".into(), without)
            .unwrap();
        assert_eq!(a.id, again.id);
        let b = store
            .create_request_with_schema(
                &n.id,
                "Follow schema".into(),
                context(Some(schema.clone()), true).unwrap(),
            )
            .unwrap();
        assert_ne!(a.id, b.id);
        assert_eq!(schema, original);
        assert_eq!(store.load_note(&n.id).unwrap().revision, n.revision);
        let raw = std::fs::read_to_string(
            t.path()
                .join("agent-requests")
                .join(format!("{}.json", a.id)),
        )
        .unwrap();
        assert!(!raw.contains("SYNTHETIC_GUIDE_CANARY"));
        let rows = store.formatting_requests(&n.id).unwrap();
        assert_eq!(rows.iter().filter(|r| r.has_guidance).count(), 1);
        assert!(!serde_json::to_string(&rows)
            .unwrap()
            .contains("SYNTHETIC_GUIDE_CANARY"));
        store
            .set_agent_access(Access {
                enabled: true,
                allow_hosted: false,
                folder_ids: vec![],
            })
            .unwrap();
        let fetched = call(t.path(), "get_formatting_requests", &json!({})).unwrap();
        let entries = fetched["requests"].as_array().unwrap();
        assert_eq!(entries.len(), 2);
        assert!(
            entries.iter().find(|r| r["request"]["id"] == a.id).unwrap()["request"]["schema"]
                .get("guide")
                .is_none()
        );
        assert!(serde_json::to_string(
            entries.iter().find(|r| r["request"]["id"] == b.id).unwrap()
        )
        .unwrap()
        .contains("SYNTHETIC_GUIDE_CANARY"));
    }
    #[test]
    fn formal_rules_are_checked_before_queueing_and_words_are_preserved() {
        let t = tempfile::tempdir().unwrap();
        let mut store = Store::open(t.path()).unwrap();
        let n = store.create_note("Fixture".into(), None).unwrap();
        let d = crate::document::migrate(&n.id, &n.content);
        let cid = d["readingOrder"][0].as_str().unwrap();
        let schema = json!({"formatVersion":2,"id":"formal","version":1,"name":"Formal","layout":"free","rules":{"body":{"fontSize":20,"indent":1}}});
        let r = store
            .create_request_with_schema(&n.id, "Conform".into(), Some(schema.clone()))
            .unwrap();
        store
            .set_agent_access(Access {
                enabled: true,
                allow_hosted: false,
                folder_ids: vec![],
            })
            .unwrap();
        let error=call(t.path(),"submit_formatting_proposal",&json!({"requestId":r.id,"summary":"Missing rules","operations":[{"type":"format","id":cid,"content":d["objects"][cid]["content"]}]})).unwrap_err();
        assert!(error.contains("does not adhere"), "{error}");
        assert!(store.formatting_reply(&r.id).unwrap().is_none());
        let mut content = d["objects"][cid]["content"].clone();
        content["attrs"]["schemaStyle"] = json!({"fontSize":20});
        content["attrs"]["indent"] = json!(1);
        let mut layout = d["layout"].clone();
        let child = layout["children"][0].clone();
        layout["children"] = json!([{"id":"free-panel","kind":"column","style":{"placement":"free","x":0,"y":0,"width":320},"children":[child]}]);
        let operations = json!([{"type":"format","id":cid,"content":content},{"type":"arrange","layout":layout}]);
        call(
            t.path(),
            "submit_formatting_proposal",
            &json!({"requestId":r.id,"summary":"Conforms","operations":operations}),
        )
        .unwrap();
        assert!(store.formatting_reply(&r.id).unwrap().is_some());
        assert_eq!(store.load_note(&n.id).unwrap().revision, n.revision);
        let mut unsafe_ops = operations;
        unsafe_ops[0]["content"]["content"] =
            json!([{"type":"text","text":"New words from guide"}]);
        assert!(validate_reply(
            &n,
            &json!({"summary":"Changed prose","operations":unsafe_ops}),
            Some(&schema)
        )
        .is_err());
    }
    #[test]
    fn full_guides_are_bounded_and_never_truncated() {
        let d = crate::document::migrate(
            "fixture",
            &json!({"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"x".repeat(140*1024)}]}]}),
        );
        let schema = json!({"formatVersion":2,"id":"guide","version":1,"name":"Guide","rules":{"body":{}},"guide":{"title":"Full","document":d}});
        assert!(context(Some(schema.clone()), true).is_err());
        assert!(context(Some(schema), false)
            .unwrap()
            .unwrap()
            .get("guide")
            .is_none());
    }
}
