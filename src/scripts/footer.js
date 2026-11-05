document.addEventListener('DOMContentLoaded', function () {
    // Keep the copyright current without a build step.
    const yearElement = document.querySelector('[data-footer-year]');
    if (yearElement) {
        yearElement.textContent = new Date().getFullYear();
    }
});
