/* Visor 3D de P&R Flaco's (Three.js).
   - Pizzas redondas: modelo 3D real (masa, borde inflado, tabla de madera) texturizado con la foto
     reproyectada a vista cenital + relieve de ingredientes. Giro libre de 360°, zoom y paneo.
   - Resto de platos: relieve 3D a partir del mapa de profundidad de la foto, con giro limitado. */
import {
  WebGLRenderer, Scene, PerspectiveCamera, Group, Mesh, BufferGeometry, BufferAttribute, PlaneGeometry, CylinderGeometry,
  MeshStandardMaterial, ShadowMaterial, TextureLoader, CanvasTexture, SRGBColorSpace, ACESFilmicToneMapping,
  PCFShadowMap, HemisphereLight, DirectionalLight, PMREMGenerator, Vector2, Vector3, Raycaster, MathUtils, Spherical,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const loader = new TextureLoader();
const loadTex = url => new Promise((res, rej) => loader.load(url, res, undefined, rej));
const loadImg = url => new Promise((res, rej) => { const i = new Image(); i.decoding = 'async'; i.onload = () => res(i); i.onerror = rej; i.src = url; });
function pixels(img, n) {
  const c = document.createElement('canvas'); c.width = c.height = n;
  const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, n, n);
  const d = x.getImageData(0, 0, n, n).data, out = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) out[i] = d[i * 4] / 255;
  return { n, d: out };
}
function sample(m, u, v) { // bilinear, u,v in [0,1], v=0 top row
  const n = m.n, x = MathUtils.clamp(u, 0, 1) * (n - 1), y = MathUtils.clamp(v, 0, 1) * (n - 1);
  const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(n - 1, x0 + 1), y1 = Math.min(n - 1, y0 + 1), fx = x - x0, fy = y - y0;
  const a = m.d[y0 * n + x0], b = m.d[y0 * n + x1], c = m.d[y1 * n + x0], d = m.d[y1 * n + x1];
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
}
const smooth = (a, b, x) => { const t = MathUtils.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/* ---------- Geometría de pizza: superficie superior + cornicione (tubo) + base ---------- */
function pizzaGeometry(relief, lowEnd) {
  const A = lowEnd ? 160 : 224;           // segmentos angulares
  const rr = 0.075, zr = rr, base = 0.082, amp = 0.032;
  const rows = [];
  const NT = lowEnd ? 70 : 100;
  for (let i = 0; i <= NT; i++) { const s = (1 - rr) * Math.pow(i / NT, 0.85); rows.push({ r: s, kind: 'top' }); }
  const NTU = lowEnd ? 18 : 26;
  for (let j = 1; j <= NTU; j++) { const a = Math.PI / 2 - Math.PI * j / NTU; rows.push({ r: (1 - rr) + rr * Math.cos(a), y: zr + rr * Math.sin(a), a, kind: 'tube' }); }
  for (let k = 1; k <= 6; k++) rows.push({ r: (1 - rr) * (1 - k / 6), y: 0, kind: 'bottom' });
  const cols = A + 1, nv = rows.length * cols;
  const pos = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), col = new Float32Array(nv * 3);
  let p = 0;
  rows.forEach(row => {
    for (let c = 0; c < cols; c++) {
      const th = (c / A) * Math.PI * 2, cx = Math.cos(th), sz = Math.sin(th);
      let r = row.r, y, tr, shade = 1;
      if (row.kind === 'top') {
        const s = r;
        // radio en la textura: el centro se mapea tal cual; la subida al borde comprime la zona salsa→corteza
        tr = s <= 0.76 ? s * 0.98 : MathUtils.lerp(0.745, 0.86, (s - 0.76) / (1 - rr - 0.76));
        const rel = sample(relief, 0.5 + 0.5 * cx * tr, 0.5 + 0.5 * sz * tr);
        y = base + smooth(0.76, 1 - rr, s) * ((zr + rr) - base) + (rel - 0.45) * amp * (1 - smooth(0.82, 0.93, s));
      } else if (row.kind === 'tube') {
        // el borde toma la textura de la corteza (sin llegar al filo de la foto) y se oscurece por debajo
        const q = row.a / (Math.PI / 2);
        // la corona de corteza de la foto (vista desde arriba) cubre la parte superior y exterior del borde
        y = row.y; tr = q >= 0 ? MathUtils.lerp(0.975, 0.86, q) : MathUtils.lerp(0.975, 0.9, -q); shade = q >= 0 ? 1 : MathUtils.lerp(1, 0.5, -q);
      } else { y = 0; tr = 0.9; shade = 0.38; }
      pos[p * 3] = cx * r; pos[p * 3 + 1] = y; pos[p * 3 + 2] = sz * r;
      uv[p * 2] = 0.5 + 0.5 * cx * tr; uv[p * 2 + 1] = 1 - (0.5 + 0.5 * sz * tr);
      col[p * 3] = shade; col[p * 3 + 1] = shade * 0.94; col[p * 3 + 2] = shade * 0.88;
      p++;
    }
  });
  const idx = [];
  for (let r = 0; r < rows.length - 1; r++) for (let c = 0; c < A; c++) {
    const a = r * cols + c, b = a + 1, d = a + cols, e = d + 1;
    idx.push(a, b, d, b, e, d); // caras hacia fuera (arriba en la superficie, abajo en la base)
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3)); g.setAttribute('uv', new BufferAttribute(uv, 2)); g.setAttribute('color', new BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals();
  // cerrar la costura angular (promediar normales de la primera y última columna)
  const n = g.attributes.normal;
  for (let r = 0; r < rows.length; r++) {
    const a = r * cols, b = a + A;
    const x = (n.getX(a) + n.getX(b)) / 2, y = (n.getY(a) + n.getY(b)) / 2, z = (n.getZ(a) + n.getZ(b)) / 2, l = Math.hypot(x, y, z) || 1;
    n.setXYZ(a, x / l, y / l, z / l); n.setXYZ(b, x / l, y / l, z / l);
  }
  // centro de la base: normal hacia abajo
  return g;
}

/* ---------- Relieve 3D para platos no redondos ---------- */
function reliefGeometry(depth, lowEnd) {
  const S = lowEnd ? 150 : 220, g = new PlaneGeometry(2, 2, S, S), pos = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const u = uv.getX(i), v = 1 - uv.getY(i), d = sample(depth, u, v);
    const ex = Math.abs(u - 0.5) * 2, ey = Math.abs(v - 0.5) * 2, r = Math.pow(ex ** 4 + ey ** 4, 0.25);
    pos.setZ(i, (d - 0.42) * 0.62 * (1 - smooth(0.88, 1.0, r)));
  }
  g.computeVertexNormals();
  return g;
}
function radialAlpha() { // bordes suaves con forma de "squircle": no recorta botellas ni platos altos
  const n = 256, c = document.createElement('canvas'); c.width = c.height = n; const x = c.getContext('2d'), im = x.createImageData(n, n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const ex = Math.abs((i + 0.5) / n - 0.5) * 2, ey = Math.abs((j + 0.5) / n - 0.5) * 2, r = Math.pow(ex ** 4 + ey ** 4, 0.25);
    const a = 255 * (1 - smooth(0.86, 0.995, r)), k = (j * n + i) * 4; im.data[k] = im.data[k + 1] = im.data[k + 2] = a; im.data[k + 3] = 255;
  }
  x.putImageData(im, 0, 0); return new CanvasTexture(c);
}

export function createViewer(canvas, opts = {}) {
  const lowEnd = (navigator.hardwareConcurrency || 4) <= 4 || (navigator.deviceMemory || 4) <= 3;
  // en pantallas de alta densidad (casi todos los teléfonos) el antialiasing no aporta y cuesta rendimiento
  const renderer = new WebGLRenderer({ canvas, antialias: (window.devicePixelRatio || 1) < 2, alpha: true, powerPreference: 'high-performance' });
  let dpr = Math.min(window.devicePixelRatio || 1, lowEnd ? 1.5 : 2);
  renderer.setPixelRatio(dpr);
  renderer.outputColorSpace = SRGBColorSpace; renderer.toneMapping = ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = PCFShadowMap;
  renderer.setClearColor(0x000000, 0);
  const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const scene = new Scene();
  const pm = new PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.35; pm.dispose();
  const camera = new PerspectiveCamera(34, 1, 0.05, 50);
  scene.add(new HemisphereLight(0xfff0dd, 0x1a120c, 0.55));
  const key = new DirectionalLight(0xffd6a8, 2.1); key.position.set(2.2, 4.2, 1.8); key.castShadow = true;
  key.shadow.mapSize.set(lowEnd ? 1024 : 2048, lowEnd ? 1024 : 2048); key.shadow.radius = 4; key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
  Object.assign(key.shadow.camera, { left: -1.6, right: 1.6, top: 1.6, bottom: -1.6, near: 0.5, far: 10 });
  scene.add(key);
  const rim = new DirectionalLight(0xff9d55, 1.3); rim.position.set(-2.5, 1.6, -3); scene.add(rim);
  const fill = new DirectionalLight(0xffffff, 0.35); fill.position.set(-1, 2, 3); scene.add(fill);
  const ground = new Mesh(new PlaneGeometry(12, 12), new ShadowMaterial({ opacity: 0.5 })); ground.rotation.x = -Math.PI / 2; ground.position.y = -0.071; ground.receiveShadow = true; scene.add(ground);

  const controls = new OrbitControls(camera, canvas);
  Object.assign(controls, { enableDamping: true, dampingFactor: 0.075, rotateSpeed: 0.85, zoomSpeed: 1.1, panSpeed: 0.8, zoomToCursor: true, screenSpacePanning: true });
  controls.touches = { ONE: 0 /* ROTATE */, TWO: 2 /* DOLLY_PAN */ };

  let root = null, mode = 'pizza', woodTex = null, alphaTex = null, idle = true, idleTimer = 0, t0 = performance.now(), home = null, anim = null, running = false;
  let frames = 0, acc = 0, lastT = performance.now();

  controls.addEventListener('start', () => { idle = false; clearTimeout(idleTimer); anim = null; controls.autoRotate = false; });
  controls.addEventListener('end', () => { clearTimeout(idleTimer); idleTimer = setTimeout(() => { idle = true; if (mode === 'pizza') controls.autoRotate = !opts.reduced; t0 = performance.now(); }, 6000); });

  function resize() {
    const r = canvas.parentElement.getBoundingClientRect(); if (!r.width || !r.height) return;
    renderer.setSize(r.width, r.height, false); camera.aspect = r.width / r.height; camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize); ro.observe(canvas.parentElement);

  // encuadre: distancia para que el plato quepa completo según el ancho/alto del visor
  function fitHome(dirPos, target, halfW, halfH) {
    resize();
    const tanV = Math.tan(MathUtils.degToRad(camera.fov / 2)), asp = Math.max(0.3, camera.aspect || 1);
    const d = Math.max(halfW / (tanV * asp), halfH / tanV) * 1.04;
    return { pos: dirPos.clone().sub(target).normalize().multiplyScalar(d).add(target), target: target.clone() };
  }
  function disposeRoot() {
    if (!root) return;
    root.traverse(o => { if (o.isMesh && o !== ground) { o.geometry.dispose(); [].concat(o.material).forEach(m => { ['map', 'emissiveMap', 'bumpMap'].forEach(k => m[k] && m[k] !== woodTex && m[k].dispose()); m.dispose(); }); } });
    scene.remove(root); root = null;
  }
  function photoMaterial(map, extra = {}) {
    map.colorSpace = SRGBColorSpace; map.anisotropy = maxAniso;
    // la foto ya viene iluminada: la mostramos casi tal cual (emisiva) y la luz real añade volumen y brillo
    const m = new MeshStandardMaterial(Object.assign({ map, emissiveMap: map, emissive: 0xffffff, emissiveIntensity: 0.62, color: 0x8a8a8a, roughness: 0.55, metalness: 0 }, extra));
    // los colores de vértice (sombreado de la base y del borde inferior) también oscurecen la parte emisiva
    m.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n#ifdef USE_COLOR\n totalEmissiveRadiance *= vColor.rgb;\n#endif'); };
    return m;
  }

  async function show(base, kind) {
    const token = (show.token = {});
    let group = new Group();
    if (kind === 'pizza') {
      const [top, rimg] = await Promise.all([loadTex(base + '-top.webp'), loadImg(base + '-r.webp')]);
      if (!woodTex) { woodTex = await loadTex(opts.wood); woodTex.colorSpace = SRGBColorSpace; woodTex.anisotropy = maxAniso; }
      if (token !== show.token) { top.dispose(); return; }
      const relief = pixels(rimg, 256);
      const pz = new Mesh(pizzaGeometry(relief, lowEnd), photoMaterial(top, { vertexColors: true, roughness: 0.5 }));
      pz.castShadow = true; pz.receiveShadow = true;
      const boardTop = new MeshStandardMaterial({ map: woodTex, roughness: 0.78, color: 0xffffff });
      const boardSide = new MeshStandardMaterial({ color: 0x3a2214, roughness: 0.85 });
      const board = new Mesh(new CylinderGeometry(1.14, 1.12, 0.07, 128, 1), [boardSide, boardTop, boardSide]);
      board.position.y = -0.036; board.castShadow = true; board.receiveShadow = true;
      group.add(board, pz);
      mode = 'pizza';
      controls.minDistance = 0.75; controls.minPolarAngle = 0; controls.maxPolarAngle = Math.PI * 0.62;
      controls.minAzimuthAngle = -Infinity; controls.maxAzimuthAngle = Infinity;
      home = fitHome(new Vector3(0, 2.15, 2.75), new Vector3(0, 0.02, 0.04), 1.16, 0.84);
      controls.autoRotate = !opts.reduced; controls.autoRotateSpeed = 1.6;
      ground.visible = true;
    } else {
      const [map, dimg] = await Promise.all([loadTex(base + '.webp'), loadImg(base + '-d.webp')]);
      if (token !== show.token) { map.dispose(); return; }
      if (!alphaTex) alphaTex = radialAlpha();
      const m = photoMaterial(map, { alphaMap: alphaTex, transparent: true, emissiveIntensity: 0.78, color: 0x666666, roughness: 0.7 });
      const mesh = new Mesh(reliefGeometry(pixels(dimg, 256), lowEnd), m);
      group.add(mesh);
      mode = 'relief';
      controls.minDistance = 1.15; controls.minPolarAngle = Math.PI / 2 - 0.5; controls.maxPolarAngle = Math.PI / 2 + 0.38;
      controls.minAzimuthAngle = -0.72; controls.maxAzimuthAngle = 0.72;
      home = fitHome(new Vector3(0, 0.05, 3.55), new Vector3(0, 0, 0), 0.94, 0.94);
      controls.autoRotate = false;
      ground.visible = false;
    }
    controls.maxDistance = home.pos.distanceTo(home.target) * 1.8;
    disposeRoot(); root = group; scene.add(root);
    camera.position.copy(home.pos); controls.target.copy(home.target);
    // entrada: el plato aparece girando y creciendo
    group.scale.setScalar(0.82); group.rotation.y = mode === 'pizza' ? -0.9 : 0; group.userData.in = performance.now();
    idle = true; t0 = performance.now(); controls.update();
    return mode;
  }

  /* doble toque: acercar al punto tocado / volver */
  const ray = new Raycaster(), ndc = new Vector2();
  let lastTap = 0, downAt = null;
  canvas.addEventListener('pointerdown', e => { downAt = { x: e.clientX, y: e.clientY, t: performance.now() }; });
  canvas.addEventListener('pointerup', e => {
    if (!downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 10 || performance.now() - downAt.t > 300) return;
    const now = performance.now();
    if (now - lastTap < 320) { lastTap = 0; dblTap(e); } else lastTap = now;
  });
  function dblTap(e) {
    if (!root) return;
    const near = camera.position.distanceTo(controls.target) < (mode === 'pizza' ? 1.9 : 2.4);
    if (near) return reset();
    const r = canvas.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera); const hit = ray.intersectObject(root, true)[0]; if (!hit) return;
    const dir = camera.position.clone().sub(controls.target).normalize();
    tween(hit.point, hit.point.clone().add(dir.multiplyScalar(mode === 'pizza' ? 1.05 : 1.45)));
  }
  function tween(target, pos) { controls.autoRotate = false; idle = false; clearTimeout(idleTimer); anim = { s: performance.now(), t0: controls.target.clone(), p0: camera.position.clone(), t1: target.clone(), p1: pos.clone() }; idleTimer = setTimeout(() => { idle = true; t0 = performance.now(); if (mode === 'pizza') controls.autoRotate = !opts.reduced; }, 8000); }
  function reset() { if (home) tween(home.target, home.pos); }

  const sph = new Spherical(), off = new Vector3();
  function frame(now) {
    // calidad adaptativa: si el teléfono no llega a ~45 fps, baja la resolución interna
    const dt = now - lastT; lastT = now; acc += dt; frames++;
    if (frames === 45) { const avg = acc / frames; frames = 0; acc = 0; if (avg > 23 && dpr > 1) { dpr = Math.max(1, dpr - 0.25); renderer.setPixelRatio(dpr); resize(); } }
    if (anim) {
      const k = Math.min(1, (now - anim.s) / 650), e = 1 - Math.pow(1 - k, 3);
      controls.target.lerpVectors(anim.t0, anim.t1, e); camera.position.lerpVectors(anim.p0, anim.p1, e);
      if (k >= 1) anim = null;
    } else if (idle && mode === 'relief' && !opts.reduced) {
      off.copy(camera.position).sub(controls.target); sph.setFromVector3(off);
      sph.theta = Math.sin((now - t0) / 1000 * 0.55) * 0.42; sph.phi = Math.PI / 2 - 0.08 + Math.sin((now - t0) / 1000 * 0.37) * 0.1;
      off.setFromSpherical(sph); camera.position.copy(controls.target).add(off);
    }
    if (root && root.userData.in) {
      const k = Math.min(1, (now - root.userData.in) / 1100), e = 1 - Math.pow(1 - k, 4);
      root.scale.setScalar(0.82 + 0.18 * e); if (mode === 'pizza') root.rotation.y = -0.9 * (1 - e);
      if (k >= 1) root.userData.in = 0;
    }
    controls.target.clampLength(0, mode === 'pizza' ? 1.1 : 0.9); // que el paneo no pierda el plato
    controls.update();
    renderer.render(scene, camera);
  }
  function start() { if (running) return; running = true; resize(); lastT = performance.now(); renderer.setAnimationLoop(frame); }
  function stop() { running = false; renderer.setAnimationLoop(null); }
  document.addEventListener('visibilitychange', () => { if (document.hidden) renderer.setAnimationLoop(null); else if (running) renderer.setAnimationLoop(frame); });
  canvas.addEventListener('webglcontextlost', e => e.preventDefault());

  return { show, start, stop, reset, release: disposeRoot, debug: { camera, controls, renderer } };
}
