fn main() {
    match hs_window_mac::get_hearthstone_window() {
        Some(w) => println!("FOUND: {w:?}"),
        None => println!("NONE (Hearthstone window not located)"),
    }
}
