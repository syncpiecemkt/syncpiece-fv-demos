/* =========================================================
   試作：浮遊する幾何学図形（パーティクル）
   - 細い二重線でできた図形を、粒子の集まりで描く
   - 図形・背景はセクションごとに置く（追いかけない）。ページと一緒にスクロールし、そのセクションの範囲だけに描く
   - 背景のセクションは、細い線の網目でできた面と漂う粒子が、その場でゆっくり動き続ける
   - 05 ABOUT は、画面に入ってきたら中心からブワッと花開くように現れる
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
   セクションごとの設定（追いかけない：それぞれのセクションの中に置き、ページと一緒にスクロールする）
   kind：shape＝図形 / field＝線の網目でできた面と、漂う粒子の背景
   x：画面の中心を 0、端を ±1 とした横位置
   y：セクションの中心を 0、上下に画面の高さの半分を ±1 とした縦位置
   s：大きさ / shape：図形の番号 / color：色
   bloom：画面に入ってきたときに、中心からブワッと花開くように現れる
   clip：描く範囲（そのセクションからはみ出さない）。FVと考え方は 1 枚の黒い背景なので、2 つ合わせた範囲
   --------------------------------------------------------- */
const LIGHT = '#6f6f6f', WHITE = '#9a9a9a';
const ABOUT_C = '#a9a9a9'; // 05 の背景（#bcbcbc）に溶け込むくらいのグレー
const CONFIG = [
  // FV：図形は画面に固定して追いかけ、考え方のセクションに近づくと、左へ移りながら二十面体に組み替わって考え方に収まる
  { sel: '.p-fv',        kind: 'shape', x: 0.42,  y: 0.02, s: 1.05, shape: 0, color: WHITE, clip: '.p-hero', intro: true, fixed: true,
    sp: { x: 0.2, y: 0.42, s: 0.55 },
    to: { sel: '.p-concept', x: -0.5, y: 0.1, s: 0.85, shape: 1, sp: { x: -0.1, y: -0.35, s: 0.6 } } },
  // 01・04：大きくうねる面の長い線 ＋ 大きな楕円でできた球
  //   （SVG の楕円をそのまま描く style: 'svg' も残してあるが、今は使っていない）
  { sel: '.p-challenge', kind: 'field', style: 'mesh', color: WHITE },
  // 03：点線の横線を地平線にして、奥へ消えていく細い線の床（粒子ではない）
  { sel: '.p-beyond__stage', kind: 'floor', color: '#5c5c5c', horizon: '.p-beyond__track' },
  // 04：項目の区切り線が埋もれないよう、背景色（#e4e2e2）に溶け込むくらい薄いグレー
  { sel: '.p-services',  kind: 'field', style: 'mesh', color: '#cfcdcd', lines: 2, lineA: 2.6 }, // 線の本数は約 2 倍で存在感を出す
  { sel: '.p-about',     kind: 'shape', x: 0.45,  y: 0.0,  s: 1.0,  shape: 0, color: ABOUT_C, bloom: true,
    sp: { x: 0.3, y: 0.3, s: 0.6 } },
  // 07：図形ではなく、霧散した背景
  // 07：線の束でできた大きなリボン。色は背景色に近づけて、文字の邪魔をしない
  { sel: '.p-contact',   kind: 'field', style: 'ribbon', color: '#5c5c5c', lineA: 5.5 },
  // 06 BLOG・フッターは、粒子なし
]

/* ---------------------------------------------------------
   three.js の準備（画面に固定した 1 枚のキャンバスに、見えているセクションの分だけ描く）
   --------------------------------------------------------- */
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: 'high-performance' });
renderer.setClearColor(0x000000, 0);
renderer.autoClear = false;
const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
camera.position.z = 9;

const shared = {
  uTime: { value: 0 },
  uPixel: { value: 1 },
  uRes: { value: new THREE.Vector2(1, 1) },
  uGrid: { value: params.get('grid') === '0' ? 0 : 2 }, // 点を画面上のマス目にそろえる（ドット感）。?grid=0 で無効
};

// 画面上の位置をマス目にそろえ、ドット（網点）のような質感にする
const GRID_GLSL = /* glsl */`
  vec4 snapGrid(vec4 clip) {
    if (uGrid > 0.0) {
      vec2 cell = uGrid * uPixel / uRes;
      vec2 ndc = clip.xy / clip.w;
      ndc = (floor(ndc / (cell * 2.0)) + 0.5) * cell * 2.0;
      clip.xy = ndc * clip.w;
    }
    return clip;
  }
`;

/* ---------------------------------------------------------
   図形（粒子）
   --------------------------------------------------------- */
const rand = new Float32Array(COUNT * 4);      // 粒子ごとの乱数（全部の図形で共通）
for (let i = 0; i < COUNT * 4; i++) rand[i] = Math.random();
const randAttr = new THREE.BufferAttribute(rand, 4);

const SHAPE_VS = /* glsl */`
  attribute vec4 aRand;
  attribute vec3 aTo;      // 組み替え先の形
  uniform float uTime, uPixel, uSize, uScatter, uGrid, uBloom, uMorph;
  uniform vec2 uRes;
  varying float vAlpha;
  ${GRID_GLSL}
  mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0., -s, 0., 1., 0., s, 0., c); }
  float easeOutBack(float x) { float c1 = 1.4, c3 = c1 + 1.0; return 1.0 + c3 * pow(x - 1.0, 3.0) + c1 * pow(x - 1.0, 2.0); }

  void main() {
    // 組み替え：粒子ごとに少しずつ時間をずらして、次の形へ移る
    float km = smoothstep(0.0, 1.0, clamp(uMorph * 1.45 - aRand.x * 0.45, 0.0, 1.0));
    vec3 p = mix(position, aTo, km);
    float t = uTime;

    // ふわふわ漂う：粒子ごとに位相をずらした小さな揺れ
    vec3 ph = aRand.xyz * 6.2831;
    vec3 drift = vec3(sin(t * 0.7 + ph.x + p.y * 1.7), sin(t * 0.6 + ph.y + p.z * 1.9), sin(t * 0.8 + ph.z + p.x * 1.5));

    // 一部の粒子（約18%）は形から離れて周りに散らばる
    float dust = smoothstep(0.82, 1.0, aRand.w);
    vec3 dir = normalize(p + (aRand.xyz - 0.5) * 0.8 + 1e-4);
    float away = dust * (0.25 + 1.4 * aRand.x) * (0.75 + 0.25 * sin(t * 0.25 + ph.y));
    p += drift * (0.004 + dust * 0.12 + uScatter * 0.35 * aRand.y);
    p += dir * (away + uScatter * 0.9 * aRand.z * aRand.z);

    // 花開く：中心に集まった状態から、粒子ごとに少しずつ遅れて、ねじれながら外へ開く
    float k = clamp(uBloom * 1.5 - aRand.w * 0.5, 0.0, 1.0);
    float kb = easeOutBack(k);
    p = rotY((1.0 - k) * 2.4) * (p * kb);

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = snapGrid(projectionMatrix * mv);

    // 奥の粒子ほど小さく・薄く。散らばった粒子も薄く
    float depth = clamp((-mv.z - 6.5) / 5.0, 0.0, 1.0);
    gl_PointSize = uSize * uPixel * mix(1.25, 0.7, depth) * mix(1.0, 0.8, dust);
    vAlpha = mix(1.0, 0.25, depth) * mix(0.9, 0.35, dust) * (0.65 + 0.35 * aRand.z) * smoothstep(0.0, 0.35, k);
  }
`;
const POINT_FS = /* glsl */`
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vAlpha;
  void main() { gl_FragColor = vec4(uColor, vAlpha * uOpacity); } // 四角い点のまま描く
`;

/* ---------------------------------------------------------
   背景（セクションの中で、時間だけでその場でゆっくり動き続ける。スクロールでは動かない）
   2 種類あり、セクションごとに style で選ぶ
   mesh  ：大きくうねる面（リボン・楕円の輪・ラッパ）の長く伸びる線 ＋ 画面からはみ出すくらい大きな球（大きな楕円の経線）
           と、その線の上に乗る粒子・漂う塵（01・04）
   ribbon：何十本もの細い線が束になった、1 本の大きくうねるリボン（07）
   --------------------------------------------------------- */
const ROT_GLSL = /* glsl */`
  mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1., 0., 0., 0., c, s, 0., -s, c); }
  mat3 rotYs(float a) { float c = cos(a), s = sin(a); return mat3(c, 0., -s, 0., 1., 0., s, 0., c); }
  mat3 rotZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0., -s, c, 0., 0., 0., 1.); }
`;
const FIELD_STYLES = {
  mesh: {
    // 面ごとに、長く伸びる方向の線だけを描く（輪や筒をぐるっと一周する短い線＝細かい円は描かない）
    //   0 リボン：横に長く伸びる線 / 1 楕円の輪：輪に沿った長い線 / 2 ラッパ：根元から口へ伸びる線
    //   3 球：大きな楕円に見える経線（球をぐるっと一周する大きな輪）
    fam: [{ dir: 'v', n: 9 }, { dir: 'v', n: 7 }, { dir: 'u', n: 12 }, { dir: 'u', n: 9 }],
    seg: 120,
    glsl: /* glsl */`
      ${ROT_GLSL}
      // sid：面の番号 / u, v：面の上の位置（0〜1）/ hw：広げる範囲の半分 / ph：セクションごとの位相（同じ形が並ばないように）
      vec3 surf(float sid, float u, float v, float t, vec2 hw, float ph) {
        vec3 p;
        if (sid < 0.5) {
          // 0：画面を横切って大きくうねり、ねじれるリボン
          float x = u - 0.5;
          float w = v - 0.5;
          float ang = u * 3.4 + t * 0.12 + ph;
          float tw = u * 4.0 + t * 0.08 + ph * 0.5;
          p = vec3(x * hw.x * 3.2, sin(ang) * hw.y * 0.45 + w * hw.y * 0.75 * cos(tw), cos(ang * 0.8) * 2.2 + w * hw.y * 0.75 * sin(tw) - 1.5);
        } else if (sid < 1.5) {
          // 1：横に長い楕円の輪（太さが波打つ）を、手前に倒して下のほうに
          float th = u * 6.2831853, phi = v * 6.2831853;
          float r = 0.45 + 0.3 * sin(th * 2.0 + t * 0.2 + ph);
          p = vec3((hw.x * 1.05 + r * cos(phi)) * cos(th), r * sin(phi), (2.6 + r * cos(phi)) * sin(th));
          p = rotZ(0.12 + sin(t * 0.05 + ph) * 0.06) * rotX(1.32) * p;
          p += vec3(0.0, -hw.y * 0.55, -2.0);
        } else if (sid < 2.5) {
          // 2：ラッパ状にひらいて、くびれる面
          float th = u * 6.2831853;
          float rad = 0.1 + 1.9 * v * v * (0.8 + 0.2 * sin(th * 3.0 + t * 0.15));
          p = vec3(rad * cos(th), (v - 0.5) * hw.y * 1.7, rad * sin(th));
          p = rotZ(1.0 + ph * 0.3 + sin(t * 0.06) * 0.1) * p;
          p += vec3(-hw.x * 0.62 * cos(ph), hw.y * 0.15, -1.5);
        } else {
          // 3：画面からはみ出すくらい大きな球。経線（球をぐるっと一周する大きな輪）が、大きな楕円に見える
          //    ゆっくり自転するので、楕円の幅が変わり続け、球の奥行きが感じられる
          float th = u * 3.1415927 + t * 0.05;      // 経線の向き（0〜180°）
          float phi = v * 6.2831853;                // 輪に沿った位置
          float R = hw.y * 1.35;
          p = vec3(cos(phi) * cos(th), sin(phi), cos(phi) * sin(th)) * R;
          p = rotZ(0.45 + sin(t * 0.04 + ph) * 0.08) * rotX(0.3) * p;   // 少し傾けて、斜めに回る球に
          p += vec3(hw.x * 0.35 * cos(ph * 1.3), -hw.y * 0.1, -R - 0.5);
          return p;                                  // 球は全体の回転とは別に、自分で自転する
        }
        // 全体がゆっくり回る（その場で動き続ける）
        return rotYs(t * 0.02 + ph) * p;
      }
    `,
    // 粒子をどの線の上に置くか（15% は空間を漂う塵）
    pick: /* glsl */`
      if (aRand.y > 0.85) {
        vec3 field = vec3(uHw.x * 2.8, uHw.y * 2.6, 11.0);
        fp = (vec3(fract(aRand.x * 7.13), fract(aRand.z * 5.71), aRand.z) - 0.5) * field;
        fp.z -= 1.5;
        float speed = 0.6 + (fp.z / field.z + 0.5) * 1.6;
        fp.y = mod(fp.y + t * 0.06 * speed + field.y * 0.5, field.y) - field.y * 0.5;
        fp += vec3(sin(t * 0.23 + ph3.x + fp.y * 0.4), sin(t * 0.19 + ph3.y + fp.x * 0.35), sin(t * 0.17 + ph3.z)) * 0.25;
      } else {
        float sid = floor(fract(aRand.x * 13.7) * 4.0);
        float along = fract(aRand.x * 7.31 + aRand.z * 3.17);
        float u, v;
        if (sid < 0.5)      { v = (floor(aRand.z * uLineN.x) + 0.5) / uLineN.x; u = along; }
        else if (sid < 1.5) { v = floor(aRand.z * uLineN.y) / uLineN.y; u = along; }
        else if (sid < 2.5) { u = floor(aRand.z * uLineN.z) / uLineN.z; v = along; }
        else                { u = floor(aRand.z * uLineN.w) / uLineN.w; v = along; }
        fp = surf(sid, u, v, t, uHw, uPhase);
      }
    `,
  },
  ribbon: {
    // 線の束でできた 1 本の大きなリボン。画面の左右を超えて続く（見切れて、どこまでも続いているように見せる）
    fam: [{ dir: 'v', n: 28 }],
    seg: 240,
    glsl: /* glsl */`
      // u：リボンの長さ方向（0〜1）/ v：幅方向（0〜1）/ hw：広げる範囲の半分 / ph：セクションごとの位相
      vec3 surf(float sid, float u, float v, float t, vec2 hw, float ph) {
        float x = (u - 0.5) * hw.x * 3.6;                         // 画面の幅の約 1.8 倍（左右は見切れる）
        float k = u * 6.2831853;
        // 中心線：ゆったりした大きい波 ＋ 少し短い波
        float cy = sin(k * 1.05 + t * 0.16 + ph) * hw.y * 0.38 + sin(k * 0.55 - t * 0.1 + ph * 1.7) * hw.y * 0.18;
        // ねじれ：幅の向きが回るので、正面から見ると線が集まる「くびれ」と、広がるところができる
        float tw = k * 0.9 + t * 0.12 + ph * 0.6;
        float width = hw.y * (0.55 + 0.25 * sin(k * 0.8 + t * 0.07 + ph));
        float w = (v - 0.5) * width;
        return vec3(x, cy + w * cos(tw), w * sin(tw) * 0.6 - 0.5);
      }
    `,
    // 粒子は線の上にほんのり乗る
    pick: /* glsl */`
      float along = fract(aRand.x * 7.31 + aRand.z * 3.17);
      float v = (floor(aRand.z * uLineN.x) + 0.5) / uLineN.x;
      fp = surf(0.0, along, v, t, uHw, uPhase);
    `,
  },
};
const fieldVS = (st) => /* glsl */`
  attribute vec4 aRand;
  uniform float uTime, uPixel, uSize, uGrid, uPhase;
  uniform vec4 uLineN;      // 面ごとの線の本数
  uniform vec2 uRes, uHw;
  varying float vAlpha;
  ${GRID_GLSL}
  ${st.glsl}
  void main() {
    float t = uTime;
    vec3 ph3 = aRand.xyz * 6.2831;
    vec3 fp;
    ${st.pick}
    vec4 mv = modelViewMatrix * vec4(fp, 1.0);
    gl_Position = snapGrid(projectionMatrix * mv);
    float nearK = smoothstep(6.5, 2.5, -mv.z);
    gl_PointSize = uSize * uPixel * (1.0 + nearK * 0.35);
    float bgDepth = clamp((-mv.z - 4.0) / 12.0, 0.0, 1.0);
    vAlpha = mix(0.75, 0.18, bgDepth) * (0.5 + 0.5 * aRand.z) * 0.55;  // 文字の邪魔をしないよう控えめに
  }
`;
const lineVS = (st) => /* glsl */`
  uniform float uTime, uPhase, uLineA;
  uniform vec2 uHw;
  varying float vAlpha;
  ${st.glsl}
  void main() {
    vec3 p = surf(position.z, position.x, position.y, uTime, uHw, uPhase);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    vAlpha = mix(1.0, 0.35, clamp((-mv.z - 5.0) / 12.0, 0.0, 1.0)) * 0.16 * uLineA; // 奥ほど薄く・全体もごく薄く
  }
`;
/* ---------------------------------------------------------
   03 HOW WE WORK の背景：地平線（点線の横線）へ向かって奥に消えていく、細い線の床
   奥行きの線は止まったまま、横の線が手前へゆっくり流れ続ける
   --------------------------------------------------------- */
const FLOOR = { y: -1.7, near: 8.0, far: -70.0, xs: 34, gap: 1.1, rows: 46 };
const FLOOR_VS = /* glsl */`
  attribute float aMove;    // 1 = 手前へ流れる横の線
  uniform float uTime;
  varying float vAlpha;
  void main() {
    vec3 p = position;
    float span = ${(8.0 + 70.0).toFixed(1)};
    if (aMove > 0.5) p.z = ${(-70.0).toFixed(1)} + mod(p.z + 70.0 + uTime * 0.7, span);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    // 地平線に近い（遠い）ほど、手前すぎるほど薄く
    float far = smoothstep(${(-70.0).toFixed(1)}, -18.0, p.z);
    float near = 1.0 - smoothstep(2.0, 7.5, p.z);
    vAlpha = far * near * 0.42;
  }
`;
const floorGeo = (() => {
  const pos = [], move = [];
  const SEG = 60;
  // 奥行き方向の線（地平線の 1 点へ集まって見える）
  for (let i = -FLOOR.xs; i <= FLOOR.xs; i++) {
    const x = i * FLOOR.gap;
    for (let k = 0; k < SEG; k++) {
      const z0 = FLOOR.far + (FLOOR.near - FLOOR.far) * (k / SEG), z1 = FLOOR.far + (FLOOR.near - FLOOR.far) * ((k + 1) / SEG);
      pos.push(x, FLOOR.y, z0, x, FLOOR.y, z1); move.push(0, 0);
    }
  }
  // 横の線（手前へ流れる）
  for (let j = 0; j < FLOOR.rows; j++) {
    const z = FLOOR.far + (FLOOR.near - FLOOR.far) * (j / FLOOR.rows);
    const w = FLOOR.xs * FLOOR.gap;
    for (let k = 0; k < SEG; k++) {
      pos.push(-w + 2 * w * (k / SEG), FLOOR.y, z, -w + 2 * w * ((k + 1) / SEG), FLOOR.y, z); move.push(1, 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('aMove', new THREE.BufferAttribute(new Float32Array(move), 1));
  return g;
})();

/* ---------------------------------------------------------
   03 HOW WE WORK の背景の別パターン（URL の末尾に ?beyond=tunnel / ?beyond=waves を付けると切り替わる）
   tunnel：球を中心に、細い楕円の輪が奥から手前へ次々と流れてくるトンネル
   waves ：地平線の下に、波打つ横線が何本も重なって、地形のようにうねり続ける
   --------------------------------------------------------- */
const BEYOND_VARIANT = ['floor', 'tunnel', 'waves'].includes(params.get('beyond')) ? params.get('beyond') : 'floor';
const TUNNEL = { rx: 4.8, ry: 3.0, near: 8.0, far: -70.0, rings: 36, spokes: 28 };
const TUNNEL_VS = /* glsl */`
  attribute float aMove;    // 1 = 手前へ流れる輪
  uniform float uTime;
  varying float vAlpha;
  void main() {
    vec3 p = position;
    if (aMove > 0.5) p.z = ${TUNNEL.far.toFixed(1)} + mod(p.z - (${TUNNEL.far.toFixed(1)}) + uTime * 1.1, ${(TUNNEL.near - TUNNEL.far).toFixed(1)});
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float far = smoothstep(${TUNNEL.far.toFixed(1)}, -25.0, p.z);
    float near = 1.0 - smoothstep(0.0, 6.0, p.z);
    vAlpha = far * near * (aMove > 0.5 ? 0.45 : 0.22);
  }
`;
const tunnelGeo = (() => {
  const pos = [], move = [];
  const SEG = 120, ZSEG = 50;
  // 流れてくる輪
  for (let j = 0; j < TUNNEL.rings; j++) {
    const z = TUNNEL.far + (TUNNEL.near - TUNNEL.far) * (j / TUNNEL.rings);
    for (let k = 0; k < SEG; k++) {
      const a0 = k / SEG * Math.PI * 2, a1 = (k + 1) / SEG * Math.PI * 2;
      pos.push(Math.cos(a0) * TUNNEL.rx, Math.sin(a0) * TUNNEL.ry, z, Math.cos(a1) * TUNNEL.rx, Math.sin(a1) * TUNNEL.ry, z); move.push(1, 1);
    }
  }
  // 奥へ向かう線（止まったまま）
  for (let i = 0; i < TUNNEL.spokes; i++) {
    const a = i / TUNNEL.spokes * Math.PI * 2, x = Math.cos(a) * TUNNEL.rx, y = Math.sin(a) * TUNNEL.ry;
    for (let k = 0; k < ZSEG; k++) {
      const z0 = TUNNEL.far + (TUNNEL.near - TUNNEL.far) * (k / ZSEG), z1 = TUNNEL.far + (TUNNEL.near - TUNNEL.far) * ((k + 1) / ZSEG);
      pos.push(x, y, z0, x, y, z1); move.push(0, 0);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('aMove', new THREE.BufferAttribute(new Float32Array(move), 1));
  return g;
})();
const WAVES = { y: -1.7, near: 8.0, far: -70.0, rows: 64, w: 44 };
const WAVES_VS = /* glsl */`
  uniform float uTime;
  varying float vAlpha;
  void main() {
    vec3 p = position;
    float t = uTime;
    // ゆるやかな大きい波 ＋ 細かい波。時間でうねり続ける
    p.y += sin(p.x * 0.28 + p.z * 0.2 + t * 0.45) * 0.55
         + sin(p.x * 0.11 - p.z * 0.13 - t * 0.3) * 0.7
         + sin(p.x * 0.6 + p.z * 0.5 + t * 0.8) * 0.12;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float far = smoothstep(${WAVES.far.toFixed(1)}, -20.0, p.z);
    float near = 1.0 - smoothstep(2.0, 7.5, p.z);
    vAlpha = far * near * 0.5;
  }
`;
const wavesGeo = (() => {
  const pos = [];
  const SEG = 180;
  for (let j = 0; j < WAVES.rows; j++) {
    // 奥ほど間隔を詰める（手前は広く）
    const k = j / (WAVES.rows - 1);
    const z = WAVES.far + (WAVES.near - WAVES.far) * Math.pow(k, 0.7);
    for (let i = 0; i < SEG; i++) {
      const x0 = -WAVES.w + 2 * WAVES.w * (i / SEG), x1 = -WAVES.w + 2 * WAVES.w * ((i + 1) / SEG);
      pos.push(x0, WAVES.y, z, x1, WAVES.y, z);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  return g;
})();
const BEYOND_BG = {
  floor:  { geo: floorGeo,  vs: FLOOR_VS,  groundY: FLOOR.y, far: FLOOR.far },
  tunnel: { geo: tunnelGeo, vs: TUNNEL_VS, groundY: 0,       far: TUNNEL.far },
  waves:  { geo: wavesGeo,  vs: WAVES_VS,  groundY: WAVES.y, far: WAVES.far },
}[BEYOND_VARIANT];

/* ---------------------------------------------------------
   01・04 の背景：デザイナーさんの SVG（グループ 260）の楕円を、そのまま線で描く（particle-ellipses.js）
   細長い楕円が何百個も重なって、花びらや球のような面に見える。
   楕円の横幅が 1 つずつ少しずつ伸び縮みし、全体もゆっくり傾いたり漂ったりして、その場で動き続ける
   --------------------------------------------------------- */
const ELL = window.SP_ELLIPSES || { w: 1, h: 1, list: [] };
// そのままだと密すぎるので、同じ位置に重なった楕円を 1 つにまとめ、残りも半分に間引く（ELL_KEEP 個に 1 個）
const ELL_KEEP = 2;
const ELL_LIST = [...new Map(ELL.list.map((e) => [e.join(','), e])).values()].filter((e, i) => i % ELL_KEEP === 0);
const ELL_GLSL = /* glsl */`
  uniform vec2 uArt;      // 図形全体の大きさ（ワールド単位）
  // e：楕円（中心x, 中心y, 横の半径, 縦の半径。SVG の座標）/ a：楕円の上の角度 / id：楕円ごとの値（0〜1）
  vec3 ell(vec4 e, float a, float id, float t) {
    float breathe = 1.0 + 0.09 * sin(t * 0.32 + id * 47.0);          // 横幅が少しずつ伸び縮み（回っているように見える）
    vec2 q = e.xy + vec2(cos(a) * e.z * breathe, sin(a) * e.w);
    return vec3((q.x / ${ELL.w.toFixed(3)} - 0.5) * uArt.x, -(q.y / ${ELL.h.toFixed(3)} - 0.5) * uArt.y, 0.0);
  }
`;
const ELL_LINE_VS = /* glsl */`
  attribute vec4 aE;
  attribute vec2 aA;      // x：角度 / y：楕円ごとの値
  uniform float uTime, uLineA;
  varying float vAlpha;
  ${ELL_GLSL}
  void main() {
    vec4 mv = modelViewMatrix * vec4(ell(aE, aA.x, aA.y, uTime), 1.0);
    gl_Position = projectionMatrix * mv;
    vAlpha = uLineA;
  }
`;
const ELL_POINT_VS = /* glsl */`
  attribute vec4 aE;
  attribute vec2 aA;
  uniform float uTime, uPixel, uSize, uGrid, uLineA;
  uniform vec2 uRes;
  varying float vAlpha;
  ${GRID_GLSL}
  ${ELL_GLSL}
  void main() {
    // 粒子は楕円の上を、ゆっくり流れる
    float a = aA.x + uTime * (0.03 + 0.05 * fract(aA.y * 13.1));
    vec4 mv = modelViewMatrix * vec4(ell(aE, a, aA.y, uTime), 1.0);
    gl_Position = snapGrid(projectionMatrix * mv);
    gl_PointSize = uSize * uPixel;
    vAlpha = uLineA * 1.4;
  }
`;
const ellGeo = (() => {
  const SEG = 96;
  const n = ELL_LIST.length;
  const e = new Float32Array(n * SEG * 2 * 4), aa = new Float32Array(n * SEG * 2 * 2), pos = new Float32Array(n * SEG * 2 * 3);
  let k = 0;
  ELL_LIST.forEach((el, i) => {
    const id = (i * 0.61803) % 1;
    for (let j = 0; j < SEG; j++) {
      for (const jj of [j, j + 1]) {
        e.set(el, k * 4);
        aa[k * 2] = jj / SEG * Math.PI * 2; aa[k * 2 + 1] = id;
        k++;
      }
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aE', new THREE.BufferAttribute(e, 4));
  g.setAttribute('aA', new THREE.BufferAttribute(aa, 2));
  return g;
})();
const ellPointGeo = (() => {
  const N = Math.min(5000, COUNT);
  const e = new Float32Array(N * 4), aa = new Float32Array(N * 2), pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const idx = Math.floor(Math.random() * ELL_LIST.length);
    e.set(ELL_LIST[idx] || [0, 0, 0, 0], i * 4);
    aa[i * 2] = Math.random() * Math.PI * 2; aa[i * 2 + 1] = (idx * 0.61803) % 1;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aE', new THREE.BufferAttribute(e, 4));
  g.setAttribute('aA', new THREE.BufferAttribute(aa, 2));
  return g;
})();

// 背景の線を細かい線分の集まりにした形。スタイルと線の本数ごとに作って使い回す
const lineGeoCache = {};
const lineGeo = (styleName, mul = 1) => {
  const key = styleName + mul;
  if (lineGeoCache[key]) return lineGeoCache[key];
  const st = FIELD_STYLES[styleName];
  const uv = [];
  st.fam.forEach(({ dir, n: n0 }, sid) => {
    const n = Math.round(n0 * mul);
    for (let i = 0; i < n; i++) {
      // リボンは端の線を避けて、帯の内側に均等に（他は輪・筒・球をぐるっと均等に）
      const c = sid === 0 ? (i + 0.5) / n : i / n;
      for (let k = 0; k < st.seg; k++) {
        if (dir === 'v') uv.push(k / st.seg, c, sid, (k + 1) / st.seg, c, sid);
        else uv.push(c, k / st.seg, sid, c, (k + 1) / st.seg, sid);
      }
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(uv), 3)); // x=u, y=v, z=面の番号
  return (lineGeoCache[key] = g);
};
// 背景の粒子は位置をシェーダーで決めるので、形はダミー（粒子の数だけ）
const fieldGeo = (() => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(COUNT * 3), 3));
  g.setAttribute('aRand', randAttr);
  return g;
})();

/* ---------------------------------------------------------
   セクションごとに、図形または背景をつくる
   --------------------------------------------------------- */
const instances = CONFIG.map((c, idx) => {
  const el = document.querySelector(c.sel);
  if (!el) return null;
  const inst = { ...c, el, clipEl: c.clip ? document.querySelector(c.clip) : el, scene: new THREE.Scene(), bloomT: c.bloom ? 0 : 1 };
  inst.color3 = new THREE.Color(c.color);
  if (c.kind === 'shape') {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(SHAPES[c.shape], 3));
    geo.setAttribute('aTo', new THREE.BufferAttribute(SHAPES[c.to ? c.to.shape : c.shape], 3));
    geo.setAttribute('aRand', randAttr);
    if (c.to) inst.toEl = document.querySelector(c.to.sel);
    inst.uniforms = {
      uTime: shared.uTime, uPixel: shared.uPixel, uRes: shared.uRes, uGrid: shared.uGrid,
      uSize: { value: 1.7 }, uScatter: { value: 0 }, uBloom: { value: inst.bloomT }, uMorph: { value: 0 },
      uColor: { value: inst.color3 }, uOpacity: { value: 1 },
    };
    const mat = new THREE.ShaderMaterial({ uniforms: inst.uniforms, vertexShader: SHAPE_VS, fragmentShader: POINT_FS, transparent: true, depthWrite: false, depthTest: false });
    inst.group = new THREE.Group();   // 置き場所・大きさ
    inst.spin = new THREE.Group();    // ゆっくりした回転
    inst.group.add(inst.spin);
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    inst.spin.add(pts);
    inst.scene.add(inst.group);
    inst.spin.rotation.y = idx * 1.3; // セクションごとに向きを変えておく
  } else if (c.kind === 'floor') {
    inst.uniforms = { uTime: shared.uTime, uColor: { value: inst.color3 }, uOpacity: { value: 1 } };
    const lines = new THREE.LineSegments(BEYOND_BG.geo, new THREE.ShaderMaterial({ uniforms: inst.uniforms, vertexShader: BEYOND_BG.vs, fragmentShader: POINT_FS, transparent: true, depthWrite: false, depthTest: false }));
    lines.frustumCulled = false;
    inst.scene.add(lines);
    // 地平線を点線の位置に合わせるため、専用のカメラ（視点の高さ＝床より上、水平に見る）
    inst.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
    inst.camera.position.set(0, 0, 9);
    inst.horizonEl = document.querySelector(c.horizon);
  } else if (c.style === 'svg') {
    inst.uniforms = {
      uTime: shared.uTime, uPixel: shared.uPixel, uRes: shared.uRes, uGrid: shared.uGrid,
      uSize: { value: 1.5 }, uArt: { value: new THREE.Vector2(10, 7) }, uLineA: { value: c.lineA },
      uColor: { value: inst.color3 }, uOpacity: { value: 1 },
    };
    inst.group = new THREE.Group();
    const lines = new THREE.LineSegments(ellGeo, new THREE.ShaderMaterial({ uniforms: inst.uniforms, vertexShader: ELL_LINE_VS, fragmentShader: POINT_FS, transparent: true, depthWrite: false, depthTest: false }));
    const pts = new THREE.Points(ellPointGeo, new THREE.ShaderMaterial({ uniforms: inst.uniforms, vertexShader: ELL_POINT_VS, fragmentShader: POINT_FS, transparent: true, depthWrite: false, depthTest: false }));
    lines.frustumCulled = pts.frustumCulled = false;
    inst.group.add(lines, pts);
    inst.scene.add(inst.group);
  } else {
    inst.uniforms = {
      uTime: shared.uTime, uPixel: shared.uPixel, uRes: shared.uRes, uGrid: shared.uGrid,
      uSize: { value: 1.7 }, uHw: { value: new THREE.Vector2(5, 3) }, uPhase: { value: idx * 1.7 },
      uLineA: { value: c.lineA || 1 },   // 線のくっきり具合（色はそのまま）
      uLineN: { value: new THREE.Vector4(...[0, 1, 2, 3].map((k) => { const f = FIELD_STYLES[c.style].fam[k]; return f ? Math.round(f.n * (c.lines || 1)) : 1; })) },
      uColor: { value: inst.color3 }, uOpacity: { value: 1 },
    };
    inst.group = new THREE.Group();
    const st = FIELD_STYLES[c.style];
    const pts = new THREE.Points(fieldGeo, new THREE.ShaderMaterial({ uniforms: inst.uniforms, vertexShader: fieldVS(st), fragmentShader: POINT_FS, transparent: true, depthWrite: false, depthTest: false }));
    const lines = new THREE.LineSegments(lineGeo(c.style, c.lines || 1), new THREE.ShaderMaterial({ uniforms: inst.uniforms, vertexShader: lineVS(st), fragmentShader: POINT_FS.replace('vAlpha * uOpacity', 'vAlpha * uOpacity'), transparent: true, depthWrite: false, depthTest: false }));
    pts.frustumCulled = lines.frustumCulled = false;
    lines.renderOrder = -1; // 線を先（奥）に描く
    inst.group.add(lines, pts);
    inst.scene.add(inst.group);
  }
  return inst;
}).filter(Boolean);

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
  shared.uPixel.value = dpr;
  shared.uRes.value.set(W * dpr, H * dpr);
  halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
  halfW = halfH * camera.aspect;
}
resize();
addEventListener('resize', resize);

// 画面の縦位置（px）→ z=0 の面での y
const pxToY = (py) => (0.5 - py / H) * 2 * halfH;

/* ---------------------------------------------------------
   マウスに少しだけ反応して傾く（図形だけ）
   --------------------------------------------------------- */
const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
addEventListener('pointermove', (e) => {
  pointer.tx = e.clientX / W - 0.5;
  pointer.ty = e.clientY / H - 0.5;
}, { passive: true });

/* ---------------------------------------------------------
   毎フレーム：見えているセクションの分だけ、そのセクションの範囲に切り抜いて描く
   --------------------------------------------------------- */
let last = performance.now();
let intro = 0;   // ローディング明けに、散らばった状態から集まってくる（FV）
let started = false;

function frame(now) {
  requestAnimationFrame(frame);
  tick(now);
}
function tick(now) {
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
  last = Math.max(last, now);
  const t = now / 1000;
  shared.uTime.value = t;
  if (started) intro = Math.min(1, intro + dt / 3.2);
  const introK = 1 - Math.pow(1 - intro, 3);

  pointer.x += (pointer.tx - pointer.x) * 0.04;
  pointer.y += (pointer.ty - pointer.y) * 0.04;

  renderer.setScissorTest(false);
  renderer.clear();
  if (H <= 0) return;
  renderer.setScissorTest(true);

  for (const inst of instances) {
    const r = inst.el.getBoundingClientRect();
    const cr = inst.clipEl.getBoundingClientRect();
    const top = Math.max(0, cr.top), bottom = Math.min(H, cr.bottom);
    // 花開く図形：セクションが画面の 7 割の高さまで入ってきたら開き始める。画面の下に出たら閉じた状態に戻す
    if (inst.bloom) {
      if (r.top > H) inst.bloomT = 0;
      else if (r.top < H * 0.7) inst.bloomT = Math.min(1, inst.bloomT + (reduceMotion ? 1 : dt / 2.2));
      inst.uniforms.uBloom.value = inst.bloomT;
    }
    if (bottom <= top) continue; // 画面に入っていない

    if (inst.kind === 'shape') {
      const conf = isSP ? { ...inst, ...inst.sp } : inst;
      // fixed：画面に固定（追いかける）。それ以外：セクションの中心からの位置に置き、セクションと一緒にスクロールする
      let cy = inst.fixed ? H / 2 - conf.y * H * 0.5 : r.top + r.height / 2 - conf.y * H * 0.5;
      let cx = conf.x, cs = conf.s;
      if (inst.to && inst.toEl) {
        // 組み替え先のセクションの上端が画面の 6 割の高さに来てから、画面の上端に来るまでの間に、移動して形を変える
        const to = isSP ? { ...inst.to, ...inst.to.sp } : inst.to;
        const tr = inst.toEl.getBoundingClientRect();
        const m = Math.min(1, Math.max(0, (H * 0.6 - tr.top) / (H * 0.6)));
        const me = m < 0.5 ? 4 * m * m * m : 1 - Math.pow(-2 * m + 2, 3) / 2;
        const toY = tr.top + tr.height / 2 - to.y * H * 0.5;  // 組み替え先のセクションに収まる位置（一緒にスクロール）
        // 横は先に進め、縦は後から追いつく ＋ 途中で上にふくらむ弧（考え方の文字の上を横切らないように）
        const mx = Math.min(1, m * 1.15), mxe = mx < 0.5 ? 4 * mx * mx * mx : 1 - Math.pow(-2 * mx + 2, 3) / 2;
        const my = Math.max(0, (m - 0.12) / 0.88), mye = my < 0.5 ? 4 * my * my * my : 1 - Math.pow(-2 * my + 2, 3) / 2;
        cy += (toY - cy) * mye - Math.sin(Math.PI * m) * H * 0.09;
        cx += (to.x - cx) * mxe;
        cs += (to.s - cs) * me;
        inst.uniforms.uMorph.value = m;
      }
      const floatY = Math.sin(t * 0.45 + conf.shape) * 0.08 + Math.sin(t * 0.21 + 1.3) * 0.05;
      const floatX = Math.cos(t * 0.33) * 0.06;
      inst.group.position.set(cx * halfW + floatX, pxToY(cy) + floatY, 0);
      const s = cs * (isSP ? 1 : Math.min(1.15, Math.max(0.8, W / 1440)));
      inst.group.scale.setScalar(inst.intro ? s * (0.85 + 0.15 * introK) : s);
      if (inst.intro) inst.uniforms.uScatter.value = reduceMotion ? 0 : (1 - introK) * 2.2;
      if (!reduceMotion) {
        inst.spin.rotation.y += dt * 0.12;
        inst.spin.rotation.x = Math.sin(t * 0.17 + conf.shape) * 0.45 + pointer.y * 0.4;
        inst.spin.rotation.z = Math.sin(t * 0.11 + 2.0) * 0.35;
        inst.group.rotation.y = pointer.x * 0.5;
      }
    } else if (inst.kind === 'floor') {
      // 地平線（消失点の高さ）を点線の位置に合わせる
      // 床のいちばん奥の端は、本当の地平線より少し下に見えるので、その分だけ上にずらしてぴったり点線に合わせる
      const farGap = (Math.abs(BEYOND_BG.groundY) / (inst.camera.position.z - BEYOND_BG.far)) / Math.tan(THREE.MathUtils.degToRad(inst.camera.fov / 2)) * H / 2;
      const hy = (inst.horizonEl ? inst.horizonEl.getBoundingClientRect().top : H * 0.4) - farGap;
      inst.camera.aspect = W / H;
      inst.camera.setViewOffset(W, H, 0, H / 2 - hy, W, H);
      inst.camera.updateProjectionMatrix();
    } else if (inst.style === 'svg') {
      // セクションの中心に置き、画面を少しはみ出すくらいの大きさに（花びらの形が見える大きさ。左右・上下は見切れる）
      const aspect = ELL.w / ELL.h;
      const artH = Math.max(2 * halfH, (2 * halfW) / aspect) * (r.height > H * 1.3 ? 1.35 : 1.12);
      inst.uniforms.uArt.value.set(artH * aspect, artH);
      inst.group.position.set(Math.sin(t * 0.06) * 0.15, pxToY(r.top + r.height / 2) + Math.sin(t * 0.08) * 0.1, 0);
      // ゆっくり傾いたり漂ったりして、その場で動き続ける
      inst.group.rotation.set(Math.sin(t * 0.05) * 0.08, Math.sin(t * 0.07 + 1.0) * 0.18, Math.sin(t * 0.04) * 0.03);
      inst.group.scale.setScalar(1 + Math.sin(t * 0.09) * 0.02);
    } else {
      // 背景：セクションの中心に置き、セクションの高さいっぱいに広げる
      inst.group.position.set(0, pxToY(r.top + r.height / 2), 0);
      const ratio = r.height / H;
      inst.uniforms.uHw.value.set(halfW, halfH * (inst.style === 'mesh' ? Math.max(1, ratio) : Math.min(1.25, Math.max(1, ratio))));
    }

    // このセクションの範囲だけに描く（隣のセクションにはみ出さない）
    renderer.setScissor(0, H - bottom, W, bottom - top);
    renderer.render(inst.scene, inst.camera || camera);
  }
}

// ローディングが終わったら表示を始める
function start() {
  if (started) return;
  started = true;
  canvas.classList.add('is-ready');
}
if (window.__loaderDone) start();
else addEventListener('loader:done', start, { once: true });
requestAnimationFrame(frame);

// 確認用
window.__particles = {
  get intro() { return intro; },
  get visible() { return instances.filter((i) => { const r = i.clipEl.getBoundingClientRect(); return r.bottom > 0 && r.top < H; }).map((i) => i.sel); },
  get bloom() { const a = instances.find((i) => i.bloom); return a ? a.bloomT : null; },
  // タブが裏にあるとき用：n フレーム分すすめる
  step(n = 60) { let t = last; for (let i = 0; i < n; i++) { t += 16.7; tick(t); } },
};
})();
