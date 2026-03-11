document.addEventListener('DOMContentLoaded', function() {
    // Initialize Bootstrap 5 tooltips
    const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]');
    tooltipTriggerList.forEach(function(tooltipTriggerEl) {
        if (typeof bootstrap !== 'undefined' && bootstrap.Tooltip) {
            new bootstrap.Tooltip(tooltipTriggerEl);
        }
    });

    // Update copyright year dynamically
    const copyrightElement = document.querySelector('div.copyright');
    if (copyrightElement) {
        const currentYear = new Date().getFullYear();
        copyrightElement.textContent = 'Copyright © ' + currentYear + '. All rights reserved.';
    }
});
