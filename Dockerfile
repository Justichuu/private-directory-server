FROM node:26-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.client.json ./
COPY src ./src
COPY test ./test
COPY public ./public
RUN npm run build

FROM node:26-alpine AS runtime
WORKDIR /app
ENV HOST=0.0.0.0 PORT=8000 DIRECTORY_ROOT=/shared
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:8000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "dist/src/server.js"]
