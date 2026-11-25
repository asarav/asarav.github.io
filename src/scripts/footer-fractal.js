(function () {
    'use strict';

    // -----------------------------------------------------------------------
    // Footer fractal
    // -----------------------------------------------------------------------
    // A quiet field behind the footer. It is not the 404's single figure at a
    // smaller size: two copies of a filamentary Julia boundary are laid over
    // each other at different angles and scales, and every sample also carries
    // three orbit traps (a circle around the origin and the two axes) plus a
    // topographic banding of the escape count. The traps draw the ribs,
    // spirals and lace that a plain escape-time gradient flattens away, so the
    // band stays intricate at the low opacity the footer needs.
    //
    // The field is drawn as two things, not one wash: a quiet slate fog and the
    // shell of points that escape only just before the set's boundary. That
    // shell is the outline — every bulb and filament arrives with an edge — and
    // it is coloured Matrix green, so the figure and the empty space around it
    // are told apart by hue and by opacity at once rather than by brightness
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
    // across a grid of seeds to stay inside the lace everywhere.
    const DRIFT = { re: 0.0018, im: 0.0012 };
    const DRIFT_ORIGIN = { re: 0, im: -0.0035 };
    // Minutes, not hours. The seed's travel is what changes the shape, and its
    // speed is what turns that travel into visible morphing: a shape-level
    // rearranging needs the seed to move about a thousandth, so a few minutes
    // per cycle is the first setting at which the figure reads as becoming
    // another figure rather than as texture. The full 420 steps hold at this
    // speed — measured, the deep field costs about one and a half steps of
    // restlessness per frame over a shallower one, a fair price for the
    // filigree.
    const PERIOD = { x: 240000, y: 300000 };

    // One field per displayed frame. Forty milliseconds is the rate the design
    // was judged at, and the field is highly resolved in time: at this drift
    // rate two neighbouring frames are already different samples, so there is
    // nothing a faster cadence would resolve.
    const FRAME_INTERVAL = 40;

    // The seed alone cannot show movement: a step tiny enough to stay subtle
    // only reshuffles the lace, it does not move it. So the view moves as well —
    // the plane is rotated and scaled on slow, unrelated periods, which makes
    // the lace travel and breathe through the frame while the field itself still
    // resolves in place. A rigid change of view adds no restlessness, which is
    // why this can be legible while the boil stays slow.
    // Swung wide enough to be read at a glance — about four degrees and three
    // per cent every ten seconds — on periods that do not divide into each
    // other, so the two motions drift in and out of step instead of tracing a
    // loop the eye can learn. Both are sines, so the movement eases at the
    // extremes and never starts or stops abruptly.
    const VIEW_TURN = { angle: 0.16, period: 150000 };
    const VIEW_BREATHE = { scale: 0.10, period: 210000 };
    const VIEW_ORIGIN = { angle: -0.12, scale: 1 };
    // Two different Julia seeds, neither of them the 404's (-0.8 + 0.156i).
    // The footer is an interference of both figures rather than one figure
    // shown at a smaller size.
    const LAYERS = [
        {
            cx: -0.74543, cy: 0.11301,
            rot: -0.16, zoom: 0.22, ox: 0, oy: 0.03
        },
        {
            cx: -0.39054, cy: -0.58679,
            rot: 0.75, zoom: 0.6, ox: 0.1, oy: -0.07
        }
    ];

    LAYERS.forEach(function (layer) {
        layer.cos = Math.cos(layer.rot);
        layer.sin = Math.sin(layer.rot);
    });

    // Two colour families, never blended into one grey. The escape bands are
    // the fog: a cold, dark blue that sits close to the footer's own gradient.
    // The traps are the figure: Matrix green where the orbit grazes them,
    // lifting to pale mint at the graze itself, so a filament arrives with a
    // lit edge instead of dissolving into the haze beside it.
    // The fog is deliberately the quietest colour on the page: a dark navy that
    // is almost the footer's own background, so the field's bulk never competes
    // with the type sitting on it.
    const STOPS = [
        [0, 11, 15, 21],
        [0.35, 23, 31, 41],
        [0.7, 41, 54, 68],
        [1, 70, 92, 112]
    ];

    // The outline is the opposite: warm, and the only warm thing behind the
    // footer's cool white type. That is what keeps the two apart — the text is
    // cool and very light, the filaments are copper and mid-toned, so they
    // separate by hue and by value at once. Copper rather than the neon green
    // it started as, and rather than the ice blue it became: the ice sat in the
    // same family as the text and muddied it, and the green belonged to no part
    // of the page. This warm is the signal red of the footer's own hairlines,
    // taken down and towards brass.
    const EDGE_LOW = [208, 160, 124];

    // How much of each new field sample the accumulation takes. Lower is
    // smoother and slower; at a frame every 40 ms this settles in about a tenth
    // of a second, which is long enough to melt single-pixel flicker and short
    // enough that the shape still morphs visibly.
    const FIELD_WEIGHT = 0.34;

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
            const k = Math.min(1, Math.max(0, (t - low[0]) / span));

            ramp[i * 3] = low[1] + (high[1] - low[1]) * k;
            ramp[i * 3 + 1] = low[2] + (high[2] - low[2]) * k;
            ramp[i * 3 + 2] = low[3] + (high[3] - low[3]) * k;
        }
    })();

    // A GLSL float literal: the shader is generated from the same constants
    // the 2D fallback uses, so the two paths cannot drift apart.
    function f(value) {
        return (value === Math.round(value) ? value.toFixed(1) : String(value));
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

    const VERTEX_SOURCE = [
        'attribute vec2 aPos;',
        'void main() {',
        '    gl_Position = vec4(aPos, 0.0, 1.0);',
        '}'
    ].join('\n');

    function fragmentSource() {
        // Each layer is one figure of the interference. Screen blending keeps
        // the lace of the thinner figure visible where the two boundaries
        // cross instead of letting the brighter one swallow it.
        const figures = LAYERS.map(function (layer, index) {
            return '    shade = screen(shade, figure(p, vec2(' +
                f(layer.cx) + ', ' + f(layer.cy) + ') + uSeed, ' + f(layer.zoom) +
                ', vec2(' + f(layer.cos) + ', ' + f(layer.sin) + '), vec2(' +
                f(layer.ox) + ', ' + f(layer.oy) + ')) * ' +
                f(index === 0 ? 1 : 0.7) + ');';
        }).join('\n');

        return [
            'precision highp float;',
            '',
            'uniform vec2 uSeed;',
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
            'const vec3 EDGE_LOW = ' + glsl3(EDGE_LOW) + ';',
            '',
            // Screen blending, per channel: the fog and the edges each keep
            // their own weight where two layers cross.
            'vec2 screen(vec2 base, vec2 top) {',
            '    return base + top - base * top;',
            '}',
            '',
            // One figure of the field. Returns the sample's fog in x and its
            // trap edges in y, kept apart so the two can be coloured and
            // weighted separately: an edge in its own colour is what makes the
            // figure legible against the field it sits in, where one blended
            // shade left everything the same pale haze.
            'vec2 figure(vec2 p, vec2 seed, float zoom, vec2 rot, vec2 off) {',
            '    vec2 q = vec2(p.x * rot.x - p.y * rot.y,',
            '                  p.x * rot.y + p.y * rot.x) * zoom + off;',
            '    float zr = q.x;',
            '    float zi = q.y;',
            '    float zr2 = zr * zr;',
            '    float zi2 = zi * zi;',
            '    float iter = 0.0;',
            '',
            // Closest approach to |z| = 0, Im z = 0 and Re z = 0. The first few
            // orbits all pass near the origin, so the tracking starts late.
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
            '',
            // Inverse-distance weights: 1 where the orbit grazed the trap,
            // falling away quickly from it. Raised to a high power they
            // collapse into thin curves, which is what draws the filigree
            // instead of a soft haze.
            '    float ring = 1.0 / (1.0 + trapR * 9.0);',
            '    float line = max(1.0 / (1.0 + trapRe * 30.0),',
            '                     1.0 / (1.0 + trapIm * 30.0));',
            '    float ring2 = ring * ring;',
            '    float line2 = line * line;',
            '    float ring6 = ring2 * ring2 * ring2;',
            '    float line6 = line2 * line2 * line2;',
            '',
            '    if (iter >= ITERATIONS) {',
            // Interior. The orbit is still bounded, so its last magnitude is
            // not a usable escape count, and the traps all approach zero here:
            // any fill turned a bulb into a flat block with a hard edge.
            // Nearly transparent, then, and the footer's own gradient shows
            // through a bulb; the lace is the field.
            '        return vec2(0.03, 0.0);',
            '    }',
            '',
            // Escape radius 32, so the squared magnitude is always at least
            // 1024 here and the smooth-count logarithm stays positive.
            '    float magnitude = log(zr2 + zi2) * 0.5;',
            '    float nu = log(magnitude / 0.6931471805599453) / 0.6931471805599453;',
            '    float smoothIter = max(0.0, iter + 1.0 - nu);',
            '    float t = min(1.0, smoothIter / ITERATIONS);',
            '',
            // The body keeps the field readable at a glance; the traps sharpen
            // it into lace. The curve is eased at the top so a pixel that only
            // just escapes does not sit far brighter than the bulb beside it.
            // x is the fog: the banded escape count plus the traps, as before.
            // y is the rim: the shell of points that escape only a few steps
            // before the set's own boundary, which traces an outline around
            // every bulb and along every filament.
            '    return vec2(min(0.98, 0.02 + 0.38 * pow(t, 1.1) +',
            '                     0.42 * ring6 + 0.2 * line6),',
            '                smoothstep(0.58, 0.99, t));',
            '}',
            '',
            // The whole field at this sample, before any colour or fade.
            'vec2 shadeAt(vec2 p) {',
            '    vec2 shade = vec2(0.0);',
            figures,
            '    return shade;',
            '}',
            '',
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
            // opacity in green, so the outline reads as a drawn line rather
            // than as a thin tint of the blue beside it.
            '    float mask = clamp(fog * 0.42 + rim * 1.05, 0.0, 1.0);',
            '    float alpha = max(pow(mask, 1.25), rim * 0.78) * vFade * vFadeLate * hFade;',
            '    float index = floor(clamp(fog, 0.0, 1.0) * 255.0 + 0.5);',
            '    vec3 color = texture2D(uRamp, vec2((index + 0.5) / 256.0, 0.5)).rgb;',
            '    color = mix(color, EDGE_LOW, clamp(rim * 6.0, 0.0, 1.0));',
            '    gl_FragColor = vec4(color, alpha);',
            '}'
        ].join('\n');
    }

    function buildShader(gl, type, source) {
        const shader = gl.createShader(type);

        gl.shaderSource(shader, source);
        gl.compileShader(shader);

        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            gl.deleteShader(shader);
            return null;
        }

        return shader;
    }

    function buildProgram(gl) {
        const vertex = buildShader(gl, gl.VERTEX_SHADER, VERTEX_SOURCE);
        const fragment = buildShader(gl, gl.FRAGMENT_SHADER, fragmentSource());

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
            gl.deleteProgram(program);
            return null;
        }

        return program;
    }

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
            const renderer = { gl: gl };

            // Rebuilt from scratch on context restore, when every program and
            // texture the old context held is gone.
            renderer.setup = function () {
                const program = buildProgram(gl);

                if (!program) {
                    return false;
                }

                gl.useProgram(program);

                const buffer = gl.createBuffer();

                gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
                // One triangle large enough to cover the viewport.
                gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
                    -1, -1, 3, -1, -1, 3
                ]), gl.STATIC_DRAW);

                const position = gl.getAttribLocation(program, 'aPos');

                gl.enableVertexAttribArray(position);
                gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

                const texture = gl.createTexture();

                gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

                // The colour ramp is the only texture the pass still reads.
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, texture);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 256, 1, 0,
                    gl.RGB, gl.UNSIGNED_BYTE,
                    new Uint8Array(ramp.buffer, ramp.byteOffset, ramp.length));
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

                renderer.buffer = buffer;
                renderer.texture = texture;
                renderer.ramp = texture;
                renderer.program = program;
                renderer.seed = gl.getUniformLocation(program, 'uSeed');
                renderer.size = gl.getUniformLocation(program, 'uSize');
                renderer.spanY = gl.getUniformLocation(program, 'uSpanY');
                renderer.view = gl.getUniformLocation(program, 'uView');
                renderer.mode = gl.getUniformLocation(program, 'uMode');
                renderer.weight = gl.getUniformLocation(program, 'uWeight');
                renderer.target = null;

                gl.uniform1i(gl.getUniformLocation(program, 'uRamp'), 0);
                gl.uniform1i(gl.getUniformLocation(program, 'uField'), 1);

                return true;
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
            renderer.field = function (seed, view, weight) {
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
            renderer.direct = function (seed, view) {
                gl.bindFramebuffer(gl.FRAMEBUFFER, null);
                gl.uniform1i(renderer.mode, 2);
                gl.uniform2f(renderer.seed, seed.re, seed.im);
                gl.uniform3f(renderer.view, view.cos, view.sin, view.scale);
                gl.drawArrays(gl.TRIANGLES, 0, 3);
            };

            if (renderer.setup()) {
                gpu = renderer;
            }
        }
    } catch (error) {
        gpu = null;
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

    // Where the virtual pointer is at this moment.
    function driftAt(now) {
        return {
            re: DRIFT_ORIGIN.re + DRIFT.re * Math.sin(now / PERIOD.x * TAU),
            im: DRIFT_ORIGIN.im + DRIFT.im * Math.cos(now / PERIOD.y * TAU)
        };
    }

    // Where the view is at this moment: how far the plane is turned and how
    // much it is breathed in or out.
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
            gpu.direct(driftAt(now), viewAt(now));
            markReady();

            return;
        }

        gpu.field(driftAt(now), viewAt(now), primed ? FIELD_WEIGHT : 1);
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
    let fallbackView = null;
    // The trap term of the sample just taken, returned beside the fog without
    // allocating a pair per pixel.
    let edgeOf = 0;

    function sample(sx, sy, layer, drift) {
        const cx = layer.cx + drift.re;
        const cy = layer.cy + drift.im;
        const k = layer.zoom;
        const x0 = (sx * layer.cos - sy * layer.sin) * k + layer.ox;
        const y0 = (sx * layer.sin + sy * layer.cos) * k + layer.oy;

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

            return 0.03;
        }

        const magnitude = Math.log(zr2 + zi2) * 0.5;
        const nu = Math.log(magnitude / Math.LN2) / Math.LN2;
        const smooth = Math.max(0, iter + 1 - nu);
        const t = Math.min(1, smooth / ITERATIONS);

        edgeOf = smoothstep(0.58, 0.99, t);

        return Math.min(0.98, 0.02 + 0.38 * Math.pow(t, 1.1) +
            0.42 * ring6 + 0.2 * line6);
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

        for (let x = 0; x < width; x += 1) {
            const u = x * invW;
            const px = (u - 0.5) * SPAN_X;
            const py = (v - 0.5) * spanY;
            const sx = (px * cosView - py * sinView) * viewScale;
            const sy = (px * sinView + py * cosView) * viewScale;
            let fog = 0;
            let edge = 0;

            for (let l = 0; l < LAYERS.length; l += 1) {
                const weight = l === 0 ? 1 : 0.7;
                const part = sample(sx, sy, LAYERS[l], fallbackDrift) * weight;
                const thread = edgeOf * weight;

                fog = fog + part - fog * part;
                edge = edge + thread - edge * thread;
            }

            const hFade = Math.min(1, u / 0.14, (1 - u) / 0.14);
            const index = Math.round(Math.min(1, fog) * 255) * 3;
            const offset = (offsetY + x) * 4;
            const rim = edge;
            const mask = Math.max(
                Math.pow(Math.min(1, fog * 0.42 + rim * 1.05), 1.25), rim * 0.78);
            const blend = Math.min(1, rim * 6.0);

            for (let c = 0; c < 3; c += 1) {
                data[offset + c] = ramp[index + c] +
                    (EDGE_LOW[c] - ramp[index + c]) * blend;
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
        fallbackView = viewAt(performance.now());
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
        if (gpu && gpu.setup()) {
            resize();
            start();
        }
    }, false);

    resize();
})();
