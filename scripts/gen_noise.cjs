// Generates a 256x256 monochrome noise PNG without any native dependencies.
// Uses pure JS to write a valid uncompressed PNG file.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const W = 256, H = 256;

// Generate raw RGBA pixel data
const raw = Buffer.alloc(H * (1 + W * 4)); // each row: filter byte + RGBA * W
for (let y = 0; y < H; y++) {
  const rowOff = y * (1 + W * 4);
  raw[rowOff] = 0; // no filter
  for (let x = 0; x < W; x++) {
    const off = rowOff + 1 + x * 4;
    const v = Math.random() > 0.5 ? 255 : 0;
    raw[off] = v;
    raw[off + 1] = v;
    raw[off + 2] = v;
    raw[off + 3] = 255;
  }
}

const deflated = zlib.deflateSync(raw);

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const typeB = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([typeB, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

// IHDR
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8;  // bit depth
ihdr[9] = 6;  // color type RGBA
ihdr[10] = 0; // compression
ihdr[11] = 0; // filter
ihdr[12] = 0; // interlace

const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const png = Buffer.concat([
  sig,
  chunk('IHDR', ihdr),
  chunk('IDAT', deflated),
  chunk('IEND', Buffer.alloc(0))
]);

const outPath = path.join(__dirname, 'web', 'public', 'fx', 'noise-256.png');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, png);
console.log('Generated noise-256.png (' + png.length + ' bytes)');
