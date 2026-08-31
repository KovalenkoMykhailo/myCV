(function () {
  const root = document.documentElement;
  const page = root.dataset.page;
  const base = root.dataset.base || "./";
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform || "");

  let chrome = { data: null, site: null, lang: "en" };
  let paintProjects = () => {};
  let paintQa = () => {};
  let toastTimer = 0;

  const el = (tag, props, children) => {
    const node = document.createElement(tag);
    if (props) {
      Object.entries(props).forEach(([key, value]) => {
        if (value === undefined || value === null) return;
        if (key === "class") node.className = value;
        else if (key === "text") node.textContent = value;
        else if (key.startsWith("on") && typeof value === "function") {
          node.addEventListener(key.slice(2).toLowerCase(), value);
        } else if (value === false && !key.startsWith("aria-")) return;
        else node.setAttribute(key, value === true && !key.startsWith("aria-") ? "" : String(value));
      });
    }
    (children || []).forEach((child) => {
      if (child) node.append(child);
    });
    return node;
  };

  const paragraphs = (texts) => (texts || []).map((text) => el("p", { text }));

  async function loadJson(path) {
    const res = await fetch(base + path);
    if (!res.ok) throw new Error("Cannot load " + path);
    return res.json();
  }

  function detectLang() {
    const stored = localStorage.getItem("site-lang");
    if (stored === "uk" || stored === "en") return stored;
    const nav = (navigator.language || "").toLowerCase();
    return nav.startsWith("uk") ? "uk" : "en";
  }

  function detectTheme() {
    const stored = localStorage.getItem("site-theme");
    if (stored === "dark" || stored === "light") return stored;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function applyTheme(theme) {
    root.dataset.theme = theme;
    root.style.backgroundColor = theme === "dark" ? "#101614" : "#eef3ef";
  }

  function setTheme(theme) {
    localStorage.setItem("site-theme", theme);
    applyTheme(theme);
    document.querySelectorAll("[data-theme-btn]").forEach((btn) => {
      btn.setAttribute("aria-pressed", String(btn.dataset.themeBtn === theme));
    });
  }

  function setLang(lang) {
    localStorage.setItem("site-lang", lang);
    location.reload();
  }

  function contentFile(lang) {
    if (page === "notes") return `content/notes-${lang}.json`;
    if (page === "qa") return `content/qa-${lang}.json`;
    return `content/${lang}.json`;
  }

  function href(path) {
    return base + path;
  }

  function homeHref(hash) {
    const rootPath = page === "home" ? "./" : base;
    if (!hash || hash === "top") return rootPath;
    return rootPath + "#" + hash;
  }

  function notesHref() {
    return page === "notes" ? "./" : base + "notes/";
  }

  function qaHref(hash) {
    const path = page === "qa" ? "./" : base + "qa/";
    return hash ? path + "#" + hash : path;
  }

  const CV_SECTIONS = ["top", "experience", "skills", "contact"];

  function hashId() {
    return decodeURIComponent((location.hash || "").replace("#", ""));
  }

  function slugify(text) {
    return String(text || "")
      .toLowerCase()
      .replace(/['’]/g, "")
      .replace(/[^a-z0-9а-яіїєґ]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 72);
  }

  function qaItemId(item) {
    if (!item._qid) item._qid = "q-" + (slugify(item.q) || "item");
    return item._qid;
  }

  function setCvNavCurrent(id) {
    document.querySelectorAll("[data-cv-section]").forEach((link) => {
      if (link.dataset.cvSection === id) {
        link.setAttribute("aria-current", id === "top" ? "page" : "location");
      } else {
        link.removeAttribute("aria-current");
      }
    });
  }

  function highlightSection(id) {
    document.querySelectorAll("main > section.is-target").forEach((node) => {
      node.classList.remove("is-target");
    });
    if (!id || id === "top") return;
    const node = document.getElementById(id);
    if (!node) return;
    void node.offsetWidth;
    node.classList.add("is-target");
  }

  function scrollToHash() {
    const id = hashId();
    if (!id) return;
    const node = document.getElementById(id);
    if (!node) return;
    node.scrollIntoView({ behavior: "instant", block: "start" });
    setCvNavCurrent(CV_SECTIONS.includes(id) ? id : "top");
    highlightSection(id);
  }

  function goToCvSection(id, event) {
    if (page !== "home") return;
    if (event) event.preventDefault();
    const node = document.getElementById(id);
    if (!node) return;
    closeMenu();
    node.scrollIntoView({ behavior: "smooth", block: "start" });
    const path = location.pathname.replace(/index\.html$/, "") || "./";
    const search = location.search || "";
    history.pushState(null, "", id === "top" ? path + search : path + search + "#" + id);
    setCvNavCurrent(id);
    highlightSection(id);
  }

  function watchCvSections() {
    if (page !== "home") return;
    const nodes = CV_SECTIONS.map((id) => document.getElementById(id)).filter(Boolean);
    if (!nodes.length || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) setCvNavCurrent(visible.target.id);
      },
      { rootMargin: "-28% 0px -58% 0px", threshold: [0.1, 0.25, 0.5] }
    );
    nodes.forEach((node) => observer.observe(node));
    window.addEventListener("hashchange", scrollToHash);
    window.addEventListener("popstate", () => {
      scrollToHash();
      paintProjects();
    });
  }

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function startTerminal(term, mount) {
    const body = mount.querySelector(".term-body");
    if (!body || !term) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const cursor = () => el("span", { class: "cursor", "aria-hidden": "true" });

    async function typeInto(node, text) {
      for (const char of text) {
        node.textContent += char;
        await sleep(22 + Math.random() * 28);
      }
    }

    async function run() {
      body.replaceChildren();
      for (const row of term.lines || []) {
        if (row.type === "cmd") {
          const cmd = el("span", { class: "term-cmd" });
          const caret = cursor();
          const line = el("div", { class: "term-line" }, [
            el("span", { class: "term-prompt", text: term.prompt + " " }),
            cmd,
            caret,
          ]);
          body.append(line);
          if (reduce) cmd.textContent = row.text;
          else await typeInto(cmd, row.text);
          caret.remove();
          await sleep(reduce ? 0 : 180);
        } else {
          body.append(el("div", { class: "term-line term-out", text: row.text }));
          await sleep(reduce ? 0 : 240);
        }
      }
      body.append(
        el("div", { class: "term-line" }, [
          el("span", { class: "term-prompt", text: term.prompt + " " }),
          cursor(),
        ])
      );
    }

    run();
  }

  function renderTerminal(term) {
    if (!term) return null;
    return el("aside", { class: "term", "aria-label": term.label }, [
      el("div", { class: "term-bar" }, [
        el("span", { class: "term-dot term-dot-r", "aria-hidden": "true" }),
        el("span", { class: "term-dot term-dot-y", "aria-hidden": "true" }),
        el("span", { class: "term-dot term-dot-g", "aria-hidden": "true" }),
        el("span", { class: "term-title", text: term.title }),
      ]),
      el("div", { class: "term-body" }),
    ]);
  }

  function hasContact(value) {
    return Boolean(value && String(value).trim());
  }

  function contactHref(type, value) {
    if (type === "email") return "mailto:" + value;
    if (type === "telegram") {
      if (value.startsWith("http")) return value;
      return "https://t.me/" + value.replace(/^@/, "");
    }
    return value;
  }

  function setMenuOpen(open) {
    document.body.classList.toggle("nav-open", open);
    const btn = document.querySelector("[data-menu-toggle]");
    if (btn) btn.setAttribute("aria-expanded", String(open));
  }

  function closeMenu() {
    setMenuOpen(false);
  }

  function toggleMenu() {
    setMenuOpen(!document.body.classList.contains("nav-open"));
  }

  function showToast(text) {
    let toast = document.getElementById("site-toast");
    if (!toast) {
      toast = el("div", {
        id: "site-toast",
        class: "toast",
        role: "status",
        "data-testid": "toast",
      });
      document.body.append(toast);
    }
    toast.textContent = text;
    toast.classList.remove("is-on");
    void toast.offsetWidth;
    toast.classList.add("is-on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("is-on"), 2200);
  }

  function markCopied(button, okLabel) {
    if (!button) return;
    if (!button.dataset.copyLabel) button.dataset.copyLabel = button.textContent;
    button.textContent = okLabel;
    button.classList.add("is-copied");
    clearTimeout(Number(button.dataset.copyTimer));
    const timer = setTimeout(() => {
      button.textContent = button.dataset.copyLabel;
      button.classList.remove("is-copied");
    }, 2200);
    button.dataset.copyTimer = String(timer);
  }

  async function copyText(text, okLabel, button) {
    const done = okLabel || "Copied";
    markCopied(button, done);
    showToast(done);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const box = el("textarea");
      box.value = text;
      box.setAttribute("readonly", "");
      box.style.position = "fixed";
      box.style.left = "-9999px";
      document.body.append(box);
      box.select();
      document.execCommand("copy");
      box.remove();
    }
  }

  function repoFromUrl(url) {
    const match = String(url || "").match(/github\.com\/([^/]+)\/([^/#?]+)/i);
    if (!match) return null;
    return match[1] + "/" + match[2].replace(/\.git$/, "");
  }

  async function githubMeta(url) {
    const repo = repoFromUrl(url);
    if (!repo) return null;
    const key = "gh:" + repo;
    try {
      const cached = sessionStorage.getItem(key);
      if (cached) return JSON.parse(cached);
    } catch {
      /* ignore quota / private mode */
    }
    try {
      const res = await fetch("https://api.github.com/repos/" + repo);
      if (!res.ok) return null;
      const data = await res.json();
      const meta = {
        stars: data.stargazers_count,
        language: data.language,
        updated: data.pushed_at ? String(data.pushed_at).slice(0, 10) : "",
      };
      try {
        sessionStorage.setItem(key, JSON.stringify(meta));
      } catch {
        /* ignore */
      }
      return meta;
    } catch {
      return null;
    }
  }

  async function hydrateGithub(scope, labels) {
    const nodes = (scope || document).querySelectorAll("[data-repo]");
    await Promise.all(
      [...nodes].map(async (node) => {
        const meta = await githubMeta(node.dataset.repo);
        if (!meta) {
          node.remove();
          return;
        }
        const bits = [
          meta.language,
          meta.stars ? "★ " + meta.stars : "",
          meta.updated ? (labels.updated || "Updated") + " " + meta.updated : "",
        ].filter(Boolean);
        node.textContent = bits.join(" · ");
      })
    );
  }

  function kindFromUrl() {
    const kind = new URLSearchParams(location.search).get("kind");
    if (["task", "pet", "practice", "notes"].includes(kind)) return kind;
    return "all";
  }

  function setKind(kind) {
    const url = new URL(location.href);
    if (!kind || kind === "all") url.searchParams.delete("kind");
    else url.searchParams.set("kind", kind);
    const hash = url.hash && url.hash !== "#top" ? url.hash : "#projects";
    history.pushState(null, "", url.pathname + url.search + hash);
    paintProjects();
    const projects = document.getElementById("projects");
    if (projects) projects.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function ensureOverlay() {
    if (document.querySelector(".nav-overlay")) return;
    document.body.append(
      el("div", {
        class: "nav-overlay",
        "aria-hidden": "true",
        onPointerDown: (event) => {
          event.preventDefault();
          closeMenu();
        },
      })
    );
  }

  function paletteItems() {
    const { data, site, lang } = chrome;
    if (!data) return [];
    const nav = data.nav;
    const items = [
      { id: "home", label: nav.home, hint: "Page", href: homeHref(), section: page === "home" ? "top" : null },
      { id: "exp", label: nav.experience, hint: "CV", href: homeHref("experience"), section: "experience" },
      { id: "skills", label: nav.skills, hint: "CV", href: homeHref("skills"), section: "skills" },
      { id: "contact", label: nav.contacts, hint: "CV", href: homeHref("contact"), section: "contact" },
      { id: "notes", label: nav.notes, hint: nav.pages || "Pages", href: notesHref() },
      { id: "qa", label: nav.qa, hint: nav.pages || "Pages", href: qaHref() },
      {
        id: "theme-light",
        label: lang === "uk" ? "Світла тема" : "Light theme",
        hint: nav.command,
        run: () => setTheme("light"),
      },
      {
        id: "theme-dark",
        label: lang === "uk" ? "Темна тема" : "Dark theme",
        hint: nav.command,
        run: () => setTheme("dark"),
      },
    ];
    if (hasContact(site && site.pdf)) {
      items.push({
        id: "pdf",
        label: nav.download,
        hint: "PDF",
        href: href(site.pdf),
      });
    }
    (data.projects && data.projects.items ? data.projects.items : []).forEach((item) => {
      items.push({
        id: "p-" + slugify(item.name),
        label: item.name,
        hint: item.kind,
        href: item.url,
        external: true,
      });
    });
    (data.groups || []).forEach((group) => {
      (group.items || []).forEach((item) => {
        items.push({
          id: qaItemId(item),
          label: item.q,
          hint: group.title,
          href: qaHref(qaItemId(item)),
          qaId: qaItemId(item),
        });
      });
    });
    return items;
  }

  function runPaletteItem(item) {
    closePalette();
    if (!item) return;
    if (item.run) {
      item.run();
      return;
    }
    if (item.qaId && page === "qa") {
      location.hash = item.qaId;
      paintQa();
      return;
    }
    if (item.section && page === "home") {
      goToCvSection(item.section);
      return;
    }
    if (item.external && item.href) {
      window.open(item.href, "_blank", "noreferrer");
      return;
    }
    if (item.href) location.assign(item.href);
  }

  function closePalette() {
    const pal = document.getElementById("command-palette");
    if (!pal) return;
    pal.hidden = true;
    document.body.classList.remove("palette-open");
  }

  function openPalette() {
    closeMenu();
    const pal = document.getElementById("command-palette");
    if (!pal) return;
    pal.hidden = false;
    document.body.classList.add("palette-open");
    const input = pal.querySelector("input");
    input.value = "";
    renderPaletteList("");
    input.focus();
  }

  function renderPaletteList(query) {
    const pal = document.getElementById("command-palette");
    if (!pal) return;
    const list = pal.querySelector("[data-palette-list]");
    const empty = pal.querySelector("[data-palette-empty]");
    const q = (query || "").trim().toLowerCase();
    const items = paletteItems().filter((item) => {
      if (!q) return true;
      return (item.label + " " + (item.hint || "")).toLowerCase().includes(q);
    });
    list.replaceChildren();
    pal.dataset.active = "0";
    if (!items.length) {
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    items.forEach((item, index) => {
      list.append(
        el("button", {
          type: "button",
          class: "palette-item" + (index === 0 ? " is-active" : ""),
          role: "option",
          id: "palette-opt-" + index,
          "aria-selected": index === 0,
          "data-index": String(index),
          onMouseEnter: () => setPaletteActive(index),
          onClick: () => runPaletteItem(item),
        }, [
          el("span", { class: "palette-item-label", text: item.label }),
          item.hint ? el("span", { class: "palette-item-hint", text: item.hint }) : null,
        ])
      );
    });
    list._items = items;
  }

  function setPaletteActive(index) {
    const pal = document.getElementById("command-palette");
    if (!pal) return;
    const list = pal.querySelector("[data-palette-list]");
    const buttons = [...list.querySelectorAll(".palette-item")];
    if (!buttons.length) return;
    const next = (index + buttons.length) % buttons.length;
    pal.dataset.active = String(next);
    buttons.forEach((btn, i) => {
      btn.classList.toggle("is-active", i === next);
      btn.setAttribute("aria-selected", String(i === next));
    });
    buttons[next].scrollIntoView({ block: "nearest" });
  }

  function bindPaletteKeys(input) {
    input.addEventListener("keydown", (event) => {
      const pal = document.getElementById("command-palette");
      const list = pal.querySelector("[data-palette-list]");
      const items = list._items || [];
      const active = Number(pal.dataset.active || 0);
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setPaletteActive(active + 1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setPaletteActive(active - 1);
      } else if (event.key === "Enter") {
        event.preventDefault();
        runPaletteItem(items[active]);
      } else if (event.key === "Escape") {
        event.preventDefault();
        closePalette();
      }
    });
  }

  function ensurePalette(nav) {
    if (document.getElementById("command-palette")) return;
    const input = el("input", {
      class: "palette-input",
      type: "search",
      "data-testid": "command-input",
      placeholder: nav.commandHint,
      "aria-label": nav.command,
      autocomplete: "off",
      onInput: (event) => renderPaletteList(event.target.value),
    });
    bindPaletteKeys(input);
    const panel = el("div", { class: "palette-panel", role: "listbox" }, [
      el("div", { class: "palette-bar" }, [
        el("span", { class: "palette-prompt", text: "MK:~$" }),
        input,
      ]),
      el("div", { class: "palette-list", "data-palette-list": "true" }),
      el("p", {
        class: "palette-empty",
        "data-palette-empty": "true",
        hidden: true,
        text: nav.commandEmpty,
      }),
    ]);
    const pal = el("div", {
      id: "command-palette",
      class: "palette",
      hidden: true,
      role: "dialog",
      "aria-modal": "true",
      "aria-label": nav.command,
      "data-testid": "command-palette",
      onClick: (event) => {
        if (event.target === pal) closePalette();
      },
    }, [panel]);
    document.body.append(pal);
  }

  function bindGlobalKeys() {
    window.addEventListener("keydown", (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        const pal = document.getElementById("command-palette");
        if (pal && !pal.hidden) closePalette();
        else openPalette();
      } else if (event.key === "Escape") {
        closePalette();
        closeMenu();
      }
    });
  }

  function renderHeader(nav, site, lang) {
    const pdfReady = hasContact(site.pdf);
    const theme = detectTheme();
    const themeLabel = lang === "uk" ? "Тема" : "Theme";
    const shortcut = isMac ? "⌘K" : "Ctrl+K";
    const actions = el("div", { class: "header-actions" }, [
      el("button", {
        class: "cmd-btn",
        type: "button",
        "data-testid": "command-open",
        "aria-label": nav.command + " " + shortcut,
        onClick: openPalette,
      }, [
        el("span", { class: "cmd-btn-text", text: nav.command }),
        el("kbd", { text: shortcut }),
      ]),
      pdfReady
        ? el("a", {
            class: "btn btn-ghost",
            href: href(site.pdf),
            download: "",
            text: nav.download,
          })
        : page === "home"
          ? el("button", {
              class: "btn btn-ghost",
              type: "button",
              text: nav.print,
              onClick: () => window.print(),
            })
          : null,
      el("div", { class: "lang", role: "group", "aria-label": themeLabel }, [
        el("button", {
          type: "button",
          text: lang === "uk" ? "Світла" : "Light",
          "data-theme-btn": "light",
          "aria-pressed": theme === "light",
          onClick: () => setTheme("light"),
        }),
        el("button", {
          type: "button",
          text: lang === "uk" ? "Темна" : "Dark",
          "data-theme-btn": "dark",
          "aria-pressed": theme === "dark",
          onClick: () => setTheme("dark"),
        }),
      ]),
      el("div", { class: "lang", role: "group", "aria-label": "Language" }, [
        el("button", {
          type: "button",
          text: "UA",
          "aria-pressed": lang === "uk",
          onClick: () => setLang("uk"),
        }),
        el("button", {
          type: "button",
          text: "EN",
          "aria-pressed": lang === "en",
          onClick: () => setLang("en"),
        }),
      ]),
      el("button", {
        class: "menu-toggle",
        type: "button",
        "data-menu-toggle": "true",
        "data-testid": "menu-toggle",
        "aria-expanded": "false",
        "aria-controls": "site-nav",
        "aria-label": nav.menu,
        onClick: toggleMenu,
      }, [
        el("span", { class: "menu-toggle-bar", "aria-hidden": "true" }),
        el("span", { class: "menu-toggle-bar", "aria-hidden": "true" }),
        el("span", { class: "menu-toggle-bar", "aria-hidden": "true" }),
      ]),
    ]);

    const header = document.getElementById("site-header");
    header.replaceChildren(
      el("div", { class: "header-inner" }, [
        el("a", { class: "brand", href: homeHref(), text: "MK" }),
        el("nav", { class: "nav", id: "site-nav", "data-testid": "site-nav", "aria-label": "Main" }, [
          el("div", { class: "nav-group", "aria-label": nav.onPage || "On this page" }, [
            el("a", {
              href: homeHref(),
              text: nav.home,
              "data-cv-section": "top",
              "aria-current": page === "home" && !hashId() ? "page" : null,
              onClick: (event) => goToCvSection("top", event),
            }),
            el("a", {
              href: homeHref("experience"),
              text: nav.experience,
              "data-cv-section": "experience",
              onClick: (event) => goToCvSection("experience", event),
            }),
            el("a", {
              href: homeHref("skills"),
              text: nav.skills,
              "data-cv-section": "skills",
              onClick: (event) => goToCvSection("skills", event),
            }),
            el("a", {
              href: homeHref("contact"),
              text: nav.contacts,
              "data-cv-section": "contact",
              onClick: (event) => goToCvSection("contact", event),
            }),
          ]),
          el("span", { class: "nav-split", "aria-hidden": "true" }),
          el("div", { class: "nav-group nav-pages", "aria-label": nav.pages || "Pages" }, [
            el("span", { class: "nav-pages-label", text: nav.pages || "Pages" }),
            el("a", {
              href: notesHref(),
              text: nav.notes,
              "aria-current": page === "notes" ? "page" : null,
              onClick: closeMenu,
            }),
            el("a", {
              href: qaHref(),
              text: nav.qa,
              "aria-current": page === "qa" ? "page" : null,
              onClick: closeMenu,
            }),
          ]),
        ]),
        actions,
      ])
    );
    ensureOverlay();
    ensurePalette(nav);
  }

  function renderContactForm(c, site) {
    if (!hasContact(site.email)) return null;
    const nameErr = el("p", { class: "field-error", id: "err-name", hidden: true });
    const emailErr = el("p", { class: "field-error", id: "err-email", hidden: true });
    const msgErr = el("p", { class: "field-error", id: "err-message", hidden: true });
    const sendErr = el("p", { class: "field-error", id: "err-send", hidden: true, "data-testid": "form-error" });
    const success = el("p", {
      class: "form-success",
      role: "status",
      "data-testid": "form-success",
      hidden: true,
    });
    const sendBtn = el("button", { class: "btn btn-primary", type: "submit", text: c.send });
    const emailOk = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    const endpoint =
      site.formEndpoint || "https://formsubmit.co/ajax/" + encodeURIComponent(site.email);

    const form = el("form", {
      class: "contact-form",
      "data-testid": "contact-form",
      novalidate: true,
      onSubmit: async (event) => {
        event.preventDefault();
        const name = form.elements.name.value.trim();
        const email = form.elements.email.value.trim();
        const message = form.elements.message.value.trim();
        const honey = (form.elements.company && form.elements.company.value) || "";
        let ok = true;
        nameErr.hidden = name.length >= 2;
        if (!nameErr.hidden) {
          nameErr.textContent = c.errorName;
          ok = false;
        }
        emailErr.hidden = emailOk(email);
        if (!emailErr.hidden) {
          emailErr.textContent = c.errorEmail;
          ok = false;
        }
        msgErr.hidden = message.length >= 10;
        if (!msgErr.hidden) {
          msgErr.textContent = c.errorMessage;
          ok = false;
        }
        success.hidden = true;
        sendErr.hidden = true;
        if (!ok) return;
        if (honey) {
          success.textContent = c.success;
          success.hidden = false;
          form.reset();
          return;
        }
        sendBtn.disabled = true;
        sendBtn.textContent = c.sending || "Sending…";
        try {
          const res = await fetch(endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({
              name,
              email,
              message,
              _subject: "CV site · " + name,
              _captcha: "false",
              _template: "table",
            }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok || data.success === false || data.success === "false") {
            throw new Error(data.message || "send failed");
          }
          success.textContent = c.success;
          success.hidden = false;
          form.reset();
        } catch {
          sendErr.textContent = c.errorSend;
          sendErr.hidden = false;
        } finally {
          sendBtn.disabled = false;
          sendBtn.textContent = c.send;
        }
      },
    }, [
      el("h3", { text: c.formTitle }),
      el("p", { class: "form-lead", text: c.formLead }),
      el("label", { class: "field" }, [
        el("span", { text: c.name }),
        el("input", {
          name: "name",
          type: "text",
          autocomplete: "name",
          required: true,
          "aria-describedby": "err-name",
        }),
        nameErr,
      ]),
      el("label", { class: "field" }, [
        el("span", { text: c.emailField }),
        el("input", {
          name: "email",
          type: "email",
          autocomplete: "email",
          required: true,
          "aria-describedby": "err-email",
        }),
        emailErr,
      ]),
      el("label", { class: "hp", "aria-hidden": "true" }, [
        el("span", { text: "Company" }),
        el("input", {
          name: "company",
          type: "text",
          tabindex: "-1",
          autocomplete: "off",
        }),
      ]),
      el("label", { class: "field" }, [
        el("span", { text: c.message }),
        el("textarea", {
          name: "message",
          rows: "5",
          required: true,
          "aria-describedby": "err-message",
        }),
        msgErr,
      ]),
      sendBtn,
      sendErr,
      success,
    ]);
    return form;
  }

  function renderHome(data, site) {
    const c = data.contact;
    const p = data.projects;
    const links = [
      ["email", c.email, site.email],
      ["linkedin", c.linkedin, site.linkedin],
      ["telegram", c.telegram, site.telegram],
      ["github", c.github, site.github],
    ].filter(([, , value]) => hasContact(value));

    const term = renderTerminal(data.terminal);
    const list = el("div", { class: "project-list", "data-testid": "project-list" });
    const filters = p.filters || {};
    const filterKeys = ["all", "task", "pet", "practice", "notes"];

    paintProjects = () => {
      const kind = kindFromUrl();
      document.querySelectorAll("[data-kind-filter]").forEach((btn) => {
        btn.setAttribute("aria-pressed", String(btn.dataset.kindFilter === kind));
      });
      const items = (p.items || []).filter((item) => kind === "all" || item.filter === kind);
      list.replaceChildren();
      if (!items.length) {
        list.append(el("p", { class: "lede", text: p.emptyFilter }));
        return;
      }
      items.forEach((item) => {
        list.append(
          el("article", { class: "project", "data-kind": item.filter || "" }, [
            el("h3", {}, [
              item.url
                ? el("a", {
                    class: "project-link",
                    href: item.url,
                    target: "_blank",
                    rel: "noreferrer",
                    text: item.name,
                  })
                : el("span", { text: item.name }),
            ]),
            el("p", { class: "kind", text: item.kind }),
            item.url
              ? el("p", { class: "project-meta", "data-repo": item.url })
              : null,
            el("p", { text: item.text }),
          ])
        );
      });
      hydrateGithub(list, p);
    };

    const main = document.getElementById("main");
    main.replaceChildren(
      el("section", { class: "hero", id: "top" }, [
        el("div", { class: "hero-copy" }, [
          el("h1", { text: data.hero.name }),
          el("p", { class: "role", text: data.hero.role }),
          el("p", { class: "location", text: data.hero.location }),
          el("p", { class: "pitch", text: data.hero.pitch }),
          el("div", { class: "hero-actions" }, [
            hasContact(site.pdf)
              ? el("a", {
                  class: "btn btn-primary",
                  href: href(site.pdf),
                  download: "",
                  text: data.nav.download,
                })
              : hasContact(site.email)
                ? el("a", {
                    class: "btn btn-primary",
                    href: "mailto:" + site.email,
                    text: c.email,
                  })
                : null,
            el("a", {
              class: "btn btn-ghost",
              href: notesHref(),
              text: data.now.notesLink,
            }),
            el("a", {
              class: "btn btn-ghost",
              href: qaHref(),
              text: data.now.qaLink,
            }),
          ]),
        ]),
        term,
      ]),
      el("section", { id: "about" }, [
        el("h2", { text: data.about.title }),
        ...paragraphs(data.about.paragraphs),
      ]),
      el("section", { id: "now" }, [
        el("h2", { text: data.now.title }),
        el("div", { class: "now-card" }, [
          el("p", { text: data.now.body }),
          el("div", { class: "now-links" }, [
            el("a", {
              class: "btn btn-primary",
              href: notesHref(),
              text: data.now.notesLink,
            }),
            el("a", {
              class: "btn btn-ghost",
              href: qaHref(),
              text: data.now.qaLink,
            }),
          ]),
        ]),
      ]),
      el("section", { id: "experience" }, [
        el("h2", { text: data.experience.title }),
        ...data.experience.jobs.map((job) =>
          el("article", { class: "job" }, [
            el("div", { class: "job-head" }, [
              el("h3", { text: job.company + " · " + job.role }),
              job.period ? el("span", { class: "period", text: job.period }) : null,
            ]),
            job.place ? el("p", { class: "place", text: job.place }) : null,
            el(
              "ul",
              {},
              job.points.map((point) => el("li", { text: point }))
            ),
            job.stack ? el("p", { class: "stack", text: job.stack }) : null,
          ])
        ),
      ]),
      el("section", { id: "skills" }, [
        el("h2", { text: data.skills.title }),
        ...data.skills.groups.map((group) =>
          el("div", { class: "skill-group" }, [
            el("h3", { text: group.name }),
            el(
              "ul",
              { class: "chips" },
              group.items.map((item) => el("li", { text: item }))
            ),
          ])
        ),
      ]),
      el("section", { id: "education" }, [
        el("h2", { text: data.education.title }),
        el(
          "ul",
          { class: "plain-list" },
          data.education.items.map((item) => el("li", { text: item }))
        ),
      ]),
      el("section", { id: "hobbies" }, [
        el("h2", { text: data.hobbies.title }),
        el(
          "ul",
          { class: "plain-list" },
          data.hobbies.items.map((item) => el("li", { text: item }))
        ),
      ]),
      el("section", { id: "projects" }, [
        el("h2", { text: p.title }),
        el("p", { class: "lede", text: p.intro }),
        el(
          "div",
          {
            class: "kind-filters",
            role: "group",
            "aria-label": p.title,
            "data-testid": "project-filters",
          },
          filterKeys.map((key) =>
            el("button", {
              type: "button",
              class: "kind-filter",
              "data-kind-filter": key,
              "aria-pressed": kindFromUrl() === key,
              text: filters[key] || key,
              onClick: () => setKind(key),
            })
          )
        ),
        list,
      ]),
      el("section", { id: "contact" }, [
        el("h2", { text: c.title }),
        links.length
          ? el(
              "div",
              { class: "contacts" },
              links.map(([type, label, value]) => {
                if (type === "email") {
                  return el("div", { class: "contact-row" }, [
                    el("a", {
                      href: contactHref(type, value),
                      text: value,
                    }),
                    el("button", {
                      class: "copy-btn",
                      type: "button",
                      "data-testid": "copy-email",
                      text: c.copy,
                      onClick: (event) => copyText(value, c.copied, event.currentTarget),
                    }),
                  ]);
                }
                return el("a", {
                  href: contactHref(type, value),
                  text: label,
                  rel: "noreferrer",
                  target: "_blank",
                });
              })
            )
          : el("p", { class: "empty-contacts", text: c.empty }),
        renderContactForm(c, site),
      ])
    );
    paintProjects();
    if (term) startTerminal(data.terminal, term);
  }

  function renderNotes(data) {
    const main = document.getElementById("main");
    const featured = data.featured;
    const featuredBlock = featured
      ? el("article", { class: "note featured-note" }, [
          el("h2", { text: featured.title }),
          el("p", { text: featured.lead }),
          el(
            "ul",
            { class: "topic-list" },
            (featured.topics || []).map((topic) =>
              el("li", {}, [
                el("a", {
                  href: topic.url,
                  target: "_blank",
                  rel: "noreferrer",
                  text: topic.name,
                }),
                el("span", { text: topic.text }),
              ])
            )
          ),
          el("p", { class: "featured-cta" }, [
            el("a", {
              class: "btn btn-primary",
              href: featured.url,
              target: "_blank",
              rel: "noreferrer",
              text: featured.cta,
            }),
          ]),
        ])
      : null;
    main.replaceChildren(
      ...[
        el("header", { class: "hero" }, [
          el("h1", { text: data.title }),
          el("p", { class: "pitch", text: data.intro }),
          el("div", { class: "hero-actions" }, [
            el("a", {
              class: "btn btn-primary",
              href: qaHref(),
              text: data.qaCta,
            }),
          ]),
        ]),
        featuredBlock,
        ...data.sections.map((section) =>
          el("article", { class: "note" }, [
            el("h2", { text: section.title }),
            ...paragraphs(section.paragraphs),
          ])
        ),
      ].filter(Boolean)
    );
  }

  function renderQa(data) {
    const main = document.getElementById("main");
    const list = el("div", { id: "qa-list" });
    const search = el("input", {
      class: "filter",
      type: "search",
      placeholder: data.searchPlaceholder,
      "aria-label": data.searchPlaceholder,
      "data-testid": "qa-search",
    });
    let tag = "";
    (data.groups || []).forEach((group) => {
      (group.items || []).forEach((item) => qaItemId(item));
    });

    const openFromHash = () => {
      const id = hashId();
      if (!id) return;
      const group = data.groups.find((g) => g.id === id);
      if (group) {
        tag = group.id;
        return;
      }
      const hit = data.groups.some((g) => g.items.some((item) => qaItemId(item) === id));
      if (hit) {
        tag = "";
        search.value = "";
      }
    };

    paintQa = () => {
      openFromHash();
      const q = (search.value || "").trim().toLowerCase();
      document.querySelectorAll("[data-qa-tag]").forEach((btn) => {
        btn.setAttribute("aria-pressed", String(btn.dataset.qaTag === tag));
      });
      list.replaceChildren();
      let shown = 0;
      data.groups.forEach((group) => {
        if (tag && group.id !== tag) return;
        const items = group.items.filter((item) => {
          if (!q) return true;
          return (item.q + " " + item.a).toLowerCase().includes(q);
        });
        if (!items.length) return;
        shown += items.length;
        list.append(
          el("section", { class: "qa-group", id: group.id }, [
            el("h2", { text: group.title }),
            ...items.map((item) => {
              const id = qaItemId(item);
              const details = el("details", { id }, [
                el("summary", { text: item.q }),
                el("div", { class: "qa-answer" }, [
                  el("p", { text: item.a }),
                  el("button", {
                    class: "copy-btn",
                    type: "button",
                    text: data.copyLink,
                    onClick: (event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      const url = new URL(location.href);
                      url.hash = id;
                      copyText(url.toString(), data.copied, event.currentTarget);
                    },
                  }),
                ]),
              ]);
              details.addEventListener("toggle", () => {
                if (details.open) {
                  history.replaceState(null, "", "#" + id);
                }
              });
              return details;
            }),
          ])
        );
      });
      if (!shown) {
        list.append(el("p", { class: "lede", text: data.emptyFilter }));
      }
      const id = hashId();
      if (id && id.startsWith("q-")) {
        const node = document.getElementById(id);
        if (node && node.tagName === "DETAILS") {
          node.open = true;
          node.scrollIntoView({ behavior: "instant", block: "start" });
        }
      } else if (id) {
        const node = document.getElementById(id);
        if (node) node.scrollIntoView({ behavior: "instant", block: "start" });
      }
    };

    search.addEventListener("input", () => {
      if (location.hash) history.replaceState(null, "", location.pathname + location.search);
      paintQa();
    });

    main.replaceChildren(
      el("header", { class: "hero" }, [
        el("p", { class: "badge", text: data.badge }),
        el("h1", { text: data.title }),
        el("p", { class: "pitch", text: data.intro }),
        el("div", { class: "hero-actions" }, [
          el("a", {
            class: "btn btn-ghost",
            href: notesHref(),
            text: data.notesCta,
          }),
        ]),
      ]),
      el(
        "div",
        { class: "qa-tags", role: "group", "aria-label": data.title, "data-testid": "qa-tags" },
        [
          el("button", {
            type: "button",
            class: "kind-filter",
            "data-qa-tag": "",
            "aria-pressed": !tag,
            text: data.allTags,
            onClick: () => {
              tag = "";
              history.replaceState(null, "", location.pathname + location.search);
              paintQa();
            },
          }),
          ...data.groups.map((group) =>
            el("button", {
              type: "button",
              class: "kind-filter",
              "data-qa-tag": group.id,
              text: group.title,
              onClick: () => {
                tag = tag === group.id ? "" : group.id;
                history.replaceState(null, "", tag ? "#" + tag : location.pathname + location.search);
                paintQa();
              },
            })
          ),
        ]
      ),
      search,
      list
    );
    window.addEventListener("hashchange", paintQa);
    paintQa();
  }

  function renderFooter(text) {
    document.getElementById("site-footer").textContent = text;
  }

  async function init() {
    const lang = detectLang();
    root.lang = lang === "uk" ? "uk" : "en";
    applyTheme(detectTheme());

    try {
      const [site, data] = await Promise.all([
        loadJson("content/site.json"),
        loadJson(contentFile(lang)),
      ]);
      chrome = { data, site, lang };

      document.title = data.metaTitle;
      const desc = document.querySelector('meta[name="description"]');
      if (desc) desc.setAttribute("content", data.metaDescription);

      renderHeader(data.nav, site, lang);
      bindGlobalKeys();
      if (page === "notes") renderNotes(data);
      else if (page === "qa") renderQa(data);
      else {
        renderHome(data, site);
        scrollToHash();
        watchCvSections();
      }
      renderFooter(data.footer);
    } catch (error) {
      document.getElementById("main").replaceChildren(
        el("div", { class: "error" }, [
          el("h1", { text: "Could not load content" }),
          el("p", {
            text: "Open this site through a local server or GitHub Pages. Opening the HTML file directly blocks JSON.",
          }),
          el("pre", { text: String(error.message || error) }),
        ])
      );
    }
  }

  init();
})();
