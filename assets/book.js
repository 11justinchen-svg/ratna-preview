// Booking page: mode switch, live preview, date and time slots, validation, confirmation.
// Nothing is sent anywhere yet: this is the mockup. The live site would post to the shop's
// inbox and calendar (FormSubmit or Cal.com) where the confirmation screen says so.
(() => {
  const { facetPaths, facetIcon, reduced, lenis, NS } = window.Ratna;
  const main = document.querySelector(".book");
  const forms = {
    consult: document.getElementById("consult"),
    quote: document.getElementById("quote"),
  };
  const tabs = [...document.querySelectorAll('.seg [role="tab"]')];
  const summary = document.querySelector(".preview .summary");
  const done = document.querySelector(".done");
  const mbar = document.querySelector(".mbar");
  const mbarText = mbar.querySelector(".mbar-text");
  const scrollTo = (el, offset = -100) => {
    if (lenis) lenis.scrollTo(el, { offset, duration: 1.2 });
    else
      window.scrollTo({
        top: el.getBoundingClientRect().top + scrollY + offset,
        behavior: reduced ? "auto" : "smooth",
      });
  };

  /* ---------- Mode ---------- */
  function setMode(mode, focus) {
    main.dataset.mode = mode;
    tabs.forEach((t) => {
      const on = t.dataset.mode === mode;
      t.setAttribute("aria-selected", on);
      t.tabIndex = on ? 0 : -1;
      if (on && focus) t.focus();
    });
    Object.entries(forms).forEach(([k, f]) => (f.hidden = k !== mode));
    done.hidden = true;
    main.classList.remove("is-done");
    history.replaceState(
      null,
      "",
      mode === "quote" ? "#quote" : location.pathname,
    );
    document.title = `${mode === "quote" ? "Request a quote" : "Book a consultation"} · Ratna by Batra`;
    update();
  }
  tabs.forEach((t) =>
    t.addEventListener("click", () => setMode(t.dataset.mode)),
  );
  document.querySelector(".seg").addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    setMode(main.dataset.mode === "consult" ? "quote" : "consult", true);
  });

  /* ---------- Shapes ---------- */
  const SHAPES = [
    "Round",
    "Oval",
    "Emerald",
    "Pear",
    "Cushion",
    "Radiant",
    "Marquise",
    "Princess",
  ];
  const shapeTiles = forms.quote.querySelector(".shapes");
  SHAPES.forEach((s, i) => {
    const label = document.createElement("label");
    label.className = "tile";
    label.innerHTML = `<input type="radio" name="shape" value="${s}" ${i === 1 ? "checked" : ""}><b>${s}</b>`;
    label.insertBefore(
      facetIcon(s.toLowerCase(), 56),
      label.querySelector("b"),
    );
    shapeTiles.appendChild(label);
  });

  /* ---------- Days and times (Toronto, Tuesday to Saturday) ---------- */
  const daysEl = forms.consult.querySelector(".days");
  const timesEl = forms.consult.querySelector(".times");
  const fmtDay = new Intl.DateTimeFormat("en-CA", { weekday: "short" });
  const fmtMonth = new Intl.DateTimeFormat("en-CA", { month: "short" });
  const fmtLong = new Intl.DateTimeFormat("en-CA", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const days = [];
  for (let d = new Date(), n = 0; days.length < 12 && n < 30; n++) {
    d = new Date(Date.now() + (n + 1) * 864e5);
    if (d.getDay() >= 2 && d.getDay() <= 6) days.push(d);
  }
  days.forEach((d, i) => {
    const label = document.createElement("label");
    label.className = "tile";
    label.innerHTML = `<input type="radio" name="day" value="${d.toISOString().slice(0, 10)}" ${i === 0 ? "required" : ""}><span>${fmtDay.format(d)}</span><b>${d.getDate()}</b><span>${fmtMonth.format(d)}</span>`;
    label.querySelector("input").setAttribute("aria-label", fmtLong.format(d));
    daysEl.appendChild(label);
  });
  // A stable fake calendar so some slots look taken
  const taken = (s) =>
    [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 4 === 0;
  function renderTimes(iso) {
    const d = new Date(iso + "T12:00:00");
    const slots = ["11:00 am", "12:30 pm", "2:00 pm", "3:30 pm", "5:00 pm"];
    if (d.getDay() === 4 || d.getDay() === 5) slots.push("6:30 pm");
    timesEl.innerHTML = slots
      .map(
        (t, i) =>
          `<label class="tile"><input type="radio" name="time" value="${t}" ${i === 0 ? "required" : ""} ${taken(iso + t) ? "disabled" : ""}><b>${t}</b></label>`,
      )
      .join("");
  }
  daysEl.addEventListener("change", (e) => {
    if (e.target.name === "day") {
      renderTimes(e.target.value);
      update();
    }
  });

  /* ---------- Preview ---------- */
  const ring = document.querySelector(".pv-ring");
  const stone = ring.querySelector(".pv-stone");
  let lastStone = "";
  function drawStone(shape, carat, show) {
    const key = `${shape}|${carat}|${show}`;
    if (key === lastStone) return;
    const swap = lastStone && lastStone.split("|")[0] !== shape;
    lastStone = key;
    const R = 157 * Math.cbrt(carat / 2); // a 2 ct round is about 8.1 mm: the size the band was drawn for
    const paint = () => {
      stone.innerHTML = "";
      if (!show) return;
      const { d, inner } = facetPaths(
        shape.toLowerCase(),
        511,
        517 + (shape === "Pear" ? 20 : 0),
        shape === "Pear" || shape === "Marquise" ? R * 0.92 : R,
      );
      stone.innerHTML = `<path class="occlude" d="${d}"/><path class="facet" d="${d}"/>${inner ? `<path class="facet facet-in" d="${inner}"/>` : ""}`;
      stone.classList.remove("swap");
    };
    if (swap && !reduced) {
      stone.classList.add("swap");
      setTimeout(paint, 200);
    } else paint();
  }

  const val = (form, name) =>
    (form.elements[name] && form.elements[name].value) || "";
  const checked = (form, name) => {
    const el = form.querySelector(`input[name="${name}"]:checked`);
    return el ? el.value : "";
  };

  function rows() {
    if (main.dataset.mode === "consult") {
      const f = forms.consult,
        day = checked(f, "day"),
        time = checked(f, "time");
      const when = day
        ? `${fmtLong.format(new Date(day + "T12:00:00"))}${time ? `, ${time}` : ""}`
        : "";
      return [
        ["Looking for", checked(f, "interest")],
        ["Where", checked(f, "where")],
        ["When", when],
      ];
    }
    const f = forms.quote,
      help = f.elements.caratHelp.checked;
    return [
      ["Piece", checked(f, "piece")],
      ["Shape", checked(f, "shape")],
      [
        "Size",
        help ? "Help me choose" : `${Number(val(f, "carat")).toFixed(2)} ct`,
      ],
      ["Metal", checked(f, "metal")],
      ["Budget", val(f, "budget") || "Not sure yet"],
    ];
  }
  const renderRows = (r) =>
    r
      .map(
        ([k, v]) =>
          `<div><dt>${k}</dt><dd class="${v ? "" : "empty"}">${v || "Not chosen"}</dd></div>`,
      )
      .join("");

  function update() {
    const r = rows();
    summary.innerHTML = renderRows(r);
    mbarText.textContent =
      r
        .map(([, v]) => v)
        .filter(Boolean)
        .join(" · ") ||
      (main.dataset.mode === "consult"
        ? "Choose what you're looking for"
        : "Choose a piece");
    if (main.dataset.mode === "quote") {
      const f = forms.quote,
        piece = checked(f, "piece");
      const metal = f.querySelector('input[name="metal"]:checked');
      ring.style.setProperty(
        "--metal",
        metal ? metal.nextElementSibling.style.getPropertyValue("--m") : "",
      );
      ring.classList.toggle(
        "no-band",
        !["Engagement ring", "Wedding band"].includes(piece),
      );
      drawStone(
        checked(f, "shape") || "Oval",
        Number(val(f, "carat")) || 1.5,
        piece !== "Wedding band",
      );
      f.querySelector(".carat-out").textContent =
        `${Number(val(f, "carat")).toFixed(2)} ct`;
    }
  }
  Object.values(forms).forEach((f) => {
    f.addEventListener("input", update);
    f.addEventListener("change", update);
  });

  /* ---------- Inspiration photos ---------- */
  const drop = forms.quote.querySelector(".drop");
  const fileInput = drop.querySelector("input");
  const thumbs = forms.quote.querySelector(".thumbs");
  let photos = [];
  function renderThumbs() {
    thumbs.innerHTML = "";
    photos.forEach((file, i) => {
      const fig = document.createElement("figure");
      const img = new Image();
      img.alt = file.name;
      img.src = URL.createObjectURL(file);
      img.onload = () => URL.revokeObjectURL(img.src);
      const rm = Object.assign(document.createElement("button"), {
        type: "button",
        textContent: "×",
      });
      rm.setAttribute("aria-label", `Remove ${file.name}`);
      rm.onclick = () => {
        photos.splice(i, 1);
        renderThumbs();
      };
      fig.append(img, rm);
      thumbs.appendChild(fig);
    });
  }
  const addFiles = (list) => {
    photos = photos
      .concat([...list].filter((f) => f.type.startsWith("image/")))
      .slice(0, 6);
    renderThumbs();
  };
  fileInput.addEventListener("change", () => {
    addFiles(fileInput.files);
    fileInput.value = "";
  });
  ["dragenter", "dragover"].forEach((ev) =>
    drop.addEventListener(ev, (e) => {
      e.preventDefault();
      drop.classList.add("over");
    }),
  );
  ["dragleave", "drop"].forEach((ev) =>
    drop.addEventListener(ev, () => drop.classList.remove("over")),
  );
  drop.addEventListener("drop", (e) => {
    e.preventDefault();
    addFiles(e.dataTransfer.files);
  });

  /* ---------- Validation and submit ---------- */
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  function validate(form) {
    const problems = [];
    form.querySelectorAll(".err").forEach((e) => (e.textContent = ""));
    form
      .querySelectorAll("[aria-invalid]")
      .forEach((e) => e.removeAttribute("aria-invalid"));
    const need = (q, msg) => {
      problems.push(q);
      q.querySelector(".err").textContent = msg;
    };
    if (form === forms.consult) {
      const qs = form.querySelectorAll(".q");
      if (!checked(form, "interest"))
        need(qs[0], "Choose what you're looking for.");
      if (!checked(form, "where"))
        need(qs[1], "Choose how you'd like to meet.");
      if (!checked(form, "day") || !checked(form, "time"))
        need(
          qs[2],
          checked(form, "day") ? "Choose a time." : "Choose a day and a time.",
        );
    }
    const contact = [...form.querySelectorAll(".q")].pop();
    const bad = [];
    if (!val(form, "name").trim()) bad.push(form.elements.name);
    if (!EMAIL.test(val(form, "email").trim())) bad.push(form.elements.email);
    if (bad.length) {
      bad.forEach((el) => el.setAttribute("aria-invalid", "true"));
      need(
        contact,
        bad.length === 2
          ? "Add your name and email so we can confirm."
          : bad[0] === form.elements.name
            ? "Add your name."
            : "Check your email address.",
      );
    }
    return problems;
  }

  Object.values(forms).forEach((form) =>
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const problems = validate(form);
      if (problems.length) {
        scrollTo(problems[0]);
        const first = problems[0].querySelector(
          '[aria-invalid="true"], input:not([disabled])',
        );
        first && first.focus({ preventScroll: true });
        return;
      }
      const consult = form === forms.consult;
      const name = val(form, "name").trim().split(" ")[0];
      done.querySelector(".done-title").textContent = consult
        ? `See you soon, ${name}.`
        : `Thank you, ${name}.`;
      done.querySelector(".done-text").textContent = consult
        ? `We've held your time and will confirm it by email at ${val(form, "email").trim()}.`
        : `We'll reply to ${val(form, "email").trim()} with stone options, a price range and a first sketch.${photos.length ? ` Your ${photos.length} photo${photos.length > 1 ? "s" : ""} came through.` : ""}`;
      done.querySelector(".done-summary").innerHTML = renderRows(rows());
      const mark = done.querySelector(".done-mark");
      mark.innerHTML = "";
      const { d, inner } = facetPaths(
        consult ? "round" : (checked(form, "shape") || "Oval").toLowerCase(),
        50,
        50,
        36,
      );
      mark.innerHTML = `<path class="facet" pathLength="1" d="${d}"/><path class="facet facet-in" pathLength="1" d="${inner}"/>`;
      form.hidden = true;
      done.hidden = false;
      mbar.classList.remove("show");
      main.classList.add("is-done");
      scrollTo(done, -140);
      done.focus({ preventScroll: true });
    }),
  );

  /* ---------- Mobile bar: shows while you're in the questions, hands off to the real button ---------- */
  mbar.querySelector(".btn").addEventListener("click", () => {
    const form = forms[main.dataset.mode];
    const missing =
      form === forms.consult
        ? [
            ["interest", 0],
            ["where", 1],
            ["time", 2],
          ].find(([n]) => !checked(form, n))
        : null;
    if (missing) scrollTo(form.querySelectorAll(".q")[missing[1]]);
    else form.requestSubmit();
  });
  let inForm = false,
    atSubmit = false;
  const showBar = () =>
    mbar.classList.toggle("show", inForm && !atSubmit && done.hidden);
  new IntersectionObserver(
    ([e]) => {
      inForm = e.isIntersecting;
      showBar();
    },
    { rootMargin: "-30% 0px -30% 0px" },
  ).observe(document.querySelector(".panels"));
  const submitObs = new IntersectionObserver((es) => {
    atSubmit = es.some((e) => e.isIntersecting);
    showBar();
  });
  document.querySelectorAll(".submit-row").forEach((r) => submitObs.observe(r));

  setMode(location.hash === "#quote" ? "quote" : "consult");
})();
