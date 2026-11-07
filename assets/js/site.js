/** Comportements communs : en-tête acrylique au défilement, apparitions douces. */

function watchHeader() {
  const header = document.querySelector("[data-entete]");
  const marker = document.querySelector("[data-repere-entete]");
  if (!header || !marker || !("IntersectionObserver" in window)) {
    return;
  }
  const observer = new IntersectionObserver(([entry]) => {
    header.classList.toggle("est-defile", !entry.isIntersecting);
  });
  observer.observe(marker);
}

function revealOnScroll() {
  const elements = document.querySelectorAll("[data-apparition]");
  if (!("IntersectionObserver" in window)) {
    elements.forEach((element) => element.classList.add("est-visible"));
    return;
  }
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add("est-visible");
        observer.unobserve(entry.target);
      }
    }
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
  elements.forEach((element) => observer.observe(element));
}

watchHeader();
revealOnScroll();
