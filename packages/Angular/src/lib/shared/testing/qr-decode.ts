/**
 * An independent QR reader, written from the spec rather than from our encoder, so a
 * round-trip through it actually proves a code would scan.
 *
 * Reads a pristine matrix, so it does no Reed-Solomon correction — it locates the data
 * codewords, de-interleaves the blocks, and parses byte mode. Any error in masking,
 * function-pattern placement, block splitting or interleaving shows up as garbage out.
 */

const ALIGNMENT_CENTERS = [
  [], [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34],
  [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50],
];

/** [version]: [dataCodewordsTotal, eccPerBlock, [[blockCount, dataPerBlock], ...]] for ECC-M. */
const SPECS_M: Record<number, [number, number, number[][]]> = {
  1: [16, 10, [[1, 16]]],
  2: [28, 16, [[1, 28]]],
  3: [44, 26, [[1, 44]]],
  4: [64, 18, [[2, 32]]],
  5: [86, 24, [[2, 43]]],
  6: [108, 16, [[4, 27]]],
  7: [124, 18, [[4, 31]]],
  8: [154, 22, [[2, 38], [2, 39]]],
  9: [182, 22, [[3, 36], [2, 37]]],
  10: [216, 26, [[4, 43], [1, 44]]],
};

const MASK_FNS = [
  (r: number, c: number) => (r + c) % 2 === 0,
  (r: number) => r % 2 === 0,
  (_r: number, c: number) => c % 3 === 0,
  (r: number, c: number) => (r + c) % 3 === 0,
  (r: number, c: number) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r: number, c: number) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r: number, c: number) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r: number, c: number) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

/** Rebuild the reserved-cell map purely from the spec's geometry. */
function reservedMap(size: number, version: number): boolean[][] {
  const res = Array.from({ length: size }, () => new Array(size).fill(false));
  const mark = (r: number, c: number) => { if (r >= 0 && c >= 0 && r < size && c < size) res[r][c] = true; };

  // Finder patterns + separators (8x8 blocks at three corners).
  for (const [top, left] of [[0, 0], [0, size - 8], [size - 8, 0]]) {
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) mark(top + r, left + c);
  }
  // Timing patterns.
  for (let i = 0; i < size; i++) { mark(6, i); mark(i, 6); }
  // Format areas.
  for (let i = 0; i < 9; i++) { mark(8, i); mark(i, 8); }
  for (let i = 0; i < 8; i++) { mark(8, size - 1 - i); mark(size - 1 - i, 8); }
  // Alignment patterns (skipping ones that collide with a finder).
  const centers = ALIGNMENT_CENTERS[version] ?? [];
  for (const r of centers) for (const c of centers) {
    const nearFinder =
      (r < 9 && c < 9) || (r < 9 && c > size - 10) || (r > size - 10 && c < 9);
    if (nearFinder) continue;
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) mark(r + dr, c + dc);
  }
  return res;
}

/** Read the 15 format bits from the top-left copy and recover (eccLevel, mask). */
function readFormat(modules: boolean[][], size: number) {
  const bits: number[] = [];
  for (let c = 0; c <= 5; c++) bits.push(modules[8][c] ? 1 : 0);
  bits.push(modules[8][7] ? 1 : 0);
  bits.push(modules[8][8] ? 1 : 0);
  bits.push(modules[7][8] ? 1 : 0);
  for (let r = 5; r >= 0; r--) bits.push(modules[r][8] ? 1 : 0);

  const raw = bits.reduce((acc, b) => (acc << 1) | b, 0) ^ 0x5412;
  return { eccBits: (raw >> 13) & 0b11, mask: (raw >> 10) & 0b111 };
}

/** Walk the standard zigzag, un-masking as we go, into a codeword array. */
function readCodewords(modules: boolean[][], size: number, reserved: boolean[][], maskFn: (r: number, c: number) => boolean): number[] {
  const bits: number[] = [];
  let upward = true;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--;
    for (let i = 0; i < size; i++) {
      const row = upward ? size - 1 - i : i;
      for (let c = 0; c < 2; c++) {
        const cc = col - c;
        if (reserved[row][cc]) continue;
        const bit = modules[row][cc] !== maskFn(row, cc);
        bits.push(bit ? 1 : 0);
      }
    }
    upward = !upward;
  }
  const words: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    words.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  }
  return words;
}

/** Undo the block interleave and return the data codewords in logical order. */
function deinterleave(words: number[], version: number): number[] {
  const [, eccPerBlock, groups] = SPECS_M[version];
  const blocks: { dataLen: number; data: number[] }[] = [];
  for (const [count, dataLen] of groups) {
    for (let i = 0; i < count; i++) blocks.push({ dataLen, data: [] });
  }
  const maxData = Math.max(...blocks.map((b) => b.dataLen));

  let idx = 0;
  for (let i = 0; i < maxData; i++) {
    for (const b of blocks) {
      if (i < b.dataLen) b.data.push(words[idx++]);
    }
  }
  // ECC codewords follow; we do not need them to read a pristine matrix.
  void eccPerBlock;
  return blocks.flatMap((b) => b.data);
}

/** Parse byte-mode payload out of the data codewords. */
function parseBytes(data: number[], version: number): string {
  const bits: number[] = [];
  for (const w of data) for (let i = 7; i >= 0; i--) bits.push((w >> i) & 1);

  let p = 0;
  const take = (n: number) => { let v = 0; for (let i = 0; i < n; i++) v = (v << 1) | bits[p++]; return v; };

  const mode = take(4);
  if (mode !== 0b0100) throw new Error(`expected byte mode (0100), got ${mode.toString(2)}`);
  const lenBits = version <= 9 ? 8 : 16;
  const len = take(lenBits);
  const out: number[] = [];
  for (let i = 0; i < len; i++) out.push(take(8));
  return Buffer.from(out).toString('utf8');
}

export function decodeQr(matrix: { size: number; modules: boolean[][] }): { version: number; eccBits: number; mask: number; text: string } {
  const { size, modules } = matrix;
  const version = (size - 17) / 4;
  if (!Number.isInteger(version) || !SPECS_M[version]) {
    throw new Error(`unsupported size ${size}`);
  }
  const { eccBits, mask } = readFormat(modules, size);
  const reserved = reservedMap(size, version);
  const words = readCodewords(modules, size, reserved, MASK_FNS[mask]);
  const data = deinterleave(words, version);
  return { version, eccBits, mask, text: parseBytes(data, version) };
}
