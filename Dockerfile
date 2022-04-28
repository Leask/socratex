FROM node:current-alpine

LABEL org.opencontainers.image.version=v1.x.y
LABEL org.opencontainers.image.title=Socratex
LABEL org.opencontainers.image.description="A Secure Web Proxy. Which is fast, secure, and easy to use."
LABEL org.opencontainers.image.url="https://github.com/Leask/socratex"
LABEL org.opencontainers.image.documentation="https://github.com/Leask/socratex"
LABEL org.opencontainers.image.vendor="@LeaskH"
LABEL org.opencontainers.image.licenses=MIT
LABEL org.opencontainers.image.source="https://github.com/Leask/socratex"

RUN npm install -g socratex

EXPOSE 80
EXPOSE 443

ENTRYPOINT ["socratex"]
