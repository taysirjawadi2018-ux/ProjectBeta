/* document_upload.html — echo the chosen file and fill in its content type.
 *
 * The server wants a filename and a content type, not the bytes: it answers
 * with a presigned PUT that the browser then uses directly. Without this the
 * form still posts — the file input carries the name — it just does not say
 * which file was picked, and the content type falls back to
 * application/octet-stream.
 */
(function () {
  "use strict";
  var input = document.getElementById("document-file");
  var label = document.getElementById("chosen-file");
  var type = document.getElementById("content_type");
  if (!input) return;
  input.addEventListener("change", function () {
    var file = input.files && input.files[0];
    if (!file) return;
    if (label) label.textContent = file.name;
    if (type) type.value = file.type || "application/octet-stream";
  });
})();
