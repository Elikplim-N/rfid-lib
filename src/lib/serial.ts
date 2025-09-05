// Web Serial bridge for the ESP32 firmware (115200 baud, line-based).
// Keeps your old API: requestPort(), readLines(port, onEvent, onClose)
//
// onEvent receives objects like:
//  { event: 'card', uid: 'E0A1B2C3' }
//  { event: 'scan', state: 'armed' | 'done' }
//  { event: 'status', data: { sms, students, activeBorrows, queuePending, auto, intervalMin } }
//  { event: 'raw', line: '...' }   // for logs/UI

export async function requestPort(): Promise<SerialPort | null> {
  if (!("serial" in navigator)) {
    alert("Web Serial API not available. Use Chrome/Edge on desktop.");
    return null;
  }
  const port = await (navigator as any).serial.requestPort();
  await port.open({ baudRate: 115200 });
  return port;
}

export function readLines(
  port: SerialPort,
  onEvent: (data: any) => void,
  onClose?: () => void
) {
  const textDecoder = new TextDecoderStream();
  const readable = (port as any).readable as ReadableStream<Uint8Array>;
  const writer = (port as any).writable as WritableStream<Uint8Array>;
  const reader = readable.pipeThrough(textDecoder).getReader();

  let buffer = "";

  (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value || "";
        let idx;
        while ((idx = buffer.search(/\r?\n/)) >= 0) {
          const line = buffer.slice(0, idx).trim();
          buffer = buffer.slice(idx + 1);
          if (!line) continue;

          // Always pass raw line (useful for your log console)
          onEvent({ event: "raw", line });

          // Parse key firmware lines -> friendly events
          if (line.startsWith("CARD_SCANNED:")) {
            const uid = line.replace("CARD_SCANNED:", "").trim();
            onEvent({ event: "card", uid });
            continue;
          }
          if (line === "SCAN_ARMED") { onEvent({ event: "scan", state: "armed" }); continue; }
          if (line === "SCAN_DONE")  { onEvent({ event: "scan", state: "done"  }); continue; }

          if (line.startsWith("STATUS|")) {
            // STATUS|SMS:ON|Students:0|ActiveBorrows:0|QueuePending:0|Auto:OFF|IntervalMin:0
            const parts = line.split("|").slice(1);
            const obj: any = {};
            for (const p of parts) {
              const [k, v] = p.split(":");
              obj[k] = v;
            }
            onEvent({
              event: "status",
              data: {
                sms: obj.SMS,
                students: Number(obj.Students || 0),
                activeBorrows: Number(obj.ActiveBorrows || 0),
                queuePending: Number(obj.QueuePending || 0),
                auto: obj.Auto,
                intervalMin: Number(obj.IntervalMin || 0),
              },
            });
            continue;
          }
        }
      }
    } catch (_) {
      // reader cancelled/closed
    } finally {
      try { reader.releaseLock(); } catch {}
      try { (port as any).close(); } catch {}
      onClose && onClose();
    }
  })();
}
