import styles from "./SafetyNotice.module.css";

/**
 * Säkerhetsinformationen. Delas av startgaten och Om Isvak så att text, ikon, avskiljare och spacing
 * inte kan glida isär. Ingen egen ruta: en tunn linje ovanför, gul varningsikon som enda färgaccent.
 * Storleken ärvs från omgivningen; rubrikens storlek kan styras med --safety-title-size.
 */
export default function SafetyNotice({ id, headingLevel = 3 }: { id: string; headingLevel?: 2 | 3 }) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <section className={styles.notice} aria-labelledby={id}>
      <Heading id={id} className={styles.title}>
        <svg
          className={styles.icon}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M12 3 2.5 20h19z" />
          <path d="M12 10v4.5M12 17.2v.1" />
        </svg>
        Viktig säkerhetsinformation
      </Heading>
      <p className={styles.text}>
        Isvak bedömer inte om en is är säker att beträda. Modellresultat och underliggande data kan vara osäkra,
        ofullständiga eller inaktuella. Isens bärighet måste alltid bedömas på plats med rätt kunskap och
        utrustning.
      </p>
    </section>
  );
}
