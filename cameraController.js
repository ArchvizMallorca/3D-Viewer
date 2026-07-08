/* =========================================================
   cameraController.js · cámara orbital + modo persona
   - Orbit: encuadre cercano, permite entrar al interior
   - Persona: recorrido en 1ª persona (WASD/ratón + táctil)
   - Spawn desde la vista actual o desde un hotspot de inicio
   ========================================================= */

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

export class CameraController {
  /**
   * @param {THREE.PerspectiveCamera} camera
   * @param {HTMLElement} dom  canvas del renderer
   * @param {object} config    CONFIG global
   */
  constructor(camera, dom, config) {
    this.camera = camera;
    this.dom = dom;
    this.config = config;
    this.mode = "orbit";
    this.onModeChange = null;          // callback (mode) => void
    this.startSpawnProvider = null;    // () => {position,yaw}|null (hotspot de inicio)

    // --- Orbit ---
    const c = new OrbitControls(camera, dom);
    c.enableDamping = true;
    c.dampingFactor = 0.08;
    c.rotateSpeed = 0.7;
    c.zoomSpeed = 0.9;
    c.panSpeed = 0.7;
    c.enablePan = true;
    c.screenSpacePanning = false;
    c.autoRotate = !!config.autoRotate;
    c.autoRotateSpeed = config.autoRotateSpeed ?? 0.6;
    c.maxPolarAngle = Math.PI * 0.92;  // casi hasta el suelo, permite mirar interiores
    c.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    this.orbit = c;

    // Rotación automática por inactividad: activa al inicio, se detiene al
    // interactuar y vuelve tras unos segundos sin tocar nada.
    this._idleMs = 5000;
    this._lastInteract = -1e9;         // -> rota desde el arranque
    this._interacting = false;
    c.addEventListener("start", () => { this._interacting = true; c.autoRotate = false; });
    c.addEventListener("end", () => { this._interacting = false; this._lastInteract = performance.now(); });

    this._home = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
    this._resetting = false;

    // --- Estado persona ---
    this.size = new THREE.Vector3(10, 3, 10);
    this.center = new THREE.Vector3();
    this._yaw = 0;
    this._pitch = 0;
    this._keys = new Set();
    this._vert = 0;                    // -1 baja, +1 sube (botones móvil)
    this._joy = { x: 0, y: 0 };
    this._eyeH = 1.6;
    this._speed = 3;
    this._lookSens = 0.0024;           // sensibilidad de mirada (rad por píxel)
    this._maxPitch = 1.45;             // ~83°, evita el "flip" en vertical
    this._orbitSaved = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
    this._fwd = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._UP = new THREE.Vector3(0, 1, 0);

    this._bindPersonInput();
  }

  /* ---------- Encuadre orbital ---------- */
  frame(box) {
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    this.size.copy(size);
    this.center.copy(center);

    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = this.camera.fov * (Math.PI / 180);
    let dist = (maxDim / 2) / Math.tan(fov / 2);
    dist *= 1.2;                       // más cerca que antes (antes 1.6)

    const dir = new THREE.Vector3(1, 0.6, 1).normalize();
    this.camera.position.copy(center.clone().add(dir.multiplyScalar(dist)));
    this.camera.near = Math.max(0.01, maxDim / 500);
    this.camera.far = dist * 100;
    this.camera.updateProjectionMatrix();

    this.orbit.target.copy(center);
    this.orbit.minDistance = 0.2;      // permite acercarse y entrar al interior
    this.orbit.maxDistance = dist * 3;
    this.orbit.update();

    this._home.pos.copy(this.camera.position);
    this._home.target.copy(this.orbit.target);
  }

  reset() {
    if (this.mode === "person") this.exitPerson();
    this._resetting = true;
    this.orbit.autoRotate = false;
    this._lastInteract = performance.now();   // espera inactividad antes de re-rotar
  }

  /** Cambia la distancia focal (mm) → varía el "zoom" / campo de visión. */
  setFocalLength(mm) {
    this.camera.setFocalLength(mm);
    this.camera.updateProjectionMatrix();
  }

  /* ---------- Modo persona ---------- */
  _autoParams() {
    const p = this.config.person || {};
    const foot = Math.max(this.size.x, this.size.z) || 10;
    this._eyeH = p.eyeHeight != null ? p.eyeHeight : 1.6;
    this._speed = p.walkSpeed != null ? p.walkSpeed : Math.max(2, foot * 0.06);
  }

  /** Punto de inicio a partir de la vista orbital actual (nunca queda enterrado). */
  spawnFromView() {
    const t = this.orbit.target;
    const dx = t.x - this.camera.position.x;
    const dz = t.z - this.camera.position.z;
    return {
      position: new THREE.Vector3(t.x, this._eyeHOrDefault(), t.z),
      yaw: Math.atan2(-dx, -dz),       // mirar hacia donde estaba el target
    };
  }
  _eyeHOrDefault() {
    const p = this.config.person || {};
    return p.eyeHeight != null ? p.eyeHeight : 1.6;
  }

  /**
   * Entra en modo persona.
   * @param {{position:THREE.Vector3, yaw?:number}} [spawn]
   */
  enterPerson(spawn) {
    if (this.mode === "person") return;
    this._autoParams();
    this.mode = "person";

    this._orbitSaved.pos.copy(this.camera.position);
    this._orbitSaved.target.copy(this.orbit.target);
    this.orbit.enabled = false;
    this.orbit.autoRotate = false;

    const s = spawn ||
      (this.startSpawnProvider && this.startSpawnProvider()) ||
      this.spawnFromView();
    this.camera.position.copy(s.position);
    this._yaw = s.yaw || 0;
    this._pitch = s.pitch || 0;
    this.camera.rotation.order = "YXZ";
    this._applyLook();

    this.onModeChange && this.onModeChange("person");
  }

  exitPerson() {
    if (this.mode !== "person") return;
    this.mode = "orbit";
    document.exitPointerLock && document.exitPointerLock();
    this._keys.clear();
    this._vert = 0; this._joy.x = this._joy.y = 0;

    this.camera.position.copy(this._orbitSaved.pos);
    this.orbit.target.copy(this._orbitSaved.target);
    this.orbit.enabled = true;
    this._interacting = false;
    this._lastInteract = performance.now();   // no reanudar la rotación de golpe
    this.orbit.update();
    this.onModeChange && this.onModeChange("orbit");
  }

  togglePerson() { this.mode === "person" ? this.exitPerson() : this.enterPerson(); }

  /* Entradas externas (joystick / botones táctiles de la UI) */
  setJoystick(x, y) { this._joy.x = x; this._joy.y = y; }
  setVertical(v) { this._vert = v; }

  _isTouch() {
    return window.matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
  }

  _applyLook() {
    this._pitch = Math.max(-this._maxPitch, Math.min(this._maxPitch, this._pitch));
    this.camera.rotation.set(this._pitch, this._yaw, 0, "YXZ");
  }

  _bindPersonInput() {
    const dom = this.dom;

    // Mirar arrastrando (ratón y dedo, unificado con Pointer Events).
    // Al ir por delta de arrastre, la mirada queda alineada con el cursor.
    let dragging = false, px = 0, py = 0;
    dom.addEventListener("pointerdown", (e) => {
      if (this.mode !== "person") return;
      dragging = true; px = e.clientX; py = e.clientY;
      dom.setPointerCapture && dom.setPointerCapture(e.pointerId);
    });
    dom.addEventListener("pointermove", (e) => {
      if (this.mode !== "person" || !dragging) return;
      this._yaw -= (e.clientX - px) * this._lookSens;
      this._pitch -= (e.clientY - py) * this._lookSens;
      px = e.clientX; py = e.clientY;
      this._applyLook();
    });
    const stop = () => { dragging = false; };
    dom.addEventListener("pointerup", stop);
    dom.addEventListener("pointercancel", stop);
    dom.addEventListener("pointerleave", stop);

    // Teclado
    document.addEventListener("keydown", (e) => {
      if (this.mode !== "person") return;
      if (e.key === "Escape") { this.exitPerson(); return; }
      this._keys.add(e.key.toLowerCase());
      if (e.code === "Space") { this._space = true; e.preventDefault(); }
      if (e.key.toLowerCase() === "c") this._ctrlDown = true;
    });
    document.addEventListener("keyup", (e) => {
      this._keys.delete(e.key.toLowerCase());
      if (e.code === "Space") this._space = false;
      if (e.key.toLowerCase() === "c") this._ctrlDown = false;
    });

    // Si la ventana pierde el foco (Alt+Tab, Sticky Keys de Shift, etc.) se
    // pueden quedar teclas "pegadas" y seguir corriendo: las soltamos todas.
    const releaseAll = () => { this._keys.clear(); this._space = false; this._ctrlDown = false; };
    window.addEventListener("blur", releaseAll);
    document.addEventListener("visibilitychange", () => { if (document.hidden) releaseAll(); });
  }

  /* ---------- Update por frame ---------- */
  update(dt) {
    if (this.mode === "person") {
      this._updatePerson(dt);
      return;
    }
    // Orbit
    if (this._resetting) {
      this.camera.position.lerp(this._home.pos, 0.12);
      this.orbit.target.lerp(this._home.target, 0.12);
      if (this.camera.position.distanceTo(this._home.pos) < 0.02) {
        this.camera.position.copy(this._home.pos);
        this.orbit.target.copy(this._home.target);
        this._resetting = false;
      }
    }
    // Reanuda la rotación automática tras 5 s de inactividad
    if (this.config.autoRotate && !this._interacting && !this._resetting &&
        performance.now() - this._lastInteract > this._idleMs) {
      this.orbit.autoRotate = true;
    }
    this.orbit.update();
  }

  _updatePerson(dt) {
    // Dirección horizontal a partir del yaw (independiente del pitch):
    // así el desplazamiento no falla al mirar del todo arriba/abajo.
    const s = Math.sin(this._yaw), c = Math.cos(this._yaw);
    this._fwd.set(-s, 0, -c);
    this._right.set(c, 0, -s);

    const run = this._keys.has("shift") ? (this.config.person?.runFactor || 2.2) : 1;
    const step = this._speed * run * dt;

    let mf = 0, mr = 0, mv = 0;
    if (this._keys.has("w") || this._keys.has("arrowup")) mf += 1;
    if (this._keys.has("s") || this._keys.has("arrowdown")) mf -= 1;
    if (this._keys.has("d") || this._keys.has("arrowright")) mr += 1;
    if (this._keys.has("a") || this._keys.has("arrowleft")) mr -= 1;
    mf -= this._joy.y; mr += this._joy.x;
    if (this._space || this._vert > 0) mv += 1;
    if (this._ctrlDown || this._vert < 0) mv -= 1;

    this.camera.position.addScaledVector(this._fwd, mf * step);
    this.camera.position.addScaledVector(this._right, mr * step);
    this.camera.position.y += mv * step;
  }

  onFirstInteraction(cb) {
    this.orbit.addEventListener("start", cb);
  }
}
