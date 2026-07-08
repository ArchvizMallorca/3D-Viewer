/* =========================================================
   sun.js · sistema de iluminación solar con sombras
   - Luz direccional que recorre un arco (amanecer→cenit→atardecer)
   - Sombra proyectada sobre el suelo y la propia casa
   - Color/intensidad cálidos al amanecer/atardecer, neutros al mediodía
   - "Hora del día" (time 0..1) y "Orientación" (grados)
   ========================================================= */

import * as THREE from "three";

export class Sun {
  /**
   * @param {THREE.Scene} scene
   * @param {object} config  CONFIG global (usa config.sun)
   */
  constructor(scene, config) {
    const s = config.sun || {};
    this.center = new THREE.Vector3();
    this.radius = 30;
    this.time = s.time ?? 0.62;            // 0 amanece · 0.5 mediodía · 1 atardece
    this.orientation = s.orientation ?? 30; // grados (de dónde viene el sol)
    this.peakElevation = THREE.MathUtils.degToRad(s.peakElevation ?? 72);

    const light = new THREE.DirectionalLight(0xfff4e2, 3.0);
    light.castShadow = true;
    light.shadow.mapSize.set(2048, 2048);
    light.shadow.bias = -0.0004;
    light.shadow.normalBias = 0.03;
    scene.add(light);
    scene.add(light.target);
    this.light = light;

    this._dir = new THREE.Vector3();
    this._warm = new THREE.Color(0xffb175);   // amanecer/atardecer
    this._noon = new THREE.Color(0xfff6e8);   // mediodía
    this._apply();
  }

  /** Ajusta la cámara de sombra al tamaño del modelo. */
  frame(box) {
    const sph = box.getBoundingSphere(new THREE.Sphere());
    this.center.copy(sph.center);
    this.radius = Math.max(sph.radius, 1);

    const c = this.light.shadow.camera;
    const half = this.radius * 1.35;
    c.left = -half; c.right = half; c.top = half; c.bottom = -half;
    c.near = 0.1; c.far = this.radius * 8;
    c.updateProjectionMatrix();
    this._apply();
  }

  setTime(t) { this.time = Math.min(1, Math.max(0, t)); this._apply(); }
  setOrientation(deg) { this.orientation = deg; this._apply(); }
  getState() { return { time: this.time, orientation: this.orientation }; }

  _apply() {
    const t = this.time;
    const dayAngle = t * Math.PI;                        // 0..π
    const el = Math.sin(dayAngle) * this.peakElevation;  // altura sobre el horizonte
    const az = (-Math.PI / 2 + t * Math.PI) +
               THREE.MathUtils.degToRad(this.orientation);

    const cosEl = Math.cos(el);
    this._dir.set(cosEl * Math.sin(az), Math.sin(el), cosEl * Math.cos(az));

    const dist = this.radius * 3;
    this.light.position.copy(this.center).addScaledVector(this._dir, dist);
    this.light.target.position.copy(this.center);
    this.light.target.updateMatrixWorld();

    // Color e intensidad según la altura del sol (h: 0 horizonte, 1 cenit)
    const h = Math.max(0, Math.sin(el));
    this.light.color.copy(this._warm).lerp(this._noon, Math.min(1, h * 1.5));
    this.light.intensity = 1.1 + h * 2.3;
  }
}
