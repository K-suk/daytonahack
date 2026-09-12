> **過去の実装・検証記録** — 現在の起動方法は [README](README.md)、資料の一覧は [ドキュメント目次](docs/README.md) を参照してください。以下は記録時点の内容です。

# Nosana代替検証結果

**失敗：実GPUノード未割当で、推論サービスに接続できなかった。** 管理RUNNINGを成功扱いしていない。別LLMへの切替なし。

2026-09-12 15:26:52 JSTに最新市場・テンプレート・価格・利用可能性・残高と既存リソースを確認。既存3090デプロイと2ジョブはSTOPPED。available GPU APIは空配列。これは観測時点の結果で、恒久的な欠品とは断定しない。

一度だけ選んだ別構成はNVIDIA4080、公式市場metadata16GB、qwen3.5:9bの実テンプレート要件9,216MB、Ollama0.32.6。旧3090と異なるGPUで、必要VRAMを満たす。表示価格0.16005 USD/h、1replica、service timeout60分、top-up／カード課金なし。最低60分設定は既存実APIエラーで確認した条件。最低請求額や最終請求が表示単価どおりになるとは保証していない。

部署ID: `A6wBE3Mp2VCcdN24mdm5b5H4n9eDW84YNd8URBCJ36FD`。実ジョブ `8cLK6n9BNyLwL4sYYNTdfq2RpVPA8QRPepr4myumnPNX` はQUEUED、nodeAssigned=false、endpoint.online=falseのまま。最小JSON推論は実行できず、候補ID検証も未実行。調査開始から9分20秒で停止要求・初回費用記録まで終了。これはサービスtimeout60分とは別の作業打切り。

15:36:58 JSTの後続読み取りでdeploymentとジョブのSTOPPEDを確認。creditsはassigned10、reserved0、settled0.03。開始時settled0.02との差は**0.01クレジット**。停止直後のreserved0.146は解放済み。通貨単位とイベント案内NOSを混同しない。

証拠: `validation/artifacts/nosana-alternative-check.json`、`nosana-alternative-result.json`。`alternative-once.mjs`は結果ファイルが既にあれば再実行を拒否する。今回は一度限りの承認なので、自動再起動しない。将来再開が承認された場合は同じ部署IDを公式SDKでget/startし、実node割当・endpoint.onlineとHTTP応答を確認してから.envへ接続する。起動に必要な時間は未測定で、warm状態が必要。停止済みの今回URLを稼働先として.envに入れていない。
