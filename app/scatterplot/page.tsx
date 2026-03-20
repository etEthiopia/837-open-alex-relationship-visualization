"use client";

import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import styles from "./scatterplot.module.css";

interface Author {
  author_id: string;
  display_name: string;
  field_papers: number;
  field_citations: number;
  aci: number;
  last_known_institution: {
    id: string;
    display_name: string;
    country_code: string;
  } | null;
}

export default function ScatterplotPage() {
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<d3.Selection<
    HTMLDivElement,
    unknown,
    HTMLElement,
    unknown
  > | null>(null);
  const [authors, setAuthors] = useState<Author[]>([]);
  const [maxAuthors, setMaxAuthors] = useState<number>(100);
  const [maxUniversities, setMaxUniversities] = useState<number>(50);
  const [useSizeEncoding, setUseSizeEncoding] = useState<boolean>(true);
  const [selectedInstitution, setSelectedInstitution] = useState<string | null>(
    null,
  );
  const [universities, setUniversities] = useState<
    Array<{ name: string; color: string; totalACI: number }>
  >([]);

  // Load data
  useEffect(() => {
    fetch("/data/authors.json")
      .then((res) => res.json())
      .then((data: Author[]) => {
        // Filter for Canadian authors only
        console.log(data.length);
        const canadianAuthors = data.filter(
          (author) => author.last_known_institution?.country_code === "CA",
        );
        setAuthors(canadianAuthors);
      });
  }, []);

  // Create visualization
  useEffect(() => {
    if (!svgRef.current || authors.length === 0) return;

    // Clear previous content
    d3.select(svgRef.current).selectAll("*").remove();

    // First, group ALL authors by institution to calculate total ACI per institution
    const allInstitutionMap = new Map<string, Author[]>();
    authors.forEach((author) => {
      const inst = author.last_known_institution?.display_name || "Unknown";
      if (!allInstitutionMap.has(inst)) {
        allInstitutionMap.set(inst, []);
      }
      allInstitutionMap.get(inst)!.push(author);
    });

    // Calculate total ACI per institution and sort
    const allUniList = Array.from(allInstitutionMap.entries()).map(
      ([inst, instAuthors]) => {
        const totalACI = instAuthors.reduce(
          (sum, author) => sum + author.aci,
          0,
        );
        return {
          name: inst,
          totalACI: totalACI,
          authors: instAuthors,
        };
      },
    );

    // Sort by total ACI descending
    allUniList.sort((a, b) => b.totalACI - a.totalACI);

    // Take only top N universities based on maxUniversities slider
    const topUniversities = allUniList.slice(0, maxUniversities);
    const topUniversityNames = new Set(topUniversities.map((u) => u.name));

    // Filter authors to only include those from top universities
    const filteredAuthors = authors.filter((author) =>
      topUniversityNames.has(
        author.last_known_institution?.display_name || "Unknown",
      ),
    );

    // Then limit to maxAuthors from the filtered set
    const displayAuthors = filteredAuthors.slice(0, maxAuthors);

    // Group displayed authors by institution
    const institutionMap = new Map<string, Author[]>();
    displayAuthors.forEach((author) => {
      const inst = author.last_known_institution?.display_name || "Unknown";
      if (!institutionMap.has(inst)) {
        institutionMap.set(inst, []);
      }
      institutionMap.get(inst)!.push(author);
    });

    // Use perceptually distinct categorical colors (Bertin & Mackinlay principle)
    // D3's schemeTableau10 provides good categorical distinction
    const colorScale = d3
      .scaleOrdinal<string>()
      .domain(Array.from(allInstitutionMap.keys()))
      .range(d3.schemeTableau10);

    // Create university list with colors for sidebar
    const uniList = topUniversities.map((uni) => ({
      name: uni.name,
      color: colorScale(uni.name),
      totalACI: uni.totalACI,
    }));

    setUniversities(uniList);

    // Dimensions - use full available space
    const containerWidth =
      (svgRef.current.parentElement?.clientWidth || 1000) - 50;
    const containerHeight =
      (svgRef.current.parentElement?.clientHeight || 800) - 50;
    const margin = { top: 80, right: 100, bottom: 160, left: 200 };
    const width = containerWidth - margin.left - margin.right;
    const height = containerHeight - margin.top - margin.bottom;

    const svg = d3
      .select(svgRef.current)
      .attr("width", width + margin.left + margin.right)
      .attr("height", height + margin.top + margin.bottom)
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Scales
    const xScale = d3
      .scaleLinear()
      .domain([0, d3.max(displayAuthors, (d) => d.field_papers) || 10])
      .range([0, width])
      .nice();

    const yScale = d3
      .scaleLinear()
      .domain([0, d3.max(displayAuthors, (d) => d.field_citations) || 100])
      .range([height, 0])
      .nice();

    // Size scale for ACI
    const sizeScale = d3
      .scaleSqrt()
      .domain([0, d3.max(displayAuthors, (d) => d.aci) || 1])
      .range([3, 15]);

    // Axes
    const xAxis = d3.axisBottom(xScale);
    const yAxis = d3.axisLeft(yScale);

    const xAxisGroup = svg
      .append("g")
      .attr("transform", `translate(0,${height})`)
      .call(xAxis);

    // Color the x-axis line, ticks, and numbers
    xAxisGroup.selectAll("path, line").attr("stroke", "#333");
    xAxisGroup.selectAll("text").attr("fill", "#333");

    xAxisGroup
      .append("text")
      .attr("x", width / 2)
      .attr("y", 45)
      .attr("fill", "#333") // You already had this for the label
      .attr("text-anchor", "middle")
      .style("font-size", "16px")
      .style("font-weight", "600")
      .text("Publications (field_papers)");

    // 2. Update Y Axis
    const yAxisGroup = svg.append("g").call(yAxis);

    // Color the y-axis line, ticks, and numbers
    yAxisGroup.selectAll("path, line").attr("stroke", "#333");
    yAxisGroup.selectAll("text").attr("fill", "#333");

    yAxisGroup
      .append("text")
      .attr("transform", "rotate(-90)")
      .attr("x", -height / 2)
      .attr("y", -70)
      .attr("fill", "#333") // You already had this for the label
      .attr("text-anchor", "middle")
      .style("font-size", "16px")
      .style("font-weight", "600")
      .text("Citations (field_citations)");

    // Tooltip
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
        .style("pointer-events", "none")
        .style("opacity", 0)
        .style("z-index", 1000);
    }
    const tooltip = tooltipRef.current;

    // Draw circles
    svg
      .selectAll("circle")
      .data(displayAuthors)
      .enter()
      .append("circle")
      .attr("cx", (d) => xScale(d.field_papers))
      .attr("cy", (d) => yScale(d.field_citations))
      .attr("r", (d) => (useSizeEncoding ? sizeScale(d.aci) : 5))
      .attr("fill", (d) =>
        colorScale(d.last_known_institution?.display_name || "Unknown"),
      )
      .attr("stroke", "#fff")
      .attr("stroke-width", 1)
      .style("opacity", (d) => {
        if (!selectedInstitution) return 1.0;
        return d.last_known_institution?.display_name === selectedInstitution
          ? 1.0
          : 0.2;
      })
      .on("mouseover", function (event, d) {
        d3.select(this).attr("stroke-width", 2);
        tooltip.style("opacity", 1).html(`
            <strong>${d.display_name}</strong><br/>
            Institution: ${d.last_known_institution?.display_name || "Unknown"}<br/>
            Publications: ${d.field_papers}<br/>
            Citations: ${d.field_citations}<br/>
            ACI: ${d.aci.toFixed(2)}
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
      });

    // Title
    svg
      .append("text")
      .attr("x", width / 2)
      .attr("y", -10)
      .attr("text-anchor", "middle")
      .style("font-size", "18px")
      .style("font-weight", "bold")
      .text("Canadian Authors: Publications vs Citations");

    // Cleanup
    return () => {
      if (tooltipRef.current) {
        tooltipRef.current.remove();
        tooltipRef.current = null;
      }
    };
  }, [
    authors,
    maxAuthors,
    maxUniversities,
    useSizeEncoding,
    selectedInstitution,
  ]);

  return (
    <div className={styles.container}>
      <div className={styles.chartContainer}>
        <svg ref={svgRef}></svg>
      </div>
      <div className={styles.sidebar}>
        <h2>Controls</h2>
        <div className={styles.controls}>
          <div className={styles.controlGroup}>
            <label htmlFor="maxAuthors">Max Authors: {maxAuthors}</label>
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
          <div className={styles.controlGroup}>
            <label htmlFor="maxUniversities">
              Max Universities: {maxUniversities}
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
          <div className={styles.controlGroup}>
            <label className={styles.switchLabel}>
              <input
                type="checkbox"
                checked={useSizeEncoding}
                onChange={(e) => setUseSizeEncoding(e.target.checked)}
              />
              <span>Use ACI for size</span>
            </label>
          </div>
        </div>
        <h2>Universities</h2>
        <div className={styles.universityList}>
          {universities.map((uni) => (
            <div
              key={uni.name}
              className={`${styles.universityItem} ${
                selectedInstitution === uni.name ? styles.selected : ""
              }`}
              onClick={() =>
                setSelectedInstitution(
                  selectedInstitution === uni.name ? null : uni.name,
                )
              }
            >
              <div
                className={styles.colorBox}
                style={{ backgroundColor: uni.color }}
              />
              <span className={styles.universityName}>
                {uni.name}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
