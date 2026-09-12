> **過去の実装・検証記録** — 現在の起動方法は [README](README.md)、資料の一覧は [ドキュメント目次](docs/README.md) を参照してください。以下は記録時点の内容です。

# 待機ノードがある市場での起動結果

2026-09-12。公開市場47件を取得し、価格APIで上限0.25 USD/h以内と確認できた公開11市場についてノード待ち行列を確認した。3080市場に待機ノード3台を確認。起動直前にも3台を再確認した。`getAvailableGpus()`は空でも`getQueuedNodes()`には値が返り、前者だけでは市場を選べないことが分かった。

選定: NVIDIA3080（市場metadata10GB）、Gemma3 4B IT QAT（公式テンプレート要件5,120MB、Ollama0.32.6）。表示価格0.09603 USD/h、1replica、service timeout60分。新規top-up／カード課金なし。

Deployment: `GZFEBV6iFhxpxjc9pJaQQcu3mkAXNimHaeKYGJpYu7P6`

**GPU割当・実ジョブRUNNING・推論endpoint.online=trueまで成功。候補IDを返す推論成功は未確認。**

初回は15:48:46 JSTに実ジョブRUNNING・nodeAssigned=true、15:49:42にendpoint.online=trueを確認。最初の/api/chatを25秒で打ち切った。これは検証コード側が初回ロードと通常推論を分けなかった制約でもあり、モデルが実行不能と断定しない。

同じdeployment・同じモデルを、停止状態と待機ノード2台を確認後に再開。構成を次々変更していない。再び実ジョブRUNNING・nodeAssigned=true。途中で管理SDKが接続タイムアウトし、finallyの停止確認も中断されたため、別の停止専用処理で後処理した。直接HTTP確認は/api/tagsが503「Service Initializing」を返したが、停止処理も行われた時間帯なのでこれだけで初期化失敗の原因を確定しない。

現在の到達点は「受け入れ可能な市場でノード割当まで進められる」。残るのは、稼働中のOllamaタグ・モデル読込・トンネル接続を確認し、初回起動を通常推論の25秒制限から切り離して測定すること。推論未成功なので、本番接続先として.envを有効化していない。

証拠:
- `validation/artifacts/nosana-available-market-scan.json`
- `nosana-available-start-result.json`
- `nosana-available-warm-result.json`（プロセス異常終了時の途中記録）
- `nosana-available-direct.json`
- `nosana-available-final.json`（停止・費用の最終確認）

停止失敗時に新たなデプロイを作るのではなく、既存IDの停止を確認する。今回も別のLLM基盤への切替はしていない。

最終確認15:56:28 JST: deploymentと2ジョブはSTOPPED。assignedCredits10、settledCredits0.03、reservedCredits0.176。予約額は確定消費額ではなく、最終精算・解放はこの時点で未確認。市場確認開始15:46:45から停止確認まで約9分42秒。
