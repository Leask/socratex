# Socrates

A Secure Web Proxy. Fast, secure, and easy to use.

Socrates extends the native [net.createServer](https://nodejs.org/api/net.html#net_net_createserver_options_connectionlistener), and it acts as a real transparent HTTPS-proxy built on top of TCP-level.

It's an real HTTPS proxy, not HTTPS over HTTP. It allows upstream client-request dynamically to other proxies or works as a single layer encrypted proxy.

It supports [Basic Proxy-Authentication](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Proxy-Authorization) and Token-Baased-Authentication as default.


## Deploy a Secure Web Proxy within 10 second

You need a domain name and set an A-record pointed to your cloud virtual machine.

Usually, that virtual machine can not be located in China.

Assumes that you have a workable Node.js (v16 or above) environment.

Now let's make the magic happen!

- Modern method:
```bash
$ sudo su
# cd ~
# npx socrates-x --domain=example.com --bypass=cn
```
- Classic method:
```bash
$ git clone git@github.com:Leask/socrates.git
$ cd socrates
$ npm install
$ sudo main.mjs --domain=example.com --bypass=cn
```

If every thing works fine, you should see a message like this:

```
[SOCRATES V1.8.11] https://github.com/Leask/socrates
[SOCRATES] Secure Web Proxy started at https://example.com:443 (IPv6 ::).
[SOCRATES] HTTP Server started at http://example.com:80 (IPv6 ::).
[SOCRATES 2022-04-09T07:00:48.946Z] Restored 0 session(s).
[SSL] Creating new private-key and CSR...
[SSL] Done.
[SSL] Updating certificate...
[SSL] Done.
[SOCRATES] PAC: https://example.com/wpad.dat?token=959c298e-9f38-b201-2e7e-14af54469889
[SOCRATES] Log: https://example.com/log?token=959c298e-9f38-b201-2e7e-14af54469889
```

Copy the `PAC url` and paste it into your system's `Automatic Proxy Configuration` settings. That is all you need to do.

You can also use the `log url` to monitor the system's activity.

*Why not use `sudo npx ...` directly?*: Socrates works at default HTTP (80) and HTTPS (443) ports. You need to be root to listen at these ports on some systems. Because of this issue: https://github.com/npm/cli/issues/3110, if you are in a folder NOT OWN by root, you CAN NOT use `sudo npm ...` or `sudo npx ...` directly to run socrates-x.


```
///////////////////////////////////////////////////////////////////////////////////////
// YOU DON'T NEED TO READ ANYTHING BELOW IF YOU ARE NOT GOING TO CUSTOMIZE THE PROXY //
///////////////////////////////////////////////////////////////////////////////////////
```


## Programmable Proxy

You can also use socrates-x as a programmable proxy to meed your own needs.

```bash
$ npm i -s socrates-x
```

Socrates is a ES6 module, so you can use it in your modern Node.js projects.

```javascript
import { Socrates } from 'socrates-x';

const [port, address, options] = ['4698', '': {}];

const socrates = new Socrates(options);

socrates.listen(port, address, async () => {
    console.log('TCP-Proxy-Server started at: ', server.address());
});
```


### Options object use to customize the proxy

`options` should be an object.

| Param  | Type                | Description  |
| ------ | ------------------- | ------------ |
| basicAuth | <code>Function/AsyncFunction</code> | Activate/Handle Proxy-Authentication. Returns or solves to Boolean. |
| tokenAuth | <code>Function/AsyncFunction</code> | Activate/Handle Proxy-Authentication. Returns or solves to Boolean. |
| upstream | <code>Function/AsyncFunction</code> | The proxy to be used to upstreaming requests. Returns String. |
| tcpOutgoingAddress | <code>Function/AsyncFunction</code> | The localAddress to use while sending requests. Returns String. |
| injectData | <code>Function/AsyncFunction</code> | The edited data to upstream. Returns Buffer or string. |
| injectResponse | <code>Function/AsyncFunction</code> | The edited response to return to connected client. Returns Buffer or string. |
| keys | <code>Function/AsyncFunction</code> | The keys to use while handshake. It will work only if intercept is true. Returns Object or false. |
| logLevel | <code>Number</code> | Default 0 to log all messages. |
| intercept | <code>Boolean</code> | Activate interception of encrypted communications. False as default. |


### `upstream`, `tcpOutgoingAddress`, `injectData` & `injectResponse` Options

The options are functions having follow parameters:

| Param  | Type                | Description  |
| ------ | ------------------- | ------------ |
| data | <code>Buffer</code> | The received data. |
| session | <code>Session</code> | Object containing info/data about Tunnel. |

- upstream-Function need to return/resolve a String with format -> `IP:PORT` or `USER:PWD@IP:PORT` of used http-proxy. If *'localhost'* is returned/resolved, then the host-self will be used as proxy.
- tcpOutgoingAddress-Function need to return a String with format -> `IP`.
- injectData-Function need to return a String or buffer for the new spoofed data. This will be upstreamed as request.
- injectResponse-Function need to return a String or buffer for the new received data.

*Note*: These functions will be executed before first tcp-socket-connection is established.


### Upstream to other proxies

If you don't want to use the host of active instance self, then you need to upstream connections to another http-proxy.
This can be done with `upstream` attribute.

```javascript
const options = {
    upstream: async () => { return 'x.x.x.x:3128'; },
};
```

### The Basic Authorization mechanism

This activate basic authorization mechanism.
The Auth-function will be executed while handling Proxy-Authentications.

| Param  | Type                | Description  |
| ------ | ------------------- | ------------ |
|username | <code>String</code> |  The client username. |
|password | <code>String</code> |  The client password |
|session | <code>Session</code> |  Object containing info/data about Tunnel |

*Note*: It needs to return True/False or a **Promise** that resolves to boolean (*isAuthenticated*).

```javascript
const options = {
    basicAuth: async (user, password) => user === 'bar' && password === 'foo';
};
```

### The Token Authorization mechanism

This activate token authorization mechanism.
The Auth-function will be executed while handling Proxy-Authentications.

| Param  | Type                | Description  |
| ------ | ------------------- | ------------ |
| token | <code>String</code> |  The client token. |
| session | <code>Session</code> |  Object containing info/data about Tunnel |

*Note*: It needs to return True/False or a **Promise** that resolves to boolean (*isAuthenticated*).

```javascript
const options = {
    tokenAuth: async (token) => token === 'a-very-long-token';
};
```

### Interception

This feature is in very early stage, and it's for web development only. The callbacks `injectData` & `injectResponse` could be used to intercept/spoof communication. These functions are executed with the `data` and `session` arguments.

### Intercepting HTTPS

The boolean attribute `intercept` allows to break SSL-Communication between Source & Destination. This will activate Security-Alarm by most used browsers.

```javascript
const [uaToSwitch, switchWith] = ['curl 7.79.1', 'a-fake-user-agent'];
const options = {
    intercept: true,
    injectData(data, session) {
        if (session.isHttps && data.toString().match(uaToSwitch)) {
            return Buffer.from(data.toString().replace(uaToSwitch, switchWith));
        }
        return data;
    },
};
```

```bash
curl -x localhost:8080 -k http://ifconfig.io/ua
curl 7.79.1

curl -x localhost:8080 -k https://ifconfig.me/ua
a-fake-user-agent
```


### The `keys` Function

You can use this option to provide your own self-signed certificate.

If activated needs to return an Object `{key:'String', cert:'String'}` like [native tls_connect_options.key & tls_connect_options.cert](https://nodejs.org/api/tls.html#tls_tls_connect_options_callback) or `false` statement.

If no object is returned, then [default keys](https://github.com/Leask/socrates/tree/main/keys) will be used to update communication.

| Param  | Type                | Description  |
| ------ | ------------------- | ------------ |
| session | <code>Session</code> | Object containing info/data about Tunnel. |

*Note*: This function will be executed before TLS-Handshake.

### Session-Instance

The Session-Instance is a Object containing info/data about Tunnel.

Use `.getConnections()` to get the current connections.

```javascript
setInterval(() => {
    const connections = socrates.getConnections();
    console.log([new Date()], 'OPEN =>', Object.keys(connections).length)
}, 3000);
```

The connection items in the connections array include useful attributes/methods:

- isHttps - Is session encrypted.
- getTunnelStats() - Get Stats for this tunnel
- getId() - Get Own ID-Session
- isAuthenticated() - Is the session authenticated by user or not.
- ... (More APIS tobe documented)


### Dynamically Routing

This example upstreams only requests for ifconfig.me to another proxy, for all other requests will be used localhost.

```javascript
const options = {
    upstream(data, session) {
        return data.toString().includes('ifconfig.me')
            ? 'x.x.x.x:3128' : 'localhost';
    },
});
```

Testing with `curl`:

```bash
curl -x 127.0.0.1:8080 https://ifconfig.me
x.x.x.x

curl -x 127.0.0.1:8080 https://ifconfig.co
y.y.y.y
```
