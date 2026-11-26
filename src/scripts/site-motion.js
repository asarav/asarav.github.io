
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
    // null until the population lookup answers. Unknown is not the same as
    // "not a city", and the two have opposite consequences now.
    let cityMetro = null;
    let cityStop = null;
    let matrixRainHeroCanvas = null;
    let matrixRainHero = null;
    let matrixRainFrame = 0;
    let matrixRainStreams = [];
    let matrixRainLastFrame = 0;
    let currentLight = null;
    let lightLayer = null;
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

    function storeScene(scene, room, timeScene) {
        try {
            window.localStorage.setItem(SCENE_STORAGE_KEY, JSON.stringify({
                scene: scene,
                room: room || (window.location.pathname || '/'),
                timestamp: Date.now(),
                timeScene: timeScene || null
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

    let activeTimelapseOverlay = null;

    function runTimelapse(oldScene, applyNewScene) {
        if (!oldScene || !sceneImages[oldScene] || reducedMotion.matches ||
            activeTimelapseOverlay) {
            applyNewScene();
            return Promise.resolve();
        }

        const hero = document.querySelector('#content > .page-top.home-hero');
        const oldImages = sceneImages[oldScene];

        if (!hero || !oldImages.hero) {
            applyNewScene();
            return Promise.resolve();
        }

        const duration = 4500;
        const imageRoot = document.body.dataset.imageRoot || '/assets/images/';

        // Put the old image on top *before* the new scene is applied, so the
        // new image never paints first (which caused a new -> old -> new flash).
        const overlay = document.createElement('div');
        overlay.className = 'scene-timelapse scene-timelapse--hero';
        overlay.style.backgroundImage =
            'linear-gradient(90deg, rgba(7, 11, 16, 0.76) 0%, rgba(7, 11, 16, 0.42) 55%, rgba(7, 11, 16, 0.7) 100%), ' +
            'linear-gradient(180deg, rgba(7, 11, 16, 0.24) 0%, rgba(7, 11, 16, 0.78) 100%), ' +
            'url("' + imageRoot + oldImages.hero + '")';
        overlay.style.backgroundSize = 'cover';
        overlay.style.backgroundPosition = 'center';
        hero.insertBefore(overlay, hero.firstChild);
        activeTimelapseOverlay = overlay;

        // Swap the scene underneath the overlay.
        applyNewScene();

        // Commit the opaque overlay, then fade it out over the new scene.
        void overlay.offsetWidth;
        overlay.style.transition = 'opacity ' + duration + 'ms ease';

        return new Promise(function (resolve) {
            requestAnimationFrame(function () {
                requestAnimationFrame(function () {
                    overlay.style.opacity = '0';
                });
            });

            window.setTimeout(function () {
                if (overlay.parentNode) {
                    overlay.parentNode.removeChild(overlay);
                }
                if (activeTimelapseOverlay === overlay) {
                    activeTimelapseOverlay = null;
                }
                resolve();
            }, duration + 100);
        });
    }
    // Weather effects
    // -----------------------------------------------------------------------
    function mixChannel(base, target, amount) {
        return Math.round(base + (target - base) * amount);
    }

    // -----------------------------------------------------------------------
    // Sun / moon illumination
    // -----------------------------------------------------------------------
    function julianDay(date) {
        return date.getTime() / 86400000 + 2440587.5;
    }

    function solarPosition(date, lat, lon) {
        const rad = Math.PI / 180;
        const d = julianDay(date) - 2451545.0;
        const meanAnomaly = (357.5291 + 0.98560028 * d) * rad;
        const equation = (1.9148 * Math.sin(meanAnomaly) +
            0.02 * Math.sin(2 * meanAnomaly) +
            0.0003 * Math.sin(3 * meanAnomaly)) * rad;
        const perihelion = 102.9372 * rad;
        const longitude = meanAnomaly + equation + perihelion + Math.PI;
        const obliquity = 23.4397 * rad;
        const declination = Math.asin(
            Math.sin(obliquity) * Math.sin(longitude)
        );
        const rightAscension = Math.atan2(
            Math.sin(longitude) * Math.cos(obliquity),
            Math.cos(longitude)
        );
        const sidereal = (280.16 + 360.9856235 * d) * rad;
        const hourAngle = sidereal + lon * rad - rightAscension;
        const phi = lat * rad;
        const altitude = Math.asin(
            Math.sin(phi) * Math.sin(declination) +
            Math.cos(phi) * Math.cos(declination) * Math.cos(hourAngle)
        );
        const azimuth = Math.atan2(
            Math.sin(hourAngle),
            Math.cos(hourAngle) * Math.sin(phi) -
                Math.tan(declination) * Math.cos(phi)
        );

        return {
            altitude: altitude / rad,
            azimuth: (azimuth / rad + 180) % 360,
            longitude: longitude
        };
    }

    function lunarPosition(date, lat, lon) {
        const rad = Math.PI / 180;
        const d = julianDay(date) - 2451545.0;
        const meanLongitude = (218.316 + 13.176396 * d) * rad;
        const meanAnomaly = (134.963 + 13.064993 * d) * rad;
        const meanDistance = (93.272 + 13.22935 * d) * rad;
        const longitude = meanLongitude + 6.289 * rad * Math.sin(meanAnomaly);
        const latitude = 5.128 * rad * Math.sin(meanDistance);
        const obliquity = 23.4397 * rad;
        const rightAscension = Math.atan2(
            Math.sin(longitude) * Math.cos(obliquity) -
                Math.tan(latitude) * Math.sin(obliquity),
            Math.cos(longitude)
        );
        const declination = Math.asin(
            Math.sin(latitude) * Math.cos(obliquity) +
            Math.cos(latitude) * Math.sin(obliquity) * Math.sin(longitude)
        );
        const sidereal = (280.16 + 360.9856235 * d) * rad;
        const hourAngle = sidereal + lon * rad - rightAscension;
        const phi = lat * rad;
        const altitude = Math.asin(
            Math.sin(phi) * Math.sin(declination) +
            Math.cos(phi) * Math.cos(declination) * Math.cos(hourAngle)
        );
        const azimuth = Math.atan2(
            Math.sin(hourAngle),
            Math.cos(hourAngle) * Math.sin(phi) -
                Math.tan(declination) * Math.cos(phi)
        );
        const sun = solarPosition(date, lat, lon);
        const elongation = Math.abs(
            ((longitude - sun.longitude + Math.PI) % (2 * Math.PI)) -
            Math.PI
        );

        return {
            altitude: altitude / rad,
            azimuth: (azimuth / rad + 180) % 360,
            phase: (1 - Math.cos(elongation)) / 2
        };
    }

    function estimatedPosition(date) {
        const hour = date.getHours() + date.getMinutes() / 60 +
            date.getSeconds() / 3600;
        const daylight = Math.sin(((hour - 6) / 12) * Math.PI);

        return {
            altitude: daylight * 62,
            azimuth: (((90 + (hour - 6) * 15) % 360) + 360) % 360,
            phase: 0.5
        };
    }

    function smoothstep(edge0, edge1, value) {
        const t = Math.min(
            1,
            Math.max(0, (value - edge0) / (edge1 - edge0))
        );

        return t * t * (3 - 2 * t);
    }

    function computeIllumination(date) {
        const coords = weatherCoordinates;
        const sun = coords
            ? solarPosition(date, coords.latitude, coords.longitude)
            : estimatedPosition(date);
        const moon = coords
            ? lunarPosition(date, coords.latitude, coords.longitude)
            : (sun.altitude < 0
                ? {
                    altitude: Math.min(60, -sun.altitude * 0.7),
                    azimuth: (sun.azimuth + 180) % 360,
                    phase: 0.6
                }
                : null);
        const dayFactor = smoothstep(-6, 8, sun.altitude);
        const useMoon = dayFactor < 0.08 && moon && moon.altitude > 0;
        const body = useMoon ? 'moon' : (dayFactor > 0.08 ? 'sun' : 'ambient');

        let altitude;
        let azimuth;
        let color;
        let tint;
        let alpha;
        let shadowAlpha;

        if (body === 'sun') {
            altitude = sun.altitude;
            azimuth = sun.azimuth;
            const warmth = 1 - smoothstep(4, 40, sun.altitude);
            color = [
                Math.round(214 + 41 * warmth),
                Math.round(226 - 20 * warmth),
                Math.round(255 - 110 * warmth)
            ];
            tint = 0.18 + 0.34 * warmth;
            alpha = 0.12 + 0.10 * warmth;
            shadowAlpha = 0.10 + 0.07 * warmth;
        } else if (body === 'moon') {
            altitude = moon.altitude;
            azimuth = moon.azimuth;
            color = [150, 190, 255];
            tint = 0.22 + 0.08 * moon.phase;
            alpha = (0.09 + 0.07 * moon.phase) *
                smoothstep(0, 18, moon.altitude);
            shadowAlpha = 0.08;
        } else {
            altitude = Math.max(sun.altitude, -10);
            azimuth = sun.azimuth;
            color = [126, 166, 214];
            tint = 0.20;
            alpha = 0.075;
            shadowAlpha = 0.08;
        }

        const height = Math.min(1, Math.max(0, (altitude + 8) / 98));
        const x = 50 + 50 * Math.sin(azimuth * Math.PI / 180);
        const y = 100 - height * 100;

        return {
            x: Math.min(96, Math.max(4, x)),
            y: Math.min(94, Math.max(2, y)),
            r: color[0],
            g: color[1],
            b: color[2],
            tint: tint,
            alpha: Math.max(0, Math.min(0.28, alpha)),
            shadowAlpha: Math.max(0, Math.min(0.22, shadowAlpha)),
            body: body
        };
    }

    function ensureLightLayer() {
        if (lightLayer && lightLayer.isConnected) {
            return lightLayer;
        }
        if (!document.body) {
            return null;
        }

        lightLayer = document.createElement('div');
        lightLayer.className = 'weather-light';
        lightLayer.setAttribute('aria-hidden', 'true');
        document.body.insertBefore(lightLayer, document.body.firstChild);

        return lightLayer;
    }

    function updateIllumination() {
        const light = computeIllumination(new Date());

        ensureLightLayer();
        currentLight = light;

        const root = document.documentElement;

        root.style.setProperty('--light-x', light.x.toFixed(2) + '%');
        root.style.setProperty('--light-y', light.y.toFixed(2) + '%');
        root.style.setProperty(
            '--light-color',
            'rgba(' + light.r + ', ' + light.g + ', ' + light.b +
            ', ' + light.alpha.toFixed(3) + ')'
        );
        root.style.setProperty(
            '--light-shadow',
            'rgba(3, 7, 13, ' + light.shadowAlpha.toFixed(3) + ')'
        );
        root.style.setProperty(
            '--shadow-x',
            (100 - light.x).toFixed(2) + '%'
        );
        root.style.setProperty(
            '--shadow-y',
            (100 - light.y).toFixed(2) + '%'
        );
    }

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
        // Behind every piece of page content: the city under the weather, the
        // weather under the text. Hero layers stay at 0 because they sit inside
        // the hero, above its photograph but below its copy.
        canvas.style.zIndex = isBody ? (type === 'city' ? '-2' : '-1') : '0';

        const context = canvas.getContext('2d');

        if (!context) {
            canvas.remove();
            return function () {};
        }

        // A hero's weather scrolls away with the hero. The frame clock
        // keeps its place, but nothing is painted while the layer is out
        // of the viewport — rain nobody can see is the same heat as rain
        // behind a hidden tab. The full-page layers are fixed, so they
        // stay on screen by definition and are left alone.
        const screenWatcher = (typeof IntersectionObserver === 'function' && !isBody)
            ? new IntersectionObserver(function (entries) {
                onScreen = entries[0].isIntersecting;
            }, { threshold: 0 })
            : null;

        if (screenWatcher) {
            screenWatcher.observe(container);
        }

        let particles = [];
        // Fog and cloud banks are shapes, not particles: a slow field of soft
        // gradients that drifts without ever leaving the frame.
        let banks = [];
        // Lightning state: when the next strike is due, and the one on screen.
        let nextFlash = 0;
        let flashStart = 0;
        let flashX = 0.5;
        let flashPath = [];
        let flashBranch = [];
        // Street lamps, only in the city ambience layer.
        let lamps = [];
        // And the colour of a city at night: lit windows, signs, signals.
        let windows = [];
        let signs = [];
        let signals = [];
        let maxParticles = 0;
        let nextSpawn = 0;
        let frame = 0;
        let running = true;
        // False while the layer is scrolled out of the viewport.
        let onScreen = true;
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
                    140,
                    Math.max(12, Math.round(
                        canvas.width / 16 * rainIntensity * rainMultiplier *
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

            if (type === 'fog' || type === 'cloudy') {
                seedBanks();
            }

            if (type === 'city') {
                seedCity();
            }

            if (type === 'storm') {
                // Do not open with a strike: let the page settle first.
                nextFlash = performance.now() + 1800 + Math.random() * 5000;
                flashStart = 0;
            }

            nextSpawn = performance.now();
        }

        // Rain and snow are seeded from a fractal (value-noise fBm) density
        // field, so the weather gathers into drifting bands instead of falling
        // as an even curtain. Three octaves reads as texture at this scale.
        const NOISE_CELLS = 5;

        function noiseHash(ix, iy) {
            const n = Math.sin(ix * 127.1 + iy * 311.7 + 74.7) * 43758.5453;
            return n - Math.floor(n);
        }

        function valueNoise(px, py) {
            const ix = Math.floor(px);
            const iy = Math.floor(py);
            const fx = px - ix;
            const fy = py - iy;
            const sx = fx * fx * (3 - 2 * fx);
            const sy = fy * fy * (3 - 2 * fy);
            const top = noiseHash(ix, iy) * (1 - sx) +
                noiseHash(ix + 1, iy) * sx;
            const bottom = noiseHash(ix, iy + 1) * (1 - sx) +
                noiseHash(ix + 1, iy + 1) * sx;

            return top * (1 - sy) + bottom * sy;
        }

        function densityAt(x, y) {
            let value = 0;
            let amplitude = 0.5;
            let frequency = 1;

            for (let octave = 0; octave < 3; octave++) {
                value += amplitude * valueNoise(
                    x * NOISE_CELLS * frequency,
                    y * NOISE_CELLS * frequency
                );
                amplitude *= 0.5;
                frequency *= 2;
            }

            return value / 0.875;
        }

        // The field drifts downwards, so the bands move with the weather.
        function densityAtColumn(x, now) {
            return densityAt(
                x / Math.max(canvas.width, 1),
                now * 0.000045
            );
        }

        // Rejection-sample a column, biased towards the dense part of the field.
        function pickColumn(now) {
            let best = Math.random();
            let bestDensity = -1;

            for (let attempt = 0; attempt < 3; attempt++) {
                const candidate = Math.random();
                const density = densityAtColumn(candidate * canvas.width, now);

                if (density > bestDensity) {
                    bestDensity = density;
                    best = candidate;
                }
            }

            return { x: best * canvas.width, density: Math.max(0, bestDensity) };
        }

        function spawnRainBurst() {
            const boosted = performance.now() < rainBoostUntil;
            const burstSize = 1 + Math.floor(Math.random() * Math.min(7, (boosted ? 5 : (isNight ? 4 : 3)) * rainMultiplier));
            const column = pickColumn(performance.now());
            const baseX = column.x;

            for (let i = 0; i < burstSize; i++) {
                if (particles.length >= maxParticles) {
                    break;
                }

                particles.push({
                    x: baseX + (Math.random() - 0.5) * 40,
                    y: -20 - Math.random() * 30,
                    length: 14 + Math.random() * 10,
                    speed: 3.5 + Math.random() * 3.5,
                    opacity: ((boosted ? 0.26 : (isNight ? 0.18 : 0.12)) + Math.random() * (boosted ? 0.2 : (isNight ? 0.28 : 0.16))) *
                        (0.45 + column.density),
                    drift: (Math.random() - 0.5) * 0.6
                });
            }
        }

        function spawnSnowflake(randomHeight) {
            particles.push({
                x: pickColumn(performance.now()).x,
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

        // Lamps sit at street level across the lower third.
        function seedCity() {
            const width = canvas.width;
            const height = canvas.height;
            const lampCount = isNight
                ? Math.max(5, Math.min(11, Math.round(width / 150)))
                : 0;

            lamps = [];
            windows = [];
            signs = [];
            signals = [];

            for (let i = 0; i < lampCount; i += 1) {
                lamps.push({
                    x: (i + 0.2 + Math.random() * 0.6) / lampCount * width,
                    y: height * (0.66 + Math.random() * 0.3),
                    radius: height * (0.1 + Math.random() * 0.1),
                    phase: Math.random() * Math.PI * 2,
                    speed: 0.0007 + Math.random() * 0.0012,
                    alpha: 0.22 + Math.random() * 0.12,
                    // 1 is sodium amber, 0 is a cool white lamp.
                    warmth: Math.random()
                });
            }

            seedCityLights();
        }

        // A soft round glow, baked once: rebuilding a radial gradient for
        // every sign on every frame was the most expensive thing in the city
        // layer by far.
        function glowSprite(rgb) {
            const sprite = document.createElement('canvas');
            const size = 64;
            const context2 = sprite.getContext('2d');

            sprite.width = size;
            sprite.height = size;

            if (!context2) {
                return sprite;
            }

            const gradient = context2.createRadialGradient(
                size / 2, size / 2, 0, size / 2, size / 2, size / 2
            );

            gradient.addColorStop(0, 'rgba(' + rgb[0] + ', ' + rgb[1] +
                ', ' + rgb[2] + ', 1)');
            gradient.addColorStop(0.4, 'rgba(' + rgb[0] + ', ' + rgb[1] +
                ', ' + rgb[2] + ', 0.34)');
            gradient.addColorStop(1, 'rgba(' + rgb[0] + ', ' + rgb[1] +
                ', ' + rgb[2] + ', 0)');
            context2.fillStyle = gradient;
            context2.fillRect(0, 0, size, size);

            return sprite;
        }

        // Skyscraper windows, neon signs and traffic lights: the colour a city
        // adds after dark, kept to small, low-alpha marks so it stays ambience
        // rather than becoming a scene of its own.
        function seedCityLights() {
            const width = canvas.width;
            const height = canvas.height;
            const buildings = 5 + Math.floor(Math.random() * 4);
            const neon = [
                [255, 96, 190],
                [96, 226, 240],
                [255, 110, 90],
                [130, 240, 160],
                [255, 190, 90]
            ];

            if (!isNight) {
                return;
            }

            // Window grids, one loose cluster per building, some rooms dark.
            for (let b = 0; b < buildings; b += 1) {
                const left = (b + 0.1 + Math.random() * 0.8) /
                    buildings * width;
                const column = Math.max(
                    16,
                    width / buildings * (0.3 + Math.random() * 0.25)
                );
                const top = height * (0.16 + Math.random() * 0.36);
                const cols = 2 + Math.floor(Math.random() * 3);
                const rows = 3 + Math.floor(Math.random() * 5);
                const warm = Math.random() < 0.62;

                for (let c = 0; c < cols; c += 1) {
                    for (let r = 0; r < rows; r += 1) {
                        if (Math.random() < 0.3) {
                            continue;
                        }

                        const on = Math.random() < 0.62;

                        windows.push({
                            x: left + (c + 0.25) / cols * column,
                            y: top + (r + 0.2) / rows * height * 0.3,
                            w: Math.max(1.4, column / cols * 0.4),
                            h: Math.max(1.4, height * 0.012),
                            warm: warm,
                            alpha: 0.09 + Math.random() * 0.17,
                            phase: Math.random() * Math.PI * 2,
                            speed: 0.0004 + Math.random() * 0.0012,
                            on: on,
                            level: on ? 1 : 0,
                            nextSwitch: performance.now() +
                                1200 + Math.random() * 9000
                        });
                    }
                }
            }

            for (let i = 0; i < 3; i += 1) {
                const color = neon[Math.floor(Math.random() * neon.length)];

                signs.push({
                    x: (i + 0.3 + Math.random() * 0.4) / 3 * width,
                    y: height * (0.5 + Math.random() * 0.3),
                    w: width * (0.018 + Math.random() * 0.026),
                    h: height * (0.01 + Math.random() * 0.013),
                    color: color,
                    phase: Math.random() * Math.PI * 2,
                    speed: 0.0006 + Math.random() * 0.0009,
                    sprite: glowSprite(color)
                });
            }

            for (let i = 0; i < 3; i += 1) {
                signals.push({
                    x: (i + 0.25 + Math.random() * 0.5) / 3 * width,
                    y: height * 0.93,
                    phase: Math.random() * Math.PI * 2,
                    red: glowSprite([255, 96, 84]),
                    green: glowSprite([110, 240, 150])
                });
            }
        }

        // Lamp halos at night, plus the window, sign and signal light that
        // gives the skyline its colour.
        function drawCity(now, delta) {
            const width = canvas.width;
            const height = canvas.height;

            if (isNight) {
                for (let i = 0; i < windows.length; i += 1) {
                    const lit = windows[i];

                    // Rooms switch on and off rather than only breathing: most
                    // of the light in a skyline is people coming and going.
                    if (now >= lit.nextSwitch) {
                        lit.on = !lit.on;
                        lit.nextSwitch = now +
                            1600 + Math.random() * 11000;
                    }

                    lit.level += ((lit.on ? 1 : 0) - lit.level) *
                        Math.min(1, delta / 320);

                    if (lit.level < 0.02) {
                        continue;
                    }

                    const alpha = lit.alpha * lit.level *
                        (0.85 + 0.15 * Math.sin(
                            now * lit.speed + lit.phase
                        ));

                    context.fillStyle = lit.warm
                        ? 'rgba(255, 219, 166, ' + alpha.toFixed(3) + ')'
                        : 'rgba(188, 214, 255, ' + alpha.toFixed(3) + ')';
                    context.fillRect(lit.x, lit.y, lit.w, lit.h);
                }

                for (let i = 0; i < signs.length; i += 1) {
                    const sign = signs[i];
                    const rgb = sign.color;
                    const pulse = 0.7 + 0.3 * Math.sin(
                        now * sign.speed + sign.phase
                    );
                    const reach = Math.max(sign.w, sign.h) * 2.6;

                    context.globalAlpha = 0.27 * pulse;
                    context.drawImage(
                        sign.sprite,
                        sign.x - reach, sign.y - reach,
                        reach * 2, reach * 2
                    );
                    context.globalAlpha = 1;

                    context.fillStyle = 'rgba(' + rgb[0] + ', ' +
                        Math.min(255, rgb[1] + 30) + ', ' +
                        Math.min(255, rgb[2] + 30) + ', ' +
                        (0.42 * pulse).toFixed(3) + ')';
                    context.fillRect(
                        sign.x - sign.w / 2, sign.y - sign.h / 2,
                        sign.w, sign.h
                    );
                }

                for (let i = 0; i < lamps.length; i += 1) {
                    const lamp = lamps[i];
                    // Two beat frequencies, so a lamp stutters rather than
                    // breathing as one smooth pulse with all the others.
                    const flicker = 0.7 +
                        0.3 * Math.sin(now * lamp.speed + lamp.phase) *
                        (0.7 + 0.3 * Math.sin(
                            now * lamp.speed * 2.3 + lamp.phase
                        ));
                    const alpha = lamp.alpha * flicker;
                    const radius = lamp.radius *
                        (0.92 + 0.08 * Math.sin(
                            now * 0.0003 + lamp.phase
                        ));
                    const y = lamp.y +
                        Math.sin(now * 0.0002 + lamp.phase) * height * 0.005;
                    const warm = lamp.warmth;
                    const lr = Math.round(240 + 15 * warm);
                    const lg = Math.round(238 - 42 * warm);
                    const lb = Math.round(225 - 105 * warm);

                    context.save();
                    context.translate(lamp.x, y);
                    context.scale(1, 1.6);
                    const glow = context.createRadialGradient(
                        0, 0, 0, 0, 0, radius
                    );

                    glow.addColorStop(0, 'rgba(' + lr + ', ' + lg + ', ' +
                        lb + ', ' + alpha.toFixed(3) + ')');
                    glow.addColorStop(0.35, 'rgba(' + lr + ', ' +
                        Math.max(0, lg - 22) + ', ' + Math.max(0, lb - 26) +
                        ', ' + (alpha * 0.45).toFixed(3) + ')');
                    glow.addColorStop(1, 'rgba(' + lr + ', ' +
                        Math.max(0, lg - 30) + ', ' + Math.max(0, lb - 36) +
                        ', 0)');
                    context.fillStyle = glow;
                    context.fillRect(-radius, -radius, radius * 2, radius * 2);
                    context.restore();

                    context.fillStyle = 'rgba(' + lr + ', ' +
                        Math.min(255, lg + 16) + ', ' +
                        Math.min(255, lb + 30) + ', ' +
                        Math.min(0.7, alpha * 1.8).toFixed(3) + ')';
                    context.beginPath();
                    context.arc(lamp.x, y, 2, 0, Math.PI * 2);
                    context.fill();
                }

                // Traffic lights, alternating red and green on their own slow
                // clocks rather than in step.
                for (let i = 0; i < signals.length; i += 1) {
                    const signal = signals[i];
                    const cycle = Math.sin(now * 0.00016 + signal.phase);
                    const rgb = cycle > 0 ? [110, 240, 150] : [255, 96, 84];
                    const alpha = 0.4 + 0.12 * Math.abs(cycle);

                    context.globalAlpha = alpha * 0.5;
                    context.drawImage(
                        cycle > 0 ? signal.green : signal.red,
                        signal.x - 9, signal.y - 9, 18, 18
                    );
                    context.globalAlpha = 1;

                    context.fillStyle = 'rgba(' + rgb[0] + ', ' + rgb[1] +
                        ', ' + rgb[2] + ', ' + alpha.toFixed(3) + ')';
                    context.beginPath();
                    context.arc(signal.x, signal.y, 1.8, 0, Math.PI * 2);
                    context.fill();
                }
            }

        }

        function seedBanks() {
            const fog = type === 'fog';
            // Fewer, larger banks: the drift is the effect, and every extra
            // bank is another full-frame gradient fill.
            const count = fog ? 5 : 6;

            banks = [];

            for (let i = 0; i < count; i += 1) {
                banks.push({
                    // Spread evenly, then jittered: random placement left gaps
                    // where the frame had no bank at all.
                    x: (i + 0.2 + Math.random() * 0.6) / count *
                        canvas.width,
                    // Fog hugs the lower half; cloud masses cross the sky.
                    y: fog
                        ? 0.58 + Math.random() * 0.42
                        : 0.05 + Math.random() * 0.75,
                    radius: (fog ? 0.3 : 0.18) +
                        Math.random() * (fog ? 0.28 : 0.16),
                    speed: (fog ? 2.5 : 5) + Math.random() * (fog ? 4 : 9),
                    phase: Math.random() * Math.PI * 2,
                    alpha: (fog ? 0.18 : 0.2) +
                        Math.random() * (fog ? 0.12 : 0.1)
                });
            }
        }

        // Midpoint displacement, the standard fractal model of a strike: the
        // same channel shape the background fractal draws, at page scale.
        function buildFlash() {
            flashX = 0.18 + Math.random() * 0.64;

            let points = [
                [flashX, -0.04],
                [flashX + (Math.random() - 0.5) * 0.12, 1.04]
            ];

            for (let depth = 0; depth < 5; depth += 1) {
                const next = [points[0]];

                for (let i = 1; i < points.length; i += 1) {
                    const a = points[i - 1];
                    const b = points[i];

                    next.push([
                        (a[0] + b[0]) / 2 +
                            (Math.random() - 0.5) * (0.16 / (depth + 1)),
                        (a[1] + b[1]) / 2
                    ]);
                    next.push(b);
                }

                points = next;
            }

            flashPath = points;

            // One branch leaving the main channel, so the strike forks.
            const origin = Math.floor(
                points.length * (0.3 + Math.random() * 0.3)
            );
            let bx = points[origin][0];
            let by = points[origin][1];

            flashBranch = [points[origin]];

            for (let step = 0; step < 5; step += 1) {
                bx += (Math.random() - 0.4) * 0.1;
                by += 0.03 + Math.random() * 0.02;
                flashBranch.push([bx, by]);
            }
        }

        // Sheet flash, then the channel, flickering out in under a second.
        function drawStormFlash(now, r, g, b) {
            if (now >= nextFlash) {
                flashStart = now;
                nextFlash = now + 7000 + Math.random() * 12000;
                buildFlash();
            }

            if (!flashStart) {
                return;
            }

            const age = now - flashStart;

            if (age > 900) {
                flashStart = 0;
                return;
            }

            const pulse = age < 80 ? 1 :
                age < 160 ? 0.2 :
                    age < 240 ? 0.9 :
                        0.9 * Math.max(0, 1 - (age - 240) / 660);

            if (pulse <= 0) {
                return;
            }

            const sheet = context.createRadialGradient(
                flashX * canvas.width,
                canvas.height * 0.1,
                0,
                flashX * canvas.width,
                canvas.height * 0.1,
                canvas.height * 1.1
            );

            sheet.addColorStop(0, 'rgba(' + r + ', ' + g + ', ' + b +
                ', ' + (0.55 * pulse).toFixed(3) + ')');
            sheet.addColorStop(0.5, 'rgba(' + r + ', ' + g + ', ' + b +
                ', ' + (0.24 * pulse).toFixed(3) + ')');
            sheet.addColorStop(1, 'rgba(' + r + ', ' + g + ', ' + b + ', 0)');
            context.fillStyle = sheet;
            context.fillRect(0, 0, canvas.width, canvas.height);

            context.strokeStyle = 'rgba(240, 247, 255, ' +
                (0.75 * pulse).toFixed(3) + ')';
            context.lineWidth = 2;
            context.lineJoin = 'round';
            context.shadowColor = 'rgba(' + r + ', ' + g + ', ' + b +
                ', ' + (0.7 * pulse).toFixed(3) + ')';
            context.shadowBlur = 18;
            context.beginPath();

            for (let i = 0; i < flashPath.length; i += 1) {
                const point = flashPath[i];
                const x = point[0] * canvas.width;
                const y = Math.max(0, point[1]) * canvas.height;

                if (i === 0) {
                    context.moveTo(x, y);
                } else {
                    context.lineTo(x, y);
                }
            }

            context.stroke();

            if (flashBranch.length > 1) {
                context.strokeStyle = 'rgba(226, 238, 255, ' +
                    (0.34 * pulse).toFixed(3) + ')';
                context.lineWidth = 1.1;
                context.beginPath();

                for (let i = 0; i < flashBranch.length; i += 1) {
                    const point = flashBranch[i];
                    const x = point[0] * canvas.width;
                    const y = Math.max(0, point[1]) * canvas.height;

                    if (i === 0) {
                        context.moveTo(x, y);
                    } else {
                        context.lineTo(x, y);
                    }
                }

                context.stroke();
            }

            context.shadowBlur = 0;
        }

        function draw() {
            if (!running) {
                return;
            }

            if (!onScreen) {
                frame = window.requestAnimationFrame(draw);
                return;
            }

            const now = performance.now();

            // Fog, cloud and city move slowly enough that sixty frames a
            // second is wasted work: they repaint about twenty times instead,
            // which takes the most expensive fields from ~4 ms a frame to
            // ~1.5 ms without a visible change in motion.
            if ((type === 'fog' || type === 'cloudy' || type === 'city') &&
                now - (draw.lastPaint || 0) < 48) {
                frame = window.requestAnimationFrame(draw);
                return;
            }

            draw.lastPaint = now;
            context.clearRect(0, 0, canvas.width, canvas.height);
            const delta = Math.min((now - (draw.lastTime || now)) / 16.67, 3.5);
            draw.lastTime = now;

            const light = currentLight;
            const tint = light ? light.tint : 0;
            const lightR = light ? light.r : 195;
            const lightG = light ? light.g : 225;
            const lightB = light ? light.b : 248;
            const rainR = mixChannel(195, lightR, tint);
            const rainG = mixChannel(225, lightG, tint);
            const rainB = mixChannel(248, lightB, tint);
            const snowR = mixChannel(255, lightR, tint * 0.45);
            const snowG = mixChannel(255, lightG, tint * 0.45);
            const snowB = mixChannel(255, lightB, tint * 0.45);
            const starR = mixChannel(230, lightR, tint * 0.55);
            const starG = mixChannel(243, lightG, tint * 0.55);
            const starB = mixChannel(255, lightB, tint * 0.55);

            if (type === 'rain' || type === 'storm') {
                context.lineCap = 'round';
                context.lineWidth = 1.2;

                if (now >= nextSpawn) {
                    spawnRainBurst();
                    const boosted = now < rainBoostUntil;
                    const heightScale = Math.max(1, canvas.height / 320);
                    nextSpawn = now + ((boosted ? 25 : (isNight ? 30 : 45)) +
                        Math.random() * (boosted ? 25 : (isNight ? 45 : 90))) /
                        (rainMultiplier * heightScale);
                }

                const angle = (mouseX - 0.5) * 0.9;
                const speedBoost = 1 + Math.min(Math.abs(scrollVelocity) * 0.6, 2.0);

                for (let i = particles.length - 1; i >= 0; i--) {
                    const drop = particles[i];
                    const x2 = drop.x + Math.sin(angle) * drop.length * 0.5;
                    const proximity = light
                        ? 1 - Math.min(1, Math.abs(
                            drop.x / canvas.width - light.x / 100
                        ) * 1.3)
                        : 0.5;
                    const shade = 0.78 + 0.42 * proximity;

                    context.strokeStyle = 'rgba(' + rainR + ', ' + rainG + ', ' +
                        rainB + ', ' +
                        Math.min(1, drop.opacity * shade).toFixed(3) + ')';
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

                if (type === 'storm') {
                    drawStormFlash(now, rainR, rainG, rainB);
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
                    const proximity = light
                        ? 1 - Math.min(1, Math.abs(
                            flake.x / canvas.width - light.x / 100
                        ) * 1.3)
                        : 0.5;
                    const shade = 0.8 + 0.38 * proximity;

                    flake.y += flake.speed * delta;
                    flake.x += (flake.drift + sway + wind) * delta;

                    context.fillStyle = 'rgba(' + snowR + ', ' + snowG + ', ' +
                        snowB + ', ' +
                        Math.min(1, flake.opacity * shade).toFixed(3) + ')';
                    context.shadowColor = 'rgba(' + snowR + ', ' + snowG + ', ' +
                        snowB + ', 0.7)';
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
            } else if (type === 'fog') {
                for (let i = 0; i < banks.length; i += 1) {
                    const bank = banks[i];
                    const radius = bank.radius * canvas.width;
                    const span = canvas.width + radius * 2;
                    const x = ((bank.x + now * 0.001 * bank.speed) % span +
                        span) % span - radius;
                    const y = bank.y * canvas.height +
                        Math.sin(now * 0.00009 + bank.phase) *
                        canvas.height * 0.02;

                    // Flattened into banks and kept low over the photograph.
                    context.save();
                    context.translate(x, y);
                    context.scale(1, 0.42);
                    const haze = context.createRadialGradient(
                        0, 0, 0, 0, 0, radius
                    );

                    haze.addColorStop(0, 'rgba(208, 224, 230, ' +
                        bank.alpha.toFixed(3) + ')');
                    haze.addColorStop(0.55, 'rgba(196, 214, 222, ' +
                        (bank.alpha * 0.45).toFixed(3) + ')');
                    haze.addColorStop(1, 'rgba(190, 208, 218, 0)');
                    context.fillStyle = haze;
                    context.fillRect(-radius, -radius, radius * 2, radius * 2);
                    context.restore();
                }
            } else if (type === 'cloudy') {
                for (let i = 0; i < banks.length; i += 1) {
                    const bank = banks[i];
                    const radius = bank.radius * canvas.width;
                    const span = canvas.width + radius * 2;
                    const x = ((bank.x + now * 0.001 * bank.speed) % span +
                        span) % span - radius;
                    const y = bank.y * canvas.height +
                        Math.sin(now * 0.00006 + bank.phase) *
                        canvas.height * 0.03;

                    // Pale masses rather than shadow: the photograph is
                    // already dark, so a darker overlay would not read at all.
                    context.save();
                    context.translate(x, y);
                    context.scale(1, 0.5);
                    const shade = context.createRadialGradient(
                        0, 0, 0, 0, 0, radius
                    );

                    shade.addColorStop(0, 'rgba(188, 202, 214, ' +
                        bank.alpha.toFixed(3) + ')');
                    shade.addColorStop(0.6, 'rgba(176, 192, 206, ' +
                        (bank.alpha * 0.4).toFixed(3) + ')');
                    shade.addColorStop(1, 'rgba(168, 184, 200, 0)');
                    context.fillStyle = shade;
                    context.fillRect(-radius, -radius, radius * 2, radius * 2);
                    context.restore();
                }
            } else if (type === 'city') {
                drawCity(now, delta);
            } else {
                particles.forEach(function (star) {
                    const twinkle = 0.25 + (Math.sin(now * star.twinkleSpeed + star.phase) + 1) * 0.36;
                    const opacity = star.opacity * twinkle;

                    context.fillStyle = 'rgba(' + starR + ', ' + starG + ', ' +
                        starB + ', ' + opacity.toFixed(3) + ')';
                    context.shadowColor = 'rgba(' + starR + ', ' + starG + ', ' +
                        starB + ', ' + (opacity * 0.65).toFixed(3) + ')';
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

        return function () {
            if (screenWatcher) {
                screenWatcher.disconnect();
            }
            stop();
        };
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
            ? 'アイウエオカキクケコサシスセソタチツチE��ナニヌネノハヒフヘ�Eマミムメモヤユヨラリルレロワン'
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
            if (group.active) {
                group.columns.forEach(function (column) {
                    const head = group.y + column.offset;

                    for (let tail = column.length - 1; tail >= 0; tail--) {
                        const y = head - tail * 18;

                        if (y < -18 || y > matrixRainCanvas.height + 18) {
                            continue;
                        }

                        const isHead = tail === 0;
                        const alpha = 0.035 + (1 - tail / column.length) * 0.24;
                        // Matrix green, with the leading glyph the pale end of
                        // the same hue and the trail fading through opacity.
                        context.fillStyle = isHead
                            ? 'rgba(214, 255, 224, 0.85)'
                            : 'rgba(0, 255, 65, ' + alpha.toFixed(3) + ')';
                        context.fillText(column.glyphs[tail], column.x, y);

                        if (Math.random() < 0.035) {
                            column.glyphs[tail] = randomMatrixGlyph();
                        }
                    }
                });
            }

            // Dark streams still fall, so the bottom edge re-rolls them back on.
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
            syncCityAmbience();
            return;
        }

        if (matrixRainCanvas) {
            syncCityAmbience();
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

        syncCityAmbience();
    }

    syncMatrixRain();
    window.setInterval(syncMatrixRain, 30000);
    reducedMotion.addEventListener('change', syncMatrixRain);

    // -----------------------------------------------------------------------
    // Weather effects remain off until a weather response confirms a scene;
    // the Konami rain surge only affects active rain.
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
            hero: 'city-night.jpg',
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
            hero: 'city-sunrise.jpg',
            background: 'sunrise-background.jpeg'
        },
        sunset: {
            hero: 'city-sunset.jpg',
            background: 'sunset-background.jpeg'
        },
        fog: {
            hero: 'city-fog.jpg',
            background: 'cloudy-background.jpeg'
        },
        storm: {
            hero: 'city-storm.jpg',
            background: 'cloudy-background.jpeg'
        },
        twilight: {
            hero: 'city-twilight.jpg',
            background: 'night-background.jpeg'
        },
        'cloudy-night': {
            hero: 'city-cloudy-night.jpg',
            background: 'night-background.jpeg'
        },
        'foggy-night': {
            hero: 'city-fog-night.jpg',
            background: 'night-background.jpeg'
        },
        'foggy-sunrise': {
            hero: 'city-fog-sunrise.jpg',
            background: 'sunrise-background.jpeg'
        },
        'rainy-night': {
            hero: 'city-rain-night.jpg',
            background: 'night-background.jpeg'
        },
        'snowy-night': {
            hero: 'city-snow-night.jpg',
            background: 'night-background.jpeg'
        },
        'stormy-night': {
            hero: 'city-storm-night.jpg',
            background: 'night-background.jpeg'
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
        const now = new Date();
        const minutesNow = current === null
            ? now.getHours() * 60 + now.getMinutes()
            : current;
        const hour = Math.floor(minutesNow / 60);

        if (isNearTime(minutesNow, sunrise)) {
            return 'sunrise';
        }

        if (isNearTime(minutesNow, sunset)) {
            return 'sunset';
        }

        if (data.isDay === false || data.isDay === 0 || data.isDay === '0') {
            return 'night';
        }

        // Some providers (notably wttr.in) do not send a day/night flag, so
        // fall back to the sun's own schedule instead of guessing from a
        // fixed hour. Without this, sunset at 4:36 PM still rendered a
        // daytime hero until 8:00 PM.
        if (data.isDay == null) {
            if (sunrise !== null && sunset !== null) {
                return (minutesNow < sunrise || minutesNow >= sunset)
                    ? 'night'
                    : 'day';
            }
            if (hour >= 5 && hour < 8) {
                return 'sunrise';
            }
            if (hour >= 17 && hour < 20) {
                return 'sunset';
            }
            if (hour < 6 || hour >= 20) {
                return 'night';
            }
        }

        return 'day';
    }

    function getWeatherScene(data) {
        const timeScene = getTimeScene(data);

        const code = data.code;
        const condition = String(data.condition || '').toLowerCase();

        // Night: let weather layer on top instead of ignoring it.
        if (timeScene === 'night') {
            if (/snow|sleet|blizzard|ice pellets/.test(condition) ||
                [71, 73, 75, 77, 85, 86].indexOf(code) !== -1) {
                return 'snowy-night';
            }
            if (/thunder/.test(condition) ||
                [95, 96, 99].indexOf(code) !== -1) {
                return 'stormy-night';
            }
            if (/rain|drizzle|shower/.test(condition) ||
                isRainCode(code)) {
                return 'rainy-night';
            }
            if (/fog|mist/.test(condition) ||
                [45, 48].indexOf(code) !== -1) {
                return 'foggy-night';
            }
            if (/cloud|overcast/.test(condition) ||
                [2, 3].indexOf(code) !== -1) {
                return 'cloudy-night';
            }
            return 'night';
        }

        // Sunrise + fog gets its own dedicated hero.
        if (timeScene === 'sunrise' &&
            (/fog|mist/.test(condition) ||
             [45, 48].indexOf(code) !== -1)) {
            return 'foggy-sunrise';
        }

        // Day / sunrise / sunset: weather overrides time.
        if (/snow|sleet|blizzard|ice pellets/.test(condition) ||
            [71, 73, 75, 77, 85, 86].indexOf(code) !== -1) {
            return 'snow';
        }

        if (/thunder/.test(condition) ||
            [95, 96, 99].indexOf(code) !== -1) {
            return 'storm';
        }

        if (/rain|drizzle|shower/.test(condition) || isRainCode(code)) {
            return 'rain';
        }

        if (/fog|mist/.test(condition) ||
            [45, 48].indexOf(code) !== -1) {
            return 'fog';
        }

        if (/cloud|overcast/.test(condition) ||
            [2, 3].indexOf(code) !== -1) {
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

        // Thunder keeps the rain it falls with, and adds the strike.
        if (/thunder|lightning/.test(condition) ||
            [95, 96, 99].indexOf(code) !== -1) {
            return 'storm';
        }

        if (/fog|mist|haze/.test(condition) ||
            [45, 48].indexOf(code) !== -1) {
            return 'fog';
        }

        if (/rain|drizzle|shower/.test(condition) || isRainCode(code)) {
            return 'rain';
        }

        if (/cloud|overcast/.test(condition) ||
            [2, 3].indexOf(code) !== -1) {
            return 'cloudy';
        }

        return null;
    }

    function insertMobileSuffix(name, suffix) {
        if (!suffix) return name;
        return name.replace(/(\.[^.]+)$/, suffix + '$1');
    }

    function setWeatherScene(data) {
        const scene = getWeatherScene(data);
        const images = sceneImages[scene] || sceneImages[getTimeScene(data)];
        const imageRoot = document.body.dataset.imageRoot || '/assets/images/';
        const isMobile = window.matchMedia('(max-width: 768px)').matches;
        const suffix = isMobile ? '.mobile' : '';
        const heroName = insertMobileSuffix(images.hero, suffix);
        const bgName = insertMobileSuffix(images.background, suffix);

        document.body.dataset.weatherScene = scene;
        document.body.style.setProperty(
            '--weather-background-image',
            'url("' + imageRoot + bgName + '")'
        );

        if (document.body.classList.contains('home-page')) {
            document.body.style.setProperty(
                '--weather-home-image',
                'url("' + imageRoot + heroName + '")'
            );
        }

        return scene;
    }

    const storedInitialScene = getStoredScene();
    if (storedInitialScene) {
        document.body.dataset.weatherScene = storedInitialScene.scene;
        const storedImages = sceneImages[storedInitialScene.scene];
        if (storedImages) {
            const imageRoot = document.body.dataset.imageRoot || '/assets/images/';
            const isMobile = window.matchMedia('(max-width: 768px)').matches;
            const suffix = isMobile ? '.mobile' : '';
            document.body.style.setProperty(
                '--weather-background-image',
                'url("' + imageRoot + insertMobileSuffix(storedImages.background, suffix) + '")'
            );
            if (document.body.classList.contains('home-page')) {
                document.body.style.setProperty(
                    '--weather-home-image',
                    'url("' + imageRoot + insertMobileSuffix(storedImages.hero, suffix) + '")'
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
            ['rain', 'snow', 'stars', 'fog', 'cloudy', 'storm']
                .indexOf(scene) === -1) {
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
        const scene = getWeatherScene(data);
        const currentTimeScene = getTimeScene(data);
        const precipitation = getWeatherEffectScene(data);
        const effectScene = precipitation || (scene === 'night' ? 'stars' : null);

        setWeatherRefreshing(false);
        updateWeatherDisplay(data, condition, temp);

        // Reset on every update: a one-way boost used to leave every rain
        // spell after the first 30% denser than it should be.
        rainMultiplier = precipitation === 'rain' ? 1.3 : 1;

        function applyScene() {
            setWeatherScene(data);
        }

        // Determine if a transition should happen.
        // Transition whenever the scene changed. No adjacency check, no
        // time window, no state tracking. Replay on reload is fine.
        if (previousScene && previousScene !== scene) {
            // Stop existing weather effects immediately so they do not show
            // during the transition, and defer the new canvas until it ends.
            setWeatherEffect(null);
            runTimelapse(previousScene, applyScene).then(function () {
                setWeatherEffect(effectScene);
            });
        } else {
            applyScene();
            setWeatherEffect(effectScene);
        }

        storeScene(scene, window.location.pathname || '/', currentTimeScene);
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

    function readWttrCoordinate(value) {
        if (value === null || value === undefined) {
            return null;
        }

        if (Array.isArray(value)) {
            value = value[0];
        }

        if (value && typeof value === 'object') {
            value = value.value;
        }

        const parsed = parseFloat(value);

        return isFinite(parsed) ? parsed : null;
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
                    const wttrLat = readWttrCoordinate(
                        nearestArea && nearestArea.latitude
                    );
                    const wttrLon = readWttrCoordinate(
                        nearestArea && nearestArea.longitude
                    );

                    if (wttrLat !== null && wttrLon !== null) {
                        weatherCoordinates = {
                            latitude: wttrLat,
                            longitude: wttrLon
                        };
                        updateIllumination();
                    }

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

    updateIllumination();
    window.setInterval(updateIllumination, 30000);
    document.addEventListener('visibilitychange', function () {
        if (!document.hidden) {
            updateIllumination();
        }
    });

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
                updateIllumination();
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
    // City ambience
    // -----------------------------------------------------------------------
    // Street lamps for everywhere except a city. The weather stack gives a
    // place name (the IANA zone is a city by construction), so this asks the
    // geocoding API behind Open-Meteo's own place names for its population, at
    // most once per session, and lights the field only below CITY_POPULATION:
    // drawing a skyline for someone already sitting in one is scenery they can
    // look up and see. The lights are the escape, so they belong to the quiet
    // places, and a metro gets the page's own darks instead.
    const CITY_POPULATION = 300000;
    const CITY_CACHE_KEY = 'asarav:metro';

    function readMetroCache(name) {
        try {
            const raw = window.sessionStorage.getItem(CITY_CACHE_KEY);
            const cached = raw ? JSON.parse(raw) : null;

            if (cached && cached.name === name &&
                typeof cached.metro === 'boolean') {
                return cached.metro;
            }
        } catch (error) {
            return undefined;
        }

        return undefined;
    }

    function writeMetroCache(name, metro) {
        try {
            window.sessionStorage.setItem(CITY_CACHE_KEY, JSON.stringify({
                name: name,
                metro: metro
            }));
        } catch (error) {
            // Private mode or a full store: the lookup simply repeats.
        }
    }

    function isMetroPlace(name) {
        const cached = readMetroCache(name);

        if (cached !== undefined) {
            return Promise.resolve(cached);
        }

        const url = 'https://geocoding-api.open-meteo.com/v1/search?name=' +
            encodeURIComponent(name) + '&count=1&language=en&format=json';

        return fetch(url)
            .then(function (response) { return response.json(); })
            .then(function (json) {
                const place = json && json.results && json.results[0];
                const population = place ? Number(place.population) : NaN;

                if (!isFinite(population)) {
                    // A name the gazetteer cannot match: not known to be a city,
                    // but not known to be a village either, so nothing is drawn
                    // and the lookup is left uncached to be retried.
                    return null;
                }

                const metro = population >= CITY_POPULATION;

                writeMetroCache(name, metro);

                return metro;
            })
            .catch(function () {
                // Offline or blocked: no lights rather than guessed lights.
                return null;
            });
    }

    function startCityAmbience() {
        const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
        const name = getTimezoneCity({}, zone);

        if (!name || name === 'Local time' || /^Etc\//.test(zone) ||
            !/[a-z]/i.test(name)) {
            return;
        }

        isMetroPlace(name).then(function (metro) {
            cityMetro = metro;
            syncCityAmbience();
        });
    }

    // One city layer, kept in step with the other full-screen effects: the
    // matrix glyph field owns the screen after 23:30, reduced motion turns
    // animation off entirely, and the weather canvases are started separately.
    // The stop handle makes this idempotent, so a second sync cannot stack a
    // second set of lamps on the first.
    function syncCityAmbience() {
        // Strictly `false`: a failed lookup leaves cityMetro null, and lighting
        // the field for a place we could not identify is exactly what this must
        // not do when the unknown might be a city.
        const shouldRun = cityMetro === false &&
            !matrixRainCanvas &&
            !reducedMotion.matches;

        if (!shouldRun) {
            if (cityStop) {
                cityStop();
                cityStop = null;
            }

            return;
        }

        if (!cityStop) {
            cityStop = startCityCanvases();
        }
    }

    // The page background only: a photograph is its own composition, and a
    // skyline drawn over it reads as a stain rather than ambience. The hero
    // keeps its picture; the city lives in the dark space around the content.
    function startCityCanvases() {
        return startWeatherCanvas(document.body, 'city');
    }

    startCityAmbience();

    // -----------------------------------------------------------------------
    // Hero shine effect
    // -----------------------------------------------------------------------
    function setupShine(hero) {
        if (!hero || hero.querySelector('.page-top__shine')) {
            return;
        }

        const light = document.createElement('div');
        light.className = 'page-top__light';
        hero.insertBefore(light, hero.firstChild);

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

    // -----------------------------------------------------------------------
    // Firefox fallback for page transitions (View Transitions API not supported)
    // -----------------------------------------------------------------------
    if (!('startViewTransition' in document)) {
        document.body.classList.add('page-transition-fade');

        document.addEventListener('click', function (event) {
            const link = event.target.closest('a[href]');
            if (!link) {
                return;
            }
            const href = link.getAttribute('href');
            if (!href || href.charAt(0) === '#' ||
                href.indexOf('mailto:') === 0) {
                return;
            }
            // Only handle same-origin navigations.
            try {
                const url = new URL(href, window.location.href);
                if (url.origin !== window.location.origin) {
                    return;
                }
                if (url.pathname === window.location.pathname &&
                    url.search === window.location.search) {
                    return;
                }
            } catch (e) {
                return;
            }
            event.preventDefault();
            document.body.style.transition = 'opacity 0.2s ease';
            document.body.style.opacity = '0';
            window.setTimeout(function () {
                window.location.href = link.href;
            }, 200);
        });
    }

})();
// -----------------------------------------------------------------------
// Cheap parallax depth on the hero floor number
// -----------------------------------------------------------------------
(function () {
    try {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        if ('ontouchstart' in window || navigator.maxTouchPoints > 0) return;

        var hero = document.querySelector('.page-top');
        var floor = document.querySelector('.hero-floor, .hero-floor--label');
        if (!hero || !floor) return;

        var targetX = 0, targetY = 0;
        var curX = 0, curY = 0;
        var raf = 0;

        function onMove(e) {
            var r = hero.getBoundingClientRect();
            targetX = (e.clientX - (r.left + r.width / 2)) / r.width;
            targetY = (e.clientY - (r.top + r.height / 2)) / r.height;
        }

        function tick() {
            curX += (targetX - curX) * 0.06;
            curY += (targetY - curY) * 0.06;
            var x = (curX * 10).toFixed(2);
            var y = (curY * 6).toFixed(2);
            floor.style.transform = 'translate3d(' + x + 'px, ' + y + 'px, 0)';
            raf = requestAnimationFrame(tick);
        }

        window.addEventListener('mousemove', onMove, { passive: true });
        raf = requestAnimationFrame(tick);

        window.addEventListener('pagehide', function () {
            if (raf) cancelAnimationFrame(raf);
        });
    } catch (e) {}
})();
