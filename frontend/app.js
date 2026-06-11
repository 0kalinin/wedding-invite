"use strict";

console.log("%cГоспода айтишники, пожалуйста не ломайте мой сайтик 🙏", "font-size:14px;color:#b98a7a;font-weight:bold");

const CFG = window.APP_CONFIG;

// ---------- options ----------
const ALCOHOL = [
  { v: "wine", l: "Вино" },
  { v: "champagne", l: "Шампанское" },
  { v: "spirits", l: "Крепкое" },
  { v: "beer", l: "Пиво" },
  { v: "none", l: "Не пью" },
];
const FOOD = [
  { v: "vegetarian", l: "Вегетарианец" },
  { v: "no_fish", l: "Без рыбы и морепродуктов" },
  { v: "no_gluten", l: "Без глютена" },
];
const TRANSPORT = [
  { v: "there", l: "Туда" },
  { v: "back", l: "Обратно" },
  { v: "both", l: "Туда-обратно" },
  { v: "own", l: "Свой транспорт" },
  { v: "none", l: "Не нужно" },
];

// ---------- state ----------
let CODE = null;
let guest = null; // current guest record from the server
let survey = {}; // local mirror of guest.survey

// ---------- api ----------
function api(path, options = {}) {
  return fetch(`${CFG.FUNCTIONS_URL}${path}`, {
    ...options,
    headers: {
      apikey: CFG.ANON_KEY,
      Authorization: `Bearer ${CFG.ANON_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
}

// ---------- autosave ----------
let saveTimer = null;
let pendingPatch = {};

function showSaving() {
  const el = document.getElementById("save-indicator");
  el.textContent = "Сохранение…";
  el.classList.add("show");
}
function showSaved() {
  const el = document.getElementById("save-indicator");
  el.textContent = "Сохранено ✓";
  el.classList.add("show");
  clearTimeout(el._hideTimer);
  el._hideTimer = setTimeout(() => el.classList.remove("show"), 1600);
}

async function flushSave() {
  if (!Object.keys(pendingPatch).length) return;
  const patch = pendingPatch;
  pendingPatch = {};
  showSaving();
  try {
    const res = await api("/guest", {
      method: "POST",
      body: JSON.stringify({ code: CODE, patch }),
    });
    if (!res.ok) throw new Error("save failed");
    const data = await res.json();
    guest = data;
    survey = data.survey || {};
    showSaved();
  } catch (e) {
    const el = document.getElementById("save-indicator");
    el.textContent = "Не удалось сохранить — повторим…";
    el.classList.add("show");
    // re-queue and retry shortly
    pendingPatch = { ...patch, ...pendingPatch };
    setTimeout(flushSave, 2500);
  }
}

// Merge a partial patch and debounce the network write.
function queueSave(patch, immediate = false) {
  pendingPatch = { ...pendingPatch, ...patch };
  if (patch.survey) {
    pendingPatch.survey = { ...(pendingPatch.survey || {}), ...patch.survey };
  }
  clearTimeout(saveTimer);
  if (immediate) flushSave();
  else saveTimer = setTimeout(flushSave, 400);
}

// ---------- rendering helpers ----------
function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) if (c) node.appendChild(c);
  return node;
}

// Multi-select chip group bound to survey[key] (array).
function checkboxGroup(labelText, options, key) {
  const wrap = el("div");
  wrap.appendChild(el("label", { class: "field-label", text: labelText }));
  const box = el("div", { class: "options" });
  const selected = new Set(survey[key] || []);
  for (const opt of options) {
    const input = el("input", { type: "checkbox" });
    input.checked = selected.has(opt.v);
    const chip = el("label", { class: "chip" + (input.checked ? " checked" : "") }, [
      input,
      el("span", { text: opt.l }),
    ]);
    input.addEventListener("change", () => {
      chip.classList.toggle("checked", input.checked);
      if (input.checked) selected.add(opt.v);
      else selected.delete(opt.v);
      queueSave({ survey: { [key]: [...selected] } });
    });
    box.appendChild(chip);
  }
  wrap.appendChild(box);
  return wrap;
}

// Single-select chip group bound to survey[key] (string).
function singleSelect(labelText, options, key) {
  const wrap = el("div");
  wrap.appendChild(el("label", { class: "field-label", text: labelText }));
  const box = el("div", { class: "options" });
  const chips = [];
  for (const opt of options) {
    const input = el("input", { type: "radio" });
    input.checked = survey[key] === opt.v;
    const chip = el("label", { class: "chip" + (input.checked ? " checked" : "") }, [
      input,
      el("span", { text: opt.l }),
    ]);
    chip.addEventListener("click", () => {
      chips.forEach((c) => c.classList.remove("checked"));
      chip.classList.add("checked");
      queueSave({ survey: { [key]: opt.v } });
    });
    chips.push(chip);
    box.appendChild(chip);
  }
  wrap.appendChild(box);
  return wrap;
}

function textField(labelText, key, placeholder) {
  const wrap = el("div");
  wrap.appendChild(el("label", { class: "field-label", text: labelText }));
  const ta = el("textarea", { rows: "2", placeholder: placeholder || "" });
  ta.value = survey[key] || "";
  ta.addEventListener("input", () => queueSave({ survey: { [key]: ta.value } }));
  wrap.appendChild(ta);
  return wrap;
}

// One person's questionnaire block (prefix "" for guest, "plus_one_" for +1).
function personBlock(title, prefix) {
  const block = el("div", { class: "survey-block" });
  if (title) block.appendChild(el("p", { class: "block-title", text: title }));
  block.appendChild(checkboxGroup("Что предпочитаете из напитков?", ALCOHOL, prefix + "alcohol"));
  block.appendChild(checkboxGroup("Особенности в еде", FOOD, prefix + "food"));
  block.appendChild(textField("Аллергии / что не едите / пожелания к алкоголю", prefix + "food_notes", "Напишите, если есть"));
  block.appendChild(singleSelect("Нужна помощь с трансфером?", TRANSPORT, prefix + "transport"));
  block.appendChild(textField("Пожелания / комментарий", prefix + "notes", "Что-то ещё?"));
  return block;
}

function renderSurvey() {
  const root = document.getElementById("survey-fields");
  root.innerHTML = "";

  // Show the +1's questionnaire only when both people are coming
  // (and a +1 name actually exists).
  const showPlus =
    guest.has_plus_one && guest.attendance === "both" && plusNameAvailable();

  // Primary guest's block (label it only when a second block is shown).
  root.appendChild(personBlock(showPlus ? guest.name : "", ""));

  if (showPlus) {
    const plusBlock = el("div", { class: "survey-block" });
    plusBlock.appendChild(el("p", { id: "plus-block-title", class: "block-title", text: plusTitle() }));
    root.appendChild(plusBlock);

    // Reuse the same fields for the +1, with prefixed keys.
    const inner = personBlock("", "plus_one_");
    inner.classList.remove("survey-block");
    plusBlock.appendChild(inner);
  }
}

// ---------- names / wording ----------
// The +1 name, whether set by admin (plus_one_name) or typed by the guest.
function plusNameValue() {
  return (guest.plus_one_name || guest.plus_one_name_filled || "").trim();
}
function plusNameAvailable() {
  return !!plusNameValue();
}
// Admin did NOT pre-set the +1 name -> the guest may type it inline.
function plusNameEditable() {
  return guest.has_plus_one && !guest.plus_one_name;
}
// Gendered noun for the +1, used when the name isn't known yet.
function plusNounCap() {
  if (guest.plus_one_gender === "f") return "Спутница";
  if (guest.plus_one_gender === "m") return "Спутник";
  return "Спутник(ца)";
}
function plusTitle() {
  return plusNameValue() || plusNounCap();
}
// "один" / "одна" / neutral fallback, based on the primary guest's gender.
function soloWord() {
  if (guest.gender === "f") return "одна";
  if (guest.gender === "m") return "один";
  return "один(а)";
}

// ---------- RSVP ----------
function attendanceIsGoing(a) {
  return a === "yes" || a === "both" || a === "one";
}

function applyAttendanceView() {
  const surveyEl = document.getElementById("survey");
  const noteEl = document.getElementById("status-note");
  const noteText = document.getElementById("status-note-text");
  const a = guest.attendance;

  if (a == null) {
    surveyEl.classList.add("hidden");
    noteEl.classList.add("hidden");
  } else if (attendanceIsGoing(a)) {
    // Coming -> show the questionnaire.
    noteEl.classList.add("hidden");
    surveyEl.classList.remove("hidden");
  } else if (a === "maybe") {
    // Undecided -> no questionnaire, gentle note.
    surveyEl.classList.add("hidden");
    noteText.textContent = "Будем ждать вашего решения 🙂 Дайте знать, как определитесь.";
    noteEl.classList.remove("hidden");
  } else {
    // Declined.
    surveyEl.classList.add("hidden");
    noteText.textContent = "Жаль, что не сможете быть с нами. Спасибо, что дали знать — будем скучать! 💛";
    noteEl.classList.remove("hidden");
  }
}

// Which buttons to show, depending on +1 presence and whether the +1 has a name.
function rsvpButtons() {
  if (!guest.has_plus_one) {
    return [
      { v: "yes", l: "Обязательно буду!" },
      { v: "maybe", l: "Пока не знаю", maybe: true },
      { v: "no", l: "Не смогу :(", decline: true },
    ];
  }
  // Has a +1 slot, but no name yet -> the guest speaks only for themselves.
  // "Обязательно буду!" means coming alone (one).
  if (!plusNameAvailable()) {
    return [
      { v: "one", l: "Обязательно буду!" },
      { v: "maybe", l: "Пока не знаю", maybe: true },
      { v: "none", l: "Не смогу :(", decline: true },
    ];
  }
  // +1 name known -> full set.
  return [
    { v: "both", l: "Обязательно будем!" },
    { v: "one", l: `Приду ${soloWord()}` },
    { v: "maybe", l: "Пока не знаем", maybe: true },
    { v: "none", l: "Не сможем :(", decline: true },
  ];
}

function renderRsvp() {
  document.getElementById("rsvp-question").textContent = "Сможете прийти?";
  const box = document.getElementById("rsvp-buttons");
  box.innerHTML = "";

  for (const b of rsvpButtons()) {
    const btn = el("button", {
      class:
        "rsvp-btn" +
        (b.decline ? " decline" : "") +
        (b.maybe ? " maybe" : "") +
        (guest.attendance === b.v ? " selected" : ""),
      text: b.l,
    });
    btn.addEventListener("click", () => {
      guest.attendance = b.v;
      [...box.children].forEach((c) => c.classList.remove("selected"));
      btn.classList.add("selected");
      renderSurvey(); // +1 block visibility depends on both/one
      applyAttendanceView();
      queueSave({ attendance: b.v }, true);
    });
    box.appendChild(btn);
  }
}

// ---------- greeting ----------
function renderGreeting() {
  const g = document.getElementById("guest-greeting");
  g.innerHTML = "";

  // Singular "тебя" for a solo invite, plural "вас" when a +1 is included.
  const you = guest.has_plus_one ? "вас" : "тебя";
  const intro = document.getElementById("invite-text");
  if (intro) {
    intro.textContent =
      `С большой радостью приглашаем ${you} разделить с нами один из самых важных дней нашей жизни.`;
  }

  if (!guest.has_plus_one) {
    g.textContent = guest.name;
    return;
  }
  if (guest.plus_one_name) {
    g.textContent = `${guest.name} и ${guest.plus_one_name}`;
    return;
  }

  // +1 exists but the name wasn't known in advance — let the guest type it
  // inline, styled to read as part of the heading (not like a form field).
  g.appendChild(document.createTextNode(`${guest.name} и `));
  const span = el("span", {
    class: "inline-edit",
    contenteditable: "true",
    "data-ph": "имя (+1)",
    spellcheck: "false",
  });
  span.textContent = guest.plus_one_name_filled || "";

  let prevAvail = plusNameAvailable();

  span.addEventListener("keydown", (e) => {
    if (e.key === "Enter") e.preventDefault();
  });
  span.addEventListener("input", () => {
    const val = span.textContent.trim();
    guest.plus_one_name_filled = val;

    const nowAvail = !!val;
    if (nowAvail !== prevAvail) {
      if (nowAvail) {
        // Entering a +1 name implies both are coming.
        guest.attendance = "both";
        queueSave({ attendance: "both" }, true);
      } else if (guest.attendance === "both") {
        // Erasing the name collapses "both" down to coming alone.
        guest.attendance = "one";
        queueSave({ attendance: "one" }, true);
      }
      prevAvail = nowAvail;
      renderRsvp(); // switch between 2- and 3-button modes
      renderSurvey(); // show/hide the +1 fields
      applyAttendanceView();
    }

    const t = document.getElementById("plus-block-title");
    if (t) t.textContent = plusTitle();
    queueSave({ plus_one_name_filled: val });
  });
  g.appendChild(span);
}

// ---------- boot ----------
function show(stateId) {
  for (const id of ["state-loading", "state-error", "state-main"]) {
    document.getElementById(id).classList.toggle("hidden", id !== stateId);
  }
}

async function init() {
  const params = new URLSearchParams(location.search);
  const urlCode = params.get("code");
  if (urlCode) localStorage.setItem("guest_code", urlCode);
  CODE = urlCode || localStorage.getItem("guest_code");

  if (!CODE) {
    show("state-error");
    return;
  }

  try {
    const res = await api(`/guest?code=${encodeURIComponent(CODE)}`);
    if (!res.ok) {
      // Invalid stored code shouldn't trap the user forever.
      if (res.status === 404) localStorage.removeItem("guest_code");
      const body = await res.text().catch(() => "");
      const dbg = document.getElementById("error-debug");
      if (dbg) dbg.textContent = `HTTP ${res.status} · ${body}`;
      show("state-error");
      return;
    }
    guest = await res.json();
    survey = guest.survey || {};

    // Guard against stale state: "both" is only valid when a +1 name exists.
    if (guest.has_plus_one && !plusNameAvailable() && guest.attendance === "both") {
      guest.attendance = "one";
      queueSave({ attendance: "one" }, true);
    }

    renderGreeting();
    renderRsvp();
    renderSurvey();
    applyAttendanceView();
    show("state-main");
  } catch (e) {
    show("state-error");
  }
}

init();

// ---------- hero slideshow ----------
// 4s per slide, crossfade, no manual controls. Slides 2 and 5 (index 1 and 4)
// drop the frosted blur behind the title.
(function heroSlider() {
  const slides = Array.from(document.querySelectorAll(".hero-slide"));
  const banner = document.getElementById("hero-banner");
  if (!slides.length) return;
  if (slides.length < 2) {
    slides[0].classList.add("active");
    return;
  }
  const NO_BLUR = new Set([1, 4]);
  let i = 0;
  const apply = () => {
    slides.forEach((s, idx) => s.classList.toggle("active", idx === i));
    if (banner) banner.classList.toggle("no-blur", NO_BLUR.has(i));
  };
  apply();
  if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    setInterval(() => {
      i = (i + 1) % slides.length;
      apply();
    }, 4000);
  }
})();
