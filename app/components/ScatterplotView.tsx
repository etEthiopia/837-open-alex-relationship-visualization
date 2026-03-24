"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as d3 from "d3";
import styles from "./ScatterplotView.module.css";
import { distinctColors } from "../lib/colors";

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
  topics?: Array<{
    domain?: { display_name: string };
  }>;
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
  const [authors, setAuthors] = useState<Author[]>([]);
  const [useSizeEncoding, setUseSizeEncoding] = useState<boolean>(true);
  const [selectedInstitution, setSelectedInstitution] = useState<string | null>(
    null
  );
  const [universities, setUniversities] = useState<
    Array<{ name: string; color: string; totalACI: number }>
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
        setAuthors(domainFiltered);
      });
  }, [canadianFilter, domain]);

  useEffect(() => {
    if (!svgRef.current || authors.length === 0) return;

    d3.select(svgRef.current).selectAll("*").remove();

    const allInstitutionMap = new Map<string, Author[]>();
    authors.forEach((author) => {
      const inst = author.last_known_institution?.display_name || "Unknown";
      if (!allInstitutionMap.has(inst)) {
        allInstitutionMap.set(inst, []);
      }
      allInstitutionMap.get(inst)!.push(author);
    });

    const allUniList = Array.from(allInstitutionMap.entries()).map(
      ([inst, instAuthors]) => ({
        name: inst,
        totalACI: instAuthors.reduce((sum, a) => sum + a.aci, 0),
        authors: instAuthors,
      })
    );
    allUniList.sort((a, b) => b.totalACI - a.totalACI);

    const topUniversities = allUniList.slice(0, maxUniversities);
    const topUniversityNames = new Set(topUniversities.map((u) => u.name));

    const filteredAuthors = authors.filter((author) =>
      topUniversityNames.has(
        author.last_known_institution?.display_name || "Unknown"
      )
    );
    const displayAuthors = filteredAuthors.slice(0, maxAuthors);

    const colorScale = d3
      .scaleOrdinal<string>()
      .domain(topUniversities.map((u) => u.name))
      .range(distinctColors(topUniversities.length));

    const uniList = topUniversities.map((uni) => ({
      name: uni.name,
      color: colorScale(uni.name),
      totalACI: uni.totalACI,
    }));
    setUniversities(uniList);

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

    const sizeScale = d3
      .scaleSqrt()
      .domain([0, d3.max(displayAuthors, (d) => d.aci) || 1])
      .range([3, 15]);

    const xAxis = d3.axisBottom(xScale);
    const yAxis = d3.axisLeft(yScale);

    const xAxisGroup = svg
      .append("g")
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

    const yAxisGroup = svg.append("g").call(yAxis);
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
        .style("pointer-events", "none")
        .style("opacity", 0)
        .style("z-index", "1000");
    }
    const tooltip = tooltipRef.current;

    svg
      .selectAll("circle")
      .data(displayAuthors)
      .enter()
      .append("circle")
      .attr("cx", (d) => xScale(d.field_papers))
      .attr("cy", (d) => yScale(d.field_citations))
      .attr("r", (d) => (useSizeEncoding ? sizeScale(d.aci) : 5))
      .attr("fill", (d) =>
        colorScale(d.last_known_institution?.display_name || "Unknown")
      )
      .attr("stroke", "rgba(255,255,255,0.7)")
      .attr("stroke-width", 0.8)
      .style("cursor", "pointer")
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
            Citation Impact: ${d.aci.toFixed(2)}<br/>
            <em>Click to view profile</em>
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
        router.push(`/author?id=${shortId}`);
      });

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
      .text("Publications vs Citations");

    return () => {
      if (tooltipRef.current) {
        tooltipRef.current.remove();
        tooltipRef.current = null;
      }
    };
  }, [authors, maxAuthors, maxUniversities, useSizeEncoding, selectedInstitution, router]);

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
              <div
                className={styles.colorBox}
                style={{ backgroundColor: uni.color }}
              />
              <span className={styles.universityName}>{uni.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
