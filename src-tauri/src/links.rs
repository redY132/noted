//! Version-compatible whole-note and block targets; never local file paths.
pub fn target(href: &str) -> Option<(&str, Option<&str>)> {
    let tail = href.strip_prefix("noted://note/")?;
    let (note, block) = match tail.split_once("#block=") {
        Some((n, b)) => (n, Some(b)),
        None => (tail, None),
    };
    crate::store::valid_id(note).ok()?;
    if block.is_some_and(|b| {
        b.is_empty()
            || b.len() > 200
            || !b
                .bytes()
                .all(|c| c.is_ascii_alphanumeric() || b"_.-".contains(&c))
    }) {
        return None;
    }
    Some((note, block))
}
pub fn validate(href: &str) -> Result<(), String> {
    target(href)
        .map(|_| ())
        .ok_or_else(|| "Invalid note or block link".into())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn targets_are_bounded_and_cannot_smuggle_paths_or_commands() {
        let id = "00000000-0000-4000-8000-000000000001";
        assert_eq!(target(&format!("noted://note/{id}")), Some((id, None)));
        let h = format!("noted://note/{id}#block=stable-block_2");
        assert_eq!(target(&h), Some((id, Some("stable-block_2"))));
        for f in [
            "#block=",
            "#block=../x",
            "#block=%2fprivate",
            "#block=x?exec=1",
            "?command=x",
            "#other=x",
        ] {
            assert!(target(&format!("noted://note/{id}{f}")).is_none());
        }
    }
}
