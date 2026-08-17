/* appointment_detail.html — behaviour lifted from frontend/appointment_detail.html.
 * Inline <script> is blocked by script-src 'self', so it lives here
 * and is loaded with defer from the page's scripts block.
 */
// Set dynamic year in footer
        document.getElementById('current-year').textContent = new Date().getFullYear();
