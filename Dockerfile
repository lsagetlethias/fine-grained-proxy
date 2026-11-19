FROM node:26-alpine AS builder

WORKDIR /app

# node:26-alpine ne livre plus corepack, retire des distributions Node. L'installer par
# npm plutot que d'epingler pnpm ici garde le champ packageManager de package.json comme
# seule source de la version.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN npm install -g corepack@latest && corepack enable

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json tailwind.config.js ./
COPY scripts/ scripts/
COPY docs/ docs/
COPY src/ src/

# scripts/version.ts retombe sur "dev" sans .git ni reseau. Passer --build-arg
# FGP_COMMIT_SHA=$(git rev-parse --short HEAD) pour un hash exact et reproductible.
ARG FGP_COMMIT_SHA=""
RUN node --run build \
  && if [ -n "$FGP_COMMIT_SHA" ]; then printf '%s' "$FGP_COMMIT_SHA" > static/version.txt; fi

FROM node:26-alpine

WORKDIR /app

COPY --from=builder /app/dist/ dist/
COPY --from=builder /app/static/ static/

USER node

EXPOSE 8000

CMD ["node", "--permission", "--allow-net", "--allow-fs-read=./static", "dist/main.js"]
