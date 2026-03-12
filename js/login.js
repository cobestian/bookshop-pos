const userInput = document.getElementById("user");
const passInput = document.getElementById("pass");
const msg = document.getElementById("msg");
const loginBtn = document.getElementById("loginBtn");

loginBtn.addEventListener("click", login);

async function login() {
  const username = userInput.value.trim();
  const password = passInput.value.trim();

  if (!username || !password) {
    msg.textContent = "Enter username and password";
    return;
  }

  try {
    const res = await fetch("https://bookshop-pos-production.up.railway.app/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();

    if (!res.ok) {
      msg.textContent = data.message || "Login failed";
      return;
    }

    localStorage.setItem("currentUser", JSON.stringify(data));
    console.log("LOGIN SAVED currentUser =", data);

    window.location.href = "app.html";
  } catch (err) {
    console.error(err);
    msg.textContent = "Server error";
  }
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Enter") login();
});
