# Stage 1: Build stage with full Bun image for installing dependencies and building
FROM oven/bun:1 as builder

WORKDIR /usr/src/app

# Copy package.json, lockfile, and tsconfig
COPY package.json bun.lockb tsconfig.json ./

# Copy prisma schema
COPY prisma ./prisma/

# Install dependencies
# Using --frozen-lockfile to ensure reproducibility from bun.lockb
RUN bun install --frozen-lockfile

# Generate Prisma client
# Ensure all dependencies, including Prisma CLI, are available from bun install
RUN npx prisma generate

# Copy the rest of the application code
COPY . .

# If you have a separate build step for your TypeScript (though Bun often handles this directly)
# Example: RUN bun build ./src/index.ts --outdir ./dist --target bun
# RUN bun run build 

# Stage 2: Production stage with a lean Bun image
FROM oven/bun:1-slim

WORKDIR /usr/src/app

# Copy dependencies, prisma client, and application code from the builder stage
COPY --from=builder /usr/src/app/node_modules ./node_modules/
COPY --from=builder /usr/src/app/prisma ./prisma/
# If running directly from source (as CMD indicates), copy src.
COPY --from=builder /usr/src/app/src ./src/

# If you uncomment the build step in builder and your CMD uses 'dist':
# COPY --from=builder /usr/src/app/dist ./dist/

COPY --from=builder /usr/src/app/package.json ./
COPY --from=builder /usr/src/app/tsconfig.json ./
COPY --from=builder /usr/src/app/bun.lockb ./

# Ensure .env files are NOT copied into the image; they should be provided at runtime.

# Expose the port your backend Fastify server listens on (e.g., 3001 or from your config)
# Update this if your backend runs on a different port. Check src/config.ts or where server port is set.
EXPOSE 3001 

# Command to run your application
# This assumes your src/index.ts is the entry point and Bun can run it directly.
CMD ["bun", "src/index.ts"] 