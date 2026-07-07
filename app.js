/* =========================================================
   Visor 3D · Archviz Mallorca
   Three.js + OrbitControls · Carga GLB · Iluminación estudio
   ========================================================= */

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

/* ---------------------------------------------------------
   CONFIGURACIÓN — edita aquí por proyecto
   --------------------------------------------------------- */
const CONFIG = {
  modelUrl: "model.glb",            // archivo del modelo (junto al index.html)
  title: "Villa Conceptual",        // título mostrado arriba
  subtitle: "Fase conceptual · Volumetría",
  background: 0xeceae6,             // gris cálido arquitectónico
  autoRotate: true,                 // rotación suave al inicio
  autoRotateSpeed: 0.6,
};

/* Planos del proyecto (PNG con fondo transparente).
   Añade, quita o reordena entradas aquí. Si el array está vacío,
   el botón "Planos" no aparece. */
const PLANS = [
  { label: "Planta Baja", url: "planos/planta-baja.png" },
  { label: "Alzado",      url: "planos/alzado.png" },
];

/* Modo persona (recorrido en primera persona).
   Los valores en null se calculan solos según el tamaño del modelo. */
const PERSON = {
  eyeHeight: null,   // altura de los ojos (unidades del modelo); null = automático
  walkSpeed: null,   // velocidad de desplazamiento; null = automático
  runFactor: 2.2,    // multiplicador al mantener Shift
};

/* Herramienta de medir.
   El modelo parece estar en centímetros → 100 unidades = 1 m.
   Si una medida conocida no cuadra, ajusta 'unitsPerMeter'
   (la etiqueta muestra también las unidades crudas para calibrar). */
const MEASURE = {
  unitsPerMeter: 100,
  unit: "m",
  decimals: 2,
};

/* ---------------------------------------------------------
   Referencias DOM
   --------------------------------------------------------- */
const viewerEl   = document.getElementById("viewer");
const loaderEl   = document.getElementById("loader");
const loaderBar  = document.getElementById("loaderBar");
const loaderText = document.getElementById("loaderText");
const errorEl    = document.getElementById("error");
const errorMsg   = document.getElementById("errorMsg");
const hintEl     = document.getElementById("hint");
const resetBtn   = document.getElementById("resetView");

document.getElementById("projectTitle").textContent = CONFIG.title;
document.getElementById("projectSubtitle").textContent = CONFIG.subtitle;
document.title = CONFIG.title + " · Archviz Mallorca";

/* ---------------------------------------------------------
   Escena · Cámara · Renderer
   --------------------------------------------------------- */
const scene = new THREE.Scene();
scene.background = new THREE.Color(CONFIG.background);

const camera = new THREE.PerspectiveCamera(
  40, window.innerWidth / window.innerHeight, 0.1, 5000
);
camera.position.set(8, 6, 12);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: false,
  powerPreference: "high-performance",
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // límite móvil
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
viewerEl.appendChild(renderer.domElement);

// Estado global de la app: "orbit" (por defecto) o "person"
const appState = { mode: "orbit" };
const isTouch = window.matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;

/* ---------------------------------------------------------
   Iluminación tipo estudio (suave, no realismo extremo)
   --------------------------------------------------------- */
// Environment neutro para reflejos suaves en materiales
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

// Hemisférica: cielo claro / suelo cálido
const hemi = new THREE.HemisphereLight(0xffffff, 0xd8d4cc, 0.9);
scene.add(hemi);

// Key light con sombra suave
const key = new THREE.DirectionalLight(0xffffff, 2.2);
key.position.set(6, 12, 8);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.bias = -0.0005;
key.shadow.normalBias = 0.02;
scene.add(key);

// Relleno frontal tenue (sin sombra) para aplanar contrastes
const fill = new THREE.DirectionalLight(0xffffff, 0.6);
fill.position.set(-8, 5, -6);
scene.add(fill);

// Suelo receptor de sombras (invisible salvo la sombra)
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(4000, 4000),
  new THREE.ShadowMaterial({ opacity: 0.16 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

/* ---------------------------------------------------------
   Controles orbitales (ratón + touch)
   --------------------------------------------------------- */
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;         // inercia suave
controls.dampingFactor = 0.08;
controls.rotateSpeed = 0.7;
controls.zoomSpeed = 0.8;
controls.panSpeed = 0.6;
controls.enablePan = true;
controls.screenSpacePanning = false;
controls.autoRotate = CONFIG.autoRotate;
controls.autoRotateSpeed = CONFIG.autoRotateSpeed;
controls.maxPolarAngle = Math.PI * 0.5;  // no bajar bajo el suelo
controls.minPolarAngle = 0.15;
// Gestos táctiles naturales: 1 dedo orbita, 2 dedos zoom+desplazar
controls.touches = {
  ONE: THREE.TOUCH.ROTATE,
  TWO: THREE.TOUCH.DOLLY_PAN,
};

// Guardamos el estado inicial de cámara para "Reset view"
let homeTarget = new THREE.Vector3();
let homePosition = new THREE.Vector3();

/* ---------------------------------------------------------
   Carga del modelo GLB
   --------------------------------------------------------- */
const loader = new GLTFLoader();

// Estado del modelo (lo usan modo persona y medición)
let modelRoot = null;
const pickMeshes = [];
let worldSize = new THREE.Vector3();
let worldCenter = new THREE.Vector3();

loader.load(
  CONFIG.modelUrl,
  (gltf) => {
    const model = gltf.scene;

    // Sombras en todas las mallas
    model.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        if (o.material) o.material.side = THREE.FrontSide;
        pickMeshes.push(o);
      }
    });

    scene.add(model);
    modelRoot = model;
    frameModel(model);      // centra cámara y ajusta límites de zoom

    // Guardamos tamaño/centro en coordenadas de mundo (post-transformación)
    const wb = new THREE.Box3().setFromObject(model);
    wb.getSize(worldSize);
    wb.getCenter(worldCenter);

    hideLoader();
  },
  (evt) => {
    if (evt.lengthComputable) {
      const pct = Math.round((evt.loaded / evt.total) * 100);
      loaderBar.style.width = pct + "%";
      loaderText.textContent = "Cargando modelo… " + pct + "%";
    }
  },
  (err) => {
    console.error("Error cargando GLB:", err);
    showError();
  }
);

/* ---------------------------------------------------------
   Encuadre automático: centra el modelo y fija distancias
   --------------------------------------------------------- */
function frameModel(object) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  // Apoya el modelo sobre el suelo (y = 0)
  object.position.y -= box.min.y;
  center.y -= box.min.y;

  const maxDim = Math.max(size.x, size.y, size.z);
  const fov = camera.fov * (Math.PI / 180);
  let dist = (maxDim / 2) / Math.tan(fov / 2);
  dist *= 1.6; // margen de aire alrededor

  // Posición de cámara en ángulo 3/4 (estilo arquitectónico)
  const dir = new THREE.Vector3(1, 0.7, 1).normalize();
  camera.position.copy(center.clone().add(dir.multiplyScalar(dist)));
  camera.near = dist / 100;
  camera.far = dist * 100;
  camera.updateProjectionMatrix();

  controls.target.copy(center);

  // Zoom limitado para no perder la escala
  controls.minDistance = maxDim * 0.6;
  controls.maxDistance = dist * 2.2;
  controls.update();

  // Guardar vista inicial
  homeTarget.copy(controls.target);
  homePosition.copy(camera.position);
}

/* ---------------------------------------------------------
   Reset view (transición suave)
   --------------------------------------------------------- */
let resetting = false;
resetBtn.addEventListener("click", () => {
  resetting = true;
  controls.autoRotate = false;
});

function animateReset() {
  if (!resetting) return;
  camera.position.lerp(homePosition, 0.12);
  controls.target.lerp(homeTarget, 0.12);
  if (camera.position.distanceTo(homePosition) < 0.05) {
    camera.position.copy(homePosition);
    controls.target.copy(homeTarget);
    resetting = false;
  }
}

/* ---------------------------------------------------------
   Ocultar la instrucción tras la primera interacción
   --------------------------------------------------------- */
let interacted = false;
function onFirstInteraction() {
  if (interacted) return;
  interacted = true;
  controls.autoRotate = false;          // el usuario toma el control
  hintEl.classList.add("hidden");
}
controls.addEventListener("start", onFirstInteraction);
// Oculta la pista automáticamente pasados unos segundos
setTimeout(() => hintEl.classList.add("hidden"), 6000);

/* ---------------------------------------------------------
   UI helpers
   --------------------------------------------------------- */
function hideLoader() {
  window.__viewerLoaded = true;
  loaderEl.classList.add("hidden");
}
function showError(msg) {
  loaderEl.classList.add("hidden");
  if (msg) errorMsg.textContent = msg;
  errorEl.hidden = false;
}

/* ---------------------------------------------------------
   Resize responsive
   --------------------------------------------------------- */
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});

/* ---------------------------------------------------------
   Planos: panel desplegable + lightbox
   --------------------------------------------------------- */
(function setupPlans() {
  const plansEl    = document.getElementById("plans");
  const toggleBtn  = document.getElementById("plansToggle");
  const menuEl     = document.getElementById("plansMenu");
  const listEl     = document.getElementById("plansList");
  const lightbox   = document.getElementById("lightbox");
  const tabsEl     = document.getElementById("lightboxTabs");
  const stageEl    = document.getElementById("lightboxStage");
  const imgEl      = document.getElementById("lightboxImg");
  const zoomBtn    = document.getElementById("lbZoom");
  const closeBtn   = document.getElementById("lbClose");

  if (!PLANS.length) return;          // sin planos → no mostramos nada
  plansEl.hidden = false;

  // Lista del desplegable
  PLANS.forEach((p, i) => {
    const li = document.createElement("li");
    li.innerHTML = `<span class="num">${String(i + 1).padStart(2, "0")}</span>
                    <span class="lbl">${p.label}</span>
                    <span class="chev">→</span>`;
    li.addEventListener("click", () => { closeMenu(); openLightbox(i); });
    listEl.appendChild(li);
  });

  // Tabs del lightbox
  PLANS.forEach((p, i) => {
    const b = document.createElement("button");
    b.className = "lb-tab";
    b.textContent = p.label;
    b.addEventListener("click", () => showPlan(i));
    tabsEl.appendChild(b);
  });

  // --- Menú desplegable ---
  function openMenu() {
    menuEl.hidden = false;
    toggleBtn.setAttribute("aria-expanded", "true");
  }
  function closeMenu() {
    menuEl.hidden = true;
    toggleBtn.setAttribute("aria-expanded", "false");
  }
  toggleBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    menuEl.hidden ? openMenu() : closeMenu();
  });
  document.addEventListener("click", (e) => {
    if (!plansEl.contains(e.target)) closeMenu();
  });

  // --- Lightbox ---
  let current = -1;
  function openLightbox(i) { lightbox.hidden = false; showPlan(i); }
  function showPlan(i) {
    current = i;
    imgEl.src = PLANS[i].url;
    imgEl.alt = PLANS[i].label;
    setZoom(false);
    [...tabsEl.children].forEach((t, k) =>
      t.classList.toggle("active", k === i));
  }
  function closeLightbox() { lightbox.hidden = true; setZoom(false); }
  closeBtn.addEventListener("click", closeLightbox);

  // Cerrar con la tecla Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !lightbox.hidden) closeLightbox();
  });

  // --- Zoom (click / botón + arrastrar para desplazar) ---
  let zoomed = false;
  function setZoom(on) {
    zoomed = on;
    stageEl.classList.toggle("zoomed", on);
    zoomBtn.textContent = on ? "－" : "＋";
  }
  zoomBtn.addEventListener("click", () => setZoom(!zoomed));
  imgEl.addEventListener("click", () => setZoom(!zoomed));

  // Arrastrar para desplazar cuando está ampliado
  let dragging = false, sx = 0, sy = 0, sl = 0, st = 0;
  stageEl.addEventListener("pointerdown", (e) => {
    if (!zoomed) return;
    dragging = true; sx = e.clientX; sy = e.clientY;
    sl = stageEl.scrollLeft; st = stageEl.scrollTop;
    stageEl.style.cursor = "grabbing";
  });
  window.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    stageEl.scrollLeft = sl - (e.clientX - sx);
    stageEl.scrollTop  = st - (e.clientY - sy);
  });
  window.addEventListener("pointerup", () => {
    dragging = false; stageEl.style.cursor = "";
  });
})();

/* =========================================================
   MODO PERSONA · recorrido en primera persona
   ========================================================= */
const personCtl = (function () {
  const btn      = document.getElementById("personBtn");
  const exitBtn  = document.getElementById("personExit");
  const hintEl2  = document.getElementById("personHint");
  const crosshair= document.getElementById("crosshair");
  const touchUI  = document.getElementById("personTouch");
  const joy      = document.getElementById("joystick");
  const knob     = document.getElementById("joystickKnob");
  const upBtn    = document.getElementById("upBtn");
  const downBtn  = document.getElementById("downBtn");

  let yaw = 0, pitch = 0;
  const keys = new Set();
  let vUp = false, vDown = false;
  let joyX = 0, joyY = 0;
  let speed = 1, eyeH = 1.6;
  const orbitSaved = { pos: new THREE.Vector3(), target: new THREE.Vector3() };

  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);

  function autoParams() {
    const foot = Math.max(worldSize.x, worldSize.z) || 10;
    eyeH  = PERSON.eyeHeight != null ? PERSON.eyeHeight : worldSize.y * 0.18 || 1.6;
    speed = PERSON.walkSpeed != null ? PERSON.walkSpeed : foot * 0.18;
  }

  function enter() {
    if (appState.mode === "person") return;
    measureCtl.disable();               // no mezclar con medición
    appState.mode = "person";
    autoParams();

    // Guardar vista orbital para restaurarla al salir
    orbitSaved.pos.copy(camera.position);
    orbitSaved.target.copy(controls.target);
    controls.enabled = false;
    controls.autoRotate = false;

    // Colocar a la persona en el centro, a la altura de los ojos
    camera.position.set(worldCenter.x, eyeH, worldCenter.z);
    yaw = 0; pitch = 0;
    camera.rotation.order = "YXZ";
    applyLook();

    document.body.classList.add("person-active");
    btn.classList.add("active");
    exitBtn.hidden = false;
    hintEl2.hidden = false;
    if (isTouch) { touchUI.hidden = false; }
    else { crosshair.hidden = false; requestLock(); }
    setTimeout(() => { hintEl2.hidden = true; }, 6000);
  }

  function exit() {
    if (appState.mode !== "person") return;
    appState.mode = "orbit";
    document.exitPointerLock && document.exitPointerLock();
    document.body.classList.remove("person-active");
    btn.classList.remove("active");
    exitBtn.hidden = true;
    hintEl2.hidden = true;
    crosshair.hidden = true;
    touchUI.hidden = true;
    keys.clear(); vUp = vDown = false; joyX = joyY = 0;

    // Restaurar cámara orbital
    camera.position.copy(orbitSaved.pos);
    controls.target.copy(orbitSaved.target);
    controls.enabled = true;
    controls.update();
  }

  function applyLook() {
    pitch = Math.max(-1.4, Math.min(1.4, pitch));
    camera.rotation.set(pitch, yaw, 0, "YXZ");
  }

  /* ---- Ratón (desktop) con pointer lock ---- */
  function requestLock() { renderer.domElement.requestPointerLock?.(); }
  renderer.domElement.addEventListener("click", () => {
    if (appState.mode === "person" && !isTouch &&
        document.pointerLockElement !== renderer.domElement) requestLock();
  });
  document.addEventListener("mousemove", (e) => {
    if (appState.mode !== "person") return;
    if (document.pointerLockElement !== renderer.domElement) return;
    yaw   -= e.movementX * 0.0022;
    pitch -= e.movementY * 0.0022;
    applyLook();
  });

  /* ---- Teclado ---- */
  document.addEventListener("keydown", (e) => {
    if (appState.mode !== "person") return;
    if (e.key === "Escape") { exit(); return; }
    keys.add(e.key.toLowerCase());
    if (e.code === "Space") { vUp = true; e.preventDefault(); }
    if (e.key.toLowerCase() === "c") vDown = true;
  });
  document.addEventListener("keyup", (e) => {
    keys.delete(e.key.toLowerCase());
    if (e.code === "Space") vUp = false;
    if (e.key.toLowerCase() === "c") vDown = false;
  });

  /* ---- Mirar con el dedo (móvil): arrastrar fuera del joystick ---- */
  let lookId = null, lx = 0, ly = 0;
  renderer.domElement.addEventListener("touchstart", (e) => {
    if (appState.mode !== "person") return;
    const t = e.changedTouches[0];
    lookId = t.identifier; lx = t.clientX; ly = t.clientY;
  }, { passive: true });
  renderer.domElement.addEventListener("touchmove", (e) => {
    if (appState.mode !== "person" || lookId === null) return;
    for (const t of e.changedTouches) {
      if (t.identifier !== lookId) continue;
      yaw   -= (t.clientX - lx) * 0.005;
      pitch -= (t.clientY - ly) * 0.005;
      lx = t.clientX; ly = t.clientY; applyLook();
    }
  }, { passive: true });
  renderer.domElement.addEventListener("touchend", (e) => {
    for (const t of e.changedTouches) if (t.identifier === lookId) lookId = null;
  });

  /* ---- Joystick de movimiento (móvil) ---- */
  let joyId = null;
  function joyStart(e) {
    const t = e.changedTouches[0];
    joyId = t.identifier; joyMove(e);
  }
  function joyMove(e) {
    for (const t of e.changedTouches) {
      if (t.identifier !== joyId) continue;
      const r = joy.getBoundingClientRect();
      let dx = t.clientX - (r.left + r.width / 2);
      let dy = t.clientY - (r.top + r.height / 2);
      const max = r.width / 2;
      const len = Math.hypot(dx, dy) || 1;
      const cl = Math.min(len, max);
      dx = dx / len * cl; dy = dy / len * cl;
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      joyX = dx / max; joyY = dy / max;
      e.preventDefault();
    }
  }
  function joyEnd() { joyId = null; joyX = joyY = 0; knob.style.transform = ""; }
  joy.addEventListener("touchstart", joyStart, { passive: false });
  joy.addEventListener("touchmove", joyMove, { passive: false });
  joy.addEventListener("touchend", joyEnd);

  // Botones subir / bajar (móvil)
  const hold = (el, on) => {
    el.addEventListener("touchstart", (e) => { on(true); e.preventDefault(); }, { passive: false });
    el.addEventListener("touchend",   () => on(false));
  };
  hold(upBtn,   (v) => vUp = v);
  hold(downBtn, (v) => vDown = v);

  btn.addEventListener("click", () => appState.mode === "person" ? exit() : enter());
  exitBtn.addEventListener("click", exit);

  /* ---- Actualización por frame ---- */
  function update(dt) {
    camera.getWorldDirection(forward);
    forward.y = 0; forward.normalize();
    right.crossVectors(forward, UP).normalize();

    const run = keys.has("shift") ? PERSON.runFactor : 1;
    const step = speed * run * dt;

    let mf = 0, mr = 0, mv = 0;
    if (keys.has("w") || keys.has("arrowup"))    mf += 1;
    if (keys.has("s") || keys.has("arrowdown"))  mf -= 1;
    if (keys.has("d") || keys.has("arrowright")) mr += 1;
    if (keys.has("a") || keys.has("arrowleft"))  mr -= 1;
    mf -= joyY; mr += joyX;                 // joystick
    if (vUp) mv += 1;
    if (vDown) mv -= 1;

    camera.position.addScaledVector(forward, mf * step);
    camera.position.addScaledVector(right,   mr * step);
    camera.position.y += mv * step;
  }

  return { enter, exit, update };
})();

/* =========================================================
   MEDIR · distancia entre dos puntos del modelo
   ========================================================= */
const measureCtl = (function () {
  const btn       = document.getElementById("measureBtn");
  const hintEl3   = document.getElementById("measureHint");
  const hintText  = document.getElementById("measureHintText");
  const clearBtn  = document.getElementById("measureClear");
  const labelEl   = document.getElementById("measureLabel");

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const group = new THREE.Group();
  scene.add(group);

  let active = false;
  const points = [];       // THREE.Vector3
  let markerR = 0.1;

  function enable() {
    if (appState.mode === "person") personCtl.exit();
    active = true;
    btn.classList.add("active");
    hintEl3.hidden = false;
    clear();
    markerR = (Math.max(worldSize.x, worldSize.y, worldSize.z) || 10) * 0.006;
  }
  function disable() {
    active = false;
    btn.classList.remove("active");
    hintEl3.hidden = true;
    labelEl.hidden = true;
    clear();
  }
  function toggle() { active ? disable() : enable(); }

  function clear() {
    points.length = 0;
    while (group.children.length) {
      const c = group.children.pop();
      c.geometry?.dispose?.(); c.material?.dispose?.();
      group.remove(c);
    }
    labelEl.hidden = true;
    hintText.textContent = "Toca el primer punto sobre el modelo";
  }

  function addMarker(p) {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(markerR, 20, 20),
      new THREE.MeshBasicMaterial({ color: 0x1c1b19 })
    );
    m.position.copy(p);
    group.add(m);
  }

  function addPoint(p) {
    if (points.length === 2) clear();     // empezar medición nueva
    points.push(p.clone());
    addMarker(p);
    if (points.length === 1) {
      hintText.textContent = "Toca el segundo punto";
    } else {
      // línea entre los dos puntos
      const g = new THREE.BufferGeometry().setFromPoints(points);
      const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0x1c1b19 }));
      group.add(line);
      showDistance();
      hintText.textContent = "Toca de nuevo para medir otra distancia";
    }
  }

  function showDistance() {
    const raw = points[0].distanceTo(points[1]);
    const meters = raw / MEASURE.unitsPerMeter;
    labelEl.innerHTML =
      `${meters.toFixed(MEASURE.decimals)} ${MEASURE.unit}` +
      `<small>${Math.round(raw)} u</small>`;
    labelEl.hidden = false;
  }

  // Colocar la etiqueta en el punto medio (se llama cada frame)
  const mid = new THREE.Vector3();
  function updateLabel() {
    if (points.length !== 2 || labelEl.hidden) return;
    mid.addVectors(points[0], points[1]).multiplyScalar(0.5).project(camera);
    const x = (mid.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-mid.y * 0.5 + 0.5) * window.innerHeight;
    labelEl.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px)`;
  }

  // Clic (sin arrastrar) sobre el modelo → colocar punto
  let downX = 0, downY = 0, downT = 0;
  renderer.domElement.addEventListener("pointerdown", (e) => {
    downX = e.clientX; downY = e.clientY; downT = performance.now();
  });
  renderer.domElement.addEventListener("pointerup", (e) => {
    if (!active || appState.mode === "person") return;
    const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
    if (moved > 6 || performance.now() - downT > 500) return;  // fue un arrastre
    ndc.x = (e.clientX / window.innerWidth) * 2 - 1;
    ndc.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(pickMeshes, true);
    if (hits.length) addPoint(hits[0].point);
  });

  btn.addEventListener("click", toggle);
  clearBtn.addEventListener("click", clear);

  return { enable, disable, toggle, updateLabel };
})();

/* ---------------------------------------------------------
   Bucle de render
   --------------------------------------------------------- */
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (appState.mode === "person") {
    personCtl.update(dt);
  } else {
    animateReset();
    controls.update();
  }
  measureCtl.updateLabel();
  renderer.render(scene, camera);
}
animate();
