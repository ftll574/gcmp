export interface MapPoint {
  readonly id: string;
  readonly x: number;
  readonly y: number;
}

export interface MapViewport {
  readonly width: number;
  readonly height: number;
}

export interface MapPadding {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export interface MapPanZoom {
  readonly scale: number;
  readonly tx: number;
  readonly ty: number;
}

export interface MapCluster<T extends MapPoint> {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly items: ReadonlyArray<T>;
}

export type MapLabelAnchor = 'ne' | 'se' | 'nw' | 'sw' | 'e' | 'w' | 'n' | 's';

export interface MapLabelRequest extends MapPoint {
  readonly width: number;
  readonly height: number;
}

export interface MapLabelPlacement {
  readonly id: string;
  readonly anchor: MapLabelAnchor;
  readonly dx: number;
  readonly dy: number;
  readonly box: {
    readonly left: number;
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
  };
}

const DEFAULT_PADDING: MapPadding = { top: 64, right: 48, bottom: 48, left: 48 };

function normalizeTranslate(value: number, period: number): number {
  if (!Number.isFinite(period) || period <= 0) return value;
  const half = period / 2;
  return ((value + half) % period + period) % period - half;
}

function unwrapX(points: ReadonlyArray<MapPoint>, wrapWidth: number | undefined): MapPoint[] {
  if (!wrapWidth || wrapWidth <= 0 || points.length < 2) return points.map((point) => ({ ...point }));
  const out: MapPoint[] = [{ ...points[0]! }];
  for (let index = 1; index < points.length; index += 1) {
    const point = points[index]!;
    const previous = out[index - 1]!;
    const turns = Math.round((previous.x - point.x) / wrapWidth);
    out.push({ ...point, x: point.x + turns * wrapWidth });
  }
  return out;
}

/** Fit two or more projected points inside a viewport without changing the projection itself. */
export function fitProjectedPoints(
  points: ReadonlyArray<MapPoint>,
  viewport: MapViewport,
  options: {
    readonly padding?: Partial<MapPadding>;
    readonly minScale?: number;
    readonly maxScale?: number;
    readonly wrapWidth?: number;
  } = {},
): MapPanZoom | null {
  const valid = points.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  if (valid.length < 2 || viewport.width <= 0 || viewport.height <= 0) return null;

  const padding = { ...DEFAULT_PADDING, ...options.padding };
  const unwrapped = unwrapX(valid, options.wrapWidth);
  const xs = unwrapped.map((point) => point.x);
  const ys = unwrapped.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = Math.max(1, maxX - minX);
  const spanY = Math.max(1, maxY - minY);
  const usableWidth = Math.max(1, viewport.width - padding.left - padding.right);
  const usableHeight = Math.max(1, viewport.height - padding.top - padding.bottom);
  const minScale = options.minScale ?? 0.75;
  const maxScale = options.maxScale ?? 4.5;
  const scale = Math.max(minScale, Math.min(maxScale, usableWidth / spanX, usableHeight / spanY));
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const targetCenterX = padding.left + usableWidth / 2;
  const targetCenterY = padding.top + usableHeight / 2;
  let tx = targetCenterX - centerX * scale;
  const ty = targetCenterY - centerY * scale;
  if (options.wrapWidth) tx = normalizeTranslate(tx, options.wrapWidth * scale);
  return { scale, tx, ty };
}

/** Connected-component clustering in screen space. Inputs are small (route-map destinations), so O(n²) is intentional. */
export function clusterMapPoints<T extends MapPoint>(
  points: ReadonlyArray<T>,
  radius: number,
): ReadonlyArray<MapCluster<T>> {
  if (points.length === 0) return [];
  if (radius <= 0) return points.map((point) => ({ id: point.id, x: point.x, y: point.y, items: [point] }));
  const sorted = [...points].sort((a, b) => a.id.localeCompare(b.id));
  const visited = new Set<string>();
  const radiusSq = radius * radius;
  const clusters: MapCluster<T>[] = [];

  for (const seed of sorted) {
    if (visited.has(seed.id)) continue;
    const queue = [seed];
    const items: T[] = [];
    visited.add(seed.id);
    while (queue.length > 0) {
      const current = queue.shift()!;
      items.push(current);
      for (const candidate of sorted) {
        if (visited.has(candidate.id)) continue;
        const dx = current.x - candidate.x;
        const dy = current.y - candidate.y;
        if (dx * dx + dy * dy <= radiusSq) {
          visited.add(candidate.id);
          queue.push(candidate);
        }
      }
    }
    const x = items.reduce((sum, point) => sum + point.x, 0) / items.length;
    const y = items.reduce((sum, point) => sum + point.y, 0) / items.length;
    clusters.push({ id: items.map((point) => point.id).sort().join('|'), x, y, items });
  }
  return clusters;
}

function overlapArea(a: MapLabelPlacement['box'], b: MapLabelPlacement['box']): number {
  const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return width * height;
}

function overflowArea(box: MapLabelPlacement['box'], viewport: MapViewport, padding: number): number {
  const left = Math.max(0, padding - box.left);
  const right = Math.max(0, box.right - (viewport.width - padding));
  const top = Math.max(0, padding - box.top);
  const bottom = Math.max(0, box.bottom - (viewport.height - padding));
  return (left + right) * Math.max(1, box.bottom - box.top) +
    (top + bottom) * Math.max(1, box.right - box.left);
}

function candidateOffset(anchor: MapLabelAnchor, width: number, height: number, gap: number): { dx: number; dy: number } {
  switch (anchor) {
    case 'ne': return { dx: gap, dy: -height - gap };
    case 'se': return { dx: gap, dy: gap };
    case 'nw': return { dx: -width - gap, dy: -height - gap };
    case 'sw': return { dx: -width - gap, dy: gap };
    case 'e': return { dx: gap, dy: -height / 2 };
    case 'w': return { dx: -width - gap, dy: -height / 2 };
    case 'n': return { dx: -width / 2, dy: -height - gap };
    case 's': return { dx: -width / 2, dy: gap };
  }
}

/** Greedy label placement with viewport and previously placed-label collision scoring. */
export function layoutMapLabels(
  labels: ReadonlyArray<MapLabelRequest>,
  viewport: MapViewport,
  options: { readonly gap?: number; readonly viewportPadding?: number } = {},
): ReadonlyMap<string, MapLabelPlacement> {
  const gap = options.gap ?? 8;
  const viewportPadding = options.viewportPadding ?? 6;
  const anchors: ReadonlyArray<MapLabelAnchor> = ['ne', 'se', 'nw', 'sw', 'e', 'w', 'n', 's'];
  const placed: MapLabelPlacement[] = [];
  const output = new Map<string, MapLabelPlacement>();

  for (const label of labels) {
    let best: { placement: MapLabelPlacement; score: number } | null = null;
    for (let preference = 0; preference < anchors.length; preference += 1) {
      const anchor = anchors[preference]!;
      const { dx, dy } = candidateOffset(anchor, label.width, label.height, gap);
      const box = {
        left: label.x + dx,
        top: label.y + dy,
        right: label.x + dx + label.width,
        bottom: label.y + dy + label.height,
      };
      const overlap = placed.reduce((sum, previous) => sum + overlapArea(box, previous.box), 0);
      const overflow = overflowArea(box, viewport, viewportPadding);
      const score = overflow * 1000 + overlap * 20 + preference;
      const placement = { id: label.id, anchor, dx, dy, box } as const;
      if (best === null || score < best.score) best = { placement, score };
    }
    if (best) {
      placed.push(best.placement);
      output.set(label.id, best.placement);
    }
  }
  return output;
}
