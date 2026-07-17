FROM oven/bun:latest

WORKDIR /app

# Required for discord.js voice (ffmpeg) and yt-dlp
RUN apt-get update && apt-get install -y ffmpeg python3 make g++ wget && \
    wget https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -O /usr/local/bin/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp && \
    rm -rf /var/lib/apt/lists/*

# 2. 依存関係のインストール
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

# 3. ソースをコピー
COPY . .

# 5. 実行
CMD ["bun", "run", "start"]