
(function () {
    'use strict';

    const STORAGE_KEY = 'asarav-brand-activated';
    const SIZE = 58;

    const PALETTES = {
        inactive: {
            dark: [75, 8, 12],
            light: [255, 165, 165],
            marker: '#ffaaaa',
            glow: '#cb4f4f',
            outline: '#860000'
        },
        active: {
            dark: [8, 28, 60],
            light: [170, 210, 245],
            marker: '#b5d4f5',
            glow: '#4080a3',
            outline: '#184069'
        }
    };

    function activated() {
        try {
            return window.localStorage.getItem(STORAGE_KEY) === '1';
        } catch (e) {
            return false;
        }
    }

    function setActivated(value) {
        try {
            window.localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
        } catch (e) {}
    }

    function palette() {
        return activated() ? PALETTES.active : PALETTES.inactive;
    }

    function brandColor() {
        return palette().outline;
    }

    function setBrandAttribute(brand, name, value) {
        brand.setAttribute('data-brand-' + name, value ? 'true' : 'false');
    }

    function syncBrandActivation() {
        const value = activated() ? 'true' : 'false';

        document.querySelectorAll('.navbar-brand').forEach(function (brand) {
            brand.setAttribute('data-brand-activated', value);
        });
    }

    function setup(canvas) {
        const ctx = canvas.getContext('2d', { alpha: true });
        if (!ctx) return;

        // Match the display exactly: the mark is small, so a 3x buffer is
        // cheap and keeps the ribbon boundary from going soft.
        const dpr = Math.max(1, window.devicePixelRatio || 1);
        canvas.width = Math.round(SIZE * dpr);
        canvas.height = Math.round(SIZE * dpr);
        ctx.scale(dpr, dpr);

        const motion = !window.matchMedia(
            '(prefers-reduced-motion: reduce)'
        ).matches;

        // The whole wordmark shares the mark's hover and press state.
        const brand = canvas.closest('.navbar-brand') || canvas;

        setBrandAttribute(brand, 'hover', false);
        setBrandAttribute(brand, 'pressed', false);
        setBrandAttribute(brand, 'activated', activated());

        // The more recognizable Möbius orientation is the default.
        const INITIAL_X = 0.85 + Math.PI;
        const INITIAL_Y = 0.25 + Math.PI;
        const INITIAL_Z = 0.15 + Math.PI;

        // The alternate view is revealed on hover.
        const HOVER_X = 0.85;
        const HOVER_Y = 0.25;
        const HOVER_Z = 0.15;

        let rotX = INITIAL_X;
        let rotY = INITIAL_Y;
        let rotZ = INITIAL_Z;

        // 0 is the plain mark, 1 adds the nested copy, 2 adds a third.
        let nest = 0;
        let nestTarget = 0;

        let targetX = rotX;
        let targetY = rotY;
        let targetZ = rotZ;

        function rotate(point, rx, ry, rz) {
            const cosY = Math.cos(ry);
            const sinY = Math.sin(ry);

            const x1 = point.x * cosY + point.z * sinY;
            const z1 = -point.x * sinY + point.z * cosY;

            const cosX = Math.cos(rx);
            const sinX = Math.sin(rx);

            const y1 = point.y * cosX - z1 * sinX;
            const z2 = point.y * sinX + z1 * cosX;

            const cosZ = Math.cos(rz);
            const sinZ = Math.sin(rz);

            return {
                x: x1 * cosZ - y1 * sinZ,
                y: x1 * sinZ + y1 * cosZ,
                z: z2
            };
        }

        // Recursion state: the mark can be drawn again at its own centre and a
        // smaller scale, which is how a nested copy fits inside the ribbon.
        const view = { scale: 1, dim: 1 };

        function project(point) {
            const focal = 48;
            const scale = view.scale * 1.45 * focal / (focal + point.z + 12);

            return {
                x: SIZE / 2 + point.x * scale,
                y: SIZE / 2 + point.y * scale,
                z: point.z
            };
        }

        function mobiusPoint(u, v) {
            const R = 14;
            const halfWidth = 5.5;

            const cu = Math.cos(u);
            const su = Math.sin(u);
            const twist = Math.cos(u / 2);

            const radius = R + v * halfWidth * twist;

            return {
                x: radius * cu,
                y: radius * su,
                z: v * halfWidth * Math.sin(u / 2)
            };
        }

        function surfacePoint(u, v) {
            const rotated = rotate(
                mobiusPoint(u, v),
                rotX,
                rotY,
                rotZ
            );

            const projected = project(rotated);

            return {
                x: projected.x,
                y: projected.y,
                z: rotated.z,
                rx: rotated.x,
                ry: rotated.y,
                rz: rotated.z
            };
        }

        function shadedColor(shade) {
            const colors = palette();
            const t = Math.pow(shade, 0.85);

            const r = Math.round(
                colors.dark[0] +
                (colors.light[0] - colors.dark[0]) * t
            );

            const g = Math.round(
                colors.dark[1] +
                (colors.light[1] - colors.dark[1]) * t
            );

            const b = Math.round(
                colors.dark[2] +
                (colors.light[2] - colors.dark[2]) * t
            );

            const dim = view.dim;

            return `rgb(${Math.round(r * dim)}, ${Math.round(g * dim)}, ${Math.round(b * dim)})`;
        }

        function quads(uSteps, vSteps) {
            const result = [];

            for (let ui = 0; ui < uSteps; ui++) {
                const u0 = (ui / uSteps) * Math.PI * 2;
                const u1 = ((ui + 1) / uSteps) * Math.PI * 2;

                for (let vi = 0; vi < vSteps; vi++) {
                    const v0 = -1 + 2 * (vi / vSteps);
                    const v1 = -1 + 2 * ((vi + 1) / vSteps);

                    const p00 = surfacePoint(u0, v0);
                    const p10 = surfacePoint(u1, v0);
                    const p11 = surfacePoint(u1, v1);
                    const p01 = surfacePoint(u0, v1);

                    const e1x = p10.rx - p00.rx;
                    const e1y = p10.ry - p00.ry;
                    const e1z = p10.rz - p00.rz;

                    const e2x = p01.rx - p00.rx;
                    const e2y = p01.ry - p00.ry;
                    const e2z = p01.rz - p00.rz;

                    const nx = e1y * e2z - e1z * e2y;
                    const ny = e1z * e2x - e1x * e2z;
                    const nz = e1x * e2y - e1y * e2x;

                    const normalLength =
                        Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;

                    let nxNorm = nx / normalLength;
                    let nyNorm = ny / normalLength;
                    let nzNorm = nz / normalLength;

                    // Orient normals toward the camera.
                    if (nzNorm > 0) {
                        nxNorm = -nxNorm;
                        nyNorm = -nyNorm;
                        nzNorm = -nzNorm;
                    }

                    // Directional light.
                    const lightX = -0.4;
                    const lightY = -0.5;
                    const lightZ = -0.75;

                    const dot = Math.max(
                        0,
                        nxNorm * lightX +
                        nyNorm * lightY +
                        nzNorm * lightZ
                    );

                    const shade = 0.12 + dot * 0.88;

                    const z = (
                        p00.z + p10.z + p11.z + p01.z
                    ) / 4;

                    result.push({
                        points: [p00, p10, p11, p01],
                        z: z,
                        shade: shade
                    });
                }
            }

            // Draw distant faces before nearer faces.
            result.sort(function (a, b) {
                return b.z - a.z;
            });

            return result;
        }

        function drawMark(scale, dim, uSteps, vSteps, markers) {
            view.scale = scale;
            view.dim = dim;

            const color = brandColor();
            const allQuads = quads(uSteps, vSteps);

            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';

            // Draw the ribbon surface.
            allQuads.forEach(function (quad) {
                const points = quad.points;

                ctx.beginPath();
                ctx.moveTo(points[0].x, points[0].y);

                for (let i = 1; i < points.length; i++) {
                    ctx.lineTo(points[i].x, points[i].y);
                }

                ctx.closePath();

                ctx.globalAlpha = 1;
                ctx.fillStyle = shadedColor(quad.shade);
                ctx.fill();
            });

            ctx.globalAlpha = 1;

            // Draw a cross-section across the ribbon's width.
            function drawTwistMarker(u) {
                ctx.beginPath();

                for (let i = 0; i <= 32; i++) {
                    const v = -1 + (2 * i / 32);

                    const p = project(rotate(
                        mobiusPoint(u, v),
                        rotX,
                        rotY,
                        rotZ
                    ));

                    if (i === 0) {
                        ctx.moveTo(p.x, p.y);
                    } else {
                        ctx.lineTo(p.x, p.y);
                    }
                }

                ctx.globalAlpha = 0.55;
                ctx.strokeStyle = palette().marker;
                ctx.lineWidth = 1.1;
                ctx.stroke();

                ctx.globalAlpha = 1;
            }

            // Show the changing orientation of the ribbon.
            if (markers) {
                drawTwistMarker(0);
                drawTwistMarker(Math.PI / 2);
                drawTwistMarker(Math.PI);
                drawTwistMarker(Math.PI * 1.5);
            }

            // Draw the continuous outer boundary.
            function drawBoundary() {
                const points = [];
                const steps = 256;

                for (let i = 0; i <= steps; i++) {
                    const t = (i / steps) * Math.PI * 4;

                    const u = t <= Math.PI * 2
                        ? t
                        : t - Math.PI * 2;

                    const v = t <= Math.PI * 2 ? 1 : -1;

                    const p = rotate(
                        mobiusPoint(u, v),
                        rotX,
                        rotY,
                        rotZ
                    );

                    points.push(project(p));
                }

                ctx.beginPath();
                ctx.moveTo(points[0].x, points[0].y);

                for (let i = 1; i < points.length; i++) {
                    ctx.lineTo(points[i].x, points[i].y);
                }

                // Soft outer highlight.
                ctx.globalAlpha = 0.35;
                ctx.strokeStyle = palette().glow;
                ctx.lineWidth = 3;
                ctx.stroke();

                // Crisp boundary.
                ctx.globalAlpha = 0.95;
                ctx.strokeStyle = color;
                ctx.lineWidth = 1.25;
                ctx.stroke();

                ctx.globalAlpha = 1;
            }

            drawBoundary();

            ctx.globalAlpha = 1;
        }

        // The resting state is the single band. On hover a smaller copy of the
        // same mark appears inside the ribbon's hole, and pressing adds a third,
        // so the mark visibly contains itself. The copies are dimmed rather than
        // faded so they stay crisp at 58px.
        function draw() {
            ctx.clearRect(0, 0, SIZE, SIZE);

            drawMark(1, 1, 64, 12, true);

            if (nest > 0.03) {
                drawMark(0.34, 0.52, 40, 8, false);
            }

            if (nest > 0.66) {
                drawMark(0.115, 0.3, 24, 6, false);
            }
        }

        function animate() {
            const ease = 0.012;

            rotX += (targetX - rotX) * ease;
            rotY += (targetY - rotY) * ease;
            rotZ += (targetZ - rotZ) * ease;
            nest += (nestTarget - nest) * 0.09;

            draw();

            window.requestAnimationFrame(animate);
        }

        // Without the animation loop the recursion has to be applied directly.
        function syncNest() {
            if (!motion) {
                nest = nestTarget;
                draw();
            }
        }

        function enterBrand() {
            setBrandAttribute(brand, 'hover', true);

            targetX = HOVER_X;
            targetY = HOVER_Y;
            targetZ = HOVER_Z;
            nestTarget = 1;
            syncNest();
        }

        function leaveBrand() {
            setBrandAttribute(brand, 'hover', false);
            setBrandAttribute(brand, 'pressed', false);

            nestTarget = 0;
            syncNest();

            targetX = INITIAL_X;
            targetY = INITIAL_Y;
            targetZ = INITIAL_Z;
        }

        brand.addEventListener('pointerenter', enterBrand);
        brand.addEventListener('pointerleave', leaveBrand);

        brand.addEventListener('focusin', enterBrand);
        brand.addEventListener('focusout', function (event) {
            if (!brand.contains(event.relatedTarget)) {
                leaveBrand();
            }
        });

        brand.addEventListener('pointerdown', function () {
            setBrandAttribute(brand, 'pressed', true);
            nestTarget = 2;
            syncNest();
        });

        brand.addEventListener('pointerup', function () {
            setBrandAttribute(brand, 'pressed', false);
            nestTarget = 1;
        });

        brand.addEventListener('pointercancel', function () {
            setBrandAttribute(brand, 'pressed', false);
            nestTarget = 1;
        });

        brand.addEventListener('click', function (event) {
            if (
                event.button !== 0 ||
                event.metaKey ||
                event.ctrlKey ||
                event.shiftKey ||
                event.altKey
            ) {
                return;
            }

            setActivated(!activated());
            syncBrandActivation();
            draw();
        });

        if (motion) {
            window.requestAnimationFrame(animate);
        } else {
            draw();
        }
    }

    function init() {
        syncBrandActivation();
        document.querySelectorAll('canvas.brand-mark').forEach(setup);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
