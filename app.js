// ==========================================
// 輔具盤點管理系統 - 簡化版本
// ==========================================

let currentUser = null;
let staffList = [];
let allEquipmentList = [];

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

let myEquipmentList = [];
let currentInventoryStatus = '';

function loadMyEquipment() {
  if (!currentUser) return;
  
  const listContainer = document.getElementById('myEquipmentList');
  const countDisplay = document.getElementById('myEquipmentCount');
  listContainer.innerHTML = '<div class="loading">載入中...</div>';
  
  // 設定盤點狀態標籤點擊事件
  setupMyTabs();
  
  callAPI('getEquipmentByStaff', { staffName: currentUser.name }, function(response) {
    if (response.success) {
      myEquipmentList = response.data;
      displayMyEquipmentList(response.data, listContainer, countDisplay);
    } else {
      listContainer.innerHTML = '<div class="loading">載入失敗</div>';
      showToast('載入我的輔具清單失敗', 'error');
    }
  });
}

function setupMyTabs() {
  const tabs = document.querySelectorAll('.my-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', function() {
      // 移除所有 active
      tabs.forEach(t => t.classList.remove('active'));
      // 設定當前 active
      this.classList.add('active');
      
      // 取得選擇的盤點狀態
      currentInventoryStatus = this.dataset.inventoryStatus || '';
      
      // 篩選並顯示
      filterMyEquipmentByInventoryStatus();
    });
  });
}

function filterMyEquipmentByInventoryStatus() {
  const listContainer = document.getElementById('myEquipmentList');
  const countDisplay = document.getElementById('myEquipmentCount');
  
  if (!currentInventoryStatus) {
    // 顯示全部
    displayMyEquipmentList(myEquipmentList, listContainer, countDisplay);
  } else {
    // 根據盤點狀態篩選
    const filtered = myEquipmentList.filter(equipment => {
      const inventoried = isInventoriedThisMonth(equipment.lastInventory);
      if (currentInventoryStatus === 'inventoried') {
        return inventoried;
      } else if (currentInventoryStatus === 'not-inventoried') {
        return !inventoried;
      }
      return true;
    });
    displayMyEquipmentList(filtered, listContainer, countDisplay);
  }
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
  const inventoried = isInventoriedThisMonth(equipment.lastInventory);
  
  card.innerHTML = `
    <div class="equipment-card-header">
      <div>
        <div class="equipment-card-title">${equipment.equipmentName}</div>
        <div class="equipment-card-id">${equipment.propertyId}</div>
      </div>
      <div class="header-badges">
        <span class="status-badge" data-status="${equipment.currentStatus}">${equipment.currentStatus}</span>
        <span class="inventory-badge ${inventoried ? 'inventoried' : 'not-inventoried'}">
          <i class="fas ${inventoried ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i>
          ${inventoried ? '已盤點' : '未盤點'}
        </span>
      </div>
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
      ${equipment.lastInventory ? `
      <div class="equipment-card-row">
        <i class="fas fa-clock"></i>
        <span>最後盤點：${equipment.lastInventory}</span>
      </div>
      ` : ''}
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
  
  // 先根據盤點狀態篩選
  let baseList = myEquipmentList;
  if (currentInventoryStatus) {
    baseList = myEquipmentList.filter(equipment => {
      const inventoried = isInventoriedThisMonth(equipment.lastInventory);
      if (currentInventoryStatus === 'inventoried') {
        return inventoried;
      } else if (currentInventoryStatus === 'not-inventoried') {
        return !inventoried;
      }
      return true;
    });
  }
  
  // 再根據搜尋詞篩選
  if (!searchTerm) {
    const container = document.getElementById('myEquipmentList');
    const countDisplay = document.getElementById('myEquipmentCount');
    displayMyEquipmentList(baseList, container, countDisplay);
    return;
  }
  
  const filtered = baseList.filter(equipment => {
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

function isInventoriedThisMonth(lastInventory) {
  if (!lastInventory) return false;
  
  // 解析最後盤點時間
  let inventoryDate;
  if (typeof lastInventory === 'string') {
    // 嘗試解析字串格式：YYYY/M/D HH:mm:ss 或 YYYYMMDD
    inventoryDate = new Date(lastInventory);
  } else {
    inventoryDate = lastInventory;
  }
  
  // 檢查日期是否有效
  if (isNaN(inventoryDate.getTime())) return false;
  
  // 取得當前年月
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  
  // 取得盤點年月
  const inventoryYear = inventoryDate.getFullYear();
  const inventoryMonth = inventoryDate.getMonth();
  
  // 判斷是否為本月
  return inventoryYear === currentYear && inventoryMonth === currentMonth;
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
