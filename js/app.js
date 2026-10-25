
    import * as THREE from "three";
    import { OrbitControls } from "three/addons/controls/OrbitControls.js";
    import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
    import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
    import { LineMaterial } from "three/addons/lines/LineMaterial.js";
    import { createCameraControls } from "./camera-controls.js";
    import { createContourRenderer } from "./contour-renderer.js";
    import { LodTileCache } from "./lod-tile-cache.js";
    import {
      HALF,
      SIZE,
      WORLD,
      latToY,
      lonToX,
      tileBounds,
      tileFromLonLat,
      xToLon,
      yToLat,
    } from "./geography.js";
    import { createTerrainGeometry } from "./terrain-geometry.js";
    import { getElevationGradient, MAP_PRESETS } from "./map-presets.js";
    import { createMapAnnotations } from "./map-annotations.js";
    // ==================================================
    // 設定
    // ==================================================
    const CFG = {
      root: "./xyz/dem_merge",
      minZ: 7,
      maxZ: 15,
      // 日本全土のタイル範囲
      japanBounds: { west: 122, east: 154, south: 20, north: 46 },
      // 初期表示位置（東富士付近）
      initialLon: 138.82,
      initialLat: 35.30,
      // 2ピクセル間隔で描画品質とメモリ・CPU負荷のバランスを取る
      pixelStep: 1,
      // 標高の垂直誇張
      verticalScale: 2,
      // ズーム距離とLODの対応
      nearDistance: 15000,
      farDistance: 2000000,
      // 自動LODへの段階補正。正は高解像度、負は低負荷
      lodBias: 0,
      // 仰角が各閾値以下になるたびにLODを1段階下げる（デバッグ表示と同じ角度）
      tiltLodThresholds: [25, 15],
      // 同時読み込み数
      maxConcurrent: 10,
      // 画面内タイル数の上限。地平線方向を向いた際の過剰な高解像度読み込みを抑える
      maxVisibleTiles: 128,
      // 子タイルの実データが届くまで親タイルから作る補完表示の品質と1回の生成数
      progressiveFallbackPixelStep: 8,
      maxProgressiveFallbacksPerUpdate: 24,
      // 地平線付近の地表範囲を取りこぼさないよう画面上のレイを細かくサンプリング
      groundRaySamples: 8,
      contourSampleStep: 4,
      // キャッシュの上限
      maxCachedTiles: 512,
      maxCachedBytes: 1024 * 1024 * 1024,
    };
    const ELEVATION_MIN = -500;
    const ELEVATION_MAX = 3000;
    const canvas = document.querySelector("#view");
    const mapGrid = document.querySelector("#map-grid");
    const infoCoordinates = document.querySelector("#info-coordinates");
    const loadingIndicator = document.querySelector("#loading-indicator");
    const viewModeToggle = document.querySelector("#view-mode-toggle");
    const debugToggle = document.querySelector("#debug-toggle");
    const debugInfo = document.querySelector("#debug-info");
    const mapToolButtons = [...document.querySelectorAll("[data-map-tool]")];
    const mapGlyphSelect = document.querySelector("#map-glyph");
    const mapStyleSelect = document.querySelector("#map-style");
    const colorbarGradient = document.querySelector("#colorbar-gradient");
    const commandNavButtons = [...document.querySelectorAll("#command-nav [role='tab']")];
    const displayModeButtons = [...document.querySelectorAll("#display-modes button")];
    const contourToggle = document.querySelector("#contours");
    const contourSettings = {
      majorInterval: document.querySelector("#major-interval"),
      minorInterval: document.querySelector("#minor-interval"),
      majorWidth: document.querySelector("#major-width"),
      minorWidth: document.querySelector("#minor-width"),
      smoothing: document.querySelector("#contour-smoothing"),
    };
    const forceLodToggle = document.querySelector("#force-lod");
    const lodSlider = document.querySelector("#lod-slider");
    const lodValue = document.querySelector("#lod-value");
    const lodBiasSlider = document.querySelector("#lod-bias-slider");
    const lodBiasValue = document.querySelector("#lod-bias-value");
    const maxVisibleTilesSelect = document.querySelector("#max-visible-tiles");
    const cacheBudgetSelect = document.querySelector("#cache-budget");
    const tiltLodThresholdInputs = [
      document.querySelector("#lod-pitch-1"),
      document.querySelector("#lod-pitch-2"),
    ];
    tiltLodThresholdInputs.forEach((input, index) => {
      input.value = CFG.tiltLodThresholds[index];
    });
    lodSlider.min = CFG.minZ;
    lodSlider.max = CFG.maxZ;
    lodSlider.value = THREE.MathUtils.clamp(Number(lodSlider.value), CFG.minZ, CFG.maxZ);
    lodValue.value = lodSlider.value;
    maxVisibleTilesSelect.value = String(CFG.maxVisibleTiles);
    cacheBudgetSelect.value = String(CFG.maxCachedBytes / (1024 * 1024));
    let displayMode = "points";
    let contoursEnabled = false;
    const settingsPanel = document.querySelector("#contour-settings");
    function positionSettingsPanel(button) {
      const navBounds = document.querySelector("#command-nav").getBoundingClientRect();
      const tabBounds = button.getBoundingClientRect();
      const panelWidth = settingsPanel.getBoundingClientRect().width;
      const margin = innerWidth <= 700 ? 10 : 18;
      const left = THREE.MathUtils.clamp(
        tabBounds.left - navBounds.left,
        margin,
        Math.max(margin, innerWidth - panelWidth - margin),
      );
      settingsPanel.style.setProperty("--settings-left", `${left}px`);
    }
    function activateSettingsTab(button, moveFocus = false) {
      const isOpenTab = !settingsPanel.hidden &&
        button.getAttribute("aria-selected") === "true";
      if (isOpenTab) {
        settingsPanel.hidden = true;
        for (const tab of commandNavButtons) {
          tab.setAttribute("aria-selected", "false");
          tab.removeAttribute("aria-current");
          document.getElementById(tab.getAttribute("aria-controls")).hidden = true;
        }
        if (moveFocus) button.focus();
        return;
      }
      settingsPanel.hidden = false;
      for (const tab of commandNavButtons) {
        const selected = tab === button;
        tab.setAttribute("aria-selected", String(selected));
        if (selected) tab.setAttribute("aria-current", "page");
        else tab.removeAttribute("aria-current");
        document.getElementById(tab.getAttribute("aria-controls")).hidden = !selected;
      }
      positionSettingsPanel(button);
      if (moveFocus) button.focus();
    }
    commandNavButtons.forEach((button, index) => {
      button.addEventListener("click", () => activateSettingsTab(button));
      button.addEventListener("keydown", (event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        const direction = event.key === "ArrowRight" ? 1 : -1;
        const nextIndex = (index + direction + commandNavButtons.length) % commandNavButtons.length;
        activateSettingsTab(commandNavButtons[nextIndex], true);
      });
    });
    addEventListener("resize", () => {
      const activeTab = commandNavButtons.find((button) =>
        button.getAttribute("aria-selected") === "true");
      if (activeTab) positionSettingsPanel(activeTab);
    });
    // ==================================================
    // Three.js
    // ==================================================
    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: false,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(innerWidth, innerHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    let activeTerrainStyle = MAP_PRESETS[mapStyleSelect.value];
    colorbarGradient.style.background = getElevationGradient(activeTerrainStyle.stops);
    renderer.toneMappingExposure = activeTerrainStyle.exposure;
    const scene = new THREE.Scene();
    scene.background = null;
    mapGrid.style.backgroundColor =
      `#${activeTerrainStyle.background.toString(16).padStart(6, "0")}`;
    const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 10000000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    // 過度な接近でズーム量や平行移動が極端に小さくなるのを防ぐ。
    controls.minDistance = 400;
    controls.maxDistance = 8000000;
    // 画面上のドラッグを地面に沿った移動にし、傾斜時の上下ずれを防ぐ。
    controls.screenSpacePanning = false;
    controls.panSpeed = 2.5;
    // 左ドラッグは平行移動、Ctrl+左ドラッグと右ドラッグは傾き・回転。
    controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
    controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
    controls.zoomSpeed = 3;
    controls.zoomToCursor = true;
    controls.minPolarAngle = 0.02;
    controls.maxPolarAngle = THREE.MathUtils.degToRad(75);
    const cameraControls = createCameraControls({
      THREE,
      camera,
      controls,
      canvas: renderer.domElement,
      viewModeToggle,
    });
    debugToggle.addEventListener("click", () => {
      const enabled = debugToggle.getAttribute("aria-pressed") !== "true";
      debugToggle.setAttribute("aria-pressed", String(enabled));
      debugInfo.hidden = !enabled;
      if (enabled) updateDebugInfo();
    });
    const hemisphereLight = new THREE.HemisphereLight(
      activeTerrainStyle.hemisphere.sky,
      activeTerrainStyle.hemisphere.ground,
      activeTerrainStyle.hemisphere.intensity,
    );
    scene.add(hemisphereLight);
    const light = new THREE.DirectionalLight(
      activeTerrainStyle.key.color,
      activeTerrainStyle.key.intensity,
    );
    light.position.set(...activeTerrainStyle.key.direction).normalize();
    scene.add(light);
    const fillLight = new THREE.DirectionalLight(
      activeTerrainStyle.fill.color,
      activeTerrainStyle.fill.intensity,
    );
    fillLight.position.set(...activeTerrainStyle.fill.direction).normalize();
    scene.add(fillLight);
    // ==================================================
    // Web Mercator座標変換
    // ==================================================
    // 表示座標系の原点。移動しても変更しない
    const originX = lonToX(CFG.initialLon);
    const originY = latToY(CFG.initialLat);
    // カメラの注視点を現在の中心座標として取得
    function getViewCenter() {
      return { lon: xToLon(controls.target.x + originX), lat: yToLat(-controls.target.z + originY) };
    }
    // ==================================================
    // LOD
    // ==================================================
    function getViewElevationDegrees() {
      const offsetY = camera.position.y - controls.target.y;
      const distance = camera.position.distanceTo(controls.target);
      return THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(offsetY / distance, -1, 1)));
    }
    function getTiltLodReduction() {
      const pitch = getViewElevationDegrees();
      return [...CFG.tiltLodThresholds]
        .sort((a, b) => b - a)
        .filter((threshold) => pitch <= threshold)
        .length;
    }
    function getLOD() {
      if (forceLodToggle.checked) return Number(lodSlider.value);
      const d = camera.position.distanceTo(controls.target);
      const t = THREE.MathUtils.clamp(Math.log(CFG.farDistance / d) / Math.log(CFG.farDistance / CFG.nearDistance), 0, 1);
      const distanceLod = Math.round(CFG.minZ + t * (CFG.maxZ - CFG.minZ));
      return THREE.MathUtils.clamp(
        distanceLod - getTiltLodReduction() + CFG.lodBias,
        CFG.minZ,
        CFG.maxZ,
      );
    }
    let visibleRayHits = 0;
    function getDesiredTiles(z, preserveFullRange = false) {
      const n = 2 ** z;
      const tileSize = WORLD / n;
      const northWest = tileFromLonLat(CFG.japanBounds.west, CFG.japanBounds.north, z);
      const southEast = tileFromLonLat(CFG.japanBounds.east, CFG.japanBounds.south, z);
      const raycaster = new THREE.Raycaster();
      camera.updateMatrixWorld();
      const visiblePoints = [];
      const raySteps = CFG.groundRaySamples;
      visibleRayHits = 0;

      for (let row = 0; row <= raySteps; row++) {
        const y = 1 - row / raySteps * 2;
        for (let column = 0; column <= raySteps; column++) {
          const x = column / raySteps * 2 - 1;
          raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
          if (raycaster.ray.direction.y >= 0) continue;
          const distance = -raycaster.ray.origin.y / raycaster.ray.direction.y;
          if (distance < 0) continue;
          visiblePoints.push(raycaster.ray.at(distance, new THREE.Vector3()));
          visibleRayHits++;
        }
      }

      if (visiblePoints.length === 0) {
        visiblePoints.push(controls.target);
      }
      const tileX = visiblePoints.map((point) => Math.floor((point.x + originX + HALF) / tileSize));
      const tileY = visiblePoints.map((point) => Math.floor((HALF - (-point.z + originY)) / tileSize));
      const minX = Math.max(northWest.x, Math.min(...tileX) - 1);
      const maxX = Math.min(southEast.x, Math.max(...tileX) + 1);
      const minY = Math.max(northWest.y, Math.min(...tileY) - 1);
      const maxY = Math.min(southEast.y, Math.max(...tileY) + 1, n - 1);
      if (maxX < minX || maxY < minY) return [];
      const centerX = Math.floor((controls.target.x + originX + HALF) / tileSize);
      const centerY = Math.floor((HALF - (-controls.target.z + originY)) / tileSize);
      const width = maxX - minX + 1;
      const height = maxY - minY + 1;
      let rangeWidth = width;
      let rangeHeight = height;

      if (width * height > CFG.maxVisibleTiles) {
        if (preserveFullRange) return null;
        const scale = Math.sqrt(CFG.maxVisibleTiles / (width * height));
        rangeWidth = Math.max(1, Math.floor(width * scale));
        rangeHeight = Math.max(1, Math.floor(height * scale));
        while (rangeWidth * rangeHeight > CFG.maxVisibleTiles) {
          if (rangeWidth >= rangeHeight) rangeWidth--;
          else rangeHeight--;
        }
      }

      const rangeMinX = THREE.MathUtils.clamp(
        centerX - Math.floor(rangeWidth / 2),
        minX,
        maxX - rangeWidth + 1,
      );
      const rangeMinY = THREE.MathUtils.clamp(
        centerY - Math.floor(rangeHeight / 2),
        minY,
        maxY - rangeHeight + 1,
      );
      const result = [];
      for (let y = rangeMinY; y < rangeMinY + rangeHeight; y++) {
        for (let x = rangeMinX; x < rangeMinX + rangeWidth; x++) {
          result.push({ z, x, y });
        }
      }
      return result;
    }
    // ==================================================
    // タイル読み込みとキャッシュ
    // ==================================================
    const cache = new LodTileCache(CFG);
    const queue = [];
    const queued = new Set();
    const activeJobs = new Map();
    const tileIndexes = new Map();
    let active = 0;
    function tileKey(z, x, y) {
      return `${z}/${x}/${y}`;
    }
    function tileKeyContains(parentKey, childKey) {
      const [parentZ, parentX, parentY] = parentKey.split("/").map(Number);
      const [childZ, childX, childY] = childKey.split("/").map(Number);
      if (parentZ > childZ) return false;
      const factor = 2 ** (childZ - parentZ);
      return Math.floor(childX / factor) === parentX &&
        Math.floor(childY / factor) === parentY;
    }
    function tileKeysOverlap(firstKey, secondKey) {
      return tileKeyContains(firstKey, secondKey) || tileKeyContains(secondKey, firstKey);
    }
    function disposeTile(tile) {
      if (!tile?.objects) return;
      const geometries = new Set();
      const materials = new Set();
      for (const object of Object.values(tile.objects)) {
        scene.remove(object);
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          if (!materials.has(material)) {
            material.dispose();
            materials.add(material);
          }
        }
        geometries.add(object.geometry);
      }
      for (const geometry of geometries) geometry.dispose();
      tile.objects = null;
      tile.sourceData = null;
      tile.contourData = null;
      tile.edges = null;
      tile.memoryBytes = 0;
    }
    function estimateTileMemory(tile) {
      const arrays = new Set();
      let bytes = 0;
      const countArray = (array) => {
        if (!array || arrays.has(array)) return;
        arrays.add(array);
        bytes += array.byteLength ?? array.length * 8;
      };
      for (const object of Object.values(tile.objects || {})) {
        const geometry = object.geometry;
        for (const attribute of Object.values(geometry.attributes)) countArray(attribute.array);
        countArray(geometry.index?.array);
      }
      countArray(tile.sourceData?.data);
      countArray(tile.contourData?.heights);
      for (const edge of Object.values(tile.edges || {})) bytes += edge.length * 4;
      return Math.ceil(bytes * 1.5);
    }
    function storeTile(key, tile) {
      tile.memoryBytes = estimateTileMemory(tile);
      const previous = cache.get(key);
      cache.set(key, tile);
      if (previous && previous !== tile) disposeTile(previous);
    }
    function hasAncestorSourceData(z, x, y) {
      for (let ancestorZ = z - 1; ancestorZ >= CFG.minZ; ancestorZ--) {
        const factor = 2 ** (z - ancestorZ);
        const ancestor = cache.get(tileKey(
          ancestorZ,
          Math.floor(x / factor),
          Math.floor(y / factor),
        ));
        if (ancestor?.sourceData?.data) return true;
      }
      return false;
    }
    function requestTile(z, x, y) {
      const n = 2 ** z;
      if (z < CFG.minZ || z > CFG.maxZ || y < 0 || y >= n) return;
      x = ((x % n) + n) % n;
      const k = tileKey(z, x, y);
      if (cache.has(k) || queued.has(k) || activeJobs.has(k)) return;
      queued.add(k);
      queue.push({ z, x, y, k });
    }
    function sortTilesByViewCenter(tiles) {
      const centerX = controls.target.x + originX + HALF;
      const centerY = HALF - (-controls.target.z + originY);
      const tileSize = WORLD / (2 ** (tiles[0]?.z ?? CFG.minZ));
      return [...tiles].sort((a, b) => {
        const ax = (a.x + 0.5) * tileSize - centerX;
        const ay = (a.y + 0.5) * tileSize - centerY;
        const bx = (b.x + 0.5) * tileSize - centerX;
        const by = (b.y + 0.5) * tileSize - centerY;
        return ax * ax + ay * ay - (bx * bx + by * by);
      });
    }
    function tileDistanceFromViewCenterSquared(tile) {
      const size = WORLD / (2 ** tile.z);
      const dx = (tile.x + 0.5) * size - (controls.target.x + originX + HALF);
      const dy = (tile.y + 0.5) * size - (HALF - (-controls.target.z + originY));
      return dx * dx + dy * dy;
    }
    function getTileIndex(z) {
      if (tileIndexes.has(z)) {
        const cachedIndex = tileIndexes.get(z);
        tileIndexes.delete(z);
        tileIndexes.set(z, cachedIndex);
        return cachedIndex;
      }
      const rootUrl = new URL(`${CFG.root}/${z}/`, location.href);
      const index = new Map();
      const visited = new Set();
      const indexPromise = (async function visitDirectory(directoryUrl) {
        if (visited.has(directoryUrl)) return;
        visited.add(directoryUrl);
        const response = await fetch(directoryUrl);
        if (!response.ok) return;
        const listing = new DOMParser().parseFromString(await response.text(), "text/html");
        const subdirectories = [];
        for (const link of listing.querySelectorAll("a[href]")) {
          const href = link.getAttribute("href");
          if (!href) continue;
          const entryUrl = new URL(href, directoryUrl);
          if (entryUrl.origin !== rootUrl.origin || !entryUrl.pathname.startsWith(rootUrl.pathname)) continue;
          if (entryUrl.pathname.endsWith("/")) {
            if (entryUrl.href !== directoryUrl) subdirectories.push(entryUrl.href);
            continue;
          }
          const filename = decodeURIComponent(entryUrl.pathname.split("/").pop());
          if (/^\d+_\d+\.png$/i.test(filename)) index.set(filename, entryUrl.href);
        }
        await Promise.all(subdirectories.map(visitDirectory));
      })(rootUrl.href).then(() => index).catch((error) => {
        tileIndexes.delete(z);
        throw error;
      });
      tileIndexes.set(z, indexPromise);
      while (tileIndexes.size > 2) tileIndexes.delete(tileIndexes.keys().next().value);
      return indexPromise;
    }
    const contourRenderer = createContourRenderer({
      THREE,
      LineSegments2,
      LineSegmentsGeometry,
      LineMaterial,
      CFG,
      SIZE,
      tileBounds,
      getOrigin: () => ({ originX, originY }),
      getVisibleTiles: () => visibleTiles,
      scene,
      contourSettings,
      isEnabled: () => contoursEnabled,
    });
    const { createContourData, rebuildVisibleContours, getVisibleContourTiles } = contourRenderer;
    const { createPointCloud, createMissingTile, recolorTile } = createTerrainGeometry({
      THREE,
      CFG,
      SIZE,
      ELEVATION_MIN,
      ELEVATION_MAX,
      tileBounds,
      getOrigin: () => ({ originX, originY }),
      getCachedTile: (key) => cache.get(key),
      tileKey,
      createContourData,
      getDisplayMode: () => displayMode,
      getTerrainStyle: () => activeTerrainStyle,
    });
    function createSeam(tileA, edgeA, tileB, edgeB, reverseWinding = false) {
      const positions = [];
      const colors = [];
      const indices = [];
      const rowIndices = new Int32Array(edgeA.length).fill(-1);
      const positionA = tileA.objects.mesh.geometry.getAttribute("position");
      const colorA = tileA.objects.mesh.geometry.getAttribute("color");
      const positionB = tileB.objects.mesh.geometry.getAttribute("position");
      const colorB = tileB.objects.mesh.geometry.getAttribute("color");

      for (let i = 0; i < edgeA.length; i++) {
        const indexA = edgeA[i];
        const indexB = edgeB[i];
        if (indexA < 0 || indexB < 0) continue;
        rowIndices[i] = positions.length / 3;
        for (const [position, color, index] of [[positionA, colorA, indexA], [positionB, colorB, indexB]]) {
          positions.push(position.getX(index), position.getY(index), position.getZ(index));
          colors.push(color.getX(index), color.getY(index), color.getZ(index));
        }
      }

      for (let i = 0; i < rowIndices.length - 1; i++) {
        const a = rowIndices[i];
        const c = rowIndices[i + 1];
        if (a < 0 || c < 0) continue;
        const b = a + 1;
        const d = c + 1;
        if (reverseWinding) {
          indices.push(a, b, c, b, d, c);
        } else {
          indices.push(a, c, b, b, c, d);
        }
      }
      if (indices.length === 0) return null;

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      return {
        geometry,
        objects: {
          wireframe: new THREE.Mesh(
            geometry,
            new THREE.MeshStandardMaterial({ vertexColors: true, wireframe: true, roughness: 0.95 }),
          ),
          mesh: new THREE.Mesh(
            geometry,
            new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.95 }),
          ),
        },
      };
    }
    function createSeams(tiles) {
      const seams = [];
      const tilesByZoom = new Map();
      for (const entry of tiles) {
        if (!tilesByZoom.has(entry.z)) tilesByZoom.set(entry.z, []);
        tilesByZoom.get(entry.z).push(entry);
      }
      for (const levelTiles of tilesByZoom.values()) {
        const byPosition = new Map(levelTiles.map((entry) => [`${entry.x},${entry.y}`, entry.tile]));
        for (const entry of levelTiles) {
          const east = byPosition.get(`${entry.x + 1},${entry.y}`);
          if (east && entry.tile.edges.right.length === east.edges.left.length) {
            const seam = createSeam(entry.tile, entry.tile.edges.right, east, east.edges.left);
            if (seam) seams.push(seam);
          }
          const south = byPosition.get(`${entry.x},${entry.y + 1}`);
          if (south && entry.tile.edges.bottom.length === south.edges.top.length) {
            const seam = createSeam(entry.tile, entry.tile.edges.bottom, south, south.edges.top, true);
            if (seam) seams.push(seam);
          }
        }
      }
      return seams;
    }
    function setSeamsVisible(seams, visible) {
      for (const seam of seams) {
        for (const [mode, object] of Object.entries(seam.objects)) {
          const shouldShow = visible && mode === displayMode;
          object.visible = shouldShow;
          if (shouldShow) scene.add(object);
          else scene.remove(object);
        }
      }
    }
    function disposeSeams(seams) {
      for (const seam of seams) {
        for (const object of Object.values(seam.objects)) {
          scene.remove(object);
          object.material.dispose();
        }
        seam.geometry.dispose();
      }
    }
    function setTileVisible(tile, visible) {
      for (const [mode, object] of Object.entries(tile.objects)) {
        const shouldShow = visible && mode === displayMode;
        object.visible = shouldShow;
        if (shouldShow) scene.add(object);
        else scene.remove(object);
      }
    }
    async function fetchTileImageData(z, x, y, signal) {
      let url = `${CFG.root}/${z}/${x}_${y}.png`;
      let response = await fetch(url, { signal });
      if (signal.aborted) return null;
      if (response.status === 404) {
        const tileIndex = await getTileIndex(z);
        if (signal.aborted) return null;
        const nestedUrl = tileIndex.get(`${x}_${y}.png`);
        if (nestedUrl) {
          url = nestedUrl;
          response = await fetch(url, { signal });
        }
      }
      if (signal.aborted || !response.ok) return null;
      const bitmap = await createImageBitmap(await response.blob());
      if (signal.aborted || bitmap.width !== SIZE || bitmap.height !== SIZE) {
        bitmap.close();
        return null;
      }
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = SIZE;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.drawImage(bitmap, 0, 0);
      bitmap.close();
      return context.getImageData(0, 0, SIZE, SIZE);
    }
    async function loadAncestorSourceData(z, x, y, signal) {
      for (let ancestorZ = z - 1; ancestorZ >= CFG.minZ; ancestorZ--) {
        const factor = 2 ** (z - ancestorZ);
        const ancestorX = Math.floor(x / factor);
        const ancestorY = Math.floor(y / factor);
        const ancestorKey = tileKey(ancestorZ, ancestorX, ancestorY);
        const cachedAncestor = cache.get(ancestorKey);
        if (cachedAncestor?.sourceData?.data) return true;
        if (cachedAncestor?.state === "loaded") continue;
        let imageData;
        try {
          imageData = await fetchTileImageData(ancestorZ, ancestorX, ancestorY, signal);
        } catch (error) {
          if (signal.aborted) return false;
          console.warn(`親タイル ${ancestorKey} の読み込みに失敗しました`, error);
          continue;
        }
        if (signal.aborted) return false;
        if (!imageData) continue;
        const ancestorTile = createPointCloud(ancestorZ, ancestorX, ancestorY, imageData);
        if (ancestorTile.count === 0) {
          disposeTile(ancestorTile);
          continue;
        }
        storeTile(ancestorKey, {
          state: "loaded",
          ...ancestorTile,
          lastUsed: performance.now(),
        });
        return true;
      }
      return false;
    }
    async function createMissingTileWithAncestors(z, x, y, signal) {
      await loadAncestorSourceData(z, x, y, signal);
      if (signal.aborted) return null;
      return createMissingTile(z, x, y);
    }
    async function loadTile(job, signal) {
      const { z, x, y, k } = job;
      try {
        const imageData = await fetchTileImageData(z, x, y, signal);
        if (signal.aborted) return;
        if (!imageData) {
          const missingTile = await createMissingTileWithAncestors(z, x, y, signal);
          if (!missingTile) return;
          storeTile(k, {
            state: "loaded",
            ...missingTile,
            lastUsed: performance.now(),
          });
          return;
        }
        const result = createPointCloud(z, x, y, imageData);
        if (signal.aborted) {
          disposeTile(result);
          return;
        }
        if (result.count === 0) {
          disposeTile(result);
          const missingTile = await createMissingTileWithAncestors(z, x, y, signal);
          if (!missingTile) return;
          storeTile(k, {
            state: "loaded",
            ...missingTile,
            lastUsed: performance.now(),
          });
          return;
        }
        if (z === CFG.maxZ) result.sourceData = null;
        storeTile(k, { state: "loaded", ...result, lastUsed: performance.now() });
      } catch (e) {
        if (signal.aborted) return;
        console.warn(`タイル ${k} を欠損値 (NaN) として扱います`, e);
        const missingTile = await createMissingTileWithAncestors(z, x, y, signal);
        if (!missingTile) return;
        storeTile(k, {
          state: "loaded",
          ...missingTile,
          lastUsed: performance.now(),
        });
      }
    }
    function pumpQueue() {
      while (active < CFG.maxConcurrent && queue.length) {
        const job = queue.shift();
        queued.delete(job.k);
        active++;
        const controller = new AbortController();
        activeJobs.set(job.k, controller);
        loadTile(job, controller.signal).finally(() => {
          activeJobs.delete(job.k);
          active--;
        });
      }
    }
    // ==================================================
    // LOD表示管理
    // ==================================================
    let visible = new Set();
    let visibleTiles = new Map();
    let visibleSeams = [];
    const progressiveFallbacks = new Map();
    const mapAnnotations = createMapAnnotations({
      THREE,
      scene,
      canvas: renderer.domElement,
      camera,
      getVisibleMeshes: () => [...visibleTiles.values()]
        .map((tile) => tile.objects?.mesh)
        .filter(Boolean),
      toolButtons: mapToolButtons,
      glyphSelect: mapGlyphSelect,
    });
    function chooseLOD() {
      const z = getLOD();
      let desired = getDesiredTiles(z, !forceLodToggle.checked);
      let requestedZ = z;
      while (!desired && requestedZ > CFG.minZ) {
        requestedZ--;
        desired = getDesiredTiles(requestedZ, true);
      }
      if (!desired) {
        requestedZ = z;
        desired = getDesiredTiles(z);
      }
      const desiredTiles = desired.map((tile) => ({
        ...tile,
        k: tileKey(tile.z, tile.x, tile.y),
        tile: cache.get(tileKey(tile.z, tile.x, tile.y)),
      }));
      const targetReady = desiredTiles.every((entry) => entry.tile?.state === "loaded");
      let fallbackTiles = [];
      let fallbackZ = requestedZ;

      if (!targetReady && !forceLodToggle.checked) {
        fallbackZ = requestedZ - 1;
        while (fallbackZ >= CFG.minZ) {
          let fallback = getDesiredTiles(fallbackZ, true);
          if (!fallback && fallbackZ === CFG.minZ) fallback = getDesiredTiles(fallbackZ);
          if (fallback) {
            fallbackTiles = fallback.map((tile) => ({
              ...tile,
              k: tileKey(tile.z, tile.x, tile.y),
              tile: cache.get(tileKey(tile.z, tile.x, tile.y)),
            }));
            break;
          }
          fallbackZ--;
        }
      }

      const desiredKeys = new Set([
        ...desiredTiles.map((tile) => tile.k),
        ...fallbackTiles.map((tile) => tile.k),
      ]);

      for (const [key, controller] of activeJobs) {
        if (!desiredKeys.has(key)) controller.abort();
      }
      for (let i = queue.length - 1; i >= 0; i--) {
        if (!desiredKeys.has(queue[i].k)) {
          queued.delete(queue[i].k);
          queue.splice(i, 1);
        }
      }

      for (const tile of sortTilesByViewCenter(fallbackTiles)) requestTile(tile.z, tile.x, tile.y);
      for (const tile of sortTilesByViewCenter(desiredTiles)) requestTile(tile.z, tile.x, tile.y);
      queue.sort((a, b) =>
        tileDistanceFromViewCenterSquared(a) - tileDistanceFromViewCenterSquared(b));
      return {
        z,
        requestedZ,
        targetReady,
        desiredTiles,
        fallbackTiles,
      };
    }
    function updateDisplay() {
      const choice = chooseLOD();
      const requestedAt = performance.now();
      for (const entry of [...choice.desiredTiles, ...choice.fallbackTiles]) {
        if (entry.tile?.state === "loaded") entry.tile.lastUsed = requestedAt;
      }
      const center = getViewCenter();
      infoCoordinates.textContent = `中心緯度: ${center.lat.toFixed(5)}\n中心経度: ${center.lon.toFixed(5)}`;
      loadingIndicator.hidden = choice.targetReady;
      let remainingFallbackBudget = CFG.maxProgressiveFallbacksPerUpdate;
      const childGroups = new Map();
      const neededProgressiveFallbackKeys = new Set();
      const childFactor = 2 ** (choice.requestedZ - (choice.requestedZ - 1));
      const sortedDesiredTiles = sortTilesByViewCenter(choice.desiredTiles);
      const desiredByKey = new Map(sortedDesiredTiles.map((entry) => [entry.k, entry]));
      for (const entry of sortedDesiredTiles) {
        const parentX = Math.floor(entry.x / childFactor);
        const parentY = Math.floor(entry.y / childFactor);
        const parentKey = tileKey(choice.requestedZ - 1, parentX, parentY);
        let group = childGroups.get(parentKey);
        if (!group) {
          group = { parentKey, children: new Map() };
          childGroups.set(parentKey, group);
        }
        let tile = entry.tile?.state === "loaded" ? entry.tile : null;
        if (!tile && !choice.targetReady) {
          tile = progressiveFallbacks.get(entry.k);
          if (!tile && remainingFallbackBudget > 0 &&
              hasAncestorSourceData(entry.z, entry.x, entry.y)) {
            const fallback = createMissingTile(
              entry.z,
              entry.x,
              entry.y,
              CFG.progressiveFallbackPixelStep,
            );
            remainingFallbackBudget--;
            if (fallback.fallback) {
              fallback.sourceData = null;
              tile = fallback;
              progressiveFallbacks.set(entry.k, fallback);
            } else {
              disposeTile(fallback);
            }
          }
        }
        if (tile) group.children.set(entry.k, { ...entry, tile });
      }

      let nextVisibleTiles;
      if (choice.targetReady) {
        nextVisibleTiles = new Map(choice.desiredTiles.map((entry) => [entry.k, entry.tile]));
      } else {
        const fallbackCoverageKeys = new Set(choice.fallbackTiles.map((entry) => entry.k));
        if (fallbackCoverageKeys.size === 0) return;
        const fallbackCoverage = [...fallbackCoverageKeys];
        nextVisibleTiles = new Map(
          [...visibleTiles].filter(([visibleKey]) =>
            fallbackCoverage.some((coverageKey) =>
              tileKeysOverlap(coverageKey, visibleKey))),
        );
        const fallbackByKey = new Map(choice.fallbackTiles.map((entry) => [entry.k, entry]));
        for (const [parentKey, fallbackEntry] of fallbackByKey) {
          if (fallbackEntry.tile?.state !== "loaded") continue;
          const group = childGroups.get(parentKey);
          let replacements = [fallbackEntry];
          if (group) {
            const [, parentX, parentY] = group.parentKey.split("/").map(Number);
            const firstChildX = parentX * childFactor;
            const firstChildY = parentY * childFactor;
            const northWest = tileFromLonLat(CFG.japanBounds.west, CFG.japanBounds.north, choice.requestedZ);
            const southEast = tileFromLonLat(CFG.japanBounds.east, CFG.japanBounds.south, choice.requestedZ);
            let childrenComplete = true;
            for (let dy = 0; dy < childFactor; dy++) {
              for (let dx = 0; dx < childFactor; dx++) {
                let x = firstChildX + dx;
                const y = firstChildY + dy;
                const tileCount = 2 ** choice.requestedZ;
                x = ((x % tileCount) + tileCount) % tileCount;
                if (x < northWest.x || x > southEast.x || y < northWest.y || y > southEast.y || y >= tileCount) continue;
                const key = tileKey(choice.requestedZ, x, y);
                neededProgressiveFallbackKeys.add(key);
                if (group.children.has(key)) continue;
                const cachedTile = cache.get(key);
                let tile = cachedTile?.state === "loaded" ? cachedTile : progressiveFallbacks.get(key);
                if (!tile && remainingFallbackBudget > 0 &&
                    hasAncestorSourceData(choice.requestedZ, x, y)) {
                  tile = createMissingTile(
                    choice.requestedZ,
                    x,
                    y,
                    CFG.progressiveFallbackPixelStep,
                  );
                  remainingFallbackBudget--;
                  if (tile.fallback) {
                    tile.sourceData = null;
                    progressiveFallbacks.set(key, tile);
                  } else {
                    disposeTile(tile);
                    tile = null;
                  }
                }
                if (!tile) {
                  childrenComplete = false;
                  continue;
                }
                const entry = desiredByKey.get(key) || { z: choice.requestedZ, x, y, k: key };
                group.children.set(key, { ...entry, tile });
              }
            }
            if (childrenComplete) {
              replacements = [...group.children.values()];
            }
          }
          for (const [key] of nextVisibleTiles) {
            if (tileKeysOverlap(parentKey, key)) nextVisibleTiles.delete(key);
          }
          for (const entry of replacements) nextVisibleTiles.set(entry.k, entry.tile);
        }
      }

      const nextTiles = [...nextVisibleTiles].map(([key, tile]) => {
        if (tile.terrainStyleId !== activeTerrainStyle.id) recolorTile(tile);
        const [z, x, y] = key.split("/").map(Number);
        return { z, x, y, k: key, tile };
      });
      const next = new Set(nextVisibleTiles.keys());
      const mappingChanged = nextVisibleTiles.size !== visibleTiles.size ||
        [...nextVisibleTiles].some(([key, tile]) => visibleTiles.get(key) !== tile);
      if (mappingChanged) {
        const nextSeams = createSeams(nextTiles);
        for (const [key, tile] of visibleTiles) {
          if (nextVisibleTiles.get(key) !== tile) setTileVisible(tile, false);
        }
        setSeamsVisible(visibleSeams, false);
        disposeSeams(visibleSeams);
        for (const [key, tile] of nextVisibleTiles) {
          if (visibleTiles.get(key) !== tile) setTileVisible(tile, true);
          const cachedTile = cache.get(key);
          if (cachedTile === tile) cachedTile.lastUsed = performance.now();
        }
        setSeamsVisible(nextSeams, true);
        visibleSeams = nextSeams;
        visible = next;
        visibleTiles = nextVisibleTiles;
        rebuildVisibleContours(nextTiles);
      }

      for (const [key, fallback] of progressiveFallbacks) {
        const exactTile = cache.get(key);
        if (exactTile?.state === "loaded" && visibleTiles.get(key) !== fallback) {
          disposeTile(fallback);
          progressiveFallbacks.delete(key);
        } else if (!choice.desiredTiles.some((entry) => entry.k === key) &&
            !neededProgressiveFallbackKeys.has(key) &&
            visibleTiles.get(key) !== fallback) {
          disposeTile(fallback);
          progressiveFallbacks.delete(key);
        }
      }
      evictCache();
    }
    function applyTerrainStyle(style) {
      activeTerrainStyle = style;
      renderer.toneMappingExposure = style.exposure;
      mapGrid.style.backgroundColor = `#${style.background.toString(16).padStart(6, "0")}`;
      hemisphereLight.color.setHex(style.hemisphere.sky);
      hemisphereLight.groundColor.setHex(style.hemisphere.ground);
      hemisphereLight.intensity = style.hemisphere.intensity;
      light.color.setHex(style.key.color);
      light.intensity = style.key.intensity;
      light.position.set(...style.key.direction).normalize();
      fillLight.color.setHex(style.fill.color);
      fillLight.intensity = style.fill.intensity;
      fillLight.position.set(...style.fill.direction).normalize();
      colorbarGradient.style.background = getElevationGradient(style.stops);
      for (const tile of visibleTiles.values()) recolorTile(tile, style);
      setSeamsVisible(visibleSeams, false);
      disposeSeams(visibleSeams);
      visibleSeams = createSeams([...visibleTiles].map(([key, tile]) => {
        const [z, x, y] = key.split("/").map(Number);
        return { z, x, y, k: key, tile };
      }));
      setSeamsVisible(visibleSeams, true);
      updateDisplay();
      updateDebugInfo();
    }
    mapStyleSelect.addEventListener("change", () => {
      const style = MAP_PRESETS[mapStyleSelect.value];
      if (!style) {
        throw new Error(`Unknown map style: ${mapStyleSelect.value}`);
      }
      applyTerrainStyle(style);
    });
    function updateDebugInfo() {
      if (debugInfo.hidden) return;
      const heading = THREE.MathUtils.radToDeg(controls.getAzimuthalAngle());
      const pitch = getViewElevationDegrees();
      const tiltLodReduction = getTiltLodReduction();
      let fallbackCount = 0;
      let progressiveFallbackCount = 0;
      let visiblePointCount = 0;
      let displayedLods = new Set();
      for (const tile of cache.values()) {
        if (tile.fallback) fallbackCount++;
      }
      for (const tile of progressiveFallbacks.values()) {
        if (tile.fallback) progressiveFallbackCount++;
      }
      for (const [key, tile] of visibleTiles) {
        visiblePointCount += tile.count || 0;
        displayedLods.add(Number(key.split("/")[0]));
      }
      debugInfo.textContent = [
        "操作・カメラ",
        `仰角: ${pitch.toFixed(1)}° / 方位角: ${heading.toFixed(1)}°`,
        `距離: ${camera.position.distanceTo(controls.target).toFixed(0)} m`,
        `地形スタイル: ${activeTerrainStyle.label}`,
        `カメラ: X ${camera.position.x.toFixed(0)}, Y ${camera.position.y.toFixed(0)}, Z ${camera.position.z.toFixed(0)}`,
        `注視点: X ${controls.target.x.toFixed(0)}, Y ${controls.target.y.toFixed(0)}, Z ${controls.target.z.toFixed(0)}`,
        "",
        "LOD・タイル",
        `地表レイ: ${visibleRayHits}/${(CFG.groundRaySamples + 1) ** 2} (地平線付近を含む)`,
        `仰角LOD補正: -${tiltLodReduction} (閾値 ${[...CFG.tiltLodThresholds].sort((a, b) => b - a).map((threshold) => `${threshold}°`).join(" / ")})`,
        `LODバイアス: ${CFG.lodBias > 0 ? "+" : ""}${CFG.lodBias}`,
        `要求LOD: ${getLOD()} / 表示LOD: ${displayedLods.size ? [...displayedLods].sort((a, b) => a - b).join(", ") : "--"}`,
        `表示タイル上限: ${CFG.maxVisibleTiles}`,
        `表示タイル: ${visible.size} / 点群数: ${visiblePointCount.toLocaleString()}`,
        `キャッシュ: ${cache.size.toLocaleString()} / ${CFG.maxCachedTiles.toLocaleString()} タイル・${(cache.byteSize / (1024 * 1024)).toFixed(0)} / ${(CFG.maxCachedBytes / (1024 * 1024)).toFixed(0)} MB (LOD別: ${cache.getLODCounts().map(([z, count]) => `${z}:${count}`).join(", ") || "--"})`,
        `代替: ${fallbackCount.toLocaleString()} / 逐次補完: ${progressiveFallbackCount.toLocaleString()}`,
        `読込中: ${active} / 待機中: ${queue.length} / 同時読込上限: ${CFG.maxConcurrent}`,
      ].join("\n");
    }
    for (const button of displayModeButtons) {
      button.addEventListener("click", () => {
        displayMode = button.dataset.mode;
        for (const modeButton of displayModeButtons) {
          modeButton.setAttribute("aria-pressed", String(modeButton === button));
        }
        for (const tile of visibleTiles.values()) {
          if (tile?.objects) setTileVisible(tile, true);
        }
        setSeamsVisible(visibleSeams, true);
      });
    }
    contourToggle.addEventListener("change", () => {
      contoursEnabled = contourToggle.checked;
      rebuildVisibleContours(getVisibleContourTiles());
    });
    for (const setting of Object.values(contourSettings)) {
      setting.addEventListener("change", () => {
        if (!contoursEnabled) return;
        rebuildVisibleContours(getVisibleContourTiles());
      });
    }
    tiltLodThresholdInputs.forEach((input, index) => {
      input.addEventListener("change", () => {
        if (input.value === "" || !input.checkValidity()) {
          input.reportValidity();
          input.value = CFG.tiltLodThresholds[index];
          return;
        }
        CFG.tiltLodThresholds[index] = Number(input.value);
        updateDisplay();
        updateDebugInfo();
      });
    });
    forceLodToggle.addEventListener("change", () => {
      lodSlider.disabled = !forceLodToggle.checked;
      updateDisplay();
    });
    lodSlider.addEventListener("input", () => {
      lodValue.value = lodSlider.value;
    });
    lodSlider.addEventListener("change", () => {
      updateDisplay();
    });
    lodBiasSlider.addEventListener("input", () => {
      CFG.lodBias = Number(lodBiasSlider.value);
      lodBiasValue.value = `${CFG.lodBias > 0 ? "+" : ""}${CFG.lodBias}`;
      updateDisplay();
      updateDebugInfo();
    });
    maxVisibleTilesSelect.addEventListener("change", () => {
      CFG.maxVisibleTiles = Number(maxVisibleTilesSelect.value);
      updateDisplay();
      updateDebugInfo();
    });
    cacheBudgetSelect.addEventListener("change", () => {
      CFG.maxCachedBytes = Number(cacheBudgetSelect.value) * 1024 * 1024;
      updateDisplay();
      updateDebugInfo();
    });
    function evictCache() {
      cache.evict(visible, disposeTile);
    }
    // ==================================================
    // 初期位置・アニメーション
    // ==================================================
    controls.target.set(0, 0, 0);
    camera.position.set(0, 4500000, 0);
    controls.update();
    cameraControls.updateViewModeToggle();
    let lastUpdate = 0;
    let disposed = false;
    function animate() {
      if (disposed) return;
      requestAnimationFrame(animate);
      if (!cameraControls.advanceTransition()) controls.update();
      pumpQueue();
      const now = performance.now();
      // 移動中も一定間隔で表示範囲を再評価し、読み込み完了も反映する。
      if (now - lastUpdate > 150) {
        updateDisplay();
        updateDebugInfo();
        lastUpdate = now;
      }
      renderer.render(scene, camera);
    }
    addEventListener("resize", () => {
      camera.aspect = innerWidth / innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(innerWidth, innerHeight);
      contourRenderer.resize(innerWidth, innerHeight);
    });
    addEventListener("pagehide", (event) => {
      if (event.persisted) return;
      disposed = true;
      for (const controller of activeJobs.values()) controller.abort();
      queue.length = 0;
      queued.clear();
      progressiveFallbacks.forEach(disposeTile);
      progressiveFallbacks.clear();
      disposeSeams(visibleSeams);
      visibleSeams = [];
      contourRenderer.rebuildVisibleContours([]);
      cache.clear(disposeTile);
      mapAnnotations.dispose();
      controls.dispose();
      renderer.dispose();
    }, { once: true });
    animate();
    