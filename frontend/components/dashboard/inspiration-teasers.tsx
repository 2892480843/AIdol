import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowUpRight, Shirt } from "lucide-react";
import { STYLE_CREATORS, STYLE_FORMULAS } from "@/lib/inspiration/catalog";
import styles from "./dashboard-home.module.css";

export function InspirationTeasers() {
  const t = useTranslations("dashboard");
  const featured = STYLE_FORMULAS.filter((formula) =>
    STYLE_CREATORS.some(
      (creator) =>
        creator.id === formula.creatorId && creator.platform === "douyin",
    ),
  ).slice(0, 3);
  return (
    <section
      className={styles.inspirationTeasers}
      aria-labelledby="home-style-notes"
    >
      <div className={styles.editorialHeading}>
        <div>
          <h2 id="home-style-notes">{t("editorial.methods")}</h2>
        </div>
        <Link href="/dashboard/inspiration">
          {t("editorial.allMethods")}
          <ArrowUpRight size={15} aria-hidden="true" />
        </Link>
      </div>
      <p className={styles.editorialDescription}>
        {t("editorial.methodsSubtitle")}
      </p>
      <Link
        href="/dashboard/inspiration#one-piece-many-looks"
        className={styles.anchorEntry}
      >
        <Shirt size={22} aria-hidden="true" />
        <span>
          <strong>{t("inspiration.anchor.title")}</strong>
          <small>{t("inspiration.anchor.description")}</small>
        </span>
        <ArrowUpRight size={18} aria-hidden="true" />
      </Link>
      <div className={styles.teaserGrid}>
        {featured.map((formula, index) => (
          <Link
            key={formula.id}
            href={`/dashboard/inspiration?formula=${formula.id}`}
            className={`${styles.teaser} group collage-lift ${["-rotate-[1deg]", "rotate-[1.3deg]", "-rotate-[0.5deg]"][index]}`}
          >
            <span aria-hidden="true" className="collage-tape rotate-[-4deg] transition-transform duration-200 ease-out group-hover:rotate-[6deg] group-hover:-translate-y-1" />
            <span className={styles.teaserNumber}>
              {String(index + 1).padStart(2, "0")}
            </span>
            <div>
              <h3>{t(`inspiration.formulas.${formula.key}.title`)}</h3>
              <p>{t(`inspiration.formulas.${formula.key}.summary`)}</p>
              <small className={styles.teaserSource}>
                {
                  STYLE_CREATORS.find(
                    (creator) => creator.id === formula.creatorId,
                  )?.name
                }{" "}
                · {t("inspiration.platforms.douyin")}
              </small>
              <span className={styles.teaserPalette} aria-hidden="true">
                {formula.palette.map((color) => (
                  <i key={color} style={{ background: color }} />
                ))}
              </span>
            </div>
            <ArrowUpRight size={17} aria-hidden="true" />
          </Link>
        ))}
      </div>
    </section>
  );
}
