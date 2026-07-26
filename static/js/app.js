// State
let transactions = [];
let online = navigator.onLine;
let deferredPrompt = null;

// DOM refs
const form = document.getElementById('transaction-form');
const list = document.getElementById('transaction-list');
const typeIncome = document.getElementById('type-income');
const typeExpense = document.getElementById('type-expense');
const typeInput = document.getElementById('type-input');
const offlineBadge = document.getElementById('offline-badge');
const onlineBadge = document.getElementById('online-badge');
const installBanner = document.getElementById('install-banner');
const installBtn = document.getElementById('install-btn');
const dismissInstall = document.getElementById('dismiss-install');
const filterType = document.getElementById('filter-type');
const filterCategory = document.getElementById('filter-category');
const dateInput = document.getElementById('date');

// Init date
dateInput.valueAsDate = new Date();

// Currency formatting
function formatUSD(n) {
    return '$' + Number(n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatCDF(n) {
    return Number(n || 0).toLocaleString('fr-FR') + ' FC';
}

// Toast
function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    setTimeout(() => t.classList.add('hidden'), 3000);
}

// Online/offline
function updateStatus() {
    online = navigator.onLine;
    offlineBadge.classList.toggle('hidden', online);
    onlineBadge.classList.toggle('hidden', !online);
    if (online) syncWithServer();
}

window.addEventListener('online', updateStatus);
window.addEventListener('offline', updateStatus);

// PWA install
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

// Category filter populate
function populateCategories() {
    const cats = new Set();
    transactions.forEach(t => cats.add(t.category));
    const sel = filterCategory;
    const current = sel.value;
    sel.innerHTML = '<option value="all">Toutes categories</option>';
    [...cats].sort().forEach(c => {
        const opt = document.createElement('option');
        opt.value = c;
        opt.textContent = c;
        sel.appendChild(opt);
    });
    sel.value = current;
}

// Type toggle
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

// Local storage
function loadLocal() {
    try {
        const data = localStorage.getItem('makuta_transactions');
        if (data) transactions = JSON.parse(data);
    } catch (e) { transactions = []; }
}

function saveLocal() {
    localStorage.setItem('makuta_transactions', JSON.stringify(transactions));
}

// Generate client ID
function genId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

// Render
function render() {
    const type = filterType.value;
    const cat = filterCategory.value;

    let filtered = transactions;
    if (type !== 'all') filtered = filtered.filter(t => t.type === type);
    if (cat !== 'all') filtered = filtered.filter(t => t.category === cat);

    // Sort by date desc, then by id desc
    filtered.sort((a, b) => b.date.localeCompare(a.date) || (b.id || '').toString().localeCompare(a.id || ''));

    if (filtered.length === 0) {
        list.innerHTML = '<div class="empty-state">Aucune transaction</div>';
    } else {
        list.innerHTML = filtered.map(t => {
            const isIncome = t.type === 'income';
            const icon = isIncome ? 'arrow_upward' : 'arrow_downward';
            return `<div class="transaction-item ${t.type}">
                <div class="transaction-info">
                    <div class="transaction-desc">${escHtml(t.description)}</div>
                    <div class="transaction-category">${escHtml(t.category)}</div>
                    <div class="transaction-date">${t.date}</div>
                </div>
                <div class="transaction-amounts">
                    <div class="transaction-usd">${formatUSD(t.amount_usd)}</div>
                    <div class="transaction-cdf">${formatCDF(t.amount_cdf)}</div>
                </div>
                <button class="transaction-delete" data-id="${t.client_id || t.id}" title="Supprimer">&times;</button>
            </div>`;
        }).join('');
    }

    // Attach delete handlers
    list.querySelectorAll('.transaction-delete').forEach(btn => {
        btn.addEventListener('click', () => deleteTransaction(btn.dataset.id));
    });

    updateSummary();
    populateCategories();
}

function escHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
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
    document.getElementById('total-income-usd').textContent = formatUSD(incomeUSD);
    document.getElementById('total-income-cdf').textContent = formatCDF(incomeCDF);
    document.getElementById('total-expense-usd').textContent = formatUSD(expenseUSD);
    document.getElementById('total-expense-cdf').textContent = formatCDF(expenseCDF);
    document.getElementById('balance-usd').textContent = formatUSD(incomeUSD - expenseUSD);
    document.getElementById('balance-cdf').textContent = formatCDF(incomeCDF - expenseCDF);
}

// CRUD
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
    render();
    if (online) syncWithServer();
    return t;
}

async function deleteTransaction(clientId) {
    if (!confirm('Supprimer cette transaction ?')) return;
    transactions = transactions.filter(t => t.client_id !== clientId && t.id != clientId);
    saveLocal();
    render();
    if (online) {
        try {
            // Find server ID
            await fetch('/api/transactions/' + clientId, { method: 'DELETE' });
        } catch (e) {
            // Keep deleted locally
        }
    }
    showToast('Transaction supprimee');
}

// Sync
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
                if (local) {
                    local.id = s.id;
                    local.synced = true;
                }
            });
            saveLocal();
            render();
        }
    } catch (e) {
        console.log('Sync failed, will retry later');
    }
}

async function loadFromServer() {
    if (!online) return;
    try {
        const res = await fetch('/api/transactions');
        if (res.ok) {
            const serverData = await res.json();
            // Merge: server data wins, but keep local unsynced
            const localMap = {};
            transactions.forEach(t => { if (t.client_id) localMap[t.client_id] = t; });
            serverData.forEach(s => {
                if (!localMap[s.client_id]) {
                    transactions.push({ ...s, synced: true });
                }
            });
            saveLocal();
            render();
        }
    } catch (e) {
        console.log('Load from server failed');
    }
}

// Form submit
form.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = {
        type: typeInput.value,
        amount_usd: document.getElementById('amount-usd').value || 0,
        amount_cdf: document.getElementById('amount-cdf').value || 0,
        description: document.getElementById('description').value,
        category: document.getElementById('category').value,
        date: document.getElementById('date').value,
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

// Filter change
filterType.addEventListener('change', render);
filterCategory.addEventListener('change', render);

// Init
async function init() {
    loadLocal();
    updateStatus();
    await loadFromServer();
    render();
}

init();
