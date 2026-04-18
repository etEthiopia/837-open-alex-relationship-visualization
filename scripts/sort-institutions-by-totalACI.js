#!/usr/bin/env node

/**
 * Utility script to compute totalACI for institutions and sort by totalACI (descending)
 * across all data directories.
 *
 * totalACI = sum of all Canadian authors' ACI from that institution
 * No filters applied - uses all Canadian authors in the dataset
 *
 * Usage: node scripts/sort-institutions-by-totalACI.js
 */

const fs = require('fs');
const path = require('path');

// Define the data directories to process
const dataDirs = [
  'public/data',
  'public/data_computer_vision',
  'public/data_information_systems'
];

function computeAndSortInstitutions(dataDir) {
  const institutionsPath = path.join(process.cwd(), dataDir, 'institutions_canadian.json');
  const authorsPath = path.join(process.cwd(), dataDir, 'authors_canadian.json');

  console.log(`Processing ${dataDir}...`);

  try {
    // Read institutions and authors
    const institutions = JSON.parse(fs.readFileSync(institutionsPath, 'utf8'));
    const authors = JSON.parse(fs.readFileSync(authorsPath, 'utf8'));

    // Filter to Canadian authors only
    const canadianAuthors = authors.filter(author =>
      author.last_known_institution?.country_code === "CA"
    );

    console.log(`  Found ${canadianAuthors.length} Canadian authors`);

    // Compute totalACI for each institution
    const institutionACI = new Map();

    canadianAuthors.forEach(author => {
      const instId = author.last_known_institution?.id;
      if (instId) {
        institutionACI.set(instId, (institutionACI.get(instId) || 0) + author.aci);
      }
    });

    // Add totalACI to institutions and filter to only those with authors
    const institutionsWithACI = institutions
      .map(inst => ({
        ...inst,
        totalACI: institutionACI.get(inst.id) || 0
      }))
      .filter(inst => inst.totalACI > 0);

    // Sort by totalACI descending
    institutionsWithACI.sort((a, b) => b.totalACI - a.totalACI);

    // Write back to file
    fs.writeFileSync(institutionsPath, JSON.stringify(institutionsWithACI, null, 2), 'utf8');

    console.log(`✓ Sorted ${institutionsWithACI.length} institutions by totalACI`);
    console.log(`  Top 3: ${institutionsWithACI.slice(0, 3).map(i => `${i.name} (totalACI: ${i.totalACI.toFixed(2)})`).join(', ')}`);

  } catch (error) {
    console.error(`✗ Error processing ${dataDir}:`, error.message);
  }
}

// Main execution
console.log('Computing totalACI and sorting institutions_canadian.json files...\n');

dataDirs.forEach(dir => {
  computeAndSortInstitutions(dir);
  console.log('');
});

console.log('Done!');
