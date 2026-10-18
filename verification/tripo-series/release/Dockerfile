FROM wardrowbe-frontend:tripo-series-20261018-r3-base
USER root
COPY public-assets.part-* public-assets.sha256 /tmp/dada-public/
RUN cat /tmp/dada-public/public-assets.part-* | tar -xz -C public && sha256sum -c /tmp/dada-public/public-assets.sha256 && rm -rf /tmp/dada-public
