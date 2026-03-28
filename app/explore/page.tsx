"use client";

import { useState } from "react";
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

export default function ExplorePage() {
  const [activeTab, setActiveTab] = useState<TabType>("scatterplot");
  const [maxAuthors, setMaxAuthors] = useState<number>(10);
  const [maxUniversities, setMaxUniversities] = useState<number>(5);
  const [canadianFilter, setCanadianFilter] = useState<CanadianFilter>("full");
  const [selectedField, setSelectedField] = useState<string>("");
  const [selectedSubfield, setSelectedSubfield] = useState<string>("");

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
        <div className={styles.filterGroup}>
          <label htmlFor="maxAuthors">Authors — {maxAuthors}</label>
          <input
            id="maxAuthors"
            type="range"
            min="10"
            max="500"
            value={maxAuthors}
            onChange={(e) => setMaxAuthors(Number(e.target.value))}
            className={styles.slider}
          />
        </div>
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
        <div className={styles.filterGroup}>
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
        </div>
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
          />
        ) : (
          <NetworkView
            maxAuthors={maxAuthors}
            maxUniversities={maxUniversities}
            canadianFilter={canadianFilter}
            domain={domainValue}
          />
        )}
      </div>
    </div>
  );
}
