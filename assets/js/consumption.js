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
    const loadSentinel = shell.querySelector('[data-consumption-sentinel]');

    const BATCH_SIZE = 100;
    const LOAD_AHEAD_PX = 1800;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const canObserve = typeof IntersectionObserver !== 'undefined';

    let batchCount = 0;
    let scrollTicking = false;
    let allBatchesRendered = totalItems === 0;
    let batchObserver = null;

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
    const parallaxItems = new Set();
    let parallaxDisabled = false;

    function findClosestToCenter(candidates) {
        const center = window.innerHeight / 2;
        let best = null;
        let bestDistance = Infinity;

        candidates.forEach(function (item) {
            if (item.classList && item.classList.contains('hidden')) {
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

        return best;
    }

    function updateActiveItem() {
        if (activeItems.size === 0) {
            return;
        }

        const best = findClosestToCenter(Array.from(activeItems));

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

    const parallaxObserver = canObserve
        ? new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    parallaxItems.add(entry.target);
                } else {
                    if (
                        !reducedMotion.matches &&
                        !document.documentElement.classList.contains('fast-scroll')
                    ) {
                        updateItemParallax(entry.target);
                    } else {
                        entry.target.style.removeProperty('--section-opacity');
                    }

                    parallaxItems.delete(entry.target);
                }
            });

            updateConsumptionParallax();
        }, {
            rootMargin: '100% 0px',
            threshold: 0
        })
        : null;

    function updateItemParallax(item) {
        const height = window.innerHeight || 1;
        const rect = item.getBoundingClientRect();
        const center = rect.top + rect.height / 2;
        const half = height / 2;
        const span = half + rect.height * 0.5;
        const distance = Math.abs(center - half);
        const deadZone = span * 0.2;
        const fadeRange = span - deadZone;
        const edge = fadeRange > 0
            ? Math.min(1, Math.max(0, (distance - deadZone) / fadeRange))
            : 0;

        item.style.setProperty(
            '--section-opacity',
            (1 - edge * 0.4).toFixed(3)
        );
    }

    function updateConsumptionParallax() {
        if (parallaxDisabled) {
            return;
        }

        if (document.documentElement.classList.contains('fast-scroll')) {
            parallaxItems.forEach(function (item) {
                item.style.removeProperty('--section-opacity');
            });
            parallaxItems.clear();
            parallaxDisabled = true;

            if (parallaxObserver) {
                parallaxObserver.disconnect();
            }

            return;
        }

        if (reducedMotion.matches) {
            parallaxItems.forEach(function (item) {
                item.style.removeProperty('--section-opacity');
            });

            return;
        }

        parallaxItems.forEach(updateItemParallax);
    }

    if (reducedMotion.addEventListener) {
        reducedMotion.addEventListener('change', updateConsumptionParallax);
    }

    function updateActiveFallback() {
        const list = window.matchMedia('(max-width: 768px)').matches
            ? mobileItems
            : fullItems;

        const best = findClosestToCenter(list);

        if (best) {
            setChronology(best);
        }
    }

    const revealObserver = canObserve && !reducedMotion.matches
        ? new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (!entry.isIntersecting) {
                    return;
                }

                entry.target.classList.add('is-revealed');
                revealObserver.unobserve(entry.target);
            });
        }, {
            rootMargin: '0px 0px 12% 0px',
            threshold: 0.05
        })
        : null;

    function prepareReveal(item) {
        if (
            !revealObserver ||
            document.documentElement.classList.contains('fast-scroll') ||
            item.classList.contains('will-reveal')
        ) {
            return;
        }

        if (item.getBoundingClientRect().top < window.innerHeight * 0.94) {
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

        if (
            parallaxObserver &&
            !parallaxDisabled &&
            !document.documentElement.classList.contains('fast-scroll')
        ) {
            parallaxObserver.observe(item);
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

        if (batchObserver && loadSentinel && !allBatchesRendered) {
            batchObserver.unobserve(loadSentinel);
            batchObserver.observe(loadSentinel);
        }
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
        updateConsumptionParallax();

        if (!activeObserver) {
            updateActiveFallback();
        }

        if (!allBatchesRendered) {
            const scrollPosition = window.innerHeight + window.scrollY;

            if (scrollPosition >= document.body.offsetHeight - LOAD_AHEAD_PX) {
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

    if (canObserve && loadSentinel && !allBatchesRendered) {
        batchObserver = new IntersectionObserver(function (entries) {
            if (entries.some(function (entry) {
                return entry.isIntersecting;
            })) {
                renderNextBatch();
            }
        }, {
            rootMargin: LOAD_AHEAD_PX + 'px 0px'
        });
        batchObserver.observe(loadSentinel);
    }

    updateProgress();
    updateChronologyVisibility();

    // Year jump: populate selects and scroll to the first entry of a chosen year.
    (function setupYearJump() {
        var yearSelects = Array.from(document.querySelectorAll('[data-year-jump]'));

        if (!yearSelects.length || !fullItems.length) {
            return;
        }

        var years = Array.from(new Set(fullItems.map(function (item) {
            var d = item.getAttribute('data-completion-date') || '';
            var m = d.match(/(\d{4})/);
            return m ? m[1] : null;
        }).filter(Boolean))).sort(function (a, b) {
            return b - a;
        });

        function jumpToYear(y, activeSelect) {
            // Render every batch so the target is guaranteed to be in the DOM.
            while (!allBatchesRendered) {
                renderNextBatch();
            }

            // Pick the list that is actually visible. At narrow widths the
            // full-res list is display: none and the mobile-res list shows
            // instead, so scrolling to a full-res item's position would land
            // near the top of the page.
            var visibleList = fullList.offsetParent !== null ? fullList : mobileList;
            var visibleItems = visibleList === fullList ? fullItems : mobileItems;

            // The list is newest-first, so pick the earliest-dated entry of
            // the chosen year (the "first date" of that year), not just the
            // first match in DOM order.
            var matches = visibleItems.filter(function (item) {
                var d = item.getAttribute('data-completion-date') || '';
                var m = d.match(/(\d{4})/);
                return m && m[1] === y;
            });

            var target = null;
            var targetTime = 0;
            matches.forEach(function (item) {
                var itemTime = new Date(item.getAttribute('data-completion-date') || '').getTime();
                if (isNaN(itemTime)) {
                    return;
                }
                if (!target || itemTime < targetTime) {
                    target = item;
                    targetTime = itemTime;
                }
            });

            if (!target) {
                return;
            }

            // Make sure the sticky rail is showing before we move the page.
            chronology.setAttribute('data-visible', 'true');

            // Force a layout flush so the rail's transitioned height is
            // reflected before we measure it.
            void chronology.offsetHeight;

            // Position the target just below the sticky chronology rail.
            var railHeight = chronology.offsetHeight || 80;
            var top = target.getBoundingClientRect().top + window.scrollY - railHeight - 12;

            window.scrollTo({
                top: top,
                behavior: reducedMotion.matches ? 'instant' : 'smooth'
            });

            // Update the sticky rail to reflect where we landed.
            setChronology(target);

            // Briefly flash the target so the eye lands on it.
            target.classList.add('is-jump-target');
            setTimeout(function () {
                target.classList.remove('is-jump-target');
            }, 1000);

            // Keep the other select in sync.
            yearSelects.forEach(function (s) {
                if (s !== activeSelect) {
                    s.value = y;
                }
            });
        }

        yearSelects.forEach(function (select) {
            years.forEach(function (y) {
                var opt = document.createElement('option');
                opt.value = y;
                opt.textContent = y;
                select.appendChild(opt);
            });

            select.onchange = function () {
                var y = select.value;
                if (!y) {
                    return;
                }
                jumpToYear(y, select);
            };
        });
    })();

    window.__renderAll = function () {
        while (!allBatchesRendered) {
            renderNextBatch();
        }
    };

    window.addEventListener('scroll', requestScrollFrame, { passive: true });
    window.addEventListener('resize', requestScrollFrame);
})();
