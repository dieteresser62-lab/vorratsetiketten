// Zeichnet ein Dosenetikett (Rahmen + Inhalt) auf ein Canvas in Druckauflösung (8 Punkte/mm).
import { rgbaToBitmap } from './vendor/printer/bitmap';
import type { Bitmap } from './vendor/printer/types';

export const DPMM = 8;
export type Shape = 'rect' | 'rounded' | 'round';
export type FrameId = 'zierrahmen' | 'girlande' | 'bluemchen' | 'punkte' | 'doppelt' | 'ohne';
export type FontId = 'verspielt' | 'schrift' | 'klassisch' | 'schlicht' | 'kreide';

export const FRAMES: { id: FrameId; name: string }[] = [
	{ id: 'zierrahmen', name: 'Zierrahmen' },
	{ id: 'girlande', name: 'Ranke' },
	{ id: 'bluemchen', name: 'Blümchen' },
	{ id: 'punkte', name: 'Punkte' },
	{ id: 'doppelt', name: 'Doppellinie' },
	{ id: 'ohne', name: 'Ohne' }
];

export const FONTS: { id: FontId; name: string; family: string; weight: number; scale: number }[] = [
	{ id: 'verspielt', name: 'Verspielt', family: '"Kurale"', weight: 400, scale: 1 },
	{ id: 'schrift', name: 'Schreibschrift', family: '"Dancing Script"', weight: 700, scale: 1.08 },
	{ id: 'klassisch', name: 'Klassisch', family: '"Playfair Display"', weight: 700, scale: 1 },
	{ id: 'schlicht', name: 'Schlicht', family: '"Nunito"', weight: 800, scale: 1 },
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

// ---------- Umrisspfad (Rechteck, abgerundet oder Kreis) mit Abtastung ----------

interface Outline {
	length: number;
	at(s: number): { x: number; y: number; nx: number; ny: number }; // Punkt + Normale nach innen
	/** Bogenlänge der Eckmitten (leer beim Kreis). */
	cornerS: number[];
}

function roundedRectOutline(x: number, y: number, w: number, h: number, r: number): Outline {
	r = Math.min(r, w / 2, h / 2);
	const seg = [w - 2 * r, (Math.PI * r) / 2, h - 2 * r, (Math.PI * r) / 2, w - 2 * r, (Math.PI * r) / 2, h - 2 * r, (Math.PI * r) / 2];
	const length = seg.reduce((a, b) => a + b, 0);
	const arc = (cx: number, cy: number, a0: number, t: number) => {
		const a = a0 + (t * Math.PI) / 2;
		return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, nx: -Math.cos(a), ny: -Math.sin(a) };
	};
	return {
		length,
		cornerS: [1, 3, 5, 7].map((i) => seg.slice(0, i).reduce((a, b) => a + b, 0) + seg[i] / 2),
		at(s) {
			s = ((s % length) + length) % length;
			let i = 0;
			while (i < 7 && s > seg[i]) s -= seg[i++];
			const t = seg[i] ? s / seg[i] : 0;
			switch (i) {
				case 0: return { x: x + r + s, y, nx: 0, ny: 1 };
				case 1: return arc(x + w - r, y + r, -Math.PI / 2, t);
				case 2: return { x: x + w, y: y + r + s, nx: -1, ny: 0 };
				case 3: return arc(x + w - r, y + h - r, 0, t);
				case 4: return { x: x + w - r - s, y: y + h, nx: 0, ny: -1 };
				case 5: return arc(x + r, y + h - r, Math.PI / 2, t);
				case 6: return { x, y: y + h - r - s, nx: 1, ny: 0 };
				default: return arc(x + r, y + r, Math.PI, t);
			}
		}
	};
}

function circleOutline(cx: number, cy: number, r: number): Outline {
	const length = 2 * Math.PI * r;
	return {
		length,
		cornerS: [],
		at(s) {
			const a = s / r - Math.PI / 2;
			return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, nx: -Math.cos(a), ny: -Math.sin(a) };
		}
	};
}

function outlineFor(d: LabelDesign, W: number, H: number, insetMm: number): Outline {
	const i = insetMm * DPMM;
	if (d.shape === 'round') return circleOutline(W / 2, H / 2, Math.min(W, H) / 2 - i);
	const r = d.shape === 'rounded' ? 4 * DPMM : 2.2 * DPMM;
	return roundedRectOutline(i, i, W - 2 * i, H - 2 * i, r);
}

function strokeOutline(ctx: CanvasRenderingContext2D, o: Outline, step = 2) {
	ctx.beginPath();
	for (let s = 0; s <= o.length + step; s += step) {
		const p = o.at(s);
		if (s === 0) ctx.moveTo(p.x, p.y);
		else ctx.lineTo(p.x, p.y);
	}
	ctx.closePath();
	ctx.stroke();
}

// ---------- Ornamente ----------

function leaf(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, len: number) {
	ctx.save();
	ctx.translate(x, y);
	ctx.rotate(angle);
	ctx.beginPath();
	ctx.moveTo(0, 0);
	ctx.quadraticCurveTo(len * 0.5, -len * 0.42, len, 0);
	ctx.quadraticCurveTo(len * 0.5, len * 0.42, 0, 0);
	ctx.fill();
	ctx.restore();
}

function flower(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, petals = 5, rot = 0) {
	ctx.save();
	ctx.translate(x, y);
	ctx.rotate(rot);
	for (let k = 0; k < petals; k++) {
		const a = (k / petals) * Math.PI * 2;
		ctx.beginPath();
		ctx.ellipse(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55, r * 0.5, r * 0.32, a, 0, Math.PI * 2);
		ctx.fill();
	}
	ctx.fillStyle = '#fff';
	ctx.beginPath();
	ctx.arc(0, 0, r * 0.26, 0, Math.PI * 2);
	ctx.fill();
	ctx.restore();
}

/** Zeichnet den Rahmen und liefert den Innenabstand (mm), den der Text freihalten soll. */
type Box = { x: number; y: number; w: number; h: number };

function drawFrame(ctx: CanvasRenderingContext2D, d: LabelDesign, W: number, H: number): number | Box {
	const m = d.marginMm;
	ctx.fillStyle = '#000';
	ctx.strokeStyle = '#000';
	ctx.lineCap = 'round';
	ctx.lineJoin = 'round';

	switch (d.frame) {
		case 'ohne':
			return m + 1.5;

		case 'zierrahmen':
			return drawCartouche(ctx, d, W, H);

		case 'doppelt': {
			ctx.lineWidth = 0.55 * DPMM;
			strokeOutline(ctx, outlineFor(d, W, H, m + 0.6));
			ctx.lineWidth = 0.25 * DPMM;
			strokeOutline(ctx, outlineFor(d, W, H, m + 1.7));
			return m + 3.2;
		}

		case 'punkte': {
			const o = outlineFor(d, W, H, m + 1);
			const gap = 1.6 * DPMM;
			const n = Math.max(8, Math.round(o.length / gap));
			for (let k = 0; k < n; k++) {
				const p = o.at((k / n) * o.length);
				ctx.beginPath();
				ctx.arc(p.x, p.y, 0.45 * DPMM, 0, Math.PI * 2);
				ctx.fill();
			}
			ctx.lineWidth = 0.2 * DPMM;
			strokeOutline(ctx, outlineFor(d, W, H, m + 2.2));
			return m + 3.6;
		}

		case 'bluemchen': {
			const o = outlineFor(d, W, H, m + 1.5);
			const spacing = 4.2 * DPMM;
			const n = Math.max(6, Math.round(o.length / spacing));
			for (let k = 0; k < n; k++) {
				const p = o.at((k / n) * o.length);
				if (k % 2 === 0) {
					flower(ctx, p.x, p.y, 1.35 * DPMM, 5, k * 0.7);
				} else {
					ctx.beginPath();
					ctx.arc(p.x, p.y, 0.4 * DPMM, 0, Math.PI * 2);
					ctx.fill();
				}
			}
			return m + 3.6;
		}

		case 'girlande':
		default: {
			// Ranke: leicht wellige Linie entlang des Rahmens, Blätter abwechselnd innen/außen,
			// kleine Blüten in den Ecken (bzw. oben und unten bei runden Etiketten).
			const o = outlineFor(d, W, H, m + 1.9);
			const wave = 0.45 * DPMM;
			const period = 6 * DPMM;
			const n = Math.max(6, Math.round(o.length / period));
			const per = o.length / n;
			const pt = (s: number) => {
				const p = o.at(s);
				const off = Math.sin((s / per) * Math.PI * 2) * wave;
				return { x: p.x + p.nx * off, y: p.y + p.ny * off, nx: p.nx, ny: p.ny };
			};
			ctx.lineWidth = 0.3 * DPMM;
			ctx.beginPath();
			for (let s = 0; s <= o.length + 2; s += 2) {
				const p = pt(s);
				if (s === 0) ctx.moveTo(p.x, p.y);
				else ctx.lineTo(p.x, p.y);
			}
			ctx.closePath();
			ctx.stroke();

			const blossoms =
				d.shape === 'round'
					? [0, o.length / 2]
					: o.cornerS;
			const nearBlossom = (s: number) =>
				blossoms.some((b) => {
					const dist = Math.abs(((s - b + o.length * 1.5) % o.length) - o.length / 2);
					return dist < 2.4 * DPMM;
				});

			const leafLen = 1.9 * DPMM;
			const leaves = n * 2;
			for (let k = 0; k < leaves; k++) {
				const s = (k + 0.5) * (o.length / leaves);
				if (nearBlossom(s)) continue;
				const p = pt(s);
				const a = o.at(s + 1);
				const b = o.at(s - 1);
				const tangent = Math.atan2(a.y - b.y, a.x - b.x);
				// Blatt zeigt schräg nach vorn, abwechselnd zur Innen- und Außenseite der Ranke
				const toInside = Math.cos(tangent) * p.ny - Math.sin(tangent) * p.nx > 0 ? 1 : -1;
				const side = k % 2 === 0 ? 1 : -1;
				leaf(ctx, p.x, p.y, tangent + toInside * side * 0.7, leafLen);
			}
			for (const s of blossoms) {
				const p = o.at(s);
				ctx.fillStyle = '#000';
				flower(ctx, p.x, p.y, 1.6 * DPMM, 5, 0.3);
				ctx.fillStyle = '#000';
			}
			return m + 4.1;
		}
	}
}


// ---------- Zierrahmen (Kartusche mit Schnörkeln) ----------

/**
 * Symmetrische Kartusche: Spitzen oben, unten und an den Seiten, eingezogene Ecken, Schnörkel.
 * Gezeichnet wird ein Viertel in normierten Koordinaten (-1..1), dann viermal gespiegelt.
 */
function drawCartouche(ctx: CanvasRenderingContext2D, d: LabelDesign, W: number, H: number): Box {
	const m = (d.marginMm + 0.6) * DPMM;
	const cx = W / 2, cy = H / 2;
	let hw = W / 2 - m, hh = H / 2 - m;
	if (d.shape === 'round') {
		const r = Math.min(W, H) / 2 - m;
		hw = r * 0.86;
		hh = r * 0.86;
	}
	const line = Math.max(2.8, 0.42 * DPMM);

	ctx.save();
	ctx.lineWidth = line;
	for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
		ctx.save();
		ctx.translate(cx, cy);
		ctx.scale(sx * hw, sy * hh);
		// Linienbreite gegen die Skalierung ausgleichen
		const lw = line / Math.min(hw, hh);
		ctx.lineWidth = lw;

		// Hauptlinie: von der oberen Spitze zur seitlichen Spitze
		ctx.beginPath();
		ctx.moveTo(0, -1);
		ctx.bezierCurveTo(0.07, -0.99, 0.12, -0.78, 0.3, -0.78);
		ctx.lineTo(0.6, -0.78);
		ctx.bezierCurveTo(0.74, -0.78, 0.7, -0.6, 0.86, -0.6);
		ctx.lineTo(0.86, -0.28);
		ctx.bezierCurveTo(0.86, -0.1, 0.99, -0.07, 1, 0);
		ctx.stroke();

		// Schnörkel (Spiralen mit Stiel), dünner als die Hauptlinie
		ctx.lineWidth = lw * 0.82;
		// Stiel setzt jeweils an der Hauptlinie an
		spiral(ctx, [0.36, -0.78], 0.46, -0.9, 0.07, 0.06, Math.PI * 0.5, -1);
		spiral(ctx, [0.62, -0.78], 0.73, -0.9, 0.065, 0.065, Math.PI * 0.75, 1);
		spiral(ctx, [0.86, -0.5], 0.95, -0.66, 0.055, 0.07, Math.PI * 0.95, 1);
		spiral(ctx, [0.88, -0.14], 0.95, -0.27, 0.05, 0.07, Math.PI * 0.8, -1);
		ctx.restore();
	}
	ctx.restore();

	// Freier Innenraum für den Text
	const bw = hw * 2 * 0.76, bh = hh * 2 * 0.64;
	return { x: cx - bw / 2, y: cy - bh / 2, w: bw, h: bh };
}

/** Kleine Spirale um (x,y) mit Radien rx/ry, beginnt bei Winkel a0, Drehsinn dir. */
function spiral(ctx: CanvasRenderingContext2D, anchor: [number, number], x: number, y: number, rx: number, ry: number, a0: number, dir: number) {
	const turns = 1.15;
	const steps = 60;
	ctx.beginPath();
	let ex = 0, ey = 0;
	// geschwungener Stiel von der Hauptlinie zum Spiralanfang
	const sx = x + Math.cos(a0) * rx, sy = y + Math.sin(a0) * ry;
	ctx.moveTo(anchor[0], anchor[1]);
	ctx.quadraticCurveTo(anchor[0] + (sx - anchor[0]) * 0.1, sy, sx, sy);
	for (let k = 0; k <= steps; k++) {
		const t = k / steps;
		const a = a0 + dir * t * turns * Math.PI * 2;
		const f = 1 - 0.78 * t;
		ex = x + Math.cos(a) * rx * f;
		ey = y + Math.sin(a) * ry * f;
		ctx.lineTo(ex, ey);
	}
	ctx.stroke();
	// kleiner Tropfen am Ende
	ctx.beginPath();
	ctx.ellipse(ex, ey, rx * 0.22, ry * 0.22, 0, 0, Math.PI * 2);
	ctx.fill();
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

	const font = FONTS.find((f) => f.id === d.font) ?? FONTS[0];
	const text = d.text.trim() || ' ';
	const extra = d.extra.trim();
	const extraH = extra ? Math.min(boxH * 0.24, 4.2 * DPMM) : 0;
	const mainH = (boxH - extraH * 1.15) * font.scale;

	ctx.fillStyle = '#000';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	const lay = bestLayout(ctx, text, font.family, font.weight, boxW, Math.min(mainH, boxH));
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
