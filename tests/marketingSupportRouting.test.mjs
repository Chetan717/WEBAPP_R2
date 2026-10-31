import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
import {
  SUPPORT_COUPON_STORAGE_KEY,
  getSupportMobile,
  getSupportWhatsAppUrl,
  readSupportCoupon,
  saveSupportCoupon,
} from "../src/utils/marketingSupport.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

let moduleVersion = 0;
async function freshAuthStorage(uid = "user-a", storage = memoryStorage()) {
  globalThis.localStorage = storage;
  globalThis.sessionStorage = memoryStorage();
  globalThis.window = new EventTarget();
  globalThis.__MLMLIVE_SUPPORT_TEST_AUTH__ = { currentUser: uid ? { uid } : null };
  const hooks = registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier === "@firebase-config") {
        return {
          url: "data:text/javascript,export const auth = globalThis.__MLMLIVE_SUPPORT_TEST_AUTH__;",
          shortCircuit: true,
        };
      }
      if (specifier.startsWith("firebase/") || /^https?:/.test(specifier)) {
        throw new Error(`Support routing must not load a network client: ${specifier}`);
      }
      return nextResolve(specifier, context);
    },
  });
  try {
    return await import(`../src/utils/authStorage.js?test=${++moduleVersion}`);
  } finally {
    hooks.deregister();
  }
}

test("all seven supplied coupons select their team's WhatsApp number", () => {
  const expected = [
    ["MLM909", "9304638203"],
    ["MLM100", "9341947815"],
    ["RAM200", "9876516549"],
    ["WELCOM", "7058838221"],
    ["MLM300", "7808030050"],
    ["MLM400", "8657173938"],
    ["MLM200", "8409353081"],
  ];
  for (const [code, mobile] of expected) {
    assert.equal(getSupportMobile(code), mobile);
    assert.equal(getSupportWhatsAppUrl({ mteamCouponCode: code }), `https://wa.me/91${mobile}`);
  }
  assert.equal(getSupportMobile("  mlm909  "), "9304638203");
});

test("missing, invalid and unmatched coupons always use MLM100", () => {
  for (const code of [undefined, null, "", "NEW123", "__proto__", 100, {}, []]) {
    assert.equal(getSupportMobile(code), "9341947815");
  }
  assert.equal(getSupportWhatsAppUrl(null), "https://wa.me/919341947815");
  assert.equal(getSupportWhatsAppUrl({ coupon_code: "MLM909" }), "https://wa.me/919341947815");
});

test("existing login user data survives a fresh app session without a network call", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", () => {
    throw new Error("Unexpected fetch while caching/routing support");
  });
  const storage = memoryStorage();
  const firstSession = await freshAuthStorage("user-a", storage);
  const supportUpdates = [];
  window.addEventListener(firstSession.VERIFIED_USER_CHANGED_EVENT, () => {
    supportUpdates.push(getSupportWhatsAppUrl(firstSession.getUser()));
  });
  firstSession.setUser({ name: "Example User", mobileNo: "9000000000", mteamCouponCode: " mlm909 " });
  assert.equal(firstSession.getUser().mteamCouponCode, "MLM909");
  assert.deepEqual(supportUpdates, ["https://wa.me/919304638203"]);
  assert.deepEqual(JSON.parse(storage.getItem(SUPPORT_COUPON_STORAGE_KEY)), {
    uid: "user-a", mteamCouponCode: "MLM909",
  });
  assert.equal(storage.getItem("usermlm"), null);

  // New authStorage module = a closed/reopened app with no in-memory user.
  const reopenedSession = await freshAuthStorage("user-a", storage);
  assert.equal(reopenedSession.getUser(), null);
  reopenedSession.setVerifiedUser({ uid: "user-a", mobileNo: "9000000000" });
  assert.equal(getSupportWhatsAppUrl(reopenedSession.getUser()), "https://wa.me/919304638203");

  // Firebase token refresh carries identity only; retain the coupon already received.
  reopenedSession.setVerifiedUser({ uid: "user-a", role: "user" });
  assert.equal(reopenedSession.getUser().mteamCouponCode, "MLM909");
  assert.equal(fetch.mock.callCount(), 0);
});

test("another account cannot inherit a cached support coupon or acquire a session from it", async () => {
  const storage = memoryStorage();
  globalThis.localStorage = storage;
  saveSupportCoupon("user-a", "MLM400");
  const accountB = await freshAuthStorage("user-b", storage);
  assert.equal(accountB.getUser(), null);
  accountB.setVerifiedUser({ uid: "user-b" });
  assert.equal(getSupportWhatsAppUrl(accountB.getUser()), "https://wa.me/919341947815");
  globalThis.__MLMLIVE_SUPPORT_TEST_AUTH__.currentUser = null;
  assert.equal(accountB.getUser(), null);
});

test("updated attribution replaces the coupon and explicit removal returns to default", async () => {
  const session = await freshAuthStorage();
  session.setUser({ mteamCouponCode: "MLM300" });
  session.setUser({ mteamCouponCode: "WELCOM" });
  assert.equal(getSupportWhatsAppUrl(session.getUser()), "https://wa.me/917058838221");
  session.setUser({ mteamCouponCode: null });
  assert.equal(getSupportWhatsAppUrl(session.getUser()), "https://wa.me/919341947815");
  assert.equal(readSupportCoupon("user-a"), "");
});

test("logout, invalid sessions and cached-data cleanup remove support attribution", async () => {
  const session = await freshAuthStorage();
  for (const cleanup of [
    () => session.removeUser(),
    () => session.setVerifiedUser(null),
    () => session.clearCachedPii(),
  ]) {
    session.setUser({ mteamCouponCode: "RAM200" });
    assert.ok(localStorage.getItem(SUPPORT_COUPON_STORAGE_KEY));
    cleanup();
    assert.equal(localStorage.getItem(SUPPORT_COUPON_STORAGE_KEY), null);
  }
});

test("damaged or blocked storage cannot break login or route to another account", async () => {
  const damaged = memoryStorage();
  damaged.setItem(SUPPORT_COUPON_STORAGE_KEY, "{broken");
  let session = await freshAuthStorage("user-a", damaged);
  session.setVerifiedUser({ uid: "user-a" });
  assert.equal(getSupportWhatsAppUrl(session.getUser()), "https://wa.me/919341947815");

  const blocked = {
    getItem() { throw new Error("Storage blocked"); },
    setItem() { throw new Error("Storage full"); },
    removeItem() { throw new Error("Storage blocked"); },
  };
  session = await freshAuthStorage("user-a", blocked);
  session.setUser({ mteamCouponCode: "MLM200" });
  assert.equal(getSupportWhatsAppUrl(session.getUser()), "https://wa.me/918409353081");
  session.setVerifiedUser({ uid: "user-a" });
  assert.equal(getSupportWhatsAppUrl(session.getUser()), "https://wa.me/918409353081");
  assert.doesNotThrow(() => session.removeUser());
});
