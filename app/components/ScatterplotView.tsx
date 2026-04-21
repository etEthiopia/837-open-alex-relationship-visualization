"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as d3 from "d3";
import styles from "./ScatterplotView.module.css";
import { visualPalette, getTextureStrokeColor } from "../lib/visualPalette";
import {
  Institution,
  createTooltip,
  createTexturePatterns,
  getFillForUniversity,
  createUniversityVisualMapping,
} from "./shared";

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
  authors: Author[];
  institutions: Institution[];
  maxAuthors: number;
  universityColorMap: Map<string, typeof visualPalette[0]>;
  dataPath: string;
}

export default function ScatterplotView({
  authors,
  institutions,
  maxAuthors,
  universityColorMap,
  dataPath,
}: ScatterplotViewProps) {
  const router = useRouter();
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<d3.Selection<
    HTMLDivElement,
    unknown,
    HTMLElement,
    unknown
  > | null>(null);
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<
    SVGSVGElement,
    unknown
  > | null>(null);
  const [useSizeEncoding, setUseSizeEncoding] = useState<boolean>(true);
  const [hasZoomed, setHasZoomed] = useState<boolean>(false);
  const [selectedInstitution, setSelectedInstitution] = useState<string | null>(
    null,
  );
  const [universities, setUniversities] = useState<
    Array<{
      name: string;
      color: string;
      texture: string;
      luminance: "dark" | "light";
      totalACI: number;
      count: number;
    }>
  >([]);

  useEffect(() => {
    if (!svgRef.current || authors.length === 0 || institutions.length === 0) return;

    d3.select(svgRef.current).selectAll("*").remove();

    // Build map of institution names to their authors
    const institutionMap = new Map<string, Author[]>();
    authors.forEach((author) => {
      const instName =
        author.last_known_institution?.label_name ||
        author.last_known_institution?.display_name ||
        "Unknown";
      if (!institutionMap.has(instName)) {
        institutionMap.set(instName, []);
      }
      institutionMap.get(instName)!.push(author);
    });

    // Use institutions list (already sorted by ICI from parent)
    // Map to include author information
    const topUniversities = institutions.map((inst) => {
      const instName = inst.label_name || inst.name;
      const instAuthors = institutionMap.get(instName) || institutionMap.get(inst.name) || [];
      return {
        name: instName,
        fullName: inst.name,
        label_name: inst.label_name,
        totalACI: instAuthors.reduce((sum, a) => sum + a.aci, 0),
        ICI: inst.ICI,
        authors: instAuthors.sort((a, b) => b.aci - a.aci),
      };
    }).filter(uni => uni.authors.length > 0); // Only keep universities with authors

    const topUniversityNames = new Set(topUniversities.map((u) => u.name));

    // Filter authors to only those from top universities
    const filteredAuthors = authors.filter((author) =>
      topUniversityNames.has(
        author.last_known_institution?.label_name ||
          author.last_known_institution?.display_name ||
          "Unknown",
      ),
    );
    const displayAuthors = filteredAuthors.slice(0, maxAuthors);

    console.log(universityColorMap);

    // Use persistent color mapping based on totalACI ranking
    const universityVisuals = createUniversityVisualMapping(
      topUniversities.map(uni => ({
        name: uni.name,
        fullName: uni.fullName,
        label_name: uni.label_name,
      })),
      universityColorMap
    );

    // Count how many authors from each university are actually displayed
    const displayedUniversityCounts = new Map<string, number>();
    displayAuthors.forEach((author) => {
      const inst =
        author.last_known_institution?.label_name ||
        author.last_known_institution?.display_name ||
        "Unknown";
      displayedUniversityCounts.set(
        inst,
        (displayedUniversityCounts.get(inst) || 0) + 1,
      );
    });

    // Helper function to get fill value (solid color or pattern URL) - using shared utility
    const getUniversityFill = (universityName: string): string =>
      getFillForUniversity(universityName, universityVisuals);

    const uniList = topUniversities.map((uni) => ({
      name: uni.name,
      color: universityVisuals.get(uni.name)?.color || "#808080",
      texture: universityVisuals.get(uni.name)?.texture || "none",
      luminance: universityVisuals.get(uni.name)?.luminance || "dark",
      totalACI: uni.totalACI,
      count: displayedUniversityCounts.get(uni.name) || 0,
    }));
    setUniversities(uniList);

    // Get parent dimensions
    const parentWidth = svgRef.current.parentElement?.clientWidth || 1000;
    const parentHeight = svgRef.current.parentElement?.clientHeight || 800;

    // SVG dimensions with gaps from parent
    const svgWidth = parentWidth - 50; // 50px total gap from parent width
    const svgHeight = parentHeight - 20; // 20px total gap from parent height

    // Internal margins for axis labels and preventing cutoff
    const margin = { top: 20, right: 40, bottom: 60, left: 100 };

    // Plot area dimensions
    const width = svgWidth - margin.left - margin.right;
    const height = svgHeight - margin.top - margin.bottom;

    const svgEl = d3
      .select(svgRef.current)
      .attr("width", svgWidth)
      .attr("height", svgHeight);

    // Definitions: clip path and texture patterns
    const defs = svgEl.append("defs");

    // Clip path so circles don't render outside the plot area
    defs
      .append("clipPath")
      .attr("id", "scatter-clip")
      .append("rect")
      .attr("width", width)
      .attr("height", height);

    // Create texture patterns using shared utility
    createTexturePatterns(defs, universityVisuals);

    const svg = svgEl
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const maxPapers = d3.max(displayAuthors, (d) => d.field_papers) || 10;
    const maxCitations =
      d3.max(displayAuthors, (d) => d.field_citations) || 100;

    // Calculate axis origins based on actual data
    const minPapers = d3.min(displayAuthors, (d) => d.field_papers) || 0;
    const minCitations = d3.min(displayAuthors, (d) => d.field_citations) || 0;

    const xMin = Math.max(0, minPapers - 1);

    // For Y-axis, calculate a nice round number below minCitations
    let yMin = 0;
    if (minCitations > 0) {
      const magnitude = Math.pow(10, Math.floor(Math.log10(minCitations)));
      let niceStep: number;
      const normalized = minCitations / magnitude;

      if (normalized <= 1) niceStep = magnitude;
      else if (normalized <= 2) niceStep = magnitude;
      else if (normalized <= 5) niceStep = 2 * magnitude;
      else niceStep = 5 * magnitude;

      yMin = Math.max(0, Math.floor(minCitations / niceStep) * niceStep - niceStep);
    }

    const xScale = d3
      .scaleLinear()
      .domain([xMin, maxPapers + 1])
      .range([0, width])
      .nice();

    // Detect outliers using P95
    const citations = displayAuthors.map((d) => d.field_citations);
    const sortedCitations = [...citations].sort(d3.ascending);
    const p95 = d3.quantile(sortedCitations, 0.95) || 10;
    const hasOutliers = maxCitations > p95 * 2.5;

    // Helper to generate nice tick values with consistent step size
    const generateNiceTicks = (min: number, max: number, targetCount: number = 8): number[] => {
      const range = max - min;
      const roughStep = range / (targetCount - 1);

      // Find a nice step size (1, 2, 5, 10, 20, 50, 100, etc.)
      const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
      const normalized = roughStep / magnitude;
      let niceStep: number;

      if (normalized <= 1) niceStep = magnitude;
      else if (normalized <= 2) niceStep = 2 * magnitude;
      else if (normalized <= 5) niceStep = 5 * magnitude;
      else niceStep = 10 * magnitude;

      const start = Math.ceil(min / niceStep) * niceStep;
      const end = Math.floor(max / niceStep) * niceStep;

      const ticks: number[] = [];
      for (let tick = start; tick <= end; tick += niceStep) {
        ticks.push(tick);
      }

      // Ensure we include min if it's not already there
      if (!ticks.includes(min)) {
        ticks.unshift(min);
      }

      return ticks;
    };

    // Create scale with axis break if outliers exist
    let yScale: d3.ScaleLinear<number, number>;
    let breakThreshold: number | null = null;
    let yTickValues: number[] = [];

    if (hasOutliers) {
      const break_at = p95 * 1.3;
      breakThreshold = break_at;
      const upperMax = maxCitations + 50;

      // Generate nice ticks for bottom segment (where 95% of data lives)
      const bottomTicks = generateNiceTicks(yMin, break_at, 8);

      // Calculate the step size from bottom ticks (used for spacing calculations)
      const bottomStep = bottomTicks.length > 1 ? bottomTicks[1] - bottomTicks[0] : 20;

      // Generate ticks for the outlier region independently based on the actual outlier range
      // This allows different step sizes appropriate for the outlier data
      // Start from break_at so we get nice round numbers above the break
      const topTicksRaw = generateNiceTicks(break_at, upperMax, 4);

      // Filter to only include ticks above the break threshold
      const topTicks = topTicksRaw.filter(t => t > break_at);

      // Use the first top tick as the starting point for the top segment
      const firstTopTick = topTicks[0];

      yTickValues = [...bottomTicks, ...topTicks];

      // Allocate 70% of height to bottom segment, 30% to top segment
      const bottomPixels = height * 0.7;

      // Calculate tick spacing for bottom segment
      const bottomDataRange = break_at - yMin; // yMin to break_at
      const numBottomIntervals = bottomDataRange / bottomStep;
      const bottomTickSpacing = bottomPixels / numBottomIntervals;

      // Use the bottom tick spacing for the break gap to maintain consistency
      const breakPixel = height - bottomPixels;
      const topStartPixel = breakPixel - bottomTickSpacing; // One tick spacing down from break

      // Create 4-point piecewise linear scale
      // [yMin, break_at] -> [height, breakPixel]: bottom segment
      // [break_at, firstTopTick] -> [breakPixel, topStartPixel]: the data jump with visual gap
      // [firstTopTick, upperMax] -> [topStartPixel, 0]: top segment
      yScale = d3
        .scaleLinear()
        .domain([yMin, break_at, firstTopTick, upperMax])
        .range([height, breakPixel, topStartPixel, 0]);
    } else {
      yScale = d3
        .scaleLinear()
        .domain([yMin, maxCitations * 1.1])
        .range([height, 0])
        .nice();

      // Use nice tick generation for normal case
      yTickValues = generateNiceTicks(yMin, maxCitations*1.1, 8);
    }

    const sizeScale = d3
      .scaleSqrt()
      .domain([0, d3.max(displayAuthors, (d) => d.aci) || 1])
      .range([5, 20]);

    // Only spread points that share the exact same (papers, citations) coordinate.
    // Keep spacing extremely small so points stay near their true x value.
    // Use adaptive step size: smaller steps for larger groups to prevent excessive deviation.
    const maxOcclusionOffset = 0.15; // Maximum total deviation from true x-value
    const overlapGroups = d3.group(
      displayAuthors,
      (d) => `${d.field_papers}__${d.field_citations}`,
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
        a.author_id.localeCompare(b.author_id),
      );
      const centerIndex = (sortedGroup.length - 1) / 2;

      // Adaptive step: ensure total spread doesn't exceed maxOcclusionOffset
      const totalSpan = (sortedGroup.length - 1);
      const occlusionStepData = totalSpan > 0
        ? Math.min(0.015, maxOcclusionOffset / totalSpan)
        : 0.015;

      sortedGroup.forEach((author, index) => {
        authorsWithOcclusionOffset.push({
          ...author,
          occlusionXOffset: (index - centerIndex) * occlusionStepData,
        });
      });
    });

    // Generate x-axis tick values as integers only
    const xDomain = xScale.domain();
    const xTickMin = Math.ceil(xDomain[0]);
    const xTickMax = Math.floor(xDomain[1]);
    const xTickValues: number[] = [];
    for (let i = xTickMin; i <= xTickMax; i++) {
      xTickValues.push(i);
    }

    const xAxis = d3.axisBottom(xScale)
      .tickValues(xTickValues)
      .tickFormat((d) => d3.format("d")(Number(d)));
    const yAxis = d3.axisLeft(yScale).tickValues(yTickValues);

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

    // Add visual break indicator if outliers exist
    if (hasOutliers && breakThreshold !== null) {
      const breakY = yScale(breakThreshold);
      const breakGroup = svg
        .append("g")
        .attr("class", "axis-break")
        .attr("transform", `translate(0, ${breakY})`);

      // Draw two horizontal lines with a gap to indicate axis break
      const gapSize = 4;

      // Top line (above the break)
      breakGroup
        .append("line")
        .attr("x1", -10)
        .attr("x2", 10)
        .attr("y1", - (2 * gapSize))
        .attr("y2", 0)
        .attr("stroke", "rgba(0,0,0,0.4)")
        .attr("stroke-width", 2);

      // Bottom line (below the break)
      breakGroup
        .append("line")
        .attr("x1", -10)
        .attr("x2", 10)
        .attr("y1", 0)
        .attr("y2", 2 * gapSize )
        .attr("stroke", "rgba(0,0,0,0.4)")
        .attr("stroke-width", 2);

      // Draw horizontal line across the plot area to show the break
      breakGroup
        .append("line")
        .attr("x1", 0)
        .attr("x2", width)
        .attr("y1", 0)
        .attr("y2", 0)
        .attr("stroke", "rgba(0,0,0,0.1)")
        .attr("stroke-width", 1)
        .attr("stroke-dasharray", "4,4");
    }

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

    // Add zigzag indicator if x-axis doesn't start at 0
    if (xMin > 0) {
      const xZigzagGroup = svg
        .append("g")
        .attr("class", "x-axis-break-indicator")
        .attr("transform", `translate(10, ${height - 5})`); // 10px from left, 5px above x-axis

      // Draw M-shaped zigzag pattern /\/\
      const zigzagPath = "M -5,8 L 0,0 L 5,8 L 10,0 L 15,8";
      xZigzagGroup
        .append("path")
        .attr("d", zigzagPath)
        .attr("stroke", "rgba(0,0,0,0.4)")
        .attr("stroke-width", 1.5)
        .attr("fill", "none");
    }

    // Add zigzag indicator if y-axis doesn't start at 0
    if (yMin > 0) {
      const yZigzagGroup = svg
        .append("g")
        .attr("class", "y-axis-break-indicator")
        .attr("transform", `translate(5, ${height - 20})`); // 5px left of y-axis, 10px above bottom

      // Draw rotated zigzag pattern (W shape rotated 90 degrees)
      const zigzagPath = "M -8,-5 L 0,0 L -8,5 L 0,10 L -8,15";
      yZigzagGroup
        .append("path")
        .attr("d", zigzagPath)
        .attr("stroke", "rgba(0,0,0,0.4)")
        .attr("stroke-width", 1.5)
        .attr("fill", "none");
    }

    if (!tooltipRef.current) {
      tooltipRef.current = createTooltip("scatter-tooltip")
        .style("font-family", "Outfit, system-ui, sans-serif");
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
      .attr("cx", (d) => xScale(getAdjustedX(d))) // xScale(d.field_papers))
      .attr("cy", (d) => yScale(d.field_citations))
      .attr("r", (d) => (useSizeEncoding ? sizeScale(d.aci) : 8))
      .attr("fill", (d) => {
        const institutionName =
          d.last_known_institution?.label_name ||
          d.last_known_institution?.display_name ||
          "Unknown";
        return getUniversityFill(institutionName);
      })
      .attr("stroke", "rgba(255,255,255,0.7)")
      .attr("stroke-width", 0.8)
      .style("cursor", "pointer")
      .style("opacity", (d) => {
        if (!selectedInstitution) return 1.0;
        return d.last_known_institution?.label_name === selectedInstitution ||
          d.last_known_institution?.display_name === selectedInstitution
          ? 1.0
          : 0.2;
      })
      .on("mouseover", function (event, d) {
        d3.select(this).attr("stroke-width", 2);
        tooltip.style("opacity", 1).html(`
            <strong>${d.display_name}</strong><br/>
            ${d.last_known_institution?.label_name || d.last_known_institution?.display_name || "Unknown Institution"}<br/>
            Publications: ${d.field_papers}<br/>
            Citations: ${d.field_citations}<br/>
            Citation Impact: ${d.aci.toFixed(2)}<br/>
            <span style="font-size:12px;opacity:0.45;">Click to view profile</span>
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
        router.push(`/author?id=${shortId}&dataPath=${encodeURIComponent(dataPath)}`);
      });

    // Create a simple linear scale for zooming (used when outliers exist and user zooms)
    const yScaleLinear = d3
      .scaleLinear()
      .domain([yMin, maxCitations * 1.1])
      .range([height, 0])
      .nice();

    // Zoom behaviour
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.5, 10])
      .extent([
        [0, 0],
        [width, height],
      ])
      .on("zoom", (event) => {
        const t = event.transform;
        const isZoomed = t.k !== 1 || t.x !== 0 || t.y !== 0;
        setHasZoomed(isZoomed);

        let newX = t.rescaleX(xScale);
        let newY: d3.ScaleLinear<number, number>;
        let newYTicks: number[] = [];

        // If zooming and outliers exist, switch to linear scale (remove break)
        if (hasOutliers && breakThreshold !== null && isZoomed) {
          // Use linear scale when zooming
          newY = t.rescaleY(yScaleLinear);
          const [minY, maxY] = newY.domain();
          const clampedMinY = Math.max(yMin, minY);
          if (minY < yMin) {
            newY = newY.copy().domain([clampedMinY, maxY - (minY - yMin)]);
          }
          newYTicks = generateNiceTicks(clampedMinY, newY.domain()[1], 8);

          // Hide the break indicator when zoomed
          svg.select(".axis-break").style("opacity", 0);
        } else if (hasOutliers && breakThreshold !== null && !isZoomed) {
          // Not zoomed, use piecewise scale with break
          newY = yScale;
          newYTicks = yTickValues;

          // Show the break indicator
          svg.select(".axis-break").style("opacity", 1);
        } else {
          // No outliers, normal zoom behavior
          newY = t.rescaleY(yScale);
          const [minY, maxY] = newY.domain();
          const clampedMinY = Math.max(yMin, minY);
          if (minY < yMin) {
            newY = newY.copy().domain([clampedMinY, maxY - (minY - yMin)]);
          }
          newYTicks = generateNiceTicks(clampedMinY, newY.domain()[1], 8);
        }

        // Clamp X to avoid going below xMin
        const [minX, maxX] = newX.domain();
        if (minX < xMin) newX = newX.copy().domain([xMin, maxX - (minX - xMin)]);

        // Generate X ticks starting from the domain minimum
        const xTicks = [];
        const [x0, x1] = newX.domain();
        const startX = Math.max(xMin, Math.ceil(x0));
        for (let i = startX; i <= Math.floor(x1); i++) xTicks.push(i);

        xAxisGroup.call(
          d3
            .axisBottom(newX)
            .tickValues(xTicks)
            .tickFormat((d) => d3.format("d")(Number(d))),
        );
        yAxisGroup.call(d3.axisLeft(newY).tickValues(newYTicks));

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
      .attr("fill", "rgba(0,0,0,0.2)");
    // .text("Authors");

    return () => {
      if (tooltipRef.current) {
        tooltipRef.current.remove();
        tooltipRef.current = null;
      }
    };
  }, [
    authors,
    institutions,
    maxAuthors,
    useSizeEncoding,
    selectedInstitution,
    router,
    universityColorMap,
  ]);

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
            <span>Use Citation Impact for<br/> data point size</span>
          </label>
          {hasZoomed && (
            <button onClick={resetZoom} className={styles.resetButton}>
              Reset Zoom
            </button>
          )}
        </div>
        <h3>Institutions</h3>
        <div className={styles.universityList}>
          {universities.map((uni) => (
            <div
              key={uni.name}
              className={`${styles.universityItem} ${
                selectedInstitution === uni.name ? styles.selected : ""
              } ${uni.count === 0 ? styles.disabled : ""}`}
              onClick={() =>
                uni.count > 0 &&
                setSelectedInstitution(
                  selectedInstitution === uni.name ? null : uni.name,
                )
              }
              title={uni.count === 0 ? "Increase number of Authors to see authors of this institution" : ""}
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
                          <line
                            x1="20"
                            y1="0"
                            x2="20"
                            y2="90"
                            stroke={getTextureStrokeColor(uni.luminance)}
                            strokeWidth="10"
                          />
                          <line
                            x1="45"
                            y1="0"
                            x2="45"
                            y2="90"
                            stroke={getTextureStrokeColor(uni.luminance)}
                            strokeWidth="10"
                          />
                          <line
                            x1="70"
                            y1="0"
                            x2="70"
                            y2="90"
                            stroke={getTextureStrokeColor(uni.luminance)}
                            strokeWidth="10"
                          />
                        </>
                      )}

                      {/* Horizontal: Three thick stripes (space-between: 15-10-15-10-15-10-15) */}
                      {uni.texture === "horizontal" && (
                        <>
                          <line
                            x1="0"
                            y1="20"
                            x2="90"
                            y2="20"
                            stroke={getTextureStrokeColor(uni.luminance)}
                            strokeWidth="10"
                          />
                          <line
                            x1="0"
                            y1="45"
                            x2="90"
                            y2="45"
                            stroke={getTextureStrokeColor(uni.luminance)}
                            strokeWidth="10"
                          />
                          <line
                            x1="0"
                            y1="70"
                            x2="90"
                            y2="70"
                            stroke={getTextureStrokeColor(uni.luminance)}
                            strokeWidth="10"
                          />
                        </>
                      )}

                      {/* Diagonal: Three thick stripes */}
                      {uni.texture === "diagonal" && (
                        <>
                          {/* First diagonal stripe */}
                          <line
                            x1="50"
                            y1="0"
                            x2="90"
                            y2="40"
                            stroke={getTextureStrokeColor(uni.luminance)}
                            strokeWidth="10"
                          />
                          {/* Second diagonal stripe from 0,0 to 90,90 */}
                          <line
                            x1="0"
                            y1="0"
                            x2="90"
                            y2="90"
                            stroke={getTextureStrokeColor(uni.luminance)}
                            strokeWidth="10"
                          />
                          {/* Third diagonal stripe */}
                          <line
                            x1="0"
                            y1="50"
                            x2="40"
                            y2="90"
                            stroke={getTextureStrokeColor(uni.luminance)}
                            strokeWidth="10"
                          />
                        </>
                      )}

                      {/* Dots: Grid of dots */}
                      {uni.texture === "dots" && (
                        <>
                          {/* Row 1 */}
                          <circle
                            cx="15"
                            cy="15"
                            r="7"
                            fill={getTextureStrokeColor(uni.luminance)}
                          />
                          <circle
                            cx="45"
                            cy="15"
                            r="7"
                            fill={getTextureStrokeColor(uni.luminance)}
                          />
                          <circle
                            cx="75"
                            cy="15"
                            r="7"
                            fill={getTextureStrokeColor(uni.luminance)}
                          />
                          {/* Row 2 */}
                          <circle
                            cx="15"
                            cy="45"
                            r="7"
                            fill={getTextureStrokeColor(uni.luminance)}
                          />
                          <circle
                            cx="45"
                            cy="45"
                            r="7"
                            fill={getTextureStrokeColor(uni.luminance)}
                          />
                          <circle
                            cx="75"
                            cy="45"
                            r="7"
                            fill={getTextureStrokeColor(uni.luminance)}
                          />
                          {/* Row 3 */}
                          <circle
                            cx="15"
                            cy="75"
                            r="7"
                            fill={getTextureStrokeColor(uni.luminance)}
                          />
                          <circle
                            cx="45"
                            cy="75"
                            r="7"
                            fill={getTextureStrokeColor(uni.luminance)}
                          />
                          <circle
                            cx="75"
                            cy="75"
                            r="7"
                            fill={getTextureStrokeColor(uni.luminance)}
                          />
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
                {uni.name} {uni.count > 0 ? `(${uni.count})` : ""}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
