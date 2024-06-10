(function() {
    let url = window.location.hash.substring(1)
    if (!url) {
        // pre-populate the url based on the host that served this page.
        url = document.location.host
    }
    window.webrepl_url = 'ws://' + url

    fetch('ViperIDE.html')
        .then(rsp => rsp.text() )
        .then(data => document.write(data))
})();
