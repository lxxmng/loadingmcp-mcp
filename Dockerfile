FROM oven/bun:1
WORKDIR /app
# Install dependencies (self-contained: @modelcontextprotocol/sdk + zod)
COPY package.json bun.lock ./
RUN bun install --production --frozen-lockfile
# Copy source
COPY src ./src
EXPOSE 3002
CMD ["bun", "src/index.ts"]
