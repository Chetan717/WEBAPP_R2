export const DOWNLOAD_SUCCESS_EVENT = "mlmlive:download-success";
export const HOME_CELEBRATION_EVENT = "mlmlive:diwali-welcome";
export const HOME_CELEBRATION_END_EVENT = "mlmlive:diwali-welcome-end";

export function celebrateDownload() {
  window.dispatchEvent(new CustomEvent(DOWNLOAD_SUCCESS_EVENT));
}

export function celebrateDiwaliWelcome() {
  window.dispatchEvent(new CustomEvent(HOME_CELEBRATION_EVENT));
}

export function endDiwaliWelcome() {
  window.dispatchEvent(new CustomEvent(HOME_CELEBRATION_END_EVENT));
}
