/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as d3 from "d3";
import { distinctColors } from "../lib/colors";
import styles from "./NodeTrixView.module.css";

/* ── Types ── */
interface Authorship {
  ids: string[];
  names: string[];
  ACIs: number[];
  last_known_institutions: Array<{
    id: string;
    display_name: string;
    country_code: string;
  } | null>;
  total_papers: number;
  canadian_status: string;
}

interface GNode extends d3.SimulationNodeDatum {
  id: string;
  name: string;
  lastName: string;
  institution: string;
  institutionId: string;
  aci: number;
  color: string;
  r: number;
  matrixId: string | null;
}

interface SimLink extends d3.SimulationLinkDatum<GNode> {
  linkId: string;
  value: number;
}

interface RawLink {
  id: string;
  sourceId: string;
  targetId: string;
  value: number;
}

interface NTMatrix {
  id: string;
  nodeIds: string[];
  adjacency: boolean[][];
  x: number;
  y: number;
  cellSize: number;
  size: number;
}

interface Bridge {
  id: string;
  matrixNodeId: string;
  graphNodeId: string;
  matrixId: string;
}

interface Props {
  maxAuthors: number;
  maxUniversities: number;
  canadianFilter: "full" | "full_partial";
  domain: string;
}

/* ── Point-in-polygon (ray casting) ── */
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

export default function NodeTrixView({ maxAuthors, maxUniversities, canadianFilter }: Props) {
  const router = useRouter();
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [lassoActive, setLassoActive] = useState(false);
  const [matrixCount, setMatrixCount] = useState(0);
  const [universities, setUniversities] = useState<Array<{ name: string; color: string }>>([]);

  /* Mutable D3 state — never triggers re-render */
  const allNodesRef = useRef<GNode[]>([]);
  const allRawLinksRef = useRef<RawLink[]>([]);
  const matricesRef = useRef<NTMatrix[]>([]);
  const bridgesRef = useRef<Bridge[]>([]);
  const simRef = useRef<d3.Simulation<GNode, undefined> | null>(null);
  const lassoRef = useRef(false);
  const renderRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;

    const width = containerRef.current.clientWidth || 900;
    const height = 580;

    d3.select(svgRef.current).selectAll("*").remove();
    matricesRef.current = [];
    bridgesRef.current = [];
    allNodesRef.current = [];
    allRawLinksRef.current = [];
    setMatrixCount(0);

    const svgEl = d3
      .select(svgRef.current)
      .attr("width", width)
      .attr("height", height);

    /* ── Layers ── */
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.15, 5])
      .filter((event) => !lassoRef.current && event.type !== "dblclick")
      .on("zoom", (event) => root.attr("transform", event.transform));

    svgEl.call(zoom).on("dblclick.zoom", null);

    const root = svgEl.append("g").attr("class", "root");
    const bridgeLayer = root.append("g");
    const linkLayer = root.append("g");
    const nodeLayer = root.append("g");
    const matrixLayer = root.append("g");
    const lassoLayer = svgEl.append("g"); // above zoom group

    /* ── Tooltip ── */
    d3.select("#nt-tooltip").remove();
    const tooltip = d3
      .select("body")
      .append("div")
      .attr("id", "nt-tooltip")
      .style("position", "absolute")
      .style("background", "rgba(0,0,0,0.8)")
      .style("color", "white")
      .style("padding", "8px")
      .style("border-radius", "4px")
      .style("font-size", "12px")
      .style("font-family", "Outfit, system-ui, sans-serif")
      .style("pointer-events", "none")
      .style("opacity", 0)
      .style("z-index", "1000");

    fetch("/data/authorships.json")
      .then((r) => r.json())
      .then((authorships: Authorship[]) => {
        /* ── Build graph data (mirrors NetworkView logic) ── */
        const filtered = authorships.filter((a) =>
          canadianFilter === "full"
            ? a.canadian_status === "full"
            : a.canadian_status === "full" || a.canadian_status === "partial"
        );

        const authorMap = new Map<string, GNode>();
        filtered.forEach((a) => {
          a.ids.forEach((id, idx) => {
            if (!authorMap.has(id)) {
              const inst = a.last_known_institutions[idx];
              authorMap.set(id, {
                id,
                name: a.names[idx] || "Unknown",
                lastName: (a.names[idx] || "Unknown").split(" ").slice(-1)[0],
                institution: inst?.display_name || "Unknown",
                institutionId: inst?.id || "unknown",
                aci: a.ACIs[idx] || 0,
                color: "",
                r: 0,
                matrixId: null,
              });
            }
          });
        });

        const instGroups = new Map<string, { nodes: GNode[]; totalACI: number }>();
        authorMap.forEach((node) => {
          if (!instGroups.has(node.institution))
            instGroups.set(node.institution, { nodes: [], totalACI: 0 });
          const g = instGroups.get(node.institution)!;
          g.nodes.push(node);
          g.totalACI += node.aci;
        });

        const topInsts = Array.from(instGroups.entries())
          .sort((a, b) => b[1].totalACI - a[1].totalACI)
          .slice(0, maxUniversities);

        const topInstNames = new Set(topInsts.map(([name]) => name));
        const colors = distinctColors(topInsts.length);
        const colorMap = new Map(topInsts.map(([name], i) => [name, colors[i]]));

        const rScale = d3
          .scaleSqrt()
          .domain([0, d3.max(Array.from(authorMap.values()), (n) => n.aci) || 1])
          .range([5, 14]);

        const nodes = Array.from(authorMap.values())
          .filter((n) => topInstNames.has(n.institution))
          .slice(0, maxAuthors);

        nodes.forEach((n) => {
          n.color = colorMap.get(n.institution) || "#aaa";
          n.r = rScale(n.aci);
        });

        const nodeIdSet = new Set(nodes.map((n) => n.id));

        const linkMap = new Map<string, RawLink>();
        filtered.forEach((a) => {
          const ids = a.ids.filter((id) => nodeIdSet.has(id));
          for (let i = 0; i < ids.length; i++) {
            for (let j = i + 1; j < ids.length; j++) {
              const key = [ids[i], ids[j]].sort().join("+");
              if (linkMap.has(key)) {
                linkMap.get(key)!.value += a.total_papers;
              } else {
                linkMap.set(key, { id: key, sourceId: ids[i], targetId: ids[j], value: a.total_papers });
              }
            }
          }
        });

        allNodesRef.current = nodes;
        allRawLinksRef.current = Array.from(linkMap.values());

        setUniversities(topInsts.map(([name], i) => ({ name, color: colors[i] })));

        /* ── Force simulation ── */
        const sim = d3
          .forceSimulation<GNode>(nodes)
          .force(
            "link",
            d3
              .forceLink<GNode, SimLink>()
              .id((d) => d.id)
              .distance(60)
              .strength(0.3)
          )
          .force("charge", d3.forceManyBody<GNode>().strength(-80))
          .force("center", d3.forceCenter(width / 2, height / 2))
          .force("collide", d3.forceCollide<GNode>((d) => d.r + 4));

        simRef.current = sim;

        /* ── Helper selectors ── */
        const graphNodes = () => allNodesRef.current.filter((n) => n.matrixId === null);
        const graphLinks = (): SimLink[] => {
          const inGraph = new Set(graphNodes().map((n) => n.id));
          return allRawLinksRef.current
            .filter((l) => inGraph.has(l.sourceId) && inGraph.has(l.targetId))
            .map((l) => ({ source: l.sourceId, target: l.targetId, linkId: l.id, value: l.value } as SimLink));
        };

        /* ── Render functions ── */
        function renderLinks() {
          const sel = linkLayer
            .selectAll<SVGLineElement, SimLink>("line")
            .data(graphLinks(), (d) => d.linkId);
          sel.enter()
            .append("line")
            .attr("stroke", "rgba(0,0,0,0.07)")
            .attr("stroke-width", 0.8);
          sel.exit().remove();
        }

        function renderNodes() {
          const gNodes = graphNodes();
          const groups = nodeLayer
            .selectAll<SVGGElement, GNode>("g.nt-node")
            .data(gNodes, (d) => d.id);

          groups.exit().remove();

          const enter = groups
            .enter()
            .append("g")
            .attr("class", "nt-node")
            .style("cursor", "pointer")
            .call(
              d3
                .drag<SVGGElement, GNode>()
                .on("start", (e, d) => {
                  if (!e.active) sim.alphaTarget(0.3).restart();
                  d.fx = d.x; d.fy = d.y;
                })
                .on("drag", (e, d) => { d.fx = e.x; d.fy = e.y; })
                .on("end", (e, d) => {
                  if (!e.active) sim.alphaTarget(0);
                  d.fx = null; d.fy = null;
                })
            );

          enter
            .append("circle")
            .attr("r", (d) => d.r)
            .attr("fill", (d) => d.color)
            .attr("stroke", "rgba(255,255,255,0.6)")
            .attr("stroke-width", 0.8);

          enter
            .append("text")
            .attr("dy", (d) => d.r + 10)
            .attr("text-anchor", "middle")
            .style("font-size", "9px")
            .style("fill", "rgba(0,0,0,0.38)")
            .style("font-family", "var(--font-geist-sans), system-ui, sans-serif")
            .style("pointer-events", "none")
            .text((d) => d.lastName);

          enter
            .on("mouseover", (event, d) => {
              tooltip.style("opacity", 1).html(
                `<strong>${d.name}</strong><br/>${d.institution}<br/>` +
                  `<span style="font-size:10px;opacity:0.45;text-decoration:underline;">Click to view profile</span>`
              );
            })
            .on("mousemove", (event) => {
              tooltip.style("left", event.pageX + 10 + "px").style("top", event.pageY - 10 + "px");
            })
            .on("mouseout", () => tooltip.style("opacity", 0))
            .on("click", (_e, d) => {
              router.push(`/author?id=${d.id.replace("https://openalex.org/", "")}`);
            });
        }

        function renderBridges() {
          const nodeMap = new Map(allNodesRef.current.map((n) => [n.id, n]));
          const matMap = new Map(matricesRef.current.map((m) => [m.id, m]));

          const sel = bridgeLayer
            .selectAll<SVGPathElement, Bridge>("path.bridge")
            .data(bridgesRef.current, (d) => d.id);

          sel.enter()
            .append("path")
            .attr("class", "bridge")
            .attr("fill", "none")
            .attr("stroke", "rgba(0,0,0,0.14)")
            .attr("stroke-width", 1)
            .attr("stroke-dasharray", "4,3");

          sel.exit().remove();

          // Update positions
          bridgeLayer.selectAll<SVGPathElement, Bridge>("path.bridge").attr("d", (b) => {
            const mat = matMap.get(b.matrixId);
            const tgt = nodeMap.get(b.graphNodeId);
            if (!mat || !tgt || tgt.x == null || tgt.y == null) return "";
            const mx = mat.x + mat.size / 2, my = mat.y + mat.size / 2;
            const cx = (mx + tgt.x!) / 2, cy = (my + tgt.y!) / 2;
            return `M${mx},${my} Q${cx},${cy} ${tgt.x!},${tgt.y!}`;
          });
        }

        function renderMatrices() {
          const nodeMap = new Map(allNodesRef.current.map((n) => [n.id, n]));
          const mats = matricesRef.current;

          const groups = matrixLayer
            .selectAll<SVGGElement, NTMatrix>("g.nt-matrix")
            .data(mats, (d) => d.id);

          groups.exit().remove();

          const enter = groups
            .enter()
            .append("g")
            .attr("class", "nt-matrix")
            .attr("transform", (d) => `translate(${d.x},${d.y})`);

          enter
            .append("rect")
            .attr("width", (d) => d.size)
            .attr("height", (d) => d.size)
            .attr("fill", "#f0f0ec")
            .attr("stroke", "rgba(0,0,0,0.1)")
            .attr("stroke-width", 1)
            .attr("rx", 4);

          enter.each(function (matrix) {
            const g = d3.select<SVGGElement, NTMatrix>(this);
            const n = matrix.nodeIds.length;

            for (let row = 0; row < n; row++) {
              for (let col = 0; col < n; col++) {
                const isDiag = row === col;
                const node = nodeMap.get(matrix.nodeIds[row]);
                g.append("rect")
                  .attr("class", "mat-cell")
                  .attr("data-row", row)
                  .attr("data-col", col)
                  .attr("x", col * matrix.cellSize)
                  .attr("y", row * matrix.cellSize)
                  .attr("width", matrix.cellSize - 0.5)
                  .attr("height", matrix.cellSize - 0.5)
                  .attr(
                    "fill",
                    isDiag
                      ? node?.color || "#ccc"
                      : matrix.adjacency[row][col]
                      ? "rgba(0,0,0,0.22)"
                      : "rgba(255,255,255,0.45)"
                  )
                  .attr("stroke", "rgba(0,0,0,0.04)")
                  .attr("stroke-width", 0.5);
              }
            }

            // Row labels
            matrix.nodeIds.forEach((nodeId, i) => {
              const nd = nodeMap.get(nodeId);
              if (!nd) return;
              g.append("text")
                .attr("x", -4)
                .attr("y", i * matrix.cellSize + matrix.cellSize / 2)
                .attr("text-anchor", "end")
                .attr("dominant-baseline", "middle")
                .style("font-size", "8px")
                .style("fill", "rgba(0,0,0,0.4)")
                .style("font-family", "var(--font-geist-sans), system-ui, sans-serif")
                .text(nd.lastName);
            });

            // Cell hover
            g.selectAll<SVGRectElement, unknown>("rect.mat-cell")
              .on("mouseover", function () {
                const r = +(this.getAttribute("data-row")!);
                const c = +(this.getAttribute("data-col")!);
                g.selectAll<SVGRectElement, unknown>("rect.mat-cell").attr("opacity", function () {
                  const tr = +(this.getAttribute("data-row")!);
                  const tc = +(this.getAttribute("data-col")!);
                  return tr === r || tc === c || tr === c || tc === r ? 1 : 0.25;
                });
              })
              .on("mouseout", () => {
                g.selectAll("rect.mat-cell").attr("opacity", 1);
              });
          });

          // Drag matrix
          enter.call(
            d3
              .drag<SVGGElement, NTMatrix>()
              .on("drag", function (event, d) {
                d.x += event.dx;
                d.y += event.dy;
                d3.select(this).attr("transform", `translate(${d.x},${d.y})`);
                renderBridges();
              })
          );

          // Double-click to delete
          enter.on("dblclick", (_e, d) => deleteMatrix(d.id));
        }

        function updateSimulation() {
          const gNodes = graphNodes();
          const gLinks = graphLinks();
          sim.nodes(gNodes);
          (sim.force("link") as d3.ForceLink<GNode, SimLink>).links(gLinks);
          sim.alpha(0.4).restart();
        }

        function renderAll() {
          renderLinks();
          renderNodes();
          renderBridges();
          renderMatrices();
          updateSimulation();
        }

        renderRef.current = renderAll;

        /* ── Tick ── */
        sim.on("tick", () => {
          linkLayer.selectAll<SVGLineElement, SimLink>("line").each(function (d) {
            const s = d.source as GNode, t = d.target as GNode;
            if (s.x == null || t.x == null) return;
            d3.select(this)
              .attr("x1", s.x).attr("y1", s.y!)
              .attr("x2", t.x).attr("y2", t.y!);
          });

          nodeLayer
            .selectAll<SVGGElement, GNode>("g.nt-node")
            .attr("transform", (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);

          renderBridges();
        });

        /* ── Matrix creation ── */
        function createMatrix(selectedIds: string[]) {
          const available = selectedIds.filter((id) => {
            const n = allNodesRef.current.find((nd) => nd.id === id);
            return n && n.matrixId === null;
          });
          if (available.length < 2) return;

          const matId = `m-${Date.now()}`;
          const n = available.length;
          const cellSize = Math.max(14, Math.min(28, Math.floor(280 / n)));
          const size = n * cellSize;

          const nodeMap = new Map(allNodesRef.current.map((nd) => [nd.id, nd]));
          let cx = 0, cy = 0;
          available.forEach((id) => { cx += nodeMap.get(id)?.x ?? 0; cy += nodeMap.get(id)?.y ?? 0; });
          cx /= available.length; cy /= available.length;

          const idxMap = new Map(available.map((id, i) => [id, i]));
          const adj: boolean[][] = Array.from({ length: n }, () => Array(n).fill(false));
          allRawLinksRef.current.forEach((l) => {
            if (idxMap.has(l.sourceId) && idxMap.has(l.targetId)) {
              const i = idxMap.get(l.sourceId)!, j = idxMap.get(l.targetId)!;
              adj[i][j] = adj[j][i] = true;
            }
          });

          const matrix: NTMatrix = {
            id: matId, nodeIds: available, adjacency: adj,
            x: cx - size / 2, y: cy - size / 2, cellSize, size,
          };

          available.forEach((id) => { nodeMap.get(id)!.matrixId = matId; });

          // Build bridges
          const inMatrix = new Set(available);
          allRawLinksRef.current.forEach((l) => {
            const sIn = inMatrix.has(l.sourceId), tIn = inMatrix.has(l.targetId);
            if (sIn === tIn) return;
            const matNode = sIn ? l.sourceId : l.targetId;
            const graphNode = sIn ? l.targetId : l.sourceId;
            const tgtNode = nodeMap.get(graphNode);
            if (tgtNode && tgtNode.matrixId === null) {
              bridgesRef.current.push({
                id: `br-${matNode}-${graphNode}`,
                matrixNodeId: matNode, graphNodeId: graphNode, matrixId: matId,
              });
            }
          });

          matricesRef.current.push(matrix);
          setMatrixCount(matricesRef.current.length);
          renderAll();
        }

        /* ── Matrix deletion ── */
        function deleteMatrix(matId: string) {
          const mat = matricesRef.current.find((m) => m.id === matId);
          if (!mat) return;
          const nodeMap = new Map(allNodesRef.current.map((n) => [n.id, n]));
          mat.nodeIds.forEach((id) => {
            const nd = nodeMap.get(id);
            if (nd) {
              nd.matrixId = null;
              nd.x = mat.x + mat.size / 2 + (Math.random() - 0.5) * 80;
              nd.y = mat.y + mat.size / 2 + (Math.random() - 0.5) * 80;
            }
          });
          matricesRef.current = matricesRef.current.filter((m) => m.id !== matId);
          bridgesRef.current = bridgesRef.current.filter((b) => b.matrixId !== matId);
          setMatrixCount(matricesRef.current.length);
          renderAll();
        }

        /* ── Lasso ── */
        let lassoPoints: [number, number][] = [];
        let lassoPath: d3.Selection<SVGPathElement, unknown, null, undefined> | null = null;
        const line = d3.line<[number, number]>().curve(d3.curveBasisClosed);

        svgEl
          .on("mousedown.lasso", (event) => {
            if (!lassoRef.current) return;
            event.preventDefault();
            lassoPoints = [d3.pointer(event) as [number, number]];
            lassoPath = lassoLayer
              .append("path")
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
              lassoPath.attr("d", line(lassoPoints) || "");
            }
          })
          .on("mouseup.lasso", () => {
            if (!lassoRef.current || !lassoPath) return;
            const transform = d3.zoomTransform(svgEl.node()!);
            const selected: string[] = [];
            allNodesRef.current.forEach((nd) => {
              if (nd.matrixId !== null || nd.x == null || nd.y == null) return;
              const [sx, sy] = transform.apply([nd.x, nd.y]);
              if (pointInPolygon([sx, sy], lassoPoints)) selected.push(nd.id);
            });
            lassoPath.remove(); lassoPath = null; lassoPoints = [];
            lassoRef.current = false;
            setLassoActive(false);
            if (selected.length >= 2) createMatrix(selected);
          });

        renderAll();

        return () => {
          sim.stop();
          d3.select("#nt-tooltip").remove();
          svgEl.on("mousedown.lasso", null).on("mousemove.lasso", null).on("mouseup.lasso", null);
        };
      });

    return () => {
      simRef.current?.stop();
      d3.select("#nt-tooltip").remove();
    };
  }, [maxAuthors, maxUniversities, canadianFilter, router]);

  const toggleLasso = () => {
    const next = !lassoActive;
    setLassoActive(next);
    lassoRef.current = next;
  };

  return (
    <div className={styles.wrapper}>
      <div className={styles.sidebar}>
        <div className={styles.sideSection}>
          <p className={styles.sideLabel}>Controls</p>
          <button
            className={`${styles.lassoBtn} ${lassoActive ? styles.lassoBtnActive : ""}`}
            onClick={toggleLasso}
          >
            {lassoActive ? "✕ Cancel Lasso" : "⌖ Lasso Select"}
          </button>
          {lassoActive && (
            <p className={styles.lassoHint}>Draw around nodes to group them into a matrix</p>
          )}
          {matrixCount > 0 && (
            <p className={styles.matrixInfo}>
              {matrixCount} active matrix{matrixCount !== 1 ? "es" : ""}
              <br />
              <span>Double-click matrix to remove</span>
            </p>
          )}
        </div>

        <div className={styles.sideSection}>
          <p className={styles.sideLabel}>Universities</p>
          <div className={styles.uniList}>
            {universities.map((u) => (
              <div key={u.name} className={styles.uniItem}>
                <div className={styles.uniDot} style={{ background: u.color }} />
                <span className={styles.uniName}>{u.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div ref={containerRef} className={styles.canvas}>
        <svg ref={svgRef} />
      </div>
    </div>
  );
}
