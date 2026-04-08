FROM denoland/deno:latest

WORKDIR /app

COPY deno.json deno.lock ./
RUN deno install --entrypoint src/main.ts || true

COPY src/ src/

RUN deno cache src/main.ts

EXPOSE 8000

CMD ["deno", "run", "--allow-net", "--allow-env", "--allow-read", "src/main.ts"]
