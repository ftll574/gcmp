/**
 * Convert an inline `<svg>` element to a PNG Blob via a hidden `<canvas>`.
 * Used by the "Download map" action to produce a screenshot of the
 * current map view (with all groups, arcs, airports, and continent
 * outlines rendered).
 *
 * Strategy:
 *   1. Inline computed styles into the SVG (so external CSS gets baked in).
 *   2. Serialize SVG to a string.
 *   3. Encode as a Data URL.
 *   4. Load into an Image.
 *   5. Draw onto a Canvas at desired pixel ratio.
 *   6. canvas.toBlob('image/png').
 */

const STYLE_PROPS = [
  'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin',
  'stroke-dasharray', 'opacity', 'fill-opacity', 'stroke-opacity',
  'font-family', 'font-size', 'font-weight',
] as const;

function inlineStyles(node: Element): void {
  if (node instanceof SVGElement || node instanceof HTMLElement) {
    const computed = window.getComputedStyle(node);
    for (const prop of STYLE_PROPS) {
      const value = computed.getPropertyValue(prop);
      if (value && value !== 'none' && value !== 'normal') {
        node.style.setProperty(prop, value);
      }
    }
  }
  for (const child of Array.from(node.children)) {
    inlineStyles(child);
  }
}

/**
 * Capture the given SVG element as a PNG Blob.
 *
 * @param svg the in-DOM `<svg>` to capture
 * @param pixelRatio render scale (default 2 for retina quality)
 * @returns Blob ready for `URL.createObjectURL` / download
 */
export async function svgToPngBlob(
  svg: SVGSVGElement,
  pixelRatio: number = 2,
): Promise<Blob> {
  // Clone so we don't mutate the live SVG.
  const cloned = svg.cloneNode(true) as SVGSVGElement;
  // Bake styles in.
  inlineStyles(svg);
  inlineStyles(cloned);

  const rect = svg.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  cloned.setAttribute('width', String(width));
  cloned.setAttribute('height', String(height));
  cloned.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

  const serialized = new XMLSerializer().serializeToString(cloned);
  const svgBlob = new Blob([serialized], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  try {
    const img = await loadImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = width * pixelRatio;
    canvas.height = height * pixelRatio;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get 2D canvas context');
    ctx.scale(pixelRatio, pixelRatio);
    // Fill with page background so transparent areas don't show through.
    ctx.fillStyle = getCssVar('--bg-page') || '#F4EFE6';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('canvas.toBlob returned null'));
      }, 'image/png');
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}

function getCssVar(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || null;
}

/** Triggers a browser download of the given blob. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
