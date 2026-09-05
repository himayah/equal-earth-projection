// Equal Earth Projection のコアロジック（純粋関数のみ）。
// index.html にも同一実装をインライン化しているため、修正時は両方に反映すること。

export const A1 = 1.340264;
export const A2 = -0.081106;
export const A3 = 0.000893;
export const A4 = 0.003796;
export const M = Math.sqrt(3) / 2;

export function toRadians(deg) {
  return (deg * Math.PI) / 180;
}

export function toDegrees(rad) {
  return (rad * 180) / Math.PI;
}

// 経度を (-180, 180] の範囲に正規化する。
export function normalizeLongitude(lonDeg) {
  let lon = lonDeg % 360;
  if (lon <= -180) lon += 360;
  if (lon > 180) lon -= 360;
  return lon;
}

// Equal Earth Projection の投影式本体。
// lambda, phi はラジアン（lambda は中心経度からの差分）。
// 戻り値は無次元の投影座標 [x, y]。
export function equalEarthRaw(lambda, phi) {
  const theta = Math.asin(M * Math.sin(phi));
  const theta2 = theta * theta;
  const theta6 = theta2 * theta2 * theta2;
  const x =
    (lambda * Math.cos(theta)) /
    (M * (A1 + 3 * A2 * theta2 + theta6 * (7 * A3 + 9 * A4 * theta2)));
  const y = theta * (A1 + A2 * theta2 + theta6 * (A3 + A4 * theta2));
  return [x, y];
}

// 経度・緯度（度）と中心経度からキャンバス上のピクセル座標を求める。
export function project(lonDeg, latDeg, centerLonDeg, scale, cx, cy) {
  const deltaLonDeg = normalizeLongitude(lonDeg - centerLonDeg);
  const [xProj, yProj] = equalEarthRaw(toRadians(deltaLonDeg), toRadians(latDeg));
  return {
    x: cx + scale * xProj,
    y: cy - scale * yProj,
  };
}

// 赤道上のスケールを基準に、ドラッグのピクセル移動量を経度変化量（度）に変換する。
export function dragDeltaToLongitudeDelta(deltaPixels, scale) {
  const pxPerRadianAtEquator = scale / (M * A1);
  const deltaLonRad = -deltaPixels / pxPerRadianAtEquator;
  return toDegrees(deltaLonRad);
}
