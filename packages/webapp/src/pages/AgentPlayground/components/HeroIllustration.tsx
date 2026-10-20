import { useEffect, useId, useRef } from 'react';

import { GithubLogo } from '@/assets/GithubLogo';
import { LogoInverted } from '@/assets/LogoInverted';

const WIDTH = 376;
const HEIGHT = 118;
const CENTER = { x: 188, y: 72 };
const TILE_SIZE = 38;
const LOGO_SIZE = 18;
// Template logos draw their artwork in the middle 44px of a 62px canvas.
const TEMPLATE_LOGO_SIZE = (LOGO_SIZE * 62) / 44;

const TILES = [
    { provider: 'slack', x: -99, y: -53, path: 'M -24 -28 C -40 -44, -56 -53, -80 -53' },
    { provider: 'github', x: 94, y: -53, path: 'M 24 -28 C 40 -44, 54 -53, 75 -53' },
    { provider: 'google-calendar', x: -169, y: 26, path: 'M -28 8 C -80 6, -118 12, -150 28' },
    { provider: 'linear', x: 169, y: 26, path: 'M 28 8 C 80 6, 118 12, 150 28' }
];
const DOT_ORDER = ['slack', 'linear', 'github', 'google-calendar'];

const TIMING = {
    tileStagger: 90,
    tileDur: 450,
    markIn: 150,
    markDur: 400,
    boxIn: 700,
    boxDur: 500,
    glowDur: 900,
    linesIn: 1150,
    lineDur: 700,
    lineStagger: 80,
    dotsStart: 1900,
    travel: 1100,
    gap: 450,
    pause: 600,
    flashDur: 900,
    trailLen: 26
};
const CYCLE = DOT_ORDER.length * TIMING.gap + TIMING.travel + TIMING.pause;
const EASE = 'cubic-bezier(.2,.8,.2,1)';
const glowAt = (percent: number) => `color-mix(in srgb, var(--hero-glow) ${percent}%, transparent)`;
const GLOW_GRADIENT = `radial-gradient(closest-side, var(--hero-glow), ${glowAt(80)} 20%, ${glowAt(50)} 42%, ${glowAt(22)} 64%, ${glowAt(6)} 84%, transparent)`;

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

export const HeroIllustration: React.FC = () => {
    const rootRef = useRef<HTMLDivElement>(null);
    const maskId = useId().replace(/[^\w-]/g, '');

    useEffect(() => {
        const root = rootRef.current;
        if (!root || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            return;
        }
        const part = <T extends Element>(name: string) => root.querySelector<T>(`[data-part="${name}"]`);
        const markLit = part<HTMLElement>('mark-lit');
        const mark = part<HTMLElement>('mark');
        const box = part<HTMLElement>('box');
        const glow = part<HTMLElement>('glow');
        if (!markLit || !mark || !box || !glow) {
            return;
        }

        const anims: Animation[] = [];
        const play = (el: Element, keyframes: Keyframe[], options: KeyframeAnimationOptions) => {
            anims.push(el.animate(keyframes, { fill: 'both', easing: EASE, ...options }));
        };

        const routes = new Map<string, { line: SVGPathElement; trail: SVGPathElement; dot: SVGCircleElement; flash: HTMLElement; length: number }>();
        TILES.forEach(({ provider }, i) => {
            const tile = part<HTMLElement>(`tile-${provider}`);
            const flash = part<HTMLElement>(`flash-${provider}`);
            const line = part<SVGPathElement>(`line-${provider}`);
            const reveal = part<SVGPathElement>(`reveal-${provider}`);
            const trail = part<SVGPathElement>(`trail-${provider}`);
            const dot = part<SVGCircleElement>(`dot-${provider}`);
            if (!tile || !flash || !line || !reveal || !trail || !dot) {
                return;
            }
            const length = line.getTotalLength();
            trail.style.strokeDasharray = `${TIMING.trailLen} ${length + TIMING.trailLen}`;
            routes.set(provider, { line, trail, dot, flash, length });

            play(
                tile,
                [
                    { opacity: 0, transform: 'translateY(4px) scale(.92)' },
                    { opacity: 1, transform: 'none' }
                ],
                {
                    duration: TIMING.tileDur,
                    delay: i * TIMING.tileStagger
                }
            );
            play(reveal, [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], {
                duration: TIMING.lineDur,
                delay: TIMING.linesIn + i * TIMING.lineStagger,
                easing: 'cubic-bezier(.4,0,.2,1)'
            });
        });

        play(
            mark,
            [
                { opacity: 0, transform: 'scale(.8)' },
                { opacity: 1, transform: 'none' }
            ],
            { duration: TIMING.markDur, delay: TIMING.markIn }
        );
        play(
            box,
            [
                { opacity: 0, scale: '.5' },
                { opacity: 1, scale: '1' }
            ],
            { duration: TIMING.boxDur, delay: TIMING.boxIn }
        );
        play(markLit, [{ opacity: 0 }, { opacity: 1 }], { duration: TIMING.boxDur, delay: TIMING.boxIn });
        play(
            glow,
            [
                { opacity: 0, transform: 'scale(.6)' },
                { opacity: 1, transform: 'none' }
            ],
            { duration: TIMING.glowDur, delay: TIMING.boxIn + 200 }
        );
        // No backwards fill: during its delay it would hold the glow at full opacity over the fade-in above.
        play(glow, [{ opacity: 1 }, { opacity: 0.65 }, { opacity: 1 }], {
            duration: CYCLE,
            delay: TIMING.dotsStart,
            iterations: Infinity,
            easing: 'ease-in-out',
            fill: 'forwards'
        });

        const flashedRound = new Map<string, number>();
        let elapsed = 0;
        let last: number | null = null;
        let frame = 0;
        const tick = (now: number) => {
            if (last !== null) {
                elapsed += now - last;
            }
            last = now;
            const t = elapsed - TIMING.dotsStart;
            if (t >= 0) {
                const round = Math.floor(t / CYCLE);
                DOT_ORDER.forEach((provider, i) => {
                    const route = routes.get(provider);
                    if (!route) {
                        return;
                    }
                    const progress = ((t % CYCLE) - i * TIMING.gap) / TIMING.travel;
                    if (progress < 0 || progress > 1) {
                        route.dot.style.opacity = '0';
                        route.trail.style.opacity = '0';
                        return;
                    }
                    const distance = easeInOut(progress) * route.length;
                    const point = route.line.getPointAtLength(distance);
                    const fade = Math.min(1, progress * 8, (1 - progress) * 8);
                    route.dot.setAttribute('cx', String(point.x));
                    route.dot.setAttribute('cy', String(point.y));
                    route.dot.style.opacity = String(fade);
                    route.trail.style.opacity = String(fade * 0.7);
                    route.trail.style.strokeDashoffset = String(TIMING.trailLen - distance);
                    if (progress > 0.96 && flashedRound.get(provider) !== round) {
                        flashedRound.set(provider, round);
                        route.flash.animate([{ opacity: 1 }, { opacity: 0 }], { duration: TIMING.flashDur, easing: 'ease-out' });
                    }
                });
            }
            frame = requestAnimationFrame(tick);
        };

        let onScreen = true;
        let running = true;
        frame = requestAnimationFrame(tick);
        const paused: Animation[] = [];
        const update = () => {
            const shouldRun = onScreen && !document.hidden;
            if (shouldRun === running) {
                return;
            }
            running = shouldRun;
            if (running) {
                paused.splice(0).forEach((a) => a.play());
                frame = requestAnimationFrame(tick);
            } else {
                // Pausing a finished animation would make play() rewind it and replay the intro.
                paused.push(...anims.filter((a) => a.playState === 'running'));
                paused.forEach((a) => a.pause());
                cancelAnimationFrame(frame);
                last = null;
            }
        };
        const observer = new IntersectionObserver(([entry]) => {
            onScreen = entry?.isIntersecting ?? true;
            update();
        });
        observer.observe(root);
        document.addEventListener('visibilitychange', update);
        update();

        return () => {
            cancelAnimationFrame(frame);
            observer.disconnect();
            document.removeEventListener('visibilitychange', update);
            anims.forEach((a) => a.cancel());
        };
    }, []);

    return (
        <div
            ref={rootRef}
            aria-hidden
            className="pointer-events-none relative shrink-0 [--hero-accent:var(--color-icon-brand)] [--hero-glow:color-mix(in_srgb,var(--hero-accent)_16%,transparent)] [--hero-line:var(--color-border-default)] dark:[--hero-glow:color-mix(in_srgb,var(--hero-accent)_18%,transparent)] dark:[--hero-line:color-mix(in_srgb,var(--hero-accent)_35%,transparent)]"
            style={{ width: WIDTH, height: HEIGHT }}
        >
            <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="absolute inset-0 size-full overflow-visible">
                <g transform={`translate(${CENTER.x} ${CENTER.y})`}>
                    {TILES.map(({ provider, path }) => (
                        <g key={provider}>
                            <mask id={`${maskId}-${provider}`} maskUnits="userSpaceOnUse" x={-CENTER.x} y={-CENTER.y} width={WIDTH} height={HEIGHT}>
                                <path
                                    data-part={`reveal-${provider}`}
                                    d={path}
                                    pathLength={1}
                                    fill="none"
                                    stroke="white"
                                    strokeWidth={4}
                                    strokeDasharray={1}
                                    className="motion-safe:[stroke-dashoffset:1]"
                                />
                            </mask>
                            <path
                                data-part={`line-${provider}`}
                                d={path}
                                mask={`url(#${maskId}-${provider})`}
                                fill="none"
                                strokeWidth={1}
                                strokeDasharray="3 3"
                                className="stroke-(--hero-line)"
                            />
                            <path
                                data-part={`trail-${provider}`}
                                d={path}
                                fill="none"
                                strokeWidth={1.5}
                                strokeLinecap="round"
                                className="stroke-(--hero-accent) opacity-0"
                            />
                            <circle data-part={`dot-${provider}`} r={2.5} className="fill-(--hero-accent) opacity-0 drop-shadow-[0_0_3px_var(--hero-accent)]" />
                        </g>
                    ))}
                </g>
            </svg>

            {TILES.map(({ provider, x, y }) => (
                <div
                    key={provider}
                    data-part={`tile-${provider}`}
                    className="absolute grid place-items-center rounded-ds-sm border border-border-default bg-surface-panel motion-safe:opacity-0"
                    style={{ left: CENTER.x + x - TILE_SIZE / 2, top: CENTER.y + y - TILE_SIZE / 2, width: TILE_SIZE, height: TILE_SIZE }}
                >
                    {provider === 'github' ? (
                        <GithubLogo width={TEMPLATE_LOGO_SIZE} height={TEMPLATE_LOGO_SIZE} className="text-text-strong" />
                    ) : (
                        <img src={`/images/template-logos/${provider}.svg`} alt="" width={TEMPLATE_LOGO_SIZE} height={TEMPLATE_LOGO_SIZE} />
                    )}
                    <div
                        data-part={`flash-${provider}`}
                        className="absolute -inset-px rounded-[inherit] border border-(--hero-accent) opacity-0 shadow-[0_0_12px_var(--hero-glow)]"
                    />
                </div>
            ))}

            <div className="absolute size-14" style={{ left: CENTER.x - 28, top: CENTER.y - 28 }}>
                <div data-part="glow" className="absolute -inset-16 rounded-full motion-safe:opacity-0" style={{ background: GLOW_GRADIENT }} />
                <div
                    data-part="box"
                    className="absolute inset-0 rounded-ds-md border border-[color-mix(in_srgb,var(--hero-accent)_40%,white)] bg-white motion-safe:scale-50 motion-safe:opacity-0 dark:border-[color-mix(in_srgb,var(--hero-accent)_55%,black)] dark:bg-black"
                />
                <div data-part="mark" className="absolute inset-3.5 motion-safe:opacity-0">
                    <LogoInverted className="absolute inset-0 size-full text-text-strong" />
                    <LogoInverted data-part="mark-lit" className="absolute inset-0 hidden size-full text-white motion-safe:opacity-0 dark:block" />
                </div>
            </div>
        </div>
    );
};
