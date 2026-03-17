# Documentație backend

Toate API-urile sunt prefixate cu `/api`. Exemplu: `http://localhost:4000/api/...`

---

## APIs

### (verificat) Autentificare (`/api/auth`)

| Metodă | Endpoint | Descriere |
| ------ | -------- | --------- |
| POST | `/api/auth/signup` | Înregistrare utilizator nou. Primește `email` și `password` în body. |
| POST | `/api/auth/signin` | Autentificare. Primește `email` și `password`, returnează token JWT. |
| POST | `/api/auth/signout` | Deconectare. Returnează mesaj de succes. |

---

<div style="margin-top: 5em;"></div>

### (verificat) Utilizator (`/api/user`)

| Metodă | Endpoint | Descriere |
| ------ | -------- | --------- |
| GET | `/api/user/me` | Returnează profilul utilizatorului autentificat. **Necesită JWT.** |

---

<div style="margin-top: 5em;"></div>

### (verificat) Schema (`/api/v1/schema`)

| Metodă | Endpoint | Descriere |
| ------ | -------- | --------- |
| GET | `/api/v1/schema/:entitySlug` | Returnează schema (câmpuri, tipuri) pentru o entitate dinamică. Ex: `contacts`, `companies`. |

---

<div style="margin-top: 5em;"></div>

<a id="endpoint-get-data"></a>
### (verificat) Date dinamice (`/api/v1/data`)

CRUD generic pentru orice entitate definită. **Necesită JWT.**

| Metodă | Endpoint | Descriere |
| ------ | -------- | --------- |
| GET | `/api/v1/data/:entitySlug` | Listează toate înregistrările unei entități. Suportă query params pentru filtrare, sortare și paginare (vezi exemplele mai jos). [Vezi structura răspunsului](#structura-raspunsului-get-data). |
| GET | `/api/v1/data/:entitySlug/:id` | Returnează o singură înregistrare după ID. |
| POST | `/api/v1/data/:entitySlug` | Creează o înregistrare nouă. Body: obiect cu valorile câmpurilor. |
| PUT | `/api/v1/data/:entitySlug/:id` | Actualizează o înregistrare existentă. |
| DELETE | `/api/v1/data/:entitySlug/:id` | Șterge o înregistrare. |
#### Query params pentru `GET /api/v1/data/:entitySlug`

| Param | Tip | Default | Descriere |
| ----- | --- | ------- | --------- |
| `page` | number | 1 | Prima pagină. |
| `limit` | number | 25 | Înregistrări per pagină (min 25, max 100). |
| `sort` | string | `date_created` desc | Coloane de sortat. `-col` = descrescător, `col` = crescător. Mai multe: `sort=name,-date_created`. |
| `filter[camp]` | any | - | Filtru egalitate: `filter[name]=Alex`. |
| `filter[camp][operator]` | any | - | Filtru cu operator. Vezi operatorii suportați mai jos. |

**Operatori filtre:** `eq`, `contains`, `starts_with`, `gt`, `gte`, `lt`, `lte`, `in`, `is_null`, `between`




**Exemple de apeluri:**

```
# Paginare – pagina 2, 50 înregistrări
GET /api/v1/data/contacts?page=2&limit=50

# Sortare – după nume crescător, apoi date_created descrescător (cele mai recente primele)
GET /api/v1/data/contacts?sort=name,-date_created

# Filtru egalitate – contact cu nume exact "Alex"
GET /api/v1/data/contacts?filter[name]=Alex

# Filtru conține – nume care conține "Alex"
GET /api/v1/data/contacts?filter[name][contains]=Alex

# Filtru începe cu – email care începe cu "admin"
GET /api/v1/data/contacts?filter[email][starts_with]=admin

# Filtru numeric – vârstă > 18
GET /api/v1/data/contacts?filter[age][gt]=18

# Filtru în listă – status în active sau pending
GET /api/v1/data/contacts?filter[status][in]=active,pending

# Filtru interval – dată între două valori
GET /api/v1/data/contacts?filter[date_created][between]=2024-01-01,2024-12-31

# Combinat – paginare + sortare + filtre
GET /api/v1/data/contacts?page=1&limit=25&sort=-date_created&filter[status]=active&filter[name][contains]=ion
```

---

<div style="margin-top: 5em;"></div>

### Admin – Module (`/api/v1/admin/modules`)

Gestionare module (grupuri de entități). **Necesită JWT + rol admin.**

| Metodă | Endpoint | Descriere |
| ------ | -------- | --------- |
| GET | `/api/v1/admin/modules` | Listează toate modulele. |
| GET | `/api/v1/admin/modules/:id` | Detalii pentru un modul. |
| POST | `/api/v1/admin/modules` | Creează un modul nou. |
| PUT | `/api/v1/admin/modules/:id` | Actualizează un modul. |
| DELETE | `/api/v1/admin/modules/:id` | Șterge un modul. |

---

<div style="margin-top: 5em;"></div>

### Admin – Entități (`/api/v1/admin/entities`)

Gestionare entități (tabele) din fiecare modul. **Necesită JWT + rol admin.**

| Metodă | Endpoint | Descriere |
| ------ | -------- | --------- |
| GET | `/api/v1/admin/entities` | Listează toate entitățile. Query param opțional: `moduleId` pentru filtrare. |
| GET | `/api/v1/admin/entities/:id` | Detalii pentru o entitate. |
| POST | `/api/v1/admin/entities` | Creează o entitate nouă. |
| PUT | `/api/v1/admin/entities/:id` | Actualizează o entitate. |
| DELETE | `/api/v1/admin/entities/:id` | Șterge o entitate. |

---

<div style="margin-top: 5em;"></div>

### Admin – Câmpuri (`/api/v1/admin/entities/:entityId/fields`)

Gestionare câmpurile unei entități. **Necesită JWT + rol admin.**

| Metodă | Endpoint | Descriere |
| ------ | -------- | --------- |
| GET | `/api/v1/admin/entities/:entityId/fields` | Listează toate câmpurile entității. |
| GET | `/api/v1/admin/entities/:entityId/fields/:fieldId` | Detalii pentru un câmp. |
| POST | `/api/v1/admin/entities/:entityId/fields` | Creează un câmp nou în entitate. |
| PUT | `/api/v1/admin/entities/:entityId/fields/:fieldId` | Actualizează un câmp. |
| DELETE | `/api/v1/admin/entities/:entityId/fields/:fieldId` | Șterge un câmp. |

---

<div style="margin-top: 5em;"></div>

## Note

- **Contacts** – Controllerul pentru contacts este comentat în cod, deci nu există endpoint-uri active pentru acest modul.
- **Autentificare** – Endpoint-urile marcate cu „Necesită JWT” trebuie apelate cu header `Authorization: Bearer <token>`.
- **Admin** – Endpoint-urile din `/api/v1/admin/*` necesită rol `admin` în plus față de JWT.

---

<div style="margin-top: 5em;"></div>

## Structura răspunsurilor API

<a id="structura-raspunsului-get-data"></a>

### `GET /api/v1/data/:entitySlug` [← Înapoi la endpoint](#endpoint-get-data)

```json
{
  "data": [
    {
      "id": "id",
      "date_created": "2024-01-15T10:00:00.000Z",
      "date_updated": "2024-01-15T10:00:00.000Z",
      "id_owner": "id",
      "...": "câmpuri definite în schema entității"
    }
  ],
  "meta": {
    "total": 100,
    "page": 1,
    "limit": 25,
    "totalPages": 4
  }
}
```