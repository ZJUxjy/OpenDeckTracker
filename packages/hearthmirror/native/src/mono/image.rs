//! `MonoImage<'r>` — a lightweight view over a `MonoImage*` in the target
//! Mono runtime, providing `class_cache` hashtable walking used by
//! `MonoRuntime::find_class` (replaces the legacy `class_def_table` byte-scan
//! probe — see [`add-hearthmirror-image-walking`] design doc).
//!
//! # Layout primer
//!
//! `MonoImage.class_cache` is an **embedded** `MonoInternalHashTable` struct
//! (NOT a pointer to one — see
//! `config/mono-offsets/unity-2021.3.json` `$class_cache_note`). Its layout:
//!
//! ```text
//! offset  type                        field
//! +0x00   void(*)(...)                hash_func
//! +0x04   void*                       key_extract_func
//! +0x08   void*                       next_value_func
//! +0x0C   u32                         size      (bucket count)
//! +0x10   u32                         num_entries
//! +0x14   MonoClass**                 table     (heap array of bucket heads)
//! ```
//!
//! Each bucket head points at the first `MonoClass*` of a singly-linked list
//! whose next pointer lives at `MonoClass.next_class_cache` (= `+0xA0` in the
//! baseline). Classes are inserted under `hash(type_token) % size`.
//!
//! To enumerate every class loaded in the image we iterate `0..size` bucket
//! heads and walk each chain, collecting `MonoClass*`es as we go.

use crate::error::ScryError;
use crate::mono::class::{read_mono_class, MonoClassRef};
use crate::mono::runtime::MonoRuntime;
use crate::remote_ptr::RemotePtr;

/// Hard ceiling on the hashtable bucket count we are willing to walk before
/// giving up — defends against a `size` field whose bytes are corrupt /
/// mis-offset. Real Hearthstone `Assembly-CSharp.dll` has size ≈ 4096–8192.
const MAX_CACHE_SIZE: u32 = 65_536;

/// Hard ceiling on chain length within one bucket. Under a healthy hash we
/// expect ~1 entry per bucket; 4096 is defensive.
const MAX_CHAIN_LENGTH: usize = 4096;

/// Short c-string read window for class / namespace strings. Mono class names
/// rarely exceed 128 bytes in Hearthstone; 256 leaves a generous margin.
const CLASS_STRING_MAX: usize = 256;

/// Lightweight view over a `MonoImage*` pointer, parameterised by the
/// lifetime of its owning `MonoRuntime`.
#[derive(Clone, Copy)]
pub struct MonoImage<'r> {
    pub runtime: &'r MonoRuntime,
    pub addr: RemotePtr,
}

impl<'r> std::fmt::Debug for MonoImage<'r> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("MonoImage").field("addr", &self.addr).finish()
    }
}

impl<'r> MonoImage<'r> {
    /// Construct a view. Does not touch target memory.
    pub fn new(runtime: &'r MonoRuntime, addr: RemotePtr) -> Self {
        Self { runtime, addr }
    }

    /// Read `MonoImage.name` (full file path on Unity BDWGC; see
    /// `unity-2021.3.json` `$name_note`). Returns the empty string when the
    /// field is a NULL pointer (defensive — shouldn't happen for loaded
    /// images).
    pub fn name(&self) -> Result<String, ScryError> {
        let name_off = self.runtime.offsets.structs.image.name;
        let name_ptr = self.runtime.memory.read_remote_ptr(self.addr + name_off)?;
        if name_ptr.is_null() {
            return Ok(String::new());
        }
        self.runtime
            .memory
            .read_cstring(name_ptr, CLASS_STRING_MAX)
    }

    /// Enumerate every `MonoClass*` held in the image's `class_cache`
    /// hashtable. Returns fully-resolved `MonoClassRef`s (fields + static
    /// data all read).
    ///
    /// * `size == 0` ⇒ `Ok(vec![])` + `tracing`-style eprintln warning.
    /// * `size > 0` but enumerate finds 0 valid classes ⇒
    ///   `Err(ScryError::ClassCacheEmpty)` — almost always means the offset
    ///   configuration is stale and we're reading garbage.
    pub fn enumerate_classes(&self) -> Result<Vec<MonoClassRef>, ScryError> {
        let class_ptrs = self.walk_class_cache()?;
        let mut out = Vec::with_capacity(class_ptrs.len());
        for ptr in class_ptrs {
            match read_mono_class(
                &self.runtime.memory,
                ptr,
                self.runtime.offsets.clone(),
            ) {
                Ok(class) => out.push(class),
                Err(_) => continue,
            }
        }
        Ok(out)
    }

    /// Find a class by `(namespace, name)` by walking the class_cache and
    /// reading each candidate's name / namespace strings. Avoids the full
    /// `read_mono_class` round-trip until a match is found.
    ///
    /// Returns `Ok(None)` if no class matches. Returns `Err(..)` only if the
    /// bucket walk itself fails (e.g. `ClassCacheEmpty`).
    pub fn find_class(
        &self,
        namespace: &str,
        name: &str,
    ) -> Result<Option<MonoClassRef>, ScryError> {
        let class_off = &self.runtime.offsets.structs.class;
        let class_ptrs = self.walk_class_cache()?;

        for ptr in class_ptrs {
            // Cheap name-pointer read first so we can short-circuit.
            let name_ptr = match self.runtime.memory.read_remote_ptr(ptr + class_off.name) {
                Ok(p) => p,
                Err(_) => continue,
            };
            if name_ptr.is_null() {
                continue;
            }
            let got_name = match self
                .runtime
                .memory
                .read_cstring(name_ptr, CLASS_STRING_MAX)
            {
                Ok(s) => s,
                Err(_) => continue,
            };
            if got_name != name {
                continue;
            }
            let ns_ptr = match self
                .runtime
                .memory
                .read_remote_ptr(ptr + class_off.name_space)
            {
                Ok(p) => p,
                Err(_) => continue,
            };
            let got_ns = if ns_ptr.is_null() {
                String::new()
            } else {
                match self
                    .runtime
                    .memory
                    .read_cstring(ns_ptr, CLASS_STRING_MAX)
                {
                    Ok(s) => s,
                    Err(_) => continue,
                }
            };
            if got_ns != namespace {
                continue;
            }
            // Full match — resolve to a MonoClassRef.
            return Ok(Some(read_mono_class(
                &self.runtime.memory,
                ptr,
                self.runtime.offsets.clone(),
            )?));
        }

        Ok(None)
    }

    /// Walk every bucket of the embedded `class_cache` hashtable and collect
    /// `MonoClass*` pointers. Does NOT resolve them to `MonoClassRef`s.
    fn walk_class_cache(&self) -> Result<Vec<RemotePtr>, ScryError> {
        let image_off = &self.runtime.offsets.structs.image;
        let ht_off = &self.runtime.offsets.structs.hash_table;
        let class_off = &self.runtime.offsets.structs.class;

        // The hashtable is an EMBEDDED struct at `image.class_cache`, not a
        // pointer — so the base of the hashtable equals `image.addr +
        // image.class_cache`.
        let ht_base = self.addr + image_off.class_cache;

        let size = self.runtime.memory.read_u32(ht_base + ht_off.size)?;
        if size == 0 {
            eprintln!(
                "[hearthmirror] MonoImage.class_cache has size=0 (empty hashtable)"
            );
            return Ok(Vec::new());
        }
        if size > MAX_CACHE_SIZE {
            return Err(ScryError::MetadataError(format!(
                "MonoImage.class_cache.size {} exceeds sanity cap {}; offsets likely wrong",
                size, MAX_CACHE_SIZE
            )));
        }

        let table_ptr = self.runtime.memory.read_remote_ptr(ht_base + ht_off.table)?;
        if table_ptr.is_null() {
            eprintln!(
                "[hearthmirror] MonoImage.class_cache.table is NULL (size={}); treating as empty",
                size
            );
            return Ok(Vec::new());
        }

        let mut collected: Vec<RemotePtr> = Vec::with_capacity(size as usize * 2);
        let next_off = class_off.next_class_cache;

        for i in 0..size {
            let bucket_slot = table_ptr + i * 4;
            let mut cursor = match self.runtime.memory.read_remote_ptr(bucket_slot) {
                Ok(p) => p,
                // Buckets that straddle page boundaries of corrupt state just
                // get skipped — don't let one bad read abort the whole walk.
                Err(_) => continue,
            };
            let mut chain_len = 0usize;
            while !cursor.is_null() && chain_len < MAX_CHAIN_LENGTH {
                collected.push(cursor);
                cursor = match self.runtime.memory.read_remote_ptr(cursor + next_off) {
                    Ok(p) => p,
                    Err(_) => break,
                };
                // Tombstone / self-cycle guard.
                if cursor.raw() < 0x10_000 {
                    break;
                }
                chain_len += 1;
            }
        }

        if collected.is_empty() {
            // size > 0 but walked 0 valid pointers → offsets almost certainly
            // wrong. Surface loudly so diag_* examples / integration tests
            // catch this immediately.
            let image_name = self.name().unwrap_or_else(|_| format!("{}", self.addr));
            return Err(ScryError::ClassCacheEmpty { image: image_name });
        }
        Ok(collected)
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]
mod tests {
    use super::*;

    #[test]
    fn class_cache_empty_error_display() {
        let e = ScryError::ClassCacheEmpty {
            image: "Assembly-CSharp.dll".into(),
        };
        let msg = e.to_string();
        assert!(msg.contains("Assembly-CSharp.dll"));
        assert!(msg.contains("class_cache"));
    }

    #[test]
    fn max_cache_size_is_64k() {
        assert_eq!(MAX_CACHE_SIZE, 65_536);
    }

    #[test]
    fn max_chain_length_is_4k() {
        assert_eq!(MAX_CHAIN_LENGTH, 4096);
    }

    // Behaviour tests that require a running Mono runtime live in
    // `tests/integration_image_walking.rs` (Phase 7 of 5f).
}
