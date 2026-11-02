import assert from "node:assert/strict";
import test from "node:test";
import {
  canConfirmCompanyProfileDeletion,
  confirmCompanyProfileDeletion,
} from "../src/utils/companyProfileDeletion.js";

const valid = {
  profileId: "existing-company-profile",
  mobile: "+91 9876543210",
  confirmation: "9876543210",
};

test("a stored company profile and a matching registered number are required", () => {
  assert.equal(canConfirmCompanyProfileDeletion(valid), true);
  for (const invalid of [
    { profileId: "" }, { profileId: " " }, { profileId: null },
    { mobile: "" }, { mobile: "12345" },
    { confirmation: "" }, { confirmation: "1234567890" },
  ]) {
    assert.equal(canConfirmCompanyProfileDeletion({ ...valid, ...invalid }), false);
  }
});

test("an unconfirmed deletion never invokes the existing delete operation", async () => {
  let calls = 0;
  for (const invalid of [{ confirmation: "" }, { confirmation: "1234567890" }, { profileId: "" }]) {
    await assert.rejects(confirmCompanyProfileDeletion({
      ...valid,
      ...invalid,
      deleteProfile: async () => { calls += 1; },
    }), /registered mobile number/);
  }
  assert.equal(calls, 0);
});

test("a confirmed action deletes exactly the existing company profile once", async () => {
  const deletedIds = [];
  await confirmCompanyProfileDeletion({
    ...valid,
    deleteProfile: async (id) => { deletedIds.push(id); },
  });
  assert.deepEqual(deletedIds, [valid.profileId]);
});

test("the action waits for completion and propagates a failed deletion", async () => {
  const failure = new Error("deletion unavailable");
  await assert.rejects(confirmCompanyProfileDeletion({
    ...valid,
    deleteProfile: async () => { throw failure; },
  }), (error) => error === failure);
});
