# Isvak

Datadriven bevakning av isbildning

Analysverktyg för erfarna långfärdsskridskoåkare: **var händer det något intressant med isarna just nu?**

Isvak kombinerar historisk köldmängd, aktuell köldmängd, MEPS sjöismodell, Sentinel-satellitobservationer och väder – och presenterar observationer och modeller, **inte säkerhetsbedömningar**. Appen säger aldrig att is är säker, åkbar eller bra.

> Isvak visar fjärranalys-, modell- och väderdata. Informationen visar inte om isen är bärig. Bedöm alltid isen på plats.

## Status (V1)

- Utvecklas och testas för **Värmland** (avgränsning för utveckling – arkitekturen är nationell).
- Ansluten data: **historisk köldmängd** (Skridskonätet), koppling till temperaturstation och **aktuell köldmängd** (beräknad ur SMHI:s dygnsmedeltemperaturer) samt **väder** (SMHI, uppmätt senaste 24 h och prognos).
- Ansluten: **MEPS sjöismodell** (MET Norway, FLake).
- **Sentinel-satellitbilder som kartlager** (radar och optisk, Microsoft Planetary Computer, utan konto). Ingen is/vatten-klassning.
- Väderobservationer kompletteras med **Trafikverket VViS**. Finns i UI och datamodell som "Ej ansluten".

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
ISVAK_SOURCE_DIR=/annan/sökväg npm run data
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

Ny region: lägg till `data/regions/<id>.json`, registrera i `lib/regions.ts`, kör `npm run data`, välj via `NEXT_PUBLIC_ISVAK_REGION`.

### Aktuell köldmängd (SMHI)

Beräknas av Isvak per temperaturstation och visas för alla vatten som använder stationen.

- **Data:** SMHI Öppna data, meteorologiska observationer, parameter 2 (dygnsmedeltemperatur). Licens **CC BY 4.0** – källan anges i appens info-dialog. `latest-months` (cache 1 h) kompletteras med `corrected-archive` (cache 24 h) när säsongen sträcker sig längre bak än fyra månader.
- **Stationskoppling:** `data/stations/smhi.json` kopplar Skridskonätets 28 stationer (`measurepoint`) till närmaste aktiva SMHI-station (alla inom 650 m och med samma namn, t.ex. Örebro A → Örebro Flygplats). Genereras med `node scripts/map-smhi-stations.mts` (kräver `isradar_koldmangd/stations.csv`).
- **Metod** (`lib/cold/compute.ts`, beslut 2026-10-01): säsongen börjar **1 oktober**; **netto med golv vid 0** – minusgrader ökar, plusgrader minskar, summan blir aldrig negativ. Saknade dygn interpoleras inte utan hoppas över och redovisas. Förändring 24 h / 7 dygn blir tom om jämförelsedygnet saknas.
- **Obs:** metoden är Isvak:s egen och kan avvika från hur Skridskonätet räknat fram den historiska köldmängden (deras metod är inte dokumenterad för oss).
- **API:** `GET /api/cold/station/[measurepoint]?asOf=YYYY-MM-DD` returnerar ackumulerat värde, förändringar, saknade dygn, SMHI-kvalitetskoder och hela säsongsserien (grund för kommande ICE SCOUT).
- **Tidigare datum:** `/?asOf=2026-02-15` visar köldmängden ett tidigare datum. Datumet markeras tydligt i toppfältet; × återgår till nuläget.

### Väder (SMHI)

`GET /api/weather?lat=..&lon=..` (`app/api/weather/route.ts`, sammanfattning i `lib/weather/compute.ts`, testad).

- **Uppmätt senaste 24 h (OBSERVATION):** SMHI metobs `latest-day` (timvärden, cache 15 min). Temperatur (param 1: min/max/senaste), nederbörd (param 7: summa), vind (param 4 + riktning 3 + byar 21). **Närmaste aktiva station väljs per variabel** inom 50 km – nederbörd mäts på färre stationer än temperatur. Vindriktning och byar tas från samma station som vindhastigheten.
- **Täckning redovisas:** saknade timmar visas ("18 av 24 h") och en ofullständig nederbördssumma visas som "minst …". Inga värden interpoleras.
- **Avståndsgräns 50 km:** i Värmland har 259/261 vatten temperatur, 256 vind och 241 nederbörd inom gränsen. Övriga visar "Ingen station inom 50 km".
- **Prognos (FORECAST):** SMHI punktprognos `snow1g` (ersätter `pmp3g`) vid vattnets centroid, sammanfattad för 0–24 h och 24–48 h: temperatur, **tid under 0 °C** (antal prognostimmar med lufttemperatur < 0 °C), nederbörd, vind och byvind. All väderformatering ligger i `lib/weather/format.ts` (testad). Modellkörningstid (`referenceTime`) visas.
- **Endast nuläge:** med `?asOf=` visas "Endast nuläge" – inget väder hämtas.
- **Senaste 24 h – mikrodiagram** (`components/lake-panel/Sparkline.tsx`): temperatur som sparkline (56 px) och nederbörd som staplar (40 px, döljs vid 0 mm). API:t skickar en **egen timserie per parameter** (`observed.*.series`) eftersom temperatur, nederbörd och vind kan komma från olika stationer – de tvingas inte ihop. Samma period (nu − 24 h → nu) för alla. Saknade timmar bryter linjen (`splitAtGaps`, delad med meteogrammet); färre än 6 värden → bara text. Vind som text.
- **Prognos · 48 h – meteogram** (`components/lake-panel/Meteogram.tsx`, layoutlogik i `lib/weather/meteogram.ts`, testad): ren SVG utan chart-bibliotek. API:t skickar `forecast.hours[]` – en gemensam tidslinje per timme (temperatur, nederbörd, typ, vind, riktning, byvind; tidsstämpel = timmens slut). Temperaturkurva med streckad 0 °C-linje (0 tas med i skalan när prognosen ligger inom 5 °C från fryspunkten), kurvan bryts vid saknade timmar. Nederbördsstaplar i mm vattenekvivalent med mönster per typ (fylld = regn, prickig = snö, randig = blandat). Vind var 3:e timme; pilen visar **vart vinden blåser** (SMHI:s `wind_from_direction` + 180°). Byvind i tooltip. Hover, tap (ligger kvar) och piltangenter; textsammanfattning som aria-label. Under 320 px bredd scrollar diagrammet horisontellt inom sig.
- **Nederbörd och nysnö** (`lib/weather/precipitation.ts`, testad): prognosens mm är `precipitation_amount_mean` i kg/m² = **mm vattenekvivalent**. Typ (Regn/Snö/Blandat/Okänd) avgörs **per timme** – modellens `predominant_precipitation_type_at_surface` (0–12), annars `precipitation_frozen_part`, annars temperaturen den timmen – och periodens typ är den som står för ≥ 80 % av mängden. snow1g har ingen egen snöparameter, så "Beräknad nysnö" är en grov uppskattning: fast andel × temperaturberoende snö/vatten-kvot (> −1 °C 5–8, −1…−5 8–12, −5…−10 10–15, < −10 15–20), visad som intervall i hela cm. Ingen uppskattning vid regn, eller vid blandat utan fryst andel. Hålls isär från MEPS "snö på is" (befintligt snötäcke).
- **Cache:** API-svar har `Cache-Control: no-cache` (webbläsaren kontrollerar alltid) och `CDN-Cache-Control` för Vercels CDN.

### Sentinel-satellitbilder (kartlager)

`GET /api/satellite?lon&lat` (`lib/server/planetary.ts`) söker scener som täcker vattnets centroid de senaste 30 dagarna i Microsoft Planetary Computers öppna STAC och returnerar färdiga XYZ-tilemallar. Ingen nyckel eller env-variabel krävs.

- **Sentinel-1 SAR:** `sentinel-1-rtc` (GRD → radiometriskt terrängkorrigerad gamma0, VV+VH; produkt från Planetary Computer). Visas: VV i dB (`10*log10(vv)`) med **fast** skala −25…0 dB och titilers färgskala `turbo` (låg respons blå → grön → gul → orange → röd → mörk). Ingen autokontrast per scen, så samma färg = samma dB i alla passager. Ingen extra specklefiltrering (RTC-produkten som den är). De 5 senaste passagerna, med satellit och stigande/fallande bana. VH lagras som metadata (`polarizations`) men visas inte.
- **Legend:** "SAR ytrespons" – Låg respons/Slät yta ↔ Hög respons/Grov yta. Inga isklasser.
- **Vind vid passage:** `GET /api/satellite/wind?lon&lat&time` – observerad vind inom ±1 h från passagen: SMHI `latest-months` (timvärden ~4 mån, param 4/3/21) och Trafikverket VViS (5-min, ~7 dygn). Närmaste 3 stationer inom 50 km per källa; vald på avstånd + 0,5 km per minuts tidsskillnad (`lib/satellite/passWind.ts`). Riktning och byvind från samma station och tid. Saknas observation: "Vind vid passage: ingen observation tillgänglig". Ingen prognos som ersättning. CDN-cache 24 h (30 min om inget hittades).
- **Sentinel-2 optisk:** `sentinel-2-l2a`, sann färg (`visual`) eller falsk färg (B08/B04/B03, 0–4000) via `renderings`. Scener med ≤ 30 % molnighet (för hela 100 km-rutan); annars senaste oavsett moln. Dubbletter från överlappande rutor tas bort.
- **Scenmodell:** `SatelliteScene` (`lib/satellite/api.ts`): id, sensor, tid, satellit, bana, moln, bbox, polarisationer, produkttyp, `renderings[]` (id, etikett, tile-URL).
- **Leverans:** MapLibre-rasterkälla med tiles direkt från Planetary Computer (CORS öppet, PNG med genomskinlighet utanför scenen, tiles cachas 1 h hos dem; scensökning cachas 1 h på CDN). Inga rasterfiler laddas ned till servern.
- **Lagerordning:** baskarta → satellitraster → ortnamn → sjöpolygoner → etiketter. Sjöfyllningen tonas ned (8 %, samlingsområden 4 %) när satellitlager visas; konturer, hover och klick finns kvar.
- **UI:** ett lager åt gången, opacitet 30–100 % (default 70 %), bläddring mellan passager, etikett på kartan (sensor, tid, satellit, bana). Stängs vid byte av vatten. Tile-fel ger "Sentinel-1-bild kunde inte laddas" (resp. Sentinel-2).
- **Begränsningar:** Planetary Computer publicerar Sentinel-1 RTC med några timmars fördröjning. Scener kan täcka vattnet bara delvis (stråkets kant). Absolut dB varierar mellan passager med infallsvinkel, bana (stigande/fallande), vind och speckle – fast skala gör färgerna jämförbara men inte fysikaliskt likvärdiga. VViS-historik räcker bara ~7 dygn; äldre passager får vind enbart från SMHI.
- **Framåt (ej byggt):** jämförelse två passager (swipe/sida vid sida) kan använda två `SatelliteScene` samtidigt. Förändringsdetektion kräver samma bana (relative orbit) för jämförbar geometri, differens i dB (t.ex. titiler-expression över två items eller statistik-endpoint per sjöpolygon), tröskel mot speckle och vindkontext – presenteras som "förändrad radarrespons", aldrig som "is".

### Trafikverket VViS (kompletterande observationer)

`lib/server/vvis.ts` – Trafikverkets öppna API `https://api.trafikinfo.trafikverket.se/v2/data.json`, namespace `road.weatherinfo`, schemaversion 2.1.

- **Nyckel:** `TRAFIKVERKET_API_KEY`. Saknas den används Trafikverkets publika `demokey` (avsedd för test – registrera egen nyckel på data.trafikverket.se för produktion). API-svaret anger `RateLimit-Policy: 100;w=1`.
- **Data:** `WeatherMeasurepoint` (stationer + senaste mätning, cache 6 h, hela landet i ett anrop) och `WeatherObservation` (mätningar var 5:e minut, ~24 h bakåt, cache 10 min, ett anrop för de 3 närmaste aktuella stationerna). Parametrar: lufttemperatur, vind (hastighet, riktning, 10-min max som byvind), nederbörd (`Aggregated5minutes.TotalWaterEquivalent`, mm per 5 min – summeras). Vägytetemperatur hämtas inte till väderdelen.
- **Normalisering:** `lib/weather/stations.ts` gör om 5-minutersdata till timvärden (senaste / summa / max), filtrerar orimliga värden och ger samma `StationSeries` som SMHI.
- **Stationsval per parameter** (`chooseBest`, testad): SMHI och VViS är likvärdiga kandidater. Poäng = avstånd (km) + 10 × andel saknade timmar + 2 × timmar sedan senaste värde; observationer äldre än 3 h utesluts. Vindriktning och byvind tas från samma station som vald vind.
- **Reserv:** fel i VViS loggas och vädret visas med enbart SMHI.
- **Begränsningar:** VViS-stationer står vid vägar (köldhål, broar, öppna vindlägen) och representerar inte sjön; station och avstånd visas alltid. VViS används **inte** i GD-beräkningen – det kräver ett separat beslut om hur SMHI- och VViS-serier ska kvalitetskontrolleras och viktas över tid (serierna har redan samma form för en sådan modell). Licensvillkoren kunde inte läsas utan inloggning; källan anges som "Källa: Trafikverket".

### MEPS sjöismodell (MET Norway)

`GET /api/meps?cells=y:x,…` (`app/api/meps/route.ts`, `lib/server/meps.ts`).

- **Källa:** THREDDS `mepslatest/meps_det_2_5km_*.ncml` via OPeNDAP, senaste körning med alla 67 tidssteg. FLake-variabler: `SFX_H_ICE` (istjocklek, m), `SFX_H_SNOW` (snö på is, m), `SFX_TS_WATER` (yttemperatur, K). MET Norway, CC BY 4.0.
- **Rutor per vatten:** byggskriptet beräknar vilka 2,5 km-rutor (Lambert conformal conic, `lib/meps/grid.ts`, verifierad mot gittrets lat/lon) vars mittpunkt ligger i vattnet – max 25, annars närmaste ruta – och sparar dem som `mepsCells` i indexet. I Värmland: 202 vatten har 1 ruta, 52 har 2–9, 7 har ≥ 10.
- **Värde:** median över rutor med sjöyta (fyllnadsvärde 9.97e36 = ingen sjö i rutan), för +0 h (MODEL) och +24/+48/+66 h (FORECAST). Antal rutor med sjöyta visas.
- **Begränsning:** värdet gäller modellens sjöyta i rutan, inte nödvändigtvis just det vattnet – särskilt för små vatten. Endast senaste körning (`?asOf=` ger "Endast nuläge").

### Modellerad åkbarhet · Vänernmodellen (BETA)

Samma kartlager och färgskala som sjömodellen, men en separat modell för vatten där MEPS-istjocklek saknas (`data/regions/*.json` → `waterModels`; för Värmland Vänerns tre samlingsområden och deras delområden). Allt i `lib/vanern/`; parametrar i `config.ts`.

- **Analysgrid:** `generateVanernGrid` lägger ett rutnät (standard 2 × 2 km, `cellKm`) över vattenytan och klipper cellerna mot polygonerna (`lib/geo/clip.ts`). Ca 450 celler i Värmland. Cellerna visas i lagret Modellerad åkbarhet; klick väljer det underliggande vattenobjektet.
- **Komponenter (0–100, vikter):** köldmängd 30 % (aktuell/historisk ur befintlig logik), temperaturhistorik 20 % (72 h + 7 dygn, observerat), Sentinel-1 20 %, vind 15 % (72 h), nederbörd 15 % (48 h, regn/blandat/snö efter temperatur). Saknad komponent = `null` (aldrig 0); vikterna normaliseras. Sentinel saknas → tak 55 och låg datatillit.
- **Väder:** hämtas en gång per 0,25°-ruta (`/api/weather/history`), närmaste SMHI-station med tillräcklig täckning, och delas av cellerna i rutan.
- **Sentinel-1:** `/api/vanern/passes` hittar senaste pass och föregående pass från samma bana; `/api/vanern/sentinel` hämtar median/std av VV (dB) per cell via Planetary Computers statistik-endpoint (ett anrop per cell och pass, 6 samtidiga, hämtas i delar om 60 celler). Cachas i Nexts datacache (7 dygn) och i minnet. **Tolkningen (`lib/vanern/sentinel.ts`) är experimentell och inte kalibrerad:** den väger jämnhet inom cellen och förändring mellan pass tyngre än absolut nivå.
- **Internt resultat per cell:** `{ score, category, confidence, components, cap }` (`VanernCellResult`); i utveckling tillgängligt som `window.__isvakVanern`. Ingen detaljvy per cell.

### Kända egenheter i källdatan

- 152 sjönamn förekommer flera gånger (33 × "Långsjön") – `objektid` är alltid nyckel.
- Vänern finns inte som en polygon utan i delar ("Norra Vänern", "Värmlandsskärgården" …), delvis med raka snittkanter.
- 32 vatten saknar polygon; de visas som punkter (inga i Värmlandsområdet).

## Arkitektur

```
app/                 Next.js App Router (page, layout, manifest)
components/
  IsvakApp.tsx     klientskal: state för vald sjö, sök, position
  map/               LakeMap (MapLibre), ColdLegend, LayerControl, LocateButton
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

MapLibre GL JS 6 med en egen mörk, avskalad stil ovanpå OpenFreeMap-vektortiles (ingen API-nyckel; byt via `NEXT_PUBLIC_MAP_STYLE_URL`).

**Låst semantik (2026-10-02):** etiketten visar **historisk referens-GD** ("Värmeln 56"), färgen visar **aktuell köldmängd / historisk referens**. Historisk GD styr aldrig färgen direkt – två vatten på samma relativa nivå får samma färg.

- **Progress:** `getColdProgress(areaType, current, historical)` i `lib/map/coldScale.ts` → `{ ratio, percent, cls }` eller `no_reference` (saknad/≤ 0 referens, ingen division) / `no_current` / `not_applicable` (COLLECTION_AREA). Procent cappas inte (sidopanelen visar t.ex. 254 %); färgskalan slutar i klassen ≥ 120 %.
- **Klasser** (`COLD_PROGRESS_CLASSES`, enda stället med gränser och färger): 0 % Ingen ackumulerad köld (dämpad blågrå `#5d7a94`) · 1–49 % Tidigt (`#cfe3ef`) · 50–79 % På väg (`#8cc0e2`) · 80–99 % Nära historisk referens (`#4f9ad8`) · 100–119 % Historisk referens uppnådd (`#2b74d0`) · ≥ 120 % Över historisk referens (`#1d55b8` + ljus kontur). Enbart blått – ingen grön/gul/orange/röd.
- **Aktuell GD till kartan:** `GET /api/cold/current?stations=…[&asOf]` räknar alla regionens stationer i ett anrop (samma metod som stationsrouten, CDN-cache 30 min). Klienten berikar sjöarnas GeoJSON med `pct`, `label` och `lt` (`lib/map/lakeFeatures.ts`). Innan svaret finns ritas vattnen som ej klassificerade (endast kontur).
- **Etiketter:** exakt "Sjönamn XX" (avrundad referens); utan referens bara namnet. Tre lager efter omslutande rektangels yta: ≥ 25 km² från zoom 7, ≥ 4 km² från 8,5, övriga från 10,5. Större vatten placeras först vid krock; MapLibres kollisionshantering döljer resten.
- **Info:** liten kontroll "Aktuell / historisk ?" på kartan ersätter den gamla GD-legenden.
- **Datakvalitet:** referens ≤ 0 loggas i konsolen och ger ingen progress.

#### Objekttyp (`areaType`)

Varje vattenobjekt har en `areaType` (`types/lake.ts`). Progressfärg och referensetikett avgörs **enbart** av `canRenderColdDays()` / `getColdProgress()` i `lib/map/coldScale.ts` (kartuttrycket följer samma ordning).

| areaType | Innebörd | Progressfärg + referensetikett |
|---|---|---|
| `WATER` | Faktisk sjö eller tydligt avgränsat vattenobjekt | Ja |
| `SUBAREA` | Avgränsad del av ett större vatten (centroiden ligger inuti ett annat objekt). `parent` anger det omslutande objektet | Ja |
| `COLLECTION_AREA` | Samlingsområde med flera vattenmiljöer | **Nej** – neutral grå yta, bara namn som etikett |

- **COLLECTION_AREA anges manuellt** i `data/area-types.json` (`collectionAreaIds`) tills källan har bättre metadata. Värmland: Norra Vänern, Värmlandsskärgården, Hammarösjön, Jutviken-Otterbäcken, Värmlandsnäs och Lurö Skärgård, Segerstads skärgård (+ Södra Vänern, Yttre Dalbosjön utanför länet). Urvalet bygger på struktur – polygoner som omsluter flera egna vattenobjekt med avvikande värden – inte på storlek.
- **SUBAREA härleds ur geometrin** vid bygget. Ger strukturen för framtida delvatten (vikar, fjordar, innerskärgård).
- **Historiska värden behålls.** Ett samlingsområdes GD finns kvar i datan (`hca`) och visas i panelen som "Historisk områdesobservation" under *Områdeshistorik*, utan klassfärg. `Lake.historicalColdAmount` (sjöspecifik) och `Lake.areaHistoricalColdAmount` (område) hålls isär.
- **Fall som hålls isär:** aktuell 0 GD (riktigt värde → 0 %-klass), saknad referens eller aktuell GD (endast kontur), ej tillämpad (`COLLECTION_AREA`, `not_applicable`).
- **Geometri:** samlingsområden klipps fria från alla omslutna vattenobjekt (och mindre samlingsområden) med `polygon-clipping` (endast vid bygget). Objekt ritas största först så att delområden alltid hamnar ovanpå.
- **Övergång till metadata:** när källan (eller egen PostGIS-tabell) får en objekttyp ersätts `collectionAreaIds` av den – `areaType` sätts då i byggsteget/API:t och resten av appen är oförändrad.

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

## Namnbyte

Tidigare namn: Isradar. `isradar_koldmangd/` (källdatamappen) behåller sitt namn. Gamla miljövariablerna `ISRADAR_SOURCE_DIR` och `NEXT_PUBLIC_ISRADAR_REGION` stöds fortfarande som fallback.
