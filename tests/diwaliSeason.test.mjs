import assert from "node:assert/strict";
import test from "node:test";
import {
  DIWALI_SEASON_START,
  DIWALI_SEASON_END,
  getDiwaliSeasonState,
} from "../src/utils/diwaliSeason.js";

test("Diwali Home starts and stops at midnight India time", () => {
  assert.equal(getDiwaliSeasonState(DIWALI_SEASON_START - 1).enabled, false);
  assert.equal(getDiwaliSeasonState(DIWALI_SEASON_START).enabled, true);
  assert.equal(getDiwaliSeasonState(DIWALI_SEASON_END - 1).enabled, true);
  assert.equal(getDiwaliSeasonState(DIWALI_SEASON_END).enabled, false);
  assert.equal(getDiwaliSeasonState(Date.parse("2027-11-06T12:00:00+05:30")).enabled, false);
});

test("an open WebView can schedule the next seasonal boundary", () => {
  assert.equal(getDiwaliSeasonState(DIWALI_SEASON_START - 1000).nextTransitionAt, DIWALI_SEASON_START);
  assert.equal(getDiwaliSeasonState(DIWALI_SEASON_START).nextTransitionAt, DIWALI_SEASON_END);
  assert.equal(getDiwaliSeasonState(DIWALI_SEASON_END).nextTransitionAt, null);
});

test("deployment can explicitly enable or disable the seasonal Home", () => {
  assert.deepEqual(getDiwaliSeasonState(DIWALI_SEASON_END, "on"), { enabled: true, nextTransitionAt: null });
  assert.deepEqual(getDiwaliSeasonState(DIWALI_SEASON_START, " OFF "), { enabled: false, nextTransitionAt: null });
  assert.equal(getDiwaliSeasonState(DIWALI_SEASON_START, "false").enabled, false);
  assert.equal(getDiwaliSeasonState(DIWALI_SEASON_END, "true").enabled, true);
});
