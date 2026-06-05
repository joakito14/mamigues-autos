FROM node:22-alpine

WORKDIR /app

# Dependencias del sistema para better-sqlite3
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

EXPOSE 3000

COPY start.sh ./
RUN chmod +x start.sh

CMD ["sh", "start.sh"]
