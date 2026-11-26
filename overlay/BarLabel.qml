import QtQuick

// A bar chart's value, shown without hovering. Put inside the bar: across the
// top of a wide bar, else turned up along it (inside a tall one, above a short one).
// The chart leaves a line of room above its tallest bar for it.
Item {
    id: bl

    property string text
    // The chart's widest value: every bar's label turns the same way.
    property string sample: text
    readonly property Item bar: parent
    readonly property bool flat: bar.width >= widest.width + 4
    // The chart's room above the bar (bars stand on the bottom of their parent).
    readonly property real above: bar.parent.height - bar.height
    readonly property bool inside: !flat && (bar.height >= label.implicitWidth + 6 || above < label.implicitWidth + 3)

    visible: text !== "" && bar.width >= label.implicitHeight - 2
    width: bar.width
    height: flat ? label.implicitHeight : label.implicitWidth
    y: Math.max(-above, flat ? -height - 1 : inside ? bar.height - height - 3 : -height - 3)

    TextMetrics {
        id: widest
        text: bl.sample
        font: label.font
    }
    Text {
        id: label
        anchors.centerIn: parent
        rotation: bl.flat ? 0 : -90
        text: bl.text
        color: bl.inside ? Theme.text : Theme.dim
        font.pixelSize: Theme.fontSmall
        font.family: Theme.fontFamily
        font.features: { "tnum": 1 }
    }
}
