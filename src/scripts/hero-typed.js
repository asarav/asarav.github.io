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

    // Keys next to one another, so a slip lands on a plausible neighbour from
    // the same hand instead of on a random letter.
    var NEIGHBOURS = {
        q: 'wa', w: 'qeasd', e: 'wrsd', r: 'etdf', t: 'ryfg', y: 'tugh',
        u: 'yihj', i: 'uojk', o: 'ipkl', p: 'ol', a: 'qwsz', s: 'awedxz',
        d: 'serfcx', f: 'drtgvc', g: 'ftyhbv', h: 'gyujnb', j: 'huikm',
        k: 'jiolm', l: 'kop', z: 'asx', x: 'zsdc', c: 'xdfv', v: 'cfgb',
        b: 'vghn', n: 'bhjm', m: 'njk'
    };

    function slip(correct) {
        var lower = correct.toLowerCase();
        var options = NEIGHBOURS[lower];

        if (!options) {
            return wrongChar(correct);
        }

        var pick = options.charAt(Math.floor(Math.random() * options.length));

        return correct === lower ? pick : pick.toUpperCase();
    }

    // Single letters: roughly one in eighty goes wrong, on a key next to the
    // right one. Enough that a visitor sees it, rarely enough that the line
    // still reads cleanly. About half are caught at once; the rest run on for a
    // character or two before the backspaces start.
    var TYPO_RATE = 0.012;

    // Whole words, which are the mistakes people actually notice: the letters
    // come out in the wrong order, one is doubled, or one is missed. About one
    // word in twelve, then the word is backspaced and typed again.
    var WORD_TYPO_RATE = 0.085;

    // And a budget per line: one correction, two on a long one. Without it an
    // unlucky line drew four or five, each one a whole word typed twice and
    // backspaced, and the line appeared to stall — one measured run sat at 3.5
    // characters a second for the whole of it. A person does not mistype four
    // times in a sentence either.
    var MAX_MISTAKES = 2;
    var LONG_LINE = 160;

    // A word misspelt the way a hand misspells one. Returns null when the change
    // would come out identical, which happens with repeated letters.
    function scrambleWord(word) {
        var letters = word.split('');
        var i;
        var wrong;
        var kind = Math.random();

        if (kind < 0.45) {
            // Two letters traded places: "the" typed as "teh".
            i = 1 + Math.floor(Math.random() * (word.length - 2));
            wrong = letters[i];
            letters[i] = letters[i - 1];
            letters[i - 1] = wrong;
        } else if (kind < 0.75) {
            // A finger lingers and a letter comes out twice.
            i = 1 + Math.floor(Math.random() * (word.length - 1));
            letters.splice(i, 0, letters[i]);
        } else {
            // A letter is skipped entirely.
            i = 1 + Math.floor(Math.random() * (word.length - 2));
            letters.splice(i, 1);
        }

        wrong = letters.join('');

        return wrong === word ? null : wrong;
    }

    function planKeystrokes(text) {
        var plan = [];
        var i = 0;
        var maxMistakes = text.length > LONG_LINE ? MAX_MISTAKES : 1;
        var mistakes = 0;

        while (i < text.length) {
            var ch = text.charAt(i);
            var wordStart = /[a-z]/i.test(ch) &&
                (i === 0 || !/[a-z]/i.test(text.charAt(i - 1)));

            if (wordStart && mistakes < maxMistakes &&
                Math.random() < WORD_TYPO_RATE) {
                var end = i;
                while (end < text.length && /[a-z]/i.test(text.charAt(end))) {
                    end += 1;
                }

                var word = text.slice(i, end);
                var wrongWord = word.length > 2 ? scrambleWord(word) : null;

                if (wrongWord) {
                    var typed;

                    mistakes += 1;

                    for (typed = 0; typed < wrongWord.length; typed++) {
                        plan.push({ ch: wrongWord.charAt(typed) });
                    }

                    // The beat where the eye catches it, then the word comes
                    // back off one character at a time.
                    plan.push({ wait: 260 + Math.random() * 260 });

                    for (typed = 0; typed < wrongWord.length; typed++) {
                        plan.push({ del: 1 });
                    }

                    for (typed = 0; typed < word.length; typed++) {
                        plan.push({ ch: word.charAt(typed) });
                    }

                    i = end;
                    continue;
                }
            }

            if (/[a-z]/i.test(ch) && mistakes < maxMistakes &&
                Math.random() < TYPO_RATE) {
                var extra = 0;

                mistakes += 1;

                plan.push({ ch: slip(ch) });

                if (Math.random() > 0.5) {
                    while (extra < 2) {
                        var ahead = text.charAt(i + extra + 1);

                        if (!ahead || /\s/.test(ahead)) {
                            break;
                        }

                        plan.push({ ch: ahead });
                        extra += 1;
                    }
                }

                // The beat where it registers, then the correction.
                plan.push({ wait: 190 + Math.random() * 300 });

                for (var removed = 0; removed <= extra; removed++) {
                    plan.push({ del: 1 });
                }

                for (var again = 0; again <= extra; again++) {
                    plan.push({ ch: text.charAt(i + again) });
                }

                i += extra + 1;
                continue;
            }

            plan.push({ ch: ch });
            i += 1;
        }

        return plan;
    }

    // Gap before the next keystroke. Averaging two random draws gives typing's
    // clusters and stalls; a flat random jitter reads as a machine.
    // Every gap below is written at a human pace, and this trims the whole
    // performance at once — pauses, corrections and backspaces included — so
    // the rhythm and its irregularities stay the same, only quicker. 0.385 is
    // 30% quicker than the 0.5 this ran at before, and about 17 characters a
    // second. Long paragraphs used to get an extra speed-up on top of this;
    // that is gone, because the whole performance is quicker now and the pace
    // for a given line should not depend on how long the copy happens to be.
    var SPEED = 0.385;

    // Around 8 characters a second before SPEED: a quick but ordinary typist,
    // slow enough that the eye can follow the line, the mistakes in it and the
    // corrections.
    function gapAfter(prev, next) {
        var gap = 70 + (Math.random() + Math.random()) * 55;

        if (prev && next && prev.toLowerCase() === next.toLowerCase()) {
            // A doubled letter is one motion, not two.
            gap *= 0.62;
        }

        if (next && /[A-Z]/.test(next)) {
            // Reaching for a capital.
            gap += 30 + Math.random() * 55;
        }

        // Now and then a finger simply hesitates over the next key.
        if (Math.random() < 0.07) {
            gap += 110 + Math.random() * 190;
        }

        if (prev === ' ') {
            gap += 30 + Math.random() * 80;
        }

        if (prev === '.' || prev === '!' || prev === '?') {
            gap += 260 + Math.random() * 300;
        } else if (prev === ',' || prev === ';' || prev === ':') {
            gap += 150 + Math.random() * 170;
        } else if (prev === '\u2014' || prev === '\u2013') {
            gap += 120 + Math.random() * 160;
        }

        return gap;
    }

    // A keystroke that comes due while the tab is hidden lands in a
    // throttled timer and the line types itself out behind the user's
    // back. The chain parks instead and picks up where it left off when
    // the tab is shown again, so nobody returns to a finished line they
    // never saw.
    var waitingForVisibility = [];

    function whenVisible(fn) {
        if (!document.hidden) {
            fn();
            return;
        }

        waitingForVisibility.push(fn);
    }

    document.addEventListener('visibilitychange', function () {
        if (document.hidden) {
            return;
        }

        var queued = waitingForVisibility;

        waitingForVisibility = [];

        for (var i = 0; i < queued.length; i++) {
            queued[i]();
        }
    }, false);

    function typeInto(textSpan, text, onDone) {
        var plan = planKeystrokes(text);
        var step = 0;
        var shown = '';

        function nextChar(from) {
            for (var i = from; i < plan.length; i++) {
                if (plan[i].ch !== undefined) {
                    return plan[i].ch;
                }
            }

            return '';
        }

        function advance() {
            if (document.hidden) {
                whenVisible(advance);
                return;
            }

            if (step >= plan.length) {
                onDone();
                return;
            }

            var item = plan[step];
            var prev = shown.charAt(shown.length - 1);

            step += 1;

            if (item.wait !== undefined) {
                window.setTimeout(advance, item.wait * SPEED);
                return;
            }

            if (item.del) {
                shown = shown.slice(0, -1);
            } else {
                shown += item.ch;
            }

            textSpan.textContent = shown;

            // Backspace is a quick repeated press; a character waits for the
            // next key to be found.
            var delay = item.del ?
                70 + Math.random() * 80 :
                gapAfter(prev, nextChar(step));

            window.setTimeout(advance, delay * SPEED);
        }

        advance();
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

        // A block cursor, the way a terminal shows one: the left half-block
        // glyph, blinking over the character slot it is about to fill.
        var cursor = document.createElement('span');
        cursor.className = 'hero-note__cursor';
        cursor.setAttribute('aria-hidden', 'true');
        cursor.textContent = '\u258C';
        el.appendChild(cursor);

        el.style.setProperty('opacity', '1', 'important');

        typeInto(textSpan, text, function () {
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
            }, 1500);

            if (onDone) onDone();
        });
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

            window.setTimeout(function () {
                typeInto(textSpan, it.text, function () {
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
                    }, 1500);

                    // Move to next element.
                    i += 1;
                    if (i < items.length) {
                        window.setTimeout(typeNextElement, 150);
                    }
                });
            }, group.delay);
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
