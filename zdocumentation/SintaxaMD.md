# Titlu principal (H1)

## Subtitlu (H2)

### Sub-subtitlu (H3)

#### Nivel 4

##### Nivel 5

###### Nivel 6

---

## Paragraf

Acesta este un paragraf normal. Poți scrie text liber, iar Markdown va crea automat paragrafe separate când lasi o linie goală între blocuri de text.

Acesta este al doilea paragraf. Observă cum cele două paragrafe sunt separate vizual.

---

## Liste

### Listă neordonată (bullet points)

- Element unu
- Element doi
- Element trei
  - Sub-element (indent cu 2 spații)
  - Alt sub-element

### Listă ordonată (numerotată)

1. Primul pas
2. Al doilea pas
3. Al treilea pas

---

## Formatare text

- **Bold** (gras) – două asteriscuri
- *Italic* – un asterisc
- ***Bold și italic*** – combinate
- `cod inline` – backticks pentru cod

---

## Link-uri și imagini

[Text link către Google](https://google.com)

![Text alternativ pentru imagine](url-imagine.png)

---

## Cod

### Bloc de cod inline

Folosește `prisma.client.user.findMany()` pentru a obține utilizatorii.

### Bloc de cod (sintaxă highlight)

```typescript
// Exemplu TypeScript
async function getUsers() {
  return await prisma.user.findMany();
}
```

---

## Citat (blockquote)

> Acesta este un citat. Folosește `>` la începutul liniei.
> Poți continua pe mai multe linii.

---

## Tabel

| Coloană 1 | Coloană 2 | Coloană 3 |
| --------- | --------- | --------- |
| Celula 1  | Celula 2  | Celula 3  |
| Celula 4  | Celula 5  | Celula 6  |

---

## Linie orizontală

Folosește `---` sau `***` pe o linie separată pentru a crea o linie de separare.

---

## Checklist (task list)

- [x] Sarcină completată
- [ ] Sarcină de făcut
- [ ] Altă sarcină

---

## Escape caractere speciale

Dacă vrei să afișezi caractere ca \* sau \#, pune `\` înainte: \* \# \[ \]
