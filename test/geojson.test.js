import { describe, it, expect } from "vitest";
import { extractRings } from "../src/geojson.js";

describe("extractRings", () => {
  it("穴のない単純な Polygon から1リングを抽出する", () => {
    const fc = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {},
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [0, 0],
                [10, 0],
                [10, 10],
                [0, 10],
                [0, 0],
              ],
            ],
          },
        },
      ],
    };

    const rings = extractRings(fc);
    expect(rings).toHaveLength(1);
    expect(rings[0]).toEqual([
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ]);
  });

  it("穴あき Polygon（内環を持つ）から外環・内環すべてを抽出する", () => {
    const fc = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [0, 0],
                [20, 0],
                [20, 20],
                [0, 20],
                [0, 0],
              ],
              [
                [5, 5],
                [15, 5],
                [15, 15],
                [5, 15],
                [5, 5],
              ],
            ],
          },
        },
      ],
    };

    const rings = extractRings(fc);
    expect(rings).toHaveLength(2);
    expect(rings[0][0]).toEqual([0, 0]);
    expect(rings[1][0]).toEqual([5, 5]);
  });

  it("MultiPolygon の複数ポリゴン・複数リングをすべてフラットに抽出する", () => {
    const fc = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "MultiPolygon",
            coordinates: [
              [
                [
                  [0, 0],
                  [1, 0],
                  [1, 1],
                  [0, 0],
                ],
              ],
              [
                [
                  [10, 10],
                  [11, 10],
                  [11, 11],
                  [10, 10],
                ],
                [
                  [10.4, 10.4],
                  [10.6, 10.4],
                  [10.6, 10.6],
                  [10.4, 10.4],
                ],
              ],
            ],
          },
        },
      ],
    };

    const rings = extractRings(fc);
    // 1つ目のポリゴン(1リング) + 2つ目のポリゴン(外環+内環の2リング) = 3リング
    expect(rings).toHaveLength(3);
  });

  it("複数 feature をまたいで抽出する", () => {
    const fc = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
        },
        {
          type: "Feature",
          geometry: { type: "Polygon", coordinates: [[[5, 5], [6, 5], [6, 6], [5, 5]]] },
        },
      ],
    };

    const rings = extractRings(fc);
    expect(rings).toHaveLength(2);
  });

  it("features が空の FeatureCollection では空配列を返す", () => {
    expect(extractRings({ type: "FeatureCollection", features: [] })).toEqual([]);
  });

  it("Polygon/MultiPolygon 以外の geometry は無視する", () => {
    const fc = {
      type: "FeatureCollection",
      features: [
        { type: "Feature", geometry: { type: "Point", coordinates: [0, 0] } },
        { type: "Feature", geometry: { type: "LineString", coordinates: [[0, 0], [1, 1]] } },
      ],
    };
    expect(extractRings(fc)).toEqual([]);
  });

  it("座標の並び順 [lon, lat] をそのまま保持する（緯度経度を入れ替えない）", () => {
    const fc = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [[[139.7, 35.7], [-73.9, 40.7]]],
          },
        },
      ],
    };
    const rings = extractRings(fc);
    expect(rings[0][0]).toEqual([139.7, 35.7]);
    expect(rings[0][1]).toEqual([-73.9, 40.7]);
  });
});
