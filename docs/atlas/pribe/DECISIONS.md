# Decisions: pribe

Append-only lightweight ADR. Every non-trivial fork resolved in conversation lands
here the moment it is decided — so it is never relitigated. A decision that lives only
in the chat is already lost.

## D01 — Hosting auf dem Raspberry Pi des Kollegen · 2026-11-17
- **Context:** Uploads kommen schon vor dem Workshop, am Abend müssen alle Handys die Vote-URL erreichen.
- **Decision:** Pribe läuft auf dem Raspberry Pi eines Kollegen, der es über eine Domain öffentlich freigibt.
- **Why:** Vorgabe des Nutzers; immer erreichbar, Handys brauchen kein Firmen-WLAN.
- **Alternatives rejected:** Cloud-Host, interner Firmen-Server, Laptop + Tunnel, nur Laptop im WLAN.
- **Affects:** L4 (Pi-Leistung bei der Umwandlung), L10.

## D02 — Docker-Container auf dem Pi · 2026-11-17
- **Context:** Wie Pribe auf dem Pi installiert und aktualisiert wird.
- **Decision:** Ein arm64-Image (Node + LibreOffice), Daten auf einem Volume, Start per `docker compose up`. Gebaut wird auf dem Pi (Multi-Stage), weil lokal kein Docker verfügbar ist.
- **Why:** Minimaler Aufwand für den Kollegen; LibreOffice und Node-Version stecken reproduzierbar im Image.
- **Alternatives rejected:** Node + systemd direkt auf dem Pi (mehr Handarbeit für den Kollegen).
- **Affects:** L10, R70–R72.

## D03 — PPTX wird serverseitig in PDF umgewandelt · 2026-11-17
- **Context:** Wie PowerPoint-Dateien im Roulette abgespielt werden.
- **Decision:** LibreOffice headless wandelt `.pptx` beim Upload in PDF um; Pribe zeigt das PDF in einem eigenen animierten Folien-Player (pdf.js).
- **Why:** Läuft überall im Browser und fügt sich in den Show-Ablauf; kein PowerPoint auf dem Beamer-Rechner nötig.
- **Alternatives rejected:** echtes PowerPoint öffnen (bricht den Ablauf), Rendern im Browser per JS-Bibliothek (ungenau), nur PDF annehmen (dann kein PowerPoint-Upload mehr).
- **Affects:** L4, L6, R30–R32, R44. Verlust von PPT-Animationen ist akzeptiert.

## D04 — HTML läuft im Sandbox-iframe · 2026-11-17
- **Context:** Hochgeladene One-File-HTML führt beliebiges JavaScript aus.
- **Decision:** Anzeige im `iframe` mit `sandbox="allow-scripts"` ohne `allow-same-origin`.
- **Why:** Die Präsentation kann ihre eigenen Skripte (Folien-Navigation) nutzen, aber nicht auf Pribe-Cookies, Admin-Session oder die API zugreifen.
- **Alternatives rejected:** direktes Ausliefern unter derselben Origin (unsicher).
- **Affects:** L6, R44.

## D05 — Pseudonymisierung per HMAC, Auflösung nach jeder Runde · 2026-11-17
- **Context:** „Anonym gespeichert“, aber der Server muss „nicht die eigene“ und „Tipp richtig?“ prüfen können.
- **Decision:** Einreichung speichert nur `HMAC-SHA256(personId, PRIBE_SECRET)`; alle Prüfungen sind Hash-Vergleiche. Nach jeder Runde wird der Einreicher dramatisch enthüllt.
- **Why:** Admin und DB zeigen niemanden; Auflösung pro Runde gibt den größten Show-Effekt.
- **Alternatives rejected:** Auflösung erst im Finale, nie auflösen.
- **Affects:** L1, L3, L5, L6, R22, R43, R47, R61. Ehrlich: bei bekannter Namensliste ist das Sichtschutz, keine echte Anonymität (siehe CHARTER Out of Scope).

## D06 — Abstimmung ab Start, Countdown nach dem Schließen · 2026-11-17
- **Context:** Wann und wie lange die Handys pro Präsentation abstimmen.
- **Decision:** Die Abstimmung öffnet mit dem Start der Präsentation; nach dem Schließen läuft ein Countdown (Standard 20 s, im Admin einstellbar), dann folgt die Auflösung.
- **Why:** Man kann schon während des Vortrags raten; der Countdown hält das Tempo hoch.
- **Alternatives rejected:** erst nach der Präsentation abstimmen; Host schließt per Klick.
- **Affects:** L5–L7, R12, R47, R51.

## D07 — Einreicher tippt zum Schein mit, ohne Punkte · 2026-11-17
- **Context:** Was mit der Person passiert, deren Präsentation gerade gezeigt wird.
- **Decision:** Ihr Handy sieht aus wie bei allen (Tarnung); ihr Tipp zählt nicht, keine Sonderpunkte.
- **Why:** Entscheidung des Nutzers; niemand merkt am Handy-Verhalten, wer es war.
- **Alternatives rejected:** Schein-Tipp + Bluff-Punkte pro Falschtipp; normal mittippen (sicherer Punkt, unfair).
- **Affects:** L5, L7, R52, R60.

## D08 — 1 Punkt pro richtigem Tipp · 2026-11-17
- **Context:** Wertungssystem.
- **Decision:** 1 Punkt pro Treffer; Tipp bis Countdown-Ende änderbar.
- **Why:** Einfach und nachvollziehbar.
- **Alternatives rejected:** Speed-Bonus (Tipp sofort final), Einsatz 1–3 Punkte.
- **Affects:** L5, L8, R51, R60.

## D09 — Genau eine Einreichung pro Person · 2026-11-17
- **Context:** Wie viele Präsentationen eine Person einreichen darf.
- **Decision:** Maximal eine pro Name; ein erneuter Upload ersetzt die bisherige.
- **Why:** Gleiche Chancen; Pool ≈ Teilnehmerzahl.
- **Alternatives rejected:** beliebig viele; im Admin einstellbares Limit.
- **Affects:** L3, R21.

## D10 — Stack · 2026-11-17
- **Context:** Vorgabe „Backend und Frontend komplett in TypeScript“; Framework-Wahl.
- **Decision:** Frontend React + Vite (Nutzerwahl) mit Motion/Framer Motion und canvas-confetti. Backend (Vorschlag Claude, im Entwurf bestätigt): Node LTS + Fastify + Socket.IO + SQLite, npm-Workspaces mit `packages/shared` für Typen und Event-Verträge.
- **Why:** Größtes Ökosystem für übertriebene Animationen; Socket.IO bringt Reconnect und Rooms für Live-Abstimmung mit; SQLite reicht für 10–20 Leute und ist eine Datei auf dem Volume.
- **Alternatives rejected:** Svelte, Vue (Frontend). Noch offen: SQLite-Treiber (`better-sqlite3` vs. `node:sqlite`) und genaue Node-Version → bei L0/L1 entscheiden.
- **Affects:** alle Legs, R1.

## D11 — Feature-Auswahl für den Abend · 2026-11-17
- **Context:** Ideenliste für einen lustigen Abend, Nutzer hat ausgewählt.
- **Decision:** Rein: Live-Emoji-Reaktionen, QR-Lobby, Handy-Feedback, Zeitlimit mit Gong, Awards, Tipp-Netz, Avatare, Rad wählt Präsentator, Einsendeschluss-Countdown, Folien-Bewertung.
- **Why:** Auswahl des Nutzers.
- **Alternatives rejected (später vielleicht):** Sound-Effekte (außer Gong), Challenge-Karten, Vortrags-Bewertung, Reroll-Joker, Zwischenstand pro Runde, KI-Kommentator.
- **Affects:** R5, R23, R40, R42, R45, R46, R54, R63–R65.

## D12 — Repo vorerst nur lokal · 2026-11-17
- **Context:** Ordner war kein Git-Repo.
- **Decision:** `git init -b main` lokal; Remote kommt später.
- **Why:** Nutzerwahl.
- **Alternatives rejected:** GitHub-Repo sofort; anderer Ort.
- **Affects:** Commits nur über `/commit`; auf `main` nur auf ausdrückliches OK des Nutzers. Ohne GitHub-Remote kein Epic-Issue-Tracking — atlas ist das Gedächtnis.

## D13 — Rahmen: 10–20 Leute, kein Termindruck · 2026-11-17
- **Context:** Gruppengröße und Workshop-Termin.
- **Decision:** Auslegung für 10–20 Personen (Namensliste mit Avataren und Scrollen, ohne Suche; Leaderboard mit Podest + Rest). Termin offen („egal“) → kein MVP-Schnitt nötig, Etappen in Ruhe.
- **Why:** Nutzerantwort.
- **Alternatives rejected:** —
- **Affects:** L6–L8.

## D14 — Zugang und Identität · 2026-11-17
- **Context:** Wer darf was, wie weiß das Handy, wer man ist.
- **Decision:** `/admin` und `/host` teilen ein Passwort aus `ADMIN_PASSWORD`; `/submit` und `/vote` sind offen. Am Handy wird der gewählte Name nur auf dem Gerät gemerkt, ohne Sperre (Vertrauensbasis).
- **Why:** Einfachste Form, die verhindert, dass ein Handy das Spiel steuert. Spaßprojekt unter Kollegen.
- **Alternatives rejected:** Namenssperre „ein Name pro Gerät“ (nur auf Wunsch), PIN pro Person.
- **Affects:** L2, L6, L7, R10, R50.

## D15 — Anonymisierung im Detail · 2026-11-17
- **Context:** Dateien selbst können den Einreicher verraten.
- **Decision:** Original-Dateiname wird verworfen; PPTX wird nach erfolgreicher Umwandlung gelöscht; Autor/Ersteller im PDF werden geleert. HTML bleibt unverändert. Nach der Auflösung wird der Einreicher der Runde im Klartext gespeichert (dann ohnehin öffentlich; nötig für Leaderboard, Awards, Tipp-Netz).
- **Why:** PPTX-Metadaten (Autor, zuletzt geändert von) und Dateinamen würden die Pseudonymisierung aushebeln.
- **Alternatives rejected:** PPTX behalten und Metadaten im ZIP bereinigen (aufwendiger, Original wird nicht gebraucht); Klartext nie speichern (jede Auswertung müsste alle Hashes neu berechnen).
- **Affects:** L1, L3, L4, R22, R31.

## D16 — Ablaufregeln · 2026-11-17
- **Context:** Kleinere Regeln, die im Entwurf als Annahmen bestätigt wurden.
- **Decision:** Gong ist nur ein Signal, der Host schließt manuell. Uploads schließen mit dem Einsendeschluss, spätestens mit Spielstart; Limit 100 MB (env). Sterne der einreichenden Person zählen nicht (wie ihr Tipp).
- **Why:** Host behält die Kontrolle über den Abend; Pool ist ab Spielstart stabil; Selbstbewertung wäre unfair.
- **Alternatives rejected:** automatisches Schließen bei Zeitablauf.
- **Affects:** L3, L6, L7, R23, R45, R52.

## D17 — Sackgassen-Regel beim Ziehen · 2026-11-17
- **Context:** Wenn für die präsentierende Person nur noch die eigene Präsentation im Pool liegt, kann nicht gezogen werden.
- **Decision:** Im Modus „Rad wählt Präsentator“ wählt der Server Person und Präsentation gemeinsam so, dass die übrigen Personen weiterhin eine gültige Zuordnung haben. Bei manueller Wahl: Hinweis „Jemand anderes muss ziehen“.
- **Why:** Der Abend darf nicht hängen bleiben; Personen ohne Einreichung können ebenfalls präsentieren.
- **Alternatives rejected:** komplette Reihenfolge vorab festlegen (nimmt die Spontaneität).
- **Affects:** L5, L6, R42, R43.

## D18 — Vorgegebene Optik + App-Shell, Animationen frei · 2026-11-17
- **Context:** Der Nutzer hat eine Spezifikation für Optik und App-Shell als Design-Vorgabe genannt.
- **Decision:** Pribe übernimmt die Optik (Farb-Tokens hell/dunkel, Gelb-Akzent #ffd000 mit schwarzer Schrift, Typografie, Fokus-Ringe, Toasts, Breakpoints, Touch-Ziele ≥ 48 px) **und** die Shell für die Navigation (Header 48 px, Nav-Rail bzw. Bottom-Bar) auf allen vier Seiten. `/host` blendet die Shell während der Show (Ziehen bis Finale) im Vollbild aus. Animationen sind ausgenommen und bleiben frei übertrieben (R3). Die Details stehen in `DESIGN.md`.
- **Why:** Nutzerwahl. Zuerst hatte er „nur die Optik“ gewählt, dann korrigiert: „auch die Shell für die Navigation“, überall, Show im Vollbild.
- **Alternatives rejected:** nur Optik; Shell nur auf /admin bzw. /admin + /submit; Shell auch während der Show sichtbar.
- **Affects:** L0 (Shell-Komponente in P1), L2, L6–L9, R2, R3.

## D19 — Node 24 + `node:sqlite` · 2026-11-17 (P1)
- **Context:** In D10 offen geblieben: SQLite-Treiber und Node-Version.
- **Decision:** Node 24 (lokal v24.22.1, im Image dieselbe Major) mit dem eingebauten `node:sqlite`.
- **Why:** Kein natives Build auf Windows ohne Build-Tools und auf arm64; unter Node 24 ohne Warnung nutzbar.
- **Alternatives rejected:** `better-sqlite3` (natives Modul, arm64-Build im Image nötig).
- **Affects:** L1, L10 (Base-Image `node:24`).

## D20 — Admin-Session als signiertes Cookie · 2026-11-17 (P1)
- **Context:** R10/D14 legen fest, dass ein Passwort `/admin` und `/host` schützt; offen war der Mechanismus.
- **Decision:** Zustandsloses, HMAC-signiertes httpOnly-Cookie `pribe_session`: 7 Tage gültig, `SameSite=Lax`, `Secure` bei https-`PUBLIC_URL`. Der `/host`-Socket-Namespace prüft das Cookie beim Verbindungsaufbau.
- **Why:** Kein Session-Store nötig und übersteht Neustarts (R4).
- **Alternatives rejected:** serverseitige Sessions, Token im localStorage.
- **Affects:** L2, L5, L6.

## D21 — Build-Aufbau · 2026-11-17 (P1)
- **Decision:** Der Server wird mit tsup gebündelt; `@pribe/shared` bleibt reiner TS-Quellcode, den Vite und tsup mitbauen. `npm start` ist ein Prozess, der API, Socket.IO und `apps/web/dist` mit SPA-Fallback ausliefert.
- **Why:** Einfacher Prod-Start lokal und im Container.
- **Affects:** L10.

## D22 — Admin-Übersicht ohne Upload-Zeitstempel · 2026-11-17 (Orchestrator)
- **Context:** Die P1-Review merkte an, dass Upload-Zeitpunkte pro Einreichung Rückschlüsse auf den Einreicher erlauben.
- **Decision:** Die Einreichungs-Übersicht (R13) zeigt keine Zeitstempel pro Einreichung.
- **Why:** Folgt R13/R22 („ohne Einreicher“, nirgends im Klartext).
- **Affects:** L2.

## D23 — PPTX in PowerPoint öffnen statt PDF-Umwandlung · 2026-11-17 · ersetzt D03, Teile von D15
- **Context:** Der Nutzer hat nach dem P3-Bericht entschieden, dass PPTX nicht in PDF umgewandelt wird.
- **Decision:**
  - PPTX bleibt PPTX. Beim Upload werden im ZIP `docProps/core.xml` (`dc:creator`, `cp:lastModifiedBy`) und `docProps/app.xml` (`Company`, `Manager`) geleert, danach ist der Status `ready`.
  - Am Abend lädt `/host` die Datei vom geschützten Datei-Endpunkt als `<hash>.pptx` herunter. Der Hash wird pro Einreichung gebildet, nicht aus dem `owner_hash`, damit die PowerPoint-Kopfzeile nichts verrät.
  - Der Host öffnet die Datei per Klick aus der Download-Leiste und startet sie mit F5. Danach geht er zurück in den Browser und klickt „Schließen“.
  - Bei PPTX zeigt `/host` dahinter „Läuft in PowerPoint“ mit Zeitlimit, Gong und Emojis. Sichtbar ist das erst nach dem Wechsel in den Browser, der Gong bleibt hörbar.
  - Kein LibreOffice, kein pdf.js, kein PDF.
- **Why:** Nutzerwahl. Originalgetreue Folien mit Animationen, und das Image wird viel kleiner (kein LibreOffice auf dem Pi).
- **Alternatives rejected:** PDF-Umwandlung (D03); `ms-powerpoint:`-URI (unsicher, versionsabhängig); Metadaten unverändert lassen.
- **Affects:** R30–R32 (ersetzt), R44 (PDF-Teil ersetzt), R45/R46 (bei PPTX nur hinter PowerPoint sichtbar), R70 (kein LibreOffice im Image), L4, L6, L10. Voraussetzung: PowerPoint auf dem Beamer-Rechner.

## D24 — Emoji-Drosselung pro Socket-Verbindung · 2026-11-17 (P4)
- **Decision:** Token-Bucket (5, 2/s) pro Socket-Verbindung. Ein Reconnect bekommt einen neuen Bucket.
- **Why:** Reicht für einen Abend unter Kollegen (Vertrauensbasis, D14).
- **Affects:** R46, R53.

## D25 — Persönliches Passwort für Submit und Vote · 2026-11-17 · ändert D14
- **Context:** Neuer Wunsch des Nutzers: „Nachdem man angibt, wer man ist, muss man ein Passwort hinterlegen, das ab dann zum Login genutzt wird“, laut Nutzer „für alles“.
- **Decision:**
  - Das Passwort wird beim ersten Wählen des Namens festgelegt (scrypt-Hash an der Person).
  - Eine Personen-Session als signiertes Cookie gilt für `/submit` und `/vote`.
  - Der Vote-Socket nimmt die Identität aus dem Cookie.
  - Der Admin setzt Passwörter zurück; Einreichung und Thema bleiben dabei erhalten.
  - `/admin` und `/host` behalten das Admin-Passwort (D20).
- **Why:** Nutzerwahl; verhindert, dass jemand unter fremdem Namen einreicht oder tippt.
- **Alternatives rejected:** nur `/submit` geschützt; kein Zurücksetzen.
- **Affects:** R25, R50 (Namenswahl jetzt mit Login), L2, L3, L5 (Vote-Namespace), L7. Umsetzung: P2 (Server, Submit, Admin), P6 (Vote-Login als Nachtrag).

## D26 — Themen-Roulette beim Einreichen · 2026-11-17
- **Context:** Neuer Wunsch des Nutzers mit einer Liste von 18 Themen.
- **Decision:**
  - Einmaliges animiertes Rad nach dem Login auf `/submit`. Es zeigt alle 18 Themen, landet aber nur auf freien.
  - Ein vergebenes Thema fällt aus dem Pool. Ist der Pool leer, gibt es „Freies Thema“, ohne Neuauffüllen (Nutzerwahl).
  - Die Zuordnung wird unter dem HMAC der Person gespeichert (Orchestrator-Entscheid, damit Thema + Inhalt den Einreicher nicht verraten, R22).
  - Die Themen sind fest im Code.
- **Alternatives rejected:** Pool neu auffüllen; Themen im Admin editierbar (nicht angefordert).
- **Affects:** R26, R27, L3 (P2).

## D27 — Selbstregistrierung mit Einladungscode und Foto-Avatar · 2026-11-17 · ändert R5, R11, R50
- **Context:** Mit persönlichen Passwörtern (D25) hat der Nutzer gefragt, ob sich jeder selbst registrieren soll. Pribe ist öffentlich über eine Domain erreichbar.
- **Decision:**
  - Personen registrieren sich auf `/submit` und `/vote` selbst mit Name (eindeutig), Avatar und Passwort.
  - Dafür ist ein Einladungscode nötig. Der Admin legt ihn fest; Links mit `?code=` füllen ihn vor, der Lobby-QR enthält ihn.
  - Avatar ist wahlweise ein Foto (im Browser quadratisch auf ca. 256 px verkleinert, öffentlich ausgeliefert) oder Emoji + Farbe.
  - Der Admin kann Personen weiter anlegen, bearbeiten und löschen.
- **Why:** Nutzerwahl (Empfehlung angenommen). Der Code hält Fremde aus dem öffentlichen Spiel.
- **Alternatives rejected:** Selbstregistrierung ohne Code; reine Admin-Liste; Foto als Pflicht; nur Emoji.
- **Affects:** R5, R11, R40, R50, L2, L3, L6, L7, L8. Umsetzung: P2 (Server, Submit, Admin, `components/Avatar.tsx`), Nachträge in P5, P6, P7.

## D28 — Award- und Finale-Regeln · 2026-11-17 (P7)
- **Decision:**
  - Gezählt werden nur aufgelöste Runden; Schein-Tipps und Einreicher-Sterne zählen nicht.
  - Gleichstand: Alle teilen sich den Award. Ist niemand qualifiziert, steht dort „niemand“.
  - Blindgänger: 0 Treffer bei mindestens einem Tipp.
  - Pokerface: am seltensten richtig erraten (absolut), nur bei gezeigter Präsentation mit mindestens einem Tipp.
  - Herdentier: „Mehrheit“ heißt, genau eine Person hat die meisten Tipps, mindestens 2.
  - Beste Präsentation: höchster Ø. Bei Gleichstand entscheidet die Zahl der Bewertungen, sonst teilen sich beide den Titel.
  - Der Host klickt sich durch 12 Stationen (Weiter/Zurück, Pfeiltasten, Leertaste, Presenter); die Station übersteht ein Neuladen.
  - Das Handy deckt das eigene Ergebnis erst auf Tippen auf, damit es den Countdown am Beamer nicht verrät.
- **Affects:** R62–R65, L8.

## D29 — Öffentliches GitHub-Repo, Start ohne Historie · 2026-11-17 · ersetzt D12
- **Context:** Der Nutzer wollte den Stand auf `github.com/CedricSchmitter/Pribe` (öffentlich). Die lokale Historie enthielt die Firmen-Mail als Autor, interne Design-Bezüge und eine interne IP.
- **Decision:**
  - Heikle Stellen wurden entfernt (Design-Quelle neutral beschrieben, Firmenschriften aus dem Font-Stack, IP → `<LAN-IP>`, Session-IDs raus).
  - Der Stand ging als **ein** Initial-Commit ohne Historie mit der GitHub-noreply-Adresse nach `origin/main`.
  - Die lokale Vor-Historie liegt nur lokal auf dem Branch `archive/local-history`. Die Commit-Hashes in LOG und STATE beziehen sich auf sie.
- **Why:** Nutzerwahl („alles raus nehmen, was blöd ist, und als initial ohne Git-Historie pushen“).
- **Alternatives rejected:** Repo privat stellen; Historie umschreiben.
- **Affects:** Arbeitsweise. Künftig gibt es ein Remote, Commits gehen mit der noreply-Adresse auf github.com.
