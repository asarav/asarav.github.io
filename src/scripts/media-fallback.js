// ============================================================================
// MEDIA-FALLBACK.JS - Resilient video loading
// ============================================================================
// Some embedded preview browsers fail native progressive video requests even
// though the file downloads normally. When a video element errors, retry it
// once by fetching the file and playing it from a blob URL.
//
// This only runs for videos that actually fail, so regular browsers keep
// streaming the original file normally.
// ============================================================================
(function () {
    'use strict';

    var RETRY_ATTR = 'data-media-retry';
    var MAX_CONCURRENT = 2;
    var queue = [];
    var active = 0;
    var objectUrls = [];

    function getVideoSource(video) {
        var src = video.currentSrc || video.getAttribute('src');
        if (!src) {
            var source = video.querySelector('source');
            if (source) {
                src = source.src || source.getAttribute('src');
            }
        }
        return src;
    }

    function enqueue(video) {
        var state = video.getAttribute(RETRY_ATTR);
        if (state === 'queued' || state === 'loading' || state === 'done' || state === 'failed') {
            return;
        }
        video.setAttribute(RETRY_ATTR, 'queued');
        queue.push(video);
        pump();
    }

    function pump() {
        while (active < MAX_CONCURRENT && queue.length > 0) {
            start(queue.shift());
        }
    }

    function start(video) {
        var src = getVideoSource(video);
        if (!src || src.indexOf('blob:') === 0) {
            video.setAttribute(RETRY_ATTR, 'failed');
            return;
        }

        video.setAttribute(RETRY_ATTR, 'loading');
        active += 1;

        // A unique query string bypasses any cached partial response that made
        // the original media request fail.
        var retryUrl = new URL(src, window.location.href);
        retryUrl.searchParams.set(
            'media_retry',
            Date.now().toString(36) + Math.random().toString(36).slice(2)
        );

        fetch(retryUrl.toString(), { credentials: 'same-origin' })
            .then(function (response) {
                if (!response.ok) {
                    throw new Error('Video retry failed with HTTP ' + response.status);
                }
                return response.blob();
            })
            .then(function (blob) {
                if (!blob.size) {
                    throw new Error('Video retry returned an empty response');
                }
                var objectUrl = URL.createObjectURL(blob);
                objectUrls.push(objectUrl);
                video.src = objectUrl;
                video.load();
                video.setAttribute(RETRY_ATTR, 'done');

                if (video.hasAttribute('autoplay')) {
                    var playPromise = video.play();
                    if (playPromise && typeof playPromise.catch === 'function') {
                        playPromise.catch(function () {});
                    }
                }
            })
            .catch(function () {
                video.setAttribute(RETRY_ATTR, 'failed');
            })
            .finally(function () {
                active -= 1;
                pump();
            });
    }

    var visibleObserver = null;
    if (typeof IntersectionObserver !== 'undefined') {
        visibleObserver = new IntersectionObserver(
            function (entries) {
                entries.forEach(function (entry) {
                    if (!entry.isIntersecting) return;
                    visibleObserver.unobserve(entry.target);
                    enqueue(entry.target);
                });
            },
            { root: null, rootMargin: '300px 0px', threshold: 0 }
        );
    }

    function schedule(video) {
        if (video.getAttribute(RETRY_ATTR)) return;
        video.setAttribute(RETRY_ATTR, 'waiting');
        if (visibleObserver) {
            visibleObserver.observe(video);
        } else {
            enqueue(video);
        }
    }

    function handleMediaError(event) {
        var target = event.target;
        if (!target || !target.tagName) return;

        var video = target;
        if (video.tagName === 'SOURCE' && video.parentElement) {
            video = video.parentElement;
        }
        if (video.tagName !== 'VIDEO' || video.getAttribute(RETRY_ATTR)) return;

        schedule(video);
    }

    function scan() {
        var videos = document.querySelectorAll('video');
        for (var i = 0; i < videos.length; i += 1) {
            if (videos[i].error) {
                schedule(videos[i]);
            }
        }
    }

    // Media errors do not bubble, so listen during the capture phase.
    document.addEventListener('error', handleMediaError, true);
    document.addEventListener('DOMContentLoaded', scan);
    window.addEventListener('load', scan);
    window.addEventListener('beforeunload', function () {
        objectUrls.forEach(function (url) {
            URL.revokeObjectURL(url);
        });
    });
})();
