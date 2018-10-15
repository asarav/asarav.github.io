$(document).ready(function () {
    init();
});

function init() {
    console.log('Main');
    $('#navigation').load('src/html/partials/nav.html');
    $('#content').load('src/html/partials/home.html');
}