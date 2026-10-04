export interface PageEnvelope<T> { items: T[]; page: number; pages: number }

/** Walk server pagination, including when its page size is lower than requested. */
export async function collectPages<T>(fetchPage: (page: number) => Promise<PageEnvelope<T>>, maxPages = 200): Promise<T[]> {
  const items: T[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const result = await fetchPage(page);
    if (!Array.isArray(result.items) || result.page !== page || !Number.isInteger(result.pages) || result.pages < 1) {
      throw new Error("Invalid pagination response");
    }
    items.push(...result.items);
    if (page >= result.pages) return items;
  }
  throw new Error("Collection exceeds the supported page limit; use a filtered list");
}
