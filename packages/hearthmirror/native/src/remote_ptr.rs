use std::fmt;
use std::ops::Add;

/// A pointer in the *target* process address space (32-bit Hearthstone).
///
/// Distinct from any host (Rust process) pointer to prevent accidental
/// dereferences. Construct only via `RemotePtr::new(u32)` or `From<u32>`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct RemotePtr(u32);

impl RemotePtr {
    pub const NULL: Self = Self(0);

    pub fn new(addr: u32) -> Self {
        Self(addr)
    }

    pub fn raw(self) -> u32 {
        self.0
    }

    pub fn is_null(self) -> bool {
        self.0 == 0
    }

    /// Add a struct-field offset, returning `None` on 32-bit overflow.
    ///
    /// Prefer this over `+` when the offset comes from a probed value or
    /// other untrusted source: a wrong offset that wraps around to a low
    /// address can otherwise make us read garbage memory and "succeed",
    /// hiding the real bug.
    #[must_use]
    pub fn checked_add(self, rhs: u32) -> Option<Self> {
        self.0.checked_add(rhs).map(Self)
    }

    /// Add a usize-typed offset, validating both that it fits in 32 bits and
    /// that the resulting address does not overflow.
    #[must_use]
    pub fn checked_add_usize(self, rhs: usize) -> Option<Self> {
        u32::try_from(rhs).ok().and_then(|v| self.checked_add(v))
    }
}

impl From<u32> for RemotePtr {
    fn from(addr: u32) -> Self {
        Self(addr)
    }
}

/// Pointer + offset arithmetic.
///
/// Panics on 32-bit overflow. Most call sites pass small (<0x10000) struct-field
/// offsets where overflow is impossible; the panic exists to surface badly probed
/// or corrupted offset configurations early instead of silently wrapping to a
/// low address. If you need fallible arithmetic, use [`RemotePtr::checked_add`].
impl Add<u32> for RemotePtr {
    type Output = RemotePtr;
    #[allow(clippy::panic)]
    fn add(self, rhs: u32) -> RemotePtr {
        match self.0.checked_add(rhs) {
            Some(v) => RemotePtr(v),
            None => panic!("RemotePtr overflow: 0x{:08X} + 0x{:X}", self.0, rhs),
        }
    }
}

impl fmt::Display for RemotePtr {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "0x{:08X}", self.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn null_is_zero() {
        assert!(RemotePtr::NULL.is_null());
        assert_eq!(RemotePtr::NULL.raw(), 0);
    }

    #[test]
    fn add_offset() {
        let p = RemotePtr::new(0x1000);
        assert_eq!((p + 0x10).raw(), 0x1010);
    }

    #[test]
    fn display_is_hex_uppercase_8_digit() {
        assert_eq!(RemotePtr::new(0xABCD).to_string(), "0x0000ABCD");
    }

    #[test]
    fn from_u32_works() {
        let p: RemotePtr = 0xDEADBEEF_u32.into();
        assert_eq!(p.raw(), 0xDEADBEEF);
    }

    #[test]
    fn checked_add_returns_none_on_overflow() {
        let p = RemotePtr::new(u32::MAX - 4);
        assert_eq!(p.checked_add(4), Some(RemotePtr::new(u32::MAX)));
        assert_eq!(p.checked_add(5), None);
    }

    #[test]
    fn checked_add_usize_rejects_oversized_offset() {
        let p = RemotePtr::new(0x1000);
        assert_eq!(p.checked_add_usize(0x10), Some(RemotePtr::new(0x1010)));
        assert!(p.checked_add_usize(usize::MAX).is_none());
    }

    #[test]
    #[should_panic(expected = "RemotePtr overflow")]
    fn add_panics_on_overflow() {
        let _ = RemotePtr::new(u32::MAX) + 1;
    }
}
