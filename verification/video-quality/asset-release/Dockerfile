FROM wardrowbe-frontend:video-quality-20261018
USER root
COPY female.glb.gz /tmp/dada-avatar.glb.gz
RUN gzip -dc /tmp/dada-avatar.glb.gz > public/models/avatar/v2/female.glb && echo "8817471e3f5fe71b96fcd8eb15c246a523b33b0b3b22a575d8d93e389ec5e458  public/models/avatar/v2/female.glb" | sha256sum -c - && rm /tmp/dada-avatar.glb.gz
