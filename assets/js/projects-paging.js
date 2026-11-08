document.addEventListener('DOMContentLoaded', function () {
    const content = document.getElementById('content');
    if (!content) return;

    const allSections = Array.from(content.querySelectorAll('section'));
    if (allSections.length <= 1) return;

    // Progressive reveal keeps initial load light while preserving SEO (all HTML is still present).
    const INITIAL_COUNT = 4;
    const BATCH_SIZE = 3;

    let nextIndex = 0;

    function hideSection(section) {
        section.classList.add('js-project-hidden');
        section.setAttribute('aria-hidden', 'true');
    }

    function showSection(section) {
        section.classList.remove('js-project-hidden');
        section.removeAttribute('aria-hidden');
    }

    function showNextBatch(count) {
        const start = nextIndex;
        const end = Math.min(allSections.length, nextIndex + count);
        for (let i = start; i < end; i++) {
            showSection(allSections[i]);
        }
        nextIndex = end;
        return nextIndex < allSections.length;
    }

    // Hide everything first, then show initial batch for a stable first paint.
    allSections.forEach(hideSection);
    showNextBatch(INITIAL_COUNT);

    const sentinel = document.createElement('div');
    sentinel.className = 'projects-sentinel';
    sentinel.setAttribute('aria-hidden', 'true');
    content.appendChild(sentinel);

    const hint = document.createElement('div');
    hint.className = 'projects-loading-hint';
    hint.textContent = 'Loading more projects…';
    hint.setAttribute('aria-live', 'polite');
    hint.style.display = 'none';
    content.appendChild(hint);

    function setHintVisible(visible) {
        hint.style.display = visible ? 'block' : 'none';
    }

    const canObserve = typeof IntersectionObserver !== 'undefined';
    if (!canObserve) {
        // Fallback: reveal everything if the browser doesn't support IntersectionObserver.
        allSections.forEach(showSection);
        return;
    }

    const observer = new IntersectionObserver(
        function (entries) {
            entries.forEach(function (entry) {
                if (!entry.isIntersecting) return;

                setHintVisible(true);
                const hasMore = showNextBatch(BATCH_SIZE);
                setHintVisible(false);

                if (!hasMore) {
                    observer.disconnect();
                    sentinel.remove();
                    hint.remove();
                }
            });
        },
        {
            root: null,
            rootMargin: '800px 0px',
            threshold: 0.01,
        }
    );

    observer.observe(sentinel);
});

