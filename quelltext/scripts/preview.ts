import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { writeFileSync } from 'node:fs';
import { renderCanvas, FRAMES, type LabelDesign } from '../src/render';
const F = 'node_modules/@fontsource';
const reg = (f: string, name: string) => GlobalFonts.registerFromPath(`${F}/${f}`, name);
reg('kurale/files/kurale-latin-400-normal.woff2', 'Kurale');
reg('dancing-script/files/dancing-script-latin-700-normal.woff2', 'Dancing Script');
reg('playfair-display/files/playfair-display-latin-700-normal.woff2', 'Playfair Display');
reg('nunito/files/nunito-latin-800-normal.woff2', 'Nunito');
reg('nunito/files/nunito-latin-600-normal.woff2', 'Nunito');
reg('amatic-sc/files/amatic-sc-latin-700-normal.woff2', 'Amatic SC');
const cases: Partial<LabelDesign>[] = [
  ...FRAMES.map((f) => ({ frame: f.id })),
  { frame: 'zierrahmen', text: 'Vermi / Celli' },
  { frame: 'zierrahmen', font: 'schrift', text: 'Haferflocken', extra: 'abgefüllt 25.10.2026' },
  { frame: 'zierrahmen', shape: 'round', lengthMm: 52, widthMm: 52, text: 'Zimt' },
  { frame: 'girlande', shape: 'round', lengthMm: 52, widthMm: 52, text: 'Kakao' },
  { frame: 'zierrahmen', lengthMm: 40, widthMm: 30, text: 'Reis', font: 'kreide' },
];
const scale = 3, pad = 20, cw = 50 * 8 * scale / 2 + pad;
const out = createCanvas(cw * 2, Math.ceil(cases.length / 2) * (52 * 8 * scale / 2 + pad));
const octx = out.getContext('2d'); octx.fillStyle = '#ccc'; octx.fillRect(0, 0, out.width, out.height);
cases.forEach((c, i) => {
  const d: LabelDesign = { lengthMm: 50, widthMm: 30, shape: 'rect', marginMm: 1.5, frame: 'zierrahmen', font: 'verspielt', text: 'Mehl', extra: '', ...c } as LabelDesign;
  const cv = createCanvas(10, 10) as any;
  renderCanvas(d, cv);
  octx.drawImage(cv, (i % 2) * cw + pad / 2, Math.floor(i / 2) * (52 * 8 * scale / 2 + pad) + pad / 2, cv.width * scale / 2, cv.height * scale / 2);
});
writeFileSync(process.argv[2] ?? 'preview.png', out.toBuffer('image/png'));
