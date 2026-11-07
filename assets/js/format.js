/** Formats d'affichage partagés par les vues de l'accueil. */

const MONTH_DAY = new Intl.DateTimeFormat("fr-FR", { month: "long" });

function toDate(dateText) {
  return new Date(`${dateText}T00:00:00`);
}

function dayLabel(date) {
  const day = date.getDate();
  return day === 1 ? "1er" : String(day);
}

/** +9,4‰ ou −0,8‰. */
export function formatPerMille(value, decimals = 1) {
  const text = Math.abs(value).toFixed(decimals).replace(".", ",");
  const sign = value < 0 ? "−" : "+";
  return `${sign}${text}‰`;
}

export function formatFollowers(value) {
  return Math.round(value).toLocaleString("fr-FR");
}

/** 07/11 */
export function formatShortDate(dateText) {
  const [, month, day] = dateText.split("-");
  return `${day}/${month}`;
}

/** 7 novembre 2026 */
export function formatLongDate(dateText) {
  const date = toDate(dateText);
  return `${dayLabel(date)} ${MONTH_DAY.format(date)} ${date.getFullYear()}`;
}

/** Du 1er au 7 novembre 2026, ou Du 28 octobre au 3 novembre 2026. */
export function formatPeriod(startText, endText) {
  const start = toDate(startText);
  const end = toDate(endText);
  const sameMonth = start.getMonth() === end.getMonth();
  const startLabel = sameMonth ? dayLabel(start) : `${dayLabel(start)} ${MONTH_DAY.format(start)}`;
  return `du ${startLabel} au ${formatLongDate(endText)}`;
}

export function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
