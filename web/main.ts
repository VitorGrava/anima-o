import {
  createProject,
  exportGIF,
  flattenFrame,
  frameDuration,
  fromJSON,
  getCel,
  renderFrameRGBA,
  renderSpritesheetRGBA,
  runCommand,
  toJSON,
  type CommandResult,
  type Project,
  type ProjectJSON,
} from "../src/engine/index.ts";
import { SLIME_COMMANDS } from "../examples/slime.ts";

// ---------------- estado ----------------

type Tool = "pencil" | "eraser" | "fill" | "pick";

const STORAGE_KEY = "anima-o:project";
const state = {
  project: loadSaved() ?? createProject({ name: "Sem título", width: 32, height: 32 }),
  frame: 0,
  layerId: "",
  color: 1, // índice de pixel (0 = transparente)
  tool: "pencil" as Tool,
  zoom: 14,
  onion: false,
  grid: true,
  playing: false,
  playFrame: 0,
  undo: [] as string[],
  redo: [] as string[],
  sessionId: null as string | null,
  busy: false,
  abort: null as AbortController | null,
};
state.layerId = state.project.layers[state.project.layers.length - 1].id;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>("canvas");
const ctx = canvas.getContext("2d")!;

function loadSaved(): Project | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? fromJSON(JSON.parse(raw) as ProjectJSON) : null;
  } catch {
    return null;
  }
}

let saveTimer = 0;
function save() {
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toJSON(state.project)));
    } catch {
      /* armazenamento indisponível: tudo bem */
    }
  }, 300);
}

// ---------------- histórico ----------------

function snapshot() {
  state.undo.push(JSON.stringify(toJSON(state.project)));
  if (state.undo.length > 100) state.undo.shift();
  state.redo = [];
  updateUndoButtons();
}

function restore(from: string[], to: string[]) {
  const s = from.pop();
  if (!s) return;
  to.push(JSON.stringify(toJSON(state.project)));
  setProject(fromJSON(JSON.parse(s)));
  updateUndoButtons();
}

function updateUndoButtons() {
  $<HTMLButtonElement>("btn-undo").disabled = !state.undo.length || state.busy;
  $<HTMLButtonElement>("btn-redo").disabled = !state.redo.length || state.busy;
}

function setProject(p: Project) {
  state.project = p;
  state.frame = Math.min(state.frame, p.frames.length - 1);
  if (!p.layers.some((l) => l.id === state.layerId)) state.layerId = p.layers[p.layers.length - 1].id;
  if (state.color > p.palette.length) state.color = p.palette.length ? 1 : 0;
  renderAll();
  save();
}

/** Aplica um comando da engine a partir da UI (mesma API que a IA usa). */
function exec(name: string, input: unknown, record = true): CommandResult & { ok: boolean } {
  const before = record ? JSON.stringify(toJSON(state.project)) : "";
  const r = runCommand(state.project, name, input);
  if (r.ok && r.changed) {
    if (record) {
      state.undo.push(before);
      state.redo = [];
      updateUndoButtons();
    }
    setProject(state.project);
  } else if (!r.ok) {
    console.warn(r.text);
  }
  return r;
}

// ---------------- render do palco ----------------

function checker(c: CanvasRenderingContext2D, w: number, h: number, size: number) {
  c.fillStyle = "#2a2d42";
  c.fillRect(0, 0, w, h);
  c.fillStyle = "#33364f";
  for (let y = 0; y < h; y += size) for (let x = (y / size) % 2 ? size : 0; x < w; x += size * 2) c.fillRect(x, y, size, size);
}

function frameBitmap(p: Project, i: number): HTMLCanvasElement {
  const img = renderFrameRGBA(p, i);
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  c.getContext("2d")!.putImageData(new ImageData(img.data, img.width, img.height), 0, 0);
  return c;
}

function renderStage() {
  const p = state.project;
  const z = state.zoom;
  const W = p.width * z;
  const H = p.height * z;
  if (canvas.width !== W || canvas.height !== H) {
    canvas.width = W;
    canvas.height = H;
  }
  ctx.imageSmoothingEnabled = false;
  checker(ctx, W, H, Math.max(4, z));
  const f = state.playing ? state.playFrame : state.frame;
  if (state.onion && !state.playing && p.frames.length > 1) {
    ctx.globalAlpha = 0.28;
    ctx.drawImage(frameBitmap(p, (f - 1 + p.frames.length) % p.frames.length), 0, 0, W, H);
    ctx.globalAlpha = 1;
  }
  ctx.drawImage(frameBitmap(p, f), 0, 0, W, H);
  if (state.grid && z >= 6) {
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 1; x < p.width; x++) {
      ctx.moveTo(x * z + 0.5, 0);
      ctx.lineTo(x * z + 0.5, H);
    }
    for (let y = 1; y < p.height; y++) {
      ctx.moveTo(0, y * z + 0.5);
      ctx.lineTo(W, y * z + 0.5);
    }
    ctx.stroke();
  }
  $("frame-label").textContent = `frame ${f + 1}/${p.frames.length}`;
  $("canvas-size").textContent = `${p.width}×${p.height}px`;
}

// ---------------- painéis ----------------

function renderPalette() {
  const el = $("palette");
  el.replaceChildren();
  const mk = (idx: number, hex: string | null, key: string, title: string) => {
    const b = document.createElement("button");
    b.className = `swatch${hex ? "" : " transparent"}${state.color === idx ? " selected" : ""}`;
    if (hex) b.style.background = hex;
    b.title = title;
    b.innerHTML = `<span>${key}</span>`;
    b.onclick = () => {
      state.color = idx;
      if (state.tool === "eraser" || state.tool === "pick") setTool("pencil");
      renderPalette();
    };
    el.append(b);
  };
  mk(0, null, ".", "Transparente");
  state.project.palette.forEach((c, i) => mk(i + 1, c.hex, c.key, `${c.name} (${c.key}) ${c.hex}`));
}

function renderLayers() {
  const el = $("layers");
  el.replaceChildren();
  for (const l of state.project.layers) {
    const li = document.createElement("li");
    li.className = `${l.id === state.layerId ? "selected" : ""} ${l.visible ? "" : "hidden-layer"}`;
    const eye = document.createElement("button");
    eye.className = "eye";
    eye.textContent = l.visible ? "◉" : "○";
    eye.title = l.visible ? "Esconder" : "Mostrar";
    eye.onclick = (e) => {
      e.stopPropagation();
      exec("update_layer", { layer: l.id, visible: !l.visible });
    };
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = l.name;
    li.append(eye, name);
    li.onclick = () => {
      state.layerId = l.id;
      renderLayers();
    };
    el.append(li);
  }
  const add = document.createElement("li");
  add.innerHTML = `<span class="muted">+ nova camada</span>`;
  add.onclick = () => {
    const name = prompt("Nome da camada:", `Camada ${state.project.layers.length + 1}`);
    if (!name) return;
    if (exec("add_layer", { name }).ok) {
      state.layerId = state.project.layers[state.project.layers.length - 1].id;
      renderLayers();
    }
  };
  el.prepend(add);
}

function renderTimeline() {
  const el = $("timeline");
  el.replaceChildren();
  const p = state.project;
  const scale = Math.max(1, Math.floor(56 / Math.max(p.width, p.height)));
  p.frames.forEach((_, i) => {
    const t = document.createElement("div");
    t.className = `thumb${i === state.frame ? " selected" : ""}`;
    t.dataset.index = String(i);
    const c = frameBitmap(p, i);
    c.style.width = `${p.width * scale}px`;
    c.style.height = `${p.height * scale}px`;
    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = `${i + 1} · ${frameDuration(p, i)}ms`;
    t.append(c, meta);
    t.onclick = () => {
      state.frame = i;
      stop();
      renderTimeline();
      renderStage();
    };
    el.append(t);
  });
  const controls = document.createElement("div");
  controls.className = "thumb";
  controls.style.justifyContent = "center";
  const dup = document.createElement("button");
  dup.textContent = "+ Duplicar";
  dup.onclick = () => {
    if (exec("add_frames", { count: 1, copy_from: state.frame, at: state.frame + 1 }).ok) {
      state.frame += 1;
      renderAll();
    }
  };
  const del = document.createElement("button");
  del.textContent = "Apagar";
  del.disabled = p.frames.length <= 1;
  del.onclick = () => exec("delete_frames", { frames: state.frame });
  controls.append(dup, del);
  el.append(controls);
}

function renderAll() {
  renderStage();
  renderPalette();
  renderLayers();
  renderTimeline();
  $<HTMLInputElement>("fps").value = String(state.project.fps);
  const nameInput = $<HTMLInputElement>("project-name");
  if (document.activeElement !== nameInput) nameInput.value = state.project.name;
}

// ---------------- ferramentas manuais ----------------

function setTool(t: Tool) {
  state.tool = t;
  document.querySelectorAll<HTMLButtonElement>("[data-tool]").forEach((b) => b.classList.toggle("active", b.dataset.tool === t));
}

function pixelAt(e: PointerEvent): [number, number] {
  const r = canvas.getBoundingClientRect();
  return [
    Math.floor(((e.clientX - r.left) / r.width) * state.project.width),
    Math.floor(((e.clientY - r.top) / r.height) * state.project.height),
  ];
}

let stroke: { before: string; last: [number, number] | null } | null = null;

canvas.addEventListener("pointerdown", (e) => {
  if (state.busy) return;
  stop();
  const [x, y] = pixelAt(e);
  const p = state.project;
  if (state.tool === "pick") {
    state.color = flattenFrame(p, state.frame)[y * p.width + x] ?? 0;
    setTool("pencil");
    renderPalette();
    return;
  }
  const colorRef = state.color ? p.palette[state.color - 1].key : ".";
  if (state.tool === "fill") {
    exec("draw_shapes", { frames: state.frame, layer: state.layerId, shapes: [{ type: "fill", x, y, color: colorRef }] });
    return;
  }
  canvas.setPointerCapture(e.pointerId);
  stroke = { before: JSON.stringify(toJSON(p)), last: null };
  paint(x, y);
});

canvas.addEventListener("pointermove", (e) => {
  if (!stroke) return;
  const [x, y] = pixelAt(e);
  paint(x, y);
});

function endStroke() {
  if (!stroke) return;
  state.undo.push(stroke.before);
  state.redo = [];
  stroke = null;
  updateUndoButtons();
  renderTimeline();
  save();
}
canvas.addEventListener("pointerup", endStroke);
canvas.addEventListener("pointercancel", endStroke);

function paint(x: number, y: number) {
  const p = state.project;
  const cel = getCel(p, state.frame, state.layerId);
  const c = state.tool === "eraser" ? 0 : state.color;
  // interpola entre eventos para não deixar buracos no traço
  const [x0, y0] = stroke?.last ?? [x, y];
  const steps = Math.max(Math.abs(x - x0), Math.abs(y - y0), 1);
  for (let s = 0; s <= steps; s++) {
    const px = Math.round(x0 + ((x - x0) * s) / steps);
    const py = Math.round(y0 + ((y - y0) * s) / steps);
    if (px >= 0 && py >= 0 && px < p.width && py < p.height) cel[py * p.width + px] = c;
  }
  if (stroke) stroke.last = [x, y];
  renderStage();
}

// ---------------- reprodução ----------------

let rafId = 0;
function play() {
  state.playing = true;
  state.playFrame = state.frame;
  $("btn-play").textContent = "❚❚ Pausar";
  let last = performance.now();
  const tick = (now: number) => {
    if (!state.playing) return;
    if (now - last >= frameDuration(state.project, state.playFrame)) {
      last = now;
      state.playFrame = (state.playFrame + 1) % state.project.frames.length;
      renderStage();
      document.querySelectorAll(".thumb").forEach((t) => t.classList.toggle("playing", (t as HTMLElement).dataset.index === String(state.playFrame)));
    }
    rafId = requestAnimationFrame(tick);
  };
  renderStage();
  rafId = requestAnimationFrame(tick);
}

function stop() {
  if (!state.playing) return;
  state.playing = false;
  cancelAnimationFrame(rafId);
  $("btn-play").textContent = "▶ Play";
  document.querySelectorAll(".thumb.playing").forEach((t) => t.classList.remove("playing"));
  renderStage();
}

// ---------------- exportação ----------------

function download(blob: Blob, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function slug() {
  return state.project.name.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "animacao";
}

function doExport(format: "gif" | "spritesheet_png" | "json", scale = 4, columns?: number, filename?: string) {
  const p = state.project;
  if (format === "gif") {
    download(new Blob([exportGIF(p, scale) as BlobPart], { type: "image/gif" }), filename ?? `${slug()}.gif`);
  } else if (format === "json") {
    download(new Blob([JSON.stringify(toJSON(p), null, 1)], { type: "application/json" }), filename ?? `${slug()}.anima.json`);
  } else {
    const sheet = renderSpritesheetRGBA(p, columns ?? p.frames.length, scale);
    const c = document.createElement("canvas");
    c.width = sheet.width;
    c.height = sheet.height;
    c.getContext("2d")!.putImageData(new ImageData(sheet.data, sheet.width, sheet.height), 0, 0);
    c.toBlob((b) => b && download(b, filename ?? `${slug()}-sheet.png`), "image/png");
  }
}

// ---------------- chat com a IA ----------------

const messagesEl = $("messages");

function addUserMessage(text: string) {
  messagesEl.querySelector(".welcome")?.remove();
  const d = document.createElement("div");
  d.className = "msg user";
  d.textContent = text;
  messagesEl.append(d);
  scrollChat();
}

function scrollChat() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function setBusy(b: boolean, status = "") {
  state.busy = b;
  $<HTMLButtonElement>("btn-send").disabled = b;
  $("btn-stop").hidden = !b;
  $("status").textContent = status;
  updateUndoButtons();
}

async function sendChat(text: string) {
  if (state.busy || !text.trim()) return;
  stop();
  addUserMessage(text);
  const turn = document.createElement("div");
  turn.className = "msg assistant";
  messagesEl.append(turn);

  let textEl: HTMLElement | null = null;
  let thinkingEl: HTMLElement | null = null;
  const appendText = (delta: string) => {
    thinkingEl = null;
    if (!textEl) {
      textEl = document.createElement("div");
      textEl.className = "text";
      turn.append(textEl);
    }
    textEl.textContent += delta;
  };
  const appendThinking = (delta: string) => {
    if (!thinkingEl) {
      thinkingEl = document.createElement("div");
      thinkingEl.className = "thinking";
      turn.append(thinkingEl);
      textEl = null;
    }
    thinkingEl.textContent += delta;
    thinkingEl.scrollTop = thinkingEl.scrollHeight;
  };

  snapshot(); // a rodada inteira da IA pode ser desfeita com um Ctrl+Z
  state.abort = new AbortController();
  setBusy(true, "pensando…");
  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: state.sessionId, text, project: toJSON(state.project) }),
      signal: state.abort.signal,
    });
    if (!res.ok || !res.body) throw new Error(await res.text());
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += value;
      let i: number;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 2);
        if (!line.startsWith("data: ")) continue;
        const ev = JSON.parse(line.slice(6));
        switch (ev.type) {
          case "session":
            state.sessionId = ev.sessionId;
            break;
          case "text":
            appendText(ev.delta);
            $("status").textContent = "escrevendo…";
            break;
          case "thinking":
            appendThinking(ev.delta);
            $("status").textContent = "pensando…";
            break;
          case "tool": {
            textEl = null;
            thinkingEl = null;
            const d = document.createElement("details");
            d.className = `tool${ev.ok ? "" : " fail"}`;
            const s = document.createElement("summary");
            s.textContent = ev.name;
            const pre = document.createElement("pre");
            pre.textContent = `${JSON.stringify(ev.input, null, 1)}\n\n→ ${ev.result}`;
            d.append(s, pre);
            turn.append(d);
            $("status").textContent = `executando ${ev.name}…`;
            break;
          }
          case "project": {
            const prevLayers = state.project.layers.length;
            setProject(fromJSON(ev.project));
            if (state.project.layers.length !== prevLayers) state.layerId = state.project.layers[state.project.layers.length - 1].id;
            break;
          }
          case "effect":
            if (ev.effect.type === "export") doExport(ev.effect.format, ev.effect.scale, ev.effect.columns, ev.effect.filename);
            break;
          case "error": {
            const e = document.createElement("div");
            e.className = "error";
            e.textContent = ev.message;
            turn.append(e);
            break;
          }
        }
        scrollChat();
      }
    }
  } catch (err) {
    if ((err as Error).name !== "AbortError") {
      const e = document.createElement("div");
      e.className = "error";
      e.textContent = `Falha: ${(err as Error).message}`;
      turn.append(e);
    }
  } finally {
    // se a IA não mudou nada, descarta o snapshot
    if (state.undo[state.undo.length - 1] === JSON.stringify(toJSON(state.project))) state.undo.pop();
    state.abort = null;
    setBusy(false);
    if (state.project.frames.length > 1) play();
    scrollChat();
  }
}

// ---------------- ligações ----------------

$("chat-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = $<HTMLTextAreaElement>("chat-input");
  const text = input.value;
  input.value = "";
  void sendChat(text);
});
$<HTMLTextAreaElement>("chat-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    $<HTMLFormElement>("chat-form").requestSubmit();
  }
});
messagesEl.querySelectorAll(".suggestions button").forEach((b) =>
  b.addEventListener("click", () => void sendChat((b as HTMLButtonElement).textContent ?? "")),
);
$("btn-stop").onclick = () => state.abort?.abort();
$("btn-reset-chat").onclick = async () => {
  state.abort?.abort();
  if (state.sessionId) {
    await fetch("/api/reset", { method: "POST", body: JSON.stringify({ sessionId: state.sessionId }) }).catch(() => {});
  }
  state.sessionId = null;
  messagesEl.replaceChildren();
  const d = document.createElement("div");
  d.className = "welcome";
  d.innerHTML = `<p>Nova conversa. A IA continua vendo o projeto atual.</p>`;
  messagesEl.append(d);
};

document.querySelectorAll<HTMLButtonElement>("[data-tool]").forEach((b) => (b.onclick = () => setTool(b.dataset.tool as Tool)));
$("btn-play").onclick = () => (state.playing ? stop() : play());
$<HTMLInputElement>("opt-zoom").oninput = (e) => {
  state.zoom = Number((e.target as HTMLInputElement).value);
  renderStage();
};
$<HTMLInputElement>("opt-onion").onchange = (e) => {
  state.onion = (e.target as HTMLInputElement).checked;
  renderStage();
};
$<HTMLInputElement>("opt-grid").onchange = (e) => {
  state.grid = (e.target as HTMLInputElement).checked;
  renderStage();
};
$<HTMLInputElement>("fps").onchange = (e) => exec("set_canvas", { fps: Number((e.target as HTMLInputElement).value) || 8 });
$<HTMLInputElement>("project-name").onchange = (e) => exec("set_canvas", { name: (e.target as HTMLInputElement).value || "Sem título" });

$("btn-undo").onclick = () => restore(state.undo, state.redo);
$("btn-redo").onclick = () => restore(state.redo, state.undo);
$("btn-new").onclick = () => {
  const size = prompt("Tamanho do canvas (ex. 32x32):", "32x32");
  if (!size) return;
  const [w, h] = size.toLowerCase().split("x").map((n) => parseInt(n, 10));
  snapshot();
  state.frame = 0;
  setProject(createProject({ width: w || 32, height: h || w || 32 }));
};
$("btn-demo").onclick = () => {
  snapshot();
  const p = createProject();
  for (const c of SLIME_COMMANDS) runCommand(p, c.name, c.input);
  state.frame = 0;
  setProject(p);
  play();
};
$("btn-open").onclick = () => $("file-input").click();
$<HTMLInputElement>("file-input").onchange = async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  try {
    const p = fromJSON(JSON.parse(await file.text()));
    snapshot();
    state.frame = 0;
    setProject(p);
  } catch (err) {
    alert(`Não foi possível abrir: ${(err as Error).message}`);
  }
  (e.target as HTMLInputElement).value = "";
};
$("btn-gif").onclick = () => doExport("gif");
$("btn-png").onclick = () => doExport("spritesheet_png");
$("btn-json").onclick = () => doExport("json");

document.addEventListener("keydown", (e) => {
  const target = e.target as HTMLElement;
  if (target.tagName === "TEXTAREA" || target.tagName === "INPUT") return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
    e.preventDefault();
    if (state.busy) return;
    if (e.shiftKey) restore(state.redo, state.undo);
    else restore(state.undo, state.redo);
    return;
  }
  const keys: Record<string, Tool> = { b: "pencil", e: "eraser", g: "fill", i: "pick" };
  if (keys[e.key]) setTool(keys[e.key]);
  if (e.key === " ") {
    e.preventDefault();
    state.playing ? stop() : play();
  }
  if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
    stop();
    const n = state.project.frames.length;
    state.frame = (state.frame + (e.key === "ArrowRight" ? 1 : -1) + n) % n;
    renderTimeline();
    renderStage();
  }
});

renderAll();
updateUndoButtons();
fetch("/api/health")
  .then((r) => r.json())
  .then((h: { hasKey: boolean; model: string }) => {
    if (!h.hasKey) $("status").textContent = "⚠ servidor sem ANTHROPIC_API_KEY (veja o README)";
  })
  .catch(() => {});
