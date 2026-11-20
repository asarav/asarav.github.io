(function () {
    'use strict';

    // Every hero and page background is a photograph painted under a heavy
    // gradient. Until it decodes there is only the gradient, so this paints a
    // fractal field into the same layer and fades it out once the photograph
    // arrives.
    //
    // The field is picked by what the photograph actually shows, not just by
    // its colours: weather fronts get fBm cloud banks, the storm gets a
    // midpoint-displacement lightning channel, the snow gets ridged frost, the
    // log gets Cantor dust rows, the games page gets a cellular automaton, the
    // media page gets packed discs, and the rest keep the Julia fields whose
    // seeds already carry the right silhouette (a dendrite, a Siegel disk, a
    // spiral, an indigo interior).
    const body = document.body;

    if (!body) {
        return;
    }

    const connection = navigator.connection ||
        navigator.mozConnection ||
        navigator.webkitConnection;

    // A data-saver user asked for fewer bytes, not for a full-viewport
    // computation. Leave the photograph's gradient stand-in in place.
    if (connection && connection.saveData) {
        return;
    }

    const CLASS = 'background-fractal';
    const MAX_DPR = 3;
    // Densest frame a pass starts from: 2.6 M device pixels, about 21 MB across
    // the ImageData and the canvas. A larger box starts here and stretches; a
    // smaller one starts lower (see startPixels), because the frame costs
    // memory as well as detail. The pass shrinks further when it cannot afford
    // even its start density (see runFrame).
    const MAX_PIXELS = 2600000;
    // Starting densities by box size. A page layer on a phone is about a third
    // of a desktop hero, and asking for the full ceiling there buys 2.6 M
    // pixels on a screen that cannot show them, plus the allocation that
    // mobile Safari reclaims first when it is under pressure.
    const COMPACT_AREA = 220000;
    const MEDIUM_AREA = 520000;
    const COMPACT_PIXELS = 1200000;
    const MEDIUM_PIXELS = 2000000;
    // Ceiling on how much painting a stand-in may cost, in milliseconds. The
    // pass is timed while it paints (see runFrame); if the first slices project
    // past this, the frame is rebuilt at a lower density once and finished
    // there. A fast screen keeps every pixel it can show, a slow one paints
    // fewer and lets the browser stretch them.
    const PAINT_BUDGET = 600;
    // Past this few device pixels per CSS pixel the field turns to mush, and
    // running a little over budget is the better trade.
    const MIN_SCALE = 0.5;
    // Deep enough that the outermost filaments resolve instead of collapsing
    // into a solid edge; a full Julia pass still takes well under a second.
    // The noise, dust and automaton families are cheaper per pixel than this.
    const ITERATIONS = 520;
    // Escape radius 64 (squared). A wide bailout makes the smooth-colouring
    // term accurate, which is what removes the banding rings from the ramp.
    const BAILOUT = 4096;
    const BUDGET = 11;
    const FADE_MS = 620;

    // The stand-in exists for the gap before a photograph arrives, so painting
    // it must not take the main thread away from the photograph, the fonts or
    // the first paint. Waiting for the document to be parsed is enough: the
    // photograph is still in flight then, and only its arrival decides whether
    // the frame is ever seen. The pass itself waits for idle time, with a timer
    // as guard so a request that never finishes cannot postpone it forever.
    function whenIdle(run) {
        let done = false;

        function fire() {
            if (done) {
                return;
            }

            done = true;
            document.removeEventListener('DOMContentLoaded', fire);

            if (window.requestIdleCallback) {
                window.requestIdleCallback(run, { timeout: 500 });
            } else {
                window.setTimeout(run, 60);
            }
        }

        if (document.readyState !== 'loading') {
            fire();

            return;
        }

        document.addEventListener('DOMContentLoaded', fire);
        window.setTimeout(fire, 2500);
    }

    // Starting density for a box of this many CSS pixels.
    function startPixels(cssArea) {
        if (cssArea <= COMPACT_AREA) {
            return COMPACT_PIXELS;
        }

        if (cssArea <= MEDIUM_AREA) {
            return MEDIUM_PIXELS;
        }

        return MAX_PIXELS;
    }

    // A Julia set is always symmetric about the origin, so every frame is
    // centred there. FIT_* is the box a typical set fills; covering that box
    // (rather than fitting inside it) keeps filaments running to every edge,
    // and each theme's zoom decides how far into them the frame looks.
    const FIT_WIDTH = 3.2;
    const FIT_HEIGHT = 2.5;

    const THEMES = {
        rain: {
            generator: 'julia',
            seed: [-0.7269, 0.1889],
            zoom: 1.15,
            norm: 444,
            gamma: 0.33,
            stops: [
                [0, 4, 8, 14],
                [0.3, 10, 30, 48],
                [0.52, 22, 66, 94],
                [0.72, 58, 120, 156],
                [0.88, 140, 190, 212],
                [1, 232, 248, 255]
            ],
            glow: '86,148,186',
            glowAlt: '42,86,124'
        },
        storm: {
            // Cloud base under a fractal lightning channel.
            generator: 'bolt',
            zoom: 1.05,
            cloud: { seed: 23, scale: 2.1, octaves: 5, warp: 1.5, gain: 2.2, tone: 1.12 },
            bolt: { seed: 11, branches: 4, sway: 0.34 },
            stops: [
                [0, 5, 3, 12],
                [0.28, 24, 12, 48],
                [0.5, 56, 26, 98],
                [0.7, 112, 58, 158],
                [0.86, 190, 130, 232],
                [1, 246, 236, 255]
            ],
            glow: '150,110,220',
            glowAlt: '232,196,255'
        },
        snow: {
            // Ridged noise grows branching veins, which is what frost on glass
            // looks like: angular crystals rather than soft cloud.
            generator: 'frost',
            zoom: 1.05,
            frost: { seed: 37, scale: 5.2, fine: 2.6, tone: 2.05 },
            stops: [
                [0, 5, 9, 16],
                [0.26, 22, 38, 56],
                [0.5, 62, 94, 120],
                [0.72, 124, 158, 182],
                [0.88, 196, 220, 234],
                [1, 250, 253, 255]
            ],
            glow: '176,214,236',
            glowAlt: '120,164,196'
        },
        fog: {
            // Fog is the softest cloud there is: low contrast, very large
            // banks, heavily warped so the edges dissolve into each other.
            generator: 'cloud',
            zoom: 1,
            cloud: { seed: 53, scale: 1.5, octaves: 6, warp: 2.6, gain: 1.7, tone: 0.95 },
            stops: [
                [0, 8, 11, 13],
                [0.3, 26, 34, 38],
                [0.55, 56, 72, 78],
                [0.75, 108, 128, 132],
                [0.9, 176, 192, 194],
                [1, 238, 244, 244]
            ],
            glow: '164,180,184',
            glowAlt: '96,120,124'
        },
        sunrise: {
            // The sky is the subject: stretched fBm bands thinning out above a
            // bright horizon, with a sun cresting it.
            generator: 'horizon',
            zoom: 1.2,
            horizon: {
                seed: 61, scale: 1.4, scaleY: 9, octaves: 4, warp: 0.5,
                line: 0.6, above: 0.74, below: 0.3, sun: [0.66, 0.6], sunSize: 0.1, tone: 1
            },
            stops: [
                [0, 10, 7, 14],
                [0.26, 44, 22, 40],
                [0.48, 104, 44, 48],
                [0.68, 176, 82, 58],
                [0.84, 232, 140, 80],
                [1, 255, 232, 196]
            ],
            glow: '255,186,120',
            glowAlt: '206,104,96'
        },
        sunset: {
            generator: 'horizon',
            zoom: 1.1,
            horizon: {
                seed: 83, scale: 1.7, scaleY: 7, octaves: 4, warp: 0.7,
                line: 0.64, above: 0.78, below: 0.28, sun: [0.34, 0.64], sunSize: 0.11, tone: 1
            },
            stops: [
                [0, 9, 6, 14],
                [0.26, 38, 16, 44],
                [0.48, 92, 30, 70],
                [0.68, 158, 54, 84],
                [0.84, 214, 116, 96],
                [1, 255, 214, 178]
            ],
            glow: '236,150,120',
            glowAlt: '168,78,120'
        },
        night: {
            generator: 'julia',
            seed: [-0.1, 0.651],
            zoom: 1.15,
            norm: 403,
            gamma: 0.33,
            stops: [
                [0, 3, 5, 12],
                [0.28, 8, 18, 44],
                [0.5, 20, 38, 84],
                [0.7, 44, 72, 132],
                [0.86, 104, 140, 204],
                [1, 214, 232, 255]
            ],
            glow: '104,140,204',
            glowAlt: '54,80,150'
        },
        cloudy: {
            generator: 'cloud',
            zoom: 1,
            cloud: { seed: 71, scale: 2.3, octaves: 6, warp: 1.9, gain: 2.3, tone: 1 },
            stops: [
                [0, 7, 10, 15],
                [0.3, 24, 32, 44],
                [0.55, 54, 68, 86],
                [0.75, 104, 122, 144],
                [0.9, 168, 184, 200],
                [1, 232, 240, 248]
            ],
            glow: '140,158,178',
            glowAlt: '88,104,124'
        },
        day: {
            // Clear sky: small, quick, well-defined wisps rather than banks.
            generator: 'cloud',
            zoom: 1.2,
            cloud: { seed: 89, scale: 3.1, octaves: 5, warp: 1.2, gain: 1.7, tone: 1.05 },
            stops: [
                [0, 4, 9, 16],
                [0.28, 10, 38, 62],
                [0.5, 26, 78, 116],
                [0.7, 62, 132, 170],
                [0.86, 146, 198, 224],
                [1, 238, 252, 255]
            ],
            glow: '160,206,230',
            glowAlt: '236,206,150'
        },
        books: {
            // Warm shelves and paper: a slow spiral that reads like turning pages.
            generator: 'julia',
            seed: [-0.8, 0.156],
            zoom: 1.18,
            norm: 381,
            gamma: 0.33,
            stops: [
                [0, 8, 5, 3],
                [0.26, 34, 20, 10],
                [0.48, 72, 44, 20],
                [0.68, 124, 80, 34],
                [0.84, 186, 132, 62],
                [1, 248, 224, 178]
            ],
            glow: '226,170,96',
            glowAlt: '150,96,44'
        },
        music: {
            // Concentric grooves: the seed sits on a Siegel disk, so the field
            // turns into rings rather than filaments.
            generator: 'julia',
            seed: [-0.70176, -0.3842],
            zoom: 1.18,
            norm: 56,
            gamma: 0.56,
            stops: [
                [0, 7, 5, 6],
                [0.26, 30, 18, 26],
                [0.48, 66, 38, 44],
                [0.68, 124, 84, 58],
                [0.84, 196, 146, 86],
                [1, 252, 232, 196]
            ],
            glow: '236,186,112',
            glowAlt: '168,96,120'
        },
        games: {
            // A cellular automaton: the pixels are the point. Cells grow into
            // coral and glider shapes, which read as a game grid at a glance.
            generator: 'life',
            zoom: 1.15,
            life: { seed: 17, columns: 150, generations: 26, density: 0.31, tone: 1.05 },
            stops: [
                [0, 4, 4, 12],
                [0.26, 14, 12, 40],
                [0.48, 40, 28, 96],
                [0.66, 88, 56, 180],
                [0.82, 120, 196, 232],
                [1, 226, 250, 255]
            ],
            glow: '128,196,236',
            glowAlt: '148,92,228'
        },
        projects: {
            generator: 'julia',
            seed: [-0.75, 0.11],
            zoom: 1.2,
            norm: 208,
            gamma: 0.38,
            stops: [
                [0, 3, 7, 11],
                [0.28, 8, 26, 40],
                [0.5, 16, 58, 84],
                [0.7, 48, 124, 160],
                [0.86, 138, 196, 220],
                [1, 234, 250, 255]
            ],
            glow: '120,190,220',
            glowAlt: '58,120,158'
        },
        contact: {
            generator: 'julia',
            seed: [0.28, 0.008],
            zoom: 1,
            norm: 155,
            gamma: 0.46,
            stops: [
                [0, 6, 7, 9],
                [0.3, 20, 24, 29],
                [0.55, 42, 50, 58],
                [0.74, 78, 90, 100],
                [0.9, 148, 160, 170],
                [1, 232, 238, 242]
            ],
            glow: '156,168,178',
            glowAlt: '108,118,128'
        },
        log: {
            // Rows of entries: Cantor dust, the same thinning thirds as the
            // page dividers, stacked as bands so the field reads as records
            // rather than a picture.
            generator: 'cantor',
            zoom: 1.1,
            cantor: { seed: 13, levels: 7, columnLevels: 4, scale: 6, tone: 0.92 },
            stops: [
                [0, 6, 9, 12],
                [0.28, 18, 26, 36],
                [0.5, 42, 56, 72],
                [0.7, 84, 104, 124],
                [0.86, 152, 172, 190],
                [1, 240, 248, 252]
            ],
            glow: '168,190,210',
            glowAlt: '96,120,146'
        },
        media: {
            // Lenses, reels, discs: a greedy circle packing with lit rims.
            generator: 'pack',
            zoom: 1.25,
            pack: { seed: 29, divisions: 9, edge: 2.4 },
            stops: [
                [0, 4, 7, 9],
                [0.26, 10, 28, 32],
                [0.48, 22, 62, 66],
                [0.66, 52, 112, 110],
                [0.84, 168, 128, 72],
                [1, 255, 236, 200]
            ],
            glow: '96,168,164',
            glowAlt: '214,166,104'
        }
    };

    const FALLBACK = 'rain';

    function buildRamp(stops) {
        const table = new Uint8ClampedArray(256 * 3);

        for (let i = 0; i < 256; i += 1) {
            const t = i / 255;
            let low = stops[0];
            let high = stops[stops.length - 1];

            for (let s = 0; s < stops.length - 1; s += 1) {
                if (t >= stops[s][0] && t <= stops[s + 1][0]) {
                    low = stops[s];
                    high = stops[s + 1];
                    break;
                }
            }

            const span = (high[0] - low[0]) || 1;
            const k = Math.min(1, Math.max(0, (t - low[0]) / span));

            table[i * 3] = low[1] + (high[1] - low[1]) * k;
            table[i * 3 + 1] = low[2] + (high[2] - low[2]) * k;
            table[i * 3 + 2] = low[3] + (high[3] - low[3]) * k;
        }

        return table;
    }

    const ramps = {};

    function rampFor(key) {
        if (!ramps[key]) {
            ramps[key] = buildRamp(THEMES[key].stops);
        }

        return ramps[key];
    }

    function layeredUrl(element) {
        const value = window.getComputedStyle(element).backgroundImage;
        const match = value ? /url\(["']?([^"']+)["']?\)/.exec(value) : null;

        return match ? match[1] : null;
    }

    function pathTheme() {
        const path = (window.location.pathname || '/').toLowerCase();

        if (path.indexOf('/books') === 0) {
            return 'books';
        }
        if (path.indexOf('/music') === 0) {
            return 'music';
        }
        if (path.indexOf('/games') === 0) {
            return 'games';
        }
        if (path.indexOf('/projects') === 0) {
            return 'projects';
        }
        if (path.indexOf('/contact') === 0 || path.indexOf('/about') === 0) {
            return 'contact';
        }
        if (path.indexOf('/log') === 0) {
            return 'log';
        }
        if (path.indexOf('/consumption') === 0 || path.indexOf('/media') === 0) {
            return 'media';
        }

        return window.matchMedia('(prefers-color-scheme: light)').matches
            ? 'day'
            : 'night';
    }

    // The photograph's own file name says what it shows, which is a better
    // match than the page it happens to sit on (the home hero cycles through
    // the weather scenes).
    function resolveTheme(source) {
        const file = String(source || '')
            .split('?')[0]
            .split('#')[0]
            .split('/')
            .pop()
            .toLowerCase();

        let key = null;

        if (/books/.test(file)) {
            key = 'books';
        } else if (/music/.test(file)) {
            key = 'music';
        } else if (/games/.test(file)) {
            key = 'games';
        } else if (/projects/.test(file)) {
            key = 'projects';
        } else if (/contact/.test(file)) {
            key = 'contact';
        } else if (/media|consumption/.test(file)) {
            key = 'media';
        } else if (/^log[.\-_]/.test(file)) {
            key = 'log';
        } else if (/snow|sleet|blizzard/.test(file)) {
            key = 'snow';
        } else if (/storm|thunder/.test(file)) {
            key = 'storm';
        } else if (/fog|mist|haze/.test(file)) {
            key = 'fog';
        } else if (/sunrise|dawn/.test(file)) {
            key = 'sunrise';
        } else if (/sunset|dusk|twilight/.test(file)) {
            key = 'sunset';
        } else if (/rain|drizzle|shower/.test(file)) {
            key = 'rain';
        } else if (/cloud|overcast/.test(file)) {
            key = 'cloudy';
        } else if (/night/.test(file)) {
            key = 'night';
        } else if (/day/.test(file)) {
            key = 'day';
        }

        key = key || pathTheme();

        if (!THEMES[key]) {
            key = FALLBACK;
        }

        // Copied whole rather than field by field: a missing generator or
        // tuning field renders a black layer, and that is easy to forget.
        return Object.assign({}, THEMES[key], {
            key: key,
            night: file.indexOf('night') !== -1
        });
    }

    // --- shared painting helpers -------------------------------------------

    function clamp01(value) {
        return value < 0 ? 0 : (value > 1 ? 1 : value);
    }

    function rampIndex(t) {
        // Guard the inside-set and rounding paths against NaN.
        if (!(t > 0)) {
            return 0;
        }

        const index = (t * 255) | 0;

        return index > 255 ? 255 : index;
    }

    // Hold the middle of the frame down so the layer reads as depth behind the
    // content rather than as a picture.
    function shadeAt(nx, ny, strength, center) {
        const reach = Math.min(1, Math.sqrt(nx * nx * 1.2 + ny * ny * 1.7) * 1.9);

        return (center.base + center.gain * Math.pow(reach, 1.22)) * strength;
    }

    function writePixel(data, offset, ramp, t, shade) {
        const index = rampIndex(t) * 3;

        data[offset] = ramp[index] * shade;
        data[offset + 1] = ramp[index + 1] * shade;
        data[offset + 2] = ramp[index + 2] * shade;
        data[offset + 3] = 255;
    }

    // Integer hash, used for both noise lattice values and deterministic
    // seeding of the discrete families.
    function hash2(x, y, seed) {
        let h = Math.imul(x | 0, 374761393) +
            Math.imul(y | 0, 668265263) +
            Math.imul(seed | 0, 1274126177);

        h = Math.imul(h ^ (h >>> 13), 1274126177);
        h ^= h >>> 16;

        return (h >>> 0) / 4294967296;
    }

    function valueNoise(x, y, seed) {
        const xi = Math.floor(x);
        const yi = Math.floor(y);
        const fx = x - xi;
        const fy = y - yi;
        const ux = fx * fx * (3 - 2 * fx);
        const uy = fy * fy * (3 - 2 * fy);
        const a = hash2(xi, yi, seed);
        const b = hash2(xi + 1, yi, seed);
        const c = hash2(xi, yi + 1, seed);
        const d = hash2(xi + 1, yi + 1, seed);
        const top = a + (b - a) * ux;
        const bottom = c + (d - c) * ux;

        return top + (bottom - top) * uy;
    }

    function fbm(x, y, seed, octaves) {
        let sum = 0;
        let amplitude = 0.5;
        let total = 0;
        let fx = x;
        let fy = y;

        for (let o = 0; o < octaves; o += 1) {
            sum += amplitude * valueNoise(fx + o * 19.7, fy - o * 11.3, seed + o * 1013);
            total += amplitude;
            amplitude *= 0.5;
            fx *= 2.03;
            fy *= 2.01;
        }

        return sum / total;
    }

    // Frame coordinates are measured in heights, so a cloud keeps its shape
    // whether it is a tall page layer or a wide hero strip.
    function cloudValue(u, v, cfg) {
        let px = u * cfg.scale;
        let py = v * (cfg.scaleY || cfg.scale);

        if (cfg.warp) {
            const wx = fbm(px * 0.62, py * 0.62, cfg.seed + 131, 3);
            const wy = fbm(px * 0.62 + 4.7, py * 0.62 - 2.9, cfg.seed + 977, 3);

            px += (wx - 0.5) * cfg.warp;
            py += (wy - 0.5) * cfg.warp;
        }

        return fbm(px, py, cfg.seed, cfg.octaves || 5);
    }

    // --- generators ---------------------------------------------------------

    function paintJulia(job, row, theme, ramp, strength, center) {
        const data = job.pixels.data;
        const width = job.width;
        const height = job.height;
        const invW = 1 / width;
        const invH = 1 / height;
        const cx = theme.seed[0];
        const cy = theme.seed[1];
        const invIter = 1 / ITERATIONS;
        // Seeds differ enormously in how long their orbits survive: a dendrite
        // tops out near 20 steps, rain near 450. Dividing by the theme's own
        // upper range is what lets every palette reach its bright end instead
        // of stopping halfway up the ramp, which read as flat and washed out.
        const normInv = 1 / theme.norm;
        const gamma = theme.gamma;
        const ny = (row * invH - 0.5) * 2;
        const zi0 = job.spanIm * (row * invH - 0.5);
        const offsetY = row * width;

        for (let x = 0; x < width; x += 1) {
            let zr = job.spanRe * (x * invW - 0.5);
            let zi = zi0;
            let zr2 = zr * zr;
            let zi2 = zi * zi;
            let iter = 0;
            let orbit = 0;

            while (iter < ITERATIONS && zr2 + zi2 < BAILOUT) {
                zi = 2 * zr * zi + cy;
                zr = zr2 - zi2 + cx;
                zr2 = zr * zr;
                zi2 = zi * zi;
                orbit += zr2 + zi2;
                iter += 1;
            }

            let t = 0;

            if (iter >= ITERATIONS) {
                // Inside the set: the mean orbit radius gives the silhouette a
                // soft interior falloff instead of a flat black shape.
                const mean = Math.sqrt(orbit * invIter);

                t = 0.015 + 0.34 * Math.min(1, mean * 0.72);
            } else {
                const magnitude = Math.log(zr2 + zi2) * 0.5;
                const nu = Math.log(magnitude / Math.LN2) / Math.LN2;
                const smooth = Math.max(0, iter + 1 - nu);

                // The exponent spreads the low iteration counts apart, so the
                // outer field keeps its gradation at a high iteration limit and
                // the filaments stay distinct instead of banding.
                t = Math.pow(Math.min(1, smooth * normInv), gamma);
            }

            const shade = shadeAt((x * invW - 0.5) * 2, ny, strength, center);

            writePixel(data, (offsetY + x) * 4, ramp, t, shade);
        }
    }

    function paintCloud(job, row, theme, ramp, strength, center) {
        const cfg = theme.cloud;
        const data = job.pixels.data;
        const width = job.width;
        const height = job.height;
        const invH = 1 / height;
        const v = row * invH;
        const ny = (row * invH - 0.5) * 2;
        const offsetY = row * width;
        const tone = cfg.tone || 1;
        const gain = cfg.gain || 2.4;

        for (let x = 0; x < width; x += 1) {
            const n = cloudValue(x * invH, v, cfg);
            const spread = (n - 0.5) * gain + 0.5;
            const t = Math.pow(clamp01(spread), tone);
            const shade = shadeAt((x / width - 0.5) * 2, ny, strength, center);

            writePixel(data, (offsetY + x) * 4, ramp, t, shade);
        }
    }

    function paintFrost(job, row, theme, ramp, strength, center) {
        const cfg = theme.frost;
        const data = job.pixels.data;
        const width = job.width;
        const height = job.height;
        const invH = 1 / height;
        const v = row * invH;
        const ny = (row * invH - 0.5) * 2;
        const offsetY = row * width;
        const tone = cfg.tone || 1;

        for (let x = 0; x < width; x += 1) {
            const u = x * invH;
            // Folding the noise around its midpoint turns smooth variation
            // into branching ridges: the veins of a frozen window.
            const broad = fbm(u * cfg.scale, v * cfg.scale, cfg.seed, 5);
            const fine = fbm(u * cfg.scale * cfg.fine, v * cfg.scale * cfg.fine, cfg.seed + 71, 4);
            const ridge = (1 - Math.abs(broad * 2 - 1)) ** 2;
            const vein = (1 - Math.abs(fine * 2 - 1)) ** 2;
            // Combining the ridges and then steepening the result keeps only
            // the crests, which is the difference between cloud and ice: thin
            // bright crystals over a cold, mostly empty field.
            const crest = ridge * 0.62 + vein * 0.5;
            const t = Math.pow(clamp01(crest), tone);
            const shade = shadeAt((x / width - 0.5) * 2, ny, strength, center);

            writePixel(data, (offsetY + x) * 4, ramp, t, shade);
        }
    }

    // How deep into the Cantor construction a coordinate survives: the first
    // ternary digit equal to 1 ends it, and the survivors keep thinning by
    // thirds. Returns 0 for the removed intervals and 1 for the dust.
    function cantorLevel(value, levels) {
        let cursor = value;
        let keep = 0;

        for (let level = 1; level <= levels; level += 1) {
            cursor *= 3;

            if (Math.floor(cursor) % 3 === 1) {
                break;
            }

            keep = level;
        }

        return keep / levels;
    }

    function paintHorizon(job, row, theme, ramp, strength, center) {
        const cfg = theme.horizon;
        const data = job.pixels.data;
        const width = job.width;
        const height = job.height;
        const invH = 1 / height;
        const v = row * invH;
        const ny = (v - 0.5) * 2;
        const offsetY = row * width;
        const line = cfg.line || 0.6;
        const above = cfg.above || 0.7;
        const below = cfg.below || 0.3;
        // 1 on the horizon, 0 out at the top and the ground line.
        const sky = 1 - Math.min(1, Math.abs(v - line) / (v < line ? above : below));
        const lift = sky * sky * sky;
        const tone = cfg.tone || 1;
        const sunX = cfg.sun ? cfg.sun[0] * width : -1;
        const sunY = cfg.sun ? cfg.sun[1] * height : -1;
        const sunSize = cfg.sunSize ? cfg.sunSize * height : 0;
        const sunCore = sunSize * 0.34;
        const coreDen = 2 * sunCore * sunCore;
        const haloDen = 2 * sunSize * sunSize;
        const rowSun = sunY > 0 ? (row - sunY) * (row - sunY) : 0;

        for (let x = 0; x < width; x += 1) {
            const n = cloudValue(x * invH, v, cfg);
            const spread = (n - 0.5) * 2.2 + 0.5;
            const band = Math.pow(clamp01(spread), tone);
            let t = band * (0.2 + 0.8 * sky) + lift * 0.5;
            const shade = shadeAt((x / width - 0.5) * 2, ny, strength, center);

            if (sunSize > 0) {
                const dx = x - sunX;
                const d2 = dx * dx + rowSun;

                t += Math.exp(-d2 / coreDen) * 0.75 + Math.exp(-d2 / haloDen) * 0.22;
            }

            writePixel(data, (offsetY + x) * 4, ramp, clamp01(t), shade);
        }
    }

    function paintCantor(job, row, theme, ramp, strength, center) {
        const cfg = theme.cantor;
        const data = job.pixels.data;
        const width = job.width;
        const height = job.height;
        const invH = 1 / height;
        const v = row * invH;
        const ny = (row * invH - 0.5) * 2;
        const offsetY = row * width;
        const bands = cantorLevel(v, cfg.levels);

        if (!job.cantorColumns) {
            const columns = new Float32Array(width);

            for (let i = 0; i < width; i += 1) {
                columns[i] = cantorLevel(i / width, cfg.columnLevels || 4);
            }

            job.cantorColumns = columns;
        }

        const columns = job.cantorColumns;
        const tone = cfg.tone || 1;

        for (let x = 0; x < width; x += 1) {
            const grain = 0.8 + 0.2 * hash2(x, row, cfg.seed);
            const weave = 0.86 + 0.14 * valueNoise(x * invH * cfg.scale, v * cfg.scale, cfg.seed + 17);
            const level = bands * (0.72 + 0.28 * columns[x]) * grain * weave + 0.08;
            const t = Math.pow(clamp01(level), tone);
            const shade = shadeAt((x / width - 0.5) * 2, ny, strength, center);

            writePixel(data, (offsetY + x) * 4, ramp, t, shade);
        }
    }

    function prepareLife(job, theme) {
        const cfg = theme.life;
        const cell = Math.max(5, Math.round(job.width / cfg.columns));
        const cols = Math.ceil(job.width / cell) + 1;
        const rows = Math.ceil(job.height / cell) + 1;
        let grid = new Uint8Array(cols * rows);
        let next = new Uint8Array(cols * rows);

        for (let y = 0; y < rows; y += 1) {
            for (let x = 0; x < cols; x += 1) {
                grid[y * cols + x] = hash2(x, y, cfg.seed) < cfg.density ? 1 : 0;
            }
        }

        for (let g = 0; g < cfg.generations; g += 1) {
            for (let y = 0; y < rows; y += 1) {
                for (let x = 0; x < cols; x += 1) {
                    let neighbours = 0;

                    for (let oy = -1; oy <= 1; oy += 1) {
                        for (let ox = -1; ox <= 1; ox += 1) {
                            if (!ox && !oy) {
                                continue;
                            }

                            const yy = (y + oy + rows) % rows;
                            const xx = (x + ox + cols) % cols;

                            neighbours += grid[yy * cols + xx];
                        }
                    }

                    const alive = grid[y * cols + x];

                    next[y * cols + x] = alive
                        ? (neighbours === 2 || neighbours === 3 ? 1 : 0)
                        : (neighbours === 3 ? 1 : 0);
                }
            }

            const swap = grid;

            grid = next;
            next = swap;
        }

        // A little spill around each live cell so the grid glows instead of
        // reading as hard-edged blocks.
        const density = new Float32Array(cols * rows);

        for (let y = 0; y < rows; y += 1) {
            for (let x = 0; x < cols; x += 1) {
                let neighbours = 0;

                for (let oy = -1; oy <= 1; oy += 1) {
                    for (let ox = -1; ox <= 1; ox += 1) {
                        if (!ox && !oy) {
                            continue;
                        }

                        neighbours += grid[((y + oy + rows) % rows) * cols + ((x + ox + cols) % cols)];
                    }
                }

                density[y * cols + x] = grid[y * cols + x]
                    ? 0.66 + 0.34 * (neighbours / 8)
                    : 0.26 * (neighbours / 8);
            }
        }

        job.cells = { size: cell, cols: cols, rows: rows, density: density };
    }

    function paintLife(job, row, theme, ramp, strength, center) {
        const data = job.pixels.data;
        const width = job.width;
        const cells = job.cells;
        const density = cells.density;
        const cell = cells.size;
        const cols = cells.cols;
        const rows = cells.rows;
        const ny = (row / job.height - 0.5) * 2;
        const offsetY = row * width;
        const cellRow = Math.min(rows - 1, Math.floor(row / cell)) * cols;
        const tone = theme.life.tone || 1;

        for (let x = 0; x < width; x += 1) {
            const cellX = Math.min(cols - 1, Math.floor(x / cell));
            const t = Math.pow(density[cellRow + cellX], tone);
            const shade = shadeAt((x / width - 0.5) * 2, ny, strength, center);

            writePixel(data, (offsetY + x) * 4, ramp, t, shade);
        }
    }

    function preparePack(job, theme) {
        const cfg = theme.pack;
        const base = Math.max(24, Math.round(Math.min(job.width, job.height) / cfg.divisions));
        const step = base * 0.62;
        const cols = Math.ceil(job.width / step) + 1;
        const rows = Math.ceil(job.height / step) + 1;
        const circles = [];

        for (let r = 0; r < rows; r += 1) {
            for (let c = 0; c < cols; c += 1) {
                const cx = c * step + (0.2 + 0.6 * hash2(c, r, cfg.seed)) * step;
                const cy = r * step + (0.2 + 0.6 * hash2(c + 311, r - 97, cfg.seed)) * step;
                const radius = base * (0.17 + 0.19 * hash2(c - 53, r + 41, cfg.seed + 7));
                let clear = true;

                for (let i = 0; i < circles.length; i += 1) {
                    const other = circles[i];
                    const dx = other[0] - cx;
                    const dy = other[1] - cy;
                    const gap = other[2] + radius + base * 0.05;

                    if (dx * dx + dy * dy < gap * gap) {
                        clear = false;
                        break;
                    }
                }

                if (clear) {
                    circles.push([cx, cy, radius, 0.55 + 0.45 * hash2(c + 7, r + 13, cfg.seed + 3)]);
                }
            }
        }

        job.circles = circles;
    }

    function paintPack(job, row, theme, ramp, strength, center) {
        const cfg = theme.pack;
        const data = job.pixels.data;
        const width = job.width;
        const height = job.height;
        const accum = job.packRow || (job.packRow = new Float32Array(width));
        const circles = job.circles;
        const sigma = Math.max(1.1, (width / 900) * cfg.edge);
        const soft = sigma * 3;
        const denominator = 2 * sigma * sigma;
        const y = row + 0.5;
        const ny = (row / height - 0.5) * 2;
        const offsetY = row * width;

        accum.fill(0);

        for (let i = 0; i < circles.length; i += 1) {
            const circle = circles[i];
            const cy = circle[1];
            const radius = circle[2];
            const reach = radius + soft;

            if (y < cy - reach || y > cy + reach) {
                continue;
            }

            const from = Math.max(0, Math.floor(circle[0] - reach));
            const to = Math.min(width - 1, Math.ceil(circle[0] + reach));

            for (let x = from; x <= to; x += 1) {
                const dx = x + 0.5 - circle[0];
                const dy = y - cy;
                const distance = Math.sqrt(dx * dx + dy * dy);
                const edge = Math.abs(distance - radius);

                if (edge > soft) {
                    if (distance < radius) {
                        accum[x] += 0.32 * circle[3];
                    }

                    continue;
                }

                accum[x] += 0.95 * Math.exp(-(edge * edge) / denominator) * circle[3];
            }
        }

        for (let x = 0; x < width; x += 1) {
            const level = accum[x] + 0.07;
            const shade = shadeAt((x / width - 0.5) * 2, ny, strength, center);

            writePixel(data, (offsetY + x) * 4, ramp, clamp01(level), shade);
        }
    }

    function prepareBolt(job, theme) {
        const cfg = theme.bolt;
        const width = job.width;
        const height = job.height;
        let state = (cfg.seed || 7) >>> 0;
        const segments = [];

        // Deterministic PRNG: the same photograph always draws the same bolt.
        function random() {
            state = (state + 0x6d2b79f5) >>> 0;

            let t = state;

            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        }

        // Midpoint displacement: a straight channel broken apart recursively,
        // which is the standard fractal model of a strike.
        function split(x0, y0, x1, y1, depth, sway, weight) {
            if (depth === 0) {
                segments.push([x0, y0, x1, y1, weight]);

                return;
            }

            const dx = x1 - x0;
            const dy = y1 - y0;
            const length = Math.sqrt(dx * dx + dy * dy) || 1;
            const offset = (random() - 0.5) * sway * length;
            const mx = (x0 + x1) / 2 - (dy / length) * offset;
            const my = (y0 + y1) / 2 + (dx / length) * offset;

            split(x0, y0, mx, my, depth - 1, sway, weight);
            split(mx, my, x1, y1, depth - 1, sway, weight);
        }

        const startX = width * (0.36 + random() * 0.28);

        split(
            startX,
            height * 0.02,
            startX + (random() - 0.5) * width * 0.16,
            height * 0.98,
            7,
            cfg.sway || 0.34,
            1
        );

        for (let b = 0; b < (cfg.branches || 3); b += 1) {
            const y0 = height * (0.06 + random() * 0.52);
            const x0 = startX + (random() - 0.5) * width * 0.1;
            const direction = random() < 0.5 ? -1 : 1;

            split(
                x0,
                y0,
                x0 + direction * width * (0.07 + random() * 0.17),
                y0 + height * (0.12 + random() * 0.22),
                5,
                (cfg.sway || 0.34) * 1.5,
                0.5
            );
        }

        job.bolts = segments;
    }

    function paintBolt(job, row, theme, ramp, strength, center) {
        const cfg = theme.cloud;
        const data = job.pixels.data;
        const width = job.width;
        const height = job.height;
        const accum = job.boltRow || (job.boltRow = new Float32Array(width));
        const segments = job.bolts;
        const invH = 1 / height;
        const v = row * invH;
        const ny = (row * invH - 0.5) * 2;
        const offsetY = row * width;
        const tone = cfg.tone || 1;
        const gain = cfg.gain || 2.4;
        const scale = width / 900;
        const core = 0.7 + 1.5 * scale;
        const halo = core * 9;
        const coreDen = 2 * core * core;
        const haloDen = 2 * halo * halo;
        const y = row + 0.5;

        accum.fill(0);

        for (let i = 0; i < segments.length; i += 1) {
            const segment = segments[i];
            const x0 = segment[0];
            const y0 = segment[1];
            const x1 = segment[2];
            const y1 = segment[3];
            const low = y0 < y1 ? y0 : y1;
            const high = y0 < y1 ? y1 : y0;

            if (y < low || y > high || high - low < 0.5) {
                continue;
            }

            const along = (y - y0) / (y1 - y0);
            const centreX = x0 + (x1 - x0) * along;
            const from = Math.max(0, Math.floor(centreX - halo * 2.4));
            const to = Math.min(width - 1, Math.ceil(centreX + halo * 2.4));

            for (let x = from; x <= to; x += 1) {
                const d = x + 0.5 - centreX;
                const d2 = d * d;

                accum[x] += (Math.exp(-d2 / coreDen) + 0.32 * Math.exp(-d2 / haloDen)) * segment[4];
            }
        }

        for (let x = 0; x < width; x += 1) {
            const n = cloudValue(x * invH, v, cfg);
            const spread = (n - 0.5) * gain + 0.5;
            let t = Math.pow(clamp01(spread), tone);
            // The channel is the subject of the photograph, so it keeps most of
            // its brightness even where the frame is held down for text.
            const shade = shadeAt((x / width - 0.5) * 2, ny, strength, center);

            if (accum[x] > 0) {
                t = t < 1 ? Math.min(1, t + accum[x] * 0.9) : 1;

                writePixel(data, (offsetY + x) * 4, ramp, t, shade > 0.5 ? shade : 0.5);
            } else {
                writePixel(data, (offsetY + x) * 4, ramp, t, shade);
            }
        }
    }

    const PAINTERS = {
        julia: paintJulia,
        cloud: paintCloud,
        horizon: paintHorizon,
        frost: paintFrost,
        cantor: paintCantor,
        life: paintLife,
        pack: paintPack,
        bolt: paintBolt
    };

    const PREPARE = {
        life: prepareLife,
        pack: preparePack,
        bolt: prepareBolt
    };

    // One layer per photograph. The page layer covers the viewport; a hero
    // layer is inserted as the hero's first child and clipped by the hero.
    function createLayer(target, isHero, theme) {
        const layer = document.createElement('div');
        const canvas = document.createElement('canvas');
        const ramp = rampFor(theme.key);
        const paint = PAINTERS[theme.generator] || paintJulia;
        const prepare = PREPARE[theme.generator];
        const state = {
            settled: false,
            painted: false,
            frame: 0,
            job: null,
            jobContext: null,
            resizeTimer: 0,
            cssWidth: 1,
            cssHeight: 1,
            dpr: 1,
            // Painting actually spent so far, and the slowest slice seen. The
            // rate is a running average with that one slowest slice dropped:
            // a decode or a garbage collection landing on this thread must not
            // read as slow hardware, and the cheapest slice alone would size a
            // Julia set from its easiest rows and overshoot badly.
            paintMs: 0,
            rateMs: 0,
            ratePx: 0,
            worstMs: 0,
            worstPx: 0,
            slices: 0,
            rescales: 0,
            strength: (isHero ? 1 : 0.95) * (theme.night ? 0.86 : 1),
            center: isHero ? { base: 0.24, gain: 0.88 } : { base: 0.42, gain: 0.62 }
        };

        layer.className = isHero ? CLASS + ' ' + CLASS + '--hero' : CLASS;
        layer.setAttribute('aria-hidden', 'true');
        layer.style.setProperty('--fractal-glow', theme.glow);
        layer.style.setProperty('--fractal-glow-alt', theme.glowAlt);
        layer.style.setProperty('--fractal-period', (28 + (theme.zoom || 1) * 6).toFixed(0) + 's');

        canvas.className = CLASS + '__canvas';

        layer.appendChild(canvas);

        function finish(job, context) {
            context.putImageData(job.pixels, 0, 0);
            state.job = null;
            state.jobContext = null;

            if (!state.painted) {
                state.painted = true;
                layer.classList.add('is-painted');
            }
        }

        // Builds the frame at a given density. Setting the size first matters:
        // it resets the 2d context state, so the context is fetched after.
        function startJob(dpr) {
            const pixelWidth = Math.max(1, Math.round(state.cssWidth * dpr));
            const pixelHeight = Math.max(1, Math.round(state.cssHeight * dpr));

            canvas.width = pixelWidth;
            canvas.height = pixelHeight;

            const context = canvas.getContext('2d', { alpha: false });

            if (!context) {
                return false;
            }

            const scale = frameScale(pixelWidth, pixelHeight);
            const job = {
                pixels: context.createImageData(pixelWidth, pixelHeight),
                width: pixelWidth,
                height: pixelHeight,
                spanRe: pixelWidth / scale,
                spanIm: pixelHeight / scale,
                // Rows are painted in interleaved bands, not top to bottom. The
                // image is identical (rows are independent), but every slice
                // then samples the whole frame, so a field that is only
                // expensive in one region cannot look cheap while the estimate
                // is being taken.
                order: rowOrder(pixelHeight),
                row: 0
            };

            function rowOrder(height) {
                const lanes = Math.min(16, height);
                const span = Math.ceil(height / lanes);
                const order = new Int32Array(height);
                let at = 0;

                for (let offset = 0; offset < span; offset += 1) {
                    for (let lane = 0; lane < lanes; lane += 1) {
                        const row = lane * span + offset;

                        if (row < height) {
                            order[at] = row;
                            at += 1;
                        }
                    }
                }

                return order;
            }

            if (prepare) {
                prepare(job, theme);
            }

            state.dpr = dpr;
            state.job = job;
            state.jobContext = context;

            return true;
        }

        function runFrame() {
            state.frame = 0;

            const job = state.job;
            const context = state.jobContext;

            if (state.settled || !job || !context) {
                return;
            }

            const started = performance.now();
            const firstRow = job.row;

            while (job.row < job.height && performance.now() - started < BUDGET) {
                paint(job, job.order[job.row], theme, ramp, state.strength, state.center);
                job.row += 1;
            }

            const elapsed = performance.now() - started;
            const painted = (job.row - firstRow) * job.width;

            // Time the pass as it happens: the first slice is real work on the
            // real canvas, so there is no small-scale probe to be wrong about.
            // The rate is remeasured every slice, so a field whose cost varies
            // across the frame still converges instead of being sized from its
            // cheapest rows.
            if (painted > 0 && elapsed > 0) {
                state.paintMs += elapsed;
                state.slices += 1;

                // The first slice pays for the tier-up of the painter code, so
                // its rate is not counted: it would read as slow hardware. It
                // still counts against the budget, since it really was spent.
                if (state.slices > 1) {
                    state.rateMs += elapsed;
                    state.ratePx += painted;

                    if (elapsed > state.worstMs) {
                        state.worstMs = elapsed;
                        state.worstPx = painted;
                    }
                }

                let ms = state.rateMs;
                let px = state.ratePx;

                if (state.slices > 3) {
                    ms -= state.worstMs;
                    px -= state.worstPx;
                }

                // Whatever the budget has left after the work already spent,
                // including any frame that is about to be thrown away.
                const remaining = PAINT_BUDGET - state.paintMs;

                if (state.rescales < 2 && px > 0 && ms > 0 && remaining > 0) {
                    const projected = (ms / px) * job.width * job.height;

                    if (projected > remaining * 1.15) {
                        const next = Math.max(
                            MIN_SCALE,
                            state.dpr * Math.sqrt(remaining / projected)
                        );

                        if (next < state.dpr * 0.95 && startJob(next)) {
                            state.rescales += 1;
                            // Resume on the next frame: painting the rebuilt
                            // frame now would spend two slices in one.
                            state.frame = window.requestAnimationFrame(runFrame);

                            return;
                        }
                    }
                }
            }

            if (job.row < job.height) {
                state.frame = window.requestAnimationFrame(runFrame);
                return;
            }

            finish(job, context);
        }

        // Cover the frame: equal pixel scale on both axes, filaments to every
        // edge. The page layer looks a little further in than a hero, so the
        // viewport never shows a small figure in a lot of empty field.
        function frameScale(width, height) {
            const zoom = (theme.zoom || 1) * (isHero ? 1 : 1.14);

            return Math.max(width / (FIT_WIDTH * zoom), height / (FIT_HEIGHT * zoom));
        }

        function render() {
            if (state.settled) {
                return;
            }

            // Measured from the layer's own box: the fixed page layer sits
            // inside the viewport's scrollbar, so innerWidth would stretch it.
            const rect = (isHero ? target : layer).getBoundingClientRect();

            state.cssWidth = Math.max(1, Math.round(rect.width) || 1);
            state.cssHeight = Math.max(1, Math.round(rect.height) || 1);
            state.paintMs = 0;
            state.rateMs = 0;
            state.ratePx = 0;
            state.worstMs = 0;
            state.worstPx = 0;
            state.slices = 0;
            state.rescales = 0;

            if (state.frame) {
                window.cancelAnimationFrame(state.frame);
                state.frame = 0;
            }

            state.job = null;
            state.jobContext = null;

            // Start at the densest frame the screen and the memory ceiling for
            // a box this size allow. Whether that density is affordable is
            // measured by the pass itself, not guessed before it starts.
            const area = state.cssWidth * state.cssHeight;
            const device = Math.min(Math.max(window.devicePixelRatio || 1, 1), MAX_DPR);
            const memoryScale = Math.sqrt(startPixels(area) / area);

            if (!startJob(Math.min(device, memoryScale))) {
                return;
            }

            runFrame();
        }

        function onResize() {
            window.clearTimeout(state.resizeTimer);
            state.resizeTimer = window.setTimeout(render, 180);
        }

        return {
            start: function () {
                if (state.settled) {
                    return;
                }

                if (isHero) {
                    target.insertBefore(layer, target.firstChild);
                } else {
                    body.insertBefore(layer, body.firstChild);
                }

                window.addEventListener('resize', onResize);
                render();
            },
            settle: function () {
                state.settled = true;
                state.job = null;
                state.jobContext = null;

                window.removeEventListener('resize', onResize);
                window.clearTimeout(state.resizeTimer);

                if (state.frame) {
                    window.cancelAnimationFrame(state.frame);
                    state.frame = 0;
                }

                layer.classList.remove('is-painted');

                window.setTimeout(function () {
                    if (layer.parentNode) {
                        layer.parentNode.removeChild(layer);
                    }
                }, FADE_MS + 120);
            }
        };
    }

    // Follows the element's photograph until it stays put. The weather script
    // swaps the image in the first moments of a load, which aborts the request
    // for the picture that was current a moment earlier; treating that abort as
    // "the photograph arrived" used to leave the stand-in out entirely.
    function watch(target, isHero) {
        let attempt = 0;

        function begin() {
            const source = layeredUrl(target);

            if (!source || source.indexOf('data:') === 0) {
                return;
            }

            const theme = resolveTheme(source);
            const probe = new Image();
            let layer = null;
            let closed = false;
            let finished = false;

            function finish() {
                if (finished) {
                    return;
                }

                finished = true;
                closed = true;

                if (layer) {
                    layer.settle();
                    layer = null;
                }
            }

            // True when the element now points at a different photograph, in
            // which case this attempt is abandoned and a fresh one begins.
            function follow() {
                const current = layeredUrl(target);

                if (current && current !== source && attempt < 2) {
                    attempt += 1;
                    closed = true;

                    if (layer) {
                        layer.settle();
                        layer = null;
                    }

                    begin();

                    return true;
                }

                return false;
            }

            // An abort usually means the weather script replaced the picture a
            // frame ago, so the swap may not be visible yet. Keep looking for a
            // moment before deciding the stand-in is not needed.
            function retry(delay) {
                window.setTimeout(function () {
                    if (follow()) {
                        return;
                    }

                    if (delay < 900) {
                        retry(delay + 250);

                        return;
                    }

                    finish();
                }, delay);
            }

            probe.addEventListener('load', finish);
            probe.addEventListener('error', function () {
                closed = true;
                retry(150);
            });
            probe.decoding = 'async';
            probe.src = source;

            if (probe.complete && probe.naturalWidth > 0) {
                if (!follow()) {
                    finished = true;
                    closed = true;
                }

                return;
            }

            // Give the browser a moment to serve a cached photograph before
            // painting: a cached image should never flash a substitute. The
            // pass itself waits for the document and for idle time, so the
            // photograph request and the first paint keep the thread first.
            whenIdle(function () {
                if (closed || finished || layer) {
                    return;
                }

                layer = createLayer(target, isHero, theme);
                layer.start();
            });
        }

        begin();
    }

    watch(body, false);

    const hero = document.querySelector('#content > .page-top');

    if (hero) {
        watch(hero, true);
    }
})();
