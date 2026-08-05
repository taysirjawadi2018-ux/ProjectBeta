/* index.html — behaviour lifted from frontend/national_portal.html.
 * Inline <script> is blocked by script-src 'self', so it lives here
 * and is loaded with defer from the page's scripts block.
 *
 * The mockup's first block set every .current-year span from JS; the year is
 * rendered server-side now ({{ year }}), so it is dropped rather than doubled.
 */
(function () {
  "use strict";

  /* Micro-interaction: the glass panels drift a few pixels with the pointer.
   * The mockup ran this unconditionally; honouring prefers-reduced-motion
   * costs one query and the panels simply sit still for anyone who asked. */
  var panels = document.querySelectorAll(".glass-panel");
  var still = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (panels.length && !still.matches) {
    document.addEventListener(
      "mousemove",
      function (event) {
        var shiftX = (event.clientX / window.innerWidth - 0.5) * 10;
        var shiftY = (event.clientY / window.innerHeight - 0.5) * 10;
        panels.forEach(function (panel) {
          panel.style.transform =
            "translate(" + shiftX + "px, " + shiftY + "px)";
        });
      },
      { passive: true }
    );
  }

  /* Interactive header scroll: the bar shrinks and goes translucent past
   * 50px. The utilities it toggles appear in no template, so they compile
   * only because tailwind.config.js scans static/js as well as templates/. */
  var header = document.querySelector("header");
  if (!header) return;
  var onScroll = function () {
    var scrolled = window.scrollY > 50;
    header.classList.toggle("h-16", scrolled);
    header.classList.toggle("bg-surface/95", scrolled);
    header.classList.toggle("backdrop-blur-md", scrolled);
    header.classList.toggle("h-20", !scrolled);
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
})();
