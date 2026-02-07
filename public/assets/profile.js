(function moodRouteProfileModule() {
  if ((document.body?.dataset?.page || "") !== "profile") {
    return;
  }

  const profileForm = document.getElementById("profile-form");
  const visitedForm = document.getElementById("visited-form");
  const statusNode = document.getElementById("profile-status");

  function setStatus(text, isError = false) {
    if (!statusNode) {
      return;
    }
    statusNode.textContent = text || "";
    statusNode.classList.toggle("is-error", Boolean(isError));
  }

  async function api(url, options = {}) {
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

  function profileFromForm() {
    const formData = new FormData(profileForm);
    return {
      default_city: String(formData.get("default_city") || "").trim(),
      default_vibe: String(formData.get("default_vibe") || "").trim(),
      default_budget: String(formData.get("default_budget") || "").trim(),
      crowd_tolerance: String(formData.get("crowd_tolerance") || "").trim(),
      weather_preference: String(formData.get("weather_preference") || "").trim(),
      default_duration: String(formData.get("default_duration") || "").trim(),
      notes: String(formData.get("notes") || "").trim()
    };
  }

  function visitedPlacesFromForm() {
    const formData = new FormData(visitedForm);
    const raw = String(formData.get("visited_places") || "");
    return raw
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  function applyProfile(profile) {
    if (!profileForm || !visitedForm || !profile) {
      return;
    }

    const values = {
      default_city: profile.default_city || "",
      default_vibe: profile.default_vibe || "",
      default_budget: profile.default_budget || "",
      crowd_tolerance: profile.crowd_tolerance || "",
      weather_preference: profile.weather_preference || "",
      default_duration: profile.default_duration || "",
      notes: profile.notes || ""
    };

    Object.entries(values).forEach(([name, value]) => {
      const input = profileForm.querySelector(`[name="${name}"]`);
      if (input) {
        input.value = value;
      }
    });

    const visitedInput = visitedForm.querySelector('[name="visited_places"]');
    if (visitedInput) {
      visitedInput.value = Array.isArray(profile.visited_places)
        ? profile.visited_places.join("\n")
        : "";
    }
  }

  async function loadProfile() {
    try {
      const auth = await api("/api/auth/me");
      if (!auth?.authenticated) {
        window.location.href = `/login?next=${encodeURIComponent("/profile")}`;
        return;
      }

      const payload = await api("/api/profile");
      applyProfile(payload.profile || {});
    } catch (error) {
      if (error.status === 401) {
        window.location.href = `/login?next=${encodeURIComponent("/profile")}`;
        return;
      }
      setStatus(error.message || "Failed to load profile.", true);
    }
  }

  async function saveAll(patch = {}) {
    const payload = {
      ...profileFromForm(),
      visited_places: visitedPlacesFromForm(),
      ...patch
    };

    const updated = await api("/api/profile", {
      method: "PUT",
      body: payload
    });
    applyProfile(updated.profile || payload);
  }

  if (profileForm) {
    profileForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        setStatus("Saving profile...");
        await saveAll();
        setStatus("Profile saved.");
      } catch (error) {
        if (error.status === 401) {
          window.location.href = `/login?next=${encodeURIComponent("/profile")}`;
          return;
        }
        setStatus(error.message || "Failed to save profile.", true);
      }
    });
  }

  if (visitedForm) {
    visitedForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        setStatus("Saving places...");
        await saveAll({
          visited_places: visitedPlacesFromForm()
        });
        setStatus("Visited places saved.");
      } catch (error) {
        if (error.status === 401) {
          window.location.href = `/login?next=${encodeURIComponent("/profile")}`;
          return;
        }
        setStatus(error.message || "Failed to save places.", true);
      }
    });
  }

  loadProfile();
})();
