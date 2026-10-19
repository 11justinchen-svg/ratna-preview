// The ring, in real time (react-three-fiber). Everything is modelled in code: no photos, no model files.
// - The diamond is a convex hull of a round brilliant's real proportions (56% table, ~16% crown,
//   ~43% pavilion). Oval, radiant and pear are morph targets of that same mesh, so the stone
//   genuinely changes shape on screen instead of cutting to another one.
// - Its shader fakes what makes a diamond read as a diamond: a bright reflection on top, and light
//   that refracts in, bounces off the pavilion and comes back split into colour (fire).
// - The setting (band, gallery, six prongs) is lathe and tube geometry. Its CAD state is the same
//   geometry drawn as a wireframe, and "casting" is a clipping plane sweeping metal up through it.
// Scroll progress comes from home.js (window.Ratna.story).
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ConvexGeometry } from "three/addons/geometries/ConvexGeometry.js";
import htm from "htm";

const html = htm.bind(React.createElement);
const R = window.Ratna;
const { clamp, range, ease, reduced } = R;
const lerp = (a, b, t) => a + (b - a) * t;
const IVORY = new THREE.Color("#F8ECDE"); // matches --ivory, the logo's cream
const NIGHT = new THREE.Color("#0E0D0C");
const STONE_Y = 3.5; // girdle height above the ring's centre; the band's outer radius is 2.45
// Hero: the word RATNA, with the ring worn on its T like a ring on a finger
const CAP = 7; // cap height of the letters, in the same units as the ring
const WORN_Y = 0.2; // where the band sits on the T's stem
const WORN_SCALE = 1.45;
const WORN_TILT = Math.PI / 2 + 0.3; // axis down the stem, front edge tipped down so you look into the ring
const INK = "#2A2119"; // the dark brown of RATNA in the logo
let WORD_W = 46; // measured once the letters are set

/* ---------- Diamond geometry (radius 1 ≈ a 2 ct round, about 8.1 mm across) ---------- */
function brilliantPoints() {
  const pts = [];
  const ring = (n, r, y, off) => {
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + off;
      pts.push(new THREE.Vector3(r * Math.cos(a), y, r * Math.sin(a)));
    }
  };
  ring(8, 0.56, 0.32, Math.PI / 8); // table
  ring(8, 0.8, 0.166, 0); // star tips, just proud of the crown cone so they become facets
  ring(16, 1, 0.02, Math.PI / 16); // girdle, top edge
  ring(16, 1, -0.02, Math.PI / 16); // girdle, bottom edge
  ring(8, 0.55, -0.43, Math.PI / 8); // lower girdle facets
  pts.push(new THREE.Vector3(0, -0.86, 0)); // culet
  return pts;
}

// Shape maps, applied to the round's vertices. The long axis runs along z, down the finger.
const SHAPES = {
  oval: (x, y, z) => [x * 0.86, y, z * 1.3],
  radiant: (x, y, z) => {
    const r = Math.hypot(x, z);
    if (r < 1e-6) return [x, y, z];
    const c = Math.abs(x / r),
      s = Math.abs(z / r);
    const k = 1 / Math.max(c / 0.9, s / 1.22, (c + s) / 1.62); // a rectangle with cut corners
    return [x * k, y, z * k];
  },
  pear: (x, y, z) => {
    const t = clamp(z); // the point grows toward +z
    return [
      x * (1.02 - 0.84 * Math.pow(t, 1.6)),
      y,
      (z > 0 ? z * 1.5 : z) - 0.18,
    ];
  },
};

function flatNormals(pos) {
  const n = new Float32Array(pos.length),
    a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3();
  for (let i = 0; i < pos.length; i += 9) {
    a.fromArray(pos, i);
    b.fromArray(pos, i + 3);
    c.fromArray(pos, i + 6);
    const f = b.sub(a).cross(c.sub(a)).normalize();
    for (let j = 0; j < 3; j++) f.toArray(n, i + j * 3);
  }
  return new THREE.Float32BufferAttribute(n, 3);
}

function diamondGeometry() {
  const g = new ConvexGeometry(brilliantPoints());
  const base = g.attributes.position.array;
  g.setAttribute("normal", flatNormals(base));
  const targets = Object.values(SHAPES).map((fn) => {
    const out = new Float32Array(base.length);
    for (let i = 0; i < base.length; i += 3)
      out.set(fn(base[i], base[i + 1], base[i + 2]), i);
    return out;
  });
  g.morphAttributes.position = targets.map(
    (t) => new THREE.Float32BufferAttribute(t, 3),
  );
  g.morphAttributes.normal = targets.map(flatNormals);
  g.userData = { base, targets };
  return g;
}

// The stone as a set of facet planes (outward normal + offset), merged where triangles are coplanar,
// for whatever shape the morph weights currently describe. The shader traces rays against these.
const MAX_FACETS = 128;
function facetsOf(g, weights) {
  const { base, targets } = g.userData;
  const pos = new Float32Array(base.length);
  for (let i = 0; i < base.length; i++) {
    let v = base[i];
    for (let k = 0; k < targets.length; k++)
      v += weights[k] * (targets[k][i] - base[i]);
    pos[i] = v;
  }
  const facets = [],
    a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3();
  for (let i = 0; i < pos.length; i += 9) {
    a.fromArray(pos, i);
    b.fromArray(pos, i + 3);
    c.fromArray(pos, i + 6);
    const centre = a.clone().add(b).add(c).divideScalar(3);
    const n = b.clone().sub(a).cross(c.clone().sub(a));
    const area = n.length() / 2;
    if (area < 1e-6) continue;
    n.normalize();
    const d = n.dot(a);
    const same = facets.find(
      (f) => f.n.dot(n) > 0.9995 && Math.abs(f.d - d) < 2e-3,
    );
    if (same) {
      same.c.addScaledVector(centre, area);
      same.area += area;
    } else facets.push({ n, d, c: centre.multiplyScalar(area), area });
  }
  facets.forEach((f) => f.c.divideScalar(f.area));
  return facets.slice(0, MAX_FACETS);
}

/* ---------- Setting geometry ---------- */
function bandGeometry(radial = 160, profileSteps = 6) {
  // A comfort-fit band: a rounded rectangle (inner radius 2.05, outer 2.45, 1.8 mm wide) revolved
  const r0 = 2.05,
    r1 = 2.45,
    w = 0.22,
    c = 0.13,
    pts = [];
  const arc = (cx, cy, a0) => {
    for (let i = 0; i <= profileSteps; i++) {
      const a = a0 + ((i / profileSteps) * Math.PI) / 2;
      pts.push(new THREE.Vector2(cx + c * Math.cos(a), cy + c * Math.sin(a)));
    }
  };
  arc(r1 - c, -w + c, -Math.PI / 2);
  arc(r1 - c, w - c, 0);
  arc(r0 + c, w - c, Math.PI / 2);
  arc(r0 + c, -w + c, Math.PI);
  pts.push(pts[0].clone());
  const g = new THREE.LatheGeometry(pts, radial);
  g.rotateX(Math.PI / 2); // the finger runs along z; the band stands up facing the camera
  return g;
}

function prongCurves() {
  return Array.from({ length: 6 }, (_, k) => {
    const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
    const at = (r, y) => new THREE.Vector3(r * Math.cos(a), y, r * Math.sin(a));
    return new THREE.CatmullRomCurve3([
      at(0.4, 2.4),
      at(0.82, 2.95),
      at(1.04, STONE_Y - 0.05),
      at(0.93, STONE_Y + 0.2),
    ]);
  });
}

function galleryGeometry(seg = 64) {
  const a = new THREE.TorusGeometry(0.66, 0.05, 10, seg);
  a.rotateX(Math.PI / 2);
  a.translate(0, 2.98, 0);
  const b = new THREE.TorusGeometry(0.46, 0.05, 10, seg);
  b.rotateX(Math.PI / 2);
  b.translate(0, 2.6, 0);
  return [a, b];
}

/* ---------- The studio the ring is lit by (never seen directly, only in reflections) ---------- */
function studioScene() {
  const s = new THREE.Scene();
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(40, 40, 40),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color("#c9c3b9"), // a light tent, the way jewellery is photographed
      side: THREE.BackSide,
    }),
  );
  s.add(box);
  const panel = (w, h, pos, rot, intensity, tint = "#ffffff") => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(tint).multiplyScalar(intensity),
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    );
    m.position.set(...pos);
    m.lookAt(0, 0, 0);
    if (rot) m.rotateZ(rot);
    s.add(m);
  };
  panel(14, 14, [0, 16, 0], 0, 3.2); // overhead softbox
  panel(4, 18, [-15, 3, 4], 0, 6); // key strip
  panel(2.5, 18, [15, 3, -4], 0, 4.2, "#fff6ea"); // warm rim strip
  panel(18, 5, [0, 5, 16], 0, 2.2); // front fill
  panel(1.6, 1.6, [6, 11, 8], 0, 22); // two hot spots: they become sparkles in the stone
  panel(1.2, 1.2, [-8, 9, -9], 0, 18);
  // Black flags: they draw the dark lines that give polished metal its shape and facets their contrast
  panel(9, 14, [-11, 0, 11], 0, 0);
  panel(7, 14, [12, -1, -9], 0, 0);
  panel(20, 9, [0, 0, -17], 0, 0);
  panel(40, 5, [0, -7, 15], 0, 0.02);
  panel(30, 30, [0, -16, 0], 0, 0.05); // dark floor
  return s;
}

/* ---------- Materials ---------- */
// The stone's own studio: a white light tent full of small hot lights and black cards, the way
// diamonds are photographed. Each facet catches a different mix of them, so the stone flashes
// bright with sharp dark structure instead of glowing evenly grey.
function sparkleStudio() {
  const s = new THREE.Scene();
  const lights = [];
  s.add(
    new THREE.Mesh(
      new THREE.BoxGeometry(40, 40, 40),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(0.16, 0.155, 0.15),
        side: THREE.BackSide,
      }),
    ),
  );
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const card = (w, h, dir, intensity) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(1, 1, 1).multiplyScalar(intensity),
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    );
    m.position.copy(dir.normalize().multiplyScalar(16));
    m.lookAt(0, 0, 0);
    s.add(m);
    if (intensity > 18) lights.push(dir.clone().normalize());
  };
  card(6, 6, new THREE.Vector3(0, 1, 0.15), 0); // a dark spot overhead: the viewer, reflected, darkens the table
  card(7, 7, new THREE.Vector3(0.7, 1, -0.4), 4); // two softboxes off the zenith
  card(7, 7, new THREE.Vector3(-0.7, 1, 0.5), 3.4);
  card(4, 16, new THREE.Vector3(-1, 0.2, 0.3), 8); // key strip
  card(3, 16, new THREE.Vector3(1, 0.2, -0.3), 6); // rim strip
  card(7, 7, new THREE.Vector3(0, 0.35, 1), 0); // the camera's own dark reflection, as in any diamond photo
  // Most of the light a diamond returns comes from above it, so that's where the pattern goes
  for (let i = 0; i < 120; i++) {
    const up = rand() < 0.75;
    const v = new THREE.Vector3(
      rand() * 2 - 1,
      up ? 0.25 + rand() * 1.2 : rand() * 0.9 - 0.6,
      rand() * 2 - 1,
    );
    const size = 1 + rand() * 3;
    card(size, size * (0.5 + rand()), v, rand() < 0.6 ? 6 + rand() * 30 : 0); // a hot light, or a black card
  }
  return { scene: s, lights };
}

// The stone is ray-traced through its own facets. A diamond is convex, so a ray inside it leaves
// through whichever facet plane it reaches first; no scene search is needed. Each ray enters through
// the facet you're looking at, bounces by total internal reflection until it meets a facet it can
// escape through, and leaves bent by diamond's refractive index (2.42) into the studio. At that exit,
// red, green and blue bend by slightly different amounts, and that split is fire. (Real diamond spreads
// 2.407 to 2.451; this uses about two-thirds of that, so fire shows as flashes, not violet patches.)
function diamondMaterial(envCube) {
  const m = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    roughness: 0,
    metalness: 0,
  });
  const uniforms = {
    uEnv: { value: envCube },
    uModel: { value: new THREE.Matrix3() },
    uPlanes: {
      value: Array.from({ length: MAX_FACETS }, () => new THREE.Vector4()),
    },
    uPlaneCount: { value: 0 },
    uExposure: { value: 1 },
  };
  m.userData.uniforms = uniforms;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vLocal;\nvarying vec3 vLocalN;\nvarying vec3 vLocalEye;",
      )
      .replace(
        "#include <morphtarget_vertex>",
        "#include <morphtarget_vertex>\nvLocal = transformed;\nvLocalEye = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz;",
      )
      .replace(
        "#include <morphnormal_vertex>",
        "#include <morphnormal_vertex>\nvLocalN = objectNormal;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform samplerCube uEnv;
        uniform mat3 uModel;
        uniform vec4 uPlanes[${MAX_FACETS}];
        uniform int uPlaneCount;
        uniform float uExposure;
        varying vec3 vLocal;
        varying vec3 vLocalN;
        varying vec3 vLocalEye;
        vec3 studio(vec3 d) { return textureCube(uEnv, normalize(uModel * d)).rgb; }
        // March to the facet the ray leaves through: the nearest plane it is heading out of
        vec3 exitFacet(inout vec3 p, vec3 dir) {
          float tmin = 1e4;
          vec3 nh = vec3(0.0, 1.0, 0.0);
          for (int i = 0; i < ${MAX_FACETS}; i++) {
            if (i >= uPlaneCount) break;
            vec4 pl = uPlanes[i];
            float den = dot(dir, pl.xyz);
            if (den > 1e-4) {
              float t = (pl.w - dot(p, pl.xyz)) / den;
              if (t > 1e-4 && t < tmin) { tmin = t; nh = pl.xyz; }
            }
          }
          p += dir * tmin;
          return nh;
        }`,
      )
      .replace(
        "#include <opaque_fragment>",
        `
        vec3 I = normalize(vLocal - vLocalEye);
        vec3 N = normalize(vLocalN);
        float F = 0.17 + 0.83 * pow(1.0 - clamp(dot(-I, N), 0.0, 1.0), 5.0);
        vec3 surface = studio(reflect(I, N));
        vec3 dir = refract(I, N, 1.0 / 2.42);
        vec3 p = vLocal + dir * 1e-3;
        vec3 inside = vec3(0.0);
        float carry = 1.0;
        bool out_ = false;
        for (int b = 0; b < 7; b++) {
          vec3 n = exitFacet(p, dir);
          vec3 g = refract(dir, -n, 2.42);
          if (dot(g, g) > 0.0) {
            vec3 r = refract(dir, -n, 2.411);
            vec3 bl = refract(dir, -n, 2.436);
            if (dot(r, r) == 0.0) r = g;
            if (dot(bl, bl) == 0.0) bl = g;
            inside = carry * vec3(studio(r).r, studio(g).g, studio(bl).b);
            out_ = true;
            break;
          }
          dir = reflect(dir, -n); // total internal reflection: the light stays in and keeps working
          carry *= 0.97;
        }
        if (!out_) inside = carry * studio(dir) * 0.4;
        gl_FragColor = vec4(mix(inside, surface, F) * uExposure, 1.0);
      `,
      );
  };
  return m;
}

// A four-point star, for the instant a facet lines up with a light
function glintTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const x = c.getContext("2d");
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.08, "rgba(255,252,245,.8)");
  g.addColorStop(0.25, "rgba(255,248,235,.12)");
  g.addColorStop(1, "rgba(255,248,235,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  x.globalCompositeOperation = "lighter";
  const ray = (angle, len, width, alpha) => {
    x.save();
    x.translate(64, 64);
    x.rotate(angle);
    const lg = x.createLinearGradient(-len, 0, len, 0);
    lg.addColorStop(0, "rgba(255,255,255,0)");
    lg.addColorStop(0.5, `rgba(255,255,255,${alpha})`);
    lg.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = lg;
    x.fillRect(-len, -width / 2, len * 2, width);
    x.restore();
  };
  ray(0, 64, 2.2, 0.95);
  ray(Math.PI / 2, 64, 2.2, 0.95);
  ray(Math.PI / 4, 34, 1.4, 0.45);
  ray(-Math.PI / 4, 34, 1.4, 0.45);
  return new THREE.CanvasTexture(c);
}

function shadowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const x = c.getContext("2d");
  const g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, "rgba(58,44,30,.42)");
  g.addColorStop(0.45, "rgba(58,44,30,.16)");
  g.addColorStop(1, "rgba(58,44,30,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

/* ---------- The word ---------- */
// Five letter planes set in Cinzel (the free face closest to the logo's Roman capitals), spaced
// like the logo, centred on the T so the ring can be worn on its stem. Each letter is its own
// plane so the word can come apart on scroll.
function wordmark() {
  const letters = [];
  const px = 420,
    pad = 28,
    gap = CAP * 0.52;
  const ctx = document.createElement("canvas").getContext("2d");
  ctx.font = `400 ${px}px Cinzel, "Times New Roman", serif`;
  const glyphs = [..."RATNA"].map((ch) => {
    const m = ctx.measureText(ch);
    return {
      ch,
      m,
      w: m.actualBoundingBoxLeft + m.actualBoundingBoxRight,
      asc: m.actualBoundingBoxAscent,
      desc: Math.max(0, m.actualBoundingBoxDescent),
    };
  });
  const capPx = glyphs.find((g) => g.ch === "T").asc;
  const k = CAP / capPx; // world units per canvas pixel
  // Ink boxes laid out left to right, then shifted so the T's centre sits at x = 0
  let x = 0;
  const lefts = glyphs.map((g) => {
    const l = x;
    x += g.w * k + gap;
    return l;
  });
  const shift = lefts[2] + (glyphs[2].w * k) / 2;
  WORD_W = x - gap;
  glyphs.forEach((g, i) => {
    const c = document.createElement("canvas");
    c.width = Math.ceil(g.w + pad * 2);
    c.height = Math.ceil(g.asc + g.desc + pad * 2);
    const cx = c.getContext("2d");
    cx.font = ctx.font;
    cx.fillStyle = INK;
    cx.fillText(g.ch, pad + g.m.actualBoundingBoxLeft, pad + g.asc);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(c.width * k, c.height * k),
      mat,
    );
    // Baseline at -CAP/2, so the capitals are centred on y = 0
    const baseX = lefts[i] - shift + (g.w * k) / 2;
    mesh.position.set(baseX, -CAP / 2 - (c.height / 2 - (pad + g.asc)) * k, 0);
    mesh.userData = { baseX, baseY: mesh.position.y, side: Math.sign(i - 2) };
    mesh.renderOrder = 2; // after the metal: the stem hides the back of the band, the front of the band hides the stem
    letters.push(mesh);
  });
  return { letters, width: WORD_W };
}

// The light a diamond throws: not a water web but scattered flecks of spectrum on the wall,
// streaking outward from the stone, each split red to violet along its length (that split is
// dispersion, the "fire"). The pattern turns with the stone, so the flecks wheel as it swings.
function causticMaterial() {
  return new THREE.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uBg: { value: new THREE.Vector3() },
      uStone: { value: new THREE.Vector2() },
      uRes: { value: new THREE.Vector2(1, 1) },
      uAmount: { value: 1 },
      uSpin: { value: 0 },
    },
    vertexShader:
      "void main() { gl_Position = vec4(position.xy, 0.9999, 1.0); }",
    fragmentShader: `
      uniform float uTime; uniform vec3 uBg; uniform vec2 uStone; uniform vec2 uRes; uniform float uAmount; uniform float uSpin;
      float hash(float n) { return fract(sin(n * 127.1) * 43758.5453); }
      vec3 spectrum(float x) { // red → yellow → green → blue → violet, soft-edged
        x = clamp(x, 0.0, 1.0);
        return clamp(vec3(abs(x * 6.0 - 3.0) - 1.0, 2.0 - abs(x * 6.0 - 2.0), 2.0 - abs(x * 6.0 - 4.0)), 0.0, 1.0);
      }
      vec4 flecks(vec2 d, float n, float seed) {
        float r = length(d);
        float a = atan(d.y, d.x) + uSpin * (1.0 + seed * 0.4);
        float sector = floor((a + 3.14159265) / 6.2831853 * n);
        float h1 = hash(sector + seed), h2 = hash(sector * 1.7 + seed + 3.1), h3 = hash(sector * 2.3 + seed + 7.7);
        if (h1 < 0.8) return vec4(0.0);
        float ac = ((sector + 0.5 + (h2 - 0.5) * 0.5) / n) * 6.2831853 - 3.14159265;
        float da = (a - ac) * r;                       // distance across the streak
        float rc = 0.14 + pow(h3, 0.8) * 0.7;          // how far from the stone it lands
        float len = 0.012 + h2 * 0.03;                 // streak length
        float wid = 0.0028 + h1 * 0.0026;              // streak width
        float u = (r - rc) / len;                      // -1..1 along the streak
        float shape = smoothstep(1.0, 0.55, abs(u)) * exp(-pow(da / wid, 2.0));
        float twinkle = 0.55 + 0.45 * sin(uTime * (0.6 + h2) + h3 * 40.0);
        return vec4(spectrum(u * 0.5 + 0.5), shape * twinkle * smoothstep(0.92, 0.2, r));
      }
      void main() {
        vec2 d = (gl_FragCoord.xy - uStone) / uRes.y;
        vec4 f1 = flecks(d, 70.0, 0.0);
        vec4 f2 = flecks(d, 131.0, 11.0);
        vec3 col = uBg;
        col = mix(col, mix(uBg, f1.rgb, 0.8), f1.a * 0.55 * uAmount);
        col = mix(col, mix(uBg, f2.rgb, 0.7), f2.a * 0.35 * uAmount);
        float glow = exp(-length(d) * 7.0) * 0.05 * uAmount; // a breath of warm light around the stone
        col += glow * vec3(1.0, 0.92, 0.78);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

/* ---------- Camera shots ---------- */
// Each shot: where the camera looks, how far it stands, how high it looks down from.
function shots(aspect, compact) {
  const fitH = 6.3 / (0.45 * 0.425),
    fitW = 4.9 / (0.66 * 0.425 * aspect);
  const d = Math.max(fitH, fitW);
  const portrait = aspect < 0.8;
  // Hero: the whole word across a wide screen, letters just kissing the edges. On a phone the
  // word is cropped to the T and the ring, like a poster.
  const heroD = portrait
    ? (CAP * 2.25) / (0.425 * aspect)
    : Math.max((WORD_W * 0.94) / (0.425 * aspect), CAP / (0.46 * 0.425));
  return {
    hero: { tx: 0, ty: portrait ? -0.6 : -1.4, d: heroD, pitch: 0.07 },
    stone: {
      tx: 0,
      ty: STONE_Y,
      d: Math.max(12.7, 10.2 / aspect),
      pitch: 0.52,
    },
    cad: { tx: 0, ty: 0.75, d: d * 1.04, pitch: 0.24 },
    final: { tx: 0, ty: 0.65, d: d * 0.98, pitch: 0.14 },
  };
}
const mixShot = (a, b, t) => ({
  tx: lerp(a.tx, b.tx, t),
  ty: lerp(a.ty, b.ty, t),
  d: lerp(a.d, b.d, t),
  pitch: lerp(a.pitch, b.pitch, t),
});

// Everything the scene shows, derived from the two progress values (or fixed, for the still frames)
function stateFor(hero, proc) {
  const s = {};
  if (proc <= 0) {
    s.shotFrom = "hero";
    s.shotTo = "stone";
    s.shotT = ease(range(hero, 0.3, 0.95));
    s.bg = ease(range(hero, 0.35, 0.85));
    s.metal = 1 - range(hero, 0.45, 0.8);
    s.cast = 99;
    s.yaw = lerp(-0.85, -0.05, ease(range(hero, 0.25, 0.9)));
  } else {
    if (proc < 0.42) {
      s.shotFrom = "stone";
      s.shotTo = "stone";
      s.shotT = 0;
    } else if (proc < 0.7) {
      s.shotFrom = "stone";
      s.shotTo = "cad";
      s.shotT = ease(range(proc, 0.42, 0.62));
    } else {
      s.shotFrom = "cad";
      s.shotTo = "final";
      s.shotT = ease(range(proc, 0.7, 0.92));
    }
    s.bg = 1 - ease(range(proc, 0.72, 0.86));
    s.metal = proc > 0.6 ? 1 : 0;
    s.cast = lerp(-2.6, 4.1, ease(range(proc, 0.7, 0.86)));
    s.yaw =
      proc < 0.42
        ? -0.05
        : proc < 0.7
          ? lerp(-0.95, -0.4, ease(range(proc, 0.42, 0.7)))
          : lerp(-0.4, -0.75, ease(range(proc, 0.7, 1)));
  }
  s.lines = proc > 0 ? 1 - range(proc, 0.8, 0.93) : 0;
  s.draw = (a, b) => ease(range(proc, a, b));
  // Ends a quarter turn round: identical for a round stone, and the oval turns side-on early
  s.spin = proc > 0 ? ease(range(proc, 0, 0.4)) * Math.PI * 4.5 : 0;
  // Morph weights: oval → radiant → pear → round
  const w = (a, b) => range(proc, a, a + 0.03) * (1 - range(proc, b, b + 0.03));
  // The finished ring in the hero holds a round; once the setting has faded it becomes the oval
  s.morph =
    proc <= 0
      ? [range(hero, 0.82, 0.97), 0, 0]
      : [1 - range(proc, 0.11, 0.14), w(0.11, 0.2), w(0.2, 0.29)];
  s.offset = proc > 0 ? ease(range(proc, 0, 0.06)) : 0;
  // Hero only: 1 while the ring is worn on the T, 0 once it stands on its own
  s.worn = proc > 0 ? 0 : 1 - ease(range(hero, 0.18, 0.6));
  s.part = proc > 0 ? 1 : ease(range(hero, 0.1, 0.5)); // the letters come apart
  s.word = proc > 0 ? 0 : 1 - range(hero, 0.3, 0.55);
  s.caustics = proc > 0 ? 0 : 1 - range(hero, 0.25, 0.6);
  return s;
}

/* ---------- Scene ---------- */
function Ring({ still }) {
  const { gl, scene, camera, size } = useThree();
  const group = useRef(),
    stone = useRef(),
    shadow = useRef(),
    glints = useRef(),
    word = useRef();
  const parts = useMemo(() => {
    const studio = studioScene();
    const pmrem = new THREE.PMREMGenerator(gl);
    const envMap = pmrem.fromScene(studio, 0.035).texture;
    const cubeRT = new THREE.WebGLCubeRenderTarget(512, {
      type: THREE.HalfFloatType,
    });
    const sparkle = sparkleStudio();
    new THREE.CubeCamera(0.1, 100, cubeRT).update(gl, sparkle.scene);
    const castPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 99);
    const wirePlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 99);
    const metal = new THREE.MeshStandardMaterial({
      color: "#e8e6e2",
      metalness: 1,
      roughness: 0.15,
      envMapIntensity: 1.2,
      clippingPlanes: [castPlane],
      transparent: true,
    });
    const wireMat = new THREE.LineBasicMaterial({
      color: "#F5F2EC",
      transparent: true,
      depthWrite: false,
      clippingPlanes: [wirePlane],
    });
    const curves = prongCurves();
    const solid = [
      bandGeometry(),
      ...galleryGeometry(),
      ...curves.map((c) => new THREE.TubeGeometry(c, 32, 0.068, 12)),
      ...curves.map((c) => {
        const t = new THREE.SphereGeometry(0.082, 16, 12);
        t.translate(...c.getPoint(1).toArray());
        return t;
      }),
    ];
    const wires = [
      {
        g: new THREE.WireframeGeometry(bandGeometry(36, 1)),
        win: [0.42, 0.54],
      },
      ...galleryGeometry(24).map((g, i) => ({
        g: new THREE.WireframeGeometry(g),
        win: [0.5 + i * 0.02, 0.58 + i * 0.02],
      })),
      ...curves.map((c, i) => ({
        g: new THREE.WireframeGeometry(new THREE.TubeGeometry(c, 10, 0.068, 6)),
        win: [0.54 + i * 0.01, 0.6 + i * 0.01],
      })),
    ].map((w) => ({
      ...w,
      line: new THREE.LineSegments(w.g, wireMat),
      count: w.g.attributes.position.count,
    }));
    return {
      envMap,
      cubeRT,
      castPlane,
      wirePlane,
      metal,
      wireMat,
      solid,
      wires,
      diamond: diamondGeometry(),
      stoneMat: diamondMaterial(cubeRT.texture),
      shadowMap: shadowTexture(),
      lights: sparkle.lights,
      glintMap: glintTexture(),
      facetKey: "",
      crown: [],
      word: still ? null : wordmark(),
      caustics: still ? null : causticMaterial(),
      stoneWorld: new THREE.Vector3(),
    };
  }, [gl]);

  useEffect(() => {
    scene.environment = parts.envMap;
    scene.background = IVORY.clone();
    gl.localClippingEnabled = true;
    const el = gl.domElement.parentElement.closest(".ring3d");
    el && el.classList.add("ready");
    R.story.ready = true;
  }, [parts]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const { hero, proc } = still
      ? { hero: 1, proc: still === "cad" ? 0.66 : 1 }
      : R.story;
    const s = stateFor(hero, proc);
    const aspect = size.width / size.height;
    const sh = shots(aspect, size.width < 1100 && aspect >= 1.25);
    const shot = mixShot(sh[s.shotFrom], sh[s.shotTo], s.shotT);

    // Camera
    camera.position.set(
      shot.tx,
      shot.ty + Math.sin(shot.pitch) * shot.d,
      Math.cos(shot.pitch) * shot.d,
    );
    camera.lookAt(shot.tx, shot.ty, 0);
    // Where the ring sits on screen: beside the text when there's room, above it on phones.
    // On short, wide screens the hero's headline fills the left, so the ring moves right.
    const side = size.width >= 1100 || (aspect >= 1.25 && size.width >= 700);
    const ox = proc > 0 ? (side ? 0.13 : 0) * s.offset : 0;
    const oy = proc > 0 && !side ? 0.17 * s.offset : 0;
    if (still || (!ox && !oy)) camera.clearViewOffset();
    else
      camera.setViewOffset(
        size.width,
        size.height,
        -size.width * ox,
        size.height * oy,
        size.width,
        size.height,
      );

    // Room
    if (!scene.background) scene.background = new THREE.Color();
    if (!still) scene.background.copy(IVORY).lerp(NIGHT, s.bg);
    else
      scene.background.copy(
        still === "cad" ? NIGHT : new THREE.Color("#1A1816"),
      );

    // Ring: worn on the T in the hero (axis down the stem, stone facing out, swinging gently
    // round the letter), then lifted off and stood upright for the close-up. A slow breath of
    // rotation on top of the scroll keeps it from ever looking frozen.
    const worn = still ? 0 : s.worn;
    const idle =
      reduced || still ? 0 : Math.sin(t * 0.35) * lerp(0.07, 0.32, worn);
    const g = group.current;
    g.rotation.order = "YXZ";
    g.rotation.x = WORN_TILT * worn;
    g.rotation.y = lerp(s.yaw, 0, worn) + idle;
    g.position.set(0, WORN_Y * worn, 0);
    g.scale.setScalar(lerp(1, WORN_SCALE, worn));

    // The word comes apart: left letters drift left, right letters right, the T sinks out of the ring
    if (parts.word) {
      word.current.visible = s.word > 0.001;
      parts.word.letters.forEach((m) => {
        const { baseX, baseY, side } = m.userData;
        m.position.x =
          baseX + side * s.part * (CAP * 1.8 + Math.abs(baseX) * 0.35);
        m.position.y = baseY - (side === 0 ? s.part * CAP * 1.6 : 0);
        m.rotation.y = side * s.part * 0.5;
        m.material.opacity =
          s.word * (side === 0 ? 1 - range(s.part, 0.2, 0.7) : 1);
      });
    }

    // Caustics on the wall: follow the stone on screen, fade with the daylight
    if (parts.caustics) {
      const u = parts.caustics.uniforms;
      const dpr = state.gl.getPixelRatio();
      u.uTime.value = reduced ? 0 : t;
      u.uRes.value.set(size.width * dpr, size.height * dpr);
      u.uAmount.value = s.caustics;
      u.uSpin.value = group.current.rotation.y * 2.0;
      const bg = scene.background;
      u.uBg.value.set(
        ...[bg.r, bg.g, bg.b].map((v) =>
          v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055,
        ),
      );
      stone.current.getWorldPosition(parts.stoneWorld).project(camera);
      u.uStone.value.set(
        (parts.stoneWorld.x * 0.5 + 0.5) * size.width * dpr,
        (parts.stoneWorld.y * 0.5 + 0.5) * size.height * dpr,
      );
    }
    parts.metal.opacity = s.metal;
    parts.metal.visible = s.metal > 0.002;
    parts.castPlane.constant = s.cast;
    parts.wirePlane.constant = -s.cast;
    parts.wireMat.opacity = s.lines * 0.9;
    parts.wires.forEach((w) => {
      const d = still ? 1 : s.draw(...w.win);
      w.line.visible = s.lines > 0 && d > 0;
      w.line.geometry.setDrawRange(0, Math.floor((w.count * d) / 2) * 2);
    });
    shadow.current.material.opacity =
      (1 - s.bg) * Math.max(s.metal, 0) * (still ? 0 : 1) * (1 - worn);

    // Stone: turns while it's alone, settles back into the setting, then keeps a little sparkle moving
    stone.current.morphTargetInfluences.splice(
      0,
      3,
      ...(still ? [0, 0, 0] : s.morph),
    );
    stone.current.rotation.y = s.spin;
    stone.current.updateWorldMatrix(true, false);
    const u = parts.stoneMat.userData.uniforms;
    u.uModel.value.setFromMatrix4(stone.current.matrixWorld);
    // A diamond on a white table photographs brighter than one on black; follow the room
    u.uExposure.value =
      still === "ring" ? 1.2 : THREE.MathUtils.lerp(1.65, 1, s.bg);

    // Facet planes for the shape on screen, rebuilt only when the shape changes
    const w = still ? [0, 0, 0] : s.morph;
    const key = w.map((v) => v.toFixed(3)).join();
    if (key !== parts.facetKey) {
      parts.facetKey = key;
      const facets = facetsOf(parts.diamond, w);
      facets.forEach((f, i) =>
        u.uPlanes.value[i].set(f.n.x, f.n.y, f.n.z, f.d),
      );
      u.uPlaneCount.value = facets.length;
      parts.crown = facets.filter((f) => f.n.y > 0.25);
    }

    // Glints: a crown facet that mirrors one of the studio's hot lights toward the camera flares
    const m = stone.current.matrixWorld,
      nm = new THREE.Matrix3().getNormalMatrix(m);
    const c = new THREE.Vector3(),
      n = new THREE.Vector3(),
      v = new THREE.Vector3();
    glints.current.children.forEach((sp, i) => {
      const f = parts.crown[i];
      if (!f || reduced) {
        sp.visible = false;
        return;
      }
      c.copy(f.c).applyMatrix4(m);
      n.copy(f.n).applyMatrix3(nm).normalize();
      v.copy(c).sub(camera.position).normalize().reflect(n);
      let best = 0;
      for (const L of parts.lights) best = Math.max(best, v.dot(L));
      const k = THREE.MathUtils.smoothstep(best, 0.995, 0.9997);
      sp.visible = k > 0.01;
      sp.position.copy(f.c).addScaledVector(f.n, 0.03);
      sp.material.opacity = k;
      sp.scale.setScalar(0.2 + k * 0.4);
    });
  });

  return html` ${parts.caustics &&
    html`<mesh
      frustumCulled=${false}
      renderOrder=${-10}
      material=${parts.caustics}
      ><planeGeometry args=${[2, 2]}
    /></mesh>`}
    ${parts.word &&
    html`<group ref=${word}
      >${parts.word.letters.map(
        (m, i) => html`<primitive key=${"l" + i} object=${m} />`,
      )}</group
    >`}
    <group ref=${group}>
      ${parts.solid.map(
        (g, i) =>
          html`<mesh key=${"m" + i} geometry=${g} material=${parts.metal} />`,
      )}
      ${parts.wires.map(
        (w, i) => html`<primitive key=${"w" + i} object=${w.line} />`,
      )}
      <mesh
        ref=${stone}
        geometry=${parts.diamond}
        material=${parts.stoneMat}
        position=${[0, STONE_Y, 0]}
        morphTargetInfluences=${[1, 0, 0]}
      >
        <group ref=${glints}>
          ${Array.from(
            { length: 48 },
            (_, i) =>
              html`<sprite key=${"g" + i} visible=${false}>
                <spriteMaterial
                  map=${parts.glintMap}
                  blending=${THREE.AdditiveBlending}
                  transparent=${true}
                  depthWrite=${false}
                  toneMapped=${false}
                  opacity=${0}
                />
              </sprite>`,
          )}
        </group>
      </mesh>
    </group>
    <mesh
      ref=${shadow}
      position=${[0, -2.5, 0]}
      rotation=${[-Math.PI / 2, 0, 0]}
      scale=${[6.5, 3.2, 1]}
    >
      <planeGeometry />
      <meshBasicMaterial
        map=${parts.shadowMap}
        transparent=${true}
        depthWrite=${false}
        opacity=${0}
      />
    </mesh>`;
}

function App({ still }) {
  // Only render while the story is on screen
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    if (still) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting));
    io.observe(document.querySelector(".story"));
    return () => io.disconnect();
  }, []);
  return html`
    <${Canvas}
      dpr=${[1, 1.75]}
      frameloop=${reduced ? "demand" : visible ? "always" : "never"}
      camera=${{ fov: 24, near: 0.1, far: 200, position: [0, 0, 30] }}
      gl=${{ antialias: true, powerPreference: "high-performance" }}
      onCreated=${({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
      }}
    >
      <${Ring} still=${still} />
    </${Canvas}>`;
}

async function mount(el, still) {
  try {
    const probe = document.createElement("canvas");
    if (!probe.getContext("webgl2") && !probe.getContext("webgl")) return; // keep the HTML fallback
    // The letters are drawn into textures, so Cinzel has to be loaded first (but never wait long)
    if (!still)
      await Promise.race([
        document.fonts.load("400 100px Cinzel"),
        new Promise((r) => setTimeout(r, 2500)),
      ]);
    createRoot(el).render(html`<${App} still=${still} />`);
  } catch (err) {
    console.warn("3D ring unavailable:", err);
  }
}

mount(document.querySelector(".ring3d"));
if (reduced) {
  // Reduced motion: no scroll story, so show the CAD and the finished ring as still frames
  mount(document.querySelector(".still-cad"), "cad");
  mount(document.querySelector(".still-ring"), "ring");
}
