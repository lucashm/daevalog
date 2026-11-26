import QtQuick

// A from/to range for the analytics filter: presets, a month calendar (a day
// with saved fights carries a dot, brighter for more) and the from/to times.
// Each change applies at once; `picked` carries it out. 0 = an open end.
Item {
    id: dp

    property real fromMs: 0
    property real toMs: 0
    property string preset: ""
    // Saved fights' start times, for the dots and counts.
    property var starts: []

    signal picked(real from, real to, string preset)
    signal closed()

    readonly property int cell: Math.round(34 * Theme.scale)
    readonly property int gap: Math.round(12 * Theme.scale)
    // First of the month on show.
    property real viewMs: firstOfMonth(Date.now())
    // The first day clicked, waiting for the last; 0 when none.
    property real anchorDay: 0
    property real hoverDay: 0

    readonly property var counts: {
        const c = {};
        for (const t of starts) {
            const k = startOfDay(t);
            c[k] = (c[k] || 0) + 1;
        }
        return c;
    }
    readonly property int peak: Math.max(1, ...Object.values(counts))
    // Opaque, so the band and its rounded week ends don't darken where they overlap.
    readonly property color band: Qt.tint(Qt.rgba(0.08, 0.09, 0.12, 1), Qt.alpha(Theme.accent, anchorDay ? 0.10 : 0.16))
    property real today: startOfDay(Date.now())

    // What the calendar shows as picked: the range, or the one being drawn.
    readonly property real selFrom: anchorDay ? Math.min(anchorDay, hoverDay || anchorDay) : fromMs
    readonly property real selTo: anchorDay ? endOfDay(Math.max(anchorDay, hoverDay || anchorDay)) : (toMs || (fromMs ? Date.now() : 0))

    readonly property var presets: {
        const now = Date.now();
        return [
            { name: "All time", from: 0, to: 0 },
            { name: "Today", from: today, to: 0 },
            { name: "Yesterday", from: addDays(today, -1), to: endOfDay(addDays(today, -1)) },
            { name: "Last 24 hours", from: now - 86400000, to: 0 },
            { name: "Last 7 days", from: addDays(today, -6), to: 0 },
            { name: "Last 30 days", from: addDays(today, -29), to: 0 },
            { name: "This month", from: firstOfMonth(now), to: 0 },
            { name: "Last month", from: addMonths(firstOfMonth(now), -1), to: firstOfMonth(now) - 1 }
        ];
    }

    function startOfDay(ms) { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); }
    function endOfDay(ms) { const d = new Date(ms); d.setHours(23, 59, 59, 999); return d.getTime(); }
    function addDays(ms, n) { const d = new Date(ms); d.setDate(d.getDate() + n); return d.getTime(); }
    function firstOfMonth(ms) { const d = new Date(startOfDay(ms)); d.setDate(1); return d.getTime(); }
    function addMonths(ms, n) { const d = new Date(ms); d.setMonth(d.getMonth() + n); return d.getTime(); }
    function fmt(ms, f) { return new Date(ms).toLocaleString(Qt.locale(), f); }
    function hhmm(ms) { return ms ? fmt(ms, "HH:mm") : "--:--"; }
    function plural(n, w) { return n + " " + w + (n === 1 ? "" : "s"); }
    function fightsBetween(a, b) {
        let n = 0;
        for (const t of starts) if ((!a || t >= a) && (!b || t <= b)) n++;
        return n;
    }

    // The 6 weeks on show, from the locale's first weekday.
    readonly property var days: {
        const first = new Date(viewMs);
        const back = (first.getDay() - Qt.locale().firstDayOfWeek + 7) % 7;
        const start = addDays(viewMs, -back);
        return Array.from({ length: 42 }, (_, i) => addDays(start, i));
    }

    // Opened: show the picked month, nothing half-drawn.
    function reset() {
        today = startOfDay(Date.now());
        viewMs = firstOfMonth(fromMs || Date.now());
        anchorDay = 0;
        hoverDay = 0;
        forceActiveFocus();
    }
    function clickDay(day) {
        if (!anchorDay) {
            // One click: that whole day. A second: the range between.
            anchorDay = day;
            picked(day, endOfDay(day), "");
        } else {
            const a = Math.min(anchorDay, day), b = Math.max(anchorDay, day);
            anchorDay = 0;
            picked(a, endOfDay(b), "");
        }
    }
    // "18:30" on the day of `ms` (today when open); null when not a time.
    function withTime(ms, text) {
        const m = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
        if (!m || +m[1] > 23 || +m[2] > 59) return null;
        const d = new Date(ms || Date.now());
        d.setHours(+m[1], +m[2], 0, 0);
        return d.getTime();
    }

    implicitWidth: box.width
    implicitHeight: box.height
    Keys.onEscapePressed: closed()

    // Soft shadow.
    Repeater {
        model: 3
        Rectangle {
            required property int index
            x: -index * 2
            y: -index * 2 + 4
            width: box.width + index * 4
            height: box.height + index * 4
            radius: Theme.radius + index * 2
            color: Qt.rgba(0, 0, 0, 0.16 - index * 0.04)
        }
    }

    Rectangle {
        id: box
        width: body.implicitWidth + dp.gap * 2
        height: body.implicitHeight + dp.gap * 2
        radius: Theme.radius
        color: Qt.rgba(0.08, 0.09, 0.12, 1)
        border.color: Qt.rgba(1, 1, 1, 0.12)
        // Clicks inside don't reach the page's close-on-click catcher.
        MouseArea { anchors.fill: parent }

        Column {
            id: body
            x: dp.gap
            y: dp.gap
            spacing: dp.gap

            Row {
                spacing: dp.gap

                // ── presets ──
                Column {
                    id: presetCol
                    width: Math.round(118 * Theme.scale)
                    spacing: Math.round(2 * Theme.scale)
                    Text {
                        text: "Quick pick"
                        color: Theme.faint
                        font.pixelSize: Theme.fontSmall
                        font.family: Theme.fontFamily
                        bottomPadding: Math.round(4 * Theme.scale)
                        leftPadding: Math.round(12 * Theme.scale)
                    }
                    Repeater {
                        model: dp.presets
                        Rectangle {
                            id: pr
                            required property var modelData
                            readonly property bool on: dp.preset === modelData.name || (!dp.preset && modelData.name === "All time" && !dp.fromMs && !dp.toMs)
                            width: presetCol.width
                            height: Math.round(26 * Theme.scale)
                            radius: Math.round(6 * Theme.scale)
                            color: on ? Qt.alpha(Theme.accent, 0.16) : prArea.containsMouse ? Qt.rgba(1, 1, 1, 0.07) : "transparent"
                            Rectangle {
                                visible: pr.on
                                x: Math.round(3 * Theme.scale)
                                anchors.verticalCenter: parent.verticalCenter
                                width: Math.round(3 * Theme.scale)
                                height: parent.height - Math.round(10 * Theme.scale)
                                radius: width / 2
                                color: Theme.accent
                            }
                            Text {
                                x: Math.round(12 * Theme.scale)
                                anchors.verticalCenter: parent.verticalCenter
                                text: pr.modelData.name
                                color: pr.on ? Theme.accent : Theme.text
                                font.pixelSize: Theme.fontSmall
                                font.family: Theme.fontFamily
                                font.bold: pr.on
                            }
                            MouseArea {
                                id: prArea
                                anchors.fill: parent
                                hoverEnabled: true
                                cursorShape: Qt.PointingHandCursor
                                onClicked: {
                                    dp.anchorDay = 0;
                                    dp.picked(pr.modelData.from, pr.modelData.to, pr.modelData.name === "All time" ? "" : pr.modelData.name);
                                    dp.viewMs = dp.firstOfMonth(pr.modelData.from || Date.now());
                                }
                            }
                        }
                    }
                }

                Rectangle { width: 1; height: cal.height; color: Qt.rgba(1, 1, 1, 0.08) }

                // ── calendar ──
                Column {
                    id: cal
                    spacing: Math.round(4 * Theme.scale)

                    Item {
                        width: dp.cell * 7
                        height: Math.round(28 * Theme.scale)
                        NavButton { anchors.left: parent.left; glyph: "‹"; onClicked: dp.viewMs = dp.addMonths(dp.viewMs, -1) }
                        Text {
                            anchors.centerIn: parent
                            text: dp.fmt(dp.viewMs, "MMMM yyyy")
                            color: Theme.text
                            font.pixelSize: Theme.fontNormal
                            font.family: Theme.fontFamily
                            font.bold: true
                        }
                        NavButton {
                            anchors.right: parent.right
                            glyph: "›"
                            enabled: dp.viewMs < dp.firstOfMonth(Date.now())
                            onClicked: dp.viewMs = dp.addMonths(dp.viewMs, 1)
                        }
                    }

                    Row {
                        Repeater {
                            model: 7
                            Text {
                                required property int index
                                width: dp.cell
                                horizontalAlignment: Text.AlignHCenter
                                text: Qt.locale().dayName((Qt.locale().firstDayOfWeek + index) % 7, Locale.ShortFormat).slice(0, 2)
                                color: Theme.faint
                                font.pixelSize: Theme.fontSmall
                                font.family: Theme.fontFamily
                            }
                        }
                    }

                    Grid {
                        columns: 7
                        Repeater {
                            model: dp.days
                            Item {
                                id: dc
                                required property real modelData
                                required property int index
                                readonly property bool inMonth: new Date(modelData).getMonth() === new Date(dp.viewMs).getMonth()
                                readonly property bool future: modelData > dp.today
                                readonly property bool isStart: dp.selFrom > 0 && modelData === dp.startOfDay(dp.selFrom)
                                readonly property bool isEnd: dp.selTo > 0 && modelData === dp.startOfDay(dp.selTo)
                                readonly property bool inRange: dp.selTo > 0 && dp.endOfDay(modelData) >= dp.selFrom && modelData <= dp.selTo
                                readonly property int n: dp.counts[modelData] || 0
                                readonly property int col: index % 7
                                readonly property int disc: Math.round(28 * Theme.scale)
                                width: dp.cell
                                height: dp.cell

                                // The range band, joined across the week, cut at its ends.
                                Rectangle {
                                    visible: dc.inRange && !(dc.isStart && dc.isEnd)
                                    x: dc.isStart || dc.col === 0 ? parent.width / 2 : 0
                                    width: (dc.isEnd || dc.col === 6 ? parent.width / 2 : parent.width) - x
                                    anchors.verticalCenter: parent.verticalCenter
                                    height: dc.disc
                                    color: dp.band
                                }
                                // Week edges inside the range end round.
                                Rectangle {
                                    visible: dc.inRange && !dc.isStart && !dc.isEnd && (dc.col === 0 || dc.col === 6)
                                    anchors.centerIn: parent
                                    width: dc.disc
                                    height: dc.disc
                                    radius: width / 2
                                    color: dp.band
                                }
                                Rectangle {
                                    anchors.centerIn: parent
                                    width: dc.disc
                                    height: dc.disc
                                    radius: width / 2
                                    color: dc.isStart || dc.isEnd ? Theme.accent
                                        : dayArea.containsMouse && !dc.future ? Qt.rgba(1, 1, 1, 0.10) : "transparent"
                                    border.width: dc.modelData === dp.today && !(dc.isStart || dc.isEnd) ? 1 : 0
                                    border.color: Theme.accent
                                }
                                Text {
                                    anchors.centerIn: parent
                                    anchors.verticalCenterOffset: dc.n ? -Math.round(2 * Theme.scale) : 0
                                    text: new Date(dc.modelData).getDate()
                                    color: dc.isStart || dc.isEnd ? "#1b1b1b"
                                        : dc.future ? Qt.alpha(Theme.faint, 0.5)
                                        : dc.inMonth ? Theme.text : Theme.faint
                                    font.pixelSize: Theme.fontSmall
                                    font.family: Theme.fontFamily
                                    font.bold: dc.isStart || dc.isEnd || dc.modelData === dp.today
                                    font.features: { "tnum": 1 }
                                }
                                // Days you played: brighter for more fights.
                                Rectangle {
                                    visible: dc.n > 0
                                    anchors.horizontalCenter: parent.horizontalCenter
                                    anchors.verticalCenter: parent.verticalCenter
                                    anchors.verticalCenterOffset: Math.round(8 * Theme.scale)
                                    width: Math.round(4 * Theme.scale)
                                    height: width
                                    radius: width / 2
                                    color: dc.isStart || dc.isEnd ? "#1b1b1b" : Theme.accent
                                    opacity: (dc.inMonth ? 1 : 0.5) * (0.35 + 0.65 * Math.sqrt(dc.n / dp.peak))
                                }
                                MouseArea {
                                    id: dayArea
                                    anchors.fill: parent
                                    hoverEnabled: true
                                    enabled: !dc.future
                                    cursorShape: Qt.PointingHandCursor
                                    onEntered: dp.hoverDay = dc.modelData
                                    onExited: if (dp.hoverDay === dc.modelData) dp.hoverDay = 0
                                    onClicked: dp.clickDay(dc.modelData)
                                }
                            }
                        }
                    }
                }
            }

            Rectangle { width: body.width; height: 1; color: Qt.rgba(1, 1, 1, 0.08) }

            // ── exact from / to ──
            Row {
                spacing: dp.gap
                TimeRow {
                    label: "From"
                    ms: dp.fromMs
                    apply: text => {
                        const t = dp.withTime(dp.fromMs, text);
                        if (t === null) return false;
                        dp.picked(t, dp.toMs && dp.toMs < t ? dp.endOfDay(t) : dp.toMs, "");
                        return true;
                    }
                }
                Text {
                    anchors.verticalCenter: parent.verticalCenter
                    text: "→"
                    color: Theme.faint
                    font.pixelSize: Theme.fontNormal
                }
                TimeRow {
                    label: "To"
                    ms: dp.toMs
                    openText: dp.fromMs ? "Now" : "Any"
                    apply: text => {
                        const t = dp.withTime(dp.toMs || Date.now(), text);
                        if (t === null) return false;
                        dp.picked(dp.fromMs && dp.fromMs > t ? dp.startOfDay(t) : dp.fromMs, t + 59999, "");
                        return true;
                    }
                }
            }

            // ── footer ──
            Item {
                width: body.width
                height: done.height
                Text {
                    anchors.verticalCenter: parent.verticalCenter
                    width: parent.width - done.width - dp.gap
                    elide: Text.ElideRight
                    text: dp.hoverDay
                        ? dp.fmt(dp.hoverDay, "dddd d MMMM") + "  ·  " + dp.plural(dp.counts[dp.hoverDay] || 0, "fight")
                        : dp.anchorDay ? "Click another day to make it a range"
                        : dp.plural(dp.fightsBetween(dp.fromMs, dp.toMs), "fight") + " in this range"
                    color: dp.hoverDay ? Theme.text : Theme.dim
                    font.pixelSize: Theme.fontSmall
                    font.family: Theme.fontFamily
                    font.features: { "tnum": 1 }
                }
                Chip {
                    id: done
                    anchors.right: parent.right
                    label: "Done"
                    checked: true
                    onClicked: dp.closed()
                }
            }
        }
    }

    component NavButton: Rectangle {
        id: nb
        property string glyph
        signal clicked()
        anchors.verticalCenter: parent.verticalCenter
        width: Math.round(28 * Theme.scale)
        height: width
        radius: width / 2
        opacity: enabled ? 1 : 0.3
        color: nbArea.containsMouse && enabled ? Qt.rgba(1, 1, 1, 0.10) : "transparent"
        Text {
            anchors.centerIn: parent
            anchors.verticalCenterOffset: -1
            text: nb.glyph
            color: Theme.text
            font.pixelSize: Theme.fontLarge
            font.family: Theme.fontFamily
        }
        MouseArea {
            id: nbArea
            anchors.fill: parent
            hoverEnabled: true
            cursorShape: Qt.PointingHandCursor
            onClicked: nb.clicked()
        }
    }

    // "From  Sat 22 Nov  [18:30]": the date from the calendar, the time typed.
    component TimeRow: Row {
        id: tr
        property string label
        property real ms
        property string openText: "Any"
        // Returns false to put the old time back.
        property var apply: text => false
        spacing: Math.round(6 * Theme.scale)
        Text {
            anchors.verticalCenter: parent.verticalCenter
            text: tr.label
            color: Theme.faint
            font.pixelSize: Theme.fontSmall
            font.family: Theme.fontFamily
        }
        Text {
            anchors.verticalCenter: parent.verticalCenter
            width: Math.round(84 * Theme.scale)
            text: tr.ms ? dp.fmt(tr.ms, "ddd d MMM") : tr.openText
            color: tr.ms ? Theme.text : Theme.dim
            font.pixelSize: Theme.fontSmall
            font.family: Theme.fontFamily
            font.features: { "tnum": 1 }
        }
        Rectangle {
            width: Math.round(56 * Theme.scale)
            height: Math.round(26 * Theme.scale)
            radius: Math.round(6 * Theme.scale)
            color: Qt.rgba(1, 1, 1, 0.06)
            border.color: input.activeFocus ? Theme.accent : Qt.rgba(1, 1, 1, 0.12)
            TextInput {
                id: input
                anchors.fill: parent
                horizontalAlignment: TextInput.AlignHCenter
                verticalAlignment: TextInput.AlignVCenter
                text: dp.hhmm(tr.ms)
                color: tr.ms ? Theme.text : Theme.faint
                selectionColor: Qt.alpha(Theme.accent, 0.4)
                font.pixelSize: Theme.fontSmall
                font.family: Theme.fontFamily
                font.features: { "tnum": 1 }
                maximumLength: 5
                selectByMouse: true
                validator: RegularExpressionValidator { regularExpression: /^\d{0,2}:?\d{0,2}$/ }
                onActiveFocusChanged: if (activeFocus) selectAll()
                onEditingFinished: {
                    // "1830" reads as 18:30.
                    const t = /^\d{3,4}$/.test(text) ? text.slice(0, -2) + ":" + text.slice(-2) : text;
                    if (!tr.apply(t)) text = Qt.binding(() => dp.hhmm(tr.ms));
                }
                Keys.onEscapePressed: { text = Qt.binding(() => dp.hhmm(tr.ms)); focus = false; }
            }
        }
    }
}
