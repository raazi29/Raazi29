// Renders dist/targeting.svg: a T-65 targeting-computer readout of daily contributions.
// Run by .github/workflows/holonet.yml every day. Needs GITHUB_TOKEN in the environment.
import { mkdirSync, writeFileSync } from "node:fs";

const LOGIN = process.env.PROFILE_USER || "raazi29";
const DAYS = 30;

const query = `query($login: String!) {
  user(login: $login) {
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks { contributionDays { date contributionCount } }
      }
    }
  }
}`;

const res = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: { Authorization: `bearer ${process.env.GITHUB_TOKEN}`, "Content-Type": "application/json", "User-Agent": LOGIN },
  body: JSON.stringify({ query, variables: { login: LOGIN } }),
});
const json = await res.json();
if (!res.ok || json.errors) throw new Error(`GraphQL failed: ${res.status} ${JSON.stringify(json.errors ?? json)}`);

const cal = json.data.user.contributionsCollection.contributionCalendar;
const days = cal.weeks.flatMap((w) => w.contributionDays);

// Today may still be empty; a streak only breaks once a full day passes without a commit.
let current = 0;
for (let i = days.length - 1; i >= 0; i--) {
  if (days[i].contributionCount > 0) current++;
  else if (i !== days.length - 1) break;
}
let longest = 0, run = 0;
for (const d of days) {
  run = d.contributionCount > 0 ? run + 1 : 0;
  longest = Math.max(longest, run);
}
const best = days.reduce((a, d) => (d.contributionCount > a.contributionCount ? d : a), days[0]);

const recent = days.slice(-DAYS);
const avg = recent.reduce((s, d) => s + d.contributionCount, 0) / recent.length;
const peak = recent.reduce((a, d) => (d.contributionCount > a.contributionCount ? d : a), recent[0]);
const max = Math.max(4, peak.contributionCount);
const top = Math.ceil(max / 4) * 4;

const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const short = (iso) => `${MON[+iso.slice(5, 7) - 1]} ${iso.slice(8, 10)}`;

const W = 900, H = 350;
const X0 = 70, X1 = 860, Y0 = 70, Y1 = 232;
const xs = (i) => X0 + (i * (X1 - X0)) / (recent.length - 1);
const ys = (v) => Y1 - (v / top) * (Y1 - Y0);

const pts = recent.map((d, i) => [xs(i), ys(d.contributionCount)]);
const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
const area = `${line} L${X1} ${Y1} L${X0} ${Y1} Z`;
let len = 0;
for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
len = Math.ceil(len);

let grid = "";
for (let k = 0; k <= 4; k++) {
  const v = (top / 4) * k, y = ys(v).toFixed(1);
  grid += `<line class="grid" x1="${X0}" y1="${y}" x2="${X1}" y2="${y}"/><text class="dim" x="${X0 - 12}" y="${+y + 4}" text-anchor="end">${v}</text>`;
}
recent.forEach((d, i) => {
  if (i % 5 && i !== recent.length - 1) return;
  const x = xs(i).toFixed(1);
  grid += `<line class="grid v" x1="${x}" y1="${Y0}" x2="${x}" y2="${Y1}"/><text class="dim" x="${x}" y="${Y1 + 20}" text-anchor="middle">${short(d.date)}</text>`;
});

const dots = pts
  .map(([x, y], i) => `<rect class="${recent[i].contributionCount ? "pt" : "pt off"}" x="${(x - 2.5).toFixed(1)}" y="${(y - 2.5).toFixed(1)}" width="5" height="5"/>`)
  .join("");

const pi = recent.indexOf(peak);
const [px, py] = pts[pi];
const lockText = peak.contributionCount ? `TARGET LOCKED · ${peak.contributionCount} ON ${short(peak.date)}` : "NO SIGNAL · STAY ON TARGET";
// Above the reticle when there is room, otherwise beside it (on the side with more space).
const above = py - 30 >= Y0 - 6;
const right = px < (X0 + X1) / 2;
const lx = above ? Math.min(Math.max(px, X0 + 110), X1 - 110) : right ? px + 30 : px - 30;
const ly = above ? py - 30 : py + 4;
const anchor = above ? "middle" : right ? "start" : "end";
const reticle = `<g class="lock">
  <g transform="translate(${px.toFixed(1)} ${py.toFixed(1)})"><g class="spin">
    <circle r="13" class="ret"/><circle r="4" class="ret"/>
    <line class="ret" x1="-22" y1="0" x2="-8" y2="0"/><line class="ret" x1="8" y1="0" x2="22" y2="0"/>
    <line class="ret" x1="0" y1="-22" x2="0" y2="-8"/><line class="ret" x1="0" y1="8" x2="0" y2="22"/>
  </g></g>
  <text class="red" x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="${anchor}">${lockText}</text>
</g>`;

const stats = [
  ["YEAR TOTAL", cal.totalContributions.toLocaleString("en-US")],
  ["CURRENT STREAK", `${current}d`],
  ["LONGEST STREAK", `${longest}d`],
  ["BEST DAY", `${best.contributionCount}`],
  [`${DAYS}-DAY AVG`, avg.toFixed(1)],
];
const cell = (X1 - X0 + 20) / stats.length;
const statBlock = stats
  .map(([k, v], i) => {
    const x = X0 - 10 + cell * i;
    return `<g transform="translate(${x.toFixed(1)} 266)"><rect class="cell" width="${(cell - 10).toFixed(1)}" height="54" rx="3"/>
<text class="val" x="${((cell - 10) / 2).toFixed(1)}" y="27" text-anchor="middle">${v}</text>
<text class="dim" x="${((cell - 10) / 2).toFixed(1)}" y="44" text-anchor="middle">${k}</text></g>`;
  })
  .join("");

const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Daily contributions for the last ${DAYS} days. ${cal.totalContributions} this year, current streak ${current} days, longest ${longest} days.">
<defs>
  <filter id="glow" x="-10%" y="-30%" width="120%" height="160%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffb000" stop-opacity=".35"/><stop offset="1" stop-color="#ffb000" stop-opacity="0"/></linearGradient>
  <linearGradient id="sweep" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffb000" stop-opacity="0"/><stop offset="1" stop-color="#ffb000" stop-opacity=".28"/></linearGradient>
  <clipPath id="plot"><rect x="${X0}" y="${Y0 - 4}" width="${X1 - X0}" height="${Y1 - Y0 + 4}"/></clipPath>
  <pattern id="scan" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="1" fill="#ffb000" opacity=".035"/></pattern>
</defs>
<style>
  text { font-family: "JetBrains Mono", "Cascadia Mono", "SFMono-Regular", Consolas, "Liberation Mono", monospace; font-size: 11px; letter-spacing: 1px; }
  .panel { fill: #05070d; stroke: #ffb000; stroke-opacity: .35; }
  .brk { fill: none; stroke: #ffb000; stroke-width: 2; }
  .head { fill: #ffb000; font-size: 13px; font-weight: 700; letter-spacing: 2px; }
  .dim { fill: #b38a3a; opacity: .8; }
  .red { fill: #ff4b3e; font-weight: 700; font-size: 11px; letter-spacing: 1.5px; }
  .grid { stroke: #ffb000; stroke-opacity: .14; stroke-dasharray: 2 4; }
  .grid.v { stroke-opacity: .09; }
  .area { fill: url(#fill); opacity: 0; animation: show .8s 1.6s forwards; }
  .line { fill: none; stroke: #ffcf4a; stroke-width: 2.2; stroke-linejoin: round; filter: url(#glow);
    stroke-dasharray: ${len}; stroke-dashoffset: ${len}; animation: draw 2.2s ease-out forwards; }
  .pt { fill: #ffe81f; opacity: 0; animation: show .4s 2s forwards; }
  .pt.off { fill: #6b5520; }
  .sweep { animation: sweep 4.5s linear infinite; }
  .ret { fill: none; stroke: #ff4b3e; stroke-width: 1.6; }
  .lock { opacity: 0; animation: show .1s 2.3s forwards, blink 1.2s 2.3s steps(2, end) infinite; }
  .spin { animation: spin 6s linear infinite; }
  .cell { fill: #ffb000; fill-opacity: .05; stroke: #ffb000; stroke-opacity: .25; }
  .val { fill: #ffe81f; font-size: 20px; font-weight: 700; letter-spacing: 0; }
  .live { fill: #ff4b3e; opacity: 1; animation: blink 1s steps(2, end) infinite; }
  @keyframes draw { to { stroke-dashoffset: 0 } }
  @keyframes show { to { opacity: 1 } }
  @keyframes blink { 50% { opacity: .35 } }
  @keyframes spin { to { transform: rotate(360deg) } }
  @keyframes sweep { from { transform: translateX(${X0 - 120}px) } to { transform: translateX(${X1}px) } }
</style>
<rect class="panel" x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="10"/>
<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="10" fill="url(#scan)"/>
<path class="brk" d="M14 30 V14 H30 M${W - 30} 14 H${W - 14} V30 M${W - 14} ${H - 30} V${H - 14} H${W - 30} M30 ${H - 14} H14 V${H - 30}"/>
<text class="head" x="34" y="38">T-65 TARGETING COMPUTER</text>
<text class="dim" x="${W - 34}" y="38" text-anchor="end"><tspan class="live">● LIVE  </tspan>DAILY COMMIT TELEMETRY · LAST ${DAYS} DAYS</text>
${grid}
<g clip-path="url(#plot)"><rect class="sweep" x="0" y="${Y0 - 4}" width="120" height="${Y1 - Y0 + 4}" fill="url(#sweep)"/></g>
<path class="area" d="${area}"/>
<path class="line" d="${line}"/>
${dots}
${reticle}
${statBlock}
<text class="dim" x="${W / 2}" y="${H - 14}" text-anchor="middle">SYNCED ${stamp} UTC · STAY ON TARGET</text>
</svg>
`;

// ---------- galactic map: the year's contribution grid ----------
const nonzero = days.map((d) => d.contributionCount).filter((c) => c > 0).sort((a, b) => a - b);
const q = (p) => nonzero[Math.min(nonzero.length - 1, Math.floor(p * nonzero.length))] ?? 1;
const cuts = [q(0.25), q(0.5), q(0.75)];
const level = (c) => (c === 0 ? 0 : c <= cuts[0] ? 1 : c <= cuts[1] ? 2 : c <= cuts[2] ? 3 : 4);

const GW = 900, CELL = 12, STEP = 15, GX = 70, GY = 64;
const GH = GY + 7 * STEP + 58;
let cells = "", months = "", lastMonth = -1, lastLabel = -9;
cal.weeks.forEach((w, wi) => {
  const x = GX + wi * STEP;
  const m = +w.contributionDays[0].date.slice(5, 7) - 1;
  if (m !== lastMonth && wi - lastLabel >= 3 && wi < cal.weeks.length - 2) {
    lastLabel = wi;
    months += `<text class="dim" x="${x}" y="${GY - 10}">${MON[m]}</text>`;
    lastMonth = m;
  }
  for (const d of w.contributionDays) {
    const dow = new Date(`${d.date}T00:00:00Z`).getUTCDay();
    cells += `<rect class="c${level(d.contributionCount)}" x="${x}" y="${GY + dow * STEP}" width="${CELL}" height="${CELL}" rx="2"><title>${d.date}: ${d.contributionCount}</title></rect>`;
  }
});
const bw = cal.weeks.findIndex((w) => w.contributionDays.some((d) => d.date === best.date));
const bdow = new Date(`${best.date}T00:00:00Z`).getUTCDay();
const bx = GX + bw * STEP + CELL / 2, by = GY + bdow * STEP + CELL / 2;
const gridW = cal.weeks.length * STEP;
const legend = [0, 1, 2, 3, 4].map((l, i) => `<rect class="c${l}" x="${GW - 34 - 5 * 17 + i * 17 - 40}" y="${GH - 30}" width="${CELL}" height="${CELL}" rx="2"/>`).join("");

const mapSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${GW}" height="${GH}" viewBox="0 0 ${GW} ${GH}" role="img" aria-label="Contribution map for the last year: ${cal.totalContributions} contributions, best day ${best.contributionCount} on ${best.date}.">
<defs>
  <linearGradient id="beam" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffb000" stop-opacity="0"/><stop offset="1" stop-color="#ffb000" stop-opacity=".22"/></linearGradient>
  <clipPath id="map"><rect x="${GX - 2}" y="${GY - 2}" width="${gridW + 2}" height="${7 * STEP + 2}"/></clipPath>
  <pattern id="scan2" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="1" fill="#ffb000" opacity=".035"/></pattern>
</defs>
<style>
  text { font-family: "JetBrains Mono", "Cascadia Mono", "SFMono-Regular", Consolas, "Liberation Mono", monospace; font-size: 11px; letter-spacing: 1px; }
  .panel { fill: #05070d; stroke: #ffb000; stroke-opacity: .35; }
  .brk { fill: none; stroke: #ffb000; stroke-width: 2; }
  .head { fill: #ffb000; font-size: 13px; font-weight: 700; letter-spacing: 2px; }
  .dim { fill: #b38a3a; opacity: .8; }
  .c0 { fill: #141a24; } .c1 { fill: #4a3a12; } .c2 { fill: #8a6414; } .c3 { fill: #d49a16; } .c4 { fill: #ffe066; }
  .beam { animation: beam 7s linear infinite; }
  .ret { fill: none; stroke: #ff4b3e; stroke-width: 1.6; }
  .lock { animation: blink 1.2s steps(2, end) infinite; }
  @keyframes beam { from { transform: translateX(${GX - 140}px) } to { transform: translateX(${GX + gridW}px) } }
  @keyframes blink { 50% { opacity: .35 } }
  @media (prefers-reduced-motion: reduce) { .beam, .lock { animation: none } .beam { display: none } }
</style>
<rect class="panel" x=".5" y=".5" width="${GW - 1}" height="${GH - 1}" rx="10"/>
<rect x=".5" y=".5" width="${GW - 1}" height="${GH - 1}" rx="10" fill="url(#scan2)"/>
<path class="brk" d="M14 30 V14 H30 M${GW - 30} 14 H${GW - 14} V30 M${GW - 14} ${GH - 30} V${GH - 14} H${GW - 30} M30 ${GH - 14} H14 V${GH - 30}"/>
<text class="head" x="34" y="38">GALACTIC CONTRIBUTION MAP</text>
<text class="dim" x="${GW - 34}" y="38" text-anchor="end">LAST 52 WEEKS · ${cal.totalContributions.toLocaleString("en-US")} SIGNALS</text>
${months}
<text class="dim" x="${GX - 10}" y="${GY + 1 * STEP + 10}" text-anchor="end">MON</text>
<text class="dim" x="${GX - 10}" y="${GY + 3 * STEP + 10}" text-anchor="end">WED</text>
<text class="dim" x="${GX - 10}" y="${GY + 5 * STEP + 10}" text-anchor="end">FRI</text>
${cells}
<g clip-path="url(#map)"><rect class="beam" x="0" y="${GY - 2}" width="140" height="${7 * STEP + 2}" fill="url(#beam)"/></g>
<g class="lock"><circle class="ret" cx="${bx}" cy="${by}" r="11"/><line class="ret" x1="${bx - 17}" y1="${by}" x2="${bx - 12}" y2="${by}"/><line class="ret" x1="${bx + 12}" y1="${by}" x2="${bx + 17}" y2="${by}"/></g>
<text class="dim" x="${GX}" y="${GH - 20}"><tspan fill="#ff4b3e">◎</tspan> BEST DAY ${best.contributionCount} ON ${short(best.date)}</text>
<text class="dim" x="${GW - 34 - 5 * 17 - 48}" y="${GH - 20}" text-anchor="end">QUIET</text>${legend}<text class="dim" x="${GW - 34 - 40 + 6}" y="${GH - 20}">HOT</text>
</svg>
`;

mkdirSync("dist", { recursive: true });
writeFileSync("dist/targeting.svg", svg);
writeFileSync("dist/grid.svg", mapSvg);
console.log(`targeting.svg + grid.svg: ${cal.totalContributions} this year, streak ${current}/${longest}, peak ${peak.contributionCount} on ${peak.date}`);
