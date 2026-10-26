// Graphics quality presets (low / medium / high) + first-load auto detection.
export const PRESETS = {
  low: {
    name: 'low', pixelRatioMax: 1, pixelRatioScale: 0.8, shadows: false, shadowMap: 1024, shadowExtent: 55,
    outlines: true, propOutlines: false, crowdOutlines: false, kartInkDist: 45, bloom: false, terrainDetail: 0.55, particles: 0.45, props: 0.55, antialias: false, fogScale: 0.8,
  },
  medium: {
    name: 'medium', pixelRatioMax: 1.25, pixelRatioScale: 1, shadows: true, shadowMap: 1024, shadowExtent: 60,
    outlines: true, propOutlines: false, crowdOutlines: false, kartInkDist: 70, bloom: false, terrainDetail: 0.75, particles: 0.8, props: 0.8, antialias: true, fogScale: 1,
  },
  high: {
    name: 'high', pixelRatioMax: 2, pixelRatioScale: 1, shadows: true, shadowMap: 2048, shadowExtent: 75,
    outlines: true, propOutlines: true, crowdOutlines: true, kartInkDist: 140, bloom: true, terrainDetail: 1, particles: 1, props: 1, antialias: true, fogScale: 1,
  },
};

/** Guess a preset from the device: phones/tablets -> low, integrated or software GPUs -> medium, else high. */
export function detectPreset() {
  try {
    const ua = navigator.userAgent || '';
    const touch = (navigator.maxTouchPoints || 0) > 0 && /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
    if (touch || /Android|iPhone|iPad|iPod/i.test(ua)) return 'low';
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return 'low';
    let renderer = '';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (ext) renderer = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    if (/SwiftShader|llvmpipe|softpipe|Software/i.test(renderer)) return 'low';
    if (/Intel|Mali|Adreno|PowerVR|Apple GPU|Iris|UHD|HD Graphics|Radeon\(TM\) Graphics|Vega \d+ Graphics/i.test(renderer)) return 'medium';
    if ((navigator.hardwareConcurrency || 8) <= 4) return 'medium';
    return 'high';
  } catch (e) {
    return 'medium';
  }
}

export function resolvePreset(setting, auto) {
  const name = setting && setting !== 'auto' ? setting : (auto || 'medium');
  return PRESETS[name] || PRESETS.medium;
}
