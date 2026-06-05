#!/bin/sh
set -e

echo "[startup] Iniciando MaMigues ventas..."
echo "[startup] PORT=${PORT:-3000}"
echo "[startup] NODE_ENV=${NODE_ENV}"

# Crear directorios de datos si no existen
mkdir -p /app/data /app/auth

# Arrancar el bot en background (si falla, Next.js sigue corriendo)
echo "[startup] Iniciando bot de WhatsApp en background..."
npm run start:bot &
BOT_PID=$!
echo "[startup] Bot PID: $BOT_PID"

# Arrancar Next.js en foreground (npm run start agrega node_modules/.bin al PATH)
echo "[startup] Iniciando Next.js en puerto ${PORT:-3000}..."
exec npm run start
