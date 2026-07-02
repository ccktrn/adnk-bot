# Discord Bot in Typescript

このプロジェクトは、TypeScriptとBunで構築された多機能なDiscord Botです。

## 主な機能

VCチャンネルのチャット欄で /init ってしたらそのVCが登録され，
今後そのチャンネルに人が入るたびに用意されたmp3音源(or指定したサウンドボード)を流し，その後退出

## 使い方・起動方法

`.env`ファイルを適切に設定した後、Docker Composeを使用して起動します。

**テスト起動:**
```sh
bun run dev
```

**バックグラウンド(デーモン)起動:**
```sh
docker compose up -d
```
