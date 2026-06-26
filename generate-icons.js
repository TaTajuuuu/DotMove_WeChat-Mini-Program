const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// CRC32 lookup table
const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function createPNG(width, height, pixels) {
  // pixels is a function (x, y) => [r, g, b, a]
  const raw = [];
  for (let y = 0; y < height; y++) {
    raw.push(0); // filter byte
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pixels(x, y);
      raw.push(r, g, b, a);
    }
  }
  const rawBuf = Buffer.from(raw);
  const compressed = zlib.deflateSync(rawBuf);

  const chunks = [];

  // PNG signature
  chunks.push(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  chunks.push(createChunk('IHDR', ihdr));

  // IDAT
  chunks.push(createChunk('IDAT', compressed));

  // IEND
  chunks.push(createChunk('IEND', Buffer.alloc(0)));

  return Buffer.concat(chunks);
}

function createChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);

  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);

  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);

  return Buffer.concat([len, typeAndData, crc]);
}

// Icon drawing helpers
function drawCircle(pixels, cx, cy, r, color) {
  return (x, y) => {
    const dx = x - cx;
    const dy = y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist <= r) {
      // Anti-aliasing
      const edge = Math.max(0, Math.min(1, r - dist + 0.5));
      return color.map(c => Math.round(c * edge));
    }
    return [0, 0, 0, 0];
  };
}

function drawRect(pixels, x1, y1, x2, y2, color) {
  return (x, y) => {
    if (x >= x1 && x <= x2 && y >= y1 && y <= y2) {
      return [...color];
    }
    return pixels ? pixels(x, y) : [0, 0, 0, 0];
  };
}

function drawLine(pixels, x1, y1, x2, y2, color, thickness) {
  return (x, y) => {
    const dist = pointToLineDist(x, y, x1, y1, x2, y2);
    if (dist <= thickness / 2) {
      return [...color];
    }
    return pixels ? pixels(x, y) : [0, 0, 0, 0];
  };
}

function pointToLineDist(px, py, x1, y1, x2, y2) {
  const A = px - x1;
  const B = py - y1;
  const C = x2 - x1;
  const D = y2 - y1;
  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  let param = lenSq !== 0 ? dot / lenSq : -1;
  let xx, yy;
  if (param < 0) { xx = x1; yy = y1; }
  else if (param > 1) { xx = x2; yy = y2; }
  else { xx = x1 + param * C; yy = y1 + param * D; }
  return Math.sqrt((px - xx) ** 2 + (py - yy) ** 2);
}

function combinePixels(width, height, layers) {
  return (x, y) => {
    for (let i = layers.length - 1; i >= 0; i--) {
      const [r, g, b, a] = layers[i](x, y);
      if (a > 0) return [r, g, b, a];
    }
    return [0, 0, 0, 0];
  };
}

// Create icons
const SIZE = 81;
const GRAY = [138, 147, 132, 255]; // #8a9384
const GREEN = [47, 125, 79, 255]; // #2f7d4f

function createGroupIcon(color) {
  const layers = [
    // Person 1 (left)
    drawCircle(null, 32, 28, 10, color),
    drawRect(null, 20, 45, 44, 70, color),
    // Person 2 (right)
    drawCircle(null, 52, 28, 10, color),
    drawRect(null, 40, 45, 64, 70, color),
  ];
  return combinePixels(SIZE, SIZE, layers);
}

function createCheckinIcon(color) {
  const layers = [
    // Calendar base
    drawRect(null, 15, 25, 65, 65, color),
    // Checkmark
    drawLine(null, 25, 45, 38, 58, [255, 255, 255, 255], 6),
    drawLine(null, 38, 58, 58, 30, [255, 255, 255, 255], 6),
  ];
  return combinePixels(SIZE, SIZE, layers);
}

function createMeIcon(color) {
  const layers = [
    drawCircle(null, 40, 28, 14, color),
    drawRect(null, 22, 50, 58, 72, color),
  ];
  return combinePixels(SIZE, SIZE, layers);
}

function createReviewIcon(color) {
  const layers = [
    // Bar chart
    drawRect(null, 18, 50, 30, 70, color),
    drawRect(null, 35, 40, 47, 70, color),
    drawRect(null, 52, 30, 64, 70, color),
  ];
  return combinePixels(SIZE, SIZE, layers);
}

// Generate icon files
const icons = [
  { name: 'tab-group', normal: createGroupIcon(GRAY), selected: createGroupIcon(GREEN) },
  { name: 'tab-checkin', normal: createCheckinIcon(GRAY), selected: createCheckinIcon(GREEN) },
  { name: 'tab-me', normal: createMeIcon(GRAY), selected: createMeIcon(GREEN) },
  { name: 'tab-review', normal: createReviewIcon(GRAY), selected: createReviewIcon(GREEN) },
];

const outDir = path.join(__dirname, '..', 'program', 'images', 'tab-icons');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

for (const icon of icons) {
  const normalPath = path.join(outDir, `${icon.name}.png`);
  const selectedPath = path.join(outDir, `${icon.name}-active.png`);

  fs.writeFileSync(normalPath, createPNG(SIZE, SIZE, icon.normal));
  fs.writeFileSync(selectedPath, createPNG(SIZE, SIZE, icon.selected));

  console.log(`Created: ${normalPath}`);
  console.log(`Created: ${selectedPath}`);
}

console.log('\nAll icons created successfully!');
