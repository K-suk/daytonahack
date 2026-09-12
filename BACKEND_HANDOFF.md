> 最新契約は [backend/API_CONTRACT.md](backend/API_CONTRACT.md)。manifest取り込み・Source preview・計算/Swap経路を追加済み。以下は初回接続時の履歴です。

# saved経路のバックエンド接続

## 起動と呼べるAPI

ワークスペース `/Users/kosuke/Desktop/daytonahack` で `.venv/bin/python backend/server.py`。URLは `http://127.0.0.1:8787`。依存は既存 `validation/requirements.txt`。新しいWebフレームワークなし。localhost専用、公開用認証は未実装。フロント4312と開発用3000/3001のlocalhost Originを許可する。

| メソッド／パス | 応答 |
|---|---|
| GET `/api/health` | savedモード、Nosana設定状態。キー／URL自体は返さない |
| POST `/api/runs` | 202 `{runId,status,progressUrl,resultUrl}`。同時実行中は409 |
| GET `/api/runs/{runId}` | 実行状態と作成日時 |
| GET `/api/runs/{runId}/events?after=0` | sequence順の実イベント。1秒程度でpollし最終sequenceをafterへ |
| GET `/api/runs/{runId}/result` | 実行中202、終了後200。blockedでも部分結果を返す |
| POST `/api/runs/{runId}/cancel` | 202。外部呼び出し完了後、次の段階で停止。即時リソース強制削除ではない |
| GET `/api/runs/{runId}/alternatives` | 現在409 `meal_plan_not_available`。候補をSwap可能と偽らない |
| POST `/api/runs/{runId}/swap` | 現在409 `meal_plan_not_available`。revisionを進めない |

開始例（過去に保存した特売の有効日を検証用に明示）:

```sh
curl http://127.0.0.1:8787/api/runs \
  -H 'Content-Type: application/json' \
  -d '{"days":7,"conditions":{"budgetYen":3000,"proteinGoalG":35,"kcalGoal":600,"shoppingDate":"2026-09-12","allergies":[],"dislikes":[],"pantry":["rice-cooked","oil","salt","pepper","soy-sauce","sugar"]}}'
```

`days`は1〜7。購入日の指定を推奨。旧検証Conditionsの既定日は2026-09-12であり、最新価格が取得されたことを意味しない。返却した過去特売にもvalidFrom/validToがある。Aura候補検索は指定日を適用する。

## 実行経路と結果

POST → 一時Daytona Sandbox → 既存HTML3件をupload → Daytona上でJSON-LD解析 → run固有の出力をdownload → 元HTMLのhash照合 → **その出力のみ**からレシピを正規化 → 保存チラシの確認済み3商品を結合 → 実AuraDBへrunId付き保存・候補／不足／共通食材検索 → 適格性検査 → Nosana未接続判定 → 部分結果。

ローカルsample-data.jsonから使うのは店舗・確認済み商品・商品食材だけ。RecipeをDaytona出力とは別の保存候補で埋めない。Recipe evidenceはroute=saved、environment=daytona。商品は保存済み目視転記なのでenvironment=local。sourceのfetchedAtは当初取得時刻を維持し、今回の処理時刻に置き換えない。Auraにもroute/basisを保持する。

結果は `status: blocked`, `route: saved`, `liveFetchSuccess: false`, `threeProductLiveSuccess: false`, `mealPlan: null`。graph.candidatesには実候補を返す。`stopReasons`は`no_fully_verified_30min_candidates`と`nosana_endpoint_not_ready`。単なる完了失敗で中間データを捨てない。

イベントstageはacquisition/normalization/graph/selection/terminal。固定タイマーで架空の商品発見や店舗閲覧を通知しない。新規ライブ撮影・OCRは実行せず、画像APIはまだ提供しない。店舗3件の結果表示はdealsをstoreIdでまとめ、未取得2店は価格未確認とする。saved資料を新たに閲覧・撮影した画像として表示しない。

run出力は `backend/runs/{runId}/` に保存（gitignore）。終了結果は再起動後も読める。処理中の再起動はinterruptedとして返し、自動再作成しない。サーバー強制終了時のSandboxはTTL5分／auto-delete設定が最後の保護。通常経路はfinallyで削除する。API試験結果は `backend/api-verification.json`。

## フロントの読み取りと必要な差分

確認先は別worktree `/Users/kosuke/Desktop/dinner-scout-frontend` の `docs/FRONTEND_HANDOFF.md`、`lib/dinner-scout/types.ts`、`service.ts`、`mock-service.ts`。これらを編集していない。

| 暫定フロント | バックエンド接続時の差分 |
|---|---|
| UserPreference budget/protein/calories | conditions budgetYen/proteinGoalG/kcalGoalへ明示変換 |
| pantry/allergies/dislikesのfixture ID | 実Ingredient ID／Conditions enumと照合。米fixtureは乾燥米、実側はrice-cooked。無条件renameで重量を流用しない |
| startRun(preferences, scenario) | POST /api/runs。scenarioはmock専用、送らない |
| subscribe(listener) | eventsをpoll。unsubscribeでtimerとfetchを取消。終端blocked/failed/cancelled/interruptedで停止 |
| ProgressEvent status=running/complete/failed | blocked/cancelled/interruptedを追加。実stageと停止理由を表示 |
| getResult(): MealPlan | 完成献立とPartialRunResultのunionが必要。mealPlan=nullでも取得結果を見せる |
| ProductDeal packGrams/priceが必須number | packGrams nullable。priceYenは数量当たり価格で、パック価格と限らない。quantity/unit/taxと根拠を表示 |
| Recipe minutes/gramsが必須number | cookingMinutes/gramsはnullable。sourceUrlとevidenceを追加 |
| mode=mock、source=demo/sample | route=live/saved と basis=source/estimated/unknownを別々に扱う |
| getAlternatives/replaceMeal | 現在409。完成献立がある場合のみ有効にする。dayIndexはフロント0始まり、将来のAPI日付番号との変換を明示 |
| getCatalog()同期fixture | 実候補のIDに揃えたcatalogが未接続。Conditions schemaのenumと結果ingredients対応を使う設計へ。fixture店舗・料理を実データに混ぜない |

既存MealPlanに型キャストして差し込むだけでは接続できない。service境界でwire型を検証し、部分結果画面とunknown表示を追加する必要がある。実APIのリクエストSchemaは `backend/start.schema.json`、数値根拠Schemaは `backend/quantity.schema.json`。

## Nosana接続箇所

`backend/nosana.py`がreadinessとchooseを提供し、HTTP推論本体は既存`validation/inference.py`。未設定時はネットワーク呼び出しなしでunconnected。管理API・GPU起動・待機は実行しない。接続情報が揃った後はローカル.envのNOSANA_INFERENCE_BASE_URL／必要ならNOSANA_INFERENCE_API_KEY／MODEL／PROTOCOLを設定しサーバーを再起動。管理キーを推論認証に転用しない。

configured_unverifiedは実推論成功ではない。適格候補がなければ推論を呼ばずblocked。現データは調理時間・除外確認・分量が足りない。将来推論が成功した場合は構造化selectionを返すが、完成MealPlan組立・Swapの適用は次の接続作業。HTTP推論の時間制限と不正ID/JSON検査は既存モジュールを維持。

## 根拠付き推定の計算経路

`backend/accounting.py:calculate_evidenced`へ、使用g・食品100g当たり栄養・パック価格・パックgをそれぞれQuantityで渡す。

- source: valueとsourceUrlが必要。
- estimated: value/sourceUrl/reasonが必要。推定根拠なしは拒否する。
- unknown: value=nullのみ。ゼロで補完しない。

パック価格はoffer.priceKind=packが必要。100g単価を実パック価格として受理しない。7食合算・パック切上げ・在庫除外を既存計算へ委譲し、入力provenanceを保持。使用量の推定も総購入額と栄養のbasisへ伝播する。栄養値は100g当たり・重量と同じ食品状態で用意する必要がある。新しい価格・重量・栄養・レシピは生成していない。この計算関数は実データが揃った際の接続口で、現在の不足候補から完成献立を捏造しない。

## 検証と制約

` .venv/bin/python -m unittest discover -s backend/tests -v` と既存validationテストを使用。`.venv/bin/python backend/verify_api.py`は**実Daytona Sandboxを1個作る**接続試験なので、通常の型確認で繰り返さない。

全体90秒の厳密な強制取消はこの非同期APIでは未実装。各SDK timeoutはあるが、ファイル操作・後処理も含めたhard deadlineは次の作業。1runのみ受け付けて重複起動を防ぐ。キャンセルは外部処理から戻るまで待つ。7日献立・Swap・3店舗現行比較が完成したAPIではない。

今回の実API測定: runId `82573140-1a85-40b0-bb51-0e86420c95dd`、Daytona解析・削除まで23.722秒、正規化23.727秒、Aura候補3件30.088秒、blocked終端30.091秒。Sandbox削除を確認。初回はリファクタ時のremoteスクリプト字下げミスで失敗し、修正・remoteコードcompileテストを追加してから成功した。通信制限・GPU待機・全面OCRの失敗経路は再試行していない。新規backendテスト6件、既存計算テスト14件成功。APIの202開始、同時開始409、未知run404、Swap409、フロント4312のCORSを確認した。
