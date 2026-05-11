use crate::collections::list;
use crate::error::ScryError;
use crate::mono::class::read_mono_class;
use crate::mono::MonoRuntime;
use crate::reflection::field_paths::*;
use napi_derive::napi;
use std::time::Instant;

#[napi(object)]
pub struct CardResult {
    pub dbf_id: i32,
    pub count: i32,
    pub premium: i32,
}

/// Structured diagnostic surfaced to JS consumers. Mirrors `CollectionCounters`
/// but with napi-compatible field types (`i32` instead of `usize`/`u128`).
#[napi(object)]
pub struct CollectionDiagnostic {
    pub list_size: i32,
    pub parsed: i32,
    pub non_zero_dbfid: i32,
    pub null_ptrs: i32,
    pub field_misses: i32,
    pub sample_class: Option<String>,
    pub elapsed_ms: i32,
}

impl CollectionDiagnostic {
    pub fn from_counters(c: &CollectionCounters) -> Self {
        Self {
            list_size: c.list_size.min(i32::MAX as usize) as i32,
            parsed: c.parsed.min(i32::MAX as usize) as i32,
            non_zero_dbfid: c.non_zero_dbfid.min(i32::MAX as usize) as i32,
            null_ptrs: c.null_ptrs.min(i32::MAX as usize) as i32,
            field_misses: c.field_misses.min(i32::MAX as usize) as i32,
            sample_class: c.sample_class.clone(),
            elapsed_ms: c.elapsed_ms.min(i32::MAX as u128) as i32,
        }
    }

    pub fn zero() -> Self {
        Self {
            list_size: 0,
            parsed: 0,
            non_zero_dbfid: 0,
            null_ptrs: 0,
            field_misses: 0,
            sample_class: None,
            elapsed_ms: 0,
        }
    }
}

/// Counters captured during a single `get_collection_internal` walk.
/// Exposed publicly so the diagnostic napi export can return them
/// alongside (or instead of) the parsed `Vec<CardResult>`.
#[derive(Debug, Clone, Default)]
pub struct CollectionCounters {
    pub list_size: usize,
    pub parsed: usize,
    pub non_zero_dbfid: usize,
    pub null_ptrs: usize,
    pub field_misses: usize,
    pub sample_class: Option<String>,
    pub elapsed_ms: u128,
}

/// Cap the collection iteration at a number well above any reasonable live
/// collection size. As of Hearthstone 32.x `m_collectibleCards` hovers in
/// the 15–20k range (every collectible card × 2 for golden), so 50k leaves
/// headroom for future expansion without letting a corrupted `_size` field
/// run us off the rails.
const COLLECTION_MAX_ITEMS: usize = 50_000;

pub async fn get_collection_internal(
    runtime: &MonoRuntime,
) -> Result<Option<Vec<CardResult>>, ScryError> {
    let (cards, counters) = read_collection_with_counters(runtime).await?;
    emit_diagnostic_log(&counters);
    Ok(cards)
}

/// Walk `CollectionManager.m_collectibleCards` once, returning both the
/// parsed card list and structured counters. Used by both
/// `get_collection_internal` (which discards the counters) and the
/// diagnostic napi export (which discards the cards). Keeps the walk
/// logic single-sourced so the two surfaces can never drift.
pub async fn read_collection_with_counters(
    runtime: &MonoRuntime,
) -> Result<(Option<Vec<CardResult>>, CollectionCounters), ScryError> {
    let start = Instant::now();
    let mut counters = CollectionCounters::default();

    let Some(instance) =
        runtime.get_singleton(CLS_COLLECTION_MANAGER.0, CLS_COLLECTION_MANAGER.1)?
    else {
        counters.elapsed_ms = start.elapsed().as_millis();
        return Ok((None, counters));
    };
    let mem = &runtime.memory;

    // CollectionManager.m_collectibleCards is a `List<CollectionCardData>`
    // in Hearthstone 32.x (previously assumed Dictionary<int, ...>; see
    // diag_field_object.rs verification 2026-04-20). Each element is a
    // reference (pointer, 4 bytes) to a CollectionCardData object.
    let Some(list_ptr) = instance.read_pointer_field(mem, FLD_COLLECTIBLE_CARDS)? else {
        counters.elapsed_ms = start.elapsed().as_millis();
        return Ok((None, counters));
    };
    let elem_ptrs = list::iter_element_ptrs(mem, list_ptr, 4, COLLECTION_MAX_ITEMS)?;
    counters.list_size = elem_ptrs.len();

    let mut cards = Vec::with_capacity(elem_ptrs.len());
    for elem_ptr in elem_ptrs {
        let card_addr = mem.read_remote_ptr(elem_ptr)?;
        if card_addr.is_null() {
            counters.null_ptrs += 1;
            continue;
        }
        if let Some(card_obj) = instance.child_from_address(mem, card_addr)? {
            counters.parsed += 1;

            if counters.sample_class.is_none() {
                let vtable_ptr =
                    mem.read_remote_ptr(card_obj.addr + card_obj.offsets.structs.object.vtable)?;
                if !vtable_ptr.is_null() {
                    let klass = mem
                        .read_remote_ptr(vtable_ptr + card_obj.offsets.structs.vtable.klass)?;
                    if !klass.is_null() {
                        let class_ref = read_mono_class(mem, klass, card_obj.offsets.clone())?;
                        counters.sample_class = Some(class_ref.full_name);
                    }
                }
            }

            let dbf_id_opt = card_obj.read_int32_field(mem, FLD_CARD_DBF_ID)?;
            let count_opt = card_obj.read_int32_field(mem, FLD_CARD_COUNT)?;
            let premium_opt = card_obj.read_int32_field(mem, FLD_CARD_PREMIUM)?;
            if dbf_id_opt.is_none() {
                counters.field_misses += 1;
            }
            if count_opt.is_none() {
                counters.field_misses += 1;
            }
            if premium_opt.is_none() {
                counters.field_misses += 1;
            }
            let dbf_id = dbf_id_opt.unwrap_or(0);
            if dbf_id != 0 {
                counters.non_zero_dbfid += 1;
            }
            cards.push(CardResult {
                dbf_id,
                count: count_opt.unwrap_or(0),
                premium: premium_opt.unwrap_or(0),
            });
        }
    }

    counters.elapsed_ms = start.elapsed().as_millis();
    Ok((Some(cards), counters))
}

fn emit_diagnostic_log(c: &CollectionCounters) {
    let sample = c.sample_class.as_deref().unwrap_or("<unset>");
    eprintln!(
        "[hearthmirror:collection] list_size={} parsed={} non_zero_dbfid={} null_ptrs={} field_misses={} sample_class={} elapsed={}ms",
        c.list_size, c.parsed, c.non_zero_dbfid, c.null_ptrs, c.field_misses, sample, c.elapsed_ms,
    );
}

/// Diagnostic-only entry point. Performs a fresh walk of the live
/// collection and returns just the counters — discards the parsed card
/// list. Used by the `getCollectionDiagnostic` napi export.
pub async fn get_collection_diagnostic_internal(
    runtime: &MonoRuntime,
) -> Result<CollectionDiagnostic, ScryError> {
    let (_cards, counters) = read_collection_with_counters(runtime).await?;
    emit_diagnostic_log(&counters);
    Ok(CollectionDiagnostic::from_counters(&counters))
}
