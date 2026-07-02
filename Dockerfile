FROM oven/bun:latest

WORKDIR /app

# Required for discord.js voice (ffmpeg)
RUN apt-get update && apt-get install -y ffmpeg python3 make g++ && rm -rf /var/lib/apt/lists/*

# 2. 依存関係のインストール
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

# 3. ソースとsetup.shをコピー
COPY . .

# 5. 実行
CMD ["bun", "run", "start"]