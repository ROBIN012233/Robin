import * as THREE from '../vendor/three.module.js';

const TIER = {
  high: { blobs: 3, period: 20, particles: 6800, pixelRatio: 2, bloom: true },
  medium: { blobs: 2, period: 25, particles: 2000, pixelRatio: 1.5, bloom: false },
  low: { blobs: 2, period: 0, particles: 300, pixelRatio: 1, bloom: false }
};

function createCanvas() {
  const old = document.getElementById('light-canvas');
  if (old) old.remove();
  const canvas = document.createElement('canvas');
  canvas.id = 'light-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.insertBefore(canvas, document.body.firstChild);
  return canvas;
}

export class LightSystem {
  constructor(canvas) {
    this.canvas = canvas;
    this.currentKey = 'initial';
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.postScene = null;
    this.postCamera = null;
    this.target = null;
    this.blobs = [];
    this.particles = null;
    this.clock = new THREE.Clock();
    this.frame = 0;
    this.tier = 'high';
    this.accent = '#7797ff';
    this.static = false;
    this.disposed = true;
    this.onResize = () => this.resize();
    this.onVisibility = () => {
      if (document.hidden) {
        if (this.frame) cancelAnimationFrame(this.frame);
        this.frame = 0;
      } else if (!this.static && !this.disposed && !this.frame) {
        this.clock.start();
        this.animate();
      }
    };
  }

  setOptions({ enabled, tier, accent }) {
    const nextTier = TIER[tier] ? tier : 'high';
    const nextAccent = accent || '#7797ff';
    const key = enabled ? `${nextTier}|${nextAccent}` : 'off';
    if (key === this.currentKey) return;
    this.currentKey = key;
    this.teardown();
    if (!enabled) return;
    this.tier = nextTier;
    this.accent = nextAccent;
    this.canvas = createCanvas();
    try {
      this.setup();
    } catch (error) {
      console.error('[light] WebGL setup failed', error);
      this.teardown();
      document.body.dataset.webgl = 'unavailable';
    }
  }

  setup() {
    const config = TIER[this.tier];
    const renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      antialias: false,
      powerPreference: 'high-performance',
      premultipliedAlpha: true
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, config.pixelRatio));
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.clock = new THREE.Clock();
    this.static = this.tier === 'low';
    this.disposed = false;

    const accent = new THREE.Color(this.accent);
    const colorB = accent.clone().offsetHSL(0.07, 0.03, 0.06);
    const colorC = accent.clone().offsetHSL(-0.08, -0.02, 0.1);

    const aspect = window.innerWidth / Math.max(1, window.innerHeight);
    const blobGeometry = new THREE.PlaneGeometry(1, 1);
    const blobPositions = [
      [-0.45, 0.18, 1.15],
      [0.48, -0.22, 0.95],
      [-0.1, -0.55, 0.8],
      [0.2, 0.55, 0.7]
    ];
    const blobColors = [accent, colorB, colorC, colorB];

    for (let i = 0; i < config.blobs; i += 1) {
      const material = new THREE.ShaderMaterial({
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uColor: { value: blobColors[i].clone() },
          uOpacity: { value: this.tier === 'low' ? 0.22 : 0.36 },
          uPhase: { value: Math.random() * Math.PI * 2 }
        },
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 uColor;
          uniform float uOpacity;
          varying vec2 vUv;
          void main() {
            vec2 p = vUv - 0.5;
            float d = length(p);
            float a = smoothstep(0.5, 0.03, d);
            gl_FragColor = vec4(uColor, a * uOpacity);
          }
        `
      });
      const mesh = new THREE.Mesh(blobGeometry, material);
      const [x, y, size] = blobPositions[i];
      mesh.position.set(x, y, 0);
      mesh.scale.set(size / Math.max(0.01, aspect), size, 1);
      mesh.userData = {
        baseX: x,
        baseY: y,
        size,
        phase: Math.random() * Math.PI * 2
      };
      this.scene.add(mesh);
      this.blobs.push(mesh);
    }
    this.blobGeometry = blobGeometry;

    this.particles = this.createParticles(config.particles, accent, colorB);
    this.scene.add(this.particles.mesh);

    if (config.bloom) this.setupBloom();
    else {
      this.postScene = null;
      this.target = null;
    }

    window.addEventListener('resize', this.onResize);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.onContextLost = (event) => {
      event.preventDefault();
      if (event.target !== this.canvas) return;
      this.teardown();
    };
    this.canvas.addEventListener('webglcontextlost', this.onContextLost);

    this.resize();
    if (this.static) {
      this.renderFrame(0);
    } else {
      this.animate();
    }
  }

  createParticles(count, colorA, colorB) {
    const base = new THREE.PlaneGeometry(1, 1);
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.index = base.index;
    geometry.setAttribute('position', base.getAttribute('position'));
    geometry.setAttribute('uv', base.getAttribute('uv'));
    geometry.instanceCount = count;

    const offsets = new Float32Array(count * 2);
    const phases = new Float32Array(count);
    const sizes = new Float32Array(count);
    const tints = new Float32Array(count);
    for (let i = 0; i < count; i += 1) {
      offsets[i * 2] = Math.random() * 2.3 - 1.15;
      offsets[i * 2 + 1] = Math.random() * 2.3 - 1.15;
      phases[i] = Math.random() * Math.PI * 2;
      sizes[i] = 0.7 + Math.random() * 2.1;
      tints[i] = Math.random();
    }
    geometry.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offsets, 2));
    geometry.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));
    geometry.setAttribute('aSize', new THREE.InstancedBufferAttribute(sizes, 1));
    geometry.setAttribute('aTint', new THREE.InstancedBufferAttribute(tints, 1));

    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
        uColorA: { value: colorA.clone().offsetHSL(0, -0.2, 0.25) },
        uColorB: { value: colorB.clone() },
        uMotion: { value: this.static ? 0 : 1 }
      },
      vertexShader: `
        uniform float uTime;
        uniform vec2 uResolution;
        uniform float uMotion;
        attribute vec2 aOffset;
        attribute float aPhase;
        attribute float aSize;
        attribute float aTint;
        varying vec2 vUv;
        varying vec3 vColor;
        uniform vec3 uColorA;
        uniform vec3 uColorB;
        void main() {
          float t = uTime * uMotion;
          float dx = sin(t * 0.045 + aPhase) * 0.035;
          float dy = cos(t * 0.037 + aPhase * 1.7) * 0.045;
          vec2 center = aOffset + vec2(dx, dy);
          vec2 px = vec2(aSize * 2.0 / uResolution.x, aSize * 2.0 / uResolution.y);
          vec2 pos = center + position.xy * px;
          gl_Position = vec4(pos, 0.0, 1.0);
          vUv = uv;
          vColor = mix(uColorA, uColorB, aTint);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        varying vec3 vColor;
        void main() {
          float d = length(vUv - 0.5);
          float a = smoothstep(0.5, 0.02, d);
          gl_FragColor = vec4(vColor, a * 0.32);
        }
      `
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    return { mesh, material, geometry };
  }

  setupBloom() {
    this.target = new THREE.WebGLRenderTarget(
      Math.max(2, Math.floor(window.innerWidth * this.renderer.getPixelRatio())),
      Math.max(2, Math.floor(window.innerHeight * this.renderer.getPixelRatio())),
      {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        type: THREE.UnsignedByteType
      }
    );
    this.target.texture.colorSpace = THREE.SRGBColorSpace;
    this.postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.postScene = new THREE.Scene();
    this.postMaterial = new THREE.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      transparent: true,
      uniforms: {
        tDiffuse: { value: this.target.texture },
        uTexel: { value: new THREE.Vector2(1 / this.target.width, 1 / this.target.height) },
        uStrength: { value: 0.8 }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform vec2 uTexel;
        uniform float uStrength;
        varying vec2 vUv;
        void main() {
          vec4 base = texture2D(tDiffuse, vUv);
          vec4 glow = vec4(0.0);
          vec2 o = uTexel * 2.2;
          glow += texture2D(tDiffuse, vUv + vec2(o.x, 0.0));
          glow += texture2D(tDiffuse, vUv + vec2(-o.x, 0.0));
          glow += texture2D(tDiffuse, vUv + vec2(0.0, o.y));
          glow += texture2D(tDiffuse, vUv + vec2(0.0, -o.y));
          glow += texture2D(tDiffuse, vUv + vec2(o.x, o.y));
          glow += texture2D(tDiffuse, vUv + vec2(-o.x, -o.y));
          glow += texture2D(tDiffuse, vUv + vec2(o.x, -o.y));
          glow += texture2D(tDiffuse, vUv + vec2(-o.x, o.y));
          glow /= 8.0;
          vec3 color = base.rgb + max(glow.rgb - 0.14, 0.0) * uStrength;
          gl_FragColor = vec4(color, max(base.a, glow.a * 0.75));
        }
      `
    });
    this.postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.postMaterial));
  }

  resize() {
    if (!this.renderer || !this.scene) return;
    const width = window.innerWidth;
    const height = window.innerHeight;
    const config = TIER[this.tier];
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, config.pixelRatio));
    this.renderer.setSize(width, height, false);
    const aspect = width / Math.max(1, height);
    for (const mesh of this.blobs) {
      const data = mesh.userData;
      mesh.scale.set(data.size / Math.max(0.01, aspect), data.size, 1);
    }
    if (this.particles) {
      this.particles.material.uniforms.uResolution.value.set(width, height);
    }
    if (this.target) {
      const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
      this.target.setSize(size.x, size.y);
      this.postMaterial.uniforms.uTexel.value.set(1 / Math.max(1, size.x), 1 / Math.max(1, size.y));
    }
    if (this.static) this.renderFrame(this.clock.getElapsedTime());
  }

  animate() {
    if (this.disposed) return;
    this.frame = requestAnimationFrame(() => this.animate());
    const elapsed = this.clock.getElapsedTime();
    this.update(elapsed);
    this.renderFrame(elapsed);
  }

  update(elapsed) {
    const config = TIER[this.tier];
    if (this.particles) this.particles.material.uniforms.uTime.value = elapsed;
    if (this.tier === 'low') return;
    const angle = (Math.PI * 2) / config.period;
    for (const mesh of this.blobs) {
      const { baseX, baseY, phase } = mesh.userData;
      mesh.position.x = baseX + Math.sin(elapsed * angle + phase) * 0.085;
      mesh.position.y = baseY + Math.cos(elapsed * angle * 0.72 + phase) * 0.06;
    }
  }

  renderFrame() {
    if (!this.renderer || !this.scene) return;
    if (this.postScene && this.target) {
      this.renderer.setRenderTarget(this.target);
      this.renderer.clear();
      this.renderer.render(this.scene, this.camera);
      this.renderer.setRenderTarget(null);
      this.renderer.clear();
      this.renderer.render(this.postScene, this.postCamera);
    } else {
      this.renderer.setRenderTarget(null);
      this.renderer.clear();
      this.renderer.render(this.scene, this.camera);
    }
  }

  teardown() {
    this.disposed = true;
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('visibilitychange', this.onVisibility);
    if (this.canvas && this.onContextLost) {
      this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    }
    if (this.scene) {
      this.scene.traverse((object) => {
        if (object.geometry) object.geometry.dispose();
        if (object.material) {
          if (Array.isArray(object.material)) object.material.forEach((m) => m.dispose());
          else object.material.dispose();
        }
      });
    }
    if (this.postScene) {
      this.postScene.traverse((object) => {
        if (object.geometry) object.geometry.dispose();
        if (object.material) object.material.dispose();
      });
    }
    if (this.target) this.target.dispose();
    if (this.renderer) {
      this.renderer.dispose();
      try { this.renderer.forceContextLoss(); } catch { /* ignore */ }
    }
    if (this.canvas) this.canvas.remove();
    this.canvas = null;
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.postScene = null;
    this.postCamera = null;
    this.postMaterial = null;
    this.target = null;
    this.blobs = [];
    this.particles = null;
  }
}
