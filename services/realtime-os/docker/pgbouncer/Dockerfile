FROM alpine:3.21
RUN apk add --no-cache pgbouncer postgresql-client
COPY pgbouncer.ini /etc/pgbouncer/pgbouncer.ini
COPY entrypoint.sh /usr/local/bin/pgbouncer-entrypoint
RUN chmod 0755 /usr/local/bin/pgbouncer-entrypoint \
  && chown -R pgbouncer:pgbouncer /etc/pgbouncer
USER pgbouncer
ENTRYPOINT ["/usr/local/bin/pgbouncer-entrypoint"]
