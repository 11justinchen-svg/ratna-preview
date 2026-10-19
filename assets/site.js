// Shared by every page: the facet drawing, liquid glass refraction, the nav, smooth scroll, reveals.
(() => {
  const NS = "http://www.w3.org/2000/svg";
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const chromium =
    !!window.chrome && CSS.supports("backdrop-filter", "blur(1px)");

  /* ---------- Facets ----------
     A brilliant cut seen face-up, generalised to any outline: sample 16 points around the
     girdle, shrink every other one into the table, push the odd ones out as star tips, then
     join table → star → girdle. A circle gives a round brilliant, an ellipse an oval, a
     teardrop a pear. Emerald is a step cut, so it gets nested cut-corner rectangles. */
  const outlines = {
    round: (cx, cy, R) =>
      `M${cx - R} ${cy}a${R} ${R} 0 1 0 ${2 * R} 0a${R} ${R} 0 1 0 ${-2 * R} 0`,
    oval: (cx, cy, R) =>
      `M${cx - R * 0.78} ${cy}a${R * 0.78} ${R * 1.16} 0 1 0 ${R * 1.56} 0a${R * 0.78} ${R * 1.16} 0 1 0 ${-R * 1.56} 0`,
    pear: (cx, cy, R) => {
      const r = R * 0.86,
        by = cy + R * 0.3,
        ty = cy - R * 1.3;
      return `M${cx} ${ty}C${cx + R * 0.5} ${cy - R * 0.85} ${cx + r} ${cy - R * 0.3} ${cx + r} ${by}A${r} ${r} 0 0 1 ${cx - r} ${by}C${cx - r} ${cy - R * 0.3} ${cx - R * 0.5} ${cy - R * 0.85} ${cx} ${ty}Z`;
    },
    marquise: (cx, cy, R) =>
      `M${cx} ${cy - R * 1.32}Q${cx + R * 1.05} ${cy} ${cx} ${cy + R * 1.32}Q${cx - R * 1.05} ${cy} ${cx} ${cy - R * 1.32}Z`,
    cushion: (cx, cy, R) => {
      const s = R * 0.92,
        k = R * 0.42;
      return `M${cx - s + k} ${cy - s}H${cx + s - k}Q${cx + s} ${cy - s} ${cx + s} ${cy - s + k}V${cy + s - k}Q${cx + s} ${cy + s} ${cx + s - k} ${cy + s}H${cx - s + k}Q${cx - s} ${cy + s} ${cx - s} ${cy + s - k}V${cy - s + k}Q${cx - s} ${cy - s} ${cx - s + k} ${cy - s}Z`;
    },
    princess: (cx, cy, R) => {
      const s = R * 0.86;
      return `M${cx - s} ${cy - s}H${cx + s}V${cy + s}H${cx - s}Z`;
    },
    radiant: (cx, cy, R) => {
      const w = R * 0.78,
        h = R * 1.06,
        c = R * 0.2;
      return `M${cx - w + c} ${cy - h}H${cx + w - c}L${cx + w} ${cy - h + c}V${cy + h - c}L${cx + w - c} ${cy + h}H${cx - w + c}L${cx - w} ${cy + h - c}V${cy - h + c}Z`;
    },
  };
  const centres = { pear: 0.12, marquise: 0 };
  const probe = document.createElementNS(NS, "path");

  function brilliant(shape, cx, cy, R) {
    const d0 = outlines[shape](cx, cy, R);
    probe.setAttribute("d", d0);
    const L = probe.getTotalLength();
    const ox = cx,
      oy = cy + (centres[shape] || 0) * R;
    // Start sampling half a facet in, so a round's table sits flat like a real one
    const pts = Array.from({ length: 16 }, (_, i) =>
      probe.getPointAtLength(((i + 0.5) / 16) * L),
    );
    const toward = (p, k) => [ox + (p.x - ox) * k, oy + (p.y - oy) * k];
    const T = [],
      S = [];
    pts.forEach((p, i) => (i % 2 ? S : T).push(toward(p, i % 2 ? 0.8 : 0.54)));
    const P = (q) => `${q[0].toFixed(1)} ${q[1].toFixed(1)}`;
    let d =
      d0 +
      `M${P(T[0])}` +
      T.slice(1)
        .map((q) => `L${P(q)}`)
        .join("") +
      "Z";
    for (let j = 0; j < 8; j++) {
      const s = S[j],
        a = pts[2 * j],
        b = pts[(2 * j + 1) % 16],
        c = pts[(2 * j + 2) % 16];
      d += `M${P(T[j])}L${P(s)}L${P(T[(j + 1) % 8])}`;
      d += `M${P([a.x, a.y])}L${P(s)}L${P([c.x, c.y])}M${P(s)}L${P([b.x, b.y])}`;
    }
    const inner = T.map(
      (q) => `M${ox.toFixed(1)} ${oy.toFixed(1)}L${P(q)}`,
    ).join("");
    return { d, inner };
  }

  function emerald(cx, cy, R) {
    const rect = (k) => {
      const w = R * 0.74 * k,
        h = R * 1.04 * k,
        c = R * 0.2 * k;
      return [
        [cx - w + c, cy - h],
        [cx + w - c, cy - h],
        [cx + w, cy - h + c],
        [cx + w, cy + h - c],
        [cx + w - c, cy + h],
        [cx - w + c, cy + h],
        [cx - w, cy + h - c],
        [cx - w, cy - h + c],
      ];
    };
    const rings = [1, 0.8, 0.62, 0.44].map(rect);
    const P = (q) => `${q[0].toFixed(1)} ${q[1].toFixed(1)}`;
    let d = rings
      .map(
        (r) =>
          `M${P(r[0])}` +
          r
            .slice(1)
            .map((q) => `L${P(q)}`)
            .join("") +
          "Z",
      )
      .join("");
    rings[0].forEach((q, i) => (d += `M${P(q)}L${P(rings[3][i])}`));
    return { d, inner: "" };
  }

  function facetPaths(shape, cx = 50, cy = 50, R = 34) {
    return shape === "emerald"
      ? emerald(cx, cy, R)
      : brilliant(shape, cx, cy, R);
  }

  // Returns <g> with the facet lines; class hooks let pages animate the two layers separately
  function facetGroup(shape, cx, cy, R, cls = "") {
    const { d, inner } = facetPaths(shape, cx, cy, R);
    const g = document.createElementNS(NS, "g");
    g.setAttribute("class", cls);
    g.innerHTML =
      `<path class="facet" d="${d}"/>` +
      (inner ? `<path class="facet facet-in" d="${inner}"/>` : "");
    return g;
  }

  function facetIcon(shape, size = 100) {
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("width", size);
    svg.setAttribute("height", size);
    svg.appendChild(
      facetGroup(
        shape,
        50,
        50,
        shape === "pear" || shape === "marquise" ? 31 : 36,
      ),
    );
    return svg;
  }

  document.querySelectorAll("[data-facet]").forEach((el) => {
    const icon = facetIcon(el.dataset.facet, el.dataset.size || 100);
    icon.setAttribute("class", el.className);
    el.replaceWith(icon);
  });
  document
    .querySelectorAll("svg[data-facet-mark]")
    .forEach((svg) => svg.appendChild(facetGroup("round", 50, 50, 44)));

  /* ---------- Liquid glass refraction (Chromium) ----------
     For each glass element, paint a displacement map the exact size of the element:
     inside a bezel near the edge, every pixel points along the edge normal, so the
     backdrop bends at the rim like the edge of a lens, and the centre stays flat.
     The map feeds feDisplacementMap through backdrop-filter: url(#…). */
  const defs = (() => {
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("width", "0");
    svg.setAttribute("height", "0");
    svg.setAttribute("aria-hidden", "true");
    svg.style.position = "absolute";
    document.body.appendChild(svg);
    return svg;
  })();

  function sdRoundRect(x, y, hw, hh, r) {
    const qx = Math.abs(x) - hw + r,
      qy = Math.abs(y) - hh + r;
    return (
      Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) +
      Math.min(Math.max(qx, qy), 0) -
      r
    );
  }

  function displacementMap(w, h, r, bezel) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    const img = ctx.createImageData(w, h);
    const hw = w / 2,
      hh = h / 2;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const px = x + 0.5 - hw,
          py = y + 0.5 - hh;
        const sd = sdRoundRect(px, py, hw, hh, r);
        let dx = 0,
          dy = 0;
        if (sd > -bezel && sd < 0) {
          const nx =
            sdRoundRect(px + 1, py, hw, hh, r) -
            sdRoundRect(px - 1, py, hw, hh, r);
          const ny =
            sdRoundRect(px, py + 1, hw, hh, r) -
            sdRoundRect(px, py - 1, hw, hh, r);
          const len = Math.hypot(nx, ny) || 1;
          const t = 1 - -sd / bezel; // 0 at the inner edge of the bezel, 1 at the rim
          const m = t * t * (3 - 2 * t); // smoothstep: the lens curves faster near the rim
          dx = (-nx / len) * m;
          dy = (-ny / len) * m;
        }
        const i = (y * w + x) * 4;
        img.data[i] = 128 + dx * 127;
        img.data[i + 1] = 128 + dy * 127;
        img.data[i + 2] = 128;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return c.toDataURL();
  }

  let glassId = 0;
  function refract(el) {
    if (
      !chromium ||
      matchMedia("(prefers-reduced-transparency: reduce)").matches
    )
      return;
    const id = `lg${glassId++}`;
    const filter = document.createElementNS(NS, "filter");
    filter.id = id;
    filter.setAttribute("color-interpolation-filters", "sRGB");
    filter.setAttribute("x", "0");
    filter.setAttribute("y", "0");
    filter.setAttribute("width", "100%");
    filter.setAttribute("height", "100%");
    defs.appendChild(filter);
    const build = () => {
      const w = Math.round(el.offsetWidth),
        h = Math.round(el.offsetHeight);
      if (!w || !h) return;
      const r = Math.min(
        parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0,
        h / 2,
        w / 2,
      );
      const bezel = Math.min(18, h / 2.4);
      filter.setAttribute("filterUnits", "userSpaceOnUse");
      filter.setAttribute("width", w);
      filter.setAttribute("height", h);
      filter.innerHTML = `
        <feImage href="${displacementMap(w, h, r, bezel)}" x="0" y="0" width="${w}" height="${h}" result="map"/>
        <feGaussianBlur in="SourceGraphic" stdDeviation="${el.dataset.blur || 2.2}" result="soft"/>
        <feDisplacementMap in="soft" in2="map" scale="${el.dataset.refract || 46}" xChannelSelector="R" yChannelSelector="G"/>`;
      const sat = el.classList.contains("on-dark")
        ? "saturate(150%) brightness(.9)"
        : "saturate(180%) brightness(1.04)";
      el.style.webkitBackdropFilter =
        el.style.backdropFilter = `url(#${id}) ${sat}`;
    };
    build();
    new ResizeObserver(build).observe(el);
    el._refract = build;
  }
  document.querySelectorAll(".glass").forEach(refract);

  /* ---------- The loupe ----------
     A jeweller's loupe in liquid glass: an octagonal lens that follows the pointer over the hero
     and the gallery, magnifying what's under it 1.8x and bending it at the rim. The map pulls
     every pixel toward the centre (magnification) plus a little extra inside the bezel (the lens
     edge). Chromium only, and only with a real pointer: it means nothing on touch. */
  function sdOctagon(x, y, r) {
    const kx = -0.9238795325, ky = 0.3826834323, kz = 0.4142135623;
    x = Math.abs(x); y = Math.abs(y);
    let d = 2 * Math.min(kx * x + ky * y, 0); x -= d * kx; y -= d * ky;
    d = 2 * Math.min(-kx * x + ky * y, 0); x -= d * -kx; y -= d * ky;
    x -= Math.min(Math.max(x, -kz * r), kz * r); y -= r;
    return Math.hypot(x, y) * Math.sign(y);
  }
  function loupe() {
    const regions = document.querySelectorAll("[data-loupe]");
    if (!regions.length || !chromium || !matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    const S = 196, mag = 1.8, bezel = 16, maxShift = S / 2 * (1 - 1 / mag) + 12;
    const c = document.createElement("canvas");
    c.width = c.height = S;
    const ctx = c.getContext("2d");
    const img = ctx.createImageData(S, S);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const px = x + 0.5 - S / 2, py = y + 0.5 - S / 2;
        const sd = sdOctagon(px, py, S / 2);
        let dx = -px * (1 - 1 / mag), dy = -py * (1 - 1 / mag);
        if (sd > -bezel && sd < 0) {
          const t = 1 - -sd / bezel, k = t * t * 10;
          const len = Math.hypot(px, py) || 1;
          dx -= (px / len) * k; dy -= (py / len) * k;
        }
        const i = (y * S + x) * 4;
        img.data[i] = 128 + (dx / maxShift) * 127;
        img.data[i + 1] = 128 + (dy / maxShift) * 127;
        img.data[i + 2] = 128;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const f = document.createElementNS(NS, "filter");
    f.id = "loupe-fx";
    f.setAttribute("filterUnits", "userSpaceOnUse");
    f.setAttribute("x", "0"); f.setAttribute("y", "0");
    f.setAttribute("width", S); f.setAttribute("height", S);
    f.setAttribute("color-interpolation-filters", "sRGB");
    f.innerHTML = `<feImage href="${c.toDataURL()}" x="0" y="0" width="${S}" height="${S}" result="map"/>
      <feDisplacementMap in="SourceGraphic" in2="map" scale="${maxShift * 2}" xChannelSelector="R" yChannelSelector="G"/>`;
    defs.appendChild(f);

    const el = document.createElement("div");
    el.className = "loupe";
    el.setAttribute("aria-hidden", "true");
    const oct = "29.3,0 70.7,0 100,29.3 100,70.7 70.7,100 29.3,100 0,70.7 0,29.3";
    el.innerHTML = `<div class="loupe-lens"></div><svg class="loupe-edge" viewBox="0 0 100 100"><polygon class="loupe-rim" points="${oct}"/><polygon class="loupe-shine" points="${oct}"/></svg>`;
    el.style.setProperty("--s", S + "px");
    document.body.appendChild(el);
    const lens = el.querySelector(".loupe-lens"), edge = el.querySelector(".loupe-edge");
    lens.style.backdropFilter = "url(#loupe-fx) saturate(112%) contrast(1.04)";
    // No opacity on the lens or anything above it: in Chromium that makes a backdrop root and
    // the glass would sample nothing. The lens opens from its centre instead; only the rim fades.
    const OCT = [[29.3, 0], [70.7, 0], [100, 29.3], [100, 70.7], [70.7, 100], [29.3, 100], [0, 70.7], [0, 29.3]];
    const clipAt = (k) => `polygon(${OCT.map(([a, b]) => `${50 + (a - 50) * k}% ${50 + (b - 50) * k}%`).join(",")})`;

    let tx = -999, ty = -999, x = tx, y = ty, on = false, shown = 0;
    regions.forEach((r) => {
      r.addEventListener("pointermove", (e) => { if (e.pointerType !== "mouse") return; tx = e.clientX; ty = e.clientY; on = true; if (x < -900) { x = tx; y = ty; } });
      r.addEventListener("pointerleave", () => { on = false; });
    });
    addEventListener("scroll", () => { if (on) shown = Math.max(shown, 0.6); }, { passive: true });
    const tick = () => {
      const k = reduced ? 1 : 0.22;
      x += (tx - x) * k; y += (ty - y) * k;
      shown += ((on ? 1 : 0) - shown) * (reduced ? 1 : 0.18);
      el.style.transform = `translate3d(${x - S / 2}px, ${y - S / 2}px, 0)`;
      el.style.visibility = shown < 0.01 ? "hidden" : "visible";
      lens.style.clipPath = clipAt(Math.min(1, shown * 1.04));
      edge.style.opacity = shown;
      edge.style.transform = `scale(${0.9 + shown * 0.1})`;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  loupe();

  /* ---------- Smooth scroll ---------- */
  let lenis = null;
  const frameFns = [];
  if (!reduced && window.Lenis) {
    lenis = new Lenis({
      duration: 1.15,
      easing: (t) => 1 - Math.pow(1 - t, 4),
    });
  }
  let lastY = -1;
  function frame(t) {
    if (lenis) lenis.raf(t);
    const y = window.scrollY;
    if (y !== lastY) {
      lastY = y;
      frameFns.forEach((fn) => fn(y));
      navTheme(y); // last, so it reads the themes the scenes just set
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  addEventListener("resize", () => {
    lastY = -1;
  });

  /* ---------- Nav: hides on the way down, returns on the way up; text flips over dark scenes ---------- */
  const nav = document.querySelector(".nav");
  const sheet = document.querySelector(".sheet");
  let prevY = window.scrollY;
  const themed = () => [...document.querySelectorAll("[data-theme]")];
  function navTheme(y) {
    if (!nav) return;
    const mid = 38;
    let theme = "light";
    for (const s of themed()) {
      const r = s.getBoundingClientRect();
      if (r.top <= mid && r.bottom >= mid) theme = s.dataset.theme;
    }
    const dark = theme === "dark";
    if (dark !== nav.classList.contains("on-dark")) {
      nav.classList.toggle("on-dark", dark);
      sheet && sheet.classList.toggle("on-dark", dark);
      nav._refract && nav._refract();
    }
    const down = y > prevY + 4,
      up = y < prevY - 4;
    if (!document.documentElement.classList.contains("menu-open")) {
      if (down && y > 400) nav.classList.add("hide");
      else if (up || y < 400) nav.classList.remove("hide");
    }
    prevY = y;
  }

  navTheme(window.scrollY);

  const menuBtn = document.querySelector(".menu-btn");
  if (menuBtn) {
    const setMenu = (open) => {
      document.documentElement.classList.toggle("menu-open", open);
      menuBtn.setAttribute("aria-expanded", open);
      sheet.inert = !open;
      if (open) {
        sheet._refract || refract(sheet);
        sheet._refract && sheet._refract();
      }
    };
    sheet.inert = true;
    menuBtn.addEventListener("click", () =>
      setMenu(!document.documentElement.classList.contains("menu-open")),
    );
    sheet.addEventListener(
      "click",
      (e) => e.target.closest("a") && setMenu(false),
    );
    addEventListener("keydown", (e) => e.key === "Escape" && setMenu(false));
  }

  // In-page anchors glide with Lenis
  document.querySelectorAll('a[href^="#"]').forEach((a) =>
    a.addEventListener("click", (e) => {
      const target =
        a.getAttribute("href").length > 1 &&
        document.querySelector(a.getAttribute("href"));
      if (!target) return;
      e.preventDefault();
      if (lenis) lenis.scrollTo(target, { duration: 1.6 });
      else target.scrollIntoView({ behavior: reduced ? "auto" : "smooth" });
      history.replaceState(null, "", a.getAttribute("href"));
    }),
  );

  /* ---------- One-shot reveals for headlines ---------- */
  const io = new IntersectionObserver(
    (entries) =>
      entries.forEach((en) => {
        if (en.isIntersecting) {
          en.target.classList.add("in");
          io.unobserve(en.target);
        }
      }),
    { rootMargin: "0px 0px -12% 0px" },
  );
  document.querySelectorAll("[data-reveal]").forEach((el) => io.observe(el));

  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const range = (p, a, b) => clamp((p - a) / (b - a));
  const ease = (t) => 1 - Math.pow(1 - t, 3);

  window.Ratna = {
    reduced,
    chromium,
    lenis,
    frameFns,
    facetGroup,
    facetPaths,
    facetIcon,
    refract,
    clamp,
    range,
    ease,
    NS,
  };
})();
