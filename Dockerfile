FROM node:22-alpine

WORKDIR /app

# Dependencias del sistema para better-sqlite3
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

EXPOSE 3000

# Arranca el bot en background y Next.js en foreground usando PORT de Railway
CMD ["sh", "-c", "npm run start:bot & next start -p ${PORT:-3000}"]
