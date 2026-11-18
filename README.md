# Pribe

PowerPoint-Karaoke mit Ratespiel. Anforderungen und Entscheidungen: `docs/atlas/pribe/`.

## Entwicklung

Node 24 (wegen des eingebauten `node:sqlite`).

```bash
npm install
cp .env.example .env   # Passwort, Secret und Ports anpassen
npm run dev            # Server (PORT) + Vite (WEB_DEV_PORT) mit Proxy auf /api und /socket.io
npm test
npm run build          # Typecheck, Vite-Build nach apps/web/dist, Server-Bundle nach apps/server/dist
npm start              # ein Node-Prozess: API, Socket.IO und das gebaute Frontend
```

Bereits gesetzte Umgebungsvariablen haben Vorrang vor `.env`.

`npm test` enthält die Spielablauf-Tests in `apps/server/src/e2e/` (echter Server-Prozess auf
einem freien Port): `gameFlow` spielt mit Host + 5 Handys den ganzen Abend inkl. Neustart,
`wave2` prüft Login-Sperre, Fernbedienung, „Du präsentierst!“, Vortrags-Sterne/Rampensau,
Emoji-Combo, Probelauf und die drei Reset-Wege. Einzeln: `npm run test:e2e`.

## Lokal ohne Docker starten

1. `.env` aus `.env.example` anlegen und anpassen: `ADMIN_PASSWORD`, `PRIBE_SECRET`
   (mindestens 16 Zeichen), `PORT` (z. B. `3000`) und `PUBLIC_URL` passend dazu
   (`http://localhost:3000`, im WLAN die IP des Rechners, damit der QR-Code für Handys stimmt).

   ```powershell
   Copy-Item .env.example .env
   ```

2. Abhängigkeiten, Build, Demo-Daten, Start:

   ```powershell
   npm ci
   npm run build
   npm run demo:seed
   npm start
   ```

3. Im Browser (`PORT` 3000 angenommen):

   | URL | Wofür | Anmeldung |
   | --- | --- | --- |
   | `http://localhost:3000/admin` | Personen, Einstellungen, Einreichungen | `ADMIN_PASSWORD` aus `.env` |
   | `http://localhost:3000/host` | Beamer (1920×1080, F11 für Vollbild) | `ADMIN_PASSWORD` aus `.env` |
   | `http://localhost:3000/remote` | Fernbedienung am Handy | `ADMIN_PASSWORD` aus `.env` |
   | `http://localhost:3000/vote` | Handy | Demo-Person, Passwort `demo` |
   | `http://localhost:3000/submit` | Einreichen | Demo-Person, Passwort `demo` |

### Demo-Daten (`npm run demo:seed`)

- Legt 8 Personen an (Anna, Ben, Cleo, Dennis, Emma, Finn, Greta, Hugo), alle mit Emoji,
  Farbe, gezogenem Thema und dem Passwort **`demo`**; Ben, Cleo, Emma, Finn und Greta haben
  ein Foto, sodass die Foto-Wand im Finale Fotos und Emojis mischt.
  Die Hälfte entsteht wie im Admin, die andere Hälfte per Selbstregistrierung mit dem
  Einladungscode **`PRIBE-DEMO`**.
- Reicht über die echte Upload-API 5 HTML-Präsentationen (`demo/html/`, Pfeiltasten und
  Klick zum Blättern) und 2 PowerPoint-Dateien (`demo/pptx/`) ein. Hugo hat keine eigene
  Präsentation und darf trotzdem präsentieren.
- Legt *Professor Pribe* als Überraschungsgast an (eigener Eintrag mit Foto, eingeschaltet)
  und lädt `demo/html/ueberraschungsgast.html` als seine Präsentation hoch.
- Die PPTX tragen absichtlich Autor-Metadaten. Das Skript prüft, dass sie nach dem Upload
  leer sind und der Download-Name nur ein Hash ist.
- Einsendeschluss in 7 Tagen, Zeitlimit 3 Minuten, Vote-Countdown 20 Sekunden.
- Nutzt `DATA_DIR` aus `.env` und startet dafür kurz einen eigenen Server auf einem freien
  Port: vorher `npm start` beenden. Gibt es schon Personen, bricht es ab;
  `npm run demo:seed -- --force` löscht Spiel, Einreichungen und Personen und legt alles neu an.
- Die PPTX-Dateien neu erzeugen: `npm run demo:pptx` (mit `pptxgenjs`).
- Vortrags-Sterne, Rampensau und Emoji-Combo brauchen keine Vorab-Daten: Sie entstehen im
  Spiel. Zum Ausprobieren ohne echte Mitspieler eignet sich der Probelauf.

### Fernbedienung (`/remote`)

Das Handy der Spielleitung meldet sich mit `ADMIN_PASSWORD` an und steuert dasselbe Spiel wie
der Beamer: Präsentator wählen oder Rad drehen, Ziehen, Schließen und im Finale Weiter/Zurück.
Timer und Phase sind sichtbar. So laufen PPTX-Runden, ohne zwischen PowerPoint und Browser zu
wechseln. Beamer und Fernbedienung sind zwei getrennte Admin-Sitzungen.

### Überraschungsgast

In `/admin` → *Überraschungsgast* wählt die Spielleitung eine vorhandene Person oder legt einen
eigenen Eintrag an (Name, Emoji/Farbe, Foto). Ein eigener Eintrag spielt nicht mit: kein Login,
keine Tipps, nicht in Rangliste und Awards. Die Gast-Präsentation (HTML oder PPTX, gleiche
Prüfung und Metadaten-Bereinigung wie beim Einreichen) liegt nie im Pool, zählt nicht bei den
Einreichungen und ergibt keine Runde. Ist der Gast eingeschaltet und die Präsentation fertig,
führt *Weiter* nach der Foto-Wand zur Enthüllung und danach zum Vortrag ohne Zeitlimit.
*Zurück zum Finale* (Beamer und `/remote`) kehrt zur Foto-Wand zurück.

### Probelauf

In `/admin` → *Probelauf* startet ein Testspiel mit 5 Bots, den Demo-Präsentationen aus
`demo/` und einem eingeschalteten Überraschungsgast. Er läuft in einer eigenen, temporären Datenbank unter `DATA_DIR/probelauf`. Echte
Personen, Einreichungen, Themen und der Spielstand bleiben unverändert. Beamer, Fernbedienung
und Handys zeigen dabei einen Hinweis. *Probelauf beenden* (oder ein Neustart des Servers)
kehrt zum echten Spiel zurück und löscht das Verzeichnis. Solange er läuft, sind die
Reset-Wege gesperrt.

### Reset-Wege (`/admin`)

| Knopf | Löscht | Bleibt |
| --- | --- | --- |
| *Spiel zurücksetzen* | Runden, Votes, Spielstand (zurück in die Lobby) | Personen, Einreichungen, Themen, Überraschungsgast, Einstellungen |
| *Themen zurücksetzen* | alle gezogenen Themen | alles andere |
| *Alles löschen* (Bestätigung durch Eintippen von `LÖSCHEN`) | zusätzlich Personen, Einreichungen, Dateien, Fotos, Themen, Überraschungsgast samt Präsentation | Einstellungen (Einladungscode, Fristen) |

Nach 5 falschen Admin-Passwörtern ist der Login für diese IP 15 Minuten gesperrt. Hinter einem
Reverse-Proxy dafür `TRUST_PROXY=true` setzen, sonst teilen sich alle die IP des Proxys.

Für mehrere „Handys“ an einem Rechner braucht jedes einen eigenen Cookie-Speicher, z. B.
`http://localhost:3000/vote`, `http://127.0.0.1:3000/vote` und `http://127.0.0.2:3000/vote`
oder private Fenster.

## Aufbau

| Ort | Inhalt |
| --- | --- |
| `packages/shared` | Verträge: Domain-Typen, Socket-Events (`socket.ts`), Snapshots (`state.ts`), Finale (`finale.ts`), REST-DTOs und Pfade (`api.ts`), zod-Schemas, Fehlercodes |
| `apps/server/src/config.ts` | env lesen und validieren |
| `apps/server/src/db/` | SQLite (`node:sqlite`), Migrationen, ein Repository pro Tabelle |
| `apps/server/src/auth/` | Admin-Session-Cookie, HTTP- und Socket-Guard |
| `apps/server/src/security/hmac.ts` | `ownerHash(personId)` = HMAC-SHA256 mit `PRIBE_SECRET` |
| `apps/server/src/sockets.ts` | Namespaces `/host` (nur mit Admin-Session) und `/vote` (offen) |
| `apps/server/src/routes/index.ts` | Registrierung aller Routen; alles in `adminRoutes` läuft hinter dem Guard |
| `apps/web/src/lib/` | `api`, `useAuth` (Context), typisierte Sockets, `useSocket`, Konfetti |
| `apps/web/src/shell/` | Shell nach `DESIGN.md` (D18): Header, Nav-Rail/Bottom-Bar, Theme, Toasts |
| `apps/web/src/theme.css` | Farb-Tokens hell/dunkel, Typografie, Abstände, Grund-Komponenten |

## Shell-API (`apps/web/src/shell`)

Alle Routen laufen in `ShellLayout`; Seiten rendern nur ihren Inhalt (gescrollt wird `.shell-main`).

```tsx
import { useShellHidden, useShellAvatar, useToast, useTheme } from '../../shell';

useShellHidden(phase !== 'lobby' && phase !== 'choosePresenter'); // /host: Vollbild in der Show, Seite bleibt gemountet
useShellAvatar(me ? { emoji: me.emoji, color: me.color, label: me.name } : null); // /vote, /submit: Person im Header
const toast = useToast(); toast('Gespeichert', 'success'); // 'success' | 'warning' | 'error' | 'neutral'
const { theme, toggle } = useTheme();
```

- Auf `/admin` und `/host` zeigt der Header selbst den Admin-Avatar (mit „Abmelden“), sobald man eingeloggt ist; Beamer und Admin tragen sonst ein Schloss.
- CSS: primäre Aktionen `button.primary` / `.button.primary` (Submit-Buttons automatisch gelb), Karten `.card`, Seitentitel `h1`/`.page-title`, Labels `.label`, Inline-Warnung `.inline-warning`, Inhalt begrenzt mit `.page`. Farben nur über die Tokens (`--surface-*`, `--text-*`, `--color-success|warning|error`); Animationen dürfen frei davon abweichen.
- Beamer-Größen: Wrapper mit Klasse `host`.

Regeln für die Verträge: nur additiv erweitern. Vor der Auflösung darf nichts an Handys
oder Beamer gehen, was vom Einreicher abhängt (siehe Kommentar in `shared/src/state.ts`).

## Zuständigkeiten der Pakete

Jedes Paket arbeitet in seinen eigenen Dateien; die Einstiegspunkte existieren schon.

| Paket | Dateien |
| --- | --- |
| P1 Fundament | Gerüst, `packages/shared`, `apps/server/src/{config,app,index,sockets,static,context,paths}.ts`, `db/`, `auth/`, `security/`, `routes/{index,auth}.ts`, `apps/web/src/{App,main}.tsx`, `lib/`, `theme.css` |
| P2 Admin + Submit | `apps/server/src/routes/admin*`, `routes/submit*`, `apps/web/src/pages/admin/`, `apps/web/src/pages/submit/` |
| P3 Umwandlung | `apps/server/src/conversion/` (PPTX-Metadaten leeren hinter `createConversionQueue`), Datei-Endpunkt `routes/files.ts` |
| P4 Echtzeit-Kern | `apps/server/src/game/` (außer `finale*`), Socket-Handler via `registerGame` |
| P5 Host | `apps/web/src/pages/host/` |
| P6 Vote | `apps/web/src/pages/vote/` |
| P7 Finale | `apps/server/src/game/finale*`, `apps/web/src/components/finale/` |
| P9 Betrieb | `Dockerfile`, `docker-compose.yml`, `docs/betrieb.md`, Ausbau von `.env.example` |

Neue Tabellen oder Spalten kommen als neue Migration ans Ende von `db/migrations.ts`.
