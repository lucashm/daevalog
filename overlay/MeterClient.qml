import QtQuick
import Quickshell
import Quickshell.Io

// The daemon's socket: newline-delimited JSON both ways. Reconnects on its
// own, so the overlay can start before the daemon and survive its restarts.
Item {
    id: client

    property string socketPath: Quickshell.env("AION2_METER_SOCKET") || ((Quickshell.env("XDG_RUNTIME_DIR") || "/tmp") + "/aion2-meter.sock")
    readonly property bool connected: sock.connected

    // Latest broadcast state (see daemon/src/meter.rs, OverlayState).
    property var state: null
    property var history: []
    property var fight: null
    // Pet levels, soul points and the pet being farmed (daemon/src/pets.rs).
    property var pets: null
    // Your characters as the game last stated them (daemon/src/characters.rs): { playing, list }.
    property var characters: null
    // The enemy players around you (daemon/src/pvp.rs): [{ id, name, job, jobKey, combatPower, hp, maxHp, targeted, hittingYou, fought }].
    property var pvp: []
    // Hidden cube spots the meter has seen, by the game's map id: [[x, y, z], ...].
    property var cubeSpots: ({})
    // Cubes in range lately, not seen opened: [{ id, map, x, y, at }]; each goes after 5 minutes.
    property var liveCubes: []
    Timer {
        interval: 30000
        repeat: true
        running: client.liveCubes.length > 0
        onTriggered: client.liveCubes = client.liveCubes.filter(c => Date.now() - c.at < 300000)
    }

    // Kina picked up this session (daemon/src/kina.rs states the balance): only rises
    // are counted, so spending doesn't sink the rate. A session ends 5 minutes after its last gain.
    // shortcut: a switch to a richer character counts as a gain; drop the session on a character change if that bites.
    property real kinaBalance: -1
    // Kina toward today's gain limit (1,000,000; resets 04:00); -1 before the game states it.
    property real kinaDaily: -1
    property real kinaGained: 0
    property real kinaFirst: 0
    property real kinaStartMs: 0
    property real kinaLastMs: 0
    // Ends the session: the next kina picked up starts a new one.
    function resetKina() {
        kinaGained = 0;
        kinaFirst = 0;
        kinaStartMs = kinaLastMs = 0;
    }
    function onKina(balance) {
        const now = Date.now();
        const delta = kinaBalance < 0 ? 0 : balance - kinaBalance;
        kinaBalance = balance;
        if (delta <= 0) return;
        if (now - kinaLastMs > 5 * 60 * 1000) {
            kinaGained = 0;
            kinaFirst = delta;
            kinaStartMs = now;
        }
        kinaGained += delta;
        kinaLastMs = now;
    }

    readonly property var players: state ? state.players : []
    readonly property var skills: state ? state.skills : []
    readonly property var target: state ? state.target : null
    readonly property var capture: state ? state.capture : null
    readonly property real totalDps: {
        let t = 0;
        for (const p of players) t += p.dps;
        return t;
    }

    readonly property real totalDamage: {
        let t = 0;
        for (const p of players) t += p.damage;
        return t;
    }

    readonly property int totalDeaths: {
        let t = 0;
        for (const p of players) t += p.deaths || 0;
        return t;
    }

    signal fightSaved(var summary)
    // A hidden cube came in range, or is being / was opened: { event, id, by, mine, distance }.
    signal cubeEvent(var e)

    function send(cmd) {
        if (!sock.connected) return;
        sock.write(JSON.stringify(cmd) + "\n");
        sock.flush();
    }

    function reset() { send({ cmd: "reset" }); resetKina(); }
    function setTargetMode(mode) { send({ cmd: "targetMode", mode: mode }); }
    function focus(id) { send({ cmd: "focus", id: id }); }
    function requestHistory() { send({ cmd: "history", limit: 100000 }); }
    function requestFight(id) { send({ cmd: "fight", id: id }); }

    function handle(line) {
        let msg;
        try {
            msg = JSON.parse(line);
        } catch (e) {
            console.warn("aion2-meter: bad message", e);
            return;
        }
        switch (msg.type) {
        case "state":
            client.state = msg;
            break;
        case "history":
            client.history = msg.fights;
            break;
        case "fight":
            client.fight = msg;
            break;
        case "pets":
            client.pets = msg;
            break;
        case "characters":
            client.characters = msg;
            break;
        case "kina":
            client.kinaDaily = msg.daily;
            client.onKina(msg.balance);
            break;
        case "pvp":
            client.pvp = msg.enemies;
            break;
        case "fightSaved":
            client.fightSaved(msg.fight);
            break;
        case "cube": {
            const others = client.liveCubes.filter(c => c.id !== msg.id);
            if (msg.event === "near" && msg.map) client.liveCubes = others.concat([{ id: msg.id, map: msg.map, x: msg.x, y: msg.y, at: Date.now() }]);
            else if (msg.event === "opened") client.liveCubes = others;
            client.cubeEvent(msg);
            break;
        }
        case "cubeSpots":
            client.cubeSpots = msg.spots;
            break;
        }
    }

    Socket {
        id: sock
        path: client.socketPath
        connected: true
        parser: SplitParser {
            onRead: line => client.handle(line)
        }
        onConnectedChanged: {
            if (!connected) client.state = null;
        }
    }

    Timer {
        interval: 2000
        repeat: true
        running: !sock.connected
        onTriggered: sock.connected = true
    }
}
