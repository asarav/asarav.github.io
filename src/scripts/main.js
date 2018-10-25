$(document).ready(function () {
    init();
});

function init() {
    console.log('Main loaded');
    $('#navigation').load('src/html/partials/nav.html');
    $('#footer').load('src/html/partials/footer.html');
    fillContent();

}

function fillContent() {
    var path = window.location.pathname;
    if(containsSubstring(path, 'index.html') || path === '/') {
        $('#content').load('src/html/partials/home.html');
    } else if(containsSubstring(path, 'games.html')) {
        $('#content').load('src/html/partials/games-list.html')
    } else if(containsSubstring(path, 'contact.html')) {
        $('#content').load('src/html/partials/contact-info.html');
    } else if(containsSubstring(path, 'about-me.html')) {
        $('#content').load('src/html/partials/about-info.html');
    } else if(containsSubstring(path, 'music.html')) {
        $('#content').load('src/html/partials/music-list.html');
    } else if(containsSubstring(path, 'projects.html')) {
        $('#content').load('src/html/partials/projects-list.html')
    }
}

function containsSubstring(container, substring) {
    return container.indexOf(substring) !== -1;
}