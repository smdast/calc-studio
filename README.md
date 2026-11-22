# Calc Studio

関数電卓、記号積分、連立方程式、行列・ベクトル、グラフを備えたブラウザアプリです。ブラウザのインストール機能で PWA として利用できます。初回のオンライン読み込みで計算用ファイルの保存が完了すると、オフラインでも利用できます。

[Calc Studio を開く](https://smdast.github.io/calc-studio/)

## ローカル起動

Node.js 24 で以下を実行します。初回は npm の依存関係と記号計算用の配布ファイルを取得するため、インターネット接続が必要です。

~~~sh
npm ci
npm run dev
~~~

`npm run build` で GitHub Pages に配置する配布用ファイルが生成されます。`npm run preview` で配布版のサービスワーカーも確認できます。
