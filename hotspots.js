/* =========================================================
   hotspots.js · puntos interactivos sobre el modelo
   - Marcadores 3D proyectados a 2D (DOM)
   - Un hotspot "enter" inicia el modo persona en ese punto
   - Picker: Alt + clic sobre el modelo imprime las coordenadas
     en la consola para crear nuevos hotspots fácilmente
   ========================================================= */

import * as THREE from "three";

export class Hotspots {
  /**
   * @param {object} o
   * @param {THREE.Camera} o.camera
   * @param {HTMLElement} o.dom        canvas del renderer
   * @param {HTMLElement} o.container  capa DOM para los marcadores
   * @param {CameraController} o.cameraController
   * @param {object} o.config
   * @param {()=>THREE.Mesh[]} o.getMeshes
   */
  constructor({ camera, dom, container, cameraController, config, getMeshes }) {
    this.camera = camera;
    this.dom = dom;
    this.container = container;
    this.cam = cameraController;
    this.config = config;
    this.getMeshes = getMeshes;

    this.items = [];               // { data, el, pos:Vector3 }
    this._v = new THREE.Vector3();
    this._raycaster = new THREE.Raycaster();
    this._ndc = new THREE.Vector2();

    this._build();
    this._bindPicker();
  }

  _build() {
    const list = this.config.hotspots || [];
    list.forEach((h) => this.add(h));
  }

  /** Añade un hotspot { type, label, position:[x,y,z], yaw } */
  add(h) {
    // Los hotspots de inicio (start) NO muestran marcador: solo definen el
    // punto donde arranca el modo persona (lo usa el botón "Modo persona").
    if (h.start) return;

    const el = document.createElement("button");
    el.className = "hotspot" + (h.type === "enter" ? " hotspot-enter" : "");
    el.innerHTML = `<span class="hotspot-dot"></span>` +
                   (h.label ? `<span class="hotspot-label">${h.label}</span>` : "");
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      if (h.type === "enter") {
        this.cam.enterPerson({
          position: new THREE.Vector3(h.position[0], h.position[1], h.position[2]),
          yaw: h.yaw || 0,
        });
      }
    });
    this.container.appendChild(el);
    this.items.push({ data: h, el, pos: new THREE.Vector3(...h.position) });
  }

  /** ¿Hay algún hotspot de inicio definido? Devuelve su spawn o null. */
  getStartSpawn() {
    const h = (this.config.hotspots || []).find((x) => x.type === "enter" && x.start);
    if (!h) return null;
    return { position: new THREE.Vector3(...h.position), yaw: h.yaw || 0 };
  }

  /* Picker de coordenadas: Alt + clic sobre el modelo */
  _bindPicker() {
    this.dom.addEventListener("click", (e) => {
      if (!e.altKey) return;
      this._ndc.x = (e.clientX / window.innerWidth) * 2 - 1;
      this._ndc.y = -(e.clientY / window.innerHeight) * 2 + 1;
      this._raycaster.setFromCamera(this._ndc, this.camera);
      const hits = this._raycaster.intersectObjects(this.getMeshes(), true);
      if (!hits.length) return;
      const p = hits[0].point;
      const coords = `[${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}]`;
      // Sugerencia lista para pegar en CONFIG.hotspots
      console.log("Hotspot →", coords);
      console.log(`{ type: "enter", start: true, label: "Entrar", position: ${coords}, yaw: 0 },`);
    });
  }

  /* Proyección 3D → 2D cada frame */
  update() {
    const inPerson = this.cam.mode === "person";
    for (const it of this.items) {
      if (inPerson) { it.el.style.display = "none"; continue; }
      this._v.copy(it.pos).project(this.camera);
      const visible = this._v.z < 1;
      if (!visible) { it.el.style.display = "none"; continue; }
      it.el.style.display = "flex";
      const x = (this._v.x * 0.5 + 0.5) * window.innerWidth;
      const y = (-this._v.y * 0.5 + 0.5) * window.innerHeight;
      it.el.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px)`;
    }
  }
}
