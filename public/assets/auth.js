(function moodRouteAuthPageModule() {
  function pageName() {
    return document.body?.dataset?.page || "";
  }

  if (pageName() !== "login") {
    return;
  }

  const loginForm = document.getElementById("login-form");
  const registerForm = document.getElementById("register-form");
  const statusNode = document.getElementById("auth-status");
  const modeTitle = document.getElementById("auth-mode-title");
  const modeSwitches = document.querySelectorAll("[data-auth-switch]");
  const githubLink = document.getElementById("github-login-link");
  const query = new URLSearchParams(window.location.search);
  const nextPath = (() => {
    const raw = query.get("next") || "/chat";
    if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/api/")) {
      return "/chat";
    }
    return raw;
  })();

  function setMode(mode) {
    const useRegister = mode === "register";

    if (loginForm) {
      loginForm.classList.toggle("is-hidden", useRegister);
    }
    if (registerForm) {
      registerForm.classList.toggle("is-hidden", !useRegister);
    }

    if (modeTitle) {
      modeTitle.textContent = useRegister ? "Create account" : "Login";
    }

    modeSwitches.forEach((button) => {
      const current = button.getAttribute("data-auth-switch");
      button.classList.toggle("is-active", current === mode);
    });
  }

  function setStatus(text, isError = false) {
    if (!statusNode) {
      return;
    }
    statusNode.textContent = text || "";
    statusNode.classList.toggle("is-error", Boolean(isError));
  }

  async function request(url, body) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error || `HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  async function ensureAlreadyLoggedInRedirect() {
    try {
      const response = await fetch("/api/auth/me");
      const payload = await response.json();
      if (payload?.authenticated) {
        window.location.href = nextPath;
      }
    } catch (error) {
      // ignore
    }
  }

  if (githubLink) {
    githubLink.href = `/api/auth/github/start?next=${encodeURIComponent(nextPath)}`;
  }

  modeSwitches.forEach((button) => {
    button.addEventListener("click", () => {
      const mode = button.getAttribute("data-auth-switch") === "register"
        ? "register"
        : "login";
      window.location.hash = mode === "register" ? "register-form" : "login-form";
      setMode(mode);
    });
  });

  const initialMode = (() => {
    if (window.location.hash === "#register-form" || query.get("mode") === "register") {
      return "register";
    }
    return "login";
  })();
  setMode(initialMode);

  if (loginForm) {
    loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(loginForm);
      const email = String(formData.get("email") || "").trim();
      const password = String(formData.get("password") || "");

      if (!email || !password) {
        setStatus("Enter email and password.", true);
        return;
      }

      try {
        setStatus("Signing in...");
        await request("/api/auth/login", { email, password });
        setStatus("Signed in. Redirecting...");
        window.location.href = nextPath;
      } catch (error) {
        setStatus(error.message || "Login failed.", true);
      }
    });
  }

  if (registerForm) {
    registerForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(registerForm);
      const username = String(formData.get("username") || "").trim();
      const email = String(formData.get("email") || "").trim();
      const password = String(formData.get("password") || "");

      if (!email || !password) {
        setStatus("Enter email and password.", true);
        return;
      }

      try {
        setStatus("Creating account...");
        await request("/api/auth/register", { username, email, password });
        setStatus("Account created. Redirecting...");
        window.location.href = nextPath;
      } catch (error) {
        setStatus(error.message || "Registration failed.", true);
      }
    });
  }

  ensureAlreadyLoggedInRedirect();
})();
