"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import styles from "./page.module.css";

export default function Home() {
  const revealRefs = useRef<HTMLElement[]>([]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
    );

    revealRefs.current.forEach((el) => {
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  const addRevealRef = (el: HTMLElement | null) => {
    if (el && !revealRefs.current.includes(el)) {
      revealRefs.current.push(el);
    }
  };

  return (
    <div className={styles.page}>
      {/* Hero */}
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <p className={`${styles.entrance} ${styles.d0}`}>
            OpenAlex Research Explorer
          </p>
          <h1 className={`${styles.heroTitle} ${styles.entrance} ${styles.d1}`}>
            Discover researchers, visualize connections, find your next
            supervisor
          </h1>
          <p
            className={`${styles.heroDescription} ${styles.entrance} ${styles.d2}`}
          >
            An interactive platform for exploring Canadian researchers — their
            publications, citations, and collaboration networks — powered by
            OpenAlex.
          </p>
          <div className={`${styles.entrance} ${styles.d3}`}>
            <Link href="/explore" className={styles.ctaButton}>
              <span>Start Exploring</span>
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <path
                  d="M1 6H11M11 6L6.5 1.5M11 6L6.5 10.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className={styles.features}>
        <div className={styles.featuresInner}>
          <h2
            className={`${styles.sectionLabel} reveal`}
            ref={addRevealRef}
          >
            What you can do
          </h2>
          <div className={styles.featureGrid}>
            <div
              className={`${styles.featureCard} reveal`}
              ref={addRevealRef}
            >
              <div className={styles.featureNumber}>01</div>
              <h3 className={styles.featureTitle}>Scatterplot Analysis</h3>
              <p className={styles.featureText}>
                Compare researchers across institutions by publications,
                citations, and author citation index. Filter by university to
                find patterns.
              </p>
            </div>
            <div
              className={`${styles.featureCard} reveal`}
              ref={addRevealRef}
            >
              <div className={styles.featureNumber}>02</div>
              <h3 className={styles.featureTitle}>Network Mapping</h3>
              <p className={styles.featureText}>
                Visualize co-authorship relationships as an interactive
                force-directed graph. See how researchers cluster by institution.
              </p>
            </div>
            <div
              className={`${styles.featureCard} reveal`}
              ref={addRevealRef}
            >
              <div className={styles.featureNumber}>03</div>
              <h3 className={styles.featureTitle}>Author Profiles</h3>
              <p className={styles.featureText}>
                Dive deep into any researcher — h-index, topics, publication
                history, institutional affiliations, and citation trends over
                time.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className={styles.stats}>
        <div className={styles.statsInner}>
          <div className={`${styles.statItem} reveal`} ref={addRevealRef}>
            <span className={styles.statNumber}>200K+</span>
            <span className={styles.statLabel}>Researchers indexed</span>
          </div>
          <div className={styles.statDivider} />
          <div className={`${styles.statItem} reveal`} ref={addRevealRef}>
            <span className={styles.statNumber}>140K+</span>
            <span className={styles.statLabel}>Co-authorship links</span>
          </div>
          <div className={styles.statDivider} />
          <div className={`${styles.statItem} reveal`} ref={addRevealRef}>
            <span className={styles.statNumber}>100+</span>
            <span className={styles.statLabel}>Canadian institutions</span>
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className={styles.closing}>
        <div
          className={`${styles.closingInner} reveal`}
          ref={addRevealRef}
        >
          <h2 className={styles.closingTitle}>
            Ready to find your next research supervisor?
          </h2>
          <p className={styles.closingText}>
            Explore visualizations, compare researchers, and make informed
            decisions about your academic future.
          </p>
          <Link href="/explore" className={styles.ctaButton}>
            <span>Get Started</span>
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path
                d="M1 6H11M11 6L6.5 1.5M11 6L6.5 10.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Link>
        </div>
      </section>
    </div>
  );
}
