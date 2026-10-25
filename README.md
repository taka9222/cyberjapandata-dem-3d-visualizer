# DEM 3D Point Cloud Viewer

日本の標高タイルを表示するWebベースの3D地形ビューアです。

## 起動方法

このフォルダーをカレントディレクトリにして、ローカルHTTPサーバーを起動します。

```powershell
python -m http.server 8000
```

ブラウザーで `http://localhost:8000/` を開いてください。ES modules のため、`index.html` を直接開くのではなくHTTPサーバー経由で起動します。

## 標高タイルデータ

標高タイルはサイズが大きいため、このリポジトリには含めていません。利用する場合はPNGタイルを `xyz/dem_merge/{z}/{x}_{y}.png` に配置してください。タイルデータの取得元・利用条件に従ってください。

## 依存ライブラリ

Three.jsの配布ファイルを `vendor/three/` に含めています。ライセンスは `vendor/three/LICENSE` を参照してください。
