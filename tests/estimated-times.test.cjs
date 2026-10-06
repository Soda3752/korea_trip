'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const itinerary = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/itinerary.json'), 'utf8'));
const minutes = time => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
const validTime = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const confirmed = new Map([
  ['1:0', '14:40'], ['1:1', '17:10'], ['1:2', '20:00'],
  ['5:1', '13:05'], ['5:2', '16:10'],
]);

test('all 25 ordered KST stops distinguish 20 estimates from five unchanged source times', () => {
  assert.equal(itinerary.meta.timezone, '+09:00');
  assert.deepEqual(itinerary.days.map(day => day.items.length), [4, 6, 5, 7, 3]);
  let estimates = 0;
  let sourceTimes = 0;
  for (const day of itinerary.days) {
    let previous = -1;
    day.items.forEach((item, index) => {
      assert.equal(item.type, 'spot');
      assert.match(item.time ?? '', validTime, `D${day.day} ${item.name}`);
      assert.ok(minutes(item.time) >= previous, `D${day.day} times cannot go backwards`);
      previous = minutes(item.time);
      const source = confirmed.get(`${day.day}:${index}`);
      if (source) {
        assert.equal(item.time, source);
        assert.notEqual(item.timeEstimated, true, 'source times must not be estimates');
        sourceTimes++;
      } else {
        assert.equal(item.timeEstimated, true, `${item.name} must explicitly be estimated`);
        estimates++;
      }
    });
  }
  assert.equal(estimates, 20);
  assert.equal(sourceTimes, 5);
});

test('daily meal anchors stay tentative and never invent meals marked XXX', () => {
  for (const day of itinerary.days) {
    assert.match(day.tips, /時間僅供參考/);
    assert.match(day.tips, /預估.*非領隊確認/);
    assert.match(day.tips, /餐食時間.*預估/);
    assert.match(day.tips, /非.*訂位/);
    assert.deepEqual(Object.keys(day.mealTimes).sort(), ['breakfast', 'dinner', 'lunch']);
    for (const meal of ['breakfast', 'lunch', 'dinner']) {
      if (/XXX/.test(day.meals[meal])) assert.equal(day.mealTimes[meal], null);
      else assert.match(day.mealTimes[meal], validTime);
    }
  }
  for (const day of itinerary.days.slice(1, 4)) {
    const lunch = minutes(day.mealTimes.lunch);
    assert.ok(lunch >= 720 && lunch <= 780, `D${day.day} lunch must anchor noon`);
    assert.match(day.tips, /午餐.*12:00.*13:00/);
  }
});

test('travel planning leaves non-overlapping long-drive windows and protects the return flight', () => {
  const [d1, d2, d3, d4, d5] = itinerary.days;
  assert.ok(minutes(d1.items[3].time) >= 1260);
  assert.match(d1.items[3].timeNote ?? '', /入境.*行李.*接駁/);
  // D2: lunch for 60 minutes, then at least three hours Songdo -> Songnisan.
  assert.ok(minutes(d2.items[2].time) - (minutes(d2.mealTimes.lunch) + 60) >= 180);
  // Temple visit for 45 minutes, then at least two hours to the Danyang dinner.
  assert.ok(minutes(d2.mealTimes.dinner) - (minutes(d2.items[4].time) + 45) >= 120);
  assert.ok(minutes(d2.items[5].time) >= minutes(d2.mealTimes.dinner) + 60);
  // D3: lunch and local transfer before cafe; 45 minutes there, then three hours to Seoul.
  assert.ok(minutes(d3.items[2].time) >= minutes(d3.mealTimes.lunch) + 75);
  assert.ok(minutes(d3.items[3].time) - (minutes(d3.items[2].time) + 45) >= 180);
  assert.ok(minutes(d3.items[4].time) >= minutes(d3.mealTimes.dinner) + 150);
  for (const day of [d2, d3]) {
    assert.match(day.tips, /長途/);
    assert.match(day.tips, /緊湊.*調整/);
    assert.match(day.planningNotes, /未.*路線API.*驗證/);
  }
  assert.match(d4.tips, /安山.*首爾.*返回安山/);
  assert.match(d4.items[3].timeNote ?? '', /非.*場次.*預約/);
  assert.ok(minutes(d5.items[0].time) >= 510 && minutes(d5.items[0].time) <= 570);
  const airportTarget = minutes(d5.items[1].time) - 150;
  assert.equal(airportTarget, minutes('10:35'));
  assert.ok(minutes(d5.items[0].time) + 45 + 50 <= airportTarget);
  assert.match(d5.tips, /10:35.*2\.5小時/);
  assert.match(d5.tips, /非.*確認.*集合/);
  assert.match(d5.tips, /縮短.*調整/);
  // Unnamed places remain unconfirmed, rather than attaching a guessed branch.
  for (const [dayIndex, itemIndexes] of [[1, [3]], [2, [2]], [3, [1, 2, 3, 4]]]) {
    for (const index of itemIndexes) assert.equal(itinerary.days[dayIndex].items[index].map, null);
  }
});
