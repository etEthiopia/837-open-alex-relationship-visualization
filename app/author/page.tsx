"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import * as d3 from "d3";
import styles from "./author.module.css";
import AuthorEgoNetwork from "../components/AuthorEgoNetwork";

interface Institution {
  id: string;
  display_name: string;
  country_code: string;
  type: string;
}

interface Topic {
  id: string;
  display_name: string;
  count: number;
  subfield: { id: string; display_name: string };
  field: { id: string; display_name: string };
  domain: { id: string; display_name: string };
}

interface CountsByYear {
  year: number;
  works_count: number;
  oa_works_count: number;
  cited_by_count: number;
}

interface StatsPerYear {
  field_citations: number;
  field_papers: number;
  field_citations_first_authorship: number;
  field_papers_first_authorship: number;
}

interface YearPoint {
  year: number;
  total: number;
  field: number;
}

type ChartMode = "total" | "field" | "compare";

interface Author {
  author_id: string;
  orcid: string | null;
  display_name: string;
  institutions: Institution[];
  countries: string[];
  affiliations: string[];
  field_citations: number;
  field_papers: number;
  field_papers_first_authorship: number;
  field_citations_first_authorship: number;
  works_count: number;
  cited_by_count: number;
  summary_stats: {
    "2yr_mean_citedness": number;
    h_index: number;
    i10_index: number;
  };
  topics: Topic[];
  counts_by_year: CountsByYear[];
  stats_per_year?: Record<string, StatsPerYear>;
  works_api_url: string;
  last_known_institution: {
    id: string;
    display_name: string;
    country_code: string;
    type: string;
  } | null;
  aci: number;
}

/* ── Inline SVG icons ── */
const IconDoc = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="2" width="12" height="16" rx="2"/>
    <line x1="7" y1="7" x2="13" y2="7"/>
    <line x1="7" y1="10" x2="13" y2="10"/>
    <line x1="7" y1="13" x2="10" y2="13"/>
  </svg>
);
const IconCite = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 7h5v5H3V7zm0 0a5 5 0 0 1 5-5M12 7h5v5h-5V7zm0 0a5 5 0 0 1 5-5"/>
  </svg>
);
const IconH = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
    <line x1="5" y1="4" x2="5" y2="16"/>
    <line x1="15" y1="4" x2="15" y2="16"/>
    <line x1="5" y1="10" x2="15" y2="10"/>
  </svg>
);
const IconI10 = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="10" cy="10" r="7"/>
    <line x1="10" y1="9" x2="10" y2="14"/>
    <circle cx="10" cy="6.5" r="0.5" fill="currentColor" strokeWidth="0"/>
  </svg>
);
const IconBolt = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11.5 2L4 11h6.5L8.5 18 16 9h-6.5L11.5 2z"/>
  </svg>
);
const IconTrend = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="2,14 7,8 11,12 18,5"/>
    <polyline points="14,5 18,5 18,9"/>
  </svg>
);


function buildChart(
  svgEl: SVGSVGElement,
  data: YearPoint[],
  mode: ChartMode,
  colors: { total: string; field: string },
  tooltipId: string
) {
  d3.select(svgEl).selectAll("*").remove();

  const width = 480;
  const height = 220;
  const margin = { top: 20, right: 16, bottom: 32, left: 48 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  const svg = d3
    .select(svgEl)
    .attr("viewBox", `0 0 ${width} ${height}`)
    .style("overflow", "visible")
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const x = d3
    .scaleBand()
    .domain(data.map((d) => String(d.year)))
    .range([0, innerW])
    .padding(mode === "compare" ? 0.25 : 0.35);

  const maxVal =
    mode === "total" ? d3.max(data, (d) => d.total) || 1
    : mode === "field" ? d3.max(data, (d) => d.field) || 1
    : Math.max(d3.max(data, (d) => d.total) || 1, d3.max(data, (d) => d.field) || 1);

  const y = d3.scaleLinear().domain([0, maxVal]).range([innerH, 0]).nice();

  // Grid
  svg.append("g")
    .call(d3.axisLeft(y).ticks(4).tickSize(-innerW).tickFormat(() => ""))
    .call((g) => g.select(".domain").remove())
    .call((g) => g.selectAll(".tick line").attr("stroke", "rgba(0,0,0,0.06)").attr("stroke-dasharray", "3,3"));

  // X axis
  svg.append("g")
    .attr("transform", `translate(0,${innerH})`)
    .call(d3.axisBottom(x).tickValues(data.filter((_, i) => i % 2 === 0).map((d) => String(d.year))))
    .call((g) => g.select(".domain").attr("stroke", "rgba(0,0,0,0.1)"))
    .call((g) => g.selectAll(".tick line").attr("stroke", "rgba(0,0,0,0.1)"))
    .selectAll("text")
    .attr("fill", "rgba(0,0,0,0.38)")
    .style("font-size", "10px")
    .style("font-family", "var(--font-geist-mono), monospace");

  // Y axis
  svg.append("g")
    .call(d3.axisLeft(y).ticks(4))
    .call((g) => g.select(".domain").remove())
    .call((g) => g.selectAll(".tick line").remove())
    .selectAll("text")
    .attr("fill", "rgba(0,0,0,0.38)")
    .style("font-size", "10px")
    .style("font-family", "var(--font-geist-mono), monospace");

  // Tooltip
  d3.select(`#${tooltipId}`).remove();
  const tooltip = d3.select("body").append("div")
    .attr("id", tooltipId)
    .style("position", "absolute")
    .style("background", "#0e0e0c")
    .style("color", "#f0f0ec")
    .style("padding", "7px 12px")
    .style("border-radius", "5px")
    .style("font-size", "12px")
    .style("font-family", "var(--font-geist-mono), monospace")
    .style("pointer-events", "none")
    .style("opacity", "0")
    .style("z-index", "1000")
    .style("white-space", "nowrap");

  if (mode === "compare") {
    const half = x.bandwidth() / 2 - 1;

    // Total bars
    const totalBars = svg.selectAll("rect.bar-total").data(data).enter()
      .append("rect").attr("class", "bar-total")
      .attr("x", (d) => x(String(d.year))!)
      .attr("y", innerH).attr("width", half).attr("height", 0)
      .attr("fill", colors.total).attr("rx", 2).attr("opacity", 0.7);
    totalBars.transition().duration(600).delay((_, i) => i * 30).ease(d3.easeCubicOut)
      .attr("y", (d) => y(d.total)).attr("height", (d) => innerH - y(d.total));
    totalBars
      .on("mouseover", function (event, d) {
        d3.select(this).attr("opacity", 1);
        tooltip.style("opacity", "1").html(`<strong>${d.year}</strong> &nbsp; Total: ${d.total.toLocaleString()}`);
      })
      .on("mousemove", (event) => tooltip.style("left", event.pageX + 12 + "px").style("top", event.pageY - 32 + "px"))
      .on("mouseout", function () { d3.select(this).attr("opacity", 0.7); tooltip.style("opacity", "0"); });

    // Field bars
    const fieldBars = svg.selectAll("rect.bar-field").data(data).enter()
      .append("rect").attr("class", "bar-field")
      .attr("x", (d) => x(String(d.year))! + half + 2)
      .attr("y", innerH).attr("width", half).attr("height", 0)
      .attr("fill", colors.field).attr("rx", 2);
    fieldBars.transition().duration(600).delay((_, i) => i * 30).ease(d3.easeCubicOut)
      .attr("y", (d) => y(d.field)).attr("height", (d) => innerH - y(d.field));
    fieldBars
      .on("mouseover", function (event, d) {
        d3.select(this).attr("fill", d3.color(colors.field)!.darker(0.3).toString());
        tooltip.style("opacity", "1").html(`<strong>${d.year}</strong> &nbsp; Field: ${d.field.toLocaleString()}`);
      })
      .on("mousemove", (event) => tooltip.style("left", event.pageX + 12 + "px").style("top", event.pageY - 32 + "px"))
      .on("mouseout", function () { d3.select(this).attr("fill", colors.field); tooltip.style("opacity", "0"); });

    // Legend
    const leg = svg.append("g").attr("transform", `translate(${innerW - 110}, -14)`);
    leg.append("rect").attr("width", 10).attr("height", 10).attr("fill", colors.total).attr("opacity", 0.7).attr("rx", 2);
    leg.append("text").attr("x", 14).attr("y", 9).style("font-size", "9px").style("fill", "rgba(0,0,0,0.45)").style("font-family", "var(--font-geist-mono), monospace").text("Total");
    leg.append("rect").attr("x", 46).attr("width", 10).attr("height", 10).attr("fill", colors.field).attr("rx", 2);
    leg.append("text").attr("x", 60).attr("y", 9).style("font-size", "9px").style("fill", "rgba(0,0,0,0.45)").style("font-family", "var(--font-geist-mono), monospace").text("Field");
  } else {
    const val = (d: YearPoint) => mode === "total" ? d.total : d.field;
    const color = mode === "total" ? colors.total : colors.field;

    const bars = svg.selectAll("rect.bar").data(data).enter()
      .append("rect").attr("class", "bar")
      .attr("x", (d) => x(String(d.year))!)
      .attr("y", innerH).attr("width", x.bandwidth()).attr("height", 0)
      .attr("fill", color).attr("rx", 3).style("cursor", "pointer");
    bars.transition().duration(600).delay((_, i) => i * 30).ease(d3.easeCubicOut)
      .attr("y", (d) => y(val(d))).attr("height", (d) => innerH - y(val(d)));
    bars
      .on("mouseover", function (event, d) {
        d3.select(this).attr("fill", d3.color(color)!.darker(0.4).toString());
        tooltip.style("opacity", "1").html(`<strong>${d.year}</strong> &nbsp; ${val(d).toLocaleString()}`);
      })
      .on("mousemove", (event) => tooltip.style("left", event.pageX + 12 + "px").style("top", event.pageY - 32 + "px"))
      .on("mouseout", function () { d3.select(this).attr("fill", color); tooltip.style("opacity", "0"); });
  }
}

function AuthorContent() {
  const searchParams = useSearchParams();
  const authorId = searchParams.get("id") || "";
  const fieldContext = searchParams.get("field") || "";
  const fromNetwork = searchParams.get("from") === "network";
  const backHref = fromNetwork ? "/explore?tab=network" : "/explore";
  const [author, setAuthor] = useState<Author | null>(null);
  const [loading, setLoading] = useState(true);
  const [citationsMode, setCitationsMode] = useState<ChartMode>("total");
  const [worksMode, setWorksMode] = useState<ChartMode>("total");
  const citationsRef = useRef<SVGSVGElement>(null);
  const worksRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!authorId) { setLoading(false); return; }
    fetch("/data/authors.json")
      .then((r) => r.json())
      .then((data: Author[]) => {
        const found = data.find((a) => a.author_id === `https://openalex.org/${authorId}`);
        setAuthor(found || null);
        setLoading(false);
      });
  }, [authorId]);

  const renderCitationsChart = useCallback(() => {
    if (!author || !citationsRef.current) return;
    const spy = author.stats_per_year || {};
    const data: YearPoint[] = [...author.counts_by_year]
      .filter((d) => d.year >= 2010)
      .sort((a, b) => a.year - b.year)
      .map((d) => ({
        year: d.year,
        total: d.cited_by_count,
        field: spy[String(d.year)]?.field_citations ?? 0,
      }));
    if (!data.length) return;
    buildChart(citationsRef.current, data, citationsMode, { total: "#3b82f6", field: "#6366f1" }, "tt-citations");
  }, [author, citationsMode]);

  const renderWorksChart = useCallback(() => {
    if (!author || !worksRef.current) return;
    const spy = author.stats_per_year || {};
    const data: YearPoint[] = [...author.counts_by_year]
      .filter((d) => d.year >= 2010)
      .sort((a, b) => a.year - b.year)
      .map((d) => ({
        year: d.year,
        total: d.works_count,
        field: spy[String(d.year)]?.field_papers ?? 0,
      }));
    if (!data.length) return;
    buildChart(worksRef.current, data, worksMode, { total: "#10b981", field: "#059669" }, "tt-works");
  }, [author, worksMode]);

  useEffect(() => {
    renderCitationsChart();
    return () => { d3.select("#tt-citations").remove(); };
  }, [renderCitationsChart]);

  useEffect(() => {
    renderWorksChart();
    return () => { d3.select("#tt-works").remove(); };
  }, [renderWorksChart]);

  const initials = author?.display_name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("") ?? "";

  const primaryDomain = author?.topics[0]?.domain?.display_name ?? "";
  const primaryField = author?.topics[0]?.field?.display_name ?? "";

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.loadingState}>
          <div className={styles.loadingDot} />
          <span>Loading profile</span>
        </div>
      </div>
    );
  }

  if (!author) {
    return (
      <div className={styles.page}>
        <div className={styles.emptyState}>
          <p>Author not found</p>
          <Link href="/explore" className={styles.ctaSecondary}>← Back to Explore</Link>
        </div>
      </div>
    );
  }

  // Field-specific stats — primary, shown prominently first
  const fieldStats = [
    { icon: <IconBolt />, value: author.aci.toFixed(1), label: "Citation Impact" },
    { icon: <IconDoc />, value: String(author.field_papers), label: "Field Papers" },
    { icon: <IconCite />, value: author.field_citations.toLocaleString(), label: "Field Citations" },
    { icon: <IconDoc />, value: String(author.field_papers_first_authorship), label: "1st Author Papers" },
    { icon: <IconCite />, value: author.field_citations_first_authorship.toLocaleString(), label: "1st Author Citations" },
  ];

  // General stats — secondary, compact row below
  const stats = [
    { value: author.works_count.toLocaleString(), label: "Total Works" },
    { value: author.cited_by_count.toLocaleString(), label: "Total Citations" },
    { value: String(author.summary_stats.h_index), label: "h-index" },
    { value: String(author.summary_stats.i10_index), label: "i10-index" },
    { value: author.summary_stats["2yr_mean_citedness"].toFixed(2), label: "2yr Mean Citedness" },
  ];

  return (
    <div className={styles.page}>

      {/* ── Header ── */}
      <header className={styles.header}>
        <Link href={backHref} className={styles.backLink}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
            <path d="M11 6H1M1 6L5.5 1.5M1 6L5.5 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Explore
        </Link>
        <div className={styles.headerDivider} />
        <span className={styles.headerName}>{author.display_name}</span>
      </header>

      {/* ── Content ── */}
      <div className={styles.content}>

        {/* Identity */}
        <section className={styles.identity}>
          <div className={styles.avatar}>
            {initials}
          </div>
          <div className={styles.identityInfo}>

            <h1 className={styles.name}>{author.display_name}</h1>
            <p className={styles.institution}>
              {author.last_known_institution?.display_name || "Unknown Institution"}
              {author.last_known_institution?.country_code && (
                <span className={styles.country}> · {author.last_known_institution.country_code}</span>
              )}
            </p>
            <div className={styles.tags}>
              {fieldContext && (
                <span className={styles.fieldContextTag}>
                  <svg width="9" height="9" viewBox="0 0 9 9" fill="none" aria-hidden style={{marginRight: 4, opacity: 0.6}}>
                    <circle cx="4.5" cy="4.5" r="3.5" stroke="currentColor" strokeWidth="1.2"/>
                    <circle cx="4.5" cy="4.5" r="1.2" fill="currentColor"/>
                  </svg>
                  {fieldContext}
                </span>
              )}
              {primaryDomain && (
                <span className={styles.tag}>{primaryDomain}</span>
              )}
              {primaryField && primaryField !== primaryDomain && (
                <span className={styles.tagSecondary}>{primaryField}</span>
              )}
              {author.orcid && (
                <a
                  href={author.orcid}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.orcidLink}
                >
                  ORCID ↗
                </a>
              )}
            </div>
          </div>
          <button
            className={styles.shortlistBtn}
            onClick={() => alert(`Added ${author.display_name} to your shortlist.`)}
          >
            + Add to Shortlist
          </button>
        </section>

        {/* Field Performance — primary stats */}
        <section className={styles.fieldStatsGrid}>
          {fieldStats.map((s) => (
            <div key={s.label} className={styles.fieldStatCard}>
              <div className={styles.fieldStatIcon}>{s.icon}</div>
              <div className={styles.fieldStatValue}>{s.value}</div>
              <div className={styles.fieldStatLabel}>{s.label}</div>
            </div>
          ))}
        </section>

        {/* General Stats — secondary, compact */}
        <section className={styles.generalStatsRow}>
          {stats.map((s) => (
            <div key={s.label} className={styles.generalStatItem}>
              <div className={styles.generalStatValue}>{s.value}</div>
              <div className={styles.generalStatLabel}>{s.label}</div>
            </div>
          ))}
        </section>

        {/* Collaboration Network */}
        <section className={styles.section}>
          <p className={styles.sectionEyebrow}>Collaboration Network</p>
          <AuthorEgoNetwork
            authorId={author.author_id}
            authorName={author.display_name}
          />
        </section>

        {/* Charts */}
        <div className={styles.chartsRow}>
          <div className={styles.chartCard}>
            <div className={styles.chartHeader}>
              <p className={styles.chartLabel}>Citations per Year</p>
              <div className={styles.chartToggle}>
                {(["total", "field", "compare"] as ChartMode[]).map((m) => (
                  <button
                    key={m}
                    className={`${styles.chartToggleBtn} ${citationsMode === m ? styles.chartToggleBtnActive : ""}`}
                    onClick={() => setCitationsMode(m)}
                  >
                    {m.charAt(0).toUpperCase() + m.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <svg ref={citationsRef} className={styles.chartSvg} />
          </div>
          <div className={styles.chartCard}>
            <div className={styles.chartHeader}>
              <p className={styles.chartLabel}>Publications per Year</p>
              <div className={styles.chartToggle}>
                {(["total", "field", "compare"] as ChartMode[]).map((m) => (
                  <button
                    key={m}
                    className={`${styles.chartToggleBtn} ${worksMode === m ? styles.chartToggleBtnActive : ""}`}
                    onClick={() => setWorksMode(m)}
                  >
                    {m.charAt(0).toUpperCase() + m.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <svg ref={worksRef} className={styles.chartSvg} />
          </div>
        </div>

        {/* Topics */}
        {author.topics.length > 0 && (
          <section className={styles.section}>
            <p className={styles.sectionEyebrow}>Research Topics</p>
            <div className={styles.topicsGrid}>
              {author.topics.slice(0, 12).map((topic) => (
                  <div key={topic.id} className={styles.topicCard}>
                    <div className={styles.topicBar} />
                    <div className={styles.topicContent}>
                      <div className={styles.topicName}>{topic.display_name}</div>
                      <div className={styles.topicMeta}>
                        <span>{topic.count} papers</span>
                        <span className={styles.topicField}>{topic.field?.display_name}</span>
                      </div>
                    </div>
                  </div>
              ))}
            </div>
          </section>
        )}

        {/* Decision CTA */}
        <section className={styles.decisionSection}>
          <p className={styles.decisionEye}>Decision</p>
          <h2 className={styles.decisionTitle}>
            Consider {author.display_name.split(" ")[0]} as your supervisor?
          </h2>
          <p className={styles.decisionBody}>
            {author.summary_stats.h_index} h-index · {author.cited_by_count.toLocaleString()} citations · {author.field_papers} field papers
          </p>
          <div className={styles.decisionButtons}>
            <button
              className={styles.ctaPrimary}
              onClick={() =>
                alert(`Added ${author.display_name} to your shortlist.`)
              }
            >
              Add to Shortlist
            </button>
            <Link href="/explore" className={styles.ctaSecondary}>
              Keep Exploring
            </Link>
          </div>
        </section>

      </div>
    </div>
  );
}

export default function AuthorPage() {
  return (
    <Suspense
      fallback={
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#f2f2ee", color: "rgba(0,0,0,0.4)", fontFamily: "system-ui" }}>
          Loading…
        </div>
      }
    >
      <AuthorContent />
    </Suspense>
  );
}
