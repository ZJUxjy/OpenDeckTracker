fn main() {
    napi_build::setup();

    // napi_build only adds `-undefined dynamic_lookup` to the cdylib, so
    // example/test binaries that link the rlib fail to resolve the `napi_*`
    // symbols (those are provided by the Node runtime at load time). Allow
    // example binaries to link with those symbols left undefined; the smoke
    // example never calls them, it only exercises the pure Rust path.
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        println!("cargo:rustc-link-arg-examples=-Wl,-undefined,dynamic_lookup");
    }
}
