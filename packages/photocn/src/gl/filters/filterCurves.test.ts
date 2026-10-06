import { describe, expect, it } from "vitest";

import { curveLookupTables } from "./filterCurves";

const line: [number, number][] = [[0, 0], [1, 1]];
const invert: [number, number][] = [[0, 1], [1, 0]];
const lift: [number, number][] = [[0, 0.5], [1, 1]];

describe("curveLookupTables", () => {
  it("is identity for straight lines", () => {
    const [red] = curveLookupTables([line, line, line, line]);
    expect(red[0]).toBe(0);
    expect(red[128]).toBeCloseTo(128, -1);
    expect(red[255]).toBe(255);
  });

  it("applies the RGB curve even when channel curves are straight lines", () => {
    const [red, green, blue] = curveLookupTables([invert, line, line, line]);
    for (const channel of [red, green, blue]) {
      expect(channel[0]).toBe(255);
      expect(channel[255]).toBe(0);
    }
  });

  it("applies the channel curve, then the RGB curve", () => {
    const [red, green] = curveLookupTables([invert, lift, null, null]);
    // red: 0 → lift → ~128 → invert → ~127
    expect(red[0]).toBeGreaterThan(110);
    expect(red[0]).toBeLessThan(145);
    // green: only the RGB curve
    expect(green[0]).toBe(255);
  });
});
