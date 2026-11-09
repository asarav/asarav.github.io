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
            "Lasciate ogne speranza, voi ch'intrate. \u2014 Dante Alighieri",
            "Any sufficiently advanced technology is indistinguishable from magic. \u2014 Arthur C. Clarke",
            "Siempre imagin\u00e9 que el Para\u00edso ser\u00eda alg\u00fan tipo de biblioteca. \u2014 Jorge Luis Borges",
            "The universe is under no obligation to make sense to you. \u2014 Neil deGrasse Tyson",
            "We are a way for the cosmos to know itself. \u2014 Carl Sagan",
            "All the world's a stage, and all the men and women merely players. \u2014 William Shakespeare",
            "The only way to discover the limits of the possible is to go beyond them into the impossible. \u2014 Arthur C. Clarke",
            "In the beginning the Universe was created. This has made a lot of people very angry and been widely regarded as a bad move. \u2014 Douglas Adams",
            "Do not go gentle into that good night. \u2014 Dylan Thomas",
            "\u03bf \u03b4 \u03b5 \u03b1\u03bd\u03b5\u03c8\u03b5\u03c4\u03bf\u03c2 \u03b2\u03af\u03bf\u03c2 \u03bf\u03c5 \u03b2\u03b9\u03c9\u03c4\u03cc\u03c2 \u03b1\u03bd\u03b8\u03c1\u03c9\u03c0\u03cc. \u2014 \u03a3\u03c9\u03ba\u03c1\u03b1\u03c4\u03b7\u03c2",
            "Cogito, ergo sum. \u2014 Ren\u00e9 Descartes",
            "The cosmos is within us. We are made of star-stuff. \u2014 Carl Sagan",
            "\u1f29 \u03c8\u03c5\u03c7\u1f74 \u03b2\u03ac\u03c0\u03c4\u03b5\u03c4\u03b1\u03b9 \u03c4\u03bf\u1f76\u03c2 \u1f10\u03c0\u03b9\u03bd\u03bf\u03b7\u03bc\u03b1\u03c3\u03b9\u03c2. \u2014 \u039c\u03ac\u03c1\u03ba\u03bf\u03c2 \u0391\u1f50\u03c1\u03ae\u03bb\u03b9\u03bf\u03c2",
            "The future is already here \u2014 it's just not very evenly distributed. \u2014 William Gibson",
            "Was mich nicht umbringt, macht mich st\u00e4rker. \u2014 Friedrich Nietzsche",
            "L'enfer, c'est les autres. \u2014 Jean-Paul Sartre",
            "Phantasie ist wichtiger als Wissen. \u2014 Albert Einstein",
            "The important thing is not to stop questioning. Curiosity has its own reason for existing. \u2014 Albert Einstein",
            "Die Sprache ist das Haus des Seins. \u2014 Martin Heidegger",
            "Il faut imaginer Sisyphe heureux. \u2014 Albert Camus",
            "Sabbe sattā sukhī hontu. — गौतम बुद्ध",
            "Hope is the thing with feathers that perches in the soul. \u2014 Emily Dickinson",
            "Au milieu de l'hiver, j'ai d\u00e9couvert en moi un invincible \u00e9t\u00e9. \u2014 Albert Camus",
            "I am large, I contain multitudes. \u2014 Walt Whitman",
            "「己所不欲，勿施於人」 \u2014 孔子",
            "「天下大勢，分久必合，合久必分」 \u2014 羅貫中",
            "「吾生也有涯，而知也無涯」 \u2014 莊子",
            "「私は人間をやめた。」 \u2014 太宰治",
            "「和を以て貴しとなす」 \u2014 聖徳太子",
            "कर्मण्येवाधिकारस्ते मा फलेषु कदाचन. — कृष्ण",
            "Красота спасёт мир. — Достоевский",
            "Если хочешь быть счастливым, быть им. — Толстой",
            "Μῆνιν ἄειδε θεά. — Ὅμηρος",
            "Ein Buch muss die Axt sein für das gefrorene Meer in uns. — Kafka",
            "ša maqū — Sîn-lēqi-unninni",
            "Vi er ikke mennesker. Vi er menneskeblivere. — Peter Wessel Zapfe",
            "生存是文明的第一需要。 — 刘慈欣",
            "Οὐδὲν βλάπτει τὴν ψυχήν τὸ συμβαῖνον. — Μάρκος Αὐρήλιος",
            "Arma virumque cano. — Vergilius",
            "تَجْرِي الرِّيَاحُ بِمَا لَا تَشْتَهِيهِ السُّفُنُ — المتنبي",
            "கற்க கசடறக் கற்பவை கற்றபின் நிற்க அதற்குத் தக — திருவள்ளுவர்",
            "אִם אֵין אֲנִי לִי, מִי לִי? וּכְשֶׁאֲנִי לְעַצְמִי, מָה אֲנִי? וְאִם לֹא עַכְשָׁיו, אֵימָתַי — הלל הזקן",
        ];
        const hour = Math.floor(Date.now() / 3600000);
        transmission.textContent = quotes[hour % quotes.length];
    }
});