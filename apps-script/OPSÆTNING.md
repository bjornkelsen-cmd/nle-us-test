# NLE-mail i Gmail

Scriptet læser mails fra bk@nle.dk med emnet `NLE ARBEJDE`, lægger blokken i preview, venter til siden viser den, og svarer på mailen med preview-link og et Godkend-link. Godkend kopierer preview over i live. Der kører ingen Grok og intet på maskinen.

1. Opret en GitHub-nøgle på https://github.com/settings/personal-access-tokens/new
   - Kun repoet `bjornkelsen-cmd/nle-us-test`
   - Contents: Read and write
   - Gem nøglen. Den skal ikke i git.
2. Åbn https://script.google.com som bjornkelsen@gmail.com og opret et projekt.
3. Erstat koden med indholdet af `Kode.gs`.
4. Projektindstillinger → Script properties → `GITHUB_TOKEN` = nøglen fra trin 1.
5. Udgiv → Ny udgivelse → Webapp.
   - Execute as: Me
   - Who has access: Anyone
6. Kør funktionen `install`. Godkend Gmail-, UrlFetch- og script-adgang når Google spørger.
7. Send en ny `NLE ARBEJDE`-mail. Svaret kommer når preview er live på siden, typisk et til to minutter, nogle gange op mod tre.

Godkend-linket i svaret åbner live-siden. Hvis preview allerede er det samme som live, sker der ingen ny commit.
