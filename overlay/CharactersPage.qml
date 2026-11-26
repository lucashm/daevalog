import QtQuick

// Your characters, each as the game last stated it: class, level, combat power
// and Odyle energy (daemon/src/characters.rs). A page of the app window (App.qml).
Item {
    id: page

    required property var client

    implicitHeight: content.implicitHeight

    // Odyle energy's basic cap; charged energy (from items) goes over it.
    readonly property int odyleCap: 840
    readonly property var info: client.characters
    readonly property string playing: info && info.playing ? info.playing : ""
    // [{ server, list }], the server played last first; in each, the one played last first.
    readonly property var groups: {
        const list = (info ? info.list : []).slice();
        list.sort((a, b) => (b.name === playing) - (a.name === playing) || played(b) - played(a));
        const out = [];
        for (const c of list) {
            const server = c.server || (c.serverId ? "Server " + c.serverId : "Unknown server");
            let g = out.find(g => g.server === server);
            if (!g) out.push(g = { server: server, list: [] });
            g.list.push(c);
        }
        return out;
    }

    // Re-reads "Played 3 h ago" each minute.
    property real now: Date.now()
    Timer {
        interval: 60000
        repeat: true
        running: page.visible
        onTriggered: page.now = Date.now()
    }

    // Basic Odyle energy recharges 15 every 3 h, on the clock (840 = a week's worth); charged doesn't.
    // shortcut: rate and tick times taken from a tracker's "full at" times (UTC hours 1, 4, 7, ...); check against a tick the meter captures.
    readonly property real odyleTick: 3 * 3600e3
    readonly property real odylePhase: 3600e3
    function odyleTicks(from, to) {
        return Math.max(0, Math.floor((to - odylePhase) / odyleTick) - Math.floor((from - odylePhase) / odyleTick));
    }
    // Basic energy now: as read while playing, else what was read plus the recharges since.
    function odyleNow(c, live) {
        if (!c.odyle) return 0;
        const b = c.odyle.basic;
        return live || b >= odyleCap ? b : Math.min(odyleCap, b + 15 * odyleTicks(c.lastSeen, now));
    }
    // When basic energy reaches the cap (ms); 0 if it has.
    function odyleFull(basic) {
        if (basic >= odyleCap) return 0;
        return (Math.floor((now - odylePhase) / odyleTick) + Math.ceil((odyleCap - basic) / 15)) * odyleTick + odylePhase;
    }

    function played(c) {
        return Math.max(c.lastSeen || 0, c.lastPlayed || 0);
    }

    function ago(ms) {
        const m = Math.max(0, Math.round((now - ms) / 60000));
        if (m < 1) return "just now";
        if (m < 60) return m + " min ago";
        const h = Math.round(m / 60);
        return h < 48 ? h + " h ago" : Math.round(h / 24) + " days ago";
    }

    component Label: Text {
        color: AppTheme.text
        font.pixelSize: AppTheme.normal
        font.family: AppTheme.font
    }

    Column {
        id: content
        width: page.width
        spacing: 20

        Column {
            spacing: 6
            Label {
                text: "Characters"
                font.pixelSize: AppTheme.title
                font.bold: true
            }
            Label {
                text: "Your characters, as the game last said. Combat power and gear score update at character select."
                color: AppTheme.dim
            }
        }

        Label {
            visible: page.groups.length === 0
            text: "No characters yet: log in to one with the meter running."
            color: AppTheme.faint
        }

        Repeater {
            model: page.groups

            Rectangle {
                id: group
                required property var modelData
                width: content.width
                height: groupCol.implicitHeight + 2 * AppTheme.pad
                radius: AppTheme.radius
                color: AppTheme.card
                border.color: AppTheme.cardEdge

                Column {
                    id: groupCol
                    x: AppTheme.pad
                    y: AppTheme.pad
                    width: parent.width - 2 * AppTheme.pad
                    spacing: 14

                    Item {
                        width: parent.width
                        height: serverName.implicitHeight
                        Label {
                            id: serverName
                            text: group.modelData.server
                            font.bold: true
                        }
                        Label {
                            anchors.right: parent.right
                            text: group.modelData.list.length + (group.modelData.list.length === 1 ? " character" : " characters")
                            color: AppTheme.dim
                            font.pixelSize: AppTheme.small
                        }
                    }

                    Flow {
                        width: parent.width
                        spacing: 12

                        Repeater {
                            model: group.modelData.list

                            Rectangle {
                                id: card
                                required property var modelData
                                readonly property bool live: modelData.name === page.playing
                                readonly property var odyle: modelData.odyle
                                readonly property int basicNow: page.odyleNow(modelData, live)
                                readonly property bool estimated: !!odyle && basicNow !== odyle.basic
                                width: 340
                                height: cardCol.implicitHeight + 2 * AppTheme.pad
                                radius: AppTheme.radius
                                color: AppTheme.row
                                border.color: live ? AppTheme.good : AppTheme.cardEdge

                                Column {
                                    id: cardCol
                                    x: AppTheme.pad
                                    y: AppTheme.pad
                                    width: parent.width - 2 * AppTheme.pad
                                    spacing: 12

                                    // ── name, class and level, status ──
                                    Item {
                                        width: parent.width
                                        height: 40
                                        Image {
                                            id: icon
                                            width: 32
                                            height: 32
                                            anchors.verticalCenter: parent.verticalCenter
                                            source: card.modelData.jobKey ? Qt.resolvedUrl("icons/" + card.modelData.jobKey + ".png") : ""
                                            sourceSize: Qt.size(64, 64)
                                            smooth: true
                                        }
                                        Column {
                                            anchors.left: icon.right
                                            anchors.leftMargin: 10
                                            anchors.verticalCenter: parent.verticalCenter
                                            Label {
                                                text: card.modelData.name
                                                font.pixelSize: AppTheme.large
                                                font.bold: true
                                                color: card.modelData.jobKey ? Theme.jobColor(card.modelData.jobKey) : AppTheme.text
                                            }
                                            Label {
                                                text: [card.modelData.job, card.modelData.level ? "level " + card.modelData.level : ""].filter(s => s).join(" · ") || "Class not seen yet"
                                                color: AppTheme.dim
                                                font.pixelSize: AppTheme.small
                                            }
                                        }
                                        Label {
                                            anchors.right: parent.right
                                            anchors.top: parent.top
                                            text: card.live ? "● Playing now" : page.played(card.modelData) > 0 ? "Played " + page.ago(page.played(card.modelData)) : ""
                                            color: card.live ? AppTheme.good : AppTheme.dim
                                            font.pixelSize: AppTheme.small
                                        }
                                    }

                                    // ── combat power, gear score ──
                                    Row {
                                        spacing: 8
                                        Label {
                                            text: "Combat power"
                                            color: AppTheme.faint
                                            font.pixelSize: AppTheme.small
                                            anchors.verticalCenter: parent.verticalCenter
                                        }
                                        Label {
                                            text: card.modelData.combatPower > 0 ? card.modelData.combatPower.toLocaleString(Qt.locale("en_US"), "f", 0) : "—"
                                            font.bold: true
                                        }
                                        Label {
                                            leftPadding: 8
                                            text: "Gear score"
                                            color: AppTheme.faint
                                            font.pixelSize: AppTheme.small
                                            anchors.verticalCenter: parent.verticalCenter
                                        }
                                        Label {
                                            text: card.modelData.gearScore > 0 ? card.modelData.gearScore.toLocaleString(Qt.locale("en_US"), "f", 0) : "—"
                                            font.bold: true
                                        }
                                    }

                                    // ── Odyle energy ──
                                    Rectangle {
                                        width: parent.width
                                        height: 62
                                        radius: 6
                                        color: AppTheme.card
                                        border.color: AppTheme.cardEdge

                                        Label {
                                            x: 12
                                            y: 9
                                            text: "Odyle energy" + (!card.odyle ? "" : card.basicNow >= page.odyleCap ? " · full" : " · full " + new Date(page.odyleFull(card.basicNow)).toLocaleString(Qt.locale(), "ddd HH:mm"))
                                            color: AppTheme.faint
                                            font.pixelSize: AppTheme.small
                                        }
                                        Row {
                                            anchors.right: parent.right
                                            anchors.rightMargin: 12
                                            y: 7
                                            spacing: 2
                                            visible: !!card.odyle
                                            Label {
                                                id: basic
                                                text: card.odyle ? (card.estimated ? "~" : "") + card.basicNow : ""
                                                font.bold: true
                                                font.pixelSize: AppTheme.large
                                            }
                                            Label {
                                                visible: !!card.odyle && card.odyle.charged > 0
                                                text: card.odyle ? "(+" + card.odyle.charged + ")" : ""
                                                color: AppTheme.accent
                                                font.bold: true
                                                anchors.baseline: basic.baseline
                                            }
                                            Label {
                                                text: "/" + page.odyleCap
                                                color: AppTheme.faint
                                                font.pixelSize: AppTheme.small
                                                anchors.baseline: basic.baseline
                                            }
                                        }
                                        Label {
                                            anchors.right: parent.right
                                            anchors.rightMargin: 12
                                            y: 9
                                            visible: !card.odyle
                                            text: "not seen yet"
                                            color: AppTheme.faint
                                            font.pixelSize: AppTheme.small
                                        }
                                        Rectangle {
                                            x: 12
                                            y: 40
                                            width: parent.width - 24
                                            height: 6
                                            radius: 3
                                            color: Qt.rgba(1, 1, 1, 0.06)
                                            Rectangle {
                                                width: card.odyle ? parent.width * Math.min(1, card.basicNow / page.odyleCap) : 0
                                                height: parent.height
                                                radius: 3
                                                color: AppTheme.accent
                                            }
                                        }
                                    }

                                    Label {
                                        // Always there, so every card is as tall.
                                        text: card.live ? "Live from the game" : card.modelData.lastSeen <= 0 ? "Odyle is read once you play it" : "Read " + new Date(card.modelData.lastSeen).toLocaleString(Qt.locale(), "ddd d MMM, HH:mm") + (card.estimated ? " · ~ Odyle estimated" : "")
                                        width: parent.width
                                        elide: Text.ElideRight
                                        color: AppTheme.faint
                                        font.pixelSize: AppTheme.small
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
