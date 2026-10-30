# NLE-mail i Gmail

Apps Script-projektet hedder **selfservice**. Det kører i Gmail. Der er ingen Grok, ingen lokal watcher og ingen lokal server.

Scriptet læser mails fra `bk@nle.dk` og fra `bjornkelsen@gmail.com`. Emnet skal være præcis `NLE ARBEJDE`. Svaret går tilbage til den adresse, mailen kom fra. Scriptets egne svar bliver ignoreret, så de ikke bliver nye kommandoer.

## ADD

```
ADD
06
Titel
Teksten til blokken.
```

Første linje er `ADD`. Næste linje er et tocifret nummer. Næste linje er titlen. Resten er teksten. En signatur der starter med `--` bliver klippet fra. Samme nummer overskriver blokken. Et nyt nummer opretter en blok.

## DEL

Én linje:

```
DEL 05
```

Eller to linjer:

```
DEL
05
```

`DELETE` virker som `DEL`, så en ældre mail stadig kan køre. `DEL` fjerner blokken fra preview. Den forsvinder fra live, når Godkend trykkes på preview-siden.

## Svaret

Svaret indeholder ét link: preview-siden med `?preview=1` og parameteren `k`. På den side trykkes Godkend. Det kopierer `data-preview.json` over i `data.json`.

Der er ikke et ekstra Godkend-link i mailen. Et preview-link uden `k` kan ikke lægge noget på live. Afvis på siden ændrer ikke live.

Hvis nummeret ikke findes, er svaret `Blok 05 findes ikke.`

GitHub Pages kan være omkring et minut om at vise den nye fil, nogle gange op mod ti.

## Hvor det ligger

- Live: `data.json` på https://bjornkelsen-cmd.github.io/nle-us-test/
- Preview: `data-preview.json`, åbnes med `?preview=1`
- Kode: `apps-script/Kode.gs`
- Projekt: selfservice, script-id `1aZOIjioyUznAEb6VEAk38cHiNuJ7hNBGR2oJLCE0_gP3faMmIFcF1iHo`
- Webapp kører som mig, med adgang for alle. `checkMail` kører hvert minut.
- `GITHUB_TOKEN` og `GODKEND_TOKEN` ligger i Script properties. De skal ikke i git og ikke i den offentlige HTML. `k` følger kun med i det link, mailen sender.

En mail med forkert form får skabelonen tilbage, og siden ændres ikke.
