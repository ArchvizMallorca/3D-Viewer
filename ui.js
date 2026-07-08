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
    this.sun = o.sun;
    this.dom = o.dom;
    this.getMeshes = o.getMeshes;
    this.getSize = o.getSize;
    this.config = o.config;

    this._el = (id) => document.getElementById(id);

    this._setupButtons();
    this._setupPlans();
    this._setupMeasure();
    this._setupPersonDom();
    this._setupSun();
    this._setupFocal();

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
    this._el("personMeasureBtn")?.addEventListener("click", () => this._toggleMeasure());
  }

  /* ---------------- Distancia focal (zoom 18–36 mm) ---------------- */
  _setupFocal() {
    const range = this._el("focalRange");
    const lbl = this._el("focalLbl");
    if (!range) return;
    const apply = () => {
      const mm = Number(range.value);
      this.cam.setFocalLength(mm);
      if (lbl) lbl.textContent = mm + " mm";
    };
    range.addEventListener("input", apply);
    apply();   // aplica el valor inicial (24 mm)
  }

  /* ---------------- Sol ---------------- */
  _setupSun() {
    const btn = this._el("sunBtn");
    const panel = this._el("sunPanel");
    const time = this._el("sunTime");
    const orient = this._el("sunOrient");
    if (!btn || !panel || !this.sun) return;

    const st = this.sun.getState();
    if (time) time.value = Math.round(st.time * 100);
    if (orient) orient.value = Math.round(st.orientation);

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      panel.hidden = !panel.hidden;
      btn.classList.toggle("active", !panel.hidden);
    });
    document.addEventListener("click", (e) => {
      if (panel.hidden) return;
      if (!panel.contains(e.target) && !btn.contains(e.target)) {
        panel.hidden = true; btn.classList.remove("active");
      }
    });
    time?.addEventListener("input", () => this.sun.setTime(time.value / 100));
    orient?.addEventListener("input", () => this.sun.setOrientation(Number(orient.value)));
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
    // La medición sigue disponible en modo persona (botón propio)
    this._toggle("personMeasureBtn", person);
    this._el("personMeasureBtn")?.classList.toggle("active", this._m?.active);
    if (person) {
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

  /* ---------------- Medir (con snap a vértices) ---------------- */
  _setupMeasure() {
    // Indicador de snap: pequeño diamante que resalta el vértice bajo el cursor
    const indicator = new THREE.Mesh(
      new THREE.OctahedronGeometry(1, 0),
      new THREE.MeshBasicMaterial({ color: 0x2e7d5b, depthTest: false, transparent: true, opacity: 0.95 })
    );
    indicator.renderOrder = 999;
    indicator.visible = false;
    this.scene.add(indicator);

    this._m = {
      active: false,
      points: [],
      markers: [],                 // esferas de los puntos colocados
      group: new THREE.Group(),
      indicator,
      raycaster: new THREE.Raycaster(),
      ndc: new THREE.Vector2(),
      mid: new THREE.Vector3(),
      hint: this._el("measureHint"),
      hintText: this._el("measureHintText"),
      label: this._el("measureLabel"),
    };
    this.scene.add(this._m.group);
    this._el("measureClear")?.addEventListener("click", () => this._clearMeasure());

    // Hover: mueve el indicador al vértice más cercano (también en modo persona)
    this.dom.addEventListener("pointermove", (e) => {
      if (!this._m.active) { this._m.indicator.visible = false; return; }
      const snap = this._snapAt(e.clientX, e.clientY);
      if (snap) { this._m.indicator.visible = true; this._m.indicator.position.copy(snap); }
      else this._m.indicator.visible = false;
    });

    // Clic (sin arrastrar) → coloca el punto ya "snapeado"
    let downX = 0, downY = 0, downT = 0;
    this.dom.addEventListener("pointerdown", (e) => { downX = e.clientX; downY = e.clientY; downT = performance.now(); });
    this.dom.addEventListener("pointerup", (e) => {
      if (!this._m.active) return;
      if (e.altKey) return;   // Alt = picker de hotspots
      const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
      if (moved > 6 || performance.now() - downT > 500) return;
      const snap = this._snapAt(e.clientX, e.clientY);
      if (snap) this._addMeasurePoint(snap);
    });
  }

  /** Devuelve el vértice más cercano al punto tocado, o null. */
  _snapAt(cx, cy) {
    const m = this._m;
    m.ndc.x = (cx / window.innerWidth) * 2 - 1;
    m.ndc.y = -(cy / window.innerHeight) * 2 + 1;
    m.raycaster.setFromCamera(m.ndc, this.camera);
    const hits = m.raycaster.intersectObjects(this.getMeshes(), true);
    if (!hits.length) return null;
    const hit = hits[0];
    const geom = hit.object.geometry, face = hit.face;
    if (!geom || !face || !geom.attributes.position) return hit.point.clone();

    const pos = geom.attributes.position;
    const cands = [face.a, face.b, face.c].map((i) =>
      hit.object.localToWorld(new THREE.Vector3().fromBufferAttribute(pos, i)));
    // vértice de la cara más cercano al punto exacto tocado
    let best = cands[0], bd = best.distanceToSquared(hit.point);
    for (let i = 1; i < 3; i++) {
      const d = cands[i].distanceToSquared(hit.point);
      if (d < bd) { bd = d; best = cands[i]; }
    }
    return best;
  }

  _toggleMeasure() { this._m.active ? this._disableMeasure() : this._enableMeasure(); }
  _syncMeasureBtns() {
    this._el("measureBtn")?.classList.toggle("active", this._m.active);
    this._el("personMeasureBtn")?.classList.toggle("active", this._m.active);
  }
  _enableMeasure() {
    // Funciona igual en vista orbital y en modo persona
    this._m.active = true;
    this._m.hint.hidden = false;
    this._syncMeasureBtns();
    this._clearMeasure();
  }
  _disableMeasure() {
    if (!this._m) return;
    this._m.active = false;
    this._m.hint.hidden = true;
    this._m.label.hidden = true;
    this._m.indicator.visible = false;
    this._syncMeasureBtns();
    this._clearMeasure();
  }
  _clearMeasure() {
    const g = this._m.group;
    this._m.points.length = 0;
    this._m.markers.length = 0;
    while (g.children.length) { const c = g.children.pop(); c.geometry?.dispose?.(); c.material?.dispose?.(); g.remove(c); }
    this._m.label.hidden = true;
    if (this._m.hintText) this._m.hintText.textContent = "Apunta a una esquina y toca el primer punto";
  }
  _addMeasurePoint(p) {
    const m = this._m;
    if (m.points.length === 2) this._clearMeasure();
    m.points.push(p.clone());

    // Marcador pequeño (radio base 1; se escala a tamaño de pantalla en update)
    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(1, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0x1c1b19, depthTest: false })
    );
    dot.renderOrder = 998;
    dot.position.copy(p);
    m.group.add(dot);
    m.markers.push(dot);

    if (m.points.length === 1) {
      m.hintText.textContent = "Apunta a otra esquina y toca el segundo punto";
    } else {
      const g = new THREE.BufferGeometry().setFromPoints(m.points);
      const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0x1c1b19, depthTest: false }));
      line.renderOrder = 997;
      m.group.add(line);
      const raw = m.points[0].distanceTo(m.points[1]);
      const meters = raw / (this.config.measure.unitsPerMeter || 1);
      m.label.innerHTML = `${meters.toFixed(this.config.measure.decimals)} ${this.config.measure.unit}<small>${raw.toFixed(2)} u</small>`;
      m.label.hidden = false;
      m.hintText.textContent = "Toca de nuevo para medir otra distancia";
    }
  }

  /** Radio en mundo para que un objeto se vea con ~pixels px a cualquier distancia. */
  _screenScale(pos, pixels) {
    const d = this.camera.position.distanceTo(pos);
    const f = this.camera.fov * Math.PI / 180;
    return pixels * d * Math.tan(f / 2) / window.innerHeight;
  }

  /* ---------------- Update por frame ---------------- */
  update() {
    const m = this._m;
    if (!m) return;

    // Marcadores e indicador: tamaño constante en pantalla
    for (const dot of m.markers) dot.scale.setScalar(this._screenScale(dot.position, 5));
    if (m.indicator.visible) m.indicator.scale.setScalar(this._screenScale(m.indicator.position, 7));

    // Etiqueta de distancia en el punto medio
    if (m.points.length === 2 && !m.label.hidden) {
      m.mid.addVectors(m.points[0], m.points[1]).multiplyScalar(0.5).project(this.camera);
      const x = (m.mid.x * 0.5 + 0.5) * window.innerWidth;
      const y = (-m.mid.y * 0.5 + 0.5) * window.innerHeight;
      m.label.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px)`;
    }
  }
}
