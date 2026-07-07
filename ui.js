/* =========================================================
   ui.js · interfaz del visor
   - Botones: Reset, Modo persona, Medir, Planos
   - Lightbox de planos
   - Herramienta de medir (2 puntos)
   - DOM del modo persona (crosshair, joystick, salir, ayuda)
   ========================================================= */

import * as THREE from "three";

export class UI {
  /**
   * @param {object} o
   * @param {CameraController} o.cameraController
   * @param {THREE.Scene} o.scene
   * @param {THREE.Camera} o.camera
   * @param {HTMLElement} o.dom
   * @param {()=>THREE.Mesh[]} o.getMeshes
   * @param {()=>THREE.Vector3} o.getSize
   * @param {object} o.config
   */
  constructor(o) {
    this.cam = o.cameraController;
    this.scene = o.scene;
    this.camera = o.camera;
    this.dom = o.dom;
    this.getMeshes = o.getMeshes;
    this.getSize = o.getSize;
    this.config = o.config;

    this._el = (id) => document.getElementById(id);

    this._setupButtons();
    this._setupPlans();
    this._setupMeasure();
    this._setupPersonDom();

    // La cámara avisa cuando cambia de modo → actualizamos el DOM
    this.cam.onModeChange = (m) => this._setMode(m);

    // Oculta la pista inicial tras la primera interacción o a los 6 s
    const hint = this._el("hint");
    this.cam.onFirstInteraction(() => hint && hint.classList.add("hidden"));
    setTimeout(() => hint && hint.classList.add("hidden"), 6000);
  }

  /* ---------------- Botones ---------------- */
  _setupButtons() {
    this._el("resetView")?.addEventListener("click", () => this.cam.reset());
    this._el("personBtn")?.addEventListener("click", () => this.cam.togglePerson());
    this._el("measureBtn")?.addEventListener("click", () => this._toggleMeasure());
  }

  /* ---------------- Modo persona (DOM) ---------------- */
  _setupPersonDom() {
    this._el("personExit")?.addEventListener("click", () => this.cam.exitPerson());

    const joy = this._el("joystick");
    const knob = this._el("joystickKnob");
    if (joy && knob) {
      let id = null;
      const start = (e) => { id = e.changedTouches[0].identifier; move(e); };
      const move = (e) => {
        for (const t of e.changedTouches) {
          if (t.identifier !== id) continue;
          const r = joy.getBoundingClientRect();
          let dx = t.clientX - (r.left + r.width / 2);
          let dy = t.clientY - (r.top + r.height / 2);
          const max = r.width / 2;
          const len = Math.hypot(dx, dy) || 1;
          const cl = Math.min(len, max);
          dx = dx / len * cl; dy = dy / len * cl;
          knob.style.transform = `translate(${dx}px, ${dy}px)`;
          this.cam.setJoystick(dx / max, dy / max);
          e.preventDefault();
        }
      };
      const end = () => { id = null; this.cam.setJoystick(0, 0); knob.style.transform = ""; };
      joy.addEventListener("touchstart", start, { passive: false });
      joy.addEventListener("touchmove", move, { passive: false });
      joy.addEventListener("touchend", end);
    }

    const hold = (id, dir) => {
      const el = this._el(id);
      if (!el) return;
      el.addEventListener("touchstart", (e) => { this.cam.setVertical(dir); e.preventDefault(); }, { passive: false });
      el.addEventListener("touchend", () => this.cam.setVertical(0));
    };
    hold("upBtn", 1);
    hold("downBtn", -1);
  }

  _setMode(mode) {
    const person = mode === "person";
    document.body.classList.toggle("person-active", person);
    this._el("personBtn")?.classList.toggle("active", person);
    this._toggle("personExit", person);
    this._toggle("personHint", person);
    this._toggle("crosshair", person && !this._isTouch());
    this._toggle("personTouch", person && this._isTouch());
    if (person) {
      this._disableMeasure();
      const hint = this._el("personHint");
      setTimeout(() => hint && (hint.hidden = true), 6000);
    }
  }

  _isTouch() {
    return window.matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
  }
  _toggle(id, show) { const el = this._el(id); if (el) el.hidden = !show; }

  /* ---------------- Planos ---------------- */
  _setupPlans() {
    const plans = this.config.plans || [];
    const wrap = this._el("plans");
    const toggleBtn = this._el("plansToggle");
    const menu = this._el("plansMenu");
    const listEl = this._el("plansList");
    const lightbox = this._el("lightbox");
    const tabsEl = this._el("lightboxTabs");
    const stageEl = this._el("lightboxStage");
    const imgEl = this._el("lightboxImg");
    const zoomBtn = this._el("lbZoom");
    const closeBtn = this._el("lbClose");
    if (!plans.length || !wrap) return;
    wrap.hidden = false;

    plans.forEach((p, i) => {
      const li = document.createElement("li");
      li.innerHTML = `<span class="num">${String(i + 1).padStart(2, "0")}</span>
                      <span class="lbl">${p.label}</span><span class="chev">→</span>`;
      li.addEventListener("click", () => { menu.hidden = true; openLB(i); });
      listEl.appendChild(li);

      const b = document.createElement("button");
      b.className = "lb-tab";
      b.textContent = p.label;
      b.addEventListener("click", () => showPlan(i));
      tabsEl.appendChild(b);
    });

    toggleBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      menu.hidden = !menu.hidden;
      toggleBtn.setAttribute("aria-expanded", String(!menu.hidden));
    });
    document.addEventListener("click", (e) => { if (!wrap.contains(e.target)) menu.hidden = true; });

    let zoomed = false;
    const setZoom = (on) => { zoomed = on; stageEl.classList.toggle("zoomed", on); zoomBtn.textContent = on ? "－" : "＋"; };
    const showPlan = (i) => {
      imgEl.src = plans[i].url; imgEl.alt = plans[i].label; setZoom(false);
      [...tabsEl.children].forEach((t, k) => t.classList.toggle("active", k === i));
    };
    const openLB = (i) => { lightbox.hidden = false; showPlan(i); };
    const closeLB = () => { lightbox.hidden = true; setZoom(false); };
    closeBtn.addEventListener("click", closeLB);
    zoomBtn.addEventListener("click", () => setZoom(!zoomed));
    imgEl.addEventListener("click", () => setZoom(!zoomed));
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !lightbox.hidden) closeLB(); });

    // Arrastrar para desplazar cuando el plano está ampliado
    let drag = false, sx = 0, sy = 0, sl = 0, st = 0;
    stageEl.addEventListener("pointerdown", (e) => {
      if (!zoomed) return; drag = true; sx = e.clientX; sy = e.clientY; sl = stageEl.scrollLeft; st = stageEl.scrollTop;
    });
    window.addEventListener("pointermove", (e) => {
      if (!drag) return; stageEl.scrollLeft = sl - (e.clientX - sx); stageEl.scrollTop = st - (e.clientY - sy);
    });
    window.addEventListener("pointerup", () => { drag = false; });
  }

  /* ---------------- Medir ---------------- */
  _setupMeasure() {
    this._m = {
      active: false,
      points: [],
      group: new THREE.Group(),
      raycaster: new THREE.Raycaster(),
      ndc: new THREE.Vector2(),
      markerR: 0.05,
      mid: new THREE.Vector3(),
      hint: this._el("measureHint"),
      hintText: this._el("measureHintText"),
      label: this._el("measureLabel"),
    };
    this.scene.add(this._m.group);
    this._el("measureClear")?.addEventListener("click", () => this._clearMeasure());

    let downX = 0, downY = 0, downT = 0;
    this.dom.addEventListener("pointerdown", (e) => { downX = e.clientX; downY = e.clientY; downT = performance.now(); });
    this.dom.addEventListener("pointerup", (e) => {
      if (!this._m.active || this.cam.mode === "person") return;
      if (e.altKey) return;   // Alt = picker de hotspots
      const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
      if (moved > 6 || performance.now() - downT > 500) return;
      this._m.ndc.x = (e.clientX / window.innerWidth) * 2 - 1;
      this._m.ndc.y = -(e.clientY / window.innerHeight) * 2 + 1;
      this._m.raycaster.setFromCamera(this._m.ndc, this.camera);
      const hits = this._m.raycaster.intersectObjects(this.getMeshes(), true);
      if (hits.length) this._addMeasurePoint(hits[0].point);
    });
  }

  _toggleMeasure() { this._m.active ? this._disableMeasure() : this._enableMeasure(); }
  _enableMeasure() {
    if (this.cam.mode === "person") this.cam.exitPerson();
    this._m.active = true;
    this._el("measureBtn")?.classList.add("active");
    this._m.hint.hidden = false;
    const s = this.getSize();
    this._m.markerR = (Math.max(s.x, s.y, s.z) || 10) * 0.006;
    this._clearMeasure();
  }
  _disableMeasure() {
    if (!this._m) return;
    this._m.active = false;
    this._el("measureBtn")?.classList.remove("active");
    this._m.hint.hidden = true;
    this._m.label.hidden = true;
    this._clearMeasure();
  }
  _clearMeasure() {
    const g = this._m.group;
    this._m.points.length = 0;
    while (g.children.length) { const c = g.children.pop(); c.geometry?.dispose?.(); c.material?.dispose?.(); g.remove(c); }
    this._m.label.hidden = true;
    if (this._m.hintText) this._m.hintText.textContent = "Toca el primer punto sobre el modelo";
  }
  _addMeasurePoint(p) {
    const m = this._m;
    if (m.points.length === 2) this._clearMeasure();
    m.points.push(p.clone());
    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(m.markerR, 20, 20),
      new THREE.MeshBasicMaterial({ color: 0x1c1b19 })
    );
    dot.position.copy(p); m.group.add(dot);
    if (m.points.length === 1) {
      m.hintText.textContent = "Toca el segundo punto";
    } else {
      const g = new THREE.BufferGeometry().setFromPoints(m.points);
      m.group.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0x1c1b19 })));
      const raw = m.points[0].distanceTo(m.points[1]);
      const meters = raw / (this.config.measure.unitsPerMeter || 1);
      m.label.innerHTML = `${meters.toFixed(this.config.measure.decimals)} ${this.config.measure.unit}<small>${raw.toFixed(2)} u</small>`;
      m.label.hidden = false;
      m.hintText.textContent = "Toca de nuevo para medir otra distancia";
    }
  }

  /* ---------------- Update por frame (etiqueta de medida) ---------------- */
  update() {
    const m = this._m;
    if (!m || m.points.length !== 2 || m.label.hidden) return;
    m.mid.addVectors(m.points[0], m.points[1]).multiplyScalar(0.5).project(this.camera);
    const x = (m.mid.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-m.mid.y * 0.5 + 0.5) * window.innerHeight;
    m.label.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px)`;
  }
}
