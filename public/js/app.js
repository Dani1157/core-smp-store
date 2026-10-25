"use strict";
(() => {
  const API = "/api"; 
  const C = window.CORE_CONFIG;
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const strip = s => String(s || "").replace(/<[^>]*>/g, "");
  const safeImg = u => /^(https:\/\/|\.?\/?images\/)[^\s"'()<>]+$/i.test(u || "") ? u : "";
  const JAVA = /^[A-Za-z0-9_]{3,16}$/, BEDROCK = /^[A-Za-z0-9_ ]{1,16}$/;
  const store = {
    get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };

  let packs = {}, cats = [], live = false, edition = "java", slide = 0, timer, lastErr = "";
  let cart = store.get("core_cart", []).filter(i => i && Number.isInteger(i.id) && i.qty > 0 && i.qty <= 10);
  let user = store.get("core_user", null);
  if (user && !(user.edition === "bedrock" ? BEDROCK : JAVA).test(user.name || "")) user = null;
  
  // CURRENCY CONVERTER & GEO-DETECTION
  let baseCurrency = C.currency || "GBP";
  let currentCurrency = store.get("core_currency", baseCurrency);
  let fxRate = 1; 
  let fmt = new Intl.NumberFormat("en-GB", {style: "currency", currency: currentCurrency});
  const money = n => fmt.format(n * fxRate);

  async function fetchExchangeRates() {
    try {
      const res = await fetch(`https://api.exchangerate-api.com/v4/latest/${baseCurrency}`);
      const data = await res.json();
      if (data && data.rates && data.rates[currentCurrency]) {
        fxRate = data.rates[currentCurrency];
        fmt = new Intl.NumberFormat("en-GB", {style: "currency", currency: currentCurrency});
      }
    } catch (e) {
      if (currentCurrency === "EUR") fxRate = 1.17;
      if (currentCurrency === "USD") fxRate = 1.27;
      fmt = new Intl.NumberFormat("en-GB", {style: "currency", currency: currentCurrency});
    }
    render();
    if (typeof loadCards === "function") loadCards();
  }

  async function detectUserCurrency() {
    if (store.get("core_currency")) return;
    try {
      const res = await fetch("https://ipapi.co/json/");
      const data = await res.json();
      if (data && data.country_code) {
        if (data.country_code === "US") currentCurrency = "USD";
        else if (["GB", "EU", "FR", "DE", "ES", "IT"].includes(data.country_code)) currentCurrency = "EUR"; 
        else currentCurrency = baseCurrency;
        const s = $("#currencySel"); if (s) s.value = currentCurrency;
      }
    } catch (e) {}
  }

  function changeCurrency(cur) {
    currentCurrency = cur;
    store.set("core_currency", cur);
    fxRate = 1; 
    fetchExchangeRates();
  }

  const priceOf = p => { 
    const v = C.priceMode === "total" ? p.total_price : p.price; 
    return Number(v ?? p.price ?? p.base_price ?? 0); 
  };
  
  const uname = () => user ? (user.edition === "bedrock" ? "." : "") + user.name : "";
  const head = () => user && user.edition === "java" ? "https://mc-heads.net/avatar/" + encodeURIComponent(user.name) + "/40" : "";

  function toast(text, img) {
    const t = document.createElement("div"); t.className = "toast";
    if (img) { const im = document.createElement("img"); im.alt = ""; im.src = img; t.appendChild(im); }
    const s = document.createElement("span"); s.textContent = text; t.appendChild(s);
    $("#toasts").appendChild(t); setTimeout(() => t.remove(), 5000);
  }

  document.documentElement.style.setProperty("--accent", C.accent);
  $("#ip").textContent = C.serverIP; $("#ip2").textContent = C.serverIP;
  $("#dc").href = C.discord; $("#dc2").href = C.discord;
  document.title = "⚔️ " + C.serverName + " Store";
  document.addEventListener("error", e => { if (e.target.tagName === "IMG") e.target.classList.add("broken"); }, true);

  const cursor = document.getElementById("cursor");
  if (cursor) {
    document.addEventListener("mousemove", e => { cursor.style.left = e.clientX + "px"; cursor.style.top = e.clientY + "px"; });
    document.querySelectorAll("button, a, input, select, .thumb").forEach(el => {
      el.addEventListener("mouseenter", () => cursor.classList.add("hover"));
      el.addEventListener("mouseleave", () => cursor.classList.remove("hover"));
    });
  }

  const sel = $("#currencySel");
  if (sel) { sel.value = currentCurrency; sel.addEventListener("change", (e) => changeCurrency(e.target.value)); }

  window.addEventListener("pageshow", (event) => {
    if (event.persisted) {
      const btn = $("#checkout");
      if (btn) { btn.disabled = false; btn.textContent = user ? "Checkout securely" : "Sign in to checkout"; }
    }
  });

  function online() {
    const addr = encodeURIComponent(C.serverIP + (C.serverPort ? ":" + C.serverPort : ""));
    const show = j => { if (!j || !j.online) throw 0; $("#onlineN").textContent = (j.players && j.players.online != null ? j.players.online + " " : "") + "ONLINE"; $("#online").hidden = false; };
    const get = u => fetch(u).then(r => r.json());
    get("https://api.mcstatus.io/v2/status/java/" + addr).then(show)
      .catch(() => get("https://api.mcsrvstat.us/3/" + addr).then(show))
      .catch(() => get("https://api.mcstatus.io/v2/status/bedrock/" + addr).then(show))
      .catch(() => { $("#online").hidden = true; });
  }
  online(); setInterval(online, 60000);
  
  fetch("https://discord.com/api/v9/invites/" + encodeURIComponent(C.discord.split("/").pop()) + "?with_counts=true")
    .then(r => r.ok ? r.json() : null)
    .then(j => { if (j && j.approximate_member_count) $("#dcN").textContent = j.approximate_member_count.toLocaleString(); })
    .catch(() => {});

  function buildHero() {
    $("#slides").innerHTML = C.slides.map((s, n) => `<div class="slide${n ? "" : " on"}">${safeImg(s.image) ? `<img src="${esc(s.image)}" alt="">` : ""}<div class="cap"><h1>${esc(s.title)}</h1><p>${esc(s.text)}</p><a class="cta" href="#shop">Shop now ↓</a></div></div>`).join("");
    $("#dots").innerHTML = C.slides.map((s, n) => `<i data-act="dot" data-n="${n}" class="${n ? "" : "on"}"></i>`).join("");
    if (C.slides.length < 2) $(".hero-ctl").hidden = true;
    const auto = () => { clearInterval(timer); if (C.slides.length > 1) timer = setInterval(() => go(slide + 1), 6000); };
    window.__auto = auto; auto();
  }
  function go(n) {
    const s = $$(".slide"); if (!s.length) return;
    slide = (n + s.length) % s.length;
    s.forEach((e, i) => e.classList.toggle("on", i === slide));
    $$("#dots i").forEach((e, i) => e.classList.toggle("on", i === slide));
  }

  async function load() {
    try {
      const r = await fetch(`${API}/categories`);
      if (!r.ok) throw "Server rejected request";
      const j = await r.json();
      cats = j.data; live = true;
    } catch (e) {
      lastErr = typeof e === "string" ? e : "request blocked or offline";
      if (C.demo) { 
        // UPDATED FALLBACK PRICES TO MATCH YOUR REAL PRICES
        cats = [
          {name:"Packages",description:"Show off your rank in chat.",packages:[
            {id:1,name:"+ Rank",description:"+ rank tag in chat",price:2.99,base_price:2.99},
            {id:2,name:"++ Rank",description:"++ rank tag in chat",price:5.96,base_price:5.96},
            {id:3,name:"+++ Rank",description:"+++ rank tag in chat",price:14.36,base_price:14.36}]},
          {name:"Tags",description:"Custom tags for your name.",packages:[
            {id:10,name:"Sad face tag",description:"This is for the tag in game",price:4.80,base_price:4.80},
            {id:11,name:"Crown tag",description:"This is for the tag in game",price:4.80,base_price:4.80},
            {id:12,name:"Heart tag",description:"This is for the tag in game",price:4.80,base_price:4.80},
            {id:13,name:"Meteor tag",description:"This is for the tag in game",price:4.80,base_price:4.80},
            {id:14,name:"Sword tag",description:"This is for the tag in game",price:4.80,base_price:4.80},
            {id:15,name:"Money tag",description:"This is for the tag in game",price:4.80,base_price:4.80},
            {id:16,name:"Star tag",description:"This is for the tag in game",price:4.80,base_price:4.80},
            {id:17,name:"Custom tag",description:"This is for the tag in game",price:15.00,base_price:15.00}]},
          {name:"Tokens",description:"Spend tokens in-game on ranks and suffix tags.",packages:[
            {id:4,name:"400 TOKENS",description:"Buy ranks and suffix tags",price:1.19,base_price:1.19},
            {id:5,name:"2500 TOKENS",description:"Buy ranks and suffix tags",price:4.19,base_price:4.19},
            {id:6,name:"5000 + 500 FREE TOKENS",description:"5,000 + 500 bonus tokens",price:7.19,base_price:7.19},
            {id:7,name:"10000 + 2000 FREE TOKENS",description:"10,000 + 2,000 bonus tokens",price:11.99,base_price:11.99},
            {id:8,name:"25000 + 7000 FREE TOKENS",description:"25,000 + 7,000 bonus tokens",price:27.59,base_price:27.59},
            {id:9,name:"50000 + 20000 FREE TOKENS",description:"50,000 + 20,000 bonus tokens",price:47.99,base_price:47.99}]}
        ];
      } else {
        $("#store").innerHTML = '<div class="panel"><h3>Store unavailable</h3><p class="sub">We couldn’t load the store right now. Please refresh in a moment, or contact us on Discord.</p></div>';
        return;
      }
    }
    cats = cats.filter(c => (c.packages || []).length);
    packs = {}; cats.forEach(c => c.packages.forEach(p => packs[p.id] = p));
    cart = cart.filter(i => packs[i.id]).map(i => ({...i, name: packs[i.id].name, price: priceOf(packs[i.id])}));
    
    await fetchExchangeRates(); 
    loadCards(); 
    render();
  }

  function loadCards() {
    $("#tabs").innerHTML = cats.length > 1 ? '<button class="tab on" data-act="tab" data-cat="all">All</button>' + cats.map((c, n) => `<button class="tab" data-act="tab" data-cat="${n}">${esc(c.name)}</button>`).join("") : "";
    $("#store").innerHTML = (live || !C.demo ? "" : '<p class="sub">Store preview: live checkout is offline right now, but you can browse everything.</p>') + cats.map((c, n) => `
      <section class="cat" data-cat="${n}"><h2 class="center">${esc(c.name)}</h2><p class="sub">${esc(strip(c.description))}</p>
      <div class="grid">${c.packages.map(card).join("")}</div></section>`).join("");
    
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), {threshold: .05, rootMargin: "0px 0px -50px 0px"});
    $$(".card").forEach((c, n) => { c.style.transitionDelay = (n % 4) * 60 + "ms"; io.observe(c); });
    
    if (cursor) {
      $$(".thumb").forEach(el => {
        el.addEventListener("mouseenter", () => cursor.classList.add("hover"));
        el.addEventListener("mouseleave", () => cursor.classList.remove("hover"));
      });
    }
  }
  
  function card(p) {
    const x = C.items[p.name] || {}, img = safeImg(x.image || p.image), price = priceOf(p), base = Number(p.base_price || price);
    const sale = base > price, bonus = x.bonus || (sale ? "-" + Math.round((1 - price / base) * 100) + "% OFF" : "");
    
    const fallbackNum = `<div class="num"><b>${esc(x.big || "")}</b><small>${esc(x.label || "")}</small></div>`;
    
    return `<article class="card${x.popular ? " pop" : ""}">
      <div class="thumb">
        ${!img ? fallbackNum : ""}
        ${img ? `<img src="${esc(img)}" alt="${esc(p.name)}" loading="lazy" onerror="this.style.display='none'; this.previousElementSibling.style.display='block';">` : ""}
        ${C.showBadges ? `<div class="badges">${x.popular ? '<span class="b red">Most popular</span>' : ""}${bonus ? `<span class="b">${esc(bonus)}</span>` : ""}</div>` : ""}
      </div>
      <div class="info"><h3>${esc(p.name)}</h3>
        <div class="foot"><div class="price">${money(price)}${sale ? `<s>${money(base)}</s>` : ""}</div>
        <button class="add" data-act="add" data-id="${+p.id}">Buy Now</button></div></div></article>`;
  }

  function render() {
    store.set("core_cart", cart);
    const n = cart.reduce((a, i) => a + i.qty, 0);
    $("#count").textContent = n;
    const ub = $("#userBtn");
    ub.innerHTML = "";
    if (user) {
      if (head()) { const im = document.createElement("img"); im.className = "avatar"; im.alt = ""; im.src = head(); ub.appendChild(im); }
      ub.appendChild(document.createTextNode(uname().toUpperCase())); ub.dataset.act = "open-cart";
    } else { ub.textContent = "SIGN IN"; ub.dataset.act = "open-sign"; }
    $("#who").innerHTML = user ? `Signed in as <b>${esc(uname())}</b> (${user.edition === "bedrock" ? "Bedrock" : "Java"}) <a data-act="signout">Sign out</a>` : `You’re not signed in. <a data-act="open-sign">Sign in</a>`;
    $("#items").innerHTML = cart.length ? cart.map(i => `<div class="row"><span>${esc(i.name)}</span><span class="q"><button data-act="qty" data-id="${i.id}" data-d="-1" aria-label="Less">−</button>${i.qty}<button data-act="qty" data-id="${i.id}" data-d="1" aria-label="More">+</button> <b>${money(i.price * i.qty)}</b></span></div>`).join("") : '<div class="empty">🛒<br>Your basket is empty.</div>';
    $("#total").textContent = money(cart.reduce((a, i) => a + i.price * i.qty, 0));
    $("#checkout").textContent = user ? "Checkout securely" : "Sign in to checkout";
  }
  function overlay(on) { $("#overlay").classList.toggle("show", on); }
  function closeAll() { $("#drawer").classList.remove("open"); $("#signModal").classList.remove("show"); overlay(false); }
  function openCart() { closeAll(); $("#drawer").classList.add("open"); overlay(true); }
  function openSign(ed) {
    closeAll(); setEdition(ed || (user && user.edition) || "java");
    $("#user").value = user ? user.name : ""; $("#uerr").textContent = "";
    $("#signModal").classList.add("show"); overlay(true); setTimeout(() => $("#user").focus(), 250);
  }
  function setEdition(ed) {
    edition = ed;
    $$(".seg button").forEach(b => b.classList.toggle("on", b.dataset.ed === ed));
    $("#user").placeholder = ed === "bedrock" ? "Bedrock gamertag" : "Java username";
    $("#hint").textContent = ed === "bedrock" ? "Bedrock: enter your gamertag. We add the dot (.) in front for you." : "Java: 3 to 16 letters, numbers or underscores.";
  }
  function login() {
    let v = $("#user").value.trim();
    if (v.startsWith(".")) { v = v.slice(1); setEdition("bedrock"); }
    if (!(edition === "bedrock" ? BEDROCK : JAVA).test(v)) {
      $("#uerr").textContent = edition === "bedrock" ? "Enter your Bedrock gamertag (letters, numbers, spaces, underscores)." : "Java usernames are 3 to 16 letters, numbers or underscores.";
      return;
    }
    user = {name: v, edition}; store.set("core_user", user); render(); closeAll();
    toast("Signed in as " + uname(), head());
    if (window.__resume) { window.__resume = false; openCart(); }
  }

  let last = 0;
  async function checkout() {
    const msg = $("#msg"), btn = $("#checkout"); msg.textContent = "";
    if (!cart.length) return msg.textContent = "Your basket is empty.";
    if (!user) { window.__resume = true; return openSign(); }
    if (!live) return msg.textContent = "The store isn’t connected right now.";
    if (Date.now() - last < 3000) return; last = Date.now();
    btn.disabled = true; btn.textContent = "Loading…";
    
    try {
      const res = await fetch(`${API}/checkout`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ username: uname(), cart: cart.map(i => ({ id: i.id, qty: i.qty })) })
      });
      
      if (!res.ok) throw new Error("Checkout failed");
      const data = await res.json();
      
      if (data.url) {
        location.href = data.url;
      } else {
        throw new Error("No URL returned");
      }
    } catch (e) {
      msg.textContent = "Checkout failed. Please try again.";
      btn.disabled = false; render();
    }
  }

  document.addEventListener("click", e => {
    const el = e.target.closest("[data-act]"); if (!el) return;
    const d = el.dataset;
    switch (d.act) {
      case "add": addToCart(+d.id); break;
      case "qty": { const i = cart.find(x => x.id === +d.id); if (i) { i.qty = Math.min(10, i.qty + +d.d); cart = cart.filter(x => x.qty > 0); render(); } break; }
      case "open-cart": openCart(); break;
      case "open-sign": openSign(); break;
      case "open-discord": window.open(C.discord, "_blank"); break;
      case "close": closeAll(); break;
      case "edition": setEdition(d.ed); break;
      case "login": login(); break;
      case "signout": user = null; store.set("core_user", null); render(); toast("Signed out"); break;
      case "checkout": checkout(); break;
      case "copy-ip": try { navigator.clipboard.writeText(C.serverIP); toast("Server IP copied!"); } catch (er) {} break;
      case "tab":
        $$(".tab").forEach(t => t.classList.toggle("on", t === el));
        $$(".cat").forEach(c => c.hidden = d.cat !== "all" && c.dataset.cat !== d.cat); break;
      case "prev": go(slide - 1); window.__auto(); break;
      case "next": go(slide + 1); window.__auto(); break;
      case "dot": go(+d.n); window.__auto(); break;
    }
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") closeAll();
    if (e.key === "Enter" && e.target.id === "user") login();
  });

  function addToCart(id) {
    const p = packs[id]; if (!p) return;
    const f = cart.find(i => i.id === p.id);
    if (f) f.qty = Math.min(10, f.qty + 1); else cart.push({id: p.id, name: p.name, price: priceOf(p), qty: 1});
    render(); openCart(); toast(p.name + " added to your basket");
    const c = $("#count"); c.classList.remove("bump"); void c.offsetWidth; c.classList.add("bump");
  }

  if (new URLSearchParams(location.search).get("thanks")) { 
    cart = []; render();
    const msg = document.createElement("div");
    msg.className = "modal show";
    msg.innerHTML = `<div class="success-panel">
      <div class="check-icon">✅</div>
      <h3>Order Complete!</h3>
      <p style="color:var(--mute); margin:10px 0 20px;">Thank you for your purchase. Your items will arrive in-game shortly.</p>
      <button class="go" onclick="window.location.href=window.location.pathname">Back to Store</button>
    </div>`;
    document.body.appendChild(msg);
    overlay(true);
    history.replaceState(null, "", location.pathname); 
  }

  (() => {
    const cv = $("#embers"), g = cv.getContext("2d"); if (!g || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let w, h, ps = [];
    const size = () => { w = cv.width = innerWidth; h = cv.height = innerHeight; };
    const mk = (init) => ({x: Math.random() * w, y: init ? Math.random() * h : h + 10, r: Math.random() * 2 + .6, v: Math.random() * .6 + .2, d: Math.random() * 2 - 1, a: Math.random() * .6 + .2});
    size(); addEventListener("resize", size);
    for (let i = 0; i < 45; i++) ps.push(mk(true));
    (function tick() {
      g.clearRect(0, 0, w, h);
      ps.forEach((p, i) => { p.y -= p.v; p.x += Math.sin(p.y / 40) * .3 + p.d * .1; if (p.y < -10) ps[i] = mk(false);
        g.beginPath(); g.fillStyle = `rgba(255,${60 + p.r * 30 | 0},60,${p.a})`; g.shadowColor = "#ff1744"; g.shadowBlur = 8; g.arc(p.x, p.y, p.r, 0, 6.3); g.fill(); });
      requestAnimationFrame(tick);
    })();
  })();

  buildHero(); render();
  load();
})();