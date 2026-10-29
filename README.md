# NLE US Test – Minimal site

Data-drevet version af nle.html klar til GitHub Pages.

## Filer
- `index.html` – samme udseende som original, men 02/arbejde renderes fra JSON
- `data.json` – de 4 blokke under Arbejde

## Sådan opdateres "02 / arbejde"
Rediger kun `data.json`:
- Ændre tekst på eksisterende
- Tilføj nyt objekt (med næste nr)
- Fjern et objekt

Ved push til main deployer GitHub Pages automatisk.

## Deploy til GitHub Pages
1. Settings → Pages
2. Branch: main, folder: / (root)
3. HTTPS er automatisk

## Backup
Kopier af filerne ligger i Drive: `ai-projects/selfservice/us-model/`
