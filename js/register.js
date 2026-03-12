const API_BASE = "https://bookshop-pos-production.up.railway.app";

const shopNameEl = document.getElementById("shopName");
const fullNameEl = document.getElementById("fullName");
const emailEl = document.getElementById("email");
const passwordEl = document.getElementById("password");
const msg = document.getElementById("msg");
const registerBtn = document.getElementById("registerBtn");

registerBtn.addEventListener("click", register);

async function register() {
  const shopName = shopNameEl.value.trim();
  const fullName = fullNameEl.value.trim();
  const username = emailEl.value.trim();
  const password = passwordEl.value.trim();

  if (!shopName || !fullName || !username || !password) {
    msg.textContent = "Fill all fields";
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/register-shop`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        shopName,
        fullName,
        username,
        password
      })
    });

    const data = await res.json();

    if (!res.ok) {
      msg.textContent = data.message || "Registration failed";
      return;
    }

    msg.textContent = "Shop created successfully ✅";

    setTimeout(() => {
      window.location.href = "index.html";
    }, 1000);
  } catch (err) {
    console.error(err);
    msg.textContent = "Server error";
  }
}