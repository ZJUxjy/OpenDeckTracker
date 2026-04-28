//! Manual integration test for the runtime-recovery flow.
//!
//! Gated behind `feature = "integration"` and `#[ignore]` because the test
//! procedure requires the operator to start, kill, and restart Hearthstone
//! interactively while the test is running. Automating that round-trip
//! inside cargo would be brittle — the value of this test is the recipe
//! it documents and the assertions it locks down.
//!
//! ## Procedure
//!
//! 1. Open Hearthstone, log in, and reach the main menu.
//! 2. From the repo root, run:
//!
//!        cargo test -p hearthmirror-native --features integration -- \
//!            --ignored --nocapture live_recovery_round_trip
//!
//! 3. Follow the on-screen prompts. The test reads from stdin between
//!    phases, giving you time to perform the manual steps.
//!
//! Captured findings should land in spike `docs/spikes/0003-...md ## Run 15`.

#![cfg(feature = "integration")]

use std::io::{self, BufRead, Write};

fn pause(prompt: &str) {
    eprintln!();
    eprintln!("=== MANUAL STEP ===");
    eprintln!("{}", prompt);
    eprint!("Press Enter when ready: ");
    io::stderr().flush().ok();
    let stdin = io::stdin();
    let mut line = String::new();
    let _ = stdin.lock().read_line(&mut line);
}

#[test]
#[ignore = "manual integration: requires starting/stopping Hearthstone interactively"]
fn live_recovery_round_trip() {
    use hearthmirror_native::mono::MonoRuntime;
    use hearthmirror_native::process;

    pause("Confirm Hearthstone is running and on the main menu.");

    let pid_before = process::find_pid("Hearthstone.exe")
        .expect("find_pid succeeds")
        .expect("Hearthstone.exe must be running before this test starts");
    eprintln!("Detected Hearthstone pid = {}", pid_before);

    let runtime = MonoRuntime::init().expect("MonoRuntime::init must succeed against running HS");
    assert_eq!(runtime.pid(), pid_before);
    assert!(runtime.is_process_alive_and_same(), "fresh runtime should report alive");
    eprintln!("PASS: fresh init reports alive");

    pause("Now KILL the Hearthstone process (or close the client). Wait until Task Manager shows it gone.");

    assert!(
        !runtime.is_process_alive_and_same(),
        "after Hearthstone exits, probe must return false"
    );
    eprintln!("PASS: probe flipped to false after process exit");

    pause("RESTART Hearthstone, log back in, reach the main menu.");

    let pid_after = process::find_pid("Hearthstone.exe")
        .expect("find_pid succeeds")
        .expect("Hearthstone.exe must be running again");
    eprintln!("Detected new Hearthstone pid = {}", pid_after);
    assert_ne!(
        pid_before, pid_after,
        "expected a fresh Hearthstone pid (otherwise this is the same process)"
    );

    // Old runtime is bound to pid_before; even though HS is alive again, the
    // probe must still return false because the captured pid no longer matches.
    assert!(
        !runtime.is_process_alive_and_same(),
        "stale runtime bound to pid_before must still report not-same after restart"
    );
    eprintln!("PASS: stale runtime correctly rejects the new pid");

    // Re-init succeeds against the new instance.
    let runtime2 = MonoRuntime::init().expect("re-init against new HS instance must succeed");
    assert_eq!(runtime2.pid(), pid_after);
    assert!(runtime2.is_process_alive_and_same(), "fresh runtime should report alive");
    eprintln!("PASS: re-init succeeds against new HS instance, probe reports alive");

    eprintln!();
    eprintln!("=== ALL ASSERTIONS PASSED ===");
    eprintln!("Record findings in docs/spikes/0003-hearthmirror-reflection-runtime-validation.md ## Run 15.");
}
