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

const navBreakpoint = window.matchMedia("(max-width: 1040px)");
// Page regions that must not be reachable while the full-screen menu covers them.
const menuBackground = document.querySelectorAll("main, .site-footer");

function setMenu(open, { restoreFocus = false } = {}) {
  if (!menuButton || !mobileNav) return;
  const wasOpen = menuButton.getAttribute("aria-expanded") === "true";
  menuButton.setAttribute("aria-expanded", String(open));
  menuButton.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
  mobileNav.dataset.open = String(open);
  document.body.classList.toggle("nav-open", open);
  menuBackground.forEach((region) => { region.inert = open; });
  if (open && !wasOpen) mobileNav.querySelector("a")?.focus();
  if (!open && wasOpen && restoreFocus) menuButton.focus();
}

function menuFocusables() {
  return [menuButton, ...mobileNav.querySelectorAll("a[href]")];
}

menuButton?.addEventListener("click", () => {
  const open = menuButton.getAttribute("aria-expanded") !== "true";
  setMenu(open, { restoreFocus: true });
});

mobileNav?.addEventListener("click", (event) => {
  const link = event.target.closest("a");
  // Links that open a new tab leave this page in place, so focus goes back to the menu button.
  if (link) setMenu(false, { restoreFocus: link.target === "_blank" });
});

document.addEventListener("keydown", (event) => {
  if (!menuButton || menuButton.getAttribute("aria-expanded") !== "true") return;
  if (event.key === "Escape") {
    setMenu(false, { restoreFocus: true });
  } else if (event.key === "Tab") {
    const focusables = menuFocusables();
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const current = document.activeElement;
    if (!focusables.includes(current)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    } else if (event.shiftKey && current === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && current === last) {
      event.preventDefault();
      first.focus();
    }
  }
});

// Growing past the mobile breakpoint swaps in the desktop nav; release the scroll lock and inert regions.
navBreakpoint.addEventListener("change", (event) => {
  if (!event.matches) setMenu(false);
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
const filterCount = document.querySelector("[data-portfolio-count]");
const filterControls = document.querySelector("[data-portfolio-controls]");
const filterWrap = document.querySelector("[data-portfolio-filter]");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const selected = button.dataset.filter;
    let shown = 0;
    filterButtons.forEach((candidate) => {
      candidate.setAttribute("aria-pressed", String(candidate === button));
    });
    galleryItems.forEach((item) => {
      item.hidden = selected !== "all" && item.dataset.category !== selected;
      if (!item.hidden) shown += 1;
    });
    if (filterCount) {
      filterCount.textContent = `${shown} portfolio ${shown === 1 ? "story" : "stories"} shown.`;
    }
    if (filterControls && filterControls.scrollWidth > filterControls.clientWidth) {
      // Keep the chosen chip in view inside the row without scrolling the page.
      const left = button.offsetLeft - (filterControls.clientWidth - button.offsetWidth) / 2;
      filterControls.scrollTo({ left, behavior: reducedMotion.matches ? "auto" : "smooth" });
    }
  });
});

if (filterWrap) {
  // Sticky only when script can measure the header; stays in the grid's container so it ends before the CTA.
  const siteHeader = document.querySelector(".site-header");
  const syncStickyOffset = () => {
    if (!siteHeader) return;
    filterWrap.style.setProperty("--filter-top", `${siteHeader.offsetHeight}px`);
    filterWrap.classList.add("is-sticky-ready");
  };
  syncStickyOffset();
  window.addEventListener("resize", syncStickyOffset);
}

const storyDataNode = document.querySelector("#portfolio-story-data");
const portfolioViewer = document.querySelector("[data-portfolio-viewer]");

if (storyDataNode && portfolioViewer) {
  const stories = JSON.parse(storyDataNode.textContent);
  const viewerDialog = portfolioViewer.querySelector(".portfolio-viewer__dialog");
  const viewerImage = portfolioViewer.querySelector("[data-viewer-image]");
  const viewerFigure = portfolioViewer.querySelector(".portfolio-viewer__figure");
  const viewerTitle = portfolioViewer.querySelector("[data-viewer-title]");
  const viewerLabel = portfolioViewer.querySelector("[data-viewer-label]");
  const viewerStatus = portfolioViewer.querySelector("[data-viewer-status]");
  const viewerHint = portfolioViewer.querySelector("[data-viewer-hint]");
  const viewerControls = portfolioViewer.querySelector(".portfolio-viewer__controls");
  const previousButton = portfolioViewer.querySelector("[data-story-previous]");
  const nextButton = portfolioViewer.querySelector("[data-story-next]");
  const swipeThreshold = 48;
  let activeStory = null;
  let activeIndex = 0;
  let returnFocus = null;
  let swipeStart = null;

  function renderStoryImage() {
    if (!activeStory) return;
    const image = activeStory.images[activeIndex];
    viewerImage.src = image.src;
    viewerImage.alt = image.alt;
    viewerTitle.textContent = activeStory.title;
    viewerLabel.textContent = activeStory.label;
    viewerStatus.textContent = `${activeIndex + 1} of ${activeStory.images.length}`;
    // Single-image stories have nothing to step through, so the controls leave the tab order.
    const hasMultipleImages = activeStory.images.length > 1;
    viewerControls.hidden = !hasMultipleImages;
    viewerHint.hidden = !hasMultipleImages;
  }

  function stepStory(direction) {
    if (!activeStory || activeStory.images.length < 2) return;
    activeIndex = (activeIndex + direction + activeStory.images.length) % activeStory.images.length;
    renderStoryImage();
  }

  function openStory(storyId, trigger) {
    if (activeStory) return;
    const story = stories[storyId];
    if (!story) return;
    activeStory = story;
    activeIndex = 0;
    returnFocus = trigger;
    portfolioViewer.hidden = false;
    document.body.classList.add("viewer-open");
    renderStoryImage();
    viewerDialog.focus();
  }

  function closeStory() {
    if (!activeStory) return;
    activeStory = null;
    swipeStart = null;
    portfolioViewer.hidden = true;
    document.body.classList.remove("viewer-open");
    viewerImage.removeAttribute("src");
    if (returnFocus?.isConnected) returnFocus.focus();
    returnFocus = null;
  }

  function viewerFocusables() {
    return [...viewerDialog.querySelectorAll("button, [href], input, select, textarea, [tabindex]")].filter(
      (node) => !node.disabled && node.tabIndex >= 0 && !node.closest("[hidden]"),
    );
  }

  document.querySelectorAll("[data-story-open]").forEach((button) => {
    button.addEventListener("click", () => openStory(button.dataset.storyOpen, button));
  });

  portfolioViewer.querySelectorAll("[data-story-close]").forEach((button) => {
    button.addEventListener("click", closeStory);
  });

  previousButton.addEventListener("click", () => stepStory(-1));
  nextButton.addEventListener("click", () => stepStory(1));

  document.addEventListener("keydown", (event) => {
    if (!activeStory) return;
    if (event.key === "Escape") {
      closeStory();
    } else if (event.key === "ArrowLeft") {
      stepStory(-1);
    } else if (event.key === "ArrowRight") {
      stepStory(1);
    } else if (event.key === "Tab") {
      const focusables = viewerFocusables();
      if (!focusables.length) {
        event.preventDefault();
        viewerDialog.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const current = document.activeElement;
      if (event.shiftKey && (current === first || current === viewerDialog || !viewerDialog.contains(current))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (current === last || !viewerDialog.contains(current))) {
        event.preventDefault();
        first.focus();
      }
    }
  });

  // Horizontal swipe is an enhancement; the Previous/Next buttons remain the primary controls.
  viewerFigure.addEventListener("touchstart", (event) => {
    if (!activeStory || activeStory.images.length < 2 || event.touches.length !== 1) {
      swipeStart = null;
      return;
    }
    swipeStart = { x: event.touches[0].clientX, y: event.touches[0].clientY };
  }, { passive: true });

  viewerFigure.addEventListener("touchend", (event) => {
    if (!swipeStart || !activeStory) return;
    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - swipeStart.x;
    const deltaY = touch.clientY - swipeStart.y;
    swipeStart = null;
    if (Math.abs(deltaX) < swipeThreshold || Math.abs(deltaX) < Math.abs(deltaY) * 1.5) return;
    stepStory(deltaX < 0 ? 1 : -1);
  }, { passive: true });

  viewerFigure.addEventListener("touchcancel", () => {
    swipeStart = null;
  }, { passive: true });
}

// Mobile booking bar: injected on high-intent pages only, so excluded pages never render it (with or without JS).
(() => {
  const path = window.location.pathname.replace(/index\.html$/, "").replace(/\/?$/, "/");
  const eligible = path === "/" || path === "/portfolio/" || path === "/services/" || /^\/services\/[^/]+\/$/.test(path);
  if (!eligible || !("IntersectionObserver" in window)) return;
  if (document.querySelector("[data-booking-bar]")) return;

  const bookingLink = document.querySelector(".nav-book[href]");
  const intro = document.querySelector("main > section");
  const endRegions = document.querySelectorAll("main .cta-panel, .site-footer");
  if (!bookingLink || !intro) return;

  const bar = document.createElement("div");
  bar.className = "booking-bar";
  bar.dataset.bookingBar = "";
  const action = document.createElement("a");
  action.className = "button booking-bar__button";
  action.href = bookingLink.href;
  action.target = "_blank";
  action.rel = "noopener";
  action.textContent = "Check Availability";
  bar.append(action);
  document.body.append(bar);

  let pastIntro = false;
  let atEnd = false;
  const sync = () => bar.classList.toggle("is-visible", pastIntro && !atEnd);

  new IntersectionObserver((entries) => {
    const entry = entries[entries.length - 1];
    pastIntro = !entry.isIntersecting && entry.boundingClientRect.bottom < 0;
    sync();
  }).observe(intro);

  const visibleEnds = new Set();
  const endObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) visibleEnds.add(entry.target);
      else visibleEnds.delete(entry.target);
    });
    atEnd = visibleEnds.size > 0;
    sync();
  });
  endRegions.forEach((region) => endObserver.observe(region));
})();

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
  let industryPreselected = false;

  if (service && serviceSelect && [...serviceSelect.options].some((option) => option.value === service)) {
    serviceSelect.value = service;
  }

  if (industry && industrySelect && [...industrySelect.options].some((option) => option.value === industry)) {
    industrySelect.value = industry;
    industryPreselected = true;
  }

  // Progressive disclosure: every project field stays in the static HTML for
  // Netlify and no-JS visitors; script only hides the ones that do not apply.
  const projectGroup = inquiryForm.querySelector("[data-project-group]");
  const projectFields = [...inquiryForm.querySelectorAll("[data-project-field]")];
  const projectStatus = inquiryForm.querySelector("[data-project-status]");
  const businessFields = ["business-name", "industry", "team-size", "deadline", "image-use"];
  const fieldsByService = {
    "Branding or lifestyle": businessFields,
    "Professional headshots": businessFields,
    "Commercial or business photography": businessFields,
    "Team or on-site headshots": businessFields,
    "Trade-show or conference headshots": businessFields,
    Event: ["business-name", "team-size", "deadline", "image-use"],
    Wedding: ["team-size"],
  };
  let hadVisibleFields = null;

  function syncProjectFields() {
    if (!projectGroup || !serviceSelect) return;
    const selected = serviceSelect.value;
    const visible = fieldsByService[selected] || (!selected && industryPreselected ? businessFields : []);

    projectFields.forEach((field) => {
      const show = visible.includes(field.dataset.projectField);
      field.hidden = !show;
      // Disabled controls leave the tab order and the submission; values are kept in the DOM.
      field.querySelectorAll("input, select, textarea").forEach((control) => {
        control.disabled = !show;
      });
    });

    const hasVisibleFields = visible.length > 0;
    projectGroup.hidden = !hasVisibleFields;
    if (projectStatus && hadVisibleFields !== null && hadVisibleFields !== hasVisibleFields) {
      projectStatus.textContent = hasVisibleFields
        ? "Additional project questions are now available."
        : "Additional project questions are hidden.";
    }
    hadVisibleFields = hasVisibleFields;
  }

  serviceSelect?.addEventListener("change", syncProjectFields);
  window.addEventListener("pageshow", syncProjectFields);
  syncProjectFields();
}

const updatesForm = document.querySelector("[data-updates-form]");

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
    window.gtag?.("event", "sign_up", { method: "newsletter" });
  } catch {
    submitButton.disabled = false;
    submitButton.textContent = defaultLabel;
    status.textContent = "We could not save your email right now. Please try again.";
  }
});

document.addEventListener("click", (event) => {
  const link = event.target.closest("a[href]");
  if (!link) return;
  const href = link.getAttribute("href");

  if (href.startsWith("tel:")) {
    window.gtag?.("event", "phone_click", { link_url: href });
  } else if (href.startsWith("mailto:")) {
    window.gtag?.("event", "email_click", { link_url: href });
  } else if (href.includes("pixieset.com/booking")) {
    window.gtag?.("event", "booking_click", { destination: href });
  }
});
