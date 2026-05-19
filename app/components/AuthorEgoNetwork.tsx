"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import * as d3 from "d3";
import styles from "./AuthorEgoNetwork.module.css";
import { visualPalette } from "../lib/visualPalette";
import {
  createTooltip,
  removeTooltip,
  createTexturePatterns,
  getFillForUniversity,
  createPinSystem,
} from "./shared";

interface Authorship {
  ids: string[];
  names: string[];
  ACIs: number[];
  last_known_institutions: Array<{ display_name: string; label_name?: string } | null>;
  total_papers: number;
  field_citations: number[];
}

interface EgoNode extends d3.SimulationNodeDatum {
  id: string;
  name: string;
  aci: number;
  institution: string;
  isCenter: boolean;
  sharedPapers: number;
  totalCitations: number;
  r: number;
}

interface EgoLink extends d3.SimulationLinkDatum<EgoNode> {
  value: number;
  strokeWidth: number;
}

interface Props {
  authorId: string;
  authorName: string;
  dataPath: string;
  universityColorMap: Map<string, typeof visualPalette[0]>;
}

export default function AuthorEgoNetwork({ authorId, authorName, dataPath, universityColorMap }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;

    const width = containerRef.current.clientWidth || 700;
    const height = 420;
    let sim: d3.Simulation<EgoNode, EgoLink> | null = null;

    fetch(`${dataPath}/authorships_canadian.json`)
      .then((r) => r.json())
      .then((authorships: Authorship[]) => {
        const relevant = authorships.filter((a) => a.ids.includes(authorId));
        if (relevant.length === 0) return;

        // Aggregate collaborators
        const collabMap = new Map<
          string,
          { name: string; aci: number; institution: string; sharedPapers: number; totalCitations: number }
        >();
        relevant.forEach((authorship) => {
          authorship.ids.forEach((id, idx) => {
            if (id === authorId) return;
            const existing = collabMap.get(id);
            const citations = authorship.field_citations?.[idx] || 0;
            if (existing) {
              existing.sharedPapers += authorship.total_papers;
              existing.totalCitations += citations;
            } else {
              collabMap.set(id, {
                name: authorship.names[idx] || "Unknown",
                aci: authorship.ACIs[idx] || 0,
                institution:
                  authorship.last_known_institutions[idx]?.label_name ||
                  authorship.last_known_institutions[idx]?.display_name ||
                  "Unknown",
                sharedPapers: authorship.total_papers,
                totalCitations: citations,
              });
            }
          });
        });

        const topCollabs = Array.from(collabMap.entries())
          .sort((a, b) => b[1].sharedPapers - a[1].sharedPapers)
          .slice(0, 24);

        if (topCollabs.length === 0) return;

        // Find center author's institution
        let centerInstitution = "";
        for (const authorship of relevant) {
          const idx = authorship.ids.indexOf(authorId);
          if (idx !== -1) {
            centerInstitution = authorship.last_known_institutions[idx]?.label_name ||
                               authorship.last_known_institutions[idx]?.display_name ||
                               "Unknown";
            break;
          }
        }

        // Assign a palette colour to each unique institution using persistent color mapping
        const uniqueInstitutions = [...new Set([centerInstitution, ...topCollabs.map(([, d]) => d.institution)])];
        const institutionVisuals = new Map<string, typeof visualPalette[0]>(
          uniqueInstitutions.map((inst) => {
            const paletteItem = universityColorMap.get(inst);
            if (paletteItem) {
              // Use the palette item directly from the map
              return [inst, paletteItem];
            }
            // Fallback if institution not in map
            return [inst, visualPalette[0]];
          })
        );

        const rScale = d3
          .scaleSqrt()
          .domain([0, d3.max(topCollabs, ([, d]) => d.aci) || 1])
          .range([6, 12]);

        const strokeScale = d3
          .scaleLinear()
          .domain([1, d3.max(topCollabs, ([, d]) => d.sharedPapers) || 1])
          .range([1, 3.5]);

        const nodes: EgoNode[] = [
          {
            id: authorId,
            name: authorName,
            aci: 0,
            institution: centerInstitution,
            isCenter: true,
            sharedPapers: 0,
            totalCitations: 0,
            r: 22,
            x: width / 2,
            y: height / 2,
          },
          ...topCollabs.map(([id, data]) => ({
            id,
            name: data.name,
            aci: data.aci,
            institution: data.institution,
            isCenter: false,
            sharedPapers: data.sharedPapers,
            totalCitations: data.totalCitations,
            r: Math.max(rScale(data.aci), 4),
          })),
        ];

        const links: EgoLink[] = topCollabs.map(([id, data]) => ({
          source: authorId,
          target: id,
          value: data.sharedPapers,
          strokeWidth: strokeScale(data.sharedPapers),
        }));

        // Clear and set up SVG
        d3.select(svgRef.current).selectAll("*").remove();
        const svg = d3
          .select(svgRef.current)
          .attr("width", width)
          .attr("height", height);

        // Create texture patterns for institutions
        const defs = svg.append("defs");

        // Adjust pattern names to use 'ego-pattern-' prefix
        const egoInstitutionVisuals = new Map(
          Array.from(institutionVisuals.entries()).map(([inst, visual]) => [
            `ego-${inst}`,
            visual
          ])
        );
        createTexturePatterns(defs, egoInstitutionVisuals, { width: 20, height: 20 });

        // Tooltip
        const tooltip = createTooltip("ego-tooltip")
          .style("font-family", "Outfit, system-ui, sans-serif");

        // Force simulation
        sim = d3
          .forceSimulation<EgoNode>(nodes)
          .force(
            "link",
            d3
              .forceLink<EgoNode, EgoLink>(links)
              .id((d) => d.id)
              .distance(110)
              .strength(0.4)
          )
          .force("charge", d3.forceManyBody<EgoNode>().strength(-140))
          .force("center", d3.forceCenter(width / 2, height / 2))
          .force(
            "collide",
            d3.forceCollide<EgoNode>((d) => d.r + 8)
          )
          .force(
            "x",
            d3.forceX(width / 2).strength(0.04)
          )
          .force(
            "y",
            d3.forceY(height / 2).strength(0.04)
          );

        // Links
        const linkSel = svg
          .append("g")
          .selectAll<SVGLineElement, EgoLink>("line")
          .data(links)
          .enter()
          .append("line")
          .attr("stroke", "rgba(0,0,0,0.08)")
          .attr("stroke-width", (d) => d.strokeWidth);

        // Node groups — built first so setPinVisual can reference nodeSel cleanly
        const nodeSel = svg
          .append("g")
          .selectAll<SVGGElement, EgoNode>("g")
          .data(nodes)
          .enter()
          .append("g")
          .attr("class", "ego-node")
          .style("cursor", (d) => (d.isCenter ? "default" : "pointer"));

        // Circles
        nodeSel
          .append("circle")
          .attr("class", "node-circle")
          .attr("r", (d) => d.r)
          .attr("fill", (d) => getFillForUniversity(`ego-${d.institution}`, egoInstitutionVisuals))
          .attr("opacity", (d) => 0.85)
          .attr("stroke", "none")
          .attr("stroke-width", 0);

        // Pin dot indicator
        nodeSel
          .filter((d) => !d.isCenter)
          .append("circle")
          .attr("class", "pin-dot")
          .attr("r", 2.5)
          .attr("fill", "white")
          .attr("stroke", "rgba(0,0,0,0.5)")
          .attr("stroke-width", 1)
          .style("opacity", 0)
          .style("pointer-events", "none");

        // Pin tracking — defined after nodeSel so setPinVisual has full access
        const pinSystem = createPinSystem();
        let dragMoved = false;

        function setPinVisual(id: string, pinned: boolean) {
          nodeSel.filter((d) => d.id === id)
            .select<SVGCircleElement>("circle.node-circle")
            .attr("stroke", pinned ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.4)")
            .attr("stroke-width", pinned ? 2 : 1.5);
          nodeSel.filter((d) => d.id === id)
            .select<SVGCircleElement>("circle.pin-dot")
            .style("opacity", pinned ? 1 : 0);
        }

        // Attach drag after nodeSel and setPinVisual are ready
        nodeSel.call(
          d3.drag<SVGGElement, EgoNode>()
            .on("start", (event, d) => {
              dragMoved = false;
              if (!event.active) sim!.alphaTarget(0.3).restart();
              d.fx = d.x;
              d.fy = d.y;
            })
            .on("drag", (event, d) => {
              dragMoved = true;
              d.fx = event.x;
              d.fy = event.y;
            })
            .on("end", (event, d) => {
              if (!event.active) sim!.alphaTarget(0);
              if (dragMoved && !d.isCenter) {
                pinSystem.pinnedSet.add(d.id);
                setPinVisual(d.id, true);
              } else if (!pinSystem.pinnedSet.has(d.id)) {
                d.fx = null;
                d.fy = null;
              }
            })
        );

        // Labels (last name below all nodes)
        nodeSel
          .append("text")
          .attr("dy", (d) => d.r + (d.isCenter ? 14 : 12))
          .attr("text-anchor", "middle")
          .style("font-size", (d) => d.isCenter ? "11px" : "10px")
          .style("font-weight", (d) => d.isCenter ? "600" : "500")
          .style("fill", (d) => d.isCenter ? "#0e0e0c" : "#070706")
          .style("font-family", "var(--font-geist-sans), system-ui, sans-serif")
          .style("pointer-events", "none")
          .text((d) => d.name.split(" ").slice(-1)[0]);

        // Collaborator hover/click
        nodeSel
          .filter((d) => !d.isCenter)
          .on("mouseover", function (event, d) {
            const isPinned = pinSystem.pinnedSet.has(d.id);
            if (!isPinned) d3.select(this).select("circle.node-circle").attr("opacity", 1);
            tooltip
              .style("opacity", 1)
              .html(
                `<strong>${d.name}</strong><br/>` +
                `${d.institution}<br/>` +
                `${d.sharedPapers} shared paper${d.sharedPapers !== 1 ? "s" : ""}<br/>` +
                `${d.totalCitations.toLocaleString()} citation${d.totalCitations !== 1 ? "s" : ""}<br/>` +
                (isPinned
                  ? `<span style="font-size:10px;opacity:0.45;">Right-click to unpin</span>`
                  : `<span style="font-size:10px;opacity:0.45;">Click to view profile</span>`)
              );
          })
          .on("mousemove", function (event) {
            tooltip.style("left", event.pageX + 10 + "px").style("top", event.pageY - 10 + "px");
          })
          .on("mouseout", function (_, d) {
            if (!pinSystem.pinnedSet.has(d.id))
              d3.select(this).select("circle.node-circle").attr("opacity", 0.75);
            tooltip.style("opacity", 0);
          })
          .on("click", function (_event, d) {
            const shortId = d.id.replace("https://openalex.org/", "");
            router.push(`/author?id=${shortId}&dataPath=${encodeURIComponent(dataPath)}`);
          })
          .on("contextmenu", function (event, d) {
            event.preventDefault();
            if (!pinSystem.pinnedSet.has(d.id)) return;
            d.fx = null;
            d.fy = null;
            pinSystem.pinnedSet.delete(d.id);
            setPinVisual(d.id, false);
            sim!.alpha(0.15).restart();
          });

        // Tick
        sim.on("tick", () => {
          linkSel
            .attr("x1", (d) => (d.source as EgoNode).x!)
            .attr("y1", (d) => (d.source as EgoNode).y!)
            .attr("x2", (d) => (d.target as EgoNode).x!)
            .attr("y2", (d) => (d.target as EgoNode).y!);
          nodeSel.attr("transform", (d) => `translate(${d.x},${d.y})`);
        });

        // Legend — institutions and their colors
        const legendData = Array.from(institutionVisuals.entries());
        const legend = svg.append("g")
          .attr("class", "institution-legend")
          .attr("transform", `translate(${width - 160}, ${height - (legendData.length * 18) - 10})`);

        legend.selectAll("g")
          .data(legendData)
          .enter()
          .append("g")
          .attr("transform", (_, i) => `translate(0, ${i * 18})`)
          .each(function([institution, visual]) {
            const g = d3.select(this);

            // Color box
            g.append("circle")
              .attr("r", 5)
              .attr("cx", 5)
              .attr("cy", 0)
              .attr("fill", () => getFillForUniversity(`ego-${institution}`, egoInstitutionVisuals))
              .attr("opacity", 0.85);

            // Institution name
            g.append("text")
              .attr("x", 15)
              .attr("y", 4)
              .style("font-size", "9px")
              .style("font-family", "var(--font-geist-sans), system-ui, sans-serif")
              .style("fill", "rgba(0,0,0,0.6)")
              .text(institution.length > 20 ? institution.substring(0, 20) + "..." : institution);
          });
      });

    return () => {
      sim?.stop();
      removeTooltip("ego-tooltip");
    };
  }, [authorId, authorName, router, dataPath, universityColorMap]);

  return (
    <div ref={containerRef} className={styles.container}>
      <svg ref={svgRef} />
    </div>
  );
}
