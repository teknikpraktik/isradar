import type { Metadata } from "next";
import Link from "next/link";
import RequireDisclaimer from "@/components/ui/RequireDisclaimer";
import SafetyNotice from "@/components/ui/SafetyNotice";
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
import { LAKE_SENTINEL } from "@/lib/sentinel/config";
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
  description: "Hur Isvak fungerar, vilka data och modeller som används, och varför de inte kan användas för att bedöma is.",
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

/** Fet pil som ikon (i stället för tecknet ←). */
function ArrowLeft() {
  return (
    <svg className={styles.arrow} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 12H5M11 5l-7 7 7 7" />
    </svg>
  );
}

export default function OmIsvak() {
  return (
    <RequireDisclaimer>
    <div className={styles.page}>
      <main className={styles.main}>
        <Link href="/" className={styles.back}>
          <ArrowLeft /> Tillbaka till kartan
        </Link>
        <h1>Om Isvak</h1>
        <p className={styles.lead}>
          Isvak samlar köldmängd, väder, modeller och satellitdata på en karta för att visa var det kan vara värt att
          göra isspaning på plats. Den här sidan beskriver i detalj hur allt fungerar, och vad det inte går att
          använda det till.
        </p>

        <h2>Vad Isvak är och inte är</h2>
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
        <p>Allt som visas hör till någon av fyra typer, som hålls isär i beräkningar och texter:</p>
        <ul>
          <li>
            <strong>Observation:</strong> uppmätt, till exempel temperatur, nederbörd och vind från SMHI och
            Trafikverket, samt satellitbilder.
          </li>
          <li>
            <strong>Modell:</strong> modellerat nuläge, till exempel istjocklek och snö på is från MEPS, och
            Isvaks egen sammanvägning Modellerad åkbarhet.
          </li>
          <li>
            <strong>Prognos:</strong> modellerad framtid, till exempel SMHI:s prognos på 48 timmar.
          </li>
          <li>
            <strong>Historisk referens:</strong> värden från tidigare säsonger, till exempel Skridskonätets
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
          Huvudlagret. Varje vatten färgas efter en sammanvägd modellindikering av nuläget.
        </p>
        <p>
          <strong>Vad begreppet betyder.</strong> Med modellerad åkbarhet avses hur gynnsamma de analyserade
          förhållandena är för möjlig åkbar is. Begreppet innebär inte att isen faktiskt är åkbar, bärig eller säker.
        </p>
        <p>
          Färgen bygger på en viktad sammanvägning av flera underliggande indikatorer och modellregler. Den beskriver{" "}
          <strong>inte</strong> hur isen faktiskt är. Ingen framtida prognos vägs in.
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
          data från MEPS finns och modellen för stora sjöar där modellerad istjocklek saknas (för närvarande Vänern).
          Båda ger en poäng från 0 till 100 (används internt och visas inte som primärvärde) som översätts till samma
          kategorier. Poängen delas in så här: 85 och uppåt Mycket gynnsamma, 70 till 84 Gynnsamma, 45 till 69
          Blandade, under 45 Inga indikationer.
        </p>
        <p>
          <strong>Otillräckliga data</strong> (grå) betyder inte dåliga isförhållanden. Det betyder att Isvak saknar
          tillräckligt underlag för att beräkna modellen.
        </p>

        <h4>Sjömodellen</h4>
        <p>Poängen är en viktad summa av fem indikatorer, normaliserad mot de som har data:</p>
        <ul>
          {RIDEABILITY_FACTORS.map((id) => (
            <li key={id}>
              {FACTOR[id]}: {WEIGHTS[id]} %
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
              {g.reason === "ice_below_2" ? "Under 2 cm" : "2 till 5 cm"} modellerad is: högst &quot;
              {CATEGORIES.find((c) => c.id === g.cap)?.label}&quot;
            </li>
          ))}
          <li>
            Saknas modellerad istjocklek: högst &quot;{CATEGORIES.find((c) => c.id === MISSING_ICE_CAP)?.label}&quot;
          </li>
          <li>Färre än {MIN_SOURCES} av 5 källor har data: &quot;Otillräckliga data&quot;</li>
        </ul>
        <p>
          Saknad data räknas aldrig som noll. Den är &quot;data saknas&quot; och påverkar bara tillgängligt underlag.
        </p>
        <p>
          <strong>Sentinel-1 i sjömodellen.</strong> För varje sjö beräknas statistik över sjöns yta: median och
          spridning av radarsignalen (VV) för senaste pass och föregående pass från samma bana, samt vinden vid
          passagen. Samma metod som i modellen för stora sjöar används. Heuristiken väger variationen över ytan och
          förändringen mellan passen tyngre än absolut nivå, eftersom lugnt öppet vatten och vissa isytor kan ge
          liknande radarrespons. Sentinel är en indikator bland flera och ersätter inte spärren för modellerad
          istjocklek. Vatten mindre än {LAKE_SENTINEL.minAreaKm2} km², och vatten som saknar användbart satellitpass, får
          ingen indikator från Sentinel (data saknas). <strong>Tolkningen är experimentell och inte kalibrerad.</strong>
        </p>

        <h4>Modell för stora sjöar (beta)</h4>
        <p>Används för närvarande på Vänern.</p>
        <p>
          Modellen är till för stora sjöar där modellerad istjocklek saknas. Den räknas per analyscell om{" "}
          {VANERN_GRID.defaultCellKm} × {VANERN_GRID.defaultCellKm} km, klippt mot vattenytan (flera hundra celler på
          Vänern). Varje cell får egen färg. Stora sjöar delas upp eftersom isförhållanden och ytförhållanden kan skilja sig
          betydligt mellan olika delar av samma sjö. Rutstorleken innebär inte att modellens faktiska precision är{" "}
          {VANERN_GRID.defaultCellKm} km. Komponenterna:
        </p>
        <ul>
          {VANERN_COMPONENTS.map((id) => (
            <li key={id}>
              {VANERN[id]}: {pct(VANERN_WEIGHTS[id])}
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
            pass och föregående pass från samma bana, med samma metod som i sjömodellen. Modellen väger variationen
            inom cellen och förändringen mellan passen tyngre än absolut nivå, eftersom låg radarrespons även kan
            finnas över öppet lugnt vatten. Hög variation i kombination med vind kan i den nuvarande heuristiken bidra
            till en tolkning som är förenlig med vindpåverkat öppet vatten och sänker därför poängen.{" "}
            <strong>Tolkningen är experimentell och inte kalibrerad.</strong>
          </li>
          <li>
            <strong>Spärrar:</strong> ett viktat medelvärde får inte ge gul eller grön färg när förutsättningarna för
            isbildning saknas. Har aktuell köldmängd inte nått {VANERN_GATES.minColdPercent} % av historisk referens
            blir poängen högst {VANERN_GATES.lowColdCap}, och är medeltemperaturen de senaste 72 timmarna{" "}
            {VANERN_GATES.warmMeanC} °C eller varmare blir den högst {VANERN_GATES.warmCap}, oavsett hur jämn
            radarytan är, eftersom lugnt öppet vatten också kan se jämnt ut.
          </li>
          <li>
            <strong>Tak och saknad data:</strong> utan data från Sentinel begränsas poängen till högst{" "}
            {SENTINEL_MISSING_CAP} av 100 (konservativt). Saknas komponenter normaliseras vikterna om. Under{" "}
            {pct(MIN_AVAILABLE_WEIGHT)} tillgängliga vikter visas &quot;Otillräckliga data&quot;. Internt beräknas
            även en datatillit (hög, medel, låg), som inte visas.
          </li>
        </ul>
        <p>
          Satellitdatat från Sentinel hämtas för passen inom de senaste {SENTINEL.maxAgeHours / 24} dygnen och uppdateras inte i
          realtid. Det är beroende av när satelliten passerat och av cachelagring. Delar av Vänern ligger utanför
          Värmland och ingår inte ännu.
        </p>

        <h3>Köldmängd</h3>
        <p>
          Köldmängd räknas i graddagar (GD). Den <strong>aktuella</strong> köldmängden summeras från 1 oktober med
          SMHI:s dygnsmedeltemperatur vid vattnets närmaste mätstation. Köldmängden summeras som ett
          nettovärde där kalla dygn ökar och milda dygn minskar summan. Den ackumulerade köldmängden kan aldrig bli
          lägre än 0 GD. Den <strong>historiska referensen</strong> är Skridskonätets median av tidigare säsongers köldmängd den dag
          vattnet första gången rapporterades som åkbart, alltså den köldmängd vid vilken vattnet historiskt har
          rapporterats eller bedömts som åkbart enligt Skridskonätets underlag. På kartan anger{" "}
          <strong>färgen</strong> den aktuella ackumulerade köldmängden som procent av vattnets historiska referens,
          och <strong>siffran efter sjönamnet</strong> anger den historiska referensen i graddagar (GD):
        </p>
        <ul>
          {COLD_PROGRESS_CLASSES.map((c) => (
            <li key={c.id}>
              <span className={styles.swatch} style={{ background: c.color }} aria-hidden /> {c.range.replace("–", " till ")}: {c.status}
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
          respons, grövre ytor högre. Men blankt vatten och blank is kan se likadana ut, och vågor, snö, grov is och
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
            sjöismodell, i rutor på 2,5 km. Värdet är medianen över rutor med sjöyta och gäller modellens sjöyta, inte
            nödvändigtvis just detta vatten, särskilt för små vatten. Modellen finns bara för senaste körning, och
            saknas på Vänern.
          </li>
          <li>
            <strong>Väder:</strong> två meteogram med samma uppbyggnad. Det ena visar observationer bakåt i tiden
            (senaste 24 timmarna) och det andra SMHI:s prognos framåt i tiden (48 timmar). Båda visar temperatur,
            nederbörd och vind, med temperatur överst och nederbörd nederst. Nederbörden märks som snö vid 0 °C eller
            kallare och annars som regn (en enkel tumregel, inte en meteorologisk klassning). Observationerna kommer
            från närmaste station per variabel (SMHI och Trafikverket VViS, högst 50 km), och stationens avstånd kan
            göra att värdena skiljer sig från sjön.
          </li>
        </ul>

        <h2>Hur aktuell är informationen?</h2>
        <p>
          Datakällorna uppdateras vid olika tidpunkter. Isvak visar därför tidsstämpel för tillgängliga data där det är
          möjligt. Ett modellresultat kan innehålla komponenter från olika tidpunkter och är inte en realtidsmätning.
        </p>

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
            Satellit: Copernicus Sentinel data via{" "}
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

        <div className={styles.safety}>
          <SafetyNotice id="om-safety" headingLevel={2} />
        </div>
        <p className={styles.contact}>
          Har du synpunkter, förbättringsförslag eller vill rapportera ett fel?
          <br />
          Kontakta{" "}
          <a href="mailto:per.a.bjorkman@gmail.com">per.a.bjorkman@gmail.com</a>
        </p>
        <Link href="/" className={styles.back}>
          <ArrowLeft /> Tillbaka till kartan
        </Link>
      </main>
    </div>
    </RequireDisclaimer>
  );
}
