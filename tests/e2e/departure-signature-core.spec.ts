import { expect, test } from "@playwright/test";
import { PNG } from "pngjs";

import { hasVisibleDepartureSignature } from "../../src/features/departures/departure-signature-core";

function image(opaquePixels: number) {
  const png = new PNG({ width: 20, height: 20 });
  for (let pixel = 0; pixel < opaquePixels; pixel += 1) {
    const offset = pixel * 4;
    png.data[offset] = 10;
    png.data[offset + 1] = 10;
    png.data[offset + 2] = 10;
    png.data[offset + 3] = 255;
  }
  return PNG.sync.write(png);
}

test("rejects blank or negligible signature PNGs", () => {
  expect(hasVisibleDepartureSignature(image(0))).toBe(false);
  expect(hasVisibleDepartureSignature(image(19))).toBe(false);
  expect(hasVisibleDepartureSignature(Buffer.from("not-a-png"))).toBe(false);
});

test("accepts a visibly drawn signature PNG", () => {
  expect(hasVisibleDepartureSignature(image(20))).toBe(true);
});
