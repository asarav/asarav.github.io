(function () {
    'use strict';

    const hero = document.querySelector('.not-found-hero');
    const canvas = hero ? hero.querySelector('.not-found-fractal') : null;

    if (!canvas) {
        return;
    }

    const context = canvas.getContext('2d', { alpha: false });

    if (!context) {
        return;
    }

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    // The hero is painted at device resolution: every filament lands on a real
    // display pixel instead of being scaled up from a smaller buffer.
    const MAX_DPR = 3;
    const ITERATIONS = 420;
    const ITERATIONS_PREVIEW = 150;
    // Escape radius 32 (squared). A wide bailout keeps the smooth-colouring
    // term accurate, which is what removes the banding rings.
    const BAILOUT = 1024;
    // The detail pass renders a row at a time and yields, so a full-resolution
    // frame never blocks the main thread.
    const BUDGET = 10;
    const SETTLE = 140;
    const MOTION_INTERVAL = 45;

    // A neighbourhood of the Julia boundary for c = -0.8 + 0.156i. Unlike the
    // old dendrite seed, whose solid bulbs read as flat blocks at hero size,
    // this one is filamentary down to the last iteration, so the figure stays
    // detailed across the whole canvas. Moving the pointer slides the seed
    // along the boundary, so the figure reorganises as the cursor crosses.
    const ORIGIN = { re: -0.8, im: 0.156 };
    const DRIFT = { re: 0.055, im: 0.075 };
    const SPAN_IM = 1.45;

    const STOPS = [
        [0, 5, 8, 12],
        [0.42, 15, 33, 48],
        [0.62, 33, 71, 99],
        [0.8, 92, 148, 181],
        [1, 201, 234, 246]
    ];

    const ramp = new Uint8ClampedArray(256 * 3);

    (function buildRamp() {
        for (let i = 0; i < 256; i += 1) {
            const t = i / 255;
            let low = STOPS[0];
            let high = STOPS[STOPS.length - 1];

            for (let s = 0; s < STOPS.length - 1; s += 1) {
                if (t >= STOPS[s][0] && t <= STOPS[s + 1][0]) {
                    low = STOPS[s];
                    high = STOPS[s + 1];
                    break;
                }
            }

            const span = (high[0] - low[0]) || 1;
            const k = (t - low[0]) / span;

            ramp[i * 3] = low[1] + (high[1] - low[1]) * k;
            ramp[i * 3 + 1] = low[2] + (high[2] - low[2]) * k;
            ramp[i * 3 + 2] = low[3] + (high[3] - low[3]) * k;
        }
    })();

    // Full-resolution buffer, and a half-scale one for the moment the pointer
    // is moving. The moving pass is the only time the hero is soft, and it is
    // replaced by the sharp pass as soon as the seed settles.
    const detail = document.createElement('canvas');
    const detailContext = detail.getContext('2d', { alpha: false });
    const preview = document.createElement('canvas');
    const previewContext = preview.getContext('2d', { alpha: false });

    let cssWidth = 0;
    let cssHeight = 0;
    let detailPixels = null;
    let previewPixels = null;
    let job = null;
    let jobFrame = 0;
    let settleTimer = 0;
    let lastPreview = 0;
    let visible = true;
    let painted = false;

    const current = { re: ORIGIN.re, im: ORIGIN.im };
    const target = { re: ORIGIN.re, im: ORIGIN.im };

    function paintRow(pixels, width, height, row, iterations, cx, cy) {
        const data = pixels.data;
        const offsetY = row * width;
        const spanRe = SPAN_IM * (width / height);
        const invW = 1 / width;
        const invH = 1 / height;
        const zi0 = SPAN_IM * (row * invH - 0.5);
        const dy = Math.abs(row * invH - 0.5) * 2;

        for (let x = 0; x < width; x += 1) {
            let zr = spanRe * (x * invW - 0.5);
            let zi = zi0;
            let zr2 = zr * zr;
            let zi2 = zi * zi;
            let iter = 0;

            while (iter < iterations && zr2 + zi2 < BAILOUT) {
                zi = 2 * zr * zi + cy;
                zr = zr2 - zi2 + cx;
                zr2 = zr * zr;
                zi2 = zi * zi;
                iter += 1;
            }

            let shade = 0;

            if (iter < iterations) {
                const magnitude = Math.log(zr2 + zi2) * 0.5;
                const nu = Math.log(magnitude / Math.LN2) / Math.LN2;
                const smooth = Math.max(0, iter + 1 - nu);

                // The exponent spreads the low iteration counts apart, so the
                // filaments keep their gradation at high iteration limits.
                shade = Math.pow(Math.min(1, smooth / iterations), 0.32);
            }

            // Hold the middle of the hero down so the headline keeps its
            // contrast; the filaments read at the edges.
            const dx = Math.abs(x * invW - 0.5) * 2;
            const reach = Math.min(1, dx * 1.05 + dy * 0.8);
            const vignette = 0.34 + 0.78 * Math.pow(reach, 1.15);

            const index = Math.round(shade * 255) * 3;
            const offset = (offsetY + x) * 4;

            data[offset] = ramp[index] * vignette;
            data[offset + 1] = ramp[index + 1] * vignette;
            data[offset + 2] = ramp[index + 2] * vignette;
            data[offset + 3] = 255;
        }
    }

    function blit(pixels) {
        const sharp = pixels === detailPixels;
        const surface = sharp ? detailContext : previewContext;
        const source = sharp ? detail : preview;

        surface.putImageData(pixels, 0, 0);
        context.imageSmoothingEnabled = !sharp;
        context.drawImage(source, 0, 0, canvas.width, canvas.height);

        if (!painted) {
            painted = true;
            hero.classList.add('is-fractal-ready');
        }
    }

    function cancelJob() {
        if (jobFrame) {
            window.cancelAnimationFrame(jobFrame);
            jobFrame = 0;
        }

        job = null;
    }

    function runJob() {
        jobFrame = 0;

        if (!job || !visible) {
            return;
        }

        const started = performance.now();

        while (job.row < job.height && performance.now() - started < BUDGET) {
            paintRow(
                job.pixels,
                job.width,
                job.height,
                job.row,
                job.iterations,
                job.re,
                job.im
            );
            job.row += 1;
        }

        if (job.row >= job.height) {
            const finished = job;
            job = null;
            blit(finished.pixels);
            return;
        }

        jobFrame = window.requestAnimationFrame(runJob);
    }

    function startJob(pixels, width, height, iterations) {
        cancelJob();

        job = {
            pixels: pixels,
            width: width,
            height: height,
            iterations: iterations,
            re: current.re,
            im: current.im,
            row: 0
        };

        runJob();
    }

    // The half-scale pass runs in one go; it is small enough to stay inside a
    // frame, and it keeps the drift responsive while the sharp pass is queued.
    function paintPreview() {
        if (!previewPixels) {
            return;
        }

        // The whole buffer is replaced every time: a partially updated preview
        // would smear the previous seed across the lower half of the hero.
        for (let row = 0; row < preview.height; row += 1) {
            paintRow(
                previewPixels,
                preview.width,
                preview.height,
                row,
                ITERATIONS_PREVIEW,
                current.re,
                current.im
            );
        }

        blit(previewPixels);
    }

    function scheduleDetail() {
        window.clearTimeout(settleTimer);

        settleTimer = window.setTimeout(function () {
            if (!visible || !detailPixels) {
                return;
            }

            startJob(detailPixels, detail.width, detail.height, ITERATIONS);
        }, SETTLE);
    }

    function resize() {
        const rect = hero.getBoundingClientRect();
        const dpr = Math.min(Math.max(window.devicePixelRatio || 1, 1), MAX_DPR);

        cssWidth = Math.max(1, Math.round(rect.width));
        cssHeight = Math.max(1, Math.round(rect.height));

        canvas.width = Math.round(cssWidth * dpr);
        canvas.height = Math.round(cssHeight * dpr);

        detail.width = canvas.width;
        detail.height = canvas.height;
        detailPixels = detailContext.createImageData(detail.width, detail.height);

        preview.width = Math.max(96, Math.round(cssWidth * 0.5));
        preview.height = Math.max(48, Math.round(cssHeight * 0.5));
        previewPixels = previewContext.createImageData(preview.width, preview.height);

        cancelJob();
        paintPreview();

        if (reducedMotion.matches) {
            startJob(detailPixels, detail.width, detail.height, ITERATIONS);
        } else {
            scheduleDetail();
        }
    }

    function settle(re, im) {
        target.re = re;
        target.im = im;
        start();
    }

    function tick(now) {
        frame = window.requestAnimationFrame(tick);

        if (!visible) {
            return;
        }

        const dRe = target.re - current.re;
        const dIm = target.im - current.im;

        if (Math.abs(dRe) < 0.0002 && Math.abs(dIm) < 0.0002) {
            return;
        }

        current.re += dRe * 0.16;
        current.im += dIm * 0.16;

        if (now - lastPreview >= MOTION_INTERVAL) {
            lastPreview = now;
            paintPreview();
        }
    }

    let frame = 0;

    function start() {
        if (frame || reducedMotion.matches) {
            return;
        }

        frame = window.requestAnimationFrame(tick);
    }

    function stop() {
        window.cancelAnimationFrame(frame);
        frame = 0;
    }

    function onPointerMove(event) {
        if (reducedMotion.matches) {
            return;
        }

        const rect = canvas.getBoundingClientRect();

        if (!rect.width || !rect.height) {
            return;
        }

        const x = (event.clientX - rect.left) / rect.width - 0.5;
        const y = (event.clientY - rect.top) / rect.height - 0.5;

        settle(ORIGIN.re + x * DRIFT.re * 2, ORIGIN.im + y * DRIFT.im * 2);
        scheduleDetail();
    }

    let resizeFrame = 0;

    function onResize() {
        window.cancelAnimationFrame(resizeFrame);
        resizeFrame = window.requestAnimationFrame(resize);
    }

    resize();

    if (reducedMotion.matches) {
        return;
    }

    const observer = new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;

        if (visible) {
            start();

            if (detailPixels && !job) {
                scheduleDetail();
            }
        } else {
            stop();
            cancelJob();
        }
    }, { threshold: 0 });

    observer.observe(hero);

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });

    reducedMotion.addEventListener('change', function () {
        if (reducedMotion.matches) {
            stop();
            window.clearTimeout(settleTimer);
            window.removeEventListener('pointermove', onPointerMove);

            if (detailPixels) {
                startJob(detailPixels, detail.width, detail.height, ITERATIONS);
            }
        }
    });
})();
