export const SUPPORTED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const MAX_IMAGES_PER_THREAD = 5;
const MAX_SOURCE_IMAGE_BYTES = 20 * 1024 * 1024;
const TARGET_IMAGE_BYTES = 700 * 1024;
const MAX_PREPARED_IMAGE_BYTES = 4 * 1024 * 1024;

export interface PreparedImage {
  mimeType: string;
  data: string;
}

export async function prepareImageFile(file: File): Promise<PreparedImage> {
  if (
    !SUPPORTED_IMAGE_MIME_TYPES.includes(
      file.type as (typeof SUPPORTED_IMAGE_MIME_TYPES)[number]
    )
  ) {
    throw new Error("仅支持 JPG、PNG 或 WebP 图片。");
  }
  if (file.size === 0) {
    throw new Error("图片内容为空。");
  }
  if (file.size > MAX_SOURCE_IMAGE_BYTES) {
    throw new Error("原始图片不能超过 20 MB。");
  }
  if (file.size <= TARGET_IMAGE_BYTES) {
    return _readBlob(file, file.type);
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("无法读取这张图片，请换一张后重试。");
  }

  try {
    let smallest: Blob | null = null;
    for (const attempt of [
      { longestEdge: 1_920, quality: 0.82 },
      { longestEdge: 1_600, quality: 0.72 },
      { longestEdge: 1_280, quality: 0.6 },
    ]) {
      const scale = Math.min(
        1,
        attempt.longestEdge / Math.max(bitmap.width, bitmap.height)
      );
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (!context) {
        throw new Error("当前浏览器无法处理图片。");
      }
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const candidate = await _canvasToBlob(canvas, attempt.quality);
      if (!smallest || candidate.size < smallest.size) {
        smallest = candidate;
      }
      if (candidate.size <= TARGET_IMAGE_BYTES) {
        break;
      }
    }

    if (!smallest || smallest.size > MAX_PREPARED_IMAGE_BYTES) {
      throw new Error("图片压缩后仍过大，请换一张更小的图片。");
    }
    return _readBlob(smallest, "image/webp");
  } finally {
    bitmap.close();
  }
}

function _canvasToBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("图片压缩失败，请换一张后重试。"));
      },
      "image/webp",
      quality
    );
  });
}

function _readBlob(blob: Blob, mimeType: string): Promise<PreparedImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("图片读取失败，请重试。"));
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      const separator = dataUrl.indexOf(",");
      const data = separator >= 0 ? dataUrl.slice(separator + 1) : "";
      if (!data) {
        reject(new Error("图片读取失败，请重试。"));
        return;
      }
      resolve({ mimeType, data });
    };
    reader.readAsDataURL(blob);
  });
}
