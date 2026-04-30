// One-shot diagnostic: print what getHearthstoneWindow() returns right now.
// Run with HS open: `node scripts/diagnose-hs-window.mjs`
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const native = require('../packages/hearthmirror/native/index.js');

const result = await native.getHearthstoneWindow();
console.log('getHearthstoneWindow result:');
console.log(JSON.stringify(result, null, 2));

if (result === null) {
  console.log('\n→ null means: no Unity window with process Hearthstone.exe was found.');
  console.log('  Possibilities:');
  console.log('  1. HS executable is named something other than Hearthstone.exe on your install.');
  console.log('  2. HS uses a class other than UnityWndClass (unlikely for Unity).');
  console.log('  3. HS is in exclusive fullscreen and the OS hides it from EnumWindows.');
} else if (!result.visible) {
  console.log('\n→ visible=false means IsWindowVisible() returned 0.');
} else if (result.minimized) {
  console.log('\n→ minimized=true means IsIconic() returned non-zero.');
} else {
  console.log('\n→ Window found and visible. The overlay SHOULD be tracking this.');
}
