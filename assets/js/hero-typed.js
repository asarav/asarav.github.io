(function () {
    'use strict';

    var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    // Collect groups of elements to type out. Each group is an array of
    // elements typed in sequence (handles multi-line jumbotron sub text).
    var groups = [];

    // Jumbotron sub text (single line).
    Array.prototype.slice.call(document.querySelectorAll('.hero-note, .log-explanation'))
        .forEach(function (el) {
            groups.push({ els: [el], delay: 700, onScroll: false });
        });

    // First paragraph(s) of each jumbotron explanation block.
    Array.prototype.slice.call(document.querySelectorAll('.page-top > [class$="-explanation"]'))
        .forEach(function (block) {
            var paras = Array.prototype.slice.call(block.querySelectorAll('p'));
            if (paras.length) {
                groups.push({ els: paras, delay: 700, onScroll: false });
            }
        });

    // Tile sub text on the home page (typed when scrolled into view).
    Array.prototype.slice.call(document.querySelectorAll('.tile-explanation > p'))
        .forEach(function (el) {
            groups.push({ els: [el], delay: 200, onScroll: true });
        });

    // Timeline entries in the home-page hero chronology.
    Array.prototype.slice.call(document.querySelectorAll('.hero-floorplan .floor-role'))
        .forEach(function (el, i) {
            groups.push({ els: [el], delay: 1100 + i * 130, onScroll: false });
        });

    // De-duplicate elements across groups.
    var seen = [];
    groups = groups.filter(function (group) {
        var novel = group.els.some(function (p) { return seen.indexOf(p) === -1; });
        if (novel) {
            group.els.forEach(function (p) { if (seen.indexOf(p) === -1) seen.push(p); });
            return true;
        }
        return false;
    });

    if (reducedMotion.matches) {
        // Reveal all text immediately without typing.
        var allEls = [];
        groups.forEach(function (g) { g.els.forEach(function (el) { allEls.push(el); }); });
        var ft = document.querySelector('.footer-transmission');
        if (ft) allEls.push(ft);
        allEls.forEach(function (el) {
            el.style.setProperty('opacity', '1', 'important');
        });
        return;
    }

    // Gate the animation so it only plays occasionally (first visit or after
    // ~1 hour), except on the home page where it always plays.
    function shouldAnimate(key) {
        if (window.location.pathname === '/') {
            return true;
        }
        try {
            var last = window.localStorage.getItem('hero-typed:last:' + key);
            if (!last) return true;
            return (Date.now() - parseInt(last, 10)) > 3600000;
        } catch (e) {
            return true;
        }
    }

    function markAnimated(key) {
        try {
            window.localStorage.setItem('hero-typed:last:' + key, String(Date.now()));
        } catch (e) {}
    }

    var pageKey = 'page:' + window.location.pathname;
    var footerKey = 'footer';

    // If the page animation is skipped, reveal the text immediately.
    if (!shouldAnimate(pageKey)) {
        groups.forEach(function (group) {
            group.els.forEach(function (el) {
                el.style.setProperty('opacity', '1', 'important');
            });
        });
        groups = [];
    } else {
        markAnimated(pageKey);
    }

    if (typeof IntersectionObserver === 'undefined') {
        // Older browsers: reveal everything immediately, no typing.
        var allEls = [];
        groups.forEach(function (g) { g.els.forEach(function (el) { allEls.push(el); }); });
        var ft = document.querySelector('.footer-transmission');
        if (ft) allEls.push(ft);
        allEls.forEach(function (el) {
            el.style.setProperty('opacity', '1', 'important');
        });
        return;
    }

    if (!groups.length && !document.querySelector('.footer-transmission')) {
        return;
    }

    function wrongChar(correct) {
        var letters = 'abcdefghijklmnopqrstuvwxyz';
        var lower = correct.toLowerCase();
        var w;
        do {
            w = letters[Math.floor(Math.random() * letters.length)];
        } while (w === lower);
        if (correct !== lower) {
            w = w.toUpperCase();
        }
        return w;
    }

    // Reusable typing routine for a single element.
    function typeElement(el, text, onDone) {
        if (!text) {
            el.style.setProperty('opacity', '1', 'important');
            if (onDone) onDone();
            return;
        }

        var originalAriaLive = el.getAttribute('aria-live');
        el.setAttribute('aria-live', 'off');

        var originalHTML = el.innerHTML;
        el.classList.add('is-typing');
        el.textContent = '';

        var textSpan = document.createElement('span');
        textSpan.className = 'hero-note__text';
        el.appendChild(textSpan);

        var cursor = document.createElement('span');
        cursor.className = 'hero-note__cursor';
        cursor.setAttribute('aria-hidden', 'true');
        cursor.textContent = '\u258C';
        el.appendChild(cursor);

        var index = 0;
        var baseDelay = 18;

        function typeCorrect() {
            textSpan.textContent += text.charAt(index);
            index += 1;
            if (index >= text.length) {
                // Restore aria-live for accessibility.
                if (originalAriaLive === null) {
                    el.removeAttribute('aria-live');
                } else {
                    el.setAttribute('aria-live', originalAriaLive);
                }
                window.setTimeout(function () {
                    el.classList.remove('is-typing');
                }, 900);
                window.setTimeout(function () {
                    cursor.style.transition = 'opacity 0.4s ease';
                    cursor.style.opacity = '0';
                    window.setTimeout(function () {
                        if (cursor.parentNode) {
                            cursor.parentNode.removeChild(cursor);
                        }
                        el.innerHTML = originalHTML;
                    }, 420);
                }, 3000);
                if (onDone) onDone();
            } else {
                scheduleNext();
            }
        }

        function scheduleNext() {
            var jitter = Math.floor(Math.random() * 12);
            var prevChar = text.charAt(index - 1);
            var pause = (prevChar === '.' || prevChar === ',' || prevChar === ';' || prevChar === ':') ? 60 : 0;
            window.setTimeout(typeNext, baseDelay + jitter + pause);
        }

        function typeNext() {
            if (index >= text.length) {
                return;
            }
            var nextChar = text.charAt(index);
            if (/[a-zA-Z]/.test(nextChar) && Math.random() < 0.04) {
                var w = wrongChar(nextChar);
                textSpan.textContent += w;
                window.setTimeout(function () {
                    textSpan.textContent = textSpan.textContent.slice(0, -1);
                    window.setTimeout(typeCorrect, 90);
                }, 170);
                return;
            }
            typeCorrect();
        }

        el.style.setProperty('opacity', '1', 'important');
        window.setTimeout(typeNext, 0);
    }

    function typeGroup(group) {
        var els = group.els;
        // Prepare all elements: capture text, clear, mark typing.
        var items = els.map(function (p) {
            var text = (p.textContent || '').trim();
            var originalHTML = p.innerHTML;
            p.classList.add('is-typing');
            p.textContent = '';
            return { el: p, text: text, originalHTML: originalHTML };
        });

        // Type elements in sequence.
        var i = 0;
        function typeNextElement() {
            if (i >= items.length) {
                return;
            }
            var it = items[i];
            // Create text span + cursor for this element.
            var textSpan = document.createElement('span');
            textSpan.className = 'hero-note__text';
            it.el.appendChild(textSpan);

            var cursor = document.createElement('span');
            cursor.className = 'hero-note__cursor';
            cursor.setAttribute('aria-hidden', 'true');
            cursor.textContent = '\u258C';
            it.el.appendChild(cursor);

            it.el.style.setProperty('opacity', '1', 'important');

            var index = 0;
            var baseDelay = 18;

            function typeCorrect() {
                textSpan.textContent += it.text.charAt(index);
                index += 1;
                if (index >= it.text.length) {
                    window.setTimeout(function () {
                        it.el.classList.remove('is-typing');
                    }, 900);
                    window.setTimeout(function () {
                        cursor.style.transition = 'opacity 0.4s ease';
                        cursor.style.opacity = '0';
                        window.setTimeout(function () {
                            if (cursor.parentNode) {
                                cursor.parentNode.removeChild(cursor);
                            }
                            it.el.innerHTML = it.originalHTML;
                        }, 420);
                    }, 3000);
                    // Move to next element.
                    i += 1;
                    if (i < items.length) {
                        window.setTimeout(typeNextElement, 150);
                    }
                } else {
                    scheduleNext();
                }
            }

            function scheduleNext() {
                var jitter = Math.floor(Math.random() * 12);
                var prevChar = it.text.charAt(index - 1);
                var pause = (prevChar === '.' || prevChar === ',' || prevChar === ';' || prevChar === ':') ? 60 : 0;
                window.setTimeout(typeNext, baseDelay + jitter + pause);
            }

            function typeNext() {
                if (index >= it.text.length) {
                    return;
                }
                var nextChar = it.text.charAt(index);
                if (/[a-zA-Z]/.test(nextChar) && Math.random() < 0.04) {
                    var w = wrongChar(nextChar);
                    textSpan.textContent += w;
                    window.setTimeout(function () {
                        textSpan.textContent = textSpan.textContent.slice(0, -1);
                        window.setTimeout(typeCorrect, 90);
                    }, 170);
                    return;
                }
                typeCorrect();
            }

            window.setTimeout(typeNext, group.delay);
        }

        typeNextElement();
    }

    groups.forEach(function (group) {
        if (group.onScroll) {
            var observer = new IntersectionObserver(function (entries, obs) {
                entries.forEach(function (entry) {
                    if (entry.isIntersecting) {
                        obs.disconnect();
                        window.setTimeout(function () {
                            typeGroup(group);
                        }, group.delay);
                    }
                });
            }, { threshold: 0.25 });
            observer.observe(group.els[0]);
        } else {
            window.setTimeout(function () {
                typeGroup(group);
            }, group.delay);
        }
    });

    // Footer transmission quote (set by footer.js after this script runs).
    var footerTransmission = document.querySelector('.footer-transmission');
    if (footerTransmission) {
        var footerTyped = false;
        function startFooterTyping() {
            if (footerTyped) return;
            var text = (footerTransmission.textContent || '').trim();
            if (!text) return;
            footerTyped = true;
            if (viewObserver) viewObserver.disconnect();
            mutationObserver.disconnect();
            if (!shouldAnimate(footerKey)) {
                // Reveal without typing.
                footerTransmission.style.setProperty('opacity', '1', 'important');
                return;
            }
            markAnimated(footerKey);
            window.setTimeout(function () {
                typeElement(footerTransmission, text, 0);
            }, 100);
        }
        var mutationObserver = new MutationObserver(function () {
            if (footerTyped) return;
            startFooterTyping();
        });
        mutationObserver.observe(footerTransmission, { childList: true, characterData: true, subtree: true });
        // Trigger when the footer scrolls into view so the user actually
        // sees the animation (it starts below the fold on most pages).
        var viewObserver = new IntersectionObserver(function (entries, obs) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    startFooterTyping();
                }
            });
        }, { threshold: 0.3 });
        viewObserver.observe(document.getElementById('footer') || footerTransmission);
        // footer.js may have already set the text and the footer may already
        // be in view, so check immediately as well.
        startFooterTyping();
    }

    // Signal that the enhancement loaded (used by the head-script fallback).
    window.__heroTypedReady = true;
})();
