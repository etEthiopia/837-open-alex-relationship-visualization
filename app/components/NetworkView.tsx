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
  field_citations: number[];
  field_papers: number[];
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
  field_citations: number;
  field_papers: number;
  institution: string;
  institutionId: string;
  cluster: number;
  linkCount: number;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
}

interface MatrixNode {
  id: string;
  institution: string;
  authors: Node[];
  cluster: number;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
  width: number;
  height: number;
}

interface Link {
  source: string | Node | MatrixNode;
  target: string | Node | MatrixNode;
  value: number;
  originalSource?: Node;
  originalTarget?: Node;
  fwci?: number;
  citations?: number;
  papers?: number;
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
  domain,
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
  const [domainAuthorIds, setDomainAuthorIds] = useState<Set<string> | null>(null);
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
  const [matrixUniversities, setMatrixUniversities] = useState<Set<string>>(new Set());

  // Toggle matrix mode for a university
  const toggleMatrixMode = (institutionName: string) => {
    setMatrixUniversities((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(institutionName)) {
        newSet.delete(institutionName);
      } else {
        newSet.add(institutionName);
      }
      return newSet;
    });
  };

  useEffect(() => {
    fetch("/data/authorships.json")
      .then((res) => res.json())
      .then((data: Authorship[]) => setAuthorships(data));
  }, []);

  // Build domain-filtered author ID set from authors.json whenever domain changes
  useEffect(() => {
    if (domain === "All Domains") {
      setDomainAuthorIds(null);
      return;
    }
    fetch("/data/authors.json")
      .then((res) => res.json())
      .then((data: Array<{ author_id: string; topics?: Array<{ domain?: { display_name: string }; field?: { display_name: string }; subfield?: { display_name: string } }> }>) => {
        const [level, value] = domain.split(":") as [string, string];
        const ids = new Set(
          data
            .filter((a) =>
              (a.topics || []).some((t) => {
                if (level === "domain") return t.domain?.display_name === value;
                if (level === "field") return t.field?.display_name === value;
                if (level === "subfield") return t.subfield?.display_name === value;
                return false;
              })
            )
            .map((a) => a.author_id)
        );
        setDomainAuthorIds(ids);
      });
  }, [domain]);

  useEffect(() => {
    if (!svgRef.current || authorships.length === 0) return;
    if (domain !== "All Domains" && domainAuthorIds === null) return;

    d3.select(svgRef.current).selectAll("*").remove();

    // --- Data processing ---
    const filteredAuthorships = authorships.filter((a) => {
      if (canadianFilter === "full") return a.canadian_status === "full";
      return a.canadian_status === "full" || a.canadian_status === "partial";
    });

    const authorMap = new Map<string, Node>();
    filteredAuthorships.forEach((authorship) => {
      authorship.ids.forEach((authorId, idx) => {
        if (!authorMap.has(authorId) && (domainAuthorIds === null || domainAuthorIds.has(authorId))) {
          const institution = authorship.last_known_institutions[idx];
          authorMap.set(authorId, {
            id: authorId,
            name: authorship.names[idx],
            aci: authorship.ACIs[idx],
            field_citations: authorship.field_citations[idx],
            field_papers: authorship.field_papers[idx],
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
            existing.fwci = (existing.fwci || 0) + authorship.total_fwci;
            existing.citations = (existing.citations || 0) + authorship.total_cited_by_count;
            existing.papers = (existing.papers || 0) + authorship.total_papers;
          } else {
            const link = {
              source: authorIds[i],
              target: authorIds[j],
              value,
              fwci: authorship.total_fwci,
              citations: authorship.total_cited_by_count,
              papers: authorship.total_papers,
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

    // --- NodeTrix: Separate nodes and matrix nodes ---
    const cellSize = 15;
    const labelPadding = 80;

    const matrixNodes: MatrixNode[] = [];
    const regularNodes: Node[] = [];
    const authorToMatrix = new Map<string, MatrixNode>();

    displayAuthors.forEach((author) => {
      if (matrixUniversities.has(author.institution)) {
        let matrixNode = matrixNodes.find((m) => m.institution === author.institution);
        if (!matrixNode) {
          matrixNode = {
            id: `matrix-${author.institution}`,
            institution: author.institution,
            authors: [],
            cluster: author.cluster,
            width: 0,
            height: 0,
          };
          matrixNodes.push(matrixNode);
        }
        matrixNode.authors.push(author);
        authorToMatrix.set(author.id, matrixNode);
      } else {
        regularNodes.push(author);
      }
    });

    matrixNodes.forEach((matrix) => {
      const size = matrix.authors.length * cellSize;
      matrix.width = size;
      matrix.height = size;
    });

    // Separate links into internal (within matrix) and external (bridge) links
    const internalLinks: Link[] = [];
    const externalLinks: Link[] = [];
    const authorIdToNode = new Map<string, Node>();
    displayAuthors.forEach((author) => authorIdToNode.set(author.id, author));

    links.forEach((link) => {
      const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
      const targetId = typeof link.target === 'string' ? link.target : link.target.id;

      const sourceAuthor = authorIdToNode.get(sourceId);
      const targetAuthor = authorIdToNode.get(targetId);

      if (!sourceAuthor || !targetAuthor) return;

      const sourceMatrix = authorToMatrix.get(sourceId);
      const targetMatrix = authorToMatrix.get(targetId);

      if (sourceMatrix && targetMatrix && sourceMatrix === targetMatrix) {
        internalLinks.push(link);
      } else {
        const bridgeLink: Link = {
          source: sourceMatrix || sourceAuthor,
          target: targetMatrix || targetAuthor,
          value: link.value,
          originalSource: sourceAuthor,
          originalTarget: targetAuthor,
        };
        externalLinks.push(bridgeLink);
      }
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

    // Pre-position regular nodes near their cluster centroid with jitter
    regularNodes.forEach((d) => {
      const centroid = clusterCentroids[d.cluster];
      const jitter = 30 + Math.random() * 40;
      const angle = Math.random() * 2 * Math.PI;
      d.x = centroid.x + jitter * Math.cos(angle);
      d.y = centroid.y + jitter * Math.sin(angle);
    });

    // Pre-position matrix nodes near their cluster centroid
    matrixNodes.forEach((d) => {
      const centroid = clusterCentroids[d.cluster];
      const jitter = 40 + Math.random() * 50;
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
    type SimulationNode = Node | MatrixNode;
    const allNodes: SimulationNode[] = [...regularNodes, ...matrixNodes];

    function clusterForce(alpha: number) {
      const strength = 0.3;
      allNodes.forEach((d) => {
        const centroid = clusterCentroids[d.cluster];
        d.vx = (d.vx || 0) + (centroid.x - (d.x || 0)) * strength * alpha;
        d.vy = (d.vy || 0) + (centroid.y - (d.y || 0)) * strength * alpha;
      });
    }

    // Force simulation with combined nodes
    const simulation = d3
      .forceSimulation<SimulationNode>(allNodes)
      .force(
        "link",
        d3
          .forceLink<SimulationNode, Link>(externalLinks)
          .id((d: any) => ('authors' in d ? d.id : d.id))
          .distance(150)
          .strength((d) => (edgeStrength === "none" ? 0.1 : d.value / 1000))
      )
      .force(
        "charge",
        d3.forceManyBody().strength(-300).distanceMax(300)
      )
      .force("center", d3.forceCenter(cx, cy).strength(0.05))
      .force("cluster", clusterForce as any)
      .force(
        "collision",
        d3
          .forceCollide<SimulationNode>()
          .radius((d: any) => {
            if ('authors' in d) {
              const visualWidth = d.width + labelPadding;
              return Math.max(visualWidth, d.height) / 2 + 20;
            } else {
              return (useSizeEncoding ? sizeScale(d.aci) : 6) + 3;
            }
          })
          .strength(0.7)
      )
      .alphaDecay(0.028)
      .velocityDecay(0.45);

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

    // Helper function to calculate anchor point on matrix edge (top edge for columns)
    const getMatrixAnchor = (matrixNode: MatrixNode, author: Node) => {
      const authorIndex = matrixNode.authors.findIndex((a) => a.id === author.id);
      if (authorIndex === -1) return { x: matrixNode.x!, y: matrixNode.y! };

      const halfHeight = matrixNode.height / 2;
      const columnOffset = (authorIndex + 0.5) * cellSize;
      const anchorX = matrixNode.x! - matrixNode.width / 2 + columnOffset;
      const anchorY = matrixNode.y! - halfHeight;

      return { x: anchorX, y: anchorY };
    };

    // Draw external/bridge links (using paths to support matrix anchors)
    const linkEl = g
      .append("g")
      .attr("class", "links")
      .selectAll("path")
      .data(externalLinks)
      .enter()
      .append("path")
      .attr("stroke", (d: any) => {
        // Check if both source and target are from same institution
        const sourceInst = 'authors' in d.source ? d.source.institution : d.source.institution;
        const targetInst = 'authors' in d.target ? d.target.institution : d.target.institution;
        if (sourceInst === targetInst) {
          return colorScale(sourceInst);
        }
        return "#9aa0b8";
      })
      .attr("stroke-opacity", (d) =>
        edgeStrength === "none" ? 0.25 : linkOpacityScale(d.value)
      )
      .attr("stroke-width", (d) =>
        edgeStrength === "none" ? 1 : linkWidthScale(d.value)
      )
      .attr("fill", "none");

    // Track pinned nodes locally (reset when filters change)
    const pinnedSet = new Set<string>();

    function setPinVisual(id: string, pinned: boolean) {
      const grp = nodeGroup.filter((d) => d.id === id);
      grp.select<SVGCircleElement>("circle.node-circle")
        .attr("stroke", pinned ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.5)")
        .attr("stroke-width", pinned ? 2 : 0.8);
      grp.select<SVGCircleElement>("circle.pin-dot")
        .style("opacity", pinned ? 1 : 0);
    }

    // Draw regular nodes FIRST (so they appear below matrices)
    const nodeGroup = g
      .append("g")
      .attr("class", "nodes")
      .selectAll<SVGGElement, Node>("g")
      .data(regularNodes)
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
      .attr("class", "node-circle")
      .attr("r", (d) => (useSizeEncoding ? sizeScale(d.aci) : 6))
      .attr("fill", (d) => colorScale(d.institution))
      .attr("stroke", "rgba(255,255,255,0.5)")
      .attr("stroke-width", 0.8)
      .style("opacity", (d) => {
        if (!selectedInstitution) return 0.85;
        return d.institution === selectedInstitution ? 1.0 : 0.15;
      });

    // Pin dot indicator (hidden by default, shown when pinned)
    nodeGroup
      .append("circle")
      .attr("class", "pin-dot")
      .attr("r", 2.8)
      .attr("fill", "white")
      .attr("stroke", "rgba(0,0,0,0.55)")
      .attr("stroke-width", 1)
      .style("opacity", 0)
      .style("pointer-events", "none");

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
        const isPinned = pinnedSet.has(d.id);
        d3.select(this)
          .select("circle.node-circle")
          .attr("stroke-width", isPinned ? 2 : 1.5)
          .attr("stroke", isPinned ? "rgba(0,0,0,0.55)" : "rgba(0,0,0,0.3)");
        tooltip
          .style("opacity", 1)
          .html(
            `<strong>${d.name}</strong><br/>` +
            `${d.institution}<br/>` +
            `Citation Impact: ${d.aci.toFixed(2)} · Connections: ${d.linkCount}<br/>` +
            (isPinned
              ? `<span style="font-size:10px;opacity:0.45;text-decoration:underline;">Click to view profile · Right-click to unpin</span>`
              : `<span style="font-size:10px;opacity:0.45;text-decoration:underline;">Click to view profile</span>`)
          );
      })
      .on("mousemove", function (event) {
        tooltip
          .style("left", event.pageX + 10 + "px")
          .style("top", event.pageY - 10 + "px");
      })
      .on("mouseout", function (_event, d) {
        const isPinned = pinnedSet.has(d.id);
        d3.select(this)
          .select("circle.node-circle")
          .attr("stroke-width", isPinned ? 2 : 0.8)
          .attr("stroke", isPinned ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.5)");
        tooltip.style("opacity", 0);
      })
      .on("click", function (event, d) {
        event.stopPropagation();
        setSelectedNode((prev) => (prev === d.id ? null : d.id));
        const shortId = d.id.replace("https://openalex.org/", "");
        const fieldParam = domain && domain !== "All Domains" ? `&field=${encodeURIComponent(domain.split(":")[1] || domain)}` : "";
        router.push(`/author?id=${shortId}${fieldParam}&from=network`);
      })
      .on("contextmenu", function (event, d) {
        event.preventDefault();
        event.stopPropagation();
        if (!pinnedSet.has(d.id)) return;
        d.fx = null;
        d.fy = null;
        pinnedSet.delete(d.id);
        setPinVisual(d.id, false);
        simulation.alpha(0.15).restart();
      });

    // Draw matrix groups LAST (so they appear on top with labels visible)
    const matrixGroup = g
      .append("g")
      .attr("class", "matrices")
      .selectAll("g")
      .data(matrixNodes)
      .enter()
      .append("g")
      .attr("class", "matrix")
      .call(
        d3
          .drag<SVGGElement, MatrixNode>()
          .on("start", dragstartedMatrix)
          .on("drag", draggedMatrix)
          .on("end", dragendedMatrix)
      );

    // Draw matrix background
    matrixGroup
      .append("rect")
      .attr("class", "matrix-bg")
      .attr("x", labelPadding)
      .attr("width", (d) => d.width)
      .attr("height", (d) => d.height)
      .attr("fill", (d) => {
        const color = d3.color(colorScale(d.institution));
        if (color) {
          color.opacity = 0.1;
          return color.toString();
        }
        return "white";
      })
      .attr("stroke", (d) => colorScale(d.institution))
      .attr("stroke-width", 3)
      .attr("rx", 5);

    // Draw adjacency matrix cells
    matrixGroup.each(function (matrixNode) {
      const matrix = d3.select(this);
      const authors = matrixNode.authors;

      // Add background rectangles for row labels
      matrix
        .selectAll("rect.label-bg")
        .data(authors)
        .enter()
        .append("rect")
        .attr("class", "label-bg")
        .attr("x", 0)
        .attr("y", (d, i) => i * cellSize)
        .attr("width", labelPadding - 5)
        .attr("height", cellSize)
        .attr("fill", "white")
        .attr("opacity", 0.5)
        .style("pointer-events", "none");

      // Add row labels
      matrix
        .selectAll("text.row-label")
        .data(authors)
        .enter()
        .append("text")
        .attr("class", "row-label")
        .attr("x", labelPadding - 5)
        .attr("y", (d, i) => i * cellSize + cellSize / 2)
        .attr("text-anchor", "end")
        .attr("dominant-baseline", "middle")
        .attr("font-size", "10px")
        .attr("fill", "#333")
        .attr("font-weight", "500")
        .text((d) => {
          const maxLength = 12;
          return d.name.length > maxLength ? d.name.substring(0, maxLength) + "..." : d.name;
        })
        .style("pointer-events", "none");

      // Create adjacency matrix data with link information
      const matrixData: {
        row: number;
        col: number;
        value: number;
        rowAuthor: Node;
        colAuthor: Node;
        linkData?: Link;
      }[] = [];

      authors.forEach((rowAuthor, i) => {
        authors.forEach((colAuthor, j) => {
          let value = 0;
          let linkData = undefined;

          if (i !== j) {
            const link = internalLinks.find((l) => {
              const srcId = typeof l.source === 'string' ? l.source : l.source.id;
              const tgtId = typeof l.target === 'string' ? l.target : l.target.id;
              return (
                (srcId === rowAuthor.id && tgtId === colAuthor.id) ||
                (tgtId === rowAuthor.id && srcId === colAuthor.id)
              );
            });
            if (link) {
              value = 1;
              linkData = link;
            }
          } else {
            value = 1; // Diagonal
          }

          matrixData.push({ row: i, col: j, value, rowAuthor, colAuthor, linkData });
        });
      });

      // Create color scale for matrix cells based on edge strength
      const matrixConnectionValues = matrixData
        .filter((d) => d.value > 0 && d.row !== d.col && d.linkData)
        .map((d) => {
          if (edgeStrength === "none") return 1;
          if (edgeStrength === "total_fwci") return d.linkData!.fwci || 0;
          if (edgeStrength === "total_cited_by_count") return d.linkData!.citations || 0;
          return d.linkData!.papers || 0;
        });

      const maxConnectionValue = d3.max(matrixConnectionValues) || 1;
      const minConnectionValue = d3.min(matrixConnectionValues) || 0;

      // Luminance scale - darker for stronger connections
      const luminanceScale = d3
        .scaleLinear()
        .domain([minConnectionValue, maxConnectionValue])
        .range([0.6, 0.0]); // Light to dark

      // ACI scale for diagonal cells - use opacity instead of lightness
      const aciValues = authors.map((a) => a.aci);
      const maxACI = d3.max(aciValues) || 1;
      const minACI = d3.min(aciValues) || 0;

      const aciOpacityScale = d3
        .scaleLinear()
        .domain([minACI, maxACI])
        .range([0.4, 1.0]); // Lower ACI = more transparent, higher ACI = more opaque

      // Draw cells
      matrix
        .selectAll("rect.cell")
        .data(matrixData)
        .enter()
        .append("rect")
        .attr("class", "cell")
        .attr("x", (d) => labelPadding + d.col * cellSize)
        .attr("y", (d) => d.row * cellSize)
        .attr("width", cellSize - 1)
        .attr("height", cellSize - 1)
        .attr("fill", (d) => {
          if (d.row === d.col) {
            return colorScale(matrixNode.institution);
          }
          if (d.value > 0 && d.linkData) {
            // Apply luminance based on connection strength
            let connectionStrength = 0;
            if (edgeStrength === "none") {
              connectionStrength = 1;
            } else if (edgeStrength === "total_fwci") {
              connectionStrength = d.linkData.fwci || 0;
            } else if (edgeStrength === "total_cited_by_count") {
              connectionStrength = d.linkData.citations || 0;
            } else {
              connectionStrength = d.linkData.papers || 0;
            }

            const lightness = luminanceScale(connectionStrength);
            return d3.hsl(0, 0, lightness).toString();
          }
          return "#f0f0f0";
        })
        .attr("stroke", "#fff")
        .attr("stroke-width", 0.5)
        .style("opacity", (d) => {
          if (d.row === d.col) {
            // Diagonal cells - opacity based on ACI
            if (!selectedInstitution) {
              return aciOpacityScale(d.rowAuthor.aci);
            }
            return matrixNode.institution === selectedInstitution ? aciOpacityScale(d.rowAuthor.aci) : 0.2;
          } else {
            // Connection cells
            if (!selectedInstitution) return 0.6;
            return matrixNode.institution === selectedInstitution ? 1.0 : 0.2;
          }
        })
        .on("mouseover", function (event, d) {
          if (d.row === d.col) {
            // Find author's total connections and metrics
            const authorNode = displayAuthors.find(a => a.id === d.rowAuthor.id);
            const authorConnections = authorNode?.linkCount || 0;

            tooltip.style("opacity", 1).html(`
              <strong>${d.rowAuthor.name}</strong><br/>
              ${d.rowAuthor.institution}<br/>
              <br/>
              <strong>Metrics:</strong><br/>
              ACI: ${d.rowAuthor.aci.toFixed(2)}<br/>
              Connections: ${authorConnections}<br/>
              Citations: ${authorNode?.field_citations || '-'}<br/>
              Papers: ${authorNode?.field_papers || '-'}<br/>
            `);
          } else if (d.value > 0 && d.linkData) {
            tooltip.style("opacity", 1).html(`
              <strong>Collaboration</strong><br/>
              ${d.rowAuthor.name}<br/>
              ↔<br/>
              ${d.colAuthor.name}<br/>
              <br/>
              <strong>Metrics:</strong><br/>
              FWCI: ${d.linkData.fwci?.toFixed(2) || 'N/A'}<br/>
              Citations: ${d.linkData.citations || 0}<br/>
              Papers: ${d.linkData.papers || 0}<br/>
              ${edgeStrength !== "none" ? `<br/><strong>Selected Strength:</strong> ${d.linkData.value.toFixed(2)}` : ''}
            `);
          }
        })
        .on("mousemove", function (event) {
          tooltip
            .style("left", event.pageX + 10 + "px")
            .style("top", event.pageY - 10 + "px");
        })
        .on("mouseout", function () {
          tooltip.style("opacity", 0);
        });
    });


    // Tick handler
    simulation.on("tick", () => {
      // Update bridge link positions (with matrix anchor support)
      linkEl.attr("d", (d: any) => {
        const source = d.source;
        const target = d.target;

        let x1: number, y1: number, x2: number, y2: number;

        // Calculate source position
        if ('authors' in source && d.originalSource) {
          const anchor = getMatrixAnchor(source, d.originalSource);
          x1 = anchor.x;
          y1 = anchor.y;
        } else {
          x1 = source.x!;
          y1 = source.y!;
        }

        // Calculate target position
        if ('authors' in target && d.originalTarget) {
          const anchor = getMatrixAnchor(target, d.originalTarget);
          x2 = anchor.x;
          y2 = anchor.y;
        } else {
          x2 = target.x!;
          y2 = target.y!;
        }

        return `M${x1},${y1} L${x2},${y2}`;
      });

      // Update regular node positions
      nodeGroup.attr("transform", (d) => `translate(${d.x},${d.y})`);

      // Update matrix positions
      matrixGroup.attr("transform", (d) => `translate(${d.x! - d.width / 2 - labelPadding}, ${d.y! - d.height / 2})`);
    });

    // Drag handlers — use fx/fy for proper D3 force pinning
    let dragMoved = false;

    function dragstarted(event: any, d: Node) {
      dragMoved = false;
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event: any, d: Node) {
      dragMoved = true;
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragended(event: any, d: Node) {
      if (!event.active) simulation.alphaTarget(0);
      if (dragMoved) {
        // Pin node in place
        pinnedSet.add(d.id);
        setPinVisual(d.id, true);
      } else {
        // Was just a click — release so click handler can fire
        if (!pinnedSet.has(d.id)) {
          d.fx = null;
          d.fy = null;
        }
      }
    }

    // Drag handlers for matrix nodes
    function dragstartedMatrix(event: any, d: MatrixNode) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function draggedMatrix(event: any, d: MatrixNode) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragendedMatrix(event: any, d: MatrixNode) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
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
    domainAuthorIds,
    domain,
    maxAuthors,
    maxUniversities,
    useSizeEncoding,
    edgeStrength,
    canadianFilter,
    selectedInstitution,
    selectedNode,
    matrixUniversities,
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
            >
              <div
                className={styles.colorBox}
                style={{ backgroundColor: uni.color }}
                onClick={() =>
                  setSelectedInstitution(
                    selectedInstitution === uni.name ? null : uni.name
                  )
                }
              />
              <span
                className={styles.universityName}
                onClick={() =>
                  setSelectedInstitution(
                    selectedInstitution === uni.name ? null : uni.name
                  )
                }
              >
                {uni.name}
              </span>
              <button
                className={`${styles.matrixToggle} ${
                  matrixUniversities.has(uni.name) ? styles.matrixActive : ""
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleMatrixMode(uni.name);
                }}
                title={matrixUniversities.has(uni.name) ? "Switch to node view" : "Switch to matrix view"}
              >
                {matrixUniversities.has(uni.name) ? "▦" : "●"}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
