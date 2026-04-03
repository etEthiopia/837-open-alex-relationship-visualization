/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { visualPalette, getTextureStrokeForVariable } from "../lib/visualPalette";

interface Institution {
  id: string;
  display_name: string;
  label_name: string;
  country_code: string;
  type: string;
}

interface InstitutionData {
  id: string;
  name: string;
  label_name: string;
  country_code: string;
  type: string;
  field_citations: number;
  field_papers: number;
  ICI: number;
}

interface Author {
  id: string;
  name: string;
  aci: number;
  field_citations: number;
  field_papers: number;
  institution: string;
  institutionId: string;
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

interface UniversityNode {
  id: string;
  name: string;
  display_name: string;
  institutionId: string;
  authors: Author[];
  totalICI: number;
  authorCount: number;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
}

interface Link {
  source: string | UniversityNode;
  target: string | UniversityNode;
  value: number;
  fwci?: number;
  citations?: number;
  papers?: number;
}

type EdgeStrengthMetric =
  | "total_fwci"
  | "total_cited_by_count"
  | "total_papers"
  | "none";

interface NetworkUniversityViewProps {
  maxUniversities: number;
  canadianFilter: "full" | "full_partial";
  domain: string;
  edgeStrength: EdgeStrengthMetric;
  selectedUniversity: string | null;
  nodeLabelMode: "major" | "all" | "none";
  matrixUniversity: string | null;
  onUniversitiesChange: (universities: Array<{ name: string; display_name: string; color: string; texture?: string; luminance?: "dark" | "light"; totalACI: number; count: number }>) => void;
}

const UNIVERSITY_VIEW_AUTHOR_SAMPLE = 500;

export default function NetworkUniversityView({
  maxUniversities,
  canadianFilter,
  domain,
  edgeStrength,
  selectedUniversity,
  nodeLabelMode,
  matrixUniversity,
  onUniversitiesChange,
}: NetworkUniversityViewProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const matrixSvgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<d3.Selection<HTMLDivElement, unknown, HTMLElement, unknown> | null>(null);

  const [authorships, setAuthorships] = useState<Authorship[]>([]);
  const [domainAuthorIds, setDomainAuthorIds] = useState<Set<string> | null>(null);
  const [institutions, setInstitutions] = useState<InstitutionData[]>([]);
  const [universityColors, setUniversityColors] = useState<Map<string, { color: string; texture: string; luminance: "dark" | "light" }>>(new Map());

  useEffect(() => {
    fetch("/data/authorships.json")
      .then((res) => res.json())
      .then((data: Authorship[]) => setAuthorships(data));

    fetch("/data/institutions.json")
      .then((res) => res.json())
      .then((data: InstitutionData[]) => setInstitutions(data));
  }, []);

  useEffect(() => {
    if (domain === "All Domains") {
      setDomainAuthorIds(null);
      return;
    }
    fetch("/data/authors.json")
      .then((res) => res.json())
      .then(
        (data: Array<{
          author_id: string;
          topics?: Array<{
            domain?: { display_name: string };
            field?: { display_name: string };
            subfield?: { display_name: string };
          }>;
        }>) => {
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
        }
      );
  }, [domain]);

  useEffect(() => {
    if (!svgRef.current || authorships.length === 0 || institutions.length === 0) return;
    if (domain !== "All Domains" && domainAuthorIds === null) return;

    d3.select(svgRef.current).selectAll("*").remove();

    // Create institution lookup map
    const institutionMap = new Map<string, InstitutionData>();
    institutions.forEach(inst => {
      institutionMap.set(inst.label_name, inst);
      institutionMap.set(inst.name, inst);
      institutionMap.set(inst.id, inst);
    });

    // --- Data Processing ---
    const filteredAuthorships = authorships.filter((a) => {
      if (canadianFilter === "full") return a.canadian_status === "full";
      return a.canadian_status === "full" || a.canadian_status === "partial";
    });

    const authorMap = new Map<string, Author>();
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
            institution: institution?.label_name || institution?.display_name || "Unknown",
            institutionId: institution?.id || "unknown",
          });
        }
      });
    });

    const institutionGroups = new Map<string, { authors: Author[]; totalACI: number }>();
    authorMap.forEach((author) => {
      if (!institutionGroups.has(author.institution)) {
        institutionGroups.set(author.institution, { authors: [], totalACI: 0 });
      }
      const group = institutionGroups.get(author.institution)!;
      group.authors.push(author);
      group.totalACI += author.aci;
    });

    // Determine Top Universities based on total ACI
    const sortedInstitutions = Array.from(institutionGroups.entries())
      .sort((a, b) => b[1].totalACI - a[1].totalACI)
      .slice(0, maxUniversities);

    const topInstitutionNames = new Set(sortedInstitutions.map(([name]) => name));

    // Sample the top 500 authors overall to build university-level links
    const filteredAuthors = Array.from(authorMap.values())
      .filter((author) => topInstitutionNames.has(author.institution))
      .sort((a, b) => b.aci - a.aci)
      .slice(0, UNIVERSITY_VIEW_AUTHOR_SAMPLE);

    const displayAuthorIds = new Set(filteredAuthors.map((a) => a.id));

    // Create university nodes
    const universityNodes: UniversityNode[] = sortedInstitutions.map(([name, group]) => {
        // We still use the filteredAuthors sample to represent the "weight" of the university in this context
        const authorsInSample = filteredAuthors.filter((a) => a.institution === name);
        const instData = institutionMap.get(name);
        const institutionId = instData?.id || group.authors[0]?.institutionId || "unknown";
        const totalICI = instData?.ICI || 0;

        return {
            id: name,
            name,
            display_name: instData?.name || name,
            institutionId,
            authors: authorsInSample,
            totalICI,
            authorCount: group.authors.length, // Use full group count for labels
        };
    }).filter(node => node.authorCount > 0);

    const links: Link[] = [];
    const linkMap = new Map<string, Link>();
    filteredAuthorships.forEach((authorship) => {
      const authorIds = authorship.ids.filter((id) => displayAuthorIds.has(id));
      for (let i = 0; i < authorIds.length; i++) {
        for (let j = i + 1; j < authorIds.length; j++) {
          const author1 = authorMap.get(authorIds[i]);
          const author2 = authorMap.get(authorIds[j]);
          if (author1 && author2 && author1.institution !== author2.institution) {
            const key = [author1.institution, author2.institution].sort().join("+");
            const value = edgeStrength === "none" ? 1 
                : (edgeStrength === "total_fwci" ? authorship.total_fwci 
                : (edgeStrength === "total_cited_by_count" ? authorship.total_cited_by_count : authorship.total_papers));
            
            if (linkMap.has(key)) {
              const existing = linkMap.get(key)!;
              existing.value += value;
            } else {
              const link = { source: author1.institution, target: author2.institution, value };
              linkMap.set(key, link);
              links.push(link);
            }
          }
        }
      }
    });

    // --- Layout & Simulation Logic ---
    const containerWidth = svgRef.current.parentElement?.clientWidth || 1200;
    const containerHeight = svgRef.current.parentElement?.clientHeight || 800;
    const cx = containerWidth / 2;
    const cy = containerHeight / 2;

    // Elliptical pre-positioning
    const radiusX = containerWidth * 0.38;
    const radiusY = containerHeight * 0.32;
    universityNodes.forEach((d, i) => {
      const angle = (2 * Math.PI * i) / universityNodes.length - Math.PI / 2;
      d.x = cx + radiusX * Math.cos(angle);
      d.y = cy + radiusY * Math.sin(angle);
    });

    const sizeScale = d3.scaleSqrt()
      .domain([0, d3.max(universityNodes, d => d.totalICI) || 1])
      .range([10, 40]);

    // Map each university to its visual variable (color + texture)
    const universityVisuals = new Map(
      universityNodes.map((node, idx) => {
        const paletteItem = visualPalette[idx % visualPalette.length];
        return [node.name, paletteItem];
      })
    );

    // Helper function to get fill value (solid color or pattern URL)
    const getFillForUniversity = (universityName: string): string => {
      const visual = universityVisuals.get(universityName);
      if (!visual) return "#808080"; // Fallback gray

      if (visual.texture === "none") {
        return visual.color;
      } else {
        const patternId = `pattern-uni-${universityName.replace(/[^a-zA-Z0-9]/g, "-")}`;
        return `url(#${patternId})`;
      }
    };

    // Store visuals in state for matrix rendering
    const colorMap = new Map<string, { color: string; texture: string; luminance: "dark" | "light" }>();
    universityNodes.forEach(uni => {
      const visual = universityVisuals.get(uni.name);
      if (visual) {
        colorMap.set(uni.name, {
          color: visual.color,
          texture: visual.texture,
          luminance: visual.luminance
        });
      }
    });
    setUniversityColors(colorMap);

    onUniversitiesChange(universityNodes.map(uni => {
      const visual = universityVisuals.get(uni.name);
      return {
        name: uni.name,
        display_name: uni.display_name,
        color: visual?.color || "#808080",
        texture: visual?.texture || "none",
        luminance: visual?.luminance || "dark",
        totalACI: uni.totalICI, // Still use totalACI key for backward compatibility with sidebar
        count: uni.authorCount,
      };
    }));

    function boxForce() {
      const margin = 80;
      const rx = containerWidth / 2 - margin;
      const ry = containerHeight / 2 - margin;
      const exponent = 4;

      universityNodes.forEach((d) => {
        const dx = Math.abs(d.x! - cx);
        const dy = Math.abs(d.y! - cy);
        const distance = Math.pow(dx / rx, exponent) + Math.pow(dy / ry, exponent);

        if (distance > 1) {
          const scale = Math.pow(distance, -1 / exponent);
          const targetX = cx + (d.x! - cx) * scale;
          const targetY = cy + (d.y! - cy) * scale;
          d.vx! += (targetX - d.x!) * 0.25;
          d.vy! += (targetY - d.y!) * 0.25;
        }
      });
    }

    const simulation = d3
      .forceSimulation<UniversityNode>(universityNodes)
      .force("link", d3.forceLink<UniversityNode, Link>(links)
        .id((d: any) => d.id)
        .distance(250) // More breathing room for large nodes
        .strength(d => edgeStrength === "none" ? 0.1 : d.value / 400))
      .force("charge", d3.forceManyBody().strength(-1200).distanceMax(600))
      .force("x", d3.forceX(cx).strength(0.02))
      .force("y", d3.forceY(cy).strength(0.05))
      .force("center", d3.forceCenter(cx, cy).strength(0.15))
      .force("bounds", boxForce)
      .force("collision", d3.forceCollide<UniversityNode>()
        .radius(d => sizeScale(d.totalICI) + 20)
        .strength(0.8))
      .alphaDecay(0.02)
      .velocityDecay(0.45);

    // ... [Rendering logic: links, nodeGroups, text remain the same]

    const svgEl = d3.select(svgRef.current)
      .attr("width", containerWidth)
      .attr("height", containerHeight);

    // Definitions: texture patterns
    const defs = svgEl.append("defs");

    // Create texture patterns for each university that needs one
    universityVisuals.forEach((visual, universityName) => {
      if (visual.texture === "none") return;

      const patternId = `pattern-uni-${universityName.replace(/[^a-zA-Z0-9]/g, "-")}`;
      const strokeColor = getTextureStrokeForVariable(visual);

      // Small repeating pattern that works well for circles of all sizes
      const pattern = defs
        .append("pattern")
        .attr("id", patternId)
        .attr("patternUnits", "userSpaceOnUse")
        .attr("width", 8)
        .attr("height", 8);

      // Background color
      pattern.append("rect")
        .attr("width", 8)
        .attr("height", 8)
        .attr("fill", visual.color);

      // Add lines based on texture type
      if (visual.texture === "vertical") {
        // Vertical stripes
        pattern.append("line")
          .attr("x1", 2)
          .attr("y1", 0)
          .attr("x2", 2)
          .attr("y2", 8)
          .attr("stroke", strokeColor)
          .attr("stroke-width", 2);
        pattern.append("line")
          .attr("x1", 6)
          .attr("y1", 0)
          .attr("x2", 6)
          .attr("y2", 8)
          .attr("stroke", strokeColor)
          .attr("stroke-width", 2);
      } else if (visual.texture === "horizontal") {
        // Horizontal stripes
        pattern.append("line")
          .attr("x1", 0)
          .attr("y1", 2)
          .attr("x2", 8)
          .attr("y2", 2)
          .attr("stroke", strokeColor)
          .attr("stroke-width", 2);
        pattern.append("line")
          .attr("x1", 0)
          .attr("y1", 6)
          .attr("x2", 8)
          .attr("y2", 6)
          .attr("stroke", strokeColor)
          .attr("stroke-width", 2);
      } else if (visual.texture === "diagonal") {
        // Diagonal stripes (45 degree)
        pattern.append("line")
          .attr("x1", 0)
          .attr("y1", 0)
          .attr("x2", 8)
          .attr("y2", 8)
          .attr("stroke", strokeColor)
          .attr("stroke-width", 2);
        pattern.append("line")
          .attr("x1", -2)
          .attr("y1", 6)
          .attr("x2", 2)
          .attr("y2", 10)
          .attr("stroke", strokeColor)
          .attr("stroke-width", 2);
        pattern.append("line")
          .attr("x1", 6)
          .attr("y1", -2)
          .attr("x2", 10)
          .attr("y2", 2)
          .attr("stroke", strokeColor)
          .attr("stroke-width", 2);
      } else if (visual.texture === "dots") {
        // Dot pattern - 4 dots in a grid
        pattern.append("circle")
          .attr("cx", 2)
          .attr("cy", 2)
          .attr("r", 1)
          .attr("fill", strokeColor);
        pattern.append("circle")
          .attr("cx", 6)
          .attr("cy", 2)
          .attr("r", 1)
          .attr("fill", strokeColor);
        pattern.append("circle")
          .attr("cx", 2)
          .attr("cy", 6)
          .attr("r", 1)
          .attr("fill", strokeColor);
        pattern.append("circle")
          .attr("cx", 6)
          .attr("cy", 6)
          .attr("r", 1)
          .attr("fill", strokeColor);
      }
    });

    const g = svgEl.append("g");
    const zoom = d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.2, 6]).on("zoom", (e) => g.attr("transform", e.transform));
    svgEl.call(zoom);

    // Setup tooltip
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

    const linkEl = g.append("g")
      .selectAll("line")
      .data(links)
      .enter()
      .append("line")
      .attr("stroke", "#9aa0b8")
      .attr("stroke-opacity", 0.4)
      .attr("stroke-width", d => Math.sqrt(d.value) * 1.5);

    const nodeGroup = g.append("g")
      .selectAll("g")
      .data(universityNodes)
      .enter()
      .append("g")
      .style("cursor", "pointer")
      .call(d3.drag<SVGGElement, UniversityNode>()
        .on("start", (event, d) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x; d.fy = d.y;
        })
        .on("drag", (event, d) => {
          d.fx = event.x; d.fy = event.y;
        })
        .on("end", (event, d) => {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null; d.fy = null;
        })
      );

    nodeGroup.append("circle")
      .attr("r", d => sizeScale(d.totalICI))
      .attr("fill", d => getFillForUniversity(d.name))
      .attr("stroke", "rgba(255,255,255,0.9)")
      .attr("stroke-width", 2)
      .style("opacity", d => !selectedUniversity || d.name === selectedUniversity ? 0.9 : 0.2);

    // Calculate top 10% for "major" label mode
    const top20PercentCount = Math.ceil(universityNodes.length * 0.2);
    const top20PercentIds = new Set(
      universityNodes.slice(0, top20PercentCount).map((n) => n.id)
    );

    nodeGroup.append("text")
      .text(d => d.name.length > 25 ? d.name.slice(0, 25) + "..." : d.name)
      .attr("dy", d => sizeScale(d.totalICI) + 22)
      .attr("text-anchor", "middle")
      .style("font-size", "10px")
      .style("fill", "rgba(0,0,0,0.55)")
      .style("font-weight", "600")
      .style("pointer-events", "none")
      .style("opacity", d => {
        if (nodeLabelMode === "none") return 0;
        if (nodeLabelMode === "major" && !top20PercentIds.has(d.id)) return 0;
        if (!selectedUniversity) return 1;
        return d.name === selectedUniversity ? 1 : 0.3;
      });

    // Calculate connection counts for each university
    const connectionCounts = new Map<string, number>();
    links.forEach(link => {
      const sourceId = typeof link.source === 'string' ? link.source : (link.source as any).id;
      const targetId = typeof link.target === 'string' ? link.target : (link.target as any).id;
      connectionCounts.set(sourceId, (connectionCounts.get(sourceId) || 0) + 1);
      connectionCounts.set(targetId, (connectionCounts.get(targetId) || 0) + 1);
    });

    // Add hover interactions
    nodeGroup
      .on("mouseover", function (_event, d) {
        d3.select(this).select("circle").attr("stroke-width", 3);
        const instData = institutionMap.get(d.name);
        const connections = connectionCounts.get(d.id) || 0;
        tooltip.style("opacity", 1).html(`
          <strong>${d.display_name}</strong><br/>
          ICI: ${d.totalICI.toFixed(2)}<br/>
          Authors: ${d.authorCount}<br/>
          Papers: ${instData?.field_papers || 0}<br/>
          Citations: ${instData?.field_citations || 0}<br/>
          Connections: ${connections}
        `);
      })
      .on("mousemove", (event) => {
        tooltip
          .style("left", event.pageX + 10 + "px")
          .style("top", event.pageY - 10 + "px");
      })
      .on("mouseout", function () {
        d3.select(this).select("circle").attr("stroke-width", 2);
        tooltip.style("opacity", 0);
      });

    simulation.on("tick", () => {
      linkEl
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);
      nodeGroup.attr("transform", d => `translate(${d.x},${d.y})`);
    });

    return () => {
      simulation.stop();
      if (tooltipRef.current) {
        tooltipRef.current.remove();
        tooltipRef.current = null;
      }
    };
  }, [authorships, domainAuthorIds, domain, maxUniversities, edgeStrength, canadianFilter, selectedUniversity, nodeLabelMode, onUniversitiesChange, institutions]);

  // Render adjacency matrix for matrix university
  useEffect(() => {
    if (!matrixUniversity || !matrixSvgRef.current || authorships.length === 0) {
      return;
    }

    d3.select(matrixSvgRef.current).selectAll("*").remove();

    // Get authors for the matrix university
    const filteredAuthorships = authorships.filter((a) => {
      if (canadianFilter === "full") return a.canadian_status === "full";
      return a.canadian_status === "full" || a.canadian_status === "partial";
    });

    const authorMap = new Map<string, Author>();
    filteredAuthorships.forEach((authorship) => {
      authorship.ids.forEach((authorId, idx) => {
        if (!authorMap.has(authorId) && (domainAuthorIds === null || domainAuthorIds.has(authorId))) {
          const institution = authorship.last_known_institutions[idx];
          const instName = institution?.label_name || institution?.display_name || "Unknown";
          if (instName === matrixUniversity) {
            authorMap.set(authorId, {
              id: authorId,
              name: authorship.names[idx],
              aci: authorship.ACIs[idx],
              field_citations: authorship.field_citations[idx],
              field_papers: authorship.field_papers[idx],
              institution: instName,
              institutionId: institution?.id || "unknown",
            });
          }
        }
      });
    });

    const authors = Array.from(authorMap.values()).sort((a, b) => b.aci - a.aci);
    if (authors.length === 0) return;

    // Build collaboration links within this university
    const links: Array<{ source: string; target: string; fwci: number; citations: number; papers: number }> = [];
    const linkMap = new Map<string, { fwci: number; citations: number; papers: number }>();
    const authorIds = new Set(authors.map(a => a.id));

    filteredAuthorships.forEach((authorship) => {
      const coauthorIds = authorship.ids.filter(id => authorIds.has(id));
      for (let i = 0; i < coauthorIds.length; i++) {
        for (let j = i + 1; j < coauthorIds.length; j++) {
          const key = [coauthorIds[i], coauthorIds[j]].sort().join("+");
          if (linkMap.has(key)) {
            const existing = linkMap.get(key)!;
            existing.fwci += authorship.total_fwci;
            existing.citations += authorship.total_cited_by_count;
            existing.papers += authorship.total_papers;
          } else {
            linkMap.set(key, {
              fwci: authorship.total_fwci,
              citations: authorship.total_cited_by_count,
              papers: authorship.total_papers,
            });
            links.push({
              source: coauthorIds[i],
              target: coauthorIds[j],
              fwci: authorship.total_fwci,
              citations: authorship.total_cited_by_count,
              papers: authorship.total_papers,
            });
          }
        }
      }
    });

    // Sort authors alphabetically by last name
    const getLastName = (name: string) => {
      const parts = name.split(" ");
      return parts.length >= 2 ? parts[parts.length - 1] : name;
    };

    const sortedAuthors = [...authors].sort((a, b) =>
      getLastName(a.name).toLowerCase().localeCompare(getLastName(b.name).toLowerCase())
    );

    // Matrix layout
    const cellSize = 15;
    const getLabelText = (d: Author) => {
      const ln = getLastName(d.name);
      return ln.length > 12 ? ln.slice(0, 12) + "..." : ln;
    };

    const maxLabelWidth = Math.max(...sortedAuthors.map((d) => getLabelText(d).length * 6));
    const labelPadding = maxLabelWidth + 10;

    const matrixWidth = sortedAuthors.length * cellSize;
    const matrixHeight = sortedAuthors.length * cellSize;

    const svgEl = d3.select(matrixSvgRef.current)
      .attr("width", matrixWidth + labelPadding + 40)
      .attr("height", matrixHeight + labelPadding + 20);

    const g = svgEl.append("g").attr("transform", `translate(20, ${labelPadding})`);

    // Draw background
    g.append("rect")
      .attr("x", labelPadding)
      .attr("y", 0)
      .attr("width", matrixWidth)
      .attr("height", matrixHeight)
      .attr("fill", "rgba(0, 0, 0, 0.02)")
      .attr("stroke", "rgba(0, 0, 0, 0.15)")
      .attr("stroke-width", 2)
      .attr("rx", 4);

    // Row label backgrounds
    g.selectAll("rect.label-bg")
      .data(sortedAuthors)
      .enter()
      .append("rect")
      .attr("x", 0)
      .attr("y", (_d, i) => i * cellSize)
      .attr("width", labelPadding - 5)
      .attr("height", cellSize)
      .attr("fill", "white")
      .attr("opacity", 0.8);

    // Row labels
    g.selectAll("text.row-label")
      .data(sortedAuthors)
      .enter()
      .append("text")
      .attr("x", labelPadding - 5)
      .attr("y", (_d, i) => i * cellSize + cellSize / 2)
      .attr("text-anchor", "end")
      .attr("dominant-baseline", "middle")
      .attr("font-size", "10px")
      .style("fill", "rgba(0,0,0,0.75)")
      .text(getLabelText);

    // Column label unified background
    g.append("rect")
      .attr("x", labelPadding)
      .attr("y", -labelPadding + 5)
      .attr("width", matrixWidth + 15)
      .attr("height", labelPadding - 7)
      .attr("fill", "white")
      .attr("opacity", 0.8);

    // Column labels
    g.selectAll("text.col-label")
      .data(sortedAuthors)
      .enter()
      .append("text")
      .attr("x", (_d, i) => labelPadding + i * cellSize + cellSize / 2)
      .attr("y", -5)
      .attr("text-anchor", "start")
      .attr("dominant-baseline", "middle")
      .attr("font-size", "10px")
      .style("fill", "rgba(0,0,0,0.75)")
      .attr("transform", (_d, i) => `rotate(-60, ${labelPadding + i * cellSize + cellSize / 2}, -5)`)
      .text(getLabelText);

    // Create matrix data
    const matrixData: Array<{
      row: number;
      col: number;
      rowAuthor: Author;
      colAuthor: Author;
      link?: { fwci: number; citations: number; papers: number };
    }> = [];

    sortedAuthors.forEach((rowAuthor, i) => {
      sortedAuthors.forEach((colAuthor, j) => {
        const link = i !== j ? links.find(l =>
          (l.source === rowAuthor.id && l.target === colAuthor.id) ||
          (l.target === rowAuthor.id && l.source === colAuthor.id)
        ) : undefined;
        matrixData.push({ row: i, col: j, rowAuthor, colAuthor, link });
      });
    });

    // Color scales
    const connectionValues = matrixData
      .filter(d => d.link)
      .map(d => {
        if (edgeStrength === "none") return 1;
        if (edgeStrength === "total_fwci") return d.link!.fwci;
        if (edgeStrength === "total_cited_by_count") return d.link!.citations;
        return d.link!.papers;
      });

    const luminanceScale = d3.scaleLinear()
      .domain([d3.min(connectionValues) || 0, d3.max(connectionValues) || 1])
      .range([0.6, 0.0]);

    const aciOpacityScale = d3.scaleLinear()
      .domain([d3.min(sortedAuthors, a => a.aci) || 0, d3.max(sortedAuthors, a => a.aci) || 1])
      .range([0.4, 1.0]);

    // Setup matrix tooltip
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
    const matrixTooltip = tooltipRef.current;

    // Get the color for this university
    const universityVisual = universityColors.get(matrixUniversity);
    const universityColor = universityVisual?.color || "#4a90e2";

    // Draw cells
    g.selectAll("rect.cell")
      .data(matrixData)
      .enter()
      .append("rect")
      .attr("x", d => labelPadding + d.col * cellSize)
      .attr("y", d => d.row * cellSize)
      .attr("width", cellSize - 1)
      .attr("height", cellSize - 1)
      .attr("fill", d => {
        if (d.row === d.col) return universityColor;
        if (d.link) {
          let strength = 0;
          if (edgeStrength === "none") strength = 1;
          else if (edgeStrength === "total_fwci") strength = d.link.fwci;
          else if (edgeStrength === "total_cited_by_count") strength = d.link.citations;
          else strength = d.link.papers;
          const lightness = luminanceScale(strength);
          return d3.hsl(0, 0, lightness).toString();
        }
        return "#f0f0f0";
      })
      .attr("stroke", "#fff")
      .attr("stroke-width", 0.5)
      .style("opacity", d => d.row === d.col ? aciOpacityScale(d.rowAuthor.aci) : 0.6)
      .on("mouseover", function (_event, d) {
        if (d.row === d.col) {
          // Diagonal cell - show author info
          matrixTooltip.style("opacity", 1).html(`
            <strong>${d.rowAuthor.name}</strong><br/>
            ${matrixUniversity}<br/>
            <br/>
            <strong>Metrics:</strong><br/>
            ACI: ${d.rowAuthor.aci.toFixed(2)}<br/>
            Citations: ${d.rowAuthor.field_citations}<br/>
            Papers: ${d.rowAuthor.field_papers}<br/>
          `);
        } else if (d.link) {
          // Collaboration cell
          matrixTooltip.style("opacity", 1).html(`
            <strong>Collaboration</strong><br/>
            ${d.rowAuthor.name}<br/>
            ↔<br/>
            ${d.colAuthor.name}<br/>
            <br/>
            <strong>Metrics:</strong><br/>
            FWCI: ${d.link.fwci.toFixed(2)}<br/>
            Citations: ${d.link.citations}<br/>
            Papers: ${d.link.papers}<br/>
            ${edgeStrength !== "none" ? `<br/><strong>Selected Strength:</strong> ${
              edgeStrength === "total_fwci" ? d.link.fwci.toFixed(2) :
              edgeStrength === "total_cited_by_count" ? d.link.citations :
              d.link.papers
            }` : ''}
          `);
        }
      })
      .on("mousemove", function (event) {
        matrixTooltip
          .style("left", event.pageX + 10 + "px")
          .style("top", event.pageY - 10 + "px");
      })
      .on("mouseout", function () {
        matrixTooltip.style("opacity", 0);
      });

  }, [matrixUniversity, authorships, domainAuthorIds, canadianFilter, edgeStrength, universityColors]);

  return (
    <>
      <svg ref={svgRef}></svg>
      {matrixUniversity && (
        <div style={{
          position: "absolute",
          right: "280px",
          top: "20px",
          maxHeight: "calc(100% - 40px)",
          background: "#f5f5f1",
          border: "2px solid rgba(0, 0, 0, 0.15)",
          borderRadius: "8px",
          boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
          overflow: "auto",
          zIndex: 10,
        }}>
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "12px 16px",
            background: "#eaeae6",
            borderBottom: "1px solid rgba(0, 0, 0, 0.1)",
          }}>
            <h3 style={{ fontSize: "14px", fontWeight: 600, margin: 0, color: "rgba(0, 0, 0, 0.7)" }}>
              {matrixUniversity}
            </h3>
          </div>
          <div style={{ padding: "10px" }}>
            <svg ref={matrixSvgRef}></svg>
          </div>
        </div>
      )}
    </>
  );
}

