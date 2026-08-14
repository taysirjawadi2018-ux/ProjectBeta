/* staff_health.html — size the latency bars.
 *
 * The width of each bar is a measured round-trip time, so it cannot be a
 * Tailwind class: the scanner only emits utilities it can see as literal text,
 * and w-[{{ n }}%] is never literal. The server renders the percentage into
 * data-pct and this applies it, which is also the only place a style is
 * written — CSP restricts the style *attribute in markup*, not the CSSOM.
 */
(function () {
  "use strict";
  document.querySelectorAll(".latency-bar[data-pct]").forEach(function (bar) {
    var pct = Math.max(2, Math.min(100, Number(bar.dataset.pct) || 0));
    // The tall tiles size on height, the horizontal rows on width; each bar
    // sets whichever axis its container lays out along.
    if (bar.parentElement && bar.parentElement.classList.contains("items-end")) {
      bar.style.height = pct + "%";
    } else {
      bar.style.width = pct + "%";
    }
  });
})();
