/**
 * Graphique des courbes du baromètre : tracé animé à l'entrée dans l'écran,
 * survol, couleurs attribuées. Segments droits, comme sur la page du baromètre :
 * aucun lissage ne vient déformer les valeurs.
 */
import { formatLongDate, formatPerMille, formatShortDate } from "./format.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const NICE_STEPS = [0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10, 20, 50];
const MAX_TICKS = 6;
const LABEL_GAP = 20;
const POINTER_RANGE = 26;
const STAGGER_SECONDS = 0.06;
const DARK_COLOR_LUMINANCE = 0.1;

function svgElement(name, attributes = {}) {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) {
    element.setAttribute(key, value);
  }
  return element;
}

function relativeLuminance(hexColor) {
  const channels = [1, 3, 5].map((start) => {
    const value = parseInt(hexColor.slice(start, start + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function lastName(fullName) {
  const words = fullName.split(" ");
  const particles = new Set(["de", "du", "le", "la", "Le", "La"]);
  const previous = words[words.length - 2];
  if (words.length > 2 && particles.has(previous)) {
    return `${previous} ${words[words.length - 1]}`;
  }
  return words[words.length - 1];
}

/** Bornes calculées comme sur le baromètre : minimum, maximum, marge de 12 %. */
function valueDomain(ranking) {
  const values = ranking.flatMap((person) => person.series.map((point) => point.value));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = (max - min) * 0.12 || 1;
  return { low: min - pad, high: max + pad };
}

function ticksFor(low, high) {
  const step = NICE_STEPS.find((candidate) => (high - low) / candidate <= MAX_TICKS) || 100;
  const ticks = [];
  for (let tick = Math.ceil(low / step) * step; tick <= high; tick += step) {
    ticks.push(Number(tick.toFixed(4)));
  }
  return ticks;
}

/** Écarte les libellés de fin de courbe pour éviter qu'ils se chevauchent. */
function spreadLabels(labels, bottomLimit) {
  const sorted = labels.slice().sort((a, b) => a.y - b.y);
  let previous = -Infinity;
  for (const label of sorted) {
    label.textY = Math.max(label.y, previous + LABEL_GAP);
    previous = label.textY;
  }
  let overflow = sorted.length ? sorted[sorted.length - 1].textY - bottomLimit : 0;
  for (let index = sorted.length - 1; index >= 0 && overflow > 0; index -= 1) {
    sorted[index].textY -= overflow;
    const above = sorted[index - 1];
    overflow = above ? above.textY + LABEL_GAP - sorted[index].textY : 0;
  }
  return sorted;
}

function layoutFor(width) {
  const compact = width < 620;
  return {
    compact,
    width,
    height: compact ? 320 : Math.min(520, Math.max(380, width * 0.42)),
    left: compact ? 44 : 56,
    right: compact ? 86 : 124,
    top: 14,
    bottom: 30,
  };
}

/**
 * @typedef {Object} CourbesController
 * @property {(id: string|null) => void} setFocus
 */

/**
 * @param {HTMLElement} root élément qui reçoit le graphique
 * @param {import("./barometre-donnees.js").Barometre} barometre
 * @param {{reducedMotion: boolean, onFocus: (id: string|null) => void}} options
 * @returns {CourbesController}
 */
export function createCourbes(root, barometre, options) {
  const { dates, ranking } = barometre;
  const domain = valueDomain(ranking);
  const featured = new Set([...ranking.slice(0, 3), ranking[ranking.length - 1]].map((person) => person.id));
  const tooltip = root.querySelector("[data-tooltip]");
  const surface = root.querySelector("[data-surface]");

  let hasPlayed = options.reducedMotion;
  let focusId = null;
  let screenPoints = [];

  function xAt(layout, dateIndex) {
    const inner = layout.width - layout.left - layout.right;
    return layout.left + (dateIndex * inner) / Math.max(1, dates.length - 1);
  }

  function yAt(layout, value) {
    const inner = layout.height - layout.top - layout.bottom;
    return layout.top + ((domain.high - value) / (domain.high - domain.low)) * inner;
  }

  function drawAxes(svg, layout) {
    for (const tick of ticksFor(domain.low, domain.high)) {
      const y = yAt(layout, tick);
      svg.append(svgElement("line", {
        class: tick === 0 ? "axe axe-zero" : "axe",
        x1: layout.left,
        x2: layout.width - layout.right,
        y1: y,
        y2: y,
      }));
      const label = svgElement("text", { class: "graduation", x: layout.left - 10, y: y + 4, "text-anchor": "end" });
      label.textContent = tick === 0 ? "0" : formatPerMille(tick, Math.abs(tick) < 1 && tick * 10 % 1 ? 2 : 1);
      svg.append(label);
    }

    dates.forEach((date, index) => {
      if (layout.compact && index % 2 !== 0 && index !== dates.length - 1) {
        return;
      }
      const label = svgElement("text", {
        class: "graduation",
        x: xAt(layout, index),
        y: layout.height - 8,
        "text-anchor": "middle",
      });
      label.textContent = formatShortDate(date);
      svg.append(label);
    });
  }

  function drawLine(svg, layout, person, delayIndex) {
    const coordinates = person.series.map((point) => {
      const x = xAt(layout, dates.indexOf(point.date));
      const y = yAt(layout, point.value);
      screenPoints.push({ x, y, person, point });
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    const points = coordinates.join(" ");
    const isFeatured = featured.has(person.id);
    const isDark = relativeLuminance(person.color) < DARK_COLOR_LUMINANCE;
    const group = svgElement("g", {
      class: `serie ${isFeatured ? "serie-forte" : "serie-discrete"}`,
      "data-id": person.id,
      style: `--retard: ${(delayIndex * STAGGER_SECONDS).toFixed(2)}s`,
    });

    if (isDark) {
      group.append(svgElement("polyline", { class: "liseret", points, pathLength: 1 }));
    }
    group.append(svgElement("polyline", { class: "trace", points, stroke: person.color, pathLength: 1 }));

    for (const point of person.series) {
      group.append(svgElement("circle", {
        class: "point",
        cx: xAt(layout, dates.indexOf(point.date)),
        cy: yAt(layout, point.value),
        r: 3.5,
        fill: person.color,
      }));
    }
    svg.append(group);
  }

  function drawEndLabels(svg, layout) {
    const labels = ranking
      .filter((person) => featured.has(person.id) && person.series.length)
      .map((person) => {
        const last = person.series[person.series.length - 1];
        return { person, x: xAt(layout, dates.indexOf(last.date)), y: yAt(layout, last.value) };
      });

    spreadLabels(labels, layout.height - layout.bottom).forEach((label) => {
      const group = svgElement("g", { class: "etiquette" });
      group.append(svgElement("circle", { cx: label.x, cy: label.y, r: 4, fill: label.person.color, class: "fin" }));
      const text = svgElement("text", { class: "nom-courbe", x: label.x + 12, y: label.textY + 5 });
      text.textContent = lastName(label.person.name);
      group.append(text);
      svg.append(group);
    });
  }

  function render() {
    const width = surface.clientWidth;
    if (!width) {
      return;
    }
    const layout = layoutFor(width);
    const svg = svgElement("svg", {
      class: `courbes${hasPlayed ? " est-trace" : ""}`,
      viewBox: `0 0 ${layout.width} ${layout.height}`,
      width: layout.width,
      height: layout.height,
      role: "img",
      "aria-label": describe(),
    });

    screenPoints = [];
    drawAxes(svg, layout);

    const backToFront = ranking.slice().reverse().sort((a, b) => featured.has(a.id) - featured.has(b.id));
    backToFront.forEach((person, index) => drawLine(svg, layout, person, index));
    drawEndLabels(svg, layout);

    surface.replaceChildren(svg);
    applyFocus();
  }

  function describe() {
    const first = ranking[0];
    const last = ranking[ranking.length - 1];
    return `Dynamique quotidienne ajustée de ${ranking.length} personnalités. `
      + `En tête sur la période : ${first.name}, ${formatPerMille(first.weekValue)}. `
      + `Dernier : ${last.name}, ${formatPerMille(last.weekValue)}. Le détail figure dans le tableau.`;
  }

  function applyFocus() {
    const svg = surface.querySelector("svg");
    if (!svg) {
      return;
    }
    svg.classList.toggle("a-un-focus", Boolean(focusId));
    svg.querySelectorAll(".serie").forEach((group) => {
      const isFocused = group.dataset.id === focusId;
      group.classList.toggle("est-focus", isFocused);
      if (isFocused) {
        svg.insertBefore(group, svg.querySelector(".etiquette"));
      }
    });
  }

  function setFocus(id) {
    if (focusId === id) {
      return;
    }
    focusId = id;
    applyFocus();
  }

  function nearestPoint(event) {
    const box = surface.getBoundingClientRect();
    const x = event.clientX - box.left;
    const y = event.clientY - box.top;
    let best = null;
    let bestDistance = POINTER_RANGE;
    for (const candidate of screenPoints) {
      const distance = Math.hypot(candidate.x - x, candidate.y - y);
      if (distance < bestDistance) {
        best = candidate;
        bestDistance = distance;
      }
    }
    return best;
  }

  function showTooltip(target) {
    tooltip.replaceChildren();
    const name = document.createElement("strong");
    name.textContent = target.person.name;
    const detail = document.createElement("span");
    detail.textContent = `${formatLongDate(target.point.date)} · ${formatPerMille(target.point.value, 2)}`;
    tooltip.append(name, detail);
    tooltip.hidden = false;

    const maxLeft = surface.clientWidth - tooltip.offsetWidth;
    const left = Math.min(Math.max(0, target.x - tooltip.offsetWidth / 2), maxLeft);
    const top = target.y - tooltip.offsetHeight - 14;
    tooltip.style.transform = `translate(${left}px, ${top < 0 ? target.y + 14 : top}px)`;
  }

  function hideTooltip() {
    tooltip.hidden = true;
  }

  surface.addEventListener("pointermove", (event) => {
    const target = nearestPoint(event);
    if (target) {
      showTooltip(target);
      options.onFocus(target.person.id);
      return;
    }
    hideTooltip();
    options.onFocus(null);
  });

  surface.addEventListener("pointerleave", () => {
    hideTooltip();
    options.onFocus(null);
  });

  function playWhenVisible() {
    if (hasPlayed || !("IntersectionObserver" in window)) {
      hasPlayed = true;
      surface.querySelector("svg")?.classList.add("est-trace");
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        hasPlayed = true;
        surface.querySelector("svg")?.classList.add("est-trace");
        observer.disconnect();
      }
    }, { threshold: 0.3 });
    observer.observe(surface);
  }

  render();
  playWhenVisible();

  let lastWidth = surface.clientWidth;
  new ResizeObserver(() => {
    if (surface.clientWidth !== lastWidth) {
      lastWidth = surface.clientWidth;
      render();
    }
  }).observe(surface);

  return { setFocus };
}
