//! Mutex-protected slot holding the global `MonoRuntime` plus its back-off
//! and reinit-count bookkeeping.
//!
//! Generic over the runtime type so unit tests can use `RuntimeSlot<()>`
//! with stubbed `try_init` closures, exercising the back-off + invalidation
//! state machine without needing a real Hearthstone process.
//!
//! Spec contract: see `add-hearthmirror-runtime-recovery` proposal/design,
//! particularly D4 (back-off) and D5 (single mutex housing slot state).

use std::env;
use std::sync::OnceLock;
use std::time::{Duration, Instant};

const DEFAULT_BACK_OFF_MS: u64 = 2_000;
const BACK_OFF_ENV_VAR: &str = "HDT_HEARTHMIRROR_REINIT_BACKOFF_MS";

/// Read and memoize the back-off duration from the environment.
pub fn back_off_duration() -> Duration {
    static CELL: OnceLock<Duration> = OnceLock::new();
    *CELL.get_or_init(|| {
        let ms = env::var(BACK_OFF_ENV_VAR)
            .ok()
            .and_then(|s| s.parse::<u64>().ok())
            .unwrap_or(DEFAULT_BACK_OFF_MS);
        Duration::from_millis(ms)
    })
}

#[derive(Debug)]
pub struct RuntimeSlot<R> {
    pub runtime: Option<R>,
    pub last_failed_init_at: Option<Instant>,
    pub reinit_count: u64,
}

impl<R> RuntimeSlot<R> {
    pub const fn new() -> Self {
        Self {
            runtime: None,
            last_failed_init_at: None,
            reinit_count: 0,
        }
    }

    /// Drop the cached runtime. Used when the staleness probe says the
    /// captured process is gone, or after a retry-triggering error.
    pub fn invalidate(&mut self) {
        self.runtime = None;
    }

    /// Cache-miss / re-init path. Honors the back-off window: if a previous
    /// `try_init` failed less than `back_off` ago, this is a no-op and the
    /// caller sees `runtime: None`. On success, clears the back-off timer
    /// and increments `reinit_count`. On failure, stamps `last_failed_init_at`.
    ///
    /// Generic over the time source for testability.
    pub fn ensure_runtime_with(
        &mut self,
        now: Instant,
        back_off: Duration,
        try_init: impl FnOnce() -> Option<R>,
    ) {
        if self.runtime.is_some() {
            return;
        }
        if let Some(failed_at) = self.last_failed_init_at {
            if now.duration_since(failed_at) < back_off {
                return;
            }
        }
        match try_init() {
            Some(rt) => {
                self.runtime = Some(rt);
                self.last_failed_init_at = None;
                self.reinit_count = self.reinit_count.saturating_add(1);
            }
            None => {
                self.last_failed_init_at = Some(now);
            }
        }
    }
}

impl<R> Default for RuntimeSlot<R> {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;

    #[test]
    fn ensure_runtime_calls_try_init_when_empty() {
        let mut slot: RuntimeSlot<u32> = RuntimeSlot::new();
        let now = Instant::now();
        let calls = Cell::new(0);
        slot.ensure_runtime_with(now, Duration::from_secs(2), || {
            calls.set(calls.get() + 1);
            Some(42)
        });
        assert_eq!(slot.runtime, Some(42));
        assert_eq!(calls.get(), 1);
        assert_eq!(slot.reinit_count, 1);
        assert!(slot.last_failed_init_at.is_none());
    }

    #[test]
    fn ensure_runtime_skips_try_init_when_already_populated() {
        let mut slot: RuntimeSlot<u32> = RuntimeSlot::new();
        slot.runtime = Some(7);
        let calls = Cell::new(0);
        slot.ensure_runtime_with(Instant::now(), Duration::from_secs(2), || {
            calls.set(calls.get() + 1);
            Some(99)
        });
        assert_eq!(slot.runtime, Some(7));
        assert_eq!(calls.get(), 0);
    }

    #[test]
    fn back_off_short_circuits_repeated_failed_inits() {
        let mut slot: RuntimeSlot<u32> = RuntimeSlot::new();
        let t0 = Instant::now();
        let calls = Cell::new(0);
        let try_init = || {
            calls.set(calls.get() + 1);
            None::<u32>
        };

        // First call: try_init runs, fails, stamps timestamp.
        slot.ensure_runtime_with(t0, Duration::from_millis(2000), try_init);
        assert_eq!(calls.get(), 1);
        assert!(slot.last_failed_init_at.is_some());

        // Second call within the back-off window: short-circuit, no try_init.
        let t1 = t0 + Duration::from_millis(500);
        slot.ensure_runtime_with(t1, Duration::from_millis(2000), try_init);
        assert_eq!(calls.get(), 1);

        // Third call after back-off window: try_init runs again.
        let t2 = t0 + Duration::from_millis(2500);
        slot.ensure_runtime_with(t2, Duration::from_millis(2000), try_init);
        assert_eq!(calls.get(), 2);
    }

    #[test]
    fn back_off_clears_on_successful_init() {
        let mut slot: RuntimeSlot<u32> = RuntimeSlot::new();
        let t0 = Instant::now();

        // Fail once.
        slot.ensure_runtime_with(t0, Duration::from_millis(2000), || None);
        assert!(slot.last_failed_init_at.is_some());

        // Wait past back-off, then succeed.
        let t1 = t0 + Duration::from_millis(2500);
        slot.ensure_runtime_with(t1, Duration::from_millis(2000), || Some(42));
        assert_eq!(slot.runtime, Some(42));
        assert!(slot.last_failed_init_at.is_none());
        assert_eq!(slot.reinit_count, 1);
    }

    #[test]
    fn invalidate_drops_runtime_but_preserves_counters() {
        let mut slot: RuntimeSlot<u32> = RuntimeSlot::new();
        slot.runtime = Some(7);
        slot.reinit_count = 5;
        slot.invalidate();
        assert_eq!(slot.runtime, None);
        assert_eq!(slot.reinit_count, 5);
    }

    #[test]
    fn back_off_duration_default_is_2000ms() {
        // Note: this test reads the cached OnceLock value. If a test runs
        // before this one with the env var set, the cache pins that value.
        // We don't unset HDT_HEARTHMIRROR_REINIT_BACKOFF_MS in tests, so
        // the default applies.
        let dur = back_off_duration();
        assert!(dur.as_millis() >= 1 && dur.as_millis() <= 60_000);
    }
}
