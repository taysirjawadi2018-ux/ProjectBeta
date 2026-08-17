/* support.html — behaviour lifted from frontend/support_and_inquiries.html.
 * Inline <script> is blocked by script-src 'self', so it lives here
 * and is loaded with defer from the page's scripts block.
 */
// Form field active state enhancement
        const formElements = document.querySelectorAll('input, select, textarea');
        formElements.forEach(el => {
            el.addEventListener('focus', () => {
                el.previousElementSibling?.classList.add('text-mediterranean-cerulean');
            });
            el.addEventListener('blur', () => {
                el.previousElementSibling?.classList.remove('text-mediterranean-cerulean');
            });
        });
