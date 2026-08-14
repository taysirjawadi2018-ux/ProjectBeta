/* terms.html — behaviour lifted from frontend/terms_and_conditions.html.
 * Inline <script> is blocked by script-src 'self', so it lives here
 * and is loaded with defer from the page's scripts block.
 */
// Set dynamic year
        document.getElementById('current-year').textContent = new Date().getFullYear();

        // Reading logic: require scroll to bottom to enable checkbox
        const contentArea = document.getElementById('terms-content');
        const scrollTrigger = document.getElementById('scroll-bottom-trigger');
        const checkbox = document.getElementById('accept-checkbox');
        const label = document.getElementById('accept-label');
        const btn = document.getElementById('continue-btn');

        const observer = new IntersectionObserver((entries) => {
            if(entries[0].isIntersecting) {
                // User has scrolled to the bottom
                checkbox.disabled = false;
                label.classList.remove('cursor-not-allowed', 'opacity-60');
                label.classList.add('cursor-pointer');
                observer.disconnect(); // Only need to trigger once
            }
        }, { root: contentArea, threshold: 1.0 });

        observer.observe(scrollTrigger);

        // Checkbox logic to enable button
        checkbox.addEventListener('change', (e) => {
            if(e.target.checked) {
                btn.disabled = false;
                btn.classList.remove('bg-outline', 'cursor-not-allowed');
                btn.classList.add('bg-primary', 'hover:bg-primary-container', 'shadow-md');
            } else {
                btn.disabled = true;
                btn.classList.add('bg-outline', 'cursor-not-allowed');
                btn.classList.remove('bg-primary', 'hover:bg-primary-container', 'shadow-md');
            }
        });
