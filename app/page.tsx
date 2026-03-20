import Image from "next/image";
import Link from "next/link";
import styles from "./page.module.css";

export default function Home() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <Image
          className={styles.logo}
          src="/next.svg"
          alt="Next.js logo"
          width={100}
          height={20}
          priority
        />
        <div className={styles.intro}>
          <h1>837 Information Visualization</h1>
          <p>
            Explore visualizations of OpenAlex author data.
          </p>
        </div>
        <div className={styles.ctas}>
          <Link
            className={styles.primary}
            href="/scatterplot"
          >
            View Scatterplot
          </Link>
          <Link
            className={styles.secondary}
            href="/university-authors"
          >
            View Authorships Link
          </Link>
        </div>
      </main>
    </div>
  );
}
