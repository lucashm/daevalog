import QtQuick

// Deaths along a fight's minutes: a lane per player with a dot per death (one
// run), or bars of how many deaths fall in each slice of the fight (many runs).
// The bars take any value per slice (the pane's DPS chart uses them too).
Column {
    id: tl

    property string title: ""
    property real spanMs: 60000
    // [{ label, jobKey, bold, ms: [...] }]
    property var lanes: []
    // Deaths per slice of binMs, from the fight's start.
    property var bins: []
    property int binMs: 30000
    property int runs: 1
    property color barColor: Theme.bad
    property var fmt: v => String(v)
    // The hover line for a bar's value, after its time span.
    property var describe: v => v + (v === 1 ? " death" : " deaths") + " in " + runs + (runs === 1 ? " run" : " runs")
    property string hoverText: ""

    readonly property int labelW: lanes.length ? Math.round(80 * Theme.scale) : 0
    readonly property real trackW: Math.max(1, width - labelW)
    // The shortest step that leaves room for each "10:00" label.
    readonly property int stepMs: [1, 2, 5, 10, 15, 30, 60].map(m => m * 60000)
        .find(ms => trackW * ms / Math.max(1, spanMs) >= 48 * Theme.scale) || 3600000
    readonly property int peak: Math.max(1, ...bins)
    function xOf(ms) { return labelW + trackW * Math.min(1, ms / Math.max(1, spanMs)); }

    spacing: Math.round(3 * Theme.scale)

    Text {
        width: tl.width
        text: tl.hoverText || tl.title
        color: tl.hoverText ? Theme.text : Theme.faint
        font.pixelSize: Theme.fontSmall
        font.family: Theme.fontFamily
        font.features: { "tnum": 1 }
        elide: Text.ElideRight
    }

    // ── one run: who died when ──
    Repeater {
        model: tl.lanes
        Item {
            id: lane
            required property var modelData
            width: tl.width
            height: Math.round(16 * Theme.scale)
            Text {
                anchors.verticalCenter: parent.verticalCenter
                width: tl.labelW - Math.round(6 * Theme.scale)
                text: lane.modelData.label
                color: Theme.jobColor(lane.modelData.jobKey)
                font.pixelSize: Theme.fontSmall
                font.family: Theme.fontFamily
                font.bold: lane.modelData.bold
                elide: Text.ElideRight
            }
            Rectangle {
                x: tl.labelW
                anchors.verticalCenter: parent.verticalCenter
                width: tl.trackW
                height: 1
                color: Qt.rgba(1, 1, 1, 0.15)
            }
            Repeater {
                model: lane.modelData.ms
                Rectangle {
                    required property var modelData
                    readonly property int d: Math.round(9 * Theme.scale)
                    x: tl.xOf(modelData) - d / 2
                    anchors.verticalCenter: parent.verticalCenter
                    width: d
                    height: d
                    radius: d / 2
                    color: dotArea.containsMouse ? Theme.text : Theme.bad
                    MouseArea {
                        id: dotArea
                        anchors.fill: parent
                        anchors.margins: -3
                        hoverEnabled: true
                        onEntered: tl.hoverText = lane.modelData.label + " died at " + Theme.duration(parent.modelData)
                        onExited: tl.hoverText = ""
                    }
                }
            }
        }
    }

    // ── many runs: when deaths cluster ──
    Item {
        visible: tl.bins.length > 0
        width: tl.width
        height: Math.round(72 * Theme.scale)
        Repeater {
            model: tl.bins
            Rectangle {
                required property real modelData
                required property int index
                x: tl.xOf(index * tl.binMs)
                anchors.bottom: parent.bottom
                width: Math.max(1, tl.xOf((index + 1) * tl.binMs) - x - 1)
                // Room above the tallest for its count.
                height: modelData ? Math.max(2, (parent.height - Theme.fontSmall - 3) * modelData / tl.peak) : 0
                radius: Math.min(2, width / 2)
                color: binArea.containsMouse ? Theme.text : Qt.alpha(tl.barColor, 0.4 + 0.5 * modelData / tl.peak)
                BarLabel { text: parent.modelData ? tl.fmt(parent.modelData) : ""; sample: tl.fmt(tl.peak) }
                MouseArea {
                    id: binArea
                    // The whole column, so short bars are easy to point at.
                    y: parent.height - parent.parent.height
                    width: parent.width
                    height: parent.parent.height
                    hoverEnabled: true
                    onEntered: tl.hoverText = Theme.duration(index * tl.binMs) + "–" + Theme.duration((index + 1) * tl.binMs) + "  ·  " + tl.describe(modelData)
                    onExited: tl.hoverText = ""
                }
            }
        }
    }

    // ── minutes ──
    Item {
        width: tl.width
        height: Theme.fontSmall + Math.round(6 * Theme.scale)
        Rectangle {
            x: tl.labelW
            width: tl.trackW
            height: 1
            color: Qt.rgba(1, 1, 1, 0.25)
        }
        Repeater {
            model: Math.floor(tl.spanMs / tl.stepMs) + 1
            Item {
                required property int index
                x: tl.xOf(index * tl.stepMs)
                Rectangle { width: 1; height: Math.round(4 * Theme.scale); color: Qt.rgba(1, 1, 1, 0.25) }
                Text {
                    y: Math.round(5 * Theme.scale)
                    // Kept inside the track at both ends.
                    x: Math.max(tl.labelW - parent.x, Math.min(-width / 2, tl.width - parent.x - width))
                    text: Theme.duration(index * tl.stepMs)
                    color: Theme.faint
                    font.pixelSize: Theme.fontSmall
                    font.family: Theme.fontFamily
                    font.features: { "tnum": 1 }
                }
            }
        }
    }
}
