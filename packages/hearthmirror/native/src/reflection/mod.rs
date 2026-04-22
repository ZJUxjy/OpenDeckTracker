//! Per-method modules. Each exposes a single async fn registered as #[napi].

pub mod field_paths;
pub mod tags;
pub mod entity;
pub mod account_id;
pub mod arena;
pub mod battle_tag;
pub mod battlegrounds;
pub mod collection;
pub mod decks;
pub mod edited_deck;
pub mod game_state;
pub mod match_info;
pub mod medal_info;
pub mod server;
pub mod service_locator;
pub mod board_state;
pub mod hand_state;
pub mod deck_state;
pub mod opponent_secrets;
pub mod choices;
pub mod mulligan;
pub mod selected_deck;
