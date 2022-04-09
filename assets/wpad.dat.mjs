// Socrates by @LeaskH
// https://github.com/Leask/socrates

function FindProxyForURL(url, host) {

    var bypass = {
        '127.0.0.1': 1,
        'localhost': 1,
        //{{BYPASS}}
    };

    if (isPlainHostName(host) || bypass[host]) {
        return 'DIRECT';
    }

    return '{{PROXY}}';

}
