ARG VITE_ENABLE_LABEL_RECOGNITION_BETA=false

FROM node:22-slim AS build

WORKDIR /app

ARG VITE_ENABLE_LABEL_RECOGNITION_BETA
ENV VITE_ENABLE_LABEL_RECOGNITION_BETA=${VITE_ENABLE_LABEL_RECOGNITION_BETA}

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-slim AS runtime

ARG VITE_ENABLE_LABEL_RECOGNITION_BETA
ENV NODE_ENV=production
ENV PORT=3000
ENV VITE_ENABLE_LABEL_RECOGNITION_BETA=${VITE_ENABLE_LABEL_RECOGNITION_BETA}

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server

USER node

EXPOSE 3000

CMD ["npm", "run", "start"]
