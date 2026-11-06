import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { localCalendarDate, reviewTiming } from './review-calendar.ts';

test('invalid review dates never hide a note and snooze expires at its exact instant', () => {
  const now = new Date('2026-11-07T01:00:00Z');
  assert.equal(localCalendarDate(new Date(NaN)), null);
  for (const reviewedAt of [null, undefined, '', 'invalid', '2026-11-07', '2026-11-07T01:00:00']) assert.equal(reviewTiming({ reviewedAt }, now).reviewedToday, false);
  for (const snoozeUntil of ['2026-11-07T01:00:00Z', '2026-11-07T00:59:59Z', 'invalid']) assert.equal(reviewTiming({ snoozeUntil }, now).sleeping, false);
  assert.equal(reviewTiming({ snoozeUntil: '2026-11-07T01:00:01Z' }, now).sleeping, true);
  assert.equal(reviewTiming({ snoozeUntil: '2026-11-07T10:00:01+09:00' }, now).sleeping, true);
});

function checkZone(zone: string, source: string) {
  // Change only this disposable Node child's timezone, never Windows settings.
  const result = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', `import assert from 'node:assert/strict'; import {localCalendarDate,reviewTiming} from ${JSON.stringify(new URL('./review-calendar.ts', import.meta.url).href)}; ${source}`], { env: { ...process.env, TZ: zone }, encoding: 'utf8', timeout: 10000 });
  assert.equal(result.status, 0, `${zone}: ${result.stderr || result.error?.message}`);
}
test('Eastern review stays hidden across UTC midnight and returns at local midnight', () => checkZone('America/New_York', `
  assert.equal(localCalendarDate(new Date('2026-11-07T01:00:00Z')), '2026-11-06');
  const state={reviewedAt:'2026-11-06T23:30:00Z'};
  assert.equal(reviewTiming(state,new Date('2026-11-07T01:00:00Z')).reviewedToday,true);
  assert.equal(reviewTiming(state,new Date('2026-11-07T04:59:59Z')).reviewedToday,true);
  assert.equal(reviewTiming(state,new Date('2026-11-07T05:00:00Z')).reviewedToday,false);
  assert.equal(reviewTiming({reviewedAt:'2026-11-07T08:30:00+09:00'},new Date('2026-11-07T01:00:00Z')).reviewedToday,true);
`));
test('historical local offsets handle both daylight-saving transitions', () => checkZone('America/New_York', `
  assert.equal(reviewTiming({reviewedAt:'2026-11-01T04:30:00Z'},new Date('2026-11-01T08:30:00Z')).reviewedToday,true);
  assert.equal(reviewTiming({reviewedAt:'2026-03-08T04:30:00Z'},new Date('2026-03-08T07:30:00Z')).reviewedToday,false);
  assert.equal(reviewTiming({snoozeUntil:'2026-03-09T06:30:00Z'},new Date('2026-03-09T06:29:59Z')).sleeping,true);
  assert.equal(reviewTiming({snoozeUntil:'2026-03-09T06:30:00Z'},new Date('2026-03-09T06:30:00Z')).sleeping,false);
`));
test('positive offsets use the next local date without resetting at UTC midnight', () => checkZone('Pacific/Auckland', `
  const now=new Date('2026-11-06T12:00:00Z'); assert.equal(localCalendarDate(now),'2026-11-07');
  assert.equal(reviewTiming({reviewedAt:'2026-11-06T10:59:59Z'},now).reviewedToday,false);
  assert.equal(reviewTiming({reviewedAt:'2026-11-06T11:00:00Z'},now).reviewedToday,true);
  assert.equal(reviewTiming({reviewedAt:'2026-11-06T11:30:00Z'},new Date('2026-11-07T00:00:00Z')).reviewedToday,true);
`));
