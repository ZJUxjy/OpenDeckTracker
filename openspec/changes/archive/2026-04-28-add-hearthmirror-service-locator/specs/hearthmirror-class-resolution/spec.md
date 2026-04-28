## ADDED Requirements

### Requirement: MonoRuntime cross-image class lookup

`MonoRuntime` SHALL provide
`pub fn find_class_in_image(&self, image_name: &str, namespace: &str,
name: &str) -> Result<MonoClassRef, ScryError>` that resolves a class
inside the named loaded assembly (e.g.
`"Blizzard.T5.ServiceLocator.dll"`) rather than
`Assembly-CSharp.dll`.

The function SHALL:

1. Check `RuntimeCache::classes` keyed by
   `format!("{}::{}::{}", image_name, namespace, name)` — distinct
   key prefix from `find_class` to avoid collision.
2. On miss, resolve `image_name` via the runtime's image cache (see
   "MonoRuntime image cache" requirement below). Match SHALL accept
   either the basename (`"Blizzard.T5.ServiceLocator.dll"`) or the
   stem (`"Blizzard.T5.ServiceLocator"`).
3. Construct `MonoImage::new(self, image_addr)` and call
   `image.find_class(namespace, name)`.
4. On hit, write to `classes` cache with the prefixed key and
   return `Ok(class_ref)`.
5. On miss, return `Err(ScryError::ClassNotFound { namespace, name })`
   (caller-side error type unchanged from `find_class`).
6. If `image_name` is not loaded into the domain, return
   `Err(ScryError::ModuleNotFound(image_name.to_string()))`.

`find_class` (Assembly-CSharp-only) SHALL remain unchanged in
signature and behaviour. Its implementation MAY internally delegate
to `find_class_in_image("Assembly-CSharp.dll", namespace, name)` or
remain its own code path; either is acceptable.

#### Scenario: Resolve ServiceManager from Blizzard.T5.ServiceLocator.dll

- **GIVEN** Hearthstone is running with the standard image set
- **WHEN** `runtime.find_class_in_image("Blizzard.T5.ServiceLocator.dll",
  "Blizzard.T5.Services", "ServiceManager")` is called
- **THEN** result is `Ok(class_ref)` where `class_ref.full_name` is
  `"Blizzard.T5.Services.ServiceManager"` and
  `class_ref.fields["s_runtimeServices"]` is present and equals 0
  (offset within static_field_data)

#### Scenario: Image not loaded

- **WHEN** `runtime.find_class_in_image("DoesNotExist.dll", "", "X")`
  is called
- **THEN** result is `Err(ScryError::ModuleNotFound("DoesNotExist.dll"))`

#### Scenario: Image loaded but class missing

- **WHEN** `runtime.find_class_in_image("Blizzard.T5.ServiceLocator.dll",
  "", "NoSuchClass")` is called
- **THEN** result is `Err(ScryError::ClassNotFound { namespace: "",
  name: "NoSuchClass" })`

#### Scenario: Cache key prefix collision avoided

- **GIVEN** a class named `Foo` exists in both `Assembly-CSharp.dll`
  and `Blizzard.T5.ServiceLocator.dll` with different field maps
- **WHEN** `runtime.find_class("", "Foo")` is called, then
  `runtime.find_class_in_image("Blizzard.T5.ServiceLocator.dll", "",
  "Foo")` is called
- **THEN** the two calls return distinct `MonoClassRef` values pointing
  to the two different physical classes; neither call returns the
  other's cached value

### Requirement: MonoRuntime image cache (multi-image)

`RuntimeCache` SHALL replace its `ac_image: Option<RemotePtr>` field
with `images: HashMap<String, RemotePtr>` keyed by exact basename
match (e.g. `"Assembly-CSharp.dll"`, case-sensitive). The runtime
SHALL provide
`fn find_image_cached(&self, image_name: &str) -> Result<RemotePtr,
ScryError>` that:

1. Returns the cached entry on hit (key = `image_name`).
2. On miss, walks `domain_assemblies` (same loop as today's
   `find_ac_image_cached`) and matches each
   `MonoImage.name`-via-`MonoAssembly.image` against `image_name`
   using the rule `name.ends_with(image_name) || name ==
   image_name.trim_end_matches(".dll")`.
3. On match, inserts into the cache and returns the address.
4. On exhausted assembly list with no match, returns
   `Err(ScryError::ModuleNotFound(image_name.to_string()))`.

`find_ac_image_cached` SHALL be reimplemented as a thin wrapper that
calls `find_image_cached("Assembly-CSharp.dll")`. The current
exact-match defence against `Assembly-CSharp-firstpass.dll` (commit
1431dc6) SHALL be preserved by this matching rule (the trim of
`.dll` then exact-match-or-suffix would NOT match `firstpass`).

#### Scenario: Repeated find_class hits image cache

- **GIVEN** `runtime.find_class("", "GameState")` was called once
- **WHEN** `runtime.find_class_in_image("Blizzard.T5.ServiceLocator.dll",
  "Blizzard.T5.Services", "ServiceManager")` is called subsequently
- **THEN** the assembly list is walked at most once for the
  ServiceLocator image (different cache key from the AC image's first
  hit), and the AC image is NOT re-walked

#### Scenario: Backward compatibility for AC users

- **GIVEN** a caller that uses only `runtime.find_class(ns, name)`
- **WHEN** `find_class("", "CollectionManager")` is called
- **THEN** behaviour is byte-for-byte identical to the pre-change
  implementation (resolves CollectionManager from Assembly-CSharp,
  caches the class ref under key `"::CollectionManager"`, never
  matches `Assembly-CSharp-firstpass.dll`)

#### Scenario: Firstpass collision still defended

- **GIVEN** `Assembly-CSharp-firstpass.dll` precedes
  `Assembly-CSharp.dll` in `domain_assemblies`
- **WHEN** `runtime.find_image_cached("Assembly-CSharp.dll")` is called
- **THEN** the returned image address is `Assembly-CSharp.dll`'s
  address, NOT `Assembly-CSharp-firstpass.dll`'s

