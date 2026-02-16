// Shared physics utilities: rotation matrices, Morse potential helpers.

/**
 * Build a rotation matrix that maps global z → dir (unit vector).
 * Returns flat 9-element array [m00..m22] for term.rot.
 * Returns identity matrix for zero-length input.
 */
export function buildRotationMatrix(dx, dy, dz) {
  const len = Math.sqrt(dx*dx + dy*dy + dz*dz);
  if (len < 1e-10) return [1,0,0, 0,1,0, 0,0,1];
  const zx = dx/len, zy = dy/len, zz = dz/len;

  // Pick a reference vector not parallel to z-axis
  let refx, refy, refz;
  if (Math.abs(zz) < 0.9) {
    refx = 0; refy = 0; refz = 1;
  } else {
    refx = 1; refy = 0; refz = 0;
  }

  // x-axis = ref × z (cross product), normalized
  let xx = refy*zz - refz*zy;
  let xy = refz*zx - refx*zz;
  let xz = refx*zy - refy*zx;
  const xLen = Math.sqrt(xx*xx + xy*xy + xz*xz);
  xx /= xLen; xy /= xLen; xz /= xLen;

  // y-axis = z × x
  const yx = zy*xz - zz*xy;
  const yy = zz*xx - zx*xz;
  const yz = zx*xy - zy*xx;

  // Row 0 = x-axis, Row 1 = y-axis, Row 2 = z-axis
  return [xx, xy, xz, yx, yy, yz, zx, zy, zz];
}
