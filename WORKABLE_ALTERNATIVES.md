# 当初経路が動かない場合の代替案

2026-09-12実検証。3製品・固定3店舗・Cookpad限定は維持する。代替経路での成功と、当初のlive要件達成を区別する。

| 障害 | 可能な方法 | 今回の確認 | 残る条件 |
|---|---|---|---|
| Daytona Tier 1から対象サイトへ接続reset | 取得済み資料をアップロードし、Daytonaで解析 | **実行成功**。Cookpad保存HTML3件からRecipe JSON-LD3件。11.187秒、Sandbox削除済み | route=saved。Daytonaによるlive取得・閲覧画像にはならない |
| Daytonaでライブ調査必須 | 公式のネットワーク利用条件を満たす／イベント窓口に権限を確認 | **資料確認のみ**。Tier1/2は組織制限が優先。sandbox allowlistだけでは解除できない | イベント特例の可否は未確認。連絡・課金はしていない |
| Nosanaが起動しない | 60分timeout、要件を満たす3090市場に修正 | **実行したが推論失敗**。3090で約8分待ってもQUEUED、ノード未割当 | 使えるGPU、実ready URLが必要。管理RUNNINGをready判定にしない |
| Nosana cold startが90秒に入らない | イベント側の稼働済みNosana推論先を確認／自分のジョブを事前にwarm化 | **資料確認のみ**。公に利用可能な共有URLは確認できず | 実URL・認証と1回の構造化推論を検証。起動待ちは事前準備へ |
| Nosana visionが使えない | DaytonaでTesseract日本語OCR、商品領域の照合 | **OCR実行成功、商品価格の自動確定は失敗**。57.931秒、うちOCR39.930秒 | 全面OCRは誤認識多数。商品領域分割・原画像照合が必要。確認済みDeal0件 |
| 調味料の大さじ→gが不明 | 食品別の公式目安表を使う | **実装・テスト成功**。醤油大さじ1/2→9g、basis=estimated | 商品差・計量差を保持。「フライパン4周」や1株には使えない |
| パック価格が不明 | 同じ店舗の当日パックラベルを記録し、saved入力にする | **提案のみ**。今回の肉チラシは100g単価まで | 実パック重量・税込価格を取得するまで予算判定unknown。想像の300gにしない |
| Cookpad調理時間・量が欠損 | 許諾条件を確認した少数の保存候補を人が検証し、出典つき補足 | **提案のみ**。今回の3候補は未適格 | 10〜14件、30分、人数、材料量・複合調味料の除外条件を確認。別レシピサイトへ変更しない |

## Daytonaで実行できたsaved経路

`validation/daytona_saved.py`は保存済み3ファイルをアップロードし、Daytona上でPython標準HTMLParserからJSON-LDを抽出する。入力SHA256を保存し、出力をローカルに回収。`daytona-saved-result.json`、`daytona-saved-recipes.json`が証拠。ネットワーク制限の迂回ではなく、許されたファイル解析として実行した。現在の統合ランナーはローカル正規化サンプルをAuraへ渡す構成で、このDaytona出力を自動接続していない。

公式[ネットワーク制限](https://www.daytona.io/docs/en/network-limits/)と[アカウント上限](https://www.daytona.io/docs/en/limits/)を確認。公開標準条件ではTier2はカード登録＋$25 top-up、Tier3は$500 top-up。クレジット$200の付与だけで全面ネット接続が開くわけではない。イベントで別の扱いができるかは窓口確認事項であり、$500を自動で支払っていない。

## Nosanaは接続先を創作しない

SDKのavailable GPU APIは今回`[]`を返した（`nosana-availability.json`）。これは観測時点のAPI結果であり、ネットワーク全体の恒久的な欠品を意味しない。`gateway-qwen-4b`テンプレートの説明は管理者向けinternal gatewayで、一般利用者向け共有APIの証拠にならない。

公式テンプレートにはDeepSeek R1 Qwen 1.5Bなど小型モデルもあるが、GPU空き・日本語品質・JSON遵守は未検証。モデルを小さくすれば今回の割当待ちが解消すると断定しない。まず[公式デプロイ手順](https://learn.nosana.com/api/create-deployments.html)の稼働済みサービスを得て、実候補IDで試す。別基盤への丸ごとの変更はNosana必須条件を満たさない。

最終確認2026-09-12 14:56:33 JSTでdeploymentと2ジョブはSTOPPED、ノード未割当。APIクレジットassigned=10、reserved=0、settled=0.02。`nosana-final.json`に記録。推論未実行でもsettledが0ではなかったため、無料だったとは報告しない。

## OCRと換算の境界

[Tesseract公式](https://tesseract-ocr.github.io/tessdoc/)の日本語traineddataをDaytonaに導入して実行。TSVは座標・信頼度を保持する。例えば「ブロッコリー」はconfidence約61.44、「\\312」は約92.45で認識されたが、他の商品名・税区分・期間を一貫して結べていない。これらのconfidenceは取引情報の正確さの確率ではない。チラシ全面を単純OCRするだけでは足りない。次は商品領域に分けたOCR＋原画像照合、または稼働後のNosana visionで構造化し、Schemaと価格期間検査をかける。別OCR候補[PaddleOCR公式日本語対応](https://paddlepaddle.github.io/PaddleOCR/v3.1.0/en/version3.x/algorithm/PP-OCRv5/PP-OCRv5_multi_languages.html)は資料確認のみ。OpenAI APIを必須化していない。

[味の素の調味料目安量](https://park.ajinomoto.co.jp/contents/basic/chomiryo_bunryou/)で醤油小さじ6g、大さじ18gを確認し、`conversion.py`に限定実装した。実重量ではないのでestimated。現サンプルへの自動換算は未接続。炊飯前後は[農水省](https://www.maff.go.jp/j/syouan/keikaku/soukatu/okome_summary/02/charact_eristic_01.html)の約2.2倍という目安もあるが、炊き方で変わるため厳密な実重量換算として採用していない。現在は炊飯済みご飯の栄養値を、その使用gに直接適用する。

当面の実行可能な順序は、saved資料のDaytona解析→正規化→Aura候補検索を接続し、Nosanaの稼働先が確保できた時点で推論を足すこと。saved版が通っても、ライブ画像・3店舗現価格・30分適格性・全体90秒は個別に再検証する。
