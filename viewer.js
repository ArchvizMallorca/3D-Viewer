/* =========================================================
   viewer.js · Visor 3D · Archviz Mallorca — v2026-07-07 (modular)
   Orquestador: escena, luces, carga y bucle de render.
   Módulos: modelLoader · cameraController · ui · hotspots
   ========================================================= */

import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { loadModel } from "./modelLoader.js";
import { CameraController } from "./cameraController.js";
import { UI } from "./ui.js";
import { Hotspots } from "./hotspots.js";
import { Sun } from "./sun.js";

/* ---------------------------------------------------------
   CONFIGURACIÓN CENTRAL — edita aquí por proyecto
   --------------------------------------------------------- */
export const CONFIG = {
  modelUrl: "model.glb",
  title: "Villa Conceptual",
  subtitle: "Fase conceptual · Volumetría",
  background: 0xeceae6,
  autoRotate: true,
  autoRotateSpeed: 0.6,

  // Planos (PNG con transparencia)
  plans: [
    { label: "Planta Baja", url: "planos/planta-baja.png" },
    { label: "Alzado",      url: "planos/alzado.png" },
  ],

  // Modo persona — el modelo está en METROS
  person: { eyeHeight: 1.6, walkSpeed: 3.0, runFactor: 2.2 },

  // Medición — 1 unidad = 1 m (100 = cm, 1000 = mm)
  measure: { unitsPerMeter: 1, unit: "m", decimals: 2 },

  // Sol: time 0=amanece · 0.5=mediodía · 1=atardece · orientation en grados
  sun: { time: 0.62, orientation: 30, peakElevation: 72 },

  /* Hotspots. Crea uno con Alt+clic sobre el modelo (mira la consola).
     type:"enter" inicia el modo persona ahí; start:true lo usa el botón. Ej:
     { type:"enter", start:true, label:"Entrar", position:[3.2,1.6,-4.0], yaw:0 } */
  hotspots: [],
};

/* ---------------------------------------------------------
   Escena · Renderer · Cámara
   --------------------------------------------------------- */
const viewerEl = document.getElementById("viewer");

const scene = new THREE.Scene();
scene.background = new THREE.Color(CONFIG.background);

const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 5000);
camera.position.set(8, 6, 12);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
viewerEl.appendChild(renderer.domElement);

/* ---------------------------------------------------------
   Iluminación tipo estudio (suave, no realismo extremo)
   --------------------------------------------------------- */
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

// Luz ambiental suave (el sol es la fuente principal y proyecta las sombras)
scene.add(new THREE.HemisphereLight(0xffffff, 0xd8d4cc, 0.55));

const fill = new THREE.DirectionalLight(0xffffff, 0.25);
fill.position.set(-8, 5, -6);
scene.add(fill);

// Sol (luz direccional con sombra) — controlable desde la UI
const sun = new Sun(scene, CONFIG);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(4000, 4000),
  new THREE.ShadowMaterial({ opacity: 0.16 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

/* ---------------------------------------------------------
   Títulos
   --------------------------------------------------------- */
document.getElementById("projectTitle").textContent = CONFIG.title;
document.getElementById("projectSubtitle").textContent = CONFIG.subtitle;
document.title = CONFIG.title + " · Archviz Mallorca";

/* ---------------------------------------------------------
   Cámara · UI · Hotspots
   --------------------------------------------------------- */
const cameraCtl = new CameraController(camera, renderer.domElement, CONFIG);

let meshes = [];
let worldSize = new THREE.Vector3(10, 3, 10);
const getMeshes = () => meshes;
const getSize = () => worldSize;

const ui = new UI({
  cameraController: cameraCtl, scene, camera, sun,
  dom: renderer.domElement, getMeshes, getSize, config: CONFIG,
});

const hotspots = new Hotspots({
  camera, dom: renderer.domElement,
  container: document.getElementById("hotspots"),
  cameraController: cameraCtl, config: CONFIG, getMeshes,
});

// El botón "Modo persona" entra desde el hotspot de inicio si existe
cameraCtl.startSpawnProvider = () => hotspots.getStartSpawn();

/* ---------------------------------------------------------
   Carga del modelo
   --------------------------------------------------------- */
const loaderEl = document.getElementById("loader");
const loaderBar = document.getElementById("loaderBar");
const loaderText = document.getElementById("loaderText");

loadModel(
  CONFIG.modelUrl,
  (evt) => {
    if (evt && evt.lengthComputable) {
      const pct = Math.round((evt.loaded / evt.total) * 100);
      loaderBar.style.width = pct + "%";
      loaderText.textContent = "Cargando modelo… " + pct + "%";
    }
  }
).then(({ model, meshes: m, box, size }) => {
  scene.add(model);
  meshes = m;
  worldSize.copy(size);
  cameraCtl.frame(box);
  sun.frame(box);
  window.__viewerLoaded = true;
  loaderEl.classList.add("hidden");
}).catch((err) => {
  console.error("Error cargando GLB:", err);
  loaderEl.classList.add("hidden");
  const e = document.getElementById("error");
  if (e) e.hidden = false;
});

/* ---------------------------------------------------------
   Resize · Bucle de render
   --------------------------------------------------------- */
addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
});

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  cameraCtl.update(dt);
  ui.update();
  hotspots.update();
  renderer.render(scene, camera);
}
animate();
