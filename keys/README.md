# Self-signed Certificate

```bash
openssl req -x509 -sha256 -nodes -days 3650 -newkey rsa:2048 -keyout privateKey.key -out certificate.crt
Country Name (2 letter code) []:CA
State or Province Name (full name) []:Ontario
Locality Name (eg, city) []:Ottawa
Organization Name (eg, company) []:Leask Wong
Organizational Unit Name (eg, section) []:DEV
Common Name (eg, fully qualified host name) []:127.0.0.1
Email Address []:i@leaskh.com
```
