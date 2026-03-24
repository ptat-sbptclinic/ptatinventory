// ==========================================
// 系統設定檔
// ==========================================

const CONFIG = {
  // Google Apps Script 部署網址
  // 部署後請將網址填入此處
  API_URL: 'https://script.google.com/macros/s/AKfycby2F_ou8J4OPTKSyLmLL-9ib8IB1h-cFkNQy_XruDihW42_AHwr7-ZX03wZ7XBPiGSocA/exec',
  
  // 系統名稱
  APP_NAME: '輔具盤點管理系統',

  // 使用說明書網址
  // 若獨立部署到其他 repo，請改成完整網址
  MANUAL_URL: './user-manual.html',
  
  // 版本
  VERSION: '2.0.0',
  
  // 區域選項
  AREAS: ['屏中區', '屏北區'],
  
  // 狀態選項（ICF分類）
  STATUS_OPTIONS: ['展示', '待用', '租借', '報廢'],
  
  // 目前動態選項
  CURRENT_STATUS_OPTIONS: ['展示中', '外借中', '維護中'],
  
  // 外借狀態選項
  LOAN_STATUS: ['外借中', '已歸還', '逾期'],
  
  // 當次作為選項
  CURRENT_ACTION_OPTIONS: ['需清潔', '需充電', '需清潔,需充電'],
  
  // 照片設定
  PHOTO_SETTINGS: {
    maxWidth: 1920,
    maxHeight: 1920,
    quality: 0.8
  },
  
  // 簽名設定
  SIGNATURE_SETTINGS: {
    width: 400,
    height: 200,
    lineWidth: 2,
    lineColor: '#000000'
  },
  
  // 盤點設定
  INVENTORY_SETTINGS: {
    autoPhoto: true,           // 自動拍照
    autoAction: true,          // 自動判斷需清潔/需充電
    electricKeyword: '電動'    // 判斷需充電的關鍵字
  }
};

// 檢查設定是否完成
function checkConfig() {
  if (!CONFIG.API_URL || CONFIG.API_URL === 'YOUR_APPS_SCRIPT_URL_HERE') {
    console.warn('請先設定 Google Apps Script 部署網址');
    return false;
  }
  return true;
}
