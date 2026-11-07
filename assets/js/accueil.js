/** Assemble la section baromètre de l'accueil à partir des données en direct. */
import { loadBarometre } from "./barometre-donnees.js";
import { createClassement } from "./classement.js";
import { createCourbes } from "./courbes.js";
import { formatLongDate, formatPerMille, formatPeriod, prefersReducedMotion } from "./format.js";

const COUNT_UP_MS = 1100;

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function setText(selector, text) {
  document.querySelectorAll(selector).forEach((element) => {
    element.textContent = text;
  });
}

/** Fait monter un chiffre jusqu'à sa vraie valeur, sans jamais en afficher une autre à la fin. */
function countUp(element, value, reducedMotion) {
  element.textContent = formatPerMille(value);
  if (reducedMotion || document.hidden) {
    return;
  }
  const start = performance.now();
  function tick(now) {
    const progress = Math.min(1, (now - start) / COUNT_UP_MS);
    const eased = 1 - (1 - progress) ** 3;
    element.textContent = formatPerMille(value * eased);
    if (progress < 1) {
      requestAnimationFrame(tick);
    }
  }
  requestAnimationFrame(tick);
}

function fillOpening(barometre, reducedMotion) {
  const { dates, ranking } = barometre;
  const first = ranking[0];
  const last = ranking[ranking.length - 1];

  setText("[data-periode]", capitalize(formatPeriod(dates[0], dates[dates.length - 1])));
  setText("[data-periode-texte]", formatPeriod(dates[0], dates[dates.length - 1]));
  setText("[data-releve]", formatLongDate(dates[dates.length - 1]));
  setText("[data-effectif]", String(ranking.length));
  setText("[data-premier-nom]", first.name);
  setText("[data-dernier-nom]", last.name);
  countUp(document.querySelector("[data-premier-score]"), first.weekValue, reducedMotion);
  countUp(document.querySelector("[data-dernier-score]"), last.weekValue, reducedMotion);
  document.querySelector("[data-chiffres]").hidden = false;
  document.querySelector("[data-resume]").hidden = false;
}

function showFailure() {
  document.querySelector("[data-erreur]").hidden = false;
  document.querySelector("[data-contenu-barometre]").hidden = true;
}

async function start() {
  let barometre;
  try {
    barometre = await loadBarometre();
  } catch (error) {
    showFailure();
    return;
  }

  if (barometre.ranking.length < 2) {
    showFailure();
    return;
  }

  const reducedMotion = prefersReducedMotion();
  let pinnedId = null;
  let courbes;
  let classement;

  function focus(id) {
    const target = id ?? pinnedId;
    courbes?.setFocus(target);
    classement?.setFocus(target);
  }

  function togglePin(id) {
    pinnedId = pinnedId === id ? null : id;
    classement.setPinned(pinnedId);
    focus(pinnedId);
  }

  fillOpening(barometre, reducedMotion);
  document.querySelector("[data-contenu-barometre]").hidden = false;

  courbes = createCourbes(document.querySelector("[data-courbes]"), barometre, {
    reducedMotion,
    onFocus: focus,
  });
  classement = createClassement(
    document.querySelector("[data-classement]"),
    document.querySelector("[data-tout-voir]"),
    barometre.ranking,
    { onFocus: focus, onToggle: togglePin },
  );
}

start();
