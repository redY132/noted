fn main() {
    let mut args = std::env::args_os().skip(1);
    if args.next().as_deref() != Some(std::ffi::OsStr::new("--workspace")) {
        eprintln!("Usage: noted-agent --workspace ABSOLUTE_WORKSPACE_PATH");
        std::process::exit(2);
    }
    let Some(path) = args.next() else {
        std::process::exit(2);
    };
    if args.next().is_some() {
        std::process::exit(2);
    }
    if let Err(e) = noted_core::agent::serve(std::path::Path::new(&path)) {
        eprintln!("Noted agent: {e}");
        std::process::exit(1);
    }
}
