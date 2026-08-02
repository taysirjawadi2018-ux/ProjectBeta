/* login.html — behaviour lifted verbatim from the mockup's inline
 * <script> block. Externalised because the production CSP is
 * script-src 'self' with no 'unsafe-inline', which blocks inline scripts
 * exactly as it blocks inline styles. */

// Simple toggle logic for accessibility overlay
const toggleBtn = document.getElementById('toggle-interpreter');
const closeBtn = document.getElementById('close-interpreter');
const interpreterSlot = document.getElementById('interpreter-slot');
let isInterpreterVisible = false;

function toggleInterpreter() {
    isInterpreterVisible = !isInterpreterVisible;
    interpreterSlot.style.display = isInterpreterVisible ? 'flex' : 'none';
}

toggleBtn.addEventListener('click', toggleInterpreter);
closeBtn.addEventListener('click', () => {
    isInterpreterVisible = false;
    interpreterSlot.style.display = 'none';
});

// Simple audio toggle styling
const audioBtn = document.getElementById('toggle-audio');
let isAudioOn = false;
audioBtn.addEventListener('click', () => {
    isAudioOn = !isAudioOn;
    if(isAudioOn) {
        audioBtn.classList.add('bg-secondary-container', 'text-on-secondary-container');
        audioBtn.classList.remove('bg-surface', 'text-on-surface');
    } else {
        audioBtn.classList.remove('bg-secondary-container', 'text-on-secondary-container');
        audioBtn.classList.add('bg-surface', 'text-on-surface');
    }
});
