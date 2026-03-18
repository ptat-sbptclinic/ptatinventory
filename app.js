// ==========================================
// 輔具盤點管理系統 - 簡化版本
// ==========================================

let currentUser = null;
let staffList = [];
let allEquipmentList = [];
let myEquipmentList = [];
let html5QrCode = null;
let isScannerRunning = false;
let isProcessingScanResult = false;
let lastScannedCode = '';

// ==========================================
// 初始化
// ==========================================

document.addEventListener('DOMContentLoaded', function() {
  initializeApp();
});

function initializeApp() {
  if (!checkConfig()) {
    console.error('請先設定 Google Apps Script 部署網址');
    showToast('系統設定錯誤，請聯絡管理員', 'error');
    return;
  }
  
  setupEventListeners();
  loadStaffList();
  checkLoginStatus();
}

function checkConfig() {
  return CONFIG && CONFIG.API_URL && CONFIG.API_URL !== 'YOUR_APPS_SCRIPT_URL_HERE';
}

// ==========================================
// 事件監聽器
// ==========================================

function setupEventListeners() {
  document.getElementById('loginBtn').addEventListener('click', handleLogin);
  document.getElementById('logoutBtn').addEventListener('click', handleLogout);
  
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', function() {
      switchView(this.dataset.view);
    });
  });
  
  document.getElementById('applyFilterBtn').addEventListener('click', loadEquipmentList);
  
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', handleSearch);
  }
  
  const mySearchInput = document.getElementById('mySearchInput');
  if (mySearchInput) {
    mySearchInput.addEventListener('input', handleMySearch);
  }

  const startScanBtn = document.getElementById('startScanBtn');
  if (startScanBtn) {
    startScanBtn.addEventListener('click', startBarcodeScanner);
  }

  const stopScanBtn = document.getElementById('stopScanBtn');
  if (stopScanBtn) {
    stopScanBtn.addEventListener('click', stopBarcodeScanner);
  }
}

// ==========================================
// 人員管理
// ==========================================

function loadStaffList() {
  console.log('開始載入人員清單...');
  
  callAPI('getStaffList', {}, function(response) {
    console.log('人員清單回應:', response);
    
    if (response.success && response.data) {
      staffList = response.data;
      console.log('人員數量:', staffList.length);
      displayStaffList();
    } else {
      console.error('載入人員清單失敗:', response.message);
      showToast('無法載入人員清單', 'error');
    }
  });
}

function displayStaffList() {
  const select = document.getElementById('staffSelect');
  if (!select) {
    console.error('找不到 staffSelect 元素');
    return;
  }
  
  select.innerHTML = '<option value="">請選擇人員</option>';
  
  if (!staffList || staffList.length === 0) {
    console.warn('人員清單為空');
    select.innerHTML = '<option value="">無可用人員</option>';
    return;
  }
  
  staffList.forEach(staff => {
    const option = document.createElement('option');
    option.value = staff.name;
    option.textContent = `${staff.name} (${staff.area})`;
    select.appendChild(option);
  });
  
  console.log('人員清單顯示完成');
}

// ==========================================
// 登入登出
// ==========================================

function handleLogin() {
  const staffName = document.getElementById('staffSelect').value;
  
  if (!staffName) {
    alert('請選擇人員');
    return;
  }
  
  const staff = staffList.find(s => s.name === staffName);
  if (!staff) {
    alert('找不到該人員');
    return;
  }
  
  currentUser = staff;
  localStorage.setItem('currentUser', JSON.stringify(staff));
  
  showLoginView(false);
  showToast(`歡迎，${staff.name}！`, 'success');
  switchView('my');
}

function handleLogout() {
  currentUser = null;
  localStorage.removeItem('currentUser');
  showLoginView(true);
  showToast('已登出', 'success');
}

function checkLoginStatus() {
  const savedUser = localStorage.getItem('currentUser');
  if (savedUser) {
    currentUser = JSON.parse(savedUser);
    showLoginView(false);
    switchView('my');
  } else {
    showLoginView(true);
  }
}

function showLoginView(show) {
  document.getElementById('loginView').style.display = show ? 'flex' : 'none';
  
  const navTabs = document.getElementById('navTabs');
  if (navTabs) {
    navTabs.style.display = show ? 'none' : 'flex';
  }
  
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.style.display = show ? 'none' : 'inline-block';
  }
  
  if (!show && currentUser) {
    document.getElementById('currentUser').textContent = currentUser.name;
  } else {
    document.getElementById('currentUser').textContent = '未登入';
  }
}

// ==========================================
// 視圖切換
// ==========================================

function switchView(viewName) {
  if (viewName !== 'scan') {
    stopBarcodeScanner();
  }

  const allViews = ['scanView', 'listView', 'loanView', 'myView'];
  allViews.forEach(viewId => {
    const view = document.getElementById(viewId);
    if (view) {
      view.style.display = 'none';
    }
  });
  
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.classList.remove('active');
  });
  
  const targetView = document.getElementById(viewName + 'View');
  if (targetView) {
    targetView.style.display = 'block';
  }
  
  const activeTab = document.querySelector(`[data-view="${viewName}"]`);
  if (activeTab) {
    activeTab.classList.add('active');
  }
  
  switch(viewName) {
    case 'list':
      loadEquipmentList();
      break;
    case 'my':
      loadMyEquipment();
      break;
    case 'loan':
      loadLoanList();
      break;
  }
}

// ==========================================
// 輔具清單
// ==========================================

function loadEquipmentList() {
  const area = document.getElementById('filterArea').value;
  const status = document.getElementById('filterStatus').value;
  
  const listContainer = document.getElementById('equipmentList');
  const countDisplay = document.getElementById('equipmentCount');
  listContainer.innerHTML = '<div class="loading">載入中...</div>';
  
  callAPI('getEquipmentList', { area: area, currentStatus: status }, function(response) {
    if (response.success) {
      allEquipmentList = response.data;
      displayEquipmentList(response.data, listContainer, countDisplay);
    } else {
      listContainer.innerHTML = '<div class="loading">載入失敗</div>';
    }
  });
}

function displayEquipmentList(equipmentList, container, countDisplay) {
  if (equipmentList.length === 0) {
    container.innerHTML = '<div class="loading">沒有符合條件的輔具</div>';
    if (countDisplay) countDisplay.textContent = '共 0 筆';
    return;
  }
  
  if (countDisplay) {
    countDisplay.textContent = `共 ${equipmentList.length} 筆`;
  }
  
  container.innerHTML = '';
  
  equipmentList.forEach(equipment => {
    const card = createEquipmentCard(equipment);
    container.appendChild(card);
  });
}

function createEquipmentCard(equipment) {
  const card = document.createElement('div');
  card.className = 'equipment-card';
  
  const area = getEquipmentArea(equipment);
  
  card.innerHTML = `
    <div class="equipment-card-header">
      <div>
        <div class="equipment-card-title">${equipment.equipmentName}</div>
        <div class="equipment-card-id">${equipment.propertyId}</div>
      </div>
      <span class="status-badge" data-status="${equipment.currentStatus}">${equipment.currentStatus}</span>
    </div>
    <div class="equipment-card-body">
      <div class="equipment-card-row">
        <i class="fas fa-tag"></i>
        <span>${equipment.category || '未分類'}</span>
      </div>
      <div class="equipment-card-row">
        <i class="fas fa-map-marker-alt"></i>
        <span>${area} - ${equipment.location}</span>
      </div>
      <div class="equipment-card-row">
        <i class="fas fa-user"></i>
        <span>${equipment.keeper}</span>
      </div>
    </div>
  `;
  
  return card;
}

function handleSearch(e) {
  const searchTerm = e.target.value.trim().toLowerCase();
  
  if (!searchTerm) {
    const container = document.getElementById('equipmentList');
    const countDisplay = document.getElementById('equipmentCount');
    displayEquipmentList(allEquipmentList, container, countDisplay);
    return;
  }
  
  const filtered = allEquipmentList.filter(equipment => {
    return (equipment.propertyId && equipment.propertyId.toLowerCase().includes(searchTerm)) ||
           (equipment.inventoryId && equipment.inventoryId.toLowerCase().includes(searchTerm)) ||
           (equipment.equipmentName && equipment.equipmentName.toLowerCase().includes(searchTerm)) ||
           (equipment.keeper && equipment.keeper.toLowerCase().includes(searchTerm)) ||
           (equipment.category && equipment.category.toLowerCase().includes(searchTerm)) ||
           (equipment.location && equipment.location.toLowerCase().includes(searchTerm)) ||
           (equipment.currentStatus && equipment.currentStatus.toLowerCase().includes(searchTerm)) ||
           (equipment.notes && equipment.notes.toLowerCase().includes(searchTerm));
  });
  
  const container = document.getElementById('equipmentList');
  const countDisplay = document.getElementById('equipmentCount');
  displayEquipmentList(filtered, container, countDisplay);
}

// ==========================================
// 我的輔具
// ==========================================

function loadMyEquipment() {
  if (!currentUser) return;
  
  const listContainer = document.getElementById('myEquipmentList');
  const countDisplay = document.getElementById('myEquipmentCount');
  listContainer.innerHTML = '<div class="loading">載入中...</div>';
  
  callAPI('getEquipmentByStaff', { staffName: currentUser.name }, function(response) {
    if (response.success) {
      myEquipmentList = response.data;
      displayMyEquipmentList(response.data, listContainer, countDisplay);
    } else {
      listContainer.innerHTML = '<div class="loading">載入失敗</div>';
    }
  });
}

function displayMyEquipmentList(equipmentList, container, countDisplay) {
  if (equipmentList.length === 0) {
    container.innerHTML = '<div class="loading">沒有符合條件的輔具</div>';
    if (countDisplay) countDisplay.textContent = '共 0 筆';
    return;
  }
  
  if (countDisplay) {
    countDisplay.textContent = `共 ${equipmentList.length} 筆`;
  }
  
  container.innerHTML = '';
  
  equipmentList.forEach(equipment => {
    const card = createMyEquipmentCard(equipment);
    container.appendChild(card);
  });
}

function createMyEquipmentCard(equipment) {
  const card = document.createElement('div');
  card.className = 'equipment-card';
  
  const area = getEquipmentArea(equipment);
  
  card.innerHTML = `
    <div class="equipment-card-header">
      <div>
        <div class="equipment-card-title">${equipment.equipmentName}</div>
        <div class="equipment-card-id">${equipment.propertyId}</div>
      </div>
      <span class="status-badge" data-status="${equipment.currentStatus}">${equipment.currentStatus}</span>
    </div>
    <div class="equipment-card-body">
      <div class="equipment-card-row">
        <i class="fas fa-tag"></i>
        <span>${equipment.category || '未分類'}</span>
      </div>
      <div class="equipment-card-row">
        <i class="fas fa-map-marker-alt"></i>
        <span>${area} - ${equipment.location}</span>
      </div>
      ${equipment.notes ? `
      <div class="equipment-card-row">
        <i class="fas fa-comment"></i>
        <span>${equipment.notes}</span>
      </div>
      ` : ''}
    </div>
    <div class="equipment-card-footer">
      <button class="btn btn-primary btn-small" onclick="quickInventory('${equipment.propertyId}')">
        <i class="fas fa-check"></i> 完成盤點
      </button>
    </div>
  `;
  
  return card;
}

function handleMySearch(e) {
  const searchTerm = e.target.value.trim().toLowerCase();
  
  if (!searchTerm) {
    const container = document.getElementById('myEquipmentList');
    const countDisplay = document.getElementById('myEquipmentCount');
    displayMyEquipmentList(myEquipmentList, container, countDisplay);
    return;
  }
  
  const filtered = myEquipmentList.filter(equipment => {
    return (equipment.propertyId && equipment.propertyId.toLowerCase().includes(searchTerm)) ||
           (equipment.inventoryId && equipment.inventoryId.toLowerCase().includes(searchTerm)) ||
           (equipment.equipmentName && equipment.equipmentName.toLowerCase().includes(searchTerm));
  });
  
  const container = document.getElementById('myEquipmentList');
  const countDisplay = document.getElementById('myEquipmentCount');
  displayMyEquipmentList(filtered, container, countDisplay);
}

window.quickInventory = function(propertyId) {
  if (!currentUser) {
    alert('請先登入');
    return;
  }
  
  if (confirm('確定要完成此輔具的盤點嗎？')) {
    showLoading(true);
    
    callAPI('quickInventory', {
      propertyId: propertyId,
      staffName: currentUser.name,
      photoData: '',
      newLocation: '',
      newCurrentStatus: ''
    }, function(response) {
      showLoading(false);
      
      if (response.success) {
        showToast('盤點完成！', 'success');
        loadMyEquipment();
      } else {
        alert(response.message);
      }
    });
  }
}

// ==========================================
// 外借管理
// ==========================================

let allLoanEquipment = [];
let currentLoanArea = '';

function loadLoanList() {
  const listContainer = document.getElementById('loanList');
  const countDisplay = document.getElementById('loanCount');
  
  if (!listContainer) {
    console.error('找不到 loanList 元素');
    return;
  }
  
  listContainer.innerHTML = '<div class="loading">載入中...</div>';
  
  // 設定區域標籤點擊事件
  setupLoanTabs();
  
  // 載入所有外借中的輔具
  callAPI('getEquipmentList', { area: '', currentStatus: '' }, function(response) {
    if (response.success) {
      // 篩選「目前動態」包含「外借中」的輔具
      allLoanEquipment = response.data.filter(equipment => {
        return equipment.currentDynamic && equipment.currentDynamic.includes('外借中');
      });
      
      console.log('外借中的輔具總數:', allLoanEquipment.length);
      displayLoanList(allLoanEquipment, listContainer, countDisplay);
    } else {
      listContainer.innerHTML = '<div class="loading">載入失敗</div>';
      showToast('載入外借清單失敗', 'error');
    }
  });
}

function setupLoanTabs() {
  const tabs = document.querySelectorAll('.loan-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', function() {
      // 移除所有 active
      tabs.forEach(t => t.classList.remove('active'));
      // 設定當前 active
      this.classList.add('active');
      
      // 取得選擇的區域
      currentLoanArea = this.dataset.area || '';
      
      // 篩選並顯示
      filterLoanByArea();
    });
  });
}

function filterLoanByArea() {
  const listContainer = document.getElementById('loanList');
  const countDisplay = document.getElementById('loanCount');
  
  if (!currentLoanArea) {
    // 顯示全部
    displayLoanList(allLoanEquipment, listContainer, countDisplay);
  } else {
    // 根據區域篩選（使用財產編號或保管人區域）
    const filtered = allLoanEquipment.filter(equipment => {
      const area = getEquipmentArea(equipment);
      return area === currentLoanArea;
    });
    displayLoanList(filtered, listContainer, countDisplay);
  }
}

function displayLoanList(loanList, container, countDisplay) {
  if (loanList.length === 0) {
    container.innerHTML = '<div class="loading">目前沒有外借中的輔具</div>';
    if (countDisplay) countDisplay.textContent = '共 0 筆';
    return;
  }
  
  if (countDisplay) {
    countDisplay.textContent = `共 ${loanList.length} 筆`;
  }
  
  container.innerHTML = '';
  
  loanList.forEach(equipment => {
    const card = createLoanCard(equipment);
    container.appendChild(card);
  });
}

function createLoanCard(equipment) {
  const card = document.createElement('div');
  card.className = 'equipment-card';
  
  const area = getEquipmentArea(equipment);
  
  card.innerHTML = `
    <div class="equipment-card-header">
      <div>
        <div class="equipment-card-title">${equipment.equipmentName}</div>
        <div class="equipment-card-id">${equipment.propertyId}</div>
      </div>
      <span class="status-badge" data-status="外借中">外借中</span>
    </div>
    <div class="equipment-card-body">
      <div class="equipment-card-row">
        <i class="fas fa-tag"></i>
        <span>${equipment.category || '未分類'}</span>
      </div>
      <div class="equipment-card-row">
        <i class="fas fa-user"></i>
        <span>保管人：${equipment.keeper}</span>
      </div>
      <div class="equipment-card-row">
        <i class="fas fa-map-marker-alt"></i>
        <span>${area} - ${equipment.location}</span>
      </div>
      ${equipment.currentDynamic ? `
      <div class="equipment-card-row">
        <i class="fas fa-info-circle"></i>
        <span>${equipment.currentDynamic}</span>
      </div>
      ` : ''}
    </div>
  `;
  
  return card;
}

// ==========================================
// 條碼掃描與盤點
// ==========================================

function normalizeScannedCode(rawText) {
  if (!rawText) return '';
  return rawText.replace(/\s+/g, '').trim();
}

async function startBarcodeScanner() {
  if (!currentUser) {
    showToast('請先登入', 'error');
    return;
  }

  if (typeof Html5Qrcode === 'undefined') {
    showToast('掃描元件未載入，請重新整理頁面', 'error');
    return;
  }

  const container = document.getElementById('scannerContainer');
  const startBtn = document.getElementById('startScanBtn');
  const stopBtn = document.getElementById('stopScanBtn');
  const resultDiv = document.getElementById('scanResult');

  if (!container || !startBtn || !stopBtn) {
    showToast('掃描介面初始化失敗', 'error');
    return;
  }

  if (!html5QrCode) {
    html5QrCode = new Html5Qrcode('html5QrReader');
  }

  container.style.display = 'block';
  startBtn.style.display = 'none';
  stopBtn.style.display = 'inline-flex';
  if (resultDiv) {
    resultDiv.style.display = 'none';
    resultDiv.innerHTML = '';
  }

  const scanConfig = {
    fps: 10,
    qrbox: { width: 260, height: 120 },
    aspectRatio: 1.777,
    rememberLastUsedCamera: true
  };

  try {
    await html5QrCode.start(
      { facingMode: { exact: 'environment' } },
      scanConfig,
      onScanSuccess,
      () => {}
    );
    isScannerRunning = true;
  } catch (exactError) {
    try {
      await html5QrCode.start(
        { facingMode: 'environment' },
        scanConfig,
        onScanSuccess,
        () => {}
      );
      isScannerRunning = true;
    } catch (error) {
      console.error('啟動掃描失敗:', error);
      showToast('無法啟動相機掃描，請確認相機權限', 'error');
      stopBarcodeScanner();
    }
  }
}

async function stopBarcodeScanner() {
  const container = document.getElementById('scannerContainer');
  const startBtn = document.getElementById('startScanBtn');
  const stopBtn = document.getElementById('stopScanBtn');

  if (html5QrCode && isScannerRunning) {
    try {
      await html5QrCode.stop();
      await html5QrCode.clear();
    } catch (error) {
      console.warn('停止掃描時發生錯誤:', error);
    }
  }

  isScannerRunning = false;
  isProcessingScanResult = false;
  lastScannedCode = '';

  if (container) container.style.display = 'none';
  if (startBtn) startBtn.style.display = 'inline-flex';
  if (stopBtn) stopBtn.style.display = 'none';
}

function onScanSuccess(decodedText) {
  const barcode = normalizeScannedCode(decodedText);
  if (!barcode) return;

  if (isProcessingScanResult) return;
  if (barcode === lastScannedCode) return;

  isProcessingScanResult = true;
  lastScannedCode = barcode;
  handleBarcodeDetected(barcode);
}

function handleBarcodeDetected(barcode) {
  stopBarcodeScanner();

  const resultDiv = document.getElementById('scanResult');
  if (!resultDiv) return;

  resultDiv.style.display = 'block';
  resultDiv.innerHTML = `
    <p><strong>掃描到條碼：</strong>${barcode}</p>
    <p>正在完成盤點...</p>
  `;

  callAPI('quickInventory', {
    propertyId: barcode,
    staffName: currentUser.name,
    photoData: '',
    newLocation: '',
    newCurrentStatus: ''
  }, function(response) {
    isProcessingScanResult = false;

    if (response.success) {
      resultDiv.innerHTML = `
        <p style="color: #059669;"><i class="fas fa-check-circle"></i> 盤點成功</p>
        <p><strong>財產編號：</strong>${barcode}</p>
        <button class="btn btn-primary" onclick="restartBarcodeScanner()">
          <i class="fas fa-redo"></i> 繼續掃描
        </button>
      `;
      showToast('掃描盤點成功', 'success');
      loadMyEquipment();
    } else {
      resultDiv.innerHTML = `
        <p style="color: #DC2626;"><i class="fas fa-times-circle"></i> 盤點失敗</p>
        <p>${response.message || '請確認條碼是否正確'}</p>
        <button class="btn btn-primary" onclick="restartBarcodeScanner()">
          <i class="fas fa-redo"></i> 重新掃描
        </button>
      `;
      showToast('盤點失敗：' + (response.message || '未知錯誤'), 'error');
    }
  });
}

window.restartBarcodeScanner = function() {
  const resultDiv = document.getElementById('scanResult');
  if (resultDiv) {
    resultDiv.style.display = 'none';
    resultDiv.innerHTML = '';
  }
  startBarcodeScanner();
};

// ==========================================
// 工具函數
// ==========================================

function extractAreaFromLocation(location) {
  if (!location) return '';
  if (location.includes('屏中區')) return '屏中區';
  if (location.includes('屏北區')) return '屏北區';
  return '';
}

function getEquipmentArea(equipment) {
  // 方法1：根據財產編號第2碼判斷（A=屏北區，B=屏中區）
  if (equipment.propertyId && equipment.propertyId.length >= 2) {
    const secondChar = equipment.propertyId.charAt(1).toUpperCase();
    if (secondChar === 'A') {
      return '屏北區';
    } else if (secondChar === 'B') {
      return '屏中區';
    }
  }
  
  // 方法2：根據保管人查詢所屬區域
  if (equipment.keeper && staffList.length > 0) {
    const staff = staffList.find(s => s.name === equipment.keeper);
    if (staff && staff.area) {
      return staff.area;
    }
  }
  
  // 方法3：從放置地點提取（備用）
  return extractAreaFromLocation(equipment.location);
}

function callAPI(action, params, callback) {
  // 只有非 getStaffList 的請求才顯示 loading
  const showLoader = action !== 'getStaffList';
  if (showLoader) showLoading(true);
  
  const url = CONFIG.API_URL + '?action=' + action;
  const formData = new FormData();
  
  for (let key in params) {
    formData.append(key, params[key]);
  }
  
  console.log('API 請求:', action, params);
  
  fetch(url, {
    method: 'POST',
    body: formData
  })
  .then(response => response.json())
  .then(data => {
    if (showLoader) showLoading(false);
    console.log('API 回應:', action, data);
    callback(data);
  })
  .catch(error => {
    if (showLoader) showLoading(false);
    console.error('API Error:', action, error);
    showToast('網路錯誤，請檢查連線', 'error');
    callback({ success: false, message: '網路錯誤' });
  });
}

function showLoading(show) {
  const loader = document.getElementById('loader');
  if (loader) {
    loader.style.display = show ? 'flex' : 'none';
  }
}

function showToast(message, type) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  
  toast.textContent = message;
  toast.className = 'toast show ' + (type || 'info');
  
  setTimeout(() => {
    toast.className = 'toast';
  }, 3000);
}
