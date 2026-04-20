//! Regression test: MonoRuntime::init() must not crash with ACCESS_VIOLATION.
//!
//! Before fix-hearthmirror-pe-read-cap, init() crashed because
//! find_mono_get_root_domain_va() capped PE read at 1MB while
//! mono-2.0-bdwgc.dll is ~6.5MB. See spike 0003 F-1.
//!
//! Run with: `cargo test --test integration_runtime_init`

use hearthmirror_native::mono::MonoRuntime;

fn hearthstone_is_running() -> bool {
    hearthmirror_native::process::find_pid("Hearthstone.exe")
        .ok()
        .flatten()
        .is_some()
}

macro_rules! skip_if_no_hs {
    () => {
        if !hearthstone_is_running() {
            eprintln!("SKIP: no Hearthstone process found");
            return;
        }
    };
}

#[test]
fn init_succeeds_when_hearthstone_running() {
    skip_if_no_hs!();
    let rt = MonoRuntime::init().expect("MonoRuntime::init must succeed when Hearthstone is running");
    assert!(!rt.root_domain.is_null(), "root_domain must be non-null");
    eprintln!("init OK: root_domain = {}", rt.root_domain);
}
