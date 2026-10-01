@AGENTS.md

# ISRADAR – projektregler

- Ändra aldrig filer i `isradar_koldmangd/` (researchdata, ej fastställd återpubliceringsrätt). Committa den aldrig, inte heller `curl.txt`. `public/data/generated/` committas medvetet (behövs för Vercel-bygget).
- UI får aldrig påstå att is är säker, osäker, åkbar, bra eller rekommenderad. Visa observationer och modeller.
- Håll isär `observation` / `model` / `forecast` / `historical_reference` (se `types/provenance.ts`). Gissa aldrig värden – använd `DataResult`.
- `objektid` är primärnyckel; sjönamn är inte unika.
- Inget får hårdkodas till Värmland – regioner definieras i `data/regions/`.
- Kontroll: `npm run typecheck && npm run lint && npm test && npm run build`.
