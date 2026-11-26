import QtQuick

// Kina a second while you farm: the rate, the session's gain, kina an hour,
// how long it's run, and today's gain limit with the time to reach it at this
// rate (see MeterClient's kina session). Shows from your first kina and goes
// 5 minutes after the last.
OverlayWidget {
    id: kina

    required property var client
    title: "Kina/s"
    defaultPos: Qt.point(24, Math.round((screen ? screen.height : 1440) * 0.52))

    property real now: Date.now()
    Timer {
        interval: 1000
        repeat: true
        running: kina.client.kinaLastMs > 0
        onTriggered: kina.now = Date.now()
    }
    readonly property bool recent: client.kinaLastMs > 0 && now - client.kinaLastMs < 5 * 60 * 1000
    readonly property real ms: Math.max(now, client.kinaLastMs) - client.kinaStartMs
    // From the second gain on; the first opens the session, so it isn't timed.
    readonly property real perSecond: ms > 0 ? (client.kinaGained - client.kinaFirst) / (ms / 1000) : 0
    readonly property real cap: 1000000
    readonly property real left: Math.max(0, cap - client.kinaDaily)

    // Sized by its text, which a wide font can stretch.
    Panel {

        Text {
            text: kina.recent ? (kina.perSecond < 10 ? kina.perSecond.toFixed(1) : Theme.compact(kina.perSecond)) + " kina/s" : "Kina/s: shows while you farm"
            color: kina.recent ? Theme.text : Theme.dim
            font.pixelSize: kina.recent ? Theme.fontLarge : Theme.fontSmall
            font.family: Theme.fontFamily
            font.bold: kina.recent
            font.features: { "tnum": 1 }
        }
        Text {
            visible: kina.recent
            text: "Counting " + Theme.duration(kina.ms) + "  ·  +" + Theme.compact(kina.client.kinaGained) + "  ·  " + Theme.compact(kina.perSecond * 3600) + "/hour"
            color: Theme.dim
            font.pixelSize: Theme.fontSmall
            font.family: Theme.fontFamily
            font.features: { "tnum": 1 }
        }
        Text {
            visible: kina.recent && kina.client.kinaDaily >= 0
            text: "Daily " + Theme.compact(kina.client.kinaDaily) + " / 1M  ·  "
                + (kina.left <= 0 ? "capped" : "cap in " + (kina.perSecond > 0 ? "~" + Theme.duration(kina.left / kina.perSecond * 1000) : "–"))
            color: kina.left <= 0 ? Theme.good : Theme.dim
            font.pixelSize: Theme.fontSmall
            font.family: Theme.fontFamily
            font.features: { "tnum": 1 }
        }
    }
}
