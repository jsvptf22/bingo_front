#!/usr/bin/env node
/**
 * Genera la colección de 500 códigos QR numerados del 1 al 500.
 *
 * Uso:
 *   node scripts/generate-qr-codes.cjs
 *
 * Resultado en codigos-qr/:
 *   - jugador-001.svg ... jugador-500.svg
 *   - jugador-001.png ... jugador-500.png
 *   - index.html (galería lista para imprimir)
 *   - LEEME.txt
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const qrcode = require('../vendor/qrcode.js');

const TOTAL = 500;
const OUT_DIR = path.resolve(__dirname, '..', 'codigos-qr');
const SCALE = 10; // píxeles por módulo en el PNG
const MARGIN = 4; // módulos de margen (zona de silencio)
const LABEL_HEIGHT = 100; // franja inferior para el número visible
const LABEL_SCALE = 10; // tamaño de cada píxel del número en el PNG

// Tipografía 5×7 para dibujar el número en el PNG sin dependencias.
const FONT = {
  0: ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  1: ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  2: ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  3: ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
  4: ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  5: ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  6: ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  7: ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  8: ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  9: ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  '#': ['01010', '01010', '11111', '01010', '11111', '01010', '01010'],
};

/* ---------------------------------------------------------------
   PNG en escala de grises (sin dependencias externas)
   --------------------------------------------------------------- */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function makePng(qr, number) {
  const modules = qr.getModuleCount();
  const side = (modules + MARGIN * 2) * SCALE;
  const width = side;
  const height = side + LABEL_HEIGHT;

  const raw = Buffer.alloc((width + 1) * height, 255);

  // Código QR
  for (let y = 0; y < side; y += 1) {
    const rowStart = y * (width + 1);
    raw[rowStart] = 0; // filtro "None" de PNG

    const moduleY = Math.floor(y / SCALE) - MARGIN;
    for (let x = 0; x < width; x += 1) {
      const moduleX = Math.floor(x / SCALE) - MARGIN;
      const dark =
        moduleX >= 0 &&
        moduleY >= 0 &&
        moduleX < modules &&
        moduleY < modules &&
        qr.isDark(moduleY, moduleX);
      raw[rowStart + 1 + x] = dark ? 0 : 255;
    }
  }

  // Número visible bajo el QR: #1, #42, #500…
  const text = `#${number}`;
  const glyphWidth = 5 * LABEL_SCALE;
  const glyphHeight = 7 * LABEL_SCALE;
  const gap = LABEL_SCALE;
  const textWidth = text.length * glyphWidth + (text.length - 1) * gap;
  const startX = Math.round((width - textWidth) / 2);
  const startY = side + Math.round((LABEL_HEIGHT - glyphHeight) / 2);

  for (let y = side; y < height; y += 1) {
    raw[y * (width + 1)] = 0;
  }

  [...text].forEach((char, index) => {
    const glyph = FONT[char];
    if (!glyph) return;
    const glyphX = startX + index * (glyphWidth + gap);
    glyph.forEach((row, rowIndex) => {
      [...row].forEach((cell, colIndex) => {
        if (cell !== '1') return;
        const px = glyphX + colIndex * LABEL_SCALE;
        const py = startY + rowIndex * LABEL_SCALE;
        for (let dy = 0; dy < LABEL_SCALE; dy += 1) {
          const offset = (py + dy) * (width + 1) + 1 + px;
          for (let dx = 0; dx < LABEL_SCALE; dx += 1) {
            raw[offset + dx] = 0;
          }
        }
      });
    });
  });

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // profundidad de bits
  ihdr[9] = 0; // escala de grises
  ihdr[10] = 0; // compresión deflate
  ihdr[11] = 0; // filtro estándar
  ihdr[12] = 0; // sin entrelazado

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function buildSvg(qr, number) {
  const modules = qr.getModuleCount();
  const side = (modules + MARGIN * 2) * SCALE;
  const height = side + LABEL_HEIGHT;
  let pathData = '';

  for (let row = 0; row < modules; row += 1) {
    for (let col = 0; col < modules; col += 1) {
      if (!qr.isDark(row, col)) continue;
      const x = MARGIN * SCALE + col * SCALE;
      const y = MARGIN * SCALE + row * SCALE;
      pathData += `M${x} ${y}h${SCALE}v${SCALE}h-${SCALE}z`;
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${side}" height="${height}" viewBox="0 0 ${side} ${height}" role="img" aria-label="Jugador ${number}">
  <title>Jugador ${number}</title>
  <desc>Código QR con el número ${number} y su etiqueta visible.</desc>
  <rect width="${side}" height="${height}" fill="#fff"/>
  <path d="${pathData}" fill="#000" shape-rendering="crispEdges"/>
  <text x="${side / 2}" y="${side + 74}" text-anchor="middle" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Arial, sans-serif" font-size="66" font-weight="800" fill="#000">#${number}</text>
</svg>`;
}

/* ---------------------------------------------------------------
   Generación de códigos
   --------------------------------------------------------------- */

function buildQr(number) {
  const qr = qrcode(0, 'M');
  qr.addData(String(number));
  qr.make();
  return qr;
}

function pad(number) {
  return String(number).padStart(3, '0');
}

function buildIndex(numbers) {
  const cards = numbers
    .map((number) => {
      const file = `jugador-${pad(number)}.svg`;
      return `        <article class="card">
          <img src="${file}" alt="Código QR del jugador ${number}, con el número ${number} visible" width="240" height="323">
        </article>`;
    })
    .join('\n');

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%23D8FF3E'/%3E%3Crect x='16' y='16' width='14' height='14' fill='%230E100D'/%3E%3Crect x='34' y='16' width='14' height='14' fill='%230E100D'/%3E%3Crect x='16' y='34' width='14' height='14' fill='%230E100D'/%3E%3Crect x='34' y='34' width='14' height='14' fill='%230E100D'/%3E%3C/svg%3E">
  <title>Códigos QR · jugadores 1–500</title>
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 24px;
      background: #f3f1ea;
      color: #17190f;
      font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    }
    header { max-width: 1100px; margin: 0 auto 22px; }
    h1 { margin: 0 0 6px; font-size: clamp(1.5rem, 3vw, 2.2rem); letter-spacing: -0.03em; }
    p { margin: 0; max-width: 70ch; line-height: 1.55; color: #4b4d42; }
    a { color: #17190f; font-weight: 700; }
    .actions { margin-top: 16px; display: flex; gap: 10px; flex-wrap: wrap; }
    button {
      padding: 11px 18px;
      border: 0;
      border-radius: 10px;
      background: #17190f;
      color: #f3f1ea;
      font: inherit;
      font-weight: 700;
      cursor: pointer;
    }
    .grid {
      max-width: 1100px;
      margin: 0 auto;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
      gap: 12px;
    }
    .card {
      display: grid;
      justify-items: center;
      padding: 10px;
      border: 1px solid #d7d3c6;
      border-radius: 10px;
      background: #fff;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .card img { display: block; width: 100%; height: auto; max-width: 190px; }
    @page { size: A4 portrait; margin: 8mm; }
    @media print {
      body { padding: 0; background: #fff; }
      header { display: none; }
      .grid {
        max-width: none;
        grid-template-columns: repeat(5, 1fr);
        gap: 3mm;
      }
      .card { padding: 1.5mm; border-color: #bbb; }
      .card img { max-width: 33mm; }
    }
  </style>
</head>
<body>
  <header>
    <h1>Códigos QR · jugadores 1–500</h1>
    <p>Cada código contiene únicamente su número y lo muestra impreso en grande bajo el QR para poder asignarlo sin escanear. Usa <strong>Imprimir</strong> para generar las hojas (25 códigos por página) o abre cada archivo <code>jugador-XXX.svg</code> / <code>jugador-XXX.png</code> por separado. También puedes abrir el PDF ya preparado: <a href="codigos-qr-1-500.pdf">codigos-qr-1-500.pdf</a> (20 páginas A4).</p>
    <div class="actions">
      <button type="button" onclick="window.print()">Imprimir todos los códigos</button>
    </div>
  </header>

  <main class="grid" aria-label="Códigos QR del 1 al 500">
${cards}
  </main>
</body>
</html>
`;
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const numbers = Array.from({ length: TOTAL }, (_, index) => index + 1);

  numbers.forEach((number) => {
    const qr = buildQr(number);
    const base = `jugador-${pad(number)}`;

    fs.writeFileSync(path.join(OUT_DIR, `${base}.svg`), `${buildSvg(qr, number)}\n`);
    fs.writeFileSync(path.join(OUT_DIR, `${base}.png`), makePng(qr, number));
  });

  fs.writeFileSync(path.join(OUT_DIR, 'index.html'), buildIndex(numbers));

  fs.writeFileSync(
    path.join(OUT_DIR, 'LEEME.txt'),
    [
      'CÓDIGOS QR · JUGADORES 1–500',
      '',
      'Cada archivo contiene un único número como contenido del QR y muestra',
      'ese mismo número en grande debajo del código:',
      '  jugador-001.svg / .png  ->  contenido "1"   · etiqueta visible "#1"',
      '  jugador-002.svg / .png  ->  contenido "2"   · etiqueta visible "#2"',
      '  ...',
      '  jugador-500.svg / .png  ->  contenido "500" · etiqueta visible "#500"',
      '',
      'Cómo usarlos:',
      '1. Abre index.html para ver todos los códigos y usar el botón Imprimir.',
      '   La impresión usa hojas A4 con una cuadrícula de 5 × 5 códigos.',
      '   También puedes imprimir directamente codigos-qr-1-500.pdf (20 páginas).',
      '2. O abre/escanea los archivos individuales jugador-XXX.svg o jugador-XXX.png.',
      '3. En la app, escanea el QR: se añadirá automáticamente "Jugador #X".',
      '4. Para asignar jugadores sin escanear, usa el número visible bajo cada QR.',
      '',
      'Los SVG son ideales para imprimir (no pierden calidad).',
      'Los PNG son imágenes de 290 × 390 px listas para usar en pantalla.',
      'El número está integrado en ambos formatos: no hace falta abrir otro archivo.',
      '',
      `Generado: ${new Date().toISOString()}`,
      '',
    ].join('\n')
  );

  console.log(`Generados ${TOTAL} códigos QR (SVG + PNG) en ${OUT_DIR}`);
}

main();
