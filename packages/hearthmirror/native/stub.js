/**
 * macOS / non-Windows stub for @hdt/hearthmirror-native.
 *
 * The native Rust crate is Windows-only (it reads the Hearthstone process
 * memory via Win32 APIs). On platforms where the real native binding is not
 * available, this stub lets the Electron app and renderer start for UI
 * development. All live mirror calls resolve to neutral "not connected"
 * values, so the tracker behaves as if Hearthstone is not running.
 */

const noOpAsync = () => Promise.resolve(null);
const noOpAsyncFalse = () => Promise.resolve(false);
const noOpAsyncZero = () => Promise.resolve(0);

const stub = {
  getAccountId: noOpAsync,
  getArenaDeck: noOpAsync,
  getBattlegroundRatingInfo: noOpAsync,
  getBattleTag: noOpAsync,
  getBoardState: noOpAsync,
  getBoundPid: noOpAsyncZero,
  getChoices: noOpAsync,
  getCollection: noOpAsync,
  getCollectionDiagnostic: noOpAsync,
  getDecks: noOpAsync,
  getDeckState: noOpAsync,
  getEditedDeck: noOpAsync,
  getGameType: noOpAsync,
  getHandState: noOpAsync,
  getHearthstoneWindow: noOpAsync,
  getMatchInfo: noOpAsync,
  getMedalInfo: noOpAsync,
  getOpponentSecrets: noOpAsync,
  getReinitCount: noOpAsyncZero,
  getSelectedDeckId: noOpAsync,
  getServerInfo: noOpAsync,
  isAlive: noOpAsyncFalse,
  isGameOver: noOpAsyncFalse,
  isMulligan: noOpAsync,
  isSpectating: noOpAsyncFalse,
  placeWindowAboveHearthstone: () => false,
  subscribeHearthstoneWindowEvents: () => 0,
  unsubscribeHearthstoneWindowEvents: () => true,
};

module.exports = stub;
