const menuButton = document.querySelector("[data-menu-toggle]");
const mobileNav = document.querySelector("[data-mobile-nav]");

function loadAnalytics() {
  if (window.location.protocol !== "https:") return;
  if (document.querySelector("script[data-google-analytics]")) return;
  const analyticsScript = document.createElement("script");
  analyticsScript.async = true;
  analyticsScript.dataset.googleAnalytics = "";
  analyticsScript.src = "https://www.googletagmanager.com/gtag/js?id=G-KGQ1ZGCMS7";
  document.head.append(analyticsScript);
}

["pointerdown", "keydown", "touchstart", "scroll"].forEach((eventName) => {
  window.addEventListener(eventName, loadAnalytics, { once: true, passive: true });
});

window.addEventListener("load", () => {
  window.setTimeout(loadAnalytics, 8000);
}, { once: true });

function setMenu(open) {
  if (!menuButton || !mobileNav) return;
  menuButton.setAttribute("aria-expanded", String(open));
  menuButton.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
  mobileNav.dataset.open = String(open);
  document.body.classList.toggle("nav-open", open);
}

menuButton?.addEventListener("click", () => {
  setMenu(menuButton.getAttribute("aria-expanded") !== "true");
});

mobileNav?.addEventListener("click", (event) => {
  if (event.target.closest("a")) setMenu(false);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") setMenu(false);
});

const revealItems = document.querySelectorAll(".reveal");
if ("IntersectionObserver" in window && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
  const revealObserver = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
  );
  revealItems.forEach((item) => revealObserver.observe(item));
} else {
  revealItems.forEach((item) => item.classList.add("is-visible"));
}

const filterButtons = document.querySelectorAll("[data-filter]");
const galleryItems = document.querySelectorAll("[data-category]");

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const selected = button.dataset.filter;
    filterButtons.forEach((candidate) => {
      candidate.setAttribute("aria-pressed", String(candidate === button));
    });
    galleryItems.forEach((item) => {
      item.hidden = selected !== "all" && item.dataset.category !== selected;
    });
  });
});

const storyDataNode = document.querySelector("#portfolio-story-data");
const portfolioViewer = document.querySelector("[data-portfolio-viewer]");

if (storyDataNode && portfolioViewer) {
  const stories = JSON.parse(storyDataNode.textContent);
  const viewerDialog = portfolioViewer.querySelector(".portfolio-viewer__dialog");
  const viewerImage = portfolioViewer.querySelector("[data-viewer-image]");
  const viewerTitle = portfolioViewer.querySelector("[data-viewer-title]");
  const viewerLabel = portfolioViewer.querySelector("[data-viewer-label]");
  const viewerStatus = portfolioViewer.querySelector("[data-viewer-status]");
  const previousButton = portfolioViewer.querySelector("[data-story-previous]");
  const nextButton = portfolioViewer.querySelector("[data-story-next]");
  let activeStory = null;
  let activeIndex = 0;
  let returnFocus = null;

  function renderStoryImage() {
    if (!activeStory) return;
    const image = activeStory.images[activeIndex];
    viewerImage.src = image.src;
    viewerImage.alt = image.alt;
    viewerTitle.textContent = activeStory.title;
    viewerLabel.textContent = activeStory.label;
    viewerStatus.textContent = `${activeIndex + 1} of ${activeStory.images.length}`;
    const hasMultipleImages = activeStory.images.length > 1;
    previousButton.disabled = !hasMultipleImages;
    nextButton.disabled = !hasMultipleImages;
  }

  function openStory(storyId, trigger) {
    activeStory = stories[storyId];
    if (!activeStory) return;
    activeIndex = 0;
    returnFocus = trigger;
    portfolioViewer.hidden = false;
    document.body.classList.add("viewer-open");
    renderStoryImage();
    viewerDialog.focus();
  }

  function closeStory() {
    portfolioViewer.hidden = true;
    document.body.classList.remove("viewer-open");
    viewerImage.removeAttribute("src");
    activeStory = null;
    returnFocus?.focus();
  }

  document.querySelectorAll("[data-story-open]").forEach((button) => {
    button.addEventListener("click", () => openStory(button.dataset.storyOpen, button));
  });

  portfolioViewer.querySelectorAll("[data-story-close]").forEach((button) => {
    button.addEventListener("click", closeStory);
  });

  previousButton.addEventListener("click", () => {
    if (!activeStory || activeStory.images.length < 2) return;
    activeIndex = (activeIndex - 1 + activeStory.images.length) % activeStory.images.length;
    renderStoryImage();
  });

  nextButton.addEventListener("click", () => {
    if (!activeStory || activeStory.images.length < 2) return;
    activeIndex = (activeIndex + 1) % activeStory.images.length;
    renderStoryImage();
  });

  document.addEventListener("keydown", (event) => {
    if (portfolioViewer.hidden) return;
    if (event.key === "Escape") closeStory();
    if (event.key === "ArrowLeft") previousButton.click();
    if (event.key === "ArrowRight") nextButton.click();
  });
}

document.querySelectorAll("[data-current-year]").forEach((node) => {
  node.textContent = String(new Date().getFullYear());
});

const inquiryForm = document.querySelector("#inquiry-form");
if (inquiryForm) {
  const parameters = new URLSearchParams(window.location.search);
  const service = parameters.get("service");
  const industry = parameters.get("industry");
  const serviceSelect = inquiryForm.querySelector("[name='service']");
  const industrySelect = inquiryForm.querySelector("[name='industry']");

  if (service && serviceSelect && [...serviceSelect.options].some((option) => option.value === service)) {
    serviceSelect.value = service;
  }

  if (industry && industrySelect && [...industrySelect.options].some((option) => option.value === industry)) {
    industrySelect.value = industry;
  }
}

const eventModal = document.querySelector("[data-event-modal]");
const eventOpenButton = document.querySelector("[data-event-open]");
const eventCloseButton = document.querySelector("[data-event-close]");
const updatesForm = document.querySelector("[data-updates-form]");
const eventSessionKey = "luxe-event-1995603757559-dismissed";
const eventEndsAt = new Date("2026-08-28T20:00:00-05:00");
let eventReturnFocus = null;

function rememberEventDismissal() {
  try {
    window.sessionStorage.setItem(eventSessionKey, "true");
  } catch {
    // The popup still works when storage is unavailable.
  }
}

function eventWasDismissed() {
  try {
    return window.sessionStorage.getItem(eventSessionKey) === "true";
  } catch {
    return false;
  }
}

function openEventModal(trigger = null) {
  if (!eventModal || Date.now() > eventEndsAt.getTime()) return;
  eventReturnFocus = trigger;
  eventModal.hidden = false;
  if (eventOpenButton) eventOpenButton.hidden = true;
  document.body.classList.add("event-modal-open");
  window.requestAnimationFrame(() => eventModal.querySelector(".event-modal__dialog")?.focus());
}

function closeEventModal() {
  if (!eventModal || eventModal.hidden) return;
  eventModal.hidden = true;
  document.body.classList.remove("event-modal-open");
  rememberEventDismissal();
  if (eventOpenButton && Date.now() <= eventEndsAt.getTime()) eventOpenButton.hidden = false;
  (eventReturnFocus || eventOpenButton)?.focus();
}

if (eventModal && eventOpenButton && Date.now() <= eventEndsAt.getTime()) {
  eventOpenButton.addEventListener("click", () => openEventModal(eventOpenButton));
  eventCloseButton?.addEventListener("click", closeEventModal);
  eventModal.querySelector(".event-modal__backdrop")?.addEventListener("click", closeEventModal);

  document.addEventListener("keydown", (event) => {
    if (eventModal.hidden) return;
    if (event.key === "Escape") {
      closeEventModal();
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = [...eventModal.querySelectorAll('a[href], button:not([disabled]), input:not([type="hidden"]):not([disabled])')]
      .filter((element) => !element.closest("[hidden]"));
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  if (eventWasDismissed()) {
    eventOpenButton.hidden = false;
  } else {
    window.setTimeout(() => openEventModal(), 2500);
  }
}

updatesForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const status = updatesForm.querySelector("[data-updates-status]");
  const submitButton = updatesForm.querySelector('button[type="submit"]');
  const defaultLabel = submitButton.textContent;

  submitButton.disabled = true;
  submitButton.textContent = "Subscribing...";
  status.textContent = "";

  try {
    const response = await fetch("/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(new FormData(updatesForm)).toString(),
    });
    if (!response.ok) throw new Error(`Subscription failed with status ${response.status}`);
    updatesForm.reset();
    submitButton.textContent = "Subscribed";
    status.textContent = "You are on the list. Watch your inbox for future Luxe Lens updates.";
  } catch {
    submitButton.disabled = false;
    submitButton.textContent = defaultLabel;
    status.textContent = "We could not save your email right now. Please try again.";
  }
});
