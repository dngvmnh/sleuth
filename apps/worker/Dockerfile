# Build from the repository root:
#   docker build -f apps/worker/Dockerfile -t sleuth-worker .
FROM node:22-bookworm-slim

# FFmpeg is used for audio extraction and frame sampling (evidence-analysis spec).
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm@10.12.1

WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile --filter "@sleuth/worker..."

# Defaults to fixture mode. Set SLEUTH_DATA_MODE=supabase and DATABASE_URL at run time.
ENV SLEUTH_DATA_MODE=fixture
CMD ["pnpm", "--filter", "@sleuth/worker", "start"]
