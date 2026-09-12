# Nosana利用手順（現行）

全コマンドはリポジトリrootから実行。管理APIキーは.envのNOSANA_API_KEY。推論認証が必要ならNOSANA_INFERENCE_API_KEYを別途設定する。管理キーを推論先に送らない。

## 1. 市場を確認する（課金リソース起動なし）

```sh
node validation/nosana/find-available-market.mjs
```

getAvailableGpusの空配列だけで判断しない。getQueuedNodesの市場別結果と価格を使う。実績は3080市場に待機3ノード、0.09603 USD/h、10GB。Gemma3 4B IT QATの公式要件5,120MBを満たした。これは当時の値で、起動直前に再確認する。市場が空なら起動しない。別市場への自動切替・連続作成をしない。

## 2. 同じ実績構成を起動する（リソースを起動する明示操作）

```sh
node validation/nosana/lifecycle.mjs status
node validation/nosana/lifecycle.mjs start
```

既存ID GZFEBV6iFhxpxjc9pJaQQcu3mkAXNimHaeKYGJpYu7P6を使用する。新規deploymentは作成しない。旧ジョブ停止・3080の待機ノード・表示料金0.25 USD/h以下・1replica・60分設定・クレジット余裕をチェック。条件を満たさなければ停止。表示単価と最終請求の一致は保証しない。top-upしない。

start成功は管理開始のみ。statusで実ジョブのnodeAssignedとendpointOnlineを確認する。継続監視は10〜15秒間隔を目安にし、作業上限約10分に近づいたらstopする。60分のサービス設定は作業待機時間ではない。このCLIは自動の無期限待機を行わない。

## 3. 初回ロードと通常推論を別に検証する

```sh
node validation/nosana/lifecycle.mjs prepare
```

ノード割当・実ジョブRUNNING・endpoint onlineを確認してからPython prepareへ渡す。/api/tags（Ollama）で設定モデルの存在を確認し、実Aura候補3件を使ってアプリと同じSelection Schemaで1日選択を行う。

- 初回: HTTP read最大90秒、選択段階の予算100秒。
- 通常: 既存の25秒予算。
- JSON・候補ID・日数を両方で検証。
- 両方成功した場合だけreadyを記録し、検証済みURL・モデル・protocolを.envへ設定。
- 推論失敗時は停止処理へ進む。node/endpoint未準備なら起動を繰り返さずstatusで確認する。

初回の25秒タイムアウトはモデルが使えない証拠ではなかったため、アプリの通常リクエスト内で初回ロードを待たない構成にした。503 Service Initializingもreadyと扱わない。APIエラー時はモデル故障・GPU不足と即断しない。

.env更新後はローカルバックエンドを再起動する。readyは接続設定のfingerprintと5分の有効期限付き。設定変更・推論失敗・停止で無効化する。期限切れは再prepare。これは稼働の永久保証ではなく、次回推論が失敗すれば利用可能状態を解除する。

## 4. アプリと停止

backend/nosana.pyはreadyの場合だけ選定する。未設定はunconnected、未検証はconfigured_unverified、準備中はwarming。候補不適格は別理由でblocked。偽の献立は返さない。

```sh
node validation/nosana/lifecycle.mjs stop
```

停止要求だけで成功扱いせずdeployment・jobsの停止を確認する。通信失敗は同じIDの停止だけ最大3回再試行し、未確認ならstop_unconfirmed。予約クレジットの解放は停止完了より遅れることがあるのでstatusの残高で確認する。検証終了後はstopを実行する。デモ中の運転終了も忘れずに停止する。

## 検証状況

実GPU割当とendpoint onlineは確認済み。実推論の成功はまだ未確認。今回統合したprepare/lifecycleフローはネットワーク非接続のテスト／構文確認までで、再起動試験はしていない。過去の個別試行スクリプトは証拠・履歴として残し、通常運用はこの手順を使う。
