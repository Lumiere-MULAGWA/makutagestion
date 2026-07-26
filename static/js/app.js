// ============ STATE ============
let transactions = [];
let online = navigator.onLine;
let deferredPrompt = null;
let charts = {};

// ============ DOM REFS ============
const $ = (id) => document.getElementById(id);
const form = $('transaction-form');
const typeIncome = $('type-income');
const typeExpense = $('type-expense');
const typeInput = $('type-input');
const offlineBadge = $('offline-badge');
const onlineBadge = $('online-badge');
const installBanner = $('install-banner');
const installBtn = $('install-btn');
const dismissInstall = $('dismiss-install');
const dateInput = $('date');
const searchInput = $('search-input');
const histFilterType = $('hist-filter-type');
const histFilterCategory = $('hist-filter-category');
const filterDateFrom = $('filter-date-from');
const filterDateTo = $('filter-date-to');
const transactionCount = $('transaction-count');
const quickAddToggle = $('quick-add-toggle');
const quickAddArrow = $('quick-add-arrow');
const modal = $('modal');
const modalClose = $('modal-close');
const modalTitle = $('modal-title');
const modalBody = $('modal-body');

// ============ INIT ============
dateInput.valueAsDate = new Date();

// ============ HELPERS ============
function formatUSD(n) {
    return '$' + Number(n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatCDF(n) {
    return Number(n || 0).toLocaleString('fr-FR') + ' FC';
}

function escHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
}

function showToast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.add('hidden'), 3000);
}

function genId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

function today() {
    return new Date().toISOString().split('T')[0];
}

function currentMonth() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

// ============ ONLINE/OFFLINE ============
function updateStatus() {
    online = navigator.onLine;
    offlineBadge.classList.toggle('hidden', online);
    onlineBadge.classList.toggle('hidden', !online);
    const syncEl = $('sync-status');
    syncEl.textContent = online ? '\u2601' : '\u26A0';
    syncEl.style.color = online ? '' : '#ff6f00';
    if (online) syncWithServer();
}

window.addEventListener('online', updateStatus);
window.addEventListener('offline', updateStatus);

// ============ PWA INSTALL ============
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    installBanner.classList.remove('hidden');
});

installBtn.addEventListener('click', async () => {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        const result = await deferredPrompt.userChoice;
        if (result.outcome === 'accepted') installBanner.classList.add('hidden');
        deferredPrompt = null;
    }
});

dismissInstall.addEventListener('click', () => installBanner.classList.add('hidden'));

// ============ TYPE TOGGLE ============
typeIncome.addEventListener('click', () => {
    typeIncome.classList.add('active');
    typeExpense.classList.remove('active');
    typeInput.value = 'income';
});

typeExpense.addEventListener('click', () => {
    typeExpense.classList.add('active');
    typeIncome.classList.remove('active');
    typeInput.value = 'expense';
});

// ============ NAVIGATION ============
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        item.classList.add('active');
        const page = $(item.dataset.page);
        page.classList.add('active');
        // Resize charts when switching to dashboard or depenses
        if (item.dataset.page === 'page-dashboard') {
            setTimeout(() => { Object.values(charts).forEach(c => { try { c.resize(); } catch(e) {} }); }, 100);
        }
        if (item.dataset.page === 'page-depenses') {
            setTimeout(() => { try { charts.expenseCategory?.resize(); charts.expenseTrend?.resize(); } catch(e) {} }, 100);
        }
    });
});

// ============ QUICK ADD TOGGLE ============
quickAddToggle.addEventListener('click', () => {
    form.classList.toggle('closed');
    quickAddArrow.classList.toggle('closed');
});

// ============ LOCAL STORAGE ============
function loadLocal() {
    try {
        const data = localStorage.getItem('makuta_transactions');
        if (data) transactions = JSON.parse(data);
    } catch (e) { transactions = []; }
}

function saveLocal() {
    localStorage.setItem('makuta_transactions', JSON.stringify(transactions));
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
        category: data.category || 'Autre',
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
    if (!confirm('Supprimer cette transaction ?')) return;
    transactions = transactions.filter(t => t.client_id !== clientId && t.id != clientId);
    saveLocal();
    fullRender();
    if (online) {
        try {
            await fetch('/api/transactions/' + clientId, { method: 'DELETE' });
        } catch (e) {}
    }
    showToast('Transaction supprimee');
}

// ============ SYNC ============
async function syncWithServer() {
    if (!online) return;
    const unsynced = transactions.filter(t => !t.synced && !t.id);
    if (unsynced.length === 0) return;
    try {
        const res = await fetch('/api/transactions/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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
    } catch (e) { console.log('Sync failed'); }
}

async function loadFromServer() {
    if (!online) return;
    try {
        const res = await fetch('/api/transactions');
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
    } catch (e) { console.log('Load from server failed'); }
}

// ============ FULL RENDER ============
function fullRender() {
    renderDashboard();
    renderHistory();
    renderExpenses();
    renderInsights();
    updateSummary();
}

function updateSummary() {
    let incomeUSD = 0, incomeCDF = 0, expenseUSD = 0, expenseCDF = 0;
    transactions.forEach(t => {
        if (t.type === 'income') {
            incomeUSD += Number(t.amount_usd || 0);
            incomeCDF += Number(t.amount_cdf || 0);
        } else {
            expenseUSD += Number(t.amount_usd || 0);
            expenseCDF += Number(t.amount_cdf || 0);
        }
    });
    $('total-income-usd').textContent = formatUSD(incomeUSD);
    $('total-income-cdf').textContent = formatCDF(incomeCDF);
    $('total-expense-usd').textContent = formatUSD(expenseUSD);
    $('total-expense-cdf').textContent = formatCDF(expenseCDF);
    $('balance-usd').textContent = formatUSD(incomeUSD - expenseUSD);
    $('balance-cdf').textContent = formatCDF(incomeCDF - expenseCDF);
}

// ============ DASHBOARD ============
function renderDashboard() {
    // Recent transactions (last 5)
    const recent = [...transactions].sort((a, b) => b.date.localeCompare(a.date) || 0).slice(0, 5);
    const list = $('recent-list');
    if (recent.length === 0) {
        list.innerHTML = '<div class="empty-state">Aucune transaction recente</div>';
    } else {
        list.innerHTML = recent.map(t => renderTransactionItem(t)).join('');
    }
    list.querySelectorAll('.transaction-delete').forEach(btn => {
        btn.addEventListener('click', () => deleteTransaction(btn.dataset.id));
    });

    // Charts
    initDashboardCharts();
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
    '#1a73e8', '#e8711a', '#2e7d32', '#c62828', '#6a1b9a',
    '#00838f', '#f9a825', '#d81b60', '#5d4037', '#303f9f',
    '#00796b', '#f57c00', '#7b1fa2', '#c2185b', '#455a64'
];

function getMonthName(m) {
    const names = ['Jan', 'Fev', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aou', 'Sep', 'Oct', 'Nov', 'Dec'];
    return names[m - 1] || m;
}

function initDashboardCharts() {
    const year = parseInt($('chart-year')?.value) || new Date().getFullYear();
    buildMonthlyChart(year);
    buildCategoryChart();
    populateYearSelect();
}

function populateYearSelect() {
    const sel = $('chart-year');
    if (!sel) return;
    const years = new Set();
    transactions.forEach(t => {
        const y = t.date?.substring(0, 4);
        if (y) years.add(parseInt(y));
    });
    const currentYear = new Date().getFullYear();
    years.add(currentYear);
    const sorted = [...years].sort((a, b) => b - a);
    sel.innerHTML = sorted.map(y => `<option value="${y}" ${y === currentYear ? 'selected' : ''}>${y}</option>`).join('');
    sel.addEventListener('change', () => buildMonthlyChart(parseInt(sel.value)));
}

function buildMonthlyChart(year) {
    const ctx = $('monthlyChart');
    if (!ctx) return;
    if (charts.monthly) { charts.monthly.destroy(); }

    const months = Array.from({length: 12}, (_, i) => i + 1);
    const incomeData = months.map(m => {
        return transactions.filter(t => {
            const d = t.date;
            return d && d.startsWith(year + '-') && d.substring(5, 7) == String(m).padStart(2, '0') && t.type === 'income';
        }).reduce((s, t) => s + (t.amount_usd || 0) + (t.amount_cdf || 0) / 3000, 0);
    });
    const expenseData = months.map(m => {
        return transactions.filter(t => {
            const d = t.date;
            return d && d.startsWith(year + '-') && d.substring(5, 7) == String(m).padStart(2, '0') && t.type === 'expense';
        }).reduce((s, t) => s + (t.amount_usd || 0) + (t.amount_cdf || 0) / 3000, 0);
    });

    charts.monthly = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: months.map(getMonthName),
            datasets: [
                { label: 'Revenus', data: incomeData, backgroundColor: 'rgba(46,125,50,0.8)', borderRadius: 4 },
                { label: 'Depenses', data: expenseData, backgroundColor: 'rgba(198,40,40,0.8)', borderRadius: 4 },
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: { legend: { display: true, position: 'top', labels: { boxWidth: 12, padding: 8, font: { size: 11 } } } },
            scales: {
                y: { beginAtZero: true, ticks: { font: { size: 10 }, callback: v => '$' + v.toFixed(0) } },
                x: { ticks: { font: { size: 10 } } }
            }
        }
    });
}

function buildCategoryChart() {
    const ctx = $('categoryChart');
    if (!ctx) return;
    if (charts.category) { charts.category.destroy(); }

    const expenses = transactions.filter(t => t.type === 'expense');
    const catMap = {};
    expenses.forEach(t => {
        const total = (t.amount_usd || 0) + (t.amount_cdf || 0) / 3000;
        catMap[t.category] = (catMap[t.category] || 0) + total;
    });

    const labels = Object.keys(catMap);
    const data = Object.values(catMap);
    const colors = labels.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]);

    if (labels.length === 0) {
        charts.category = null;
        return;
    }

    charts.category = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{ data, backgroundColor: colors, borderWidth: 2, borderColor: '#fff' }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { position: 'bottom', labels: { boxWidth: 10, padding: 6, font: { size: 10 } } }
            }
        }
    });
}

// ============ HISTORIQUE ============
function renderHistory() {
    const type = histFilterType.value;
    const cat = histFilterCategory.value;
    const search = (searchInput.value || '').toLowerCase();
    const dateFrom = filterDateFrom.value;
    const dateTo = filterDateTo.value;

    let filtered = [...transactions];
    if (type !== 'all') filtered = filtered.filter(t => t.type === type);
    if (cat !== 'all') filtered = filtered.filter(t => t.category === cat);
    if (search) filtered = filtered.filter(t => t.description.toLowerCase().includes(search));
    if (dateFrom) filtered = filtered.filter(t => t.date >= dateFrom);
    if (dateTo) filtered = filtered.filter(t => t.date <= dateTo);

    filtered.sort((a, b) => b.date.localeCompare(a.date) || (b.id || '').toString().localeCompare(a.id || ''));

    transactionCount.textContent = filtered.length;

    const list = $('history-list');
    if (filtered.length === 0) {
        list.innerHTML = '<div class="empty-state">Aucune transaction trouvee</div>';
    } else {
        list.innerHTML = filtered.map(t => renderTransactionItem(t)).join('');
    }
    list.querySelectorAll('.transaction-delete').forEach(btn => {
        btn.addEventListener('click', () => deleteTransaction(btn.dataset.id));
    });

    // Populate category filter
    const cats = new Set();
    transactions.forEach(t => cats.add(t.category));
    const sel = histFilterCategory;
    const current = sel.value;
    sel.innerHTML = '<option value="all">Toutes</option>';
    [...cats].sort().forEach(c => {
        const opt = document.createElement('option');
        opt.value = c; opt.textContent = c;
        if (c === current) opt.selected = true;
        sel.appendChild(opt);
    });
}

// History filters
histFilterType.addEventListener('change', renderHistory);
histFilterCategory.addEventListener('change', renderHistory);
searchInput.addEventListener('input', renderHistory);
filterDateFrom.addEventListener('change', renderHistory);
filterDateTo.addEventListener('change', renderHistory);

// ============ DEPENSES ============
function renderExpenses() {
    renderExpenseBreakdown();
    renderExpenseTrend();
    renderTopExpenses();
    renderTodayExpenses();
}

function renderExpenseBreakdown() {
    const expenses = transactions.filter(t => t.type === 'expense');
    const catMap = {};
    expenses.forEach(t => {
        const total = (t.amount_usd || 0) + (t.amount_cdf || 0) / 3000;
        if (!catMap[t.category]) catMap[t.category] = { usd: 0, cdf: 0, total: 0 };
        catMap[t.category].usd += t.amount_usd || 0;
        catMap[t.category].cdf += t.amount_cdf || 0;
        catMap[t.category].total += total;
    });

    const entries = Object.entries(catMap).sort((a, b) => b[1].total - a[1].total);
    const grandTotal = entries.reduce((s, [, v]) => s + v.total, 0);

    // Chart
    const ctx = $('expenseCategoryChart');
    if (ctx) {
        if (charts.expenseCategory) charts.expenseCategory.destroy();
        if (entries.length > 0) {
            const labels = entries.map(([k]) => k);
            const data = entries.map(([, v]) => v.total);
            const colors = labels.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]);
            charts.expenseCategory = new Chart(ctx, {
                type: 'pie',
                data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 2, borderColor: '#fff' }] },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, padding: 6, font: { size: 10 } } } }
                }
            });
        }
    }

    // Breakdown list
    const list = $('expense-breakdown');
    if (entries.length === 0) {
        list.innerHTML = '<div class="empty-state">Aucune depense</div>';
    } else {
        list.innerHTML = entries.map(([cat, vals], i) => {
            const pct = grandTotal > 0 ? ((vals.total / grandTotal) * 100).toFixed(1) : 0;
            return `<div class="breakdown-item">
                <div class="breakdown-color" style="background:${CHART_COLORS[i % CHART_COLORS.length]}"></div>
                <div class="breakdown-info">
                    <div class="breakdown-name">${escHtml(cat)}</div>
                    <div class="breakdown-pct">${pct}% des depenses</div>
                </div>
                <div class="breakdown-amount">
                    <div class="breakdown-usd">${formatUSD(vals.usd)}</div>
                    <div class="breakdown-cdf">${formatCDF(vals.cdf)}</div>
                </div>
            </div>`;
        }).join('');
    }
}

function renderExpenseTrend() {
    const period = $('expense-period')?.value || 'monthly';
    const ctx = $('expenseTrendChart');
    if (!ctx) return;
    if (charts.expenseTrend) charts.expenseTrend.destroy();

    const now = new Date();
    let labels = [];
    let data = [];

    if (period === 'weekly') {
        // Last 7 days
        for (let i = 6; i >= 0; i--) {
            const d = new Date(now);
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            const dayLabels = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
            labels.push(dayLabels[d.getDay()]);
            const total = transactions.filter(t => t.type === 'expense' && t.date === dateStr)
                .reduce((s, t) => s + (t.amount_usd || 0) + (t.amount_cdf || 0) / 3000, 0);
            data.push(total);
        }
    } else if (period === 'monthly') {
        const year = now.getFullYear();
        const month = now.getMonth() + 1;
        const daysInMonth = new Date(year, month, 0).getDate();
        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = year + '-' + String(month).padStart(2, '0') + '-' + String(d).padStart(2, '0');
            labels.push(String(d));
            const total = transactions.filter(t => t.type === 'expense' && t.date === dateStr)
                .reduce((s, t) => s + (t.amount_usd || 0) + (t.amount_cdf || 0) / 3000, 0);
            data.push(total);
        }
    } else {
        // Yearly
        for (let m = 0; m < 12; m++) {
            labels.push(getMonthName(m + 1));
            const total = transactions.filter(t => {
                const d = t.date;
                return t.type === 'expense' && d && d.startsWith(now.getFullYear() + '-') && parseInt(d.substring(5, 7)) === m + 1;
            }).reduce((s, t) => s + (t.amount_usd || 0) + (t.amount_cdf || 0) / 3000, 0);
            data.push(total);
        }
    }

    charts.expenseTrend = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Depenses',
                data,
                borderColor: '#c62828',
                backgroundColor: 'rgba(198,40,40,0.1)',
                fill: true,
                tension: 0.4,
                pointRadius: 3,
                pointBackgroundColor: '#c62828',
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, ticks: { font: { size: 10 }, callback: v => '$' + v.toFixed(0) } },
                x: { ticks: { font: { size: 9 }, maxTicksLimit: 15 } }
            }
        }
    });
}

$('expense-period')?.addEventListener('change', renderExpenseTrend);

function renderTopExpenses() {
    const top = [...transactions]
        .filter(t => t.type === 'expense')
        .sort((a, b) => {
            const aTotal = (a.amount_usd || 0) + (a.amount_cdf || 0) / 3000;
            const bTotal = (b.amount_usd || 0) + (b.amount_cdf || 0) / 3000;
            return bTotal - aTotal;
        })
        .slice(0, 10);

    const list = $('top-expenses-list');
    if (top.length === 0) {
        list.innerHTML = '<div class="empty-state">Aucune depense</div>';
    } else {
        list.innerHTML = top.map((t, i) => `<div class="transaction-item expense">
            <div class="transaction-info">
                <div class="transaction-desc">${i + 1}. ${escHtml(t.description)}</div>
                <div class="transaction-meta">
                    <span class="transaction-cat">${escHtml(t.category)}</span>
                    <span>${t.date}</span>
                </div>
            </div>
            <div class="transaction-amounts">
                <div class="transaction-usd">${formatUSD(t.amount_usd)}</div>
                <div class="transaction-cdf">${formatCDF(t.amount_cdf)}</div>
            </div>
        </div>`).join('');
    }
}

function renderTodayExpenses() {
    const todayStr = today();
    const todayTx = transactions.filter(t => t.type === 'expense' && t.date === todayStr);
    const list = $('today-expenses');
    if (todayTx.length === 0) {
        list.innerHTML = "<div class=\"empty-state\">Aucune depense aujourd'hui</div>";
    } else {
        list.innerHTML = todayTx.map(t => renderTransactionItem(t)).join('');
        list.querySelectorAll('.transaction-delete').forEach(btn => {
            btn.addEventListener('click', () => deleteTransaction(btn.dataset.id));
        });
    }
}

// ============ INSIGHTS ============
function renderInsights() {
    renderMonthSummary();
    renderMonthComparison();
    renderRecommendations();
    renderTips();
}

function renderMonthSummary() {
    const now = new Date();
    const ym = currentMonth();
    const monthTx = transactions.filter(t => t.date && t.date.startsWith(ym));

    let incomeUSD = 0, incomeCDF = 0, expenseUSD = 0, expenseCDF = 0;
    monthTx.forEach(t => {
        if (t.type === 'income') {
            incomeUSD += t.amount_usd || 0;
            incomeCDF += t.amount_cdf || 0;
        } else {
            expenseUSD += t.amount_usd || 0;
            expenseCDF += t.amount_cdf || 0;
        }
    });

    const incomeTotal = incomeUSD + incomeCDF / 3000;
    const expenseTotal = expenseUSD + expenseCDF / 3000;
    const balance = incomeTotal - expenseTotal;
    const savingsRate = incomeTotal > 0 ? ((balance / incomeTotal) * 100).toFixed(1) : 0;

    $('month-summary').innerHTML = `
        <div class="insight-item">
            <span class="insight-label">Revenus</span>
            <span class="insight-value" style="color:var(--income)">${formatUSD(incomeUSD)}</span>
            <span class="insight-sub">${formatCDF(incomeCDF)}</span>
        </div>
        <div class="insight-item">
            <span class="insight-label">Depenses</span>
            <span class="insight-value" style="color:var(--expense)">${formatUSD(expenseUSD)}</span>
            <span class="insight-sub">${formatCDF(expenseCDF)}</span>
        </div>
        <div class="insight-item">
            <span class="insight-label">Solde</span>
            <span class="insight-value" style="color:${balance >= 0 ? 'var(--income)' : 'var(--expense)'}">${formatUSD(Math.abs(balance))}</span>
            <span class="insight-sub">${balance >= 0 ? 'Excédent' : 'Déficit'}</span>
        </div>
        <div class="insight-item">
            <span class="insight-label">Epargne</span>
            <span class="insight-value" style="color:${savingsRate >= 0 ? 'var(--income)' : 'var(--expense)'}">${savingsRate}%</span>
            <span class="insight-sub">du revenu</span>
        </div>
    `;
}

function renderMonthComparison() {
    const now = new Date();
    const ym = currentMonth();
    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevYm = prevDate.getFullYear() + '-' + String(prevDate.getMonth() + 1).padStart(2, '0');

    const calc = (txs) => {
        let u = 0, c = 0;
        txs.forEach(t => { u += t.amount_usd || 0; c += t.amount_cdf || 0; });
        return { usd: u, cdf: c, total: u + c / 3000 };
    };

    const curIncome = calc(transactions.filter(t => t.date?.startsWith(ym) && t.type === 'income'));
    const curExpense = calc(transactions.filter(t => t.date?.startsWith(ym) && t.type === 'expense'));
    const prevIncome = calc(transactions.filter(t => t.date?.startsWith(prevYm) && t.type === 'income'));
    const prevExpense = calc(transactions.filter(t => t.date?.startsWith(prevYm) && t.type === 'expense'));

    const incomeChange = prevIncome.total > 0 ? (((curIncome.total - prevIncome.total) / prevIncome.total) * 100).toFixed(1) : 0;
    const expenseChange = prevExpense.total > 0 ? (((curExpense.total - prevExpense.total) / prevExpense.total) * 100).toFixed(1) : 0;

    $('month-comparison').innerHTML = `
        <div class="comp-item">
            <span class="comp-label">Revenus</span>
            <span class="comp-value" style="color:var(--income)">${formatUSD(curIncome.usd)}</span>
            <span class="comp-change ${incomeChange >= 0 ? 'positive' : 'negative'}">${incomeChange >= 0 ? '+' : ''}${incomeChange}%</span>
        </div>
        <div class="comp-item">
            <span class="comp-label">Depenses</span>
            <span class="comp-value" style="color:var(--expense)">${formatUSD(curExpense.usd)}</span>
            <span class="comp-change ${expenseChange <= 0 ? 'positive' : 'negative'}">${expenseChange >= 0 ? '+' : ''}${expenseChange}%</span>
        </div>
    `;
}

function renderRecommendations() {
    const recs = [];
    const expenses = transactions.filter(t => t.type === 'expense');
    const incomes = transactions.filter(t => t.type === 'income');

    const totalIncome = incomes.reduce((s, t) => s + (t.amount_usd || 0) + (t.amount_cdf || 0) / 3000, 0);
    const totalExpense = expenses.reduce((s, t) => s + (t.amount_usd || 0) + (t.amount_cdf || 0) / 3000, 0);

    if (totalIncome > 0 && (totalExpense / totalIncome) > 0.8) {
        recs.push({ icon: '\u26A0', text: 'Vos depenses representent <strong>' + (totalExpense/totalIncome*100).toFixed(0) + '%</strong> de vos revenus. Essayez de reduire vos depenses.' });
    }

    // Top category
    const catMap = {};
    expenses.forEach(t => {
        const total = (t.amount_usd || 0) + (t.amount_cdf || 0) / 3000;
        catMap[t.category] = (catMap[t.category] || 0) + total;
    });
    const topCat = Object.entries(catMap).sort((a, b) => b[1] - a[1])[0];
    if (topCat && topCat[1] > 0) {
        const pct = totalExpense > 0 ? ((topCat[1] / totalExpense) * 100).toFixed(0) : 0;
        recs.push({ icon: '\uD83D\uDCA1', text: 'La categorie <strong>' + topCat[0] + '</strong> represente ' + pct + '% de vos depenses.' });
    }

    // No data
    if (transactions.length === 0) {
        recs.push({ icon: '\uD83D\uDCCB', text: 'Commencez a ajouter vos transactions pour obtenir des recommandations personnalisees.' });
    } else {
        recs.push({ icon: '\uD83D\uDCC8', text: 'Ajoutez regulierement vos transactions pour un suivi precis de vos finances.' });
    }

    if (totalExpense === 0 && totalIncome > 0) {
        recs.push({ icon: '\uD83C\uDF81', text: 'Bravo ! Vous n\'avez aucune depense. Pensez a investir votre epargne.' });
    }

    const list = $('recommendations-list');
    if (recs.length === 0) {
        list.innerHTML = '<div class="empty-state">Ajoutez des transactions pour voir des recommandations</div>';
    } else {
        list.innerHTML = recs.map(r => `<div class="rec-item">
            <span class="rec-icon">${r.icon}</span>
            <span class="rec-text">${r.text}</span>
        </div>`).join('');
    }
}

function renderTips() {
    const tips = [
        { icon: '\uD83D\uDCB0', text: 'Utilisez la regle 50/30/20 : 50% pour les besoins, 30% pour les loisirs, 20% pour l\'epargne.' },
        { icon: '\uD83D\uDCC5', text: 'Planifiez vos depenses mensuelles a l\'avance pour eviter les mauvaises surprises.' },
        { icon: '\uD83C\uDFE0', text: 'Separez vos comptes USD et FC pour mieux suivre votre budget dans chaque devise.' },
        { icon: '\uD83D\uDCBC', text: 'En periode d\'inflation, privilegiez les depenses en FC pour les achats locaux.' },
        { icon: '\uD83C\uDFE6', text: 'Constituez un fonds d\'urgence de 3 a 6 mois de depenses.' },
    ];
    $('tips-list').innerHTML = tips.map(t => `<div class="tip-item">
        <span class="tip-icon">${t.icon}</span>
        <span class="tip-text">${t.text}</span>
    </div>`).join('');
}

// ============ FORM SUBMIT ============
form.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = {
        type: typeInput.value,
        amount_usd: $('amount-usd').value || 0,
        amount_cdf: $('amount-cdf').value || 0,
        description: $('description').value,
        category: $('category').value,
        date: $('date').value,
    };
    if (!data.description) { showToast('Description requise'); return; }
    if (parseFloat(data.amount_usd) === 0 && parseFloat(data.amount_cdf) === 0) {
        showToast('Entrez un montant');
        return;
    }
    addTransaction(data);
    form.reset();
    dateInput.valueAsDate = new Date();
    typeInput.value = 'income';
    typeIncome.classList.add('active');
    typeExpense.classList.remove('active');
    showToast('Transaction ajoutee');
});

// ============ INIT ============
async function init() {
    loadLocal();
    updateStatus();
    await loadFromServer();
    fullRender();
}

init();
