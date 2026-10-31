/* Pocket Party — ambient canvas + scroll drift + card spotlight (v2).
   Plain rAF, no dependencies. Fully skipped under prefers-reduced-motion.
   Scope: DOM shell only — canvas games are untouched. */
(() => {
    "use strict";

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // — cursor spotlight on game cards (delegated, no per-card listeners) —
    const grid = document.querySelector(".games");
    if (grid) {
        grid.addEventListener("pointermove", (event) => {
            const card = event.target.closest(".game");
            if (!card) return;
            const rect = card.getBoundingClientRect();
            card.style.setProperty("--mx", `${(((event.clientX - rect.left) / rect.width) * 100).toFixed(2)}%`);
            card.style.setProperty("--my", `${(((event.clientY - rect.top) / rect.height) * 100).toFixed(2)}%`);
        });
    }

    // — scroll drift: intro rises, grid sinks, lerped for fluidity —
    const intro = document.querySelector(".intro");
    const gamesGrid = document.querySelector(".games");
    let target = window.scrollY;
    let current = target;
    let ticking = false;
    const step = () => {
        ticking = false;
        current += (target - current) * 0.12;
        if (intro) intro.style.transform = `translate3d(0, ${(-current * 0.07).toFixed(2)}px, 0)`;
        if (gamesGrid) gamesGrid.style.transform = `translate3d(0, ${(current * 0.025).toFixed(2)}px, 0)`;
        if (Math.abs(target - current) > 0.4) requestAnimationFrame(step);
    };
    window.addEventListener("scroll", () => {
        target = window.scrollY;
        if (!ticking) {
            ticking = true;
            requestAnimationFrame(step);
        }
    }, { passive: true });

    // — party canvas: drifting confetti + twinkles on a transparent layer —
    const canvas = document.querySelector(".party-canvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const COLORS = ["#ffe66d", "#7dffb2", "#bd9cff", "#ff9a80", "#7ddcff", "#ffb03f"];
    let w = 0;
    let h = 0;
    let dpr = 1;
    let frameId = 0;
    let pieces = [];
    let stars = [];

    const seed = () => {
        const count = Math.min(70, Math.round((w * h) / 26000));
        pieces = Array.from({ length: count }, () => ({
            x: Math.random() * w,
            y: Math.random() * h,
            w: 4 + Math.random() * 6,
            h: 2.5 + Math.random() * 4,
            color: COLORS[(Math.random() * COLORS.length) | 0],
            vy: 0.15 + Math.random() * 0.45,
            vx: -0.08 + Math.random() * 0.16,
            rot: Math.random() * Math.PI * 2,
            vr: (-0.5 + Math.random()) * 0.02,
            round: Math.random() < 0.35,
        }));
        stars = Array.from({ length: Math.round(count * 0.5) }, () => ({
            x: Math.random() * w,
            y: Math.random() * h,
            r: 0.7 + Math.random() * 1.3,
            phase: Math.random() * Math.PI * 2,
            speed: 0.6 + Math.random() * 1.6,
        }));
    };

    const resize = () => {
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        w = window.innerWidth;
        h = window.innerHeight;
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        seed();
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = (t) => {
        frameId = requestAnimationFrame(draw);
        const time = t / 1000;
        ctx.clearRect(0, 0, w, h);

        // Twinkles first (behind the confetti).
        for (const s of stars) {
            const a = 0.08 + 0.22 * Math.abs(Math.sin(time * s.speed + s.phase));
            ctx.globalAlpha = a;
            ctx.fillStyle = "#fff1bc";
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
            ctx.fill();
        }

        // Confetti — slow tumble, gentle sway, fully saturated fills.
        for (const p of pieces) {
            p.y += p.vy;
            p.x += p.vx + Math.sin(time * 0.8 + p.rot) * 0.18;
            p.rot += p.vr;
            if (p.y > h + 12) {
                p.y = -12;
                p.x = Math.random() * w;
            }
            if (p.x < -12) p.x = w + 12;
            else if (p.x > w + 12) p.x = -12;
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot);
            ctx.globalAlpha = 0.9;
            ctx.fillStyle = p.color;
            if (p.round) {
                ctx.beginPath();
                ctx.arc(0, 0, p.h, 0, Math.PI * 2);
                ctx.fill();
            } else {
                ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
            }
            ctx.restore();
        }
        ctx.globalAlpha = 1;
    };
    frameId = requestAnimationFrame(draw);
})();
