import { spawn } from "node:child_process";
import { once } from "node:events";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const types = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

async function chromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  throw new Error("Chrome is required. Set CHROME_PATH to an installed Chrome executable.");
}

export async function launchBrowser() {
  const executable = await chromePath();
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://localhost");
      const relative = decodeURIComponent(url.pathname).replace(/^\/ghas-panorama\//, "");
      const filename = path.resolve(root, relative || "index.html");
      if (!url.pathname.startsWith("/ghas-panorama/") || !filename.startsWith(root)) {
        response.writeHead(404).end();
        return;
      }
      const body = await readFile(filename);
      response.writeHead(200, { "Content-Type": types[path.extname(filename)] || "application/octet-stream" });
      response.end(body);
    } catch (error) {
      if (error.code === "ENOENT" || error.code === "EISDIR") response.writeHead(404).end();
      else {
        console.error(error);
        response.writeHead(500).end();
      }
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const baseURL = `http://127.0.0.1:${server.address().port}/ghas-panorama/`;
  const profile = await mkdtemp(path.join(tmpdir(), "panorama-chrome-"));
  const chrome = spawn(executable, [
    "--headless=new",
    "--remote-debugging-port=0",
    "--remote-debugging-address=127.0.0.1",
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-sync",
    "--disable-dev-shm-usage",
    "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  let output = "";
  let websocket;
  const pending = new Map();
  const errors = [];
  let nextId = 0;
  const closed = new Promise((resolve) => chrome.once("close", resolve));

  async function close() {
    const killTimer = setTimeout(() => chrome.kill("SIGKILL"), 5000);
    try {
      if (websocket?.readyState === WebSocket.OPEN) {
        // Chrome may close the socket before replying; wait for the process instead.
        websocket.send(JSON.stringify({ id: ++nextId, method: "Browser.close" }));
      } else {
        chrome.kill();
      }
      await closed;
    } finally {
      clearTimeout(killTimer);
      websocket?.close();
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      // Chrome helpers can still finish writing to the profile after the browser exits.
      await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  }

  try {
    const endpoint = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Chrome startup timed out: ${output}`)), 60000);
      chrome.once("error", (error) => { clearTimeout(timer); reject(error); });
      chrome.once("exit", (code) => {
        clearTimeout(timer);
        reject(new Error(`Chrome exited (${code}): ${output}`));
      });
      chrome.stderr.on("data", (chunk) => {
        output = (output + chunk).slice(-16000);
        const match = output.match(/DevTools listening on (ws:\/\/\S+)/);
        if (match) { clearTimeout(timer); resolve(match[1]); }
      });
    });
    websocket = new WebSocket(endpoint);
    await once(websocket, "open");
    websocket.addEventListener("message", ({ data }) => {
      const message = JSON.parse(data);
      if (message.id) {
        const request = pending.get(message.id);
        if (!request) return;
        pending.delete(message.id);
        clearTimeout(request.timer);
        if (message.error) request.reject(new Error(JSON.stringify(message.error)));
        else request.resolve(message.result);
      } else if (message.method === "Runtime.exceptionThrown") {
        errors.push(JSON.stringify(message.params.exceptionDetails));
      } else if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") {
        errors.push(JSON.stringify(message.params.args));
      } else if (message.method === "Log.entryAdded" && message.params.entry.level === "error") {
        errors.push(message.params.entry.text);
      } else if (message.method === "Network.responseReceived" && message.params.response.status >= 400) {
        errors.push(`${message.params.response.status} ${message.params.response.url}`);
      } else if (message.method === "Network.loadingFailed" && !message.params.canceled) {
        errors.push(message.params.errorText);
      }
    });
    websocket.addEventListener("close", () => {
      for (const request of pending.values()) {
        clearTimeout(request.timer);
        request.reject(new Error("Chrome connection closed"));
      }
      pending.clear();
    });

    function send(method, params = {}, sessionId) {
      return new Promise((resolve, reject) => {
        const id = ++nextId;
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`Chrome command timed out: ${method}`));
        }, 15000);
        pending.set(id, { resolve, reject, timer });
        websocket.send(JSON.stringify({ id, method, params, sessionId }));
      });
    }
    const { targetId } = await send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
    const command = (method, params) => send(method, params, sessionId);
    for (const domain of ["Page", "Runtime", "Log", "Network"]) await command(`${domain}.enable`);

    const evaluate = async (expression) => {
      const response = await command("Runtime.evaluate", {
        expression, returnByValue: true, awaitPromise: true, userGesture: true,
      });
      if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails));
      return response.result.value;
    };
    const waitFor = async (expression) => {
      const deadline = Date.now() + 10000;
      while (Date.now() < deadline) {
        if (await evaluate(expression)) return;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      throw new Error(`Timed out waiting for: ${expression}`);
    };
    return {
      baseURL,
      errors,
      command,
      evaluate,
      waitFor,
      async navigate(fragment = "") {
        const response = await command("Page.navigate", { url: baseURL + fragment });
        if (response.errorText) throw new Error(response.errorText);
        await waitFor(`document.readyState === "complete" && Boolean(document.querySelector(".usage-detail"))`);
        await evaluate("document.fonts.ready.then(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))");
      },
      async click(selector) {
        const point = await evaluate(`(() => {
          const element = document.querySelector(${JSON.stringify(selector)});
          if (!element || element.disabled) throw new Error("Control missing or disabled: " + ${JSON.stringify(selector)});
          element.scrollIntoView({ block: "center", behavior: "instant" });
          const rect = element.getBoundingClientRect();
          return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
        })()`);
        await command("Input.dispatchMouseEvent", { type: "mousePressed", ...point, button: "left", clickCount: 1 });
        await command("Input.dispatchMouseEvent", { type: "mouseReleased", ...point, button: "left", clickCount: 1 });
      },
      async key(key, code = key, virtualKey = 0) {
        await command("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode: virtualKey });
        await command("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: virtualKey });
      },
      close,
    };
  } catch (error) {
    try {
      await close();
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], `Chrome startup failed: ${error.message}; cleanup failed: ${cleanupError.message}`);
    }
    throw error;
  }
}
