# CLAUDE.md — Moduvis

## What is Moduvis?

Moduvis is a **platform builder for non-technical people**. Unlike traditional B2B SaaS where the vendor defines the data model, Moduvis inverts that: **business domain experts** (not programmers) define their own modules — CRM, HR, ERP, WMS, inventory management, or any custom module — and use them with their team.

The product is designed to be **fool-proof**: the frontend minimizes the chance of user error through schema-driven validation at every level.

### Core philosophy

- **Backend controls everything**: what entities exist, what fields they have, how the UI renders. The frontend knows nothing hardcoded — it asks the API for the schema and renders everything dynamically.
- **Real SQL columns, not JSONB**: When an admin adds a custom field, the backend runs `ALTER TABLE ADD COLUMN`. This preserves foreign keys, B-tree indexes, native sorting, and SQL aggregation — all things JSONB can't do well.
- **Visual business logic**: Workflows (built in n8n) are attached to entities as "actions" — buttons that appear on records and execute automated processes.

---

## Project structure

```
CRM/
├── client/               # Nuxt 3 frontend
│   ├── app/
│   │   ├── components/   # Vue components
│   │   │   ├── dynamic/  # DynamicTable, DynamicForm, DynamicCell, DynamicField, DynamicFilters
│   │   │   ├── admin/    # EntityForm, FieldForm, ModuleForm
│   │   │   └── workflow/ # WorkflowBuilder, NodePalette, NodeConfigPanel
│   │   ├── composables/  # useEntitySchema, useEntityData, useNavigation, useApi, etc.
│   │   ├── pages/        # Dynamic routing: [entity]/index, [entity]/create, [entity]/[id]
│   │   ├── types/        # TypeScript interfaces (EntitySchema, Field, etc.)
│   │   └── utils/        # buildZodSchema, formLayout, string/bool utils
│   └── nuxt.config.ts
├── server/               # NestJS backend
│   ├── prisma/           # Prisma schema for FIXED tables only (User, Entity, Field, Module, etc.)
│   ├── src/
│   │   ├── tenant/       # Multi-tenant: middleware, connection pools, provisioning
│   │   ├── auth/         # JWT auth (login, register, JWT strategy)
│   │   ├── dynamic-schema/  # DDL at runtime: CREATE TABLE, ALTER TABLE ADD/DROP COLUMN
│   │   ├── dynamic-data/    # Generic CRUD controller for ALL entities
│   │   ├── schema/       # GET /v1/schema/:entitySlug — the endpoint that drives the UI
│   │   ├── admin/        # CRUD for modules, entities, fields (admin-only)
│   │   ├── actions/      # Entity actions + workflow definitions
│   │   ├── n8n/          # n8n API client, webhook handler, workflow sync
│   │   ├── events/       # Event emitter for entity lifecycle hooks
│   │   ├── knex/         # Knex.js module
│   │   ├── filters/      # Global exception filter
│   │   └── guards/       # Roles guard + decorator
│   └── test/
└── docker/               # Docker Compose: Traefik, frontend, backend, postgres, n8n
```

---

## Tech stack

| Layer | Technology | Role |
|-------|-----------|------|
| Backend framework | **NestJS 11** | Modular API framework |
| Fixed-schema ORM | **Prisma** | Only for system tables: User, Module, Entity, Field, Role, etc. |
| Dynamic queries | **Knex.js** | Raw SQL for dynamically-created entity tables (Prisma can't handle tables created at runtime) |
| Database | **PostgreSQL 16** | One database per tenant + one meta database |
| Auth | **Passport.js + JWT** | Bearer token auth |
| Frontend framework | **Nuxt 3** | SSR, file-based routing |
| UI components | **Nuxt UI v4** | UTable, UForm, UInput, USelect, etc. |
| Dynamic validation | **Zod 4** | Validation schemas built at runtime from field definitions |
| Workflow engine | **n8n** | Visual workflow builder, webhook execution |
| Visual builder | **Vue Flow** | In-app workflow node editor |
| Reverse proxy | **Traefik** | Routing, SSL, multi-tenant hostname matching |

### Why TWO database libraries?

- **Prisma** generates its client at build time. It cannot know about tables created at runtime.
- **Knex** builds queries at runtime from strings. Perfect for `SELECT cf_budget FROM projects WHERE cf_status = 'activ'`.
- They run in parallel: Prisma for the fixed schema zone, Knex for CRUD on dynamic entities.

---

## Multi-tenant architecture

Each tenant gets **its own PostgreSQL database** (database-per-tenant isolation). A meta database stores billing/tenant info.

### Request flow

1. **TenantMiddleware** (global, excludes `/health`) resolves the tenant:
   - From subdomain: `crmclient.stanciulescu.xyz` → tenant slug `crmclient`
   - From `X-Tenant` header (login before JWT is available)
   - From JWT payload (`dbName` claim embedded in token)
   - DEV fallback: `DEFAULT_TENANT_DB` from env
2. **TenantConnectionManager** maintains a pool of Knex connections per tenant database. Idle pools are evicted after 30 minutes.
3. **TenantContext** (AsyncLocalStorage) stores the current request's Knex instance, tenant slug, and DB name. Every service accesses `this.tenantContext.knex` — never a global connection.

### Key files

- `server/src/tenant/tenant.middleware.ts` — resolution logic
- `server/src/tenant/tenant-connection.manager.ts` — connection pooling
- `server/src/tenant/tenant-context.service.ts` — AsyncLocalStorage wrapper
- `server/src/tenant/tenant-provisioning.service.ts` — creating new tenant DBs

---

## Dynamic schema system

This is the core of Moduvis. When an admin configures the system, the database structure changes at runtime.

### Fixed tables (Prisma, in every tenant DB)

- **`module`** — Groups entities into logical modules (CRM, ERP, etc.)
- **`entity`** — Each row is one entity (Contacts, Companies, Products). Contains `table_name` pointing to the real SQL table.
- **`field`** — Each row is one field of an entity. This is the **engine of the UI** — the frontend reads this and knows what to render.
- **`user`**, **`role`**, **`user_role`**, **`role_permission`** — RBAC system
- **`action_definition`** — Actions tied to entities that execute workflows
- **`workflow_definition`** — Workflow definitions (nodes, connections)

### Dynamic tables (Knex, created at runtime)

- Named with `ent_` prefix: `ent_contacts`, `ent_companies`, `ent_products`
- System columns: `id` (UUID PK), `date_created`, `date_updated`, `id_owner`, `extra_data` (JSONB overflow)
- Custom columns: `cf_` prefix: `cf_industry`, `cf_revenue`, `cf_company_id`
- FK columns (for relations) are real PostgreSQL foreign keys

### Data type mapping

```
varchar    → VARCHAR(255)
text       → TEXT
integer    → INTEGER
numeric    → NUMERIC(15,2)
boolean    → BOOLEAN DEFAULT false
date       → DATE
timestamp  → TIMESTAMP WITH TIME ZONE
uuid       → UUID (with FK if relation)
jsonb      → JSONB DEFAULT '{}'
```

### UI type mapping (ui_type → form component)

```
text        → UInput type="text"
textarea    → UTextarea
number      → UInput type="number"
email       → UInput type="email"
phone       → UInput type="tel"
select      → USelectMenu (options from field.options)
multi-select→ USelectMenu multiple
checkbox    → UCheckbox
radio       → URadioGroup
datepicker  → date input
relation    → USelectMenu that fetches from target entity API
currency    → number input with currency formatting
file        → file upload
```

### Security for DDL operations

- Slugs are validated against `/^[a-z][a-z0-9_]{1,50}$/`
- Column names are ALWAYS prefixed with `cf_` — impossible to overwrite system columns
- Table names are ALWAYS prefixed with `ent_` — clear separation from system tables
- No `DROP TABLE` from the API — only soft delete via `is_active = false`
- All values go through Knex parameterized queries — no SQL string concatenation
- Column names are validated against field_definitions (whitelist) before use in queries

---

## API design

### Generic CRUD for any entity

```
GET    /api/v1/data/:entitySlug           → List (paginated, filtered, sorted)
GET    /api/v1/data/:entitySlug/:id       → Single record
POST   /api/v1/data/:entitySlug           → Create record
PUT    /api/v1/data/:entitySlug/:id       → Update record
DELETE /api/v1/data/:entitySlug/:id       → Delete record
```

### Schema endpoint (drives the entire UI)

```
GET /api/v1/schema/:entitySlug
```

Returns entity metadata + all fields + groups. The frontend uses nothing else to render tables and forms.

### Admin endpoints (require `admin` role)

```
GET    /api/v1/admin/modules
POST   /api/v1/admin/modules
PUT    /api/v1/admin/modules/:id

GET    /api/v1/admin/entities
POST   /api/v1/admin/entities              → Creates SQL table via DynamicSchemaService
PUT    /api/v1/admin/entities/:id
DELETE /api/v1/admin/entities/:id          → Soft delete

GET    /api/v1/admin/entities/:id/fields
POST   /api/v1/admin/entities/:id/fields   → ALTER TABLE ADD COLUMN
PUT    /api/v1/admin/entities/:id/fields/:fieldId
DELETE /api/v1/admin/entities/:id/fields/:fieldId  → ALTER TABLE DROP COLUMN
```

### Filter operators (query string)

```
?filter[field]=value                → WHERE field = 'value'
?filter[field][contains]=text       → WHERE field ILIKE '%text%'
?filter[field][starts_with]=text    → WHERE field ILIKE 'text%'
?filter[field][gt]=100              → WHERE field > 100
?filter[field][gte]=100             → WHERE field >= 100
?filter[field][lt]=100              → WHERE field < 100
?filter[field][lte]=100             → WHERE field <= 100
?filter[field][in]=a,b,c            → WHERE field IN ('a','b','c')
?filter[field][is_null]=true        → WHERE field IS NULL
?filter[field][between]=10,100      → WHERE field BETWEEN 10 AND 100
```

### Response format

```json
// Success
{ "success": true, "message": "...", "data": { ... } }

// Error (GlobalExceptionFilter)
{ "success": false, "statusCode": 400, "error": "BadRequest", "message": "..." }

// Paginated list
{ "data": [...], "meta": { "total": 150, "page": 1, "limit": 25, "totalPages": 6 } }
```

---

## Frontend architecture

### Dynamic routing

Three pages serve ALL entities through Nuxt dynamic routes:

- `pages/[entity]/index.vue` → `<DynamicTable :entity="entity" />`
- `pages/[entity]/create.vue` → `<DynamicForm :entity="entity" />`
- `pages/[entity]/[id].vue` → `<DynamicForm :entity="entity" :record-id="id" />`

Middleware `validate-entity.ts` checks that `:entity` exists in the schema before rendering.

### Core composables

- **`useEntitySchema(entitySlug)`** — Fetches schema from `/v1/schema/:slug`, caches in memory. Returns `entity`, `tableFields`, `formFields`, `filterFields`, `groups`, and helper functions.
- **`useEntityData(entitySlug)`** — CRUD operations on dynamic entities. Returns `items`, `meta`, `fetchItems()`, `create()`, `update()`, `remove()`.
- **`useNavigation()`** — Fetches modules + entities from `/v1/admin/modules` to generate sidebar links dynamically. Also provides `isAdmin` check.
- **`useApi()`** — Creates an `$fetch` instance with base URL, JWT token, and `X-Tenant` header injected automatically.
- **`useTenant()`** — Resolves current tenant slug from hostname (extracts subdomain before `.stanciulescu.xyz`).
- **`useEntityActions(entitySlug)`** — Fetches active actions for an entity to show action buttons.
- **`useWorkflowBuilder()`** — Manages Vue Flow state for the in-app workflow editor.

### DynamicTable.vue

The table component accepts only `entity` (slug string) and does everything else:
1. Fetches schema via `useEntitySchema`
2. Fetches data via `useEntityData`
3. Generates columns from `tableFields` with sortable headers
4. Renders cells via `DynamicCell` (different rendering per `ui_type`)
5. Provides filter bar via `DynamicFilters`
6. Supports column visibility toggling
7. Row selection with bulk delete
8. Actions dropdown per row (edit, copy ID, entity actions, delete)
9. Server-side pagination with Nuxt UI `UPagination`

### DynamicForm.vue

Accepts `entity` and optional `recordId`. Handles both create and edit modes:
1. Fetches schema and builds Zod validation schema at runtime via `buildZodSchema()`
2. Groups fields by `group_name` — renders as tabs if > 1 group
3. Each field is rendered by `DynamicField` which maps `ui_type` to Nuxt UI components
4. Relation fields use `RelationSelect` which fetches options from the target entity's API
5. Field layout uses CSS Grid with `grid_col` and `col_span` from field definitions
6. On validation error, automatically switches to the tab containing the invalid field
7. Shows metadata panel in edit mode (created date, updated date, owner)

---

## Actions & Workflows system

### Concepts

- **Workflow** (`workflow_definition`) — A visual workflow defined in the in-app builder (Vue Flow) or synced to n8n. Contains nodes and connections as JSON.
- **Action** (`action_definition`) — Links to a workflow, defines trigger events, and controls visibility. Can be:
  - **Manual**: Appears as a button on records (via `show_in_ui: true`)
  - **Auto**: Triggered by entity lifecycle events (`entity.before_insert`, `entity.after_insert`, `entity.before_update`, `entity.after_update`, `entity.before_delete`, `entity.after_delete`)

### Execution flow

1. User clicks action button on a record → `POST /api/v1/actions/:entitySlug/:actionSlug/execute` with `recordId`
2. `ActionService.executeManual()` looks up the action, loads the record, calls `WorkflowSyncService.executeWorkflow()`
3. `WorkflowSyncService` calls n8n webhook with record data + context
4. n8n workflow runs and returns results
5. Response is checked for CRM error patterns (`{ success: false, message: "..." }`) and propagated back to the UI

### Event system

`EntityEventsService` emits events on all CRUD operations:
- Generic: `entity.before_insert`, `entity.after_insert`, etc.
- Specific: `entity.after_insert.contacts`, `entity.after_update.companies`, etc.

`ActionService` listens to these events via `@OnEvent` decorators and evaluates auto-trigger actions. Actions can have `trigger_conditions` to filter which records trigger them.

---

## n8n Integration

- **N8nApiClient** (`server/src/n8n/n8n-api.client.ts`) — REST client for n8n's API: create/update/activate/deactivate/delete workflows
- **WorkflowSyncService** (`server/src/n8n/workflow-sync.service.ts`) — Syncs workflow definitions from Moduvis to n8n and vice versa
- **N8nWebhookController** (`server/src/n8n/n8n-webhook.controller.ts`) — Receives incoming webhooks from n8n (e.g., workflow completion callbacks)

n8n runs as a Docker service alongside the app.

---

## RBAC (Role-Based Access Control)

- **Role** — Named roles (admin, sales_rep, viewer) with `is_system` flag
- **UserRole** — Many-to-many between users and roles (permissions are additive: union of all role permissions)
- **RolePermission** — `id_role` + `id_module` (nullable) + `id_entity` (nullable) + `action` (create/read/update/delete/manage)
- Permissions can be: global (both null), module-level, or entity-level
- Admin routes are guarded by `RolesGuard` checking for `admin` role

---

## Development setup

### Prerequisites
- Docker Desktop
- Node.js 22+
- pnpm (frontend)

### Development environment

The primary developer works on **Windows 11** with **PowerShell 5.1** as the terminal. All shell commands in this document and in AI tool invocations should use **PowerShell syntax**, not bash.

Key PowerShell differences to keep in mind:

- Chain commands with `;` (not `&&` or `||`): `npm install; npm run dev`
- Environment variables: `$env:NODE_ENV` (read), `$env:NODE_ENV = "production"` (set)
- No `export` — use `$env:VAR = "value"` instead
- No `2>/dev/null` — redirect to `$null`: `2>$null`
- No `head`/`tail` — use `Select-Object -First N` / `Select-Object -Last N` or `Get-Content -Tail N`
- No `touch` — use `New-Item -ItemType File path`
- No `mkdir -p` — use `New-Item -ItemType Directory -Force path`
- Paths: use forward slashes in code (`D:/Projects/CRM`), but backslashes work in PowerShell (`D:\Projects\CRM`)
- `&&` and `||` are NOT valid PowerShell operators — use `if ($?) { ... }` for conditional execution

### Quick start

```bash
# 1. Start database
cd docker && docker compose up -d postgres

# 2. Start backend (terminal 1)
cd server && npm install && npm run dev
# Runs on :4000, needs server/.env with:
#   DATABASE_URL=postgresql://user:pass@localhost:7432/devdb
#   FRONTEND_URL=http://localhost:3000
#   JWT_SECRET=dev-secret-key

# 3. Start frontend (terminal 2)
cd client && pnpm install && pnpm dev
# Runs on :3000, needs client/.env with:
#   NUXT_PUBLIC_API_BASE=http://localhost:4000/api

# 4. Run migrations (if needed)
cd server && npm run db:migrate

# 5. Reset database
cd server && npm run db-dev-restart
```

### Environment variables

**server/.env**:
| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `FRONTEND_URL` | CORS allowed origin |
| `JWT_SECRET` | JWT signing secret |
| `DB_HOST/DB_PORT/DB_USER/DB_PASSWORD` | Database connection details |
| `META_DB` | Meta database name |
| `DEFAULT_TENANT_SLUG` / `DEFAULT_TENANT_DB` | Dev tenant fallback |
| `DOMAIN_BASE` | Base domain for multi-tenant hostname resolution |
| `N8N_API_URL` / `N8N_API_KEY` | n8n integration |

**client/.env**:
| Variable | Purpose |
|----------|---------|
| `NUXT_PUBLIC_API_BASE` | Backend API URL (client-side) |
| `NUXT_PUBLIC_DEFAULT_TENANT_SLUG` | Default tenant for dev |

### Testing

```bash
# All tests
cd server && npm test

# Specific test
cd server && npm test -- --testPathPattern=dynamic-schema
```

---

## Key architectural decisions

1. **Prisma + Knex dual approach**: Prisma handles the fixed metadata schema (Module, Entity, Field, User, etc.) because those tables are known at build time. Knex handles dynamic entity tables (ent_contacts, ent_companies, etc.) because those are created at runtime and Prisma can't introspect them.

2. **Real columns over JSONB**: Custom fields become real PostgreSQL columns. JSONB is only used for `extra_data` overflow. This preserves referential integrity (FKs), native indexing, correct sorting, and SQL aggregation.

3. **Database-per-tenant**: Each tenant has a separate PostgreSQL database. The meta database stores tenant provisioning info. Connection pools are managed per tenant with idle eviction.

4. **Schema-driven UI**: The frontend has ZERO hardcoded entity pages. One set of dynamic routes (`[entity]/index`, `[entity]/create`, `[entity]/[id]`) serves every entity. The backend `/v1/schema/:entitySlug` endpoint is the single source of truth for UI rendering.

5. **Event-driven actions**: Entity CRUD operations emit events. Actions subscribe to these events for auto-triggers. This decouples business logic from the CRUD layer cleanly.

6. **Fool-proof design**: Validation at every layer — Zod on the frontend (built from field definitions), DynamicValidationService on the backend, database constraints (NOT NULL, UNIQUE, FK references), and the filter parser validates column names against field definitions before they touch SQL.

---

## Coding conventions

### Language
- **Backend**: TypeScript, strict mode, NestJS decorator patterns
- **Frontend**: TypeScript, Vue 3 Composition API (`<script setup>`)
- **UI labels**: Romanian (the app is in Romanian)
- **Code identifiers**: English (slugs, column names, variable names)
- **Git commit messages**: Romanian

### File naming
- Backend modules: kebab-case filenames, PascalCase class names (NestJS convention)
- Frontend components: PascalCase `.vue` files
- Composables: camelCase `use*.ts`
- Utils: camelCase `*.utils.ts`

### Backend patterns
- Every module is a NestJS module with controller + service
- Services access the database through `this.tenantContext.knex` — never a direct Knex import
- DTOs use `class-validator` decorators for validation
- Controllers are guarded with `@UseGuards(AuthGuard('jwt'))`
- Admin-only routes additionally use `@Roles('admin')` + `RolesGuard`

### Frontend patterns
- Composables use Vue's `useState()` for SSR-safe shared state
- Schema caching uses an in-memory `Map` (not reactive state)
- Dynamic components use `h()` render functions when columns/cells need to be generated programmatically
- `useApi()` is the single entry point for all HTTP calls — injects auth and tenant headers
- Toast notifications via Nuxt UI's `useToast()` for all user feedback
