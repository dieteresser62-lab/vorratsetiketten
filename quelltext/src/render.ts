// Zeichnet ein Dosenetikett (Rahmen + Inhalt) auf ein Canvas in Druckauflösung (8 Punkte/mm).
import { rgbaToBitmap } from './vendor/printer/bitmap';
import type { Bitmap } from './vendor/printer/types';
import { BOTANIK, drawBotanik, type BotanikId, type Box } from './botanik';

export const DPMM = 8;
export type Shape = 'rect' | 'rounded' | 'round';
export type FrameId = BotanikId | 'ohne';
export type FontId = 'verspielt' | 'schrift' | 'klassisch' | 'schlicht' | 'kreide';

export const FRAMES: { id: FrameId; name: string }[] = [...BOTANIK, { id: 'ohne', name: 'Ohne' }];

export const FONTS: { id: FontId; name: string; family: string; weight: number; scale: number }[] = [
	{ id: 'verspielt', name: 'Verspielt', family: '"Kurale"', weight: 400, scale: 1 },
	{ id: 'schrift', name: 'Schreibschrift', family: '"Dancing Script"', weight: 700, scale: 1.08 },
	{ id: 'klassisch', name: 'Klassisch', family: '"Playfair Display"', weight: 700, scale: 1 },
	{ id: 'schlicht', name: 'Schlicht', family: '"Nunito"', weight: 600, scale: 1 },
	{ id: 'kreide', name: 'Kreide', family: '"Amatic SC"', weight: 700, scale: 1.25 }
];

export interface LabelDesign {
	lengthMm: number; // Breite des Entwurfs
	widthMm: number; // Höhe des Entwurfs
	shape: Shape;
	/** Rand, den der Druckkopf nicht erreicht oder der Etikettenträger verlangt (mm). */
	marginMm: number;
	frame: FrameId;
	font: FontId;
	text: string;
	extra: string;
}

export async function loadFonts() {
	await Promise.all(
		FONTS.map((f) => document.fonts.load(`${f.weight} 40px ${f.family}`, 'Mehl Ää').catch(() => []))
	);
}

// ---------- Rahmen ----------

/** Zeichnet den Rahmen und liefert den Innenabstand (mm) oder die Textfläche. */
function drawFrame(ctx: CanvasRenderingContext2D, d: LabelDesign, W: number, H: number): number | Box {
	if (d.frame === 'ohne' || !BOTANIK.some((b) => b.id === d.frame)) return d.marginMm + 1.5;
	return drawBotanik(ctx, d.frame as BotanikId, W, H, (d.marginMm + 0.4) * DPMM, d.shape === 'round', DPMM);
}

// ---------- Text ----------

function fitLines(ctx: CanvasRenderingContext2D, lines: string[], family: string, weight: number, maxW: number, maxH: number) {
	const lineGap = 1.04;
	let size = maxH / (lines.length * lineGap);
	ctx.font = `${weight} ${size}px ${family}`;
	const widest = Math.max(...lines.map((l) => ctx.measureText(l).width), 1);
	if (widest > maxW) size *= maxW / widest;
	return { size, lineGap };
}

function bestLayout(ctx: CanvasRenderingContext2D, text: string, family: string, weight: number, maxW: number, maxH: number) {
	const explicit = text.split(/\s*\/\s*|\n/).filter(Boolean);
	if (explicit.length > 1) return { lines: explicit, ...fitLines(ctx, explicit, family, weight, maxW, maxH) };
	const one = [text];
	let best = { lines: one, ...fitLines(ctx, one, family, weight, maxW, maxH) };
	const words = text.split(/\s+/);
	if (words.length > 1) {
		for (let k = 1; k < words.length; k++) {
			const two = [words.slice(0, k).join(' '), words.slice(k).join(' ')];
			const f = fitLines(ctx, two, family, weight, maxW, maxH);
			if (f.size > best.size * 1.12) best = { lines: two, ...f };
		}
	}
	return best;
}

export function renderCanvas(d: LabelDesign, canvas: HTMLCanvasElement): void {
	const W = Math.round(d.lengthMm * DPMM);
	const H = Math.round(d.widthMm * DPMM);
	canvas.width = W;
	canvas.height = H;
	const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
	ctx.fillStyle = '#fff';
	ctx.fillRect(0, 0, W, H);

	const fr = drawFrame(ctx, d, W, H);
	const inset = typeof fr === 'number' ? fr * DPMM : 0;
	let boxX = inset, boxY = inset, boxW = W - 2 * inset, boxH = H - 2 * inset;
	if (typeof fr !== 'number') {
		({ x: boxX, y: boxY, w: boxW, h: boxH } = fr);
	} else if (d.shape === 'round') {
		// größtes Rechteck im Kreis, etwas breiter als hoch
		const r = Math.min(W, H) / 2 - inset;
		boxW = r * 1.62;
		boxH = r * 1.15;
		boxX = W / 2 - boxW / 2;
		boxY = H / 2 - boxH / 2;
	}

	if (d.frame !== 'ohne') {
		// Text mit Luft zum Rahmen setzen, wie bei gekritzelten Etiketten üblich
		const nw = boxW * 0.86, nh = boxH * 0.78;
		boxX += (boxW - nw) / 2; boxY += (boxH - nh) / 2; boxW = nw; boxH = nh;
	}
	const font = FONTS.find((f) => f.id === d.font) ?? FONTS[0];
	const text = d.text.trim() || ' ';
	const extra = d.extra.trim();
	const extraH = extra ? Math.min(boxH * 0.24, 4.2 * DPMM) : 0;
	const mainH = (boxH - extraH * 1.15) * font.scale;

	ctx.fillStyle = '#000';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	const lay = bestLayout(ctx, text, font.family, font.weight, boxW, Math.min(mainH, boxH));
	// Kurze Wörter nicht aufblähen: höchstens ca. ein Viertel der Etikettenhöhe (wie handgemachte Etiketten)
	lay.size = Math.min(lay.size, Math.min(W, H) * 0.27 * font.scale);
	ctx.font = `${font.weight} ${lay.size}px ${font.family}`;
	const lh = lay.size * lay.lineGap;
	const blockH = lh * lay.lines.length + (extra ? extraH * 1.15 : 0);
	let y = H / 2 - blockH / 2 + lh / 2;
	for (const line of lay.lines) {
		ctx.fillText(line, W / 2, y);
		y += lh;
	}
	if (extra) {
		ctx.font = `600 ${extraH * 0.8}px "Nunito", sans-serif`;
		let s = extraH * 0.8;
		const w = ctx.measureText(extra).width;
		if (w > boxW) {
			s *= boxW / w;
			ctx.font = `600 ${s}px "Nunito", sans-serif`;
		}
		ctx.fillText(extra, W / 2, y - lh / 2 + extraH * 0.15 + extraH * 0.6);
	}

	// Außerhalb der Etikettenform nichts drucken
	if (d.shape === 'round') {
		ctx.globalCompositeOperation = 'destination-in';
		ctx.beginPath();
		ctx.arc(W / 2, H / 2, Math.min(W, H) / 2, 0, Math.PI * 2);
		ctx.fill();
		ctx.globalCompositeOperation = 'destination-over';
		ctx.fillStyle = '#fff';
		ctx.fillRect(0, 0, W, H);
		ctx.globalCompositeOperation = 'source-over';
	}
}

export function renderBitmap(d: LabelDesign, canvas = document.createElement('canvas')): Bitmap {
	renderCanvas(d, canvas);
	const ctx = canvas.getContext('2d')!;
	const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
	return rgbaToBitmap(img.data, canvas.width, canvas.height);
}

/** Zeichnet die Druckpunkte in ein sichtbares Canvas (so wie sie aufs Etikett kommen). */
export function paintDots(bmp: Bitmap, canvas: HTMLCanvasElement, ink: string, paper: string) {
	canvas.width = bmp.width;
	canvas.height = bmp.height;
	const ctx = canvas.getContext('2d')!;
	const img = ctx.createImageData(bmp.width, bmp.height);
	const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
	const [ir, ig, ib] = hex(ink);
	const [pr, pg, pb] = hex(paper);
	for (let i = 0; i < bmp.data.length; i++) {
		const on = bmp.data[i];
		img.data[i * 4] = on ? ir : pr;
		img.data[i * 4 + 1] = on ? ig : pg;
		img.data[i * 4 + 2] = on ? ib : pb;
		img.data[i * 4 + 3] = 255;
	}
	ctx.putImageData(img, 0, 0);
}
