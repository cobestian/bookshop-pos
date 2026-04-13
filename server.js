const express = require("express");
const mysql = require("mysql2");
const path = require("path");

const app = express();

// CORS
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  next();
});

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const db = mysql.createConnection({
  host: process.env.MYSQLHOST,
  user: process.env.MYSQLUSER,
  password: process.env.MYSQLPASSWORD,
  database: process.env.MYSQLDATABASE,
  port: process.env.MYSQLPORT
});

db.connect((err) => {
  if (err) {
    console.error("Database connection failed:", err.message);
  } else {
    console.log("Connected to MySQL database.");
  }
});

function query(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) reject(err);
      else resolve(results);
    });
  });
}

// Auto-create tables if they don't exist
async function initTables() {
  try {
    await query(`CREATE TABLE IF NOT EXISTS wholesale_sales (
      id INT AUTO_INCREMENT PRIMARY KEY,
      shop_id INT NOT NULL,
      customer_id INT,
      customer_name VARCHAR(150),
      invoice_no VARCHAR(100),
      date DATE,
      total DECIMAL(12,2) DEFAULT 0,
      entered_by INT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (shop_id) REFERENCES shops(id)
    )`);

    await query(`CREATE TABLE IF NOT EXISTS wholesale_sale_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      sale_id INT NOT NULL,
      product_id INT,
      product_name VARCHAR(150),
      qty INT DEFAULT 0,
      price DECIMAL(12,2) DEFAULT 0,
      FOREIGN KEY (sale_id) REFERENCES wholesale_sales(id)
    )`);

    await query(`CREATE TABLE IF NOT EXISTS adjustments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      shop_id INT NOT NULL,
      type ENUM('damage','return_customer','return_supplier') NOT NULL,
      product_id INT,
      product_name VARCHAR(150),
      qty INT DEFAULT 0,
      description TEXT,
      entered_by INT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (shop_id) REFERENCES shops(id)
    )`);

    // Add payment_mode to sales if not exists
    await query(`ALTER TABLE sales ADD COLUMN IF NOT EXISTS payment_mode VARCHAR(50) DEFAULT 'Cash'`).catch(() => {});

    // Add phone and branch to shops if not exists
    await query(`ALTER TABLE shops ADD COLUMN IF NOT EXISTS phone VARCHAR(100)`).catch(() => {});
    await query(`ALTER TABLE shops ADD COLUMN IF NOT EXISTS branch VARCHAR(150)`).catch(() => {});
    await query(`ALTER TABLE shops ADD COLUMN IF NOT EXISTS address VARCHAR(255)`).catch(() => {});

    console.log("Tables initialized.");
  } catch (err) {
    console.error("Table init error:", err.message);
  }
}

initTables();


app.use(express.static(path.join(__dirname, "public")));

app.get("/{*path}", (req, res) => {
  const ext = path.extname(req.path);
  if (ext && ext !== ".html") {
    res.status(404).send("Not found");
  } else {
    res.sendFile(path.join(__dirname, "public", "index.html"));
  }
});

/* =========================
   AUTH
========================= */
app.post("/register-shop", async (req, res) => {
  const { shopName, fullName, username, password } = req.body;
  try {
    const shopResult = await query("INSERT INTO shops (shop_name) VALUES (?)", [shopName]);
    const shopId = shopResult.insertId;
    await query(
      "INSERT INTO users (shop_id, full_name, username, password, role) VALUES (?, ?, ?, ?, 'OWNER')",
      [shopId, fullName, username, password]
    );
    res.json({ message: "Shop created", shopId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Registration failed", error: err.message });
  }
});

app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  try {
    const rows = await query(
      `SELECT users.id, users.shop_id, users.full_name, users.role, users.is_suspended, shops.shop_name
       FROM users JOIN shops ON users.shop_id = shops.id
       WHERE users.username = ? AND users.password = ? LIMIT 1`,
      [username, password]
    );
    if (rows.length === 0) return res.status(401).json({ message: "Invalid login" });
    const user = rows[0];
    if (user.is_suspended) return res.status(403).json({ message: "Account suspended" });
    res.json({
      id: user.id,
      fullName: user.full_name,
      accessLevel: user.role,
      shopId: user.shop_id,
      shopName: user.shop_name
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Database error" });
  }
});

/* =========================
   WORKERS
========================= */
app.get("/workers/:shopId", async (req, res) => {
  try {
    const rows = await query(
      "SELECT id, full_name, username, role, is_suspended FROM users WHERE shop_id = ? ORDER BY id DESC",
      [req.params.shopId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Database error" });
  }
});

app.post("/create-worker", async (req, res) => {
  const { shopId, fullName, username, password, role } = req.body;
  try {
    await query(
      "INSERT INTO users (shop_id, full_name, username, password, role) VALUES (?, ?, ?, ?, ?)",
      [shopId, fullName, username, password, role]
    );
    res.json({ message: "Worker created successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Could not create worker" });
  }
});

app.delete("/workers/:id", async (req, res) => {
  try {
    await query("DELETE FROM users WHERE id = ?", [req.params.id]);
    res.json({ message: "Worker removed successfully" });
  } catch (err) {
    res.status(500).json({ message: "Could not remove worker" });
  }
});

app.put("/workers/:id/suspend", async (req, res) => {
  try {
    await query("UPDATE users SET is_suspended = 1 WHERE id = ?", [req.params.id]);
    res.json({ message: "Worker suspended" });
  } catch (err) {
    res.status(500).json({ message: "Could not suspend worker" });
  }
});

app.put("/workers/:id/activate", async (req, res) => {
  try {
    await query("UPDATE users SET is_suspended = 0 WHERE id = ?", [req.params.id]);
    res.json({ message: "Worker activated" });
  } catch (err) {
    res.status(500).json({ message: "Could not activate worker" });
  }
});

/* =========================
   PRODUCTS
========================= */
app.get("/products/:shopId", async (req, res) => {
  try {
    const rows = await query("SELECT * FROM products WHERE shop_id = ? ORDER BY name ASC", [req.params.shopId]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Database error" });
  }
});

app.post("/products", async (req, res) => {
  const { shopId, name, supplier, category, cost, selling, wholesale, qty, margin } = req.body;
  try {
    const result = await query(
      "INSERT INTO products (shop_id, name, supplier, category, cost, selling, wholesale, qty, margin) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [shopId, name, supplier || "", category || "", cost || 0, selling || 0, wholesale || 0, qty || 0, margin || 0]
    );
    res.json({ message: "Product saved", id: result.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Could not save product" });
  }
});

app.put("/products/:id", async (req, res) => {
  const { name, supplier, category, cost, selling, wholesale, qty, margin } = req.body;
  try {
    await query(
      "UPDATE products SET name=?, supplier=?, category=?, cost=?, selling=?, wholesale=?, qty=?, margin=? WHERE id=?",
      [name, supplier || "", category || "", cost || 0, selling || 0, wholesale || 0, qty || 0, margin || 0, req.params.id]
    );
    res.json({ message: "Product updated" });
  } catch (err) {
    res.status(500).json({ message: "Could not update product" });
  }
});

app.put("/products/:id/qty", async (req, res) => {
  const { qty } = req.body;
  try {
    await query("UPDATE products SET qty = ? WHERE id = ?", [qty, req.params.id]);
    res.json({ message: "Qty updated" });
  } catch (err) {
    res.status(500).json({ message: "Could not update qty" });
  }
});

app.delete("/products/:id", async (req, res) => {
  try {
    await query("DELETE FROM products WHERE id = ?", [req.params.id]);
    res.json({ message: "Product removed" });
  } catch (err) {
    res.status(500).json({ message: "Could not remove product" });
  }
});

/* =========================
   SUPPLIERS
========================= */
app.get("/suppliers/:shopId", async (req, res) => {
  try {
    const rows = await query("SELECT * FROM suppliers WHERE shop_id = ? ORDER BY name ASC", [req.params.shopId]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Database error" });
  }
});

app.post("/suppliers", async (req, res) => {
  const { shopId, accountNo, name, location, phone, balance } = req.body;
  try {
    const result = await query(
      "INSERT INTO suppliers (shop_id, account_no, name, location, phone, balance) VALUES (?, ?, ?, ?, ?, ?)",
      [shopId, accountNo || "", name, location || "", phone || "", balance || 0]
    );
    res.json({ message: "Supplier saved", id: result.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Could not save supplier" });
  }
});

app.put("/suppliers/:id", async (req, res) => {
  const { accountNo, name, location, phone, balance } = req.body;
  try {
    await query(
      "UPDATE suppliers SET account_no=?, name=?, location=?, phone=?, balance=? WHERE id=?",
      [accountNo || "", name, location || "", phone || "", balance || 0, req.params.id]
    );
    res.json({ message: "Supplier updated" });
  } catch (err) {
    res.status(500).json({ message: "Could not update supplier" });
  }
});

app.delete("/suppliers/:id", async (req, res) => {
  try {
    await query("DELETE FROM suppliers WHERE id = ?", [req.params.id]);
    res.json({ message: "Supplier removed" });
  } catch (err) {
    res.status(500).json({ message: "Could not remove supplier" });
  }
});

/* =========================
   CUSTOMERS
========================= */
app.get("/customers/:shopId", async (req, res) => {
  try {
    const rows = await query("SELECT * FROM customers WHERE shop_id = ? ORDER BY account_name ASC", [req.params.shopId]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Database error" });
  }
});

app.post("/customers", async (req, res) => {
  const { shopId, accountName, location, officeTel, whatsapp, balance, contactName, contactTel } = req.body;
  try {
    const result = await query(
      "INSERT INTO customers (shop_id, account_name, location, office_tel, whatsapp, balance, contact_name, contact_tel) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [shopId, accountName, location || "", officeTel || "", whatsapp || "", balance || 0, contactName || "", contactTel || ""]
    );
    res.json({ message: "Customer saved", id: result.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Could not save customer" });
  }
});

app.put("/customers/:id", async (req, res) => {
  const { accountName, location, officeTel, whatsapp, balance, contactName, contactTel } = req.body;
  try {
    await query(
      "UPDATE customers SET account_name=?, location=?, office_tel=?, whatsapp=?, balance=?, contact_name=?, contact_tel=? WHERE id=?",
      [accountName, location || "", officeTel || "", whatsapp || "", balance || 0, contactName || "", contactTel || "", req.params.id]
    );
    res.json({ message: "Customer updated" });
  } catch (err) {
    res.status(500).json({ message: "Could not update customer" });
  }
});

app.delete("/customers/:id", async (req, res) => {
  try {
    await query("DELETE FROM customers WHERE id = ?", [req.params.id]);
    res.json({ message: "Customer removed" });
  } catch (err) {
    res.status(500).json({ message: "Could not remove customer" });
  }
});

/* =========================
   SALES
========================= */
app.get("/sales/:shopId", async (req, res) => {
  try {
    const sales = await query("SELECT * FROM sales WHERE shop_id = ? ORDER BY sale_date DESC", [req.params.shopId]);
    for (const sale of sales) {
      sale.items = await query(
        "SELECT si.*, p.name as product_name, p.supplier FROM sales_items si JOIN products p ON si.product_id = p.id WHERE si.sale_id = ?",
        [sale.id]
      );
    }
    res.json(sales);
  } catch (err) {
    res.status(500).json({ error: "Database error" });
  }
});

app.post("/sales", async (req, res) => {
  const { shopId, enteredBy, total, paymentMode, items } = req.body;
  try {
    const saleResult = await query(
      "INSERT INTO sales (shop_id, entered_by, total, payment_mode) VALUES (?, ?, ?, ?)",
      [shopId, enteredBy, total, paymentMode || "Cash"]
    );
    const saleId = saleResult.insertId;
    for (const item of items) {
      await query(
        "INSERT INTO sales_items (sale_id, product_id, qty, price) VALUES (?, ?, ?, ?)",
        [saleId, item.productId, item.qty, item.price]
      );
      await query("UPDATE products SET qty = qty - ? WHERE id = ?", [item.qty, item.productId]);
    }
    res.json({ message: "Sale saved", id: saleId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Could not save sale" });
  }
});

/* =========================
   GOODS RECEIVED
========================= */
app.get("/goods-received/:shopId", async (req, res) => {
  try {
    const records = await query(
      "SELECT gr.*, s.name as supplier_name FROM goods_received gr LEFT JOIN suppliers s ON gr.supplier_id = s.id WHERE gr.shop_id = ? ORDER BY gr.created_at DESC",
      [req.params.shopId]
    );
    for (const rec of records) {
      rec.items = await query(
        "SELECT * FROM goods_received_items WHERE gr_id = ?",
        [rec.id]
      ).catch(() => []);
    }
    res.json(records);
  } catch (err) {
    res.status(500).json({ error: "Database error" });
  }
});

app.post("/goods-received", async (req, res) => {
  const { shopId, supplierId, invoiceNo, invoiceDate, enteredBy, items, total } = req.body;
  try {
    const result = await query(
      "INSERT INTO goods_received (shop_id, supplier_id, invoice_no, invoice_date, total, entered_by) VALUES (?, ?, ?, ?, ?, ?)",
      [shopId, supplierId, invoiceNo || "", invoiceDate || null, total, enteredBy]
    );
    const grId = result.insertId;
    for (const item of items) {
      const existing = await query(
        "SELECT id FROM products WHERE shop_id = ? AND LOWER(name) = LOWER(?)",
        [shopId, item.productName]
      );
      if (existing.length > 0) {
        await query("UPDATE products SET qty = qty + ?, cost = ?, selling = ? WHERE id = ?",
          [item.qty, item.cost, item.selling, existing[0].id]);
      } else {
        await query(
          "INSERT INTO products (shop_id, name, supplier, cost, selling, wholesale, qty, margin) VALUES (?, ?, ?, ?, ?, 0, ?, ?)",
          [shopId, item.productName, item.supplierName || "", item.cost, item.selling, item.qty, item.selling - item.cost]
        );
      }
      await query("UPDATE suppliers SET balance = balance + ? WHERE id = ?", [item.cost * item.qty, supplierId]);

      // Save items
      await query(
        "INSERT IGNORE INTO goods_received_items (gr_id, product_name, qty, cost, selling, invoice_no) VALUES (?, ?, ?, ?, ?, ?) ",
        [grId, item.productName, item.qty, item.cost, item.selling, invoiceNo || ""]
      ).catch(() => {});
    }
    res.json({ message: "Goods received saved", id: grId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Could not save goods received" });
  }
});

/* =========================
   EXPENSES
========================= */
app.get("/expenses/:shopId", async (req, res) => {
  try {
    const rows = await query("SELECT * FROM expenses WHERE shop_id = ? ORDER BY created_at DESC", [req.params.shopId]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Database error" });
  }
});

app.post("/expenses", async (req, res) => {
  const { shopId, accountName, description, recipient, mode, amount, enteredBy } = req.body;
  try {
    const result = await query(
      "INSERT INTO expenses (shop_id, account_name, description, recipient, mode, amount, entered_by) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [shopId, accountName || "", description || "", recipient || "", mode || "", amount, enteredBy]
    );
    res.json({ message: "Expense saved", id: result.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Could not save expense" });
  }
});

/* =========================
   CUSTOMER PAYMENTS
========================= */
app.get("/customer-payments/:shopId", async (req, res) => {
  try {
    const rows = await query("SELECT * FROM customer_payments WHERE shop_id = ? ORDER BY created_at DESC", [req.params.shopId]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Database error" });
  }
});

app.post("/customer-payments", async (req, res) => {
  const { shopId, customerId, amount, paymentMode, note } = req.body;
  try {
    await query(
      "INSERT INTO customer_payments (shop_id, customer_id, amount, payment_mode, note) VALUES (?, ?, ?, ?, ?)",
      [shopId, customerId, amount, paymentMode || "", note || ""]
    );
    await query("UPDATE customers SET balance = balance - ? WHERE id = ?", [amount, customerId]);
    res.json({ message: "Payment saved" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Could not save payment" });
  }
});

/* =========================
   WHOLESALE SALES
========================= */
app.get("/wholesale-sales/:shopId", async (req, res) => {
  try {
    const sales = await query(
      "SELECT * FROM wholesale_sales WHERE shop_id = ? ORDER BY created_at DESC",
      [req.params.shopId]
    );
    for (const sale of sales) {
      sale.items = await query(
        "SELECT * FROM wholesale_sale_items WHERE sale_id = ?",
        [sale.id]
      );
    }
    res.json(sales);
  } catch (err) {
    res.status(500).json({ error: "Database error" });
  }
});

app.post("/wholesale-sales", async (req, res) => {
  const { shopId, customerId, customerName, invoiceNo, date, enteredBy, total, items } = req.body;
  try {
    const result = await query(
      "INSERT INTO wholesale_sales (shop_id, customer_id, customer_name, invoice_no, date, total, entered_by) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [shopId, customerId, customerName, invoiceNo, date, total, enteredBy]
    );
    const saleId = result.insertId;
    for (const item of items) {
      await query(
        "INSERT INTO wholesale_sale_items (sale_id, product_id, product_name, qty, price) VALUES (?, ?, ?, ?, ?)",
        [saleId, item.productId, item.productName, item.qty, item.price]
      );
    }
    res.json({ message: "Wholesale sale saved", id: saleId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Could not save wholesale sale" });
  }
});

/* =========================
   ADJUSTMENTS
========================= */
app.get("/adjustments/:shopId", async (req, res) => {
  try {
    const rows = await query(
      "SELECT * FROM adjustments WHERE shop_id = ? ORDER BY created_at DESC",
      [req.params.shopId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Database error" });
  }
});

app.post("/adjustments", async (req, res) => {
  const { shopId, type, productId, productName, qty, description, enteredBy } = req.body;
  try {
    // Save adjustment record
    await query(
      "INSERT INTO adjustments (shop_id, type, product_id, product_name, qty, description, entered_by) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [shopId, type, productId, productName, qty, description || "", enteredBy]
    );

    // Adjust product quantity based on type
    if (type === "damage") {
      // Deduct from stock
      await query("UPDATE products SET qty = GREATEST(0, qty - ?) WHERE id = ?", [qty, productId]);
    } else if (type === "return_customer") {
      // Add back to stock
      await query("UPDATE products SET qty = qty + ? WHERE id = ?", [qty, productId]);
    } else if (type === "return_supplier") {
      // Deduct from stock
      await query("UPDATE products SET qty = GREATEST(0, qty - ?) WHERE id = ?", [qty, productId]);
    }

    res.json({ message: "Adjustment saved" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Could not save adjustment" });
  }
});

const PORT = process.env.PORT || 3000;

app.get("/{*path}", (req, res) => {
  const ext = path.extname(req.path);
  if (ext && ext !== ".html") {
    res.status(404).send("Not found");
  } else {
    res.sendFile(path.join(__dirname, "public", "index.html"));
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`BESTIAN SHOP POS Server running on port ${PORT}`);
});