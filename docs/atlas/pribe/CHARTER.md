# Mission: pribe

Created: 2026-11-17 · Last touched: 2026-11-17

## Goal
Pribe („Vibe und Präsentation“) ist eine Webapp komplett in TypeScript (Node-Backend,
React-Frontend) für einen lustigen Workshop-Abend im Team (10–20 Leute). Vorher reicht
jeder anonym eine Präsentation ein (One-File-HTML oder PowerPoint). Am Abend zieht das
Präsentations-Roulette auf dem Beamer für die präsentierende Person zufällig eine
**fremde** Präsentation, die sofort startet (PowerPoint-Karaoke). Alle tippen live am
Handy, wer sie eingereicht hat, und bewerten die Folien; nach jeder Runde wird
aufgelöst, am Ende gibt es ein Finale mit Leaderboard, Awards und Tipp-Netz. Alles mit
**übertriebenen Animationen**. Läuft als Docker-Container auf dem Raspberry Pi eines
Kollegen, öffentlich über eine Domain.

## Scope — Anforderungskatalog
IDs (R..) werden in STATE.md und DECISIONS.md referenziert.

### Allgemein
- **R1** Monorepo mit npm-Workspaces, alles TypeScript: `apps/server` (Node LTS, Fastify,
  Socket.IO, SQLite), `apps/web` (React + Vite, Motion/Framer Motion, canvas-confetti),
  `packages/shared` (Typen, Socket-Event-Verträge, Validierungsschemas).
- **R2** UI auf Deutsch. `/submit` und `/vote` handy-first; `/host` für Beamer (16:9,
  große Schrift); `/admin` Desktop.
- **R3** Übertriebene Animationen überall: Seitenwechsel, Ziehen, Auflösung, Finale,
  Konfetti/Feuerwerk.
- **R4** Ein Spiel pro Installation; der komplette Zustand ist persistent und übersteht
  einen Neustart des Containers (Spiel lässt sich fortsetzen).
- **R5** Avatare: jede Person hat Emoji + Farbe, die überall auftauchen (Listen,
  Auflösung, Leaderboard, Tipp-Netz).

### Admin (`/admin`)
- **R10** Login mit `ADMIN_PASSWORD` (env); dasselbe Passwort schützt `/host`.
- **R11** Personen anlegen, bearbeiten, entfernen: Name, Emoji, Farbe.
- **R12** Einstellungen: Einsendeschluss (Datum + Uhrzeit), Zeitlimit pro Vortrag
  (0 = aus), Vote-Countdown nach dem Schließen (Standard 20 s).
- **R13** Übersicht der Einreichungen: Anzahl, Typ, Umwandlungsstatus — **ohne**
  Einreicher.
- **R14** Spiel zurücksetzen (Runden und Votes löschen; Einreichungen optional).

### Submit (`/submit`)
- **R20** Name aus der Liste (mit Avatar) wählen, Datei hochladen: One-File-HTML
  (`.html`/`.htm`) oder PowerPoint (`.pptx`); Limit 100 MB, per env einstellbar.
- **R21** Pro Person genau eine Einreichung; ein erneuter Upload ersetzt die bisherige.
- **R22** Einreicher wird nur als `HMAC-SHA256(personId, PRIBE_SECRET)` gespeichert; der
  Original-Dateiname wird verworfen; bis zur Auflösung steht der Name nirgends im
  Klartext (UI, DB, Logs).
- **R23** Countdown bis zum Einsendeschluss und Live-Zähler „x Präsentationen im Pool“.
  Nach Einsendeschluss, spätestens mit Spielstart, sind Uploads gesperrt.
- **R24** Nach dem Upload sieht die einreichende Person den Umwandlungsstatus
  (wird umgewandelt / bereit / fehlgeschlagen → neu hochladen).

- **R25** (neu 2026-11-17, D25) Persönliches Passwort: Wer seinen Namen zum ersten Mal
  wählt, legt ein Passwort fest; danach Login mit Name + Passwort auf `/submit` und
  `/vote`. Auf dem Gerät bleibt man eingeloggt; der Admin kann das Passwort einer Person
  zurücksetzen.
- **R26** (neu, D26) Themen-Roulette auf `/submit`: Nach dem Login dreht man einmalig ein
  Rad mit 18 festen Themen. Das Rad zeigt immer alle, vergibt aber nur freie; ein
  vergebenes Thema fällt aus dem Pool. Sind alle vergeben, gibt es „Freies Thema“. Wer
  wiederkommt, sieht sein Thema.
- **R28** (neu, D27) Selbstregistrierung auf `/submit` und `/vote` mit Einladungscode
  (vom Admin festgelegt, per `?code=` im Link bzw. QR), eindeutigem Namen, Passwort und
  Avatar: Foto vom Handy oder Emoji + Farbe (ändert R5, R11, R50).
- **R27** (neu, D26) Das Thema wird nur pseudonymisiert (HMAC der Person) gespeichert und
  nirgends pro Person angezeigt außer der Person selbst.

### Umwandlung — ⚠️ R30–R32 ersetzt durch D23 (PPTX bleibt PPTX, Metadaten werden geleert, Öffnen in PowerPoint)
- **R30** PPTX → PDF mit LibreOffice headless, asynchron beim Upload, eine Umwandlung
  nach der anderen (Pi-Leistung), mit Timeout.
- **R31** Nach Erfolg: Original-PPTX löschen, Autor/Ersteller-Metadaten im PDF leeren.
- **R32** Nur Einreichungen mit Status „bereit“ landen im Pool.

### Roulette / Host (`/host`, Beamer)
- **R40** QR-Lobby: großer QR-Code auf `PUBLIC_URL/vote`; Namen fliegen ein, sobald sich
  jemand am Handy anmeldet.
- **R41** Präsentator wählt sich aus der Liste, klickt „Ziehen“ → übertriebene
  Zieh-Animation → Präsentation startet sofort im Vollbild.
- **R42** Optional „Rad wählt Präsentator“: zieht unter denen, die noch nicht präsentiert
  haben.
- **R43** Ziehregeln: nie die eigene Präsentation (HMAC-Vergleich), nie eine schon
  gezeigte. Sackgasse vermeiden: Im Rad-Modus werden Person und Präsentation so gewählt,
  dass niemand übrig bleibt, für den nur noch die eigene im Pool liegt; wer sich manuell
  wählt und nur die eigene übrig hat, bekommt „Jemand anderes muss ziehen“. Auch Personen
  ohne eigene Einreichung dürfen präsentieren.
- **R44** Player: HTML im `iframe` mit `sandbox="allow-scripts"` (ohne
  `allow-same-origin`), Tastaturfokus im iframe für Pfeiltasten; PDF im eigenen
  Folien-Player (pdf.js) mit Tastatur- und Klick-Navigation. ⚠️ PDF-Teil ersetzt durch
  D23: PPTX wird als `<hash>.pptx` heruntergeladen und in PowerPoint geöffnet.
- **R45** Zeitlimit-Balken; bei Ablauf ein Gong (einziger Sound der App). Die
  Präsentation schließt der Host manuell.
- **R46** Live-Emoji-Reaktionen der Handys fliegen über die laufende Präsentation.
- **R47** Schließen entfernt die Präsentation endgültig aus dem Pool → Vote-Countdown →
  Auflösungs-Show: Tipp-Verteilung, dramatische Enthüllung des Einreichers,
  Ø-Sterne der Folien.

### Vote (`/vote`, Handy)
- **R50** Name aus der Liste wählen; wird auf dem Gerät gemerkt (änderbar); keine Sperre,
  Vertrauensbasis.
- **R51** Die Abstimmung öffnet mit dem Start der Präsentation: Tipp (Person aus der
  Liste) + 1–5 ⭐ für die Folien; beides änderbar bis zum Ende des Countdowns.
- **R52** Die einreichende Person sieht exakt dieselbe Oberfläche (Schein-Tipp); ihr
  Tipp und ihre Sterne zählen nicht.
- **R53** Emoji-Reaktionen senden (z.B. 🔥😂👏🍅), gedrosselt pro Gerät.
- **R54** Bei der Auflösung blinkt das Handy grün/rot und vibriert (wo unterstützt).
- **R55** Animierte Wartezustände: Lobby, „gleich geht's los“, Auflösung, Finale.

### Wertung und Finale
- **R60** 1 Punkt pro richtigem Tipp; Schein-Tipps zählen nicht.
- **R61** Der Einreicher wird nach jeder Runde aufgelöst.
- **R62** Finale auf dem Beamer: Leaderboard als Countdown von hinten, Top 3 aufs Podest
  mit Feuerwerk.
- **R63** Awards: Hellseher (meiste Treffer), Pokerface (eigene Präsentation am
  seltensten erraten), Blindgänger (0 Treffer), Herdentier (am häufigsten mit der
  Mehrheit getippt).
- **R64** Tipp-Netz: wer hat wen wie oft getippt, animiert.
- **R65** „Beste Präsentation“: höchste Ø-Sternebewertung.

### Betrieb
- **R70** Docker-Image für arm64 (Multi-Stage; Node ~~+ LibreOffice Impress + gängige
  Schriften~~ — kein LibreOffice mehr, D23), `docker-compose.yml` mit Volume für `/data` (SQLite + Dateien).
- **R71** Konfiguration per env: `ADMIN_PASSWORD`, `PRIBE_SECRET`, `PUBLIC_URL`,
  `MAX_UPLOAD_MB`, `PORT`.
- **R72** Anleitung für den Kollegen: Start, Update, Backup, Reverse Proxy (HTTPS,
  WebSocket-Upgrade, Upload-Limit ≥ 100 MB).

## OUT OF SCOPE
- Echte Logins für Spieler; echte Anonymität gegenüber jemandem mit Zugriff auf DB **und**
  Secret (HMAC über eine kleine bekannte Namensliste ist Sichtschutz, kein Geheimnis).
- Zurückgestellte Ideen („später vielleicht“): Sound-Effekte außer dem Gong,
  Challenge-Karten, Vortrags-Bewertung, Reroll-Joker, Zwischenstand pro Runde,
  KI-Kommentator.
- Originalgetreue PowerPoint-Animationen und -Übergänge.
- Weitere Formate (z.B. PDF direkt, `.ppt`, `.odp`).
- Mehrere parallele Spiele, Teams, Mehrsprachigkeit.
- Betrieb von Pi, Domain und Reverse Proxy (macht der Kollege; wir liefern Image + Anleitung).
- GitHub-Remote und CI (vorerst nur lokales git).
- Autor-Angaben im Inhalt einer HTML-Datei (wird unverändert gezeigt).

## Definition of done / acceptance
- Upload von HTML und PPTX klappt über die Domain; in UI, DB und Logs steht bis zur
  Auflösung kein Einreicher-Name.
- Das Roulette weist nie die eigene Präsentation zu, zieht nie doppelt und bleibt nicht
  in einer Sackgasse hängen.
- 10–20 Handys stimmen gleichzeitig live ab; Punkte stimmen (1 pro Treffer, Schein-Tipps
  zählen nicht).
- Alle gewählten Extras funktionieren (R5, R23, R40, R42, R45, R46, R54, R63–R65); das
  Finale läuft komplett durch.
- Ein Container-Neustart mitten im Spiel verliert keinen Spielstand.
- Ziehen, Wertung, Awards und HMAC-Logik sind mit Unit-Tests abgedeckt.
- **Generalprobe** auf echten iPhones und Android-Handys über die Domain bestanden
  (prüft der Mensch).

## Why atlas
Mehrere Sessions, viele Design- und UX-Entscheidungen, und ob es am Abend auf Beamer und
Handys „übertrieben lustig“ funktioniert, kann nur der Mensch beurteilen — kein reiner
Test-Build.
