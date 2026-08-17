/* security_log.html — behaviour lifted from frontend/security_log.html.
 * Inline <script> is blocked by script-src 'self', so it lives here
 * and is loaded with defer from the page's scripts block.
 */
// Set dynamic year in footer
        document.getElementById('currentYear').textContent = new Date().getFullYear();
