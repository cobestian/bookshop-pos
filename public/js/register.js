const API_BASE = "";

const shopNameEl = document.getElementById("shopName");
const fullNameEl = document.getElementById("fullName");
const usernameEl = document.getElementById("username");
const passwordEl = document.getElementById("password");
const phone1El   = document.getElementById("phone1");
const phone2El   = document.getElementById("phone2");
const branchEl   = document.getElementById("branch");
const addressEl  = document.getElementById("address");
const msg        = document.getElementById("msg");
const registerBtn = document.getElementById("registerBtn");

registerBtn.addEventListener("click", register);

async function register() {
  const shopName = shopNameEl.value.trim();
  const fullName = fullNameEl.value.trim();
  const username = usernameEl.value.trim();
  const password = passwordEl.value.trim();
  const phone1   = phone1El.value.trim();
  const phone2   = phone2El.value.trim();
  const branch   = branchEl.value.trim();
  const address  = addressEl.value.trim();

  if (!shopName || !fullName || !username || !password) {
    msg.textContent = "Please fill in all required fields.";
    return;
  }

  registerBtn.disabled = true;
  registerBtn.textContent = "Creating...";
  msg.textContent = "";

  try {
    const res = await fetch(`${API_BASE}/register-shop`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shopName, fullName, username, password, phone1, phone2, branch, address })
    });

    const data = await res.json();

    if (!res.ok) {
      msg.textContent = data.message || "Registration failed.";
      registerBtn.disabled = false;
      registerBtn.textContent = "Create Account";
      return;
    }

    /* save shop settings locally so receipts show phone/branch immediately */
    if (data.shopId) {
      localStorage.setItem("shopSettings_" + data.shopId, JSON.stringify({ phone1, phone2, branch, address }));
    }

    msg.textContent = "Shop created successfully \u2705 Redirecting to login...";

    setTimeout(() => {
      window.location.href = "index.html";
    }, 1500);

  } catch (err) {
    console.error(err);
    msg.textContent = "Server error. Please try again.";
    registerBtn.disabled = false;
    registerBtn.textContent = "Create Account";
  }
}

/* allow Enter key to submit */
document.addEventListener("keydown", (e) => {
  if (e.key === "Enter") register();
});