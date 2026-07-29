const DEFAULT_PAGE_SIZE = 500;

/**
 * @internal
 * Collecte des pages Data API ordonnées par une clé stable. Ce helper n’est
 * exposé par aucun DTO métier ni par le lecteur public.
 */
export async function collectLitterWeighingTodayPages<Row>({
  readPage,
  rowKey,
  pageSize = DEFAULT_PAGE_SIZE,
}: {
  readPage: (from: number, to: number) => Promise<readonly Row[]>;
  rowKey: (row: Row) => string;
  pageSize?: number;
}): Promise<Row[]> {
  if (!Number.isInteger(pageSize) || pageSize < 1) {
    throw new Error("Pagination page size must be a positive integer.");
  }

  const result: Row[] = [];
  const seenKeys = new Set<string>();
  let offset = 0;

  while (true) {
    const page = await readPage(offset, offset + pageSize - 1);
    for (const row of page) {
      const key = rowKey(row);
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        result.push(row);
      }
    }

    if (page.length < pageSize) break;
    offset += pageSize;
  }

  return result;
}
