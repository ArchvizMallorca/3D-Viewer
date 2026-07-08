/* =========================================================
   modelLoader.js · carga y preparación del modelo GLB
   - Aplica sombras
   - Detecta materiales translúcidos (cristales)
   - Apoya el modelo en el suelo (y = 0)
   - Devuelve bounds (box, size, center) y la lista de mallas
   ========================================================= */

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

function prepareMaterials(mesh) {
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  let hasGlass = false;

  mats.forEach((m) => {
    if (!m) return;
    const translucent =
      m.transparent === true ||
      (typeof m.opacity === "number" && m.opacity < 1) ||
      (typeof m.transmission === "number" && m.transmission > 0);

    if (translucent) {
      hasGlass = true;
      m.transparent = true;
      m.side = THREE.DoubleSide;      // cristal visible por dentro y por fuera
      m.depthWrite = false;           // evita parpadeos por orden de dibujado
      if (m.opacity === 1) m.opacity = 0.35;
      m.needsUpdate = true;
    } else {
      m.side = THREE.FrontSide;
    }
  });

  return hasGlass;
}

/**
 * Carga un modelo GLB.
 * @param {string} url
 * @param {(evt:ProgressEvent)=>void} [onProgress]
 * @returns {Promise<{model:THREE.Object3D, meshes:THREE.Mesh[], box:THREE.Box3, size:THREE.Vector3, center:THREE.Vector3}>}
 */
export function loadModel(url, onProgress) {
  return new Promise((resolve, reject) => {
    new GLTFLoader().load(
      url,
      (gltf) => {
        const model = gltf.scene;
        const meshes = [];
        const cameras = [];      // cámaras de 3ds Max exportadas (CAM_START, etc.)

        model.traverse((o) => {
          if (o.isCamera) { cameras.push(o); return; }
          if (!o.isMesh) return;
          o.castShadow = true;
          o.receiveShadow = true;
          const hasGlass = prepareMaterials(o);
          if (hasGlass) o.castShadow = false;   // el cristal no da sombra sólida
          meshes.push(o);
        });

        // Apoyar el modelo sobre el suelo (y = 0)
        const pre = new THREE.Box3().setFromObject(model);
        model.position.y -= pre.min.y;
        model.updateMatrixWorld(true);   // para leer bien la posición de las cámaras

        // Bounds definitivos en coordenadas de mundo
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());

        resolve({ model, meshes, cameras, box, size, center });
      },
      onProgress,
      reject
    );
  });
}
