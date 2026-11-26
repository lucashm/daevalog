import QtQuick

// PvP: the enemy players around you (daemon/src/pvp.rs): your target, then
// whoever is hitting you, then the rest you traded hits with in the last
// minute, then the other side's players in range (dimmed), the strongest
// first. Each with class, name, combat power and HP. Shows only while there are some.
OverlayWidget {
    id: pvp

    required property var client
    title: "PvP"
    readonly property int width_: Math.round(300 * Theme.scale)
    defaultPos: Qt.point(Math.round((screen ? screen.width : 2560) / 2 + 300 * hud), Math.round(272 * hud))

    readonly property var enemies: client.pvp
    readonly property bool active: enemies.length > 0

    Panel {
        width: pvp.width_

        // Something to place in Customize while nobody is fighting you.
        Text {
            visible: !pvp.active
            text: "PvP: shows while enemies are around"
            color: Theme.dim
            font.pixelSize: Theme.fontSmall
            font.family: Theme.fontFamily
        }

        Repeater {
            model: pvp.enemies

            Column {
                id: foe
                required property var modelData
                readonly property var e: modelData
                readonly property bool hasHp: e.hp >= 0 && e.maxHp > 0
                readonly property real fraction: hasHp ? Math.max(0, Math.min(1, e.hp / e.maxHp)) : 0
                width: pvp.width_ - Theme.pad * 2
                spacing: 2
                opacity: e.fought ? 1 : 0.6

                Item {
                    width: parent.width
                    height: Math.round(18 * Theme.scale)
                    Row {
                        anchors.left: parent.left
                        anchors.verticalCenter: parent.verticalCenter
                        spacing: Math.round(5 * Theme.scale)
                        Image {
                            anchors.verticalCenter: parent.verticalCenter
                            width: Math.round(16 * Theme.scale)
                            height: width
                            fillMode: Image.PreserveAspectFit
                            smooth: true
                            mipmap: true
                            source: foe.e.jobKey ? Qt.resolvedUrl("icons/" + foe.e.jobKey + ".png") : ""
                        }
                        Text {
                            anchors.verticalCenter: parent.verticalCenter
                            width: Math.min(implicitWidth, pvp.width_ * 0.35)
                            elide: Text.ElideRight
                            text: foe.e.name
                            color: foe.e.jobKey ? Theme.jobColor(foe.e.jobKey) : Theme.text
                            font.pixelSize: Theme.fontNormal
                            font.family: Theme.fontFamily
                            font.bold: foe.e.targeted
                        }
                        Text {
                            anchors.verticalCenter: parent.verticalCenter
                            text: foe.e.job
                            color: Theme.dim
                            font.pixelSize: Theme.fontSmall
                            font.family: Theme.fontFamily
                        }
                        Text {
                            anchors.verticalCenter: parent.verticalCenter
                            visible: foe.e.combatPower > 0
                            text: Theme.compact(foe.e.combatPower)
                            color: Theme.accent
                            font.pixelSize: Theme.fontSmall
                            font.family: Theme.fontFamily
                            font.bold: true
                            font.features: { "tnum": 1 }
                        }
                    }
                    Text {
                        anchors.right: parent.right
                        anchors.verticalCenter: parent.verticalCenter
                        text: [foe.e.targeted ? "target" : "", foe.e.hittingYou ? "hitting you" : ""].filter(s => s).join(" · ")
                        color: foe.e.hittingYou ? Theme.bad : Theme.accent
                        font.pixelSize: Theme.fontSmall
                        font.family: Theme.fontFamily
                        font.bold: true
                    }
                }

                Rectangle {
                    width: parent.width
                    height: Math.round(12 * Theme.scale)
                    radius: 3
                    color: Theme.hpBack
                    Rectangle {
                        width: parent.width * foe.fraction
                        height: parent.height
                        radius: 3
                        color: Theme.hp
                        Behavior on width { NumberAnimation { duration: 200; easing.type: Easing.OutCubic } }
                    }
                    Text {
                        anchors.centerIn: parent
                        text: foe.e.hp === 0 ? "down" : foe.hasHp ? Theme.compact(foe.e.hp) + " / " + Theme.compact(foe.e.maxHp) : "HP unknown"
                        color: Theme.text
                        style: Text.Outline
                        styleColor: Qt.rgba(0, 0, 0, 0.6)
                        font.pixelSize: Theme.fontSmall
                        font.family: Theme.fontFamily
                        font.features: { "tnum": 1 }
                    }
                }
            }
        }
    }
}
