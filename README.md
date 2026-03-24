# ptatinventory

輔具盤點管理系統。

## 專案結構

本 repo 已整理為單層結構，不再依賴舊的 `frontend/`、`backend/` 資料夾。

- `index.html`: 前端頁面
- `styles.css`: 樣式
- `app.js`: 前端主要邏輯
- `camera.js`: 拍照上傳輔助
- `signature.js`: 簽名功能
- `config.js`: 前端設定，請確認 `API_URL`
- `service-worker.js`: PWA 快取
- `manifest.json`: PWA 設定
- `Code_v2.gs`: Google Apps Script 後端

## 部署重點

1. 將 `Code_v2.gs` 同步到 Apps Script 專案並重新部署 Web App
2. 確認 `config.js` 中的 `API_URL` 指向最新部署網址
3. 部署本資料夾中的前端檔案即可

## 注意

- 目前應以 `ptatinventory-git` 為唯一維護來源
- 舊的 `ptatinventory` 資料夾不再是執行必需來源
