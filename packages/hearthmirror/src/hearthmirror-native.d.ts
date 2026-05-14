import '@hdt/hearthmirror-native';

declare module '@hdt/hearthmirror-native' {
  interface HearthstoneWindowResult {
    foreground: boolean;
  }

  function placeWindowAboveHearthstone(nativeWindowHandle: Uint8Array): boolean;
}
