/* index.html — behaviour lifted from frontend/national_portal.html.
 * Inline <script> is blocked by script-src 'self', so it lives here
 * and is loaded with defer from the page's scripts block.
 */
(function () {
  "use strict";

  /* The mockup bound this to every a[href^="#"], but all of its links were
   * bare "#" placeholders, so querySelector("#") threw on the first click.
   * Now that those anchors point at real routes the handler only has to cover
   * genuine in-page fragments, and it checks the target resolves first. */
  document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
    anchor.addEventListener("click", function (event) {
      var hash = this.getAttribute("href");
      if (hash.length < 2) return;
      var target = document.getElementById(hash.slice(1));
      if (!target) return;
      event.preventDefault();
      target.scrollIntoView({ behavior: "smooth" });
    });
  });

  var header = document.querySelector("header");
  if (!header) return;
  var onScroll = function () {
    header.classList.toggle("shadow-xl", window.scrollY > 50);
    header.classList.toggle("bg-opacity-95", window.scrollY > 50);
    header.classList.toggle("backdrop-blur-md", window.scrollY > 50);
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
})();
