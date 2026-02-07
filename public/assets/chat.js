(function moodRouteChatModule() {
  const STORAGE_ACTIVE_CONVERSATION = "moodroute_active_conversation";
  const STORAGE_PREFILL = "moodroute_prefill";
  const MAX_INPUT_CHARS = 1200;
  const MAX_IMAGE_UPLOAD_BYTES = 4 * 1024 * 1024;

  function escapeHtml(text) {
    return String(text || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function toHtmlWithBreaks(text) {
    return escapeHtml(text).replace(/\n/g, "<br>");
  }

  function isSafeExternalUrl(url) {
    try {
      const parsed = new URL(String(url || "").trim());
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch (error) {
      return false;
    }
  }

  function renderPlainTextWithUrls(text) {
    const raw = String(text || "");
    const urlRegex = /https?:\/\/[^\s<>"')]+/g;
    let cursor = 0;
    let html = "";
    let match = urlRegex.exec(raw);

    while (match) {
      const foundUrl = String(match[0] || "");
      const start = Number(match.index || 0);
      html += toHtmlWithBreaks(raw.slice(cursor, start));

      if (isSafeExternalUrl(foundUrl)) {
        html += `<a href="${escapeHtml(foundUrl)}" target="_blank" rel="noopener noreferrer nofollow">${escapeHtml(
          foundUrl
        )}</a>`;
      } else {
        html += toHtmlWithBreaks(foundUrl);
      }

      cursor = start + foundUrl.length;
      match = urlRegex.exec(raw);
    }

    html += toHtmlWithBreaks(raw.slice(cursor));
    return html;
  }

  function renderTextWithLinks(text) {
    const raw = String(text || "");
    const markdownLinkRegex = /\[([^\]\n]{1,120})\]\((https?:\/\/[^\s)]+)\)/g;
    let cursor = 0;
    let html = "";
    let match = markdownLinkRegex.exec(raw);

    while (match) {
      const fullToken = String(match[0] || "");
      const label = String(match[1] || "");
      const url = String(match[2] || "");
      const start = Number(match.index || 0);

      html += renderPlainTextWithUrls(raw.slice(cursor, start));
      if (isSafeExternalUrl(url)) {
        html += `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer nofollow">${escapeHtml(
          label
        )}</a>`;
      } else {
        html += toHtmlWithBreaks(fullToken);
      }

      cursor = start + fullToken.length;
      match = markdownLinkRegex.exec(raw);
    }

    html += renderPlainTextWithUrls(raw.slice(cursor));
    return html;
  }

  function isSafeUploadUrl(url) {
    return /^\/uploads\/[A-Za-z0-9._-]+$/.test(String(url || "").trim());
  }

  function cleanAttachmentName(name) {
    const cleaned = String(name || "")
      .replace(/[^\w.\- ]+/g, "")
      .trim()
      .slice(0, 80);
    return cleaned || "uploaded-image";
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Failed to read image file."));
      reader.readAsDataURL(file);
    });
  }

  function renderMessageContent(rawText) {
    const text = String(rawText || "");
    const matches = Array.from(text.matchAll(/\[\[image:([^\]|]+)\|?([^\]]*)\]\]/g));
    if (!matches.length) {
      return renderTextWithLinks(text);
    }

    let cursor = 0;
    let html = "";
    for (const match of matches) {
      const token = match[0] || "";
      const offset = Number(match.index || 0);
      const imageUrl = String(match[1] || "").trim();
      const imageName = cleanAttachmentName(match[2] || "");

      html += renderTextWithLinks(text.slice(cursor, offset));
      if (isSafeUploadUrl(imageUrl)) {
        html += `
          <figure class="mr-inline-image">
            <img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(imageName)}" loading="lazy">
            <figcaption>${escapeHtml(imageName)}</figcaption>
          </figure>
        `;
      } else {
        html += renderTextWithLinks(token);
      }

      cursor = offset + token.length;
    }

    html += renderTextWithLinks(text.slice(cursor));
    return html;
  }

  function formatTimestamp(raw) {
    if (!raw) {
      return "";
    }
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
      return "";
    }
    return parsed.toLocaleString([], {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function truncate(text, limit) {
    const value = String(text || "");
    if (value.length <= limit) {
      return value;
    }
    return `${value.slice(0, limit)}...`;
  }

  function compactMessagePreview(text) {
    return String(text || "")
      .replace(/\[\[image:[^\]]+\]\]/g, "[Photo]")
      .replace(/\s+/g, " ")
      .trim();
  }

  function safeStorageGet(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (error) {
      return null;
    }
  }

  function safeStorageSet(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (error) {
      // no-op
    }
  }

  function safeStorageRemove(key) {
    try {
      window.localStorage.removeItem(key);
    } catch (error) {
      // no-op
    }
  }

  class MoodRouteChat {
    constructor(root, options = {}) {
      this.root = root;
      this.options = {
        variant: "page",
        showSidebar: true,
        title: "MoodRoute AI Planner",
        ...options
      };
      this.state = {
        meta: null,
        mode: null,
        user: null,
        conversations: [],
        activeConversationId: null,
        messages: [],
        sending: false,
        pendingAttachment: null
      };
      this.typingNode = null;
      this.renderShell();
      this.bindEvents();
      this.ready = this.init();
    }

    renderShell() {
      const sidebar = this.options.showSidebar
        ? `
          <aside class="mr-chat-sidebar">
            <div class="mr-chat-sidebar-top">
              <h3>Conversations</h3>
            </div>
            <ul class="mr-chat-conversation-list" data-role="conversation-list"></ul>
          </aside>
        `
        : "";

      this.root.innerHTML = `
        <div class="mr-chat-shell mr-chat-shell--${escapeHtml(this.options.variant)}">
          ${sidebar}
          <section class="mr-chat-main">
            <header class="mr-chat-topbar">
              <div>
                <h2 class="mr-chat-title">${escapeHtml(this.options.title)}</h2>
                <p class="mr-chat-meta" data-role="meta"></p>
              </div>
              <div class="mr-chat-top-actions">
                <select class="mr-conversation-select" data-role="conversation-select" aria-label="Conversations"></select>
                <button class="chip-button" type="button" data-action="new-chat">New Chat</button>
                <button class="chip-button" type="button" data-action="clear-chat">Clear</button>
                <button class="chip-button" type="button" data-action="export-chat">Export</button>
              </div>
            </header>
            <p class="mr-notice" data-role="notice"></p>
            <div class="mr-chat-messages" data-role="messages"></div>
            <form class="mr-chat-form" data-role="form">
              <div class="mr-gemini-input">
                <div class="mr-gemini-inner">
                  <button
                    class="mr-gemini-side-icon mr-attach-button"
                    data-role="attach"
                    type="button"
                    aria-label="Attach image"
                  >+</button>
                  <input
                    class="mr-chat-input"
                    data-role="input"
                    type="text"
                    maxlength="${MAX_INPUT_CHARS}"
                    placeholder="Ask MoodRoute"
                    autocomplete="off"
                  >
                  <button class="mr-chat-send" type="submit" data-role="send" aria-label="Send message"></button>
                </div>
                <div class="mr-gemini-border" aria-hidden="true"></div>
              </div>
              <input
                class="mr-file-input"
                data-role="file-input"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                hidden
              >
              <div class="mr-attachment-preview" data-role="attachment-preview"></div>
            </form>
          </section>
        </div>
      `;

      this.elements = {
        meta: this.root.querySelector('[data-role="meta"]'),
        notice: this.root.querySelector('[data-role="notice"]'),
        form: this.root.querySelector('[data-role="form"]'),
        input: this.root.querySelector('[data-role="input"]'),
        send: this.root.querySelector('[data-role="send"]'),
        messages: this.root.querySelector('[data-role="messages"]'),
        conversationList: this.root.querySelector('[data-role="conversation-list"]'),
        conversationSelect: this.root.querySelector('[data-role="conversation-select"]'),
        newButtons: this.root.querySelectorAll('[data-action="new-chat"]'),
        clearButton: this.root.querySelector('[data-action="clear-chat"]'),
        exportButton: this.root.querySelector('[data-action="export-chat"]'),
        attachButton: this.root.querySelector('[data-role="attach"]'),
        fileInput: this.root.querySelector('[data-role="file-input"]'),
        attachmentPreview: this.root.querySelector('[data-role="attachment-preview"]')
      };
      this.renderAttachmentPreview();
    }

    bindEvents() {
      this.elements.form.addEventListener("submit", (event) => {
        event.preventDefault();
        this.handleSubmit();
      });

      this.elements.input.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          this.handleSubmit();
        }
      });

      this.elements.conversationSelect.addEventListener("change", async (event) => {
        const nextId = Number(event.target.value);
        if (Number.isInteger(nextId) && nextId > 0) {
          await this.loadConversation(nextId);
        }
      });

      this.elements.newButtons.forEach((button) => {
        button.addEventListener("click", async () => {
          await this.createConversationAndActivate();
        });
      });

      this.elements.clearButton.addEventListener("click", async () => {
        await this.clearActiveConversation();
      });

      this.elements.exportButton.addEventListener("click", () => {
        this.exportActiveConversation();
      });

      this.elements.attachButton.addEventListener("click", () => {
        if (this.elements.attachButton.disabled) {
          return;
        }
        this.elements.fileInput.click();
      });

      this.elements.fileInput.addEventListener("change", async (event) => {
        const file = event.target.files && event.target.files[0];
        event.target.value = "";
        await this.handleAttachmentSelection(file);
      });

      this.elements.attachmentPreview.addEventListener("click", (event) => {
        const removeButton = event.target.closest('[data-action="remove-attachment"]');
        if (!removeButton) {
          return;
        }
        this.clearPendingAttachment();
        this.focusInput();
      });

      if (this.elements.conversationList) {
        this.elements.conversationList.addEventListener("click", async (event) => {
          const deleteButton = event.target.closest('[data-action="delete-chat"]');
          if (deleteButton) {
            const targetId = Number(deleteButton.getAttribute("data-delete-conversation-id"));
            if (Number.isInteger(targetId) && targetId > 0) {
              await this.deleteConversationById(targetId, {
                confirm: true,
                confirmText: "Delete this chat from history?",
                noticeText: "Chat deleted."
              });
            }
            return;
          }

          const button = event.target.closest("[data-conversation-id]");
          if (!button) {
            return;
          }
          const targetId = Number(button.getAttribute("data-conversation-id"));
          if (Number.isInteger(targetId) && targetId > 0) {
            await this.loadConversation(targetId);
          }
        });
      }
    }

    async init() {
      try {
        await this.loadMeta();
        await this.loadCurrentUser();
        if (!this.state.user) {
          this.renderAuthRequired(
            "Sign in to create personal chat projects and restore history."
          );
          return;
        }

        this.setAuthControlsEnabled(true);
        await this.refreshConversations();
        if (this.state.conversations.length === 0) {
          await this.createConversationAndActivate();
        } else {
          const remembered = Number(safeStorageGet(STORAGE_ACTIVE_CONVERSATION));
          const exists = this.state.conversations.find(
            (item) => item.id === remembered
          );
          const initialConversationId = exists
            ? remembered
            : this.state.conversations[0].id;
          await this.loadConversation(initialConversationId);
        }

        const prefill = this.consumePrefill();
        if (prefill) {
          this.prefill(prefill);
        }
      } catch (error) {
        this.setNotice(error.message || "Failed to initialize chat.", true);
      }
    }

    async api(url, options = {}) {
      const response = await fetch(url, {
        method: options.method || "GET",
        headers: {
          "Content-Type": "application/json",
          ...(options.headers || {})
        },
        body: options.body ? JSON.stringify(options.body) : undefined
      });

      if (!response.ok) {
        let message = `HTTP ${response.status}`;
        try {
          const payload = await response.json();
          if (payload && payload.error) {
            message = payload.error;
          }
        } catch (error) {
          // ignore JSON parse failures
        }
        const err = new Error(message);
        err.status = response.status;
        throw err;
      }

      if (response.status === 204) {
        return null;
      }

      return response.json();
    }

    async loadMeta() {
      const payload = await this.api("/api/meta");
      this.state.meta = payload;
      this.updateMetaLine();
    }

    async loadCurrentUser() {
      const payload = await this.api("/api/auth/me");
      this.state.user = payload?.authenticated ? payload.user : null;
      this.updateMetaLine();
    }

    updateMetaLine() {
      const personality = this.state.meta?.personality?.name || "MoodRoute Guide";
      let modeText = this.state.meta?.liveApiConfigured
        ? `OpenAI (${this.state.meta.model || "configured"})`
        : "Mock demo mode";

      if (this.state.mode === "openai") {
        modeText = `OpenAI (${this.state.meta?.model || "configured"})`;
      } else if (this.state.mode === "mock" || this.state.mode === "mock-fallback") {
        modeText = "Mock demo mode";
      }

      const userText = this.state.user?.username
        ? ` В· @${this.state.user.username}`
        : "";
      this.elements.meta.textContent = `${personality} В· ${modeText}${userText}`;
    }

    setNotice(text, isError = false) {
      this.elements.notice.textContent = text || "";
      this.elements.notice.classList.toggle("is-error", Boolean(isError));
    }

    setSending(isSending) {
      this.state.sending = isSending;
      this.elements.input.disabled = isSending || !this.state.user;
      this.elements.send.disabled = isSending || !this.state.user;
      this.elements.attachButton.disabled = isSending || !this.state.user;
      this.elements.send.classList.toggle("is-sending", isSending);
      this.elements.send.setAttribute("aria-label", isSending ? "Sending..." : "Send message");
    }

    setAuthControlsEnabled(enabled) {
      const state = Boolean(enabled);
      this.elements.input.disabled = !state;
      this.elements.send.disabled = !state;
      this.elements.attachButton.disabled = !state;
      this.elements.fileInput.disabled = !state;
      this.elements.newButtons.forEach((button) => {
        button.disabled = !state;
      });
      this.elements.clearButton.disabled = !state;
      this.elements.exportButton.disabled = !state;
      this.elements.conversationSelect.disabled = !state;
    }

    async refreshConversations() {
      const payload = await this.api("/api/conversations");
      this.state.conversations = Array.isArray(payload.conversations)
        ? payload.conversations
        : [];
      this.renderConversationList();
      this.renderConversationSelect();
    }

    renderConversationList() {
      if (!this.elements.conversationList) {
        return;
      }

      if (this.state.conversations.length === 0) {
        const noDataText = this.state.user ? "No chats yet." : "Sign in to see chats.";
        this.elements.conversationList.innerHTML = `<li class="mr-conversation-meta">${noDataText}</li>`;
        return;
      }

      this.elements.conversationList.innerHTML = this.state.conversations
        .map((conversation) => {
          const isActive = conversation.id === this.state.activeConversationId;
          const preview = conversation.last_message
            ? truncate(compactMessagePreview(conversation.last_message), 52)
            : "No messages yet";
          return `
            <li class="mr-conversation-item">
              <button
                type="button"
                class="mr-conversation-card ${isActive ? "is-active" : ""}"
                data-conversation-id="${conversation.id}"
              >
                <p class="mr-conversation-title">${escapeHtml(
                  truncate(conversation.title || "Untitled", 44)
                )}</p>
                <p class="mr-conversation-meta">${escapeHtml(preview)}</p>
              </button>
              <button
                type="button"
                class="mr-conversation-delete"
                data-action="delete-chat"
                data-delete-conversation-id="${conversation.id}"
                aria-label="Delete chat"
                title="Delete chat"
              >x</button>
            </li>
          `;
        })
        .join("");
    }

    renderConversationSelect() {
      const activeId = this.state.activeConversationId;
      if (this.state.conversations.length === 0) {
        this.elements.conversationSelect.innerHTML =
          '<option value="">No chats</option>';
        return;
      }

      this.elements.conversationSelect.innerHTML = this.state.conversations
        .map((conversation) => {
          const selected = conversation.id === activeId ? "selected" : "";
          return `<option value="${conversation.id}" ${selected}>${escapeHtml(
            truncate(conversation.title || `Chat #${conversation.id}`, 36)
          )}</option>`;
        })
        .join("");
    }

    async createConversationAndActivate() {
      if (!this.state.user) {
        this.renderAuthRequired("Sign in to create chats.");
        return;
      }
      const payload = await this.api("/api/conversations", {
        method: "POST",
        body: {
          title: "New MoodRoute Chat"
        }
      });

      const conversationId = payload?.conversation?.id;
      await this.refreshConversations();
      if (conversationId) {
        await this.loadConversation(conversationId);
      }
    }

    async loadConversation(conversationId) {
      if (!this.state.user) {
        this.renderAuthRequired("Sign in to load chats.");
        return;
      }
      const payload = await this.api(`/api/conversations/${conversationId}/messages`);
      this.state.activeConversationId = conversationId;
      this.state.messages = Array.isArray(payload.messages) ? payload.messages : [];
      safeStorageSet(STORAGE_ACTIVE_CONVERSATION, String(conversationId));
      this.renderConversationList();
      this.renderConversationSelect();
      this.renderMessages();
      this.focusInput();
    }

    renderMessages() {
      if (!this.state.messages.length) {
        this.elements.messages.innerHTML = `
          <div class="mr-empty">
            <p>Start with your mood and constraints.</p>
            <p>Example: "Cozy mood in Oslo, 90 minutes, low crowds, under $25."</p>
          </div>
        `;
        return;
      }

      this.elements.messages.innerHTML = this.state.messages
        .map((message) => {
          const role = message.role === "user" ? "user" : "assistant";
          const roleLabel = role === "user" ? "You" : "MoodRoute AI";
          return `
            <article class="mr-message mr-message--${role}">
              <div class="mr-message-role">${roleLabel}</div>
              <div class="mr-message-bubble">${renderMessageContent(
                message.content || ""
              )}</div>
              <time class="mr-message-time">${formatTimestamp(
                message.created_at
              )}</time>
            </article>
          `;
        })
        .join("");

      this.scrollMessagesToBottom();
    }

    renderAuthRequired(reason) {
      this.state.conversations = [];
      this.state.activeConversationId = null;
      this.state.messages = [];
      this.clearPendingAttachment();
      this.setAuthControlsEnabled(false);
      this.renderConversationList();
      this.renderConversationSelect();
      const currentPath =
        window.location.pathname && window.location.pathname.startsWith("/")
          ? window.location.pathname
          : "/chat";
      const safeNext = currentPath.startsWith("/api/") ? "/chat" : currentPath;
      const nextEncoded = encodeURIComponent(safeNext);

      this.elements.messages.innerHTML = `
        <div class="mr-empty mr-auth-required">
          <p><strong>Sign in required</strong></p>
          <p>Your chats are stored per account. Sign in to continue.</p>
          <p>
            <a class="btn btn-accent btn-small" href="/login?next=${nextEncoded}">Sign in / Register</a>
          </p>
          <p>
            <a class="chip-button" href="/api/auth/github/start?next=${nextEncoded}">Continue with GitHub</a>
          </p>
        </div>
      `;
      if (reason) {
        this.setNotice(reason);
      } else {
        this.setNotice("");
      }
      this.updateMetaLine();
    }

    renderAttachmentPreview() {
      if (!this.elements.attachmentPreview) {
        return;
      }

      const file = this.state.pendingAttachment;
      if (!file) {
        this.elements.attachmentPreview.innerHTML = "";
        return;
      }

      const fileSizeKb = Math.max(1, Math.round(file.size / 1024));
      this.elements.attachmentPreview.innerHTML = `
        <div class="mr-attachment-pill">
          <span class="mr-attachment-name">${escapeHtml(cleanAttachmentName(file.name))}</span>
          <span class="mr-attachment-size">${fileSizeKb} KB</span>
          <button type="button" class="mr-attachment-remove" data-action="remove-attachment" aria-label="Remove attachment">x</button>
        </div>
      `;
    }

    clearPendingAttachment() {
      this.state.pendingAttachment = null;
      this.renderAttachmentPreview();
    }

    async handleAttachmentSelection(file) {
      if (!file) {
        return;
      }
      if (!file.type || !file.type.startsWith("image/")) {
        this.setNotice("Only image files are supported.", true);
        return;
      }
      if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
        this.setNotice("Image is too large. Max 4 MB.", true);
        return;
      }

      this.state.pendingAttachment = file;
      this.renderAttachmentPreview();
      this.setNotice(`Attached image: ${cleanAttachmentName(file.name)}`);
    }

    async uploadPendingAttachment() {
      const file = this.state.pendingAttachment;
      if (!file) {
        return null;
      }

      const dataUrl = await readFileAsDataUrl(file);
      const payload = await this.api("/api/uploads/image", {
        method: "POST",
        body: {
          filename: cleanAttachmentName(file.name),
          dataUrl
        }
      });
      const url = String(payload?.url || "").trim();
      if (!isSafeUploadUrl(url)) {
        throw new Error("Image upload failed.");
      }
      return {
        url,
        fileName: cleanAttachmentName(payload?.fileName || file.name)
      };
    }

    composeUserMessage(message, attachment) {
      const base = message || "Shared a photo.";
      if (!attachment) {
        return base;
      }
      return `${base}\n[[image:${attachment.url}|${attachment.fileName}]]`;
    }

    composeModelMessage(message, attachment) {
      const base = message || "The user shared a photo and wants help.";
      if (!attachment) {
        return base;
      }
      return `${base}\nThe user attached an image (${attachment.fileName}). Analyze the image and adapt the answer using visible details.`.slice(
        0,
        MAX_INPUT_CHARS
      );
    }

    async deleteConversationById(conversationId, options = {}) {
      if (!this.state.user) {
        this.renderAuthRequired("Sign in to manage chats.");
        return false;
      }

      const id = Number(conversationId);
      if (!Number.isInteger(id) || id <= 0) {
        return false;
      }

      const shouldConfirm = options.confirm !== false;
      if (shouldConfirm) {
        const confirmed = window.confirm(
          options.confirmText || "Delete this chat from history?"
        );
        if (!confirmed) {
          return false;
        }
      }

      try {
        const deletingActive = id === this.state.activeConversationId;
        await this.api(`/api/conversations/${id}`, {
          method: "DELETE"
        });

        if (deletingActive) {
          this.state.activeConversationId = null;
          this.state.messages = [];
          safeStorageRemove(STORAGE_ACTIVE_CONVERSATION);
        }

        await this.refreshConversations();
        if (this.state.conversations.length === 0) {
          await this.createConversationAndActivate();
        } else if (deletingActive) {
          await this.loadConversation(this.state.conversations[0].id);
        } else {
          this.renderConversationList();
          this.renderConversationSelect();
        }

        this.setNotice(options.noticeText || "Chat deleted.");
        return true;
      } catch (error) {
        if (error?.status === 401) {
          this.state.user = null;
          this.renderAuthRequired("Session expired. Sign in again.");
        } else {
          this.setNotice(error.message || "Failed to delete chat.", true);
        }
        return false;
      }
    }

    appendLocalMessage(role, content) {
      this.state.messages.push({
        role,
        content,
        created_at: new Date().toISOString()
      });
      this.renderMessages();
    }

    showTyping() {
      if (this.typingNode) {
        return;
      }
      const node = document.createElement("article");
      node.className = "mr-message mr-message--assistant mr-typing";
      node.innerHTML = `
        <div class="mr-message-role">MoodRoute AI</div>
        <div class="mr-message-bubble">
          <span class="mr-typing-dot"></span>
          <span class="mr-typing-dot"></span>
          <span class="mr-typing-dot"></span>
          <span>typing...</span>
        </div>
      `;
      this.typingNode = node;
      this.elements.messages.appendChild(node);
      this.scrollMessagesToBottom();
    }

    hideTyping() {
      if (!this.typingNode) {
        return;
      }
      this.typingNode.remove();
      this.typingNode = null;
    }

    async handleSubmit() {
      if (!this.state.user) {
        this.renderAuthRequired("Sign in to send messages.");
        return;
      }

      const message = this.elements.input.value.trim();
      const hasAttachment = Boolean(this.state.pendingAttachment);
      if ((!message && !hasAttachment) || this.state.sending) {
        return;
      }
      if (message.length > MAX_INPUT_CHARS) {
        this.setNotice(`Message too long. Max ${MAX_INPUT_CHARS} chars.`, true);
        return;
      }

      try {
        this.setNotice("");
        this.setSending(true);
        let uploadedAttachment = null;
        if (hasAttachment) {
          if (message.length > MAX_INPUT_CHARS - 180) {
            this.setNotice("Message too long with attachment. Shorten text and try again.", true);
            return;
          }
          this.setNotice("Uploading image...");
          uploadedAttachment = await this.uploadPendingAttachment();
          this.setNotice("");
        }

        const userMessage = this.composeUserMessage(message, uploadedAttachment);
        const modelMessage = this.composeModelMessage(message, uploadedAttachment);
        if (userMessage.length > MAX_INPUT_CHARS) {
          this.setNotice(`Message too long. Max ${MAX_INPUT_CHARS} chars.`, true);
          return;
        }

        if (!this.state.activeConversationId) {
          await this.createConversationAndActivate();
        }

        this.elements.input.value = "";
        this.clearPendingAttachment();
        this.appendLocalMessage("user", userMessage);
        this.showTyping();

        const chatPayload = await this.api("/api/chat", {
          method: "POST",
          body: {
            message: modelMessage,
            conversationId: this.state.activeConversationId,
            attachments: uploadedAttachment ? [uploadedAttachment] : []
          }
        });

        this.state.mode = chatPayload.mode;
        this.updateMetaLine();
        this.hideTyping();
        this.appendLocalMessage("assistant", chatPayload.reply || "No reply.");

        await this.api(
          `/api/conversations/${this.state.activeConversationId}/messages`,
          {
            method: "POST",
            body: {
              userMessage,
              assistantMessage: chatPayload.reply || ""
            }
          }
        );

        await this.refreshConversations();
        await this.loadConversation(this.state.activeConversationId);

        if (chatPayload.mode === "mock" || chatPayload.mode === "mock-fallback") {
          this.setNotice("Mock mode active. Add a valid OPENAI_API_KEY for live model replies.");
        }
      } catch (error) {
        this.hideTyping();
        if (
          error?.status === 401 ||
          String(error.message || "").toLowerCase().includes("authentication required")
        ) {
          this.state.user = null;
          this.renderAuthRequired("Session expired. Sign in again.");
        } else {
          this.setNotice(error.message || "Failed to send message.", true);
        }
      } finally {
        this.setSending(false);
        this.focusInput();
      }
    }

    async clearActiveConversation() {
      if (!this.state.user) {
        this.renderAuthRequired("Sign in to manage chats.");
        return;
      }
      if (!this.state.activeConversationId) {
        return;
      }

      await this.deleteConversationById(this.state.activeConversationId, {
        confirm: true,
        confirmText: "Clear will permanently delete this chat. Continue?",
        noticeText: "Chat deleted."
      });
    }

    exportActiveConversation() {
      if (!this.state.user) {
        this.renderAuthRequired("Sign in to export chats.");
        return;
      }
      const conversation = this.state.conversations.find(
        (item) => item.id === this.state.activeConversationId
      );
      if (!conversation) {
        this.setNotice("No active conversation to export.", true);
        return;
      }

      const payload = {
        app: "MoodRoute AI",
        exported_at: new Date().toISOString(),
        conversation,
        messages: this.state.messages
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json"
      });
      const fileName = `moodroute-conversation-${conversation.id}.json`;
      const href = URL.createObjectURL(blob);

      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(href);
      this.setNotice(`Exported ${fileName}`);
    }

    prefill(text) {
      if (!text) {
        return;
      }
      this.elements.input.value = text;
      this.focusInput();
    }

    consumePrefill() {
      const value = safeStorageGet(STORAGE_PREFILL);
      if (!value) {
        return "";
      }
      safeStorageRemove(STORAGE_PREFILL);
      return value;
    }

    scrollMessagesToBottom() {
      this.elements.messages.scrollTop = this.elements.messages.scrollHeight;
    }

    focusInput() {
      if (!this.elements.input.disabled) {
        try {
          this.elements.input.focus({ preventScroll: true });
        } catch (error) {
          this.elements.input.focus();
        }
      }
    }
  }

  window.createMoodRouteChat = function createMoodRouteChat(root, options = {}) {
    return new MoodRouteChat(root, options);
  };
})();

