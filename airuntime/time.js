function now_iso() { return new Date().toISOString().replace('Z', '+00:00'); }
const UNIX_TIMESTAMP_PATTERN = /^\d{10}(?:\.\d+)?$/;
function coerce_iso(value) {
  if (value === null || value === '') return '';
  if (typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString().replace('Z', '+00:00');
  if (typeof value === 'number') {
    if (!isFinite(value)) return String(value);
    const d = new Date(value * 1000);
    return isNaN(d.getTime()) ? String(value) : d.toISOString().replace('Z', '+00:00');
  }
  if (typeof value === 'string') {
    if (UNIX_TIMESTAMP_PATTERN.test(value)) {
      const sec = Number(value);
      if (isNaN(sec)) return value;
      const d = new Date(sec * 1000);
      return isNaN(d.getTime()) ? value : d.toISOString().replace('Z', '+00:00');
    }
    return value;
  }
  return String(value);
}
module.exports = { now_iso, coerce_iso };