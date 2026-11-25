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

// The project demos used to be animated GIFs, which the browser only fetched
// once they scrolled near the viewport. Videos are not lazy-loadable, so they
// ship with preload="none" and only start (and download) when they come close.
document.addEventListener('DOMContentLoaded', function () {
    const videos = Array.from(document.querySelectorAll('video[data-lazy-video]'));
    if (!videos.length) return;

    // The MP4 URL lives in data-src, not src: with no source the element cannot
    // fetch anything, no matter how the browser treats preload. The observer
    // assigns it on approach, which is the laziness the GIFs' loading="lazy" had.
    function start(video) {
        const source = video.querySelector('source[data-src]');
        if (source) {
            source.src = source.getAttribute('data-src');
            source.removeAttribute('data-src');
            video.load();
        }

        const attempt = video.play();
        if (attempt && typeof attempt.catch === 'function') attempt.catch(function () {});
    }

    if (typeof IntersectionObserver === 'undefined') {
        videos.forEach(start);
        return;
    }

    const observer = new IntersectionObserver(
        function (entries) {
            entries.forEach(function (entry) {
                if (!entry.isIntersecting) return;
                // A section that is still collapsed (js-project-hidden) gives its
                // videos a zero-area box, and Chrome reports those as intersecting
                // with ratio 0 — playing them there would fetch every MP4 up front.
                if (!(entry.intersectionRatio > 0)) return;
                observer.unobserve(entry.target);
                start(entry.target);
            });
        },
        { root: null, rootMargin: '300px 0px', threshold: 0.01 }
    );

    videos.forEach(function (video) { observer.observe(video); });
});

