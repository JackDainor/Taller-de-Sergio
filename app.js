/* Atelier Office — app principal */
(function () {
  "use strict";

  const STORAGE_KEY = "atelier-office-v1";

  function monthKey(date) {
    const d = date instanceof Date ? date : new Date(date);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
  }

  function monthLabel(key) {
    const parts = String(key || "").split("-");
    const y = parts[0];
    const m = Number(parts[1] || 1);
    const names = [
      "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
      "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
    ];
    return (names[m - 1] || key) + " " + y;
  }

  function uid(prefix) {
    return (prefix || "id") + "_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  function money(n) {
    return "R$ " + Number(n || 0).toFixed(2).replace(".", ",");
  }

  function labelType(type) {
    return ({ plano: "Tejido plano", malla: "Malla", otro: "Otro" })[type] || type || "Otro";
  }

  const state = {
    workspaceName: "Atelier Office",
    theme: "dark",
    currentMonth: monthKey(new Date()),
    currentView: "dashboard",
    workers: [],
    garments: [],
    months: {}
  };

  function ensureMonth(key) {
    if (!key) key = monthKey(new Date());
    if (!state.months[key]) {
      state.months[key] = { status: "abierto", groups: [], cuts: [], vales: [] };
    }
    const m = state.months[key];
    if (!m.status) m.status = "abierto";
    if (!Array.isArray(m.groups)) m.groups = [];
    if (!Array.isArray(m.cuts)) m.cuts = [];
    if (!Array.isArray(m.vales)) m.vales = [];
    return m;
  }

  function currentData() {
    return ensureMonth(state.currentMonth);
  }

  function isMonthClosed(key) {
    return ensureMonth(key || state.currentMonth).status === "cerrado";
  }

  function safeStorageGet() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      return null;
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      toast("No se pudo guardar (almacenamiento lleno o bloqueado)");
    }
  }

  function load() {
    const raw = safeStorageGet();
    if (!raw) {
      ensureMonth(state.currentMonth);
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        if (typeof parsed.workspaceName === "string") state.workspaceName = parsed.workspaceName;
        if (parsed.theme === "light" || parsed.theme === "dark") state.theme = parsed.theme;
        if (typeof parsed.currentMonth === "string") state.currentMonth = parsed.currentMonth;
        if (Array.isArray(parsed.workers)) state.workers = parsed.workers;
        if (Array.isArray(parsed.garments)) state.garments = parsed.garments;
        if (parsed.months && typeof parsed.months === "object") state.months = parsed.months;
      }
    } catch (e) {
      /* datos corruptos: empezar limpio */
    }
    ensureMonth(state.currentMonth);
    Object.keys(state.months).forEach(function (k) { ensureMonth(k); });
  }

  function toast(msg) {
    const el = document.getElementById("toast");
    if (!el) return;
    el.textContent = String(msg);
    el.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.hidden = true; }, 2800);
  }

  function fileToDataUrl(file) {
    return new Promise(function (resolve) {
      if (!file) return resolve("");
      const reader = new FileReader();
      reader.onload = function () { resolve(reader.result || ""); };
      reader.onerror = function () { resolve(""); };
      reader.readAsDataURL(file);
    });
  }

  function workerById(id) {
    return state.workers.find(function (w) { return w.id === id; });
  }

  function garmentById(id) {
    return state.garments.find(function (g) { return g.id === id; });
  }

  function groupById(id) {
    return currentData().groups.find(function (g) { return g.id === id; });
  }

  function splitForGroup(group) {
    const members = Array.isArray(group.members) ? group.members : [];
    const rectas = members.filter(function (m) { return m.machine === "recta"; });
    const overs = members.filter(function (m) { return m.machine === "overlock"; });
    const rectaPool = Number(group.rectaPay || 0);
    const overPool = Number(group.overlockPay || 0);
    const map = {};
    rectas.forEach(function (m) {
      map[m.workerId] = rectas.length ? rectaPool / rectas.length : 0;
    });
    overs.forEach(function (m) {
      map[m.workerId] = overs.length ? overPool / overs.length : 0;
    });
    return map;
  }

  function monthTotals(key) {
    key = key || state.currentMonth;
    const data = ensureMonth(key);
    let produced = 0;
    let earned = 0;
    let paid = 0;
    let pending = 0;
    const byWorker = {};
    state.workers.forEach(function (w) {
      byWorker[w.id] = { earned: 0, paid: 0, pending: 0, vales: 0 };
    });

    data.cuts.forEach(function (cut) {
      const group = data.groups.find(function (g) { return g.id === cut.groupId; });
      if (!group) return;
      const qty = Number(cut.qty || 0);
      produced += qty;
      const per = splitForGroup(group);
      Object.keys(per).forEach(function (wid) {
        const amount = per[wid] * qty;
        earned += amount;
        if (!byWorker[wid]) byWorker[wid] = { earned: 0, paid: 0, pending: 0, vales: 0 };
        byWorker[wid].earned += amount;
        if (cut.status === "pagado") {
          paid += amount;
          byWorker[wid].paid += amount;
        } else {
          pending += amount;
          byWorker[wid].pending += amount;
        }
      });
    });

    data.vales.forEach(function (v) {
      if (!byWorker[v.workerId]) byWorker[v.workerId] = { earned: 0, paid: 0, pending: 0, vales: 0 };
      byWorker[v.workerId].vales += Number(v.amount || 0);
    });

    const valesTotal = data.vales.reduce(function (a, v) { return a + Number(v.amount || 0); }, 0);
    return { produced: produced, earned: earned, paid: paid, pending: pending, vales: valesTotal, byWorker: byWorker };
  }

  function openModal(title, html) {
    document.getElementById("modalTitle").textContent = title;
    document.getElementById("modalBody").innerHTML = html;
    const modal = document.getElementById("modal");
    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
  }

  function closeModal() {
    const modal = document.getElementById("modal");
    modal.hidden = true;
    modal.setAttribute("aria-hidden", "true");
    document.getElementById("modalBody").innerHTML = "";
  }

  function setTheme(theme) {
    state.theme = theme === "light" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", state.theme);
    const btn = document.getElementById("themeToggle");
    if (btn) btn.textContent = state.theme === "dark" ? "Cambiar a tema claro" : "Cambiar a tema oscuro";
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", state.theme === "dark" ? "#12100e" : "#f4efe6");
    save();
  }

  function updateMonthChrome() {
    const closed = isMonthClosed();
    const label = document.getElementById("monthStatusLabel");
    const btn = document.getElementById("toggleMonthStatusBtn");
    const banner = document.getElementById("monthLockedBanner");
    const app = document.getElementById("appRoot");
    if (label) {
      label.textContent = closed ? "Estado: mes terminado" : "Estado: mes abierto";
      label.className = "month-status " + (closed ? "closed" : "open");
    }
    if (btn) btn.textContent = closed ? "Reabrir mes" : "Marcar mes terminado";
    if (banner) banner.hidden = !closed;
    if (app) app.classList.toggle("is-month-closed", closed);
  }

  function renderMonthSelect() {
    const sel = document.getElementById("monthSelect");
    if (!sel) return;
    const keys = Object.keys(state.months).sort();
    if (keys.indexOf(state.currentMonth) === -1) keys.push(state.currentMonth);
    sel.innerHTML = keys.map(function (k) {
      const tag = ensureMonth(k).status === "cerrado" ? " · cerrado" : "";
      const selected = k === state.currentMonth ? " selected" : "";
      return '<option value="' + k + '"' + selected + ">" + monthLabel(k) + tag + "</option>";
    }).join("");
  }

  function renderChrome() {
    const title = document.getElementById("workspaceTitle");
    if (title) title.textContent = state.workspaceName;
    document.title = state.workspaceName + " — Jefe de oficina";
    renderMonthSelect();
    updateMonthChrome();

    const titles = {
      dashboard: ["Resumen del mes", "Panel"],
      workers: ["Plantel", "Funcionarios"],
      garments: ["Catálogo y estado de cortes", "Prendas"],
      groups: ["Quién hace cada prenda", "Asignar corte"],
      cuts: ["Registrar producción hecha", "Cortes terminados"],
      vales: ["Adelantos individuales", "Vales"],
      payroll: ["Liquidación", "Pagos"],
      settings: ["Respaldos y preferencias", "Ajustes y datos"]
    };
    const pair = titles[state.currentView] || titles.dashboard;
    const crumb = document.getElementById("crumb");
    const pageTitle = document.getElementById("pageTitle");
    if (crumb) crumb.textContent = pair[0] + " · " + monthLabel(state.currentMonth);
    if (pageTitle) pageTitle.textContent = pair[1];

    document.querySelectorAll(".nav-btn").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-view") === state.currentView);
    });
    document.querySelectorAll(".view").forEach(function (v) {
      v.classList.remove("active");
    });
    const active = document.getElementById("view-" + state.currentView);
    if (active) active.classList.add("active");
  }

  function renderDashboard() {
    const t = monthTotals();
    const closed = isMonthClosed();
    const rows = state.workers.length
      ? state.workers.map(function (w) {
          const x = t.byWorker[w.id] || { earned: 0, paid: 0, pending: 0, vales: 0 };
          const net = x.pending - x.vales;
          return "<tr><td>" + escapeHtml(w.name) + "</td><td>" + money(x.earned) + "</td><td>" +
            money(x.paid) + "</td><td>" + money(x.pending) + "</td><td>" + money(x.vales) +
            "</td><td><strong>" + money(net) + "</strong></td></tr>";
        }).join("")
      : '<tr><td colspan="6" class="muted">Todavía no hay funcionarios en este taller.</td></tr>';

    document.getElementById("view-dashboard").innerHTML =
      '<div class="grid stats">' +
      '<article class="card"><h3>Prendas del mes</h3><p class="stat">' + t.produced + "</p></article>" +
      '<article class="card"><h3>Producido</h3><p class="stat">' + money(t.earned) + "</p></article>" +
      '<article class="card"><h3>Pendiente</h3><p class="stat">' + money(t.pending) + "</p></article>" +
      '<article class="card"><h3>Vales</h3><p class="stat">' + money(t.vales) + "</p></article>" +
      "</div>" +
      '<div class="card" style="margin-top:14px">' +
      "<h3>Por funcionario en " + monthLabel(state.currentMonth) + (closed ? " · terminado" : "") + "</h3>" +
      '<p class="muted">El neto pendiente descuenta vales. Los meses no se mezclan. El cierre es manual.</p>' +
      "<table><thead><tr><th>Funcionario</th><th>Devengado</th><th>Pagado</th><th>Pendiente</th><th>Vales</th><th>Neto a pagar</th></tr></thead>" +
      "<tbody>" + rows + "</tbody></table></div>";
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderWorkers() {
    const cards = state.workers.length
      ? state.workers.map(function (w) {
          const photo = w.photo
            ? '<img class="person-photo" src="' + w.photo + '" alt="' + escapeHtml(w.name) + '">'
            : '<div class="person-photo"></div>';
          return '<article class="card person">' + photo +
            "<h4>" + escapeHtml(w.name) + "</h4>" +
            '<p class="muted">' + escapeHtml(w.notes || "Sin observaciones") + "</p>" +
            '<div class="toolbar">' +
            '<button type="button" class="btn small secondary" data-action="edit-worker" data-id="' + w.id + '">Editar</button>' +
            '<button type="button" class="btn small" data-action="del-worker" data-id="' + w.id + '">Quitar</button>' +
            "</div></article>";
        }).join("")
      : '<div class="card muted">Agregá el primer funcionario del taller.</div>';

    document.getElementById("view-workers").innerHTML =
      '<div class="toolbar">' +
      '<p class="muted">Los funcionarios se mantienen entre meses.</p>' +
      '<button type="button" class="btn" data-action="add-worker">Agregar funcionario</button>' +
      '</div><div class="people">' + cards + "</div>";
  }

  function workerForm(worker) {
    worker = worker || {};
    return (
      '<label>Nombre<input name="name" value="' + escapeHtml(worker.name || "") + '" required></label>' +
      "<label>Notas<textarea name=\"notes\">" + escapeHtml(worker.notes || "") + "</textarea></label>" +
      '<label>Foto de muestra<input type="file" name="photo" accept="image/*"></label>' +
      (worker.photo ? '<img class="person-photo" src="' + worker.photo + '" alt="">' : "") +
      '<button type="button" class="btn" data-action="save-worker" data-id="' + escapeHtml(worker.id || "") + '">Guardar</button>'
    );
  }

  function garmentAssignments(garmentId) {
    return currentData().groups.filter(function (a) { return a.garmentId === garmentId; });
  }

  function assignmentProgress(assignmentId) {
    const cuts = currentData().cuts.filter(function (c) { return c.groupId === assignmentId; });
    let qty = 0;
    let pending = 0;
    let paid = 0;
    cuts.forEach(function (c) {
      const n = Number(c.qty || 0);
      qty += n;
      if (c.status === "pagado") paid += n;
      else pending += n;
    });
    return { qty: qty, pending: pending, paid: paid, count: cuts.length };
  }

  function renderGarments() {
    const cards = state.garments.length
      ? state.garments.map(function (g) {
          const assigns = garmentAssignments(g.id);
          const photo = g.photo
            ? '<img class="garment-photo clickable-photo" src="' + g.photo + '" alt="' + escapeHtml(g.name) + '" data-action="view-photo" data-src="' + g.photo + '" data-title="' + escapeHtml(g.name) + '" role="button" tabindex="0">'
            : '<div class="garment-photo"></div>';
          var statusHtml = "";
          if (!assigns.length) {
            statusHtml = '<div class="status-block"><span class="badge warn">Sin asignar este mes</span>' +
              '<p class="muted">Todavía nadie está haciendo este corte.</p></div>';
          } else {
            var allDone = true;
            var anyDone = false;
            assigns.forEach(function (a) {
              const prog = assignmentProgress(a.id);
              if (prog.count > 0) anyDone = true;
              else allDone = false;
            });
            var mainBadge = allDone
              ? '<span class="badge done">Corte acabado</span>'
              : (anyDone
                  ? '<span class="badge ok">En producción · parte acabada</span>'
                  : '<span class="badge ok">En producción</span>');
            statusHtml = '<div class="status-block">' + mainBadge;
            statusHtml += assigns.map(function (a) {
              const prog = assignmentProgress(a.id);
              const finished = prog.count > 0;
              const people = (a.members || []).map(function (m) {
                const w = workerById(m.workerId);
                return (w ? w.name : "—") + " · " + m.machine;
              }).join(", ");
              const stateBadge = finished
                ? '<span class="badge done">Corte acabado</span>'
                : '<span class="badge ok">En producción</span>';
              return '<div class="mini-summary">' +
                "<strong>" + escapeHtml(a.name || "Asignación") + "</strong> " + stateBadge + "<br>" +
                '<span class="muted">Quiénes: ' + escapeHtml(people || "—") + "</span><br>" +
                '<span class="muted">A cuánto: ' + money(a.pricePerPiece) + " / prenda · Recta " + money(a.rectaPay) + " · Overlock " + money(a.overlockPay) + "</span><br>" +
                '<span class="muted">' + (finished
                  ? ("Terminado: " + prog.qty + " prendas (pend. pago " + prog.pending + " · pagadas " + prog.paid + ")")
                  : "Aún sin registrar como corte terminado") +
                "</span></div>";
            }).join("") + "</div>";
          }
          return '<article class="card gcard">' + photo +
            "<h4>" + escapeHtml(g.name) + "</h4>" +
            '<span class="badge">' + labelType(g.type) + "</span> " + statusHtml +
            '<p class="muted">' + escapeHtml(g.notes || "") + "</p>" +
            '<div class="toolbar">' +
            '<button type="button" class="btn small secondary" data-action="edit-garment" data-id="' + g.id + '">Editar</button>' +
            '<button type="button" class="btn small" data-action="del-garment" data-id="' + g.id + '">Quitar</button>' +
            "</div></article>";
        }).join("")
      : '<div class="card muted">Cargá las prendas del taller (con foto). Después asigná quién hace cada corte.</div>';

    document.getElementById("view-garments").innerHTML =
      '<div class="toolbar">' +
      '<p class="muted">Estado del mes: sin asignar, en producción o corte acabado. Tocá la foto para verla completa.</p>' +
      '<button type="button" class="btn" data-action="add-garment">Agregar prenda</button>' +
      '</div><div class="cards">' + cards + "</div>";
  }

  function garmentForm(g) {
    g = g || {};
    return (
      '<label>Nombre de la prenda<input name="name" value="' + escapeHtml(g.name || "") + '" required></label>' +
      "<label>Tipo<select name=\"type\">" +
      '<option value="plano"' + (g.type === "plano" ? " selected" : "") + ">Tejido plano</option>" +
      '<option value="malla"' + (g.type === "malla" ? " selected" : "") + ">Malla</option>" +
      '<option value="otro"' + (g.type === "otro" || !g.type ? " selected" : "") + ">Otro</option>" +
      "</select></label>" +
      "<label>Notas<textarea name=\"notes\">" + escapeHtml(g.notes || "") + "</textarea></label>" +
      '<label>Foto de muestra<input type="file" name="photo" accept="image/*"></label>' +
      '<button type="button" class="btn" data-action="save-garment" data-id="' + escapeHtml(g.id || "") + '">Guardar</button>'
    );
  }

  function renderGroups() {
    const data = currentData();
    const closed = isMonthClosed();
    const cards = data.groups.length
      ? data.groups.map(function (g) {
          const garment = garmentById(g.garmentId);
          const prog = assignmentProgress(g.id);
          const per = splitForGroup(g);
          const peopleLines = (g.members || []).map(function (m) {
            const w = workerById(m.workerId);
            const share = per[m.workerId] != null ? per[m.workerId] : 0;
            return "<li><strong>" + escapeHtml(w ? w.name : "—") + "</strong> · " +
              escapeHtml(m.machine) + " · " + money(share) + " / prenda</li>";
          }).join("");
          const photo = garment && garment.photo
            ? '<img class="garment-photo clickable-photo" src="' + garment.photo + '" alt="' + escapeHtml(garment.name || "") + '" data-action="view-photo" data-src="' + garment.photo + '" data-title="' + escapeHtml(garment.name || "Prenda") + '" role="button" tabindex="0">'
            : '<div class="garment-photo"></div>';
          return '<article class="card assign-card">' + photo +
            '<div class="assign-body">' +
            "<h4>" + escapeHtml(g.name || "Asignación") + "</h4>" +
            '<p class="assign-prenda"><strong>Prenda:</strong> ' + escapeHtml(garment ? garment.name : "Sin prenda") +
            (garment ? " · " + labelType(garment.type) : "") + "</p>" +
            '<p><strong>A cuánto se paga:</strong> ' + money(g.pricePerPiece) + " / prenda</p>" +
            '<p class="muted">Recta ' + money(g.rectaPay) + " · Overlock " + money(g.overlockPay) + " (si hay 2 en la misma máquina, se divide)</p>" +
            "<p><strong>Quiénes lo hacen:</strong></p>" +
            '<ul class="people-list">' + (peopleLines || "<li class=\"muted\">Sin personas</li>") + "</ul>" +
            '<p class="muted">Resumen del mes: ' + prog.qty + " prendas registradas" +
            (prog.count ? " · pendiente pago " + prog.pending + " · pagadas " + prog.paid : " · todavía no hay cortes terminados") +
            "</p>" +
            '<div class="toolbar">' +
            '<button type="button" class="btn small secondary" data-action="edit-group" data-id="' + g.id + '"' + (closed ? " disabled" : "") + ">Editar asignación</button>" +
            '<button type="button" class="btn small" data-action="del-group" data-id="' + g.id + '"' + (closed ? " disabled" : "") + ">Quitar</button>" +
            "</div></div></article>";
        }).join("")
      : '<div class="card muted">Asigná un corte: prenda, quiénes, a cuánto se paga y en qué máquina.</div>';

    document.getElementById("view-groups").innerHTML =
      '<div class="toolbar">' +
      '<p class="muted">Cada tarjeta resume el corte asignado: foto, prenda, personas y precios' + (closed ? ". Mes cerrado: solo lectura." : ".") + "</p>" +
      '<button type="button" class="btn" data-action="add-group"' + (closed ? " disabled" : "") + ">Asignar corte</button>" +
      '</div><div class="cards">' + cards + "</div>";
  }

  function groupForm(group) {
    group = group || {};
    const members = group.members && group.members.length
      ? group.members
      : [{ workerId: "", machine: "recta" }];

    function workerOpts(selected) {
      return state.workers.map(function (w) {
        return '<option value="' + w.id + '"' + (w.id === selected ? " selected" : "") + ">" + escapeHtml(w.name) + "</option>";
      }).join("");
    }

    const garmentOpts = state.garments.map(function (g) {
      return '<option value="' + g.id + '"' + (g.id === group.garmentId ? " selected" : "") + ">" + escapeHtml(g.name) + "</option>";
    }).join("");

    const rows = members.map(function (m, i) {
      return '<div class="form-row member-row">' +
        "<label>Quién hace " + (i + 1) +
        '<select name="worker_' + i + '"><option value="">—</option>' + workerOpts(m.workerId) + "</select></label>" +
        '<label>Máquina<select name="machine_' + i + '">' +
        '<option value="recta"' + (m.machine === "recta" ? " selected" : "") + ">Recta</option>" +
        '<option value="overlock"' + (m.machine === "overlock" ? " selected" : "") + ">Overlock</option>" +
        "</select></label></div>";
    }).join("");

    return (
      '<label>Nombre (ej: Corte remera — María y Juan)<input name="name" value="' + escapeHtml(group.name || "") + '" required></label>' +
      '<label>Qué prenda van a hacer<select name="garmentId"><option value="">Elegí la prenda</option>' + garmentOpts + "</select></label>" +
      '<div class="form-row">' +
      '<label>A cuánto se paga el corte (por prenda)<input type="number" step="0.01" name="pricePerPiece" value="' + (group.pricePerPiece != null ? group.pricePerPiece : 1.4) + '"></label>' +
      '<label>Parte recta / prenda<input type="number" step="0.01" name="rectaPay" value="' + (group.rectaPay != null ? group.rectaPay : 1) + '"></label>' +
      "</div>" +
      '<label>Parte overlock / prenda<input type="number" step="0.01" name="overlockPay" value="' + (group.overlockPay != null ? group.overlockPay : 0.4) + '"></label>' +
      '<p class="muted">Ejemplo: corte R$ 1,40 · recta R$ 1,00 (2 en recta → R$ 0,50 c/u) · overlock R$ 0,40.</p>' +
      "<p><strong>Quiénes van a hacerlo</strong></p>" +
      '<div id="memberFields">' + rows + "</div>" +
      '<button type="button" class="btn secondary" data-action="add-member-row">Agregar otra persona</button>' +
      '<button type="button" class="btn" data-action="save-group" data-id="' + escapeHtml(group.id || "") + '">Guardar asignación</button>'
    );
  }

  function buildCutReceiptHtml(cutId) {
    const data = currentData();
    const cut = data.cuts.find(function (c) { return c.id === cutId; });
    if (!cut) return null;
    const assign = data.groups.find(function (x) { return x.id === cut.groupId; }) || {};
    const garment = garmentById(assign.garmentId);
    const per = splitForGroup(assign);
    const qty = Number(cut.qty || 0);
    const peopleRows = (assign.members || []).map(function (m) {
      const w = workerById(m.workerId);
      const unit = per[m.workerId] != null ? per[m.workerId] : 0;
      const total = unit * qty;
      return {
        name: w ? w.name : "—",
        machine: m.machine,
        unit: unit,
        total: total
      };
    });
    const peopleHtml = peopleRows.map(function (p) {
      return "<tr><td>" + escapeHtml(p.name) + "</td><td>" + escapeHtml(p.machine) +
        "</td><td>" + money(p.unit) + "</td><td><strong>" + money(p.total) + "</strong></td></tr>";
    }).join("") || '<tr><td colspan="4">Sin personas</td></tr>';
    const photo = garment && garment.photo
      ? '<img src="' + garment.photo + '" style="width:120px;height:120px;object-fit:cover;border-radius:10px;border:1px solid #ccc;">'
      : '<div style="width:120px;height:120px;background:#eee;border-radius:10px;display:flex;align-items:center;justify-content:center;color:#888;font-size:12px;">Sin foto</div>';
    const totalPay = peopleRows.reduce(function (a, p) { return a + p.total; }, 0);
    return (
      '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Comprobante de corte</title>' +
      '<style>' +
      'body{font-family:Arial,sans-serif;color:#1c1712;padding:24px;max-width:720px;margin:0 auto;}' +
      'h1{font-size:20px;margin:0 0 4px;} h2{font-size:16px;margin:16px 0 8px;}' +
      '.muted{color:#666;font-size:12px;} .row{display:flex;gap:16px;align-items:flex-start;margin:12px 0 18px;}' +
      'table{width:100%;border-collapse:collapse;margin-top:8px;} th,td{border-bottom:1px solid #ddd;padding:8px;text-align:left;font-size:13px;}' +
      'th{color:#666;font-weight:600;} .box{border:1px solid #ddd;border-radius:12px;padding:14px;margin-top:12px;}' +
      '.badge{display:inline-block;padding:3px 8px;border-radius:999px;background:#f0e6d6;font-size:12px;}' +
      '@media print{body{padding:0;} .no-print{display:none!important;}}' +
      '</style></head><body>' +
      '<p class="muted no-print">Si el diálogo de impresión se abre, elegí <strong>Guardar como PDF</strong>.</p>' +
      "<h1>Comprobante de corte terminado</h1>" +
      '<p class="muted">' + escapeHtml(state.workspaceName) + " · " + monthLabel(state.currentMonth) + "</p>" +
      '<div class="row">' + photo +
      "<div><h2 style=\"margin-top:0\">" + escapeHtml(garment ? garment.name : "Prenda") + "</h2>" +
      '<p class="muted">' + (garment ? labelType(garment.type) : "") + "</p>" +
      "<p><strong>Asignación:</strong> " + escapeHtml(assign.name || "—") + "</p>" +
      "<p><strong>Fecha:</strong> " + escapeHtml(cut.date || "—") + "</p>" +
      "<p><strong>Prendas:</strong> " + qty + ' &nbsp; <span class="badge">' + escapeHtml(cut.status || "") + "</span></p>" +
      (cut.notes ? "<p><strong>Notas:</strong> " + escapeHtml(cut.notes) + "</p>" : "") +
      "</div></div>" +
      '<div class="box"><h2>Quiénes lo hicieron y cuánto corresponde</h2>' +
      "<table><thead><tr><th>Funcionario</th><th>Máquina</th><th>Por prenda</th><th>Total (" + qty + ")</th></tr></thead><tbody>" +
      peopleHtml +
      '</tbody></table>' +
      "<p style=\"margin-top:12px\"><strong>Total del corte:</strong> " + money(totalPay) + "</p>" +
      '<p class="muted">Recta ' + money(assign.rectaPay) + " / prenda · Overlock " + money(assign.overlockPay) + " / prenda · Corte base " + money(assign.pricePerPiece) + " / prenda</p>" +
      "</div>" +
      '<p class="muted" style="margin-top:24px">Documento generado como comprobante para funcionarios · ' +
      new Date().toLocaleString("es-PY") + "</p>" +
      '<p class="no-print" style="margin-top:16px"><button onclick="window.print()" style="padding:10px 16px;font-size:14px;border-radius:8px;border:0;background:#1c1712;color:#fff;cursor:pointer;">Imprimir / Guardar PDF</button></p>' +
      "<script>window.onload=function(){setTimeout(function(){window.print();},350);}<\\/script>" +
      "</body></html>"
    );
  }

  function downloadCutPdf(cutId) {
    const html = buildCutReceiptHtml(cutId);
    if (!html) return toast("No se encontró el corte");
    const w = window.open("", "_blank");
    if (!w) {
      toast("Permití ventanas emergentes para descargar el PDF");
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
    toast("Comprobante listo: elegí Guardar como PDF");
  }

  function renderCuts() {
    const data = currentData();
    const closed = isMonthClosed();
    const cards = data.cuts.length
      ? data.cuts.map(function (c) {
          const g = data.groups.find(function (x) { return x.id === c.groupId; }) || {};
          const garment = garmentById(g.garmentId);
          const per = splitForGroup(g);
          const qty = Number(c.qty || 0);
          const people = (g.members || []).map(function (m) {
            const w = workerById(m.workerId);
            const unit = per[m.workerId] != null ? per[m.workerId] : 0;
            return escapeHtml(w ? w.name : "—") + " (" + escapeHtml(m.machine) + ") " + money(unit * qty);
          }).join(" · ");
          const photo = garment && garment.photo
            ? '<img class="cut-thumb clickable-photo" src="' + garment.photo + '" alt="" data-action="view-photo" data-src="' + garment.photo + '" data-title="' + escapeHtml(garment.name || "Prenda") + '" role="button" tabindex="0">'
            : '<div class="cut-thumb empty"></div>';
          return '<article class="card cut-card">' +
            '<div class="cut-top">' + photo +
            '<div class="cut-main">' +
            "<h4>" + escapeHtml(garment ? garment.name : (g.name || "Corte")) + "</h4>" +
            '<p class="muted">' + escapeHtml(g.name || "—") + " · " + escapeHtml(c.date || "") + "</p>" +
            "<p><strong>" + qty + " prendas</strong> · <span class=\"badge " + (c.status === "pagado" ? "ok" : "warn") + '">' +
            escapeHtml(c.status) + "</span></p>" +
            '<p class="muted tight">' + (people || "Sin personas") + "</p>" +
            (c.notes ? '<p class="muted tight">' + escapeHtml(c.notes) + "</p>" : "") +
            "</div></div>" +
            '<div class="toolbar cut-actions">' +
            '<button type="button" class="btn small secondary" data-action="pdf-cut" data-id="' + c.id + '">Descargar PDF</button>' +
            '<button type="button" class="btn small secondary" data-action="toggle-cut" data-id="' + c.id + '"' +
            (closed ? " disabled" : "") + ">" + (c.status === "pagado" ? "Pendiente" : "Pagado") + "</button>" +
            '<button type="button" class="btn small" data-action="del-cut" data-id="' + c.id + '"' +
            (closed ? " disabled" : "") + ">Borrar</button>" +
            "</div></article>";
        }).join("")
      : '<div class="card muted">No hay cortes terminados en este mes.</div>';

    document.getElementById("view-cuts").innerHTML =
      '<div class="toolbar">' +
      '<p class="muted">Registrá prendas terminadas y descargá el PDF como comprobante' + (closed ? ". Mes cerrado." : ".") + "</p>" +
      '<button type="button" class="btn" data-action="add-cut"' + (closed ? " disabled" : "") + ">Registrar prendas terminadas</button>" +
      '</div><div class="cards cut-list">' + cards + "</div>";
  }

  function cutForm() {
    const opts = currentData().groups.map(function (g) {
      return '<option value="' + g.id + '">' + escapeHtml(g.name) + "</option>";
    }).join("");
    const today = new Date().toISOString().slice(0, 10);
    return (
      '<label>Asignación de corte<select name="groupId">' + opts + "</select></label>" +
      '<div class="form-row">' +
      '<label>Fecha<input type="date" name="date" value="' + today + '"></label>' +
      '<label>Prendas totales<input type="number" name="qty" min="1" value="1"></label>' +
      "</div>" +
      '<label>Estado<select name="status"><option value="pendiente">Pendiente</option><option value="pagado">Pagado</option></select></label>' +
      '<label>Notas<input name="notes"></label>' +
      '<button type="button" class="btn" data-action="save-cut">Guardar</button>'
    );
  }

  function renderVales() {
    const closed = isMonthClosed();
    const rows = currentData().vales.length
      ? currentData().vales.map(function (v) {
          const w = workerById(v.workerId);
          return "<tr><td>" + escapeHtml(v.date || "") + "</td><td>" + escapeHtml(w ? w.name : "—") +
            "</td><td>" + money(v.amount) + "</td><td>" + escapeHtml(v.notes || "") +
            '</td><td><button type="button" class="btn small" data-action="del-vale" data-id="' + v.id + '"' +
            (closed ? " disabled" : "") + ">Borrar</button></td></tr>";
        }).join("")
      : '<tr><td colspan="5" class="muted">Sin vales este mes.</td></tr>';

    document.getElementById("view-vales").innerHTML =
      '<div class="toolbar">' +
      '<p class="muted">El vale es por funcionario, no por grupo' + (closed ? ". Mes cerrado." : ".") + "</p>" +
      '<button type="button" class="btn" data-action="add-vale"' + (closed ? " disabled" : "") + ">Registrar vale</button>" +
      '</div><div class="card"><table><thead><tr><th>Fecha</th><th>Funcionario</th><th>Monto</th><th>Motivo</th><th></th></tr></thead><tbody>' +
      rows + "</tbody></table></div>";
  }

  function valeForm() {
    const opts = state.workers.map(function (w) {
      return '<option value="' + w.id + '">' + escapeHtml(w.name) + "</option>";
    }).join("");
    const today = new Date().toISOString().slice(0, 10);
    return (
      '<label>Funcionario<select name="workerId">' + opts + "</select></label>" +
      '<div class="form-row">' +
      '<label>Fecha<input type="date" name="date" value="' + today + '"></label>' +
      '<label>Monto<input type="number" step="0.01" name="amount" value="0"></label>' +
      "</div>" +
      '<label>Motivo<input name="notes"></label>' +
      '<button type="button" class="btn" data-action="save-vale">Guardar</button>'
    );
  }

  function renderPayroll() {
    const t = monthTotals();
    const rows = state.workers.map(function (w) {
      const x = t.byWorker[w.id] || { earned: 0, paid: 0, pending: 0, vales: 0 };
      return "<tr><td>" + escapeHtml(w.name) + "</td><td>" + money(x.earned) + "</td><td>" +
        money(x.paid) + "</td><td>" + money(x.vales) + "</td><td><strong>" +
        money(x.pending - x.vales) + "</strong></td></tr>";
    }).join("");

    document.getElementById("view-payroll").innerHTML =
      '<div class="card"><h3>Pagos de ' + monthLabel(state.currentMonth) + "</h3>" +
      '<p class="muted">Marcá los cortes como pagados en Cortes. Acá ves el consolidado con vales descontados.</p>' +
      "<table><thead><tr><th>Funcionario</th><th>Devengado</th><th>Ya pagado</th><th>Vales</th><th>Saldo</th></tr></thead><tbody>" +
      rows + "</tbody></table></div>";
  }

  function renderSettings() {
    document.getElementById("view-settings").innerHTML =
      '<div class="card grid">' +
      '<label>Nombre del taller / archivo<input id="workspaceInput" value="' + escapeHtml(state.workspaceName) + '"></label>' +
      '<div class="toolbar">' +
      '<button type="button" class="btn" data-action="save-name">Guardar nombre</button>' +
      '<button type="button" class="btn secondary" data-action="export">Exportar JSON</button>' +
      "</div>" +
      '<p class="muted">Al importar, los datos se fusionan sin borrar lo existente.</p>' +
      '<p class="muted">En el celular: menú del navegador → Agregar a pantalla de inicio.</p>' +
      "</div>";
  }

  function render() {
    try {
      renderChrome();
      const map = {
        dashboard: renderDashboard,
        workers: renderWorkers,
        garments: renderGarments,
        groups: renderGroups,
        cuts: renderCuts,
        vales: renderVales,
        payroll: renderPayroll,
        settings: renderSettings
      };
      (map[state.currentView] || renderDashboard)();
    } catch (err) {
      console.error(err);
      toast("Error al dibujar la pantalla");
    }
  }

  function mergeById(existing, incoming) {
    existing = Array.isArray(existing) ? existing : [];
    incoming = Array.isArray(incoming) ? incoming : [];
    const map = new Map();
    existing.forEach(function (x) {
      if (x && x.id) map.set(x.id, x);
    });
    incoming.forEach(function (item) {
      if (!item) return;
      if (!item.id) {
        const id = uid("m");
        map.set(id, Object.assign({}, item, { id: id }));
        return;
      }
      if (!map.has(item.id)) map.set(item.id, item);
    });
    return Array.from(map.values());
  }

  function importMerge(incoming) {
    if (!incoming || typeof incoming !== "object") return;
    if (incoming.workspaceName && state.workspaceName === "Atelier Office") {
      state.workspaceName = incoming.workspaceName;
    }
    state.workers = mergeById(state.workers, incoming.workers);
    state.garments = mergeById(state.garments, incoming.garments);
    const months = incoming.months || {};
    Object.keys(months).forEach(function (key) {
      const cur = ensureMonth(key);
      const add = months[key] || {};
      if (add.status && !cur.groups.length && !cur.cuts.length && !cur.vales.length) {
        cur.status = add.status;
      }
      cur.groups = mergeById(cur.groups, add.groups);
      cur.cuts = mergeById(cur.cuts, add.cuts);
      cur.vales = mergeById(cur.vales, add.vales);
    });
  }

  function exportJSON() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    const safe = String(state.workspaceName || "taller").toLowerCase().replace(/\s+/g, "-");
    a.href = URL.createObjectURL(blob);
    a.download = safe + "-" + state.currentMonth + ".json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast("JSON exportado");
  }

  function collectGroupMembers(root) {
    const members = [];
    for (let i = 0; i < 12; i++) {
      const wEl = root.querySelector('[name="worker_' + i + '"]');
      const mEl = root.querySelector('[name="machine_' + i + '"]');
      if (!wEl) continue;
      const workerId = wEl.value;
      if (workerId) members.push({ workerId: workerId, machine: (mEl && mEl.value) || "recta" });
    }
    return members;
  }

  function guardClosed() {
    if (isMonthClosed()) {
      toast("Este mes está terminado. Reabrilo para editar.");
      return true;
    }
    return false;
  }

  function hideLoader() {
    const loader = document.getElementById("boot-loader");
    const app = document.getElementById("appRoot");
    if (app) {
      app.hidden = false;
      app.removeAttribute("hidden");
    }
    if (loader) {
      loader.classList.add("is-done");
      loader.style.pointerEvents = "none";
      setTimeout(function () {
        loader.hidden = true;
        loader.style.display = "none";
      }, 350);
    }
  }

  function openMenu() {
    const menu = document.getElementById("sideMenu");
    const overlay = document.getElementById("menuOverlay");
    const btn = document.getElementById("menuBtn");
    if (menu) {
      menu.classList.add("is-open");
      menu.setAttribute("aria-hidden", "false");
    }
    if (overlay) {
      overlay.hidden = false;
      overlay.removeAttribute("hidden");
    }
    if (btn) btn.setAttribute("aria-expanded", "true");
    document.body.classList.add("menu-open");
  }

  function closeMenu() {
    const menu = document.getElementById("sideMenu");
    const overlay = document.getElementById("menuOverlay");
    const btn = document.getElementById("menuBtn");
    if (menu) {
      menu.classList.remove("is-open");
      menu.setAttribute("aria-hidden", "true");
    }
    if (overlay) overlay.hidden = true;
    if (btn) btn.setAttribute("aria-expanded", "false");
    document.body.classList.remove("menu-open");
  }

  function registerPWA() {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("./sw.js").catch(function () {});
  }

  function val(root, name) {
    const el = root.querySelector('[name="' + name + '"]');
    return el ? el.value : "";
  }

  async function onAction(action, el, e) {
    const id = el.getAttribute("data-id") || "";

    if (action === "view-photo") {
      const src = el.getAttribute("data-src") || "";
      const title = el.getAttribute("data-title") || "Foto de la prenda";
      if (!src) return toast("Esta prenda no tiene foto");
      openModal(title, '<div class="photo-viewer"><img src="' + src + '" alt="' + escapeHtml(title) + '"></div>');
      return;
    }
    if (action === "add-worker") {
      openModal("Nuevo funcionario", workerForm());
      return;
    }
    if (action === "add-garment") {
      openModal("Nueva prenda", garmentForm());
      return;
    }
    if (action === "add-group") {
      if (guardClosed()) return;
      openModal("Asignar corte", groupForm());
      return;
    }
    if (action === "add-cut") {
      if (guardClosed()) return;
      if (!currentData().groups.length) return toast("Primero asigná un corte");
      openModal("Corte terminado", cutForm());
      return;
    }
    if (action === "add-vale") {
      if (guardClosed()) return;
      if (!state.workers.length) return toast("Primero agregá funcionarios");
      openModal("Vale / adelanto", valeForm());
      return;
    }
    if (action === "export") {
      exportJSON();
      return;
    }
    if (action === "save-name") {
      const input = document.getElementById("workspaceInput");
      state.workspaceName = (input && input.value.trim()) || state.workspaceName;
      save();
      render();
      toast("Nombre actualizado");
      return;
    }
    if (action === "edit-worker") {
      openModal("Editar funcionario", workerForm(workerById(id)));
      return;
    }
    if (action === "del-worker") {
      if (!confirm("¿Quitar este funcionario?")) return;
      state.workers = state.workers.filter(function (w) { return w.id !== id; });
      save();
      render();
      return;
    }
    if (action === "edit-garment") {
      openModal("Editar prenda", garmentForm(garmentById(id)));
      return;
    }
    if (action === "del-garment") {
      if (!confirm("¿Quitar esta prenda?")) return;
      state.garments = state.garments.filter(function (g) { return g.id !== id; });
      save();
      render();
      return;
    }
    if (action === "edit-group") {
      if (guardClosed()) return;
      openModal("Editar asignación de corte", groupForm(groupById(id)));
      return;
    }
    if (action === "del-group") {
      if (guardClosed()) return;
      if (!confirm("¿Quitar esta asignación de corte?")) return;
      currentData().groups = currentData().groups.filter(function (g) { return g.id !== id; });
      save();
      render();
      return;
    }
    if (action === "pdf-cut") {
      downloadCutPdf(id);
      return;
    }
    if (action === "toggle-cut") {
      if (guardClosed()) return;
      const cut = currentData().cuts.find(function (c) { return c.id === id; });
      if (cut) cut.status = cut.status === "pagado" ? "pendiente" : "pagado";
      save();
      render();
      return;
    }
    if (action === "del-cut") {
      if (guardClosed()) return;
      currentData().cuts = currentData().cuts.filter(function (c) { return c.id !== id; });
      save();
      render();
      return;
    }
    if (action === "del-vale") {
      if (guardClosed()) return;
      currentData().vales = currentData().vales.filter(function (v) { return v.id !== id; });
      save();
      render();
      return;
    }
    if (action === "add-member-row") {
      const box = document.getElementById("memberFields");
      if (!box) return;
      const i = box.querySelectorAll(".member-row").length;
      const opts = state.workers.map(function (w) {
        return '<option value="' + w.id + '">' + escapeHtml(w.name) + "</option>";
      }).join("");
      box.insertAdjacentHTML(
        "beforeend",
        '<div class="form-row member-row">' +
          "<label>Funcionario " + (i + 1) +
          '<select name="worker_' + i + '"><option value="">—</option>' + opts + "</select></label>" +
          "<label>Máquina<select name=\"machine_" + i + '">' +
          '<option value="recta">Recta</option><option value="overlock">Overlock</option>' +
          "</select></label></div>"
      );
      return;
    }
    if (action === "save-worker") {
      const root = el.closest(".modal-body");
      if (!root) return;
      const photoInput = root.querySelector('[name="photo"]');
      const photo = await fileToDataUrl(photoInput && photoInput.files && photoInput.files[0]);
      const newId = id || uid("w");
      const prev = workerById(newId);
      const name = val(root, "name").trim();
      if (!name) return toast("Poné un nombre");
      const item = {
        id: newId,
        name: name,
        notes: val(root, "notes"),
        photo: photo || (prev && prev.photo) || ""
      };
      const idx = state.workers.findIndex(function (w) { return w.id === newId; });
      if (idx >= 0) state.workers[idx] = item;
      else state.workers.push(item);
      save();
      closeModal();
      render();
      toast("Funcionario guardado");
      return;
    }
    if (action === "save-garment") {
      const root = el.closest(".modal-body");
      if (!root) return;
      const photoInput = root.querySelector('[name="photo"]');
      const photo = await fileToDataUrl(photoInput && photoInput.files && photoInput.files[0]);
      const newId = id || uid("g");
      const prev = garmentById(newId);
      const name = val(root, "name").trim();
      if (!name) return toast("Poné un nombre");
      const item = {
        id: newId,
        name: name,
        type: val(root, "type") || "otro",
        notes: val(root, "notes"),
        photo: photo || (prev && prev.photo) || ""
      };
      const idx = state.garments.findIndex(function (g) { return g.id === newId; });
      if (idx >= 0) state.garments[idx] = item;
      else state.garments.push(item);
      save();
      closeModal();
      render();
      toast("Prenda guardada");
      return;
    }
    if (action === "save-group") {
      if (guardClosed()) return;
      const root = el.closest(".modal-body");
      if (!root) return;
      const newId = id || uid("gr");
      const name = val(root, "name").trim();
      if (!name) return toast("Poné un nombre a la asignación");
      if (!val(root, "garmentId")) return toast("Elegí qué prenda van a hacer");
      const item = {
        id: newId,
        name: name,
        garmentId: val(root, "garmentId"),
        pricePerPiece: Number(val(root, "pricePerPiece") || 0),
        rectaPay: Number(val(root, "rectaPay") || 0),
        overlockPay: Number(val(root, "overlockPay") || 0),
        members: collectGroupMembers(root)
      };
      if (!item.members.length) return toast("Elegí al menos quién lo va a hacer");
      const arr = currentData().groups;
      const idx = arr.findIndex(function (g) { return g.id === newId; });
      if (idx >= 0) arr[idx] = item;
      else arr.push(item);
      save();
      closeModal();
      render();
      toast("Asignación de corte guardada");
      return;
    }
    if (action === "save-cut") {
      if (guardClosed()) return;
      const root = el.closest(".modal-body");
      if (!root) return;
      currentData().cuts.push({
        id: uid("c"),
        groupId: val(root, "groupId"),
        date: val(root, "date"),
        qty: Number(val(root, "qty") || 0),
        status: val(root, "status") || "pendiente",
        notes: val(root, "notes")
      });
      save();
      closeModal();
      render();
      toast("Corte registrado");
      return;
    }
    if (action === "save-vale") {
      if (guardClosed()) return;
      const root = el.closest(".modal-body");
      if (!root) return;
      currentData().vales.push({
        id: uid("v"),
        workerId: val(root, "workerId"),
        date: val(root, "date"),
        amount: Number(val(root, "amount") || 0),
        notes: val(root, "notes")
      });
      save();
      closeModal();
      render();
      toast("Vale registrado");
      return;
    }
  }

  function bind() {
    document.addEventListener("click", function (e) {
      const t = e.target;
      if (!t || !t.closest) return;

      if (t.id === "menuBtn" || t.closest("#menuBtn")) {
        const menu = document.getElementById("sideMenu");
        if (menu && menu.classList.contains("is-open")) closeMenu();
        else openMenu();
        return;
      }

      if (t.id === "menuCloseBtn" || t.closest("#menuCloseBtn")) {
        closeMenu();
        return;
      }

      if (t.id === "menuOverlay") {
        closeMenu();
        return;
      }

      /* navegación */
      const navBtn = t.closest(".nav-btn");
      if (navBtn && navBtn.getAttribute("data-view")) {
        state.currentView = navBtn.getAttribute("data-view");
        closeMenu();
        render();
        return;
      }

      if (t.id === "themeToggle" || t.closest("#themeToggle")) {
        setTheme(state.theme === "dark" ? "light" : "dark");
        return;
      }

      if (t.id === "newMonthBtn" || t.closest("#newMonthBtn")) {
        const value = prompt("Mes nuevo (AAAA-MM)", monthKey(new Date()));
        if (!value || !/^\d{4}-\d{2}$/.test(value)) {
          if (value) toast("Usá el formato 2026-02");
          return;
        }
        state.currentMonth = value;
        ensureMonth(value);
        save();
        render();
        toast(monthLabel(value) + " listo. Empieza vacío.");
        return;
      }

      if (t.id === "toggleMonthStatusBtn" || t.closest("#toggleMonthStatusBtn")) {
        const data = currentData();
        if (data.status === "cerrado") {
          if (!confirm("¿Reabrir " + monthLabel(state.currentMonth) + "?")) return;
          data.status = "abierto";
          toast("Mes reabierto");
        } else {
          if (!confirm("¿Marcar " + monthLabel(state.currentMonth) + " como terminado?\nSolo se bloquea la edición de ese mes.")) return;
          data.status = "cerrado";
          toast("Mes marcado como terminado");
        }
        save();
        render();
        return;
      }

      if (t.id === "exportBtn" || t.closest("#exportBtn")) {
        exportJSON();
        return;
      }

      if (t.id === "modalClose" || t.closest("#modalClose")) {
        closeModal();
        return;
      }

      const modal = document.getElementById("modal");
      if (modal && t === modal) {
        closeModal();
        return;
      }

      const actionEl = t.closest("[data-action]");
      if (actionEl) {
        const action = actionEl.getAttribute("data-action");
        onAction(action, actionEl, e).catch(function (err) {
          console.error(err);
          toast("Error al ejecutar la acción");
        });
      }
    });

    const monthSelect = document.getElementById("monthSelect");
    if (monthSelect) {
      monthSelect.addEventListener("change", function (e) {
        state.currentMonth = e.target.value;
        ensureMonth(state.currentMonth);
        save();
        render();
      });
    }

    const importInput = document.getElementById("importInput");
    if (importInput) {
      importInput.addEventListener("change", async function (e) {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        try {
          const text = await file.text();
          const incoming = JSON.parse(text);
          importMerge(incoming);
          save();
          render();
          toast("Importado sin borrar lo existente");
        } catch (err) {
          toast("JSON inválido");
        }
        e.target.value = "";
      });
    }
  }

  /* inicio */
  try {
    load();
    setTheme(state.theme || "dark");
    bind();
    render();
    registerPWA();
  } catch (err) {
    console.error(err);
  }

  requestAnimationFrame(function () {
    setTimeout(hideLoader, 300);
  });

  /* si algo falló, igual mostrar la app a los 2s */
  setTimeout(hideLoader, 2000);

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeMenu();
  });
})();
