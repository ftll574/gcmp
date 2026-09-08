import { describe, expect, test } from 'vitest';
import { clusterMapPoints, fitProjectedPoints, layoutMapLabels } from '../../src/lib/map-layout.ts';

describe('fitProjectedPoints', () => {
  test('fits a route inside the padded viewport', () => {
    const fit = fitProjectedPoints(
      [{ id: 'A', x: 100, y: 100 }, { id: 'B', x: 300, y: 200 }],
      { width: 800, height: 500 },
      { padding: { top: 50, right: 50, bottom: 50, left: 50 }, maxScale: 4 },
    );
    expect(fit).not.toBeNull();
    expect(fit!.scale).toBeGreaterThan(1);
    const xs = [100, 300].map((x) => x * fit!.scale + fit!.tx);
    const ys = [100, 200].map((y) => y * fit!.scale + fit!.ty);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(50);
    expect(Math.max(...xs)).toBeLessThanOrEqual(750);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(50);
    expect(Math.max(...ys)).toBeLessThanOrEqual(450);
  });

  test('unwraps antimeridian-adjacent points before fitting', () => {
    const fit = fitProjectedPoints(
      [{ id: 'west', x: 990, y: 200 }, { id: 'east', x: 10, y: 220 }],
      { width: 800, height: 500 },
      { wrapWidth: 1000, maxScale: 4 },
    );
    expect(fit).not.toBeNull();
    expect(fit!.scale).toBe(4);
  });

  test('does not zoom a single point', () => {
    expect(fitProjectedPoints([{ id: 'TPE', x: 400, y: 250 }], { width: 800, height: 500 })).toBeNull();
  });
});

describe('clusterMapPoints', () => {
  test('groups connected nearby points and leaves distant points alone', () => {
    const clusters = clusterMapPoints([
      { id: 'A', x: 10, y: 10 },
      { id: 'B', x: 18, y: 12 },
      { id: 'C', x: 27, y: 12 },
      { id: 'D', x: 100, y: 100 },
    ], 10);
    expect(clusters).toHaveLength(2);
    expect(clusters[0]!.items.map((point) => point.id)).toEqual(['A', 'B', 'C']);
    expect(clusters[1]!.items.map((point) => point.id)).toEqual(['D']);
  });
});

describe('layoutMapLabels', () => {
  test('chooses non-overlapping placements for dense points', () => {
    const layout = layoutMapLabels([
      { id: 'TPE', x: 200, y: 200, width: 56, height: 20 },
      { id: 'BKK', x: 207, y: 203, width: 56, height: 20 },
      { id: 'HKG', x: 213, y: 205, width: 56, height: 20 },
    ], { width: 420, height: 320 });
    const boxes = [...layout.values()].map((placement) => placement.box);
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i]!;
        const b = boxes[j]!;
        const overlaps = a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
        expect(overlaps).toBe(false);
      }
    }
  });
});
