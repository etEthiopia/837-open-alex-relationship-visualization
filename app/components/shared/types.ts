import * as d3 from "d3";

// ──────────────────────────────────────────────────────────────
// Core Domain Types
// ──────────────────────────────────────────────────────────────

export interface Institution {
  id: string;
  name: string;
  label_name?: string;
  display_name: string;
  country_code: string;
  type: string;
  ICI?: number;
  totalACI?: number;
}

export interface Author {
  id: string;
  name: string;
  aci: number;
  field_citations: number;
  field_papers: number;
  institution: string;
  institutionId: string;
}

export interface Authorship {
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

// ──────────────────────────────────────────────────────────────
// Network & Graph Types
// ──────────────────────────────────────────────────────────────

export interface BaseNode extends d3.SimulationNodeDatum {
  id: string;
  name: string;
  institution: string;
  institutionId?: string;
  cluster?: number;
}

export interface AuthorNode extends BaseNode {
  aci: number;
  field_citations: number;
  field_papers: number;
  linkCount: number;
  isCenter?: boolean;
  sharedPapers?: number;
  totalCitations?: number;
  r?: number;
}

export interface UniversityNode extends BaseNode {
  display_name: string;
  authors: AuthorNode[];
  totalICI: number;
  totalACI: number;
  authorCount: number;
  width?: number;
  height?: number;
  labelPadding?: number;
}

export interface MatrixNode extends d3.SimulationNodeDatum {
  id: string;
  institution: string;
  authors: AuthorNode[];
  cluster: number;
  width: number;
  height: number;
  labelPadding?: number;
}

export interface Link extends d3.SimulationLinkDatum<BaseNode> {
  value: number;
  strokeWidth?: number;
  fwci?: number;
  citations?: number;
  papers?: number;
  originalSource?: AuthorNode;
  originalTarget?: AuthorNode;
}

// ──────────────────────────────────────────────────────────────
// Visual & UI Types
// ──────────────────────────────────────────────────────────────

export type EdgeStrengthMetric =
  | "total_fwci"
  | "total_cited_by_count"
  | "total_papers"
  | "none";

export type NodeLabelMode = "major" | "all" | "none";

export interface UniversityVisual {
  name: string;
  display_name?: string;
  color: string;
  texture: string;
  luminance: "dark" | "light";
  totalACI: number;
  count: number;
}
