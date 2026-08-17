/* password_reset.html — behaviour lifted from frontend/secure_account_recovery.html.
 * Inline <script> is blocked by script-src 'self', so it lives here
 * and is loaded with defer from the page's scripts block.
 *
 * The mockup drove three steps entirely in the browser and never contacted a
 * server. The real flow has two server stages and the template renders
 * whichever one applies, so all that is left here is the convenience typing
 * behaviour for the code boxes.
 */
(function () {
  "use strict";

  var inputs = Array.prototype.slice.call(
    document.querySelectorAll(".otp-input")
  );
  if (inputs.length === 0) return;

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
})();
