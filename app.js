// ==========================================
// 輔具盤點管理系統 - 簡化版本
// ==========================================

let currentUser = null;
let staffList = [];
let allEquipmentList = [];
let myEquipmentList = [];
let currentInventoryStatus = '';
let html5QrCode = null;
let isScannerRunning = false;
let isProcessingScanResult = false;
let lastScannedCode = '';
let loanQrCode = null;
let isLoanScannerRunning = false;
let isProcessingLoanScan = false;
let lastLoanScannedCode = '';
let currentLoanEquipment = null;
let currentLoanDraft = null;
let returnQrCode = null;
let isReturnScannerRunning = false;
let isProcessingReturnScan = false;
let lastReturnScannedCode = '';
let currentReturnLoan = null;
let currentReturnDraft = null;
let currentReturnEquipment = null;
let currentReturnMode = 'standard';
let currentEquipmentDetail = null;
let currentPhotoTargetEquipment = null;
let isBatchInventoryMode = false;
let selectedBatchInventoryIds = new Set();
let scannerAssistZoomState = {
  inventory: '1',
  loan: '1',
  return: '1'
};
let currentEquipmentSearchTerm = '';

function isAppleMobileDevice() {
  const userAgent = navigator.userAgent || '';
  const platform = navigator.platform || '';
  const touchPoints = navigator.maxTouchPoints || 0;
  return /iPhone|iPad|iPod/i.test(userAgent) || (platform === 'MacIntel' && touchPoints > 1);
}

function buildScannerConfig() {
  const isAppleDevice = isAppleMobileDevice();
  return {
    fps: isAppleDevice ? 10 : 10,
    qrbox: function(viewfinderWidth, viewfinderHeight) {
      const widthRatio = isAppleDevice ? 0.96 : 0.88;
      const heightRatio = isAppleDevice ? 0.42 : 0.28;
      const maxWidth = isAppleDevice ? 420 : 360;
      const maxHeight = isAppleDevice ? 220 : 160;
      const minWidth = isAppleDevice ? 260 : 220;
      const minHeight = isAppleDevice ? 130 : 100;
      const width = Math.max(minWidth, Math.min(Math.floor(viewfinderWidth * widthRatio), maxWidth));
      const height = Math.max(minHeight, Math.min(Math.floor(viewfinderHeight * heightRatio), maxHeight));
      return {
        width: width,
        height: height
      };
    },
    disableFlip: isAppleDevice,
    rememberLastUsedCamera: true
  };
}

function optimizeScannerVideo(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const video = container.querySelector('video');
  if (!video) return;

  video.setAttribute('playsinline', 'true');
  video.setAttribute('webkit-playsinline', 'true');
  video.setAttribute('autoplay', 'true');
  video.setAttribute('muted', 'true');
  video.playsInline = true;
  video.autoplay = true;
  video.muted = true;

  const playPromise = video.play();
  if (playPromise && typeof playPromise.catch === 'function') {
    playPromise.catch(function(error) {
      console.warn('重新播放掃描預覽失敗:', error);
    });
  }
}

async function resolvePreferredRearCamera() {
  if (!isAppleMobileDevice() || typeof Html5Qrcode === 'undefined' || typeof Html5Qrcode.getCameras !== 'function') {
    return null;
  }

  try {
    const cameras = await Html5Qrcode.getCameras();
    if (!Array.isArray(cameras) || cameras.length === 0) {
      return null;
    }

    const rearCamera = cameras.find(function(camera) {
      return /back|rear|environment|wide/i.test(camera.label || '');
    }) || cameras[cameras.length - 1];

    return rearCamera && rearCamera.id ? rearCamera.id : null;
  } catch (error) {
    console.warn('取得後鏡頭列表失敗:', error);
    return null;
  }
}

async function prepareCameraForScanner(activeScannerKey) {
  if (typeof stopCamera === 'function') {
    stopCamera();
  }

  const stopTasks = [];
  if (activeScannerKey !== 'inventory' && isScannerRunning) {
    stopTasks.push(stopBarcodeScanner());
  }
  if (activeScannerKey !== 'loan' && isLoanScannerRunning) {
    stopTasks.push(stopLoanBarcodeScanner());
  }
  if (activeScannerKey !== 'return' && isReturnScannerRunning) {
    stopTasks.push(stopReturnBarcodeScanner());
  }

  if (stopTasks.length > 0) {
    await Promise.all(stopTasks);
  }
}

async function startScannerWithFallback(scannerInstance, containerId, onSuccess) {
  const scanConfig = buildScannerConfig();
  const cameraCandidates = [
    { facingMode: { exact: 'environment' } },
    { facingMode: 'environment' }
  ];

  const preferredRearCamera = await resolvePreferredRearCamera();
  if (preferredRearCamera) {
    cameraCandidates.push(preferredRearCamera);
  }

  let lastError = null;

  for (let i = 0; i < cameraCandidates.length; i++) {
    try {
      await scannerInstance.start(
        cameraCandidates[i],
        scanConfig,
        onSuccess,
        function() {}
      );
      optimizeScannerVideo(containerId);
      return;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('scanner_start_failed');
}

const SCANNER_ASSIST_CONFIG = {
  inventory: {
    assistControlsId: 'scanAssistControls',
    refocusButtonId: 'refocusScanBtn',
    zoomSelectId: 'scanZoomSelect',
    containerId: 'scannerContainer',
    restart: function() {
      return startBarcodeScanner();
    }
  },
  loan: {
    assistControlsId: 'loanAssistControls',
    refocusButtonId: 'refocusLoanScanBtn',
    zoomSelectId: 'loanZoomSelect',
    containerId: 'loanScannerContainer',
    restart: function() {
      return startLoanBarcodeScanner();
    }
  },
  return: {
    assistControlsId: 'returnAssistControls',
    refocusButtonId: 'refocusReturnScanBtn',
    zoomSelectId: 'returnZoomSelect',
    containerId: 'returnScannerContainer',
    restart: function() {
      return startReturnBarcodeScanner();
    }
  }
};

function getScannerAssistConfig(scannerKey) {
  return SCANNER_ASSIST_CONFIG[scannerKey] || null;
}

function getScannerInstanceByKey(scannerKey) {
  if (scannerKey === 'inventory') return html5QrCode;
  if (scannerKey === 'loan') return loanQrCode;
  if (scannerKey === 'return') return returnQrCode;
  return null;
}

function getScannerTrack(scannerKey) {
  const config = getScannerAssistConfig(scannerKey);
  if (!config) return null;

  const container = document.getElementById(config.containerId);
  if (!container) return null;

  const video = container.querySelector('video');
  if (!video || !video.srcObject || typeof video.srcObject.getVideoTracks !== 'function') {
    return null;
  }

  const tracks = video.srcObject.getVideoTracks();
  return Array.isArray(tracks) && tracks.length > 0 ? tracks[0] : null;
}

function getScannerCapabilities(scannerKey) {
  const track = getScannerTrack(scannerKey);
  if (!track || typeof track.getCapabilities !== 'function') {
    return null;
  }

  try {
    return track.getCapabilities();
  } catch (error) {
    console.warn('讀取相機能力失敗:', error);
    return null;
  }
}

function updateScannerZoomOptions(scannerKey, capabilities) {
  const config = getScannerAssistConfig(scannerKey);
  if (!config) return;

  const zoomSelect = document.getElementById(config.zoomSelectId);
  if (!zoomSelect) return;

  const supportsZoom = capabilities && typeof capabilities.zoom === 'object';
  zoomSelect.innerHTML = '';

  if (!supportsZoom) {
    zoomSelect.disabled = true;
    zoomSelect.innerHTML = '<option value="1">1.0x</option>';
    return;
  }

  const minZoom = Math.max(1, capabilities.zoom.min || 1);
  const maxZoom = capabilities.zoom.max || minZoom;
  const preferredOptions = [1, 1.25, 1.5, 1.75, 2, 2.5, 3];
  const availableOptions = preferredOptions.filter(function(value) {
    return value >= minZoom && value <= maxZoom;
  });

  if (availableOptions.length === 0) {
    availableOptions.push(minZoom);
  }

  availableOptions.forEach(function(value) {
    const option = document.createElement('option');
    option.value = String(value);
    option.textContent = value.toFixed(2).replace(/\.00$/, '.0').replace(/0$/, '') + 'x';
    zoomSelect.appendChild(option);
  });

  zoomSelect.disabled = false;
  const desiredZoom = scannerAssistZoomState[scannerKey] || '1';
  zoomSelect.value = Array.from(zoomSelect.options).some(function(option) {
    return option.value === desiredZoom;
  }) ? desiredZoom : zoomSelect.options[0].value;
  scannerAssistZoomState[scannerKey] = zoomSelect.value;
}

function setScannerAssistVisibility(scannerKey, visible) {
  const config = getScannerAssistConfig(scannerKey);
  if (!config) return;

  const controls = document.getElementById(config.assistControlsId);
  if (controls) {
    controls.style.display = visible ? 'flex' : 'none';
  }
}

async function applyScannerZoom(scannerKey, zoomValue) {
  const track = getScannerTrack(scannerKey);
  const capabilities = getScannerCapabilities(scannerKey);
  if (!track || !capabilities || typeof capabilities.zoom !== 'object' || typeof track.applyConstraints !== 'function') {
    return false;
  }

  const nextZoom = Number(zoomValue);
  const minZoom = capabilities.zoom.min || 1;
  const maxZoom = capabilities.zoom.max || nextZoom;
  const safeZoom = Math.min(maxZoom, Math.max(minZoom, nextZoom));

  try {
    await track.applyConstraints({
      advanced: [{ zoom: safeZoom }]
    });
    scannerAssistZoomState[scannerKey] = String(safeZoom);
    return true;
  } catch (error) {
    console.warn('調整相機倍率失敗:', error);
    return false;
  }
}

async function refreshScannerAssistControls(scannerKey) {
  const config = getScannerAssistConfig(scannerKey);
  if (!config) return;

  const capabilities = getScannerCapabilities(scannerKey);
  setScannerAssistVisibility(scannerKey, true);
  updateScannerZoomOptions(scannerKey, capabilities);

  const hintId = config.assistControlsId + 'Hint';
  let hint = document.getElementById(hintId);
  const controls = document.getElementById(config.assistControlsId);
  if (controls) {
    if (!hint) {
      hint = document.createElement('div');
      hint.id = hintId;
      hint.className = 'scanner-assist-hint';
      controls.appendChild(hint);
    }
    hint.textContent = capabilities && capabilities.zoom ? '掃描模糊時可先點重新對焦，也可稍微拉遠後再靠近。' : '掃描模糊時可先點重新對焦，並稍微拉遠條碼後再靠近。';
  }

  if ((scannerAssistZoomState[scannerKey] || '1') !== '1') {
    await applyScannerZoom(scannerKey, scannerAssistZoomState[scannerKey]);
  }
}

async function initializeScannerAssist(scannerKey) {
  for (let attempt = 0; attempt < 4; attempt++) {
    await new Promise(function(resolve) {
      setTimeout(resolve, 150);
    });

    const track = getScannerTrack(scannerKey);
    if (track) {
      await refreshScannerAssistControls(scannerKey);
      return;
    }
  }

  setScannerAssistVisibility(scannerKey, true);
}

async function refocusScanner(scannerKey) {
  const track = getScannerTrack(scannerKey);
  const capabilities = getScannerCapabilities(scannerKey);

  if (track && capabilities && Array.isArray(capabilities.focusMode) && typeof track.applyConstraints === 'function') {
    const focusModes = capabilities.focusMode;
    const preferredFocusMode = focusModes.includes('continuous') ? 'continuous' : (focusModes.includes('single-shot') ? 'single-shot' : focusModes[0]);

    if (preferredFocusMode) {
      try {
        await track.applyConstraints({
          advanced: [{ focusMode: preferredFocusMode }]
        });
        if (preferredFocusMode === 'single-shot') {
          await new Promise(function(resolve) {
            setTimeout(resolve, 300);
          });
        }
        showToast('已嘗試重新對焦', 'success');
        return;
      } catch (error) {
        console.warn('重新對焦失敗，改為重啟相機:', error);
      }
    }
  }

  await restartScannerForFocus(scannerKey);
  showToast('已重新啟動相機，請再試一次', 'success');
}

async function restartScannerForFocus(scannerKey) {
  const config = getScannerAssistConfig(scannerKey);
  if (!config || typeof config.restart !== 'function') {
    return;
  }

  if (scannerKey === 'inventory') {
    await stopBarcodeScanner();
  } else if (scannerKey === 'loan') {
    await stopLoanBarcodeScanner();
  } else if (scannerKey === 'return') {
    await stopReturnBarcodeScanner();
  }

  await config.restart();
}

function setupScannerAssistEventListeners() {
  Object.keys(SCANNER_ASSIST_CONFIG).forEach(function(scannerKey) {
    const config = SCANNER_ASSIST_CONFIG[scannerKey];
    const refocusButton = document.getElementById(config.refocusButtonId);
    const zoomSelect = document.getElementById(config.zoomSelectId);

    if (refocusButton) {
      refocusButton.addEventListener('click', function() {
        refocusScanner(scannerKey);
      });
    }

    if (zoomSelect) {
      zoomSelect.addEventListener('change', function() {
        scannerAssistZoomState[scannerKey] = this.value;
        applyScannerZoom(scannerKey, this.value);
      });
    }
  });
}

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
  
  initializeManualLink();
  setupEventListeners();
  loadStaffList();
  checkLoginStatus();
}

function checkConfig() {
  return CONFIG && CONFIG.API_URL && CONFIG.API_URL !== 'YOUR_APPS_SCRIPT_URL_HERE';
}

function initializeManualLink() {
  const manualLink = document.getElementById('manualLink');
  if (!manualLink) return;
  manualLink.href = CONFIG.MANUAL_URL || './user-manual.html';
}

// ==========================================
// 事件監聽器
// ==========================================

function setupEventListeners() {
  document.getElementById('loginBtn').addEventListener('click', handleLogin);
  document.getElementById('logoutBtn').addEventListener('click', handleLogout);
  setupScannerAssistEventListeners();
  
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

  const toggleBatchInventoryBtn = document.getElementById('toggleBatchInventoryBtn');
  if (toggleBatchInventoryBtn) {
    toggleBatchInventoryBtn.addEventListener('click', toggleBatchInventoryMode);
  }

  const selectAllBatchBtn = document.getElementById('selectAllBatchBtn');
  if (selectAllBatchBtn) {
    selectAllBatchBtn.addEventListener('click', handleSelectAllBatchInventory);
  }

  const clearBatchSelectionBtn = document.getElementById('clearBatchSelectionBtn');
  if (clearBatchSelectionBtn) {
    clearBatchSelectionBtn.addEventListener('click', clearBatchInventorySelection);
  }

  const submitBatchInventoryBtn = document.getElementById('submitBatchInventoryBtn');
  if (submitBatchInventoryBtn) {
    submitBatchInventoryBtn.addEventListener('click', handleSubmitBatchInventory);
  }

  setupMyTabs();

  const startScanBtn = document.getElementById('startScanBtn');
  if (startScanBtn) {
    startScanBtn.addEventListener('click', startBarcodeScanner);
  }

  const stopScanBtn = document.getElementById('stopScanBtn');
  if (stopScanBtn) {
    stopScanBtn.addEventListener('click', stopBarcodeScanner);
  }

  const generateMonthlyReportBtn = document.getElementById('generateMonthlyReportBtn');
  if (generateMonthlyReportBtn) {
    generateMonthlyReportBtn.addEventListener('click', handleGenerateMonthlyReport);
  }

  const openLoanWorkflowBtn = document.getElementById('openLoanWorkflowBtn');
  if (openLoanWorkflowBtn) {
    openLoanWorkflowBtn.addEventListener('click', openLoanWorkflow);
  }

  const openReturnWorkflowBtn = document.getElementById('openReturnWorkflowBtn');
  if (openReturnWorkflowBtn) {
    openReturnWorkflowBtn.addEventListener('click', function() {
      openReturnWorkflow();
    });
  }

  const closeLoanWorkflowBtn = document.getElementById('closeLoanWorkflowBtn');
  if (closeLoanWorkflowBtn) {
    closeLoanWorkflowBtn.addEventListener('click', closeLoanWorkflow);
  }

  const loanModal = document.getElementById('loanModal');
  if (loanModal) {
    loanModal.addEventListener('click', function(event) {
      if (event.target === loanModal) {
        closeLoanWorkflow();
      }
    });
  }

  const startLoanScanBtn = document.getElementById('startLoanScanBtn');
  if (startLoanScanBtn) {
    startLoanScanBtn.addEventListener('click', startLoanBarcodeScanner);
  }

  const searchLoanPropertyBtn = document.getElementById('searchLoanPropertyBtn');
  if (searchLoanPropertyBtn) {
    searchLoanPropertyBtn.addEventListener('click', function() {
      const propertyId = normalizeScannedCode(document.getElementById('loanManualPropertyId').value);
      if (!propertyId) {
        showToast('請輸入財產編號', 'error');
        return;
      }
      handleLoanBarcodeDetected(propertyId);
    });
  }

  const stopLoanScanBtn = document.getElementById('stopLoanScanBtn');
  if (stopLoanScanBtn) {
    stopLoanScanBtn.addEventListener('click', stopLoanBarcodeScanner);
  }

  const loanBackToScanBtn = document.getElementById('loanBackToScanBtn');
  if (loanBackToScanBtn) {
    loanBackToScanBtn.addEventListener('click', function() {
      setLoanWorkflowStep('scan');
      startLoanBarcodeScanner();
    });
  }

  const loanContinueToSignatureBtn = document.getElementById('loanContinueToSignatureBtn');
  if (loanContinueToSignatureBtn) {
    loanContinueToSignatureBtn.addEventListener('click', handleLoanFormContinue);
  }

  const loanBackToFormBtn = document.getElementById('loanBackToFormBtn');
  if (loanBackToFormBtn) {
    loanBackToFormBtn.addEventListener('click', function() {
      setLoanWorkflowStep('form');
    });
  }

  const submitLoanBtn = document.getElementById('submitLoanBtn');
  if (submitLoanBtn) {
    submitLoanBtn.addEventListener('click', handleCreateLoan);
  }

  const closeEquipmentDetailBtn = document.getElementById('closeEquipmentDetailBtn');
  if (closeEquipmentDetailBtn) {
    closeEquipmentDetailBtn.addEventListener('click', closeEquipmentDetailModal);
  }

  const cancelEquipmentDetailBtn = document.getElementById('cancelEquipmentDetailBtn');
  if (cancelEquipmentDetailBtn) {
    cancelEquipmentDetailBtn.addEventListener('click', closeEquipmentDetailModal);
  }

  const saveEquipmentDetailBtn = document.getElementById('saveEquipmentDetailBtn');
  if (saveEquipmentDetailBtn) {
    saveEquipmentDetailBtn.addEventListener('click', handleSaveEquipmentDetail);
  }

  const detailQuickInventoryBtn = document.getElementById('detailQuickInventoryBtn');
  if (detailQuickInventoryBtn) {
    detailQuickInventoryBtn.addEventListener('click', handleDetailQuickInventory);
  }

  const equipmentPhotoTrigger = document.getElementById('equipmentPhotoTrigger');
  if (equipmentPhotoTrigger) {
    equipmentPhotoTrigger.addEventListener('click', function() {
      if (currentEquipmentDetail) {
        openPhotoModalForEquipment(currentEquipmentDetail);
      }
    });
  }

  const equipmentDetailModal = document.getElementById('equipmentDetailModal');
  if (equipmentDetailModal) {
    equipmentDetailModal.addEventListener('click', function(event) {
      if (event.target === equipmentDetailModal) {
        closeEquipmentDetailModal();
      }
    });
  }

  const closeReturnWorkflowBtn = document.getElementById('closeReturnWorkflowBtn');
  if (closeReturnWorkflowBtn) {
    closeReturnWorkflowBtn.addEventListener('click', closeReturnWorkflow);
  }

  const returnModal = document.getElementById('returnModal');
  if (returnModal) {
    returnModal.addEventListener('click', function(event) {
      if (event.target === returnModal) {
        closeReturnWorkflow();
      }
    });
  }

  const startReturnScanBtn = document.getElementById('startReturnScanBtn');
  if (startReturnScanBtn) {
    startReturnScanBtn.addEventListener('click', startReturnBarcodeScanner);
  }

  const stopReturnScanBtn = document.getElementById('stopReturnScanBtn');
  if (stopReturnScanBtn) {
    stopReturnScanBtn.addEventListener('click', stopReturnBarcodeScanner);
  }

  const searchReturnPropertyBtn = document.getElementById('searchReturnPropertyBtn');
  if (searchReturnPropertyBtn) {
    searchReturnPropertyBtn.addEventListener('click', function() {
      const propertyId = normalizeScannedCode(document.getElementById('returnManualPropertyId').value);
      if (!propertyId) {
        showToast('請輸入財產編號', 'error');
        return;
      }
      lookupReturnLoanByProperty(propertyId);
    });
  }

  const returnBackToLookupBtn = document.getElementById('returnBackToLookupBtn');
  if (returnBackToLookupBtn) {
    returnBackToLookupBtn.addEventListener('click', function() {
      setReturnWorkflowStep('lookup');
      startReturnBarcodeScanner();
    });
  }

  const returnContinueToSignatureBtn = document.getElementById('returnContinueToSignatureBtn');
  if (returnContinueToSignatureBtn) {
    returnContinueToSignatureBtn.addEventListener('click', handleReturnFormContinue);
  }

  const returnBackToFormBtn = document.getElementById('returnBackToFormBtn');
  if (returnBackToFormBtn) {
    returnBackToFormBtn.addEventListener('click', function() {
      setReturnWorkflowStep('form');
    });
  }

  const submitReturnBtn = document.getElementById('submitReturnBtn');
  if (submitReturnBtn) {
    submitReturnBtn.addEventListener('click', handleReturnLoanSubmit);
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
  closeLoanWorkflow();
  closeReturnWorkflow();
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

  if (viewName !== 'loan') {
    stopLoanBarcodeScanner();
    stopReturnBarcodeScanner();
  }

  const allViews = ['scanView', 'listView', 'loanView', 'reportView', 'myView'];
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
    case 'report':
      initializeReportView();
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
      const filteredList = currentEquipmentSearchTerm
        ? response.data.filter(function(equipment) { return equipmentMatchesSearch(equipment, currentEquipmentSearchTerm); })
        : response.data;
      displayEquipmentList(filteredList, listContainer, countDisplay, currentEquipmentSearchTerm);
    } else {
      listContainer.innerHTML = '<div class="loading">載入失敗</div>';
    }
  });
}

function displayEquipmentList(equipmentList, container, countDisplay, searchTerm = '') {
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
    const card = createEquipmentCard(equipment, searchTerm);
    container.appendChild(card);
  });
}

function createEquipmentCard(equipment, searchTerm = '') {
  const card = document.createElement('div');
  card.className = 'equipment-card clickable-card';
  
  const area = getEquipmentArea(equipment);
  const isInventoried = hasInventoryActivityThisMonth(equipment);
  const inventoryClass = isInventoried ? 'inventoried' : 'not-inventoried';
  const inventoryText = isInventoried ? '已盤點' : '未盤點';
  
  card.innerHTML = `
    <div class="equipment-card-header">
      <div>
        <div class="equipment-card-title">${highlightSearchText(equipment.equipmentName, searchTerm)}</div>
        <div class="equipment-card-id">${highlightSearchText(equipment.propertyId, searchTerm)}</div>
      </div>
      <div class="header-badges">
        <span class="status-badge" data-status="${equipment.currentStatus}">${equipment.currentStatus}</span>
        <span class="inventory-badge ${inventoryClass}">${inventoryText}</span>
      </div>
    </div>
    <div class="equipment-card-body">
      <div class="equipment-card-row">
        <i class="fas fa-tag"></i>
        <span>${highlightSearchText(equipment.category || '未分類', searchTerm)}</span>
      </div>
      <div class="equipment-card-row">
        <i class="fas fa-map-marker-alt"></i>
        <span>${highlightSearchText(area + ' - ' + (equipment.location || ''), searchTerm)}</span>
      </div>
      <div class="equipment-card-row">
        <i class="fas fa-user"></i>
        <span>${highlightSearchText(equipment.keeper || '-', searchTerm)}</span>
      </div>
      ${equipment.notes ? `
      <div class="equipment-card-row">
        <i class="fas fa-comment"></i>
        <span>${highlightSearchText(equipment.notes, searchTerm)}</span>
      </div>
      ` : ''}
    </div>
    <div class="equipment-card-footer">
      <button class="btn btn-success btn-small quick-inventory-btn" type="button">
        <i class="fas fa-check"></i> 完成盤點
      </button>
    </div>
  `;

  card.addEventListener('click', function() {
    openEquipmentDetailModal(equipment);
  });

  const quickButton = card.querySelector('.quick-inventory-btn');
  if (quickButton) {
    quickButton.addEventListener('click', function(event) {
      event.stopPropagation();
      window.quickInventory(equipment.propertyId);
    });
  }
  
  return card;
}

function handleSearch(e) {
  const searchTerm = normalizeTextSearchValue(e.target.value);
  currentEquipmentSearchTerm = searchTerm;
  
  if (!searchTerm) {
    const container = document.getElementById('equipmentList');
    const countDisplay = document.getElementById('equipmentCount');
    displayEquipmentList(allEquipmentList, container, countDisplay, '');
    return;
  }
  
  const filtered = allEquipmentList.filter(equipment => equipmentMatchesSearch(equipment, searchTerm));
  
  const container = document.getElementById('equipmentList');
  const countDisplay = document.getElementById('equipmentCount');
  displayEquipmentList(filtered, container, countDisplay, searchTerm);
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
      const searchTerm = getCurrentMySearchTerm();
      const filteredList = filterMyEquipmentList(searchTerm);
      displayMyEquipmentList(filteredList, listContainer, countDisplay, searchTerm);
    } else {
      listContainer.innerHTML = '<div class="loading">載入失敗</div>';
    }
  });
}

function setupMyTabs() {
  const tabs = document.querySelectorAll('.my-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', function() {
      tabs.forEach(t => t.classList.remove('active'));
      this.classList.add('active');

      currentInventoryStatus = this.dataset.inventoryStatus || '';

      const filteredList = filterMyEquipmentList();
      const container = document.getElementById('myEquipmentList');
      const countDisplay = document.getElementById('myEquipmentCount');
      displayMyEquipmentList(filteredList, container, countDisplay, getCurrentMySearchTerm());
    });
  });
}

function filterMyEquipmentList(searchTerm = '') {
  let filteredList = myEquipmentList;

  if (currentInventoryStatus) {
    filteredList = filteredList.filter(equipment => {
      const inventoried = hasInventoryActivityThisMonth(equipment);
      if (currentInventoryStatus === 'inventoried') {
        return inventoried;
      }
      if (currentInventoryStatus === 'not-inventoried') {
        return !inventoried;
      }
      return true;
    });
  }

  if (!searchTerm) {
    return filteredList;
  }

  return filteredList.filter(equipment => equipmentMatchesSearch(equipment, searchTerm));
}

function displayMyEquipmentList(equipmentList, container, countDisplay, searchTerm = '') {
  updateBatchInventoryToolbar(equipmentList.length);

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
    const card = createMyEquipmentCard(equipment, searchTerm);
    container.appendChild(card);
  });
}

function createMyEquipmentCard(equipment, searchTerm = '') {
  const card = document.createElement('div');
  const isSelected = selectedBatchInventoryIds.has(normalizeIdentifier(equipment.propertyId));
  card.className = 'equipment-card clickable-card my-equipment-card-clickable' + (isSelected ? ' batch-card-selected' : '');
  
  const area = getEquipmentArea(equipment);
  const isInventoried = hasInventoryActivityThisMonth(equipment);
  const inventoryClass = isInventoried ? 'inventoried' : 'not-inventoried';
  const inventoryText = isInventoried ? '已盤點' : '未盤點';
  
  card.innerHTML = `
    <div class="equipment-card-header">
      <div class="batch-card-header">
        ${isBatchInventoryMode ? `<input type="checkbox" class="batch-card-checkbox" ${isSelected ? 'checked' : ''} aria-label="選取 ${equipment.propertyId}">` : ''}
        <div class="batch-card-main">
          <div class="equipment-card-title">${highlightSearchText(equipment.equipmentName, searchTerm)}</div>
          <div class="equipment-card-id">${highlightSearchText(equipment.propertyId, searchTerm)}</div>
        </div>
      </div>
      <div class="header-badges">
        <span class="status-badge" data-status="${equipment.currentStatus}">${equipment.currentStatus}</span>
        <span class="inventory-badge ${inventoryClass}">${inventoryText}</span>
      </div>
    </div>
    <div class="equipment-card-body">
      <div class="equipment-card-row">
        <i class="fas fa-tag"></i>
        <span>${highlightSearchText(equipment.category || '未分類', searchTerm)}</span>
      </div>
      <div class="equipment-card-row">
        <i class="fas fa-map-marker-alt"></i>
        <span>${highlightSearchText(area + ' - ' + (equipment.location || ''), searchTerm)}</span>
      </div>
      <div class="equipment-card-row">
        <i class="fas fa-user"></i>
        <span>${highlightSearchText(equipment.keeper || '-', searchTerm)}</span>
      </div>
      ${equipment.notes ? `
      <div class="equipment-card-row">
        <i class="fas fa-comment"></i>
        <span>${highlightSearchText(equipment.notes, searchTerm)}</span>
      </div>
      ` : ''}
    </div>
    <div class="equipment-card-footer">
      <button class="btn btn-primary btn-small quick-inventory-btn" type="button">
        <i class="fas fa-check"></i> 完成盤點
      </button>
    </div>
  `;

  card.addEventListener('click', function() {
    openEquipmentDetailModal(equipment);
  });

  const batchCheckbox = card.querySelector('.batch-card-checkbox');
  if (batchCheckbox) {
    batchCheckbox.addEventListener('click', function(event) {
      event.stopPropagation();
    });
    batchCheckbox.addEventListener('change', function(event) {
      event.stopPropagation();
      toggleBatchSelection(equipment.propertyId, batchCheckbox.checked);
    });
  }

  const quickButton = card.querySelector('.quick-inventory-btn');
  if (quickButton) {
    quickButton.addEventListener('click', function(event) {
      event.stopPropagation();
      window.quickInventory(equipment.propertyId);
    });
  }
  
  return card;
}

function handleMySearch(e) {
  const searchTerm = normalizeTextSearchValue(e.target.value);
  const filtered = filterMyEquipmentList(searchTerm);

  const container = document.getElementById('myEquipmentList');
  const countDisplay = document.getElementById('myEquipmentCount');
  displayMyEquipmentList(filtered, container, countDisplay, searchTerm);
}

function toggleBatchInventoryMode() {
  isBatchInventoryMode = !isBatchInventoryMode;
  if (!isBatchInventoryMode) {
    selectedBatchInventoryIds.clear();
  }
  updateBatchInventoryToolbar(filterMyEquipmentList(getCurrentMySearchTerm()).length);
  renderMyEquipmentCurrentFilter();
}

function updateBatchInventoryToolbar(filteredCount) {
  const toolbar = document.getElementById('batchInventoryToolbar');
  const toggleBtn = document.getElementById('toggleBatchInventoryBtn');
  const countEl = document.getElementById('batchInventoryCount');

  if (toolbar) {
    toolbar.style.display = isBatchInventoryMode ? 'flex' : 'none';
  }

  if (toggleBtn) {
    toggleBtn.classList.toggle('btn-primary', isBatchInventoryMode);
    toggleBtn.classList.toggle('btn-secondary', !isBatchInventoryMode);
    toggleBtn.innerHTML = isBatchInventoryMode
      ? '<i class="fas fa-xmark"></i> 結束批次盤點'
      : '<i class="fas fa-layer-group"></i> 批次盤點模式';
  }

  if (countEl) {
    countEl.textContent = `已選 ${selectedBatchInventoryIds.size} 筆 / 目前篩選 ${filteredCount} 筆`;
  }
}

function toggleBatchSelection(propertyId, isSelected) {
  const normalizedPropertyId = normalizeIdentifier(propertyId);
  if (isSelected) {
    selectedBatchInventoryIds.add(normalizedPropertyId);
  } else {
    selectedBatchInventoryIds.delete(normalizedPropertyId);
  }
  updateBatchInventoryToolbar(filterMyEquipmentList(getCurrentMySearchTerm()).length);
  renderMyEquipmentCurrentFilter();
}

function clearBatchInventorySelection() {
  selectedBatchInventoryIds.clear();
  updateBatchInventoryToolbar(filterMyEquipmentList(getCurrentMySearchTerm()).length);
  renderMyEquipmentCurrentFilter();
}

function handleSelectAllBatchInventory() {
  const filteredList = filterMyEquipmentList(getCurrentMySearchTerm());
  filteredList.forEach(function(equipment) {
    selectedBatchInventoryIds.add(normalizeIdentifier(equipment.propertyId));
  });
  updateBatchInventoryToolbar(filteredList.length);
  renderMyEquipmentCurrentFilter();
}

function handleSubmitBatchInventory() {
  if (!currentUser) {
    showToast('請先登入', 'error');
    return;
  }

  const filteredList = filterMyEquipmentList(getCurrentMySearchTerm());
  const eligibleIds = filteredList
    .map(function(equipment) { return normalizeIdentifier(equipment.propertyId); })
    .filter(function(propertyId) { return selectedBatchInventoryIds.has(propertyId); });

  if (eligibleIds.length === 0) {
    showToast('請先選擇要批次盤點的輔具', 'error');
    return;
  }

  const previewIds = eligibleIds.slice(0, 5).join('、');
  const extraText = eligibleIds.length > 5 ? ` 等 ${eligibleIds.length} 筆` : '';
  if (!confirm(`確定要批次完成盤點嗎？\n${previewIds}${extraText}`)) {
    return;
  }

  callAPI('batchQuickInventory', {
    staffName: currentUser.name,
    propertyIds: eligibleIds.join(',')
  }, function(response) {
    const data = response.data || {};
    const successItems = data.successItems || [];
    successItems.forEach(function(item) {
      syncUpdatedEquipment(mergeInventoryResponseIntoEquipment(resolveEquipmentDetailForView(item.propertyId) || { propertyId: item.propertyId }, item));
    });

    const failedItems = data.failedItems || [];
    selectedBatchInventoryIds.clear();
    updateBatchInventoryToolbar(filterMyEquipmentList(getCurrentMySearchTerm()).length);
    renderMyEquipmentCurrentFilter();
    loadEquipmentList();
    loadMyEquipment();

    if (response.success) {
      const message = failedItems.length > 0
        ? `批次盤點完成，成功 ${data.successCount || 0} 筆，失敗 ${failedItems.length} 筆`
        : `批次盤點完成，共 ${data.successCount || 0} 筆`;
      showToast(message, failedItems.length > 0 ? 'warning' : 'success');
    } else {
      showToast(response.message || '批次盤點失敗', 'error');
    }
  });
}

function renderMyEquipmentCurrentFilter() {
  const container = document.getElementById('myEquipmentList');
  const countDisplay = document.getElementById('myEquipmentCount');
  const filtered = filterMyEquipmentList(getCurrentMySearchTerm());
  displayMyEquipmentList(filtered, container, countDisplay);
}

function getCurrentMySearchTerm() {
  const input = document.getElementById('mySearchInput');
  return input ? normalizeTextSearchValue(input.value) : '';
}

function tokenizeSearchTerm(searchTerm) {
  return String(searchTerm || '').trim().split(/\s+/).filter(function(term) {
    return !!term;
  });
}

function equipmentMatchesSearch(equipment, searchTerm) {
  const tokens = tokenizeSearchTerm(searchTerm);
  if (tokens.length === 0) {
    return true;
  }

  const searchableFields = [
    equipment.propertyId,
    equipment.inventoryId,
    equipment.equipmentName,
    equipment.keeper,
    equipment.category,
    equipment.location,
    equipment.currentStatus,
    equipment.notes
  ];

  return tokens.every(function(token) {
    return searchableFields.some(function(field) {
      return includesNormalized(field, token);
    });
  });
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, function(char) {
    return {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char];
  });
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlightSearchText(value, searchTerm) {
  const text = String(value || '');
  const tokens = tokenizeSearchTerm(searchTerm);
  if (!text || tokens.length === 0) {
    return escapeHtml(text);
  }

  const uniqueTokens = tokens.filter(function(token, index) {
    return tokens.indexOf(token) === index;
  }).sort(function(left, right) {
    return right.length - left.length;
  });

  const pattern = uniqueTokens.map(function(token) {
    return escapeRegExp(token);
  }).join('|');

  if (!pattern) {
    return escapeHtml(text);
  }

  return escapeHtml(text).replace(new RegExp('(' + pattern + ')', 'gi'), '<mark class="search-highlight">$1</mark>');
}

function openEquipmentDetailModal(equipment) {
  currentEquipmentDetail = equipment ? JSON.parse(JSON.stringify(equipment)) : null;

  const modal = document.getElementById('equipmentDetailModal');
  if (!modal || !currentEquipmentDetail) {
    return;
  }

  renderEquipmentDetailModal();
  modal.classList.add('active');
}

function closeEquipmentDetailModal() {
  const modal = document.getElementById('equipmentDetailModal');
  if (modal) {
    modal.classList.remove('active');
  }
  currentEquipmentDetail = null;
}

function renderEquipmentDetailModal() {
  if (!currentEquipmentDetail) return;

  const nameEl = document.getElementById('equipmentDetailName');
  const propertyIdEl = document.getElementById('equipmentDetailPropertyId');
  const gridEl = document.getElementById('equipmentDetailGrid');
  const photoEl = document.getElementById('equipmentDetailPhoto');
  const photoPlaceholderEl = document.getElementById('equipmentPhotoPlaceholder');
  const keeperInput = document.getElementById('detailKeeperInput');
  const locationInput = document.getElementById('detailLocationInput');
  const notesInput = document.getElementById('detailNotesInput');
  const cleanCheckbox = document.getElementById('detailActionClean');
  const chargeCheckbox = document.getElementById('detailActionCharge');

  if (nameEl) nameEl.textContent = currentEquipmentDetail.equipmentName || '未命名輔具';
  if (propertyIdEl) propertyIdEl.textContent = currentEquipmentDetail.propertyId || '';

  if (photoEl && photoPlaceholderEl) {
    if (currentEquipmentDetail.photoUrl) {
      photoEl.src = getPhotoDisplayUrl(currentEquipmentDetail.photoUrl);
      photoEl.onerror = function() {
        photoEl.style.display = 'none';
        photoPlaceholderEl.style.display = 'flex';
      };
      photoEl.style.display = 'block';
      photoPlaceholderEl.style.display = 'none';
    } else {
      photoEl.removeAttribute('src');
      photoEl.onerror = null;
      photoEl.style.display = 'none';
      photoPlaceholderEl.style.display = 'flex';
    }
  }

  if (gridEl) {
    const detailItems = [
      { label: '放置地點', value: currentEquipmentDetail.location || '-' },
      { label: '保管人', value: currentEquipmentDetail.keeper || '-' },
      { label: '目前動態', value: currentEquipmentDetail.currentStatus || '-' },
      { label: '財產編號', value: currentEquipmentDetail.propertyId || '-' },
      { label: '輔具來源', value: currentEquipmentDetail.source || '-' },
      { label: '原始編號', value: currentEquipmentDetail.originalId || '-' },
      { label: '入庫日期', value: formatDisplayDateTime(currentEquipmentDetail.entryDate) },
      { label: '最後盤點時間', value: formatDisplayDateTime(currentEquipmentDetail.lastInventory) },
      { label: '當次作為', value: formatCurrentActionText(currentEquipmentDetail.currentAction || '') },
      { label: '備註', value: currentEquipmentDetail.notes || '-', fullWidth: true }
    ];

    gridEl.innerHTML = detailItems.map(function(item) {
      return `
        <div class="equipment-detail-item${item.fullWidth ? ' full-width' : ''}">
          <div class="equipment-detail-label">${item.label}</div>
          <div class="equipment-detail-value">${item.value}</div>
        </div>
      `;
    }).join('');
  }

  if (keeperInput) keeperInput.value = currentEquipmentDetail.keeper || '';
  if (locationInput) locationInput.value = currentEquipmentDetail.location || '';
  if (notesInput) notesInput.value = currentEquipmentDetail.notes || '';

  const actionFlags = parseCurrentActionFlags(currentEquipmentDetail.currentAction || '');
  if (cleanCheckbox) cleanCheckbox.checked = actionFlags.clean;
  if (chargeCheckbox) chargeCheckbox.checked = actionFlags.charge;
}

function handleSaveEquipmentDetail() {
  if (!currentEquipmentDetail) {
    showToast('請先選擇輔具', 'error');
    return;
  }

  const keeper = document.getElementById('detailKeeperInput').value.trim();
  const location = document.getElementById('detailLocationInput').value.trim();
  const notes = document.getElementById('detailNotesInput').value.trim();
  const cleanChecked = document.getElementById('detailActionClean').checked;
  const chargeChecked = document.getElementById('detailActionCharge').checked;
  const currentAction = buildCurrentActionValue(cleanChecked, chargeChecked);

  callAPI('updateEquipmentDetails', {
    propertyId: currentEquipmentDetail.propertyId,
    keeper: keeper,
    location: location,
    currentAction: currentAction,
    notes: notes
  }, function(response) {
    if (!response.success || !response.data) {
      showToast(response.message || '輔具資料更新失敗', 'error');
      return;
    }

    syncUpdatedEquipment(response.data);
    currentEquipmentDetail = JSON.parse(JSON.stringify(response.data));
    renderEquipmentDetailModal();
    showToast('輔具資料已更新', 'success');
    loadEquipmentList();
    loadMyEquipment();
  });
}

function handleDetailQuickInventory() {
  if (!currentEquipmentDetail) {
    showToast('請先選擇輔具', 'error');
    return;
  }

  completeEquipmentInventory(currentEquipmentDetail.propertyId, {
    confirmMessage: '確定要將此輔具標記為已盤點嗎？',
    onSuccess: function(response) {
      const updatedEquipment = mergeInventoryResponseIntoEquipment(currentEquipmentDetail, response.data);
      syncUpdatedEquipment(updatedEquipment);
      currentEquipmentDetail = JSON.parse(JSON.stringify(updatedEquipment));
      renderEquipmentDetailModal();
      loadEquipmentList();
      loadMyEquipment();
    }
  });
}

function syncUpdatedEquipment(updatedEquipment) {
  allEquipmentList = allEquipmentList.map(function(item) {
    return isSameIdentifier(item.propertyId, updatedEquipment.propertyId) ? updatedEquipment : item;
  });

  myEquipmentList = myEquipmentList.map(function(item) {
    return isSameIdentifier(item.propertyId, updatedEquipment.propertyId) ? updatedEquipment : item;
  });
}

// ==========================================
// 月報表
// ==========================================

function initializeReportView() {
  const monthInput = document.getElementById('reportMonth');
  if (monthInput && !monthInput.value) {
    monthInput.value = getDefaultReportMonth();
  }

  const reportTypeInput = document.getElementById('reportType');
  if (reportTypeInput && !reportTypeInput.value) {
    reportTypeInput.value = 'maintenance';
  }
}

function getDefaultReportMonth() {
  const date = new Date();
  date.setMonth(date.getMonth() - 1);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function handleGenerateMonthlyReport() {
  const reportType = document.getElementById('reportType').value;
  const area = document.getElementById('reportArea').value;
  const month = document.getElementById('reportMonth').value;

  if (!month) {
    showToast('請先選擇報表月份', 'error');
    return;
  }

  const action = reportType === 'loan' ? 'generateMonthlyLoanReport' : 'generateMonthlyMaintenanceReport';

  callAPI(action, {
    area: area,
    month: month
  }, function(response) {
    if (!response.success || !response.data) {
      hideReportResult();
      showToast(response.message || '月報表產生失敗', 'error');
      return;
    }

    displayReportResult(response.data, reportType, area, month);
    showToast((reportType === 'loan' ? '外借月報' : '盤點月報') + '已產生', 'success');
  });
}

function displayReportResult(data, reportType, area, month) {
  const reportResult = document.getElementById('reportResult');
  const reportResultText = document.getElementById('reportResultText');
  const reportOpenLink = document.getElementById('reportOpenLink');
  const reportDownloadLink = document.getElementById('reportDownloadLink');

  if (!reportResult || !reportResultText || !reportOpenLink || !reportDownloadLink) {
    return;
  }

  const areaText = area || '全部區域';
  const reportTypeText = reportType === 'loan' ? '外借月報' : '盤點月報';
  reportResult.style.display = 'block';
  reportResultText.textContent = `${areaText} ${month} ${reportTypeText}已建立，共 ${data.rowCount || 0} 筆`;
  reportOpenLink.href = data.url || '#';
  reportDownloadLink.href = data.downloadUrl || data.url || '#';
  reportDownloadLink.setAttribute('download', data.fileName || 'monthly-report.pdf');
}

function hideReportResult() {
  const reportResult = document.getElementById('reportResult');
  if (reportResult) {
    reportResult.style.display = 'none';
  }
}

function hasInventoryActivityThisMonth(equipment) {
  if (!equipment) return false;

  const lastInventoryDate = parsePossibleDate(equipment.lastInventory);
  const activityAtDate = parsePossibleDate(equipment.activityAt);
  const now = new Date();

  if (isDateInCurrentMonth(lastInventoryDate, now)) {
    return true;
  }

  return isDateInCurrentMonth(activityAtDate, now);
}

function parsePossibleDate(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }

  const parsed = new Date(value);
  if (!isNaN(parsed.getTime())) {
    return parsed;
  }

  const fallback = new Date(String(value).replace(/-/g, '/'));
  return isNaN(fallback.getTime()) ? null : fallback;
}

function isDateInCurrentMonth(date, currentDate) {
  return !!date && !isNaN(date.getTime()) &&
    date.getFullYear() === currentDate.getFullYear() &&
    date.getMonth() === currentDate.getMonth();
}

window.quickInventory = function(propertyId) {
  completeEquipmentInventory(propertyId, {
    confirmMessage: '確定要完成此輔具的盤點嗎？'
  });
}

function completeEquipmentInventory(propertyId, options) {
  if (!currentUser) {
    alert('請先登入');
    return;
  }

  const settings = options || {};
  const confirmMessage = settings.confirmMessage || '確定要完成此輔具的盤點嗎？';

  if (confirm(confirmMessage)) {
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
        if (typeof settings.onSuccess === 'function') {
          settings.onSuccess(response);
        }
        loadEquipmentList();
        loadMyEquipment();
      } else {
        alert(response.message);
      }
    });
  }
}

function mergeInventoryResponseIntoEquipment(equipment, responseData) {
  const merged = Object.assign({}, equipment || {});
  if (!responseData) return merged;
  merged.lastInventory = responseData.inventoryDate || merged.lastInventory;
  merged.location = responseData.newLocation || merged.location;
  merged.currentStatus = responseData.newCurrentStatus || responseData.oldCurrentStatus || merged.currentStatus;
  merged.activityAt = responseData.inventoryDate || responseData.activityAt || merged.activityAt;
  merged.updatedAt = responseData.updatedAt || merged.updatedAt;
  return merged;
}

function openPhotoModalForEquipment(equipment) {
  if (!equipment || !equipment.propertyId) {
    showToast('找不到可拍照的輔具資料', 'error');
    return;
  }

  currentPhotoTargetEquipment = JSON.parse(JSON.stringify(equipment));
  const modal = document.getElementById('photoModal');
  if (!modal) return;

  const detailModal = document.getElementById('equipmentDetailModal');
  if (detailModal) {
    detailModal.classList.remove('active');
  }

  const targetInfo = document.getElementById('photoTargetInfo');
  if (targetInfo) {
    targetInfo.textContent = (equipment.equipmentName || '未命名輔具') + ' / ' + equipment.propertyId;
  }

  modal.classList.add('active');
  if (typeof startCamera === 'function') {
    startCamera();
  }
}

function handlePhotoUploadSuccess(updatedEquipment) {
  syncUpdatedEquipment(updatedEquipment);
  if (currentEquipmentDetail && isSameIdentifier(currentEquipmentDetail.propertyId, updatedEquipment.propertyId)) {
    currentEquipmentDetail = JSON.parse(JSON.stringify(updatedEquipment));
    renderEquipmentDetailModal();
  }

  const detailModal = document.getElementById('equipmentDetailModal');
  if (detailModal && currentEquipmentDetail) {
    detailModal.classList.add('active');
  }

  loadEquipmentList();
  loadMyEquipment();
}

function restoreEquipmentDetailModalAfterPhoto() {
  const detailModal = document.getElementById('equipmentDetailModal');
  if (detailModal && currentEquipmentDetail) {
    renderEquipmentDetailModal();
    detailModal.classList.add('active');
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
    if (tab.dataset.bound === 'true') {
      return;
    }

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

    tab.dataset.bound = 'true';
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
  card.className = 'equipment-card clickable-card';
  
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
    <div class="equipment-card-footer">
      <button class="btn btn-secondary btn-small" type="button">
        <i class="fas fa-rotate-left"></i> 進行歸還
      </button>
    </div>
  `;

  card.addEventListener('click', function() {
    openReturnWorkflow(equipment.propertyId);
  });
  
  return card;
}

function openLoanWorkflow() {
  if (!currentUser) {
    showToast('請先登入', 'error');
    return;
  }

  resetLoanWorkflow();

  const modal = document.getElementById('loanModal');
  if (modal) {
    modal.classList.add('active');
  }

  startLoanBarcodeScanner();
}

function closeLoanWorkflow() {
  const modal = document.getElementById('loanModal');
  if (modal) {
    modal.classList.remove('active');
  }

  stopLoanBarcodeScanner();
  resetLoanWorkflow();
}

function resetLoanWorkflow() {
  currentLoanEquipment = null;
  currentLoanDraft = null;
  isProcessingLoanScan = false;
  lastLoanScannedCode = '';

  const resultDiv = document.getElementById('loanScanResult');
  if (resultDiv) {
    resultDiv.style.display = 'none';
    resultDiv.innerHTML = '';
  }

  const borrowerInput = document.getElementById('loanBorrower');
  const manualPropertyInput = document.getElementById('loanManualPropertyId');
  const startDateInput = document.getElementById('loanStartDate');
  const returnDateInput = document.getElementById('loanExpectedReturnDate');
  const purposeInput = document.getElementById('loanPurpose');
  const equipmentName = document.getElementById('loanSelectedEquipmentName');
  const equipmentId = document.getElementById('loanSelectedEquipmentId');
  const signatureSummary = document.getElementById('loanSignatureSummary');

  if (borrowerInput) borrowerInput.value = '';
  if (manualPropertyInput) manualPropertyInput.value = '';
  if (startDateInput) startDateInput.value = getCurrentDateTimeLocalString();
  if (returnDateInput) returnDateInput.value = '';
  if (purposeInput) purposeInput.value = '';
  if (equipmentName) equipmentName.textContent = '尚未掃描';
  if (equipmentId) equipmentId.textContent = '';
  if (signatureSummary) signatureSummary.innerHTML = '';

  if (typeof clearSignature === 'function') {
    clearSignature('loanSignatureCanvas');
  }

  setLoanWorkflowStep('scan');
}

function setLoanWorkflowStep(step) {
  const stepMap = {
    scan: 'loanScanStep',
    form: 'loanFormStep',
    signature: 'loanSignatureStep'
  };

  Object.keys(stepMap).forEach(key => {
    const panel = document.getElementById(stepMap[key]);
    const indicator = document.getElementById('loanStep' + capitalizeFirstLetter(key) + 'Indicator');
    if (panel) {
      panel.classList.toggle('active', key === step);
    }
    if (indicator) {
      indicator.classList.toggle('active', key === step);
    }
  });

  if (step !== 'scan') {
    stopLoanBarcodeScanner();
  }

  if (step === 'signature' && typeof initializeSignaturePad === 'function') {
    initializeSignaturePad('loanSignatureCanvas', 'clearLoanSignatureBtn');
  }
}

function getTodayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getCurrentDateTimeLocalString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function capitalizeFirstLetter(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

async function startLoanBarcodeScanner() {
  if (typeof Html5Qrcode === 'undefined') {
    showToast('掃描元件未載入，請重新整理頁面', 'error');
    return;
  }

  if (isLoanScannerRunning) {
    return;
  }

  const container = document.getElementById('loanScannerContainer');
  const startBtn = document.getElementById('startLoanScanBtn');
  const stopBtn = document.getElementById('stopLoanScanBtn');
  const resultDiv = document.getElementById('loanScanResult');

  if (!container || !startBtn || !stopBtn) {
    showToast('外借掃描介面初始化失敗', 'error');
    return;
  }

  if (!loanQrCode) {
    loanQrCode = new Html5Qrcode('loanQrReader');
  }

  await prepareCameraForScanner('loan');

  setLoanWorkflowStep('scan');
  container.style.display = 'block';
  startBtn.style.display = 'none';
  stopBtn.style.display = 'inline-flex';
  if (resultDiv) {
    resultDiv.style.display = 'none';
    resultDiv.innerHTML = '';
  }

  try {
    await startScannerWithFallback(loanQrCode, 'loanScannerContainer', onLoanScanSuccess);
    isLoanScannerRunning = true;
    await initializeScannerAssist('loan');
  } catch (error) {
    console.error('啟動外借掃描失敗:', error);
    showToast('無法啟動相機掃描，請確認相機權限', 'error');
    stopLoanBarcodeScanner();
  }
}

async function stopLoanBarcodeScanner() {
  const container = document.getElementById('loanScannerContainer');
  const startBtn = document.getElementById('startLoanScanBtn');
  const stopBtn = document.getElementById('stopLoanScanBtn');

  if (loanQrCode && isLoanScannerRunning) {
    try {
      await loanQrCode.stop();
      await loanQrCode.clear();
    } catch (error) {
      console.warn('停止外借掃描時發生錯誤:', error);
    }
  }

  isLoanScannerRunning = false;
  isProcessingLoanScan = false;
  lastLoanScannedCode = '';

  if (container) container.style.display = 'none';
  setScannerAssistVisibility('loan', false);
  if (startBtn) startBtn.style.display = 'inline-flex';
  if (stopBtn) stopBtn.style.display = 'none';
}

function onLoanScanSuccess(decodedText) {
  const barcode = normalizeScannedCode(decodedText);
  if (!barcode) return;
  if (isProcessingLoanScan) return;
  if (barcode === lastLoanScannedCode) return;

  isProcessingLoanScan = true;
  lastLoanScannedCode = barcode;
  handleLoanBarcodeDetected(barcode);
}

function handleLoanBarcodeDetected(barcode) {
  const resultDiv = document.getElementById('loanScanResult');
  if (resultDiv) {
    resultDiv.style.display = 'block';
    resultDiv.innerHTML = `
      <p><strong>掃描到條碼：</strong>${barcode}</p>
      <p>正在查詢輔具資料...</p>
    `;
  }

  callAPI('scanBarcode', { barcode: barcode }, function(response) {
    isProcessingLoanScan = false;

    if (!response.success || !response.data) {
      lastLoanScannedCode = '';
      if (resultDiv) {
        resultDiv.style.display = 'block';
        resultDiv.innerHTML = `
          <p style="color: #DC2626;"><i class="fas fa-times-circle"></i> 找不到此輔具</p>
          <p>${response.message || '請確認條碼是否正確'}</p>
        `;
      }
      showToast(response.message || '找不到此輔具', 'error');
      return;
    }

    const equipment = response.data;
    if (equipment.currentStatus === '外借中') {
      lastLoanScannedCode = '';
      if (resultDiv) {
        resultDiv.style.display = 'block';
        resultDiv.innerHTML = `
          <p style="color: #DC2626;"><i class="fas fa-circle-exclamation"></i> 此輔具已外借中</p>
          <p><strong>${equipment.equipmentName}</strong> / ${equipment.propertyId}</p>
        `;
      }
      showToast('此輔具目前已外借', 'error');
      return;
    }

    currentLoanEquipment = equipment;
    populateLoanEquipment(equipment);
    setLoanWorkflowStep('form');
  });
}

function populateLoanEquipment(equipment) {
  const equipmentName = document.getElementById('loanSelectedEquipmentName');
  const equipmentId = document.getElementById('loanSelectedEquipmentId');
  const startDateInput = document.getElementById('loanStartDate');

  if (equipmentName) equipmentName.textContent = equipment.equipmentName || '未命名輔具';
  if (equipmentId) equipmentId.textContent = equipment.propertyId || '';
  if (startDateInput && !startDateInput.value) {
    startDateInput.value = getCurrentDateTimeLocalString();
  }
}

function handleLoanFormContinue() {
  if (!currentLoanEquipment) {
    showToast('請先掃描輔具條碼', 'error');
    setLoanWorkflowStep('scan');
    return;
  }

  const borrower = document.getElementById('loanBorrower').value.trim();
  const loanStartDate = document.getElementById('loanStartDate').value;
  const expectedReturnDate = document.getElementById('loanExpectedReturnDate').value;
  const purpose = document.getElementById('loanPurpose').value.trim();

  if (!borrower || !loanStartDate || !expectedReturnDate || !purpose) {
    showToast('請完整填寫外借資料', 'error');
    return;
  }

  if (expectedReturnDate < loanStartDate) {
    showToast('預計歸還日不能早於借用起始日', 'error');
    return;
  }

  currentLoanDraft = {
    borrower: borrower,
    loanStartDate: loanStartDate,
    expectedReturnDate: expectedReturnDate,
    purpose: purpose
  };

  renderLoanSignatureSummary();
  if (typeof clearSignature === 'function') {
    clearSignature('loanSignatureCanvas');
  }
  setLoanWorkflowStep('signature');
}

function renderLoanSignatureSummary() {
  const summary = document.getElementById('loanSignatureSummary');
  if (!summary || !currentLoanEquipment || !currentLoanDraft) {
    return;
  }

  summary.innerHTML = `
    <div class="loan-signature-summary-item"><strong>輔具</strong><span>${currentLoanEquipment.equipmentName} (${currentLoanEquipment.propertyId})</span></div>
    <div class="loan-signature-summary-item"><strong>借用人/單位</strong><span>${currentLoanDraft.borrower}</span></div>
    <div class="loan-signature-summary-item"><strong>借用起始日期時間</strong><span>${formatDisplayDateTime(currentLoanDraft.loanStartDate)}</span></div>
    <div class="loan-signature-summary-item"><strong>預計歸還日期時間</strong><span>${formatDisplayDateTime(currentLoanDraft.expectedReturnDate)}</span></div>
    <div class="loan-signature-summary-item"><strong>借用目的</strong><span>${currentLoanDraft.purpose}</span></div>
  `;
}

function handleCreateLoan() {
  if (!currentLoanEquipment || !currentLoanDraft) {
    showToast('請先完成外借資料填寫', 'error');
    return;
  }

  let signatureData = '';
  if (typeof getSignatureData === 'function') {
    signatureData = getSignatureData('loanSignatureCanvas');
  }

  if (!signatureData) {
    showToast('請先完成手寫簽名', 'error');
    return;
  }

  callAPI('createLoan', {
    propertyId: currentLoanEquipment.propertyId,
    equipmentName: currentLoanEquipment.equipmentName,
    borrower: currentLoanDraft.borrower,
    contactPerson: currentLoanDraft.borrower,
    contactPhone: '',
    loanStartDate: currentLoanDraft.loanStartDate,
    expectedReturnDate: currentLoanDraft.expectedReturnDate,
    staffName: currentUser.name,
    signatureData: signatureData,
    purpose: currentLoanDraft.purpose,
    notes: ''
  }, function(response) {
    if (response.success) {
      showToast('外借建立成功', 'success');
      closeLoanWorkflow();
      loadLoanList();
      loadMyEquipment();
    } else {
      showToast(response.message || '外借建立失敗', 'error');
    }
  });
}

function openReturnWorkflow(propertyId) {
  if (!currentUser) {
    showToast('請先登入', 'error');
    return;
  }

  resetReturnWorkflow();

  const modal = document.getElementById('returnModal');
  if (modal) {
    modal.classList.add('active');
  }

  if (propertyId) {
    const manualInput = document.getElementById('returnManualPropertyId');
    if (manualInput) {
      manualInput.value = propertyId;
    }
    lookupReturnLoanByProperty(propertyId);
    return;
  }

  startReturnBarcodeScanner();
}

function closeReturnWorkflow() {
  const modal = document.getElementById('returnModal');
  if (modal) {
    modal.classList.remove('active');
  }

  stopReturnBarcodeScanner();
  resetReturnWorkflow();
}

function resetReturnWorkflow() {
  currentReturnLoan = null;
  currentReturnDraft = null;
  isProcessingReturnScan = false;
  lastReturnScannedCode = '';

  const manualPropertyInput = document.getElementById('returnManualPropertyId');
  const actualDateInput = document.getElementById('returnActualDate');
  const lookupResult = document.getElementById('returnLookupResult');
  const loanSummary = document.getElementById('returnLoanSummary');
  const signatureSummary = document.getElementById('returnSignatureSummary');

  if (manualPropertyInput) manualPropertyInput.value = '';
  if (actualDateInput) actualDateInput.value = getCurrentDateTimeLocalString();
  if (lookupResult) {
    lookupResult.style.display = 'none';
    lookupResult.innerHTML = '';
  }
  if (loanSummary) loanSummary.innerHTML = '';
  if (signatureSummary) signatureSummary.innerHTML = '';

  if (typeof clearSignature === 'function') {
    clearSignature('returnSignatureCanvas');
  }

  setReturnWorkflowStep('lookup');
}

function setReturnWorkflowStep(step) {
  const stepMap = {
    lookup: 'returnLookupStep',
    form: 'returnFormStep',
    signature: 'returnSignatureStep'
  };

  Object.keys(stepMap).forEach(key => {
    const panel = document.getElementById(stepMap[key]);
    const indicator = document.getElementById('returnStep' + capitalizeFirstLetter(key) + 'Indicator');
    if (panel) {
      panel.classList.toggle('active', key === step);
    }
    if (indicator) {
      indicator.classList.toggle('active', key === step);
    }
  });

  if (step !== 'lookup') {
    stopReturnBarcodeScanner();
  }

  if (step === 'signature' && typeof initializeSignaturePad === 'function') {
    initializeSignaturePad('returnSignatureCanvas', 'clearReturnSignatureBtn');
  }
}

async function startReturnBarcodeScanner() {
  if (typeof Html5Qrcode === 'undefined') {
    showToast('掃描元件未載入，請重新整理頁面', 'error');
    return;
  }

  if (isReturnScannerRunning) {
    return;
  }

  const container = document.getElementById('returnScannerContainer');
  const startBtn = document.getElementById('startReturnScanBtn');
  const stopBtn = document.getElementById('stopReturnScanBtn');
  const resultDiv = document.getElementById('returnLookupResult');

  if (!container || !startBtn || !stopBtn) {
    showToast('歸還掃描介面初始化失敗', 'error');
    return;
  }

  if (!returnQrCode) {
    returnQrCode = new Html5Qrcode('returnQrReader');
  }

  await prepareCameraForScanner('return');

  setReturnWorkflowStep('lookup');
  container.style.display = 'block';
  startBtn.style.display = 'inline-flex';
  stopBtn.style.display = 'inline-flex';
  if (resultDiv) {
    resultDiv.style.display = 'none';
    resultDiv.innerHTML = '';
  }

  try {
    await startScannerWithFallback(returnQrCode, 'returnScannerContainer', onReturnScanSuccess);
    isReturnScannerRunning = true;
    await initializeScannerAssist('return');
    if (startBtn) startBtn.style.display = 'none';
  } catch (error) {
    console.error('啟動歸還掃描失敗:', error);
    showToast('無法啟動相機掃描，請確認相機權限', 'error');
    stopReturnBarcodeScanner();
  }
}

async function stopReturnBarcodeScanner() {
  const container = document.getElementById('returnScannerContainer');
  const startBtn = document.getElementById('startReturnScanBtn');
  const stopBtn = document.getElementById('stopReturnScanBtn');

  if (returnQrCode && isReturnScannerRunning) {
    try {
      await returnQrCode.stop();
      await returnQrCode.clear();
    } catch (error) {
      console.warn('停止歸還掃描時發生錯誤:', error);
    }
  }

  isReturnScannerRunning = false;
  isProcessingReturnScan = false;
  lastReturnScannedCode = '';

  if (container) container.style.display = 'none';
  setScannerAssistVisibility('return', false);
  if (startBtn) startBtn.style.display = 'inline-flex';
  if (stopBtn) stopBtn.style.display = 'none';
}

function onReturnScanSuccess(decodedText) {
  const barcode = normalizeScannedCode(decodedText);
  if (!barcode) return;
  if (isProcessingReturnScan) return;
  if (barcode === lastReturnScannedCode) return;

  isProcessingReturnScan = true;
  lastReturnScannedCode = barcode;
  lookupReturnLoanByProperty(barcode);
}

function lookupReturnLoanByProperty(propertyId) {
  const resultDiv = document.getElementById('returnLookupResult');
  const normalizedPropertyId = normalizeScannedCode(propertyId);

  if (!normalizedPropertyId) {
    showToast('請輸入財產編號', 'error');
    return;
  }

  if (resultDiv) {
    resultDiv.style.display = 'block';
    resultDiv.innerHTML = `
      <p><strong>查詢財產編號：</strong>${normalizedPropertyId}</p>
      <p>正在查詢外借資料...</p>
    `;
  }

  callAPI('getActiveLoanByPropertyId', { propertyId: normalizedPropertyId }, function(response) {
    isProcessingReturnScan = false;

    if (!response.success || !response.data) {
      lastReturnScannedCode = '';
      if (resultDiv) {
        resultDiv.style.display = 'block';
        resultDiv.innerHTML = `
          <p style="color: #DC2626;"><i class="fas fa-times-circle"></i> 找不到外借中的資料</p>
          <p>${response.message || '請確認財產編號是否正確'}</p>
        `;
      }
      showToast(response.message || '查無外借資料', 'error');
      return;
    }

    currentReturnLoan = response.data;
    renderReturnLoanSummary();
    setReturnWorkflowStep('form');
  });
}

function renderReturnLoanSummary() {
  if (!currentReturnLoan) return;

  const summaryHtml = `
    <div class="loan-signature-summary-item"><strong>輔具</strong><span>${currentReturnLoan.equipmentName} (${currentReturnLoan.propertyId})</span></div>
    <div class="loan-signature-summary-item"><strong>借用人/單位</strong><span>${currentReturnLoan.borrower || '歷史資料未建檔'}</span></div>
    <div class="loan-signature-summary-item"><strong>借用起始日期時間</strong><span>${formatDisplayDateTime(currentReturnLoan.loanDate)}</span></div>
    <div class="loan-signature-summary-item"><strong>預計歸還日期時間</strong><span>${formatDisplayDateTime(currentReturnLoan.expectedReturnDate)}</span></div>
    <div class="loan-signature-summary-item"><strong>借用目的</strong><span>${currentReturnLoan.purpose || '歷史資料未建檔'}</span></div>
    ${currentReturnLoan.isLegacyReturn ? '<div class="loan-signature-summary-item"><strong>資料狀態</strong><span>此筆為歷史外借補登歸還，系統將直接建立歸還紀錄。</span></div>' : ''}
  `;

  const loanSummary = document.getElementById('returnLoanSummary');
  const signatureSummary = document.getElementById('returnSignatureSummary');
  if (loanSummary) loanSummary.innerHTML = summaryHtml;

  if (signatureSummary && currentReturnDraft) {
    signatureSummary.innerHTML = summaryHtml + `
      <div class="loan-signature-summary-item"><strong>實際歸還日期時間</strong><span>${formatDisplayDateTime(currentReturnDraft.actualReturnDate)}</span></div>
      <div class="loan-signature-summary-item"><strong>中心人員</strong><span>${currentUser ? currentUser.name : '-'}</span></div>
    `;
  }
}

function handleReturnFormContinue() {
  if (!currentReturnLoan) {
    showToast('請先查詢外借資料', 'error');
    setReturnWorkflowStep('lookup');
    return;
  }

  const actualReturnDate = document.getElementById('returnActualDate').value;
  const loanDate = normalizeDateString(currentReturnLoan.loanDate);

  if (!actualReturnDate) {
    showToast('請填寫實際歸還日期', 'error');
    return;
  }

  if (loanDate && actualReturnDate < loanDate) {
    showToast('實際歸還日期不能早於借出日期', 'error');
    return;
  }

  currentReturnDraft = {
    actualReturnDate: actualReturnDate
  };

  renderReturnLoanSummary();
  if (typeof clearSignature === 'function') {
    clearSignature('returnSignatureCanvas');
  }
  setReturnWorkflowStep('signature');
}

function handleReturnLoanSubmit() {
  if (!currentReturnLoan || !currentReturnDraft) {
    showToast('請先完成歸還資料填寫', 'error');
    return;
  }

  let signatureData = '';
  if (typeof getSignatureData === 'function') {
    signatureData = getSignatureData('returnSignatureCanvas');
  }

  if (!signatureData) {
    showToast('請先完成中心人員簽名', 'error');
    return;
  }

  callAPI('returnLoan', {
    loanId: currentReturnLoan.loanId,
    propertyId: currentReturnLoan.propertyId,
    isLegacyReturn: currentReturnLoan.isLegacyReturn ? 'true' : 'false',
    actualReturnDate: currentReturnDraft.actualReturnDate,
    staffName: currentUser.name,
    signatureData: signatureData
  }, function(response) {
    if (response.success) {
      showToast('歸還完成', 'success');
      closeReturnWorkflow();
      loadLoanList();
      loadMyEquipment();
    } else {
      showToast(response.message || '歸還失敗', 'error');
    }
  });
}

function formatDisplayDateTime(value) {
  if (!value) return '-';
  const textValue = String(value);
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(textValue)) {
    return textValue.replace('T', ' ');
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(textValue)) {
    return textValue + ' 00:00';
  }
  const date = new Date(value);
  if (isNaN(date.getTime())) {
    return textValue.replace('T', ' ');
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function normalizeDateString(value) {
  if (!value) return '';

  const textValue = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(textValue)) {
    return textValue;
  }

  const date = new Date(textValue);
  if (isNaN(date.getTime())) {
    return '';
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

// ==========================================
// 條碼掃描與盤點
// ==========================================

function normalizeScannedCode(rawText) {
  if (!rawText) return '';

  let normalized = String(rawText).trim();

  // 移除 AIM/GS1 symbology identifier，例如 ]C1、]E0、]Q3
  normalized = normalized.replace(/^\][A-Za-z][0-9]/, '');

  // 移除控制字元（含 GS/FNC1）
  normalized = normalized.replace(/[\u0000-\u001F\u007F]/g, '');

  // 移除空白與常見不可見字元
  normalized = normalized
    .replace(/\s+/g, '')
    .replace(/\uFEFF/g, '');

  return normalizeIdentifier(normalized);
}

function normalizeIdentifier(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizeTextSearchValue(value) {
  return String(value || '').trim().toLowerCase();
}

function includesNormalized(value, searchTerm) {
  return normalizeTextSearchValue(value).includes(searchTerm);
}

function isSameIdentifier(left, right) {
  return normalizeIdentifier(left) === normalizeIdentifier(right);
}

function parseCurrentActionFlags(actionText) {
  const text = String(actionText || '');
  return {
    clean: text.indexOf('◼需清潔') !== -1 || text.indexOf('■需清潔') !== -1 || (text.indexOf('需清潔') !== -1 && text.indexOf('☐需清潔') === -1 && text.indexOf('□需清潔') === -1),
    charge: text.indexOf('◼需充電') !== -1 || text.indexOf('■需充電') !== -1 || (text.indexOf('需充電') !== -1 && text.indexOf('☐需充電') === -1 && text.indexOf('□需充電') === -1)
  };
}

function buildCurrentActionValue(clean, charge) {
  return `${clean ? '◼' : '☐'}需清潔${charge ? '◼' : '☐'}需充電`;
}

function formatCurrentActionText(actionText) {
  const flags = parseCurrentActionFlags(actionText);
  const items = [];
  if (flags.clean) items.push('需清潔');
  if (flags.charge) items.push('需充電');
  return items.length > 0 ? items.join('、') : '無';
}

function getPhotoDisplayUrl(photoUrl) {
  const rawUrl = String(photoUrl || '').trim();
  if (!rawUrl) return '';

  const fileMatch = rawUrl.match(/\/file\/d\/([^/]+)/);
  if (fileMatch) {
    return `https://drive.google.com/thumbnail?id=${fileMatch[1]}&sz=w1600`;
  }

  const openMatch = rawUrl.match(/[?&]id=([^&]+)/);
  if (openMatch) {
    return `https://drive.google.com/thumbnail?id=${openMatch[1]}&sz=w1600`;
  }

  return rawUrl;
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

  if (isScannerRunning) {
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

  await prepareCameraForScanner('inventory');

  container.style.display = 'block';
  startBtn.style.display = 'none';
  stopBtn.style.display = 'inline-flex';
  if (resultDiv) {
    resultDiv.style.display = 'none';
    resultDiv.innerHTML = '';
  }

  try {
    await startScannerWithFallback(html5QrCode, 'scannerContainer', onScanSuccess);
    isScannerRunning = true;
    await initializeScannerAssist('inventory');
  } catch (error) {
    console.error('啟動掃描失敗:', error);
    showToast('無法啟動相機掃描，請確認相機權限', 'error');
    stopBarcodeScanner();
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
  setScannerAssistVisibility('inventory', false);
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
      const equipmentName = response.data.equipmentName || '未命名輔具';
      const scannedEquipment = buildScannedEquipmentDetail(barcode, response.data);
      resultDiv.innerHTML = `
        <p style="color: #059669;"><i class="fas fa-check-circle"></i> 盤點成功</p>
        <p><strong>輔具品名：</strong>${equipmentName}</p>
        <p><strong>財產編號：</strong>${barcode}</p>
        <div class="button-group">
          <button class="btn btn-primary" onclick="restartBarcodeScanner()">
            <i class="fas fa-redo"></i> 繼續掃描
          </button>
          <button class="btn btn-secondary" onclick="viewScannedEquipment('${barcode}')">
            <i class="fas fa-eye"></i> 檢視輔具
          </button>
        </div>
      `;
      window.__lastScannedEquipmentDetail = scannedEquipment;
      showToast('掃描盤點成功', 'success');
      syncUpdatedEquipment(scannedEquipment);
      loadEquipmentList();
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

window.viewScannedEquipment = function(propertyId) {
  const equipment = resolveEquipmentDetailForView(propertyId);
  if (!equipment) {
    showToast('找不到該輔具的詳細資料', 'error');
    return;
  }

  openEquipmentDetailModal(equipment);
};

function resolveEquipmentDetailForView(propertyId) {
  const normalizedPropertyId = normalizeIdentifier(propertyId);
  const cachedEquipment = allEquipmentList.find(function(item) {
    return isSameIdentifier(item.propertyId, normalizedPropertyId);
  }) || myEquipmentList.find(function(item) {
    return isSameIdentifier(item.propertyId, normalizedPropertyId);
  });

  if (cachedEquipment) {
    return cachedEquipment;
  }

  if (window.__lastScannedEquipmentDetail && isSameIdentifier(window.__lastScannedEquipmentDetail.propertyId, normalizedPropertyId)) {
    return window.__lastScannedEquipmentDetail;
  }

  return null;
}

function buildScannedEquipmentDetail(propertyId, responseData) {
  const baseEquipment = resolveEquipmentDetailForView(propertyId) || {};
  const inventoryDate = new Date().toISOString();

  return Object.assign({}, baseEquipment, {
    propertyId: propertyId,
    equipmentName: responseData && responseData.equipmentName ? responseData.equipmentName : (baseEquipment.equipmentName || '未命名輔具'),
    currentAction: responseData && responseData.currentAction ? responseData.currentAction : (baseEquipment.currentAction || ''),
    photoUrl: responseData && responseData.photoUrl ? responseData.photoUrl : (baseEquipment.photoUrl || ''),
    lastInventory: responseData && responseData.inventoryDate ? responseData.inventoryDate : (baseEquipment.lastInventory || inventoryDate),
    activityAt: responseData && responseData.activityAt ? responseData.activityAt : (baseEquipment.activityAt || inventoryDate)
  });
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
  const loader = document.getElementById('loader') || document.getElementById('loadingOverlay');
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
