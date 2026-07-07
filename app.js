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
      }
    });

    scene.add(model);
    frameModel(model);      // centra cámara y ajusta límites de zoom
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

/* ---------------------------------------------------------
   Bucle de render
   --------------------------------------------------------- */
function animate() {
  requestAnimationFrame(animate);
  animateReset();
  controls.update();
  renderer.render(scene, camera);
}
animate();
