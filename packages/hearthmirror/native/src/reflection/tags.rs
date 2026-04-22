// Each enum group is its own sub-module so reflectors can write
// `tags::tags::CONTROLLER` / `tags::zone::PLAY` etc. — the inner-`tags`
// pattern is intentional, not an oversight.
#![allow(clippy::module_inception)]

//! Hearthstone enum constants used by the in-match reflectors.
//!
//! All four sub-modules below mirror `HearthDb` enum integers exactly as
//! the live game uses them in `Entity.<Tags>k__BackingField` /
//! `Choices.<ChoiceType>k__BackingField` / `Player.m_side`. Values
//! verified live 2026-04-21 against upstream
//! `D:\code\hearthmirror-rs/hearthmirror/crates/hm-rpc/src/protocol.rs`
//! (commit `10225d4` Phase 7 land + `53aa0cc` follow-up tag fixes).
//!
//! When HearthDb adds a new tag/zone/cardtype/choice we care about, add
//! its constant here rather than inlining the integer at the comparison
//! site — the doc-comment is the only place a future contributor learns
//! "why 50? 50 means CONTROLLER".

/// `HearthDb.Enums.GameTag` — entries we read from per-entity tag dicts.
pub mod tags {
    /// Damage already taken (TAG_DAMAGE).
    pub const DAMAGE: i32 = 44;
    /// Maximum health (TAG_HEALTH).
    pub const HEALTH: i32 = 45;
    /// Attack value (TAG_ATK).
    pub const ATK: i32 = 47;
    /// Mana cost (TAG_COST).
    pub const COST: i32 = 48;
    /// Current zone (TAG_ZONE) — value space → `mod zone` constants.
    pub const ZONE: i32 = 49;
    /// Controlling player id (TAG_CONTROLLER).
    pub const CONTROLLER: i32 = 50;
    /// Globally-unique entity id within the match (TAG_ENTITY_ID).
    pub const ENTITY_ID: i32 = 53;
    /// Entity type (TAG_CARDTYPE) — value space → `mod card_type`.
    pub const CARDTYPE: i32 = 202;
    /// Position within the current zone (TAG_ZONE_POSITION).
    pub const ZONE_POSITION: i32 = 263;
}

/// `HearthDb.Enums.TAG_ZONE` — values stored under the `ZONE` tag.
pub mod zone {
    pub const PLAY: i32 = 1;
    pub const DECK: i32 = 2;
    pub const HAND: i32 = 3;
    pub const SECRET: i32 = 7;
}

/// `HearthDb.Enums.CardType` — values stored under the `CARDTYPE` tag.
pub mod card_type {
    pub const HERO: i32 = 3;
    pub const MINION: i32 = 4;
    pub const SPELL: i32 = 5;
    /// Attached effect — filtered out of board display by `getBoardState`
    /// because enchantments belong to their parent minion's effects.
    pub const ENCHANTMENT: i32 = 6;
    pub const WEAPON: i32 = 7;
    pub const HERO_POWER: i32 = 10;
}

/// `HearthDb.Enums.ChoiceType` — values stored on
/// `Choices.<ChoiceType>k__BackingField`.
pub mod choice_type {
    pub const MULLIGAN: i32 = 1;
    /// Generic "pick one" (e.g. Discover effects).
    pub const GENERAL: i32 = 2;
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Locks the public values against accidental edits — the comparison
    /// integers are part of the spec contract with the in-game enum.
    #[test]
    fn tag_constants_are_stable() {
        assert_eq!(tags::CONTROLLER, 50);
        assert_eq!(tags::ZONE, 49);
        assert_eq!(tags::CARDTYPE, 202);
        assert_eq!(zone::PLAY, 1);
        assert_eq!(zone::DECK, 2);
        assert_eq!(zone::HAND, 3);
        assert_eq!(zone::SECRET, 7);
        assert_eq!(card_type::ENCHANTMENT, 6);
        assert_eq!(choice_type::MULLIGAN, 1);
        assert_eq!(choice_type::GENERAL, 2);
    }
}
