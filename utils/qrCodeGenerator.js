import QRCode from 'qrcode';
import crypto from 'crypto';

/**
 * Generate QR code pass for leave/visit requests
 * @param {Object} requestData - Request data (LeaveRequest or VisitRequest)
 * @param {String} requestType - 'leave' or 'visit'
 * @returns {Object} QR code data and image
 */
export async function generateQRPass(requestData, requestType) {
  try {
    // Generate unique pass token
    const passToken = crypto.randomBytes(32).toString('hex');
    
    // Calculate validity period
    const now = new Date();
    let validUntil;
    
    if (requestType === 'leave') {
      // Valid until end date + 1 day buffer
      validUntil = new Date(requestData.endDate);
      validUntil.setDate(validUntil.getDate() + 1);
      validUntil.setHours(23, 59, 59, 999);
    } else if (requestType === 'visit') {
      // Valid until approved end time + 2 hours buffer
      const approvedDate = requestData.approvedDate || requestData.preferredDate;
      const endTime = requestData.approvedEndTime || requestData.preferredEndTime;
      validUntil = new Date(approvedDate);
      const [hours, minutes] = endTime.split(':').map(Number);
      validUntil.setHours(hours + 2, minutes, 0, 0); // 2 hours buffer after visit end
    }
    
    // Create QR data payload
    const qrPayload = {
      requestId: requestData.requestId,
      type: requestType,
      token: passToken,
      studentId: requestData.student?._id?.toString() || requestData.student?.toString(),
      parentId: requestData.requestedBy?._id?.toString() || requestData.requestedBy?.toString(),
      validUntil: validUntil.toISOString(),
      timestamp: now.toISOString()
    };
    
    // Encode payload as JSON string
    const qrDataString = JSON.stringify(qrPayload);
    
    // Generate QR code as base64 data URL
    const qrCodeDataURL = await QRCode.toDataURL(qrDataString, {
      errorCorrectionLevel: 'M',
      type: 'image/png',
      quality: 0.92,
      margin: 1,
      width: 300
    });
    
    return {
      qrCode: qrCodeDataURL,
      qrData: qrDataString,
      passToken,
      generatedAt: now,
      validUntil
    };
  } catch (error) {
    console.error('Error generating QR pass:', error);
    throw new Error('Failed to generate QR pass');
  }
}

/**
 * Verify QR code pass
 * @param {String} qrDataString - QR data string from scanned code
 * @returns {Object} Verification result
 */
export function verifyQRPass(qrDataString) {
  try {
    const payload = JSON.parse(qrDataString);
    const now = new Date();
    const validUntil = new Date(payload.validUntil);
    
    // Check if expired
    if (now > validUntil) {
      return {
        valid: false,
        error: 'QR pass has expired',
        payload: null
      };
    }
    
    return {
      valid: true,
      payload,
      error: null
    };
  } catch (error) {
    return {
      valid: false,
      error: 'Invalid QR code format',
      payload: null
    };
  }
}
