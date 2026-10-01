# ISRADAR

Analysverktyg för erfarna långfärdsskridskoåkare: **var händer det något intressant med isarna just nu?**

ISRADAR kombinerar historisk köldmängd, aktuell köldmängd, MEPS sjöismodell, Sentinel-satellitobservationer och väder – och presenterar observationer och modeller, **inte säkerhetsbedömningar**. Appen säger aldrig att is är säker, åkbar eller bra.

> ISRADAR visar fjärranalys-, modell- och väderdata. Informationen visar inte om isen är bärig. Bedöm alltid isen på plats.

## Status (V1)

- Utvecklas och testas för **Värmland** (avgränsning för utveckling – arkitekturen är nationell).
- Ansluten data: **historisk köldmängd** (Skridskonätet) och koppling till temperaturstation.
- Ej anslutet ännu: aktuell köldmängd, MEPS, Sentinel, väder. Finns i UI och datamodell som "Ej ansluten".

## Kom igång

Kräver Node ≥ 22.18 (utvecklat på Node 24) och researchdatan i `isradar_koldmangd/`.

```bash
npm install
npm run dev      # kör först prepare-assets (data + MapLibre-worker), sedan next dev
```

Öppna http://localhost:3000.

| Skript              | Gör                                                                    |
| ------------------- | ---------------------------------------------------------------------- |
| `npm run data`      | Genererar regionsdata ur `isradar_koldmangd/` → `public/data/generated/` |
| `npm run dev`       | Utvecklingsserver (kör `prepare-assets` först)                          |
| `npm run build`     | Produktionsbygge (kör `prepare-assets` först)                           |
| `npm run typecheck` | `next typegen` + `tsc --noEmit`                                         |
| `npm run lint`      | ESLint                                                                 |

## Data

### Källdata (ändras aldrig)

`isradar_koldmangd/` – hämtad med `scrape_koldmangd.py` från Skridskonätets köldmängdstjänst:

- `waters.csv` – ~2 518 vatten: `objektid, name, km, measurepoint, station_name, station_lat/lon, point_lon/lat, has_polygon`
- `waters_unique.geojson` – ~2 485 MultiPolygoner
- `stations.csv` – 28 temperaturstationer (`measurepoint`)

`km` = **historisk köldmängd** i graddagar (GD): median av tidigare säsongers köldmängd den dag vattnet först rapporterades som åkbart. Det är en historisk referens, **inte en säkerhetsgräns**.

> ⚠️ Återpubliceringsrätten för researchdatan är inte fastställd. `isradar_koldmangd/` och `curl.txt` (innehåller sessionscookie) är git-ignorerade. Den **genererade** datan under `public/data/generated/` committas däremot (beslut 2026-10-01) så att Vercel kan bygga utan källdatan – den publiceras alltså via GitHub och deployen. Kör `npm run data` och committa om när källdatan uppdateras.

### Generering – `scripts/build-region-data.mts`

```bash
npm run data               # alla regioner i data/regions/
node scripts/build-region-data.mts varmland
ISRADAR_SOURCE_DIR=/annan/sökväg npm run data
```

1. Läser CSV (riktig RFC 4180-parser – vissa namn innehåller kommatecken) och GeoJSON, joinar på `objektid`.
2. Rundar koordinater till 5 decimaler (~1 m), beräknar areaviktad centroid och bbox.
3. **Filtrerar geometriskt**: ett vatten ingår om centroiden ligger inom regionens polygon i `data/regions/<id>.json`. Sjönamn används aldrig för regionval.
4. Skriver per region till `public/data/generated/<region>/`:
   - `lakes.geojson` – geometri med minimala properties (`id, name, hca, stationId`), feature-`id` = `objektid`
   - `lakes-index.json` – sökindex utan geometri
   - `stations.json`, `manifest.json` (genereringstid, antal, fördelning)

Saknas källdatan men genererade filer finns hoppar skriptet över med en varning.

### Regionavgränsning

`data/regions/varmland.json` innehåller just nu en **dokumenterad rektangel** (11.6–14.55° E, 58.85–61.1° N) som omsluter Värmlands län inkl. norra Vänern. Den tar även med vissa vatten i norra Dalsland, västra Örebro län och sydvästra Dalarna (Värmland: 364 vatten). För riktig länsgräns: ersätt `boundary.geometry` med länspolygonen (t.ex. från Lantmäteriet/SCB), sätt `kind: "official"` och kör `npm run data`. Ingen kod behöver ändras.

Ny region: lägg till `data/regions/<id>.json`, registrera i `lib/regions.ts`, kör `npm run data`, välj via `NEXT_PUBLIC_ISRADAR_REGION`.

### Kända egenheter i källdatan

- 152 sjönamn förekommer flera gånger (33 × "Långsjön") – `objektid` är alltid nyckel.
- Vänern finns inte som en polygon utan i delar ("Norra Vänern", "Värmlandsskärgården" …), delvis med raka snittkanter.
- 32 vatten saknar polygon; de visas som punkter (inga i Värmlandsområdet).

## Arkitektur

```
app/                 Next.js App Router (page, layout, manifest)
components/
  IsradarApp.tsx     klientskal: state för vald sjö, sök, position
  map/               LakeMap (MapLibre), MapLegend, LocateButton
  search/            LakeSearch
  lake-panel/        LakePanel + sektioner (Översikt, Modell, Satellit, Väder)
  ui/                InfoDialog, GdUnit
lib/
  data/lakes.ts      LakeRepository – idag statiska filer, senare API/PostGIS
  data/cold.ts       historisk (finns) + aktuell köldmängd (ej ansluten)
  data/meps.ts       MEPS (ej ansluten)
  data/satellite.ts  Sentinel (ej ansluten)
  data/weather.ts    väder (ej ansluten)
  data/conditions.ts samlar alla källor per sjö
  map/               basemap-stil, färgskala, MapLibre-laddning
  regions.ts, sources.ts, format.ts
types/               provenance.ts, lake.ts, observations.ts, region.ts
data/regions/        regiondefinitioner
scripts/             preprocessing, kopiering av MapLibre-worker
```

### Observation / modell / prognos / historisk referens

Central princip. Varje värde bär en `Provenance` med en tidsvariant (`types/provenance.ts`):

| Kategori               | Tid                                         | Exempel                     |
| ---------------------- | ------------------------------------------- | --------------------------- |
| `observation`          | `observedAt` (+ ev. period)                 | Sentinel, uppmätt nederbörd |
| `model`                | `modelRun`, `validAt`                       | MEPS analys                 |
| `forecast`             | `modelRun`, `validAt`, `leadTimeHours`      | MEPS +24/+48/+66 h          |
| `historical_reference` | `method`, ev. `seasons`                     | Historisk köldmängd         |

Kvalitet (`DataQuality`): upplösning, molntäckning, okänd andel, flagga – fylls bara i när källan levererar värdet. Alla datakällor returnerar `DataResult<T>` (`ok` / `not_connected` / `unavailable`) så att UI:t aldrig gissar.

### Kartan

MapLibre GL JS 6 med en egen mörk, avskalad stil ovanpå OpenFreeMap-vektortiles (ingen API-nyckel; byt via `NEXT_PUBLIC_MAP_STYLE_URL`). Sjöarna färgas med en **neutral enfärgsramp** efter historisk köldmängd (< 30, 30–50, 50–80, 80–120, ≥ 120 GD – valt efter fördelningen i Värmland så klasserna blir ungefär jämnstora). Det är enbart visualisering av ett historiskt värde.

MapLibre 6 laddar sin worker relativt `import.meta.url`, vilket inte överlever bundling; `scripts/copy-maplibre-worker.mjs` kopierar därför workern till `public/vendor/maplibre/` och `lib/map/maplibre.ts` sätter `setWorkerUrl`.

### Position

"Min position" använder Geolocation API. Positionen används bara lokalt för att centrera kartan och skickas ingenstans. Appen fungerar om åtkomst nekas.

### PWA

Web app manifest (`app/manifest.ts`), ikoner, `theme-color`, `viewport-fit=cover`. Ingen service worker ännu – läggs till när det finns aktuell data att cacha med tydlig dataålder.

## Skalning till hela Sverige

GeoJSON räcker för Värmland (~360 polygoner, ~2,5 MB okomprimerat). Nationellt (~2 500+ vatten, fler med tiden) bör man gå över till:

- **PostGIS** för sjöar, regioner och tidsserier (satellit, MEPS, köldmängd). `LakeRepository` och `lib/data/*` får då implementationer mot ett API – komponenterna påverkas inte.
- **Vector tiles** (t.ex. PMTiles eller `ST_AsMVT` från PostGIS) för sjögeometrin istället för en stor GeoJSON-fil.
- Serverbaserad sökning (indexet har redan samma form som ett sök-API skulle returnera).
- Regionsvisa förändringsanalyser på servern – grunden för kommande **ICE SCOUT** (störst förändring i isutbredning 24/48/72 h, köldmängd som närmar sig historiskt intervall, modellerad istillväxt).
