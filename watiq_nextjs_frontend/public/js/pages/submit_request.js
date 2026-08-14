/* submit_request.html — behaviour lifted from frontend/crimanel_record_B3_application.html.
 * Inline <script> is blocked by script-src 'self', so it lives here
 * and is loaded with defer from the page's scripts block.
 */
// Simple interaction for form inputs
        document.querySelectorAll('input, select, textarea').forEach(element => {
            element.addEventListener('focus', () => {
                element.parentElement.querySelector('label')?.classList.add('text-primary');
            });
            element.addEventListener('blur', () => {
                element.parentElement.querySelector('label')?.classList.remove('text-primary');
            });
        });

        // Micro-interaction for TSL module expansion
        const tslModule = document.getElementById('tsl-module');
        let isExpanded = false;
        
        tslModule.querySelector('button:last-child').addEventListener('click', () => {
            isExpanded = !isExpanded;
            if(isExpanded) {
                tslModule.classList.remove('w-64', 'md:w-80');
                tslModule.classList.add('w-96', 'md:w-[450px]');
            } else {
                tslModule.classList.add('w-64', 'md:w-80');
                tslModule.classList.remove('w-96', 'md:w-[450px]');
            }
        });
