// Home page, DOM side. Publishes scroll progress for the 3D ring (ring3d.js) and drives the text,
// steps, gallery and lab scene. Every pinned scene reads one normalised progress value per frame.
(() => {
  const R = window.Ratna;
  const { reduced, frameFns, clamp, range, ease } = R;
  const vh = () => window.innerHeight;
  const progress = (el) => {
    const r = el.getBoundingClientRect();
    return clamp(-r.top / (r.height - vh()));
  };

  /* ---------- Filters + rail (needed with or without motion) ---------- */
  const rail = document.querySelector(".rail");
  const [prev, next] = document.querySelectorAll(".rail-nav button");
  const railButtons = () => {
    prev.disabled = rail.scrollLeft < 8;
    next.disabled = rail.scrollLeft + rail.clientWidth > rail.scrollWidth - 8;
  };
  document.querySelectorAll(".rail-nav button").forEach((b) =>
    b.addEventListener("click", () => {
      const fig = rail.querySelector("figure:not([hidden])");
      const step = fig
        ? fig.offsetWidth + parseFloat(getComputedStyle(rail).columnGap || 20)
        : 300;
      rail.scrollBy({
        left: step * Number(b.dataset.dir),
        behavior: reduced ? "auto" : "smooth",
      });
    }),
  );
  rail.addEventListener("scroll", railButtons, { passive: true });
  document.querySelectorAll(".filters button").forEach((btn) =>
    btn.addEventListener("click", () => {
      document
        .querySelectorAll(".filters button")
        .forEach((b) => b.setAttribute("aria-pressed", b === btn));
      rail.querySelectorAll("figure").forEach((f) => {
        f.hidden =
          btn.dataset.filter !== "all" && f.dataset.kind !== btn.dataset.filter;
      });
      rail.scrollTo({ left: 0 });
      railButtons();

  /* ---------- Step-cut frames ----------
     Each gallery tile (and the studio photo) is cut to a real step-cut outline, drawn as a clip on
     the frame plus a gold hairline that follows it. Ratios are width / height. */
  const CUTS = {
    emerald: { ar: 0.8, pts: (ar) => { const c = 14, v = c * ar; return [[c, 0], [100 - c, 0], [100, v], [100, 100 - v], [100 - c, 100], [c, 100], [0, 100 - v], [0, v]]; } },
    asscher: { ar: 0.94, pts: () => [[26, 0], [74, 0], [100, 26], [100, 74], [74, 100], [26, 100], [0, 74], [0, 26]] },
    baguette: { ar: 0.6, pts: () => [[11, 0], [89, 0], [100, 100], [0, 100]] },
    shield: { ar: 0.8, pts: () => [[0, 0], [100, 0], [100, 72], [50, 100], [0, 72]] },
    hexagon: { ar: 1.3, pts: () => [[19, 0], [81, 0], [100, 50], [81, 100], [19, 100], [0, 50]] },
    trapezoid: { ar: 0.76, pts: () => [[0, 0], [100, 0], [87, 100], [13, 100]] },
  };
  document.querySelectorAll("[data-cut]").forEach((fig) => {
    const cut = CUTS[fig.dataset.cut];
    const ph = fig.querySelector(".ph");
    if (!cut || !ph) return;
    const ar = fig.classList.contains("visit-photo") ? 0.8 : cut.ar;
    const pts = cut.pts(ar);
    fig.style.setProperty("--ar", ar);
    ph.style.clipPath = `polygon(${pts.map(([x, y]) => `${x}% ${y}%`).join(",")})`;
    const line = document.createElementNS(R.NS, "svg");
    line.setAttribute("class", "cut-line");
    line.setAttribute("viewBox", "0 0 100 100");
    line.setAttribute("preserveAspectRatio", "none");
    line.setAttribute("aria-hidden", "true");
    line.innerHTML = `<polygon points="${pts.map((p) => p.join(",")).join(" ")}"/>`;
    ph.after(line);
  });

  // The gauge: a gold mark rides the millimetre ticks as the rail scrolls
  const gaugeMark = document.querySelector(".gauge-mark");
  const gauge = () => {
    const max = rail.scrollWidth - rail.clientWidth;
    gaugeMark.style.setProperty("--g", max > 0 ? rail.scrollLeft / max : 0);
  };
  rail.addEventListener("scroll", gauge, { passive: true });
  gauge();
    }),
  );
  railButtons();

  /* ---------- Step-cut frames ----------
     Each gallery tile (and the studio photo) is cut to a real step-cut outline, drawn as a clip on
     the frame plus a gold hairline that follows it. Ratios are width / height. */
  const CUTS = {
    emerald: { ar: 0.8, pts: (ar) => { const c = 14, v = c * ar; return [[c, 0], [100 - c, 0], [100, v], [100, 100 - v], [100 - c, 100], [c, 100], [0, 100 - v], [0, v]]; } },
    asscher: { ar: 0.94, pts: () => [[26, 0], [74, 0], [100, 26], [100, 74], [74, 100], [26, 100], [0, 74], [0, 26]] },
    baguette: { ar: 0.6, pts: () => [[11, 0], [89, 0], [100, 100], [0, 100]] },
    shield: { ar: 0.8, pts: () => [[0, 0], [100, 0], [100, 72], [50, 100], [0, 72]] },
    hexagon: { ar: 1.3, pts: () => [[19, 0], [81, 0], [100, 50], [81, 100], [19, 100], [0, 50]] },
    trapezoid: { ar: 0.76, pts: () => [[0, 0], [100, 0], [87, 100], [13, 100]] },
  };
  document.querySelectorAll("[data-cut]").forEach((fig) => {
    const cut = CUTS[fig.dataset.cut];
    const ph = fig.querySelector(".ph");
    if (!cut || !ph) return;
    const ar = fig.classList.contains("visit-photo") ? 0.8 : cut.ar;
    const pts = cut.pts(ar);
    fig.style.setProperty("--ar", ar);
    ph.style.clipPath = `polygon(${pts.map(([x, y]) => `${x}% ${y}%`).join(",")})`;
    const line = document.createElementNS(R.NS, "svg");
    line.setAttribute("class", "cut-line");
    line.setAttribute("viewBox", "0 0 100 100");
    line.setAttribute("preserveAspectRatio", "none");
    line.setAttribute("aria-hidden", "true");
    line.innerHTML = `<polygon points="${pts.map((p) => p.join(",")).join(" ")}"/>`;
    ph.after(line);
  });

  // The gauge: a gold mark rides the millimetre ticks as the rail scrolls
  const gaugeMark = document.querySelector(".gauge-mark");
  const gauge = () => {
    const max = rail.scrollWidth - rail.clientWidth;
    gaugeMark.style.setProperty("--g", max > 0 ? rail.scrollLeft / max : 0);
  };
  rail.addEventListener("scroll", gauge, { passive: true });
  gauge();

  // Shared with ring3d.js
  R.story = { hero: 0, proc: 0, ready: false };
  if (reduced) return;

  /* ---------- 1 Hero ---------- */
  const hero = document.querySelector(".hero");
  const foot = hero.querySelector(".hero-foot");
  const lines = [...hero.querySelectorAll(".statement .ln > span")];
  function heroFrame() {
    const p = progress(hero);
    R.story.hero = p;
    // The quiet line and the buttons step aside as soon as you scroll
    const out = range(p, 0.02, 0.18);
    foot.style.transform = `translateY(${40 * ease(out)}px)`;
    foot.style.opacity = 1 - out;
    foot.style.visibility = out >= 1 ? "hidden" : "";
    // "Brilliant. By appointment." rises into the gap the letters leave, then lifts away
    lines.forEach((el, i) => {
      const inn = ease(range(p, 0.2 + i * 0.04, 0.34 + i * 0.04));
      const away = ease(range(p, 0.46, 0.56));
      el.style.transform = `translateY(${(1 - inn) * 105 - away * 105}%)`;
    });
    hero.dataset.theme = p > 0.62 ? "dark" : "light";
  }

  /* ---------- 2 Process ---------- */
  const proc = document.querySelector(".process");
  const procStick = proc.querySelector(".stick");
  const says = [...proc.querySelectorAll(".say")];
  const steps = [...proc.querySelectorAll(".steps li")];
  const shapeLine = proc.querySelector(".shape-line");
  const shapeName = proc.querySelector(".shape-name");
  const shapeNote = proc.querySelector(".shape-note");
  // Must match the morph windows in ring3d.js
  const SHAPES = [
    { at: 0, name: "Oval.", note: "Long on the hand, generous for its size." },
    {
      at: 0.125,
      name: "Radiant.",
      note: "Rectangular, with a round's sparkle. Clean lines, lots of light.",
    },
    {
      at: 0.215,
      name: "Pear.",
      note: "Round at one end, pointed at the other. A little unexpected.",
    },
    {
      at: 0.305,
      name: "Round.",
      note: "The most light a diamond can return. Our most asked-for.",
    },
  ];
  let shapeIdx = 0,
    stepIdx = -1;

  function setShape(i) {
    if (i === shapeIdx) return;
    shapeIdx = i;
    shapeName.textContent = SHAPES[i].name;
    shapeNote.textContent = SHAPES[i].note;
    // Restart the rise-in animation in place (no timers, so a fast scroll never lags behind)
    shapeLine.classList.remove("swap");
    void shapeLine.offsetWidth;
    shapeLine.classList.add("swap");
  }

  function setStep(i) {
    if (i === stepIdx) return;
    says.forEach((s, j) => {
      s.classList.toggle("on", j === i);
      s.classList.toggle("off", j < i);
      s.setAttribute("aria-hidden", j !== i);
    });
    steps.forEach((s, j) => s.classList.toggle("on", j === i));
    stepIdx = i;
  }

  function procFrame() {
    const p = progress(proc);
    R.story.proc = p;
    procStick.style.visibility =
      proc.getBoundingClientRect().top > 1 ? "hidden" : "";
    setShape(SHAPES.reduce((acc, s, i) => (p >= s.at ? i : acc), 0));
    setStep(p < 0.41 ? 0 : p < 0.7 ? 1 : 2);
    const light = ease(range(p, 0.72, 0.86)) > 0.5;
    proc.classList.toggle("is-light", light);
    proc.dataset.theme = light ? "light" : "dark";
    steps[0].querySelector("i").style.setProperty("--p", range(p, 0, 0.41));
    steps[1].querySelector("i").style.setProperty("--p", range(p, 0.41, 0.7));
    steps[2].querySelector("i").style.setProperty("--p", range(p, 0.7, 0.93));
  }

  const all = () => {
    heroFrame();
    procFrame();
  };
  frameFns.push(all);
  all();
})();
