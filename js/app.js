/* ============================================================
   BudgetTrack — app.js
   Expense & Budget Visualizer
   Features: Add/Delete transactions, Balance summary, Pie chart,
             LocalStorage, Dark/Light mode, Sort, Custom categories
   ============================================================ */

'use strict';

/* ---------- Constants ---------- */
const STORAGE_KEY_TX   = 'budgettrack_transactions';
const STORAGE_KEY_CATS = 'budgettrack_categories';
const STORAGE_KEY_THEME = 'budgettrack_theme';

/* Built-in categories: { label, emoji, color } */
const DEFAULT_CATEGORIES = [
  { label: 'Food',      emoji: '🍔', color: '#f59e0b' },
  { label: 'Transport', emoji: '🚌', color: '#3b82f6' },
  { label: 'Fun',       emoji: '🎮', color: '#8b5cf6' },
];

/* Chart.js color pool for custom categories */
const COLOR_POOL = [
  '#10b981','#ef4444','#ec4899','#06b6d4','#f97316',
  '#84cc16','#a855f7','#14b8a6','#f43f5e','#6366f1',
];

/* ---------- State ---------- */
let transactions = [];    // array of transaction objects
let categories   = [];    // array of category objects
let chartInstance = null; // Chart.js instance

/* ---------- DOM References ---------- */
const form            = document.getElementById('transactionForm');
const inputName       = document.getElementById('itemName');
const inputAmount     = document.getElementById('amount');
const selectCategory  = document.getElementById('category');
const errName         = document.getElementById('errName');
const errAmount       = document.getElementById('errAmount');
const errCategory     = document.getElementById('errCategory');

const toggleCustomBtn = document.getElementById('toggleCustomCat');
const customCatRow    = document.getElementById('customCatRow');
const inputCustomCat  = document.getElementById('customCategory');
const inputCustomEmoji = document.getElementById('customEmoji');
const addCategoryBtn  = document.getElementById('addCategoryBtn');
const errCustomCat    = document.getElementById('errCustomCat');

const totalBalanceEl  = document.getElementById('totalBalance');
const totalIncomeEl   = document.getElementById('totalIncome');
const totalExpenseEl  = document.getElementById('totalExpense');

const txList          = document.getElementById('transactionList');
const listEmptyMsg    = document.getElementById('listEmpty');
const chartEmptyMsg   = document.getElementById('chartEmpty');
const sortSelect      = document.getElementById('sortSelect');
const chartCanvas     = document.getElementById('expenseChart');
const themeToggle     = document.getElementById('themeToggle');
const themeIcon       = document.getElementById('themeIcon');

/* ---------- Utility Helpers ---------- */

/** Format a number as Rupiah */
function formatRupiah(amount) {
  return 'Rp ' + Math.abs(amount).toLocaleString('id-ID');
}

/** Generate a unique ID */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/** Get category object by label */
function getCategoryByLabel(label) {
  return categories.find(c => c.label === label) || { label, emoji: '🏷️', color: '#9ca3af' };
}

/** Format a date string nicely */
function formatDate(isoString) {
  const d = new Date(isoString);
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

/* ---------- LocalStorage ---------- */

function saveTransactions() {
  localStorage.setItem(STORAGE_KEY_TX, JSON.stringify(transactions));
}

function loadTransactions() {
  const raw = localStorage.getItem(STORAGE_KEY_TX);
  transactions = raw ? JSON.parse(raw) : [];
}

function saveCategories() {
  localStorage.setItem(STORAGE_KEY_CATS, JSON.stringify(categories));
}

function loadCategories() {
  const raw = localStorage.getItem(STORAGE_KEY_CATS);
  if (raw) {
    categories = JSON.parse(raw);
  } else {
    categories = [...DEFAULT_CATEGORIES];
    saveCategories();
  }
}

/* ---------- Theme ---------- */

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  themeIcon.textContent = theme === 'dark' ? '☀️' : '🌙';
  localStorage.setItem(STORAGE_KEY_THEME, theme);
}

function loadTheme() {
  const saved = localStorage.getItem(STORAGE_KEY_THEME);
  // Also respect OS preference if no saved preference
  if (saved) {
    applyTheme(saved);
  } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
    applyTheme('dark');
  } else {
    applyTheme('light');
  }
}

themeToggle.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  applyTheme(current === 'dark' ? 'light' : 'dark');
  // Update chart colors on theme switch
  updateChart();
});

/* ---------- Category Management ---------- */

/** Populate the <select> with all categories + custom option */
function renderCategorySelect() {
  // Keep the first placeholder option
  const placeholder = selectCategory.options[0];
  selectCategory.innerHTML = '';
  selectCategory.appendChild(placeholder);

  categories.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat.label;
    opt.textContent = `${cat.emoji} ${cat.label}`;
    selectCategory.appendChild(opt);
  });
}

/** Toggle the custom category input row */
toggleCustomBtn.addEventListener('click', () => {
  const isVisible = customCatRow.style.display !== 'none';
  customCatRow.style.display = isVisible ? 'none' : 'flex';
  toggleCustomBtn.textContent = isVisible ? '+ Add custom category' : '− Hide custom category';
  if (!isVisible) inputCustomCat.focus();
});

/** Add a custom category */
addCategoryBtn.addEventListener('click', () => {
  const label = inputCustomCat.value.trim();
  const emoji = inputCustomEmoji.value.trim() || '🏷️';
  errCustomCat.textContent = '';

  if (!label) {
    errCustomCat.textContent = 'Please enter a category name.';
    inputCustomCat.focus();
    return;
  }

  const duplicate = categories.some(c => c.label.toLowerCase() === label.toLowerCase());
  if (duplicate) {
    errCustomCat.textContent = 'Category already exists.';
    inputCustomCat.focus();
    return;
  }

  // Pick a color from the pool (cycle through)
  const color = COLOR_POOL[categories.length % COLOR_POOL.length];
  const newCat = { label, emoji, color };

  categories.push(newCat);
  saveCategories();
  renderCategorySelect();

  // Pre-select the new category
  selectCategory.value = label;

  // Reset fields
  inputCustomCat.value = '';
  inputCustomEmoji.value = '';
  customCatRow.style.display = 'none';
  toggleCustomBtn.textContent = '+ Add custom category';
});

/* ---------- Form Validation & Submission ---------- */

/** Clear all inline validation errors */
function clearErrors() {
  errName.textContent     = '';
  errAmount.textContent   = '';
  errCategory.textContent = '';
  inputName.classList.remove('invalid');
  inputAmount.classList.remove('invalid');
  selectCategory.classList.remove('invalid');
}

/** Validate form fields, return true if valid */
function validateForm() {
  clearErrors();
  let valid = true;

  if (!inputName.value.trim()) {
    errName.textContent = 'Item name is required.';
    inputName.classList.add('invalid');
    valid = false;
  }

  const amountVal = parseFloat(inputAmount.value);
  if (!inputAmount.value || isNaN(amountVal) || amountVal <= 0) {
    errAmount.textContent = 'Please enter a valid positive amount.';
    inputAmount.classList.add('invalid');
    valid = false;
  }

  if (!selectCategory.value) {
    errCategory.textContent = 'Please select a category.';
    selectCategory.classList.add('invalid');
    valid = false;
  }

  return valid;
}

/** Handle form submit */
form.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!validateForm()) return;

  const typeRadio = form.querySelector('input[name="transType"]:checked');
  const type = typeRadio ? typeRadio.value : 'expense';

  const tx = {
    id:       generateId(),
    name:     inputName.value.trim(),
    amount:   parseFloat(inputAmount.value),
    category: selectCategory.value,
    type:     type,           // 'expense' | 'income'
    date:     new Date().toISOString(),
  };

  transactions.unshift(tx); // Add to beginning
  saveTransactions();
  updateAll();

  // Reset form
  form.reset();
  clearErrors();
  // Restore placeholder
  selectCategory.selectedIndex = 0;
});

/* ---------- Delete Transaction ---------- */

function deleteTransaction(id) {
  transactions = transactions.filter(tx => tx.id !== id);
  saveTransactions();
  updateAll();
}

/* ---------- Sorting ---------- */

function getSortedTransactions() {
  const sortVal = sortSelect.value;
  const sorted  = [...transactions];

  switch (sortVal) {
    case 'date-desc':
      sorted.sort((a, b) => new Date(b.date) - new Date(a.date));
      break;
    case 'date-asc':
      sorted.sort((a, b) => new Date(a.date) - new Date(b.date));
      break;
    case 'amount-desc':
      sorted.sort((a, b) => b.amount - a.amount);
      break;
    case 'amount-asc':
      sorted.sort((a, b) => a.amount - b.amount);
      break;
    case 'category-asc':
      sorted.sort((a, b) => a.category.localeCompare(b.category));
      break;
    default:
      break;
  }

  return sorted;
}

sortSelect.addEventListener('change', renderTransactionList);

/* ---------- Render Transaction List ---------- */

function renderTransactionList() {
  txList.innerHTML = '';

  const sorted = getSortedTransactions();

  if (sorted.length === 0) {
    listEmptyMsg.classList.add('visible');
    return;
  }

  listEmptyMsg.classList.remove('visible');

  sorted.forEach(tx => {
    const cat  = getCategoryByLabel(tx.category);
    const isIncome = tx.type === 'income';
    const sign = isIncome ? '+' : '-';

    const li = document.createElement('li');
    li.className = 'transaction-item';
    li.setAttribute('data-id', tx.id);

    li.innerHTML = `
      <div class="tx-icon" style="background-color: ${cat.color}22; color: ${cat.color};">
        ${cat.emoji}
      </div>
      <div class="tx-details">
        <p class="tx-name">${escapeHtml(tx.name)}</p>
        <p class="tx-meta">${escapeHtml(tx.category)} &bull; ${formatDate(tx.date)}</p>
      </div>
      <span class="tx-amount ${isIncome ? 'income' : 'expense'}">
        ${sign}${formatRupiah(tx.amount)}
      </span>
      <button
        class="tx-delete"
        aria-label="Delete ${escapeHtml(tx.name)}"
        title="Delete transaction"
      >✕</button>
    `;

    // Delete handler
    li.querySelector('.tx-delete').addEventListener('click', () => {
      deleteTransaction(tx.id);
    });

    txList.appendChild(li);
  });
}

/** Safely escape HTML to prevent XSS */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

/* ---------- Balance Summary ---------- */

function updateBalance() {
  let income  = 0;
  let expense = 0;

  transactions.forEach(tx => {
    if (tx.type === 'income') {
      income += tx.amount;
    } else {
      expense += tx.amount;
    }
  });

  const balance = income - expense;

  totalBalanceEl.textContent = formatRupiah(balance);
  // Color the balance
  totalBalanceEl.style.color = balance < 0 ? '#fca5a5' : '#ffffff';
  totalIncomeEl.textContent  = formatRupiah(income);
  totalExpenseEl.textContent = formatRupiah(expense);
}

/* ---------- Chart ---------- */

function buildChartData() {
  // Aggregate expense amounts per category
  const map = {};
  transactions.forEach(tx => {
    if (tx.type === 'expense') {
      map[tx.category] = (map[tx.category] || 0) + tx.amount;
    }
  });

  const labels  = Object.keys(map);
  const data    = Object.values(map);
  const colors  = labels.map(lbl => getCategoryByLabel(lbl).color);

  return { labels, data, colors };
}

function updateChart() {
  const { labels, data, colors } = buildChartData();
  const hasData = data.length > 0;

  // Show/hide empty message
  chartEmptyMsg.classList.toggle('visible', !hasData);

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const legendColor = isDark ? '#d1d5db' : '#374151';

  if (!hasData) {
    if (chartInstance) {
      chartInstance.destroy();
      chartInstance = null;
    }
    return;
  }

  if (chartInstance) {
    chartInstance.data.labels            = labels;
    chartInstance.data.datasets[0].data  = data;
    chartInstance.data.datasets[0].backgroundColor = colors;
    chartInstance.options.plugins.legend.labels.color = legendColor;
    chartInstance.update();
    return;
  }

  // Create new chart
  chartInstance = new Chart(chartCanvas, {
    type: 'pie',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderWidth: 2,
        borderColor: isDark ? '#1a1d27' : '#ffffff',
        hoverOffset: 8,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: legendColor,
            font: { size: 12, family: "'Segoe UI', system-ui, sans-serif" },
            padding: 14,
            usePointStyle: true,
            pointStyleWidth: 10,
          },
        },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const val = ctx.parsed;
              const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
              const pct   = ((val / total) * 100).toFixed(1);
              return ` ${formatRupiah(val)} (${pct}%)`;
            },
          },
        },
      },
    },
  });
}

/* ---------- Master Update Function ---------- */

function updateAll() {
  updateBalance();
  renderTransactionList();
  updateChart();
}

/* ---------- Initialise ---------- */

function init() {
  loadTheme();
  loadCategories();
  loadTransactions();
  renderCategorySelect();
  updateAll();
}

// Boot
init();
