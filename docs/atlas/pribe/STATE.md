# State: pribe

Curated current position — the SINGLE SOURCE OF TRUTH. Rewritten on every checkpoint;
keep it scannable in one read (curate, don't accrete). Resolved detail moves down into
LOG.md. Map symbols: `[ ]` open · `[~]` in progress · `[x]` done · ♻️ possibly stale
(code changed) · ⏭️ dropped (with reason).

Updated: 2026-11-18 · session 3 (Orchestrator) · drift-anchor: git `main` @ 10cc0ce

## Mental model
Pribe ist PowerPoint-Karaoke mit Ratespiel: Jeder reicht vorher anonym eine Präsentation
ein, am Abend zieht der Beamer der präsentierenden Person eine fremde, und alle tippen am
Handy, wer sie eingereicht hat. Drei Oberflächen hängen an **einem servergeführten
Spielzustand** (Socket.IO): `/host` auf dem Beamer treibt den Ablauf
(Lobby → Ziehen → Präsentieren → Countdown → Auflösung → … → Finale), `/vote` auf den
Handys folgt, `/admin` konfiguriert, `/submit` sammelt vorher ein. Knackpunkt 1 ist die
**Pseudonymisierung**: Einreichungen tragen nur `HMAC(personId, Secret)`; „nicht die
eigene“ und „Tipp richtig?“ sind Hash-Vergleiche, erst die Auflösung schreibt den Namen
einer Runde im Klartext (D05, D15). Knackpunkt 2 ist der **Raspberry Pi**: die
LibreOffice-Umwandlung ist langsam und speicherhungrig, deshalb asynchron beim Upload und
nie während der Show (D03). Knackpunkt 3 ist die **Sackgasse beim Ziehen** (nur noch die
eigene im Pool, D17). Lokal (Windows, ohne Admin-Rechte) gibt es kein Docker und noch kein
LibreOffice — Umwandlung ist lokal nur mit portablem LibreOffice testbar.
Anforderungen R1–R72 stehen in CHARTER.md, Entscheidungen D01–D18 in DECISIONS.md, die
Design-Vorgaben (Optik + Shell-Navigation, Animationen frei) in DESIGN.md.

## Map / legs
- [x] **L0 Gerüst** (P1, gemerged 7709437) — npm-Workspaces `apps/server`, `apps/web`, `packages/shared`; TS-Basis, Vitest, `npm run dev`, Prod-`npm start` (R1)
- [x] **L1 Datenmodell** (P1, `node:sqlite`, D19) — SQLite, Dateiablage unter `DATA_DIR` (R4, R22, D15)
- [x] **L2 Admin** (P2, gemerged b1f66fb) — Login, Personen, Einstellungen inkl. Einladungscode, Übersicht ohne Namen/Zeitstempel, Reset, Passwort-Reset (R5, R10–R14, D22, D25, D27)
- [x] **L3 Submit** (P2, gemerged b1f66fb) — Registrierung mit Code + Foto/Emoji, Passwort, Themen-Roulette, Upload, Ersetzen, Sperre, Status (R20–R28, D25–D27)
- [x] **L4 PPTX-Aufbereitung** (D23; P3, gemerged 1aac325) — Metadaten im ZIP leeren, Datei-Endpunkt mit `<hash>.pptx`-Download
- [x] **L5 Echtzeit-Kern** (P4, gemerged 478017d) — Zustandsautomat, Resync, Ziehen inkl. Sackgasse, Wertung; Vote-Identität per Personen-Cookie (P2)
- [x] **L6 Host/Beamer** (P5, gemerged 9b39b6b) — QR-Lobby, Rad, Ziehen, HTML-iframe / PPTX-Download, Zeitlimit + Gong, Emojis, Auflösung; Nachtrag Foto-Avatar + Code im QR gemerged 0f75217
- [x] **L7 Vote/Handy** (P6, gemerged 314606f) — Tipp + Sterne, Emojis, Grün/Rot, Wartezustände; Nachtrag Login/Registrierung + Avatar gemerged fc4dd9a
- [x] **L8 Finale** (P7, gemerged 69b6ed2, D28) — Leaderboard mit Podest, Awards, Tipp-Netz, Beste Präsentation (R62–R65)
- [x] **L9 Animationsdurchgang** (P8, gemerged 0443c12) — alles übertrieben, Layouts nachschärfen (R2, R3); Animationen frei von D18
- [x] **L10 Deployment vorbereitet** (P9, gemerged 3b58381) — Dockerfile ohne LibreOffice, Compose, `.env.example`, `docs/betrieb.md`; **Image ungebaut, ungeprüft** (kein Docker lokal)
- [ ] **L11 Generalprobe** — echte iPhones + Android über die Domain, 3–4 Leute, Beispiel-Präsentationen (HTML + PPTX); Abnahme gegen „Definition of done“ im CHARTER

## Open threads / unknowns
- **Kollege (blockiert Betrieb):** Pi-Modell/RAM, 64-bit-OS + Docker, Reverse Proxy (HTTPS, WebSocket-Upgrade, Upload ≥ 100 MB), Domain. Steht auch in `docs/betrieb.md`.
- **PowerPoint auf dem Beamer-Rechner** ist seit D23 Voraussetzung. In der Generalprobe (L11) prüfen: Download → Öffnen → F5 → zurück in den Browser.
- **Ungeprüft im Browser:** den Gong hat niemand gehört; das Sandbox-iframe blockiert im eingebauten Browser (P5). iOS-Vibration ist vermutlich nicht verfügbar.
- **Nicht von außen geprüft:** Ob die Windows-Firewall eingehende Verbindungen auf Port 3000 (echte Handys im LAN) zulässt. Lokal antworten alle Routen auch über die LAN-IP. Ohne Admin-Rechte lässt sich keine Regel anlegen; sonst die Handy-Ansicht im Browser testen.
- **Browser-Klickprüfung auf main** ist offen: Im versteckten Browser-Pane laufen keine Animationen (rAF), deshalb nur Text/HTTP geprüft. Die Paket-Sessions haben jeweils im Browser geprüft.
- Kleinkram: Login ohne Rate-Limit (nicht angefordert); Web-Bundle > 500 kB; Backup-Befehle in `betrieb.md` setzen den Volume-Namen `pribe_pribe-data` voraus; ein Reset löscht die Themen-Zuordnungen nicht.
- Die Bash-Shell hing hier bei einfachen Befehlen; PowerShell/Read funktionieren.

## Orchestrierung (Session 2, seit 2026-11-17)
Eine Orchestrator-Session verteilt die Pakete auf Paket-Sessions in eigenen Worktrees und merged
sie lokal per `git merge --no-ff` nach `main` (Nutzer-Freigabe). Nur der Orchestrator pflegt
`docs/atlas`. Vor und nach jedem Merge prüft ein Subagent Tests + Build.

| Paket | Ports | Stand |
|---|---|---|
| P1 Fundament | 4101/4201 | gemerged 7709437 |
| P2 Admin + Submit (+ D25–D27) | 4102/4202 | gemerged b1f66fb |
| P3 PPTX-Aufbereitung (D23) | 4103/4203 | gemerged 1aac325 |
| P4 Echtzeit-Kern | 4104/4204 | gemerged 478017d |
| P5 Beamer | 4105/4205 | gemerged 9b39b6b + 0f75217 |
| P6 Handy | 4106/4206 | gemerged 314606f + fc4dd9a |
| P7 Finale | 4107/4207 | gemerged 69b6ed2 |
| P8 Animationen | 4108/4208 | gemerged 0443c12 |
| P9 Deploy-Vorbereitung | 4109 | gemerged 3b58381 |
| P10 Gesamttest + Demo-Daten | 4110/4210 | gemerged a8a94c6 (E2E mit 5 Handys, `npm run demo:seed`) |

**Lokaler Prod-Lauf (seit 2026-11-17):**
- Aus dem `main`-Checkout gestartet mit `npm start` auf Port 3000, `PUBLIC_URL=http://<LAN-IP>:3000`.
- `.env` liegt im Repo-Root und ist gitignored; dort steht das generierte `ADMIN_PASSWORD`.
- Demo-Daten: 8 Personen, Passwort `demo`, Einladungscode `PRIBE-DEMO`.

## Welle 2 (R80–R89, D30) — Orchestrator merged lokal, Push nach github.com am Ende (Nutzer meldet sich kurz an, D29)
| Paket | Inhalt | Ports | wartet auf | Stand |
|---|---|---|---|---|
| Q1 Admin-Sicherheit + Reset | R87, R88 | 4111/4211 | – | gemerged 9f69df2 |
| Q2 Submit-Vorschau | R81 | 4112/4212 | – | gemerged 7d85ea4 |
| Q3 Show-Extras | R84 Vortrags-Bewertung + Rampensau, R85 Emoji-Combo, R86 Foto-Wand | 4113/4213 | – | gemerged b81a2de |
| Q4 Fernbedienung + „Du präsentierst!“ | R80, R82 | 4114/4214 | – | gemerged 9fb6969 |
| Q5 Probelauf-Modus | R83 | 4115/4215 | Q1, Q3 | gemerged 5027590 |
| Q6 Code-Splitting + Gesamttest-Update | R89, E2E/Demo um Welle 2 erweitern | 4116/4216 | alle | gemerged 2a3656e |

## Welle 3 (R90–R91) — Orchestrator merged lokal nach Freigabe des Nutzers (2026-11-18)
| Paket | Inhalt | Ports | Stand |
|---|---|---|---|
| Q7 Überraschungsgast | R90 (R91 Beenden verworfen) | 4117/4217 | gemerged 10cc0ce |

R91 verworfen: „zurück in die Lobby“ hätte Uploads, Personen-Löschen und weiteres Ziehen wieder geöffnet. Entscheidungen → D31. Ungeprüft: Gast im Probelauf im Browser, PPTX-Gast am Beamer, Enthüllungs-Titel in 1920×1080.

## Next concrete action
Welle 3 (R90) ist auf main (10cc0ce). Als Nächstes die App auf :3000 neu bauen und neu starten (neue Migration), den Gast gemeinsam testen und für den Push den temporären github.com-Login vom Nutzer holen. Danach folgt L11 Generalprobe.
## Terrain (working set)
- `docs/atlas/pribe/` — Missionsgedächtnis (CHARTER = R.., DECISIONS = D.., DESIGN = Optik/Shell)
- `apps/server/src/` — `game/` (Echtzeit), `conversion/` (PPTX-Bereinigung), `routes/` (admin, submit, person, files, host), `db/`
- `apps/web/src/` — `pages/{admin,submit,host,vote}`, `shell/`, `components/Avatar.tsx`
- `packages/shared/src/` — Verträge, DTOs, Themen (`topics.ts`)
- `Dockerfile`, `docker-compose.yml`, `.env.example`, `docs/betrieb.md`
