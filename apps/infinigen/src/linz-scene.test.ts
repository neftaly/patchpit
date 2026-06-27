import { describe, expect, it } from 'vitest';
import { createLinzNzScene } from './linz-scene';
import { parseInfinigenStreamEvent } from './protocol';

describe('LINZ virtual New Zealand scene', () => {
  it('converts mocked public LINZ ArcGIS features into stream events', async () => {
    const events = await createLinzNzScene({
      fetchImpl: async (url) => ({
        json: async () => url.includes('Building_Outlines') ? {
          features: [
            {
              attributes: { OBJECTID: 42 },
              geometry: {
                rings: [[
                  [1757500, 5917500],
                  [1757520, 5917500],
                  [1757520, 5917520],
                  [1757500, 5917520],
                  [1757500, 5917500]
                ]]
              }
            }
          ]
        } : {
          features: [
            {
              attributes: { OBJECTID: 7 },
              geometry: {
                paths: [[
                  [1757400, 5917460],
                  [1757500, 5917500],
                  [1757600, 5917560]
                ]]
              }
            }
          ]
        }
      }),
      quality: 'balanced',
      seed: 'tamaki-test'
    });

    expect(events.some((event) => event.type === 'instance' && event.kind === 'building')).toBe(true);
    expect(events.some((event) => event.type === 'instance' && event.kind === 'road')).toBe(true);
    expect(events.some((event) => event.type === 'status' && event.message.includes('LINZ ArcGIS live sample'))).toBe(true);

    for (const event of events) {
      expect(parseInfinigenStreamEvent(event)).toEqual(event);
    }
  });

  it('keeps a deterministic offline fallback when public feature queries fail', async () => {
    const events = await createLinzNzScene({
      fetchImpl: async () => {
        throw new Error('offline');
      },
      quality: 'balanced',
      seed: 'offline-test'
    });

    const buildingCount = events.filter((event) => event.type === 'instance' && event.kind === 'building').length;
    const roadCount = events.filter((event) => event.type === 'instance' && event.kind === 'road').length;

    expect(buildingCount).toBeGreaterThan(20);
    expect(roadCount).toBeGreaterThan(4);
    expect(events.some((event) => event.type === 'status' && event.message.includes('LINZ offline fallback'))).toBe(true);

    for (const event of events) {
      expect(parseInfinigenStreamEvent(event)).toEqual(event);
    }
  });
});
