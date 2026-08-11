# Contractul campului de afisare al relatiilor

## Contract canonic

`relation_display_field` contine intotdeauna slug-ul logic al unui camp care apartine entitatii tinta.

```json
{
  "id_relation_entity": "<uuid entitate contracte>",
  "relation_display_field": "contract_number",
  "relation_display_column": "cf_contract_number"
}
```

- `relation_display_field` este configurabil si se trimite in payloadurile builderului.
- `relation_display_column` este calculat de API din metadata si este doar pentru citire.
- Consumatorii backend nu au voie sa foloseasca direct `relation_display_field` ca identificator SQL.
- API-ul accepta temporar si valori legacy precum `cf_contract_number`, dar le normalizeaza la slug la salvare si in manifestele returnate.

Rezolvarea cauta un singur rand din `field` pentru care `id_entity` este entitatea tinta si valoarea configurata este egala cu `slug` sau `column_name`. Lipsa unui rezultat sau mai multe rezultate produc o eroare de configurare; valoarea primita nu este interpolata in SQL.

## Schema si optiuni

`GET /api/v1/schema/:entitySlug` expune ambele proprietati pentru fiecare relatie. Tipurile client urmeaza acelasi contract.

Dropdownurile folosesc:

```http
GET /api/v1/data/:targetEntitySlug/relation-options?displayField=contract_number&search=CTR&limit=50
```

Pentru recuperarea explicita a unor selectii existente se poate trimite `ids` ca lista de maximum 50 UUID-uri separate prin virgula. Raspunsul este:

```json
{
  "data": [
    { "value": "<record uuid>", "label": "CTR-2026-001" }
  ]
}
```

Endpointul valideaza `displayField` prin metadata, aplica permisiunile si scope-ul inregistrarilor, iar cautarea este transmisa ca valoare parametrizata.

## Compatibilitate si migrare

Migrarea tenant normalizeaza valorile fizice rezolvabile la slug. Configuratiile deja canonice nu sunt modificate, iar cele inexistente sau ambigue sunt lasate pentru corectare explicita in builder. Resolverul runtime continua sa accepte ambele reprezentari pentru importuri si tenanturi legacy.
