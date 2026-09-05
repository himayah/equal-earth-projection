import { describe, it, expect } from "vitest";
import {
  toRadians,
  toDegrees,
  normalizeLongitude,
  equalEarthRaw,
  project,
  dragDeltaToLongitudeDelta,
  M,
  A1,
} from "../src/equalEarth.js";

describe("toRadians / toDegrees", () => {
  it("互いに逆変換である", () => {
    expect(toRadians(180)).toBeCloseTo(Math.PI, 10);
    expect(toDegrees(Math.PI)).toBeCloseTo(180, 10);
    expect(toDegrees(toRadians(37.5))).toBeCloseTo(37.5, 10);
  });
});

describe("normalizeLongitude", () => {
  it("範囲内の値はそのまま返す", () => {
    expect(normalizeLongitude(0)).toBeCloseTo(0, 10);
    expect(normalizeLongitude(180)).toBeCloseTo(180, 10);
    expect(normalizeLongitude(-179)).toBeCloseTo(-179, 10);
  });

  it("180度を超える値を (-180, 180] に折り返す", () => {
    expect(normalizeLongitude(190)).toBeCloseTo(-170, 10);
    expect(normalizeLongitude(-190)).toBeCloseTo(170, 10);
  });

  it("周回する値も正しく正規化する", () => {
    expect(normalizeLongitude(360)).toBeCloseTo(0, 10);
    expect(normalizeLongitude(720 + 10)).toBeCloseTo(10, 10);
    expect(normalizeLongitude(-540)).toBeCloseTo(180, 10);
  });
});

describe("equalEarthRaw", () => {
  it("原点 (lambda=0, phi=0) は [0, 0] に投影される", () => {
    const [x, y] = equalEarthRaw(0, 0);
    expect(x).toBeCloseTo(0, 10);
    expect(y).toBeCloseTo(0, 10);
  });

  it("経度方向に反対称である（x が反転する）", () => {
    const phi = toRadians(23);
    const lambda = toRadians(65);
    const [x1, y1] = equalEarthRaw(lambda, phi);
    const [x2, y2] = equalEarthRaw(-lambda, phi);
    expect(x2).toBeCloseTo(-x1, 10);
    expect(y2).toBeCloseTo(y1, 10);
  });

  it("緯度方向に反対称である（y が反転する）", () => {
    const phi = toRadians(41);
    const lambda = toRadians(-30);
    const [x1, y1] = equalEarthRaw(lambda, phi);
    const [x2, y2] = equalEarthRaw(lambda, -phi);
    expect(x2).toBeCloseTo(x1, 10);
    expect(y2).toBeCloseTo(-y1, 10);
  });

  it("赤道上の経度180度で既知の最大x値になる", () => {
    // x_max = pi / (M * A1)（phi=0 のとき theta=0 となるため解析的に導出できる）
    const expectedXMax = Math.PI / (M * A1);
    const [x, y] = equalEarthRaw(Math.PI, 0);
    expect(x).toBeCloseTo(expectedXMax, 6);
    expect(y).toBeCloseTo(0, 10);
  });

  it("北極・南極で既知の最大y値になる", () => {
    const [, yNorth] = equalEarthRaw(0, Math.PI / 2);
    const [, ySouth] = equalEarthRaw(0, -Math.PI / 2);
    expect(yNorth).toBeCloseTo(1.3174, 4);
    expect(ySouth).toBeCloseTo(-1.3174, 4);
    expect(ySouth).toBeCloseTo(-yNorth, 10);
  });
});

describe("project", () => {
  const cx = 400;
  const cy = 200;
  const scale = 100;

  it("経度が中心経度と一致するとき、緯度0はキャンバス中心に投影される", () => {
    const { x, y } = project(45, 0, 45, scale, cx, cy);
    expect(x).toBeCloseTo(cx, 6);
    expect(y).toBeCloseTo(cy, 6);
  });

  it("経度と中心経度を同じ量だけシフトしても結果は変わらない（回転不変性）", () => {
    const p1 = project(30, 15, 10, scale, cx, cy);
    const p2 = project(30 + 50, 15, 10 + 50, scale, cx, cy);
    expect(p2.x).toBeCloseTo(p1.x, 6);
    expect(p2.y).toBeCloseTo(p1.y, 6);
  });

  it("北半球は南半球よりピクセルyが小さい（画面上側）", () => {
    const north = project(0, 30, 0, scale, cx, cy);
    const south = project(0, -30, 0, scale, cx, cy);
    expect(north.y).toBeLessThan(cy);
    expect(south.y).toBeGreaterThan(cy);
  });
});

describe("dragDeltaToLongitudeDelta", () => {
  it("移動量0のときは変化量0", () => {
    expect(dragDeltaToLongitudeDelta(0, 100)).toBeCloseTo(0, 10);
  });

  it("正のピクセル移動で符号が一貫している（右ドラッグで経度が減る）", () => {
    const delta = dragDeltaToLongitudeDelta(50, 100);
    expect(delta).toBeLessThan(0);
    const deltaNeg = dragDeltaToLongitudeDelta(-50, 100);
    expect(deltaNeg).toBeGreaterThan(0);
    expect(deltaNeg).toBeCloseTo(-delta, 10);
  });

  it("scale が大きいほど同じピクセル移動に対する経度変化は小さくなる", () => {
    const small = Math.abs(dragDeltaToLongitudeDelta(50, 200));
    const large = Math.abs(dragDeltaToLongitudeDelta(50, 100));
    expect(small).toBeLessThan(large);
  });
});
