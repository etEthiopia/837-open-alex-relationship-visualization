#!/usr/bin/env python3
"""
Unify institutions_canadian.json from three fields into a single file.

Common fields are reused, field-specific properties are nested under field keys.
Mismatches in common properties are logged separately.
Removes redundant works_count and cited_by_count.
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

# Field-specific properties that will be nested
FIELD_SPECIFIC_PROPERTIES = [
    "field_citations",
    "field_papers",
    "stats_per_year",
    "ICI",
    "totalACI"
]

# Fields to remove (redundant)
REDUNDANT_FIELDS = [
    "works_count",
    "cited_by_count"
]

# Optional fields that can be None in some fields but present in others
# For these, we'll prefer the non-None value
OPTIONAL_FIELDS = [
    "shortand_name",  # Note: typo in original data
    "shorthand_name",
    "label_name"
]


def load_institutions(field: str) -> Dict[str, Dict[str, Any]]:
    """Load institutions from a field's JSON file."""
    file_path = Path(DATA_PATHS[field]) / "institutions_canadian.json"

    if not file_path.exists():
        print(f"Warning: {file_path} not found, skipping {field}")
        return {}

    with open(file_path, 'r', encoding='utf-8') as f:
        institutions = json.load(f)

    # Index by institution id
    return {inst['id']: inst for inst in institutions}


def get_common_fields(institution: Dict[str, Any]) -> List[str]:
    """Get list of common fields (excluding field-specific and redundant)."""
    all_fields = set(institution.keys())
    excluded = set(FIELD_SPECIFIC_PROPERTIES + REDUNDANT_FIELDS)
    return sorted(all_fields - excluded)


def compare_common_fields(inst1: Dict[str, Any], inst2: Dict[str, Any],
                         field1: str, field2: str,
                         common_fields: List[str]) -> List[str]:
    """Compare common fields between two institution records. Return list of differences."""
    differences = []

    for field in common_fields:
        val1 = inst1.get(field)
        val2 = inst2.get(field)

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


def unify_institutions() -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Unify institutions from all three fields.

    Returns:
        - List of unified institution records
        - List of mismatch records
    """
    print("Loading institutions from all fields...")

    # Load all institutions
    institutions_by_field = {
        field: load_institutions(field)
        for field in DATA_PATHS.keys()
    }

    # Get all unique institution IDs
    all_institution_ids = set()
    for institutions in institutions_by_field.values():
        all_institution_ids.update(institutions.keys())

    print(f"Found {len(all_institution_ids)} unique institutions across all fields")

    unified_institutions = []
    mismatches = []

    for institution_id in sorted(all_institution_ids):
        # Get institution records from each field (may be None if not present)
        records = {
            field: institutions.get(institution_id)
            for field, institutions in institutions_by_field.items()
        }

        # Filter out None values
        present_records = {field: record for field, record in records.items() if record is not None}

        if not present_records:
            continue

        # Use the first available record as the base for common fields
        base_field = next(iter(present_records.keys()))
        base_record = present_records[base_field]

        # Get common fields from base record
        common_fields = get_common_fields(base_record)

        # Check for mismatches in common fields
        has_mismatch = False
        mismatch_details = []

        for field, record in present_records.items():
            if field == base_field:
                continue

            differences = compare_common_fields(base_record, record, base_field, field, common_fields)
            if differences:
                has_mismatch = True
                mismatch_details.extend(differences)

        if has_mismatch:
            # Log mismatch and skip this institution
            mismatches.append({
                "id": institution_id,
                "display_name": base_record.get("display_name", "Unknown"),
                "name": base_record.get("name", "Unknown"),
                "present_in_fields": list(present_records.keys()),
                "differences": mismatch_details
            })
            print(f"Skipping {institution_id} ({base_record.get('name', 'Unknown')}) due to mismatches in common fields")
            continue

        # Build unified institution record
        unified_institution = {}

        # Add common fields from base record (excluding redundant ones)
        for field in common_fields:
            if field in REDUNDANT_FIELDS:
                continue

            # For optional fields, prefer non-None values from any record
            if field in OPTIONAL_FIELDS:
                value = None
                for record in present_records.values():
                    if field in record and record[field] is not None:
                        value = record[field]
                        break
                if value is not None:
                    unified_institution[field] = value
            else:
                # For non-optional fields, use base record value
                if field in base_record:
                    unified_institution[field] = base_record[field]

        # Add field-specific properties
        for prop in FIELD_SPECIFIC_PROPERTIES:
            unified_institution[prop] = {}

            for field, record in present_records.items():
                if prop in record:
                    unified_institution[prop][field] = record[prop]

        unified_institutions.append(unified_institution)

    print(f"Successfully unified {len(unified_institutions)} institutions")
    print(f"Found {len(mismatches)} institutions with mismatches")

    return unified_institutions, mismatches


def main():
    """Main execution."""
    print("Starting institution unification...")

    unified_institutions, mismatches = unify_institutions()

    # Write unified institutions
    output_path = Path("public/data_unified/institutions_canadian.json")
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(unified_institutions, f, indent=2, ensure_ascii=False)

    print(f"Wrote unified institutions to {output_path}")

    # Write mismatches
    mismatches_path = Path("public/data_unified/institution_mismatches.json")
    with open(mismatches_path, 'w', encoding='utf-8') as f:
        json.dump(mismatches, f, indent=2, ensure_ascii=False)

    print(f"Wrote mismatches to {mismatches_path}")

    # Print summary statistics
    print("\n=== Summary ===")
    print(f"Total unified institutions: {len(unified_institutions)}")
    print(f"Institutions with mismatches: {len(mismatches)}")

    # Count institutions by field presence
    field_counts = {field: 0 for field in DATA_PATHS.keys()}
    multi_field_count = 0

    for institution in unified_institutions:
        fields_present = []
        for prop in FIELD_SPECIFIC_PROPERTIES:
            fields_present.extend(institution.get(prop, {}).keys())

        unique_fields = set(fields_present)
        for field in unique_fields:
            field_counts[field] += 1

        if len(unique_fields) > 1:
            multi_field_count += 1

    print(f"\nInstitutions per field:")
    for field, count in field_counts.items():
        print(f"  {field}: {count}")
    print(f"\nInstitutions appearing in multiple fields: {multi_field_count}")


if __name__ == "__main__":
    main()
