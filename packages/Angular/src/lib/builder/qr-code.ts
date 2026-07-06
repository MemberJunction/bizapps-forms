/**
 * Minimal, dependency-free QR code generator (byte mode, ECC level M).
 *
 * Used by the distribution manager to render a scannable QR for a public form URL
 * as an inline SVG — no external service (CSP-safe) and no npm dependency. Supports
 * versions 1–10 (up to ~150 alphanumeric/byte chars at ECC-M), which comfortably
 * covers form public links. Throws if the payload is too long for version 10.
 *
 * Algorithm: standard QR encoding — byte-mode data, Reed-Solomon ECC over GF(256),
 * fixed function patterns, and mask pattern 0 (validated against the spec). Kept
 * compact and pure (no I/O, no DOM) so it is unit-testable.
 */

// GF(256) log/antilog tables (primitive polynomial 0x11d).
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(function initTables(): void {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) {
      x ^= 0x11d;
    }
  }
  for (let i = 255; i < 512; i++) {
    GF_EXP[i] = GF_EXP[i - 255];
  }
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) {
    return 0;
  }
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

/** Total data codewords and ECC-codewords-per-block for ECC level M, versions 1–10. */
interface VersionSpec {
  version: number;
  totalCodewords: number;
  eccPerBlock: number;
  /** [count, dataCodewords] groups. */
  blocks: Array<[number, number]>;
}

const VERSION_SPECS_M: ReadonlyArray<VersionSpec> = [
  { version: 1, totalCodewords: 26, eccPerBlock: 10, blocks: [[1, 16]] },
  { version: 2, totalCodewords: 44, eccPerBlock: 16, blocks: [[1, 28]] },
  { version: 3, totalCodewords: 70, eccPerBlock: 26, blocks: [[1, 44]] },
  { version: 4, totalCodewords: 100, eccPerBlock: 18, blocks: [[2, 32]] },
  { version: 5, totalCodewords: 134, eccPerBlock: 24, blocks: [[2, 43]] },
  { version: 6, totalCodewords: 172, eccPerBlock: 16, blocks: [[4, 27]] },
  { version: 7, totalCodewords: 196, eccPerBlock: 18, blocks: [[4, 31]] },
  { version: 8, totalCodewords: 242, eccPerBlock: 22, blocks: [[2, 38], [2, 39]] },
  { version: 9, totalCodewords: 292, eccPerBlock: 22, blocks: [[3, 36], [2, 37]] },
  { version: 10, totalCodewords: 346, eccPerBlock: 26, blocks: [[4, 43], [1, 44]] },
];

function totalDataCodewords(spec: VersionSpec): number {
  return spec.blocks.reduce((sum, [count, data]) => sum + count * data, 0);
}

/** Reed-Solomon ECC codewords for one data block. */
function rsEncode(data: number[], eccLen: number): number[] {
  const generator = rsGenerator(eccLen);
  const result = new Array<number>(eccLen).fill(0);
  for (const byte of data) {
    const factor = byte ^ result[0];
    result.shift();
    result.push(0);
    for (let i = 0; i < eccLen; i++) {
      result[i] ^= gfMul(generator[i], factor);
    }
  }
  return result;
}

function rsGenerator(eccLen: number): number[] {
  let poly = [1];
  for (let i = 0; i < eccLen; i++) {
    const next = new Array<number>(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], GF_EXP[i]);
    }
    poly = next;
  }
  return poly;
}

/** Encode the text payload to the interleaved final codeword stream + chosen version. */
function buildCodewords(text: string): { spec: VersionSpec; codewords: number[] } {
  const bytes = utf8Bytes(text);
  const spec = pickVersion(bytes.length);
  const bits = encodeBits(bytes, spec);
  const dataCodewords = bitsToCodewords(bits, totalDataCodewords(spec));
  const { dataBlocks, eccBlocks } = splitBlocks(dataCodewords, spec);
  return { spec, codewords: interleave(dataBlocks, eccBlocks) };
}

function utf8Bytes(text: string): number[] {
  return Array.from(new TextEncoder().encode(text));
}

function pickVersion(byteLen: number): VersionSpec {
  for (const spec of VERSION_SPECS_M) {
    // 4 mode bits + char-count bits (8 for v1-9, 16 for v10) + payload + terminator.
    const charCountBits = spec.version >= 10 ? 16 : 8;
    const neededBits = 4 + charCountBits + byteLen * 8;
    if (neededBits <= totalDataCodewords(spec) * 8) {
      return spec;
    }
  }
  throw new Error('QR payload too long for supported versions (max ~150 bytes).');
}

function encodeBits(bytes: number[], spec: VersionSpec): number[] {
  const bits: number[] = [];
  pushBits(bits, 0b0100, 4); // byte mode
  const charCountBits = spec.version >= 10 ? 16 : 8;
  pushBits(bits, bytes.length, charCountBits);
  for (const b of bytes) {
    pushBits(bits, b, 8);
  }
  const capacityBits = totalDataCodewords(spec) * 8;
  // Terminator (up to 4 zero bits).
  for (let i = 0; i < 4 && bits.length < capacityBits; i++) {
    bits.push(0);
  }
  // Pad to a byte boundary.
  while (bits.length % 8 !== 0) {
    bits.push(0);
  }
  return bits;
}

function pushBits(out: number[], value: number, length: number): void {
  for (let i = length - 1; i >= 0; i--) {
    out.push((value >> i) & 1);
  }
}

function bitsToCodewords(bits: number[], target: number): number[] {
  const codewords: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) {
      byte = (byte << 1) | (bits[i + j] ?? 0);
    }
    codewords.push(byte);
  }
  const pads = [0xec, 0x11];
  let padIndex = 0;
  while (codewords.length < target) {
    codewords.push(pads[padIndex % 2]);
    padIndex++;
  }
  return codewords;
}

function splitBlocks(
  data: number[],
  spec: VersionSpec,
): { dataBlocks: number[][]; eccBlocks: number[][] } {
  const dataBlocks: number[][] = [];
  const eccBlocks: number[][] = [];
  let offset = 0;
  for (const [count, dataLen] of spec.blocks) {
    for (let i = 0; i < count; i++) {
      const block = data.slice(offset, offset + dataLen);
      offset += dataLen;
      dataBlocks.push(block);
      eccBlocks.push(rsEncode(block, spec.eccPerBlock));
    }
  }
  return { dataBlocks, eccBlocks };
}

function interleave(dataBlocks: number[][], eccBlocks: number[][]): number[] {
  const result: number[] = [];
  const maxData = Math.max(...dataBlocks.map((b) => b.length));
  for (let i = 0; i < maxData; i++) {
    for (const block of dataBlocks) {
      if (i < block.length) {
        result.push(block[i]);
      }
    }
  }
  const maxEcc = Math.max(...eccBlocks.map((b) => b.length));
  for (let i = 0; i < maxEcc; i++) {
    for (const block of eccBlocks) {
      if (i < block.length) {
        result.push(block[i]);
      }
    }
  }
  return result;
}

/** A square QR matrix of true (dark) / false (light) modules. */
export interface QrMatrix {
  size: number;
  modules: boolean[][];
}

/** Build the QR matrix for a payload. */
export function generateQrMatrix(text: string): QrMatrix {
  const { spec, codewords } = buildCodewords(text);
  const size = 17 + spec.version * 4;
  const modules: (boolean | null)[][] = Array.from({ length: size }, () =>
    new Array<boolean | null>(size).fill(null),
  );

  placeFinderPatterns(modules, size);
  placeTimingPatterns(modules, size);
  placeAlignmentPatterns(modules, spec.version);
  // Dark module (always set per spec).
  modules[size - 8][8] = true;
  reserveFormatAreas(modules, size);

  placeData(modules, size, codewords);
  applyMask0(modules, size);
  placeFormatBits(modules, size);

  return { size, modules: modules.map((row) => row.map((m) => m === true)) };
}

function setFinder(modules: (boolean | null)[][], top: number, left: number): void {
  for (let r = -1; r <= 7; r++) {
    for (let c = -1; c <= 7; c++) {
      const rr = top + r;
      const cc = left + c;
      if (rr < 0 || cc < 0 || rr >= modules.length || cc >= modules.length) {
        continue;
      }
      const isBorder = r >= 0 && r <= 6 && (c === 0 || c === 6);
      const isSide = c >= 0 && c <= 6 && (r === 0 || r === 6);
      const isCore = r >= 2 && r <= 4 && c >= 2 && c <= 4;
      modules[rr][cc] = isBorder || isSide || isCore;
    }
  }
}

function placeFinderPatterns(modules: (boolean | null)[][], size: number): void {
  setFinder(modules, 0, 0);
  setFinder(modules, 0, size - 7);
  setFinder(modules, size - 7, 0);
}

function placeTimingPatterns(modules: (boolean | null)[][], size: number): void {
  for (let i = 8; i < size - 8; i++) {
    const bit = i % 2 === 0;
    if (modules[6][i] === null) {
      modules[6][i] = bit;
    }
    if (modules[i][6] === null) {
      modules[i][6] = bit;
    }
  }
}

const ALIGNMENT_CENTERS: ReadonlyArray<number[]> = [
  [], [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34],
  [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50],
];

function placeAlignmentPatterns(modules: (boolean | null)[][], version: number): void {
  const centers = ALIGNMENT_CENTERS[version] ?? [];
  for (const r of centers) {
    for (const c of centers) {
      if (modules[r][c] !== null) {
        continue; // overlaps a finder pattern
      }
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const ring = Math.max(Math.abs(dr), Math.abs(dc));
          modules[r + dr][c + dc] = ring !== 1;
        }
      }
    }
  }
}

function reserveFormatAreas(modules: (boolean | null)[][], size: number): void {
  for (let i = 0; i < 9; i++) {
    if (modules[8][i] === null) {
      modules[8][i] = false;
    }
    if (modules[i][8] === null) {
      modules[i][8] = false;
    }
  }
  for (let i = 0; i < 8; i++) {
    if (modules[8][size - 1 - i] === null) {
      modules[8][size - 1 - i] = false;
    }
    if (modules[size - 1 - i][8] === null) {
      modules[size - 1 - i][8] = false;
    }
  }
}

function placeData(modules: (boolean | null)[][], size: number, codewords: number[]): void {
  let bitIndex = 0;
  const totalBits = codewords.length * 8;
  let upward = true;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) {
      col--; // skip the vertical timing column
    }
    for (let i = 0; i < size; i++) {
      const row = upward ? size - 1 - i : i;
      for (let c = 0; c < 2; c++) {
        const cc = col - c;
        if (modules[row][cc] !== null) {
          continue;
        }
        let bit = false;
        if (bitIndex < totalBits) {
          const byte = codewords[bitIndex >> 3];
          bit = ((byte >> (7 - (bitIndex & 7))) & 1) === 1;
          bitIndex++;
        }
        modules[row][cc] = bit;
      }
    }
    upward = !upward;
  }
}

/** Mask pattern 0: invert where (row + col) % 2 === 0, data modules only. */
function applyMask0(modules: (boolean | null)[][], size: number): void {
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (isFunctionModule(r, c, size) || modules[r][c] === null) {
        continue;
      }
      if ((r + c) % 2 === 0) {
        modules[r][c] = !modules[r][c];
      }
    }
  }
}

function isFunctionModule(r: number, c: number, size: number): boolean {
  // Finder + separators.
  if (r <= 8 && c <= 8) return true;
  if (r <= 8 && c >= size - 8) return true;
  if (r >= size - 8 && c <= 8) return true;
  // Timing.
  if (r === 6 || c === 6) return true;
  return false;
}

/** Format info for ECC-M + mask 0, with BCH(15,5) + mask 0x5412. Precomputed. */
const FORMAT_BITS_M_MASK0 = 0b101010000010010;

function placeFormatBits(modules: (boolean | null)[][], size: number): void {
  const bits: number[] = [];
  for (let i = 14; i >= 0; i--) {
    bits.push((FORMAT_BITS_M_MASK0 >> i) & 1);
  }
  // Around the top-left finder.
  const topLeftPositions: Array<[number, number]> = [
    [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8],
    [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8],
  ];
  topLeftPositions.forEach(([r, c], i) => {
    modules[r][c] = bits[i] === 1;
  });
  // Mirrored copy near the other two finders.
  const splitPositions: Array<[number, number]> = [
    [size - 1, 8], [size - 2, 8], [size - 3, 8], [size - 4, 8],
    [size - 5, 8], [size - 6, 8], [size - 7, 8],
    [8, size - 8], [8, size - 7], [8, size - 6], [8, size - 5],
    [8, size - 4], [8, size - 3], [8, size - 2], [8, size - 1],
  ];
  splitPositions.forEach(([r, c], i) => {
    modules[r][c] = bits[i] === 1;
  });
}

/** Render a QR matrix to a self-contained SVG string (token-colored, no external refs). */
export function qrMatrixToSvg(matrix: QrMatrix, options?: { quietZone?: number }): string {
  const quiet = options?.quietZone ?? 4;
  const dim = matrix.size + quiet * 2;
  const rects: string[] = [];
  for (let r = 0; r < matrix.size; r++) {
    for (let c = 0; c < matrix.size; c++) {
      if (matrix.modules[r][c]) {
        rects.push(`<rect x="${c + quiet}" y="${r + quiet}" width="1.02" height="1.02"/>`);
      }
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" ` +
    `shape-rendering="crispEdges" role="img" aria-label="QR code">` +
    `<rect width="${dim}" height="${dim}" fill="var(--mj-bg-surface, #fff)"/>` +
    `<g fill="var(--mj-text-primary, #000)">${rects.join('')}</g>` +
    `</svg>`
  );
}

/** Convenience: text payload directly to an SVG string. */
export function textToQrSvg(text: string): string {
  return qrMatrixToSvg(generateQrMatrix(text));
}
