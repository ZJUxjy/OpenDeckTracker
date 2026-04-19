# HearthMirror 重写设计文档

> 用 Rust (Native) + TypeScript (API) 完全替代 HearthMirror 内存读取库

> **Status**: Architecture sections (§1–6 of this document) are **superseded by**
> [`docs/adr/0001-hearthmirror-bridge.md`](docs/adr/0001-hearthmirror-bridge.md).
> In particular, the assumption "must target x86 (32-bit)" is incorrect:
> 64-bit processes can use standard `ReadProcessMemory` to read 32-bit process
> memory by treating remote pointers as `u32`. The chosen architecture is
> **64-bit `napi-rs` native module loaded into Electron main process**.
>
> Sections §7+ (Mono runtime structures, ECMA-335 metadata, offsets, FFI
> examples) remain authoritative reference material for the upcoming
> `add-hearthmirror-bridge` implementation.

## 1. 背景与目标

### 1.1 现有实现分析

HearthMirror 是 Hearthstone Deck Tracker (HDT) 的核心组件，负责读取炉石传说游戏进程内存。当前实现为 C# + C++/CLI 混合模式程序集，采用四层架构：

| 层级 | 组件 | 职责 |
|------|------|------|
| IPC 层 | `HearthMirror.dll` (IpcClient/IpcServer) | 匿名管道 + JSON-RPC 进程间通信 |
| 代理层 | `DispatchProxy` (Remote/LocalReflectionProxy) | 透明远程方法调用 |
| 引擎层 | `untapped-scry-dotnet.dll` (C++/CLI) | Mono 运行时解析 + ReadProcessMemory |
| 业务层 | `HearthMirror.dll` (Reflection) | 60+ 个游戏数据读取方法 |

### 1.2 重写动机

- `untapped-scry-dotnet.dll` 的 **native C++ 代码完全不可见**（零导出函数），无法维护或扩展
- C++/CLI 技术栈小众，开发调试困难
- 想要一个**开源、可维护、跨语言**的替代方案

### 1.3 重写目标

用 **Rust** 重写 native 内存读取引擎（替代 `untapped-scry-dotnet.dll`），用 **TypeScript** 提供高层 API（替代 `HearthMirror.dll` 业务逻辑），完全实现 `IReflection` 接口的全部 60+ 个方法。

### 1.4 关键约束

| 约束 | 说明 |
|------|------|
| 目标架构 | **x86 (32位)** — 炉石传说运行在 32 位 Unity Mono 上 |
| 运行时 | **Unity Mono** (非 IL2CPP)，.NET Framework 4.7.2 |
| Unity 版本 | `"2021.3.25.61228"` (硬编码，需随炉石更新) |
| 操作系统 | **Windows only** |
| DLL 导出 | 原始 DLL 零导出，必须从零重写所有 native 代码 |

---

## 2. 架构设计

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────┐
│                    TypeScript API Layer                   │
│                                                          │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │ HearthMirror│  │ Mirror        │  │ Reflection        │  │
│  │ (公开 API)  │  │ (根镜像访问)  │  │ (60+ 业务方法)    │  │
│  └──────┬───┘  └──────┬───────┘  └────────┬──────────┘  │
│         │              │                    │             │
│  ┌──────┴──────────────┴────────────────────┴──────────┐ │
│  │              ffi-napi (FFI 绑定层)                   │ │
│  └────────────────────────┬────────────────────────────┘ │
└───────────────────────────┼──────────────────────────────┘
                            │ extern "C" FFI
┌───────────────────────────┼──────────────────────────────┐
│                    Rust Native Layer                      │
│                                                           │
│  ┌────────────────────────┴────────────────────────────┐ │
│  │                FFI Bridge (ffi.rs)                   │ │
│  │  Tier 1: 底层字段访问 API                            │ │
│  │  Tier 2: 高层业务方法 API (性能优化)                  │ │
│  └────────────────────────┬────────────────────────────┘ │
│                           │                               │
│  ┌────────────┐  ┌───────┴────────┐  ┌────────────────┐  │
│  │ collections │  │ service.rs     │  │ mono/          │  │
│  │ List/Dict/  │  │ ServiceLocator │  │ 运行时解析引擎 │  │
│  │ Map 遍历    │  │ 模式           │  │                │  │
│  └────────────┘  └────────────────┘  │ ┌────────────┐ │  │
│                                      │ │ runtime.rs │ │  │
│  ┌────────────┐  ┌────────────────┐  │ │ image.rs   │ │  │
│  │ process.rs │  │ memory.rs      │  │ │ class.rs   │ │  │
│  │ 进程/模块  │  │ 内存读取封装   │  │ │ object.rs  │ │  │
│  └────────────┘  └────────────────┘  │ │ field.rs   │ │  │
│                                      │ │ array.rs   │ │  │
│                                      │ │ metadata.rs│ │  │
│                                      │ │ string.rs  │ │  │
│                                      │ └────────────┘ │  │
│                                      └────────────────┘  │
└───────────────────────────┬──────────────────────────────┘
                            │ Windows API
┌───────────────────────────┼──────────────────────────────┐
│                     Hearthstone.exe                        │
│                 (Unity Mono Runtime, x86)                  │
└───────────────────────────────────────────────────────────┘
```

### 2.2 为什么选择这个技术栈

| 选择 | 理由 |
|------|------|
| **Rust (native)** | 零成本 FFI、内存安全、优秀的 Windows API 支持、`extern "C"` 导出标准 C ABI |
| **TypeScript (API)** | 与 HDT 生态兼容、npm 生态成熟、`ffi-napi` 可靠 |
| **32位 x86** | 炉石传说本身是 32 位进程，指针大小必须匹配 |
| **同步 Rust** | `ReadProcessMemory` 是微秒级阻塞调用，无需异步 |
| **异步 TypeScript** | Promise API 与 Node.js 事件循环兼容，方便集成 |

---

## 3. 项目结构

```
hearthmirror/
├── Cargo.toml                       # Rust workspace 根
├── package.json                     # Node.js workspace 根
├── tsconfig.json
├── .cargo/config.toml               # i686-pc-windows-msvc 目标配置
│
├── crates/
│   └── hearthmirror-native/         # Rust crate: 内存读取 + Mono 解析
│       ├── Cargo.toml
│       ├── build.rs                 # 构建脚本 (cc crate 等)
│       └── src/
│           ├── lib.rs               # 公开 API 重导出
│           ├── error.rs             # 错误类型 (thiserror)
│           ├── process.rs           # 进程句柄, 模块枚举
│           ├── memory.rs            # ReadProcessMemory 封装
│           ├── cache.rs             # LRU 缓存
│           ├── ffi.rs               # extern "C" FFI 导出
│           ├── collections.rs       # C# 集合遍历 (List/Dict/Map)
│           ├── service.rs           # Service Locator 模式
│           └── mono/
│               ├── mod.rs           # MonoScry: 入口编排器
│               ├── runtime.rs       # 查找 mono.dll, 定位根域
│               ├── image.rs         # MonoImage: 程序集元数据
│               ├── class.rs         # MonoClass: 类定义 + 字段映射
│               ├── field.rs         # MonoClassField: 字段描述符
│               ├── object.rs        # MonoObject: 实例字段读取
│               ├── struct_.rs       # MonoStruct: 值类型读取
│               ├── array.rs         # MonoArray: 数组读取
│               ├── type_info.rs     # MonoType: 类型分类
│               ├── value.rs         # MonoValue: 变体类型
│               ├── metadata.rs      # ECMA-335 CLI 元数据表解析
│               └── string.rs        # UTF-16 Mono 字符串读取
│
└── packages/
    └── hearthmirror/                # TypeScript 包: 高层 API
        ├── package.json
        ├── tsconfig.json
        ├── bindings.ts              # ffi-napi FFI 声明
        └── src/
            ├── index.ts             # 公开 API 导出
            ├── native.ts            # FFI 封装 + 内存管理
            ├── session.ts           # HmSession 生命周期
            ├── mirror.ts            # Mirror 类 (根镜像 + 链式访问)
            ├── reflection.ts        # 60+ 业务方法实现
            ├── types.ts             # 所有 TypeScript 接口/类型
            ├── enums.ts             # 枚举定义
            ├── errors.ts            # 自定义错误类型
            └── util/
                ├── collection-reader.ts   # List/Dict/Map 遍历辅助
                ├── service-locator.ts     # GetService 辅助
                ├── dict-lookup.ts         # Dictionary 哈希查找
                └── map-lookup.ts          # 自定义 Map 哈希查找
```

---

## 4. Rust Native 层设计

### 4.1 模块职责

#### `process.rs` — 进程与模块枚举

```rust
pub struct ProcessHandle {
    handle: HANDLE,
    pid: u32,
}

pub struct ModuleInfo {
    pub name: String,
    pub base_address: usize,
    pub size: usize,
    pub path: String,
}

impl ProcessHandle {
    /// 查找炉石传说进程
    pub fn find_hearthstone() -> Result<Self, ScryError>;

    /// 通过 PID 打开进程 (需要 PROCESS_VM_READ | PROCESS_QUERY_INFORMATION)
    pub fn open(pid: u32) -> Result<Self, ScryError>;

    /// 枚举已加载模块
    pub fn enumerate_modules(&self) -> Result<Vec<ModuleInfo>, ScryError>;

    /// 查找指定名称的模块
    pub fn find_module(&self, name: &str) -> Result<ModuleInfo, ScryError>;
}
```

使用的 Windows API:
- `OpenProcess` — 打开目标进程句柄
- `CreateToolhelp32Snapshot(SnapshotFlags.Module, pid)` — 创建模块快照
- `Module32First` / `Module32Next` — 遍历模块列表
- `CloseHandle` — 关闭句柄

#### `memory.rs` — 原始内存读取

```rust
pub struct ProcessMemory {
    process: Arc<ProcessHandle>,
    cache: Cache,  // LRU 内存页缓存
}

pub trait MemoryReader {
    fn read_bytes(&self, addr: usize, len: usize) -> Result<Vec<u8>>;
    fn read_u8(&self, addr: usize) -> Result<u8>;
    fn read_i8(&self, addr: usize) -> Result<i8>;
    fn read_u16(&self, addr: usize) -> Result<u16>;
    fn read_i16(&self, addr: usize) -> Result<i16>;
    fn read_u32(&self, addr: usize) -> Result<u32>;
    fn read_i32(&self, addr: usize) -> Result<i32>;
    fn read_u64(&self, addr: usize) -> Result<u64>;
    fn read_i64(&self, addr: usize) -> Result<i64>;
    fn read_f32(&self, addr: usize) -> Result<f32>;
    fn read_f64(&self, addr: usize) -> Result<f64>;
    fn read_ptr(&self, addr: usize) -> Result<usize>;  // 32位指针
    fn read_cstring_utf8(&self, addr: usize) -> Result<String>;
    fn read_mono_string(&self, addr: usize) -> Result<String>;  // UTF-16
    fn read_bool(&self, addr: usize) -> Result<bool>;
}
```

使用的 Windows API:
- `ReadProcessMemory` — 读取目标进程内存
- `VirtualQueryEx` — 查询内存页信息 (验证地址有效性)

#### `mono/runtime.rs` — Mono 运行时定位

```rust
pub struct MonoRuntime {
    mono_module: ModuleInfo,
    domain_addr: usize,
    version: String,
}

impl MonoRuntime {
    /// 查找并初始化 Mono 运行时
    pub fn init(memory: &ProcessMemory, modules: &[ModuleInfo])
        -> Result<Self, ScryError>;

    /// 获取根域地址
    fn find_root_domain(&self) -> Result<usize, ScryError>;

    /// 枚举已加载程序集
    fn enumerate_assemblies(&self) -> Result<Vec<AssemblyInfo>, ScryError>;

    /// 查找指定名称的程序集镜像
    fn find_image(&self, name: &str) -> Result<MonoImageInfo, ScryError>;
}
```

实现策略:
1. 从模块列表中找到 `mono.dll`
2. 解析 mono.dll 的 PE 导出表，查找 `mono_get_root_domain` 等导出函数地址
3. 读取导出函数的机器码，提取返回的域指针
4. 从域结构遍历程序集链表

#### `mono/metadata.rs` — CLI 元数据表解析

```rust
pub struct MetadataReader {
    /// Assembly-CSharp.dll 文件路径 (从磁盘读取)
    file_path: PathBuf,
    /// PE 头信息
    pe_header: PeHeader,
    /// CLI 头信息
    cli_header: CliHeader,
    /// 元数据流
    streams: MetadataStreams,
}

impl MetadataReader {
    /// 从磁盘文件创建元数据读取器
    pub fn from_file(path: &Path) -> Result<Self, ScryError>;

    /// 按名称查找类定义
    pub fn find_class(&self, namespace: &str, name: &str)
        -> Result<ClassDef, ScryError>;

    /// 获取类的所有字段定义
    pub fn get_fields(&self, class: &ClassDef) -> Result<Vec<FieldDef>, ScryError>;

    /// 解析 TypeDef 表
    fn parse_typedef_table(&self) -> Result<Vec<ClassDef>>;

    /// 解析 Field 表
    fn parse_field_table(&self) -> Result<Vec<FieldDef>>;

    /// 解析字段签名 (获取类型信息)
    fn parse_field_signature(&self, blob: &[u8]) -> Result<TypeSignature>;
}
```

ECMA-335 元数据表解析流程:
```
PE Header → Optional Header → Data Directory[14] (CLI Header)
  → CLI Header.MetadataRVA
    → Metadata Root → Stream Headers (#~, #Strings, #Blob, #GUID, #US)
      → #~ Stream → Table Headers (每个表的行数)
      → #~ Stream → Table Rows
```

关键表:
- **TypeDef (0x02)**: 类定义 — 名称、命名空间、父类、字段列表起始索引
- **Field (0x04)**: 字段定义 — 名称、签名
- **FieldRVA (0x1D)**: 静态字段内存布局

#### `mono/class.rs` — 类定义 (运行时)

```rust
pub struct MonoClassDef {
    /// 类全名 (namespace.name)
    pub full_name: String,
    /// 在目标进程中的地址
    pub runtime_addr: usize,
    /// 实例大小 (字节)
    pub instance_size: u32,
    /// 父类地址 (如果有)
    pub parent_addr: Option<usize>,
    /// 字段映射: 字段名 → (偏移量, 类型信息)
    pub fields: HashMap<String, FieldDef>,
    /// 静态字段数据区地址
    pub static_field_data_addr: usize,
}

pub struct FieldDef {
    pub name: String,
    pub offset: u32,
    pub type_info: TypeInfo,
    pub is_static: bool,
}
```

字段偏移解析策略:
1. 从磁盘元数据获取字段**名称**和**类型**
2. 从进程内存中的 `MonoClass` 结构获取字段**运行时偏移量**
3. 偏移量存储在 `MonoClassField.offset` 中（需要知道 MonoClassField 结构布局）

#### `mono/object.rs` — 对象实例读取

```rust
pub struct MonoObject {
    /// 对象在目标进程中的基地址
    pub addr: usize,
    /// 对象的类定义
    pub class_def: MonoClassDef,
}

impl MonoObject {
    /// 从基地址创建对象 (通过 vtable 指针找到类)
    pub fn from_addr(memory: &ProcessMemory, addr: usize,
                     image: &MonoImage) -> Result<Self, ScryError>;

    /// 读取实例字段值
    pub fn read_field(&self, memory: &ProcessMemory, field_name: &str)
        -> Result<MonoValue, ScryError>;

    /// 读取所有实例字段
    pub fn read_all_fields(&self, memory: &ProcessMemory)
        -> Result<HashMap<String, MonoValue>, ScryError>;
}
```

MonoObject 内存布局 (32位):
```
offset 0x00: MonoVTable* vtable  (4 bytes, 指向类的 vtable)
offset 0x04: void* monitor       (4 bytes, 同步块)
offset 0x08: void* sychronization(4 bytes)
offset 0x0C: --- 实例字段开始 ---
offset 0x0C + field_offset: 字段值
```

#### `mono/value.rs` — 变体类型

```rust
#[derive(Clone)]
pub enum MonoValue {
    Null,
    Bool(bool),
    U8(u8),
    I8(i8),
    U16(u16),
    I16(i16),
    U32(u32),
    I32(i32),
    U64(u64),
    I64(i64),
    F32(f32),
    F64(f64),
    String(String),
    Object(MonoObject),
    Struct(MonoStruct),
    Array(MonoArray),
    Class(MonoClassRef),
}
```

对应原始 `_MonoValue` 的 17 个变体:
| 索引 | Native 类型 | Rust 类型 |
|------|------------|-----------|
| 0 | bool | `bool` |
| 1 | unsigned char | `u8` |
| 2 | signed char | `i8` |
| 3 | unsigned short | `u16` |
| 4 | short | `i16` |
| 5 | unsigned int | `u32` |
| 6 | int | `i32` |
| 7 | unsigned __int64 | `u64` |
| 8 | __int64 | `i64` |
| 9 | char | `char` |
| 10 | float | `f32` |
| 11 | double | `f64` |
| 12 | basic_string<char16_t> | `String` (UTF-16) |
| 13 | shared_ptr<MonoClass> | `MonoClassRef` |
| 14 | shared_ptr<MonoObject> | `MonoObject` |
| 15 | shared_ptr<MonoStruct> | `MonoStruct` |
| 16 | shared_ptr<MonoArray> | `MonoArray` |

#### `collections.rs` — C# 集合遍历

```rust
/// 读取 C# List<T> 的元素
pub fn read_list(memory: &ProcessMemory, list_value: &MonoValue)
    -> Result<Vec<MonoValue>> {
    // 1. 读取 _items 字段 → MonoArray
    // 2. 读取 _size 字段 → u32
    // 3. 遍历 _items[0.._size]
}

/// 遍历 C# Dictionary<K,V> 的所有条目
pub fn read_dict_entries(memory: &ProcessMemory, dict_value: &MonoValue)
    -> Result<Vec<(MonoValue, MonoValue)>> {
    // 1. 读取 _count 字段 → u32
    // 2. 读取 _entries 字段 → 数组
    // 3. 遍历 entries[0.._count]，每条读取 key 和 value
}

/// 在 C# Dictionary 中按键查找
pub fn dict_lookup(memory: &ProcessMemory, dict_value: &MonoValue, key: i32)
    -> Result<Option<MonoValue>> {
    // 1. 读取 _buckets 和 _entries
    // 2. hash = key.GetHashCode() & 0x7FFFFFFF
    // 3. index = buckets[hash % bucket_count] - 1
    // 4. 沿 next 链遍历，匹配 hashCode 和 key
}

/// 遍历炉石自定义 Map 的所有条目
pub fn read_custom_map(memory: &ProcessMemory, map_value: &MonoValue)
    -> Result<Vec<(MonoValue, MonoValue)>> {
    // 1. 读取 keySlots 和 valueSlots
    // 2. size = keySlots.size()
    // 3. 遍历 keySlots[0..size] 和 valueSlots[0..size]
}

/// 在炉石自定义 Map 中按键查找
pub fn custom_map_lookup(memory: &ProcessMemory, map_value: &MonoValue, key: i32)
    -> Result<Option<MonoValue>> {
    // 1. 读取 table, keySlots, valueSlots, linkSlots
    // 2. hash = key.GetHashCode() | int.MinValue
    // 3. index = table[(hash & 0x7FFFFFFF) % table_size] - 1
    // 4. 沿 linkSlots[index].Next 链遍历，匹配 HashCode
}
```

#### `service.rs` — Service Locator

```rust
/// 按名称查找炉石服务
pub fn get_service(
    memory: &ProcessMemory,
    root: &MonoImage,
    service_name: &str
) -> Result<Option<MonoObject>> {
    // 1. 访问 Root["Blizzard.T5.Services.ServiceManager"]["s_runtimeServices"]
    //    如果为 null，回退到 s_dynamicServices.m_serviceLocator
    // 2. 遍历 m_services (Dictionary)
    // 3. 查找 ServiceTypeName == service_name 的条目
    // 4. 返回该条目的 Service 字段
}
```

### 4.2 错误处理

```rust
#[derive(thiserror::Error, Debug)]
pub enum ScryError {
    #[error("进程未找到: {0}")]
    ProcessNotFound(String),

    #[error("访问被拒绝 (错误码 {0})")]
    AccessDenied(u32),

    #[error("内存读取失败 @ 0x{addr:08X}: {reason}")]
    MemoryAccess { addr: usize, reason: String },

    #[error("类未找到: {name}")]
    ClassNotFound { name: String },

    #[error("字段未找到: {class_name}.{field_name}")]
    FieldNotFound { class_name: String, field_name: String },

    #[error("模块未找到: {0}")]
    ModuleNotFound(String),

    #[error("Mono 运行时未初始化")]
    MonoNotInitialized,

    #[error("元数据解析失败: {0}")]
    MetadataError(String),

    #[error("不支持的类型: {0}")]
    UnsupportedType(String),
}
```

---

## 5. FFI 边界设计

### 5.1 核心 FFI 函数

```rust
// =========== 生命周期 ===========

/// 创建会话 (连接到指定 PID 的进程)
#[no_mangle]
pub extern "C" fn hm_create(pid: u32) -> *mut HmSession;

/// 销毁会话，释放所有资源
#[no_mangle]
pub extern "C" fn hm_destroy(session: *mut HmSession);

/// 获取最后一次错误信息 (线程本地存储)
#[no_mangle]
pub extern "C" fn hm_get_last_error(buf: *mut c_char, buf_len: u32) -> u32;

/// 检查进程状态 (0=运行中, 1=未找到, 2=访问被拒)
#[no_mangle]
pub extern "C" fn hm_check_process(session: *mut HmSession) -> i32;

// =========== 类型系统 ===========

/// 值类型标签
#[repr(C)]
pub enum HmValueType {
    Null = 0,
    Bool = 1,
    I8 = 2, U8 = 3,
    I16 = 4, U16 = 5,
    I32 = 6, U32 = 7,
    I64 = 8, U64 = 9,
    F32 = 10, F64 = 11,
    String = 12,
    Object = 13,
    Struct = 14,
    Array = 15,
    Class = 16,
}

/// 获取值的类型标签
#[no_mangle]
pub extern "C" fn hm_value_type(value: *const HmValue) -> HmValueType;

/// 提取基础类型值
#[no_mangle]
pub extern "C" fn hm_value_as_bool(value: *const HmValue) -> u8;
#[no_mangle]
pub extern "C" fn hm_value_as_i32(value: *const HmValue) -> i32;
#[no_mangle]
pub extern "C" fn hm_value_as_i64(value: *const HmValue) -> i64;
#[no_mangle]
pub extern "C" fn hm_value_as_u32(value: *const HmValue) -> u32;
#[no_mangle]
pub extern "C" fn hm_value_as_u64(value: *const HmValue) -> u64;
#[no_mangle]
pub extern "C" fn hm_value_as_f32(value: *const HmValue) -> f32;
#[no_mangle]
pub extern "C" fn hm_value_as_f64(value: *const HmValue) -> f64;

/// 提取字符串 (调用方提供 u16 buffer, 返回写入的字符数, 不含 null)
#[no_mangle]
pub extern "C" fn hm_value_as_string(
    value: *const HmValue,
    buf: *mut u16,      // UTF-16 buffer
    buf_len: u32,       // buffer 容量 (u16 个数)
) -> u32;

/// 获取对象的类名
#[no_mangle]
pub extern "C" fn hm_value_get_class_name(
    value: *const HmValue,
    buf: *mut c_char,
    buf_len: u32,
) -> u32;

/// 销毁值 (释放引用计数)
#[no_mangle]
pub extern "C" fn hm_value_destroy(value: *mut HmValue);

// =========== Tier 1: 底层字段访问 API ===========

/// 读取类的静态字段
/// class_name: 如 "Blizzard.T5.CollectionManager"
/// field_name: 如 "s_instance"
#[no_mangle]
pub extern "C" fn hm_get_static_field(
    session: *mut HmSession,
    class_name: *const c_char,
    field_name: *const c_char,
) -> *mut HmValue;

/// 读取对象的实例字段
/// value: 通过 hm_get_static_field 或 hm_get_instance_field 获得的对象
/// field_name: 如 "m_collectibleCards"
#[no_mangle]
pub extern "C" fn hm_get_instance_field(
    value: *mut HmValue,
    field_name: *const c_char,
) -> *mut HmValue;

/// 读取数组元素
#[no_mangle]
pub extern "C" fn hm_get_array_element(
    value: *mut HmValue,
    index: u32,
) -> *mut HmValue;

/// 获取数组长度
#[no_mangle]
pub extern "C" fn hm_get_array_size(value: *const HmValue) -> u32;

// =========== 集合遍历 ===========

/// 读取 C# List<T> (读取 _items + _size)
/// 返回值: 0=成功, 非0=错误码
/// 调用方负责 destroy 每个元素，然后 free 数组
#[no_mangle]
pub extern "C" fn hm_read_list(
    value: *mut HmValue,
    out_items: *mut *mut HmValue,
    out_size: *mut u32,
) -> i32;

/// 读取 C# Dictionary<K,V> (读取 _entries + _count)
#[no_mangle]
pub extern "C" fn hm_read_dict(
    value: *mut HmValue,
    out_entries: *mut HmDictEntry,
    out_count: *mut u32,
) -> i32;

/// 在 Dictionary 中按整数键查找
#[no_mangle]
pub extern "C" fn hm_dict_lookup(
    value: *mut HmValue,
    key: i32,
) -> *mut HmValue;

/// 读取炉石自定义 Map (keySlots + valueSlots)
#[no_mangle]
pub extern "C" fn hm_read_custom_map(
    value: *mut HmValue,
    out_entries: *mut HmMapEntry,
    out_count: *mut u32,
) -> i32;

/// 释放 hm_read_list/hm_read_dict/hm_read_custom_map 分配的数组
#[no_mangle]
pub extern "C" fn hm_free_array(arr: *mut c_void);

// =========== 服务定位 ===========

/// 按名称查找炉石服务 (如 "Network", "GameMgr", "NetCache")
#[no_mangle]
pub extern "C" fn hm_get_service(
    session: *mut HmSession,
    service_name: *const c_char,
) -> *mut HmValue;

// =========== Tier 2: 高层业务方法 (在 Rust 中实现) ===========

#[repr(C)]
pub struct HmCard {
    pub id: *const c_char,        // Card ID (UTF-8)
    pub count: i32,
    pub premium: i32,
}

#[repr(C)]
pub struct HmAccountId {
    pub hi: i64,
    pub lo: i64,
}

#[repr(C)]
pub struct HmPlayer {
    pub id: i32,
    pub name: *const c_char,
    pub account_id: HmAccountId,
    pub standard_rank: i32,
    pub wild_rank: i32,
    pub classic_rank: i32,
    pub twist_rank: i32,
}

#[repr(C)]
pub struct HmMatchInfo {
    pub local_player: HmPlayer,
    pub opposing_player: HmPlayer,
    pub mission_id: i32,
    pub game_type: i32,
    pub format_type: i32,
    pub ranked_season_id: i32,
    pub arena_season_id: i32,
    pub brawl_season_id: i32,
}

#[repr(C)]
pub struct HmCollection {
    pub cards: *const HmCard,
    pub card_count: u32,
    pub dust: i32,
    pub gold: i32,
}

/// 获取对局信息 (一次 FFI 调用完成所有内存读取)
#[no_mangle]
pub extern "C" fn hm_get_match_info(
    session: *mut HmSession,
    result: *mut HmMatchInfo,
) -> i32;

/// 获取收藏信息
#[no_mangle]
pub extern "C" fn hm_get_collection(
    session: *mut HmSession,
    result: *mut HmCollection,
) -> i32;

/// 释放 hm_get_collection 分配的字符串内存
#[no_mangle]
pub extern "C" fn hm_free_collection(collection: *mut HmCollection);
```

### 5.2 内存管理策略

| 资源 | 所有权 | 生命周期 |
|------|--------|---------|
| `HmSession` | TypeScript 拥有 | `hm_create` 创建，`hm_destroy` 销毁 |
| `HmValue` | 共享引用 (Rust 内部 Arc) | `hm_value_destroy` 递减引用计数 |
| 字符串输出 | 调用方 buffer | 调用方分配，Rust 写入，无需释放 |
| 集合数组 | Rust 分配 | `hm_free_array` 释放数组，`hm_value_destroy` 释放元素 |
| Tier 2 结构体 | Rust 分配 | 对应的 `hm_free_xxx` 函数释放 |

### 5.3 双层 FFI 设计

```
Tier 2 (Rust 实现, 高性能)          Tier 1 (TypeScript 实现, 灵活)
┌──────────────────────┐            ┌──────────────────────────┐
│ hm_get_match_info()  │            │ hm_get_static_field()    │
│ hm_get_collection()  │            │ hm_get_instance_field() │
│ hm_get_decks()       │            │ hm_get_array_element()  │
│ hm_get_medal_info()  │            │ hm_read_list()          │
│ ...高频方法...        │            │ hm_read_dict()          │
└──────────────────────┘            │ hm_get_service()        │
  一次 FFI = 多次内存读取            │ ...灵活组合...           │
                                    └──────────────────────────┘
                                      一次 FFI = 一次内存读取
```

**实现策略**: 先完成 Tier 1 (所有底层原语)，然后用 Tier 1 实现全部业务逻辑。稳定后将高频方法迁移到 Tier 2。

---

## 6. TypeScript API 层设计

### 6.1 核心类型

```typescript
// === 基础数据类型 ===

interface Card {
  id: string;
  count: number;
  premium: number;
}

interface Deck {
  id: number;
  name: string;
  hero: string;
  formatType: number;
  type: number;
  seasonId: number;
  cardBackId: number;
  heroPremium: number;
  sourceType: number;
  createDate: bigint;
  cards: Card[];
  sideboards: Record<string, Card[]>;
}

interface Collection {
  cards: Card[];
  dust: number;
  gold: number;
  favoriteHeroes: Record<number, Card>;
  playerRecords: PlayerRecord[];
}

interface AccountId {
  hi: bigint;
  lo: bigint;
}

interface BattleTag {
  name: string;
  fullBattleTag: string;
}

interface MatchInfo {
  localPlayer: MatchPlayer;
  opposingPlayer: MatchPlayer;
  missionId: number;
  gameType: number;
  formatType: number;
  rankedSeasonId: number;
  arenaSeasonId: number;
  brawlSeasonId: number;
}

interface MatchPlayer {
  id: number;
  name: string;
  accountId: AccountId;
  battleTag: BattleTag;
  standardRank: number;
  wildRank: number;
  classicRank: number;
  twistRank: number;
}

interface MedalInfo {
  standard: MedalInfoData | null;
  wild: MedalInfoData | null;
  classic: MedalInfoData | null;
  twist: MedalInfoData | null;
}

interface MedalInfoData {
  leagueId: number;
  starLevel: number;
  stars: number;
  legendRank: number;
  seasonId: number;
  seasonWins: number;
  bestEverLeagueId: number;
  bestStarLevel: number;
  bestRating: number;
  rating: number;
  streak: number;
  starsPerWin: number;
}

// ... 更多类型 (ArenaState, DeckPickerState, SceneMgrState 等)
```

### 6.2 枚举定义

```typescript
enum GameType {
  Unknown = 0,
  VsFriend = 1,
  TavernBrawl = 2,
  Ranked = 3,
  Casual = 4,
  Arena = 5,
  // ... 更多
}

enum FormatType {
  Wild = 1,
  Standard = 2,
  Classic = 3,
  Twist = 4,
}

enum Side {
  Friendly = 255,
  Opposing = 254,
}

enum ArenaSessionState {
  Invalid = 0,
  Deckbuilding = 1,
  Running = 2,
  Complete = 3,
}
```

### 6.3 公开 API

```typescript
class HearthMirror {
  // === 构造与生命周期 ===

  constructor(options?: {
    pid?: number;            // 默认自动查找 Hearthstone 进程
    readTimeout?: number;    // 默认 5000ms
  });

  /** 连接到炉石传说进程 */
  connect(): Promise<void>;

  /** 断开连接，释放资源 */
  disconnect(): Promise<void>;

  /** 检查是否已连接 */
  get isConnected(): boolean;

  // === 卡牌收藏 ===

  /** 获取收藏中的卡牌列表 */
  getCollection(): Promise<Card[] | null>;

  /** 获取完整收藏信息 (卡牌 + 奥术之尘 + 金币) */
  getFullCollection(): Promise<Collection | null>;

  // === 卡组 ===

  /** 获取所有已保存的卡组 */
  getDecks(): Promise<Deck[] | null>;

  /** 通过 DeckTemplateId 获取模板卡组 */
  getTemplateDeckByDeckTemplateId(deckTemplateId: number): Promise<TemplateDeck | null>;

  /** 通过 DeckId 查找 DeckTemplateId */
  findDeckTemplateIdForDeckId(deckId: number): Promise<number | null>;

  /** 获取正在编辑的卡组 */
  getEditedDeck(): Promise<Deck | null>;

  // === 对局 ===

  /** 获取当前对局信息 */
  getMatchInfo(): Promise<MatchInfo | null>;

  /** 获取游戏类型 */
  getGameType(): Promise<number>;

  /** 是否在观战 */
  isSpectating(): Promise<boolean>;

  /** 是否游戏结束 */
  isGameOver(): Promise<boolean>;

  // === 段位 ===

  /** 获取当前段位信息 */
  getMedalInfo(): Promise<MedalInfo | null>;

  /** 获取赛季结束信息 */
  getSeasonEndInfo(): Promise<SeasonEndInfo | null>;

  // === 竞技场 ===

  /** 获取竞技场状态 */
  getArenaState(cache?: ArenaCache): Promise<ArenaState | null>;

  /** 获取竞技场卡组信息 */
  getArenaDeck(): Promise<ArenaInfo | null>;

  /** 获取竞技场选牌选项 */
  getArenaDraftChoices(): Promise<DraftChoices | null>;

  // === 酒馆战棋 ===

  /** 获取酒馆战棋英雄选项 */
  getBattlegroundsHeroOptions(): Promise<NameCardId[] | null>;

  /** 获取酒馆战棋段位信息 */
  getBattlegroundRatingInfo(): Promise<BattlegroundRatingInfo | null>;

  /** 获取酒馆战棋大厅信息 */
  getBattlegroundsLobbyInfo(): Promise<BattlegroundsLobbyInfo | null>;

  // === 玩家 ===

  /** 获取 BattleTag */
  getBattleTag(): Promise<BattleTag | null>;

  /** 获取账号 ID */
  getAccountId(): Promise<AccountId | null>;

  // === UI 状态 ===

  /** 获取场景管理器状态 */
  getSceneMgrState(): Promise<SceneMgrState | null>;

  /** 是否在选牌阶段 */
  isMulligan(): Promise<boolean>;

  /** 是否商店已打开 */
  isShopOpen(): Promise<boolean | null>;

  /** 是否日志已开启 */
  isLogEnabled(name: string): Promise<boolean>;

  // === 服务器 ===

  /** 获取游戏服务器信息 */
  getServerInfo(): Promise<GameServerInfo | null>;

  // === 雇佣兵 ===

  getMercenariesInCollection(): Promise<MercenaryData[] | null>;
  getMercenariesRatingInfo(): Promise<MercenariesRatingInfo | null>;
  getMercenariesMapInfo(): Promise<MercenariesMapInfo | null>;
  getMercenariesTasksData(): Promise<MercenariesTaskData[] | null>;

  // === 事件 ===

  /** 监听事件 */
  on(event: 'accessDenied', handler: () => void): void;
  on(event: 'log', handler: (msg: string) => void): void;
  on(event: 'processExit', handler: () => void): void;

  /** 移除监听 */
  off(event: string, handler: Function): void;
}
```

### 6.4 错误处理

```typescript
enum MirrorErrorCode {
  ProcessNotFound = 1,
  AccessDenied = 2,
  MemoryReadFailed = 3,
  ClassNotFound = 4,
  FieldNotFound = 5,
  Timeout = 6,
  NotConnected = 7,
  Unknown = 99,
}

class MirrorError extends Error {
  constructor(
    public readonly code: MirrorErrorCode,
    message: string,
    public readonly methodName?: string,
  ) { super(message); }
}
```

所有业务方法返回 `Promise<T | null>`:
- `null` = 炉石未运行 / 数据读取失败 (与原版行为一致)
- 不抛异常 (除非编程错误，如未连接就调用)

---

## 7. Mono 运行时解析详解

### 7.1 解析流程

```
步骤 1: 查找 mono.dll
  CreateToolhelp32Snapshot(MODULE, pid)
  → Module32First/Next 遍历
  → 找到 base_address 和 size

步骤 2: 解析 mono.dll 导出表
  读取 PE Header → Export Directory RVA
  → ReadProcessMemory 读取导出函数列表
  → 找到 mono_get_root_domain, mono_domain_get 等函数地址

步骤 3: 定位根域
  读取 mono_get_root_domain 函数的机器码
  → 提取返回的全局变量地址
  → ReadProcessMemory 读取该全局变量得到 MonoDomain*

步骤 4: 枚举程序集
  MonoDomain+0x0C → domain_assemblies (MonoGList*)
  → 遍历链表
  → 每个 MonoAssembly+0x08 → MonoImage*
  → MonoImage+0x10 → name (char*)
  → ReadProcessMemory 读取名称，匹配 "Assembly-CSharp"

步骤 5: 解析元数据 (从磁盘)
  定位 Assembly-CSharp.dll 文件路径
  → 打开文件，解析 PE/CLI 头
  → 定位 #~ stream (元数据表)
  → 解析 TypeDef 表 (类定义)
  → 解析 Field 表 (字段定义)

步骤 6: 映射运行时偏移
  对每个 TypeDef 中的类:
  → 在进程内存中找到对应的 MonoClass 结构
  → 读取 MonoClass.fields (MonoClassField**)
  → 遍历字段数组，读取每个 MonoClassField.name 和 .offset
  → 构建字段名 → 偏移量的映射

步骤 7: 读取字段值
  静态字段: MonoVTable.data + field_offset → ReadProcessMemory
  实例字段: object_base_addr + sizeof(header) + field_offset → ReadProcessMemory
```

### 7.2 Mono 关键内部结构 (32位, Unity Mono)

以下偏移量基于 Unity 2021.3 使用的 Mono 版本。**不同版本可能不同，需要运行时探测。**

```
MonoDomain (约 0x60 bytes):
  +0x00: vtable*
  +0x0C: domain_assemblies*   (MonoGList*)
  +0x14: loaded_images*       (MonoGList*)

MonoAssembly (约 0x1C bytes):
  +0x00: vtable*
  +0x08: image*               (MonoImage*)

MonoImage (约 0x58 bytes):
  +0x00: vtable*
  +0x04: raw_data_len
  +0x08: raw_data*            (char*)
  +0x0C: raw_data_owner
  +0x10: name*                (char*)
  +0x14: assembly*            (MonoAssembly*)
  +0x18: image_data*          (MonoImageData*)

MonoGList:
  +0x00: data                 (void*)
  +0x04: next*                 (MonoGList*)

MonoClass (约 0x6C bytes):
  +0x00: vtable*
  +0x04: inited               (bool)
  +0x0C: size_class           (u32)
  +0x2C: name*                (char*)
  +0x30: namespace*           (char*)
  +0x34: vtable_size          (u16)
  +0x38: field_count          (u16)
  +0x3C: fields**             (MonoClassField**)
  +0x40: parent*              (MonoClass*)
  +0x58: static_field_data*   (void*)

MonoClassField (约 0x14 bytes):
  +0x00: name*                (char*)
  +0x04: type*                (MonoType*)
  +0x08: parent*              (MonoClass*)
  +0x0C: offset               (u32)
  +0x10: token                (u32)

MonoType (约 0x08 bytes):
  +0x00: data                 (void*)
  +0x04: attrs                (u16)
  +0x06: type                 (u8)  // MonoTypeEnum

MonoObject (变长):
  +0x00: vtable*              (MonoVTable*, 实际是 klass*)
  +0x04: monitor*             (void*)
  +0x08: sychronization*
  +0x0C: --- 实例字段开始 ---

MonoArray (变长):
  +0x00: vtable*              (MonoClass*)
  +0x04: monitor*
  +0x08: bounds*
  +0x0C: max_length           (usize)
  +0x10: --- 数组数据开始 ---
```

### 7.3 版本适配策略

由于 Mono 内部结构偏移量随版本变化，采用以下策略：

```rust
/// Mono 版本对应的偏移量表
struct MonoOffsets {
    domain_assemblies: usize,  // MonoDomain + offset
    domain_loaded_images: usize,
    assembly_image: usize,
    image_name: usize,
    image_raw_data: usize,
    class_name: usize,
    class_namespace: usize,
    class_field_count: usize,
    class_fields: usize,
    class_parent: usize,
    class_static_data: usize,
    class_instance_size: usize,
    field_name: usize,
    field_offset: usize,
    field_type: usize,
    object_vtable: usize,
    object_data_start: usize,
    array_max_length: usize,
    array_data_start: usize,
}

/// 已知版本的偏移量表
const KNOWN_OFFSETS: &[(&str, MonoOffsets)] = &[
    ("2021.3.25.61228", UNITY_2021_3_OFFSETS),
    // 更多版本...
];

/// 运行时探测偏移量 (通过已知签名扫描)
fn probe_offsets(memory: &ProcessMemory, mono_module: &ModuleInfo)
    -> Result<MonoOffsets>;
```

---

## 8. 实现阶段

### Phase 1: 基础设施

**目标**: 能连接炉石进程，读取任意内存地址

- [ ] 项目初始化: Cargo workspace, i686-pc-windows-msvc target
- [ ] `process.rs`: OpenProcess, CreateToolhelp32Snapshot, Module32First/Next
- [ ] `memory.rs`: ReadProcessMemory 封装 (所有基础类型 + VirtualQueryEx)
- [ ] `error.rs`: ScryError 错误类型
- [ ] `cache.rs`: LRU 内存页缓存

**验证**: 连接炉石进程，枚举模块，找到 `mono.dll`，读取其 PE 头。

### Phase 2: Mono 运行时解析

**目标**: 能查找任意类并读取其字段

- [ ] `mono/runtime.rs`: mono.dll 导出表解析, 根域发现, 程序集枚举
- [ ] `mono/metadata.rs`: ECMA-335 CLI 元数据表解析器
- [ ] `mono/class.rs`: 类定义构建 (元数据 → 运行时偏移映射)
- [ ] `mono/field.rs`: 字段描述符 (名称、偏移、类型)
- [ ] `mono/object.rs`: 实例字段读取
- [ ] `mono/struct_.rs`: 值类型读取
- [ ] `mono/array.rs`: 数组读取 (长度 + 元素)
- [ ] `mono/string.rs`: UTF-16 Mono 字符串
- [ ] `mono/type_info.rs`: 类型分类
- [ ] `mono/value.rs`: 变体类型
- [ ] `mono/image.rs`: MonoImage (类查找入口)
- [ ] `mono/mod.rs`: MonoScry (编排器)
- [ ] 偏移量探测与版本适配

**验证**: 查找 `Blizzard.T5.ServiceLocator` 类，读取其静态字段，验证返回值类型。

### Phase 3: FFI + 集合遍历

**目标**: TypeScript 能导航完整的炉石对象图

- [ ] `ffi.rs`: 全部 FFI 函数实现
- [ ] `collections.rs`: List/Dict/Map 遍历
- [ ] `service.rs`: Service Locator
- [ ] TypeScript `ffi-napi` 绑定 (`bindings.ts`)
- [ ] TypeScript `native.ts` (FFI 封装 + 内存管理)
- [ ] TypeScript `session.ts` (连接生命周期)
- [ ] TypeScript `mirror.ts` (根镜像 + 链式字段访问)
- [ ] TypeScript `collection-reader.ts` (集合遍历辅助)
- [ ] TypeScript `service-locator.ts`

**验证**: TypeScript 中执行 `root["CollectionManager"]["s_instance"]["m_collectibleCards"]` 成功。

### Phase 4: 核心业务方法

**目标**: 实现最高频的 12 个方法

- [ ] GetCollection / GetFullCollection
- [ ] GetMatchInfo
- [ ] GetMedalInfo
- [ ] GetDecks
- [ ] GetBattleTag / GetAccountId
- [ ] GetGameType / IsSpectating / IsGameOver
- [ ] GetArenaState / GetArenaDeck
- [ ] GetBattlegroundsHeroOptions / GetBattlegroundRatingInfo
- [ ] GetServerInfo

**验证**: `GetBattleTag()` 返回有效 BattleTag，`GetCollection()` 返回合理卡牌数。

### Phase 5: 扩展业务方法

**目标**: 实现剩余 50+ 个方法

- [ ] 酒馆战棋: LobbyInfo, TeammateBoard, LeaderboardHoveredEntity
- [ ] 竞技场: DraftChoices V2/V3, Rewards, RatingInfo
- [ ] 雇佣兵: RatingInfo, MapInfo, TasksData, VisitorTasks, Collection
- [ ] UI: SceneMgr, DeckPicker, BigCard, OpponentBoard, Discover, Mulligan
- [ ] 其他: BrawlInfo, DungeonInfo, SeasonEndInfo, RewardTrackData, Achievements

### Phase 6: 测试与加固

- [ ] Rust 单元测试 (内存读取、元数据解析、集合遍历)
- [ ] TypeScript 单元测试 (Mock FFI、类型转换)
- [ ] 集成测试 (需要运行中的炉石)
- [ ] 内存泄漏检测
- [ ] 性能基准测试 (对比原版 HearthMirror)
- [ ] 错误恢复测试

---

## 9. 风险评估

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| Mono 运行时偏移量随版本变化 | **高** | **高** | 可配置偏移量表 + 运行时探测 + 版本检测。维护 `offsets.json` 配置文件。 |
| 炉石更新修改类名/字段名 | 中 | 中 | 与原版一致，优雅降级返回 null。字段路径配置化。 |
| 32 位 Node.js / ffi-napi 兼容性 | 低 | 中 | ffi-napi 已支持 x86，Phase 1 尽早验证。 |
| 内存读取不稳定 | 低 | 高 | Mono 对象在 GC 存活期间地址不变。所有 ReadProcessMemory 调用包裹在 catch 中。 |
| FFI 内存泄漏 | 中 | 中 | Rust RAII 保证释放。TypeScript 端使用 finalizer 或显式 destroy。添加 leak 检测测试。 |
| 性能不及 C++/CLI 原版 | 低 | 低 | Rust 应更快 (零拷贝、更好的缓存)。瓶颈在 ReadProcessMemory 次数，不在语言本身。 |

---

## 10. 验证计划

### 单元测试 (不需要炉石运行)

| 测试目标 | 测试方法 |
|---------|---------|
| `memory.rs` | 读取自身进程的内存，验证基础类型读取 |
| `metadata.rs` | 用磁盘上的 Assembly-CSharp.dll 文件解析元数据 |
| `collections.rs` | Mock 内存数据，验证 List/Dict/Map 遍历逻辑 |
| TypeScript 类型转换 | Mock FFI 数据，验证 HmValue → TS 类型转换 |

### 集成测试 (需要运行中的炉石)

| 测试目标 | 验证方法 |
|---------|---------|
| Phase 2 | 查找 `Blizzard.T5.ServiceLocator`，读取 `CollectionManager.s_instance` |
| Phase 4 | `GetBattleTag()` 返回有效 BattleTag |
| Phase 4 | `GetCollection()` 返回卡牌列表，数量合理 |
| Phase 5 | 全部 60+ 方法无崩溃运行 |

### 最终验收

与原版 HearthMirror 并行运行，对比所有方法的返回值一致性。
