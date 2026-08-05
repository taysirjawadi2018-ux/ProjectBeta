/* book_appointment.html — behaviour for the map pane.
 * Inline <script> is blocked by script-src 'self', so it lives here and is
 * loaded with defer from the page's scripts block.
 *
 * Most of the mockup's script is gone rather than ported, because the work it
 * simulated now happens on the server: the search box, the type filters and
 * the "apply" button are one real GET form, picking an office is a link, and
 * .current-year is rendered as {{ year }}. What is left is the map plate's own
 * zoom, which has no server side.
 *
 * The three controls act on the static plate the mockup shipped. There is no
 * tile server behind it, so they scale the image rather than fetch a new
 * zoom level — the label ("Zoom In") still describes what the button does.
 */
(function () {
  "use strict";

  var plate = document.getElementById("appointment-map-canvas");
  if (!plate) return;

  var MIN = 1;
  var MAX = 3;
  var scale = 1;

  function apply() {
    plate.style.backgroundSize = scale === 1 ? "cover" : scale * 100 + "%";
  }

  var ACTIONS = {
    "map-zoom-in": function () {
      scale = Math.min(MAX, scale + 0.5);
    },
    "map-zoom-out": function () {
      scale = Math.max(MIN, scale - 0.5);
    },
    "map-recenter": function () {
      scale = 1;
    },
  };

  document.addEventListener("click", function (event) {
    var trigger = event.target.closest && event.target.closest("[data-action]");
    if (!trigger) return;
    var handler = ACTIONS[trigger.getAttribute("data-action")];
    if (!handler) return;
    event.preventDefault();
    handler();
    apply();
    // The zoom buttons are the only place the level is visible, so keep the
    // disabled state honest at both ends of the range.
    var zoomIn = document.getElementById("map-zoom-in");
    var zoomOut = document.getElementById("map-zoom-out");
    if (zoomIn) zoomIn.disabled = scale >= MAX;
    if (zoomOut) zoomOut.disabled = scale <= MIN;
  });
})();
