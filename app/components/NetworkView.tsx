/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as d3 from "d3";
import styles from "./NetworkView.module.css";
import { distinctColors } from "../lib/colors";

function pointInPolygon(pt: [number, number], poly: [number, number][]): boolean {
  if (poly.length < 3) return false;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}

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
  const [lassoActive, setLassoActive] = useState(false);
  const [matrixCount, setMatrixCount] = useState(0);
  const lassoRef = useRef(false);

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
      .filter((event) => !lassoRef.current)
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

    /* ── Adjacency Matrix ── */
    interface NTMatrix {
      id: string; nodeIds: string[]; adjacency: boolean[][];
      x: number; y: number; cellSize: number; size: number;
    }
    const matrices: NTMatrix[] = [];
    const matrixLayer = g.append("g");
    const lassoLayer = svgEl.append("g"); // above zoom group

    function renderMatrix(mat: NTMatrix) {
      const mg = matrixLayer.append("g")
        .attr("class", "nt-matrix")
        .attr("transform", `translate(${mat.x},${mat.y})`);

      mg.append("rect")
        .attr("width", mat.size).attr("height", mat.size)
        .attr("fill", "#f0f0ec").attr("stroke", "rgba(0,0,0,0.1)")
        .attr("stroke-width", 1).attr("rx", 4);

      const n = mat.nodeIds.length;
      for (let row = 0; row < n; row++) {
        for (let col = 0; col < n; col++) {
          const isDiag = row === col;
          const nodeColor = colorScale(
            displayAuthors.find((a) => a.id === mat.nodeIds[row])?.institution || ""
          );
          mg.append("rect")
            .attr("class", "mat-cell")
            .attr("data-row", row).attr("data-col", col)
            .attr("x", col * mat.cellSize).attr("y", row * mat.cellSize)
            .attr("width", mat.cellSize - 0.5).attr("height", mat.cellSize - 0.5)
            .attr("fill", isDiag ? nodeColor : mat.adjacency[row][col] ? "rgba(0,0,0,0.22)" : "rgba(255,255,255,0.45)")
            .attr("stroke", "rgba(0,0,0,0.04)").attr("stroke-width", 0.5);
        }
      }

      // Row labels
      mat.nodeIds.forEach((id, i) => {
        const nd = displayAuthors.find((a) => a.id === id);
        if (!nd) return;
        const lastName = nd.name.split(" ").slice(-1)[0];
        mg.append("text")
          .attr("x", -4).attr("y", i * mat.cellSize + mat.cellSize / 2)
          .attr("text-anchor", "end").attr("dominant-baseline", "middle")
          .style("font-size", "8px").style("fill", "rgba(0,0,0,0.4)")
          .style("font-family", "var(--font-geist-sans), system-ui, sans-serif")
          .text(lastName);
      });

      // Cell hover highlight
      mg.selectAll<SVGRectElement, unknown>("rect.mat-cell")
        .on("mouseover", function () {
          const r = +(this.getAttribute("data-row")!);
          const c = +(this.getAttribute("data-col")!);
          mg.selectAll<SVGRectElement, unknown>("rect.mat-cell").attr("opacity", function () {
            const tr = +(this.getAttribute("data-row")!);
            const tc = +(this.getAttribute("data-col")!);
            return tr === r || tc === c || tr === c || tc === r ? 1 : 0.25;
          });
        })
        .on("mouseout", () => mg.selectAll("rect.mat-cell").attr("opacity", 1));

      // Drag matrix
      mg.call(
        d3.drag<SVGGElement, unknown>()
          .on("drag", function (event) {
            const m = matrices.find((m) => m.id === mat.id);
            if (m) { m.x += event.dx; m.y += event.dy; }
            d3.select(this).attr("transform", `translate(${mat.x},${mat.y})`);
          })
      );

      // Double-click to dismiss
      mg.on("dblclick", () => {
        matrices.splice(matrices.indexOf(mat), 1);
        mg.remove();
        setMatrixCount(matrices.length);
      });
    }

    function createMatrix(selectedIds: string[]) {
      if (selectedIds.length < 2) return;
      const n = selectedIds.length;
      const cellSize = Math.max(14, Math.min(28, Math.floor(280 / n)));
      const size = n * cellSize;

      let cx = 0, cy = 0;
      selectedIds.forEach((id) => {
        const nd = displayAuthors.find((a) => a.id === id);
        cx += nd?.x ?? 0; cy += nd?.y ?? 0;
      });
      cx /= n; cy /= n;

      const idxMap = new Map(selectedIds.map((id, i) => [id, i]));
      const adj: boolean[][] = Array.from({ length: n }, () => Array(n).fill(false));
      links.forEach((l) => {
        const sid = typeof l.source === "string" ? l.source : (l.source as Node).id;
        const tid = typeof l.target === "string" ? l.target : (l.target as Node).id;
        if (idxMap.has(sid) && idxMap.has(tid)) {
          const i = idxMap.get(sid)!, j = idxMap.get(tid)!;
          adj[i][j] = adj[j][i] = true;
        }
      });

      const mat: NTMatrix = {
        id: `m-${Date.now()}`, nodeIds: selectedIds, adjacency: adj,
        x: cx - size / 2, y: cy - size / 2, cellSize, size,
      };
      matrices.push(mat);
      setMatrixCount(matrices.length);
      renderMatrix(mat);
    }

    /* ── Lasso ── */
    let lassoPoints: [number, number][] = [];
    let lassoPath: d3.Selection<SVGPathElement, unknown, null, undefined> | null = null;
    const lassoLine = d3.line<[number, number]>().curve(d3.curveBasisClosed);

    svgEl
      .on("mousedown.lasso", (event) => {
        if (!lassoRef.current) return;
        event.preventDefault();
        lassoPoints = [d3.pointer(event) as [number, number]];
        lassoPath = lassoLayer.append("path")
          .attr("fill", "rgba(0,0,0,0.04)")
          .attr("stroke", "rgba(0,0,0,0.25)")
          .attr("stroke-width", 1.5)
          .attr("stroke-dasharray", "5,3");
      })
      .on("mousemove.lasso", (event) => {
        if (!lassoRef.current || !lassoPath || lassoPoints.length === 0) return;
        const pt = d3.pointer(event) as [number, number];
        const last = lassoPoints[lassoPoints.length - 1];
        if (Math.hypot(pt[0] - last[0], pt[1] - last[1]) > 8) {
          lassoPoints.push(pt);
          lassoPath.attr("d", lassoLine(lassoPoints) || "");
        }
      })
      .on("mouseup.lasso", () => {
        if (!lassoRef.current || !lassoPath) return;
        const transform = d3.zoomTransform(svgEl.node()!);
        const selected: string[] = [];
        displayAuthors.forEach((nd) => {
          if (nd.x == null || nd.y == null) return;
          const [sx, sy] = transform.apply([nd.x, nd.y]);
          if (pointInPolygon([sx, sy], lassoPoints)) selected.push(nd.id);
        });
        lassoPath.remove(); lassoPath = null; lassoPoints = [];
        lassoRef.current = false;
        setLassoActive(false);
        if (selected.length >= 2) createMatrix(selected);
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
      svgEl.on("mousedown.lasso", null).on("mousemove.lasso", null).on("mouseup.lasso", null);
      setMatrixCount(0);
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

  const toggleLasso = () => {
    const next = !lassoActive;
    setLassoActive(next);
    lassoRef.current = next;
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
            <span>Use Citation Impact for node size</span>
          </label>
          <div className={styles.controlGroup}>
            <button
              className={`${styles.lassoBtn} ${lassoActive ? styles.lassoBtnActive : ""}`}
              onClick={toggleLasso}
            >
              {lassoActive ? "✕ Cancel" : "⌖ Lasso Select"}
            </button>
            {lassoActive && (
              <p className={styles.lassoHint}>Draw around nodes to create a matrix</p>
            )}
            {matrixCount > 0 && !lassoActive && (
              <p className={styles.lassoHint}>{matrixCount} matrix{matrixCount !== 1 ? "es" : ""} · double-click to remove</p>
            )}
          </div>
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
