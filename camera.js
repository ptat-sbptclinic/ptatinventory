// ==========================================
// 照片拍攝與上傳功能
// ==========================================

let cameraStream = null;
let capturedPhoto = null;

function startCamera() {
  const video = document.getElementById('photoVideo');
  const preview = document.getElementById('photoPreview');
  const captureBtn = document.getElementById('capturePhotoBtn');
  const retakeBtn = document.getElementById('retakePhotoBtn');
  const uploadBtn = document.getElementById('uploadPhotoBtn');
  const targetInfo = document.getElementById('photoTargetInfo');

  if (!currentPhotoTargetEquipment || !currentPhotoTargetEquipment.propertyId) {
    showToast('請先選擇要拍照的輔具', 'error');
    document.getElementById('photoModal').classList.remove('active');
    return;
  }

  if (targetInfo) {
    targetInfo.textContent = (currentPhotoTargetEquipment.equipmentName || '未命名輔具') + ' / ' + currentPhotoTargetEquipment.propertyId;
  }

  if (typeof stopBarcodeScanner === 'function') {
    stopBarcodeScanner();
  }
  if (typeof stopLoanBarcodeScanner === 'function') {
    stopLoanBarcodeScanner();
  }
  if (typeof stopReturnBarcodeScanner === 'function') {
    stopReturnBarcodeScanner();
  }

  setupPhotoFileInput();
  
  video.setAttribute('playsinline', 'true');
  video.setAttribute('webkit-playsinline', 'true');
  video.setAttribute('autoplay', 'true');
  video.setAttribute('muted', 'true');
  video.playsInline = true;
  video.autoplay = true;
  video.muted = true;
  
  video.style.display = 'block';
  preview.style.display = 'none';
  captureBtn.style.display = 'block';
  retakeBtn.style.display = 'none';
  uploadBtn.style.display = 'none';
  
  navigator.mediaDevices.getUserMedia({ 
    audio: false,
    video: { 
      facingMode: 'environment',
      width: { ideal: 1920 },
      height: { ideal: 1920 }
    } 
  })
  .then(function(stream) {
    cameraStream = stream;
    video.srcObject = stream;
    const playPromise = video.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(function(error) {
        console.warn('照片預覽播放失敗:', error);
      });
    }
  })
  .catch(function(error) {
    console.error('相機啟動失敗:', error);
    showToast('無法啟動相機，請檢查權限設定', 'error');
    document.getElementById('photoModal').classList.remove('active');
  });
  
  captureBtn.onclick = capturePhoto;
  retakeBtn.onclick = startCamera;
  uploadBtn.onclick = uploadPhoto;
  
  // Modal 關閉時停止相機
  const modal = document.getElementById('photoModal');
  const closeBtn = modal.querySelector('.modal-close');
  closeBtn.onclick = function() {
    stopCamera();
    capturedPhoto = null;
    currentPhotoTargetEquipment = null;
    modal.classList.remove('active');
    if (typeof restoreEquipmentDetailModalAfterPhoto === 'function') {
      restoreEquipmentDetailModalAfterPhoto();
    }
  };
}

function stopCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = null;
  }
  
  const video = document.getElementById('photoVideo');
  video.srcObject = null;
}

function setupPhotoFileInput() {
  const fileInput = document.getElementById('photoFileInput');
  if (!fileInput) return;
  
  fileInput.addEventListener('change', function(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
      const rawData = e.target.result;

      compressImage(
        rawData,
        CONFIG.PHOTO_SETTINGS.maxWidth || 1920,
        CONFIG.PHOTO_SETTINGS.maxHeight || 1920,
        CONFIG.PHOTO_SETTINGS.quality || 0.8
      ).then(function(compressed) {
        const video = document.getElementById('photoVideo');
        const preview = document.getElementById('photoPreview');
        const captureBtn = document.getElementById('capturePhotoBtn');
        const retakeBtn = document.getElementById('retakePhotoBtn');
        const uploadBtn = document.getElementById('uploadPhotoBtn');

        stopCamera();

        capturedPhoto = compressed;
        preview.src = capturedPhoto;
        preview.style.display = 'block';
        video.style.display = 'none';

        captureBtn.style.display = 'none';
        retakeBtn.style.display = 'block';
        uploadBtn.style.display = 'block';

        fileInput.value = '';
      }).catch(function(err) {
        console.error('照片壓縮失敗:', err);
        showToast('照片處理失敗，請重試', 'error');
        fileInput.value = '';
      });
    };
    reader.readAsDataURL(file);
  });
}

function capturePhoto() {
  const video = document.getElementById('photoVideo');
  const canvas = document.getElementById('photoCanvas');
  const preview = document.getElementById('photoPreview');
  const captureBtn = document.getElementById('capturePhotoBtn');
  const retakeBtn = document.getElementById('retakePhotoBtn');
  const uploadBtn = document.getElementById('uploadPhotoBtn');

  const maxWidth = CONFIG.PHOTO_SETTINGS.maxWidth || 1920;
  const maxHeight = CONFIG.PHOTO_SETTINGS.maxHeight || 1920;
  const quality = CONFIG.PHOTO_SETTINGS.quality || 0.8;

  let width = video.videoWidth;
  let height = video.videoHeight;

  if (width > maxWidth || height > maxHeight) {
    const ratio = Math.min(maxWidth / width, maxHeight / height);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }

  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  context.drawImage(video, 0, 0, width, height);

  capturedPhoto = canvas.toDataURL('image/jpeg', quality);

  // 顯示預覽
  preview.src = capturedPhoto;
  preview.style.display = 'block';
  video.style.display = 'none';

  // 停止相機
  stopCamera();

  // 更新按鈕
  captureBtn.style.display = 'none';
  retakeBtn.style.display = 'block';
  uploadBtn.style.display = 'block';
}

function uploadPhoto() {
  if (!capturedPhoto) {
    showToast('請先拍照', 'error');
    return;
  }
  
  if (!currentPhotoTargetEquipment || !currentPhotoTargetEquipment.propertyId) {
    showToast('請先掃描輔具', 'error');
    return;
  }
  
  showLoading(true);
  
  callAPI('uploadPhoto', {
    propertyId: currentPhotoTargetEquipment.propertyId,
    imageData: capturedPhoto,
    staffName: currentUser && currentUser.name ? currentUser.name : ''
  }, function(response) {
    showLoading(false);
    
    if (response.success) {
      showToast('照片上傳成功！', 'success');
      document.getElementById('photoModal').classList.remove('active');
      stopCamera();
      capturedPhoto = null;

      if (response.data) {
        currentPhotoTargetEquipment = response.data;
        if (typeof handlePhotoUploadSuccess === 'function') {
          handlePhotoUploadSuccess(response.data);
        }
      }
      currentPhotoTargetEquipment = null;
    } else {
      showToast(response.message, 'error');
    }
  });
}

// ==========================================
// 照片壓縮功能
// ==========================================

function compressImage(dataUrl, maxWidth, maxHeight, quality) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    
    img.onload = function() {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      
      // 計算縮放比例
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = width * ratio;
        height = height * ratio;
      }
      
      canvas.width = width;
      canvas.height = height;
      
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    
    img.onerror = reject;
    img.src = dataUrl;
  });
}
