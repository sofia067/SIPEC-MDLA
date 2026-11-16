FROM node:22-alpine AS frontend-build
WORKDIR /build/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend ./
RUN npm run build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci --omit=dev
COPY backend/src ./src
COPY --from=frontend-build /build/frontend/dist ./frontend/dist
EXPOSE 3000
CMD ["sh", "-c", "node src/db/migrate.js && node src/db/seed.js && node src/db/seed-role-users.js && node src/server.js"]
