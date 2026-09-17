const STORAGE_KEY = "atelier-office-v1";

const state = {
  workspaceName: "Atelier Office",
  theme: "dark",
  currentMonth: monthKey(new Date()),
  currentView: "dashboard",
  workers: [],
  garments: [],
  months: {}
};

function uid(prefix = "id") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function monthKey(date) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key) {
  const [y, m] = key.split("-");
  const names = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  return `${names[Number(m) - 1]} ${y}`;
}

function money(n) {
  return `R$ ${Number(n || 0).toFixed(2).replace(".", ",")}`;
}

function ensureMonth(key) {
  if (!state.months[key]) {
    state.months[key] = { status: "abierto", groups: [], cuts: [], vales: [] };
  }
  if (!state.months[key].status) state.months[key].status = "abierto";
  if (!state.months[key].groups) state.months[key].groups = [];
  if (!state.months[key].cuts) state.months[key].cuts = [];
  if (!state.months[key].vales) state.months[key].vales = [];
  return state.months[key];
}

function currentData() {
  return ensureMonth(state.currentMonth);
}

function isMonthClosed(key = state.currentMonth) {
  return ensureMonth(key).status === "cerrado";
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function load() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    ensureMonth(state.currentMonth);
    return;
  }
  try {
    const parsed = JSON.parse(raw);
    Object.assign(state, parsed);
    ensureMonth(state.currentMonth);
    Object.keys(state.months || {}).forEach((k) => ensureMonth(k));
  } catch {
    ensureMonth(state.currentMonth);
  }
}

function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.hidden = false;
  setTimeout(() => { el.hidden = true; }, 2800);
}

function fileToDataUrl(file) {
  return new Promise((resolve) => {
    if (!file) return resolve("");
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}

function workerById(id) {
  return state.workers.find((w) => w.id === id);
}

function garmentById(id) {
  return state.garments.find((g) => g.id === id);
}

function groupById(id) {
  return currentData().groups.find((g) => g.id === id);
}

function splitForGroup(group) {
  const rectas = group.members.filter((m) => m.machine === "recta");
  const overs = group.members.filter((m) => m.machine === "overlock");
  const rectaPool = Number(group.rectaPay || 0);
  const overPool = Number(group.overlockPay || 0);
  const map = {};
  rectas.forEach((m) => {
    map[m.workerId] = rectas.length ? rectaPool / rectas.length : 0;
  });
  overs.forEach((m) => {
    map[m.workerId] = overs.length ? overPool / overs.length : 0;
  });
  return map;
}

function monthTotals(key = state.currentMonth) {
  const data = ensureMonth(key);
  let produced = 0;
  let earned = 0;
  let paid = 0;
  let pending = 0;
  const byWorker = {};
  state.workers.forEach((w) => {
    byWorker[w.id] = { earned: 0, paid: 0, pending: 0, vales: 0 };
  });

  data.cuts.forEach((cut) => {
    const group = data.groups.find((g) => g.id === cut.groupId);
    if (!group) return;
    const qty = Number(cut.qty || 0);
    produced += qty;
    const per = splitForGroup(group);
    Object.entries(per).forEach(([wid, unit]) => {
      const amount = unit * qty;
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

  data.vales.forEach((v) => {
    if (!byWorker[v.workerId]) byWorker[v.workerId] = { earned: 0, paid: 0, pending: 0, vales: 0 };
    byWorker[v.workerId].vales += Number(v.amount || 0);
  });

  return {
    produced,
    earned,
    paid,
    pending,
    vales: data.vales.reduce((a, v) => a + Number(v.amount || 0), 0),
    byWorker
  };
}

function openModal(title, html) {
  document.getElementById("modalTitle").textContent = title;
  document.getElementById("modalBody").innerHTML = html;
  document.getElementById("modal").hidden = false;
}

function closeModal() {
  document.getElementById("modal").hidden = true;
}

function setTheme(theme) {
  state.theme = theme;
  document.documentElement.setAttribute("data-theme", theme);
  document.getElementById("themeToggle").textContent =
    theme === "dark" ? "Cambiar a tema claro" : "Cambiar a tema oscuro";
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "dark" ? "#12100e" : "#f4efe6");
  save();
}

function updateMonthChrome() {
  const closed = isMonthClosed();
  const label = document.getElementById("monthStatusLabel");
  const btn = document.getElementById("toggleMonthStatusBtn");
  const banner = document.getElementById("monthLockedBanner");
  const app = document.getElementById("appRoot");

  label.textContent = closed ? "Estado: mes terminado" : "Estado: mes abierto";
  label.className = `month-status ${closed ? "closed" : "open"}`;
  btn.textContent = closed ? "Reabrir mes" : "Marcar mes terminado";
  banner.hidden = !closed;
  app.classList.toggle("is-month-closed", closed);
}

function renderMonthSelect() {
  const sel = document.getElementById("monthSelect");
  const keys = Object.keys(state.months).sort();
  if (!keys.includes(state.currentMonth)) keys.push(state.currentMonth);
  sel.innerHTML = keys
    .map((k) => {
      const tag = ensureMonth(k).status === "cerrado" ? " · cerrado" : "";
      return `<option value="${k}" ${k === state.currentMonth ? "selected" : ""}>${monthLabel(k)}${tag}</option>`;
    })
    .join("");
}

function renderChrome() {
  document.getElementById("workspaceTitle").textContent = state.workspaceName;
  document.title = `${state.workspaceName} — Jefe de oficina`;
  renderMonthSelect();
  updateMonthChrome();
  const titles = {
    dashboard: ["Resumen del mes", "Panel"],
    workers: ["Plantel", "Funcionarios"],
    garments: ["Catálogo de producción", "Prendas"],
    groups: ["Equipos de costura", "Grupos"],
    cuts: ["Producción del mes", "Cortes terminados"],
    vales: ["Adelantos individuales", "Vales"],
    payroll: ["Liquidación", "Pagos"],
    settings: ["Respaldos y preferencias", "Ajustes y datos"]
  };
  const [crumb, title] = titles[state.currentView];
  document.getElementById("crumb").textContent = `${crumb} · ${monthLabel(state.currentMonth)}`;
  document.getElementById("pageTitle").textContent = title;
  document.querySelectorAll(".nav-btn").forEach((b) =>
    b.classList.toggle("active", b.dataset.view === state.currentView)
  );
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  document.getElementById(`view-${state.currentView}`).classList.add("active");
}

function renderDashboard() {
  const t = monthTotals();
  const closed = isMonthClosed();
  const rows =
    state.workers
      .map((w) => {
        const x = t.byWorker[w.id] || { earned: 0, paid: 0, pending: 0, vales: 0 };
        const net = x.pending - x.vales;
        return `<tr>
      <td>${w.name}</td>
      <td>${money(x.earned)}</td>
      <td>${money(x.paid)}</td>
      <td>${money(x.pending)}</td>
      <td>${money(x.vales)}</td>
      <td><strong>${money(net)}</strong></td>
    </tr>`;
      })
      .join("") ||
    `<tr><td colspan="6" class="muted">Todavía no hay funcionarios en este taller.</td></tr>`;

  document.getElementById("view-dashboard").innerHTML = `
    <div class="grid stats">
      <article class="card"><h3>Prendas del mes</h3><p class="stat">${t.produced}</p></article>
      <article class="card"><h3>Producido</h3><p class="stat">${money(t.earned)}</p></article>
      <article class="card"><h3>Pendiente</h3><p class="stat">${money(t.pending)}</p></article>
      <article class="card"><h3>Vales</h3><p class="stat">${money(t.vales)}</p></article>
    </div>
    <div class="card" style="margin-top:14px">
      <h3>Por funcionario en ${monthLabel(state.currentMonth)} ${closed ? "· terminado" : ""}</h3>
      <p class="muted">El neto pendiente descuenta vales individuales. Los meses no se mezclan. El cierre del mes es manual.</p>
      <table>
        <thead><tr><th>Funcionario</th><th>Devengado</th><th>Pagado</th><th>Pendiente</th><th>Vales</th><th>Neto a pagar</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function renderWorkers() {
  const cards =
    state.workers
      .map(
        (w) => `
    <article class="card person">
      ${w.photo ? `<img class="person-photo" src="${w.photo}" alt="${w.name}">` : `<div class="person-photo"></div>`}
      <h4>${w.name}</h4>
      <p class="muted">${w.notes || "Sin observaciones"}</p>
      <div class="toolbar">
        <button class="btn small secondary" data-edit-worker="${w.id}">Editar</button>
        <button class="btn small" data-del-worker="${w.id}">Quitar</button>
      </div>
    </article>`
      )
      .join("") || `<div class="card muted">Agregá el primer funcionario del taller.</div>`;

  document.getElementById("view-workers").innerHTML = `
    <div class="toolbar">
      <p class="muted">Los funcionarios se mantienen entre meses. La producción se administra por mes.</p>
      <button class="btn" id="addWorker">Agregar funcionario</button>
    </div>
    <div class="people">${cards}</div>`;
}

function workerForm(worker = {}) {
  return `
    <label>Nombre<input name="name" value="${worker.name || ""}" required></label>
    <label>Notas<textarea name="notes">${worker.notes || ""}</textarea></label>
    <label>Foto de muestra<input type="file" name="photo" accept="image/*"></label>
    ${worker.photo ? `<img class="person-photo" src="${worker.photo}" alt="">` : ""}
    <button class="btn" id="saveWorker">Guardar</button>`;
}

function renderGarments() {
  const cards =
    state.garments
      .map(
        (g) => `
    <article class="card gcard">
      ${g.photo ? `<img class="garment-photo" src="${g.photo}" alt="${g.name}">` : `<div class="garment-photo"></div>`}
      <h4>${g.name}</h4>
      <span class="badge">${labelType(g.type)}</span>
      <p class="muted">${g.notes || ""}</p>
      <div class="toolbar">
        <button class="btn small secondary" data-edit-garment="${g.id}">Editar</button>
        <button class="btn small" data-del-garment="${g.id}">Quitar</button>
      </div>
    </article>`
      )
      .join("") || `<div class="card muted">Cargá las prendas que se confeccionan.</div>`;

  document.getElementById("view-garments").innerHTML = `
    <div class="toolbar">
      <p class="muted">Tejido plano, malla u otro. La foto queda guardada en el JSON.</p>
      <button class="btn" id="addGarment">Agregar prenda</button>
    </div>
    <div class="cards">${cards}</div>`;
}

function labelType(type) {
  return { plano: "Tejido plano", malla: "Malla", otro: "Otro" }[type] || type || "Otro";
}

function garmentForm(g = {}) {
  return `
    <label>Nombre de la prenda<input name="name" value="${g.name || ""}" required></label>
    <label>Tipo
      <select name="type">
        <option value="plano" ${g.type === "plano" ? "selected" : ""}>Tejido plano</option>
        <option value="malla" ${g.type === "malla" ? "selected" : ""}>Malla</option>
        <option value="otro" ${g.type === "otro" ? "selected" : ""}>Otro</option>
      </select>
    </label>
    <label>Notas<textarea name="notes">${g.notes || ""}</textarea></label>
    <label>Foto de muestra<input type="file" name="photo" accept="image/*"></label>
    <button class="btn" id="saveGarment">Guardar</button>`;
}

function renderGroups() {
  const data = currentData();
  const closed = isMonthClosed();
  const cards =
    data.groups
      .map((g) => {
        const garment = garmentById(g.garmentId);
        const members = g.members
          .map((m) => `${workerById(m.workerId)?.name || "—"} (${m.machine})`)
          .join(" · ");
        return `<article class="card">
      <h4>${g.name}</h4>
      <p>${garment ? garment.name : "Sin prenda"} · ${money(g.pricePerPiece)} / prenda</p>
      <p class="muted">Recta ${money(g.rectaPay)} · Overlock ${money(g.overlockPay)}</p>
      <p>${members || "Sin integrantes"}</p>
      <div class="toolbar">
        <button class="btn small secondary" data-edit-group="${g.id}" ${closed ? "disabled" : ""}>Editar</button>
        <button class="btn small" data-del-group="${g.id}" ${closed ? "disabled" : ""}>Quitar</button>
      </div>
    </article>`;
      })
      .join("") ||
    `<div class="card muted">Creá un grupo de 1, 2 o 3 personas y definí el pago por máquina.</div>`;

  document.getElementById("view-groups").innerHTML = `
    <div class="toolbar">
      <p class="muted">Los valores de recta y overlock se pueden cambiar por grupo${closed ? ". Mes cerrado: solo lectura." : "."}</p>
      <button class="btn" id="addGroup" data-requires-open ${closed ? "disabled" : ""}>Crear grupo</button>
    </div>
    <div class="cards">${cards}</div>`;
}

function groupForm(group = {}) {
  const members = group.members || [{ workerId: "", machine: "recta" }];
  const workerOpts = (selected) =>
    state.workers
      .map((w) => `<option value="${w.id}" ${w.id === selected ? "selected" : ""}>${w.name}</option>`)
      .join("");
  const garmentOpts = state.garments
    .map((g) => `<option value="${g.id}" ${g.id === group.garmentId ? "selected" : ""}>${g.name}</option>`)
    .join("");
  const rows = members
    .map(
      (m, i) => `
    <div class="form-row member-row">
      <label>Funcionario ${i + 1}
        <select name="worker_${i}"><option value="">—</option>${workerOpts(m.workerId)}</select>
      </label>
      <label>Máquina
        <select name="machine_${i}">
          <option value="recta" ${m.machine === "recta" ? "selected" : ""}>Recta</option>
          <option value="overlock" ${m.machine === "overlock" ? "selected" : ""}>Overlock</option>
        </select>
      </label>
    </div>`
    )
    .join("");

  return `
    <label>Nombre del grupo<input name="name" value="${group.name || ""}" required></label>
    <label>Prenda<select name="garmentId"><option value="">—</option>${garmentOpts}</select></label>
    <div class="form-row">
      <label>Precio por prenda (corte)<input type="number" step="0.01" name="pricePerPiece" value="${group.pricePerPiece ?? 1.4}"></label>
      <label>Pago recta / prenda<input type="number" step="0.01" name="rectaPay" value="${group.rectaPay ?? 1}"></label>
    </div>
    <label>Pago overlock / prenda<input type="number" step="0.01" name="overlockPay" value="${group.overlockPay ?? 0.4}"></label>
    <p class="muted">Ejemplo: corte R$ 1,40 · recta R$ 1,00 (si hay dos rectas, R$ 0,50 c/u) · overlock R$ 0,40.</p>
    <div id="memberFields">${rows}</div>
    <button class="btn secondary" type="button" id="addMemberRow">Agregar integrante</button>
    <button class="btn" id="saveGroup">Guardar grupo</button>`;
}

function renderCuts() {
  const data = currentData();
  const closed = isMonthClosed();
  const rows =
    data.cuts
      .map((c) => {
        const g = data.groups.find((x) => x.id === c.groupId);
        return `<tr>
      <td>${c.date || ""}</td>
      <td>${g ? g.name : "—"}</td>
      <td>${c.qty}</td>
      <td><span class="badge ${c.status === "pagado" ? "ok" : "warn"}">${c.status}</span></td>
      <td>${c.notes || ""}</td>
      <td>
        <button class="btn small secondary" data-toggle-cut="${c.id}" ${closed ? "disabled" : ""}>${
          c.status === "pagado" ? "Marcar pendiente" : "Marcar pagado"
        }</button>
        <button class="btn small" data-del-cut="${c.id}" ${closed ? "disabled" : ""}>Borrar</button>
      </td>
    </tr>`;
      })
      .join("") || `<tr><td colspan="6" class="muted">No hay cortes en este mes.</td></tr>`;

  document.getElementById("view-cuts").innerHTML = `
    <div class="toolbar">
      <p class="muted">Cada corte pertenece al mes activo. El cierre del mes es manual${closed ? " y ahora está cerrado." : "."}</p>
      <button class="btn" id="addCut" data-requires-open ${closed ? "disabled" : ""}>Registrar corte terminado</button>
    </div>
    <div class="card">
      <table>
        <thead><tr><th>Fecha</th><th>Grupo</th><th>Prendas</th><th>Estado</th><th>Notas</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function cutForm() {
  const opts = currentData()
    .groups.map((g) => `<option value="${g.id}">${g.name}</option>`)
    .join("");
  return `
    <label>Grupo<select name="groupId">${opts}</select></label>
    <div class="form-row">
      <label>Fecha<input type="date" name="date" value="${new Date().toISOString().slice(0, 10)}"></label>
      <label>Prendas totales<input type="number" name="qty" min="1" value="1"></label>
    </div>
    <label>Estado
      <select name="status">
        <option value="pendiente">Pendiente</option>
        <option value="pagado">Pagado</option>
      </select>
    </label>
    <label>Notas<input name="notes"></label>
    <button class="btn" id="saveCut">Guardar</button>`;
}

function renderVales() {
  const closed = isMonthClosed();
  const rows =
    currentData()
      .vales.map(
        (v) => `
    <tr>
      <td>${v.date || ""}</td>
      <td>${workerById(v.workerId)?.name || "—"}</td>
      <td>${money(v.amount)}</td>
      <td>${v.notes || ""}</td>
      <td><button class="btn small" data-del-vale="${v.id}" ${closed ? "disabled" : ""}>Borrar</button></td>
    </tr>`
      )
      .join("") || `<tr><td colspan="5" class="muted">Sin vales este mes.</td></tr>`;

  document.getElementById("view-vales").innerHTML = `
    <div class="toolbar">
      <p class="muted">El vale es por funcionario, nunca por el grupo entero${closed ? ". Mes cerrado." : "."}</p>
      <button class="btn" id="addVale" data-requires-open ${closed ? "disabled" : ""}>Registrar vale</button>
    </div>
    <div class="card">
      <table>
        <thead><tr><th>Fecha</th><th>Funcionario</th><th>Monto</th><th>Motivo</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function valeForm() {
  const opts = state.workers.map((w) => `<option value="${w.id}">${w.name}</option>`).join("");
  return `
    <label>Funcionario<select name="workerId">${opts}</select></label>
    <div class="form-row">
      <label>Fecha<input type="date" name="date" value="${new Date().toISOString().slice(0, 10)}"></label>
      <label>Monto<input type="number" step="0.01" name="amount" value="0"></label>
    </div>
    <label>Motivo<input name="notes"></label>
    <button class="btn" id="saveVale">Guardar</button>`;
}

function renderPayroll() {
  const t = monthTotals();
  const rows = state.workers
    .map((w) => {
      const x = t.byWorker[w.id] || { earned: 0, paid: 0, pending: 0, vales: 0 };
      return `<tr>
      <td>${w.name}</td>
      <td>${money(x.earned)}</td>
      <td>${money(x.paid)}</td>
      <td>${money(x.vales)}</td>
      <td><strong>${money(x.pending - x.vales)}</strong></td>
    </tr>`;
    })
    .join("");

  document.getElementById("view-payroll").innerHTML = `
    <div class="card">
      <h3>Pagos de ${monthLabel(state.currentMonth)}</h3>
      <p class="muted">Marcá los cortes como pagados en Cortes. Acá ves el consolidado ya descontado de vales.</p>
      <table>
        <thead><tr><th>Funcionario</th><th>Devengado</th><th>Ya pagado</th><th>Vales</th><th>Saldo</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function renderSettings() {
  document.getElementById("view-settings").innerHTML = `
    <div class="card grid">
      <label>Nombre del taller / archivo
        <input id="workspaceInput" value="${state.workspaceName}">
      </label>
      <div class="toolbar">
        <button class="btn" id="saveName">Guardar nombre</button>
        <button class="btn secondary" id="exportBtn2">Exportar JSON</button>
      </div>
      <p class="muted">Al importar, los datos se fusionan: no se borra lo que ya existe. Si tenés enero y marzo, importá febrero y se completa el historial.</p>
      <p class="muted">Instalá la app desde el navegador del celular (Compartir → Agregar a inicio / Instalar app) para usarla como icono en la pantalla principal.</p>
    </div>`;
}

function render() {
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
  map[state.currentView]();
}

function mergeById(existing = [], incoming = []) {
  const map = new Map(existing.map((x) => [x.id, x]));
  incoming.forEach((item) => {
    if (!item || !item.id) {
      map.set(uid("m"), { ...item, id: uid("m") });
      return;
    }
    if (!map.has(item.id)) map.set(item.id, item);
  });
  return Array.from(map.values());
}

function importMerge(incoming) {
  if (
    incoming.workspaceName &&
    incoming.workspaceName !== "Atelier Office" &&
    state.workspaceName === "Atelier Office"
  ) {
    state.workspaceName = incoming.workspaceName;
  }
  state.workers = mergeById(state.workers, incoming.workers || []);
  state.garments = mergeById(state.garments, incoming.garments || []);
  const months = incoming.months || {};
  Object.keys(months).forEach((key) => {
    const cur = ensureMonth(key);
    const add = months[key] || {};
    if (add.status && cur.groups.length === 0 && cur.cuts.length === 0 && cur.vales.length === 0) {
      cur.status = add.status;
    } else if (add.status && !cur.status) {
      cur.status = add.status;
    }
    cur.groups = mergeById(cur.groups, add.groups || []);
    cur.cuts = mergeById(cur.cuts, add.cuts || []);
    cur.vales = mergeById(cur.vales, add.vales || []);
  });
}

function exportJSON() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  const safe = state.workspaceName.toLowerCase().replace(/\s+/g, "-");
  a.href = URL.createObjectURL(blob);
  a.download = `${safe}-${state.currentMonth}.json`;
  a.click();
  toast("JSON exportado");
}

function collectGroupMembers(form) {
  const members = [];
  for (let i = 0; i < 8; i++) {
    const workerId = form[`worker_${i}`]?.value;
    const machine = form[`machine_${i}`]?.value;
    if (workerId) members.push({ workerId, machine });
  }
  return members;
}

function guardClosedAction() {
  if (isMonthClosed()) {
    toast("Este mes está terminado. Reabrilo para editar.");
    return true;
  }
  return false;
}

function hideLoader() {
  const loader = document.getElementById("boot-loader");
  const app = document.getElementById("appRoot");
  app.hidden = false;
  loader.classList.add("is-done");
  setTimeout(() => {
    loader.hidden = true;
  }, 400);
}

function registerPWA() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
}

function bind() {
  document.getElementById("mainNav").addEventListener("click", (e) => {
    const btn = e.target.closest(".nav-btn");
    if (!btn) return;
    state.currentView = btn.dataset.view;
    render();
  });

  document.getElementById("themeToggle").addEventListener("click", () => {
    setTheme(state.theme === "dark" ? "light" : "dark");
  });

  document.getElementById("monthSelect").addEventListener("change", (e) => {
    state.currentMonth = e.target.value;
    ensureMonth(state.currentMonth);
    save();
    render();
  });

  document.getElementById("newMonthBtn").addEventListener("click", () => {
    const value = prompt("Mes nuevo (AAAA-MM)", monthKey(new Date()));
    if (!value || !/^\d{4}-\d{2}$/.test(value)) return toast("Usá el formato 2026-02");
    state.currentMonth = value;
    ensureMonth(value);
    save();
    render();
    toast(`${monthLabel(value)} listo. Empieza vacío y no toca los meses anteriores.`);
  });

  document.getElementById("toggleMonthStatusBtn").addEventListener("click", () => {
    const data = currentData();
    if (data.status === "cerrado") {
      if (!confirm(`¿Reabrir ${monthLabel(state.currentMonth)} para seguir editando?`)) return;
      data.status = "abierto";
      toast("Mes reabierto");
    } else {
      if (
        !confirm(
          `¿Marcar ${monthLabel(state.currentMonth)} como terminado?\nNo se borra nada. Solo se bloquea la edición de grupos, cortes y vales de ese mes.`
        )
      )
        return;
      data.status = "cerrado";
      toast("Mes marcado como terminado");
    }
    save();
    render();
  });

  document.getElementById("exportBtn").addEventListener("click", exportJSON);
  document.getElementById("importInput").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const incoming = JSON.parse(await file.text());
      importMerge(incoming);
      save();
      render();
      toast("Importado sin borrar lo existente");
    } catch {
      toast("JSON inválido");
    }
    e.target.value = "";
  });

  document.getElementById("modalClose").addEventListener("click", closeModal);
  document.getElementById("modal").addEventListener("click", (e) => {
    if (e.target.id === "modal") closeModal();
  });

  document.body.addEventListener("click", async (e) => {
    if (e.target.id === "addWorker") openModal("Nuevo funcionario", workerForm());
    if (e.target.id === "addGarment") openModal("Nueva prenda", garmentForm());
    if (e.target.id === "addGroup") {
      if (guardClosedAction()) return;
      openModal("Nuevo grupo", groupForm());
    }
    if (e.target.id === "addCut") {
      if (guardClosedAction()) return;
      if (!currentData().groups.length) return toast("Primero creá un grupo");
      openModal("Corte terminado", cutForm());
    }
    if (e.target.id === "addVale") {
      if (guardClosedAction()) return;
      if (!state.workers.length) return toast("Primero agregá funcionarios");
      openModal("Vale / adelanto", valeForm());
    }
    if (e.target.id === "exportBtn2") exportJSON();

    if (e.target.id === "saveName") {
      state.workspaceName = document.getElementById("workspaceInput").value.trim() || state.workspaceName;
      save();
      render();
      toast("Nombre actualizado");
    }

    if (e.target.dataset.editWorker) {
      openModal("Editar funcionario", workerForm(workerById(e.target.dataset.editWorker)));
      document.getElementById("saveWorker").dataset.id = e.target.dataset.editWorker;
    }
    if (e.target.dataset.delWorker) {
      state.workers = state.workers.filter((w) => w.id !== e.target.dataset.delWorker);
      save();
      render();
    }
    if (e.target.dataset.editGarment) {
      openModal("Editar prenda", garmentForm(garmentById(e.target.dataset.editGarment)));
      document.getElementById("saveGarment").dataset.id = e.target.dataset.editGarment;
    }
    if (e.target.dataset.delGarment) {
      state.garments = state.garments.filter((g) => g.id !== e.target.dataset.delGarment);
      save();
      render();
    }
    if (e.target.dataset.editGroup) {
      if (guardClosedAction()) return;
      const g = groupById(e.target.dataset.editGroup);
      openModal("Editar grupo", groupForm(g));
      document.getElementById("saveGroup").dataset.id = e.target.dataset.editGroup;
    }
    if (e.target.dataset.delGroup) {
      if (guardClosedAction()) return;
      currentData().groups = currentData().groups.filter((g) => g.id !== e.target.dataset.delGroup);
      save();
      render();
    }
    if (e.target.dataset.toggleCut) {
      if (guardClosedAction()) return;
      const cut = currentData().cuts.find((c) => c.id === e.target.dataset.toggleCut);
      if (cut) cut.status = cut.status === "pagado" ? "pendiente" : "pagado";
      save();
      render();
    }
    if (e.target.dataset.delCut) {
      if (guardClosedAction()) return;
      currentData().cuts = currentData().cuts.filter((c) => c.id !== e.target.dataset.delCut);
      save();
      render();
    }
    if (e.target.dataset.delVale) {
      if (guardClosedAction()) return;
      currentData().vales = currentData().vales.filter((v) => v.id !== e.target.dataset.delVale);
      save();
      render();
    }

    if (e.target.id === "addMemberRow") {
      const box = document.getElementById("memberFields");
      const i = box.querySelectorAll(".member-row").length;
      const opts = state.workers.map((w) => `<option value="${w.id}">${w.name}</option>`).join("");
      box.insertAdjacentHTML(
        "beforeend",
        `
        <div class="form-row member-row">
          <label>Funcionario ${i + 1}<select name="worker_${i}"><option value="">—</option>${opts}</select></label>
          <label>Máquina<select name="machine_${i}"><option value="recta">Recta</option><option value="overlock">Overlock</option></select></label>
        </div>`
      );
    }

    if (e.target.id === "saveWorker") {
      const form = e.target.closest(".modal-body");
      const photoInput = form.querySelector('[name="photo"]');
      const photo = await fileToDataUrl(photoInput.files[0]);
      const id = e.target.dataset.id || uid("w");
      const prev = workerById(id);
      const item = {
        id,
        name: form.querySelector('[name="name"]').value,
        notes: form.querySelector('[name="notes"]').value,
        photo: photo || prev?.photo || ""
      };
      const idx = state.workers.findIndex((w) => w.id === id);
      if (idx >= 0) state.workers[idx] = item;
      else state.workers.push(item);
      save();
      closeModal();
      render();
    }

    if (e.target.id === "saveGarment") {
      const form = e.target.closest(".modal-body");
      const photo = await fileToDataUrl(form.querySelector('[name="photo"]').files[0]);
      const id = e.target.dataset.id || uid("g");
      const prev = garmentById(id);
      const item = {
        id,
        name: form.querySelector('[name="name"]').value,
        type: form.querySelector('[name="type"]').value,
        notes: form.querySelector('[name="notes"]').value,
        photo: photo || prev?.photo || ""
      };
      const idx = state.garments.findIndex((g) => g.id === id);
      if (idx >= 0) state.garments[idx] = item;
      else state.garments.push(item);
      save();
      closeModal();
      render();
    }

    if (e.target.id === "saveGroup") {
      if (guardClosedAction()) return;
      const form = e.target.closest(".modal-body");
      const id = e.target.dataset.id || uid("gr");
      const item = {
        id,
        name: form.querySelector('[name="name"]').value,
        garmentId: form.querySelector('[name="garmentId"]').value,
        pricePerPiece: Number(form.querySelector('[name="pricePerPiece"]').value || 0),
        rectaPay: Number(form.querySelector('[name="rectaPay"]').value || 0),
        overlockPay: Number(form.querySelector('[name="overlockPay"]').value || 0),
        members: collectGroupMembers(form)
      };
      const arr = currentData().groups;
      const idx = arr.findIndex((g) => g.id === id);
      if (idx >= 0) arr[idx] = item;
      else arr.push(item);
      save();
      closeModal();
      render();
    }

    if (e.target.id === "saveCut") {
      if (guardClosedAction()) return;
      const form = e.target.closest(".modal-body");
      currentData().cuts.push({
        id: uid("c"),
        groupId: form.querySelector('[name="groupId"]').value,
        date: form.querySelector('[name="date"]').value,
        qty: Number(form.querySelector('[name="qty"]').value || 0),
        status: form.querySelector('[name="status"]').value,
        notes: form.querySelector('[name="notes"]').value
      });
      save();
      closeModal();
      render();
    }

    if (e.target.id === "saveVale") {
      if (guardClosedAction()) return;
      const form = e.target.closest(".modal-body");
      currentData().vales.push({
        id: uid("v"),
        workerId: form.querySelector('[name="workerId"]').value,
        date: form.querySelector('[name="date"]').value,
        amount: Number(form.querySelector('[name="amount"]').value || 0),
        notes: form.querySelector('[name="notes"]').value
      });
      save();
      closeModal();
      render();
    }
  });
}

load();
setTheme(state.theme || "dark");
bind();
render();
registerPWA();

// Pequeña pausa para que se note el loader y no parpadee en dispositivos lentos
requestAnimationFrame(() => {
  setTimeout(hideLoader, 450);
});
