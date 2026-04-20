//! Integration tests for the MonoImage.class_cache hashtable walking path
//! introduced by `add-hearthmirror-image-walking` (5f).
//!
//! These tests require a running Hearthstone process with
//! `Assembly-CSharp.dll` loaded (i.e. past the splash screen, on any menu
//! or in a match). They gracefully skip when no Hearthstone is found,
//! exiting with code 0.
//!
//! Run with: `cargo test --test integration_image_walking --features integration`.

use hearthmirror_native::mono::image::MonoImage;
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

/// `MonoImage::enumerate_classes` on Assembly-CSharp.dll must return at
/// least 1000 classes — Hearthstone's game assembly typically defines
/// thousands of `MonoClass`es, and any significantly lower number indicates
/// the hashtable walk is reading garbage (probably wrong offsets).
#[test]
fn enumerate_classes_returns_assembly_csharp_classes() {
    skip_if_no_hs!();

    let rt = MonoRuntime::init()
        .expect("MonoRuntime::init must succeed when Hearthstone is running");

    // Reach the Assembly-CSharp image via find_class side-effect. We don't
    // care about the class here — we only want the cached ac_image pointer.
    // (find_class uses find_ac_image_cached internally.)
    let probe = rt
        .find_class("", "CollectionManager")
        .expect("CollectionManager must resolve to prime the ac_image cache");
    eprintln!(
        "CollectionManager resolved → {} @ {}",
        probe.full_name, probe.addr
    );

    // Fetch the image addr directly by calling find_ac_image_cached through
    // a second find_class — easier than plumbing a getter. We enumerate via
    // a freshly-constructed MonoImage view.
    //
    // Since MonoRuntime::find_ac_image_cached is private, rebuild the view by
    // borrowing runtime and going through find_class once to warm state.
    let image_addr = find_ac_image_via_probe(&rt);
    let image = MonoImage::new(&rt, image_addr);

    let classes = image
        .enumerate_classes()
        .expect("enumerate_classes must walk class_cache successfully");
    eprintln!(
        "enumerate_classes → {} classes in {}",
        classes.len(),
        image.name().unwrap_or_default()
    );

    assert!(
        classes.len() >= 1000,
        "Assembly-CSharp.dll should have at least 1000 classes, got {}",
        classes.len()
    );

    // Spot-check: CollectionManager MUST appear in the enumerated set.
    let has_collection_manager = classes.iter().any(|c| c.full_name == "CollectionManager");
    assert!(
        has_collection_manager,
        "enumerate_classes output must contain CollectionManager"
    );
}

/// `MonoRuntime::find_class("", "CollectionManager")` — a well-known
/// Hearthstone singleton — must succeed on every build since 30.0.
#[test]
fn find_class_collection_manager() {
    skip_if_no_hs!();

    let rt = MonoRuntime::init()
        .expect("MonoRuntime::init must succeed when Hearthstone is running");

    let class_ref = rt
        .find_class("", "CollectionManager")
        .expect("find_class('', 'CollectionManager') must succeed");
    eprintln!(
        "CollectionManager @ {} (full_name={})",
        class_ref.addr, class_ref.full_name
    );

    assert!(!class_ref.addr.is_null(), "class addr must not be NULL");
    assert_eq!(class_ref.full_name, "CollectionManager");

    // Hit the cache on a second call — must return an equivalent ref.
    let class_ref2 = rt
        .find_class("", "CollectionManager")
        .expect("second find_class must also succeed (cache hit)");
    assert_eq!(
        class_ref.addr, class_ref2.addr,
        "cache must return identical class address"
    );
}

/// `MonoRuntime::find_class` with a bogus name must return
/// `ScryError::ClassNotFound` (not panic, not some other error).
#[test]
fn find_class_unknown_class_returns_class_not_found() {
    skip_if_no_hs!();

    let rt = MonoRuntime::init()
        .expect("MonoRuntime::init must succeed when Hearthstone is running");
    let err = rt
        .find_class("", "DefinitelyNotAClassInHearthstone_9f3a")
        .expect_err("unknown class must fail");
    let msg = err.to_string();
    assert!(
        msg.contains("class not found"),
        "error message should mention class not found, got: {}",
        msg
    );
    assert!(
        msg.contains("DefinitelyNotAClassInHearthstone_9f3a"),
        "error message must include the queried class name, got: {}",
        msg
    );
}

/// Resolve Assembly-CSharp image addr by calling find_class and then
/// finding the image pointer through an enumerate round-trip.
///
/// MonoRuntime keeps ac_image private, so we take the long way: prime the
/// cache by calling find_class (which internally calls find_ac_image_cached),
/// and then recover the addr by walking every domain assembly until we hit
/// an image whose name contains "Assembly-CSharp". This duplicates the
/// runtime's own logic but keeps the test free of private-API coupling.
fn find_ac_image_via_probe(rt: &MonoRuntime) -> hearthmirror_native::remote_ptr::RemotePtr {
    use hearthmirror_native::collections::glist;

    let domain_off = &rt.offsets.structs.domain;
    let assembly_off = &rt.offsets.structs.assembly;
    let image_off = &rt.offsets.structs.image;

    let head = rt
        .memory
        .read_remote_ptr(rt.root_domain + domain_off.domain_assemblies)
        .expect("read domain_assemblies");
    let assemblies = glist::iter(&rt.memory, head, 500).expect("glist iter");
    for asm in assemblies {
        if asm.is_null() {
            continue;
        }
        let img = rt
            .memory
            .read_remote_ptr(asm + assembly_off.image)
            .expect("read assembly.image");
        if img.is_null() {
            continue;
        }
        let name_ptr = rt
            .memory
            .read_remote_ptr(img + image_off.name)
            .expect("read image.name");
        if name_ptr.is_null() {
            continue;
        }
        let name = rt.memory.read_cstring(name_ptr, 256).unwrap_or_default();
        if name.contains("Assembly-CSharp") {
            return img;
        }
    }
    panic!("Assembly-CSharp image not found in domain_assemblies");
}
