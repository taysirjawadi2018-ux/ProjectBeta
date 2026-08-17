/* payment_confirmation.html — behaviour lifted from frontend/secure_paiment_and_receipting.html.
 * Inline <script> is blocked by script-src 'self', so it lives here
 * and is loaded with defer from the page's scripts block.
 */
// Subtle watermark parallax effect
    const watermark = document.querySelector('.watermark-bg');
    document.addEventListener('mousemove', (e) => {
        const moveX = (e.clientX - window.innerWidth / 2) / 100;
        const moveY = (e.clientY - window.innerHeight / 2) / 100;
        watermark.style.transform = `translate(${moveX}px, ${moveY}px)`;
    });
