const QR_BASE = "https://api.qrserver.com/v1/create-qr-code/?size=512x512&data=";

export const DEFAULT_UPI_QR_URL = `${QR_BASE}upi%3A%2F%2Fpay`;

export const buildUpiQrUrl = (upiId, payeeName = "Seller") => {
  const normalizedUpi = String(upiId || "").trim();
  if (!normalizedUpi) return DEFAULT_UPI_QR_URL;
  const uri = `upi://pay?pa=${normalizedUpi}&pn=${payeeName || "Seller"}&cu=INR`;
  return `${QR_BASE}${encodeURIComponent(uri)}`;
};
