export function writeVarint(out: number[], value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`writeVarint requires unsigned integer, got ${value}`);
  }
  let v = value;
  while (v >= 0x80) {
    out.push((v & 0x7f) | 0x80);
    v = Math.floor(v / 128);
  }
  out.push(v);
}

export function readVarint(buf: Buffer, offset: number): [value: number, bytesRead: number] {
  let result = 0;
  let shift = 0;
  let i = 0;
  for (;;) {
    if (offset + i >= buf.length) {
      throw new Error('readVarint: unexpected end of buffer');
    }
    const byte = buf[offset + i]!;
    result += (byte & 0x7f) * 2 ** shift;
    i += 1;
    if ((byte & 0x80) === 0) return [result, i];
    shift += 7;
    if (shift >= 35) {
      throw new Error('readVarint: overflow (too many continuation bytes)');
    }
  }
}
