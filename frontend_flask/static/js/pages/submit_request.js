/* submit_request.html — behaviour lifted verbatim from the mockup's inline
 * <script> block. Externalised because the production CSP is
 * script-src 'self' with no 'unsafe-inline', which blocks inline scripts
 * exactly as it blocks inline styles. */

// Simple drag and drop visual feedback
const dropzone = document.getElementById('dropzone');
if(dropzone) {
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults (e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        dropzone.addEventListener(eventName, highlight, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, unhighlight, false);
    });

    function highlight(e) {
        dropzone.classList.add('drag-active');
    }

    function unhighlight(e) {
        dropzone.classList.remove('drag-active');
    }
}
