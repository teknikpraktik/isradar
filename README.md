# ISRADAR

Analysverktyg för erfarna långfärdsskridskoåkare: **var händer det något intressant med isarna just nu?**

ISRADAR kombinerar historisk köldmängd, aktuell köldmängd, MEPS sjöismodell, Sentinel-satellitobservationer och väder – och presenterar observationer och modeller, **inte säkerhetsbedömningar**. Appen säger aldrig att is är säker, åkbar eller bra.

> ISRADAR visar fjärranalys-, modell- och väderdata. Informationen visar inte om isen är bärig. Bedöm alltid isen på plats.

## Status (V1)

- Utvecklas och testas för **Värmland** (avgränsning för utveckling – arkitekturen är nationell).
- Ansluten data: **historisk köldmängd** (Skridskonätet), koppling till temperaturstation och **aktuell köldmängd** (beräknad ur SMHI:s dygnsmedeltemperaturer).
- Ej anslutet ännu: MEPS, Sentinel, väder. Finns i UI och datamodell som "Ej ansluten".

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
| `npm test`          | Enhetstester (`node --test`, inga beroenden)                            |

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

Regioner avgränsas med **SCB:s länsgränser** (`data/boundaries/scb-lan.geojson`, alla 21 län, [SCB digitala gränser](https://www.scb.se/hitta-statistik/regional-statistik-och-kartor/regionala-indelningar/digitala-granser/), licens CC0, omräknade från SWEREF 99 TM till WGS84). `data/regions/varmland.json` anger `countyCodes: ["17"]` och innehåller länspolygonen för kartkonturen.

Varje vatten tilldelas ett län (`countyCode` i indexet):

1. länet vars polygon innehåller vattnets centroid, annars
2. närmaste län inom 20 km. SCB:s polygoner omfattar bara **land**, så Vänern, Vättern, Mälaren och kustvatten ligger utanför alla län – deras delar tilldelas närmaste strandlän (t.ex. hamnar Norra Vänern och Värmlandsskärgården i Värmland).

Gränserna är förenklade (Värmland: 125 punkter), så enstaka små vatten precis vid länsgränsen kan hamna i grannlänet. Värmland: 261 vatten.

Uppdatera eller lägg till län:

```bash
# ladda ner "Län, kommuner och LA-regioner, ArcView-shape" från SCB och packa upp LanSweref99TM.zip
node scripts/import-scb-counties.mts <Lan_Sweref99TM_region.shp> 17 varmland
npm run data
```

Utan länskod/region skrivs bara `scb-lan.geojson`. En region utan `countyCodes` filtreras med punkt-i-polygon mot `boundary.geometry` (används t.ex. för egna testområden).

Ny region: lägg till `data/regions/<id>.json`, registrera i `lib/regions.ts`, kör `npm run data`, välj via `NEXT_PUBLIC_ISRADAR_REGION`.

### Aktuell köldmängd (SMHI)

Beräknas av ISRADAR per temperaturstation och visas för alla vatten som använder stationen.

- **Data:** SMHI Öppna data, meteorologiska observationer, parameter 2 (dygnsmedeltemperatur). Licens **CC BY 4.0** – källan anges i appens info-dialog. `latest-months` (cache 1 h) kompletteras med `corrected-archive` (cache 24 h) när säsongen sträcker sig längre bak än fyra månader.
- **Stationskoppling:** `data/stations/smhi.json` kopplar Skridskonätets 28 stationer (`measurepoint`) till närmaste aktiva SMHI-station (alla inom 650 m och med samma namn, t.ex. Örebro A → Örebro Flygplats). Genereras med `node scripts/map-smhi-stations.mts` (kräver `isradar_koldmangd/stations.csv`).
- **Metod** (`lib/cold/compute.ts`, beslut 2026-10-01): säsongen börjar **1 oktober**; **netto med golv vid 0** – minusgrader ökar, plusgrader minskar, summan blir aldrig negativ. Saknade dygn interpoleras inte utan hoppas över och redovisas. Förändring 24 h / 7 dygn blir tom om jämförelsedygnet saknas.
- **Obs:** metoden är ISRADAR:s egen och kan avvika från hur Skridskonätet räknat fram den historiska köldmängden (deras metod är inte dokumenterad för oss).
- **API:** `GET /api/cold/station/[measurepoint]?asOf=YYYY-MM-DD` returnerar ackumulerat värde, förändringar, saknade dygn, SMHI-kvalitetskoder och hela säsongsserien (grund för kommande ICE SCOUT).
- **Tidigare datum:** `/?asOf=2026-02-15` visar köldmängden ett tidigare datum. Datumet markeras tydligt i toppfältet; × återgår till nuläget.

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

MapLibre GL JS 6 med en egen mörk, avskalad stil ovanpå OpenFreeMap-vektortiles (ingen API-nyckel; byt via `NEXT_PUBLIC_MAP_STYLE_URL`). Sjöarna färgas efter **historisk köldmängd** med en enda blå ljushetsramp (ljus = låg GD, mörk = hög GD). Klassgränser, färger och etiketter finns på ett ställe – `COLD_DAY_CLASSES` i `lib/map/coldScale.ts` – och används av kartan, legenden och sidopanelen (testas i `coldScale.test.mts`). Färgerna är valda så att även högsta klassen syns tydligt mot den mörka baskartan. Färgen är en temperaturindikator, inte isstatus.

#### Stora sjöar – Vänern

Varje vatten har en `modelType`:

- `STANDARD_LAKE` – vanlig GD-klassning via temperaturstation.
- `LARGE_LAKE_OPEN_WATER` – öppen huvudbassäng i stor sjö. Får **ingen** GD-klass, ingen stationskoppling (ingen fallback till närmaste station) och visas neutralt skrafferad. I panelen: "Vänern – öppet vatten · Köldmängd: ej klassificerad". Aktuell köldmängd returnerar `not_applicable`, som hålls isär från saknad data och 0 GD.

Konfigureras i `data/large-lakes.json` via `objektid`. Vänern finns inte som ett objekt i källdatan utan i ~20 namngivna delar, så identifieringen är **manuell**. Just nu: Norra Vänern (17739), Södra Vänern (39553), Yttre Dalbosjön (248906). Vikar och skärgårdar som egna vattenobjekt (t.ex. Kattfjorden, Värmlandsskärgården) klassificeras som vanligt.

Källans polygon för t.ex. Norra Vänern omsluter även ~50 vikar och skärgårdar som finns som egna objekt. Byggskriptet klipper därför bort alla överlappande vatten ur det öppna vattnets geometri (`polygon-clipping`, används bara vid bygget), och kartan ritar öppet vatten i ett lager under vanliga sjöar. Vikarna behåller sin GD-klass och får klicken.

MapLibre 6 laddar sin worker relativt `import.meta.url`, vilket inte överlever bundling; `scripts/copy-maplibre-worker.mjs` kopierar därför workern till `public/vendor/maplibre/` och `lib/map/maplibre.ts` sätter `setWorkerUrl`.

### Position

"Min position" använder Geolocation API. Positionen används bara lokalt för att centrera kartan och skickas ingenstans. Appen fungerar om åtkomst nekas.

### PWA

Web app manifest (`app/manifest.ts`), ikoner, `theme-color`, `viewport-fit=cover`. Ingen service worker ännu – läggs till när det finns aktuell data att cacha med tydlig dataålder.

## Skalning till hela Sverige

GeoJSON räcker för Värmland (~260 polygoner, ~2,5 MB okomprimerat). Nationellt (~2 500+ vatten, fler med tiden) bör man gå över till:

- **PostGIS** för sjöar, regioner och tidsserier (satellit, MEPS, köldmängd). `LakeRepository` och `lib/data/*` får då implementationer mot ett API – komponenterna påverkas inte.
- **Vector tiles** (t.ex. PMTiles eller `ST_AsMVT` från PostGIS) för sjögeometrin istället för en stor GeoJSON-fil.
- Serverbaserad sökning (indexet har redan samma form som ett sök-API skulle returnera).
- Regionsvisa förändringsanalyser på servern – grunden för kommande **ICE SCOUT** (störst förändring i isutbredning 24/48/72 h, köldmängd som närmar sig historiskt intervall, modellerad istillväxt).
