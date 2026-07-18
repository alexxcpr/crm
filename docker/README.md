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

## File storage (Hetzner Object Storage)

1. Creeaza un bucket privat in aceeasi locatie cu VPS-ul, cu Versioning si Object Lock dezactivate.
2. Creeaza credentiale S3 dedicate si limiteaza cheia la bucket prin bucket policy.
3. Configureaza CORS pentru uploadurile directe din browser:

```json
{
  "CORSRules": [
    {
      "AllowedOrigins": ["https://*.stanciulescu.xyz"],
      "AllowedHeaders": ["*"],
      "AllowedMethods": ["PUT", "GET", "HEAD"],
      "ExposeHeaders": ["ETag"],
      "MaxAgeSeconds": 3600
    }
  ]
}
```

4. Adauga o lifecycle policy care sterge obiectele temporare abandonate:

```json
{
  "Rules": [
    {
      "ID": "cleanup-temporary-uploads",
      "Status": "Enabled",
      "Filter": { "Prefix": "_uploads/" },
      "Expiration": { "Days": 2 },
      "AbortIncompleteMultipartUpload": { "DaysAfterInitiation": 1 }
    }
  ]
}
```

5. Completeaza variabilele `STORAGE_S3_*` din `.env`, apoi seteaza `STORAGE_ENABLED=true`.
6. Ruleaza mai intai migrarea meta, apoi toate migrarile tenant:

```powershell
npm.cmd run db:migrate:meta
npm.cmd run tenant:migrate-all
```

Pentru development, porneste MinIO din PowerShell:

```powershell
Set-Location D:\Projects\CRM\docker
docker compose -f docker-compose.storage.yml up -d
```

Stack-ul local foloseste project name-ul izolat `moduvis-storage-dev`. Se opreste fara a afecta CRM-ul principal cu `docker compose -f docker-compose.storage.yml down`.

Configurarea locala pentru backend este:

```powershell
$env:STORAGE_ENABLED = "true"
$env:STORAGE_S3_ENDPOINT = "http://localhost:9000"
$env:STORAGE_S3_REGION = "us-east-1"
$env:STORAGE_S3_BUCKET = "moduvis-development"
$env:STORAGE_S3_ACCESS_KEY = "moduvis"
$env:STORAGE_S3_SECRET_KEY = "moduvis-development-secret"
$env:STORAGE_S3_FORCE_PATH_STYLE = "true"
```

Jobul zilnic raporteaza atat metadatele fara obiect, cat si obiectele fara rezervare cunoscuta. `STORAGE_RECONCILE_MAX_OBJECTS` limiteaza numarul de obiecte S3 inspectate per tenant (implicit `10000`); jobul nu sterge automat obiectele orfane.

Credentialele nu se adauga niciodata in frontend. Hetzner Object Storage nu aplica implicit criptare la rest; daca aceasta devine cerinta contractuala, fluxul direct browser-S3 trebuie inlocuit cu criptare prin backend/worker.

## Note

- n8n nu are router Traefik și nu este expus public.
- Postgres nu expune port pe host; este accesibil doar din rețeaua Docker `moduvis-internal`.
- Cookie-urile de auth sunt scope-uite pe subdomeniu, deci tenanții sunt izolați la nivel de browser.
