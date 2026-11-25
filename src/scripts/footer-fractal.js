(function () {
    'use strict';

    // -----------------------------------------------------------------------
    // Footer fractal
    // -----------------------------------------------------------------------
    // A quiet field behind the footer. Which field is one of eight families —
    // a Julia interference, the Burning Ship's crags, an Apollonian packing,
    // Newton's basins at cube and at tenth power, a nodal standing wave, a
    // Sierpiński lattice, a cellular tessellation — and no family is used twice.
    //
    // Every sample of the escape-time families also carries three orbit traps
    // (a circle around the origin and the two axes) plus the escape count on a
    // logarithmic scale. The traps draw the ribs, spirals and lace that a plain
    // escape-time gradient flattens away, and the logarithmic count spreads the
    // visible bands across the whole palette instead of the darkest few per
    // cent of it, so the band stays intricate at the low opacity the footer
    // needs.
    //
    // The field is drawn as two things, not one wash: a quiet slate fog and the
    // shell of points that escape only just before the set's boundary. That
    // shell is the outline — every bulb and filament arrives with an edge — and
    // it is coloured against the fog, so the figure and the empty space around
    // it are told apart by hue and by opacity at once rather than by brightness
    // alone.
    //
    // The field is drawn, not moved: the seed is advanced by a virtual pointer
    // that wanders on two slow, unrelated periods, and the whole frame is
    // recomputed from that seed, so the filigree itself reshapes and never
    // simply slides.
    //
    // Two things made this hard to keep quiet. Script cannot afford 420 orbit
    // steps per pixel inside a frame, and splitting a frame into pieces painted
    // at different moments reads as bands and blocks, so the arithmetic runs in
    // a fragment shader: one draw call, one frame, one seed for every pixel.
    // And the field sits on the chaotic boundary, where even a tiny seed step
    // replaces a share of the pixels outright, so a frame drawn from each new
    // seed pops rather than drifts, while a shallow field drawn from the same
    // seeds is calm but loses the filigree.
    //
    // So every displayed frame is one draw call that computes the field and
    // shades it straight onto the canvas: no offscreen texture to write and
    // read back, no second pass, and nothing invented between samples.
    //
    // Without WebGL there is no continuous version of this, so the fallback
    // paints a single complete image and leaves it there.
    //
    // -----------------------------------------------------------------------
    // Variants
    // -----------------------------------------------------------------------
    // The footer does not show one figure for ever. Eight variants live in
    // VARIANTS, and which one is on screen is decided by the clock: the minute
    // of the day is an integer, and its arithmetic class picks the family.
    // Primes, multiples of seven, multiplies of five, squares, powers of two
    // and powers of ten each get their own figure, and everything left splits
    // by parity. The rules are ordered, so a number that belongs to several
    // classes (7 is prime and a multiple of seven, 25 a multiple of five and a
    // square) resolves the same way every time.
    //
    // The two log rules sit first on purpose. Without that they would almost
    // never be reached: 1 and 100 are squares, 2 is prime, and 10, 100 and
    // 1000 are multiples of five, so a special figure at a power of ten would
    // be decided by the luck of the rule order instead of being what the
    // number means.
    //
    // The ordinary half of the day (the leftover even and odd minutes) keeps
    // the quiet palette the footer has always had, so the pattern shows up as
    // occasional events rather than as constant change. A variant differs from
    // its neighbours in seed, layer count, framing and colour family at once,
    // and where the family takes a seed that seed is nudged by a hash of the
    // minute, so the same variant at 11:11 and at 11:37 is the same family in a
    // different position. The other families carry their minute in the phase of
    // their own morph instead.

    const footer = document.getElementById('footer');
    const canvas = footer ? footer.querySelector('.footer-fractal') : null;

    if (!canvas) {
        return;
    }

    const connection = navigator.connection ||
        navigator.mozConnection || navigator.webkitConnection;

    // A data-saver user did not ask for a live computed texture.
    if (connection && connection.saveData) {
        return;
    }

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    const TAU = Math.PI * 2;
    // The full field. This is the depth the design was drawn at; the pixel
    // budget below, never the depth, is what keeps the band inside its frame.
    const ITERATIONS = 420;
    const BAILOUT = 1024;
    // Horizontal extent of the plane. The vertical extent follows the canvas
    // aspect ratio, so a phone gets a taller window onto the same design rather
    // than a magnification of it.
    const SPAN_X = 3.0;

    // Ceiling on the bitmap. Every displayed frame is a full field, so the
    // ceiling is what keeps the band from dropping frames: at 2.6 megapixels a
    // 1.3x screen only managed half the frame rate, while 1.3 megapixels holds
    // the full rate at about 1.5 device pixels per CSS pixel, which still lands
    // the filaments sharp rather than scaling up a CSS-pixel buffer.
    //
    // It is a budget, not a constant: the shader's cost is linear in pixels, so
    // a GPU that cannot hold the frame rate is given fewer pixels instead of a
    // stutter, down to a floor that is still a legible field. The canvas is
    // sized in CSS, so a smaller bitmap costs sharpness, never layout.
    const MAX_PIXELS = 1300000;
    const MIN_PIXELS = 430000;
    const MAX_DPR = 2;

    // The virtual pointer. Its excursions are the seed offsets the real mouse
    // used to produce, and its periods are slow and unrelated, so the field
    // reorganises without ever repeating a gesture.
    // Kept tighter than the pointer version's extremes, and biased low: past
    // about +0.003 on the imaginary axis the figure opens into broad empty
    // bulbs, and the field all but disappears. This envelope was measured
    // across a grid of seeds to stay inside the lace everywhere, so the
    // per-variant nudge below is clamped into it as well.
    const DRIFT = { re: 0.0018, im: 0.0012 };
    // That envelope is shared between the two things that move the seed: the
    // slow drift and the per-minute offset below. Their amplitudes are split so
    // the sum never leaves the envelope, at any phase and any minute.
    const DRIFT_MOVE = 0.6;
    const DRIFT_NUDGE = 0.4;
    const DRIFT_ORIGIN = { re: 0, im: -0.0035 };
    // Seconds, not minutes. The seed's travel is what changes the shape, and
    // its speed is what turns that travel into visible morphing. At the old
    // 240 s / 300 s the figure rearranged over the better part of five
    // minutes and read as still for anyone glancing at it; at 90 s / 110 s the
    // same travel is covered about three times faster, so a shape-level
    // rearrangement is visible inside half a minute while the drift stays
    // smooth. The full 420 steps hold at this speed.
    const PERIOD = { x: 60000, y: 75000 };

    // One field per displayed frame. Forty milliseconds is the rate the design
    // was judged at, and the field is highly resolved in time: at this drift
    // rate two neighbouring frames are already different samples, so there is
    // nothing a faster cadence would resolve.
    const FRAME_INTERVAL = 40;

    // The view does not move. It used to — the plane was turned and breathed on
    // slow periods, which made the lace travel through the frame — and that is
    // now the wrong motion: when the figures reshape themselves, a moving window
    // on top of it reads as the picture sliding, and at this sensitivity a few
    // degrees of turn already reshuffles half the pixels. So the window is held
    // still and everything seen to change is the geometry of the family, which
    // the shader gets as uMorph. The only motion left is the seed wander, and
    // that is a parameter of the Julia interference rather than a camera.
    const VIEW_TURN = { angle: 0, period: 60000 };
    const VIEW_BREATHE = { scale: 0, period: 80000 };
    const VIEW_ORIGIN = { angle: -0.12, scale: 1 };

    // How much of each new field sample the accumulation takes. Lower is
    // smoother and slower; at a frame every 40 ms this settles in about a tenth
    // of a second, which is long enough to melt single-pixel flicker and short
    // enough that the shape still morphs visibly.
    const FIELD_WEIGHT = 0.34;

    // How long the canvas is held dim while a new variant is built behind it.
    // Matches the `.is-fractal-swapping` transition in main.scss.
    const SWAP_FADE = 450;

    // -----------------------------------------------------------------
    // The variants
    // -----------------------------------------------------------------
    // Each variant is a whole picture: the family it draws (FIGURES below), its
    // fog ramp and its two rim colours. The ramps are the same dark navy family
    // so no variant fights the footer's own gradient, and only the rim changes
    // hue enough to name the family at a glance.
    //
    // The ramps are long and concentrated where the field's numbers actually
    // live (the escape fraction of interest is the bottom third of the range),
    // so every variant carries several bands of colour rather than one flat
    // wash — the shape the reference plates get from repeating palettes.
    //
    // The iteration depth is shared, so the pixel budget and the cadence guard
    // below carry over unchanged.
    const VARIANTS = {
        // The ordinary even minute, and the look the footer has always had:
        // two different Julia seeds interfering, slate fog, copper rim.
        even: {
            layers: [
                {
                    cx: -0.74543, cy: 0.11301,
                    rot: -0.16, zoom: 0.22, ox: 0, oy: 0.03
                },
                {
                    cx: -0.39054, cy: -0.58679,
                    rot: 0.75, zoom: 0.6, ox: 0.1, oy: -0.07
                }
            ],
            stops: [
                [0, 10, 15, 22],
                [0.02, 16, 24, 32],
                [0.05, 26, 40, 52],
                [0.09, 40, 62, 80],
                [0.14, 58, 94, 116],
                [0.2, 88, 130, 152],
                [0.28, 126, 160, 178],
                [0.4, 92, 118, 132],
                [0.55, 140, 150, 150],
                [0.75, 190, 190, 186],
                [1, 224, 214, 198]
            ],
            edgeLow: [208, 160, 124],
            rimHot: [242, 226, 198]
        },
        // The ordinary odd minute: the Burning Ship's crags, in the cool
        // slate-and-steel palette.
        odd: {
            stops: [
                [0, 9, 13, 20],
                [0.02, 14, 20, 30],
                [0.05, 22, 30, 46],
                [0.09, 32, 44, 68],
                [0.14, 46, 62, 92],
                [0.2, 64, 84, 118],
                [0.28, 92, 110, 142],
                [0.4, 66, 78, 104],
                [0.55, 116, 130, 158],
                [0.75, 168, 182, 204],
                [1, 208, 220, 234]
            ],
            edgeLow: [150, 178, 196],
            rimHot: [214, 232, 244]
        },
        // A prime minute: an Apollonian packing, circles inside circles, with
        // the only mint rim in the set.
        prime: {
            stops: [
                [0, 8, 14, 17],
                [0.02, 12, 22, 24],
                [0.05, 18, 34, 36],
                [0.09, 26, 50, 50],
                [0.14, 36, 72, 66],
                [0.2, 54, 98, 84],
                [0.28, 84, 130, 106],
                [0.4, 62, 100, 84],
                [0.55, 118, 158, 132],
                [0.75, 172, 200, 180],
                [1, 214, 230, 216]
            ],
            edgeLow: [168, 214, 186],
            rimHot: [224, 240, 222]
        },
        // A multiple of seven: Newton's basin boundaries for z^3 - 1, three
        // lobes of lace, with the warm brass rim.
        septile: {
            stops: [
                [0, 12, 12, 15],
                [0.02, 18, 16, 18],
                [0.05, 30, 24, 22],
                [0.09, 46, 34, 28],
                [0.14, 66, 44, 32],
                [0.2, 92, 60, 38],
                [0.28, 126, 86, 46],
                [0.4, 96, 68, 42],
                [0.55, 150, 112, 66],
                [0.75, 198, 164, 112],
                [1, 232, 206, 158]
            ],
            edgeLow: [222, 186, 120],
            rimHot: [248, 226, 176]
        },
        // A multiple of five: the nodal figure of a standing wave on a plate,
        // in the violet fog and cool blue rim.
        quintile: {
            stops: [
                [0, 9, 10, 20],
                [0.02, 14, 15, 30],
                [0.05, 22, 22, 46],
                [0.09, 33, 32, 66],
                [0.14, 48, 46, 90],
                [0.2, 66, 64, 118],
                [0.28, 88, 90, 146],
                [0.4, 62, 62, 104],
                [0.55, 114, 116, 164],
                [0.75, 164, 166, 204],
                [1, 210, 212, 232]
            ],
            edgeLow: [156, 186, 232],
            rimHot: [216, 224, 246]
        },
        // A perfect-square minute: a Sierpiński lattice whose holes breathe, in
        // the Matrix green of the footer's first figures.
        square: {
            stops: [
                [0, 8, 13, 10],
                [0.02, 12, 20, 14],
                [0.05, 18, 30, 20],
                [0.09, 26, 44, 28],
                [0.14, 36, 62, 38],
                [0.2, 52, 86, 50],
                [0.28, 78, 116, 70],
                [0.4, 58, 88, 56],
                [0.55, 108, 140, 100],
                [0.75, 160, 186, 150],
                [1, 206, 224, 198]
            ],
            edgeLow: [124, 206, 150],
            rimHot: [200, 236, 196]
        },
        // A power of ten: Newton's tenth-power basins, whose ten walls gather
        // and split as one coefficient sweeps, in indigo with a silver rim.
        // Four minutes a day, so it is rare and meant to be noticed.
        decade: {
            stops: [
                [0, 8, 8, 16],
                [0.02, 12, 12, 26],
                [0.05, 18, 18, 38],
                [0.09, 26, 26, 54],
                [0.14, 38, 38, 74],
                [0.2, 54, 54, 96],
                [0.28, 74, 74, 120],
                [0.4, 52, 52, 86],
                [0.55, 104, 104, 138],
                [0.75, 158, 158, 186],
                [1, 220, 220, 236]
            ],
            edgeLow: [222, 222, 232],
            rimHot: [246, 246, 252]
        },
        // A power of two: a cellular tessellation, every cell a lit pane with
        // its own glowing wall, in cold cyan with an ice-blue rim.
        binary: {
            stops: [
                [0, 8, 14, 20],
                [0.02, 12, 22, 30],
                [0.05, 18, 34, 46],
                [0.09, 26, 50, 66],
                [0.14, 38, 72, 92],
                [0.2, 54, 98, 120],
                [0.28, 76, 128, 150],
                [0.4, 54, 96, 116],
                [0.55, 104, 148, 168],
                [0.75, 156, 194, 212],
                [1, 214, 232, 242]
            ],
            edgeLow: [172, 214, 240],
            rimHot: [226, 242, 252]
        }
    };

    // -----------------------------------------------------------------
    // The figures
    // -----------------------------------------------------------------
    // Which family each minute class draws, and how that family is framed on
    // the plane. Every variant is a different mathematical object rather than
    // another seed of one: an interference of two Julia sets, the Burning
    // Ship's crags, an Apollonian circle packing, Newton's basin boundaries
    // for z^3 - 1 and for z^10 - 1, the nodal lines of a standing wave, a
    // Sierpiński lattice, and a cellular tessellation.
    // No family appears twice, and only one of them is a Julia set.
    //
    // `scale` multiplies the screen plane (which spans about 3 units across) and
    // `cx`/`cy` move its centre, so each set is framed on its own body instead
    // of being forced into one window.
    const FIGURES = {
        even: {
            kind: 'julia', floor: 0.10,
            lift: [0.996, -0.036, 0.126, -0.017]
        },
        // A circle packing: every inversion step puts the point inside a smaller
        // tangent circle, and the gap it finally lands in is the figure. The
        // number of tangent circles follows the phase, which re-packs the whole
        // lattice in place instead of moving it.
        prime: { kind: 'apollonian', scale: 1.0, cx: 0, cy: 0 },
        // A Sierpiński lattice: the cell that is cut away at each level keeps
        // its own lit rim. With the phase the hole in that cell changes radius,
        // its corners round off, and the cut's own ratio widens and tightens,
        // so every rim in the hierarchy re-spaces and re-shapes without the
        // window moving.
        square: { kind: 'lattice', scale: 0.95, cx: 0.5, cy: 0.5 },
        // A tenth-power Newton star: ten basins meeting at the centre, framed
        // off-centre on the lace of their walls rather than on one flat basin.
        decade: { kind: 'newton10', scale: 0.72, cx: 0.05, cy: 0.62 },
        // Families whose own dynamics change shape inside a fixed frame: the
        // parameter lives in the map, not in the window, so nothing has to
        // move across the plane for the geometry to change.
        //
        // The Burning Ship, zoomed into the crags along its hull: every bulb
        // is angular where the quadratic sets are round, so it reads as its own
        // figure even beside the Julia lace.
        odd: {
            kind: 'ship', scale: 0.042, cx: -1.755, cy: -0.028,
            tail: 90, bend: 0.18, stretch: 0.06, hinge: 0, inner: 0.34,
            floor: 0.10, lift: [1.073, 0.103, 0.018, -0.010]
        },
        septile: { kind: 'newton', scale: 0.8, cx: 0, cy: 0 },
        // A standing wave on a square plate: the bright curves are the nodal
        // lines, where the two modal solutions cancel. Both mode numbers are
        // real and drift with the phase, so the whole figure of curves is seen
        // to flow and re-cross rather than to slide.
        quintile: {
            kind: 'nodal', scale: 0.62, cx: 0, cy: 0,
            n: 6, m: 9, dn: 1.1, dm: 1.5
        },
        // A cellular tessellation: one seed per cell, each wandering inside
        // its own cell. Cell size is set by the scale, so the band carries a
        // mosaic rather than a single rosette in the middle of it.
        binary: {
            kind: 'cellular', scale: 4.4, cx: 0, cy: 0,
            reach: 0.30, swing: 0.18, turn: 1.15
        }
    };
        // The escape-time sets are framed into their boundary detail, not on
        // the whole body: at whole-set scale the filaments are thinner than a
        // pixel, and the band paints a faint dust instead of lace (measured:
        // no pixel above 60/255 alpha at that framing). The reference plates
        // are zooms for the same reason.

    // The shared tail of every escape-time figure. The traps become the
    // filigree; the rim is the shell of points that escape only just before
    // the set's boundary, which is what draws an outline around every bulb.
    const escapeTail = function (iterScale, inner, floor, lift) {
        const scale = iterScale || ITERATIONS;
        const body = inner || 0.30;
        // A floor under the light, not under the contrast: the lace keeps its
        // bright peaks, but a phase that thins the structure cannot take the
        // band's brightness with it. It sits well below the lace so the darks
        // are still dark.
        const base = floor || 0.02;

        return [
            '',
            '    float ring = 1.0 / (1.0 + trapR * 9.0);',
            '    float line = max(1.0 / (1.0 + trapRe * 30.0),',
            '                     1.0 / (1.0 + trapIm * 30.0));',
            '    float ring2 = ring * ring;',
            '    float line2 = line * line;',
            '    float ring6 = ring2 * ring2 * ring2;',
            '    float line6 = line2 * line2 * line2;',
            '',
            // Inside the set: a soft, low tone rather than nothing, so a
            // whole-set framing reads as a filled silhouette with a lit
            // outline instead of a line drawing that all but disappears.
            '    if (iter >= ITERATIONS) {',
            '        return vec2(' + f(body) + ', 0.0);',
            '    }',
            '',
            '    float magnitude = log(zr2 + zi2) * 0.5;',
            '    float nu = log(magnitude / 0.6931471805599453) / 0.6931471805599453;',
            '    float smoothIter = max(0.0, iter + 1.0 - nu);',
            '    float t = min(1.0, smoothIter / ' + f(scale) + ');',
            '',
            // The fog is the escape count on a logarithmic scale. Linear in the
            // count, almost every visible band sits in the bottom few per cent
            // of the ramp and the band paints one flat tone; logarithmic, the
            // low counts spread across the whole palette, which is where the
            // layered bands of the reference plates come from.
            '    float band = log(1.0 + smoothIter) / 6.043;',
            '',
            // The dynamical-plane families spread their counts over a shorter
            // range, so their fog carries more of the field than the deep
            // zooms do; without the extra gain they read as a dim wash.
            // Light compensation, separate from the geometry: the family's own
            // phase is allowed to reshape it, but not to darken it. Counting
            // iterations makes some phases carry less lace than others, and a
            // band that fades for a third of every cycle is exactly what a
            // viewer notices, so the light is scaled by a plain cosine of the
            // same phase — the shape still moves through the whole range.
            // Only families whose shadeAt owns the phase get the light term;
            // the Julia layers are shaded inside figure(), where it does not
            // exist, and apply theirs in shadeAt instead.
            lift ? '    float light = ' + lightGain(lift) + ';' : '',
            '    return vec2(min(0.98, ' + (lift ? 'light * (' : '(') +
                f(base) + ' + ' + f(iterScale ? 1.45 : 0.74) +
                ' * band + 0.4 * ring6 + 0.18 * line6)),',
            // A narrow shell: the rim is what reads as a drawn outline, so it
            // is kept thin and crisp instead of fading across a sixth of the
            // field, which smeared every filament into its neighbour.
            '                smoothstep(0.55, 0.86, t));',
            '}'
        ].join('\n');
    }

    // One escape-time family: the same loop, traps and shading, with the
    // family's own iteration step spliced in.
    function escapeFigure(figure, init, step) {
        return [
            'vec2 shadeAt(vec2 p) {',
            '    float mo = uMorph * 2.0 - 1.0;',
            '    vec2 q = p * ' + f(figure.scale) + ' + vec2(' +
                f(figure.cx) + ', ' + f(figure.cy) + ');',
            // The formula itself breathes: a small linear term is added inside
            // the iteration, z <- z^2 + k z + c, which reshapes bulbs and
            // filaments instead of panning them. Without it every frame of a
            // zoom would be the same picture at a new address.
            // The geometry deforms: the window is stretched along one axis and
            // compressed along the other, and sheared, by a slow phase. Bulbs
            // and filaments are seen to widen, narrow and lean, which is a
            // change of shape rather than of position — and it never leaves the
            // window the framing was measured on, so the lace cannot vanish.

            init,
            '    float zr2 = zr * zr;',
            '    float zi2 = zi * zi;',
            '    float iter = 0.0;',
            '    float trapR = 1.0e9;',
            '    float trapRe = 1.0e9;',
            '    float trapIm = 1.0e9;',
            '',
            '    for (int i = 0; i < int(ITERATIONS); i += 1) {',
            '        if (zr2 + zi2 >= BAILOUT) {',
            '            break;',
            '        }',
            '',
            step,
            '        iter += 1.0;',
            '',
            '        if (iter > 5.0) {',
            '            trapR = min(trapR, zr2 + zi2);',
            '            trapRe = min(trapRe, abs(zr));',
            '            trapIm = min(trapIm, abs(zi));',
            '        }',
            '    }',
            escapeTail(figure.tail, figure.inner, figure.floor, figure.lift)
        ].join('\n');
    }

    // Two Julia figures interfering, screen-blended — the look the footer had
    // before the schedule existed.
    function juliaFigure(layers, floor, lift) {
        // The layers turn against each other, and only slightly, because that
        // is the one motion that cannot change how much lace there is: a
        // rotation keeps every part of the set in frame, so the band's light is
        // the same at every phase. Spacing and zoom morphs were tried first —
        // they reshape the interference more, but they also thin it, and a band
        // that fades for a third of the cycle reads as broken whatever the shape
        // is doing.
        const figures = layers.map(function (layer, index) {
            const turn = index === 0 ? -0.26 : 0.34;
            const base = index === 0 ? Math.atan2(layer.sin, layer.cos) :
                Math.atan2(layer.sin, layer.cos);
            const r = index === 0 ? 0.0030 : 0.0024;
            const s = index === 0 ? 1 : -1;
            return '    shade = screen(shade, figure(p, vec2(' +
                f(layer.cx) + ', ' + f(layer.cy) + ') + vec2(mo * (' +
                f(r * s) + '), (' + f(r * s) +
                ') * sqrt(max(0.0, 1.0 - mo * mo))), ' + f(layer.zoom) +
                ', vec2(cos(' + f(base) + ' + mo * (' + f(turn) + ')), ' +
                'sin(' + f(base) + ' + mo * (' + f(turn) + '))), vec2(' +
                f(layer.ox) + ', ' + f(layer.oy) + ')) * ' +
                f(index === 0 ? 1 : 0.7) + ');';
        }).join('\n');

        return [
            'vec2 figure(vec2 p, vec2 seed, float zoom, vec2 rot, vec2 off) {',
            '    vec2 q = vec2(p.x * rot.x - p.y * rot.y,',
            '                  p.x * rot.y + p.y * rot.x) * zoom + off;',
            '    float zr = q.x;',
            '    float zi = q.y;',
            '    float zr2 = zr * zr;',
            '    float zi2 = zi * zi;',
            '    float iter = 0.0;',
            '    float trapR = 1.0e9;',
            '    float trapRe = 1.0e9;',
            '    float trapIm = 1.0e9;',
            '',
            '    for (int i = 0; i < int(ITERATIONS); i += 1) {',
            '        if (zr2 + zi2 >= BAILOUT) {',
            '            break;',
            '        }',
            '',
            '        zi = 2.0 * zr * zi + seed.y;',
            '        zr = zr2 - zi2 + seed.x;',
            '        zr2 = zr * zr;',
            '        zi2 = zi * zi;',
            '        iter += 1.0;',
            '',
            '        if (iter > 5.0) {',
            '            trapR = min(trapR, zr2 + zi2);',
            '            trapRe = min(trapRe, abs(zr));',
            '            trapIm = min(trapIm, abs(zi));',
            '        }',
            '    }',
            escapeTail(null, null, floor),
            '',
            'vec2 shadeAt(vec2 p) {',
            '    float mo = uMorph * 2.0 - 1.0;',
            '    vec2 shade = vec2(0.0);',
            figures,
            // Light compensation for the interference, applied where the phase
            // is in scope: the layers' spacing changes how much lace they
            // cross over, so the light is scaled by the same phase to keep the
            // band's brightness flat while its shape moves.
            // Both ends of the phase thin the interference (the layers are
            // furthest apart in spacing there), so the compensation is even in
            // the phase rather than linear: it lifts the two troughs and leaves
            // the crossing, where the lace is dense, alone.
            '    float light = ' + lightGain(lift) + ';',
            '    return vec2(min(0.98, shade.x * light), shade.y);',
            '}'
        ].join('\n');
    }

    // Newton's method on z^3 - 1: the basins are flat and quick, and their
    // boundaries take longest to settle, so the iteration count draws the lace.
    function newtonFigure(figure) {
        return [
            'vec2 shadeAt(vec2 p) {',
            '    float mo = uMorph * 2.0 - 1.0;',
            // The polynomial itself turns and its constant drifts: rotating
            // where each orbit starts turns the three basins, and moving the
            // constant relocates the roots, so the basin walls are seen
            // reshaping rather than sliding across the frame. The plane is
            // warped as well, which stretches the basins' walls.
            '    vec2 q = p * ' + f(figure.scale) + ' + vec2(' +
                f(figure.cx) + ', ' + f(figure.cy) + ');',
                                    // The roots stay where they are; the step is over-relaxed and
            // under-relaxed instead, which widens and narrows every basin wall
            // where the three basins meet, so the lace reshapes in place.
            '    float A = 1.0;',
            '    float relax = 1.0 + mo * 0.18;',
            '    float th = mo * 0.18;',
            '    float ct = cos(th);',
            '    float st = sin(th);',
            // The plane itself is stretched along one axis and compressed
            // along the other, so the arms of the star widen and narrow instead
            // of the whole figure turning in place.
            '    float zr = (q.x * ct - q.y * st) * (1.0 + mo * 0.32);',
            '    float zi = (q.x * st + q.y * ct) * (1.0 - mo * 0.32);',
            '    float iter = 0.0;',
            '    float best = 1.0e9;',
            '',
            '    for (int i = 0; i < 60; i += 1) {',
            '        float zr2 = zr * zr;',
            '        float zi2 = zi * zi;',
            '        float wr = zr * (zr2 - 3.0 * zi2) - A;',
            '        float wi = zi * (3.0 * zr2 - zi2);',
            '        best = min(best, sqrt(wr * wr + wi * wi));',
            '        float dr = 3.0 * (zr2 - zi2);',
            '        float di = 6.0 * zr * zi;',
            '        float den = max(dr * dr + di * di, 1.0e-6);',
            '        zr -= relax * (wr * dr + wi * di) / den;',
            '        zi -= relax * (wi * dr - wr * di) / den;',
            '        iter += 1.0;',
            '        if (best < 0.0002) {',
            '            break;',
            '        }',
            '    }',
            '',
            '    float t = clamp(iter / 22.0, 0.0, 1.0);',
            '    float lace = 1.0 / (1.0 + best * 22.0);',
            '    return vec2(min(0.96, 0.03 + 0.6 * pow(t, 0.75) + 0.18 * lace),',
            '                smoothstep(0.5, 1.0, t));',
            '}'
        ].join('\n');
    }

    // A standing wave on a square plate: two modal solutions of the plate
    // equation, cos(nx)cos(my) and its transpose. Their difference vanishes on
    // the nodal lines, so the bright curves are where the plate would be still
    // and the dark cells are where it swings. Both mode numbers are real and
    // drift with the phase, so the curves are seen to flow, split and re-cross
    // instead of the figure sitting in one place.
    function nodalFigure(figure) {
        return [
            'vec2 shadeAt(vec2 p) {',
            '    float mo = uMorph * 2.0 - 1.0;',
            '    vec2 q = p * ' + f(figure.scale) + ' + vec2(' +
                f(figure.cx) + ', ' + f(figure.cy) + ');',
            '    float n = ' + f(figure.n) + ' + mo * ' + f(figure.dn) + ';',
            '    float m = ' + f(figure.m) + ' + mo * ' + f(figure.dm) + ';',
            '    float a = cos(n * 3.14159265 * q.x) * cos(m * 3.14159265 * q.y);',
            '    float b = cos(m * 3.14159265 * q.x) * cos(n * 3.14159265 * q.y);',
            '    float v = abs(a - b);',
            // The line itself, and the glow that falls away from it: the plate
            // is glass, so the nodal curve reads as an etched edge against a
            // faintly lit cell rather than as a hard stroke.
            '    float node = 1.0 / (1.0 + v * 70.0);',
            '    float wash = 1.0 / (1.0 + v * 5.0);',
            '    float disc = (1.0 - smoothstep(0.93, 1.0, abs(q.x))) *',
            '                 (1.0 - smoothstep(0.93, 1.0, abs(q.y)));',
            '    return vec2((0.06 + 0.30 * wash + 0.30 * node) * disc,',
            '                max(node * 0.75, wash * 0.18) * disc);',
            '}'
        ].join('\n');
    }

    // A cellular tessellation: one seed per cell, each cell being the points
    // nearer to its own seed than to any other. Every seed wanders inside its
    // own cell, and with the phase that wander both widens and turns, so the
    // cells are seen to change shape, split their neighbours' boundaries and
    // trade corners — the lattice deforms in place instead of sliding.
    function cellularFigure(figure) {
        return [
            'vec2 shadeAt(vec2 p) {',
            '    float mo = uMorph * 2.0 - 1.0;',
            '    vec2 q = p * ' + f(figure.scale) + ' + vec2(' +
                f(figure.cx) + ', ' + f(figure.cy) + ');',
            '    vec2 cell = floor(q);',
            '    float ca = cos(mo * ' + f(figure.turn) + ');',
            '    float sa = sin(mo * ' + f(figure.turn) + ');',
            '    float reach = ' + f(figure.reach) + ' + mo * ' +
                f(figure.swing) + ';',
            '    float best = 1.0e9;',
            '    float second = 1.0e9;',
            '',
            '    for (int y = -1; y <= 1; y += 1) {',
            '        for (int x = -1; x <= 1; x += 1) {',
            '            vec2 g = cell + vec2(float(x), float(y));',
            '            vec2 h = vec2(',
            '                fract(sin(dot(g, vec2(127.1, 311.7))) * 43758.5453),',
            '                fract(sin(dot(g, vec2(269.5, 183.3))) * 43758.5453));',
            '            h = vec2(h.x - 0.5, h.y - 0.5);',
            '            h = vec2(h.x * ca - h.y * sa, h.x * sa + h.y * ca);',
            '            vec2 c = g + 0.5 + h * reach;',
            '            float dd = length(q - c);',
            '',
            '            if (dd < best) {',
            '                second = best;',
            '                best = dd;',
            '            } else {',
            '                second = min(second, dd);',
            '            }',
            '        }',
            '    }',
            '',
            '    float glow = 1.0 - smoothstep(0.05, 0.72, best);',
            '    float wall = 1.0 - smoothstep(0.0, 0.09, second - best);',
            '    return vec2(0.04 + 0.40 * glow * glow + 0.10 * glow,',
            '                max(wall * 0.85, glow * 0.22));',
            '}'
        ].join('\n');
    }

    // An Apollonian packing: the point is inverted through the circles of the
    // current cell until it lands in a gap. How many inversions that took says
    // how deeply it sits in the packing, and the distance to the nearest circle
    // at that moment draws the rim. The number of tangent circles follows the
    // phase, so the packing re-forms instead of moving.
    function apollonianFigure(figure) {
        return [
            'vec2 shadeAt(vec2 p) {',
            '    float mo = uMorph * 2.0 - 1.0;',
            '    float count = 3.0 + mo * 0.60;',
            '    float theta = 3.14159265 / count;',
            '    float rb = 1.0 / cos(theta);',
            '    float side = tan(theta);',
            '    float rIn = rb - side;',
            '    float rOut = rb + side;',
            '    float side2 = side * side;',
            '    vec2 q = p * ' + f(figure.scale) + ' + vec2(' +
                f(figure.cx) + ', ' + f(figure.cy) + ');',
            '    float near = 1.0e9;',
            '    float depth = 0.0;',
            '',
            '    for (int k = 0; k < 80; k += 1) {',
            '        float level = 1.0e9;',
            '        bool hit = false;',
            '        float p2 = max(dot(q, q), 1.0e-12);',
            '        float dev = p2 - rIn * rIn;',
            '',
            // The two coaxial circles of the cell.
            '        if (dev > 0.0) {',
            '            level = min(level, abs(dev) / (2.0 * rIn));',
            '        } else {',
            '            q *= (rIn * rIn) / p2;',
            '            hit = true;',
            '        }',
            '',
            '        if (!hit) {',
            '            dev = rOut * rOut - p2;',
            '',
            '            if (dev > 0.0) {',
            '                level = min(level, abs(dev) / (2.0 * rOut));',
            '            } else {',
            '                q *= (rOut * rOut) / p2;',
            '                hit = true;',
            '            }',
            '        }',
            '',
            // The ring of tangent circles around them.
            '        if (!hit) {',
            '            for (int i = 0; i < 4; i += 1) {',
            '                if (float(i) >= count) {',
            '                    break;',
            '                }',
            '',
            '                float a = 2.0 * float(i) * theta;',
            '                vec2 c = rb * vec2(sin(a), cos(a));',
            '                vec2 d = q - c;',
            '                float d2 = max(dot(d, d), 1.0e-12);',
            '                float away = d2 - side2;',
            '',
            '                if (away > 0.0) {',
            '                    level = min(level, abs(away) / (2.0 * side));',
            '                } else {',
            '                    q = c + d * (side2 / d2);',
            '                    hit = true;',
            '                    break;',
            '                }',
            '            }',
            '        }',
            '',
            // The first level with no circle to invert through is the gap the
            // point occupies: its distance to the nearest circle draws the rim.
            '        near = level;',
            '',
            '        if (!hit) {',
            '            break;',
            '        }',
            '',
            '        depth += 1.0;',
            '    }',
            '',
            '    float reach = min(1.0, depth / 48.0);',
            '    float outline = 1.0 / (1.0 + near * 220.0);',
            '',
            '    return vec2(min(0.96, 0.08 + 0.44 * reach + 0.32 * outline),',
            '                max(outline, smoothstep(0.62, 0.98, reach) * 0.55));',
            '}'
        ].join('\n');
    }

    // A Sierpiński lattice: at every level the middle cell of the three-by-three
    // is cut away, and the hole inside that cell is what the phase opens and
    // closes. The phase also moves the cut itself, so the three-by-three becomes
    // a tighter or wider grid, and it takes the hole's corners off, so every rim
    // in the hierarchy re-spaces and re-shapes rather than only the top-level
    // hole changing size. Every cut cell keeps a lit rim, so the hierarchy reads
    // as nested rectangles at every scale. The recursion stops at the scale the
    // bitmap can resolve, so the fine levels never alias into a shimmer.
    function latticeFigure(figure) {
        return [
            'vec2 shadeAt(vec2 p) {',
            '    float mo = uMorph * 2.0 - 1.0;',
            // Three things follow the phase, so the lattice changes shape and
            // not only its light: the grid the cut re-spaces to, the radius of
            // the hole inside each cut cell, and how far that hole's corners
            // are taken off.
            '    float hole = 0.52 - mo * 0.18;',
            '    float grid = 3.0 + mo * 0.16;',
            '    float reach = hole * 0.5;',
            // Plane units per screen pixel: a rim stays a rim, not a shimmer.
            '    float pixel = uSpanY / uSize.y / uView.z;',
            '    vec2 u = p * ' + f(figure.scale) + ' + vec2(' +
                f(figure.cx) + ', ' + f(figure.cy) + ');',
            '    float cells = 1.0;',
            '',
            '    for (int i = 0; i < 9; i += 1) {',
            '        vec2 cell = floor(u);',
            '        vec2 local = u - cell;',
            '        float cellPixels = 1.0 / (pixel * ' + f(figure.scale) +
                ' * cells);',
            '',
                            '        if (cellPixels < 4.0) {',
            '            return vec2(0.10, 0.0);',
            '        }',
            '',
            '        float width = clamp(1.3 / cellPixels, 0.014, 0.34);',
            '',
            '        if (cell.x == 1.0 && cell.y == 1.0) {',
            // The hole's outline: a superellipse about the cell centre, whose
            // exponent travels from 10 (a square) to 2 (a circle). Every
            // exponent in between gives a convex outline, so the corners are
            // taken off evenly and the hole is seen to round; the rim rides
            // just inside the outline, so it rounds with it. A corner term
            // subtracted from the Chebyshev radius was tried first and pulled
            // the sides inward as well, pinching the hole into a star.
            '            vec2 d = abs(local - 0.5);',
            // Named for the outline, not for p: the sample point this function
            // is given is already called p, and a local p would shadow it for
            // the rest of the block, so a later read of the coordinate would
            // silently get the exponent instead. Shadowing compiles here; it is
            // the reader it misleads.
            '            float shape = 6.0 - mo * 4.0;',
            '            float band = pow(pow(d.x, shape) + pow(d.y, shape),',
                '                1.0 / shape);',
            '',
            '            if (band < reach) {',
            '                float rim = reach - band;',
            '                float edge = 1.0 - smoothstep(width * 0.4,',
            '                    width * 1.7, rim);',
            '',
            '                return vec2(0.05 + 0.12 * (float(i) / 9.0) +',
            '                    0.10 * (1.0 - smoothstep(0.0, 0.4, rim)), edge);',
            '            }',
            '',
            '            return vec2(0.26, 0.70);',
            '        }',
            '',
            '        u = local * grid;',
            '        cells *= grid;',
            '    }',
            '',
            '    return vec2(0.12, 0.30);',
            '}'
        ].join('\n');
    }

    // Newton's method on z^10 - 1: ten basins meeting at the centre, their
    // walls carrying the same fractal lace as the cubic family but at tenfold
    // symmetry. The constant's angle turns with the phase, so the star of
    // basins rotates in place; a rotation keeps every basin in frame, which is
    // what holds the band's contrast steady — the rational plane tried first
    // alternated between a lit body and an empty window. The step is also over-
    // and under-relaxed, which widens and narrows the walls where ten basins
    // meet.
    //
    // z^10 is two squarings and a multiply (z^4, z^8, z^8 * z^2) and 10 z^9 is
    // z^8 * z scaled, so the tenth power costs no more than a library call.
    function newtonDecadeFigure(figure) {
        return [
            'vec2 shadeAt(vec2 p) {',
            '    float mo = uMorph * 2.0 - 1.0;',
            '    vec2 q = p * ' + f(figure.scale) + ' + vec2(' +
                f(figure.cx) + ', ' + f(figure.cy) + ');',
            // A tenth-power star is symmetric under a tenth of a turn, so
            // turning the roots is invisible at the band's framing — the
            // picture lands on itself. The turn is kept small and the real
            // morph is a coefficient: z^10 + a z^9 - 1 puts a second factor in
            // the polynomial, so one root splits into a pair and the two merge
            // again over the cycle. The basin walls re-form around the new
            // roots instead of turning rigidly with them.
            '    float th = mo * 0.20;',
            '    float Ar = cos(th);',
            '    float Ai = sin(th);',
            '    float split = mo * 0.45;',
            '    float relax = 1.0 + mo * 0.16;',
            '    float zr = q.x;',
            '    float zi = q.y;',
            '    float iter = 0.0;',
            '    float best = 1.0e9;',
            '',
            '    for (int i = 0; i < 64; i += 1) {',
            '        float a_r = zr * zr - zi * zi;',
            '        float a_i = 2.0 * zr * zi;',
            '        float b_r = a_r * a_r - a_i * a_i;',
            '        float b_i = 2.0 * a_r * a_i;',
            '        float c_r = b_r * b_r - b_i * b_i;',
            '        float c_i = 2.0 * b_r * b_i;',
            '        float z9r = c_r * zr - c_i * zi;',
            '        float z9i = c_r * zi + c_i * zr;',
            '        float z10r = c_r * a_r - c_i * a_i;',
            '        float z10i = c_r * a_i + c_i * a_r;',
            '        float w_r = z10r + split * z9r - Ar;',
            '        float w_i = z10i + split * z9i - Ai;',
            '        float d_r = 10.0 * z9r + 9.0 * split * c_r;',
            '        float d_i = 10.0 * z9i + 9.0 * split * c_i;',
            '        best = min(best, sqrt(w_r * w_r + w_i * w_i));',
            '        float den = max(d_r * d_r + d_i * d_i, 1.0e-8);',
            '        zr -= relax * (w_r * d_r + w_i * d_i) / den;',
            '        zi -= relax * (w_i * d_r - w_r * d_i) / den;',
            '        iter += 1.0;',
            '',
            '        if (best < 0.0002) {',
            '            break;',
            '        }',
            '    }',
            '',
            // Basins are the quiet ground and the walls are the lit lace: the
            // fog keeps a steep power of the step count so points that fall
            // straight into a root stay dark, and only the ten basin walls,
            // where the iteration crawls, reach the top of the ramp.
            '    float t = clamp(iter / 64.0, 0.0, 1.0);',
            '    float lace = 1.0 / (1.0 + best * 30.0);',
            '    return vec2(min(0.96, 0.02 + 0.40 * pow(t, 1.2) +',
            '                0.06 * lace), smoothstep(0.45, 0.95, t));',
            '}'
        ].join('\n');
    }

    function figureSource(figure, layers) {
        switch (figure.kind) {
            case 'julia':
                return juliaFigure(layers, figure.floor, figure.lift);
            case 'apollonian':
                return apollonianFigure(figure);
            case 'lattice':
                return latticeFigure(figure);
            case 'ship':
                // (|x| + i|y|)^2 + c: the absolute value folds the plane onto
                // itself each step, which is what makes the ship's crags
                // angular instead of round. The phase stretches the framing
                // about its own centre and bends the iteration with a linear
                // term, so the crags widen, narrow and lean in place.
                //
                // Both amplitudes are measured in frames. This is a deep zoom,
                // where the whole visible region is a few thousandths wide: a
                // bend of a tenth of a unit was thousands of frames' worth, and
                // it tore the map into an empty sea for half the cycle, leaving
                // a dark plate where the band should be. A bend of a quarter of
                // a frame and a stretch of a tenth are the same deformation at
                // a scale the crags survive the whole way round.
                return escapeFigure(figure,
                    [
                        '    vec2 qc = q - vec2(' + f(figure.cx) + ', ' +
                            f(figure.cy) + ');',
                        '    q = qc * vec2(1.0 + mo * ' + f(figure.stretch) +
                            ', 1.0 - mo * ' + f(figure.stretch) + ') +',
                        '        vec2(' + f(figure.cx) + ', ' + f(figure.cy) + ');',
                        '    float zr = 0.0;',
                        '    float zi = 0.0;'
                    ].join('\n'),
                    [
                        // The fold line hinges through the structure with the
                        // phase: the ship is a different angular figure at each
                        // phase, at very nearly the same weight of ink.
                        '        float ar = abs(zr);',
                        '        float ai = abs(zi + mo * ' + f(figure.hinge) +
                            ' * zr);',
                        '        float kb = mo * ' + f(figure.bend) + ' * ' +
                            f(figure.scale) + ';',
                        '        float nr = ar * ar - ai * ai + q.x + kb * 0.45 * ar * ai;',
                        '        zi = 2.0 * ar * ai + q.y + kb * ar;',
                        '        zr = nr;',
                        '        zr2 = zr * zr;',
                        '        zi2 = zi * zi;'
                    ].join('\n'));
            case 'newton':
                return newtonFigure(figure);
            case 'newton10':
                return newtonDecadeFigure(figure);
            case 'nodal':
                return nodalFigure(figure);
            case 'cellular':
                return cellularFigure(figure);
            default:
                return juliaFigure(layers, figure.floor, figure.lift);
        }
    }

    // -----------------------------------------------------------------
    // The schedule
    // -----------------------------------------------------------------

    function isPrime(n) {
        if (n < 2) {
            return false;
        }

        if (n % 2 === 0) {
            return n === 2;
        }

        for (let d = 3; d * d <= n; d += 2) {
            if (n % d === 0) {
                return false;
            }
        }

        return true;
    }

    // True when n is base raised to a whole power, including base^0 = 1. Over
    // the 0..1439 range the repeated division is exact and shorter than any
    // logarithm with an epsilon to tune.
    function isIntegerLog(n, base) {
        if (n < 1) {
            return false;
        }

        let m = n;

        while (m % base === 0) {
            m /= base;
        }

        return m === 1;
    }

    function isSquare(n) {
        const root = Math.round(Math.sqrt(n));

        return root * root === n;
    }

    // First match wins. A number can belong to several classes, and the order
    // is what makes it pick one figure every time: 7 is prime before it is a
    // multiple of seven, 25 a multiple of five before it is a square, and the
    // powers of ten and two come first because almost all of them are also
    // squares or multiples of five.
    const RULES = [
        { id: 'decade', test: function (n) { return isIntegerLog(n, 10); } },
        { id: 'binary', test: function (n) { return isIntegerLog(n, 2); } },
        { id: 'prime', test: isPrime },
        { id: 'septile', test: function (n) { return n > 0 && n % 7 === 0; } },
        { id: 'quintile', test: function (n) { return n > 0 && n % 5 === 0; } },
        { id: 'square', test: isSquare },
        { id: 'even', test: function (n) { return n % 2 === 0; } },
        { id: 'odd', test: function () { return true; } }
    ];

    // Minutes since local midnight: the number the rules read. Fixed to the
    // clock rather than to the visit, so the same minute of the day always
    // shows the same variant, and a visitor who stays a few minutes watches
    // the footer change families at the minute boundary.
    function minuteOfDay(date) {
        return date.getHours() * 60 + date.getMinutes();
    }

    function variantAt(date) {
        const n = minuteOfDay(date);

        for (let i = 0; i < RULES.length; i += 1) {
            if (RULES[i].test(n)) {
                return { id: RULES[i].id, n: n };
            }
        }

        return { id: 'odd', n: n };
    }

    // A deterministic offset for this minute, so two occurrences of one variant
    // differ. It stays inside the measured-safe drift envelope above, whose
    // comment records that the lace holds there.
    function seedNudge(n) {
        let h = Math.imul(n + 1, 2654435761) >>> 0;

        h ^= h >>> 13;
        h = Math.imul(h, 2246822519) >>> 0;
        h ^= h >>> 15;

        return {
            re: ((h & 0xffff) / 0xffff * 2 - 1) * DRIFT.re * DRIFT_NUDGE,
            im: (((h >>> 16) & 0xffff) / 0xffff * 2 - 1) * DRIFT.im * DRIFT_NUDGE
        };
    }

    // A GLSL float literal: the shader is generated from the same constants
    // the 2D fallback uses, so the two paths cannot drift apart.
    function f(value) {
        return (value === Math.round(value) ? value.toFixed(1) : String(value));
    }

    // The exposure curve for one family, as a cubic in the phase, fitted from
    // its measured brightness across a whole cycle. The shapes carry different
    // amounts of lace at different phases, and this holds the band on an even
    // exposure without touching the geometry at all.
    function lightGain(coeff) {
        const [a, b, c, d] = coeff;

        return 'clamp(' + f(a) + ' + (' + f(b) + ') * mo + (' +
            f(c) + ') * mo * mo + (' + f(d) + ') * mo * mo * mo, ' +
            '0.6, 1.55)';
    }

    // The same exposure curve the shader applies, evaluated in script.
    function lightValue(coeff, mo) {
        const value = coeff[0] + coeff[1] * mo + coeff[2] * mo * mo +
            coeff[3] * mo * mo * mo;

        return Math.min(1.55, Math.max(0.6, value));
    }

    // The shader's fract(), for the fallback's cellular hash.
    function fract(value) {
        return value - Math.floor(value);
    }

    // The same knee the shader applies, so the fallback still matches it.
    function smoothstep(edge0, edge1, x) {
        const k = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));

        return k * k * (3 - 2 * k);
    }

    // Colours are kept as 0..255 for the ImageData path and scaled here for
    // the shader, whose channels are 0..1: handing it 0..255 clamps every
    // channel to full and turns a green into a cyan.
    function glsl3(rgb) {
        return 'vec3(' + rgb.map(function (channel) {
            return f(channel / 255);
        }).join(', ') + ')';
    }

    // The fog ramp for one variant: 256 samples of its stops, as the 0..255
    // bytes both the fallback's ImageData and the shader's texture need.
    function buildRamp(stops) {
        const ramp = new Uint8ClampedArray(256 * 3);

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

            // A gentle gain and lift on the way in: every variant's stops are
            // authored as mid tones, and at the canvas opacity the field sits
            // behind, a straight copy of them reads as a grey wash. Sixteen per
            // cent of gain and a few levels of lift keep the hue while making
            // the bands tell apart at a glance.
            // Alternating bands across the ramp, so neighbouring escape bands
            // and the rim are told apart by brightness as well as by hue: a
            // monotone ramp makes a fractal's interior one flat wash, while a
            // banded one gives it the contour structure of a printed plate.
            const band = 0.74 + 0.42 * (0.5 + 0.5 * Math.cos(t * Math.PI * 2 * 9));

            ramp[i * 3] = Math.min(255, ((low[1] + (high[1] - low[1]) * k) * 1.16 + 7) * band);
            ramp[i * 3 + 1] = Math.min(255, ((low[2] + (high[2] - low[2]) * k) * 1.16 + 7) * band);
            ramp[i * 3 + 2] = Math.min(255, ((low[3] + (high[3] - low[3]) * k) * 1.16 + 7) * band);
        }

        return ramp;
    }

    const VERTEX_SOURCE = [
        'attribute vec2 aPos;',
        'void main() {',
        '    gl_Position = vec4(aPos, 0.0, 1.0);',
        '}'
    ].join('\n');

    function fragmentSource(figure, layers, edgeLow, rimHot) {
        const figures = figureSource(figure, layers);

        return [
            'precision highp float;',
            '',
            'uniform vec2 uSeed;',
            // The drift without its fixed composition bias: the families that
            // are not Julia fields amplify this part only, so their framing
            // stays centred while their content moves.
            'const vec2 SEED_ORIGIN = vec2(' + f(DRIFT_ORIGIN.re) + ', ' +
                f(DRIFT_ORIGIN.im) + ');',
            // The shape's own phase, 0..1 and back: every family reads it to
            // deform its geometry, which is separate from where the field sits
            // on screen.
            'uniform float uMorph;',

            'uniform vec2 uSize;',
            'uniform float uSpanY;',
            // xy: cosine and sine of the sampled plane's rotation, z: its
            // scale. Precomputed, since the plane's orientation is uniform.
            'uniform vec3 uView;',
            'uniform sampler2D uRamp;',
            // The accumulation buffer: red carries the fog, green the rim, each
            // eased towards the newest sample rather than replaced by it.
            'uniform sampler2D uField;',
            // 0: add this frame's field to the buffer, 1: present the buffer,
            // 2: compute and present in one pass, for a device with no
            // renderable texture.
            'uniform int uMode;',
            'uniform float uWeight;',
            '',
            'const float SPAN_X = ' + f(SPAN_X) + ';',
            'const float BAILOUT = ' + f(BAILOUT) + ';',
            'const float ITERATIONS = ' + f(ITERATIONS) + ';',
            'const vec3 EDGE_LOW = ' + glsl3(edgeLow) + ';',
            'const vec3 RIM_HOT = ' + glsl3(rimHot) + ';',
            '',
            // Screen blending, per channel: the fog and the edges each keep
            // their own weight where two layers cross.
            'vec2 screen(vec2 base, vec2 top) {',
            '    return base + top - base * top;',
            '}',
            '',
            // The active variant's own figure: fog in x, rim in y.
            figures,

            'vec2 planeAt(vec2 uv) {',
            '    vec2 p = vec2((uv.x - 0.5) * SPAN_X, (0.5 - uv.y) * uSpanY);',
            '    return vec2(p.x * uView.x - p.y * uView.y,',
            '                p.x * uView.y + p.y * uView.x) * uView.z;',
            '}',
            '',
            'void main() {',
            '    vec2 uv = gl_FragCoord.xy / uSize;',
            '',
            // The field pass. It does not clear: it adds its sample over the
            // one already there, weighted, so the buffer holds a short moving
            // average of the field instead of one frame of it.
            '    if (uMode == 0) {',
            '        gl_FragColor = vec4(shadeAt(planeAt(uv)), 0.0, uWeight);',
            '        return;',
            '    }',
            '',
            // Presenting reads the average back, softened a little in space as
            // well: the field's escape time changes wildly from pixel to pixel
            // near the boundary, and a blur of one texel turns that speckle
            // into a bloom along the edge rather than a scatter of dots.
            '    vec2 texel = 1.0 / uSize;',
            '    vec2 field = uMode == 2',
            '        ? shadeAt(planeAt(uv))',
            '        : texture2D(uField, uv).rg * 0.4',
            '          + texture2D(uField, uv + vec2(texel.x, texel.y) * 0.8).rg * 0.15',
            '          + texture2D(uField, uv + vec2(-texel.x, texel.y) * 0.8).rg * 0.15',
            '          + texture2D(uField, uv + vec2(texel.x, -texel.y) * 0.8).rg * 0.15',
            '          + texture2D(uField, uv + vec2(-texel.x, -texel.y) * 0.8).rg * 0.15;',
            '    float fog = field.x;',
            '    float rim = field.y;',
            '',
            '    float u = uv.x;',
            '    float v = 1.0 - uv.y;',
            // The link rows sit in the top third and the base line below them;
            // the field only reaches full strength in the lower part of the
            // footer, so nothing is drawn through the type.
            '    float vFade = clamp((v - 0.06) / 0.42, 0.0, 1.0);',
            '    float vFadeLate = clamp((1.0 - v) / 0.12, 0.0, 1.0);',
            '    float hFade = clamp(min(u / 0.14, (1.0 - u) / 0.14), 0.0, 1.0);',
            // Alpha is what separates the figure from the space around it: the
            // fog keeps a light wash, and the rim is drawn almost solid, so a
            // bulb or a filament arrives as an edged shape rather than as a
            // slightly brighter patch of the same haze.
            // The fog is the ground and is kept deliberately quiet, so the eye
            // has somewhere empty to read against; the rim is held at near full
            // opacity in its own colour, so the outline reads as a drawn line
            // rather than as a thin tint of the blue beside it.
            '    float mask = clamp(fog * 0.62 + rim * 1.25, 0.0, 1.0);',
            '    float alpha = max(pow(mask, 0.92), rim * 0.92) * vFade * vFadeLate * hFade;',
            '    float index = floor(clamp(fog, 0.0, 1.0) * 255.0 + 0.5);',
            '    vec3 color = texture2D(uRamp, vec2((index + 0.5) / 256.0, 0.5)).rgb;',
            '    color = mix(color, EDGE_LOW, clamp(rim * 8.0, 0.0, 1.0));',
            // The crest of the rim lifts towards a pale version of its own hue,
            // the way the reference plates carry a white-hot core along every
            // filament: the band stays a mid tone and only its spine goes light.
            '    color = mix(color, RIM_HOT, smoothstep(0.55, 1.0, rim));',
            '    gl_FragColor = vec4(color, alpha);',
            '}'
        ].join('\n');
    }

    function buildShader(gl, type, source) {
        const shader = gl.createShader(type);

        gl.shaderSource(shader, source);
        gl.compileShader(shader);

        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            // A figure that will not compile must not fail silently: the swap
            // falls back to the previous variant, and the reason belongs in the
            // console beside it.
            if (window.console && window.console.warn) {
                window.console.warn('footer fractal: shader did not compile',
                    gl.getShaderInfoLog(shader));
            }

            gl.deleteShader(shader);
            return null;
        }

        return shader;
    }

    function buildProgram(gl, figure, layers, edgeLow, rimHot) {
        const vertex = buildShader(gl, gl.VERTEX_SHADER, VERTEX_SOURCE);
        const fragment = buildShader(gl, gl.FRAGMENT_SHADER,
            fragmentSource(figure, layers, edgeLow, rimHot));

        if (!vertex || !fragment) {
            return null;
        }

        const program = gl.createProgram();

        gl.attachShader(program, vertex);
        gl.attachShader(program, fragment);
        gl.linkProgram(program);
        gl.deleteShader(vertex);
        gl.deleteShader(fragment);

        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            if (window.console && window.console.warn) {
                window.console.warn('footer fractal: program did not link',
                    gl.getProgramInfoLog(program));
            }

            gl.deleteProgram(program);
            return null;
        }

        return program;
    }

    // The variant on screen: its prepared constants, its ramp, and the offset
    // its minute contributes to the seed.
    let active = null;

    function prepareVariant(schedule) {
        const id = VARIANTS[schedule.id] ? schedule.id : 'odd';
        const variant = VARIANTS[id];
        const figure = FIGURES[id] || FIGURES.odd;

        if (variant.layers) {
            variant.layers.forEach(function (layer) {
                layer.cos = Math.cos(layer.rot);
                layer.sin = Math.sin(layer.rot);
            });
        }

        active = {
            id: id,
            n: schedule.n,
            variant: variant,
            figure: figure,
            nudge: seedNudge(schedule.n),
            ramp: buildRamp(variant.stops)
        };

        footer.setAttribute('data-fractal-variant', active.id);
    }

    prepareVariant(variantAt(new Date()));

    let gpu = null;

    try {
        const gl = canvas.getContext('webgl', {
            alpha: true,
            antialias: false,
            depth: false,
            stencil: false,
            // The shader writes straight alpha, the same as the 2D ImageData
            // path did, so it must not be treated as premultiplied.
            premultipliedAlpha: false,
            // Deliberately not preserved. Keeping the drawing buffer alive is
            // a per-frame copy of the whole canvas — measured, it cost about
            // twenty of the forty milliseconds a frame has, which is most of a
            // frame's work for a picture that is already on screen. The
            // composited frame stays in the page's layer while the band is
            // scrolled away or motion is reduced, and anything that resumes the
            // field redraws it before it is seen.
            preserveDrawingBuffer: false,
            powerPreference: 'low-power'
        });

        if (gl) {
            const renderer = {
                gl: gl,
                buffer: null,
                program: null,
                texture: null,
                ramp: null,
                target: null,
                twidth: 0,
                theight: 0
            };

            // Rebuilt from scratch on context restore, when every program and
            // texture the old context held is gone. Also rebuilt when the
            // variant changes, since the shader is generated from the variant's
            // seeds and rim colour; the vertex buffer and the accumulation
            // framebuffer survive that swap.
            renderer.setup = function () {
                const program = buildProgram(gl, active.figure,
                    active.variant.layers, active.variant.edgeLow,
                    active.variant.rimHot);

                if (!program) {
                    return false;
                }

                gl.useProgram(program);

                if (!renderer.buffer) {
                    const buffer = gl.createBuffer();

                    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
                    // One triangle large enough to cover the viewport.
                    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
                        -1, -1, 3, -1, -1, 3
                    ]), gl.STATIC_DRAW);
                    renderer.buffer = buffer;
                } else {
                    gl.bindBuffer(gl.ARRAY_BUFFER, renderer.buffer);
                }

                const position = gl.getAttribLocation(program, 'aPos');

                gl.enableVertexAttribArray(position);
                gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

                const texture = gl.createTexture();

                gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

                // The colour ramp is the only texture the pass still reads,
                // and it is this variant's ramp.
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, texture);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 256, 1, 0,
                    gl.RGB, gl.UNSIGNED_BYTE,
                    new Uint8Array(active.ramp.buffer, active.ramp.byteOffset,
                        active.ramp.length));
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

                renderer.texture = texture;
                renderer.ramp = texture;
                renderer.program = program;
                renderer.seed = gl.getUniformLocation(program, 'uSeed');
                renderer.size = gl.getUniformLocation(program, 'uSize');
                renderer.spanY = gl.getUniformLocation(program, 'uSpanY');
                renderer.view = gl.getUniformLocation(program, 'uView');
                renderer.mode = gl.getUniformLocation(program, 'uMode');
                renderer.weight = gl.getUniformLocation(program, 'uWeight');
                renderer.morph = gl.getUniformLocation(program, 'uMorph');

                gl.uniform1i(gl.getUniformLocation(program, 'uRamp'), 0);
                gl.uniform1i(gl.getUniformLocation(program, 'uField'), 1);

                return true;
            };

            // Swap the generated shader and the ramp for the active variant's,
            // keeping the vertex buffer and the accumulation framebuffer. The
            // caller re-applies the size uniforms afterwards (resize does).
            renderer.rebuild = function () {
                if (renderer.program) {
                    gl.deleteProgram(renderer.program);
                    renderer.program = null;
                }

                if (renderer.ramp) {
                    gl.activeTexture(gl.TEXTURE0);
                    gl.bindTexture(gl.TEXTURE_2D, null);
                    gl.deleteTexture(renderer.ramp);
                    renderer.ramp = null;
                    renderer.texture = null;
                }

                return renderer.setup();
            };

            // The accumulation buffer, rebuilt when the canvas changes size.
            // RGBA8 is the format WebGL promises is renderable; R and G are the
            // field's two channels.
            renderer.setupTarget = function (w, h) {
                if (renderer.target && renderer.twidth === w && renderer.theight === h) {
                    return true;
                }

                if (renderer.target) {
                    gl.deleteFramebuffer(renderer.target.fb);
                    gl.deleteTexture(renderer.target.tex);
                    renderer.target = null;
                }

                const tex = gl.createTexture();

                gl.bindTexture(gl.TEXTURE_2D, tex);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0,
                    gl.RGBA, gl.UNSIGNED_BYTE, null);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

                const fb = gl.createFramebuffer();

                gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
                gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
                    gl.TEXTURE_2D, tex, 0);

                const complete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) ===
                    gl.FRAMEBUFFER_COMPLETE;

                gl.clearColor(0, 0, 0, 0);
                gl.clear(gl.COLOR_BUFFER_BIT);
                gl.bindFramebuffer(gl.FRAMEBUFFER, null);

                if (!complete) {
                    gl.deleteFramebuffer(fb);
                    gl.deleteTexture(tex);

                    return false;
                }

                renderer.target = { tex: tex, fb: fb };
                renderer.twidth = w;
                renderer.theight = h;
                // A texture attached to the framebuffer may not also be bound
                // for sampling: put the ramp back on unit 0, which is what the
                // next field pass expects to find there.
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, renderer.ramp);

                return true;
            };

            // One field sample, added over the buffer rather than replacing it.
            // Unit 1 holds the ramp while the field is drawn, never the buffer:
            // a texture bound to a sampler may not also be the draw target.
            renderer.field = function (seed, view, weight, morph) {
                gl.bindFramebuffer(gl.FRAMEBUFFER, renderer.target.fb);
                gl.enable(gl.BLEND);
                gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
                // Both sampler units hold the ramp here, never the buffer being
                // drawn into: a texture bound for sampling may not be a draw
                // target, and the driver drops the draw when it is.
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, renderer.ramp);
                gl.activeTexture(gl.TEXTURE1);
                gl.bindTexture(gl.TEXTURE_2D, renderer.ramp);
                gl.activeTexture(gl.TEXTURE0);
                gl.uniform1i(renderer.mode, 0);
                gl.uniform1f(renderer.weight, weight);
                gl.uniform2f(renderer.seed, seed.re, seed.im);
                gl.uniform3f(renderer.view, view.cos, view.sin, view.scale);
                gl.uniform1f(renderer.morph, morph);
                gl.drawArrays(gl.TRIANGLES, 0, 3);
                gl.disable(gl.BLEND);
                gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            };

            // The buffer, shaded onto the canvas: colour, the footer's fades,
            // and the field's own alpha.
            renderer.present = function () {
                gl.bindFramebuffer(gl.FRAMEBUFFER, null);
                gl.activeTexture(gl.TEXTURE1);
                gl.bindTexture(gl.TEXTURE_2D, renderer.target.tex);
                gl.activeTexture(gl.TEXTURE0);
                gl.uniform1i(renderer.mode, 1);
                gl.drawArrays(gl.TRIANGLES, 0, 3);
            };

            // No renderable texture: compute and shade in one pass, and accept
            // the flicker that the buffer would have smoothed away.
            renderer.direct = function (seed, view, morph) {
                gl.bindFramebuffer(gl.FRAMEBUFFER, null);
                gl.uniform1i(renderer.mode, 2);
                gl.uniform2f(renderer.seed, seed.re, seed.im);
                gl.uniform3f(renderer.view, view.cos, view.sin, view.scale);
                gl.uniform1f(renderer.morph, morph);
                gl.drawArrays(gl.TRIANGLES, 0, 3);
            };

            if (renderer.setup()) {
                gpu = renderer;
            }
        }
    } catch (error) {
        gpu = null;

        // A figure that cannot be built must not leave the band empty in
        // silence, any more than a shader that will not compile: the reason
        // belongs in the console.
        if (window.console && window.console.warn) {
            window.console.warn('footer fractal: field could not start', error);
        }
    }

    // No shader: paint one complete frame with script and leave it. A partial
    // frame would be the lanes again, and those bands are exactly what this
    // avoids.
    const context = gpu ? null : canvas.getContext('2d', { willReadFrequently: true });

    if (!gpu && !context) {
        return;
    }

    let pixels = null;
    let width = 0;
    let height = 0;
    let frame = 0;
    let visible = false;
    let painted = false;
    let lastDraw = -Infinity;

    // Where the virtual pointer is at this moment, biased by this minute's
    // offset so the same variant returns in a slightly different position.
    function driftAt(now) {
        return {
            re: DRIFT_ORIGIN.re + active.nudge.re +
                DRIFT.re * DRIFT_MOVE * Math.sin(now / PERIOD.x * TAU),
            im: DRIFT_ORIGIN.im + active.nudge.im +
                DRIFT.im * DRIFT_MOVE * Math.cos(now / PERIOD.y * TAU)
        };
    }

    // Where the view is at this moment: how far the plane is turned and how
    // much it is breathed in or out.
    // The shape's own phase, separate from the drift: 0..1 and back over
    // MORPH_PERIOD, so the geometry deforms in place.
    const MORPH_PERIOD = 72000;

    function morphAt(now) {
        return 0.5 + 0.5 * Math.sin(now / MORPH_PERIOD * TAU);
    }

    function viewAt(now) {
        const angle = VIEW_ORIGIN.angle +
            VIEW_TURN.angle * Math.sin(now / VIEW_TURN.period * TAU);

        return {
            cos: Math.cos(angle),
            sin: Math.sin(angle),
            scale: VIEW_ORIGIN.scale * (1 + VIEW_BREATHE.scale *
                Math.cos(now / VIEW_BREATHE.period * TAU))
        };
    }

    function markReady() {
        if (painted) {
            return;
        }

        painted = true;
        footer.classList.add('is-fractal-ready');
    }

    // How much of the footer is worth computing. The field's cost is linear in
    // pixels, so when the frame rate cannot be held it is the bitmap that gives
    // way, never the depth and never the cadence.
    let budget = MAX_PIXELS;
    let adjusted = 0;

    // Set false after a resize, when the buffer holds nothing to ease from.
    let primed = false;

    function draw(now) {
        if (!gpu.target) {
            gpu.direct(driftAt(now), viewAt(now), morphAt(now));
            markReady();

            return;
        }

        gpu.field(driftAt(now), viewAt(now), primed ? FIELD_WEIGHT : 1, morphAt(now));
        gpu.present();
        primed = true;
        markReady();
    }

    // Moves the pixel budget in steps from the realised frame gap, with a
    // cooldown so a single slow or fast frame cannot set the quality. A descent
    // takes three slow frames in a row, because one long frame is usually the
    // browser or the operating system rather than the field; an ascent waits
    // for a stretch of settled frames.
    let slow = 0;

    function watchCadence(gap) {
        // A tab that was away, a scroll, a garbage collection: not a verdict on
        // the GPU.
        if (gap > FRAME_INTERVAL * 3) {
            slow = 0;
            return;
        }

        if (adjusted && performance.now() - adjusted < 5000) {
            return;
        }

        slow = gap > FRAME_INTERVAL * 1.35 ? slow + 1 : 0;

        if (slow >= 3 && budget > MIN_PIXELS) {
            slow = 0;
            budget = Math.max(MIN_PIXELS, Math.round(budget * 0.72));
            adjusted = performance.now();
            resize();
            return;
        }

        if (gap < FRAME_INTERVAL * 1.12 && budget < MAX_PIXELS) {
            budget = Math.min(MAX_PIXELS, Math.round(budget * 1.15));
            adjusted = performance.now();
            resize();
        }
    }

    function tick(now) {
        frame = window.requestAnimationFrame(tick);

        const gap = now - lastDraw;

        if (gap < FRAME_INTERVAL) {
            return;
        }

        lastDraw = now;
        draw(now);
        watchCadence(gap);
    }

    function start() {
        if (!gpu || frame || reducedMotion.matches) {
            return;
        }

        frame = window.requestAnimationFrame(tick);
    }

    function stop() {
        if (frame) {
            window.cancelAnimationFrame(frame);
            frame = 0;
        }
    }

    // ------------------------------------------------------------------
    // Fallback: one frame in script, in slices so it never blocks the thread
    // ------------------------------------------------------------------

    let fallbackRows = 0;
    let fallbackDrift = null;
    let fallbackMorph = 0.5;
    let fallbackView = null;
    // Plane units per screen pixel for the still frame: the lattice draws its
    // rims at a fixed width in pixels, so it needs the bitmap scale.
    let fallbackPixel = 0;
    // The trap term of the sample just taken, returned beside the fog without
    // allocating a pair per pixel.
    let edgeOf = 0;

        function sample(sx, sy, layer, drift, gain, mre, mim, zscale, rotCos, rotSin) {
        // The frame does not move: the seed path and the layers' turning are the
        // whole animation here.
        const cx = layer.cx + mre;
        const cy = layer.cy + mim;
        const k = layer.zoom * (zscale || 1);
        const co = rotCos === undefined ? layer.cos : rotCos;
        const si = rotSin === undefined ? layer.sin : rotSin;
        const x0 = (sx * co - sy * si) * k + layer.ox;
        const y0 = (sx * si + sy * co) * k + layer.oy;

        let zr = x0;
        let zi = y0;
        let zr2 = zr * zr;
        let zi2 = zi * zi;
        let iter = 0;
        let trapR = Infinity;
        let trapRe = Infinity;
        let trapIm = Infinity;

        while (iter < ITERATIONS && zr2 + zi2 < BAILOUT) {
            zi = 2 * zr * zi + cy;
            zr = zr2 - zi2 + cx;
            zr2 = zr * zr;
            zi2 = zi * zi;
            iter += 1;

            if (iter > 5) {
                const mag = zr2 + zi2;
                const ar = zr < 0 ? -zr : zr;
                const ai = zi < 0 ? -zi : zi;

                if (mag < trapR) {
                    trapR = mag;
                }

                if (ar < trapRe) {
                    trapRe = ar;
                }

                if (ai < trapIm) {
                    trapIm = ai;
                }
            }
        }

        const ring = 1 / (1 + trapR * 9);
        const line = Math.max(1 / (1 + trapRe * 30), 1 / (1 + trapIm * 30));
        const ring2 = ring * ring;
        const line2 = line * line;
        const ring6 = ring2 * ring2 * ring2;
        const line6 = line2 * line2 * line2;

        if (iter >= ITERATIONS) {
            edgeOf = 0;

            return 0.30;
        }

        const magnitude = Math.log(zr2 + zi2) * 0.5;
        const nu = Math.log(magnitude / Math.LN2) / Math.LN2;
        const smooth = Math.max(0, iter + 1 - nu);
        const t = Math.min(1, smooth / ITERATIONS);

        edgeOf = smoothstep(0.55, 0.86, t);

        // One layer's own shade. The interference's exposure is applied once
        // to the screen-blended result, in shadeSample, not per layer.
        return Math.min(0.98, 0.02 + 0.74 * Math.log(1 + smooth) / 6.043 +
            0.4 * ring6 + 0.18 * line6);
    }

    // The fallback twin of every shader figure: the same arithmetic, family by
    // family, returning the fog and leaving the rim in edgeOf.
    function shadeSample(sx, sy) {
        const figure = active.figure;
        const drift = fallbackDrift || { re: 0, im: 0 };
        const morphM = fallbackMorph * 2 - 1;

        if (figure.kind === 'julia') {
            const layers = active.variant.layers;
            let fog = 0;
            let edge = 0;
            const light = figure.lift ? lightValue(figure.lift, morphM) : 1;

            for (let l = 0; l < layers.length; l += 1) {
                const weight = l === 0 ? 1 : 0.7;
                const r = l === 0 ? 0.0030 : 0.0024;
                const s = l === 0 ? 1 : -1;
                const th = Math.atan2(layers[l].sin, layers[l].cos) +
                    morphM * (l === 0 ? -0.26 : 0.34);
                const part = sample(sx, sy, layers[l], drift, l === 0 ? 5 : 4,
                    morphM * r * s,
                    r * s * Math.sqrt(Math.max(0, 1 - morphM * morphM)),
                    1, Math.cos(th), Math.sin(th)) * weight;
                const thread = edgeOf * weight;

                fog = fog + part - fog * part;
                edge = edge + thread - edge * thread;
            }

            edgeOf = edge;

            return Math.min(0.98, fog * light);
        }

        const stretch = figure.stretch ? morphM * figure.stretch : 0;
        const qx = sx * figure.scale * (1 + stretch) + figure.cx;
        const qy = sy * figure.scale * (1 - stretch) + figure.cy;

        if (figure.kind === 'newton') {
            const th = morphM * 0.18;
            const ct = Math.cos(th);
            const st = Math.sin(th);
            const A = 1;
            const relax = 1 + morphM * 0.18;
            let zr = (qx * ct - qy * st) * (1 + morphM * 0.32);
            let zi = (qx * st + qy * ct) * (1 - morphM * 0.32);
            let iter = 0;
            let best = Infinity;

            for (let i = 0; i < 60; i += 1) {
                const zr2 = zr * zr;
                const zi2 = zi * zi;
                const wr = zr * (zr2 - 3 * zi2) - A;
                const wi = zi * (3 * zr2 - zi2);

                best = Math.min(best, Math.sqrt(wr * wr + wi * wi));

                const dr = 3 * (zr2 - zi2);
                const di = 6 * zr * zi;
                const den = Math.max(dr * dr + di * di, 1e-6);

                zr -= relax * (wr * dr + wi * di) / den;
                zi -= relax * (wi * dr - wr * di) / den;
                iter += 1;

                if (best < 0.0002) {
                    break;
                }
            }

            const t = Math.min(1, iter / 22);

            edgeOf = smoothstep(0.5, 1, t);

            return Math.min(0.96, 0.03 + 0.6 * Math.pow(t, 0.75) +
                0.18 / (1 + best * 22));
        }

        if (figure.kind === 'newton10') {
            // The shader's tenth-power Newton basins, basin for basin.
            const th = morphM * 0.20;
            const Ar = Math.cos(th);
            const Ai = Math.sin(th);
            const split = morphM * 0.45;
            const relax = 1 + morphM * 0.16;
            let zr = qx;
            let zi = qy;
            let iter = 0;
            let best = Infinity;

            for (let i = 0; i < 64; i += 1) {
                const ar = zr * zr - zi * zi;
                const ai = 2 * zr * zi;
                const br = ar * ar - ai * ai;
                const bi = 2 * ar * ai;
                const cr = br * br - bi * bi;
                const ci = 2 * br * bi;
                const z9r = cr * zr - ci * zi;
                const z9i = cr * zi + ci * zr;
                const wr = cr * ar - ci * ai + split * z9r - Ar;
                const wi = cr * ai + ci * ar + split * z9i - Ai;
                const dr = 10 * z9r + 9 * split * cr;
                const di = 10 * z9i + 9 * split * ci;

                best = Math.min(best, Math.sqrt(wr * wr + wi * wi));

                const den = Math.max(dr * dr + di * di, 1e-8);

                zr -= relax * (wr * dr + wi * di) / den;
                zi -= relax * (wi * dr - wr * di) / den;
                iter += 1;

                if (best < 0.0002) {
                    break;
                }
            }

            const t = Math.min(1, iter / 64);

            edgeOf = smoothstep(0.45, 0.95, t);

            return Math.min(0.96, 0.02 + 0.40 * Math.pow(t, 1.2) +
                0.06 / (1 + best * 30));
        }

        if (figure.kind === 'nodal') {
            const n = figure.n + morphM * figure.dn;
            const m = figure.m + morphM * figure.dm;
            const a = Math.cos(n * Math.PI * qx) * Math.cos(m * Math.PI * qy);
            const b = Math.cos(m * Math.PI * qx) * Math.cos(n * Math.PI * qy);
            const v = Math.abs(a - b);
            const node = 1 / (1 + v * 70);
            const wash = 1 / (1 + v * 5);
            const disc = (1 - smoothstep(0.93, 1, Math.abs(qx))) *
                (1 - smoothstep(0.93, 1, Math.abs(qy)));

            edgeOf = Math.max(node * 0.75, wash * 0.18) * disc;

            return (0.06 + 0.30 * wash + 0.30 * node) * disc;
        }

        if (figure.kind === 'cellular') {
            const cellX = Math.floor(qx);
            const cellY = Math.floor(qy);
            const turn = morphM * figure.turn;
            const ca = Math.cos(turn);
            const sa = Math.sin(turn);
            const reach = figure.reach + morphM * figure.swing;
            let best = Infinity;
            let second = Infinity;

            for (let y = -1; y <= 1; y += 1) {
                for (let x = -1; x <= 1; x += 1) {
                    const gx = cellX + x;
                    const gy = cellY + y;
                    const hx = fract(Math.sin(gx * 127.1 + gy * 311.7) * 43758.5453) - 0.5;
                    const hy = fract(Math.sin(gx * 269.5 + gy * 183.3) * 43758.5453) - 0.5;
                    const px = gx + 0.5 + (hx * ca - hy * sa) * reach;
                    const py = gy + 0.5 + (hx * sa + hy * ca) * reach;
                    const dd = Math.sqrt((qx - px) * (qx - px) +
                        (qy - py) * (qy - py));

                    if (dd < best) {
                        second = best;
                        best = dd;
                    } else {
                        second = Math.min(second, dd);
                    }
                }
            }

            const glow = 1 - smoothstep(0.05, 0.72, best);
            const wall = 1 - smoothstep(0, 0.09, second - best);

            edgeOf = Math.max(wall * 0.85, glow * 0.22);

            return 0.04 + 0.40 * glow * glow + 0.10 * glow;
        }

        if (figure.kind === 'apollonian') {
            const count = 3 + morphM * 0.60;
            const theta = Math.PI / count;
            const rb = 1 / Math.cos(theta);
            const side = Math.tan(theta);
            const rIn = rb - side;
            const rOut = rb + side;
            const side2 = side * side;
            let px = qx;
            let py = qy;
            let near = 1e9;
            let depth = 0;

            for (let k = 0; k < 80; k += 1) {
                let level = 1e9;
                let moved = false;
                let p2 = Math.max(px * px + py * py, 1e-12);
                let dev = p2 - rIn * rIn;

                if (dev > 0) {
                    level = Math.min(level, Math.abs(dev) / (2 * rIn));
                } else {
                    px *= (rIn * rIn) / p2;
                    py *= (rIn * rIn) / p2;
                    moved = true;
                }

                if (!moved) {
                    dev = rOut * rOut - p2;

                    if (dev > 0) {
                        level = Math.min(level, Math.abs(dev) / (2 * rOut));
                    } else {
                        px *= (rOut * rOut) / p2;
                        py *= (rOut * rOut) / p2;
                        moved = true;
                    }
                }

                if (!moved) {
                    for (let i = 0; i < 4 && i < count; i += 1) {
                        const a = 2 * i * theta;
                        const centreX = rb * Math.sin(a);
                        const centreY = rb * Math.cos(a);
                        const dx = px - centreX;
                        const dy = py - centreY;
                        const dd = Math.max(dx * dx + dy * dy, 1e-12);
                        const away = dd - side2;

                        if (away > 0) {
                            level = Math.min(level, Math.abs(away) / (2 * side));
                        } else {
                            px = centreX + dx * (side2 / dd);
                            py = centreY + dy * (side2 / dd);
                            moved = true;
                            break;
                        }
                    }
                }

                near = level;

                if (!moved) {
                    break;
                }

                depth += 1;
            }

            const reach = Math.min(1, depth / 48);
            const outline = 1 / (1 + near * 220);

            edgeOf = Math.max(outline, smoothstep(0.62, 0.98, reach) * 0.55);

            return Math.min(0.96, 0.08 + 0.44 * reach + 0.32 * outline);
        }

        if (figure.kind === 'lattice') {
            const hole = 0.52 - morphM * 0.18;
            const grid = 3 + morphM * 0.16;
            const reach = hole * 0.5;
            const shape = 6 - morphM * 4;
            let ux = qx;
            let uy = qy;
            let cells = 1;

            for (let i = 0; i < 9; i += 1) {
                const cellX = Math.floor(ux);
                const cellY = Math.floor(uy);
                const localX = ux - cellX;
                const localY = uy - cellY;
                const cellPixels = 1 / (fallbackPixel * figure.scale * cells);

                if (cellPixels < 4) {
                    edgeOf = 0;

                    return 0.10;
                }

                const width = Math.min(0.34, Math.max(0.014, 1.3 / cellPixels));

                if (cellX === 1 && cellY === 1) {
                    const dx = Math.abs(localX - 0.5);
                    const dy = Math.abs(localY - 0.5);
                    const band = Math.pow(
                        Math.pow(dx, shape) + Math.pow(dy, shape), 1 / shape);

                    if (band < reach) {
                        const rim = reach - band;

                        edgeOf = 1 - smoothstep(width * 0.4, width * 1.7, rim);

                        return 0.05 + 0.12 * (i / 9) +
                            0.10 * (1 - smoothstep(0, 0.4, rim));
                    }

                    edgeOf = 0.7;

                    return 0.26;
                }

                ux = localX * grid;
                uy = localY * grid;
                cells *= grid;
            }

            edgeOf = 0.30;

            return 0.12;
        }

        // The escape-time families: one loop, the family's own step.
        const cx = qx;
        const cy = qy;
        let zr = 0;
        let zi = 0;
        let zr2 = zr * zr;
        let zi2 = zi * zi;
        let iter = 0;
        let trapR = Infinity;
        let trapRe = Infinity;
        let trapIm = Infinity;

        // Only the Burning Ship reaches this loop: every other family returns
        // from its own branch above.
        while (iter < ITERATIONS && zr2 + zi2 < BAILOUT) {
            const ar = Math.abs(zr);
            const ai = Math.abs(zi);
            const kb = morphM * figure.bend * figure.scale;
            const nr = ar * ar - ai * ai + cx + kb * 0.45 * ar * ai;

            zi = 2 * ar * ai + cy + kb * ar;
            zr = nr;

            zr2 = zr * zr;
            zi2 = zi * zi;
            iter += 1;

            if (iter > 5) {
                const mag = zr2 + zi2;
                const ar = zr < 0 ? -zr : zr;
                const ai = zi < 0 ? -zi : zi;

                if (mag < trapR) {
                    trapR = mag;
                }

                if (ar < trapRe) {
                    trapRe = ar;
                }

                if (ai < trapIm) {
                    trapIm = ai;
                }
            }
        }

        const ring = 1 / (1 + trapR * 9);
        const line = Math.max(1 / (1 + trapRe * 30), 1 / (1 + trapIm * 30));
        const ring2 = ring * ring;
        const line2 = line * line;
        const ring6 = ring2 * ring2 * ring2;
        const line6 = line2 * line2 * line2;

        if (iter >= ITERATIONS) {
            edgeOf = 0;

            return figure.inner || 0.30;
        }

        const magnitude = Math.log(zr2 + zi2) * 0.5;
        const nu = Math.log(magnitude / Math.LN2) / Math.LN2;
        const smooth = Math.max(0, iter + 1 - nu);
        const t = Math.min(1, smooth / (figure.tail || ITERATIONS));

        edgeOf = smoothstep(0.55, 0.86, t);

        const band = Math.log(1 + smooth) / 6.043;
        const gain = figure.tail ? 1.45 : 0.74;
        const light = figure.lift ? lightValue(figure.lift, morphM) : 1;

        return Math.min(0.98, light * ((figure.floor || 0.02) + gain * band +
            0.4 * ring6 + 0.18 * line6));
    }

    function paintRow(row) {
        const data = pixels.data;
        const offsetY = row * width;
        const invW = 1 / width;
        const invH = 1 / height;
        const spanY = SPAN_X * (height / width);
        const v = row * invH;
        const vFade = Math.min(1, Math.max(0, (v - 0.06) / 0.42));
        const vFadeLate = Math.min(1, (1 - v) / 0.12);
        // The same view transform the shader applies, so the still fallback
        // frames the same part of the plane as the animated version would.
        const cosView = fallbackView.cos;
        const sinView = fallbackView.sin;
        const viewScale = fallbackView.scale;
        const ramp = active.ramp;
        const edgeLow = active.variant.edgeLow;
        const rimHot = active.variant.rimHot;

        for (let x = 0; x < width; x += 1) {
            const u = x * invW;
            const px = (u - 0.5) * SPAN_X;
            const py = (v - 0.5) * spanY;
            const sx = (px * cosView - py * sinView) * viewScale;
            const sy = (px * sinView + py * cosView) * viewScale;
            const fog = shadeSample(sx, sy);
            const edge = edgeOf;

            const hFade = Math.min(1, u / 0.14, (1 - u) / 0.14);
            const index = Math.round(Math.min(1, fog) * 255) * 3;
            const offset = (offsetY + x) * 4;
            const rim = edge;
            const mask = Math.max(
                Math.pow(Math.min(1, fog * 0.62 + rim * 1.25), 0.92), rim * 0.92);
            const blend = Math.min(1, rim * 8.0);

            // The same two-step colour the shader applies: the rim's mid tone
            // first, then the pale core at the crest of the rim.
            const hot = smoothstep(0.55, 1.0, rim);

            for (let c = 0; c < 3; c += 1) {
                const mid = ramp[index + c] +
                    (edgeLow[c] - ramp[index + c]) * blend;

                data[offset + c] = mid + (rimHot[c] - mid) * hot;
            }

            data[offset + 3] = mask * 255 * vFade * vFadeLate * hFade;
        }
    }

    // A full pass is over a second of script time, so it is sliced rather than
    // run in one go. It paints every row of one and the same frame.
    function paintStill() {
        if (!pixels || !context) {
            return;
        }

        stop();
        fallbackDrift = driftAt(performance.now());
        fallbackMorph = morphAt(performance.now());
        fallbackView = viewAt(performance.now());
        fallbackPixel = (SPAN_X * (height / width)) / height /
            fallbackView.scale;
        fallbackRows = 0;

        (function chunk() {
            const started = performance.now();

            while (fallbackRows < height && performance.now() - started < 24) {
                paintRow(fallbackRows);
                fallbackRows += 1;
            }

            if (fallbackRows < height) {
                window.requestAnimationFrame(chunk);
                return;
            }

            context.putImageData(pixels, 0, 0);
            markReady();
        })();
    }

    // ------------------------------------------------------------------
    // Schedule: a new variant at the minute the rules change class
    // ------------------------------------------------------------------

    // Promise the new variant into place. The shader is generated from the
    // variant's seeds and rim, so it is recompiled here — once per change, not
    // per frame — and the size uniforms and accumulation buffer are re-applied
    // by resize. If the new program will not build, the previous variant is
    // put back rather than leaving a dead canvas.
    function applyVariant(schedule) {
        const previous = active;

        prepareVariant(schedule);

        if (gpu) {
            if (gpu.rebuild()) {
                resize();
                return;
            }

            prepareVariant({ id: previous.id, n: previous.n });

            // The restored program is a new one, so its size, view and morph
            // uniforms must be applied again: without this the canvas would
            // draw with a zero-sized, zero-scaled plane and go blank.
            if (gpu.rebuild()) {
                resize();
            }

            return;
        }

        if (painted) {
            paintStill();
        }
    }

    let swapTimer = 0;

    // A class fades the canvas out (and later back in) so the swap is a
    // dissolve rather than a frame of one figure replaced by another. Reduced
    // motion skips the dissolve; the swap itself still happens.
    function swapTo(schedule) {
        window.clearTimeout(swapTimer);

        if (reducedMotion.matches) {
            applyVariant(schedule);
            return;
        }

        footer.classList.add('is-fractal-swapping');
        swapTimer = window.setTimeout(function () {
            applyVariant(schedule);
            // Reveal once the new field has been drawn, so the fade opens onto
            // the new figure instead of the old one. On a timer, not a frame:
            // a background tab suspends animation frames, and the canvas must
            // not be left dim while the page is hidden.
            footer.classList.remove('is-fractal-swapping');
        }, SWAP_FADE);
    }

    function checkSchedule() {
        const schedule = variantAt(new Date());

        if (!active || schedule.id !== active.id) {
            swapTo(schedule);
        }
    }

    // Twenty seconds: the variant only changes on a minute boundary, and this
    // is frequent enough to catch it promptly without a timer per minute.
    window.setInterval(checkSchedule, 20000);

    // ------------------------------------------------------------------
    // Layout
    // ------------------------------------------------------------------

    function resize() {
        const rect = footer.getBoundingClientRect();
        const cssWidth = Math.max(1, Math.round(rect.width));
        const cssHeight = Math.max(1, Math.round(rect.height));

        stop();

        let bitmapWidth;
        let bitmapHeight;

        if (gpu) {
            const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);

            bitmapWidth = Math.max(1, Math.round(cssWidth * dpr));
            bitmapHeight = Math.max(1, Math.round(cssHeight * dpr));
        } else {
            bitmapWidth = cssWidth;
            bitmapHeight = cssHeight;
        }

        const cap = Math.sqrt(budget / (bitmapWidth * bitmapHeight));

        if (cap < 1) {
            bitmapWidth = Math.max(1, Math.round(bitmapWidth * cap));
            bitmapHeight = Math.max(1, Math.round(bitmapHeight * cap));
        }

        width = bitmapWidth;
        height = bitmapHeight;
        canvas.width = bitmapWidth;
        canvas.height = bitmapHeight;

        if (gpu) {
            gpu.gl.viewport(0, 0, bitmapWidth, bitmapHeight);
            gpu.gl.uniform2f(gpu.size, bitmapWidth, bitmapHeight);
            gpu.gl.uniform1f(gpu.spanY, SPAN_X * (bitmapHeight / bitmapWidth));
            primed = false;
            gpu.setupTarget(bitmapWidth, bitmapHeight);
            lastDraw = -Infinity;
            draw(performance.now());

            if (visible) {
                start();
            }

            return;
        }

        pixels = context.createImageData(width, height);

        if (visible) {
            paintStill();
        }
    }

    let resizeFrame = 0;

    function onResize() {
        window.cancelAnimationFrame(resizeFrame);
        resizeFrame = window.requestAnimationFrame(resize);
    }

    const observer = new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;

        if (!visible) {
            stop();
            return;
        }

        checkSchedule();

        if (gpu) {
            start();
        } else if (!painted) {
            paintStill();
        }
    }, { threshold: 0 });

    observer.observe(footer);

    // Most browsers already suspend animation frames behind a hidden tab; a
    // field computed behind one is pure heat, so it is stopped here too.
    document.addEventListener('visibilitychange', function () {
        if (document.hidden) {
            stop();
            return;
        }

        // A swap that began while the tab was hidden must not leave the field
        // dim once it is back.
        footer.classList.remove('is-fractal-swapping');
        window.clearTimeout(swapTimer);
        checkSchedule();

        if (visible && gpu) {
            start();
        }
    }, false);

    window.addEventListener('resize', onResize, { passive: true });

    // The footer's height depends on type and is not final when this script
    // runs, so the frame is measured again whenever the band changes size.
    if (typeof ResizeObserver === 'function') {
        new ResizeObserver(onResize).observe(footer);
    }

    reducedMotion.addEventListener('change', function () {
        if (reducedMotion.matches) {
            stop();

            if (gpu) {
                draw(performance.now());
            } else {
                paintStill();
            }

            return;
        }

        start();
    });

    canvas.addEventListener('webglcontextlost', function (event) {
        event.preventDefault();
        stop();
    }, false);

    canvas.addEventListener('webglcontextrestored', function () {
        if (!gpu) {
            return;
        }

        // Every program, texture and framebuffer the old context held is gone.
        gpu.program = null;
        gpu.texture = null;
        gpu.ramp = null;
        gpu.target = null;
        gpu.twidth = 0;
        gpu.theight = 0;

        // Rebuild whichever variant is current now, not the load-time one:
        // a context can be lost and restored long after the minute changed.
        checkSchedule();

        if (gpu.setup()) {
            resize();
            start();
        }
    }, false);

    resize();
})();
