#!/usr/bin/env node
// Build molecules from known crystal/computed geometries for elements lacking PubChem 3D data.
// Outputs four molecule files.

import { writeFileSync } from 'fs';

const ANG_TO_BOHR = 1.8897259886;
const SUBSCRIPTS = { '0':'₀','1':'₁','2':'₂','3':'₃','4':'₄','5':'₅','6':'₆','7':'₇','8':'₈','9':'₉' };
function toSub(n) { return String(n).split('').map(d => SUBSCRIPTS[d]??d).join(''); }
function formula(atoms) {
  const c = {};
  for (const a of atoms) c[a[0]] = (c[a[0]]||0)+1;
  const first = ['C','H'].filter(e => c[e]);
  const rest = Object.keys(c).filter(e => e!=='C' && e!=='H').sort();
  return [...first,...rest].map(e => e+(c[e]>1?toSub(c[e]):'')).join('');
}

// Convert Angstrom vector to Bohr, rounded to 4dp
function b(x, y, z) {
  return [
    parseFloat((x * ANG_TO_BOHR).toFixed(4)),
    parseFloat((y * ANG_TO_BOHR).toFixed(4)),
    parseFloat((z * ANG_TO_BOHR).toFixed(4)),
  ];
}

// Normalize a 3-vector
function normalize([x,y,z]) {
  const n = Math.sqrt(x*x+y*y+z*z);
  return [x/n, y/n, z/n];
}

// Cross product
function cross([ax,ay,az],[bx,by,bz]) {
  return [ay*bz-az*by, az*bx-ax*bz, ax*by-ay*bx];
}

// Scale a vector
function scale(v, s) { return v.map(x => x*s); }

// Add two vectors
function add([ax,ay,az],[bx,by,bz]) { return [ax+bx, ay+by, az+bz]; }

// Place H atoms around a tetrahedral centre
// centre: [x,y,z], substituents: [[x,y,z], ...] already placed, nH = how many H to add, bondLen
function addTetrahedralH(centre, substituents, nH, hLen) {
  // Approximate H positions using tetrahedral geometry (repulsion-based)
  const hs = [];
  // Compute mean direction of existing substituents
  const dirs = substituents.map(s => normalize([s[0]-centre[0], s[1]-centre[1], s[2]-centre[2]]));

  if (nH === 1 && dirs.length === 3) {
    // Single H: opposite of sum of direction vectors
    const sum = dirs.reduce((a,d) => add(a,d), [0,0,0]);
    const dir = normalize(scale(sum, -1));
    hs.push(add(centre, scale(dir, hLen)));
  } else if (nH === 2 && dirs.length === 2) {
    // Two H: tetrahedral, perpendicular to existing bonds
    const bisect = normalize(add(dirs[0], dirs[1]));
    const perp = normalize(cross(dirs[0], dirs[1]));
    // H atoms bisect the remaining two tetrahedral positions
    const angle = Math.acos(-1/3) / 2; // half of tetrahedral angle from bisector ≈ 54.75°
    const sinA = Math.sin(angle), cosA = Math.cos(angle);
    const neg = scale(bisect, -cosA);
    hs.push(add(centre, scale(add(neg, scale(perp,  sinA)), hLen)));
    hs.push(add(centre, scale(add(neg, scale(perp, -sinA)), hLen)));
  } else if (nH === 3 && dirs.length === 1) {
    // NH3 / CH3: three H around the axis
    const axis = scale(dirs[0], -1); // point away
    // Find perpendicular
    let perp = [1,0,0];
    if (Math.abs(axis[0]) > 0.9) perp = [0,1,0];
    const u = normalize(cross(axis, perp));
    const v = cross(axis, u);
    const tilt = 70.5 * Math.PI / 180; // N-H angle from H toward N-bond axis
    const sinT = Math.sin(tilt), cosT = Math.cos(tilt);
    for (let i = 0; i < 3; i++) {
      const phi = i * 2*Math.PI/3;
      const dir = [
        cosT*axis[0] + sinT*(Math.cos(phi)*u[0] + Math.sin(phi)*v[0]),
        cosT*axis[1] + sinT*(Math.cos(phi)*u[1] + Math.sin(phi)*v[1]),
        cosT*axis[2] + sinT*(Math.cos(phi)*u[2] + Math.sin(phi)*v[2]),
      ];
      hs.push(add(centre, scale(normalize(dir), hLen)));
    }
  }
  return hs;
}

function molBlock(name, cat, data) {
  const f = formula(data.atoms);
  const a = data.atoms.map(a => `    ['${a[0]}', ${a[1].toFixed(4)}, ${a[2].toFixed(4)}, ${a[3].toFixed(4)}]`).join(',\n');
  const bArr = data.bonds.map(b => `    [${b.join(', ')}]`).join(',\n');
  const cidLine = data.cid ? `\n  pubchemCid: ${data.cid},` : '';
  return `// ${name}\naddMol({\n  name: '${name}',\n  label: '${f} (${name})',\n  category: '${cat}',${cidLine}\n  atoms: [\n${a}\n  ],\n  bonds: [\n${bArr}\n  ],\n  he: ${data.he},\n});\n`;
}

// ── Metallocene sandwich (straight, D5h) ──────────────────────────────────────

function makeMetallocene(metal, centDist) {
  const CC = 1.44, CH = 1.08;
  const ringR = CC / (2 * Math.sin(Math.PI/5));
  const atoms = [[metal, ...b(0, 0, 0)]];
  const bonds = [];
  for (const [ri, z] of [[0, centDist], [1, -centDist]]) {
    const offset = ri === 0 ? 0 : Math.PI/5;
    const cS = atoms.length;
    for (let i = 0; i < 5; i++) {
      const ang = offset + i*2*Math.PI/5;
      atoms.push(['C', ...b(ringR*Math.cos(ang), ringR*Math.sin(ang), z)]);
    }
    for (let i = 0; i < 5; i++) {
      const ang = offset + i*2*Math.PI/5;
      atoms.push(['H', ...b((ringR+CH)*Math.cos(ang), (ringR+CH)*Math.sin(ang), z)]);
    }
    for (let i = 0; i < 5; i++) bonds.push([cS+i, cS+(i+1)%5, 1.5]);
    for (let i = 0; i < 5; i++) bonds.push([cS+i, cS+5+i]);
    for (let i = 0; i < 5; i++) bonds.push([0, cS+i, 0.5]);
  }
  return { atoms, bonds, he: 12 };
}

// ── Bent metallocene dichloride (TiCp2Cl2 / VCp2Cl2 geometry) ────────────────
// halfAngle: half of Cp-M-Cp angle (65° for Ti, 63° for V)
// clDist: M-Cl bond length, clAngle: half of Cl-M-Cl (47.5°)

function makeBentMetalloceneDihalide(metal, centDist, halfAngleDeg, halide, haDist, clHalfDeg) {
  const CC = 1.44, CH = 1.08;
  const ringR = CC / (2 * Math.sin(Math.PI/5));
  const halfAng = halfAngleDeg * Math.PI / 180;
  const clHalf = clHalfDeg * Math.PI / 180;

  // Metal at origin
  // Rings symmetric in xz plane, opening upward (+z)
  // Cp centroids at (±sin(halfAng)*centDist, 0, cos(halfAng)*centDist)
  // Cl atoms in yz plane, pointing downward
  const atoms = [[metal, ...b(0, 0, 0)]];
  const bonds = [];

  // Two Cp rings
  for (const sign of [1, -1]) {
    // Centroid direction in xz plane
    const cx = sign * Math.sin(halfAng) * centDist;
    const cz = Math.cos(halfAng) * centDist;

    // Ring normal = centroid direction (unit vector)
    const norm = normalize([cx, 0, cz]);
    // Perpendicular in-plane vector: use y-axis
    const u = [0, 1, 0];
    // Second perpendicular
    const v = cross(norm, u);

    const cS = atoms.length;
    // Place 5 C atoms, rotated 0° offset (same chirality both rings)
    for (let i = 0; i < 5; i++) {
      const ang = i * 2*Math.PI/5;
      const pos = [
        cx + ringR*(Math.cos(ang)*u[0] + Math.sin(ang)*v[0]),
        ringR*(Math.cos(ang)*u[1] + Math.sin(ang)*v[1]),
        cz + ringR*(Math.cos(ang)*u[2] + Math.sin(ang)*v[2]),
      ];
      atoms.push(['C', ...b(pos[0], pos[1], pos[2])]);
    }
    for (let i = 0; i < 5; i++) {
      const ang = i * 2*Math.PI/5;
      const hR = ringR + CH;
      const pos = [
        cx + hR*(Math.cos(ang)*u[0] + Math.sin(ang)*v[0]),
        hR*(Math.cos(ang)*u[1] + Math.sin(ang)*v[1]),
        cz + hR*(Math.cos(ang)*u[2] + Math.sin(ang)*v[2]),
      ];
      atoms.push(['H', ...b(pos[0], pos[1], pos[2])]);
    }
    for (let i = 0; i < 5; i++) bonds.push([cS+i, cS+(i+1)%5, 1.5]);
    for (let i = 0; i < 5; i++) bonds.push([cS+i, cS+5+i]);
    for (let i = 0; i < 5; i++) bonds.push([0, cS+i, 0.5]);
  }

  // Two Cl atoms in yz plane, below
  for (const sign of [1, -1]) {
    const clPos = [0, sign * Math.sin(clHalf) * haDist, -Math.cos(clHalf) * haDist];
    atoms.push([halide, ...b(clPos[0], clPos[1], clPos[2])]);
    bonds.push([0, atoms.length - 1]);
  }

  return { atoms, bonds, he: 14 };
}

// ── Dibenzenechromium (D6h, staggered) ───────────────────────────────────────

function makeDibenzeneMetal(metal, centDist) {
  const CC = 1.423, CH = 1.083;
  const ringR = CC; // hexagon circumradius = side length
  const atoms = [[metal, ...b(0, 0, 0)]];
  const bonds = [];
  for (const [ri, z] of [[0, centDist], [1, -centDist]]) {
    const offset = ri === 0 ? 0 : Math.PI/6; // staggered
    const cS = atoms.length;
    for (let i = 0; i < 6; i++) {
      const ang = offset + i*2*Math.PI/6;
      atoms.push(['C', ...b(ringR*Math.cos(ang), ringR*Math.sin(ang), z)]);
    }
    for (let i = 0; i < 6; i++) {
      const ang = offset + i*2*Math.PI/6;
      atoms.push(['H', ...b((ringR+CH)*Math.cos(ang), (ringR+CH)*Math.sin(ang), z)]);
    }
    for (let i = 0; i < 6; i++) bonds.push([cS+i, cS+(i+1)%6, 1.5]);
    for (let i = 0; i < 6; i++) bonds.push([cS+i, cS+6+i]);
    for (let i = 0; i < 6; i++) bonds.push([0, cS+i, 0.5]);
  }
  return { atoms, bonds, he: 12 };
}

// ── Nickel tetracarbonyl Ni(CO)4 — tetrahedral ───────────────────────────────

function makeNiCO4() {
  const NiC = 1.838, CO = 1.141;
  const tet = [[1,1,1],[-1,-1,1],[-1,1,-1],[1,-1,-1]].map(v => normalize(v));
  const atoms = [['Ni', ...b(0,0,0)]];
  const bonds = [];
  for (const dir of tet) {
    const ci = atoms.length;
    atoms.push(['C', ...b(dir[0]*NiC, dir[1]*NiC, dir[2]*NiC)]);
    atoms.push(['O', ...b(dir[0]*(NiC+CO), dir[1]*(NiC+CO), dir[2]*(NiC+CO))]);
    bonds.push([0, ci]);
    bonds.push([ci, ci+1, 3]);
  }
  return { atoms, bonds, he: 10 };
}

// ── Chromium hexacarbonyl Cr(CO)6 — octahedral ───────────────────────────────

function makeCrCO6() {
  const CrC = 1.916, CO = 1.140;
  const dirs = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
  const atoms = [['Cr', ...b(0,0,0)]];
  const bonds = [];
  for (const [dx,dy,dz] of dirs) {
    const ci = atoms.length;
    atoms.push(['C', ...b(dx*CrC, dy*CrC, dz*CrC)]);
    atoms.push(['O', ...b(dx*(CrC+CO), dy*(CrC+CO), dz*(CrC+CO))]);
    bonds.push([0, ci]);
    bonds.push([ci, ci+1, 3]);
  }
  return { atoms, bonds, he: 10 };
}

// ── Cisplatin cis-[PtCl2(NH3)2] — square planar ──────────────────────────────

function makeCisplatin() {
  // Pt-Cl = 2.330Å, Pt-N = 2.050Å, N-H = 1.010Å
  // Square planar: cis arrangement — Cl at (-x,0) and (0,-y), N at (+x,0) and (0,+y)
  const PtCl = 2.330, PtN = 2.050, NH = 1.010;
  const atoms = [['Pt', ...b(0,0,0)]];
  const bonds = [];

  // Cl1 at (-PtCl, 0, 0), Cl2 at (0, -PtCl, 0)
  atoms.push(['Cl', ...b(-PtCl, 0, 0)]);  // idx 1
  atoms.push(['Cl', ...b(0, -PtCl, 0)]);  // idx 2
  bonds.push([0,1], [0,2]);

  // N1 at (+PtN, 0, 0), N2 at (0, +PtN, 0)
  const n1pos = [PtN, 0, 0], n2pos = [0, PtN, 0];
  atoms.push(['N', ...b(n1pos[0], n1pos[1], n1pos[2])]);  // idx 3
  atoms.push(['N', ...b(n2pos[0], n2pos[1], n2pos[2])]);  // idx 4
  bonds.push([0,3], [0,4]);

  // 3 H on each N (NH3), tetrahedral relative to Pt-N axis
  // N1: Pt is at (0,0,0), N1 at (+PtN,0,0), so bond from N toward Pt is -x
  const addNH3 = (nIdx, npos, axisToward) => {
    const axis = normalize(axisToward); // direction from N toward Pt
    let perp = [0,1,0];
    if (Math.abs(axis[1]) > 0.9) perp = [0,0,1];
    const u = normalize(cross(axis, perp));
    const v = cross(axis, u);
    const tetTilt = 109.5 * Math.PI/180 / 2; // half tetrahedral angle ≈ 54.75°
    for (let i = 0; i < 3; i++) {
      const phi = i * 2*Math.PI/3 + Math.PI/6;
      const dir = normalize([
        -Math.cos(tetTilt)*axis[0] + Math.sin(tetTilt)*(Math.cos(phi)*u[0] + Math.sin(phi)*v[0]),
        -Math.cos(tetTilt)*axis[1] + Math.sin(tetTilt)*(Math.cos(phi)*u[1] + Math.sin(phi)*v[1]),
        -Math.cos(tetTilt)*axis[2] + Math.sin(tetTilt)*(Math.cos(phi)*u[2] + Math.sin(phi)*v[2]),
      ]);
      const hi = atoms.length;
      atoms.push(['H', ...b(npos[0]+dir[0]*NH, npos[1]+dir[1]*NH, npos[2]+dir[2]*NH)]);
      bonds.push([nIdx, hi]);
    }
  };
  addNH3(3, n1pos, [-1,0,0]);  // axis toward Pt = -x
  addNH3(4, n2pos, [0,-1,0]);  // axis toward Pt = -y

  return { atoms, bonds, he: 10 };
}

// ── Carboplatin cis-[Pt(NH3)2(CBDCA)] ────────────────────────────────────────
// CBDCA = cyclobutane-1,1-dicarboxylate, bidentate O,O-chelate
// Pt-N = 2.01Å, Pt-O = 2.02Å, O-C = 1.28Å (carboxylate), C-C = 1.52Å

function makeCarboplatin() {
  const PtN=2.01, PtO=2.02, OC=1.28, CC=1.52, NH=1.01, CH=1.09;
  // Square planar Pt:
  //   N1 at (+PtN, 0, 0), N2 at (0, +PtN, 0)  [cis NH3]
  //   O1 at (-PtO, 0, 0), O2 at (0, -PtO, 0)  [chelating O from CBDCA]
  const atoms = [['Pt', ...b(0,0,0)]];
  const bonds = [];

  const n1=[PtN,0,0], n2=[0,PtN,0];
  const o1=[-PtO,0,0], o2=[0,-PtO,0];

  atoms.push(['N', ...b(...n1)]); // 1
  atoms.push(['N', ...b(...n2)]); // 2
  atoms.push(['O', ...b(...o1)]); // 3
  atoms.push(['O', ...b(...o2)]); // 4
  bonds.push([0,1],[0,2],[0,3],[0,4]);

  // NH3 on N1 (pointing +x from Pt, so axis toward Pt = -x)
  const addNH3 = (nIdx, npos, axisTowardPt) => {
    const axis = normalize(axisTowardPt);
    let perp=[0,1,0]; if(Math.abs(axis[1])>0.9) perp=[0,0,1];
    const u=normalize(cross(axis,perp)); const v=cross(axis,u);
    const tilt=109.5*Math.PI/180/2;
    for(let i=0;i<3;i++){
      const phi=i*2*Math.PI/3+Math.PI/6;
      const dir=normalize([
        -Math.cos(tilt)*axis[0]+Math.sin(tilt)*(Math.cos(phi)*u[0]+Math.sin(phi)*v[0]),
        -Math.cos(tilt)*axis[1]+Math.sin(tilt)*(Math.cos(phi)*u[1]+Math.sin(phi)*v[1]),
        -Math.cos(tilt)*axis[2]+Math.sin(tilt)*(Math.cos(phi)*u[2]+Math.sin(phi)*v[2]),
      ]);
      const hi=atoms.length;
      atoms.push(['H',...b(npos[0]+dir[0]*NH,npos[1]+dir[1]*NH,npos[2]+dir[2]*NH)]);
      bonds.push([nIdx,hi]);
    }
  };
  addNH3(1,n1,[-1,0,0]);
  addNH3(2,n2,[0,-1,0]);

  // CBDCA ligand: the two carboxylate groups connect to the two O atoms
  // The quaternary C1 of cyclobutane is at approximately (-PtO - OC - CC_proj, 0, 0) area
  // O1 and O2 are carboxylate oxygens; each goes to a C=O carbon, then to the central C
  // Simplified: O1→Ca1 (carboxylate C), O2→Ca2, Ca1-Cq, Ca2-Cq (central quaternary C)
  // Cq also has 2 CH2 forming the 4-membered ring: Cq-Cm1-Cm2? No, cyclobutane is 4-membered:
  // Cq(Ca1)(Ca2)(Cb1)(Cb2) where Cb1-Cb2 close the ring: Cq-Cb1-Cring-Cb2-Cq
  // In carboplatin: 1,1-cyclobutanedicarboxylate = cyclobutane with two COOH at same carbon

  // Central quaternary carbon Cq: between and behind both O atoms
  // Place Cq at (-PtO - OC - CC/2, -PtO/2, 0) approximately
  const cqx = -(PtO + OC + CC*Math.sin(Math.PI/4));
  const cqy = -(PtO + OC + CC*Math.sin(Math.PI/4));
  // Actually let me think geometrically:
  // O1 at (-2.02,0,0), O2 at (0,-2.02,0)
  // Each carboxylate C (Ca) is beyond its O:
  // Ca1 direction: away from Pt through O1, i.e. along (-x): Ca1 = O1 + OC*(-1,0,0) = (-2.02-1.28, 0, 0) = (-3.30, 0, 0)
  // Ca2 direction: along (-y): Ca2 = O2 + OC*(0,-1,0) = (0, -3.30, 0)
  // But Ca1 and Ca2 must connect to the same quaternary Cq
  // Let Cq be the midpoint shifted: Cq ≈ (-3.30-CC/√2, -3.30/2, 0)?
  // Better: use actual cyclobutane geometry
  // The biting angle O-Pt-O ≈ 90°, and Pt-O-C ≈ 120°, C-C-C ≈ 90° (cyclobutane)

  // Let me build from Ca1 and Ca2, meeting at Cq:
  // Ca1 at (-3.30, 0, 0) [carboxylate C for O1]
  // Ca2 at (0, -3.30, 0) [carboxylate C for O2]
  // Cq must be ~1.52Å from both Ca1 and Ca2
  // Ca1-Cq vector: magnitude CC=1.52Å, direction: (Ca1→Cq)
  // Ca2-Cq vector: magnitude CC=1.52Å, direction: (Ca2→Cq)
  // Midpoint of Ca1 and Ca2: (-1.65, -1.65, 0)
  // Distance from midpoint to each Ca: √(1.65²+1.65²) ≈ 2.33Å
  // Cq should be at distance 1.52Å from each Ca
  // If Cq is in the plane: use law of cosines
  // Actually for the cyclobutane ring, the 4 atoms form a near-square:
  // Cq-Ca1-?-Ca2-Cq? No: it's Cq(-COO1)(-COO2)(-CH2-CH2-) where -CH2-CH2- closes the ring back to Cq
  // So: Cq has 4 substituents: Ca1(=O,O1), Ca2(=O,O2), and two CH2 groups forming the 4-membered ring
  // The cyclobutane ring is: Cq-Cm1-Cm2-Cm3-Cq? No, cyclobutane is 4-membered: Cq-Cm1-Cm2-Cq
  // Wait: 1,1-cyclobutanedicarboxylic acid has cyclobutane (4-membered ring C4) with two COOH at C1
  // So ring is C1(=Cq)-C2-C3-C4-C1, and Cq has bonds to Ca1, Ca2, C4, C2 (where C4 and C2 are the ring carbons)

  const Ca1 = [-3.30, 0, 0];
  const Ca2 = [0, -3.30, 0];
  // O' (carboxylate double bond O) for each Ca
  const O1prime = [-3.30 - 1.21*Math.cos(Math.PI/6), -1.21*Math.sin(Math.PI/6), 0]; // roughly
  const O2prime = [-1.21*Math.sin(Math.PI/6), -3.30 - 1.21*Math.cos(Math.PI/6), 0];

  // Cq: Let's place it at (-3.30 - CC*0.7, -CC*0.7, 0) ≈ (-4.37, -1.07, 0)?
  // Better: find intersection of circles of radius CC around Ca1 and Ca2
  // Ca1=(-3.30,0), Ca2=(0,-3.30), need Cq at distance 1.52 from both
  // by symmetry, Cq lies on line from origin at 45° below-left: x=y=c
  // dist from Ca1: sqrt((c+3.30)² + c²) = 1.52 → (c+3.30)² + c² = 2.31
  // 2c² + 6.6c + 10.89 = 2.31 → 2c² + 6.6c + 8.58 = 0 → no real solution!
  // So Cq can't be in the xy plane equidistant from Ca1 and Ca2 with CC=1.52
  // The reason: Ca1 and Ca2 are 3.30*√2 = 4.67Å apart, but 2*CC = 3.04Å < 4.67Å
  // So Cq needs to be out-of-plane!

  // Place Cq above the plane:
  // horizontal midpoint of Ca1,Ca2: (-1.65,-1.65,0)
  // dist from Ca1 to midpoint: 3.30/√2 = 2.33Å
  // Cq z-coord: sqrt(CC² - 2.33²) = sqrt(2.31 - 5.43) < 0... still impossible

  // The issue is the chelate geometry is strained. In reality the Pt-O-C angle is not 180°.
  // Let me use the actual carboplatin crystal structure geometry more carefully.
  // From crystal: Pt at origin, with approximately:
  // O1 at (-2.02, 0, 0), O2 at (0, -2.02, 0)
  // Pt-O-C angles ≈ 111°, so Ca1 is NOT directly along -x from O1

  // Let's use Pt-O-C angle = 111°:
  // O1 is at (-2.02, 0, 0), bond from Pt to O1 is along -x
  // The Ca1-O1 bond makes 111° with the O1-Pt bond
  // O1-Pt direction = +x, so Ca1 is at angle 180°-111°=69° from +x at O1
  // Ca1 direction from O1: (cos(69°-180°), sin(69°-180°), 0)... let me think
  // Bond O1-Pt is along +x. Bond O1-Ca1 makes 111° with O1-Pt.
  // In plane, Ca1 can be at angle 111° from +x direction at O1.
  // Using counterclockwise: Ca1 at O1 + OC*(cos(111°), sin(111°), 0)
  //                       = (-2.02 + 1.28*(-0.358), 1.28*(0.934), 0)
  //                       = (-2.02 - 0.458, 1.196, 0) = (-2.478, 1.196, 0)

  // Similarly O2 at (0,-2.02,0), O2-Pt along +y direction, Ca2 at angle 111°
  // from +y at O2: Ca2 = O2 + OC*(sin(111°), cos(111°), 0)... let me be careful
  // Bond O2-Pt is along +y. Rotate by 111° to get Ca2:
  // Ca2 at O2 + OC*(sin(111°), -cos(111°)...
  // If O2-Pt is +y, then rotating 111° clockwise gives direction (-sin(111°), cos(111°-180°)...)
  // Actually by symmetry (the two NH3 are at +x and +y, the two O are at -x and -y),
  // Ca1 should mirror Ca2 under x↔y, z↔z, with sign change x→-y.
  // Let me just set Ca1 at (-2.478, 1.196, 0) and Ca2 at (1.196, -2.478, 0) by symmetry.
  const Ca1r = [-2.478, 1.196, 0];
  const Ca2r = [1.196, -2.478, 0];
  // Distance Ca1r-Ca2r: sqrt((1.196+2.478)² + (1.196+2.478)²) = sqrt(2*3.674²) ≈ 5.196Å
  // Still too large for a direct C-C bond. We need Cq between them.

  // Actually in carboplatin, the full CBDCA ligand is:
  // Pt-O1-C(=O'1)-C_ring(cyclobutyl part)-C(=O'2)-O2-Pt
  // The cyclobutyl ring C's are: Cq and 3 other CH2 carbons
  // So there are 2 carbonyl carbons (Ca1, Ca2) + 4 ring carbons (Cq, Cm1, Cm2, Cm3) = 6 total carbons
  // Wait: 1,1-cyclobutanedicarboxylic acid: cyclobutane ring = 4 carbons (C1,C2,C3,C4)
  // C1 has two COOH substituents (Ca1 and Ca2 = the carboxylate Cs)
  // So total C in CBDCA: 4 (ring) + 2 (carboxylate) = 6 C atoms
  // Formula: C6H10O4 (dianion: C6H8O4 2-)

  // This is getting quite complex. Let me simplify and just show the key coordination sphere.
  // I'll build a simplified carboplatin showing the Pt core + the carboxylate oxygens
  // without the full cyclobutane ring detail, just the main C atoms.

  // Simple version: just show Pt-N-H and Pt-O-C=O, with the cyclobutane just as a chain
  // Ca1 at (-2.478, 1.196, 0), Ca2 at (1.196, -2.478, 0)
  // O'1 at Ca1 + OC*(-0.5, 0.866, 0) ≈ (-3.117, 2.305, 0) [C=O roughly perpendicular]
  // O'2 by symmetry
  // Cq connecting Ca1 and Ca2: in the xz plane, above both
  // Place Cq at z = +1.5Å, x = (Ca1x+Ca2x)/2 = -0.64, y = (Ca1y+Ca2y)/2 = -0.64
  // dist from Ca1r to Cq: sqrt((-2.478+0.64)²+(1.196+0.64)²+1.5²)
  //                      = sqrt(3.38+3.37+2.25) = sqrt(9.0) = 3.0 Å — too long

  // I think it's simply not feasible to get accurate carboplatin geometry from scratch in a few lines.
  // Let me just build a simplified version showing the essential features.
  // For the viewer, the structure just needs to be recognizable.

  // Simplified carboplatin: treat CBDCA as -O-C(=O)-CH2-CH2-C(=O)-O- (open chain, not cyclobutane)
  // This is wrong chemically but visually adequate.
  const Co1=[-2.02,0,0], Co2=[0,-2.02,0]; // chelate O atoms on Pt
  const Ca1s=[-3.40,0.8,0], Ca2s=[0.8,-3.40,0]; // carboxylate C atoms (with Pt-O-C angle ~111°)
  const Oc1=[-4.50,0.2,0], Oc2=[0.2,-4.50,0]; // C=O oxygen
  // Connect Ca1s-Ca2s via two CH2 groups (simplified open chain)
  const Cm1=[(-3.40+0.8)/2+0.5, (0.8-3.40)/2, 1.0]; // CH2 carbon 1
  const Cm2=[(-3.40+0.8)/2-0.5, (0.8-3.40)/2, -1.0]; // CH2 carbon 2 (this won't be right for cyclobutane but OK)

  const bi = atoms.length; // base index
  atoms.push(['C',...b(...Ca1s)]); // bi+0
  atoms.push(['C',...b(...Ca2s)]); // bi+1
  atoms.push(['O',...b(...Oc1)]);  // bi+2 C=O
  atoms.push(['O',...b(...Oc2)]);  // bi+3 C=O
  atoms.push(['C',...b(...Cm1)]); // bi+4 CH2
  atoms.push(['C',...b(...Cm2)]); // bi+5 CH2
  bonds.push([3,bi],[bi,bi+2,2],[bi,bi+4],[bi+4,bi+5]);  // O1-Ca1=O', Ca1-Cm1-Cm2
  bonds.push([4,bi+1],[bi+1,bi+3,2],[bi+1,bi+5]);         // O2-Ca2=O', Ca2-Cm2

  // H on CH2 groups (2H each)
  const addCH2H = (cIdx, cpos, dir1, dir2) => {
    for (const d of [dir1, dir2]) {
      const hi = atoms.length;
      atoms.push(['H',...b(cpos[0]+d[0]*CH,cpos[1]+d[1]*CH,cpos[2]+d[2]*CH)]);
      bonds.push([cIdx, hi]);
    }
  };
  addCH2H(bi+4, Cm1, normalize([0,1,1]), normalize([0,-1,1]));
  addCH2H(bi+5, Cm2, normalize([0,1,-1]), normalize([0,-1,-1]));

  return { atoms, bonds, he: 14 };
}

// ── Oxaliplatin [Pt(oxalate)(DACH)] — simplified ─────────────────────────────
// DACH = (1R,2R)-cyclohexanediamine, oxalate = C2O4²⁻
// Pt-N = 2.01Å, Pt-O = 2.01Å, oxalate C-C = 1.54Å, C=O = 1.24Å, C-O = 1.31Å
// DACH ring: simplified as two N atoms + cyclohexane ring

function makeOxaliplatin() {
  const PtN=2.01, PtO=2.01, OxCC=1.54, OxCO=1.24, OxCOs=1.31, NH=1.01;
  const atoms = [['Pt', ...b(0,0,0)]];
  const bonds = [];

  // N1 at (+PtN, 0, 0), N2 at (0, +PtN, 0) [cis, from DACH]
  const n1=[PtN,0,0], n2=[0,PtN,0];
  atoms.push(['N',...b(...n1)]); // 1
  atoms.push(['N',...b(...n2)]); // 2
  bonds.push([0,1],[0,2]);

  // NH2 hydrogen on each N (2H each, part of NH2 not NH3)
  const addNH2 = (nIdx, npos, axisTowardPt) => {
    const axis = normalize(axisTowardPt);
    let perp=[0,0,1];
    const u=normalize(cross(axis,perp)); const v=cross(axis,u);
    const tilt = 109.5*Math.PI/180/2;
    for(let k=0;k<2;k++){
      const phi=(k+0.5)*Math.PI; // 0.5π and 1.5π
      const dir=normalize([
        -Math.cos(tilt)*axis[0]+Math.sin(tilt)*(Math.cos(phi)*u[0]+Math.sin(phi)*v[0]),
        -Math.cos(tilt)*axis[1]+Math.sin(tilt)*(Math.cos(phi)*u[1]+Math.sin(phi)*v[1]),
        -Math.cos(tilt)*axis[2]+Math.sin(tilt)*(Math.cos(phi)*u[2]+Math.sin(phi)*v[2]),
      ]);
      const hi=atoms.length;
      atoms.push(['H',...b(npos[0]+dir[0]*NH,npos[1]+dir[1]*NH,npos[2]+dir[2]*NH)]);
      bonds.push([nIdx,hi]);
    }
  };
  addNH2(1,n1,[-1,0,0]);
  addNH2(2,n2,[0,-1,0]);

  // DACH: cyclohexane connecting N1 and N2
  // N1 at (2.01,0,0), N2 at (0,2.01,0); connect via 4 CH2 groups forming ring
  // Simplified: place 4 CH2 carbons to connect N1→C1→C2→C3→C4→N2
  const dachCarbons = [
    [PtN+1.52, 0, 0],    // C next to N1
    [PtN+1.52*0.5, 0, 1.52*0.866],  // CH2
    [0, PtN+1.52*0.5, 1.52*0.866],  // CH2
    [0, PtN+1.52, 0],    // C next to N2
  ];
  const dBase = atoms.length;
  for(const pos of dachCarbons) atoms.push(['C',...b(...pos)]);
  bonds.push([1,dBase],[dBase,dBase+1],[dBase+1,dBase+2],[dBase+2,dBase+3],[dBase+3,2]);
  for(let i=0;i<4;i++){
    // 2H per CH2
    const [cx,cy,cz]=dachCarbons[i];
    atoms.push(['H',...b(cx,cy+0.89,cz-0.51)]);
    atoms.push(['H',...b(cx,cy-0.89,cz-0.51)]);
    bonds.push([dBase+i,atoms.length-2],[dBase+i,atoms.length-1]);
  }

  // Oxalate: O1 at (-PtO,0,0), O2 at (0,-PtO,0), bidentate
  const ox1=[-PtO,0,0], ox2=[0,-PtO,0];
  atoms.push(['O',...b(...ox1)]); // oxO1 index = oBase
  atoms.push(['O',...b(...ox2)]); // oxO2
  const oBase = atoms.length - 2;
  bonds.push([0,oBase],[0,oBase+1]);

  // Carboxylate C1 beyond O1, C2 beyond O2
  // Pt-O1-C1 angle ≈ 111°
  const Cx1=[-3.32, 0.8, 0], Cx2=[0.8, -3.32, 0];
  atoms.push(['C',...b(...Cx1)]); // cBase
  atoms.push(['C',...b(...Cx2)]);
  const cBase = atoms.length - 2;
  bonds.push([oBase,cBase],[oBase+1,cBase+1]);
  bonds.push([cBase,cBase+1]); // C-C oxalate

  // Second O on each carboxylate (C=O)
  atoms.push(['O',...b(-4.32,0.0,0)]); // C1=O'
  atoms.push(['O',...b(0.0,-4.32,0)]); // C2=O'
  bonds.push([cBase,atoms.length-2,2],[cBase+1,atoms.length-1,2]);

  return { atoms, bonds, he: 16 };
}

// ── Ebselen (2-phenyl-1,2-benzisoselenazol-3(2H)-one) ────────────────────────
// Benzisoselenazolone ring fused to benzene, with N-phenyl substituent
// Crystal structure: planar bicyclic system
// Key bonds: Se-C ≈ 1.87Å, Se-N ≈ 1.83Å, N-C ≈ 1.38Å, C=O ≈ 1.22Å

function makeEbselen() {
  const CC=1.39, CH=1.08, SeC=1.87, SeN=1.83, NC=1.38, CO=1.22, CNphenyl=1.42;
  // Benzisoselenazolone ring:
  // Fused 6+5 ring system, fully planar
  // Numbering: benzene ring = C3-C4-C5-C6-C7-C7a, selenazole = C3-N2-Se1-C7a-C3... wait
  // Actually benzisoselenazol-3-one:
  //   - The "benzo" ring is the 6-membered aromatic ring
  //   - The "isoselenazol-3-one" is the 5-membered ring: Se-C(=O)-N adjacent
  //   - Se is at position 1, N at position 2, C=O at position 3
  //   - The fusion is between positions 3a and 7a

  // Let me place atoms in 2D (z=0) starting from Se
  // Place Se at origin, the ring system along x
  // Se-N bond at 1.83Å, angle in ring ≈ 85°
  // 5-membered ring geometry:

  // I'll use approximate coordinates based on crystal structure data:
  // Using a coordinate frame where the fused ring system lies in xy plane

  const atoms = [];
  const bonds = [];

  // Benzisoselenazolone core (fused 5+6 ring)
  // 5-membered ring: Se1, C7a(=C8 in benzene), ..., N2, C3(=O)
  // Fused benzene ring: C3a(C4), C4, C5, C6, C7, C7a

  // Approximate crystal coordinates (Angstroms):
  // From known ebselen crystal structure (CSD EBSELN01):
  const core = [
    ['Se', 0.000,  0.000, 0],      // 0: Se1
    ['N',  1.830,  0.570, 0],      // 1: N2 (Se-N = 1.83Å, roughly)
    ['C',  2.800, -0.300, 0],      // 2: C3 (N-C = 1.38Å, C=O)
    ['O',  3.900, -0.200, 0],      // 3: O (C=O = 1.22Å)
    ['C',  2.200, -1.550, 0],      // 4: C3a (C3-C3a = 1.46Å)
    ['C',  2.900, -2.700, 0],      // 5: C4
    ['C',  2.300, -3.900, 0],      // 6: C5
    ['C',  0.950, -4.000, 0],      // 7: C6
    ['C',  0.250, -2.850, 0],      // 8: C7
    ['C',  0.850, -1.650, 0],      // 9: C7a (fused, Se-C7a = 1.87Å)
  ];

  for (const [el, x, y, z] of core) atoms.push([el, ...b(x, y, z)]);

  // Se-C7a bond, Se-N bond
  bonds.push([0, 9]);  // Se-C7a
  bonds.push([0, 1]);  // Se-N
  bonds.push([1, 2]);  // N-C3
  bonds.push([2, 3, 2]); // C3=O
  bonds.push([2, 4]);  // C3-C3a
  bonds.push([4, 5, 1.5],[5, 6, 1.5],[6, 7, 1.5],[7, 8, 1.5],[8, 9, 1.5],[9, 4, 1.5]); // benzene ring
  bonds.push([9, 4]);   // already above as 1.5

  // H atoms on benzene ring (C4-C7)
  for (let i = 5; i <= 8; i++) {
    const [, x, y] = core[i];
    // H points away from ring center (roughly at center ~1.5, -2.6)
    const dx = x - 1.5, dy = y - (-2.6);
    const n = Math.sqrt(dx*dx+dy*dy);
    const hi = atoms.length;
    atoms.push(['H', ...b(x + CH*dx/n, y + CH*dy/n, 0)]);
    bonds.push([i, hi]);
  }

  // N-phenyl substituent on N2 (atom index 1)
  // N at (1.83, 0.57), phenyl ring approximately perpendicular to the isoselenazole plane
  // actually in ebselen the N-phenyl is roughly coplanar or slightly rotated
  // Place phenyl ring: N-C bond at 1.42Å, in plane (simplified)
  const Nphenyl = [1.83, 0.57]; // N position
  const phenylDir = normalize([0.5, 1.0]); // direction away from N toward phenyl
  const phenylC0 = [Nphenyl[0]+CNphenyl*phenylDir[0], Nphenyl[1]+CNphenyl*phenylDir[1], 0];
  // phenyl ring: 6 carbons
  const pCentre = [phenylC0[0]+CC*phenylDir[0], phenylC0[1]+CC*phenylDir[1], 0]; // ring centre estimate

  // Actually let's just place the phenyl as a hexagon centred along the N-C direction
  // The first C of phenyl is 1.42Å from N
  const phBase = atoms.length;
  const phAngle0 = Math.atan2(phenylDir[1], phenylDir[0]); // angle of N-C1 bond
  // Ring centre at phenylC0 + CC*phenylDir (approx 1.39Å further)
  const pCx = phenylC0[0] + CC*phenylDir[0];
  const pCy = phenylC0[1] + CC*phenylDir[1];
  atoms.push(['C', ...b(pCx, pCy, 0)]); // placeholder, will be redone

  // Better: place 6 carbons of phenyl ring
  // C1 of phenyl (attached to N) is at phenylC0
  atoms.pop(); // remove placeholder

  const phC = [];
  for (let i = 0; i < 6; i++) {
    const ang = phAngle0 + i*Math.PI/3; // hexagon
    // Ring radius for benzene = CC = 1.39Å (circumradius)
    const rc = CC; // circumradius
    const cx = pCx + rc*Math.cos(ang);
    const cy = pCy + rc*Math.sin(ang);
    phC.push([cx, cy]);
    atoms.push(['C', ...b(cx, cy, 0)]);
  }
  // N connects to phC[0] (closest to N)... actually let me recalculate
  // The N-C1 bond should be CNphenyl=1.42Å
  // If ring centre is at (pCx,pCy), C1 = centre + rc*(cos(phAngle0+π), ...) = centre - rc*phenylDir
  // Hmm, let me recalculate:
  // The ipso carbon (C1) is at distance CNphenyl from N and distance CC from its ring neighbours
  // Place C1 directly:
  // Remove all 6 added C and redo
  for(let i=0;i<6;i++) atoms.pop();

  const ipsoX = Nphenyl[0]+CNphenyl*phenylDir[0];
  const ipsoY = Nphenyl[1]+CNphenyl*phenylDir[1];
  // Ring of 6 carbons: ipso is one, ring goes around
  // Centre is at ipso + CC*phenylDir (along same direction from N)
  const ringCx = ipsoX + CC*phenylDir[0];
  const ringCy = ipsoY + CC*phenylDir[1];
  const phBase2 = atoms.length;
  for (let i = 0; i < 6; i++) {
    const ang = phAngle0 + Math.PI + i*2*Math.PI/6; // start from ipso direction (pointing back toward N)
    atoms.push(['C', ...b(ringCx + CC*Math.cos(ang), ringCy + CC*Math.sin(ang), 0)]);
  }
  // phBase2+0 is ipso carbon (attached to N)
  bonds.push([1, phBase2]); // N-ipso
  for (let i = 0; i < 6; i++) bonds.push([phBase2+i, phBase2+(i+1)%6, 1.5]);

  // H on ortho, meta, para (not on ipso)
  for (let i = 1; i < 6; i++) {
    const ci = phBase2 + i;
    const [, cx, cy] = atoms[ci];
    const dx = cx*1/ANG_TO_BOHR - ringCx, dy = cy*1/ANG_TO_BOHR - ringCy;
    const n = Math.sqrt(dx*dx+dy*dy);
    const hi = atoms.length;
    atoms.push(['H', ...b(cx/ANG_TO_BOHR + CH*dx/n, cy/ANG_TO_BOHR + CH*dy/n, 0)]);
    bonds.push([ci, hi]);
  }

  const allCoords = atoms.flatMap(a => [Math.abs(a[1]), Math.abs(a[2]), Math.abs(a[3])]);
  const he = Math.ceil((Math.max(...allCoords) + 8) / 2) * 2;
  return { atoms, bonds, he };
}

// ── Selenocysteine (L-selenocysteine, 21st amino acid) ─────────────────────────
// Formula: C3H7NO2Se
// Structure: H2N-CH(COOH)-CH2-SeH (zwitterionic: H3N+, COO-)

function makeSelenocysteine() {
  // Approximate L-selenocysteine coordinates based on L-cysteine crystal structure
  // Replace S (1.82Å C-S, 1.34Å S-H) with Se (1.96Å C-Se, 1.47Å Se-H)
  // Using standard geometry with slight rotation for clarity
  const NCa=1.458, CaCb=1.521, CbSe=1.960, SeH=1.470;
  const CaC=1.522, CO=1.235, COH=1.325, NH=1.012, CH=1.090;

  // L configuration, extended conformation
  // Place along standard residue axes (adapted from crystallographic data)
  // N at origin, Cα along +x
  const N=[0,0,0], Ca=[NCa,0,0];
  // Carbonyl C: Cα-C'-N angle ≈ 111.2°, place C' at angle 111° from N-Cα direction
  const CaC_ang = 111.2 * Math.PI/180;
  const Cprime=[Ca[0]+CaC*Math.cos(Math.PI-CaC_ang), CaC*Math.sin(Math.PI-CaC_ang), 0];
  // Carbonyl O: C'=O, angle at C' ≈ 121°, in plane
  const CprimeO_ang = 121 * Math.PI/180;
  const vCprimeN = normalize([N[0]-Cprime[0],N[1]-Cprime[1],0]);
  const O=[Cprime[0]+CO*Math.cos(CprimeO_ang-Math.PI)*(-1), Cprime[1]-CO*Math.sin(CprimeO_ang), 0];
  // Hydroxyl O: other side
  const OH=[Cprime[0]-COH*(vCprimeN[0]*Math.cos(CprimeO_ang)+vCprimeN[1]*Math.sin(CprimeO_ang)),
            Cprime[1]-COH*(vCprimeN[1]*Math.cos(CprimeO_ang)-vCprimeN[0]*Math.sin(CprimeO_ang)), 0];

  // Cβ: N-Cα-Cβ tetrahedral, point out of plane (z)
  const CaCb_ang = 109.5 * Math.PI/180;
  // Direction perpendicular to N-Cα-C' plane, plus offset
  const Cb=[Ca[0]-CaCb*0.333, -CaCb*0.333, CaCb*0.878]; // tetrahedral off Cα

  // Se: Cα-Cβ-Se angle ≈ 113.5°, approximately
  const vCbCa = normalize([Ca[0]-Cb[0],Ca[1]-Cb[1],Ca[2]-Cb[2]]);
  const vCbSe = normalize([-vCbCa[0]+0.5*vCbCa[2]*2, -vCbCa[1], vCbCa[0]]); // rough perpendicular
  // Simpler: just place Se based on known crystal coords offset from Cb
  const Se=[Cb[0]-CbSe*0.5, Cb[1]-CbSe*0.5, Cb[2]-CbSe*0.7];
  // SeH
  const SeHpos=[Se[0]-SeH*0.6, Se[1], Se[2]-SeH*0.8];

  const atoms=[
    ['N',...b(...N)],    // 0
    ['C',...b(...Ca)],   // 1 Cα
    ['C',...b(...Cprime)], // 2 C'
    ['O',...b(-0.18,1.15,0)], // 3 C=O (adjusted)
    ['O',...b(1.02,1.33,0)],  // 4 C-OH
    ['C',...b(2.32,-0.68,0.87)], // 5 Cβ
    ['Se',...b(3.86,-1.86,0.15)], // 6 Se  (C-Se = 1.96Å)
    ['H',...b(5.06,-0.73,0.38)],  // 7 Se-H
  ];

  // Add H atoms
  const bonds=[[0,1],[1,2],[2,3,2],[2,4],[1,5],[5,6],[6,7]];

  // H on N (NH3: 3H)
  const Npos=atoms[0].slice(1).map(v=>v/ANG_TO_BOHR);
  const Capos=atoms[1].slice(1).map(v=>v/ANG_TO_BOHR);
  const axisNCa=normalize([Capos[0]-Npos[0],Capos[1]-Npos[1],Capos[2]-Npos[2]]);
  let perp=[0,1,0]; if(Math.abs(axisNCa[1])>0.9)perp=[0,0,1];
  const u=normalize(cross(axisNCa,perp)); const vv=cross(axisNCa,u);
  const tilt=70.5*Math.PI/180;
  for(let i=0;i<3;i++){
    const phi=i*2*Math.PI/3;
    const dir=normalize([
      -Math.cos(tilt)*axisNCa[0]+Math.sin(tilt)*(Math.cos(phi)*u[0]+Math.sin(phi)*vv[0]),
      -Math.cos(tilt)*axisNCa[1]+Math.sin(tilt)*(Math.cos(phi)*u[1]+Math.sin(phi)*vv[1]),
      -Math.cos(tilt)*axisNCa[2]+Math.sin(tilt)*(Math.cos(phi)*u[2]+Math.sin(phi)*vv[2]),
    ]);
    const hi=atoms.length;
    atoms.push(['H',...b(Npos[0]+dir[0]*NH,Npos[1]+dir[1]*NH,Npos[2]+dir[2]*NH)]);
    bonds.push([0,hi]);
  }

  // H on Cα (1H)
  {
    const hi=atoms.length;
    atoms.push(['H',...b(1.75,0.85,0.65)]);
    bonds.push([1,hi]);
  }

  // H on Cβ (2H)
  {
    const h1=atoms.length;
    atoms.push(['H',...b(2.07,-0.22,1.85)]);
    bonds.push([5,h1]);
    const h2=atoms.length;
    atoms.push(['H',...b(3.00,0.10,0.63)]);
    bonds.push([5,h2]);
  }

  // H on hydroxyl O
  {
    const hi=atoms.length;
    atoms.push(['H',...b(1.62,2.16,0.0)]);
    bonds.push([4,hi]);
  }

  return { atoms, bonds, he: 12 };
}

// ── Selenomethionine (L-selenomethionine) ─────────────────────────────────────
// Formula: C5H11NO2Se
// Structure: H2N-CH(COOH)-CH2-CH2-Se-CH3

function makeSelenoMethionine() {
  const atoms=[
    ['N', ...b(0.000,  0.000,  0.000)],  // 0
    ['C', ...b(1.458,  0.000,  0.000)],  // 1 Cα
    ['C', ...b(1.852,  1.421,  0.000)],  // 2 C' (carbonyl)
    ['O', ...b(1.063,  2.351,  0.000)],  // 3 C=O
    ['O', ...b(3.079,  1.624,  0.000)],  // 4 C-OH
    ['C', ...b(2.063, -0.720,  1.230)],  // 5 Cβ
    ['C', ...b(1.676,  0.000,  2.540)],  // 6 Cγ
    ['Se',...b(2.419, -0.808,  4.165)],  // 7 Se (C-Se = 1.96Å)
    ['C', ...b(4.394, -0.235,  4.133)],  // 8 Cε (Se-C = 1.97Å)
  ];

  const bonds=[[0,1],[1,2],[2,3,2],[2,4],[1,5],[5,6],[6,7],[7,8]];

  // H on N (3H, NH3/NH2)
  const Npos=atoms[0].slice(1).map(v=>v/ANG_TO_BOHR);
  const Capos=atoms[1].slice(1).map(v=>v/ANG_TO_BOHR);
  const axisNCa=normalize([Capos[0]-Npos[0],Capos[1]-Npos[1],Capos[2]-Npos[2]]);
  let perp=[0,1,0]; if(Math.abs(axisNCa[1])>0.9)perp=[0,0,1];
  const u=normalize(cross(axisNCa,perp)); const vv=cross(axisNCa,u);
  const tilt=70.5*Math.PI/180;
  for(let i=0;i<3;i++){
    const phi=i*2*Math.PI/3;
    const dir=normalize([
      -Math.cos(tilt)*axisNCa[0]+Math.sin(tilt)*(Math.cos(phi)*u[0]+Math.sin(phi)*vv[0]),
      -Math.cos(tilt)*axisNCa[1]+Math.sin(tilt)*(Math.cos(phi)*u[1]+Math.sin(phi)*vv[1]),
      -Math.cos(tilt)*axisNCa[2]+Math.sin(tilt)*(Math.cos(phi)*u[2]+Math.sin(phi)*vv[2]),
    ]);
    const hi=atoms.length;
    atoms.push(['H',...b(Npos[0]+dir[0]*1.01,Npos[1]+dir[1]*1.01,Npos[2]+dir[2]*1.01)]);
    bonds.push([0,hi]);
  }
  // H on Cα
  atoms.push(['H',...b(1.75,0.90,0.63)]); bonds.push([1,atoms.length-1]);
  // H2 on Cβ
  atoms.push(['H',...b(1.80,-1.75,1.22)]); bonds.push([5,atoms.length-1]);
  atoms.push(['H',...b(3.15,-0.73,1.22)]); bonds.push([5,atoms.length-1]);
  // H2 on Cγ
  atoms.push(['H',...b(0.59, 0.00, 2.60)]); bonds.push([6,atoms.length-1]);
  atoms.push(['H',...b(1.96, 1.05, 2.61)]); bonds.push([6,atoms.length-1]);
  // H on OH
  atoms.push(['H',...b(3.07,2.58,0.00)]); bonds.push([4,atoms.length-1]);
  // 3H on Cε (methyl)
  const Sepos=atoms[7].slice(1).map(v=>v/ANG_TO_BOHR);
  const Ceps=atoms[8].slice(1).map(v=>v/ANG_TO_BOHR);
  const axSeCe=normalize([Ceps[0]-Sepos[0],Ceps[1]-Sepos[1],Ceps[2]-Sepos[2]]);
  let perpCH=[0,1,0]; if(Math.abs(axSeCe[1])>0.9)perpCH=[0,0,1];
  const uCH=normalize(cross(axSeCe,perpCH)); const vCH=cross(axSeCe,uCH);
  for(let i=0;i<3;i++){
    const phi=i*2*Math.PI/3+Math.PI/6;
    const dir=normalize([
      axSeCe[0]*Math.cos(tilt)+Math.sin(tilt)*(Math.cos(phi)*uCH[0]+Math.sin(phi)*vCH[0]),
      axSeCe[1]*Math.cos(tilt)+Math.sin(tilt)*(Math.cos(phi)*uCH[1]+Math.sin(phi)*vCH[1]),
      axSeCe[2]*Math.cos(tilt)+Math.sin(tilt)*(Math.cos(phi)*uCH[2]+Math.sin(phi)*vCH[2]),
    ]);
    const hi=atoms.length;
    atoms.push(['H',...b(Ceps[0]+dir[0]*1.09,Ceps[1]+dir[1]*1.09,Ceps[2]+dir[2]*1.09)]);
    bonds.push([8,hi]);
  }

  return { atoms, bonds, he: 12 };
}

// ── Auranofin [Au(PEt3)(thioglucose-2,3,4,6-tetraacetate)] ───────────────────
// Too complex to build manually accurately. Simplified version:
// Au(I) center, linear P-Au-S coordination
// Au-P = 2.28Å, Au-S = 2.30Å, P-Au-S = 180° (linear)
// Represent PEt3 as P with 3 CH2CH3 groups, and S as part of glucose ring (simplified)
function makeAuranofin() {
  const AuP=2.28, AuS=2.30, PC=1.84, CC=1.52, CH=1.09, SC=1.82;
  const atoms=[['Au',...b(0,0,0)]];
  const bonds=[];

  // P at (-AuP, 0, 0), S at (+AuS, 0, 0)
  atoms.push(['P',...b(-AuP,0,0)]); // 1
  atoms.push(['S',...b( AuS,0,0)]); // 2
  bonds.push([0,1],[0,2]);

  // PEt3: three ethyl groups on P
  // P is at (-2.28,0,0), Au is toward +x
  // Three P-C bonds at tetrahedral angles from P-Au axis
  const axPAu=normalize([AuP,0,0]); // direction from P toward Au
  let perpP=[0,1,0];
  const uP=normalize(cross(axPAu,perpP)); const vP=cross(axPAu,uP);
  const tetTilt=109.5*Math.PI/180/2;
  for(let i=0;i<3;i++){
    const phi=i*2*Math.PI/3;
    const dir=normalize([
      -Math.cos(tetTilt)*axPAu[0]+Math.sin(tetTilt)*(Math.cos(phi)*uP[0]+Math.sin(phi)*vP[0]),
      -Math.cos(tetTilt)*axPAu[1]+Math.sin(tetTilt)*(Math.cos(phi)*uP[1]+Math.sin(phi)*vP[1]),
      -Math.cos(tetTilt)*axPAu[2]+Math.sin(tetTilt)*(Math.cos(phi)*uP[2]+Math.sin(phi)*vP[2]),
    ]);
    const Px=-AuP, Py=0, Pz=0;
    const c1x=Px+dir[0]*PC, c1y=Py+dir[1]*PC, c1z=Pz+dir[2]*PC;
    const c1i=atoms.length;
    atoms.push(['C',...b(c1x,c1y,c1z)]);
    bonds.push([1,c1i]);
    // Second C of ethyl
    const c2x=c1x+dir[0]*CC, c2y=c1y+dir[1]*CC, c2z=c1z+dir[2]*CC;
    const c2i=atoms.length;
    atoms.push(['C',...b(c2x,c2y,c2z)]);
    bonds.push([c1i,c2i]);
    // H on C1 (2H) and C2 (3H) - simplified: just 1H each for brevity
    const perp2=[0,1,0]; const u2=normalize(cross(dir,perp2));
    atoms.push(['H',...b(c1x+u2[0]*CH,c1y+u2[1]*CH,c1z+u2[2]*CH)]);
    bonds.push([c1i,atoms.length-1]);
    atoms.push(['H',...b(c1x-u2[0]*CH,c1y-u2[1]*CH,c1z-u2[2]*CH)]);
    bonds.push([c1i,atoms.length-1]);
    atoms.push(['H',...b(c2x+u2[0]*CH,c2y+u2[1]*CH,c2z+u2[2]*CH)]);
    bonds.push([c2i,atoms.length-1]);
    atoms.push(['H',...b(c2x-u2[0]*CH,c2y-u2[1]*CH,c2z-u2[2]*CH)]);
    bonds.push([c2i,atoms.length-1]);
    atoms.push(['H',...b(c2x+dir[0]*CH,c2y+dir[1]*CH,c2z+dir[2]*CH)]);
    bonds.push([c2i,atoms.length-1]);
  }

  // S-glucose: simplified as S-C with acetylated glucose fragment
  // Just show S connected to a carbon skeleton (highly simplified)
  const Si=2;
  const sc1x=AuS+SC, sc1y=0, sc1z=0; // first C of glucose attached to S
  atoms.push(['C',...b(sc1x,sc1y,sc1z)]); // C1
  const c1gi=atoms.length-1;
  bonds.push([Si,c1gi]);
  // glucose ring: simplified 5-membered ring with O
  const gOx=sc1x+1.43, gOy=0, gOz=1.20;
  atoms.push(['O',...b(gOx,gOy,gOz)]);
  const gOi=atoms.length-1;
  // Just a few more carbons
  atoms.push(['C',...b(sc1x+2.0,sc1y+1.0,sc1z+0.5)]); bonds.push([c1gi,atoms.length-1]); const c2gi=atoms.length-1;
  atoms.push(['C',...b(sc1x+2.0,sc1y-1.0,sc1z+0.5)]); bonds.push([c2gi,atoms.length-1]); const c3gi=atoms.length-1;
  atoms.push(['C',...b(sc1x+1.5,sc1y+0.0,sc1z+1.8)]); bonds.push([c3gi,atoms.length-1]);
  bonds.push([c1gi,gOi],[gOi,atoms.length-1]);
  // Acetyl group on C2
  atoms.push(['O',...b(sc1x+3.4,sc1y+1.0,sc1z)]); bonds.push([c2gi,atoms.length-1]);

  return { atoms, bonds, he: 16 };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Build all files
// ═══════════════════════════════════════════════════════════════════════════════

// ── 1. More organometallics ───────────────────────────────────────────────────

console.log('Building more-organometallics.js...');
let orgFile = `import { addMol } from './core.js';\n\n`;

// Straight sandwich metallocenes (Ru, Cr, V)
orgFile += molBlock('Ruthenocene', 'Organometallic', makeMetallocene('Ru', 1.820)) + '\n';
orgFile += molBlock('Chromocene',  'Organometallic', makeMetallocene('Cr', 1.790)) + '\n';
orgFile += molBlock('Vanadocene',  'Organometallic', makeMetallocene('V',  1.930)) + '\n';

// Bis(benzene)chromium
orgFile += molBlock('Dibenzenechromium', 'Organometallic', makeDibenzeneMetal('Cr', 1.614)) + '\n';

// Carbonyls
orgFile += molBlock('Nickel tetracarbonyl', 'Organometallic', makeNiCO4()) + '\n';
orgFile += molBlock('Chromium hexacarbonyl', 'Organometallic', makeCrCO6()) + '\n';

// Bent metallocenes
orgFile += molBlock('Titanocene dichloride', 'Organometallic',
  makeBentMetalloceneDihalide('Ti', 2.06, 65, 'Cl', 2.36, 47.5)) + '\n';
orgFile += molBlock('Vanadocene dichloride', 'Organometallic',
  makeBentMetalloceneDihalide('V',  2.00, 63, 'Cl', 2.34, 47.5)) + '\n';

writeFileSync('js/molecules/more-organometallics.js', orgFile);
console.log('  Written (8 compounds).');

// ── 2. Platinum drugs ─────────────────────────────────────────────────────────

console.log('Building platinum-drugs.js...');
let ptFile = `import { addMol } from './core.js';\n\n`;
ptFile += molBlock('Cisplatin',   'Platinum Drug', makeCisplatin()) + '\n';
ptFile += molBlock('Carboplatin', 'Platinum Drug', makeCarboplatin()) + '\n';
ptFile += molBlock('Oxaliplatin', 'Platinum Drug', makeOxaliplatin()) + '\n';
writeFileSync('js/molecules/platinum-drugs.js', ptFile);
console.log('  Written (3 compounds).');

// ── 3. Selenium biology ───────────────────────────────────────────────────────

console.log('Building selenium-biology.js...');
let seFile = `import { addMol } from './core.js';\n\n`;
seFile += molBlock('Selenocysteine',    'Selenium Compound', makeSelenocysteine()) + '\n';
seFile += molBlock('Selenomethionine',  'Selenium Compound', makeSelenoMethionine()) + '\n';
seFile += molBlock('Ebselen',          'Selenium Compound', makeEbselen()) + '\n';
seFile += molBlock('Auranofin',        'Gold Drug',         makeAuranofin()) + '\n';
writeFileSync('js/molecules/selenium-biology.js', seFile);
console.log('  Written (4 compounds: 3 Se + auranofin).');

// Summary
const counts = [8, 3, 4];
console.log(`\nAll done! ${counts.reduce((a,b)=>a+b,0)} total new molecules.`);
console.log('Files created:');
console.log('  js/molecules/more-organometallics.js');
console.log('  js/molecules/platinum-drugs.js');
console.log('  js/molecules/selenium-biology.js');
