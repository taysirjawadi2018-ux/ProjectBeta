/* request_detail.html — behaviour lifted from
 * frontend/document_verification_and_details.html.
 * Inline <script> is blocked by script-src 'self', so it lives here and is
 * loaded with defer from the page's scripts block.
 */
(function () {
  "use strict";

  /* The certificate tilts toward the pointer. The mockup rebuilt a transform
   * string per mousemove; this writes two custom properties and lets the
   * stylesheet own the transform (see .document-card in the page CSS). */
  var wrapper = document.querySelector(".document-3d-wrapper");
  var card = wrapper && wrapper.querySelector(".document-card");
  if (card && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    wrapper.addEventListener(
      "mousemove",
      function (event) {
        var rect = wrapper.getBoundingClientRect();
        var rotateX = (event.clientY - rect.top - rect.height / 2) / 40;
        var rotateY = (rect.width / 2 - (event.clientX - rect.left)) / 40;
        card.style.setProperty("--tilt-x", rotateX + "deg");
        card.style.setProperty("--tilt-y", rotateY + "deg");
        card.style.setProperty("--tilt-scale", "1.01");
      },
      { passive: true }
    );

    wrapper.addEventListener("mouseleave", function () {
      card.style.setProperty("--tilt-x", "1deg");
      card.style.setProperty("--tilt-y", "-3deg");
      card.style.setProperty("--tilt-scale", "1");
    });
  }

  /* The mockup drew a copy button next to the fingerprint but never wired it.
   * Clipboard access needs a secure context, so the fallback selects the text
   * instead of silently doing nothing. */
  document.addEventListener("click", function (event) {
    var trigger = event.target.closest && event.target.closest("[data-action]");
    if (!trigger || trigger.getAttribute("data-action") !== "copy") return;
    event.preventDefault();

    var id = trigger.getAttribute("data-target");
    var source = id && document.getElementById(id);
    if (!source) return;
    var text = source.textContent.trim();

    var confirmCopy = function () {
      var icon = trigger.querySelector(".material-symbols-outlined");
      if (!icon) return;
      icon.textContent = "check";
      window.setTimeout(function () {
        icon.textContent = "content_copy";
      }, 1500);
    };

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(confirmCopy, function () {});
      return;
    }
    var range = document.createRange();
    range.selectNodeContents(source);
    var selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });
})();
