/* Pocket Party — hub motion enhancements.
   Uses the vendored Motion bundle (motion.dev, MIT) in ./motion-kit.js.
   Scope: DOM shell only (header, intro, game cards, bottom note, footer
   share button). Canvas games are untouched.
   Initial hidden states are set FROM JS, never in CSS, so the page stays
   fully visible if this module fails to load. All motion is skipped when
   the user prefers reduced motion. */
import { animate, inView, stagger } from "./motion-kit.js";

(() => {
    "use strict";

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduceMotion.matches) return; // hard off: static, complete page

    const spring = { type: "spring", bounce: 0.25, duration: 0.6 };
    const hoverSpring = { type: "spring", bounce: 0.4, duration: 0.4 };
    const pressSpring = { type: "spring", bounce: 0.35, duration: 0.3 };
    const rise = { opacity: [0, 1], transform: ["translateY(18px)", "translateY(0px)"] };

    const settled = []; // elements given a JS-only hidden start state
    const hold = (el, from) => {
        el.style.opacity = "0";
        el.style.transform = from || "translateY(18px)";
        settled.push(el);
    };
    const releaseAll = () => {
        for (const el of settled) {
            el.style.opacity = "";
            el.style.transform = "";
        }
        settled.length = 0;
    };

    const brand = document.querySelector(".brand");
    const headerNote = document.querySelector(".header-note");
    const introCopy = document.querySelector(".intro > div");
    const sticker = document.querySelector(".party-sticker");
    const cards = Array.from(document.querySelectorAll(".game"));
    const bottomNote = document.querySelector(".bottom-note");
    const footer = document.querySelector("footer");
    const shareButton = document.getElementById("share-party");

    // The sticker keeps a permanent rotate(13deg); preserve it in every transform.
    const STICKER_ROT = " rotate(13deg)";

    try {
        // --- initial hidden states, set from JS only ---
        if (brand) hold(brand);
        if (headerNote) hold(headerNote);
        if (introCopy) hold(introCopy);
        if (sticker) hold(sticker, "translateY(18px)" + STICKER_ROT);
        for (const card of cards) hold(card);
        if (bottomNote) hold(bottomNote);
        if (footer) hold(footer);

        // --- header + intro: quick spring stagger on load ---
        const lead = [brand, headerNote].filter(Boolean);
        if (lead.length) animate(lead, rise, { ...spring, delay: stagger(0.08) });
        if (introCopy) animate(introCopy, rise, { ...spring, delay: 0.12 });
        if (sticker) {
            animate(
                sticker,
                { opacity: [0, 1], transform: ["translateY(18px)" + STICKER_ROT, "translateY(0px)" + STICKER_ROT] },
                { ...spring, delay: 0.2 }
            );
        }

        // --- game cards: stagger the ones on screen, reveal the rest on scroll ---
        const viewH = window.innerHeight || document.documentElement.clientHeight;
        const visibleNow = cards.filter((card) => card.getBoundingClientRect().top < viewH);
        const revealLater = cards.filter((card) => !visibleNow.includes(card));
        if (visibleNow.length) {
            animate(visibleNow, rise, { ...spring, delay: stagger(0.07, { startDelay: 0.28 }) });
        }
        const canObserve = typeof IntersectionObserver === "function";
        if (revealLater.length) {
            if (canObserve) {
                inView(revealLater, (el) => animate(el, rise, spring), { amount: 0.18 });
            } else {
                animate(revealLater, rise, { ...spring, delay: stagger(0.07, { startDelay: 0.4 }) });
            }
        }

        // --- bottom note + footer: gentle scroll reveal ---
        const tail = [bottomNote, footer].filter(Boolean);
        if (tail.length) {
            if (canObserve) {
                inView(tail, (el) => animate(el, rise, spring), { amount: 0.25 });
            } else {
                animate(tail, rise, { ...spring, delay: stagger(0.09, { startDelay: 0.5 }) });
            }
        }

        // --- hover lift + press springs (cards, share button) ---
        // Motion's vanilla animate() only animates explicit transform strings
        // on plain elements, so hover/press targets are composed from state.
        const live = () => !reduceMotion.matches;
        const cardPose = (s) => "translateY(" + (s.hover ? "-7px" : "0px") + ")" + (s.pressed ? " scale(0.985)" : "");
        const buttonPose = (s) => "translateY(" + (s.hover ? "-2px" : "0px") + ") scale(" + (s.pressed ? "0.96" : "1") + ")";
        const bindHoverPress = (el, pose, pressScale) => {
            const state = { hover: false, pressed: false };
            const render = () => animate(el, { transform: pose(state) }, state.pressed ? pressSpring : hoverSpring);
            el.addEventListener("pointerenter", () => {
                if (!live()) return;
                state.hover = true;
                render();
            });
            el.addEventListener("pointerleave", () => {
                if (!live()) return;
                state.hover = false;
                state.pressed = false;
                render();
            });
            el.addEventListener("pointerdown", () => {
                if (!live()) return;
                state.pressed = true;
                render();
            });
            const unpress = () => {
                if (!live()) return;
                state.pressed = false;
                render();
            };
            el.addEventListener("pointerup", unpress);
            el.addEventListener("pointercancel", unpress);
        };
        for (const card of cards) {
            bindHoverPress(card, cardPose);
            const icon = card.querySelector(".play-icon");
            if (icon) {
                card.addEventListener("pointerenter", () => {
                    if (!live()) return;
                    animate(icon, { transform: ["scale(1)", "scale(1.15)", "scale(1)"] }, { duration: 0.45, ease: "easeOut" });
                });
            }
        }
        if (shareButton) bindHoverPress(shareButton, buttonPose);
    } catch (err) {
        releaseAll(); // never leave content hidden if Motion misbehaves
    }
})();
