FROM wardrowbe-frontend:ui-content-20261018-r3
USER root
COPY runtime.tar.gz /tmp/dada-runtime.tar.gz
RUN rm -rf /app/.next && tar -xzf /tmp/dada-runtime.tar.gz -C /app && rm /tmp/dada-runtime.tar.gz && mkdir -p /app/.next/cache && chown nextjs:nodejs /app/.next/cache
