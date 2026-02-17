# New Molecules Added - Phase 4, 5, 6

## Summary

**Total New Molecules: 23**

Generated from PubChem using automated batch import script.
All molecules include geometry, bonds, and basic placeholder MOs.

---

## Saccharides (5 molecules) - Category: "Sugar"

**File:** `js/molecules/saccharides-new.js`

1. **Ribose** - C₅H₁₀O₅ (PubChem CID 5779)
   - RNA sugar, furanose form
   - 20 atoms

2. **Fructose** - C₆H₁₂O₆ (PubChem CID 5984)
   - Fruit sugar, ketohexose
   - 24 atoms

3. **Lactose** - C₁₂H₂₂O₁₁ (PubChem CID 6134)
   - Milk sugar, disaccharide
   - 45 atoms

4. **Maltose** - C₁₂H₂₂O₁₁ (PubChem CID 10991283)
   - Malt sugar, disaccharide
   - 45 atoms

5. **Xylose** - C₅H₁₀O₅ (PubChem CID 135191)
   - Wood sugar, aldopentose
   - 20 atoms

---

## Oligopeptides (5 molecules) - Category: "Peptide"

**File:** `js/molecules/oligopeptides-new.js`

1. **Gly-Gly-Gly** (Triglycine) - PubChem CID 90488
   - Tripeptide, simplest 3-residue chain
   - 30 atoms

2. **Ala-Gly-Gly** - PubChem CID 7009340
   - Tripeptide
   - 33 atoms

3. **Gly-Pro-Hyp** - PubChem CID 439680
   - Collagen repeat unit
   - 42 atoms

4. **Ser-Gly** - PubChem CID 7009329
   - Dipeptide
   - 24 atoms

5. **Val-Ala** - PubChem CID 7009365
   - Dipeptide
   - 30 atoms

---

## Lipids (3 molecules) - Category: "Lipid"

**File:** `js/molecules/lipids.js`

1. **Glycerol** - C₃H₈O₃ (PubChem CID 753)
   - Trihydric alcohol, backbone of triglycerides
   - 14 atoms

2. **Propylene Glycol** - C₃H₈O₂ (PubChem CID 1030)
   - Diol, food additive
   - 13 atoms

3. **Palmitic Acid** - C₁₆H₃₂O₂ (PubChem CID 985)
   - Saturated fatty acid
   - 50 atoms

**Note:** Stearic acid (CID 5281) failed to fetch - needs correction

---

## B Vitamins (7 molecules) - Category: "Vitamin B"

**File:** `js/molecules/vitamins-b.js`

1. **Thiamine** (Vitamin B1) - C₁₂H₁₇N₄OS⁺ (PubChem CID 1130)
   - 35 atoms

2. **Riboflavin** (Vitamin B2) - C₁₇H₂₀N₄O₆ (PubChem CID 493570)
   - 47 atoms

3. **Niacin** (Vitamin B3) - C₆H₅NO₂ (PubChem CID 938)
   - 14 atoms

4. **Pantothenic Acid** (Vitamin B5) - C₉H₁₇NO₅ (PubChem CID 6613)
   - 32 atoms

5. **Pyridoxine** (Vitamin B6) - C₈H₁₁NO₃ (PubChem CID 1054)
   - 23 atoms

6. **Biotin** (Vitamin B7) - C₁₀H₁₆N₂O₃S (PubChem CID 171548)
   - 32 atoms

7. **Folic Acid** (Vitamin B9) - C₁₉H₁₉N₇O₆ (PubChem CID 6037)
   - 51 atoms

**Note:** Vitamin B12 (Cobalamin, 181 atoms) skipped - requires hand-crafted d-orbitals

---

## Neurotransmitters (3 molecules) - Category: "Neurotransmitter"

**File:** `js/molecules/neurotransmitters-new.js`

1. **Nicotine** - C₁₀H₁₄N₂ (PubChem CID 89594)
   - 26 atoms

2. **Choline** - C₅H₁₄NO⁺ (PubChem CID 305)
   - 21 atoms

3. **Acetylcholine** - C₇H₁₆NO₂⁺ (PubChem CID 187)
   - 26 atoms

---

## Technical Details

### Generation Process

1. **Batch Import Script:** `scripts/batch-import-pubchem.mjs`
   - Fetches 3D conformer data from PubChem PUG REST API
   - Converts Ångströms → Bohr units (×1.8897259886)
   - Extracts atoms (element, x, y, z) and bonds (atom pairs, order)
   - Generates molecule definition code

2. **MO Placeholder Script:** `scripts/add-basic-mos.mjs`
   - Adds basic HOMO placeholder to generated molecules
   - Full MO generation needs manual intervention or `pubchem-mo.js` integration

### Integration

All new molecule files imported in `js/molecules/index.js`:
```javascript
import './oligopeptides-new.js';
import './saccharides-new.js';
import './lipids.js';
import './vitamins-b.js';
import './neurotransmitters-new.js';
```

### Citation Metadata

All molecules include `sources` metadata:
```javascript
sources: {
  geometry: {
    type: 'pubchem',
    id: <CID>,
    citation: 'PubChem Compound Database',
    url: 'https://pubchem.ncbi.nlm.nih.gov/compound/<CID>'
  },
  mo: {
    type: 'auto',
    method: 'LCAO-auto (to be generated)'
  }
}
```

---

## TODO

1. **MO Generation:** Replace placeholder HOMOs with full `generateMOs()` output
2. **Stearic Acid:** Find correct PubChem CID and re-import
3. **Vitamin B12:** Hand-craft d-orbitals for Co center (181 atoms, complex)
4. **Testing:** Verify all molecules load and render correctly
5. **Phase 7:** Add early periodic table compounds (~25 molecules)
6. **Phase 8:** Implement molecule sorting by category/molecular weight

---

## Statistics

- **Before:** ~115 molecules
- **After Phase 4-6:** ~138 molecules (+23)
- **Target (Phase 7):** ~163 molecules (+25 more)
- **Final Target:** 265+ molecules

**Progress:** 138/265 = 52% complete

---

*Generated: 2026-02-17*
*Tools: PubChem PUG REST API, automated batch import*
