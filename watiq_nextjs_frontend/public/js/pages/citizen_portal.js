/* citizen_portal.html — behaviour lifted from frontend/service_catalogue.html.
 * Inline <script> is blocked by script-src 'self', so it lives here
 * and is loaded with defer from the page's scripts block.
 */
// Search bar interaction
        const searchInput = document.querySelector('input[type="text"]');
        searchInput?.addEventListener('focus', () => {
            searchInput.parentElement.classList.add('bg-white/20', 'ring-1', 'ring-white');
        });
        searchInput?.addEventListener('blur', () => {
            searchInput.parentElement.classList.remove('bg-white/20', 'ring-1', 'ring-white');
        });

        // Add subtle hover lift to all cards
        document.querySelectorAll('.col-span-12, .col-span-12.md\\:col-span-4').forEach(card => {
            card.addEventListener('mouseenter', () => {
                card.style.transform = 'translateY(-4px)';
            });
            card.addEventListener('mouseleave', () => {
                card.style.transform = 'translateY(0)';
            });
        });
