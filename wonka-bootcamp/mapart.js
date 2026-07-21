/* ============================================================
   WONKA FACTORY MAP . mapart.js (Track A: painted map + live layer)
   One AI-rendered island painting as the world, with a fully
   interactive DOM layer on top: hotspots per day, hover cards,
   lock/seal/current badges, and the portal's animated 2D Wonka
   walking an authored path over the painted road.
   Contract: export mount(container, api, opts) -> controller,
   identical to map3d.js, so index3d.html cannot tell them apart.
   ============================================================ */

/* ---------- the painted world ---------- */
const MAP_IMG = 'map-art/map-final.webp';
// Exported so index.html can prove the browser actually got the engine it asked
// for: its MAP_ENGINE_V is the ?v= cache key and must match this string.
export const BUILD = 'art-2026-07-21-e';
// diagnostic breadcrumbs, shown by the ?diag panel and kept on window for support
const diagLog = (m) => {
  (window.__mapartLog = window.__mapartLog || []).push(m);
};

/* Normalized image coordinates [0..1] authored against MAP_IMG.
   HOTSPOTS: clickable circle per day. PATH: polyline along the
   painted road, entrance first, elevator last. Re-author these
   whenever the artwork is regenerated. */
const HOTSPOTS = {
  1: [0.115, 0.850, 0.070],
  2: [0.075, 0.600, 0.062],
  3: [0.090, 0.400, 0.062],
  4: [0.150, 0.195, 0.062],
  5: [0.345, 0.155, 0.068],
  6: [0.663, 0.168, 0.062],
  7: [0.855, 0.285, 0.062],
  8: [0.845, 0.500, 0.062],
  9: [0.828, 0.655, 0.062],
  10: [0.832, 0.840, 0.068],
};
/* Where each day's DOORSTEP sits ON the path . the point you ARRIVE at, which
   is down-tour from the building's centre. Read off a t-ruler rendered along
   the path and aligned with Jay's own drawn entrance marks (18.7). Do NOT go
   back to projecting the building centre: the buildings sit 170-290px off the
   road and their projections cluster and mis-order (days 2 and 3 once landed
   0.01 apart, so the card announced the wrong day). Arc gaps here are 150px+,
   comfortably clear of the 92px proximity window. */
const DOORS = {
  1: [0.2955, 0.9164],
  2: [0.2526, 0.7035],
  3: [0.2209, 0.4851],
  4: [0.2610, 0.2639],
  5: [0.3799, 0.2378],
  6: [0.6465, 0.3505],
  7: [0.7161, 0.3868],
  8: [0.7023, 0.5286],
  9: [0.6684, 0.6685],
  10: [0.6889, 0.8354],
};

const PATH = [
  [0.5060, 0.9820], [0.4900, 0.9760], [0.4740, 0.9690], [0.4590, 0.9610],
  [0.4450, 0.9520], [0.4320, 0.9430], [0.4190, 0.9330], [0.4060, 0.9230],
  [0.3930, 0.9150], [0.3780, 0.9100], [0.3610, 0.9060], [0.3440, 0.9030],
  [0.3290, 0.9000], [0.3170, 0.8950], [0.3070, 0.8870], [0.3010, 0.8780],
  [0.2980, 0.8685], [0.2918, 0.8521], [0.2749, 0.8356], [0.2677, 0.8295],
  [0.2609, 0.8246], [0.2534, 0.8169], [0.2434, 0.8010], [0.2329, 0.7802],
  [0.2259, 0.7643], [0.2230, 0.7567], [0.2227, 0.7521], [0.2258, 0.7462],
  [0.2353, 0.7310], [0.2505, 0.7071], [0.2638, 0.6847], [0.2701, 0.6727],
  [0.2714, 0.6691], [0.2705, 0.6638], [0.2683, 0.6578], [0.2616, 0.6445],
  [0.2508, 0.6265], [0.2401, 0.6116], [0.2317, 0.6022], [0.2251, 0.5959],
  [0.2181, 0.5889], [0.2085, 0.5759], [0.1973, 0.5580], [0.1899, 0.5446],
  [0.1877, 0.5396], [0.1885, 0.5351], [0.1918, 0.5254], [0.1966, 0.5118],
  [0.2012, 0.5020], [0.2081, 0.4951], [0.2189, 0.4866], [0.2295, 0.4783],
  [0.2379, 0.4724], [0.2457, 0.4678], [0.2538, 0.4630], [0.2618, 0.4580],
  [0.2705, 0.4514], [0.2818, 0.4398], [0.2935, 0.4255], [0.3005, 0.4155],
  [0.3017, 0.4111], [0.3010, 0.4055], [0.2951, 0.3942], [0.2851, 0.3770],
  [0.2748, 0.3621], [0.2668, 0.3528], [0.2595, 0.3445], [0.2506, 0.3326],
  [0.2418, 0.3194], [0.2368, 0.3113], [0.2359, 0.3078], [0.2365, 0.3036],
  [0.2420, 0.2924], [0.2519, 0.2756], [0.2624, 0.2621], [0.2710, 0.2550],
  [0.2786, 0.2510], [0.2858, 0.2480], [0.2925, 0.2462], [0.3002, 0.2453],
  [0.3105, 0.2450], [0.3218, 0.2446], [0.3333, 0.2433], [0.3435, 0.2416],
  [0.3494, 0.2405], [0.3524, 0.2404], [0.3583, 0.2406], [0.3684, 0.2401],
  [0.3785, 0.2381], [0.3859, 0.2368], [0.3960, 0.2400], [0.4076, 0.2383],
  [0.4212, 0.2422], [0.4368, 0.2520], [0.4360, 0.2629], [0.4245, 0.2783],
  [0.4095, 0.2871], [0.3932, 0.3047], [0.3887, 0.3105], [0.3874, 0.3180],
  [0.3913, 0.3300], [0.3997, 0.3410], [0.4062, 0.3457], [0.4264, 0.3496],
  [0.4400, 0.3600], [0.4520, 0.3720], [0.4700, 0.3706], [0.4880, 0.3680],
  [0.5060, 0.3650], [0.5240, 0.3624], [0.5420, 0.3610], [0.5600, 0.3620],
  [0.5760, 0.3650], [0.5880, 0.3690], [0.6040, 0.3692], [0.6180, 0.3688],
  [0.6290, 0.3652], [0.6385, 0.3585], [0.6465, 0.3505], [0.6520, 0.3430],
  [0.6545, 0.3375], [0.6615, 0.3379], [0.6764, 0.3477], [0.6934, 0.3574],
  [0.7070, 0.3672], [0.7122, 0.3770], [0.7161, 0.3867], [0.7148, 0.3965],
  [0.7096, 0.4062], [0.7038, 0.4160], [0.6953, 0.4258], [0.6913, 0.4353],
  [0.6823, 0.4521], [0.6776, 0.4621], [0.6764, 0.4669], [0.6815, 0.4799],
  [0.6905, 0.5010], [0.7000, 0.5232], [0.7052, 0.5352], [0.7051, 0.5393],
  [0.7031, 0.5441], [0.6939, 0.5582], [0.6791, 0.5792], [0.6649, 0.6003],
  [0.6560, 0.6163], [0.6521, 0.6249], [0.6511, 0.6286], [0.6533, 0.6370],
  [0.6595, 0.6514], [0.6693, 0.6703], [0.6788, 0.6853], [0.6866, 0.6945],
  [0.6946, 0.7040], [0.7045, 0.7182], [0.7138, 0.7334], [0.7189, 0.7423],
  [0.7199, 0.7460], [0.7193, 0.7517], [0.7179, 0.7618], [0.7156, 0.7738],
  [0.7125, 0.7859], [0.7087, 0.7979], [0.7043, 0.8093], [0.6992, 0.8196],
  [0.6935, 0.8289], [0.6875, 0.8375], [0.6819, 0.8458], [0.6774, 0.8528],
  [0.6750, 0.8589], [0.6752, 0.8685], [0.6769, 0.8828], [0.6772, 0.8955],
  [0.6759, 0.9067], [0.6780, 0.9200], [0.6860, 0.9340], [0.6980, 0.9440],
  [0.7120, 0.9550], [0.7240, 0.9640],
];

const SPRITE_SVG =
  '<svg viewBox="0 0 40 60" xmlns="http://www.w3.org/2000/svg">' +
  '<g class="wc-cane"><line x1="29" y1="31" x2="34" y2="56" stroke="#B87333" stroke-width="2.2" stroke-linecap="round"/><circle cx="29" cy="30" r="2.4" fill="#D99A5B"/></g>' +
  '<g class="wc-leg-l"><rect x="15.4" y="42" width="4" height="13" rx="2" fill="#100818"/><ellipse cx="16.6" cy="55.6" rx="3.4" ry="1.8" fill="#0B0511"/></g>' +
  '<g class="wc-leg-r"><rect x="20.6" y="42" width="4" height="13" rx="2" fill="#170D20"/><ellipse cx="23.4" cy="55.6" rx="3.4" ry="1.8" fill="#0F0716"/></g>' +
  '<path d="M13 26 Q20 23 27 26 L28.5 40 Q26 43.5 24 40.5 L23.5 44 H16.5 L16 40.5 Q14 43.5 11.5 40 Z" fill="#3d1f57"/>' +
  '<path d="M13 26 Q20 23 27 26 L26.6 30 Q20 27.5 13.4 30 Z" fill="#2b1440"/>' +
  '<circle cx="20" cy="31.5" r=".8" fill="#D99A5B"/><circle cx="20" cy="35.5" r=".8" fill="#D99A5B"/>' +
  '<path d="M18.2 25.4 L20 26.4 L21.8 25.4 L21.8 27.4 L20 26.7 L18.2 27.4 Z" fill="#E8D9BC"/>' +
  '<circle cx="20" cy="20.5" r="5" fill="#E4D5B8"/>' +
  '<g class="wc-hat"><ellipse cx="20" cy="14.6" rx="9.5" ry="2.4" fill="#0F0716"/><rect x="13.8" y="2" width="12.4" height="13" rx="2.4" fill="#170D20"/><rect x="13.8" y="11.4" width="12.4" height="2.4" fill="#B87333"/></g>' +
  '</svg>';

const LOCK_SVG =
  '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">' +
  '<path d="M7 10 V7 a5 5 0 0 1 10 0 v3" fill="none" stroke="#d8dde4" stroke-width="2.4"/>' +
  '<rect x="5" y="10" width="14" height="11" rx="2.4" fill="#aab2bd"/>' +
  '<circle cx="12" cy="15" r="1.7" fill="#3a2110"/><rect x="11.2" y="15" width="1.6" height="3.4" rx="0.8" fill="#3a2110"/>' +
  '</svg>';

const SEAL_SVG =
  '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">' +
  '<circle cx="12" cy="12" r="11" fill="#F5B841"/>' +
  '<circle cx="12" cy="12" r="8.4" fill="none" stroke="#8A5424" stroke-width="1.6"/>' +
  '<text x="12" y="16.4" text-anchor="middle" font-family="Georgia,serif" font-weight="900" font-size="12" fill="#8A5424">W</text>' +
  '</svg>';

const CSS = `
.ma-backdrop{position:absolute;inset:0;background:
  radial-gradient(120% 90% at 50% 24%, #241028 0%, #170C1C 40%, #0C0512 72%, #060209 100%);}
.ma-img{position:absolute;left:0;top:0;user-select:none;-webkit-user-drag:none;pointer-events:none;
  filter:saturate(1.02);opacity:0;transition:opacity 1.1s ease}
.ma-img.m3d-in{opacity:1}
.ma-layer{position:absolute;left:0;top:0;transform-origin:0 0;transition:opacity 620ms ease}
.ma-hot{position:absolute;transform:translate(-50%,-50%);border-radius:50%;cursor:pointer;pointer-events:auto}
.ma-hot .ring{position:absolute;inset:8%;border-radius:50%;border:3px solid rgba(245,184,65,0);
  box-shadow:0 0 0 0 rgba(245,184,65,0);transition:border-color .25s ease, box-shadow .25s ease}
.ma-hot:hover .ring{border-color:rgba(245,184,65,.9);box-shadow:0 0 22px 4px rgba(245,184,65,.35)}
/* the current room is called out by the "You are here" pin instead . the old
   pulsing gold ring shouted over the painting (Jay) */
.ma-hot.current .ring{border-color:rgba(245,184,65,.28)}
@keyframes maPulse{0%,100%{box-shadow:0 0 8px 2px rgba(245,184,65,.25)}50%{box-shadow:0 0 26px 7px rgba(245,184,65,.5)}}
/* mall-map style marker: a small cream sign on a stem, pointing at the room */
.ma-here{position:absolute;pointer-events:none;z-index:7;opacity:0;
  transform:translate(-50%,-100%);transition:opacity .5s ease;will-change:transform}
.ma-here.on{opacity:1;animation:maHereBob 3.4s ease-in-out infinite}
@keyframes maHereBob{0%,100%{margin-top:0}50%{margin-top:-5px}}
.ma-here .hz-sign{
  background:linear-gradient(180deg,#FAF1DC,#F0DFB8);color:#3A2312;
  border:1.5px solid #8A5424;border-radius:8px;
  padding:5px 10px 5px;white-space:nowrap;
  font-family:var(--font-mono,monospace);font-size:9px;letter-spacing:.2em;text-transform:uppercase;
  box-shadow:0 4px 12px rgba(0,0,0,.55), inset 0 0 0 1.5px rgba(184,115,51,.3);
}
.ma-here .hz-stem{width:2px;height:12px;margin:0 auto;background:linear-gradient(180deg,#8A5424,#B87333)}
.ma-here .hz-tip{width:0;height:0;margin:0 auto;
  border-left:6px solid transparent;border-right:6px solid transparent;border-top:8px solid #B87333;
  filter:drop-shadow(0 2px 3px rgba(0,0,0,.5))}
.ma-badge{position:absolute;transform:translate(-50%,-50%);pointer-events:none;
  filter:drop-shadow(0 3px 6px rgba(0,0,0,.4))}
.ma-badge svg{width:100%;height:100%;display:block}
.ma-badge.shake{animation:maShake .45s ease}
@keyframes maShake{0%,100%{transform:translate(-50%,-50%) rotate(0)}25%{transform:translate(-50%,-50%) rotate(-9deg)}55%{transform:translate(-50%,-50%) rotate(8deg)}80%{transform:translate(-50%,-50%) rotate(-4deg)}}
.ma-wonka{position:absolute;pointer-events:none;z-index:6;will-change:transform;
  filter:drop-shadow(0 3px 7px rgba(0,0,0,.5));opacity:0;transition:opacity .5s ease}
.ma-wonka.show{opacity:1}
.ma-wonka .wc-flip{width:100%;height:100%;transition:transform .25s ease}
.ma-wonka .wc-bob{width:100%;height:100%}
.ma-wonka svg{width:100%;height:100%;display:block;overflow:visible}
.ma-wonka .wc-leg-l,.ma-wonka .wc-leg-r,.ma-wonka .wc-cane,.ma-wonka .wc-hat{transform-box:fill-box}
.ma-wonka .wc-leg-l,.ma-wonka .wc-leg-r{transform-origin:50% 6%}
.ma-wonka .wc-cane{transform-origin:18% 8%}
.ma-wonka .wc-hat{transform-origin:22% 88%}
.ma-wonka.walking .wc-bob{animation:wcWalkBob .42s ease-in-out infinite}
.ma-wonka.walking .wc-leg-l{animation:wcStep .42s ease-in-out infinite}
.ma-wonka.walking .wc-leg-r{animation:wcStep .42s ease-in-out infinite;animation-delay:-.21s}
.ma-wonka.walking .wc-cane{animation:wcCane .42s ease-in-out infinite}
.ma-wonka.idle .wc-bob{animation:wcIdle 2.6s ease-in-out infinite}
.ma-wonka.idle .wc-hat{animation:wcHatTip 7s ease-in-out infinite}
/* 3D figurine skin (map-art/wonka3d.png). When it loads, .fig replaces the SVG
   and the walk becomes a game-piece bob + lean instead of leg keyframes. */
.ma-wonka .wc-bob{transform-origin:50% 92%}
.ma-wonka .ma-wfig{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;object-position:bottom}
.ma-wonka .ma-wshadow{position:absolute;left:20%;right:20%;bottom:-1%;height:6%;border-radius:50%;
  background:radial-gradient(50% 50% at 50% 50%, rgba(6,2,9,.5), rgba(6,2,9,0) 72%)}
.ma-wonka.fig.walking .wc-bob{animation:maFigWalk .34s ease-in-out infinite}
.ma-wonka.fig.idle .wc-bob{animation:maFigIdle 3s ease-in-out infinite}
@keyframes maFigWalk{0%,100%{transform:translateY(0) rotate(-2deg)}50%{transform:translateY(-5%) rotate(2deg)}}
@keyframes maFigIdle{0%,100%{transform:translateY(0)}50%{transform:translateY(-1.6%)}}
/* real 3D rigged character (three.js overlay). CSS bob/flip off: the rig animates itself. */
.ma-wonka.three .wc-bob{animation:none!important}
.ma-wonka.three canvas{position:absolute;inset:0;width:100%!important;height:100%!important;display:block}
.ma-fx{position:absolute;left:0;top:0;pointer-events:none}
.ma-zoom{position:absolute;left:0;top:0;width:100%;height:100%;will-change:transform}
.ma-vignette{position:absolute;inset:0;pointer-events:none;z-index:7;
  background:radial-gradient(115% 100% at 50% 42%, rgba(6,2,9,0) 58%, rgba(6,2,9,.30) 100%)}
.ma-fade{position:absolute;inset:0;background:#0A0410;opacity:0;transition:opacity .34s ease;
  pointer-events:none;z-index:9}
.ma-fade.on{opacity:1}
.ma-hot.target .ring{border-color:rgba(245,184,65,.95);
  box-shadow:0 0 20px 5px rgba(245,184,65,.35);animation:maPulse 1s ease-in-out infinite}
`;

/* ---------- life-layer anchors (normalized image coords) ---------- */
/* chimney mouths that puff animated smoke. The last four sit in the lower half
   so steam is visible even when the cover-crop camera is parked near Day 1. */
const SMOKE_SOURCES = [
  [0.212, 0.085], [0.276, 0.062], [0.518, 0.055], [0.555, 0.035],
  [0.598, 0.068], [0.728, 0.070], [0.905, 0.150],
  [0.916, 0.612], [0.030, 0.760], [0.127, 0.562], [0.955, 0.842],
];
/* river centerline + half-width, for drifting shimmer streaks */
const RIVER = [
  [0.530, 0.230, 0.030], [0.520, 0.310, 0.045], [0.500, 0.420, 0.075],
  [0.470, 0.530, 0.095], [0.490, 0.640, 0.090], [0.500, 0.730, 0.060],
  [0.480, 0.820, 0.055],
];
/* painted lanterns that get a soft flicker glow */
const LANTERNS = [
  [0.396, 0.715], [0.601, 0.712], [0.408, 0.852], [0.592, 0.845],
  [0.455, 0.318], [0.600, 0.315], [0.205, 0.905], [0.777, 0.688],
];
/* spots where the chocolate visibly churns: waterfall base + the mid-river fountain */
const RIPPLES = [
  [0.530, 0.300], [0.440, 0.435],
];
/* the churn pool under the waterfall . the ONLY area where the chocolate itself
   is warped (Jay: the sign and the boats must never wobble) */
const FLOW = [
  [0.532, 0.238, 0.042], [0.529, 0.272, 0.056], [0.523, 0.306, 0.064],
];
/* painted features that drifting glints must never cross (boats + gate sign) */
const KEEPOUT = [
  [0.350, 0.390, 0.525, 0.570],
  [0.415, 0.510, 0.605, 0.680],
  [0.390, 0.670, 0.640, 0.810],
];

export async function mount(container, api, opts) {
  if (!container || !api) throw new Error('mapart: missing container or api');
  const REDUCED = !!opts.reduced;
  const TOUCH = !!opts.touch;

  const days = api.getDays();
  let states = api.getDayStates();

  /* ---------- DOM ---------- */
  container.innerHTML = '';
  container.style.height = '';
  const pin = document.createElement('div');
  pin.className = 'm3d-pin';
  container.appendChild(pin);
  const style = document.createElement('style');
  style.textContent = CSS;
  pin.appendChild(style);
  const backdrop = document.createElement('div');
  backdrop.className = 'ma-backdrop';
  pin.appendChild(backdrop);
  // zoomWrap scales as one unit for the walk-into-a-room camera move
  const zoomWrap = document.createElement('div');
  zoomWrap.className = 'ma-zoom';
  pin.appendChild(zoomWrap);
  const img = document.createElement('img');
  img.className = 'ma-img';
  img.alt = '';
  img.setAttribute('aria-hidden', 'true');
  zoomWrap.appendChild(img);
  /* ambient loop video (Seedance 2, 20.7): the painting itself breathing .
     waterfall pouring, smoke drifting, gears turning, the boat crews stirring.
     Each candidate was composited back onto the still in post (the model
     zooms ~2.6% and repaints textures), so the video frame equals MAP_IMG's
     framing exactly: path audit 0/178 off-road on the moving frames, and the
     interactive layer needs no recalibration. Preview-only for now: ?vid=1/2/3
     picks a candidate, no param = the still image; Jay locks one later. The
     canvas fx (stars/smoke/lanterns) are suspended while the video plays .
     the film already contains that life, and doubling smoke reads as haze. */
  const vidPick = (/[?&]vid=([1-9])\b/.exec(location.search) || [])[1];
  let vid = null, vidLive = false;
  if (vidPick && !REDUCED) {
    vid = document.createElement('video');
    vid.className = 'ma-img ma-vid';         // inherits sizing + the m3d-in fade
    vid.muted = true; vid.loop = true; vid.playsInline = true;
    vid.autoplay = true; vid.preload = 'auto';
    vid.addEventListener('canplaythrough', () => {
      vidLive = true;
      vid.classList.add('m3d-in');           // ~1s dissolve hides the texture shift
      vid.play().catch(() => {});
      diagLog('map video v' + vidPick + ' live');
    }, { once: true });
    vid.addEventListener('error', () => {    // any failure: the still simply stays
      vidLive = false;
      try { vid.remove(); } catch (e) {}
      vid = null;
      diagLog('map video failed, still image kept');
    });
    vid.src = 'map-art/video/loop' + vidPick + '.mp4';
    zoomWrap.appendChild(vid);               // above the painting, below the fx
    // a hidden tab refuses autoplay; nudge the film when the tab comes forward
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && vid && vidLive && vid.paused) vid.play().catch(() => {});
    });
  }
  // life layers: fxFar = star twinkles (sky), fxNear = smoke/shimmer/ripples/lanterns.
  // m3d-in matters: the host page ships `#map3d-stage canvas{opacity:0}` (a fade-in
  // hook for the 3D engine) which otherwise hides EVERY canvas in the stage forever.
  const fxFar = document.createElement('canvas');
  fxFar.className = 'ma-fx m3d-in';
  const fxNear = document.createElement('canvas');
  fxNear.className = 'ma-fx m3d-in';
  zoomWrap.appendChild(fxFar);
  zoomWrap.appendChild(fxNear);
  const layer = document.createElement('div');
  layer.className = 'ma-layer m3d-plates';
  layer.style.pointerEvents = 'none';
  zoomWrap.appendChild(layer);
  // above the zoom: a soft cinematic vignette + a dark curtain for the room-enter cut
  const vignette = document.createElement('div');
  vignette.className = 'ma-vignette';
  pin.appendChild(vignette);
  const fadeCurtain = document.createElement('div');
  fadeCurtain.className = 'ma-fade';
  pin.appendChild(fadeCurtain);

  // load the painting; failure rejects mount -> host falls back
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = () => reject(new Error('map art failed to load'));
    img.src = MAP_IMG + '?v=5';
  });
  const NAT_W = img.naturalWidth, NAT_H = img.naturalHeight;
  /* Distances ALONG THE PATH are measured in the authoring reference frame, never
     in the artwork's native pixels. Every speed and threshold here was calibrated
     against a 1536x1024 map . walk duration (dist/300), the key-walk step
     (140/pathLen), the approach leg (len/260), the start offset and the 55px card
     / 140px Enter windows . so measuring in native pixels silently HALVED all of
     them the moment the map was upscaled to 3072x2048 (Jay: "Wonka walks very
     slowly now"). Normalized coordinates are resolution independent; pixel
     quantities derived from them are not. Layout (cover scale, disp) still uses
     the real NAT_W/NAT_H . that one genuinely wants the true size. */
  const ART_W = 1536, ART_H = 1024;

  /* flowing chocolate: a feathered cutout of the churn pool under the waterfall
     ONLY (the sign and the boats stay rock still), re-drawn every frame in
     gently waving horizontal strips so the chocolate there visibly undulates */
  /* ---------- geometry: the painting COVERS the stage; a camera pans over it ---------- */
  let disp = { x: 0, y: 0, w: 1, h: 1, s: 1 };
  let panX = 0, panY = 0, panTX = 0, panTY = 0; // camera offset (baked into disp.x/y)
  let userPanned = false;  // a manual drag suspends auto-follow until the next walk
  /* subtle mouse parallax: image/fx and the interactive layer drift at
     different depths. par* in [-1..1], lerped toward the pointer. */
  let parX = 0, parY = 0, parTX = 0, parTY = 0;
  const PAR_IMG = 7, PAR_FAR = 3, PAR_LAYER = 11;
  function applyParallax() {
    // translateZ(0) forces each strip onto its own compositor layer; some GPUs
    // otherwise draw-but-never-display the canvases (seen on Jay's machine)
    img.style.transform = 'translate(' + (disp.x + parX * PAR_IMG) + 'px,' + (disp.y + parY * PAR_IMG) + 'px) translateZ(0)';
    if (vid) vid.style.transform = img.style.transform;   // the film rides the painting exactly
    fxNear.style.transform = 'translate(' + (parX * PAR_IMG) + 'px,' + (parY * PAR_IMG) + 'px) translateZ(0)';
    fxFar.style.transform = 'translate(' + (parX * PAR_FAR) + 'px,' + (parY * PAR_FAR) + 'px) translateZ(0)';
    layer.style.transform = 'translate(' + (parX * PAR_LAYER) + 'px,' + (parY * PAR_LAYER) + 'px) translateZ(0)';
  }
  const pinW = () => pin.clientWidth || window.innerWidth;
  const pinH = () => pin.clientHeight || Math.max(1, window.innerHeight - 110);
  const clampPanX = (x) => Math.min(0, Math.max(pinW() - disp.w, x));
  const clampPanY = (y) => Math.min(0, Math.max(pinH() - disp.h, y));
  function centerCamOn(nx, ny, instant) {
    panTX = clampPanX(pinW() / 2 - nx * disp.w);
    panTY = clampPanY(pinH() / 2 - ny * disp.h);
    if (instant) {
      panX = panTX; panY = panTY;
      disp.x = panX; disp.y = panY;
    }
  }
  function layout() {
    const headerH = Math.max(0, container.offsetTop);
    pin.style.height = Math.max(320, window.innerHeight - headerH) + 'px';
    const W = pinW(), H = pinH();
    // cover: no letterbox ever; the overflow is explored by the camera
    const s = Math.max(W / NAT_W, H / NAT_H);
    disp = { s, w: NAT_W * s, h: NAT_H * s, x: panX, y: panY };
    if (!userPanned) centerCamOn(charPos()[0], charPos()[1], true);
    panX = panTX = clampPanX(panX); panY = panTY = clampPanY(panY);
    disp.x = panX; disp.y = panY;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    fxFar.width = W * dpr; fxFar.height = H * dpr;
    fxNear.width = W * dpr; fxNear.height = H * dpr;
    fxFar.style.width = fxNear.style.width = W + 'px';
    fxFar.style.height = fxNear.style.height = H + 'px';
    fxScale = dpr;
    img.style.width = disp.w + 'px';
    img.style.height = disp.h + 'px';
    if (vid) { vid.style.width = disp.w + 'px'; vid.style.height = disp.h + 'px'; }
    applyParallax();
    placeAll();
  }
  const toPx = (nx, ny) => [disp.x + nx * disp.w, disp.y + ny * disp.h];

  /* ---------- life layers: stars, smoke, river shimmer, lanterns ---------- */
  let fxScale = 1;
  let fxDead = false;
  const fxRand = (a, b) => a + Math.random() * (b - a);
  const stars = Array.from({ length: 26 }, () => ({
    x: Math.random(), y: fxRand(0.005, 0.16), r: fxRand(0.7, 1.9),
    ph: Math.random() * Math.PI * 2, sp: fxRand(0.6, 1.6),
  }));
  const puffs = [];
  SMOKE_SOURCES.forEach(([sx, sy]) => {
    for (let i = 0; i < 6; i++) puffs.push({
      sx, sy, ph: i / 6 + Math.random() * 0.1, sp: fxRand(0.075, 0.115),
      drift: fxRand(-0.012, 0.026), seed: Math.random() * 10,
    });
  });
  const lampFx = LANTERNS.map(() => ({ ph: Math.random() * Math.PI * 2, sp: fxRand(5, 10), r: fxRand(10, 15) }));
  function drawFx(t, dt) {
    /* While the ambient film plays it carries the water and the smoke, so the
       canvas smoke is skipped (doubling reads as haze). Stars and lantern
       flicker stay on . they sit outside the film's motion zones and keep the
       whole frame alive, not just the river. */
    const k = disp.w / NAT_W * (NAT_W / 1536); // px per 1536-wide art unit
    const far = fxFar.getContext('2d');
    far.setTransform(fxScale, 0, 0, fxScale, 0, 0);
    far.clearRect(0, 0, fxFar.width, fxFar.height);
    far.fillStyle = '#FFF6E8';
    for (const s of stars) {
      const w = Math.sin(t * s.sp + s.ph);
      if (w <= 0) continue;
      const a = w * w * 0.8;
      const [px, py] = toPx(s.x, s.y);
      far.globalAlpha = a;
      far.beginPath();
      far.arc(px, py, s.r, 0, Math.PI * 2);
      far.fill();
      if (s.r > 1.5) {
        far.globalAlpha = a * 0.45;
        far.fillRect(px - s.r * 3, py - 0.5, s.r * 6, 1);
        far.fillRect(px - 0.5, py - s.r * 3, 1, s.r * 6);
      }
    }
    far.globalAlpha = 1;
    const ctx = fxNear.getContext('2d');
    ctx.setTransform(fxScale, 0, 0, fxScale, 0, 0);
    ctx.clearRect(0, 0, fxNear.width, fxNear.height);
    for (const p of vidLive ? [] : puffs) {
      const u = (t * p.sp + p.ph) % 1;
      const nx = p.sx + p.drift * u + Math.sin(t * 0.7 + p.seed) * 0.005 * u;
      const ny = p.sy - u * 0.10;
      const [px, py] = toPx(nx, ny);
      const r = (7 + u * 23) * k;
      const a = (1 - u) * 0.34 * Math.min(1, u / 0.12);
      if (a <= 0.004) continue;
      const g = ctx.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, 'rgba(233,225,236,' + a.toFixed(3) + ')');
      g.addColorStop(1, 'rgba(233,225,236,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalCompositeOperation = 'lighter';
    LANTERNS.forEach(([lx, ly], i) => {
      const f = lampFx[i];
      const a = 0.055 + 0.045 * (0.5 + 0.5 * Math.sin(t * f.sp + f.ph)) * (0.7 + 0.3 * Math.sin(t * 3.7 + f.ph * 2));
      const [px, py] = toPx(lx, ly);
      const r = f.r * k;
      const g = ctx.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, 'rgba(255,196,96,' + a.toFixed(3) + ')');
      g.addColorStop(1, 'rgba(255,196,96,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill();
    });
    ctx.globalCompositeOperation = 'source-over';
  }

  /* ---------- pointer: parallax (desktop) + drag-pan (the map is bigger than the stage) ---------- */
  let dragging = false, justDragged = false, dragSX = 0, dragSY = 0, dragPX = 0, dragPY = 0, downX = 0, downY = 0;
  pin.style.touchAction = 'pan-y'; // touch: horizontal pan is ours, vertical stays page scroll
  if (!REDUCED && !TOUCH) {
    pin.addEventListener('pointermove', (e) => {
      if (dragging) return;
      const r = pin.getBoundingClientRect();
      parTX = ((e.clientX - r.left) / r.width - 0.5) * 2;
      parTY = ((e.clientY - r.top) / r.height - 0.5) * 2;
    });
    pin.addEventListener('pointerleave', () => { parTX = 0; parTY = 0; });
  }
  pin.addEventListener('pointerdown', (e) => {
    dragging = true;
    downX = dragSX = e.clientX; downY = dragSY = e.clientY;
    dragPX = panX; dragPY = panY;
  });
  pin.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    if (Math.abs(e.clientX - downX) + Math.abs(e.clientY - downY) > 9) { justDragged = true; userPanned = true; }
    if (!justDragged) return;
    panX = panTX = clampPanX(dragPX + (e.clientX - dragSX));
    panY = panTY = TOUCH ? panY : clampPanY(dragPY + (e.clientY - dragSY));
    disp.x = panX; disp.y = panY;
    applyParallax();
    placeAll();
  });
  const endDrag = () => {
    dragging = false;
    if (justDragged) setTimeout(() => { justDragged = false; }, 0);
  };
  pin.addEventListener('pointerup', endDrag);
  pin.addEventListener('pointercancel', endDrag);
  // swallow the click that follows a pan gesture
  pin.addEventListener('click', (e) => {
    if (justDragged) { e.stopPropagation(); e.preventDefault(); }
  }, true);

  /* ---------- walk speed (all in ART_W units per second) ----------
     Kept together and named because they are pure feel, and because three of
     them are calibrated against pathLen. `?speed=N` scales all of them at once
     so the number can be dialled in live in a real browser instead of guessed
     one push at a time. Reference: the whole path is ~2953 units long, so
     These are Jay's locked numbers, picked live in his own browser with ?speed=
     on 20.7: 140 was 21s to cross the map and far too slow, 400 was 7.4s and a
     touch hot, and he settled on ?speed=0.75 of that, so the multiplier is baked
     in here as the base. key:300 crosses the whole map in ~9.8s. */
  const SPEED_MUL = Math.max(0.25, Math.min(4, parseFloat(
    (/[?&]speed=([\d.]+)/.exec(location.search) || [])[1]) || 1));
  const WALK = {
    key:       300 * SPEED_MUL,   // holding an arrow key
    click:     525 * SPEED_MUL,   // clicking a day or a spot on the road
    clickMax:  2.25 / SPEED_MUL,  // ceiling for one click-walk, seconds
    approach:  390 * SPEED_MUL,   // stepping off the path into the building
  };

  /* ---------- path: arc-length parameterized polyline ---------- */
  const segLens = [];
  let pathLen = 0;
  for (let i = 1; i < PATH.length; i++) {
    const dx = (PATH[i][0] - PATH[i - 1][0]) * ART_W;
    const dy = (PATH[i][1] - PATH[i - 1][1]) * ART_H;
    const l = Math.hypot(dx, dy);
    segLens.push(l);
    pathLen += l;
  }
  function posAt(t) { // t in [0..1] arc length -> normalized [x, y]
    let want = Math.min(1, Math.max(0, t)) * pathLen;
    for (let i = 0; i < segLens.length; i++) {
      if (want <= segLens[i] || i === segLens.length - 1) {
        const k = segLens[i] > 0 ? want / segLens[i] : 0;
        return [
          PATH[i][0] + (PATH[i + 1][0] - PATH[i][0]) * k,
          PATH[i][1] + (PATH[i + 1][1] - PATH[i][1]) * k,
        ];
      }
      want -= segLens[i];
    }
    return PATH[PATH.length - 1];
  }
  function nearestT(nx, ny) {
    let best = 0, bestD = Infinity, acc = 0;
    for (let i = 0; i < segLens.length; i++) {
      const [ax, ay] = PATH[i], [bx, by] = PATH[i + 1];
      const vx = (bx - ax) * ART_W, vy = (by - ay) * ART_H;
      const wx = (nx - ax) * ART_W, wy = (ny - ay) * ART_H;
      const c = Math.max(0, Math.min(1, (vx * wx + vy * wy) / (vx * vx + vy * vy || 1)));
      const px = ax + (bx - ax) * c, py = ay + (by - ay) * c;
      const d = Math.hypot((nx - px) * ART_W, (ny - py) * ART_H);
      if (d < bestD) { bestD = d; best = (acc + segLens[i] * c) / pathLen; }
      acc += segLens[i];
    }
    return { t: best, dist: bestD };
  }
  const doorT = {};
  days.forEach((d) => {
    const dp = DOORS[d.day] || HOTSPOTS[d.day];
    doorT[d.day] = nearestT(dp[0], dp[1]).t;
  });

  /* ---------- hotspots + badges + plates ---------- */
  const hots = [], badges = [], plates = [];
  days.forEach((d, i) => {
    const h = document.createElement('div');
    h.className = 'ma-hot';
    h.innerHTML = '<div class="ring"></div>';
    h.addEventListener('click', () => activateRoom(d.day));
    h.addEventListener('pointerenter', () => setHover(i));
    h.addEventListener('pointerleave', () => setHover(-1));
    layer.appendChild(h);
    hots.push(h);

    const b = document.createElement('div');
    b.className = 'ma-badge';
    layer.appendChild(b);
    badges.push(b);

    const pl = document.createElement('div');
    pl.className = 'm3d-plate';
    pl.innerHTML = '<div class="p-day">Day ' + d.day + '</div><div class="p-name"></div><div class="p-note"></div>';
    pl.style.pointerEvents = 'auto';
    pl.style.cursor = 'pointer';
    pl.addEventListener('click', () => activateRoom(d.day));
    layer.appendChild(pl);
    plates.push({ el: pl, name: pl.querySelector('.p-name'), note: pl.querySelector('.p-note') });
  });
  // "You are here", mall-map style: a small sign on a stem above the current room
  const hereMark = document.createElement('div');
  hereMark.className = 'ma-here';
  hereMark.setAttribute('aria-hidden', 'true');
  hereMark.innerHTML = '<div class="hz-sign">You are here</div>' +
                       '<div class="hz-stem"></div><div class="hz-tip"></div>';
  layer.appendChild(hereMark);
  let hereDay = 0;

  let hoverIdx = -1;
  function setHover(i) {
    requestAnimationFrame(placeAll);
    if (hoverIdx >= 0 && hoverIdx !== nearIdx()) plates[hoverIdx].el.classList.remove('on');
    hoverIdx = i;
    if (i >= 0) plates[i].el.classList.add('on');
  }
  function nearIdx(thresholdPx) {
    // 55px keeps a card pinned to its own doorstep (92px used to pop 'Day 7'
    // while Wonka stood by Day 8's house). Enter passes a wider window . still
    // under the smallest door gap (156px), so it can never be ambiguous.
    const limit = thresholdPx || 55;
    let best = -1, bestD = Infinity;
    days.forEach((d, i) => {
      const dd = Math.abs(charT - doorT[d.day]);
      if (dd < bestD) { bestD = dd; best = i; }
    });
    return bestD * pathLen < limit ? best : -1;
  }
  // as Wonka approaches a room its card opens by itself (and closes on leaving)
  let autoPlateIdx = -1;
  function refreshAutoPlate() {
    const ni = nearIdx();
    if (ni === autoPlateIdx) return;
    if (autoPlateIdx >= 0 && autoPlateIdx !== hoverIdx) plates[autoPlateIdx].el.classList.remove('on');
    autoPlateIdx = ni;
    if (ni >= 0) plates[ni].el.classList.add('on');
    placeAll();
  }

  /* ---------- Wonka sprite ---------- */
  const wonka = document.createElement('div');
  wonka.className = 'ma-wonka idle';
  wonka.innerHTML = '<div class="wc-flip"><div class="wc-bob">' + SPRITE_SVG + '</div></div>';
  layer.appendChild(wonka);
  const wFlip = wonka.querySelector('.wc-flip');
  // upgrade to the 3D figurine render when available; the SVG stays as fallback
  const figImg = new Image();
  figImg.onload = () => {
    if (char3d) return; // the real 3D character already took over
    wonka.classList.add('fig');
    const bob = wonka.querySelector('.wc-bob');
    bob.innerHTML = '';
    const sh = document.createElement('div');
    sh.className = 'ma-wshadow';
    figImg.className = 'ma-wfig';
    bob.appendChild(sh);
    bob.appendChild(figImg);
  };
  figImg.src = 'map-art/wonka3d.png?v=2';

  /* directional walk sprites (front/side/back x 2 stride frames + idle), all cut
     from the same generated figurine, so the pretty Wonka really steps, turns,
     and shows his back. Until they load, the single figurine PNG stands in. */
  const SPRITES = { front: [], side: [], back: [], sidep: null, frontp: null, backp: null, idle: null, sideSeq: [] };
  let spriteReady = false, sprPrev = null, sprStep = 0, sprFlip = false;
  /* The walk sprites are ONLY the fallback for when the 3D character cannot run.
     Preloading them cost every visitor ~4.5MB for nothing, so they are fetched
     lazily . on a 3D failure, or under reduced motion. */
  let spritesRequested = false;
  function loadWalkSprites() {
    if (spritesRequested) return;
    spritesRequested = true;
    const required = [['front', 1], ['front', 2], ['side', 1], ['side', 2], ['back', 1], ['back', 2], ['idle', 0]];
    const optional = [['sidep', 0], ['frontp', 0], ['backp', 0]];
    let loadedN = 0;
    required.concat(optional).forEach(([d, i]) => {
      const im2 = new Image();
      im2.onload = () => { loadedN++; if (loadedN >= required.length) { spriteReady = true; diagLog('walk sprites active'); } };
      im2.src = 'map-art/wonka-sprites/' + (i ? d + i : d) + '.png?v=3';
      if (i) SPRITES[d][i - 1] = im2; else SPRITES[d] = im2;
    });
    // full video-extracted side cycle, if deployed: sidecyc_0.png .. sidecyc_N.png
    // Exactly as many frames as ship in map-art/wonka-sprites/. Probing blindly
    // to 24 fired 10 guaranteed 404s on every fallback . if the cycle is ever
    // regenerated with a different length, update this number.
    const SIDECYC_FRAMES = 14;
    const raw = [];
    for (let i = 0; i < SIDECYC_FRAMES; i++) {
      const im3 = new Image();
      im3.onload = () => {
        raw[i] = im3;
        let seq = [];
        for (let j = 0; j < SIDECYC_FRAMES && raw[j]; j++) seq.push(raw[j]);
        if (seq.length >= 6) SPRITES.sideSeq = seq;
      };
      im3.src = 'map-art/wonka-sprites/sidecyc_' + i + '.png?v=3';
    }
  }
  if (REDUCED) loadWalkSprites();   // no 3D character under reduced motion
  // pick the richest available cycle for a direction
  function cycleFor(dir) {
    if (dir === 'side') {
      if (SPRITES.sideSeq.length >= 6) return SPRITES.sideSeq;
      return SPRITES.sidep ? [SPRITES.side[0], SPRITES.sidep, SPRITES.side[1], SPRITES.sidep] : SPRITES.side;
    }
    const p = dir === 'front' ? SPRITES.frontp : SPRITES.backp;
    const d = SPRITES[dir];
    return p ? [d[0], p, d[1], p] : d;
  }

  /* ---------- REAL 3D walking character (three.js overlay, best tier) ----------
     A rigged KayKit mage recostumed as Wonka: wizard hat hidden, procedural top
     hat on the head bone, robe hue-shifted to plum. Walk/Idle clips play on the
     rig, and the whole character yaws to its walk direction, so walking away
     shows his back. Fallback chain: 3D char -> PNG figurine -> SVG. */
  let char3d = null;
  // rebuild the sprite box with the PNG figurine (or the SVG if the PNG is gone)
  function restoreFig() {
    loadWalkSprites();
    const bob = wonka.querySelector('.wc-bob');
    wonka.classList.remove('three');
    if (figImg.complete && figImg.naturalWidth > 0) {
      wonka.classList.add('fig');
      bob.innerHTML = '';
      const sh = document.createElement('div');
      sh.className = 'ma-wshadow';
      figImg.className = 'ma-wfig';
      bob.appendChild(sh);
      bob.appendChild(figImg);
    } else {
      wonka.classList.remove('fig');
      bob.innerHTML = SPRITE_SVG;
    }
  }
  function dropChar3d(reason, err) {
    console.warn('[mapart] 3D character disabled (' + reason + ')', err || '');
    diagLog('char3d disabled: ' + reason + (err ? ' . ' + (err.message || err) : ''));
    if (char3d) { try { char3d.renderer.dispose(); } catch (e2) {} }
    char3d = null;
    restoreFig();
    placeWonka();
  }
  (async () => {
    if (REDUCED) return;
    if (/[?&]char=sprites\b/.test(location.search)) return; // escape hatch to the old skin
    try {
      const THREE = await import('three');
      const { buildWonka } = await import('./wonka-char.js?v=1');
      const built = buildWonka(THREE);
      const group = new THREE.Group();
      group.add(built.root);
      const scene = new THREE.Scene();
      scene.add(group);
      // night-map lighting: cool ambient fill + warm lantern key + rim from behind
      scene.add(new THREE.AmbientLight(0x9a86b8, 1.05));
      const key = new THREE.DirectionalLight(0xffdfae, 2.0);
      key.position.set(2.4, 4.2, 3.2);
      scene.add(key);
      const rim = new THREE.DirectionalLight(0xffc46a, 0.85);
      rim.position.set(-2.6, 2.4, -3.4);
      scene.add(rim);
      /* Orthographic, tilted down to match the painting's isometric projection,
         and framed EXACTLY so world y=0 (his soles) lands on the bottom edge of
         the sprite box and the top of the hat on the top edge. Without this the
         character renders mid-canvas and reads as floating above the path. */
      const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 80);
      const TILT = 0.42;                       // ~24 degrees, matches the map
      camera.position.set(0, 14 * Math.sin(TILT), 14 * Math.cos(TILT));
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld(true);
      /* A Box3 is useless for this: its corners include phantom points (feet
         height at hat-brim depth) that project BELOW the real soles once the
         camera is tilted, which left a visible gap under his shoes. So frame
         empirically instead . render, scan the alpha channel for the actual
         lowest/highest/leftmost/rightmost lit pixel, and squeeze the frustum
         onto it. Two passes converge. */
      function calibrateFrame(renderer3, w0, h0) {
        const box = new THREE.Box3().setFromObject(built.root);
        const c0 = box.getCenter(new THREE.Vector3());
        const s0 = box.getSize(new THREE.Vector3());
        const span = Math.max(s0.x, s0.y, s0.z) * 1.3;
        const cv = new THREE.Vector3(c0.x, c0.y, c0.z).applyMatrix4(camera.matrixWorldInverse);
        camera.bottom = cv.y - span / 2; camera.top = cv.y + span / 2;
        camera.left = cv.x - span / 2; camera.right = cv.x + span / 2;
        camera.updateProjectionMatrix();
        const probe = document.createElement('canvas');
        probe.width = w0; probe.height = h0;
        const pctx = probe.getContext('2d', { willReadFrequently: true });
        for (let pass = 0; pass < 3; pass++) {
          renderer3.setSize(w0, h0, false);
          renderer3.render(scene, camera);
          pctx.clearRect(0, 0, w0, h0);
          pctx.drawImage(renderer3.domElement, 0, 0, w0, h0);
          const d = pctx.getImageData(0, 0, w0, h0).data;
          let lo = -1, hi = -1, lft = w0, rgt = -1;
          for (let py = 0; py < h0; py++) {
            for (let px = 0; px < w0; px++) {
              if (d[(py * w0 + px) * 4 + 3] > 10) {
                if (hi < 0) hi = py;
                lo = py;
                if (px < lft) lft = px;
                if (px > rgt) rgt = px;
              }
            }
          }
          if (lo < 0) break;
          const fh = camera.top - camera.bottom, fw = camera.right - camera.left;
          // pull the frustum in onto the lit pixels; keep 3% headroom over the hat
          const newBottom = camera.bottom + ((h0 - 1 - lo) / h0) * fh;
          const newTop = camera.top - (hi / h0) * fh + fh * 0.03;
          const cxw = camera.left + ((lft + rgt) / 2 / w0) * fw;
          const nh = newTop - newBottom;
          const nw = nh * (2 / 3);
          camera.bottom = newBottom; camera.top = newTop;
          camera.left = cxw - nw / 2; camera.right = cxw + nw / 2;
          camera.updateProjectionMatrix();
        }
        return (camera.right - camera.left) / (camera.top - camera.bottom);
      }
      const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
      renderer.setClearColor(0x000000, 0);
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      renderer.domElement.classList.add('m3d-in'); // beat the host's canvas{opacity:0} fade rule
      // settle to the rest pose (soles flat on the floor) before measuring
      for (let i = 0; i < 30; i++) built.update(0.016, false, 1);
      built.root.updateMatrixWorld(true);
      const charAspect = calibrateFrame(renderer, 120, 180);
      // swap into the sprite box: canvas + ground shadow
      const bob = wonka.querySelector('.wc-bob');
      bob.innerHTML = '';
      const sh = document.createElement('div');
      sh.className = 'ma-wshadow';
      bob.appendChild(sh);
      bob.appendChild(renderer.domElement);
      wonka.classList.remove('fig');
      wonka.classList.add('three');
      wFlip.style.transform = '';
      char3d = {
        THREE, renderer, scene, camera, built, group, aspect: charAspect,
        walking: false, yaw: 0.35, yawT: 0.35, size: [0, 0], prevPx: null, prevPy: null,
      };
      placeWonka();
      diagLog('char3d active (' + renderer.getContext().constructor.name + ')');
      // prove the very first render works; otherwise fall straight back to the PNG
      built.update(0.016, false, 1);
      renderer.render(scene, camera);
      // watchdog: if the canvas is still fully transparent shortly after takeover,
      // something on this GPU/browser silently failed. Revert so Wonka never vanishes.
      setTimeout(() => {
        if (!char3d || disposed) return;
        try {
          const cv = char3d.renderer.domElement;
          // drawn but styled invisible (e.g. the host's canvas fade rule) -> self-heal
          if (parseFloat(getComputedStyle(cv).opacity) < 0.5) {
            cv.classList.add('m3d-in');
            cv.style.opacity = '1';
            diagLog('char3d canvas was styled invisible; forced visible');
          }
          [fxFar, fxNear].forEach((fc) => {
            if (parseFloat(getComputedStyle(fc).opacity) < 0.5) {
              fc.classList.add('m3d-in');
              fc.style.opacity = '1';
              diagLog('fx canvas was styled invisible; forced visible');
            }
          });
          const probe = document.createElement('canvas');
          probe.width = Math.max(1, cv.width); probe.height = Math.max(1, cv.height);
          const px2 = probe.getContext('2d');
          px2.drawImage(cv, 0, 0);
          const d = px2.getImageData(0, 0, probe.width, probe.height).data;
          let lit = 0;
          for (let i = 3; i < d.length; i += 4) { if (d[i] > 8) { lit++; if (lit > 50) break; } }
          if (lit <= 50) dropChar3d('blank canvas watchdog');
        } catch (e) { dropChar3d('watchdog probe failed', e); }
      }, 2500);
    } catch (e) {
      if (char3d) dropChar3d('setup render failed', e);
      else console.warn('[mapart] 3D character unavailable, using the figurine:', e);
    }
  })();

  let charT = 0;
  let walkTween = null; // {from, to, t, dur, day}
  let facingLeft = false;
  let userMoved = false;

  function spriteSize() {
    const h = Math.max(42, disp.h * 0.092);
    return [h * (40 / 60), h];
  }
  /* The last leg of a room entry: Wonka steps OFF the path and walks up to
     the building's own door, then slips inside. `approach` overrides his
     position while it runs, so everything downstream (camera, yaw, sprite)
     follows him off-road without special-casing. */
  let approach = null;   // { fx, fy, tx, ty, t, dur, day }
  function charPos() {
    if (!approach) return posAt(charT);
    const k = Math.min(1, approach.t / approach.dur);
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    return [approach.fx + (approach.tx - approach.fx) * e,
            approach.fy + (approach.ty - approach.fy) * e];
  }
  function startApproach(day) {
    const [px, py] = posAt(doorT[day]);
    const h = HOTSPOTS[day];
    const dx = h[0] - px, dy = h[1] - py;
    const len = Math.hypot(dx * ART_W, dy * ART_H) || 1;
    // stop just inside the building's face, where its door would be
    const k = Math.max(0, len - h[2] * ART_W * 0.45) / len;
    approach = { fx: px, fy: py, tx: px + dx * k, ty: py + dy * k, t: 0,
                 dur: Math.max(0.3, Math.min(0.72, len / WALK.approach)), day };
    plates[day - 1].el.classList.add('on');
    wonka.classList.add('walking');
    wonka.classList.remove('idle');
  }

  function placeWonka() {
    const [nx, ny] = charPos();
    const [px, py] = toPx(nx, ny);
    const [w, h] = spriteSize();
    // feet anchors per skin: the 3D camera is framed so the soles ARE the bottom
    // edge (anchor 1.0); walk sprites share a 97% baseline (normalized offline),
    // the single figurine PNG bottoms out at ~99%, the SVG's feet sit at ~94%
    const anchor = char3d ? 1.0 : (spriteReady ? 0.97 : (wonka.classList.contains('fig') ? 0.99 : 0.94));
    if (char3d) {
      // keep the rendered character the same physical height whatever its aspect
      const cw = Math.round(h * char3d.aspect);
      wonka.style.width = cw + 'px';
      wonka.style.height = h + 'px';
      wonka.style.transform = 'translate(' + (px - cw / 2) + 'px,' + (py - h) + 'px)';
      wFlip.style.transform = '';
      if (char3d.size[0] !== cw || char3d.size[1] !== h) {
        char3d.size = [cw, h];
        char3d.renderer.setSize(cw, h, false);
      }
      return;
    }
    wonka.style.width = w + 'px';
    wonka.style.height = h + 'px';
    wonka.style.transform = 'translate(' + (px - w / 2) + 'px,' + (py - h * anchor) + 'px)';
    wFlip.style.transform = facingLeft ? 'scaleX(-1)' : '';
  }

  function placeAll() {
    days.forEach((d, i) => {
      const [nx, ny, nr] = HOTSPOTS[d.day];
      const [px, py] = toPx(nx, ny);
      const r = nr * disp.w;
      const h = hots[i];
      h.style.left = px + 'px';
      h.style.top = py + 'px';
      h.style.width = (r * 2) + 'px';
      h.style.height = (r * 2) + 'px';
      const b = badges[i];
      const bs = Math.max(24, disp.w * 0.034);
      b.style.width = bs + 'px';
      b.style.height = bs + 'px';
      b.style.left = px + 'px';
      b.style.top = (py - r * 0.72) + 'px';
      const pl = plates[i].el;
      // keep the card inside the stage: clamp x, and flip below the room when
      // the top edge would cut it off
      const pw = pl.offsetWidth || 150, ph2 = pl.offsetHeight || 64;
      const W2 = pinW();
      const cx2 = Math.min(W2 - pw / 2 - 8, Math.max(pw / 2 + 8, px));
      if (py - r - 8 - ph2 < 6) {
        pl.style.transform = 'translate(' + cx2 + 'px,' + (py + r + 10) + 'px) translate(-50%,0)';
      } else {
        pl.style.transform = 'translate(' + cx2 + 'px,' + (py - r - 6) + 'px) translate(-50%,-100%)';
      }
      if (d.day === hereDay) {
        // above the room . and above the room CARD when that is open, or the two
        // stack on top of each other
        const hw = hereMark.offsetWidth || 90;
        const hx = Math.min(pinW() - hw / 2 - 6, Math.max(hw / 2 + 6, px));
        const cardOpen = pl.classList.contains('on');
        const cardTop = py - r - 6 - ph2;
        const anchor = cardOpen ? cardTop - 8 : py - r * 0.72;
        hereMark.style.left = hx + 'px';
        hereMark.style.top = Math.max(34, anchor) + 'px';
      }
    });
    placeWonka();
  }

  /* ---------- states ---------- */
  let firstStates = true;
  function applyStates(list) {
    const prev = states;
    states = list;
    list.forEach((st, i) => {
      const locked = !st.unlocked;
      hots[i].classList.toggle('current', !!st.isCurrent && !locked);
      const b = badges[i];
      // locks only; the W "done" seals confused more than they said (Jay)
      if (locked) { b.innerHTML = LOCK_SVG; b.style.display = ''; }
      else { b.innerHTML = ''; b.style.display = 'none'; }
      if (st.isCurrent && st.unlocked) hereDay = days[i].day;
      plates[i].name.textContent = days[i].room;
      plates[i].el.classList.toggle('locked', locked);
      if (st.done) plates[i].note.textContent = 'Toured . lights on';
      else if (locked) plates[i].note.textContent = 'Opens ' + api.unlockLabel(days[i].day);
      else if (st.isCurrent) plates[i].note.textContent = 'Now filming . step inside';
      else plates[i].note.textContent = 'Open . walk in';
      const was = prev && prev[i];
      if (!firstStates && was && !was.done && st.done) celebrate();
    });
    hereMark.classList.toggle('on', hereDay > 0);
    placeAll();
    if (!userPanned && !walkTween) {
      const cur = states.find((st) => st.isCurrent && st.unlocked) || states.find((st) => st.unlocked && !st.done) || states[0];
      centerCamOn(HOTSPOTS[cur.day][0], HOTSPOTS[cur.day][1], firstStates || REDUCED);
      applyParallax();
      placeAll();
    }
    firstStates = false;
  }
  function celebrate() {
    wonka.classList.remove('walking');
    wonka.classList.add('idle');
  }

  /* ---------- walk-into-a-room camera zoom ---------- */
  let zooming = false;
  let introRunning = false;   // declared here: resetZoom reads it
  function resetZoom() {
    approach = null;
    zooming = false;
    if (introRunning) return;      // the arrival shot owns the wrapper until it ends
    zoomWrap.style.transition = 'none';
    zoomWrap.style.transform = 'none';
    fadeCurtain.style.transition = 'none';
    fadeCurtain.classList.remove('on');
    requestAnimationFrame(() => { fadeCurtain.style.transition = ''; });
    hots.forEach((h) => h.classList.remove('target'));
    wonka.classList.add('show');
  }
  function zoomEnter(day, cb) {
    if (REDUCED) { cb(); return; }
    zooming = true;
    parTX = parTY = 0;
    hots.forEach((h) => h.classList.remove('target'));
    const [px, py] = toPx(HOTSPOTS[day][0], HOTSPOTS[day][1]);
    zoomWrap.style.transformOrigin = px + 'px ' + py + 'px';
    zoomWrap.style.transition = 'transform .85s cubic-bezier(.55,.06,.68,.19)';
    zoomWrap.style.transform = 'scale(2.35)';
    wonka.classList.remove('show'); // Wonka slips inside as the camera dives
    // no dark curtain any more: the room-enter overlay owns the cut (Jay: the flash hurt)
    let done = false;
    const fin = () => {
      if (done) return;
      done = true;
      zoomWrap.removeEventListener('transitionend', fin);
      cb();
    };
    zoomWrap.addEventListener('transitionend', fin);
    setTimeout(fin, 950); // fallback if transitionend never fires
  }

  /* ---------- movement ---------- */
  function activateRoom(day) {
    if (zooming) return;
    if (approach) { if (approach.day === day) return; approach = null; }
    userMoved = true;
    const st = states[day - 1];
    if (!st || !st.unlocked) {
      api.lockedToast(day);
      const b = badges[day - 1];
      b.classList.remove('shake');
      void b.offsetWidth;
      b.classList.add('shake');
      return;
    }
    if (REDUCED) { api.openDay(day); return; }
    userPanned = false; // walking re-engages the follow camera
    const dist = Math.abs(charT - doorT[day]) * pathLen;
    if (dist < 24) {
      startApproach(day);
      return;
    }
    walkTween = { from: charT, to: doorT[day], t: 0, dur: Math.max(0.3, Math.min(WALK.clickMax, dist / WALK.click)), day };
    plates[day - 1].el.classList.add('on');
    hots.forEach((h) => h.classList.remove('target'));
    hots[day - 1].classList.add('target'); // the destination door pulses while he walks
    wonka.classList.add('walking');
    wonka.classList.remove('idle');
  }

  // clicking the painted road strolls Wonka there
  pin.addEventListener('click', (e) => {
    if (e.target.closest('.ma-hot') || e.target.closest('.m3d-plate') || e.target.closest('.m3d-cta')) return;
    if (REDUCED || zooming) return;
    const rect = pin.getBoundingClientRect();
    const nx = (e.clientX - rect.left - disp.x) / disp.w;
    const ny = (e.clientY - rect.top - disp.y) / disp.h;
    if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return;
    const near = nearestT(nx, ny);
    if (near.dist < ART_W * 0.06) {
      userMoved = true;
      userPanned = false;
      approach = null;   // abort a room entry the user changed their mind about
      hots.forEach((h) => h.classList.remove('target'));
      const dist = Math.abs(charT - near.t) * pathLen;
      walkTween = { from: charT, to: near.t, t: 0, dur: Math.max(0.25, Math.min(WALK.clickMax, dist / WALK.click)), day: null };
      wonka.classList.add('walking');
      wonka.classList.remove('idle');
    }
  });

  function onKeyDown(e) {
    if (REDUCED) return;
    const app = document.getElementById('app');
    if (document.body.classList.contains('viewing-day') || (app && app.classList.contains('viewing-day'))) return;
    const ae = document.activeElement;
    if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)) return;
    const rect = container.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight) return;
    const k = e.key;
    // up/right always walk FORWARD along the tour (toward the next day); down/left walk back
    if (k === 'ArrowUp' || k === 'ArrowRight' || k === 'w' || k === 'd') { keys.fwd = true; walkTween = null; approach = null; userMoved = true; userPanned = false; e.preventDefault(); }
    else if (k === 'ArrowDown' || k === 'ArrowLeft' || k === 's' || k === 'a') { keys.back = true; walkTween = null; approach = null; userMoved = true; userPanned = false; e.preventDefault(); }
    else if (k === 'Enter' || k === ' ') {
      const ni = nearIdx(140);
      if (ni >= 0) { e.preventDefault(); activateRoom(days[ni].day); }
    }
  }
  function onKeyUp(e) {
    const k = e.key;
    if (k === 'ArrowUp' || k === 'ArrowRight' || k === 'w' || k === 'd') keys.fwd = false;
    if (k === 'ArrowDown' || k === 'ArrowLeft' || k === 's' || k === 'a') keys.back = false;
  }
  const keys = { fwd: false, back: false };
  if (!REDUCED) {
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
  }

  /* ---------- loop (cheap: only moves the sprite) ---------- */
  let raf = 0, lastT = 0, paused = false, disposed = false, fatalCb = null;
  let lastTickAt = 0;
  function tick(now) {
    if (disposed || paused) return;
    raf = requestAnimationFrame(tick);
    lastTickAt = performance.now();
    const dt = Math.min(0.05, (now - lastT) / 1000 || 0.016);
    lastT = now;
    try {
      let moving = false;
      if (approach && !approach.done) {
        approach.t += dt;
        moving = true;
        if (approach.t >= approach.dur) {
          approach.t = approach.dur;
          approach.done = true;   // stay AT the door; resetZoom clears it later
          wonka.classList.remove('walking');
          zoomEnter(approach.day, () => api.openDay(approach.day));
        }
      } else if (!approach && walkTween) {
        walkTween.t += dt;
        const k = Math.min(1, walkTween.t / walkTween.dur);
        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        const prev = charT;
        charT = walkTween.from + (walkTween.to - walkTween.from) * e;
        facingLeft = posAt(charT)[0] < posAt(prev)[0] - 1e-6 ? true : (posAt(charT)[0] > posAt(prev)[0] + 1e-6 ? false : facingLeft);
        moving = true;
        if (k >= 1) {
          const day = walkTween.day;
          walkTween = null;
          if (day) startApproach(day);
        }
      } else if (keys.fwd || keys.back) {
        const dTdt = (WALK.key / pathLen) * dt;
        const prev = charT;
        charT = Math.min(1, Math.max(0, charT + (keys.fwd ? dTdt : -dTdt)));
        facingLeft = posAt(charT)[0] < posAt(prev)[0];
        moving = charT !== prev;
      }
      wonka.classList.toggle('walking', moving);
      wonka.classList.toggle('idle', !moving);
      // follow camera: while Wonka moves, the viewport glides after him
      if (moving && !zooming && !introRunning) {
        const [wx, wy] = charPos();
        centerCamOn(wx, wy, false);
      }
      if (!dragging && (Math.abs(panTX - panX) > 0.15 || Math.abs(panTY - panY) > 0.15)) {
        const ck = Math.min(1, dt * 3.2);
        panX += (panTX - panX) * ck;
        panY += (panTY - panY) * ck;
        disp.x = panX; disp.y = panY;
        placeAll();
      }
      placeWonka();
      // sprite skin: pick the view by walk direction, alternate stride frames by distance
      if (!char3d && spriteReady) {
        const el = wonka.querySelector('.ma-wfig');
        if (el) {
          const [snx, sny] = charPos();
          const [spx, spy] = toPx(snx, sny);
          if (sprPrev && moving) {
            const vx = spx - sprPrev[0], vy = spy - sprPrev[1];
            if (Math.abs(vx) + Math.abs(vy) > 0.2) {
              sprStep += Math.hypot(vx, vy);
              let dir;
              if (Math.abs(vx) >= Math.abs(vy) * 0.9) { dir = 'side'; sprFlip = vx < 0; }
              else { dir = vy < 0 ? 'back' : 'front'; sprFlip = false; }
              const cyc = cycleFor(dir);
              // one full walk cycle every ~46px of ground, however many frames it has
              const stepPx = Math.max(3.5, 46 / cyc.length);
              const want = cyc[Math.floor(sprStep / stepPx) % cyc.length];
              if (want && el.src !== want.src) el.src = want.src;
            }
          } else if (!moving && SPRITES.idle && el.src !== SPRITES.idle.src) {
            el.src = SPRITES.idle.src;
            sprFlip = false;
          }
          sprPrev = [spx, spy];
          wFlip.style.transform = sprFlip ? 'scaleX(-1)' : '';
        }
      }
      refreshAutoPlate();
      if (char3d) {
        try {
          // yaw toward the walk direction (screen-space), so walking away shows his back
          const [wnx, wny] = charPos();
          const [wpx, wpy] = toPx(wnx, wny);
          if (char3d.prevPx !== null && moving) {
            const vx = wpx - char3d.prevPx, vy = wpy - char3d.prevPy;
            if (Math.abs(vx) + Math.abs(vy) > 0.25) char3d.yawT = Math.atan2(vx, vy);
          }
          // stride cadence follows how fast he is actually covering ground
          let strideSpeed = 1;
          if (char3d.prevPx !== null && moving) {
            const d2 = Math.hypot(wpx - char3d.prevPx, wpy - char3d.prevPy) / Math.max(0.001, dt);
            strideSpeed = Math.min(2.2, Math.max(0.5, d2 / 130));
          }
          char3d.prevPx = wpx; char3d.prevPy = wpy;
          let dy = char3d.yawT - char3d.yaw;
          while (dy > Math.PI) dy -= Math.PI * 2;
          while (dy < -Math.PI) dy += Math.PI * 2;
          char3d.yaw += dy * Math.min(1, dt * 9);
          char3d.group.rotation.y = char3d.yaw;
          char3d.walking = moving;
          char3d.built.update(dt, moving, strideSpeed);
          char3d.renderer.render(char3d.scene, char3d.camera);
        } catch (err3) {
          // never let the character kill the map: back to the figurine and keep going
          dropChar3d('render loop failed', err3);
        }
      }
      const pk = introRunning ? 0 : Math.min(1, dt * 5);
      parX += (parTX - parX) * pk;
      parY += (parTY - parY) * pk;
      applyParallax();
      if (!fxDead) {
        try { drawFx(now / 1000, dt); }
        catch (errFx) {
          fxDead = true; // the life layers must never kill the walk
          console.warn('[mapart] life-fx disabled:', errFx);
          diagLog('life-fx disabled: ' + (errFx.message || errFx));
        }
      }
    } catch (err) {
      cancelAnimationFrame(raf);
      if (fatalCb) fatalCb(err);
    }
  }

  /* ---------- resize ---------- */
  let resizeT = null;
  function onResize() { clearTimeout(resizeT); resizeT = setTimeout(layout, 120); }
  window.addEventListener('resize', onResize);
  const ro = new ResizeObserver(() => onResize());
  ro.observe(pin);

  /* ---------- start ---------- */
  {
    const cur = states.find((s) => s.isCurrent) || states[0];
    charT = Math.max(0, (doorT[cur.day] || 0) - 18 / pathLen);
  }
  /* ---------- arrival shot ----------
     The opening camera move when the map mounts. Runs once per page load,
     never on the way back from a day page, and any input cuts it short.

     THE PAINTING MUST BE OPAQUE BEFORE THE CAMERA MOVES. The first build
     faded .ma-img in over 1.1s while the 2.2s pull-back was already running,
     so the close-up . the whole point of the shot . played out on an empty
     screen and the map only became visible once it was nearly pulled back
     (measured: 0% opacity at scale 2.25, 100% at scale 1.09). That is what
     read as "unclear". The fade is now short and lands inside the opening
     hold, so every variant starts on a picture you can actually see.

     Three candidates behind ?arrive=N for Jay to compare live, the same
     picker pattern that settled the room-enter transitions. */
  const GATE_SIGN = [0.500, 0.735];
  const ARRIVE_DEFAULT = '3';   // Jay's pick (20.7): the whole island, then fill the frame
  const EASE_SETTLE = 'cubic-bezier(.36,.04,.22,1)';
  const ARRIVALS = {
    // 1: open ON the sign that names the place, then reveal the factory around it
    1: [
      { at: 'sign', k: 2.25, hold: 620 },
      { rest: true, ms: 1700, ease: EASE_SETTLE },
    ],
    // 2: establishing frame first, dive to the sign, then pull back out
    2: [
      { rest: true, hold: 780 },
      { at: 'sign', k: 2.00, ms: 1150, ease: 'cubic-bezier(.44,.06,.32,.98)', hold: 620 },
      { rest: true, ms: 1350, ease: EASE_SETTLE },
    ],
    // 3: the whole island in one wide frame, then push in until it fills the screen
    3: [
      { at: 'island', hold: 900 },
      { rest: true, ms: 1600, ease: EASE_SETTLE },
    ],
  };
  /* A shot frame is expressed as translate+scale with origin 0 0, so any
     normalized point of the painting can be centred at any zoom without
     touching the pan/camera system. The resting frame is literally no
     transform, which is what the rest of the engine expects to inherit. */
  function shotFrame(step) {
    if (step.rest) return 'none';
    const W = pinW(), H = pinH();
    const island = step.at === 'island';
    // 0.94 keeps a little night sky around the island instead of a tight fit
    const k = island ? Math.min(W / disp.w, H / disp.h) * 0.94 : step.k;
    const [px, py] = toPx(island ? 0.5 : GATE_SIGN[0], island ? 0.5 : GATE_SIGN[1]);
    return 'translate(' + (W / 2 - k * px) + 'px,' + (H / 2 - k * py) + 'px) scale(' + k + ')';
  }
  let introRun = 0;                 // run token: stale timers must not kill a new shot
  let introTimers = [];
  function endArrival() {
    introTimers.forEach(clearTimeout);
    introTimers = [];
    if (!introRunning) return;
    introRunning = false;
    layer.style.opacity = '1';        // never leave the board hidden, cut or not
    zoomWrap.style.transition = 'none';
    zoomWrap.style.transform = 'none';
  }
  function playArrival() {
    if (REDUCED || TOUCH) return;
    try { runArrival(); } catch (e) {
      /* the shot is decoration; it must never be able to leave the board hidden
         or the map parked mid-zoom (a crashed intro once took the whole
         animation loop with it) */
      diagLog('arrival failed: ' + (e && e.message));
      introRunning = false;
      introTimers.forEach(clearTimeout);
      introTimers = [];
      layer.style.opacity = '1';
      zoomWrap.style.transition = 'none';
      zoomWrap.style.transform = 'none';
    }
  }
  function runArrival() {
    const q = /[?&]arrive=(\d)\b/.exec(location.search);
    const pick = (q && ARRIVALS[q[1]]) ? q[1] : ARRIVE_DEFAULT;
    const steps = ARRIVALS[pick];
    const run = ++introRun;
    introRunning = true;
    diagLog('arrival v' + pick);

    // short enough to finish inside the opening hold of every variant
    img.style.transition = 'opacity 420ms ease';
    img.classList.add('m3d-in');

    zoomWrap.style.transformOrigin = '0 0';
    zoomWrap.style.transition = 'none';
    zoomWrap.style.transform = shotFrame(steps[0]);
    /* The board (hotspots, day cards, "You are here", Wonka) rides inside the
       zoom wrapper, so in the wide establishing frame it is on screen from the
       first moment and the shot stops reading as a painting. Hold it back and
       fade it in over the final move, so the island lands and the game board
       arrives with it. */
    layer.style.opacity = '0';
    void zoomWrap.offsetWidth;

    const last = steps.length - 1;
    let t = 0;
    steps.forEach((step, i) => {
      if (i > 0) {
        const ms = step.ms || 1200;
        const at = t;
        introTimers.push(setTimeout(() => {
          if (introRun !== run) return;
          zoomWrap.style.transition = 'transform ' + ms + 'ms ' + (step.ease || 'ease');
          zoomWrap.style.transform = shotFrame(step);
          if (i === last) layer.style.opacity = '1';
        }, at));
        t += ms;
      }
      t += step.hold || 0;
    });
    // timer-driven, not transitionend: a throttled tab never fires the last one
    introTimers.push(setTimeout(() => { if (introRun === run) endArrival(); }, t + 140));
    ['pointerdown', 'keydown', 'wheel'].forEach((ev) =>
      window.addEventListener(ev, endArrival, { once: true, passive: true }));
  }

  layout();
  applyStates(states);
  playArrival();
  requestAnimationFrame(() => {
    img.classList.add('m3d-in');
    wonka.classList.add('show');
  });
  setTimeout(() => {
    img.classList.add('m3d-in');
    wonka.classList.add('show');
    layout();
  }, 400);
  if (!REDUCED) raf = requestAnimationFrame(tick);
  else { placeWonka(); plates.forEach((p) => p.el.classList.add('on')); }

  /* ---------- ?diag: on-page diagnostics panel (screenshot-friendly) ---------- */
  if (/[?&]diag\b/.test(location.search)) {
    setTimeout(() => {
      const lit = (cv) => {
        try {
          const p = document.createElement('canvas');
          p.width = Math.max(1, cv.width); p.height = Math.max(1, cv.height);
          const c2 = p.getContext('2d');
          c2.drawImage(cv, 0, 0);
          const d = c2.getImageData(0, 0, p.width, p.height).data;
          let n = 0;
          for (let i = 3; i < d.length; i += 4) if (d[i] > 10) n++;
          return n;
        } catch (e) { return 'probe-fail: ' + (e.message || e); }
      };
      const info = (name, cv) => {
        if (!cv) return name + ': MISSING';
        const cs = getComputedStyle(cv);
        return name + ': buf ' + cv.width + 'x' + cv.height + ' css ' + cs.width + ' x ' + cs.height +
          ' disp:' + cs.display + ' vis:' + cs.visibility + ' op:' + cs.opacity + ' lit:' + lit(cv);
      };
      const wkCnv = wonka.querySelector('canvas');
      const lines = [
        'BUILD ' + BUILD,
        'ua: ' + navigator.userAgent.slice(0, 95),
        'dpr ' + window.devicePixelRatio + '  reduced: ' + REDUCED + '  loop-alive: ' + (performance.now() - lastTickAt < 600),
        'wonka skin: ' + (char3d ? '3d' : (spriteReady ? 'sprites' : (wonka.classList.contains('fig') ? 'png-figurine' : 'svg'))),
        info('fxFar ', fxFar),
        info('fxNear', fxNear),
        info('char3d', wkCnv),
        'log: ' + ((window.__mapartLog || []).join(' | ') || '(empty)'),
      ];
      const pre = document.createElement('pre');
      pre.style.cssText = 'position:fixed;left:10px;top:70px;z-index:99999;background:rgba(5,2,8,.94);color:#8ef5a2;' +
        'font:11px/1.6 monospace;padding:12px 14px;border:1px solid #35563d;border-radius:8px;max-width:92vw;white-space:pre-wrap';
      pre.textContent = lines.join('\n');
      document.body.appendChild(pre);
      console.log('[mapart diag]\n' + lines.join('\n'));
    }, 4000);
  }

  /* ---------- controller (same contract as map3d.js) ---------- */
  return {
    pause() { paused = true; cancelAnimationFrame(raf); },
    resume() {
      if (disposed) return;
      paused = false;
      resetZoom();
      layout();
      lastT = performance.now();
      if (!REDUCED) raf = requestAnimationFrame(tick);
    },
    setStates(list) { applyStates(list); },
    focusDay(day, instant) {
      const t = doorT[day];
      if (t === undefined) return;
      resetZoom();
      centerCamOn(HOTSPOTS[day][0], HOTSPOTS[day][1], true);
      applyParallax();
      placeAll();
      if (REDUCED || instant) { walkTween = null; charT = Math.max(0, t - 14 / pathLen); placeWonka(); return; }
      walkTween = { from: charT, to: t, t: 0, dur: 1.2, day: null };
    },
    resize() { onResize(); },
    setQuality() {},
    onFatal(cb) { fatalCb = cb; },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('resize', onResize);
      if (!REDUCED) {
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
      }
      if (char3d) { try { char3d.renderer.dispose(); } catch (e) {} char3d = null; }
      container.innerHTML = '';
    },
    qa: {
      teleport(n) {
        const t = doorT[n];
        if (t === undefined) return false;
        walkTween = null;
        charT = t;
        placeWonka();
        return true;
      },
      forceStates(list) { applyStates(list); return states; },
      screenshotMode() { walkTween = null; resetZoom(); placeAll(); return true; },
      stats() {
        return {
          engine: 'art', charT: Math.round(charT * 1000) / 1000,
          pathLen: Math.round(pathLen), img: [NAT_W, NAT_H],
          near: nearIdx() >= 0 ? days[nearIdx()].day : null,
          pan: [Math.round(panX), Math.round(panY)], zooming,
          entering: approach && !approach.done ? approach.day : null,
          wonkaSkin: char3d ? '3d' : (spriteReady ? 'sprites' : (wonka.classList.contains('fig') ? 'png' : 'svg')),
          cover: [Math.round(disp.w), Math.round(disp.h)],
          parallax: [Math.round(parX * 100) / 100, Math.round(parY * 100) / 100],
          fx: { stars: stars.length, puffs: puffs.length, lanterns: LANTERNS.length },
        };
      },
    },
  };
}
