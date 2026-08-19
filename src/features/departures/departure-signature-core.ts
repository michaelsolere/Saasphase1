import { PNG } from "pngjs";

export function hasVisibleDepartureSignature(bytes: Uint8Array, minimumOpaquePixels = 20) {
  try {
    const decoded = PNG.sync.read(Buffer.from(bytes));
    let opaquePixels = 0;
    for (let index = 3; index < decoded.data.length; index += 4) {
      if (decoded.data[index]! > 20 && ++opaquePixels >= minimumOpaquePixels) return true;
    }
    return false;
  } catch {
    return false;
  }
}
