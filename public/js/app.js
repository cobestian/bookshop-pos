/* ==============================================
   BESTIAN SHOP POS — app.js
============================================== */

const API_BASE = "";

/* ---- API helper ---- */
async function api(method, path, body) {
  const opts = { method, headers: { "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(API_BASE + path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Server error");
  return data;
}

/* ---- helpers ---- */
const ghc = (n) => "GH\u20B5 " + Number(n || 0).toFixed(2);
const esc = (s) => String(s == null ? "" : s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const today = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now - offset).toISOString().slice(0, 10);
};

const nowISO = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now - offset).toISOString().slice(0, 19).replace("T", " ");
};

const getAccounts   = (sid) => JSON.parse(localStorage.getItem("expAccounts_" + sid) || "[]");
const saveAccounts  = (sid, a) => localStorage.setItem("expAccounts_" + sid, JSON.stringify(a));
const getCategories = (sid) => JSON.parse(localStorage.getItem("categories_" + sid) || "[]");
const saveCategories= (sid, a) => localStorage.setItem("categories_" + sid, JSON.stringify(a));
const getShopSettings = () => JSON.parse(localStorage.getItem("shopSettings_" + (currentUser ? currentUser.shopId : "0")) || "{}");

function getShopInitials(name) {
  return (name || "SH").split(/\s+/).map(function(w){ return w[0] || ""; }).join("").toUpperCase().slice(0, 3);
}

function genInvoiceNo(prefix, shopId, type) {
  var key = "invcount_" + shopId + "_" + type + "_" + prefix;
  var count = parseInt(localStorage.getItem(key) || "0") + 1;
  localStorage.setItem(key, count);
  return prefix + String(count).padStart(4, "0");
}

function receiptFooter() {
  return '<div style="border-top:1px dashed #ccc;margin-top:12px;padding-top:8px;text-align:center;font-size:11px;color:#666">Software powered by BESTIAN COMPANY LTD. 0538500673</div>';
}

function shopHeader(ss) {
  var phone = [ss.phone1, ss.phone2].filter(Boolean).join(" / ");
  var html = '<div style="text-align:center;margin-bottom:12px">';
  html += '<div style="font-size:18px;font-weight:700">' + esc(currentUser.shopName || "") + "</div>";
  if (ss.branch) html += '<div style="font-size:12px">' + esc(ss.branch) + "</div>";
  if (ss.address) html += '<div style="font-size:12px">' + esc(ss.address) + "</div>";
  if (phone) html += '<div style="font-size:12px">Tel: ' + esc(phone) + "</div>";
  html += "</div>";
  return html;
}

function printReceipt(html) {
  var w = window.open("", "_blank", "width=420,height=650");
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(function(){ w.print(); }, 400);
}

/* ==============================================
   GLOBALS
============================================== */
var screenEl = null;
var sidebarEl = null;
var screen = null;
var currentUser = JSON.parse(localStorage.getItem("currentUser") || "null");

var whoami      = document.getElementById("whoami");
var themeSelect = document.getElementById("themeSelect");
var pageTitle   = document.getElementById("pageTitle");

function setPrimaryAction(sel) { window.__primaryActionSel = sel; }

document.addEventListener("keydown", function(e) {
  if (e.key === "Enter" && (e.target ? e.target.tagName : "").toLowerCase() !== "textarea") {
    e.preventDefault();
    var btn = document.querySelector(window.__primaryActionSel || "");
    if (btn && !btn.disabled) btn.click();
  }
});

function $(q) { return screenEl.querySelector(q); }

/* ==============================================
   START
============================================== */
function startApp() {
  screenEl  = document.getElementById("screen");
  sidebarEl = document.getElementById("sidebar");
  screen    = screenEl;

  if (!currentUser) { window.location.href = "index.html"; return; }

  if (whoami) whoami.textContent = currentUser.fullName + " (" + currentUser.accessLevel + ") \u00B7 " + (currentUser.shopName || "");

  document.getElementById("logoutBtn") && document.getElementById("logoutBtn").addEventListener("click", function() {
    localStorage.removeItem("currentUser");
    window.location.href = "index.html";
  });

  document.getElementById("menuToggle") && document.getElementById("menuToggle").addEventListener("click", function() {
    sidebarEl && sidebarEl.classList.toggle("open");
  });

  document.addEventListener("click", function(e) {
    if (window.innerWidth <= 900 && sidebarEl && sidebarEl.classList.contains("open")) {
      if (!sidebarEl.contains(e.target) && e.target.id !== "menuToggle") sidebarEl.classList.remove("open");
    }
  });

  var savedTheme = localStorage.getItem("theme") || "light";
  document.body.setAttribute("data-theme", savedTheme);
  if (themeSelect) themeSelect.value = savedTheme;
  themeSelect && themeSelect.addEventListener("change", function(e) {
    document.body.setAttribute("data-theme", e.target.value);
    localStorage.setItem("theme", e.target.value);
  });

  applyNavPermissions();

  document.querySelectorAll(".navBtn").forEach(function(btn) {
    btn.addEventListener("click", function() {
      sidebarEl && sidebarEl.classList.remove("open");
      var target = btn.dataset.screen;
      if (!canAccess(target)) { alert("Access denied."); return; }
      document.querySelectorAll(".navBtn").forEach(function(b){ b.classList.remove("active"); });
      btn.classList.add("active");
      load(target);
    });
  });

  load("dashboard");
}

function canAccess(s) {
  if (!currentUser) return false;
  if (currentUser.accessLevel === "SALESMAN") {
    var blocked = ["stockLevel","dailyStockLevel","users","shopSettings"];
    if (blocked.indexOf(s) !== -1) return false;
  }
  return true;
}

function applyNavPermissions() {
  document.querySelectorAll(".navBtn").forEach(function(btn) {
    btn.style.display = canAccess(btn.dataset.screen) ? "" : "none";
  });
}

function load(name) {
  window.__primaryActionSel = null;
  var map = {
    dashboard: dashboard,
    products: productsSetup,
    suppliers: suppliersSetup,
    customers: customersSetup,
    categories: categoriesSetup,
    users: manageUsers,
    shopSettings: shopSettings,
    cashSales: cashSales,
    goodsReceived: goodsReceived,
    customerGoods: customerGoodsWholesale,
    customerPayments: customerPayments,
    momoAccount: momoAccount,
    adjustment: adjustment,
    expenseAccounts: expenseAccountsSetup,
    recordExpense: recordExpense,
    expenseReport: expensesReport,
    stockLevel: stockLevel,
    dailyStockLevel: dailyStockLevel,
    dailySalesReport: dailySalesReport,
    wholesaleReport: wholesaleReport,
    goodsReceivedReport: goodsReceivedReport,
    adjustmentReport: adjustmentReport,
    endOfDay: endOfDay
  };
  var fn = map[name];
  if (fn) fn(); else dashboard();
}

/* ==============================================
   DASHBOARD
============================================== */
async function dashboard() {
  pageTitle.textContent = "Dashboard";
  screen.innerHTML = '<div style="color:var(--muted);padding:20px">Loading...</div>';

  try {
    var results = await Promise.all([
      api("GET", "/products/" + currentUser.shopId),
      api("GET", "/sales/" + currentUser.shopId),
      api("GET", "/expenses/" + currentUser.shopId),
      api("GET", "/customers/" + currentUser.shopId),
      api("GET", "/suppliers/" + currentUser.shopId)
    ]);
    var products  = results[0];
    var sales     = results[1];
    var expenses  = results[2];
    var customers = results[3];
    var suppliers = results[4];

    var t = today();
    var todaySales = sales.filter(function(s){ return (s.sale_date||"").slice(0,10) === t; }).reduce(function(a,s){ return a + Number(s.total||0); }, 0);
    var todayExp   = expenses.filter(function(e){ return (e.created_at||"").slice(0,10) === t; }).reduce(function(a,e){ return a + Number(e.amount||0); }, 0);
    var lowStock   = products.filter(function(p){ return Number(p.qty||0) <= 5; });

    screen.innerHTML =
      '<div style="background:var(--card);border:1px solid var(--border);border-radius:14px;padding:12px 16px;display:flex;align-items:center;gap:12px;margin-bottom:16px;">' +
        '<span style="font-size:18px">🔍</span>' +
        '<input id="dashSearch" placeholder="Search..." style="border:none;background:transparent;font-size:15px;color:var(--text);outline:none;width:100%"/>' +
      '</div>' +

      '<div class="cards" style="margin-bottom:20px">' +
        '<div class="card" onclick="load(\'products\')">' +
          '<div class="label">📦 PRODUCTS</div>' +
          '<div class="value">' + products.length + '</div>' +
          '<div style="font-size:11px;color:var(--success);margin-top:4px">Total items</div>' +
        '</div>' +
        '<div class="card" onclick="load(\'customers\')">' +
          '<div class="label">👤 CUSTOMERS</div>' +
          '<div class="value">' + customers.length + '</div>' +
          '<div style="font-size:11px;color:var(--muted);margin-top:4px">' + suppliers.length + ' suppliers</div>' +
        '</div>' +
        '<div class="card" onclick="load(\'cashSales\')">' +
          '<div class="label">💰 TODAY SALES</div>' +
          '<div class="value" style="color:var(--success);font-size:20px">' + ghc(todaySales) + '</div>' +
          '<div style="font-size:11px;color:var(--muted);margin-top:4px">Expenses: ' + ghc(todayExp) + '</div>' +
        '</div>' +
        '<div class="card" id="lowStockCard" style="cursor:pointer' + (lowStock.length > 0 ? ";border-color:#fca5a5" : "") + '">' +
          '<div class="label" style="' + (lowStock.length > 0 ? "color:var(--danger)" : "") + '">⚠ LOW STOCK</div>' +
          '<div class="value" style="' + (lowStock.length > 0 ? "color:var(--danger)" : "") + '">' + lowStock.length + '</div>' +
          '<div style="font-size:11px;color:' + (lowStock.length > 0 ? "var(--danger)" : "var(--muted)") + ';margin-top:4px">' + (lowStock.length > 0 ? "Needs restock" : "All good") + '</div>' +
        '</div>' +
      '</div>' +

      '<div class="icon-section-label">Setup</div>' +
      '<div class="icon-grid" style="margin-bottom:20px">' +
        tile("📦","#eff6ff","Products","products") +
        tile("🏭","#f0fdf4","Suppliers","suppliers") +
        tile("👤","#faf5ff","Customers","customers") +
        tile("🏷️","#fff7ed","Categories","categories") +
        tile("👥","#f0f9ff","Manage Users","users") +
      '</div>' +

      '<div class="icon-section-label">Transactions</div>' +
      '<div class="icon-grid" style="margin-bottom:20px">' +
        colorTile("💰","#10b981","Cash Sales","cashSales") +
        colorTile("🚚","#3b82f6","Goods Received","goodsReceived") +
        colorTile("🧾","#8b5cf6","Customer Goods","customerGoods") +
        colorTile("💳","#f59e0b","Customer Payments","customerPayments") +
        colorTile("📱","#ef4444","MoMo Account","momoAccount") +
        colorTile("🔄","#6366f1","Adjustment","adjustment") +
      '</div>' +

      '<div class="icon-section-label">Reports &amp; Expenses</div>' +
      '<div class="icon-grid" style="margin-bottom:20px">' +
        tile("📊","#fef3c7","Stock Level","stockLevel") +
        tile("📈","#ecfdf5","Daily Sales","dailySalesReport") +
        tile("📦","#fdf4ff","Goods Received Report","goodsReceivedReport") +
        tile("🧮","#fff1f2","End of Day","endOfDay") +
        tile("✍️","#f0fdf4","Record Expense","recordExpense") +
        tile("📋","#eff6ff","Daily Stock Level","dailyStockLevel") +
        tile("🧾","#faf5ff","Wholesale Report","wholesaleReport") +
        tile("📑","#fff7ed","Expenses Report","expenseReport") +
        tile("🔄","#f0f9ff","Adjustment Report","adjustmentReport") +
        tile("⚙️","#fef3c7","Shop Settings","shopSettings") +
      '</div>' +

      '<div id="lowStockPanel" style="display:none" class="panel">' +
        '<h3 style="margin:0 0 10px;color:var(--danger)">⚠ Low Stock Products (qty ≤ 5)</h3>' +
        '<div class="table-wrap"><table class="table"><thead><tr><th>Product</th><th>Category</th><th>Qty</th><th>Selling</th></tr></thead><tbody>' +
        (lowStock.length ? lowStock.map(function(p){
          return '<tr><td>' + esc(p.name) + '</td><td>' + esc(p.category||"-") + '</td><td style="color:var(--danger);font-weight:700">' + p.qty + '</td><td>' + ghc(p.selling) + '</td></tr>';
        }).join("") : '<tr><td colspan="4" style="color:var(--muted)">No low stock items.</td></tr>') +
        '</tbody></table></div>' +
      '</div>';

    document.getElementById("lowStockCard") && document.getElementById("lowStockCard").addEventListener("click", function() {
      var panel = document.getElementById("lowStockPanel");
      panel.style.display = panel.style.display === "none" ? "block" : "none";
    });

    document.getElementById("dashSearch") && document.getElementById("dashSearch").addEventListener("input", function(e) {
      var q = e.target.value.toLowerCase();
      document.querySelectorAll(".icon-tile").forEach(function(t) {
        var label = (t.querySelector(".icon-tile-label") || {}).textContent || "";
        t.style.display = label.toLowerCase().includes(q) ? "" : "none";
      });
    });

  } catch(err) {
    screen.innerHTML = '<div class="panel" style="color:var(--danger)">Failed to load dashboard: ' + esc(err.message) + '</div>';
  }
}

function tile(icon, bg, label, scr) {
  return '<div class="icon-tile" onclick="load(\'' + scr + '\')">' +
    '<div class="icon-tile-icon" style="background:' + bg + '">' + icon + '</div>' +
    '<div class="icon-tile-label">' + label + '</div>' +
  '</div>';
}

function colorTile(icon, color, label, scr) {
  return '<div class="icon-tile" onclick="load(\'' + scr + '\')">' +
    '<div class="icon-tile-icon" style="background:linear-gradient(135deg,' + color + ',' + color + 'cc)">' + icon + '</div>' +
    '<div class="icon-tile-label">' + label + '</div>' +
  '</div>';
}

/* ==============================================
   PRODUCTS SETUP
============================================== */
async function productsSetup() {
  pageTitle.textContent = "Products Setup";
  setPrimaryAction("#pSave");

  var cats = getCategories(currentUser.shopId);
  var allSuppliers = [];
  try { allSuppliers = await api("GET", "/suppliers/" + currentUser.shopId); } catch(e){}

  var catOpts = '<option value="">-- Select Category --</option>' + cats.map(function(c){ return '<option value="' + esc(c.name) + '">' + esc(c.name) + '</option>'; }).join("");
  var supOpts = '<option value="">-- Select Supplier --</option>' + allSuppliers.map(function(s){ return '<option value="' + esc(s.name) + '">' + esc(s.name) + '</option>'; }).join("");

  screen.innerHTML =
    '<div class="grid2">' +
      '<div class="panel">' +
        '<h3 style="margin:0 0 10px">Product List</h3>' +
        '<input id="pFind" placeholder="Search products..."/>' +
        '<div class="product-list-wrap">' +
          '<table class="table" id="pTable"><thead><tr><th>Product</th><th>Stock</th><th>Selling</th></tr></thead>' +
          '<tbody><tr><td colspan="3" style="color:var(--muted)">Loading...</td></tr></tbody></table>' +
        '</div>' +
      '</div>' +
      '<div class="panel">' +
        '<h3 style="margin:0 0 10px">Add / Edit Product</h3>' +
        '<div class="grid3">' +
          '<div><div class="lbl">Product Name</div><input id="pName"/></div>' +
          '<div><div class="lbl">Supplier</div><select id="pSupplier">' + supOpts + '</select></div>' +
          '<div><div class="lbl">Category</div><select id="pCategory">' + catOpts + '</select></div>' +
        '</div>' +
        '<div style="height:10px"></div>' +
        '<div class="grid3">' +
          '<div><div class="lbl">Cost Price</div><input id="pCost" type="number" step="0.01"/></div>' +
          '<div><div class="lbl">Selling Price</div><input id="pSelling" type="number" step="0.01"/></div>' +
          '<div><div class="lbl">Wholesale Price</div><input id="pWholesale" type="number" step="0.01"/></div>' +
        '</div>' +
        '<div style="height:10px"></div>' +
        '<div class="grid3">' +
          '<div><div class="lbl">Qty In Stock</div><input id="pQty" type="number" step="1" ' + (currentUser.accessLevel === "SALESMAN" ? 'disabled style="opacity:0.5;cursor:not-allowed"' : '') + '/></div>' +
          '<div><div class="lbl">Profit Margin</div><input id="pMargin" type="number" step="0.01" placeholder="Auto"/></div>' +
          '<div></div>' +
        '</div>' +
        '<div class="btnRow">' +
          '<button class="btn" id="pSave">SAVE</button>' +
          '<button class="btn2" id="pEdit">EDIT</button>' +
          '<button class="btn2" id="pRemove">REMOVE</button>' +
          '<button class="btn2" id="pClear">CLEAR</button>' +
        '</div>' +
        '<div id="pMsg" class="msg"></div>' +
      '</div>' +
    '</div>';

  var allProducts = [];
  var selectedId = null;
  var tbody = $("#pTable tbody");

  function render() {
    var q = ($("#pFind").value || "").toLowerCase();
    var list = allProducts.filter(function(p){ return (p.name||"").toLowerCase().includes(q); });
    tbody.innerHTML = list.map(function(p){
      return '<tr data-id="' + p.id + '" style="cursor:pointer"><td>' + esc(p.name) + '</td><td>' + (p.qty||0) + '</td><td>' + ghc(p.selling) + '</td></tr>';
    }).join("") || '<tr><td colspan="3" style="color:var(--muted)">No products yet.</td></tr>';
    tbody.querySelectorAll("tr[data-id]").forEach(function(tr) {
      tr.addEventListener("click", function() {
        var p = allProducts.find(function(x){ return String(x.id) === tr.dataset.id; });
        if (!p) return;
        selectedId = p.id;
        $("#pName").value = p.name||""; $("#pSupplier").value = p.supplier||""; $("#pCategory").value = p.category||"";
        $("#pCost").value = Number(p.cost||0).toFixed(2); $("#pSelling").value = Number(p.selling||0).toFixed(2);
        $("#pWholesale").value = Number(p.wholesale||0).toFixed(2); $("#pQty").value = p.qty||0;
        $("#pMargin").value = Number(p.margin||0).toFixed(2);
        $("#pMsg").textContent = "Selected \u2705";
      });
    });
  }

  async function reload() { allProducts = await api("GET", "/products/" + currentUser.shopId); render(); }

  function clearForm() {
    selectedId = null;
    ["#pName","#pCost","#pSelling","#pWholesale","#pQty","#pMargin"].forEach(function(s){ $(s).value = ""; });
    $("#pSupplier").value = ""; $("#pCategory").value = "";
  }

  $("#pFind").addEventListener("input", render);
  $("#pClear").addEventListener("click", function(){ clearForm(); $("#pMsg").textContent = ""; });

  $("#pSave").addEventListener("click", async function() {
    var name = $("#pName").value.trim();
    if (!name) return ($("#pMsg").textContent = "Product name required.");
    var cost = Number($("#pCost").value||0), selling = Number($("#pSelling").value||0);
    var margin = $("#pMargin").value.trim() === "" ? selling - cost : Number($("#pMargin").value||0);
     var qty = (selectedId && currentUser.accessLevel === "SALESMAN") 
  ? undefined 
  : Number($("#pQty").value||0);
var body = { shopId: currentUser.shopId, name, supplier: $("#pSupplier").value, category: $("#pCategory").value, cost, selling, wholesale: Number($("#pWholesale").value||0), qty, margin };
    try {
      if (selectedId) { await api("PUT", "/products/" + selectedId, body); $("#pMsg").textContent = "Updated \u2705"; }
      else { await api("POST", "/products", body); $("#pMsg").textContent = "Saved \u2705"; }
      clearForm(); await reload();
    } catch(err) { $("#pMsg").textContent = err.message; }
  });

  $("#pEdit").addEventListener("click", function(){ if (!selectedId) return ($("#pMsg").textContent = "Select a product first."); $("#pMsg").textContent = "Edit then SAVE \u2705"; });
  $("#pRemove").addEventListener("click", async function() {
    if (!selectedId) return ($("#pMsg").textContent = "Select a product first.");
    try { await api("DELETE", "/products/" + selectedId); $("#pMsg").textContent = "Removed \u2705"; clearForm(); await reload(); }
    catch(err) { $("#pMsg").textContent = err.message; }
  });

  await reload();
}

/* ==============================================
   CATEGORIES SETUP
============================================== */
function categoriesSetup() {
  pageTitle.textContent = "Categories Setup";
  var selectedId = null;

  screen.innerHTML =
    '<div class="grid2">' +
      '<div class="panel">' +
        '<h3 style="margin:0 0 10px">Categories List</h3>' +
        '<input id="catFind" placeholder="Search categories..."/>' +
        '<div class="product-list-wrap">' +
          '<table class="table" id="catTable"><thead><tr><th>Category Name</th><th>Description</th></tr></thead><tbody></tbody></table>' +
        '</div>' +
      '</div>' +
      '<div class="panel">' +
        '<h3 style="margin:0 0 10px">Add / Edit Category</h3>' +
        '<div class="lbl">Category Name</div>' +
        '<input id="catName" placeholder="e.g. Fiction, Non-Fiction, Stationery" style="margin-bottom:10px"/>' +
        '<div class="lbl">Description (optional)</div>' +
        '<input id="catDesc" placeholder="Brief description..." style="margin-bottom:16px"/>' +
        '<div class="btnRow">' +
          '<button class="btn" id="catSave">SAVE</button>' +
          '<button class="btn2" id="catEdit">EDIT</button>' +
          '<button class="btn2" id="catRemove">REMOVE</button>' +
          '<button class="btn2" id="catClear">CLEAR</button>' +
        '</div>' +
        '<div id="catMsg" class="msg"></div>' +
      '</div>' +
    '</div>';

  var tbody = $("#catTable tbody");

  function render() {
    var q = ($("#catFind").value||"").toLowerCase();
    var list = getCategories(currentUser.shopId).filter(function(c){ return (c.name||"").toLowerCase().includes(q); });
    tbody.innerHTML = list.map(function(c){
      return '<tr data-id="' + c.id + '" style="cursor:pointer"><td>' + esc(c.name) + '</td><td>' + esc(c.desc||"-") + '</td></tr>';
    }).join("") || '<tr><td colspan="2" style="color:var(--muted)">No categories yet.</td></tr>';
    tbody.querySelectorAll("tr[data-id]").forEach(function(tr) {
      tr.addEventListener("click", function() {
        var c = getCategories(currentUser.shopId).find(function(x){ return x.id === tr.dataset.id; });
        if (!c) return;
        selectedId = c.id; $("#catName").value = c.name||""; $("#catDesc").value = c.desc||"";
        $("#catMsg").textContent = "Selected \u2705";
      });
    });
  }

  function clearForm(){ selectedId = null; $("#catName").value = ""; $("#catDesc").value = ""; }

  $("#catFind").addEventListener("input", render);
  $("#catClear").addEventListener("click", function(){ clearForm(); $("#catMsg").textContent = ""; });

  $("#catSave").addEventListener("click", function() {
    var name = $("#catName").value.trim();
    if (!name) return ($("#catMsg").textContent = "Category name required.");
    var cats = getCategories(currentUser.shopId);
    if (selectedId) {
      cats = cats.map(function(c){ return c.id === selectedId ? Object.assign({}, c, {name, desc: $("#catDesc").value.trim()}) : c; });
      $("#catMsg").textContent = "Updated \u2705";
    } else {
      cats.push({ id: "cat_" + Date.now(), name, desc: $("#catDesc").value.trim() });
      $("#catMsg").textContent = "Saved \u2705";
    }
    saveCategories(currentUser.shopId, cats); clearForm(); render();
  });

  $("#catEdit").addEventListener("click", function(){ if (!selectedId) return ($("#catMsg").textContent = "Select a category first."); $("#catMsg").textContent = "Edit then SAVE \u2705"; });
  $("#catRemove").addEventListener("click", function() {
    if (!selectedId) return ($("#catMsg").textContent = "Select a category first.");
    saveCategories(currentUser.shopId, getCategories(currentUser.shopId).filter(function(c){ return c.id !== selectedId; }));
    clearForm(); render(); $("#catMsg").textContent = "Removed \u2705";
  });

  render();
}

/* ==============================================
   SHOP SETTINGS
============================================== */
function shopSettings() {
  pageTitle.textContent = "Shop Settings";
  var key = "shopSettings_" + currentUser.shopId;
  var ss = JSON.parse(localStorage.getItem(key) || "{}");

  screen.innerHTML =
    '<div class="panel" style="max-width:500px">' +
      '<h3 style="margin:0 0 16px">Shop Information</h3>' +
      '<div class="lbl">Shop Name</div>' +
      '<input id="ssName" value="' + esc(currentUser.shopName||"") + '" style="margin-bottom:10px"/>' +
      '<div class="lbl">Phone Number 1</div>' +
      '<input id="ssPhone1" value="' + esc(ss.phone1||"") + '" placeholder="e.g. 0538500673" style="margin-bottom:10px"/>' +
      '<div class="lbl">Phone Number 2 (optional)</div>' +
      '<input id="ssPhone2" value="' + esc(ss.phone2||"") + '" placeholder="e.g. 0503384635" style="margin-bottom:10px"/>' +
      '<div class="lbl">Branch / Location</div>' +
      '<input id="ssBranch" value="' + esc(ss.branch||"") + '" placeholder="e.g. Accra Main Branch" style="margin-bottom:10px"/>' +
      '<div class="lbl">Shop Address</div>' +
      '<input id="ssAddress" value="' + esc(ss.address||"") + '" placeholder="e.g. Osu, Accra" style="margin-bottom:16px"/>' +
      '<div class="btnRow"><button class="btn" id="ssSave">SAVE SETTINGS</button></div>' +
      '<div id="ssMsg" class="msg"></div>' +
    '</div>';

  $("#ssSave").addEventListener("click", function() {
    var s = { phone1: $("#ssPhone1").value.trim(), phone2: $("#ssPhone2").value.trim(), branch: $("#ssBranch").value.trim(), address: $("#ssAddress").value.trim() };
    localStorage.setItem(key, JSON.stringify(s));
    $("#ssMsg").textContent = "Settings saved \u2705 These will appear on receipts.";
  });
}

/* ==============================================
   SUPPLIERS SETUP
============================================== */
async function suppliersSetup() {
  pageTitle.textContent = "Suppliers Setup";

  screen.innerHTML =
    '<div class="grid2">' +
      '<div class="panel">' +
        '<h3 style="margin:0 0 10px">Suppliers List</h3>' +
        '<input id="sFind" placeholder="Search supplier..."/>' +
        '<div class="product-list-wrap">' +
          '<table class="table" id="sTable"><thead><tr><th>Acc No</th><th>Name</th><th>Balance</th></tr></thead>' +
          '<tbody><tr><td colspan="3" style="color:var(--muted)">Loading...</td></tr></tbody></table>' +
        '</div>' +
      '</div>' +
      '<div class="panel">' +
        '<h3 style="margin:0 0 10px">Supplier Account</h3>' +
        '<div class="grid3">' +
          '<div><div class="lbl">Account No</div><input id="sNo"/></div>' +
          '<div><div class="lbl">Supplier Name</div><input id="sName"/></div>' +
          '<div><div class="lbl">Telephone</div><input id="sPhone"/></div>' +
        '</div>' +
        '<div style="height:10px"></div>' +
        '<div class="grid3">' +
          '<div><div class="lbl">Location</div><input id="sLoc"/></div>' +
          '<div><div class="lbl">Current Balance</div><input id="sBal" type="number" step="0.01"/></div>' +
          '<div></div>' +
        '</div>' +
        '<div class="btnRow">' +
          '<button class="btn" id="sSave">SAVE</button>' +
          '<button class="btn2" id="sEdit">EDIT</button>' +
          '<button class="btn2" id="sRemove">REMOVE</button>' +
          '<button class="btn2" id="sNew">NEW</button>' +
        '</div>' +
        '<div id="sMsg" class="msg"></div>' +
      '</div>' +
    '</div>';

  var all = []; var selected = null;
  var tbody = $("#sTable tbody");

  function render() {
    var q = ($("#sFind").value||"").toLowerCase();
    var list = all.filter(function(s){ return (s.name||"").toLowerCase().includes(q) || String(s.account_no||"").includes(q); });
    tbody.innerHTML = list.map(function(s){
      return '<tr data-id="' + s.id + '" style="cursor:pointer"><td>' + esc(s.account_no) + '</td><td>' + esc(s.name) + '</td><td>' + ghc(s.balance||0) + '</td></tr>';
    }).join("") || '<tr><td colspan="3" style="color:var(--muted)">No suppliers yet.</td></tr>';
    tbody.querySelectorAll("tr[data-id]").forEach(function(tr) {
      tr.addEventListener("click", function() {
        var s = all.find(function(x){ return String(x.id) === tr.dataset.id; });
        if (!s) return; selected = s.id;
        $("#sNo").value = s.account_no||""; $("#sName").value = s.name||""; $("#sPhone").value = s.phone||"";
        $("#sLoc").value = s.location||""; $("#sBal").value = Number(s.balance||0).toFixed(2);
        $("#sMsg").textContent = "Selected \u2705";
      });
    });
  }

  async function reload() { all = await api("GET", "/suppliers/" + currentUser.shopId); render(); }

  function clearForm() {
    selected = null;
    var nums = all.map(function(x){ return parseInt(x.account_no||"0"); }).filter(function(n){ return !isNaN(n); });
    $("#sNo").value = String(nums.length ? Math.max.apply(null,nums)+1 : 1).padStart(3,"0");
    ["#sName","#sPhone","#sLoc"].forEach(function(s){ $(s).value = ""; }); $("#sBal").value = "0.00";
  }

  $("#sFind").addEventListener("input", render);
  $("#sNew").addEventListener("click", function(){ clearForm(); $("#sMsg").textContent = ""; });

  $("#sSave").addEventListener("click", async function() {
    var accountNo = $("#sNo").value.trim(), name = $("#sName").value.trim();
    if (!accountNo || !name) return ($("#sMsg").textContent = "Account No and Name required.");
    var body = { shopId: currentUser.shopId, accountNo, name, phone: $("#sPhone").value.trim(), location: $("#sLoc").value.trim(), balance: Number($("#sBal").value||0) };
    try {
      if (selected) { await api("PUT", "/suppliers/" + selected, body); $("#sMsg").textContent = "Updated \u2705"; }
      else { await api("POST", "/suppliers", body); $("#sMsg").textContent = "Saved \u2705"; }
      clearForm(); await reload();
    } catch(err) { $("#sMsg").textContent = err.message; }
  });

  $("#sEdit").addEventListener("click", function(){ if (!selected) return ($("#sMsg").textContent = "Select a supplier first."); $("#sMsg").textContent = "Edit then SAVE \u2705"; });
  $("#sRemove").addEventListener("click", async function() {
    if (!selected) return ($("#sMsg").textContent = "Select a supplier first.");
    try { await api("DELETE", "/suppliers/" + selected); clearForm(); await reload(); $("#sMsg").textContent = "Removed \u2705"; }
    catch(err) { $("#sMsg").textContent = err.message; }
  });

  await reload(); clearForm();
}

/* ==============================================
   CUSTOMERS SETUP
============================================== */
async function customersSetup() {
  pageTitle.textContent = "Customers Setup";

  screen.innerHTML =
    '<div class="panel"><div class="grid3">' +
      '<div>' +
        '<h3 style="margin:0 0 10px">List of Customers</h3>' +
        '<input id="cFind" placeholder="Search customer..."/>' +
        '<div class="product-list-wrap">' +
          '<table class="table" id="cTable"><thead><tr><th>Account Name</th><th>Balance</th></tr></thead><tbody></tbody></table>' +
        '</div>' +
      '</div>' +
      '<div>' +
        '<h3 style="margin:0 0 10px">Customer Info</h3>' +
        '<div class="lbl">Account Name</div><input id="cName" style="margin-bottom:8px"/>' +
        '<div class="lbl">Location</div><input id="cLoc" style="margin-bottom:8px"/>' +
        '<div class="lbl">Office Telephone</div><input id="cOffice" style="margin-bottom:8px"/>' +
        '<div class="lbl">WhatsApp</div><input id="cWhats" style="margin-bottom:8px"/>' +
        '<div class="lbl">Current Balance</div><input id="cBal" type="number" step="0.01"/>' +
      '</div>' +
      '<div>' +
        '<h3 style="margin:0 0 10px">Personal Contact</h3>' +
        '<div class="lbl">Full Name</div><input id="cpName" style="margin-bottom:8px"/>' +
        '<div class="lbl">Telephone</div><input id="cpTel" style="margin-bottom:16px"/>' +
        '<div class="btnRow">' +
          '<button class="btn" id="cSave">SAVE</button>' +
          '<button class="btn2" id="cEdit">EDIT</button>' +
          '<button class="btn2" id="cRemove">REMOVE</button>' +
          '<button class="btn2" id="cNew">NEW</button>' +
        '</div>' +
        '<div id="cMsg" class="msg"></div>' +
      '</div>' +
    '</div></div>';

  var all = []; var selected = null;
  var tbody = $("#cTable tbody");

  function render() {
    var q = ($("#cFind").value||"").toLowerCase();
    var list = all.filter(function(c){ return (c.account_name||"").toLowerCase().includes(q); });
    tbody.innerHTML = list.map(function(c){
      return '<tr data-id="' + c.id + '" style="cursor:pointer"><td>' + esc(c.account_name) + '</td><td>' + ghc(c.balance||0) + '</td></tr>';
    }).join("") || '<tr><td colspan="2" style="color:var(--muted)">No customers yet.</td></tr>';
    tbody.querySelectorAll("tr[data-id]").forEach(function(tr) {
      tr.addEventListener("click", function() {
        var c = all.find(function(x){ return String(x.id) === tr.dataset.id; });
        if (!c) return; selected = c.id;
        $("#cName").value = c.account_name||""; $("#cLoc").value = c.location||"";
        $("#cOffice").value = c.office_tel||""; $("#cWhats").value = c.whatsapp||"";
        $("#cBal").value = Number(c.balance||0).toFixed(2);
        $("#cpName").value = c.contact_name||""; $("#cpTel").value = c.contact_tel||"";
        $("#cMsg").textContent = "Selected \u2705";
      });
    });
  }

  async function reload() { all = await api("GET", "/customers/" + currentUser.shopId); render(); }

  function clearForm() {
    selected = null;
    ["#cName","#cLoc","#cOffice","#cWhats","#cpName","#cpTel"].forEach(function(s){ $(s).value = ""; });
    $("#cBal").value = "0.00";
  }

  $("#cFind").addEventListener("input", render);
  $("#cNew").addEventListener("click", function(){ clearForm(); $("#cMsg").textContent = ""; });

  $("#cSave").addEventListener("click", async function() {
    var accountName = $("#cName").value.trim();
    if (!accountName) return ($("#cMsg").textContent = "Account Name required.");
    var body = { shopId: currentUser.shopId, accountName, location: $("#cLoc").value.trim(), officeTel: $("#cOffice").value.trim(), whatsapp: $("#cWhats").value.trim(), balance: Number($("#cBal").value||0), contactName: $("#cpName").value.trim(), contactTel: $("#cpTel").value.trim() };
    try {
      if (selected) { await api("PUT", "/customers/" + selected, body); $("#cMsg").textContent = "Updated \u2705"; }
      else { await api("POST", "/customers", body); $("#cMsg").textContent = "Saved \u2705"; }
      clearForm(); await reload();
    } catch(err) { $("#cMsg").textContent = err.message; }
  });

  $("#cEdit").addEventListener("click", function(){ if (!selected) return ($("#cMsg").textContent = "Select a customer first."); $("#cMsg").textContent = "Edit then SAVE \u2705"; });
  $("#cRemove").addEventListener("click", async function() {
    if (!selected) return ($("#cMsg").textContent = "Select a customer first.");
    try { await api("DELETE", "/customers/" + selected); clearForm(); await reload(); $("#cMsg").textContent = "Removed \u2705"; }
    catch(err) { $("#cMsg").textContent = err.message; }
  });

  await reload();
}

/* ==============================================
   CASH SALES
============================================== */
async function cashSales() {
  pageTitle.textContent = "Cash Sales";
  setPrimaryAction("#saleAdd");

  var allProducts = [], cart = [], selectedRow = null;

  screen.innerHTML =
    '<div class="grid2">' +
      '<div class="panel">' +
        '<h3 style="margin:0 0 10px">Product List</h3>' +
        '<input id="psFind" placeholder="Search products..."/>' +
        '<div class="product-list-wrap">' +
          '<table class="table" id="psTable"><thead><tr><th>Product</th><th>Stock</th></tr></thead><tbody></tbody></table>' +
        '</div>' +
      '</div>' +
      '<div class="panel">' +
        '<h3 style="margin:0 0 10px">Cash Sales Area</h3>' +
        '<div class="grid3">' +
          '<div><div class="lbl">Product name</div><input id="saleProd" list="saleProdList" placeholder="Type to search..."/><datalist id="saleProdList"></datalist></div>' +
          '<div><div class="lbl">Quantity sold</div><input id="saleQty" type="number" step="1"/></div>' +
          '<div><div class="lbl">Price</div><input id="salePrice" disabled/><div style="color:var(--muted);font-size:11px;margin-top:4px">IN STOCK: <b id="saleStock">0</b></div></div>' +
        '</div>' +
        '<div style="height:8px"></div>' +
        '<div class="grid3">' +
          '<div><div class="lbl">Payment Method</div><select id="salePayMethod"><option>Cash</option><option>Mobile Money</option><option>Cheque</option></select></div>' +
          '<div></div><div></div>' +
        '</div>' +
        '<div class="btnRow">' +
          '<button class="btn" id="saleAdd">ADD</button>' +
          '<button class="btn2" id="saleRemove">REMOVE</button>' +
          '<button class="btn2" id="saleClear">CLEAR ALL</button>' +
        '</div>' +
        '<div class="table-wrap">' +
          '<table class="table" id="saleTable"><thead><tr><th>Product</th><th>Supplier</th><th>Price</th><th>Qty</th><th>Total</th></tr></thead><tbody></tbody></table>' +
        '</div>' +
        '<div class="totalLine"><div>TOTAL AMOUNT</div><div id="saleTotal">' + ghc(0) + '</div></div>' +
        '<div style="display:flex;justify-content:flex-end;align-items:center;gap:12px;margin-top:10px">' +
          '<label class="print-check-row"><input type="checkbox" id="salePrint"/> Print Receipt</label>' +
          '<button class="btn" id="saleSave">SAVE</button>' +
        '</div>' +
        '<div id="saleMsg" class="msg"></div>' +
      '</div>' +
    '</div>';

  function prodByName(n) { return allProducts.find(function(p){ return (p.name||"").toLowerCase() === (n||"").toLowerCase(); }); }

  function renderProdList() {
    var q = ($("#psFind").value||"").toLowerCase();
    var list = allProducts.filter(function(p){ return (p.name||"").toLowerCase().includes(q); });
    $("#psTable tbody").innerHTML = list.map(function(p){ return '<tr data-id="' + p.id + '" style="cursor:pointer"><td>' + esc(p.name) + '</td><td>' + (p.qty||0) + '</td></tr>'; }).join("") || '<tr><td colspan="2" style="color:var(--muted)">No products.</td></tr>';
    $("#psTable tbody").querySelectorAll("tr[data-id]").forEach(function(tr) {
      tr.addEventListener("click", function() {
        var p = allProducts.find(function(x){ return String(x.id) === tr.dataset.id; });
        if (!p) return;
        $("#saleProd").value = p.name; $("#salePrice").value = ghc(p.selling||0); $("#saleStock").textContent = p.qty||0;
      });
    });
    $("#saleProdList").innerHTML = allProducts.map(function(p){ return '<option value="' + esc(p.name) + '"></option>'; }).join("");
  }

  function renderCart() {
    $("#saleTable tbody").innerHTML = cart.map(function(l){
      return '<tr data-row="' + l.rowId + '" style="cursor:pointer"><td>' + esc(l.productName) + '</td><td>' + esc(l.supplier||"-") + '</td><td>' + ghc(l.price) + '</td><td>' + l.qty + '</td><td>' + ghc(l.price*l.qty) + '</td></tr>';
    }).join("") || '<tr><td colspan="5" style="color:var(--muted)">No items yet.</td></tr>';
    $("#saleTable tbody").querySelectorAll("tr[data-row]").forEach(function(tr) {
      tr.addEventListener("click", function(){ selectedRow = tr.dataset.row; $("#saleMsg").textContent = "Row selected \u2705"; });
    });
    $("#saleTotal").textContent = ghc(cart.reduce(function(s,x){ return s + x.price*x.qty; }, 0));
  }

  $("#psFind").addEventListener("input", renderProdList);
  $("#saleProd").addEventListener("input", function() {
    var p = prodByName($("#saleProd").value.trim());
    if (p) { $("#salePrice").value = ghc(p.selling||0); $("#saleStock").textContent = p.qty||0; }
    else { $("#salePrice").value = ""; $("#saleStock").textContent = "0"; }
  });

  $("#saleAdd").addEventListener("click", function() {
    var p = prodByName($("#saleProd").value.trim());
    var qty = Number($("#saleQty").value||0);
    if (!p) return ($("#saleMsg").textContent = "Select a valid product.");
    if (qty <= 0) return ($("#saleMsg").textContent = "Qty must be > 0.");
    if (qty > Number(p.qty||0)) return ($("#saleMsg").textContent = "Not enough stock.");
    var existing = cart.find(function(x){ return x.productId === p.id; });
    if (existing) { if (existing.qty+qty > p.qty) return ($("#saleMsg").textContent = "Not enough stock."); existing.qty += qty; }
    else cart.push({ rowId: Date.now(), productId: p.id, productName: p.name, supplier: p.supplier||"", price: Number(p.selling||0), qty });
    $("#saleQty").value = ""; $("#saleMsg").textContent = "Added \u2705"; renderCart();
  });

  $("#saleRemove").addEventListener("click", function() {
    if (!selectedRow) return ($("#saleMsg").textContent = "Select a row first.");
    cart = cart.filter(function(x){ return String(x.rowId) !== selectedRow; }); selectedRow = null; renderCart();
  });
  $("#saleClear").addEventListener("click", function(){ cart = []; selectedRow = null; renderCart(); });

  $("#saleSave").addEventListener("click", async function() {
    if (!cart.length) return ($("#saleMsg").textContent = "Nothing to save.");
    var payMethod = $("#salePayMethod").value;
    var total = cart.reduce(function(s,x){ return s + x.price*x.qty; }, 0);
    try {
      await api("POST", "/sales", { shopId: currentUser.shopId, enteredBy: currentUser.id, total, paymentMode: payMethod, items: cart });

      if (payMethod === "Mobile Money") {
        var mk = "momo_" + currentUser.shopId;
        localStorage.setItem(mk, Number(localStorage.getItem(mk)||0) + total);
      }

      if ($("#salePrint").checked) {
        var ss = getShopSettings();
        var invNo = genInvoiceNo(getShopInitials(currentUser.shopName), currentUser.shopId, "sale");
        var now = new Date().toLocaleString();
        var rows = cart.map(function(l){ return "<tr><td>" + esc(l.productName) + "</td><td>" + l.qty + "</td><td>" + ghc(l.price) + "</td><td>" + ghc(l.price*l.qty) + "</td></tr>"; }).join("");
        printReceipt("<!DOCTYPE html><html><head><style>body{font-family:Arial,sans-serif;font-size:13px;padding:16px;max-width:320px}table{width:100%;border-collapse:collapse}td,th{padding:4px 6px;border-bottom:1px solid #eee}.center{text-align:center}.bold{font-weight:700}</style></head><body>" +
          '<div class="center bold" style="font-size:11px;margin-bottom:4px">RECEIPT</div>' +
          shopHeader(ss) +
          '<div style="font-size:11px;margin-bottom:8px">Invoice: <b>' + esc(invNo) + "</b><br>Date: " + now + "<br>Served by: " + esc(currentUser.fullName) + "<br>Payment: " + esc(payMethod) + "</div>" +
          "<table><thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead><tbody>" + rows + "</tbody></table>" +
          '<div style="font-weight:700;text-align:right;margin-top:8px">TOTAL: ' + ghc(total) + "</div>" +
          receiptFooter() + "</body></html>");
      }

      allProducts = await api("GET", "/products/" + currentUser.shopId);
      cart = []; selectedRow = null; renderCart(); renderProdList();
      $("#saleProd").value = ""; $("#salePrice").value = ""; $("#saleStock").textContent = "0";
      $("#saleMsg").textContent = "Saved \u2705 Ready for next customer.";
    } catch(err) { $("#saleMsg").textContent = err.message; }
  });

  allProducts = await api("GET", "/products/" + currentUser.shopId);
  renderProdList(); renderCart();
}

/* ==============================================
   GOODS RECEIVED
============================================== */
async function goodsReceived() {
  pageTitle.textContent = "Goods Received";
  var allProducts = [], allSuppliers = [], cart = [], selectedRow = null;

  screen.innerHTML =
    '<div class="grid2">' +
      '<div class="panel">' +
        '<h3 style="margin:0 0 10px">Product List</h3>' +
        '<input id="grFind" placeholder="Search products..."/>' +
        '<div class="product-list-wrap">' +
          '<table class="table" id="grPTable"><thead><tr><th>Product</th><th>Stock</th></tr></thead><tbody></tbody></table>' +
        '</div>' +
      '</div>' +
      '<div class="panel">' +
        '<h3 style="margin:0 0 10px">Goods Received Area</h3>' +
        '<div class="rowLine">' +
          '<div style="flex:1"><div class="lbl">Select Supplier</div><select id="grSupplier"></select></div>' +
          '<div style="flex:1"><div class="lbl">Invoice No</div><input id="grInvoiceNo"/></div>' +
          '<div style="flex:1"><div class="lbl">Invoice Date</div><input id="grInvoiceDate" type="date"/></div>' +
        '</div>' +
        '<div style="height:8px"></div>' +
        '<div class="panel" style="padding:10px;margin-bottom:8px">' +
          '<div class="rowLine">' +
            '<div style="flex:2"><div class="lbl">Product Name</div><input id="grProd" list="grProdList" placeholder="Type to search..."/><datalist id="grProdList"></datalist></div>' +
            '<div style="flex:1"><div class="lbl">Qty</div><input id="grQty" type="number" step="1"/></div>' +
          '</div>' +
          '<div class="rowLine" style="margin-top:8px">' +
            '<div style="flex:1"><div class="lbl">Cost Price</div><input id="grCost" type="number" step="0.01"/></div>' +
            '<div style="flex:1"><div class="lbl">Selling Price</div><input id="grSelling" type="number" step="0.01"/></div>' +
            '<div style="flex:1"><div class="lbl">In Stock</div><input id="grStock" disabled/></div>' +
          '</div>' +
        '</div>' +
        '<div class="btnRow">' +
          '<button class="btn" id="grAdd">ADD</button>' +
          '<button class="btn2" id="grRemove">REMOVE</button>' +
          '<button class="btn2" id="grClear">CLEAR ALL</button>' +
        '</div>' +
        '<div class="table-wrap">' +
          '<table class="table" id="grTable"><thead><tr><th>Product</th><th>Supplier</th><th>Price</th><th>Qty</th><th>Total</th></tr></thead><tbody></tbody></table>' +
        '</div>' +
        '<div class="totalLine"><div>TOTAL</div><div id="grTotal">' + ghc(0) + '</div></div>' +
        '<div style="display:flex;justify-content:flex-end;align-items:center;gap:12px;margin-top:10px">' +
          '<label class="print-check-row"><input type="checkbox" id="grPrint"/> Print Receipt</label>' +
          '<button class="btn" id="grSave">SAVE</button>' +
        '</div>' +
        '<div id="grMsg" class="msg"></div>' +
      '</div>' +
    '</div>';

  function renderProdList() {
    var q = ($("#grFind").value||"").toLowerCase();
    var list = allProducts.filter(function(p){ return (p.name||"").toLowerCase().includes(q); });
    $("#grPTable tbody").innerHTML = list.map(function(p){ return '<tr data-id="' + p.id + '" style="cursor:pointer"><td>' + esc(p.name) + '</td><td>' + (p.qty||0) + '</td></tr>'; }).join("") || '<tr><td colspan="2" style="color:var(--muted)">No products.</td></tr>';
    $("#grPTable tbody").querySelectorAll("tr[data-id]").forEach(function(tr) {
      tr.addEventListener("click", function() {
        var p = allProducts.find(function(x){ return String(x.id) === tr.dataset.id; }); if (!p) return;
        $("#grProd").value = p.name; $("#grCost").value = Number(p.cost||0).toFixed(2); $("#grSelling").value = Number(p.selling||0).toFixed(2); $("#grStock").value = p.qty||0;
      });
    });
    $("#grProdList").innerHTML = allProducts.map(function(p){ return '<option value="' + esc(p.name) + '"></option>'; }).join("");
  }

  function renderCart() {
    $("#grTable tbody").innerHTML = cart.map(function(l){ return '<tr data-row="' + l.rowId + '" style="cursor:pointer"><td>' + esc(l.productName) + '</td><td>' + esc(l.supplierName||"-") + '</td><td>' + ghc(l.selling) + '</td><td>' + l.qty + '</td><td>' + ghc(l.selling*l.qty) + '</td></tr>'; }).join("") || '<tr><td colspan="5" style="color:var(--muted)">No items.</td></tr>';
    $("#grTable tbody").querySelectorAll("tr[data-row]").forEach(function(tr) {
      tr.addEventListener("click", function(){ selectedRow = tr.dataset.row; $("#grMsg").textContent = "Row selected \u2705"; });
    });
    $("#grTotal").textContent = ghc(cart.reduce(function(s,x){ return s + x.selling*x.qty; }, 0));
  }

  $("#grFind").addEventListener("input", renderProdList);
  $("#grProd").addEventListener("input", function() {
    var p = allProducts.find(function(x){ return x.name.toLowerCase() === $("#grProd").value.trim().toLowerCase(); });
    if (p) { $("#grCost").value = Number(p.cost||0).toFixed(2); $("#grSelling").value = Number(p.selling||0).toFixed(2); $("#grStock").value = p.qty||0; }
  });

  $("#grAdd").addEventListener("click", function() {
    var sid = $("#grSupplier").value;
    var s = allSuppliers.find(function(x){ return String(x.id) === sid; });
    if (!s) return ($("#grMsg").textContent = "Select a supplier first.");
    var name = $("#grProd").value.trim(), qty = Number($("#grQty").value||0);
    if (!name) return ($("#grMsg").textContent = "Select a product.");
    if (qty <= 0) return ($("#grMsg").textContent = "Qty must be > 0.");
    cart.push({ rowId: Date.now(), productName: name, supplierId: s.id, supplierName: s.name, qty, cost: Number($("#grCost").value||0), selling: Number($("#grSelling").value||0) });
    $("#grQty").value = ""; $("#grMsg").textContent = "Added \u2705"; renderCart();
  });

  $("#grRemove").addEventListener("click", function() {
    if (!selectedRow) return ($("#grMsg").textContent = "Select a row first.");
    cart = cart.filter(function(x){ return String(x.rowId) !== selectedRow; }); selectedRow = null; renderCart();
  });
  $("#grClear").addEventListener("click", function(){ cart = []; selectedRow = null; renderCart(); });

  $("#grSave").addEventListener("click", async function() {
    if (!cart.length) return ($("#grMsg").textContent = "Nothing to save.");
    var sid = $("#grSupplier").value;
    var s = allSuppliers.find(function(x){ return String(x.id) === sid; });
    if (!s) return ($("#grMsg").textContent = "Select a supplier.");
    var invoiceNo = $("#grInvoiceNo").value.trim() || genInvoiceNo(getShopInitials(s.name), currentUser.shopId, "gr_" + s.id);
    var total = cart.reduce(function(sum,x){ return sum + x.selling*x.qty; }, 0);
    try {
      await api("POST", "/goods-received", { shopId: currentUser.shopId, supplierId: s.id, invoiceNo, invoiceDate: $("#grInvoiceDate").value||null, enteredBy: currentUser.id, total, items: cart });

      if ($("#grPrint").checked) {
        var ss = getShopSettings();
        var now = new Date().toLocaleString();
        var rows = cart.map(function(l){ return "<tr><td>" + esc(l.productName) + "</td><td>" + l.qty + "</td><td>" + ghc(l.cost) + "</td><td>" + ghc(l.selling) + "</td></tr>"; }).join("");
        printReceipt("<!DOCTYPE html><html><head><style>body{font-family:Arial,sans-serif;font-size:13px;padding:16px;max-width:320px}table{width:100%;border-collapse:collapse}td,th{padding:4px 6px;border-bottom:1px solid #eee}</style></head><body>" +
          '<div style="text-align:center;font-weight:700;font-size:11px;margin-bottom:4px">RECEIPT \u2014 GOODS RECEIVED</div>' +
          shopHeader(ss) +
          '<div style="font-size:11px;margin-bottom:8px">Invoice: <b>' + esc(invoiceNo) + "</b><br>Date: " + now + "<br>Supplier: <b>" + esc(s.name) + "</b></div>" +
          "<table><thead><tr><th>Product</th><th>Qty</th><th>Cost</th><th>Selling</th></tr></thead><tbody>" + rows + "</tbody></table>" +
          '<div style="font-weight:700;text-align:right;margin-top:8px">TOTAL: ' + ghc(total) + "</div>" +
          receiptFooter() + "</body></html>");
      }

      allProducts = await api("GET", "/products/" + currentUser.shopId);
      cart = []; selectedRow = null; renderCart(); renderProdList();
      $("#grInvoiceNo").value = ""; $("#grProd").value = ""; $("#grCost").value = ""; $("#grSelling").value = ""; $("#grStock").value = "";
      $("#grMsg").textContent = "Saved \u2705 Stock updated.";
    } catch(err) { $("#grMsg").textContent = err.message; }
  });

  var res2 = await Promise.all([api("GET", "/products/" + currentUser.shopId), api("GET", "/suppliers/" + currentUser.shopId)]);
  allProducts = res2[0]; allSuppliers = res2[1];
  $("#grSupplier").innerHTML = allSuppliers.map(function(s){ return '<option value="' + s.id + '">' + esc(s.name) + '</option>'; }).join("") || '<option value="">No suppliers</option>';
  renderProdList(); renderCart();
}

/* ==============================================
   CUSTOMER GOODS (WHOLESALE)
============================================== */
async function customerGoodsWholesale() {
  pageTitle.textContent = "Customer Goods (Wholesale)";
  var allProducts = [], allCustomers = [], cart = [], selectedRow = null;

  screen.innerHTML =
    '<div class="panel" style="margin-bottom:10px">' +
      '<div class="rowLine">' +
        '<div style="flex:1"><div class="lbl">Select Customer</div><select id="cgCustomer"></select></div>' +
        '<div style="flex:1"><div class="lbl">Invoice No (leave blank for auto)</div><input id="cgInvoice"/></div>' +
        '<div style="flex:1"><div class="lbl">Date</div><input id="cgDate" type="date"/></div>' +
      '</div>' +
    '</div>' +
    '<div class="grid2">' +
      '<div class="panel">' +
        '<h3 style="margin:0 0 10px">Product List</h3>' +
        '<input id="cgFind" placeholder="Search products..."/>' +
        '<div class="product-list-wrap">' +
          '<table class="table" id="cgPTable"><thead><tr><th>Product</th><th>Stock</th><th>Wholesale</th></tr></thead><tbody></tbody></table>' +
        '</div>' +
      '</div>' +
      '<div class="panel">' +
        '<h3 style="margin:0 0 10px">Recording Goods for Customer</h3>' +
        '<div class="grid3">' +
          '<div><div class="lbl">Product</div><input id="cgProd" list="cgProdList" placeholder="Type to search..."/><datalist id="cgProdList"></datalist></div>' +
          '<div><div class="lbl">Wholesale Price</div><input id="cgPrice" disabled/></div>' +
          '<div><div class="lbl">Qty</div><input id="cgQty" type="number" step="1"/><div style="color:var(--muted);font-size:11px;margin-top:4px">IN STOCK: <b id="cgStock">0</b></div></div>' +
        '</div>' +
        '<div class="btnRow">' +
          '<button class="btn" id="cgAdd">ADD</button>' +
          '<button class="btn2" id="cgRemove">REMOVE</button>' +
          '<button class="btn2" id="cgClear">CLEAR ALL</button>' +
        '</div>' +
        '<div class="table-wrap">' +
          '<table class="table" id="cgTable"><thead><tr><th>Product</th><th>Qty</th><th>Wholesale</th><th>Total</th></tr></thead><tbody></tbody></table>' +
        '</div>' +
        '<div class="totalLine"><div>TOTAL AMOUNT</div><div id="cgTotal">' + ghc(0) + '</div></div>' +
        '<div style="display:flex;justify-content:flex-end;align-items:center;gap:12px;margin-top:10px">' +
          '<label class="print-check-row"><input type="checkbox" id="cgPrint"/> Print Invoice</label>' +
          '<button class="btn" id="cgSave">SAVE</button>' +
        '</div>' +
        '<div id="cgMsg" class="msg"></div>' +
      '</div>' +
    '</div>';

  function renderProdList() {
    var q = ($("#cgFind").value||"").toLowerCase();
    var list = allProducts.filter(function(p){ return (p.name||"").toLowerCase().includes(q); });
    $("#cgPTable tbody").innerHTML = list.map(function(p){ return '<tr data-id="' + p.id + '" style="cursor:pointer"><td>' + esc(p.name) + '</td><td>' + (p.qty||0) + '</td><td>' + ghc(p.wholesale||0) + '</td></tr>'; }).join("") || '<tr><td colspan="3" style="color:var(--muted)">No products.</td></tr>';
    $("#cgPTable tbody").querySelectorAll("tr[data-id]").forEach(function(tr) {
      tr.addEventListener("click", function() {
        var p = allProducts.find(function(x){ return String(x.id) === tr.dataset.id; }); if (!p) return;
        $("#cgProd").value = p.name; $("#cgPrice").value = ghc(p.wholesale||0); $("#cgStock").textContent = p.qty||0;
      });
    });
    $("#cgProdList").innerHTML = allProducts.map(function(p){ return '<option value="' + esc(p.name) + '"></option>'; }).join("");
  }

  function renderCart() {
    $("#cgTable tbody").innerHTML = cart.map(function(l){ return '<tr data-row="' + l.rowId + '" style="cursor:pointer"><td>' + esc(l.productName) + '</td><td>' + l.qty + '</td><td>' + ghc(l.price) + '</td><td>' + ghc(l.price*l.qty) + '</td></tr>'; }).join("") || '<tr><td colspan="4" style="color:var(--muted)">No items.</td></tr>';
    $("#cgTable tbody").querySelectorAll("tr[data-row]").forEach(function(tr) {
      tr.addEventListener("click", function(){ selectedRow = tr.dataset.row; $("#cgMsg").textContent = "Row selected \u2705"; });
    });
    $("#cgTotal").textContent = ghc(cart.reduce(function(s,x){ return s + x.price*x.qty; }, 0));
  }

  $("#cgFind").addEventListener("input", renderProdList);
  $("#cgProd").addEventListener("input", function() {
    var p = allProducts.find(function(x){ return x.name.toLowerCase() === $("#cgProd").value.trim().toLowerCase(); });
    if (p) { $("#cgPrice").value = ghc(p.wholesale||0); $("#cgStock").textContent = p.qty||0; }
  });

  $("#cgAdd").addEventListener("click", function() {
    var name = $("#cgProd").value.trim(), qty = Number($("#cgQty").value||0);
    var p = allProducts.find(function(x){ return x.name.toLowerCase() === name.toLowerCase(); });
    if (!p) return ($("#cgMsg").textContent = "Select a valid product.");
    if (qty <= 0) return ($("#cgMsg").textContent = "Qty must be > 0.");
    if (qty > p.qty) return ($("#cgMsg").textContent = "Not enough stock.");
    cart.push({ rowId: Date.now(), productId: p.id, productName: p.name, qty, price: Number(p.wholesale||0) });
    $("#cgQty").value = ""; $("#cgMsg").textContent = "Added \u2705"; renderCart();
  });

  $("#cgRemove").addEventListener("click", function() {
    if (!selectedRow) return ($("#cgMsg").textContent = "Select a row first.");
    cart = cart.filter(function(x){ return String(x.rowId) !== selectedRow; }); selectedRow = null; renderCart();
  });
  $("#cgClear").addEventListener("click", function(){ cart = []; selectedRow = null; renderCart(); });

  $("#cgSave").addEventListener("click", async function() {
    if (!cart.length) return ($("#cgMsg").textContent = "Nothing to save.");
    var cid = $("#cgCustomer").value;
    var customer = allCustomers.find(function(c){ return String(c.id) === cid; });
    if (!customer) return ($("#cgMsg").textContent = "Select a customer.");
    var total = cart.reduce(function(s,x){ return s + x.price*x.qty; }, 0);
    var custInitials = getShopInitials(customer.account_name);
    var invNo = $("#cgInvoice").value.trim() || genInvoiceNo(custInitials, currentUser.shopId, "cg_" + cid);

    try {
      await api("POST", "/wholesale-sales", { shopId: currentUser.shopId, customerId: cid, customerName: customer.account_name, invoiceNo: invNo, date: $("#cgDate").value || today(), enteredBy: currentUser.id, total, items: cart });
      for (var i=0; i<cart.length; i++) {
        var item = cart[i];
        var p = allProducts.find(function(x){ return x.id === item.productId; });
        if (p) await api("PUT", "/products/" + p.id + "/qty", { qty: Math.max(0, Number(p.qty||0) - item.qty) });
      }
      await api("PUT", "/customers/" + cid, { accountName: customer.account_name, location: customer.location, officeTel: customer.office_tel, whatsapp: customer.whatsapp, balance: Number(customer.balance||0) + total, contactName: customer.contact_name, contactTel: customer.contact_tel });

      if ($("#cgPrint").checked) {
        var ss = getShopSettings();
        var now = new Date().toLocaleString();
        var rows = cart.map(function(l){ return "<tr><td>" + esc(l.productName) + "</td><td>" + l.qty + "</td><td>" + ghc(l.price) + "</td><td>" + ghc(l.price*l.qty) + "</td></tr>"; }).join("");
        printReceipt("<!DOCTYPE html><html><head><style>body{font-family:Arial,sans-serif;font-size:13px;padding:20px;max-width:420px}table{width:100%;border-collapse:collapse}td,th{padding:5px 8px;border-bottom:1px solid #eee}.title{font-size:16px;font-weight:700;text-align:center;margin-bottom:4px}</style></head><body>" +
          '<div class="title">INVOICE</div>' +
          shopHeader(ss) +
          '<div style="font-size:11px;margin-bottom:10px">Invoice No: <b>' + esc(invNo) + "</b><br>Date: " + now + "<br>Customer: <b>" + esc(customer.account_name) + "</b><br>Served by: " + esc(currentUser.fullName) + "</div>" +
          "<table><thead><tr><th>Product</th><th>Qty</th><th>Wholesale</th><th>Total</th></tr></thead><tbody>" + rows + "</tbody></table>" +
          '<div style="font-weight:700;text-align:right;margin-top:10px;font-size:15px">TOTAL: ' + ghc(total) + "</div>" +
          '<div style="margin-top:8px;font-size:11px">Outstanding Balance: ' + ghc(Number(customer.balance||0) + total) + "</div>" +
          receiptFooter() + "</body></html>");
      }

      var res2 = await Promise.all([api("GET", "/products/" + currentUser.shopId), api("GET", "/customers/" + currentUser.shopId)]);
      allProducts = res2[0]; allCustomers = res2[1];
      cart = []; selectedRow = null; renderCart(); renderProdList();
      $("#cgInvoice").value = ""; $("#cgProd").value = ""; $("#cgPrice").value = ""; $("#cgStock").textContent = "0";
      $("#cgMsg").textContent = "Saved \u2705 Stock + customer balance updated.";
    } catch(err) { $("#cgMsg").textContent = err.message; }
  });

  var r3 = await Promise.all([api("GET", "/products/" + currentUser.shopId), api("GET", "/customers/" + currentUser.shopId)]);
  allProducts = r3[0]; allCustomers = r3[1];
  $("#cgCustomer").innerHTML = allCustomers.map(function(c){ return '<option value="' + c.id + '">' + esc(c.account_name) + '</option>'; }).join("") || '<option value="">No customers</option>';
  renderProdList(); renderCart();
}

/* ==============================================
   ADJUSTMENT
============================================== */
async function adjustment() {
  pageTitle.textContent = "Stock Adjustment";
  var allProducts = [], cart = [], selectedRow = null;

  screen.innerHTML =
    '<div class="grid2">' +
      '<div class="panel">' +
        '<h3 style="margin:0 0 10px">Product List</h3>' +
        '<input id="adjFind" placeholder="Search products..."/>' +
        '<div class="product-list-wrap">' +
          '<table class="table" id="adjPTable"><thead><tr><th>Product</th><th>Stock</th></tr></thead><tbody></tbody></table>' +
        '</div>' +
      '</div>' +
      '<div class="panel">' +
        '<h3 style="margin:0 0 10px">Stock Adjustment Area</h3>' +
        '<div class="grid3">' +
          '<div><div class="lbl">Adjustment Type</div>' +
            '<select id="adjType">' +
              '<option value="damage">Damage Goods</option>' +
              '<option value="return_customer">Returned by Walk-in Customer</option>' +
              '<option value="return_supplier">Returned to Supplier</option>' +
            '</select>' +
          '</div>' +
          '<div><div class="lbl">Product</div><input id="adjProd" list="adjProdList" placeholder="Type to search..."/><datalist id="adjProdList"></datalist></div>' +
          '<div><div class="lbl">Quantity</div><input id="adjQty" type="number" step="1"/><div style="color:var(--muted);font-size:11px;margin-top:4px">IN STOCK: <b id="adjStock">0</b></div></div>' +
        '</div>' +
        '<div style="height:8px"></div>' +
        '<div class="lbl">Description / Reason</div>' +
        '<input id="adjDesc" placeholder="Enter reason for adjustment..." style="margin-bottom:10px"/>' +
        '<div class="btnRow">' +
          '<button class="btn" id="adjAdd">ADD TO LIST</button>' +
          '<button class="btn2" id="adjRemove">REMOVE</button>' +
          '<button class="btn2" id="adjClear">CLEAR ALL</button>' +
        '</div>' +
        '<div class="table-wrap">' +
          '<table class="table" id="adjTable">' +
            '<thead><tr><th>Type</th><th>Product</th><th>Qty</th><th>Description</th></tr></thead>' +
            '<tbody></tbody>' +
          '</table>' +
        '</div>' +
        '<div style="display:flex;justify-content:flex-end;align-items:center;gap:12px;margin-top:10px">' +
          '<label class="print-check-row"><input type="checkbox" id="adjPrint"/> Print Report</label>' +
          '<button class="btn" id="adjSave">SAVE ALL</button>' +
        '</div>' +
        '<div id="adjMsg" class="msg"></div>' +
      '</div>' +
    '</div>';

  var typeLabels = { damage: "Damage Goods", return_customer: "Return by Customer", return_supplier: "Return to Supplier" };

  function renderProdList() {
    var q = ($("#adjFind").value||"").toLowerCase();
    var list = allProducts.filter(function(p){ return (p.name||"").toLowerCase().includes(q); });
    $("#adjPTable tbody").innerHTML = list.map(function(p){ return '<tr data-id="' + p.id + '" style="cursor:pointer"><td>' + esc(p.name) + '</td><td>' + (p.qty||0) + '</td></tr>'; }).join("") || '<tr><td colspan="2" style="color:var(--muted)">No products.</td></tr>';
    $("#adjPTable tbody").querySelectorAll("tr[data-id]").forEach(function(tr) {
      tr.addEventListener("click", function() {
        var p = allProducts.find(function(x){ return String(x.id) === tr.dataset.id; }); if (!p) return;
        $("#adjProd").value = p.name; $("#adjStock").textContent = p.qty||0;
      });
    });
    $("#adjProdList").innerHTML = allProducts.map(function(p){ return '<option value="' + esc(p.name) + '"></option>'; }).join("");
  }

  function renderCart() {
    $("#adjTable tbody").innerHTML = cart.map(function(l){ return '<tr data-row="' + l.rowId + '" style="cursor:pointer"><td>' + esc(typeLabels[l.type]||l.type) + '</td><td>' + esc(l.productName) + '</td><td>' + l.qty + '</td><td>' + esc(l.description||"-") + '</td></tr>'; }).join("") || '<tr><td colspan="4" style="color:var(--muted)">No items yet.</td></tr>';
    $("#adjTable tbody").querySelectorAll("tr[data-row]").forEach(function(tr) {
      tr.addEventListener("click", function(){ selectedRow = tr.dataset.row; $("#adjMsg").textContent = "Row selected \u2705"; });
    });
  }

  $("#adjFind").addEventListener("input", renderProdList);
  $("#adjProd").addEventListener("input", function() {
    var p = allProducts.find(function(x){ return x.name.toLowerCase() === $("#adjProd").value.trim().toLowerCase(); });
    $("#adjStock").textContent = p ? (p.qty||0) : "0";
  });

  $("#adjAdd").addEventListener("click", function() {
    var name = $("#adjProd").value.trim(), qty = Number($("#adjQty").value||0);
    var p = allProducts.find(function(x){ return x.name.toLowerCase() === name.toLowerCase(); });
    if (!p) return ($("#adjMsg").textContent = "Select a valid product.");
    if (qty <= 0) return ($("#adjMsg").textContent = "Qty must be > 0.");
    var type = $("#adjType").value;
    cart.push({ rowId: Date.now(), type, productId: p.id, productName: p.name, qty, description: $("#adjDesc").value.trim() });
    $("#adjQty").value = ""; $("#adjDesc").value = ""; $("#adjMsg").textContent = "Added \u2705"; renderCart();
  });

  $("#adjRemove").addEventListener("click", function() {
    if (!selectedRow) return ($("#adjMsg").textContent = "Select a row first.");
    cart = cart.filter(function(x){ return String(x.rowId) !== selectedRow; }); selectedRow = null; renderCart();
  });
  $("#adjClear").addEventListener("click", function(){ cart = []; selectedRow = null; renderCart(); });

  $("#adjSave").addEventListener("click", async function() {
    if (!cart.length) return ($("#adjMsg").textContent = "Nothing to save.");
    try {
      for (var i=0; i<cart.length; i++) {
        var item = cart[i];
        await api("POST", "/adjustments", { shopId: currentUser.shopId, type: item.type, productId: item.productId, productName: item.productName, qty: item.qty, description: item.description, enteredBy: currentUser.id });
      }

      if ($("#adjPrint").checked) {
        var ss = getShopSettings();
        var now = new Date().toLocaleString();
        var rows = cart.map(function(l){ return "<tr><td>" + esc(typeLabels[l.type]||l.type) + "</td><td>" + esc(l.productName) + "</td><td>" + l.qty + "</td><td>" + esc(l.description||"-") + "</td></tr>"; }).join("");
        printReceipt("<!DOCTYPE html><html><head><style>body{font-family:Arial,sans-serif;font-size:13px;padding:16px;max-width:400px}table{width:100%;border-collapse:collapse}td,th{padding:5px 8px;border-bottom:1px solid #eee}</style></head><body>" +
          '<div style="text-align:center;font-weight:700;margin-bottom:4px">STOCK ADJUSTMENT REPORT</div>' +
          shopHeader(ss) +
          '<div style="font-size:11px;margin-bottom:8px">Date: ' + now + "<br>By: " + esc(currentUser.fullName) + "</div>" +
          "<table><thead><tr><th>Type</th><th>Product</th><th>Qty</th><th>Reason</th></tr></thead><tbody>" + rows + "</tbody></table>" +
          receiptFooter() + "</body></html>");
      }

      allProducts = await api("GET", "/products/" + currentUser.shopId);
      cart = []; selectedRow = null; renderCart(); renderProdList();
      $("#adjProd").value = ""; $("#adjQty").value = ""; $("#adjDesc").value = "";
      $("#adjMsg").textContent = "Saved \u2705 Stock quantities updated.";
    } catch(err) { $("#adjMsg").textContent = err.message; }
  });

  allProducts = await api("GET", "/products/" + currentUser.shopId);
  renderProdList(); renderCart();
}

/* ==============================================
   CUSTOMER PAYMENTS
============================================== */
async function customerPayments() {
  pageTitle.textContent = "Customer Payment Account";
  var allCustomers = [], allPayments = [], selectedCId = null;

  screen.innerHTML =
    '<div class="grid3">' +
      '<div class="panel">' +
        '<h3 style="margin:0 0 10px">Customers</h3>' +
        '<input id="cpFind" placeholder="Search customer..."/>' +
        '<div class="product-list-wrap">' +
          '<table class="table" id="cpTable"><thead><tr><th>Account</th><th>Balance</th></tr></thead><tbody></tbody></table>' +
        '</div>' +
      '</div>' +
      '<div class="panel">' +
        '<h3 style="margin:0 0 10px">Account Info</h3>' +
        '<div class="lbl">Account Name</div><div id="cpName" style="font-weight:700;margin-bottom:10px">-</div>' +
        '<div class="lbl">Current Balance</div><div id="cpBal" style="font-weight:700;font-size:18px;margin-bottom:10px">' + ghc(0) + '</div>' +
        '<div class="lbl">Last Payment</div><div id="cpLast" style="font-weight:700;margin-bottom:10px">' + ghc(0) + '</div>' +
      '</div>' +
      '<div class="panel">' +
        '<h3 style="margin:0 0 10px">Record Payment</h3>' +
        '<div class="lbl">Current Balance</div><div id="payCur" style="font-weight:700;margin-bottom:10px">' + ghc(0) + '</div>' +
        '<div class="lbl">Payment Method</div>' +
        '<select id="payMethod" style="margin-bottom:10px"><option>Mobile Money</option><option>Cash</option><option>Cheque</option></select>' +
        '<div class="lbl">Amount Paid</div>' +
        '<input id="payAmt" type="number" step="0.01" placeholder="0.00" style="margin-bottom:10px"/>' +
        '<div class="lbl">Remaining</div><div id="payRemain" style="font-weight:700;margin-bottom:16px">' + ghc(0) + '</div>' +
        '<div style="display:flex;align-items:center;gap:12px">' +
          '<label class="print-check-row"><input type="checkbox" id="payPrint"/> Print Receipt</label>' +
          '<button class="btn" id="paySave">SAVE</button>' +
          '<button class="btn2" id="payDisplay">DISPLAY</button>' +
        '</div>' +
        '<div id="payMsg" class="msg"></div>' +
      '</div>' +
    '</div>';

  function getCust() { return allCustomers.find(function(c){ return String(c.id) === String(selectedCId); }) || null; }

  function refreshPanel() {
    var c = getCust();
    if (!c) { $("#cpName").textContent = "-"; ["#cpBal","#cpLast","#payCur","#payRemain"].forEach(function(s){ $(s).textContent = ghc(0); }); return; }
    var bal = Number(c.balance||0);
    var lastPay = allPayments.filter(function(p){ return String(p.customer_id) === String(c.id); }).sort(function(a,b){ return (b.created_at||"").localeCompare(a.created_at||""); })[0];
    $("#cpName").textContent = c.account_name;
    $("#cpBal").textContent = ghc(bal);
    $("#cpLast").textContent = ghc(lastPay ? lastPay.amount : 0);
    $("#payCur").textContent = ghc(bal);
    $("#payRemain").textContent = ghc(bal - Number($("#payAmt").value||0));
  }

  function renderList() {
    var q = ($("#cpFind").value||"").toLowerCase();
    var list = allCustomers.filter(function(c){ return (c.account_name||"").toLowerCase().includes(q); });
    $("#cpTable tbody").innerHTML = list.map(function(c){ return '<tr data-id="' + c.id + '" style="cursor:pointer"><td>' + esc(c.account_name) + '</td><td>' + ghc(c.balance||0) + '</td></tr>'; }).join("") || '<tr><td colspan="2" style="color:var(--muted)">No customers.</td></tr>';
    $("#cpTable tbody").querySelectorAll("tr[data-id]").forEach(function(tr) {
      tr.addEventListener("click", function(){ selectedCId = tr.dataset.id; refreshPanel(); $("#payMsg").textContent = "Customer selected \u2705"; });
    });
  }

  $("#cpFind").addEventListener("input", renderList);
  $("#payAmt").addEventListener("input", refreshPanel);

  $("#paySave").addEventListener("click", async function() {
    var c = getCust();
    if (!c) return ($("#payMsg").textContent = "Select a customer first.");
    var amount = Number($("#payAmt").value||0);
    if (amount <= 0) return ($("#payMsg").textContent = "Amount must be > 0.");
    var payMethod = $("#payMethod").value;
    try {
      await api("POST", "/customer-payments", { shopId: currentUser.shopId, customerId: c.id, amount, paymentMode: payMethod, note: "" });

      if ($("#payPrint").checked) {
        var ss = getShopSettings();
        var now = new Date().toLocaleString();
        var remaining = Number(c.balance||0) - amount;
        printReceipt("<!DOCTYPE html><html><head><style>body{font-family:Arial,sans-serif;font-size:13px;padding:16px;max-width:320px}</style></head><body>" +
          '<div style="text-align:center;font-weight:700;font-size:11px;margin-bottom:4px">PAYMENT RECEIPT</div>' +
          shopHeader(ss) +
          '<div style="font-size:11px;margin-bottom:10px">Date: ' + now + "<br>Customer: <b>" + esc(c.account_name) + "</b></div>" +
          '<table style="width:100%;border-collapse:collapse">' +
          "<tr><td style='padding:4px 0'>Payment Method</td><td style='text-align:right;font-weight:700'>" + esc(payMethod) + "</td></tr>" +
          "<tr><td style='padding:4px 0'>Amount Paid</td><td style='text-align:right;font-weight:700;color:green'>" + ghc(amount) + "</td></tr>" +
          "<tr><td style='padding:4px 0'>Previous Balance</td><td style='text-align:right'>" + ghc(c.balance||0) + "</td></tr>" +
          "<tr><td style='padding:4px 0'>Remaining Balance</td><td style='text-align:right;font-weight:700'>" + ghc(remaining) + "</td></tr>" +
          "</table>" +
          receiptFooter() + "</body></html>");
      }

      $("#payMsg").textContent = "Saved \u2705 Balance updated.";
      $("#payAmt").value = "";
      var rr = await Promise.all([api("GET", "/customers/" + currentUser.shopId), api("GET", "/customer-payments/" + currentUser.shopId)]);
      allCustomers = rr[0]; allPayments = rr[1];
      renderList(); refreshPanel();
    } catch(err) { $("#payMsg").textContent = err.message; }
  });

  $("#payDisplay").addEventListener("click", function() {
    var c = getCust(); if (!c) return ($("#payMsg").textContent = "Select a customer first.");
    var payments = allPayments.filter(function(p){ return String(p.customer_id) === String(c.id); }).sort(function(a,b){ return (a.created_at||"").localeCompare(b.created_at||""); });
    var ss = getShopSettings();
    var rows = payments.map(function(p){ return "<tr><td>" + esc((p.created_at||"").slice(0,10)) + "</td><td>" + esc(p.payment_mode) + "</td><td>" + ghc(p.amount) + "</td></tr>"; }).join("");
    var w = window.open("","_blank");
    w.document.write("<!DOCTYPE html><html><head><style>body{font-family:Arial,sans-serif;padding:20px}table{width:100%;border-collapse:collapse}td,th{padding:6px 8px;border-bottom:1px solid #eee}</style></head><body>" + shopHeader(ss) + "<h3>Customer Payment Statement</h3><p><b>Account:</b> " + esc(c.account_name) + "<br><b>Balance:</b> " + ghc(c.balance||0) + "</p><table><thead><tr><th>Date</th><th>Method</th><th>Amount</th></tr></thead><tbody>" + rows + "</tbody></table>" + receiptFooter() + "</body></html>");
    w.document.close(); w.print();
  });

  var rr2 = await Promise.all([api("GET", "/customers/" + currentUser.shopId), api("GET", "/customer-payments/" + currentUser.shopId)]);
  allCustomers = rr2[0]; allPayments = rr2[1];
  renderList();
}

/* ==============================================
   MOMO ACCOUNT
============================================== */
async function momoAccount() {
  pageTitle.textContent = "MoMo Account";
  var mk = "momo_" + currentUser.shopId;

  screen.innerHTML =
    '<div class="panel" style="max-width:700px">' +
      '<h3 style="margin:0 0 16px">📱 Mobile Money Account</h3>' +
      '<div class="cards" style="grid-template-columns:repeat(2,1fr);margin-bottom:16px">' +
        '<div class="card"><div class="label">Current MoMo Balance</div><div class="value" style="color:var(--success)">' + ghc(Number(localStorage.getItem(mk)||0)) + '</div></div>' +
        '<div class="card"><div class="label">Tracked Since</div><div class="value" style="font-size:16px">Login</div></div>' +
      '</div>' +
      '<div class="rowLine" style="margin-bottom:12px">' +
        '<div style="flex:1"><div class="lbl">From</div><input id="momoFrom" type="date" value="' + today() + '"/></div>' +
        '<div style="flex:1"><div class="lbl">To</div><input id="momoTo" type="date" value="' + today() + '"/></div>' +
        '<div style="display:flex;align-items:flex-end"><button class="btn" id="momoSearch">SEARCH</button></div>' +
      '</div>' +
      '<div class="table-wrap">' +
        '<table class="table" id="momoTable">' +
          '<thead><tr><th>Date</th><th>Description</th><th>Amount</th><th>Type</th></tr></thead>' +
          '<tbody><tr><td colspan="4" style="color:var(--muted)">Click SEARCH to load.</td></tr></tbody>' +
        '</table>' +
      '</div>' +
      '<div class="totalLine"><div>NET TOTAL</div><div id="momoTotal">' + ghc(0) + '</div></div>' +
    '</div>';

  $("#momoSearch").addEventListener("click", async function() {
    var from = $("#momoFrom").value, to = $("#momoTo").value;
    try {
      var results = await Promise.all([api("GET", "/sales/" + currentUser.shopId), api("GET", "/expenses/" + currentUser.shopId)]);
      var sales = results[0], expenses = results[1];
      var allRows = [];

      sales.filter(function(s){ var d=(s.sale_date||"").slice(0,10); return s.payment_mode==="Mobile Money" && d>=from && d<=to; })
        .forEach(function(s){ allRows.push({ date:(s.sale_date||"").slice(0,10), desc:"Cash Sale", amount:Number(s.total||0), type:"in" }); });

      expenses.filter(function(e){ var d=(e.created_at||"").slice(0,10); return e.mode==="Mobile Money" && d>=from && d<=to; })
        .forEach(function(e){ allRows.push({ date:(e.created_at||"").slice(0,10), desc:"Expense: "+e.description, amount:-Number(e.amount||0), type:"out" }); });

      allRows.sort(function(a,b){ return a.date.localeCompare(b.date); });

      $("#momoTable tbody").innerHTML = allRows.map(function(r){
        return '<tr><td>' + esc(r.date) + '</td><td>' + esc(r.desc) + '</td><td style="color:' + (r.type==="in"?"var(--success)":"var(--danger)") + ';font-weight:700">' + (r.type==="in"?"+":"") + ghc(Math.abs(r.amount)) + '</td><td>' + (r.type==="in"?"Received":"Paid Out") + '</td></tr>';
      }).join("") || '<tr><td colspan="4" style="color:var(--muted)">No MoMo transactions in this range.</td></tr>';

      $("#momoTotal").textContent = ghc(allRows.reduce(function(s,r){ return s + r.amount; }, 0));
    } catch(err) {
      $("#momoTable tbody").innerHTML = '<tr><td colspan="4" style="color:var(--danger)">' + esc(err.message) + '</td></tr>';
    }
  });
}

/* ==============================================
   EXPENSE ACCOUNTS
============================================== */
function expenseAccountsSetup() {
  pageTitle.textContent = "Expense Accounts";
  var selectedId = null;

  screen.innerHTML =
    '<div class="grid2">' +
      '<div class="panel">' +
        '<h3 style="margin:0 0 10px">Expense Accounts List</h3>' +
        '<input id="eaFind" placeholder="Search account..."/>' +
        '<div class="product-list-wrap">' +
          '<table class="table" id="eaTable"><thead><tr><th>Account Name</th><th>Group</th></tr></thead><tbody></tbody></table>' +
        '</div>' +
      '</div>' +
      '<div class="panel">' +
        '<h3 style="margin:0 0 10px">Expense Account Setup</h3>' +
        '<div class="lbl">Account Name</div>' +
        '<input id="eaName" placeholder="e.g. Transport, Staff Salary" style="margin-bottom:10px"/>' +
        '<div class="lbl">Group Name (optional)</div>' +
        '<input id="eaGroup" placeholder="N/A" style="margin-bottom:16px"/>' +
        '<div class="btnRow">' +
          '<button class="btn" id="eaSave">SAVE</button>' +
          '<button class="btn2" id="eaEdit">EDIT</button>' +
          '<button class="btn2" id="eaRemove">REMOVE</button>' +
          '<button class="btn2" id="eaClose">CLOSE</button>' +
        '</div>' +
        '<div id="eaMsg" class="msg"></div>' +
      '</div>' +
    '</div>';

  function render() {
    var all = getAccounts(currentUser.shopId);
    var q = ($("#eaFind").value||"").toLowerCase();
    var list = all.filter(function(a){ return (a.name||"").toLowerCase().includes(q); });
    $("#eaTable tbody").innerHTML = list.map(function(a){ return '<tr data-id="' + a.id + '" style="cursor:pointer"><td>' + esc(a.name) + '</td><td>' + esc(a.group||"N/A") + '</td></tr>'; }).join("") || '<tr><td colspan="2" style="color:var(--muted)">No accounts yet.</td></tr>';
    $("#eaTable tbody").querySelectorAll("tr[data-id]").forEach(function(tr) {
      tr.addEventListener("click", function() {
        var a = getAccounts(currentUser.shopId).find(function(x){ return x.id === tr.dataset.id; }); if (!a) return;
        selectedId = a.id; $("#eaName").value = a.name||""; $("#eaGroup").value = a.group||"";
        $("#eaMsg").textContent = "Selected \u2705";
      });
    });
  }

  $("#eaFind").addEventListener("input", render);
  $("#eaSave").addEventListener("click", function() {
    var name = $("#eaName").value.trim(); if (!name) return ($("#eaMsg").textContent = "Name required.");
    var group = $("#eaGroup").value.trim()||"N/A";
    var all = getAccounts(currentUser.shopId);
    if (selectedId) { all = all.map(function(x){ return x.id === selectedId ? Object.assign({},x,{name,group}) : x; }); $("#eaMsg").textContent = "Updated \u2705"; }
    else { all.push({ id: "ea_" + Date.now(), name, group }); $("#eaMsg").textContent = "Saved \u2705"; }
    saveAccounts(currentUser.shopId, all); selectedId = null; $("#eaName").value = ""; $("#eaGroup").value = ""; render();
  });
  $("#eaEdit").addEventListener("click", function(){ if (!selectedId) return ($("#eaMsg").textContent = "Select an account first."); $("#eaMsg").textContent = "Edit then SAVE \u2705"; });
  $("#eaRemove").addEventListener("click", function() {
    if (!selectedId) return ($("#eaMsg").textContent = "Select an account first.");
    saveAccounts(currentUser.shopId, getAccounts(currentUser.shopId).filter(function(x){ return x.id !== selectedId; }));
    selectedId = null; $("#eaName").value = ""; render(); $("#eaMsg").textContent = "Removed \u2705";
  });
  $("#eaClose").addEventListener("click", function(){ load("dashboard"); });
  render();
}

/* ==============================================
   RECORD EXPENSE
============================================== */
async function recordExpense() {
  pageTitle.textContent = "Record Expenses";
  var accounts = getAccounts(currentUser.shopId);
  var accOpts = accounts.map(function(a){ return '<option value="' + esc(a.name) + '">' + esc(a.name) + '</option>'; }).join("") || '<option value="">No accounts \u2014 create them first</option>';

  screen.innerHTML =
    '<div class="panel" style="max-width:600px">' +
      '<h3 style="margin:0 0 16px">Record Expense</h3>' +
      '<div class="grid3">' +
        '<div><div class="lbl">Recipient</div><input id="exRec"/></div>' +
        '<div><div class="lbl">Authorised By</div><input id="exAuth"/></div>' +
        '<div><div class="lbl">Mode of Payment</div><select id="exMode"><option>Mobile Money</option><option>Cheque</option><option>Cash</option></select></div>' +
      '</div>' +
      '<div style="height:10px"></div>' +
      '<div class="grid3">' +
        '<div style="grid-column:span 2"><div class="lbl">Description</div><input id="exDesc"/></div>' +
        '<div><div class="lbl">Date</div><input id="exDate" type="date"/></div>' +
      '</div>' +
      '<div style="height:10px"></div>' +
      '<div class="grid3">' +
        '<div><div class="lbl">Account Type</div><select id="exAcc">' + accOpts + '</select></div>' +
        '<div><div class="lbl">Amount</div><input id="exAmt" type="number" step="0.01" placeholder="GH\u20B5 0.00"/></div>' +
        '<div style="display:flex;align-items:flex-end;gap:8px"><button class="btn" id="exSave">SAVE</button><button class="btn2" id="exClear">CLEAR</button></div>' +
      '</div>' +
      '<div id="exMsg" class="msg"></div>' +
    '</div>';

  $("#exDate").value = today();

  $("#exSave").addEventListener("click", async function() {
    var accountName = $("#exAcc").value;
    var recipient = $("#exRec").value.trim(), description = $("#exDesc").value.trim();
    var amount = Number($("#exAmt").value||0), mode = $("#exMode").value;
    if (!recipient || !description) return ($("#exMsg").textContent = "Recipient and description required.");
    if (amount <= 0) return ($("#exMsg").textContent = "Amount must be > 0.");
    try {
      await api("POST", "/expenses", { shopId: currentUser.shopId, accountName, description, recipient, mode, amount, enteredBy: currentUser.id });
      if (mode === "Mobile Money") {
        var mk = "momo_" + currentUser.shopId;
        localStorage.setItem(mk, Math.max(0, Number(localStorage.getItem(mk)||0) - amount));
      }
      $("#exMsg").textContent = "Saved \u2705";
      ["#exRec","#exDesc","#exAuth","#exAmt"].forEach(function(s){ $(s).value = ""; });
      $("#exDate").value = today();
    } catch(err) { $("#exMsg").textContent = err.message; }
  });

  $("#exClear").addEventListener("click", function() {
    ["#exRec","#exDesc","#exAuth","#exAmt"].forEach(function(s){ $(s).value = ""; });
    $("#exDate").value = today(); $("#exMsg").textContent = "";
  });
}

/* ==============================================
   EXPENSES REPORT
============================================== */
async function expensesReport() {
  pageTitle.textContent = "Expenses Report";

  screen.innerHTML =
    '<div class="panel">' +
      '<h3 style="margin:0 0 12px">View Expenses</h3>' +
      '<div class="rowLine">' +
        '<div style="flex:1"><div class="lbl">From</div><input id="erFrom" type="date"/></div>' +
        '<div style="flex:1"><div class="lbl">To</div><input id="erTo" type="date"/></div>' +
        '<div style="display:flex;align-items:flex-end;gap:8px">' +
          '<button class="btn" id="erSearch">SEARCH</button>' +
          '<button class="btn2" id="erDisplay">DISPLAY</button>' +
          '<button class="btn2" id="erClose">CLOSE</button>' +
        '</div>' +
      '</div>' +
      '<div style="height:10px"></div>' +
      '<input id="erFind" placeholder="Search description/recipient..." style="margin-bottom:10px"/>' +
      '<div class="table-wrap">' +
        '<table class="table" id="erTable">' +
          '<thead><tr><th>DATE</th><th>ACCOUNT</th><th>DESCRIPTION</th><th>RECIPIENT</th><th>MODE</th><th>AMOUNT</th></tr></thead>' +
          '<tbody></tbody>' +
        '</table>' +
      '</div>' +
      '<div class="totalLine"><div>TOTAL</div><div id="erTotal">' + ghc(0) + '</div></div>' +
    '</div>';

  var t = today(); $("#erFrom").value = t; $("#erTo").value = t;
  var lastRows = [];

  function renderTable(rows) {
    var q = ($("#erFind").value||"").toLowerCase();
    var filtered = rows.filter(function(r){ return (r.account_name+" "+r.description+" "+r.recipient+" "+r.mode).toLowerCase().includes(q); });
    $("#erTable tbody").innerHTML = filtered.map(function(r){ return "<tr><td>" + esc((r.created_at||"").slice(0,10)) + "</td><td>" + esc(r.account_name) + "</td><td>" + esc(r.description) + "</td><td>" + esc(r.recipient) + "</td><td>" + esc(r.mode) + "</td><td>" + ghc(r.amount) + "</td></tr>"; }).join("") || '<tr><td colspan="6" style="color:var(--muted)">No results.</td></tr>';
    $("#erTotal").textContent = ghc(filtered.reduce(function(s,x){ return s + Number(x.amount||0); }, 0));
    lastRows = filtered;
  }

  $("#erSearch").addEventListener("click", async function() {
    try {
      var from = $("#erFrom").value, to = $("#erTo").value;
      var rows = await api("GET", "/expenses/" + currentUser.shopId);
      rows = rows.filter(function(r){ var d=(r.created_at||"").slice(0,10); return d>=from && d<=to; });
      renderTable(rows);
    } catch(err) { $("#erTable tbody").innerHTML = '<tr><td colspan="6" style="color:var(--danger)">' + esc(err.message) + '</td></tr>'; }
  });

  $("#erFind").addEventListener("input", function(){ renderTable(lastRows); });
  $("#erClose").addEventListener("click", function(){ load("dashboard"); });
  $("#erDisplay").addEventListener("click", function() {
    var ss = getShopSettings();
    var rows = lastRows.map(function(r){ return "<tr><td>" + esc((r.created_at||"").slice(0,10)) + "</td><td>" + esc(r.account_name) + "</td><td>" + esc(r.description) + "</td><td>" + esc(r.recipient) + "</td><td>" + esc(r.mode) + "</td><td>" + ghc(r.amount) + "</td></tr>"; }).join("");
    var w = window.open("","_blank");
    w.document.write("<!DOCTYPE html><html><head><style>body{font-family:Arial,sans-serif;padding:20px}table{width:100%;border-collapse:collapse}td,th{padding:6px 8px;border-bottom:1px solid #eee}</style></head><body>" + shopHeader(ss) + "<h2>Expenses Report</h2><p>" + esc($("#erFrom").value) + " to " + esc($("#erTo").value) + "</p><table><thead><tr><th>Date</th><th>Account</th><th>Description</th><th>Recipient</th><th>Mode</th><th>Amount</th></tr></thead><tbody>" + rows + "</tbody></table><p><b>Total: " + esc($("#erTotal").textContent) + "</b></p>" + receiptFooter() + "</body></html>");
    w.document.close(); w.print();
  });
  $("#erSearch").click();
}

/* ==============================================
   STOCK LEVEL — with charts
============================================== */
async function stockLevel() {
  pageTitle.textContent = "Stock Level";

  screen.innerHTML =
    '<div class="panel" style="margin-bottom:12px">' +
      '<h3 style="margin:0 0 10px">Stock Level</h3>' +
      '<input id="stFind" placeholder="Search product..." style="margin-bottom:10px"/>' +
      '<div class="table-wrap">' +
        '<table class="table" id="stTable">' +
          '<thead><tr><th>PRODUCT</th><th>SUPPLIER</th><th>CATEGORY</th><th>QTY</th><th>COST</th><th>SELLING</th><th>WHOLESALE</th><th>MARGIN</th></tr></thead>' +
          '<tbody><tr><td colspan="8" style="color:var(--muted)">Loading...</td></tr></tbody>' +
        '</table>' +
      '</div>' +
      '<div id="stTotals" style="margin-top:12px"></div>' +
    '</div>' +
    '<div class="grid2">' +
      '<div class="panel">' +
        '<h3 style="margin:0 0 12px">Expense Breakdown</h3>' +
        '<canvas id="donutChart" height="260"></canvas>' +
        '<div id="donutLegend" style="margin-top:10px;font-size:12px"></div>' +
      '</div>' +
      '<div class="panel">' +
        '<h3 style="margin:0 0 6px">Sales vs Purchases</h3>' +
        '<div style="display:flex;gap:8px;margin-bottom:10px">' +
          '<button class="btn2 period-btn active-period" data-p="7">7 Days</button>' +
          '<button class="btn2 period-btn" data-p="30">30 Days</button>' +
          '<button class="btn2 period-btn" data-p="90">90 Days</button>' +
        '</div>' +
        '<canvas id="barChart" height="260"></canvas>' +
      '</div>' +
    '</div>';

  var products = await api("GET", "/products/" + currentUser.shopId);
  var lowCount = products.filter(function(p){ return Number(p.qty||0) <= 5; }).length;

  function renderTable() {
    var q = ($("#stFind").value||"").toLowerCase();
    var list = products.filter(function(p){ return (p.name+" "+p.supplier+" "+p.category).toLowerCase().includes(q); });
    $("#stTable tbody").innerHTML = list.map(function(p) {
      var qty = Number(p.qty||0);
      var style = qty <= 5 ? ' style="background:rgba(220,38,38,0.06)"' : "";
      return '<tr' + style + '><td>' + esc(p.name) + '</td><td>' + esc(p.supplier||"-") + '</td><td>' + esc(p.category||"-") + '</td>' +
        '<td style="' + (qty<=5?"color:var(--danger);font-weight:700":"") + '">' + qty + '</td>' +
        '<td>' + ghc(p.cost||0) + '</td><td>' + ghc(p.selling||0) + '</td><td>' + ghc(p.wholesale||0) + '</td><td>' + ghc(p.margin||0) + '</td></tr>';
    }).join("") || '<tr><td colspan="8" style="color:var(--muted)">No products.</td></tr>';

    var totQty    = list.reduce(function(s,p){ return s + Number(p.qty||0); }, 0);
    var totCost   = list.reduce(function(s,p){ return s + Number(p.qty||0)*Number(p.cost||0); }, 0);
    var totSell   = list.reduce(function(s,p){ return s + Number(p.qty||0)*Number(p.selling||0); }, 0);
    var totMargin = list.reduce(function(s,p){ return s + Number(p.margin||0); }, 0);

    $("#stTotals").innerHTML =
      '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">' +
        '<div class="card"><div class="label">Total Items</div><div class="value">' + totQty + '</div></div>' +
        '<div class="card"><div class="label">Cost Value</div><div class="value" style="font-size:16px">' + ghc(totCost) + '</div></div>' +
        '<div class="card"><div class="label">Selling Value</div><div class="value" style="font-size:16px;color:var(--success)">' + ghc(totSell) + '</div></div>' +
        '<div class="card" style="' + (lowCount>0?"border-color:#fca5a5":"") + '"><div class="label" style="' + (lowCount>0?"color:var(--danger)":"") + '">Low Stock</div><div class="value" style="' + (lowCount>0?"color:var(--danger)":"") + '">' + lowCount + '</div></div>' +
      '</div>';
  }

  $("#stFind").addEventListener("input", renderTable);
  renderTable();

 // ---- DONUT CHART — Expense Accounts ----
var expenses = [];
try { expenses = await api("GET", "/expenses/" + currentUser.shopId); } catch(e){}

// Group expenses by account
var expByAcc = {};
expenses.forEach(function(e) {
  var key = e.account_name || "Other";
  expByAcc[key] = (expByAcc[key]||0) + Number(e.amount||0);
});
var expEntries = Object.keys(expByAcc).map(function(k){ return {name:k, val:expByAcc[k]}; })
  .sort(function(a,b){ return b.val - a.val; });

(function drawDonut() {
  var canvas = document.getElementById("donutChart");
  if (!canvas) return;
  var ctx = canvas.getContext("2d");
  var W = canvas.width = canvas.offsetWidth || 300;
  var H = canvas.height = 260;
  var cx = W/2, cy = H/2 - 10, R = Math.min(cx,cy) - 20, r = R * 0.55;
  var colors = ["#ef4444","#f97316","#f59e0b","#10b981","#3b82f6","#8b5cf6","#ec4899"];
  var total = expEntries.reduce(function(s,e){ return s + e.val; }, 0) || 1;
  var angle = -Math.PI/2;

  ctx.clearRect(0,0,W,H);
  if (expEntries.length === 0) {
    ctx.fillStyle = "#9ca3af"; ctx.font = "13px sans-serif"; ctx.textAlign = "center";
    ctx.fillText("No expense data yet", cx, cy); return;
  }

  expEntries.forEach(function(e, i) {
    var slice = (e.val/total) * Math.PI*2;
    ctx.beginPath(); ctx.moveTo(cx,cy);
    ctx.arc(cx,cy,R,angle,angle+slice); ctx.closePath();
    ctx.fillStyle = colors[i % colors.length]; ctx.fill();
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.stroke();
    angle += slice;
  });

  // center hole
  ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2);
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--card") || "#fff";
  ctx.fill();

  // center text
  ctx.fillStyle = "#6b7280"; ctx.font = "11px sans-serif"; ctx.textAlign = "center";
  ctx.fillText("Expenses", cx, cy - 4);
  ctx.fillStyle = "#1a1d2e"; ctx.font = "bold 13px sans-serif";
  ctx.fillText(ghc(total), cx, cy + 12);

  // legend
  var legendEl = document.getElementById("donutLegend");
  if (legendEl) {
    legendEl.innerHTML = expEntries.map(function(e, i) {
      var pct = ((e.val/total)*100).toFixed(1);
      return '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px">' +
        '<div style="display:flex;align-items:center;gap:6px">' +
          '<div style="width:10px;height:10px;border-radius:2px;background:' + colors[i%colors.length] + ';flex-shrink:0"></div>' +
          '<span style="font-size:11px;color:var(--text)">' + esc(e.name) + '</span>' +
        '</div>' +
        '<span style="font-size:11px;font-weight:600;color:var(--text)">' + pct + '%</span>' +
      '</div>';
    }).join("");
  }
})();

  // ---- BAR CHART ----
  var allSales = [], allGR = [];
  try {
    var rr = await Promise.all([api("GET", "/sales/" + currentUser.shopId), api("GET", "/goods-received/" + currentUser.shopId)]);
    allSales = rr[0]; allGR = rr[1];
  } catch(e){}

  function drawBar(days) {
    var canvas = document.getElementById("barChart");
    if (!canvas) return;
    var ctx = canvas.getContext("2d");
    var W = canvas.width = canvas.offsetWidth || 400;
    var H = canvas.height = 260;
    ctx.clearRect(0,0,W,H);

    var labels = [], salesData = [], grData = [];
    for (var i = days-1; i >= 0; i--) {
      var d = new Date(); d.setDate(d.getDate()-i);
      var ds = d.toISOString().slice(0,10);
      labels.push(ds.slice(5));
      salesData.push(allSales.filter(function(s){ return (s.sale_date||"").slice(0,10)===ds; }).reduce(function(a,s){ return a+Number(s.total||0); },0));
      grData.push(allGR.filter(function(g){ return (g.created_at||"").slice(0,10)===ds; }).reduce(function(a,g){ return a+Number(g.total||0); },0));
    }

    var maxVal = Math.max.apply(null, salesData.concat(grData).concat([1]));
    var pad = 40, bottom = 30, barW = Math.max(4, (W - pad - 20) / labels.length / 2 - 2);
    var chartH = H - bottom - 10;

    // axes
    ctx.strokeStyle = "#e5e7eb"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad,10); ctx.lineTo(pad, H-bottom); ctx.lineTo(W-10, H-bottom); ctx.stroke();

    labels.forEach(function(label, i) {
      var x = pad + i * ((W-pad-20)/labels.length) + (W-pad-20)/labels.length/2;
      var sw = salesData[i]/maxVal * chartH;
      var gw = grData[i]/maxVal * chartH;

      // sales bar (teal)
      ctx.fillStyle = "#10b981";
      ctx.fillRect(x - barW - 1, H - bottom - sw, barW, sw);

      // gr bar (amber)
      ctx.fillStyle = "#f59e0b";
      ctx.fillRect(x + 1, H - bottom - gw, barW, gw);

      // label
      if (i % Math.ceil(labels.length/8) === 0) {
        ctx.fillStyle = "#9ca3af"; ctx.font = "9px sans-serif"; ctx.textAlign = "center";
        ctx.fillText(label, x, H-bottom+14);
      }
    });

    // legend
    ctx.fillStyle = "#10b981"; ctx.fillRect(pad, H-bottom+20, 12, 8);
    ctx.fillStyle = "#6b7280"; ctx.font = "11px sans-serif"; ctx.textAlign = "left"; ctx.fillText("Sales", pad+16, H-bottom+28);
    ctx.fillStyle = "#f59e0b"; ctx.fillRect(pad+70, H-bottom+20, 12, 8);
    ctx.fillStyle = "#6b7280"; ctx.fillText("Purchases", pad+86, H-bottom+28);
  }

  drawBar(7);

  document.querySelectorAll(".period-btn").forEach(function(btn) {
    btn.addEventListener("click", function() {
      document.querySelectorAll(".period-btn").forEach(function(b){ b.classList.remove("active-period"); b.style.background=""; b.style.color=""; });
      btn.classList.add("active-period"); btn.style.background="var(--primary)"; btn.style.color="#fff";
      drawBar(Number(btn.dataset.p));
    });
  });

  // highlight first period button
  var firstBtn = document.querySelector(".period-btn");
  if (firstBtn) { firstBtn.style.background="var(--primary)"; firstBtn.style.color="#fff"; }
}

/* ==============================================
   DAILY STOCK LEVEL
============================================== */
async function dailyStockLevel() {
  pageTitle.textContent = "Daily Stock Level";

  screen.innerHTML =
    '<div class="panel">' +
      '<h3 style="margin:0 0 12px">Daily Stock Level \u2014 Products Sold</h3>' +
      '<div class="rowLine" style="margin-bottom:12px">' +
        '<div style="flex:1"><div class="lbl">Date</div><input id="dslDate" type="date" value="' + today() + '"/></div>' +
        '<div style="display:flex;align-items:flex-end"><button class="btn" id="dslSearch">SEARCH</button></div>' +
      '</div>' +
      '<div class="table-wrap">' +
        '<table class="table" id="dslTable">' +
          '<thead><tr><th>PRODUCT</th><th>QTY SOLD</th><th>SELLING PRICE</th><th>TOTAL SALES</th><th>COST</th><th>PROFIT MARGIN</th></tr></thead>' +
          '<tbody><tr><td colspan="6" style="color:var(--muted)">Click SEARCH to load.</td></tr></tbody>' +
        '</table>' +
      '</div>' +
      '<div class="totalLine"><div>TOTAL PROFIT</div><div id="dslTotal">' + ghc(0) + '</div></div>' +
    '</div>';

  $("#dslSearch").addEventListener("click", async function() {
    var date = $("#dslDate").value;
    try {
      var rr = await Promise.all([api("GET", "/sales/" + currentUser.shopId), api("GET", "/products/" + currentUser.shopId)]);
      var sales = rr[0], products = rr[1];
      var daySales = sales.filter(function(s){ return (s.sale_date||"").slice(0,10) === date; });
      var byProduct = {};
      daySales.forEach(function(sale) {
        (sale.items||[]).forEach(function(item) {
          if (!byProduct[item.product_name]) byProduct[item.product_name] = { qty:0, price:item.price, productName:item.product_name };
          byProduct[item.product_name].qty += Number(item.qty||0);
        });
      });
      var rows = Object.values(byProduct).map(function(r) {
        var prod = products.find(function(p){ return p.name === r.productName; });
        var cost = prod ? Number(prod.cost||0) : 0;
        var margin = (r.price - cost) * r.qty;
        return Object.assign({}, r, { cost, margin, total: r.price * r.qty });
      });
      $("#dslTable tbody").innerHTML = rows.map(function(r){ return "<tr><td>" + esc(r.productName) + "</td><td>" + r.qty + "</td><td>" + ghc(r.price) + "</td><td>" + ghc(r.total) + "</td><td>" + ghc(r.cost) + "</td><td style='color:var(--success);font-weight:600'>" + ghc(r.margin) + "</td></tr>"; }).join("") || '<tr><td colspan="6" style="color:var(--muted)">No sales on this date.</td></tr>';
      $("#dslTotal").textContent = ghc(rows.reduce(function(s,r){ return s + r.margin; }, 0));
    } catch(err) { $("#dslTable tbody").innerHTML = '<tr><td colspan="6" style="color:var(--danger)">' + esc(err.message) + '</td></tr>'; }
  });
  $("#dslSearch").click();
}

/* ==============================================
   DAILY SALES REPORT
============================================== */
async function dailySalesReport() {
  pageTitle.textContent = "Daily Sales Report";

  screen.innerHTML =
    '<div class="panel">' +
      '<h3 style="margin:0 0 12px">Daily Sales Report</h3>' +
      '<div class="rowLine">' +
        '<div style="flex:1"><div class="lbl">From</div><input id="dsFrom" type="date"/></div>' +
        '<div style="flex:1"><div class="lbl">To</div><input id="dsTo" type="date"/></div>' +
        '<div style="display:flex;align-items:flex-end;gap:8px">' +
          '<button class="btn" id="dsSearch">SEARCH</button>' +
          '<button class="btn2" id="dsDisplay">DISPLAY</button>' +
        '</div>' +
      '</div>' +
      '<div style="height:10px"></div>' +
      '<input id="dsFind" placeholder="Search product..." style="margin-bottom:10px"/>' +
      '<div class="table-wrap">' +
        '<table class="table" id="dsTable">' +
          '<thead><tr><th>DATE &amp; TIME</th><th>PRODUCT</th><th>QTY SOLD</th><th>PRICE</th><th>TOTAL</th><th>PAYMENT</th></tr></thead>' +
          '<tbody></tbody>' +
        '</table>' +
      '</div>' +
      '<div class="totalLine"><div>TOTAL</div><div id="dsTotal">' + ghc(0) + '</div></div>' +
    '</div>';

  var t = today(); $("#dsFrom").value = t; $("#dsTo").value = t;
  var lastRows = [];

  function renderTable(rows) {
    var q = ($("#dsFind").value||"").toLowerCase();
    var filtered = rows.filter(function(r){ return (r.product_name||"").toLowerCase().includes(q); });
    $("#dsTable tbody").innerHTML = filtered.map(function(r){ return "<tr><td>" + esc(r.sale_date ? new Date(r.sale_date).toLocaleString("en-GH", { timeZone: "Africa/Accra" }) : "-") + "</td><td>" + esc(r.product_name) + "</td><td>" + r.qty + "</td><td>" + ghc(r.price) + "</td><td>" + ghc(r.qty*r.price) + "</td><td>" + esc(r.payment_mode||"-") + "</td></tr>"; }).join("") || '<tr><td colspan="6" style="color:var(--muted)">No results.</td></tr>';
    $("#dsTotal").textContent = ghc(filtered.reduce(function(s,r){ return s + r.qty*r.price; }, 0));
    lastRows = filtered;
  }

  $("#dsSearch").addEventListener("click", async function() {
    try {
      var from = $("#dsFrom").value, to = $("#dsTo").value;
      var sales = await api("GET", "/sales/" + currentUser.shopId);
      var rows = [];
      sales.forEach(function(s) {
        var d = (s.sale_date||"").slice(0,10);
        if (d < from || d > to) return;
        (s.items||[]).forEach(function(item) { rows.push({ sale_date: s.sale_date, product_name: item.product_name, qty: item.qty, price: item.price, payment_mode: s.payment_mode||"-" }); });
      });
      renderTable(rows);
    } catch(err) { $("#dsTable tbody").innerHTML = '<tr><td colspan="6" style="color:var(--danger)">' + esc(err.message) + '</td></tr>'; }
  });

  $("#dsFind").addEventListener("input", function(){ renderTable(lastRows); });
  $("#dsDisplay").addEventListener("click", function() {
    var ss = getShopSettings();
    var rows = lastRows.map(function(r){ return "<tr><td>" + esc(new Date(r.sale_date||"").toLocaleString()) + "</td><td>" + esc(r.product_name) + "</td><td>" + r.qty + "</td><td>" + ghc(r.price) + "</td><td>" + ghc(r.qty*r.price) + "</td><td>" + esc(r.payment_mode) + "</td></tr>"; }).join("");
    var w = window.open("","_blank");
    w.document.write("<!DOCTYPE html><html><head><style>body{font-family:Arial,sans-serif;padding:20px}table{width:100%;border-collapse:collapse}td,th{padding:6px 8px;border-bottom:1px solid #eee}</style></head><body>" + shopHeader(ss) + "<h2>Daily Sales Report</h2><p>" + esc($("#dsFrom").value) + " to " + esc($("#dsTo").value) + "</p><table><thead><tr><th>Date/Time</th><th>Product</th><th>Qty</th><th>Price</th><th>Total</th><th>Payment</th></tr></thead><tbody>" + rows + "</tbody></table><p><b>Total: " + esc($("#dsTotal").textContent) + "</b></p>" + receiptFooter() + "</body></html>");
    w.document.close(); w.print();
  });
  $("#dsSearch").click();
}

/* ==============================================
   WHOLESALE REPORT
============================================== */
async function wholesaleReport() {
  pageTitle.textContent = "Customer Goods Wholesale Report";

  screen.innerHTML =
    '<div class="panel">' +
      '<h3 style="margin:0 0 12px">Wholesale Sales Report</h3>' +
      '<div class="rowLine">' +
        '<div style="flex:1"><div class="lbl">From</div><input id="wrFrom" type="date"/></div>' +
        '<div style="flex:1"><div class="lbl">To</div><input id="wrTo" type="date"/></div>' +
        '<div style="display:flex;align-items:flex-end;gap:8px">' +
          '<button class="btn" id="wrSearch">SEARCH</button>' +
          '<button class="btn2" id="wrDisplay">DISPLAY</button>' +
        '</div>' +
      '</div>' +
      '<div style="height:10px"></div>' +
      '<input id="wrFind" placeholder="Search customer/product..." style="margin-bottom:10px"/>' +
      '<div class="table-wrap">' +
        '<table class="table" id="wrTable">' +
          '<thead><tr><th>DATE</th><th>INVOICE</th><th>CUSTOMER</th><th>PRODUCT</th><th>QTY</th><th>WHOLESALE</th><th>TOTAL</th></tr></thead>' +
          '<tbody></tbody>' +
        '</table>' +
      '</div>' +
      '<div class="totalLine"><div>TOTAL</div><div id="wrTotal">' + ghc(0) + '</div></div>' +
    '</div>';

  var t = today(); $("#wrFrom").value = t; $("#wrTo").value = t;
  var lastRows = [];

  function renderTable(rows) {
    var q = ($("#wrFind").value||"").toLowerCase();
    var filtered = rows.filter(function(r){ return (r.customer_name+" "+r.product_name).toLowerCase().includes(q); });
    $("#wrTable tbody").innerHTML = filtered.map(function(r){ return "<tr><td>" + esc(r.date) + "</td><td>" + esc(r.invoice_no) + "</td><td>" + esc(r.customer_name) + "</td><td>" + esc(r.product_name) + "</td><td>" + r.qty + "</td><td>" + ghc(r.price) + "</td><td>" + ghc(r.qty*r.price) + "</td></tr>"; }).join("") || '<tr><td colspan="7" style="color:var(--muted)">No results.</td></tr>';
    $("#wrTotal").textContent = ghc(filtered.reduce(function(s,r){ return s + r.qty*r.price; }, 0));
    lastRows = filtered;
  }

  $("#wrSearch").addEventListener("click", async function() {
    try {
      var from = $("#wrFrom").value, to = $("#wrTo").value;
      var sales = await api("GET", "/wholesale-sales/" + currentUser.shopId);
      var rows = [];
      sales.forEach(function(s) {
        var d = (s.date||"").slice(0,10);
        if (d < from || d > to) return;
        (s.items||[]).forEach(function(item) { rows.push({ date: d, invoice_no: s.invoice_no||"-", customer_name: s.customer_name, product_name: item.product_name, qty: item.qty, price: item.price }); });
      });
      renderTable(rows);
    } catch(err) { $("#wrTable tbody").innerHTML = '<tr><td colspan="7" style="color:var(--danger)">' + esc(err.message) + '</td></tr>'; }
  });

  $("#wrFind").addEventListener("input", function(){ renderTable(lastRows); });
  $("#wrDisplay").addEventListener("click", function() {
    var ss = getShopSettings();
    var rows = lastRows.map(function(r){ return "<tr><td>" + esc(r.date) + "</td><td>" + esc(r.invoice_no) + "</td><td>" + esc(r.customer_name) + "</td><td>" + esc(r.product_name) + "</td><td>" + r.qty + "</td><td>" + ghc(r.price) + "</td><td>" + ghc(r.qty*r.price) + "</td></tr>"; }).join("");
    var w = window.open("","_blank");
    w.document.write("<!DOCTYPE html><html><head><style>body{font-family:Arial,sans-serif;padding:20px}table{width:100%;border-collapse:collapse}td,th{padding:6px 8px;border-bottom:1px solid #eee}</style></head><body>" + shopHeader(ss) + "<h2>Wholesale Report</h2><p>" + esc($("#wrFrom").value) + " to " + esc($("#wrTo").value) + "</p><table><thead><tr><th>Date</th><th>Invoice</th><th>Customer</th><th>Product</th><th>Qty</th><th>Wholesale</th><th>Total</th></tr></thead><tbody>" + rows + "</tbody></table><p><b>Total: " + esc($("#wrTotal").textContent) + "</b></p>" + receiptFooter() + "</body></html>");
    w.document.close(); w.print();
  });
  $("#wrSearch").click();
}

/* ==============================================
   GOODS RECEIVED REPORT
============================================== */
async function goodsReceivedReport() {
  pageTitle.textContent = "Goods Received Report";
  var isSalesman = currentUser.accessLevel === "SALESMAN";

  screen.innerHTML =
    '<div class="panel">' +
      '<h3 style="margin:0 0 12px">Goods Received Report</h3>' +
      '<div class="rowLine">' +
        '<div style="flex:1"><div class="lbl">From</div><input id="grrFrom" type="date"/></div>' +
        '<div style="flex:1"><div class="lbl">To</div><input id="grrTo" type="date"/></div>' +
        '<div style="display:flex;align-items:flex-end;gap:8px">' +
          '<button class="btn" id="grrSearch">SEARCH</button>' +
          '<button class="btn2" id="grrDisplay">DISPLAY</button>' +
        '</div>' +
      '</div>' +
      '<div style="height:10px"></div>' +
      '<input id="grrFind" placeholder="Search product/invoice..." style="margin-bottom:10px"/>' +
      '<div class="table-wrap">' +
        '<table class="table" id="grrTable">' +
          '<thead><tr><th>DATE</th><th>SUPPLIER</th><th>PRODUCT</th><th>INVOICE</th><th>QTY</th><th>SELLING</th><th>COST VALUE</th>' + (!isSalesman ? '<th>PROFIT MARGIN</th>' : '') + '</tr></thead>' +
          '<tbody></tbody>' +
        '</table>' +
      '</div>' +
      '<div class="totalLine"><div>TOTAL</div><div id="grrTotal">' + ghc(0) + '</div></div>' +
    '</div>';

  var t = today(); $("#grrFrom").value = t; $("#grrTo").value = t;
  var lastRows = [];

  async function doSearch() {
    try {
      var from = $("#grrFrom").value, to = $("#grrTo").value, q = ($("#grrFind").value||"").toLowerCase();
      var records = await api("GET", "/goods-received/" + currentUser.shopId);
      var rows = [];
      records.forEach(function(rec) {
        var d = (rec.created_at||"").slice(0,10);
        if (d < from || d > to) return;
        (rec.items||[]).forEach(function(item) {
  var pName = item.product_name || item.productName || "";
  var invNo = item.invoice_no || item.invoiceNo || rec.invoice_no || "-";
  var blob = (pName + " " + invNo).toLowerCase();
  if (q && !blob.includes(q)) return;
  var costValue = Number(item.qty||0) * Number(item.selling||0);
  var margin    = Number(item.selling||0) - Number(item.cost||0);
  rows.push({ date:d, supplierName:rec.supplier_name||"-", productName:pName, invoiceNo:invNo, qty:item.qty, selling:item.selling, costValue, margin });
});
      });
      lastRows = rows;
      $("#grrTable tbody").innerHTML = rows.map(function(r){ return "<tr><td>" + esc(r.date) + "</td><td>" + esc(r.supplierName) + "</td><td>" + esc(r.productName) + "</td><td>" + esc(r.invoiceNo) + "</td><td>" + r.qty + "</td><td>" + ghc(r.selling) + "</td><td>" + ghc(r.costValue) + "</td>" + (!isSalesman ? '<td style="color:var(--success)">' + ghc(r.margin) + "</td>" : "") + "</tr>"; }).join("") || '<tr><td colspan="' + (isSalesman?7:8) + '" style="color:var(--muted)">No results.</td></tr>';
      $("#grrTotal").textContent = ghc(rows.reduce(function(s,r){ return s + r.costValue; }, 0));
    } catch(err) { $("#grrTable tbody").innerHTML = '<tr><td colspan="8" style="color:var(--danger)">' + esc(err.message) + '</td></tr>'; }
  }

  $("#grrSearch").addEventListener("click", doSearch);
  $("#grrFind").addEventListener("input", doSearch);
  $("#grrDisplay").addEventListener("click", function() {
    var ss = getShopSettings();
    var rows = lastRows.map(function(r){ return "<tr><td>" + esc(r.date) + "</td><td>" + esc(r.supplierName) + "</td><td>" + esc(r.productName) + "</td><td>" + esc(r.invoiceNo) + "</td><td>" + r.qty + "</td><td>" + ghc(r.selling) + "</td><td>" + ghc(r.costValue) + "</td>" + (!isSalesman ? "<td>" + ghc(r.margin) + "</td>" : "") + "</tr>"; }).join("");
    var w = window.open("","_blank");
    w.document.write("<!DOCTYPE html><html><head><style>body{font-family:Arial,sans-serif;padding:20px}table{width:100%;border-collapse:collapse}td,th{padding:6px 8px;border-bottom:1px solid #eee}</style></head><body>" + shopHeader(ss) + "<h2>Goods Received Report</h2><p>" + esc($("#grrFrom").value) + " to " + esc($("#grrTo").value) + "</p><table><thead><tr><th>Date</th><th>Supplier</th><th>Product</th><th>Invoice</th><th>Qty</th><th>Selling</th><th>Cost Value</th>" + (!isSalesman?"<th>Margin</th>":"") + "</tr></thead><tbody>" + rows + "</tbody></table><p><b>Total: " + esc($("#grrTotal").textContent) + "</b></p>" + receiptFooter() + "</body></html>");
    w.document.close(); w.print();
  });
  doSearch();
}

/* ==============================================
   ADJUSTMENT REPORT
============================================== */
async function adjustmentReport() {
  pageTitle.textContent = "Adjustment Report";

  screen.innerHTML =
    '<div class="panel">' +
      '<h3 style="margin:0 0 12px">Stock Adjustment Report</h3>' +
      '<div class="rowLine">' +
        '<div style="flex:1"><div class="lbl">Adjustment Type</div>' +
          '<select id="arType">' +
            '<option value="all">All Types</option>' +
            '<option value="damage">Damage Goods</option>' +
            '<option value="return_customer">Returned by Customer</option>' +
            '<option value="return_supplier">Returned to Supplier</option>' +
          '</select>' +
        '</div>' +
        '<div style="flex:1"><div class="lbl">From</div><input id="arFrom" type="date"/></div>' +
        '<div style="flex:1"><div class="lbl">To</div><input id="arTo" type="date"/></div>' +
        '<div style="display:flex;align-items:flex-end;gap:8px">' +
          '<button class="btn" id="arSearch">SEARCH</button>' +
          '<button class="btn2" id="arDisplay">DISPLAY</button>' +
        '</div>' +
      '</div>' +
      '<div style="height:10px"></div>' +
      '<div class="table-wrap">' +
        '<table class="table" id="arTable">' +
          '<thead><tr><th>DATE &amp; TIME</th><th>TYPE</th><th>PRODUCT</th><th>QTY</th><th>DESCRIPTION</th></tr></thead>' +
          '<tbody><tr><td colspan="5" style="color:var(--muted)">Click SEARCH to load.</td></tr></tbody>' +
        '</table>' +
      '</div>' +
    '</div>';

  var typeLabels = { damage: "Damage Goods", return_customer: "Return by Customer", return_supplier: "Return to Supplier" };
  var t = today(); $("#arFrom").value = t; $("#arTo").value = t;
  var lastRows = [];

  $("#arSearch").addEventListener("click", async function() {
    var from = $("#arFrom").value, to = $("#arTo").value, type = $("#arType").value;
    try {
      var rows = await api("GET", "/adjustments/" + currentUser.shopId);
      rows = rows.filter(function(r) {
        var d = (r.created_at||"").slice(0,10);
        return d >= from && d <= to && (type === "all" || r.type === type);
      });
      lastRows = rows;
      $("#arTable tbody").innerHTML = rows.map(function(r){ return "<tr><td>" + esc(new Date(r.created_at||"").toLocaleString()) + "</td><td>" + esc(typeLabels[r.type]||r.type) + "</td><td>" + esc(r.product_name) + "</td><td>" + r.qty + "</td><td>" + esc(r.description||"-") + "</td></tr>"; }).join("") || '<tr><td colspan="5" style="color:var(--muted)">No adjustments found.</td></tr>';
    } catch(err) { $("#arTable tbody").innerHTML = '<tr><td colspan="5" style="color:var(--danger)">' + esc(err.message) + '</td></tr>'; }
  });

  $("#arDisplay").addEventListener("click", function() {
    var ss = getShopSettings();
    var rows = lastRows.map(function(r){ return "<tr><td>" + esc(new Date(r.created_at||"").toLocaleString()) + "</td><td>" + esc(typeLabels[r.type]||r.type) + "</td><td>" + esc(r.product_name) + "</td><td>" + r.qty + "</td><td>" + esc(r.description||"-") + "</td></tr>"; }).join("");
    var w = window.open("","_blank");
    w.document.write("<!DOCTYPE html><html><head><style>body{font-family:Arial,sans-serif;padding:20px}table{width:100%;border-collapse:collapse}td,th{padding:6px 8px;border-bottom:1px solid #eee}</style></head><body>" + shopHeader(ss) + "<h2>Stock Adjustment Report</h2><p>" + esc($("#arFrom").value) + " to " + esc($("#arTo").value) + "</p><table><thead><tr><th>Date/Time</th><th>Type</th><th>Product</th><th>Qty</th><th>Description</th></tr></thead><tbody>" + rows + "</tbody></table>" + receiptFooter() + "</body></html>");
    w.document.close(); w.print();
  });
}

/* ==============================================
   END OF DAY
============================================== */
async function endOfDay() {
  pageTitle.textContent = "End of Day Balancing";

  screen.innerHTML =
    '<div class="panel">' +
      '<h3 style="margin:0 0 12px">Income &amp; Expenses \u2014 End of Day Balancing</h3>' +
      '<div class="rowLine">' +
        '<div style="flex:1"><div class="lbl">From</div><input id="eodFrom" type="date"/></div>' +
        '<div style="flex:1"><div class="lbl">To</div><input id="eodTo" type="date"/></div>' +
        '<div style="display:flex;align-items:flex-end;gap:8px">' +
          '<button class="btn" id="eodRun">RUN</button>' +
          '<button class="btn2" id="eodDisplay">DISPLAY / PDF</button>' +
        '</div>' +
      '</div>' +
      '<div style="height:14px"></div>' +
      '<div class="grid2">' +
        '<div class="panel"><h3 style="margin:0 0 10px">DAILY SALES</h3>' +
          '<div class="table-wrap"><table class="table" id="eodSalesTable"><thead><tr><th>DATE</th><th>AMOUNT</th></tr></thead><tbody></tbody></table></div>' +
          '<div class="totalLine"><div>TOTAL</div><div id="eodSalesTotal">' + ghc(0) + '</div></div>' +
        '</div>' +
        '<div class="panel"><h3 style="margin:0 0 10px">EXPENSES (by Account)</h3>' +
          '<div class="table-wrap"><table class="table" id="eodExpTable"><thead><tr><th>ACCOUNT</th><th>TOTAL</th></tr></thead><tbody></tbody></table></div>' +
          '<div class="totalLine"><div>TOTAL</div><div id="eodExpTotal">' + ghc(0) + '</div></div>' +
        '</div>' +
      '</div>' +
      '<div style="height:10px"></div>' +
      '<div class="panel" style="background:var(--primary-light)">' +
        '<div class="totalLine"><div><b>TOTAL CASH ON HAND</b> = Sales \u2013 Expenses</div><div><b id="eodCash" style="font-size:18px">' + ghc(0) + '</b></div></div>' +
      '</div>' +
    '</div>';

  var t = today(); $("#eodFrom").value = t; $("#eodTo").value = t;
  var lastSalesRows = [], lastExpRows = [];

  async function run() {
    try {
      var rr = await Promise.all([api("GET", "/sales/" + currentUser.shopId), api("GET", "/expenses/" + currentUser.shopId)]);
      var sales = rr[0], expenses = rr[1];
      var from = $("#eodFrom").value, to = $("#eodTo").value;

      var salesByDate = {};
      sales.forEach(function(s) {
        var d = (s.sale_date||"").slice(0,10);
        if (d < from || d > to) return;
        salesByDate[d] = (salesByDate[d]||0) + Number(s.total||0);
      });
      lastSalesRows = Object.keys(salesByDate).sort().map(function(d){ return {d:d, amt:salesByDate[d]}; });
      $("#eodSalesTable tbody").innerHTML = lastSalesRows.map(function(r){ return "<tr><td>" + esc(r.d) + "</td><td>" + ghc(r.amt) + "</td></tr>"; }).join("") || '<tr><td colspan="2" style="color:var(--muted)">No sales.</td></tr>';
      var salesTotal = lastSalesRows.reduce(function(s,r){ return s + r.amt; }, 0);
      $("#eodSalesTotal").textContent = ghc(salesTotal);

      var expByAcc = {};
      expenses.forEach(function(e) {
        var d = (e.created_at||"").slice(0,10);
        if (d < from || d > to) return;
        var key = e.account_name||"Unknown";
        expByAcc[key] = (expByAcc[key]||0) + Number(e.amount||0);
      });
      lastExpRows = Object.keys(expByAcc).sort().map(function(k){ return {k:k, amt:expByAcc[k]}; });
      $("#eodExpTable tbody").innerHTML = lastExpRows.map(function(r){ return "<tr><td>" + esc(r.k) + "</td><td>" + ghc(r.amt) + "</td></tr>"; }).join("") || '<tr><td colspan="2" style="color:var(--muted)">No expenses.</td></tr>';
      var expTotal = lastExpRows.reduce(function(s,r){ return s + r.amt; }, 0);
      $("#eodExpTotal").textContent = ghc(expTotal);
      $("#eodCash").textContent = ghc(salesTotal - expTotal);
    } catch(err) { console.error(err); }
  }

  $("#eodRun").addEventListener("click", run);
  $("#eodDisplay").addEventListener("click", function() {
    var ss = getShopSettings();
    var from = $("#eodFrom").value, to = $("#eodTo").value;
    var sRows = lastSalesRows.map(function(r){ return "<tr><td>" + esc(r.d) + "</td><td>" + ghc(r.amt) + "</td></tr>"; }).join("");
    var eRows = lastExpRows.map(function(r){ return "<tr><td>" + esc(r.k) + "</td><td>" + ghc(r.amt) + "</td></tr>"; }).join("");
    var w = window.open("","_blank");
    w.document.write("<!DOCTYPE html><html><head><style>body{font-family:Arial,sans-serif;padding:20px}table{width:100%;border-collapse:collapse}td,th{padding:6px 8px;border-bottom:1px solid #eee}.big{font-size:16px;font-weight:700}</style></head><body>" + shopHeader(ss) + "<h2>End of Day Balancing Report</h2><p>Date Range: " + esc(from) + " to " + esc(to) + "</p><h3>Daily Sales</h3><table><thead><tr><th>Date</th><th>Amount</th></tr></thead><tbody>" + sRows + "</tbody></table><p><b>Total Sales: " + esc($("#eodSalesTotal").textContent) + "</b></p><h3>Expenses</h3><table><thead><tr><th>Account</th><th>Total</th></tr></thead><tbody>" + eRows + "</tbody></table><p><b>Total Expenses: " + esc($("#eodExpTotal").textContent) + "</b></p><p class='big'>TOTAL CASH ON HAND: " + esc($("#eodCash").textContent) + "</p>" + receiptFooter() + "</body></html>");
    w.document.close(); w.print();
  });
  run();
}

/* ==============================================
   MANAGE USERS
============================================== */
async function manageUsers() {
  pageTitle.textContent = "Manage Users";
  if (currentUser.accessLevel === "SALESMAN") { alert("Access denied."); return load("dashboard"); }
  var selectedId = null;

  screen.innerHTML =
    '<div class="grid2">' +
      '<div class="panel">' +
        '<h3 style="margin:0 0 10px">Create User Account</h3>' +
        '<div class="grid3">' +
          '<div><div class="lbl">Full Name</div><input id="uFull"/></div>' +
          '<div><div class="lbl">Username</div><input id="uuser"/></div>' +
          '<div><div class="lbl">Access Level</div><select id="uRole"><option value="ADMINISTRATOR">ADMINISTRATOR</option><option value="SUPERVISOR">SUPERVISOR</option><option value="SALESMAN">SALESMAN</option><option value="WAREHOUSE">WAREHOUSE</option><option value="AUDITOR">AUDITOR</option></select></div>' +
        '</div>' +
        '<div style="height:10px"></div>' +
        '<div class="grid3">' +
          '<div><div class="lbl">Password</div><input id="uPass" type="password"/></div>' +
          '<div><div class="lbl">Confirm Password</div><input id="uPass2" type="password"/></div>' +
          '<div style="display:flex;align-items:flex-end;gap:8px"><button class="btn" id="uSave">SAVE</button><button class="btn2" id="uClear">CLEAR</button></div>' +
        '</div>' +
        '<div id="uMsg" class="msg"></div>' +
      '</div>' +
      '<div class="panel">' +
        '<h3 style="margin:0 0 10px">Workers</h3>' +
        '<input id="uFind" placeholder="Search user..."/>' +
        '<div class="product-list-wrap">' +
          '<table class="table" id="uTable"><thead><tr><th>FULL NAME</th><th>USERNAME</th><th>ROLE</th><th>STATUS</th></tr></thead>' +
          '<tbody><tr><td colspan="4" style="color:var(--muted)">Loading...</td></tr></tbody></table>' +
        '</div>' +
        '<div class="btnRow">' +
          '<button class="btn2" id="uRemove">REMOVE</button>' +
          '<button class="btn2" id="uSuspend">SUSPEND</button>' +
          '<button class="btn2" id="uActivate">ACTIVATE</button>' +
        '</div>' +
        '<div id="uMsg2" class="msg"></div>' +
      '</div>' +
    '</div>';

  async function renderList() {
    var q = ($("#uFind").value||"").toLowerCase();
    try {
      var all = await api("GET", "/workers/" + currentUser.shopId);
      var list = all.filter(function(u){ return (u.full_name+" "+u.username+" "+u.role).toLowerCase().includes(q); });
      $("#uTable tbody").innerHTML = list.map(function(u){ return '<tr data-id="' + u.id + '" style="cursor:pointer"><td>' + esc(u.full_name) + '</td><td>' + esc(u.username) + '</td><td>' + esc(u.role) + '</td><td>' + (u.is_suspended?"SUSPENDED":"ACTIVE") + '</td></tr>'; }).join("") || '<tr><td colspan="4" style="color:var(--muted)">No users found.</td></tr>';
      $("#uTable tbody").querySelectorAll("tr[data-id]").forEach(function(tr) {
        tr.addEventListener("click", function() {
          var u = list.find(function(x){ return String(x.id) === tr.dataset.id; }); if (!u) return;
          selectedId = u.id; $("#uFull").value = u.full_name||""; $("#uuser").value = u.username||""; $("#uRole").value = u.role||"SALESMAN";
          $("#uPass").value = ""; $("#uPass2").value = ""; $("#uMsg2").textContent = "Selected \u2705";
        });
      });
    } catch(err) { $("#uTable tbody").innerHTML = '<tr><td colspan="4" style="color:var(--danger)">' + esc(err.message) + '</td></tr>'; }
  }

  function clearForm(){ selectedId=null; ["#uFull","#uuser","#uPass","#uPass2"].forEach(function(s){$(s).value="";}); $("#uRole").value="ADMINISTRATOR"; }

  $("#uFind").addEventListener("input", renderList);
  $("#uClear").addEventListener("click", function(){ clearForm(); $("#uMsg").textContent=""; });

  $("#uSave").addEventListener("click", async function() {
    var fullName=$("#uFull").value.trim(), username=$("#uuser").value.trim(), pass=$("#uPass").value, pass2=$("#uPass2").value;
    if (!fullName||!username) return ($("#uMsg").textContent="Full name and username required.");
    if (!pass) return ($("#uMsg").textContent="Password required.");
    if (pass!==pass2) return ($("#uMsg").textContent="Passwords do not match.");
    try { await api("POST","/create-worker",{shopId:currentUser.shopId,fullName,username,password:pass,role:$("#uRole").value}); $("#uMsg").textContent="Worker created \u2705"; clearForm(); await renderList(); }
    catch(err){ $("#uMsg").textContent=err.message; }
  });

  $("#uRemove").addEventListener("click", async function() {
    if (!selectedId) return ($("#uMsg2").textContent="Select a worker first.");
    if (!confirm("Remove this worker?")) return;
    try { await api("DELETE","/workers/"+selectedId); clearForm(); await renderList(); $("#uMsg2").textContent="Removed \u2705"; }
    catch(err){ $("#uMsg2").textContent=err.message; }
  });

  $("#uSuspend").addEventListener("click", async function() {
    if (!selectedId) return ($("#uMsg2").textContent="Select a worker first.");
    try { await api("PUT","/workers/"+selectedId+"/suspend"); await renderList(); $("#uMsg2").textContent="Suspended \u2705"; }
    catch(err){ $("#uMsg2").textContent=err.message; }
  });

  $("#uActivate").addEventListener("click", async function() {
    if (!selectedId) return ($("#uMsg2").textContent="Select a worker first.");
    try { await api("PUT","/workers/"+selectedId+"/activate"); await renderList(); $("#uMsg2").textContent="Activated \u2705"; }
    catch(err){ $("#uMsg2").textContent=err.message; }
  });

  await renderList();
}

/* ==============================================
   BOOT
============================================== */
if (!currentUser) {
  alert("Please login first.");
  window.location.href = "index.html";
} else {
  // expose load globally so onclick works
window.load = load;
  startApp();
}