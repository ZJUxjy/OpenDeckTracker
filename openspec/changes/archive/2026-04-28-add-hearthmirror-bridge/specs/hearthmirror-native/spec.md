## ADDED Requirements

### Requirement: Crate 结构与 binding constraints

The `packages/hearthmirror/native/` crate SHALL be a 64-bit Rust `cdylib` built via `napi-rs` 3.x targeting `x86_64-pc-windows-msvc`. It SHALL adhere to all binding constraints in [ADR 0001](../../../docs/adr/0001-hearthmirror-bridge.md) Engineering Constraints section (永不 panic / RemotePtr / dynamic offset probing / mono dll fallback chain / pelite for PE / collection iteration upper bound / ServiceLocator None on miss).

#### Scenario: cdylib + 单 target
- **WHEN** 检查 `packages/hearthmirror/native/Cargo.toml`
- **THEN** `[lib].crate-type` = `["cdylib"]`，`package.napi.triples.additional` 仅含 `x86_64-pc-windows-msvc`

#### Scenario: clippy 静态门禁
- **WHEN** 在 `packages/hearthmirror/native/` 执行 `cargo clippy --release -- -D warnings -D clippy::unwrap_used -D clippy::expect_used -D clippy::panic`
- **THEN** 退出码 0

### Requirement: RemotePtr newtype 与 OwnedProcessHandle RAII

The crate SHALL define `pub struct RemotePtr(u32)` for any address inside the Hearthstone process and `pub struct OwnedProcessHandle` that closes the underlying Win32 HANDLE in `Drop`. Native (host) Rust pointers SHALL never be implicitly converted to or from `RemotePtr`.

#### Scenario: 类型系统拦截宿主/远程指针混淆
- **GIVEN** `fn read_field<T>(memory: &ProcessMemory, addr: RemotePtr) -> Result<T, ScryError>`
- **WHEN** 调用方误传 `&local_var as *const T as usize`
- **THEN** 编译错误（不能从 `usize` 转 `RemotePtr`）

#### Scenario: HANDLE 在 Drop 时关闭
- **WHEN** `OwnedProcessHandle` 离开作用域
- **THEN** 内部 HANDLE 被 `CloseHandle` 关闭（验证：模拟双 close 拿到 ERROR_INVALID_HANDLE）

### Requirement: Mono runtime locate

The crate SHALL locate the Mono runtime in the Hearthstone process by enumerating 32-bit modules with `EnumProcessModulesEx(LIST_MODULES_32BIT)`, matching `mono-2.0-bdwgc.dll` first, then `mono-2.0-sgen.dll`, `mono-2.0-boehm.dll`, then any `mono-*.dll` (case-insensitive). It SHALL parse the PE export table to find `mono_get_root_domain` (using `pelite::PeView::module`), then byte-pattern-match the function body to extract the global `MonoDomain*` storage address. On any pattern mismatch, SHALL return `ScryError::DisasmPatternUnknown` with the raw bytes.

#### Scenario: 沿用 spike 02 经验定位 mono
- **GIVEN** Hearthstone 主菜单运行中
- **WHEN** 调用 native crate 的 mono runtime 入口
- **THEN** 返回的 MonoRuntime 实例的 `mono_module_name` 含 "mono-2.0-bdwgc.dll"，`mono_get_root_domain_va` 是合法 VA，`root_domain_ptr` 非 NULL

#### Scenario: 字节模式不匹配时返回明确错误
- **GIVEN** mono_get_root_domain 函数前 16 字节既非 `A1+ret` 也非 `push ebp/A1/pop ebp/ret`
- **WHEN** 调用 mono runtime 入口
- **THEN** 返回 `Err(ScryError::DisasmPatternUnknown)`，错误信息含 raw bytes hex

### Requirement: 偏移量动态探测

The crate SHALL implement `mono::probe::probe_field_offset(memory, struct_base, validator)` that scans the first 0x100 bytes of a structure as `[RemotePtr; 64]`, returning the index of the first slot satisfying the validator closure. It SHALL be used to discover at minimum: `MonoDomain.loaded_images`, `MonoImage.name`, `MonoImage.assembly_name`, `MonoClass.name`, `MonoClass.fields`, `MonoClassField.offset`. Discovered offsets SHALL be cached in a `MonoOffsets` struct keyed by `mono_module_base`.

#### Scenario: domain_assemblies 漂移时仍能找 loaded_images
- **GIVEN** Hearthstone 主菜单（spike 02 已证 domain_assemblies @0x0C 是 NULL）
- **WHEN** 调 `probe_field_offset` 找 loaded_images
- **THEN** 返回的 offset 为 0x14（与 §7.2 一致）；探测耗时 < 100 ms

#### Scenario: 探测结果缓存
- **WHEN** 第二次 IPC 调用任意 reflection 方法
- **THEN** offset 探测**不**重新执行（已缓存），首次后整体调用耗时 < 10 ms

### Requirement: ECMA-335 disk metadata 读取

The crate SHALL include a `metadata/` module that uses `pelite::PeFile::from_bytes` to read `Assembly-CSharp.dll` (located via the Hearthstone install dir derived from the mono module path), parse the `#~` stream, and provide `find_class_token(namespace, name) -> Option<u32>` for converting class full names to ECMA-335 tokens. If the disk file cannot be located or read, the crate SHALL fall back to reading metadata from `MonoImage.raw_data` field in the running process.

#### Scenario: 解析 Assembly-CSharp.dll 找到已知类
- **GIVEN** 真实 Hearthstone 安装下的 `Assembly-CSharp.dll`
- **WHEN** `find_class_token("Blizzard.T5.Services", "ServiceManager")`
- **THEN** 返回 `Some(token)`，token 是合法 TypeDef token (0x02000000 prefix)

#### Scenario: 磁盘读取失败时 fallback 到内存
- **GIVEN** 磁盘文件路径推算错误（mock 一个不存在的路径）
- **WHEN** 同样调用 `find_class_token`
- **THEN** 自动从 `MonoImage.raw_data` 解析，仍返回正确 token；console 仅 warn 不 error

### Requirement: 集合遍历安全上限

All collection traversal functions (`list::iter`, `dict::iter`, `custom_map::iter`, `glist::iter`) SHALL accept a `max_items` parameter (default `50000`). Iteration SHALL stop and return `Err(ScryError::CollectionOverflow)` when `max_items` is reached.

#### Scenario: 正常遍历不触发上限
- **GIVEN** 一个炉石卡组的 30 条 deck cards List
- **WHEN** `list::iter(memory, list_ptr, 50000)`
- **THEN** 返回 30 个元素，无错误

#### Scenario: 损坏的 GList 触发上限保护
- **GIVEN** mock 一个 next 指针指向自身的 GList（环引用）
- **WHEN** `glist::iter(memory, head, 1000)`
- **THEN** 返回 `Err(ScryError::CollectionOverflow)`，不死循环

### Requirement: ServiceLocator

The crate SHALL implement `service_locator::get_service(memory, runtime, name)` that:
1. Reads `Blizzard.T5.Services.ServiceManager.s_runtimeServices` static field
2. Falls back to `s_dynamicServices.m_serviceLocator` if `s_runtimeServices` is NULL
3. Iterates the resulting `Dictionary<,>` of services
4. Returns the first entry whose `ServiceTypeName` field equals `name`
5. Returns `Ok(None)` if no service matches (NOT an Error)

#### Scenario: 找到已知服务
- **WHEN** `get_service(memory, runtime, "NetCache")`
- **THEN** 返回 `Ok(Some(service_obj))`，`service_obj` 是合法 MonoObject

#### Scenario: 未知服务返回 None
- **WHEN** `get_service(memory, runtime, "NonExistentService")`
- **THEN** 返回 `Ok(None)`，不 throw

### Requirement: 12 个 Reflection 方法

The crate SHALL expose 12 `#[napi]` async functions, all returning `napi::Result<Option<T>>` (resolves to `null` on TypeScript side when data unavailable; rejects only on programming errors / fatal Win32 failures):

| napi name | TS return type |
|---|---|
| `getBattleTag` | `Option<BattleTag>` |
| `getAccountId` | `Option<AccountId>` |
| `getGameType` | `i32` (no Option — 0 = Unknown) |
| `isSpectating` | `bool` |
| `isGameOver` | `bool` |
| `getMatchInfo` | `Option<MatchInfo>` |
| `getMedalInfo` | `Option<MedalInfo>` |
| `getDecks` | `Option<Vec<Deck>>` |
| `getCollection` | `Option<Vec<Card>>` |
| `getArenaDeck` | `Option<ArenaInfo>` |
| `getBattlegroundRatingInfo` | `Option<BattlegroundRatingInfo>` |
| `getServerInfo` | `Option<GameServerInfo>` |

Each method MUST be tested with at least one positive integration scenario (Hearthstone running) and one negative scenario (process not found / data missing).

#### Scenario: getBattleTag 在登录后返回真实 BattleTag
- **GIVEN** 用户已登录战网且炉石主菜单运行
- **WHEN** TypeScript 调用 `await hm.getBattleTag()`
- **THEN** 返回值不为 null，含 `name` (string) 与 `fullBattleTag` (string，形如 `Player#12345`)

#### Scenario: getMedalInfo 含四个赛季的 MedalInfoData
- **WHEN** TypeScript 调用 `await hm.getMedalInfo()`
- **THEN** 返回的 `MedalInfo` 含 `standard` / `wild` / `classic` / `twist` 四个字段（每个为 `MedalInfoData | null`），且至少 `standard` 非 null

#### Scenario: 进程未运行时所有方法返回 null（除 isSpectating/isGameOver/getGameType）
- **GIVEN** Hearthstone 未运行
- **WHEN** 调用任意业务方法
- **THEN** Promise resolve 为 `null`（或 boolean 类方法 resolve 为 `false`/`0`），永不 reject

### Requirement: 永不 panic 暴露面

Every `#[napi]` exported function SHALL have signature `async fn(...) -> napi::Result<T>`. The crate SHALL NOT call `panic!`, `unwrap()`, `expect()`, `todo!()`, `unreachable!()` on any user-controllable input. All `unsafe` Win32 API calls SHALL be wrapped in `Result<T, ScryError>`.

#### Scenario: clippy 静态门禁覆盖
- **WHEN** CI 跑 `cargo clippy -- -D clippy::unwrap_used -D clippy::expect_used -D clippy::panic -D clippy::todo -D clippy::unreachable`
- **THEN** 退出码 0
