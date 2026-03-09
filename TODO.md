# TODO

# Frontend
## Contact
[x] Lista afisare contacte
[] De adus si compania in lista de contacte
[] Pagina create contact (data-driven UI)
[] Pagina edit contact existent (data-driven UI)
[] Functionalitate delete + apelare functie backend pentru stergere din db
[] Filtre in lista de afisare contacte
[x] Utils pentru string (ex: coalesce)
[x] Utils pentru bool (ex: coalesce)

# Backend
## Sistem Login (AUTH)
[x] register functional
[x] login functional
[x] logout functional (stergere jwt din client + mesaj de confirmare primit din backend)
[] logging facut (userul x s-a logat in data y, s-a delogat in data z)
[] refresh token
[] blacklist token la logout

## Logger
- erorile sa fie salvate intr-un logger (stacktrace)

# Data-Driven UI

## Arhitectura aleasa: Coloane reale generate dinamic (stil Salesforce) + JSONB overflow

### Concept
Backend-ul controleaza tot: ce entitati exista, ce campuri au, cum arata UI-ul.
Cand un admin adauga un camp custom, backend-ul face `ALTER TABLE ADD COLUMN` — campul devine coloana reala in PostgreSQL.
Frontend-ul nu stie nimic hardcodat — cere schema de la API si randeaza totul dinamic.
O singura coloana JSONB `extra_data` ramane per tabela ca overflow pentru date complexe (array de tag-uri, obiecte nested).

### De ce NU doar JSONB
- JSONB nu suporta `FOREIGN KEY` → nu ai integritate referentiala pe campuri custom
- `GROUP BY`, `SUM`, `AVG` pe JSONB sunt lente si necesita cast-uri manuale
- Sortarea pe JSONB sorteaza ca text, nu ca tip nativ (`'9' > '10'` → gresit)
- La export-uri mari (10k+ randuri), deserializarea JSONB per rand devine bottleneck
- Coloanele reale permit indexare B-Tree standard, FK-uri, `ON DELETE CASCADE`

---

## Stack necesar

### Backend
| Tehnologie | Rol | De ce |
|---|---|---|
| **NestJS** | Framework backend | Deja in stack, modular, bun pentru API REST |
| **PostgreSQL** | Baza de date | Suport nativ JSONB, DDL la runtime, GIN indexes |
| **Prisma** | ORM — doar pentru zona FIXA | Users, auth, sessions, entity_definitions, field_definitions, modules |
| **Knex.js** | Query builder — zona DINAMICA | Suporta `schema.alterTable()`, raw SQL, migrari programatice, matur si stabil |
| **class-validator + class-transformer** | Validare DTO-uri | Validare request-uri pe endpoint-urile fixe |

#### De ce doua librarii de DB?
- **Prisma** genereaza client la build time. Nu stie de tabelele create la runtime.
- **Knex** construieste query-uri la runtime din strings. Perfect pentru `SELECT cf_budget FROM projects WHERE cf_status = 'activ'`.
- Le folosesti in paralel: Prisma pentru tot ce e schema fixa, Knex pentru CRUD pe entitati dinamice.

### Frontend
| Tehnologie | Rol | De ce |
|---|---|---|
| **Nuxt 3** | Framework frontend | Deja in stack, SSR/SSG, file-based routing |
| **Nuxt UI** | Componente UI | Deja in stack, componente pre-built (UTable, UForm, UInput, USelect, UModal) |
| **VeeValidate + Zod** | Validare dinamica formulare | Zod permite construirea schemelor de validare programatic din JSON |

#### Instalare dependinte frontend:
```bash
npm install @vee-validate/zod zod
```
(Nuxt UI si Nuxt sunt deja instalate)

---

## FAZA 1 — Schema bazei de date (zona fixa, prin Prisma)
**Timp estimat: 2-3 zile**

### 1.1 Tabela `module`
Grupeaza entitatile in module logice (CRM, ERP Inventar, ERP Vanzari, etc.)
```sql
CREATE TABLE module (
  id_module     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(100) NOT NULL,        -- "CRM", "Inventar"
  slug          VARCHAR(100) NOT NULL UNIQUE,  -- "crm", "inventar"
  icon          VARCHAR(50),                   -- "i-heroicons-users", icon Nuxt UI
  position      INT NOT NULL DEFAULT 0,        -- ordinea in sidebar
  is_active     BOOLEAN NOT NULL DEFAULT true,
  date_created  TIMESTAMP NOT NULL DEFAULT now(),
  date_updated  TIMESTAMP NOT NULL DEFAULT now()
);
```

### 1.2 Tabela `entity`
Fiecare rand = o entitate (Contacte, Companii, Oportunitati, Produse...).
Contine referinta la tabela SQL reala din DB.
```sql
CREATE TABLE entity (
  id_entity         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_module         UUID NOT NULL REFERENCES module(id_module) ON DELETE CASCADE,
  name              VARCHAR(100) NOT NULL,        -- "Contacte"
  slug              VARCHAR(100) NOT NULL UNIQUE,  -- "contacts"
  table_name        VARCHAR(100) NOT NULL UNIQUE,  -- "ent_contacts" (numele tabelei SQL reale)
  icon              VARCHAR(50),                   -- icon Nuxt UI
  is_system         BOOLEAN NOT NULL DEFAULT false, -- true = nu poate fi sters de admin
  label_singular    VARCHAR(100),                  -- "Contact"
  label_plural      VARCHAR(100),                  -- "Contacte"
  rank              INT NOT NULL DEFAULT 0,
  date_created      TIMESTAMP NOT NULL DEFAULT now(),
  date_updated      TIMESTAMP NOT NULL DEFAULT now()
);
```

### 1.3 Tabela `field`
Fiecare rand = un camp al unei entitati.
Aceasta tabela este MOTORUL UI-ului — frontend-ul citeste asta si stie ce sa randeze.
```sql
CREATE TABLE field (
  id_field              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_entity             UUID NOT NULL REFERENCES entity(id_entity) ON DELETE CASCADE,

  -- Identificare
  name                  VARCHAR(100) NOT NULL,      -- "Industrie"
  slug                  VARCHAR(100) NOT NULL,      -- "industry" (folosit in API requests)
  column_name           VARCHAR(100) NOT NULL,      -- "cf_industry" (numele coloanei reale din SQL)

  -- Tip de date
  data_type             VARCHAR(50) NOT NULL,       -- "varchar", "integer", "numeric", "boolean", "date", "timestamp", "uuid", "text", "jsonb"
  ui_type               VARCHAR(50) NOT NULL,       -- "text", "textarea", "number", "select", "multi-select", "datepicker", "checkbox", "radio", "relation", "email", "phone", "currency", "file"
  default_value         TEXT,                       -- valoare default ca string (se casteaza pe backend dupa data_type)

  -- Configurare UI
  placeholder           VARCHAR(255),
  help_text             VARCHAR(500),               -- text ajutator sub camp
  options               JSONB,                      -- pentru select/radio: [{"label": "IT", "value": "it"}, {"label": "Finance", "value": "finance"}]
  is_required           BOOLEAN NOT NULL DEFAULT false,
  is_unique             BOOLEAN NOT NULL DEFAULT false,
  is_filterable         BOOLEAN NOT NULL DEFAULT true,  -- apare in panoul de filtre
  is_sortable           BOOLEAN NOT NULL DEFAULT true,  -- coloana poate fi sortata
  visible_in_table      BOOLEAN NOT NULL DEFAULT true,  -- apare in DynamicTable
  visible_in_form       BOOLEAN NOT NULL DEFAULT true,  -- apare in DynamicForm
  is_system             BOOLEAN NOT NULL DEFAULT false, -- true = camp fix, nu poate fi sters (ex: name, email)

  -- Validare
  validation_rules      JSONB,                      -- {"min_length": 2, "max_length": 100, "pattern": "^[a-zA-Z]+$", "min": 0, "max": 999999}

  -- Relatii (doar pentru ui_type = "relation")
  id_relation_entity     UUID REFERENCES entity(id_entity), -- entitatea tinta (ex: companies)
  relation_display_field VARCHAR(100),    -- ce camp sa afiseze ca label (ex: "name")

  -- Pozitionare
  group_name            VARCHAR(100) DEFAULT 'general', -- sectiune/tab in formular ("General", "Detalii financiare")
  position              INT NOT NULL DEFAULT 0,         -- ordinea in grup

  date_created          TIMESTAMP NOT NULL DEFAULT now(),
  date_updated          TIMESTAMP NOT NULL DEFAULT now(),

  UNIQUE(id_entity, slug),
  UNIQUE(id_entity, column_name)
);
```

#### Cum functioneaza campurile de tip `relation`:
- `ui_type = 'relation'` + `relation_entity_id` = UUID-ul entitatii tinta
- `relation_display_field` = slug-ul campului care se afiseaza in dropdown (ex: `name`)
- `data_type = 'uuid'` + `column_name = 'cf_company_id'`
- Backend-ul creeaza coloana cu `REFERENCES <target_table>(id)`
- Frontend-ul randeaza un `<USelectMenu>` care incarca optiunile din `GET /api/v1/data/:targetEntity?fields=id,:displayField`

### Taskuri Faza 1:
- [ ] Crearea migrarilor Prisma pentru `modules`, `entity_definitions`, `field_definitions`
- [ ] Seeding initial: modulul "CRM" + entitatea "contacts" + field definitions pentru campurile existente (name, email, phone, - marcate `is_system: true`)
- [ ] Verificare ca schema Prisma genereaza corect clientul

---

## FAZA 2 — Serviciul de DDL dinamic (Knex)
**Timp estimat: 3-4 zile**

Acest serviciu este responsabil de crearea/modificarea tabelelor SQL reale cand adminul adauga/modifica entitati si campuri.

### 2.1 `DynamicSchemaService` (NestJS Service)
Responsabilitati:
- `createEntityTable(entityDef)` → `CREATE TABLE` cu coloanele system (id, created_at, updated_at, owner_id, extra_data JSONB)
- `addColumn(entityDef, fieldDef)` → `ALTER TABLE ADD COLUMN` cu tipul corect
- `removeColumn(entityDef, fieldDef)` → `ALTER TABLE DROP COLUMN`
- `modifyColumn(entityDef, fieldDef, changes)` → doar modificari safe (rename, default, nullable)

#### Mapping data_type → SQL type:
```
varchar     → VARCHAR(255)
text        → TEXT
integer     → INTEGER
numeric     → NUMERIC(15,2)
boolean     → BOOLEAN DEFAULT false
date        → DATE
timestamp   → TIMESTAMP WITH TIME ZONE
uuid        → UUID REFERENCES <target>(id)   (doar pt relatii)
jsonb       → JSONB DEFAULT '{}'
```

#### Cum functioneaza flow-ul "Admin adauga camp custom":
```
1. Admin trimite POST /api/v1/admin/entities/:entityId/fields
   Body: { name: "Industrie", slug: "industry", data_type: "varchar", ui_type: "select", options: [...] }

2. Backend:
   a) Valideaza request-ul
   b) Genereaza column_name = "cf_" + slug → "cf_industry"
   c) INSERT in field_definitions (prin Prisma)
   d) ALTER TABLE contacts ADD COLUMN cf_industry VARCHAR(255);  (prin Knex)
   e) Daca is_filterable: CREATE INDEX idx_contacts_cf_industry ON contacts(cf_industry);
   f) Returneaza 201 cu field definition complet

3. Frontend: invalideaza cache-ul schemei → re-fetch → UI-ul afiseaza noul camp automat
```

#### Securitate DDL:
- Slug-ul trece printr-un regex strict: `/^[a-z][a-z0-9_]{1,50}$/`
- Column name e INTOTDEAUNA prefixat cu `cf_` (custom field) → imposibil de suprascris coloane system
- Table name e INTOTDEAUNA prefixat cu `ent_` → separare clara de tabelele system
- Nu se permite `DROP TABLE` din API — doar soft delete (flag `is_active = false`)

### Taskuri Faza 2:
- [ ] Configurare Knex in NestJS (modul separat `DynamicDatabaseModule`)
- [ ] Implementare `DynamicSchemaService` cu metodele: `createEntityTable`, `addColumn`, `removeColumn`
- [ ] Mapping complet `data_type` → SQL type (inclusiv relatii cu FK)
- [ ] Sanitizare si validare stricta a slug-urilor si numelor de coloane
- [ ] Creare index automat pe coloanele marcate `is_filterable`
- [ ] Unit tests pe `DynamicSchemaService` (testeaza ca ALTER TABLE se genereaza corect)

---

## FAZA 3 — API-uri CRUD generice pe entitati dinamice
**Timp estimat: 4-5 zile**

### 3.1 `DynamicDataController` (NestJS Controller)
Un SINGUR controller care serveste CRUD pentru ORICE entitate.

```
GET    /api/v1/data/:entitySlug            → Lista cu paginare, filtrare, sortare
GET    /api/v1/data/:entitySlug/:id        → Detalii un record
POST   /api/v1/data/:entitySlug            → Creare record nou
PUT    /api/v1/data/:entitySlug/:id        → Update record
DELETE /api/v1/data/:entitySlug/:id        → Stergere record (soft delete recomandat)
```

### 3.2 `DynamicQueryService` (NestJS Service)
Construieste query-uri SQL dinamic folosind Knex pe baza field_definitions.

#### Flow GET (listing):
```
1. Request: GET /api/v1/data/contacts?filter[cf_industry]=it&filter[name][contains]=Alex&sort=-created_at&page=1&limit=25

2. Backend:
   a) Gaseste entity_definition dupa slug "contacts" → ia table_name
   b) Incarca field_definitions pentru entitate (din cache Redis sau in-memory)
   c) Construieste SELECT: doar coloanele unde visible_in_table = true
   d) Aplica filtre:
      - "cf_industry = 'it'" (equality, camp custom, coloana reala)
      - "name ILIKE '%Alex%'" (contains, camp system)
   e) Aplica sort: ORDER BY created_at DESC
   f) Aplica paginare: LIMIT 25 OFFSET 0
   g) Executa query + COUNT query separat pentru total
   h) Returneaza { data: [...], meta: { total, page, limit, totalPages } }
```

#### Flow POST (create):
```
1. Request: POST /api/v1/data/contacts
   Body: { name: "Alex", email: "alex@test.com", cf_industry: "it", cf_revenue: 50000 }

2. Backend:
   a) Incarca field_definitions
   b) Valideaza FIECARE camp din body:
      - Exista in field_definitions? Daca nu → ignora (sau eroare strict mode)
      - Tipul e corect? cf_revenue trimis ca string dar data_type = numeric → cast sau eroare
      - is_required respectat? Daca name e required si lipseste → 400 error
      - is_unique respectat? SELECT COUNT din tabel → daca exista → 409 conflict
      - validation_rules respectate? min_length, max_length, pattern → validare
   c) Construieste INSERT dinamic cu Knex
   d) Returneaza 201 + record-ul creat
```

#### Operatori de filtrare suportati:
```
?filter[campo]=valoare                → WHERE campo = 'valoare'         (eq)
?filter[campo][contains]=text         → WHERE campo ILIKE '%text%'      (contains)
?filter[campo][starts_with]=text      → WHERE campo ILIKE 'text%'       (starts_with)
?filter[campo][gt]=100                → WHERE campo > 100               (greater than)
?filter[campo][gte]=100               → WHERE campo >= 100              (greater than or equal)
?filter[campo][lt]=100                → WHERE campo < 100               (less than)
?filter[campo][lte]=100               → WHERE campo <= 100              (less than or equal)
?filter[campo][in]=a,b,c              → WHERE campo IN ('a','b','c')    (in list)
?filter[campo][is_null]=true          → WHERE campo IS NULL             (null check)
?filter[campo][between]=10,100        → WHERE campo BETWEEN 10 AND 100  (range)
```

#### Prevenire SQL Injection:
- Toate valorile trec prin Knex parameterized queries (placeholder `?`)
- Numele de coloane sunt validate contra field_definitions (whitelist) — daca un camp nu exista in definitii, e respins
- Nu se concateneaza NICIODATA valori direct in query string

### Taskuri Faza 3:
- [ ] Implementare `DynamicDataController` cu cele 5 rute CRUD
- [ ] Implementare `DynamicQueryService` cu metodele: `findAll`, `findOne`, `create`, `update`, `delete`
- [ ] Implementare `FilterParserService` — parseaza query params in obiecte de filtrare
- [ ] Implementare `DynamicValidationService` — valideaza body-ul request-ului contra field_definitions
- [ ] Paginare: `{ data, meta: { total, page, limit, totalPages } }`
- [ ] Sortare: `?sort=name` (ASC), `?sort=-name` (DESC), `?sort=name,-created_at` (multiplu)
- [ ] Testare manuala cu Postman/Insomnia pe entitatea "contacts"
- [ ] Error handling unificat: 400 (validare), 404 (entitate/record), 409 (unique conflict)

---

## FAZA 4 — API-uri Admin pentru gestionare entitati si campuri
**Timp estimat: 2-3 zile**

Aceste endpoint-uri sunt folosite de adminul aplicatiei pentru a configura sistemul.

```
GET    /api/v1/admin/modules                          → Lista module
POST   /api/v1/admin/modules                          → Creare modul nou
PUT    /api/v1/admin/modules/:id                      → Update modul

GET    /api/v1/admin/entities                         → Lista entitati (toate sau per modul)
POST   /api/v1/admin/entities                         → Creare entitate noua (creeaza si tabela SQL)
PUT    /api/v1/admin/entities/:id                     → Update entitate (rename, icon, pozitie)
DELETE /api/v1/admin/entities/:id                     → Dezactivare entitate (soft delete)

GET    /api/v1/admin/entities/:id/fields              → Lista campuri ale entitatii
POST   /api/v1/admin/entities/:id/fields              → Adaugare camp nou (INSERT field_def + ALTER TABLE)
PUT    /api/v1/admin/entities/:id/fields/:fieldId     → Modificare camp (rename label, schimba optiuni, validari)
DELETE /api/v1/admin/entities/:id/fields/:fieldId     → Stergere camp (DELETE field_def + ALTER TABLE DROP COLUMN)

GET    /api/v1/schema/:entitySlug                     → Schema completa pentru frontend (field_definitions + entity_definition)
```

#### Endpoint-ul cheie: `GET /api/v1/schema/:entitySlug`
Acesta e endpoint-ul pe care frontend-ul il apeleaza pentru a sti ce sa randeze.
Response example:
```json
{
  "entity": {
    "slug": "contacts",
    "label_singular": "Contact",
    "label_plural": "Contacte",
    "icon": "i-heroicons-users"
  },
  "fields": [
    {
      "slug": "name",
      "name": "Nume",
      "column_name": "name",
      "data_type": "varchar",
      "ui_type": "text",
      "is_required": true,
      "is_filterable": true,
      "is_sortable": true,
      "visible_in_table": true,
      "visible_in_form": true,
      "validation_rules": { "min_length": 2, "max_length": 100 },
      "group_name": "general",
      "position": 0
    },
    {
      "slug": "company",
      "name": "Companie",
      "column_name": "cf_company_id",
      "data_type": "uuid",
      "ui_type": "relation",
      "relation_entity_slug": "companies",
      "relation_display_field": "name",
      "is_required": false,
      "visible_in_table": true,
      "visible_in_form": true,
      "group_name": "general",
      "position": 3
    },
    {
      "slug": "industry",
      "name": "Industrie",
      "column_name": "cf_industry",
      "data_type": "varchar",
      "ui_type": "select",
      "options": [
        { "label": "IT", "value": "it" },
        { "label": "Finance", "value": "finance" },
        { "label": "Sanatate", "value": "health" }
      ],
      "is_required": false,
      "is_filterable": true,
      "visible_in_table": true,
      "visible_in_form": true,
      "group_name": "detalii",
      "position": 0
    }
  ],
  "groups": ["general", "detalii"]
}
```

### Taskuri Faza 4:
- [ ] CRUD pe `modules` (simplu, Prisma)
- [ ] CRUD pe `entity_definitions` — POST apeleaza si `DynamicSchemaService.createEntityTable()`
- [ ] CRUD pe `field_definitions` — POST apeleaza si `DynamicSchemaService.addColumn()`
- [ ] Endpoint `GET /api/v1/schema/:entitySlug` optimizat cu cache in-memory (invalidat la orice modificare admin)
- [ ] Guard/Middleware pe rutele admin: doar userii cu rol `admin` pot accesa
- [ ] Validari: nu permiti stergerea campurilor `is_system`, nu permiti stergerea entitatilor `is_system`

---

## FAZA 5 — Frontend: Composable `useEntitySchema`
**Timp estimat: 1-2 zile**

### 5.1 Composable `useEntitySchema.ts`
```typescript
// Responsabilitati:
// - Fetch schema de la GET /api/v1/schema/:entitySlug
// - Cache in memorie (nu re-fetch la fiecare navigare)
// - Expune: fields, tableFields, formFields, filterFields, groups, entity metadata
// - Functii helper: getFieldBySlug(), getFieldsByGroup(), getRelationOptions()

const schema = useEntitySchema('contacts')
// schema.entity        → { slug, label_singular, label_plural, icon }
// schema.fields        → toate campurile
// schema.tableFields   → fields.filter(f => f.visible_in_table) ordonate dupa position
// schema.formFields    → fields.filter(f => f.visible_in_form) grupate dupa group_name
// schema.filterFields  → fields.filter(f => f.is_filterable)
```

### 5.2 Composable `useEntityData.ts`
```typescript
// Responsabilitati:
// - CRUD operations pe GET/POST/PUT/DELETE /api/v1/data/:entitySlug
// - Gestioneaza starea: loading, error, data, pagination
// - Aplica filtre si sortare in query params
// - Expune: items, total, page, fetch(), create(), update(), remove()

const { items, total, loading, fetch, create } = useEntityData('contacts')
await fetch({ filter: { cf_industry: 'it' }, sort: '-created_at', page: 1 })
```

### Taskuri Faza 5:
- [ ] Implementare `useEntitySchema.ts` cu `useFetch` / `useAsyncData` si caching
- [ ] Implementare `useEntityData.ts` cu CRUD complet + paginare + filtrare
- [ ] Tipuri TypeScript: `EntitySchema`, `FieldDefinition`, `FilterParams`, `PaginatedResponse<T>`
- [ ] Tratare erori: toast notifications pe erori de API (Nuxt UI `useToast()`)

---

## FAZA 6 — Frontend: Componenta `DynamicTable.vue`
**Timp estimat: 3-4 zile**

### Cum functioneaza:
```vue
<DynamicTable entity="contacts" />
```
Atat. Componenta face totul singura:
1. Apeleaza `useEntitySchema('contacts')` → primeste lista de campuri vizibile in tabel
2. Apeleaza `useEntityData('contacts')` → primeste datele
3. Genereaza coloanele `<UTable>` din Nuxt UI dinamic
4. Randeaza fiecare celula cu formatare corecta per `ui_type`:
   - `text/email/phone` → text simplu
   - `select` → badge cu label-ul optiunii
   - `relation` → link catre entitatea relationata
   - `boolean` → icon check/x
   - `date/timestamp` → formatat cu `Intl.DateTimeFormat`
   - `currency` → formatat cu `Intl.NumberFormat`
5. Header de filtre: un rand deasupra tabelului cu input-uri adaptate per tip de camp
6. Sortare: click pe header coloana → toggle ASC/DESC
7. Paginare: footer cu numar pagini, items per page

### Taskuri Faza 6:
- [ ] Componenta `DynamicTable.vue` cu props: `entity` (string, obligatoriu)
- [ ] Generare dinamica coloane din schema (`tableFields`)
- [ ] Componenta `DynamicCell.vue` — randeaza o celula diferit in functie de `ui_type`
- [ ] Bara de filtre dinamica: `DynamicFilters.vue` (genereaza input-uri din `filterFields`)
- [ ] Sortare pe click header (single si multi-column)
- [ ] Paginare cu `UPagination` din Nuxt UI
- [ ] Buton "Adauga" care deschide `DynamicForm` in modal sau navigheaza la pagina de creare
- [ ] Loading state, empty state, error state

---

## FAZA 7 — Frontend: Componenta `DynamicForm.vue`
**Timp estimat: 3-4 zile**

### Cum functioneaza:
```vue
<DynamicForm entity="contacts" :record-id="route.params.id" @saved="onSaved" />
```
1. Apeleaza `useEntitySchema('contacts')` → primeste campurile vizibile in form, grupate
2. Daca `recordId` exista → fetch record existent (mode edit), altfel mode create
3. Genereaza formularul dinamic:
   - Itereaza `groups` → fiecare grup devine o sectiune (sau tab)
   - In fiecare grup, itereaza `formFields` → randeaza componentul potrivit

### Mapping `ui_type` → Componenta Nuxt UI:
```
text        → <UInput type="text" />
textarea    → <UTextarea />
number      → <UInput type="number" />
email       → <UInput type="email" />
phone       → <UInput type="tel" />
select      → <USelectMenu :options="field.options" />
multi-select→ <USelectMenu multiple :options="field.options" />
checkbox    → <UCheckbox />
radio       → <URadioGroup :options="field.options" />
datepicker  → <UInput type="date" />  (sau componenta custom)
relation    → <USelectMenu> care incarca optiuni din API-ul entitatii tinta
currency    → <UInput type="number"> cu prefix moneda
file        → <input type="file"> custom cu upload
```

### Validare dinamica cu Zod:
```typescript
// Se construieste schema Zod din field_definitions la runtime:
function buildZodSchema(fields: FieldDefinition[]) {
  const shape: Record<string, ZodType> = {}
  for (const field of fields) {
    let rule = z.string()
    if (field.data_type === 'integer') rule = z.number().int()
    if (field.data_type === 'numeric') rule = z.number()
    if (field.data_type === 'boolean') rule = z.boolean()
    // ... etc per data_type

    if (field.validation_rules?.min_length) rule = rule.min(field.validation_rules.min_length)
    if (field.validation_rules?.max_length) rule = rule.max(field.validation_rules.max_length)
    if (field.validation_rules?.pattern) rule = rule.regex(new RegExp(field.validation_rules.pattern))

    if (!field.is_required) rule = rule.optional().nullable()

    shape[field.slug] = rule
  }
  return z.object(shape)
}
```

### Taskuri Faza 7:
- [ ] Componenta `DynamicForm.vue` cu props: `entity`, `recordId?`, emit `saved`
- [ ] Componenta `DynamicField.vue` — randeaza campul corect dupa `ui_type` (wrapper peste `<component :is>`)
- [ ] Grupare campuri in sectiuni/tab-uri dupa `group_name`
- [ ] Constructie schema Zod dinamica din `field_definitions`
- [ ] Integrare `vee-validate` cu schema Zod generata
- [ ] Mode create: formular gol, POST pe submit
- [ ] Mode edit: pre-populare cu datele existente, PUT pe submit
- [ ] Campuri de tip `relation`: fetch optiuni din API-ul entitatii tinta, search async
- [ ] Loading state pe submit, error handling cu toast

---

## FAZA 8 — Routing dinamic Nuxt
**Timp estimat: 1 zi**

### Structura fisiere:
```
pages/
  [entity]/
    index.vue       → lista (DynamicTable)
    create.vue      → formular creare (DynamicForm fara recordId)
    [id].vue        → formular editare (DynamicForm cu recordId)
```

### Cum functioneaza:
- `/contacts` → `[entity]/index.vue` cu `entity = 'contacts'` → randeaza DynamicTable
- `/contacts/create` → `[entity]/create.vue` → randeaza DynamicForm in mode create
- `/contacts/abc-123` → `[entity]/[id].vue` → randeaza DynamicForm in mode edit
- `/companies` → aceleasi pagini, dar cu `entity = 'companies'`
- Sidebar-ul se genereaza din `GET /api/v1/admin/modules` + entitatile fiecarui modul

### Taskuri Faza 8:
- [ ] Creare `pages/[entity]/index.vue`
- [ ] Creare `pages/[entity]/create.vue`
- [ ] Creare `pages/[entity]/[id].vue`
- [ ] Middleware Nuxt: valideaza ca `:entity` exista (altfel redirect 404)
- [ ] Sidebar dinamic: composable `useNavigation.ts` care genereaza meniul din API

---

## FAZA 9 — Cache, performanta, polish
**Timp estimat: 2-3 zile**

### Taskuri:
- [ ] Cache schema pe backend: in-memory Map sau Redis, invalidat la orice operatie admin pe fields/entities
- [ ] Cache schema pe frontend: `useState()` Nuxt persistent, invalidare manuala sau TTL
- [ ] Indexare automata: la crearea campului filterable, backend-ul creeaza B-Tree index
- [ ] Soft delete pe records: coloana `deleted_at` in fiecare tabela dinamica, filtrare automata `WHERE deleted_at IS NULL`
- [ ] Audit log: tabela `audit_logs` (entity, record_id, action, old_values, new_values, user_id, timestamp)
- [ ] Error handling consistent: middleware NestJS global care returneaza format unificat `{ success, data, error, message }`
- [ ] Loading skeletons pe DynamicTable si DynamicForm

---

## Timp total estimat (mid web developer)

| Faza | Descriere | Timp |
|---|---|---|
| Faza 1 | Schema DB (Prisma) | 2-3 zile |
| Faza 2 | DDL dinamic (Knex) | 3-4 zile |
| Faza 3 | API CRUD generic | 4-5 zile |
| Faza 4 | API Admin entitati/campuri | 2-3 zile |
| Faza 5 | Composables frontend | 1-2 zile |
| Faza 6 | DynamicTable | 3-4 zile |
| Faza 7 | DynamicForm | 3-4 zile |
| Faza 8 | Routing dinamic | 1 zi |
| Faza 9 | Cache, polish, audit | 2-3 zile |
| **TOTAL** | | **~22-30 zile lucratoare (5-7 saptamani)** |

Nota: estimarea presupune lucru full-time, fara intreruperi majore, si fara module extra (rapoarte, export, import, permisiuni per camp). Fiecare modul extra adauga 1-2 saptamani.
