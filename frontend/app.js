"use strict";

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
  { v: "no_pork", l: "Без свинины" },
  { v: "no_fish", l: "Без рыбы и морепродуктов" },
  { v: "no_gluten", l: "Без глютена" },
];
const TRANSPORT = [
  { v: "there", l: "Туда" },
  { v: "back", l: "Обратно" },
  { v: "both", l: "Туда-обратно" },
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
  block.appendChild(textField("Аллергии / что не едите", prefix + "food_notes", "Напишите, если есть"));
  block.appendChild(singleSelect("Нужна помощь с трансфером?", TRANSPORT, prefix + "transport"));
  block.appendChild(textField("Пожелания / комментарий", prefix + "notes", "Что-то ещё?"));
  return block;
}

function renderSurvey() {
  const root = document.getElementById("survey-fields");
  root.innerHTML = "";

  if (guest.has_plus_one) {
    // For a +1 guest the survey covers both people.
    root.appendChild(personBlock(guestFirstName() + " — о вас", ""));

    const plusBlock = el("div", { class: "survey-block" });
    plusBlock.appendChild(el("p", { class: "block-title", text: plusTitle() }));

    // If the +1 name wasn't known in advance, let the guest fill it in.
    if (!guest.plus_one_name) {
      plusBlock.appendChild(el("label", { class: "field-label", text: "Имя вашего спутника(цы)" }));
      const nameInput = el("input", { type: "text", placeholder: "Имя +1" });
      nameInput.value = guest.plus_one_name_filled || "";
      nameInput.addEventListener("input", () =>
        queueSave({ plus_one_name_filled: nameInput.value })
      );
      plusBlock.appendChild(nameInput);
    }
    root.appendChild(plusBlock);

    // Reuse the same fields for the +1, with prefixed keys.
    const inner = personBlock("", "plus_one_");
    inner.classList.remove("survey-block");
    plusBlock.appendChild(inner);
  } else {
    root.appendChild(personBlock("", ""));
  }
}

// ---------- names ----------
function guestFirstName() {
  return guest.name;
}
function plusTitle() {
  const n = guest.plus_one_name || guest.plus_one_name_filled;
  return n ? `${n} — о спутнике(це)` : "О вашем спутнике(це)";
}

// ---------- RSVP ----------
function attendanceIsGoing(a) {
  return a === "yes" || a === "both" || a === "one";
}

function applyAttendanceView() {
  const surveyEl = document.getElementById("survey");
  const declinedEl = document.getElementById("declined");
  const a = guest.attendance;
  if (a == null) {
    surveyEl.classList.add("hidden");
    declinedEl.classList.add("hidden");
  } else if (attendanceIsGoing(a)) {
    declinedEl.classList.add("hidden");
    surveyEl.classList.remove("hidden");
  } else {
    surveyEl.classList.add("hidden");
    declinedEl.classList.remove("hidden");
  }
}

function renderRsvp() {
  const q = document.getElementById("rsvp-question");
  const box = document.getElementById("rsvp-buttons");
  box.innerHTML = "";

  let buttons;
  if (guest.has_plus_one) {
    q.textContent = "Сможете прийти?";
    buttons = [
      { v: "both", l: "Придём вдвоём", decline: false },
      { v: "one", l: "Придёт один(а)", decline: false },
      { v: "none", l: "Не сможем прийти", decline: true },
    ];
  } else {
    q.textContent = "Сможете прийти?";
    buttons = [
      { v: "yes", l: "С радостью приду", decline: false },
      { v: "no", l: "К сожалению, не смогу", decline: true },
    ];
  }

  for (const b of buttons) {
    const btn = el("button", {
      class:
        "rsvp-btn" +
        (b.decline ? " decline" : "") +
        (guest.attendance === b.v ? " selected" : ""),
      text: b.l,
    });
    btn.addEventListener("click", () => {
      guest.attendance = b.v;
      [...box.children].forEach((c) => c.classList.remove("selected"));
      btn.classList.add("selected");
      applyAttendanceView();
      queueSave({ attendance: b.v }, true);
    });
    box.appendChild(btn);
  }
}

// ---------- greeting ----------
function renderGreeting() {
  const g = document.getElementById("guest-greeting");
  if (guest.has_plus_one) {
    const plus = guest.plus_one_name;
    g.textContent = plus ? `${guest.name} и ${plus}` : `${guest.name} +1`;
  } else {
    g.textContent = guest.name;
  }
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
      show("state-error");
      return;
    }
    guest = await res.json();
    survey = guest.survey || {};

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
