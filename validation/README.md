# Technical validation harness

Python検証のみ。完成アプリ／UIではありません。ルートの既存`.venv`と`requirements.txt`を尊重しています。

```sh
.venv/bin/python -m pip install -r validation/requirements.txt
npm ci --prefix validation/nosana
# .env はすでに作成済み。上書きしないこと。
.venv/bin/python validation/build_samples.py
PYTHONPATH=validation .venv/bin/python -m unittest discover -s validation/tests -v
.venv/bin/python validation/probe_graph.py
.venv/bin/python validation/run.py --days 1
.venv/bin/python validation/run.py --days 7
```

`run.py`は保存済み出典→Schema→実AuraDB→適格性判定→実Nosana→コード集計。現データでは30分以内・換算・除外確認が足りないため、正しく失敗します。これはDaytonaライブ成功の代替ではありません。

```sh
# 推論URLが準備できた後、候補ID選択だけの診断（献立合格ではない）
.venv/bin/python validation/run.py --days 1 --diagnostic-selection
.venv/bin/python validation/run.py --days 7 --diagnostic-selection
# Conditions JSONで予算・目標・アレルギー・苦手・在庫を変更
.venv/bin/python validation/run.py --days 7 --conditions my-conditions.json
```

## 接続設定

`.env.example`参照。`NOSANA_API_KEY`は管理専用。`NOSANA_INFERENCE_BASE_URL`は実デプロイのURL（`/api/chat`を付けない）。`NOSANA_MODEL=qwen3.5:9b`、`NOSANA_PROTOCOL=ollama`。推論認証がないテンプレートの場合`NOSANA_INFERENCE_API_KEY`は空欄。管理キーを推論URLへ送信しない。キーはサーバー側のみ。

`DAYTONA_SANDBOX_ID`と`DAYTONA_SNAPSHOT`は将来のwarm実行用の任意予約欄で、現`daytona_probe.py`は使用しません。Daytonaリージョンは`us`、Neo4jユーザーとDB名は`neo4j`。

## 個別の取得確認

```sh
.venv/bin/python validation/fetch_public.py 'store=https://www.e-kinokuniya.com/store/KINOKUNIYA/international'
.venv/bin/python validation/browser_probe.py 'https://www.e-kinokuniya.com/store/KINOKUNIYA/international' validation/artifacts/recheck --channel chrome
# Daytona: ネットワーク許可とクレジット確認後だけ実施
.venv/bin/python validation/daytona_probe.py --create
```

`--create`は1Sandboxを新規作成。Chromium準備時間はリクエスト90秒とは別に測定。4サイトを順に調べ、作成したSandboxだけをfinallyで削除。既存リソースは触りません。最大3Sandbox並列案は未実装・未測定です。Tier 1では実サイトへの通信に失敗しました。

## Nosana lifecycle

```sh
node validation/nosana/discover.mjs
node validation/nosana/markets.mjs
# 残高・価格・VRAMを確認した後のみ（検証時はすでに一度実行済み）
node validation/nosana/deploy.mjs create
node validation/nosana/deploy.mjs status
node validation/nosana/events.mjs
node validation/nosana/deploy.mjs stop
```

作成スクリプトは60分・1replica・3090価格上限0.25 USD/h・残高1以上の条件。実課金額保証ではありません。`nosana-deployment.json`のこの検証で作成したIDだけを操作します。再度createすると新しいIDになるため、先の検証リソースを停止してから行ってください。

## 証拠

- `artifacts/*metadata.json`: ローカルHTTPコード・取得日時・所要時間・SHA256。HTTP 200は本文抽出成功を意味しない。
- `artifacts/local-*.png`: ローカルChromeで撮影。Daytona撮影ではない。
- `artifacts/seijo-flyer.bin`: JPEG原本（画像ビューアで開ける）。`seijo-common.bin`もJPEG。画像転記は検証担当による目視、Nosana OCR実行ではない。
- `artifacts/sample-data.json`: 出典付き保存サンプル。`basis=source`でもパック・調理時間がunknownなら集計不可。
- `artifacts/aura-result.json`: 実保存・2回投入・候補・不足・共通食材。
- `artifacts/daytona-*.json`: リモート取得失敗とSandbox後片付け。
- `artifacts/nutrition-demo.json`: 文科省2食材の算術実証。完成夕食ではない。
- `artifacts/result-*day.json`: 統合診断の成功／失敗と段階時間。

Schemaに未知を保持します。スプーン／個数／生米→炊飯米などの換算根拠を作っていません。テストのパック価格はsyntheticで、店舗価格ではありません。実データの再配布や大量取得の許諾確認は別途必要です。クックパッドrobotsではAI bot向け禁止指定が確認されており、以後の取得を拡大していません。

### 代替経路の追加検証

```sh
.venv/bin/python validation/daytona_saved.py
.venv/bin/python validation/daytona_ocr.py
```

どちらも一時Sandboxを作りfinallyで削除する。前者は保存HTML3件の解析、後者は保存チラシの日本語OCRであり、サイトのライブ取得ではない。OCRの自動確定商品数は0。詳細はルートWORKABLE_ALTERNATIVES.md。Nosanaの最終停止・消費確認はartifacts/nosana-final.json。テスト結果はartifacts/tests.txt（14件）。
