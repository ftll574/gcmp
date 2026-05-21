/**
 * Group colors. Defined as a non-React module so React Fast Refresh
 * doesn't lose component identity when colors change. Each group gets
 * a color from this rotation; index modulo length.
 */

export const GROUP_COLORS: ReadonlyArray<string> = [
  '#0D5C73', // accent (teal)
  '#C97A3F', // warning (amber)
  '#5C8C5A', // moss green
  '#8E5A87', // muted plum
  '#7A5C24', // bronze
  '#365D78', // steel blue
];

export function groupColor(idx: number): string {
  return GROUP_COLORS[idx % GROUP_COLORS.length] ?? '#0D5C73';
}
