/** Codificador PNG mínimo (RGBA 8 bits) usando o zlib do Node. */
import { deflateSync, inflateSync } from "node:zlib";

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  Buffer.from(data).copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

export function encodePNG(width: number, height: number, rgba: Uint8ClampedArray | Uint8Array): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bits
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filtro "none"
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", new Uint8Array(0)),
  ]);
}

/** Decodificador PNG mínimo: 8 bits, sem entrelaçamento; tons de cinza, RGB, paleta (com tRNS), cinza+alfa e RGBA. */
export function decodePNG(buf: Uint8Array): { width: number; height: number; data: Uint8ClampedArray } {
  const b = Buffer.from(buf);
  if (b.readUInt32BE(0) !== 0x89504e47) throw new Error("Não é um PNG (assinatura inválida). Converta WebP/JPG para PNG antes.");
  let pos = 8, width = 0, height = 0, depth = 0, ctype = 0, interlace = 0;
  const idat: Buffer[] = [];
  let plte: Buffer | null = null, trns: Buffer | null = null;
  while (pos < b.length) {
    const len = b.readUInt32BE(pos), type = b.toString("ascii", pos + 4, pos + 8), body = b.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") { width = body.readUInt32BE(0); height = body.readUInt32BE(4); depth = body[8]; ctype = body[9]; interlace = body[12]; }
    else if (type === "PLTE") plte = body;
    else if (type === "tRNS") trns = body;
    else if (type === "IDAT") idat.push(body);
    else if (type === "IEND") break;
    pos += 12 + len;
  }
  if (depth !== 8) throw new Error(`PNG de ${depth} bits por canal não é suportado (use 8 bits).`);
  if (interlace) throw new Error("PNG entrelaçado não é suportado.");
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ctype];
  if (!ch) throw new Error(`Tipo de cor PNG ${ctype} não suportado.`);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * ch, out = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), dst = out.subarray(y * stride, (y + 1) * stride), prev = y ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? dst[i - ch] : 0, up = prev ? prev[i] : 0, c = prev && i >= ch ? prev[i - ch] : 0;
      let v = src[i];
      if (f === 1) v += a; else if (f === 2) v += up; else if (f === 3) v += (a + up) >> 1;
      else if (f === 4) { const p = a + up - c, pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? up : c; }
      dst[i] = v & 255;
    }
  }
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4, s = i * ch;
    if (ctype === 6) { data[o] = out[s]; data[o + 1] = out[s + 1]; data[o + 2] = out[s + 2]; data[o + 3] = out[s + 3]; }
    else if (ctype === 2) { data[o] = out[s]; data[o + 1] = out[s + 1]; data[o + 2] = out[s + 2]; data[o + 3] = 255; }
    else if (ctype === 0) { data[o] = data[o + 1] = data[o + 2] = out[s]; data[o + 3] = 255; }
    else if (ctype === 4) { data[o] = data[o + 1] = data[o + 2] = out[s]; data[o + 3] = out[s + 1]; }
    else { const k = out[s]; data[o] = plte?.[k * 3] ?? 0; data[o + 1] = plte?.[k * 3 + 1] ?? 0; data[o + 2] = plte?.[k * 3 + 2] ?? 0; data[o + 3] = trns && k < trns.length ? trns[k] : 255; }
  }
  return { width, height, data };
}
