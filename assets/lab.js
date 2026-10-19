// Lab-grown scene. The section is cut to a round brilliant's real profile; inside it a WebGL
// plasma glows (lab diamonds are grown in a hydrogen plasma, which glows pink-violet), and light
// rays are traced through the same profile with Snell's law, revealed one per fact on scroll.
(() => {
  const R = window.Ratna;
  const { reduced, frameFns, clamp, range, ease } = R;
  const lab = document.querySelector(".lab");
  if (!lab) return;
  const stick = lab.querySelector(".stick");
  const gem = lab.querySelector(".gem");
  const canvas = lab.querySelector(".plasma");
  const svgIn = lab.querySelector(".rays-in"), svgOut = lab.querySelector(".rays-out");
  const TOP_EDGES = [0, 1, 6]; // table, right crown, left crown
  const facts = [...lab.querySelectorAll(".facts li")];
  const SVGNS = "http://www.w3.org/2000/svg";
  const CROWN = (34.5 * Math.PI) / 180,
    PAVILION = (40.75 * Math.PI) / 180;
  const IOR = 2.42;

  /* ---------- The profile ---------- */
  // Table 56% of the width, crown at 34.5°, pavilion at 40.75°. If the true proportions don't
  // fit the screen, the stone gets narrower; if there's spare height, the girdle stretches.
  let poly = [],
    geo = {};
  function shape() {
    const W = stick.clientWidth,
      H = stick.clientHeight;
    const top = Math.min(72, H * 0.08); // clear of the nav bar
    const avail = H - top;
    const ratio = 0.22 * Math.tan(CROWN) + 0.5 * Math.tan(PAVILION); // height of crown + pavilion per unit width
    const w = Math.min(W, (avail * 0.94) / ratio);
    const L = (W - w) / 2;
    const hc = 0.22 * w * Math.tan(CROWN),
      hp = 0.5 * w * Math.tan(PAVILION);
    const g = Math.max(0, avail - hc - hp);
    poly = [
      [L + 0.22 * w, top],
      [L + 0.78 * w, top],
      [L + w, top + hc],
      [L + w, top + hc + g],
      [L + w / 2, top + hc + g + hp],
      [L, top + hc + g],
      [L, top + hc],
    ];
    geo = { W, H, top, w, L, hc, hp, g, girdle: top + hc };
    gem.style.clipPath = `polygon(${poly.map(([x, y]) => `${x.toFixed(1)}px ${y.toFixed(1)}px`).join(",")})`;
    lab.style.setProperty("--crown", `${top}px`);
    lab.style.setProperty("--girdle", `${top + hc}px`);
    lab.style.setProperty("--pavilion", `${top + hc + g}px`);
    lab.style.setProperty("--gem-w", `${w}px`);
    [svgIn, svgOut].forEach((s) => s.setAttribute("viewBox", `0 0 ${W} ${H}`));
  }

  /* ---------- 2D ray tracing ---------- */
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
  const norm = (a) => {
    const l = Math.hypot(a[0], a[1]) || 1;
    return [a[0] / l, a[1] / l];
  };
  // Nearest edge the ray meets, with that edge's outward normal (polygon is clockwise, y down)
  function hit(o, d, skip) {
    let best = null;
    for (let i = 0; i < poly.length; i++) {
      if (i === skip) continue;
      const a = poly[i],
        b = poly[(i + 1) % poly.length],
        e = sub(b, a);
      const den = d[0] * e[1] - d[1] * e[0];
      if (Math.abs(den) < 1e-9) continue;
      const ao = sub(a, o);
      const t = (ao[0] * e[1] - ao[1] * e[0]) / den;
      const u = (ao[0] * d[1] - ao[1] * d[0]) / den;
      if (t > 1e-6 && u >= 0 && u <= 1 && (!best || t < best.t))
        best = {
          t,
          i,
          p: [o[0] + d[0] * t, o[1] + d[1] * t],
          n: norm([e[1], -e[0]]),
        };
    }
    return best;
  }
  // Snell's law in vector form; null means total internal reflection
  function refract(d, n, n1, n2) {
    let N = n,
      cosi = -dot(N, d);
    if (cosi < 0) {
      N = [-n[0], -n[1]];
      cosi = -cosi;
    }
    const eta = n1 / n2,
      k = 1 - eta * eta * (1 - cosi * cosi);
    if (k < 0) return null;
    const c = eta * cosi - Math.sqrt(k);
    return norm([eta * d[0] + c * N[0], eta * d[1] + c * N[1]]);
  }
  const reflect = (d, n) => {
    const k = 2 * dot(d, n);
    return [d[0] - k * n[0], d[1] - k * n[1]];
  };

  function trace(x, angle) {
    const d0 = norm([Math.sin(angle), Math.cos(angle)]);
    const o = [x - d0[0] * 2000, geo.top - d0[1] * 2000];
    const h0 = hit(o, d0, -1);
    if (!h0 || !TOP_EDGES.includes(h0.i)) return null; // must enter through the table or crown
    let d = refract(d0, h0.n, 1, IOR);
    if (!d) return null;
    const pts = [o, h0.p];
    let p = h0.p,
      skip = h0.i,
      bounces = 0;
    for (let k = 0; k < 7; k++) {
      const h = hit(p, d, skip);
      if (!h) return null;
      pts.push(h.p);
      const out = refract(d, h.n, IOR, 1);
      if (out) {
        if (!TOP_EDGES.includes(h.i)) return null; // left through the pavilion or girdle: light lost
        // Fire: red, green and blue leave at slightly different angles. Real diamond spreads
        // 2.407–2.451; doubled here so the fan reads at screen scale.
        const fan = [2.37, 2.42, 2.47].map(
          (ior) => refract(d, h.n, ior, 1) || out,
        );
        return { pts, exit: h.p, fan, bounces };
      }
      d = reflect(d, h.n);
      p = h.p;
      skip = h.i;
      bounces++;
    }
    return null;
  }

  // Three rays that bounce at least twice and come back out through the top, spread across the stone
  function pickRays() {
    const found = [];
    const xs = [0.33, 0.42, 0.5, 0.58, 0.67, 0.38, 0.62, 0.46, 0.54];
    for (const xf of xs) {
      for (let deg = -16; deg <= 16; deg += 2) {
        const r = trace(geo.L + geo.w * xf, (deg * Math.PI) / 180);
        if (
          r &&
          r.bounces >= 2 &&
          !found.some((f) => Math.abs(f.x - xf) < 0.1)
        ) {
          found.push({ ...r, x: xf });
          break;
        }
      }
      if (found.length === 3) break;
    }
    return found.sort((a, b) => a.x - b.x);
  }

  let rays = [];
  // Each ray is drawn twice: inside the stone (clipped by it, under the glass panels, so they bend
  // it) and outside it (masked to everything but the stone), where the light arrives and leaves.
  function drawRays() {
    const { W, H } = geo;
    svgIn.innerHTML = "";
    svgOut.innerHTML = `<defs><clipPath id="gem-outside"><path clip-rule="evenodd" d="M0 0H${W}V${H}H0Z M${poly.map((p) => p.join(" ")).join(" L")}Z"/></clipPath></defs>`;
    const outline = document.createElementNS(SVGNS, "polygon");
    outline.setAttribute("points", poly.map((p) => p.join(",")).join(" "));
    outline.setAttribute("class", "gem-outline");
    svgOut.appendChild(outline);
    const outer = document.createElementNS(SVGNS, "g");
    outer.setAttribute("clip-path", "url(#gem-outside)");
    svgOut.appendChild(outer);
    const colours = ["#FF6464", "#8CF5A8", "#7AA9FF"];
    rays = pickRays().map((r) => {
      const parts = { paths: [], fans: [], star: null };
      [svgIn, outer].forEach((host) => {
        const g = document.createElementNS(SVGNS, "g");
        g.setAttribute("class", "ray");
        const path = document.createElementNS(SVGNS, "polyline");
        path.setAttribute("points", r.pts.map((p) => p.map((v) => v.toFixed(1)).join(",")).join(" "));
        path.setAttribute("class", "ray-path");
        path.setAttribute("pathLength", "1");
        g.appendChild(path);
        parts.paths.push(path);
        r.fan.forEach((d, i) => {
          const l = document.createElementNS(SVGNS, "line");
          l.setAttribute("x1", r.exit[0]); l.setAttribute("y1", r.exit[1]);
          l.setAttribute("x2", r.exit[0] + d[0] * 1600); l.setAttribute("y2", r.exit[1] + d[1] * 1600);
          l.setAttribute("stroke", colours[i]);
          l.setAttribute("class", "ray-fan");
          l.setAttribute("pathLength", "1");
          g.appendChild(l);
          parts.fans.push(l);
        });
        host.appendChild(g);
      });
      // The logo's four-point star marks the moment light escapes
      const star = document.createElementNS(SVGNS, "path");
      const [sx, sy] = r.exit, a = 14, b = 2.6;
      star.setAttribute("d", `M${sx} ${sy - a}Q${sx} ${sy - b} ${sx + b} ${sy}Q${sx} ${sy} ${sx} ${sy + a}Q${sx} ${sy + b} ${sx - b} ${sy}Q${sx} ${sy} ${sx} ${sy - a}ZM${sx - a} ${sy}Q${sx - b} ${sy} ${sx} ${sy - b}Q${sx} ${sy} ${sx + a} ${sy}Q${sx + b} ${sy} ${sx} ${sy + b}Q${sx} ${sy} ${sx - a} ${sy}Z`);
      star.setAttribute("class", "ray-star");
      star.style.transformOrigin = `${sx}px ${sy}px`;
      svgOut.appendChild(star);
      parts.star = star;
      return parts;
    });
  }

  /* ---------- Plasma (raw WebGL, no library) ---------- */
  let gl,
    prog,
    uRes,
    uTime,
    uCore,
    buf,
    plasmaOn = false,
    scale = 0.6;
  function initPlasma() {
    gl = canvas.getContext("webgl", {
      antialias: false,
      alpha: false,
      premultipliedAlpha: false,
    });
    if (!gl) {
      canvas.remove();
      return;
    }
    const vs =
      "attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }";
    const fs = `
      precision highp float;
      uniform vec2 uRes; uniform float uTime; uniform vec2 uCore;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
      }
      float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
      void main() {
        vec2 uv = gl_FragCoord.xy / uRes.y;
        vec2 d = uv - uCore / uRes.y;
        float r = length(d);
        float t = uTime;
        float ang = atan(d.y, d.x);
        // Filaments: noise in polar space, drifting outward from the core, warped by more noise
        float warp = fbm(uv * 2.2 + vec2(t * 0.05, -t * 0.04));
        float fil = fbm(vec2(ang * 1.8 + warp * 1.5, r * 5.0 - t * 0.35));
        float strands = pow(smoothstep(0.35, 0.95, fil), 2.0);
        float glow = exp(-r * 2.6);
        float core = exp(-r * 13.0);
        vec3 deep = vec3(0.035, 0.016, 0.05);
        vec3 violet = vec3(0.34, 0.07, 0.52);
        vec3 magenta = vec3(0.93, 0.24, 0.63);
        vec3 hot = vec3(1.0, 0.86, 0.95);
        vec3 col = deep;
        col += violet * glow * (0.55 + 0.6 * fil);
        col += magenta * strands * glow * 1.25;
        col += hot * core * (1.1 + 0.15 * sin(t * 7.0));
        col *= 0.96 + 0.04 * sin(t * 11.0 + fil * 9.0); // the flicker of a live discharge
        col += (hash(gl_FragCoord.xy + fract(t)) - 0.5) / 255.0;
        gl_FragColor = vec4(col, 1.0);
      }`;
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, vs));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn(gl.getProgramInfoLog(prog));
      canvas.remove();
      gl = null;
      return;
    }
    gl.useProgram(prog);
    buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    );
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    uRes = gl.getUniformLocation(prog, "uRes");
    uTime = gl.getUniformLocation(prog, "uTime");
    uCore = gl.getUniformLocation(prog, "uCore");
    gem.classList.add("live");
  }
  function sizePlasma() {
    if (!gl) return;
    const w = Math.round(geo.W * scale),
      h = Math.round(geo.H * scale);
    canvas.width = w;
    canvas.height = h;
    gl.viewport(0, 0, w, h);
  }
  function renderPlasma(t) {
    if (!gl) return;
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform1f(uTime, t);
    // The core sits low in the pavilion, where the rays gather (gl y runs up)
    const cy = geo.top + geo.hc + geo.g + geo.hp * 0.42;
    gl.uniform2f(uCore, (geo.W / 2) * scale, (geo.H - cy) * scale);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  let start = performance.now();
  const loop = () => {
    if (plasmaOn) renderPlasma((performance.now() - start) / 1000);
    if (plasmaOn && !reduced) requestAnimationFrame(loop);
  };
  new IntersectionObserver(
    ([e]) => {
      const was = plasmaOn;
      plasmaOn = e.isIntersecting;
      if (plasmaOn && !gl) {
        initPlasma();
        sizePlasma();
      }
      if (plasmaOn && !was) requestAnimationFrame(loop);
    },
    { rootMargin: "50% 0px" },
  ).observe(lab);

  /* ---------- Scroll ---------- */
  function layout() {
    shape();
    drawRays();
    sizePlasma();
    if (reduced && gl) renderPlasma(4);
  }
  layout();
  let resizeT;
  addEventListener("resize", () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => {
      layout();
      frame();
    }, 120);
  });
  document.fonts && document.fonts.ready.then(() => layout());

  function frame() {
    const r = lab.getBoundingClientRect();
    const p = reduced ? 1 : clamp(-r.top / (r.height - innerHeight));
    facts.forEach((f, i) =>
      f.style.setProperty(
        "--f",
        reduced ? 1 : ease(range(p, 0.12 + i * 0.24, 0.28 + i * 0.24)),
      ),
    );
    rays.forEach((ray, i) => {
      const a = 0.12 + i * 0.24;
      const d = ease(range(p, a, a + 0.18));
      ray.paths.forEach((el) => (el.style.strokeDashoffset = 1 - d));
      const f = ease(range(p, a + 0.15, a + 0.24));
      ray.fans.forEach((l) => (l.style.strokeDashoffset = 1 - f));
      ray.star.style.opacity = f;
      ray.star.style.transform = `scale(${0.4 + f * 0.6})`;
    });
  }
  frameFns.push(frame);
  frame();
})();
