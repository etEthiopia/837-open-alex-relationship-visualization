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
  fx?: number | null;
  fy?: number | null;
}

interface MatrixNode {
  id: string;
  institution: string;
  authors: Node[];
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
  const [matrixUniversities, setMatrixUniversities] = useState<Set<string>>(new Set());

  // Load data
  useEffect(() => {
    fetch("/data/authorships.json")
      .then((res) => res.json())
      .then((data: Authorship[]) => {
        setAuthorships(data);
      });
  }, []);

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

    // Constants for matrix visualization
    const cellSize = 15;
    const labelPadding = 80; // Space for author names on the left

    // Separate nodes and matrix nodes based on matrixUniversities
    const matrixNodes: MatrixNode[] = [];
    const regularNodes: Node[] = [];
    const authorToMatrix = new Map<string, MatrixNode>();

    displayAuthors.forEach((author) => {
      if (matrixUniversities.has(author.institution)) {
        // Find or create matrix node for this institution
        let matrixNode = matrixNodes.find((m) => m.institution === author.institution);
        if (!matrixNode) {
          matrixNode = {
            id: `matrix-${author.institution}`,
            institution: author.institution,
            authors: [],
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

    // Update matrix node dimensions based on number of authors
    matrixNodes.forEach((matrix) => {
      const size = matrix.authors.length * cellSize;
      matrix.width = size; // Just the matrix width (without padding for force simulation)
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
        // Both in same matrix - internal link
        internalLinks.push(link);
      } else {
        // At least one is outside matrix - create bridge link
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

    // Create combined nodes for force simulation
    type SimulationNode = Node | MatrixNode;
    const allNodes: SimulationNode[] = [...regularNodes, ...matrixNodes];

    // Create force simulation with combined nodes
    const simulation = d3
      .forceSimulation<SimulationNode>(allNodes)
      .force(
        "link",
        d3
          .forceLink<SimulationNode, Link>(externalLinks)
          .id((d: any) => {
            // For matrix nodes, use their id; for regular nodes, use author id
            return 'authors' in d ? d.id : d.id;
          })
          .distance(150)
          .strength((d) => (edgeStrength === "none" ? 0.1 : d.value / 1000))
      )
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force(
        "collision",
        d3.forceCollide().radius((d: any) => {
          if ('authors' in d) {
            // Matrix node - use its visual size (including label padding)
            const visualWidth = d.width + labelPadding;
            return Math.max(visualWidth, d.height) / 2 + 20;
          } else {
            // Regular node
            return (useSizeEncoding ? sizeScale(d.aci) : 5) + 2;
          }
        })
      );

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

    // Helper function to calculate anchor point on matrix edge (top edge for columns)
    const getMatrixAnchor = (
      matrixNode: MatrixNode,
      author: Node
    ) => {
      const authorIndex = matrixNode.authors.findIndex((a) => a.id === author.id);
      if (authorIndex === -1) return { x: matrixNode.x!, y: matrixNode.y! };

      const halfHeight = matrixNode.height / 2;

      // Use column position (top edge) to avoid occluding row labels
      // The matrix cells start at labelPadding offset from the left edge
      const columnOffset = (authorIndex + 0.5) * cellSize;
      const anchorX = matrixNode.x! - matrixNode.width / 2 + columnOffset;
      const anchorY = matrixNode.y! - halfHeight;

      return { x: anchorX, y: anchorY };
    };

    // Draw external/bridge links
    const link = svg
      .append("g")
      .attr("class", "links")
      .selectAll("path")
      .data(externalLinks)
      .enter()
      .append("path")
      .attr("stroke", "#999")
      .attr("stroke-opacity", 0.6)
      .attr("stroke-width", (d) => (edgeStrength === "none" ? 1 : linkWidthScale(d.value)))
      .attr("fill", "none");

    // Draw matrix groups
    const matrixGroup = svg
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

    // Draw matrix background (only around the matrix cells, not the labels)
    matrixGroup
      .append("rect")
      .attr("class", "matrix-bg")
      .attr("x", labelPadding) // Start at the beginning of the matrix cells
      .attr("width", (d) => d.width) // Only the width of the matrix cells
      .attr("height", (d) => d.height)
      .attr("fill", (d) => {
        // Use a light tint of the university color
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

      // Add row labels (positioned in the label padding area)
      matrix
        .selectAll("text.row-label")
        .data(authors)
        .enter()
        .append("text")
        .attr("class", "row-label")
        .attr("x", labelPadding - 5) // Position at the end of label padding area
        .attr("y", (d, i) => i * cellSize + cellSize / 2)
        .attr("text-anchor", "end")
        .attr("dominant-baseline", "middle")
        .attr("font-size", "10px")
        .attr("fill", "#333")
        .attr("font-weight", "500")
        .text((d) => {
          // Truncate long names
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

          // Check if there's a link between these authors
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

      // Draw cells (offset by labelPadding to start after labels)
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
          return d.value > 0 ? "#333" : "#f0f0f0";
        })
        .attr("stroke", "#fff")
        .attr("stroke-width", 0.5)
        .style("opacity", (d) => {
          if (!selectedInstitution) return d.row === d.col ? 0.8 : 0.6;
          return matrixNode.institution === selectedInstitution ? 1.0 : 0.2;
        })
        .on("mouseover", function (event, d) {
          if (d.row === d.col) {
            // Diagonal - show author info
            tooltip.style("opacity", 1).html(`
              <strong>${d.rowAuthor.name}</strong><br/>
              Institution: ${d.rowAuthor.institution}<br/>
              ACI: ${d.rowAuthor.aci.toFixed(2)}
            `);
          } else if (d.value > 0 && d.linkData) {
            // Connection exists - show collaboration info
            tooltip.style("opacity", 1).html(`
              <strong>Collaboration</strong><br/>
              ${d.rowAuthor.name}<br/>
              ↔<br/>
              ${d.colAuthor.name}<br/>
              Connection Strength: ${d.linkData.value.toFixed(2)}
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

    // Draw regular nodes
    const node = svg
      .append("g")
      .attr("class", "nodes")
      .selectAll("circle")
      .data(regularNodes)
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
      // Constrain regular nodes within bounds
      regularNodes.forEach((d) => {
        const radius = useSizeEncoding ? sizeScale(d.aci) : 6;
        d.x = Math.max(radius, Math.min(width - radius, d.x!));
        d.y = Math.max(radius, Math.min(height - radius, d.y!));
      });

      // Constrain matrix nodes within bounds (accounting for label padding on left)
      matrixNodes.forEach((d) => {
        const halfWidth = d.width / 2;
        const halfHeight = d.height / 2;
        // Add labelPadding to left boundary to prevent labels from going off-screen
        d.x = Math.max(halfWidth + labelPadding, Math.min(width - halfWidth, d.x!));
        d.y = Math.max(halfHeight, Math.min(height - halfHeight, d.y!));
      });

      // Update bridge link positions
      link.attr("d", (d: any) => {
        const source = d.source;
        const target = d.target;

        let x1: number, y1: number, x2: number, y2: number;

        // Calculate source position
        if ('authors' in source && d.originalSource) {
          // Source is a matrix - get anchor point for specific author
          const anchor = getMatrixAnchor(source, d.originalSource);
          x1 = anchor.x;
          y1 = anchor.y;
        } else {
          // Source is a regular node
          x1 = source.x!;
          y1 = source.y!;
        }

        // Calculate target position
        if ('authors' in target && d.originalTarget) {
          // Target is a matrix - get anchor point for specific author
          const anchor = getMatrixAnchor(target, d.originalTarget);
          x2 = anchor.x;
          y2 = anchor.y;
        } else {
          // Target is a regular node
          x2 = target.x!;
          y2 = target.y!;
        }

        // Create a simple line path (can be curved if desired)
        return `M${x1},${y1} L${x2},${y2}`;
      });

      // Update regular node positions
      node.attr("cx", (d) => d.x!).attr("cy", (d) => d.y!);

      // Update matrix positions (accounting for label padding on the left)
      matrixGroup.attr("transform", (d) => `translate(${d.x! - d.width / 2 - labelPadding}, ${d.y! - d.height / 2})`);
    });

    // Drag functions for regular nodes
    function dragstarted(event: any, d: Node) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event: any, d: Node) {
      const radius = useSizeEncoding ? sizeScale(d.aci) : 6;
      d.fx = Math.max(radius, Math.min(width - radius, event.x));
      d.fy = Math.max(radius, Math.min(height - radius, event.y));
    }

    function dragended(event: any, d: Node) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }

    // Drag functions for matrix nodes
    function dragstartedMatrix(event: any, d: MatrixNode) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function draggedMatrix(event: any, d: MatrixNode) {
      const halfWidth = d.width / 2;
      const halfHeight = d.height / 2;
      // Account for label padding on the left
      d.fx = Math.max(halfWidth + labelPadding, Math.min(width - halfWidth, event.x));
      d.fy = Math.max(halfHeight, Math.min(height - halfHeight, event.y));
    }

    function dragendedMatrix(event: any, d: MatrixNode) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
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
    matrixUniversities,
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
            >
              <div
                className={styles.colorBox}
                style={{ backgroundColor: uni.color }}
                onClick={() =>
                  setSelectedInstitution(selectedInstitution === uni.name ? null : uni.name)
                }
              />
              <span
                className={styles.universityName}
                onClick={() =>
                  setSelectedInstitution(selectedInstitution === uni.name ? null : uni.name)
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
