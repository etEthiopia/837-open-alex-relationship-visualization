#!/usr/bin/env python3
"""
Clean counts_by_year in authors_canadian.json files.
Only keep data for years 2024, 2025, and 2026.
"""

import json
from pathlib import Path
from typing import List, Dict, Any

# Define the data paths
DATA_PATHS = [
    "public/data",
    "public/data_computer_vision",
    "public/data_information_systems"
]

# Years to keep
YEARS_TO_KEEP = [2024, 2025, 2026]


def clean_counts_by_year(authors: List[Dict[str, Any]]) -> tuple[int, int]:
    """
    Clean counts_by_year for all authors.

    Returns:
        Tuple of (total_authors, authors_modified)
    """
    total_authors = len(authors)
    authors_modified = 0

    for author in authors:
        if "counts_by_year" not in author:
            continue

        original_length = len(author["counts_by_year"])

        # Filter to only keep the specified years
        author["counts_by_year"] = [
            entry for entry in author["counts_by_year"]
            if entry.get("year") in YEARS_TO_KEEP
        ]

        # Sort by year (most recent first)
        author["counts_by_year"].sort(key=lambda x: x.get("year", 0), reverse=True)

        if len(author["counts_by_year"]) != original_length:
            authors_modified += 1

    return total_authors, authors_modified


def process_file(file_path: Path) -> None:
    """Process a single authors_canadian.json file."""
    if not file_path.exists():
        print(f"Warning: {file_path} not found, skipping")
        return

    print(f"\nProcessing {file_path}...")

    # Read the file
    with open(file_path, 'r', encoding='utf-8') as f:
        authors = json.load(f)

    # Clean the data
    total, modified = clean_counts_by_year(authors)

    # Write back to file
    with open(file_path, 'w', encoding='utf-8') as f:
        json.dump(authors, f, indent=2, ensure_ascii=False)

    print(f"  Total authors: {total}")
    print(f"  Authors modified: {modified}")
    print(f"  Saved to {file_path}")


def main():
    """Main execution."""
    print("Starting counts_by_year cleanup...")
    print(f"Keeping only years: {', '.join(map(str, YEARS_TO_KEEP))}")

    total_files = 0
    total_authors = 0
    total_modified = 0

    for data_path in DATA_PATHS:
        file_path = Path(data_path) / "authors_canadian.json"

        if file_path.exists():
            total_files += 1

            # Read and process
            with open(file_path, 'r', encoding='utf-8') as f:
                authors = json.load(f)

            count_total, count_modified = clean_counts_by_year(authors)
            total_authors += count_total
            total_modified += count_modified

            # Write back
            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(authors, f, indent=2, ensure_ascii=False)

            print(f"\nProcessed {file_path}")
            print(f"  Authors: {count_total}")
            print(f"  Modified: {count_modified}")

    print("\n=== Summary ===")
    print(f"Files processed: {total_files}")
    print(f"Total authors processed: {total_authors}")
    print(f"Total authors modified: {total_modified}")
    print("\nCleanup complete!")


if __name__ == "__main__":
    main()
