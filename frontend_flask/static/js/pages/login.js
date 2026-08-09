/* login.html — behaviour lifted from frontend/secure_login.html.
 * Inline <script> is blocked by script-src 'self', so it lives here
 * and is loaded with defer from the page's scripts block.
 */
(function () {
  "use strict";

  var form = document.getElementById("loginForm");
  if (!form) return;

  /* Tint the leading icon while its field has focus. */
  form.querySelectorAll("input").forEach(function (input) {
    var icon = input.parentElement.querySelector(".material-symbols-outlined");
    if (!icon) return;
    input.addEventListener("focus", function () {
      icon.classList.add("text-mediterranean-cerulean");
    });
    input.addEventListener("blur", function () {
      icon.classList.remove("text-mediterranean-cerulean");
    });
  });

  /* The mockup called preventDefault here and faked a 1.8s "validated" state.
   * The form now posts to public.login for real, so this only guards against
   * a double submit and shows that something is happening while the round
   * trip completes. */
  form.addEventListener("submit", function () {
    var button = form.querySelector("button[type=submit]");
    if (!button) return;
    button.classList.add("opacity-80", "pointer-events-none");
    var spinner = document.createElement("span");
    spinner.className = "material-symbols-outlined animate-spin";
    spinner.textContent = "progress_activity";
    button.replaceChildren(spinner, " Validating Sovereign Token...");
  });
})();
