"use client";

import { useState, useEffect, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import ScatterplotView from "../components/ScatterplotView";
import NetworkView from "../components/NetworkView";
import styles from "./explore.module.css";
import { visualPalette } from "../lib/visualPalette";

type CanadianFilter = "full" | "full_partial";
type TabType = "scatterplot" | "network";
type DataSource =
  | "Human Computing Interactions"
  | "Information Systems"
  | "Computer Vision";

interface Institution {
  id: string;
  name: string;
  label_name?: string;
  display_name: string;
  country_code: string;
  type: string;
  ICI: number;
  field_citations: number;
  field_papers: number;
  totalACI?: number;
}

interface Author {
  author_id: string;
  display_name: string;
  field_papers: number;
  field_citations: number;
  aci: number;
  last_known_institution: {
    id: string;
    display_name: string;
    label_name: string;
    country_code: string;
  } | null;
}

// Map data sources to their respective data paths
const DATA_SOURCE_PATHS: Record<DataSource, string> = {
  "Human Computing Interactions": "/data",
  "Computer Vision": "/data_computer_vision",
  "Information Systems": "/data_information_systems",
};

function ExploreContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Initialize field from query params or default to "Human Computing Interactions"
  const fieldParam = searchParams.get("field");
  const initialField: DataSource =
    fieldParam === "information_systems"
      ? "Information Systems"
      : fieldParam === "computer_vision"
        ? "Computer Vision"
        : "Human Computing Interactions";

  const [activeTab, setActiveTab] = useState<TabType>(
    searchParams.get("tab") === "network" ? "network" : "scatterplot",
  );
  const [maxAuthors, setMaxAuthors] = useState<number>(30);
  const [maxUniversities, setMaxUniversities] = useState<number>(12);
  const [canadianFilter, setCanadianFilter] = useState<CanadianFilter>("full");
  const [dataSource, setDataSource] = useState<DataSource>(initialField);
  const [networkViewMode, setNetworkViewMode] = useState<
    "author" | "university"
  >("author");

  // Publications range
  const [publicationsMin, setPublicationsMin] = useState<number | null>(null);
  const [publicationsMax, setPublicationsMax] = useState<number | null>(null);

  // Citations range
  const [citationsMin, setCitationsMin] = useState<number | null>(null);
  const [citationsMax, setCitationsMax] = useState<number | null>(null);

  // University search
  const [searchText, setSearchText] = useState<string>("");
  const [selectedUniversities, setSelectedUniversities] = useState<Set<string>>(
    new Set(),
  );
  const [showDropdown, setShowDropdown] = useState<boolean>(false);
  const [universities, setUniversities] = useState<
    Array<{ name: string; label_name?: string }>
  >([]);

  // Data state
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [authors, setAuthors] = useState<Author[]>([]);

  // Persistent university color mapping based on totalACI ranking
  const [universityColorMap, setUniversityColorMap] = useState<Map<string, typeof visualPalette[0]>>(new Map());

  // Get the data path based on selected data source
  const dataPath = DATA_SOURCE_PATHS[dataSource];

  // Disable maxAuthors slider when in network tab with university view mode
  const isMaxAuthorsDisabled =
    activeTab === "network" && networkViewMode === "university";

  // Disable publications and citations filters when in network tab with university view mode
  const areRangeFiltersDisabled =
    activeTab === "network" && networkViewMode === "university";

  // Load institutions data (pre-sorted by totalACI via sort-institutions-by-totalACI.js)
  useEffect(() => {
    fetch(`${dataPath}/institutions_canadian.json`)
      .then((res) => res.json())
      .then((data: Institution[]) => {
        // Files are pre-sorted by totalACI (sum of all Canadian authors' ACI)
        setInstitutions(data);
        const universityList = data.map((inst) => ({
          name: inst.name,
          label_name: inst.label_name,
        }));
        setUniversities(universityList);

        // Create persistent color mapping based on totalACI ranking
        // Map directly to palette items (rank is index in sorted institutions array)
        const colorMap = new Map<string, typeof visualPalette[0]>();
        data.forEach((inst, index) => {
          const paletteItem = visualPalette[index % visualPalette.length];
          // Map by both name and label_name for flexibility
          colorMap.set(inst.name, paletteItem);
          if (inst.label_name) {
            colorMap.set(inst.label_name, paletteItem);
          }
        });
        setUniversityColorMap(colorMap);
      })
      .catch((err) => console.error("Failed to load institutions:", err));
  }, [dataPath]);

  // Load authors data
  useEffect(() => {
    fetch(`${dataPath}/authors_canadian.json`)
      .then((res) => res.json())
      .then((data: Author[]) => {
        setAuthors(data);
      })
      .catch((err) => console.error("Failed to load authors:", err));
  }, [dataPath]);

  // Apply all filters to authors (computed value)
  const filteredAuthors = useMemo(() => {
    if (authors.length === 0) return [];

    let filtered = authors;

    // Filter by Canadian status
    if (canadianFilter === "full") {
      filtered = filtered.filter(
        (author) => author.last_known_institution?.country_code === "CA",
      );
    } else {
      filtered = filtered.filter(
        (author) =>
          author.last_known_institution?.country_code === "CA" ||
          author.last_known_institution?.country_code !== undefined,
      );
    }

    // Filter by publications range
    if (publicationsMin !== null) {
      filtered = filtered.filter(
        (author) => author.field_papers >= publicationsMin,
      );
    }
    if (publicationsMax !== null) {
      filtered = filtered.filter(
        (author) => author.field_papers <= publicationsMax,
      );
    }

    // Filter by citations range
    if (citationsMin !== null) {
      filtered = filtered.filter(
        (author) => author.field_citations >= citationsMin,
      );
    }
    if (citationsMax !== null) {
      filtered = filtered.filter(
        (author) => author.field_citations <= citationsMax,
      );
    }

    // Filter by selected universities (match by name)
    if (selectedUniversities.size > 0) {
      filtered = filtered.filter((author) => {
        if (!author.last_known_institution) return false;
        // Match against the institution's name field (not display_name)
        // Need to find the institution by display_name and check its name
        return selectedUniversities.has(
          author.last_known_institution.display_name,
        );
      });
    }

    // Sort by ACI descending
    return filtered.sort((a, b) => b.aci - a.aci);
  }, [
    authors,
    canadianFilter,
    publicationsMin,
    publicationsMax,
    citationsMin,
    citationsMax,
    selectedUniversities,
  ]);

  // Determine top universities based on pre-computed totalACI
  const topUniversities = useMemo(() => {
    if (institutions.length === 0) return [];

    // Get unique institution IDs from filtered authors
    const authorInstitutionIds = new Set(
      filteredAuthors
        .map((author) => author.last_known_institution?.id)
        .filter((id): id is string => id !== null && id !== undefined),
    );

    // Filter institutions to only those with authors in the filtered set
    // Institutions are already sorted by totalACI from the file
    const relevantInstitutions = institutions.filter((inst) =>
      authorInstitutionIds.has(inst.id),
    );

    // Take top N institutions (already sorted by totalACI from file)
    return relevantInstitutions.slice(0, maxUniversities);
  }, [institutions, filteredAuthors, maxUniversities]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (
        !target.closest("#universitySearch") &&
        !target.closest("[data-dropdown]")
      ) {
        setShowDropdown(false);
      }
    };
    if (showDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showDropdown]);

  // Update URL when field or tab changes
  useEffect(() => {
    const params = new URLSearchParams();
    const fieldParam =
      dataSource === "Information Systems"
        ? "information_systems"
        : dataSource === "Computer Vision"
          ? "computer_vision"
          : "hci";
    params.set("field", fieldParam);
    if (activeTab !== "scatterplot") {
      params.set("tab", activeTab);
    }
    router.replace(`/explore?${params.toString()}`, { scroll: false });
  }, [dataSource, activeTab, router]);

  return (
    <div className={styles.page}>
      {/* ── Header ── */}
      <header className={styles.header}>
        <Link href="/" className={styles.backLink}>
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            aria-hidden
          >
            <path
              d="M11 6H1M1 6L5.5 1.5M1 6L5.5 10.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
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
            <option value="Human Computing Interactions">
              Human Computing Interactions
            </option>
            <option value="Computer Vision">Computer Vision</option>
            <option value="Information Systems">Information Systems</option>
          </select>
        </div>

        {/* Authors Range */}
        <div className={styles.filterGroup}>
          <label
            htmlFor="maxAuthors"
            style={{ opacity: isMaxAuthorsDisabled ? 0.5 : 1 }}
          >
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
            style={{
              opacity: isMaxAuthorsDisabled ? 0.5 : 1,
              cursor: isMaxAuthorsDisabled ? "not-allowed" : "pointer",
            }}
          />
        </div>

        {/* Universities Range */}
        <div className={styles.filterGroup}>
          <label htmlFor="maxUniversities">
            Institutions — {maxUniversities}
          </label>
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
          <label
            htmlFor="publicationsMin"
            style={{ opacity: areRangeFiltersDisabled ? 0.5 : 1 }}
          >
            Publications
          </label>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <input
              id="publicationsMin"
              type="number"
              placeholder="Min"
              value={publicationsMin ?? ""}
              onChange={(e) =>
                setPublicationsMin(
                  e.target.value && Number(e.target.value) > 0
                    ? Number(e.target.value)
                    : null,
                )
              }
              className={styles.numberInput}
              min="0"
              disabled={areRangeFiltersDisabled}
              style={{
                opacity: areRangeFiltersDisabled ? 0.5 : 1,
                cursor: areRangeFiltersDisabled ? "not-allowed" : "text",
              }}
            />
            <span style={{ opacity: 0.5 }}>—</span>
            <input
              id="publicationsMax"
              type="number"
              placeholder="Max"
              value={publicationsMax ?? ""}
              onChange={(e) =>
                setPublicationsMax(
                  e.target.value && Number(e.target.value) > 0
                    ? Number(e.target.value)
                    : null,
                )
              }
              className={styles.numberInput}
              min="0"
              disabled={areRangeFiltersDisabled}
              style={{
                opacity: areRangeFiltersDisabled ? 0.5 : 1,
                cursor: areRangeFiltersDisabled ? "not-allowed" : "text",
              }}
            />
          </div>
        </div>

        {/* Citations Range */}
        <div className={styles.filterGroup}>
          <label
            htmlFor="citationsMin"
            style={{ opacity: areRangeFiltersDisabled ? 0.5 : 1 }}
          >
            Citations
          </label>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <input
              id="citationsMin"
              type="number"
              placeholder="Min"
              value={citationsMin ?? ""}
              onChange={(e) =>
                setCitationsMin(e.target.value ? Number(e.target.value) : null)
              }
              className={styles.numberInput}
              min="0"
              disabled={areRangeFiltersDisabled}
              style={{
                opacity: areRangeFiltersDisabled ? 0.5 : 1,
                cursor: areRangeFiltersDisabled ? "not-allowed" : "text",
              }}
            />
            <span style={{ opacity: 0.5 }}>—</span>
            <input
              id="citationsMax"
              type="number"
              placeholder="Max"
              value={citationsMax ?? ""}
              onChange={(e) =>
                setCitationsMax(e.target.value ? Number(e.target.value) : null)
              }
              className={styles.numberInput}
              min="0"
              disabled={areRangeFiltersDisabled}
              style={{
                opacity: areRangeFiltersDisabled ? 0.5 : 1,
                cursor: areRangeFiltersDisabled ? "not-allowed" : "text",
              }}
            />
          </div>
        </div>

        {/* University Search */}
        <div className={styles.filterGroup} style={{ position: "relative", flex: 1.2 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <label htmlFor="universitySearch">
              Institution Search
              {selectedUniversities.size > 0 &&
                ` (${selectedUniversities.size} selected)`}
            </label>
            {selectedUniversities.size > 0 && (
              <button
                onClick={() => setSelectedUniversities(new Set())}
                style={{
                  fontSize: "11px",
                  padding: "2px 6px",
                  background: "transparent",
                  border: "1px solid #ccc",
                  borderRadius: "3px",
                  cursor: "pointer",
                  opacity: 0.7,
                }}
              >
                Clear
              </button>
            )}
          </div>
          <input
            id="universitySearch"
            type="text"
            placeholder="Type to filter institutions..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            onFocus={() => setShowDropdown(true)}
            className={styles.numberInput}
            style={{ width: "100%" }}
          />
          {showDropdown && (
            <div
              data-dropdown
              style={{
                position: "absolute",
                top: "100%",
                left: 0,
                right: 0,
                backgroundColor: "white",
                border: "1px solid #ccc",
                borderRadius: "4px",
                maxHeight: "200px",
                overflowY: "auto",
                zIndex: 1000,
                marginTop: "4px",
                boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
              }}
            >
              {universities.filter((uni) => {
                const searchLower = searchText.toLowerCase();
                return (
                  uni.name.toLowerCase().includes(searchLower) ||
                  (uni.label_name &&
                    uni.label_name.toLowerCase().includes(searchLower))
                );
              }).length === 0 ? (
                <div
                  style={{
                    padding: "12px",
                    textAlign: "center",
                    opacity: 0.6,
                    fontSize: "14px",
                  }}
                >
                  No institutions found
                </div>
              ) : (
                universities
                  .filter((uni) => {
                    const searchLower = searchText.toLowerCase();
                    return (
                      uni.name.toLowerCase().includes(searchLower) ||
                      (uni.label_name &&
                        uni.label_name.toLowerCase().includes(searchLower))
                    );
                  })
                  .map((uni) => (
                    <label
                      key={uni.name}
                      style={{
                        textTransform: "none",
                        letterSpacing: "0px",

                        display: "flex",
                        alignItems: "center",
                        padding: "8px 12px",
                        cursor: "pointer",
                        borderBottom: "1px solid #eee",
                      }}
                      onMouseDown={(e) => e.preventDefault()}
                    >
                      <input
                        type="checkbox"
                        checked={selectedUniversities.has(uni.name)}
                        onChange={(e) => {
                          const newSelected = new Set(selectedUniversities);
                          if (e.target.checked) {
                            newSelected.add(uni.name);
                          } else {
                            newSelected.delete(uni.name);
                          }
                          setSelectedUniversities(newSelected);
                        }}
                        style={{ marginRight: "8px" }}
                      />
                      <span style={{ fontSize: "12px" }}>
                        {uni.label_name || uni.name}
                      </span>
                    </label>
                  ))
              )}
            </div>
          )}
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
            authors={filteredAuthors}
            institutions={topUniversities}
            maxAuthors={maxAuthors}
            universityColorMap={universityColorMap}
            dataPath={dataPath}
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
            selectedUniversities={selectedUniversities}
            universityColorMap={universityColorMap}
            institutions={institutions}
          />
        )}
      </div>
    </div>
  );
}

export default function ExplorePage() {
  return (
    <Suspense
      fallback={<div style={{ height: "100vh", background: "#f2f2ee" }} />}
    >
      <ExploreContent />
    </Suspense>
  );
}
