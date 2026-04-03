"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as d3 from "d3";
import styles from "./ScatterplotView.module.css";
import { visualPalette, getTextureStrokeForVariable, getTextureStrokeColor } from "../lib/visualPalette";

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
  topics?: Array<{
    domain?: { display_name: string };
  }>;
}

interface AuthorWithOcclusionOffset extends Author {
  occlusionXOffset: number;
}

interface ScatterplotViewProps {
  maxAuthors: number;
  maxUniversities: number;
  canadianFilter: "full" | "full_partial";
  domain: string;
}

export default function ScatterplotView({
  maxAuthors,
  maxUniversities,
  canadianFilter,
  domain,
}: ScatterplotViewProps) {
  const router = useRouter();
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<d3.Selection<
    HTMLDivElement,
    unknown,
    HTMLElement,
    unknown
  > | null>(null);
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const [authors, setAuthors] = useState<Author[]>([]);
  const [useSizeEncoding, setUseSizeEncoding] = useState<boolean>(true);
  const [hasZoomed, setHasZoomed] = useState<boolean>(false);
  const [selectedInstitution, setSelectedInstitution] = useState<string | null>(
    null
  );
  const [universities, setUniversities] = useState<
    Array<{ name: string; color: string; texture: string; luminance: "dark" | "light"; totalACI: number; count: number }>
  >([]);

  useEffect(() => {
    fetch("/data/authors.json")
      .then((res) => res.json())
      .then((data: Author[]) => {
        const canadianAuthors = data.filter((author) => {
          if (canadianFilter === "full") {
            return author.last_known_institution?.country_code === "CA";
          }
          return (
            author.last_known_institution?.country_code === "CA" ||
            author.last_known_institution?.country_code !== undefined
          );
        });
        let domainFiltered = canadianAuthors;
        if (domain !== "All Domains") {
          const [level, value] = domain.split(":") as [string, string];
          domainFiltered = canadianAuthors.filter((author) =>
            (author.topics || []).some((t) => {
              if (level === "domain") return t.domain?.display_name === value;
              if (level === "field") return (t as any).field?.display_name === value;
              if (level === "subfield") return (t as any).subfield?.display_name === value;
              return false;
            })
          );
        }
        setAuthors(domainFiltered.sort((a, b) => b.aci - a.aci));
      });
  }, [canadianFilter, domain]);

  useEffect(() => {
    if (!svgRef.current || authors.length === 0) return;

    d3.select(svgRef.current).selectAll("*").remove();

    const allInstitutionMap = new Map<string, Author[]>();
    authors.forEach((author) => {
      const inst = author.last_known_institution?.label_name || author.last_known_institution?.display_name || "Unknown";
      if (!allInstitutionMap.has(inst)) {
        allInstitutionMap.set(inst, []);
      }
      allInstitutionMap.get(inst)!.push(author);
    });

    const allUniList = Array.from(allInstitutionMap.entries()).map(
      ([inst, instAuthors]) => ({
        name: inst,
        totalACI: instAuthors.reduce((sum, a) => sum + a.aci, 0),
        authors: instAuthors.sort((a, b) => b.aci - a.aci), // Sort authors by ACI within the institution
      })
    );
    console.log(allUniList)
    allUniList.sort((a, b) => b.totalACI - a.totalACI);

    const topUniversities = allUniList.slice(0, maxUniversities);
    const topUniversityNames = new Set(topUniversities.map((u) => u.name));

    const filteredAuthors = authors.filter((author) =>
      topUniversityNames.has(
        author.last_known_institution?.label_name || author.last_known_institution?.display_name || "Unknown"
      )
    );
    const displayAuthors = filteredAuthors.slice(0, maxAuthors);

    // Use custom visual palette based on Opponent Color Theory + Mackinlay's Model
    const universityNames = topUniversities.map((u) => u.name);

    // Map each university to its visual variable (color + texture)
    const universityVisuals = new Map(
      universityNames.map((name, idx) => {
        const paletteItem = visualPalette[idx % visualPalette.length];
        return [name, paletteItem];
      })
    );

    // Count how many authors from each university are actually displayed
    const displayedUniversityCounts = new Map<string, number>();
    displayAuthors.forEach((author) => {
      const inst = author.last_known_institution?.label_name || author.last_known_institution?.display_name || "Unknown";
      displayedUniversityCounts.set(inst, (displayedUniversityCounts.get(inst) || 0) + 1);
    });

    // Helper function to get fill value (solid color or pattern URL)
    const getFillForUniversity = (universityName: string): string => {
      const visual = universityVisuals.get(universityName);
      if (!visual) return "#808080"; // Fallback gray

      if (visual.texture === "none") {
        return visual.color;
      } else {
        const patternId = `pattern-${universityName.replace(/[^a-zA-Z0-9]/g, "-")}`;
        return `url(#${patternId})`;
      }
    };

    const uniList = topUniversities.map((uni) => ({
      name: uni.name,
      color: universityVisuals.get(uni.name)?.color || "#808080",
      texture: universityVisuals.get(uni.name)?.texture || "none",
      luminance: universityVisuals.get(uni.name)?.luminance || "dark",
      totalACI: uni.totalACI,
      count: displayedUniversityCounts.get(uni.name) || 0,
    }));
    setUniversities(uniList);

    const containerWidth =
      (svgRef.current.parentElement?.clientWidth || 1000) - 50;
    const containerHeight =
      (svgRef.current.parentElement?.clientHeight || 800) - 50;
    const margin = { top: 30, right: 30, bottom: 20, left: 100 };
    const width = containerWidth - margin.left - margin.right;
    const height = containerHeight - margin.top - margin.bottom;

    const svgEl = d3
      .select(svgRef.current)
      .attr("width", width + margin.left + margin.right)
      .attr("height", height + margin.top + margin.bottom);

    // Definitions: clip path and texture patterns
    const defs = svgEl.append("defs");

    // Clip path so circles don't render outside the plot area
    defs
      .append("clipPath")
      .attr("id", "scatter-clip")
      .append("rect")
      .attr("width", width)
      .attr("height", height);

    // Create texture patterns for each university that needs one
    universityVisuals.forEach((visual, universityName) => {
      if (visual.texture === "none") return;

      const patternId = `pattern-${universityName.replace(/[^a-zA-Z0-9]/g, "-")}`;
      const strokeColor = getTextureStrokeForVariable(visual);

      // Small repeating pattern that works well for circles of all sizes
      const pattern = defs
        .append("pattern")
        .attr("id", patternId)
        .attr("patternUnits", "userSpaceOnUse")
        .attr("width", 8)
        .attr("height", 8);

      // Background color
      pattern.append("rect")
        .attr("width", 8)
        .attr("height", 8)
        .attr("fill", visual.color);

      // Add lines based on texture type
      if (visual.texture === "vertical") {
        // Vertical stripes
        pattern.append("line")
          .attr("x1", 2)
          .attr("y1", 0)
          .attr("x2", 2)
          .attr("y2", 8)
          .attr("stroke", strokeColor)
          .attr("stroke-width", 2);
        pattern.append("line")
          .attr("x1", 6)
          .attr("y1", 0)
          .attr("x2", 6)
          .attr("y2", 8)
          .attr("stroke", strokeColor)
          .attr("stroke-width", 2);
      } else if (visual.texture === "horizontal") {
        // Horizontal stripes
        pattern.append("line")
          .attr("x1", 0)
          .attr("y1", 2)
          .attr("x2", 8)
          .attr("y2", 2)
          .attr("stroke", strokeColor)
          .attr("stroke-width", 2);
        pattern.append("line")
          .attr("x1", 0)
          .attr("y1", 6)
          .attr("x2", 8)
          .attr("y2", 6)
          .attr("stroke", strokeColor)
          .attr("stroke-width", 2);
      } else if (visual.texture === "diagonal") {
        // Diagonal stripes (45 degree)
        pattern.append("line")
          .attr("x1", 0)
          .attr("y1", 0)
          .attr("x2", 8)
          .attr("y2", 8)
          .attr("stroke", strokeColor)
          .attr("stroke-width", 2);
        pattern.append("line")
          .attr("x1", -2)
          .attr("y1", 6)
          .attr("x2", 2)
          .attr("y2", 10)
          .attr("stroke", strokeColor)
          .attr("stroke-width", 2);
        pattern.append("line")
          .attr("x1", 6)
          .attr("y1", -2)
          .attr("x2", 10)
          .attr("y2", 2)
          .attr("stroke", strokeColor)
          .attr("stroke-width", 2);
      } else if (visual.texture === "dots") {
        // Dot pattern - 4 dots in a grid
        pattern.append("circle")
          .attr("cx", 2)
          .attr("cy", 2)
          .attr("r", 1)
          .attr("fill", strokeColor);
        pattern.append("circle")
          .attr("cx", 6)
          .attr("cy", 2)
          .attr("r", 1)
          .attr("fill", strokeColor);
        pattern.append("circle")
          .attr("cx", 2)
          .attr("cy", 6)
          .attr("r", 1)
          .attr("fill", strokeColor);
        pattern.append("circle")
          .attr("cx", 6)
          .attr("cy", 6)
          .attr("r", 1)
          .attr("fill", strokeColor);
      }
    });

    const svg = svgEl
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const maxPapers = d3.max(displayAuthors, (d) => d.field_papers) || 10;
    const maxCitations = d3.max(displayAuthors, (d) => d.field_citations) || 100;

    const xScale = d3
      .scaleLinear()
      .domain([0, maxPapers * 1.1])
      .range([0, width])
      .nice();

    const yScale = d3
      .scaleLinear()
      .domain([0, maxCitations * 1.1])
      .range([height, 0])
      .nice();

    const sizeScale = d3
      .scaleSqrt()
      .domain([0, d3.max(displayAuthors, (d) => d.aci) || 1])
      .range([3, 15]);
    
        // Only spread points that share the exact same (papers, citations) coordinate.
    // Keep spacing extremely small so points stay near their true x value.
    const occlusionStepData = 0.015;
    const overlapGroups = d3.group(
      displayAuthors,
      (d) => `${d.field_papers}__${d.field_citations}`
    );
    const authorsWithOcclusionOffset: AuthorWithOcclusionOffset[] = [];

    overlapGroups.forEach((group) => {
      if (group.length === 1) {
        authorsWithOcclusionOffset.push({
          ...group[0],
          occlusionXOffset: 0,
        });
        return;
      }

      // Deterministic symmetric offsets: left/right around the true x-value.
      const sortedGroup = [...group].sort((a, b) =>
        a.author_id.localeCompare(b.author_id)
      );
      const centerIndex = (sortedGroup.length - 1) / 2;

      sortedGroup.forEach((author, index) => {
        authorsWithOcclusionOffset.push({
          ...author,
          occlusionXOffset: (index - centerIndex) * occlusionStepData,
        });
      });
    });

    const xAxis = d3.axisBottom(xScale);
    const yAxis = d3.axisLeft(yScale);

    const xAxisGroup = svg
      .append("g")
      .attr("class", "x-axis")
      .attr("transform", `translate(0,${height})`)
      .call(xAxis);
    xAxisGroup.selectAll("path, line").attr("stroke", "rgba(0,0,0,0.15)");
    xAxisGroup.selectAll("text").attr("fill", "rgba(0,0,0,0.4)");
    xAxisGroup
      .append("text")
      .attr("x", width / 2)
      .attr("y", 45)
      .attr("fill", "rgba(0,0,0,0.3)")
      .attr("text-anchor", "middle")
      .style("font-size", "11px")
      .style("font-weight", "500")
      .style("letter-spacing", "1px")
      .style("text-transform", "uppercase")
      .text("Publications");

    const yAxisGroup = svg.append("g").attr("class", "y-axis").call(yAxis);
    yAxisGroup.selectAll("path, line").attr("stroke", "rgba(0,0,0,0.15)");
    yAxisGroup.selectAll("text").attr("fill", "rgba(0,0,0,0.4)");
    yAxisGroup
      .append("text")
      .attr("transform", "rotate(-90)")
      .attr("x", -height / 2)
      .attr("y", -70)
      .attr("fill", "rgba(0,0,0,0.3)")
      .attr("text-anchor", "middle")
      .style("font-size", "11px")
      .style("font-weight", "500")
      .style("letter-spacing", "1px")
      .style("text-transform", "uppercase")
      .text("Citations");

    if (!tooltipRef.current) {
      tooltipRef.current = d3
        .select("body")
        .append("div")
        .style("position", "absolute")
        .style("background", "rgba(0, 0, 0, 0.8)")
        .style("color", "white")
        .style("padding", "8px")
        .style("border-radius", "4px")
        .style("font-size", "12px")
        .style("font-family", "Outfit, system-ui, sans-serif")
        .style("pointer-events", "none")
        .style("opacity", 0)
        .style("z-index", "1000");
    }
    const tooltip = tooltipRef.current;

    const circlesGroup = svg
      .append("g")
      .attr("clip-path", "url(#scatter-clip)");
    
    const getAdjustedX = (d: AuthorWithOcclusionOffset) =>
      Math.max(0, d.field_papers + d.occlusionXOffset);

    circlesGroup
      .selectAll("circle")
      .data(authorsWithOcclusionOffset)
      .enter()
      .append("circle")
      .attr("cx", (d) =>  xScale(getAdjustedX(d))) // xScale(d.field_papers))
      .attr("cy", (d) => yScale(d.field_citations))
      .attr("r", (d) => (useSizeEncoding ? sizeScale(d.aci) : 5))
      .attr("fill", (d) => {
        const institutionName = d.last_known_institution?.label_name || d.last_known_institution?.display_name || "Unknown";
        return getFillForUniversity(institutionName);
      })
      .attr("stroke", "rgba(255,255,255,0.7)")
      .attr("stroke-width", 0.8)
      .style("cursor", "pointer")
      .style("opacity", (d) => {
        if (!selectedInstitution) return 1.0;
        return d.last_known_institution?.label_name === selectedInstitution || d.last_known_institution?.display_name === selectedInstitution
          ? 1.0
          : 0.2;
      })
      .on("mouseover", function (event, d) {
        d3.select(this).attr("stroke-width", 2);
        tooltip.style("opacity", 1).html(`
            <strong>${d.display_name}</strong><br/>
            Institution: ${d.last_known_institution?.label_name || d.last_known_institution?.display_name || "Unknown"}<br/>
            Publications: ${d.field_papers}<br/>
            Citations: ${d.field_citations}<br/>
            Citation Impact: ${d.aci.toFixed(2)}<br/>
            <span style="font-size:10px;opacity:0.45;text-decoration:underline;">Click to view profile</span>
          `);
      })
      .on("mousemove", function (event) {
        tooltip
          .style("left", event.pageX + 10 + "px")
          .style("top", event.pageY - 10 + "px");
      })
      .on("mouseout", function () {
        d3.select(this).attr("stroke-width", 1);
        tooltip.style("opacity", 0);
      })
      .on("click", function (_event, d) {
        const shortId = d.author_id.replace("https://openalex.org/", "");
        const fieldParam = domain && domain !== "All Domains" ? `&field=${encodeURIComponent(domain.split(":")[1] || domain)}` : "";
        router.push(`/author?id=${shortId}${fieldParam}`);
      });

    // Zoom behaviour
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.5, 10])
      .extent([[0, 0], [width, height]])
      .on("zoom", (event) => {
        const t = event.transform;
        setHasZoomed(t.k !== 1 || t.x !== 0 || t.y !== 0);

        let newX = t.rescaleX(xScale);
        let newY = t.rescaleY(yScale);

        // Clamp to avoid negative axis values
        const [minX, maxX] = newX.domain();
        if (minX < 0) newX = newX.copy().domain([0, maxX - minX]);
        const [minY, maxY] = newY.domain();
        if (minY < 0) newY = newY.copy().domain([0, maxY - minY]);

        const xTicks = [];
        const [x0, x1] = newX.domain();
        for (let i = Math.ceil(x0); i <= Math.floor(x1); i++) xTicks.push(i);

        xAxisGroup.call(
          d3.axisBottom(newX).tickValues(xTicks).tickFormat((d) => String(Math.round(Number(d))))
        );
        yAxisGroup.call(d3.axisLeft(newY));

        xAxisGroup.selectAll("path, line").attr("stroke", "rgba(0,0,0,0.15)");
        xAxisGroup.selectAll("text").attr("fill", "rgba(0,0,0,0.4)");
        yAxisGroup.selectAll("path, line").attr("stroke", "rgba(0,0,0,0.15)");
        yAxisGroup.selectAll("text").attr("fill", "rgba(0,0,0,0.4)");

        circlesGroup
          .selectAll<SVGCircleElement, AuthorWithOcclusionOffset>("circle")
          .attr("cx", (d) => newX(getAdjustedX(d)))
          .attr("cy", (d) => newY(d.field_citations));
      });

    zoomBehaviorRef.current = zoom;
    svgEl.call(zoom);

    svg
      .append("text")
      .attr("x", width / 2)
      .attr("y", -18)
      .attr("text-anchor", "middle")
      .style("font-size", "11px")
      .style("font-weight", "500")
      .style("letter-spacing", "2px")
      .style("text-transform", "uppercase")
      .attr("fill", "rgba(0,0,0,0.2)")
      // .text("Authors");

    return () => {
      if (tooltipRef.current) {
        tooltipRef.current.remove();
        tooltipRef.current = null;
      }
    };
  }, [authors, maxAuthors, maxUniversities, useSizeEncoding, selectedInstitution, router]);

  const resetZoom = () => {
    if (svgRef.current && zoomBehaviorRef.current) {
      d3.select(svgRef.current)
        .transition()
        .duration(750)
        .call(zoomBehaviorRef.current.transform, d3.zoomIdentity);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.chartContainer}>
        <svg ref={svgRef}></svg>
      </div>
      <div className={styles.sidebar}>
        <h3>Chart Controls</h3>
        <div className={styles.controls}>
          <label className={styles.switchLabel}>
            <input
              type="checkbox"
              checked={useSizeEncoding}
              onChange={(e) => setUseSizeEncoding(e.target.checked)}
            />
            <span>Use Citation Impact for bubble size</span>
          </label>
          {hasZoomed && (
            <button onClick={resetZoom} className={styles.resetButton}>
              Reset Zoom
            </button>
          )}
        </div>
        <h3>Universities</h3>
        <div className={styles.universityList}>
          {universities.map((uni) => (
            <div
              key={uni.name}
              className={`${styles.universityItem} ${
                selectedInstitution === uni.name ? styles.selected : ""
              }`}
              onClick={() =>
                setSelectedInstitution(
                  selectedInstitution === uni.name ? null : uni.name
                )
              }
            >
              {uni.texture === "none" ? (
                <div
                  className={styles.colorBox}
                  style={{ backgroundColor: uni.color }}
                />
              ) : (
                <svg className={styles.colorBox} viewBox="0 0 90 90">
  <defs>
    <pattern
      id={`sidebar-pattern-${uni.name.replace(/[^a-zA-Z0-9]/g, "-")}`}
      patternUnits="userSpaceOnUse"
      width="90"
      height="90"
    >
      {/* Background fill */}
      <rect width="90" height="90" fill={uni.color} />

      {/* Vertical: Three thick stripes (space-between: 15-10-15-10-15-10-15) */}
      {uni.texture === "vertical" && (
        <>
          <line x1="20" y1="0" x2="20" y2="90"
                stroke={getTextureStrokeColor(uni.luminance)} strokeWidth="10" />
          <line x1="45" y1="0" x2="45" y2="90"
                stroke={getTextureStrokeColor(uni.luminance)} strokeWidth="10" />
          <line x1="70" y1="0" x2="70" y2="90"
                stroke={getTextureStrokeColor(uni.luminance)} strokeWidth="10" />
        </>
      )}

      {/* Horizontal: Three thick stripes (space-between: 15-10-15-10-15-10-15) */}
      {uni.texture === "horizontal" && (
        <>
          <line x1="0" y1="20" x2="90" y2="20"
                stroke={getTextureStrokeColor(uni.luminance)} strokeWidth="10" />
          <line x1="0" y1="45" x2="90" y2="45"
                stroke={getTextureStrokeColor(uni.luminance)} strokeWidth="10" />
          <line x1="0" y1="70" x2="90" y2="70"
                stroke={getTextureStrokeColor(uni.luminance)} strokeWidth="10" />
        </>
      )}

      {/* Diagonal: Three thick stripes */}
      {uni.texture === "diagonal" && (
        <>
          {/* First diagonal stripe */}
          <line x1="50" y1="0" x2="90" y2="40"
                              stroke={getTextureStrokeColor(uni.luminance)} strokeWidth="10" />
          {/* Second diagonal stripe from 0,0 to 90,90 */}
          <line x1="0" y1="0" x2="90" y2="90"
                stroke={getTextureStrokeColor(uni.luminance)} strokeWidth="10" />
          {/* Third diagonal stripe */}
          <line x1="0" y1="50" x2="40" y2="90"
                stroke={getTextureStrokeColor(uni.luminance)} strokeWidth="10" />

        </>
      )}

      {/* Dots: Grid of dots */}
      {uni.texture === "dots" && (
        <>
          {/* Row 1 */}
          <circle cx="15" cy="15" r="7"
                  fill={getTextureStrokeColor(uni.luminance)} />
          <circle cx="45" cy="15" r="7"
                  fill={getTextureStrokeColor(uni.luminance)} />
          <circle cx="75" cy="15" r="7"
                  fill={getTextureStrokeColor(uni.luminance)} />
          {/* Row 2 */}
          <circle cx="15" cy="45" r="7"
                  fill={getTextureStrokeColor(uni.luminance)} />
          <circle cx="45" cy="45" r="7"
                  fill={getTextureStrokeColor(uni.luminance)} />
          <circle cx="75" cy="45" r="7"
                  fill={getTextureStrokeColor(uni.luminance)} />
          {/* Row 3 */}
          <circle cx="15" cy="75" r="7"
                  fill={getTextureStrokeColor(uni.luminance)} />
          <circle cx="45" cy="75" r="7"
                  fill={getTextureStrokeColor(uni.luminance)} />
          <circle cx="75" cy="75" r="7"
                  fill={getTextureStrokeColor(uni.luminance)} />
        </>
      )}
    </pattern>
  </defs>
  <rect
    width="90"
    height="90"
    fill={`url(#sidebar-pattern-${uni.name.replace(/[^a-zA-Z0-9]/g, "-")})`}
  />
</svg>
              )}
              <span className={styles.universityName}>
                {uni.name} {uni.count > 0 ? `(${uni.count})` : ''}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
