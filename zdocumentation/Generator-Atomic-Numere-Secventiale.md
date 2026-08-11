# Generator atomic de numere secvențiale

Generatorul atribuie identificatori lizibili câmpurilor dinamice la crearea
înregistrărilor. Alocarea și inserarea sunt executate în aceeași tranzacție
PostgreSQL.

## Declararea pe câmp

Configurația este inclusă în metadatele câmpului, atât în payload-urile admin,
cât și în răspunsul `GET /api/v1/schema/:entitySlug`:

```json
{
  "name": "Număr intern",
  "slug": "internal_number",
  "data_type": "varchar",
  "ui_type": "text",
  "sequence": {
    "key": "internal",
    "scope": "global",
    "reset": "yearly",
    "format": "{prefix} / {number} / {day}/{month}/{year}",
    "prefix": "INT",
    "padding": 1,
    "start_value": 1
  }
}
```

Rezultatul pentru 11 august 2026 este `INT / 1 / 11/08/2026`.

Tokenurile disponibile sunt:

- `{prefix}` — prefixul literal configurat;
- `{number}` — valoarea contorului, completată cu zero la stânga;
- `{day}` — ziua locală cu două cifre;
- `{month}` — luna locală cu două cifre;
- `{year}` — anul local cu patru cifre.

Formatul trebuie să conțină exact un `{number}`. Spațiile, barele și orice alt
text literal sunt păstrate. Exemple:

| Configurație | Rezultat |
|---|---|
| `prefix: "CLI-"`, `format: "{prefix}{number}"`, `padding: 1` | `CLI-1` |
| `prefix: "LOC-"`, `format: "{prefix}{number}"`, `padding: 5` | `LOC-00001` |
| `prefix: "INT-"`, `format: "{prefix}{year}-{number}"` | `INT-2026-1` |

Un număr care depășește paddingul nu este trunchiat. Configurația acceptă în
V1 numai `reset: "none"` și `reset: "yearly"`. O resetare anuală trebuie să
includă `{year}` în format. Ziua și luna nu produc resetări implicite.

## Scope și izolare

Fiecare bază de tenant conține propriile definiții și contoare:

- `scope: "global"` folosește același contor pentru toate câmpurile și
  entitățile din tenant care referă aceeași `key`;
- `scope: "entity"` separă contorul după `entity.id_entity`;
- nu există un contor comun mai multor baze de tenant.

Aceeași cheie poate fi reutilizată numai cu o configurație identică. O
definiție poate fi modificată sau detașată înainte de prima alocare. După prima
alocare devine imuabilă; pentru o configurație nouă se declară o cheie nouă.

## Garanții tranzacționale

Contorul este actualizat printr-un UPSERT atomic pe cheia `(definition, scope,
period)`:

```sql
INSERT INTO sequence_counter (...)
VALUES (...)
ON CONFLICT (id_sequence_definition, scope_key, period_key)
DO UPDATE SET last_value = sequence_counter.last_value + 1
RETURNING last_value;
```

Nu se interoghează niciodată `MAX(number)`. Rândul contorului este blocat de
PostgreSQL până la terminarea tranzacției, astfel încât două tranzacții
concurente nu pot primi aceeași valoare.

Ordinea operației de creare este:

1. alocarea tuturor numerelor, într-o ordine stabilă;
2. workflow-urile `before_insert`, care văd numerele generate;
3. validările finale și inserarea înregistrării;
4. legarea fișierelor și commit-ul;
5. workflow-urile `after_insert`, în afara tranzacției.

Executorul tranzacțional este propagat prin `TenantContext`. Operațiile DB ale
workflow-urilor `before_insert` folosesc aceeași tranzacție sau savepoint-uri
imbricate. Un workflow nu poate modifica un câmp secvențial.

### Rollback, ștergere și retry

- Dacă tranzacția face rollback, incrementarea este anulată și valoarea poate
  fi alocată următoarei încercări.
- Un număr dintr-o înregistrare comisă nu este reutilizat după ștergerea
  înregistrării.
- Nu există retry automat. Pentru erorile PostgreSQL `40001` și `40P01`,
  clientul repetă întreaga operație de creare.
- O eroare de conexiune cu rezultat de commit incert nu este repetată automat;
  API-ul nu oferă încă idempotency keys.
- Istoricul unui workflow `before_insert` este anulat odată cu tranzacția și nu
  rămâne ca execuție orfană.

Un workflow `before_insert` prelungește durata lock-ului contorului. Acesta este
compromisul necesar pentru ca workflow-ul să vadă numărul și toate schimbările
să poată fi anulate împreună.

## Câmpuri existente și integritate

Generatorul poate fi activat pe un câmp existent numai când toate valorile sale
sunt `NULL`. Valorile istorice rămân `NULL`, iar inserările ulterioare primesc
automat număr. Câmpurile secvențiale sunt `varchar`, fără default, readonly și
au index unic în tabela dinamică.

Unicitatea cross-entity pentru scope-ul global este asigurată de allocator;
unicitatea în interiorul fiecărei tabele este verificată suplimentar de indexul
PostgreSQL.

## Teste de concurență

Suita PostgreSQL creează o schemă izolată și execută 500 de tranzacții paralele,
apoi verifică seria continuă `1…500`, scope-urile, resetarea anuală și
reutilizarea după rollback:

```powershell
$env:SEQUENCE_TEST_DATABASE_URL = "postgresql://user:pass@localhost:7432/devdb"
npm test -- --runInBand sequences/sequence.concurrency.spec.ts
```

Fără `SEQUENCE_TEST_DATABASE_URL` sau `TEST_DATABASE_URL`, testul de integrare
este omis; testele unitare de formatare și validare rulează întotdeauna.
