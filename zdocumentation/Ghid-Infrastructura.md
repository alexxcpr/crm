# Ghid Infrastructură Moduvis

Acest document acoperă pașii necesari pentru a porni infrastructura Moduvis în două scenarii:

- **Testare locală** — backend și frontend rulate direct pe localhost (fără Docker Compose)
- **VPS / producție** — toate serviciile orchestrate cu Docker Compose, accesibile prin domeniu real cu HTTPS

---



# Partea 1 — Testare locală (localhost)

**Abordare hibridă recomandată:** PostgreSQL și n8n rulează prin Docker (identic cu producția), iar backend-ul și frontend-ul rulează nativ cu hot reload (development rapid).

```
Postgres ─── Docker  (același container ca în producție)
n8n ──────── Docker  (același container ca în producție)
Backend ──── npm run dev  (hot reload, port 4000)
Frontend ─── pnpm dev      (hot reload, port 3000)
```

**De ce hibrid și nu full Docker Compose local:**

| Problemă | Impact |
|----------|--------|
| **Rebuild la fiecare schimbare** | 30-60 secunde vs 1-2 secunde cu hot reload |
| **Docker pe Windows e lent** | I/O pe volume mounts e de 3-5x mai slab ca nativ |
| **Debugging dificil** | Fără source maps directe, fără atașare ușoară de debugger |

**Ce rămâne identic cu producția:**

- PostgreSQL — același container, aceleași baze, aceleași credentiale
- n8n — același container, aceeași configurare
- Conexiunile între servicii — backend → Postgres pe `localhost:5433`, backend → n8n pe `localhost:5678`

**Ce diferă față de producție:**

- Nu ai Traefik (nu e nevoie de reverse proxy pe localhost)
- Nu ai HTTPS (localhost e considerat secure de browser)
- Backend-ul și frontend-ul rulează cu hot reload, nu build-ul de producție

---

## 1.1 — Cerințe

| Software                               | Versiune minimă | Verificare         |
| -------------------------------------- | --------------- | ------------------ |
| **Node.js**                            | 22.x            | `node --version`   |
| **npm**                                | 10.x            | `npm --version`    |
| **pnpm**                               | 9.x             | `pnpm --version`   |
| **Docker Desktop** (sau doar `docker`) | recent          | `docker --version` |

> Nu ai nevoie de PostgreSQL instalat local — îl pornim prin Docker.

---

## 1.2 — Pornește PostgreSQL (Docker)

Din folderul `server/`:

```powershell
cd server
npm run db-dev-up
```

Aceasta pornește un container `postgres:16` cu:

- Port host: `5433` (nu intră în conflict cu un Postgres local)
- User: `base_user`
- Parolă: `1234`
- Baze create automat: `devdb`, `meta`, `n8n_db`

Verifică:

```powershell
docker ps
# containerul moduvis-postgres ar trebui să fie "healthy"
```

---

## 1.3 — Variabile de mediu

### Backend (`server/.env`)

Fișierul există deja în repo, configurat pentru portul `5433`. Dacă ai nevoie de alt port, ajustează:

```ini
DATABASE_URL="postgresql://base_user:1234@localhost:5433/devdb?schema=public"
DB_HOST="localhost"
DB_PORT=5433
DB_USER="base_user"
DB_PASSWORD="1234"
DEFAULT_TENANT_SLUG="dev"
DEFAULT_TENANT_DB="devdb"
META_DB="meta"
JWT_SECRET="orice-string-lung"
FRONTEND_URL="http://localhost:3000"
N8N_API_URL="http://localhost:5678"
```

### Frontend (`client/.env`)

```ini
NUXT_PUBLIC_API_BASE="/api"
NUXT_PUBLIC_AUTH_BASE_URL="/api"
NUXT_API_BASE_INTERNAL="http://localhost:4000/api"
```

> `NUXT_API_BASE_INTERNAL` e folosit de server-side rendering (SSR) pentru a apela backend-ul direct.

---

## 1.4 — Instalează dependențe

```powershell
cd server
npm install

cd ../client
pnpm install
```

---

## 1.5 — Rulează migrațiile

Toate comenzile se rulează din folderul `server/`:

```powershell
cd server

# 1. Migrații meta DB (registry-ul de tenanți)
npm run db:migrate:meta

# 2. Migrații tenant DB (tabelele Moduvis per tenant)
npm run db:migrate
```

Ce se întâmplă:

- **Meta migration** creează tabela `tenants` în baza `meta` — aici se înregistrează fiecare tenant
- **Tenant migration** creează toate tabelele Moduvis (`user`, `role`, `entity`, `field`, `module`, etc.) în baza `devdb` și seed-uiește adminul default

Dacă ai nevoie de un reset complet:

```powershell
npm run db:reset
```

---

## 1.6 — Pornește backend-ul

```powershell
cd server
npm run dev
```

Backend-ul pornește pe `http://localhost:4000` cu hot reload. Verifică:

```powershell
curl http://localhost:4000/api/health
# răspuns: {"status":"ok","db":"connected"}
```

---

## 1.7 — Pornește frontend-ul

```powershell
cd client
pnpm dev
```

Frontend-ul pornește pe `http://localhost:3000` cu hot reload (HMR).

---

## 1.8 — (Opțional) Pornește n8n

Dacă ai nevoie de workflow-uri. Containerul se conectează la același Postgres:

```powershell
docker run -d `
  --name n8n-dev `
  -p 5678:5678 `
  -e N8N_BASIC_AUTH_ACTIVE=true `
  -e N8N_BASIC_AUTH_USER=admin `
  -e N8N_BASIC_AUTH_PASSWORD=admin123 `
  -e N8N_ENCRYPTION_KEY=un-minim-32-de-caractere-aici-ok `
  -e DB_TYPE=postgresdb `
  -e DB_POSTGRESDB_HOST=host.docker.internal `
  -e DB_POSTGRESDB_PORT=5433 `
  -e DB_POSTGRESDB_DATABASE=n8n_db `
  -e DB_POSTGRESDB_USER=base_user `
  -e DB_POSTGRESDB_PASSWORD=1234 `
  -v n8n_data:/home/node/.n8n `
  n8nio/n8n:latest
```

n8n va fi accesibil la `http://localhost:5678`.

---

## 1.9 — Provisionează tenant-ul implicit

După ce backend-ul și baza de date rulează:

```powershell
cd server
npm run tenant:provision -- --slug=dev --plan=starter --admin-email=admin@moduvis.local --admin-password=admin123
```

> **Notă:** Migrația de seed (`20260428000002_seed_defaults.ts`) creează deja un admin default (`admin@moduvis.local` / `admin123`) automat când rulezi `npm run db:migrate`. Provisioning-ul e necesar doar dacă vrei să adaugi tenant-ul în registry-ul `meta` explicit sau pentru tenanți noi.

---

## 1.10 — Accesează aplicația


| Componentă   | URL                                |
| ------------ | ---------------------------------- |
| Frontend     | `http://localhost:3000`            |
| Backend API  | `http://localhost:4000/api`        |
| Health check | `http://localhost:4000/api/health` |
| n8n          | `http://localhost:5678`            |


Autentificare: `admin@moduvis.local` / `admin123`

---

## 1.11 — Comenzi utile pentru development

```powershell
# Reset complet bază de date dev
cd server
npm run db-dev-restart    # oprește containerul, îl repornește, rulează migrațiile

# Rulează migrațiile pe toți tenanții înregistrați
npm run tenant:migrate-all

# Provisionează un tenant nou
npm run tenant:provision -- --slug=acme --plan=starter --admin-email=admin@acme.com --admin-password=secure123
```

---



# Partea 2 — Configurare și rulare pe VPS

Această variantă pornește toate serviciile într-un stack Docker Compose, cu Traefik ca reverse proxy și Let's Encrypt pentru HTTPS. Fiecare tenant este accesibil la subdomeniul lui (`slug.domeniu.ro`).

## 2.1 — Cerințe pe VPS


| Software           | Versiune    | Verificare               |
| ------------------ | ----------- | ------------------------ |
| **Docker**         | 24+         | `docker --version`       |
| **Docker Compose** | v2 (plugin) | `docker compose version` |
| **Git**            | recent      | `git --version`          |


Arhitectura recomandată: **Ubuntu 22.04 sau 24.04**, minim 2 GB RAM, 20 GB disk.

---

## 2.2 — Structura serviciilor pe VPS

```
Internet (80/443)
      │
      ▼
  Traefik (reverse proxy)
      │
      ├── /api/*   ──► backend:4000  (NestJS)
      │
      └── /*       ──► frontend:3000 (Nuxt)
                         │
                         └── SSR calls ──► backend:4000 (intern)

  postgres:5432 (intern, neexpus)
  n8n:5678      (intern, neexpus)
```

---

## 2.3 — Structura folderelor pe VPS

După clonare și configurare, structura pe VPS va arăta așa:

```
/
├── opt/
│   └── moduvis/              ← aplicația (repo-ul clonat)
│       ├── client/           ← frontend Nuxt
│       ├── server/           ← backend NestJS
│       │   ├── migrations/   ← migrații Knex (meta + tenant)
│       │   ├── src/          ← codul sursă
│       │   ├── knexfile.ts   ← configurare conexiuni DB
│       │   └── package.json
│       ├── docker/           ← tot ce ține de Docker
│       │   ├── docker-compose.yml
│       │   ├── .env          ← variabile de producție
│       │   ├── traefik/
│       │   └── init-meta-db.sql
│       └── zdocumentation/   ← documentația
│
├── var/lib/docker/volumes/   ← date persistente Docker
│   ├── postgres_data/        ← bazele de date
│   ├── n8n_data/             ← workflows n8n
│   └── traefik_letsencrypt/  ← certificatele TLS
│
├── etc/                      ← configurări sistem
├── home/                     ← home directories useri
└── tmp/                      ← fișiere temporare
```

**Ce e important de reținut:**

| Cale | Ce conține |
|------|-----------|
| `/opt/moduvis/` | Repo-ul clonat — tot codul aplicației |
| `/opt/moduvis/docker/.env` | Variabilele de mediu pentru producție |
| `/opt/moduvis/docker/docker-compose.yml` | Definiția serviciilor Docker |
| `/var/lib/docker/volumes/` | Datele persistente (DB, n8n, certificate) |

> `/opt` este o convenție Linux pentru aplicații instalate manual — echivalentul lui `C:\Program Files` pe Windows. Poți folosi orice altă locație (ex: `/home/user/moduvis`, `/srv/moduvis`), atâta timp cât rămâne consecventă în toate comenzile.

---

## 2.4 — DNS Cloudflare

Înainte de orice, configurează DNS-ul.

### 2.4.1 — Creează înregistrări DNS

În dashboard-ul Cloudflare, adaugă:


| Tip | Nume           | Conținut   | TTL             |
| --- | -------------- | ---------- | --------------- |
| `A` | `*.domeniu.ro` | `<IP_VPS>` | Auto            |
| `A` | `domeniu.ro`   | `<IP_VPS>` | Auto (opțional) |


Înlocuiește `domeniu.ro` cu domeniul tău real.

### 2.4.2 — Creează API token Cloudflare

Traefik are nevoie de un token pentru DNS-01 challenge (Let's Encrypt wildcard).

1. Mergi la [Cloudflare Dashboard → API Tokens](https://dash.cloudflare.com/profile/api-tokens)
2. Creează un token cu permisiunile:
  - `Zone` — `Read`
  - `DNS` — `Edit`
3. Scope: doar zona domeniului tău (ex: `stanciulescu.xyz`)
4. Copiază token-ul generat — va fi setat în `CF_DNS_API_TOKEN`

---

## 2.5 — Clonează repo-ul pe VPS

```bash
git clone <repo-url> /opt/moduvis
cd /opt/moduvis
```

---

## 2.6 — Configurează `.env`

```bash
cd docker
cp .env.example .env
```

Editează `docker/.env` cu valori reale. Iată ce trebuie modificat obligatoriu:

```ini
# ── Domeniu ──
DOMAIN_BASE=stanciulescu.xyz          # înlocuiește cu domeniul tău real
TENANT_HOST_REGEXP=^.+\.stanciulescu\.xyz$
ACME_EMAIL=admin@stanciulescu.xyz     # email valid pentru notificări Let's Encrypt

# ── Token Cloudflare ──
CF_DNS_API_TOKEN=tokenul-generat-mai-sus

# ── Securitate ──
JWT_SECRET=un-secret-lung-de-minim-32-caractere-generat-aleatoriu
DB_PASSWORD=parola-puternica-pentru-postgres
DB_ADMIN_USER=base_user               # user cu drept de CREATE DATABASE
DB_ADMIN_PASSWORD=parola-puternica-pentru-postgres

# ── Tenant implicit ──
DEFAULT_TENANT_SLUG=dev
DEFAULT_TENANT_DB=devdb
META_DB=meta

# ── n8n ──
N8N_BASIC_AUTH_USER=admin
N8N_BASIC_AUTH_PASSWORD=parola-puternica-pentru-n8n
N8N_ENCRYPTION_KEY=un-string-de-minim-32-caractere-generat-aleatoriu
N8N_API_KEY=                          # lasă gol momentan, se generează din n8n UI
N8N_WEBHOOK_SECRET=                   # lasă gol momentan

# ── Frontend ──
NUXT_PUBLIC_API_BASE=/api
NUXT_API_BASE_INTERNAL=http://backend:4000/api

# ── TLS (production values) ──
TRAEFIK_ENTRYPOINTS=web,websecure
TRAEFIK_TLS=true
TRAEFIK_HTTPS_REDIRECT=redirect-to-https
TRAEFIK_CERT_RESOLVER=cloudflare
```

---

## 2.7 — Prima pornire

```bash
cd /opt/moduvis/docker
docker compose up -d --build
```

Ce se întâmplă la prima pornire:

1. **Traefik** pornește pe porturile 80 și 443. Obține certificatul wildcard Let's Encrypt prin DNS-01 Cloudflare (durează 1-2 minute).
2. **PostgreSQL** pornește și rulează `init-meta-db.sql`, care creează automat bazele `meta` și `n8n_db`. Baza `devdb` este creată automat de PostgreSQL ca `POSTGRES_DB`.
3. **Backend** pornește după ce Postgres devine healthy. Expune health check la `/api/health`.
4. **Frontend** pornește după ce backend-ul este healthy.
5. **n8n** pornește și se conectează la `n8n_db`.

Verifică starea:

```bash
docker compose ps
# Toate containerele trebuie să fie "Up" și healthy
```

Dacă ceva nu pornește, verifică log-urile:

```bash
docker compose logs traefik
docker compose logs backend
docker compose logs postgres
```

---

## 2.8 — Rulează migrațiile

După ce stack-ul rulează, trebuie să rulezi migrațiile. Ai două opțiuni:

### Varianta A — Executare în containerul de backend (recomandat)

```bash
# 1. Migrații meta DB
docker exec moduvis-backend npx knex migrate:latest --env meta

# 2. Migrații tenant DB (devdb)
docker exec moduvis-backend npx knex migrate:latest --env production
```

### Varianta B — Local, cu acces la portul PostgreSQL expus

Dacă ai expus portul `7432` pe host (cum e în docker-compose.yml), poți rula migrațiile local din folderul `server/`, dar trebuie să ai Node.js și dependențele instalate:

```bash
cd /opt/moduvis/server
npm install
DB_HOST=localhost DB_PORT=7432 DB_USER=base_user DB_PASSWORD=<parola> META_DB=meta npm run db:migrate:meta
DB_HOST=localhost DB_PORT=7432 DB_USER=base_user DB_PASSWORD=<parola> DEFAULT_TENANT_DB=devdb npm run db:migrate
```

### Varianta C — docker exec one-liner (după instalare deps în container)

Deoarece imaginea de backend conține doar `dist/` și `migrations/`, nu și `node_modules` complete cu `knex`, cel mai curat e să rulezi local cu `npm run` din folderul `server/`.

> **Recomandare pentru VPS:** Ține repo-ul clonat și pe VPS, cu `npm install` făcut în `server/`. Rulezi migrațiile și scripturile de provisioning din folderul `server/` cu variabilele de mediu setate corespunzător.

---

## 2.9 — Provisionează primul tenant

```bash
cd /opt/moduvis/server
npm run tenant:provision -- --slug=dev --plan=starter --admin-email=admin@domeniu.ro --admin-password=<parola-sigura>
```

Dacă tenant-ul `dev` există deja din seed, acest pas e opțional pentru el. Pentru tenanți noi:

```bash
npm run tenant:provision -- --slug=acme --plan=professional --admin-email=admin@acme.com --admin-password=<parola-sigura>
```

După provisioning, tenant-ul este accesibil la:

```
https://acme.stanciulescu.xyz
https://dev.stanciulescu.xyz
```

---

## 2.10 — Configurare n8n

1. Accesează n8n (neexpus public — trebuie să te conectezi prin tunel SSH sau VPN):
  ```bash
   # Port forward temporar
   ssh -L 5678:localhost:5678 user@IP_VPS
  ```
   Apoi deschide `http://localhost:5678` în browser.
2. Autentifică-te cu user-ul și parola setate în `.env` (`N8N_BASIC_AUTH_USER` / `N8N_BASIC_AUTH_PASSWORD`).
3. Generează un API key din n8n UI: **Settings → API → Create API Key**.
4. Setează `N8N_API_KEY` și `N8N_WEBHOOK_SECRET` în `docker/.env`.
5. Repornește backend-ul:
  ```bash
   cd /opt/moduvis/docker
   docker compose up -d backend
  ```

---

## 2.11 — Verificări finale

```bash
# Toate containerele rulează?
docker compose ps

# Health check backend
curl https://dev.stanciulescu.xyz/api/health

# Autentificare
curl -X POST https://dev.stanciulescu.xyz/api/auth/signin \
  -H "Content-Type: application/json" \
  -H "X-Tenant: dev" \
  -d '{"email":"admin@moduvis.local","password":"admin123"}'
```

Accesează frontend-ul în browser: `https://dev.stanciulescu.xyz`

---



# Operațiuni de mentenanță

## Adaugă un tenant nou

```bash
cd /opt/moduvis/server
npm run tenant:provision -- --slug=nume-tenant --plan=starter --admin-email=admin@nume-tenant.ro --admin-password=<parola>
```

Tenant-ul devine imediat disponibil la `https://nume-tenant.stanciulescu.xyz`.

---

## Actualizează aplicația (deploy nou)

```bash
cd /opt/moduvis
git pull

cd docker
docker compose up -d --build   # reconstruiește și repornește doar ce s-a schimbat

# Rulează migrațiile noi (dacă există)
cd ../server
npm run db:migrate:meta        # întâi meta
npm run tenant:migrate-all     # apoi toți tenanții
```

---

## Backup bază de date

```bash
# Backup complet (toate bazele)
docker exec moduvis-postgres pg_dumpall -U base_user > backup_$(date +%Y%m%d).sql

# Backup doar meta DB
docker exec moduvis-postgres pg_dump -U base_user meta > backup_meta_$(date +%Y%m%d).sql

# Backup un tenant specific
docker exec moduvis-postgres pg_dump -U base_user crm_acme > backup_acme_$(date +%Y%m%d).sql
```

---

## Vezi log-uri

```bash
# Toate serviciile
docker compose -f /opt/moduvis/docker/docker-compose.yml logs -f

# Doar un serviciu anume
docker compose -f /opt/moduvis/docker/docker-compose.yml logs -f backend
docker compose -f /opt/moduvis/docker/docker-compose.yml logs -f traefik
```

---



# Depanare

### Traefik nu obține certificatul TLS

```bash
docker compose logs traefik | grep -i error
```

Cauze frecvente:

- `CF_DNS_API_TOKEN` invalid sau fără permisiune `DNS:Edit`
- DNS-ul `*.domeniu.ro` nu pointează încă spre IP-ul VPS-ului
- Portul 80/443 blocat de firewall

### Backend-ul nu pornește

```bash
docker compose logs backend
```

Cauze frecvente:

- Postgres nu e healthy — verifică cu `docker compose logs postgres`
- Variabilele de mediu lipsă (`JWT_SECRET`, `DB_PASSWORD`, etc.)
- `META_DB` nu există — rulează `db:migrate:meta`

### Eroare "relation does not exist"

Migrațiile tenant nu au fost rulate. Rulează:

```bash
docker exec moduvis-backend npx knex migrate:latest --env production
```

Sau pentru un tenant specific, folosește `tenant:migrate-all`.

### Tenant nou nu funcționează

1. Verifică că DNS-ul wildcard e configurat: `ping nume-tenant.domeniu.ro` — trebuie să rezolve la IP-ul VPS
2. Verifică că tenant-ul există în `meta.tenants`:
  ```bash
   docker exec moduvis-postgres psql -U base_user -d meta -c "SELECT slug, db_name, is_active FROM tenants;"
  ```
3. Dacă tenant-ul e inactiv (`is_active = false`), activează-l:
  ```sql
   UPDATE tenants SET is_active = true WHERE slug = 'nume-tenant';
  ```

### Frontend-ul nu se încarcă (white screen / eroare SSR)

De obicei e o problemă de CORS sau de conectivitate între frontend și backend:

```bash
docker compose logs frontend
```

Verifică:

- `NUXT_API_BASE_INTERNAL` e corect (`http://backend:4000/api`)
- Backend-ul e healthy
- Variabila `FRONTEND_URL` din backend conține URL-ul corect al frontend-ului

