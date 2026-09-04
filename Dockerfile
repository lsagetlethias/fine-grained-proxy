FROM denoland/deno:2.9.6 AS builder

WORKDIR /app

COPY deno.json deno.lock ./
RUN deno install --frozen

COPY tailwind.config.js ./
COPY scripts/ scripts/
COPY docs/ docs/
COPY src/ src/

# scripts/version.ts retombe sur "dev" sans .git ni reseau. Passer --build-arg
# FGP_COMMIT_SHA=$(git rev-parse --short HEAD) pour un hash exact et reproductible.
ARG FGP_COMMIT_SHA=""
RUN deno task build \
  && if [ -n "$FGP_COMMIT_SHA" ]; then printf '%s' "$FGP_COMMIT_SHA" > static/version.txt; fi

FROM denoland/deno:2.9.6

WORKDIR /app

COPY --from=builder /app/deno.json /app/deno.lock ./
COPY --from=builder /app/src/ src/
COPY --from=builder /app/static/ static/

RUN deno cache src/main.ts

USER deno

EXPOSE 8000

CMD ["deno", "run", "--allow-net", \
  "--allow-env=FGP_SALT,PORT,SCALINGO_API_URL,SCALINGO_AUTH_URL,FGP_LOGS_ENABLED,FGP_LOGS_BUFFER_NETWORK,FGP_LOGS_BUFFER_DETAILED,FGP_LOGS_INACTIVITY_MIN,FGP_LOGS_DETAILED_MAX_KB", \
  "--allow-read=static", "src/main.ts"]
