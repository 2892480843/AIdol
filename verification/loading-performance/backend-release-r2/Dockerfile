FROM wardrowbe-backend:video-quality-20261018
USER root
COPY --chown=appuser:appuser s3.py /app/app/storage/s3.py
COPY --chown=appuser:appuser main.py /app/app/main.py
LABEL com.dada.performance-source-sha256="8d000e905fbf8a36c754c7fa894990f5839ce2d9d6ad309f1b6bb13e384ba6da"
