/* mfa.html — behaviour lifted from frontend/staff_MFA_verification.html.
 * Inline <script> is blocked by script-src 'self', so it lives here
 * and is loaded with defer from the page's scripts block.
 */
(function () {
  "use strict";

  var inputs = Array.prototype.slice.call(
    document.querySelectorAll(".otp-input")
  );

  /* Typing advances, backspace retreats, and a pasted code fills the row.
   * Each box posts as name="code" and the view joins them, so none of this is
   * load-bearing — it only saves six separate clicks. */
  inputs.forEach(function (input, index) {
    input.addEventListener("input", function (event) {
      if (event.target.value.length === 1 && index < inputs.length - 1) {
        inputs[index + 1].focus();
      }
    });

    input.addEventListener("keydown", function (event) {
      if (event.key === "Backspace" && !event.target.value && index > 0) {
        inputs[index - 1].focus();
      }
    });

    input.addEventListener("paste", function (event) {
      event.preventDefault();
      var digits = (event.clipboardData || window.clipboardData)
        .getData("text")
        .replace(/\D/g, "")
        .slice(0, inputs.length)
        .split("");
      digits.forEach(function (digit, i) {
        if (inputs[i]) inputs[i].value = digit;
      });
      var next = Math.min(digits.length, inputs.length - 1);
      if (inputs[next]) inputs[next].focus();
    });
  });

  /* The mockup faked the whole verification here: preventDefault, a spinner,
   * then an "ACCESS GRANTED" alert. The form now posts to public.mfa, which
   * calls the API and decides. This only prevents a double submit. */
  var form = document.getElementById("mfa-form");
  if (form) {
    form.addEventListener("submit", function () {
      var button = form.querySelector("button[type=submit]");
      if (!button) return;
      button.classList.add("opacity-80", "cursor-not-allowed");
      window.setTimeout(function () {
        button.disabled = true;
      }, 0);
    });
  }

  /* Expiry countdown. The starting value is read from the markup rather than
   * hardcoded, so the template stays the single source of truth. */
  var display = document.getElementById("timer-display");
  var container = document.getElementById("timer-container");
  if (!display || !container) return;

  var parts = display.textContent.trim().split(":");
  var remaining = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
  if (!isFinite(remaining)) return;

  var tick = window.setInterval(function () {
    remaining -= 1;
    if (remaining <= 0) {
      window.clearInterval(tick);
      display.textContent = "EXPIRED";
      container.classList.add("opacity-50");
      container.classList.remove("timer-warning");
      // An expired code cannot succeed; send them back for a fresh one
      // rather than letting them submit into a guaranteed rejection.
      if (form) {
        var submit = form.querySelector("button[type=submit]");
        if (submit) submit.disabled = true;
      }
      return;
    }
    if (remaining <= 10) {
      container.classList.remove("text-accent-gold");
      container.classList.add("text-error");
    }
    var seconds = remaining % 60;
    display.textContent =
      "0" + Math.floor(remaining / 60) + ":" + (seconds < 10 ? "0" : "") + seconds;
  }, 1000);
})();
