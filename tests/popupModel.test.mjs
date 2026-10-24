import test from 'node:test';
import assert from 'node:assert/strict';
import { popupPreview, popupIsEligible, eligiblePopupQueue, isNewSubtypeDate, POPUP_PAGES } from '../src/utils/popupModel.js';
import { markPopupSeen, seenPopups } from '../src/utils/popupFeedClient.js';

const template = {
  id: 'template-announcement', kind: 'template', companyId: 'company-a',
  imageUrl: 'https://cdn.mlmposter.com/unrelated-showcase.webp',
  template: { id: 'template-a', MainType: 'MLM', SelectType: 'Meeting', Subtype: 'New Meeting',
    GraphicsLink: [{ suggestionImage: 'https://cdn.mlmposter.com/first-preview.webp', url: 'https://cdn.mlmposter.com/first.webp' }, { url: 'https://cdn.mlmposter.com/second.webp' }] },
};
test('new-template popup derives its image from the first GraphicsLink', () => {
  assert.equal(popupPreview(template), 'https://cdn.mlmposter.com/first-preview.webp');
  const noSuggestion = structuredClone(template); delete noSuggestion.template.GraphicsLink[0].suggestionImage;
  assert.equal(popupPreview(noSuggestion), 'https://cdn.mlmposter.com/first.webp');
  noSuggestion.template.GraphicsLink[0] = {};
  assert.equal(popupPreview(noSuggestion), '');
  assert.equal(popupIsEligible(noSuggestion, 'company-a'), false);
});
test('template announcements are company scoped and retain their selected template', () => {
  const feed = { items: [template] };
  assert.equal(eligiblePopupQueue(feed, 'company-b', new Set()).length, 0);
  const result = eligiblePopupQueue(feed, 'company-a', new Set());
  assert.equal(result[0].template, template.template);
  assert.equal(result[0].template.GraphicsLink.length, 2);
  assert.equal(popupIsEligible({ ...template, imageUrl: '' }, 'company-a'), true);
});
test('general popups accept supported app destinations and reject external redirects', () => {
  for (const page of POPUP_PAGES) assert.equal(popupIsEligible({ id:'general', kind:'general', imageUrl:'https://cdn.mlmposter.com/offer.webp', destination:page.value }, ''), true);
  for (const destination of ['https://example.com', '//example.com', 'javascript:alert(1)', '/missing-page']) assert.equal(popupIsEligible({ id:'general', kind:'general', imageUrl:'https://cdn.mlmposter.com/offer.webp', destination }, ''), false);
});
test('schedule and priority are applied before showing a popup', () => {
  const now = Date.parse('2026-10-24T00:00:00Z');
  const base = { id:'normal', kind:'general', imageUrl:'https://cdn.mlmposter.com/a.webp', destination:'/' };
  const feed = { items:[base, { ...base, id:'future', startsAt:'2026-10-25T00:00:00Z' }, { ...base, id:'ended', endsAt:'2026-10-24T00:00:00Z' }, { ...base, id:'priority', priority:10 }] };
  assert.deepEqual(eligiblePopupQueue(feed, '', new Set(), now).map(row=>row.id), ['priority','normal']);
});
test('the New Added badge expires at exactly seven days and never guesses missing dates', () => {
  const now = Date.parse('2026-10-24T00:00:00Z'), week = 7 * 86400000;
  assert.equal(isNewSubtypeDate(new Date(now-week+1).toISOString(), now), true);
  assert.equal(isNewSubtypeDate(now-week, now), false);
  assert.equal(isNewSubtypeDate(now+1, now), false);
  for (const value of [null, undefined, '', 'invalid']) assert.equal(isNewSubtypeDate(value, now), false);
});
test('editing an acknowledged popup does not show it again; a new ID can show', () => {
  const data = new Map();
  const storage = { getItem:key=>data.get(key)||null, setItem:(key,value)=>data.set(key,value) };
  markPopupSeen('stable-user', template.id, storage);
  assert.equal(eligiblePopupQueue({ items:[{...template,version:999}] }, 'company-a', seenPopups('stable-user',storage)).length, 0);
  assert.equal(eligiblePopupQueue({ items:[{...template,id:'new-campaign'}] }, 'company-a', seenPopups('stable-user',storage)).length, 1);
});
