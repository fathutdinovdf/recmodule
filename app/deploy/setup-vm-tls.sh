#!/usr/bin/env bash
# Второй шаг — включить домен и HTTPS поверх уже работающего на :3100
# приложения (после setup-vm-base.sh). Ставит nginx как reverse-proxy и
# получает сертификат Let's Encrypt через certbot.
#
# Запускать на VM от sudo, когда домен куплен и A-запись указывает на IP VM:
# sudo bash setup-vm-tls.sh <домен>
set -euo pipefail

DOMAIN="${1:?Использование: setup-vm-tls.sh <домен, например demo.recmodule.ru>}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

apt-get update
apt-get install -y nginx certbot python3-certbot-nginx

sed "s/DOMAIN/$DOMAIN/g" "$SCRIPT_DIR/nginx.conf" > /etc/nginx/sites-available/recmodule
ln -sf /etc/nginx/sites-available/recmodule /etc/nginx/sites-enabled/recmodule
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "${CERTBOT_EMAIL:?Задайте CERTBOT_EMAIL=<ваш email> перед запуском}"

echo
echo "Готово: https://$DOMAIN"
echo "Порт 3100 теперь можно закрыть наружу в группе безопасности — трафик идёт через nginx (80/443)."
