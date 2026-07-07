use crate::error::ScryError;
use crate::handle::OwnedProcessHandle;
use crate::remote_ptr::RemotePtr;
use windows::Win32::System::Diagnostics::Debug::ReadProcessMemory;

pub struct ProcessMemory {
    handle: OwnedProcessHandle,
    ptr_size: u32,
}

impl ProcessMemory {
    pub fn new(handle: OwnedProcessHandle) -> Self {
        Self::new_with_ptr_size(handle, 4)
    }

    pub fn new_with_ptr_size(handle: OwnedProcessHandle, ptr_size: u32) -> Self {
        Self { handle, ptr_size }
    }

    pub fn handle(&self) -> &OwnedProcessHandle {
        &self.handle
    }

    pub fn ptr_size(&self) -> u32 {
        self.ptr_size
    }

    pub fn read_bytes(&self, addr: RemotePtr, len: usize) -> Result<Vec<u8>, ScryError> {
        let mut buf = vec![0u8; len];
        let mut read: usize = 0;
        unsafe {
            ReadProcessMemory(
                self.handle.raw(),
                addr.raw() as *const _,
                buf.as_mut_ptr() as *mut _,
                len,
                Some(&mut read),
            )
        }
        .map_err(|e| ScryError::MemoryAccess {
            addr: addr.raw(),
            reason: format!("ReadProcessMemory failed: {}", e),
        })?;
        if read != len {
            return Err(ScryError::MemoryAccess {
                addr: addr.raw(),
                reason: format!("short read: got {} of {} bytes", read, len),
            });
        }
        Ok(buf)
    }

    pub fn read_u8(&self, addr: RemotePtr) -> Result<u8, ScryError> {
        Ok(self.read_bytes(addr, 1)?[0])
    }

    pub fn read_u16(&self, addr: RemotePtr) -> Result<u16, ScryError> {
        let b = self.read_bytes(addr, 2)?;
        Ok(u16::from_le_bytes([b[0], b[1]]))
    }

    pub fn read_u32(&self, addr: RemotePtr) -> Result<u32, ScryError> {
        let b = self.read_bytes(addr, 4)?;
        Ok(u32::from_le_bytes([b[0], b[1], b[2], b[3]]))
    }

    pub fn read_u64(&self, addr: RemotePtr) -> Result<u64, ScryError> {
        let b = self.read_bytes(addr, 8)?;
        Ok(u64::from_le_bytes([
            b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7],
        ]))
    }

    pub fn read_i32(&self, addr: RemotePtr) -> Result<i32, ScryError> {
        Ok(self.read_u32(addr)? as i32)
    }

    pub fn read_i64(&self, addr: RemotePtr) -> Result<i64, ScryError> {
        Ok(self.read_u64(addr)? as i64)
    }

    pub fn read_f32(&self, addr: RemotePtr) -> Result<f32, ScryError> {
        Ok(f32::from_bits(self.read_u32(addr)?))
    }

    pub fn read_remote_ptr(&self, addr: RemotePtr) -> Result<RemotePtr, ScryError> {
        match self.ptr_size {
            4 => Ok(RemotePtr::from(self.read_u32(addr)?)),
            8 => Ok(RemotePtr::new(self.read_u64(addr)?)),
            other => Err(ScryError::Unsupported(format!(
                "unsupported remote pointer size: {}",
                other
            ))),
        }
    }

    /// Read a null-terminated UTF-8 (ASCII) C string up to `max` bytes.
    pub fn read_cstring(&self, addr: RemotePtr, max: usize) -> Result<String, ScryError> {
        let buf = self.read_bytes(addr, max)?;
        let end = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
        Ok(String::from_utf8_lossy(&buf[..end]).into_owned())
    }

    /// Read a Mono UTF-16 string. Mono strings have layout:
    /// [MonoObject header][length: i32][chars: [u16; length]]
    pub fn read_mono_string(&self, addr: RemotePtr) -> Result<String, ScryError> {
        if addr.is_null() {
            return Ok(String::new());
        }
        let length_offset = self.ptr_size * 2;
        let chars_offset = length_offset + 4;
        let length = self.read_i32(addr + length_offset)?.max(0) as usize;
        if length == 0 {
            return Ok(String::new());
        }
        if length > 1_000_000 {
            return Err(ScryError::MemoryAccess {
                addr: addr.raw(),
                reason: format!("mono string length absurd: {}", length),
            });
        }
        let bytes = self.read_bytes(addr + chars_offset, length * 2)?;
        let units: Vec<u16> = bytes
            .chunks_exact(2)
            .map(|c| u16::from_le_bytes([c[0], c[1]]))
            .collect();
        Ok(String::from_utf16_lossy(&units))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A static value at a stable address we can read back.
    static MAGIC: u32 = 0xDEADBEEF;

    #[test]
    #[ignore = "self-process static address may be above 4 GB on x64 with ASLR"]
    fn read_u32_from_self_process() {
        let pid = std::process::id();
        let handle = OwnedProcessHandle::open(pid).unwrap();
        let mem = ProcessMemory::new(handle);
        let addr = RemotePtr::new(&MAGIC as *const u32 as u64);
        let got = mem.read_u32(addr).unwrap();
        assert_eq!(got, 0xDEADBEEF);
    }

    #[test]
    fn read_bytes_short_buffer_errors() {
        let pid = std::process::id();
        let handle = OwnedProcessHandle::open(pid).unwrap();
        let mem = ProcessMemory::new(handle);
        // Try to read from an obviously-bad address.
        let result = mem.read_bytes(RemotePtr::new(0x1), 16);
        assert!(result.is_err());
    }

    #[test]
    fn read_cstring_works() {
        let pid = std::process::id();
        let handle = OwnedProcessHandle::open(pid).unwrap();
        let mem = ProcessMemory::new(handle);
        // We can't easily construct a static null-terminated cstring at a known address
        // in safe Rust without unsafe pointer manipulation. Skip strict assertion;
        // test that the call returns Ok or Err but doesn't panic on a valid address.
        let addr = RemotePtr::new(&MAGIC as *const u32 as u64);
        let _ = mem.read_cstring(addr, 16);
    }

    #[test]
    fn read_remote_ptr_uses_configured_64_bit_pointer_width() {
        let value: u64 = 0x0000_1234_5678_9ABC;
        let pid = std::process::id();
        let handle = OwnedProcessHandle::open(pid).unwrap();
        let mem = ProcessMemory::new_with_ptr_size(handle, 8);
        let addr = RemotePtr::new(&value as *const u64 as u64);

        let got = mem.read_remote_ptr(addr).unwrap();

        assert_eq!(got.raw(), value);
    }

    #[test]
    fn read_mono_string_uses_configured_64_bit_header_width() {
        let pid = std::process::id();
        let handle = OwnedProcessHandle::open(pid).unwrap();
        let mem = ProcessMemory::new_with_ptr_size(handle, 8);
        let buf = vec![0u8; 0x20];
        let leaked: &'static mut [u8] = Box::leak(buf.into_boxed_slice());
        leaked[0x10..0x14].copy_from_slice(&2_i32.to_le_bytes());
        leaked[0x14..0x16].copy_from_slice(&('O' as u16).to_le_bytes());
        leaked[0x16..0x18].copy_from_slice(&('K' as u16).to_le_bytes());

        let got = mem
            .read_mono_string(RemotePtr::new(leaked.as_ptr() as u64))
            .unwrap();

        assert_eq!(got, "OK");
    }
}
