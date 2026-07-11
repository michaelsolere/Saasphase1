"use client";

import { useState } from "react";

import type { AnimalListItem } from "./types";

type AnimalPhotoThumbnailProps = {
  animalId: string;
  label: string;
  primaryPhoto: AnimalListItem["primaryPhoto"];
};

function AnimalPhotoPlaceholder({
  animalId,
  label,
}: {
  animalId: string;
  label: string;
}) {
  return (
    <div
      className="h-16 w-12 flex-none rounded-md border border-dashed bg-muted-soft"
      aria-label={`Aucune photo principale pour ${label}`}
      data-testid={`animal-list-primary-photo-placeholder-${animalId}`}
    />
  );
}

export function AnimalPhotoThumbnail({
  animalId,
  label,
  primaryPhoto,
}: AnimalPhotoThumbnailProps) {
  const [hasLoadError, setHasLoadError] = useState(false);

  if (!primaryPhoto || hasLoadError) {
    return <AnimalPhotoPlaceholder animalId={animalId} label={label} />;
  }

  return (
    <div className="h-16 w-12 flex-none overflow-hidden rounded-md border bg-muted-soft">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={primaryPhoto.url}
        alt={`Photo principale de ${label}`}
        width={primaryPhoto.width ?? 240}
        height={primaryPhoto.height ?? 300}
        loading="lazy"
        decoding="async"
        className="h-full w-full object-cover"
        data-testid={`animal-list-primary-photo-${animalId}`}
        onError={() => setHasLoadError(true)}
      />
    </div>
  );
}
