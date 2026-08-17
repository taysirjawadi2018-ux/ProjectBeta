/* my_documents.html — behaviour lifted from frontend/my_document_list.html.
 * Inline <script> is blocked by script-src 'self', so it lives here
 * and is loaded with defer from the page's scripts block.
 */
document.getElementById('current-year').textContent = new Date().getFullYear();
