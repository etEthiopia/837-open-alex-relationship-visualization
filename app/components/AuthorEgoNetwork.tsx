"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import * as d3 from "d3";
import styles from "./AuthorEgoNetwork.module.css";

interface Authorship {
  ids: string[];
  names: string[];
  ACIs: number[];
  last_known_institutions: Array<{ display_name: string } | null>;
  total_papers: number;
}

interface Node extends d3.SimulationNodeDatum {
  id: string;
  name: string;
  aci: number;
  institution: string;
  isCenter: boolean;
  sharedPapers: number;
  r: number;
}

interface Link extends d3.SimulationLinkDatum<Node> {
  value: number;
  strokeWidth: number;
}

interface Props {
  authorId: string;
  authorName: string;
}

export default function AuthorEgoNetwork({ authorId, authorName }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;

    const width = containerRef.current.clientWidth || 700;
    const height = 420;
    let sim: d3.Simulation<Node, Link> | null = null;

    fetch("/data/authorships.json")
      .then((r) => r.json())
      .then((authorships: Authorship[]) => {
        const relevant = authorships.filter((a) => a.ids.includes(authorId));
        if (relevant.length === 0) return;

        // Aggregate collaborators
        const collabMap = new Map<
          string,
          { name: string; aci: number; institution: string; sharedPapers: number }
        >();
        relevant.forEach((authorship) => {
          authorship.ids.forEach((id, idx) => {
            if (id === authorId) return;
            const existing = collabMap.get(id);
            if (existing) {
              existing.sharedPapers += authorship.total_papers;
            } else {
              collabMap.set(id, {
                name: authorship.names[idx] || "Unknown",
                aci: authorship.ACIs[idx] || 0,
                institution:
                  authorship.last_known_institutions[idx]?.display_name ||
                  "Unknown",
                sharedPapers: authorship.total_papers,
              });
            }
          });
        });

        const topCollabs = Array.from(collabMap.entries())
          .sort((a, b) => b[1].sharedPapers - a[1].sharedPapers)
          .slice(0, 24);

        if (topCollabs.length === 0) return;

        const rScale = d3
          .scaleSqrt()
          .domain([0, d3.max(topCollabs, ([, d]) => d.aci) || 1])
          .range([4, 11]);

        const strokeScale = d3
          .scaleLinear()
          .domain([1, d3.max(topCollabs, ([, d]) => d.sharedPapers) || 1])
          .range([1, 3.5]);

        const nodes: Node[] = [
          {
            id: authorId,
            name: authorName,
            aci: 0,
            institution: "",
            isCenter: true,
            sharedPapers: 0,
            r: 20,
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
            r: Math.max(rScale(data.aci), 4),
          })),
        ];

        const links: Link[] = topCollabs.map(([id, data]) => ({
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

        // Tooltip
        d3.select("#ego-tooltip").remove();
        const tooltip = d3
          .select("body")
          .append("div")
          .attr("id", "ego-tooltip")
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

        // Force simulation
        sim = d3
          .forceSimulation<Node>(nodes)
          .force(
            "link",
            d3
              .forceLink<Node, Link>(links)
              .id((d) => d.id)
              .distance(110)
              .strength(0.4)
          )
          .force("charge", d3.forceManyBody<Node>().strength(-140))
          .force("center", d3.forceCenter(width / 2, height / 2))
          .force(
            "collide",
            d3.forceCollide<Node>((d) => d.r + 8)
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
          .selectAll<SVGLineElement, Link>("line")
          .data(links)
          .enter()
          .append("line")
          .attr("stroke", "rgba(0,0,0,0.08)")
          .attr("stroke-width", (d) => d.strokeWidth);

        // Node groups
        const nodeSel = svg
          .append("g")
          .selectAll<SVGGElement, Node>("g")
          .data(nodes)
          .enter()
          .append("g")
          .style("cursor", (d) => (d.isCenter ? "default" : "pointer"))
          .call(
            d3
              .drag<SVGGElement, Node>()
              .on("start", (event, d) => {
                if (!event.active) sim!.alphaTarget(0.3).restart();
                d.fx = d.x;
                d.fy = d.y;
              })
              .on("drag", (event, d) => {
                d.fx = event.x;
                d.fy = event.y;
              })
              .on("end", (event, d) => {
                if (!event.active) sim!.alphaTarget(0);
                d.fx = null;
                d.fy = null;
              })
          );

        // Circles
        nodeSel
          .append("circle")
          .attr("r", (d) => d.r)
          .attr("fill", (d) =>
            d.isCenter ? "#0e0e0c" : "rgba(0,0,0,0.1)"
          )
          .attr("stroke", (d) =>
            d.isCenter ? "none" : "rgba(0,0,0,0.18)"
          )
          .attr("stroke-width", 1);

        // Center label (last name below node)
        nodeSel
          .filter((d) => d.isCenter)
          .append("text")
          .attr("dy", (d) => d.r + 14)
          .attr("text-anchor", "middle")
          .style("font-size", "11px")
          .style("font-weight", "600")
          .style("fill", "#0e0e0c")
          .style("font-family", "var(--font-geist-sans), system-ui, sans-serif")
          .text((d) => d.name.split(" ").slice(-1)[0]);

        // Collaborator hover/click
        nodeSel
          .filter((d) => !d.isCenter)
          .on("mouseover", function (event, d) {
            d3.select(this)
              .select("circle")
              .attr("fill", "rgba(0,0,0,0.22)");
            tooltip
              .style("opacity", 1)
              .html(
                `<strong>${d.name}</strong><br/>` +
                  `${d.institution}<br/>` +
                  `${d.sharedPapers} shared paper${d.sharedPapers !== 1 ? "s" : ""}<br/>` +
                  `<span style="font-size:10px;opacity:0.45;text-decoration:underline;">Click to view profile</span>`
              );
          })
          .on("mousemove", function (event) {
            tooltip
              .style("left", event.pageX + 10 + "px")
              .style("top", event.pageY - 10 + "px");
          })
          .on("mouseout", function () {
            d3.select(this)
              .select("circle")
              .attr("fill", "rgba(0,0,0,0.1)");
            tooltip.style("opacity", 0);
          })
          .on("click", function (_event, d) {
            const shortId = d.id.replace("https://openalex.org/", "");
            router.push(`/author?id=${shortId}`);
          });

        // Tick
        sim.on("tick", () => {
          linkSel
            .attr("x1", (d) => (d.source as Node).x!)
            .attr("y1", (d) => (d.source as Node).y!)
            .attr("x2", (d) => (d.target as Node).x!)
            .attr("y2", (d) => (d.target as Node).y!);
          nodeSel.attr("transform", (d) => `translate(${d.x},${d.y})`);
        });
      });

    return () => {
      sim?.stop();
      d3.select("#ego-tooltip").remove();
    };
  }, [authorId, authorName, router]);

  return (
    <div ref={containerRef} className={styles.container}>
      <svg ref={svgRef} />
    </div>
  );
}
