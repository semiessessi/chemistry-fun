// Auto-MO generation: procedural LCAO molecular orbitals from bond topology.

import { buildRotationMatrix } from './utils/physics.js';

// Valence shell principal quantum number
const VALENCE_N = {
  H:1, He:1,
  Li:2, Be:2, B:2, C:2, N:2, O:2, F:2, Ne:2,
  Na:3, Mg:3, Al:3, Si:3, P:3, S:3, Cl:3, Ar:3,
  K:4, Ca:4, Ti:4, Mn:4, Fe:4, Co:4, Ni:4, Cu:4, Zn:4,
  Ge:4, As:4, Se:4, Br:4, Kr:4, Mo:5,
  Ag:5, Sn:5, I:5, Xe:5,
  Re:6, Pt:6, Au:6, Hg:6, Pb:6, Bi:6, U:7,
};

// Typical valence (number of bonds expected)
const TYPICAL_VALENCE = {
  H:1, C:4, N:3, O:2, F:1, S:2, Cl:1, Br:1, I:1, P:3, Si:4,
  Na:1, K:1, Ca:2, Mg:2, Al:3, Fe:3, Cu:2, Ti:4,
};

// Electronegativity (Pauling scale, approximate)
const ELECTRONEGATIVITY = {
  H:2.2, C:2.55, N:3.04, O:3.44, F:3.98, S:2.58, Cl:3.16,
  Br:2.96, I:2.66, P:2.19, Si:1.90, Na:0.93, K:0.82, Ca:1.0,
  Mg:1.31, Al:1.61, Fe:1.83, Cu:1.90, Ti:1.54, B:2.04,
};

/**
 * Generate approximate LCAO molecular orbitals from bond/atom data.
 * Returns array of [moName, termDefs] matching addMol format.
 * termDefs format: [atomIdx, n, l, m, angType, coeff, rot?]
 *
 * Extended term format: the 7th element (index 6) is an optional rotation matrix.
 */
export function generateMOs(atoms, bonds) {
  const mos = [];

  // Build adjacency: atomIdx → array of {other, order}
  const adj = atoms.map(() => []);
  for (const [ai, aj, order] of bonds) {
    adj[ai].push({ other: aj, order: order || 1 });
    adj[aj].push({ other: ai, order: order || 1 });
  }

  // Count bonds per atom
  const bondCount = atoms.map((_, i) => adj[i].length);

  // Helper: get bond direction vector (A → B)
  function bondDir(ai, aj) {
    const [, ax, ay, az] = atoms[ai];
    const [, bx, by, bz] = atoms[aj];
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.sqrt(dx*dx + dy*dy + dz*dz);
    if (len < 1e-10) return [0, 0, 1];
    return [dx/len, dy/len, dz/len];
  }

  // Helper: get principal quantum number for atom
  function getN(sym) { return VALENCE_N[sym] || 2; }

  // Helper: coefficient based on electronegativity
  function getCoeff(symA, symB) {
    const enA = ELECTRONEGATIVITY[symA] || 2.5;
    const enB = ELECTRONEGATIVITY[symB] || 2.5;
    const diff = Math.abs(enA - enB);
    // More electronegative atom gets higher coefficient
    if (diff < 0.3) return [0.45, 0.45];
    const total = enA + enB;
    return [enA/total * 0.9, enB/total * 0.9];
  }

  // 1. σ bonding orbitals for each bond
  const processedBonds = new Set();
  for (const [ai, aj, order] of bonds) {
    const bondKey = Math.min(ai, aj) + ',' + Math.max(ai, aj);
    if (processedBonds.has(bondKey)) continue;
    processedBonds.add(bondKey);

    const symA = atoms[ai][0], symB = atoms[aj][0];
    const nA = getN(symA), nB = getN(symB);
    const [dx, dy, dz] = bondDir(ai, aj);
    const rot = buildRotationMatrix(dx, dy, dz);
    const [cA, cB] = getCoeff(symA, symB);
    const effectiveOrder = order || 1;

    // σ bond: both atoms contribute s orbital + oriented p_z along bond
    const terms = [];
    if (symA === 'H') {
      terms.push([ai, 1, 0, 0, 'real', cA]);
    } else {
      // s contribution + p_z along bond direction
      terms.push([ai, nA, 0, 0, 'real', cA * 0.4]);
      terms.push([ai, nA, 1, 0, 'real', cA * 0.7, rot]);
    }
    if (symB === 'H') {
      terms.push([aj, 1, 0, 0, 'real', cB]);
    } else {
      // For the second atom, p_z points back toward first atom (negative direction)
      const rotB = buildRotationMatrix(-dx, -dy, -dz);
      terms.push([aj, nB, 0, 0, 'real', cB * 0.4]);
      terms.push([aj, nB, 1, 0, 'real', cB * 0.7, rotB]);
    }
    mos.push([`σ(${symA}-${symB})`, terms]);

    // 2. π orbitals for double/triple bonds
    if (effectiveOrder >= 2) {
      // π₁: p_x perpendicular to bond (m=1, cos in rotated frame)
      const piTerms = [];
      if (symA !== 'H') piTerms.push([ai, nA, 1, 1, 'cos', 0.5, rot]);
      if (symB !== 'H') {
        const rotB = buildRotationMatrix(-dx, -dy, -dz);
        piTerms.push([aj, nB, 1, 1, 'cos', 0.5, rotB]);
      }
      if (piTerms.length > 0) mos.push([`π(${symA}-${symB})`, piTerms]);
    }

    if (effectiveOrder >= 3) {
      // π₂: p_y perpendicular to bond (m=1, sin in rotated frame)
      const pi2Terms = [];
      if (symA !== 'H') pi2Terms.push([ai, nA, 1, 1, 'sin', 0.5, rot]);
      if (symB !== 'H') {
        const rotB = buildRotationMatrix(-dx, -dy, -dz);
        pi2Terms.push([aj, nB, 1, 1, 'sin', 0.5, rotB]);
      }
      if (pi2Terms.length > 0) mos.push([`π₂(${symA}-${symB})`, pi2Terms]);
    }
  }

  // 3. Aromatic π system: detect rings with bond order 1.5
  const aromaticAtoms = new Set();
  for (const [ai, aj, order] of bonds) {
    if ((order || 1) === 1.5) {
      aromaticAtoms.add(ai);
      aromaticAtoms.add(aj);
    }
  }

  if (aromaticAtoms.size >= 5) {
    // Compute average ring normal from aromatic atoms
    const aroArr = [...aromaticAtoms];
    // Use first 3 atoms to estimate plane normal
    if (aroArr.length >= 3) {
      const [, x0, y0, z0] = atoms[aroArr[0]];
      const [, x1, y1, z1] = atoms[aroArr[1]];
      const [, x2, y2, z2] = atoms[aroArr[2]];
      const e1x = x1-x0, e1y = y1-y0, e1z = z1-z0;
      const e2x = x2-x1, e2y = y2-y1, e2z = z2-z1;
      let nx = e1y*e2z - e1z*e2y;
      let ny = e1z*e2x - e1x*e2z;
      let nz = e1x*e2y - e1y*e2x;
      const nLen = Math.sqrt(nx*nx + ny*ny + nz*nz);
      if (nLen > 1e-10) {
        nx /= nLen; ny /= nLen; nz /= nLen;
        const rot = buildRotationMatrix(nx, ny, nz);
        // Delocalized π: all aromatic atoms contribute p orbital perpendicular to ring
        const piTerms = [];
        const coeff = 1 / Math.sqrt(aromaticAtoms.size);
        for (const idx of aroArr) {
          const n = getN(atoms[idx][0]);
          piTerms.push([idx, n, 1, 0, 'real', coeff, rot]);
        }
        mos.push(['π (aromatic)', piTerms]);
      }
    }
  }

  // 4. Lone pairs for O, N, F, S, Cl, Br, I with fewer bonds than expected valence
  for (let i = 0; i < atoms.length; i++) {
    const sym = atoms[i][0];
    const expected = TYPICAL_VALENCE[sym];
    if (!expected) continue;
    const actual = bondCount[i];
    if (actual >= expected) continue;
    if (sym === 'H' || sym === 'C') continue;

    const n = getN(sym);
    // Compute direction away from bonded atoms (average anti-bond direction)
    let awayX = 0, awayY = 0, awayZ = 0;
    for (const { other } of adj[i]) {
      const [dx, dy, dz] = bondDir(i, other);
      awayX -= dx; awayY -= dy; awayZ -= dz;
    }
    const awayLen = Math.sqrt(awayX*awayX + awayY*awayY + awayZ*awayZ);
    if (awayLen > 1e-10) {
      awayX /= awayLen; awayY /= awayLen; awayZ /= awayLen;
    } else {
      // If no clear direction (e.g. symmetric), use y-axis
      awayX = 0; awayY = 1; awayZ = 0;
    }
    const rot = buildRotationMatrix(awayX, awayY, awayZ);
    const lpTerms = [[i, n, 1, 0, 'real', 0.85, rot]];
    mos.push([`lone pair (${sym}${i+1})`, lpTerms]);
  }

  // 5. If no MOs were generated at all, create at minimum an s-orbital sum
  if (mos.length === 0) {
    const terms = atoms.map((a, i) => [i, getN(a[0]), 0, 0, 'real', 1/Math.sqrt(atoms.length)]);
    mos.push(['σ (total)', terms]);
  }

  return mos;
}
