// GeoJSON の Polygon / MultiPolygon から、描画に必要なリング（頂点配列）だけを
// 平坦な配列に抽出する純粋関数。index.html にも同一実装をインライン化している。

// 1つの Polygon geometry の coordinates（外環+内環のリング配列）をそのまま返す。
function ringsFromPolygonCoordinates(polygonCoordinates) {
  return polygonCoordinates.map((ring) => ring.map(([lon, lat]) => [lon, lat]));
}

// GeoJSON FeatureCollection から、Polygon/MultiPolygon の全リングを
// Array<Array<[lon, lat]>> の形にフラット化して返す。
// Polygon/MultiPolygon 以外の geometry や geometry を持たない feature は無視する。
export function extractRings(featureCollection) {
  const rings = [];
  const features = (featureCollection && featureCollection.features) || [];

  for (const feature of features) {
    const geometry = feature && feature.geometry;
    if (!geometry) continue;

    if (geometry.type === "Polygon") {
      rings.push(...ringsFromPolygonCoordinates(geometry.coordinates));
    } else if (geometry.type === "MultiPolygon") {
      for (const polygonCoordinates of geometry.coordinates) {
        rings.push(...ringsFromPolygonCoordinates(polygonCoordinates));
      }
    }
  }

  return rings;
}
