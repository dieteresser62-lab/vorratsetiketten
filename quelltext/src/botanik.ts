// Handgezeichnet wirkende Botanik-Rahmen (Blätter, Zweige, Beeren, Sternchen) im Stil von Kritzel-Etiketten.
// Alle Maße in "S" = 1 mm, skaliert auf die Etikettenhöhe (Grundentwurf: 30 mm hohes Etikett).

type P = { x: number; y: number };
type Pt = { x: number; y: number; a: number }; // Punkt + Richtung
type Path = (t: number) => Pt;
type Ctx = CanvasRenderingContext2D;
export type Box = { x: number; y: number; w: number; h: number };

export type LeafKind = 'vein' | 'outline' | 'fill' | 'round' | 'berry' | 'bud';

const TAU = Math.PI * 2;

// ---------- Pfade ----------

function quad(p0: P, c: P, p1: P): Path {
	return (t) => {
		const u = 1 - t;
		return {
			x: u * u * p0.x + 2 * u * t * c.x + t * t * p1.x,
			y: u * u * p0.y + 2 * u * t * c.y + t * t * p1.y,
			a: Math.atan2(2 * u * (c.y - p0.y) + 2 * t * (p1.y - c.y), 2 * u * (c.x - p0.x) + 2 * t * (p1.x - c.x))
		};
	};
}

/** Leicht gebogene Linie von p0 nach p1; bend > 0 biegt nach links (in Laufrichtung gesehen). */
function bent(p0: P, p1: P, bend: number): Path {
	const dx = p1.x - p0.x, dy = p1.y - p0.y;
	const l = Math.hypot(dx, dy) || 1;
	return quad(p0, { x: (p0.x + p1.x) / 2 + (dy / l) * bend, y: (p0.y + p1.y) / 2 - (dx / l) * bend }, p1);
}

function arc(cx: number, cy: number, r: number, a0: number, a1: number): Path {
	const dir = a1 > a0 ? 1 : -1;
	return (t) => {
		const a = a0 + (a1 - a0) * t;
		return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, a: a + (dir * Math.PI) / 2 };
	};
}

function pathLength(p: Path) {
	let l = 0, prev = p(0);
	for (let i = 1; i <= 24; i++) {
		const q = p(i / 24);
		l += Math.hypot(q.x - prev.x, q.y - prev.y);
		prev = q;
	}
	return l;
}

// ---------- Grundformen ----------

function dot(ctx: Ctx, x: number, y: number, r: number) {
	ctx.beginPath();
	ctx.arc(x, y, r, 0, TAU);
	ctx.fill();
}

function star(ctx: Ctx, x: number, y: number, r: number, rot = -Math.PI / 2) {
	ctx.beginPath();
	for (let i = 0; i < 10; i++) {
		const rr = i % 2 ? r * 0.45 : r;
		const a = rot + (i * Math.PI) / 5;
		ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
	}
	ctx.closePath();
	ctx.fill();
}

/** Blüte mit umrandeten Blütenblättern. */
function blossom(ctx: Ctx, x: number, y: number, r: number, rot = 0, petals = 5) {
	ctx.save();
	ctx.translate(x, y);
	ctx.rotate(rot);
	for (let k = 0; k < petals; k++) {
		const a = (k / petals) * TAU;
		ctx.beginPath();
		ctx.ellipse(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55, r * 0.48, r * 0.3, a, 0, TAU);
		ctx.fillStyle = '#fff';
		ctx.fill();
		ctx.stroke();
	}
	ctx.fillStyle = '#000';
	dot(ctx, 0, 0, r * 0.24);
	ctx.restore();
}

/** Kleine gefüllte Blüte (Vergissmeinnicht). */
function floret(ctx: Ctx, x: number, y: number, r: number, rot = 0) {
	for (let k = 0; k < 5; k++) {
		const a = rot + (k / 5) * TAU;
		dot(ctx, x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.42);
	}
	ctx.fillStyle = '#fff';
	dot(ctx, x, y, r * 0.2);
	ctx.fillStyle = '#000';
}

/** Blatt mit Basis im Ursprung, zeigt in Richtung +x. wid = ungefähre volle Breite. */
function leafAt(ctx: Ctx, x: number, y: number, angle: number, kind: LeafKind, len: number, wid = len * 0.55) {
	ctx.save();
	ctx.translate(x, y);
	ctx.rotate(angle);
	const c = wid; // Kontrollpunkt-Abstand ≈ doppelte halbe Breite
	switch (kind) {
		case 'berry':
			ctx.beginPath();
			ctx.moveTo(0, 0);
			ctx.lineTo(len * 0.62, 0);
			ctx.stroke();
			dot(ctx, len * 0.62 + len * 0.2, 0, len * 0.23);
			break;
		case 'round': {
			const rr = len * 0.36;
			ctx.beginPath();
			ctx.moveTo(0, 0);
			ctx.lineTo(len - 2 * rr, 0);
			ctx.stroke();
			ctx.beginPath();
			ctx.ellipse(len - rr, 0, rr, rr * 0.86, 0, 0, TAU);
			ctx.fillStyle = '#fff';
			ctx.fill();
			ctx.stroke();
			ctx.beginPath();
			ctx.moveTo(len - 2 * rr, 0);
			ctx.lineTo(len - rr * 0.5, 0);
			ctx.stroke();
			break;
		}
		case 'fill':
		case 'bud':
			ctx.beginPath();
			ctx.moveTo(0, 0);
			ctx.quadraticCurveTo(len * 0.4, -c, len, 0);
			ctx.quadraticCurveTo(len * 0.4, c, 0, 0);
			ctx.fill();
			break;
		default: {
			ctx.beginPath();
			ctx.moveTo(0, 0);
			ctx.quadraticCurveTo(len * 0.4, -c, len, 0);
			ctx.quadraticCurveTo(len * 0.4, c, 0, 0);
			ctx.fillStyle = '#fff';
			ctx.fill();
			ctx.stroke();
			ctx.beginPath();
			ctx.moveTo(0, 0);
			ctx.quadraticCurveTo(len * 0.5, -c * 0.06, len * 0.88, 0);
			if (kind === 'vein') {
				const n = Math.max(3, Math.round(len / (wid * 0.55)));
				for (let k = 1; k <= n; k++) {
					const t = k / (n + 1);
					const half = Math.sin(Math.PI * Math.pow(t, 0.8)) * c * 0.42;
					for (const s of [-1, 1]) {
						ctx.moveTo(len * t * 0.9, 0);
						ctx.quadraticCurveTo(len * (t * 0.9 + 0.06), s * half * 0.6, len * (t * 0.9 + 0.13), s * half * 0.92);
					}
				}
			}
			ctx.stroke();
		}
	}
	ctx.restore();
}

interface SprigOpts {
	kind: LeafKind;
	/** Blattabstand entlang des Stiels */
	every: number;
	len: number;
	wid?: number;
	spread?: number;
	paired?: boolean;
	tip?: boolean;
	taper?: number;
	from?: number;
	to?: number;
}

/** Zweig: Stiel entlang path, Blätter abwechselnd oder paarweise, optional Endblatt. */
function sprig(ctx: Ctx, path: Path, o: SprigOpts) {
	const { kind, len, spread = 0.75, paired = false, tip = true, taper = 0.35, from = 0.12, to = 0.92 } = o;
	const wid = o.wid ?? len * 0.55;
	ctx.beginPath();
	for (let i = 0; i <= 30; i++) {
		const p = path(i / 30);
		i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y);
	}
	ctx.stroke();
	const L = pathLength(path) * (to - from);
	const n = Math.max(1, Math.round(L / o.every));
	for (let i = 0; i < n; i++) {
		const t = from + ((to - from) * (i + 0.5)) / n;
		const p = path(t);
		const f = 1 - taper * t;
		const sides = paired ? [1, -1] : [i % 2 ? -1 : 1];
		for (const s of sides) leafAt(ctx, p.x, p.y, p.a + s * spread, kind, len * f, wid * f);
	}
	if (tip) {
		const p = path(1);
		const f = 1 - taper * 0.8;
		if (kind === 'berry') leafAt(ctx, p.x, p.y, p.a, 'berry', len * f);
		else leafAt(ctx, p.x, p.y, p.a, kind === 'round' ? 'round' : kind, len * f, wid * f);
	}
}

/** Kleine Schmuckelemente gleichmäßig zwischen a und b verteilen. */
type Item = (x: number, y: number, a: number, i: number) => void;
function scatter(a: P, b: P, spacing: number, items: Item[]) {
	const l = Math.hypot(b.x - a.x, b.y - a.y);
	const n = Math.floor(l / spacing);
	if (n < 1) return;
	const ang = Math.atan2(b.y - a.y, b.x - a.x);
	for (let i = 0; i < n; i++) {
		const t = (i + 0.5) / n;
		items[i % items.length](a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, ang, i);
	}
}

// ---------- Rahmen ----------

export type BotanikId = 'wiese' | 'eukalyptus' | 'lorbeer' | 'wildblumen' | 'beeren' | 'farn';

export const BOTANIK: { id: BotanikId; name: string }[] = [
	{ id: 'wiese', name: 'Blätterwiese' },
	{ id: 'eukalyptus', name: 'Eukalyptus' },
	{ id: 'lorbeer', name: 'Lorbeer' },
	{ id: 'wildblumen', name: 'Wildblumen' },
	{ id: 'beeren', name: 'Beerenzweig' },
	{ id: 'farn', name: 'Farn & Sterne' }
];

interface G { x0: number; y0: number; x1: number; y1: number; w: number; h: number; S: number; W: number; H: number }

function box(g: G, sx: number, sy: number, sy2 = sy): Box {
	const x = g.x0 + sx * g.S, y = g.y0 + sy * g.S;
	return { x, y, w: Math.max(g.w * 0.4, g.x1 - sx * g.S - x), h: Math.max(g.h * 0.35, g.y1 - sy2 * g.S - y) };
}

/** Rechteckige (oder abgerundete) Etiketten. */
function rectFrame(ctx: Ctx, id: BotanikId, g: G): Box {
	const { x0, y0, x1, y1, w, h, S } = g;
	const stars: Item = (x, y, _a, i) => star(ctx, x, y, (i % 3 === 1 ? 0.75 : 0.55) * S, -Math.PI / 2 + i);
	const dots: Item = (x, y, _a, i) => dot(ctx, x, y, (i % 2 ? 0.28 : 0.38) * S);

	switch (id) {
		case 'wiese': {
			// wie das Vorbild: große Aderblätter oben rechts und unten links, Zweige an den Seiten, Kleinkram dazwischen
			sprig(ctx, bent({ x: x0 + 2.6 * S, y: y1 - 7 * S }, { x: x0 + 2.2 * S, y: y0 + 4.2 * S }, -0.8 * S),
				{ kind: 'outline', every: 1.5 * S, len: 2.9 * S, wid: 2.4 * S, spread: 0.8, tip: false, from: 0.05, to: 0.95, taper: 0.25 });
			blossom(ctx, x0 + 2.1 * S, y0 + 2.3 * S, 1.35 * S, 0.3);
			dot(ctx, x0 + 4.3 * S, y0 + 1.4 * S, 0.35 * S);

			leafAt(ctx, x1 - 9.6 * S, y0 + 2.7 * S, -0.1, 'vein', 6.6 * S, 4.2 * S);
			leafAt(ctx, x1 - 2.6 * S, y0 + 10 * S, -Math.PI / 2 + 0.1, 'vein', 6.4 * S, 4 * S);
			dot(ctx, x1 - 4.6 * S, y0 + 5.4 * S, 0.38 * S);
			star(ctx, x1 - 4.4 * S, y0 + 7.3 * S, 0.65 * S, 0.2);

			const fernTop = y0 + 12 * S, fernBot = y1 - 3.2 * S;
			if (fernBot - fernTop > 3 * S)
				sprig(ctx, bent({ x: x1 - 2.2 * S, y: fernBot }, { x: x1 - 2.6 * S, y: fernTop }, 0.7 * S),
					{ kind: 'fill', every: 1.5 * S, len: 2.1 * S, wid: 1.5 * S, spread: 0.85, taper: 0.4 });
			floret(ctx, x1 - 4.4 * S, y1 - 1.9 * S, 1 * S);
			sprig(ctx, bent({ x: x1 - 6 * S, y: y1 - 1.7 * S }, { x: x1 - 10.5 * S, y: y1 - 2.6 * S }, 0.6 * S),
				{ kind: 'berry', every: 1.4 * S, len: 1.4 * S, spread: 0.9 });

			leafAt(ctx, x0 + 1.4 * S, y1 - 1.4 * S, -1.05, 'vein', 6 * S, 3.6 * S);
			leafAt(ctx, x0 + 1.6 * S, y1 - 1.3 * S, -0.22, 'vein', 6.8 * S, 3.7 * S);

			scatter({ x: x0 + 5.6 * S, y: y0 + 1.9 * S }, { x: x1 - 10.5 * S, y: y0 + 1.9 * S }, 4.2 * S, [
				(x, y) => sprig(ctx, bent({ x: x - 1.8 * S, y: y + 0.4 * S }, { x: x + 1.8 * S, y: y - 0.2 * S }, 0.5 * S),
					{ kind: 'berry', every: 1.1 * S, len: 1.15 * S, spread: 0.95 }),
				(x, y, a, i) => stars(x, y, a, i + 1),
				(x, y) => { dot(ctx, x - 0.8 * S, y + 0.3 * S, 0.3 * S); dot(ctx, x + 0.7 * S, y - 0.3 * S, 0.38 * S); }
			]);
			scatter({ x: x0 + 9.5 * S, y: y1 - 1.9 * S }, { x: x1 - 11 * S, y: y1 - 1.9 * S }, 3.8 * S, [
				(x, y, a, i) => stars(x, y, a, i + 1),
				(x, y) => floret(ctx, x, y, 0.9 * S, 0.4),
				(x, y) => dot(ctx, x, y + 0.3 * S, 0.35 * S),
				(x, y) => sprig(ctx, bent({ x: x - 1.6 * S, y: y + 0.6 * S }, { x: x + 1.6 * S, y: y - 0.5 * S }, -0.4 * S),
					{ kind: 'fill', every: 1 * S, len: 1.2 * S, wid: 0.8 * S, spread: 0.9, tip: true })
			]);
			return box(g, 6.2, 5, 4.8);
		}

		case 'eukalyptus': {
			const o = { kind: 'round' as const, every: 1.9 * S, len: 2.5 * S, spread: 1.0, taper: 0.3, from: 0.08 };
			const tl = { x: x0 + 1.6 * S, y: y0 + 1.6 * S }, br = { x: x1 - 1.6 * S, y: y1 - 1.6 * S };
			const off = 2.4 * S;
			sprig(ctx, bent({ x: tl.x + off, y: tl.y }, { x: x0 + w * 0.6, y: y0 + 1.6 * S }, -1.1 * S), o);
			sprig(ctx, bent({ x: tl.x, y: tl.y + off }, { x: x0 + 1.6 * S, y: y0 + h * 0.72 }, 1.1 * S), o);
			sprig(ctx, bent({ x: br.x - off, y: br.y }, { x: x1 - w * 0.6, y: y1 - 1.6 * S }, -1.1 * S), o);
			sprig(ctx, bent({ x: br.x, y: br.y - off }, { x: x1 - 1.6 * S, y: y1 - h * 0.72 }, 1.1 * S), o);
			blossom(ctx, tl.x + 0.3 * S, tl.y + 0.3 * S, 1.5 * S, 0.3);
			blossom(ctx, br.x - 0.3 * S, br.y - 0.3 * S, 1.5 * S, 0.9);
			for (const [cx, cy, sx, sy] of [[x1, y0, -1, 1], [x0, y1, 1, -1]]) {
				star(ctx, cx + sx * 2.2 * S, cy + sy * 2.2 * S, 0.85 * S);
				dot(ctx, cx + sx * 4.2 * S, cy + sy * 1.4 * S, 0.35 * S);
				dot(ctx, cx + sx * 1.4 * S, cy + sy * 4.2 * S, 0.35 * S);
				star(ctx, cx + sx * 5.6 * S, cy + sy * 2.6 * S, 0.5 * S, 0.4);
				dot(ctx, cx + sx * 2.6 * S, cy + sy * 5.8 * S, 0.25 * S);
			}
			return box(g, 5.4, 4.8);
		}

		case 'lorbeer': {
			const o = { kind: 'fill' as const, every: 2.1 * S, len: 2.7 * S, wid: 1.25 * S, spread: 0.55, paired: true, taper: 0.35, from: 0.06, to: 0.94 };
			const cx = (x0 + x1) / 2;
			sprig(ctx, quad({ x: cx - 3 * S, y: y1 - 1.6 * S }, { x: x0 + 1.4 * S, y: y1 - 1.4 * S }, { x: x0 + 1.9 * S, y: y0 + 3.5 * S }), o);
			sprig(ctx, quad({ x: cx + 3 * S, y: y1 - 1.6 * S }, { x: x1 - 1.4 * S, y: y1 - 1.4 * S }, { x: x1 - 1.9 * S, y: y0 + 3.5 * S }), o);
			blossom(ctx, cx, y1 - 1.8 * S, 1.2 * S, -Math.PI / 2);
			star(ctx, cx, y0 + 1.9 * S, 0.9 * S);
			scatter({ x: x0 + 6 * S, y: y0 + 1.9 * S }, { x: cx - 2.5 * S, y: y0 + 1.9 * S }, 3.2 * S, [dots, stars]);
			scatter({ x: x1 - 6 * S, y: y0 + 1.9 * S }, { x: cx + 2.5 * S, y: y0 + 1.9 * S }, 3.2 * S, [dots, stars]);
			return box(g, 5.6, 4.2, 4.6);
		}

		case 'wildblumen': {
			for (const sx of [1, -1]) {
				const bx = sx > 0 ? x0 : x1;
				const X = (v: number) => bx + sx * v * S;
				const tall = Math.min(h - 3 * S, Math.max(h * 0.62, 9 * S));
				// hohe Blume an der Seite
				sprig(ctx, bent({ x: X(2.4), y: y1 - 0.8 * S }, { x: X(2.2), y: y1 - tall }, sx * 0.7 * S),
					{ kind: 'outline', every: 2.6 * S, len: 2.6 * S, wid: 1.7 * S, spread: 0.6, tip: false, from: 0.12, to: 0.62 });
				blossom(ctx, X(2.2), y1 - tall - 1.2 * S, 1.6 * S, 0.2 * sx);
				// mittlere Blume schräg nach innen
				sprig(ctx, bent({ x: X(2.8), y: y1 - 0.8 * S }, { x: X(5.4), y: y1 - tall * 0.5 }, -sx * 0.7 * S),
					{ kind: 'outline', every: 2 * S, len: 1.7 * S, wid: 1.1 * S, spread: 0.6, tip: false, from: 0.3, to: 0.6 });
				blossom(ctx, X(5.6), y1 - tall * 0.5 - 1 * S, 1.15 * S, 0.5);
				// Knospenrispe
				sprig(ctx, bent({ x: X(3), y: y1 - 0.8 * S }, { x: X(0.9), y: y1 - tall * 0.45 }, sx * 0.4 * S),
					{ kind: 'bud', every: 1.1 * S, len: 1.2 * S, wid: 0.9 * S, spread: 0.7, from: 0.4, to: 0.95 });
				// Gras/Blattzweig am Boden entlang
				sprig(ctx, bent({ x: X(3), y: y1 - 0.9 * S }, { x: X(Math.min((w / S) * 0.36, 15)), y: y1 - 1.5 * S }, sx * 0.6 * S),
					{ kind: 'outline', every: 2 * S, len: 2.1 * S, wid: 1.5 * S, spread: 0.6, from: 0.2 });
				floret(ctx, X(7.4), y1 - 3.4 * S, 0.9 * S);
				dot(ctx, X(8.8), y1 - 5.2 * S, 0.33 * S);
			}
			scatter({ x: x0 + 1 * S, y: y0 + 1.8 * S }, { x: x1 - 1 * S, y: y0 + 1.8 * S }, 3 * S, [
				stars, dots, (x, y) => floret(ctx, x, y, 0.75 * S), dots
			]);
			scatter({ x: x0 + 17 * S, y: y1 - 1.6 * S }, { x: x1 - 17 * S, y: y1 - 1.6 * S }, 3 * S, [dots, stars]);
			return box(g, 7.2, 4.2, 5);
		}

		case 'beeren': {
			const o = { kind: 'berry' as const, every: 1.35 * S, len: 2 * S, spread: 0.8, taper: 0.2, from: 0.15 };
			const corners: [number, number, number, number][] = [[x0, y0, 1, 1], [x1, y0, -1, 1], [x1, y1, -1, -1], [x0, y1, 1, -1]];
			for (const [cx, cy, sx, sy] of corners) {
				const c = { x: cx + sx * 1.7 * S, y: cy + sy * 1.7 * S };
				const bendSign = sx * sy;
				sprig(ctx, bent(c, { x: cx + sx * w * 0.4, y: cy + sy * 1.5 * S }, -bendSign * 0.8 * S), o);
				sprig(ctx, bent(c, { x: cx + sx * 1.5 * S, y: cy + sy * h * 0.42 }, bendSign * 0.8 * S), o);
				leafAt(ctx, c.x, c.y, Math.atan2(-sy, -sx) + 0.45, 'fill', 1.7 * S, 1.1 * S);
				leafAt(ctx, c.x, c.y, Math.atan2(-sy, -sx) - 0.45, 'fill', 1.7 * S, 1.1 * S);
			}
			star(ctx, (x0 + x1) / 2, y0 + 1.7 * S, 0.8 * S);
			star(ctx, (x0 + x1) / 2, y1 - 1.7 * S, 0.8 * S, 0.3);
			dot(ctx, x0 + 1.7 * S, (y0 + y1) / 2, 0.4 * S);
			dot(ctx, x1 - 1.7 * S, (y0 + y1) / 2, 0.4 * S);
			return box(g, 5, 4.4);
		}

		case 'farn':
		default: {
			const o = { kind: 'fill' as const, every: 1.15 * S, len: 2.1 * S, wid: 1.3 * S, spread: 0.95, taper: 0.55, from: 0.06 };
			const tl = { x: x0 + 1.4 * S, y: y0 + 1.4 * S }, br = { x: x1 - 1.4 * S, y: y1 - 1.4 * S };
			sprig(ctx, bent(tl, { x: x0 + w * 0.5, y: y0 + 2 * S }, -1 * S), o);
			sprig(ctx, bent(tl, { x: x0 + 2 * S, y: y0 + h * 0.62 }, 1 * S), o);
			sprig(ctx, bent(br, { x: x1 - w * 0.5, y: y1 - 2 * S }, -1 * S), o);
			sprig(ctx, bent(br, { x: x1 - 2 * S, y: y1 - h * 0.62 }, 1 * S), o);
			leafAt(ctx, tl.x, tl.y, Math.PI / 4, 'vein', 4.4 * S, 2.8 * S);
			leafAt(ctx, br.x, br.y, Math.PI * 1.25, 'vein', 4.4 * S, 2.8 * S);
			for (const [cx, cy, sx, sy] of [[x1, y0, -1, 1], [x0, y1, 1, -1]]) {
				star(ctx, cx + sx * 2.4 * S, cy + sy * 2.4 * S, 1.05 * S, 0.1);
				star(ctx, cx + sx * 5.2 * S, cy + sy * 1.5 * S, 0.55 * S, 0.5);
				star(ctx, cx + sx * 1.5 * S, cy + sy * 5.2 * S, 0.55 * S, 0.9);
				dot(ctx, cx + sx * 4.6 * S, cy + sy * 4 * S, 0.35 * S);
				dot(ctx, cx + sx * 7.6 * S, cy + sy * 1.8 * S, 0.28 * S);
				dot(ctx, cx + sx * 1.8 * S, cy + sy * 7.6 * S, 0.28 * S);
			}
			return box(g, 5.6, 4.6);
		}
	}
}

/** Runde Etiketten: Kranz aus dem Zweig des jeweiligen Rahmens. */
function roundFrame(ctx: Ctx, id: BotanikId, g: G): Box {
	const { S, W, H } = g;
	const cx = W / 2, cy = H / 2;
	const R = Math.min(g.w, g.h) / 2 - 2 * S;
	const deg = Math.PI / 180;
	const kinds: Record<BotanikId, SprigOpts> = {
		wiese: { kind: 'outline', every: 2.2 * S, len: 2.6 * S, wid: 2 * S, spread: 0.8, paired: true, taper: 0.3 },
		eukalyptus: { kind: 'round', every: 2 * S, len: 2.6 * S, spread: 1.0, taper: 0.3 },
		lorbeer: { kind: 'fill', every: 2.1 * S, len: 2.7 * S, wid: 1.25 * S, spread: 0.55, paired: true, taper: 0.35 },
		wildblumen: { kind: 'bud', every: 1.6 * S, len: 1.6 * S, wid: 1.1 * S, spread: 0.7, taper: 0.3 },
		beeren: { kind: 'berry', every: 1.5 * S, len: 1.7 * S, spread: 0.85, taper: 0.2 },
		farn: { kind: 'fill', every: 1.2 * S, len: 2.2 * S, wid: 1.3 * S, spread: 0.95, taper: 0.5 }
	};
	const o = kinds[id];
	sprig(ctx, arc(cx, cy, R, 100 * deg, 245 * deg), o);
	sprig(ctx, arc(cx, cy, R, 80 * deg, -65 * deg), o);
	const bottom = { x: cx, y: cy + R };
	if (id === 'wildblumen' || id === 'wiese' || id === 'lorbeer') blossom(ctx, bottom.x, bottom.y, 1.4 * S, -Math.PI / 2);
	else floret(ctx, bottom.x, bottom.y, 1.1 * S);
	star(ctx, cx, cy - R, 0.9 * S);
	for (const s of [-1, 1]) {
		dot(ctx, cx + s * Math.cos(-90 * deg + s * 11 * deg) * R, cy + Math.sin(-90 * deg + 11 * deg) * R, 0.35 * S);
		star(ctx, cx + s * Math.cos(-90 * deg + 20 * deg) * R, cy + Math.sin(-90 * deg + 20 * deg) * R, 0.5 * S, s);
	}
	const inner = R - 3.4 * S;
	return { x: cx - inner * 0.86, y: cy - inner * 0.6, w: inner * 1.72, h: inner * 1.2 };
}

export function drawBotanik(ctx: Ctx, id: BotanikId, W: number, H: number, marginPx: number, round: boolean, dpmm: number): Box {
	const s = Math.min(1.5, Math.max(0.5, Math.min(W, H) / (26 * dpmm)));
	const S = s * dpmm;
	const g: G = { x0: marginPx, y0: marginPx, x1: W - marginPx, y1: H - marginPx, w: W - 2 * marginPx, h: H - 2 * marginPx, S, W, H };
	ctx.save();
	ctx.fillStyle = '#000';
	ctx.strokeStyle = '#000';
	ctx.lineCap = 'round';
	ctx.lineJoin = 'round';
	ctx.lineWidth = Math.max(1.7, 0.27 * dpmm * Math.min(1.25, Math.max(0.8, s)));
	const b = round ? roundFrame(ctx, id, g) : rectFrame(ctx, id, g);
	ctx.restore();
	return b;
}
