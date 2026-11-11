import type { CropPx, PixelSize } from "@/features/print/geometry";
import { photoFilter, type PhotoAdjustments } from "@/features/print/photo-adjustments";

export function PhotoPreview({ url, source, crop, adjustments }: {
  url: string; source: PixelSize; crop: CropPx; adjustments?: PhotoAdjustments;
}) {
  return (
    <span className="photo-preview">
      {/* Blob URLs are created locally and have no image optimization endpoint. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        alt=""
        src={url}
        draggable={false}
        style={{
          width: `${100 * source.width / crop.width}%`,
          height: `${100 * source.height / crop.height}%`,
          left: `${-100 * crop.x / crop.width}%`,
          top: `${-100 * crop.y / crop.height}%`,
          filter: photoFilter(adjustments),
        }}
      />
    </span>
  );
}
