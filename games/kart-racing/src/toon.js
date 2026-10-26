// "Ink & Paint" materials: 3-band toon ramp, rim light, unlit "glow" vertices, inverted-hull ink outlines.
import * as THREE from 'three';

export const INK = new THREE.Color(0x2b1d2e);

let _ramp = null;
/** Shared 3-step gradient map (shadow / mid / light). */
export function toonRamp() {
  if (_ramp) return _ramp;
  const data = new Uint8Array([92, 92, 92, 255, 178, 178, 178, 255, 255, 255, 255, 255]);
  _ramp = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  _ramp.minFilter = THREE.NearestFilter; _ramp.magFilter = THREE.NearestFilter; _ramp.generateMipmaps = false;
  _ramp.needsUpdate = true;
  return _ramp;
}

/** Global animation clock for shader-animated props (main loop sets TIME.value = seconds). */
export const TIME = { value: 0 };

/** Global rim-light settings (tracks set this: e.g. stronger cool rim at night). */
export const RIM = { color: { value: new THREE.Color(0xfff1d6) }, strength: { value: 0.35 } };

/**
 * Toon material. opts: any MeshToonMaterial params + { rim = true, glowAttr = false }.
 * With glowAttr, a vertex attribute `glow` (0..1) blends towards the unlit vertex colour (eyes, lamps).
 */
export function toonMaterial(opts = {}) {
  const { rim = true, glowAttr = false, vertex = null, cacheKey = '', ...params } = opts;
  const m = new THREE.MeshToonMaterial({ gradientMap: toonRamp(), ...params });
  if (rim || glowAttr || vertex) {
    m.onBeforeCompile = (sh) => {
      sh.uniforms.rimColor = RIM.color;
      sh.uniforms.rimStrength = rim ? RIM.strength : { value: 0 };
      sh.uniforms.uTime = TIME;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;');
      if (vertex) sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + vertex);
      if (glowAttr) {
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nattribute float glow;\nvarying float vGlow;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = glow;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vGlow;');
      }
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 rimColor;\nuniform float rimStrength;')
        .replace('#include <opaque_fragment>', `
          {
            vec3 Vd = normalize( vViewPosition );
            float ndv = 1.0 - max( dot( normal, Vd ), 0.0 );
            float r = smoothstep( 0.62, 0.7, ndv ) * rimStrength;
            outgoingLight += rimColor * r * ( 0.35 + 0.65 * diffuseColor.rgb );
            ${glowAttr ? 'outgoingLight = mix( outgoingLight, diffuseColor.rgb * 1.15, vGlow );' : ''}
          }
          #include <opaque_fragment>`);
    };
    m.customProgramCacheKey = () => `toon-${rim ? 1 : 0}-${glowAttr ? 1 : 0}-${cacheKey}-${vertex ? vertex.length : 0}`;
  }
  return m;
}

/**
 * Ink outline material for inverted-hull meshes. Displaces vertices along attribute `outlineN`
 * (smoothed normal * per-part scale), skinning-aware; thickness keeps a minimum on-screen width with distance.
 */
export function outlineMaterial({ width = 0.022, color = INK, minPixelsAt = 9, maxScale = 6, fadeStart = 130, fadeEnd = 230, vertex = null, cacheKey = '' } = {}) {
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  m.userData.width = { value: width };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.outlineWidth = m.userData.width;
    sh.uniforms.uTime = TIME;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 outlineN;\nuniform float outlineWidth;\nuniform float uTime;')
      .replace('#include <skinning_vertex>', `#include <skinning_vertex>
        ${vertex || ''}
        {
          vec3 oN = outlineN;
          #ifdef USE_SKINNING
            oN = ( skinMatrix * vec4( oN, 0.0 ) ).xyz;
          #endif
          vec4 mvp0 = modelViewMatrix * vec4( transformed, 1.0 );
          float dist = max( 1.0, -mvp0.z );
          transformed += oN * outlineWidth * clamp( dist / ${minPixelsAt.toFixed(1)}, 1.0, ${maxScale.toFixed(1)} ) * ( 1.0 - smoothstep( ${fadeStart.toFixed(1)}, ${fadeEnd.toFixed(1)}, dist ) );
        }`);
  };
  m.customProgramCacheKey = () => 'ink-outline-' + cacheKey + (vertex ? vertex.length : 0);
  return m;
}

/** Make an outline mesh that shares geometry (and skeleton) with `mesh`. Geometry must have `outlineN`. */
export function addOutline(mesh, mat) {
  let o;
  if (mesh.isSkinnedMesh) {
    o = new THREE.SkinnedMesh(mesh.geometry, mat);
    o.bind(mesh.skeleton, mesh.bindMatrix);
  } else if (mesh.isInstancedMesh) {
    o = new THREE.InstancedMesh(mesh.geometry, mat, mesh.count);
    o.instanceMatrix = mesh.instanceMatrix;
  } else o = new THREE.Mesh(mesh.geometry, mat);
  o.castShadow = false; o.receiveShadow = false;
  o.renderOrder = mesh.renderOrder;
  o.name = (mesh.name || '') + ':ink';
  o.frustumCulled = mesh.frustumCulled;
  mesh.add(o);
  return o;
}

/** Fill `outlineN` for a plain geometry from its (smoothed) normals. */
export function computeOutlineNormals(geo, scale = 1) {
  const pos = geo.attributes.position, nrm = geo.attributes.normal;
  if (!nrm) geo.computeVertexNormals();
  const n = pos.count; const acc = new Map(); const out = new Float32Array(n * 3);
  const key = (i) => `${Math.round(pos.getX(i) * 1e3)},${Math.round(pos.getY(i) * 1e3)},${Math.round(pos.getZ(i) * 1e3)}`;
  for (let i = 0; i < n; i++) { const k = key(i); let a = acc.get(k); if (!a) acc.set(k, (a = [0, 0, 0])); a[0] += geo.attributes.normal.getX(i); a[1] += geo.attributes.normal.getY(i); a[2] += geo.attributes.normal.getZ(i); }
  for (let i = 0; i < n; i++) { const a = acc.get(key(i)); const l = Math.hypot(a[0], a[1], a[2]) || 1; out[i * 3] = a[0] / l * scale; out[i * 3 + 1] = a[1] / l * scale; out[i * 3 + 2] = a[2] / l * scale; }
  geo.setAttribute('outlineN', new THREE.BufferAttribute(out, 3));
  return geo;
}
