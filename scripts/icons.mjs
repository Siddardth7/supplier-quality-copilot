// issue 169: writes the app icons (decision 251). node scripts/icons.mjs  ->  icons/icon.svg, icon-192.png, icon-512.png
// Node built-ins only: a hand-built PNG (signature, IHDR, IDAT of deflated RGBA scanlines, IEND; CRC via zlib.crc32).
// Design: full-bleed navy (--bg) square, a thick cyan (--cyan) ring with a vertical tick (a gauge), inside the
// central 80% so one file serves purpose "any maskable". Colours come from design/tokens.css. Not run by tests.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { crc32, deflateSync } from 'node:zlib';

const ROOT = new URL('../', import.meta.url);
const OUT = new URL('icons/', ROOT);
const tokens = readFileSync(new URL('design/tokens.css', ROOT), 'utf8');
const token = (name) => {
  const m = tokens.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})\\b`));
  if (!m) throw new Error(`design/tokens.css: --${name} is not a 6-digit hex colour`);
  return m[1];
};
const BG = token('bg'), FG = token('cyan');
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

// Shape in units of the icon size (0..1). Ring radii and tick box, all within 0.1..0.9 (maskable safe zone).
const R_OUT = 0.30, R_IN = 0.21, TICK = { x0: 0.465, x1: 0.535, y0: 0.29, y1: 0.52 };
const inside = (x, y) => {
  const d = Math.hypot(x - 0.5, y - 0.5);
  return (d <= R_OUT && d >= R_IN) || (x >= TICK.x0 && x <= TICK.x1 && y >= TICK.y0 && y <= TICK.y1);
};

const SS = 4;  // ponytail: 4x4 supersampling is the anti-aliasing; enough for a two-colour mark
function png(size) {
  const bg = rgb(BG), fg = rgb(FG);
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    const row = y * (size * 4 + 1);  // filter byte 0 (None) then RGBA
    for (let x = 0; x < size; x += 1) {
      let hits = 0;
      for (let sy = 0; sy < SS; sy += 1) for (let sx = 0; sx < SS; sx += 1)
        if (inside((x + (sx + 0.5) / SS) / size, (y + (sy + 0.5) / SS) / size)) hits += 1;
      const a = hits / (SS * SS), o = row + 1 + x * 4;
      for (let c = 0; c < 3; c += 1) raw[o + c] = Math.round(bg[c] + (fg[c] - bg[c]) * a);
      raw[o + 3] = 255;
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;  // 8-bit RGBA; compression, filter, interlace stay 0
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const u = (v) => +(v * 512).toFixed(1);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="${BG}"/>
  <circle cx="256" cy="256" r="${u((R_OUT + R_IN) / 2)}" fill="none" stroke="${FG}" stroke-width="${u(R_OUT - R_IN)}"/>
  <rect x="${u(TICK.x0)}" y="${u(TICK.y0)}" width="${u(TICK.x1 - TICK.x0)}" height="${u(TICK.y1 - TICK.y0)}" fill="${FG}"/>
</svg>
`;

mkdirSync(OUT, { recursive: true });
writeFileSync(new URL('icon.svg', OUT), svg);
for (const size of [192, 512]) writeFileSync(new URL(`icon-${size}.png`, OUT), png(size));
console.log('icons/icon.svg, icons/icon-192.png, icons/icon-512.png');
