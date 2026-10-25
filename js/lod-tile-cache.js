export class LodTileCache {
  constructor({ minZ, maxZ, maxCachedTiles, maxCachedBytes }) {
    this.minZ = minZ;
    this.maxZ = maxZ;
    this.maxCachedTiles = maxCachedTiles;
    this.maxCachedBytes = maxCachedBytes ?? Number.POSITIVE_INFINITY;
    this.cacheByLOD = new Map();
    this.size = 0;
    this.byteSize = 0;
  }

  getLodCache(z, create = false) {
    let lodCache = this.cacheByLOD.get(z);
    if (!lodCache && create) {
      lodCache = new Map();
      this.cacheByLOD.set(z, lodCache);
    }
    return lodCache;
  }

  get(key) {
    return this.getLodCache(this.getLOD(key))?.get(key);
  }

  has(key) {
    return this.getLodCache(this.getLOD(key))?.has(key) ?? false;
  }

  set(key, tile) {
    const lodCache = this.getLodCache(this.getLOD(key), true);
    const previous = lodCache.get(key);
    if (previous) this.byteSize -= previous.memoryBytes || 0;
    else this.size++;
    lodCache.set(key, tile);
    this.byteSize += tile.memoryBytes || 0;
  }

  *values() {
    for (const lodCache of this.cacheByLOD.values()) {
      yield* lodCache.values();
    }
  }

  getLODCounts() {
    return [...this.cacheByLOD]
      .sort(([a], [b]) => a - b)
      .map(([z, lodCache]) => [z, lodCache.size]);
  }

  clear(disposeTile) {
    for (const tile of this.values()) disposeTile(tile);
    this.cacheByLOD.clear();
    this.size = 0;
    this.byteSize = 0;
  }

  evict(visible, disposeTile) {
    if (this.size <= this.maxCachedTiles && this.byteSize <= this.maxCachedBytes) return;
    const perLodLimit = Math.ceil(this.maxCachedTiles / (this.maxZ - this.minZ + 1));
    const candidates = [...this.cacheByLOD].flatMap(([z, lodCache]) =>
      [...lodCache.entries()]
        .filter(([key, tile]) => !visible.has(key) && tile.state === "loaded")
        .map(([key, tile]) => ({ key, tile, z, lastUsed: tile.lastUsed || 0 })),
    );
    while ((this.size > this.maxCachedTiles || this.byteSize > this.maxCachedBytes) &&
        candidates.length) {
      candidates.sort((a, b) => {
        const aOverQuota = (this.getLodCache(a.z)?.size || 0) > perLodLimit;
        const bOverQuota = (this.getLodCache(b.z)?.size || 0) > perLodLimit;
        return Number(bOverQuota) - Number(aOverQuota) || a.lastUsed - b.lastUsed;
      });
      const { key, tile, z } = candidates.shift();
      const memoryBytes = tile.memoryBytes || 0;
      disposeTile(tile);
      const lodCache = this.getLodCache(z);
      if (lodCache.delete(key)) {
        this.size--;
        this.byteSize -= memoryBytes;
        if (lodCache.size === 0) this.cacheByLOD.delete(z);
      }
    }
  }

  getLOD(key) {
    return Number(key.split("/")[0]);
  }
}
