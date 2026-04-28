## 1. 跨 image 类查找 + 多 image 缓存

- [x] 1.1 修改 `RuntimeCache`：把 `ac_image: Option<RemotePtr>` 改为
      `images: HashMap<String, RemotePtr>`；删除 `ac_image` 字段，
      `find_ac_image_cached` 内部改为 `find_image_cached("Assembly-CSharp.dll")` 调用
- [x] 1.2 实现 `MonoRuntime::find_image_cached(image_name)`：从 `domain_assemblies`
      walk，按 `name.ends_with(image_name) || name == trim_end_matches(".dll")`
      规则匹配；命中写入 `cache.images`；未命中返回 `ScryError::ModuleNotFound`
- [x] 1.3 实现 `MonoRuntime::find_class_in_image(image_name, namespace, name)`：
      检查 `RuntimeCache::classes` 缓存（key 前缀加 `image_name`），调
      `find_image_cached` + `MonoImage::find_class`；写缓存；缺失返回 `ClassNotFound`
- [x] 1.4 单元测试 `runtime_image_cache.rs`（mock-style，不需要游戏运行）：
      - `find_image_cached` 缓存命中复用结果
      - `find_image_cached` 未命中时返回 `ModuleNotFound`
      - `find_class_in_image` cache key 与 `find_class` cache key 不冲突
      （`Foo` 在两个 image 中各有一份时返回不同 ref）
- [x] 1.5 修改 `find_ac_image_cached` 实现为单行 `self.find_image_cached("Assembly-CSharp.dll")`
- [x] 1.6 `cargo test -p hearthmirror-native --lib --all-features` 通过；
      `cargo clippy -p hearthmirror-native --lib --all-features -- -D warnings` 通过
- [x] 1.7 提交 `feat(hearthmirror): cross-image MonoClass lookup`

## 2. Dictionary entry-array layout fix（fixture-backed test 优先 / TDD）

- [x] 2.1 在 `tests/fixtures/dictionary.rs`（如不存在则创建）写一个
      `make_dict_bytes(count: i32, entries: &[(i32, RemotePtr, RemotePtr)]) -> Vec<u8>`
      工具，按 spec 中布局填充（vtable=0, monitor=0, _buckets=0, _entries 指向
      内嵌 array, _count 在 +0x20 等）
- [x] 2.2 在 `src/collections/dict.rs` 加测试 `iter_entries_layout_verified`：
      用 fixture 构造 5 个 entry，第 1 / 3 个 hash<0；断言返回 `Vec<DictEntry>` 长度 3 + 地址正确
- [x] 2.3 加测试 `iter_entries_overflow_guard`：fixture _count = 1_000_000
      → 断言 `Err(CollectionOverflow { max: 100 })`
- [x] 2.4 加测试 `iter_entries_empty_returns_empty`：_count=0 + entries 非 NULL
      → 断言 `Ok(vec![])`
- [x] 2.5 在 `dict.rs` 顶部用 `const _ENTRIES_OFFSET: u32 = 0x0C; const _COUNT_OFFSET: u32 = 0x20;`
      （或等价 const block）替换 inline magic numbers，并加注释 "VERIFIED 2026-04-20
      against Blizzard.T5.Services.ServiceLocator.m_services per add-hearthmirror-service-locator"
- [x] 2.6 把 `iter_entries` 中的 `dict + 0x14` / `dict + 0x18` 改为 `dict + _ENTRIES_OFFSET` / `dict + _COUNT_OFFSET`
- [x] 2.7 跑 2.2 / 2.3 / 2.4 测试 → 必须先因旧偏移 fail，然后改完后 pass（TDD red→green）
- [x] 2.8 `cargo clippy --lib --all-features -- -D warnings` 通过
- [x] 2.9 提交 `fix(hearthmirror): correct Dictionary entry-array offsets (_count +0x20, _entries +0x0C)`

## 3. ServiceLocator 模块（核心实现）

- [x] 3.1 在 `src/reflection/field_paths.rs` 新增三个常量：
      `pub const SVC_LOCATOR_DLL: &str = "Blizzard.T5.ServiceLocator.dll";`
      `pub const CLS_SERVICE_MANAGER: (&str, &str) = ("Blizzard.T5.Services", "ServiceManager");`
      `pub const SVC_NET_CACHE: &str = "NetCache";`
      并更新 `CLS_NET_CACHE` 注释说明已不被三个 NetCache 反射器使用
- [x] 3.2 在 `src/reflection/field_paths.rs` 加 `ServiceManager` / `ServiceLocator` / `ServiceInfo` 字段名常量：
      `FLD_S_RUNTIME_SERVICES`, `FLD_M_SERVICES`, `FLD_SERVICE_TYPE_NAME`,
      `FLD_SERVICE`（即 `<Service>k__BackingField`）
- [x] 3.3 创建 `src/reflection/service_locator.rs` 实现
      `pub fn get_service_by_name(rt: &MonoRuntime, name: &str) -> Result<Option<MonoObject>, ScryError>`：
      - 通过 `rt.find_class_in_image(SVC_LOCATOR_DLL, "Blizzard.T5.Services", "ServiceManager")`
        拿 ServiceManager class，未命中（ClassNotFound / ModuleNotFound）→ `Ok(None)`
      - 读 `static_field_data + offset_of(s_runtimeServices)` 拿 ServiceLocator 实例
      - `MonoObject::from_address` → 读 `m_services` field → Dictionary 指针
      - `dict::iter_entries(mem, dict, 16, 1024)`
      - 对每个 entry，读 `value = entry_addr + 0x0C` 即 `ServiceInfo*`
      - `MonoObject::from_address(value)` 拿 ServiceInfo
      - `read_string_field(FLD_SERVICE_TYPE_NAME)` 比较 == name
      - 命中：返回 `read_object_field(FLD_SERVICE)`
- [x] 3.4 在 `src/reflection/mod.rs` 注册新模块 `pub mod service_locator;`
- [x] 3.5 单元测试 `service_locator_layout_constants`：断言常量值符合
      spec（防止 typo）
- [x] 3.6 提交 `feat(hearthmirror): add ServiceLocator chain helper`

## 4. MonoRuntime::get_service 缓存层

- [x] 4.1 在 `RuntimeCache` 加字段
      `services: HashMap<String, RemotePtr>`（key=name, value=service object addr）
- [x] 4.2 实现 `MonoRuntime::get_service(name) -> Result<Option<MonoObject>, ScryError>`：
      - 缓存命中：读 `addr + offsets.object.vtable`，再读 `vtable + offsets.vtable.klass`，
        若两者都非 NULL → 用缓存 addr 调 `MonoObject::from_address` 返回；
        若任一 NULL 或读失败 → 从 `services` cache 中移除该 key，重新走 cache miss 路径
      - 缓存未命中：调 `service_locator::get_service_by_name(self, name)`，
        命中则写 `services` cache（值为 `obj.addr`）+ 返回 `Some(obj)`；
        未命中返回 `Ok(None)`（不写 cache）
- [x] 4.3 单元测试 `get_service_cache_evicts_stale`：
      手动写一个不存在的 addr 到 `cache.services["NetCache"]`，
      然后调 `get_service("NetCache")` 应返回 `Ok(None)` 且 cache 中该 key 被移除
- [x] 4.4 提交 `feat(hearthmirror): add MonoRuntime::get_service with stale-pointer eviction`

## 5. 改写 NetCache 三个反射方法（Phase 1，被 Section 8 重写）

> Phase 1 落地后，Run 9 实测三方法仍 null/zero — `BattleTag` / `BnetAccountInfo`
> 不在 NetCache 上、`MedalData` 不是 Dictionary 而是 `Blizzard.T5.Core.Map`。
> 实际生产实现见 Section 8（BnetPresenceMgr 链 + custom_map）。Phase 1 的
> ServiceLocator 路径仍由 `medal_info` 的外层 NetCache lookup 与 `match_info` /
> `server` / `game_state` 等其他反射器使用。

- [x] 5.1 `src/reflection/battle_tag.rs`：
      `runtime.get_singleton(CLS_NET_CACHE.0, CLS_NET_CACHE.1)?`
      → `runtime.get_service(SVC_NET_CACHE)?`；其余字段链不动
- [x] 5.2 `src/reflection/account_id.rs`：同上替换
- [x] 5.3 `src/reflection/medal_info.rs`：同上替换
- [x] 5.4 检查 `src/lib.rs` 的 `getBattleTag` / `getAccountId` / `getMedalInfo` 三个 napi
      函数签名与返回类型字面**没有变化**（grep 比对前后）
- [x] 5.5 `cargo clippy -p hearthmirror-native --all-features -- -D warnings` 通过
- [x] 5.6 `cargo test -p hearthmirror-native --lib --all-features` 通过
- [x] 5.7 提交 `refactor(hearthmirror): route NetCache reflectors through ServiceLocator`

## 6. 实战验证 + 文档收口（Phase 1，被 Section 8.5 替换）

> Run 9 实测发现三方法仍 null/zero（lookup 成功但字段已迁移），触发 Phase 2
> 深挖。Run 9 段已写入 spike 文档；R-16 关闭标记落在 Run 10（Phase 2）。

- [x] 6.1 在游戏运行的环境下 `cargo run --release --example dump_reflection`：
      验证 `getBattleTag` / `getAccountId` / `getMedalInfo` 三者均输出 `ok` 状态、
      battle tag 字符串非空、accountId hi/lo 都不全是 0、`getMedalInfo` 至少一个
      ladder 节点非空（若用户当前赛季打过）
      → Phase 1 实测 3 全 null/empty，触发 Phase 2 (Section 8)；最终验证见 8.5.1
- [x] 6.2 把实测 dump_reflection 输出的关键统计（"X OK / Y null / Z ERR" 行）
      写入 `docs/spikes/0003-hearthmirror-reflection-runtime-validation.md`
      新加的 `## Run 9` 段
- [x] 6.3 在同一个 Run 9 段记录三个示例返回（battle tag、accountId hi/lo 截断、
      medalInfo 当前赛季 leagueId / starLevel），并标注"R-16 closed"
      → Phase 1 三返回均空，"R-16 closed" 标记移到 Run 10
- [x] 6.4 在 Run 9 末尾列出仍 null 的方法名 + 暂定后续归宿（R-17 / R-18）
- [x] 6.5 提交 `docs(spikes): record post-ServiceLocator reflection bridge state`
      → 合并入 `ca30358 feat(hearthmirror): finish R-16 with custom_map + BnetPresenceMgr chains`

## 7. Phase 1 OpenSpec 节点（ServiceLocator 着陆）

- [x] 7.1 `openspec validate add-hearthmirror-service-locator --strict` 通过
- [ ] 7.2 在所有上面的提交合并到主分支后，按 OpenSpec archive 流程归档此 change
      （由 `openspec-archive-change` 流程负责）
      → 由 `/opsx:archive add-hearthmirror-service-locator` 触发；与 8.5.6 同步

## 8. Phase 2 范围扩展（Spike Run 10 触发）

> **背景**：5.0 完成后做 6.0 实战验证时，发现 ServiceLocator 走通了但
> `getBattleTag` / `getAccountId` 仍 null、`getMedalInfo` 字段全 0。
> 进一步对照活进程发现：
> 1. `NetCache.m_netCache` 的运行时类不是
>    `System.Collections.Generic.Dictionary` 而是 `Blizzard.T5.Core.Map<K,V>`
>    （Blizzard 自研哈希表，slot 布局完全不同）；
> 2. `BattleTag` / `BnetAccountInfo` 已迁出 NetCache，分别落在
>    `Assembly-CSharp.dll` 的 `BnetPresenceMgr` 单例下；
> 3. `NetCacheMedalInfo.MedalData` 不再是单一记录，而是
>    `Map<FormatType (i32), PegasusUtil.MedalInfoData>` —— 内层又一个
>    `Blizzard.T5.Core.Map`。
>
> 这些发现在 R-16 内一次性补完，避免再开新 change。

### 8.1 `Blizzard.T5.Core.Map<K,V>` 迭代器

- [x] 8.1.1 新模块 `src/collections/custom_map.rs`：定义
      `MAP_LINK_SLOTS_OFFSET=0x0C` / `MAP_KEY_SLOTS_OFFSET=0x10` /
      `MAP_VALUE_SLOTS_OFFSET=0x14` / `MAP_TOUCHED_SLOTS_OFFSET=0x1C` /
      `MAP_COUNT_OFFSET=0x24` 等常量；
      实现 `iter_entries(memory, map, max_items) -> Vec<(RemotePtr, RemotePtr)>`，
      walk `linkSlots[0..touchedSlots]`，按 `HashCode != 0` 过滤掉空槽
- [x] 8.1.2 在 `src/collections/mod.rs` 注册 `pub mod custom_map;`
- [x] 8.1.3 单元测试三连：`null_map_returns_empty` / `iter_entries_skips_zero_hash_slots`
      （5 槽，3 populated，断言只返 3）/ `iter_entries_overflow_guard`
      （touchedSlots=1_000_000 → `CollectionOverflow`）/
      `iter_entries_empty_returns_empty`（touchedSlots=0）

### 8.2 继承字段查找（`MonoObject.field_offset` 父类回退）

- [x] 8.2.1 `MonoObject` 新增私有方法 `field_offset(memory, field)`：
      先查 `self.fields`（own-class 快路径），未命中调
      `find_field` 走 `MonoClassRef::find_field` 父类链
- [x] 8.2.2 把 `read_string_field` / `read_int32_field` / `read_int64_field` /
      `read_bool_field` / `read_object_field` / `read_pointer_field`
      全部改用 `field_offset`
- [x] 8.2.3 顺手新增 `read_uint32_field` / `read_uint64_field`
      （EntityId.high_/low_ 是 `ulong`，未来其他 protobuf 字段也用得着）

### 8.3 `BnetPresenceMgr` 链路 + reflectors 重写

- [x] 8.3.1 在 `field_paths.rs` 加 `CLS_BNET_PRESENCE_MGR` /
      `FLD_MY_BATTLENET_ACCOUNT_ID` / `FLD_MY_PLAYER` /
      `FLD_MY_ACCOUNT` / `FLD_MY_BATTLE_TAG` /
      `FLD_BATTLE_TAG_NAME` / `FLD_BATTLE_TAG_NUMBER`
      （`m_number` 是 `string`，不是 i32 —— 活验证 #5630）/
      `FLD_ENTITY_ID_BACKING` / `FLD_ENTITY_HIGH` / `FLD_ENTITY_LOW`
- [x] 8.3.2 `getAccountId` 重写：`BnetPresenceMgr.s_instance →
      m_myBattleNetAccountId → <EntityId>k__BackingField → {high_, low_}`
      （`<EntityId>k__BackingField` 在父类 `BnetEntityId` 上，靠
      8.2 的继承字段回退兜底）
- [x] 8.3.3 `getBattleTag` 重写：`s_instance → m_myPlayer → m_account →
      m_battleTag → {m_name, m_number}`，`full_battle_tag = "{name}#{number}"`
- [x] 8.3.4 把旧 `FLD_BATTLE_TAG_STRING` / `FLD_ACCOUNT_HI` / `FLD_ACCOUNT_LO`
      留作"legacy aliases"块给 `match_info.rs` 后续验证用，
      并在 `field_paths.rs` 注释里写明出处与原因

### 8.4 `getMedalInfo` 二级 Map 解析

- [x] 8.4.1 在 `field_paths.rs` 加 `FLD_NET_CACHE_MAP="m_netCache"` /
      `CLS_NET_CACHE_MEDAL_INFO="NetCacheMedalInfo"` /
      `FLD_NET_CACHE_MEDAL_DATA="MedalData"` /
      `FLD_NET_CACHE_PREVIOUS_MEDAL="<PreviousMedalInfo>k__BackingField"`，
      并加 `FORMAT_TYPE_*` 常量（0=Unknown, 1=Wild, 2=Standard, 3=Classic, 4=Twist）
- [x] 8.4.2 把 protobuf 风格字段名常量调整为
      `<LeagueId>k__BackingField` / `<StarLevel>k__BackingField` /
      `<Stars>k__BackingField` / `<Streak>k__BackingField` /
      `<SeasonWins>k__BackingField` / `_LegendRank` / `_SeasonId` /
      `_BestStarLevel`
- [x] 8.4.3 重写 `getMedalInfo`：
      - 外层 `NetCache.m_netCache` 用 `custom_map::iter_entries` 遍历，
        按 vtable→klass→name 找 `NetCacheMedalInfo` entry
      - 内层 `MedalData` 再 `custom_map::iter_entries`，
        按 `key_ptr.raw()` 当 FormatType 整数，分发到
        `MedalInfoResult::{wild, standard, classic, twist}`
      - 每个值对象解 8.4.2 的 8 个 i32 字段
- [x] 8.4.4 `MedalInfoResult` schema 由 `{standard, wild, classic, twist}` 四
      字段构成，废弃旧的 `Standard/Wild/Classic/Twist` 4-bucket 直读模式
- [x] 8.4.5 `dump_reflection` 例程的 medal 段输出从 `"MedalInfoResult{...}"`
      占位升级为四档完整字段（含 `streak` / `best`）

### 8.5 Phase 2 实战验证（替换 6.x 段失败结果）

- [x] 8.5.1 `cargo run --release --target i686-pc-windows-msvc --example dump_reflection`
      在游戏运行环境下：
      - `getBattleTag` → `name=纯金的小铁人, full=纯金的小铁人#5630`
      - `getAccountId` → `hi=72057594037927936, lo=206001158`
      - `getMedalInfo.standard` → `lvl=34, stars=3, streak=2, wins=51, season=150`
      （三者全部 OK，含真数据）
- [x] 8.5.2 全套 76 个单元测试通过（`cargo test --release --target i686-pc-windows-msvc --lib`）
- [x] 8.5.3 把 Phase 2 关键发现追加进
      `docs/spikes/0003-hearthmirror-reflection-runtime-validation.md`
      `## Run 10` 段，并标注"R-16 fully closed"
- [x] 8.5.4 提交 `feat(hearthmirror): finish R-16 with custom_map + BnetPresenceMgr chains`
      （包含 `MonoObject.field_offset` 继承字段回退、`Blizzard.T5.Core.Map`
      迭代器、`getBattleTag` / `getAccountId` / `getMedalInfo` 重写）
      → commit `ca30358`
- [x] 8.5.5 `openspec validate add-hearthmirror-service-locator --strict` 二次通过
- [ ] 8.5.6 archive change（`openspec-archive-change` 流程）
