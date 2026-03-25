// ==========================================
// 輔具盤點管理系統 - Google Apps Script 後端 v2
// 根據實際需求調整：簡化盤點流程、完整外借功能
// ==========================================

// 設定工作表名稱
const SHEET_NAMES = {
  EQUIPMENT: '輔具清單',
  LOANS: '外借記錄',
  STAFF: '人員清單',
  INVENTORY_LOG: '盤點記錄'
};

// 輔具清單欄位索引（對應實際的 22 個欄位）
const EQUIPMENT_COLS = {
  PROPERTY_ID: 0,        // A: 財產編號（主鍵）
  INVENTORY_ID: 1,       // B: 庫存編號
  EQUIPMENT_NAME: 2,     // C: 輔具品名
  CATEGORY: 3,           // D: 輔具項目分類
  ITEM_NAME: 4,          // E: 輔具項目名稱
  LOCATION: 5,           // F: 放置地點
  KEEPER: 6,             // G: 保管人
  STATUS: 7,             // H: 狀態
  CURRENT_STATUS: 8,     // I: 目前動態
  SOURCE: 9,             // J: 輔具來源
  DONOR: 10,             // K: 捐贈者
  ORIGINAL_ID: 11,       // L: 原始編號
  SPEC: 12,              // M: 規格型號
  ENTRY_DATE: 13,        // N: 入庫日期
  LAST_INVENTORY: 14,    // O: 最後盤點時間
  CURRENT_ACTION: 15,    // P: 當次作為
  NOTES: 16,             // Q: 備註
  PHOTO_URL: 17,         // R: 照片網址
  MARKET_PRICE: 18,      // S: 折合市價
  PURCHASE_PRICE: 19,    // T: 輔具價位
  CREATED_AT: 20,        // U: 建立日期
  UPDATED_AT: 21,        // V: 更新日期
  ACTIVITY_AT: 22        // W: 最近作業時間
};

const LOAN_COLS = {
  LOAN_ID: 0,
  PROPERTY_ID: 1,
  EQUIPMENT_NAME: 2,
  BORROWER: 3,
  CONTACT_PERSON: 4,
  CONTACT_PHONE: 5,
  LOAN_DATE: 6,
  EXPECTED_RETURN_DATE: 7,
  ACTUAL_RETURN_DATE: 8,
  STATUS: 9,
  STAFF_NAME: 10,
  BORROWER_SIGNATURE_URL: 11,
  PURPOSE: 12,
  NOTES: 13,
  CREATED_AT: 14,
  RETURN_STAFF_NAME: 15,
  RETURN_SIGNATURE_URL: 16
};

// ==========================================
// Web App 主要入口
// ==========================================

function doGet(e) {
  // 前後端分離架構，只處理 API 請求
  const action = e.parameter.action;
  if (action) {
    return doPost(e);
  }
  
  // 如果沒有 action 參數，返回簡單的狀態訊息
  return ContentService.createTextOutput(JSON.stringify({
    success: true,
    message: '輔具盤點系統 API 運作中',
    version: '2.0.0'
  })).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const action = e.parameter.action;
  
  try {
    switch(action) {
      case 'getEquipmentList':
        return handleGetEquipmentList(e);
      case 'getEquipmentByStaff':
        return handleGetEquipmentByStaff(e);
      case 'updateEquipmentDetails':
        return handleUpdateEquipmentDetails(e);
      case 'scanBarcode':
        return handleScanBarcode(e);
      case 'quickInventory':
        return handleQuickInventory(e);
      case 'batchQuickInventory':
        return handleBatchQuickInventory(e);
      case 'uploadPhoto':
        return handleUploadPhoto(e);
      case 'createLoan':
        return handleCreateLoan(e);
      case 'getLoanList':
        return handleGetLoanList(e);
      case 'getActiveLoanByPropertyId':
        return handleGetActiveLoanByPropertyId(e);
      case 'returnLoan':
        return handleReturnLoan(e);
      case 'getStaffList':
        return handleGetStaffList(e);
      case 'generateMonthlyMaintenanceReport':
        return handleGenerateMonthlyMaintenanceReport(e);
      case 'generateMonthlyLoanReport':
        return handleGenerateMonthlyLoanReport(e);
      default:
        return createResponse(false, '未知的操作');
    }
  } catch(error) {
    return createResponse(false, '系統錯誤: ' + error.message);
  }
}

// ==========================================
// 輔具管理功能
// ==========================================

function handleGetEquipmentList(e) {
  const area = e.parameter.area || '';
  const currentStatus = e.parameter.currentStatus || '';
  
  const sheet = getSheet(SHEET_NAMES.EQUIPMENT);
  ensureEquipmentSheetColumns(sheet);
  const data = sheet.getDataRange().getValues();
  
  let equipmentList = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row[EQUIPMENT_COLS.PROPERTY_ID] === '') continue;
    
    // 從財產編號和保管人提取區域
    const propertyId = row[EQUIPMENT_COLS.PROPERTY_ID] || '';
    const keeper = row[EQUIPMENT_COLS.KEEPER] || '';
    const equipmentArea = extractArea(propertyId, keeper);
    
    // 篩選條件
    if (area && equipmentArea !== area) continue;
    if (currentStatus && row[EQUIPMENT_COLS.CURRENT_STATUS] !== currentStatus) continue;
    
    equipmentList.push(createEquipmentObject(row));
  }
  
  return createResponse(true, '查詢成功', equipmentList);
}

function handleGetEquipmentByStaff(e) {
  const staffName = e.parameter.staffName;
  
  if (!staffName) {
    return createResponse(false, '請提供人員姓名');
  }
  
  const sheet = getSheet(SHEET_NAMES.EQUIPMENT);
  ensureEquipmentSheetColumns(sheet);
  const data = sheet.getDataRange().getValues();
  
  let equipmentList = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row[EQUIPMENT_COLS.PROPERTY_ID] === '' || row[EQUIPMENT_COLS.KEEPER] !== staffName) continue;
    
    equipmentList.push(createEquipmentObject(row));
  }
  
  return createResponse(true, '查詢成功', equipmentList);
}

function handleScanBarcode(e) {
  const barcode = normalizeIdentifier(e.parameter.barcode);
  
  if (!barcode) {
    return createResponse(false, '請提供條碼編號');
  }
  
  const sheet = getSheet(SHEET_NAMES.EQUIPMENT);
  ensureEquipmentSheetColumns(sheet);
  const data = sheet.getDataRange().getValues();
  
  // 搜尋財產編號或庫存編號
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (isMatchingEquipmentIdentifier(row, barcode)) {
      const equipment = createEquipmentObject(row);
      equipment.rowIndex = i + 1;
      return createResponse(true, '找到輔具', equipment);
    }
  }
  
  return createResponse(false, '查無此財編對應的展示輔具，可能不是展示輔具或尚未建檔');
}

// ==========================================
// 快速盤點功能（簡化版）
// ==========================================

function handleQuickInventory(e) {
  const propertyId = normalizeIdentifier(e.parameter.propertyId);
  const staffName = e.parameter.staffName;
  const photoData = e.parameter.photoData;
  const newLocation = e.parameter.newLocation || '';
  const newCurrentStatus = e.parameter.newCurrentStatus || '';
  
  if (!propertyId || !staffName) {
    return createResponse(false, '請提供必要資訊');
  }

  const result = performQuickInventory({
    propertyId: propertyId,
    staffName: staffName,
    photoData: photoData,
    newLocation: newLocation,
    newCurrentStatus: newCurrentStatus
  });

  return createResponse(result.success, result.message, result.data);
}

function handleBatchQuickInventory(e) {
  const staffName = e.parameter.staffName;
  const propertyIdsText = String(e.parameter.propertyIds || '');

  if (!staffName || !propertyIdsText) {
    return createResponse(false, '請提供人員與批次財產編號');
  }

  const requestedIds = propertyIdsText.split(',')
    .map(function(item) { return normalizeIdentifier(item); })
    .filter(function(item) { return !!item; });

  const uniqueIds = requestedIds.filter(function(item, index) {
    return requestedIds.indexOf(item) === index;
  });

  if (uniqueIds.length === 0) {
    return createResponse(false, '沒有可處理的財產編號');
  }

  const equipmentSheet = getSheet(SHEET_NAMES.EQUIPMENT);
  const equipmentData = equipmentSheet.getDataRange().getValues();
  const allowedPropertyIds = {};

  for (let i = 1; i < equipmentData.length; i++) {
    const propertyId = normalizeIdentifier(equipmentData[i][EQUIPMENT_COLS.PROPERTY_ID]);
    const keeper = String(equipmentData[i][EQUIPMENT_COLS.KEEPER] || '').trim();
    if (propertyId && keeper === staffName) {
      allowedPropertyIds[propertyId] = true;
    }
  }

  const successItems = [];
  const failedItems = [];

  for (let i = 0; i < uniqueIds.length; i++) {
    const propertyId = uniqueIds[i];
    if (!allowedPropertyIds[propertyId]) {
      failedItems.push({ propertyId: propertyId, message: '此輔具不屬於目前登入人員管理' });
      continue;
    }

    const result = performQuickInventory({
      propertyId: propertyId,
      staffName: staffName,
      photoData: '',
      newLocation: '',
      newCurrentStatus: ''
    });

    if (result.success) {
      successItems.push(result.data);
    } else {
      failedItems.push({ propertyId: propertyId, message: result.message || '批次盤點失敗' });
    }
  }

  return createResponse(successItems.length > 0, successItems.length > 0 ? '批次盤點完成' : '批次盤點失敗', {
    successCount: successItems.length,
    failedCount: failedItems.length,
    successItems: successItems,
    failedItems: failedItems
  });
}

function performQuickInventory(params) {
  const propertyId = normalizeIdentifier(params.propertyId);
  const staffName = params.staffName;
  const photoData = params.photoData || '';
  const newLocation = params.newLocation || '';
  const newCurrentStatus = params.newCurrentStatus || '';
  
  const sheet = getSheet(SHEET_NAMES.EQUIPMENT);
  ensureEquipmentSheetColumns(sheet);
  const data = sheet.getDataRange().getValues();
  
  let rowIndex = -1;
  let equipmentName = '';
  let oldLocation = '';
  let oldCurrentStatus = '';
  
  // 找到輔具
  for (let i = 1; i < data.length; i++) {
    if (normalizeIdentifier(data[i][EQUIPMENT_COLS.PROPERTY_ID]) === propertyId) {
      rowIndex = i + 1;
      equipmentName = data[i][EQUIPMENT_COLS.EQUIPMENT_NAME];
      oldLocation = data[i][EQUIPMENT_COLS.LOCATION];
      oldCurrentStatus = data[i][EQUIPMENT_COLS.CURRENT_STATUS];
      break;
    }
  }
  
  if (rowIndex === -1) {
    return {
      success: false,
      message: '查無此財編對應的展示輔具，可能不是展示輔具或尚未建檔',
      data: null
    };
  }
  
  // 自動判斷當次作為
  const currentAction = determineCurrentAction(equipmentName);
  
  // 上傳照片
  let photoUrl = '';
  if (photoData) {
    try {
      const blob = Utilities.newBlob(
        Utilities.base64Decode(photoData.split(',')[1]),
        'image/jpeg',
        propertyId + '_' + new Date().getTime() + '.jpg'
      );
      
      const folder = getOrCreateFolder('輔具盤點照片');
      const file = folder.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      photoUrl = file.getUrl();
    } catch(error) {
      Logger.log('照片上傳失敗: ' + error.message);
    }
  }
  
  // 更新輔具清單
  const now = new Date();
  const timeString = formatDateTime(now);
  sheet.getRange(rowIndex, EQUIPMENT_COLS.LAST_INVENTORY + 1).setValue(timeString);
  sheet.getRange(rowIndex, EQUIPMENT_COLS.CURRENT_ACTION + 1).setValue(currentAction);
  sheet.getRange(rowIndex, EQUIPMENT_COLS.UPDATED_AT + 1).setValue(timeString);
  sheet.getRange(rowIndex, EQUIPMENT_COLS.ACTIVITY_AT + 1).setValue(timeString);
  
  if (photoUrl) {
    sheet.getRange(rowIndex, EQUIPMENT_COLS.PHOTO_URL + 1).setValue(photoUrl);
  }
  
  if (newLocation) {
    sheet.getRange(rowIndex, EQUIPMENT_COLS.LOCATION + 1).setValue(newLocation);
  }
  
  if (newCurrentStatus) {
    sheet.getRange(rowIndex, EQUIPMENT_COLS.CURRENT_STATUS + 1).setValue(newCurrentStatus);
  }
  
  // 新增盤點記錄
  addInventoryLog({
    propertyId: propertyId,
    staffName: staffName,
    method: '拍照',
    oldLocation: oldLocation,
    newLocation: newLocation || oldLocation,
    oldCurrentStatus: oldCurrentStatus,
    newCurrentStatus: newCurrentStatus || oldCurrentStatus,
    currentAction: currentAction,
    hasPhoto: photoUrl ? '是' : '否',
    photoUrl: photoUrl,
    notes: ''
  });
  
  return {
    success: true,
    message: '盤點完成',
    data: {
      currentAction: currentAction,
      photoUrl: photoUrl,
      equipmentName: equipmentName,
      propertyId: propertyId,
      inventoryDate: timeString,
      activityAt: timeString,
      newLocation: newLocation || oldLocation,
      oldCurrentStatus: oldCurrentStatus,
      newCurrentStatus: newCurrentStatus || oldCurrentStatus
    }
  };
}

// ==========================================
// 外借管理功能
// ==========================================

function handleCreateLoan(e) {
  const propertyId = normalizeIdentifier(e.parameter.propertyId);
  const equipmentName = e.parameter.equipmentName;
  const borrower = e.parameter.borrower;
  const contactPerson = e.parameter.contactPerson || borrower;
  const contactPhone = e.parameter.contactPhone;
  const loanStartDate = e.parameter.loanStartDate;
  const expectedReturnDate = e.parameter.expectedReturnDate;
  const staffName = e.parameter.staffName;
  const signatureData = e.parameter.signatureData;
  const purpose = e.parameter.purpose || '';
  const notes = e.parameter.notes || '';
  
  if (!propertyId || !borrower || !loanStartDate || !expectedReturnDate || !purpose) {
    return createResponse(false, '請提供必要資訊');
  }

  const loanDate = parseDateInput(loanStartDate);
  if (!loanDate) {
    return createResponse(false, '借用起始日格式錯誤');
  }

  const returnDate = parseDateInput(expectedReturnDate);
  if (!returnDate) {
    return createResponse(false, '預計歸還日格式錯誤');
  }

  if (returnDate.getTime() < loanDate.getTime()) {
    return createResponse(false, '預計歸還日不能早於借用起始日');
  }
  
  // 檢查輔具是否可外借
  const equipSheet = getSheet(SHEET_NAMES.EQUIPMENT);
  ensureEquipmentSheetColumns(equipSheet);
  const equipData = equipSheet.getDataRange().getValues();
  let equipmentRow = -1;
  
  for (let i = 1; i < equipData.length; i++) {
    if (normalizeIdentifier(equipData[i][EQUIPMENT_COLS.PROPERTY_ID]) === propertyId) {
      if (equipData[i][EQUIPMENT_COLS.CURRENT_STATUS] === '外借中') {
        return createResponse(false, '此輔具目前已外借');
      }
      equipmentRow = i + 1;
      break;
    }
  }
  
  if (equipmentRow === -1) {
    return createResponse(false, '找不到此輔具');
  }
  
  // 處理簽名圖片
  let signatureUrl = '';
  if (signatureData) {
    try {
      const blob = Utilities.newBlob(
        Utilities.base64Decode(signatureData.split(',')[1]),
        'image/png',
        'signature_' + propertyId + '_' + new Date().getTime() + '.png'
      );
      
      const folder = getOrCreateNestedFolder(['輔具盤點系統', '外借簽名']);
      const file = folder.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      signatureUrl = file.getUrl();
    } catch(error) {
      Logger.log('簽名上傳失敗: ' + error.message);
    }
  }
  
  // 建立外借記錄
  const loanSheet = getSheet(SHEET_NAMES.LOANS);
  ensureLoanSheetColumns(loanSheet);
  const loanId = 'LOAN-' + Utilities.formatDate(new Date(), 'GMT+8', 'yyyyMMddHHmmss');
  const now = new Date();
  
  loanSheet.appendRow([
    loanId,                    // 外借編號
    propertyId,                // 財產編號
    equipmentName,             // 輔具品名
    borrower,                  // 借用人/單位
    contactPerson,             // 聯絡人
    contactPhone,              // 聯絡電話
    loanDate,                  // 外借日期
    returnDate,                // 預計歸還日期
    '',                        // 實際歸還日期
    '外借中',                  // 外借狀態
    staffName,                 // 經辦人員
    signatureUrl,              // 簽名圖片
    purpose,                   // 外借用途
    notes,                     // 備註
    now,                       // 建立日期
    '',                        // 歸還經辦人員
    ''                         // 歸還簽名圖片
  ]);
  
  // 更新輔具狀態為「外借中」
  equipSheet.getRange(equipmentRow, EQUIPMENT_COLS.CURRENT_STATUS + 1).setValue('外借中');
  equipSheet.getRange(equipmentRow, EQUIPMENT_COLS.UPDATED_AT + 1).setValue(now);
  equipSheet.getRange(equipmentRow, EQUIPMENT_COLS.ACTIVITY_AT + 1).setValue(now);
  
  return createResponse(true, '外借記錄建立成功', { loanId: loanId });
}

function handleGetLoanList(e) {
  const status = e.parameter.status || '';
  const area = e.parameter.area || '';
  
  const loanSheet = getSheet(SHEET_NAMES.LOANS);
  ensureLoanSheetColumns(loanSheet);
  const loanData = loanSheet.getDataRange().getValues();
  
  const equipSheet = getSheet(SHEET_NAMES.EQUIPMENT);
  const equipData = equipSheet.getDataRange().getValues();
  
  let loanList = [];
  for (let i = 1; i < loanData.length; i++) {
    const row = loanData[i];
    if (row[0] === '') continue;
    
    // 篩選狀態
    if (status && row[LOAN_COLS.STATUS] !== status) continue;
    
    // 篩選區域（需要從輔具清單查詢）
    if (area) {
      const propertyId = row[LOAN_COLS.PROPERTY_ID];
      let equipmentArea = '';
      
      for (let j = 1; j < equipData.length; j++) {
        if (normalizeIdentifier(equipData[j][EQUIPMENT_COLS.PROPERTY_ID]) === normalizeIdentifier(propertyId)) {
          const location = equipData[j][EQUIPMENT_COLS.LOCATION] || '';
          equipmentArea = extractArea(location);
          break;
        }
      }
      
      if (equipmentArea !== area) continue;
    }
    
      loanList.push({
      loanId: row[LOAN_COLS.LOAN_ID],
      propertyId: row[LOAN_COLS.PROPERTY_ID],
      equipmentName: row[LOAN_COLS.EQUIPMENT_NAME],
      borrower: row[LOAN_COLS.BORROWER],
      contactPerson: row[LOAN_COLS.CONTACT_PERSON],
      contactPhone: row[LOAN_COLS.CONTACT_PHONE],
      loanDate: row[LOAN_COLS.LOAN_DATE],
      expectedReturnDate: row[LOAN_COLS.EXPECTED_RETURN_DATE],
      actualReturnDate: row[LOAN_COLS.ACTUAL_RETURN_DATE],
      status: row[LOAN_COLS.STATUS],
      staffName: row[LOAN_COLS.STAFF_NAME],
      signatureUrl: row[LOAN_COLS.BORROWER_SIGNATURE_URL],
      purpose: row[LOAN_COLS.PURPOSE],
      notes: row[LOAN_COLS.NOTES],
      returnStaffName: row[LOAN_COLS.RETURN_STAFF_NAME],
      returnSignatureUrl: row[LOAN_COLS.RETURN_SIGNATURE_URL]
    });
  }
  
  return createResponse(true, '查詢成功', loanList);
}

function handleUpdateEquipmentDetails(e) {
  const propertyId = normalizeIdentifier(e.parameter.propertyId);
  const keeper = String(e.parameter.keeper || '').trim();
  const location = String(e.parameter.location || '').trim();
  const currentAction = String(e.parameter.currentAction || '').trim();
  const notes = String(e.parameter.notes || '').trim();

  if (!propertyId) {
    return createResponse(false, '請提供財產編號');
  }

  const sheet = getSheet(SHEET_NAMES.EQUIPMENT);
  ensureEquipmentSheetColumns(sheet);
  const data = sheet.getDataRange().getValues();
  let rowIndex = -1;

  for (let i = 1; i < data.length; i++) {
    if (normalizeIdentifier(data[i][EQUIPMENT_COLS.PROPERTY_ID]) === propertyId) {
      rowIndex = i + 1;
      break;
    }
  }

  if (rowIndex === -1) {
    return createResponse(false, '找不到此輔具');
  }

  const now = new Date();
  sheet.getRange(rowIndex, EQUIPMENT_COLS.KEEPER + 1).setValue(keeper);
  sheet.getRange(rowIndex, EQUIPMENT_COLS.LOCATION + 1).setValue(location);
  sheet.getRange(rowIndex, EQUIPMENT_COLS.CURRENT_ACTION + 1).setValue(currentAction);
  sheet.getRange(rowIndex, EQUIPMENT_COLS.NOTES + 1).setValue(notes);
  sheet.getRange(rowIndex, EQUIPMENT_COLS.UPDATED_AT + 1).setValue(now);
  sheet.getRange(rowIndex, EQUIPMENT_COLS.ACTIVITY_AT + 1).setValue(now);

  const updatedRow = sheet.getRange(rowIndex, 1, 1, sheet.getLastColumn()).getValues()[0];
  return createResponse(true, '輔具資料更新成功', createEquipmentObject(updatedRow));
}

function handleGetActiveLoanByPropertyId(e) {
  const propertyId = resolvePropertyId(e.parameter.propertyId);

  if (!propertyId) {
    return createResponse(false, '請提供財產編號');
  }

  const loanSheet = getSheet(SHEET_NAMES.LOANS);
  ensureLoanSheetColumns(loanSheet);
  const loanData = loanSheet.getDataRange().getValues();

  for (let i = loanData.length - 1; i >= 1; i--) {
    const row = loanData[i];
    if (normalizeIdentifier(row[LOAN_COLS.PROPERTY_ID]) !== normalizeIdentifier(propertyId)) continue;
    if (row[LOAN_COLS.STATUS] !== '外借中') continue;

    return createResponse(true, '查詢成功', {
      loanId: row[LOAN_COLS.LOAN_ID],
      propertyId: row[LOAN_COLS.PROPERTY_ID],
      equipmentName: row[LOAN_COLS.EQUIPMENT_NAME],
      borrower: row[LOAN_COLS.BORROWER],
      contactPerson: row[LOAN_COLS.CONTACT_PERSON],
      contactPhone: row[LOAN_COLS.CONTACT_PHONE],
      loanDate: row[LOAN_COLS.LOAN_DATE],
      expectedReturnDate: row[LOAN_COLS.EXPECTED_RETURN_DATE],
      actualReturnDate: row[LOAN_COLS.ACTUAL_RETURN_DATE],
      status: row[LOAN_COLS.STATUS],
      staffName: row[LOAN_COLS.STAFF_NAME],
      signatureUrl: row[LOAN_COLS.BORROWER_SIGNATURE_URL],
      purpose: row[LOAN_COLS.PURPOSE],
      notes: row[LOAN_COLS.NOTES],
      returnStaffName: row[LOAN_COLS.RETURN_STAFF_NAME],
      returnSignatureUrl: row[LOAN_COLS.RETURN_SIGNATURE_URL]
    });
  }

  const equipment = findEquipmentByPropertyId(propertyId);
  if (equipment && equipment.currentStatus === '外借中') {
    return createResponse(true, '查詢成功', {
      loanId: '',
      propertyId: equipment.propertyId,
      equipmentName: equipment.equipmentName,
      borrower: '',
      contactPerson: '',
      contactPhone: '',
      loanDate: '',
      expectedReturnDate: '',
      actualReturnDate: '',
      status: '外借中',
      staffName: '',
      signatureUrl: '',
      purpose: '',
      notes: '歷史外借資料未建檔',
      returnStaffName: '',
      returnSignatureUrl: '',
      isLegacyReturn: true
    });
  }

  return createResponse(false, '找不到此外借中的輔具');
}

function handleReturnLoan(e) {
  const loanId = e.parameter.loanId;
  const actualReturnDate = e.parameter.actualReturnDate;
  const staffName = e.parameter.staffName || '';
  const signatureData = e.parameter.signatureData || '';
  const propertyIdParam = resolvePropertyId(e.parameter.propertyId);
  const isLegacyReturn = e.parameter.isLegacyReturn === 'true';
  
  if ((!loanId && !propertyIdParam) || !actualReturnDate || !staffName) {
    return createResponse(false, '請提供必要資訊');
  }

  const returnDate = parseDateInput(actualReturnDate);
  if (!returnDate) {
    return createResponse(false, '實際歸還日期格式錯誤');
  }
  
  const loanSheet = getSheet(SHEET_NAMES.LOANS);
  ensureLoanSheetColumns(loanSheet);
  const loanData = loanSheet.getDataRange().getValues();
  
  let propertyId = propertyIdParam || '';
  let loanRow = -1;
  let loanDate = null;
  
  for (let i = 1; i < loanData.length; i++) {
    if (loanData[i][LOAN_COLS.LOAN_ID] === loanId) {
      propertyId = loanData[i][LOAN_COLS.PROPERTY_ID];
      loanDate = parseSheetDateValue(loanData[i][LOAN_COLS.LOAN_DATE]);
      loanRow = i + 1;
      break;
    }
  }
  
  if (loanRow === -1 && !isLegacyReturn) {
    return createResponse(false, '找不到此外借記錄');
  }

  if (loanDate && returnDate.getTime() < loanDate.getTime()) {
    return createResponse(false, '實際歸還日期不能早於借出日期');
  }
  
  const now = new Date();

  let returnSignatureUrl = '';
  if (signatureData) {
    try {
      const blob = Utilities.newBlob(
        Utilities.base64Decode(signatureData.split(',')[1]),
        'image/png',
        'return_signature_' + propertyId + '_' + new Date().getTime() + '.png'
      );

      const folder = getOrCreateNestedFolder(['輔具盤點系統', '歸還簽名']);
      const file = folder.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      returnSignatureUrl = file.getUrl();
    } catch(error) {
      Logger.log('歸還簽名上傳失敗: ' + error.message);
    }
  }
  
  if (loanRow !== -1) {
    loanSheet.getRange(loanRow, LOAN_COLS.ACTUAL_RETURN_DATE + 1).setValue(returnDate);
    loanSheet.getRange(loanRow, LOAN_COLS.STATUS + 1).setValue('已歸還');
    loanSheet.getRange(loanRow, LOAN_COLS.RETURN_STAFF_NAME + 1).setValue(staffName);
    loanSheet.getRange(loanRow, LOAN_COLS.RETURN_SIGNATURE_URL + 1).setValue(returnSignatureUrl);
  } else {
    const equipment = findEquipmentByPropertyId(propertyId);
    if (!equipment) {
      return createResponse(false, '找不到此輔具');
    }

    loanSheet.appendRow([
      'LEGACY-' + Utilities.formatDate(new Date(), 'GMT+8', 'yyyyMMddHHmmss'),
      propertyId,
      equipment.equipmentName,
      '歷史資料未建檔',
      '',
      '',
      '',
      '',
      returnDate,
      '已歸還',
      '',
      '',
      '歷史外借資料補登歸還',
      '歷史外借資料補登歸還',
      now,
      staffName,
      returnSignatureUrl
    ]);
  }
  
  // 更新輔具狀態為「展示中」
  const equipSheet = getSheet(SHEET_NAMES.EQUIPMENT);
  ensureEquipmentSheetColumns(equipSheet);
  const equipData = equipSheet.getDataRange().getValues();
  
  for (let i = 1; i < equipData.length; i++) {
    if (normalizeIdentifier(equipData[i][EQUIPMENT_COLS.PROPERTY_ID]) === normalizeIdentifier(propertyId)) {
      equipSheet.getRange(i + 1, EQUIPMENT_COLS.CURRENT_STATUS + 1).setValue('展示中');
      equipSheet.getRange(i + 1, EQUIPMENT_COLS.UPDATED_AT + 1).setValue(now);
      equipSheet.getRange(i + 1, EQUIPMENT_COLS.ACTIVITY_AT + 1).setValue(now);
      break;
    }
  }
  
  return createResponse(true, '歸還成功');
}

function handleGenerateMonthlyLoanReport(e) {
  const month = e.parameter.month;
  const area = e.parameter.area || '';

  if (!month) {
    return createResponse(false, '請提供報表月份');
  }

  const monthInfo = parseReportMonth(month);
  if (!monthInfo) {
    return createResponse(false, '月份格式錯誤，請使用 YYYY-MM');
  }

  const loanSheet = getSheet(SHEET_NAMES.LOANS);
  ensureLoanSheetColumns(loanSheet);
  const loanData = loanSheet.getDataRange().getValues();
  const rows = [];

  for (let i = 1; i < loanData.length; i++) {
    const row = loanData[i];
    if (!row[LOAN_COLS.LOAN_ID]) continue;

    const propertyId = row[LOAN_COLS.PROPERTY_ID];
    const loanDate = parseSheetDateValue(row[LOAN_COLS.LOAN_DATE]);
    const actualReturnDate = parseSheetDateValue(row[LOAN_COLS.ACTUAL_RETURN_DATE]);
    const expectedReturnDate = parseSheetDateValue(row[LOAN_COLS.EXPECTED_RETURN_DATE]);
    const equipment = findEquipmentByPropertyId(propertyId);
    const equipmentArea = equipment ? extractArea(propertyId, equipment.keeper) : '';

    if (area && equipmentArea !== area) continue;

    const inMonth = (loanDate && isDateInMonth(loanDate, monthInfo.year, monthInfo.monthIndex)) ||
      (actualReturnDate && isDateInMonth(actualReturnDate, monthInfo.year, monthInfo.monthIndex)) ||
      (expectedReturnDate && isDateInMonth(expectedReturnDate, monthInfo.year, monthInfo.monthIndex));
    if (!inMonth) continue;

    rows.push({
      sequence: rows.length + 1,
      propertyId: propertyId,
      equipmentName: row[LOAN_COLS.EQUIPMENT_NAME] || '',
      borrower: row[LOAN_COLS.BORROWER] || '',
      loanDate: loanDate,
      expectedReturnDate: expectedReturnDate,
      actualReturnDate: actualReturnDate,
      status: row[LOAN_COLS.STATUS] || '',
      staffName: row[LOAN_COLS.STAFF_NAME] || '',
      returnStaffName: row[LOAN_COLS.RETURN_STAFF_NAME] || ''
    });
  }

  if (rows.length === 0) {
    return createResponse(false, '該月份沒有符合條件的外借紀錄');
  }

  const reportTitle = buildMonthlyLoanReportTitle(area, monthInfo);
  const fileName = buildMonthlyLoanReportFileName(area, monthInfo);
  const html = buildMonthlyLoanReportHtml(reportTitle, rows);
  const pdfBlob = HtmlService.createHtmlOutput(html)
    .getBlob()
    .getAs(MimeType.PDF)
    .setName(fileName + '.pdf');
  const folder = getOrCreateReportFolder();
  const pdfFile = folder.createFile(pdfBlob);
  pdfFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  return createResponse(true, '外借月報產生成功', {
    fileId: pdfFile.getId(),
    fileName: pdfFile.getName(),
    url: pdfFile.getUrl(),
    downloadUrl: 'https://drive.google.com/uc?export=download&id=' + pdfFile.getId(),
    rowCount: rows.length
  });
}

// ==========================================
// 人員管理功能
// ==========================================

function handleGetStaffList(e) {
  const sheet = getSheet(SHEET_NAMES.STAFF);
  const data = sheet.getDataRange().getValues();
  
  let staffList = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row[0] === '') continue;
    if (row[3] !== '在職') continue; // 狀態在第 4 欄（索引 3）
    
    staffList.push({
      name: row[0],      // 姓名（第 1 欄）
      area: row[1],      // 區域（第 2 欄）
      role: row[2],      // 權限（第 3 欄）
      status: row[3]     // 狀態（第 4 欄）
    });
  }
  
  return createResponse(true, '查詢成功', staffList);
}

// ==========================================
// 照片上傳功能
// ==========================================

function handleUploadPhoto(e) {
  const propertyId = normalizeIdentifier(e.parameter.propertyId);
  const imageData = e.parameter.imageData;
  const staffName = String(e.parameter.staffName || '').trim();
  
  if (!propertyId || !imageData) {
    return createResponse(false, '請提供財產編號和照片');
  }
  
  try {
    const folder = getOrCreatePhotoFolder();
    const fileName = propertyId + '.jpg';
    const existingFiles = folder.getFilesByName(fileName);
    while (existingFiles.hasNext()) {
      existingFiles.next().setTrashed(true);
    }

    const blob = Utilities.newBlob(
      Utilities.base64Decode(imageData.split(',')[1]),
      'image/jpeg',
      fileName
    );

    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    const photoUrl = file.getUrl();
    
    // 更新輔具清單中的照片網址
    const sheet = getSheet(SHEET_NAMES.EQUIPMENT);
    ensureEquipmentSheetColumns(sheet);
    const data = sheet.getDataRange().getValues();
    let updatedEquipment = null;
    
    for (let i = 1; i < data.length; i++) {
      if (normalizeIdentifier(data[i][EQUIPMENT_COLS.PROPERTY_ID]) === propertyId) {
        const activityTime = new Date();
        const timeString = formatDateTime(activityTime);
        const equipmentName = data[i][EQUIPMENT_COLS.EQUIPMENT_NAME] || '';
        const currentAction = determineCurrentAction(equipmentName);
        const oldLocation = data[i][EQUIPMENT_COLS.LOCATION] || '';
        const oldCurrentStatus = data[i][EQUIPMENT_COLS.CURRENT_STATUS] || '';

        sheet.getRange(i + 1, EQUIPMENT_COLS.PHOTO_URL + 1).setValue(photoUrl);
        sheet.getRange(i + 1, EQUIPMENT_COLS.LAST_INVENTORY + 1).setValue(timeString);
        sheet.getRange(i + 1, EQUIPMENT_COLS.CURRENT_ACTION + 1).setValue(currentAction);
        sheet.getRange(i + 1, EQUIPMENT_COLS.UPDATED_AT + 1).setValue(timeString);
        sheet.getRange(i + 1, EQUIPMENT_COLS.ACTIVITY_AT + 1).setValue(timeString);

        data[i][EQUIPMENT_COLS.PHOTO_URL] = photoUrl;
        data[i][EQUIPMENT_COLS.LAST_INVENTORY] = timeString;
        data[i][EQUIPMENT_COLS.CURRENT_ACTION] = currentAction;
        data[i][EQUIPMENT_COLS.UPDATED_AT] = timeString;
        data[i][EQUIPMENT_COLS.ACTIVITY_AT] = timeString;

        if (staffName) {
          addInventoryLog({
            propertyId: propertyId,
            staffName: staffName,
            method: '拍照',
            oldLocation: oldLocation,
            newLocation: oldLocation,
            oldCurrentStatus: oldCurrentStatus,
            newCurrentStatus: oldCurrentStatus,
            currentAction: currentAction,
            hasPhoto: '是',
            photoUrl: photoUrl,
            notes: '拍照上傳時同步標記為已盤點'
          });
        }

        updatedEquipment = createEquipmentObject(data[i]);
        break;
      }
    }
    
    return createResponse(true, '照片上傳成功', updatedEquipment || { propertyId: propertyId, photoUrl: photoUrl });
  } catch(error) {
    return createResponse(false, '照片上傳失敗: ' + error.message);
  }
}

// ==========================================
// 月報表功能
// ==========================================

function handleGenerateMonthlyMaintenanceReport(e) {
  const month = e.parameter.month;
  const area = e.parameter.area || '';

  if (!month) {
    return createResponse(false, '請提供報表月份');
  }

  const monthInfo = parseReportMonth(month);
  if (!monthInfo) {
    return createResponse(false, '月份格式錯誤，請使用 YYYY-MM');
  }

  const equipmentSheet = getSheet(SHEET_NAMES.EQUIPMENT);
  const equipmentData = equipmentSheet.getDataRange().getValues();
  const reportRows = [];

  for (let i = 1; i < equipmentData.length; i++) {
    const row = equipmentData[i];
    const propertyId = row[EQUIPMENT_COLS.PROPERTY_ID];
    if (!propertyId) continue;

    const lastInventory = parseSheetDateValue(row[EQUIPMENT_COLS.LAST_INVENTORY]);
    if (!lastInventory) continue;
    if (!isDateInMonth(lastInventory, monthInfo.year, monthInfo.monthIndex)) continue;

    const equipmentArea = extractArea(propertyId, row[EQUIPMENT_COLS.KEEPER]);
    if (area && equipmentArea !== area) continue;

    reportRows.push({
      sequence: reportRows.length + 1,
      equipmentName: row[EQUIPMENT_COLS.EQUIPMENT_NAME] || '',
      location: row[EQUIPMENT_COLS.LOCATION] || '',
      propertyId: propertyId,
      keeper: row[EQUIPMENT_COLS.KEEPER] || '',
      currentStatus: row[EQUIPMENT_COLS.CURRENT_STATUS] || '',
      currentAction: row[EQUIPMENT_COLS.CURRENT_ACTION] || '',
      inventoryTime: lastInventory
    });
  }

  if (reportRows.length === 0) {
    return createResponse(false, '該月份沒有符合條件的維護紀錄');
  }

  const reportTitle = buildMonthlyReportTitle(area, monthInfo);
  const fileName = buildMonthlyReportFileName(area, monthInfo);
  const html = buildMonthlyReportHtml(reportTitle, reportRows);
  const pdfBlob = HtmlService.createHtmlOutput(html)
    .getBlob()
    .getAs(MimeType.PDF)
    .setName(fileName + '.pdf');
  const folder = getOrCreateReportFolder();
  const pdfFile = folder.createFile(pdfBlob);
  pdfFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  return createResponse(true, '月報表產生成功', {
    fileId: pdfFile.getId(),
    fileName: pdfFile.getName(),
    url: pdfFile.getUrl(),
    downloadUrl: 'https://drive.google.com/uc?export=download&id=' + pdfFile.getId(),
    rowCount: reportRows.length
  });
}

// ==========================================
// 工具函數
// ==========================================

function createEquipmentObject(row) {
  return {
    propertyId: row[EQUIPMENT_COLS.PROPERTY_ID],
    inventoryId: row[EQUIPMENT_COLS.INVENTORY_ID],
    equipmentName: row[EQUIPMENT_COLS.EQUIPMENT_NAME],
    category: row[EQUIPMENT_COLS.CATEGORY],
    itemName: row[EQUIPMENT_COLS.ITEM_NAME],
    location: row[EQUIPMENT_COLS.LOCATION],
    keeper: row[EQUIPMENT_COLS.KEEPER],
    status: row[EQUIPMENT_COLS.STATUS],
    currentStatus: row[EQUIPMENT_COLS.CURRENT_STATUS],
    currentDynamic: row[EQUIPMENT_COLS.CURRENT_STATUS],  // 目前動態（使用 CURRENT_STATUS 欄位）
    source: row[EQUIPMENT_COLS.SOURCE],
    donor: row[EQUIPMENT_COLS.DONOR],
    originalId: row[EQUIPMENT_COLS.ORIGINAL_ID],
    spec: row[EQUIPMENT_COLS.SPEC],
    entryDate: row[EQUIPMENT_COLS.ENTRY_DATE],
    lastInventory: row[EQUIPMENT_COLS.LAST_INVENTORY],
    currentAction: row[EQUIPMENT_COLS.CURRENT_ACTION],
    notes: row[EQUIPMENT_COLS.NOTES],
    photoUrl: row[EQUIPMENT_COLS.PHOTO_URL],
    marketPrice: row[EQUIPMENT_COLS.MARKET_PRICE],
    purchasePrice: row[EQUIPMENT_COLS.PURCHASE_PRICE],
    createdAt: row[EQUIPMENT_COLS.CREATED_AT],
    updatedAt: row[EQUIPMENT_COLS.UPDATED_AT],
    activityAt: row[EQUIPMENT_COLS.ACTIVITY_AT]
  };
}

function parseReportMonth(monthText) {
  const match = String(monthText || '').match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;

  return {
    year: year,
    month: month,
    monthIndex: month - 1,
    rocYear: year - 1911,
    monthLabel: month < 10 ? '0' + month : String(month)
  };
}

function parseSheetDateValue(value) {
  if (!value) return null;
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return value;
  }

  const normalized = String(value)
    .trim()
    .replace(/\u4e0a\u5348/g, ' AM ')
    .replace(/\u4e0b\u5348/g, ' PM ');
  const parsed = new Date(normalized);
  if (!isNaN(parsed.getTime())) return parsed;

  const fallback = new Date(String(value).replace(/-/g, '/'));
  return isNaN(fallback.getTime()) ? null : fallback;
}

function isDateInMonth(date, year, monthIndex) {
  return date.getFullYear() === year && date.getMonth() === monthIndex;
}

function buildMonthlyReportTitle(area, monthInfo) {
  const areaTitle = area ? area : '全區';
  return areaTitle + '輔具資源中心' + monthInfo.rocYear + '年' + monthInfo.monthLabel + '月份展示輔具維護清冊';
}

function buildMonthlyReportFileName(area, monthInfo) {
  const areaTitle = area ? area : '全區';
  return areaTitle + '展示輔具盤點月報表' + monthInfo.year + monthInfo.monthLabel;
}

function buildMonthlyLoanReportTitle(area, monthInfo) {
  const areaTitle = area ? area : '全區';
  return areaTitle + '輔具資源中心' + monthInfo.rocYear + '年' + monthInfo.monthLabel + '月份外借紀錄月報表';
}

function buildMonthlyLoanReportFileName(area, monthInfo) {
  const areaTitle = area ? area : '全區';
  return areaTitle + '展示輔具外借月報表' + monthInfo.year + monthInfo.monthLabel;
}

function buildMonthlyReportHtml(title, reportRows) {
  const tableRows = reportRows.map(function(row) {
    return '<tr>' +
      '<td class="col-seq">' + row.sequence + '</td>' +
      '<td class="col-name">' + escapeHtml(row.equipmentName) + '</td>' +
      '<td class="col-location">' + escapeHtml(row.location) + '</td>' +
      '<td class="col-property">' + escapeHtml(row.propertyId) + '</td>' +
      '<td class="col-keeper">' + escapeHtml(row.keeper) + '</td>' +
      '<td class="col-status">' + renderStatusHtml(row.currentStatus) + '</td>' +
      '<td class="col-action">' + renderCurrentActionHtml(row.currentAction) + '</td>' +
      '<td class="col-time">' + formatReportDateTime(row.inventoryTime) + '</td>' +
      '</tr>';
  }).join('');

  return [
    '<!DOCTYPE html>',
    '<html>',
    '<head>',
    '<meta charset="UTF-8">',
    '<style>',
    '@page { size: A4 portrait; margin: 12mm 8mm 18mm 8mm; }',
    'body { font-family: Arial, "Microsoft JhengHei", sans-serif; color: #111827; font-size: 11px; }',
    '.report-title { text-align: center; font-size: 18px; font-weight: 700; margin: 0 0 8px; }',
    'table { width: 100%; border-collapse: collapse; table-layout: fixed; }',
    'thead { display: table-header-group; }',
    'tr { page-break-inside: avoid; }',
    'th, td { border: 1px solid #111827; padding: 4px; vertical-align: top; word-break: break-word; }',
    'th { text-align: center; font-weight: 700; }',
    '.col-seq { width: 5%; text-align: center; }',
    '.col-name { width: 18%; }',
    '.col-location { width: 18%; }',
    '.col-property { width: 19%; text-align: center; }',
    '.col-keeper { width: 8%; text-align: center; }',
    '.col-status { width: 8%; text-align: center; }',
    '.col-action { width: 10%; }',
    '.col-time { width: 14%; text-align: center; }',
    '.status-badge { display: inline-block; padding: 2px 6px; border-radius: 10px; font-size: 10px; font-weight: 700; }',
    '.status-loan { background: #ede9fe; color: #6d28d9; }',
    '.status-maintenance { background: #fee2e2; color: #b91c1c; }',
    '.status-default { background: #f3f4f6; color: #374151; }',
    '.action-line { display: block; white-space: nowrap; }',
    '.summary { margin-top: 14px; font-size: 12px; line-height: 1.8; }',
    '.signature-line { margin-top: 18px; display: flex; justify-content: space-between; }',
    '.signature-item { width: 45%; }',
    '</style>',
    '</head>',
    '<body>',
    '<div class="report-title">' + escapeHtml(title) + '</div>',
    '<table>',
    '<thead>',
    '<tr>',
    '<th class="col-seq">序號</th>',
    '<th class="col-name">輔具品名</th>',
    '<th class="col-location">放置地點</th>',
    '<th class="col-property">財產編號</th>',
    '<th class="col-keeper">保管人</th>',
    '<th class="col-status">目前動態</th>',
    '<th class="col-action">當次作為</th>',
    '<th class="col-time">盤點時間</th>',
    '</tr>',
    '</thead>',
    '<tbody>',
    tableRows,
    '</tbody>',
    '</table>',
    '<div class="summary">',
    '<div>外借中（紫色）：</div>',
    '<div>維護中（紅色）：</div>',
    '<div>本月有維護紀錄（黃色）：</div>',
    '</div>',
    '<div class="signature-line">',
    '<div class="signature-item">經辦人：</div>',
    '<div class="signature-item">主管核章：</div>',
    '</div>',
    '</body>',
    '</html>'
  ].join('');
}

function buildMonthlyLoanReportHtml(title, reportRows) {
  const tableRows = reportRows.map(function(row) {
    return '<tr>' +
      '<td class="col-seq">' + row.sequence + '</td>' +
      '<td class="col-property">' + escapeHtml(row.propertyId) + '</td>' +
      '<td class="col-name">' + escapeHtml(row.equipmentName) + '</td>' +
      '<td class="col-borrower">' + escapeHtml(row.borrower) + '</td>' +
      '<td class="col-time">' + formatNullableReportDateTime(row.loanDate) + '</td>' +
      '<td class="col-time">' + formatNullableReportDateTime(row.expectedReturnDate) + '</td>' +
      '<td class="col-time">' + formatNullableReportDateTime(row.actualReturnDate) + '</td>' +
      '<td class="col-status">' + escapeHtml(row.status) + '</td>' +
      '<td class="col-keeper">' + escapeHtml(row.staffName) + '</td>' +
      '<td class="col-keeper">' + escapeHtml(row.returnStaffName) + '</td>' +
      '</tr>';
  }).join('');

  return [
    '<!DOCTYPE html>',
    '<html>',
    '<head>',
    '<meta charset="UTF-8">',
    '<style>',
    '@page { size: A4 landscape; margin: 10mm 6mm 14mm 6mm; }',
    'body { font-family: Arial, "Microsoft JhengHei", sans-serif; color: #111827; font-size: 10px; }',
    '.report-title { text-align: center; font-size: 17px; font-weight: 700; margin: 0 0 8px; }',
    'table { width: 100%; border-collapse: collapse; table-layout: fixed; }',
    'thead { display: table-header-group; }',
    'tr { page-break-inside: avoid; }',
    'th, td { border: 1px solid #111827; padding: 4px; vertical-align: top; word-break: break-word; }',
    'th { text-align: center; font-weight: 700; }',
    '.col-seq { width: 4%; text-align: center; }',
    '.col-property { width: 12%; text-align: center; }',
    '.col-name { width: 14%; }',
    '.col-borrower { width: 13%; }',
    '.col-time { width: 12%; text-align: center; }',
    '.col-status { width: 7%; text-align: center; }',
    '.col-keeper { width: 7%; text-align: center; }',
    '</style>',
    '</head>',
    '<body>',
    '<div class="report-title">' + escapeHtml(title) + '</div>',
    '<table>',
    '<thead>',
    '<tr>',
    '<th class="col-seq">序號</th>',
    '<th class="col-property">財產編號</th>',
    '<th class="col-name">輔具品名</th>',
    '<th class="col-borrower">借用人/單位</th>',
    '<th class="col-time">外借日期時間</th>',
    '<th class="col-time">預計歸還日期時間</th>',
    '<th class="col-time">實際歸還日期時間</th>',
    '<th class="col-status">外借狀態</th>',
    '<th class="col-keeper">外借經辦</th>',
    '<th class="col-keeper">歸還經辦</th>',
    '</tr>',
    '</thead>',
    '<tbody>',
    tableRows,
    '</tbody>',
    '</table>',
    '</body>',
    '</html>'
  ].join('');
}

function renderCurrentActionHtml(actionText) {
  const flags = parseCurrentAction(actionText);
  return '<span class="action-line">' + (flags.clean ? '■' : '□') + '需清潔</span>' +
    '<span class="action-line">' + (flags.charge ? '■' : '□') + '需充電</span>';
}

function parseCurrentAction(actionText) {
  const text = String(actionText || '');
  return {
    clean: text.indexOf('◼需清潔') !== -1 || text.indexOf('■需清潔') !== -1 || (text.indexOf('需清潔') !== -1 && text.indexOf('☐需清潔') === -1 && text.indexOf('□需清潔') === -1),
    charge: text.indexOf('◼需充電') !== -1 || text.indexOf('■需充電') !== -1 || (text.indexOf('需充電') !== -1 && text.indexOf('☐需充電') === -1 && text.indexOf('□需充電') === -1)
  };
}

function renderStatusHtml(status) {
  const text = escapeHtml(status || '');
  if (status === '外借中') {
    return '<span class="status-badge status-loan">' + text + '</span>';
  }
  if (status === '維護中') {
    return '<span class="status-badge status-maintenance">' + text + '</span>';
  }
  return '<span class="status-badge status-default">' + text + '</span>';
}

function formatReportDateTime(date) {
  const datePart = Utilities.formatDate(date, 'GMT+8', 'yyyy/M/d');
  const hour = Number(Utilities.formatDate(date, 'GMT+8', 'H'));
  const minute = Utilities.formatDate(date, 'GMT+8', 'mm');
  const second = Utilities.formatDate(date, 'GMT+8', 'ss');
  const amPm = hour >= 12 ? '下午' : '上午';
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return datePart + '<br>' + amPm + ' ' + displayHour + ':' + minute + ':' + second;
}

function formatNullableReportDateTime(date) {
  return date ? formatReportDateTime(date) : '-';
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function determineCurrentAction(equipmentName) {
  // 自動判斷：品名包含「電動」→需充電，否則→需清潔
  // 使用勾選框格式：◼ = 已勾選，☐ = 未勾選
  if (equipmentName && equipmentName.indexOf('電動') !== -1) {
    return '☐需清潔◼需充電';
  } else {
    return '◼需清潔☐需充電';
  }
}

function formatDateTime(date) {
  // 格式化為 YYYY/M/D HH:mm:ss
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = date.getSeconds();
  
  return year + '/' + month + '/' + day + ' ' + 
         (hours < 10 ? '0' : '') + hours + ':' + 
         (minutes < 10 ? '0' : '') + minutes + ':' + 
         (seconds < 10 ? '0' : '') + seconds;
}

function parseDateInput(value) {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2}))?$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4] || 0);
  const minute = Number(match[5] || 0);
  const date = new Date(year, month - 1, day, hour, minute, 0, 0);

  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day || date.getHours() !== hour || date.getMinutes() !== minute) {
    return null;
  }

  return date;
}

function resolvePropertyId(inputValue) {
  const target = normalizeIdentifier(inputValue);
  if (!target) return '';

  const sheet = getSheet(SHEET_NAMES.EQUIPMENT);
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (isMatchingEquipmentIdentifier(data[i], target)) {
      return data[i][EQUIPMENT_COLS.PROPERTY_ID];
    }
  }

  return target;
}

function findEquipmentByPropertyId(propertyId) {
  const target = normalizeIdentifier(propertyId);
  if (!target) return null;

  const sheet = getSheet(SHEET_NAMES.EQUIPMENT);
  ensureEquipmentSheetColumns(sheet);
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (normalizeIdentifier(data[i][EQUIPMENT_COLS.PROPERTY_ID]) === target) {
      return createEquipmentObject(data[i]);
    }
  }

  return null;
}

function extractArea(propertyId, keeper) {
  // 方法1：根據財產編號第2碼判斷區域
  // A = 屏北區，B = 屏中區
  if (propertyId && propertyId.length >= 2) {
    const secondChar = propertyId.charAt(1).toUpperCase();
    if (secondChar === 'A') {
      return '屏北區';
    } else if (secondChar === 'B') {
      return '屏中區';
    }
  }
  
  // 方法2：如果財產編號無法判斷，根據保管人從人員清單查詢區域
  if (keeper) {
    const staffSheet = getSheet(SHEET_NAMES.STAFF);
    const staffData = staffSheet.getDataRange().getValues();
    
    for (let i = 1; i < staffData.length; i++) {
      if (staffData[i][0] === keeper) { // 姓名在第1欄
        return staffData[i][1] || ''; // 區域在第2欄
      }
    }
  }
  
  return '';
}

function addInventoryLog(logData) {
  const logSheet = getSheet(SHEET_NAMES.INVENTORY_LOG);
  const logId = 'LOG-' + Utilities.formatDate(new Date(), 'GMT+8', 'yyyyMMddHHmmss');
  
  logSheet.appendRow([
    logId,
    logData.propertyId,
    new Date(),
    logData.staffName,
    logData.method,
    logData.oldLocation,
    logData.newLocation,
    logData.oldCurrentStatus,
    logData.newCurrentStatus,
    logData.currentAction,
    logData.hasPhoto,
    logData.photoUrl,
    logData.notes
  ]);
}

function getSheet(sheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(sheetName);
  
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    initializeSheet(sheet, sheetName);
  }

  if (sheetName === SHEET_NAMES.EQUIPMENT) {
    ensureEquipmentSheetColumns(sheet);
  } else if (sheetName === SHEET_NAMES.LOANS) {
    ensureLoanSheetColumns(sheet);
  }
  
  return sheet;
}

function initializeSheet(sheet, sheetName) {
  let headers = [];
  
  switch(sheetName) {
    case SHEET_NAMES.EQUIPMENT:
      headers = ['財產編號', '庫存編號', '輔具品名', '輔具項目分類', '輔具項目名稱', 
                 '放置地點', '保管人', '狀態', '目前動態', '輔具來源', '捐贈者', 
                 '原始編號', '規格型號', '入庫日期', '最後盤點時間', '當次作為', 
                 '備註', '照片網址', '折合市價', '輔具價位', '建立日期', '更新日期', '最近作業時間'];
      break;
    case SHEET_NAMES.LOANS:
      headers = ['外借編號', '財產編號', '輔具品名', '借用人/單位', '聯絡人', '聯絡電話',
                  '外借日期', '預計歸還日期', '實際歸還日期', '外借狀態', '經辦人員',
                  '簽名圖片', '外借用途', '備註', '建立日期', '歸還經辦人員', '歸還簽名圖片'];
      break;
    case SHEET_NAMES.STAFF:
      headers = ['姓名', '區域', '權限', '狀態'];
      break;
    case SHEET_NAMES.INVENTORY_LOG:
      headers = ['記錄編號', '財產編號', '盤點日期時間', '盤點人員', '盤點方式',
                 '原放置地點', '新放置地點', '原目前動態', '新目前動態', '當次作為',
                 '是否拍照', '照片網址', '備註'];
      break;
  }
  
  if (headers.length > 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
}

function ensureLoanSheetColumns(sheet) {
  const expectedHeaders = ['外借編號', '財產編號', '輔具品名', '借用人/單位', '聯絡人', '聯絡電話',
    '外借日期', '預計歸還日期', '實際歸還日期', '外借狀態', '經辦人員',
    '簽名圖片', '外借用途', '備註', '建立日期', '歸還經辦人員', '歸還簽名圖片'];

  if (sheet.getLastRow() === 0) {
    initializeSheet(sheet, SHEET_NAMES.LOANS);
    return;
  }

  const currentWidth = sheet.getLastColumn();
  if (currentWidth >= expectedHeaders.length) {
    return;
  }

  for (let col = currentWidth + 1; col <= expectedHeaders.length; col++) {
    sheet.getRange(1, col).setValue(expectedHeaders[col - 1]);
  }

  sheet.getRange(1, 1, 1, expectedHeaders.length).setFontWeight('bold');
  sheet.setFrozenRows(1);
}

function ensureEquipmentSheetColumns(sheet) {
  const expectedHeaders = ['財產編號', '庫存編號', '輔具品名', '輔具項目分類', '輔具項目名稱',
    '放置地點', '保管人', '狀態', '目前動態', '輔具來源', '捐贈者',
    '原始編號', '規格型號', '入庫日期', '最後盤點時間', '當次作為',
    '備註', '照片網址', '折合市價', '輔具價位', '建立日期', '更新日期', '最近作業時間'];

  if (sheet.getLastRow() === 0) {
    initializeSheet(sheet, SHEET_NAMES.EQUIPMENT);
    return;
  }

  const currentWidth = sheet.getLastColumn();
  if (currentWidth >= expectedHeaders.length) {
    return;
  }

  for (let col = currentWidth + 1; col <= expectedHeaders.length; col++) {
    sheet.getRange(1, col).setValue(expectedHeaders[col - 1]);
  }

  sheet.getRange(1, 1, 1, expectedHeaders.length).setFontWeight('bold');
  sheet.setFrozenRows(1);
}

function getOrCreateFolder(folderName) {
  const folders = DriveApp.getFoldersByName(folderName);
  if (folders.hasNext()) {
    return folders.next();
  } else {
    return DriveApp.createFolder(folderName);
  }
}

function getOrCreateNestedFolder(folderNames) {
  if (!folderNames || folderNames.length === 0) {
    throw new Error('請提供資料夾路徑');
  }

  let currentFolder = null;

  for (let i = 0; i < folderNames.length; i++) {
    const folderName = folderNames[i];
    if (!currentFolder) {
      currentFolder = getOrCreateFolder(folderName);
      continue;
    }

    const childFolders = currentFolder.getFoldersByName(folderName);
    currentFolder = childFolders.hasNext() ? childFolders.next() : currentFolder.createFolder(folderName);
  }

  return currentFolder;
}

function getOrCreateReportFolder() {
  return getOrCreateNestedFolder(['輔具盤點系統', '月報表PDF']);
}

function getOrCreatePhotoFolder() {
  return getOrCreateNestedFolder(['輔具盤點系統', '輔具照片']);
}

function createResponse(success, message, data = null) {
  const response = {
    success: success,
    message: message,
    data: data,
    timestamp: new Date().toISOString()
  };
  
  return ContentService.createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}

function normalizeIdentifier(value) {
  return String(value || '').trim().toUpperCase();
}

function isMatchingEquipmentIdentifier(row, target) {
  const normalizedTarget = normalizeIdentifier(target);
  return normalizeIdentifier(row[EQUIPMENT_COLS.PROPERTY_ID]) === normalizedTarget ||
    normalizeIdentifier(row[EQUIPMENT_COLS.INVENTORY_ID]) === normalizedTarget;
}
