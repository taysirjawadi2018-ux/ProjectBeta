/* citizen_dashboard.html — behaviour lifted from frontend/citizen_dashboard.html.
 * Inline <script> is blocked by script-src 'self', so it lives here
 * and is loaded with defer from the page's scripts block.
 *
 * Two of the mockup's three blocks are gone rather than ported: the empty
 * .group mouseenter listener did nothing, and .current-year is rendered
 * server-side now ({{ year }}).
 */
(function () {
  "use strict";

  /* Micro-interaction for the active session indicator: the "sovereign cloud
   * secured" chip breathes once every two seconds. It is decoration, so it
   * stops for anyone who asked for reduced motion. */
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  var indicator = document.querySelector("header .bg-secondary-container");
  if (!indicator) return;
  setInterval(function () {
    indicator.classList.toggle("opacity-80");
  }, 2000);
})();
