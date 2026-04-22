//! Probe `BnetBattleTag` reached via `BnetPresenceMgr.s_instance →
//! m_myPlayer → m_account → m_battleTag` and dump m_name + m_number under
//! BOTH interpretations (Mono string vs i32) so we can pick the right
//! decoder for `getBattleTag`.

use hearthmirror_native::error::ScryError;
use hearthmirror_native::mono::MonoRuntime;

fn main() -> Result<(), ScryError> {
    let rt = MonoRuntime::init()?;
    let mem = &rt.memory;

    let presence = match rt.get_singleton("", "BnetPresenceMgr")? {
        Some(p) => p,
        None => {
            eprintln!("BnetPresenceMgr.s_instance is null (not logged in?)");
            std::process::exit(2);
        }
    };

    let player = presence.read_object_field(mem, "m_myPlayer")?.expect("m_myPlayer null");
    let account = player.read_object_field(mem, "m_account")?.expect("m_account null");
    let tag = account.read_object_field(mem, "m_battleTag")?.expect("m_battleTag null");

    println!("BnetBattleTag @ {}", tag.addr);
    println!("fields (own-class):");
    let mut sorted: Vec<_> = tag.fields.iter().collect();
    sorted.sort_by_key(|(_, off)| **off);
    for (name, off) in &sorted {
        println!("  +0x{:04X}  {}", off, name);
    }

    println!("\nraw bytes [+0x00..+0x20]:");
    for off in (0..0x20_u32).step_by(4) {
        match mem.read_u32(tag.addr + off) {
            Ok(v) => println!("  +0x{:02X} = 0x{:08X} ({})", off, v, v),
            Err(e) => println!("  +0x{:02X} = <ERR: {}>", off, e),
        }
    }

    println!("\n-- m_name interpretations --");
    if let Some(s) = tag.read_string_field(mem, "m_name")? {
        println!("  string: {:?}", s);
    } else {
        println!("  string: None");
    }
    if let Some(i) = tag.read_int32_field(mem, "m_name")? {
        println!("  i32: {}", i);
    }

    println!("\n-- m_number interpretations --");
    if let Some(s) = tag.read_string_field(mem, "m_number")? {
        println!("  string: {:?}", s);
    } else {
        println!("  string: None");
    }
    if let Some(i) = tag.read_int32_field(mem, "m_number")? {
        println!("  i32: {}", i);
    }
    if let Some(p) = tag.read_pointer_field(mem, "m_number")? {
        println!("  pointer: {}", p);
    }

    Ok(())
}
