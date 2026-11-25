(function () {
    'use strict';

    function formatTime(seconds) {
        if (!isFinite(seconds) || seconds < 0) return '0:00';
        const minutes = Math.floor(seconds / 60);
        const remaining = Math.floor(seconds % 60);
        return minutes + ':' + (remaining < 10 ? '0' : '') + remaining;
    }

    function enhancePlayer(player) {
        const audio = player.querySelector('audio');
        const toggle = player.querySelector('.player-toggle');
        const seek = player.querySelector('.player-seek');
        const current = player.querySelector('.player-current');
        const duration = player.querySelector('.player-duration');
        const mute = player.querySelector('.player-mute');
        const title = player.getAttribute('data-title') || 'track';

        if (!audio || !toggle || !seek || !current || !duration || !mute) return;

        player.classList.add('is-enhanced');
        audio.setAttribute('tabindex', '-1');
        audio.setAttribute('aria-hidden', 'true');

        let seeking = false;

        function updateDuration() {
            duration.textContent = formatTime(audio.duration);
            if (isFinite(audio.duration) && audio.duration > 0) {
                seek.max = '100';
            }
        }

        function updateProgress() {
            if (seeking) return;
            if (isFinite(audio.duration) && audio.duration > 0) {
                seek.value = String((audio.currentTime / audio.duration) * 100);
            }
            current.textContent = formatTime(audio.currentTime);
        }

        function setPlaying(isPlaying) {
            player.classList.toggle('is-playing', isPlaying);
            toggle.setAttribute('aria-label', (isPlaying ? 'Pause ' : 'Play ') + title);
            toggle.setAttribute('aria-pressed', isPlaying ? 'true' : 'false');
        }

        function updateMute() {
            player.classList.toggle('is-muted', audio.muted || audio.volume === 0);
            mute.setAttribute('aria-label', (audio.muted ? 'Unmute ' : 'Mute ') + title);
        }

        audio.addEventListener('loadedmetadata', updateDuration);
        audio.addEventListener('durationchange', updateDuration);
        audio.addEventListener('timeupdate', updateProgress);
        audio.addEventListener('play', function () {
            setPlaying(true);
            document.querySelectorAll('[data-audio-player].is-playing').forEach(function (other) {
                if (other !== player) {
                    const otherAudio = other.querySelector('audio');
                    if (otherAudio && !otherAudio.paused) otherAudio.pause();
                }
            });
        });
        audio.addEventListener('pause', function () { setPlaying(false); });
        audio.addEventListener('ended', function () {
            setPlaying(false);
            seek.value = '0';
            current.textContent = '0:00';
        });
        audio.addEventListener('volumechange', updateMute);

        toggle.addEventListener('click', function () {
            if (audio.paused) {
                const playPromise = audio.play();
                if (playPromise && typeof playPromise.catch === 'function') {
                    playPromise.catch(function () {});
                }
            } else {
                audio.pause();
            }
        });

        seek.addEventListener('input', function () {
            seeking = true;
            if (isFinite(audio.duration) && audio.duration > 0) {
                current.textContent = formatTime((Number(seek.value) / 100) * audio.duration);
            }
        });

        seek.addEventListener('change', function () {
            if (isFinite(audio.duration) && audio.duration > 0) {
                audio.currentTime = (Number(seek.value) / 100) * audio.duration;
            }
            seeking = false;
        });

        mute.addEventListener('click', function () {
            audio.muted = !audio.muted;
        });

        updateDuration();
        updateProgress();
        updateMute();
    }

    function init() {
        document.querySelectorAll('[data-audio-player]').forEach(enhancePlayer);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();