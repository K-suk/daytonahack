> **過去の実装・検証記録** — 現在の起動方法は [README](README.md)、資料の一覧は [ドキュメント目次](docs/README.md) を参照してください。以下は記録時点の内容です。

# 技術検証結果 — 2026-09-12（JST）

**動いたこと:** ローカル実サイトHTTP取得とChrome撮影、クックパッド公開本文3件のSchema抽出、実AuraDBへの保存・再投入・候補／不足／共通食材検索、文科省2食材の栄養算術、14項目の計算／出力検証テスト。Daytona管理接続・Sandbox作成・ブラウザ準備・削除、Nosana管理API・残高・デプロイ登録も実行成功。

**まだ動いていないこと:** Daytonaからの対象サイト取得／撮影はTier 1のネットワーク制限で失敗。Nosanaは実ジョブがQUEUEDのままノード未割当で、推論URL・推論応答は未取得。検証後STOPPEDを確認。3店舗の現行パック価格、調理30分以内・栄養量・アレルギーを確認済みの7日献立は未達。**3製品を通したlive結果生成は成功していない。**

**本実装開始条件:** Daytonaの対象サイト通信許可、Nosanaの稼働推論と構造化ID選択、3店舗の当日パック価格、7日＋代替の適格レシピ／換算／栄養データ、1日と7日の実end-to-end測定を先に成立させる。本実装準備完了とは判定しない。

## 1. 環境・範囲・時間

作業開始時は`.venv/`、`requirements.txt`（daytonaのみ）、`.gitignore`が存在。既存アプリなし。検証を`validation/`へ分離。ルート`.env`は値を出さずに作成し、ユーザーが接続キーを入力。API欄に入ったNosana管理キーは`nos_`形式の確認により管理欄へ移し、推論先へ流用しない。リージョンus、Neo4jユーザー／DB名neo4j、モデルqwen3.5:9b、protocol ollamaを設定。存在しない推論URLは埋めていない。

Python 3.14、Daytona SDK 0.211.2、Neo4j driver 6.3.0、Playwright 1.62.0、Nosana kit 2.13.5を実際に導入。固定Python検証であり、Next.js完成UIや公開URLは作っていない。秘密値のartifact一致検査は0件。

今回の技術検証は約30分以上を要した（最終実測時刻は末尾）。アカウント準備は並行してユーザーが行っており、純作業時間を分離測定できていない。これらは今後の「約2時間の本実装」と別枠。主催者が事前コードを許可しているかは未確認。

## 2. 判定一覧

| 検証 | 判定 | 証拠／範囲 |
|---|---|---|
| 3店の所在地 | 実行成功 | 公式店舗／公式LINE／グループ掲載のHTTP本文 |
| 3店の現行特売比較 | 失敗（1店のみ） | 成城石井3商品。残り2店は今回の現行商品価格未確認 |
| ローカル店舗・Cookpad撮影 | 実行成功 | `validation/artifacts/local-*.png` |
| Daytona認証・作成・実行・削除 | 実行成功 | `daytona-status.json`, `daytona-run.json` |
| Daytona対象ページ取得／撮影 | 失敗 | `daytona-seijo.json`等、ERR_CONNECTION_RESET |
| Cookpad検索候補発見 | 実行成功（local） | `cookpad-search.metadata.json` |
| Cookpad材料・人数等の構造化 | 実行成功（3件） | `sample-data.json`。本文を取得して抽出 |
| Cookpad 30分・全量換算適格性 | 失敗 | 3件とも総調理時間null、量に欠損あり |
| Aura保存・固定Cypher検索 | 実行成功 | `aura-result.json`、3候補行、共通食材 |
| Nosana管理・残高・テンプレート | 実行成功 | `nosana-discovery.json` |
| Nosanaモデル推論 | 未実行 | ジョブQUEUED、URLなし。管理RUNNINGは推論readyではない |
| MEXT栄養算術・パック計算 | 実行成功 | `nutrition-demo.json`、テスト14件 |
| 1日／7日の統合ランナー | 実行成功（期待した失敗を返す） | `result-1day.json`, `result-7day.json`。献立生成成功ではない |
| 最大3Sandbox並列・60秒完了 | 未実行 | Tier解除後に測定が必要 |
| vision／tool call／自律調査 | 資料確認のみ | 実モデル稼働がないため機能保証しない |

## 3. 固定3店舗

エリアを変えず、以下を固定対象とした。最安店であることは保証できない。

| 店舗 | 住所 | 店舗と特売の出典 | 結果 |
|---|---|---|---|
| 成城石井 南青山店 | 港区南青山2-27-25 ヒューリック南青山ビル1F | [公式店舗](https://shop.seijoishii.com/seijoishii/spot/detail?code=0150)、[9月決算セール](https://seijoishii.com/blogs/pickup-item/202609kessan) | HTML→JPEGチラシ。店ページに9/4〜9/17「鮮魚なし」対象と掲載。青果・精肉あり。 |
| 紀ノ国屋 インターナショナル（青山店） | 港区北青山3-11-7 AoビルB1F | [公式店舗](https://www.e-kinokuniya.com/store/KINOKUNIYA/international)、[調査した過去セール](https://www.e-kinokuniya.com/contents/Event-Fair/20251213_01) | 店舗HTML成功。確認した特売は2025/12/13限定で失効。現価格に不採用。ネットスーパーは会員登録要。 |
| ヴィルマルシェ 青山店 | 港区北青山2-13-5 青山サンクレストビル | [公式LINE](https://page.line.me/kaq2977y)、[イオングループ掲載](https://www.aeon.com/store/list/総合スーパー/関東地方/東京都/) | LINE公開HTML撮影成功。食材の現行特売価格は未確認。旧公式ドメインはHTTP200のドメイン管理案内で店舗取得失敗。 |

LINEのコーヒークーポンは条件付き・食材用途外として価格データに入れていない。旧ピーコック青山・ナチュラルハウス青山は閉店情報が見つかったため採用しなかった。

### 実画像から確認した商品

[成城石井・鮮魚なし版のチラシ原本](https://cdn.shopify.com/s/files/1/0861/9261/9803/files/SI0911-_1_d0d8fbba-5260-454b-9369-0f94037995f3.jpg?v=1788331860)をローカル取得し目視転記。**Nosanaの画像推論で自動抽出した値ではない。**

| 商品 | 価格 | 容量・単位 | 有効期間 | 集計制約 |
|---|---|---|---|---|
| 北海道産 大槻さんの海の神 ブロッコリー | 税抜288円／税込312円 | 1株 | 2026/9/12のみ | 可食部重量が不明。株数↔g換算未確定 |
| 国産 豚切落し | 税抜199円／税込215円 | 100g当たり | 2026/9/11〜13 | パック重量／実売パック価格は不明 |
| 国産 鶏もも唐揚げ・水炊き用 | 税抜199円／税込215円 | 100g当たり | 2026/9/11〜13 | パック重量・皮の有無は不明 |

会員限定表示はこの3商品には確認されなかった。売切れ・店舗による取扱差の注意がある。店頭在庫を確認したとは扱わない。税込表示の100g単価に想像した300gを掛けてパック価格にしない。比較元の通常価格がないので「節約額」はnull。

最小代替案は、同じ3店舗の当日チラシ／店頭パック表示を出典付きsaved資料として確保すること。店舗を架空データに差し替えたり、エリアを拡張したりしない。savedが現在の買い物日に有効か毎回判定する。

## 4. Cookpad

実発見のブロッコリーと豚こまを公開検索へ入力し、候補発見と本文取得を別に保存した。旧URL `recipe/6682169`は実HTTPでcanonical `jp/recipes/21691824`に転送された。

| canonical ID | タイトル | 人数 | 指標 | 調理時間 |
|---|---|---|---|---|
| [21691824](https://cookpad.com/jp/recipes/21691824) | 豚こまとブロッコリーのバター醤油炒め | たっぷり2人分→2 | つくれぽ6件、JSON-LD BookmarkAction 588 | null |
| [25675338](https://cookpad.com/jp/recipes/25675338) | ブロッコリーと豚こま♡ねぎ塩にんにく炒め | 2人分 | 採用できる件数なし→null | null |
| [25962767](https://cookpad.com/jp/recipes/25962767) | コリコリブロッコリーオイスター炒め | 1〜2人分→数値null | 採用できる件数なし→null | null |

星評価は3件とも取得できずnull。つくれぽ6件はスクリーンショットでも確認。BookmarkActionは保存アクション数であり星評価ではない。料理への満足度／好評率は分からない。件数を使う場合は人気補助指標として小さい重みを持たせる。

最初のレシピは豚肉400g・バター40g等があるが、玉ねぎ1/2玉、ブロッコリー1/2株、醤油フライパン4周などを含み、全量gにはできない。2件目にもねぎ20cm・にんにく1片、複合調味料がある。3件目は適量・1袋等。raw値を保存し、未換算をnullとした。

4件目[25646265](https://cookpad.com/jp/recipes/25646265)も本文HTTP200だが、この検証のJSON-LD抽出ではRecipeオブジェクトを得られず候補JSONに不採用。ページ本文には材料があり、「存在しないレシピ」「アクセス禁止」とは断定しない。DOM fallbackの追加対象。

公開本文取得はログインなしで成功した。ログイン・プレミアム機能には入っていない。[robots.txt](https://cookpad.com/robots.txt)にはGPTBot、ChatGPT-UserなどAI botへの禁止指定を確認。HTTP取得成功は自動取得運用の許諾を意味しない。確認後、取得を拡大していない。公開検索→本文という技術経路は得られたが、7日＋代替10〜14件を運用する条件を別途確認する。

HTTP本文は1件2.3〜2.7秒、3並列で約2.8秒。ただし、7日分を使える状態にする時間は量換算・調理時間確認・追加購入価格・栄養対応を含むため未測定。この3件を繰り返して完成7日献立にしたとは扱わない。

## 5. Daytona

Daytonaは実行環境としてPython・HTTP・Playwright Chromiumを実行した。LLM／検索エンジンとして扱っていない。公式SDKの実インストールからcreate/list/process.exec/fs.upload_file/fs.download_file/deleteの仕様を確認して実行。

- 管理API list成功、開始時既存Sandbox0件。
- ダッシュボード実確認: Free credit $200、Paid $0、登録カードなし、Tier 1。
- 作成約1.8〜2.0秒、pip＋Chromium導入約30秒、対象URLのHTTP/Chromeはいずれも接続reset。
- [公式ネットワーク仕様](https://www.daytona.io/docs/en/network-limits/)はTier1/2の組織制限がSandbox設定より優先すると明記。今回の症状と一致。
- 自分で作った検証Sandboxだけを削除。ブラウザ検証2個・HTTP切分け1個・保存HTML解析1個・OCR1個の計5個。既存リソースは削除していない。

Daytona画像は0枚。ローカル画像をDaytona画像と呼ばない。ネットワーク制限をプロキシ等で回避していない。最小解決策はサービス／イベント担当による権限の確認と解除。連絡メッセージは送っていない。

3Sandbox並列とレシピ調査再利用は設計案のみ。1Sandboxで店舗3件→Cookpad1件の同一プロセス経路を試したが通信で失敗したため、成功時の速度は未測定。Snapshot/warm維持は本実装前準備。

## 6. Nosana

[公式API](https://learn.nosana.com/api/intro.html)と実SDKで管理API `https://api.nosana.com`、Bearer管理キーを確認。残高APIはassigned=10、reserved=0、settled=0（開始時）。主催者案内は「10 NOS」と記載し、ダッシュボードは$10.00表示。単位を同一視せず、APIの値と表示をそのまま記録した。引換済み残高を実確認できたが、最終コストは末尾参照。

モデルは実テンプレート`qwen3-5-9b`を取得。Ollama 0.32.6、`qwen3.5:9b`、要件VRAM 9216MB。公式[Qwenモデルカード](https://huggingface.co/Qwen/Qwen3.5-9B)は画像とテキスト入力のモデル。[Ollama chat API](https://docs.ollama.com/api/chat)は`format` JSON Schema、images、tools、think、推論時間フィールドを提供。ただしこの組合せでの日本語→英語・JSON・vision・tool callの動作は未実行。モデル対応とサーバー対応と実デプロイ対応を分ける。

共有推論APIを利用者として呼べるURLは未確認。APIテンプレートに`gateway-qwen-4b`は存在するが、その説明は管理者が有効化するinternal gateway。これだけで利用可能な共有APIと判断しない。[自己デプロイ手順](https://learn.nosana.com/api/create-deployments.html)に従って実行した。

実問題:

1. 10分設定をcreate/startが受理し管理状態RUNNINGになったが、イベントは`Credit-paid jobs must have a timeout of at least 3600 seconds; 600 was requested`。登録成功≠ジョブ起動成功。60分に修正。
2. 最初の3060市場は実メタデータでは8GB。要件9GBを満たさないため、公式市場データで24GBの3090に変更。3060の一般的な製品知識に依存して確定してはいけない。
3. 3090ジョブも観測時QUEUED、node=null、time_start=0。ready URLを取得できず推論未実行。

3060表示単価0.04796 USD/h、3090表示単価0.19195 USD/hを実APIで確認。市場一覧の報酬単価と価格APIでは10%手数料の差が見られる。最終請求はこの見積と別。コードは上限0.25 USD/h・1replica・60分・確認済み残高内。検証終了後STOPPEDを確認した。

推論接続は実ジョブのサービスURLが得られて初めて`.env`へ設定する。推論用認証はテンプレート／サービス次第で管理Bearerとは別。現Ollamaテンプレートには推論キー設定が見られない。公開エンドポイントへ管理キーや個人情報を送らず、運用前にアクセス認証を検討する。

`validation/inference.py`は存在しないID、不正JSON、timeoutを扱い、残時間内で1回だけ修正。英語理由・候補ID・servingsのみを受け入れ、金額・栄養の生成をさせない。今回はURL未取得につきHTTP推論経路の成功検証はできていない。

## 7. AuraDB

実URI・ユーザー・パスワードでTLSとdriver接続を検証。最初はconnection acquisition 8秒でSessionExpired。TCP/TLSは成功したので20秒に延ばし、保存・検索に成功した。初回一連13.292秒。以後の統合ランナー内8.552秒、9.700秒。通常運用のp95ではない。

`graph.py`に一意制約、MERGE、パラメータ付きINGEST/RECIPES/CANDIDATES/COMMON。runId+source IDで観測を分離し、買い物日に有効なDealだけ対象。REQUIRESにraw・amount・unit・grams・行番号。日本語／英語は同一Ingredientへ対応し、不明の部位は別IDとした。

同じ入力を2回投入してDeal3・Recipe3で変化なし。実候補は成城石井に対して3件。他2店はDeal未確認なので候補比較結果なし。各行でmatching/missingを返した。Recipe同士の共通ブロッコリー等も実検索。金額不明の食材を不足候補から消していない。任意のモデルCypherは実行しない。

制約: 現検証はクエリごとのautocommitで、途中失敗時の一括ロールバックは未実装。再投入は同じデータの冪等性を検証したもので、削除された材料行の同期まで保証しない。古い観測runは残して検索から分離。本実装ではRun完了状態と1write transactionを追加する。

## 8. 栄養と購入計算

[文科省・精白米うるち飯01088](https://fooddb.mext.go.jp/details/details.pl?ITEM_NO=1_01088_7)、[ブロッコリー生花序06263](https://fooddb.mext.go.jp/details/details.pl?ITEM_NO=6_06263_7)の可食部100g値を実HTTPから抽出。出典は八訂増補2023。米は炊飯済み、ブロッコリーは生の花序。食品重量と状態が合う場合のみ適用。

| 食品100g | kcal | タンパク質g | 脂質g | 炭水化物g |
|---|---:|---:|---:|---:|
| 炊飯済みご飯 | 156 | 2.5 | 0.3 | 37.1 |
| 生ブロッコリー花序 | 37 | 5.4 | 0.6 | 6.6 |

算術実証: ご飯150g＋生ブロッコリー可食部100gで271kcal、P9.15g、F1.05g、C62.25g。完全な夕食の提案ではない。ブロッコリー廃棄率35%はDBにあるが、1株の重量は不明。肉部位、加熱損失、油の吸収、調味料等の値は揃っていないため全夕食栄養はnullが残る。1株、大さじ、にんにく1片を根拠なくgに変換していない。

計算コードは7食合算→パック切上げ。synthetic testでは100g×7食、300gパック200円で3パック600円。1食を400gに変更すると合計1000g、4パック800円。これは架空の**テスト値**であって店舗価格ではない。在庫食材は購入額から除外して栄養は加算。未知の単価・パック・換算・栄養は0にせずnull。比較元価格なしは節約額null。実チラシではパック重量がないので総購入額を確定できない。

14テスト成功。テスト対象はパック切上げ・共有・再計算・在庫・期限切れ・欠損・負値・JSON・ID・日数。実LLMの出力精度試験ではない。

## 9. 60秒／90秒と失敗処理

| 段階 | 実測秒 | 注記 |
|---|---:|---|
| ローカル店舗HTTP | 2.58〜4.275 | 6URLを3並列、約7.25秒 |
| チラシJPEG HTTP | 5.15〜6.55 | 画像取得、OCRなし |
| Cookpad検索HTTP | 2.794 | live/local |
| Cookpad本文HTTP | 2.295〜2.704 | 4件中Schema抽出3件 |
| ローカルスクリーンショット | 10.688〜16.702 | Chrome新規起動等込み |
| Daytona create | 1.837〜2.048 | coldテスト |
| Daytonaブラウザ導入 | 約30.1 | 本リクエスト外の準備が必要 |
| Daytona各ページ | 約0.7〜1.1 | **失敗までの時間** |
| Daytona検証全体 | 約49.4〜49.7 | 4取得失敗＋cleanup込み |
| Aura実保存＋検索＋再投入 | 13.292 | 初回成功時 |
| 1日統合ランナー | 8.552 | 候補適格性で失敗 |
| 7日統合ランナー | 9.701 | 候補適格性で失敗 |
| Nosana cold start | 未完了 | 管理登録／待機／実readyを区別 |
| Nosana warm inference | 未実行 | 推論URLなし |

失敗が90秒以内に返ったことと、完成結果が90秒以内に得られることは別。全体成功60/90秒は未検証。warm想定のstage予算はHANDOFF参照。統合コードに90秒のSIGALRM終端と各外部timeout。通信の細かなretry・全プロセス取消・3Sandbox共通締切は本実装で追加が必要。

## 10. 成果物と次の一手

- `validation/README.md`: セットアップ・個別／統合コマンド。
- `validation/.env.example`: 秘密値なし。実`.env`はgitignore。
- `validation/*.schema.json`, `schema.py`: 条件・価格・レシピ・選択Schema。
- `validation/artifacts/`: raw HTTP、hash、画像、出典付きサンプル、実測結果。
- `IMPLEMENTATION_HANDOFF.md`: 最小構成・担当・API/SSE・2時間のMust/Should/Nice/Cut。

技術検証の失敗理由は具体化できた。最優先はDaytonaのTier権限とNosanaの実GPU割当。次に取得許諾・3店舗パック価格・レシピ分量／時間／栄養を整える。既存要件や採用製品を外すことで「成功」にしない。

## 11. 追加検証・最終状態

代替案の詳細と公式出典は[WORKABLE_ALTERNATIVES.md](WORKABLE_ALTERNATIVES.md)。保存HTMLをDaytonaで解析する経路は3件・11.187秒で成功。日本語OCRは57.931秒で完走したが、自動確定Dealは0件。したがってsaved処理の参加は実証できたが、Daytonaライブ取得要件は未達。醤油の公式目安量に基づく換算を限定実装し、未知単位をnullに保つテストを追加した。

Nosana最終確認14:56:33 JST: deployment／2ジョブはSTOPPED、ノード未割当。assignedCredits=10、reservedCredits=0、settledCredits=0.02。開始時から0.02の消費を確認したが、管理UIの通貨表示とイベント案内のNOSを混同しない。Daytona作成5個は各finallyで削除成功。Daytona残高の最終差額は未測定。追加のカード課金・top-upは行っていない。

食材ID修正後はrunIdをvalidation-20260912-v2に分け再検証。最新の時間はaura-result.json／result-1day.json／result-7day.jsonを参照。上記表は初回の観測値。候補3件・再投入Deal3/Recipe3を再確認。調理時間プロパティは全件nullでDBに未作成のためNeo4jがwarningを返すが、null候補として検索は完了する。

最終集計: 2026-09-12T15:02:44.968719+09:00。最初の保存HTTP記録（2026-09-12T05:27:12.775952+00:00）から約35.5分。これより前の環境確認・調査を含まない作業時間の下限であり、2時間の本実装時間とは別。
