(function () {
    'use strict';

    // -----------------------------------------------------------------------
    // Holiday fireworks
    // -----------------------------------------------------------------------
    // A short show on the handful of nights that call for one: New Year's Eve
    // and Day, Christmas Eve and Day, and the Fourth of July. Nothing is added
    // to the page unless the date and the night scene both agree, the whole
    // thing draws inside the hero above its photograph, and the canvas removes
    // itself once the last spark dies.
    //
    // One show per occasion per visit: the occasion is remembered for the rest
    // of the browsing session, so moving between pages does not replay it, but
    // a later visit on the same night does.

    // Month (0-based) and day, local time.
    const HOLIDAY_NIGHTS = {
        '0-1': true,
        '6-4': true,
        '11-24': true,
        '11-25': true,
        '11-31': true
    };

    // Seconds after the show starts at which each shell goes up.
    const SHELL_TIMES = [0.3, 0.8, 1.25, 1.75, 2.3, 2.85, 3.4, 4.0, 4.55];
    const SHOW_TAIL = 3.4;
    const GRAVITY = 58;
    const DRAG = 0.87;
    const MAX_ATTEMPTS = 12;

    const WHITE = '#ffffff';
    const INK = '#071219';

    // Each shell is one of these. Counts, launch speeds and lifetimes are per
    // spark, so the show never looks like the same burst nine times.
    const SHELL_KINDS = [
        // Dense sphere of solid colour.
        { name: 'peony', count: [110, 140], speed: [125, 250], life: [1.05, 1.6], trail: 6 },
        // Same silhouette, but every spark keeps a long tail.
        { name: 'chrysanthemum', count: [86, 110], speed: [110, 225], life: [1.4, 2.1], trail: 12 },
        // Few, slow, warm, and heavy: the sparks droop into a curtain.
        { name: 'willow', count: [42, 58], speed: [95, 175], life: [2.0, 2.8], trail: 14, gravity: 1.55 },
        // A single tilted ring, read as a disc seen from the side.
        { name: 'ring', count: [62, 78], speed: [165, 185], life: [1.2, 1.7], trail: 4, ring: true, gradient: true },
        // Two rings at different tilts and colours.
        { name: 'double-ring', count: [84, 100], speed: [150, 195], life: [1.25, 1.75], trail: 4, ring: true, gradient: true, twin: true },
        // Eight heavy sparks that split into small clusters.
        { name: 'crossette', count: [16, 22], speed: [135, 200], life: [0.55, 0.7], trail: 10, splits: 7 },
        // Pale, blinking, sparse: reads as crackle rather than a solid shell.
        { name: 'strobe', count: [78, 102], speed: [70, 175], life: [1.7, 2.5], trail: 2, flicker: true, pale: true },
        // Slow, thick, gold streamers that arc over and fall away.
        { name: 'palm', count: [28, 40], speed: [155, 265], life: [1.9, 2.6], trail: 16, gravity: 1.8, thick: true }
    ];

    const SEEN_PREFIX = 'holiday-fireworks:';

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    let canvas = null;
    let attempts = 0;

    // Local calendar date, so New Year's Eve and New Year's Day are separate
    // occasions even though they share a night.
    function occasionKey() {
        const today = new Date();

        return today.getFullYear() + '-' +
            (today.getMonth() + 1) + '-' + today.getDate();
    }

    function store() {
        try {
            return window.sessionStorage;
        } catch (error) {
            // Storage can be blocked outright; then the show simply plays.
            return null;
        }
    }

    function hasSeen(key) {
        const session = store();

        if (!session) {
            return false;
        }

        try {
            return session.getItem(SEEN_PREFIX + key) === '1';
        } catch (error) {
            return false;
        }
    }

    function markSeen(key) {
        const session = store();

        if (!session) {
            return;
        }

        try {
            session.setItem(SEEN_PREFIX + key, '1');
        } catch (error) {
            // A full or disabled store just means it plays again next page.
        }
    }

    function isHoliday() {
        const today = new Date();

        return HOLIDAY_NIGHTS[today.getMonth() + '-' + today.getDate()] === true;
    }

    function isNightScene() {
        const scene = document.body.dataset.weatherScene || '';

        return scene.indexOf('night') !== -1;
    }

    // -----------------------------------------------------------------------
    // Colour
    // -----------------------------------------------------------------------

    function parse(hex, fallback) {
        const match = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(String(hex || '').trim());

        if (!match) {
            return fallback;
        }

        let digits = match[1];

        if (digits.length === 3) {
            digits = digits[0] + digits[0] + digits[1] + digits[1] +
                digits[2] + digits[2];
        }

        return [
            parseInt(digits.slice(0, 2), 16),
            parseInt(digits.slice(2, 4), 16),
            parseInt(digits.slice(4, 6), 16)
        ];
    }

    function hex(rgb) {
        return '#' + rgb.map(function (value) {
            const clamped = Math.max(0, Math.min(255, Math.round(value)));

            return (clamped < 16 ? '0' : '') + clamped.toString(16);
        }).join('');
    }

    function mix(from, to, amount) {
        const a = parse(from, [255, 255, 255]);
        const b = parse(to, [7, 18, 25]);

        return hex([
            a[0] + (b[0] - a[0]) * amount,
            a[1] + (b[1] - a[1]) * amount,
            a[2] + (b[2] - a[2]) * amount
        ]);
    }

    // The site's own tokens, each split into a deep body colour, the token
    // itself, and a pale highlight, so bursts have depth instead of one flat
    // hue per spark.
    function families() {
        const styles = window.getComputedStyle(document.body);

        function read(name, fallback) {
            return styles.getPropertyValue(name).trim() || fallback;
        }

        const ice = read('--ice', '#8fd0e8');
        const frost = read('--frost', '#dbf1fa');
        const signal = read('--signal', '#d14949');
        const amber = read('--amber', '#f0a64a');
        // Blue and red are the two brand anchors; between them lies a muted
        // violet that broadens the show without leaving the palette.
        const dusk = mix(ice, signal, 0.45);

        return [
            {
                deep: mix(ice, INK, 0.3),
                base: ice,
                light: mix(ice, WHITE, 0.55)
            },
            {
                deep: mix(ice, INK, 0.12),
                base: mix(ice, WHITE, 0.22),
                light: mix(frost, WHITE, 0.5)
            },
            {
                deep: mix(signal, INK, 0.18),
                base: signal,
                light: mix(signal, WHITE, 0.55)
            },
            {
                deep: mix(amber, INK, 0.22),
                base: amber,
                light: mix(amber, WHITE, 0.6)
            },
            {
                deep: mix(frost, INK, 0.32),
                base: frost,
                light: WHITE
            },
            {
                deep: mix(dusk, INK, 0.2),
                base: dusk,
                light: mix(dusk, WHITE, 0.5)
            }
        ];

    }

    // -----------------------------------------------------------------------

    function play(hero) {
        if (canvas) {
            return;
        }

        canvas = document.createElement('canvas');
        canvas.className = 'fireworks';
        canvas.setAttribute('aria-hidden', 'true');
        hero.insertBefore(canvas, hero.firstChild);

        const context = canvas.getContext('2d');

        if (!context) {
            canvas.remove();
            canvas = null;
            return;
        }

        const colors = families();

        // Shuffle the kinds so no show opens the same way twice.
        const deck = SHELL_KINDS.slice();

        for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const held = deck[i];

            deck[i] = deck[j];
            deck[j] = held;
        }

        const shells = SHELL_TIMES.map(function (at, index) {
            return { at: at, fired: false, kind: deck[index % deck.length] };
        });
        const rockets = [];
        const sparks = [];
        const flashes = [];

        let width = 0;
        let height = 0;
        let elapsed = 0;
        let previous = 0;
        let frame = 0;

        function random(min, max) {
            return min + Math.random() * (max - min);
        }

        function pickColor(family) {
            const roll = Math.random();

            if (roll < 0.55) {
                return family.base;
            }

            return roll < 0.88 ? family.light : family.deep;
        }

        function resize() {
            const scale = Math.min(window.devicePixelRatio || 1, 2);

            width = hero.clientWidth || window.innerWidth;
            height = hero.clientHeight || window.innerHeight;
            canvas.width = Math.round(width * scale);
            canvas.height = Math.round(height * scale);
            context.setTransform(scale, 0, 0, scale, 0, 0);
        }

        function launch(shell) {
            const kind = shell.kind;
            const primary = Math.floor(Math.random() * colors.length);

            rockets.push({
                kind: kind,
                family: colors[primary],
                accent: colors[(primary + 1 + Math.floor(Math.random() *
                    (colors.length - 1))) % colors.length],
                x: 0,
                y: height + 6,
                fromX: random(width * 0.12, width * 0.88),
                burstY: random(height * 0.18, height * 0.55),
                drift: random(-26, 26),
                progress: 0,
                duration: (height - height * 0.14) / random(500, 660),
                ember: 0
            });
        }

        function explode(rocket) {
            const kind = rocket.kind;
            // Pale shells trade the deep body colour for the highlight, so
            // they read as crackle instead of a solid ball.
            const family = kind.pale ? paler(rocket.family) : rocket.family;
            const accent = rocket.accent;
            const count = Math.round(random(kind.count[0], kind.count[1]));
            // Keep the bursts in proportion on a phone-sized hero.
            const scale = Math.max(0.68, Math.min(1.12, width / 1200));
            const tilt = random(-Math.PI, Math.PI);

            for (let i = 0; i < count; i++) {
                const around = (Math.PI * 2 * i) / count;
                let vx;
                let vy;

                if (kind.ring) {
                    // Rings are drawn as an ellipse and then rotated, so they
                    // look like a disc seen from the ground at an angle.
                    const twin = kind.twin === true && i % 2 === 1;
                    const angle = around + (twin ? 0.45 : 0);
                    const turn = twin ? -tilt : tilt;
                    const spin = Math.cos(turn);
                    const rise = Math.sin(turn);
                    const speed = random(kind.speed[0], kind.speed[1]) *
                        scale * (twin ? 0.86 : 1);
                    const localX = Math.cos(angle) * speed;
                    const localY = Math.sin(angle) * speed * 0.5;

                    vx = localX * spin - localY * rise;
                    vy = localX * rise + localY * spin;
                } else {
                    // Bias sparks outward so the shell reads as a dome, not a
                    // ring, and keep a spread of speeds so the inside fills.
                    const angle = around + random(-0.12, 0.12);
                    const reach = Math.pow(Math.random(), 0.55);
                    const speed = random(kind.speed[0], kind.speed[1]) *
                        scale * (0.34 + reach * 0.72);

                    vx = Math.cos(angle) * speed;
                    vy = Math.sin(angle) * speed;
                }

                const life = random(kind.life[0], kind.life[1]) * scale;
                let color;

                if (kind.gradient) {
                    // Ring colours sweep from one family to the other.
                    color = mix(family.base, accent.base, i / count);
                } else if (kind.pale) {
                    color = Math.random() < 0.6 ? family.light : WHITE;
                } else {
                    color = pickColor(family);
                }

                sparks.push({
                    x: rocket.x,
                    y: rocket.burstY,
                    px: rocket.x,
                    py: rocket.burstY,
                    vx: vx,
                    vy: vy,
                    life: life,
                    maxLife: life,
                    trail: [],
                    trailLength: kind.trail || 4,
                    color: color,
                    width: (kind.thick ? random(2.0, 2.6) : random(1.0, 1.7)) *
                        scale,
                    gravity: kind.gravity || 1,
                    flicker: kind.flicker === true,
                    phase: random(0, Math.PI * 2),
                    splits: kind.splits ? Math.round(random(kind.splits - 2, kind.splits + 2)) : 0,
                    splitColor: family.light
                });
            }

            // A scatter of tiny white glitter, so the edge of the burst
            // shimmers rather than stopping cleanly. Skipped once the sky is
            // already busy, since it is the cheapest detail to lose.
            const glitter = sparks.length > 700 ? 0 : Math.round(random(10, 18));

            for (let i = 0; i < glitter; i++) {
                const angle = random(0, Math.PI * 2);
                const speed = random(40, 150) * scale;
                const life = random(0.4, 0.9);

                sparks.push({
                    x: rocket.x + random(-8, 8),
                    y: rocket.burstY + random(-8, 8),
                    px: rocket.x,
                    py: rocket.burstY,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    life: life,
                    maxLife: life,
                    trail: [],
                    trailLength: 2,
                    color: WHITE,
                    width: random(0.8, 1.4) * scale,
                    gravity: 0.7,
                    flicker: true,
                    phase: random(0, Math.PI * 2),
                    splits: 0,
                    splitColor: WHITE
                });
            }

            flashes.push({
                x: rocket.x,
                y: rocket.burstY,
                radius: random(30, 74),
                life: 0.3,
                maxLife: 0.3,
                inner: family.light,
                outer: family.base
            });
        }

        function paler(family) {
            return {
                deep: family.base,
                base: family.light,
                light: WHITE
            };
        }

        function update(dt) {
            const drag = Math.pow(DRAG, dt);
            const scale = Math.max(0.68, Math.min(1.12, width / 1200));
            const pull = GRAVITY * scale * dt;

            for (let i = rockets.length - 1; i >= 0; i--) {
                const rocket = rockets[i];

                rocket.progress = Math.min(1, rocket.progress + dt / rocket.duration);
                rocket.x = rocket.fromX + rocket.drift * rocket.progress;
                rocket.y = (height + 6) -
                    (height + 6 - rocket.burstY) * rocket.progress;

                // A thin trail of embers left by the shell on its way up.
                rocket.ember += dt;

                if (rocket.ember > 0.05) {
                    const life = random(0.16, 0.36);

                    rocket.ember = 0;
                    sparks.push({
                        x: rocket.x + random(-2.5, 2.5),
                        y: rocket.y + random(0, 9),
                        px: rocket.x,
                        py: rocket.y,
                        vx: random(-20, 20),
                        vy: random(35, 95),
                        life: life,
                        maxLife: life,
                        trail: [],
                        trailLength: 2,
                        color: Math.random() < 0.5 ? WHITE : rocket.family.light,
                        width: 1,
                        gravity: 0.5,
                        flicker: false,
                        phase: 0,
                        splits: 0,
                        splitColor: WHITE
                    });
                }

                if (rocket.progress >= 1) {
                    explode(rocket);
                    rockets.splice(i, 1);
                }
            }

            for (let i = sparks.length - 1; i >= 0; i--) {
                const spark = sparks[i];

                spark.life -= dt;

                if (spark.life <= 0) {
                    // Crossette parents hand their energy to a small cluster,
                    // unless the sky is already carrying a heavy load.
                    if (spark.splits && sparks.length < 850) {
                        for (let n = 0; n < spark.splits; n++) {
                            const angle = (Math.PI * 2 * n) / spark.splits +
                                random(-0.3, 0.3);
                            const speed = random(45, 120) * scale;
                            const life = random(0.35, 0.65);

                            sparks.push({
                                x: spark.x,
                                y: spark.y,
                                px: spark.x,
                                py: spark.y,
                                vx: Math.cos(angle) * speed,
                                vy: Math.sin(angle) * speed,
                                life: life,
                                maxLife: life,
                                trail: [],
                                trailLength: 2,
                                color: Math.random() < 0.5 ?
                                    spark.splitColor : spark.color,
                                width: random(1, 1.6),
                                gravity: 1,
                                flicker: true,
                                phase: random(0, Math.PI * 2),
                                splits: 0,
                                splitColor: spark.splitColor
                            });
                        }
                    }

                    sparks.splice(i, 1);
                    continue;
                }

                spark.px = spark.x;
                spark.py = spark.y;
                spark.vx *= drag;
                spark.vy = spark.vy * drag + pull * spark.gravity;
                spark.trail.push(spark.px, spark.py);

                if (spark.trail.length > spark.trailLength * 2) {
                    spark.trail.splice(0, 2);
                }

                spark.x += spark.vx * dt;
                spark.y += spark.vy * dt;
            }

            for (let i = flashes.length - 1; i >= 0; i--) {
                flashes[i].life -= dt;

                if (flashes[i].life <= 0) {
                    flashes.splice(i, 1);
                }
            }
        }

        function trace(spark) {
            const trail = spark.trail;

            context.beginPath();

            if (trail.length >= 4) {
                context.moveTo(trail[0], trail[1]);

                for (let i = 2; i < trail.length; i += 2) {
                    context.lineTo(trail[i], trail[i + 1]);
                }
            } else {
                context.moveTo(spark.px, spark.py);
            }

            context.lineTo(spark.x, spark.y);
        }

        function draw() {
            // Fade what is already on the canvas instead of clearing it, so
            // each spark leaves a short tail behind it.
            context.globalCompositeOperation = 'destination-out';
            context.fillStyle = 'rgba(0, 0, 0, 0.2)';
            context.fillRect(0, 0, width, height);

            context.globalCompositeOperation = 'lighter';

            flashes.forEach(function (flash) {
                const remaining = flash.life / flash.maxLife;
                const radius = flash.radius * (1.4 - remaining * 0.6);
                const gradient = context.createRadialGradient(
                    flash.x, flash.y, 0,
                    flash.x, flash.y, radius
                );

                gradient.addColorStop(0, flash.inner);
                gradient.addColorStop(0.45, flash.outer);
                gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

                context.globalAlpha = 0.4 * remaining;
                context.fillStyle = gradient;
                context.beginPath();
                context.arc(flash.x, flash.y, radius, 0, Math.PI * 2);
                context.fill();
            });

            context.lineCap = 'round';

            // Rockets first, as glowing comets.
            rockets.forEach(function (rocket) {
                context.globalAlpha = 0.35;
                context.strokeStyle = rocket.family.light;
                context.lineWidth = 5;
                context.beginPath();
                context.moveTo(rocket.x, rocket.y);
                context.lineTo(rocket.x, rocket.y + 22);
                context.stroke();

                context.globalAlpha = 0.95;
                context.strokeStyle = WHITE;
                context.lineWidth = 1.6;
                context.beginPath();
                context.moveTo(rocket.x, rocket.y);
                context.lineTo(rocket.x, rocket.y + 12);
                context.stroke();
            });

            // Drop the outer glow pass on very busy frames: it is the most
            // expensive stroke and the least visible once sparks overlap.
            const layered = sparks.length < 640;

            sparks.forEach(function (spark) {
                const left = Math.max(0, spark.life / spark.maxLife);
                let alpha = Math.min(1, left * 1.8);

                if (spark.flicker) {
                    alpha *= 0.3 + 0.7 *
                        Math.abs(Math.sin(elapsed * 20 + spark.phase));
                }

                if (alpha <= 0.02) {
                    return;
                }

                if (layered) {
                    context.globalAlpha = alpha * 0.16;
                    context.lineWidth = spark.width * 3.6;
                    context.strokeStyle = spark.color;
                    trace(spark);
                    context.stroke();
                }

                context.globalAlpha = alpha * 0.95;
                context.lineWidth = spark.width;
                context.strokeStyle = spark.color;
                trace(spark);
                context.stroke();

                // A white-hot head while the spark is still fresh.
                if (left > 0.84) {
                    context.globalAlpha = (left - 0.84) * 5;
                    context.fillStyle = WHITE;
                    context.beginPath();
                    context.arc(spark.x, spark.y, spark.width * 0.95, 0, Math.PI * 2);
                    context.fill();
                }
            });

            context.globalAlpha = 1;
            context.globalCompositeOperation = 'source-over';
        }

        function stop() {
            window.cancelAnimationFrame(frame);
            window.removeEventListener('resize', resize);
            reducedMotion.removeEventListener('change', onMotionPreference);

            if (canvas) {
                canvas.remove();
                canvas = null;
            }
        }

        function onMotionPreference() {
            if (reducedMotion.matches) {
                stop();
            }
        }

        function tick(now) {
            if (!previous) {
                previous = now;
            }

            const dt = Math.min((now - previous) / 1000, 0.05);

            previous = now;
            elapsed += dt;

            shells.forEach(function (shell) {
                if (!shell.fired && elapsed >= shell.at) {
                    shell.fired = true;
                    launch(shell);
                }
            });

            update(dt);
            draw();

            if (elapsed > SHELL_TIMES[SHELL_TIMES.length - 1] + SHOW_TAIL) {
                stop();
                return;
            }

            frame = window.requestAnimationFrame(tick);
        }

        resize();
        window.addEventListener('resize', resize);
        reducedMotion.addEventListener('change', onMotionPreference);
        frame = window.requestAnimationFrame(tick);
    }

    function attempt() {
        if (canvas || reducedMotion.matches) {
            return;
        }

        // Already shown for this occasion during this visit.
        if (hasSeen(occasionKey())) {
            return;
        }

        const hero = document.querySelector('#content > .page-top');

        if (!isHoliday() || !isNightScene() || !hero) {
            // The weather scene is applied from a fetch (or, before the first
            // response, from the time of day), so give it a few seconds to
            // settle on night before giving up.
            attempts += 1;

            if (attempts < MAX_ATTEMPTS) {
                window.setTimeout(attempt, 900);
            }

            return;
        }

        markSeen(occasionKey());
        play(hero);
    }

    // Exposed for manual runs and for the capture harness, which fakes the
    // holiday date and the night scene.
    window.__holidayFireworks = attempt;

    attempt();
})();
