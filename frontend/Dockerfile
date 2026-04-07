# syntax=docker/dockerfile:1
FROM node:20-alpine AS builder
WORKDIR /app

# Build shared package so file: dependency can be resolved during frontend install
COPY packages/shared ./packages/shared
RUN cd packages/shared && npm install && npm run build

WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend ./
ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    NEXT_SHARP_PATH=/app/node_modules/sharp

COPY --from=builder /app/frontend/public ./public
COPY --from=builder /app/frontend/.next/standalone ./
COPY --from=builder /app/frontend/.next/static ./.next/static

EXPOSE 3000

CMD ["node", "server.js"]
