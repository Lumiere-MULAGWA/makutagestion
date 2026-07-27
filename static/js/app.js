// ============ STATE ============
let transactions = [];
let online = navigator.onLine;
let deferredPrompt = null;
let charts = {};
let currentUser = null;
let budgets = [];

// ============ DOM REFS ============
const $ = (id) => document.getElementById(id);
const form = $("transaction-form");
const typeIncome = $("type-income");
const typeExpense = $("type-expense");
const typeInput = $("type-input");
const offlineBadge = $("offline-badge");
const onlineBadge = $("online-badge");
const installBanner = $("install-banner");
const installBtn = $("install-btn");
const dismissInstall = $("dismiss-install");
const dateInput = $("date");
const searchInput = $("search-input");
const histFilterType = $("hist-filter-type");
const histFilterCategory = $("hist-filter-category");
const filterDateFrom = $("filter-date-from");
const filterDateTo = $("filter-date-to");
const transactionCount = $("transaction-count");
const quickAddToggle = $("quick-add-toggle");
const quickAddArrow = $("quick-add-arrow");

// ============ INIT ============
dateInput.valueAsDate = new Date();

// ============ HELPERS ============
function formatUSD(n) {
    return "$" + Number(n || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatCDF(n) {
    return Number(n || 0).toLocaleString("fr-FR") + " FC";
}

function escHtml(s) {
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
}

function showToast(msg) {
    const t = $("toast");
    t.textContent = msg;
    t.classList.remove("hidden");
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.add("hidden"), 3000);
}

function genId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

function today() { return new Date().toISOString().split("T")[0]; }
function currentMonth() { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); }
function getMonthName(m) { const names = ["Jan","Fev","Mar","Avr","Mai","Juin","Juil","Aou","Sep","Oct","Nov","Dec"]; return names[m-1]||m; }

// ============ AUTH ============
function initAuth() {
    $("auth-login").classList.remove("hidden");
    $("auth-register").classList.add("hidden");
    $("login-error").classList.add("hidden");
    $("register-error").classList.add("hidden");
}

$("show-register")?.addEventListener("click", (e) => {
    e.preventDefault();
    $("auth-login").classList.add("hidden");
    $("auth-register").classList.remove("hidden");
});

$("show-login")?.addEventListener("click", (e) => {
    e.preventDefault();
    $("auth-register").classList.add("hidden");
    $("auth-login").classList.remove("hidden");
});

$("login-btn")?.addEventListener("click", async () => {
    const email = $("login-email").value.trim();
    const password = $("login-password").value;
    const errorEl = $("login-error");
    errorEl.classList.add("hidden");

    if (!email || !password) {
        errorEl.textContent = "Email et mot de passe requis";
        errorEl.classList.remove("hidden");
        return;
    }

    try {
        const res = await fetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
        });
        const data = await res.json();
        if (!res.ok) {
            errorEl.textContent = data.error || "Erreur de connexion";
            errorEl.classList.remove("hidden");
            return;
        }
        currentUser = data.user;
        localStorage.setItem("makuta_user", JSON.stringify(data.user));
        unlockApp();
    } catch (e) {
        // Offline fallback: allow login with local password check stored in localStorage
        const stored = JSON.parse(localStorage.getItem("makuta_local_user") || "null");
        if (stored && stored.email === email && stored.password === password) {
            currentUser = stored;
            unlockApp();
        } else {
            errorEl.textContent = "Erreur reseau. Verifiez votre connexion.";
            errorEl.classList.remove("hidden");
        }
    }
});

$("register-btn")?.addEventListener("click", async () => {
    const name = $("register-name").value.trim();
    const email = $("register-email").value.trim();
    const password = $("register-password").value;
    const confirm = $("register-confirm").value;
    const errorEl = $("register-error");
    errorEl.classList.add("hidden");

    if (!email || !password) {
        errorEl.textContent = "Email et mot de passe requis";
        errorEl.classList.remove("hidden");
        return;
    }
    if (password !== confirm) {
        errorEl.textContent = "Les mots de passe ne correspondent pas";
        errorEl.classList.remove("hidden");
        return;
    }
    if (password.length < 4) {
        errorEl.textContent = "Mot de passe trop court (4 min)";
        errorEl.classList.remove("hidden");
        return;
    }

    try {
        const res = await fetch("/api/auth/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password, name }),
        });
        const data = await res.json();
        if (!res.ok) {
            errorEl.textContent = data.error || "Erreur d'inscription";
            errorEl.classList.remove("hidden");
            return;
        }
        currentUser = data.user;
        localStorage.setItem("makuta_user", JSON.stringify(data.user));
        unlockApp();
    } catch (e) {
        // Offline: store locally
        const localUser = { id: null, email, name, offline: true };
        localStorage.setItem("makuta_user", JSON.stringify(localUser));
        localStorage.setItem("makuta_local_user", JSON.stringify({ email, password }));
        currentUser = localUser;
        unlockApp();
    }
});

function lockApp() {
    $("app").classList.add("hidden");
    $("auth-screen").classList.remove("hidden");
    currentUser = null;
    $("login-email").value = "";
    $("login-password").value = "";
    initAuth();
}

function unlockApp() {
    $("auth-screen").classList.add("hidden");
    $("app").classList.remove("hidden");
}

function logout() {
    if (confirm("Voulez-vous vous deconnecter ?")) {
        fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
        localStorage.removeItem("makuta_user");
        currentUser = null;
        lockApp();
    }
}

// ============ SETTINGS ============
$("settings-btn")?.addEventListener("click", () => {
    if (currentUser) {
        $("user-email-display").textContent = currentUser.email || "Utilisateur local";
    }
    $("settings-modal").classList.remove("hidden");
});

$("settings-close")?.addEventListener("click", () => {
    $("settings-modal").classList.add("hidden");
});

$("logout-btn")?.addEventListener("click", logout);

$("clear-data-btn")?.addEventListener("click", () => {
    if (confirm("Voulez-vous vraiment effacer toutes les donnees ?")) {
        localStorage.removeItem("makuta_transactions");
        localStorage.removeItem("makuta_budgets");
        transactions = [];
        budgets = [];
        saveLocal();
        fullRender();
        showToast("Donnees effacees");
        $("settings-modal").classList.add("hidden");
    }
});

$("export-data-btn")?.addEventListener("click", () => {
    const data = { transactions, budgets, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "makuta_data_" + today() + ".json";
    a.click();
    URL.revokeObjectURL(url);
    showToast("Donnees exportees");
});

// ============ ONLINE/OFFLINE ============
function updateStatus() {
    online = navigator.onLine;
    offlineBadge.classList.toggle("hidden", online);
    onlineBadge.classList.toggle("hidden", !online);
    const syncEl = $("sync-status");
    syncEl.textContent = online ? "\u2601" : "\u26A0";
    syncEl.style.color = online ? "" : "#ff6f00";
    if (online) syncWithServer();
}

window.addEventListener("online", updateStatus);
window.addEventListener("offline", updateStatus);

// ============ PWA INSTALL ============
const fabInstall = $("fab-install");
const installAppBtn = $("install-app-btn");
const installStatus = $("install-status");

function canInstall() {
    return deferredPrompt !== null;
}

function isAlreadyInstalled() {
    return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;
}

function updateInstallUI() {
    if (isAlreadyInstalled()) {
        if (fabInstall) fabInstall.classList.add("hidden");
        if (installAppBtn) installAppBtn.textContent = "Deja installee";
        if (installAppBtn) installAppBtn.disabled = true;
        if (installStatus) installStatus.textContent = "L'application est deja installee.";
    } else {
        if (fabInstall) fabInstall.classList.remove("hidden");
    }
}

window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    installBanner.classList.remove("hidden");
    updateInstallUI();
});

async function promptInstall() {
    if (!deferredPrompt) {
        if (isAlreadyInstalled()) {
            showToast("L'application est deja installee");
            return;
        }
        // Show manual instructions
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        if (isIOS) {
            showToast("Appuyez sur Partager > Ajouter a l'ecran d'accueil");
        } else {
            showToast("Menu du navigateur > Installer l'application");
        }
        return;
    }
    deferredPrompt.prompt();
    const result = await deferredPrompt.userChoice;
    if (result.outcome === "accepted") {
        installBanner.classList.add("hidden");
        showToast("Installation en cours...");
    }
    deferredPrompt = null;
}

installBtn.addEventListener("click", async () => {
    await promptInstall();
});

dismissInstall.addEventListener("click", () => installBanner.classList.add("hidden"));

if (fabInstall) {
    fabInstall.addEventListener("click", async () => {
        await promptInstall();
    });
}

if (installAppBtn) {
    installAppBtn.addEventListener("click", async () => {
        await promptInstall();
    });
}

// Check if already installed after a small delay
setTimeout(updateInstallUI, 1000);

// ============ TYPE TOGGLE ============
typeIncome.addEventListener("click", () => {
    typeIncome.classList.add("active");
    typeExpense.classList.remove("active");
    typeInput.value = "income";
});

typeExpense.addEventListener("click", () => {
    typeExpense.classList.add("active");
    typeIncome.classList.remove("active");
    typeInput.value = "expense";
});

// ============ NAVIGATION ============
document.querySelectorAll(".nav-item").forEach(item => {
    item.addEventListener("click", () => {
        document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
        document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
        item.classList.add("active");
        const page = $(item.dataset.page);
        if (page) {
            page.classList.add("active");
            if (item.dataset.page === "page-dashboard" || item.dataset.page === "page-depenses") {
                setTimeout(() => { Object.values(charts).forEach(c => { try { c.resize(); } catch(e) {} }); }, 100);
            }
        }
    });
});

// ============ QUICK ADD TOGGLE ============
quickAddToggle.addEventListener("click", () => {
    form.classList.toggle("closed");
    quickAddArrow.classList.toggle("closed");
});

// ============ LOCAL STORAGE ============
function loadLocal() {
    try {
        const data = localStorage.getItem("makuta_transactions");
        if (data) transactions = JSON.parse(data);
    } catch (e) { transactions = []; }
    try {
        const data = localStorage.getItem("makuta_budgets");
        if (data) budgets = JSON.parse(data);
    } catch (e) { budgets = []; }
}

function saveLocal() {
    localStorage.setItem("makuta_transactions", JSON.stringify(transactions));
    localStorage.setItem("makuta_budgets", JSON.stringify(budgets));
}

// ============ CRUD ============
function addTransaction(data) {
    const t = {
        id: null,
        client_id: data.client_id || genId(),
        type: data.type,
        amount_usd: parseFloat(data.amount_usd) || 0,
        amount_cdf: parseFloat(data.amount_cdf) || 0,
        description: data.description,
        category: data.category || "Autre",
        date: data.date,
        synced: false,
        created_at: new Date().toISOString(),
    };
    transactions.unshift(t);
    saveLocal();
    fullRender();
    if (online) syncWithServer();
    return t;
}

async function deleteTransaction(clientId) {
    if (!confirm("Supprimer cette transaction ?")) return;
    transactions = transactions.filter(t => t.client_id !== clientId && String(t.id) !== String(clientId));
    saveLocal();
    fullRender();
    if (online) {
        try { await fetch("/api/transactions/" + clientId, { method: "DELETE" }); } catch(e) {}
    }
    showToast("Transaction supprimee");
}

// ============ SYNC ============
async function syncWithServer() {
    if (!online) return;
    const unsynced = transactions.filter(t => !t.synced && !t.id);
    if (unsynced.length === 0) return;
    try {
        const res = await fetch("/api/transactions/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(unsynced),
        });
        if (res.ok) {
            const synced = await res.json();
            synced.forEach(s => {
                const local = transactions.find(t => t.client_id === s.client_id);
                if (local) { local.id = s.id; local.synced = true; }
            });
            saveLocal();
            fullRender();
        }
    } catch (e) { console.log("Sync failed"); }
}

async function loadFromServer() {
    if (!online) return;
    try {
        const res = await fetch("/api/transactions");
        if (res.ok) {
            const serverData = await res.json();
            const localMap = {};
            transactions.forEach(t => { if (t.client_id) localMap[t.client_id] = t; });
            serverData.forEach(s => {
                if (!localMap[s.client_id]) transactions.push({ ...s, synced: true });
            });
            saveLocal();
            fullRender();
        }
    } catch (e) { console.log("Load from server failed"); }
}

// ============ FULL RENDER ============
function fullRender() {
    renderDashboard();
    renderHistory();
    renderExpenses();
    renderInsights();
    renderLimits();
    updateSummary();
}

function updateSummary() {
    let incomeUSD = 0, incomeCDF = 0, expenseUSD = 0, expenseCDF = 0;
    transactions.forEach(t => {
        if (t.type === "income") {
            incomeUSD += Number(t.amount_usd || 0);
            incomeCDF += Number(t.amount_cdf || 0);
        } else {
            expenseUSD += Number(t.amount_usd || 0);
            expenseCDF += Number(t.amount_cdf || 0);
        }
    });
    $("total-income-usd").textContent = formatUSD(incomeUSD);
    $("total-income-cdf").textContent = formatCDF(incomeCDF);
    $("total-expense-usd").textContent = formatUSD(expenseUSD);
    $("total-expense-cdf").textContent = formatCDF(expenseCDF);
    $("balance-usd").textContent = formatUSD(incomeUSD - expenseUSD);
    $("balance-cdf").textContent = formatCDF(incomeCDF - expenseCDF);
}

// ============ BUDGET ============
function getMonthSpending(category) {
    const ym = currentMonth();
    return transactions.filter(t => t.type === "expense" && t.category === category && t.date && t.date.startsWith(ym))
        .reduce((s, t) => ({ usd: s.usd + (t.amount_usd||0), cdf: s.cdf + (t.amount_cdf||0) }), { usd: 0, cdf: 0 });
}

function renderBudgetProgress() {
    const list = $("budget-progress-list");
    if (!budgets.length) {
        list.innerHTML = "<div class=\"empty-state\">Aucune limite definie. Allez dans l'onglet Limites.</div>";
        return;
    }

    const ym = currentMonth();
    let html = "";
    const showCount = 3;
    const displayed = budgets.slice(0, showCount);
    const remaining = budgets.length - showCount;

    budgets.forEach((b, idx) => {
        const spending = getMonthSpending(b.category);
        const spentTotal = (spending.usd || 0) + (spending.cdf || 0) / 3000;
        const limitTotal = (b.usd || 0) + (b.cdf || 0) / 3000;
        const pct = limitTotal > 0 ? Math.min((spentTotal / limitTotal) * 100, 100) : 0;
        const status = pct < 70 ? "safe" : pct < 100 ? "warning" : "danger";

        if (idx >= showCount) return; // Only show first few

        html += `<div class="budget-item">
            <div class="budget-header">
                <span class="budget-cat">${escHtml(b.category)}</span>
                <span class="budget-status ${status}">${pct.toFixed(0)}%</span>
            </div>
            <div class="budget-bar">
                <div class="budget-bar-fill ${status}" style="width:${pct}%"></div>
            </div>
            <div class="budget-detail">${formatUSD(spending.usd)} / ${formatUSD(b.usd || 0)} + ${formatCDF(spending.cdf)} / ${formatCDF(b.cdf || 0)}</div>
        </div>`;
    });

    if (remaining > 0) {
        html += `<div class="empty-state" style="padding:8px">+ ${remaining} autre(s) limite(s) - <a href="#" class="card-link" id="goto-limits">Voir tout</a></div>`;
    }

    list.innerHTML = html || '<div class="empty-state">Aucune limite definie</div>';

    const gotoLink = $("goto-limits");
    if (gotoLink) {
        gotoLink.addEventListener("click", (e) => {
            e.preventDefault();
            document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
            document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
            document.querySelector('[data-page="page-limites"]').classList.add("active");
            $("page-limites").classList.add("active");
        });
    }
}

// ============ DASHBOARD ============
function renderDashboard() {
    const recent = [...transactions].sort((a, b) => b.date.localeCompare(a.date) || 0).slice(0, 5);
    const list = $("recent-list");
    if (recent.length === 0) {
        list.innerHTML = '<div class="empty-state">Aucune transaction recente</div>';
    } else {
        list.innerHTML = recent.map(t => renderTransactionItem(t)).join("");
    }
    list.querySelectorAll(".transaction-delete").forEach(btn => {
        btn.addEventListener("click", () => deleteTransaction(btn.dataset.id));
    });
    initDashboardCharts();
    renderBudgetProgress();
}

function renderTransactionItem(t) {
    return `<div class="transaction-item ${t.type}">
        <div class="transaction-info">
            <div class="transaction-desc">${escHtml(t.description)}</div>
            <div class="transaction-meta">
                <span class="transaction-cat">${escHtml(t.category)}</span>
                <span>${t.date}</span>
            </div>
        </div>
        <div class="transaction-amounts">
            <div class="transaction-usd">${formatUSD(t.amount_usd)}</div>
            <div class="transaction-cdf">${formatCDF(t.amount_cdf)}</div>
        </div>
        <button class="transaction-delete" data-id="${t.client_id || t.id}">&times;</button>
    </div>`;
}

// ============ CHARTS ============
const CHART_COLORS = [
    "#1a73e8","#e8711a","#2e7d32","#c62828","#6a1b9a",
    "#00838f","#f9a825","#d81b60","#5d4037","#303f9f",
    "#00796b","#f57c00","#7b1fa2","#c2185b","#455a64"
];

function initDashboardCharts() {
    const year = parseInt($("chart-year")?.value) || new Date().getFullYear();
    buildMonthlyChart(year);
    buildCategoryChart();
    populateYearSelect();
}

function populateYearSelect() {
    const sel = $("chart-year");
    if (!sel) return;
    const years = new Set();
    transactions.forEach(t => { const y = t.date?.substring(0,4); if(y) years.add(parseInt(y)); });
    const currentYear = new Date().getFullYear();
    years.add(currentYear);
    const sorted = [...years].sort((a,b) => b-a);
    sel.innerHTML = sorted.map(y => `<option value="${y}" ${y===currentYear?"selected":""}>${y}</option>`).join("");
    sel.addEventListener("change", () => buildMonthlyChart(parseInt(sel.value)));
}

function buildMonthlyChart(year) {
    const ctx = $("monthlyChart");
    if (!ctx) return;
    if (charts.monthly) { charts.monthly.destroy(); }
    const months = Array.from({length:12}, (_,i) => i+1);
    const incomeData = months.map(m => {
        return transactions.filter(t => t.date && t.date.startsWith(year+"-") && t.date.substring(5,7)===String(m).padStart(2,"0") && t.type==="income")
            .reduce((s,t) => s+(t.amount_usd||0)+(t.amount_cdf||0)/3000, 0);
    });
    const expenseData = months.map(m => {
        return transactions.filter(t => t.date && t.date.startsWith(year+"-") && t.date.substring(5,7)===String(m).padStart(2,"0") && t.type==="expense")
            .reduce((s,t) => s+(t.amount_usd||0)+(t.amount_cdf||0)/3000, 0);
    });
    charts.monthly = new Chart(ctx, {
        type: "bar",
        data: {
            labels: months.map(getMonthName),
            datasets: [
                { label: "Revenus", data: incomeData, backgroundColor: "rgba(46,125,50,0.8)", borderRadius: 4 },
                { label: "Depenses", data: expenseData, backgroundColor: "rgba(198,40,40,0.8)", borderRadius: 4 },
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: true,
            plugins: { legend: { display: true, position: "top", labels: { boxWidth: 12, padding: 8, font: { size: 11 } } } },
            scales: { y: { beginAtZero: true, ticks: { font: { size: 10 }, callback: v => "$"+v.toFixed(0) } }, x: { ticks: { font: { size: 10 } } } }
        }
    });
}

function buildCategoryChart() {
    const ctx = $("categoryChart");
    if (!ctx) return;
    if (charts.category) { charts.category.destroy(); }
    const expenses = transactions.filter(t => t.type === "expense");
    const catMap = {};
    expenses.forEach(t => { const total = (t.amount_usd||0)+(t.amount_cdf||0)/3000; catMap[t.category] = (catMap[t.category]||0)+total; });
    const labels = Object.keys(catMap);
    const data = Object.values(catMap);
    const colors = labels.map((_,i) => CHART_COLORS[i%CHART_COLORS.length]);
    if (!labels.length) { charts.category = null; return; }
    charts.category = new Chart(ctx, {
        type: "doughnut",
        data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 2, borderColor: "#fff" }] },
        options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { position: "bottom", labels: { boxWidth: 10, padding: 6, font: { size: 10 } } } } }
    });
}

// ============ HISTORIQUE ============
function renderHistory() {
    const type = histFilterType.value;
    const cat = histFilterCategory.value;
    const search = (searchInput.value || "").toLowerCase();
    const dateFrom = filterDateFrom.value;
    const dateTo = filterDateTo.value;

    let filtered = [...transactions];
    if (type !== "all") filtered = filtered.filter(t => t.type === type);
    if (cat !== "all") filtered = filtered.filter(t => t.category === cat);
    if (search) filtered = filtered.filter(t => t.description.toLowerCase().includes(search));
    if (dateFrom) filtered = filtered.filter(t => t.date >= dateFrom);
    if (dateTo) filtered = filtered.filter(t => t.date <= dateTo);

    filtered.sort((a, b) => b.date.localeCompare(a.date) || (b.id||"").toString().localeCompare(a.id||""));
    transactionCount.textContent = filtered.length;

    const list = $("history-list");
    if (!filtered.length) {
        list.innerHTML = '<div class="empty-state">Aucune transaction trouvee</div>';
    } else {
        list.innerHTML = filtered.map(t => renderTransactionItem(t)).join("");
    }
    list.querySelectorAll(".transaction-delete").forEach(btn => {
        btn.addEventListener("click", () => deleteTransaction(btn.dataset.id));
    });

    const cats = new Set();
    transactions.forEach(t => cats.add(t.category));
    const sel = histFilterCategory;
    const current = sel.value;
    sel.innerHTML = '<option value="all">Toutes</option>';
    [...cats].sort().forEach(c => {
        const opt = document.createElement("option");
        opt.value = c; opt.textContent = c;
        if (c === current) opt.selected = true;
        sel.appendChild(opt);
    });
}

histFilterType.addEventListener("change", renderHistory);
histFilterCategory.addEventListener("change", renderHistory);
searchInput.addEventListener("input", renderHistory);
filterDateFrom.addEventListener("change", renderHistory);
filterDateTo.addEventListener("change", renderHistory);

// ============ DEPENSES ============
function renderExpenses() {
    renderExpenseBreakdown();
    renderExpenseTrend();
    renderTopExpenses();
    renderTodayExpenses();
}

function renderExpenseBreakdown() {
    const expenses = transactions.filter(t => t.type === "expense");
    const catMap = {};
    expenses.forEach(t => {
        const total = (t.amount_usd||0)+(t.amount_cdf||0)/3000;
        if (!catMap[t.category]) catMap[t.category] = { usd:0, cdf:0, total:0 };
        catMap[t.category].usd += t.amount_usd||0;
        catMap[t.category].cdf += t.amount_cdf||0;
        catMap[t.category].total += total;
    });
    const entries = Object.entries(catMap).sort((a,b) => b[1].total - a[1].total);
    const grandTotal = entries.reduce((s,[,v]) => s+v.total, 0);

    const ctx = $("expenseCategoryChart");
    if (ctx) {
        if (charts.expenseCategory) charts.expenseCategory.destroy();
        if (entries.length) {
            const labels = entries.map(([k]) => k);
            const data = entries.map(([,v]) => v.total);
            const colors = labels.map((_,i) => CHART_COLORS[i%CHART_COLORS.length]);
            charts.expenseCategory = new Chart(ctx, {
                type: "pie",
                data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 2, borderColor: "#fff" }] },
                options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { position: "bottom", labels: { boxWidth: 10, padding: 6, font: { size: 10 } } } } }
            });
        }
    }

    const list = $("expense-breakdown");
    if (!entries.length) {
        list.innerHTML = '<div class="empty-state">Aucune depense</div>';
    } else {
        list.innerHTML = entries.map(([cat, vals], i) => {
            const pct = grandTotal > 0 ? ((vals.total/grandTotal)*100).toFixed(1) : 0;
            return `<div class="breakdown-item">
                <div class="breakdown-color" style="background:${CHART_COLORS[i%CHART_COLORS.length]}"></div>
                <div class="breakdown-info">
                    <div class="breakdown-name">${escHtml(cat)}</div>
                    <div class="breakdown-pct">${pct}% des depenses</div>
                </div>
                <div class="breakdown-amount">
                    <div class="breakdown-usd">${formatUSD(vals.usd)}</div>
                    <div class="breakdown-cdf">${formatCDF(vals.cdf)}</div>
                </div>
            </div>`;
        }).join("");
    }
}

function renderExpenseTrend() {
    const period = $("expense-period")?.value || "monthly";
    const ctx = $("expenseTrendChart");
    if (!ctx) return;
    if (charts.expenseTrend) charts.expenseTrend.destroy();

    const now = new Date();
    let labels = [], data = [];

    if (period === "weekly") {
        const dayLabels = ["Dim","Lun","Mar","Mer","Jeu","Ven","Sam"];
        for (let i=6; i>=0; i--) {
            const d = new Date(now); d.setDate(d.getDate()-i);
            const dateStr = d.toISOString().split("T")[0];
            labels.push(dayLabels[d.getDay()]);
            data.push(transactions.filter(t => t.type==="expense" && t.date===dateStr).reduce((s,t) => s+(t.amount_usd||0)+(t.amount_cdf||0)/3000, 0));
        }
    } else if (period === "monthly") {
        const year = now.getFullYear(), month = now.getMonth()+1;
        const daysInMonth = new Date(year, month, 0).getDate();
        for (let d=1; d<=daysInMonth; d++) {
            const dateStr = year+"-"+String(month).padStart(2,"0")+"-"+String(d).padStart(2,"0");
            labels.push(String(d));
            data.push(transactions.filter(t => t.type==="expense" && t.date===dateStr).reduce((s,t) => s+(t.amount_usd||0)+(t.amount_cdf||0)/3000, 0));
        }
    } else {
        for (let m=0; m<12; m++) {
            labels.push(getMonthName(m+1));
            data.push(transactions.filter(t => t.type==="expense" && t.date && t.date.startsWith(now.getFullYear()+"-") && parseInt(t.date.substring(5,7))===m+1)
                .reduce((s,t) => s+(t.amount_usd||0)+(t.amount_cdf||0)/3000, 0));
        }
    }

    charts.expenseTrend = new Chart(ctx, {
        type: "line",
        data: { labels, datasets: [{ label: "Depenses", data, borderColor: "#c62828", backgroundColor: "rgba(198,40,40,0.1)", fill: true, tension: 0.4, pointRadius: 3, pointBackgroundColor: "#c62828" }] },
        options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { font: { size: 10 }, callback: v => "$"+v.toFixed(0) } }, x: { ticks: { font: { size: 9 }, maxTicksLimit: 15 } } } }
    });
}

$("expense-period")?.addEventListener("change", renderExpenseTrend);

function renderTopExpenses() {
    const top = [...transactions].filter(t => t.type==="expense").sort((a,b) => ((b.amount_usd||0)+(b.amount_cdf||0)/3000) - ((a.amount_usd||0)+(a.amount_cdf||0)/3000)).slice(0,10);
    const list = $("top-expenses-list");
    if (!top.length) { list.innerHTML = '<div class="empty-state">Aucune depense</div>'; return; }
    list.innerHTML = top.map((t,i) => `<div class="transaction-item expense">
        <div class="transaction-info">
            <div class="transaction-desc">${i+1}. ${escHtml(t.description)}</div>
            <div class="transaction-meta"><span class="transaction-cat">${escHtml(t.category)}</span><span>${t.date}</span></div>
        </div>
        <div class="transaction-amounts"><div class="transaction-usd">${formatUSD(t.amount_usd)}</div><div class="transaction-cdf">${formatCDF(t.amount_cdf)}</div></div>
    </div>`).join("");
}

function renderTodayExpenses() {
    const todayStr = today();
    const todayTx = transactions.filter(t => t.type==="expense" && t.date===todayStr);
    const list = $("today-expenses");
    if (!todayTx.length) { list.innerHTML = "<div class=\"empty-state\">Aucune depense aujourd'hui</div>"; return; }
    list.innerHTML = todayTx.map(t => renderTransactionItem(t)).join("");
    list.querySelectorAll(".transaction-delete").forEach(btn => { btn.addEventListener("click", () => deleteTransaction(btn.dataset.id)); });
}

// ============ INSIGHTS ============
function renderInsights() {
    renderMonthSummary();
    renderMonthComparison();
    renderRecommendations();
    renderTips();
}

function renderMonthSummary() {
    const ym = currentMonth();
    const monthTx = transactions.filter(t => t.date && t.date.startsWith(ym));
    let iu=0, ic=0, eu=0, ec=0;
    monthTx.forEach(t => { if(t.type==="income"){iu+=t.amount_usd||0;ic+=t.amount_cdf||0;}else{eu+=t.amount_usd||0;ec+=t.amount_cdf||0;} });
    const incomeTotal = iu+ic/3000, expenseTotal = eu+ec/3000, balance = incomeTotal-expenseTotal;
    const savingsRate = incomeTotal > 0 ? ((balance/incomeTotal)*100).toFixed(1) : 0;
    $("month-summary").innerHTML = `
        <div class="insight-item"><span class="insight-label">Revenus</span><span class="insight-value" style="color:var(--income)">${formatUSD(iu)}</span><span class="insight-sub">${formatCDF(ic)}</span></div>
        <div class="insight-item"><span class="insight-label">Depenses</span><span class="insight-value" style="color:var(--expense)">${formatUSD(eu)}</span><span class="insight-sub">${formatCDF(ec)}</span></div>
        <div class="insight-item"><span class="insight-label">Solde</span><span class="insight-value" style="color:${balance>=0?"var(--income)":"var(--expense)"}">${formatUSD(Math.abs(balance))}</span><span class="insight-sub">${balance>=0?"Excedent":"Deficit"}</span></div>
        <div class="insight-item"><span class="insight-label">Epargne</span><span class="insight-value" style="color:${savingsRate>=0?"var(--income)":"var(--expense)"}">${savingsRate}%</span><span class="insight-sub">du revenu</span></div>`;
}

function renderMonthComparison() {
    const now = new Date();
    const ym = currentMonth();
    const prevDate = new Date(now.getFullYear(), now.getMonth()-1, 1);
    const prevYm = prevDate.getFullYear()+"-"+String(prevDate.getMonth()+1).padStart(2,"0");
    const calc = (txs) => { let u=0,c=0; txs.forEach(t=>{u+=t.amount_usd||0;c+=t.amount_cdf||0;}); return {usd:u, cdf:c, total:u+c/3000}; };
    const curIncome = calc(transactions.filter(t=>t.date?.startsWith(ym)&&t.type==="income"));
    const curExpense = calc(transactions.filter(t=>t.date?.startsWith(ym)&&t.type==="expense"));
    const prevIncome = calc(transactions.filter(t=>t.date?.startsWith(prevYm)&&t.type==="income"));
    const prevExpense = calc(transactions.filter(t=>t.date?.startsWith(prevYm)&&t.type==="expense"));
    const incomeChange = prevIncome.total>0 ? (((curIncome.total-prevIncome.total)/prevIncome.total)*100).toFixed(1) : 0;
    const expenseChange = prevExpense.total>0 ? (((curExpense.total-prevExpense.total)/prevExpense.total)*100).toFixed(1) : 0;
    $("month-comparison").innerHTML = `
        <div class="comp-item"><span class="comp-label">Revenus</span><span class="comp-value" style="color:var(--income)">${formatUSD(curIncome.usd)}</span><span class="comp-change ${incomeChange>=0?"positive":"negative"}">${incomeChange>=0?"+":""}${incomeChange}%</span></div>
        <div class="comp-item"><span class="comp-label">Depenses</span><span class="comp-value" style="color:var(--expense)">${formatUSD(curExpense.usd)}</span><span class="comp-change ${expenseChange<=0?"positive":"negative"}">${expenseChange>=0?"+":""}${expenseChange}%</span></div>`;
}

function renderRecommendations() {
    const recs = [];
    const expenses = transactions.filter(t=>t.type==="expense");
    const incomes = transactions.filter(t=>t.type==="income");
    const totalIncome = incomes.reduce((s,t)=>s+(t.amount_usd||0)+(t.amount_cdf||0)/3000, 0);
    const totalExpense = expenses.reduce((s,t)=>s+(t.amount_usd||0)+(t.amount_cdf||0)/3000, 0);
    if (totalIncome > 0 && (totalExpense/totalIncome) > 0.8) {
        recs.push({ icon: "\u26A0", text: "Vos depenses representent <strong>" + (totalExpense/totalIncome*100).toFixed(0) + "%</strong> de vos revenus. Essayez de reduire vos depenses." });
    }
    const catMap = {};
    expenses.forEach(t => { const total = (t.amount_usd||0)+(t.amount_cdf||0)/3000; catMap[t.category] = (catMap[t.category]||0)+total; });
    const topCat = Object.entries(catMap).sort((a,b)=>b[1]-a[1])[0];
    if (topCat && topCat[1] > 0) {
        const pct = totalExpense > 0 ? ((topCat[1]/totalExpense)*100).toFixed(0) : 0;
        recs.push({ icon: "\uD83D\uDCA1", text: "La categorie <strong>"+topCat[0]+"</strong> represente "+pct+"% de vos depenses." });
    }

    // Budget alerts
    budgets.forEach(b => {
        const spending = getMonthSpending(b.category);
        const spentTotal = (spending.usd||0)+(spending.cdf||0)/3000;
        const limitTotal = (b.usd||0)+(b.cdf||0)/3000;
        if (limitTotal > 0 && spentTotal > limitTotal) {
            recs.push({ icon: "\u26A0", text: "Limite depassee pour <strong>"+b.category+"</strong> ! Budget: "+formatUSD(b.usd)+" / Depense: "+formatUSD(spending.usd) });
        } else if (limitTotal > 0 && spentTotal/limitTotal > 0.8) {
            recs.push({ icon: "\uD83D\uDD14", text: "Vous approchez de la limite pour <strong>"+b.category+"</strong> ("+(spentTotal/limitTotal*100).toFixed(0)+"%)." });
        }
    });

    if (!transactions.length) {
        recs.push({ icon: "\uD83D\uDCCB", text: "Commencez a ajouter vos transactions pour obtenir des recommandations personnalisees." });
    } else {
        recs.push({ icon: "\uD83D\uDCC8", text: "Ajoutez regulierement vos transactions pour un suivi precis de vos finances." });
    }
    if (!totalExpense && totalIncome > 0) {
        recs.push({ icon: "\uD83C\uDF81", text: "Bravo ! Vous n'avez aucune depense. Pensez a investir votre epargne." });
    }
    const list = $("recommendations-list");
    if (!recs.length) { list.innerHTML = '<div class="empty-state">Ajoutez des transactions pour voir des recommandations</div>'; return; }
    list.innerHTML = recs.map(r => `<div class="rec-item"><span class="rec-icon">${r.icon}</span><span class="rec-text">${r.text}</span></div>`).join("");
}

function renderTips() {
    const tips = [
        { icon: "\uD83D\uDCB0", text: "Utilisez la regle 50/30/20 : 50% pour les besoins, 30% pour les loisirs, 20% pour l'epargne." },
        { icon: "\uD83D\uDCC5", text: "Planifiez vos depenses mensuelles a l'avance pour eviter les mauvaises surprises." },
        { icon: "\uD83C\uDFE0", text: "Separez vos comptes USD et FC pour mieux suivre votre budget dans chaque devise." },
        { icon: "\uD83D\uDCBC", text: "En periode d'inflation, privilegiez les depenses en FC pour les achats locaux." },
        { icon: "\uD83C\uDFE6", text: "Constituez un fonds d'urgence de 3 a 6 mois de depenses." },
        { icon: "\uD83D\uDCB5", text: "Limitez les depenses non essentielles a 30% de vos revenus." },
    ];
    $("tips-list").innerHTML = tips.map(t => `<div class="tip-item"><span class="tip-icon">${t.icon}</span><span class="tip-text">${t.text}</span></div>`).join("");
}

// ============ LIMITES ============
function renderLimits() {
    const list = $("limits-list");
    if (!budgets.length) {
        list.innerHTML = '<div class="empty-state">Aucune limite definie. Cliquez sur "+ Ajouter" pour definir une limite mensuelle.</div>';
    } else {
        list.innerHTML = budgets.map((b, i) => {
            const spending = getMonthSpending(b.category);
            const spentTotal = (spending.usd||0)+(spending.cdf||0)/3000;
            const limitTotal = (b.usd||0)+(b.cdf||0)/3000;
            const pct = limitTotal > 0 ? ((spentTotal/limitTotal)*100).toFixed(0) : 0;
            const status = pct < 70 ? "safe" : pct < 100 ? "warning" : "danger";
            const statusLabel = pct < 70 ? "" : pct < 100 ? "Limite bientot atteinte" : "Limite depassee !";
            return `<div class="limit-item">
                <div class="limit-info">
                    <div class="limit-cat">${escHtml(b.category)}</div>
                    <div class="limit-amount">Limite: ${formatUSD(b.usd||0)} + ${formatCDF(b.cdf||0)}</div>
                    <div class="limit-amount" style="color:${status==="danger"?"var(--expense)":status==="warning"?"var(--warning)":"var(--income)"}">
                        Depense: ${formatUSD(spending.usd)} + ${formatCDF(spending.cdf)} (${pct}%) ${statusLabel ? " - "+statusLabel : ""}
                    </div>
                </div>
                <div class="limit-actions">
                    <button class="limit-edit" data-index="${i}">&#x270E;</button>
                    <button class="limit-delete" data-index="${i}">&times;</button>
                </div>
            </div>`;
        }).join("");
    }

    list.querySelectorAll(".limit-edit").forEach(btn => {
        btn.addEventListener("click", () => {
            const idx = parseInt(btn.dataset.index);
            const b = budgets[idx];
            $("limit-modal-title").textContent = "Modifier la limite";
            $("limit-category").value = b.category;
            $("limit-usd").value = b.usd || "";
            $("limit-cdf").value = b.cdf || "";
            $("limit-form").dataset.editIndex = idx;
            $("limit-modal").classList.remove("hidden");
        });
    });

    list.querySelectorAll(".limit-delete").forEach(btn => {
        btn.addEventListener("click", () => {
            const idx = parseInt(btn.dataset.index);
            if (confirm("Supprimer cette limite ?")) {
                budgets.splice(idx, 1);
                saveLocal();
                renderLimits();
                renderBudgetProgress();
                showToast("Limite supprimee");
            }
        });
    });
}

// Add limit button
$("add-limit-btn")?.addEventListener("click", () => {
    $("limit-modal-title").textContent = "Ajouter une limite";
    $("limit-form").reset();
    delete $("limit-form").dataset.editIndex;
    $("limit-modal").classList.remove("hidden");
});

$("limit-modal-close")?.addEventListener("click", () => $("limit-modal").classList.add("hidden"));

$("limit-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const category = $("limit-category").value;
    const usd = parseFloat($("limit-usd").value) || 0;
    const cdf = parseFloat($("limit-cdf").value) || 0;
    if (!usd && !cdf) { showToast("Entrez au moins un montant"); return; }

    const editIndex = $("limit-form").dataset.editIndex;
    if (editIndex !== undefined) {
        budgets[parseInt(editIndex)] = { category, usd, cdf };
    } else {
        budgets.push({ category, usd, cdf });
    }
    saveLocal();
    $("limit-modal").classList.add("hidden");
    renderLimits();
    renderBudgetProgress();
    showToast(editIndex !== undefined ? "Limite modifiee" : "Limite ajoutee");
});

// ============ FORM SUBMIT ============
form.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = {
        type: typeInput.value,
        amount_usd: $("amount-usd").value || 0,
        amount_cdf: $("amount-cdf").value || 0,
        description: $("description").value,
        category: $("category").value,
        date: $("date").value,
    };
    if (!data.description) { showToast("Description requise"); return; }
    if (parseFloat(data.amount_usd) === 0 && parseFloat(data.amount_cdf) === 0) { showToast("Entrez un montant"); return; }
    addTransaction(data);
    form.reset();
    dateInput.valueAsDate = new Date();
    typeInput.value = "income";
    typeIncome.classList.add("active");
    typeExpense.classList.remove("active");
    showToast("Transaction ajoutee");
});

// ============ INIT ============
async function init() {
    loadLocal();
    updateStatus();
    // Check if already logged in via session
    try {
        const res = await fetch("/api/auth/me");
        if (res.ok) {
            const data = await res.json();
            if (data.user) {
                currentUser = data.user;
                localStorage.setItem("makuta_user", JSON.stringify(data.user));
                unlockApp();
                await loadFromServer();
                fullRender();
                handleUrlParams();
                return;
            }
        }
    } catch (e) {}

    // Fallback: check localStorage for offline user
    const saved = localStorage.getItem("makuta_user");
    if (saved) {
        try {
            currentUser = JSON.parse(saved);
            unlockApp();
            fullRender();
            handleUrlParams();
            return;
        } catch (e) {}
    }

    // Show auth screen
    initAuth();
    fullRender();
}

// ============ URL PARAMS (shortcuts) ============
function handleUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const action = params.get("action");
    const page = params.get("page");

    if (action === "income") {
        // Open dashboard and preselect income
        typeIncome.click();
        typeInput.value = "income";
        form.classList.remove("closed");
        quickAddArrow.classList.remove("closed");
        $("amount-usd").focus();
    } else if (action === "expense") {
        typeExpense.click();
        typeInput.value = "expense";
        form.classList.remove("closed");
        quickAddArrow.classList.remove("closed");
        $("amount-usd").focus();
    } else if (page === "depenses") {
        document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
        document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
        document.querySelector('[data-page="page-depenses"]')?.classList.add("active");
        $("page-depenses")?.classList.add("active");
    } else if (page === "historique") {
        document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
        document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
        document.querySelector('[data-page="page-historique"]')?.classList.add("active");
        $("page-historique")?.classList.add("active");
    } else if (page === "insights") {
        document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
        document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
        document.querySelector('[data-page="page-insights"]')?.classList.add("active");
        $("page-insights")?.classList.add("active");
    }

    // Clean URL
    if (params.toString()) {
        window.history.replaceState({}, "", window.location.pathname);
    }
}

init();
