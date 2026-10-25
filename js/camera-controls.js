export function createCameraControls({ THREE, camera, controls, canvas, viewModeToggle }) {
  let transition = null;
  let previousDamping = controls.enableDamping;

  function isTopDownView() {
    return controls.getPolarAngle() <= controls.minPolarAngle + THREE.MathUtils.degToRad(1);
  }

  function updateViewModeToggle() {
    const isTopDown = isTopDownView();
    viewModeToggle.textContent = isTopDown ? "3D" : "2D";
    viewModeToggle.setAttribute("aria-label", isTopDown ? "3D表示に切り替え" : "2D表示に切り替え");
    viewModeToggle.setAttribute("aria-pressed", String(!isTopDown));
  }

  controls.addEventListener("change", updateViewModeToggle);
  viewModeToggle.addEventListener("click", () => {
    if (transition) return;
    controls.update();
    const isTopDown = isTopDownView();
    const distance = camera.position.distanceTo(controls.target);
    const azimuth = controls.getAzimuthalAngle();
    const destination = isTopDown
      ? new THREE.Vector3().setFromSpherical(
        new THREE.Spherical(distance, THREE.MathUtils.degToRad(25), azimuth),
      )
      : new THREE.Vector3(0, distance, 0);

    if (!isTopDown) camera.up.set(0, 1, 0);
    previousDamping = controls.enableDamping;
    controls.enabled = false;
    controls.enableDamping = false;
    transition = {
      start: camera.position.clone(),
      end: controls.target.clone().add(destination),
      startedAt: performance.now(),
      duration: 450,
    };
  });

  canvas.addEventListener("pointerdown", (event) => {
    if (event.button === 0) {
      controls.mouseButtons.LEFT = event.ctrlKey ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN;
    }
  }, true);
  addEventListener("keydown", (event) => {
    if (event.key === "Control") controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
  });
  addEventListener("keyup", (event) => {
    if (event.key === "Control") controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
  });
  addEventListener("blur", () => {
    controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
  });
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());

  function advanceTransition() {
    if (!transition) return false;
    const progress = THREE.MathUtils.clamp(
      (performance.now() - transition.startedAt) / transition.duration,
      0,
      1,
    );
    const eased = progress * progress * (3 - 2 * progress);
    camera.position.lerpVectors(transition.start, transition.end, eased);
    camera.lookAt(controls.target);
    updateViewModeToggle();
    if (progress >= 1) {
      camera.position.copy(transition.end);
      camera.lookAt(controls.target);
      transition = null;
      controls.enableDamping = false;
      controls.enabled = true;
      controls.update();
      controls.enableDamping = previousDamping;
      updateViewModeToggle();
    }
    return true;
  }

  return { advanceTransition, updateViewModeToggle };
}
