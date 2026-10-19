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
    }),
  );
  railButtons();

  // Shared with ring3d.js
  R.story = { hero: 0, proc: 0, ready: false };
  if (reduced) return;

  /* ---------- 1 Hero ---------- */
  const hero = document.querySelector(".hero");
  const copy = hero.querySelector(".hero-copy");
  function heroFrame() {
    const p = progress(hero);
    R.story.hero = p;
    const out = range(p, 0.02, 0.3);
    copy.style.transform = `translateY(${-70 * ease(out)}px)`;
    copy.style.opacity = 1 - out;
    copy.style.visibility = out >= 1 ? "hidden" : "";
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

  /* ---------- 4 Lab-grown ---------- */
  const lab = document.querySelector(".lab");
  const labFacet = lab.querySelector(".lab-facet");
  const facts = [...lab.querySelectorAll(".facts li")];
  function labFrame() {
    const p = progress(lab);
    labFacet.style.setProperty("--rot", `${p * 45}deg`);
    facts.forEach((f, i) =>
      f.style.setProperty("--f", ease(range(p, 0.12 + i * 0.2, 0.3 + i * 0.2))),
    );
  }

  const all = () => {
    heroFrame();
    procFrame();
    labFrame();
  };
  frameFns.push(all);
  all();
})();
