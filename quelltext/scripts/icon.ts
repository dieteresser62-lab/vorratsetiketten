// Erzeugt die App-Symbole: Messing-Hintergrund, darauf ein Etikett mit Blätterwiese-Rahmen.
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { writeFileSync } from 'node:fs';
import { renderCanvas } from '../src/render';
GlobalFonts.registerFromPath('node_modules/@fontsource/nunito/files/nunito-latin-800-normal.woff2', 'Nunito');

const label = createCanvas(1, 1) as any;
renderCanvas({ lengthMm: 44, widthMm: 32, shape: 'rect', marginMm: 0.8, frame: 'wiese', font: 'schlicht', text: 'Vorrat', extra: '' } as any, label);

function icon(size: number, file: string, safe: number) {
  const c = createCanvas(size, size);
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, size * 0.4, size);
  g.addColorStop(0, '#ecd38c'); g.addColorStop(0.5, '#c39a45'); g.addColorStop(1, '#7d5a1c');
  x.fillStyle = g; x.fillRect(0, 0, size, size);
  // Etikett mittig, etwas schräg, mit Schatten
  const lw = size * safe, lh = lw * label.height / label.width;
  x.save();
  x.translate(size / 2, size / 2);
  x.rotate(-0.08);
  x.shadowColor = 'rgba(40,25,0,.45)'; x.shadowBlur = size * 0.04; x.shadowOffsetY = size * 0.02;
  const r = lw * 0.07;
  x.beginPath(); x.roundRect(-lw / 2, -lh / 2, lw, lh, r); x.fillStyle = '#fffdf7'; x.fill();
  x.shadowColor = 'transparent';
  x.clip();
  x.drawImage(label, -lw / 2, -lh / 2, lw, lh);
  x.restore();
  writeFileSync(file, c.toBuffer('image/png'));
}
icon(512, 'public/icon-512.png', 0.8);
icon(192, 'public/icon-192.png', 0.8);
icon(512, 'public/icon-maskable-512.png', 0.66); // Android schneidet Kreis/Squircle aus
icon(180, 'public/apple-touch-icon.png', 0.8);
