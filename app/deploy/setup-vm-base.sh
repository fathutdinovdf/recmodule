#!/usr/bin/env bash
# Базовая настройка VM под демо-стенд — без домена и без nginx/certbot.
# Приложение поднимается сразу на :3100, снаружи открыт напрямую.
# HTTPS по домену — отдельным шагом, см. setup-vm-tls.sh, когда домен появится.
#
# Запускать на самой VM от sudo: sudo bash setup-vm-base.sh
set -euo pipefail

APP_DIR=/opt/recmodule
REPO_URL="${REPO_URL:-git@github.com:fathutdinovdf/recmodule.git}"

apt-get update
apt-get install -y ca-certificates curl gnupg git

# Docker (только сервис db из docker-compose.yml). Ставим из репозитория
# Ubuntu (тот же mirror.yandex.ru), а не с download.docker.com — этот хост
# из России стабильно не отвечает по 443, версия из Ubuntu для БД в
# docker-compose более чем достаточна.
apt-get install -y docker.io docker-compose-v2

# registry-1.docker.io тоже не отвечает из России — без зеркала `docker pull`
# виснет по таймауту на самом первом шаге.
mkdir -p /etc/docker
cat > /etc/docker/daemon.json <<'JSON'
{
  "registry-mirrors": ["https://mirror.gcr.io"]
}
JSON
systemctl restart docker

# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Сервисный пользователь и код. Домашний каталог — отдельно от $APP_DIR:
# туда попадёт ключ (.ssh), а git clone требует под собой пустую директорию.
id -u recmodule &>/dev/null || useradd -r -m -d /home/recmodule -s /usr/sbin/nologin recmodule
usermod -aG docker recmodule
mkdir -p "$APP_DIR"
chown recmodule:recmodule "$APP_DIR"

# Приватный репозиторий — клонируем по SSH через deploy-key. Ключ свой у
# каждой VM: если сгенерировать его локально и просто скопировать, придётся
# синхронизировать ключ вручную при пересоздании VM, а так каждая машина
# сама заводит себе ключ и просит добавить его в GitHub.
SSH_KEY="/home/recmodule/.ssh/id_ed25519"
if [ ! -f "$SSH_KEY" ]; then
  sudo -u recmodule mkdir -p /home/recmodule/.ssh
  sudo -u recmodule ssh-keygen -t ed25519 -f "$SSH_KEY" -N "" -C "recmodule-vm-$(date +%F)"
  # Редирект внутри -c: снаружи `sudo -u recmodule cmd >> file` пишет файл
  # от имени root (это внешняя оболочка открывает дескриптор), и git
  # потом не может обновить его от recmodule — Operation not permitted.
  sudo -u recmodule bash -c 'ssh-keyscan -H github.com >> /home/recmodule/.ssh/known_hosts 2>/dev/null'
fi
chown -R recmodule:recmodule /home/recmodule/.ssh

if [ ! -d "$APP_DIR/.git" ]; then
  echo
  echo "Добавьте этот публичный ключ как Deploy key репозитория (без права записи):"
  echo "GitHub → репозиторий → Settings → Deploy keys → Add deploy key"
  echo
  cat "$SSH_KEY.pub"
  echo
  read -rp "Нажмите Enter, когда ключ добавлен в GitHub..."
fi

export GIT_SSH_COMMAND="ssh -i $SSH_KEY -o IdentitiesOnly=yes"
if [ -d "$APP_DIR/.git" ]; then
  sudo -u recmodule env GIT_SSH_COMMAND="$GIT_SSH_COMMAND" git -C "$APP_DIR" pull
else
  sudo -u recmodule env GIT_SSH_COMMAND="$GIT_SSH_COMMAND" git clone "$REPO_URL" "$APP_DIR"
fi

echo
echo "Готово. Дальше вручную:"
echo "1. Заполнить $APP_DIR/app/.env.production (шаблон — deploy/.env.production.example)"
echo "2. cd $APP_DIR/app && sudo -u recmodule docker compose up -d   # поднять Postgres"
echo "3. sudo -u recmodule npm --prefix $APP_DIR/app ci"
echo "4. sudo -u recmodule npm --prefix $APP_DIR/app run db:migrate -- --baseline   # или без --baseline на пустой базе"
echo "5. sudo -u recmodule npm --prefix $APP_DIR/app run db:seed   # демо-данные"
echo "6. sudo -u recmodule npm --prefix $APP_DIR/app run build"
echo "7. cp deploy/recmodule.service /etc/systemd/system/ && systemctl daemon-reload && systemctl enable --now recmodule"
echo
echo "После шага 7 приложение доступно на http://<публичный IP>:3100"
echo "Домен и HTTPS — отдельно, позже: deploy/setup-vm-tls.sh <домен>"
