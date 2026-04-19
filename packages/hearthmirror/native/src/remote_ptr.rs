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
}

impl From<u32> for RemotePtr {
    fn from(addr: u32) -> Self {
        Self(addr)
    }
}

impl Add<u32> for RemotePtr {
    type Output = RemotePtr;
    fn add(self, rhs: u32) -> RemotePtr {
        RemotePtr(self.0.wrapping_add(rhs))
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
}
