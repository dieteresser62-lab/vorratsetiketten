import './style.css';
import catalogJson from './vendor/catalog/t5080.json';
import {
	openBlePrinter,
	openPrinter,
	requestBlePrinter,
	requestPrinter,
	webBluetoothSupported,
	webHidSupported,
	type Bitmap,
	type LabelSpec,
	type PrinterDriver
} from './vendor/printer';
import { DPMM, FONTS, FRAMES, loadFonts, paintDots, renderBitmap, renderCanvas, type FontId, type FrameId, type LabelDesign, type Shape } from './render';

// ---------------- Etikettenkatalog ----------------

interface CatalogEntry {
	ID: string | number; Name: string; TapeLength: number; TapeWidth: number; PaperDirection: number;
	PaperType: number; DieCutGap: number; Padding: { Top: number; Bottom: number; Left: number; Right: number }; ShapeType?: number;
}
const catalog = (catalogJson as CatalogEntry[]).map((e) => ({
	spec: {
		id: String(e.ID), name: e.Name, lengthMm: e.TapeLength, widthMm: e.TapeWidth, paperDirection: e.PaperDirection,
		paperType: e.PaperType, gap: e.DieCutGap,
		padding: { top: e.Padding?.Top ?? 0, bottom: e.Padding?.Bottom ?? 0, left: e.Padding?.Left ?? 0, right: e.Padding?.Right ?? 0 },
		extra: e as unknown as Record<string, unknown>
	} satisfies LabelSpec,
	shape: (e.ShapeType === 3 ? 'round' : e.ShapeType === 2 ? 'rounded' : 'rect') as Shape
}));

/** Je Größe/Form ein Eintrag für die Auswahl (gestanzte Etiketten, sinnvolle Größen für Dosen). */
const sizeChoices = (() => {
	const seen = new Map<string, (typeof catalog)[number]>();
	for (const c of catalog) {
		if (c.spec.paperType !== 1) continue;
		if (c.spec.lengthMm > 80 || c.spec.widthMm > 80 || c.spec.lengthMm < 25 || c.spec.widthMm < 15) continue;
		const key = `${c.spec.lengthMm}x${c.spec.widthMm}-${c.shape}`;
		const prev = seen.get(key);
		if (!prev || (prev.spec.paperDirection === 0 && c.spec.paperDirection === 1)) seen.set(key, c);
	}
	return [...seen.entries()]
		.map(([key, c]) => ({ key, ...c }))
		.sort((a, b) => a.spec.lengthMm - b.spec.lengthMm || a.spec.widthMm - b.spec.widthMm);
})();

const sizeName = (l: { lengthMm: number; widthMm: number }, shape: Shape) =>
	shape === 'round' ? `${l.lengthMm} mm rund` : `${l.lengthMm} × ${l.widthMm} mm${shape === 'rounded' ? ', abgerundet' : ''}`;

// ---------------- gespeicherte Einstellungen ----------------

const KEY = 'vorratsetiketten:v1';
interface Saved { frame: FrameId; font: FontId; sizeKey: string; density: number; items: string[]; }
const DEFAULTS: Saved = {
	frame: 'wiese',
	font: 'schlicht',
	sizeKey: '50x30-rect',
	density: 4,
	items: ['Mehl', 'Zucker', 'Salz', 'Reis', 'Nudeln', 'Vermi\nCelli', 'Haferflocken', 'Kaffee', 'Linsen', 'Müsli']
};
function load(): Saved {
	try {
		const raw = localStorage.getItem(KEY);
		if (raw) {
			const s = { ...DEFAULTS, ...JSON.parse(raw) } as Saved;
			if (!FRAMES.some((f) => f.id === s.frame)) s.frame = DEFAULTS.frame; // alte Rahmen gibt es nicht mehr
			return s;
		}
	} catch { /* ohne Speicher weiter */ }
	return { ...DEFAULTS, items: [...DEFAULTS.items] };
}
const saved = load();
function persist() {
	try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch { /* egal */ }
}

// ---------------- Zustand ----------------

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const ui = {
	status: $('status'), connect: $<HTMLButtonElement>('connect'), error: $('error'), nobt: $('nobt'),
	preview: $<HTMLCanvasElement>('preview'), sizeinfo: $('sizeinfo'),
	text: $<HTMLTextAreaElement>('text'), extra: $<HTMLInputElement>('extra'), date: $<HTMLButtonElement>('date'),
	chips: $('chips'), save: $<HTMLButtonElement>('save'), editlist: $<HTMLButtonElement>('editlist'), batch: $<HTMLInputElement>('batch'),
	frames: $('frames'), fonts: $('fonts'), size: $<HTMLSelectElement>('size'), sizehint: $('sizehint'),
	density: $<HTMLInputElement>('density'), densityout: $('densityout'),
	minus: $<HTMLButtonElement>('minus'), plus: $<HTMLButtonElement>('plus'), copies: $('copies'),
	print: $<HTMLButtonElement>('print'), progress: $('progress')
};

let driver: PrinterDriver | null = null;
let closeLink: (() => Promise<void>) | null = null;
let detected: { spec: LabelSpec; shape: Shape } | null = null;
let copies = 1;
let editing = false;
const picked = new Set<string>();

function currentLabel(): { spec: LabelSpec; shape: Shape } {
	if (detected) return detected;
	const c = sizeChoices.find((s) => s.key === saved.sizeKey) ?? sizeChoices.find((s) => s.key === DEFAULTS.sizeKey) ?? sizeChoices[0];
	return { spec: c.spec, shape: c.shape };
}

/** Rand, den der 48-mm-Druckkopf bzw. der Etikettenträger nicht erreicht. */
function marginFor(spec: LabelSpec): number {
	const across = spec.paperDirection !== 0 ? spec.lengthMm : spec.widthMm;
	const headCrop = Math.max(0, (across * DPMM - 384) / DPMM / 2);
	const pad = Math.max(spec.padding.top, spec.padding.left, 0);
	return Math.max(1.2, headCrop + 0.6, Math.min(pad, 2));
}

function design(text: string): LabelDesign {
	const { spec, shape } = currentLabel();
	return {
		lengthMm: spec.lengthMm, widthMm: spec.widthMm, shape, marginMm: marginFor(spec),
		frame: saved.frame, font: saved.font, text, extra: ui.extra.value
	};
}

// ---------------- Vorschau ----------------

const work = document.createElement('canvas');
function renderPreview() {
	const { spec, shape } = currentLabel();
	const css = getComputedStyle(document.documentElement);
	const paper = toHex(css.getPropertyValue('--paper').trim() || '#ffffff');
	const ink = toHex(css.getPropertyValue('--dot').trim() || '#161616');
	paintDots(renderBitmap(design(ui.text.value), work), ui.preview, ink, paper);
	ui.preview.classList.toggle('round', shape === 'round');
	ui.preview.style.aspectRatio = `${spec.lengthMm} / ${spec.widthMm}`;
	ui.preview.style.maxWidth = `${Math.min(520, spec.lengthMm * 9)}px`;
	ui.sizeinfo.textContent = `${sizeName(spec, shape)}${detected ? ' · vom Drucker erkannt' : ''}`;
}
function toHex(c: string) {
	if (c.startsWith('#') && c.length === 7) return c;
	return '#ffffff';
}

let frameThumbs: { id: FrameId; canvas: HTMLCanvasElement }[] = [];
function buildChoices() {
	ui.frames.replaceChildren();
	frameThumbs = FRAMES.map((f) => {
		const b = document.createElement('button');
		b.type = 'button';
		b.className = 'choice';
		const cv = document.createElement('canvas');
		const name = document.createElement('span');
		name.textContent = f.name;
		b.append(cv, name);
		b.addEventListener('click', () => {
			saved.frame = f.id;
			persist();
			refresh();
		});
		ui.frames.append(b);
		return { id: f.id, canvas: cv };
	});
	ui.fonts.replaceChildren(
		...FONTS.map((f) => {
			const b = document.createElement('button');
			b.type = 'button';
			b.textContent = f.name;
			b.dataset.id = f.id;
			b.style.fontFamily = `${f.family}, serif`;
			b.style.fontWeight = String(f.weight);
			b.addEventListener('click', () => {
				saved.font = f.id;
				persist();
				refresh();
			});
			return b;
		})
	);
	ui.size.replaceChildren(
		...sizeChoices.map((s) => {
			const o = document.createElement('option');
			o.value = s.key;
			o.textContent = sizeName(s.spec, s.shape);
			return o;
		})
	);
}

function refreshChoices() {
	const frameButtons = ui.frames.querySelectorAll<HTMLButtonElement>('.choice');
	frameThumbs.forEach((t, i) => {
		frameButtons[i].setAttribute('aria-pressed', String(t.id === saved.frame));
		const d = { ...design('Mehl'), frame: t.id, extra: '' };
		renderCanvas(d, t.canvas);
	});
	ui.fonts.querySelectorAll<HTMLButtonElement>('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === saved.font)));
	ui.size.value = detected ? '' : saved.sizeKey;
	ui.size.disabled = !!detected;
	ui.sizehint.textContent = detected
		? `Eingelegt: ${sizeName(detected.spec, detected.shape)} (vom Drucker gemeldet).`
		: 'Wird nach dem Verbinden automatisch vom Drucker übernommen.';
	ui.density.value = String(saved.density);
	ui.densityout.textContent = String(saved.density);
}

// ---------------- Vorräte ----------------

const label = (item: string) => item.replace(/\n/g, ' ');
function renderChips() {
	ui.chips.replaceChildren(
		...saved.items.map((item) => {
			const b = document.createElement('button');
			b.type = 'button';
			b.className = 'chip';
			b.textContent = label(item);
			if (ui.batch.checked && picked.has(item)) b.classList.add('picked');
			b.setAttribute('aria-pressed', String(!ui.batch.checked && ui.text.value === item));
			if (editing) {
				const x = document.createElement('span');
				x.className = 'x';
				x.textContent = '×';
				x.setAttribute('aria-hidden', 'true');
				b.append(x);
				b.setAttribute('aria-label', `${label(item)} entfernen`);
			}
			b.addEventListener('click', () => {
				if (editing) {
					saved.items = saved.items.filter((i) => i !== item);
					picked.delete(item);
					persist();
				} else if (ui.batch.checked) {
					if (picked.has(item)) picked.delete(item);
					else picked.add(item);
					ui.text.value = item;
				} else {
					ui.text.value = item;
				}
				refresh();
			});
			return b;
		})
	);
	updatePrintButton();
}

function updatePrintButton() {
	const n = ui.batch.checked ? picked.size : 1;
	const total = n * copies;
	ui.print.textContent = ui.batch.checked
		? n ? `${total} Etikett${total === 1 ? '' : 'en'} drucken` : 'Vorräte auswählen'
		: total > 1 ? `${total} Etiketten drucken` : 'Drucken';
	ui.print.disabled = (ui.batch.checked && !n) || printing;
}

function refresh() {
	renderPreview();
	refreshChoices();
	renderChips();
}

// ---------------- Drucker ----------------

function setStatus(text: string, state: 'off' | 'on' | 'busy') {
	ui.status.textContent = text;
	ui.status.dataset.state = state;
}
function showError(msg: string | null) {
	ui.error.hidden = !msg;
	ui.error.textContent = msg ?? '';
}

function friendly(e: unknown): string {
	const err = e as Error & { code?: string };
	const m = err?.message ?? String(e);
	if (err?.name === 'NotFoundError' && /adapter|not available/i.test(m)) return 'Bluetooth ist ausgeschaltet. Bitte einschalten und nochmal verbinden.';
	if (err?.name === 'SecurityError' || /permission|not allowed/i.test(m))
		return 'Der Browser darf nicht auf Bluetooth zugreifen. In den Handy-Einstellungen unter Apps → Chrome → Berechtigungen „Geräte in der Nähe“ erlauben.';
	if (err?.code === 'timeout') return 'Der Drucker antwortet nicht. Aus- und wieder einschalten, Hersteller-App schließen, dann erneut verbinden.';
	if (err?.name === 'NetworkError' || /gatt|connect/i.test(m))
		return 'Verbindung zum Drucker fehlgeschlagen. Ist er eingeschaltet und nicht gerade mit der Hersteller-App verbunden?';
	return `Das hat nicht geklappt: ${m}`;
}

async function readLoadedLabel() {
	if (!driver?.readMedia) return;
	try {
		const media = await driver.readMedia();
		if (!media) return;
		const hit = catalog.find((c) => c.spec.id === String(media.labelId));
		if (hit) detected = { spec: hit.spec, shape: hit.shape };
		else if (media.lengthMm && media.widthMm)
			detected = {
				spec: {
					id: `printer-${media.labelId}`, name: 'Eingelegt', lengthMm: media.lengthMm, widthMm: media.widthMm,
					paperDirection: 1, paperType: media.paperType ?? 1, gap: media.gap ?? 3, padding: { top: 1, bottom: 1, left: 1, right: 1 }
				},
				shape: 'rect'
			};
	} catch (e) {
		console.warn('Etikett nicht lesbar', e);
	}
}

async function battery(): Promise<string> {
	try {
		const s = await driver!.getStatus();
		if (s.batteryLevel != null) return ` · Akku ${'▮'.repeat(s.batteryLevel)}${'▯'.repeat(4 - s.batteryLevel)}`;
	} catch { /* ohne Akkuanzeige */ }
	return '';
}

async function disconnect() {
	const c = closeLink;
	driver = null;
	closeLink = null;
	detected = null;
	setStatus('Nicht verbunden', 'off');
	ui.connect.textContent = 'Drucker verbinden';
	await c?.().catch(() => {});
	refresh();
}

async function connect() {
	if (driver) return disconnect();
	showError(null);
	const useUsb = !webBluetoothSupported() && webHidSupported();
	try {
		setStatus('Verbinde …', 'busy');
		if (useUsb) {
			const dev = await requestPrinter();
			if (!dev) return setStatus('Nicht verbunden', 'off');
			const r = await openPrinter(dev);
			driver = r.driver;
			closeLink = () => r.transport.close();
		} else {
			const dev = await requestBlePrinter(); // muss direkt aus dem Klick kommen
			const r = await openBlePrinter(dev);
			driver = r.driver;
			closeLink = () => r.transport.close();
			dev.addEventListener('gattserverdisconnected', () => {
				if (driver === r.driver) {
					driver = null;
					closeLink = null;
					detected = null;
					setStatus('Verbindung getrennt', 'off');
					ui.connect.textContent = 'Drucker verbinden';
					refresh();
				}
			});
		}
		await readLoadedLabel();
		setStatus(`Verbunden${await battery()}`, 'on');
		ui.connect.textContent = 'Trennen';
		refresh();
	} catch (e) {
		const err = e as Error;
		driver = null;
		setStatus('Nicht verbunden', 'off');
		if (err?.name === 'NotFoundError' && !/adapter|not available/i.test(err.message)) return; // Auswahl abgebrochen
		showError(friendly(e));
	}
}

let printing = false;
async function print() {
	showError(null);
	if (!driver) {
		await connect();
		if (!driver) return;
	}
	const texts = ui.batch.checked ? saved.items.filter((i) => picked.has(i)) : [ui.text.value];
	if (!texts.length || texts.every((t) => !t.trim())) return showError('Bitte erst einen Inhalt eintippen.');
	printing = true;
	updatePrintButton();
	setStatus('Druckt …', 'busy');
	try {
		await readLoadedLabel();
		renderPreview();
		const { spec } = currentLabel();
		const pages: Bitmap[] = texts.map((t) => renderBitmap(design(t)));
		const phases: Record<string, string> = {
			preparing: 'Bereite vor …', checking: 'Prüfe Drucker …', sending: 'Sende Daten …', printing: 'Druckt …', finishing: 'Fast fertig …', done: 'Fertig'
		};
		await driver.print(pages, spec, {
			density: saved.density,
			copies,
			onProgress: (p) => {
				ui.progress.textContent = `${phases[p.phase] ?? ''}${p.pages > 1 && p.page ? ` Etikett ${p.page} von ${p.pages}` : ''}`;
			}
		});
		const n = pages.length * copies;
		ui.progress.textContent = `${n} Etikett${n === 1 ? '' : 'en'} gedruckt.`;
	} catch (e) {
		ui.progress.textContent = '';
		showError(friendly(e));
	} finally {
		printing = false;
		updatePrintButton();
		if (driver) setStatus(`Verbunden${await battery()}`, 'on');
	}
}

// ---------------- Ereignisse ----------------

ui.connect.addEventListener('click', () => void connect());
ui.print.addEventListener('click', () => void print());
ui.text.addEventListener('input', () => { renderPreview(); renderChips(); });
ui.extra.addEventListener('input', renderPreview);
ui.date.addEventListener('click', () => {
	const d = new Date();
	ui.extra.value = `abgefüllt ${d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}`;
	renderPreview();
});
ui.save.addEventListener('click', () => {
	const t = ui.text.value.trim();
	if (!t) return;
	if (!saved.items.includes(t)) saved.items.push(t);
	persist();
	renderChips();
});
ui.editlist.addEventListener('click', () => {
	editing = !editing;
	ui.editlist.setAttribute('aria-pressed', String(editing));
	ui.editlist.textContent = editing ? 'Fertig' : 'Bearbeiten';
	renderChips();
});
ui.batch.addEventListener('change', () => {
	if (!ui.batch.checked) picked.clear();
	renderChips();
});
ui.size.addEventListener('change', () => {
	saved.sizeKey = ui.size.value;
	persist();
	refresh();
});
ui.density.addEventListener('input', () => {
	saved.density = Number(ui.density.value);
	ui.densityout.textContent = ui.density.value;
	persist();
});
ui.minus.addEventListener('click', () => { copies = Math.max(1, copies - 1); ui.copies.textContent = String(copies); updatePrintButton(); });
ui.plus.addEventListener('click', () => { copies = Math.min(50, copies + 1); ui.copies.textContent = String(copies); updatePrintButton(); });
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', renderPreview);

if (!webBluetoothSupported() && !webHidSupported()) {
	ui.nobt.hidden = false;
	if (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))
		ui.nobt.innerHTML = 'Safari und Chrome dürfen auf dem iPhone kein Bluetooth benutzen. Bitte die kostenlose App <strong>Bluefy</strong> aus dem App Store laden und diese Seite darin öffnen.';
	ui.connect.disabled = true;
}

buildChoices();
refresh();
loadFonts().then(refresh);
