// Small pure helpers for drawing the owner's dashboard (web now, phone later).

const MIN_VISIBLE = 4; // a non-zero day must not vanish as a 0-pixel bar

/** Heights (0 to 100) for a bar chart: the largest value is 100, the others proportional. */
export const barHeights = (values) => {
  const max = Math.max(0, ...values);
  if (max === 0) return values.map(() => 0);
  return values.map((v) => (v === 0 ? 0 : Math.max(MIN_VISIBLE, Math.round((v / max) * 100))));
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-10-10" -> "10 Oct". Done by hand (no Date) so the day never shifts with the viewer's time zone. */
export const shortDayLabel = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return iso;
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]}`;
};
