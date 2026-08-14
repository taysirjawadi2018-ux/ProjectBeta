/* register.html — behaviour lifted from frontend/citizen_registration.html.
 * Inline <script> is blocked by script-src 'self', so it lives here
 * and is loaded with defer from the page's scripts block.
 *
 * The mockup's wizard was the whole feature: it faked a submit and reloaded.
 * Here it is pure progressive enhancement over one real form. The server
 * renders all three steps visible with a submit button, so registration works
 * with JavaScript off; this file collapses that into the designed three-step
 * flow and only lets the form submit from the final step.
 */
(function () {
  "use strict";

  var form = document.getElementById("register-form");
  var nextButton = document.getElementById("next-btn");
  var backButton = document.getElementById("back-btn");
  var stepText = document.getElementById("current-step-text");
  var steps = Array.prototype.slice.call(form ? form.querySelectorAll(".step-content") : []);
  if (!form || !nextButton || steps.length === 0) return;

  var total = steps.length;
  var current = 1;

  // Only now that the wizard is running may the button stop being a submit.
  nextButton.setAttribute("type", "button");

  function setIndicator(index, state) {
    var indicator = document.getElementById("step-" + index + "-indicator");
    var label = document.getElementById("step-" + index + "-label");
    if (!indicator || !label) return;

    if (state === "done") {
      indicator.className =
        "w-12 h-12 rounded-full flex items-center justify-center bg-secondary text-white shadow-lg transition-all cursor-pointer";
      var check = document.createElement("span");
      check.className = "material-symbols-outlined text-xl";
      check.textContent = "check";
      indicator.replaceChildren(check);
      label.className =
        "text-[11px] font-extrabold text-secondary uppercase tracking-widest";
    } else if (state === "active") {
      indicator.className =
        "w-12 h-12 rounded-full flex items-center justify-center text-white bg-primary border-2 border-secondary shadow-xl ring-8 ring-secondary/10 transition-all cursor-pointer";
      indicator.textContent = String(index);
      label.className =
        "text-[11px] font-extrabold text-primary uppercase tracking-widest";
    } else {
      indicator.className =
        "w-12 h-12 rounded-full flex items-center justify-center bg-white text-primary border border-outline-variant transition-all cursor-pointer";
      indicator.textContent = String(index);
      label.className =
        "text-[11px] font-bold text-on-surface-variant uppercase tracking-widest opacity-60";
    }
  }

  function render() {
    steps.forEach(function (step, index) {
      step.classList.toggle("hidden", index + 1 !== current);
    });

    for (var i = 1; i <= total; i++) {
      setIndicator(i, i < current ? "done" : i === current ? "active" : "todo");
    }

    if (stepText) stepText.textContent = String(current);
    if (backButton) backButton.classList.toggle("invisible", current === 1);

    var last = current === total;
    // On the final step the control becomes a genuine submit, so the browser
    // runs required-field validation before the form posts.
    nextButton.setAttribute("type", last ? "submit" : "button");
    var caption = document.createTextNode(
      last ? "Complete Registration " : "Next Step "
    );
    var icon = document.createElement("span");
    icon.className = "material-symbols-outlined text-secondary";
    icon.textContent = last ? "how_to_reg" : "arrow_forward";
    nextButton.replaceChildren(caption, icon);
    nextButton.classList.toggle("bg-tertiary", last);
    nextButton.classList.toggle("bg-primary", !last);
  }

  /* Advance only when the fields on this step are valid, so someone cannot
   * paginate past a bad national ID and discover it three screens later. */
  function stepIsValid() {
    var fields = steps[current - 1].querySelectorAll("input, select, textarea");
    for (var i = 0; i < fields.length; i++) {
      if (!fields[i].checkValidity()) {
        fields[i].reportValidity();
        return false;
      }
    }
    return true;
  }

  function go(target) {
    if (target > current && !stepIsValid()) return;
    current = Math.min(Math.max(target, 1), total);
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  document.addEventListener("click", function (event) {
    var trigger = event.target.closest("[data-action]");
    if (!trigger) return;
    var action = trigger.getAttribute("data-action");

    if (action === "step-next") {
      if (current === total) return; // let the submit through
      event.preventDefault();
      go(current + 1);
    } else if (action === "step-prev") {
      event.preventDefault();
      go(current - 1);
    } else if (action === "step-goto") {
      event.preventDefault();
      var target = parseInt(trigger.getAttribute("data-step"), 10);
      // Backwards freely; forwards only one step at a time, so the validation
      // above cannot be skipped by clicking straight to the last dot.
      if (target < current || target === current + 1) go(target);
    }
  });

  form.addEventListener("submit", function () {
    nextButton.classList.add("opacity-80", "pointer-events-none");
  });

  render();
})();
