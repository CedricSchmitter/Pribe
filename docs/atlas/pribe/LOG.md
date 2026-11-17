# Log: pribe

Append-only narrative. One header per session (date + drift anchor), one block per
checkpoint. Never rewritten or reordered — this is the history. The *current* picture
lives in STATE.md; this is how we got there.

---

## Session 2026-11-17 · anchor git `main` ohne Commit
- interview: Nutzer hat Pribe beschrieben (Submit, Roulette, Vote, Leaderboard, übertriebene Animationen) und sich interviewen lassen. Ergebnis: Pi des Kollegen + Domain, Docker, PPTX→PDF per LibreOffice, HMAC + Auflösung pro Runde, Abstimmung ab Start mit Countdown, Schein-Tipp ohne Punkte, 1 Punkt pro Treffer, eine Einreichung pro Person, React + Vite, 10–20 Leute, kein Termindruck, erst lokales git → D01–D13.
- ideen: 16 Ideen in vier Gruppen vorgeschlagen; 10 gewählt, 6 auf „später vielleicht“ → D11.
- entwurf: CHARTER, Etappen L0–L11 und 8 Annahmen gezeigt; Nutzer hat mit „Ja, anlegen“ bestätigt → Annahmen als D14–D17.
- mission angelegt: `git init -b main` (noch kein Commit), CHARTER mit Anforderungskatalog R1–R72, DECISIONS D01–D17, STATE mit L0 als nächster Aktion.
- session close: noch kein Code; nächster Schritt L0-Gerüst. Offene Fragen an den Kollegen (Pi/RAM, Docker, Proxy, Domain) stehen in STATE. Cold-start test passed ✓
- cold-start-test (frischer Subagent, nur docs/atlas gelesen): landet auf L0 mit derselben Prüfung, keine Widersprüche. Nachgeschärft: R43 im CHARTER sagt jetzt, dass auch Personen ohne Einreichung präsentieren dürfen; L9/L10/L11 referenzieren R2, R71 und die Definition of Done.

## Session 2026-11-17 (Orchestrator) · anchor git `main` @ 1d20c52
- LOCK der Planungs-Session übernommen (Nutzer-Freigabe). Node v24.22.1 auf PATH.
- Nutzer-Auftrag: L0–L9 komplett, L10 ohne Docker vorbereiten, am Ende App lokal im Prod-Modus mit Demo-Daten. Ablauf ohne GitHub: Paket-Sessions in Worktrees, Orchestrator merged lokal `--no-ff`, Subagent-Prüfung vor/nach Merge.
- Paketschnitt P1–P10 wie vom Nutzer empfohlen, angepasst: Auth, ConversionQueue-Schnittstelle und Prod-Auslieferung in P1; geschützter Datei-Endpunkt in P3. Alle zehn Sessions gestartet, P2–P10 mit Warte-Anweisung.
- design: Der Nutzer hat eine Design-Spezifikation (Optik + App-Shell) als Vorgabe genannt. Erst wählte er „nur Optik“, dann korrigierte er auf „Optik + Shell überall, Show im Vollbild“ → D18 und `DESIGN.md`. Die Shell baut P1 mit; die UI-Pakete wurden informiert.
- P1 Fundament gemerged (7709437, Branch f1f819b). Die Gate-Prüfung per Subagent war grün: 32 Tests, Build ok, alle Scope-Punkte abgedeckt. Entscheidungen → D19–D21; D22 (keine Upload-Zeitstempel in der Admin-Übersicht) aus der P1-Review. P2, P3 und P4 sind freigegeben.
- P4 Echtzeit-Kern gemerged (478017d): 54 Tests, Gate und Nachprüfung auf main grün. Kleiner Zweifel: Emoji-Drosselung pro Socket statt pro Gerät → D24. P6 ist freigegeben.
- Anforderungswechsel durch den Nutzer: keine PDF-Umwandlung. PPTX wird als `<hash>.pptx` in PowerPoint geöffnet, Metadaten werden beim Upload geleert, Timer und Emojis bei PPTX nur hinter PowerPoint → D23 (ersetzt D03, R30–R32, PDF-Teil von R44, LibreOffice in R70). P3-Branch 1ef32d7 wird nicht gemerged, P3 baut um. P2, P5, P7, P9 und P10 sind informiert.
- P3 (umgebaut auf D23) gemerged (1aac325): 61 Tests, Gate grün. P5 und P9 sind freigegeben.
- Neuer Wunsch des Nutzers: persönliches Passwort „für alles“ (Admin setzt zurück) → D25, R25. Themen-Roulette mit 18 Themen, ohne Neuauffüllen („Freies Thema“) → D26, R26/R27. Umsetzung durch P2 als Zusatzauftrag, den Vote-Login macht P6 als Nachtrag.
- P3 auch auf main nachgeprüft (61 Tests grün). Nutzer: Selbstregistrierung mit Einladungscode, Foto-Avatar mit Emoji als Ersatz → D27, R28. P2 baut das mit; P5 und P6 rendern Avatare zentral, damit sie nach dem P2-Merge auf `components/Avatar.tsx` umstellen können.
- Gemerged: P6 (314606f, 54 Tests), P9 (3b58381, Dockerfile ohne LibreOffice; Image ungeprüft), P5 (9b39b6b, 63 Tests). Nachprüfung auf main grün: Typecheck, Web- und Server-Build, Prod-Smoke `/api/health`, `/host` und `/vote` geben 200. P7 ist freigegeben.
- P2 gemerged (b1f66fb, 102 Tests, Gate grün, keine Konflikte). Folge: Der Vote-Socket verlangt jetzt das Personen-Cookie. P6 bekommt deshalb den Nachtrag Login/Registrierung + Avatar, P5 den Nachtrag Avatar + Einladungscode im QR. P7 nutzt `components/Avatar.tsx`.
- Nachträge gemerged: P5 (0f75217: Foto-Avatar, Einladungscode im QR) und P6 (fc4dd9a: Vote-Login und Registrierung). Gate grün, keine Konflikte. Nachprüfung auf main: 105 Tests, Build grün, Socket-Smoke-Test (registrieren → Cookie `pribe_person` → `/vote`-Snapshot ohne `NOT_IDENTIFIED`).
- P7 Finale gemerged (69b6ed2): 121 Tests, Gate grün; Award-Regeln → D28. P8 ist freigegeben. P10 ist vorgezogen parallel freigegeben: Es fixt nur Server/shared/Tests, Web-Fehler meldet es an den Orchestrator (P8 arbeitet dort). Am Ende macht P10 noch einmal `git merge main`.
- P8 Animationen gemerged (0443c12): Gate grün, nur `apps/web`, `fx/`-Bausteine, kein neuer Sound. Nachprüfung auf main: 122 Tests, Build grün; Web-Bundle 689 kB (Warnung). P10 holt main und darf jetzt auch Web-Fixes machen. Für die Browser-Prüfung muss das P10-Fenster sichtbar sein (rAF läuft sonst nicht); der Nutzer wurde gebeten, es zu öffnen.
- P10 gemerged (a8a94c6). E2E-Test mit echtem Server, Host und 5 Handys, inkl. Neustart, Sackgasse, Schein-Tipp, Finale und Namensfreiheit. Fix: R14 (Reset bzw. Änderungen pushen den Zustand). Den E2E-Port hat P10 auf einen OS-vergebenen umgestellt. Browser-Klickprüfung ausgelassen, weil das Fenster nicht sichtbar war.
- Schluss auf main: `npm ci`, 124 Tests und Build grün. `.env` mit generiertem Admin-Passwort, `npm run demo:seed` ok (beide PPTX ohne Autor, Download-Name = Hash). `npm start` läuft auf :3000. `/admin`, `/submit`, `/host`, `/vote` geben 200, auch über die LAN-IP <LAN-IP>; `/vote` zeigt Login mit 8 Demo-Personen.
- Session-Checkpoint: L0–L10 erledigt (L10 ohne Docker vorbereitet, Image ungeprüft). Nächster Schritt: gemeinsamer Test, dann L11 Generalprobe. Cold-start-Test: STATE führt auf dieselbe nächste Aktion ✓
- GitHub: Der Nutzer wollte einen PR auf `github.com/CedricSchmitter/Pribe`. Das Repo ist öffentlich und war leer. Interne Bezüge wurden bereinigt, der Stand ging als ein Initial-Commit `2d7c569` ohne Historie nach `origin/main` → D29. Die lokale Vor-Historie liegt auf `archive/local-history`. gh lief über einen temporären Login (`GH_CONFIG_DIR=%TEMP%\gh-pribe`), der danach gelöscht wurde; das globale gh bleibt nur bei der Enterprise-Instanz angemeldet.

- Welle 2: Nach dem ersten gemeinsamen Test ("es war funny") wählte der Nutzer R80–R89 → D30. Schnitt in Q1–Q6, Q1–Q4 parallel gestartet. Die zehn P-Sessions wurden auf Wunsch des Nutzers archiviert.
- Welle 2 gemerged: Q2 (7d85ea4, Vorschau), Q1 (9f69df2, Login-Sperre mit `TRUST_PROXY` + drei Reset-Wege), Q4 (9fb6969, `/remote` + „Du präsentierst!“ + Finale-Station serverseitig), Q3 (b81a2de, Vortrags-Sterne + Rampensau, Emoji-Combo serverseitig in `game/combo.ts`, Foto-Wand). Gates grün. Q3 hat die Konflikte mit Q1 und Q4 selbst gelöst. Nachprüfung nach Q1/Q2/Q4: 145 Tests grün. Q5 ist freigegeben.
- Q5 Probelauf gemerged (5027590): Probelauf mit separatem `DATA_DIR/probelauf`, 5 Server-Bots, Banner; das Dockerfile kopiert `demo/` ins Image. Nachprüfung: 158 Tests und Build grün. Q6 ist freigegeben.
