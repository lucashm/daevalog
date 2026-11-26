import QtQuick

// Past runs side by side: every saved fight's players, grouped by player,
// class or boss (or one row per run), filtered and sorted, with the picked
// row's runs in a pane beside the table. A page of the app window (App.qml).
Item {
    id: an

    required property var client
    required property var settings
    // The page is on screen: the fight list is fetched then.
    property bool open: false
    // "player", "job", "boss" or "run"
    property string group: "player"
    property string sortKey: "avgDps"
    property bool sortDesc: true
    // Runs that started in this span; 0 = an open end. The preset's name when one was picked.
    property real rangeFrom: 0
    property real rangeTo: 0
    property string rangePreset: ""
    property bool pickerOpen: false
    // Runs shorter than this many minutes are hidden; 0 = none.
    property int minMinutes: 0
    property bool killsOnly: false
    property bool meOnly: false
    // Group name -> the value runs must have there ({ boss: "Vakron" }).
    property var filters: ({})
    property string selectedKey: ""

    signal openFight(string id)

    component FilterText: Text {
        anchors.verticalCenter: parent.verticalCenter
        color: Theme.dim
        font.pixelSize: Theme.fontSmall
        font.family: Theme.fontFamily
    }
    // The range button's words: a preset's name, a day, or from–to.
    function rangeLabel(from, to, preset) {
        if (preset) return preset;
        if (!from && !to) return "All time";
        const f = (ms, fm) => new Date(ms).toLocaleString(Qt.locale(), fm);
        const day = ms => new Date(ms).toDateString();
        const midnight = ms => f(ms, "HH:mm") === "00:00";
        if (from && to && day(from) === day(to) && midnight(from) && f(to, "HH:mm") === "23:59") return f(from, "ddd d MMM");
        const at = ms => midnight(ms) ? f(ms, "d MMM") : f(ms, "d MMM HH:mm");
        if (!to) return "Since " + at(from);
        if (!from) return "Until " + f(to, "d MMM HH:mm");
        return at(from) + "  –  " + (f(to, "HH:mm") === "23:59" ? f(to, "d MMM") : f(to, "d MMM HH:mm"));
    }

    // Opens the date range picker; shows what's picked.
    component RangeButton: Rectangle {
        id: rb
        readonly property bool set: an.rangeFrom > 0 || an.rangeTo > 0
        anchors.verticalCenter: parent.verticalCenter
        implicitWidth: rbRow.implicitWidth + Theme.pad * 2
        implicitHeight: rbText.implicitHeight + Theme.pad
        radius: height / 2
        color: an.pickerOpen ? Qt.alpha(Theme.accent, 0.18) : rbArea.containsMouse ? Qt.rgba(1, 1, 1, 0.14) : Qt.rgba(1, 1, 1, 0.07)
        border.color: set || an.pickerOpen ? Theme.accent : Theme.panelEdge
        Row {
            id: rbRow
            anchors.centerIn: parent
            spacing: Math.round(6 * Theme.scale)
            // A little calendar.
            Item {
                anchors.verticalCenter: parent.verticalCenter
                width: Math.round(11 * Theme.scale)
                height: width
                Rectangle {
                    anchors.fill: parent
                    anchors.topMargin: Math.round(1 * Theme.scale)
                    radius: Math.round(2 * Theme.scale)
                    color: "transparent"
                    border.width: Math.max(1, Math.round(1.2 * Theme.scale))
                    border.color: rb.set ? Theme.accent : Theme.dim
                }
                Rectangle {
                    y: Math.round(1 * Theme.scale)
                    width: parent.width
                    height: Math.round(3.5 * Theme.scale)
                    radius: Math.round(1.5 * Theme.scale)
                    color: rb.set ? Theme.accent : Theme.dim
                }
            }
            Text {
                id: rbText
                anchors.verticalCenter: parent.verticalCenter
                text: an.rangeLabel(an.rangeFrom, an.rangeTo, an.rangePreset)
                color: rb.set ? Theme.accent : Theme.text
                font.pixelSize: Theme.fontSmall
                font.family: Theme.fontFamily
                font.features: { "tnum": 1 }
            }
            Text {
                anchors.verticalCenter: parent.verticalCenter
                text: an.pickerOpen ? "▴" : "▾"
                color: Theme.dim
                font.pixelSize: Theme.fontSmall
            }
        }
        MouseArea {
            id: rbArea
            anchors.fill: parent
            hoverEnabled: true
            cursorShape: Qt.PointingHandCursor
            onClicked: {
                const p = rb.mapToItem(an, rb.width, rb.height);
                picker.x = Math.max(0, p.x - picker.width);
                picker.y = p.y + Math.round(6 * Theme.scale);
                picker.reset();
                an.pickerOpen = true;
            }
        }
    }

    // A whole number typed in; empty means 0.
    component NumField: Rectangle {
        id: nf
        property int value
        property string placeholder
        signal edited(int v)
        anchors.verticalCenter: parent.verticalCenter
        width: Math.round(40 * Theme.scale)
        height: input.implicitHeight + Theme.pad
        radius: height / 2
        color: Qt.rgba(1, 1, 1, 0.07)
        border.color: input.activeFocus ? Theme.accent : Theme.panelEdge
        TextInput {
            id: input
            anchors.fill: parent
            horizontalAlignment: TextInput.AlignHCenter
            verticalAlignment: TextInput.AlignVCenter
            text: nf.value ? String(nf.value) : ""
            validator: IntValidator { bottom: 0; top: 9999 }
            color: Theme.text
            font.pixelSize: Theme.fontSmall
            font.family: Theme.fontFamily
            selectByMouse: true
            onTextEdited: nf.edited(parseInt(text) || 0)
            Text {
                visible: !input.text
                anchors.centerIn: parent
                text: nf.placeholder
                color: Theme.dim
                font: input.font
            }
        }
    }

    // Every name you've played, so "Me" works with the game closed.
    readonly property string localName: {
        const me = client.players.find(p => p.isLocal);
        return me ? me.name : "";
    }
    onLocalNameChanged: if (localName) settings.addMyName(localName)

    // One entry per player per fight, oldest first.
    readonly property var runs: {
        const mine = settings.myNames;
        const out = [];
        for (const f of client.history) {
            const seconds = Math.max(1, f.durationMs / 1000);
            for (const p of f.players) {
                // Actors the roster never named: not anyone to compare.
                if (p.name.startsWith("#")) continue;
                out.push({
                    fightId: f.id, boss: f.bossName || "Unknown", start: f.startTimeMs, durationMs: f.durationMs, killed: f.killed,
                    player: p.name, job: p.job, jobKey: p.jobKey, isMe: mine.includes(p.name),
                    dps: p.dps, damage: p.damage, share: f.totalDamage > 0 ? p.damage / f.totalDamage : 0,
                    // Missing from a daemon older than the overlay.
                    critRate: p.critRate || 0, backRate: p.backRate || 0, active: p.active || 0,
                    healPs: (p.heal || 0) / seconds, takenPs: (p.damageTaken || 0) / seconds, deaths: p.deaths || 0, deathMs: p.deathMs || [], damageBins: p.damageBins || [],
                    gearScore: p.gearScore || 0, combatPower: p.combatPower || 0
                });
            }
        }
        return out.sort((a, b) => a.start - b.start);
    }

    readonly property var filtered: {
        const from = rangeFrom, to = rangeTo || Infinity;
        const minMs = minMinutes * 60000;
        const f = filters;
        return runs.filter(r => r.start >= from && r.start <= to && r.durationMs >= minMs && (!killsOnly || r.killed) && (!meOnly || r.isMe)
            && Object.keys(f).every(k => keyOf(r, k) === f[k]));
    }

    readonly property var rows: {
        const g = group;
        const byKey = {};
        for (const r of filtered) {
            const k = keyOf(r, g);
            (byKey[k] = byKey[k] || []).push(r);
        }
        const sum = (rs, f) => rs.reduce((t, r) => t + f(r), 0);
        const avg = (rs, f) => sum(rs, f) / rs.length;
        // A run is the whole party: its amounts add up, its rates average.
        const add = g === "run" ? sum : avg;
        const out = Object.keys(byKey).map(key => {
            const rs = byKey[key];
            const last = rs[rs.length - 1];
            const avgDps = add(rs, r => r.dps);
            return {
                key: key, runs: rs, count: rs.length,
                label: g === "player" ? last.player : g === "job" ? last.job : last.boss,
                job: last.job, jobKey: g === "boss" || g === "run" ? "" : last.jobKey,
                isMe: g === "player" ? last.isMe : g === "run" && rs.some(r => r.isMe),
                start: last.start, durationMs: last.durationMs, killed: last.killed,
                avgDps: avgDps, bestDps: Math.max(...rs.map(r => r.dps)),
                share: add(rs, r => r.share), critRate: avg(rs, r => r.critRate), backRate: avg(rs, r => r.backRate), active: avg(rs, r => r.active),
                healPs: add(rs, r => r.healPs), takenPs: add(rs, r => r.takenPs), deaths: add(rs, r => r.deaths),
                killRate: avg(rs, r => r.killed ? 1 : 0),
                // The last 5 runs against all of them.
                trend: rs.length >= 6 ? avg(rs.slice(-5), r => r.dps) / Math.max(1, avgDps) - 1 : NaN
            };
        });
        const k = sortKey, dir = sortDesc ? -1 : 1;
        const num = v => isNaN(v) ? -Infinity : Number(v);
        return out.sort((a, b) => dir * (typeof a[k] === "string" ? a[k].localeCompare(b[k]) : num(a[k]) - num(b[k])));
    }

    // The picked row; else yours; else the top one.
    readonly property var sel: rows.find(r => r.key === selectedKey) || rows.find(r => r.isMe) || rows[0] || null
    // What the pane's "best by" list is broken down by.
    readonly property string other: group === "player" ? "boss" : "player"

    readonly property var groupNames: ({ player: "Player", job: "Class", boss: "Boss", run: "Run" })
    readonly property int colW: Math.round(62 * Theme.scale)
    readonly property var common: [
        { key: "share", title: "Share", fmt: v => Theme.percent(v, 0) },
        { key: "critRate", title: "Crit", fmt: v => Theme.percent(v, 0) },
        { key: "backRate", title: "Back", fmt: v => Theme.percent(v, 0) },
        { key: "active", title: "Active", fmt: v => Theme.percent(v, 0) },
        { key: "healPs", title: "Heal/s", fmt: v => v > 0 ? Theme.compact(v) : "–" },
        { key: "takenPs", title: "Taken/s", fmt: v => Theme.compact(v) }
    ]
    readonly property var columns: group === "run" ? [
        { key: "start", title: "Date", w: 1.7, fmt: v => new Date(v).toLocaleString(Qt.locale(), "d MMM HH:mm") },
        { key: "durationMs", title: "Time", fmt: v => Theme.duration(v) },
        { key: "avgDps", title: "DPS", main: true, fmt: v => Theme.compact(v) },
        { key: "count", title: "Players", fmt: v => String(v) }
    ].concat(common.filter(c => c.key !== "share"), [
        { key: "deaths", title: "Deaths", fmt: v => v > 0 ? String(v) : "–" },
        { key: "killed", title: "Kill", fmt: v => v ? "✓" : "", color: () => Theme.good }
    ]) : [
        { key: "count", title: "Runs", fmt: v => String(v) },
        { key: "avgDps", title: "Avg DPS", main: true, fmt: v => Theme.compact(v) },
        { key: "bestDps", title: "Best DPS", fmt: v => Theme.compact(v) }
    ].concat(common, [
        { key: "deaths", title: "Deaths", fmt: v => v.toFixed(1) },
        { key: "killRate", title: "Kill %", fmt: v => Theme.percent(v, 0) },
        {
            key: "trend", title: "Trend",
            fmt: v => isNaN(v) ? "–" : (v >= 0 ? "▲ " : "▼ ") + Math.abs(v * 100).toFixed(0) + "%",
            color: v => isNaN(v) ? Theme.faint : v >= 0 ? Theme.good : Theme.bad
        }
    ])

    implicitHeight: card.implicitHeight
    readonly property int width_: Math.max(Math.round(900 * Theme.scale), width)
    readonly property int colsW: columns.reduce((t, c) => t + Math.round((c.w || 1) * colW), 0)
    // The pane takes what the table doesn't need (names get 160px), up to 640.
    readonly property int paneW: Math.max(Math.round(300 * Theme.scale),
        Math.min(Math.round(640 * Theme.scale), width_ - Theme.pad * 3 - colsW - Math.round(160 * Theme.scale)))
    readonly property int tableW: width_ - Theme.pad * 3 - paneW
    readonly property int labelW: Math.max(Math.round(80 * Theme.scale), tableW - colsW)

    onOpenChanged: if (open) client.requestHistory()
    Connections {
        target: an.client
        function onFightSaved() {
            if (an.open) an.client.requestHistory();
        }
    }

    function keyOf(r, g) {
        return g === "player" ? r.player : g === "job" ? r.jobKey : g === "boss" ? r.boss : r.fightId;
    }
    function setGroup(g) {
        group = g;
        // Runs and bosses: the latest first.
        sortKey = g === "run" || g === "boss" ? "start" : "avgDps";
        sortDesc = true;
        selectedKey = "";
    }
    function sortBy(k) {
        if (sortKey === k) sortDesc = !sortDesc;
        else {
            sortKey = k;
            sortDesc = k !== "label";
        }
    }
    // `filters` is replaced, never mutated, so bindings see the change.
    function setFilter(g, value) {
        const f = Object.assign({}, filters);
        if (value === undefined) delete f[g];
        else f[g] = value;
        filters = f;
    }
    function filterLabel(g, value) {
        const r = runs.find(r => keyOf(r, g) === value);
        return groupNames[g] + ": " + (g === "job" && r ? r.job : value);
    }
    function date(ms) {
        return new Date(ms).toLocaleString(Qt.locale(), "d MMM");
    }
    // The pane's DPS chart, sliced like the death timeline: the row's damage in
    // each slice over the time its fights lasted there, so a boss's slice is the
    // party's average DPS then and a player's is theirs. The daemon bins per 30s.
    function dpsView(s, group) {
        if (!s) return null;
        const spanMs = Math.max(1, ...s.runs.map(r => r.durationMs));
        const binMs = spanMs <= 10 * 60000 ? 30000 : 60000;
        const n = Math.ceil(spanMs / binMs);
        const dmg = new Array(n).fill(0);
        const fights = {};
        for (const r of s.runs) {
            r.damageBins.forEach((d, i) => dmg[Math.min(n - 1, Math.floor(i * 30000 / binMs))] += d);
            fights[r.fightId] = r.durationMs;
        }
        // Fights saved by a daemon without the bins.
        if (!dmg.some(d => d > 0)) return null;
        const lasted = dmg.map((_, i) => Object.values(fights).reduce((t, ms) => t + Math.max(0, Math.min(binMs, ms - i * binMs)), 0));
        const runs = Object.keys(fights).length;
        const who = group !== "boss" ? "DPS" : meOnly ? "Your DPS" : "Party DPS";
        return { spanMs: spanMs, binMs: binMs, runs: runs, bins: dmg.map((d, i) => lasted[i] ? d * 1000 / lasted[i] : 0),
                 title: who + " over the fight" + (runs > 1 ? "  ·  average of " + runs + " runs" : "") };
    }
    // The pane's death timeline. A run: a lane for each player in that fight who
    // died. A boss: deaths across its runs, counted per 30s (per 1 min past 10 min).
    function deathView(s, group, history) {
        if (!s || (group !== "run" && group !== "boss")) return null;
        if (group === "run") {
            const r = s.runs[0];
            const f = history.find(f => f.id === r.fightId);
            if (!f) return null;
            const lanes = f.players.filter(p => (p.deathMs || []).length && !p.name.startsWith("#"))
                .map(p => ({ label: p.name, jobKey: p.jobKey, bold: s.runs.some(x => x.isMe && x.player === p.name), ms: p.deathMs }));
            const n = lanes.reduce((t, l) => t + l.ms.length, 0);
            return { spanMs: f.durationMs, lanes: lanes, bins: [], binMs: 30000, runs: 1,
                     title: n ? "Deaths in this run" : "No deaths in this run" };
        }
        const spanMs = Math.max(1, ...s.runs.map(r => r.durationMs));
        const binMs = spanMs <= 10 * 60000 ? 30000 : 60000;
        const bins = new Array(Math.ceil(spanMs / binMs)).fill(0);
        let n = 0;
        for (const r of s.runs) for (const ms of r.deathMs) {
            bins[Math.min(bins.length - 1, Math.floor(ms / binMs))]++;
            n++;
        }
        const runs = new Set(s.runs.map(r => r.fightId)).size;
        return { spanMs: spanMs, lanes: [], bins: n ? bins : [], binMs: binMs, runs: runs,
                 title: n ? "When deaths happen  ·  " + n + " in " + runs + (runs === 1 ? " run" : " runs") : "No deaths in these runs" };
    }

    Panel {
        id: card
        width: an.width_
        color: Qt.alpha(Theme.panel, 1)

        // ── title ──
        Item {
            width: an.width_ - Theme.pad * 2
            height: Math.round(22 * Theme.scale)
            Row {
                anchors.left: parent.left
                anchors.verticalCenter: parent.verticalCenter
                spacing: Theme.pad
                Text {
                    text: "Analytics"
                    color: Theme.text
                    font.pixelSize: Theme.fontNormal
                    font.family: Theme.fontFamily
                    font.bold: true
                }
                Text {
                    anchors.verticalCenter: parent.verticalCenter
                    text: an.filtered.length + " runs  ·  last " + an.client.history.length + " fights"
                    color: Theme.faint
                    font.pixelSize: Theme.fontSmall
                    font.family: Theme.fontFamily
                }
            }
        }

        // ── grouping and filters ──
        Item {
            width: an.width_ - Theme.pad * 2
            height: groupRow.height
            Row {
                id: groupRow
                spacing: Math.round(4 * Theme.scale)
                Text {
                    anchors.verticalCenter: parent.verticalCenter
                    text: "Group by"
                    color: Theme.dim
                    font.pixelSize: Theme.fontSmall
                    font.family: Theme.fontFamily
                }
                Repeater {
                    model: ["player", "job", "boss", "run"]
                    Chip {
                        required property string modelData
                        label: modelData === "run" ? "Runs" : an.groupNames[modelData]
                        checked: an.group === modelData
                        onClicked: an.setGroup(modelData)
                    }
                }
                Text {
                    visible: an.group === "boss"
                    anchors.verticalCenter: parent.verticalCenter
                    leftPadding: Theme.pad
                    text: "Sort"
                    color: Theme.dim
                    font.pixelSize: Theme.fontSmall
                    font.family: Theme.fontFamily
                }
                Chip {
                    visible: an.group === "boss"
                    label: "Latest"
                    checked: an.sortKey === "start" && an.sortDesc
                    onClicked: { an.sortKey = "start"; an.sortDesc = true; }
                }
                Chip {
                    visible: an.group === "boss"
                    label: "A–Z"
                    checked: an.sortKey === "label" && !an.sortDesc
                    onClicked: { an.sortKey = "label"; an.sortDesc = false; }
                }
            }
            Row {
                anchors.right: parent.right
                spacing: Math.round(4 * Theme.scale)
                RangeButton { id: rangeButton }
                FilterText { text: "Min"; leftPadding: Theme.pad }
                NumField {
                    value: an.minMinutes
                    placeholder: "0"
                    onEdited: v => an.minMinutes = v
                }
                FilterText { text: "min"; rightPadding: Theme.pad }
                Chip {
                    label: "Kills only"
                    checked: an.killsOnly
                    onClicked: an.killsOnly = !an.killsOnly
                }
                Chip {
                    label: "Me only"
                    checked: an.meOnly
                    onClicked: an.meOnly = !an.meOnly
                }
            }
        }
        Row {
            visible: Object.keys(an.filters).length > 0
            spacing: Math.round(4 * Theme.scale)
            Repeater {
                model: Object.keys(an.filters)
                Chip {
                    required property string modelData
                    label: an.filterLabel(modelData, an.filters[modelData]) + "  ✕"
                    onClicked: an.setFilter(modelData)
                }
            }
        }

        Row {
            spacing: Theme.pad

            // ── table ──
            Column {
                width: an.tableW
                spacing: Math.round(3 * Theme.scale)

                Row {
                    Repeater {
                        model: [{ key: "label", title: an.groupNames[an.group] }].concat(an.columns)
                        Text {
                            required property var modelData
                            required property int index
                            width: index === 0 ? an.labelW : Math.round((modelData.w || 1) * an.colW)
                            leftPadding: index === 0 ? Math.round(6 * Theme.scale) : 0
                            rightPadding: index === 0 ? 0 : Math.round(6 * Theme.scale)
                            horizontalAlignment: index === 0 ? Text.AlignLeft : Text.AlignRight
                            text: modelData.title + (an.sortKey === modelData.key ? (an.sortDesc ? " ▼" : " ▲") : "")
                            color: an.sortKey === modelData.key ? Theme.text : Theme.dim
                            font.pixelSize: Theme.fontSmall
                            font.family: Theme.fontFamily
                            elide: Text.ElideRight
                            MouseArea {
                                anchors.fill: parent
                                cursorShape: Qt.PointingHandCursor
                                onClicked: an.sortBy(parent.modelData.key)
                            }
                        }
                    }
                }

                ListView {
                    visible: count > 0
                    width: an.tableW
                    height: Math.min(contentHeight, Math.round(520 * Theme.scale))
                    clip: true
                    spacing: Math.round(2 * Theme.scale)
                    boundsBehavior: Flickable.StopAtBounds
                    model: an.rows
                    delegate: Rectangle {
                        id: line
                        required property var modelData
                        readonly property bool picked: an.sel !== null && an.sel.key === modelData.key
                        width: an.tableW
                        height: Theme.rowHeight
                        radius: 4
                        color: area.containsMouse ? Qt.rgba(1, 1, 1, 0.10) : Theme.rowBg
                        border.color: picked ? Theme.accent : modelData.isMe ? Qt.rgba(1, 1, 1, 0.35) : "transparent"
                        border.width: 1

                        Row {
                            anchors.verticalCenter: parent.verticalCenter
                            Row {
                                width: an.labelW
                                leftPadding: Math.round(6 * Theme.scale)
                                spacing: Math.round(6 * Theme.scale)
                                Image {
                                    id: icon
                                    anchors.verticalCenter: parent.verticalCenter
                                    visible: line.modelData.jobKey !== ""
                                    width: Math.round(16 * Theme.scale)
                                    height: width
                                    fillMode: Image.PreserveAspectFit
                                    smooth: true
                                    mipmap: true
                                    source: line.modelData.jobKey ? Qt.resolvedUrl("icons/" + line.modelData.jobKey + ".png") : ""
                                }
                                Text {
                                    width: an.labelW - Math.round(6 * Theme.scale) - (icon.visible ? icon.width + Math.round(6 * Theme.scale) : 0)
                                    text: line.modelData.label
                                    color: line.modelData.jobKey && an.group !== "boss" ? Theme.jobColor(line.modelData.jobKey) : Theme.text
                                    font.pixelSize: Theme.fontNormal
                                    font.family: Theme.fontFamily
                                    font.bold: line.modelData.isMe
                                    elide: Text.ElideRight
                                }
                            }
                            Repeater {
                                model: an.columns
                                Text {
                                    required property var modelData
                                    readonly property var value: line.modelData[modelData.key]
                                    width: Math.round((modelData.w || 1) * an.colW)
                                    rightPadding: Math.round(6 * Theme.scale)
                                    horizontalAlignment: Text.AlignRight
                                    text: modelData.fmt(value)
                                    color: modelData.color ? modelData.color(value) : modelData.main ? Theme.text : Theme.dim
                                    font.pixelSize: modelData.main ? Theme.fontNormal : Theme.fontSmall
                                    font.family: Theme.fontFamily
                                    font.features: { "tnum": 1 }
                                }
                            }
                        }
                        MouseArea {
                            id: area
                            anchors.fill: parent
                            hoverEnabled: true
                            cursorShape: Qt.PointingHandCursor
                            onClicked: an.selectedKey = line.modelData.key
                        }
                    }
                }
                Text {
                    visible: an.rows.length === 0
                    text: an.client.history.length === 0 ? "No saved fights yet. Boss fights are saved when they end." : "No runs match these filters."
                    color: Theme.faint
                    font.pixelSize: Theme.fontSmall
                    font.family: Theme.fontFamily
                }
            }

            // ── the picked row ──
            Rectangle {
                width: an.paneW
                height: pane.implicitHeight + Theme.pad * 2
                radius: 4
                color: Theme.rowBg
                visible: an.sel !== null

                Column {
                    id: pane
                    x: Theme.pad
                    y: Theme.pad
                    width: an.paneW - Theme.pad * 2
                    spacing: Math.round(4 * Theme.scale)
                    readonly property var s: an.sel

                    Text {
                        width: parent.width
                        text: !pane.s ? "" : (pane.s.isMe ? "★ " : "") + pane.s.label + (an.group === "player" ? "  ·  " + pane.s.job : "")
                        color: pane.s && pane.s.jobKey && an.group !== "boss" ? Theme.jobColor(pane.s.jobKey) : Theme.text
                        font.pixelSize: Theme.fontLarge
                        font.family: Theme.fontFamily
                        font.bold: true
                        elide: Text.ElideRight
                    }
                    Text {
                        width: parent.width
                        wrapMode: Text.Wrap
                        text: !pane.s ? "" : an.group === "run"
                            ? new Date(pane.s.start).toLocaleString(Qt.locale(), "ddd d MMM, HH:mm") + "  ·  " + Theme.duration(pane.s.durationMs) + (pane.s.killed ? "  ·  killed" : "")
                            : pane.s.count + " runs  ·  avg " + Theme.compact(pane.s.avgDps) + "/s  ·  best " + Theme.compact(pane.s.bestDps) + "/s"
                        color: Theme.dim
                        font.pixelSize: Theme.fontSmall
                        font.family: Theme.fontFamily
                        font.features: { "tnum": 1 }
                    }

                    // Average DPS in each slice of the fight.
                    Item { width: 1; height: Math.round(4 * Theme.scale); visible: spark.visible }
                    DeathTimeline {
                        id: spark
                        readonly property var view: an.dpsView(pane.s, an.group)
                        visible: view !== null
                        width: pane.width
                        title: view ? view.title : ""
                        spanMs: view ? view.spanMs : 60000
                        bins: view ? view.bins : []
                        binMs: view ? view.binMs : 30000
                        runs: view ? view.runs : 1
                        barColor: Theme.accent
                        fmt: v => Theme.compact(v)
                        describe: v => Theme.compact(v) + "/s" + (spark.runs > 1 ? " on average over " + spark.runs + " runs" : "")
                    }

                    // Who died when (a run), or when deaths cluster (a boss).
                    Item { width: 1; height: Math.round(4 * Theme.scale); visible: deaths.visible }
                    DeathTimeline {
                        id: deaths
                        readonly property var view: an.deathView(pane.s, an.group, an.client.history)
                        visible: view !== null
                        width: pane.width
                        title: view ? view.title : ""
                        spanMs: view ? view.spanMs : 60000
                        lanes: view ? view.lanes : []
                        bins: view ? view.bins : []
                        binMs: view ? view.binMs : 30000
                        runs: view ? view.runs : 1
                    }

                    // Best run per boss (or per player).
                    Item { width: 1; height: Math.round(4 * Theme.scale); visible: bests.count > 0 }
                    Text {
                        visible: bests.count > 0
                        text: "Best by " + an.groupNames[an.other].toLowerCase()
                        color: Theme.faint
                        font.pixelSize: Theme.fontSmall
                        font.family: Theme.fontFamily
                    }
                    Repeater {
                        id: bests
                        model: {
                            if (!pane.s || an.group === "run") return [];
                            const best = {};
                            for (const r of pane.s.runs) {
                                const k = an.keyOf(r, an.other);
                                if (!best[k] || r.dps > best[k].dps) best[k] = r;
                            }
                            return Object.values(best).sort((a, b) => b.dps - a.dps).slice(0, 8);
                        }
                        Rectangle {
                            id: best
                            required property var modelData
                            width: pane.width
                            height: Math.round(20 * Theme.scale)
                            radius: 3
                            color: bestArea.containsMouse ? Qt.rgba(1, 1, 1, 0.10) : "transparent"
                            Text {
                                anchors.left: parent.left
                                anchors.leftMargin: Math.round(4 * Theme.scale)
                                anchors.verticalCenter: parent.verticalCenter
                                width: parent.width * 0.5
                                text: an.other === "boss" ? best.modelData.boss : best.modelData.player
                                color: an.other === "player" ? Theme.jobColor(best.modelData.jobKey) : Theme.text
                                font.pixelSize: Theme.fontSmall
                                font.family: Theme.fontFamily
                                font.bold: an.other === "player" && best.modelData.isMe
                                elide: Text.ElideRight
                            }
                            Text {
                                anchors.right: parent.right
                                anchors.rightMargin: Math.round(4 * Theme.scale)
                                anchors.verticalCenter: parent.verticalCenter
                                text: Theme.compact(best.modelData.dps) + "/s   " + an.date(best.modelData.start) + "  ›"
                                color: Theme.dim
                                font.pixelSize: Theme.fontSmall
                                font.family: Theme.fontFamily
                                font.features: { "tnum": 1 }
                            }
                            MouseArea {
                                id: bestArea
                                anchors.fill: parent
                                hoverEnabled: true
                                cursorShape: Qt.PointingHandCursor
                                onClicked: an.setFilter(an.other, an.keyOf(best.modelData, an.other))
                            }
                        }
                    }

                    Item { width: 1; height: Math.round(4 * Theme.scale) }
                    Text {
                        width: parent.width
                        wrapMode: Text.Wrap
                        lineHeight: 1.2
                        text: {
                            const s = pane.s;
                            if (!s) return "";
                            const per = an.group === "run" ? "" : " per run";
                            const lines = [
                                "Crit " + Theme.percent(s.critRate, 0) + "  ·  back " + Theme.percent(s.backRate, 0) + (an.group === "run" ? "" : "  ·  share " + Theme.percent(s.share, 0)),
                                (s.healPs > 0 ? "Heal " + Theme.compact(s.healPs) + "/s  ·  " : "") + "taken " + Theme.compact(s.takenPs) + "/s",
                                (an.group === "run" ? s.deaths : s.deaths.toFixed(1)) + " deaths" + per + (an.group === "run" ? "" : "  ·  " + Theme.percent(s.killRate, 0) + " kills")
                            ];
                            // The newest gear: it changes over time.
                            const geared = s.runs.filter(r => r.gearScore > 0);
                            if (an.group === "player" && geared.length) {
                                const g = geared[geared.length - 1];
                                lines.push("Gear score " + g.gearScore + "  ·  CP " + Theme.compact(g.combatPower));
                            }
                            return lines.join("\n");
                        }
                        color: Theme.dim
                        font.pixelSize: Theme.fontSmall
                        font.family: Theme.fontFamily
                        font.features: { "tnum": 1 }
                    }

                    Item { width: 1; height: Math.round(4 * Theme.scale) }
                    Chip {
                        visible: an.group === "run"
                        label: "Open fight ›"
                        onClicked: an.openFight(pane.s.runs[0].fightId)
                    }
                    Chip {
                        visible: an.group !== "run"
                        label: "Only this " + an.groupNames[an.group].toLowerCase() + " ›"
                        // Narrow to it and break it down by the other side.
                        onClicked: {
                            const g = an.group, key = pane.s.key;
                            an.setFilter(g, key);
                            an.setGroup(g === "boss" || g === "job" ? "player" : "boss");
                        }
                    }
                }
            }
        }
    }

    // ── the date range picker, over the page ──
    MouseArea {
        anchors.fill: parent
        z: 10
        visible: an.pickerOpen
        onClicked: an.pickerOpen = false
    }
    DateRangePicker {
        id: picker
        z: 11
        visible: opacity > 0
        opacity: an.pickerOpen ? 1 : 0
        Behavior on opacity { NumberAnimation { duration: 120; easing.type: Easing.OutCubic } }
        transform: Translate {
            y: an.pickerOpen ? 0 : -Math.round(6 * Theme.scale)
            Behavior on y { NumberAnimation { duration: 140; easing.type: Easing.OutCubic } }
        }
        fromMs: an.rangeFrom
        toMs: an.rangeTo
        preset: an.rangePreset
        starts: an.client.history.map(f => f.startTimeMs)
        onPicked: (from, to, preset) => {
            an.rangeFrom = from;
            an.rangeTo = to;
            an.rangePreset = preset;
        }
        onClosed: an.pickerOpen = false
    }
}
