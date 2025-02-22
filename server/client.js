/*
 * For Client Socket
 */
const { TimeLogger, log } = require("../src/util");
const { R } = require("redbean-node");
const { UptimeKumaServer } = require("./uptime-kuma-server");
const server = UptimeKumaServer.getInstance();
const io = server.io;
const { setting } = require("./util-server");
const checkVersion = require("./check-version");

/**
 * Send list of notification providers to client
 * @param {Socket} socket Socket.io socket instance
 * @returns {Promise<Bean[]>}
 */
async function sendNotificationList(socket) {
    const timeLogger = new TimeLogger();

    let result = [];
    let list = await R.find("notification", " user_id = ? ", [
        socket.userID,
    ]);

    for (let bean of list) {
        let notificationObject = bean.export();
        notificationObject.isDefault = (notificationObject.isDefault === 1);
        notificationObject.active = (notificationObject.active === 1);
        result.push(notificationObject);
    }

    io.to(socket.userID).emit("notificationList", result);

    timeLogger.print("Send Notification List");

    return list;
}

/**
 * Send Heartbeat History list to socket
 * @param {Socket} socket Socket.io instance
 * @param {number} monitorID ID of monitor to send heartbeat history
 * @param {boolean} [toUser=false]  True = send to all browsers with the same user id, False = send to the current browser only
 * @param {boolean} [overwrite=false] Overwrite client-side's heartbeat list
 * @returns {Promise<void>}
 */

async function sendDowntimeStats(socket, startTime, endTime) {
    let heartbeats = await R.getAll(`
        SELECT * FROM heartbeat
        WHERE time >= datetime(?)
        AND time <= datetime(?)
        ORDER BY time ASC
    `, [
        startTime,
        endTime
    ]);

    let downtimeStats = {};
    let totalDowntime = {};

    let isDown = {};
    let downTime = {};
    for (let beat of heartbeats) {

            if (beat.status === 0 && !isDown[beat.monitor_id]) {
                isDown[beat.monitor_id] = true;
                downTime[beat.monitor_id] = beat.time;
            }
            if (isDown[beat.monitor_id] && beat.status === 1) {
                isDown[beat.monitor_id] = false;
                let upTime = beat.time;
                let timeDifferenceSec = (new Date(upTime) - new Date(downTime[beat.monitor_id])) / 1000;
                let hours = String(Math.floor(timeDifferenceSec / 3600)).padStart(2, '0');
                let minutes = String(Math.floor((timeDifferenceSec % 3600) / 60)).padStart(2, '0');
                let seconds = String(Math.floor(timeDifferenceSec % 60)).padStart(2, '0');
                let timeDifference = `${hours}:${minutes}:${seconds}`;

                if (!downtimeStats[beat.monitor_id]) {
                    downtimeStats[beat.monitor_id] = [];
                }

                // TODO Handle downtime for always down monitors
                downtimeStats[beat.monitor_id].push({monitor_id: beat.monitor_id, downTime: downTime[beat.monitor_id], upTime: upTime, duration: timeDifference});
                beat.monitor_id in totalDowntime ? totalDowntime[beat.monitor_id].downTime += timeDifferenceSec : totalDowntime[beat.monitor_id] = {monitor_id: beat.monitor_id, downTime: timeDifferenceSec}
                downTime[beat.monitor_id] = null;
                // console.log(totalDowntime[beat.monitor_id].downTime, "timeDifferenceSec", timeDifferenceSec);
            }
    }
    Object.values(totalDowntime).forEach(item => {
        let hours = String(Math.floor(item.downTime / 3600)).padStart(2, '0');
        let minutes = String(Math.floor((item.downTime % 3600) / 60)).padStart(2, '0');
        let seconds = String(Math.floor(item.downTime % 60)).padStart(2, '0');
        item.downTime = `${hours}:${minutes}:${seconds}`;
    });

    socket.emit("sendDownTimeStats", {downtimeStats, totalDowntime});
}

async function sendHeartbeatList(socket, monitorID, toUser = false, overwrite = false) {
    const timeLogger = new TimeLogger();

    let list = await R.getAll(`
        SELECT * FROM heartbeat
        WHERE monitor_id = ?
        ORDER BY time DESC
        LIMIT 1
    `, [
        monitorID,
    ]);

    let result = list.reverse();

    if (toUser) {
        io.to(socket.userID).emit("heartbeatList", monitorID, result, overwrite);
    } else {
        socket.emit("heartbeatList", monitorID, result, overwrite);
    }

    timeLogger.print(`[Monitor: ${monitorID}] sendHeartbeatList`);
}

/**
 * Important Heart beat list (aka event list)
 * @param {Socket} socket Socket.io instance
 * @param {number} monitorID ID of monitor to send heartbeat history
 * @param {boolean} [toUser=false]  True = send to all browsers with the same user id, False = send to the current browser only
 * @param {boolean} [overwrite=false] Overwrite client-side's heartbeat list
 * @returns {Promise<void>}
 */
async function sendImportantHeartbeatList(socket, monitorID, toUser = false, overwrite = false) {
    const timeLogger = new TimeLogger();

    let list = await R.find("heartbeat", `
        monitor_id = ?
        AND important = 1
        ORDER BY time DESC
        LIMIT 500
    `, [
        monitorID,
    ]);

    timeLogger.print(`[Monitor: ${monitorID}] sendImportantHeartbeatList`);

    if (toUser) {
        io.to(socket.userID).emit("importantHeartbeatList", monitorID, list, overwrite);
    } else {
        socket.emit("importantHeartbeatList", monitorID, list, overwrite);
    }

}

/**
 * Emit proxy list to client
 * @param {Socket} socket Socket.io socket instance
 * @return {Promise<Bean[]>}
 */
async function sendProxyList(socket) {
    const timeLogger = new TimeLogger();

    const list = await R.find("proxy", " user_id = ? ", [ socket.userID ]);
    io.to(socket.userID).emit("proxyList", list.map(bean => bean.export()));

    timeLogger.print("Send Proxy List");

    return list;
}

/**
 * Emit API key list to client
 * @param {Socket} socket Socket.io socket instance
 * @returns {Promise<void>}
 */
async function sendAPIKeyList(socket) {
    const timeLogger = new TimeLogger();

    let result = [];
    const list = await R.find(
        "api_key",
        "user_id=?",
        [ socket.userID ],
    );

    for (let bean of list) {
        result.push(bean.toPublicJSON());
    }

    io.to(socket.userID).emit("apiKeyList", result);
    timeLogger.print("Sent API Key List");

    return list;
}

/**
 * Emits the version information to the client.
 * @param {Socket} socket Socket.io socket instance
 * @param {boolean} hideVersion
 * @returns {Promise<void>}
 */
async function sendInfo(socket, hideVersion = false) {
    let version;
    let latestVersion;
    let isContainer;

    if (!hideVersion) {
        version = checkVersion.version;
        latestVersion = checkVersion.latestVersion;
        isContainer = (process.env.UPTIME_KUMA_IS_CONTAINER === "1");
    }

    socket.emit("info", {
        version,
        latestVersion,
        isContainer,
        primaryBaseURL: await setting("primaryBaseURL"),
        serverTimezone: await server.getTimezone(),
        serverTimezoneOffset: server.getTimezoneOffset(),
    });
}

/**
 * Send list of docker hosts to client
 * @param {Socket} socket Socket.io socket instance
 * @returns {Promise<Bean[]>}
 */
async function sendDockerHostList(socket) {
    const timeLogger = new TimeLogger();

    let result = [];
    let list = await R.find("docker_host", " user_id = ? ", [
        socket.userID,
    ]);

    for (let bean of list) {
        result.push(bean.toJSON());
    }

    io.to(socket.userID).emit("dockerHostList", result);

    timeLogger.print("Send Docker Host List");

    return list;
}

module.exports = {
    sendDowntimeStats,
    sendNotificationList,
    sendImportantHeartbeatList,
    sendHeartbeatList,
    sendProxyList,
    sendAPIKeyList,
    sendInfo,
    sendDockerHostList
};
