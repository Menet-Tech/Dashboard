#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$ROOT_DIR/.env"
EXAMPLE_ENV="$ROOT_DIR/.env.example"
DB_SQL="$ROOT_DIR/database1.sql"
CURRENT_USER="${SUDO_USER:-$(id -un)}"
PHP_BIN="$(command -v php || true)"
COMPOSER_BIN="$(command -v composer || true)"
MYSQL_BIN="$(command -v mysql || true)"
NPM_BIN="$(command -v npm 2>/dev/null || true)"
SUDO_CMD=""
if [ "${EUID:-0}" -ne 0 ]; then
  SUDO_CMD="sudo"
fi

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

prompt() {
  local prompt_text="$1"
  local default_value="$2"
  local input
  if [ -n "$default_value" ]; then
    read -rp "$prompt_text [$default_value]: " input
  else
    read -rp "$prompt_text: " input
  fi
  if [ -z "$input" ]; then
    printf '%s' "$default_value"
  else
    printf '%s' "$input"
  fi
}

confirm() {
  local prompt_text="$1"
  local default_answer="${2:-n}"
  local answer
  read -rp "$prompt_text [y/N]: " answer
  answer="${answer:-$default_answer}"
  case "${answer,,}" in
    y|yes) return 0 ;; 
    *) return 1 ;; 
  esac
}

get_env_value() {
  local key="$1"
  if [ -f "$ENV_FILE" ]; then
    grep -E "^${key}=" "$ENV_FILE" | tail -n1 | cut -d'=' -f2- | sed 's/^"//; s/"$//'
  fi
}

ensure_command() {
  if ! command_exists "$1"; then
    fail "$1 is not installed. Please install it and re-run this script."
  fi
}

detect_package_manager() {
  if command_exists apt-get; then
    printf 'apt'
  elif command_exists dnf; then
    printf 'dnf'
  elif command_exists yum; then
    printf 'yum'
  elif command_exists zypper; then
    printf 'zypper'
  else
    printf ''
  fi
}

install_packages() {
  local manager="$1"
  shift
  local packages=()
  case "$manager" in
    apt)
      packages=("$@" )
      ${SUDO_CMD:+$SUDO_CMD }apt-get update
      ${SUDO_CMD:+$SUDO_CMD }apt-get install -y "${packages[@]}"
      ;;
    dnf)
      packages=("$@" )
      ${SUDO_CMD:+$SUDO_CMD }dnf install -y "${packages[@]}"
      ;;
    yum)
      packages=("$@" )
      ${SUDO_CMD:+$SUDO_CMD }yum install -y "${packages[@]}"
      ;;
    zypper)
      packages=("$@" )
      ${SUDO_CMD:+$SUDO_CMD }zypper refresh
      ${SUDO_CMD:+$SUDO_CMD }zypper install -y "${packages[@]}"
      ;;
    *)
      fail "Unsupported package manager: $manager"
      ;;
  esac
}

install_composer() {
  if [ -n "$PHP_BIN" ]; then
    echo "Installing Composer..."
    curl -sS https://getcomposer.org/installer | "$PHP_BIN" -- --install-dir=/usr/local/bin --filename=composer
  fi
}

refresh_bin_paths() {
  PHP_BIN="$(command -v php || true)"
  COMPOSER_BIN="$(command -v composer || true)"
  MYSQL_BIN="$(command -v mysql || true)"
  NPM_BIN="$(command -v npm 2>/dev/null || true)"
}

install_system_dependencies() {
  echo "Starting system dependency installation."
  echo "Current user: $(id -un), EUID=$EUID"
  echo "Detected binaries: PHP=$PHP_BIN, Composer=$COMPOSER_BIN, MySQL=$MYSQL_BIN, NPM=$NPM_BIN"
  echo "Using sudo: ${SUDO_CMD:-none}"

  local manager
  manager="$(detect_package_manager)"
  if [ -z "$manager" ]; then
    echo "No supported package manager found. Please install dependencies manually."
    return 1
  fi

  echo "Detected package manager: $manager"

  local pkg_list=()
  case "$manager" in
    apt)
      pkg_list=(php php-cli php-mbstring php-xml php-zip php-curl php-mysql unzip curl git default-mysql-client nodejs npm)
      ;;
    dnf|yum)
      pkg_list=(php php-cli php-mbstring php-xml php-zip php-curl php-mysqlnd unzip curl git mariadb nodejs npm)
      ;;
    zypper)
      pkg_list=(php7 php7-cli php7-mbstring php7-xml php7-zip php7-curl php7-mysql unzip curl git mariadb nodejs npm)
      ;;
  esac

  echo "Installing required OS packages: ${pkg_list[*]}"
  install_packages "$manager" "${pkg_list[@]}"

  refresh_bin_paths

  if [ -z "$COMPOSER_BIN" ]; then
    install_composer
    refresh_bin_paths
  fi

  if [ -z "$MYSQL_BIN" ]; then
    echo "MySQL client still not found after package installation."
    return 1
  fi

  if ! command_exists mysqld; then
    if confirm "Local MariaDB server is not installed. Install it now?" "y"; then
      case "$manager" in
        apt)
          ${SUDO_CMD:+$SUDO_CMD }apt-get install -y mariadb-server
          ;;
        dnf|yum)
          ${SUDO_CMD:+$SUDO_CMD }$manager install -y mariadb-server
          ;;
        zypper)
          ${SUDO_CMD:+$SUDO_CMD }zypper install -y mariadb-server
          ;;
      esac
    fi
  fi
}

printf '\n== Menet-Tech Dashboard installer ==\n\n'

if [ "$(uname -s)" != "Linux" ]; then
  printf 'Warning: this installer is designed for Linux.\n\n'
fi

if ! install_system_dependencies; then
  echo "Please install PHP, Composer, MySQL client, and other dependencies manually."
  exit 1
fi

ensure_command "$PHP_BIN"
ensure_command "$COMPOSER_BIN"
ensure_command "$MYSQL_BIN"

if [ ! -f "$EXAMPLE_ENV" ]; then
  fail ".env.example not found in project root."
fi

APP_ENV="production"
APP_DEBUG="false"
APP_URL="http://127.0.0.1:8080"
APP_TIMEZONE="Asia/Jakarta"
DB_HOST="127.0.0.1"
DB_PORT="3306"
DB_NAME="dashboard"
DB_USER="root"
DB_PASS=""
SESSION_NAME="menettech_session"

if [ -f "$ENV_FILE" ]; then
  echo ".env already exists."
  if confirm "Do you want to overwrite the existing .env file?" "n"; then
    rm -f "$ENV_FILE"
  else
    echo "Keeping existing .env. Skipping .env generation."
    DB_HOST="$(get_env_value 'DB_HOST' || echo "$DB_HOST")"
    DB_PORT="$(get_env_value 'DB_PORT' || echo "$DB_PORT")"
    DB_NAME="$(get_env_value 'DB_NAME' || echo "$DB_NAME")"
    DB_USER="$(get_env_value 'DB_USER' || echo "$DB_USER")"
    DB_PASS="$(get_env_value 'DB_PASS' || echo "$DB_PASS")"
    APP_URL="$(get_env_value 'APP_URL' || echo "$APP_URL")"
  fi
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "Creating new .env from .env.example..."
  APP_ENV="$(prompt 'APP_ENV' "$APP_ENV")"
  APP_DEBUG="$(prompt 'APP_DEBUG (true/false)' "$APP_DEBUG")"
  APP_URL="$(prompt 'APP_URL' "$APP_URL")"
  APP_TIMEZONE="$(prompt 'APP_TIMEZONE' "$APP_TIMEZONE")"
  DB_HOST="$(prompt 'DB_HOST' "$DB_HOST")"
  DB_PORT="$(prompt 'DB_PORT' "$DB_PORT")"
  DB_NAME="$(prompt 'DB_NAME' "$DB_NAME")"
  DB_USER="$(prompt 'DB_USER' "$DB_USER")"
  echo -n "DB_PASS: "
  read -rs DB_PASS
  echo
  SESSION_NAME="$(prompt 'SESSION_NAME' "$SESSION_NAME")"

  cat > "$ENV_FILE" <<EOF
APP_NAME="Menet-Tech Dashboard"
APP_ENV=$APP_ENV
APP_DEBUG=$APP_DEBUG
APP_URL=$APP_URL
APP_TIMEZONE=$APP_TIMEZONE

DB_HOST=$DB_HOST
DB_PORT=$DB_PORT
DB_NAME=$DB_NAME
DB_USER=$DB_USER
DB_PASS=$DB_PASS

SESSION_NAME=$SESSION_NAME

WA_GATEWAY_URL=http://localhost:3000
WA_API_KEY=
WA_ACCOUNT_ID=default
WA_FALLBACK_WA_ME=true

DISCORD_BILLING_URL=
DISCORD_ALERT_URL=
DISCORD_BOT_TOKEN=
DISCORD_APPLICATION_ID=
DISCORD_GUILD_ID=

MIKROTIK_HOST=192.168.88.1
MIKROTIK_USER=api
MIKROTIK_PASS=
MIKROTIK_PORT=8728
EOF
  echo ".env created."
fi

if [ ! -d "$ROOT_DIR/vendor" ]; then
  echo "Installing PHP dependencies with composer..."
  "$COMPOSER_BIN" install --no-interaction --prefer-dist
else
  echo "PHP dependencies already installed. Skipping composer install."
fi

if [ ! -d "$ROOT_DIR/discord-bot/node_modules" ]; then
  if [ -n "$NPM_BIN" ]; then
    if confirm "Install Discord bot dependencies?" "y"; then
      (cd "$ROOT_DIR/discord-bot" && "$NPM_BIN" install)
    fi
  else
    echo "npm not found; skipping Discord bot dependency installation."
  fi
fi

if [ ! -f "$DB_SQL" ]; then
  fail "database1.sql file not found in project root."
fi

echo "Configuring MySQL database..."
MYSQL_CMD=("$MYSQL_BIN" -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER")
if [ -n "$DB_PASS" ]; then
  MYSQL_CMD+=( -p"$DB_PASS" )
fi

SQL_CREATE_DB=$(printf 'CREATE DATABASE IF NOT EXISTS `%s` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;' "$DB_NAME")
printf '%s\n' "$SQL_CREATE_DB" | "${MYSQL_CMD[@]}"
"${MYSQL_CMD[@]}" "$DB_NAME" < "$DB_SQL"

echo "Database imported."

mkdir -p "$ROOT_DIR/public/uploads/payment-proofs"
mkdir -p "$ROOT_DIR/storage/backups"
chmod -R u+rw "$ROOT_DIR/public/uploads" "$ROOT_DIR/storage" || true

if confirm "Install systemd services for web, scheduler, and bot? (requires root or sudo)" "y"; then
  if [ "$EUID" -ne 0 ]; then
    if ! command_exists sudo; then
      fail "Service installation requires root or sudo privileges. Run this script with sudo."
    fi
  fi

  SERVICE_PATH="/etc/systemd/system"
  WEB_SERVICE="$SERVICE_PATH/menettech-app.service"
  CRON_SERVICE="$SERVICE_PATH/menettech-cron.service"
  CRON_TIMER="$SERVICE_PATH/menettech-cron.timer"
  BOT_SERVICE="$SERVICE_PATH/menettech-bot.service"

  install_service_file() {
    local dest="$1"
    local content="$2"
    if [ "$EUID" -ne 0 ]; then
      sudo bash -c "cat > '$dest' <<'EOF'
$content
EOF"
    else
      cat > "$dest" <<EOF
$content
EOF
    fi
  }

  APP_USER="$CURRENT_USER"
  install_service_file "$WEB_SERVICE" "[Unit]
Description=Menet-Tech Dashboard built-in PHP web server
After=network.target

[Service]
Type=simple
WorkingDirectory=$ROOT_DIR
ExecStart=$PHP_BIN -S 0.0.0.0:8080 '$ROOT_DIR/public/router.php'
Restart=on-failure
User=$APP_USER

[Install]
WantedBy=multi-user.target"

  install_service_file "$CRON_SERVICE" "[Unit]
Description=Menet-Tech Dashboard scheduler
After=network.target

[Service]
Type=simple
WorkingDirectory=$ROOT_DIR
ExecStart=$PHP_BIN '$ROOT_DIR/cron/scheduler.php'
Restart=on-failure
User=$APP_USER

[Install]
WantedBy=multi-user.target"

  install_service_file "$CRON_TIMER" "[Unit]
Description=Menet-Tech Dashboard scheduler timer

[Timer]
OnBootSec=1min
OnUnitActiveSec=1min
Persistent=true

[Install]
WantedBy=timers.target"

  if command_exists npm; then
    if confirm "Enable Discord bot service?" "n"; then
      install_service_file "$BOT_SERVICE" "[Unit]
Description=Menet-Tech Dashboard Discord bot
After=network.target

[Service]
Type=simple
WorkingDirectory=$ROOT_DIR/discord-bot
ExecStart=$NPM_BIN start
Restart=on-failure
User=$APP_USER
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target"
      if [ "$EUID" -ne 0 ]; then
        sudo systemctl daemon-reload
        sudo systemctl enable --now menettech-bot.service
      else
        systemctl daemon-reload
        systemctl enable --now menettech-bot.service
      fi
    fi
  fi

  if [ "$EUID" -ne 0 ]; then
    sudo systemctl daemon-reload
    sudo systemctl enable --now menettech-app.service
    sudo systemctl enable --now menettech-cron.timer
  else
    systemctl daemon-reload
    systemctl enable --now menettech-app.service
    systemctl enable --now menettech-cron.timer
  fi

  echo "Systemd services installed and enabled."
fi

echo "\nInstallasi selesai."
echo "- Akses aplikasi di: $APP_URL"
echo "- Jika layanan app dijalankan oleh systemd, periksa: systemctl status menettech-app.service"
echo "- Scheduler berjalan dari: systemctl status menettech-cron.timer"

exit 0
