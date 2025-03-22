/**
 * Parse size strings like "10MB" into bytes
 * Supports KB, MB, and GB units. If no unit is specified, assumes bytes.
 *
 * @param size - Size as number (bytes) or string with units (e.g., "5MB")
 * @returns Size in bytes
 */
export function parseSize(size: string | number): number {
  if (typeof size === "number") return size;

  const match = size.match(/^(\d+(?:\.\d+)?)\s*(KB|MB|GB)?$/i);
  if (!match) return 0;

  const num = parseFloat(match[1]);
  const unit = match[2]?.toUpperCase();

  switch (unit) {
    case "KB":
      return num * 1024;
    case "MB":
      return num * 1024 * 1024;
    case "GB":
      return num * 1024 * 1024 * 1024;
    default:
      return num;
  }
}
