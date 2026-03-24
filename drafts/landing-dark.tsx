"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import styles from "./page.module.css";

export default function Home() {
  const cursorGlowRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  // Cursor spotlight
  useEffect(() => {
    setMounted(true);
    const hero = heroRef.current;
    const glow = cursorGlowRef.current;
    if (!hero || !glow) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = hero.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      glow.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    };

    hero.addEventListener("mousemove", handleMouseMove);
    return () => hero.removeEventListener("mousemove", handleMouseMove);
  }, []);

  // Scroll reveal
  const revealRefs = useRef<HTMLElement[]>([]);
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && e.target.classList.add("visible")),
      { threshold: 0.1, rootMargin: "0px 0px -40px 0px" }
    );
    revealRefs.current.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const addRef = (el: HTMLElement | null) => {
    if (el && !revealRefs.current.includes(el)) revealRefs.current.push(el);
  };

  return (
    <div className={styles.page}>

      {/* ── Hero ── */}
      <section className={styles.hero} ref={heroRef}>
        <div className={styles.cursorGlow} ref={cursorGlowRef} />
        <div className={styles.heroNoise} />
        <div className={styles.heroContent}>
          <p className={`${styles.entrance} ${styles.d0}`}>
            OpenAlex Research Explorer
          </p>
          <h1 className={`${styles.heroTitle} ${styles.entrance} ${styles.d1}`}>
            Find the researcher<br />who changes everything
          </h1>
          <p className={`${styles.heroSub} ${styles.entrance} ${styles.d2}`}>
            Explore 200,000+ Canadian researchers through interactive
            visualizations — publications, citations, co-authorship networks,
            and detailed profiles.
          </p>
          <div className={`${styles.entrance} ${styles.d3}`}>
            <Link href="/explore" className={styles.ctaButton}>
              <span>Start Exploring</span>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                <path d="M1 6H11M11 6L6.5 1.5M11 6L6.5 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </Link>
          </div>
        </div>

        {/* Scroll indicator */}
        {mounted && (
          <div className={styles.scrollHint}>
            <span>Scroll</span>
            <div className={styles.scrollLine} />
          </div>
        )}
      </section>

      {/* ── Features ── */}
      <section className={styles.features}>
        <div className={styles.featuresInner}>
          <p className={`${styles.sectionEyebrow} reveal`} ref={addRef}>
            What you can do
          </p>
          <div className={styles.featureGrid}>
            {[
              { num: "01", title: "Scatterplot Analysis", body: "Compare researchers across institutions by publications, citations, and author citation index. Spot outliers, find rising stars." },
              { num: "02", title: "Network Mapping", body: "Visualize co-authorship as a live force-directed graph. Watch institutional clusters form in real time." },
              { num: "03", title: "Author Profiles", body: "Dive deep into any researcher — h-index, research topics, citation trends by year, and full institutional history." },
            ].map((f) => (
              <div key={f.num} className={`${styles.featureCard} reveal`} ref={addRef}>
                <span className={styles.featureNum}>{f.num}</span>
                <h3 className={styles.featureTitle}>{f.title}</h3>
                <p className={styles.featureBody}>{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Stats ── */}
      <section className={styles.stats}>
        <div className={styles.statsInner}>
          {[
            { val: "200K+", label: "Researchers indexed" },
            { val: "140K+", label: "Co-authorship links" },
            { val: "100+",  label: "Canadian institutions" },
          ].map((s, i) => (
            <div key={i} className={`${styles.statItem} reveal`} ref={addRef}>
              <span className={styles.statVal}>{s.val}</span>
              <span className={styles.statLabel}>{s.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      <section className={styles.closing}>
        <div className={`${styles.closingInner} reveal`} ref={addRef}>
          <h2 className={styles.closingTitle}>
            Ready to find your next supervisor?
          </h2>
          <p className={styles.closingBody}>
            Explore the data, follow the connections, make an informed decision.
          </p>
          <Link href="/explore" className={styles.ctaButton}>
            <span>Get Started</span>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
              <path d="M1 6H11M11 6L6.5 1.5M11 6L6.5 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </Link>
        </div>
      </section>

    </div>
  );
}
