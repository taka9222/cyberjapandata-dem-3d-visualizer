export function decodeElevation(r, g, b) {
  const value = r * 65536 + g * 256 + b;
  if (value === 8388608) return NaN;
  return (value < 8388608 ? value : value - 16777216) * 0.01;
}

export function createTerrainGeometry({
  THREE,
  CFG,
  SIZE,
  ELEVATION_MIN,
  ELEVATION_MAX,
  tileBounds,
  getOrigin,
  getCachedTile,
  tileKey,
  createContourData,
  getDisplayMode,
  getTerrainStyle,
}) {
  const colorCache = new Map();

  function getStyleColors(style) {
    if (!colorCache.has(style.id)) {
      colorCache.set(style.id, style.stops.map(({ height, color }) => ({
        height,
        color: new THREE.Color(color),
      })));
    }
    return colorCache.get(style.id);
  }

  function setTerrainColor(target, height, shade, stops) {
    const elevation = THREE.MathUtils.clamp(height, ELEVATION_MIN, ELEVATION_MAX);
    let upper = 1;
    while (upper < stops.length - 1 && elevation > stops[upper].height) upper++;
    const lowerStop = stops[upper - 1];
    const upperStop = stops[upper];
    const mix = (elevation - lowerStop.height) / (upperStop.height - lowerStop.height);
    target.lerpColors(lowerStop.color, upperStop.color, mix).multiplyScalar(shade);
  }

  function recolorTile(tile, style = getTerrainStyle()) {
    if (!tile?.objects) return;
    const geometryByColor = new Map();
    for (const object of Object.values(tile.objects)) {
      const geometry = object.geometry;
      const colors = geometry.getAttribute("color");
      if (colors) geometryByColor.set(colors, geometry);
    }
    const stops = getStyleColors(style);
    const color = new THREE.Color();
    for (const [colors, geometry] of geometryByColor) {
      const elevations = geometry.getAttribute("terrainElevation");
      const shades = geometry.getAttribute("terrainShade");
      if (!elevations || !shades) continue;
      for (let index = 0; index < elevations.count; index++) {
        setTerrainColor(color, elevations.getX(index), shades.getX(index), stops);
        colors.setXYZ(index, color.r, color.g, color.b);
      }
      colors.needsUpdate = true;
    }
    tile.terrainStyleId = style.id;
  }

  function createPointCloud(z, x, y, imageData, step = CFG.pixelStep) {
    const { left, top, size } = tileBounds(z, x, y);
    const { originX, originY } = getOrigin();
    const data = imageData?.data;
    const sampleWidth = Math.ceil(SIZE / step);
    const maxVertices = sampleWidth * sampleWidth;
    const positions = new Float32Array(maxVertices * 3);
    const colors = new Float32Array(maxVertices * 3);
    const elevations = new Float32Array(maxVertices);
    const shades = new Float32Array(maxVertices);
    const style = getTerrainStyle();
    const stops = getStyleColors(style);
    const color = new THREE.Color();
    const vertexGrid = new Int32Array(sampleWidth * sampleWidth).fill(-1);
    const lightDirections = style.hillshade.lights.map(({ direction, intensity }) => ({
      direction: new THREE.Vector3(...direction).normalize(),
      intensity,
    }));
    const heightAt = (px, py, fallback) => {
      if (!data) return fallback;
      const sampleX = THREE.MathUtils.clamp(px, 0, SIZE - 1);
      const sampleY = THREE.MathUtils.clamp(py, 0, SIZE - 1);
      const index = (sampleY * SIZE + sampleX) * 4;
      if (data[index + 3] === 0) return fallback;
      const height = decodeElevation(data[index], data[index + 1], data[index + 2]);
      return Number.isFinite(height) ? height : fallback;
    };
    let minH = Infinity;
    let maxH = -Infinity;
    let vertexCount = 0;
    for (let py = 0; py < SIZE; py += step) {
      for (let px = 0; px < SIZE; px += step) {
        if (!data) continue;
        const index = (py * SIZE + px) * 4;
        if (data[index + 3] === 0) continue;
        const height = decodeElevation(data[index], data[index + 1], data[index + 2]);
        if (!Number.isFinite(height)) continue;
        const worldX = left + (px + 0.5) / SIZE * size;
        const worldY = top - (py + 0.5) / SIZE * size;
        const vertexIndex = vertexCount++;
        const vertexOffset = vertexIndex * 3;
        vertexGrid[(py / step) * sampleWidth + px / step] = vertexIndex;
        positions[vertexOffset] = worldX - originX;
        positions[vertexOffset + 1] = height * CFG.verticalScale;
        positions[vertexOffset + 2] = -(worldY - originY);
        const horizontalScale = (size / SIZE * step) * 2;
        const slopeX = (heightAt(px + step, py, height) - heightAt(px - step, py, height)) *
          CFG.verticalScale / horizontalScale;
        const slopeZ = (heightAt(px, py + step, height) - heightAt(px, py - step, height)) *
          CFG.verticalScale / horizontalScale;
        const normalX = -slopeX;
        const normalZ = -slopeZ;
        const inverseNormalLength = 1 / Math.sqrt(normalX * normalX + 1 + normalZ * normalZ);
        const shade = style.hillshade.ambient + lightDirections.reduce(
          (sum, light) => sum + light.intensity * Math.max(
            0,
            (normalX * light.direction.x + light.direction.y + normalZ * light.direction.z) *
              inverseNormalLength,
          ),
          0,
        );
        elevations[vertexIndex] = height;
        shades[vertexIndex] = shade;
        setTerrainColor(color, height, shade, stops);
        colors[vertexOffset] = color.r;
        colors[vertexOffset + 1] = color.g;
        colors[vertexOffset + 2] = color.b;
        minH = Math.min(minH, height);
        maxH = Math.max(maxH, height);
      }
    }
    const positionAttribute = new THREE.BufferAttribute(positions.slice(0, vertexCount * 3), 3);
    const colorAttribute = new THREE.BufferAttribute(colors.slice(0, vertexCount * 3), 3);
    const elevationAttribute = new THREE.BufferAttribute(elevations.slice(0, vertexCount), 1);
    const shadeAttribute = new THREE.BufferAttribute(shades.slice(0, vertexCount), 1);
    const pointGeometry = new THREE.BufferGeometry();
    pointGeometry.setAttribute("position", positionAttribute);
    pointGeometry.setAttribute("color", colorAttribute);
    pointGeometry.setAttribute("terrainElevation", elevationAttribute);
    pointGeometry.setAttribute("terrainShade", shadeAttribute);
    const meshGeometry = new THREE.BufferGeometry();
    meshGeometry.setAttribute("position", positionAttribute);
    meshGeometry.setAttribute("color", colorAttribute);
    meshGeometry.setAttribute("terrainElevation", elevationAttribute);
    meshGeometry.setAttribute("terrainShade", shadeAttribute);
    const indices = new Uint32Array(Math.max(0, (sampleWidth - 1) * (sampleWidth - 1) * 6));
    let indexCount = 0;
    for (let row = 0; row < sampleWidth - 1; row++) {
      for (let column = 0; column < sampleWidth - 1; column++) {
        const topLeft = vertexGrid[row * sampleWidth + column];
        const topRight = vertexGrid[row * sampleWidth + column + 1];
        const bottomLeft = vertexGrid[(row + 1) * sampleWidth + column];
        const bottomRight = vertexGrid[(row + 1) * sampleWidth + column + 1];
        if (topLeft < 0 || topRight < 0 || bottomLeft < 0 || bottomRight < 0) continue;
        indices[indexCount++] = topLeft;
        indices[indexCount++] = bottomLeft;
        indices[indexCount++] = topRight;
        indices[indexCount++] = topRight;
        indices[indexCount++] = bottomLeft;
        indices[indexCount++] = bottomRight;
      }
    }
    meshGeometry.setIndex(new THREE.BufferAttribute(indices.slice(0, indexCount), 1));
    meshGeometry.computeVertexNormals();
    const objects = {
      points: new THREE.Points(
        pointGeometry,
        new THREE.PointsMaterial({
          size: Math.max(0.8, size / SIZE * step * 0.65),
          vertexColors: true,
          sizeAttenuation: true,
        }),
      ),
      wireframe: new THREE.Mesh(
        meshGeometry,
        new THREE.MeshStandardMaterial({ vertexColors: true, wireframe: true, roughness: 0.95 }),
      ),
      mesh: new THREE.Mesh(
        meshGeometry,
        new THREE.MeshStandardMaterial({
          vertexColors: true,
          side: THREE.DoubleSide,
          roughness: 0.95,
          transparent: false,
          opacity: 1,
        }),
      ),
    };
    for (const [mode, object] of Object.entries(objects)) {
      object.frustumCulled = true;
      object.visible = mode === getDisplayMode();
    }
    return {
      objects,
      contourData: createContourData(z, x, y, imageData),
      sourceData: imageData,
      edges: {
        top: Array.from(vertexGrid.slice(0, sampleWidth)),
        bottom: Array.from(vertexGrid.slice((sampleWidth - 1) * sampleWidth)),
        left: Array.from({ length: sampleWidth }, (_, row) => vertexGrid[row * sampleWidth]),
        right: Array.from(
          { length: sampleWidth },
          (_, row) => vertexGrid[row * sampleWidth + sampleWidth - 1],
        ),
      },
      count: vertexCount,
      minH,
      maxH,
      terrainStyleId: style.id,
    };
  }

  function createMissingTile(z, x, y, pixelStep = CFG.pixelStep) {
    let hasAncestorData = false;
    for (let ancestorZ = z - 1; ancestorZ >= CFG.minZ; ancestorZ--) {
      const factor = 2 ** (z - ancestorZ);
      const ancestorX = Math.floor(x / factor);
      const ancestorY = Math.floor(y / factor);
      const ancestor = getCachedTile(tileKey(ancestorZ, ancestorX, ancestorY));
      if (!ancestor?.sourceData?.data) continue;
      hasAncestorData = true;
      if (ancestor.count === 0) continue;
      const source = ancestor.sourceData.data;
      const startX = (x % factor) * SIZE / factor;
      const startY = (y % factor) * SIZE / factor;
      const data = new Uint8ClampedArray(SIZE * SIZE * 4);
      const sampleStep = Math.min(pixelStep, CFG.contourSampleStep);
      const sampleElevation = (px, py) => {
        const sourceX = startX + px / factor;
        const sourceY = startY + py / factor;
        const x0 = Math.floor(sourceX);
        const y0 = Math.floor(sourceY);
        const x1 = Math.min(x0 + 1, SIZE - 1);
        const y1 = Math.min(y0 + 1, SIZE - 1);
        const tx = sourceX - x0;
        const ty = sourceY - y0;
        const sample = (sampleX, sampleY) => {
          const index = (sampleY * SIZE + sampleX) * 4;
          if (source[index + 3] === 0) return NaN;
          return decodeElevation(source[index], source[index + 1], source[index + 2]);
        };
        const h00 = sample(x0, y0);
        const h10 = sample(x1, y0);
        const h01 = sample(x0, y1);
        const h11 = sample(x1, y1);
        if (![h00, h10, h01, h11].every(Number.isFinite)) return NaN;
        const top = h00 * (1 - tx) + h10 * tx;
        const bottom = h01 * (1 - tx) + h11 * tx;
        return top * (1 - ty) + bottom * ty;
      };
      for (let py = 0; py < SIZE; py += sampleStep) {
        for (let px = 0; px < SIZE; px += sampleStep) {
          const index = (py * SIZE + px) * 4;
          const height = sampleElevation(px, py);
          if (!Number.isFinite(height)) continue;
          const value = Math.round(height * 100);
          const encoded = value < 0 ? value + 16777216 : value;
          data[index] = encoded >> 16 & 255;
          data[index + 1] = encoded >> 8 & 255;
          data[index + 2] = encoded & 255;
          data[index + 3] = 255;
        }
      }
      return {
        ...createPointCloud(z, x, y, { data }, pixelStep),
        fallback: true,
      };
    }
    return {
      ...createPointCloud(z, x, y, null, pixelStep),
      fallback: hasAncestorData,
    };
  }

  return { createPointCloud, createMissingTile, recolorTile };
}
