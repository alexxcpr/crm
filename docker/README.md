# Deploy Moduvis pe un singur VPS

## DNS Cloudflare

Configureaza in Cloudflare:

- `A *.stanciulescu.xyz -> IP_VPS`
- `A stanciulescu.xyz -> IP_VPS` (optional, pentru landing/root)

Pentru Traefik wildcard TLS, creeaza un API token Cloudflare cu:

- `Zone:Read`
- `DNS:Edit`
- scope doar pe zona `stanciulescu.xyz`

## Prima pornire

```bash
cd /opt/moduvis/docker
cp .env.example .env
```

Editeaza `.env` si seteaza parole reale pentru `JWT_SECRET`, `DB_PASSWORD`, `CF_DNS_API_TOKEN`,
`N8N_ENCRYPTION_KEY` si `N8N_BASIC_AUTH_PASSWORD`.

Porneste stack-ul:

```bash
docker compose up -d --build
```

Prima pornire creeaza automat DB-urile `devdb`, `meta` si `n8n_db`. Traefik obtine certificatul
wildcard prin DNS-01 Cloudflare.

## Migrații

Din folderul `server/`, ruleaza migrațiile. Ai nevoie de Node.js instalat pe VPS
(sau fa port-forward la Postgres si ruleaza local).

```bash
cd /opt/moduvis/server
npm install
DB_HOST=localhost DB_PORT=7432 DB_USER=base_user DB_PASSWORD=<parola> npm run db:migrate:meta
DB_HOST=localhost DB_PORT=7432 DB_USER=base_user DB_PASSWORD=<parola> DEFAULT_TENANT_DB=devdb npm run db:migrate
```

> `7432` e portul expus de docker-compose pe host. In productie poti comenta linia
> `ports: - "7432:5432"` din `docker-compose.yml` dupa ce ai terminat configurarile.

## Primul tenant

Provisioning-ul creeaza DB-ul tenantului, ruleaza migrațiile tenant și insereaza tenantul in `meta.tenants`:

```bash
cd /opt/moduvis/server
npm run tenant:provision -- --slug=acme --plan=starter --admin-email=admin@acme.ro --admin-password=change-me
```

Tenantul devine disponibil la:

```text
https://acme.stanciulescu.xyz
```

## Migrații pentru toți tenanții

La deploy-uri care adaugă migrații tenant:

```bash
cd /opt/moduvis/server
npm run tenant:migrate-all
```

## Verificări rapide

```bash
cd /opt/moduvis/docker
docker compose ps
docker compose logs -f traefik
docker compose logs -f backend
```

Health endpoint:

```text
https://acme.stanciulescu.xyz/api/health
```

## Note

- n8n nu are router Traefik și nu este expus public.
- Postgres nu expune port pe host; este accesibil doar din rețeaua Docker `moduvis-internal`.
- Cookie-urile de auth sunt scope-uite pe subdomeniu, deci tenanții sunt izolați la nivel de browser.
