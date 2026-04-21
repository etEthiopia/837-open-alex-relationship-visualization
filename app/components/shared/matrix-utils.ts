import { AuthorNode, Link } from "./types";

// ──────────────────────────────────────────────────────────────
// Matrix Utilities
// ──────────────────────────────────────────────────────────────

export function getLastName(name: string): string {
  const parts = name.split(" ");
  return parts.length >= 2 ? parts[parts.length - 1] : name;
}

export function truncateLabel(label: string, maxLength: number = 12): string {
  return label.length > maxLength ? label.slice(0, maxLength) + "..." : label;
}

// ──────────────────────────────────────────────────────────────
// Greedy Seriation Algorithm
// Reveals cliques by placing nodes with shared neighbors adjacent
// ──────────────────────────────────────────────────────────────

export function greedySeriation(
  authors: AuthorNode[],
  links: Link[]
): AuthorNode[] {
  // Build adjacency information
  const authorLinks = new Map<string, Set<string>>();
  authors.forEach((author) => {
    authorLinks.set(author.id, new Set());
  });

  links.forEach((link) => {
    const srcId = typeof link.source === "string" ? link.source : link.source.id;
    const tgtId = typeof link.target === "string" ? link.target : link.target.id;

    if (authorLinks.has(srcId) && authorLinks.has(tgtId)) {
      authorLinks.get(srcId)!.add(tgtId);
      authorLinks.get(tgtId)!.add(srcId);
    }
  });

  const ordered: AuthorNode[] = [];
  const remaining = new Set(authors.map((a) => a.id));

  // Start with the most connected author
  let currentId = authors.reduce((max, author) =>
    (authorLinks.get(author.id)?.size || 0) > (authorLinks.get(max.id)?.size || 0)
      ? author
      : max
  ).id;

  while (remaining.size > 0) {
    if (!remaining.has(currentId)) {
      // Pick next most connected from remaining
      const remainingAuthors = authors.filter((a) => remaining.has(a.id));
      if (remainingAuthors.length === 0) break;
      currentId = remainingAuthors.reduce((max, author) =>
        (authorLinks.get(author.id)?.size || 0) > (authorLinks.get(max.id)?.size || 0)
          ? author
          : max
      ).id;
    }

    const current = authors.find((a) => a.id === currentId)!;
    ordered.push(current);
    remaining.delete(currentId);

    // Find next node: the unvisited node with most shared connections to current
    let nextId: string | null = null;
    let maxShared = -1;

    remaining.forEach((candidateId) => {
      const currentNeighbors = authorLinks.get(currentId) || new Set();
      const candidateNeighbors = authorLinks.get(candidateId) || new Set();

      // Count shared neighbors + direct connection
      let shared = currentNeighbors.has(candidateId) ? 100 : 0; // Bonus for direct connection
      currentNeighbors.forEach((n) => {
        if (candidateNeighbors.has(n)) shared++;
      });

      if (shared > maxShared) {
        maxShared = shared;
        nextId = candidateId;
      }
    });

    currentId = nextId || currentId;
  }

  return ordered;
}

// ──────────────────────────────────────────────────────────────
// Matrix Data Structure Generator
// ──────────────────────────────────────────────────────────────

export interface MatrixCell {
  row: number;
  col: number;
  rowAuthor: AuthorNode;
  colAuthor: AuthorNode;
  link?: Link;
  value: number;
}

export function createMatrixData(
  authors: AuthorNode[],
  links: Link[]
): MatrixCell[] {
  const matrixData: MatrixCell[] = [];

  authors.forEach((rowAuthor, i) => {
    authors.forEach((colAuthor, j) => {
      let value = 0;
      let linkData = undefined;

      if (i !== j) {
        const link = links.find((l) => {
          const srcId = typeof l.source === "string" ? l.source : l.source.id;
          const tgtId = typeof l.target === "string" ? l.target : l.target.id;
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
        link: linkData,
      });
    });
  });

  return matrixData;
}
