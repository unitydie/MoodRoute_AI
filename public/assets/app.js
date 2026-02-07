(function moodRouteAppModule() {
  const STORAGE_PREFILL = "moodroute_prefill";

  function storageGet(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (error) {
      return null;
    }
  }

  function storageSet(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (error) {
      // no-op
    }
  }

  function storageRemove(key) {
    try {
      window.localStorage.removeItem(key);
    } catch (error) {
      // no-op
    }
  }

  function getPageName() {
    return document.body?.dataset?.page || "";
  }

  function ensureAuroraBackground() {
    if (!document.body) {
      return;
    }

    document.body.classList.add("aurora");
    let auroraNode = document.querySelector(".aurora-bg");
    if (!auroraNode) {
      auroraNode = document.createElement("div");
      auroraNode.className = "aurora-bg";
      auroraNode.setAttribute("aria-hidden", "true");
      document.body.prepend(auroraNode);
    }
  }

  async function initTubesCursor() {
    if (!document.body || document.getElementById("tubes-cursor-canvas")) {
      return;
    }
    if (!window.matchMedia || !window.matchMedia("(pointer: fine)").matches) {
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.id = "tubes-cursor-canvas";
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.background = "transparent";
    document.body.appendChild(canvas);
    document.body.classList.add("has-tubes-cursor");

    try {
      const module = await import(
        "https://cdn.jsdelivr.net/npm/threejs-components@0.0.19/build/cursors/tubes1.min.js"
      );
      const TubesCursor = module?.default || module;
      if (typeof TubesCursor !== "function") {
        throw new Error("Tubes cursor module unavailable.");
      }

      const app = TubesCursor(canvas, {
        bloom: {
          threshold: 0.12,
          strength: 0.62,
          radius: 0.58
        },
        tubes: {
          count: 16,
          minRadius: 0.012,
          maxRadius: 0.09,
          lerp: 0.42,
          noise: 0.04,
          colors: ["#66d8ff", "#60b95a", "#6a73d6"],
          lights: {
            intensity: 95,
            colors: ["#74c9a5", "#6cb7e0", "#9ca0da", "#75a6d3"]
          }
        }
      });

      window.MoodRouteTubesCursor = app;
    } catch (error) {
      canvas.remove();
      document.body.classList.remove("has-tubes-cursor");
    }
  }

  function restoreClassicCursor() {
    if (!document.body) {
      return;
    }
    document.body.classList.remove("has-tubes-cursor");
    const cursorCanvas = document.getElementById("tubes-cursor-canvas");
    if (cursorCanvas) {
      cursorCanvas.remove();
    }
  }

  function escapeHtml(text) {
    return String(text || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function markActiveNavigation() {
    const currentPath = window.location.pathname.replace(/\/+$/, "") || "/";
    document.querySelectorAll(".site-nav a").forEach((link) => {
      if (link.hasAttribute("hidden") || link.classList.contains("is-hidden")) {
        link.classList.remove("is-active");
        return;
      }
      const path = new URL(link.href).pathname.replace(/\/+$/, "") || "/";
      const isHome = path === "/" && currentPath === "/";
      const isMatch = path !== "/" && currentPath.startsWith(path);
      if (isHome || isMatch) {
        link.classList.add("is-active");
      } else {
        link.classList.remove("is-active");
      }
    });
  }

  async function authApi(url, options = {}) {
    const response = await fetch(url, {
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error || `HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  function defaultAvatarHtml(username) {
    const letter = String(username || "U").trim().charAt(0).toUpperCase() || "U";
    return `<span class="profile-avatar profile-avatar-fallback" aria-hidden="true">${escapeHtml(letter)}</span>`;
  }

  function avatarHtml(user) {
    if (!user) {
      return defaultAvatarHtml("U");
    }
    if (user.provider === "github" && user.github_avatar_url) {
      return `
        <img
          class="profile-avatar profile-avatar-image"
          src="${escapeHtml(user.github_avatar_url)}"
          alt="${escapeHtml(user.username || "GitHub user")} avatar"
          referrerpolicy="no-referrer"
        >
      `;
    }
    return defaultAvatarHtml(user.username);
  }

  function applyAuthToHeader(authPayload) {
    const authenticated = Boolean(authPayload?.authenticated);
    const user = authPayload?.user || null;

    document.querySelectorAll("[data-nav-login]").forEach((loginLink) => {
      loginLink.classList.toggle("is-hidden", authenticated);
      if (authenticated) {
        loginLink.setAttribute("aria-hidden", "true");
        loginLink.setAttribute("tabindex", "-1");
      } else {
        loginLink.removeAttribute("aria-hidden");
        loginLink.removeAttribute("tabindex");
      }
    });

    document.querySelectorAll("[data-nav-profile]").forEach((profileLink) => {
      profileLink.classList.toggle("is-hidden", !authenticated);
      if (!authenticated) {
        profileLink.setAttribute("aria-hidden", "true");
        profileLink.setAttribute("tabindex", "-1");
      } else {
        profileLink.removeAttribute("aria-hidden");
        profileLink.removeAttribute("tabindex");
      }
    });

    document.querySelectorAll("[data-auth-slot]").forEach((slot) => {
      if (!slot.dataset.defaultHtml) {
        slot.dataset.defaultHtml = slot.innerHTML;
      }

      if (!authenticated) {
        slot.innerHTML = "";
        return;
      }

      const username = escapeHtml(user?.username || "user");
      slot.innerHTML = `
        <a href="/profile" class="header-profile-link" title="Open profile">
          ${avatarHtml(user)}
          <span class="header-profile-name">@${username}</span>
        </a>
        <button class="btn btn-small btn-outline" type="button" data-header-logout>Logout</button>
      `;
    });

    document.querySelectorAll("[data-header-logout]").forEach((button) => {
      button.addEventListener("click", async () => {
        button.disabled = true;
        try {
          await authApi("/api/auth/logout", {
            method: "POST",
            body: {}
          });
        } catch (error) {
          // best-effort logout
        }
        window.location.href = "/";
      });
    });

    markActiveNavigation();
  }

  async function initAuthLayout() {
    try {
      const payload = await authApi("/api/auth/me");
      applyAuthToHeader(payload);
      return payload;
    } catch (error) {
      applyAuthToHeader({ authenticated: false, user: null });
      return { authenticated: false, user: null };
    }
  }

  function initChatPage() {
    const root = document.getElementById("chat-page-root");
    if (!root || typeof window.createMoodRouteChat !== "function") {
      return;
    }

    const page = getPageName();
    const fullMode = page === "chat";
    const chat = window.createMoodRouteChat(root, {
      variant: "page",
      showSidebar: fullMode,
      title: "MoodRoute AI"
    });
    window.MoodRoutePageChat = chat;

    const queryPrefill = new URLSearchParams(window.location.search).get("prefill");
    const storedPrefill = storageGet(STORAGE_PREFILL);
    const prefill = queryPrefill || storedPrefill;
    if (prefill) {
      storageRemove(STORAGE_PREFILL);
      chat.ready.then(() => {
        chat.prefill(prefill);
      });
    }
  }

  function wireMoodPrefillButtons() {
    document.querySelectorAll("[data-prefill]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        const text = (button.getAttribute("data-prefill") || "").trim();
        if (!text) {
          return;
        }

        storageSet(STORAGE_PREFILL, text);

        if (window.MoodRoutePageChat) {
          window.MoodRoutePageChat.ready.then(() => {
            window.MoodRoutePageChat.prefill(text);
          });
          return;
        }

        window.location.href = `/chat?prefill=${encodeURIComponent(text)}`;
      });
    });
  }

  function initHomeQuickChat(authPayload) {
    const form = document.getElementById("home-quick-chat-form");
    const input = document.getElementById("home-quick-chat-input");
    if (!form || !input) {
      return;
    }

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const text = input.value.trim();
      if (!text) {
        input.focus();
        return;
      }

      storageSet(STORAGE_PREFILL, text);
      if (authPayload?.authenticated) {
        window.location.href = `/chat?prefill=${encodeURIComponent(text)}`;
        return;
      }

      window.location.href = "/login?next=%2Fchat#register-form";
    });
  }

  function initHomeTitleScramble() {
    const target = document.querySelector("[data-home-title-scramble]");
    if (!target) {
      return;
    }

    class TextScramble {
      constructor(element) {
        this.el = element;
        this.chars = "!<>-_\\/[]{}=+*^?#________";
        this.update = this.update.bind(this);
        this.frameRequest = null;
        this.frame = 0;
        this.queue = [];
        this.resolve = null;
      }

      setText(newText) {
        const oldText = this.el.innerText;
        const length = Math.max(oldText.length, newText.length);
        const promise = new Promise((resolve) => {
          this.resolve = resolve;
        });

        this.queue = [];
        for (let i = 0; i < length; i += 1) {
          const from = oldText[i] || "";
          const to = newText[i] || "";
          const start = Math.floor(Math.random() * 40);
          const end = start + Math.floor(Math.random() * 40);
          this.queue.push({ from, to, start, end });
        }

        if (this.frameRequest) {
          cancelAnimationFrame(this.frameRequest);
        }
        this.frame = 0;
        this.update();
        return promise;
      }

      update() {
        let output = "";
        let complete = 0;
        for (let i = 0; i < this.queue.length; i += 1) {
          let { from, to, start, end, char } = this.queue[i];
          if (this.frame >= end) {
            complete += 1;
            output += to;
          } else if (this.frame >= start) {
            if (!char || Math.random() < 0.28) {
              char = this.randomChar();
              this.queue[i].char = char;
            }
            output += `<span class="dud">${char}</span>`;
          } else {
            output += from;
          }
        }

        this.el.innerHTML = output;
        if (complete === this.queue.length) {
          if (typeof this.resolve === "function") {
            this.resolve();
          }
        } else {
          this.frameRequest = requestAnimationFrame(this.update);
          this.frame += 1;
        }
      }

      randomChar() {
        return this.chars[Math.floor(Math.random() * this.chars.length)];
      }
    }

    const phrases = [
      "MoodRoute",
      "City by Mood",
      "Find Your Route",
      "Ask MoodRoute"
    ];

    const fx = new TextScramble(target);
    let counter = 0;
    const next = () => {
      fx.setText(phrases[counter]).then(() => {
        window.setTimeout(next, 900);
      });
      counter = (counter + 1) % phrases.length;
    };
    next();
  }

  async function bootstrap() {
    ensureAuroraBackground();
    restoreClassicCursor();
    storageRemove("moodroute_theme");
    document.documentElement.removeAttribute("data-theme");
    const authPayload = await initAuthLayout();
    wireMoodPrefillButtons();

    const page = getPageName();
    if (page === "home") {
      initHomeTitleScramble();
      initHomeQuickChat(authPayload);
    }

    if (page === "explore" || page === "about" || page === "chat") {
      initChatPage();
    }
  }

  bootstrap();
})();
