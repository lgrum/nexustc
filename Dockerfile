# ---- Base image ----
FROM oven/bun:1.3.5 AS base

WORKDIR /app

# ---- Build ----
FROM base AS build

# Copy all source files
COPY . .

# Install from the cached store (creates proper symlinks)
# Include devDependencies since turbo is needed for build
RUN bun install --frozen-lockfile

# Build the application
ENV NODE_ENV=production
RUN bun run build

# ---- Runtime ----
FROM base AS runner

RUN apt-get update && apt-get install -y \
  libvips42 curl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production
ENV NODE_OPTIONS=""

# Copy the built output (TanStack Start bundles to .output)
COPY --from=build /app/apps/web ./apps/web

# Copy production node_modules if needed for runtime dependencies
COPY --from=build /app/node_modules ./node_modules

WORKDIR /app/apps/web

EXPOSE 3000

CMD ["bun", "run", "start"]
