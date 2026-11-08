fn main() {
    let args: Vec<_> = std::env::args_os().skip(1).collect();
    if args.first().is_some_and(|arg| arg == "--subscription-client-host") {
        noted_core::subscription::run_client_host(args.into_iter().skip(1).collect());
    }
    if args.len() == 1 && args[0] == "--capabilities" {
        println!("{}", noted_core::agent::capabilities());
        return;
    }
    let valid = args.len() == 2
        || args.len() == 4
            && args[2] == "--audience"
            && (args[3] == "hosted" || args[3] == "local");
    if !valid || args[0] != "--workspace" {
        eprintln!(
            "Usage: noted-agent --workspace ABSOLUTE_WORKSPACE_PATH [--audience local|hosted]"
        );
        std::process::exit(2);
    }
    let hosted = args.len() == 4 && args[3] == "hosted";
    if let Err(e) = noted_core::agent::serve_for(std::path::Path::new(&args[1]), hosted) {
        eprintln!("Noted agent: {e}");
        std::process::exit(1);
    }
}
