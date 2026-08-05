/* _error_blocked.html — behaviour lifted from frontend/security_acces_blocked.html.
 * Inline <script> is blocked by script-src 'self', so it lives here
 * and is loaded with defer from the page's scripts block.
 */
// Set dynamic clock
        function updateClock() {
            const now = new Date();
            const year = now.getUTCFullYear();
            const month = String(now.getUTCMonth() + 1).padStart(2, '0');
            const day = String(now.getUTCDate()).padStart(2, '0');
            const hours = String(now.getUTCHours()).padStart(2, '0');
            const minutes = String(now.getUTCMinutes()).padStart(2, '0');
            const seconds = String(now.getUTCSeconds()).padStart(2, '0');
            document.getElementById('current-time').textContent = `${year}-${month}-${day} ${hours}:${minutes}:${seconds} UTC`;
        }
        setInterval(updateClock, 1000);
        updateClock();

        // Subtle ambient security light interaction
        document.addEventListener('mousemove', (e) => {
            const scanline = document.querySelector('.scanline');
            if (scanline) {
                const opacity = (Math.sin(Date.now() / 1000) * 0.2) + 0.8;
                scanline.style.opacity = opacity;
            }
        });
