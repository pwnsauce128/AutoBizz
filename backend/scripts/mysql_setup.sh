#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKEND_DIR="${PROJECT_ROOT}/backend"

print_title() {
  local title="$1"
  printf "\n%s\n%s\n" "$title" "${title//?/=}"
}

prompt() {
  local text="$1"
  local default_value="${2:-}"
  local response
  if [[ -n "$default_value" ]]; then
    read -r -p "${text} [${default_value}]: " response
    response="${response:-$default_value}"
  else
    read -r -p "${text}: " response
  fi
  printf "%s" "$response"
}

prompt_secret() {
  local text="$1"
  local response
  read -r -s -p "${text}: " response
  printf "\n" >&2
  printf "%s" "$response"
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

install_mysql() {
  if command -v mysql >/dev/null 2>&1; then
    echo "MySQL client already installed."
    return
  fi

  if [[ "${OSTYPE}" == "linux-gnu"* ]]; then
    if command -v apt-get >/dev/null 2>&1; then
      echo "Installing MariaDB server + client via apt-get..."
      sudo apt-get update
      sudo apt-get install -y mariadb-server mariadb-client-compat
    elif command -v dnf >/dev/null 2>&1; then
      echo "Installing MariaDB server + client via dnf..."
      sudo dnf install -y mariadb-server mariadb
      sudo systemctl enable --now mysqld
    else
      echo "Unsupported Linux package manager. Install MySQL manually." >&2
      exit 1
    fi
  elif [[ "${OSTYPE}" == "darwin"* ]]; then
    if command -v brew >/dev/null 2>&1; then
      echo "Installing MySQL via Homebrew..."
      brew install mysql
      brew services start mysql
    else
      echo "Homebrew not found. Install MySQL manually." >&2
      exit 1
    fi
  else
    echo "Unsupported OS. Install MySQL manually." >&2
    exit 1
  fi
}

create_database_and_user() {
  local root_user="$1"
  local root_password="$2"
  local db_name="$3"
  local app_user="$4"
  local app_password="$5"
  local host="$6"

  local mysql_cmd=(mysql -u"${root_user}" -h"${host}")
  if [[ -n "$root_password" ]]; then
    mysql_cmd+=("-p${root_password}")
  fi

  "${mysql_cmd[@]}" <<SQL
CREATE DATABASE IF NOT EXISTS \`${db_name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${app_user}'@'%' IDENTIFIED BY '${app_password}';
GRANT ALL PRIVILEGES ON \`${db_name}\`.* TO '${app_user}'@'%';
FLUSH PRIVILEGES;
SQL
}

write_env_file() {
  local env_path="$1"
  local db_url="$2"
  local jwt_secret="$3"
  local cors_origins="$4"

  mkdir -p "$(dirname "$env_path")"
  {
    printf "DATABASE_URL=%s\n" "$db_url"
    printf "JWT_SECRET_KEY=%s\n" "$jwt_secret"
    if [[ -n "$cors_origins" ]]; then
      printf "CORS_ORIGINS=%s\n" "$cors_origins"
    fi
  } > "$env_path"
  echo "Wrote environment file to ${env_path}"
}

print_title "AutoBet MySQL setup"

install_mysql
require_command mysql

root_user=$(prompt "MySQL admin username" "root")
root_password=$(prompt_secret "MySQL admin password (leave blank if none)")
mysql_host=$(prompt "MySQL host" "127.0.0.1")
mysql_port=$(prompt "MySQL port" "3306")

db_name=$(prompt "AutoBet database name" "autobet")
app_user=$(prompt "AutoBet database user" "autobet_user")
app_password=$(prompt_secret "AutoBet database user password")

print_title "Creating database and user"
create_database_and_user "$root_user" "$root_password" "$db_name" "$app_user" "$app_password" "$mysql_host"

print_title "Python dependencies"
if [[ -f "${BACKEND_DIR}/requirements.txt" ]]; then
  python -m pip install -r "${BACKEND_DIR}/requirements.txt"
fi
python -m pip install pymysql

jwt_secret=$(prompt "JWT secret" "change-me")
cors_origins=$(prompt "CORS origins (comma separated, leave blank for '*')" "")

print_title "Writing environment file"
config_path=$(prompt "Environment file path" "${BACKEND_DIR}/.env.production")
database_url="mysql+pymysql://${app_user}:${app_password}@${mysql_host}:${mysql_port}/${db_name}"
write_env_file "$config_path" "$database_url" "$jwt_secret" "$cors_origins"

print_title "Next steps"
echo "1) Export DATABASE_URL and JWT_SECRET_KEY if you didn't write an env file."
echo "2) Run: python ${BACKEND_DIR}/run.py"
echo "3) Or with gunicorn: gunicorn --chdir ${BACKEND_DIR} \"app:create_app()\" --bind 0.0.0.0:8000"
