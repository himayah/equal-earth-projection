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

// 中心経度からの相対経度（度）と緯度（度）からキャンバス上のピクセル座標を求める。
// 相対経度の正規化は行わない（呼び出し側の責務）。
export function projectRelative(relLonDeg, latDeg, scale, cx, cy) {
  const [xProj, yProj] = equalEarthRaw(toRadians(relLonDeg), toRadians(latDeg));
  return {
    x: cx + scale * xProj,
    y: cy - scale * yProj,
  };
}

// 経度・緯度（度）と中心経度からキャンバス上のピクセル座標を求める。
export function project(lonDeg, latDeg, centerLonDeg, scale, cx, cy) {
  const deltaLonDeg = normalizeLongitude(lonDeg - centerLonDeg);
  return projectRelative(deltaLonDeg, latDeg, scale, cx, cy);
}

// リング（頂点配列）を、中心経度に依存しない「連続な経度表現」に変換する。
// 各頂点の経度を、直前の頂点に最も近い分岐（360°の整数倍だけずらした値）に
// 補正していくことで、実際の海岸線のように隣接頂点が近い場合は
// 経度が単調に連続し、対蹠経線（±180°）をまたいでも不連続にジャンプしない。
// この変換は中心経度に依存しないため、データ読み込み時に1回だけ計算すればよい
// （毎フレーム計算し直す必要がない）。
export function unwrapRingLongitudes(ring) {
  if (ring.length === 0) return [];
  const result = [[ring[0][0], ring[0][1]]];
  let prevLon = ring[0][0];
  for (let i = 1; i < ring.length; i++) {
    const [lon, lat] = ring[i];
    let unwrapped = lon;
    while (unwrapped - prevLon > 180) unwrapped -= 360;
    while (unwrapped - prevLon < -180) unwrapped += 360;
    result.push([unwrapped, lat]);
    prevLon = unwrapped;
  }
  return result;
}

// 連続経度化されたリング（unwrapRingLongitudesの戻り値）の経度の最小・最大値を求める。
export function ringLongitudeRange(unwrappedRing) {
  let min = Infinity;
  let max = -Infinity;
  for (const [lon] of unwrappedRing) {
    if (lon < min) min = lon;
    if (lon > max) max = lon;
  }
  return [min, max];
}

// 連続経度の範囲 [minLon, maxLon] を持つリングを、現在の中心経度で
// 表示するために必要な「360°の整数倍のオフセット」の一覧を返す。
// 通常は1個（稀に対蹠経線をまたいで表示範囲の両端にかかる場合は2個以上）。
// このオフセットを連続経度に加えてから投影すれば、表示範囲外にはみ出す部分は
// Canvas自身が自然にクリップするため、断片分割や境界上の補間は一切不要になる。
export function longitudeShiftsForView(range, centerLonDeg) {
  const [minLon, maxLon] = range;
  const mid = (minLon + maxLon) / 2;
  const bestK = Math.round((centerLonDeg - mid) / 360);
  const viewMin = centerLonDeg - 180;
  const viewMax = centerLonDeg + 180;

  const shifts = [];
  for (let k = bestK - 2; k <= bestK + 2; k++) {
    const shift = k * 360;
    if (maxLon + shift >= viewMin && minLon + shift <= viewMax) {
      shifts.push(shift);
    }
  }
  return shifts;
}

// [relLon, lat] の点列を、relLon の半平面（isInside）に対してクリップする
// （Sutherland-Hodgman法）。半平面の境界と交差する辺には、線形補間した
// 交点 [boundaryLon, 補間緯度] を挿入する。
function clipHalfPlane(points, isInside, boundaryLon) {
  const n = points.length;
  if (n === 0) return [];

  function intersect(a, b) {
    const t = (boundaryLon - a[0]) / (b[0] - a[0]);
    return [boundaryLon, a[1] + t * (b[1] - a[1])];
  }

  const result = [];
  let prev = points[n - 1];
  let prevInside = isInside(prev);
  for (const curr of points) {
    const currInside = isInside(curr);
    if (currInside) {
      if (!prevInside) result.push(intersect(prev, curr));
      result.push(curr);
    } else if (prevInside) {
      result.push(intersect(prev, curr));
    }
    prev = curr;
    prevInside = currInside;
  }
  return result;
}

// クリップ後の点列のうち、隣接する2点が同じ境界(±180°)上にあり
// 緯度差が大きい区間を、緯度約2°刻みの中間点で細分化する。
// Equal Earth Projection は経度を固定しても緯度によってx座標が変化する
// （境界線は地図の輪郭に沿った滑らかな曲線）ため、この細分化がないと
// 境界上の2点を単純な直線で結んだときに輪郭から外れて見えてしまう。
function subdivideBoundaryEdges(points) {
  const n = points.length;
  if (n < 2) return points;

  const result = [];
  for (let i = 0; i < n; i++) {
    const curr = points[i];
    const next = points[(i + 1) % n];
    result.push(curr);
    if (curr[0] === next[0] && Math.abs(curr[0]) === 180) {
      const gap = Math.abs(next[1] - curr[1]);
      if (gap > 2) {
        const steps = Math.ceil(gap / 2);
        for (let s = 1; s < steps; s++) {
          result.push([curr[0], curr[1] + (next[1] - curr[1]) * (s / steps)]);
        }
      }
    }
  }
  return result;
}

// [relLon, lat] の点列（連続経度・シフト適用済み）を、表示可能な範囲
// relLon ∈ [-180, 180] に明示的にクリップする。
//
// 【重要】Equal Earth Projection の x 座標は緯度によってスケールが変化する
// （高緯度ほど小さくなる）ため、|relLon| が180°を大きく超えていても、
// 高緯度の点では投影後のx座標がキャンバスの表示範囲内に収まってしまうことがある。
// 「表示範囲外はCanvas自身が自然にクリップする」という前提はこの投影法では
// 緯度によって成り立たず、境界付近で本来表示されるべきでない場所に大きな
// 陸地の断片が現れたり消えたりする不具合（対蹠経線の反対側で経度が
// ±180°を超えたまま投影されることによる）につながる。
// そのため、投影する前に relLon の範囲を明示的に切り詰める必要がある。
export function clipRingToLongitudeWindow(points) {
  let clipped = clipHalfPlane(points, (p) => p[0] <= 180, 180);
  clipped = clipHalfPlane(clipped, (p) => p[0] >= -180, -180);
  return subdivideBoundaryEdges(clipped);
}

// 赤道上のスケールを基準に、ドラッグのピクセル移動量を経度変化量（度）に変換する。
export function dragDeltaToLongitudeDelta(deltaPixels, scale) {
  const pxPerRadianAtEquator = scale / (M * A1);
  const deltaLonRad = -deltaPixels / pxPerRadianAtEquator;
  return toDegrees(deltaLonRad);
}
