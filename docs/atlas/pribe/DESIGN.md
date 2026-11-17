# Design-Vorgaben: pribe

Vom Nutzer vorgegebene Optik und App-Shell. Siehe D18.

Pribe übernimmt **die Optik und die Shell für die Navigation, auf allen vier Seiten**.
**Animationen sind ausgenommen** und dürfen beliebig übertrieben sein (R3). Das gilt auch für Konfetti,
Feuerwerk und Farbeffekte in Animationen.

## Shell (eine gemeinsame Layout-Komponente in `apps/web`, gebaut in P1)
- **Header (48 px):** Pribe-Wortmarke als App-Name (fett 14/20), Theme-Umschalter hell/dunkel und rechts der Avatar. Auf `/vote` und `/submit` ist das die gewählte Person mit Emoji und Farbe, auf `/admin` und `/host` der Admin. Kein Sprachmenü, weil die UI nur deutsch ist (R2). Kein Stage-Badge.
- **Nav-Rail:** 70 px eingeklappt, 240 px ausgeklappt, unter 768 px eine 56 px Bottom-Bar. Einträge: Einreichen (`/submit`), Abstimmen (`/vote`), Beamer (`/host`), Admin (`/admin`). Beamer und Admin tragen ein Schloss-Symbol, solange man nicht eingeloggt ist. Der aktive Eintrag ist gelb markiert.
- Shell auf `100dvh`, gescrollt wird nur der Inhaltsbereich.
- **Vollbild in der Show:** `/host` blendet die Shell aus, sobald die Show läuft: Ziehen, Präsentation, Countdown, Auflösung und Finale. Sichtbar ist sie in Lobby und Präsentator-Wahl. Die Shell bietet dafür einen einfachen Schalter an, z.B. Context/Hook `useShellHidden()`.
- `/vote` behält die Shell auch während der Abstimmung.

## Farb-Tokens (als CSS-Variablen auf `:root`, Dunkel per `prefers-color-scheme` bzw. `[data-theme]`)
| Token | Hell | Dunkel |
|---|---|---|
| `--surface-default` | #ffffff | #202326 |
| `--surface-soft` | #f9fafb | #282c30 |
| `--surface-strong` | #f0f3f6 | #353a40 |
| `--surface-primary` (Akzent) | #ffd000 | #ffd000 |
| `--text-on-primary` | #000000 | #000000 |
| `--text-default` | #000000 | #ffffff |
| `--text-soft` | #6b7278 | #9ea4ab |
| `--stroke` | #d3d8dd | #51585d |
| `--textinput-stroke` | #000000 | #888e94 |
| `--color-focus-outline` | #000000 | #ffffff |
| `--overlay-backdrop` | rgba(58,64,70,.2) | rgba(0,0,0,.7) |
| `--toast-surface` / `--toast-text` | #353a40 / #ffffff (immer dunkel) | gleich |
| `--scrollbar-thumb` | #bdc4ca | #9ea4ab |
| `--shadow-flyout` | 0 10px 50px rgba(0,0,0,.17) | gleich |

- Seitenhintergrund ist `--surface-strong` (hell) bzw. `--surface-default` (dunkel). Karten und erhöhte Flächen sind `--surface-default` (hell) bzw. `--surface-soft` (dunkel).
- Funktionsfarben: Erfolg #73d95f, Warnung #f89939, Fehler #ff7070. Inline-Warnung hat die Fläche #e3a735 (hell) bzw. #ffc385 (dunkel) mit schwarzer Schrift. Für Grün/Rot bei der Auflösung (R54) nimm Erfolg/Fehler.
- Weitere Farben: Blau #2779c4 nur sparsam, Neutral-Stahl #bdc4ca und #51585d.
- Primäre Aktionen wie Login, „Ziehen“ und „Abschicken“ sind gelbe Flächen (#ffd000) mit schwarzer Schrift. Aktive Auswahl ist gelb markiert.
- Toasts sind immer dunkel und haben einen farbigen Statusstreifen links (Erfolg, Warnung, Fehler, neutral #bdc4ca).
- Die Avatar-Farben der Personen (R5) sind frei und Inhalt, kein Theme.

## Typografie
- Schrift-Stack `-apple-system, BlinkMacSystemFont, Arial, Helvetica, sans-serif`. Lade keine Webfonts nach.
- Seitentitel 24/32 px, App-Name/Labels 14/20 px fett, `letter-spacing` 0.78px für Labels. Auf `/host` skalierst du die Größen für den Beamer hoch (R2).

## Abstände, Layout, Bedienung
- Abstands-Raster 4 / 8 / 12 / 16 / 24 / 32 px.
- Breakpoints: Handy unter 768 px, Desktop ab 1024 px. Der Inhalt ist auf maximal 90rem begrenzt (`/admin`).
- `100dvh`; gescrollt wird nur der Inhaltsbereich.
- Touch-Ziele sind mindestens 48 px auf Handys und bei `pointer: coarse`.
- Fokus-Ring ist schwarz (hell) bzw. weiß (dunkel), nicht gelb.
- Dialoge liegen auf dem Overlay-Backdrop und haben den Flyout-Schatten.
