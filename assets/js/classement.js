/** Tableau du classement et chiffres clés de l'ouverture. */
import { PLATFORM_LABELS } from "./barometre-donnees.js";
import { formatFollowers, formatPerMille } from "./format.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const VISIBLE_TOP = 5;
const VISIBLE_BOTTOM = 2;
const SPARK_WIDTH = 96;
const SPARK_HEIGHT = 24;

function sparkline(person) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "minicourbe");
  svg.setAttribute("viewBox", `0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`);
  svg.setAttribute("aria-hidden", "true");

  const values = person.series.map((point) => point.value);
  if (values.length < 2) {
    return svg;
  }

  const low = Math.min(...values);
  const span = Math.max(...values) - low || 1;
  const step = SPARK_WIDTH / (values.length - 1);
  const points = values.map((value, index) => {
    const y = SPARK_HEIGHT - 2 - ((value - low) / span) * (SPARK_HEIGHT - 4);
    return `${(index * step).toFixed(1)},${y.toFixed(1)}`;
  });

  const line = document.createElementNS(SVG_NS, "polyline");
  line.setAttribute("points", points.join(" "));
  line.setAttribute("stroke", person.color);
  svg.append(line);
  return svg;
}

function portrait(person) {
  const frame = document.createElement("span");
  frame.className = "portrait";
  frame.style.setProperty("--couleur", person.color);

  const initials = document.createElement("span");
  initials.className = "initiales";
  initials.textContent = person.initials;
  frame.append(initials);

  if (person.photo) {
    const image = document.createElement("img");
    image.src = person.photo;
    image.alt = "";
    image.loading = "lazy";
    image.width = 40;
    image.height = 40;
    image.addEventListener("error", () => image.remove());
    frame.append(image);
  }
  return frame;
}

function cell(className, ...children) {
  const element = document.createElement("td");
  element.className = className;
  element.append(...children);
  return element;
}

function audienceCell(person) {
  if (!person.audience.platform) {
    return cell("audience", "—");
  }
  const platform = document.createElement("small");
  platform.textContent = PLATFORM_LABELS[person.audience.platform];
  return cell("audience", `${formatFollowers(person.audience.followers)} `, platform);
}

function buildRow(person, rank, handlers) {
  const row = document.createElement("tr");
  row.dataset.id = person.id;
  row.style.setProperty("--rang", String(rank));

  const nameCell = document.createElement("th");
  nameCell.scope = "row";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "nom";
  button.setAttribute("aria-pressed", "false");
  const label = document.createElement("span");
  label.textContent = person.name;
  button.append(portrait(person), label);
  button.addEventListener("click", () => handlers.onToggle(person.id));
  nameCell.append(button);

  const score = cell(`score${person.weekValue < 0 ? " baisse" : ""}`, formatPerMille(person.weekValue));
  row.append(cell("rang", String(rank)), nameCell, cell("evolution", sparkline(person)), audienceCell(person), score);
  row.addEventListener("pointerenter", () => handlers.onFocus(person.id));
  row.addEventListener("pointerleave", () => handlers.onFocus(null));
  return row;
}

/**
 * @typedef {Object} ClassementController
 * @property {(id: string|null) => void} setFocus
 * @property {(id: string|null) => void} setPinned
 */

/**
 * @param {HTMLTableSectionElement} body corps du tableau
 * @param {HTMLButtonElement} toggle bouton d'affichage complet
 * @param {import("./barometre-donnees.js").Personnalite[]} ranking
 * @param {{onFocus: (id: string|null) => void, onToggle: (id: string) => void}} handlers
 * @returns {ClassementController}
 */
export function createClassement(body, toggle, ranking, handlers) {
  const hideFrom = VISIBLE_TOP;
  const hideTo = ranking.length - VISIBLE_BOTTOM;
  const rows = ranking.map((person, index) => buildRow(person, index + 1, handlers));
  body.replaceChildren(...rows);

  function setExpanded(expanded) {
    rows.forEach((row, index) => {
      row.hidden = !expanded && index >= hideFrom && index < hideTo;
    });
    toggle.setAttribute("aria-expanded", String(expanded));
    toggle.textContent = expanded
      ? "Réduire le classement"
      : `Voir les ${ranking.length} personnalités`;
  }

  toggle.hidden = hideTo <= hideFrom;
  toggle.addEventListener("click", () => {
    setExpanded(toggle.getAttribute("aria-expanded") !== "true");
  });
  setExpanded(hideTo <= hideFrom);

  return {
    setFocus(id) {
      rows.forEach((row) => row.classList.toggle("est-focus", row.dataset.id === id));
    },
    setPinned(id) {
      rows.forEach((row) => {
        row.querySelector(".nom").setAttribute("aria-pressed", String(row.dataset.id === id));
      });
    },
  };
}
