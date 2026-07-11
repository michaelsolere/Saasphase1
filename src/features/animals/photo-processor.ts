import sharp, { type Metadata } from "sharp";

export type AnimalPhotoProcessErrorCode =
  | "invalid_type"
  | "unreadable"
  | "too_large"
  | "temporary_error";

export type AnimalPhotoProcessResult =
  | {
      ok: true;
      buffer: Buffer;
      fileSizeBytes: number;
      widthPx: number;
      heightPx: number;
      mimeType: "image/webp";
    }
  | {
      ok: false;
      code: AnimalPhotoProcessErrorCode;
    };

const acceptedInputFormats = new Set(["jpeg", "png", "webp"]);
const acceptedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxInputBytes = 1.5 * 1024 * 1024;
const maxOutputBytes = 2 * 1024 * 1024;
const maxInputPixels = 40_000_000;
const maxOutputLongSide = 1800;

export function isAcceptedAnimalPhotoMimeType(value: string) {
  return acceptedMimeTypes.has(value);
}

export async function processAnimalPrimaryPhotoFile(
  file: File,
): Promise<AnimalPhotoProcessResult> {
  if (!file.size || file.size > maxInputBytes) {
    return { ok: false, code: "too_large" };
  }

  if (!isAcceptedAnimalPhotoMimeType(file.type)) {
    return { ok: false, code: "invalid_type" };
  }

  let input: Buffer;

  try {
    input = Buffer.from(await file.arrayBuffer());
  } catch {
    return { ok: false, code: "unreadable" };
  }

  let metadata: Metadata;

  try {
    metadata = await sharp(input, {
      animated: false,
      limitInputPixels: maxInputPixels,
    }).metadata();
  } catch {
    return { ok: false, code: "unreadable" };
  }

  if (
    !metadata.format ||
    !acceptedInputFormats.has(metadata.format) ||
    (metadata.pages ?? 1) > 1 ||
    (metadata.pageHeight ?? 0) > 0
  ) {
    return { ok: false, code: "invalid_type" };
  }

  if (!metadata.width || !metadata.height) {
    return { ok: false, code: "unreadable" };
  }

  if (metadata.width * metadata.height > maxInputPixels) {
    return { ok: false, code: "too_large" };
  }

  try {
    const output = await sharp(input, {
      animated: false,
      limitInputPixels: maxInputPixels,
    })
      .rotate()
      .resize({
        width: maxOutputLongSide,
        height: maxOutputLongSide,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 80 })
      .toBuffer({ resolveWithObject: true });

    if (output.data.byteLength > maxOutputBytes) {
      return { ok: false, code: "too_large" };
    }

    if (!output.info.width || !output.info.height) {
      return { ok: false, code: "unreadable" };
    }

    return {
      ok: true,
      buffer: output.data,
      fileSizeBytes: output.data.byteLength,
      widthPx: output.info.width,
      heightPx: output.info.height,
      mimeType: "image/webp",
    };
  } catch {
    return { ok: false, code: "temporary_error" };
  }
}
