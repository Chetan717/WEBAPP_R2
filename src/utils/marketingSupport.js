import marketingTeam from "../data/marketingSupportTeam.json" with { type: "json" };

// This cache is only a support-routing preference. Firebase Auth remains the
// sole session authority; no token, PIN or complete user document is stored.
export const SUPPORT_COUPON_STORAGE_KEY = "mlmlive:support-coupon";
export const DEFAULT_SUPPORT_COUPON_CODE = "MLM100";
const defaultSupportMobile = marketingTeam.find(
  (member) => member.coupon_code === DEFAULT_SUPPORT_COUPON_CODE,
).mobile;

export function normalizeSupportCoupon(value) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

export function getSupportMobile(couponCode) {
  const code = normalizeSupportCoupon(couponCode);
  return marketingTeam.find((member) => member.coupon_code === code)?.mobile
    || defaultSupportMobile;
}

export function getSupportWhatsAppUrl(user) {
  return `https://wa.me/91${getSupportMobile(user?.mteamCouponCode)}`;
}

export function readSupportCoupon(uid) {
  if (!uid) return "";
  try {
    const cached = JSON.parse(localStorage.getItem(SUPPORT_COUPON_STORAGE_KEY) || "null");
    return cached?.uid === uid ? normalizeSupportCoupon(cached.mteamCouponCode) : "";
  } catch {
    return "";
  }
}

export function saveSupportCoupon(uid, couponCode) {
  if (!uid) return;
  try {
    localStorage.setItem(SUPPORT_COUPON_STORAGE_KEY, JSON.stringify({
      uid,
      mteamCouponCode: normalizeSupportCoupon(couponCode),
    }));
  } catch {
    // Restricted/low-storage WebViews can still route from the in-memory user.
  }
}

export function clearSupportCoupon() {
  try { localStorage.removeItem(SUPPORT_COUPON_STORAGE_KEY); } catch {}
}
