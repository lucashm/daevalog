// Checks the analytics pane's death timeline data (deathView in overlay/AnalyticsPage.qml):
// node scripts/test-death-timeline.js
const fs = require("fs");
const src = fs.readFileSync(__dirname + "/../overlay/AnalyticsPage.qml", "utf8");
const fn = (name) => src.match(new RegExp(`    function ${name}\\([^]*?\\n    }\\n`))[0];
const { deathView, dpsView } = new Function("meOnly", `${fn("deathView")}\n${fn("dpsView")}\nreturn { deathView, dpsView };`)(false);
const eq = (got, want, what) => {
    if (JSON.stringify(got) !== JSON.stringify(want)) {
        console.error(`FAIL ${what}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
        process.exitCode = 1;
    }
};

const history = [{ id: "f1", durationMs: 125000, players: [
    { name: "Ann", jobKey: "CLERIC", deathMs: [61000, 90000] },
    { name: "Bob", jobKey: "GLADIATOR", deathMs: [] },
    { name: "#55", jobKey: "", deathMs: [1000] },
    { name: "Cat", jobKey: "RANGER" },
] }];

// A run: lanes for who died, unnamed actors left out, you in bold.
let v = deathView({ runs: [{ fightId: "f1", player: "Ann", isMe: true }, { fightId: "f1", player: "Bob" }] }, "run", history);
eq(v.lanes.map((l) => [l.label, l.bold, l.ms]), [["Ann", true, [61000, 90000]]], "run lanes");
eq([v.spanMs, v.title], [125000, "Deaths in this run"], "run span and title");

// A boss: 30s slices over the longest run; a death at the very end lands in the last slice.
const runs = [
    { fightId: "f1", durationMs: 125000, deathMs: [61000, 90000] },
    { fightId: "f1", durationMs: 125000, deathMs: [] },
    { fightId: "f2", durationMs: 90000, deathMs: [65000, 125000] },
];
v = deathView({ runs }, "boss", history);
eq([v.binMs, v.bins, v.runs], [30000, [0, 0, 2, 1, 1], 2], "boss bins");
eq(v.title, "When deaths happen  ·  4 in 2 runs", "boss title");

// Past 10 minutes: 1 min slices.
v = deathView({ runs: [{ fightId: "f3", durationMs: 12 * 60000, deathMs: [] }] }, "boss", history);
eq([v.binMs, v.bins, v.title], [60000, [], "No deaths in these runs"], "long fight, no deaths");

eq(deathView({ runs: [] }, "player", history), null, "no timeline by player");
// DPS per slice: a boss sums its players, over the time its fights lasted in each slice.
v = dpsView({ runs: [
    { fightId: "a", durationMs: 45000, damageBins: [300, 150] },
    { fightId: "a", durationMs: 45000, damageBins: [300, 0] },
    { fightId: "b", durationMs: 30000, damageBins: [600] },
] }, "boss");
// Slice 1: (300+300+600) over 2 x 30s; slice 2: 150 over a's last 15s.
eq([v.binMs, v.bins, v.runs], [30000, [20, 10], 2], "party DPS per slice");
eq(v.title, "Party DPS over the fight  ·  average of 2 runs", "dps title");
// Past 10 minutes the daemon's 30s bins pair up into minutes.
v = dpsView({ runs: [{ fightId: "c", durationMs: 11 * 60000, damageBins: [60, 60].concat(new Array(20).fill(0)) }] }, "player");
eq([v.binMs, v.bins[0], v.bins.length, v.title], [60000, 2, 11, "DPS over the fight"], "minute slices");
eq(dpsView({ runs: [{ fightId: "d", durationMs: 1000, damageBins: [] }] }, "boss"), null, "no bins from an old daemon");

if (!process.exitCode) console.log("ok");
