
(function () {
    'use strict';

    const nav = document.getElementById('navbar');
    const hero = document.querySelector('#content > .page-top');

    const CONTENT_SELECTOR =
        '#content > section, .about-shell section, .consumption-list .item.info, .game, .log-card, .song';

    let contentElements = [];

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');

    let framePending = false;

    // -----------------------------------------------------------------------
    // Animated rain background
    // -----------------------------------------------------------------------
    function startRainCanvas(container) {
        if (reducedMotion.matches) {
            return;
        }

        container = container || document.body;
        const isBody = container === document.body;

        const canvas = document.createElement('canvas');
        canvas.className = isBody ? 'rain-bg' : 'rain-bg rain-bg--hero';
        canvas.id = isBody ? 'rain-bg' : 'rain-bg-hero';
        canvas.setAttribute('aria-hidden', 'true');

        container.insertBefore(canvas, container.firstChild);

        if (!isBody) {
            canvas.style.position = 'absolute';
            canvas.style.inset = '0';
            canvas.style.zIndex = '0';
        }

        const context = canvas.getContext('2d');

        if (!context) {
            return;
        }

        let drops = [];
        let maxDrops = 12;
        let nextSpawn = 0;
        let frame = 0;
        let mouseX = 0.5;
        let mouseY = 0.5;
        let scrollVelocity = 0;
        let lastScrollY = window.scrollY;
        let lastScrollTime = performance.now();

        function onPointerMove(event) {
            mouseX = event.clientX / Math.max(window.innerWidth, 1);
            mouseY = event.clientY / Math.max(window.innerHeight, 1);
        }

        function onScroll() {
            const now = performance.now();
            const dt = Math.max(now - lastScrollTime, 16);
            const dy = window.scrollY - lastScrollY;
            const velocity = dy / dt;

            scrollVelocity = scrollVelocity * 0.85 + velocity * 0.15;

            lastScrollY = window.scrollY;
            lastScrollTime = now;
        }

        window.addEventListener('pointermove', onPointerMove, {
            passive: true
        });

        window.addEventListener('scroll', onScroll, {
            passive: true
        });

        function resize() {
            if (isBody) {
                canvas.width = window.innerWidth;
                canvas.height = window.innerHeight;
            } else {
                canvas.width =
                    container.clientWidth ||
                    container.offsetWidth ||
                    window.innerWidth;

                canvas.height =
                    container.clientHeight ||
                    container.offsetHeight ||
                    320;
            }

            maxDrops = Math.min(
                14,
                Math.max(6, Math.round(canvas.width / 64))
            );

            drops = [];
            nextSpawn = performance.now();
        }

        function spawnBurst() {
            const burstSize = 1 + Math.floor(Math.random() * 3);
            const baseX = Math.random() * canvas.width;

            for (let i = 0; i < burstSize; i++) {
                if (drops.length >= maxDrops) {
                    break;
                }

                drops.push({
                    x: baseX + (Math.random() - 0.5) * 40,
                    y: -20 - Math.random() * 30,
                    length: 14 + Math.random() * 10,
                    speed: 3.5 + Math.random() * 3.5,
                    opacity: 0.15 + Math.random() * 0.22,
                    drift: (Math.random() - 0.5) * 0.6
                });
            }
        }

        function draw() {
            context.clearRect(0, 0, canvas.width, canvas.height);

            context.lineCap = 'round';
            context.lineWidth = 1;

            const now = performance.now();

            if (now >= nextSpawn) {
                spawnBurst();
                nextSpawn = now + 300 + Math.random() * 900;
            }

            const angle = (mouseX - 0.5) * 0.9;

            const speedBoost =
                1 + Math.min(Math.abs(scrollVelocity) * 0.6, 2.0);

            for (let i = drops.length - 1; i >= 0; i--) {
                const drop = drops[i];

                const dx = Math.sin(angle) * drop.length * 0.5;
                const x2 = drop.x + dx;
                const y2 = drop.y + drop.length;

                context.strokeStyle =
                    'rgba(195, 225, 248, ' +
                    drop.opacity.toFixed(3) +
                    ')';

                context.lineWidth = 1.2;

                context.beginPath();
                context.moveTo(drop.x, drop.y);
                context.lineTo(x2, y2);
                context.stroke();

                drop.y += drop.speed * speedBoost;

                drop.x += drop.drift + Math.sin(angle) * 0.6;
                drop.x += (mouseX - 0.5) * 0.08;

                if (drop.y > canvas.height + drop.length) {
                    drops.splice(i, 1);
                } else if (drop.x < -10 || drop.x > canvas.width + 10) {
                    drops.splice(i, 1);
                }
            }

            scrollVelocity *= 0.92;

            frame = window.requestAnimationFrame(draw);
        }

        resize();
        draw();

        window.addEventListener('resize', resize);

        reducedMotion.addEventListener('change', function () {
            if (reducedMotion.matches) {
                window.cancelAnimationFrame(frame);

                window.removeEventListener(
                    'pointermove',
                    onPointerMove
                );

                window.removeEventListener(
                    'scroll',
                    onScroll
                );

                window.removeEventListener('resize', resize);

                if (canvas.parentNode) {
                    canvas.parentNode.removeChild(canvas);
                }
            }
        });
    }

    // -----------------------------------------------------------------------
    // Initialize rain
    //
    // FIX: Removed the Network Information API requirement.
    // Firefox may not expose navigator.connection.
    // startRainCanvas() already respects reduced-motion preferences.
    // -----------------------------------------------------------------------
    document.body.classList.add('fast-network');

    startRainCanvas(document.body);

    if (document.body.classList.contains('home-page')) {
        const hero = document.querySelector('#content > .page-top');

        if (hero) {
            startRainCanvas(hero);
        }
    }

    // -----------------------------------------------------------------------
    // Hero shine effect
    // -----------------------------------------------------------------------
    function setupShine(hero) {
        if (!hero || hero.querySelector('.page-top__shine')) {
            return;
        }

        const shine = document.createElement('div');
        shine.className = 'page-top__shine';

        hero.appendChild(shine);

        hero.addEventListener('pointermove', function (event) {
            const rect = hero.getBoundingClientRect();

            const x = ((event.clientX - rect.left) / rect.width) * 100;
            const y = ((event.clientY - rect.top) / rect.height) * 100;

            hero.style.setProperty('--shine-x', x.toFixed(1) + '%');
            hero.style.setProperty('--shine-y', y.toFixed(1) + '%');
        });

        hero.addEventListener('pointerleave', function () {
            hero.style.setProperty('--shine-x', '50%');
            hero.style.setProperty('--shine-y', '40%');
        });
    }

    document.querySelectorAll('#content > .page-top').forEach(setupShine);

    // -----------------------------------------------------------------------
    // Hero scroll animation
    // -----------------------------------------------------------------------
    function clamp01(value) {
        return Math.min(1, Math.max(0, value));
    }

    function resetHero() {
        if (!hero) {
            return;
        }

        hero.style.removeProperty('--hero-progress');
        hero.style.removeProperty('--hero-shift');
        hero.style.removeProperty('--hero-opacity');
    }

    function refreshContentElements() {
        contentElements = Array.from(
            document.querySelectorAll(CONTENT_SELECTOR)
        );
    }

    function applyContentParallax() {
        refreshContentElements();

        if (reducedMotion.matches) {
            contentElements.forEach(function (el) {
                el.style.removeProperty('--section-shift');
                el.style.removeProperty('--section-opacity');
            });

            return;
        }

        const vh = window.innerHeight || 1;

        contentElements.forEach(function (el) {
            if (!el.getClientRects().length) {
                return;
            }

            const rect = el.getBoundingClientRect();

            if (rect.width === 0 && rect.height === 0) {
                return;
            }

            const center = rect.top + rect.height / 2;
            const half = vh / 2;
            const span = half + rect.height * 0.5;

            const distFromCenter = Math.abs(center - half);
            const deadZone = span * 0.2;
            const fadeRange = span - deadZone;

            let edge = 0;

            if (fadeRange > 0 && distFromCenter > deadZone) {
                edge = (distFromCenter - deadZone) / fadeRange;
                edge = Math.min(1, Math.max(0, edge));
            }

            const sign = center >= half ? 1 : -1;
            const shift = 0;
            const opacity = 1 - edge * 0.4;

            el.style.setProperty(
                '--section-shift',
                shift.toFixed(2) + 'px'
            );

            el.style.setProperty(
                '--section-opacity',
                opacity.toFixed(3)
            );
        });
    }

    function paint() {
        framePending = false;

        if (nav) {
            nav.classList.toggle('is-scrolled', window.scrollY > 24);
        }

        applyContentParallax();

        if (!hero) {
            return;
        }

        if (reducedMotion.matches) {
            resetHero();
            return;
        }

        const rect = hero.getBoundingClientRect();
        const travel = Math.max(rect.height, 1);

        const progress = clamp01(-rect.top / travel);

        hero.style.setProperty(
            '--hero-progress',
            progress.toFixed(4)
        );

        hero.style.setProperty(
            '--hero-shift',
            (progress * -36).toFixed(1) + 'px'
        );

        hero.style.setProperty(
            '--hero-opacity',
            (1 - progress * 0.9).toFixed(3)
        );
    }

    function requestPaint() {
        if (framePending) {
            return;
        }

        framePending = true;

        window.requestAnimationFrame(paint);
    }

    // -----------------------------------------------------------------------
    // Scroll-triggered reveals
    // -----------------------------------------------------------------------
    const REVEAL_SELECTOR =
        '.tile, .book-section, #content > section, .contact-card, .game, .log-card, .song, .about-shell section';

    function setupReveals() {
        const root = document.documentElement;

        if (!root.classList.contains('js-motion')) {
            return;
        }

        const targets = Array.from(document.querySelectorAll(REVEAL_SELECTOR));

        function reveal(target) {
            target.classList.add('is-revealed');
        }

        // The inline head script only adds js-motion when the API exists, but
        // keep this defensive for older browsers and reduced-motion users.
        if (reducedMotion.matches || typeof IntersectionObserver === 'undefined') {
            targets.forEach(reveal);
            root.classList.add('motion-ready');

            return;
        }

        const observer = new IntersectionObserver(
            function (entries) {
                entries.forEach(function (entry) {
                    if (!entry.isIntersecting) {
                        return;
                    }

                    reveal(entry.target);
                    observer.unobserve(entry.target);
                });
            },
            {
                rootMargin: '0px 0px -8% 0px',
                threshold: 0
            }
        );

        targets.forEach(function (target) {
            observer.observe(target);
        });

        reducedMotion.addEventListener('change', function () {
            if (!reducedMotion.matches) {
                return;
            }

            targets.forEach(reveal);
            observer.disconnect();
        });

        root.classList.add('motion-ready');
    }

    setupReveals();

    // -----------------------------------------------------------------------
    // Pointer tilt
    // -----------------------------------------------------------------------
    const TILT_SELECTOR =
        '.tile, .contact-card, .game, .item.info, #content > section, .about-shell section, .log-card, .song';

    let tiltTarget = null;
    let tiltFrame = 0;
    let pointerX = 0;
    let pointerY = 0;

    function canTilt() {
        return finePointer.matches && !reducedMotion.matches;
    }

    function resetTilt(target) {
        if (!target) {
            return;
        }

        target.classList.remove('is-tilting');

        target.style.removeProperty('--tilt-x');
        target.style.removeProperty('--tilt-y');
    }

    function findTiltTarget(node) {
        if (!node || !node.closest) {
            return null;
        }

        return node.closest(TILT_SELECTOR);
    }

    function onPointerOver(event) {
        if (!canTilt()) {
            return;
        }

        const target = findTiltTarget(event.target);

        if (!target || target === tiltTarget) {
            return;
        }

        resetTilt(tiltTarget);

        tiltTarget = target;

        tiltTarget.classList.add('is-tilting');
    }

    function onPointerMove(event) {
        if (!canTilt() || !tiltTarget) {
            return;
        }

        pointerX = event.clientX;
        pointerY = event.clientY;

        if (tiltFrame) {
            return;
        }

        tiltFrame = window.requestAnimationFrame(function () {
            tiltFrame = 0;

            if (!tiltTarget) {
                return;
            }

            const rect = tiltTarget.getBoundingClientRect();

            if (!rect.width || !rect.height) {
                return;
            }

            const max = tiltTarget.classList.contains('tile')
                ? 0.6
                : 0.5;

            const x = (pointerX - rect.left) / rect.width - 0.5;
            const y = (pointerY - rect.top) / rect.height - 0.5;

            tiltTarget.style.setProperty(
                '--tilt-y',
                (x * max).toFixed(2) + 'deg'
            );

            tiltTarget.style.setProperty(
                '--tilt-x',
                (-y * max).toFixed(2) + 'deg'
            );
        });
    }

    function onPointerOut(event) {
        if (!tiltTarget) {
            return;
        }

        if (
            event.relatedTarget &&
            tiltTarget.contains(event.relatedTarget)
        ) {
            return;
        }

        resetTilt(tiltTarget);

        tiltTarget = null;
    }

    function resetTiltState() {
        resetTilt(tiltTarget);
        tiltTarget = null;
    }

    function onMediaChange() {
        resetTiltState();
        resetHero();
        requestPaint();
    }

    if (reducedMotion.addEventListener) {
        reducedMotion.addEventListener('change', onMediaChange);
        finePointer.addEventListener('change', onMediaChange);
    }

    document.addEventListener('pointerover', onPointerOver, {
        passive: true
    });

    document.addEventListener('pointermove', onPointerMove, {
        passive: true
    });

    document.addEventListener('pointerout', onPointerOut, {
        passive: true
    });

    window.addEventListener('scroll', requestPaint, {
        passive: true
    });

    window.addEventListener('resize', function () {
        refreshContentElements();
        requestPaint();
    });

    refreshContentElements();
    paint();
})();
