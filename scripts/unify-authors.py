#!/usr/bin/env python3
"""
Unify authors_canadian.json from three fields into a single file.

Common fields are reused, field-specific properties are nested under field keys.
Mismatches in common properties are logged separately.
"""

import json
from pathlib import Path
from typing import Dict, List, Any, Tuple

# Define the data paths
DATA_PATHS = {
    "hci": "public/data",
    "computer_vision": "public/data_computer_vision",
    "information_systems": "public/data_information_systems"
}

# Common fields that should be identical across all fields for the same author
COMMON_FIELDS = [
    "author_id",
    "orcid",
    "display_name",
    "institutions",
    "countries",
    "affiliations",
    "works_count",
    "cited_by_count",
    "summary_stats",
    "topics",
    "x_concepts",
    "counts_by_year",
    "works_api_url",
    "updated_date",
    "created_date",
    "last_known_institution"
]

# Field-specific properties that will be nested
FIELD_SPECIFIC_PROPERTIES = [
    "field_citations",
    "field_papers",
    "field_papers_first_authorship",
    "field_citations_first_authorship",
    "stats_per_year",
    "aci"
]

# Optional fields that can be None in some fields but present in others
# For these, we'll prefer the non-None value
OPTIONAL_FIELDS = [
    "orcid",
    "x_concepts"
]


def load_authors(field: str) -> Dict[str, Dict[str, Any]]:
    """Load authors from a field's JSON file."""
    file_path = Path(DATA_PATHS[field]) / "authors_canadian.json"

    if not file_path.exists():
        print(f"Warning: {file_path} not found, skipping {field}")
        return {}

    with open(file_path, 'r', encoding='utf-8') as f:
        authors = json.load(f)

    # Index by author_id
    return {author['author_id']: author for author in authors}


def compare_common_fields(author1: Dict[str, Any], author2: Dict[str, Any],
                         field1: str, field2: str) -> List[str]:
    """Compare common fields between two author records. Return list of differences."""
    differences = []

    for field in COMMON_FIELDS:
        val1 = author1.get(field)
        val2 = author2.get(field)

        # Handle None/missing values
        if val1 is None and val2 is None:
            continue

        # For optional fields, if one is None and the other isn't, that's OK
        # We'll prefer the non-None value when building the unified record
        if field in OPTIONAL_FIELDS:
            if val1 is None or val2 is None:
                continue

        # Simple comparison (works for primitives, lists, dicts)
        if val1 != val2:
            differences.append(f"{field}: {field1} has {type(val1).__name__}, {field2} has {type(val2).__name__}")

    return differences


def unify_authors() -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Unify authors from all three fields.

    Returns:
        - List of unified author records
        - List of mismatch records
    """
    print("Loading authors from all fields...")

    # Load all authors
    authors_by_field = {
        field: load_authors(field)
        for field in DATA_PATHS.keys()
    }

    # Get all unique author IDs
    all_author_ids = set()
    for authors in authors_by_field.values():
        all_author_ids.update(authors.keys())

    print(f"Found {len(all_author_ids)} unique authors across all fields")

    unified_authors = []
    mismatches = []

    for author_id in sorted(all_author_ids):
        # Get author records from each field (may be None if not present)
        records = {
            field: authors.get(author_id)
            for field, authors in authors_by_field.items()
        }

        # Filter out None values
        present_records = {field: record for field, record in records.items() if record is not None}

        if not present_records:
            continue

        # Use the first available record as the base for common fields
        base_field = next(iter(present_records.keys()))
        base_record = present_records[base_field]

        # Check for mismatches in common fields
        has_mismatch = False
        mismatch_details = []

        for field, record in present_records.items():
            if field == base_field:
                continue

            differences = compare_common_fields(base_record, record, base_field, field)
            if differences:
                has_mismatch = True
                mismatch_details.extend(differences)

        if has_mismatch:
            # Log mismatch and skip this author
            mismatches.append({
                "author_id": author_id,
                "display_name": base_record.get("display_name", "Unknown"),
                "present_in_fields": list(present_records.keys()),
                "differences": mismatch_details
            })
            print(f"Skipping {author_id} due to mismatches in common fields")
            continue

        # Build unified author record
        unified_author = {}

        # Add common fields from base record
        for field in COMMON_FIELDS:
            # For optional fields, prefer non-None values from any record
            if field in OPTIONAL_FIELDS:
                value = None
                for record in present_records.values():
                    if field in record and record[field] is not None:
                        value = record[field]
                        break
                if value is not None:
                    unified_author[field] = value
            else:
                # For non-optional fields, use base record value
                if field in base_record:
                    unified_author[field] = base_record[field]

        # Add field-specific properties
        for prop in FIELD_SPECIFIC_PROPERTIES:
            unified_author[prop] = {}

            for field, record in present_records.items():
                if prop in record:
                    unified_author[prop][field] = record[prop]

        unified_authors.append(unified_author)

    print(f"Successfully unified {len(unified_authors)} authors")
    print(f"Found {len(mismatches)} authors with mismatches")

    return unified_authors, mismatches


def main():
    """Main execution."""
    print("Starting author unification...")

    unified_authors, mismatches = unify_authors()

    # Write unified authors
    output_path = Path("public/data_unified/authors_canadian.json")
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(unified_authors, f, indent=2, ensure_ascii=False)

    print(f"Wrote unified authors to {output_path}")

    # Write mismatches
    mismatches_path = Path("public/data_unified/author_mismatches.json")
    with open(mismatches_path, 'w', encoding='utf-8') as f:
        json.dump(mismatches, f, indent=2, ensure_ascii=False)

    print(f"Wrote mismatches to {mismatches_path}")

    # Print summary statistics
    print("\n=== Summary ===")
    print(f"Total unified authors: {len(unified_authors)}")
    print(f"Authors with mismatches: {len(mismatches)}")

    # Count authors by field presence
    field_counts = {field: 0 for field in DATA_PATHS.keys()}
    multi_field_count = 0

    for author in unified_authors:
        fields_present = []
        for prop in FIELD_SPECIFIC_PROPERTIES:
            fields_present.extend(author.get(prop, {}).keys())

        unique_fields = set(fields_present)
        for field in unique_fields:
            field_counts[field] += 1

        if len(unique_fields) > 1:
            multi_field_count += 1

    print(f"\nAuthors per field:")
    for field, count in field_counts.items():
        print(f"  {field}: {count}")
    print(f"\nAuthors appearing in multiple fields: {multi_field_count}")


if __name__ == "__main__":
    main()
