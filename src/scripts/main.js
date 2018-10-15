$(document).ready(function () {
    init();

    // $( '#games-nav' ).click(function() {
    //     alert( "Handler for .click() called." );
    // });
    
    // $( '#contact-nav' ).click(function() {
    //     console.log("hi");
    //     $('#content').load('src/html/contact.html');
    // });
});

function init() {
    console.log('Main');
    $('#navigation').load('src/html/nav.html');
    $('#content').load('src/html/home.html');
}