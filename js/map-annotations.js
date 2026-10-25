export function createMapAnnotations({
  THREE,
  scene,
  canvas,
  camera,
  getVisibleMeshes,
  toolButtons,
  glyphSelect,
  maxAnnotations = 300,
}) {
  const raycaster = new THREE.Raycaster();
  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const annotations = [];
  let activeTool = null;
  let lineStart = null;

  function disposeAnnotation(object) {
    scene.remove(object);
    object.traverse((child) => {
      child.geometry?.dispose();
      if (!child.material) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) {
        material.map?.dispose();
        material.dispose();
      }
    });
  }

  function addAnnotation(object) {
    scene.add(object);
    annotations.push(object);
    while (annotations.length > maxAnnotations) {
      disposeAnnotation(annotations.shift());
    }
  }

  function getMapPoint(event) {
    const bounds = canvas.getBoundingClientRect();
    const pointer = new THREE.Vector2(
      (event.clientX - bounds.left) / bounds.width * 2 - 1,
      -(event.clientY - bounds.top) / bounds.height * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    const terrainHits = raycaster.intersectObjects(getVisibleMeshes(), false);
    if (terrainHits.length) return terrainHits[0].point.clone().add(new THREE.Vector3(0, 8, 0));
    const point = new THREE.Vector3();
    return raycaster.ray.intersectPlane(ground, point) ? point : null;
  }

  function createMarker(point) {
    const marker = new THREE.Group();
    const pin = new THREE.Mesh(
      new THREE.ConeGeometry(6, 24, 8),
      new THREE.MeshBasicMaterial({ color: 0xe1c96d }),
    );
    pin.position.y = 12;
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(7, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xf2e6a6 }),
    );
    head.position.y = 27;
    marker.add(pin, head);
    marker.position.copy(point);
    return marker;
  }

  function createGlyph(point, glyph) {
    const canvasTexture = document.createElement("canvas");
    canvasTexture.width = canvasTexture.height = 128;
    const context = canvasTexture.getContext("2d");
    if (!context) throw new Error("グリフ描画用のCanvas 2Dコンテキストを作成できません");
    context.font = "bold 96px sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.lineWidth = 10;
    context.strokeStyle = "#17201d";
    context.fillStyle = "#f1dfa0";
    context.strokeText(glyph, 64, 66);
    context.fillText(glyph, 64, 66);
    const texture = new THREE.CanvasTexture(canvasTexture);
    texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
    }));
    sprite.position.copy(point);
    sprite.scale.set(72, 72, 1);
    return sprite;
  }

  function createLine(from, to) {
    const geometry = new THREE.BufferGeometry().setFromPoints([from, to]);
    const material = new THREE.LineBasicMaterial({ color: 0xe1c96d });
    return new THREE.Line(geometry, material);
  }

  function onCanvasClick(event) {
    if (!activeTool || event.button !== 0) return;
    const point = getMapPoint(event);
    if (!point) return;
    event.preventDefault();
    if (activeTool === "marker") {
      addAnnotation(createMarker(point));
      setTool(null);
    } else if (activeTool === "glyph") {
      addAnnotation(createGlyph(point, glyphSelect.value));
      setTool(null);
    } else if (!lineStart) {
      lineStart = point;
      for (const button of toolButtons) {
        if (button.dataset.mapTool === "line") {
          button.title = "終点を選択";
          button.textContent = "線・終点";
        }
      }
    } else {
      addAnnotation(createLine(lineStart, point));
      lineStart = null;
      setTool(null);
    }
  }

  function setTool(tool) {
    activeTool = tool;
    lineStart = null;
    for (const button of toolButtons) {
      const selected = button.dataset.mapTool === tool;
      button.setAttribute("aria-pressed", String(selected));
      if (button.dataset.mapTool === "line") {
        button.removeAttribute("title");
        button.textContent = "線";
      }
    }
  }

  for (const button of toolButtons) {
    button.addEventListener("click", () => {
      const tool = button.dataset.mapTool;
      setTool(activeTool === tool ? null : tool);
    });
  }
  canvas.addEventListener("click", onCanvasClick);

  return {
    dispose() {
      canvas.removeEventListener("click", onCanvasClick);
      setTool(null);
      for (const annotation of annotations) disposeAnnotation(annotation);
      annotations.length = 0;
    },
  };
}
