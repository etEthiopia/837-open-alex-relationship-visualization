/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as d3 from "d3";
import styles from "./NetworkView.module.css";
import { distinctColors } from "../lib/colors";

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
  cluster: number;
  linkCount: number;
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

type EdgeStrengthMetric =
  | "total_fwci"
  | "total_cited_by_count"
  | "total_papers"
  | "none";

interface NetworkViewProps {
  maxAuthors: number;
  maxUniversities: number;
  canadianFilter: "full" | "full_partial";
  domain: string;
}

export default function NetworkView({
  maxAuthors,
  maxUniversities,
  canadianFilter,
}: NetworkViewProps) {
  const router = useRouter();
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<d3.Selection<
    HTMLDivElement,
    unknown,
    HTMLElement,
    unknown
  > | null>(null);

  const [authorships, setAuthorships] = useState<Authorship[]>([]);
  const [useSizeEncoding, setUseSizeEncoding] = useState<boolean>(true);
  const [edgeStrength, setEdgeStrength] =
    useState<EdgeStrengthMetric>("none");
  const [selectedInstitution, setSelectedInstitution] = useState<
    string | null
  >(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [universities, setUniversities] = useState<
    Array<{ name: string; color: string; totalACI: number }>
  >([]);

  useEffect(() => {
    fetch("/data/authorships.json")
      .then((res) => res.json())
      .then((data: Authorship[]) => setAuthorships(data));
  }, []);

  useEffect(() => {
    if (!svgRef.current || authorships.length === 0) return;

    d3.select(svgRef.current).selectAll("*").remove();

    // --- Data processing ---
    const filteredAuthorships = authorships.filter((a) => {
      if (canadianFilter === "full") return a.canadian_status === "full";
      return a.canadian_status === "full" || a.canadian_status === "partial";
    });

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
            cluster: 0,
            linkCount: 0,
          });
        }
      });
    });

    // Group by institution
    const institutionGroups = new Map<
      string,
      { authors: Node[]; totalACI: number }
    >();
    authorMap.forEach((author) => {
      if (!institutionGroups.has(author.institution)) {
        institutionGroups.set(author.institution, {
          authors: [],
          totalACI: 0,
        });
      }
      const group = institutionGroups.get(author.institution)!;
      group.authors.push(author);
      group.totalACI += author.aci;
    });

    const sortedInstitutions = Array.from(institutionGroups.entries())
      .sort((a, b) => b[1].totalACI - a[1].totalACI)
      .slice(0, maxUniversities);

    const topInstitutionNames = new Set(
      sortedInstitutions.map(([name]) => name)
    );

    // Assign cluster index to each institution
    const institutionToCluster = new Map<string, number>();
    sortedInstitutions.forEach(([name], idx) => {
      institutionToCluster.set(name, idx);
    });

    const filteredAuthors = Array.from(authorMap.values()).filter((author) =>
      topInstitutionNames.has(author.institution)
    );

    // Assign cluster to each author
    filteredAuthors.forEach((author) => {
      author.cluster = institutionToCluster.get(author.institution) || 0;
    });

    const displayAuthors = filteredAuthors.slice(0, maxAuthors);
    const displayAuthorIds = new Set(displayAuthors.map((a) => a.id));

    // Build links
    const links: Link[] = [];
    const linkMap = new Map<string, Link>();
    filteredAuthorships.forEach((authorship) => {
      const authorIds = authorship.ids.filter((id) =>
        displayAuthorIds.has(id)
      );
      for (let i = 0; i < authorIds.length; i++) {
        for (let j = i + 1; j < authorIds.length; j++) {
          const key = [authorIds[i], authorIds[j]].sort().join("+");
          const value =
            edgeStrength === "none"
              ? 1
              : edgeStrength === "total_fwci"
              ? authorship.total_fwci
              : edgeStrength === "total_cited_by_count"
              ? authorship.total_cited_by_count
              : authorship.total_papers;

          if (linkMap.has(key)) {
            const existing = linkMap.get(key)!;
            existing.value += value;
          } else {
            const link = {
              source: authorIds[i],
              target: authorIds[j],
              value,
            };
            linkMap.set(key, link);
            links.push(link);
          }
        }
      }
    });

    // Count links per node
    const linkCountMap = new Map<string, number>();
    links.forEach((l) => {
      const sid = typeof l.source === "string" ? l.source : l.source.id;
      const tid = typeof l.target === "string" ? l.target : l.target.id;
      linkCountMap.set(sid, (linkCountMap.get(sid) || 0) + 1);
      linkCountMap.set(tid, (linkCountMap.get(tid) || 0) + 1);
    });
    displayAuthors.forEach((a) => {
      a.linkCount = linkCountMap.get(a.id) || 0;
    });

    // Color scale — golden-angle HCL for maximum perceptual separation
    const topInstArray = Array.from(topInstitutionNames);
    const colorScale = d3
      .scaleOrdinal<string>()
      .domain(topInstArray)
      .range(distinctColors(topInstArray.length));

    const uniList = sortedInstitutions.map(([name, group]) => ({
      name,
      color: colorScale(name),
      totalACI: group.totalACI,
    }));
    setUniversities(uniList);

    // --- Layout ---
    const containerWidth =
      svgRef.current.parentElement?.clientWidth || 1200;
    const containerHeight =
      svgRef.current.parentElement?.clientHeight || 800;
    const width = containerWidth;
    const height = containerHeight;
    const cx = width / 2;
    const cy = height / 2;

    // Sector-based pre-positioning: place each cluster in a wedge around center
    const numClusters = sortedInstitutions.length;
    const clusterCentroids: { x: number; y: number }[] = [];
    const orbitRadius = Math.min(width, height) * 0.32;

    for (let i = 0; i < numClusters; i++) {
      const angle = (2 * Math.PI * i) / numClusters - Math.PI / 2;
      clusterCentroids.push({
        x: cx + orbitRadius * Math.cos(angle),
        y: cy + orbitRadius * Math.sin(angle),
      });
    }

    // Pre-position nodes near their cluster centroid with jitter
    displayAuthors.forEach((d) => {
      const centroid = clusterCentroids[d.cluster];
      const jitter = 30 + Math.random() * 40;
      const angle = Math.random() * 2 * Math.PI;
      d.x = centroid.x + jitter * Math.cos(angle);
      d.y = centroid.y + jitter * Math.sin(angle);
    });

    // Scales
    const sizeScale = d3
      .scaleSqrt()
      .domain([0, d3.max(displayAuthors, (d) => d.aci) || 1])
      .range([4, 22]);

    const linkWidthScale = d3
      .scaleLinear()
      .domain([0, d3.max(links, (d) => d.value) || 1])
      .range([0.5, 4]);

    const linkOpacityScale = d3
      .scaleLinear()
      .domain([0, d3.max(links, (d) => d.value) || 1])
      .range([0.15, 0.6]);

    // --- SVG setup with zoom ---
    const svgEl = d3
      .select(svgRef.current)
      .attr("width", containerWidth)
      .attr("height", containerHeight);

    const g = svgEl.append("g");

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 6])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });

    svgEl.call(zoom);

    // Click on background to deselect
    svgEl.on("click", () => {
      setSelectedNode(null);
    });

    // Custom cluster force: pull nodes toward their cluster centroid
    function clusterForce(alpha: number) {
      const strength = 0.3;
      displayAuthors.forEach((d) => {
        const centroid = clusterCentroids[d.cluster];
        d.vx = (d.vx || 0) + (centroid.x - (d.x || 0)) * strength * alpha;
        d.vy = (d.vy || 0) + (centroid.y - (d.y || 0)) * strength * alpha;
      });
    }

    // Force simulation
    const simulation = d3
      .forceSimulation<Node>(displayAuthors)
      .force(
        "link",
        d3
          .forceLink<Node, Link>(links)
          .id((d) => d.id)
          .distance(60)
          .strength(0.4)
      )
      .force(
        "charge",
        d3.forceManyBody().strength(-80).distanceMax(300)
      )
      .force("center", d3.forceCenter(cx, cy).strength(0.05))
      .force("cluster", clusterForce as any)
      .force(
        "collision",
        d3
          .forceCollide<Node>()
          .radius((d) => (useSizeEncoding ? sizeScale(d.aci) : 6) + 3)
          .strength(0.7)
      )
      .alphaDecay(0.02)
      .velocityDecay(0.4);

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
        .style("font-family", "Outfit, system-ui, sans-serif")
        .style("pointer-events", "none")
        .style("opacity", 0)
        .style("z-index", "1000");
    }
    const tooltip = tooltipRef.current;

    // Draw links
    const linkEl = g
      .append("g")
      .attr("class", "links")
      .selectAll("line")
      .data(links)
      .enter()
      .append("line")
      .attr("stroke", (d: any) => {
        const sNode =
          typeof d.source === "string"
            ? displayAuthors.find((a) => a.id === d.source)
            : d.source;
        const tNode =
          typeof d.target === "string"
            ? displayAuthors.find((a) => a.id === d.target)
            : d.target;
        if (sNode && tNode && sNode.institution === tNode.institution) {
          return colorScale(sNode.institution);
        }
        return "#9aa0b8";
      })
      .attr("stroke-opacity", (d) =>
        edgeStrength === "none" ? 0.25 : linkOpacityScale(d.value)
      )
      .attr("stroke-width", (d) =>
        edgeStrength === "none" ? 1 : linkWidthScale(d.value)
      );

    // Draw nodes
    const nodeGroup = g
      .append("g")
      .attr("class", "nodes")
      .selectAll<SVGGElement, Node>("g")
      .data(displayAuthors)
      .enter()
      .append("g")
      .style("cursor", "pointer")
      .call(
        d3
          .drag<SVGGElement, Node>()
          .on("start", dragstarted)
          .on("drag", dragged)
          .on("end", dragended)
      );

    // Node circles
    nodeGroup
      .append("circle")
      .attr("r", (d) => (useSizeEncoding ? sizeScale(d.aci) : 6))
      .attr("fill", (d) => colorScale(d.institution))
      .attr("stroke", "rgba(255,255,255,0.5)")
      .attr("stroke-width", 0.8)
      .style("opacity", (d) => {
        if (!selectedInstitution) return 0.85;
        return d.institution === selectedInstitution ? 1.0 : 0.15;
      });

    // Node labels (only for connected or larger nodes)
    nodeGroup
      .append("text")
      .text((d) => {
        if (d.linkCount === 0 && d.aci < 5) return "";
        const parts = d.name.split(" ");
        if (parts.length >= 2) {
          return parts[parts.length - 1];
        }
        return d.name.length > 10 ? d.name.slice(0, 10) : d.name;
      })
      .attr("dy", (d) => (useSizeEncoding ? sizeScale(d.aci) : 6) + 12)
      .attr("text-anchor", "middle")
      .style("font-size", "9px")
      .style("fill", "rgba(0,0,0,0.45)")
      .style("pointer-events", "none")
      .style("font-weight", "500")
      .style("opacity", (d) => {
        if (!selectedInstitution) return 0.8;
        return d.institution === selectedInstitution ? 1.0 : 0.1;
      });

    // Interaction: hover
    nodeGroup
      .on("mouseover", function (event, d) {
        d3.select(this)
          .select("circle")
          .attr("stroke-width", 1.5)
          .attr("stroke", "rgba(0,0,0,0.3)");
        tooltip
          .style("opacity", 1)
          .html(
            `<strong>${d.name}</strong><br/>` +
            `${d.institution}<br/>` +
            `Citation Impact: ${d.aci.toFixed(2)} · Connections: ${d.linkCount}<br/>` +
            `<span style="font-size:10px;opacity:0.45;text-decoration:underline;">Click to view profile</span>`
          );
      })
      .on("mousemove", function (event) {
        tooltip
          .style("left", event.pageX + 10 + "px")
          .style("top", event.pageY - 10 + "px");
      })
      .on("mouseout", function (_event, d) {
        d3.select(this)
          .select("circle")
          .attr("stroke-width", 0.8)
          .attr("stroke", "rgba(255,255,255,0.5)");
        tooltip.style("opacity", 0);
      })
      .on("click", function (event, d) {
        event.stopPropagation();

        // Highlight selected node and its connections
        setSelectedNode((prev) => (prev === d.id ? null : d.id));

        const shortId = d.id.replace("https://openalex.org/", "");
        router.push(`/author?id=${shortId}`);
      });

    // Tick handler
    simulation.on("tick", () => {
      linkEl
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);

      nodeGroup.attr("transform", (d) => `translate(${d.x},${d.y})`);
    });

    // Drag handlers
    function dragstarted(event: any, d: Node) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.x = event.x;
      d.y = event.y;
    }

    function dragged(event: any, d: Node) {
      d.x = event.x;
      d.y = event.y;
    }

    function dragended(event: any) {
      if (!event.active) simulation.alphaTarget(0);
    }

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
    selectedNode,
    router,
  ]);

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
            <span>Use Citation Impact for node size</span>
          </label>
          <div className={styles.controlGroup}>
            <label htmlFor="edgeStrength">Edge Strength:</label>
            <select
              id="edgeStrength"
              value={edgeStrength}
              onChange={(e) =>
                setEdgeStrength(e.target.value as EdgeStrengthMetric)
              }
              className={styles.select}
            >
              <option value="none">None (Equal)</option>
              <option value="total_fwci">Total FWCI</option>
              <option value="total_cited_by_count">Total Citations</option>
              <option value="total_papers">Total Papers</option>
            </select>
          </div>
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
