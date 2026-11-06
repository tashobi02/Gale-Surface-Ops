// LAN spike client (T20.07). Shows each EVENT's seq and this device's arrival time (ms), so a
// screen recording of all devices can be read frame by frame (T20.08). No libraries, no internet.
(function () {
  var status = document.getElementById("status");
  var seqEl = document.getElementById("seq");
  var arrived = document.getElementById("arrived");
  document.getElementById("device").textContent = navigator.userAgent.slice(0, 60);
  var lastSeq = 0;
  var clientId = "spike-" + Math.random().toString(36).slice(2, 8);

  function clock() {
    var d = new Date();
    var p = function (n, w) { return String(n).padStart(w, "0"); };
    return p(d.getHours(), 2) + ":" + p(d.getMinutes(), 2) + ":" + p(d.getSeconds(), 2) + "." + p(d.getMilliseconds(), 3);
  }

  function connect() {
    var ws = new WebSocket("ws://" + location.host + "/ws");
    ws.onopen = function () {
      status.textContent = "Connected";
      ws.send(JSON.stringify({ v: 1, type: "HELLO", role: "ops", client_id: clientId, display_name: "spike", last_seq: lastSeq }));
    };
    ws.onmessage = function (m) {
      var msg = JSON.parse(m.data);
      if (msg.type === "EVENT") {
        lastSeq = msg.seq;
        seqEl.textContent = msg.seq;
        arrived.textContent = "Arrival time on this device: " + clock();
      } else if (msg.type === "SNAPSHOT") {
        lastSeq = msg.seq;
      }
    };
    ws.onclose = function () {
      status.textContent = "Disconnected — retrying";
      setTimeout(connect, 1000);
    };
  }
  connect();
})();
