# REVIEW-AI.md — Audit tehnic complet Moduvis

> Analiză independentă a întregului proiect (backend NestJS, frontend Nuxt 3, DB Postgres multi-tenant, integrare n8n, infrastructură Docker/Traefik).
> Scop: listă acționabilă de **bug-uri** și **propuneri de îmbunătățire** pe toate planurile — Securitate, Backend, DB, Frontend/UX, Arhitectură, Infrastructură, Observabilitate.
>
> Legendă severitate: **🔴 Critic** (vulnerabilitate / pierdere de date / blocaj) · **🟠 Major** (bug funcțional important / risc real) · **🟡 Minor** (polish / hardening / datorie tehnică).
>
> Locațiile `fișier:linie` sunt orientative (codul se poate schimba). Verifică contextul înainte de fix.

---

## 0. Rezumat executiv

Arhitectura de bază este solidă: DB-per-tenant, Argon2 pentru parole, refresh token rotation cu `jti`, RBAC la nivel de entitate cu scope `owner`/`all`, filter-parser cu whitelist + parametrizare Knex, Dockerfiles multi-stage, JWT în cookie (nu localStorage).

**Cele mai grave probleme care trebuie rezolvate înainte de orice deployment public:**

1. 🔴 **Rezolvarea tenant-ului poate fi falsificată** — `X-Tenant` controlat de client + JWT decodat fără verificare de semnătură → brute-force și targeting cross-tenant.
2. 🔴 **Webhook-urile n8n sunt complet deschise** dacă `N8N_WEBHOOK_SECRET` e gol (default), iar `record-update` permite scriere cross-tenant nevalidată.
3. 🔴 **Postgres și n8n expuse public** în Docker; Postgres pe rețeaua publică `web`.
4. 🔴 **Lanțul de migrări eșuează pe un tenant nou** (duplicare `ui_tab` / `is_readonly` / `group_name`).
5. 🔴 **Pierdere de date** la ștergere/recreare entitate (tabela `ent_*` orfană reutilizată) și la migrarea `simplify_field_types` (`extra_data` șters fizic).
6. 🔴 **Parole default hardcodate** (`admin123`, `1234`) în seed/migrări.
7. 🔴 **CI-ul nu rulează deloc** (workflow în `client/.github/` în loc de root).

### Matrice top prioritate

| # | Sev | Problemă | Zonă | Ref |
|---|-----|----------|------|-----|
| 1 | 🔴 | Tenant routing din JWT `decode()` neverificat | Securitate | `tenant.middleware.ts:49` |
| 2 | 🔴 | `X-Tenant` controlat de client → brute-force cross-tenant | Securitate | `tenant.middleware.ts:84` |
| 3 | 🔴 | Webhook n8n fără auth când secret gol | Securitate / n8n | `n8n-webhook.controller.ts:335` |
| 4 | 🔴 | `record-update` webhook: write cross-tenant nevalidat | Securitate / n8n | `n8n-webhook.controller.ts:119` |
| 5 | 🔴 | Postgres + n8n expuse public, Postgres pe rețea `web` | Infra | `docker-compose.yml:110,120,144` |
| 6 | 🔴 | Migrări fresh-tenant eșuează (duplicare tabele/coloane) | DB | `core_tables.ts` + `_add_is_readonly` + `_migrate_group_name` |
| 7 | 🔴 | Reutilizare tabel `ent_*` după delete entitate | DB / Backend | `admin-entities.service.ts:137` |
| 8 | 🔴 | `simplify_field_types` pierde `extra_data` + lasă coloane fantomă | DB | `20260610000001_simplify_field_types.ts` |
| 9 | 🔴 | Parole default `admin123` / `1234` | Securitate | `seed_defaults.ts:21`, `seed.ts:32` |
| 10 | 🔴 | CI nu se execută (locație greșită) | Infra / CI | `client/.github/workflows/ci.yml` |
| 11 | 🟠 | Lipsă Helmet + rate limiting pe login/webhooks | Securitate | `main.ts` |
| 12 | 🟠 | `db_password_encrypted` stocat ca plaintext | Securitate / DB | `billing-api.client.ts:46` |
| 13 | 🟠 | `is_readonly` ignorat la validare API | Backend | `dynamic-validation.service.ts` |
| 14 | 🟠 | Operații DDL fără tranzacții/lock (create/delete entitate+câmp) | Backend / DB | `admin-entities/admin-fields` |
| 15 | 🟠 | N+1 la rezolvarea relațiilor (CRUD + schema) | Performanță | `dynamic-data.service.ts:28` |

---

## 1. Securitate & Autentificare

### 🔴 Critic

- **Tenant routing din JWT neverificat (`decode`, nu `verify`).** `tenant.middleware.ts:49-63` extrage `dbName` din Bearer token fără validare de semnătură. `dbName` e predictibil (`crm_{slug}`), deci un atacator poate forța conexiunea la baza unui tenant țintă pe rute neautentificate. **Fix:** rezolvă tenant doar din host / `X-Tenant` validat contra meta-DB; dacă folosești JWT, `verifyAsync` cu secret.
- **`X-Tenant` controlat 100% de client, cu prioritate față de JWT** (`tenant.middleware.ts:37-46,84`). Permite atac de parole contra `/api/auth/signin` pe baza oricărui tenant. **Fix:** rate limiting per IP+tenant, lockout progresiv, eventual allowlist origini la login.
- **Webhook-uri n8n fără autentificare când `N8N_WEBHOOK_SECRET` e gol** (default `''`) — `n8n-webhook.controller.ts:64-66,334-336`. Orice request public poate atinge `/api/v1/webhooks/n8n/*`. **Fix:** fail-fast la startup în producție dacă lipsește secretul; auth obligatoriu.
- **`record-update` webhook: scriere cross-tenant nevalidată** (`n8n-webhook.controller.ts:102-140`). `body.dbName` e client-controlled (ignoră `tenantSlug` din URL), iar `...body.fields` e spread direct în `UPDATE` (poate seta `id`, `id_profile`, coloane system, câmpuri readonly), fără `DynamicValidationService` / `AuthorizationService`. **Fix:** rezolvă tenant din URL via registry; whitelist coloane din `field`; trece prin `DynamicDataService.update()`.
- **Parole default hardcodate.** `seed_defaults.ts:20-27` (`admin123`), `prisma/seed.ts:32` (`1234`). **Fix:** generare random la provisioning + `must_change_password: true`; refuză startup în producție cu parolă default.

### 🟠 Major

- **Lipsă Helmet** (security headers) — `main.ts:50-78`. Lipsesc `X-Content-Type-Options`, `X-Frame-Options`, HSTS, CSP. **Fix:** `app.use(helmet())`.
- **Lipsă rate limiting / account lockout** pe `/auth/signin` și `/auth/refresh` (`auth.controller.ts`). **Fix:** `@nestjs/throttler` + lockout progresiv.
- **JWT `tenant`/`dbName` nu sunt validate față de contextul tenant rezolvat** (`jwt.strategy.ts:21-39`). **Fix:** respinge token dacă `payload.tenant !== tenantContext.slug`.
- **`db_password_encrypted` folosit ca plaintext** (`billing-api.client.ts:38-46`, `migrations/meta/20260522000001_tenants_registry.ts:9`). Numele sugerează criptare care nu există. **Fix:** AES/KMS cu decrypt la runtime + rotație.
- **Fallback dev: orice slug necunoscut → DB default** (`billing-api.client.ts:53-58,82-93`). Rupe izolarea tenant în dev/staging. **Fix:** limitează strict la `DEFAULT_TENANT_SLUG`; folosește `NODE_ENV=production` în staging.
- **`X-Forwarded-Host` folosit pentru rezolvare tenant** (`tenant.middleware.ts:90`) — spoofing dacă backend e accesibil direct, ocolind Traefik. **Fix:** trust doar proxy de încredere; blochează acces direct la backend.
- **Secret webhook trimis în clar către n8n** și persistat în workflow JSON (`workflow-sync.service.ts:576-581`). Orice export/admin n8n îl expune. **Fix:** JWT per execuție + HMAC per request, rotație secret.
- **SSRF via nod `http_request`** (`workflow-sync.service.ts:818-824`) — URL arbitrar din workflow. **Fix:** allowlist domenii, restricționare nod raw HTTP.
- **`GET /v1/admin/modules/:id` accesibil oricărui user autentificat** (`admin-modules.controller.ts:22`, `admin-modules.service.ts:46`) — IDOR/disclosure metadata admin. **Fix:** `@Roles('admin')` pe clasă sau filtrare pe permisiuni.
- **`must_change_password` blocat doar parțial** (`roles.guard.ts:29` vs `user.controller.ts`). User cu parolă temporară poate opera profil/naviga. **Fix:** guard global care permite doar schimbarea parolei.
- **DTO-uri `any` pe admin security** (`admin-security.controller.ts:14-20`) — validare manuală incompletă. **Fix:** DTO-uri cu `class-validator`.
- **CORS permite request-uri fără `Origin`** (`main.ts:27-30`, `if (!origin) return true`). **Fix:** în producție `return false` sau allowlist explicită.

### 🟡 Minor

- **Access token fără revocare** (fereastră 30 min, fără `jti`/blacklist) — `auth.module.ts:14`. `signout` revocă doar refresh.
- **Race condition la refresh token rotation** (`auth.service.ts:53`) — revocarea + emiterea nu sunt atomice. **Fix:** `UPDATE ... WHERE jti=? AND is_revoked=false RETURNING` în tranzacție + detectare reuse.
- **`switchProfile` fără `refreshToken` lasă sesiuni vechi active** (`auth.service.ts:57-63`).
- **Refresh endpoint returnează HTTP 200 cu body de eroare** (`auth.controller.ts:23-27`). **Fix:** `throw new BadRequestException`.
- **`randomPassword()` cu `Math.random()`** (`tenant-provisioning.service.ts:149`) — entropie slabă. **Fix:** `crypto.randomBytes(32).toString('base64url')`.
- **HMAC pe `JSON.stringify(payload)`** (`n8n-webhook.controller.ts:354`) — ordine chei nedeterministă → semnături fragile. **Fix:** canonical JSON sau raw body.
- **Webhook path predictibil** (`workflow-sync.service.ts:201`, `crm-{tenant}-{slug}`) — enumerare ușoară. **Fix:** suffix random stocat.
- **`N8N_API_KEY` full-access fără rotație/scope** (`n8n-api.client.ts:52`).
- **ReDoS via `validation_rules.pattern`** (`dynamic-validation.service.ts:53`) — regex controlat de admin.
- **`ValidationPipe` fără `forbidNonWhitelisted`/`transform`** (`main.ts:62`).
- **`validateProductionEnv` incomplet** — nu verifică `N8N_WEBHOOK_SECRET`, `N8N_API_KEY`, `N8N_ENCRYPTION_KEY`, `FRONTEND_URL` (`main.ts:11-18`).
- **`AuthDto` fără `@MaxLength` pe parolă** (`auth.dto.ts`) — DoS la `argon.verify` cu parolă uriașă.
- **Exception filter poate expune detalii interne** în dev (`http-exception.filter.ts:28`). **Fix:** sanitizare mesaje în producție.
- **`console.log` cu info auth (token length, username) în SSR** (`plugins/01-auth-baseurl.server.ts:34-66`) — leak în loguri producție.

### ✅ Bune practici existente
Argon2, refresh rotation cu `jti` + revocare DB, RBAC entity-level cu scope, JWT în cookie httpOnly în producție, `CREATE DATABASE ??` parametrizat la provisioning.

---

## 2. Backend — Dynamic Schema / Data / Validare

### 🔴 Critic

- **Reutilizare tabel `ent_*` după delete entitate** (`admin-entities.service.ts:137-151` + `dynamic-schema.service.ts:20-24`). `remove()` șterge metadata dar nu face DROP TABLE; recrearea cu același slug face `skip` → utilizatorii văd datele vechi sub o entitate „nouă”. **Fix:** DROP/archive tabel în tranzacție cu ștergerea metadata; sau interzice recrearea slug-ului dacă tabela există.

### 🟠 Major

- **SQL identifier injection via `relation_display_field`** (`dynamic-data.service.ts:46-51`). Valoare din DB concatenată ca identificator în SELECT/JOIN fără whitelist; DTO permite orice string ≤100 caractere (`field.dto.ts:90-94`). **Fix:** regex strict + rezolvare slug → `column_name` din metadata țintă.
- **Confuzie slug vs `column_name` la JOIN-uri relation** (`dynamic-data.service.ts:50`). `relation_display_field` e documentat ca slug dar folosit ca nume coloană SQL → JOIN invalid când slug ≠ `cf_...`. **Fix:** lookup `column_name` după slug pe entitatea țintă.
- **`is_readonly` ignorat la validare API** (`dynamic-validation.service.ts:21-58`). Client API poate modifica câmpuri readonly. **Fix:** exclude/respinge câmpuri `is_readonly` la create/update (excepție: workflow autorizat).
- **Creare entitate fără tranzacție atomică** (`admin-entities.service.ts:87-110`): INSERT entity → `createEntityTable` → INSERT `ui_tab`. Eșec intermediar = metadata orfană. **Fix:** `knex.transaction()` pe metadata + DDL.
- **Ștergere câmp în ordine greșită, fără rollback** (`admin-fields.service.ts:240-242`): DDL `removeColumn` înainte de delete metadata (invers față de create). **Fix:** tranzacție + rollback.
- **Race condition DDL concurent** (`dynamic-schema.service.ts:20,43,125`): pattern check-then-act fără advisory lock. **Fix:** `pg_advisory_xact_lock(hash(tableName))`.
- **`JSON.stringify` pe coloane JSONB** (`admin-fields.service.ts:124,133,202,208`; și `action.service.ts:120`). Stochează string JSON ca scalar; frontend primește `"[...]"` în loc de `[...]`. **Fix:** pasează obiectul direct la Knex.
- **Backfill NOT NULL pe câmpuri relation/UUID cu UUID zero** (`dynamic-schema.service.ts:177-187`). Adăugarea unui câmp relation required pe tabel populat → FK invalid / date corupte. **Fix:** blochează `is_required` pe tabele populate fără default valid.
- **`numeric` invalid acceptat ca string raw** (`dynamic-validation.service.ts:100-103`): `"abc"` trece validarea și ajunge în INSERT. **Fix:** `BadRequestException` la NaN (ca la `integer`).
- **Lipsă validare FK/relation la insert/update** — eroarea apare doar la nivel DB cu mesaj neclar. **Fix:** verifică existența UUID-ului în tabela țintă.
- **Câmpuri required nevalidate la update parțial** (`dynamic-validation.service.ts:29-35`) — PATCH `{}` trece; doar NOT NULL din DB protejează.
- **N+1 la rezolvarea relațiilor** (`dynamic-data.service.ts:28-33`; idem `schema.service.ts:42`, `admin-fields.service.ts:29`, `admin-entities.service.ts:25`). 1 query/câmp relation. **Fix:** `whereIn` batch sau JOIN.
- **LEFT JOIN pe toate câmpurile relation la fiecare listare** (`dynamic-data.service.ts:46-51`), chiar dacă display column nu e folosit.

### 🟡 Minor

- **Sortare fără verificare `is_sortable`** (`dynamic-data.service.ts:76-85`) — sortări pe coloane neindexate → DoS performanță.
- **Wildcards ILIKE neescapați (`%`, `_`)** (`filter-parser.service.ts:202-206`) — enumerare masivă date. **Fix:** escape înainte de ILIKE.
- **Filtrare permisă pe coloane fără `is_filterable`** (`filter-parser.service.ts:23`) — scan complet posibil.
- **`table_name` fără validare regex în `createEntityTable`/`addColumn`** (`dynamic-schema.service.ts:17,207`) — sigur pe calea admin, riscant la scriere directă în DB.
- **`relation_display_field` fără `@Matches` în DTO** (`field.dto.ts:90-94`).
- **Query params CRUD nu trec prin `ValidationPipe`** (`dynamic-data.controller.ts:18`, `Record<string,any>`) — fără limite pe nr. condiții `in`/OR.
- **`createIndex` catch pe proprietate greșită** (`dynamic-schema.service.ts:130`): `error.messages` în loc de `error.message` → poate propaga eroare la index duplicat.
- **Fallback `data_type` necunoscut → `VARCHAR(255)`** silent (`data-type.mapper.ts:40`).
- **Schimbarea `ui_type` la `relation` în update nu adaugă FK** (`admin-fields.service.ts:153-218`).
- **Schema endpoint expune `table_name` intern** (`schema.service.ts:83`).
- **Update/delete fără re-aplicare scope pe query final** (`dynamic-data.service.ts:142,156`) — TOCTOU teoretic. **Fix:** `existingQuery.clone().update()`.
- **Entități noi fără permisiuni RBAC auto** (`admin-entities.service.ts:72-112`).
- **Lipsă index pe `date_created`** (sortarea default) și lipsă limită pe dimensiunea operatorului `in`/OR.
- **`break` după primul câmp required** → o singură eroare raportată (`dynamic-validation.service.ts:32`).
- **Lipsă validare valori `select`/`options`** (valoarea nu e verificată ∈ options).

### ✅ Bune practici existente
Filter-parser cu whitelist coloane + operatori per tip + parametrizare Knex; RBAC pe toate operațiunile CRUD; `SLUG_REGEX` la DDL + prefixare forțată `cf_`/`ent_`; paginare cu limit clamp 1–100.

---

## 3. Bază de date & Migrări

### 🔴 Critic

- **Lanț de migrări nefuncțional pe tenant nou.** `core_tables.ts:61-94` creează deja `ui_tab` și `is_readonly`, dar migrările ulterioare le recreează:
  - `20260604000001_add_is_readonly_to_field.ts` → coloană deja existentă.
  - `20260608000001_migrate_group_name_to_ui_tab.ts` → recreează `ui_tab`; `field.group_name` nu mai există în `core_tables`.
  Afectează `tenant:provision`, `db-dev-restart`, orice `migrate:latest` pe DB gol. **Fix:** squash sau guard `hasTable`/`hasColumn` în toate migrările.
- **`simplify_field_types` pierde date + lasă coloane fantomă** (`20260610000001_simplify_field_types.ts:14-18`). Șterge rânduri din `field` fără `DROP COLUMN` pe `ent_*`; șterge fizic `extra_data` de pe toate tabelele (ireversibil). `down()` e lossy. **Fix:** migrare în pași cu backup; `down()` să dea `throw` explicit dacă e lossy.

### 🟠 Major

- **Bug logic în `migrate_group_name_to_ui_tab`** (`:30-38`): prima buclă nu populează map-ul → toate tab-urile primesc `rank = 0`.
- **`profiles_and_entity_rbac` fără rollback + side effects distructive** (`20260614000001:68,132`): `refresh_token` șters complet; `down()` aruncă eroare; expansiune `role_permission` prin loop (risc timeout pe tenant mari). **Fix:** runbook cu backup obligatoriu + batch insert.
- **`seed_defaults` incompatibil cu schema post-profiles** (`seed_defaults.ts:20-27`) — folosește `email`/`first_name`/`user_role` care nu mai există.
- **`action_definition.slug` unic global, nu per entitate** (`workflow_tables.ts:25`, `action.service.ts:85`). Două entități nu pot avea aceeași acțiune. **Fix:** `UNIQUE(id_entity, slug)`.
- **Lipsă indexuri pe FK / hot paths**: `action_definition(id_entity, id_workflow)`, `refresh_token(user_id, expires_at, is_revoked)`, `profile_role(id_profile)`, `field(id_entity)`. **Fix:** adaugă indexuri compuse.
- **FK relation fields fără `ON DELETE` explicit** (`dynamic-schema.service.ts:172`) — default `NO ACTION` blochează ștergeri. **Fix:** `ON DELETE SET NULL`/`RESTRICT` documentat.
- **`id_profile` pe `ent_*` cu `ON DELETE RESTRICT`** (`dynamic-schema.service.ts:30`) — profilul nu poate fi șters dacă deține înregistrări, fără strategie de reassign.
- **Meta migrări neincluse în `db-dev-restart`** (`package.json:18`) — rulează doar tenant migrations. **Fix:** chain `db:migrate:meta && db:migrate`.
- **Drift Prisma ↔ Knex ↔ migrări istorice** — Prisma descrie starea țintă dar runtime-ul folosește doar Knex; migrarea Prisma init e veche. **Fix:** o singură sursă de adevăr (Knex), Prisma doar documentare.

### 🟡 Minor

- **`profile.id_profile = user.id`** (PK partajat la profilul default) — inconsistență conceptuală (`20260614000001:48`).
- **Lipsă CHECK** pe `role_permission.action`/`scope` și `workflow_definition.status`.
- **Două surse de seed conflictuale** (migrare vs `prisma/seed.ts`) — roluri/permisiuni duplicate.
- **`provision-tenant` caută `login_username='admin'`** (`tenant-provisioning.service.ts:81`) — eșuează silențios dacă seed-ul folosește `root`.
- **`migrate-all-tenants` fără retry parțial** (`migrate-all-tenants.ts:26`) — un eșec lasă restul nemigrate.
- **`init-n8n-db.sql` fișier orfan** (nefolosit în compose).
- **Init SQL rulează doar la prima creare a volumului** — DB-uri lipsă nu se recreează.

---

## 4. Frontend & UX (Nuxt 3)

### 🔴 Critic

- **Schimbarea `recordId` nu reîncarcă înregistrarea** (`Form.vue:200-229`). Watch doar pe `schema`; navigarea `/contacts/1` → `/contacts/2` afișează datele vechi. **Fix:** `watch(() => props.recordId, loadRecord)`.
- **`fetchOne` eșuat → formular edit cu date goale, fără eroare** (`Form.vue:207-223`). 404/403 → `initFormState(null)` umple cu default-uri marcate „curat”. **Fix:** afișează empty/eroare + buton înapoi dacă `!record`.
- **Tipuri UI documentate lipsesc** (`Field.vue:559-568`): `select`, `multi-select`, `radio`, `file` cad pe fallback `UInput text` → date invalide. **Fix:** implementează sau ascunde tipurile neimplementate în admin.
- **Ștergere rând fără confirmare** (`Table.vue:263-275`) — single delete nu are modal (bulk are). **Fix:** modal de confirmare.
- **Fără guard RBAC pe rute entity** (`pages/[entity]/create.vue`, `[id].vue`) — orice user autentificat accesează ruta chiar fără `capabilities`. **Fix:** middleware pe `capabilities` din schema.
- **Mod read-only incomplet** (`Form.vue:659-714`) — fără `capabilities.update`, butonul Salvează dispare dar câmpurile rămân editabile. **Fix:** prop `readOnly` pe `DynamicField`.
- **La eșec `/user/me`, sesiune stub `{}` seed-uită** (`plugins/01-auth-baseurl.server.ts:63-68`) — user pare autentificat cu date goale. **Fix:** șterge cookie + redirect login.

### 🟠 Major

- **Bulk delete: toast „success” chiar la eșecuri parțiale** (`Table.vue:326-339`).
- **Buton „Coloane” / „Adaugă” gated greșit pe `capabilities.create`** (`Table.vue:452,512`) — userii fără create nu pot gestiona coloanele.
- **Acțiuni workflow executate fără confirmare** (`useEntityActions.ts:48-63`) — click accidental declanșează webhook n8n. **Fix:** dialog confirm.
- **Fără guard la părăsire cu modificări nesalvate în workflow builder** (`pages/admin/workflows/[id].vue`). **Fix:** `onBeforeRouteLeave`.
- **`isMobile` neactiv la resize** (`Form.vue:134`, `InlineCreateModal.vue:16`) — `matchMedia` evaluat o dată. **Fix:** `useMediaQuery` din VueUse.
- **Race condition la `fetchItems`** (`useEntityData.ts:52-71`) — request-uri suprapuse, ultimul răspuns câștigă. **Fix:** `AbortController` / `requestId`.
- **Fără deduplicare fetch schema** (`useEntitySchema.ts:13-35`) — apeluri paralele duplică GET. **Fix:** `pendingFetches` Map (pattern existent în `useRelationOptionsCache`).
- **Dublu `useEntitySchema(entity)`** pe aceeași pagină (`[entity]/index.vue:9` + `Table.vue:28`) → dublu fetch la mount.
- **Fără handler global 401/403** (`useApi.ts`) — token expirat → erori silențioase, fără redirect. **Fix:** `onResponseError` cu refresh + redirect.
- **Lipsă loading/error state** la `admin/security.vue:32`, `settings/index.vue:23`, `useNavigation.ts:50` (doar `console.error`).
- **Validare frontend ≠ backend**: `ui_type email/phone` folosesc `buildStringRule` fără `.email()` (`buildZodSchema.ts:81-95`); lipsește validarea `is_unique` (backend aruncă 409 neprins de UI).
- **`tenantSlug` capturat o singură dată, neractiv** (`useApi.ts:5`, `plugins/00-tenant-fetch.ts:10`) — header `X-Tenant` poate fi stale. **Fix:** citește `slug.value` în `onRequest`.
- **`httpOnlyCookieAttribute: false` în dev** (`nuxt.config.ts:48`) — token citibil din JS (risc XSS în development).

### 🟡 Minor

- **Fără selector items-per-page** (page size fix 25) și fără virtualizare rânduri (`Table.vue`).
- **Monedă hardcodată „RON”** (`Field.vue:373`).
- **Datetime picker: 3× `USelect` cu 24+60+60 items** — DOM greu (`Field.vue:503`).
- **`columns` computed recreat complet** la orice schimbare filtru/sort (`Table.vue:140`).
- **Utilizare extensivă `any`** (composables, `Field.vue`, `Cell.vue`) — pierdere type-safety.
- **`knownSlugs` Set la nivel modul** (`middleware/validate-entity.ts`) — nu se invalidează la ștergerea entității.
- **`InlineCreateForm.vue:145` / `Form.vue:200`**: watch pe schema reinițializează formularul → poate șterge inputul userului la re-fetch.

### a11y & i18n

- **Aproape lipsă atribute ARIA** app-wide; icon-buttons fără `aria-label` (`Table.vue:278`, `Field.vue:439`, `ColumnFilter.vue:210`, `RelationSelect.vue:115`).
- **Checkbox cu label duplicat** (`Field.vue:410`) — citit de două ori de screen reader.
- **Texte engleză în UI românesc**: `error.vue` (`lang="en"`, „Page not found”), `useNavigation.ts` („Home”, „Settings”), `pages/index.vue` (demo Nuxt UI, rute inexistente `/customers`), `login.vue:104` („Email” în loc de „Username”), `Table.vue:169` („Edit”), `admin/security.vue` (placeholdere EN).
- **Diacritice inconsistente**: „Salvează” vs „Sterge”, „Acțiuni” vs „Actiuni”. **Fix:** ghid de stil RO.

### ✅ Bune practici existente
Protecție date nesalvate în `Form.vue` (`onBeforeRouteLeave` + `beforeunload` + modal), filtre cu apply explicit + operatori bogați + debounce pe search relații, cache relații cu TTL + deduplicare + invalidare la CRUD, empty states contextuale, JWT în cookie.

---

## 5. Actions / Workflows / n8n

### 🔴 Critic

- **BeforeInsert merge arbitrar în DTO** (`action.service.ts:406`, `Object.assign(payload.data, collected)`) — workflow poate suprascrie câmpuri system/readonly înainte de INSERT, fără re-validare. **Fix:** whitelist câmpuri + re-rulare `validateAndSanitize`.
- (vezi și §1: webhook fără auth, `record-update` cross-tenant, SSRF, secret în clar)

### 🟠 Major

- **Erori după-eveniment înghițite** (`workflow-sync.service.ts:277-281`) — CRUD reușește, workflow eșuează silențios → inconsistență. **Fix:** coadă + retry + `action_execution_log` + alertare.
- **Operator de condiție necunoscut = match** (`action.service.ts:506`, `default: return true`) și **condiție malformedă trece filtrul** (`:489`). **Fix:** `default: return false` + log.
- **Lipsă idempotență execuție** (`executeManual` + auto-triggers) — retry/double-click = side effects duplicate (email dublu). **Fix:** `idempotency_key`.
- **Lipsă timeout/retry pe apeluri n8n** (`n8n-api.client.ts:75,132`) — request-uri blocate la CRUD sincron. **Fix:** `AbortSignal` 30s + retry pe 502/503 + circuit breaker.
- **Sync + activate + sleep 300ms la fiecare execuție** (`workflow-sync.service.ts:188-196`) — latency fix + versiuni conflictuale n8n. **Fix:** sync doar la publish.
- **Before-events sincron blochează CRUD-ul** (`dynamic-data.service.ts:116`) — apel n8n în calea request-ului. **Fix:** timeout strict + rollback.
- **Permisiune acțiuni UI necesită doar `update`** (`action.service.ts:59`) — user read-only poate executa acțiuni.

### 🟡 Minor

- **`trigger_events` / `trigger_conditions` cu `JSON.stringify` în coloană jsonb** (`action.service.ts:120`) — risc double-encoding.
- **Acțiune activă fără workflow** face `continue` silențios (`action.service.ts:397`).
- **Comportament asimetric erori** Before (propagat) vs After (doar log).
- **Dublă emisie evenimente** generic + specific (`entity-events.service.ts:53-57`) — risc viitor de listener duplicat.

---

## 6. Infrastructură (Docker / Traefik / CI)

### 🔴 Critic

- **Postgres expus public** (`docker-compose.yml:110-111`, `7432:5432`) și **atașat la rețeaua publică `web`** (`:120-122`). **Fix:** elimină `ports` în producție; păstrează Postgres doar pe `internal`.
- **n8n expus public** (`docker-compose.yml:144-145`, `5678:5678`) — UI accesibil direct, ocolind Traefik. **Fix:** doar intern / prin Traefik cu TLS + IP whitelist.
- **`POSTGRES_USER` = superuser** folosit de aplicație (`docker-compose.yml:106`); **credențiale admin = credențiale app** (`:69-70`). **Fix:** roluri separate (`app_user` DML, `migration_admin` DDL).
- **Middleware Traefik `redirect-to-https` referit dar niciodată definit** (`docker-compose.yml:47,95`). **Fix:** adaugă label `redirectscheme.scheme=https`.
- **CI nu se execută** — workflow în `client/.github/workflows/` în loc de `.github/workflows/` la root. **Fix:** mută la root + adaugă job server (lint/test/build).

### 🟠 Major

- **Containere rulează ca root** (`server/Dockerfile`, `client/Dockerfile`) — lipsește `USER node`.
- **Lipsă resource limits** (`deploy.resources`/`mem_limit`/`cpus`) pe toate serviciile.
- **Lipsă hardening** (`read_only`, `cap_drop`, `no-new-privileges`).
- **Imagini cu tag flotant**: `n8nio/n8n:latest` (🔴 în compose), `node:22-*`, `postgres:16`, `traefik:v3.2`. **Fix:** pin pe patch/digest.
- **`COPY . .` după `npm ci`** (`server/Dockerfile:12`) invalidează cache deps.
- **Migrațiile `.ts` nu sunt compilate în imagine** (`nest build` compilează doar `src/`) — provisioning/migrări din app nu pot rula după `npm prune`. **Fix:** compilează migrațiile sau job migrator dedicat.
- **Migrațiile sunt manuale, în afara containerelor** (necesită Node pe host + port-forward) — risc version skew. **Fix:** init container / `docker compose run --rm migrator`.
- **`db:migrate` (production) migrează doar `DEFAULT_TENANT_DB`** (`knexfile.ts:40`), nu toți tenant-ii.
- **Backend nu rulează migrații la startup** + **lipsă `enableShutdownHooks()`** (`main.ts`) — conexiuni Knex nedrenarea la SIGTERM.
- **Healthcheck superficial** (`health.controller.ts:9-21`, doar meta DB) + **lipsă healthcheck Docker pe frontend / n8n / Traefik**.
- **Lipsă headere securitate + rate limiting în Traefik** (HSTS, X-Frame-Options, CSP).
- **Lipsă backup automat** per-tenant + off-site (`postgres_data`, `n8n_data`, `acme.json`) — pierdere VPS = pierdere totală.
- **CI acoperă doar frontend**; lipsă teste/lint/build server, lipsă scanare imagini (Trivy/Grype), lipsă pipeline deploy.
- **`devtools: { enabled: true }`** în `nuxt.config.ts:10` — poate ajunge în bundle producție.
- **`NUXT_AUTH_ORIGIN`/`FRONTEND_URL` hardcodate pe tenantul default** (`docker-compose.yml:35,62`).

### 🟡 Minor

- **`.dockerignore` incomplet** (lipsesc `test/`, `.git`, `*.md`, `coverage`, `zdocumentation/`).
- **`NODE_OPTIONS=--max-old-space-size=4096`** build Nuxt (`client/Dockerfile:21`) — poate epuiza VPS mic.
- **Documentație contradictorie** README vs compose despre expunerea Postgres.
- **`acme.json` permisiuni 600 nedocumentate**; **`accessLog` fără rotație** (`traefik.yml:27`).
- **`HostRegexp` wildcard** acceptă subdomenii neprovisionate.
- **Domeniu real `stanciulescu.xyz` în `.env.example`** — folosește placeholder.
- **`trust proxy: 1` nespecific** (`main.ts:55`) — ar trebui IP-ul Traefik.
- **`.vscode`**: lipsă config debug NestJS; `"nuxt.isNuxtApp": false` incorect.
- **Lint cu `--fix` în CI** poate modifica fișiere.

### ✅ Bune practici existente
Dockerfiles multi-stage, `restart: unless-stopped`, backend healthcheck Docker + Traefik LB, rețea `internal` definită, dashboard Traefik off + `exposedByDefault: false` + ACME DNS-01 Cloudflare, `pg_isready` pe Postgres.

---

## 7. Observabilitate & Operațional

### 🟠 Major
- **Zero monitoring** (fără Prometheus/Grafana/Uptime Kuma/alerting). **Fix:** minim healthcheck extern + alerte; ideal node/postgres exporter.
- **Zero APM/tracing/structured logging** (fără OpenTelemetry/Sentry/Pino). **Fix:** logger JSON + correlation ID + Sentry.
- **Erori logate cu `console.error`** (`http-exception.filter.ts:29`) — pierdute la restart. `TODO.md:23` confirmă lipsa unui logger persistent.

### 🟡 Minor
- Log level Traefik fix INFO; `console.log` cu info auth în SSR producție.

---

## 8. Plan de remediere recomandat

**Sprint 1 — Blocante securitate & date (🔴):**
1. Securizează rezolvarea tenant (elimină `decode` JWT, validează `X-Tenant` contra meta-DB).
2. `N8N_WEBHOOK_SECRET` obligatoriu în producție; refactor `record-update` prin `DynamicDataService` + tenant din URL.
3. Scoate Postgres/n8n din expunerea publică; Postgres doar pe `internal`; definește middleware `redirect-to-https`.
4. Repară lanțul de migrări (idempotent) + test `migrate:latest` pe DB gol în CI; oprește pierderea `extra_data`.
5. Elimină parolele default; generare random + `must_change_password`.
6. Mută CI la root + adaugă job server.
7. DROP/archive tabel la ștergere entitate (în tranzacție).

**Sprint 2 — Major funcțional & hardening (🟠):**
- Helmet + rate limiting + lockout; validare claim tenant în JWT; criptare `db_password_encrypted`.
- Tranzacții/advisory lock pe DDL; `is_readonly` + validare `numeric`/FK la backend; fix `JSON.stringify` pe jsonb.
- Frontend: watch pe `recordId`, error state `fetchOne`, confirmare delete, guard RBAC rute, handler 401 global, race conditions fetch.
- Indexuri DB; `USER node` + resource limits în Docker; migrații automate la deploy; backup automat.
- n8n: timeout/retry, idempotency, fail-loud pe after-events, allowlist SSRF.

**Sprint 3 — Polish & datorie tehnică (🟡):**
- a11y (aria-labels), i18n RO consistent + diacritice, eliminare `any`, monedă configurabilă, performanță tabel, observabilitate (logger structurat + alerting).

---

*Raport generat automat prin analiză statică a codului. Recomandare: validează fiecare constatare în context și acoperă fix-urile critice cu teste înainte de deploy.*
