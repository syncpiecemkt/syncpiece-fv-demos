/* =========================================================
   試作：浮遊する幾何学図形（パーティクル）
   - 細い二重線でできた図形を、粒子の集まりで描く
   - ゆっくり回転・浮遊し、一部の粒子は周りに散らばって漂う
   - スクロールすると、いま見ているセクションの位置へ移動し、別の図形に組み替わる
   - 速くスクロールすると粒子が少しほどけ、止まると形に戻る
   three.js（WebGL）
   ※ ファイルを直接開いても（file://）動くよう、モジュールではなく通常のスクリプトで読み込む
   ========================================================= */
(function () {
'use strict';
if (!window.THREE) return;

const canvas = document.getElementById('js-particles');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const params = new URLSearchParams(location.search);

/* ---------------------------------------------------------
   図形をつくる：線（曲線）を点で埋める。線は少しずらしてもう1本引き、二重線にする
   --------------------------------------------------------- */
const COUNT = matchMedia('(max-width: 767px)').matches ? 14000 : 24000;

// 曲線 f(t) (t: 0..1) を2本線で n 個の点にする
function doubleCurve(out, n, f, gap = 0.045, closed = true) {
  const p = new THREE.Vector3(), q = new THREE.Vector3(), tan = new THREE.Vector3(), nor = new THREE.Vector3();
  const up = new THREE.Vector3(0.31, 0.83, 0.46).normalize();
  for (let i = 0; i < n; i++) {
    const t = (i / 2 | 0) / Math.ceil(n / 2) + Math.random() * 0.0015;
    f(t, p);
    f(closed ? (t + 0.001) % 1 : Math.min(1, t + 0.001), q);
    tan.subVectors(q, p).normalize();
    nor.crossVectors(tan, up);
    if (nor.lengthSq() < 1e-6) nor.set(1, 0, 0);
    nor.normalize();
    const side = i % 2 ? 1 : -1;
    out.push(p.x + nor.x * gap * side, p.y + nor.y * gap * side, p.z + nor.z * gap * side);
  }
}
// 直線（辺）を二重線に
function doubleEdge(out, n, a, b, gap = 0.03) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  doubleCurve(out, n, (t, v) => v.lerpVectors(A, B, t), gap, false);
}
// 多面体の辺をすべて二重線に
function wirePolyhedron(out, n, geom, scale = 1, gap = 0.03) {
  const edges = new THREE.EdgesGeometry(geom);
  const pos = edges.attributes.position.array;
  const m = pos.length / 6;
  const per = Math.floor(n / m);
  for (let e = 0; e < m; e++) {
    const k = e * 6;
    doubleEdge(out, e === m - 1 ? n - per * (m - 1) : per,
      [pos[k] * scale, pos[k + 1] * scale, pos[k + 2] * scale],
      [pos[k + 3] * scale, pos[k + 4] * scale, pos[k + 5] * scale], gap);
  }
}
const ring = (r, tiltX = 0, tiltZ = 0) => {
  const m = new THREE.Matrix4().makeRotationX(tiltX).multiply(new THREE.Matrix4().makeRotationZ(tiltZ));
  return (t, v) => v.set(Math.cos(t * Math.PI * 2) * r, Math.sin(t * Math.PI * 2) * r, 0).applyMatrix4(m);
};
const torusKnot = (p, q, R = 1, r = 0.38) => (t, v) => {
  const a = t * Math.PI * 2 * 1;
  const u = a * p, w = a * q;
  const rr = R + r * Math.cos(w);
  v.set(rr * Math.cos(u), rr * Math.sin(u), r * Math.sin(w));
};
// 図形ごとに、点の数を割り振って生成し、ちょうど COUNT 個に揃える
function build(parts) {
  const out = [];
  const total = parts.reduce((s, p) => s + p[0], 0);
  let used = 0;
  parts.forEach(([w, fn], i) => {
    const n = i === parts.length - 1 ? COUNT - used : Math.round(COUNT * w / total);
    used += n;
    fn(out, n);
  });
  return new Float32Array(out);
}

const SHAPES = [
  // 0 FV：ジャイロ（傾いた3つの輪）＋ 外側をめぐる結び目
  build([
    [3, (o, n) => doubleCurve(o, n, torusKnot(2, 3, 1.05, 0.42), 0.045)],
    [1, (o, n) => doubleCurve(o, n, ring(1.55, 0.35, 0.2), 0.045)],
    [1, (o, n) => doubleCurve(o, n, ring(1.55, 1.25, -0.6), 0.045)],
    [1, (o, n) => doubleCurve(o, n, ring(1.55, 2.2, 1.1), 0.045)],
  ]),
  // 1 CONCEPT：正二十面体の骨組み ＋ 内側の輪
  build([
    [4, (o, n) => wirePolyhedron(o, n, new THREE.IcosahedronGeometry(1.45, 0), 1, 0.045)],
    [1, (o, n) => doubleCurve(o, n, ring(0.9, Math.PI / 2, 0), 0.045)],
    [1, (o, n) => doubleCurve(o, n, ring(0.9, 0.3, 0.9), 0.045)],
  ]),
  // 2 CHALLENGE：細かく巻いた結び目
  build([
    [1, (o, n) => doubleCurve(o, n, torusKnot(3, 7, 1.1, 0.45), 0.045)],
  ]),
  // 3 WORKS：入れ子の立方体（少しずらして回転）
  build([
    [1, (o, n) => wirePolyhedron(o, n, new THREE.BoxGeometry(2, 2, 2), 0.85, 0.045)],
    [1, (o, n) => {
      const g = new THREE.BoxGeometry(2, 2, 2);
      g.rotateX(Math.PI / 4); g.rotateY(Math.PI / 4);
      wirePolyhedron(o, n, g, 0.55, 0.045);
    }],
  ]),
  // 4 BEYOND：横に流れる二重らせん
  build([
    [1, (o, n) => doubleCurve(o, n, (t, v) => v.set((t - 0.5) * 5.2, Math.cos(t * Math.PI * 7) * 0.55, Math.sin(t * Math.PI * 7) * 0.55), 0.025, false)],
    [1, (o, n) => doubleCurve(o, n, (t, v) => v.set((t - 0.5) * 5.2, -Math.cos(t * Math.PI * 7) * 0.55, -Math.sin(t * Math.PI * 7) * 0.55), 0.025, false)],
  ]),
  // 5 SERVICES：正八面体と立方体の組み合わせ
  build([
    [1, (o, n) => wirePolyhedron(o, n, new THREE.OctahedronGeometry(1.5, 0), 1, 0.045)],
    [1, (o, n) => wirePolyhedron(o, n, new THREE.BoxGeometry(1.5, 1.5, 1.5), 1, 0.045)],
  ]),
  // 6 ABOUT：球面をめぐるらせん
  build([
    [1, (o, n) => doubleCurve(o, n, (t, v) => {
      const a = t * Math.PI, b = t * Math.PI * 2 * 14;
      v.set(Math.sin(a) * Math.cos(b) * 1.35, Math.cos(a) * 1.35, Math.sin(a) * Math.sin(b) * 1.35);
    }, 0.022, false)],
  ]),
  // 7 CONTACT：大きな輪が幾重にも
  build([
    [1, (o, n) => doubleCurve(o, n, ring(1.6, 0.2, 0), 0.045)],
    [1, (o, n) => doubleCurve(o, n, ring(1.6, 0.9, 0.5), 0.045)],
    [1, (o, n) => doubleCurve(o, n, ring(1.6, 1.6, 1.0), 0.045)],
    [1, (o, n) => doubleCurve(o, n, ring(1.6, 2.3, 1.5), 0.045)],
    [1, (o, n) => doubleCurve(o, n, ring(1.6, 3.0, 2.0), 0.045)],
  ]),
];

/* ---------------------------------------------------------
   セクションごとの置き場所
   x, y：画面の中心を 0、端を ±1 とした位置 / s：大きさ / shape：図形の番号
   color：粒子の色（暗い背景は白、明るい背景はグレー）
   --------------------------------------------------------- */
const LIGHT = '#6f6f6f', WHITE = '#f2f2f2';
const PC = {
  '.p-fv':        { x: 0.42,  y: 0.02,  s: 1.05, shape: 0, color: WHITE },
  '.p-concept':   { x: -0.5,  y: 0.0,   s: 0.85, shape: 1, color: WHITE },
  '.p-challenge': { x: 0.02,  y: 0.5,   s: 0.5,  shape: 2, color: WHITE },
  '.p-works':     { x: 0.62,  y: 0.45,  s: 0.5,  shape: 3, color: LIGHT },
  '.p-beyond':    { x: 0,     y: -0.5,  s: 0.7,  shape: 4, color: WHITE },
  '.p-services':  { x: 0.62,  y: -0.3,  s: 0.5,  shape: 5, color: LIGHT },
  '.p-about':     { x: 0.45,  y: 0.0,   s: 0.85, shape: 6, color: WHITE },
  '.p-blog':      { x: 0.02,  y: 0.62,  s: 0.38, shape: 1, color: LIGHT },
  '.p-contact':   { x: 0.12,  y: 0.05,  s: 0.8,  shape: 7, color: WHITE },
  '.l-footer':    { x: 0.6,   y: 0.1,   s: 0.7,  shape: 7, color: LIGHT },
};
// スマホは基本的に中央寄せ・小さめ・控えめに
const SP = {
  '.p-fv':        { x: 0.2,   y: 0.42,  s: 0.55 },
  '.p-concept':   { x: -0.1,  y: -0.25, s: 0.6 },
  '.p-challenge': { x: 0.35,  y: 0.55,  s: 0.45 },
  '.p-works':     { x: 0.45,  y: 0.6,   s: 0.35 },
  '.p-beyond':    { x: 0,     y: 0.35,  s: 0.45 },
  '.p-services':  { x: 0.4,   y: 0.6,   s: 0.4 },
  '.p-about':     { x: 0.3,   y: 0.3,   s: 0.6 },
  '.p-blog':      { x: -0.4,  y: 0.6,   s: 0.35 },
  '.p-contact':   { x: 0.2,   y: 0.35,  s: 0.65 },
  '.l-footer':    { x: 0.3,   y: 0.4,   s: 0.5 },
};
const sections = Object.keys(PC)
  .map((sel) => ({ sel, el: document.querySelector(sel), pc: PC[sel], sp: { ...PC[sel], ...SP[sel] } }))
  .filter((s) => s.el);

/* ---------------------------------------------------------
   three.js の準備
   --------------------------------------------------------- */
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: 'high-performance' });
renderer.setClearColor(0x000000, 0);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
camera.position.z = 9;

const geometry = new THREE.BufferGeometry();
const current = new Float32Array(SHAPES[0]);   // 実際に描く位置（毎フレーム更新）
const from = new Float32Array(SHAPES[0]);      // 組み替え前の位置
const rand = new Float32Array(COUNT * 4);      // 粒子ごとの乱数
for (let i = 0; i < COUNT * 4; i++) rand[i] = Math.random();
geometry.setAttribute('position', new THREE.BufferAttribute(current, 3).setUsage(THREE.DynamicDrawUsage));
geometry.setAttribute('aRand', new THREE.BufferAttribute(rand, 4));

const uniforms = {
  uTime: { value: 0 },
  uPixel: { value: 1 },
  uSize: { value: 1.7 },
  uScatter: { value: 0 },          // スクロールの速さで粒子がほどける量
  uColor: { value: new THREE.Color(WHITE) },
  uOpacity: { value: 1 },
  uGrid: { value: params.get('grid') === '0' ? 0 : 2 }, // 点を画面上のマス目にそろえる（ドット感）。?grid=0 で無効
  uRes: { value: new THREE.Vector2(1, 1) },
};

const material = new THREE.ShaderMaterial({
  uniforms,
  transparent: true,
  depthWrite: false,
  depthTest: false,
  vertexShader: /* glsl */`
    attribute vec4 aRand;
    uniform float uTime, uPixel, uSize, uScatter, uGrid;
    uniform vec2 uRes;
    varying float vAlpha;

    void main() {
      vec3 p = position;
      float t = uTime;

      // ふわふわ漂う：粒子ごとに位相をずらした小さな揺れ
      vec3 ph = aRand.xyz * 6.2831;
      vec3 drift = vec3(
        sin(t * 0.7 + ph.x + p.y * 1.7),
        sin(t * 0.6 + ph.y + p.z * 1.9),
        sin(t * 0.8 + ph.z + p.x * 1.5)
      );

      // 一部の粒子（約18%）は形から離れて周りに散らばる
      float dust = smoothstep(0.82, 1.0, aRand.w);
      vec3 dir = normalize(p + (aRand.xyz - 0.5) * 0.8 + 1e-4);
      float away = dust * (0.25 + 1.4 * aRand.x) * (0.75 + 0.25 * sin(t * 0.25 + ph.y));

      p += drift * (0.004 + dust * 0.12 + uScatter * 0.35 * aRand.y);
      p += dir * (away + uScatter * 0.9 * aRand.z * aRand.z);

      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      vec4 clip = projectionMatrix * mv;

      // 画面上の位置をマス目にそろえ、ドット（網点）のような質感にする
      if (uGrid > 0.0) {
        vec2 cell = uGrid * uPixel / uRes;
        vec2 ndc = clip.xy / clip.w;
        ndc = (floor(ndc / (cell * 2.0)) + 0.5) * cell * 2.0;
        clip.xy = ndc * clip.w;
      }
      gl_Position = clip;

      // 奥の粒子ほど小さく・薄く。散らばった粒子も薄く
      float depth = clamp((-mv.z - 6.5) / 5.0, 0.0, 1.0);
      gl_PointSize = uSize * uPixel * mix(1.25, 0.7, depth) * mix(1.0, 0.8, dust);
      vAlpha = mix(1.0, 0.25, depth) * mix(0.9, 0.35, dust) * (0.65 + 0.35 * aRand.z);
    }
  `,
  fragmentShader: /* glsl */`
    uniform vec3 uColor;
    uniform float uOpacity;
    varying float vAlpha;
    void main() {
      gl_FragColor = vec4(uColor, vAlpha * uOpacity); // 四角い点のまま描く
    }
  `,
});

const group = new THREE.Group();       // セクション間の移動・大きさ
const spin = new THREE.Group();        // ゆっくりした回転
group.add(spin);
spin.add(new THREE.Points(geometry, material));
scene.add(group);

/* ---------------------------------------------------------
   サイズ
   --------------------------------------------------------- */
let W = 0, H = 0, isSP = false, halfH = 1, halfW = 1;
function resize() {
  W = innerWidth; H = innerHeight;
  isSP = W < 768;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  renderer.setPixelRatio(dpr);
  renderer.setSize(W, H, false);
  camera.aspect = W / H;
  camera.updateProjectionMatrix();
  uniforms.uPixel.value = dpr;
  uniforms.uRes.value.set(W * dpr, H * dpr);
  halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
  halfW = halfH * camera.aspect;
}
resize();
addEventListener('resize', resize);

/* ---------------------------------------------------------
   図形の組み替え（粒子ごとに少しずつ時間をずらして移動）
   --------------------------------------------------------- */
let shapeIndex = 0;
let morph = 1;           // 0→1
const MORPH_SEC = 2.4;
const delays = new Float32Array(COUNT);
for (let i = 0; i < COUNT; i++) delays[i] = rand[i * 4] * 0.45;

function setShape(i) {
  if (i === shapeIndex) return;
  from.set(current);
  shapeIndex = i;
  morph = 0;
}
function updateMorph(dt) {
  if (morph >= 1) return;
  morph = Math.min(1, morph + dt / MORPH_SEC);
  const to = SHAPES[shapeIndex];
  for (let i = 0; i < COUNT; i++) {
    let k = (morph - delays[i]) / 0.55;
    k = k < 0 ? 0 : k > 1 ? 1 : k;
    k = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; // easeInOutCubic
    const j = i * 3;
    current[j] = from[j] + (to[j] - from[j]) * k;
    current[j + 1] = from[j + 1] + (to[j + 1] - from[j + 1]) * k;
    current[j + 2] = from[j + 2] + (to[j + 2] - from[j + 2]) * k;
  }
  geometry.attributes.position.needsUpdate = true;
}

/* ---------------------------------------------------------
   いまどのセクションを見ているか（画面の中央にあるもの）
   --------------------------------------------------------- */
const state = { x: 0, y: 0, s: 1 };        // 実際の値（なめらかに追従）
const target = { x: 0, y: 0, s: 1 };
const targetColor = new THREE.Color(WHITE);
let active = null;

function pickSection() {
  const mid = H * 0.5;
  let found = sections[0];
  for (const s of sections) {
    const r = s.el.getBoundingClientRect();
    if (r.top <= mid && r.bottom > mid) { found = s; break; }
    if (r.top > mid) break;
    found = s;
  }
  const conf = isSP ? found.sp : found.pc;
  const r = found.el.getBoundingClientRect();
  // セクション内の進み具合で少しだけ上下させ、セクションに「くっついて」動いて見えるようにする
  const prog = THREE.MathUtils.clamp((mid - r.top) / Math.max(1, r.height), 0, 1);
  const follow = Math.min(0.35, r.height / H * 0.12);
  target.x = conf.x * halfW;
  target.y = (conf.y + (prog - 0.5) * follow) * halfH;
  target.s = conf.s * (isSP ? 1 : Math.min(1.15, Math.max(0.8, W / 1440)));
  if (found !== active) {
    active = found;
    setShape(conf.shape);
    targetColor.set(conf.color);
  }
}

/* ---------------------------------------------------------
   マウスに少しだけ反応して傾く
   --------------------------------------------------------- */
const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
addEventListener('pointermove', (e) => {
  pointer.tx = e.clientX / W - 0.5;
  pointer.ty = e.clientY / H - 0.5;
}, { passive: true });

/* ---------------------------------------------------------
   毎フレーム
   --------------------------------------------------------- */
let last = performance.now();
let lastScroll = scrollY;
let scatter = 0;
let intro = 0;   // ローディング明けに、散らばった状態から集まってくる
let started = false;

function frame(now) {
  requestAnimationFrame(frame);
  tick(now);
}
function tick(now) {
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
  last = Math.max(last, now);
  const t = now / 1000;
  uniforms.uTime.value = t;

  pickSection();

  // スクロールの速さ → 粒子のほどけ具合
  const lenis = window.__lenis;
  const v = lenis ? Math.abs(lenis.velocity || 0) : Math.abs(scrollY - lastScroll);
  lastScroll = scrollY;
  scatter += (Math.min(1, v / 40) - scatter) * (v / 40 > scatter ? 0.12 : 0.04);

  if (started) intro = Math.min(1, intro + dt / 3.2);
  const introK = 1 - Math.pow(1 - intro, 3);
  uniforms.uScatter.value = reduceMotion ? 0 : scatter + (1 - introK) * 2.2;

  // 位置・大きさ・色をなめらかに追いかける
  const f = reduceMotion ? 1 : 1 - Math.pow(0.0035, dt);   // 約 0.09/フレーム
  state.x += (target.x - state.x) * f;
  state.y += (target.y - state.y) * f;
  state.s += (target.s - state.s) * f;
  uniforms.uColor.value.lerp(targetColor, f * 0.6);

  // ゆっくり浮遊：上下にただよい、全体がゆるく揺れる
  const floatY = Math.sin(t * 0.45) * 0.08 + Math.sin(t * 0.21 + 1.3) * 0.05;
  const floatX = Math.cos(t * 0.33) * 0.06;
  group.position.set(state.x + floatX, state.y + floatY, 0);
  group.scale.setScalar(state.s * (0.85 + 0.15 * introK));

  // 回転：一定の回転 ＋ ゆらぎ（ランダムっぽく）＋ マウスの傾き
  pointer.x += (pointer.tx - pointer.x) * 0.04;
  pointer.y += (pointer.ty - pointer.y) * 0.04;
  if (!reduceMotion) {
    spin.rotation.y += dt * 0.12;
    spin.rotation.x = Math.sin(t * 0.17) * 0.45 + pointer.y * 0.4;
    spin.rotation.z = Math.sin(t * 0.11 + 2.0) * 0.35;
    group.rotation.y = pointer.x * 0.5;
  }

  updateMorph(reduceMotion ? 1 : dt);
  renderer.render(scene, camera);
}

// ローディングが終わったら表示を始める
function start() {
  if (started) return;
  started = true;
  canvas.classList.add('is-ready');
}
if (window.__loaderDone) start();
else addEventListener('loader:done', start, { once: true });
// ローディング中でも、明ける少し前から裏で動かしておく
requestAnimationFrame(frame);

// 確認用
window.__particles = { uniforms, state, target, get morph() { return morph; }, get intro() { return intro; }, get scatter() { return scatter; }, get active() { return active && active.sel; },
  // タブが裏にあるとき用：n フレーム分すすめる
  step(n = 60) { let t = last; for (let i = 0; i < n; i++) { t += 16.7; tick(t); } } };
})();
