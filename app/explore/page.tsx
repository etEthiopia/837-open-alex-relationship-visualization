"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import ScatterplotView from "../components/ScatterplotView";
import NetworkView from "../components/NetworkView";
import styles from "./explore.module.css";

type CanadianFilter = "full" | "full_partial";
type TabType = "scatterplot" | "network";

// Field options grouped by domain
const FIELD_GROUPS = [
  {
    domain: "Physical Sciences",
    fields: [
      "Computer Science",
      "Engineering",
      "Mathematics",
      "Physics and Astronomy",
      "Chemistry",
      "Earth and Planetary Sciences",
      "Materials Science",
      "Environmental Science",
      "Energy",
      "Chemical Engineering",
    ],
  },
  {
    domain: "Health Sciences",
    fields: ["Medicine", "Nursing", "Health Professions", "Dentistry", "Veterinary"],
  },
  {
    domain: "Life Sciences",
    fields: [
      "Neuroscience",
      "Biochemistry, Genetics and Molecular Biology",
      "Immunology and Microbiology",
      "Agricultural and Biological Sciences",
    ],
  },
  {
    domain: "Social Sciences",
    fields: [
      "Psychology",
      "Social Sciences",
      "Economics, Econometrics and Finance",
      "Business, Management and Accounting",
      "Decision Sciences",
      "Arts and Humanities",
    ],
  },
];

// Subfield options per field
const SUBFIELDS: Record<string, string[]> = {
  "Computer Science": [
    "Artificial Intelligence",
    "Computer Vision and Pattern Recognition",
    "Computer Networks and Communications",
    "Human-Computer Interaction",
    "Information Systems",
    "Software",
    "Hardware and Architecture",
    "Signal Processing",
    "Computational Theory and Mathematics",
    "Computer Graphics and Computer-Aided Design",
    "Computer Science Applications",
  ],
  "Engineering": [
    "Electrical and Electronic Engineering",
    "Biomedical Engineering",
    "Mechanical Engineering",
    "Civil and Structural Engineering",
    "Aerospace Engineering",
    "Control and Systems Engineering",
    "Industrial and Manufacturing Engineering",
    "Computational Mechanics",
    "Building and Construction",
    "Automotive Engineering",
    "Ocean Engineering",
    "Safety, Risk, Reliability and Quality",
    "Architecture",
    "Media Technology",
  ],
  "Mathematics": [
    "Applied Mathematics",
    "Statistics and Probability",
    "Computational Mathematics",
    "Modeling and Simulation",
    "Numerical Analysis",
  ],
  "Physics and Astronomy": [
    "Condensed Matter Physics",
    "Astronomy and Astrophysics",
    "Atomic and Molecular Physics, and Optics",
    "Nuclear and High Energy Physics",
    "Statistical and Nonlinear Physics",
    "Radiation",
  ],
  "Medicine": [
    "Oncology",
    "Cardiology and Cardiovascular Medicine",
    "Neurology",
    "Epidemiology",
    "Public Health, Environmental and Occupational Health",
    "Infectious Diseases",
    "Surgery",
    "Psychiatry and Mental health",
    "Pharmacology",
    "Pediatrics, Perinatology and Child Health",
    "Radiology, Nuclear Medicine and Imaging",
    "Genetics",
    "Endocrinology, Diabetes and Metabolism",
    "Orthopedics and Sports Medicine",
    "Hematology",
  ],
  "Neuroscience": [
    "Cognitive Neuroscience",
    "Cellular and Molecular Neuroscience",
    "Behavioral Neuroscience",
    "Sensory Systems",
    "Neurology",
  ],
  "Psychology": [
    "Clinical Psychology",
    "Experimental and Cognitive Psychology",
    "Developmental and Educational Psychology",
    "Applied Psychology",
    "Social Psychology",
    "Neuropsychology and Physiological Psychology",
  ],
  "Environmental Science": [
    "Ecology",
    "Global and Planetary Change",
    "Environmental Engineering",
    "Water Science and Technology",
    "Pollution",
    "Environmental Chemistry",
  ],
  "Materials Science": [
    "Electronic, Optical and Magnetic Materials",
    "Biomaterials",
    "Polymers and Plastics",
    "Ceramics and Composites",
    "Materials Chemistry",
    "Surfaces, Coatings and Films",
  ],
  "Biochemistry, Genetics and Molecular Biology": [
    "Cancer Research",
    "Genetics",
    "Cell Biology",
    "Molecular Biology",
    "Molecular Medicine",
    "Clinical Biochemistry",
    "Aging",
  ],
};

function ExploreContent() {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabType>(
    searchParams.get("tab") === "network" ? "network" : "scatterplot"
  );
  const [maxAuthors, setMaxAuthors] = useState<number>(30);
  const [maxUniversities, setMaxUniversities] = useState<number>(10);
  const [canadianFilter, setCanadianFilter] = useState<CanadianFilter>("full");
  const [selectedField, setSelectedField] = useState<string>("");
  const [selectedSubfield, setSelectedSubfield] = useState<string>("");
  const [networkViewMode, setNetworkViewMode] = useState<"author" | "university">("author");

  // Publications range
  const [publicationsMin, setPublicationsMin] = useState<number | null>(null);
  const [publicationsMax, setPublicationsMax] = useState<number | null>(null);

  // Citations range
  const [citationsMin, setCitationsMin] = useState<number | null>(null);
  const [citationsMax, setCitationsMax] = useState<number | null>(null);

  const handleFieldChange = (val: string) => {
    setSelectedField(val);
    setSelectedSubfield(""); // reset subfield on field change
  };

  // Build the domain value passed to views
  const domainValue = !selectedField
    ? "All Domains"
    : selectedSubfield
    ? `subfield:${selectedSubfield}`
    : `field:${selectedField}`;

  const availableSubfields = selectedField ? (SUBFIELDS[selectedField] ?? []) : [];

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
            value={selectedField}
            onChange={(e) => handleFieldChange(e.target.value)}
            className={styles.select}
          >
            <option value="">All Fields</option>
            {FIELD_GROUPS.map((group) => (
              <optgroup key={group.domain} label={`── ${group.domain}`}>
                {group.fields.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        {/* Topic Selection (if field selected) */}
        {selectedField && availableSubfields.length > 0 && (
          <div className={`${styles.filterGroup} ${styles.filterGroupAnimate}`}>
            <label htmlFor="subfield">Topic</label>
            <select
              id="subfield"
              value={selectedSubfield}
              onChange={(e) => setSelectedSubfield(e.target.value)}
              className={styles.select}
            >
              <option value="">All Topics</option>
              {availableSubfields.map((sf) => (
                <option key={sf} value={sf}>{sf}</option>
              ))}
            </select>
          </div>
        )}

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
            domain={domainValue}
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
            domain={domainValue}
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
