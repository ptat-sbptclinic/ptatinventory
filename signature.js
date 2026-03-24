// ==========================================
// 電子簽名功能
// ==========================================

const signaturePads = {};

document.addEventListener('DOMContentLoaded', function() {
  initializeSignaturePad('loanSignatureCanvas', 'clearLoanSignatureBtn');
  initializeSignaturePad('returnSignatureCanvas', 'clearReturnSignatureBtn');
});

function initializeSignaturePad(canvasId, clearButtonId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;

  if (signaturePads[canvasId]) {
    resizeSignatureCanvas(signaturePads[canvasId]);
    bindClearButton(signaturePads[canvasId], clearButtonId);
    return signaturePads[canvasId];
  }

  const context = canvas.getContext('2d');
  const pad = {
    canvasId: canvasId,
    canvas: canvas,
    context: context,
    isDrawing: false,
    hasSignature: false,
    lastPoint: null,
    clearButtonId: clearButtonId || ''
  };

  signaturePads[canvasId] = pad;

  configureSignatureContext(pad);
  resizeSignatureCanvas(pad);
  bindSignatureEvents(pad);
  bindClearButton(pad, clearButtonId);

  window.addEventListener('resize', function() {
    resizeSignatureCanvas(pad);
  });

  return pad;
}

function configureSignatureContext(pad) {
  const settings = CONFIG.SIGNATURE_SETTINGS;
  pad.context.strokeStyle = settings.lineColor;
  pad.context.lineWidth = settings.lineWidth;
  pad.context.lineCap = 'round';
  pad.context.lineJoin = 'round';
}

function resizeSignatureCanvas(pad) {
  const ratio = window.devicePixelRatio || 1;
  const rect = pad.canvas.getBoundingClientRect();
  const width = Math.max(rect.width || CONFIG.SIGNATURE_SETTINGS.width, 1);
  const height = Math.max(rect.height || CONFIG.SIGNATURE_SETTINGS.height, 1);
  const existingData = pad.hasSignature ? pad.canvas.toDataURL('image/png') : '';

  pad.canvas.width = Math.floor(width * ratio);
  pad.canvas.height = Math.floor(height * ratio);
  pad.context.setTransform(1, 0, 0, 1, 0, 0);
  pad.context.scale(ratio, ratio);
  configureSignatureContext(pad);
  clearSignature(pad.canvasId, false);

  if (existingData) {
    const image = new Image();
    image.onload = function() {
      pad.context.drawImage(image, 0, 0, width, height);
      pad.hasSignature = true;
    };
    image.src = existingData;
  }
}

function bindSignatureEvents(pad) {
  if (pad.canvas.dataset.signatureBound === 'true') {
    return;
  }

  pad.canvas.addEventListener('pointerdown', function(event) {
    startDrawing(pad, event);
  });

  pad.canvas.addEventListener('pointermove', function(event) {
    draw(pad, event);
  });

  pad.canvas.addEventListener('pointerup', function() {
    stopDrawing(pad);
  });

  pad.canvas.addEventListener('pointerleave', function() {
    stopDrawing(pad);
  });

  pad.canvas.addEventListener('pointercancel', function() {
    stopDrawing(pad);
  });

  pad.canvas.dataset.signatureBound = 'true';
}

function bindClearButton(pad, clearButtonId) {
  const buttonId = clearButtonId || pad.clearButtonId;
  const button = document.getElementById(buttonId);
  if (!button || button.dataset.signatureClearBound === 'true') {
    return;
  }

  button.addEventListener('click', function() {
    clearSignature(pad.canvasId);
  });
  button.dataset.signatureClearBound = 'true';
}

function startDrawing(pad, event) {
  event.preventDefault();
  pad.isDrawing = true;
  const point = getPointerPosition(pad.canvas, event);
  pad.lastPoint = point;
  pad.context.beginPath();
  pad.context.moveTo(point.x, point.y);
}

function draw(pad, event) {
  if (!pad.isDrawing) return;

  event.preventDefault();
  const point = getPointerPosition(pad.canvas, event);
  pad.context.lineTo(point.x, point.y);
  pad.context.stroke();
  pad.lastPoint = point;
  pad.hasSignature = true;
}

function stopDrawing(pad) {
  if (!pad.isDrawing) return;
  pad.isDrawing = false;
  pad.lastPoint = null;
  pad.context.closePath();
}

function getPointerPosition(canvas, event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top
  };
}

function clearSignature(canvasId, shouldResetState) {
  const pad = signaturePads[canvasId || 'loanSignatureCanvas'];
  if (!pad) return;

  const resetState = shouldResetState !== false;
  pad.context.clearRect(0, 0, pad.canvas.width, pad.canvas.height);

  if (resetState) {
    pad.hasSignature = false;
  }
}

function getSignatureData(canvasId) {
  const pad = signaturePads[canvasId || 'loanSignatureCanvas'];
  if (!pad || !pad.hasSignature) {
    return '';
  }

  return pad.canvas.toDataURL('image/png');
}

function isSignatureEmpty(canvasId) {
  const pad = signaturePads[canvasId || 'loanSignatureCanvas'];
  if (!pad) {
    return true;
  }

  return !pad.hasSignature;
}

window.initializeSignaturePad = initializeSignaturePad;
window.clearSignature = clearSignature;
window.getSignatureData = getSignatureData;
window.isSignatureEmpty = isSignatureEmpty;
