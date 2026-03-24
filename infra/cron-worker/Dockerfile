FROM alpine:3.19

RUN apk add --no-cache curl tzdata

WORKDIR /app

COPY crontab /etc/crontabs/root
COPY call-cron.sh /app/call-cron.sh

RUN chmod +x /app/call-cron.sh \
 && touch /var/log/cron.log

# At runtime: dump env vars to a file the cron scripts can source,
# then start crond in the foreground and tail the log.
CMD sh -c 'printenv | grep -E "^(APP_URL|CRON_SECRET)=" > /app/.env.cron && crond -f -l 2 & tail -f /var/log/cron.log'
