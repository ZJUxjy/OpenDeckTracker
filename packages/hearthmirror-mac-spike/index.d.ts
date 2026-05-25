/* eslint-disable */
/* prettier-ignore */
// Placeholder declarations for @hdt/hearthmirror-mac-spike.
//
// `napi build` overwrites this file with the napi-rs generated types
// after a real build. The placeholder exists only so that `tsc`
// can resolve `await import('@hdt/hearthmirror-mac-spike')` from the
// main-process spike trigger BEFORE the first napi build runs.
//
// Throw-away — deleted at teardown along with the rest of the package.

export interface MachoSpikeResult {
  pid: number;
  baseAddress: string;
  headerHex: string;
}

export interface WindowSpikeResult {
  pid: number;
  x: number;
  y: number;
  width: number;
  height: number;
  fullscreen: boolean;
}

export declare function spikeReadMacho(): Promise<MachoSpikeResult>;
export declare function spikeReadHearthstoneWindow(): Promise<WindowSpikeResult>;
