(function () {
    'use strict';

    let ctx = null;

    function ensureContext() {
        if (ctx) {
            return ctx;
        }

        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) {
            return null;
        }

        ctx = new AudioContext();
        return ctx;
    }

    // A short burst of filtered noise: reads as a physical tick/thud
    // rather than a synthesized beep.
    function noiseBurst(filterType, frequency, q, duration, peakGain, startTime) {
        const context = ensureContext();
        if (!context) {
            return;
        }

        if (context.state === 'suspended') {
            context.resume();
        }

        const now = startTime || context.currentTime;
        const bufferSize = Math.ceil(context.sampleRate * duration);
        const buffer = context.createBuffer(1, bufferSize, context.sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1);
        }

        const source = context.createBufferSource();
        source.buffer = buffer;

        const filter = context.createBiquadFilter();
        filter.type = filterType;
        filter.frequency.value = frequency;
        filter.Q.value = q;

        const gain = context.createGain();
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(peakGain, now + 0.006);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

        source.connect(filter);
        filter.connect(gain);
        gain.connect(context.destination);

        source.start(now);
        source.stop(now + duration + 0.02);
    }

    // Soft low body tone underneath a click.
    function bodyTone(frequency, duration, peakGain) {
        const context = ensureContext();
        if (!context) {
            return;
        }

        if (context.state === 'suspended') {
            context.resume();
        }

        const now = context.currentTime;
        const osc = context.createOscillator();
        const gain = context.createGain();
        const filter = context.createBiquadFilter();

        filter.type = 'lowpass';
        filter.frequency.value = 600;
        filter.Q.value = 0.5;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(frequency, now);
        osc.frequency.exponentialRampToValueAtTime(
            Math.max(40, frequency * 0.7),
            now + duration
        );

        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(peakGain, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(context.destination);

        osc.start(now);
        osc.stop(now + duration + 0.05);
    }

    function playClick(target) {
        if (target.matches('.navbar-brand, .brand-mark, .brand-word')) {
            // Brand: warm chime (two tones).
            noiseBurst('bandpass', 1200, 1.5, 0.06, 0.10);
            bodyTone(262, 0.22, 0.06);
            window.setTimeout(function () {
                noiseBurst('bandpass', 1800, 1.5, 0.05, 0.08);
                bodyTone(392, 0.18, 0.05);
            }, 90);
        } else if (target.matches('button, [role="button"]')) {
            // Low, rounded thud.
            noiseBurst('lowpass', 380, 1.2, 0.14, 0.14);
            bodyTone(110, 0.18, 0.06);
        } else if (target.matches('.footer-column a, .footer-base a, .footer-top, .footer-wordmark')) {
            // Footer: soft, low tick.
            noiseBurst('bandpass', 900, 1.2, 0.06, 0.08);
            bodyTone(220, 0.18, 0.04);
        } else if (target.matches('.tile')) {
            // Two soft ticks, slightly different pitch.
            noiseBurst('bandpass', 1800, 2.0, 0.05, 0.10);
            window.setTimeout(function () {
                noiseBurst('bandpass', 2400, 2.0, 0.05, 0.08);
            }, 70);
            bodyTone(330, 0.2, 0.04);
        } else if (target.matches('.contact-card')) {
            // Gentle bell.
            noiseBurst('bandpass', 3200, 1.5, 0.07, 0.09);
            bodyTone(440, 0.28, 0.05);
        } else if (target.matches('a')) {
            // Crisp high tick.
            noiseBurst('highpass', 2200, 1.0, 0.045, 0.10);
        } else {
            noiseBurst('bandpass', 1400, 1.2, 0.06, 0.08);
        }
    }

    document.addEventListener('click', function (event) {
        const target = event.target && event.target.closest
            ? event.target.closest('a, button, [role="button"], input, textarea, select, .tile, .contact-card')
            : null;

        if (!target) {
            return;
        }

        playClick(target);
    }, true);
})();
