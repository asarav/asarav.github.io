$(document).ready(function () {
    init();
});

function init() {
    console.log('Main loaded');
    $('#navigation').load('src/html/partials/nav.html');
    fillContent();

}

function fillContent() {
    var path = window.location.pathname;
    if(containsSubstring(path, 'index.html') || path === '/') {
        $('#content').load('src/html/partials/home.html');
    } else if(containsSubstring(path, 'games.html')) {
        $('#content').load('src/html/partials/games-list.html')
    }
}

function containsSubstring(container, substring) {
    return container.indexOf(substring) !== -1;
}