# Syntax=docker/dockerfile:1
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev

COPY . .

ENV NODE_ENV=production

EXPOSE 4007
ENV PORT=${PORT:-4007}

CMD ["sh", "-c", "npm run start"]
