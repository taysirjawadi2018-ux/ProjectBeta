/*
 * Watiq — progressive enhancement.
 *
 * Every page works with JavaScript disabled: navigation is real links, and
 * every mutation is a real form POST handled server-side. This file only makes
 * things nicer, and is served from 'self' so it satisfies script-src.
 *
 * Behaviour binds through data-* attributes rather than inline handlers,
 * because script-src 'self' carries no 'unsafe-inline' and an onclick=""
 * would simply be dropped by the browser.
 *
 * Every value below is dispatched here. If you add a data-action to a
 * component, add a case for it too — a button whose action falls through is a
 * dead control, which is exactly what tests/test_no_dead_controls.py exists to
 * prevent it silently becoming.
 *
 *   toggle / menu      data-target="<id>"        show/hide a panel
 *   dismiss                                      close nearest [data-dismissable]
 *   filter             data-filter-group="..."   client-side list filtering
 *   reveal-pin         data-target="<id>"        unmask a sensitive value
 *   edit-field         data-target="<id>"        make a read-only field editable
 *   search-focus                                 focus the form's search input
 *   print                                        window.print()
 *   reload                                       reload the page
 *   a11y-interpreter   data-target="<id>"        open the sign-language panel
 *   a11y-narration                               read the page aloud
 *   a11y-close / -expand / -play / -pause / -mute / -unmute
 *                                                interpreter panel controls
 *   submit-form        on a <select>             re-submit the enclosing form
 *   data-hover-show / data-hover-hide="<id>"     hover-revealed tooltip
 *   data-confirm="message" on a <form>           confirm before submitting
 *   data-a11y-controls on a <form>               theme / text-size preferences
 *
 * submit-form is the one action driven by "change" rather than "click", since
 * clicking a <select> only opens it. It is an enhancement in the strict sense:
 * every form carrying it also has a real submit button for keyboard and
 * no-JavaScript use.
 */
(function () {
  "use strict";

  function byId(element, attribute) {
    var id = element.getAttribute(attribute);
    return id ? document.getElementById(id) : null;
  }

  /* The interpreter widget the mockups drew as a floating video card. There is
   * no interpreter stream to attach yet, so the controls drive whatever media
   * element the panel contains and otherwise just carry their own state — the
   * icon and aria-pressed always reflect reality. */
  function panelOf(trigger) {
    return (
      byId(trigger, "data-target") ||
      trigger.closest("[data-a11y-panel], .tsl-video-container, .tsl-module, .fixed.z-50, .fixed.z-\\[100\\], .fixed.bottom-margin-mobile, .fixed.bottom-4, #tsl-module")
    );
  }

  function media(panel) {
    return panel ? panel.querySelector("video, audio") : null;
  }

  function swapIcon(trigger, name) {
    var icon = trigger.matches(".material-symbols-outlined")
      ? trigger
      : trigger.querySelector(".material-symbols-outlined");
    if (icon) icon.textContent = name;
  }

  var ACTIONS = {
    toggle: function (trigger) {
      var target = byId(trigger, "data-target");
      if (!target) return;
      var nowHidden = target.classList.toggle("hidden");
      trigger.setAttribute("aria-expanded", String(!nowHidden));
      if (!nowHidden) {
        var focusable = target.querySelector(
          "input:not([type=hidden]), select, textarea, button"
        );
        if (focusable) focusable.focus();
      }
    },

    dismiss: function (trigger) {
      var panel = trigger.closest("[data-dismissable]");
      if (panel) panel.remove();
    },

    filter: function (trigger) {
      var group = trigger.getAttribute("data-filter-group");
      var value = trigger.getAttribute("data-filter-value") || "all";
      document
        .querySelectorAll(
          "[data-filter-group='" + group + "'][data-action='filter']"
        )
        .forEach(function (button) {
          button.setAttribute("aria-pressed", String(button === trigger));
        });
      document
        .querySelectorAll("[data-filter-item='" + group + "']")
        .forEach(function (item) {
          var tags = (item.getAttribute("data-filter-tags") || "").split(/\s+/);
          item.classList.toggle(
            "hidden",
            value !== "all" && tags.indexOf(value) === -1
          );
        });
    },

    /* Unmask a value the server rendered masked. The real value is only ever
     * in data-value when the server decided this viewer may see it. */
    "reveal-pin": function (trigger) {
      var target = byId(trigger, "data-target");
      if (!target) return;
      var masked = target.getAttribute("data-masked");
      var value = target.getAttribute("data-value");
      if (masked === null || value === null) return;
      var revealed = target.textContent.trim() === value;
      target.textContent = revealed ? masked : value;
      trigger.setAttribute("aria-pressed", String(!revealed));
      swapIcon(trigger, revealed ? "visibility" : "visibility_off");
    },

    "edit-field": function (trigger) {
      var target = byId(trigger, "data-target");
      if (!target) return;
      target.readOnly = false;
      target.removeAttribute("disabled");
      target.focus();
      if (target.select) target.select();
    },

    "search-focus": function (trigger) {
      var form = trigger.closest("form");
      var input = form && form.querySelector("input[type=search], input[name=q]");
      if (!input) return;
      if (input.value.trim()) form.submit();
      else input.focus();
    },

    print: function () {
      window.print();
    },

    reload: function () {
      window.location.reload();
    },

    "a11y-interpreter": function (trigger) {
      var panel = panelOf(trigger);
      if (!panel) return;
      var nowHidden = panel.classList.toggle("hidden");
      trigger.setAttribute("aria-expanded", String(!nowHidden));
    },

    /* Read the page aloud. The mockups drew this control on five screens and
     * it was decorative everywhere; SpeechSynthesis is built into the browser,
     * so it can simply be honoured. <main> is read rather than <body> so the
     * navigation chrome is not recited before the content every time. */
    "a11y-narration": function (trigger) {
      var speech = window.speechSynthesis;
      if (!speech) {
        trigger.disabled = true;
        trigger.title = "Narration is not supported by this browser";
        return;
      }
      if (speech.speaking || speech.pending) {
        speech.cancel();
        trigger.setAttribute("aria-pressed", "false");
        return;
      }
      var source = document.querySelector("main") || document.body;
      var text = (source.innerText || source.textContent || "").trim();
      if (!text) return;
      var utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = document.documentElement.lang || "en";
      utterance.onend = function () {
        trigger.setAttribute("aria-pressed", "false");
      };
      trigger.setAttribute("aria-pressed", "true");
      speech.speak(utterance);
    },

    "a11y-close": function (trigger) {
      var panel = panelOf(trigger);
      if (panel) {
        panel.classList.add("hidden");
        panel.style.display = "none";
      }
    },

    "toggle-password": function (trigger) {
      var target = byId(trigger, "data-target");
      if (!target) {
        var group = trigger.closest(".relative, .space-y-2, .space-y-4");
        target = group ? group.querySelector("input[type=password], input[type=text]") : null;
      }
      if (!target) return;
      var isPassword = target.type === "password";
      target.type = isPassword ? "text" : "password";
      trigger.setAttribute("aria-pressed", String(isPassword));
      swapIcon(trigger, isPassword ? "visibility_off" : "visibility");
    },

    "a11y-expand": function (trigger) {
      var panel = panelOf(trigger);
      if (!panel) return;
      var expanded = panel.classList.toggle("is-expanded");
      trigger.setAttribute("aria-pressed", String(expanded));
      swapIcon(trigger, expanded ? "close_fullscreen" : "open_in_full");
    },

    "a11y-play": function (trigger) {
      var element = media(panelOf(trigger));
      if (element) element.play();
      trigger.setAttribute("aria-pressed", "true");
      swapIcon(trigger, "pause");
      trigger.setAttribute("data-action", "a11y-pause");
    },

    "a11y-pause": function (trigger) {
      var element = media(panelOf(trigger));
      if (element) element.pause();
      trigger.setAttribute("aria-pressed", "false");
      swapIcon(trigger, "play_arrow");
      trigger.setAttribute("data-action", "a11y-play");
    },

    "a11y-mute": function (trigger) {
      var element = media(panelOf(trigger));
      if (element) element.muted = true;
      swapIcon(trigger, "volume_off");
      trigger.setAttribute("data-action", "a11y-unmute");
    },

    "a11y-unmute": function (trigger) {
      var element = media(panelOf(trigger));
      if (element) element.muted = false;
      swapIcon(trigger, "volume_up");
      trigger.setAttribute("data-action", "a11y-mute");
    },
  };

  ACTIONS.menu = ACTIONS.toggle;

  document.addEventListener("click", function (event) {
    var trigger = event.target.closest("[data-action]");
    if (!trigger) return;
    var handler = ACTIONS[trigger.getAttribute("data-action")];
    if (!handler) return;
    if (trigger.tagName === "BUTTON" && trigger.type !== "submit") {
      event.preventDefault();
    }
    handler(trigger, event);
  });

  /* Selects that filter a listing submit as soon as they change, so the page
   * updates without a second trip to the Apply button. requestSubmit is used
   * rather than submit() so the form's own submit listeners still run. */
  document.addEventListener("change", function (event) {
    var control = event.target;
    if (!control.closest || !control.closest("[data-action='submit-form']")) {
      return;
    }
    var form = control.form || control.closest("form");
    if (!form) return;
    if (form.requestSubmit) form.requestSubmit();
    else form.submit();
  });

  /* Hover-revealed tooltips. Focus is wired alongside pointer events so the
   * tooltip is reachable from the keyboard too. */
  ["mouseenter", "focus"].forEach(function (name) {
    document.addEventListener(
      name,
      function (event) {
        var trigger =
          event.target.closest && event.target.closest("[data-hover-show]");
        var panel = trigger && byId(trigger, "data-hover-show");
        if (panel) panel.classList.remove("hidden");
      },
      true
    );
  });
  ["mouseleave", "blur"].forEach(function (name) {
    document.addEventListener(
      name,
      function (event) {
        var trigger =
          event.target.closest && event.target.closest("[data-hover-hide]");
        var panel = trigger && byId(trigger, "data-hover-hide");
        if (panel) panel.classList.add("hidden");
      },
      true
    );
  });

  /* Destructive actions get a confirm step. The server re-checks — see
   * views/admin.py anonymize_user — so this is a courtesy, not a control. */
  document.addEventListener("submit", function (event) {
    var message = event.target.getAttribute("data-confirm");
    if (message && !window.confirm(message)) {
      event.preventDefault();
    }
  });

  /* Reader preferences (components/A11yControls.jsx).
   *
   * The control is a real form and the server sets the same cookie, so this is
   * strictly an upgrade: it applies the change in place instead of costing a
   * round trip and a scroll position. If anything here is unavailable —
   * event.submitter on an older browser — the listener bows out and the form
   * posts as it would have anyway.
   */
  var SCALES = ["100", "125", "150"];

  function remember(name, value) {
    document.cookie =
      name + "=" + value + ";path=/;max-age=31536000;samesite=Lax";
  }

  function applyTheme(button, value) {
    var dark = value === "dark";
    document.documentElement.classList.toggle("dark", dark);
    remember("watiq_theme", value);

    // The button offers the *other* theme, so everything on it flips.
    button.value = dark ? "light" : "dark";
    button.setAttribute("aria-pressed", dark ? "true" : "false");
    button.querySelectorAll("[data-a11y-icon]").forEach(function (icon) {
      icon.classList.toggle(
        "hidden",
        icon.getAttribute("data-a11y-icon") === (dark ? "dark" : "light")
      );
    });
  }

  function applyScale(group, value) {
    var root = document.documentElement;
    SCALES.forEach(function (step) {
      root.classList.toggle(
        "text-scale-" + step,
        step === value && step !== "100"
      );
    });
    remember("watiq_text_scale", value);
    group.querySelectorAll("button[value]").forEach(function (button) {
      button.setAttribute(
        "aria-pressed",
        button.value === value ? "true" : "false"
      );
    });
  }

  var preferences = document.querySelector("[data-a11y-controls]");
  if (preferences) {
    preferences.addEventListener("submit", function (event) {
      var button = event.submitter;
      if (!button || !button.name) return; // let it post for real
      if (button.name === "theme") {
        event.preventDefault();
        applyTheme(button, button.value);
      } else if (button.name === "text_scale" && SCALES.indexOf(button.value) > -1) {
        event.preventDefault();
        applyScale(preferences.querySelector("[data-a11y-sizes]"), button.value);
      }
    });
  }

  /* Mark the current nav item when a page did not set it server-side. */
  document.querySelectorAll("nav a[href]").forEach(function (link) {
    if (
      link.pathname === window.location.pathname &&
      !link.hasAttribute("aria-current")
    ) {
      link.setAttribute("aria-current", "page");
    }
  });

  /* Preloader splash screen fade out */
  function initPreloader() {
    var loader = document.getElementById("watiq-preloader");
    if (!loader) return;
    var fadeOut = function () {
      loader.classList.add("opacity-0", "pointer-events-none");
      setTimeout(function () {
        if (loader.parentNode) loader.parentNode.removeChild(loader);
      }, 500);
    };
    if (document.readyState === "complete") {
      setTimeout(fadeOut, 300);
    } else {
      window.addEventListener("load", function () {
        setTimeout(fadeOut, 300);
      });
      setTimeout(fadeOut, 1500);
    }
  }
  initPreloader();
})();
