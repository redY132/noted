//! CommonMark/GFM events to inert editor nodes, retaining source identities.
use super::Issue;
use pulldown_cmark::{CodeBlockKind, Event, Options, Parser, Tag, TagEnd};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, HashMap};
#[derive(serde::Serialize, serde::Deserialize)]
pub struct Parsed {
    pub content: Value,
    pub locations: BTreeMap<String, usize>,
    pub anchors: BTreeMap<String, Vec<String>>,
    pub aliases: Vec<String>,
    pub tags: Vec<String>,
    pub title: Option<String>,
    pub issues: Vec<Issue>,
}
struct Frame {
    node: Value,
    line: usize,
    head: bool,
}
fn id(path: &str, kind: &str, offset: usize, serial: usize) -> String {
    format!(
        "b-{:x}",
        Sha256::digest(format!("{path}:{kind}:{offset}:{serial}").as_bytes())
    )[..34]
        .into()
}
fn node(kind: &str, id: String) -> Value {
    json!({"type":kind,"attrs":{"id":id},"content":[]})
}
fn text(value: &str, marks: &[Value]) -> Value {
    let mut n = json!({"type":"text","text":value});
    if !marks.is_empty() {
        n["marks"] = json!(marks);
    }
    n
}
pub fn plain(v: &Value) -> String {
    format!(
        "{}{}",
        v["text"].as_str().unwrap_or(""),
        v["content"]
            .as_array()
            .into_iter()
            .flatten()
            .map(plain)
            .collect::<Vec<_>>()
            .join(
                if ["doc", "listItem", "taskItem", "blockquote"]
                    .contains(&v["type"].as_str().unwrap_or(""))
                {
                    "\n"
                } else {
                    ""
                }
            )
    )
}
fn push(frame: &mut Frame, n: Value) {
    let kind = frame.node["type"].as_str().unwrap_or("");
    let inline = ["text", "hardBreak", "importImage", "importEmbed"]
        .contains(&n["type"].as_str().unwrap_or(""));
    if inline
        && [
            "listItem",
            "taskItem",
            "tableCell",
            "tableHeader",
            "blockquote",
            "doc",
        ]
        .contains(&kind)
    {
        let a = frame.node["content"].as_array_mut().unwrap();
        if a.last().is_none_or(|v| v["type"] != "paragraph") {
            a.push(node("paragraph", format!("auto-{}", uuid::Uuid::new_v4())));
        }
        let p = a.last_mut().unwrap();
        merge(p["content"].as_array_mut().unwrap(), n);
    } else {
        merge(frame.node["content"].as_array_mut().unwrap(), n);
    }
}
fn merge(a: &mut Vec<Value>, n: Value) {
    if n["type"] == "text" && n["text"].as_str() == Some("") {
        return;
    }
    if n["type"] == "text" {
        if let Some(last) = a.last_mut() {
            if last["type"] == "text" && last.get("marks") == n.get("marks") {
                let t = format!(
                    "{}{}",
                    last["text"].as_str().unwrap_or(""),
                    n["text"].as_str().unwrap_or("")
                );
                last["text"] = json!(t);
                return;
            }
        }
    }
    a.push(n);
}
fn values(s: &str) -> Option<Vec<String>> {
    let s = s.trim();
    if s.is_empty() {
        return Some(vec![]);
    }
    if let Ok(v) = serde_json::from_str::<Vec<String>>(s) {
        return Some(v);
    }
    let s = if !s.starts_with("[[") {
        s.strip_prefix('[')
            .and_then(|s| s.strip_suffix(']'))
            .unwrap_or(s)
    } else {
        s
    };
    let mut result = vec![];
    for x in s.split(',') {
        let x = x.trim();
        let y = x.trim_matches(['\'', '"']).trim();
        let y = y
            .strip_prefix("[[")
            .and_then(|s| s.strip_suffix("]]"))
            .unwrap_or(y);
        if y.contains(['\'', '"', '[', ']', '{', '}', '&', '*']) || y.is_empty() {
            return None;
        }
        result.push(y.into());
    }
    Some(result)
}
pub fn parse(path: &str, source: &str, profile: &str) -> Result<Parsed, String> {
    let mut result = Parsed {
        content: json!({"type":"doc","content":[]}),
        locations: BTreeMap::new(),
        anchors: BTreeMap::new(),
        aliases: vec![],
        tags: vec![],
        title: None,
        issues: vec![],
    };
    let mut lines = source.lines().map(str::to_owned).collect::<Vec<_>>();
    let mut front = String::new();
    if lines.first().is_some_and(|s| s.trim() == "---") {
        if let Some(end) = lines
            .iter()
            .enumerate()
            .skip(1)
            .find(|(_, s)| s.trim() == "---")
            .map(|x| x.0)
        {
            front = lines[1..end].join("\n");
            for l in &mut lines[..=end] {
                l.clear();
            }
            let mut key = String::new();
            for l in front.lines() {
                let trimmed = l.trim();
                if let Some(v) = trimmed.strip_prefix("- ") {
                    if let Some(xs) = values(v) {
                        if key == "aliases" || key == "alias" {
                            result.aliases.extend(xs);
                        } else if key == "tags" {
                            result.tags.extend(xs);
                        }
                    }
                    continue;
                }
                if let Some((k, v)) = trimmed.split_once(':') {
                    key = k.trim().to_lowercase();
                    match key.as_str() {
                        "aliases" | "alias" => {
                            if let Some(xs) = values(v) {
                                result.aliases.extend(xs);
                            }
                        }
                        "tags" => {
                            if let Some(xs) = values(v) {
                                result.tags.extend(xs);
                            }
                        }
                        "title" => {
                            if let Some(xs) = values(v) {
                                if xs.len() == 1 {
                                    result.title = Some(xs[0].clone());
                                }
                            }
                        }
                        _ => {}
                    }
                }
            }
            result.issues.push(Issue::warning(path,1,"metadata","Frontmatter retained in the recovery archive and a readable properties block; title, simple tags and aliases were also mapped."));
        } else {
            return Err("Unclosed frontmatter; original source preserved".into());
        }
    }
    let protected = Parser::new(source)
        .into_offset_iter()
        .filter_map(|(e, r)| {
            matches!(e, Event::Start(Tag::CodeBlock(_) | Tag::HtmlBlock)).then_some(r)
        })
        .collect::<Vec<_>>();
    let mut offsets = vec![0];
    for (i, b) in source.bytes().enumerate() {
        if b == b'\n' {
            offsets.push(i + 1);
        }
    }
    let mut block_lines: Vec<(usize, usize)> = vec![];
    let mut property_ids = HashMap::<usize, String>::new();
    let mut page_props = true;
    if profile.starts_with("logseq") {
        for (i, l) in lines.iter_mut().enumerate() {
            let offset = *offsets.get(i).unwrap_or(&0);
            if protected.iter().any(|r| r.contains(&offset)) {
                continue;
            }
            let indent = l.chars().take_while(|c| c.is_whitespace()).count();
            let trimmed = l.trim_start().to_string();
            if let Some(rest) = trimmed.strip_prefix("- ") {
                page_props = false;
                while block_lines.last().is_some_and(|(n, _)| *n >= indent) {
                    block_lines.pop();
                }
                block_lines.push((indent, i + 1));
                for status in [
                    "TODO", "DOING", "DONE", "LATER", "NOW", "WAITING", "CANCELED",
                ] {
                    if rest.starts_with(&format!("{status} ")) {
                        *l = format!(
                            "{}- [{}] {}",
                            " ".repeat(indent),
                            if status == "DONE" { "x" } else { " " },
                            rest
                        );
                        result.issues.push(Issue::warning(path,i+1,"task-status","The original status marker remains text; the checkbox represents only done/not done."));
                        break;
                    }
                }
            } else if let Some((k, v)) = trimmed.split_once("::") {
                let k = k.trim();
                let v = v.trim();
                if k == "id" && crate::store::valid_id(v).is_ok() {
                    if let Some((_, line)) = block_lines.iter().rev().find(|(n, _)| *n < indent) {
                        if property_ids.insert(*line, v.into()).is_some() {
                            result.issues.push(Issue::blocked(
                                path,
                                i + 1,
                                "block-id",
                                "A block has multiple source UUID properties.",
                            ));
                        }
                    } else {
                        result.aliases.push(format!("uuid:{v}"));
                    }
                    l.clear();
                } else if page_props {
                    match k {
                        "title" => result.title = Some(v.into()),
                        "alias" | "aliases" => {
                            if let Some(xs) = values(v) {
                                result.aliases.extend(xs);
                            }
                        }
                        "tags" => {
                            if let Some(xs) = values(v) {
                                result.tags.extend(xs);
                            }
                        }
                        _ => {}
                    }
                }
            }
        }
    }
    for (i, l) in lines.iter().enumerate() {
        let offset = *offsets.get(i).unwrap_or(&0);
        if protected.iter().any(|r| r.contains(&offset)) {
            continue;
        }
        if (l.contains("{{") && !l.contains("{{embed ")) || l.contains("[!") {
            result.issues.push(Issue::warning(path,i+1,"source-syntax","Callout labels and non-embed macros remain inert source text rather than source-app behavior."));
        }
    }
    let body = lines.join("\n");
    let mut body_lines = vec![0usize];
    for (i, b) in body.bytes().enumerate() {
        if b == b'\n' {
            body_lines.push(i + 1);
        }
    }
    let mut stack = vec![Frame {
        node: json!({"type":"doc","content":[]}),
        line: 1,
        head: false,
    }];
    let mut marks: Vec<(TagEnd, Option<Value>)> = vec![];
    let mut serial = 0usize;
    let options = Options::ENABLE_STRIKETHROUGH
        | Options::ENABLE_TABLES
        | Options::ENABLE_TASKLISTS
        | Options::ENABLE_FOOTNOTES
        | Options::ENABLE_MATH;
    for (event, range) in Parser::new_ext(&body, options).into_offset_iter() {
        serial += 1;
        if serial > 50000 || stack.len() > 60 {
            return Err("Document exceeds the migration node/nesting limit".into());
        }
        let line = body_lines.partition_point(|offset| *offset <= range.start);
        let next_id = id(path, "node", range.start, serial);
        match event {
            Event::Start(tag) => {
                let end = tag.to_end();
                let mark = match &tag {
                    Tag::Emphasis => Some(json!({"type":"italic"})),
                    Tag::Strong => Some(json!({"type":"bold"})),
                    Tag::Strikethrough => Some(json!({"type":"strike"})),
                    Tag::Link { dest_url, .. } => Some(
                        json!({"type":"importLink","attrs":{"target":dest_url.to_string(),"line":line}}),
                    ),
                    _ => None,
                };
                if mark.is_some() {
                    marks.push((end, mark));
                    continue;
                }
                let mut n = match &tag {
                    Tag::Paragraph => node("paragraph", next_id),
                    Tag::Heading { level, .. } => {
                        let mut n = node("heading", next_id);
                        n["attrs"]["level"] = json!(*level as u8);
                        n
                    }
                    Tag::BlockQuote(_) => node("blockquote", next_id),
                    Tag::CodeBlock(k) => {
                        let mut n = node("codeBlock", next_id);
                        if let CodeBlockKind::Fenced(lang) = k {
                            let lang = lang.split_whitespace().next().unwrap_or("");
                            if ["dataview", "dataviewjs", "query"].contains(&lang) {
                                result.issues.push(Issue::warning(path,line,"query","Query code is retained as inert source text; it is not evaluated."));
                            }
                            if lang.len() <= 80 {
                                n["attrs"]["language"] = json!(lang);
                            }
                        }
                        n
                    }
                    Tag::HtmlBlock => {
                        result.issues.push(Issue::warning(
                            path,
                            line,
                            "html",
                            "Raw HTML is retained as inert code text; it is never executed.",
                        ));
                        node("codeBlock", next_id)
                    }
                    Tag::List(start) => {
                        let mut n = node(
                            if start.is_some() {
                                "orderedList"
                            } else {
                                "bulletList"
                            },
                            next_id,
                        );
                        if let Some(s) = start {
                            n["attrs"]["start"] = json!((*s).min(100000));
                        }
                        n
                    }
                    Tag::Item => node(
                        "listItem",
                        property_ids.get(&line).cloned().unwrap_or(next_id),
                    ),
                    Tag::Table(alignments) => {
                        if alignments
                            .iter()
                            .any(|a| *a != pulldown_cmark::Alignment::None)
                        {
                            result.issues.push(Issue::warning(path,line,"table-alignment","Cell text and structure are preserved; Markdown column alignment uses the destination table style."));
                        }
                        node("table", next_id)
                    }
                    Tag::TableHead | Tag::TableRow => node("tableRow", next_id),
                    Tag::TableCell => {
                        let header = stack.last().is_some_and(|f| f.head);
                        node(if header { "tableHeader" } else { "tableCell" }, next_id)
                    }
                    Tag::Image { dest_url, .. } => {
                        let mut n = node("importImage", next_id);
                        n["attrs"]["target"] = json!(dest_url.to_string());
                        n["attrs"]["line"] = json!(line);
                        if let Some(href) = marks
                            .iter()
                            .rev()
                            .filter_map(|(_, m)| m.as_ref())
                            .find(|m| m["type"] == "importLink")
                            .and_then(|m| m.pointer("/attrs/target"))
                            .and_then(Value::as_str)
                        {
                            n["attrs"]["hrefTarget"] = json!(href);
                        }
                        n
                    }
                    Tag::FootnoteDefinition(label) => {
                        result.issues.push(Issue::warning(path,line,"footnote","Footnote source is retained as a labelled quote; automatic footnote navigation is not available."));
                        let mut n = node("blockquote", next_id);
                        n["content"] = json!([{"type":"paragraph","attrs":{"id":format!("footnote-{}",uuid::Uuid::new_v4())},"content":[{"type":"text","text":format!("[^{label}]")}]}]);
                        n
                    }
                    _ => {
                        result.issues.push(Issue::warning(
                            path,
                            line,
                            "markdown-extension",
                            "An unsupported Markdown container is retained as a readable quote.",
                        ));
                        node("blockquote", next_id)
                    }
                };
                if matches!(tag, Tag::Item) {
                    if let Some(uuid) = property_ids.get(&line) {
                        result
                            .anchors
                            .entry(format!("block:{uuid}"))
                            .or_default()
                            .push(uuid.clone());
                    }
                }
                if matches!(tag, Tag::TableHead) {
                    n["type"] = json!("tableRow");
                }
                result
                    .locations
                    .insert(n["attrs"]["id"].as_str().unwrap_or("").into(), line);
                stack.push(Frame {
                    node: n,
                    line,
                    head: matches!(tag, Tag::TableHead),
                });
            }
            Event::End(end) => {
                if marks.last().is_some_and(|(t, _)| *t == end) {
                    marks.pop();
                    continue;
                }
                if stack.len() == 1 {
                    return Err("Unbalanced Markdown container".into());
                }
                let f = stack.pop().unwrap();
                let _source_line = f.line;
                let n = f.node;
                if n["type"] == "heading" {
                    result
                        .anchors
                        .entry(format!("heading:{}", plain(&n).trim().to_lowercase()))
                        .or_default()
                        .push(n["attrs"]["id"].as_str().unwrap().into());
                }
                push(stack.last_mut().unwrap(), n);
            }
            Event::Text(s) => {
                let m = if stack.last().is_some_and(|f| {
                    f.node["type"] == "codeBlock" || f.node["type"] == "importImage"
                }) {
                    vec![]
                } else {
                    marks.iter().filter_map(|(_, m)| m.clone()).collect()
                };
                push(stack.last_mut().unwrap(), text(&s, &m));
            }
            Event::Code(s) => push(
                stack.last_mut().unwrap(),
                text(&s, &[json!({"type":"code"})]),
            ),
            Event::SoftBreak => push(
                stack.last_mut().unwrap(),
                text(
                    "\n",
                    &marks
                        .iter()
                        .filter_map(|(_, m)| m.clone())
                        .collect::<Vec<_>>(),
                ),
            ),
            Event::HardBreak => push(stack.last_mut().unwrap(), json!({"type":"hardBreak"})),
            Event::Rule => {
                let mut n = node("horizontalRule", next_id);
                n.as_object_mut().unwrap().remove("content");
                push(stack.last_mut().unwrap(), n);
            }
            Event::TaskListMarker(checked) => {
                if let Some(item) = stack
                    .iter_mut()
                    .rev()
                    .find(|f| f.node["type"] == "listItem")
                {
                    item.node["type"] = json!("taskItem");
                    item.node["attrs"]["checked"] = json!(checked);
                }
            }
            Event::Html(s) | Event::InlineHtml(s) => {
                result.issues.push(Issue::warning(
                    path,
                    line,
                    "html",
                    "HTML remains literal text/code and is not executed.",
                ));
                push(stack.last_mut().unwrap(), text(&s, &[]));
            }
            Event::InlineMath(s) => {
                result.issues.push(Issue::warning(
                    path,
                    line,
                    "math",
                    "Math is preserved as source notation without a renderer.",
                ));
                push(stack.last_mut().unwrap(), text(&format!("${s}$"), &[]));
            }
            Event::DisplayMath(s) => {
                result.issues.push(Issue::warning(
                    path,
                    line,
                    "math",
                    "Display math is retained as inert source code.",
                ));
                let mut n = node("codeBlock", next_id);
                n["content"] = json!([text(&format!("$${s}$$"), &[])]);
                push(stack.last_mut().unwrap(), n);
            }
            Event::FootnoteReference(s) => {
                push(stack.last_mut().unwrap(), text(&format!("[^{s}]"), &[]))
            }
        }
    }
    result.content = stack.pop().unwrap().node;
    // Explicit Obsidian block markers become stable targets rather than visible syntax.
    fn anchors(v: &mut Value, map: &mut BTreeMap<String, Vec<String>>) {
        if ["paragraph", "heading"].contains(&v["type"].as_str().unwrap_or("")) {
            let block = v["attrs"]["id"].as_str().unwrap_or("").to_string();
            if let Some(last) = v
                .get_mut("content")
                .and_then(Value::as_array_mut)
                .and_then(|a| a.last_mut())
            {
                if let Some(s) = last["text"].as_str() {
                    if let Some((body, id)) = s.rsplit_once(" ^") {
                        if !id.is_empty()
                            && id.len() <= 200
                            && id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
                        {
                            map.entry(format!("block:{id}")).or_default().push(block);
                            last["text"] = json!(body);
                        }
                    }
                }
            }
        }
        if let Some(a) = v.get_mut("content").and_then(Value::as_array_mut) {
            for c in a {
                anchors(c, map);
            }
        }
    }
    if profile == "obsidian" {
        anchors(&mut result.content, &mut result.anchors);
    }
    if !front.is_empty() {
        let mut n = node("codeBlock", format!("metadata-{}", uuid::Uuid::new_v4()));
        n["content"] = json!([text(
            &format!("Imported properties (source):\n{front}"),
            &[]
        )]);
        result.content["content"].as_array_mut().unwrap().push(n);
    }
    if result.content["content"]
        .as_array()
        .is_none_or(|a| a.is_empty())
    {
        result.content["content"] =
            json!([node("paragraph", format!("empty-{}", uuid::Uuid::new_v4()))]);
    }
    Ok(result)
}
/// Split mixed task lists and promote inline images after the resolver has materialized them.
pub fn normalize(v: Value) -> Vec<Value> {
    let mut v = v;
    if let Some(children) = v.get_mut("content").and_then(Value::as_array_mut) {
        let old = std::mem::take(children);
        *children = old.into_iter().flat_map(normalize).collect();
    }
    let kind = v["type"].as_str().unwrap_or("").to_owned();
    if ["bulletList", "orderedList"].contains(&kind.as_str()) {
        let items = v["content"].as_array().cloned().unwrap_or_default();
        let mut lists: Vec<Value> = vec![];
        for item in items {
            let task = item["type"] == "taskItem";
            if lists
                .last()
                .is_none_or(|l| (l["type"] == "taskList") != task)
            {
                let mut l = v.clone();
                l["type"] = json!(if task { "taskList" } else { kind.as_str() });
                if task {
                    l["attrs"].as_object_mut().unwrap().remove("start");
                }
                if !lists.is_empty() {
                    l["attrs"]["id"] = json!(format!("split-{}", uuid::Uuid::new_v4()));
                }
                l["content"] = json!([]);
                lists.push(l);
            }
            lists.last_mut().unwrap()["content"]
                .as_array_mut()
                .unwrap()
                .push(item);
        }
        return lists;
    }
    if ["listItem", "taskItem"].contains(&kind.as_str())
        && v["content"]
            .as_array()
            .is_some_and(|a| a.first().is_some_and(|n| n["type"] != "paragraph"))
    {
        v.get_mut("content")
            .and_then(Value::as_array_mut)
            .unwrap()
            .insert(
                0,
                node("paragraph", format!("fill-{}", uuid::Uuid::new_v4())),
            );
    }
    if [
        "listItem",
        "taskItem",
        "tableCell",
        "tableHeader",
        "blockquote",
    ]
    .contains(&kind.as_str())
        && v["content"].as_array().is_none_or(|a| a.is_empty())
    {
        v["content"] = json!([node("paragraph", format!("fill-{}", uuid::Uuid::new_v4()))]);
    }
    if ["paragraph", "heading"].contains(&kind.as_str())
        && v["content"].as_array().is_some_and(|a| {
            a.iter()
                .any(|n| ["localImage", "blockquote"].contains(&n["type"].as_str().unwrap_or("")))
        })
    {
        let old = v
            .get_mut("content")
            .and_then(Value::as_array_mut)
            .map(std::mem::take)
            .unwrap_or_default();
        let mut out = vec![];
        let mut current = v.clone();
        current["content"] = json!([]);
        for n in old {
            if ["localImage", "blockquote"].contains(&n["type"].as_str().unwrap_or("")) {
                if !current["content"].as_array().unwrap().is_empty() {
                    out.push(current.clone());
                }
                out.push(n);
                current = v.clone();
                current["attrs"]["id"] = json!(format!("split-{}", uuid::Uuid::new_v4()));
                current["content"] = json!([]);
            } else {
                current["content"].as_array_mut().unwrap().push(n);
            }
        }
        if !current["content"].as_array().unwrap().is_empty() {
            out.push(current);
        }
        return out;
    }
    vec![v]
}
