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
 *   data-action="toggle"   data-target="<id>"        show/hide a panel
 *   data-action="filter"   data-filter-group="..."   client-side list filtering
 *   data-action="dismiss"                            close nearest [data-dismissable]
 *   data-confirm="message" on a <form>               confirm before submitting
 */
(function () {
  "use strict";

  document.addEventListener("click", function (event) {
    var trigger = event.target.closest("[data-action]");
    if (!trigger) return;

    var action = trigger.getAttribute("data-action");

    if (action === "toggle") {
      var target = document.getElementById(trigger.getAttribute("data-target"));
      if (!target) return;
      var nowHidden = target.classList.toggle("hidden");
      trigger.setAttribute("aria-expanded", String(!nowHidden));
      if (!nowHidden) {
        var focusable = target.querySelector(
          "input:not([type=hidden]), select, textarea, button"
        );
        if (focusable) focusable.focus();
      }
    }

    if (action === "dismiss") {
      var panel = trigger.closest("[data-dismissable]");
      if (panel) panel.remove();
    }

    if (action === "filter") {
      var group = trigger.getAttribute("data-filter-group");
      var value = trigger.getAttribute("data-filter-value") || "all";
      document
        .querySelectorAll(
          "[data-filter-group='" + group + "'][data-action='filter']"
        )
        .forEach(function (btn) {
          btn.setAttribute("aria-pressed", String(btn === trigger));
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
    }
  });

  /* Destructive actions get a confirm step. The server re-checks — see
   * views/admin.py anonymize_user — so this is a courtesy, not a control. */
  document.addEventListener("submit", function (event) {
    var message = event.target.getAttribute("data-confirm");
    if (message && !window.confirm(message)) {
      event.preventDefault();
    }
  });

  /* Mark the current nav item when a page did not set it server-side. */
  document.querySelectorAll("nav a[href]").forEach(function (link) {
    if (
      link.pathname === window.location.pathname &&
      !link.hasAttribute("aria-current")
    ) {
      link.setAttribute("aria-current", "page");
    }
  });
})();
