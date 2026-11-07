/**
 * Données du baromètre pour l'accueil.
 *
 * Reprend à l'identique le calcul de monitor_dashboard.html (métrique
 * « dynamique ajustée », toutes plateformes, 7 jours). Les couleurs sont lues
 * dans cette page, seule source de vérité, car le bot y réécrit CANDIDATE_COLORS.
 */

/**
 * @typedef {Object} Point
 * @property {string} date
 * @property {number} value
 */

/**
 * @typedef {Object} Personnalite
 * @property {string} id
 * @property {string} name
 * @property {string} initials
 * @property {string} color
 * @property {string} photo
 * @property {number} weekValue
 * @property {Point[]} series
 * @property {{platform: string|null, followers: number}} audience
 */

/**
 * @typedef {Object} Barometre
 * @property {string[]} dates
 * @property {Personnalite[]} ranking
 */

const DASHBOARD_PAGE = "monitor_dashboard.html";
const CANDIDATES_FILE = "data/candidates.json";
const PERIOD_DAYS = 7;

const PLATFORM_FILES = {
  instagram: "data/instagram_history.json",
  twitter: "data/twitter_history.json",
  tiktok: "data/tiktok_history.json",
  facebook: "data/facebook_history.json",
};

export const PLATFORM_LABELS = {
  instagram: "Instagram",
  twitter: "X",
  tiktok: "TikTok",
  facebook: "Facebook",
};

function fetchNoCache(path) {
  return fetch(`${path}?v=${Date.now()}`, { cache: "no-store" }).then((response) => {
    if (!response.ok) {
      throw new Error(`${path} introuvable`);
    }
    return response;
  });
}

function fetchJson(path) {
  return fetchNoCache(path).then((response) => response.json());
}

/** Lit un bloc de monitor_dashboard.html sans jamais modifier cette page. */
function readDashboardPalette(pageText) {
  const colorsBlock = pageText.match(/const CANDIDATE_COLORS = \{(.*?)\};/s);
  const fallbackBlock = pageText.match(/const COLORS = \[(.*?)\];/s);
  const candidateColors = {};

  if (colorsBlock) {
    for (const [, key, value] of colorsBlock[1].matchAll(/"([^"]+)":\s*"(#[0-9a-fA-F]{6})"/g)) {
      candidateColors[key] = value;
    }
  }

  const fallbackColors = fallbackBlock ? fallbackBlock[1].match(/#[0-9a-fA-F]{6}/g) || [] : [];
  return { candidateColors, fallbackColors };
}

function colorFor(candidate, index, palette) {
  if (candidate.color) {
    return candidate.color;
  }
  if (palette.candidateColors[candidate.id]) {
    return palette.candidateColors[candidate.id];
  }
  if (!palette.fallbackColors.length) {
    return "#f1efe9";
  }

  const key = candidate.id || String(index);
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return palette.fallbackColors[hash % palette.fallbackColors.length];
}

function indexByDate(histories) {
  const byDate = {};
  for (const [platform, history] of Object.entries(histories)) {
    byDate[platform] = {};
    for (const snapshot of history || []) {
      if (snapshot.date) {
        byDate[platform][snapshot.date] = snapshot;
      }
    }
  }
  return byDate;
}

function listDates(histories) {
  const dates = new Set();
  for (const history of Object.values(histories)) {
    for (const snapshot of history || []) {
      if (snapshot.date) {
        dates.add(snapshot.date);
      }
    }
  }
  return [...dates].sort();
}

function lastPeriodDates(dates) {
  if (!dates.length) {
    return [];
  }
  const start = new Date(`${dates[dates.length - 1]}T00:00:00`);
  start.setDate(start.getDate() - (PERIOD_DAYS - 1));
  return dates.filter((date) => new Date(`${date}T00:00:00`) >= start);
}

function followersOf(snapshot, candidateId) {
  return snapshot?.accounts?.[candidateId]?.followers;
}

function perMille(current, previous) {
  if (current == null || previous == null || previous === 0) {
    return null;
  }
  return ((current - previous) / previous) * 1000;
}

/** Part du compte face au plus gros compte de la même plateforme. */
function platformFactor(followers, snapshot) {
  const all = Object.values(snapshot?.accounts || {})
    .map((account) => account?.followers)
    .filter((value) => Number.isFinite(value) && value > 0);
  const largest = all.length ? Math.max(...all) : 0;

  if (!Number.isFinite(followers) || followers <= 0 || largest <= 0) {
    return 0;
  }
  return followers / largest;
}

/** Dynamique ajustée d'une personnalité entre deux dates, ou null. */
function adjustedValue(candidateId, date, previousDate, byDate) {
  const values = [];

  for (const platform of Object.keys(PLATFORM_FILES)) {
    const current = byDate[platform]?.[date] ?? null;
    const previous = byDate[platform]?.[previousDate] ?? null;
    const currentFollowers = followersOf(current, candidateId);
    const value = perMille(currentFollowers, followersOf(previous, candidateId));

    if (value != null) {
      values.push({
        value,
        followers: currentFollowers,
        factor: platformFactor(currentFollowers, current),
      });
    }
  }

  if (!values.length) {
    return null;
  }

  const maxFollowers = Math.max(...values.map((item) => item.followers || 0));
  if (maxFollowers <= 0) {
    return null;
  }

  let weightedSum = 0;
  let weightSum = 0;
  for (const item of values) {
    const weight = item.followers / maxFollowers;
    weightedSum += item.value * item.factor * weight;
    weightSum += weight;
  }
  return weightSum ? weightedSum / weightSum : null;
}

function largestAudience(candidateId, date, byDate) {
  const audiences = Object.keys(PLATFORM_FILES)
    .map((platform) => ({
      platform,
      followers: followersOf(byDate[platform]?.[date], candidateId),
    }))
    .filter((item) => Number.isFinite(item.followers) && item.followers > 0)
    .sort((a, b) => b.followers - a.followers);

  return audiences[0] || { platform: null, followers: 0 };
}

function photoPath(candidateId) {
  const safeName = String(candidateId || "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return safeName ? `data/profile_pics/${safeName}.png` : "";
}

/** « David LISNARD » devient « David Lisnard », « DE VILLEPIN » devient « de Villepin ». */
function readableName(rawName) {
  const lowerParticles = new Set(["de", "du", "des", "d"]);
  return rawName
    .split(" ")
    .map((word) => {
      if (word !== word.toUpperCase()) {
        return word;
      }
      const lower = word.toLocaleLowerCase("fr-FR");
      if (lowerParticles.has(lower)) {
        return lower;
      }
      return lower.replace(/(^|[-'’])(\p{L})/gu, (match, separator, letter) => {
        return separator + letter.toLocaleUpperCase("fr-FR");
      });
    })
    .join(" ");
}

function initialsOf(name) {
  const words = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[-_']/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  return words.map((word) => word[0]).join("").toUpperCase().slice(0, 3) || "?";
}

/**
 * Calcule le classement à partir des données brutes.
 * @returns {Barometre}
 */
export function buildBarometre(candidates, histories, palette) {
  const byDate = indexByDate(histories);
  const allDates = listDates(histories);
  const dates = lastPeriodDates(allDates);
  const firstDate = dates[0];
  const lastDate = dates[dates.length - 1];
  const hasPeriod = Boolean(firstDate) && firstDate !== lastDate;

  const visible = candidates
    .filter((candidate) => candidate.enabled !== false)
    .slice()
    .sort((a, b) => (a.display_name || a.id).localeCompare(b.display_name || b.id, "fr"));

  const ranking = visible
    .map((candidate, index) => {
      const rawName = candidate.display_name || candidate.id;
      const series = dates
        .map((date) => {
          const previousDate = allDates[allDates.indexOf(date) - 1];
          return { date, value: adjustedValue(candidate.id, date, previousDate, byDate) };
        })
        .filter((point) => point.value != null);

      return {
        id: candidate.id,
        name: readableName(rawName),
        initials: initialsOf(rawName),
        color: colorFor(candidate, index, palette),
        photo: photoPath(candidate.id),
        weekValue: hasPeriod ? adjustedValue(candidate.id, lastDate, firstDate, byDate) : null,
        series,
        audience: largestAudience(candidate.id, lastDate, byDate),
      };
    })
    .filter((person) => person.weekValue != null)
    .sort((a, b) => b.weekValue - a.weekValue);

  return { dates, ranking };
}

/**
 * Charge les fichiers publiés à côté des pages et calcule le baromètre.
 * @returns {Promise<Barometre>}
 */
export async function loadBarometre() {
  const [dashboardPage, candidates, ...histories] = await Promise.all([
    fetchNoCache(DASHBOARD_PAGE).then((response) => response.text()),
    fetchJson(CANDIDATES_FILE),
    ...Object.values(PLATFORM_FILES).map(fetchJson),
  ]);

  const historiesByPlatform = {};
  Object.keys(PLATFORM_FILES).forEach((platform, index) => {
    historiesByPlatform[platform] = histories[index];
  });

  return buildBarometre(candidates, historiesByPlatform, readDashboardPalette(dashboardPage));
}
