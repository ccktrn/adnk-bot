# ADNK Bot - 開発ガイドライン (AGENTS.md)

このドキュメントは、本プロジェクト（ADNK Bot）の開発に参加するAIエージェントおよび開発者向けの概要、コーディング規約、プロジェクト構造をまとめたものです。

## プロジェクト概要
YouTubeからの音楽ストリーミング再生や、ボイスチャンネルの自動参加、サウンドボードの自動設定などを目的としたDiscord Botです。
動画のメタデータ取得および音声ダウンロードには `yt-dlp` を使用し、DiscordのVoice API (`@discordjs/voice`) にストリームを流し込む仕組みを採用しています。

* **言語**: TypeScript, Node.js (Bun)
* **ライブラリ**: discord.js, @discordjs/voice
* **インフラ**: Docker, Docker Compose (Alpineベース)
* **外部依存**: ffmpeg, yt-dlp, nodejs (JSチャレンジ解決用)

## コーディング規約 (Coding Conventions)

1. **関心ごとの分離 (Separation of Concerns)**
   * コマンド定義ファイル（`src/cmds/*.ts`）は、**SlashCommandの定義とルーティング（Switch文）のみ**を行う薄いレイヤーに保ちます。
   * 実際の機能ごとのロジックは、関心ごと（Music, Configなど）に分けて `src/handlers/*.ts` に分離して実装します。

2. **インポートのルール**
   * 原則として**動的インポート（`await import(...)` や `as import(...)`）は使用しません。**
   * すべてのインポートはファイルの上部（トップレベル）にまとめて記述します。

3. **型チェックの徹底**
   * コードを編集した後は、必ず `make check` (または `bunx tsc --noEmit`) を実行して、TypeScriptの型エラーがないか確認してから完了とします。
   * Any型の乱用を避け、Discord.jsの適切な型（`GuildTextBasedChannel`, `ChatInputCommandInteraction` など）を使用します。

4. **コンテナとプロセスの管理**
   * `yt-dlp` は `Dockerfile` 内でコンテナにインストール（`/usr/local/bin/yt-dlp`）されるため、実行時はコンテナのパスを使用するか、`shell: true` を付与して呼び出します。
   * 新しいパッケージを追加した場合やインフラ周りを変更した場合は、`make clean` -> `make build` -> `make up` でコンテナをクリーンな状態から再構築します。

## プロジェクト構造 (Directory Structure)

```text
/home/pve/workspace/disbot-adnk/
├── src/
│   ├── index.ts                   # エントリーポイント（Botの起動とイベントリスナーの設定）
│   ├── cmds/                      # スラッシュコマンドの定義とルーティング
│   │   └── adnk.ts                # /adnk コマンドの定義とハンドラー呼び出し
│   ├── handlers/                  # サブコマンドの実行ロジック（関心ごとに分割）
│   │   ├── music.ts               # play, skip, stop, queue のロジック
│   │   └── adnkConfig.ts          # set-vc, set-soundboard 等の設定ロジック
│   ├── lib/                       # 外部ライブラリのラッパーやコアロジック
│   │   ├── music-player.ts        # キューの管理やDiscord Voiceの制御 (GuildQueue)
│   │   ├── yt-dlp.ts              # yt-dlp コマンドのラッパー (getVideoInfo, getAudioStream)
│   │   └── logger.ts              # ロガーの実装
│   ├── repositories/              # データの永続化・取得ロジック
│   │   └── config-repository.ts   # JSONファイル等を用いた設定情報の読み書き
│   └── type.ts                    # プロジェクト共通の型定義
│
├── Dockerfile                     # 実行環境（Bun, ffmpeg, yt-dlp, nodejsを含む）
├── docker-compose.yml             # 本番環境コンテナ設定
├── docker-compose.dev.yml         # 開発環境コンテナ設定（bun --hot対応）
├── makefile                       # よく使うコマンドのエイリアス集（make build, make check等）
├── package.json                   # パッケージ依存関係
└── tsconfig.json                  # TypeScriptコンパイラ設定
```
