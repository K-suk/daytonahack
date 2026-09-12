> Nosanaの現行運用は [利用手順](validation/nosana/README.md)。待機ノード確認→既存構成start→初回/通常推論prepare→ready→stopへ統合済み。今回の統合では新規起動なし。

> Nosana追加確認: 待機ノードのある3080市場でGemma3 4BのGPU割当とendpoint onlineまで成功。推論はタイムアウト等で未確認。試行リソース停止済み。[最新結果](NOSANA_AVAILABLE_MARKET_RESULT.md)を参照。

# 最新の実装方針（2026-09-12、ユーザー承認済み）

Daytonaのライブ巡回をMVPから外し、保存資料の解析を正式経路に変更した。以下の旧技術検証の「通信権限解除が本実装の前提」という記述は現在の方針ではない。ライブ再試行・OCR全面再実行・新規レシピ大量収集は行わない。

現在の正本:

- [API・イベント契約](backend/API_CONTRACT.md)
- [資料manifest記入例](materials/manifest.json)と[追加方法](materials/README.md)
- [Nosana代替検証](NOSANA_ALTERNATIVE_RESULT.md)
- [不足資料一覧](MISSING_MATERIALS.md)

保存Cookpad HTML3件・確認済み商品JSON・チラシ画像をmanifestからDaytonaへ渡し、実解析結果を回収して正規化、実AuraDBの候補3件・不足食材・共通食材検索まで35.766秒で接続した。画像はpreview_onlyで、OCRの自動確定商品数0件を維持。runIdは046c2446-fb35-45d0-a6b4-7f139d450615。グラフ結果・詳細不足理由をAPIで返す。Recipeを別ローカルサンプルで補完していない。

Nosana4080の単一代替試行はノード未割当で失敗。停止確認済み。推論・実7日完成は未達。接続モジュール、適格性、根拠付き推定の計算、同一run内候補のSwap・revision検査は実装した。Swap成功はsynthetic単体テストで検証し、実献立成功と区別する。フロントは別worktreeの契約を読み取り、変更していない。

API起動: `.venv/bin/python backend/server.py`。フロント4312からlocalhost8787を呼べる。資料だけの検証は`.venv/bin/python backend/check_materials.py`で、Daytonaを作成しない。現在は部分結果デモまでで、フロントの実APIアダプターは別担当の作業。

---

以下は旧検証時の履歴・設計参考。上記と矛盾する前提は上記を優先。

# Implementation handoff

現時点で「2時間の本実装を開始できる準備完了」ではない。Daytona Tier 1のネットワーク制約、3店舗の現行パック価格不足、30分以内を検証できるレシピ不足を先に解消する。Nosanaの最終状態はTECH_VALIDATION_REPORT.mdと実ログ参照。採用3製品は維持する。

## 最小構成

Next.js/React/TypeScript/TailwindのローカルPC UI（英語）。Nodeサーバーが条件・締切・SSE・計算を管理。DBはAuraDBだけ。検証用Pythonは外部接続・計算仕様の参照実装として残す。公開URLは次段階。

DaytonaにPlaywright Chromium・requests/HTTPクライアント・JSON-LD/DOM抽出コードを事前配置したSnapshotを準備。実サイトアクセス可能になってから最大3Sandboxを同時に確保し、固定3店を並列調査。レシピ検索は終了したSandboxを再利用する。ローカルHTTP成功をDaytona成功に置き換えない。レシピURL発見はクックパッドの公開検索ページ、本文は公開Recipeページを使う案。検索エンジンAPIをDaytonaの機能と誤認しない。今回web検索は技術検証担当が用いた探索手段であり、本アプリに内蔵された検索ではない。

Nosanaは公式Qwen3.5 9B/Ollamaテンプレートを第一候補とした。生のHTMLを丸ごと送らず、候補ID・原材料・不足食材・価格の確度・栄養の確度を送る。候補20件×およそ300 tokens、制約とSchemaで約2,000 tokens、出力約1,000 tokensという8〜12Kコンテキストは設計見積。実token数・日本語精度・速度は接続実測で確認する。OpenAI APIは必須にしない。

## 処理担当とツール

| 担当 | 固定処理 | モデルの判断 |
|---|---|---|
| Coordinator | 条件Schema、runId、90秒締切、3店舗fan-out、イベント、cleanup | なし |
| Store worker ×3 | Daytonaで公式固定URL、HTTP/Chromium、画像保存、期間照合、パック単位 | Nosanaに次のallowlist内リンク候補を選ばせる案（未実装） |
| Recipe worker | 同Sandboxを再利用、検索、公開本文JSON-LD抽出、材料正規化 | 得られた食材で次の検索語を選ぶ案（未実装） |
| Graph layer | パラメータ付き固定Cypher、runId分離、候補と不足食材 | 任意Cypher生成は禁止 |
| Menu selector | Aura候補と条件を入力、Schema/ID検証 | Nosanaで1〜7日の候補ID・分量案・英語理由を選択 |
| Calculator | 7食を合算しパック切上げ、栄養、予算、日別変更 | なし |

現検証の取得は固定プログラム＋人の目視確認。自律Agentの実証ではない。Agentと呼ぶなら、次の検索／リンクをモデルが選び、allowlistと回数制限を通して実行する閉ループを実装・測定する。調査中推論は最大1〜2回、必要時のみ。

## 調査Schema

実ファイル: `validation/recipe.schema.json`、`deal.schema.json`、`selection.schema.json`、`conditions.schema.json`。`extra=forbid`、unknownはnull。追加の本実装要件:

- observation: runId, storeId, sourceUrl, fetchedAt, route(live/saved), environment, contentHash, screenshotPath, parseStatus。
- deal: priceYen, tax, priceUnit, packQuantity, packUnit, edibleYield, validFrom/validTo（JST）, membershipRequired, purchaseConditions, comparisonPriceYen, 各フィールドのbasisと証拠位置。
- recipe: canonical ID/URL, servingsRaw/servings, total cooking timeと根拠、raw材料/分量/unit/grams/conversionSource、cooksnapCountとbookmarkCountを分離、星評価は存在時のみ。
- ingredient: 共通IDに日英alias。豚こま、部位不明豚肉、皮有無不明の鶏もも、生／調理済みを混同しない。複合調味料の原材料が不明ならアレルギー適合と断定しない。
- selection: day, recipeId, servings, reason。価格・評価・出典は出力させない。全IDをAura候補集合で検証。分量変更後、コードが予算を再判定。

現Schemaの単一evidenceは最小検証用。価格だけsource、パック重量だけestimatedの場合に備えて本実装ではfieldEvidenceを追加する。変換不能を0にしない。調理時間不明をタイトルだけで30分以内としない。

## グラフ

Store→OFFERS→Deal→FOR_INGREDIENT→Ingredient、Recipe→REQUIRES→Ingredient。Recipeはrunごとの観測ノードとしsourceIdにCookpad IDを保持。REQUIRESは行番号・amount・unit・grams・rawを保持。同IDを複数行で使っても分量が消えない。`validation/graph.py`のINGEST/RECIPES/CANDIDATES/COMMONを移植する。

実行時の一貫性のため、stores/ingredients/deals/recipesを1 write transactionにまとめ、完了したRunだけ検索可能にする改善が必要。検証コードは各クエリautocommitであり途中失敗のatomicityを保証しない。実行IDにはUUID、保存キャッシュの採用時にも今回の買い物日で再判定する。古いrunは結果検索に混ぜない。

## API・進捗

- POST `/api/plan`: 条件→runId。バックグラウンド実行開始。最終状態success/partial/failed/deadlineを保存。
- GET `/api/runs/:runId/events`: SSE。`store.started`, `page.fetched`, `screenshot.saved`, `deal.validated`, `recipe.parsed`, `graph.queried`, `selection.validated`, `calculation.completed`, `run.failed`。
- GET `/api/runs/:runId`: 結果と各値のsource/estimated/unknown。
- PATCH `/api/runs/:runId/days/:day`: 取得済みrecipeIdとservingsを検証し、7食全体を再合算。新たな調査を始めず、未取得レシピを受け入れない。
- GET `/api/runs/:runId/screenshots/:id`: 当該runの画像だけ提供。任意パス不可。

イベントは実処理直後だけ発行。経過時間から架空の進捗率や商品発見を生成しない。スクリーンショットは店舗トップ、チラシ、レシピ本文など節目だけ。秘密・管理画面・APIキーを撮影しない。

## 計算と予算優先

原則1店舗で全購入。2店舗目は同一容量・同一条件・有効日の比較可能商品の価格差だけ補助表示。欠品や価格不明を安い店として順位付けしない。追加購入食材も同じ店のパック価格が必要。米等の在庫は費用除外・使用量栄養に含める。生米在庫と炊飯米使用量は換算表の出典がない限り混同しない。

予算内候補の組合せをコードで検証し、範囲内の候補からNosanaが栄養・共通食材・少ない追加購入・料理変化を比較する。予算未達ではなく「予算超過」、栄養未達と栄養不明を明示。極小予算に対して献立を捏造しない。つくれぽ件数は経験報告数であり高評価率ではない。利用するならlog(1+件数)の弱い補助点、件数不明の減点は避ける。

週1買い・冷凍可能の制約を維持し、生鮮を使う順・冷凍注記は食材ごとの確認済みデータで設定。個別保存の安全性をモデルだけで保証しない。

## キャッシュ・タイムアウト・fallback

warm pathの設計予算: 調整2秒、店舗並列20秒、レシピ20秒、Aura8秒、Nosana20秒、計算2秒、予備18秒=90秒。60秒は目標であり達成測定ではない。cold Chromium導入やGPU起動をこの枠に入れない。最大3Sandboxは並列上限で、3倍の速度を保証しない。

HTTP connect 3〜5秒/read 8秒、navigation 12〜15秒、撮影5秒。read-onlyの一時失敗だけ1回retry。403/認証/明示的制限は即停止。Nosana invalid JSON/IDは残り5秒以上なら1回だけ修正、価格情報を補完させない。各段階の実行前にglobal remainingを確認し、`min(stageBudget, remaining)`を渡す。90秒で終端状態を返す。検証ランナーはPOSIX SIGALRMで上限を設定、本Node実装はAbortController＋worker cancellation。

店舗特売は買い物日の有効期間、レシピ本文はsource hash/取得時刻でキャッシュ。期限切れ特売を現価格にしない。取得失敗時に保存データを使う場合はsavedと明示。Daytona画像がなければ「撮影失敗」を表示。Aura/Nosanaを使わない既存結果表示はreplay、3製品実行成功とは区別する。

## 本実装2時間の前に必要な準備

1. イベント主催者に事前コード・アカウント準備の許容範囲を確認。現時点で未確認。
2. Daytona Tier制限の解除／対象ドメイン許可をサービス側で確認。ネットワーク制限をプロキシなどで回避しない。
3. Nosanaをwarmにし、実モデル名・URL・認証・最低実行時間・残高を確認。JSON、画像、tool callは別テスト。
4. 3固定店舗の当日パック価格と不足食材価格を確保。紙チラシ・店頭写真を使う場合も出典・店・日付を照合しsavedを表示。エリア変更をしない。
5. Cookpadの取得運用条件を確認したうえで7日分＋代替（目安10〜14件）、30分以内、材料量、人数を確認。現3件は量の欠損が多い。
6. 文科省食品番号・可食部・量換算・調味料・炊飯米を少数の食材で揃える。生肉の部位不明は不明として扱う。
7. 小規模live全段→7日live全段を実測し、60/90秒・失敗経路を確認。

準備の見積は権限解除待ちを除き45〜90分程度。外部回答・GPU待ちは不明。今回実際に使った検証時間とは分けてTECH_VALIDATION_REPORTに記録する。

## 2時間の本実装配分（上記準備完了後）

| 時間 | Must |
|---|---|
| 0〜20分 | 条件Schema・英語フォーム・API/SSE・run状態 |
| 20〜45分 | 準備済みDaytona処理を接続、固定3店舗の実進捗と画像 |
| 45〜65分 | Aura保存と候補Cypher、Nosana構造化選択 |
| 65〜90分 | パック費用・栄養・在庫・予算優先・アレルギー除外 |
| 90〜105分 | 7日表示、取得済み候補への1日変更、全体再集計 |
| 105〜120分 | end-to-end、期限切れ・失敗・90秒timeoutの確認 |

Should: 比較可能商品の2店目差額、料理変化の改善、画像節目更新の使い勝手。要件として残すが時間超過なら未実装と明示する。
Nice to have: 複雑なモデル調査ループ、栄養の細かいグラフ。
Cut: 完成本格UI、動画配信、任意店舗検索、複数DB、公開デプロイ、OpenAI APIの無断必須化。

残る判断: 制限解除方法、3店分の価格根拠、正確なパック価格がないときの出典付き推定運用、レシピ時間検証方法、画像推論の性能、Daytonaの最終消費額。Nosanaは最終settledCredits=0.02、停止確認済み。確定プロダクト要件の変更で解決したことにしない。

## 追加で確かめた代替経路

[WORKABLE_ALTERNATIVES.md](WORKABLE_ALTERNATIVES.md)を参照。Daytona保存HTML解析3件は11.187秒で成功し、ライブが止まった場合のsaved実行候補になる。ただし現統合ランナーへの自動接続は未実装。Tesseract日本語OCRは57.931秒、正しい商品価格への自動構造化は未達。90秒内の毎回全面OCRには余裕が少なく、事前処理／キャッシュまたは商品領域分割が必要。

Nosanaは60分・3090に修正してもノード未割当だった。検証リソースは停止済み。再開前に空きGPU／実稼働URLを確認する。イベント側のwarm endpointは問い合わせ案であり、利用できると確定していない。

conversion.pyの醤油換算は出典付きestimatedとして使える小例。現サンプルへは自動適用していない。価格と栄養の根拠を同じ精度と見なさず、未知の株重量・パック重量・材料時間を補完しない。
