const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

const db = mysql.createConnection({
  host: process.env.MYSQLHOST,
  user: process.env.MYSQLUSER,
  password: process.env.MYSQLPASSWORD,
  database: process.env.MYSQLDATABASE,
  port: process.env.MYSQLPORT
});

db.connect((err) => {
  if (err) {
    console.error("Database connection failed:", err);
    return;
  }
  console.log("Connected to Railway MySQL");
});

app.get("/", (req, res) => {
  res.send("Bookshop POS Server Running");
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});
app.post("/login", (req, res) => {
  const { username, password } = req.body;

  const sql = `
    SELECT users.id,
           users.shop_id,
           users.full_name,
           users.role,
           users.is_suspended,
           shops.shop_name
    FROM users
    JOIN shops ON users.shop_id = shops.id
    WHERE users.username = ? AND users.password = ?
    LIMIT 1
  `;

  db.query(sql, [username, password], (err, rows) => {
    if (err) {
      console.log(err);
      return res.status(500).json({ message: "Database error" });
    }

    if (rows.length === 0) {
      return res.status(401).json({ message: "Invalid login" });
    }

    const user = rows[0];

    if (user.is_suspended) {
      return res.status(403).json({ message: "Account suspended" });
    }

    res.json({
      id: user.id,
      fullName: user.full_name,
      accessLevel: user.role,
      shopId: user.shop_id,
      shopName: user.shop_name
    });
  });
});

app.post("/create-worker", (req, res) => {
  const { shopId, fullName, username, password, role } = req.body;

  const sql = `
    INSERT INTO users (shop_id, full_name, username, password, role, is_suspended)
    VALUES (?, ?, ?, ?, ?, false)
  `;

  db.query(sql, [shopId, fullName, username, password, role], (err, result) => {
    if (err) {
      console.log(err);
      return res.status(500).json({ message: "Could not create worker" });
    }

    res.json({ message: "Worker created successfully" });
  });
});
app.get("/workers/:shopId", (req, res) => {
  const shopId = req.params.shopId;

  const sql = `
    SELECT id, full_name, username, role, is_suspended
    FROM users
    WHERE shop_id = ?
    ORDER BY id DESC
  `;

  db.query(sql, [shopId], (err, rows) => {
    if (err) {
      console.log(err);
      return res.status(500).json({ error: "Database error" });
    }

    res.json(rows);
  });
});
app.post("/register-shop", (req, res) => {
  const { shopName, fullName, username, password } = req.body;

  const shopSql = "INSERT INTO shops (shop_name) VALUES (?)";

  db.query(shopSql, [shopName], (err, shopResult) => {
    if (err) {
      console.log(err);
      return res.status(500).json({ message: "Shop creation failed" });
    }

    const shopId = shopResult.insertId;

    const userSql = `
    INSERT INTO users (shop_id, full_name, username, password, role, is_suspended)
    VALUES (?, ?, ?, ?, 'OWNER', false)
    `;

    db.query(
      userSql,
      [shopId, fullName, username, password],
      (err2, userResult) => {
        if (err2) {
          console.log(err2);
          return res.status(500).json({ message: "Owner creation failed" });
        }

        res.json({
          message: "Shop created",
          shopId: shopId
        });
      }
    );
  });
});
app.delete("/workers/:id", (req, res) => {
  const workerId = req.params.id;

  const sql = "DELETE FROM users WHERE id = ?";

  db.query(sql, [workerId], (err, result) => {
    if (err) {
      console.log(err);
      return res.status(500).json({ message: "Could not remove worker" });
    }

    res.json({ message: "Worker removed successfully" });
  });
});
app.put("/workers/:id/suspend", (req, res) => {
  const workerId = req.params.id;

  db.query(
    "UPDATE users SET is_suspended = 1 WHERE id = ?",
    [workerId],
    (err, result) => {
      if (err) {
        console.log("Suspend error:", err);
        return res.status(500).json({ message: "Could not suspend worker" });
      }

      res.json({ message: "Worker suspended" });
    }
  );
});

app.put("/workers/:id/activate", (req, res) => {
  const workerId = req.params.id;

  db.query(
    "UPDATE users SET is_suspended = 0 WHERE id = ?",
    [workerId],
    (err, result) => {
      if (err) {
        console.log("Activate error:", err);
        return res.status(500).json({ message: "Could not activate worker" });
      }

      res.json({ message: "Worker activated" });
    }
  );
});
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
   console.log(`Server running on port ${PORT}`);
});