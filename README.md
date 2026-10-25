# Vorratsetiketten

Kleine Web-App, um Etiketten für Vorratsdosen auf dem **Katasymbol T50M Pro** (Supvan) zu drucken, ohne die Hersteller-App mit Werbung.

**App öffnen:** https://dieteresser62-lab.github.io/vorratsetiketten/

- **Android / PC:** in Chrome öffnen, „Drucker verbinden“ antippen.
- **iPhone:** die kostenlose App **Bluefy** aus dem App Store laden und die Adresse darin öffnen (Safari kann kein Bluetooth).

Ein festes Grundlayout (Rahmen, Schrift, Etikettengröße), nur der Inhalt in der Mitte ändert sich. Zweizeilige Texte werden Zeile für Zeile zentriert.

## Aufbau

- `index.html` ist die fertige App in einer Datei.
- `quelltext/` enthält den Quellcode (Vite + TypeScript). Neu bauen: `cd quelltext && npm install && npx vite build`, danach `dist/index.html` nach oben kopieren.

Das Druckprotokoll stammt aus [khromov/supvan-katasymbol-printer-web-ui](https://github.com/khromov/supvan-katasymbol-printer-web-ui) (MIT-Lizenz, siehe `LICENSE-druckprotokoll.txt`).
