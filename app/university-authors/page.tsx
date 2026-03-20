/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import styles from "./university-authors.module.css";

interface Institution {
  id: string;
  display_name: string;
  country_code: string;
  type: string;
}

interface Authorship {
  id: string;
  ids: string[];
  names: string[];
  ACIs: number[];
  last_known_institutions: Institution[];
  total_cited_by_count: number;
  total_papers: number;
  total_fwci: number;
  canadian_status: string;
}

interface Node {
  id: string;
  name: string;
  aci: number;
  institution: string;
  institutionId: string;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
}

interface Link {
  source: string | Node;
  target: string | Node;
  value: number;
}

type EdgeStrengthMetric = "total_fwci" | "total_cited_by_count" | "total_papers" | "none";
type CanadianFilter = "full" | "full_partial";

export default function UniversityAuthorsPage() {
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<d3.Selection<HTMLDivElement, unknown, HTMLElement, unknown> | null>(null);

  const [authorships, setAuthorships] = useState<Authorship[]>([]);
  const [maxAuthors, setMaxAuthors] = useState<number>(30);
  const [maxUniversities, setMaxUniversities] = useState<number>(20);
  const [useSizeEncoding, setUseSizeEncoding] = useState<boolean>(true);
  const [edgeStrength, setEdgeStrength] = useState<EdgeStrengthMetric>("none");
  const [canadianFilter, setCanadianFilter] = useState<CanadianFilter>("full");
  const [selectedInstitution, setSelectedInstitution] = useState<string | null>(null);
  const [universities, setUniversities] = useState<Array<{ name: string; color: string; totalACI: number }>>([]);

  // Load data
  useEffect(() => {
    fetch("/data/authorships.json")
      .then((res) => res.json())
      .then((data: Authorship[]) => {
        setAuthorships(data);
      });
  }, []);

  // Create visualization
  useEffect(() => {
    if (!svgRef.current || authorships.length === 0) return;

    // Clear previous content
    d3.select(svgRef.current).selectAll("*").remove();

    // Filter by canadian status
    const filteredAuthorships = authorships.filter((a) => {
      if (canadianFilter === "full") {
        return a.canadian_status === "full";
      } else {
        return a.canadian_status === "full" || a.canadian_status === "partial";
      }
    });

    // Extract unique authors from authorships
    const authorMap = new Map<string, Node>();
    filteredAuthorships.forEach((authorship) => {
      authorship.ids.forEach((authorId, idx) => {
        if (!authorMap.has(authorId)) {
          const institution = authorship.last_known_institutions[idx];
          authorMap.set(authorId, {
            id: authorId,
            name: authorship.names[idx],
            aci: authorship.ACIs[idx],
            institution: institution?.display_name || "Unknown",
            institutionId: institution?.id || "unknown",
          });
        }
      });
    });

    // Group authors by institution and calculate total ACI
    const institutionGroups = new Map<string, { authors: Node[]; totalACI: number }>();
    authorMap.forEach((author) => {
      if (!institutionGroups.has(author.institution)) {
        institutionGroups.set(author.institution, { authors: [], totalACI: 0 });
      }
      const group = institutionGroups.get(author.institution)!;
      group.authors.push(author);
      group.totalACI += author.aci;
    });

    // Sort institutions by total ACI
    const sortedInstitutions = Array.from(institutionGroups.entries())
      .sort((a, b) => b[1].totalACI - a[1].totalACI)
      .slice(0, maxUniversities);

    const topInstitutionNames = new Set(sortedInstitutions.map(([name]) => name));

    // Filter authors to only those from top institutions
    const filteredAuthors = Array.from(authorMap.values()).filter((author) =>
      topInstitutionNames.has(author.institution)
    );

    // Limit to maxAuthors
    const displayAuthors = filteredAuthors.slice(0, maxAuthors);
    const displayAuthorIds = new Set(displayAuthors.map((a) => a.id));

    // Create links from authorships
    const links: Link[] = [];
    filteredAuthorships.forEach((authorship) => {
      const authorIds = authorship.ids.filter((id) => displayAuthorIds.has(id));

      // Create links between all pairs of authors in this authorship
      for (let i = 0; i < authorIds.length; i++) {
        for (let j = i + 1; j < authorIds.length; j++) {
          const value =
            edgeStrength === "none"
              ? 1
              : edgeStrength === "total_fwci"
              ? authorship.total_fwci
              : edgeStrength === "total_cited_by_count"
              ? authorship.total_cited_by_count
              : authorship.total_papers;

          links.push({
            source: authorIds[i],
            target: authorIds[j],
            value: value,
          });
        }
      }
    });

    // Color scale for institutions
    const colorScale = d3
      .scaleOrdinal<string>()
      .domain(Array.from(topInstitutionNames))
      .range(d3.schemeTableau10);

    // Update universities list
    const uniList = sortedInstitutions.map(([name, group]) => ({
      name,
      color: colorScale(name),
      totalACI: group.totalACI,
    }));
    setUniversities(uniList);

    // Dimensions with padding to keep nodes visible
    const containerWidth = svgRef.current.parentElement?.clientWidth || 1200;
    const containerHeight = svgRef.current.parentElement?.clientHeight || 800;
    const padding = 40; // Padding to keep nodes away from edges
    const width = containerWidth - padding * 2;
    const height = containerHeight - padding * 2;

    const svg = d3
      .select(svgRef.current)
      .attr("width", containerWidth)
      .attr("height", containerHeight)
      .append("g")
      .attr("transform", `translate(${padding}, ${padding})`);

    // Size scale for ACI
    const sizeScale = d3
      .scaleSqrt()
      .domain([0, d3.max(displayAuthors, (d) => d.aci) || 1])
      .range([4, 20]);

    // Link width scale based on edge strength
    const linkWidthScale = d3
      .scaleLinear()
      .domain([0, d3.max(links, (d) => d.value) || 1])
      .range([0.5, 5]);

    // Create force simulation
    const simulation = d3
      .forceSimulation<Node>(displayAuthors)
      .force(
        "link",
        d3
          .forceLink<Node, Link>(links)
          .id((d) => d.id)
          .distance(100)
          .strength((d) => (edgeStrength === "none" ? 0.1 : d.value / 1000))
      )
      .force("charge", d3.forceManyBody().strength(-200))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius((d) => (useSizeEncoding ? sizeScale((d as any).aci) : 5) + 2));

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

    // Draw links
    const link = svg
      .append("g")
      .selectAll("line")
      .data(links)
      .enter()
      .append("line")
      .attr("stroke", "#999")
      .attr("stroke-opacity", 0.6)
      .attr("stroke-width", (d) => (edgeStrength === "none" ? 1 : linkWidthScale(d.value)));

    // Draw nodes
    const node = svg
      .append("g")
      .selectAll("circle")
      .data(displayAuthors)
      .enter()
      .append("circle")
      .attr("r", (d) => (useSizeEncoding ? sizeScale(d.aci) : 6))
      .attr("fill", (d) => colorScale(d.institution))
      .attr("stroke", "#fff")
      .attr("stroke-width", 2)
      .style("opacity", (d) => {
        if (!selectedInstitution) return 0.8;
        return d.institution === selectedInstitution ? 1.0 : 0.2;
      })
      .on("mouseover", function (event, d) {
        d3.select(this).attr("stroke-width", 3);
        tooltip.style("opacity", 1).html(`
            <strong>${d.name}</strong><br/>
            Institution: ${d.institution}<br/>
            ACI: ${d.aci.toFixed(2)}
          `);
      })
      .on("mousemove", function (event) {
        tooltip
          .style("left", event.pageX + 10 + "px")
          .style("top", event.pageY - 10 + "px");
      })
      .on("mouseout", function () {
        d3.select(this).attr("stroke-width", 2);
        tooltip.style("opacity", 0);
      })
      .call(
        d3
          .drag<SVGCircleElement, Node>()
          .on("start", dragstarted)
          .on("drag", dragged)
          .on("end", dragended)
      );

    // Update positions on tick with boundary constraints
    simulation.on("tick", () => {
      // Constrain nodes within bounds
      displayAuthors.forEach((d) => {
        const radius = useSizeEncoding ? sizeScale(d.aci) : 6;
        d.x = Math.max(radius, Math.min(width - radius, d.x!));
        d.y = Math.max(radius, Math.min(height - radius, d.y!));
      });

      link
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);

      node.attr("cx", (d) => d.x!).attr("cy", (d) => d.y!);
    });

    // Drag functions with boundary constraints
    function dragstarted(event: any, d: Node) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      const radius = useSizeEncoding ? sizeScale(d.aci) : 6;
      d.x = Math.max(radius, Math.min(width - radius, event.x));
      d.y = Math.max(radius, Math.min(height - radius, event.y));
    }

    function dragged(event: any, d: Node) {
      const radius = useSizeEncoding ? sizeScale(d.aci) : 6;
      d.x = Math.max(radius, Math.min(width - radius, event.x));
      d.y = Math.max(radius, Math.min(height - radius, event.y));
    }

    function dragended(event: any, d: Node) {
      if (!event.active) simulation.alphaTarget(0);
    }

    // Cleanup
    return () => {
      simulation.stop();
      if (tooltipRef.current) {
        tooltipRef.current.remove();
        tooltipRef.current = null;
      }
    };
  }, [
    authorships,
    maxAuthors,
    maxUniversities,
    useSizeEncoding,
    edgeStrength,
    canadianFilter,
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
            <label htmlFor="maxUniversities">Max Universities: {maxUniversities}</label>
            <input
              id="maxUniversities"
              type="range"
              min="5"
              max="50"
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

          <div className={styles.controlGroup}>
            <label htmlFor="edgeStrength">Edge Strength:</label>
            <select
              id="edgeStrength"
              value={edgeStrength}
              onChange={(e) => setEdgeStrength(e.target.value as EdgeStrengthMetric)}
              className={styles.select}
            >
              <option value="none">None (Equal)</option>
              <option value="total_fwci">Total FWCI</option>
              <option value="total_cited_by_count">Total Citations</option>
              <option value="total_papers">Total Papers</option>
            </select>
          </div>

          <div className={styles.controlGroup}>
            <label htmlFor="canadianFilter">Canadian Status:</label>
            <select
              id="canadianFilter"
              value={canadianFilter}
              onChange={(e) => setCanadianFilter(e.target.value as CanadianFilter)}
              className={styles.select}
            >
              <option value="full">Full Canadian Only</option>
              <option value="full_partial">Full + Partial Canadian</option>
            </select>
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
                setSelectedInstitution(selectedInstitution === uni.name ? null : uni.name)
              }
            >
              <div
                className={styles.colorBox}
                style={{ backgroundColor: uni.color }}
              />
              <span className={styles.universityName}>
                {uni.name}
                {/* <span className={styles.aciValue}> ({uni.totalACI.toFixed(1)})</span> */}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
