import type { Metadata } from "next";
import Link from "next/link";
import { COLD_PROGRESS_CLASSES } from "@/lib/map/coldScale";
import {
  CATEGORIES,
  ICE_GATES,
  MIN_SOURCES,
  MISSING_ICE_CAP,
  RIDEABILITY_FACTORS,
  WEIGHTS,
  type RideabilityFactorId,
} from "@/lib/rideability/config";
import { SOURCES } from "@/lib/sources";
import {
  MIN_AVAILABLE_WEIGHT,
  SENTINEL,
  SENTINEL_MISSING_CAP,
  VANERN_COMPONENTS,
  VANERN_GATES,
  VANERN_GRID,
  VANERN_WEIGHTS,
  WEATHER_WINDOWS,
} from "@/lib/vanern/config";
import styles from "./om.module.css";

export const metadata: Metadata = {
  title: "Om Isvak",
  description: "Hur Isvak fungerar, vilka data och modeller som används – och varför de inte kan användas för att bedöma is.",
};

const FACTOR: Record<RideabilityFactorId, string> = {
  iceThickness: "Modellerad istjocklek (MEPS)",
  coldDegree: "Aktuell köldmängd i förhållande till historisk",
  snow: "Modellerad snö på is (MEPS)",
  sentinel: "Sentinel-1 (satellitradar)",
  precipitation: "Observerad nederbörd senaste 24 h",
};

const VANERN: Record<(typeof VANERN_COMPONENTS)[number], string> = {
  cold: "Köldmängd i förhållande till historisk",
  temperature: "Temperaturhistorik (observerad, 72 timmar och 7 dygn)",
  sentinel: "Sentinel-1 (variation, förändring mellan pass)",
  wind: "Vind senaste 72 timmarna",
  precipitation: "Nederbörd senaste 48 timmarna (regn, blandat, snö)",
};

const pct = (v: number) => `${Math.round(v * 100)} %`;

export default function OmIsvak() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <Link href="/" className={styles.back}>
          ← Till kartan
        </Link>
        <h1>Om Isvak</h1>
        <p className={styles.lead}>
          Isvak samlar köldmängd, väder, modeller och satellitdata på en karta för att visa var det kan vara värt att
          göra isspaning på plats. Den här sidan beskriver i detalj hur allt fungerar – och vad det inte går att
          använda det till.
        </p>

        <section className={styles.danger} aria-labelledby="varning">
          <h2 id="varning">Livsfara – läs detta först</h2>
          <p>
            <strong>Det är förenat med livsfara att vistas på isar utan rätt utrustning, sällskap och kunskap.</strong>{" "}
            Människor drunknar och dör varje vinter efter att ha gått, åkt eller kört genom isen.
          </p>
          <p>
            <strong>Isvaks modeller kan inte användas som ett verktyg för att bedöma is.</strong> Allt som visas är
            beräkningar och mätningar av andra saker än isen själv: temperaturer, modellerade värden, väder och
            radarbilder. Ingen har kontrollerat isen på platsen. En färg, en kategori eller en siffra säger{" "}
            <strong>ingenting</strong> om huruvida isen bär – inte ens när den visar &quot;Mycket gynnsamma
            indikationer&quot;. Isen kan vara farlig trots gynnsamma indikationer, och kartan kan visa fel.
          </p>
          <ul>
            <li>Gå aldrig ut på is ensam, och gå aldrig ut på is som du inte själv har kontrollerat på plats.</li>
            <li>
              Ha rätt utrustning (till exempel isdubbar, isborr eller isstav, flytplagg, rep och torra reservkläder)
              och kunna använda den.
            </li>
            <li>
              Ha kunskap om hur is bildas och varierar – tjockleken och kvaliteten kan skifta kraftigt på några meter,
              särskilt vid strömmar, utlopp, bryggor, vass och under snö.
            </li>
            <li>Lita inte på spår efter andra – ingen kan veta att isen bär bara för att någon annan gått där.</li>
            <li>Vid olycka: ring 112.</li>
          </ul>
          <p>
            Isvak ersätter inte lokal kunskap, råd från sjöräddning, livräddning eller kommun, och inte heller
            Skridskonätets egna rapporter. Användning sker helt på egen risk. Tjänsten tillhandahålls i befintligt skick
            utan någon garanti, och ansvar för skador eller förluster som uppstår av att tjänstens information använts
            friskrivs i den utsträckning lagen tillåter.
          </p>
        </section>

        <h2>Vad Isvak är – och inte är</h2>
        <ul>
          <li>
            <strong>Är:</strong> ett hjälpmedel för att hitta vatten och områden som kan vara intressanta att
            kontrollera på plats, genom att samla observationer, modeller och prognoser på ett ställe.
          </li>
          <li>
            <strong>Är inte:</strong> en isbedömning, en bärighetsindikator eller ett besked om att något är säkert,
            osäkert, åkbart eller rekommenderat. Appen anger inte och ska inte tolkas som att den anger något sådant.
          </li>
        </ul>
        <p>
          Isvak är i betaversion. Modellernas vikter, trösklar och tolkningar är första försök och är inte
          validerade mot verifierade observationer av verkligt isläge.
        </p>

        <h2>Datatyper</h2>
        <p>Allt som visas hör till någon av fyra typer, som hålls isär och märks i gränssnittet:</p>
        <ul>
          <li>
            <strong>Observation (OBS):</strong> uppmätt, till exempel temperatur, nederbörd och vind från SMHI och
            Trafikverket, samt satellitbilder.
          </li>
          <li>
            <strong>Modell (MODELL):</strong> modellerat nuläge, till exempel istjocklek och snö på is från MEPS, och
            Isvaks egen sammanvägning Modellerad åkbarhet.
          </li>
          <li>
            <strong>Prognos (PROGNOS):</strong> modellerad framtid, till exempel SMHI:s 48-timmarsprognos.
          </li>
          <li>
            <strong>Historisk referens (HIST):</strong> värden från tidigare säsonger, till exempel Skridskonätets
            historiska köldmängd.
          </li>
        </ul>

        <h2>Kartlagren</h2>
        <p>
          Ett lager visas åt gången. Lagren hör till kartan och slås på och av i lagerväljaren uppe till vänster, utan att
          du behöver välja en sjö. Utan något lager visas bara baskartan med sjönamn.
        </p>

        <h3>Modellerad åkbarhet (BETA)</h3>
        <p>
          Huvudlagret. Varje vatten färgas efter en sammanvägd modellindikering av nuläget. Färgen är ett uttryck för
          hur många av de underliggande indikatorerna som pekar åt ett håll – <strong>inte</strong> för hur isen är.
          Ingen framtida prognos vägs in.
        </p>
        <ul className={styles.legend}>
          {CATEGORIES.map((c) => (
            <li key={c.id}>
              <span className={styles.swatch} style={{ background: c.fill }} aria-hidden /> {c.label}
            </li>
          ))}
        </ul>
        <p>
          <strong>Samma färger, två modeller.</strong> Kartan väljer modell automatiskt efter vattnet: sjömodellen där
          MEPS-data finns och Vänernmodellen på Vänern. Båda ger en poäng 0–100 (används internt och visas inte som
          primärvärde) som översätts till samma kategorier. Poängen delas in så här: 85 och uppåt Mycket gynnsamma, 70–84
          Gynnsamma, 45–69 Blandade, under 45 Inga indikationer. Otillräckliga data (grå) visas när för lite underlag
          finns.
        </p>

        <h4>Sjömodellen</h4>
        <p>Poängen är en viktad summa av fem indikatorer, normaliserad mot de som har data:</p>
        <ul>
          {RIDEABILITY_FACTORS.map((id) => (
            <li key={id}>
              {FACTOR[id]} – {WEIGHTS[id]} p
            </li>
          ))}
        </ul>
        <p>
          Varje indikator översätts till poäng med en kontinuerlig kurva (till exempel ger 8 cm modellerad is full
          poäng och 0 cm ingen; snö över ca 5 cm ger ingen poäng). Poängen är dock inte ett vanligt medelvärde.
          Modellerad istjocklek fungerar som spärr:
        </p>
        <ul>
          {ICE_GATES.map((g) => (
            <li key={g.reason}>
              {g.reason === "ice_below_2" ? "Under 2 cm" : "2–5 cm"} modellerad is: högst &quot;
              {CATEGORIES.find((c) => c.id === g.cap)?.label}&quot;
            </li>
          ))}
          <li>
            Saknas modellerad istjocklek: högst &quot;{CATEGORIES.find((c) => c.id === MISSING_ICE_CAP)?.label}&quot;
          </li>
          <li>Färre än {MIN_SOURCES} av 5 källor har data: &quot;Otillräckliga data&quot;</li>
        </ul>
        <p>
          Saknad data räknas aldrig som noll – den är &quot;data saknas&quot; och påverkar bara tillgängligt underlag.
          Sentinel-1 är ännu inte kopplat till sjömodellen för enskilda sjöar, så den indikatorn saknas där.
        </p>

        <h4>Vänernmodellen (beta)</h4>
        <p>
          På Vänern saknas modellerad istjocklek. Där används en separat modell som räknas per analyscell om{" "}
          {VANERN_GRID.defaultCellKm} × {VANERN_GRID.defaultCellKm} km, klippt mot vattenytan (ca 450 celler för
          Värmlands del). Varje cell får egen färg. Komponenterna:
        </p>
        <ul>
          {VANERN_COMPONENTS.map((id) => (
            <li key={id}>
              {VANERN[id]} – {pct(VANERN_WEIGHTS[id])}
            </li>
          ))}
        </ul>
        <ul>
          <li>
            <strong>Köldmängd:</strong> aktuell i förhållande till historisk referens, med samma underlag som
            köldmängdslagret.
          </li>
          <li>
            <strong>Temperatur:</strong> observerad temperatur de senaste {WEATHER_WINDOWS.temperatureRecentHours}{" "}
            timmarna och sju dygnen. Stabil kyla ger hög poäng, plusgrader och upptining låg.
          </li>
          <li>
            <strong>Nederbörd:</strong> observerad nederbörd senaste {WEATHER_WINDOWS.precipitationHours} timmarna,
            uppdelad i regn, blandat och snö efter temperaturen. Regn väger tyngst.
          </li>
          <li>
            <strong>Vind:</strong> observerad vind senaste {WEATHER_WINDOWS.windHours} timmarna. Hård och långvarig vind
            sänker poängen, men dämpas om satellitdata antyder en stabil sammanhängande yta.
          </li>
          <li>
            <strong>Sentinel-1:</strong> för varje cell hämtas median och spridning av radarsignalen (VV) för senaste
            pass och föregående pass från samma bana. Modellen väger variationen inom cellen och förändringen mellan
            passen tyngre än absolut nivå, eftersom låg radarrespons även kan finnas över öppet lugnt vatten. Hög
            variation vid vind tolkas som vindpåverkat öppet vatten och sänker poängen kraftigt (tak 30).{" "}
            <strong>Tolkningen är experimentell och inte kalibrerad.</strong>
          </li>
          <li>
            <strong>Spärrar:</strong> ett viktat medelvärde får inte ge gul eller grön färg när förutsättningarna för
            isbildning saknas. Har aktuell köldmängd inte nått {VANERN_GATES.minColdPercent} % av historisk referens
            blir poängen högst {VANERN_GATES.lowColdCap}, och är medeltemperaturen de senaste 72 timmarna{" "}
            {VANERN_GATES.warmMeanC} °C eller varmare blir den högst {VANERN_GATES.warmCap} – oavsett hur jämn
            radarytan är, eftersom lugnt öppet vatten också kan se jämnt ut.
          </li>
          <li>
            <strong>Tak och saknad data:</strong> utan Sentinel-data begränsas poängen till högst{" "}
            {SENTINEL_MISSING_CAP} av 100 (konservativt). Saknas komponenter normaliseras vikterna om. Under{" "}
            {pct(MIN_AVAILABLE_WEIGHT)} tillgängliga vikter visas &quot;Otillräckliga data&quot;. Internt beräknas
            även en datatillit (hög, medel, låg), som inte visas.
          </li>
        </ul>
        <p>
          Sentinel-datat hämtas för passen inom de senaste {SENTINEL.maxAgeHours / 24} dygnen och uppdateras inte i
          realtid – det är beroende av när satelliten passerat och av cachelagring. Delar av Vänern ligger utanför
          Värmland och ingår inte ännu.
        </p>

        <h3>Köldmängd</h3>
        <p>
          Köldmängd räknas i graddagar (GD). Den <strong>aktuella</strong> köldmängden summeras från 1 oktober med
          SMHI:s dygnsmedeltemperatur (netto, aldrig under noll) vid vattnets närmaste mätstation. Den{" "}
          <strong>historiska referensen</strong> är Skridskonätets median av tidigare säsongers köldmängd den dag
          vattnet första gången rapporterades som åkbart. Siffran efter sjönamnet är den historiska referensen. Färgen
          visar hur stor del av referensen som den aktuella köldmängden nått:
        </p>
        <ul>
          {COLD_PROGRESS_CLASSES.map((c) => (
            <li key={c.id}>
              <span className={styles.swatch} style={{ background: c.color }} aria-hidden /> {c.range} – {c.status}
            </li>
          ))}
        </ul>
        <p>
          Referensen är en empirisk uppskattning av när åkning rapporterats, inte en gräns för när is bär. Värdet
          gäller mätstationen, inte sjön. Samlingsområden med flera vattenmiljöer färgsätts inte.
        </p>

        <h3>Sentinel-1 SAR och Sentinel-2 optisk</h3>
        <p>
          Rena satellitbilder från Copernicus, utan tolkning av is eller vatten. Sentinel-1 är radar och fungerar
          genom moln och i mörker; bilden visar radarrespons (VV, dB) på en fast färgskala. Släta ytor ger ofta låg
          respons, grövre ytor högre – men blankt vatten och blank is kan se likadana ut, och vågor, snö, grov is och
          vind påverkar bilden. Sentinel-2 är optisk (sann eller falsk färg) och påverkas av moln och dagsljus;
          molnighet gäller hela bildrutan. Vind och byvind vid passagen visas intill passagens tid. Bilderna visar
          varken istjocklek eller bärighet.
        </p>

        <h3>Mät</h3>
        <p>
          Mätverktyget lägger ut en rutt med klick och visar längden fågelvägen mellan punkterna. Den följer inte
          något underlag, och en utlagd rutt säger inget om huruvida området är lämpligt att färdas på.
        </p>

        <h2>Sjövyn</h2>
        <p>När du väljer ett vatten visas bland annat:</p>
        <ul>
          <li>
            <strong>Köldmängd:</strong> aktuell, historisk, förändring och status.
          </li>
          <li>
            <strong>Modell (MEPS):</strong> modellerad istjocklek, snö på is och yttemperatur från MET Norways
            sjöismodell, i 2,5 km-rutor. Värdet är medianen över rutor med sjöyta och gäller modellens sjöyta, inte
            nödvändigtvis just detta vatten – särskilt för små vatten. Modellen finns bara för senaste körning, och
            saknas på Vänern.
          </li>
          <li>
            <strong>Väder:</strong> två meteogram med samma uppbyggnad – observationer senaste 24 timmarna och SMHI:s
            prognos 48 timmar – med temperatur överst och nederbörd nederst, samt vind. Nederbörden märks som snö vid
            0 °C eller kallare och annars som regn (en enkel tumregel, inte en meteorologisk klassning). Observationerna
            kommer från närmaste station per variabel (SMHI och Trafikverket VViS, högst 50 km), och stationens avstånd
            kan göra att värdena skiljer sig från sjön.
          </li>
        </ul>

        <h2>Källor</h2>
        <ul>
          <li>
            Historisk köldmängd:{" "}
            <a href={SOURCES.skridskonatet.url} rel="noopener noreferrer">
              Skridskonätet
            </a>
          </li>
          <li>
            Temperatur, väder och prognos: <a href="https://www.smhi.se/data/oppna-data">SMHI Öppna data</a> (CC BY
            4.0) och <a href="https://data.trafikverket.se">Trafikverket</a> (vägväderstationer VViS)
          </li>
          <li>
            Sjöismodell: <a href="https://thredds.met.no">MET Norway MEPS</a> (FLake, CC BY 4.0)
          </li>
          <li>
            Satellit: Copernicus Sentinel-data via{" "}
            <a href="https://planetarycomputer.microsoft.com">Microsoft Planetary Computer</a>
          </li>
          <li>Länsgränser: SCB (CC0). Karta: © OpenStreetMap, OpenMapTiles, OpenFreeMap</li>
        </ul>

        <h2>Begränsningar i korthet</h2>
        <ul>
          <li>Ingen modell eller mätning i Isvak mäter isens verkliga tjocklek, kvalitet eller bärighet.</li>
          <li>Modellerna är betaversioner och inte validerade mot verkligt isläge.</li>
          <li>Mätstationer och modellrutor kan ligga långt från det vatten du tittar på.</li>
          <li>Data kan vara försenad, ofullständig eller felaktig, och en källa kan saknas tillfälligt.</li>
          <li>Satellitdata är glesa i tiden och kan inte skilja is från lugnt öppet vatten på ett pålitligt sätt.</li>
          <li>Vatten kan saknas, ha fel gräns eller delas upp annorlunda än i verkligheten.</li>
        </ul>

        <h2>Personuppgifter</h2>
        <p>Din position (om du använder positionsknappen) visas bara lokalt i webbläsaren och skickas ingenstans.</p>

        <p className={styles.endWarning}>
          Kontrollera alltid isen själv, på plats, med rätt utrustning och i sällskap. Isvak kan aldrig göra det åt dig.
        </p>
        <p className={styles.contact}>
          Kontakt – förbättringsförslag, buggar med mera:{" "}
          <a href="mailto:per.a.bjorkman@gmail.com">per.a.bjorkman@gmail.com</a>
        </p>
        <Link href="/" className={styles.back}>
          ← Till kartan
        </Link>
      </main>
    </div>
  );
}
