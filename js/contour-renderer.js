import { decodeElevation } from "./terrain-geometry.js";

export function createContourRenderer({
  THREE,
  LineSegments2,
  LineSegmentsGeometry,
  LineMaterial,
  CFG,
  SIZE,
  tileBounds,
  getOrigin,
  getVisibleTiles,
  scene,
  contourSettings,
  isEnabled,
}) {
    function createContourData(z, x, y, imageData) {
      const { left, top, size } = tileBounds(z, x, y);
      const data = imageData?.data;
      const step = CFG.contourSampleStep;
      const sampleWidth = Math.ceil(SIZE / step);
      const heights = new Float32Array(sampleWidth * sampleWidth);
      heights.fill(NaN);

      for (let row = 0; row < sampleWidth; row++) {
        for (let column = 0; column < sampleWidth; column++) {
          if (!data) continue;
          const px = column * step;
          const py = row * step;
          const i = (py * SIZE + px) * 4;
          if (data[i + 3] === 0) continue;
          const height = decodeElevation(data[i], data[i + 1], data[i + 2]);
          if (!Number.isFinite(height)) continue;
          heights[row * sampleWidth + column] = height;
        }
      }

      return { z, x, y, left, top, size, step, sampleWidth, heights };
    }
    function createVisibleContourData(tiles) {
      if (tiles.length === 0) return null;
      const sampleWidth = tiles[0].tile.contourData.sampleWidth;
      const step = tiles[0].tile.contourData.step;
      const minX = Math.min(...tiles.map((tile) => tile.x));
      const maxX = Math.max(...tiles.map((tile) => tile.x));
      const minY = Math.min(...tiles.map((tile) => tile.y));
      const maxY = Math.max(...tiles.map((tile) => tile.y));
      const columns = (maxX - minX + 1) * sampleWidth;
      const rows = (maxY - minY + 1) * sampleWidth;
      const heights = new Float32Array(columns * rows);
      heights.fill(NaN);

      for (const { x, y, tile } of tiles) {
        const { heights: tileHeights } = tile.contourData;
        const offsetX = (x - minX) * sampleWidth;
        const offsetY = (y - minY) * sampleWidth;
        for (let row = 0; row < sampleWidth; row++) {
          const sourceStart = row * sampleWidth;
          const targetStart = (offsetY + row) * columns + offsetX;
          heights.set(tileHeights.subarray(sourceStart, sourceStart + sampleWidth), targetStart);
        }
      }

      const { left, top, size } = tileBounds(tiles[0].z, minX, minY);
      return {
        left,
        top,
        size,
        step,
        tileSampleWidth: sampleWidth,
        sampleWidth: columns,
        sampleHeight: rows,
        heights,
      };
    }
    function createContourLayer(contourData) {
      if (!contourData) return null;
      const { originX, originY } = getOrigin();
      const { left, top, size, step, sampleWidth, heights } = contourData;
      const sampleHeight = contourData.sampleHeight ?? sampleWidth;
      const majorInterval = Number(contourSettings.majorInterval.value);
      const minorInterval = Number(contourSettings.minorInterval.value);
      const majorSegments = [];
      const minorSegments = [];
      const labelPositions = new Map();
      const intervalGcd = (a, b) => b === 0 ? a : intervalGcd(b, a % b);
      const contourStep = intervalGcd(majorInterval, minorInterval);
      for (let row = 0; row < sampleHeight - 1; row++) {
        for (let column = 0; column < sampleWidth - 1; column++) {
          const cell = [
            { x: column, y: row, h: heights[row * sampleWidth + column] },
            { x: column + 1, y: row, h: heights[row * sampleWidth + column + 1] },
            { x: column + 1, y: row + 1, h: heights[(row + 1) * sampleWidth + column + 1] },
            { x: column, y: row + 1, h: heights[(row + 1) * sampleWidth + column] },
          ];
          if (cell.some((point) => !Number.isFinite(point.h))) continue;
          const cellMin = Math.min(...cell.map((point) => point.h));
          const cellMax = Math.max(...cell.map((point) => point.h));
          const startLevel = Math.ceil(cellMin / contourStep) * contourStep;
          for (let level = startLevel; level <= cellMax; level += contourStep) {
            const major = level % majorInterval === 0;
            if (!major && level % minorInterval !== 0) continue;
            const intersections = [];
            for (let edge = 0; edge < 4; edge++) {
              const a = cell[edge];
              const b = cell[(edge + 1) % 4];
              if (!((a.h < level && b.h >= level) || (b.h < level && a.h >= level))) continue;
              const t = (level - a.h) / (b.h - a.h);
              intersections.push({
                x: a.x + (b.x - a.x) * t,
                y: a.y + (b.y - a.y) * t,
              });
            }
            for (let i = 0; i + 1 < intersections.length; i += 2) {
              const a = intersections[i];
              const b = intersections[i + 1];
              const segments = major ? majorSegments : minorSegments;
              segments.push({ level, a, b });
              if (major) {
                const midX = (a.x + b.x) / 2;
                const midY = (a.y + b.y) / 2;
                const tileColumn = Math.floor(midX / contourData.tileSampleWidth);
                const tileRow = Math.floor(midY / contourData.tileSampleWidth);
                const localX = midX - tileColumn * contourData.tileSampleWidth;
                const half = localX < contourData.tileSampleWidth / 2 ? 0 : 1;
                const halfCenterX = tileColumn * contourData.tileSampleWidth +
                  (half === 0 ? contourData.tileSampleWidth * 0.25 : contourData.tileSampleWidth * 0.75);
                const centerY = tileRow * contourData.tileSampleWidth + contourData.tileSampleWidth / 2;
                const dx = midX - halfCenterX;
                const dy = midY - centerY;
                const distance = dx * dx + dy * dy;
                const labelKey = `${level}:${tileColumn}:${tileRow}`;
                const candidates = labelPositions.get(labelKey) ?? [null, null];
                const candidate = candidates[half];
                if (!candidate || distance < candidate.distance) {
                  candidates[half] = {
                    distance,
                    position: new THREE.Vector3(
                      left + (midX * step + 0.5) / SIZE * size - originX,
                      level * CFG.verticalScale + 16,
                      -(top - (midY * step + 0.5) / SIZE * size - originY),
                    ),
                  };
                  labelPositions.set(labelKey, candidates);
                }
              }
            }
          }
        }
      }

      const group = new THREE.Group();
      const addSegments = (positions, color, width) => {
        if (positions.length === 0) return;
        const linePositions = [];
        const addPoint = (point, level) => {
          const worldX = left + (point.x * step + 0.5) / SIZE * size;
          const worldY = top - (point.y * step + 0.5) / SIZE * size;
          linePositions.push(worldX - originX, level * CFG.verticalScale + 8, -(worldY - originY));
        };
        if (contourSettings.smoothing.checked) {
          const byLevel = new Map();
          for (const segment of positions) {
            const levelSegments = byLevel.get(segment.level) ?? [];
            levelSegments.push(segment);
            byLevel.set(segment.level, levelSegments);
          }
          for (const [level, levelSegments] of byLevel) {
            const vertexKey = (point) => `${Math.round(point.x * 1e5)}:${Math.round(point.y * 1e5)}`;
            const adjacency = new Map();
            for (let index = 0; index < levelSegments.length; index++) {
              const segment = levelSegments[index];
              for (const point of [segment.a, segment.b]) {
                const key = vertexKey(point);
                const connected = adjacency.get(key) ?? [];
                connected.push(index);
                adjacency.set(key, connected);
              }
            }
            const used = new Set();
            let nextStart = 0;
            while (used.size < levelSegments.length) {
              while (used.has(nextStart)) nextStart++;
              const firstIndex = nextStart;
              const first = levelSegments[firstIndex];
              const points = [first.a, first.b];
              used.add(firstIndex);
              let endpointKey = vertexKey(first.b);
              while (true) {
                const nextIndex = adjacency.get(endpointKey)?.find((index) => !used.has(index));
                if (nextIndex === undefined) break;
                const next = levelSegments[nextIndex];
                const point = vertexKey(next.a) === endpointKey ? next.b : next.a;
                used.add(nextIndex);
                points.push(point);
                endpointKey = vertexKey(point);
              }
              const closed = points.length > 2 && vertexKey(points[0]) === vertexKey(points[points.length - 1]);
              let smoothed = points;
              for (let pass = 0; pass < 2 && smoothed.length > 2; pass++) {
                if (closed) {
                  const loop = smoothed.slice(0, -1);
                  const refined = [];
                  for (let i = 0; i < loop.length; i++) {
                    const a = loop[i];
                    const b = loop[(i + 1) % loop.length];
                    refined.push(
                      { x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 },
                      { x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 },
                    );
                  }
                  smoothed = [...refined, refined[0]];
                } else {
                  const refined = [smoothed[0]];
                  for (let i = 0; i < smoothed.length - 1; i++) {
                    const a = smoothed[i];
                    const b = smoothed[i + 1];
                    refined.push(
                      { x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 },
                      { x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 },
                    );
                  }
                  refined.push(smoothed[smoothed.length - 1]);
                  smoothed = refined;
                }
              }
              for (let i = 0; i < smoothed.length - 1; i++) {
                addPoint(smoothed[i], level);
                addPoint(smoothed[i + 1], level);
              }
            }
          }
        } else {
          for (const segment of positions) {
            addPoint(segment.a, segment.level);
            addPoint(segment.b, segment.level);
          }
        }
        const geometry = new LineSegmentsGeometry();
        geometry.setPositions(linePositions);
        const material = new LineMaterial({
          color,
          linewidth: width,
          transparent: true,
          opacity: 0.9,
          depthTest: true,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          polygonOffsetUnits: -2,
          worldUnits: false,
        });
        material.resolution.set(innerWidth, innerHeight);
        const lines = new LineSegments2(geometry, material);
        lines.renderOrder = 2;
        group.add(lines);
      };
      addSegments(minorSegments, 0x39483f, Number(contourSettings.minorWidth.value));
      addSegments(majorSegments, 0x293b33, Number(contourSettings.majorWidth.value));
      for (const [labelKey, candidates] of labelPositions) {
        const level = Number(labelKey.split(":")[0]);
        for (const candidate of candidates) {
          if (!candidate) continue;
          const canvas = document.createElement("canvas");
          canvas.width = 96;
          canvas.height = 36;
          const context = canvas.getContext("2d");
          context.fillStyle = "#17211ddd";
          context.strokeStyle = "#e4e0cc";
          context.lineWidth = 1.5;
          context.beginPath();
          context.roundRect(2, 2, 92, 32, 6);
          context.fill();
          context.stroke();
          context.fillStyle = "#f2efe2";
          context.font = "bold 19px sans-serif";
          context.textAlign = "center";
          context.textBaseline = "middle";
          context.fillText(`${level} m`, 48, 18);
          const texture = new THREE.CanvasTexture(canvas);
          texture.colorSpace = THREE.SRGBColorSpace;
          const sprite = new THREE.Sprite(
            new THREE.SpriteMaterial({
              map: texture,
              transparent: true,
              depthTest: false,
              depthWrite: false,
              sizeAttenuation: true,
            }),
          );
          sprite.position.copy(candidate.position);
          sprite.scale.set(size * 0.075, size * 0.028, 1);
          sprite.renderOrder = 3;
          group.add(sprite);
        }
      }
      group.visible = isEnabled();
      return group;
    }
    function disposeContourLayer(layer) {
      if (!layer) return;
      layer.traverse((object) => {
        if (object.isLineSegments2) {
          object.geometry.dispose();
          object.material.dispose();
        } else if (object.isSprite) {
          object.material.map?.dispose();
          object.material.dispose();
        }
      });
      scene.remove(layer);
    }
    let visibleContours = null;
    function rebuildVisibleContours(tiles) {
      disposeContourLayer(visibleContours);
      visibleContours = null;
      if (isEnabled()) {
        const tilesByZoom = new Map();
        for (const entry of tiles) {
          const z = entry.tile.contourData?.z;
          if (z === undefined) continue;
          if (!tilesByZoom.has(z)) tilesByZoom.set(z, []);
          tilesByZoom.get(z).push(entry);
        }
        if (tilesByZoom.size) {
          visibleContours = new THREE.Group();
          for (const levelTiles of tilesByZoom.values()) {
            const layer = createContourLayer(createVisibleContourData(levelTiles));
            if (layer) visibleContours.add(layer);
          }
        }
      }
      if (visibleContours) scene.add(visibleContours);
    }
    function getVisibleContourTiles() {
      return [...getVisibleTiles().values()].map((tile) => {
        return { ...tile.contourData, tile };
      }).filter((entry) => entry.tile?.contourData);
    }
    function resize(width, height) {
      visibleContours?.traverse((object) => {
        if (object.isLineSegments2) object.material.resolution.set(width, height);
      });
    }

    return { createContourData, rebuildVisibleContours, getVisibleContourTiles, resize };
  }