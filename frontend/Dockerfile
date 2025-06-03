# Stage 1: Build stage
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /usr/src/app

# ---- ADD THESE LINES TO DECLARE AND SET THE BUILD ARGUMENT ----
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
# ----------------------------------------------------------------

# Install pnpm
RUN npm install -g pnpm

# Copy package.json, pnpm-lock.yaml, and other relevant config files
COPY package.json pnpm-lock.yaml ./
COPY next.config.js ./
COPY tsconfig.json ./
COPY postcss.config.js ./
COPY tailwind.config.ts ./
# Copy any other necessary config files for the build process

# Install dependencies using pnpm
RUN pnpm install --frozen-lockfile

# Copy the rest of the application code
# Make sure .dockerignore is properly set up in the frontend directory
COPY . .

# ---- ADD THIS LINE TO DEBUG THE VARIABLE DURING BUILD ----
RUN echo "NEXT_PUBLIC_API_URL during build is: $NEXT_PUBLIC_API_URL"
# ---------------------------------------------------------

# Build the Next.js application
RUN pnpm run build

# 3. Production image, copy all the files and run next
FROM node:18-alpine AS runner
WORKDIR /usr/src/app

ENV NODE_ENV production
# Uncomment the following line in case you want to disable telemetry during runtime.
# ENV NEXT_TELEMETRY_DISABLED 1

RUN npm install -g pnpm # Install pnpm globally

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy package.json and pnpm-lock.yaml to install production dependencies
COPY --from=builder /usr/src/app/package.json ./package.json
COPY --from=builder /usr/src/app/pnpm-lock.yaml ./pnpm-lock.yaml

# Install production dependencies using pnpm, ignoring scripts
RUN pnpm install --prod --frozen-lockfile --ignore-scripts

# Copy built application and public assets
COPY --from=builder --chown=nextjs:nodejs /usr/src/app/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /usr/src/app/public ./public
# The node_modules directory is created by the pnpm install command above.
# Ensure it's owned by the nextjs user.
RUN chown -R nextjs:nodejs /usr/src/app/node_modules

# Set the user to nextjs
USER nextjs

EXPOSE 3000

ENV PORT 3000

# ---- The runtime env var is still useful if next start needs it, ----
# ---- but the NEXT_PUBLIC_API_URL is already baked in from the build stage. ----
# ---- You can also set it here if your app has a way to read it at runtime for other purposes ----
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

# Next.js collects completely anonymous telemetry data about general usage.
# Learn more here: https://nextjs.org/telemetry
# Uncomment the following line in case you want to disable telemetry.
# ENV NEXT_TELEMETRY_DISABLED 1

# server.js is required for private files
# COPY --from=builder /usr/src/app/server.js ./server.js

CMD ["pnpm", "start"] 