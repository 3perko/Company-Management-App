/* Sprievodca „Ako to funguje“ – prepínanie úrovní, obsah, interaktívne ukážky. Bez závislostí. */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const eur = (v) => new Intl.NumberFormat("sk-SK", { style: "currency", currency: "EUR" }).format(v || 0);
  const num = (v, d = 2) => new Intl.NumberFormat("sk-SK", { minimumFractionDigits: 0, maximumFractionDigits: d }).format(v || 0);
  const pad2 = (x) => String(x).padStart(2, "0");
  const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };
  const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const muted = (t) => `<div style="color:var(--muted);font-size:14.5px;margin-top:8px">${t}</div>`;

  // ---------------------------------------------------------------- theme
  const root = document.documentElement;
  const savedTheme = store.get("hiw.theme");
  if (savedTheme) root.dataset.theme = savedTheme;
  $("#themeBtn").addEventListener("click", () => {
    const dark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    root.dataset.theme = dark ? "light" : "dark";
    store.set("hiw.theme", root.dataset.theme);
  });

  // ---------------------------------------------------------------- levels
  const WHO = {
    1: "Pre každého: majiteľ firmy, nový kolega, pracovník. Čo aplikácia robí, prečo a na akých pravidlách stojí. Bez technických detailov.",
    2: "Pre človeka, ktorý v aplikácii denne pracuje: kde čo nájde, doklady, hodiny, tabuľky, fakturácia a zoznam vecí na vybavenie.",
    3: "Pre správcu a účtovne zdatného používateľa: presné pravidlá výpočtov, poradie krokov, tolerancie a dôsledky mazania. So simulátormi.",
    4: "Pre IT a vývojára (aj Claude Code): architektúra, register polí, API, dátový model, bezpečnosť, integrácie a ako aplikáciu rozšíriť.",
  };
  const NAMES = { 1: "Základ", 2: "Používateľ", 3: "Pokročilý", 4: "Profesionál" };
  const NEXT = {
    1: ["Chcete v aplikácii aj pracovať?", "Úroveň 02 ukáže, kde čo nájdete a ako vyzerá bežný deň."],
    2: ["Zaujíma vás, ako presne to počíta?", "Úroveň 03 má pravidlá, tolerancie a simulátory."],
    3: ["Chcete vidieť pod kapotu?", "Úroveň 04 je o architektúre, API a dátovom modeli."],
    4: ["To je všetko.", "Vráťte sa na začiatok, alebo si zapnite zobrazenie všetkých úrovní naraz."],
  };
  const clampLevel = (v) => Math.min(4, Math.max(1, Number(v) || 1));
  let level = clampLevel((location.hash.match(/^#u(\d)/) || [])[1] || store.get("hiw.level"));
  const cum = $("#cumulative");
  cum.checked = store.get("hiw.cum") === "1";
  const secs = $$("section.sec");
  secs.forEach((s) => {
    s.classList.add("reveal");
    s.insertAdjacentHTML("afterbegin", `<div class="kicker"><span class="num"></span><span class="lv">${NAMES[s.dataset.level]}</span></div>`);
  });

  // Sections fade in once they reach the viewport. Measured directly (not via an observer) so content can never stay hidden.
  function revealCheck() {
    const edge = innerHeight * 0.94;
    secs.forEach((s) => { if (!s.hidden && !s.classList.contains("in") && s.getBoundingClientRect().top < edge) s.classList.add("in"); });
  }
  const spy = "IntersectionObserver" in window
    ? new IntersectionObserver((ents) => ents.forEach((e) => {
      if (e.isIntersecting) $$("#tocList a").forEach((a) => a.classList.toggle("active", a.dataset.target === e.target.id));
    }), { rootMargin: "-120px 0px -62% 0px" })
    : null;

  function render() {
    document.body.dataset.level = String(level);
    $$(".lvl").forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.l) === level)));
    $("#lvlEyebrow").textContent = `Úroveň ${pad2(level)} · ${NAMES[level]}`;
    $("#lvlWho").textContent = WHO[level];
    secs.forEach((s) => { const l = Number(s.dataset.level); s.hidden = cum.checked ? l > level : l !== level; });
    const shown = secs.filter((s) => !s.hidden);
    const widgets = shown.reduce((n, s) => n + $$(".widget", s).length, 0);
    const pl = (n, one, few, many) => `${n} ${n === 1 ? one : n >= 2 && n <= 4 ? few : many}`;
    $("#lvlCount").textContent = `${pl(shown.length, "kapitola", "kapitoly", "kapitol")} · ${pl(widgets, "interaktívna ukážka", "interaktívne ukážky", "interaktívnych ukážok")}`;
    const toc = $("#tocList");
    toc.innerHTML = "";
    shown.forEach((s, i) => {
      $(".num", s).textContent = pad2(i + 1);
      $(".lv", s).hidden = !cum.checked;
      const a = document.createElement("a");
      a.href = "#" + s.id;
      a.dataset.target = s.id;
      a.innerHTML = `<i>${pad2(i + 1)}</i><span></span>`;
      a.lastChild.textContent = $("h2", s).textContent;
      toc.appendChild(a);
    });
    secs.forEach((s) => s.classList.remove("in"));
    const [t, d] = NEXT[level];
    $("#nextTitle").textContent = t;
    $("#nextSub").textContent = d;
    $("#nextBtn").textContent = level < 4 ? `Úroveň ${pad2(level + 1)} · ${NAMES[level + 1]} →` : "Späť na začiatok ↑";
    history.replaceState(null, "", "#u" + level);
    store.set("hiw.level", String(level));
    progress();
  }
  function setLevel(l) {
    level = clampLevel(l);
    render();
    window.scrollTo({ top: 0, behavior: calm ? "auto" : "smooth" });
  }
  $$(".lvl").forEach((b) => b.addEventListener("click", () => setLevel(b.dataset.l)));
  $("#nextBtn").addEventListener("click", () => setLevel(level < 4 ? level + 1 : 1));
  cum.addEventListener("change", () => { store.set("hiw.cum", cum.checked ? "1" : "0"); render(); });
  if (spy) secs.forEach((s) => spy.observe(s));

  // ---------------------------------------------------------------- reading progress + sticky bar
  function progress() {
    const max = document.documentElement.scrollHeight - innerHeight;
    $("#progress").style.width = (max > 0 ? Math.min(100, (scrollY / max) * 100) : 0) + "%";
    $("#bar").classList.toggle("stuck", scrollY > 8);
    revealCheck();
  }
  addEventListener("scroll", progress, { passive: true });
  addEventListener("resize", progress);

  // ---------------------------------------------------------------- L1 day story
  const DAY = [
    ["07:00 – Peter a Diesel prídu na Sikorky", "V aplikácii (aj z mobilu) cez Pridať → Zadať hodiny zapíšu: Sikorky, 7:00–15:30, „Murárske práce“."],
    ["07:05 – Transit ide na zákazku", "Vodič zadá jazdu bez km. Aplikácia vie, že Sikorky sú 25 km ďaleko, a počíta 2 × 25 + 10 % = 55 km."],
    ["10:30 – Nákup v OBI", "Peter zaplatí firemnou kartou a bloček odfotí. Pri hodinách zaškrtne „nakúpený materiál“."],
    ["Fotka sa dostane medzi prijaté súbory", "Nahratím, cez Google Drive alebo e-mailom. Rovnaký súbor sa nespracuje dvakrát."],
    ["20:00 – Automatické spracovanie", "Aplikácia prečíta QR kód, stiahne bloček z eKasy (všetky položky, DPH), navrhne zákazku Sikorky podľa názvu súboru a doklad dá „Na kontrolu“."],
    ["Ráno – kontrola", "Správca otvorí Doklady → Na kontrolu, vidí fotku aj údaje a stlačí „Potvrdiť a ďalší“. Lepiacu pásku rozdelí rovnomerne na dve zákazky."],
    ["O dva mesiace – papierový bloček", "Pridať → Skontrolovať bloček: naskenuje QR a aplikácia odpovie „Už máte, prišiel 4. 11. od Petra“. Označí ho ako fyzicky založený."],
    ["Kedykoľvek – odpoveď", "„Koľko nás stoja Sikorky?“ Zákazky → Náklady: práca + materiál + doprava, čerpanie rozpočtu a rozklik až na jednotlivý bloček."],
  ];
  let dayI = 0;
  const stepsHtml = (S, upto) => S.map(([t, d], i) =>
    `<div class="step ${i <= upto ? "on" : ""} ${i === upto ? "cur" : ""}"><div class="dot">${i + 1}</div><div><b>${t}</b><small>${d}</small></div></div>`).join("");
  function renderDay() {
    $("#dayStory").innerHTML = stepsHtml(DAY, dayI);
    $("#dayInfo").textContent = `Krok ${dayI + 1} z ${DAY.length}`;
  }
  $$("[data-day]").forEach((b) => b.addEventListener("click", () => {
    const v = Number(b.dataset.day);
    dayI = v === 0 ? 0 : Math.min(DAY.length - 1, Math.max(0, dayI + v));
    renderDay();
  }));

  // ---------------------------------------------------------------- L1 calculator
  function calc() {
    const g = (id) => Number($(id).value) || 0;
    const labor = g("#k-h") * g("#k-r");
    const mat = g("#k-m");
    const km = Math.round(2 * g("#k-d") * 1.1 * 10) / 10;
    const transport = km * g("#k-t") * g("#k-v");
    const total = labor + mat + transport;
    $("#k-total").textContent = eur(total);
    const p = (x) => (total ? (x / total) * 100 : 0);
    $("#k-bars").innerHTML = `<div style="width:${p(labor)}%;background:var(--l1)" title="Práca ${eur(labor)}"></div><div style="width:${p(mat)}%;background:var(--l2)" title="Materiál ${eur(mat)}"></div><div style="width:${p(transport)}%;background:var(--l3)" title="Doprava ${eur(transport)}"></div>`;
    $("#k-explain").textContent = `Práca ${eur(labor)} (${num(g("#k-h"))} h × ${eur(g("#k-r"))}) · Materiál ${eur(mat)} · Doprava ${eur(transport)} (${g("#k-t")} jázd × ${num(km, 1)} km × ${eur(g("#k-v"))}/km, kde ${num(km, 1)} km = 2 × ${g("#k-d")} km + 10 %).`;
  }
  $$("#l1-kalk input").forEach((i) => i.addEventListener("input", calc));

  // ---------------------------------------------------------------- L2 app map (7 areas)
  const AREAS = [
    ["Prehľad", "Úvodná obrazovka. Hore štyri čísla (rozpracované zákazky, ich náklady, náklady tento mesiac, súbory čakajúce na spracovanie), pod nimi „Čo treba vybaviť“ a rozpracované zákazky s čerpaním rozpočtu.",
      ["Čo treba vybaviť", "Rozpracované zákazky", "Prepínač mesiaca"], "Predtým: Dashboard a Financie → Mesačná kontrola."],
    ["Doklady", "Bločky a faktúry. Do prehľadov sa započítajú až potvrdené doklady. Detail dokladu má náhľad súboru vedľa údajov a lištu „Potvrdiť a ďalší“.",
      ["Na kontrolu", "Bločky", "Prijaté faktúry", "Vystavené faktúry", "Všetky", "Položky a priradenia", "Prijaté súbory"], "Predtým: Doklady, Inbox a súbory, Rýchla kontrola bločku (tá je teraz v Pridať)."],
    ["Zákazky", "Koľko zákazky stoja, koľko zarábajú a ako sú nastavené. Detail zákazky ukazuje náklady po zložkách (práca, materiál, doprava), zostatok rozpočtu a rozklik až na hodiny, jazdy a doklady.",
      ["Náklady", "Ziskovosť", "Zoznam a nastavenie"], "Predtým: Prehľady → Zákazky – náklady, Ziskovosť a Číselníky → Zákazky."],
    ["Práca", "Odpracované hodiny, jazdy a výkazy. Toto je jediná oblasť, ktorú vidí pracovník (ako „Moja práca“).",
      ["Hodiny", "Jazdy", "Výkaz pracovníka"], "Predtým: Práca a doprava a Výstupy → Podklad pre pracovníka."],
    ["Financie", "Banka a párovanie platieb (vrátane pravidiel), DPH, podklady k fakturácii zákazníkom a exporty.",
      ["Banka", "DPH", "Fakturácia", "Exporty"], "Predtým: Financie a Výstupy."],
    ["Vozidlá", "Vozidlá firmy na kartách s najbližšími termínmi. Detail vozidla má sadzby, poistenie, známky, servis, overenia aj jazdy.",
      ["Vozidlá", "Termíny a overenie", "Všetky záznamy"], "Predtým: Vozový park so šiestimi samostatnými položkami."],
    ["Nastavenie", "Veci, ktoré sa nastavia raz a menia len občas, v štyroch skupinách: Firma, Ľudia, Partneri, Systém.",
      ["Firmy", "Bankové účty", "Číselné rady faktúr", "Pracovníci", "Sadzby pracovníkov", "Používatelia a prístupy", "Odberatelia", "Opakujúce sa faktúry", "Predvolené hodnoty", "Prepojenia", "História zmien"], "Predtým: Číselníky a Nastavenia."],
  ];
  $("#navBtns").innerHTML = AREAS.map(([k], i) => `<button type="button" data-nav="${i}" aria-pressed="false"><i>${i + 1}</i>${k}</button>`).join("");
  function showArea(i) {
    const [k, d, tabs, was] = AREAS[i];
    $$("[data-nav]").forEach((x) => x.setAttribute("aria-pressed", String(Number(x.dataset.nav) === i)));
    $("#navDetail").innerHTML = `<h4>${k}</h4><p>${d}</p><div class="chips">${tabs.map((t) => `<span>${t}</span>`).join("")}</div><div class="was">${was}</div>`;
  }
  $$("[data-nav]").forEach((b) => b.addEventListener("click", () => showArea(Number(b.dataset.nav))));

  // ---------------------------------------------------------------- L2 finder (old → new)
  const WHERE = [
    ["Dashboard", "Prehľad"], ["Mesačná kontrola", "Prehľad → Čo treba vybaviť"],
    ["Zákazky – náklady", "Zákazky → Náklady"], ["Ziskovosť", "Zákazky → Ziskovosť"], ["Číselník zákaziek", "Zákazky → Zoznam a nastavenie"],
    ["Na kontrolu", "Doklady → Na kontrolu"], ["Inbox a súbory", "Doklady → Prijaté súbory"], ["Spustiť inbox", "Doklady → Prijaté súbory → Spracovať teraz"],
    ["Rýchla kontrola bločku", "Pridať → Skontrolovať bloček"], ["Nahrať doklad", "Pridať → Nahrať doklady"], ["Nový doklad ručne", "Pridať → Zadať doklad ručne"],
    ["Položky a priradenia", "Doklady → Položky a priradenia"],
    ["Hodiny", "Práca → Hodiny (alebo Pridať → Zadať hodiny)"], ["Jazdy", "Práca → Jazdy (alebo Pridať → Zadať jazdu)"],
    ["Podklad pre pracovníka", "Práca → Výkaz pracovníka"],
    ["Banka, import výpisu", "Financie → Banka (alebo Pridať → Importovať bankový výpis)"], ["Pravidlá bankových pohybov", "Financie → Banka → Pravidlá"],
    ["DPH", "Financie → DPH"], ["Podklad k fakturácii", "Financie → Fakturácia (alebo detail zákazky)"], ["Exporty", "Financie → Exporty"],
    ["Vozový park – vozidlá", "Vozidlá → Vozidlá"], ["Sadzby €/km, PZP, známky, servis", "Vozidlá → detail vozidla (alebo Všetky záznamy)"], ["Overenie vozidla", "Vozidlá → Termíny a overenie"],
    ["Firmy, bankové účty, číselné rady", "Nastavenie → Firma"], ["Pracovníci, sadzby pracovníkov", "Nastavenie → Ľudia"],
    ["Používatelia a roly", "Nastavenie → Používatelia a prístupy"], ["Odberatelia, opakujúce sa faktúry", "Nastavenie → Partneri"],
    ["Parametre", "Nastavenie → Predvolené hodnoty"], ["Integrácie (Google, Claude, eKasa)", "Nastavenie → Prepojenia"], ["Audit log", "Nastavenie → História zmien"],
    ["Tmavý režim, odhlásenie", "Ponuka pri mene vpravo hore"], ["Stĺpce, zoskupenie, uložené pohľady", "Tlačidlo Zobrazenie nad tabuľkou"], ["Export tabuľky", "Ponuka ⋯ nad tabuľkou"],
  ];
  const fold = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  function find() {
    const q = fold($("#f-q").value.trim());
    const hits = WHERE.filter(([a, b]) => !q || fold(a + " " + b).includes(q));
    const out = $("#f-out");
    out.innerHTML = "";
    if (!hits.length) { out.innerHTML = '<span class="none">Nič také tu nie je. Skúste iné slovo, napr. „banka“ alebo „sadzby“.</span>'; return; }
    hits.forEach(([a, b]) => {
      const row = document.createElement("div");
      row.innerHTML = "<span></span><span>→</span><span></span>";
      row.firstChild.textContent = a;
      row.lastChild.textContent = b;
      out.appendChild(row);
    });
  }
  $("#f-q").addEventListener("input", find);

  // ---------------------------------------------------------------- L2 split evenly (same algorithm as the app)
  function split() {
    const total = Math.round((Number($("#s-amt").value) || 0) * 100);
    const n = Math.max(1, Math.min(10, Math.floor(Number($("#s-n").value)) || 1));
    const base = Math.round(total / n);
    const parts = Array(n).fill(base);
    parts[n - 1] = total - base * (n - 1);
    $("#s-out").innerHTML = parts.map((c, i) => `<span class="pill info" style="margin:2px">Zákazka ${i + 1}: ${eur(c / 100)}</span>`).join(" ") +
      muted(`Na centy sa zaokrúhľuje tak, aby súčet presne sedel: zvyšok ide poslednej zákazke. Súčet = ${eur(parts.reduce((a, b) => a + b, 0) / 100)}.`);
  }
  $$("#s-amt, #s-n").forEach((i) => i.addEventListener("input", split));

  // ---------------------------------------------------------------- L2 originals
  const ORIG = {
    a: ['<span class="pill ok">zaevidovaný a fyzicky založený</span>', "Všetko v poriadku. Druhý súbor sa len pripojí k dokladu ako „sken fyzického originálu“, nový záznam nevznikne."],
    b: ['<span class="pill warn">zaevidovaný, fyzicky chýba</span>', "Doklad sa normálne započíta, ale na Prehľade bude v zozname „Bločky bez fyzického originálu“, kým papier nedonesiete."],
    c: ['<span class="pill info">nový záznam zo skenu</span>', "Aplikácia bloček nepoznala, preto ho založí rovno ako fyzicky založený a dá ho na kontrolu."],
  };
  function showOrig(k) {
    $$("[data-o]").forEach((x) => x.classList.toggle("primary", x.dataset.o === k));
    const [p, t] = ORIG[k];
    $("#origOut").innerHTML = `${p}<p style="margin:.6em 0 0">${t}</p>`;
  }
  $$("[data-o]").forEach((b) => b.addEventListener("click", () => showOrig(b.dataset.o)));

  // ---------------------------------------------------------------- L2 hours
  function parseT(s) {
    const t = String(s).trim().replace(/[.,h ]/g, ":");
    let m = /^(\d{1,2}):(\d{1,2})$/.exec(t) || /^(\d{1,2})(\d{2})$/.exec(t);
    if (m) return +m[1] <= 24 && +m[2] < 60 ? [+m[1] % 24, +m[2]] : null;
    m = /^(\d{1,2})$/.exec(t);
    return m && +m[1] <= 24 ? [+m[1] % 24, 0] : null;
  }
  function hours() {
    const a = parseT($("#h-from").value), b = parseT($("#h-to").value), r = Number($("#h-round").value);
    if (!a || !b) { $("#h-out").innerHTML = '<span class="pill bad">Neplatný čas</span> Použite 24-hodinový formát, napr. 7:30 alebo 1630.'; return; }
    let d = b[0] * 60 + b[1] - (a[0] * 60 + a[1]);
    const night = d <= 0;
    if (night) d += 1440;
    let h = d / 60;
    if (r > 0) h = Math.round(h / r) * r;
    $("#h-out").innerHTML = `<span class="big">${num(h)} h</span> <span style="color:var(--muted)">(${pad2(a[0])}:${pad2(a[1])} – ${pad2(b[0])}:${pad2(b[1])}${night ? ", cez polnoc" : ""}, bez automatickej prestávky)</span>`;
  }
  $$("#h-from, #h-to, #h-round").forEach((i) => i.addEventListener("input", hours));

  // ---------------------------------------------------------------- L2 billing lifecycle
  let bState = 0;
  const B_TXT = [
    ["Žiadny podklad", "info", "Vyberte zákazku a obdobie. Náhľad ukáže nevyfakturované hodiny, materiál a dopravu."],
    ["Návrh", "warn", "Podklad sa dá upravovať (odobrať položky, zmeniť DPH), stiahnuť a aj vymazať. Položky ešte nie sú označené ako vyfakturované."],
    ["Uzavretý", "ok", "Hodiny, jazdy a materiál dostali príznak vyfakturované. Nový podklad ich už neponúkne a nedajú sa meniť ani mazať."],
    ["Uzavretý + faktúra", "ok", "Podklad je naviazaný na vystavenú faktúru. Kým väzba trvá, podklad sa nedá znovu otvoriť."],
  ];
  function renderB() {
    const [t, c, d] = B_TXT[bState];
    $("#b-state").textContent = t; $("#b-state").className = "pill " + c; $("#b-text").textContent = d;
    $("#b-create").disabled = bState !== 0; $("#b-close").disabled = bState !== 1;
    $("#b-link").disabled = bState !== 2; $("#b-open").disabled = bState !== 2;
  }
  $("#b-create").onclick = () => { bState = 1; renderB(); };
  $("#b-close").onclick = () => { bState = 2; renderB(); };
  $("#b-link").onclick = () => { bState = 3; renderB(); };
  $("#b-open").onclick = () => { bState = 1; renderB(); };

  // ---------------------------------------------------------------- L3 rate lookup (mirrors calc.resolve_worker_rates)
  const RATES = [
    { lvl: "1. pracovník + zákazka", on: true, cost: 11, bill: "", from: "2026-01-01", to: "" },
    { lvl: "2. pracovník + firma", on: false, cost: 13, bill: 24, from: "", to: "" },
    { lvl: "3. všeobecná sadzba", on: true, cost: 12, bill: 22, from: "", to: "" },
  ];
  function rateRows() {
    const t = $("#rateTbl");
    RATES.forEach((r, i) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${r.lvl}</td><td><input type="checkbox" data-i="${i}" data-k="on" aria-label="Sadzba existuje" ${r.on ? "checked" : ""}></td>
        <td class="num"><input type="number" style="width:88px" data-i="${i}" data-k="cost" value="${r.cost}" placeholder="—" aria-label="Nákladová sadzba"></td>
        <td class="num"><input type="number" style="width:88px" data-i="${i}" data-k="bill" value="${r.bill}" placeholder="—" aria-label="Fakturačná sadzba"></td>
        <td><input type="date" style="min-width:140px" data-i="${i}" data-k="from" value="${r.from}" aria-label="Platí od"></td><td><input type="date" style="min-width:140px" data-i="${i}" data-k="to" value="${r.to}" aria-label="Platí do"></td>`;
      t.appendChild(tr);
    });
    $$("#rateTbl input").forEach((inp) => inp.addEventListener("input", () => {
      RATES[inp.dataset.i][inp.dataset.k] = inp.type === "checkbox" ? inp.checked : inp.value;
      rateCalc();
    }));
  }
  function rateCalc() {
    const d = $("#r-date").value, h = Number($("#r-h").value) || 0;
    const valid = (r) => r.on && (!r.from || r.from <= d) && (!r.to || r.to >= d);
    const pick = (k) => { for (const r of RATES) if (valid(r) && r[k] !== "" && r[k] !== null) return [Number(r[k]), r.lvl]; return [null, null]; };
    const [c, cl] = pick("cost"), [b, bl] = pick("bill");
    $("#rateOut").innerHTML = `Nákladová: <b>${c === null ? "nenájdená (náklad 0 €)" : eur(c) + "/h"}</b> ${cl ? `<span class="pill info">${cl}</span>` : ""}<br>
      Fakturačná: <b>${b === null ? "nenájdená" : eur(b) + "/h"}</b> ${bl ? `<span class="pill info">${bl}</span>` : ""}<br>
      Za ${num(h)} h: náklad <b>${eur((c || 0) * h)}</b>, fakturovateľná hodnota <b>${eur((b || 0) * h)}</b>`;
  }
  $$("#r-date, #r-h").forEach((i) => i.addEventListener("input", rateCalc));

  // ---------------------------------------------------------------- L3 trip
  function trip() {
    const d = Number($("#t-d").value) || 0, p = Number($("#t-p").value) || 0, r = Number($("#t-r").value) || 0;
    const given = $("#t-km").value;
    const km = given !== "" ? Number(given) : Math.round(2 * d * (1 + p / 100) * 10) / 10;
    $("#t-out").innerHTML = `<span class="big">${num(km, 1)} km × ${eur(r)} = ${eur(km * r)}</span>` +
      muted(given !== "" ? "Použité zadané km (majú prednosť)." : `Dopočítané: 2 × ${num(d, 1)} × (1 + ${num(p)}/100). Stĺpec „Km dopočítané“ = áno.`);
  }
  $$("#l3-km input").forEach((i) => i.addEventListener("input", trip));

  // ---------------------------------------------------------------- L3 pipeline
  function pipeSteps() {
    const pdf = $("#p-pdf").checked, qr = $("#p-qr").checked, ek = $("#p-ek").checked, cl = $("#p-cl").checked,
      dup = $("#p-dup").checked, fuel = $("#p-fuel").checked;
    const S = [];
    S.push(["Uloženie súboru", "Spočíta sa SHA-256. Rovnaký súbor v tej istej firme sa ďalej nespracúva, pokiaľ jeho doklad existuje."]);
    S.push([pdf ? "PDF s textom → text" : "Príprava obrázka", pdf ? "Text sa číta priamo (≥ 40 znakov), bez OCR. Doklad je elektronický, takže papierový originál nepotrebuje." : "Fotka sa otočí podľa EXIF, HEIC sa skonvertuje, zmenší sa na max 2400 px. Sken v PDF sa vyrenderuje na obrázky (max 3 strany)."]);
    S.push(["QR kód", qr ? "Z QR sa deterministicky vyčíta ID dokladu O-… (OpenCV)." : "QR sa nenašiel alebo nie je čitateľný."]);
    if (qr && dup) {
      S.push(["Duplicita podľa ID eKasa", "ID už existuje → nový doklad nevznikne, súbor sa pripojí k pôvodnému (pri skene sa označí fyzický originál). Koniec."]);
      return S;
    }
    let src = null;
    if (qr) {
      S.push(["eKasa", ek ? "Finančná správa vráti doklad: obchod, IČO, dátum, čas, všetky položky, DPH. Zdroj = eKasa." : "eKasa neodpovedala alebo doklad nenašla."]);
      if (ek) src = "eKasa";
    }
    if (!src) {
      if (cl) {
        S.push(["Claude API", pdf ? "Z textu PDF sa vyextrahuje štruktúra (hlavička, položky, DPH, poznámka, návrh zákazky)." : "Z obrázka sa vyčíta štruktúra dokladu vrátane ID eKasa a ručnej poznámky."]);
        src = pdf ? "text z PDF + Claude" : "Claude (z obrázka)";
        if (!qr) S.push(["eKasa – druhý pokus", "Ak Claude prečítal ID O-…, skontroluje sa duplicita a skúsi sa eKasa znova; ak odpovie, má prednosť."]);
      } else {
        S.push(["Bez načítania údajov", "Claude nie je nastavený → doklad sa založí prázdny s upozornením „doplňte ručne“."]);
        src = "ručne";
      }
    }
    if (dup && !qr) {
      S.push(["Záložná kontrola duplicity", "IČO + dátum + suma (+ čas ±2 min) sa zhoduje → súbor sa pripojí k existujúcemu dokladu. Koniec."]);
      return S;
    }
    S.push(["Kontroly", "Súčet položiek vs. suma, základ + DPH, IČO odberateľa vs. aktívna firma → upozornenia."]);
    S.push(["Návrh zákazky", fuel ? "Kľúčové slovo čerpacej stanice → navrhne sa Réžia (doprava sa počíta z km)." : "Poznámka → názov súboru → opakujúca sa faktúra → AI → história dodávateľa."]);
    S.push(["Na kontrolu", `Doklad čaká na potvrdenie. Zdroj údajov: ${src}. Do prehľadov ide až po potvrdení.`]);
    return S;
  }
  let pipeTimer = null;
  function drawPipe(upto) {
    const S = pipeSteps();
    $("#pipe").innerHTML = stepsHtml(S, upto);
    return S.length;
  }
  $("#p-play").onclick = () => {
    clearInterval(pipeTimer);
    let i = 0; const n = drawPipe(0);
    if (calm) { drawPipe(n - 1); return; }
    pipeTimer = setInterval(() => { i++; drawPipe(i); if (i >= n - 1) clearInterval(pipeTimer); }, 900);
  };
  $("#p-all").onclick = () => { clearInterval(pipeTimer); drawPipe(99); };
  $$("#l3-pipeline input").forEach((i) => i.addEventListener("change", () => { clearInterval(pipeTimer); drawPipe(99); }));

  // ---------------------------------------------------------------- L3 profitability
  function profit() {
    const g = (id) => Number($(id).value) || 0;
    const rev = g("#z-rev"), cost = g("#z-cost");
    const wip = g("#z-h") * g("#z-br") + g("#z-m") * (1 + g("#z-mk") / 100);
    const p = rev - cost;
    $("#z-out").innerHTML = `Zisk: <b style="color:${p < 0 ? "var(--bad)" : "var(--ok)"}">${eur(p)}</b> · marža <b>${rev ? num((p / rev) * 100, 1) + " %" : "–"}</b><br>
      Rozpracovanosť: <b>${eur(wip)}</b> = ${num(g("#z-h"))} h × ${eur(g("#z-br"))} + ${eur(g("#z-m"))} × ${num(1 + g("#z-mk") / 100, 2)}<br>
      Očakávaný zisk: <span class="big">${eur(p + wip)}</span>`;
  }
  $$("#l3-zisk input").forEach((i) => i.addEventListener("input", profit));

  // ---------------------------------------------------------------- L3 bank scoring (mirrors bank.candidates_for / match_transaction)
  function match() {
    const c = (id) => $(id).checked;
    let s = 0; const why = [];
    if (c("#m-vs")) { s += 60; why.push("VS"); }
    if (c("#m-amt")) { s += 30; why.push("suma"); }
    if (c("#m-iban")) { s += 25; why.push("IBAN"); }
    if (c("#m-name")) { s += 15; why.push("názov"); }
    if (c("#m-date")) { s += 10; why.push("dátum"); }
    const uniq = c("#m-uniq");
    const cand = s >= 30 && (why.includes("suma") || why.includes("VS"));
    let res;
    if (!cand) res = '<span class="pill bad">nie je kandidát</span> Pohyb ostane „Bez dokladu“ a objaví sa na Prehľade medzi vecami na vybavenie.';
    else {
      const strong = (why.includes("VS") && why.includes("suma")) || (why.includes("suma") && (why.includes("IBAN") || why.includes("názov")) && uniq);
      res = strong && uniq ? '<span class="pill ok">spárované automaticky</span> Párovanie je potvrdené a doklad dostane stav úhrady.'
        : '<span class="pill warn">návrh</span> Až 3 najlepší kandidáti čakajú na vaše potvrdenie v detaile pohybu.';
    }
    $("#m-out").innerHTML = `Skóre <span class="big">${s}</span> (${why.join(", ") || "nič"}) → ${res}`;
  }
  $$("#l3-banka input").forEach((i) => i.addEventListener("change", match));

  // ---------------------------------------------------------------- L3 defaults (labels as in Nastavenie → Predvolené hodnoty)
  const PARAMS = [
    ["Prirážka k vzdialenosti jazdy (%)", "10"], ["Zaokrúhlenie hodín (h)", "0,25"],
    ["Dni na doloženie dokladu k nákupu materiálu", "7"], ["Prirážka na materiál pri fakturácii (%)", "0"],
    ["Sadzba DPH pre podklad k fakturácii (%)", "23"], ["Predstih upozornení na vozidlá (dni)", "30"],
    ["Predstih upozornenia na servis (km)", "1 000"], ["Tolerancia dní pri párovaní banky", "5"],
    ["Tolerancia času pri hľadaní duplicitných bločkov (min)", "2"], ["Kľúčové slová dodávateľov/položiek pre Réžiu", "slovnaft, omv, shell, …"],
    ["Čas automatického spracovania prijatých súborov (len spoločný pre všetky firmy)", "20:00"], ["Súbory z Drive považovať za sken fyzického originálu", "áno"],
  ];
  $("#paramTbl").insertAdjacentHTML("beforeend", PARAMS.map(([a, b]) => `<tr><td>${a}</td><td class="num">${b}</td></tr>`).join(""));

  // ---------------------------------------------------------------- L4 architecture boxes
  const box = (g, x, y, label, sub) => g.insertAdjacentHTML("beforeend",
    `<rect x="${x}" y="${y}" width="250" height="40" rx="10" fill="var(--card)" stroke="var(--line)"/><text x="${x + 12}" y="${y + 17}" fill="var(--ink)">${label}</text><text x="${x + 12}" y="${y + 32}" fill="var(--muted)" font-size="10.5">${sub}</text>`);
  const IN = [["Web UI (Pridať, formuláre)", "hodiny, jazdy, doklady"], ["Google Drive priečinok", "pre každú firmu, denne 20:00"], ["Gmail plus-adresa", "prílohy → Drive + aplikácia"], ["Bankové výpisy", "CAMT.053 · CSV · XLSX · PDF"], ["eKasa · Claude API", "čítanie bločkov a faktúr"], ["[neskôr] WhatsApp", "hodiny a bločky zo skupín"]];
  const OUT = [["Prehľad, náklady zákaziek", "ziskovosť, rozpracovanosť"], ["Podklad k fakturácii", "PDF · XLSX · CSV"], ["Výkaz pracovníka", "PDF · XLSX"], ["DPH, banka, čo treba vybaviť", "čo chýba"], ["Exporty tabuliek", "podľa zobrazenia"], ["[neskôr] AI asistent, reporty", "cez API, nie priamo SQL"]];
  const gin = $("#in"), gout = $("#out");
  IN.forEach(([a, b], i) => { box(gin, 20, 35 + i * 50, a, b); gin.insertAdjacentHTML("beforeend", `<line x1="272" y1="${55 + i * 50}" x2="328" y2="185" stroke="var(--muted)" stroke-width="1" marker-end="url(#ar)" opacity=".55"/>`); });
  OUT.forEach(([a, b], i) => { box(gout, 630, 35 + i * 50, a, b); gout.insertAdjacentHTML("beforeend", `<line x1="582" y1="185" x2="626" y2="${55 + i * 50}" stroke="var(--muted)" stroke-width="1" marker-end="url(#ar)" opacity=".55"/>`); });

  // ---------------------------------------------------------------- L4 API builder
  const ENT = {
    timesheets: ["date", ["date", "worker_id", "project_id", "hours", "cost_amount"], ["worker_id", "project_id"]],
    trips: ["date", ["date", "vehicle_id", "project_id", "km_effective", "cost_amount"], ["vehicle_id", "project_id"]],
    documents: ["issue_date", ["issue_date", "partner_name", "total_gross", "status", "projects"], ["doc_type", "status"]],
    allocations: ["doc_date", ["doc_date", "project_id", "direction", "amount_net"], ["project_id", "direction"]],
    bank_transactions: ["booking_date", ["booking_date", "amount", "counterparty_name", "status"], ["status", "tx_type"]],
  };
  $("#a-ent").innerHTML = Object.keys(ENT).map((k) => `<option>${k}</option>`).join("");
  function apiFill() {
    const e = ENT[$("#a-ent").value];
    $("#a-sort").innerHTML = e[1].map((k) => `<option>${k}</option>`).join("");
    $("#a-group").innerHTML = `<option value="">—</option>` + e[2].map((k) => `<option>${k}</option>`).join("");
    api();
  }
  function api() {
    const name = $("#a-ent").value, e = ENT[name];
    const filter = [{ field: e[0], op: "between", value: [$("#a-from").value || null, $("#a-to").value || null] }];
    const p = new URLSearchParams({ columns: e[1].join(","), sort: `${$("#a-sort").value}:${$("#a-dir").value}`, filter: JSON.stringify(filter), page: "1", page_size: "50" });
    if ($("#a-group").value) p.set("group_by", $("#a-group").value);
    if ($("#a-q").value) p.set("q", $("#a-q").value);
    $("#a-out").textContent = `GET /api/data/${name}?${p.toString()}
X-Company-Id: 1

# parametre (dekódované)
columns  = ${e[1].join(",")}
sort     = ${$("#a-sort").value}:${$("#a-dir").value}        (viac úrovní: a:asc,b:desc)
filter   = ${JSON.stringify(filter)}
           op: contains | eq | neq | in | between | gte | lte | gt | lt | isnull | notnull | starts | not_contains
group_by = ${$("#a-group").value || "—"}
q        = ${$("#a-q").value || "—"}

# odpoveď
{ "rows": [ { "id": …, "${e[1][0]}": …, "<ref>__label": "…" } ],
  "total": 123, "totals": { "<číselné stĺpce>": … },
  "groups": ${$("#a-group").value ? '[ { "value": …, "label": "…", "count": …, "totals": {…} } ]' : "null"},
  "columns": [ … ], "page": 1, "page_size": 50 }`;
  }
  $("#a-ent").addEventListener("change", apiFill);
  $$("#l4-registry .fields select:not(#a-ent), #l4-registry .fields input").forEach((i) => i.addEventListener("input", api));

  // ---------------------------------------------------------------- L4 data model
  const MODEL = {
    company: "Firma: IČO, IČ DPH, platiteľ DPH, Drive priečinky (na spracovanie, spracované, bankový), e-mailové značky. Pri založení automaticky vznikne zákazka Réžia.",
    project: "Zákazka: firma (práve jedna), iné názvy, odberateľ, rozpočet, zmluvná cena, spôsob fakturácie (hourly / fixed / combined), prirážka na materiál, fakturácia dopravy + €/km, default_km_one_way, stav, is_overhead, active.",
    worker: "Pracovník (globálny): vzťah, IČO, väzba worker_company na firmy. Sadzby v worker_rate.",
    worker_rate: "Sadzba: worker, company?, project?, cost_rate?, billing_rate?, valid_from/to. Úroveň určujú vyplnené company/project.",
    timesheet_entry: "Hodiny: worker, project?, date, time_from/to, hours, material_bought, billable, zafixované cost_rate/billing_rate, cost_amount, billable_amount, billing_statement_id (vyfakturované).",
    trip: "Jazda: vehicle (aj inej firmy), project, driver, crew (trip_crew), km?, km_effective, km_computed, zafixované rate_per_km, cost_amount, billing_rate_per_km, billable_amount, billing_statement_id.",
    vehicle: "Vozidlo + vehicle_rate (€/km s platnosťou), vehicle_insurance (PZP/havarijné), vehicle_vignette, vehicle_service (ďalší servis dátum/km), vehicle_check (výsledky overení).",
    source_file: "Súbor: sha256, zdroj (upload/drive/email/…), kind_hint, physical, stav spracovania (pending / processed / skipped / error), väzba na doklad. Všetky súbory dokladu sú v document_source (original / physical_scan / duplicate). Po vymazaní dokladu sa súbor uvoľní.",
    document: "Doklad: typ (receipt / invoice_in / invoice_out), partner + IČO/IČ DPH/IBAN, buyer_ico, číslo, rad, ekasa_id, dátumy, VS, sumy, vat_breakdown, extraction_source + log, status (review/confirmed), payment_status, is_electronic, physical_original, duplicate_of, warnings.",
    allocation: "Priradenie: document, line? (null = celý doklad), project, direction (cost / revenue), share_pct?, quantity?, amount_net, amount_gross, billing_statement_id. Súčet = suma dokladu/položky (±0,02). Pri uložení dokladu sa nezmenené priradenia zachovajú ako tie isté riadky.",
    billing_statement: "Podklad k fakturácii: project, obdobie, status (draft/closed), group_by, vat_rate, súčty, invoice_document_id + riadky billing_statement_line s odkazom na timesheet/allocation/trip. Vymazanie zdroja odstráni riadok z návrhu; pri uzavretom podklade je zdroj uzamknutý.",
    bank_transaction: "Pohyb: účet, výpis, dátumy, suma (±), protistrana + IBAN, VS/SS/KS, správa, typ, dedupe_key (unikátny vo firme), status (unmatched/suggested/matched/no_document). Párovania v transaction_match, pravidlá v transaction_rule. Vymazanie dokladu alebo výpisu stav prepočíta.",
    table_view: "Uložený pohľad: user, entita/pohľad, názov, config JSON (stĺpce, šírky, triedenie, filtre, zoskupenie), is_default, shared, is_last (posledný stav).",
    audit_log: "História zmien: ts, user, company, entity, entity_id, action, changes JSON {pole: [stará, nová]}.",
  };
  $("#entBtns").innerHTML = Object.keys(MODEL).map((k) => `<button type="button" class="btn" data-ent="${k}" style="font-family:var(--mono);font-size:13.5px">${k}</button>`).join("");
  function showEnt(k) {
    $$("[data-ent]").forEach((x) => x.classList.toggle("primary", x.dataset.ent === k));
    $("#entDetail").innerHTML = `<h4 style="font-family:var(--mono)">${k}</h4><p style="margin:0">${MODEL[k]}</p>`;
  }
  $$("[data-ent]").forEach((b) => b.addEventListener("click", () => showEnt(b.dataset.ent)));

  // ---------------------------------------------------------------- init
  renderDay(); calc(); showArea(0); find(); split(); showOrig("b"); hours(); renderB(); rateRows(); rateCalc(); trip(); drawPipe(99); profit(); match(); apiFill(); showEnt("allocation");
  render();
})();
