document.addEventListener('DOMContentLoaded', function () {
    // Keep the copyright current without a build step.
    const yearElement = document.querySelector('[data-footer-year]');
    if (yearElement) {
        yearElement.textContent = new Date().getFullYear();
    }

    // Quiet "transmission": a short quote that changes with the hour of day.
    const transmission = document.querySelector('.footer-transmission');
    if (transmission) {
        const quotes = [
            "Lasciate ogne speranza, voi ch'intrate. — Dante Alighieri",
            "Any sufficiently advanced technology is indistinguishable from magic. — Arthur C. Clarke",
            "Siempre imaginé que el Paraíso sería algún tipo de biblioteca. — Jorge Luis Borges",
            "The universe is under no obligation to make sense to you. — Neil deGrasse Tyson",
            "We are a way for the cosmos to know itself. — Carl Sagan",
            "All the world's a stage, and all the men and women merely players. — William Shakespeare",
            "The only way to discover the limits of the possible is to go beyond them into the impossible. — Arthur C. Clarke",
            "In the beginning the Universe was created. This has made a lot of people very angry and been widely regarded as a bad move. — Douglas Adams",
            "Do not go gentle into that good night. — Dylan Thomas",
            "ὁ ἀνέξετος βίος οὐ βιωτὸς ἀνθρώπῳ. — Σωκράτης",
            "Cogito, ergo sum. — René Descartes",
            "The cosmos is within us. We are made of star-stuff. — Carl Sagan",
            "Ἡ ψυχὴ βάπτεται τοῖς ἐπινοήμασιν. — Μάρκος Αὐρήλιος",
            "The future is already here — it's just not very evenly distributed. — William Gibson",
            "Was mich nicht umbringt, macht mich stärker. — Friedrich Nietzsche",
            "L'enfer, c'est les autres. — Jean-Paul Sartre",
            "Phantasie ist wichtiger als Wissen. — Albert Einstein",
            "The important thing is not to stop questioning. Curiosity has its own reason for existing. — Albert Einstein",
            "Die Sprache ist das Haus des Seins. — Martin Heidegger",
            "Il faut imaginer Sisyphe heureux. — Albert Camus",
            "Sabbe sattā sukhī hontu. — गौतम बुद्ध",
            "Hope is the thing with feathers that perches in the soul. — Emily Dickinson",
            "Au milieu de l'hiver, j'ai découvert en moi un invincible été. — Albert Camus",
            "I am large, I contain multitudes. — Walt Whitman",
            "己所不欲，勿施於人。 — 孔子",
            "天下大勢，分久必合，合久必分。 — 羅貫中",
            "吾生也有涯，而知也無涯。 — 莊子",
            "私は人間をやめた。 — 太宰治",
            "和を以て貴しとなす。 — 聖徳太子",
            "कर्मण्येवाधिकारस्ते मा फलेषु कदाचन। — कृष्ण",
            "Красота спасёт мир. — Достоевский",
            "Если хочешь быть счастливым, будь им. — Толстой",
            "Μῆνιν ἄειδε θεά. — Ὅμηρος",
            "Ein Buch muss die Axt sein für das gefrorene Meer in uns. — Kafka",
            "ša maqū — Sîn-lēqi-unninni",
            "Vi er ikke mennesker. Vi er menneskeblivere. — Peter Wessel Zapffe",
            "生存是文明的第一需要。 — 刘慈欣",
            "Οὐδὲν βλάπτει τὴν ψυχήν τὸ συμβαῖνον. — Μάρκος Αὐρήλιος",
            "Arma virumque cano. — Vergilius",
            "تَجْرِي الرِّيَاحُ بِمَا لَا تَشْتَهِيهِ السُّفُنُ — المتنبي",
            "கற்க கசடறக் கற்பவை கற்றபின் நிற்க அதற்குத் தக. — திருவள்ளுவர்",
            "אִם אֵין אֲנִי לִי, מִי לִי? וּכְשֶׁאֲנִי לְעַצְמִי, מָה אֲנִי? וְאִם לֹא עַכְשָׁיו, אֵימָתַי — הלל הזקן",
            // Journey to the West (吳承恩)
            "佛在靈山莫遠求，靈山只在汝心頭。 — 吳承恩",
            // Dream of the Red Chamber (曹雪芹)
            "假作真時真亦假，無為有處有還無。 — 曹雪芹",
            // Water Margin (施耐庵)
            "路見不平，拔刀相助。 — 施耐庵",
            // Kokoro (夏目漱石)
            "私はその人を常に先生と呼んでいた。 — 夏目漱石",
            // Walden (Henry David Thoreau)
            "The mass of men lead lives of quiet desperation. — Henry David Thoreau",
            // Ghost in the Shell (士郎正宗)
            "世界に不満があるなら自分を変えろ。それが嫌なら世界を変えろ。 — 士郎正宗",
            // Alfred Tennyson
            "To strive, to seek, to find, and not to yield. — Alfred Tennyson",
            // Simulacra and Simulation (Jean Baudrillard)
            "Le simulacre n'est jamais ce qui cache la vérité — c'est la vérité qui cache qu'il n'y en a pas. — Jean Baudrillard",
            // Immanuel Kant
            "Der gestirnte Himmel über mir und das moralische Gesetz in mir. — Immanuel Kant",
            // Plato
            "Οὐ γὰρ ὅμοιον, ὦ Σώκρατες, τὸ ἀδικεῖν τοῦ ἀδικεῖσθαι. — Πλάτων",
            // Jules Verne
            "Tout ce qui est impossible reste à accomplir. — Jules Verne",
            // Alexandre Dumas
            "Tous pour un, un pour tous ! — Alexandre Dumas",
            // George Orwell
            "All animals are equal, but some animals are more equal than others. — George Orwell",
            // Hermann Hesse
            "Ich kann denken, ich kann warten, ich kann fasten. — Hermann Hesse",
            // James Joyce
            "A man of genius makes no mistakes. His errors are volitional and are the portals of discovery. — James Joyce",
            // Kinoko Nasu (Kara no Kyoukai)
            "人の死は、それだけで尊い。 — 奈須きのこ",
            // Philip K. Dick
            "Reality is that which, when you stop believing in it, doesn't go away. — Philip K. Dick",
            // Frank Herbert
            "Fear is the mind-killer. — Frank Herbert",
            // Viktor Frankl
            "Everything can be taken from a man but one thing: the last of the human freedoms — to choose one's attitude in any given set of circumstances, to choose one's own way. — Viktor Frankl",
            // Yuval Noah Harari
            "Homo sapiens rules the world because it is the only animal that can believe in things that exist purely in its own imagination. — Yuval Noah Harari",
            // Yuval Noah Harari (קיצור תולדות האנושות, 2011)
            "בני אדם חושבים בסיפורים, לא בעובדות ולא במספרים. — יובל נח הררי",
            "כמו האבולוציה כך גם ההיסטוריה אדישה לאושרם של כלי המשחק שלה. — יובל נח הררי",
            // Paulo Coelho
            "Quando você quer alguma coisa, todo o Universo conspira para que você realize o seu desejo. — Paulo Coelho",
            // Neal Stephenson
            "The difference between stupid and intelligent people — and this is true whether or not they are well-educated — is that intelligent people can handle subtlety. — Neal Stephenson",
            // William Butler Yeats
            "I have spread my dreams under your feet; tread softly because you tread on my dreams. — William Butler Yeats",
            // Richard Dawkins (The Selfish Gene)
            "We are survival machines — robot vehicles blindly programmed to preserve the selfish molecules known as genes. — Richard Dawkins",
            // Leonardo da Vinci
            "La semplicità è la sofisticazione suprema. — Leonardo da Vinci",
            // Benjamin Franklin
            "An investment in knowledge pays the best interest. — Benjamin Franklin",
            // Warren Buffett
            "Price is what you pay. Value is what you get. — Warren Buffett",
            // Laozi (道德經)
            "道可道，非常道。 — 老子",
            // Rumi (Divan-e Shams)
            "بازآمدم، بازآمدم، از پیش آن یار آمدم — مولوی",
            // Matsuo Bashō
            "古池や 蛙飛びこむ 水の音 — 松尾芭蕉",
            // Alan Turing (Computing Machinery and Intelligence)
            "We can only see a short distance ahead, but we can see plenty there that needs to be done. — Alan Turing",
            // Mary Shelley (Frankenstein)
            "Nothing is so painful to the human mind as a great and sudden change. — Mary Shelley",
        ];

        // Guarantee every quote is shown: rotate through them in order across
        // visits, persisting the cursor in localStorage. Falls back to a
        // time-based index if storage is unavailable.
        let index;
        try {
            const stored = window.localStorage.getItem('footer-quote-index');
            index = stored ? parseInt(stored, 10) : 0;
            if (isNaN(index) || index < 0 || index >= quotes.length) index = 0;
        } catch (e) {
            index = Math.floor(Date.now() / 3600000) % quotes.length;
        }
        // Non-Latin quotes are tagged with their script's language so a screen
        // reader does not try to pronounce Greek, Arabic or Chinese as English.
        // Latin-script quotes are left untagged: the script alone cannot tell
        // Italian from Spanish, and a wrong tag is worse than none.
        const SCRIPT_LANGS = [
            [/[\u0370-\u03FF\u1F00-\u1FFF]/, 'el'],
            [/[\u0400-\u04FF]/, 'ru'],
            [/[\u0590-\u05FF]/, 'he'],
            [/[\u3040-\u30FF]/, 'ja'],
            [/[\uAC00-\uD7AF]/, 'ko'],
            [/[\u3400-\u4DBF\u4E00-\u9FFF]/, 'zh'],
            [/[\u0900-\u097F]/, 'sa'],
            [/[\u0B80-\u0BFF]/, 'ta'],
            [/[\u0600-\u06FF\u0750-\u077F]/, 'ar']
        ];

        function scriptLang(text) {
            for (var i = 0; i < SCRIPT_LANGS.length; i++) {
                if (SCRIPT_LANGS[i][0].test(text)) {
                    // Persian shares the Arabic script but uses these letters.
                    if (SCRIPT_LANGS[i][1] === 'ar' && /[\u067E\u0686\u0698\u06AF\u06A9]/.test(text)) {
                        return 'fa';
                    }
                    return SCRIPT_LANGS[i][1];
                }
            }
            return '';
        }

        // The typing effect in hero-typed.js re-renders the quote from its text,
        // so the language goes on the element itself rather than a wrapper span.
        const lang = scriptLang(quotes[index]);
        if (lang) {
            transmission.setAttribute('lang', lang);
        } else {
            transmission.removeAttribute('lang');
        }
        transmission.textContent = quotes[index];
        try {
            window.localStorage.setItem('footer-quote-index', String((index + 1) % quotes.length));
        } catch (e) {}
    }
});
