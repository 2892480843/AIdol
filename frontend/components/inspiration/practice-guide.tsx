import styles from "./practice-guide.module.css";

export interface PracticeGuideProps {
  title: string;
  description: string;
  steps: readonly { title: string; body: string }[];
}

export function PracticeGuide({
  title,
  description,
  steps,
}: PracticeGuideProps) {
  return (
    <section className={styles.guide} aria-label={title}>
      <div className={styles.heading}>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      <ol className={styles.steps} role="list">
        {steps.map((step, index) => (
          <li className={styles.step} key={`${index}:${step.title}`}>
            <span className={styles.number} aria-hidden="true">
              {index + 1}
            </span>
            <div className={styles.copy}>
              <h4>{step.title}</h4>
              <p>{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
