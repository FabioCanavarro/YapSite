import gsap from "gsap";

export interface ThemeColors {
  name: string;
  base: string;
  hype: string;
  calm: string;
}

export const PRESET_THEMES: Record<string, ThemeColors> = {
  mocha: { name: "Mocha Dark", base: "#1e1e2e", hype: "#cba6f7", calm: "#89b4fa" },
  macchiato: { name: "Macchiato", base: "#24273a", hype: "#f5bde6", calm: "#8aadf4" },
  frappe: { name: "Frappé", base: "#303446", hype: "#f4b8e4", calm: "#8caaee" },
  latte: { name: "Latte Light", base: "#eff1f5", hype: "#8839ef", calm: "#1e66f5" },
  cyberpunk: { name: "Neon Cyberpunk", base: "#0d0f18", hype: "#ff007f", calm: "#00f0ff" },
  emerald: { name: "Forest Emerald", base: "#0f1715", hype: "#10b981", calm: "#34d399" },
};

/**
 * Smoothly morphs theme or mood accent colors across the page with GSAP
 */
export const animateThemeChange = (
  containerElement: HTMLElement | null,
  newColor: string,
  event?: React.MouseEvent | MouseEvent
) => {
  if (!containerElement && typeof document === "undefined") return;
  const target = containerElement || document.body;

  // Set up GSAP tween for background color transition
  gsap.to(target, {
    backgroundColor: newColor,
    duration: 0.8,
    ease: "power2.inOut",
  });

  // If a mouse click event is provided, create a circular ripple reveal effect!
  if (event) {
    const ripple = document.createElement("div");
    const rect = target.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    ripple.style.position = "absolute";
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;
    ripple.style.width = "10px";
    ripple.style.height = "10px";
    ripple.style.borderRadius = "50%";
    ripple.style.backgroundColor = newColor;
    ripple.style.opacity = "0.4";
    ripple.style.pointerEvents = "none";
    ripple.style.transform = "translate(-50%, -50%)";
    ripple.style.zIndex = "9999";
    target.style.position = target.style.position || "relative";
    target.appendChild(ripple);

    const maxRadius = Math.hypot(rect.width, rect.height) * 2;

    gsap.to(ripple, {
      width: maxRadius,
      height: maxRadius,
      opacity: 0,
      duration: 1.2,
      ease: "power3.out",
      onComplete: () => {
        if (ripple.parentNode) {
          ripple.parentNode.removeChild(ripple);
        }
      },
    });
  }
};

/**
 * Smoothly transitions skeleton loaders into real content with a staggered reveal & blur-to-sharp animation.
 */
export const animateSkeletonToContent = (
  containerElement: HTMLElement | null,
  selector: string = ".gsap-card"
) => {
  if (!containerElement) return;

  const items = containerElement.querySelectorAll(selector);
  if (!items || items.length === 0) return;

  gsap.fromTo(
    items,
    {
      opacity: 0,
      y: 28,
      scale: 0.95,
      filter: "blur(10px)",
    },
    {
      opacity: 1,
      y: 0,
      scale: 1,
      filter: "blur(0px)",
      duration: 0.65,
      stagger: 0.08,
      ease: "power3.out",
      clearProps: "filter,transform",
    }
  );
};

/**
 * Smooth modal spring/elastic entrance animation
 */
export const animateModalEnter = (
  modalElement: HTMLElement | null,
  backdropElement?: HTMLElement | null
) => {
  if (!modalElement) return;

  if (backdropElement) {
    gsap.fromTo(
      backdropElement,
      { opacity: 0 },
      { opacity: 1, duration: 0.35, ease: "power2.out" }
    );
  }

  gsap.fromTo(
    modalElement,
    {
      opacity: 0,
      scale: 0.85,
      y: 40,
      rotateX: -10,
    },
    {
      opacity: 1,
      scale: 1,
      y: 0,
      rotateX: 0,
      duration: 0.55,
      ease: "back.out(1.4)",
    }
  );
};

export const animateModalOpen = animateModalEnter;

/**
 * Smooth exit animation for modals
 */
export const animateModalExit = (
  modalElement: HTMLElement | null,
  backdropElement?: HTMLElement | null,
  onComplete?: () => void
) => {
  if (!modalElement) {
    onComplete?.();
    return;
  }

  const tl = gsap.timeline({
    onComplete: () => {
      onComplete?.();
    },
  });

  if (backdropElement) {
    tl.to(backdropElement, { opacity: 0, duration: 0.25, ease: "power2.in" }, 0);
  }

  tl.to(
    modalElement,
    {
      opacity: 0,
      scale: 0.9,
      y: 20,
      duration: 0.3,
      ease: "power2.in",
    },
    0
  );
};

/**
 * Smooth hover effect for cards and floating buttons
 */
export const animateCardHover = (
  cardElement: HTMLElement | null,
  isHovered: boolean
) => {
  if (!cardElement) return;

  if (isHovered) {
    gsap.to(cardElement, {
      y: -6,
      scale: 1.02,
      boxShadow: "0 20px 30px -10px rgba(0, 0, 0, 0.4)",
      duration: 0.35,
      ease: "power2.out",
    });
  } else {
    gsap.to(cardElement, {
      y: 0,
      scale: 1,
      boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
      duration: 0.35,
      ease: "power2.out",
    });
  }
};

/**
 * Continuous subtle pulse for floating action buttons or live indicators
 */
export const startPulseAnimation = (element: HTMLElement | null) => {
  if (!element) return () => {};

  const animation = gsap.to(element, {
    scale: 1.06,
    boxShadow: "0 0 25px rgba(116, 199, 236, 0.6)",
    repeat: -1,
    yoyo: true,
    duration: 1.6,
    ease: "sine.inOut",
  });

  return () => animation.kill();
};

/**
 * Staggered cascade animation for lists or tab changes
 */
export const animateStaggerList = (
  containerElement: HTMLElement | null,
  childSelector: string = ".gsap-item"
) => {
  if (!containerElement) return;

  const items = containerElement.querySelectorAll(childSelector);
  if (!items || items.length === 0) return;

  gsap.fromTo(
    items,
    {
      opacity: 0,
      y: 20,
      scale: 0.96,
    },
    {
      opacity: 1,
      y: 0,
      scale: 1,
      duration: 0.45,
      stagger: 0.05,
      ease: "power2.out",
    }
  );
};
