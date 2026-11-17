# Pribe betreiben (Raspberry Pi, Docker)

> **Ungeprüft:** Das Docker-Image wurde bisher **nicht gebaut**, weil auf dem Entwicklungsrechner kein Docker verfügbar ist.
> Geprüft wurde nur: `npm ci`, `npm run build` und der Start der gebauten App mit nur Produktions-Dependencies (Port 4109, `/api/health` antwortet).
> Der erste `docker compose up -d --build` auf dem Pi ist also zugleich der erste Test des Dockerfiles. Auch `docker-compose.yml` wurde nicht von Docker geprüft.

Pribe ist ein einziger Container: Node 24 mit der App (API, Socket.IO und Weboberfläche). Es gibt keine Datenbank-Software und keine Umwandlung: PowerPoint-Dateien werden nur im ZIP von Metadaten bereinigt und am Beamer-Rechner in PowerPoint geöffnet. Daten (SQLite + hochgeladene Dateien) liegen auf dem Volume `/data`.

## Offene Fragen an den Kollegen

1. **Welches Pi-Modell, wie viel RAM?** (Node + SQLite brauchen wenig; ungeprüft: für 10–20 Personen reichen vermutlich 1 GB.)
2. **64-bit-Betriebssystem und Docker (mit Compose-Plugin) vorhanden?** Das Image ist `arm64`; mit einem 32-bit-OS läuft es nicht.
3. **Reverse Proxy:** Welcher? Er muss HTTPS bieten, den **WebSocket-Upgrade** für `/socket.io` durchlassen und **Uploads bis mindestens 100 MB** erlauben (Beispiele unten).
4. **Domain-Name**, unter dem Pribe erreichbar sein soll (wird `PUBLIC_URL`).

## Voraussetzungen

- Raspberry Pi mit 64-bit-OS, Docker und `docker compose`.
- Domain, die auf den Pi zeigt, Reverse Proxy mit HTTPS.
- Den Projektordner (git clone oder kopiert) auf dem Pi.

## Konfiguration

```bash
cp .env.example .env
```

In `.env` setzen:

| Variable | Bedeutung |
| --- | --- |
| `ADMIN_PASSWORD` | Passwort für `/admin` und `/host` |
| `PRIBE_SECRET` | Schlüssel der Pseudonymisierung, mindestens 16 Zeichen. **Nach dem ersten Start nicht ändern.** |
| `PUBLIC_URL` | öffentliche Adresse, z. B. `https://pribe.example.org` (Basis für den QR-Code) |
| `MAX_UPLOAD_MB` | Upload-Limit, Standard 100 |
| `HOST_PORT` | Port auf dem Pi (nur 127.0.0.1), Standard 4109 |
| `LOG_LEVEL` | optional, Standard `info` |

`PORT` und `DATA_DIR` setzt `docker-compose.yml` im Container fest (3000 und `/data`).

Passwort und Secret erzeugen (zufällig, ohne Sonderzeichen-Probleme):

```bash
openssl rand -hex 16   # ADMIN_PASSWORD
openssl rand -hex 32   # PRIBE_SECRET
```

## Start, Update, Logs

```bash
docker compose up -d --build   # bauen und starten (das Bauen auf dem Pi dauert einige Minuten)
docker compose ps              # Status; "healthy" nach ca. 20 s
docker compose logs -f pribe   # Logs
docker compose down            # stoppen (Daten bleiben im Volume)
```

**Update:** neuen Stand holen (`git pull` oder Ordner kopieren, `.env` bleibt), dann erneut `docker compose up -d --build`. Das Volume `pribe-data` bleibt erhalten. Vor einem Update ein Backup machen.

Test: `curl http://127.0.0.1:4109/api/health` auf dem Pi liefert `{"status":"ok",…}`.

## Backup und Restore

Am sichersten und einfachsten: Container kurz stoppen, damit die SQLite-Datei konsistent ist.

```bash
docker compose stop
docker run --rm -v pribe_pribe-data:/data -v "$PWD":/backup debian:bookworm-slim tar czf /backup/pribe-backup.tgz -C /data .
docker compose start
```

Restore (überschreibt den Inhalt des Volumes):

```bash
docker compose stop
docker run --rm -v pribe_pribe-data:/data -v "$PWD":/backup debian:bookworm-slim sh -c "rm -rf /data/* && tar xzf /backup/pribe-backup.tgz -C /data && chown -R 1000:1000 /data"
docker compose start
```

Der Volume-Name ist `<Projektordner>_pribe-data` (hier angenommen: Ordner `pribe`); `docker volume ls` zeigt ihn. Ungeprüft: Die Befehle wurden nicht ausgeführt.

## Reverse Proxy

Der Container lauscht nur auf `127.0.0.1:4109`. Der Proxy muss HTTPS terminieren, `/socket.io` als WebSocket durchreichen und große Uploads erlauben.

**Caddy** (WebSocket-Upgrade und HTTPS sind automatisch; Request-Body-Limit erhöhen):

```caddy
pribe.example.org {
    request_body {
        max_size 120MB
    }
    reverse_proxy 127.0.0.1:4109
}
```

**nginx** (TLS-Zertifikat z. B. per certbot):

```nginx
server {
    listen 443 ssl;
    server_name pribe.example.org;
    # ssl_certificate / ssl_certificate_key hier eintragen

    client_max_body_size 120m;

    location / {
        proxy_pass http://127.0.0.1:4109;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 3600s;
    }
}
```

Die Beispiele sind ungeprüft. Wichtig: das Proxy-Limit (120 MB) liegt über `MAX_UPLOAD_MB` (100), damit Pribe die Fehlermeldung selbst anzeigt.

## Hinweise für den Pi

- Pribe braucht im Betrieb wenig RAM; ein `mem_limit` in `docker-compose.yml` ist als Kommentar vorbereitet.
- Das Bauen des Images (`npm ci`, Vite-Build) ist der speicherhungrigste Schritt. Bei wenig RAM hilft ein Swap-File oder das Bauen auf einem anderen arm64-Gerät.
- Ein Backup der Daten liegt am besten nicht nur auf der SD-Karte.
