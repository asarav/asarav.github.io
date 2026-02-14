document.addEventListener('DOMContentLoaded', function() {
    // Initialize Bootstrap 4 tooltips
    const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-toggle="tooltip"]'));
    tooltipTriggerList.map(function(tooltipTriggerEl) {
        return new (window.$ || {}).tooltip ? new $.tooltip(tooltipTriggerEl) : tooltipTriggerEl;
    });

    // Update copyright year dynamically
    const copyrightElement = document.querySelector('div.copyright');
    if (copyrightElement) {
        const currentYear = new Date().getFullYear();
        copyrightElement.textContent = 'Copyright © ' + currentYear + '. All rights reserved.';
    }
});