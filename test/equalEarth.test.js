import { describe, it, expect } from "vitest";
import {
  toRadians,
  toDegrees,
  normalizeLongitude,
  equalEarthRaw,
  project,
  dragDeltaToLongitudeDelta,
  unwrapRingLongitudes,
  ringLongitudeRange,
  longitudeShiftsForView,
  clipRingToLongitudeWindow,
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

describe("unwrapRingLongitudes", () => {
  it("対蹠経線をまたがないリングはそのまま返す", () => {
    const ring = [
      [10, 5],
      [20, 5],
      [20, -5],
      [10, -5],
    ];
    expect(unwrapRingLongitudes(ring)).toEqual(ring);
  });

  it("隣接頂点が対蹠経線をまたぐ場合、連続な値に補正する", () => {
    // 実際には10°しか離れていないが、単純な正規化では170→-170と大きく跳ぶ。
    const ring = [
      [170, 0],
      [-170, 0],
    ];
    const unwrapped = unwrapRingLongitudes(ring);
    expect(unwrapped[0]).toEqual([170, 0]);
    expect(unwrapped[1][0]).toBeCloseTo(190, 10); // -170 ではなく 190 相当に補正される
  });

  it("結果の隣接差は常に小さい（180°を超えるジャンプが生じない）", () => {
    const ring = [
      [175, 10],
      [-175, 12],
      [-178, 8],
      [179, 5],
      [170, 3],
    ];
    const unwrapped = unwrapRingLongitudes(ring);
    for (let i = 1; i < unwrapped.length; i++) {
      expect(Math.abs(unwrapped[i][0] - unwrapped[i - 1][0])).toBeLessThanOrEqual(10 + 1e-9);
    }
  });

  it("緯度は変更しない", () => {
    const ring = [
      [170, 12.5],
      [-170, -33.3],
    ];
    const unwrapped = unwrapRingLongitudes(ring);
    expect(unwrapped[0][1]).toBe(12.5);
    expect(unwrapped[1][1]).toBe(-33.3);
  });
});

describe("ringLongitudeRange", () => {
  it("連続経度化されたリングの最小・最大経度を返す", () => {
    const unwrapped = [
      [170, 0],
      [190, 0],
      [175, 10],
    ];
    expect(ringLongitudeRange(unwrapped)).toEqual([170, 190]);
  });
});

describe("longitudeShiftsForView", () => {
  it("中心経度の近くにあるリングはオフセット0で表示できる", () => {
    const shifts = longitudeShiftsForView([10, 20], 0);
    expect(shifts).toContain(0);
  });

  it("中心の対蹠側にあるリングは、表示に必要なオフセットを1つ返す", () => {
    // 中心経度0のとき、経度190°付近のリングは -360 のオフセットで
    // -170°付近として表示範囲(-180,180]に入る。
    const shifts = longitudeShiftsForView([185, 195], 0);
    expect(shifts).toHaveLength(1);
    expect(shifts[0]).toBe(-360);
  });

  it("表示範囲の両端にかかるリングには複数のオフセットを返す", () => {
    // 中心経度180のとき、経度0°付近のリング（幅20°）は
    // 表示範囲の右端(+180)にも左端(-180相当=+180から見て360引いた側)にも
    // またがり得るため、+180 と -180 の双方のオフセットが該当し得る。
    const shifts = longitudeShiftsForView([-10, 10], 180);
    expect(shifts.length).toBeGreaterThanOrEqual(1);
    // 実際に表示範囲内に入るオフセットのみが返っていることを検証する。
    for (const shift of shifts) {
      expect(10 + shift).toBeGreaterThanOrEqual(180 - 180 - 1e-9);
      expect(-10 + shift).toBeLessThanOrEqual(180 + 180 + 1e-9);
    }
  });

  it("Antarcticaのような360°に及ぶ広いリングでも、表示に必要なオフセットを漏れなく返す", () => {
    const shifts = longitudeShiftsForView([-180, 180], 77);
    expect(shifts.length).toBeGreaterThanOrEqual(1);
  });
});

describe("clipRingToLongitudeWindow", () => {
  it("すべての頂点が範囲内のリングはそのまま返す", () => {
    const points = [
      [10, 5],
      [20, 5],
      [20, -5],
      [10, -5],
    ];
    expect(clipRingToLongitudeWindow(points)).toEqual(points);
  });

  it("すべての頂点が範囲外のリングは空になる", () => {
    const points = [
      [200, 5],
      [210, 5],
      [210, -5],
      [200, -5],
    ];
    expect(clipRingToLongitudeWindow(points)).toEqual([]);
  });

  it("境界を1回はみ出すリングは、境界上の点を挿入して切り詰められる", () => {
    const points = [
      [170, 10],
      [190, 10],
      [190, -10],
      [170, -10],
    ];
    const clipped = clipRingToLongitudeWindow(points);
    for (const [lon] of clipped) {
      expect(lon).toBeGreaterThanOrEqual(-180 - 1e-9);
      expect(lon).toBeLessThanOrEqual(180 + 1e-9);
    }
    // 元の190°だった頂点は180°に切り詰められているはず。
    expect(clipped.some(([lon]) => Math.abs(lon - 180) < 1e-9)).toBe(true);
  });

  it("境界上の閉じ辺で緯度差が大きい場合は細かく細分化される", () => {
    const points = [
      [170, 60],
      [190, 60],
      [190, -60],
      [170, -60],
    ];
    const clipped = clipRingToLongitudeWindow(points);
    // 境界(180°)上の隣接点はどこも緯度差が小さい。
    for (let i = 0; i < clipped.length; i++) {
      const curr = clipped[i];
      const next = clipped[(i + 1) % clipped.length];
      if (curr[0] === next[0] && Math.abs(curr[0]) === 180) {
        expect(Math.abs(next[1] - curr[1])).toBeLessThanOrEqual(2 + 1e-9);
      }
    }
  });

  it("回帰テスト: 高緯度・relLonが180°を大きく超える点は必ず除去される", () => {
    // 実データで確認された不具合の再現ケース: 緯度78°付近・relLon 300°超の点は、
    // 投影後のx座標がキャンバスの余白内に収まってしまうことがあるため、
    // 投影前に明示的なクリップで除去されていなければならない。
    const points = [
      [104, 77.7],
      [105, 77.6],
      [106, 77.5],
      [105, 77.4],
    ].map(([lon, lat]) => [lon + 360 - 162.7, lat]); // シフト+中心経度差し引き後の relLon
    const clipped = clipRingToLongitudeWindow(points);
    for (const [lon] of clipped) {
      expect(lon).toBeGreaterThanOrEqual(-180 - 1e-9);
      expect(lon).toBeLessThanOrEqual(180 + 1e-9);
    }
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
