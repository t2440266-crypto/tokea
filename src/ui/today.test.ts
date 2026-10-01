import { describe, expect, test } from 'vitest';
import { FINE_TAUNT, PAY_CONFIRM_COPY } from './today';

describe('fine payment copy [spec 0004]', () => {
  test('confirm copy matches the dictated text exactly [covers AC-1]', () => {
    expect(PAY_CONFIRM_COPY).toBe(
      "It looks like you want to pay the fine you penalized for missing this previous activity from the previous cycle, press 'Pay fine and start the time-count to pay this specific exact activity only",
    );
  });

  test('taunt carries the required lines [covers AC-6]', () => {
    expect(FINE_TAUNT).toContain('That is your dumb foolish fault');
    expect(FINE_TAUNT).toContain('I will not have sympathy or mercy');
    expect(FINE_TAUNT).toContain('+25 minutes for every daily activity');
  });
});
