
(function () {
    'use strict';

    const nav = document.getElementById('navbar');
    const hero = document.querySelector('#content > .page-top');

    const CONTENT_SELECTOR =
        '#content > section, .about-shell section, .games-list .game, .log-card, .song';

    let contentElements = [];

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');

    let framePending = false;
    let opacityRevealsEnabled = true;
    let scrollSamples = [{
        position: window.scrollY,
        time: performance.now()
    }];
    let rainMultiplier = 1;
    let weatherEffectScene = null;
    let weatherEffectStops = [];
    let rainBoostUntil = 0;
    let matrixRainCanvas = null;
    let matrixRainHeroCanvas = null;
    let matrixRainHero = null;
    let matrixRainFrame = 0;
    let matrixRainStreams = [];
    let matrixRainLastFrame = 0;
    const FAST_SCROLL_THRESHOLD = 2;
    const MATRIX_RAIN_START = 23 * 60 + 30;
    const MATRIX_RAIN_END = 3 * 60 + 30;

    // -----------------------------------------------------------------------
    // Scene memory (timelapse + continuity)
    // -----------------------------------------------------------------------
    const SCENE_STORAGE_KEY = 'asarav:lastScene';

    function getStoredScene() {
        try {
            const raw = window.localStorage.getItem(SCENE_STORAGE_KEY);
            if (!raw) {
                return null;
            }
            const parsed = JSON.parse(raw);
            if (!parsed || !parsed.scene || !sceneImages[parsed.scene]) {
                return null;
            }
            return parsed;
        } catch (error) {
            return null;
        }
    }

    function storeScene(scene, room) {
        try {
            let existing = {};
            try {
                existing = JSON.parse(window.localStorage.getItem(SCENE_STORAGE_KEY) || '{}');
            } catch (e) {
                existing = {};
            }
            window.localStorage.setItem(SCENE_STORAGE_KEY, JSON.stringify({
                scene: scene,
                room: room || (window.location.pathname || '/'),
                timestamp: Date.now(),
                lastTransition: existing.lastTransition || 0
            }));
        } catch (error) {
            // Ignore storage failures (private mode, quota, etc.).
        }
    }

    const TIME_PHASES = ['night', 'sunrise', 'day', 'sunset'];

    function timePhaseFromScene(scene) {
        if (scene === 'sunrise') {
            return 'sunrise';
        }
        if (scene === 'sunset') {
            return 'sunset';
        }
        if (scene === 'night') {
            return 'night';
        }
        return 'day';
    }

    function phaseSteps(fromPhase, toPhase) {
        const fromIndex = TIME_PHASES.indexOf(fromPhase);
        const toIndex = TIME_PHASES.indexOf(toPhase);
        if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) {
            return [toPhase];
        }
        const steps = [];
        let index = fromIndex;
        while (index !== toIndex) {
            index = (index + 1) % TIME_PHASES.length;
            steps.push(TIME_PHASES[index]);
        }
        return steps;
    }

    function runTimelapse(oldScene, newScene, oldRoom) {
        if (!oldScene || !sceneImages[oldScene] || !sceneImages[newScene] ||
            oldScene === newScene || reducedMotion.matches) {
            return Promise.resolve();
        }

        const stored = getStoredScene();
        const lastTransition = stored && stored.lastTransition ? stored.lastTransition : 0;
        const sinceLastTransition = Date.now() - lastTransition;

        // Only transition if it has been a while since the last one, so
        // reloads and short revisits do not replay the same crossfade.
        if (sinceLastTransition < 1800000) {
            return Promise.resolve();
        }

        const duration = 4500;

        const imageRoot = document.body.dataset.imageRoot || '/src/images/';
        const oldImages = sceneImages[oldScene];
        const newImages = sceneImages[newScene];

        // Preload the new scene image before starting the crossfade.
        function preload(src) {
            return new Promise(function (resolve) {
                const img = new Image();
                img.onload = function () { resolve(); };
                img.onerror = function () { resolve(); };
                img.src = src;
                // Resolve after 1.5s even if not loaded.
                window.setTimeout(resolve, 1500);
            });
        }

        const preloadPromise = preload(imageRoot + newImages.background);

        return preloadPromise.then(function () {
            return new Promise(function (resolve) {
                const overlay = document.createElement('div');
                overlay.className = 'scene-timelapse';
                overlay.style.backgroundImage =
                    'linear-gradient(180deg, rgba(7, 11, 16, 0.58) 0%, rgba(7, 11, 16, 0.86) 42%, rgba(7, 11, 16, 0.98) 100%), ' +
                    'radial-gradient(ellipse at 78% 0%, rgba(71, 111, 142, 0.26), transparent 52%), ' +
                    'radial-gradient(ellipse at 8% 30%, rgba(38, 62, 82, 0.2), transparent 50%), ' +
                    'url("' + imageRoot + oldImages.background + '")';
                overlay.style.backgroundSize = 'auto, auto, auto, cover';
                overlay.style.backgroundPosition = 'center, center, center, center';
                overlay.style.backgroundAttachment = 'fixed, fixed, fixed, fixed';
                document.body.appendChild(overlay);

                // Hero crossfade (home page only).
                const hero = document.querySelector('#content > .page-top.home-hero');
                let heroOverlay = null;
                if (hero && oldImages.hero) {
                    heroOverlay = document.createElement('div');
                    heroOverlay.className = 'scene-timelapse scene-timelapse--hero';
                    heroOverlay.style.backgroundImage =
                        'linear-gradient(90deg, rgba(7, 11, 16, 0.76) 0%, rgba(7, 11, 16, 0.42) 55%, rgba(7, 11, 16, 0.7) 100%), ' +
                        'linear-gradient(180deg, rgba(7, 11, 16, 0.24) 0%, rgba(7, 11, 16, 0.78) 100%), ' +
                        'url("' + imageRoot + oldImages.hero + '")';
                    heroOverlay.style.backgroundSize = 'cover';
                    heroOverlay.style.backgroundPosition = 'center';
                    hero.insertBefore(heroOverlay, hero.firstChild);
                }

                // Non-blocking progress indicator.
                const progress = document.createElement('div');
                progress.className = 'scene-timelapse-progress';
                document.body.appendChild(progress);

                // Force reflow.
                void overlay.offsetWidth;
                void progress.offsetWidth;

                overlay.style.transition = 'opacity ' + duration + 'ms ease';
                progress.style.transition = 'transform ' + duration + 'ms linear';

                requestAnimationFrame(function () {
                    overlay.style.opacity = '0';
                    progress.style.transform = 'scaleX(1)';
                });

                window.setTimeout(function () {
                    if (overlay.parentNode) {
                        overlay.parentNode.removeChild(overlay);
                    }
                    if (progress.parentNode) {
                        progress.parentNode.removeChild(progress);
                    }
                    if (heroOverlay && heroOverlay.parentNode) {
                        heroOverlay.parentNode.removeChild(heroOverlay);
                    }
                    // Record that a transition just ran.
                    try {
                        const current = JSON.parse(window.localStorage.getItem(SCENE_STORAGE_KEY) || '{}');
                        current.lastTransition = Date.now();
                        window.localStorage.setItem(SCENE_STORAGE_KEY, JSON.stringify(current));
                    } catch (error) {
                        // Ignore.
                    }
                    resolve();
                }, duration + 100);
            });
        });
    }

    // -----------------------------------------------------------------------
    // Weather effects
    // -----------------------------------------------------------------------
    function startWeatherCanvas(container, type) {
        if (reducedMotion.matches) {
            return function () {};
        }

        const isBody = container === document.body;
        const canvas = document.createElement('canvas');
        canvas.className = 'weather-bg weather-bg--' + type +
            (isBody ? ' weather-bg--global' : '');
        canvas.setAttribute('aria-hidden', 'true');
        container.insertBefore(canvas, container.firstChild);
        canvas.style.position = isBody ? 'fixed' : 'absolute';
        canvas.style.inset = '0';
        canvas.style.zIndex = isBody ? '-1' : '0';

        const context = canvas.getContext('2d');

        if (!context) {
            canvas.remove();
            return function () {};
        }

        let particles = [];
        let maxParticles = 0;
        let nextSpawn = 0;
        let frame = 0;
        let running = true;
        let mouseX = 0.5;
        let scrollVelocity = 0;
        let lastScrollY = window.scrollY;
        let lastScrollTime = performance.now();

        const nowHour = new Date().getHours();
        const isNight = nowHour >= 19 || nowHour < 6;
        const rainIntensity = isNight ? 1.4 : 0.65;

        function onPointerMove(event) {
            mouseX = event.clientX / Math.max(window.innerWidth, 1);
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

        function stop() {
            if (!running) {
                return;
            }

            running = false;
            window.cancelAnimationFrame(frame);
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('scroll', onScroll);
            window.removeEventListener('resize', resize);
            reducedMotion.removeEventListener('change', onMotionPreferenceChange);
            canvas.remove();
        }

        function onMotionPreferenceChange() {
            if (reducedMotion.matches) {
                stop();
            }
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

            if (type === 'snow') {
                maxParticles = Math.min(
                    360,
                    Math.max(30, Math.round(
                        canvas.width / 13 * canvas.height / 320
                    ))
                );
            } else if (type === 'stars') {
                maxParticles = Math.min(
                    360,
                    Math.max(35, Math.round(canvas.width * canvas.height / 4000))
                );
            } else {
                maxParticles = Math.min(
                    96,
                    Math.max(4, Math.round(
                        canvas.width / 64 * rainIntensity * rainMultiplier *
                        Math.max(1, canvas.height / 320)
                    ))
                );
            }

            particles = [];

            if (type === 'snow') {
                for (let i = 0; i < maxParticles; i++) {
                    spawnSnowflake(true);
                }
            } else if (type === 'stars') {
                for (let i = 0; i < maxParticles; i++) {
                    spawnStar();
                }
            }

            nextSpawn = performance.now();
        }

        function spawnRainBurst() {
            const boosted = performance.now() < rainBoostUntil;
            const burstSize = 1 + Math.floor(Math.random() * Math.min(5, (boosted ? 4 : (isNight ? 3 : 2)) * rainMultiplier));
            const baseX = Math.random() * canvas.width;

            for (let i = 0; i < burstSize; i++) {
                if (particles.length >= maxParticles) {
                    break;
                }

                particles.push({
                    x: baseX + (Math.random() - 0.5) * 40,
                    y: -20 - Math.random() * 30,
                    length: 14 + Math.random() * 10,
                    speed: 3.5 + Math.random() * 3.5,
                    opacity: ((boosted ? 0.26 : (isNight ? 0.18 : 0.12)) + Math.random() * (boosted ? 0.2 : (isNight ? 0.28 : 0.16))),
                    drift: (Math.random() - 0.5) * 0.6
                });
            }
        }

        function spawnSnowflake(randomHeight) {
            particles.push({
                x: Math.random() * canvas.width,
                y: randomHeight ? Math.random() * canvas.height : -4 - Math.random() * 12,
                radius: 0.7 + Math.random() * 2.2,
                speed: 0.35 + Math.random() * 1.25,
                drift: (Math.random() - 0.5) * 0.38,
                sway: 0.25 + Math.random() * 0.9,
                phase: Math.random() * Math.PI * 2,
                opacity: 0.32 + Math.random() * 0.55
            });
        }

        function spawnStar() {
            particles.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                radius: 0.45 + Math.random() * 1.15,
                opacity: 0.28 + Math.random() * 0.62,
                phase: Math.random() * Math.PI * 2,
                twinkleSpeed: 0.0007 + Math.random() * 0.0014
            });
        }

        function draw() {
            if (!running) {
                return;
            }

            context.clearRect(0, 0, canvas.width, canvas.height);
            const now = performance.now();
            const delta = Math.min((now - (draw.lastTime || now)) / 16.67, 2.5);
            draw.lastTime = now;

            if (type === 'rain') {
                context.lineCap = 'round';
                context.lineWidth = 1.2;

                if (now >= nextSpawn) {
                    spawnRainBurst();
                    const boosted = now < rainBoostUntil;
                    const heightScale = Math.max(1, canvas.height / 320);
                    nextSpawn = now + ((boosted ? 120 : (isNight ? 200 : 400)) +
                        Math.random() * (boosted ? 200 : (isNight ? 600 : 1100))) /
                        (rainMultiplier * heightScale);
                }

                const angle = (mouseX - 0.5) * 0.9;
                const speedBoost = 1 + Math.min(Math.abs(scrollVelocity) * 0.6, 2.0);

                for (let i = particles.length - 1; i >= 0; i--) {
                    const drop = particles[i];
                    const x2 = drop.x + Math.sin(angle) * drop.length * 0.5;

                    context.strokeStyle = 'rgba(195, 225, 248, ' + drop.opacity.toFixed(3) + ')';
                    context.beginPath();
                    context.moveTo(drop.x, drop.y);
                    context.lineTo(x2, drop.y + drop.length);
                    context.stroke();

                    drop.y += drop.speed * speedBoost * delta;
                    drop.x += drop.drift + Math.sin(angle) * 0.6 + (mouseX - 0.5) * 0.08;

                    if (drop.y > canvas.height + drop.length || drop.x < -10 || drop.x > canvas.width + 10) {
                        particles.splice(i, 1);
                    }
                }
            } else if (type === 'snow') {
                const wind = (mouseX - 0.5) * 0.55 + Math.sin(now * 0.00035) * 0.16;

                if (particles.length < maxParticles && now >= nextSpawn) {
                    spawnSnowflake(false);
                    nextSpawn = now + 90 + Math.random() * 180;
                }

                for (let i = particles.length - 1; i >= 0; i--) {
                    const flake = particles[i];
                    const sway = Math.sin(now * 0.0007 + flake.phase) * flake.sway;

                    flake.y += flake.speed * delta;
                    flake.x += (flake.drift + sway + wind) * delta;

                    context.fillStyle = 'rgba(255, 255, 255, ' + flake.opacity.toFixed(3) + ')';
                    context.shadowColor = 'rgba(255, 255, 255, 0.7)';
                    context.shadowBlur = flake.radius * 2.2;
                    context.beginPath();
                    context.ellipse(
                        flake.x,
                        flake.y,
                        flake.radius * 0.82,
                        flake.radius,
                        sway * 0.08,
                        0,
                        Math.PI * 2
                    );
                    context.fill();

                    if (flake.y > canvas.height + 5 || flake.x < -8 || flake.x > canvas.width + 8) {
                        particles.splice(i, 1);
                    }
                }
            } else {
                particles.forEach(function (star) {
                    const twinkle = 0.25 + (Math.sin(now * star.twinkleSpeed + star.phase) + 1) * 0.36;
                    const opacity = star.opacity * twinkle;

                    context.fillStyle = 'rgba(230, 243, 255, ' + opacity.toFixed(3) + ')';
                    context.shadowColor = 'rgba(196, 224, 255, ' + (opacity * 0.65).toFixed(3) + ')';
                    context.shadowBlur = star.radius * 3;
                    context.beginPath();
                    context.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
                    context.fill();
                });
                context.shadowBlur = 0;
            }

            scrollVelocity *= 0.92;
            frame = window.requestAnimationFrame(draw);
        }

        resize();
        window.addEventListener('resize', resize);
        reducedMotion.addEventListener('change', onMotionPreferenceChange);
        draw();

        return stop;
    }

    function isMatrixRainTime() {
        const now = new Date();
        const minutes = now.getHours() * 60 + now.getMinutes();

        return minutes >= MATRIX_RAIN_START || minutes < MATRIX_RAIN_END;
    }

    function stopMatrixRain() {
        if (matrixRainFrame) {
            window.cancelAnimationFrame(matrixRainFrame);
            matrixRainFrame = 0;
        }

        if (matrixRainCanvas) {
            matrixRainCanvas.remove();
            matrixRainCanvas = null;
        }

        if (matrixRainHeroCanvas) {
            matrixRainHeroCanvas.remove();
            matrixRainHeroCanvas = null;
            matrixRainHero = null;
        }

        matrixRainStreams = [];
        matrixRainLastFrame = 0;
        document.removeEventListener('visibilitychange', onMatrixRainVisibilityChange);
        window.removeEventListener('resize', resizeMatrixRain);
    }

    function resizeMatrixRain() {
        if (!matrixRainCanvas) {
            return;
        }

        matrixRainCanvas.width = window.innerWidth;
        matrixRainCanvas.height = window.innerHeight;
        if (matrixRainHeroCanvas && matrixRainHero) {
            matrixRainHeroCanvas.width = matrixRainHero.clientWidth;
            matrixRainHeroCanvas.height = matrixRainHero.clientHeight;
        }

        const columnCount = Math.min(120, Math.ceil(matrixRainCanvas.width / 14));
        matrixRainStreams = [];

        for (let column = 0; column < columnCount;) {
            const groupWidth = Math.random() < 0.14
                ? Math.min(2 + Math.floor(Math.random() * 3), columnCount - column)
                : 1;
            const columns = Array.from({ length: groupWidth }, function (_, offset) {
                return {
                    x: (column + offset) * 14 + 7,
                    offset: Math.random() * (groupWidth > 1 ? 5 : 14),
                    length: 5 + Math.floor(Math.random() * 12),
                    glyphs: Array.from({ length: 16 }, randomMatrixGlyph)
                };
            });

            matrixRainStreams.push({
                y: Math.random() * matrixRainCanvas.height - matrixRainCanvas.height,
                speed: 1.2 + Math.random() * 1.4,
                length: Math.max.apply(null, columns.map(function (item) {
                    return item.length;
                })),
                active: Math.random() < (groupWidth > 1 ? 0.62 : 0.32),
                columns: columns
            });

            column += groupWidth;
        }
    }

    function randomMatrixGlyph() {
        const choice = Math.random();
        const glyphs = choice < 0.4
            ? 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワン'
            : choice < 0.8
                ? '0123456789'
                : 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        return glyphs.charAt(Math.floor(Math.random() * glyphs.length));
    }

    function drawMatrixRain(timestamp) {
        matrixRainFrame = 0;

        if (!matrixRainCanvas || document.hidden) {
            return;
        }

        if (timestamp - matrixRainLastFrame < 32) {
            matrixRainFrame = window.requestAnimationFrame(drawMatrixRain);
            return;
        }

        const context = matrixRainCanvas.getContext('2d');

        if (!context) {
            stopMatrixRain();
            return;
        }

        const delta = Math.min((timestamp - (matrixRainLastFrame || timestamp)) / 16.67, 3);
        matrixRainLastFrame = timestamp;
        context.clearRect(0, 0, matrixRainCanvas.width, matrixRainCanvas.height);
        context.font = '14px "IBM Plex Mono", monospace';
        context.textAlign = 'center';

        matrixRainStreams.forEach(function (group) {
            if (!group.active) {
                return;
            }

            group.columns.forEach(function (column) {
                const head = group.y + column.offset;

                for (let tail = column.length - 1; tail >= 0; tail--) {
                    const y = head - tail * 18;

                    if (y < -18 || y > matrixRainCanvas.height + 18) {
                        continue;
                    }

                    const isHead = tail === 0;
                    const alpha = 0.035 + (1 - tail / column.length) * 0.24;
                    context.fillStyle = isHead
                        ? 'rgba(190, 255, 190, 0.78)'
                        : 'rgba(35, 205, 91, ' + alpha.toFixed(3) + ')';
                    context.fillText(column.glyphs[tail], column.x, y);

                    if (Math.random() < 0.035) {
                        column.glyphs[tail] = randomMatrixGlyph();
                    }
                }
            });

            group.y += group.speed * delta;

            if (group.y - group.length * 18 > matrixRainCanvas.height) {
                group.y = -Math.random() * matrixRainCanvas.height * 0.7;
                group.speed = 1.2 + Math.random() * 1.4;
                group.columns.forEach(function (column) {
                    column.length = 5 + Math.floor(Math.random() * 12);
                });
                group.length = Math.max.apply(null, group.columns.map(function (column) {
                    return column.length;
                }));
                group.active = Math.random() < (group.columns.length > 1 ? 0.62 : 0.32);
            }
        });

        if (matrixRainHeroCanvas && matrixRainHero) {
            const rect = matrixRainHero.getBoundingClientRect();
            const left = Math.max(0, rect.left);
            const top = Math.max(0, rect.top);
            const right = Math.min(matrixRainCanvas.width, rect.right);
            const bottom = Math.min(matrixRainCanvas.height, rect.bottom);
            const heroContext = matrixRainHeroCanvas.getContext('2d');

            if (heroContext) {
                heroContext.clearRect(
                    0,
                    0,
                    matrixRainHeroCanvas.width,
                    matrixRainHeroCanvas.height
                );

                if (right > left && bottom > top) {
                    heroContext.drawImage(
                        matrixRainCanvas,
                        left,
                        top,
                        right - left,
                        bottom - top,
                        left - rect.left,
                        top - rect.top,
                        right - left,
                        bottom - top
                    );
                }
            }
        }

        matrixRainFrame = window.requestAnimationFrame(drawMatrixRain);
    }

    function onMatrixRainVisibilityChange() {
        if (document.hidden) {
            if (matrixRainFrame) {
                window.cancelAnimationFrame(matrixRainFrame);
                matrixRainFrame = 0;
            }
        } else if (matrixRainCanvas && !matrixRainFrame) {
            matrixRainFrame = window.requestAnimationFrame(drawMatrixRain);
        }
    }

    function syncMatrixRain() {
        const shouldRun = !reducedMotion.matches && isMatrixRainTime();

        if (!shouldRun) {
            stopMatrixRain();
            return;
        }

        if (matrixRainCanvas) {
            return;
        }

        matrixRainCanvas = document.createElement('canvas');
        matrixRainCanvas.className = 'matrix-rain matrix-rain--global';
        matrixRainCanvas.setAttribute('aria-hidden', 'true');
        document.body.insertBefore(matrixRainCanvas, document.body.firstChild);
        matrixRainHero = document.querySelector(
            '#content > .page-top.home-hero, #content > .page-top.about-hero'
        );

        if (matrixRainHero) {
            matrixRainHeroCanvas = document.createElement('canvas');
            matrixRainHeroCanvas.className = 'matrix-rain matrix-rain--hero';
            matrixRainHeroCanvas.setAttribute('aria-hidden', 'true');
            matrixRainHero.insertBefore(
                matrixRainHeroCanvas,
                matrixRainHero.firstChild
            );
        }

        resizeMatrixRain();
        document.addEventListener('visibilitychange', onMatrixRainVisibilityChange);
        window.addEventListener('resize', resizeMatrixRain, { passive: true });

        if (!document.hidden) {
            matrixRainFrame = window.requestAnimationFrame(drawMatrixRain);
        }
    }

    syncMatrixRain();
    window.setInterval(syncMatrixRain, 30000);
    reducedMotion.addEventListener('change', syncMatrixRain);

    // -----------------------------------------------------------------------
    // Weather particles remain off until a weather response confirms rain
    // or snow; the Konami rain surge only affects active rain.
    // -----------------------------------------------------------------------
    document.body.classList.add('fast-network');

    window.__boostRain = function (ms) {
        if (weatherEffectScene === 'rain') {
            rainBoostUntil = performance.now() + (ms || 3000);
        }
    };

    // -----------------------------------------------------------------------
    // Weather + time awareness
    // -----------------------------------------------------------------------
    const weatherDisplay = document.querySelector('.hero-weather');
    const fahrenheitRegions = ['BS', 'BZ', 'KY', 'FM', 'MH', 'PW', 'US', 'LR'];
    const temperatureLocales = Array.from(navigator.languages || []);
    temperatureLocales.push(
        navigator.language,
        Intl.DateTimeFormat().resolvedOptions().locale
    );
    let temperatureUnit = 'celsius';

    for (let i = 0; i < temperatureLocales.length; i++) {
        const locale = String(temperatureLocales[i] || '').replace(/_/g, '-');
        const region = locale.match(
            /^[a-z]{2,3}-(?:[a-z]{4}-)?([a-z]{2}|[0-9]{3})(?:-|$)/i
        );

        if (region) {
            temperatureUnit = fahrenheitRegions.indexOf(region[1].toUpperCase()) !== -1
                ? 'fahrenheit'
                : 'celsius';
            break;
        }
    }

    const temperatureUnitLabel = temperatureUnit === 'fahrenheit' ? 'F' : 'C';
    let weatherClock = null;
    const weatherIcon = weatherDisplay &&
        weatherDisplay.querySelector('[data-weather-icon]');
    const weatherIconMarkup = {
        day: '<circle cx="12" cy="12" r="3.5"/><path d="M12 2.5v2M12 19.5v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2.5 12h2m15 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/>',
        night: '<path d="M19.2 15.1A8 8 0 0 1 8.9 4.8 8.1 8.1 0 1 0 19.2 15.1Z"/>',
        sunrise: '<path d="M3 17h18M5 20h14M5.5 14a6.5 6.5 0 0 1 13 0M12 3v2m-6.4 2.6 1.4 1.4m12.8-1.4-1.4 1.4"/>',
        sunset: '<path d="M3 17h18M5 20h14M5.5 14a6.5 6.5 0 0 1 13 0M12 3v2m-6.4 2.6 1.4 1.4m12.8-1.4-1.4 1.4"/>',
        cloudy: '<path d="M20.2 17H7.3a4.3 4.3 0 1 1 .7-8.5 5.2 5.2 0 0 1 9.9 1.8 3.4 3.4 0 0 1 2.3 6.7Z"/>',
        cloudyNight: '<path d="M16.5 5.1a5.9 5.9 0 0 1-7.6-2A6.2 6.2 0 0 0 15 11m5.2 6H7.3a4.3 4.3 0 1 1 .7-8.5 5.2 5.2 0 0 1 9.9 1.8 3.4 3.4 0 0 1 2.3 6.7Z"/>',
        rain: '<path d="M20.2 15H7.3a4.3 4.3 0 1 1 .7-8.5 5.2 5.2 0 0 1 9.9 1.8 3.4 3.4 0 0 1 2.3 6.7ZM8 18l-1 2m6-2-1 2m6-2-1 2"/>',
        snow: '<path d="M20.2 14.5H7.3a4.3 4.3 0 1 1 .7-8.5 5.2 5.2 0 0 1 9.9 1.8 3.4 3.4 0 0 1 2.3 6.7ZM8 18h.01M13 18h.01M18 18h.01M8 21h.01M13 21h.01M18 21h.01"/>',
        storm: '<path d="M20.2 14.5H7.3a4.3 4.3 0 1 1 .7-8.5 5.2 5.2 0 0 1 9.9 1.8 3.4 3.4 0 0 1 2.3 6.7ZM13 15l-3 4h3l-1 3 4-5h-3l1-2Z"/>',
        fog: '<path d="M4 8h16M2.5 12h19M4 16h16M7 20h10"/>'
    };

    function updateWeatherIcon(data) {
        if (!weatherIcon) {
            return;
        }

        const code = data.code;
        const condition = String(data.condition || '').toLowerCase();
        const scene = getWeatherScene(data);
        const precipitation = getWeatherEffectScene(data);
        let icon = scene;

        if (/thunder/.test(condition) || [95, 96, 99].indexOf(code) !== -1) {
            icon = 'storm';
        } else if (precipitation === 'rain' || precipitation === 'snow') {
            icon = precipitation;
        } else if (/fog|mist/.test(condition) || [45, 48].indexOf(code) !== -1) {
            icon = 'fog';
        } else if (/cloud|overcast/.test(condition) ||
            [2, 3].indexOf(code) !== -1) {
            icon = scene === 'night' ? 'cloudyNight' : 'cloudy';
        }

        weatherIcon.dataset.weatherScene = icon;
        weatherIcon.innerHTML = weatherIconMarkup[icon] || weatherIconMarkup.day;
    }

    function weatherCodeToText(code) {
        const map = {
            0: 'Clear',
            1: 'Mainly clear',
            2: 'Partly cloudy',
            3: 'Overcast',
            45: 'Fog',
            48: 'Rime fog',
            51: 'Light drizzle',
            53: 'Drizzle',
            55: 'Dense drizzle',
            56: 'Freezing drizzle',
            57: 'Freezing drizzle',
            61: 'Light rain',
            63: 'Rain',
            65: 'Heavy rain',
            66: 'Freezing rain',
            67: 'Freezing rain',
            71: 'Light snow',
            73: 'Snow',
            75: 'Heavy snow',
            77: 'Snow grains',
            80: 'Rain showers',
            81: 'Rain showers',
            82: 'Heavy showers',
            85: 'Snow showers',
            86: 'Snow showers',
            95: 'Thunderstorm',
            96: 'Thunderstorm',
            99: 'Thunderstorm'
        };
        return map[code] || 'Unknown';
    }

    function isRainCode(code) {
        return [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99].indexOf(code) !== -1;
    }

    const sceneImages = {
        cloudy: {
            hero: 'city-cloudy.jpeg',
            background: 'cloudy-background.jpeg'
        },
        day: {
            hero: 'city-day.jpg',
            background: 'day-background.jpeg'
        },
        night: {
            hero: 'city-night.png',
            background: 'night-background.jpeg'
        },
        rain: {
            hero: 'city-rain.jpg',
            background: 'rain-background.jpg'
        },
        snow: {
            hero: 'city-snow.jpg',
            background: 'snow-background.jpeg'
        },
        sunrise: {
            hero: 'city-sunrise.png',
            background: 'sunrise-background.jpeg'
        },
        sunset: {
            hero: 'city-sunset.jpg',
            background: 'sunset-background.jpeg'
        }
    };

    function parseClock(value) {
        const match = String(value || '').match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);

        if (!match) {
            return null;
        }

        let hour = parseInt(match[1], 10);
        const minute = parseInt(match[2], 10);
        const period = match[3] && match[3].toUpperCase();

        if (period === 'PM' && hour < 12) {
            hour += 12;
        } else if (period === 'AM' && hour === 12) {
            hour = 0;
        }

        return hour * 60 + minute;
    }

    function isNearTime(current, event) {
        if (current === null || event === null) {
            return false;
        }

        const difference = Math.abs(current - event);
        return Math.min(difference, 1440 - difference) <= 75;
    }

    function getTimeScene(data) {
        const current = parseClock(data.time);
        const sunrise = parseClock(data.sunrise);
        const sunset = parseClock(data.sunset);
        const hour = current === null ? new Date().getHours() : Math.floor(current / 60);

        if (isNearTime(current, sunrise)) {
            return 'sunrise';
        }

        if (isNearTime(current, sunset)) {
            return 'sunset';
        }

        if ((sunrise === null && hour >= 5 && hour < 8) ||
            (sunset === null && hour >= 17 && hour < 20)) {
            return hour < 12 ? 'sunrise' : 'sunset';
        }

        if (data.isDay === false || data.isDay === 0 || data.isDay === '0' ||
            (data.isDay == null && (hour < 6 || hour >= 20))) {
            return 'night';
        }

        return 'day';
    }

    function getWeatherScene(data) {
        const timeScene = getTimeScene(data);

        if (timeScene === 'night') {
            return 'night';
        }

        const code = data.code;
        const condition = String(data.condition || '').toLowerCase();

        if (/snow|sleet|blizzard|ice pellets/.test(condition) ||
            [71, 73, 75, 77, 85, 86].indexOf(code) !== -1) {
            return 'snow';
        }

        if (/rain|drizzle|shower|thunder/.test(condition) || isRainCode(code)) {
            return 'rain';
        }

        if (/cloud|overcast|fog|mist/.test(condition) ||
            [2, 3, 45, 48].indexOf(code) !== -1) {
            return 'cloudy';
        }

        return timeScene;
    }

    function getWeatherEffectScene(data) {
        const code = data.code;
        const condition = String(data.condition || '').toLowerCase();

        if (/snow|sleet|blizzard|ice pellets/.test(condition) ||
            [71, 73, 75, 77, 85, 86].indexOf(code) !== -1) {
            return 'snow';
        }

        if (/rain|drizzle|shower|thunder/.test(condition) || isRainCode(code)) {
            return 'rain';
        }

        return null;
    }

    function setWeatherScene(data) {
        const scene = getWeatherScene(data);
        const images = sceneImages[scene];
        const imageRoot = document.body.dataset.imageRoot || '/src/images/';

        document.body.dataset.weatherScene = scene;
        document.body.style.setProperty(
            '--weather-background-image',
            'url("' + imageRoot + images.background + '")'
        );

        if (document.body.classList.contains('home-page')) {
            document.body.style.setProperty(
                '--weather-home-image',
                'url("' + imageRoot + images.hero + '")'
            );
        }

        return scene;
    }

    const storedInitialScene = getStoredScene();
    if (storedInitialScene) {
        document.body.dataset.weatherScene = storedInitialScene.scene;
        const storedImages = sceneImages[storedInitialScene.scene];
        if (storedImages) {
            const imageRoot = document.body.dataset.imageRoot || '/src/images/';
            document.body.style.setProperty(
                '--weather-background-image',
                'url("' + imageRoot + storedImages.background + '")'
            );
            if (document.body.classList.contains('home-page')) {
                document.body.style.setProperty(
                    '--weather-home-image',
                    'url("' + imageRoot + storedImages.hero + '")'
                );
            }
        }
    } else {
        setWeatherScene({ code: null });
    }

    function setWeatherEffect(scene) {
        const pageHero = document.querySelector('#content > .page-top');

        if (weatherEffectScene === scene &&
            weatherEffectStops.length > 0) {
            return;
        }

        weatherEffectStops.forEach(function (stop) {
            stop();
        });
        weatherEffectStops = [];
        weatherEffectScene = scene;

        if (reducedMotion.matches ||
            (scene !== 'rain' && scene !== 'snow' && scene !== 'stars')) {
            return;
        }

        weatherEffectStops.push(startWeatherCanvas(document.body, scene));

        if (pageHero &&
            (pageHero.classList.contains('home-hero') ||
                pageHero.classList.contains('about-hero'))) {
            weatherEffectStops.push(startWeatherCanvas(pageHero, scene));
        }
    }

    reducedMotion.addEventListener('change', function () {
        if (reducedMotion.matches) {
            weatherEffectStops.forEach(function (stop) {
                stop();
            });
            weatherEffectStops = [];
        } else if (weatherEffectScene) {
            setWeatherEffect(weatherEffectScene);
        }
    });

    function getTimePeriod(value) {
        const minutes = parseClock(value);
        const hour = minutes === null ? new Date().getHours() : Math.floor(minutes / 60);

        if (hour < 5) {
            return 'Late night';
        }
        if (hour < 11) {
            return 'Morning';
        }
        if (hour < 14) {
            return 'Midday';
        }
        if (hour < 18) {
            return 'Afternoon';
        }
        if (hour < 21) {
            return 'Evening';
        }
        return 'Night';
    }

    function getTimezone(data) {
        const timeZone = data.timezone ||
            Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

        try {
            new Intl.DateTimeFormat('en-US', { timeZone: timeZone });
            return timeZone;
        } catch (error) {
            return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
        }
    }

    function getTimezoneAbbreviation(data, timeZone) {
        if (data.timezoneAbbreviation) {
            return data.timezoneAbbreviation;
        }

        if (!timeZone) {
            return 'Local time';
        }

        try {
            return new Intl.DateTimeFormat('en-US', {
                timeZone: timeZone,
                timeZoneName: 'short'
            }).formatToParts(new Date()).filter(function (part) {
                return part.type === 'timeZoneName';
            })[0].value;
        } catch (error) {
            return timeZone.split('/').pop().replace(/_/g, ' ');
        }
    }

    function getTimezoneCity(data, timeZone) {
        if (data.city) {
            return data.city;
        }

        if (timeZone) {
            const city = timeZone.split('/').pop().replace(/_/g, ' ');
            return city.replace(/\b\w/g, function (letter) {
                return letter.toUpperCase();
            });
        }

        return 'Local time';
    }

    function renderWeatherClock() {
        if (!weatherDisplay || !weatherClock) {
            return;
        }

        const now = new Date();
        const clockParts = weatherClock.partsFormatter.formatToParts(now);
        const values = {};
        clockParts.forEach(function (part) {
            if (part.type !== 'literal') {
                values[part.type] = parseInt(part.value, 10);
            }
        });
        const time = weatherClock.timeFormatter.format(now);
        const date = weatherClock.dateFormatter.format(now);
        const period = getTimePeriod(values.hour + ':' + values.minute);
        const readout = period + ' · ' + time;

        weatherDisplay.querySelector('[data-weather-date]').textContent = date;
        weatherDisplay.querySelector('[data-weather-period]').textContent = readout;
        weatherDisplay.setAttribute(
            'aria-label',
            weatherClock.location + ', ' + date + ', ' + readout + ', ' +
                weatherClock.details + '. Activate to refresh local weather.'
        );
    }

    function updateWeatherDisplay(data, condition, temp) {
        if (!weatherDisplay) {
            return;
        }

        const timeZone = getTimezone(data);
        const location = getTimezoneCity(data, timeZone) +
            ' · ' + getTimezoneAbbreviation(data, timeZone);
        const details = temp == null
            ? condition
            : temp + '°' + temperatureUnitLabel + ' · ' + condition;

        weatherDisplay.querySelector('[data-weather-location]').textContent = location;
        weatherDisplay.querySelector('[data-weather-condition]').textContent = details;
        updateWeatherIcon(data);
        weatherClock = {
            location: location,
            details: details,
            timeFormatter: new Intl.DateTimeFormat('en-US', {
                timeZone: timeZone,
                hour: 'numeric',
                minute: '2-digit',
                second: '2-digit'
            }),
            dateFormatter: new Intl.DateTimeFormat('en-US', {
                timeZone: timeZone,
                weekday: 'long',
                month: 'short',
                day: 'numeric',
                year: 'numeric'
            }),
            partsFormatter: new Intl.DateTimeFormat('en-US', {
                timeZone: timeZone,
                hour: '2-digit',
                minute: '2-digit',
                hourCycle: 'h23'
            })
        };
        weatherDisplay.hidden = false;
        renderWeatherClock();
    }

    function setWeatherRefreshing(isRefreshing) {
        if (!weatherDisplay) {
            return;
        }

        weatherDisplay.classList.toggle('is-refreshing', isRefreshing);
        weatherDisplay.setAttribute('aria-busy', String(isRefreshing));
    }

    function applyWeather(data) {
        const code = data.code;
        const temp = data.temp;
        const condition = data.condition || weatherCodeToText(code);
        const storedPrevious = getStoredScene();
        const previousScene = storedPrevious ? storedPrevious.scene : null;
        const scene = setWeatherScene(data);
        const precipitation = getWeatherEffectScene(data);
        const effectScene = precipitation || (scene === 'night' ? 'stars' : null);

        setWeatherRefreshing(false);
        updateWeatherDisplay(data, condition, temp);

        if (precipitation === 'rain') {
            rainMultiplier = 1.3;
        }

        // Timelapse from the previous scene to the current one.
        if (previousScene && previousScene !== scene) {
            // Defer the weather canvas until the timelapse finishes so the
            // particles do not fight the crossfade.
            runTimelapse(previousScene, scene).then(function () {
                setWeatherEffect(effectScene);
            });
        } else {
            setWeatherEffect(effectScene);
        }

        storeScene(scene, window.location.pathname || '/');
    }

    if (weatherDisplay) {
        window.setInterval(renderWeatherClock, 1000);
    }

    function fetchWeather(lat, lon) {
        setWeatherRefreshing(true);
        const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat +
            '&longitude=' + lon +
            '&current=weather_code,temperature_2m,is_day' +
            '&temperature_unit=' + temperatureUnit +
            '&daily=sunrise,sunset&forecast_days=1&timezone=auto';
        fetch(url)
            .then(function (r) { return r.json(); })
            .then(function (json) {
                if (json && json.current) {
                    applyWeather({
                        code: json.current.weather_code,
                        temp: Math.round(json.current.temperature_2m),
                        isDay: json.current.is_day,
                        time: json.current.time,
                        timezone: json.timezone,
                        timezoneAbbreviation: json.timezone_abbreviation,
                        sunrise: json.daily && json.daily.sunrise && json.daily.sunrise[0],
                        sunset: json.daily && json.daily.sunset && json.daily.sunset[0]
                    });
                } else {
                    fetchWttr();
                }
            })
            .catch(function () {
                // Fall back to wttr.in (IP-based).
                fetchWttr();
            });
    }

    function fetchWttr() {
        setWeatherRefreshing(true);
        fetch('https://wttr.in/?format=j1')
            .then(function (r) { return r.json(); })
            .then(function (json) {
                if (json && json.current_condition && json.current_condition[0]) {
                    const c = json.current_condition[0];
                    const astronomy = json.weather &&
                        json.weather[0] &&
                        json.weather[0].astronomy &&
                        json.weather[0].astronomy[0];
                    const nearestArea = json.nearest_area &&
                        json.nearest_area[0];
                    const areaName = nearestArea &&
                        nearestArea.areaName &&
                        nearestArea.areaName[0] &&
                        nearestArea.areaName[0].value;
                    const timeZone = json.time_zone && json.time_zone[0];
                    applyWeather({
                        code: parseInt(c.weatherCode, 10),
                        temp: temperatureUnit === 'fahrenheit' ? c.temp_F : c.temp_C,
                        condition: c.weatherDesc && c.weatherDesc[0] && c.weatherDesc[0].value,
                        time: c.localObsDateTime,
                        city: areaName,
                        timezone: timeZone && timeZone.zone,
                        timezoneAbbreviation: timeZone && timeZone.abbreviation,
                        sunrise: astronomy && astronomy.sunrise,
                        sunset: astronomy && astronomy.sunset
                    });
                } else {
                    setWeatherRefreshing(false);
                    var fallbackScene = setWeatherScene({ code: null });
                    setWeatherEffect(null);
                    updateWeatherDisplay({}, 'Weather unavailable');
                    storeScene(fallbackScene, window.location.pathname || '/');
                }
            })
            .catch(function () {
                setWeatherRefreshing(false);
                setWeatherScene({ code: null });
                setWeatherEffect(null);
                updateWeatherDisplay({}, 'Weather unavailable');
            });
    }

    let weatherCoordinates = null;

    if (weatherDisplay) {
        weatherDisplay.addEventListener('click', function () {
            if (weatherCoordinates) {
                fetchWeather(weatherCoordinates.latitude, weatherCoordinates.longitude);
            } else {
                fetchWttr();
            }
        });
    }

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            function (pos) {
                weatherCoordinates = {
                    latitude: pos.coords.latitude,
                    longitude: pos.coords.longitude
                };
                fetchWeather(weatherCoordinates.latitude, weatherCoordinates.longitude);
            },
            function () {
                fetchWttr();
            },
            { timeout: 5000, maximumAge: 600000 }
        );
    } else {
        fetchWttr();
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

        if (!opacityRevealsEnabled) {
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

    function disableOpacityRevealsOnFastScroll() {
        const now = performance.now();
        const position = window.scrollY;
        const elapsed = now - scrollSamples[0].time;
        const baseline = scrollSamples.find(function (sample) {
            return now - sample.time >= 80;
        });
        const averageSpeed = baseline
            ? Math.abs(position - baseline.position) / (now - baseline.time)
            : 0;
        const largeJump = Math.abs(position - scrollSamples[scrollSamples.length - 1].position) >
            window.innerHeight * 2.5;

        scrollSamples.push({ position: position, time: now });

        while (
            scrollSamples.length > 1 &&
            now - scrollSamples[0].time > 250
        ) {
            scrollSamples.shift();
        }

        if (
            opacityRevealsEnabled &&
            (largeJump || (elapsed >= 80 && averageSpeed > FAST_SCROLL_THRESHOLD))
        ) {
            opacityRevealsEnabled = false;
            document.documentElement.classList.add('fast-scroll');
        }
    }

    function paint() {
        framePending = false;

        if (nav) {
            nav.classList.toggle('is-scrolled', window.scrollY > 24);
        }

        disableOpacityRevealsOnFastScroll();
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

        hero.style.setProperty(
            '--hero-bg-pos',
            (50 + progress * 12).toFixed(1) + '%'
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
        '.tile, .book-section, #content > section, .contact-card, .games-list .game, .log-card, .song, .about-shell section, #footer';

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
                rootMargin: '0px',
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
        '.tile, .contact-card, .games-list .game, .item.info, #content > section, .about-shell section, .log-card, .song';

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
    // -----------------------------------------------------------------------
    // Easter egg: Konami code triggers a brief rain surge
    // -----------------------------------------------------------------------
    const konami = [38, 38, 40, 40, 37, 39, 37, 39, 66, 65];
    let konamiIndex = 0;

    window.addEventListener('keydown', function (event) {
        if (event.keyCode === konami[konamiIndex]) {
            konamiIndex += 1;

            if (konamiIndex === konami.length) {
                konamiIndex = 0;

                if (typeof window.__boostRain === 'function') {
                    window.__boostRain(4500);
                }

                document.body.classList.add('is-boosted');

                window.setTimeout(function () {
                    document.body.classList.remove('is-boosted');
                }, 4500);
            }
        } else {
            konamiIndex = 0;
        }
    });

    // -----------------------------------------------------------------------
    // Scroll progress bar
    // -----------------------------------------------------------------------
    const progressBar = document.querySelector('.scroll-progress');

    if (progressBar && !reducedMotion.matches) {
        let progressFrame = 0;

        function updateProgress() {
            progressFrame = 0;

            const doc = document.documentElement;
            const scrollable = doc.scrollHeight - window.innerHeight;

            if (scrollable <= 0) {
                progressBar.style.transform = 'scaleX(0)';
                return;
            }

            const progress = Math.min(1, Math.max(0, window.scrollY / scrollable));
            progressBar.style.transform = 'scaleX(' + progress.toFixed(4) + ')';
        }

        function requestProgress() {
            if (progressFrame) {
                return;
            }

            progressFrame = window.requestAnimationFrame(updateProgress);
        }

        window.addEventListener('scroll', requestProgress, { passive: true });
        window.addEventListener('resize', requestProgress, { passive: true });

        updateProgress();
    }

    // -----------------------------------------------------------------------
    // Calendar: real anniversaries of real events
    // -----------------------------------------------------------------------
    (function checkCalendar() {
        const calendar = window.__calendar;
        if (!Array.isArray(calendar) || calendar.length === 0) {
            return;
        }

        const now = new Date();
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
            'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const todayMonth = monthNames[now.getMonth()];
        const todayDay = String(now.getDate());

        const matches = calendar.filter(function (entry) {
            return entry.month === todayMonth && String(entry.day) === todayDay;
        });

        if (matches.length === 0) {
            return;
        }

        document.body.classList.add('is-anniversary');
        document.body.dataset.anniversaryPage = matches[0].page || '';
    })();

})();
