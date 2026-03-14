/* =========================
   API BASE + HELPERS
========================= */
const API_BASE = "https://bookshop-pos-production.up.railway.app";

async function api(method, path, body) {
  const opts = {
    method,
    headers: { "Content-Type": "application/json" }
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${API_BASE}${path}`, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Server error");
  return data;
}

const ghc = (n) => "GHC " + Number(n || 0).toFixed(2);
const esc = (s) => String(s || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

/* =========================
   GLOBALS
========================= */
let screenEl = null;
let sidebarEl = null;
let screen = null;
let currentUser = JSON.parse(localStorage.getItem("currentUser") || "null");

const whoami = document.getElementById("whoami");
const themeSelect = document.getElementById("themeSelect");
const pageTitle = document.getElementById("pageTitle");

function setPrimaryAction(selector) {
  window.__primaryActionSelector = selector;
}

document.addEventListener("keydown", (e) => {
  const tag = (e.target?.tagName || "").toLowerCase();
  if (e.key === "Enter") {
    if (tag === "textarea") return;
    e.preventDefault();
    const sel = window.__primaryActionSelector;
    if (sel) {
      const btn = document.querySelector(sel);
      if (btn && !btn.disabled) btn.click();
    }
  }
});

function $(q) {
  if (!screenEl) throw new Error("screenEl not ready");
  return screenEl.querySelector(q);
}

/* =========================
   START APP
========================= */
function startApp() {
  screenEl = document.getElementById("screen");
  sidebarEl = document.getElementById("sidebar");
  screen = screenEl;

  if (!currentUser) { window.location.href = "index.html"; return; }

  if (whoami) {
    const shopLabel = currentUser.shopName ? ` - ${currentUser.shopName}` : "";
    whoami.textContent = `Logged in as: ${currentUser.fullName} (${currentUser.accessLevel})${shopLabel}`;
  }

  document.getElementById("logoutBtn")?.addEventListener("click", () => {
    localStorage.removeItem("currentUser");
    window.location.href = "index.html";
  });

  document.getElementById("menuToggle")?.addEventListener("click", () => {
    sidebarEl?.classList.toggle("open");
  });

  const savedTheme = localStorage.getItem("theme") || "light";
  document.body.setAttribute("data-theme", savedTheme);
  if (themeSelect) themeSelect.value = savedTheme;
  themeSelect?.addEventListener("change", (e) => {
    document.body.setAttribute("data-theme", e.target.value);
    localStorage.setItem("theme", e.target.value);
  });

  applyNavPermissions();

  document.querySelectorAll(".navBtn").forEach((btn) => {
    btn.addEventListener("click", () => {
      sidebarEl?.classList.remove("open");
      const target = btn.dataset.screen;
      if (!canAccess(target)) { alert("Access denied (role restriction)."); return; }
      load(target);
    });
  });

  load("dashboard");
}

function canAccess(screenName) {
  if (!currentUser) return false;
  if (currentUser.accessLevel === "SALESMAN") {
    if (screenName === "stockLevel") return false;
    if (screenName === "users") return false;
  }
  return true;
}

function applyNavPermissions() {
  document.querySelectorAll(".navBtn").forEach((btn) => {
    btn.style.display = canAccess(btn.dataset.screen) ? "" : "none";
  });
}

function load(name) {
  switch (name) {
    case "dashboard": return dash();
    case "products": return productsSetup();
    case "suppliers": return suppliersSetup();
    case "customers": return customersSetup();
    case "users": return manageUsers();
    case "cashSales": return cashSales();
    case "goodsReceived": return goodsReceived();
    case "customerGoods": return customerGoodsWholesale();
    case "customerPayments": return customerPayments();
    case "expenseAccounts": return expenseAccountsSetup();
    case "recordExpense": return recordExpense();
    case "expenseReport": return expensesReport();
    case "stockLevel": return stockLevel();
    case "dailySalesReport": return dailySalesReport();
    case "goodsReceivedReport": return goodsReceivedReport();
    case "endOfDay": return endOfDay();
    default: return dash();
  }
}

/* =========================
   DASHBOARD
========================= */
async function dash() {
  pageTitle.textContent = "Dashboard";
  screen.innerHTML = `<div class="panel"><p>Loading dashboard...</p></div>`;

  try {
    const [products, sales, expenses] = await Promise.all([
      api("GET", `/products/${currentUser.shopId}`),
      api("GET", `/sales/${currentUser.shopId}`),
      api("GET", `/expenses/${currentUser.shopId}`)
    ]);
    const suppliers = await api("GET", `/suppliers/${currentUser.shopId}`);
    const customers = await api("GET", `/customers/${currentUser.shopId}`);

    const today = new Date().toISOString().slice(0, 10);
    const todaySales = sales
      .filter(s => (s.sale_date || "").slice(0, 10) === today)
      .reduce((sum, s) => sum + Number(s.total || 0), 0);
    const todayExpenses = expenses
      .filter(e => (e.created_at || "").slice(0, 10) === today)
      .reduce((sum, e) => sum + Number(e.amount || 0), 0);
    const lowStock = products.filter(p => Number(p.qty || 0) <= 5).length;

    screen.innerHTML = `
      <div class="cards">
        <div class="card"><div class="label">📦 Products</div><div class="value">${products.length}</div></div>
        <div class="card"><div class="label">🏭 Suppliers</div><div class="value">${suppliers.length}</div></div>
        <div class="card"><div class="label">👤 Customers</div><div class="value">${customers.length}</div></div>
        <div class="card"><div class="label">📉 Low Stock</div><div class="value">${lowStock}</div></div>
      </div>
      <div style="height:12px"></div>
      <div class="panel">
        <h3 style="margin-top:0">Income & Expenses Today</h3>
        <div class="totalLine"><div>Today Sales</div><div>${ghc(todaySales)}</div></div>
        <div class="totalLine"><div>Today Expenses</div><div>${ghc(todayExpenses)}</div></div>
        <div class="totalLine"><div><b>Total Cash on Hand</b></div><div><b>${ghc(todaySales - todayExpenses)}</b></div></div>
      </div>`;
  } catch (err) {
    screen.innerHTML = `<div class="panel"><p style="color:red">Failed to load dashboard: ${esc(err.message)}</p></div>`;
  }
}

/* =========================
   PRODUCTS SETUP
========================= */
async function productsSetup() {
  pageTitle.textContent = "Products Setup";
  setPrimaryAction("#pSave");

  screen.innerHTML = `
    <div class="grid2">
      <div class="panel">
        <h3 style="margin-top:0">Product List</h3>
        <input id="pFind" placeholder="Search products..." />
        <table class="table" id="pTable">
          <thead><tr><th>Product</th><th>Stock</th><th>Selling</th></tr></thead>
          <tbody><tr><td colspan="3">Loading...</td></tr></tbody>
        </table>
      </div>
      <div class="panel">
        <h3 style="margin-top:0">Add / Edit Product</h3>
        <div class="grid3">
          <div><div class="lbl">Product Name</div><input id="pName"/></div>
          <div><div class="lbl">Supplier</div><input id="pSupplier"/></div>
          <div><div class="lbl">Category</div><input id="pCategory"/></div>
        </div>
        <div style="height:10px"></div>
        <div class="grid3">
          <div><div class="lbl">Cost Price</div><input id="pCost" type="number" step="0.01"/></div>
          <div><div class="lbl">Selling Price</div><input id="pSelling" type="number" step="0.01"/></div>
          <div><div class="lbl">Wholesale Price</div><input id="pWholesale" type="number" step="0.01"/></div>
        </div>
        <div style="height:10px"></div>
        <div class="grid3">
          <div><div class="lbl">Qty In Stock</div><input id="pQty" type="number" step="1"/></div>
          <div><div class="lbl">Profit Margin</div><input id="pMargin" type="number" step="0.01" placeholder="Auto"/></div>
          <div></div>
        </div>
        <div class="btnRow">
          <button class="btn" id="pSave">SAVE</button>
          <button class="btn2" id="pEdit">EDIT</button>
          <button class="btn2" id="pRemove">REMOVE</button>
          <button class="btn2" id="pClear">CLEAR</button>
        </div>
        <div id="pMsg" class="msg"></div>
      </div>
    </div>`;

  let allProducts = [];
  let selectedId = null;
  const tbody = $("#pTable tbody");

  function render() {
    const q = ($("#pFind").value || "").toLowerCase();
    const list = allProducts.filter(p => (p.name || "").toLowerCase().includes(q));
    tbody.innerHTML = list.map(p => `
      <tr data-id="${p.id}">
        <td>${esc(p.name)}</td>
        <td>${Number(p.qty || 0)}</td>
        <td>${ghc(p.selling || 0)}</td>
      </tr>`).join("") || `<tr><td colspan="3" style="color:var(--muted)">No products yet.</td></tr>`;

    tbody.querySelectorAll("tr[data-id]").forEach(tr => {
      tr.addEventListener("click", () => {
        const p = allProducts.find(x => String(x.id) === tr.dataset.id);
        if (!p) return;
        selectedId = p.id;
        $("#pName").value = p.name || "";
        $("#pSupplier").value = p.supplier || "";
        $("#pCategory").value = p.category || "";
        $("#pCost").value = Number(p.cost || 0).toFixed(2);
        $("#pSelling").value = Number(p.selling || 0).toFixed(2);
        $("#pWholesale").value = Number(p.wholesale || 0).toFixed(2);
        $("#pQty").value = Number(p.qty || 0);
        $("#pMargin").value = Number(p.margin || 0).toFixed(2);
        $("#pMsg").textContent = "Selected ✅";
      });
    });
  }

  async function reload() {
    allProducts = await api("GET", `/products/${currentUser.shopId}`);
    render();
  }

  function clearForm() {
    selectedId = null;
    ["#pName","#pSupplier","#pCategory","#pCost","#pSelling","#pWholesale","#pQty","#pMargin"]
      .forEach(s => $(s).value = "");
  }

  $("#pFind").addEventListener("input", render);
  $("#pClear").addEventListener("click", () => { clearForm(); $("#pMsg").textContent = ""; });

  $("#pSave").addEventListener("click", async () => {
    const name = $("#pName").value.trim();
    if (!name) return ($("#pMsg").textContent = "Product name is required.");
    const cost = Number($("#pCost").value || 0);
    const selling = Number($("#pSelling").value || 0);
    const margin = $("#pMargin").value.trim() === "" ? selling - cost : Number($("#pMargin").value || 0);
    const body = {
      shopId: currentUser.shopId, name,
      supplier: $("#pSupplier").value.trim(),
      category: $("#pCategory").value.trim(),
      cost, selling,
      wholesale: Number($("#pWholesale").value || 0),
      qty: Number($("#pQty").value || 0),
      margin
    };
    try {
      if (selectedId) {
        await api("PUT", `/products/${selectedId}`, body);
        $("#pMsg").textContent = "Updated ✅";
      } else {
        await api("POST", "/products", body);
        $("#pMsg").textContent = "Saved ✅";
      }
      clearForm();
      await reload();
    } catch (err) {
      $("#pMsg").textContent = err.message;
    }
  });

  $("#pEdit").addEventListener("click", () => {
    if (!selectedId) return ($("#pMsg").textContent = "Select a product first.");
    $("#pMsg").textContent = "Edit the fields then click SAVE ✅";
  });

  $("#pRemove").addEventListener("click", async () => {
    if (!selectedId) return ($("#pMsg").textContent = "Select a product first.");
    try {
      await api("DELETE", `/products/${selectedId}`);
      $("#pMsg").textContent = "Removed ✅";
      clearForm();
      await reload();
    } catch (err) {
      $("#pMsg").textContent = err.message;
    }
  });

  await reload();
}

/* =========================
   SUPPLIERS SETUP
========================= */
async function suppliersSetup() {
  pageTitle.textContent = "Suppliers Setup";

  screen.innerHTML = `
    <div class="grid2">
      <div class="panel">
        <h3 style="margin-top:0">Suppliers List</h3>
        <input id="sFind" placeholder="Search supplier..." />
        <table class="table" id="sTable">
          <thead><tr><th>Acc No</th><th>Name</th><th>Balance</th></tr></thead>
          <tbody><tr><td colspan="3">Loading...</td></tr></tbody>
        </table>
      </div>
      <div class="panel">
        <h3 style="margin-top:0">Supplier Account</h3>
        <div class="grid3">
          <div><div class="lbl">Account No</div><input id="sNo"/></div>
          <div><div class="lbl">Supplier Name</div><input id="sName"/></div>
          <div><div class="lbl">Telephone</div><input id="sPhone"/></div>
        </div>
        <div style="height:10px"></div>
        <div class="grid3">
          <div><div class="lbl">Location</div><input id="sLoc"/></div>
          <div><div class="lbl">Current Balance</div><input id="sBal" type="number" step="0.01"/></div>
          <div></div>
        </div>
        <div class="btnRow">
          <button class="btn" id="sSave">SAVE</button>
          <button class="btn2" id="sEdit">EDIT</button>
          <button class="btn2" id="sRemove">REMOVE</button>
          <button class="btn2" id="sNew">NEW</button>
        </div>
        <div id="sMsg" class="msg"></div>
      </div>
    </div>`;

  let allSuppliers = [];
  let selected = null;
  const tbody = $("#sTable tbody");

  function render() {
    const q = ($("#sFind").value || "").toLowerCase();
    const list = allSuppliers.filter(s =>
      (s.name || "").toLowerCase().includes(q) || String(s.account_no || "").includes(q));
    tbody.innerHTML = list.map(s => `
      <tr data-id="${s.id}">
        <td>${esc(s.account_no)}</td>
        <td>${esc(s.name)}</td>
        <td>${ghc(s.balance || 0)}</td>
      </tr>`).join("") || `<tr><td colspan="3" style="color:var(--muted)">No suppliers yet.</td></tr>`;
    tbody.querySelectorAll("tr[data-id]").forEach(tr => {
      tr.addEventListener("click", () => {
        const s = allSuppliers.find(x => String(x.id) === tr.dataset.id);
        if (!s) return;
        selected = s.id;
        $("#sNo").value = s.account_no || "";
        $("#sName").value = s.name || "";
        $("#sPhone").value = s.phone || "";
        $("#sLoc").value = s.location || "";
        $("#sBal").value = Number(s.balance || 0).toFixed(2);
        $("#sMsg").textContent = "Selected ✅";
      });
    });
  }

  async function reload() {
    allSuppliers = await api("GET", `/suppliers/${currentUser.shopId}`);
    render();
  }

  function clearForm() {
    selected = null;
    const nums = allSuppliers.map(x => parseInt(x.account_no || "0")).filter(n => !isNaN(n));
    $("#sNo").value = String(nums.length ? Math.max(...nums) + 1 : 1).padStart(3, "0");
    $("#sName").value = ""; $("#sPhone").value = ""; $("#sLoc").value = ""; $("#sBal").value = "0.00";
  }

  $("#sFind").addEventListener("input", render);
  $("#sNew").addEventListener("click", () => { clearForm(); $("#sMsg").textContent = ""; });

  $("#sSave").addEventListener("click", async () => {
    const accountNo = $("#sNo").value.trim();
    const name = $("#sName").value.trim();
    if (!accountNo) return ($("#sMsg").textContent = "Account No is required.");
    if (!name) return ($("#sMsg").textContent = "Supplier Name is required.");
    const body = { shopId: currentUser.shopId, accountNo, name, phone: $("#sPhone").value.trim(), location: $("#sLoc").value.trim(), balance: Number($("#sBal").value || 0) };
    try {
      if (selected) {
        await api("PUT", `/suppliers/${selected}`, body);
        $("#sMsg").textContent = "Updated ✅";
      } else {
        await api("POST", "/suppliers", body);
        $("#sMsg").textContent = "Saved ✅";
      }
      clearForm();
      await reload();
    } catch (err) { $("#sMsg").textContent = err.message; }
  });

  $("#sEdit").addEventListener("click", () => {
    if (!selected) return ($("#sMsg").textContent = "Select a supplier first.");
    $("#sMsg").textContent = "Edit fields then click SAVE ✅";
  });

  $("#sRemove").addEventListener("click", async () => {
    if (!selected) return ($("#sMsg").textContent = "Select a supplier first.");
    try {
      await api("DELETE", `/suppliers/${selected}`);
      $("#sMsg").textContent = "Removed ✅";
      clearForm(); await reload();
    } catch (err) { $("#sMsg").textContent = err.message; }
  });

  await reload();
  clearForm();
}

/* =========================
   CUSTOMERS SETUP
========================= */
async function customersSetup() {
  pageTitle.textContent = "Customers Setup";

  screen.innerHTML = `
    <div class="panel">
      <div class="grid3">
        <div>
          <h3 style="margin-top:0">List of Customers</h3>
          <input id="cFind" placeholder="Search customer..." />
          <table class="table" id="cTable"><thead><tr><th>Account Name</th><th>Balance</th></tr></thead><tbody><tr><td colspan="2">Loading...</td></tr></tbody></table>
        </div>
        <div>
          <h3 style="margin-top:0">Customer Info</h3>
          <div class="panel" style="padding:12px">
            <div class="lbl">Account Name</div><input id="cName"/>
            <div style="height:8px"></div>
            <div class="lbl">Location</div><input id="cLoc"/>
            <div style="height:8px"></div>
            <div class="lbl">Office Telephone Number</div><input id="cOffice"/>
            <div style="height:8px"></div>
            <div class="lbl">WhatsApp Number</div><input id="cWhats"/>
            <div style="height:8px"></div>
            <div class="lbl">Current Balance</div><input id="cBal" type="number" step="0.01"/>
          </div>
        </div>
        <div>
          <h3 style="margin-top:0">Personal Contact</h3>
          <div class="panel" style="padding:12px">
            <div class="lbl">Full Name</div><input id="cpName"/>
            <div style="height:8px"></div>
            <div class="lbl">Telephone Number</div><input id="cpTel"/>
          </div>
          <div class="btnRow">
            <button class="btn" id="cSave">SAVE</button>
            <button class="btn2" id="cEdit">EDIT</button>
            <button class="btn2" id="cRemove">REMOVE</button>
            <button class="btn2" id="cNew">NEW</button>
          </div>
          <div id="cMsg" class="msg"></div>
        </div>
      </div>
    </div>`;

  let allCustomers = [];
  let selected = null;
  const tbody = $("#cTable tbody");

  function render() {
    const q = ($("#cFind").value || "").toLowerCase();
    const list = allCustomers.filter(c => (c.account_name || "").toLowerCase().includes(q));
    tbody.innerHTML = list.map(c => `
      <tr data-id="${c.id}">
        <td>${esc(c.account_name)}</td>
        <td>${ghc(c.balance || 0)}</td>
      </tr>`).join("") || `<tr><td colspan="2" style="color:var(--muted)">No customers yet.</td></tr>`;
    tbody.querySelectorAll("tr[data-id]").forEach(tr => {
      tr.addEventListener("click", () => {
        const c = allCustomers.find(x => String(x.id) === tr.dataset.id);
        if (!c) return;
        selected = c.id;
        $("#cName").value = c.account_name || "";
        $("#cLoc").value = c.location || "";
        $("#cOffice").value = c.office_tel || "";
        $("#cWhats").value = c.whatsapp || "";
        $("#cBal").value = Number(c.balance || 0).toFixed(2);
        $("#cpName").value = c.contact_name || "";
        $("#cpTel").value = c.contact_tel || "";
        $("#cMsg").textContent = "Selected ✅";
      });
    });
  }

  async function reload() {
    allCustomers = await api("GET", `/customers/${currentUser.shopId}`);
    render();
  }

  function clearForm() {
    selected = null;
    ["#cName","#cLoc","#cOffice","#cWhats","#cpName","#cpTel"].forEach(s => $(s).value = "");
    $("#cBal").value = "0.00";
  }

  $("#cFind").addEventListener("input", render);
  $("#cNew").addEventListener("click", () => { clearForm(); $("#cMsg").textContent = ""; });

  $("#cSave").addEventListener("click", async () => {
    const accountName = $("#cName").value.trim();
    if (!accountName) return ($("#cMsg").textContent = "Account Name is required.");
    const body = {
      shopId: currentUser.shopId, accountName,
      location: $("#cLoc").value.trim(), officeTel: $("#cOffice").value.trim(),
      whatsapp: $("#cWhats").value.trim(), balance: Number($("#cBal").value || 0),
      contactName: $("#cpName").value.trim(), contactTel: $("#cpTel").value.trim()
    };
    try {
      if (selected) {
        await api("PUT", `/customers/${selected}`, body);
        $("#cMsg").textContent = "Updated ✅";
      } else {
        await api("POST", "/customers", body);
        $("#cMsg").textContent = "Saved ✅";
      }
      clearForm(); await reload();
    } catch (err) { $("#cMsg").textContent = err.message; }
  });

  $("#cEdit").addEventListener("click", () => {
    if (!selected) return ($("#cMsg").textContent = "Select a customer first.");
    $("#cMsg").textContent = "Edit fields then click SAVE ✅";
  });

  $("#cRemove").addEventListener("click", async () => {
    if (!selected) return ($("#cMsg").textContent = "Select a customer first.");
    try {
      await api("DELETE", `/customers/${selected}`);
      $("#cMsg").textContent = "Removed ✅";
      clearForm(); await reload();
    } catch (err) { $("#cMsg").textContent = err.message; }
  });

  await reload();
}

/* =========================
   CASH SALES
========================= */
async function cashSales() {
  pageTitle.textContent = "Cash Sales";
  setPrimaryAction("#saleAdd");

  let allProducts = [];
  let cart = [];
  let selectedRow = null;

  screen.innerHTML = `
    <div class="grid2">
      <div class="panel">
        <h3 style="margin-top:0">Product List</h3>
        <input id="psFind" placeholder="Search products..." />
        <table class="table" id="psTable">
          <thead><tr><th>Product</th><th>Stock</th></tr></thead>
          <tbody></tbody>
        </table>
      </div>
      <div class="panel">
        <h3 style="margin-top:0">Cash Sales Area</h3>
        <div class="grid3">
          <div>
            <div class="lbl">Product name</div>
            <input id="saleProd" list="saleProdList" placeholder="Type to search..." />
            <datalist id="saleProdList"></datalist>
          </div>
          <div>
            <div class="lbl">Quantity sold</div>
            <input id="saleQty" type="number" step="1" />
          </div>
          <div>
            <div class="lbl">Price</div>
            <input id="salePrice" disabled />
            <div style="color:var(--muted);font-size:12px;margin-top:6px">QTY IN STOCK: <b id="saleStock">0</b></div>
          </div>
        </div>
        <div class="btnRow">
          <button class="btn" id="saleAdd">ADD</button>
          <button class="btn2" id="saleRemove">REMOVE</button>
          <button class="btn2" id="saleClear">CLEAR ALL</button>
        </div>
        <table class="table" id="saleTable">
          <thead><tr><th>Product</th><th>Supplier</th><th>Price</th><th>Qty</th><th>Total</th></tr></thead>
          <tbody></tbody>
        </table>
        <div class="totalLine"><div>TOTAL AMOUNT</div><div id="saleTotal">${ghc(0)}</div></div>
        <div style="display:flex;justify-content:flex-end;margin-top:10px">
          <button class="btn" id="saleSave">SAVE</button>
        </div>
        <div id="saleMsg" class="msg"></div>
      </div>
    </div>`;

  function productByName(name) {
    return allProducts.find(p => (p.name || "").toLowerCase() === (name || "").toLowerCase());
  }

  function renderProdList() {
    const q = ($("#psFind").value || "").toLowerCase();
    const list = allProducts.filter(p => (p.name || "").toLowerCase().includes(q));
    $("#psTable tbody").innerHTML = list.map(p => `
      <tr data-id="${p.id}"><td>${esc(p.name)}</td><td>${Number(p.qty || 0)}</td></tr>`).join("") ||
      `<tr><td colspan="2" style="color:var(--muted)">No products.</td></tr>`;
    $("#psTable tbody").querySelectorAll("tr[data-id]").forEach(tr => {
      tr.addEventListener("click", () => {
        const prod = allProducts.find(x => String(x.id) === tr.dataset.id);
        if (!prod) return;
        $("#saleProd").value = prod.name;
        $("#salePrice").value = ghc(prod.selling || 0);
        $("#saleStock").textContent = Number(prod.qty || 0);
      });
    });
    $("#saleProdList").innerHTML = allProducts.map(p => `<option value="${esc(p.name)}"></option>`).join("");
  }

  function renderCart() {
    $("#saleTable tbody").innerHTML = cart.map(line => `
      <tr data-row="${line.rowId}">
        <td>${esc(line.productName)}</td><td>${esc(line.supplier || "-")}</td>
        <td>${ghc(line.price)}</td><td>${line.qty}</td><td>${ghc(line.price * line.qty)}</td>
      </tr>`).join("") || `<tr><td colspan="5" style="color:var(--muted)">No items yet.</td></tr>`;
    $("#saleTable tbody").querySelectorAll("tr[data-row]").forEach(tr => {
      tr.addEventListener("click", () => { selectedRow = tr.dataset.row; $("#saleMsg").textContent = "Row selected ✅"; });
    });
    $("#saleTotal").textContent = ghc(cart.reduce((s, x) => s + x.price * x.qty, 0));
  }

  $("#psFind").addEventListener("input", renderProdList);
  $("#saleProd").addEventListener("input", () => {
    const prod = productByName($("#saleProd").value.trim());
    if (prod) { $("#salePrice").value = ghc(prod.selling || 0); $("#saleStock").textContent = Number(prod.qty || 0); }
    else { $("#salePrice").value = ""; $("#saleStock").textContent = "0"; }
  });

  $("#saleAdd").addEventListener("click", () => {
    const prod = productByName($("#saleProd").value.trim());
    const qty = Number($("#saleQty").value || 0);
    if (!prod) return ($("#saleMsg").textContent = "Select a valid product.");
    if (qty <= 0) return ($("#saleMsg").textContent = "Quantity must be > 0.");
    if (qty > Number(prod.qty || 0)) return ($("#saleMsg").textContent = "Not enough stock.");
    const existing = cart.find(x => x.productId === prod.id);
    if (existing) {
      if (existing.qty + qty > Number(prod.qty || 0)) return ($("#saleMsg").textContent = "Not enough stock.");
      existing.qty += qty;
    } else {
      cart.push({ rowId: Date.now(), productId: prod.id, productName: prod.name, supplier: prod.supplier || "", price: Number(prod.selling || 0), qty });
    }
    $("#saleQty").value = ""; $("#saleMsg").textContent = "Added ✅"; renderCart();
  });

  $("#saleRemove").addEventListener("click", () => {
    if (!selectedRow) return ($("#saleMsg").textContent = "Select a row first.");
    cart = cart.filter(x => String(x.rowId) !== selectedRow); selectedRow = null; renderCart();
  });

  $("#saleClear").addEventListener("click", () => { cart = []; selectedRow = null; renderCart(); $("#saleMsg").textContent = "Cleared ✅"; });

  $("#saleSave").addEventListener("click", async () => {
    if (cart.length === 0) return ($("#saleMsg").textContent = "Nothing to save.");
    try {
      await api("POST", "/sales", {
        shopId: currentUser.shopId,
        enteredBy: currentUser.id,
        total: cart.reduce((s, x) => s + x.price * x.qty, 0),
        items: cart
      });
      // refresh product list to show updated stock
      allProducts = await api("GET", `/products/${currentUser.shopId}`);
      cart = []; selectedRow = null;
      renderCart(); renderProdList();
      $("#saleProd").value = ""; $("#salePrice").value = ""; $("#saleStock").textContent = "0";
      $("#saleMsg").textContent = "Saved ✅ Ready for next customer.";
    } catch (err) { $("#saleMsg").textContent = err.message; }
  });

  allProducts = await api("GET", `/products/${currentUser.shopId}`);
  renderProdList(); renderCart();
}

/* =========================
   GOODS RECEIVED
========================= */
async function goodsReceived() {
  pageTitle.textContent = "Goods Received";

  let allProducts = [];
  let allSuppliers = [];
  let cart = [];
  let selectedRow = null;

  screen.innerHTML = `
    <div class="grid2">
      <div class="panel">
        <h3 style="margin-top:0">Product List</h3>
        <input id="grFind" placeholder="Search products..." />
        <table class="table" id="grPTable">
          <thead><tr><th>Product</th><th>Stock</th></tr></thead>
          <tbody></tbody>
        </table>
      </div>
      <div class="panel">
        <h3 style="margin-top:0">Goods Received Area</h3>
        <div class="rowLine">
          <div style="flex:1"><div class="lbl">Select supplier</div><select id="grSupplier"></select></div>
          <div style="flex:1"><div class="lbl">Invoice number</div><input id="grInvoiceNo"/></div>
          <div style="flex:1"><div class="lbl">Invoice date</div><input id="grInvoiceDate" type="date"/></div>
        </div>
        <div style="height:10px"></div>
        <div class="panel" style="padding:12px">
          <div style="font-weight:700;margin-bottom:6px">Supplier info</div>
          <div class="grid3">
            <div><div class="lbl">Supplier</div><div id="grSName">-</div></div>
            <div><div class="lbl">Location</div><div id="grSLoc">-</div></div>
            <div><div class="lbl">Telephone</div><div id="grSPhone">-</div></div>
          </div>
        </div>
        <div style="height:10px"></div>
        <div class="panel" style="padding:12px">
          <div class="rowLine">
            <div style="flex:2"><div class="lbl">Product Name</div><input id="grProd" list="grProdList" placeholder="Type to search..."/><datalist id="grProdList"></datalist></div>
            <div style="flex:1"><div class="lbl">Qty Received</div><input id="grQty" type="number" step="1"/></div>
            <div style="flex:2"><div class="lbl">Author / Publisher</div><input id="grAuthor"/></div>
          </div>
          <div class="rowLine">
            <div style="flex:1"><div class="lbl">Cost Price</div><input id="grCost" type="number" step="0.01"/></div>
            <div style="flex:1"><div class="lbl">Selling Price</div><input id="grSelling" type="number" step="0.01"/></div>
            <div style="flex:1"><div class="lbl">QTY IN STOCK</div><input id="grStock" disabled/></div>
          </div>
        </div>
        <div class="btnRow">
          <button class="btn" id="grAdd">ADD</button>
          <button class="btn2" id="grRemove">REMOVE</button>
          <button class="btn2" id="grClear">CLEAR ALL</button>
        </div>
        <table class="table" id="grTable">
          <thead><tr><th>Product</th><th>Supplier</th><th>Price</th><th>Qty</th><th>Total</th></tr></thead>
          <tbody></tbody>
        </table>
        <div class="totalLine"><div>TOTAL AMOUNT</div><div id="grTotal">${ghc(0)}</div></div>
        <div style="display:flex;justify-content:flex-end;margin-top:10px"><button class="btn" id="grSave">SAVE</button></div>
        <div id="grMsg" class="msg"></div>
      </div>
    </div>`;

  function loadSupplierInfo() {
    const sid = $("#grSupplier").value;
    const s = allSuppliers.find(x => String(x.id) === sid);
    $("#grSName").textContent = s ? s.name : "-";
    $("#grSLoc").textContent = s ? s.location || "-" : "-";
    $("#grSPhone").textContent = s ? s.phone || "-" : "-";
  }

  function renderProdList() {
    const q = ($("#grFind").value || "").toLowerCase();
    const list = allProducts.filter(p => (p.name || "").toLowerCase().includes(q));
    $("#grPTable tbody").innerHTML = list.map(p => `
      <tr data-id="${p.id}"><td>${esc(p.name)}</td><td>${Number(p.qty || 0)}</td></tr>`).join("") ||
      `<tr><td colspan="2" style="color:var(--muted)">No products.</td></tr>`;
    $("#grPTable tbody").querySelectorAll("tr[data-id]").forEach(tr => {
      tr.addEventListener("click", () => {
        const prod = allProducts.find(x => String(x.id) === tr.dataset.id);
        if (!prod) return;
        $("#grProd").value = prod.name;
        $("#grCost").value = Number(prod.cost || 0).toFixed(2);
        $("#grSelling").value = Number(prod.selling || 0).toFixed(2);
        $("#grStock").value = Number(prod.qty || 0);
      });
    });
    $("#grProdList").innerHTML = allProducts.map(p => `<option value="${esc(p.name)}"></option>`).join("");
  }

  function renderCart() {
    $("#grTable tbody").innerHTML = cart.map(line => `
      <tr data-row="${line.rowId}">
        <td>${esc(line.productName)}</td><td>${esc(line.supplierName || "-")}</td>
        <td>${ghc(line.selling)}</td><td>${line.qty}</td><td>${ghc(line.selling * line.qty)}</td>
      </tr>`).join("") || `<tr><td colspan="5" style="color:var(--muted)">No items yet.</td></tr>`;
    $("#grTable tbody").querySelectorAll("tr[data-row]").forEach(tr => {
      tr.addEventListener("click", () => { selectedRow = tr.dataset.row; $("#grMsg").textContent = "Row selected ✅"; });
    });
    $("#grTotal").textContent = ghc(cart.reduce((s, x) => s + x.selling * x.qty, 0));
  }

  $("#grSupplier").addEventListener("change", loadSupplierInfo);
  $("#grFind").addEventListener("input", renderProdList);
  $("#grProd").addEventListener("input", () => {
    const p = allProducts.find(x => x.name.toLowerCase() === $("#grProd").value.trim().toLowerCase());
    if (p) { $("#grCost").value = Number(p.cost || 0).toFixed(2); $("#grSelling").value = Number(p.selling || 0).toFixed(2); $("#grStock").value = Number(p.qty || 0); }
  });

  $("#grAdd").addEventListener("click", () => {
    const sid = $("#grSupplier").value;
    const s = allSuppliers.find(x => String(x.id) === sid);
    if (!s) return ($("#grMsg").textContent = "Select a supplier first.");
    const name = $("#grProd").value.trim();
    const qty = Number($("#grQty").value || 0);
    if (!name) return ($("#grMsg").textContent = "Select a product.");
    if (qty <= 0) return ($("#grMsg").textContent = "Qty must be > 0.");
    cart.push({
      rowId: Date.now(), productName: name, supplierId: s.id, supplierName: s.name,
      qty, cost: Number($("#grCost").value || 0), selling: Number($("#grSelling").value || 0),
      author: $("#grAuthor").value.trim()
    });
    $("#grQty").value = ""; $("#grAuthor").value = ""; $("#grMsg").textContent = "Added ✅"; renderCart();
  });

  $("#grRemove").addEventListener("click", () => {
    if (!selectedRow) return ($("#grMsg").textContent = "Select a row first.");
    cart = cart.filter(x => String(x.rowId) !== selectedRow); selectedRow = null; renderCart();
  });

  $("#grClear").addEventListener("click", () => { cart = []; selectedRow = null; renderCart(); });

  $("#grSave").addEventListener("click", async () => {
    if (cart.length === 0) return ($("#grMsg").textContent = "Nothing to save.");
    const sid = $("#grSupplier").value;
    const s = allSuppliers.find(x => String(x.id) === sid);
    if (!s) return ($("#grMsg").textContent = "Select a supplier.");
    try {
      await api("POST", "/goods-received", {
        shopId: currentUser.shopId, supplierId: s.id,
        invoiceNo: $("#grInvoiceNo").value.trim(),
        invoiceDate: $("#grInvoiceDate").value || null,
        enteredBy: currentUser.id,
        total: cart.reduce((sum, x) => sum + x.selling * x.qty, 0),
        items: cart
      });
      allProducts = await api("GET", `/products/${currentUser.shopId}`);
      cart = []; selectedRow = null; renderCart(); renderProdList();
      $("#grInvoiceNo").value = ""; $("#grInvoiceDate").value = "";
      $("#grProd").value = ""; $("#grCost").value = ""; $("#grSelling").value = ""; $("#grStock").value = "";
      $("#grMsg").textContent = "Saved ✅ Stock updated. Ready for next.";
    } catch (err) { $("#grMsg").textContent = err.message; }
  });

  [allProducts, allSuppliers] = await Promise.all([
    api("GET", `/products/${currentUser.shopId}`),
    api("GET", `/suppliers/${currentUser.shopId}`)
  ]);
  $("#grSupplier").innerHTML = allSuppliers.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join("") ||
    `<option value="">No suppliers - add suppliers first</option>`;
  loadSupplierInfo(); renderProdList(); renderCart();
}

/* =========================
   CUSTOMER GOODS (WHOLESALE)
========================= */
async function customerGoodsWholesale() {
  pageTitle.textContent = "Customer Goods (Wholesale)";

  let allProducts = [];
  let allCustomers = [];
  let cart = [];
  let selectedRow = null;

  screen.innerHTML = `
    <div class="panel">
      <div class="rowLine">
        <div style="flex:1"><div class="lbl">Select customer</div><select id="cgCustomer"></select></div>
        <div style="flex:1"><div class="lbl">Invoice number</div><input id="cgInvoice"/></div>
        <div style="flex:1"><div class="lbl">Date</div><input id="cgDate" type="date"/></div>
      </div>
    </div>
    <div style="height:10px"></div>
    <div class="grid2">
      <div class="panel">
        <h3 style="margin-top:0">Product List</h3>
        <input id="cgFind" placeholder="Search products..." />
        <table class="table" id="cgPTable">
          <thead><tr><th>Product</th><th>Stock</th><th>Wholesale</th></tr></thead>
          <tbody></tbody>
        </table>
      </div>
      <div class="panel">
        <h3 style="margin-top:0">Recording Goods for Customer Account</h3>
        <div class="grid3">
          <div><div class="lbl">Product name</div><input id="cgProd" list="cgProdList" placeholder="Type to search..."/><datalist id="cgProdList"></datalist></div>
          <div><div class="lbl">Wholesale price</div><input id="cgPrice" disabled/></div>
          <div><div class="lbl">QTY sold</div><input id="cgQty" type="number" step="1"/>
            <div style="color:var(--muted);font-size:12px;margin-top:6px">QTY IN STOCK: <b id="cgStock">0</b></div>
          </div>
        </div>
        <div class="btnRow">
          <button class="btn" id="cgAdd">ADD</button>
          <button class="btn2" id="cgRemove">REMOVE</button>
          <button class="btn2" id="cgClear">CLEAR ALL</button>
        </div>
        <table class="table" id="cgTable">
          <thead><tr><th>Product</th><th>QTY</th><th>Wholesale Price</th><th>Line Total</th></tr></thead>
          <tbody></tbody>
        </table>
        <div class="totalLine"><div>TOTAL AMOUNT</div><div id="cgTotal">${ghc(0)}</div></div>
        <div style="display:flex;justify-content:flex-end;margin-top:10px"><button class="btn" id="cgSave">SAVE</button></div>
        <div id="cgMsg" class="msg"></div>
      </div>
    </div>`;

  function renderProdList() {
    const q = ($("#cgFind").value || "").toLowerCase();
    const list = allProducts.filter(p => (p.name || "").toLowerCase().includes(q));
    $("#cgPTable tbody").innerHTML = list.map(p => `
      <tr data-id="${p.id}"><td>${esc(p.name)}</td><td>${Number(p.qty || 0)}</td><td>${ghc(p.wholesale || 0)}</td></tr>`).join("") ||
      `<tr><td colspan="3" style="color:var(--muted)">No products.</td></tr>`;
    $("#cgPTable tbody").querySelectorAll("tr[data-id]").forEach(tr => {
      tr.addEventListener("click", () => {
        const prod = allProducts.find(x => String(x.id) === tr.dataset.id);
        if (!prod) return;
        $("#cgProd").value = prod.name; $("#cgPrice").value = ghc(prod.wholesale || 0); $("#cgStock").textContent = Number(prod.qty || 0);
      });
    });
    $("#cgProdList").innerHTML = allProducts.map(p => `<option value="${esc(p.name)}"></option>`).join("");
  }

  function renderCart() {
    $("#cgTable tbody").innerHTML = cart.map(line => `
      <tr data-row="${line.rowId}">
        <td>${esc(line.productName)}</td><td>${line.qty}</td><td>${ghc(line.price)}</td><td>${ghc(line.price * line.qty)}</td>
      </tr>`).join("") || `<tr><td colspan="4" style="color:var(--muted)">No items yet.</td></tr>`;
    $("#cgTable tbody").querySelectorAll("tr[data-row]").forEach(tr => {
      tr.addEventListener("click", () => { selectedRow = tr.dataset.row; $("#cgMsg").textContent = "Row selected ✅"; });
    });
    $("#cgTotal").textContent = ghc(cart.reduce((s, x) => s + x.price * x.qty, 0));
  }

  $("#cgFind").addEventListener("input", renderProdList);
  $("#cgProd").addEventListener("input", () => {
    const p = allProducts.find(x => x.name.toLowerCase() === $("#cgProd").value.trim().toLowerCase());
    if (p) { $("#cgPrice").value = ghc(p.wholesale || 0); $("#cgStock").textContent = Number(p.qty || 0); }
  });

  $("#cgAdd").addEventListener("click", () => {
    const name = $("#cgProd").value.trim();
    const qty = Number($("#cgQty").value || 0);
    const p = allProducts.find(x => x.name.toLowerCase() === name.toLowerCase());
    if (!p) return ($("#cgMsg").textContent = "Select a valid product.");
    if (qty <= 0) return ($("#cgMsg").textContent = "Qty must be > 0.");
    if (qty > Number(p.qty || 0)) return ($("#cgMsg").textContent = "Not enough stock.");
    cart.push({ rowId: Date.now(), productId: p.id, productName: p.name, qty, price: Number(p.wholesale || 0) });
    $("#cgQty").value = ""; $("#cgMsg").textContent = "Added ✅"; renderCart();
  });

  $("#cgRemove").addEventListener("click", () => {
    if (!selectedRow) return ($("#cgMsg").textContent = "Select a row first.");
    cart = cart.filter(x => String(x.rowId) !== selectedRow); selectedRow = null; renderCart();
  });
  $("#cgClear").addEventListener("click", () => { cart = []; selectedRow = null; renderCart(); });

  $("#cgSave").addEventListener("click", async () => {
    if (cart.length === 0) return ($("#cgMsg").textContent = "Nothing to save.");
    const cid = $("#cgCustomer").value;
    const customer = allCustomers.find(c => String(c.id) === cid);
    if (!customer) return ($("#cgMsg").textContent = "Select a customer.");
    const total = cart.reduce((s, x) => s + x.price * x.qty, 0);
    try {
      // save as a sale with wholesale prices + deduct stock
      await api("POST", "/sales", {
        shopId: currentUser.shopId, enteredBy: currentUser.id, total, items: cart
      });
      // update customer balance
      await api("PUT", `/customers/${cid}`, {
        accountName: customer.account_name, location: customer.location,
        officeTel: customer.office_tel, whatsapp: customer.whatsapp,
        balance: Number(customer.balance || 0) + total,
        contactName: customer.contact_name, contactTel: customer.contact_tel
      });
      allProducts = await api("GET", `/products/${currentUser.shopId}`);
      allCustomers = await api("GET", `/customers/${currentUser.shopId}`);
      cart = []; selectedRow = null; renderCart(); renderProdList();
      $("#cgMsg").textContent = "Saved ✅ Stock + customer balance updated.";
    } catch (err) { $("#cgMsg").textContent = err.message; }
  });

  [allProducts, allCustomers] = await Promise.all([
    api("GET", `/products/${currentUser.shopId}`),
    api("GET", `/customers/${currentUser.shopId}`)
  ]);
  $("#cgCustomer").innerHTML = allCustomers.map(c => `<option value="${c.id}">${esc(c.account_name)}</option>`).join("") ||
    `<option value="">No customers - add customers first</option>`;
  renderProdList(); renderCart();
}

/* =========================
   EXPENSE ACCOUNTS SETUP (localStorage - lightweight)
========================= */
function expenseAccountsSetup() {
  pageTitle.textContent = "Expense Accounts";
  let selectedId = null;

  const getAccounts = () => JSON.parse(localStorage.getItem(`expAccounts_${currentUser.shopId}`) || "[]");
  const saveAccounts = (arr) => localStorage.setItem(`expAccounts_${currentUser.shopId}`, JSON.stringify(arr));

  screen.innerHTML = `
    <div class="grid2">
      <div class="panel">
        <h3 style="margin-top:0">List of Expense Accounts</h3>
        <input id="eaFind" placeholder="Search account..." />
        <table class="table" id="eaTable"><thead><tr><th>Account Name</th></tr></thead><tbody></tbody></table>
      </div>
      <div class="panel">
        <h3 style="margin-top:0">Expense Account Setup</h3>
        <div class="lbl">Account Name</div>
        <input id="eaName" placeholder="e.g. Transport, Prepaid, Staff Salary"/>
        <div style="height:10px"></div>
        <div class="lbl">Group Name</div>
        <input id="eaGroup" placeholder="N/A (optional)"/>
        <div class="btnRow">
          <button class="btn2" id="eaEdit">EDIT</button>
          <button class="btn2" id="eaRemove">REMOVE</button>
          <button class="btn" id="eaSave">SAVE</button>
          <button class="btn2" id="eaClose">CLOSE</button>
        </div>
        <div id="eaMsg" class="msg"></div>
      </div>
    </div>`;

  function render() {
    const all = getAccounts();
    const q = ($("#eaFind").value || "").toLowerCase();
    const list = all.filter(a => (a.name || "").toLowerCase().includes(q));
    $("#eaTable tbody").innerHTML = list.map(a => `<tr data-id="${a.id}"><td>${esc(a.name)}</td></tr>`).join("") ||
      `<tr><td style="color:var(--muted)">No expense accounts yet.</td></tr>`;
    $("#eaTable tbody").querySelectorAll("tr[data-id]").forEach(tr => {
      tr.addEventListener("click", () => {
        const a = all.find(x => x.id === tr.dataset.id);
        if (!a) return;
        selectedId = a.id; $("#eaName").value = a.name || ""; $("#eaGroup").value = a.group || "";
        $("#eaMsg").textContent = "Selected ✅";
      });
    });
  }

  $("#eaFind").addEventListener("input", render);
  $("#eaSave").addEventListener("click", () => {
    const name = $("#eaName").value.trim();
    if (!name) return ($("#eaMsg").textContent = "Account name is required.");
    const group = $("#eaGroup").value.trim() || "N/A";
    let all = getAccounts();
    if (selectedId) {
      all = all.map(x => x.id === selectedId ? { ...x, name, group } : x);
      $("#eaMsg").textContent = "Updated ✅";
    } else {
      all.push({ id: `ea_${Date.now()}`, name, group });
      $("#eaMsg").textContent = "Saved ✅";
    }
    saveAccounts(all); selectedId = null; $("#eaName").value = ""; $("#eaGroup").value = ""; render();
  });
  $("#eaEdit").addEventListener("click", () => {
    if (!selectedId) return ($("#eaMsg").textContent = "Select an account first.");
    $("#eaMsg").textContent = "Edit then click SAVE ✅";
  });
  $("#eaRemove").addEventListener("click", () => {
    if (!selectedId) return ($("#eaMsg").textContent = "Select an account first.");
    saveAccounts(getAccounts().filter(x => x.id !== selectedId));
    selectedId = null; $("#eaName").value = ""; render(); $("#eaMsg").textContent = "Removed ✅";
  });
  $("#eaClose").addEventListener("click", () => load("dashboard"));
  render();
}

/* =========================
   RECORD EXPENSES
========================= */
async function recordExpense() {
  pageTitle.textContent = "Record Expenses";
  const getAccounts = () => JSON.parse(localStorage.getItem(`expAccounts_${currentUser.shopId}`) || "[]");

  screen.innerHTML = `
    <div class="panel">
      <h3 style="margin-top:0">Record Expenses</h3>
      <div class="grid3">
        <div><div class="lbl">RECIPIENT</div><input id="exRec"/></div>
        <div><div class="lbl">AUTHORISED BY</div><input id="exAuth"/></div>
        <div><div class="lbl">MODE OF PAYMENT</div>
          <select id="exMode"><option>Mobile money</option><option>Cheque</option><option>Cash</option></select>
        </div>
      </div>
      <div style="height:10px"></div>
      <div class="grid3">
        <div style="grid-column:span 2"><div class="lbl">DESCRIPTION</div><input id="exDesc"/></div>
        <div><div class="lbl">DATE</div><input id="exDate" type="date"/></div>
      </div>
      <div style="height:10px"></div>
      <div class="grid3">
        <div><div class="lbl">ACC TYPE</div><select id="exAcc"></select></div>
        <div><div class="lbl">AMOUNT</div><input id="exAmt" type="number" step="0.01" placeholder="GHC 0.00"/></div>
        <div style="display:flex;align-items:flex-end;gap:10px">
          <button class="btn" id="exSave">SAVE</button>
          <button class="btn2" id="exClear">CLEAR</button>
        </div>
      </div>
      <div id="exMsg" class="msg"></div>
    </div>`;

  const accounts = getAccounts();
  $("#exAcc").innerHTML = accounts.map(a => `<option value="${esc(a.name)}">${esc(a.name)}</option>`).join("") ||
    `<option value="">No expense accounts - create them first</option>`;
  $("#exDate").value = new Date().toISOString().slice(0, 10);

  $("#exSave").addEventListener("click", async () => {
    const accountName = $("#exAcc").value;
    const recipient = $("#exRec").value.trim();
    const description = $("#exDesc").value.trim();
    const amount = Number($("#exAmt").value || 0);
    if (!recipient || !description) return ($("#exMsg").textContent = "Recipient and description are required.");
    if (amount <= 0) return ($("#exMsg").textContent = "Amount must be > 0.");
    try {
      await api("POST", "/expenses", {
        shopId: currentUser.shopId, accountName, description, recipient,
        mode: $("#exMode").value, amount, enteredBy: currentUser.id
      });
      $("#exMsg").textContent = "Saved ✅";
      $("#exRec").value = ""; $("#exDesc").value = ""; $("#exAuth").value = ""; $("#exAmt").value = "";
      $("#exDate").value = new Date().toISOString().slice(0, 10);
    } catch (err) { $("#exMsg").textContent = err.message; }
  });
  $("#exClear").addEventListener("click", () => {
    ["#exRec","#exDesc","#exAuth","#exAmt"].forEach(s => $(s).value = "");
    $("#exDate").value = new Date().toISOString().slice(0, 10);
    $("#exMsg").textContent = "";
  });
}

/* =========================
   EXPENSES REPORT
========================= */
async function expensesReport() {
  pageTitle.textContent = "Expenses Report";

  screen.innerHTML = `
    <div class="panel">
      <h3 style="margin-top:0">View Expenses</h3>
      <div class="rowLine">
        <div style="flex:1"><div class="lbl">From</div><input id="erFrom" type="date"/></div>
        <div style="flex:1"><div class="lbl">To</div><input id="erTo" type="date"/></div>
        <div style="display:flex;align-items:flex-end;gap:10px"><button class="btn" id="erSearch">SEARCH</button></div>
      </div>
      <div style="height:10px"></div>
      <div class="rowLine">
        <div style="flex:1"><div class="lbl">FIND</div><input id="erFind" placeholder="Search..."/></div>
        <div style="display:flex;align-items:flex-end;gap:10px">
          <button class="btn2" id="erDisplay">DISPLAY</button>
          <button class="btn2" id="erClose">CLOSE</button>
        </div>
      </div>
      <table class="table" id="erTable">
        <thead><tr><th>DATE</th><th>ACCOUNT</th><th>DESCRIPTION</th><th>RECIPIENT</th><th>MODE</th><th>AMOUNT</th></tr></thead>
        <tbody></tbody>
      </table>
      <div class="totalLine"><div>TOTAL</div><div id="erTotal">${ghc(0)}</div></div>
    </div>`;

  const today = new Date().toISOString().slice(0, 10);
  $("#erFrom").value = today; $("#erTo").value = today;
  let lastRows = [];

  function renderTable(rows) {
    const q = ($("#erFind").value || "").toLowerCase();
    const filtered = rows.filter(r =>
      `${r.account_name} ${r.description} ${r.recipient} ${r.mode}`.toLowerCase().includes(q));
    $("#erTable tbody").innerHTML = filtered.map(r => `
      <tr>
        <td>${esc((r.created_at || "").slice(0, 10))}</td>
        <td>${esc(r.account_name)}</td><td>${esc(r.description)}</td>
        <td>${esc(r.recipient)}</td><td>${esc(r.mode)}</td>
        <td>${Number(r.amount || 0).toFixed(2)}</td>
      </tr>`).join("") || `<tr><td colspan="6" style="color:var(--muted)">No results.</td></tr>`;
    $("#erTotal").textContent = ghc(filtered.reduce((s, x) => s + Number(x.amount || 0), 0));
    lastRows = filtered;
  }

  $("#erSearch").addEventListener("click", async () => {
    try {
      const from = $("#erFrom").value; const to = $("#erTo").value;
      let rows = await api("GET", `/expenses/${currentUser.shopId}`);
      rows = rows.filter(r => { const d = (r.created_at || "").slice(0, 10); return d >= from && d <= to; });
      renderTable(rows);
    } catch (err) { $("#erTable tbody").innerHTML = `<tr><td colspan="6">${esc(err.message)}</td></tr>`; }
  });
  $("#erFind").addEventListener("input", () => renderTable(lastRows));
  $("#erClose").addEventListener("click", () => load("dashboard"));
  $("#erDisplay").addEventListener("click", () => {
    const w = window.open("", "_blank");
    w.document.write(`<div style="font-family:Arial;padding:20px"><h2>Expenses Report</h2>
      <table border="1" cellpadding="8" style="width:100%;border-collapse:collapse">
        <tr><th>Date</th><th>Account</th><th>Description</th><th>Recipient</th><th>Mode</th><th>Amount</th></tr>
        ${lastRows.map(r => `<tr><td>${esc((r.created_at||"").slice(0,10))}</td><td>${esc(r.account_name)}</td><td>${esc(r.description)}</td><td>${esc(r.recipient)}</td><td>${esc(r.mode)}</td><td>${Number(r.amount||0).toFixed(2)}</td></tr>`).join("")}
      </table><p><b>Total: ${esc($("#erTotal").textContent)}</b></p></div>`);
    w.document.close(); w.print();
  });
  $("#erSearch").click();
}

/* =========================
   STOCK LEVEL
========================= */
async function stockLevel() {
  pageTitle.textContent = "Stock Level";
  screen.innerHTML = `<div class="panel"><h3 style="margin-top:0">Stock Level</h3><input id="stFind" placeholder="Search product..."/>
    <table class="table" id="stTable">
      <thead><tr><th>PRODUCT</th><th>SUPPLIER</th><th>CATEGORY</th><th>QTY</th><th>COST</th><th>SELLING</th><th>WHOLESALE</th><th>MARGIN</th></tr></thead>
      <tbody><tr><td colspan="8">Loading...</td></tr></tbody>
    </table></div>`;

  const products = await api("GET", `/products/${currentUser.shopId}`);
  const lowCount = products.filter(p => Number(p.qty || 0) <= 5).length;

  function render() {
    const q = ($("#stFind").value || "").toLowerCase();
    const list = products.filter(p => `${p.name} ${p.supplier} ${p.category}`.toLowerCase().includes(q));
    $("#stTable tbody").innerHTML = list.map(p => {
      const qty = Number(p.qty || 0);
      const danger = qty <= 5 ? `style="background:rgba(255,0,0,0.08)"` : "";
      return `<tr ${danger}>
        <td>${esc(p.name)}</td><td>${esc(p.supplier || "-")}</td><td>${esc(p.category || "-")}</td>
        <td>${qty}</td><td>${ghc(p.cost||0)}</td><td>${ghc(p.selling||0)}</td>
        <td>${ghc(p.wholesale||0)}</td><td>${ghc(p.margin||0)}</td></tr>`;
    }).join("") || `<tr><td colspan="8" style="color:var(--muted)">No products.</td></tr>`;
  }

  screen.querySelector("#stTable").insertAdjacentHTML("beforebegin",
    `<div style="color:var(--muted);font-size:12px;margin-bottom:8px">Low stock items (≤5): <b>${lowCount}</b></div>`);
  $("#stFind").addEventListener("input", render);
  render();
}

/* =========================
   DAILY SALES REPORT
========================= */
async function dailySalesReport() {
  pageTitle.textContent = "Daily Sales Report";
  screen.innerHTML = `
    <div class="panel">
      <h3 style="margin-top:0">Daily Sales Report</h3>
      <div class="rowLine">
        <div style="flex:1"><div class="lbl">From</div><input id="dsFrom" type="date"/></div>
        <div style="flex:1"><div class="lbl">To</div><input id="dsTo" type="date"/></div>
        <div style="display:flex;align-items:flex-end;gap:10px"><button class="btn" id="dsSearch">SEARCH</button></div>
      </div>
      <div style="height:10px"></div>
      <div class="rowLine">
        <div style="flex:1"><input id="dsFind" placeholder="Search product..."/></div>
        <div style="display:flex;align-items:flex-end;gap:10px"><button class="btn2" id="dsDisplay">DISPLAY</button></div>
      </div>
      <table class="table" id="dsTable">
        <thead><tr><th>DATE</th><th>PRODUCT</th><th>QTY SOLD</th><th>PRICE</th><th>TOTAL</th></tr></thead>
        <tbody></tbody>
      </table>
      <div class="totalLine"><div>TOTAL</div><div id="dsTotal">${ghc(0)}</div></div>
    </div>`;

  const today = new Date().toISOString().slice(0, 10);
  $("#dsFrom").value = today; $("#dsTo").value = today;
  let lastRows = [];

  function renderTable(rows) {
    const q = ($("#dsFind").value || "").toLowerCase();
    const filtered = rows.filter(r => (r.product_name || "").toLowerCase().includes(q));
    $("#dsTable tbody").innerHTML = filtered.map(r => `
      <tr><td>${esc((r.sale_date || "").slice(0,10))}</td><td>${esc(r.product_name)}</td>
      <td>${r.qty}</td><td>${ghc(r.price)}</td><td>${ghc(r.qty * r.price)}</td></tr>`).join("") ||
      `<tr><td colspan="5" style="color:var(--muted)">No results.</td></tr>`;
    $("#dsTotal").textContent = ghc(filtered.reduce((s, r) => s + r.qty * r.price, 0));
    lastRows = filtered;
  }

  $("#dsSearch").addEventListener("click", async () => {
    try {
      const from = $("#dsFrom").value; const to = $("#dsTo").value;
      const sales = await api("GET", `/sales/${currentUser.shopId}`);
      const rows = [];
      for (const sale of sales) {
        const d = (sale.sale_date || "").slice(0, 10);
        if (d < from || d > to) continue;
        for (const item of sale.items || []) {
          rows.push({ sale_date: sale.sale_date, product_name: item.product_name, qty: item.qty, price: item.price });
        }
      }
      renderTable(rows);
    } catch (err) { $("#dsTable tbody").innerHTML = `<tr><td colspan="5">${esc(err.message)}</td></tr>`; }
  });
  $("#dsFind").addEventListener("input", () => renderTable(lastRows));
  $("#dsDisplay").addEventListener("click", () => {
    const w = window.open("", "_blank");
    w.document.write(`<div style="font-family:Arial;padding:20px"><h2>Daily Sales Report</h2>
      <table border="1" cellpadding="8" style="width:100%;border-collapse:collapse">
        <tr><th>Date</th><th>Product</th><th>Qty</th><th>Price</th><th>Total</th></tr>
        ${lastRows.map(r=>`<tr><td>${esc((r.sale_date||"").slice(0,10))}</td><td>${esc(r.product_name)}</td><td>${r.qty}</td><td>${ghc(r.price)}</td><td>${ghc(r.qty*r.price)}</td></tr>`).join("")}
      </table><p><b>Total: ${esc($("#dsTotal").textContent)}</b></p></div>`);
    w.document.close(); w.print();
  });
  $("#dsSearch").click();
}

/* =========================
   GOODS RECEIVED REPORT
========================= */
async function goodsReceivedReport() {
  pageTitle.textContent = "Goods Received Report";
  screen.innerHTML = `
    <div class="panel">
      <h3 style="margin-top:0">Goods Received Report</h3>
      <div class="rowLine">
        <div style="flex:1"><div class="lbl">From</div><input id="grrFrom" type="date"/></div>
        <div style="flex:1"><div class="lbl">To</div><input id="grrTo" type="date"/></div>
        <div style="display:flex;align-items:flex-end;gap:10px"><button class="btn" id="grrSearch">SEARCH</button></div>
      </div>
      <table class="table" id="grrTable">
        <thead><tr><th>DATE</th><th>SUPPLIER</th><th>INVOICE NO</th><th>TOTAL</th></tr></thead>
        <tbody></tbody>
      </table>
      <div class="totalLine"><div>TOTAL</div><div id="grrTotal">${ghc(0)}</div></div>
    </div>`;

  const today = new Date().toISOString().slice(0, 10);
  $("#grrFrom").value = today; $("#grrTo").value = today;

  $("#grrSearch").addEventListener("click", async () => {
    try {
      const from = $("#grrFrom").value; const to = $("#grrTo").value;
      let rows = await api("GET", `/goods-received/${currentUser.shopId}`);
      rows = rows.filter(r => { const d = (r.created_at || "").slice(0, 10); return d >= from && d <= to; });
      $("#grrTable tbody").innerHTML = rows.map(r => `
        <tr><td>${esc((r.created_at||"").slice(0,10))}</td><td>${esc(r.supplier_name||"-")}</td>
        <td>${esc(r.invoice_no||"-")}</td><td>${ghc(r.total)}</td></tr>`).join("") ||
        `<tr><td colspan="4" style="color:var(--muted)">No results.</td></tr>`;
      $("#grrTotal").textContent = ghc(rows.reduce((s, r) => s + Number(r.total || 0), 0));
    } catch (err) { $("#grrTable tbody").innerHTML = `<tr><td colspan="4">${esc(err.message)}</td></tr>`; }
  });
  $("#grrSearch").click();
}

/* =========================
   END OF DAY
========================= */
async function endOfDay() {
  pageTitle.textContent = "End of Day Balancing";
  screen.innerHTML = `
    <div class="panel">
      <h3 style="margin-top:0">Income and Expenses - End of Day Balancing</h3>
      <div class="rowLine">
        <div style="flex:1"><div class="lbl">From</div><input id="eodFrom" type="date"/></div>
        <div style="flex:1"><div class="lbl">To</div><input id="eodTo" type="date"/></div>
        <div style="display:flex;align-items:flex-end;gap:10px"><button class="btn" id="eodRun">RUN</button></div>
      </div>
      <div style="height:10px"></div>
      <div class="grid2">
        <div class="panel">
          <h3 style="margin-top:0">DAILY SALES</h3>
          <table class="table" id="eodSalesTable"><thead><tr><th>DATE</th><th>AMOUNT</th></tr></thead><tbody></tbody></table>
          <div class="totalLine"><div>TOTAL</div><div id="eodSalesTotal">${ghc(0)}</div></div>
        </div>
        <div class="panel">
          <h3 style="margin-top:0">EXPENSES</h3>
          <table class="table" id="eodExpTable"><thead><tr><th>ACCOUNT</th><th>TOTAL</th></tr></thead><tbody></tbody></table>
          <div class="totalLine"><div>TOTAL</div><div id="eodExpTotal">${ghc(0)}</div></div>
        </div>
      </div>
      <div style="height:10px"></div>
      <div class="panel">
        <div class="totalLine">
          <div><b>TOTAL CASH ON HAND</b></div><div><b id="eodCash">${ghc(0)}</b></div>
        </div>
      </div>
    </div>`;

  const today = new Date().toISOString().slice(0, 10);
  $("#eodFrom").value = today; $("#eodTo").value = today;

  $("#eodRun").addEventListener("click", async () => {
    try {
      const from = $("#eodFrom").value; const to = $("#eodTo").value;
      const [sales, expenses] = await Promise.all([
        api("GET", `/sales/${currentUser.shopId}`),
        api("GET", `/expenses/${currentUser.shopId}`)
      ]);

      const salesByDate = {};
      for (const s of sales) {
        const d = (s.sale_date || "").slice(0, 10);
        if (d < from || d > to) continue;
        salesByDate[d] = (salesByDate[d] || 0) + Number(s.total || 0);
      }
      const salesRows = Object.keys(salesByDate).sort().map(d => ({ d, amt: salesByDate[d] }));
      $("#eodSalesTable tbody").innerHTML = salesRows.map(r =>
        `<tr><td>${esc(r.d)}</td><td>${ghc(r.amt)}</td></tr>`).join("") ||
        `<tr><td colspan="2" style="color:var(--muted)">No sales.</td></tr>`;
      const salesTotal = salesRows.reduce((s, r) => s + r.amt, 0);
      $("#eodSalesTotal").textContent = ghc(salesTotal);

      const expByAcc = {};
      for (const e of expenses) {
        const d = (e.created_at || "").slice(0, 10);
        if (d < from || d > to) continue;
        expByAcc[e.account_name || "Unknown"] = (expByAcc[e.account_name || "Unknown"] || 0) + Number(e.amount || 0);
      }
      const expRows = Object.keys(expByAcc).sort().map(k => ({ k, amt: expByAcc[k] }));
      $("#eodExpTable tbody").innerHTML = expRows.map(r =>
        `<tr><td>${esc(r.k)}</td><td>${ghc(r.amt)}</td></tr>`).join("") ||
        `<tr><td colspan="2" style="color:var(--muted)">No expenses.</td></tr>`;
      const expTotal = expRows.reduce((s, r) => s + r.amt, 0);
      $("#eodExpTotal").textContent = ghc(expTotal);
      $("#eodCash").textContent = ghc(salesTotal - expTotal);
    } catch (err) {
      screen.querySelector("#eodCash").textContent = "Error: " + err.message;
    }
  });
  $("#eodRun").click();
}

/* =========================
   MANAGE USERS
========================= */
async function manageUsers() {
  pageTitle.textContent = "Manage Users";
  if (currentUser.accessLevel === "SALESMAN") { alert("Access denied."); return load("dashboard"); }

  let selectedId = null;

  screen.innerHTML = `
    <div class="grid2">
      <div class="panel">
        <h3 style="margin-top:0">Create User Account</h3>
        <div class="grid3">
          <div><div class="lbl">FULL NAME</div><input id="uFull"/></div>
          <div><div class="lbl">USERNAME</div><input id="uuser"/></div>
          <div><div class="lbl">ACCESS LEVEL</div>
            <select id="uRole">
              <option value="ADMINISTRATOR">ADMINISTRATOR</option>
              <option value="SUPERVISOR">SUPERVISOR</option>
              <option value="SALESMAN">SALESMAN</option>
              <option value="WAREHOUSE">WAREHOUSE</option>
              <option value="AUDITOR">AUDITOR</option>
            </select>
          </div>
        </div>
        <div style="height:10px"></div>
        <div class="grid3">
          <div><div class="lbl">PASSWORD</div><input id="uPass" type="password"/></div>
          <div><div class="lbl">CONFIRM PASSWORD</div><input id="uPass2" type="password"/></div>
          <div style="display:flex;align-items:flex-end;gap:10px">
            <button class="btn" id="uSave">SAVE</button>
            <button class="btn2" id="uClear">CLEAR</button>
          </div>
        </div>
        <div id="uMsg" class="msg"></div>
      </div>
      <div class="panel">
        <h3 style="margin-top:0">Manage Workers</h3>
        <input id="uFind" placeholder="Search user..."/>
        <table class="table" id="uTable">
          <thead><tr><th>FULL NAME</th><th>USERNAME</th><th>ROLE</th><th>STATUS</th></tr></thead>
          <tbody><tr><td colspan="4">Loading...</td></tr></tbody>
        </table>
        <div class="btnRow">
          <button class="btn2" id="uRemove">REMOVE</button>
          <button class="btn2" id="uSuspend">SUSPEND</button>
          <button class="btn2" id="uActivate">ACTIVATE</button>
        </div>
        <div id="uMsg2" class="msg"></div>
      </div>
    </div>`;

  const tbody = $("#uTable tbody");

  async function renderList() {
    const q = ($("#uFind").value || "").toLowerCase();
    try {
      const all = await api("GET", `/workers/${currentUser.shopId}`);
      const list = all.filter(u => `${u.full_name} ${u.username} ${u.role}`.toLowerCase().includes(q));
      tbody.innerHTML = list.map(u => `
        <tr data-id="${u.id}">
          <td>${esc(u.full_name)}</td><td>${esc(u.username)}</td>
          <td>${esc(u.role)}</td><td>${u.is_suspended ? "SUSPENDED" : "ACTIVE"}</td>
        </tr>`).join("") || `<tr><td colspan="4" style="color:var(--muted)">No users found.</td></tr>`;
      tbody.querySelectorAll("tr[data-id]").forEach(tr => {
        tr.addEventListener("click", () => {
          const u = list.find(x => String(x.id) === tr.dataset.id);
          if (!u) return;
          selectedId = u.id;
          $("#uFull").value = u.full_name || ""; $("#uuser").value = u.username || "";
          $("#uRole").value = u.role || "SALESMAN";
          $("#uMsg2").textContent = "Selected ✅";
        });
      });
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="4">Error: ${esc(err.message)}</td></tr>`;
    }
  }

  function clearForm() {
    selectedId = null;
    ["#uFull","#uuser","#uPass","#uPass2"].forEach(s => $(s).value = "");
    $("#uRole").value = "ADMINISTRATOR";
  }

  $("#uFind").addEventListener("input", renderList);
  $("#uClear").addEventListener("click", () => { clearForm(); $("#uMsg").textContent = ""; });

  $("#uSave").addEventListener("click", async () => {
    const fullName = $("#uFull").value.trim();
    const username = $("#uuser").value.trim();
    const pass = $("#uPass").value;
    const pass2 = $("#uPass2").value;
    if (!fullName || !username) return ($("#uMsg").textContent = "Full name and username required.");
    if (!pass) return ($("#uMsg").textContent = "Password required.");
    if (pass !== pass2) return ($("#uMsg").textContent = "Passwords do not match.");
    try {
      await api("POST", "/create-worker", { shopId: currentUser.shopId, fullName, username, password: pass, role: $("#uRole").value });
      $("#uMsg").textContent = "Worker created ✅";
      clearForm(); await renderList();
    } catch (err) { $("#uMsg").textContent = err.message; }
  });

  $("#uRemove").addEventListener("click", async () => {
    if (!selectedId) return ($("#uMsg2").textContent = "Select a worker first.");
    if (!confirm("Remove this worker?")) return;
    try { await api("DELETE", `/workers/${selectedId}`); $("#uMsg2").textContent = "Removed ✅"; clearForm(); await renderList(); }
    catch (err) { $("#uMsg2").textContent = err.message; }
  });

  $("#uSuspend").addEventListener("click", async () => {
    if (!selectedId) return ($("#uMsg2").textContent = "Select a worker first.");
    try { await api("PUT", `/workers/${selectedId}/suspend`); $("#uMsg2").textContent = "Suspended ✅"; await renderList(); }
    catch (err) { $("#uMsg2").textContent = err.message; }
  });

  $("#uActivate").addEventListener("click", async () => {
    if (!selectedId) return ($("#uMsg2").textContent = "Select a worker first.");
    try { await api("PUT", `/workers/${selectedId}/activate`); $("#uMsg2").textContent = "Activated ✅"; await renderList(); }
    catch (err) { $("#uMsg2").textContent = err.message; }
  });

  await renderList();
}

/* =========================
   CUSTOMER PAYMENTS
========================= */
async function customerPayments() {
  pageTitle.textContent = "Customer Payment Account";

  let allCustomers = [];
  let allPayments = [];
  let selectedCustomerId = null;

  screen.innerHTML = `
    <div class="grid3">
      <div class="panel">
        <h3 style="margin-top:0">List of Customers</h3>
        <input id="cpFind" placeholder="Search customer..."/>
        <table class="table" id="cpTable">
          <thead><tr><th>ACCOUNT</th><th>BALANCE</th></tr></thead>
          <tbody><tr><td colspan="2">Loading...</td></tr></tbody>
        </table>
      </div>
      <div class="panel">
        <h3 style="margin-top:0">Account Info</h3>
        <div class="panel" style="padding:12px">
          <div class="lbl">ACCOUNT NAME</div><div id="cpName" style="font-weight:700">-</div>
          <div style="height:10px"></div>
          <div class="lbl">CURRENT BALANCE</div><div id="cpBal" style="font-weight:700">${ghc(0)}</div>
          <div style="height:10px"></div>
          <div class="lbl">LAST PAYMENT</div><div id="cpLast" style="font-weight:700">${ghc(0)}</div>
        </div>
      </div>
      <div class="panel">
        <h3 style="margin-top:0">Payment</h3>
        <div class="lbl">CURRENT BALANCE</div><div id="payCur" style="font-weight:700">${ghc(0)}</div>
        <div style="height:10px"></div>
        <div class="lbl">PAYMENT METHOD</div>
        <select id="payMethod"><option>Mobile money</option><option>Cash</option><option>Cheque</option></select>
        <div style="height:10px"></div>
        <div class="lbl">AMOUNT PAID</div><input id="payAmt" type="number" step="0.01" placeholder="0.00"/>
        <div style="height:10px"></div>
        <div class="lbl">REMAINING</div><div id="payRemain" style="font-weight:700">${ghc(0)}</div>
        <div class="btnRow">
          <button class="btn" id="paySave">SAVE</button>
          <button class="btn2" id="payDisplay">DISPLAY</button>
        </div>
        <div id="payMsg" class="msg"></div>
      </div>
    </div>`;

  function getCustomer() {
    return allCustomers.find(c => String(c.id) === String(selectedCustomerId)) || null;
  }

  function refreshPanel() {
    const c = getCustomer();
    if (!c) { ["#cpName","#cpBal","#cpLast","#payCur","#payRemain"].forEach(s => $(s).textContent = s === "#cpName" ? "-" : ghc(0)); return; }
    const bal = Number(c.balance || 0);
    const lastPay = allPayments.filter(p => String(p.customer_id) === String(c.id)).sort((a,b) => b.created_at?.localeCompare(a.created_at))[0];
    $("#cpName").textContent = c.account_name;
    $("#cpBal").textContent = ghc(bal);
    $("#cpLast").textContent = ghc(lastPay ? lastPay.amount : 0);
    $("#payCur").textContent = ghc(bal);
    $("#payRemain").textContent = ghc(bal - Number($("#payAmt").value || 0));
  }

  function renderList() {
    const q = ($("#cpFind").value || "").toLowerCase();
    const list = allCustomers.filter(c => (c.account_name || "").toLowerCase().includes(q));
    $("#cpTable tbody").innerHTML = list.map(c => `
      <tr data-id="${c.id}"><td>${esc(c.account_name)}</td><td>${ghc(c.balance||0)}</td></tr>`).join("") ||
      `<tr><td colspan="2" style="color:var(--muted)">No customers.</td></tr>`;
    $("#cpTable tbody").querySelectorAll("tr[data-id]").forEach(tr => {
      tr.addEventListener("click", () => {
        selectedCustomerId = tr.dataset.id; refreshPanel(); $("#payMsg").textContent = "Customer selected ✅";
      });
    });
  }

  $("#cpFind").addEventListener("input", renderList);
  $("#payAmt").addEventListener("input", refreshPanel);

  $("#paySave").addEventListener("click", async () => {
    const c = getCustomer();
    if (!c) return ($("#payMsg").textContent = "Select a customer first.");
    const amount = Number($("#payAmt").value || 0);
    if (amount <= 0) return ($("#payMsg").textContent = "Amount must be > 0.");
    try {
      await api("POST", "/customer-payments", {
        shopId: currentUser.shopId, customerId: c.id,
        amount, paymentMode: $("#payMethod").value, note: ""
      });
      $("#payMsg").textContent = "Saved ✅ Balance updated.";
      $("#payAmt").value = "";
      [allCustomers, allPayments] = await Promise.all([
        api("GET", `/customers/${currentUser.shopId}`),
        api("GET", `/customer-payments/${currentUser.shopId}`)
      ]);
      renderList(); refreshPanel();
    } catch (err) { $("#payMsg").textContent = err.message; }
  });

  $("#payDisplay").addEventListener("click", () => {
    const c = getCustomer();
    if (!c) return ($("#payMsg").textContent = "Select a customer first.");
    const payments = allPayments.filter(p => String(p.customer_id) === String(c.id))
      .sort((a,b) => a.created_at?.localeCompare(b.created_at));
    const w = window.open("", "_blank");
    w.document.write(`<div style="font-family:Arial;padding:20px"><h2>Customer Payment Statement</h2>
      <p><b>Account:</b> ${esc(c.account_name)}</p><p><b>Balance:</b> ${ghc(c.balance||0)}</p>
      <table border="1" cellpadding="8" style="width:100%;border-collapse:collapse">
        <tr><th>Date</th><th>Method</th><th>Amount</th></tr>
        ${payments.map(p=>`<tr><td>${esc((p.created_at||"").slice(0,10))}</td><td>${esc(p.payment_mode)}</td><td>${ghc(p.amount)}</td></tr>`).join("")}
      </table></div>`);
    w.document.close(); w.print();
  });

  [allCustomers, allPayments] = await Promise.all([
    api("GET", `/customers/${currentUser.shopId}`),
    api("GET", `/customer-payments/${currentUser.shopId}`)
  ]);
  renderList();
}

/* =========================
   START
========================= */
if (!currentUser) {
  alert("No currentUser found. Please login again.");
  window.location.href = "index.html";
} else {
  startApp();
}