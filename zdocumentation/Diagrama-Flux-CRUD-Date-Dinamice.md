# Diagrama flux CRUD date dinamice

Acest document descrie fluxul datelor din backend-ul CRM: cum ajung datele de la client la baza de date și înapoi, pentru operațiunile CRUD pe entități dinamice (contacts, companies etc.).

---

## 1. Flux GET – Listă (findAll)

```mermaid
flowchart TD
    A[Client: GET /api/v1/data/:entitySlug] --> B[DynamicDataController.findAll]
    B --> C[DynamicDataService.findAll]
    C --> D[resolveEntity: Prisma entity + fields]
    D --> E[FilterParserService.parse query params]
    E --> F[Knex: SELECT + filtre + sortare]
    F --> G[Knex: COUNT pentru total]
    G --> H[limit + offset paginare]
    H --> I[Returnează data + meta]
```

**Pași:**
1. Client trimite `GET /api/v1/data/contacts` cu query params opționali: `page`, `limit`, `sort`, `filter[camp]`
2. `resolveEntity` încarcă din Prisma metadata entității și câmpurilor (slug → `table_name`)
3. `FilterParserService` parsează `filter[name]=Alex` sau `filter[age][gt]=18` în obiecte `{ column, operator, value }`
4. Query-ul Knex selectează coloanele sistem (`id`, `date_created`, `date_updated`, `id_owner`) + câmpurile cu `visible_in_table`
5. Se aplică filtre, sortare (default: `date_created` desc), paginare
6. Răspuns: `{ data: [...], meta: { total, page, limit, totalPages } }`

**Fișiere:** `dynamic-data.controller.ts`, `dynamic-data.service.ts`, `filter-parser.service.ts`

---

## 2. Flux GET – Un singur record (findOne)

```mermaid
flowchart TD
    A[Client: GET /api/v1/data/:entitySlug/:id] --> B[DynamicDataController.findOne]
    B --> C[DynamicDataService.findOne]
    C --> D[resolveEntity]
    D --> E[Knex: SELECT where id = :id]
    E --> F{Record există?}
    F -->|Nu| G[NotFoundException]
    F -->|Da| H[Returnează data: record]
```

**Pași:**
1. Client trimite `GET /api/v1/data/contacts/abc-123`
2. Se rezolvă entitatea și se construiește query-ul Knex pe `table_name`
3. Se selectează recordul după `id`
4. Dacă nu există → `NotFoundException`
5. Răspuns: `{ data: record }`

**Fișiere:** `dynamic-data.controller.ts`, `dynamic-data.service.ts`

---

## 3. Flux POST – Creare (create)

```mermaid
flowchart TD
    A[Client: POST /api/v1/data/:entitySlug] --> B[DynamicDataController.create]
    B --> C[DynamicDataService.create]
    C --> D[resolveEntity]
    D --> E[DynamicValidationService.validateAndSanitize]
    E --> F{Campuri valide?}
    F -->|Nu| G[BadRequestException / ConflictException]
    F -->|Da| H[Knex: INSERT + date_created, date_updated]
    H --> I[returning '*']
    I --> J[returnValidResponse mesaj + data]
```

**Pași:**
1. Client trimite `POST /api/v1/data/contacts` cu body `{ name: "Alex", email: "..." }`
2. `validateAndSanitize` verifică: câmpuri obligatorii (`is_required`), tipuri de date, reguli (`min_length`, `max`, `pattern`), unicitate (`is_unique`)
3. Valorile sunt castate după `data_type` (integer, numeric, boolean)
4. Dacă validarea eșuează → `BadRequestException` sau `ConflictException`
5. Knex face `INSERT` cu date sanitizate + `date_created`, `date_updated`
6. Răspuns: `{ mesaj, data, cod: 200 }` via `returnValidResponse`

**Fișiere:** `dynamic-data.controller.ts`, `dynamic-data.service.ts`, `dynamic-validation.service.ts`, `crud.utils.ts`

---

## 4. Flux PUT – Actualizare (update)

```mermaid
flowchart TD
    A[Client: PUT /api/v1/data/:entitySlug/:id] --> B[DynamicDataController.update]
    B --> C[DynamicDataService.update]
    C --> D[resolveEntity]
    D --> E{Record există?}
    E -->|Nu| F[NotFoundException]
    E -->|Da| G[DynamicValidationService.validateAndSanitize mode update]
    G --> H{Campuri valide?}
    H -->|Nu| I[BadRequestException / ConflictException]
    H -->|Da| J[Knex: UPDATE where id + date_updated]
    J --> K[returning '*']
    K --> L[returnValidResponse mesaj + data]
```

**Pași:**
1. Client trimite `PUT /api/v1/data/contacts/abc-123` cu body parțial sau complet
2. Se verifică existența recordului
3. La `update`, câmpurile `required` nu sunt obligatorii dacă nu sunt trimise; se validează doar câmpurile trimise
4. La verificarea unicității, se exclude recordul curent (`whereNot('id', recordId)`)
5. Knex face `UPDATE` cu date sanitizate + `date_updated`
6. Răspuns: `{ mesaj, data, cod: 200 }`

**Fișiere:** `dynamic-data.controller.ts`, `dynamic-data.service.ts`, `dynamic-validation.service.ts`, `crud.utils.ts`

---

## 5. Flux DELETE – Ștergere (remove)

```mermaid
flowchart TD
    A[Client: DELETE /api/v1/data/:entitySlug/:id] --> B[DynamicDataController.remove]
    B --> C[DynamicDataService.remove]
    C --> D[resolveEntity]
    D --> E[Knex: DEL where id]
    E --> F{Rânduri șterse?}
    F -->|0| G[NotFoundException]
    F -->|1+| H[returnValidResponse mesaj + null]
```

**Pași:**
1. Client trimite `DELETE /api/v1/data/contacts/abc-123`
2. Knex execută `DEL` pe tabela entității
3. Dacă `deleted === 0` → `NotFoundException`
4. Răspuns: `{ mesaj, data: null, cod: 200 }`

**Fișiere:** `dynamic-data.controller.ts`, `dynamic-data.service.ts`, `crud.utils.ts`

---

## 6. Diagramă secvență – flux complet Create + Get

```mermaid
sequenceDiagram
    participant C as Client
    participant DC as DynamicDataController
    participant DS as DynamicDataService
    participant P as Prisma
    participant DV as DynamicValidationService
    participant K as Knex
    participant AG as AuthGuard

    C->>DC: POST /v1/data/contacts [Authorization: Bearer token]
    DC->>AG: AuthGuard verifică JWT
    AG-->>DC: request.user
    DC->>DS: create(entitySlug, body)
    DS->>P: entity.findUnique + field.findMany
    P-->>DS: entity, fields
    DS->>DV: validateAndSanitize(body, fields, 'create')
    DV->>DV: required, type cast, validation_rules
    DV->>K: verifică unique (dacă există)
    K-->>DV: ok
    DV-->>DS: sanitized
    DS->>K: INSERT + returning
    K-->>DS: record
    DS-->>DC: { data }
    DC->>DC: returnValidResponse(mesaj, data)
    DC-->>C: { mesaj, data, cod: 200 }

    C->>DC: GET /v1/data/contacts/:id
    DC->>DS: findOne(entitySlug, id)
    DS->>P: entity + fields
    P-->>DS: entity + fields
    DS->>K: SELECT where id
    K-->>DS: record
    DS-->>C: { data: record }
```

---

## 7. Resurse și dependențe

| Resursă | Rol |
| ------- | --- |
| **Prisma** | Metadata: `Entity` (slug, table_name), `Field` (column_name, data_type, validation_rules, is_required, is_unique) |
| **Knex** | Acces la tabelele fizice (INSERT, UPDATE, DELETE, SELECT) – datele reale |
| **AuthGuard** | Toate rutele `/v1/data/*` necesită JWT valid |

---

## 8. Fișiere relevante

| Fișier | Rol |
| ------ | --- |
| `server/src/dynamic-data/dynamic-data.controller.ts` | Endpoint-uri CRUD: GET, POST, PUT, DELETE |
| `server/src/dynamic-data/dynamic-data.service.ts` | Logică principală: resolveEntity, findAll, findOne, create, update, remove |
| `server/src/dynamic-data/filter-parser.service.ts` | Parsează query params `filter[camp]` și aplică filtre pe Knex |
| `server/src/dynamic-data/dynamic-validation.service.ts` | Validare și sanitizare body: required, tipuri, reguli, unicitate |
| `server/src/utils/crud.utils.ts` | `returnValidResponse` – format standard răspuns succes |
