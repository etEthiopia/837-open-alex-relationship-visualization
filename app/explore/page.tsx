"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import ScatterplotView from "../components/ScatterplotView";
import NetworkView from "../components/NetworkView";
import styles from "./explore.module.css";

type CanadianFilter = "full" | "full_partial";
type TabType = "scatterplot" | "network";
type DataSource = "Human Computing Interactions" | "Information Systems";

// Map data sources to their respective data paths
const DATA_SOURCE_PATHS: Record<DataSource, string> = {
  "Human Computing Interactions": "/data",
  "Information Systems": "/data_information_systems",
};

function ExploreContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Initialize field from query params or default to "Human Computing Interactions"
  const initialField = searchParams.get("field") === "information_systems"
    ? "Information Systems"
    : "Human Computing Interactions";

  const [activeTab, setActiveTab] = useState<TabType>(
    searchParams.get("tab") === "network" ? "network" : "scatterplot"
  );
  const [maxAuthors, setMaxAuthors] = useState<number>(30);
  const [maxUniversities, setMaxUniversities] = useState<number>(10);
  const [canadianFilter, setCanadianFilter] = useState<CanadianFilter>("full");
  const [dataSource, setDataSource] = useState<DataSource>(initialField);
  const [networkViewMode, setNetworkViewMode] = useState<"author" | "university">("author");

  // Publications range
  const [publicationsMin, setPublicationsMin] = useState<number | null>(null);
  const [publicationsMax, setPublicationsMax] = useState<number | null>(null);

  // Citations range
  const [citationsMin, setCitationsMin] = useState<number | null>(null);
  const [citationsMax, setCitationsMax] = useState<number | null>(null);

  // Get the data path based on selected data source
  const dataPath = DATA_SOURCE_PATHS[dataSource];

  // Update URL when field or tab changes
  useEffect(() => {
    const params = new URLSearchParams();
    const fieldParam = dataSource === "Information Systems" ? "information_systems" : "hci";
    params.set("field", fieldParam);
    if (activeTab !== "scatterplot") {
      params.set("tab", activeTab);
    }
    router.replace(`/explore?${params.toString()}`, { scroll: false });
  }, [dataSource, activeTab, router]);

  // Disable maxAuthors slider when in network tab with university view mode
  const isMaxAuthorsDisabled = activeTab === "network" && networkViewMode === "university";

  // Disable publications and citations filters when in network tab with university view mode
  const areRangeFiltersDisabled = activeTab === "network" && networkViewMode === "university";

  return (
    <div className={styles.page}>

      {/* ── Header ── */}
      <header className={styles.header}>
        <Link href="/" className={styles.backLink}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
            <path d="M11 6H1M1 6L5.5 1.5M1 6L5.5 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Home
        </Link>
        <div className={styles.headerDivider} />
        <h1 className={styles.title}>Explore Researchers</h1>
      </header>

      {/* ── Filters ── */}
      <div className={styles.filterBar}>
        {/* Field Selection */}
        <div className={styles.filterGroup}>
          <label htmlFor="field">Field</label>
          <select
            id="field"
            value={dataSource}
            onChange={(e) => setDataSource(e.target.value as DataSource)}
            className={styles.select}
          >
            <option value="Human Computing Interactions">Human Computing Interactions</option>
            <option value="Information Systems">Information Systems</option>
          </select>
        </div>

        {/* Authors Range */}
        <div className={styles.filterGroup}>
          <label htmlFor="maxAuthors" style={{ opacity: isMaxAuthorsDisabled ? 0.5 : 1 }}>
            Authors — {maxAuthors}
          </label>
          <input
            id="maxAuthors"
            type="range"
            min="10"
            max="500"
            value={maxAuthors}
            onChange={(e) => setMaxAuthors(Number(e.target.value))}
            className={styles.slider}
            disabled={isMaxAuthorsDisabled}
            style={{ opacity: isMaxAuthorsDisabled ? 0.5 : 1, cursor: isMaxAuthorsDisabled ? 'not-allowed' : 'pointer' }}
          />
        </div>

        {/* Universities Range */}
        <div className={styles.filterGroup}>
          <label htmlFor="maxUniversities">Universities — {maxUniversities}</label>
          <input
            id="maxUniversities"
            type="range"
            min="5"
            max="100"
            value={maxUniversities}
            onChange={(e) => setMaxUniversities(Number(e.target.value))}
            className={styles.slider}
          />
        </div>

        {/* Publications Range */}
        <div className={styles.filterGroup}>
          <label htmlFor="publicationsMin" style={{ opacity: areRangeFiltersDisabled ? 0.5 : 1 }}>
            Publications
          </label>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input
              id="publicationsMin"
              type="number"
              placeholder="Min"
              value={publicationsMin ?? ''}
              onChange={(e) => setPublicationsMin(e.target.value && Number(e.target.value) > 0 ? Number(e.target.value) : null)}
              className={styles.numberInput}
              min="0"
              disabled={areRangeFiltersDisabled}
              style={{ opacity: areRangeFiltersDisabled ? 0.5 : 1, cursor: areRangeFiltersDisabled ? 'not-allowed' : 'text' }}
            />
            <span style={{ opacity: 0.5 }}>—</span>
            <input
              id="publicationsMax"
              type="number"
              placeholder="Max"
              value={publicationsMax ?? ''}
              onChange={(e) => setPublicationsMax(e.target.value && Number(e.target.value) > 0 ? Number(e.target.value) : null)}
              className={styles.numberInput}
              min="0"
              disabled={areRangeFiltersDisabled}
              style={{ opacity: areRangeFiltersDisabled ? 0.5 : 1, cursor: areRangeFiltersDisabled ? 'not-allowed' : 'text' }}
            />
          </div>
        </div>

        {/* Citations Range */}
        <div className={styles.filterGroup}>
          <label htmlFor="citationsMin" style={{ opacity: areRangeFiltersDisabled ? 0.5 : 1 }}>
            Citations
          </label>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input
              id="citationsMin"
              type="number"
              placeholder="Min"
              value={citationsMin ?? ''}
              onChange={(e) => setCitationsMin(e.target.value ? Number(e.target.value) : null)}
              className={styles.numberInput}
              min="0"
              disabled={areRangeFiltersDisabled}
              style={{ opacity: areRangeFiltersDisabled ? 0.5 : 1, cursor: areRangeFiltersDisabled ? 'not-allowed' : 'text' }}
            />
            <span style={{ opacity: 0.5 }}>—</span>
            <input
              id="citationsMax"
              type="number"
              placeholder="Max"
              value={citationsMax ?? ''}
              onChange={(e) => setCitationsMax(e.target.value ? Number(e.target.value) : null)}
              className={styles.numberInput}
              min="0"
              disabled={areRangeFiltersDisabled}
              style={{ opacity: areRangeFiltersDisabled ? 0.5 : 1, cursor: areRangeFiltersDisabled ? 'not-allowed' : 'text' }}
            />
          </div>
        </div>

        {/* Commented out: Canadian filter (keeping logic for future use) */}
        {/* <div className={styles.filterGroup}>
          <label htmlFor="canadianFilter">Researchers</label>
          <select
            id="canadianFilter"
            value={canadianFilter}
            onChange={(e) => setCanadianFilter(e.target.value as CanadianFilter)}
            className={styles.select}
          >
            <option value="full">Canadian Only</option>
            <option value="full_partial">Canadian + International</option>
          </select>
        </div> */}
      </div>

      {/* ── Tabs ── */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === "scatterplot" ? styles.activeTab : ""}`}
          onClick={() => setActiveTab("scatterplot")}
        >
          Researchers Overview
        </button>
        <button
          className={`${styles.tab} ${activeTab === "network" ? styles.activeTab : ""}`}
          onClick={() => setActiveTab("network")}
        >
          Collaboration Network
        </button>
      </div>

      {/* ── Visualization ── */}
      <div className={styles.vizContainer}>
        {activeTab === "scatterplot" ? (
          <ScatterplotView
            maxAuthors={maxAuthors}
            maxUniversities={maxUniversities}
            canadianFilter={canadianFilter}
            dataPath={dataPath}
            publicationsMin={publicationsMin}
            publicationsMax={publicationsMax}
            citationsMin={citationsMin}
            citationsMax={citationsMax}
          />
        ) : (
          <NetworkView
            maxAuthors={maxAuthors}
            maxUniversities={maxUniversities}
            canadianFilter={canadianFilter}
            dataPath={dataPath}
            onViewModeChange={setNetworkViewMode}
            publicationsMin={publicationsMin}
            publicationsMax={publicationsMax}
            citationsMin={citationsMin}
            citationsMax={citationsMax}
          />
        )}
      </div>
    </div>
  );
}

export default function ExplorePage() {
  return (
    <Suspense fallback={<div style={{ height: "100vh", background: "#f2f2ee" }} />}>
      <ExploreContent />
    </Suspense>
  );
}
