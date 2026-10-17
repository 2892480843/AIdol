import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowUpRight } from "lucide-react";
import { STYLE_FORMULAS } from "@/lib/inspiration/catalog";
import styles from "./dashboard-home.module.css";

export function InspirationTeasers() {
  const t = useTranslations("dashboard");
  return (
    <section
      className={styles.inspirationTeasers}
      aria-labelledby="home-style-notes"
    >
      <div className={styles.editorialHeading}>
        <div>
          <p className={styles.kicker}>{t("inspiration.eyebrow")}</p>
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
      <div className={styles.teaserGrid}>
        {STYLE_FORMULAS.slice(0, 3).map((formula, index) => (
          <Link
            key={formula.id}
            href={`/dashboard/inspiration?formula=${formula.id}`}
            className={styles.teaser}
          >
            <span className={styles.teaserNumber}>
              {String(index + 1).padStart(2, "0")}
            </span>
            <div>
              <h3>{t(`inspiration.formulas.${formula.key}.title`)}</h3>
              <p>{t(`inspiration.formulas.${formula.key}.summary`)}</p>
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
