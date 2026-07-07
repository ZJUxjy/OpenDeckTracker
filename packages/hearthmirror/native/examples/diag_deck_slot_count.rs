//! Dump the first CollectionDeckSlot.m_count field using several candidate
//! interpretations. Used to keep 32/64-bit deck-slot count layout honest.

use hearthmirror_native::collections::{custom_map, list};
use hearthmirror_native::error::ScryError;
use hearthmirror_native::mono::class::read_mono_class;
use hearthmirror_native::mono::object::MonoObject;
use hearthmirror_native::mono::offsets::MonoOffsets;
use hearthmirror_native::mono::MonoRuntime;
use hearthmirror_native::reflection::field_paths::{
    CLS_COLLECTION_MANAGER, FLD_COLLECTION_DECK_FORMAT, FLD_COLLECTION_DECK_NAME,
    FLD_COLLECTION_DECK_SLOTS, FLD_COLLECTION_DECK_TYPE, FLD_DECKS, FLD_DECK_SLOT_CARD_ID,
    FLD_DECK_SLOT_COUNT,
};
use hearthmirror_native::remote_ptr::RemotePtr;

fn main() -> Result<(), ScryError> {
    let rt = MonoRuntime::init()?;
    let mem = &rt.memory;
    let Some(cm) = rt.get_singleton(CLS_COLLECTION_MANAGER.0, CLS_COLLECTION_MANAGER.1)? else {
        println!("CollectionManager.s_instance is NULL");
        return Ok(());
    };

    let Some(map_ptr) = cm.read_pointer_field(mem, FLD_DECKS)? else {
        println!("CollectionManager.m_decks is NULL");
        return Ok(());
    };

    let entries = custom_map::iter_entries(mem, map_ptr, 1024)?;
    if std::env::args().any(|arg| arg == "all" || arg == "--all") {
        return dump_all_slots(&rt, entries);
    }

    let Some((_key, deck_ptr)) = entries.into_iter().find(|(_, deck)| !deck.is_null()) else {
        println!("no decks");
        return Ok(());
    };
    let Some(deck) = MonoObject::from_address(mem, deck_ptr, rt.offsets.clone())? else {
        println!("deck object unresolved: {}", deck_ptr);
        return Ok(());
    };
    let Some(slots_ptr) = deck.read_pointer_field(mem, FLD_COLLECTION_DECK_SLOTS)? else {
        println!("deck.m_slots is NULL");
        return Ok(());
    };

    let slot_ptrs = list::iter_element_ptrs(mem, slots_ptr, mem.ptr_size(), 256)?;
    if slot_ptrs.is_empty() {
        println!("deck has no slots");
        return Ok(());
    }

    for (idx, slot_slot_addr) in slot_ptrs.into_iter().take(8).enumerate() {
        println!("\n=== slot {} ===", idx);
        dump_slot(&rt, slot_slot_addr)?;
    }

    Ok(())
}

fn dump_all_slots(rt: &MonoRuntime, entries: Vec<(RemotePtr, RemotePtr)>) -> Result<(), ScryError> {
    let mem = &rt.memory;
    for (deck_idx, (_key, deck_ptr)) in entries.into_iter().enumerate() {
        if deck_ptr.is_null() {
            continue;
        }
        let Some(deck) = MonoObject::from_address(mem, deck_ptr, rt.offsets.clone())? else {
            println!("deck {} unresolved: {}", deck_idx, deck_ptr);
            continue;
        };
        let name = deck
            .read_string_field(mem, FLD_COLLECTION_DECK_NAME)?
            .unwrap_or_default();
        let format_type = deck
            .read_int32_field(mem, FLD_COLLECTION_DECK_FORMAT)?
            .unwrap_or_default();
        let deck_type = deck
            .read_int32_field(mem, FLD_COLLECTION_DECK_TYPE)?
            .unwrap_or_default();
        let Some(slots_ptr) = deck.read_pointer_field(mem, FLD_COLLECTION_DECK_SLOTS)? else {
            println!(
                "\n=== deck {} {:?} format={} type={} slots=NULL ===",
                deck_idx, name, format_type, deck_type
            );
            continue;
        };
        let slot_ptrs = list::iter_element_ptrs(mem, slots_ptr, mem.ptr_size(), 256)?;
        println!(
            "\n=== deck {} {:?} format={} type={} slots={} ===",
            deck_idx,
            name,
            format_type,
            deck_type,
            slot_ptrs.len()
        );
        for (slot_idx, slot_slot_addr) in slot_ptrs.into_iter().enumerate() {
            let slot_addr = mem.read_remote_ptr(slot_slot_addr)?;
            if slot_addr.is_null() {
                continue;
            }
            let Some(slot) = MonoObject::from_address(mem, slot_addr, rt.offsets.clone())? else {
                println!("  {:>2} unresolved {}", slot_idx, slot_addr);
                continue;
            };
            let card_id = slot
                .read_string_field(mem, FLD_DECK_SLOT_CARD_ID)?
                .unwrap_or_default();
            let count_ptr = slot.read_pointer_field(mem, FLD_DECK_SLOT_COUNT)?;
            let values = match count_ptr {
                Some(ptr) => read_i32_list(mem, ptr)?,
                None => Vec::new(),
            };
            println!("  {:>2} {:<16} {:?}", slot_idx, card_id, values);
        }
    }
    Ok(())
}

fn read_i32_list(
    mem: &hearthmirror_native::memory::ProcessMemory,
    list_ptr: RemotePtr,
) -> Result<Vec<i32>, ScryError> {
    if list_ptr.is_null() {
        return Ok(Vec::new());
    }
    let object_data_offset = mem.ptr_size() * 2;
    let array_data_offset = mem.ptr_size() * 4;
    let items_ptr = mem.read_remote_ptr(list_ptr + object_data_offset)?;
    let size = mem
        .read_i32(list_ptr + object_data_offset + mem.ptr_size())?
        .max(0) as usize;
    if items_ptr.is_null() || size > 32 {
        return Ok(Vec::new());
    }
    let base = items_ptr + array_data_offset;
    (0..size as u32)
        .map(|i| mem.read_i32(base + i * 4))
        .collect()
}

fn dump_slot(rt: &MonoRuntime, slot_slot_addr: RemotePtr) -> Result<(), ScryError> {
    let mem = &rt.memory;
    let slot_addr = mem.read_remote_ptr(slot_slot_addr)?;
    let Some(slot) = MonoObject::from_address(mem, slot_addr, rt.offsets.clone())? else {
        println!("slot object unresolved: {}", slot_addr);
        return Ok(());
    };

    println!("slot @ {}", slot_addr);
    println!("ptr_size={}", mem.ptr_size());
    let count_off =
        *slot
            .fields
            .get(FLD_DECK_SLOT_COUNT)
            .ok_or_else(|| ScryError::FieldNotFound {
                class: "CollectionDeckSlot".into(),
                field: FLD_DECK_SLOT_COUNT.into(),
            })?;
    let card_id = slot
        .read_string_field(mem, FLD_DECK_SLOT_CARD_ID)?
        .unwrap_or_default();
    println!("card_id={:?}", card_id);
    println!("m_count offset=+0x{:X}", count_off);

    println!("raw slot u32 [+0x00..+0x60]:");
    for off in (0..0x60_u32).step_by(4) {
        let v = mem
            .read_u32(slot_addr + off)
            .map(|x| format!("0x{:08X} ({})", x, x))
            .unwrap_or_else(|e| format!("<ERR: {}>", e));
        println!("  +0x{:02X} = {}", off, v);
    }

    let inline_i32 = mem.read_i32(slot_addr + count_off)?;
    println!("inline i32 at m_count = {}", inline_i32);
    let count_ptr = mem
        .read_remote_ptr(slot_addr + count_off)
        .unwrap_or(RemotePtr::NULL);
    println!("remote ptr at m_count = {}", count_ptr);
    if !count_ptr.is_null() {
        println!(
            "  runtime class = {}",
            describe_object_class(mem, count_ptr, &rt.offsets).unwrap_or_else(|| "?".into())
        );
        if let Some(count_obj) = MonoObject::from_address(mem, count_ptr, rt.offsets.clone())? {
            let mut fields: Vec<_> = count_obj.fields.iter().collect();
            fields.sort_by_key(|(_, off)| **off);
            println!("  fields:");
            for (name, off) in fields {
                println!("    +0x{:X} {}", off, name);
            }
        }
        let object_data_offset = mem.ptr_size() * 2;
        let array_data_offset = mem.ptr_size() * 4;
        let items_ptr = mem.read_remote_ptr(count_ptr + object_data_offset)?;
        let size = mem.read_i32(count_ptr + object_data_offset + mem.ptr_size())?;
        println!("  list items={} size={}", items_ptr, size);
        if !items_ptr.is_null() && (0..=32).contains(&size) {
            let base = items_ptr + array_data_offset;
            print!("  list as i32:");
            for i in 0..size {
                let v = mem.read_i32(base + (i as u32 * 4))?;
                print!(" {}", v);
            }
            println!();
            print!("  list as ptr:");
            for i in 0..size {
                let p = mem.read_remote_ptr(base + (i as u32 * mem.ptr_size()))?;
                print!(" {}", p);
            }
            println!();
        }
        for off in [0x8_u32, 0x10, 0x14, 0x18, 0x20] {
            let v = mem
                .read_i32(count_ptr + off)
                .map(|x| x.to_string())
                .unwrap_or_else(|e| format!("<ERR: {}>", e));
            println!("  *(count_ptr + 0x{:X}) as i32 = {}", off, v);
        }
    }

    Ok(())
}

fn describe_object_class(
    mem: &hearthmirror_native::memory::ProcessMemory,
    obj: RemotePtr,
    offsets: &std::sync::Arc<MonoOffsets>,
) -> Option<String> {
    let vtable = mem
        .read_remote_ptr(obj + offsets.structs.object.vtable)
        .ok()?;
    let klass = mem
        .read_remote_ptr(vtable + offsets.structs.vtable.klass)
        .ok()?;
    let class = read_mono_class(mem, klass, offsets.clone()).ok()?;
    Some(class.full_name)
}
