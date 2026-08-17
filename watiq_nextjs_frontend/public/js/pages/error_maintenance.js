/* _error_maintenance.html — behaviour lifted from frontend/system_maintenance.html.
 * Inline <script> is blocked by script-src 'self', so it lives here
 * and is loaded with defer from the page's scripts block.
 */
// Micro-interaction for the countdown/time
        function updateTime() {
            const now = new Date();
            // Simulating a time nearing 04:00 UTC for thematic relevance
            const target = "04:00:00";
            // In a real scenario, this would be a dynamic calculation
        }

        // Simple animation for the progress bar
        document.addEventListener('DOMContentLoaded', () => {
            const bar = document.querySelector('.bg-primary-container.h-full');
            setTimeout(() => {
                bar.style.width = '74%';
            }, 500);
        });

        // Toggle sign language module interaction
        const signModule = document.querySelector('.SignLanguageModule');
        // Any specific JS logic for sign module would go here
