use crate::{HearthstoneWindow, WindowInfo};

/// Choose the Hearthstone game window from a list of on-screen windows.
/// Game window = owner "Hearthstone", layer 0, largest area. Foreground is
/// true when the frontmost app's pid matches the chosen window's owner pid.
pub fn choose(windows: &[WindowInfo], frontmost_pid: Option<i32>) -> Option<HearthstoneWindow> {
    let chosen = windows
        .iter()
        .filter(|w| w.owner_name == "Hearthstone" && w.layer == 0)
        .max_by(|a, b| {
            (a.width * a.height)
                .partial_cmp(&(b.width * b.height))
                .unwrap_or(std::cmp::Ordering::Equal)
        })?;
    Some(HearthstoneWindow {
        x: chosen.x,
        y: chosen.y,
        width: chosen.width,
        height: chosen.height,
        minimized: false,
        visible: true,
        foreground: frontmost_pid == Some(chosen.owner_pid),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn win(owner: &str, layer: i64, pid: i32, w: f64, h: f64) -> WindowInfo {
        WindowInfo {
            owner_name: owner.to_string(),
            layer,
            owner_pid: pid,
            x: 100.0,
            y: 200.0,
            width: w,
            height: h,
        }
    }

    #[test]
    fn returns_none_when_no_hearthstone_window() {
        let windows = vec![win("Finder", 0, 1, 800.0, 600.0)];
        assert_eq!(choose(&windows, Some(1)), None);
    }

    #[test]
    fn skips_non_zero_layer() {
        let windows = vec![win("Hearthstone", 25, 7, 800.0, 600.0)];
        assert_eq!(choose(&windows, Some(7)), None);
    }

    #[test]
    fn picks_largest_area_hearthstone_window() {
        let windows = vec![
            win("Hearthstone", 0, 7, 200.0, 100.0),
            win("Hearthstone", 0, 7, 1600.0, 900.0),
            win("Finder", 0, 1, 4000.0, 4000.0),
        ];
        let chosen = choose(&windows, Some(7)).expect("a window");
        assert_eq!((chosen.width, chosen.height), (1600.0, 900.0));
    }

    #[test]
    fn foreground_true_when_frontmost_pid_matches_owner() {
        let windows = vec![win("Hearthstone", 0, 7, 1600.0, 900.0)];
        assert!(choose(&windows, Some(7)).expect("win").foreground);
    }

    #[test]
    fn foreground_false_when_frontmost_pid_differs() {
        let windows = vec![win("Hearthstone", 0, 7, 1600.0, 900.0)];
        assert!(!choose(&windows, Some(99)).expect("win").foreground);
    }

    #[test]
    fn foreground_false_when_frontmost_unknown() {
        let windows = vec![win("Hearthstone", 0, 7, 1600.0, 900.0)];
        assert!(!choose(&windows, None).expect("win").foreground);
    }

    #[test]
    fn maps_bounds_and_sets_visible_not_minimized() {
        let windows = vec![win("Hearthstone", 0, 7, 1600.0, 900.0)];
        let c = choose(&windows, Some(7)).expect("win");
        assert_eq!((c.x, c.y, c.width, c.height), (100.0, 200.0, 1600.0, 900.0));
        assert!(c.visible);
        assert!(!c.minimized);
    }
}
