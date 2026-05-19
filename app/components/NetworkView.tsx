/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as d3 from "d3";
import styles from "./NetworkView.module.css";
import { visualPalette, getTextureStrokeColor } from "../lib/visualPalette";
import NetworkUniversityView from "./NetworkUniversityView";
import {
  createTooltip,
  createTexturePatterns,
  getFillForUniversity,
  createUniversityVisualMapping,
} from "./shared";

// Keep local types for NetworkView-specific structures
interface Institution {
  id: string;
  display_name: string;
  label_name: string;
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
  labelPadding?: number;
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

interface InstitutionProp {
  id: string;
  name: string;
  label_name?: string;
  display_name: string;
  country_code: string;
  type: string;
  ICI: number;
  totalACI?: number;
}

interface NetworkViewProps {
  maxAuthors: number;
  maxUniversities: number;
  canadianFilter: "full" | "full_partial";
  dataPath: string;
  onViewModeChange?: (viewMode: "author" | "university") => void;
  publicationsMin: number | null;
  publicationsMax: number | null;
  citationsMin: number | null;
  citationsMax: number | null;
  selectedUniversities: Set<string>;
  universityColorMap: Map<string, typeof visualPalette[0]>;
  institutions: InstitutionProp[];
}

export default function NetworkView({
  maxAuthors,
  maxUniversities,
  institutions,
  canadianFilter,
  dataPath,
  onViewModeChange,
  publicationsMin,
  publicationsMax,
  citationsMin,
  citationsMax,
  selectedUniversities,
  universityColorMap,
}: NetworkViewProps) {
  const router = useRouter();
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<d3.Selection<
    HTMLDivElement,
    unknown,
    HTMLElement,
    unknown
  > | null>(null);

  const [viewMode, setViewMode] = useState<"author" | "university">("author");
  const [authorships, setAuthorships] = useState<Authorship[]>([]);
  const [useSizeEncoding, setUseSizeEncoding] = useState<boolean>(true);
  const [nodeLabelMode, setNodeLabelMode] = useState<"major" | "all" | "none">(
    maxAuthors > 40 ? "major" : "all",
  );
  const [edgeStrength, setEdgeStrength] =
    useState<EdgeStrengthMetric>("total_fwci");
  const [selectedInstitution, setSelectedInstitution] = useState<string | null>(
    null,
  );
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [universities, setUniversities] = useState<
    Array<{ name: string; color: string; texture: string; luminance: "dark" | "light"; totalACI: number; count: number }>
  >([]);
  const [matrixUniversities, setMatrixUniversities] = useState<Set<string>>(
    new Set(),
  );

  // State for university view
  const [universityViewUniversities, setUniversityViewUniversities] = useState<
    Array<{ name: string; color: string; texture?: string; luminance?: "dark" | "light"; totalACI: number; count: number }>
  >([]);
  const [universityLabelMode, setUniversityLabelMode] = useState<"major" | "all" | "none">(
    maxUniversities > 20 ? "major" : "all"
  );
  const [matrixUniversity, setMatrixUniversity] = useState<string | null>(null);

  // Update university label mode when maxUniversities crosses the 20 threshold
  useEffect(() => {
    if (maxUniversities > 20) {
      setUniversityLabelMode("major");
    } else {
      setUniversityLabelMode("all");
    }
  }, [maxUniversities]);

  // Toggle matrix mode for a university
  const toggleUniversityMatrix = (universityName: string) => {
    setMatrixUniversity((prev) => (prev === universityName ? null : universityName));
  };

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
    if (maxAuthors > 40) {
      setNodeLabelMode("major");
    } else {
      setNodeLabelMode("all");
    }
  }, [maxAuthors]);

  useEffect(() => {
    fetch(`${dataPath}/authorships_canadian.json`)
      .then((res) => res.json())
      .then((data: Authorship[]) => setAuthorships(data));
  }, [dataPath]);

  useEffect(() => {
    // Skip author view rendering when in university mode
    if (viewMode === "university") return;

    if (!svgRef.current || authorships.length === 0) return;

    d3.select(svgRef.current).selectAll("*").remove();

    const filteredAuthorships = authorships.filter((a) => {
      if (canadianFilter === "full") return a.canadian_status === "full";
      return a.canadian_status === "full" || a.canadian_status === "partial";
    });

    const authorMap = new Map<string, Node>();
    filteredAuthorships.forEach((authorship) => {
      authorship.ids.forEach((authorId, idx) => {
        const fieldPapers = authorship.field_papers[idx];
        const fieldCitations = authorship.field_citations[idx];

        // Apply publications and citations filters
        if (publicationsMin !== null && fieldPapers < publicationsMin) return;
        if (publicationsMax !== null && fieldPapers > publicationsMax) return;
        if (citationsMin !== null && fieldCitations < citationsMin) return;
        if (citationsMax !== null && fieldCitations > citationsMax) return;

        // Apply university filter
        const institution = authorship.last_known_institutions[idx];
        if (selectedUniversities.size > 0) {
          if (!institution || !selectedUniversities.has(institution.display_name)) {
            return;
          }
        }

        if (!authorMap.has(authorId)) {
          authorMap.set(authorId, {
            id: authorId,
            name: authorship.names[idx],
            aci: authorship.ACIs[idx],
            field_citations: fieldCitations,
            field_papers: fieldPapers,
            institution:
              institution?.label_name || institution?.display_name || "Unknown",
            institutionId: institution?.id || "unknown",
            cluster: 0,
            linkCount: 0,
          });
        }
      });
    });

    // Group authors by institution
    const institutionGroups = new Map<string, Node[]>();
    authorMap.forEach((author) => {
      if (!institutionGroups.has(author.institution)) {
        institutionGroups.set(author.institution, []);
      }
      institutionGroups.get(author.institution)!.push(author);
    });

    // Use institutions list (already sorted by global totalACI from parent)
    // Map to include author information
    const topUniversities = institutions
      .map((inst) => {
        const instName = inst.label_name || inst.name;
        const instAuthors = institutionGroups.get(instName) || institutionGroups.get(inst.name) || [];
        return {
          name: instName,
          fullName: inst.name,
          authors: instAuthors,
        };
      })
      .filter(uni => uni.authors.length > 0) // Only keep universities with authors
      .slice(0, maxUniversities);

    const topInstitutionNames = new Set(topUniversities.map((u) => u.name));

    const institutionToCluster = new Map<string, number>();
    topUniversities.forEach((uni, idx) => {
      institutionToCluster.set(uni.name, idx);
    });

    const filteredAuthors = Array.from(authorMap.values())
      .filter((author) => topInstitutionNames.has(author.institution))
      .sort((a, b) => b.aci - a.aci);

    filteredAuthors.forEach((author) => {
      author.cluster = institutionToCluster.get(author.institution) || 0;
    });

    const displayAuthors = filteredAuthors.slice(0, maxAuthors);
    const displayAuthorIds = new Set(displayAuthors.map((a) => a.id));

    const links: Link[] = [];
    const linkMap = new Map<string, Link>();
    filteredAuthorships.forEach((authorship) => {
      const authorIds = authorship.ids.filter((id) => displayAuthorIds.has(id));
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
            existing.citations =
              (existing.citations || 0) + authorship.total_cited_by_count;
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

    const cellSize = 15;
    const labelPadding = 50;

    const matrixNodes: MatrixNode[] = [];
    const regularNodes: Node[] = [];
    const authorToMatrix = new Map<string, MatrixNode>();

    displayAuthors.forEach((author) => {
      if (matrixUniversities.has(author.institution)) {
        let matrixNode = matrixNodes.find(
          (m) => m.institution === author.institution,
        );
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

    const internalLinks: Link[] = [];
    const externalLinks: Link[] = [];
    const authorIdToNode = new Map<string, Node>();
    displayAuthors.forEach((author) => authorIdToNode.set(author.id, author));

    links.forEach((link) => {
      const sourceId =
        typeof link.source === "string" ? link.source : link.source.id;
      const targetId =
        typeof link.target === "string" ? link.target : link.target.id;

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

    const topInstArray = Array.from(topInstitutionNames);

    // Map each university to its visual variable using persistent color mapping
    // Using shared utility to create visual mapping
    const universityVisuals = createUniversityVisualMapping(
      topInstArray.map(name => ({ name })),
      universityColorMap
    );

    // Helper function to get fill value (solid color or pattern URL)
    // Using shared utility with local closure
    const getUniversityFill = (universityName: string): string =>
      getFillForUniversity(universityName, universityVisuals);

    const displayedUniversityCounts = new Map<string, number>();
    displayAuthors.forEach((author) => {
      displayedUniversityCounts.set(
        author.institution,
        (displayedUniversityCounts.get(author.institution) || 0) + 1,
      );
    });

    const uniList = topUniversities.map((uni) => ({
      name: uni.name,
      color: universityVisuals.get(uni.name)?.color || "#808080",
      texture: universityVisuals.get(uni.name)?.texture || "none",
      luminance: universityVisuals.get(uni.name)?.luminance || "dark",
      totalACI: uni.authors.reduce((sum, a) => sum + a.aci, 0),
      count: displayedUniversityCounts.get(uni.name) || 0,
    }));
    setUniversities(uniList);

    // --- Layout Rectangular Logic ---
    const containerWidth = svgRef.current.parentElement?.clientWidth || 1200;
    const containerHeight = svgRef.current.parentElement?.clientHeight || 800;
    const width = containerWidth;
    const height = containerHeight;
    const cx = width / 2;
    const cy = height / 2;

    const numClusters = topUniversities.length;
    const clusterCentroids: { x: number; y: number }[] = [];

    // Use elliptical radii to fit rectangular canvas
    const radiusX = width * 0.38;
    const radiusY = height * 0.32;

    for (let i = 0; i < numClusters; i++) {
      const angle = (2 * Math.PI * i) / numClusters - Math.PI / 2;
      clusterCentroids.push({
        x: cx + radiusX * Math.cos(angle),
        y: cy + radiusY * Math.sin(angle),
      });
    }

    regularNodes.forEach((d) => {
      const centroid = clusterCentroids[d.cluster];
      const jitter = 30 + Math.random() * 40;
      const angle = Math.random() * 2 * Math.PI;
      d.x = centroid.x + jitter * Math.cos(angle);
      d.y = centroid.y + jitter * Math.sin(angle);
    });

    matrixNodes.forEach((d) => {
      const centroid = clusterCentroids[d.cluster];
      const jitter = 40 + Math.random() * 50;
      const angle = Math.random() * 2 * Math.PI;
      d.x = centroid.x + jitter * Math.cos(angle);
      d.y = centroid.y + jitter * Math.sin(angle);
    });

    const sizeScale = d3
      .scaleSqrt()
      .domain([0, d3.max(displayAuthors, (d) => d.aci) || 1])
      .range([5, 22]);

    const linkWidthScale = d3
      .scaleLinear()
      .domain([0, d3.max(links, (d) => d.value) || 1])
      .range([0.5, 4]);

    const linkOpacityScale = d3
      .scaleLinear()
      .domain([0, d3.max(links, (d) => d.value) || 1])
      .range([0.15, 0.6]);

    const svgEl = d3
      .select(svgRef.current)
      .attr("width", containerWidth)
      .attr("height", containerHeight);

    // Definitions: texture patterns - using shared utility
    const defs = svgEl.append("defs");
    createTexturePatterns(defs, universityVisuals);

    const g = svgEl.append("g");

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 6])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });

    svgEl.call(zoom);

    svgEl.on("click", () => {
      setSelectedNode(null);
    });

    type SimulationNode = Node | MatrixNode;
    const allNodes: SimulationNode[] = [...regularNodes, ...matrixNodes];

    // ────────────────────────────────────────────────────────────────
    // Force 1: University Centroid Gravitational Pull
    // Formula: F_centroid = 0.25 × α × (C - P)
    // where C = centroid position, P = node position, α = cooling factor
    // ────────────────────────────────────────────────────────────────
    function clusterForce(alpha: number) {
      const strength = 0.25; // Slightly increased for tighter clusters
      allNodes.forEach((d) => {
        const centroid = clusterCentroids[d.cluster];
        if (centroid) {
          d.vx = (d.vx || 0) + (centroid.x - (d.x || 0)) * strength * alpha;
          d.vy = (d.vy || 0) + (centroid.y - (d.y || 0)) * strength * alpha;
        }
      });
    }

    // New Box Force to prevent exiting the screen
    // function boxForce() {
    //     const margin = 60;
    //     allNodes.forEach(d => {
    //         const nodeW = 'authors' in d ? d.width : 20;
    //         const nodeH = 'authors' in d ? d.height : 20;

    //         if (d.x! < margin) d.vx! += (margin - d.x!) * 0.1;
    //         if (d.x! > width - margin - nodeW) d.vx! -= (d.x! - (width - margin - nodeW)) * 0.1;
    //         if (d.y! < margin) d.vy! += (margin - d.y!) * 0.1;
    //         if (d.y! > height - margin - nodeH) d.vy! -= (d.y! - (height - margin - nodeH)) * 0.1;
    //     });
    // }

    // Rounded Rectangle Force (Super-ellipse)
    function boxForce() {
      const margin = 70;
      const rx = width / 2 - margin;
      const ry = height / 2 - margin;
      const exponent = 4; // Higher = sharper corners (closer to a true rectangle)

      allNodes.forEach((d) => {
        const dx = Math.abs(d.x! - cx);
        const dy = Math.abs(d.y! - cy);

        // Super-ellipse formula: (|x|/rx)^n + (|y|/ry)^n <= 1
        const distance =
          Math.pow(dx / rx, exponent) + Math.pow(dy / ry, exponent);

        if (distance > 1) {
          // Calculate the scaling factor to bring the node back to the boundary
          const scale = Math.pow(distance, -1 / exponent);
          const targetX = cx + (d.x! - cx) * scale;
          const targetY = cy + (d.y! - cy) * scale;

          const pullStrength = 0.2; // Slightly higher to keep them out of the "dead zones"
          d.vx! += (targetX - d.x!) * pullStrength;
          d.vy! += (targetY - d.y!) * pullStrength;
        }
      });
    }

    // ────────────────────────────────────────────────────────────────
    // Force 2: Connection Pull (Link Force)
    // Formula: F_link = s × (d_ideal - d_actual)
    // where:
    //   d_ideal = 120 × max(0.6, 1 - value/100)  [adaptive ideal distance]
    //   s = strength = { 3×power  if cross-university
    //                  { power    if same-university
    //   power = edgeStrength === "none" ? 0.3 : min(0.5, value/100)
    // ────────────────────────────────────────────────────────────────
    const simulation = d3
      .forceSimulation<SimulationNode>(allNodes)
      .force(
        "link",
        d3
    .forceLink<SimulationNode, Link>(externalLinks)
    .id((d: any) => d.id)
    // 1. Reduce distance for strong links
    .distance((d: any) => {
      const baseDistance = 120;
      // The stronger the connection, the shorter the "ideal" distance
      const strengthFactor = edgeStrength === "none" ? 1 : Math.max(0.6, 1 - (d.value / 100));
      return baseDistance * strengthFactor;
    })
    // 2. Significantly increase strength for cross-university links
    .strength((d: any) => {
      const sourceInst = "authors" in d.source ? d.source.institution : d.source.institution;
      const targetInst = "authors" in d.target ? d.target.institution : d.target.institution;

      // Base link strength
      const power = edgeStrength === "none" ? 0.3 : Math.min(0.5, d.value / 100);

      // If external, boost the power significantly so it can fight the cluster force
      return sourceInst !== targetInst ? power * 3 : power;
    }),
)
      .force("charge", d3.forceManyBody().strength(-500).distanceMax(150))
      .force("x", d3.forceX(cx).strength(0.015)) // Keep slightly horizontal
      .force("y", d3.forceY(cy).strength(0.04)) // Stronger vertical pull to combat drift
      .force("center", d3.forceCenter(cx, cy).strength(0.2))
      .force("cluster", clusterForce as any)
      .force("bounds", boxForce)
      .force(
        "collision",
        d3
          .forceCollide<SimulationNode>()
          .radius((d: any) => {
            if ("authors" in d) {
              const visualWidth = d.width + (d.labelPadding || labelPadding);
              return Math.max(visualWidth, d.height) / 2 + 25;
            } else {
              return (useSizeEncoding ? sizeScale(d.aci) : 10) + 4;
            }
          })
          .strength(0.8),
      )
      .alphaDecay(0.025)
      .velocityDecay(0.55); // Increased friction to stop the drift

    if (!tooltipRef.current) {
      tooltipRef.current = createTooltip("network-author-tooltip")
        .style("font-family", "Outfit, system-ui, sans-serif");
    }
    const tooltip = tooltipRef.current;

    const getMatrixAnchor = (matrixNode: MatrixNode, author: Node) => {
      const authorIndex = matrixNode.authors.findIndex(
        (a) => a.id === author.id,
      );
      if (authorIndex === -1) return { x: matrixNode.x!, y: matrixNode.y! };

      const halfHeight = matrixNode.height / 2;
      const rowOffset = (authorIndex + 0.5) * cellSize;
      const anchorX = matrixNode.x! - matrixNode.width / 2;
      const anchorY = matrixNode.y! - halfHeight + rowOffset;

      return { x: anchorX, y: anchorY };
    };

    const linkEl = g
      .append("g")
      .attr("class", "links")
      .selectAll("path")
      .data(externalLinks)
      .enter()
      .append("path")
      .attr("stroke", (d: any) => {
        const sourceInst =
          "authors" in d.source ? d.source.institution : d.source.institution;
        const targetInst =
          "authors" in d.target ? d.target.institution : d.target.institution;
        if (sourceInst === targetInst) {
          const visual = universityVisuals.get(sourceInst);
          return visual?.color || "#9aa0b8";
        }
        return "#9aa0b8";
      })
      .attr("stroke-opacity", (d: any) => {
        const baseOpacity =
          edgeStrength === "none" ? 0.25 : linkOpacityScale(d.value);
        if (!selectedInstitution) return baseOpacity;
        const sourceInst =
          "authors" in d.source ? d.source.institution : d.source.institution;
        const targetInst =
          "authors" in d.target ? d.target.institution : d.target.institution;
        if (
          sourceInst === selectedInstitution ||
          targetInst === selectedInstitution
        )
          return baseOpacity;
        return baseOpacity * 0.2;
      })
      .attr("stroke-width", (d) =>
        edgeStrength === "none" ? 1 : linkWidthScale(d.value),
      )
      .attr("fill", "none");

    const pinnedSet = new Set<string>();
    const pinnedMatrixSet = new Set<string>();

    function setPinVisual(id: string, pinned: boolean) {
      const grp = nodeGroup.filter((d) => d.id === id);
      grp
        .select<SVGCircleElement>("circle.node-circle")
        .attr("stroke", pinned ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.5)")
        .attr("stroke-width", pinned ? 2 : 0.8);
      grp
        .select<SVGCircleElement>("circle.pin-dot")
        .style("opacity", pinned ? 1 : 0);
    }

    function setPinVisualMatrix(id: string, pinned: boolean) {
      const grp = matrixGroup.filter((d) => d.id === id);
      grp
        .select<SVGRectElement>("rect.matrix-bg")
        .attr("stroke-width", pinned ? 5 : 3)
        .attr("stroke-dasharray", pinned ? "5,3" : "0");
    }

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
          .on("end", dragended),
      );

    nodeGroup
      .append("circle")
      .attr("class", "node-circle")
      .attr("r", (d) => (useSizeEncoding ? sizeScale(d.aci) : 10))
      .attr("fill", (d) => getUniversityFill(d.institution))
      .attr("stroke", "rgba(255,255,255,0.5)")
      .attr("stroke-width", 0.8)
      .style("opacity", (d) => {
        if (!selectedInstitution) return 0.85;
        return d.institution === selectedInstitution ? 1.0 : 0.15;
      });

    nodeGroup
      .append("circle")
      .attr("class", "pin-dot")
      .attr("r", 2.8)
      .attr("fill", "white")
      .attr("stroke", "rgba(0,0,0,0.55)")
      .attr("stroke-width", 1)
      .style("opacity", 0)
      .style("pointer-events", "none");

    const top20PercentCount = Math.ceil(regularNodes.length * 0.2);
    const top20PercentIds = new Set(
      regularNodes.slice(0, top20PercentCount).map((n) => n.id),
    );

    nodeGroup
      .append("text")
      .text((d) => {
        if (d.linkCount === 0 && d.aci < 5) return "";
        const parts = d.name.split(" ");
        const label = parts.length >= 2 ? parts[parts.length - 1] : d.name;
        return label.length > 12 ? label.slice(0, 12) + "..." : label;
      })
      .attr("dy", (d) => (useSizeEncoding ? sizeScale(d.aci) : 10) + 12)
      .attr("text-anchor", "middle")
      .style("font-size", "10px")
      .style("fill", "rgba(0,0,0,0.55)")
      .style("pointer-events", "none")
      .style("font-weight", "500")
      .style("opacity", (d) => {
        if (nodeLabelMode === "none") return 0;
        if (nodeLabelMode === "major" && !top20PercentIds.has(d.id)) return 0;
        if (!selectedInstitution) return 0.8;
        return d.institution === selectedInstitution ? 1.0 : 0.1;
      });

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
            `Publications: ${d.field_papers}<br/>` +
            `Citations: ${d.field_citations}<br/>` +
            `Citation Impact: ${d.aci.toFixed(2)}<br/>` +
            `Connection: ${d.linkCount}<br/>` +
            `<span style="font-size:12px;opacity:0.6;text-decoration:underline;">${isPinned ? "Right-click to unpin" : "Click to view profile"}</span>`,
          );
      })
      .on("mousemove", (event) => {
        tooltip
          .style("left", event.pageX + 10 + "px")
          .style("top", event.pageY - 10 + "px");
      })
      .on("mouseout", function (_event, d) {
        const isPinned = pinnedSet.has(d.id);
        d3.select(this)
          .select("circle.node-circle")
          .attr("stroke-width", isPinned ? 2 : 0.8)
          .attr(
            "stroke",
            isPinned ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.5)",
          );
        tooltip.style("opacity", 0);
      })
      .on("click", function (event, d) {
        event.stopPropagation();
        setSelectedNode((prev) => (prev === d.id ? null : d.id));
        const shortId = d.id.replace("https://openalex.org/", "");
        router.push(`/author?id=${shortId}&from=network&dataPath=${encodeURIComponent(dataPath)}`);
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
          .on("end", dragendedMatrix),
      )
      .on("contextmenu", function (event, d) {
        event.preventDefault();
        event.stopPropagation();
        if (!pinnedMatrixSet.has(d.id)) return;
        d.fx = null;
        d.fy = null;
        pinnedMatrixSet.delete(d.id);
        setPinVisualMatrix(d.id, false);
        simulation.alpha(0.15).restart();
      });

    matrixGroup
      .append("rect")
      .attr("class", "matrix-bg")
      .attr("x", labelPadding)
      .attr("width", (d) => d.width)
      .attr("height", (d) => d.height)
      .attr("fill", (d) => {
        const visual = universityVisuals.get(d.institution);
        const color = d3.color(visual?.color || "#808080");
        return color ? color.copy({ opacity: 0.1 }).toString() : "white";
      })
      .attr("stroke", (d) => {
        const visual = universityVisuals.get(d.institution);
        return visual?.color || "#808080";
      })
      .attr("stroke-width", 3)
      .attr("rx", 4)
      .attr("ry", 4);

    matrixGroup.each(function (matrixNode) {
      const matrix = d3.select(this);
      const getLastName = (name: string) => {
        const parts = name.split(" ");
        return parts.length >= 2 ? parts[parts.length - 1] : name;
      };

      // Build adjacency information for seriation
      const authorLinks = new Map<string, Set<string>>();
      matrixNode.authors.forEach((author) => {
        authorLinks.set(author.id, new Set());
      });

      internalLinks.forEach((link) => {
        const srcId = typeof link.source === "string" ? link.source : link.source.id;
        const tgtId = typeof link.target === "string" ? link.target : link.target.id;

        if (authorLinks.has(srcId) && authorLinks.has(tgtId)) {
          authorLinks.get(srcId)!.add(tgtId);
          authorLinks.get(tgtId)!.add(srcId);
        }
      });

      // Greedy seriation algorithm to reveal cliques
      const ordered: Node[] = [];
      const remaining = new Set(matrixNode.authors.map(a => a.id));

      let currentId = matrixNode.authors.reduce((max, author) =>
        (authorLinks.get(author.id)?.size || 0) > (authorLinks.get(max.id)?.size || 0) ? author : max
      ).id;

      while (remaining.size > 0) {
        if (!remaining.has(currentId)) {
          const remainingAuthors = matrixNode.authors.filter(a => remaining.has(a.id));
          if (remainingAuthors.length === 0) break;
          currentId = remainingAuthors.reduce((max, author) =>
            (authorLinks.get(author.id)?.size || 0) > (authorLinks.get(max.id)?.size || 0) ? author : max
          ).id;
        }

        const current = matrixNode.authors.find(a => a.id === currentId)!;
        ordered.push(current);
        remaining.delete(currentId);

        let nextId: string | null = null;
        let maxShared = -1;

        remaining.forEach(candidateId => {
          const currentNeighbors = authorLinks.get(currentId) || new Set();
          const candidateNeighbors = authorLinks.get(candidateId) || new Set();

          let shared = currentNeighbors.has(candidateId) ? 100 : 0;
          currentNeighbors.forEach(n => {
            if (candidateNeighbors.has(n)) shared++;
          });

          if (shared > maxShared) {
            maxShared = shared;
            nextId = candidateId;
          }
        });

        currentId = nextId || currentId;
      }

      const authors = ordered;

      const maxLabelWidth = Math.max(
        ...authors.map(
          (d) =>
            (getLastName(d.name).length > 12
              ? 12
              : getLastName(d.name).length) * 6,
        ),
      );
      const dynamicLabelPadding = maxLabelWidth + 10;
      matrixNode.labelPadding = dynamicLabelPadding;
      matrix.select("rect.matrix-bg").attr("x", dynamicLabelPadding);

      matrix
        .selectAll("rect.label-bg")
        .data(authors)
        .enter()
        .append("rect")
        .attr("class", "label-bg")
        .attr("x", 0)
        .attr("y", (_d, i) => i * cellSize)
        .attr("width", dynamicLabelPadding - 5)
        .attr("height", cellSize)
        .attr("fill", "white")
        .attr("opacity", 0.5)
        .style("pointer-events", "none");

      matrix
        .selectAll("text.row-label")
        .data(authors)
        .enter()
        .append("text")
        .attr("x", dynamicLabelPadding - 5)
        .attr("y", (_d, i) => i * cellSize + cellSize / 2)
        .attr("text-anchor", "end")
        .attr("dominant-baseline", "middle")
        .attr("font-size", "10px")
        .style("fill", "rgba(0,0,0,0.75)")
        .text((d) => {
          const ln = getLastName(d.name);
          return ln.length > 12 ? ln.slice(0, 12) + "..." : ln;
        });

      matrix
        .append("rect")
        .attr("class", "col-labels-unified-bg")
        // Start at the first column
        .attr("x", dynamicLabelPadding)
        // Position it above the matrix cells
        .attr("y", -dynamicLabelPadding + 5)
        // Width = (number of authors * cell size) + your extra extension pixels
        .attr("width", authors.length * cellSize + 15)
        .attr("height", dynamicLabelPadding - 7)
        .attr("fill", "white")
        .attr("opacity", 0.5)
        .style("pointer-events", "none");

      // 2. Draw your labels as usual (without individual backgrounds)
      matrix.selectAll("text.col-label").data(authors).enter();

      matrix
        .selectAll("text.col-label")
        .data(authors)
        .enter()
        .append("text")
        .attr("x", (_d, i) => dynamicLabelPadding + i * cellSize + cellSize / 2)
        .attr("y", -5)
        .attr("text-anchor", "start")
        .attr("dominant-baseline", "middle")
        .attr("font-size", "10px")
        .style("fill", "rgba(0,0,0,0.75)")
        .attr(
          "transform",
          (_d, i) =>
            `rotate(-60, ${dynamicLabelPadding + i * cellSize + cellSize / 2}, -5)`,
        )
        .text((d) => {
          const ln = getLastName(d.name);
          return ln.length > 12 ? ln.slice(0, 12) + "..." : ln;
        });

      //  // Add background rectangles for column labels
      // matrix
      //   .selectAll("rect.col-label-bg")
      //   .data(authors)
      //   .enter()
      //   .append("rect")
      //   .attr("class", "col-label-bg")
      //   .attr("x", (_d, i) => dynamicLabelPadding + i * cellSize)
      //   .attr("y", -dynamicLabelPadding + 5)
      //   .attr("width", cellSize + 20)
      //   .attr("height", dynamicLabelPadding - 5)
      //   .attr("fill", "white")
      //   .attr("opacity", 0.6)
      //   .style("pointer-events", "none");

      // // Add column labels (rotated)
      // matrix
      //   .selectAll("text.col-label")
      //   .data(authors)
      //   .enter()
      //   .append("text")
      //   .attr("class", "col-label")
      //   .attr("x", (_d, i) => dynamicLabelPadding + i * cellSize + cellSize / 2)
      //   .attr("y", -5)
      //   .attr("text-anchor", "start")
      //   .attr("dominant-baseline", "middle")
      //   .attr("font-size", "10px")
      //   .style("fill", "rgba(0,0,0,0.75)")
      //   .attr("font-weight", "500")
      //   .attr("transform", (_d, i) => `rotate(-60, ${dynamicLabelPadding + i * cellSize + cellSize / 2}, -5)`)
      //   .text(getLabelText)
      //   .style("pointer-events", "none");

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
              const srcId =
                typeof l.source === "string" ? l.source : l.source.id;
              const tgtId =
                typeof l.target === "string" ? l.target : l.target.id;
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

          matrixData.push({
            row: i,
            col: j,
            value,
            rowAuthor,
            colAuthor,
            linkData,
          });
        });
      });

      // Create color scale for matrix cells based on edge strength
      const matrixConnectionValues = matrixData
        .filter((d) => d.value > 0 && d.row !== d.col && d.linkData)
        .map((d) => {
          if (edgeStrength === "none") return 1;
          if (edgeStrength === "total_fwci") return d.linkData!.fwci || 0;
          if (edgeStrength === "total_cited_by_count")
            return d.linkData!.citations || 0;
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
        .attr("x", (d) => dynamicLabelPadding + d.col * cellSize)
        .attr("y", (d) => d.row * cellSize)
        .attr("width", cellSize - 1)
        .attr("height", cellSize - 1)
        .attr("fill", (d) => {
          if (d.row === d.col) {
            const visual = universityVisuals.get(matrixNode.institution);
            return visual?.color || "#808080";
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
            return matrixNode.institution === selectedInstitution
              ? aciOpacityScale(d.rowAuthor.aci)
              : 0.2;
          } else {
            // Connection cells
            if (!selectedInstitution) return 0.6;
            return matrixNode.institution === selectedInstitution ? 1.0 : 0.2;
          }
        })
        .on("mouseover", function (event, d) {
          if (d.row === d.col) {
            // Find author's total connections and metrics
            const authorNode = displayAuthors.find(
              (a) => a.id === d.rowAuthor.id,
            );
            const authorConnections = authorNode?.linkCount || 0;

            tooltip.style("opacity", 1).html(`
              <strong>${d.rowAuthor.name}</strong><br/>
              ${d.rowAuthor.institution}<br/>
              <br/>
              <strong>Metrics:</strong><br/>
              ACI: ${d.rowAuthor.aci.toFixed(2)}<br/>
              Connections: ${authorConnections}<br/>
              Citations: ${authorNode?.field_citations || "-"}<br/>
              Papers: ${authorNode?.field_papers || "-"}<br/>
            `);
          } else if (d.value > 0 && d.linkData) {
            tooltip.style("opacity", 1).html(`
              <strong>Collaboration</strong><br/>
              ${d.rowAuthor.name}<br/>
              ↔<br/>
              ${d.colAuthor.name}<br/>
              <br/>
              <strong>Metrics:</strong><br/>
              FWCI: ${d.linkData.fwci?.toFixed(2) || "N/A"}<br/>
              Citations: ${d.linkData.citations || 0}<br/>
              Papers: ${d.linkData.papers || 0}<br/>
              ${edgeStrength !== "none" ? `<br/><strong>Selected Strength:</strong> ${d.linkData.value.toFixed(2)}` : ""}
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


    

    simulation.on("tick", () => {
      linkEl.attr("d", (d: any) => {
        const s = d.source;
        const t = d.target;
        let x1, y1, x2, y2;
        if ("authors" in s && d.originalSource) {
          const a = getMatrixAnchor(s, d.originalSource);
          x1 = a.x;
          y1 = a.y;
        } else {
          x1 = s.x!;
          y1 = s.y!;
        }
        if ("authors" in t && d.originalTarget) {
          const a = getMatrixAnchor(t, d.originalTarget);
          x2 = a.x;
          y2 = a.y;
        } else {
          x2 = t.x!;
          y2 = t.y!;
        }
        return `M${x1},${y1} L${x2},${y2}`;
      });

      nodeGroup.attr("transform", (d) => `translate(${d.x},${d.y})`);
      matrixGroup.attr(
        "transform",
        (d) =>
          `translate(${d.x! - d.width / 2 - (d.labelPadding || labelPadding)}, ${d.y! - d.height / 2})`,
      );
    });

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
        pinnedSet.add(d.id);
        setPinVisual(d.id, true);
      } else if (!pinnedSet.has(d.id)) {
        d.fx = null;
        d.fy = null;
      }
    }

    let dragMovedMatrix = false;
    function dragstartedMatrix(event: any, d: MatrixNode) {
      dragMovedMatrix = false;
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }
    function draggedMatrix(event: any, d: MatrixNode) {
      dragMovedMatrix = true;
      d.fx = event.x;
      d.fy = event.y;
    }
    function dragendedMatrix(event: any, d: MatrixNode) {
      if (!event.active) simulation.alphaTarget(0);
      if (dragMovedMatrix) {
        pinnedMatrixSet.add(d.id);
        setPinVisualMatrix(d.id, true);
      } else if (!pinnedMatrixSet.has(d.id)) {
        d.fx = null;
        d.fy = null;
      }
    }

    return () => {
      simulation.stop();
      if (tooltipRef.current) {
        tooltipRef.current.remove();
        tooltipRef.current = null;
      }
    };
  }, [
    viewMode,
    authorships,
    maxAuthors,
    maxUniversities,
    useSizeEncoding,
    nodeLabelMode,
    edgeStrength,
    canadianFilter,
    selectedInstitution,
    selectedNode,
    matrixUniversities,
    router,
    dataPath,
    publicationsMin,
    publicationsMax,
    citationsMin,
    citationsMax,
    selectedUniversities,
    universityColorMap,
    institutions,
  ]);

  const ViewModeToggle = () => (
    <div className={styles.viewModeToggle}>
      <button
        className={`${styles.viewModeButton} ${viewMode === "author" ? styles.active : ""}`}
        onClick={() => {
          setViewMode("author");
          onViewModeChange?.("author");
        }}
      >
        Researcher
      </button>
      <button
        className={`${styles.viewModeButton} ${viewMode === "university" ? styles.active : ""}`}
        onClick={() => {
          setViewMode("university");
          onViewModeChange?.("university");
        }}
      >
        Institution
      </button>
    </div>
  );

  if (viewMode === "university") {
    return (
      <div className={styles.container}>
        <div className={styles.chartContainer}>
          <NetworkUniversityView
            maxUniversities={maxUniversities}
            canadianFilter={canadianFilter}
            dataPath={dataPath}
            edgeStrength={edgeStrength}
            selectedUniversity={selectedInstitution}
            nodeLabelMode={universityLabelMode}
            matrixUniversity={matrixUniversity}
            onUniversitiesChange={setUniversityViewUniversities}
            publicationsMin={publicationsMin}
            publicationsMax={publicationsMax}
            citationsMin={citationsMin}
            citationsMax={citationsMax}
            selectedUniversities={selectedUniversities}
            universityColorMap={universityColorMap}
            institutions={institutions}
          />
        </div>
        <div className={styles.sidebar}>
          <ViewModeToggle />
          <h3>Chart Controls</h3>
          <div className={styles.controls}>
            <div className={styles.controlGroup}>
              <label htmlFor="universityLabelMode">Node Labels:</label>
              <select
                id="universityLabelMode"
                value={universityLabelMode}
                onChange={(e) => setUniversityLabelMode(e.target.value as "major" | "all" | "none")}
                className={styles.select}
              >
                <option value="major">Show major node labels</option>
                <option value="all">Show all node labels</option>
                <option value="none">Do not show labels</option>
              </select>
            </div>
            <div className={styles.controlGroup}>
              <label htmlFor="edgeStrengthUniversity">Edge Strength:</label>
              <select
                id="edgeStrengthUniversity"
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
          </div>
          <h3>Institutions</h3>
          <div className={styles.universityList}>
            {universityViewUniversities.map((uni) => (
              <div
                key={uni.name}
                className={`${styles.universityItem} ${selectedInstitution === uni.name ? styles.selected : ""} ${uni.count === 0 ? styles.disabled : ""}`}
                title={uni.count === 0 ? "Increase number of Authors to see authors of this institution" : ""}
              >
                {(!uni.texture || uni.texture === "none") ? (
                  <div
                    className={styles.colorBox}
                    style={{ backgroundColor: uni.color }}
                    onClick={() =>
                      uni.count > 0 && setSelectedInstitution(selectedInstitution === uni.name ? null : uni.name)
                    }
                  />
                ) : (
                  <svg className={styles.colorBox} viewBox="0 0 90 90" onClick={() =>
                    uni.count > 0 && setSelectedInstitution(selectedInstitution === uni.name ? null : uni.name)
                  }>
                    <defs>
                      <pattern
                        id={`sidebar-pattern-uni-${uni.name.replace(/[^a-zA-Z0-9]/g, "-")}`}
                        patternUnits="userSpaceOnUse"
                        width="90"
                        height="90"
                      >
                        <rect width="90" height="90" fill={uni.color} />
                        {uni.texture === "vertical" && (
                          <>
                            <line x1="20" y1="0" x2="20" y2="90"
                                  stroke={getTextureStrokeColor(uni.luminance || "dark")} strokeWidth="10" />
                            <line x1="45" y1="0" x2="45" y2="90"
                                  stroke={getTextureStrokeColor(uni.luminance || "dark")} strokeWidth="10" />
                            <line x1="70" y1="0" x2="70" y2="90"
                                  stroke={getTextureStrokeColor(uni.luminance || "dark")} strokeWidth="10" />
                          </>
                        )}
                        {uni.texture === "horizontal" && (
                          <>
                            <line x1="0" y1="20" x2="90" y2="20"
                                  stroke={getTextureStrokeColor(uni.luminance || "dark")} strokeWidth="10" />
                            <line x1="0" y1="45" x2="90" y2="45"
                                  stroke={getTextureStrokeColor(uni.luminance || "dark")} strokeWidth="10" />
                            <line x1="0" y1="70" x2="90" y2="70"
                                  stroke={getTextureStrokeColor(uni.luminance || "dark")} strokeWidth="10" />
                          </>
                        )}
                        {uni.texture === "diagonal" && (
                          <>
                            <line x1="50" y1="0" x2="90" y2="40"
                                  stroke={getTextureStrokeColor(uni.luminance || "dark")} strokeWidth="10" />
                            <line x1="0" y1="0" x2="90" y2="90"
                                  stroke={getTextureStrokeColor(uni.luminance || "dark")} strokeWidth="10" />
                            <line x1="0" y1="50" x2="40" y2="90"
                                  stroke={getTextureStrokeColor(uni.luminance || "dark")} strokeWidth="10" />
                          </>
                        )}
                        {uni.texture === "dots" && (
                          <>
                            <circle cx="15" cy="15" r="7" fill={getTextureStrokeColor(uni.luminance || "dark")} />
                            <circle cx="45" cy="15" r="7" fill={getTextureStrokeColor(uni.luminance || "dark")} />
                            <circle cx="75" cy="15" r="7" fill={getTextureStrokeColor(uni.luminance || "dark")} />
                            <circle cx="15" cy="45" r="7" fill={getTextureStrokeColor(uni.luminance || "dark")} />
                            <circle cx="45" cy="45" r="7" fill={getTextureStrokeColor(uni.luminance || "dark")} />
                            <circle cx="75" cy="45" r="7" fill={getTextureStrokeColor(uni.luminance || "dark")} />
                            <circle cx="15" cy="75" r="7" fill={getTextureStrokeColor(uni.luminance || "dark")} />
                            <circle cx="45" cy="75" r="7" fill={getTextureStrokeColor(uni.luminance || "dark")} />
                            <circle cx="75" cy="75" r="7" fill={getTextureStrokeColor(uni.luminance || "dark")} />
                          </>
                        )}
                      </pattern>
                    </defs>
                    <rect
                      width="90"
                      height="90"
                      fill={`url(#sidebar-pattern-uni-${uni.name.replace(/[^a-zA-Z0-9]/g, "-")})`}
                    />
                  </svg>
                )}
                <span
                  className={styles.universityName}
                  onClick={() =>
                    uni.count > 0 && setSelectedInstitution(selectedInstitution === uni.name ? null : uni.name)
                  }
                >
                  {uni.name} ({uni.count})
                </span>
                <button
                  className={`${styles.matrixToggle} ${matrixUniversity === uni.name ? styles.matrixActive : ""}`}
                  onClick={(e) => {
                    if (uni.count > 0) {
                      e.stopPropagation();
                      toggleUniversityMatrix(uni.name);
                    }
                  }}
                  disabled={uni.count === 0}
                  title={uni.count === 0 ? "Increase number of Authors to see matrix" : (matrixUniversity === uni.name ? "Hide matrix view" : "Show matrix view")}
                >
                  ▦
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.chartContainer}>
        <svg ref={svgRef}></svg>
      </div>
      <div className={styles.sidebar}>
        <ViewModeToggle />
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
            <label htmlFor="nodeLabelMode">Node Labels:</label>
            <select
              id="nodeLabelMode"
              value={nodeLabelMode}
              onChange={(e) => setNodeLabelMode(e.target.value as any)}
              className={styles.select}
            >
              <option value="major">Show major node labels</option>
              <option value="all">Show all node labels</option>
              <option value="none">Do not show labels</option>
            </select>
          </div>
          <div className={styles.controlGroup}>
            <label htmlFor="edgeStrength">Edge Strength:</label>
            <select
              id="edgeStrength"
              value={edgeStrength}
              onChange={(e) => setEdgeStrength(e.target.value as any)}
              className={styles.select}
            >
              <option value="none">None (Equal)</option>
              <option value="total_fwci">Total FWCI</option>
              <option value="total_cited_by_count">Total Citations</option>
              <option value="total_papers">Total Papers</option>
            </select>
          </div>
        </div>
        <h3>Institutions</h3>
        <div className={styles.universityList}>
          {universities.map((uni) => (
            <div
              key={uni.name}
              className={`${styles.universityItem} ${selectedInstitution === uni.name ? styles.selected : ""} ${uni.count === 0 ? styles.disabled : ""}`}
              title={uni.count === 0 ? "Increase number of Authors to see authors of this institution" : ""}
            >
              {uni.texture === "none" ? (
                <div
                  className={styles.colorBox}
                  style={{ backgroundColor: uni.color }}
                  onClick={() =>
                    uni.count > 0 && setSelectedInstitution(
                      selectedInstitution === uni.name ? null : uni.name,
                    )
                  }
                />
              ) : (
                <svg className={styles.colorBox} viewBox="0 0 90 90" onClick={() =>
                  uni.count > 0 && setSelectedInstitution(
                    selectedInstitution === uni.name ? null : uni.name,
                  )
                }>
                  <defs>
                    <pattern
                      id={`sidebar-pattern-${uni.name.replace(/[^a-zA-Z0-9]/g, "-")}`}
                      patternUnits="userSpaceOnUse"
                      width="90"
                      height="90"
                    >
                      <rect width="90" height="90" fill={uni.color} />
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
                      {uni.texture === "diagonal" && (
                        <>
                          <line x1="50" y1="0" x2="90" y2="40"
                                stroke={getTextureStrokeColor(uni.luminance)} strokeWidth="10" />
                          <line x1="0" y1="0" x2="90" y2="90"
                                stroke={getTextureStrokeColor(uni.luminance)} strokeWidth="10" />
                          <line x1="0" y1="50" x2="40" y2="90"
                                stroke={getTextureStrokeColor(uni.luminance)} strokeWidth="10" />
                        </>
                      )}
                      {uni.texture === "dots" && (
                        <>
                          <circle cx="15" cy="15" r="7" fill={getTextureStrokeColor(uni.luminance)} />
                          <circle cx="45" cy="15" r="7" fill={getTextureStrokeColor(uni.luminance)} />
                          <circle cx="75" cy="15" r="7" fill={getTextureStrokeColor(uni.luminance)} />
                          <circle cx="15" cy="45" r="7" fill={getTextureStrokeColor(uni.luminance)} />
                          <circle cx="45" cy="45" r="7" fill={getTextureStrokeColor(uni.luminance)} />
                          <circle cx="75" cy="45" r="7" fill={getTextureStrokeColor(uni.luminance)} />
                          <circle cx="15" cy="75" r="7" fill={getTextureStrokeColor(uni.luminance)} />
                          <circle cx="45" cy="75" r="7" fill={getTextureStrokeColor(uni.luminance)} />
                          <circle cx="75" cy="75" r="7" fill={getTextureStrokeColor(uni.luminance)} />
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
              <span
                className={styles.universityName}
                onClick={() =>
                  uni.count > 0 && setSelectedInstitution(
                    selectedInstitution === uni.name ? null : uni.name,
                  )
                }
              >
                {uni.name} {uni.count > 0 ? `(${uni.count})` : ""}
              </span>
              <button
                  className={`${styles.matrixToggle} ${matrixUniversities.has(uni.name) ? styles.matrixActive : ""}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleMatrixMode(uni.name);
                  }}
                  disabled={uni.count === 0}
                  title={uni.count === 0 ? "Increase number of Authors to see matrix" : (matrixUniversities.has(uni.name) ? "Hide matrix view" : "Show matrix view")}
                >
                  ▦
                </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
