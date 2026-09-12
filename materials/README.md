# 資料の追加方法

実例は `manifest.json`（Cookpad HTML3件・チラシ画像1件・目視確認済み商品JSON1件）。Schemaは`manifest.schema.json`。新たな検索・OCRを行わず、指定ディレクトリに置いた資料だけ扱います。

1. 元資料を `materials/files/` 配下へ置く。HTML、JSON、JPEG/PNG/WebP、PDF対応。シンボリックリンク経由でもこのディレクトリ外のファイルは拒否します。
2. manifest.documentsへ追記。documentIdは一意、localPathはmaterials基準の相対パス。取得時刻obtainedAt、元URL（不明ならnull）、取得方法、SHA256を記入。チラシ内の異なる商品期間を画像全体の一律期間にしないでください。
3. HTMLのkindはrecipe、recipeSourceIdはCookpadのID。HTMLはデータとして解析し、JavaScriptを実行しません。
4. 確認済みJSONはformat=json、derivedFromDocumentIdで登録元資料を参照。内容は`{"deals": [...], "recipes": [...], "foods": {...}}`。不要な配列・辞書は省略可。Deal/RecipeはvalidationのSchema、foodsは食材ID→kcal/protein/fat/carbs→Quantityです。材料量はRecipe.requirementsに保持します。
5. 画像・PDFはSource previewとして登録・表示。自動抽出は未対応。既存全面OCRの自動確定商品数は0のままです。

確認済みJSONに実価格を入れるときは、税区分・数量・単位・パック重量・有効日を別々に記録。100g単価しか分からなければpackGramsはnull。推定購入重量を元資料のpackGramsへ書かないでください。

人の補足はdocument.supplementsへ分離します。各項目はtargetId、field、value、basis(source/estimated)、reason、confirmedAt、sourceUrl(null可)。元documentIdを根拠参照として保持します。同一targetId/fieldへの二重補足は拒否します。

現在対応するfield:

- レシピ: cookingMinutes、servings、`grams:<ingredientId>`、allergens、exclusionReviewed。
- 商品: priceYen、packGrams、assumedPurchaseGrams。

allergensとexclusionReviewedはsourceによる確認が必要。推定で除外確認済みにしません。assumedPurchaseGramsはestimatedのみ。100gなどの単価×仮定重量から計算する額もestimatedとして残ります。supplementsの値は元抽出値と別に保存され、元データを上書きしたように表示しません。

grams補足は同じ食材の材料行が複数ある場合に曖昧なので拒否します。その場合は元資料に結び付けた確認済みRecipe JSONで行ごとの分量を用意してください。調理済み/生・可食部・乾燥米/炊飯済みご飯を同じ重量として混ぜないでください。

hash確認:

```sh
shasum -a 256 materials/files/your-file.html
.venv/bin/python backend/check_materials.py
```

確認コマンドは資料の検証のみで、Sandboxを作成しません。API開始時もパス・hash・Schemaを再確認します。新規資料に不足があっても画像登録・既存適格資料の解析経路を拡張できます。Schema違反や改変hashは明確に失敗として修正してください。
