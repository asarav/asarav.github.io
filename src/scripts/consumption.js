(function () {
    'use strict';

    const shell = document.querySelector('.consumption-body');
    const chronology = document.querySelector('[data-chronology]');
    const fullList = document.querySelector('.consumption-list.full-res');
    const mobileList = document.querySelector('.consumption-list.mobile-res');
    const hero = document.querySelector('.page-top');

    if (!shell || !chronology || !fullList || !mobileList) {
        return;
    }

    const navHeight = parseFloat(
        window
            .getComputedStyle(document.documentElement)
            .getPropertyValue('--nav-height')
    ) || 64;

    const dateEl = chronology.querySelector('[data-chronology-date]');
    const metaEl = chronology.querySelector('[data-chronology-meta]');

    const fullItems = Array.from(fullList.querySelectorAll(':scope > .item.info'));
    const mobileItems = Array.from(mobileList.querySelectorAll(':scope > .item.info'));
    const totalItems = Math.max(fullItems.length, mobileItems.length);

    const BATCH_SIZE = 125;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const canObserve = typeof IntersectionObserver !== 'undefined';

    let batchCount = 0;
    let scrollTicking = false;
    let allBatchesRendered = totalItems === 0;

    function formatDate(value) {
        const parsed = new Date(value || '');

        if (isNaN(parsed.getTime())) {
            return (value || '—').toUpperCase();
        }

        const day = String(parsed.getDate()).padStart(2, '0');
        const month = parsed
            .toLocaleString('en-US', { month: 'short' })
            .toUpperCase();
        const year = parsed.getFullYear();

        return day + ' ' + month + ' ' + year;
    }

    function formatType(value) {
        if (!value) {
            return '';
        }

        return value.charAt(0).toUpperCase() + value.slice(1);
    }

    function setChronology(item) {
        if (!item || !dateEl || !metaEl) {
            return;
        }

        const date = item.getAttribute('data-completion-date');
        const title = item.getAttribute('data-title') || '';
        const type = formatType(item.getAttribute('data-type'));
        const accent = window
            .getComputedStyle(item)
            .getPropertyValue('--type-color')
            .trim();

        dateEl.textContent = formatDate(date);
        metaEl.textContent = type && title ? type + ' · ' + title : title;

        if (accent) {
            chronology.style.setProperty('--chronology-accent', accent);
        }
    }

    // Track only the cards crossing the middle of the viewport. This keeps
    // the rail stable even when several cards are visible at once.
    const activeItems = new Set();

    function updateActiveItem() {
        if (activeItems.size === 0) {
            return;
        }

        const center = window.innerHeight / 2;
        let best = null;
        let bestDistance = Infinity;

        activeItems.forEach(function (item) {
            const rect = item.getBoundingClientRect();

            if (rect.bottom <= 0 || rect.top >= window.innerHeight) {
                return;
            }

            const distance = Math.abs(
                rect.top + rect.height / 2 - center
            );

            if (distance < bestDistance) {
                best = item;
                bestDistance = distance;
            }
        });

        if (best) {
            setChronology(best);
        }
    }

    const activeObserver = canObserve
        ? new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    activeItems.add(entry.target);
                } else {
                    activeItems.delete(entry.target);
                }
            });

            updateActiveItem();
        }, {
            rootMargin: '-42% 0px -42% 0px',
            threshold: 0
        })
        : null;

    function updateActiveFallback() {
        const list = window.matchMedia('(max-width: 768px)').matches
            ? mobileItems
            : fullItems;

        const center = window.innerHeight / 2;
        let best = null;
        let bestDistance = Infinity;

        list.forEach(function (item) {
            if (item.classList.contains('hidden')) {
                return;
            }

            const rect = item.getBoundingClientRect();

            if (rect.bottom <= 0 || rect.top >= window.innerHeight) {
                return;
            }

            const distance = Math.abs(
                rect.top + rect.height / 2 - center
            );

            if (distance < bestDistance) {
                best = item;
                bestDistance = distance;
            }
        });

        if (best) {
            setChronology(best);
        }
    }

    // Reveal cards once, just below the fold, so content never flashes in
    // after the page has already been painted.
    const revealObserver = canObserve && !reducedMotion.matches
        ? new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (!entry.isIntersecting) {
                    return;
                }

                const item = entry.target;

                item.classList.add('is-revealed');
                revealObserver.unobserve(item);

                window.setTimeout(function () {
                    item.classList.remove('will-reveal');
                    item.classList.remove('is-revealed');
                }, 520);
            });
        }, {
            rootMargin: '0px 0px -6% 0px',
            threshold: 0.05
        })
        : null;

    function prepareReveal(item) {
        if (!revealObserver || item.classList.contains('will-reveal')) {
            return;
        }

        const rect = item.getBoundingClientRect();

        if (rect.top < window.innerHeight * 0.94) {
            return;
        }

        item.classList.add('will-reveal');
        revealObserver.observe(item);
    }

    function observeItem(item) {
        if (!item) {
            return;
        }

        if (activeObserver) {
            activeObserver.observe(item);
        }

        prepareReveal(item);
    }

    function revealItem(item) {
        if (!item) {
            return;
        }

        item.classList.add('visible');
        item.classList.remove('hidden');

        observeItem(item);
    }

    function renderNextBatch() {
        if (allBatchesRendered) {
            return;
        }

        const start = batchCount * BATCH_SIZE;
        const end = Math.min(start + BATCH_SIZE, totalItems);

        for (let i = start; i < end; i++) {
            revealItem(fullItems[i]);
            revealItem(mobileItems[i]);
        }

        batchCount++;

        if (end >= totalItems) {
            allBatchesRendered = true;
        }

        updateProgress();
    }

    function updateProgress() {
        const rect = shell.getBoundingClientRect();
        const travel = Math.max(rect.height - window.innerHeight, 1);
        const progress = Math.min(
            1,
            Math.max(0, -rect.top / travel)
        );

        chronology.style.setProperty(
            '--chronology-progress',
            progress.toFixed(4)
        );
    }

    function updateChronologyVisibility() {
        // Keep the rail out of the way until the hero has actually left the
        // screen, so the top of the page reads as a single uninterrupted view.
        const visible = hero
            ? hero.getBoundingClientRect().bottom <= navHeight + 4
            : window.scrollY > navHeight;

        chronology.setAttribute(
            'data-visible',
            visible ? 'true' : 'false'
        );
    }

    function onScrollFrame() {
        scrollTicking = false;

        updateProgress();
        updateChronologyVisibility();

        if (!activeObserver) {
            updateActiveFallback();
        }

        if (!allBatchesRendered) {
            const scrollPosition = window.innerHeight + window.scrollY;

            if (scrollPosition >= document.body.offsetHeight - 700) {
                renderNextBatch();
            }
        }
    }

    function requestScrollFrame() {
        if (scrollTicking) {
            return;
        }

        scrollTicking = true;
        window.requestAnimationFrame(onScrollFrame);
    }

    // Keep the initial payload light, as before.
    for (let i = BATCH_SIZE; i < totalItems; i++) {
        if (fullItems[i]) {
            fullItems[i].classList.add('hidden');
        }

        if (mobileItems[i]) {
            mobileItems[i].classList.add('hidden');
        }
    }

    if (fullItems[0]) {
        setChronology(fullItems[0]);
    }

    renderNextBatch();
    updateProgress();
    updateChronologyVisibility();

    window.addEventListener('scroll', requestScrollFrame, { passive: true });
    window.addEventListener('resize', requestScrollFrame);
})();
